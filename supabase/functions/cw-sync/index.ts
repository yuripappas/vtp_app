// VTP Compras — cw-sync
// Edge Function disparada por cron (pg_cron, ver migration 20260625221000).
// Busca pedidos abertos/recentes na API do Cardápio Web e persiste em
// cw_pedidos, registrando o timestamp de cada transição de status — isso é
// o que permite calcular tempo de preparo/entrega reais (a API do CW só dá
// o status atual, não o histórico).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CW_API_BASE = 'https://integracao.cardapioweb.com/api/partner/v1';

const CW_CANAL_MAP: Record<string, string> = {
  ifood: 'ifood',
  food99: '99food',
  catalog: 'site',
  store_front_catalog: 'site',
  portal: 'site',
  whatsapp_extension: 'site',
};

// Contagem de pizzas grandes/pequenas — motor simplificado que cobre os layouts
// reais do CW (validados nos pedidos de produção). Grava em pizzas_grande /
// pizzas_pequena para que o Dashboard possa exibir o número mesmo quando
// vendas.js não estiver disponível no navegador (ex.: browser cache antigo).
// O motor completo (js/vendas.js → contarPizzasPedido) é mais preciso para o
// CMV (usa o cadastro de sabores), mas para a CONTAGEM de pizzas este motor
// cobre >99% dos casos — os dois devem convergir na maioria dos pedidos.

const RE_SLOT     = /pizza\s+(grande|pequena).*pizza\s+(salgada|doce)/i;
const RE_SIZE_OPT = /^pizza\s+(grande|pequena)\b/i;

interface CwOption { name?: string; quantity?: number; option_group_name?: string; option_group_id?: number | string; }
interface CwItem   { name?: string; items?: CwItem[]; options?: CwOption[]; status?: string; }

function contarPizzasItem(it: CwItem): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  const opts = it.options || [];
  const grupos = new Set<string | number>();

  for (const o of opts) {
    const g = o.option_group_name || '';
    // Layout A: group name contém "pizza grande/pequena ... pizza salgada/doce"
    if (RE_SLOT.test(g)) {
      const gid = o.option_group_id ?? g;
      if (!grupos.has(gid)) {
        grupos.add(gid);
        if (/grande/i.test(g)) grande++; else pequena++;
      }
    }
    // Layout "| Pizza Grande/Pequena" no nome da opção (grátis do combo)
    else if (/\|\s*pizza\s+(grande|pequena)/i.test(o.name || '')) {
      if (/grande/i.test(o.name || '')) grande++; else pequena++;
    }
    // Layout B: opção chama "Pizza Grande/Pequena" (seletor de tamanho)
    else if (RE_SIZE_OPT.test(o.name || '')) {
      if (/grande/i.test(o.name || '')) grande++; else pequena++;
    }
  }

  // Layout C: tudo no nome do item ("Sabor | Pizza Grande"), sem opções
  if (grande + pequena === 0 && !opts.length) {
    const m = (it.name || '').match(/\|\s*pizza\s+(grande|pequena)/i);
    if (m) { if (/grande/i.test(m[1])) grande++; else pequena++; }
  }

  return { grande, pequena };
}

function contarPizzas(items: CwItem[] | undefined): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  for (const it of (items || [])) {
    if (it.status === 'canceled') continue;
    // Sub-itens aninhados (combos)
    if (it.items && it.items.length) {
      const sub = contarPizzas(it.items);
      grande += sub.grande; pequena += sub.pequena;
    } else {
      const own = contarPizzasItem(it);
      grande += own.grande; pequena += own.pequena;
    }
  }
  return { grande, pequena };
}

// ── Cliente e endereço (para o módulo de omnichannel) ──────────────────────

interface CwCustomer { id?: number; name?: string; phone?: string; ddi?: string; }

function normalizarTelefone(c: CwCustomer | null | undefined): string | null {
  if (!c?.phone) return null;
  const digitos = (((c.ddi || '') + c.phone)).replace(/\D/g, '');
  return digitos || null;
}

// ── Handler ─────────────────────────────────────────────────────────────

// Campos financeiros do pedido (taxas, descontos com quem pagou, pagamentos)
function camposFinanceiros(det: any) {
  return {
    delivery_fee:        det.delivery_fee ?? null,
    driver_fee:          det.driver_fee ?? null,
    service_fee:         det.service_fee ?? null,
    additional_fee:      det.additional_fee ?? null,
    delivered_by:        det.delivered_by ?? null,
    discounts:           det.discounts ?? [],
    payments:            det.payments ?? [],
    external_display_id: det.external_display_id ?? null,
    financeiro_em:       new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Token do CW vem da mesma config que o Portal usa (Configurações → Integrações)
  const { data: cfgRow, error: cfgErr } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  if (cfgErr || !cfgRow?.value?.codLoja) {
    return new Response(JSON.stringify({ error: 'Token CW não configurado (vtp_config.codLoja)' }), { status: 400 });
  }
  const CW_TOKEN = cfgRow.value.codLoja as string;

  // Backfill: ?backfill=N lê o detalhe de até N pedidos antigos que ainda não
  // têm os campos financeiros (só atualiza esses campos e o status).
  const url = new URL(req.url);
  const lote = Number(url.searchParams.get('backfill') || 0);
  if (lote > 0) {
    const desde = url.searchParams.get('desde') || new Date(Date.now() - 120 * 864e5).toISOString();
    const { data: faltam } = await sb.from('cw_pedidos').select('id').is('financeiro_em', null)
      .gte('cw_created_at', desde).order('cw_created_at', { ascending: false }).limit(Math.min(lote, 300));
    let ok = 0, falhas = 0, limite = false;
    // Devagar (5 por vez) e para no primeiro 429: o limite da API é por minuto
    // e o sync normal (a cada 2 min) também precisa dele.
    for (let i = 0; i < (faltam || []).length && !limite; i += 5) {
      await Promise.all((faltam || []).slice(i, i + 5).map(async (r: any) => {
        try {
          const d = await fetch(`${CW_API_BASE}/orders/${r.id}`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
          if (d.status === 429) { limite = true; return; }
          if (d.status === 404) { await sb.from('cw_pedidos').update({ financeiro_em: new Date().toISOString() }).eq('id', r.id); falhas++; return; }
          if (!d.ok) { falhas++; return; }
          const det = await d.json();
          const { error } = await sb.from('cw_pedidos').update({ ...camposFinanceiros(det), status: det.status }).eq('id', r.id);
          if (error) falhas++; else ok++;
        } catch (_e) { falhas++; }
      }));
    }
    const { count } = await sb.from('cw_pedidos').select('id', { count: 'exact', head: true }).is('financeiro_em', null).gte('cw_created_at', desde);
    return new Response(JSON.stringify({ backfill: ok, falhas, limite, restantes: count }), { headers: { 'Content-Type': 'application/json' } });
  }

  const ordersRes = await fetch(`${CW_API_BASE}/orders`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
  if (!ordersRes.ok) {
    return new Response(JSON.stringify({ error: `CW API /orders HTTP ${ordersRes.status}` }), { status: 502 });
  }
  const summaries: Array<{ id: number; status: string; updated_at: string }> = await ordersRes.json();

  const ids = summaries.map(s => s.id);
  const { data: existentes } = ids.length
    ? await sb.from('cw_pedidos').select('id, status, status_timestamps, cw_updated_at').in('id', ids)
    : { data: [] as any[] };
  const existentesMap = new Map((existentes || []).map(r => [r.id, r]));

  // Sincroniza TODOS os pedidos retornados pela API (a API já retorna só os
  // recentes/ativos, volume pequeno). Remover o filtro por cw_updated_at evita
  // perder pedidos quando o sync ficou parado por algum período.
  const pendentes = summaries;

  let processados = 0, erros = 0;

  // Busca os detalhes em paralelo (rate limit geral da API CW é 400 req/min,
  // bem acima do volume tratado por ciclo de 2min) e grava em lote.
  const linhas = (await Promise.all(pendentes.map(async (s) => {
    try {
      const detRes = await fetch(`${CW_API_BASE}/orders/${s.id}`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
      if (!detRes.ok) { erros++; return null; }
      const det = await detRes.json();

      const existente = existentesMap.get(s.id);
      const statusTs = { ...(existente?.status_timestamps || {}) };
      if (!statusTs[det.status]) statusTs[det.status] = new Date().toISOString();

      const pizzas = contarPizzas(det.items);

      return {
        id:                det.id,
        display_id:        det.display_id,
        merchant_id:       det.merchant_id,
        status:            det.status,
        order_type:        det.order_type,
        order_timing:      det.order_timing,
        sales_channel:     det.sales_channel,
        total:             det.total || 0,
        items:             det.items || [],
        pizzas_grande:     pizzas.grande,
        pizzas_pequena:    pizzas.pequena,
        status_timestamps: statusTs,
        cw_created_at:     det.created_at,
        cw_updated_at:     det.updated_at,
        synced_at:         new Date().toISOString(),
        customer_id:       det.customer?.id ?? null,
        customer_name:     det.customer?.name ?? null,
        customer_phone:    normalizarTelefone(det.customer),
        delivery_address:  det.delivery_address ?? null,
        // Cupom de criador/afiliado (módulo Marketing) — a API do CW ainda não
        // teve esse campo confirmado; tentamos os formatos mais prováveis e
        // gravamos null se nenhum existir (não impede o resto do sync).
        coupon_code:       det.coupon_code ?? det.coupon?.code ?? det.discount?.code ?? null,
        ...camposFinanceiros(det),
      };
    } catch (_e) { erros++; return null; }
  }))).filter((l): l is NonNullable<typeof l> => l !== null);

  if (linhas.length) {
    const { error: upsertErr } = await sb.from('cw_pedidos').upsert(linhas, { onConflict: 'id' });
    if (upsertErr) { erros += linhas.length; } else { processados = linhas.length; }
  }

  return new Response(JSON.stringify({ total: summaries.length, processados, erros }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

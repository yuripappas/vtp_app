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

// Contagem de pizzas grandes/pequenas NÃO é feita aqui — a Edge Function só
// grava o payload bruto de `items` (ver `linhas` mais abaixo). A interpretação
// (tamanho, sabor, meio a meio, combos aninhados) é toda feita no navegador
// por js/vendas.js (_vInterpretarPedido/contarPizzasPedido), que é o único
// motor de classificação usado pelo app inteiro (Dashboard e CMV) — antes essa
// função duplicava essa lógica com uma regex mais simples e desatualizada, e
// os dois números divergiam (ex.: Dashboard contava 23 pizzas, CMV contava 40
// pro mesmo dia). Duplicar essa lógica em Deno exigiria replicar também o
// cadastro de sabores (vtp_sabores/opções), que só existe no navegador.

// ── Cliente e endereço (para o módulo de omnichannel) ──────────────────────

interface CwCustomer { id?: number; name?: string; phone?: string; ddi?: string; }

function normalizarTelefone(c: CwCustomer | null | undefined): string | null {
  if (!c?.phone) return null;
  const digitos = (((c.ddi || '') + c.phone)).replace(/\D/g, '');
  return digitos || null;
}

// ── Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Token do CW vem da mesma config que o Portal usa (Configurações → Integrações)
  const { data: cfgRow, error: cfgErr } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  if (cfgErr || !cfgRow?.value?.codLoja) {
    return new Response(JSON.stringify({ error: 'Token CW não configurado (vtp_config.codLoja)' }), { status: 400 });
  }
  const CW_TOKEN = cfgRow.value.codLoja as string;

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

  // Pedidos que de fato mudaram desde a última sincronização.
  const pendentes = summaries.filter(s => {
    const ex = existentesMap.get(s.id);
    return !ex || ex.cw_updated_at !== s.updated_at;
  });

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
        status_timestamps: statusTs,
        cw_created_at:     det.created_at,
        cw_updated_at:     det.updated_at,
        synced_at:         new Date().toISOString(),
        customer_id:       det.customer?.id ?? null,
        customer_name:     det.customer?.name ?? null,
        customer_phone:    normalizarTelefone(det.customer),
        delivery_address:  det.delivery_address ?? null,
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

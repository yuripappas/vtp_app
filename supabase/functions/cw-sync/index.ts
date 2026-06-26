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

// ── Contagem de pizzas (mesma lógica validada em js/cw-api.js) ────────────

const RE_GRUPO_GRANDE   = /^pizza grande\s*\(/i;
const RE_GRUPO_PEQUENA  = /^pizza pequena\s*\(/i;
const RE_SUFIXO_GRANDE  = /\|\s*pizza grande\b/i;
const RE_SUFIXO_PEQUENA = /\|\s*pizza pequena\b/i;

interface CwOption { name?: string; option_group_name?: string; option_group_id?: number; quantity?: number; }
interface CwItem {
  name?: string; quantity?: number; status?: string;
  options?: CwOption[]; items?: CwItem[];
}

function contarPizzasItem(it: CwItem): { grande: number; pequena: number } {
  const grupos: Record<string, { tipo: 'grande' | 'pequena'; dividir: boolean; qty: number }> = {};

  for (const op of (it.options || [])) {
    const gNome = op.option_group_name || '';
    const oNome = op.name || '';
    let tipo: 'grande' | 'pequena' | null = null;
    let dividir = false;

    if (RE_GRUPO_GRANDE.test(gNome))       { tipo = 'grande';  dividir = true;  }
    else if (RE_GRUPO_PEQUENA.test(gNome)) { tipo = 'pequena'; dividir = false; }
    else if (RE_SUFIXO_GRANDE.test(oNome) || RE_SUFIXO_GRANDE.test(gNome))   { tipo = 'grande';  dividir = false; }
    else if (RE_SUFIXO_PEQUENA.test(oNome) || RE_SUFIXO_PEQUENA.test(gNome)) { tipo = 'pequena'; dividir = false; }
    if (!tipo) continue;

    const chave = `${op.option_group_id ?? gNome}|${tipo}`;
    grupos[chave] = grupos[chave] || { tipo, dividir, qty: 0 };
    grupos[chave].qty += (op.quantity || 1);
  }

  let grande = 0, pequena = 0;
  for (const g of Object.values(grupos)) {
    const n = g.dividir ? g.qty / 2 : g.qty;
    if (g.tipo === 'grande') grande += n; else pequena += n;
  }

  if (!grande && !pequena && !(it.options || []).length) {
    if (RE_GRUPO_GRANDE.test(it.name || '') || RE_SUFIXO_GRANDE.test(it.name || ''))  grande = 1;
    else if (RE_GRUPO_PEQUENA.test(it.name || '') || RE_SUFIXO_PEQUENA.test(it.name || '')) pequena = 1;
  }

  return { grande, pequena };
}

function contarPizzas(items: CwItem[] | undefined): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  for (const it of (items || [])) {
    if (it.status === 'canceled') continue;
    const mult = it.quantity || 1;
    const own = contarPizzasItem(it);
    grande += own.grande * mult;
    pequena += own.pequena * mult;
    if (it.items && it.items.length) {
      const sub = contarPizzas(it.items);
      grande += sub.grande * mult;
      pequena += sub.pequena * mult;
    }
  }
  return { grande, pequena };
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
      const pz = contarPizzas(det.items);
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
        pizzas_grande:     pz.grande,
        pizzas_pequena:    pz.pequena,
        items:             det.items || [],
        status_timestamps: statusTs,
        cw_created_at:     det.created_at,
        cw_updated_at:     det.updated_at,
        synced_at:         new Date().toISOString(),
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

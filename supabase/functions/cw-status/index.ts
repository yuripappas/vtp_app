// VTP Compras — cw-status
// Muda o status de um pedido no Cardápio Web a pedido do KDS (o navegador não
// chama a API do CW direto: o token fica no servidor e a API não libera CORS).
//
// POST { order_id, acao } — acao é o sufixo do endpoint do CW:
//   start_preparation  agendado: scheduled_confirmed → confirmed
//   prepared           confirmed → ready (todas as pizzas finalizadas, Fase 2)
//   dispatch / delivered / finalize  (despacho, se um dia sair do CW)
// Depois da mudança, relê o pedido e grava em cw_pedidos, para os tablets
// verem o status novo sem esperar o webhook.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CW_API_BASE, montarLinha } from '../_shared/cw-pedido.ts';

const ACOES = new Set(['start_preparation', 'prepared', 'dispatch', 'delivered', 'finalize']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const { order_id, acao } = await req.json().catch(() => ({}));
  if (!order_id || !ACOES.has(acao)) return json({ ok: false, erro: 'order_id ou acao inválidos' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfgRow } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  const token = cfgRow?.value?.codLoja as string | undefined;
  if (!token) return json({ ok: false, erro: 'Token CW não configurado' }, 400);
  const headers = { 'X-API-KEY': token, 'Accept': 'application/json' };

  const res = await fetch(`${CW_API_BASE}/orders/${order_id}/${acao}`, { method: 'POST', headers });
  if (!res.ok) {
    const det = await res.json().catch(() => null);
    return json({ ok: false, http: res.status, erro: det?.details || det?.message || `HTTP ${res.status}` }, 200);
  }

  const detRes = await fetch(`${CW_API_BASE}/orders/${order_id}`, { headers });
  if (detRes.ok) {
    const det = await detRes.json();
    const { data: existente } = await sb.from('cw_pedidos').select('id, status, status_timestamps').eq('id', order_id).maybeSingle();
    await sb.from('cw_pedidos').upsert(montarLinha(det, existente), { onConflict: 'id' });
  }
  return json({ ok: true });
});

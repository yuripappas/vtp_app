// VTP Compras — cw-webhook
// Recebe os webhooks do Cardápio Web (ORDER_CREATED / ORDER_STATUS_UPDATED)
// e grava o pedido em cw_pedidos na hora — é o que faz o pedido aparecer no
// KDS em segundos, em vez de esperar o próximo cw-sync.
//
// Cadastro no Portal do CW: Configurações → Integrações → API → Webhooks,
// com esta URL e o token salvo no secret CW_WEBHOOK_TOKEN (vai no header
// X-Webhook-Token). O CW não manda JWT do Supabase — por isso verify_jwt =
// false no config.toml e a conferência do token é feita aqui.
//
// O CW exige HTTP 200 em até 5 s: responde já e busca o detalhe do pedido em
// segundo plano (EdgeRuntime.waitUntil). Reenvios do mesmo evento não
// duplicam nada — o upsert por id é idempotente.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CW_API_BASE, montarLinha } from '../_shared/cw-pedido.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

async function gravarPedido(orderId: number) {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfgRow } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  const token = cfgRow?.value?.codLoja as string | undefined;
  if (!token) { console.error('cw-webhook: token CW não configurado'); return; }

  const res = await fetch(`${CW_API_BASE}/orders/${orderId}`, { headers: { 'X-API-KEY': token, 'Accept': 'application/json' } });
  if (!res.ok) { console.error(`cw-webhook: GET /orders/${orderId} HTTP ${res.status}`); return; }
  const det = await res.json();

  const { data: existente } = await sb.from('cw_pedidos').select('id, status, status_timestamps').eq('id', orderId).maybeSingle();
  const { error } = await sb.from('cw_pedidos').upsert(montarLinha(det, existente), { onConflict: 'id' });
  if (error) console.error('cw-webhook: upsert', error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  const esperado = Deno.env.get('CW_WEBHOOK_TOKEN');
  if (esperado && req.headers.get('X-Webhook-Token') !== esperado) {
    return new Response('token inválido', { status: 401 });
  }

  let evento: { order_id?: number; event_type?: string; order_status?: string };
  try { evento = await req.json(); } catch { return new Response('json inválido', { status: 400 }); }
  if (!evento?.order_id) return new Response('ok'); // evento sem pedido: nada a fazer

  EdgeRuntime.waitUntil(gravarPedido(evento.order_id).catch(e => console.error('cw-webhook:', e)));
  return new Response('ok');
});

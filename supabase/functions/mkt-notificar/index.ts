// VTP Marketing — mkt-notificar
// Envia uma mensagem de texto livre via WhatsApp (Evolution API) pro telefone
// de um criador. Reaproveitada em qualquer ponto de mudança de status que
// valha a pena avisar automaticamente (conteúdo aprovado/reprovado, cadastro
// aprovado, pagamento confirmado) — mesma API usada por enviar-mensagem e
// mkt-otp-enviar, chamada direto (sem depender de atd_conversas/atd_contatos).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const EVO_URL      = Deno.env.get('EVOLUTION_API_URL')!;
  const EVO_KEY      = Deno.env.get('EVOLUTION_API_KEY')!;
  const EVO_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'vtp-main';
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const body = await req.json().catch(() => ({}));
  const telefone = String(body?.telefone || '').replace(/\D/g, '');
  const texto    = String(body?.texto || '').trim();
  if (!telefone || telefone.length < 10 || !texto) {
    return new Response(JSON.stringify({ error: 'telefone e texto são obrigatórios' }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    const evoRes = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: telefone, text: texto }),
    });
    if (!evoRes.ok) {
      const detalhe = await evoRes.text();
      // Falha de notificação não deve travar o fluxo da Gestão — loga e responde ok mesmo assim.
      console.error('[mkt-notificar] Evolution API erro', evoRes.status, detalhe);
      return new Response(JSON.stringify({ ok: false, error: `Evolution API HTTP ${evoRes.status}` }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    console.error('[mkt-notificar] erro de rede', e);
    return new Response(JSON.stringify({ ok: false, error: 'falha de rede ao enviar' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});

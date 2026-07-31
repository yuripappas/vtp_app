// VTP Marketing — mkt-otp-enviar
// Gera um código de acesso de 6 dígitos e envia via WhatsApp (Evolution API,
// chamada direta — sem passar por atd_conversas/atd_contatos, diferente de
// enviar-mensagem, porque aqui não existe uma conversa de atendimento por trás,
// só o telefone do criador) para login no portal (painel-criador.html).
//
// Responde sempre { ok: true }, exista ou não um criador ativo com esse telefone
// — não revela por essa resposta se um número está cadastrado (evita enumeração).

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
  if (!telefone || telefone.length < 10) {
    return new Response(JSON.stringify({ error: 'Telefone inválido' }), { status: 400, headers: CORS_HEADERS });
  }

  const { data: creator } = await sb.from('mkt_creators')
    .select('id, nome').eq('telefone', telefone).eq('status', 'ativo').maybeSingle();

  // Sempre responde ok — só efetivamente envia se existir criador ativo com esse telefone.
  if (creator) {
    // Evita spam: se já existe código não usado gerado nos últimos 60s, não gera outro.
    const { data: recente } = await sb.from('mkt_creator_otp_codes')
      .select('id, criado_em').eq('telefone', telefone).eq('usado', false)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();

    const recenteDemais = recente && (Date.now() - new Date(recente.criado_em).getTime()) < 60_000;

    if (!recenteDemais) {
      const codigo = String(Math.floor(100000 + Math.random() * 900000));
      const expira_em = new Date(Date.now() + 10 * 60_000).toISOString();

      await sb.from('mkt_creator_otp_codes').insert({ telefone, codigo, expira_em });

      const texto = `Seu código de acesso ao Painel de Criadores Vai Ter Pizza: *${codigo}*\nVálido por 10 minutos.`;
      try {
        await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
          body: JSON.stringify({ number: telefone, text: texto }),
        });
      } catch (_e) {
        // Falha no envio não deve vazar se o número existe — segue respondendo ok.
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});

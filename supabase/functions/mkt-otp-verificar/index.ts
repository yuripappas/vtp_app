// VTP Marketing — mkt-otp-verificar
// Valida o código de 6 dígitos enviado por mkt-otp-enviar e, se correto,
// abre uma sessão pro criador (token opaco salvo em mkt_creator_sessions,
// guardado no localStorage do navegador do criador — não é Supabase Auth,
// esse app não usa Auth real em lugar nenhum, ver 20260627000000_atendimento_schema.sql).

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
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const body = await req.json().catch(() => ({}));
  const telefone = String(body?.telefone || '').replace(/\D/g, '');
  const codigo   = String(body?.codigo || '').trim();
  if (!telefone || !codigo) {
    return new Response(JSON.stringify({ error: 'Telefone e código são obrigatórios' }), { status: 400, headers: CORS_HEADERS });
  }

  const { data: otp } = await sb.from('mkt_creator_otp_codes')
    .select('*').eq('telefone', telefone).eq('codigo', codigo).eq('usado', false)
    .gt('expira_em', new Date().toISOString())
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();

  if (!otp) {
    return new Response(JSON.stringify({ error: 'Código inválido ou expirado' }), { status: 401, headers: CORS_HEADERS });
  }

  const { data: creator } = await sb.from('mkt_creators')
    .select('id, nome, status').eq('telefone', telefone).eq('status', 'ativo').maybeSingle();

  if (!creator) {
    return new Response(JSON.stringify({ error: 'Criador não encontrado ou inativo' }), { status: 404, headers: CORS_HEADERS });
  }

  await sb.from('mkt_creator_otp_codes').update({ usado: true }).eq('id', otp.id);

  const token = crypto.randomUUID();
  const expira_em = new Date(Date.now() + 30 * 24 * 3600_000).toISOString(); // 30 dias
  const { error: sessErr } = await sb.from('mkt_creator_sessions').insert({ creator_id: creator.id, token, expira_em });
  if (sessErr) {
    return new Response(JSON.stringify({ error: 'Falha ao criar sessão' }), { status: 500, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ token, expira_em, creator: { id: creator.id, nome: creator.nome } }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

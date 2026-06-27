// VTP Atendimento — enviar-mensagem
// Recebe { conversa_id, texto, atendente_id } e envia via Evolution API
// (WhatsApp), salvando o registro em atd_mensagens.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface Body { conversa_id: string; texto: string; atendente_id?: number | null; visibilidade?: 'publica' | 'interna'; }

// Chamada direto do navegador (inbox) — precisa de CORS e tratar o preflight OPTIONS.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const EVO_URL         = Deno.env.get('EVOLUTION_API_URL')!;
  const EVO_KEY         = Deno.env.get('EVOLUTION_API_KEY')!;
  const EVO_INSTANCE    = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'vtp-main';
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const body: Body = await req.json();
  if (!body.conversa_id || !body.texto) {
    return new Response(JSON.stringify({ error: 'conversa_id e texto são obrigatórios' }), { status: 400, headers: CORS_HEADERS });
  }

  const visibilidade = body.visibilidade || 'publica';

  // Nota interna: nunca sai pelo WhatsApp, só fica registrada na conversa.
  if (visibilidade === 'interna') {
    const { error: notaErr } = await sb.from('atd_mensagens').insert({
      conversa_id:  body.conversa_id,
      origem:       'atendente',
      atendente_id: body.atendente_id ?? null,
      visibilidade: 'interna',
      tipo:         'texto',
      conteudo:     { texto: body.texto },
    });
    if (notaErr) return new Response(JSON.stringify({ error: 'falha ao salvar nota', detalhe: notaErr }), { status: 500, headers: CORS_HEADERS });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  // Busca telefone do contato vinculado à conversa
  const { data: conversa, error: convErr } = await sb
    .from('atd_conversas')
    .select('id, canal_tipo, atd_contatos(telefone)')
    .eq('id', body.conversa_id)
    .single();

  if (convErr || !conversa) {
    return new Response(JSON.stringify({ error: 'conversa não encontrada', detalhe: convErr }), { status: 404, headers: CORS_HEADERS });
  }

  const telefone = (conversa as unknown as { atd_contatos: { telefone: string } }).atd_contatos?.telefone;
  if (!telefone) {
    return new Response(JSON.stringify({ error: 'contato sem telefone vinculado' }), { status: 400, headers: CORS_HEADERS });
  }

  if (conversa.canal_tipo !== 'whatsapp') {
    return new Response(JSON.stringify({ error: `envio para canal '${conversa.canal_tipo}' ainda não implementado` }), { status: 400, headers: CORS_HEADERS });
  }

  // Envia via Evolution API
  const evoRes = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: telefone, text: body.texto }),
  });

  if (!evoRes.ok) {
    const detalhe = await evoRes.text();
    return new Response(JSON.stringify({ error: `Evolution API HTTP ${evoRes.status}`, detalhe }), { status: 502, headers: CORS_HEADERS });
  }
  const evoData = await evoRes.json();
  const externalId = evoData?.key?.id ?? null;

  const { error: msgErr } = await sb.from('atd_mensagens').insert({
    conversa_id:      body.conversa_id,
    origem:           'atendente',
    atendente_id:     body.atendente_id ?? null,
    visibilidade:     'publica',
    tipo:             'texto',
    conteudo:         { texto: body.texto },
    conteudo_enviado: body.texto,
    external_id:      externalId,
  });
  if (msgErr) {
    return new Response(JSON.stringify({ error: 'mensagem enviada mas falhou ao salvar', detalhe: msgErr }), { status: 500, headers: CORS_HEADERS });
  }

  await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', body.conversa_id);

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});

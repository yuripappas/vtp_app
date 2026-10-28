// VTP Atendimento — enviar-mensagem
// Recebe { conversa_id, texto?, atendente_id, tipo?, url?, nome_arquivo? } e envia via Evolution API
// (WhatsApp), salvando o registro em atd_mensagens.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type MsgTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
interface Body {
  conversa_id: string;
  texto?: string;
  atendente_id?: string | null;
  visibilidade?: 'publica' | 'interna';
  tipo?: MsgTipo;
  url?: string;
  nome_arquivo?: string;
}

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
  const tipo = body.tipo || 'texto';
  if (!body.conversa_id || (!body.texto && !body.url)) {
    return new Response(JSON.stringify({ error: 'conversa_id e (texto ou url) são obrigatórios' }), { status: 400, headers: CORS_HEADERS });
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

  // Busca contato vinculado à conversa
  const { data: conversa, error: convErr } = await sb
    .from('atd_conversas')
    .select('id, canal_tipo, atd_contatos(telefone, instagram_id)')
    .eq('id', body.conversa_id)
    .single();

  if (convErr || !conversa) {
    return new Response(JSON.stringify({ error: 'conversa não encontrada', detalhe: convErr }), { status: 404, headers: CORS_HEADERS });
  }

  const contato = (conversa as unknown as { atd_contatos: { telefone: string; instagram_id: string } }).atd_contatos;

  let externalId: string | null = null;

  if (conversa.canal_tipo === 'whatsapp') {
    const telefone = contato?.telefone;
    if (!telefone) {
      return new Response(JSON.stringify({ error: 'contato sem telefone vinculado' }), { status: 400, headers: CORS_HEADERS });
    }

    const WA_PHONE_ID = Deno.env.get('WA_PHONE_NUMBER_ID')!;
    const WA_TOKEN    = Deno.env.get('WA_ACCESS_TOKEN')!;
    const waUrl = `https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`;
    const waHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` };

    // Número destino: garante DDI 55 se for número BR sem DDI
    const digits = telefone.replace(/\D/g, '');
    const numero = digits.startsWith('55') ? digits : `55${digits}`;

    let waBody: Record<string, unknown>;

    if (tipo !== 'texto' && body.url) {
      const mediaTypeMap: Record<string, string> = { imagem: 'image', audio: 'audio', video: 'video', documento: 'document' };
      const waType = mediaTypeMap[tipo] || 'image';
      const mediaPayload: Record<string, unknown> = { link: body.url };
      if (body.texto) mediaPayload.caption = body.texto;
      if (tipo === 'documento' && body.nome_arquivo) mediaPayload.filename = body.nome_arquivo;
      waBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numero,
        type: waType,
        [waType]: mediaPayload,
      };
    } else {
      waBody = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numero,
        type: 'text',
        text: { preview_url: false, body: body.texto },
      };
    }

    const waRes = await fetch(waUrl, { method: 'POST', headers: waHeaders, body: JSON.stringify(waBody) });

    if (!waRes.ok) {
      const detalhe = await waRes.text();
      return new Response(JSON.stringify({ error: `Meta WABA HTTP ${waRes.status}`, detalhe }), { status: 502, headers: CORS_HEADERS });
    }

    if (tipo !== 'texto' && body.url) {
      const waData = await waRes.json();
      externalId = waData?.messages?.[0]?.id ?? null;
      await sb.from('atd_mensagens').insert({
        conversa_id:  body.conversa_id,
        origem:       'atendente',
        atendente_id: body.atendente_id ?? null,
        visibilidade: 'publica',
        tipo,
        conteudo:     { url: body.url, texto: body.texto || '', nome: body.nome_arquivo || '' },
        external_id:  externalId,
      });
      const { data: convMidia } = await sb.from('atd_conversas').select('status').eq('id', body.conversa_id).single();
      const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      if (body.atendente_id) upd.atendente_id = body.atendente_id;
      if (convMidia?.status === 'concluida' || convMidia?.status === 'expirada') {
        upd.status = 'em_atendimento';
        upd.concluida_em = null;
        upd.concluida_por_id = null;
      }
      await sb.from('atd_conversas').update(upd).eq('id', body.conversa_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const waData = await waRes.json();
    externalId = waData?.messages?.[0]?.id ?? null;
  } else if (conversa.canal_tipo === 'instagram') {
    const igsid = contato?.instagram_id;
    if (!igsid) {
      return new Response(JSON.stringify({ error: 'contato sem instagram_id vinculado' }), { status: 400, headers: CORS_HEADERS });
    }

    // Token vive em atd_tokens_oauth (renovado automaticamente por ig-token-refresh,
    // via pg_cron) — o secret INSTAGRAM_USER_ACCESS_TOKEN fica só como fallback.
    const { data: igTokenRow } = await sb.from('atd_tokens_oauth').select('access_token').eq('provider', 'instagram').maybeSingle();
    const IG_USER_TOKEN = igTokenRow?.access_token ?? Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN');
    if (!IG_USER_TOKEN) {
      return new Response(JSON.stringify({ error: 'INSTAGRAM_USER_ACCESS_TOKEN não configurado' }), { status: 500, headers: CORS_HEADERS });
    }

    // Fluxo "Instagram API with Instagram Login" — usa graph.instagram.com,
    // não graph.facebook.com (esse último é só pro fluxo Page-linked/Facebook Login).
    const igRes = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${IG_USER_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: igsid }, message: { text: body.texto } }),
    });

    if (!igRes.ok) {
      const detalhe = await igRes.text();
      return new Response(JSON.stringify({ error: `Instagram Graph API HTTP ${igRes.status}`, detalhe }), { status: 502, headers: CORS_HEADERS });
    }
    const igData = await igRes.json();
    externalId = igData?.message_id ?? null;
  } else {
    return new Response(JSON.stringify({ error: `envio para canal '${conversa.canal_tipo}' ainda não implementado` }), { status: 400, headers: CORS_HEADERS });
  }

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

  // Atualiza conversa: timestamp + reabre se estava concluída + registra atendente
  const { data: convAtual } = await sb.from('atd_conversas').select('status').eq('id', body.conversa_id).single();
  const updateData: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (body.atendente_id) updateData.atendente_id = body.atendente_id;
  if (convAtual?.status === 'concluida' || convAtual?.status === 'expirada') {
    updateData.status = 'em_atendimento';
    updateData.concluida_em = null;
    updateData.concluida_por_id = null;
  }
  await sb.from('atd_conversas').update(updateData).eq('id', body.conversa_id);

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});

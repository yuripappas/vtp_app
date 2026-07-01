// VTP Atendimento — webhook-whatsapp
// Recebe eventos da Evolution API (messages.upsert) e persiste em atd_*.
// Idempotente: dedupe por external_id (índice único em atd_mensagens).

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface EvoLocation { degreesLatitude?: number; degreesLongitude?: number; }
interface EvoImage { url?: string; caption?: string; }
interface EvoAudio { url?: string; seconds?: number; }
interface EvoMessage {
  conversation?: string;
  imageMessage?: EvoImage;
  audioMessage?: EvoAudio;
  videoMessage?: EvoImage;
  documentMessage?: EvoImage;
  locationMessage?: EvoLocation;
  stickerMessage?: EvoImage;
}
interface EvoPayload {
  event: string;
  instance: string;
  data: {
    key: { remoteJid: string; id: string; fromMe?: boolean };
    message: EvoMessage;
    messageType: string;
    pushName?: string;
    messageTimestamp: number;
  };
}

function normalizarJid(remoteJid: string): string | null {
  const digitos = remoteJid.split('@')[0].replace(/\D/g, '');
  return digitos || null;
}

function mapearConteudo(msg: EvoMessage, tipo: string): Record<string, unknown> {
  switch (tipo) {
    case 'imagem':      return { url: msg.imageMessage?.url, texto: msg.imageMessage?.caption || '' };
    case 'audio':        return { url: msg.audioMessage?.url, duracao: msg.audioMessage?.seconds };
    case 'video':        return { url: msg.videoMessage?.url, texto: msg.videoMessage?.caption || '' };
    case 'documento':    return { url: msg.documentMessage?.url };
    case 'localizacao':  return { latitude: msg.locationMessage?.degreesLatitude, longitude: msg.locationMessage?.degreesLongitude };
    case 'sticker':      return { url: msg.stickerMessage?.url };
    default:              return { texto: msg.conversation || '' };
  }
}

function detectarTipo(msg: EvoMessage, messageType: string): string {
  if (msg.locationMessage) return 'localizacao';
  if (msg.imageMessage)    return 'imagem';
  if (msg.audioMessage)    return 'audio';
  if (msg.videoMessage)    return 'video';
  if (msg.documentMessage) return 'documento';
  if (msg.stickerMessage)  return 'sticker';
  if (messageType === 'conversation') return 'texto';
  return 'texto';
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const payload: EvoPayload = await req.json();

  // Só processa mensagem nova recebida do cliente (ignora eco de msg enviada por nós)
  if (payload.event !== 'messages.upsert' || payload.data?.key?.fromMe) {
    return new Response(JSON.stringify({ ignorado: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const telefone = normalizarJid(payload.data.key.remoteJid);
  if (!telefone) {
    return new Response(JSON.stringify({ error: 'remoteJid inválido' }), { status: 400 });
  }

  // 1. Upsert contato
  const { data: contato, error: contatoErr } = await sb
    .from('atd_contatos')
    .upsert(
      { telefone, nome: payload.data.pushName || null, canal_origem: 'whatsapp' },
      { onConflict: 'telefone', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (contatoErr || !contato) {
    return new Response(JSON.stringify({ error: 'falha ao salvar contato', detalhe: contatoErr }), { status: 500 });
  }

  // 2. Busca canal whatsapp
  const { data: canal } = await sb.from('atd_canais').select('id').eq('tipo', 'whatsapp').eq('ativo', true).limit(1).single();

  // 3. Busca conversa aberta existente ou cria nova
  const { data: conversaExistente } = await sb
    .from('atd_conversas')
    .select('id')
    .eq('contato_id', contato.id)
    .eq('canal_tipo', 'whatsapp')
    .in('status', ['aberta', 'em_atendimento', 'aguardando_cliente'])
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversaId = conversaExistente?.id;
  if (!conversaId) {
    const { data: novaConversa, error: convErr } = await sb
      .from('atd_conversas')
      .insert({ contato_id: contato.id, canal_id: canal?.id ?? null, canal_tipo: 'whatsapp', status: 'aberta' })
      .select('id')
      .single();
    if (convErr || !novaConversa) {
      return new Response(JSON.stringify({ error: 'falha ao criar conversa', detalhe: convErr }), { status: 500 });
    }
    conversaId = novaConversa.id;
  }

  // 4. Insere mensagem (dedupe por external_id via upsert)
  const tipo = detectarTipo(payload.data.message, payload.data.messageType);
  const { error: msgErr } = await sb.from('atd_mensagens').upsert({
    conversa_id:  conversaId,
    origem:       'cliente',
    visibilidade: 'publica',
    tipo,
    conteudo:     mapearConteudo(payload.data.message, tipo),
    external_id:  payload.data.key.id,
    enviado_em:   new Date(payload.data.messageTimestamp * 1000).toISOString(),
  }, { onConflict: 'external_id', ignoreDuplicates: true });

  if (msgErr) {
    return new Response(JSON.stringify({ error: 'falha ao salvar mensagem', detalhe: msgErr }), { status: 500 });
  }

  await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId);

  return new Response(JSON.stringify({ ok: true, conversa_id: conversaId }), { headers: { 'Content-Type': 'application/json' } });
});

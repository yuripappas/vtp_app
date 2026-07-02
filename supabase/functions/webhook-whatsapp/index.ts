// VTP Atendimento — webhook-whatsapp
// Recebe eventos da Evolution API (messages.upsert) e persiste em atd_*.
// Com WEBHOOK_BASE64=true na Evolution API, o payload já traz o base64 da mídia.
// O base64 é salvo no Supabase Storage (bucket "atd-midias") como URL permanente.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface EvoLocation { degreesLatitude?: number; degreesLongitude?: number; }
interface EvoMedia   { url?: string; caption?: string; seconds?: number; fileName?: string; mimetype?: string; base64?: string; }
interface EvoMessage {
  conversation?: string;
  imageMessage?:    EvoMedia;
  audioMessage?:    EvoMedia;
  videoMessage?:    EvoMedia;
  documentMessage?: EvoMedia;
  locationMessage?: EvoLocation;
  stickerMessage?:  EvoMedia;
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

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function normalizarJid(remoteJid: string): string | null {
  const digitos = remoteJid.split('@')[0].replace(/\D/g, '');
  return digitos || null;
}

function detectarTipo(msg: EvoMessage, messageType: string): string {
  if (msg.locationMessage)  return 'localizacao';
  if (msg.imageMessage)     return 'imagem';
  if (msg.audioMessage)     return 'audio';
  if (msg.videoMessage)     return 'video';
  if (msg.documentMessage)  return 'documento';
  if (msg.stickerMessage)   return 'sticker';
  if (messageType === 'conversation') return 'texto';
  return 'texto';
}

function getMidia(msg: EvoMessage, tipo: string): EvoMedia | null {
  switch (tipo) {
    case 'imagem':    return msg.imageMessage    ?? null;
    case 'audio':     return msg.audioMessage    ?? null;
    case 'video':     return msg.videoMessage    ?? null;
    case 'documento': return msg.documentMessage ?? null;
    case 'sticker':   return msg.stickerMessage  ?? null;
    default:          return null;
  }
}

// Salva base64 no Supabase Storage e retorna URL pública permanente.
async function salvarBase64(
  sb: ReturnType<typeof createClient>,
  tipo: string,
  externalId: string,
  base64: string,
  mimetype: string,
  fileName?: string,
): Promise<string | null> {
  try {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const mimeBase = mimetype.split(';')[0].trim();
    const ext = MIME_TO_EXT[mimeBase] || fileName?.split('.').pop() || 'bin';
    const path = `${tipo}/${externalId}.${ext}`;

    const { error } = await sb.storage
      .from('atd-midias')
      .upload(path, bytes.buffer, { contentType: mimeBase, upsert: true });

    if (error) {
      console.warn('[webhook-wpp] erro ao salvar storage:', error.message);
      return null;
    }

    const { data } = sb.storage.from('atd-midias').getPublicUrl(path);
    console.log('[webhook-wpp] mídia salva:', data.publicUrl);
    return data.publicUrl;
  } catch (e) {
    console.warn('[webhook-wpp] erro ao processar base64:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const payload: EvoPayload = await req.json();

  if (payload.event !== 'messages.upsert' || payload.data?.key?.fromMe) {
    return new Response(JSON.stringify({ ignorado: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // LOG TEMPORÁRIO: inspeciona estrutura do payload de mídia
  const msgType = payload.data?.messageType;
  if (msgType && msgType !== 'conversation' && msgType !== 'extendedTextMessage') {
    const dataKeys = Object.keys(payload.data || {});
    const msgKeys = Object.keys(payload.data?.message || {});
    const mediaObj = (payload.data?.message as Record<string, unknown>)?.[Object.keys(payload.data?.message || {}).find(k => k.endsWith('Message')) || ''] as Record<string, unknown> | undefined;
    const mediaKeys = Object.keys(mediaObj || {});
    console.log('[webhook-wpp] PAYLOAD KEYS data:', JSON.stringify(dataKeys));
    console.log('[webhook-wpp] PAYLOAD KEYS message:', JSON.stringify(msgKeys));
    console.log('[webhook-wpp] PAYLOAD KEYS mediaObj:', JSON.stringify(mediaKeys));
    console.log('[webhook-wpp] tem base64 em data?', 'base64' in (payload.data as Record<string, unknown>));
    console.log('[webhook-wpp] tem base64 em mediaObj?', mediaObj && 'base64' in mediaObj);
    if (mediaObj?.base64) console.log('[webhook-wpp] base64 length:', String(mediaObj.base64).length);
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

  // 3. Busca conversa aberta ou cria nova
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

  // 4. Monta conteúdo
  const tipo = detectarTipo(payload.data.message, payload.data.messageType);
  const externalId = payload.data.key.id;
  let conteudo: Record<string, unknown>;

  if (tipo === 'localizacao') {
    conteudo = {
      latitude:  payload.data.message.locationMessage?.degreesLatitude,
      longitude: payload.data.message.locationMessage?.degreesLongitude,
    };
  } else if (tipo === 'texto') {
    conteudo = { texto: payload.data.message.conversation || '' };
  } else {
    const midia = getMidia(payload.data.message, tipo)!;
    const base64 = midia.base64;
    const mimetype = midia.mimetype || 'application/octet-stream';

    console.log('[webhook-wpp] tipo:', tipo, 'tem base64:', !!base64, 'mimetype:', mimetype);

    let urlFinal: string | null = null;
    if (base64) {
      urlFinal = await salvarBase64(sb, tipo, externalId, base64, mimetype, midia.fileName);
    }

    // Fallback para URL original se não tiver base64 (não deve acontecer com WEBHOOK_BASE64=true)
    if (!urlFinal) urlFinal = midia.url ?? null;

    if (tipo === 'audio') {
      conteudo = { url: urlFinal, duracao: midia.seconds };
    } else if (tipo === 'documento') {
      conteudo = { url: urlFinal, nome: midia.fileName || 'documento', texto: '' };
    } else {
      conteudo = { url: urlFinal, texto: midia.caption || '' };
    }
  }

  // 5. Insere mensagem (dedupe por external_id)
  const { error: msgErr } = await sb.from('atd_mensagens').upsert({
    conversa_id:  conversaId,
    origem:       'cliente',
    visibilidade: 'publica',
    tipo,
    conteudo,
    external_id:  externalId,
    enviado_em:   new Date(payload.data.messageTimestamp * 1000).toISOString(),
  }, { onConflict: 'external_id', ignoreDuplicates: true });

  if (msgErr) {
    return new Response(JSON.stringify({ error: 'falha ao salvar mensagem', detalhe: msgErr }), { status: 500 });
  }

  await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId);

  return new Response(JSON.stringify({ ok: true, conversa_id: conversaId }), { headers: { 'Content-Type': 'application/json' } });
});

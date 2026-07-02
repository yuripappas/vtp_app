// VTP Atendimento — webhook-whatsapp
// Recebe eventos da Evolution API (messages.upsert) e persiste em atd_*.
// Mídias (imagem/áudio/vídeo/documento/sticker) são baixadas e salvas no
// Supabase Storage (bucket "atd-midias") para evitar URLs expiradas do WhatsApp.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface EvoLocation { degreesLatitude?: number; degreesLongitude?: number; }
interface EvoMedia   { url?: string; caption?: string; seconds?: number; fileName?: string; mimetype?: string; }
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

function getMidiaInfo(msg: EvoMessage, tipo: string): { url?: string; mimetype?: string; fileName?: string; caption?: string } | null {
  switch (tipo) {
    case 'imagem':    return { url: msg.imageMessage?.url,    mimetype: msg.imageMessage?.mimetype,    caption: msg.imageMessage?.caption };
    case 'audio':     return { url: msg.audioMessage?.url,    mimetype: msg.audioMessage?.mimetype };
    case 'video':     return { url: msg.videoMessage?.url,    mimetype: msg.videoMessage?.mimetype,    caption: msg.videoMessage?.caption };
    case 'documento': return { url: msg.documentMessage?.url, mimetype: msg.documentMessage?.mimetype, fileName: msg.documentMessage?.fileName };
    case 'sticker':   return { url: msg.stickerMessage?.url,  mimetype: msg.stickerMessage?.mimetype };
    default:          return null;
  }
}

// Baixa mídia do WhatsApp e faz upload para Supabase Storage.
// Retorna a URL pública permanente ou null se falhar.
async function salvarMidiaStorage(
  sb: ReturnType<typeof createClient>,
  supabaseUrl: string,
  tipo: string,
  externalId: string,
  midiaInfo: { url?: string; mimetype?: string; fileName?: string }
): Promise<string | null> {
  if (!midiaInfo.url) return null;

  try {
    const res = await fetch(midiaInfo.url);
    if (!res.ok) {
      console.warn('[webhook-wpp] falha ao baixar mídia:', res.status, midiaInfo.url);
      return null;
    }

    const contentType = res.headers.get('content-type') || midiaInfo.mimetype || 'application/octet-stream';
    const mimeBase = contentType.split(';')[0].trim();
    const ext = MIME_TO_EXT[mimeBase] || midiaInfo.fileName?.split('.').pop() || 'bin';
    const path = `${tipo}/${externalId}.${ext}`;
    const buffer = await res.arrayBuffer();

    const { error: upErr } = await sb.storage
      .from('atd-midias')
      .upload(path, buffer, { contentType: mimeBase, upsert: true });

    if (upErr) {
      console.warn('[webhook-wpp] falha ao salvar storage:', upErr.message);
      return null;
    }

    const { data: pub } = sb.storage.from('atd-midias').getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.warn('[webhook-wpp] erro ao processar mídia:', e);
    return null;
  }
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

  // 4. Detecta tipo e monta conteúdo
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
    // Mídia: baixa e salva no Storage
    const midiaInfo = getMidiaInfo(payload.data.message, tipo)!;
    const urlStorage = await salvarMidiaStorage(sb, SUPABASE_URL, tipo, externalId, midiaInfo);

    if (tipo === 'audio') {
      conteudo = {
        url:     urlStorage || midiaInfo.url,
        duracao: payload.data.message.audioMessage?.seconds,
      };
    } else if (tipo === 'documento') {
      conteudo = {
        url:  urlStorage || midiaInfo.url,
        nome: midiaInfo.fileName || 'documento',
        texto: '',
      };
    } else {
      conteudo = {
        url:   urlStorage || midiaInfo.url,
        texto: midiaInfo.caption || '',
      };
    }
  }

  // 5. Insere mensagem (dedupe por external_id via upsert)
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

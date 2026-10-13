// VTP Atendimento — webhook-whatsapp (Meta WABA)
// Recebe eventos da Meta WhatsApp Business Platform e persiste em atd_*.
// Também responde ao desafio de verificação de webhook da Meta (GET).
//
// Env vars necessárias no Supabase:
//   WA_PHONE_NUMBER_ID   — ID do número no Meta Business Manager
//   WA_ACCESS_TOKEN      — System User token (permanente, sem expiração)
//   WA_VERIFY_TOKEN      — Token arbitrário configurado no painel Meta

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  statuses?: Array<{ id: string; status: string; recipient_id: string }>;
}

interface MetaPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: MetaMessage[];
        statuses?: Array<{ id: string; status: string; recipient_id: string; timestamp: string }>;
      };
      field: string;
    }>;
  }>;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

// Baixa mídia da Meta Graph API e salva no Supabase Storage.
// A Meta exige Bearer token para baixar a URL da mídia.
async function baixarESalvarMidia(
  sb: ReturnType<typeof createClient>,
  mediaId: string,
  tipo: string,
  externalId: string,
  waToken: string,
): Promise<{ url: string | null; mimeType: string; fileName?: string }> {
  try {
    // 1. Busca a URL de download
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${waToken}` },
    });
    if (!metaRes.ok) {
      console.warn('[webhook-wpp] erro ao buscar URL da mídia:', await metaRes.text());
      return { url: null, mimeType: 'application/octet-stream' };
    }
    const meta = await metaRes.json();
    const downloadUrl: string = meta.url;
    const mimeType: string = meta.mime_type || 'application/octet-stream';

    // 2. Baixa o arquivo com Bearer token
    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${waToken}` },
    });
    if (!fileRes.ok) {
      console.warn('[webhook-wpp] erro ao baixar mídia:', fileRes.status);
      return { url: null, mimeType };
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    // 3. Salva no Supabase Storage
    const mimeBase = mimeType.split(';')[0].trim();
    const ext = MIME_TO_EXT[mimeBase] || 'bin';
    const path = `${tipo}/${externalId}.${ext}`;

    const { error } = await sb.storage
      .from('atd-midias')
      .upload(path, bytes.buffer, { contentType: mimeBase, upsert: true });

    if (error) {
      console.warn('[webhook-wpp] erro ao salvar storage:', error.message);
      return { url: null, mimeType };
    }

    const { data } = sb.storage.from('atd-midias').getPublicUrl(path);
    return { url: data.publicUrl, mimeType };
  } catch (e) {
    console.warn('[webhook-wpp] exceção ao processar mídia:', e);
    return { url: null, mimeType: 'application/octet-stream' };
  }
}

Deno.serve(async (req) => {
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const WA_TOKEN      = Deno.env.get('WA_ACCESS_TOKEN') ?? '';
  const VERIFY_TOKEN  = Deno.env.get('WA_VERIFY_TOKEN') ?? '';

  // ── Verificação de webhook (GET) ─────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const payload: MetaPayload = await req.json();

  if (payload.object !== 'whatsapp_business_account') {
    return new Response(JSON.stringify({ ignorado: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const val = change.value;

      // ── Status updates (delivered / read) ─────────────────────────────
      for (const st of val.statuses ?? []) {
        let status: string | null = null;
        if (st.status === 'delivered') status = 'delivered';
        if (st.status === 'read')      status = 'read';
        if (!status) continue;
        await sb.from('atd_mensagens').update({ status }).eq('external_id', st.id);
      }

      // ── Mensagens recebidas ────────────────────────────────────────────
      for (const msg of val.messages ?? []) {
        const telefone = msg.from.replace(/\D/g, '');
        if (!telefone) continue;

        const nomeContato = val.contacts?.find(c => c.wa_id === msg.from)?.profile?.name ?? null;

        // 1. Upsert contato
        const { data: contato, error: contatoErr } = await sb
          .from('atd_contatos')
          .upsert(
            { telefone, nome: nomeContato, canal_origem: 'whatsapp' },
            { onConflict: 'telefone', ignoreDuplicates: false }
          )
          .select('id')
          .single();
        if (contatoErr || !contato) {
          console.error('[webhook-wpp] falha contato:', contatoErr);
          continue;
        }

        // 2. Canal whatsapp
        const { data: canal } = await sb.from('atd_canais').select('id').eq('tipo', 'whatsapp').eq('ativo', true).limit(1).single();

        // 3. Obtém ou cria conversa
        const { data: conversaId, error: convErr } = await sb.rpc('atd_obter_ou_criar_conversa', {
          p_contato_id: contato.id,
          p_canal_id:   canal?.id ?? null,
          p_canal_tipo: 'whatsapp',
        });
        if (convErr || !conversaId) {
          console.error('[webhook-wpp] falha conversa:', convErr);
          continue;
        }

        // 4. Monta conteúdo por tipo
        let tipo: string;
        let conteudo: Record<string, unknown>;

        if (msg.type === 'text') {
          tipo = 'texto';
          conteudo = { texto: msg.text?.body || '' };
        } else if (msg.type === 'location') {
          tipo = 'localizacao';
          conteudo = {
            latitude:  msg.location?.latitude,
            longitude: msg.location?.longitude,
            nome:      msg.location?.name || null,
            endereco:  msg.location?.address || null,
          };
        } else if (msg.type === 'reaction') {
          // Reações não são mensagens visuais — ignorar silenciosamente
          continue;
        } else if (msg.type === 'image' && msg.image) {
          tipo = 'imagem';
          const { url } = await baixarESalvarMidia(sb, msg.image.id, 'imagem', msg.id, WA_TOKEN);
          conteudo = { url, texto: msg.image.caption || '' };
        } else if (msg.type === 'audio' && msg.audio) {
          tipo = 'audio';
          const { url } = await baixarESalvarMidia(sb, msg.audio.id, 'audio', msg.id, WA_TOKEN);
          conteudo = { url };
        } else if (msg.type === 'video' && msg.video) {
          tipo = 'video';
          const { url } = await baixarESalvarMidia(sb, msg.video.id, 'video', msg.id, WA_TOKEN);
          conteudo = { url, texto: msg.video.caption || '' };
        } else if (msg.type === 'document' && msg.document) {
          tipo = 'documento';
          const { url } = await baixarESalvarMidia(sb, msg.document.id, 'documento', msg.id, WA_TOKEN);
          conteudo = { url, nome: msg.document.filename || 'documento', texto: msg.document.caption || '' };
        } else if (msg.type === 'sticker' && msg.sticker) {
          tipo = 'sticker';
          const { url } = await baixarESalvarMidia(sb, msg.sticker.id, 'sticker', msg.id, WA_TOKEN);
          conteudo = { url };
        } else {
          tipo = 'texto';
          conteudo = { texto: `[mensagem do tipo ${msg.type}]` };
        }

        // 5. Insere mensagem
        const { error: msgErr } = await sb.from('atd_mensagens').upsert({
          conversa_id:  conversaId,
          origem:       'cliente',
          visibilidade: 'publica',
          tipo,
          conteudo,
          external_id:  msg.id,
          enviado_em:   new Date(Number(msg.timestamp) * 1000).toISOString(),
        }, { onConflict: 'external_id', ignoreDuplicates: true });

        if (msgErr) {
          console.error('[webhook-wpp] falha ao salvar mensagem:', msgErr);
          continue;
        }

        await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId);
      }
    }
  }

  // Meta exige 200 OK em até 20s — sempre responder ok
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});

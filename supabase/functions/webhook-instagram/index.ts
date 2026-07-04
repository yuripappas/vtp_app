// VTP Atendimento — webhook-instagram
// Recebe eventos da Instagram Messaging API (Meta).
// Suporta: DMs texto, mídia (imagem/vídeo/áudio/sticker), story replies, story mentions.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Tipos do payload Meta ──────────────────────────────────────────────────
interface IgStory      { id?: string; url?: string; }
interface IgAttachment { type?: string; payload?: { url?: string; sticker_id?: string; }; }
interface IgMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  is_unsupported?: boolean;
  reply_to?: { story?: IgStory; mid?: string };
  attachments?: IgAttachment[];
}
interface IgChangeValue {
  sender?:    { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?:   IgMessage;
  // Mention event
  media_id?:  string;
  comment_id?: string;
}
interface IgChange  { field?: string; value?: IgChangeValue; }
interface IgEntry   { id?: string; messaging?: Array<{ sender?:{id?:string}; recipient?:{id?:string}; timestamp?:number; message?: IgMessage; }>; changes?: IgChange[]; }
interface IgPayload { object?: string; entry?: IgEntry[]; }

// ── Helpers ────────────────────────────────────────────────────────────────

function attachmentToTipo(type: string): string {
  switch (type) {
    case 'image':   return 'imagem';
    case 'video':   return 'video';
    case 'audio':   return 'audio';
    case 'file':    return 'documento';
    case 'sticker': return 'sticker';
    default:        return 'imagem';
  }
}

// ── Servidor ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handshake de verificação do webhook (Meta GET ao registrar)
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  let payload: IgPayload;
  try { payload = await req.json(); } catch { return new Response('bad json', { status: 400 }); }

  if (payload.object !== 'instagram') return new Response('ok', { status: 200 });

  const { data: canal } = await sb.from('atd_canais').select('id').eq('tipo', 'instagram').maybeSingle();
  const IG_TOKEN = Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN');

  // ── Busca perfil IG (best-effort) ────────────────────────────────────────
  async function fetchIgProfile(igsid: string) {
    if (!IG_TOKEN) return { nome: null, avatar: null, followers: null, following: null, posts: null };
    try {
      const r = await fetch(
        `https://graph.instagram.com/v21.0/${igsid}?fields=name,profile_pic,followers_count,follows_count,media_count&access_token=${IG_TOKEN}`
      );
      if (!r.ok) return { nome: null, avatar: null, followers: null, following: null, posts: null };
      const p = await r.json();
      return {
        nome:      p.name          ?? null,
        avatar:    p.profile_pic   ?? null,
        followers: p.followers_count ?? null,
        following: p.follows_count  ?? null,
        posts:     p.media_count    ?? null,
      };
    } catch { return { nome: null, avatar: null, followers: null, following: null, posts: null }; }
  }

  // ── Upsert contato IG ────────────────────────────────────────────────────
  async function upsertContato(igsid: string) {
    const prof = await fetchIgProfile(igsid);
    const { data, error } = await sb
      .from('atd_contatos')
      .upsert({
        instagram_id: igsid,
        canal_origem:  'instagram',
        ...(prof.nome     ? { nome: prof.nome }             : {}),
        ...(prof.avatar   ? { avatar_url: prof.avatar }     : {}),
        ...(prof.followers != null ? { ig_followers: prof.followers } : {}),
        ...(prof.following != null ? { ig_following: prof.following } : {}),
        ...(prof.posts     != null ? { ig_posts: prof.posts }         : {}),
      }, { onConflict: 'instagram_id', ignoreDuplicates: false })
      .select('id')
      .single();
    if (error || !data) { console.error('[ig-wh] erro contato', error); return null; }
    return data.id as string;
  }

  // ── Busca ou cria conversa ────────────────────────────────────────────────
  async function upsertConversa(contatoId: string) {
    const { data: ex } = await sb
      .from('atd_conversas')
      .select('id')
      .eq('contato_id', contatoId)
      .eq('canal_tipo', 'instagram')
      .in('status', ['aberta', 'em_atendimento', 'aguardando_cliente'])
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ex) {
      await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', ex.id);
      return ex.id as string;
    }
    const { data: nova, error } = await sb
      .from('atd_conversas')
      .insert({ contato_id: contatoId, canal_id: canal?.id ?? null, canal_tipo: 'instagram', status: 'aberta' })
      .select('id')
      .single();
    if (error || !nova) { console.error('[ig-wh] erro conversa', error); return null; }
    return nova.id as string;
  }

  // ── Salva mensagem ────────────────────────────────────────────────────────
  async function salvarMensagem(conversaId: string, tipo: string, conteudo: Record<string, unknown>, mid?: string | null) {
    const { error } = await sb.from('atd_mensagens').upsert({
      conversa_id:  conversaId,
      origem:       'cliente',
      visibilidade: 'publica',
      tipo,
      conteudo,
      external_id:  mid ?? null,
      enviado_em:   new Date().toISOString(),
    }, { onConflict: 'external_id', ignoreDuplicates: true });
    if (error) console.error('[ig-wh] erro ao salvar mensagem', error);
  }

  // ── Processa cada entry ───────────────────────────────────────────────────
  for (const entry of payload.entry ?? []) {

    // 1. Mensagens diretas (messaging[] — formato legado Messenger ou changes[field=messages])
    const mensagensLegado = (entry.messaging ?? []).map(e => ({
      igsid:   e.sender?.id,
      message: e.message,
    }));
    const mensagensNovos = (entry.changes ?? [])
      .filter(c => c.field === 'messages')
      .map(c => ({ igsid: c.value?.sender?.id, message: c.value?.message }));

    for (const { igsid, message } of [...mensagensLegado, ...mensagensNovos]) {
      if (!igsid || !message || message.is_echo || message.is_unsupported) continue;

      const contatoId = await upsertContato(igsid);
      if (!contatoId) continue;
      const conversaId = await upsertConversa(contatoId);
      if (!conversaId) continue;

      // Story reply context (reply_to.story)
      const storyCtx = message.reply_to?.story
        ? { story_id: message.reply_to.story.id ?? null, story_url: message.reply_to.story.url ?? null }
        : null;

      // Texto (com ou sem contexto de story)
      if (message.text) {
        await salvarMensagem(conversaId, 'texto', {
          texto: message.text,
          ...(storyCtx ? { story_reply: storyCtx } : {}),
        }, message.mid);
        continue;
      }

      // Attachments (imagem, vídeo, áudio, sticker)
      for (const att of message.attachments ?? []) {
        const tipo = attachmentToTipo(att.type ?? '');
        const urlMidia = att.payload?.url ?? null;
        const mid = message.mid ?? null;
        await salvarMensagem(conversaId, tipo, {
          url:   urlMidia,
          texto: '',
          ...(storyCtx ? { story_reply: storyCtx } : {}),
          ...(att.payload?.sticker_id ? { sticker_id: att.payload.sticker_id } : {}),
        }, mid);
      }
    }

    // 2. Menção em story (changes[field=mentions])
    for (const change of entry.changes ?? []) {
      if (change.field !== 'mentions') continue;
      const val = change.value;
      if (!val?.media_id) continue;

      // O IGSID do entry.id é o nosso próprio ID — quem mencionou não vem nesse evento diretamente
      // Mas a Graph API permite buscar o comentário para obter o autor
      let igsid: string | null = null;
      let storyUrl: string | null = null;
      if (IG_TOKEN && val.media_id) {
        try {
          const r = await fetch(
            `https://graph.instagram.com/v21.0/${val.media_id}?fields=permalink,from&access_token=${IG_TOKEN}`
          );
          if (r.ok) {
            const d = await r.json();
            igsid    = d.from?.id ?? null;
            storyUrl = d.permalink ?? null;
          }
        } catch { /* best-effort */ }
      }

      if (!igsid) continue;
      const contatoId = await upsertContato(igsid);
      if (!contatoId) continue;
      const conversaId = await upsertConversa(contatoId);
      if (!conversaId) continue;

      await salvarMensagem(conversaId, 'story_mention', {
        media_id:  val.media_id,
        story_url: storyUrl,
        texto:     '',
      }, `mention_${val.media_id}`);
    }
  }

  return new Response('ok', { status: 200 });
});

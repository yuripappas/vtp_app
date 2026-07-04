// VTP Atendimento — webhook-instagram
// Recebe eventos da Instagram Messaging API (Meta).
// Suporta: DMs texto/mídia, story replies (via messages), story comments (via comments).

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Tipos ──────────────────────────────────────────────────────────────────
interface IgStory      { id?: string; url?: string; }
interface IgAttachment { type?: string; payload?: { url?: string; sticker_id?: string }; }
interface IgMessage {
  mid?: string; text?: string; is_echo?: boolean; is_unsupported?: boolean;
  reply_to?: { story?: IgStory; mid?: string };
  attachments?: IgAttachment[];
}
interface IgCommentValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string }; // STORY | FEED | REELS
  parent_id?: string; // preenchido quando é reply a outro comentário
}
interface IgChangeValue {
  sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number;
  message?: IgMessage;
  // comments field
  id?: string; text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
  parent_id?: string;
}
interface IgChange  { field?: string; value?: IgChangeValue; }
interface IgEntry   {
  id?: string;
  messaging?: Array<{ sender?:{id?:string}; recipient?:{id?:string}; timestamp?:number; message?: IgMessage }>;
  changes?: IgChange[];
}
interface IgPayload { object?: string; entry?: IgEntry[]; }

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

  // Handshake de verificação
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token && verifyToken && token === verifyToken)
      return new Response(challenge ?? '', { status: 200 });
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
  const IG_TOKEN   = Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN');
  const PAGE_TOKEN = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');

  // Auto-descobre o ID da própria conta IG Business a partir do token configurado
  async function getOwnIgAcctId(): Promise<string | null> {
    const token = PAGE_TOKEN || IG_TOKEN;
    if (!token) return null;
    // Tenta Graph API (retorna ID da conta IG Business vinculada à página)
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/me?fields=id&access_token=${token}`);
      if (r.ok) { const d = await r.json(); if (d.id) return d.id as string; }
    } catch { /* continua */ }
    // Fallback: Instagram Graph API
    try {
      const r = await fetch(`https://graph.instagram.com/v21.0/me?fields=id&access_token=${token}`);
      if (r.ok) { const d = await r.json(); if (d.id) return d.id as string; }
    } catch { /* continua */ }
    return Deno.env.get('INSTAGRAM_BUSINESS_ACCOUNT_ID') ?? null;
  }

  // ── Busca perfil do remetente ────────────────────────────────────────────
  // 1ª tentativa: Instagram Messaging API (funciona com instagram_manage_messages)
  // 2ª tentativa: Business Discovery API (requer Page Token — opcional)
  async function fetchIgProfile(igsid: string) {
    const empty = { nome: null, avatar: null, followers: null, following: null, posts: null, username: null };
    const token = PAGE_TOKEN || IG_TOKEN;
    if (!token) return empty;
    try {
      // Direto via Instagram Graph API — funciona para usuários que interagiram com o negócio
      const r = await fetch(
        `https://graph.instagram.com/v21.0/${igsid}?fields=name,profile_pic,username,follower_count,is_verified_user&access_token=${token}`
      );
      if (r.ok) {
        const p = await r.json();
        console.log('[ig-wh] profile response:', JSON.stringify(p));
        if (!p.error) {
          return {
            nome:      p.name           ?? null,
            avatar:    p.profile_pic    ?? null,
            followers: p.follower_count ?? null,
            following: null,
            posts:     null,
            username:  p.username       ?? null,
          };
        }
      } else {
        const err = await r.text();
        console.log('[ig-wh] profile error:', r.status, err);
      }
    } catch { /* continua */ }
    try {
      // Business Discovery (requer Page Token + conta business pública do contato)
      const ownId = await getOwnIgAcctId();
      if (ownId) {
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${ownId}?fields=business_discovery.fields(followers_count,follows_count,media_count,name,profile_picture_url,username)&access_token=${token}&business_discovery_user_id=${igsid}`
        );
        if (r.ok) {
          const d = await r.json();
          const bd = d.business_discovery ?? {};
          if (bd.name || bd.followers_count) {
            return {
              nome:      bd.name                ?? null,
              avatar:    bd.profile_picture_url ?? null,
              followers: bd.followers_count     ?? null,
              following: bd.follows_count       ?? null,
              posts:     bd.media_count         ?? null,
              username:  bd.username            ?? null,
            };
          }
        }
      }
    } catch { /* continua */ }
    return empty;
  }

  // ── Upsert contato ────────────────────────────────────────────────────────
  async function upsertContato(igsid: string, usernameHint?: string | null) {
    const prof = await fetchIgProfile(igsid);
    const { data, error } = await sb
      .from('atd_contatos')
      .upsert({
        instagram_id:  igsid,
        canal_origem:  'instagram',
        ...(prof.nome     ? { nome: prof.nome }             : usernameHint ? { nome: `@${usernameHint}` } : {}),
        ...(prof.avatar   ? { avatar_url: prof.avatar }     : {}),
        ...(prof.username ? { instagram_handle: prof.username } : usernameHint ? { instagram_handle: usernameHint } : {}),
        ...(prof.followers != null ? { ig_followers: prof.followers } : {}),
        ...(prof.following != null ? { ig_following: prof.following } : {}),
        ...(prof.posts     != null ? { ig_posts:     prof.posts     } : {}),
      }, { onConflict: 'instagram_id', ignoreDuplicates: false })
      .select('id')
      .single();
    if (error || !data) { console.error('[ig-wh] erro contato', error); return null; }
    return data.id as string;
  }

  // ── Busca ou cria conversa ────────────────────────────────────────────────
  async function upsertConversa(contatoId: string) {
    const { data: ex } = await sb
      .from('atd_conversas').select('id')
      .eq('contato_id', contatoId).eq('canal_tipo', 'instagram')
      .in('status', ['aberta', 'em_atendimento', 'aguardando_cliente'])
      .order('atualizado_em', { ascending: false }).limit(1).maybeSingle();
    if (ex) {
      await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', ex.id);
      return ex.id as string;
    }
    const { data: nova, error } = await sb.from('atd_conversas')
      .insert({ contato_id: contatoId, canal_id: canal?.id ?? null, canal_tipo: 'instagram', status: 'aberta' })
      .select('id').single();
    if (error || !nova) { console.error('[ig-wh] erro conversa', error); return null; }
    return nova.id as string;
  }

  // ── Salva imagem no Storage antes de expirar (URLs do CDN Meta expiram) ──
  async function salvarMidiaStorage(url: string, pasta: string, nome: string): Promise<string | null> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buf  = await resp.arrayBuffer();
      const ct   = resp.headers.get('content-type') || 'image/jpeg';
      const ext  = ct.includes('video') ? 'mp4' : ct.includes('png') ? 'png' : 'jpg';
      const path = `${pasta}/${nome}.${ext}`;
      const { error } = await sb.storage.from('atd-midias').upload(path, buf, { contentType: ct, upsert: true });
      if (error) return null;
      const { data } = sb.storage.from('atd-midias').getPublicUrl(path);
      return data.publicUrl;
    } catch { return null; }
  }

  // ── Salva mensagem (dedupe por external_id) ───────────────────────────────
  async function salvarMensagem(conversaId: string, tipo: string, conteudo: Record<string, unknown>, externalId?: string | null) {
    const { error } = await sb.from('atd_mensagens').upsert({
      conversa_id: conversaId, origem: 'cliente', visibilidade: 'publica',
      tipo, conteudo, external_id: externalId ?? null,
      enviado_em: new Date().toISOString(),
    }, { onConflict: 'external_id', ignoreDuplicates: true });
    if (error) console.error('[ig-wh] erro ao salvar mensagem', error);
  }

  // ── Processa entries ──────────────────────────────────────────────────────
  for (const entry of payload.entry ?? []) {

    // ── 1. DMs (messages field — inclui story replies via reply_to.story) ──
    const msgLegado = (entry.messaging ?? []).map(e => ({ igsid: e.sender?.id, message: e.message }));
    const msgNovos  = (entry.changes ?? [])
      .filter(c => c.field === 'messages')
      .map(c => ({ igsid: c.value?.sender?.id, message: c.value?.message }));

    for (const { igsid, message } of [...msgLegado, ...msgNovos]) {
      if (!igsid || !message || message.is_echo || message.is_unsupported) continue;

      const contatoId = await upsertContato(igsid);
      if (!contatoId) continue;
      const conversaId = await upsertConversa(contatoId);
      if (!conversaId) continue;

      // Contexto de story reply — salva mídia no Storage antes de expirar
      let storyCtx: Record<string, unknown> | null = null;
      if (message.reply_to?.story) {
        const rawUrl = message.reply_to.story.url ?? null;
        const storyId = message.reply_to.story.id ?? null;
        let previewUrl: string | null = null;
        if (rawUrl) {
          previewUrl = await salvarMidiaStorage(rawUrl, `stories/${conversaId}`, storyId ?? Date.now().toString());
        }
        storyCtx = { story_id: storyId, story_url: rawUrl, story_preview_url: previewUrl };
      }

      if (message.text) {
        await salvarMensagem(conversaId, 'texto', {
          texto: message.text,
          ...(storyCtx ? { story_reply: storyCtx } : {}),
        }, message.mid);
        continue;
      }

      for (const att of message.attachments ?? []) {
        await salvarMensagem(conversaId, attachmentToTipo(att.type ?? ''), {
          url:   att.payload?.url ?? null,
          texto: '',
          ...(storyCtx ? { story_reply: storyCtx } : {}),
          ...(att.payload?.sticker_id ? { sticker_id: att.payload.sticker_id } : {}),
        }, message.mid);
      }
    }

    // ── 2. Read receipts (messaging_read) ────────────────────────────────────
    for (const ev of entry.messaging ?? []) {
      const read = (ev as Record<string, unknown>).read as { watermark?: number } | undefined;
      if (!read?.watermark) continue;
      const senderId = (ev as Record<string, unknown>).sender as { id?: string } | undefined;
      if (!senderId?.id) continue;
      // Marca como lidas todas mensagens do atendente enviadas antes do watermark
      const watermarkIso = new Date(read.watermark * 1000).toISOString();
      const { data: conv } = await sb.from('atd_conversas')
        .select('id, contato_id')
        .eq('canal_tipo', 'instagram')
        .limit(1).maybeSingle();
      if (!conv) continue;
      await sb.from('atd_mensagens')
        .update({ status: 'read' })
        .eq('conversa_id', conv.id)
        .eq('origem', 'atendente')
        .lte('enviado_em', watermarkIso)
        .neq('status', 'read');
    }

    // ── 3. Comentários em posts/stories (comments field) ───────────────────
    for (const change of entry.changes ?? []) {
      if (change.field !== 'comments') continue;
      const val = change.value;
      if (!val?.id || !val.from?.id) continue;

      const igsid    = val.from.id;
      const username = val.from.username ?? null;
      const texto    = val.text ?? '';
      const mediaId  = val.media?.id ?? null;
      const mediaType = val.media?.media_product_type ?? null; // 'STORY' | 'FEED' | 'REELS'
      const commentId = val.id;

      const contatoId = await upsertContato(igsid, username);
      if (!contatoId) continue;
      const conversaId = await upsertConversa(contatoId);
      if (!conversaId) continue;

      // Busca permalink + thumbnail do post/story para preview
      let mediaUrl: string | null = null;
      let mediaThumb: string | null = null;
      if (mediaId && (PAGE_TOKEN || IG_TOKEN)) {
        try {
          const token = PAGE_TOKEN ?? IG_TOKEN;
          const r = await fetch(
            `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink,thumbnail_url,media_url,media_type&access_token=${token}`
          );
          if (r.ok) {
            const d = await r.json();
            mediaUrl = d.permalink ?? null;
            // thumbnail_url para vídeos/reels, media_url para imagens
            const rawThumb = d.thumbnail_url ?? d.media_url ?? null;
            if (rawThumb) {
              // Salva no Storage para não expirar
              mediaThumb = await salvarMidiaStorage(rawThumb, `story-comments/${conversaId}`, `comment_${commentId}`);
              if (!mediaThumb) mediaThumb = rawThumb; // fallback para URL original
            }
          }
        } catch { /* best-effort */ }
      }

      await salvarMensagem(conversaId, 'story_comment', {
        texto,
        media_id:        mediaId,
        media_url:       mediaUrl,
        media_thumb:     mediaThumb,
        media_type:      mediaType,   // 'STORY' | 'FEED' | 'REELS'
        is_story:        mediaType === 'STORY',
      }, `comment_${commentId}`);
    }
  }

  return new Response('ok', { status: 200 });
});

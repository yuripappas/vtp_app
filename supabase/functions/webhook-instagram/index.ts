// VTP Atendimento — webhook-instagram
// Recebe eventos da Instagram Messaging API (Meta).
// GET  → handshake de verificação do webhook (hub.challenge).
// POST → mensagens recebidas, gravadas em atd_contatos/atd_conversas/atd_mensagens.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface IgMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface IgChangeValue {
  message?: { mid?: string; text?: string; is_echo?: boolean };
  sender?: { id?: string };
  recipient?: { id?: string };
}

interface IgChange {
  field?: string;
  value?: IgChangeValue;
}

interface IgEntry {
  id?: string;
  messaging?: IgMessagingEvent[];
  changes?: IgChange[];
}

interface IgPayload {
  object?: string;
  entry?: IgEntry[];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handshake de verificação (Meta chama isso ao registrar o webhook no app)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const payload: IgPayload = await req.json();

  if (payload.object !== 'instagram') {
    return new Response('ok', { status: 200 });
  }

  const { data: canal } = await sb.from('atd_canais').select('id').eq('tipo', 'instagram').maybeSingle();

  for (const entry of payload.entry ?? []) {
    // Formato legado (estilo Messenger): entry[].messaging[]
    const eventosLegado = entry.messaging ?? [];
    // Formato novo (Instagram API com Login do Instagram): entry[].changes[].field === 'messages'
    const eventosNovos = (entry.changes ?? [])
      .filter((c) => c.field === 'messages')
      .map((c) => ({ sender: c.value?.sender, message: c.value?.message }));

    for (const evento of [...eventosLegado, ...eventosNovos]) {
      // Ignora eco das nossas próprias mensagens enviadas pela Graph API
      if (evento.message?.is_echo) continue;
      const igsid = evento.sender?.id;
      const texto = evento.message?.text;
      const mid = evento.message?.mid;
      if (!igsid || !texto) continue;

      const { data: contato, error: contatoErr } = await sb
        .from('atd_contatos')
        .upsert({ instagram_id: igsid, canal_origem: 'instagram' }, { onConflict: 'instagram_id', ignoreDuplicates: false })
        .select('id')
        .single();
      if (contatoErr || !contato) { console.error('erro ao upsertar contato instagram', contatoErr); continue; }

      const { data: conversaExistente } = await sb
        .from('atd_conversas')
        .select('id')
        .eq('contato_id', contato.id)
        .eq('canal_tipo', 'instagram')
        .eq('status', 'aberta')
        .maybeSingle();

      let conversaId = conversaExistente?.id;
      if (!conversaId) {
        const { data: novaConversa, error: convErr } = await sb
          .from('atd_conversas')
          .insert({ contato_id: contato.id, canal_id: canal?.id ?? null, canal_tipo: 'instagram', status: 'aberta' })
          .select('id')
          .single();
        if (convErr || !novaConversa) { console.error('erro ao criar conversa instagram', convErr); continue; }
        conversaId = novaConversa.id;
      } else {
        await sb.from('atd_conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', conversaId);
      }

      await sb.from('atd_mensagens').upsert({
        conversa_id: conversaId,
        origem: 'cliente',
        visibilidade: 'publica',
        tipo: 'texto',
        conteudo: { texto },
        external_id: mid ?? null,
      }, { onConflict: 'external_id', ignoreDuplicates: true });
    }
  }

  return new Response('ok', { status: 200 });
});

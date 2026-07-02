// VTP Atendimento — limpar-midias
// Cron diário: remove do Supabase Storage arquivos de mídia com mais de 7 dias
// e marca as mensagens como expiradas (conteudo.expirado = true).
// Agendado via Supabase Cron: todo dia às 03:00 BRT (06:00 UTC).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BUCKET = 'atd-midias';
const DIAS   = 7;
const TIPOS_MIDIA = ['imagem', 'audio', 'video', 'documento', 'sticker'];

Deno.serve(async (req) => {
  // Aceita tanto chamada via cron (GET) quanto manual (POST)
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const corte = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();

  // Busca mensagens de mídia antigas que ainda têm URL do Storage
  const { data: mensagens, error } = await sb
    .from('atd_mensagens')
    .select('id, tipo, conteudo')
    .in('tipo', TIPOS_MIDIA)
    .lt('enviado_em', corte)
    .not('conteudo->>url', 'is', null)
    .not('conteudo->>expirado', 'eq', 'true')
    .limit(500);

  if (error) {
    console.error('[limpar-midias] erro ao buscar mensagens:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!mensagens || mensagens.length === 0) {
    return new Response(JSON.stringify({ ok: true, removidos: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let removidos = 0;
  let falhas = 0;

  for (const msg of mensagens) {
    const url: string = msg.conteudo?.url;
    if (!url) continue;

    // Extrai o path dentro do bucket a partir da URL pública
    // Ex: .../storage/v1/object/public/atd-midias/imagem/abc123.jpg → imagem/abc123.jpg
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) {
      // URL não é do nosso Storage (ex: URL original do WhatsApp ainda no banco) — só marca como expirada
      await sb.from('atd_mensagens').update({
        conteudo: { ...msg.conteudo, url: null, expirado: true },
      }).eq('id', msg.id);
      removidos++;
      continue;
    }

    const storagePath = url.slice(idx + marker.length);

    // Remove do Storage
    const { error: delErr } = await sb.storage.from(BUCKET).remove([storagePath]);
    if (delErr) {
      console.warn('[limpar-midias] falha ao remover arquivo:', storagePath, delErr.message);
      falhas++;
      continue;
    }

    // Marca mensagem como expirada (preserva texto/legenda, remove url)
    const conteudoAtualizado = { ...msg.conteudo, url: null, expirado: true };
    await sb.from('atd_mensagens').update({ conteudo: conteudoAtualizado }).eq('id', msg.id);
    removidos++;
  }

  console.log(`[limpar-midias] removidos=${removidos} falhas=${falhas}`);
  return new Response(JSON.stringify({ ok: true, removidos, falhas, total: mensagens.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// VTP Atendimento — ig-token-refresh
// Renova o Instagram User Access Token antes de vencer. O token de longa
// duração dura 60 dias; a Meta permite renová-lo (sem precisar de novo login)
// a qualquer momento depois que ele já tiver pelo menos 24h de vida, e cada
// renovação dá mais 60 dias a partir dali. Rodando essa function todo dia via
// pg_cron (ver migration 20261006120100_ig_token_refresh_cron.sql), o token
// nunca chega perto do vencimento.
//
// Onde o token mora: tabela atd_tokens_oauth (não no secret
// INSTAGRAM_USER_ACCESS_TOKEN — esse fica só como fallback pra primeira
// execução e como rede de segurança se a tabela ficar vazia por algum
// motivo). webhook-instagram, enviar-mensagem e diag-ig leem o token de lá.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const REFRESH_MARGIN_DAYS = 50; // token dura 60 dias; renova quando faltar menos que isso

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Essa function não exige JWT do Supabase (verify_jwt=false, ver config.toml) —
  // quem chama é o pg_cron, que não tem como mandar um JWT de usuário. Em vez
  // disso, confere um segredo próprio guardado no banco (nunca em arquivo/git).
  const { data: authRow } = await sb.from('atd_cron_tokens').select('secret').eq('job_name', 'ig-token-refresh').maybeSingle();
  if (!authRow?.secret || req.headers.get('x-cron-secret') !== authRow.secret) {
    return new Response('Forbidden', { status: 403 });
  }

  const { data: row } = await sb
    .from('atd_tokens_oauth')
    .select('access_token, expires_at')
    .eq('provider', 'instagram')
    .maybeSingle();

  const tokenAtual = row?.access_token ?? Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN') ?? null;
  if (!tokenAtual) {
    console.error('[ig-refresh] nenhum token configurado (nem na tabela, nem no secret)');
    return new Response(JSON.stringify({ erro: 'sem token configurado' }), { status: 200 });
  }

  // Se já sabemos o vencimento e ainda falta bastante, não gasta chamada à toa.
  if (row?.expires_at) {
    const diasRestantes = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    if (diasRestantes > REFRESH_MARGIN_DAYS) {
      return new Response(JSON.stringify({
        renovado: false, motivo: 'ainda longe do vencimento',
        dias_restantes: Math.round(diasRestantes * 10) / 10, expires_at: row.expires_at,
      }), { status: 200 });
    }
  }

  try {
    const r = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tokenAtual}`
    );
    const d = await r.json();

    if (!r.ok || !d.access_token) {
      // Caso comum logo após gerar um token novo na mão: a Meta exige 24h de
      // vida mínima antes de aceitar renovação. Não é erro grave — a function
      // tenta de novo no próximo dia, e o token atual continua válido.
      console.error('[ig-refresh] Meta recusou renovação', JSON.stringify(d));
      return new Response(JSON.stringify({ renovado: false, erro: d.error ?? d }), { status: 200 });
    }

    const novoExpiresAt = new Date(Date.now() + (d.expires_in ?? 5_184_000) * 1000).toISOString();
    const { error } = await sb.from('atd_tokens_oauth').upsert({
      provider: 'instagram',
      access_token: d.access_token,
      token_type: d.token_type ?? 'bearer',
      expires_at: novoExpiresAt,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'provider' });

    if (error) {
      console.error('[ig-refresh] renovou na Meta mas falhou ao salvar no banco', error);
      return new Response(JSON.stringify({ renovado: false, erro: 'falha ao salvar: ' + error.message }), { status: 500 });
    }

    console.log('[ig-refresh] token renovado com sucesso, novo vencimento', novoExpiresAt);
    return new Response(JSON.stringify({ renovado: true, expires_at: novoExpiresAt }), { status: 200 });
  } catch (e) {
    console.error('[ig-refresh] erro inesperado', e);
    return new Response(JSON.stringify({ renovado: false, erro: String(e) }), { status: 500 });
  }
});

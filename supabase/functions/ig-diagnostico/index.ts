// VTP Atendimento — ig-diagnostico
// Diagnóstico temporário: confirma se a conta Instagram está de fato
// inscrita pro recebimento de webhooks de mensagens (subscribed_apps).
// Não expõe o token — só retorna o status da inscrição.

Deno.serve(async (req) => {
  const IG_USER_TOKEN = Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN');
  if (!IG_USER_TOKEN) {
    return new Response(JSON.stringify({ error: 'INSTAGRAM_USER_ACCESS_TOKEN não configurado' }), { status: 500 });
  }

  const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${IG_USER_TOKEN}`);
  const me = await meRes.json();

  if (!meRes.ok) {
    return new Response(JSON.stringify({ etapa: 'me', status: meRes.status, detalhe: me }), { status: 200 });
  }

  const subRes = await fetch(`https://graph.instagram.com/v21.0/${me.id}/subscribed_apps?access_token=${IG_USER_TOKEN}`);
  const sub = await subRes.json();

  return new Response(JSON.stringify({ me, subscribed_apps_status: subRes.status, subscribed_apps: sub }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

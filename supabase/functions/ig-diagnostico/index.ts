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

  // POST → inscreve o NOSSO app (o dono do token) como receptor de "messages"
  // pra essa conta. Necessário pq subscribed_apps pode estar apontando pra
  // outro app de terceiros (ex: Talqui) mesmo após revogar o acesso dele.
  if (req.method === 'POST') {
    const subscribeRes = await fetch(
      `https://graph.instagram.com/v21.0/${me.id}/subscribed_apps?subscribed_fields=messages&access_token=${IG_USER_TOKEN}`,
      { method: 'POST' },
    );
    const subscribeResult = await subscribeRes.json();
    const subRes2 = await fetch(`https://graph.instagram.com/v21.0/${me.id}/subscribed_apps?access_token=${IG_USER_TOKEN}`);
    const sub2 = await subRes2.json();
    return new Response(
      JSON.stringify({ me, subscribe_status: subscribeRes.status, subscribe_result: subscribeResult, subscribed_apps_depois: sub2 }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ me, subscribed_apps_status: subRes.status, subscribed_apps: sub }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

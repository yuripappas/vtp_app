import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const token = Deno.env.get('INSTAGRAM_USER_ACCESS_TOKEN') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Busca todos contatos Instagram sem stats
  const { data: contatos } = await sb.from('atd_contatos')
    .select('id,instagram_id,nome')
    .eq('canal_origem','instagram')
    .not('instagram_id','is',null)
    .is('ig_followers', null)
    .limit(50);

  const results = [];
  for (const c of contatos ?? []) {
    try {
      const r = await fetch(
        `https://graph.instagram.com/v21.0/${c.instagram_id}?fields=name,profile_pic,username,follower_count,is_verified_user&access_token=${token}`
      );
      const p = await r.json();
      if (p.follower_count != null || p.username) {
        await sb.from('atd_contatos').update({
          ...(p.name     ? { nome: p.name }               : {}),
          ...(p.profile_pic ? { avatar_url: p.profile_pic } : {}),
          ...(p.username ? { instagram_handle: p.username } : {}),
          ...(p.follower_count != null ? { ig_followers: p.follower_count } : {}),
        }).eq('id', c.id);
        results.push({ id: c.id, nome: c.nome, followers: p.follower_count, username: p.username });
      } else {
        results.push({ id: c.id, nome: c.nome, error: p.error?.message });
      }
    } catch (e) {
      results.push({ id: c.id, nome: c.nome, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ total: results.length, results }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// VTP — ifood-reviews
// Proxy seguro para a API de Avaliações do iFood.
// Ações suportadas via query param ?action=<ação>:
//   list    — GET  /review/v2.0/merchants/{id}/reviews?page=N&pageSize=N
//   reply   — POST /review/v2.0/merchants/{id}/reviews/{reviewId}/replies
//   status  — GET  /review/v2.0/merchants/{id}/reviews?filters[0]=NOT_REPLIED (contagem pendente)
//
// SEGURANÇA: IFOOD_CLIENT_SECRET NUNCA sai daqui para o frontend.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const IFOOD_AUTH_URL    = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';
const IFOOD_REVIEWS_URL = 'https://merchant-api.ifood.com.br/review/v2.0';
const TOKEN_CACHE_KEY   = 'ifood_access_token';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // ── Secrets ──────────────────────────────────────────────────────────────
  const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const IFOOD_CLIENT_ID     = Deno.env.get('IFOOD_CLIENT_ID') ?? '';
  const IFOOD_CLIENT_SECRET = Deno.env.get('IFOOD_CLIENT_SECRET') ?? '';
  const IFOOD_MERCHANT_ID   = Deno.env.get('IFOOD_MERCHANT_ID') ?? 'b4ea9cad-91d4-435c-9d1c-738353d19586';

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Autenticação do caller (anon key do VTP) ──────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Token iFood (com cache na tabela ifood_cache) ─────────────────────────
  async function getIfoodToken(): Promise<string> {
    // Verificar cache
    const { data: row } = await sb
      .from('ifood_cache')
      .select('value, expires_at')
      .eq('key', TOKEN_CACHE_KEY)
      .single();

    if (row?.value && row.expires_at && new Date(row.expires_at) > new Date(Date.now() + 60_000)) {
      return (row.value as { access_token: string }).access_token;
    }

    // Sem cache ou expirado — buscar novo token
    if (!IFOOD_CLIENT_ID || !IFOOD_CLIENT_SECRET) {
      throw new Error('IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET não configurados. Cadastre-os em Supabase > Settings > Edge Functions > Secrets.');
    }

    const params = new URLSearchParams({
      grantType: 'client_credentials',
      clientId: IFOOD_CLIENT_ID,
      clientSecret: IFOOD_CLIENT_SECRET,
    });

    const r = await fetch(IFOOD_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`iFood auth falhou: ${r.status} — ${txt}`);
    }

    const json = await r.json() as { accessToken: string; expiresIn: number };
    const token = json.accessToken;
    const expiresAt = new Date(Date.now() + json.expiresIn * 1000).toISOString();

    await sb.from('ifood_cache').upsert(
      { key: TOKEN_CACHE_KEY, value: { access_token: token }, expires_at: expiresAt },
      { onConflict: 'key' }
    );

    return token;
  }

  // ── Roteamento ────────────────────────────────────────────────────────────
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'list';

  try {
    const token = await getIfoodToken();
    const ifoodHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // LIST — listar avaliações
    if (action === 'list') {
      const page     = url.searchParams.get('page')     ?? '1';
      const pageSize = url.searchParams.get('pageSize') ?? '20';
      const status   = url.searchParams.get('status');   // ex: NOT_REPLIED | REPLIED

      let listUrl = `${IFOOD_REVIEWS_URL}/merchants/${IFOOD_MERCHANT_ID}/reviews?page=${page}&pageSize=${pageSize}`;
      if (status) listUrl += `&filters[0]=${encodeURIComponent(status)}`;

      const r = await fetch(listUrl, { headers: ifoodHeaders });
      const data = await r.json();
      return new Response(JSON.stringify(data), {
        status: r.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // REPLY — responder avaliação
    if (action === 'reply' && req.method === 'POST') {
      const body      = await req.json() as { reviewId: string; message: string };
      const { reviewId, message } = body;

      if (!reviewId || !message) {
        return new Response(JSON.stringify({ error: 'reviewId e message são obrigatórios' }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      if (message.length < 10 || message.length > 300) {
        return new Response(JSON.stringify({ error: 'Resposta deve ter entre 10 e 300 caracteres' }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const replyUrl = `${IFOOD_REVIEWS_URL}/merchants/${IFOOD_MERCHANT_ID}/reviews/${reviewId}/replies`;
      const r = await fetch(replyUrl, {
        method: 'POST',
        headers: ifoodHeaders,
        body: JSON.stringify({ message }),
      });

      const data = r.status === 204 ? { ok: true } : await r.json();
      return new Response(JSON.stringify(data), {
        status: r.ok ? 200 : r.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // STATUS — conta avaliações pendentes (badge)
    if (action === 'status') {
      const listUrl = `${IFOOD_REVIEWS_URL}/merchants/${IFOOD_MERCHANT_ID}/reviews?page=1&pageSize=1&filters[0]=NOT_REPLIED`;
      const r = await fetch(listUrl, { headers: ifoodHeaders });
      const data = await r.json() as { total?: number };
      return new Response(JSON.stringify({ pending: data.total ?? 0 }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

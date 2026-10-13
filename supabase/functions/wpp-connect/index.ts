// VTP Atendimento — wpp-connect (Meta WABA)
// Consulta o status e dados do número de WhatsApp Business via Graph API.
// Com WABA oficial não há QR code — a conexão é permanente enquanto o
// token for válido.
//
// GET ?action=status  → número, nome de display, qualidade do número
// (não há mais disconnect/QR — gerenciamento é no Meta Business Manager)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const WA_PHONE_ID = Deno.env.get('WA_PHONE_NUMBER_ID') ?? '';
  const WA_TOKEN    = Deno.env.get('WA_ACCESS_TOKEN') ?? '';

  if (!WA_PHONE_ID || !WA_TOKEN) {
    return new Response(
      JSON.stringify({ state: 'nao_configurado', erro: 'WA_PHONE_NUMBER_ID ou WA_ACCESS_TOKEN não definidos' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${WA_PHONE_ID}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      { headers: { Authorization: `Bearer ${WA_TOKEN}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as Record<string, unknown>)?.error?.message ?? `HTTP ${res.status}`;
      return new Response(
        JSON.stringify({ state: 'erro', erro: msg }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const data = await res.json();

    // quality_rating: GREEN = ótimo, YELLOW = atenção, RED = em risco de banimento
    const qualidade: string = (data as Record<string, unknown>)?.quality_rating as string ?? 'UNKNOWN';
    const state = qualidade === 'RED' ? 'risco_banimento' : 'conectado';

    return new Response(
      JSON.stringify({
        state,
        numero:       (data as Record<string, unknown>)?.display_phone_number ?? null,
        nome_perfil:  (data as Record<string, unknown>)?.verified_name ?? null,
        qualidade,
        verificado:   (data as Record<string, unknown>)?.code_verification_status === 'VERIFIED',
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ state: 'erro', erro: String(e) }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});

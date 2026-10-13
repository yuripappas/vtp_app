// VTP Atendimento — wpp-connect
// Proxy pra Evolution API sem expor as credenciais ao frontend.
// GET  ?action=status  → estado atual da instância (open/connecting/close)
// GET  ?action=qr      → QR code base64 pra escanear
// POST action=disconnect → faz logout da instância

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const EVO_URL      = Deno.env.get('EVOLUTION_API_URL')!;
  const EVO_KEY      = Deno.env.get('EVOLUTION_API_KEY')!;
  const EVO_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'vtp-main';

  const evoFetch = (path: string, method = 'GET') =>
    fetch(`${EVO_URL}${path}`, { method, headers: { apikey: EVO_KEY } });

  const url = new URL(req.url);

  if (req.method === 'GET') {
    const action = url.searchParams.get('action') || 'status';

    if (action === 'status') {
      const r = await evoFetch(`/instance/connectionState/${EVO_INSTANCE}`);
      const d = await r.json();
      const state = d?.instance?.state ?? d?.state ?? 'unknown';

      // Número e nome do perfil conectado — pra UI nunca mostrar "Conectado"
      // sem saber (e sem o usuário saber) qual número é, e pra ficar óbvio
      // quando um reconectar trocou de número sem querer.
      let numero: string | null = null;
      let nomePerfil: string | null = null;
      try {
        const rInfo = await evoFetch(`/instance/fetchInstances`);
        const dInfo = await rInfo.json();
        const info = Array.isArray(dInfo) ? dInfo.find((i: { name?: string }) => i.name === EVO_INSTANCE) : null;
        numero = info?.ownerJid ? String(info.ownerJid).split('@')[0] : null;
        nomePerfil = info?.profileName ?? null;
      } catch { /* best-effort — status principal (state) já respondeu */ }

      return new Response(JSON.stringify({ state, numero, nome_perfil: nomePerfil }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'qr') {
      const r = await evoFetch(`/instance/connect/${EVO_INSTANCE}`);
      const d = await r.json();
      return new Response(JSON.stringify({ base64: d?.base64 ?? null, code: d?.code ?? null }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));

    if (body.action === 'disconnect') {
      const r = await evoFetch(`/instance/logout/${EVO_INSTANCE}`, 'DELETE');
      const d = await r.json();
      return new Response(JSON.stringify({ ok: r.ok, detalhe: d }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'forward-location') {
      const { number, latitude, longitude, name } = body;
      if (!number || latitude == null || longitude == null) {
        return new Response(JSON.stringify({ error: 'number, latitude e longitude são obrigatórios' }), { status: 400, headers: CORS });
      }
      // Normaliza número: remove não-dígitos, garante DDI 55
      const digits = String(number).replace(/\D/g, '');
      const normalized = digits.startsWith('55') ? digits : `55${digits}`;
      const r = await fetch(`${EVO_URL}/message/sendLocation/${EVO_INSTANCE}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: normalized,
          latitude,
          longitude,
          name: name || 'Localização do cliente',
          address: '',
        }),
      });
      const d = await r.json();
      return new Response(JSON.stringify({ ok: r.ok, detalhe: d }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'ação inválida' }), { status: 400, headers: CORS });
});

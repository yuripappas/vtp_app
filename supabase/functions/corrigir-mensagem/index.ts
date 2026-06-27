// VTP Atendimento — corrigir-mensagem
// Recebe { texto } e retorna a versão corrigida (ortografia/gramática/tom)
// via Claude Haiku, sem mudar o sentido nem o idioma da mensagem.

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

interface Body { texto: string; }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const body: Body = await req.json();
  const texto = (body.texto || '').trim();
  if (!texto) {
    return new Response(JSON.stringify({ error: 'texto é obrigatório' }), { status: 400, headers: CORS_HEADERS });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: 'Você corrige ortografia, gramática e pontuação de mensagens de atendimento ao cliente de uma pizzaria, em português do Brasil. Mantenha o sentido, o tom e o tamanho originais — não reescreva o estilo, não adicione nem remova informação, não adicione emojis. Responda APENAS com o texto corrigido, sem comentários, sem aspas.',
      messages: [{ role: 'user', content: texto }],
    });

    const corrigido = msg.content.find((b) => b.type === 'text')?.text?.trim() || texto;

    return new Response(JSON.stringify({ corrigido }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'falha ao corrigir mensagem', detalhe: String(e) }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
});

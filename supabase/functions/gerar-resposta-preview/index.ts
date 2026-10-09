// VTP Atendimento — gerar-resposta-preview
// Recebe { mensagem, tom_voz, secao } e retorna uma resposta de IA
// usando o conteúdo fornecido diretamente (sem precisar salvar antes).
// Usado pelo editor da base de conhecimento para testar ao vivo.

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const { mensagem, tom_voz, secao } = await req.json().catch(() => ({}));
  if (!mensagem) {
    return new Response(JSON.stringify({ error: 'mensagem é obrigatória' }), { status: 400, headers: CORS_HEADERS });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  const secLabels: Record<string, string> = {
    tom_voz:          'tom de voz e identidade da marca',
    gestao_crise:     'protocolos de gestão de crise',
    compensacoes:     'regras de compensações e cupons',
    slas:             'SLAs e tempos de resposta',
    info_loja:        'informações da loja',
    politicas_gerais: 'políticas gerais',
  };

  const contextLabel = secLabels[secao] || 'configuração da marca';

  const system = `Você é um atendente da Vai Ter Pizza! respondendo clientes via WhatsApp. Responda a mensagem do cliente de forma direta, cordial e resolutiva. Use o seguinte guia de ${contextLabel}:\n\n${tom_voz || 'Seja cordial e profissional.'}\n\nResponda APENAS com o texto pronto para enviar ao cliente — sem comentários, sem aspas, sem explicações.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: mensagem }],
    });

    const resposta = msg.content.find(b => b.type === 'text')?.text?.trim() || '';
    return new Response(JSON.stringify({ resposta }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'falha ao gerar preview', detalhe: String(e) }), {
      status: 502, headers: CORS_HEADERS,
    });
  }
});

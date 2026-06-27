// VTP Atendimento — gerar-resposta
// Recebe { conversa_id } e usa Claude para sugerir a resposta ideal ao
// cliente, com base no histórico da conversa e no tom de voz da marca.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

interface Body { conversa_id: string; }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const body: Body = await req.json();
  if (!body.conversa_id) {
    return new Response(JSON.stringify({ error: 'conversa_id é obrigatório' }), { status: 400, headers: CORS_HEADERS });
  }

  const { data: mensagens, error: msgErr } = await sb
    .from('atd_mensagens')
    .select('origem, tipo, conteudo, enviado_em')
    .eq('conversa_id', body.conversa_id)
    .eq('visibilidade', 'publica')
    .order('enviado_em', { ascending: true })
    .limit(30);

  if (msgErr) {
    return new Response(JSON.stringify({ error: 'falha ao buscar histórico', detalhe: msgErr }), { status: 500, headers: CORS_HEADERS });
  }
  if (!mensagens || mensagens.length === 0) {
    return new Response(JSON.stringify({ error: 'conversa sem mensagens' }), { status: 400, headers: CORS_HEADERS });
  }

  const ultimaDoCliente = [...mensagens].reverse().find((m) => m.origem === 'cliente');
  if (!ultimaDoCliente) {
    return new Response(JSON.stringify({ error: 'nenhuma mensagem do cliente nesta conversa ainda' }), { status: 400, headers: CORS_HEADERS });
  }

  const { data: tomVoz } = await sb
    .from('atd_base_conhecimento')
    .select('conteudo')
    .eq('secao', 'tom_voz')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  const transcript = mensagens
    .map((m) => {
      const quem = m.origem === 'cliente' ? 'Cliente' : m.origem === 'atendente' ? 'Atendente' : 'Sistema';
      const texto = m.tipo === 'texto' ? (m.conteudo?.texto ?? '') : `[${m.tipo}]`;
      return `${quem}: ${texto}`;
    })
    .join('\n');

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `Você é um atendente de uma pizzaria (Vai Ter Pizza!) respondendo clientes via WhatsApp. Escreva a MELHOR resposta possível para a última mensagem do cliente, considerando todo o histórico da conversa. Seja direto, resolutivo e cordial. Responda em português do Brasil.${tomVoz?.conteudo ? `\n\nTom de voz da marca:\n${tomVoz.conteudo}` : ''}\n\nResponda APENAS com o texto da mensagem pronta para enviar ao cliente — sem comentários, sem aspas, sem explicações sobre a escolha.`,
      messages: [{ role: 'user', content: `Histórico da conversa:\n${transcript}\n\nEscreva a resposta ideal para a última mensagem do cliente.` }],
    });

    const resposta = msg.content.find((b) => b.type === 'text')?.text?.trim() || '';

    return new Response(JSON.stringify({ resposta }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'falha ao gerar resposta', detalhe: String(e) }), {
      status: 502,
      headers: CORS_HEADERS,
    });
  }
});

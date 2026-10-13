// VTP Compras — ler-nota
// Recebe { arquivo: base64, media_type } (foto ou PDF de nota fiscal / cupom)
// e devolve os dados estruturados da nota: fornecedor, número, data, total e
// itens. O casamento item da nota → insumo da VTP é feito no app (que tem os
// cadastros e a memória por fornecedor), não aqui.
//
// Saída garantida pelo schema (structured outputs, output_config.format).

import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BASE64 = 20 * 1024 * 1024; // ~15 MB de arquivo

const numOuNull = { type: ['number', 'null'] };
const txtOuNull = { type: ['string', 'null'] };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'motivo', 'fornecedor_nome', 'fornecedor_doc', 'numero_nota', 'chave_nfe', 'data_emissao', 'valor_total', 'itens'],
  properties: {
    legivel:         { type: 'boolean', description: 'false se a imagem não é uma nota/cupom ou está ilegível' },
    motivo:          { ...txtOuNull, description: 'quando legivel=false, o porquê, em português' },
    fornecedor_nome: txtOuNull,
    fornecedor_doc:  { ...txtOuNull, description: 'CNPJ ou CPF do emitente, só dígitos' },
    numero_nota:     txtOuNull,
    chave_nfe:       { ...txtOuNull, description: 'chave de acesso de 44 dígitos, só dígitos, se aparecer' },
    data_emissao:    { ...txtOuNull, description: 'AAAA-MM-DD' },
    valor_total:     { ...numOuNull, description: 'valor total pago na nota' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descricao', 'codigo', 'quantidade', 'unidade', 'valor_unitario', 'valor_total'],
        properties: {
          descricao:      { type: 'string', description: 'como está escrito na nota' },
          codigo:         { ...txtOuNull, description: 'código do produto na nota, se houver' },
          quantidade:     numOuNull,
          unidade:        { ...txtOuNull, description: 'unidade da nota: UN, KG, CX, PCT, FD, L…' },
          valor_unitario: numOuNull,
          valor_total:    numOuNull,
        },
      },
    },
  },
};

const INSTRUCOES = `Você lê notas fiscais (NF-e/DANFE, NFC-e, cupom fiscal) e recibos de compra de uma pizzaria no Brasil e extrai os dados exatamente como aparecem.

- Copie a descrição de cada item como está escrita; não traduza nem corrija.
- Números no formato brasileiro (1.234,56) devem virar número (1234.56).
- Quantidade e unidade são as da nota (ex.: 2 CX, 12,5 KG). Não converta unidades.
- Se um campo não aparece ou não dá para ler com segurança, use null — nunca invente.
- Ignore linhas que não são produto (troco, forma de pagamento, impostos, descontos gerais).
- Se a imagem não for uma nota ou recibo de compra, ou estiver ilegível, responda legivel=false e explique em motivo.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);

  let body: { arquivo?: string; media_type?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const arquivo = (body.arquivo || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  const mediaType = (body.media_type || '').toLowerCase();
  if (!arquivo) return json({ error: 'arquivo é obrigatório' }, 400);
  if (arquivo.length > MAX_BASE64) return json({ error: 'arquivo muito grande (máx. 15 MB)' }, 413);
  const ehPdf = mediaType === 'application/pdf';
  if (!ehPdf && !TIPOS_IMAGEM.includes(mediaType)) return json({ error: `tipo não suportado: ${mediaType}` }, 400);

  const conteudo = ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: arquivo } };

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    // deno-lint-ignore no-explicit-any
    const msg: any = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: INSTRUCOES,
      messages: [{ role: 'user', content: [conteudo, { type: 'text', text: 'Extraia os dados desta nota.' }] }],
    // deno-lint-ignore no-explicit-any
    } as any);

    if (msg.stop_reason === 'refusal') return json({ error: 'a IA recusou ler este arquivo' }, 422);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'nota grande demais para ler de uma vez' }, 422);
    // deno-lint-ignore no-explicit-any
    const texto = (msg.content || []).find((b: any) => b.type === 'text')?.text;
    if (!texto) return json({ error: 'resposta vazia da IA' }, 502);
    return json({ nota: JSON.parse(texto) });
  } catch (e) {
    const status = e instanceof Anthropic.APIError && e.status ? (e.status === 429 ? 429 : 502) : 502;
    return json({ error: 'falha ao ler a nota', detalhe: String(e?.message || e) }, status);
  }
});

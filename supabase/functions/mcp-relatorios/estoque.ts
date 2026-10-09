import type { McpTool } from './_shared/types.ts';
import { carregarItens } from './_shared/catalogo.ts';

// js/compras.js:5335 e js/estoque.js:1473 — qty só é atualizado ao receber
// uma compra ou na importação/reconciliação da planilha do Cardápio Web.
// Não existe débito automático em tempo real por venda (confirmado: o único
// código que geraria isso, _garantirMovSimuladas em js/estoque.js:1554, é
// dado de demonstração, não real) — por isso todo resultado de estoque leva
// esse aviso.
const AVISO_STALENESS =
  'Este número reflete a última contagem física ou importação do Cardápio Web — ' +
  'não é abatido em tempo real a cada venda.';

function normaliza(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export const estoqueConsulta: McpTool = {
  name: 'estoque_consulta',
  description:
    'Busca item(ns) de estoque pelo nome (busca parcial, sem acento/case) e retorna ' +
    'quantidade atual, mínimo, ideal e unidade. Ex.: busca="coca-cola 1l".',
  inputSchema: {
    type: 'object',
    properties: {
      busca: { type: 'string', description: 'Nome ou parte do nome do produto/insumo.' },
    },
    required: ['busca'],
  },
  async handler(args, sb) {
    const busca = normaliza(String(args.busca || ''));
    if (!busca) throw new Error('Argumento "busca" é obrigatório.');
    const itens = await carregarItens(sb);
    const encontrados = itens
      .filter(i => normaliza(i.name).includes(busca))
      .map(i => ({
        nome: i.name, categoria: i.cat,
        quantidade_atual: i.qty ?? null, estoque_minimo: i.min ?? null,
        estoque_ideal: i.ideal ?? null, unidade: i.unit,
      }));

    return {
      busca: args.busca,
      resultados: encontrados,
      aviso: AVISO_STALENESS,
    };
  },
};

export const estoqueAbaixoMinimo: McpTool = {
  name: 'estoque_abaixo_minimo',
  description:
    'Lista os itens de estoque cuja quantidade atual está abaixo do mínimo cadastrado ' +
    '(candidatos a reposição/compra).',
  inputSchema: { type: 'object', properties: {} },
  async handler(_args, sb) {
    const itens = await carregarItens(sb);
    const abaixo = itens
      .filter(i => typeof i.min === 'number' && typeof i.qty === 'number' && i.qty < i.min)
      .map(i => ({
        nome: i.name, categoria: i.cat,
        quantidade_atual: i.qty, estoque_minimo: i.min,
        unidade: i.unit,
        faltante: round2((i.min || 0) - (i.qty || 0)),
      }))
      .sort((a, b) => b.faltante - a.faltante);

    return { itens_abaixo_minimo: abaixo, total: abaixo.length, aviso: AVISO_STALENESS };
  },
};

function round2(n: number) { return Math.round(n * 100) / 100; }

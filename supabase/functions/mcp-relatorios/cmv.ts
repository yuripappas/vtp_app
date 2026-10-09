import type { McpTool } from './_shared/types.ts';
import { resolverPeriodo } from './_shared/periodo.ts';
import { buscarPedidosPeriodo } from './_shared/pedidos.ts';
import { carregarCatalogo } from './_shared/catalogo.ts';
import { interpretarPedido, custoLinha } from './_shared/vendas-engine.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const cmvPeriodo: McpTool = {
  name: 'cmv_periodo',
  description:
    'CMV (custo da mercadoria vendida), receita, lucro bruto e margem % num período. ' +
    'Sem argumentos, retorna o dia de hoje. ' +
    'AVISO: o custo é calculado casando cada sabor/bebida vendido com a ficha técnica ' +
    'cadastrada (mesmo motor de correspondência por similaridade do módulo Vendas do app) — ' +
    'sabores sem ficha técnica cadastrada ou não reconhecidos entram na receita mas não geram custo, ' +
    'o que pode subestimar o CMV se o cadastro de fichas técnicas estiver incompleto.',
  inputSchema: {
    type: 'object',
    properties: {
      data_inicio: { type: 'string', description: 'Data inicial, formato YYYY-MM-DD. Se omitida, usa hoje.' },
      data_fim:    { type: 'string', description: 'Data final (inclusive), formato YYYY-MM-DD.' },
    },
  },
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const [pedidos, catalogo] = await Promise.all([
      buscarPedidosPeriodo(sb, periodo.inicioISO, periodo.fimISO),
      carregarCatalogo(sb),
    ]);

    let receita = 0, custo = 0;
    for (const p of pedidos) {
      for (const linha of interpretarPedido(p, catalogo)) {
        receita += linha.receita;
        custo += custoLinha(linha, catalogo);
      }
    }

    const lucroBruto = receita - custo;
    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      receita: round2(receita),
      cmv: round2(custo),
      lucro_bruto: round2(lucroBruto),
      margem_pct: receita > 0 ? round2((lucroBruto / receita) * 100) : 0,
    };
  },
};

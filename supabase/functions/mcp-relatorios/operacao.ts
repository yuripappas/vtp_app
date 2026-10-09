import type { McpTool } from './_shared/types.ts';
import { resolverPeriodo } from './_shared/periodo.ts';
import { buscarPedidosOperacaoPeriodo } from './_shared/pedidosOperacao.ts';
import { calcTempos, META_PREPARO_MIN, META_ENTREGA_MIN } from './_shared/tempos.ts';

const PERIODO_SCHEMA = {
  type: 'object',
  properties: {
    data_inicio: { type: 'string', description: 'Data inicial, formato YYYY-MM-DD. Se omitida, usa hoje.' },
    data_fim:    { type: 'string', description: 'Data final (inclusive), formato YYYY-MM-DD.' },
  },
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const media = (vals: number[]) => vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;

export const operacaoTempos: McpTool = {
  name: 'operacao_tempos',
  description:
    'Tempo médio de preparo (confirmado→pronto), de entrega (saiu→entregue, só pedidos delivery) e ' +
    'tempo total (confirmado→entregue) num período, em minutos. Ajuda a identificar se o gargalo está ' +
    'na cozinha ou na entrega. Sem argumentos, retorna o dia de hoje. Só considera pedidos com os ' +
    'timestamps de status necessários gravados — pedidos muito antigos ou com status incompleto ficam de fora da média.',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosOperacaoPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const preparo: number[] = [], entrega: number[] = [], total: number[] = [];
    for (const p of pedidos) {
      const t = calcTempos(p.status_timestamps, p.order_type);
      if (t.tempoPreparo !== null) preparo.push(t.tempoPreparo);
      if (t.tempoEntrega !== null) entrega.push(t.tempoEntrega);
      if (t.tempoTotal !== null) total.push(t.tempoTotal);
    }

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      pedidos_considerados: pedidos.length,
      tempo_preparo_medio_min: media(preparo),
      tempo_preparo_amostras: preparo.length,
      tempo_entrega_medio_min: media(entrega),
      tempo_entrega_amostras: entrega.length,
      tempo_total_medio_min: media(total),
      tempo_total_amostras: total.length,
      metas: { preparo_min: META_PREPARO_MIN, entrega_min: META_ENTREGA_MIN },
    };
  },
};

export const pedidosAtrasados: McpTool = {
  name: 'pedidos_atrasados',
  description:
    `Lista pedidos que estouraram a meta de preparo (>${META_PREPARO_MIN}min, confirmado→pronto) ou ` +
    `de entrega (>${META_ENTREGA_MIN}min, saiu→entregue) num período — as mesmas metas usadas no ` +
    'Dashboard ao vivo do app. Sem argumentos, retorna o dia de hoje.',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosOperacaoPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const atrasados: Array<{ pedido: string; canal: string | null; motivo: string; minutos: number }> = [];
    for (const p of pedidos) {
      const t = calcTempos(p.status_timestamps, p.order_type);
      const num = `#${p.display_id ?? p.id}`;
      if (t.tempoPreparo !== null && t.tempoPreparo > META_PREPARO_MIN) {
        atrasados.push({ pedido: num, canal: p.sales_channel, motivo: 'preparo', minutos: t.tempoPreparo });
      }
      if (t.tempoEntrega !== null && t.tempoEntrega > META_ENTREGA_MIN) {
        atrasados.push({ pedido: num, canal: p.sales_channel, motivo: 'entrega', minutos: t.tempoEntrega });
      }
    }
    atrasados.sort((a, b) => b.minutos - a.minutos);

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      pedidos_considerados: pedidos.length,
      total_atrasos: atrasados.length,
      pct_pedidos_com_atraso: pedidos.length > 0 ? round1((atrasados.length / pedidos.length) * 100) : 0,
      atrasos: atrasados,
    };
  },
};

import type { McpTool } from './_shared/types.ts';
import { resolverPeriodo } from './_shared/periodo.ts';
import { buscarPedidosOperacaoPeriodo } from './_shared/pedidosOperacao.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

export const clientesRecorrencia: McpTool = {
  name: 'clientes_recorrencia',
  description:
    'Quantos clientes distintos compraram num período, quantos já eram clientes antes desse período ' +
    '(recorrentes) e quantos compraram pela primeira vez (novos) — com base no telefone do cliente. ' +
    'Sem argumentos, retorna o dia de hoje. ' +
    'AVISO: nem todo canal manda o telefone do cliente pro Cardápio Web (pedidos de alguns canais de ' +
    'portal/WhatsApp não têm essa informação) — esses pedidos ficam fora do cálculo de recorrência.',
  inputSchema: {
    type: 'object',
    properties: {
      data_inicio: { type: 'string', description: 'Data inicial, formato YYYY-MM-DD. Se omitida, usa hoje.' },
      data_fim:    { type: 'string', description: 'Data final (inclusive), formato YYYY-MM-DD.' },
    },
  },
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosOperacaoPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const comTelefone = pedidos.filter(p => !!p.customer_phone);
    const telefonesUnicos = [...new Set(comTelefone.map(p => p.customer_phone as string))];

    let clientesRecorrentes = 0;
    if (telefonesUnicos.length) {
      const { data, error } = await sb.from('cw_pedidos')
        .select('customer_phone')
        .in('customer_phone', telefonesUnicos)
        .lt('cw_created_at', periodo.inicioISO)
        .not('status', 'in', '(canceling,canceled)');
      if (error) throw new Error(`Falha ao checar histórico de clientes: ${error.message}`);
      clientesRecorrentes = new Set((data || []).map(r => r.customer_phone)).size;
    }

    const clientesNovos = telefonesUnicos.length - clientesRecorrentes;

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      pedidos_total: pedidos.length,
      pedidos_com_telefone_identificado: comTelefone.length,
      pedidos_sem_telefone_identificado: pedidos.length - comTelefone.length,
      clientes_unicos: telefonesUnicos.length,
      clientes_novos: clientesNovos,
      clientes_recorrentes: clientesRecorrentes,
      pct_recorrencia: telefonesUnicos.length > 0 ? round1((clientesRecorrentes / telefonesUnicos.length) * 100) : 0,
    };
  },
};

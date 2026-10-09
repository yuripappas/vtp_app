import type { McpTool } from './_shared/types.ts';
import { resolverPeriodo } from './_shared/periodo.ts';
import { buscarPedidosPeriodo } from './_shared/pedidos.ts';
import { buscarPedidosOperacaoPeriodo } from './_shared/pedidosOperacao.ts';
import { carregarCatalogo } from './_shared/catalogo.ts';
import { contarPizzasPedido, cwMapCanal, CANAL_LABEL } from './_shared/vendas-engine.ts';

const PERIODO_SCHEMA = {
  type: 'object',
  properties: {
    data_inicio: { type: 'string', description: 'Data inicial, formato YYYY-MM-DD. Se omitida, usa hoje.' },
    data_fim:    { type: 'string', description: 'Data final (inclusive), formato YYYY-MM-DD. Se omitida: igual a data_inicio (ou hoje, se nenhuma data foi passada).' },
  },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const vendasResumo: McpTool = {
  name: 'vendas_resumo',
  description:
    'Resumo de vendas num período: faturamento total, quantidade de pedidos, ' +
    'pizzas grandes/pequenas vendidas e ticket médio. Sem argumentos, retorna o dia de hoje. ' +
    'Faturamento vem direto do total de cada pedido (o mesmo valor que bate com o Cardápio Web).',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const faturamento = pedidos.reduce((s, p) => s + (p.total || 0), 0);
    const qtdPedidos = pedidos.length;

    // Contagem de pizzas exige o mesmo motor de interpretação usado pelo CMV
    // (as colunas cw_pedidos.pizzas_grande/pequena são uma aproximação por
    // regex, conhecida por subcontar — ver js/vendas.js:340-347) — por isso
    // precisa do catálogo (vtp_opcoes) pra resolver sabor.
    const catalogo = await carregarCatalogo(sb);
    let pizzasGrande = 0, pizzasPequena = 0;
    for (const p of pedidos) {
      const { grande, pequena } = contarPizzasPedido(p, catalogo);
      pizzasGrande += grande;
      pizzasPequena += pequena;
    }

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      faturamento_total: round2(faturamento),
      qtd_pedidos: qtdPedidos,
      ticket_medio: qtdPedidos > 0 ? round2(faturamento / qtdPedidos) : 0,
      pizzas_grandes: pizzasGrande,
      pizzas_pequenas: pizzasPequena,
      pizzas_total: pizzasGrande + pizzasPequena,
    };
  },
};

export const vendasPorCanalTool: McpTool = {
  name: 'vendas_por_canal',
  description:
    'Faturamento e quantidade de pedidos por canal de venda (iFood, 99Food, Site/Balcão, Outro) ' +
    'num período. Sem argumentos, retorna o dia de hoje.',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const porCanal: Record<string, { receita: number; qtd_pedidos: number }> = {};
    let totalReceita = 0;
    for (const p of pedidos) {
      const canal = cwMapCanal(p.sales_channel);
      if (!porCanal[canal]) porCanal[canal] = { receita: 0, qtd_pedidos: 0 };
      porCanal[canal].receita += p.total || 0;
      porCanal[canal].qtd_pedidos += 1;
      totalReceita += p.total || 0;
    }

    const canais = Object.entries(porCanal)
      .map(([canal, v]) => ({
        canal,
        nome: CANAL_LABEL[canal] || canal,
        receita: round2(v.receita),
        qtd_pedidos: v.qtd_pedidos,
        pct_faturamento: totalReceita > 0 ? round2((v.receita / totalReceita) * 100) : 0,
      }))
      .sort((a, b) => b.receita - a.receita);

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      faturamento_total: round2(totalReceita),
      canais,
    };
  },
};

// Brasil não tem mais horário de verão desde 2019 — offset fixo -03:00,
// mesma premissa de _shared/periodo.ts.
function horaSaoPaulo(iso: string): number {
  const utcMs = new Date(iso).getTime();
  return new Date(utcMs - 3 * 3600_000).getUTCHours();
}

export const vendasPorHora: McpTool = {
  name: 'vendas_por_hora',
  description:
    'Faturamento e quantidade de pedidos por hora do dia (0-23, horário de São Paulo) num período — ' +
    'identifica os horários de pico de movimento. Sem argumentos, retorna o dia de hoje.',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const porHora: Record<number, { receita: number; qtd_pedidos: number }> = {};
    for (let h = 0; h < 24; h++) porHora[h] = { receita: 0, qtd_pedidos: 0 };
    for (const p of pedidos) {
      const h = horaSaoPaulo(p.cw_created_at);
      porHora[h].receita += p.total || 0;
      porHora[h].qtd_pedidos += 1;
    }

    const horas = Object.entries(porHora).map(([hora, v]) => ({
      hora: Number(hora), receita: round2(v.receita), qtd_pedidos: v.qtd_pedidos,
    }));
    const pico = horas.reduce((max, h) => h.receita > max.receita ? h : max, horas[0]);

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      horas,
      horario_pico: pico.qtd_pedidos > 0 ? pico.hora : null,
    };
  },
};

export const vendasPorBairro: McpTool = {
  name: 'vendas_por_bairro',
  description:
    'Faturamento e quantidade de pedidos por bairro de entrega num período — só considera pedidos ' +
    'delivery (retirada/balcão não tem endereço). Sem argumentos, retorna o dia de hoje. ' +
    'Canais que não mandam o endereço completo (ex.: alguns pedidos de portal/WhatsApp) entram em "Não identificado".',
  inputSchema: PERIODO_SCHEMA,
  async handler(args, sb) {
    const periodo = resolverPeriodo(args.data_inicio as string | undefined, args.data_fim as string | undefined);
    const pedidos = await buscarPedidosOperacaoPeriodo(sb, periodo.inicioISO, periodo.fimISO);

    const delivery = pedidos.filter(p => p.order_type === 'delivery');
    const porBairro: Record<string, { receita: number; qtd_pedidos: number }> = {};
    for (const p of delivery) {
      const bairro = p.delivery_address?.neighborhood?.trim() || 'Não identificado';
      if (!porBairro[bairro]) porBairro[bairro] = { receita: 0, qtd_pedidos: 0 };
      porBairro[bairro].receita += p.total || 0;
      porBairro[bairro].qtd_pedidos += 1;
    }

    const bairros = Object.entries(porBairro)
      .map(([bairro, v]) => ({ bairro, receita: round2(v.receita), qtd_pedidos: v.qtd_pedidos }))
      .sort((a, b) => b.receita - a.receita);

    return {
      periodo: { data_inicio: periodo.inicio, data_fim: periodo.fim },
      pedidos_delivery_considerados: delivery.length,
      bairros,
    };
  },
};

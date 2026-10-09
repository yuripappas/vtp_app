// Port fiel de js/cw-api.js:54-69 (_cwCalcTempos) — mesmo motor que o
// Dashboard usa pra tempo de preparo/entrega, a partir de status_timestamps
// (gravado pelo cw-sync na primeira vez que cada status é observado).
export interface StatusTimestamps { [status: string]: string }

export interface Tempos {
  tempoPreparo: number | null; // minutos: confirmado → pronto
  tempoEntrega: number | null; // minutos: saiu → entregue (só delivery)
  tempoTotal: number | null;   // minutos: confirmado → entregue/fechado
}

export function calcTempos(statusTimestamps: StatusTimestamps | null, orderType: string | null): Tempos {
  const ts = statusTimestamps || {};
  const t = (k: string) => (ts[k] ? new Date(ts[k]).getTime() : null);
  const min = (a: number | null, b: number | null) => (a && b && b >= a) ? Math.round((b - a) / 60000) : null;

  const inicio   = t('confirmed') || t('scheduled_confirmed');
  const pronto   = t('ready') || t('waiting_to_catch');
  const saiu     = t('released');
  const entregue = t('delivered') || t('closed');

  return {
    tempoPreparo: min(inicio, pronto),
    tempoEntrega: orderType === 'delivery' ? min(saiu, entregue) : null,
    tempoTotal:   min(inicio, entregue),
  };
}

// Mesmas metas do Dashboard ao vivo (js/dashboard.js:510-515), aplicadas aqui
// post-hoc sobre a duração já fechada de pedidos concluídos, em vez de sobre
// o tempo decorrido de um pedido ainda em andamento.
export const META_PREPARO_MIN = 20;
export const META_ENTREGA_MIN = 35;

/**
 * VTP Compras — Vai Ter Pizza!
 * cw-api.js — Leitura dos pedidos do Cardápio Web (via Supabase)
 *
 * A captura dos pedidos na API do Cardápio Web não acontece mais aqui no
 * navegador: roda 24/7 numa Edge Function (supabase/functions/cw-sync),
 * agendada via pg_cron a cada 2 minutos, que grava em cw_pedidos —
 * incluindo o timestamp de cada transição de status (status_timestamps),
 * o que permite calcular tempo de preparo/entrega reais (a API do CW só
 * informa o status atual, nunca o histórico).
 *
 * Este módulo só lê a tabela já sincronizada.
 */

let _cwSbClient = null;
function _cwGetSbClient() {
  if (!_cwSbClient) _cwSbClient = supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY);
  return _cwSbClient;
}

// ── Mapeamentos CW → modelo interno do dashboard ───────────────────────────

const CW_STATUS_MAP = {
  waiting_confirmation:   'aguardando',
  pending_payment:        'aguardando',
  pending_online_payment: 'aguardando',
  scheduled_confirmed:    'em_preparo',
  confirmed:              'em_preparo',
  ready:                  'pronto',
  waiting_to_catch:       'pronto',
  released:               'em_rota',
  delivered:              'entregue',
  closed:                 'entregue',
  canceling:              'cancelado',
  canceled:               'cancelado',
};

const CW_CANAL_MAP = {
  ifood:               'ifood',
  food99:              '99food',
  catalog:             'site',
  store_front_catalog: 'site',
  portal:              'site',
  whatsapp_extension:  'site',
};

function _cwMapCanal(salesChannel) {
  return CW_CANAL_MAP[salesChannel] || salesChannel || 'outro';
}

// Tempo de preparo (confirmado → pronto), entrega (saiu → entregue, só
// delivery) e total (confirmado → entregue/fechado), a partir dos
// timestamps de transição de status gravados pelo cw-sync.
function _cwCalcTempos(statusTimestamps, orderType) {
  const ts = statusTimestamps || {};
  const t  = k => ts[k] ? new Date(ts[k]).getTime() : null;
  const min = (a, b) => (a && b && b >= a) ? Math.round((b - a) / 60000) : null;

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

// ── Função principal usada pelo dashboard ─────────────────────────────────
//
// dataInicio/dataFim (Date, opcionais) — período a consultar. Default: hoje.

async function _getPedidosCW(dataInicio, dataFim) {
  const sb = _cwGetSbClient();
  const inicio = (dataInicio || new Date(new Date().setHours(0, 0, 0, 0))).toISOString();
  const fim    = (dataFim    || new Date()).toISOString();

  const { data, error } = await sb
    .from('cw_pedidos')
    .select('*')
    .gte('cw_created_at', inicio)
    .lte('cw_created_at', fim)
    .order('cw_created_at', { ascending: false });

  if (error) {
    const e = new Error(error.message);
    e.code = 'SUPABASE_ERROR';
    throw e;
  }

  const now = new Date();

  return (data || [])
    .filter(d => d.status !== 'canceling' && d.status !== 'canceled')
    .map(d => {
      const created = new Date(d.cw_created_at);
      const mAtrs   = Math.max(0, Math.round((now - created) / 60000));
      const tempos  = _cwCalcTempos(d.status_timestamps, d.order_type);

      return {
        id:     d.id,
        num:    `#${d.display_id ?? d.id}`,
        canal:  _cwMapCanal(d.sales_channel),
        tipo:   d.order_type === 'delivery' ? 'entrega' : 'retirada',
        status: CW_STATUS_MAP[d.status] || 'aguardando',
        valor:  d.total || 0,
        ts:     created,
        hora:   created.getHours(),
        mAtrs,
        pizzasGrande:  d.pizzas_grande || 0,
        pizzasPequena: d.pizzas_pequena || 0,
        pizzas:        (d.pizzas_grande || 0) + (d.pizzas_pequena || 0),
        tempoPreparo:  tempos.tempoPreparo,
        tempoEntrega:  tempos.tempoEntrega,
        tempoTotal:    tempos.tempoTotal,
        items:  d.items || [],
      };
    })
    .sort((a, b) => b.ts - a.ts);
}

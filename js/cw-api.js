/**
 * VTP Compras — Vai Ter Pizza!
 * cw-api.js — Integração com a API de Pedidos do Cardápio Web
 *
 * Documentação: https://cardapioweb.stoplight.io/docs/api
 * Token configurado em Configurações → Integrações (cfg.codLoja).
 *
 * Endpoints usados:
 *  - GET /orders          → pedidos modificados nas últimas 8h (qualquer status)
 *  - GET /orders/{id}     → detalhe completo do pedido (valor, itens, pagamento)
 *
 * CORS da API é aberto (Access-Control-Allow-Origin: *), permitindo chamada
 * direta do navegador sem backend/proxy.
 */

const CW_API_BASE = 'https://integracao.cardapioweb.com/api/partner/v1';
const CW_CACHE_KEY = 'vtp_cw_order_cache';

function _cwApiKey() {
  return (getConfig().codLoja || '').trim();
}

async function _cwFetch(path) {
  const key = _cwApiKey();
  if (!key) {
    const e = new Error('Token da API Cardápio Web não configurado');
    e.code = 'NO_TOKEN';
    throw e;
  }

  let res;
  try {
    res = await fetch(`${CW_API_BASE}${path}`, {
      headers: { 'X-API-KEY': key, 'Accept': 'application/json' },
    });
  } catch (netErr) {
    const e = new Error('Falha de rede ao conectar com a API Cardápio Web');
    e.code = 'NETWORK_ERROR';
    throw e;
  }

  if (!res.ok) {
    const e = new Error(`Cardápio Web API: HTTP ${res.status}`);
    e.code   = res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR';
    e.status = res.status;
    throw e;
  }
  return res.json();
}

function cwGetOpenOrders() {
  return _cwFetch('/orders');
}

function cwGetOrderDetail(id) {
  return _cwFetch(`/orders/${id}`);
}

// ── Cache de detalhes (evita refetch de pedidos não modificados) ──────────

function _cwCacheGet() { return db._get(CW_CACHE_KEY, {}); }
function _cwCacheSet(cache) { db._set(CW_CACHE_KEY, cache); }

async function _cwGetOrderDetailCached(summary, cache) {
  const hit = cache[summary.id];
  if (hit && hit.updated_at === summary.updated_at) return hit.detail;
  const detail = await cwGetOrderDetail(summary.id);
  cache[summary.id] = { updated_at: summary.updated_at, detail };
  return detail;
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
  delivered:               'entregue',
  closed:                  'entregue',
  canceling:               'cancelado',
  canceled:                'cancelado',
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

// Conta unidades de itens cujo nome (ou grupo de opções, caso de promoções/combos)
// contém "pizza" — base para o KPI "Pizzas vendidas".
// items completo fica anexado em cada pedido para uso futuro (cruzamento com insumos).
function _cwItemEhPizza(it) {
  if (/pizza/i.test(it.name || '')) return true;
  return (it.options || []).some(op => /pizza/i.test(op.option_group_name || '') || /pizza/i.test(op.name || ''));
}

function _cwContaPizzas(items) {
  return (items || [])
    .filter(it => it.status !== 'canceled' && _cwItemEhPizza(it))
    .reduce((s, it) => s + (it.quantity || 0), 0);
}

// ── Função principal usada pelo dashboard ─────────────────────────────────

async function _getPedidosCW() {
  const summaries = await cwGetOpenOrders();
  const cache = _cwCacheGet();
  const now = new Date();

  const pedidos = [];
  for (const s of summaries) {
    if (s.status === 'canceling' || s.status === 'canceled') continue;

    let det;
    try {
      det = await _cwGetOrderDetailCached(s, cache);
    } catch (e) {
      console.warn('[cw-api] Falha ao buscar detalhe do pedido', s.id, e.message);
      continue;
    }

    const created = new Date(det.created_at);
    const mAtrs   = Math.max(0, Math.round((now - created) / 60000));

    pedidos.push({
      id:     det.id,
      num:    `#${det.display_id ?? det.id}`,
      canal:  _cwMapCanal(det.sales_channel),
      tipo:   det.order_type === 'delivery' ? 'entrega' : 'retirada',
      status: CW_STATUS_MAP[det.status] || 'aguardando',
      valor:  det.total || 0,
      ts:     created,
      hora:   created.getHours(),
      mAtrs,
      pizzas: _cwContaPizzas(det.items),
      items:  det.items || [],
    });
  }

  _cwCacheSet(cache);
  return pedidos.sort((a, b) => b.ts - a.ts);
}

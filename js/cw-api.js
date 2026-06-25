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

// ── Contagem de pizzas grandes/pequenas ────────────────────────────────────
//
// Validado contra pedidos reais da loja. Existem dois mecanismos de venda:
//
// 1) Meio a meio ("Monte seu sabor" e combos que puxam dele): o grupo de
//    opções se chama literalmente "Pizza Grande (N Pedaços)..." ou
//    "Pizza Pequena (N Pedaços)...". Cada metade é 1 opção (ou 1 opção com
//    quantity:2 quando o cliente não divide o sabor) — soma das quantities
//    do grupo ÷ 2 = pizzas grandes. Pequena nunca divide (1 seleção = 1 pizza).
//
// 2) Sabor fixo com tamanho no nome da opção ("PIZZA SALGADA - CALABRESA" →
//    opção "Calabresa | Pizza Grande") e brindes de promoção ("GRÁTIS - Pizza
//    Salgada Grande - Tradicionais", "ESCOLHA SUA PIZZA DOCE GRÁTIS"): o
//    grupo não tem "Pizza Grande/Pequena" no nome, mas a OPÇÃO escolhida tem
//    o sufixo "| Pizza Grande" / "| Pizza Pequena". Cada opção = 1 pizza
//    inteira, sem dividir.
//
// Em ambos os casos, o resultado é multiplicado por item.quantity (a opção
// descreve a composição de 1 unidade do item; item.quantity multiplica).
// Combos (kind:"combo") têm os itens reais aninhados em item.items — a
// contagem é recursiva. option_group_id NÃO é estável entre produtos
// equivalentes, então a classificação é sempre por nome (regex), nunca por id.

const _CW_RE_GRUPO_GRANDE  = /^pizza grande\s*\(/i;
const _CW_RE_GRUPO_PEQUENA = /^pizza pequena\s*\(/i;
const _CW_RE_SUFIXO_GRANDE  = /\|\s*pizza grande\b/i;
const _CW_RE_SUFIXO_PEQUENA = /\|\s*pizza pequena\b/i;

// Pizzas de UMA unidade do item (antes de multiplicar por item.quantity).
function _cwContaPizzasItem(it) {
  const grupos = {}; // chave -> { tipo, dividir, qty }

  for (const op of (it.options || [])) {
    const gNome = op.option_group_name || '';
    const oNome = op.name || '';
    let tipo, dividir;

    if (_CW_RE_GRUPO_GRANDE.test(gNome))       { tipo = 'grande';  dividir = true;  }
    else if (_CW_RE_GRUPO_PEQUENA.test(gNome)) { tipo = 'pequena'; dividir = false; }
    else if (_CW_RE_SUFIXO_GRANDE.test(oNome) || _CW_RE_SUFIXO_GRANDE.test(gNome))   { tipo = 'grande';  dividir = false; }
    else if (_CW_RE_SUFIXO_PEQUENA.test(oNome) || _CW_RE_SUFIXO_PEQUENA.test(gNome)) { tipo = 'pequena'; dividir = false; }
    else continue;

    const chave = `${op.option_group_id ?? gNome}|${tipo}`;
    grupos[chave] = grupos[chave] || { tipo, dividir, qty: 0 };
    grupos[chave].qty += (op.quantity || 1);
  }

  let grande = 0, pequena = 0;
  for (const g of Object.values(grupos)) {
    const n = g.dividir ? g.qty / 2 : g.qty;
    if (g.tipo === 'grande') grande += n; else pequena += n;
  }

  // Fallback: item sem opções com sabor já embutido no próprio nome
  // (observado raramente em pedidos vindos de marketplace).
  if (!grande && !pequena && !(it.options || []).length) {
    if (_CW_RE_GRUPO_GRANDE.test(it.name || '') || _CW_RE_SUFIXO_GRANDE.test(it.name || ''))  grande = 1;
    else if (_CW_RE_GRUPO_PEQUENA.test(it.name || '') || _CW_RE_SUFIXO_PEQUENA.test(it.name || '')) pequena = 1;
  }

  return { grande, pequena };
}

function _cwContaPizzas(items) {
  let grande = 0, pequena = 0;
  for (const it of (items || [])) {
    if (it.status === 'canceled') continue;
    const mult = it.quantity || 1;
    const own = _cwContaPizzasItem(it);
    grande += own.grande * mult;
    pequena += own.pequena * mult;

    if (it.items && it.items.length) {
      const sub = _cwContaPizzas(it.items);
      grande += sub.grande * mult;
      pequena += sub.pequena * mult;
    }
  }
  return { grande, pequena, total: grande + pequena };
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

    const pz = _cwContaPizzas(det.items);

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
      pizzasGrande:  pz.grande,
      pizzasPequena: pz.pequena,
      pizzas:        pz.total,
      items:  det.items || [],
    });
  }

  _cwCacheSet(cache);
  return pedidos.sort((a, b) => b.ts - a.ts);
}

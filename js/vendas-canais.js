/**
 * VTP Compras — Vai Ter Pizza!
 * vendas-canais.js — Vendas por canal: Geral · Por canal (extrato) · Repasses · Paridade
 *
 * Regras calibradas com os extratos oficiais da semana 12–18/10/2026 (bateram
 * no centavo com os pedidos do Cardápio Web):
 *
 * iFood — base = itens + entrega própria − promoções da loja
 *   comissão entrega própria 12% · retirada 12% · entrega parceira (iFood) 24%
 *   sobre itens − promoções; pagamento online 3,2% sobre a mesma base;
 *   anúncios (R$/semana); iFood Pago = antecipação (% sobre o repasse).
 * 99Food — comissão 10% sobre itens − promoções da loja; custo logístico por
 *   entrega feita pela 99 (~R$ 7,67); taxa de pagamento ~3% do pago online.
 *   Promoções do CW já vêm líquidas da contribuição da 99 (inclui frete grátis).
 * Site — taxa por forma de pagamento (% + fixo por transação) e prazo:
 *   Pix automático (Tuna) R$ 0,50 por pedido, D+1 até 12h; cartão online
 *   (Mercado Pago) 4,89%, na hora.
 *
 * Cada pedido é separado em PRODUTO e LOGÍSTICA:
 *   Produto   = itens − promoções da loja − comissão (parte do produto) − pagamento
 *   Logística = taxa de entrega recebida − motoboy − custo logístico da plataforma
 *               − comissão que incide sobre a entrega (e o adicional da entrega parceira)
 *   Líquido   = o que a plataforma/gateway entrega para a loja
 *   Resultado = líquido − motoboy − CMV − impostos − serviços fixos − antecipação
 */

const VC_PAGTO_LABEL = {
  pix_auto: 'Pix automático', pix: 'Pix (direto)', credit_card: 'Crédito (maquininha)', debit_card: 'Débito (maquininha)',
  online_credit_card: 'Cartão de crédito online', money: 'Dinheiro', debt_book: 'Fiado / conta', voucher: 'Voucher',
  ifood: 'iFood (online)', food99: '99Food (online)', food99_voucher: '99Food Voucher',
};
const VC_CANAIS_PADRAO = ['ifood', '99food', 'site'];
const VC_META_LOGISTICA = 9; // % do faturamento

// ── Configuração dos canais ───────────────────────────────────

const _VC_PADRAO = {
  ifood: { nome: 'iFood', tipo: 'marketplace', modelo: 'ifood',
    comissaoPropriaPct: 12, comissaoRetiradaPct: 12, comissaoParceiraPct: 24, taxaPagamentoPct: 3.2,
    anunciosSemana: 50, antecipacaoPct: 2, mensalidade: 0, impostoPct: 6, contarMotoboy: true, repasseDias: 3 },
  '99food': { nome: '99Food', tipo: 'marketplace', modelo: '99food',
    comissaoPct: 10, custoLogisticoEntrega: 7.67, taxaPagamentoPct: 3,
    anunciosSemana: 0, antecipacaoPct: 0, mensalidade: 0, impostoPct: 6, contarMotoboy: true, repasseDias: 3 },
  site: { nome: 'Site / loja própria', tipo: 'proprio', modelo: 'site', mensalidade: 0, impostoPct: 6, contarMotoboy: true,
    metodos: {
      pix_auto:           { pct: 0,    fixo: 0.5, prazo: 'D+1 até 12h (Tuna)' },
      online_credit_card: { pct: 4.89, fixo: 0,   prazo: 'Na hora (Mercado Pago)' },
      credit_card:        { pct: 0,    fixo: 0,   prazo: '' },
      debit_card:         { pct: 0,    fixo: 0,   prazo: '' },
      pix:                { pct: 0,    fixo: 0,   prazo: 'Na hora' },
      money:              { pct: 0,    fixo: 0,   prazo: 'Na hora' },
      debt_book:          { pct: 0,    fixo: 0,   prazo: 'Quando o cliente pagar' },
    } },
};

function vcConfig() {
  const salvo = db._get('vtp_canais_config', null) || {};
  const out = {};
  for (const [k, def] of Object.entries(_VC_PADRAO)) {
    const s = salvo[k] || {};
    out[k] = { ...def, ...s };
    if (def.metodos) {
      out[k].metodos = {};
      for (const [m, d] of Object.entries(def.metodos)) {
        const v = s.metodos?.[m];
        out[k].metodos[m] = typeof v === 'number' ? { ...d, pct: v } : { ...d, ...(v || {}) };
      }
    }
  }
  for (const [k, s] of Object.entries(salvo)) if (!out[k]) out[k] = s;
  return out;
}
function vcSalvarConfig(cfg) { db._set('vtp_canais_config', cfg); }
const vcCanalCfg = c => vcConfig()[c] || { nome: c, tipo: 'proprio', modelo: 'site', metodos: {}, impostoPct: 0, contarMotoboy: true };
const vcNomeCanal = c => vcCanalCfg(c).nome || c;

// ── Dados ─────────────────────────────────────────────────────

const _vcCache = {};
async function vcCarregarPedidos(iniISO, fimISO, forcar = false) {
  const chave = iniISO + '|' + fimISO;
  if (_vcCache[chave] && !forcar) return _vcCache[chave];
  const sb = _cwGetSbClient();
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('cw_pedidos')
      .select('id, display_id, external_display_id, status, sales_channel, order_type, total, items, delivery_fee, driver_fee, service_fee, additional_fee, delivered_by, discounts, payments, financeiro_em, cw_created_at')
      .gte('cw_created_at', iniISO).lte('cw_created_at', fimISO).order('cw_created_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const cfg = vcConfig();
  _vcCache[chave] = out.filter(p => p.status !== 'canceled' && p.status !== 'canceling').map(p => vcCalcPedido(p, cfg));
  return _vcCache[chave];
}

const _n = v => Number(v) || 0;
const _r2 = v => Math.round(v * 100) / 100;

function vcCalcPedido(p, cfgTodos) {
  const canal = typeof _cwMapCanal === 'function' ? _cwMapCanal(p.sales_channel) : p.sales_channel;
  const c = cfgTodos[canal] || vcCanalCfg(canal);
  const mkt = c.tipo === 'marketplace';
  const desc = Array.isArray(p.discounts) ? p.discounts : [];
  const descLoja = desc.filter(d => d.sponsorship === 'merchant' || !d.sponsorship).reduce((s, d) => s + _n(d.total), 0);
  const descPlat = desc.filter(d => d.sponsorship && d.sponsorship !== 'merchant').reduce((s, d) => s + _n(d.total), 0);
  const entrega = _n(p.delivery_fee), servico = _n(p.service_fee) + _n(p.additional_fee);
  const total = _n(p.total);
  const itens = total + descLoja + descPlat - entrega - servico;
  const retirada = p.order_type === 'takeout' || p.order_type === 'onsite';
  const entregaPropria = !retirada && (!p.delivered_by || p.delivered_by === 'merchant');
  const entregaPlataforma = !retirada && !entregaPropria;
  const entregaRecebida = entregaPropria ? entrega : 0;
  const servicoLoja = mkt ? 0 : servico;                 // nos marketplaces a taxa de serviço fica com a plataforma
  const pags = Array.isArray(p.payments) ? p.payments : [];
  const online = pags.filter(x => x.payment_type === 'online').reduce((s, x) => s + _n(x.total), 0);
  const direto = mkt ? pags.filter(x => x.payment_type !== 'online').reduce((s, x) => s + _n(x.total), 0) : 0;

  let comissaoProd = 0, comissaoLog = 0, taxaPag = 0, custoLogPlat = 0, modalidade = retirada ? 'retirada' : entregaPropria ? 'propria' : 'plataforma';
  const pagDet = [];  // por forma de pagamento: { metodo, valor, taxa }
  if (c.modelo === 'ifood') {
    if (retirada) {
      const base = itens - descLoja;
      comissaoProd = base * _n(c.comissaoRetiradaPct) / 100;
      taxaPag = base * _n(c.taxaPagamentoPct) / 100;
    } else if (entregaPropria) {
      const base = itens + entrega - descLoja;
      const com = base * _n(c.comissaoPropriaPct) / 100;
      comissaoLog = base > 0 ? com * entrega / base : 0;   // comissão que incide sobre a entrega = logística
      comissaoProd = com - comissaoLog;
      taxaPag = base * _n(c.taxaPagamentoPct) / 100;
    } else {
      const base = itens - descLoja;
      comissaoProd = base * _n(c.comissaoPropriaPct) / 100;                                       // parte "produto"
      comissaoLog = base * (_n(c.comissaoParceiraPct) - _n(c.comissaoPropriaPct)) / 100;          // adicional da entrega parceira
      taxaPag = base * _n(c.taxaPagamentoPct) / 100;
    }
  } else if (c.modelo === '99food') {
    comissaoProd = (itens - descLoja) * _n(c.comissaoPct) / 100;
    taxaPag = online * _n(c.taxaPagamentoPct) / 100;
    if (entregaPlataforma) custoLogPlat = _n(c.custoLogisticoEntrega);
  } else if (mkt) {
    comissaoProd = (itens - descLoja) * _n(c.comissaoPct) / 100;
    taxaPag = online * _n(c.taxaPagamentoPct) / 100;
  } else {
    for (const x of pags) {
      const m = (c.metodos || {})[x.payment_method] || {};
      const t = _n(x.total) * _n(m.pct) / 100 + (_n(x.total) > 0 ? _n(m.fixo) : 0) + _n(x.payment_fee);
      taxaPag += t;
      pagDet.push({ metodo: x.payment_method, valor: _n(x.total), taxa: t });
    }
  }
  if (mkt) {
    // taxa de pagamento da plataforma rateada pelas formas de pagamento do pedido
    const totPag = pags.reduce((s, x) => s + _n(x.total), 0) || 1;
    for (const x of pags) pagDet.push({ metodo: x.payment_method, valor: _n(x.total), taxa: x.payment_type === 'online' ? taxaPag * _n(x.total) / (online || totPag) : 0 });
  }

  const liquido = itens + entregaRecebida + servicoLoja - descLoja - comissaoProd - comissaoLog - taxaPag - custoLogPlat;
  const motoboy = c.contarMotoboy !== false && entregaPropria ? _n(p.driver_fee) : 0;
  const produto = itens + servicoLoja - descLoja - comissaoProd - taxaPag;
  const logistica = entregaRecebida - comissaoLog - custoLogPlat - motoboy;            // normalmente negativo (custo)
  const custoLogistica = comissaoLog + custoLogPlat + motoboy;                           // custo bruto
  let cmv = 0;
  try { for (const l of _vInterpretarPedido(p)) cmv += vendasCustoLinha(l); } catch (_) {}
  const faturamento = itens + entregaRecebida + servicoLoja;
  const imposto = (faturamento - descLoja) * _n(c.impostoPct) / 100;
  return {
    id: p.id, num: p.display_id, numExterno: p.external_display_id, canal, ts: p.cw_created_at, modalidade,
    semFinanceiro: !p.financeiro_em, total, itens, entrega, entregaRecebida, servico, servicoLoja, descLoja, descPlat,
    comissaoProd, comissaoLog, comissao: comissaoProd + comissaoLog, taxaPag, custoLogPlat, liquido, direto,
    repasse: mkt ? liquido - direto : 0, motoboy, produto, logistica, custoLogistica, cmv, imposto, faturamento,
    resultado: liquido - motoboy - cmv - imposto, pagDet, _p: p,
    pagamentos: pags.map(x => VC_PAGTO_LABEL[x.payment_method] || x.payment_method).join(', '),
  };
}

const _VC_CAMPOS = ['total', 'itens', 'entregaRecebida', 'servicoLoja', 'descLoja', 'descPlat', 'comissaoProd', 'comissaoLog', 'comissao', 'taxaPag',
  'custoLogPlat', 'liquido', 'direto', 'repasse', 'motoboy', 'produto', 'logistica', 'custoLogistica', 'cmv', 'imposto', 'faturamento', 'resultado'];

function vcSomar(lista) {
  const s = { pedidos: 0, semFinanceiro: 0, porModalidade: { propria: 0, plataforma: 0, retirada: 0 } };
  _VC_CAMPOS.forEach(k => { s[k] = 0; });
  for (const p of lista) {
    s.pedidos++;
    _VC_CAMPOS.forEach(k => { s[k] += p[k] || 0; });
    if (p.semFinanceiro) s.semFinanceiro++;
    s.porModalidade[p.modalidade] = (s.porModalidade[p.modalidade] || 0) + 1;
  }
  return s;
}

// Custos do canal que não são por pedido: anúncios (R$/semana), mensalidade
// (R$/mês) e antecipação (% sobre o repasse — iFood Pago)
function vcFixos(canal, s, iniISO, fimISO) {
  const c = vcCanalCfg(canal);
  const dias = Math.max(1, Math.round((new Date(fimISO) - new Date(iniISO)) / 864e5));
  const anuncios = _n(c.anunciosSemana) * dias / 7;
  const mensalidade = _n(c.mensalidade) * dias / 30;
  const antecipacao = c.tipo === 'marketplace' ? Math.max(0, s.repasse - anuncios - mensalidade) * _n(c.antecipacaoPct) / 100 : 0;
  return { anuncios, mensalidade, antecipacao, total: anuncios + mensalidade + antecipacao };
}

function vcResumoCanal(peds, canal, iniISO, fimISO) {
  const s = vcSomar(peds.filter(p => p.canal === canal));
  const f = vcFixos(canal, s, iniISO, fimISO);
  return { canal, ...s, fixos: f, liquidoFinal: s.liquido - f.total, resultadoFinal: s.resultado - f.total,
    taxas: s.comissaoProd + s.taxaPag + f.anuncios + f.mensalidade };
}

const _vcR = v => (v < -0.004 ? '−' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _vcPct = (v, b) => b > 0 ? (v / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
const _vcEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function _vcKpi(t, v, sub = '', cor = 'var(--text)') {
  return `<div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:14px 18px">
    <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${t}</div>
    <div style="font-size:var(--text-2xl);font-weight:800;color:${cor};margin-top:4px">${v}</div>
    ${sub ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${sub}</div>` : ''}</div>`;
}
function _vcAvisoBackfill(s) {
  return s.semFinanceiro ? `<div style="display:flex;gap:8px;padding:10px 14px;border-radius:var(--r8);background:var(--warning-bg);color:var(--warning-fg);font-size:var(--text-sm);margin-bottom:14px">
    ${lc('info', 14, 'currentColor')}<div>${s.semFinanceiro} pedido(s) do período ainda sem os detalhes de taxas e descontos (estão sendo buscados no Cardápio Web). Recarregue em alguns minutos.</div></div>` : '';
}
function _vcFiltros(ns, fn, extra = '') {
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
    ${_perRenderBar(ns, fn)}${extra}
    <button class="btn btn-outline btn-xs" style="margin-left:auto" onclick="vcRecarregar('${ns}', '${fn}')">${lc('refresh-cw', 12, 'currentColor')} Atualizar</button>
  </div>`;
}
function vcRecarregar(ns, fn) {
  const r = _perRange(ns); delete _vcCache[r.inicioISO + '|' + r.fimISO];
  window[fn]();
}
// Bloco de extrato: título + linhas (+/−) + total
function _vcBloco(titulo, linhas, total, corTotal = '') {
  const vis = linhas.filter(Boolean);
  if (!vis.length && total === undefined) return '';
  return `<div style="padding:12px 0;border-top:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;gap:10px;font-weight:800;font-size:var(--text-md)">
      <span>${titulo}</span>${total !== undefined ? `<span style="white-space:nowrap;${corTotal}">${_vcR(total)}</span>` : ''}</div>
    ${vis.map(([t, v, sub, tipo]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0 0 14px;font-size:var(--text-sm)">
      <span style="color:var(--text2)">${t}${sub ? ` <span style="color:var(--muted);font-size:var(--text-xs)">· ${sub}</span>` : ''}</span>
      <span style="white-space:nowrap;color:${tipo === 'info' ? 'var(--muted)' : v < -0.004 ? 'var(--danger-fg)' : v > 0.004 ? 'var(--success-fg)' : 'var(--muted)'}">${tipo === 'info' ? '' : v > 0.004 ? '+ ' : ''}${_vcR(v)}</span></div>`).join('')}
  </div>`;
}
const _vcCorLog = pct => pct === null ? 'var(--text)' : pct <= VC_META_LOGISTICA ? 'var(--success-fg)' : 'var(--danger-fg)';

// ══════════════════════════════════════════════════════════════
// ABA GERAL
// ══════════════════════════════════════════════════════════════

let _vcChartGeral = null;

async function renderVendasGeral() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  if (!_per('vgeral').de) _perSetPresetSilencioso('vgeral', 'semana');
  el.innerHTML = _vcFiltros('vgeral', 'renderVendasGeral') + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw', 18, 'currentColor')} Calculando as vendas…</div>`;
  const r = _perRange('vgeral');
  let peds;
  try { peds = await vcCarregarPedidos(r.inicioISO, r.fimISO); }
  catch (e) { el.innerHTML = _vcFiltros('vgeral', 'renderVendasGeral') + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${_vcEsc(e.message)}</div>`; return; }
  const tot = vcSomar(peds);
  const canais = [...new Set([...VC_CANAIS_PADRAO, ...peds.map(p => p.canal)])].map(c => vcResumoCanal(peds, c, r.inicioISO, r.fimISO)).filter(c => c.pedidos);
  const fix = canais.reduce((a, c) => ({ anuncios: a.anuncios + c.fixos.anuncios, mensalidade: a.mensalidade + c.fixos.mensalidade, antecipacao: a.antecipacao + c.fixos.antecipacao }), { anuncios: 0, mensalidade: 0, antecipacao: 0 });
  const fat = tot.faturamento;
  const logPct = fat > 0 ? tot.custoLogistica / fat * 100 : null;
  const resultado = tot.resultado - fix.anuncios - fix.mensalidade - fix.antecipacao;
  const th = (t, al = 'right') => `<th style="padding:10px 12px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${t}</th>`;
  const td = (v, extra = '') => `<td style="padding:10px 12px;text-align:right;white-space:nowrap;${extra}">${v}</td>`;

  // Formas de pagamento (todos os canais)
  const fp = {};
  peds.forEach(p => p.pagDet.forEach(x => {
    const k = x.metodo || 'nao_informado';
    const f = fp[k] || (fp[k] = { metodo: k, valor: 0, pedidos: 0, taxa: 0 });
    f.valor += x.valor; f.pedidos++; f.taxa += x.taxa;
  }));
  const metodos = vcCanalCfg('site').metodos || {};
  const formas = Object.values(fp).sort((a, b) => b.valor - a.valor);

  el.innerHTML = _vcFiltros('vgeral', 'renderVendasGeral') + `
    ${_vcAvisoBackfill(tot)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px">
      ${_vcKpi('Faturamento', _vcR(fat), `${tot.pedidos} pedidos · ticket ${_vcR(tot.pedidos ? tot.total / tot.pedidos : 0)}`)}
      ${_vcKpi('Promoções da loja', _vcR(tot.descLoja), `${_vcPct(tot.descLoja, fat)} · plataformas pagaram ${_vcR(tot.descPlat)}`, 'var(--orange-dark)')}
      ${_vcKpi('Taxas e comissões', _vcR(tot.comissaoProd + tot.taxaPag + fix.anuncios + fix.mensalidade), `${_vcPct(tot.comissaoProd + tot.taxaPag + fix.anuncios + fix.mensalidade, fat)} · comissão, pagamento, anúncios`, 'var(--orange-dark)')}
      ${_vcKpi('Antecipação', _vcR(fix.antecipacao), 'iFood Pago e similares', fix.antecipacao ? 'var(--orange-dark)' : 'var(--text)')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="margin:0;padding:16px 18px">
        <div style="font-size:var(--text-lg);font-weight:800">Produto</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">o que sobra das vendas dos itens</div>
        ${_vcBloco('Itens vendidos', [], tot.itens + tot.servicoLoja)}
        ${_vcBloco('Descontos e taxas sobre o produto', [['Promoções da loja', -tot.descLoja], ['Comissões (parte do produto)', -tot.comissaoProd], ['Formas de pagamento', -tot.taxaPag]])}
        ${_vcBloco('Líquido do produto', [], tot.produto, 'color:var(--info-fg)')}
        <div style="font-size:var(--text-sm);color:var(--text2)">${_vcPct(tot.produto, tot.itens + tot.servicoLoja)} do valor dos itens fica para a loja</div>
      </div>
      <div class="card" style="margin:0;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div><div style="font-size:var(--text-lg);font-weight:800">Logística</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">meta: custo até ${VC_META_LOGISTICA}% do faturamento</div></div>
          <div style="text-align:right"><div style="font-size:var(--text-2xl);font-weight:800;color:${_vcCorLog(logPct)}">${logPct === null ? '—' : logPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">do faturamento</div></div>
        </div>
        ${_vcBloco('Custo de logística', [['Motoboy (entregas próprias)', -tot.motoboy], ['Entrega da plataforma (99)', -tot.custoLogPlat], ['Comissão sobre entrega / entrega parceira', -tot.comissaoLog]], -tot.custoLogistica)}
        ${_vcBloco('Taxa de entrega cobrada do cliente', [], tot.entregaRecebida)}
        ${_vcBloco('Resultado da logística', [], tot.logistica, `color:${tot.logistica < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:18px">
      ${_vcKpi('CMV', _vcR(tot.cmv), `${_vcPct(tot.cmv, fat)} do faturamento`)}
      ${_vcKpi('Impostos', _vcR(tot.imposto), _vcPct(tot.imposto, fat))}
      ${_vcKpi('Resultado', _vcR(resultado), `margem ${_vcPct(resultado, fat)}`, resultado < 0 ? 'var(--danger-fg)' : 'var(--success-fg)')}
    </div>
    <div class="card" style="margin:0 0 16px;overflow-x:auto">
      <div style="padding:14px 16px;font-size:var(--text-md);font-weight:800;border-bottom:1.5px solid var(--border)">Por canal</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md);min-width:1100px">
        <thead style="background:var(--surface2)"><tr>${th('Canal', 'left')}${th('Pedidos')}${th('Faturamento')}${th('Promoções')}${th('Taxas')}${th('Produto líq.')}${th('% produto')}${th('Logística')}${th('% logística')}${th('Antecipação')}${th('CMV')}${th('Resultado')}${th('Margem')}<th></th></tr></thead>
        <tbody>${canais.map(c => { const lp = c.faturamento > 0 ? c.custoLogistica / c.faturamento * 100 : null; return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:700">${_vcEsc(vcNomeCanal(c.canal))}</td>
          ${td(c.pedidos)}${td(_vcR(c.faturamento), 'font-weight:600')}${td(_vcR(-c.descLoja), 'color:var(--orange-dark)')}${td(_vcR(-c.taxas), 'color:var(--orange-dark)')}
          ${td(_vcR(c.produto), 'font-weight:600')}${td(_vcPct(c.produto, c.itens + c.servicoLoja))}
          ${td(_vcR(-c.custoLogistica))}${td(lp === null ? '—' : lp.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', `font-weight:700;color:${_vcCorLog(lp)}`)}
          ${td(c.fixos.antecipacao ? _vcR(-c.fixos.antecipacao) : '—', 'color:var(--text2)')}${td(_vcR(c.cmv), 'color:var(--text2)')}
          ${td(_vcR(c.resultadoFinal), `font-weight:800;color:${c.resultadoFinal < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}${td(_vcPct(c.resultadoFinal, c.faturamento), 'font-weight:700')}
          <td style="padding:10px 12px"><button class="btn btn-ghost btn-xs" onclick="_vcCanalSel='${c.canal}';_vdSetAba('canal')">Extrato ${lc('chevron-right', 12, 'currentColor')}</button></td></tr>`; }).join('')
          || `<tr><td colspan="14" style="padding:30px;text-align:center;color:var(--muted)">Sem vendas no período</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card" style="margin:0 0 16px;overflow-x:auto">
      <div style="padding:14px 16px;border-bottom:1.5px solid var(--border)"><div style="font-size:var(--text-md);font-weight:800">Formas de pagamento</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">Taxas do site configuradas em "Configurar canal" › Site. Nos apps, a taxa é a de pagamento online da plataforma.</div></div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md);min-width:760px">
        <thead style="background:var(--surface2)"><tr>${th('Forma', 'left')}${th('Pedidos')}${th('Faturamento')}${th('Ticket')}${th('Taxa')}${th('% efetivo')}${th('Líquido')}${th('Recebimento', 'left')}</tr></thead>
        <tbody>${formas.map(f => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:600">${_vcEsc(VC_PAGTO_LABEL[f.metodo] || f.metodo)}</td>
          ${td(f.pedidos)}${td(_vcR(f.valor))}${td(_vcR(f.pedidos ? f.valor / f.pedidos : 0), 'color:var(--text2)')}
          ${td(f.taxa ? _vcR(-f.taxa) : '—', 'color:var(--orange-dark)')}${td(_vcPct(f.taxa, f.valor))}${td(_vcR(f.valor - f.taxa), 'font-weight:600')}
          <td style="padding:10px 12px;color:var(--text2);font-size:var(--text-sm)">${_vcEsc(metodos[f.metodo]?.prazo || (['ifood', 'food99', 'food99_voucher'].includes(f.metodo) ? 'No repasse semanal' : ''))}</td></tr>`).join('')
          || `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--muted)">Sem pagamentos no período</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card" style="padding:16px;margin:0">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:10px">Para onde vai cada real faturado, por canal</div>
      <div style="height:${Math.max(160, canais.length * 56)}px"><canvas id="vcChartGeral"></canvas></div>
    </div>`;

  if (typeof Chart === 'undefined' || !document.getElementById('vcChartGeral')) return;
  _vcChartGeral?.destroy();
  const css = getComputedStyle(document.body), cor = (v, d) => css.getPropertyValue(v).trim() || d;
  const ds = (label, fn, c) => ({ label, data: canais.map(x => +Math.max(0, fn(x)).toFixed(2)), backgroundColor: c, borderRadius: 3 });
  _vcChartGeral = new Chart(document.getElementById('vcChartGeral'), {
    type: 'bar',
    data: { labels: canais.map(c => vcNomeCanal(c.canal)), datasets: [
      ds('CMV', x => x.cmv, '#B4B2A9'), ds('Promoções da loja', x => x.descLoja, cor('--chart-2', '#DC7A9E')), ds('Taxas e comissões', x => x.taxas, cor('--chart-3', '#D97706')),
      ds('Logística', x => x.custoLogistica, '#8B8FA3'), ds('Antecipação', x => x.fixos.antecipacao, '#C4B5FD'), ds('Impostos', x => x.imposto, cor('--chart-5', '#2563EB')),
      ds('Resultado', x => x.resultadoFinal, cor('--chart-4', '#16A34A')),
    ] },
    options: { indexAxis: 'y', maintainAspectRatio: false,
      scales: { x: { stacked: true, ticks: { callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } }, y: { stacked: true } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${_vcR(c.raw)}` } } } },
  });
}

// ══════════════════════════════════════════════════════════════
// ABA POR CANAL — extrato em blocos (como os portais)
// ══════════════════════════════════════════════════════════════

let _vcCanalSel = 'ifood';
let _vcPedLimite = 100;

async function renderVendasPorCanal() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  if (!_per('vcanal').de) _perSetPresetSilencioso('vcanal', 'semana');
  const chips = () => VC_CANAIS_PADRAO.map(c => { const on = _vcCanalSel === c; return `<button onclick="_vcCanalSel='${c}';_vcPedLimite=100;renderVendasPorCanal()" style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
    border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${_vcEsc(vcNomeCanal(c))}</button>`; }).join('');
  const c = vcCanalCfg(_vcCanalSel), mkt = c.tipo === 'marketplace';
  // Marketplaces trabalham por ciclo (seg–dom), o mesmo do extrato da plataforma
  const barra = (temExtrato = false) => mkt
    ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">${chips()}${vxCicloSelect('renderVendasPorCanal')}
        <button class="btn btn-outline btn-xs" onclick="vcConfigurarCanal('${_vcCanalSel}')">${lc('settings', 12, 'currentColor')} Configurar canal</button>
        ${vxBotaoAnexar(temExtrato)}
        <button class="btn btn-outline btn-xs" style="margin-left:auto" onclick="Object.keys(_vcCache).forEach(k=>delete _vcCache[k]);renderVendasPorCanal()">${lc('refresh-cw', 12, 'currentColor')} Atualizar</button></div>`
    : _vcFiltros('vcanal', 'renderVendasPorCanal', chips() + `<button class="btn btn-outline btn-xs" onclick="vcConfigurarCanal('${_vcCanalSel}')">${lc('settings', 12, 'currentColor')} Configurar canal</button>`);
  el.innerHTML = barra() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw', 18, 'currentColor')} Montando o extrato…</div>`;
  const r = mkt ? vxCicloRange(_vcCiclo) : _perRange('vcanal');
  let todos, rep = null;
  try {
    [todos, rep] = await Promise.all([vcCarregarPedidos(r.inicioISO, r.fimISO), mkt ? vxCarregarRepasse(_vcCanalSel, _vcCiclo) : null]);
  } catch (e) { el.innerHTML = barra() + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${_vcEsc(e.message)}</div>`; return; }
  const cons = mkt ? vxConsolidar(rep?.extrato) : null;
  const peds = todos.filter(p => p.canal === _vcCanalSel);
  const s = vcResumoCanal(todos, _vcCanalSel, r.inicioISO, r.fimISO);
  const f = s.fixos;
  const pct = v => _n(v).toLocaleString('pt-BR');
  const logPct = s.faturamento > 0 ? s.custoLogistica / s.faturamento * 100 : null;
  // comissão por modalidade
  const porMod = m => vcSomar(peds.filter(p => p.modalidade === m));
  const mP = porMod('propria'), mR = porMod('retirada'), mE = porMod('plataforma');

  const blocos = cons ? vxHtmlOficial(cons, c, rep) : mkt ? `
      ${_vcBloco('Vendas', [['Itens', s.itens, 'antes dos descontos'], s.entregaRecebida ? ['Taxa de entrega (entregas próprias)', s.entregaRecebida] : null], s.itens + s.entregaRecebida)}
      ${_vcBloco('Promoções', [['Pagas pela loja', -s.descLoja, c.modelo === '99food' ? 'inclui frete grátis e cupons' : ''], s.descPlat ? [`Pagas pelo ${_vcEsc(c.nome)}`, s.descPlat, 'não saem do seu bolso', 'info'] : null], -s.descLoja)}
      ${_vcBloco('Comissão e pagamento', c.modelo === 'ifood' ? [
          mP.pedidos ? [`Comissão entrega própria (${pct(c.comissaoPropriaPct)}%)`, -(mP.comissaoProd + mP.comissaoLog), `${mP.pedidos} pedidos`] : null,
          mE.pedidos ? [`Comissão entrega parceira (${pct(c.comissaoParceiraPct)}%)`, -(mE.comissaoProd + mE.comissaoLog), `${mE.pedidos} pedidos`] : null,
          mR.pedidos ? [`Comissão retirada (${pct(c.comissaoRetiradaPct)}%)`, -mR.comissaoProd, `${mR.pedidos} pedidos`] : null,
          [`Pagamento online (${pct(c.taxaPagamentoPct)}%)`, -s.taxaPag]]
        : [[`Comissão (${pct(c.comissaoPct)}%)`, -s.comissao, 'sobre itens − promoções'], [`Processamento de pagamento (${pct(c.taxaPagamentoPct)}%)`, -s.taxaPag, 'sobre o pago online']],
        -(s.comissao + s.taxaPag))}
      ${_vcBloco('Logística', [
          s.custoLogPlat ? [`Entrega feita pela ${_vcEsc(c.nome)}`, -s.custoLogPlat, `${mE.pedidos} entregas × ${_vcR(_n(c.custoLogisticoEntrega))}`] : null,
          s.motoboy ? ['Motoboy próprio', -s.motoboy, `${mP.pedidos} entregas`] : null,
          s.comissaoLog ? ['Comissão sobre entrega / adicional entrega parceira', -s.comissaoLog, 'já incluída na comissão acima', 'info'] : null,
          s.entregaRecebida ? ['Taxa de entrega cobrada do cliente', s.entregaRecebida, 'já incluída em Vendas', 'info'] : null],
        -(s.custoLogPlat + s.motoboy))}
      ${_vcBloco('Serviços', [f.anuncios ? ['Anúncios', -f.anuncios, `${_vcR(_n(c.anunciosSemana))}/semana`] : null, f.mensalidade ? ['Mensalidade', -f.mensalidade, 'proporcional'] : null,
          f.antecipacao ? [`Antecipação (${pct(c.antecipacaoPct)}%)`, -f.antecipacao, c.modelo === 'ifood' ? 'iFood Pago' : ''] : null], f.total ? -f.total : undefined)}
      <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 0;border-top:1.5px solid var(--text);font-weight:800;font-size:var(--text-lg)">
        <span>Valor recebido</span><span>${_vcR(s.liquidoFinal - s.motoboy)}</span></div>
      <div style="font-size:var(--text-xs);color:var(--muted)">repasse estimado ${_vcR(s.repasse - f.total)}${s.direto ? ` · ${_vcR(s.direto)} recebido direto (dinheiro na entrega)` : ''} · já descontado o motoboy próprio</div>`
    : `
      ${_vcBloco('Vendas', [['Itens', s.itens], s.entregaRecebida ? ['Taxa de entrega', s.entregaRecebida] : null, s.servicoLoja ? ['Taxas adicionais', s.servicoLoja] : null], s.faturamento)}
      ${_vcBloco('Descontos', [['Cupons e descontos da loja', -s.descLoja]], -s.descLoja)}
      ${_vcBloco('Formas de pagamento', Object.entries(peds.reduce((a, p) => { p.pagDet.forEach(x => { const k = x.metodo; a[k] = a[k] || { v: 0, t: 0, n: 0 }; a[k].v += x.valor; a[k].t += x.taxa; a[k].n++; }); return a; }, {}))
          .sort((a, b) => b[1].v - a[1].v).map(([m, x]) => [`${_vcEsc(VC_PAGTO_LABEL[m] || m)}`, -x.t, `${x.n} · ${_vcR(x.v)} · ${_vcPct(x.t, x.v)}${c.metodos?.[m]?.prazo ? ' · ' + _vcEsc(c.metodos[m].prazo) : ''}`]), -s.taxaPag)}
      ${_vcBloco('Logística', [['Motoboy', -s.motoboy]], -s.motoboy)}
      ${_vcBloco('Serviços', [f.mensalidade ? ['Mensalidade', -f.mensalidade] : null], f.mensalidade ? -f.mensalidade : undefined)}
      <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 0;border-top:1.5px solid var(--text);font-weight:800;font-size:var(--text-lg)">
        <span>Valor recebido</span><span>${_vcR(s.liquidoFinal - s.motoboy)}</span></div>`;

  // Com extrato, o resultado usa o valor oficial (ou o que caiu na conta)
  const recOficial = cons ? (rep?.valor_pago != null ? Number(rep.valor_pago) : cons.total * (1 - _n(c.antecipacaoPct) / 100)) : 0;
  const recebido = cons ? recOficial + s.direto - s.motoboy : s.liquidoFinal - s.motoboy;
  const resultado = recebido - s.cmv - s.imposto;
  el.innerHTML = barra(!!cons) + `
    ${_vcAvisoBackfill(s)}
    ${mkt && !cons ? vxAvisoSemExtrato(c) : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="margin:0;padding:18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
          <div style="font-size:var(--text-lg);font-weight:800">Extrato ${cons ? 'oficial' : mkt ? 'estimado' : ''} · ${_vcEsc(c.nome)}
            ${cons ? `<span class="badge b-green" style="font-size:var(--text-2xs);vertical-align:middle">do arquivo</span>` : ''}</div>
          <span style="font-size:var(--text-sm);color:var(--muted)">${s.pedidos} pedidos · ${mkt ? `${_vxDdMm(r.ini)} a ${_vxDdMm(r.fim)}` : _perLabel('vcanal')}</span></div>
        ${cons ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${cons.periodos.map(p => `${_vcEsc(p.arquivo)} · apuração ${_vcBr(p.ini)} a ${_vcBr(p.fim)}`).join('<br>')}
          ${cons.periodos[0].arquivo_path ? ` · <a href="#" onclick="vcAbrirExtrato('${_vcEsc(cons.periodos[0].arquivo_path)}');return false">abrir arquivo</a>` : ''}</div>` : ''}
        ${blocos}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card" style="margin:0;padding:18px 20px">
          <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:6px">Produto × logística</div>
          ${_vcBloco('Líquido do produto', [['Itens − promoções − comissão − pagamento', s.produto, `${_vcPct(s.produto, s.itens + s.servicoLoja)} dos itens`, 'info']], s.produto)}
          ${_vcBloco('Logística', [['Custo', -s.custoLogistica, `${logPct === null ? '—' : logPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'} do faturamento · meta ${VC_META_LOGISTICA}%`],
            s.entregaRecebida ? ['Taxa de entrega cobrada', s.entregaRecebida] : null], s.logistica, `color:${s.logistica < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}
        </div>
        <div class="card" style="margin:0;padding:18px 20px">
          <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:6px">Resultado do canal</div>
          ${_vcBloco('Valor recebido', cons ? [['Extrato oficial' + (rep?.valor_pago != null ? ' (caiu na conta)' : ' − antecipação estimada'), recOficial, '', 'info'], s.direto ? ['Recebido direto (dinheiro)', s.direto, '', 'info'] : null, s.motoboy ? ['Motoboy próprio', -s.motoboy, '', 'info'] : null] : [], recebido)}
          ${_vcBloco('Custos da loja', [['CMV (ficha técnica)', -s.cmv, _vcPct(s.cmv, s.faturamento)], [`Impostos (${pct(c.impostoPct)}%)`, -s.imposto]], -(s.cmv + s.imposto))}
          ${_vcBloco('Resultado', [], resultado, `color:${resultado < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}
          <div style="font-size:var(--text-sm);color:var(--text2)">margem ${_vcPct(resultado, s.faturamento)} · ${_vcR(s.pedidos ? resultado / s.pedidos : 0)} por pedido</div>
        </div>
        ${cons ? vxConferencia(cons, peds, s) : ''}
      </div>
    </div>
    <div class="card" style="margin:0;overflow-x:auto">
      <div style="padding:14px 16px;font-size:var(--text-md);font-weight:800;border-bottom:1.5px solid var(--border)">Pedidos</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);min-width:1100px">
        <thead style="background:var(--surface2)"><tr>${['Pedido', 'Data', 'Entrega', 'Pagamento', 'Itens', 'Promo loja', 'Comissão', 'Pagamento', 'Produto líq.', 'Logística', 'CMV', 'Resultado', ...(cons ? ['Repasse app', 'Repasse extrato'] : [])].map((h, i) =>
          `<th style="padding:9px 10px;text-align:${i < 4 ? 'left' : 'right'};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${peds.slice(0, _vcPedLimite).map(p => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:600;white-space:nowrap">#${p.num}${p.numExterno ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-weight:400">${_vcEsc(c.nome)} ${_vcEsc(p.numExterno)}</div>` : ''}</td>
          <td style="padding:8px 10px;white-space:nowrap;color:var(--text2)">${new Date(p.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td style="padding:8px 10px;color:var(--text2);white-space:nowrap">${{ propria: 'Própria', plataforma: mkt ? _vcEsc(c.nome) : 'Plataforma', retirada: 'Retirada' }[p.modalidade]}</td>
          <td style="padding:8px 10px;color:var(--text2)">${_vcEsc(p.pagamentos || '—')}</td>
          ${[p.itens, -p.descLoja, -p.comissao, -p.taxaPag, p.produto, p.logistica, -p.cmv, p.resultado].map((v, i) =>
            `<td style="padding:8px 10px;text-align:right;white-space:nowrap;${i === 4 || i === 7 ? 'font-weight:700' : ''};color:${v < -0.004 ? 'var(--danger-fg)' : 'inherit'}">${Math.abs(v) < 0.005 ? '—' : _vcR(v)}</td>`).join('')}
          ${cons ? (() => { const o = cons.pedidos[_vxChave(p.numExterno, p.ts)]; const d = o ? o.v - p.repasse : null;
            return `<td style="padding:8px 10px;text-align:right;white-space:nowrap">${_vcR(p.repasse)}</td>
              <td style="padding:8px 10px;text-align:right;white-space:nowrap;font-weight:700;color:${d === null ? 'var(--danger-fg)' : Math.abs(d) > 0.05 ? 'var(--warning-fg)' : 'var(--success-fg)'}" title="${d === null ? 'Pedido não está no extrato' : 'Diferença ' + _vcR(d)}">${o ? _vcR(o.v) : 'fora'}</td>`; })() : ''}
        </tr>`).join('') || `<tr><td colspan="${cons ? 14 : 12}" style="padding:30px;text-align:center;color:var(--muted)">Sem pedidos no período</td></tr>`}</tbody>
      </table>
      ${peds.length > _vcPedLimite ? `<div style="padding:10px 16px;border-top:1.5px solid var(--border)"><button class="btn btn-ghost btn-xs" onclick="_vcPedLimite+=200;renderVendasPorCanal()">Mostrar mais (${peds.length - _vcPedLimite})</button></div>` : ''}
    </div>`;
}

// ── Configurar canal ──

function vcConfigurarCanal(canal) {
  const c = vcCanalCfg(canal);
  const num = (id, v, label, dica = '') => _estCampo(label, `<input class="inp" type="number" min="0" step="0.01" id="${id}" value="${v ?? 0}">`, '', dica);
  const chk = (id, on, txt) => `<label style="display:flex;align-items:center;gap:8px;font-size:var(--text-md);text-transform:none;letter-spacing:0;font-weight:400;cursor:pointer">
    <input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="accent-color:var(--purple);width:16px;height:16px"> ${txt}</label>`;
  let corpo;
  if (c.modelo === 'ifood') corpo = `
    <div class="f2">${num('vcComP', c.comissaoPropriaPct, 'Comissão entrega própria (%)', 'Sobre itens + entrega − promoções.')}${num('vcComE', c.comissaoParceiraPct, 'Comissão entrega parceira (%)', 'Sobre itens − promoções.')}</div>
    <div class="f2">${num('vcComR', c.comissaoRetiradaPct, 'Comissão retirada (%)')}${num('vcPag', c.taxaPagamentoPct, 'Pagamento online (%)', 'Mesma base da comissão.')}</div>
    <div class="f2">${num('vcAnun', c.anunciosSemana, 'Anúncios (R$/semana)')}${num('vcAntec', c.antecipacaoPct, 'Antecipação · iFood Pago (%)', 'Sobre o repasse.')}</div>`;
  else if (c.modelo === '99food') corpo = `
    <div class="f2">${num('vcCom', c.comissaoPct, 'Comissão (%)', 'Sobre itens − promoções da loja.')}${num('vcPag', c.taxaPagamentoPct, 'Processamento de pagamento (%)', 'Sobre o pago online.')}</div>
    <div class="f2">${num('vcLog', c.custoLogisticoEntrega, 'Custo logístico por entrega da 99 (R$)')}${num('vcAnun', c.anunciosSemana, 'Anúncios (R$/semana)')}</div>
    ${num('vcAntec', c.antecipacaoPct, 'Antecipação (%)')}`;
  else corpo = `
    <div class="field"><label>Formas de pagamento</label>
      <div class="fm-lista">
        <div class="fm-lista-h" style="display:grid;grid-template-columns:1.3fr 80px 80px 1.3fr;gap:8px"><span>Forma</span><span>%</span><span>R$ fixo</span><span>Recebimento</span></div>
        ${Object.entries(c.metodos || {}).map(([k, m]) => `<div class="fm-lista-l" style="display:grid;grid-template-columns:1.3fr 80px 80px 1.3fr;gap:8px">
          <span>${_vcEsc(VC_PAGTO_LABEL[k] || k)}</span>
          <input class="inp" type="number" min="0" step="0.01" data-m="${k}" data-c="pct" value="${m.pct}" style="padding:6px 8px">
          <input class="inp" type="number" min="0" step="0.01" data-m="${k}" data-c="fixo" value="${m.fixo}" style="padding:6px 8px">
          <input class="inp" data-m="${k}" data-c="prazo" value="${_vcEsc(m.prazo || '')}" style="padding:6px 8px" placeholder="ex: D+1"></div>`).join('')}
      </div>${_estDica('Pix automático (Tuna): R$ 0,50 por pedido. Cartão online (Mercado Pago): 4,89%.')}</div>`;
  _estModal('ovVcCfg', `Configurar canal · ${_vcEsc(c.nome)}`, `${corpo}
    <div class="f2">${num('vcMensal', c.mensalidade, 'Mensalidade (R$/mês)')}${num('vcImposto', c.impostoPct, 'Impostos (%)')}</div>
    ${c.tipo === 'marketplace' ? num('vcRepasse', c.repasseDias ?? 3, 'Repasse: dias depois do domingo', 'Semana de segunda a domingo. 3 = quarta.') : ''}
    <div class="fm-box">${chk('vcMotoboy', c.contarMotoboy !== false, 'Descontar o motoboy das entregas próprias')}</div>`,
    `vcSalvarCanal('${canal}')`, 'Salvar', 600, 'Valores iniciais calibrados com os extratos de 12 a 18/10/2026.');
}

function vcSalvarCanal(canal) {
  const salvo = db._get('vtp_canais_config', null) || {};
  const c = { ...vcCanalCfg(canal) };
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  c.mensalidade = v('vcMensal'); c.impostoPct = v('vcImposto'); c.contarMotoboy = !!document.getElementById('vcMotoboy')?.checked;
  if (document.getElementById('vcRepasse')) c.repasseDias = Math.round(v('vcRepasse'));
  if (c.modelo === 'ifood') Object.assign(c, { comissaoPropriaPct: v('vcComP'), comissaoParceiraPct: v('vcComE'), comissaoRetiradaPct: v('vcComR'), taxaPagamentoPct: v('vcPag'), anunciosSemana: v('vcAnun'), antecipacaoPct: v('vcAntec') });
  else if (c.modelo === '99food') Object.assign(c, { comissaoPct: v('vcCom'), taxaPagamentoPct: v('vcPag'), custoLogisticoEntrega: v('vcLog'), anunciosSemana: v('vcAnun'), antecipacaoPct: v('vcAntec') });
  else {
    c.metodos = JSON.parse(JSON.stringify(c.metodos || {}));
    document.querySelectorAll('#ovVcCfg [data-m]').forEach(i => {
      const m = c.metodos[i.dataset.m] || (c.metodos[i.dataset.m] = {});
      m[i.dataset.c] = i.dataset.c === 'prazo' ? i.value.trim() : (parseFloat(i.value) || 0);
    });
  }
  salvo[canal] = c;
  vcSalvarConfig(salvo);
  Object.keys(_vcCache).forEach(k => delete _vcCache[k]);
  document.getElementById('ovVcCfg')?.remove();
  toast('Configuração do canal salva', 'ok');
  _vdRerender();
}

// ══════════════════════════════════════════════════════════════
// ABA PARIDADE — o canal rende pelo menos o preço do site?
// ══════════════════════════════════════════════════════════════
// Por produto (pizza: tamanho + sabores; bebida: nome), compara o preço médio
// praticado no site com o LÍQUIDO DO PRODUTO em cada app (preço praticado −
// promoções − comissão − pagamento, rateado pelo valor de cada item no pedido).
// Logística fica de fora: é avaliada separado (meta de 9%). Combos com mais de
// uma pizza entram no resumo do canal, mas não na comparação por produto.

let _vcParFil = { q: '', status: '' };

function _vcChaveLinha(l) {
  if (l.pizzas?.length === 1 && !(l.bebidas || []).length) {
    const pz = l.pizzas[0];
    const sab = Object.keys(pz.meias || {}).map(k => _estNomeSabor(k)).sort();
    if (!sab.length) return null;
    return `Pizza ${pz.tamanho === 'grande' ? 'Grande' : 'Pequena'} · ${sab.length > 1 ? sab.map(x => '1/2 ' + x).join(' + ') : sab[0]}`;
  }
  if (!(l.pizzas || []).length && (l.bebidas || []).length === 1) return (l.bebidas[0].nome || '').trim().toUpperCase();
  return null;
}

async function renderVendasParidade() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  if (!_per('vpar').de) _perSetPresetSilencioso('vpar', 'mes');
  el.innerHTML = _vcFiltros('vpar', 'renderVendasParidade') + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw', 18, 'currentColor')} Comparando os canais com o site…</div>`;
  const r = _perRange('vpar');
  let peds;
  try { peds = await vcCarregarPedidos(r.inicioISO, r.fimISO); }
  catch (e) { el.innerHTML = _vcFiltros('vpar', 'renderVendasParidade') + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${_vcEsc(e.message)}</div>`; return; }

  const canais = ['site', 'ifood', '99food'];
  const prod = {};           // chave → { canal → { qtd, preco, liquido } }
  let foraDaComparacao = 0;
  for (const p of peds) {
    if (!canais.includes(p.canal)) continue;
    let linhas = [];
    try { linhas = _vInterpretarPedido(p._p); } catch (_) {}
    const somaItens = linhas.reduce((s, l) => s + _n(l.receita), 0) || 1;
    const fator = p.itens > 0 ? p.produto / p.itens : 0;   // quanto de cada R$ de item vira líquido do produto
    for (const l of linhas) {
      const k = _vcChaveLinha(l);
      const valor = _n(l.receita) / somaItens * p.itens;    // ajusta ao valor de itens do pedido
      if (!k) { foraDaComparacao++; continue; }
      const q = _n(l.qtd) || 1;
      const x = ((prod[k] ||= {})[p.canal] ||= { qtd: 0, preco: 0, liquido: 0 });
      x.qtd += q; x.preco += valor; x.liquido += valor * fator;
    }
  }
  const lista = Object.entries(prod).map(([k, porCanal]) => {
    const site = porCanal.site;
    const ref = site ? site.preco / site.qtd : null;   // preço médio praticado no site
    const canaisInfo = {};
    for (const c of ['ifood', '99food']) {
      const x = porCanal[c];
      if (!x) continue;
      const preco = x.preco / x.qtd, liq = x.liquido / x.qtd, fator = preco > 0 ? liq / preco : 0;
      canaisInfo[c] = { qtd: x.qtd, preco, liq, dif: ref !== null ? liq - ref : null, minimo: ref !== null && fator > 0 ? ref / fator : null };
    }
    const piores = Object.values(canaisInfo).filter(x => x.dif !== null);
    const abaixo = piores.some(x => x.dif < -0.005);
    return { k, ref, siteQtd: site?.qtd || 0, canais: canaisInfo, abaixo, semRef: ref === null, vol: Object.values(porCanal).reduce((s, x) => s + x.qtd, 0) };
  }).filter(x => Object.keys(x.canais).length);

  const f = _vcParFil, q = f.q.trim().toLowerCase();
  const vis = lista.filter(x => (!q || x.k.toLowerCase().includes(q)) && (!f.status || (f.status === 'abaixo' ? x.abaixo : f.status === 'ok' ? !x.abaixo && !x.semRef : x.semRef)))
    .sort((a, b) => (b.abaixo - a.abaixo) || b.vol - a.vol);
  const resumoCanal = c => {
    const s = vcSomar(peds.filter(p => p.canal === c));
    return { fator: s.itens > 0 ? s.produto / s.itens : 0, ...s };
  };
  const rs = resumoCanal('site'), ri = resumoCanal('ifood'), r9 = resumoCanal('99food');
  const markup = (rc) => rs.fator > 0 && rc.fator > 0 ? (rs.fator / rc.fator - 1) * 100 : null;
  const chip = (id, txt, n) => { const on = f.status === id; return `<button onclick="_vcParFil.status='${id}';renderVendasParidade()" style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
    border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${txt}${n !== undefined ? ` (${n})` : ''}</button>`; };
  const fmtPct = v => v === null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  const celCanal = x => !x ? '<td colspan="4" style="padding:9px 10px;text-align:center;color:var(--muted)">não vendido</td>' : `
    <td style="padding:9px 10px;text-align:right;white-space:nowrap">${_vcR(x.preco)}<div style="font-size:var(--text-2xs);color:var(--muted)">${_estQ(x.qtd)} un</div></td>
    <td style="padding:9px 10px;text-align:right;white-space:nowrap;font-weight:700">${_vcR(x.liq)}</td>
    <td style="padding:9px 10px;text-align:right;white-space:nowrap;font-weight:700;color:${x.dif === null ? 'var(--muted)' : x.dif < -0.005 ? 'var(--danger-fg)' : 'var(--success-fg)'}">${x.dif === null ? '—' : (x.dif < -0.005 ? '❌ ' : '✅ ') + _vcR(x.dif)}</td>
    <td style="padding:9px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${x.minimo ? _vcR(x.minimo) : '—'}</td>`;

  el.innerHTML = _vcFiltros('vpar', 'renderVendasParidade') + `
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:14px;line-height:1.5">Regra: depois das promoções, comissões e taxas de pagamento, o app precisa render <strong>pelo menos o preço do site</strong> (base do CMV). A logística é avaliada à parte, na aba Geral.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px">
      ${_vcKpi('Site', _vcPct(rs.produto, rs.itens), 'de cada R$ de item fica para a loja')}
      ${_vcKpi('iFood', _vcPct(ri.produto, ri.itens), `preço precisa ser ${fmtPct(markup(ri))} acima do site para empatar`, 'var(--orange-dark)')}
      ${_vcKpi('99Food', _vcPct(r9.produto, r9.itens), `preço precisa ser ${fmtPct(markup(r9))} acima do site para empatar`, 'var(--orange-dark)')}
    </div>
    <div class="card" style="margin:0;overflow-x:auto">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1.5px solid var(--border)">
        <input class="inp" id="vcParBusca" placeholder="Buscar produto…" value="${_vcEsc(f.q)}" style="flex:1;min-width:180px;max-width:280px"
          oninput="_vcParFil.q=this.value;clearTimeout(window._vcPQ);window._vcPQ=setTimeout(()=>{renderVendasParidade();const b=document.getElementById('vcParBusca');b.focus();b.setSelectionRange(b.value.length,b.value.length)},250)">
        ${chip('', 'Todos', lista.length)}${chip('abaixo', '❌ Abaixo do site', lista.filter(x => x.abaixo).length)}${chip('ok', '✅ Igual ou acima', lista.filter(x => !x.abaixo && !x.semRef).length)}${chip('semref', 'Sem venda no site', lista.filter(x => x.semRef).length)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);min-width:1150px">
        <thead style="background:var(--surface2)">
          <tr><th rowspan="2" style="padding:9px 10px;text-align:left;font-size:var(--text-xs);color:var(--muted)">Produto</th>
            <th rowspan="2" style="padding:9px 10px;text-align:right;font-size:var(--text-xs);color:var(--muted)">Site<div style="font-weight:500">preço médio</div></th>
            <th colspan="4" style="padding:9px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);border-left:1px solid var(--border)">iFood</th>
            <th colspan="4" style="padding:9px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);border-left:1px solid var(--border)">99Food</th></tr>
          <tr>${['Preço', 'Líquido', 'vs. site', 'Preço mínimo', 'Preço', 'Líquido', 'vs. site', 'Preço mínimo'].map((h, i) => `<th style="padding:6px 10px;text-align:right;font-size:var(--text-2xs);color:var(--muted);${i % 4 === 0 ? 'border-left:1px solid var(--border)' : ''}">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>${vis.map(x => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:9px 10px;font-weight:600">${_vcEsc(x.k)}</td>
          <td style="padding:9px 10px;text-align:right;white-space:nowrap">${x.ref !== null ? `${_vcR(x.ref)}<div style="font-size:var(--text-2xs);color:var(--muted)">${_estQ(x.siteQtd)} un</div>` : '<span style="color:var(--muted)">sem venda</span>'}</td>
          ${celCanal(x.canais.ifood)}${celCanal(x.canais['99food'])}</tr>`).join('')
          || `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--muted)">Nada com esses filtros</td></tr>`}</tbody>
      </table>
      <div style="padding:10px 16px;border-top:1.5px solid var(--border);font-size:var(--text-xs);color:var(--muted);line-height:1.5">
        Preço = valor médio cobrado do cliente por unidade (antes das promoções). Líquido = o que sobra do produto depois de promoções, comissão e pagamento. Preço mínimo = preço que o app precisaria ter para render o mesmo que o site, com o nível atual de promoções e taxas.
        ${foraDaComparacao ? ` ${foraDaComparacao} item(ns) de combos com mais de um produto ficaram fora da comparação por produto.` : ''}</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ABA REPASSES — semanas dos marketplaces: estimado × pago
// ══════════════════════════════════════════════════════════════

let _vcRepCanal = 'ifood';
let _vcRepSemanas = 8;
let _vcRepDados = null;

const _vcIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const _vcBr = iso => iso ? iso.split('-').reverse().join('/') : '—';

async function renderVendasRepasses(forcar = false) {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  const mkts = Object.entries(vcConfig()).filter(([, c]) => c.tipo === 'marketplace').map(([k]) => k);
  if (!mkts.includes(_vcRepCanal)) _vcRepCanal = mkts[0];
  const barra = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    ${mkts.map(c => { const on = _vcRepCanal === c; return `<button onclick="_vcRepCanal='${c}';renderVendasRepasses()" style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
      border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${_vcEsc(vcNomeCanal(c))}</button>`; }).join('')}
    <select class="inp" style="width:auto;font-size:var(--text-sm)" onchange="_vcRepSemanas=+this.value;renderVendasRepasses()">
      ${[4, 8, 12, 26].map(n => `<option value="${n}"${n === _vcRepSemanas ? ' selected' : ''}>Últimas ${n} semanas</option>`).join('')}</select>
    <button class="btn btn-outline btn-xs" onclick="vcConfigurarCanal('${_vcRepCanal}')">${lc('settings', 12, 'currentColor')} Configurar canal</button>
    <button class="btn btn-outline btn-xs" style="margin-left:auto" onclick="Object.keys(_vcCache).forEach(k=>delete _vcCache[k]);renderVendasRepasses(true)">${lc('refresh-cw', 12, 'currentColor')} Atualizar</button>
  </div>`;
  el.innerHTML = barra + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw', 18, 'currentColor')} Calculando os repasses…</div>`;

  const c = vcCanalCfg(_vcRepCanal), dias = c.repasseDias ?? 3;
  // Semanas seg–dom, da mais recente (atual) para trás
  const hoje = new Date(); const dow = hoje.getDay();
  const segAtual = new Date(hoje); segAtual.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1)); segAtual.setHours(0, 0, 0, 0);
  const semanas = [];
  for (let i = 0; i < _vcRepSemanas; i++) {
    const ini = new Date(segAtual); ini.setDate(segAtual.getDate() - 7 * i);
    const fim = new Date(ini); fim.setDate(ini.getDate() + 6); fim.setHours(23, 59, 59, 999);
    const rep = new Date(ini); rep.setDate(ini.getDate() + 6 + dias);
    semanas.push({ ini, fim, rep });
  }
  let peds, salvos;
  try {
    [peds, salvos] = await Promise.all([
      vcCarregarPedidos(semanas[semanas.length - 1].ini.toISOString(), semanas[0].fim.toISOString(), forcar),
      _estSelectTodos(() => _estSb().from('vd_repasses').select('*').eq('canal', _vcRepCanal).is('excluido_em', null)),
    ]);
  } catch (e) { el.innerHTML = barra + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${_vcEsc(e.message)}</div>`; return; }
  _vcRepDados = semanas.map(s => {
    const ps = peds.filter(p => p.canal === _vcRepCanal && _estMs(p.ts) >= s.ini.getTime() && _estMs(p.ts) <= s.fim.getTime());
    const t = vcSomar(ps);
    const fx = vcFixos(_vcRepCanal, t, s.ini.toISOString(), new Date(s.ini.getTime() + 7 * 864e5).toISOString());
    const salvo = salvos.find(x => x.semana_inicio === _vcIso(s.ini));
    const estimado = _r2(t.repasse - fx.total);
    return { ...s, t, fx, estimado, salvo, pago: salvo?.valor_pago != null ? Number(salvo.valor_pago) : null, aberta: s.fim > hoje, futuro: s.rep > hoje };
  });
  const tot = _vcRepDados.reduce((a, x) => ({ est: a.est + x.estimado, pago: a.pago + (x.pago ?? 0), dif: a.dif + (x.pago != null ? x.pago - x.estimado : 0) }), { est: 0, pago: 0, dif: 0 });
  const pendentes = _vcRepDados.filter(x => !x.futuro && x.pago == null).length;
  const th = (t, al = 'right') => `<th style="padding:10px 12px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${t}</th>`;

  el.innerHTML = barra + `
    ${_vcAvisoBackfill(vcSomar(peds.filter(p => p.canal === _vcRepCanal)))}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
      ${_vcKpi('Repasse estimado', _vcR(tot.est), `${_vcRepSemanas} semanas · pelas taxas configuradas`)}
      ${_vcKpi('Pago (extrato)', _vcR(tot.pago), 'valores informados ou importados', 'var(--info-fg)')}
      ${_vcKpi('Diferença', _vcR(tot.dif), 'pago − estimado nas semanas conferidas', Math.abs(tot.dif) > 1 ? 'var(--danger-fg)' : 'var(--success-fg)')}
      ${_vcKpi('A conferir', pendentes, 'repasses que já caíram sem valor informado', pendentes ? 'var(--warning-fg)' : 'var(--text)')}
    </div>
    <div class="card" style="margin:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md);min-width:1250px">
        <thead style="background:var(--surface2)"><tr>${th('Semana', 'left')}${th('Repasse', 'left')}${th('Pedidos')}${th('Vendas')}${th('Promo loja')}${th('Comissão + pagamento')}${th('Logística')}${th('Serviços')}${th('Antecipação')}${th('Recebido direto')}${th('Estimado')}${th('Pago no extrato')}${th('Diferença')}${th('Extrato', 'left')}</tr></thead>
        <tbody>${_vcRepDados.map((x, k) => {
          const dif = x.pago != null ? x.pago - x.estimado : null;
          return `<tr style="border-top:1px solid var(--border);${x.aberta ? 'background:color-mix(in srgb, var(--info-bg) 35%, transparent)' : ''}">
            <td style="padding:10px 12px;white-space:nowrap;font-weight:600">${x.ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${x.fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${x.aberta ? ' <span class="badge b-purple" style="font-size:var(--text-2xs)">em andamento</span>' : ''}</td>
            <td style="padding:10px 12px;white-space:nowrap;color:var(--text2)">${x.rep.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
            <td style="padding:10px 12px;text-align:right">${x.t.pedidos}${x.t.semFinanceiro ? `<div style="font-size:var(--text-2xs);color:var(--warning-fg)" title="Pedidos ainda sem taxas e descontos lidos do Cardápio Web">${x.t.semFinanceiro} sem detalhe</div>` : ''}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap">${_vcR(x.t.itens + x.t.entregaRecebida)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${_vcR(x.t.descLoja)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${_vcR(x.t.comissao + x.t.taxaPag)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${x.t.custoLogPlat ? _vcR(x.t.custoLogPlat) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${x.fx.anuncios + x.fx.mensalidade ? _vcR(x.fx.anuncios + x.fx.mensalidade) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${x.fx.antecipacao ? _vcR(x.fx.antecipacao) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--text2)">${x.t.direto ? _vcR(x.t.direto) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;font-weight:700">${_vcR(x.estimado)}${x.salvo?.extrato?.periodos ? `<div style="font-size:var(--text-2xs);color:var(--success-fg);font-weight:600">oficial ${_vcR(vxConsolidar(x.salvo.extrato).total)}</div>` : ''}</td>
            <td style="padding:10px 12px;text-align:right">${x.futuro ? '<span style="color:var(--muted);font-size:var(--text-sm)">a receber</span>'
              : `<input class="inp" type="text" inputmode="decimal" value="${x.pago != null ? String(x.pago).replace('.', ',') : ''}" placeholder="R$" style="width:110px;text-align:right" onchange="vcSalvarRepasse(${k}, this.value)">`}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;font-weight:700;color:${dif === null ? 'var(--muted)' : Math.abs(dif) > 1 ? 'var(--danger-fg)' : 'var(--success-fg)'}">${dif === null ? '—' : _vcR(dif)}</td>
            <td style="padding:10px 12px;white-space:nowrap">${x.futuro ? '' : `<label class="btn btn-ghost btn-xs" style="cursor:pointer">${lc(x.salvo?.arquivo_path ? 'check-circle' : 'upload', 12, 'currentColor')} ${x.salvo?.arquivo_path ? 'Anexado' : 'Anexar'}
              <input type="file" accept=".csv,.xlsx,.xls,.pdf,image/*" style="display:none" onchange="vcAnexarExtrato(${k}, this.files[0])"></label>
              ${x.salvo?.arquivo_path ? `<button class="btn btn-ghost btn-xs" onclick="vcAbrirExtrato('${_vcEsc(x.salvo.arquivo_path)}')">${lc('eye', 12, 'currentColor')}</button>` : ''}`}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div style="padding:10px 16px;border-top:1.5px solid var(--border);font-size:var(--text-xs);color:var(--muted);line-height:1.5">
        Semana de segunda a domingo; o repasse cai ${dias} dia(s) depois do domingo. Estimado = vendas − promoções − comissão − pagamento − logística da plataforma − serviços (anúncios, mensalidade) − antecipação − o que o cliente pagou direto à loja. O motoboy próprio não entra no repasse. Informe o valor que caiu (ou anexe o extrato do portal) para ver a diferença.</div>
    </div>`;
}

async function _vcRepasseRow(k) {
  const x = _vcRepDados[k];
  if (x.salvo) return x.salvo;
  const [row] = await cpInsert('vd_repasses', { canal: _vcRepCanal, semana_inicio: _vcIso(x.ini), semana_fim: _vcIso(x.fim), data_repasse: _vcIso(x.rep),
    valor_estimado: x.estimado, criado_por: estUsuario() });
  x.salvo = row;
  return row;
}

async function vcSalvarRepasse(k, valor) {
  const t = String(valor || '').trim();
  const v = t === '' ? null : parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  if (v !== null && isNaN(v)) return toast('Valor inválido', 'err');
  try {
    const row = await _vcRepasseRow(k);
    _vcRepDados[k].salvo = await cpUpdate('vd_repasses', row.id, { valor_pago: v, valor_estimado: _vcRepDados[k].estimado, atualizado_por: estUsuario() });
    toast('Repasse salvo', 'ok');
    renderVendasRepasses();
  } catch (e) { toast('Não salvou: ' + e.message, 'err'); }
}

async function vcAnexarExtrato(k, file) {
  if (!file) return;
  try {
    toast('Enviando o extrato…', 'info');
    const path = await cpUploadAnexo(file, 'repasses');
    const row = await _vcRepasseRow(k);
    _vcRepDados[k].salvo = await cpUpdate('vd_repasses', row.id, { arquivo_path: path, atualizado_por: estUsuario() });
    toast('Extrato anexado. Informe o valor pago na linha da semana.', 'ok');
    renderVendasRepasses();
  } catch (e) { toast('Não anexou: ' + e.message, 'err'); }
}

async function vcAbrirExtrato(path) {
  try { const url = await cpUrlAnexo(path); if (url) window.open(url, '_blank'); }
  catch (e) { toast(e.message, 'err'); }
}

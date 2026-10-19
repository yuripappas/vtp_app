/**
 * VTP Compras — Vai Ter Pizza!
 * vendas-canais.js — Vendas por canal: Geral · Por canal (extrato) · Repasses
 *
 * Cada pedido do Cardápio Web traz: total pago pelo cliente, taxa de entrega,
 * taxas de serviço/adicional, motoboy, descontos (com quem pagou: loja ou
 * plataforma) e formas de pagamento. As taxas da plataforma (comissão, taxa
 * de pagamento online, mensalidade) vêm da configuração de cada canal.
 *
 * Por pedido:
 *   Vendas (itens)   = total + descontos − taxas cobradas do cliente
 *   (+) entrega       taxa de entrega que fica com a loja (entrega própria)
 *   (+) serviço       taxa de serviço/adicional, quando fica com a loja
 *   (−) promoções     descontos pagos pela loja (os pagos pela plataforma não descontam)
 *   (−) comissão      % do canal sobre a base escolhida
 *   (−) pagamento     % sobre o que foi pago online (marketplace) ou por forma de pagamento (site)
 *   (−) taxa fixa     R$ por pedido
 *   = Líquido         o que a loja recebe
 *   Custos do canal: motoboy, CMV (ficha técnica) e impostos → Resultado.
 *
 * Repasse (marketplace): semana seg–dom, pago no dia configurado depois do
 * domingo (padrão quarta = +3 dias). O que o cliente pagou direto à loja
 * (dinheiro na entrega) sai do repasse. Valor pago vem do extrato oficial.
 */

const VC_PAGTO_LABEL = {
  pix_auto: 'Pix online', pix: 'Pix', credit_card: 'Crédito (maquininha)', debit_card: 'Débito (maquininha)',
  online_credit_card: 'Cartão online', money: 'Dinheiro', debt_book: 'Fiado / conta', voucher: 'Voucher',
  ifood: 'Pago no iFood', food99: 'Pago no 99', food99_voucher: 'Voucher 99',
};
const VC_CANAIS_PADRAO = ['ifood', '99food', 'site'];

// ── Configuração dos canais ───────────────────────────────────

function vcConfig() {
  const salvo = db._get('vtp_canais_config', null);
  if (salvo) return salvo;
  // Primeira vez: parte dos % que já estavam cadastrados na tela antiga
  const com = db._get('vtp_canais_comissao', {}) || {}, imp = db._get('vtp_canais_imposto', {}) || {};
  return {
    ifood:   { nome: 'iFood',   tipo: 'marketplace', comissaoPct: com.ifood ?? 12, baseComissao: 'itens', taxaPagamentoPct: 3.2, taxaFixa: 0, mensalidade: 0,
               servicoFicaPlataforma: true, entregaFicaLoja: true, impostoPct: imp.ifood ?? 6, contarMotoboy: true, repasseDias: 3 },
    '99food':{ nome: '99Food',  tipo: 'marketplace', comissaoPct: com['99food'] ?? 10, baseComissao: 'itens', taxaPagamentoPct: 0, taxaFixa: 0, mensalidade: 0,
               servicoFicaPlataforma: true, entregaFicaLoja: true, impostoPct: imp['99food'] ?? 6, contarMotoboy: true, repasseDias: 3 },
    site:    { nome: 'Site / loja própria', tipo: 'proprio', comissaoPct: 0, baseComissao: 'itens', taxaFixa: 0, mensalidade: 0,
               metodos: { pix_auto: 0, pix: 0, credit_card: com.site ?? 0, debit_card: com.site ?? 0, online_credit_card: com.site ?? 0, money: 0, debt_book: 0 },
               impostoPct: imp.site ?? 4, contarMotoboy: true, contarDescontos: true },
  };
}
function vcSalvarConfig(cfg) { db._set('vtp_canais_config', cfg); }
const vcCanalCfg = c => vcConfig()[c] || { nome: c, tipo: 'proprio', comissaoPct: 0, impostoPct: 0, metodos: {}, contarMotoboy: true, contarDescontos: true };
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
  const proprio = !p.delivered_by || p.delivered_by === 'merchant';
  const entregaLoja = proprio && (mkt ? c.entregaFicaLoja !== false : true) ? entrega : 0;
  const servicoLoja = mkt && c.servicoFicaPlataforma !== false ? 0 : servico;
  const pags = Array.isArray(p.payments) ? p.payments : [];
  const online = pags.filter(x => x.payment_type === 'online').reduce((s, x) => s + _n(x.total), 0);
  const direto = mkt ? pags.filter(x => x.payment_type !== 'online').reduce((s, x) => s + _n(x.total), 0) : 0;
  const base = c.baseComissao === 'itens_entrega' ? itens + entrega : itens;
  const comissao = base * _n(c.comissaoPct) / 100;
  let taxaPag = 0;
  if (mkt) taxaPag = online * _n(c.taxaPagamentoPct) / 100;
  else for (const x of pags) taxaPag += _n(x.total) * _n((c.metodos || {})[x.payment_method]) / 100 + _n(x.payment_fee);
  const descDescontado = mkt || c.contarDescontos !== false ? descLoja : 0;
  const taxaFixa = _n(c.taxaFixa);
  const liquido = itens + entregaLoja + servicoLoja - descLoja - comissao - taxaPag - taxaFixa;
  const motoboy = c.contarMotoboy !== false && proprio ? _n(p.driver_fee) : 0;
  let cmv = 0;
  try { for (const l of _vInterpretarPedido(p)) cmv += vendasCustoLinha(l); } catch (_) {}
  const receitaLoja = itens - descLoja + entregaLoja + servicoLoja;
  const imposto = receitaLoja * _n(c.impostoPct) / 100;
  return {
    id: p.id, num: p.display_id, numExterno: p.external_display_id, canal, ts: p.cw_created_at, tipo: p.order_type,
    semFinanceiro: !p.financeiro_em, total, itens, entrega, entregaLoja, servico, servicoLoja, descLoja, descPlat,
    descDescontado, comissao, taxaPag, taxaFixa, liquido, direto, repasse: mkt ? liquido - direto : 0,
    motoboy, cmv, imposto, resultado: liquido - motoboy - cmv - imposto,
    pagamentos: pags.map(x => VC_PAGTO_LABEL[x.payment_method] || x.payment_method).join(', '),
  };
}

function vcSomar(lista) {
  const s = { pedidos: 0, total: 0, itens: 0, entregaLoja: 0, servicoLoja: 0, descLoja: 0, descPlat: 0, comissao: 0, taxaPag: 0, taxaFixa: 0,
    liquido: 0, direto: 0, repasse: 0, motoboy: 0, cmv: 0, imposto: 0, resultado: 0, semFinanceiro: 0 };
  for (const p of lista) {
    s.pedidos++;
    for (const k of Object.keys(s)) if (k !== 'pedidos' && k !== 'semFinanceiro') s[k] += p[k] || 0;
    if (p.semFinanceiro) s.semFinanceiro++;
  }
  return s;
}

// Mensalidade do canal proporcional aos dias do período
function vcMensalidade(canal, iniISO, fimISO) {
  const m = _n(vcCanalCfg(canal).mensalidade);
  if (!m) return 0;
  const dias = Math.max(1, Math.round((new Date(fimISO) - new Date(iniISO)) / 864e5));
  return m * dias / 30;
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
  const canais = [...new Set([...VC_CANAIS_PADRAO, ...peds.map(p => p.canal)])].map(c => {
    const s = vcSomar(peds.filter(p => p.canal === c));
    const mens = vcMensalidade(c, r.inicioISO, r.fimISO);
    return { canal: c, ...s, mens, resultado: s.resultado - mens, taxas: s.comissao + s.taxaPag + s.taxaFixa + mens };
  }).filter(c => c.pedidos);
  const mensTot = canais.reduce((s, c) => s + c.mens, 0);
  const taxas = tot.comissao + tot.taxaPag + tot.taxaFixa + mensTot;
  const vendas = tot.itens + tot.entregaLoja + tot.servicoLoja;
  const resultado = tot.resultado - mensTot;
  const th = (t, al = 'right') => `<th style="padding:10px 12px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${t}</th>`;
  const td = (v, extra = '') => `<td style="padding:10px 12px;text-align:right;white-space:nowrap;${extra}">${v}</td>`;

  el.innerHTML = _vcFiltros('vgeral', 'renderVendasGeral') + `
    ${_vcAvisoBackfill(tot)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:12px">
      ${_vcKpi('Vendas brutas', _vcR(vendas), `${tot.pedidos} pedidos · ticket ${_vcR(tot.pedidos ? tot.total / tot.pedidos : 0)}`)}
      ${_vcKpi('Promoções da loja', _vcR(tot.descLoja), `${_vcPct(tot.descLoja, vendas)} das vendas · plataformas pagaram ${_vcR(tot.descPlat)}`, 'var(--orange-dark)')}
      ${_vcKpi('Taxas das plataformas', _vcR(taxas), `comissão, pagamento e mensalidade · ${_vcPct(taxas, vendas)}`, 'var(--orange-dark)')}
      ${_vcKpi('Líquido recebido', _vcR(tot.liquido - mensTot), 'o que fica para a loja', 'var(--info-fg)')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:18px">
      ${_vcKpi('CMV', _vcR(tot.cmv), `${_vcPct(tot.cmv, vendas)} das vendas`)}
      ${_vcKpi('Motoboy', _vcR(tot.motoboy), 'entregas próprias')}
      ${_vcKpi('Impostos', _vcR(tot.imposto), _vcPct(tot.imposto, vendas))}
      ${_vcKpi('Resultado', _vcR(resultado), `margem ${_vcPct(resultado, vendas)}`, resultado < 0 ? 'var(--danger-fg)' : 'var(--success-fg)')}
    </div>
    <div class="card" style="padding:16px;margin-bottom:16px">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:10px">Para onde vai cada real vendido, por canal</div>
      <div style="height:${Math.max(160, canais.length * 56)}px"><canvas id="vcChartGeral"></canvas></div>
    </div>
    <div class="card" style="margin:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md);min-width:980px">
        <thead style="background:var(--surface2)"><tr>${th('Canal', 'left')}${th('Pedidos')}${th('Vendas')}${th('Ticket')}${th('Promoções loja')}${th('Taxas')}${th('Líquido')}${th('CMV')}${th('Motoboy')}${th('Impostos')}${th('Resultado')}${th('Margem')}<th></th></tr></thead>
        <tbody>${canais.map(c => { const v = c.itens + c.entregaLoja + c.servicoLoja; return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:10px 12px;font-weight:700">${_vcEsc(vcNomeCanal(c.canal))}</td>
          ${td(c.pedidos)}${td(_vcR(v), 'font-weight:600')}${td(_vcR(c.total / c.pedidos), 'color:var(--text2)')}
          ${td(_vcR(c.descLoja), 'color:var(--orange-dark)')}${td(_vcR(c.taxas), 'color:var(--orange-dark)')}${td(_vcR(c.liquido - c.mens), 'font-weight:600')}
          ${td(_vcR(c.cmv), 'color:var(--text2)')}${td(_vcR(c.motoboy), 'color:var(--text2)')}${td(_vcR(c.imposto), 'color:var(--text2)')}
          ${td(_vcR(c.resultado), `font-weight:800;color:${c.resultado < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}${td(_vcPct(c.resultado, v), 'font-weight:700')}
          <td style="padding:10px 12px"><button class="btn btn-ghost btn-xs" onclick="_vcCanalSel='${c.canal}';_vdSetAba('canal')">Extrato ${lc('chevron-right', 12, 'currentColor')}</button></td></tr>`; }).join('')
          || `<tr><td colspan="13" style="padding:30px;text-align:center;color:var(--muted)">Sem vendas no período</td></tr>`}</tbody>
      </table>
    </div>`;

  if (typeof Chart === 'undefined' || !document.getElementById('vcChartGeral')) return;
  _vcChartGeral?.destroy();
  const css = getComputedStyle(document.body), cor = (v, d) => css.getPropertyValue(v).trim() || d;
  const ds = (label, k, c) => ({ label, data: canais.map(x => +Math.max(0, typeof k === 'function' ? k(x) : x[k]).toFixed(2)), backgroundColor: c, borderRadius: 3 });
  _vcChartGeral = new Chart(document.getElementById('vcChartGeral'), {
    type: 'bar',
    data: { labels: canais.map(c => vcNomeCanal(c.canal)), datasets: [
      ds('CMV', 'cmv', '#B4B2A9'), ds('Promoções da loja', 'descLoja', cor('--chart-2', '#DC7A9E')), ds('Taxas', 'taxas', cor('--chart-3', '#D97706')),
      ds('Motoboy', 'motoboy', '#8B8FA3'), ds('Impostos', 'imposto', cor('--chart-5', '#2563EB')), ds('Resultado', 'resultado', cor('--chart-4', '#16A34A')),
    ] },
    options: { indexAxis: 'y', maintainAspectRatio: false,
      scales: { x: { stacked: true, ticks: { callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } }, y: { stacked: true } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${_vcR(c.raw)}` } } } },
  });
}

// ══════════════════════════════════════════════════════════════
// ABA POR CANAL — extrato
// ══════════════════════════════════════════════════════════════

let _vcCanalSel = 'ifood';
let _vcPedLimite = 100;

async function renderVendasPorCanal() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  if (!_per('vcanal').de) _perSetPresetSilencioso('vcanal', 'semana');
  const chips = () => VC_CANAIS_PADRAO.map(c => { const on = _vcCanalSel === c; return `<button onclick="_vcCanalSel='${c}';_vcPedLimite=100;renderVendasPorCanal()" style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
    border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${_vcEsc(vcNomeCanal(c))}</button>`; }).join('');
  const barra = () => _vcFiltros('vcanal', 'renderVendasPorCanal', chips() + `<button class="btn btn-outline btn-xs" onclick="vcConfigurarCanal('${_vcCanalSel}')">${lc('settings', 12, 'currentColor')} Configurar canal</button>`);
  el.innerHTML = barra() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw', 18, 'currentColor')} Montando o extrato…</div>`;
  const r = _perRange('vcanal');
  let peds;
  try { peds = (await vcCarregarPedidos(r.inicioISO, r.fimISO)).filter(p => p.canal === _vcCanalSel); }
  catch (e) { el.innerHTML = barra() + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${_vcEsc(e.message)}</div>`; return; }
  const c = vcCanalCfg(_vcCanalSel), mkt = c.tipo === 'marketplace';
  const s = vcSomar(peds);
  const mens = vcMensalidade(_vcCanalSel, r.inicioISO, r.fimISO);
  const linha = (t, v, sub = '', tipo = '') => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--border);${tipo === 'total' ? 'font-weight:800;font-size:var(--text-lg)' : ''}">
    <span>${t}${sub ? `<div style="font-size:var(--text-xs);color:var(--muted);font-weight:400">${sub}</div>` : ''}</span>
    <span style="white-space:nowrap;color:${tipo === 'menos' ? 'var(--danger-fg)' : tipo === 'mais' ? 'var(--success-fg)' : tipo === 'info' ? 'var(--muted)' : 'inherit'}">${tipo === 'menos' ? '− ' : tipo === 'mais' ? '+ ' : ''}${_vcR(Math.abs(v))}</span></div>`;
  const liquido = s.liquido - mens, resultado = s.resultado - mens;
  // Por forma de pagamento
  const porPag = {};
  peds.forEach(p => (p.pagamentos || 'Não informado').split(', ').forEach(m => { porPag[m] = (porPag[m] || 0) + 1; }));

  el.innerHTML = barra() + `
    ${_vcAvisoBackfill(s)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="margin:0;padding:18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
          <div style="font-size:var(--text-lg);font-weight:800">Extrato · ${_vcEsc(c.nome)}</div>
          <span style="font-size:var(--text-sm);color:var(--muted)">${s.pedidos} pedidos · ${_perLabel('vcanal')}</span></div>
        <div style="margin-top:10px">
          ${linha('Vendas (itens)', s.itens, 'valor dos produtos, antes dos descontos', 'mais')}
          ${s.entregaLoja ? linha('Taxa de entrega', s.entregaLoja, 'entregas feitas pela loja', 'mais') : ''}
          ${s.servicoLoja ? linha('Taxa de serviço / adicional', s.servicoLoja, '', 'mais') : ''}
          ${linha('Promoções e cupons da loja', s.descLoja, 'descontos pagos pela loja', 'menos')}
          ${s.descPlat ? linha(`Promoções pagas pelo ${_vcEsc(c.nome)}`, s.descPlat, 'não saem do seu bolso', 'info') : ''}
          ${s.comissao ? linha(`Comissão (${_n(c.comissaoPct).toLocaleString('pt-BR')}%)`, s.comissao, c.baseComissao === 'itens_entrega' ? 'sobre itens + entrega' : 'sobre o valor dos itens', 'menos') : ''}
          ${s.taxaPag ? linha(mkt ? `Taxa de pagamento online (${_n(c.taxaPagamentoPct).toLocaleString('pt-BR')}%)` : 'Taxas das formas de pagamento', s.taxaPag, '', 'menos') : ''}
          ${s.taxaFixa ? linha('Taxa fixa por pedido', s.taxaFixa, '', 'menos') : ''}
          ${mens ? linha('Mensalidade (proporcional)', mens, '', 'menos') : ''}
          ${linha('Líquido', liquido, mkt ? `repasse estimado ${_vcR(s.repasse - mens)}${s.direto ? ` · ${_vcR(s.direto)} recebido direto (dinheiro na entrega)` : ''}` : 'o que entra para a loja', 'total')}
        </div>
      </div>
      <div class="card" style="margin:0;padding:18px 20px">
        <div style="font-size:var(--text-lg);font-weight:800">Resultado do canal</div>
        <div style="margin-top:10px">
          ${linha('Líquido', liquido)}
          ${linha('CMV (ficha técnica)', s.cmv, _vcPct(s.cmv, s.itens) + ' das vendas', 'menos')}
          ${s.motoboy ? linha('Motoboy', s.motoboy, 'entregas próprias', 'menos') : ''}
          ${linha(`Impostos (${_n(c.impostoPct).toLocaleString('pt-BR')}%)`, s.imposto, '', 'menos')}
          ${linha('Resultado', resultado, `margem ${_vcPct(resultado, s.itens + s.entregaLoja + s.servicoLoja)} · ${_vcR(s.pedidos ? resultado / s.pedidos : 0)} por pedido`, 'total')}
        </div>
        <div style="margin-top:14px;font-size:var(--text-sm);color:var(--text2)"><strong>Formas de pagamento:</strong> ${Object.entries(porPag).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${_vcEsc(m)} (${n})`).join(' · ') || '—'}</div>
      </div>
    </div>
    <div class="card" style="margin:0;overflow-x:auto">
      <div style="padding:14px 16px;font-size:var(--text-md);font-weight:800;border-bottom:1.5px solid var(--border)">Pedidos</div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);min-width:1000px">
        <thead style="background:var(--surface2)"><tr>${['Pedido', 'Data', 'Pagamento', 'Vendas', 'Entrega', 'Promo loja', 'Promo plataforma', 'Comissão', 'Taxa pag.', 'Líquido', 'Motoboy', 'CMV', 'Resultado'].map((h, i) =>
          `<th style="padding:9px 10px;text-align:${i < 3 ? 'left' : 'right'};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${peds.slice(0, _vcPedLimite).map(p => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:8px 10px;font-weight:600;white-space:nowrap">#${p.num}${p.numExterno ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-weight:400">${_vcEsc(c.nome)} ${_vcEsc(p.numExterno)}</div>` : ''}</td>
          <td style="padding:8px 10px;white-space:nowrap;color:var(--text2)">${new Date(p.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td style="padding:8px 10px;color:var(--text2)">${_vcEsc(p.pagamentos || '—')}</td>
          ${[p.itens, p.entregaLoja, -p.descLoja, p.descPlat, -p.comissao, -p.taxaPag, p.liquido, -p.motoboy, -p.cmv, p.resultado].map((v, i) =>
            `<td style="padding:8px 10px;text-align:right;white-space:nowrap;${i === 6 || i === 9 ? 'font-weight:700' : ''};color:${i === 3 ? 'var(--muted)' : v < -0.004 ? 'var(--danger-fg)' : 'inherit'}">${Math.abs(v) < 0.005 ? '—' : _vcR(v)}</td>`).join('')}
        </tr>`).join('') || `<tr><td colspan="13" style="padding:30px;text-align:center;color:var(--muted)">Sem pedidos no período</td></tr>`}</tbody>
      </table>
      ${peds.length > _vcPedLimite ? `<div style="padding:10px 16px;border-top:1.5px solid var(--border)"><button class="btn btn-ghost btn-xs" onclick="_vcPedLimite+=200;renderVendasPorCanal()">Mostrar mais (${peds.length - _vcPedLimite})</button></div>` : ''}
    </div>`;
}

// ── Configurar canal ──

function vcConfigurarCanal(canal) {
  const c = vcCanalCfg(canal), mkt = c.tipo === 'marketplace';
  const num = (id, v, sufixo, dica = '') => _estCampo(`${sufixo}`, `<input class="inp" type="number" min="0" step="0.01" id="${id}" value="${v ?? 0}">`, '', dica);
  const chk = (id, on, txt) => `<label style="display:flex;align-items:center;gap:8px;font-size:var(--text-md);text-transform:none;letter-spacing:0;font-weight:400;cursor:pointer">
    <input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="accent-color:var(--purple);width:16px;height:16px"> ${txt}</label>`;
  const metodos = { ...{ pix_auto: 0, pix: 0, credit_card: 0, debit_card: 0, online_credit_card: 0, money: 0, debt_book: 0 }, ...(c.metodos || {}) };
  _estModal('ovVcCfg', `Configurar canal · ${_vcEsc(c.nome)}`, mkt ? `
    <div class="f2">
      ${num('vcComissao', c.comissaoPct, 'Comissão (%)')}
      ${_estCampo('Base da comissão', `<select class="inp" id="vcBase"><option value="itens"${c.baseComissao !== 'itens_entrega' ? ' selected' : ''}>Valor dos itens</option><option value="itens_entrega"${c.baseComissao === 'itens_entrega' ? ' selected' : ''}>Itens + taxa de entrega</option></select>`)}
    </div>
    <div class="f2">
      ${num('vcTaxaPag', c.taxaPagamentoPct, 'Taxa de pagamento online (%)', 'Sobre o que o cliente pagou pelo app.')}
      ${num('vcTaxaFixa', c.taxaFixa, 'Taxa fixa por pedido (R$)')}
    </div>
    <div class="f2">
      ${num('vcMensal', c.mensalidade, 'Mensalidade (R$/mês)', 'Rateada pelos dias do período.')}
      ${num('vcImposto', c.impostoPct, 'Impostos (%)')}
    </div>
    ${num('vcRepasse', c.repasseDias ?? 3, 'Repasse: dias depois do domingo', 'Semana de segunda a domingo. 3 = paga na quarta.')}
    <div class="fm-box" style="display:flex;flex-direction:column;gap:8px">
      ${chk('vcEntrega', c.entregaFicaLoja !== false, 'A taxa de entrega fica com a loja quando a entrega é própria')}
      ${chk('vcServico', c.servicoFicaPlataforma !== false, 'A taxa de serviço cobrada do cliente fica com a plataforma')}
      ${chk('vcMotoboy', c.contarMotoboy !== false, 'Descontar o motoboy no resultado do canal')}
    </div>` : `
    <div class="field"><label>Taxa por forma de pagamento (%)</label>
      <div class="fm-box" style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px">
        ${Object.entries(metodos).map(([k, v]) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--text-sm);text-transform:none;letter-spacing:0;font-weight:500">${_vcEsc(VC_PAGTO_LABEL[k] || k)}
          <input class="inp" type="number" min="0" step="0.01" data-metodo="${k}" value="${v}" style="width:80px;text-align:right"></label>`).join('')}
      </div>${_estDica('Taxa da maquininha ou do gateway sobre o valor pago em cada forma.')}</div>
    <div class="f2">
      ${num('vcTaxaFixa', c.taxaFixa, 'Taxa fixa por pedido (R$)')}
      ${num('vcMensal', c.mensalidade, 'Mensalidade (R$/mês)', 'Ex.: plano do Cardápio Web, se quiser ratear aqui.')}
    </div>
    ${num('vcImposto', c.impostoPct, 'Impostos (%)')}
    <div class="fm-box" style="display:flex;flex-direction:column;gap:8px">
      ${chk('vcMotoboy', c.contarMotoboy !== false, 'Descontar o motoboy no resultado do canal')}
      ${chk('vcDescontos', c.contarDescontos !== false, 'Descontar cupons e descontos da loja')}
    </div>`, `vcSalvarCanal('${canal}')`, 'Salvar', 560, 'Vale para todos os períodos e para o cálculo dos repasses.');
}

function vcSalvarCanal(canal) {
  const cfg = vcConfig();
  const c = { ...vcCanalCfg(canal) };
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const ch = id => !!document.getElementById(id)?.checked;
  c.taxaFixa = v('vcTaxaFixa'); c.mensalidade = v('vcMensal'); c.impostoPct = v('vcImposto'); c.contarMotoboy = ch('vcMotoboy');
  if (c.tipo === 'marketplace') {
    c.comissaoPct = v('vcComissao'); c.baseComissao = document.getElementById('vcBase').value; c.taxaPagamentoPct = v('vcTaxaPag');
    c.repasseDias = Math.round(v('vcRepasse')); c.entregaFicaLoja = ch('vcEntrega'); c.servicoFicaPlataforma = ch('vcServico');
  } else {
    c.metodos = {}; document.querySelectorAll('#ovVcCfg [data-metodo]').forEach(i => { c.metodos[i.dataset.metodo] = parseFloat(i.value) || 0; });
    c.contarDescontos = ch('vcDescontos');
  }
  cfg[canal] = c;
  vcSalvarConfig(cfg);
  Object.keys(_vcCache).forEach(k => delete _vcCache[k]);
  document.getElementById('ovVcCfg')?.remove();
  toast('Configuração do canal salva', 'ok');
  _vdRerender();
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
  const mensSemana = _n(c.mensalidade) * 7 / 30;
  _vcRepDados = semanas.map(s => {
    const ps = peds.filter(p => p.canal === _vcRepCanal && _estMs(p.ts) >= s.ini.getTime() && _estMs(p.ts) <= s.fim.getTime());
    const t = vcSomar(ps);
    const salvo = salvos.find(x => x.semana_inicio === _vcIso(s.ini));
    const estimado = _r2(t.repasse - mensSemana);
    return { ...s, t, estimado, salvo, pago: salvo?.valor_pago != null ? Number(salvo.valor_pago) : null, aberta: s.fim > hoje, futuro: s.rep > hoje };
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
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md);min-width:1000px">
        <thead style="background:var(--surface2)"><tr>${th('Semana', 'left')}${th('Repasse', 'left')}${th('Pedidos')}${th('Vendas')}${th('Promo loja')}${th('Comissão + taxas')}${th('Recebido direto')}${th('Estimado')}${th('Pago no extrato')}${th('Diferença')}${th('Extrato', 'left')}</tr></thead>
        <tbody>${_vcRepDados.map((x, k) => {
          const dif = x.pago != null ? x.pago - x.estimado : null;
          return `<tr style="border-top:1px solid var(--border);${x.aberta ? 'background:color-mix(in srgb, var(--info-bg) 35%, transparent)' : ''}">
            <td style="padding:10px 12px;white-space:nowrap;font-weight:600">${x.ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${x.fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${x.aberta ? ' <span class="badge b-purple" style="font-size:var(--text-2xs)">em andamento</span>' : ''}</td>
            <td style="padding:10px 12px;white-space:nowrap;color:var(--text2)">${x.rep.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
            <td style="padding:10px 12px;text-align:right">${x.t.pedidos}${x.t.semFinanceiro ? `<div style="font-size:var(--text-2xs);color:var(--warning-fg)" title="Pedidos ainda sem taxas e descontos lidos do Cardápio Web">${x.t.semFinanceiro} sem detalhe</div>` : ''}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap">${_vcR(x.t.itens + x.t.entregaLoja)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${_vcR(x.t.descLoja)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--orange-dark)">${_vcR(x.t.comissao + x.t.taxaPag + x.t.taxaFixa + mensSemana)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--text2)">${x.t.direto ? _vcR(x.t.direto) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;font-weight:700">${_vcR(x.estimado)}</td>
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
        Semana de segunda a domingo; o repasse cai ${dias} dia(s) depois do domingo. Estimado = líquido dos pedidos pelas taxas configuradas − o que o cliente pagou direto à loja${mensSemana ? ' − mensalidade proporcional' : ''}. Informe o valor que caiu (ou anexe o extrato do portal) para ver a diferença.</div>
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

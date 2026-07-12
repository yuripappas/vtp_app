/**
 * VTP Compras — Vai Ter Pizza!
 * vendas-ui.js — UI do módulo Vendas. Consome o motor js/vendas.js.
 *
 * Sub-abas: CMV · Produtos/Curva ABC · Insumos. Todas prontas.
 * Nenhuma lógica de interpretação aqui — tudo vem do motor (vendas.js).
 */

let _vdTab     = 'cmv';
let _vdPeriodo = 90;
let _vdCanal   = '';   // '' = todos
let _vdMetaCMV = 30;   // % meta de CMV
let _vdCatOpen = null; // categoria expandida no drill-down

function renderVendas() {
  const el = document.getElementById('vendasContent');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:18px">
      ${[['cmv','CMV'],['produtos','Produtos (Curva ABC)'],['insumos','Insumos']].map(([id,lbl]) =>
        `<button id="vd-tab-${id}" onclick="setVendasTab('${id}')" style="padding:9px 20px;font-size:.82rem;font-weight:600;color:${id===_vdTab?'var(--purple)':'var(--muted)'};border:none;border-bottom:3px solid ${id===_vdTab?'var(--purple)':'transparent'};margin-bottom:-2px;background:none;cursor:pointer;font-family:inherit">${lbl}</button>`).join('')}
    </div>
    <div id="vendasTabContent"></div>`;
  setVendasTab(_vdTab);
}

function setVendasTab(tab) {
  _vdTab = tab;
  ['cmv','produtos','insumos'].forEach(t => {
    const b = document.getElementById('vd-tab-' + t);
    if (b) { b.style.color = t === tab ? 'var(--purple)' : 'var(--muted)'; b.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent'; }
  });
  _vdRerender();
}

// Re-renderiza a aba atual (usado pelos filtros compartilhados)
function _vdRerender() {
  if (_vdTab === 'cmv')          renderVendasCMV();
  else if (_vdTab === 'insumos') renderVendasInsumos();
  else                           renderVendasProdutos();
}

// ── Filtros comuns ─────────────────────────────────────────────
// meta=true inclui o campo de meta de CMV (só faz sentido no filho CMV)
function _vdFiltros(meta) {
  const canais = ['ifood', '99food', 'site', 'outro'];
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
    ${[30,60,90].map(d => `<button class="btn btn-${d===_vdPeriodo?'primary':'outline'} btn-xs" onclick="_vdPeriodo=${d};_vdRerender()">${d} dias</button>`).join('')}
    <select class="inp" style="max-width:170px;font-size:.8rem;padding:6px 10px" onchange="_vdCanal=this.value;_vdRerender()">
      <option value="">Todos os canais</option>
      ${canais.map(c => `<option value="${c}"${c===_vdCanal?' selected':''}>${c}</option>`).join('')}
    </select>
    ${meta ? `<div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)">Meta de CMV
      <input type="number" class="inp" value="${_vdMetaCMV}" min="0" max="100" onchange="_vdMetaCMV=parseFloat(this.value)||30;renderVendasCMV()" style="width:62px;text-align:right;font-size:.8rem;padding:6px 8px">%
    </div>` : '<div style="margin-left:auto"></div>'}
    <button class="btn btn-outline btn-xs" onclick="_vLinhas=null;_vdRerender()">${lc('refresh-cw',12,'currentColor')} Atualizar</button>
  </div>`;
}

const _VD_CAT_ICON = {
  'Promo do Dia':'tag', 'Vai Ter Combo':'layers', 'Monte seu Sabor':'pizza',
  'Pizza Salgada':'pizza', 'Pizza Doce':'pizza', 'Bebidas':'coffee',
};

// ── Filho CMV ──────────────────────────────────────────────────
async function renderVendasCMV() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _vdFiltros(true) + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos do Cardápio Web...</div>`;

  let linhas;
  try { linhas = await vendasCarregar(_vdPeriodo); }
  catch (e) { el.innerHTML = _vdFiltros(true) + `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui ler os pedidos: ${e.message}</div>`; return; }
  if (_vdCanal) linhas = linhas.filter(l => l.canal === _vdCanal);

  const cat  = vendasPorCategoria(linhas);
  const prod = vendasProdutosPorCategoria(linhas);
  const pend = vendasPendencias(linhas);

  const tot = { vendas: 0, receita: 0, custo: 0 };
  for (const c of VENDAS_CATEGORIAS) { tot.vendas += cat[c].vendas; tot.receita += cat[c].receita; tot.custo += cat[c].custo; }
  const cmvGeral = tot.receita > 0 ? tot.custo / tot.receita * 100 : 0;
  const margem   = tot.receita - tot.custo;
  const corMeta  = pc => pc <= 0 ? 'var(--muted)' : pc > _vdMetaCMV ? 'var(--red)' : 'var(--green)';

  const kpi = (lbl, val, cor) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.5rem;font-weight:800;${cor ? 'color:' + cor : ''}">${val}</div></div>`;

  const nPend = pend.sabPend.length + pend.bebPend.length;
  const banner = nPend ? `<div class="card" style="padding:12px 16px;margin-bottom:16px;border-color:var(--warning-fg,#D97706);background:var(--warning-bg,#FEF3C7)">
      <div style="font-size:.84rem;font-weight:700;color:var(--warning-fg,#B45309)">${lc('alert-triangle',14,'currentColor')} CMV parcial — ${nPend} item(ns) vendidos sem ficha técnica</div>
      <div style="font-size:.76rem;color:var(--warning-fg,#92400E);margin-top:3px">${[...pend.sabPend,...pend.bebPend].slice(0,6).map(s=>_cwTitulo(s.nome)+' ('+s.vendas+')').join(' · ')}${nPend>6?' …':''}</div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:5px">Cadastre a ficha em <b>Configurações → Produtos</b> para o custo entrar no cálculo.</div>
    </div>` : '';

  const linhaCat = (nome) => {
    const d = cat[nome]; if (!d || !d.vendas) return '';
    const pc = d.receita > 0 ? d.custo / d.receita * 100 : 0;
    const aberta = _vdCatOpen === nome;
    return `<div class="card" style="padding:0;margin-bottom:8px;overflow:hidden">
      <div onclick="_vdCatOpen='${aberta ? '' : nome}';renderVendasCMV()" style="display:grid;grid-template-columns:22px 1.4fr 1fr 1fr 90px 1fr;gap:12px;align-items:center;padding:13px 16px;cursor:pointer">
        <span style="color:var(--muted);display:inline-flex;transform:rotate(${aberta?90:0}deg);transition:transform .15s">${lc('chevron-right',16,'currentColor')}</span>
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:.9rem">${lc(_VD_CAT_ICON[nome]||'pizza',16,'var(--purple)')} ${nome}</div>
        <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">RECEITA</div><div style="font-weight:700">R$ ${fmt(d.receita)}</div></div>
        <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">CUSTO</div><div style="font-weight:700">R$ ${fmt(d.custo)}</div></div>
        <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">CMV</div><div style="font-weight:800;color:${corMeta(pc)}">${d.custo>0?fmt(pc)+'%':'—'}</div></div>
        <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">MARGEM</div><div style="font-weight:700">R$ ${fmt(d.receita-d.custo)}</div></div>
      </div>
      ${aberta ? _vdDrillCategoria(prod[nome]) : ''}
    </div>`;
  };

  el.innerHTML = _vdFiltros(true) + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px">Interpretado de <b>${_vdPeriodo} dias</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''} · ${tot.vendas} linhas de venda</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Receita', 'R$ ' + fmt(tot.receita))}
      ${kpi('Custo (CMV)', 'R$ ' + fmt(tot.custo))}
      ${kpi('CMV', tot.custo>0?fmt(cmvGeral)+'%':'—', corMeta(cmvGeral))}
      ${kpi('Margem', 'R$ ' + fmt(margem))}
    </div>
    ${banner}
    <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Por categoria <span style="font-weight:400;text-transform:none">— clique para ver o detalhe</span></div>
    ${VENDAS_CATEGORIAS.map(linhaCat).join('')}`;
}

// Drill-down: opções/bebidas vendidas na categoria, com custo de ficha
function _vdDrillCategoria(dados) {
  if (!dados) return '';
  const itens = [];
  for (const [k, meias] of Object.entries(dados.sabores || {})) {
    const opc = vendasOpcaoDeSabor(k);
    const custoUn = vendasCustoOpcao(k);
    itens.push({ nome: opc ? opc.nome : _cwTitulo(k), qtd: meias, unid: 'meias', custoUn, custoTot: custoUn * meias, temFicha: opc?.fichaTecnica?.ingredientes?.length > 0 });
  }
  for (const [k, q] of Object.entries(dados.bebidas || {})) {
    const c = _cwRank(k, _cwPoolBebidas(), 'nome', 1)[0];
    const alvo = (c && c.s >= 0.6) ? c.x : null;
    const item = alvo ? (alvo.tipo === 'produto' ? produtos.find(p => p.id === alvo.id) : items.find(i => i.id === alvo.id)) : null;
    const custoUn = item?.fichaTecnica ? _calcCustoFicha(item.fichaTecnica) : (item?.cost || 0);
    itens.push({ nome: item ? (item.name || item.nome) : _cwTitulo(k), qtd: q, unid: 'un', custoUn, custoTot: custoUn * q, temFicha: !!item });
  }
  itens.sort((a, b) => b.custoTot - a.custoTot);
  if (!itens.length) return '';
  return `<div style="border-top:1px solid var(--border);background:var(--surface2)">
    ${itens.map(x => `<div style="display:grid;grid-template-columns:22px 1.4fr 1fr 1fr 90px 1fr;gap:12px;align-items:center;padding:8px 16px;font-size:.82rem">
      <span></span>
      <div>${x.nome} ${x.temFicha?'':`<span style="font-size:.66rem;background:var(--yellow-light);color:var(--warning-fg,#B45309);padding:1px 6px;border-radius:var(--r6);margin-left:4px">sem ficha</span>`}</div>
      <div style="text-align:right;color:var(--muted)">${x.qtd} ${x.unid}</div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(x.custoUn)}</div>
      <div></div>
      <div style="text-align:right;font-weight:600">R$ ${fmt(x.custoTot)}</div>
    </div>`).join('')}
  </div>`;
}


// ══════════════════════════════════════════════════════════════
// Filho INSUMOS — quanto de cada insumo saiu por período
// Expande a ficha técnica de cada pizza vendida. Só entram insumos
// que estão em alguma ficha. % é por CUSTO (unidades diferentes não
// somam em quantidade).
// ══════════════════════════════════════════════════════════════

let _inPreset = '15';   // 'hoje' | '7' | '15' | '30' | '90' | 'custom'
let _inDe     = '';     // yyyy-mm-dd (custom)
let _inAte    = '';
let _inBusca  = '';
let _inChart  = null;   // instância Chart.js

const _IN_PRESETS = [['hoje','Hoje'],['7','7 dias'],['15','15 dias'],['30','30 dias'],['90','90 dias'],['custom','Personalizado']];

// Resolve o preset atual em { inicioISO, fimISO, label }
function _inRange() {
  const now = new Date();
  const fimISO = now.toISOString();
  if (_inPreset === 'custom' && _inDe) {
    const ini = new Date(_inDe + 'T00:00:00');
    const fim = _inAte ? new Date(_inAte + 'T23:59:59') : now;
    return { inicioISO: ini.toISOString(), fimISO: fim.toISOString(), label: `${_inDe} a ${_inAte || 'hoje'}`, dias: Math.max(1, Math.round((fim - ini) / 864e5)) };
  }
  if (_inPreset === 'hoje') {
    const ini = new Date(now); ini.setHours(0, 0, 0, 0);
    return { inicioISO: ini.toISOString(), fimISO, label: 'hoje', dias: 1 };
  }
  const d = parseInt(_inPreset) || 15;
  return { inicioISO: new Date(now - d * 864e5).toISOString(), fimISO, label: `${d} dias`, dias: d };
}

function _inFiltros() {
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
    ${_IN_PRESETS.map(([id,lbl]) => `<button class="btn btn-${id===_inPreset?'primary':'outline'} btn-xs" onclick="_inPreset='${id}';renderVendasInsumos()">${lbl}</button>`).join('')}
    ${_inPreset === 'custom' ? `
      <input type="date" class="inp" value="${_inDe}" onchange="_inDe=this.value;renderVendasInsumos()" style="font-size:.78rem;padding:5px 8px">
      <span style="color:var(--muted);font-size:.8rem">até</span>
      <input type="date" class="inp" value="${_inAte}" onchange="_inAte=this.value;renderVendasInsumos()" style="font-size:.78rem;padding:5px 8px">` : ''}
    <div style="position:relative;margin-left:auto">
      <input class="inp" id="inBusca" placeholder="Buscar insumo..." value="${_inBusca.replace(/"/g,'&quot;')}" oninput="_inBusca=this.value;_inRenderTabela()" style="width:220px;font-size:.8rem;padding:6px 10px 6px 30px">
      <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none">${lc('search',14,'currentColor')}</span>
    </div>
    <button class="btn btn-outline btn-xs" onclick="_inReload()">${lc('refresh-cw',12,'currentColor')} Atualizar</button>
  </div>`;
}

let _inDados = null; // { insumos, custoTotal } do período atual

function _inReload() {
  const r = _inRange();
  delete _vCache[r.inicioISO + '|' + r.fimISO];
  renderVendasInsumos();
}

async function renderVendasInsumos() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  const r = _inRange();
  el.innerHTML = _inFiltros() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Somando os insumos vendidos...</div>`;

  let linhas;
  try { linhas = await vendasCarregarPeriodo(r.inicioISO, r.fimISO); }
  catch (e) { el.innerHTML = _inFiltros() + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${e.message}</div>`; return; }
  if (_vdCanal) linhas = linhas.filter(l => l.canal === _vdCanal);

  _inDados = vendasInsumosConsumidos(linhas);
  const { insumos, custoTotal } = _inDados;

  const kpi = (lbl, val, sub) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.5rem;font-weight:800">${val}</div>${sub?`<div style="font-size:.72rem;color:var(--muted)">${sub}</div>`:''}</div>`;

  const top = insumos[0];
  el.innerHTML = _inFiltros() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px">Insumos consumidos nas pizzas vendidas em <b>${r.label}</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''} — expandido da ficha técnica.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Insumos distintos', insumos.length)}
      ${kpi('Custo total', 'R$ ' + fmt(custoTotal), 'valor dos insumos no período')}
      ${kpi('Maior consumo', top ? top.nome : '—', top ? fmt(top.pct) + '% do custo' : '')}
    </div>
    ${insumos.length ? `
    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Top insumos por custo (R$) — grande vs pequena</div>
      <div style="height:${Math.max(180, Math.min(12, insumos.length) * 34)}px"><canvas id="inChart"></canvas></div>
    </div>` : ''}
    <div id="inTabelaWrap"></div>`;

  _inRenderChart();
  _inRenderTabela();
}

function _inRenderChart() {
  if (typeof Chart === 'undefined') return;
  const cv = document.getElementById('inChart');
  if (!cv || !_inDados) return;
  if (_inChart) { _inChart.destroy(); _inChart = null; }
  const top = _inDados.insumos.slice(0, 12);
  const css = getComputedStyle(document.body);
  const cG = css.getPropertyValue('--chart-1').trim() || '#6B21D4';
  const cP = css.getPropertyValue('--chart-3').trim() || '#D97706';
  const txt = css.getPropertyValue('--muted').trim() || '#888';
  _inChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: top.map(x => x.nome),
      datasets: [
        { label: 'Grande', data: top.map(x => +(x.grande * x.custoUn).toFixed(2)), backgroundColor: cG, borderRadius: 3 },
        { label: 'Pequena', data: top.map(x => +(x.pequena * x.custoUn).toFixed(2)), backgroundColor: cP, borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: txt, callback: v => 'R$ ' + v }, grid: { color: 'rgba(0,0,0,.06)' } },
        y: { stacked: true, ticks: { color: txt, font: { size: 11 } }, grid: { display: false } },
      },
      plugins: {
        legend: { labels: { color: txt, boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: R$ ${fmt(c.raw)}` } },
      },
    },
  });
}

function _inRenderTabela() {
  const wrap = document.getElementById('inTabelaWrap');
  if (!wrap || !_inDados) return;
  const q = _cwNorm(_inBusca);
  const lista = _inDados.insumos.filter(x => !q || _cwNorm(x.nome).includes(q));
  if (!lista.length) { wrap.innerHTML = `<div class="ft-empty-list">${_inDados.insumos.length ? 'Nenhum insumo com esse nome' : 'Nenhum insumo — cadastre fichas técnicas com insumos primeiro'}</div>`; return; }
  const nf = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
  wrap.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1.1fr 80px;gap:12px;padding:10px 16px;background:var(--surface2);font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
      <div>Insumo</div><div style="text-align:right">Pizza Grande</div><div style="text-align:right">Pizza Pequena</div><div style="text-align:right">Total</div><div style="text-align:right">% custo</div>
    </div>
    ${lista.map(x => `<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1.1fr 80px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem">
      <div><span style="font-weight:600">${x.nome}</span> <span style="font-size:.66rem;color:var(--muted)">${x.unidade}</span></div>
      <div style="text-align:right;color:var(--muted)">${nf(x.grande)}</div>
      <div style="text-align:right;color:var(--muted)">${nf(x.pequena)}</div>
      <div style="text-align:right;font-weight:700">${nf(x.total)} <span style="font-size:.66rem;color:var(--muted)">${x.unidade}</span></div>
      <div style="text-align:right;font-weight:700;color:var(--purple)">${fmt(x.pct)}%</div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// Filho PRODUTOS / CURVA ABC — campeões de venda e comportamento
// ══════════════════════════════════════════════════════════════

let _prMetrica = 'qtd';   // 'qtd' (meias) | 'receita'
let _prChartABC = null;
let _prChartHora = null;

async function renderVendasProdutos() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _vdFiltros(false) + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos...</div>`;

  let linhas;
  try { linhas = await vendasCarregar(_vdPeriodo); }
  catch (e) { el.innerHTML = _vdFiltros(false) + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${e.message}</div>`; return; }
  if (_vdCanal) linhas = linhas.filter(l => l.canal === _vdCanal);

  const abc  = vendasABCsabores(linhas, _prMetrica);
  const comp = vendasComportamento(linhas);

  const isRec = _prMetrica === 'receita';
  const val = v => isRec ? 'R$ ' + fmt(v) : fmt(v);

  // Contagem por classe
  const nCl = { A: 0, B: 0, C: 0 };
  abc.itens.forEach(x => nCl[x.classe]++);
  const corCl = c => c === 'A' ? 'var(--green)' : c === 'B' ? 'var(--orange-dark)' : 'var(--muted)';
  const bgCl  = c => c === 'A' ? 'var(--green-light)' : c === 'B' ? 'var(--orange-light)' : 'var(--surface2)';

  const kpi = (lbl, v, sub) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.4rem;font-weight:800">${v}</div>${sub?`<div style="font-size:.72rem;color:var(--muted)">${sub}</div>`:''}</div>`;

  const toggle = `<div style="display:inline-flex;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
    ${[['qtd','Quantidade'],['receita','Receita']].map(([id,lbl])=>`<button onclick="_prMetrica='${id}';renderVendasProdutos()" style="padding:6px 14px;font-size:.78rem;font-weight:600;border:none;cursor:pointer;background:${id===_prMetrica?'var(--purple)':'transparent'};color:${id===_prMetrica?'#fff':'var(--muted)'}">${lbl}</button>`).join('')}
  </div>`;

  el.innerHTML = _vdFiltros(false) + `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div style="font-size:.82rem;color:var(--muted)">Curva ABC de sabores em <b>${_vdPeriodo} dias</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''}${isRec?' · <span style="font-style:italic">receita de combos rateada por porção</span>':''}</div>
      ${toggle}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Sabores', abc.itens.length)}
      ${kpi('Classe A', nCl.A, '80% do volume')}
      ${kpi('Classe B', nCl.B, 'próximos 15%')}
      ${kpi('Classe C', nCl.C, 'cauda — 5%')}
    </div>

    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Pareto — ${isRec?'receita':'meias vendidas'} por sabor (barras) e acumulado % (linha)</div>
      <div style="height:300px"><canvas id="prChartABC"></canvas></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
      <div style="display:grid;grid-template-columns:40px 1.6fr 1fr 1fr 100px 90px;gap:12px;padding:10px 16px;background:var(--surface2);font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
        <div>ABC</div><div>Sabor</div><div style="text-align:right">Grande</div><div style="text-align:right">Pequena</div><div style="text-align:right">${isRec?'Receita':'Meias'}</div><div style="text-align:right">Acum.</div>
      </div>
      ${abc.itens.map(x => `<div style="display:grid;grid-template-columns:40px 1.6fr 1fr 1fr 100px 90px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem">
        <div><span style="display:inline-block;width:22px;text-align:center;font-weight:800;font-size:.74rem;color:${corCl(x.classe)};background:${bgCl(x.classe)};border-radius:var(--r6);padding:2px 0">${x.classe}</span></div>
        <div style="font-weight:600">${x.nome}</div>
        <div style="text-align:right;color:var(--muted)">${x.grande}</div>
        <div style="text-align:right;color:var(--muted)">${x.pequena}</div>
        <div style="text-align:right;font-weight:700">${val(x.valor)}</div>
        <div style="text-align:right;color:var(--muted)">${fmt(x.cumPct)}%</div>
      </div>`).join('') || '<div class="ft-empty-list" style="padding:14px">Sem dados no período</div>'}
    </div>

    <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Comportamento de compra</div>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px">
      <div class="card" style="padding:16px"><div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">Pedidos por hora do dia</div><div style="height:200px"><canvas id="prChartHora"></canvas></div></div>
      <div class="card" style="padding:16px">
        <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px">Pedidos por canal</div>
        ${_prCanalBars(comp.porCanal)}
      </div>
    </div>`;

  _prRenderCharts(abc, comp);
}

function _prCanalBars(porCanal) {
  const ents = Object.entries(porCanal).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(1, ...ents.map(e=>e[1]));
  const tot = ents.reduce((s,e)=>s+e[1],0) || 1;
  return ents.map(([c,n],i)=>`<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px"><span style="font-weight:600">${c}</span><span style="color:var(--muted)">${n} · ${fmt(n/tot*100)}%</span></div>
    <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden"><div style="width:${(n/max*100).toFixed(0)}%;height:100%;background:var(--chart-${(i%8)+1},var(--brand-purple))"></div></div>
  </div>`).join('') || '<div style="color:var(--muted);font-size:.82rem">Sem dados</div>';
}

function _prRenderCharts(abc, comp) {
  if (typeof Chart === 'undefined') return;
  const css = getComputedStyle(document.body);
  const c1 = css.getPropertyValue('--chart-1').trim() || '#6B21D4';
  const c3 = css.getPropertyValue('--chart-3').trim() || '#D97706';
  const txt = css.getPropertyValue('--muted').trim() || '#888';

  // Pareto ABC
  if (_prChartABC) { _prChartABC.destroy(); _prChartABC = null; }
  const cvA = document.getElementById('prChartABC');
  if (cvA) {
    const top = abc.itens.slice(0, 15);
    _prChartABC = new Chart(cvA, {
      data: {
        labels: top.map(x => x.nome),
        datasets: [
          { type: 'bar', label: _prMetrica === 'receita' ? 'Receita' : 'Meias', data: top.map(x => +x.valor.toFixed(2)), backgroundColor: top.map(x => x.classe==='A'?c1:x.classe==='B'?c3:'#B4B2A9'), borderRadius: 3, yAxisID: 'y' },
          { type: 'line', label: 'Acumulado %', data: top.map(x => +x.cumPct.toFixed(1)), borderColor: '#E24B4A', backgroundColor: '#E24B4A', pointRadius: 2, tension: .3, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: txt, font: { size: 10 }, maxRotation: 55, minRotation: 45 }, grid: { display: false } },
          y: { position: 'left', ticks: { color: txt }, grid: { color: 'rgba(0,0,0,.06)' } },
          y1: { position: 'right', min: 0, max: 100, ticks: { color: txt, callback: v => v + '%' }, grid: { display: false } },
        },
        plugins: { legend: { labels: { color: txt, boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }

  // Pedidos por hora
  if (_prChartHora) { _prChartHora.destroy(); _prChartHora = null; }
  const cvH = document.getElementById('prChartHora');
  if (cvH) {
    _prChartHora = new Chart(cvH, {
      type: 'bar',
      data: { labels: comp.porHora.map((_, h) => h + 'h'), datasets: [{ label: 'Pedidos', data: comp.porHora, backgroundColor: c1, borderRadius: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { ticks: { color: txt, font: { size: 9 }, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: txt }, grid: { color: 'rgba(0,0,0,.06)' } } },
        plugins: { legend: { display: false } },
      },
    });
  }
}

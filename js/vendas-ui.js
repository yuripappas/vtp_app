/**
 * VTP Compras — Vai Ter Pizza!
 * vendas-ui.js — UI do módulo Vendas. Consome o motor js/vendas.js.
 *
 * Filhos: CMV · Produtos/Curva ABC · Insumos · Canais · Precificação.
 * Navegação entre filhos é pelo sub-panel do sidebar (padrão da
 * plataforma, igual Compras/Operação) — não por abas dentro da página.
 * Ver _handleNavVendas() / _VENDAS_SUBMENU_ITEMS em js/utils.js.
 * Nenhuma lógica de interpretação aqui — tudo vem do motor (vendas.js).
 */

let _vdTab     = 'cmv';
let _vdPeriodo = 90;
let _vdCanal   = '';   // '' = todos
let _vdMetaCMV = 30;   // % meta de CMV
let _vdCatOpen = null; // categoria expandida no drill-down

// Intervalo personalizado — só usado pelo CMV (pra conferir período exato
// contra o relatório do Cardápio Web), não mexe no filtro rápido (30/60/90
// dias) compartilhado com os outros filhos de Vendas.
let _vdCmvCustomOn = false;
let _vdCmvDe  = '';
let _vdCmvAte = '';

function renderVendas() {
  const el = document.getElementById('vendasContent');
  if (!el) return;
  const item = (typeof _VENDAS_SUBMENU_ITEMS !== 'undefined' && _VENDAS_SUBMENU_ITEMS.find(i => i.id === _vdTab)) || { icon: 'bar-chart-2', label: 'Vendas' };
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px">
      ${lc(item.icon, 18, 'var(--purple)')}
      <span style="font-size:1.05rem;font-weight:700">${item.label}</span>
    </div>
    <div id="vendasTabContent"></div>`;
  _vdRerender();
}

// Re-renderiza o filho atual (usado pelos filtros compartilhados)
function _vdRerender() {
  if (_vdTab === 'cmv')          renderVendasCMV();
  else if (_vdTab === 'insumos') renderVendasInsumos();
  else if (_vdTab === 'canais')  renderVendasCanais();
  else if (_vdTab === 'precos')  renderVendasPrecos();
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

// Resolve o intervalo personalizado do CMV, se ligado — null se deve usar o
// filtro rápido (_vdPeriodo) normal.
function _vdCmvRange() {
  if (!_vdCmvCustomOn || !_vdCmvDe) return null;
  const ini = new Date(_vdCmvDe + 'T00:00:00');
  const fim = _vdCmvAte ? new Date(_vdCmvAte + 'T23:59:59') : new Date();
  return { inicioISO: ini.toISOString(), fimISO: fim.toISOString(), label: `${_vdCmvDe} a ${_vdCmvAte || 'hoje'}` };
}

// Filtros do CMV — igual ao _vdFiltros compartilhado, mais o intervalo
// personalizado (só existe aqui, não afeta Produtos/Canais/Precificação).
function _vdFiltrosCmv() {
  const canais = ['ifood', '99food', 'site', 'outro'];
  const custom = _vdCmvCustomOn;
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
    ${[30,60,90].map(d => `<button class="btn btn-${!custom && d===_vdPeriodo?'primary':'outline'} btn-xs" onclick="_vdCmvCustomOn=false;_vdPeriodo=${d};renderVendasCMV()">${d} dias</button>`).join('')}
    <button class="btn btn-${custom?'primary':'outline'} btn-xs" onclick="_vdCmvCustomOn=true;renderVendasCMV()">${lc('calendar',12,'currentColor')} Período exato</button>
    ${custom ? `
      <input type="date" class="inp" value="${_vdCmvDe}" onchange="_vdCmvDe=this.value;renderVendasCMV()" style="font-size:.8rem;padding:6px 8px">
      <span style="color:var(--muted);font-size:.8rem">até</span>
      <input type="date" class="inp" value="${_vdCmvAte}" onchange="_vdCmvAte=this.value;renderVendasCMV()" style="font-size:.8rem;padding:6px 8px">` : ''}
    <select class="inp" style="max-width:170px;font-size:.8rem;padding:6px 10px" onchange="_vdCanal=this.value;renderVendasCMV()">
      <option value="">Todos os canais</option>
      ${canais.map(c => `<option value="${c}"${c===_vdCanal?' selected':''}>${c}</option>`).join('')}
    </select>
    <div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)">Meta de CMV
      <input type="number" class="inp" value="${_vdMetaCMV}" min="0" max="100" onchange="_vdMetaCMV=parseFloat(this.value)||30;renderVendasCMV()" style="width:62px;text-align:right;font-size:.8rem;padding:6px 8px">%
    </div>
    <button class="btn btn-outline btn-xs" onclick="${custom ? '_vdCmvReload()' : '_vLinhas=null;renderVendasCMV()'}">${lc('refresh-cw',12,'currentColor')} Atualizar</button>
  </div>`;
}

// Recarrega o período personalizado (limpa só o cache daquele intervalo)
function _vdCmvReload() {
  const r = _vdCmvRange();
  if (r) delete _vCache[r.inicioISO + '|' + r.fimISO];
  renderVendasCMV();
}

// ── Filho CMV ──────────────────────────────────────────────────
async function renderVendasCMV() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _vdFiltrosCmv() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos do Cardápio Web...</div>`;

  const range = _vdCmvRange();
  let linhas;
  try { linhas = range ? await vendasCarregarPeriodo(range.inicioISO, range.fimISO) : await vendasCarregar(_vdPeriodo); }
  catch (e) { el.innerHTML = _vdFiltrosCmv() + `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui ler os pedidos: ${e.message}</div>`; return; }
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

  el.innerHTML = _vdFiltrosCmv() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px">Interpretado de <b>${range ? range.label : _vdPeriodo + ' dias'}</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''} · ${tot.vendas} linhas de venda</div>
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

// Drill-down: opções/bebidas vendidas na categoria, com custo de ficha.
// Pizza Grande/Pequena entram como linhas próprias (custo da massa, caixa,
// embalagem — separado do recheio) sempre no topo; sabores mostram a
// quantidade total de meias já dividida por tamanho.
function _vdDrillCategoria(dados) {
  if (!dados) return '';
  const base = [];
  if (dados.pizzasGrande) {
    const custoUn = vendasCustoBase('grande');
    base.push({ nome: 'Pizza Grande — massa, caixa e embalagem', qtdHtml: `${dados.pizzasGrande} un`, custoUn, custoTot: custoUn * dados.pizzasGrande, temFicha: custoUn > 0, destaque: true });
  }
  if (dados.pizzasPequena) {
    const custoUn = vendasCustoBase('pequena');
    base.push({ nome: 'Pizza Pequena — massa, caixa e embalagem', qtdHtml: `${dados.pizzasPequena} un`, custoUn, custoTot: custoUn * dados.pizzasPequena, temFicha: custoUn > 0, destaque: true });
  }

  const itens = [];
  for (const [k, m] of Object.entries(dados.sabores || {})) {
    const opc = vendasOpcaoDeSabor(k);
    const custoUn = vendasCustoOpcao(k);
    const qtdHtml = `${m.total} meias<div style="font-size:.7rem;color:var(--muted);font-weight:400">${m.grande} grande · ${m.pequena} pequena</div>`;
    itens.push({ nome: opc ? opc.nome : _cwTitulo(k), qtdHtml, custoUn, custoTot: custoUn * m.total, temFicha: opc?.fichaTecnica?.ingredientes?.length > 0 });
  }
  for (const [k, q] of Object.entries(dados.bebidas || {})) {
    const c = _cwRank(k, _cwPoolBebidas(), 'nome', 1)[0];
    const alvo = (c && c.s >= 0.6) ? c.x : null;
    const item = alvo ? (alvo.tipo === 'produto' ? produtos.find(p => p.id === alvo.id) : items.find(i => i.id === alvo.id)) : null;
    const custoUn = item?.fichaTecnica ? _calcCustoFicha(item.fichaTecnica) : (item?.cost || 0);
    itens.push({ nome: item ? (item.name || item.nome) : _cwTitulo(k), qtdHtml: `${q} un`, custoUn, custoTot: custoUn * q, temFicha: !!item });
  }
  itens.sort((a, b) => b.custoTot - a.custoTot);

  const todos = [...base, ...itens];
  if (!todos.length) return '';
  return `<div style="border-top:1px solid var(--border);background:var(--surface2)">
    ${todos.map(x => `<div style="display:grid;grid-template-columns:22px 1.4fr 1fr 1fr 90px 1fr;gap:12px;align-items:center;padding:8px 16px;font-size:.82rem;${x.destaque?'background:var(--surface);font-weight:600':''}">
      <span></span>
      <div>${x.nome} ${x.temFicha?'':`<span style="font-size:.66rem;background:var(--yellow-light);color:var(--warning-fg,#B45309);padding:1px 6px;border-radius:var(--r6);margin-left:4px">sem ficha</span>`}</div>
      <div style="text-align:right;color:var(--muted)">${x.qtdHtml}</div>
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

// ══════════════════════════════════════════════════════════════
// Filho CANAIS — margem líquida por canal (comissão descontada)
// A comissão % é cadastro editável aqui mesmo (persistido).
// ══════════════════════════════════════════════════════════════

let _cnChart = null;
function _cnComissoes() {
  return db._get('vtp_canais_comissao', { ifood: 23, '99food': 20, site: 0, outro: 0 });
}
function _cnSetComissao(canal, pct) {
  const c = _cnComissoes();
  c[canal] = parseFloat(pct) || 0;
  db._set('vtp_canais_comissao', c);
  renderVendasCanais();
}

async function renderVendasCanais() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _vdFiltros(false) + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos...</div>`;

  let linhas;
  try { linhas = await vendasCarregar(_vdPeriodo); }
  catch (e) { el.innerHTML = _vdFiltros(false) + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${e.message}</div>`; return; }

  const porCanal = vendasPorCanal(linhas);
  const com = _cnComissoes();
  const canais = Object.values(porCanal).sort((a, b) => b.receita - a.receita).map(c => {
    const pct = com[c.canal] ?? 0;
    const comissao = c.receita * pct / 100;
    const margem = c.receita - c.custo - comissao;
    return { ...c, pct, comissao, margem, margemPct: c.receita > 0 ? margem / c.receita * 100 : 0 };
  });

  const tot = canais.reduce((a, c) => ({ receita: a.receita + c.receita, custo: a.custo + c.custo, comissao: a.comissao + c.comissao, margem: a.margem + c.margem }), { receita: 0, custo: 0, comissao: 0, margem: 0 });

  const kpi = (lbl, v, sub, cor) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.4rem;font-weight:800;${cor?'color:'+cor:''}">${v}</div>${sub?`<div style="font-size:.72rem;color:var(--muted)">${sub}</div>`:''}</div>`;

  el.innerHTML = _vdFiltros(false) + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:16px">Rentabilidade por canal em <b>${_vdPeriodo} dias</b> — receita real do canal menos custo (ficha) e comissão. Ajuste a comissão de cada canal abaixo.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Receita bruta', 'R$ ' + fmt(tot.receita))}
      ${kpi('Comissão total', 'R$ ' + fmt(tot.comissao), tot.receita>0?fmt(tot.comissao/tot.receita*100)+'% da receita':'')}
      ${kpi('Margem líquida', 'R$ ' + fmt(tot.margem), '', tot.margem<0?'var(--red)':'var(--green)')}
    </div>

    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Composição da receita por canal (R$)</div>
      <div style="height:${Math.max(160, canais.length*48)}px"><canvas id="cnChart"></canvas></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="display:grid;grid-template-columns:1.1fr 70px 1fr 1fr 90px 1fr 1fr 90px;gap:10px;padding:10px 16px;background:var(--surface2);font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">
        <div>Canal</div><div style="text-align:right">Vendas</div><div style="text-align:right">Receita</div><div style="text-align:right">Custo</div><div style="text-align:center">Comissão %</div><div style="text-align:right">Comissão R$</div><div style="text-align:right">Margem líq.</div><div style="text-align:right">Margem %</div>
      </div>
      ${canais.map(c => `<div style="display:grid;grid-template-columns:1.1fr 70px 1fr 1fr 90px 1fr 1fr 90px;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem">
        <div style="font-weight:700">${c.canal}</div>
        <div style="text-align:right;color:var(--muted)">${c.vendas}</div>
        <div style="text-align:right;font-weight:600">R$ ${fmt(c.receita)}</div>
        <div style="text-align:right;color:var(--muted)">R$ ${fmt(c.custo)}</div>
        <div style="text-align:center"><input type="number" class="inp" value="${c.pct}" min="0" max="100" step="0.5" onchange="_cnSetComissao('${c.canal}',this.value)" style="width:66px;text-align:right;font-size:.8rem;padding:4px 6px"></div>
        <div style="text-align:right;color:var(--orange-dark)">R$ ${fmt(c.comissao)}</div>
        <div style="text-align:right;font-weight:800;color:${c.margem<0?'var(--red)':'var(--green)'}">R$ ${fmt(c.margem)}</div>
        <div style="text-align:right;font-weight:700;color:${c.margemPct<0?'var(--red)':'var(--text)'}">${fmt(c.margemPct)}%</div>
      </div>`).join('') || '<div class="ft-empty-list" style="padding:14px">Sem vendas no período</div>'}
    </div>`;

  _cnRenderChart(canais);
}

function _cnRenderChart(canais) {
  if (typeof Chart === 'undefined') return;
  const cv = document.getElementById('cnChart');
  if (!cv) return;
  if (_cnChart) { _cnChart.destroy(); _cnChart = null; }
  const css = getComputedStyle(document.body);
  const txt = css.getPropertyValue('--muted').trim() || '#888';
  const cCusto = '#B4B2A9', cCom = css.getPropertyValue('--chart-3').trim() || '#D97706', cMarg = css.getPropertyValue('--chart-4').trim() || '#16A34A';
  _cnChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: canais.map(c => c.canal),
      datasets: [
        { label: 'Custo', data: canais.map(c => +c.custo.toFixed(2)), backgroundColor: cCusto, borderRadius: 3 },
        { label: 'Comissão', data: canais.map(c => +c.comissao.toFixed(2)), backgroundColor: cCom, borderRadius: 3 },
        { label: 'Margem', data: canais.map(c => +Math.max(0, c.margem).toFixed(2)), backgroundColor: cMarg, borderRadius: 3 },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: txt, callback: v => 'R$ ' + v }, grid: { color: 'rgba(0,0,0,.06)' } },
        y: { stacked: true, ticks: { color: txt }, grid: { display: false } },
      },
      plugins: { legend: { labels: { color: txt, boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: R$ ${fmt(c.raw)}` } } },
    },
  });
}

// ══════════════════════════════════════════════════════════════
// Filho PRECIFICAÇÃO — simulador de preço ideal
// Monta um produto (base + sabores), calcula o custo pela ficha, e
// sugere o preço pra bater a meta de CMV. Mostra a margem líquida por
// canal (comissão descontada) e simula "e se" com preço manual.
// ══════════════════════════════════════════════════════════════

let _pcTamanho = 'grande';
let _pcTipo    = 'inteira';   // 'inteira' | 'meio'
let _pcOpc1    = null;
let _pcOpc2    = null;
let _pcMeta    = 30;          // % meta de CMV
let _pcCanal   = 'ifood';
let _pcPreco   = null;        // preço manual (null = usa o ideal)

function _pcCusto() {
  const base = produtosPizza.find(p => new RegExp(_pcTamanho, 'i').test(p.nome));
  let c = base ? _calcCustoFicha(base.fichaTecnica) : 0;
  const o1 = opcoes.find(o => o.id === _pcOpc1);
  const o2 = opcoes.find(o => o.id === _pcOpc2);
  if (_pcTipo === 'inteira') {
    if (o1) c += _calcCustoFicha(o1.fichaTecnica) * (_pcTamanho === 'grande' ? 2 : 1);
  } else {
    if (o1) c += _calcCustoFicha(o1.fichaTecnica);
    if (o2) c += _calcCustoFicha(o2.fichaTecnica);
  }
  return c;
}

function _pcSaborSelect(id, sel, ph) {
  return `<select class="inp" id="${id}" onchange="${id==='pcOpc1'?'_pcOpc1':'_pcOpc2'}=parseInt(this.value)||null;renderVendasPrecos()" style="width:100%;font-size:.86rem;padding:8px 10px">
    <option value="">${ph}</option>
    ${opcoes.slice().sort((a,b)=>a.nome.localeCompare(b.nome)).map(o => `<option value="${o.id}"${o.id===sel?' selected':''}>${o.nome}${o.fichaTecnica?.ingredientes?.length?'':' (sem ficha)'}</option>`).join('')}
  </select>`;
}

function renderVendasPrecos() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;

  const custo = _pcCusto();
  const precoIdeal = _pcMeta > 0 ? custo / (_pcMeta / 100) : 0;
  const preco = _pcPreco != null ? _pcPreco : precoIdeal;
  const com = _cnComissoes()[_pcCanal] || 0;
  const cmvPct = preco > 0 ? custo / preco * 100 : 0;
  const comissao = preco * com / 100;
  const margem = preco - custo - comissao;
  const margemPct = preco > 0 ? margem / preco * 100 : 0;

  const seg = (opts, val, fn) => `<div style="display:inline-flex;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
    ${opts.map(([id,lbl]) => `<button onclick="${fn}('${id}')" style="padding:7px 16px;font-size:.82rem;font-weight:600;border:none;cursor:pointer;background:${id===val?'var(--purple)':'transparent'};color:${id===val?'#fff':'var(--muted)'}">${lbl}</button>`).join('')}
  </div>`;

  const box = (lbl, val, cor, sub) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.5rem;font-weight:800;${cor?'color:'+cor:''}">${val}</div>${sub?`<div style="font-size:.72rem;color:var(--muted)">${sub}</div>`:''}</div>`;

  const semFicha = custo === 0;

  el.innerHTML = `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:18px">Simule o preço ideal de um produto pela ficha técnica e veja a margem líquida por canal.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">

      <div class="card" style="padding:18px">
        <div style="font-size:.74rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:14px">1. Monte o produto</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">Tamanho</div>${seg([['grande','Grande'],['pequena','Pequena']], _pcTamanho, '_pcSetTam')}</div>
          ${_pcTamanho==='grande' ? `<div><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">Tipo</div>${seg([['inteira','Inteira (1 sabor)'],['meio','Meio a meio']], _pcTipo, '_pcSetTipo')}</div>` : ''}
          <div><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">${_pcTipo==='meio'&&_pcTamanho==='grande'?'Sabor 1':'Sabor'}</div>${_pcSaborSelect('pcOpc1', _pcOpc1, 'Escolha o sabor...')}</div>
          ${_pcTipo==='meio'&&_pcTamanho==='grande' ? `<div><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">Sabor 2</div>${_pcSaborSelect('pcOpc2', _pcOpc2, 'Escolha o sabor...')}</div>` : ''}
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:.82rem;color:var(--muted)">Custo pela ficha técnica</span>
          <span style="font-size:1.3rem;font-weight:800;color:${semFicha?'var(--muted)':'var(--text)'}">R$ ${fmt(custo)}</span>
        </div>
        ${semFicha ? `<div style="font-size:.72rem;color:var(--warning-fg,#B45309);margin-top:6px">${lc('alert-triangle',12,'currentColor')} Ficha vazia — preencha em Configurações → Produtos pra o custo aparecer.</div>` : ''}
      </div>

      <div class="card" style="padding:18px">
        <div style="font-size:.74rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:14px">2. Simulação</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
          <div style="flex:1;min-width:120px"><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">Meta de CMV</div>
            <div style="display:flex;align-items:center;gap:6px"><input type="number" class="inp" value="${_pcMeta}" min="1" max="90" onchange="_pcMeta=parseFloat(this.value)||30;_pcPreco=null;renderVendasPrecos()" style="width:80px;text-align:right;font-size:.9rem;padding:7px 8px">%</div></div>
          <div style="flex:1;min-width:120px"><div style="font-size:.76rem;color:var(--muted);margin-bottom:6px">Canal</div>
            <select class="inp" onchange="_pcCanal=this.value;renderVendasPrecos()" style="width:100%;font-size:.86rem;padding:8px 10px">
              ${Object.keys(_cnComissoes()).map(c=>`<option value="${c}"${c===_pcCanal?' selected':''}>${c} (${_cnComissoes()[c]}%)</option>`).join('')}
            </select></div>
        </div>

        <div style="background:var(--purple-xlight);border-radius:var(--r10,8px);padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
          <div><div style="font-size:.72rem;color:var(--purple);text-transform:uppercase;letter-spacing:.4px;font-weight:700">Preço ideal p/ CMV ${_pcMeta}%</div>
            <div style="font-size:1.7rem;font-weight:800;color:var(--purple)">R$ ${fmt(precoIdeal)}</div></div>
          <button class="btn btn-outline btn-sm" onclick="_pcPreco=null;renderVendasPrecos()">usar ideal</button>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span style="font-size:.82rem;color:var(--muted)">Simular preço:</span>
          <div style="display:flex;align-items:center;gap:4px">R$ <input type="number" class="inp" value="${(_pcPreco!=null?_pcPreco:precoIdeal).toFixed(2)}" step="0.5" onchange="_pcPreco=parseFloat(this.value);renderVendasPrecos()" style="width:100px;text-align:right;font-size:.95rem;font-weight:700;padding:7px 8px"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${box('CMV neste preço', preco>0?fmt(cmvPct)+'%':'—', cmvPct>_pcMeta?'var(--red)':'var(--green)')}
          ${box('Comissão '+_pcCanal, 'R$ '+fmt(comissao), null, com+'% da venda')}
          ${box('Margem líquida', 'R$ '+fmt(margem), margem<0?'var(--red)':'var(--green)', 'após custo e comissão')}
          ${box('Margem %', preco>0?fmt(margemPct)+'%':'—', margemPct<0?'var(--red)':'var(--green)')}
        </div>
      </div>
    </div>`;
}

function _pcSetTam(t)  { _pcTamanho = t; if (t === 'pequena') _pcTipo = 'inteira'; _pcPreco = null; renderVendasPrecos(); }
function _pcSetTipo(t) { _pcTipo = t; _pcPreco = null; renderVendasPrecos(); }

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
let _vdCatOpen = null; // categoria expandida no drill-down (aba Por Insumo)
let _vdDrillExpand = false; // "mostrar todos os sabores" na categoria aberta
const _VD_DRILL_LIMITE = 8; // sabores visíveis antes do "mostrar mais"

// Sub-abas do CMV: "Geral" (categoria → produto) e "Por Insumo" (categoria →
// sabor/bebida — o drill-down que já existia, inalterado).
let _vdCmvSubTab = 'geral'; // 'geral' | 'insumo'
let _vdProdOpen  = null;    // categoria expandida na aba Geral

// Intervalo do CMV — mesmo padrão de período do Dashboard (Hoje/7/30/60 +
// Personalizado com popover De/Até), só usado aqui, não mexe no filtro
// rápido (30/60/90 dias) compartilhado com os outros filhos de Vendas.
let _vdCmvRangeDias    = 30;   // 0 (hoje) | 7 | 30 | 60 | 'custom'
let _vdCmvCustomAberto = false;
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

// Resolve o intervalo do CMV — mesma lógica de _perfGetRange() (dashboard.js):
// dias>0 = hoje-N até agora; 0 = só hoje (meia-noite até agora); 'custom' =
// intervalo exato escolhido.
function _vdCmvGetRange() {
  if (_vdCmvRangeDias === 'custom' && _vdCmvDe && _vdCmvAte) {
    const inicio = new Date(_vdCmvDe + 'T00:00:00');
    const fim    = new Date(_vdCmvAte + 'T23:59:59');
    return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString(),
      label: `${_vdCmvDe.split('-').reverse().join('/')} – ${_vdCmvAte.split('-').reverse().join('/')}` };
  }
  const fim = new Date();
  const inicio = _vdCmvRangeDias > 0
    ? new Date(new Date(fim.getTime() - _vdCmvRangeDias * 86400000).setHours(0,0,0,0))
    : new Date(new Date().setHours(0,0,0,0));
  return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString(),
    label: _vdCmvRangeDias === 0 ? 'hoje' : `${_vdCmvRangeDias} dias` };
}

function _vdCmvSetRange(dias) {
  _vdCmvRangeDias = dias;
  _vdCmvCustomAberto = false;
  renderVendasCMV();
}

function _vdCmvToggleCustom() {
  _vdCmvCustomAberto = !_vdCmvCustomAberto;
  renderVendasCMV();
}

function _vdCmvAplicarCustom() {
  const i = document.getElementById('cmvCustomDe')?.value;
  const f = document.getElementById('cmvCustomAte')?.value;
  if (!i || !f) { toast('Selecione as duas datas', 'err'); return; }
  if (i > f) { toast('Data inicial deve ser antes da final', 'err'); return; }
  _vdCmvDe = i; _vdCmvAte = f;
  _vdCmvRangeDias = 'custom';
  _vdCmvCustomAberto = false;
  renderVendasCMV();
}

// Recarrega o período atual do CMV (limpa só o cache daquele intervalo)
function _vdCmvReload() {
  const r = _vdCmvGetRange();
  delete _vCache[r.inicioISO + '|' + r.fimISO];
  renderVendasCMV();
}

// Filtros do CMV — mesmo design de período do Dashboard (Hoje/7/30/60 dias +
// Personalizado com popover De/Até/Aplicar), só existe aqui, não afeta
// Produtos/Canais/Precificação (que seguem no _vdFiltros compartilhado).
function _vdFiltrosCmv() {
  const canais = ['ifood', '99food', 'site', 'outro'];
  const RANGES = [[0,'Hoje'],[7,'7 dias'],[30,'30 dias'],[60,'60 dias']];
  const isCustom = _vdCmvRangeDias === 'custom';
  const customLabel = isCustom
    ? `${_vdCmvDe.split('-').reverse().join('/')} – ${_vdCmvAte.split('-').reverse().join('/')}`
    : 'Personalizado';
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:relative">
      <div style="display:flex;gap:3px;background:var(--surface2);border-radius:var(--r8);padding:3px">
        ${RANGES.map(([d,l]) => `
          <button onclick="_vdCmvSetRange(${d})" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-weight:${!isCustom&&_vdCmvRangeDias===d?'700':'500'};background:${!isCustom&&_vdCmvRangeDias===d?'var(--bg)':'transparent'};color:${!isCustom&&_vdCmvRangeDias===d?'var(--purple)':'var(--text2)'};box-shadow:${!isCustom&&_vdCmvRangeDias===d?'0 1px 3px rgba(0,0,0,.1)':'none'}">${l}</button>
        `).join('')}
        <button onclick="_vdCmvToggleCustom()" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:${isCustom?'700':'500'};background:${isCustom?'var(--bg)':'transparent'};color:${isCustom?'var(--purple)':'var(--text2)'};box-shadow:${isCustom?'0 1px 3px rgba(0,0,0,.1)':'none'}">
          ${lc('calendar',11,'currentColor')} ${customLabel}
        </button>
      </div>
      ${_vdCmvCustomAberto ? `
        <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:var(--bg);border:1px solid var(--border);border-radius:var(--r10);padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:flex;align-items:end;gap:8px;flex-wrap:wrap">
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">De</label>
            <input type="date" id="cmvCustomDe" value="${_vdCmvDe}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">Até</label>
            <input type="date" id="cmvCustomAte" value="${_vdCmvAte}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <button class="btn btn-primary btn-xs" onclick="_vdCmvAplicarCustom()">Aplicar</button>
        </div>` : ''}
    </div>
    <select class="inp" style="max-width:170px;font-size:.8rem;padding:6px 10px" onchange="_vdCanal=this.value;renderVendasCMV()">
      <option value="">Todos os canais</option>
      ${canais.map(c => `<option value="${c}"${c===_vdCanal?' selected':''}>${c}</option>`).join('')}
    </select>
    <div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)">Meta de CMV
      <input type="number" class="inp" value="${_vdMetaCMV}" min="0" max="100" onchange="_vdMetaCMV=parseFloat(this.value)||30;renderVendasCMV()" style="width:62px;text-align:right;font-size:.8rem;padding:6px 8px">%
    </div>
    <button class="btn btn-outline btn-xs" onclick="_vdCmvReload()">${lc('refresh-cw',12,'currentColor')} Atualizar</button>
  </div>`;
}

// ── Filho CMV ──────────────────────────────────────────────────
async function renderVendasCMV() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _vdFiltrosCmv() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos do Cardápio Web...</div>`;

  const range = _vdCmvGetRange();
  let linhas;
  try { linhas = await vendasCarregarPeriodo(range.inicioISO, range.fimISO); }
  catch (e) { el.innerHTML = _vdFiltrosCmv() + `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui ler os pedidos: ${e.message}</div>`; return; }
  if (_vdCanal) linhas = linhas.filter(l => l.canal === _vdCanal);

  const cat  = vendasPorCategoria(linhas);
  const prod = _vdCmvSubTab === 'insumo' ? vendasProdutosPorCategoria(linhas) : null;
  const prodGeral = _vdCmvSubTab === 'geral' ? vendasPorProduto(linhas) : null;
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
    // Borda esquerda na cor da meta de CMV — dá pra escanear a lista de
    // categorias de cima a baixo e ver quais estouraram a meta sem ler
    // nenhum número (mesma cor já usada no valor de CMV%).
    return `<div class="card" style="padding:0;margin-bottom:8px;overflow:hidden;border-left:3px solid ${corMeta(pc)}">
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <div style="min-width:560px">
          <div onclick="_vdCatOpen='${aberta ? '' : nome}';_vdDrillExpand=false;renderVendasCMV()" style="display:grid;grid-template-columns:22px 1.4fr 1fr 1fr 90px 1fr;gap:12px;align-items:center;padding:13px 16px;cursor:pointer">
            <span style="color:var(--muted);display:inline-flex;transform:rotate(${aberta?90:0}deg);transition:transform .15s">${lc('chevron-right',16,'currentColor')}</span>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:.9rem">${lc(_VD_CAT_ICON[nome]||'pizza',16,'var(--purple)')} ${nome}</div>
            <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">RECEITA</div><div style="font-weight:700">R$ ${fmt(d.receita)}</div></div>
            <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">CUSTO</div><div style="font-weight:700">R$ ${fmt(d.custo)}</div></div>
            <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">CMV</div><div style="font-weight:800;color:${corMeta(pc)}">${d.custo>0?fmt(pc)+'%':'—'}</div></div>
            <div style="text-align:right"><div style="font-size:.62rem;color:var(--muted)">MARGEM</div><div style="font-weight:700">R$ ${fmt(d.receita-d.custo)}</div></div>
          </div>
          ${aberta ? _vdDrillCategoria(prod[nome]) : ''}
        </div>
      </div>
    </div>`;
  };

  const subTabBtn = (id, lbl) => `<button onclick="_vdCmvSubTab='${id}';renderVendasCMV()" style="padding:8px 18px;font-size:.82rem;font-weight:700;border:none;cursor:pointer;background:${id===_vdCmvSubTab?'var(--purple)':'transparent'};color:${id===_vdCmvSubTab?'#fff':'var(--muted)'};border-radius:var(--r8)">${lbl}</button>`;
  const subTabs = `<div style="display:inline-flex;gap:3px;background:var(--surface2);border-radius:var(--r10);padding:3px;margin-bottom:16px">
    ${subTabBtn('geral','Geral')}${subTabBtn('insumo','Por Insumo')}
  </div>`;

  const corpo = _vdCmvSubTab === 'geral'
    ? _vdRenderGeral(prodGeral)
    : `<div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Por categoria <span style="font-weight:400;text-transform:none">— clique para ver o detalhe</span></div>
       ${VENDAS_CATEGORIAS.map(linhaCat).join('')}`;

  el.innerHTML = _vdFiltrosCmv() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px">Interpretado de <b>${range.label}</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''} · ${tot.vendas} linhas de venda</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Receita', 'R$ ' + fmt(tot.receita))}
      ${kpi('Custo (CMV)', 'R$ ' + fmt(tot.custo))}
      ${kpi('CMV', tot.custo>0?fmt(cmvGeral)+'%':'—', corMeta(cmvGeral))}
      ${kpi('Margem', 'R$ ' + fmt(margem))}
    </div>
    ${banner}
    ${subTabs}
    ${corpo}`;
}

// Aba "Geral" — categoria → produto (o que o catálogo do CW realmente vende
// em cada categoria; ver comentário de vendasPorProduto em vendas.js).
function _vdRenderGeral(prodPorCategoria) {
  const catsComVenda = VENDAS_CATEGORIAS.filter(c => prodPorCategoria[c]?.produtos?.length);
  if (!catsComVenda.length) return '<div class="ft-empty-list">Sem vendas no período</div>';

  const fmtQ = n => Math.round(n).toLocaleString('pt-BR');
  const corMeta = pc => pc <= 0 ? 'var(--muted)' : pc > _vdMetaCMV ? 'var(--red)' : 'var(--green)';
  const GRID = '22px 1.6fr 1fr 1.2fr 1fr 1fr 1fr 80px 1fr';

  const linhaProd = (p) => {
    const pc = p.receita > 0 ? p.custo / p.receita * 100 : 0;
    return `<div style="display:grid;grid-template-columns:${GRID};gap:12px;align-items:center;padding:8px 16px 8px 38px;font-size:.82rem;border-top:1px solid var(--border)">
      <div></div>
      <div>${p.nome}</div>
      <div style="text-align:right">${fmtQ(p.qtd)}</div>
      <div style="text-align:right">R$ ${fmt(p.receita)}</div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(p.precoMedio)}</div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(p.custoMedio)}</div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(p.custo)}</div>
      <div style="text-align:right;font-weight:700;color:${corMeta(pc)}">${p.custo>0?fmt(pc)+'%':'—'}</div>
      <div style="text-align:right;font-weight:700;color:${p.lucro<0?'var(--red)':'var(--green)'}">R$ ${fmt(p.lucro)}</div>
    </div>`;
  };

  const linhaCat = (nome) => {
    const d = prodPorCategoria[nome]; if (!d || !d.produtos.length) return '';
    const aberta = _vdProdOpen === nome;
    const lucro = d.receita - d.custo;
    const pc = d.receita > 0 ? d.custo / d.receita * 100 : 0;
    return `<div class="card" style="padding:0;margin-bottom:8px;overflow:hidden">
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <div style="min-width:820px">
          <div onclick="_vdProdOpen='${aberta ? '' : nome}';renderVendasCMV()" style="display:grid;grid-template-columns:${GRID};gap:12px;align-items:center;padding:13px 16px;cursor:pointer;background:var(--surface2)">
            <span style="color:var(--muted);display:inline-flex;transform:rotate(${aberta?90:0}deg);transition:transform .15s">${lc('chevron-right',16,'currentColor')}</span>
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:.9rem">${lc(_VD_CAT_ICON[nome]||'pizza',16,'var(--purple)')} ${nome}</div>
            <div style="text-align:right;font-weight:700">${fmtQ(d.vendas)}</div>
            <div style="text-align:right;font-weight:700">R$ ${fmt(d.receita)}</div>
            <div style="text-align:right;color:var(--muted)">R$ ${fmt(d.vendas>0?d.receita/d.vendas:0)}</div>
            <div style="text-align:right;color:var(--muted)">R$ ${fmt(d.vendas>0?d.custo/d.vendas:0)}</div>
            <div style="text-align:right;color:var(--muted)">R$ ${fmt(d.custo)}</div>
            <div style="text-align:right;font-weight:800;color:${corMeta(pc)}">${d.custo>0?fmt(pc)+'%':'—'}</div>
            <div style="text-align:right;font-weight:800;color:${lucro<0?'var(--red)':'var(--green)'}">R$ ${fmt(lucro)}</div>
          </div>
          ${aberta ? d.produtos.map(linhaProd).join('') : ''}
        </div>
      </div>
    </div>`;
  };

  return `<div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Por categoria e produto <span style="font-weight:400;text-transform:none">— clique para expandir</span></div>
    <div style="display:grid;grid-template-columns:${GRID};gap:12px;padding:0 16px 6px;font-size:.62rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
      <div></div><div>Categoria / Produto</div><div style="text-align:right">Qtde vendida</div><div style="text-align:right">Faturamento</div><div style="text-align:right">Preço médio</div><div style="text-align:right">Custo médio</div><div style="text-align:right">Custo total</div><div style="text-align:right">CMV</div><div style="text-align:right">Lucro</div>
    </div>
    ${catsComVenda.map(linhaCat).join('')}`;
}

// Drill-down: opções/bebidas vendidas na categoria, com custo de ficha.
// Pizza Grande/Pequena entram como linhas próprias (custo da massa, caixa,
// embalagem — separado do recheio) sempre no topo; sabores e bebidas ficam
// em seções separadas (com ícone por tipo), e sabores de cauda longa (venda
// baixa) ficam recolhidos atrás de "+ N outros sabores".
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

  const sabores = [];
  for (const [k, m] of Object.entries(dados.sabores || {})) {
    const opc = vendasOpcaoDeSabor(k);
    const custoUn = vendasCustoOpcao(k);
    const qtdHtml = `${m.total} meias<div style="font-size:.7rem;color:var(--muted);font-weight:400">${m.grande} grande · ${m.pequena} pequena</div>`;
    sabores.push({ nome: opc ? opc.nome : _cwTitulo(k), qtdHtml, custoUn, custoTot: custoUn * m.total, temFicha: opc?.fichaTecnica?.ingredientes?.length > 0, icone: 'pizza' });
  }
  sabores.sort((a, b) => b.custoTot - a.custoTot);

  const bebidas = [];
  for (const [k, q] of Object.entries(dados.bebidas || {})) {
    const c = _cwRank(k, _cwPoolBebidas(), 'nome', 1)[0];
    const alvo = (c && c.s >= 0.6) ? c.x : null;
    const item = alvo ? (alvo.tipo === 'produto' ? produtos.find(p => p.id === alvo.id) : items.find(i => i.id === alvo.id)) : null;
    const custoUn = item?.fichaTecnica ? _calcCustoFicha(item.fichaTecnica) : (item?.cost || 0);
    bebidas.push({ nome: item ? (item.name || item.nome) : _cwTitulo(k), qtdHtml: `${q} un`, custoUn, custoTot: custoUn * q, temFicha: !!item, icone: 'coffee' });
  }
  bebidas.sort((a, b) => b.custoTot - a.custoTot);

  if (!base.length && !sabores.length && !bebidas.length) return '';

  const linha = (x) => `<div style="display:grid;grid-template-columns:22px 1.4fr 1fr 1fr 90px 1fr;gap:12px;align-items:center;padding:8px 16px;font-size:.82rem;${x.destaque?'background:var(--surface);font-weight:600':''}">
      <span style="color:var(--muted);display:inline-flex">${x.icone ? lc(x.icone, 13, 'currentColor') : ''}</span>
      <div>${x.nome} ${x.temFicha?'':`<span style="font-size:.66rem;background:var(--yellow-light);color:var(--warning-fg,#B45309);padding:1px 6px;border-radius:var(--r6);margin-left:4px">sem ficha</span>`}</div>
      <div style="text-align:right;color:var(--muted)">${x.qtdHtml}</div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(x.custoUn)}</div>
      <div></div>
      <div style="text-align:right;font-weight:600">R$ ${fmt(x.custoTot)}</div>
    </div>`;

  const secao = (label) => `<div style="padding:7px 16px 5px;font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${label}</div>`;

  const saboresVisiveis = _vdDrillExpand ? sabores : sabores.slice(0, _VD_DRILL_LIMITE);
  const restantes = sabores.length - saboresVisiveis.length;
  const btnMais = restantes > 0 ? `<div style="padding:8px 16px">
      <button class="btn btn-ghost btn-xs" onclick="_vdDrillExpand=true;renderVendasCMV()">+ ${restantes} outro${restantes>1?'s':''} sabor${restantes>1?'es':''}</button>
    </div>` : '';

  return `<div style="border-top:1px solid var(--border);background:var(--surface2)">
    ${base.map(linha).join('')}
    ${sabores.length ? secao('Sabores') + saboresVisiveis.map(linha).join('') + btnMais : ''}
    ${bebidas.length ? secao('Bebidas') + bebidas.map(linha).join('') : ''}
  </div>`;
}


// ══════════════════════════════════════════════════════════════
// Filho CONSUMO DE INSUMOS — quanto de cada INSUMO CRU saiu por período.
// Preparados (ex.: Mussarela Triturada) não aparecem — o consumo deles
// cascateia pra ficha técnica própria até virar insumo cru (Mussarela em
// Barra), que é o que interessa pra comprar/repor estoque. Lista TODO o
// cadastro de insumos — quem não vendeu no período aparece com consumo
// zero. % é por CUSTO (unidades diferentes não somam em quantidade).
// Filtro de categoria aceita múltipla seleção.
// ══════════════════════════════════════════════════════════════

let _inPreset       = '15';   // 'hoje' | '7' | '15' | '30' | '90' | 'custom'
let _inCustomAberto = false;
let _inDe           = '';     // yyyy-mm-dd (custom)
let _inAte          = '';
let _inBusca        = '';
let _inCats         = [];     // categorias selecionadas — [] = todas
let _inCatAberto    = false;

const _IN_PRESETS = [['hoje','Hoje'],['7','7 dias'],['15','15 dias'],['30','30 dias'],['90','90 dias']];

// Resolve o preset atual em { inicioISO, fimISO, label }
function _inRange() {
  const now = new Date();
  if (_inPreset === 'custom' && _inDe && _inAte) {
    const ini = new Date(_inDe + 'T00:00:00');
    const fim = new Date(_inAte + 'T23:59:59');
    return { inicioISO: ini.toISOString(), fimISO: fim.toISOString(),
      label: `${_inDe.split('-').reverse().join('/')} – ${_inAte.split('-').reverse().join('/')}` };
  }
  if (_inPreset === 'hoje') {
    const ini = new Date(now); ini.setHours(0, 0, 0, 0);
    return { inicioISO: ini.toISOString(), fimISO: now.toISOString(), label: 'hoje' };
  }
  const d = parseInt(_inPreset) || 15;
  return { inicioISO: new Date(now - d * 864e5).toISOString(), fimISO: now.toISOString(), label: `${d} dias` };
}

function _inSetPreset(id) {
  _inPreset = id;
  _inCustomAberto = false;
  renderVendasInsumos();
}

function _inToggleCustom() {
  _inCustomAberto = !_inCustomAberto;
  renderVendasInsumos();
}

function _inAplicarCustom() {
  const i = document.getElementById('inCustomDe')?.value;
  const f = document.getElementById('inCustomAte')?.value;
  if (!i || !f) { toast('Selecione as duas datas', 'err'); return; }
  if (i > f) { toast('Data inicial deve ser antes da final', 'err'); return; }
  _inDe = i; _inAte = f;
  _inPreset = 'custom';
  _inCustomAberto = false;
  renderVendasInsumos();
}

function _inToggleCatPopover() {
  _inCatAberto = !_inCatAberto;
  renderVendasInsumos();
}

function _inToggleCat(cat) {
  const i = _inCats.indexOf(cat);
  if (i >= 0) _inCats.splice(i, 1); else _inCats.push(cat);
  renderVendasInsumos();
}

function _inLimparCats() {
  _inCats = [];
  renderVendasInsumos();
}

function _inMarcarTodasCats() {
  _inCats = [...(typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : [])];
  renderVendasInsumos();
}

function _inFiltroCategoria() {
  const cats = (typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : []);
  const label = _inCats.length === 0 ? 'Todas categorias' : _inCats.length === 1 ? _inCats[0] : `${_inCats.length} categorias`;
  return `<div style="position:relative">
    <button onclick="_inToggleCatPopover()" style="font-size:var(--text-xs);padding:6px 12px;border-radius:var(--r8);border:1.5px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:6px;font-weight:${_inCats.length?'700':'500'};background:${_inCats.length?'var(--purple-xlight)':'var(--bg)'};color:${_inCats.length?'var(--purple)':'var(--text2)'}">
      ${lc('filter',11,'currentColor')} ${label}
    </button>
    ${_inCatAberto ? `
      <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:var(--bg);border:1px solid var(--border);border-radius:var(--r10);padding:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:200px;max-height:280px;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border)">
          <span style="font-size:.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Categorias</span>
          <span style="display:flex;gap:8px">
            <button onclick="_inMarcarTodasCats()" style="font-size:.7rem;color:var(--purple);background:none;border:none;cursor:pointer;font-weight:600;padding:0">Marcar todas</button>
            <button onclick="_inLimparCats()" style="font-size:.7rem;color:var(--purple);background:none;border:none;cursor:pointer;font-weight:600;padding:0">Limpar</button>
          </span>
        </div>
        ${cats.map(c => `
          <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;padding:4px 2px;cursor:pointer;white-space:nowrap">
            <input type="checkbox" ${_inCats.includes(c)?'checked':''} onchange="_inToggleCat('${c.replace(/'/g,"\\'")}')" style="accent-color:var(--purple)">
            ${c}
          </label>`).join('') || '<div style="font-size:.78rem;color:var(--muted)">Nenhuma categoria cadastrada</div>'}
      </div>` : ''}
  </div>`;
}

function _inFiltros() {
  const isCustom = _inPreset === 'custom';
  const customLabel = isCustom
    ? `${_inDe.split('-').reverse().join('/')} – ${_inAte.split('-').reverse().join('/')}`
    : 'Personalizado';
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:relative">
      <div style="display:flex;gap:3px;background:var(--surface2);border-radius:var(--r8);padding:3px">
        ${_IN_PRESETS.map(([id,lbl]) => `
          <button onclick="_inSetPreset('${id}')" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-weight:${!isCustom&&_inPreset===id?'700':'500'};background:${!isCustom&&_inPreset===id?'var(--bg)':'transparent'};color:${!isCustom&&_inPreset===id?'var(--purple)':'var(--text2)'};box-shadow:${!isCustom&&_inPreset===id?'0 1px 3px rgba(0,0,0,.1)':'none'}">${lbl}</button>
        `).join('')}
        <button onclick="_inToggleCustom()" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:${isCustom?'700':'500'};background:${isCustom?'var(--bg)':'transparent'};color:${isCustom?'var(--purple)':'var(--text2)'};box-shadow:${isCustom?'0 1px 3px rgba(0,0,0,.1)':'none'}">
          ${lc('calendar',11,'currentColor')} ${customLabel}
        </button>
      </div>
      ${_inCustomAberto ? `
        <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:var(--bg);border:1px solid var(--border);border-radius:var(--r10);padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:flex;align-items:end;gap:8px;flex-wrap:wrap">
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">De</label>
            <input type="date" id="inCustomDe" value="${_inDe}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">Até</label>
            <input type="date" id="inCustomAte" value="${_inAte}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <button class="btn btn-primary btn-xs" onclick="_inAplicarCustom()">Aplicar</button>
        </div>` : ''}
    </div>
    ${_inFiltroCategoria()}
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
  const { insumos, custoTotal, naoRastreado } = _inDados;

  const kpi = (lbl, val, sub, bg, fg) => `<div style="background:${bg};border-radius:var(--r12,10px);padding:16px 18px">
    <div style="font-size:.72rem;font-weight:700;color:${fg};text-transform:uppercase;letter-spacing:.5px;opacity:.85">${lbl}</div>
    <div style="font-size:2rem;font-weight:900;color:${fg};line-height:1.15;margin-top:4px">${val}</div>
    ${sub?`<div style="font-size:.76rem;color:${fg};opacity:.8;margin-top:2px">${sub}</div>`:''}</div>`;

  const nf = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
  const banner = naoRastreado.length ? `<div class="card" style="padding:12px 16px;margin-bottom:16px;border-color:var(--warning-fg,#D97706);background:var(--warning-bg,#FEF3C7)">
      <div style="font-size:.84rem;font-weight:700;color:var(--warning-fg,#B45309)">${lc('alert-triangle',14,'currentColor')} Consumo parcial — ${naoRastreado.length} preparado(s) sem ficha técnica</div>
      <div style="font-size:.76rem;color:var(--warning-fg,#92400E);margin-top:3px">${naoRastreado.slice(0,6).map(x=>`${x.nome} (${nf(x.qtd)} ${x.unidade})`).join(' · ')}${naoRastreado.length>6?' …':''}</div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:5px">Cadastre a ficha em <a href="#" onclick="event.preventDefault();setCadTab('preparo');goModule('cadastros')" style="color:var(--purple);font-weight:600;text-decoration:none">Cadastros → Pré-preparo</a> para o consumo entrar no cálculo.</div>
    </div>` : '';

  el.innerHTML = _inFiltros() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:14px">Todos os insumos cadastrados, com o consumo nas pizzas vendidas em <b>${r.label}</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''}${_inCats.length?` · ${_inCats.length===1?_inCats[0]:_inCats.length+' categorias'}`:''} — preparados cascateiam pro insumo cru que consomem.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,220px));gap:14px;margin-bottom:22px">
      ${kpi('Insumos cadastrados', insumos.length, 'no cadastro', 'var(--purple-xlight)', 'var(--purple)')}
      <div style="background:var(--green-light);border-radius:var(--r12,10px);padding:16px 18px">
        <div style="font-size:.72rem;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.5px;opacity:.85">Custo total</div>
        <div id="inKpiCusto" style="font-size:2rem;font-weight:900;color:var(--green);line-height:1.15;margin-top:4px">R$ ${fmt(custoTotal)}</div>
        <div style="font-size:.76rem;color:var(--green);opacity:.8;margin-top:2px">valor consumido no período${_inCats.length||_inBusca?' · da seleção atual':''}</div>
      </div>
    </div>
    ${banner}
    <div id="inTabelaWrap"></div>`;

  _inRenderTabela();
}

function _inRenderTabela() {
  const wrap = document.getElementById('inTabelaWrap');
  if (!wrap || !_inDados) return;
  const q = _cwNorm(_inBusca);
  const lista = _inDados.insumos.filter(x => (!q || _cwNorm(x.nome).includes(q)) && (!_inCats.length || _inCats.includes(x.cat)));
  const custoSelecao = lista.reduce((s, x) => s + x.custo, 0);
  const custoKpi = document.getElementById('inKpiCusto');
  if (custoKpi) custoKpi.textContent = 'R$ ' + fmt(custoSelecao);
  if (!lista.length) { wrap.innerHTML = `<div class="ft-empty-list">${_inDados.insumos.length ? 'Nenhum insumo com esses filtros' : 'Nenhum insumo cadastrado ainda'}</div>`; return; }
  const nf = n => (Math.round(n * 100) / 100).toLocaleString('pt-BR');
  wrap.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div style="display:grid;grid-template-columns:1.4fr .9fr 1fr 100px 110px 80px;gap:12px;padding:10px 16px;background:var(--surface2);font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
      <div>Insumo</div><div>Categoria</div><div style="text-align:right">Kg/Qtd</div><div style="text-align:right">Custo Unit.</div><div style="text-align:right">Custo Total</div><div style="text-align:right">% do total</div>
    </div>
    ${lista.map(x => `<div style="display:grid;grid-template-columns:1.4fr .9fr 1fr 100px 110px 80px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem">
      <div style="font-weight:600">${x.nome}</div>
      <div style="color:var(--muted)">${x.cat || '—'}</div>
      <div style="text-align:right;font-weight:700">${nf(x.total)} <span style="font-size:.66rem;color:var(--muted)">${x.unidade}</span></div>
      <div style="text-align:right;color:var(--muted)">R$ ${fmt(x.custoUn)}</div>
      <div style="text-align:right;font-weight:700">R$ ${fmt(x.custo)}</div>
      <div style="text-align:right;font-weight:700;color:var(--purple)">${fmt(custoSelecao > 0 ? x.custo / custoSelecao * 100 : 0)}%</div>
    </div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// Filho PRODUTOS / CURVA ABC — campeões de venda e comportamento
// ══════════════════════════════════════════════════════════════

// Intervalo do filho Produtos — mesmo padrão de período do Dashboard/CMV
// (Hoje/7/30/60 dias + Personalizado com popover De/Até/Aplicar).
let _prRangeDias    = 30;   // 0 (hoje) | 7 | 30 | 60 | 'custom'
let _prCustomAberto = false;
let _prDe  = '';
let _prAte = '';

function _prGetRange() {
  if (_prRangeDias === 'custom' && _prDe && _prAte) {
    const inicio = new Date(_prDe + 'T00:00:00');
    const fim    = new Date(_prAte + 'T23:59:59');
    return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString(),
      label: `${_prDe.split('-').reverse().join('/')} – ${_prAte.split('-').reverse().join('/')}` };
  }
  const fim = new Date();
  const inicio = _prRangeDias > 0
    ? new Date(new Date(fim.getTime() - _prRangeDias * 86400000).setHours(0,0,0,0))
    : new Date(new Date().setHours(0,0,0,0));
  return { inicioISO: inicio.toISOString(), fimISO: fim.toISOString(),
    label: _prRangeDias === 0 ? 'hoje' : `${_prRangeDias} dias` };
}

function _prSetRange(dias) {
  _prRangeDias = dias;
  _prCustomAberto = false;
  renderVendasProdutos();
}

function _prToggleCustom() {
  _prCustomAberto = !_prCustomAberto;
  renderVendasProdutos();
}

function _prAplicarCustom() {
  const i = document.getElementById('prCustomDe')?.value;
  const f = document.getElementById('prCustomAte')?.value;
  if (!i || !f) { toast('Selecione as duas datas', 'err'); return; }
  if (i > f) { toast('Data inicial deve ser antes da final', 'err'); return; }
  _prDe = i; _prAte = f;
  _prRangeDias = 'custom';
  _prCustomAberto = false;
  renderVendasProdutos();
}

function _prReload() {
  const r = _prGetRange();
  delete _vCache[r.inicioISO + '|' + r.fimISO];
  renderVendasProdutos();
}

function _prFiltros() {
  const canais = ['ifood', '99food', 'site', 'outro'];
  const RANGES = [[0,'Hoje'],[7,'7 dias'],[30,'30 dias'],[60,'60 dias']];
  const isCustom = _prRangeDias === 'custom';
  const customLabel = isCustom
    ? `${_prDe.split('-').reverse().join('/')} – ${_prAte.split('-').reverse().join('/')}`
    : 'Personalizado';
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:relative">
      <div style="display:flex;gap:3px;background:var(--surface2);border-radius:var(--r8);padding:3px">
        ${RANGES.map(([d,l]) => `
          <button onclick="_prSetRange(${d})" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-weight:${!isCustom&&_prRangeDias===d?'700':'500'};background:${!isCustom&&_prRangeDias===d?'var(--bg)':'transparent'};color:${!isCustom&&_prRangeDias===d?'var(--purple)':'var(--text2)'};box-shadow:${!isCustom&&_prRangeDias===d?'0 1px 3px rgba(0,0,0,.1)':'none'}">${l}</button>
        `).join('')}
        <button onclick="_prToggleCustom()" style="font-size:var(--text-xs);padding:5px 12px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:${isCustom?'700':'500'};background:${isCustom?'var(--bg)':'transparent'};color:${isCustom?'var(--purple)':'var(--text2)'};box-shadow:${isCustom?'0 1px 3px rgba(0,0,0,.1)':'none'}">
          ${lc('calendar',11,'currentColor')} ${customLabel}
        </button>
      </div>
      ${_prCustomAberto ? `
        <div style="position:absolute;top:calc(100% + 6px);left:0;z-index:20;background:var(--bg);border:1px solid var(--border);border-radius:var(--r10);padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:flex;align-items:end;gap:8px;flex-wrap:wrap">
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">De</label>
            <input type="date" id="prCustomDe" value="${_prDe}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <div>
            <label style="font-size:var(--text-2xs);color:var(--muted);display:block;margin-bottom:3px">Até</label>
            <input type="date" id="prCustomAte" value="${_prAte}" max="${new Date().toISOString().slice(0,10)}" style="font-size:var(--text-xs);padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
          </div>
          <button class="btn btn-primary btn-xs" onclick="_prAplicarCustom()">Aplicar</button>
        </div>` : ''}
    </div>
    <select class="inp" style="max-width:170px;font-size:.8rem;padding:6px 10px" onchange="_vdCanal=this.value;renderVendasProdutos()">
      <option value="">Todos os canais</option>
      ${canais.map(c => `<option value="${c}"${c===_vdCanal?' selected':''}>${c}</option>`).join('')}
    </select>
    <div style="margin-left:auto"></div>
    <button class="btn btn-outline btn-xs" onclick="_prReload()">${lc('refresh-cw',12,'currentColor')} Atualizar</button>
  </div>`;
}

async function renderVendasProdutos() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _prFiltros() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos...</div>`;

  const range = _prGetRange();
  let linhas;
  try { linhas = await vendasCarregarPeriodo(range.inicioISO, range.fimISO); }
  catch (e) { el.innerHTML = _prFiltros() + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${e.message}</div>`; return; }
  if (_vdCanal) linhas = linhas.filter(l => l.canal === _vdCanal);

  const abc = vendasABCsabores(linhas);

  // Contagem por classe
  const nCl = { A: 0, B: 0, C: 0 };
  abc.itens.forEach(x => nCl[x.classe]++);
  const corCl = c => c === 'A' ? 'var(--green)' : c === 'B' ? 'var(--orange-dark)' : 'var(--red)';
  const bgCl  = c => c === 'A' ? 'var(--green-light)' : c === 'B' ? 'var(--orange-light)' : 'var(--red-light)';

  const kpi = (lbl, v, sub, bg, fg) => `<div style="background:${bg};border-radius:var(--r12,10px);padding:16px 18px">
    <div style="font-size:.72rem;font-weight:700;color:${fg};text-transform:uppercase;letter-spacing:.5px;opacity:.85">${lbl}</div>
    <div style="font-size:2rem;font-weight:900;color:${fg};line-height:1.15;margin-top:4px">${v}</div>
    ${sub?`<div style="font-size:.76rem;color:${fg};opacity:.8;margin-top:2px">${sub}</div>`:''}</div>`;

  el.innerHTML = _prFiltros() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:16px">Curva ABC de sabores em <b>${range.label}</b>${_vdCanal?` · canal <b>${_vdCanal}</b>`:''} · <span style="font-style:italic">receita de combos rateada por porção</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,220px));gap:14px;margin-bottom:22px">
      ${kpi('Sabores', abc.itens.length, 'no período', 'var(--purple-xlight)', 'var(--purple)')}
      ${kpi('Classe A', nCl.A, '80% do volume', bgCl('A'), corCl('A'))}
      ${kpi('Classe B', nCl.B, 'próximos 15%', bgCl('B'), corCl('B'))}
      ${kpi('Classe C', nCl.C, 'cauda — 5%', bgCl('C'), corCl('C'))}
    </div>

    <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
      <div style="display:grid;grid-template-columns:40px 1.6fr 1fr 1fr 90px 100px 70px;gap:12px;padding:10px 16px;background:var(--surface2);font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">
        <div>ABC</div><div>Sabor por Porção</div><div style="text-align:right">Pizza Grande</div><div style="text-align:right">Pizza Pequena</div><div style="text-align:right">Quantidade</div><div style="text-align:right">Receita</div><div style="text-align:right">%</div>
      </div>
      ${abc.itens.map(x => `<div style="display:grid;grid-template-columns:40px 1.6fr 1fr 1fr 90px 100px 70px;gap:12px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem">
        <div><span style="display:inline-block;width:22px;text-align:center;font-weight:800;font-size:.74rem;color:${corCl(x.classe)};background:${bgCl(x.classe)};border-radius:var(--r6);padding:2px 0">${x.classe}</span></div>
        <div style="font-weight:600">${x.nome}</div>
        <div style="text-align:right;color:var(--muted)">${x.grande}</div>
        <div style="text-align:right;color:var(--muted)">${x.pequena}</div>
        <div style="text-align:right;font-weight:700">${fmt(x.qtd)}</div>
        <div style="text-align:right;color:var(--muted)">R$ ${fmt(x.receita)}</div>
        <div style="text-align:right;color:var(--muted)">${fmt(x.pct)}%</div>
      </div>`).join('') || '<div class="ft-empty-list" style="padding:14px">Sem dados no período</div>'}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// Filho VENDAS (ex-"Canais") — receita, CMV, comissão, impostos e
// margem líquida por canal. Comissão e imposto % são cadastro editável
// aqui mesmo (persistido, por canal). Período próprio (não usa o filtro
// 30/60/90 compartilhado) — dropdown de período com atalhos + calendário
// personalizado, default "Hoje".
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
function _cnImpostos() {
  return db._get('vtp_canais_imposto', { ifood: 6, '99food': 6, site: 4, outro: 0 });
}
function _cnSetImposto(canal, pct) {
  const c = _cnImpostos();
  c[canal] = parseFloat(pct) || 0;
  db._set('vtp_canais_imposto', c);
  renderVendasCanais();
}

// ── Período (dropdown de atalhos + calendário duplo) ────────────

let _cnPerAberto    = false;
let _cnPerModo      = 'hoje';
let _cnPerDe        = null;
let _cnPerAte       = null;
let _cnCalMesEsq    = null;
let _cnCalMesDir    = null;
let _cnCalPendente  = null;
const _CN_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function _cnIni(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function _cnFim(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function _cnFmtDataHora(d) { return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
// Data LOCAL em "yyyy-mm-dd" — nunca usar .toISOString() aqui: converte pra
// UTC e, em fusos negativos (Brasil, UTC-3), 23:59:59 local vira o dia
// SEGUINTE em UTC, destacando 2 dias no calendário em vez de 1.
function _cnIsoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function _cnPeriodoPresets() {
  const hoje = _cnIni(new Date());
  const fimHoje = _cnFim(new Date());
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const domEsta = new Date(hoje); domEsta.setDate(hoje.getDate() - hoje.getDay());
  const domPassada = new Date(domEsta); domPassada.setDate(domPassada.getDate() - 7);
  const sabPassado = new Date(domEsta); sabPassado.setDate(sabPassado.getDate() - 1);
  const primEsteMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const primMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ultMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  const mesEspecifico = (offset) => {
    const p = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
    const u = new Date(hoje.getFullYear(), hoje.getMonth() + offset + 1, 0);
    return { id: 'mes' + offset, label: `${_CN_MESES[p.getMonth()]}/${p.getFullYear()}`, de: _cnIni(p), ate: _cnFim(u) };
  };
  return [
    { id: 'hoje', label: 'Hoje', de: hoje, ate: fimHoje },
    { id: 'ontem', label: 'Ontem', de: _cnIni(ontem), ate: _cnFim(ontem) },
    { id: 'semana', label: 'Esta semana', de: domEsta, ate: fimHoje },
    { id: 'semana_passada', label: 'Semana passada', de: domPassada, ate: _cnFim(sabPassado) },
    { id: 'mes', label: 'Este mês', de: primEsteMes, ate: fimHoje },
    { id: 'mes_passado', label: 'Mês passado', de: primMesPassado, ate: _cnFim(ultMesPassado) },
    mesEspecifico(-2), mesEspecifico(-3), mesEspecifico(-4),
    { id: 'ult2', label: 'Últimos 2 meses', de: _cnIni(new Date(hoje.getFullYear(), hoje.getMonth() - 2, hoje.getDate())), ate: fimHoje },
    { id: 'ult3', label: 'Últimos 3 meses', de: _cnIni(new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate())), ate: fimHoje },
    { id: 'ult6', label: 'Últimos 6 meses', de: _cnIni(new Date(hoje.getFullYear(), hoje.getMonth() - 6, hoje.getDate())), ate: fimHoje },
  ];
}

function _cnPeriodoRange() {
  if (!_cnPerDe || !_cnPerAte) {
    const p = _cnPeriodoPresets().find(x => x.id === 'hoje');
    _cnPerDe = p.de; _cnPerAte = p.ate;
  }
  return { inicioISO: _cnPerDe.toISOString(), fimISO: _cnPerAte.toISOString() };
}

function _cnTogglePeriodo() {
  _cnPerAberto = !_cnPerAberto;
  if (_cnPerAberto) {
    const base = _cnPerDe || new Date();
    _cnCalMesDir = new Date(base.getFullYear(), base.getMonth(), 1);
    _cnCalMesEsq = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    _cnCalPendente = null;
  }
  _cnAtualizarPeriodoBar();
}
function _cnSetPreset(id) {
  const p = _cnPeriodoPresets().find(x => x.id === id); if (!p) return;
  _cnPerModo = id; _cnPerDe = p.de; _cnPerAte = p.ate; _cnCalPendente = null;
  _cnPerAberto = false;
  renderVendasCanais();
}
function _cnCalNav(lado, delta) {
  const ref = lado === 'esq' ? _cnCalMesEsq : _cnCalMesDir;
  ref.setMonth(ref.getMonth() + delta);
  _cnAtualizarPeriodoBar();
}
function _cnCalClickDia(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (!_cnCalPendente) {
    _cnCalPendente = d;
    _cnPerDe = _cnIni(d); _cnPerAte = _cnFim(d);
  } else {
    if (d < _cnCalPendente) { _cnPerDe = _cnIni(d); _cnPerAte = _cnFim(_cnCalPendente); }
    else { _cnPerDe = _cnIni(_cnCalPendente); _cnPerAte = _cnFim(d); }
    _cnCalPendente = null;
  }
  _cnPerModo = 'custom';
  _cnAtualizarPeriodoBar();
}
function _cnAplicarCustom() {
  _cnPerAberto = false;
  renderVendasCanais();
}

function _cnCalendarioHtml(mesDate, ladoId) {
  const ano = mesDate.getFullYear(), mes = mesDate.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasMesAnterior = new Date(ano, mes, 0).getDate();
  const hojeIso = _cnIsoLocal(new Date());
  const deIso = _cnPerDe ? _cnIsoLocal(_cnPerDe) : null;
  const ateIso = _cnPerAte ? _cnIsoLocal(_cnPerAte) : null;

  const celulas = [];
  for (let i = primeiroDiaSemana - 1; i >= 0; i--) celulas.push({ dia: diasMesAnterior - i, fora: true });
  for (let d = 1; d <= diasNoMes; d++) celulas.push({ dia: d, fora: false, iso: `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  while (celulas.length % 7 !== 0) celulas.push({ dia: '', fora: true });
  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return `<div style="width:220px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <button onclick="_cnCalNav('${ladoId}',-1)" style="border:none;background:none;cursor:pointer;color:var(--muted);padding:2px;display:flex">${lc('chevron-left', 14, 'currentColor')}</button>
      <span style="font-size:.8rem;font-weight:700">${_CN_MESES[mes].toLowerCase()}, ${ano}</span>
      <button onclick="_cnCalNav('${ladoId}',1)" style="border:none;background:none;cursor:pointer;color:var(--muted);padding:2px;display:flex">${lc('chevron-right', 14, 'currentColor')}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:.62rem;color:var(--muted);text-align:center;margin-bottom:4px">
      ${['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sá'].map(d => `<div>${d}</div>`).join('')}
    </div>
    ${semanas.map(sem => `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:2px">
      ${sem.map(c => {
        if (c.fora) return `<div style="aspect-ratio:1"></div>`;
        const noRange = deIso && ateIso && c.iso >= deIso && c.iso <= ateIso;
        const isPonta = c.iso === deIso || c.iso === ateIso;
        const isHoje = c.iso === hojeIso;
        const bg = isPonta ? 'var(--purple)' : noRange ? 'var(--purple-xlight,#EFE7FE)' : 'transparent';
        const cor = isPonta ? '#fff' : 'var(--text)';
        return `<div onclick="_cnCalClickDia('${c.iso}')" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:.76rem;cursor:pointer;border-radius:6px;background:${bg};color:${cor};${isHoje && !isPonta ? 'box-shadow:inset 0 0 0 1px var(--purple)' : ''}">${c.dia}</div>`;
      }).join('')}
    </div>`).join('')}
  </div>`;
}

function _cnRenderPeriodoBar() {
  const presets = _cnPeriodoPresets();
  const labelAtual = _cnPerModo !== 'custom'
    ? (presets.find(p => p.id === _cnPerModo)?.label || 'Hoje')
    : (_cnPerDe && _cnPerAte ? `${_cnFmtDataHora(_cnPerDe)} ~ ${_cnFmtDataHora(_cnPerAte)}` : 'Selecione o período');

  const dropdown = _cnPerAberto ? `<div id="cnPeriodoDropdown" style="position:absolute;top:calc(100% + 6px);left:0;z-index:30;background:var(--bg);border:1px solid var(--border);border-radius:var(--r10);box-shadow:0 8px 24px rgba(0,0,0,.15);display:flex" onclick="event.stopPropagation()">
    <div style="width:150px;border-right:1px solid var(--border);padding:8px 0">
      ${presets.map(p => `<div onclick="_cnSetPreset('${p.id}')" style="padding:8px 14px;font-size:.82rem;cursor:pointer;color:${_cnPerModo === p.id ? 'var(--purple)' : 'var(--text)'};font-weight:${_cnPerModo === p.id ? '700' : '400'}">${p.label}</div>`).join('')}
    </div>
    <div style="padding:14px 16px">
      <div style="font-size:.8rem;font-weight:600;margin-bottom:10px">${_cnPerDe && _cnPerAte ? `${_cnFmtDataHora(_cnPerDe)} ~ ${_cnFmtDataHora(_cnPerAte)}` : 'Selecione o período'}</div>
      <div style="display:flex;gap:16px">
        ${_cnCalendarioHtml(_cnCalMesEsq, 'esq')}
        ${_cnCalendarioHtml(_cnCalMesDir, 'dir')}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px">
        <button class="btn btn-primary btn-sm" onclick="_cnAplicarCustom()">OK</button>
      </div>
    </div>
  </div>` : '';

  return `<div id="cnPeriodoBar" style="position:relative;display:inline-block;margin-bottom:16px">
    <button onclick="_cnTogglePeriodo()" class="btn btn-outline btn-sm" style="display:inline-flex;align-items:center;gap:8px">
      ${lc('calendar', 14, 'currentColor')} ${labelAtual} ${lc('chevron-down', 12, 'currentColor')}
    </button>
    ${dropdown}
  </div>`;
}
function _cnAtualizarPeriodoBar() {
  const el = document.getElementById('cnPeriodoBar');
  if (el) el.outerHTML = _cnRenderPeriodoBar();
}

async function renderVendasCanais() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;
  el.innerHTML = _cnRenderPeriodoBar() + `<div style="padding:40px;text-align:center;color:var(--muted)">${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos...</div>`;

  const range = _cnPeriodoRange();
  let linhas;
  try { linhas = await vendasCarregarPeriodo(range.inicioISO, range.fimISO); }
  catch (e) { el.innerHTML = _cnRenderPeriodoBar() + `<div style="padding:40px;text-align:center;color:var(--red)">Erro: ${e.message}</div>`; return; }

  const porCanal = vendasPorCanal(linhas);
  const com = _cnComissoes();
  const imp = _cnImpostos();
  const canais = Object.values(porCanal).sort((a, b) => b.receita - a.receita).map(c => {
    const pct = com[c.canal] ?? 0;
    const pctImp = imp[c.canal] ?? 0;
    const comissao = c.receita * pct / 100;
    const imposto = c.receita * pctImp / 100;
    const margem = c.receita - c.custo - comissao - imposto;
    return { ...c, pct, pctImp, comissao, imposto, margem, margemPct: c.receita > 0 ? margem / c.receita * 100 : 0 };
  });

  const tot = canais.reduce((a, c) => ({ receita: a.receita + c.receita, custo: a.custo + c.custo, comissao: a.comissao + c.comissao, imposto: a.imposto + c.imposto, margem: a.margem + c.margem }), { receita: 0, custo: 0, comissao: 0, imposto: 0, margem: 0 });
  const cmvPct = tot.receita > 0 ? tot.custo / tot.receita * 100 : 0;

  const kpi = (lbl, v, sub, cor) => `<div style="background:var(--surface2);border-radius:var(--r10,8px);padding:14px 16px">
    <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${lbl}</div>
    <div style="font-size:1.4rem;font-weight:800;${cor?'color:'+cor:''}">${v}</div>${sub?`<div style="font-size:.72rem;color:var(--muted)">${sub}</div>`:''}</div>`;

  el.innerHTML = _cnRenderPeriodoBar() + `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:16px">Rentabilidade por canal — receita real do canal menos custo (ficha), comissão e imposto. Ajuste comissão e imposto de cada canal abaixo.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
      ${kpi('Receita bruta', 'R$ ' + fmt(tot.receita))}
      ${kpi('Comissão total', 'R$ ' + fmt(tot.comissao), tot.receita>0?fmt(tot.comissao/tot.receita*100)+'% da receita':'')}
      ${kpi('CMV', tot.receita>0?fmt(cmvPct)+'%':'—', 'R$ ' + fmt(tot.custo))}
      ${kpi('Impostos', 'R$ ' + fmt(tot.imposto), tot.receita>0?fmt(tot.imposto/tot.receita*100)+'% da receita':'')}
      ${kpi('Margem líquida', 'R$ ' + fmt(tot.margem), '', tot.margem<0?'var(--red)':'var(--green)')}
    </div>

    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Composição da receita por canal (R$)</div>
      <div style="height:${Math.max(160, canais.length*48)}px"><canvas id="cnChart"></canvas></div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
      <div style="display:grid;grid-template-columns:1fr 60px 1fr 1fr 80px 1fr 80px 1fr 1fr 80px;gap:10px;padding:10px 16px;background:var(--surface2);font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;min-width:920px">
        <div>Canal</div><div style="text-align:right">Vendas</div><div style="text-align:right">Receita</div><div style="text-align:right">Custo</div><div style="text-align:center">Comissão %</div><div style="text-align:right">Comissão R$</div><div style="text-align:center">Imposto %</div><div style="text-align:right">Imposto R$</div><div style="text-align:right">Margem líq.</div><div style="text-align:right">Margem %</div>
      </div>
      ${canais.map(c => `<div style="display:grid;grid-template-columns:1fr 60px 1fr 1fr 80px 1fr 80px 1fr 1fr 80px;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:.84rem;min-width:920px">
        <div style="font-weight:700">${c.canal}</div>
        <div style="text-align:right;color:var(--muted)">${c.vendas}</div>
        <div style="text-align:right;font-weight:600">R$ ${fmt(c.receita)}</div>
        <div style="text-align:right;color:var(--muted)">R$ ${fmt(c.custo)}</div>
        <div style="text-align:center"><input type="number" class="inp" value="${c.pct}" min="0" max="100" step="0.5" onchange="_cnSetComissao('${c.canal}',this.value)" style="width:60px;text-align:right;font-size:.8rem;padding:4px 6px"></div>
        <div style="text-align:right;color:var(--orange-dark)">R$ ${fmt(c.comissao)}</div>
        <div style="text-align:center"><input type="number" class="inp" value="${c.pctImp}" min="0" max="100" step="0.5" onchange="_cnSetImposto('${c.canal}',this.value)" style="width:60px;text-align:right;font-size:.8rem;padding:4px 6px"></div>
        <div style="text-align:right;color:var(--orange-dark)">R$ ${fmt(c.imposto)}</div>
        <div style="text-align:right;font-weight:800;color:${c.margem<0?'var(--red)':'var(--green)'}">R$ ${fmt(c.margem)}</div>
        <div style="text-align:right;font-weight:700;color:${c.margemPct<0?'var(--red)':'var(--text)'}">${fmt(c.margemPct)}%</div>
      </div>`).join('') || '<div class="ft-empty-list" style="padding:14px">Sem vendas no período</div>'}
      </div>
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
  const cCusto = '#B4B2A9', cCom = css.getPropertyValue('--chart-3').trim() || '#D97706', cImp = css.getPropertyValue('--chart-2').trim() || '#DC7A9E', cMarg = css.getPropertyValue('--chart-4').trim() || '#16A34A';
  _cnChart = new Chart(cv, {
    type: 'bar',
    data: {
      labels: canais.map(c => c.canal),
      datasets: [
        { label: 'Custo', data: canais.map(c => +c.custo.toFixed(2)), backgroundColor: cCusto, borderRadius: 3 },
        { label: 'Comissão', data: canais.map(c => +c.comissao.toFixed(2)), backgroundColor: cCom, borderRadius: 3 },
        { label: 'Imposto', data: canais.map(c => +c.imposto.toFixed(2)), backgroundColor: cImp, borderRadius: 3 },
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

// Custo sempre vem do cadastro (ficha técnica); o preço de cada canal é
// derivado da meta de CMV que o Yuri aponta — não é mais simulação avulsa,
// os produtos ficam salvos (kv_store) pra acompanhar/ajustar mês a mês.
// Confirmado com o Yuri (2026-07-20): "o cadastro de produto vai dar o
// custo, a gente vai entender a precificação correta apontando o CMV que
// queremos" — e o preço de cada plataforma é o preço do site "inflado"
// pelo Total% dela, pra a comissão ser paga pelo cliente da plataforma e
// não corroer a margem (preço plataforma = preço site ÷ (1 − total%)).

function _pcConfig() {
  return db._get('vtp_precificacao_config', {
    metaCmvSite: 30,
    plataformas: [
      { id: 'ifood',  nome: 'iFood',  entregaPropria: 12, retirado: 9, pagtoOnline: 3.5, promocoes: 4, antecipacao: 3.8 },
      { id: '99food', nome: '99Food', entregaPropria: 10, retirado: 7, pagtoOnline: 3,   promocoes: 4, antecipacao: 3 },
    ],
  });
}
function _pcSalvarConfig(cfg) { db._set('vtp_precificacao_config', cfg); }
function _pcTotalPlataforma(p) { return (p.entregaPropria || 0) + (p.retirado || 0) + (p.pagtoOnline || 0) + (p.promocoes || 0) + (p.antecipacao || 0); }

function _pcProdutosSalvos() { return db._get('vtp_precificacao_produtos', []); }
function _pcSalvarProdutos(arr) { db._set('vtp_precificacao_produtos', arr); }

// A Opção já é cadastrada com o prefixo "1/2 " embutido no nome (reflete o
// texto bruto do CW, ex.: "1/2 Calabresa") — remove pra exibir uma pizza
// inteira sem "meia" nenhuma; o meio a meio usa o nome como já vem, sem
// duplicar o prefixo.
function _pcSaborNomeBase(o) { return o ? o.nome.replace(/^1\/2\s+/i, '') : '(sabor removido)'; }

// Nome customizado (opcional) tem prioridade sobre o gerado automaticamente
// — dá pra descrever o produto do seu jeito (ex.: "Pizza da Casa") em vez
// de ficar preso ao nome montado a partir dos componentes.
function _pcNomeProduto(p) {
  if (p.nome) return p.nome;
  if (p.tipo === 'produto') {
    const item = produtos.find(x => x.id === p.produtoId) || items.find(x => x.id === p.produtoId);
    return item ? (item.name || item.nome) : '(produto removido)';
  }
  const tam = p.tamanho === 'grande' ? 'Grande' : 'Pequena';
  const o1 = opcoes.find(o => o.id === p.sabor1Id);
  const o2 = p.sabor2Id ? opcoes.find(o => o.id === p.sabor2Id) : null;
  if (o2) return `Pizza ${tam} — 1/2 ${_pcSaborNomeBase(o1)} + 1/2 ${_pcSaborNomeBase(o2)}`;
  return `Pizza ${tam} — ${_pcSaborNomeBase(o1)}`;
}

// Meio a meio = 1 unidade de cada sabor (grande soma 2 no total); sabor
// único (sem sabor 2) vale _vUnidadesInteira(tamanho) — 2 se grande, 1 se
// pequena — mesma regra central usada na interpretação de vendas.
function _pcCustoProduto(p) {
  if (p.tipo === 'produto') {
    const item = produtos.find(x => x.id === p.produtoId) || items.find(x => x.id === p.produtoId);
    return item?.fichaTecnica ? _calcCustoFicha(item.fichaTecnica) : (item?.cost || 0);
  }
  const base = vendasCustoBase(p.tamanho);
  const o1 = opcoes.find(o => o.id === p.sabor1Id);
  const o2 = p.sabor2Id ? opcoes.find(o => o.id === p.sabor2Id) : null;
  const c1 = o1 ? _calcCustoFicha(o1.fichaTecnica) : 0;
  if (o2) return base + c1 + _calcCustoFicha(o2.fichaTecnica);
  return base + c1 * _vUnidadesInteira(p.tamanho);
}

function _pcPrecos(p, cfg) {
  const custo = _pcCustoProduto(p);
  const precoSiteCalc = cfg.metaCmvSite > 0 ? custo / (cfg.metaCmvSite / 100) : 0;
  const siteManual = p.precoManual?.site;
  const precoSite = siteManual != null ? siteManual : precoSiteCalc;
  const out = { custo, site: { preco: precoSite, manual: siteManual != null, cmv: precoSite > 0 ? custo / precoSite * 100 : 0 } };
  for (const plat of cfg.plataformas) {
    const total = _pcTotalPlataforma(plat);
    const calc = total < 100 ? precoSite / (1 - total / 100) : 0;
    const manual = p.precoManual?.[plat.id];
    const preco = manual != null ? manual : calc;
    out[plat.id] = { preco, manual: manual != null, cmv: preco > 0 ? custo / preco * 100 : 0, total };
  }
  return out;
}

function _pcSetPrecoManual(id, canalId, valor) {
  const arr = _pcProdutosSalvos();
  const p = arr.find(x => x.id === id); if (!p) return;
  p.precoManual = p.precoManual || {};
  const v = parseFloat((valor + '').replace(',', '.'));
  if (!valor || isNaN(v)) delete p.precoManual[canalId]; else p.precoManual[canalId] = v;
  _pcSalvarProdutos(arr);
  renderVendasPrecos();
}

function _pcRemoverProduto(id) {
  if (!confirm('Remover este produto da tabela de precificação?')) return;
  _pcSalvarProdutos(_pcProdutosSalvos().filter(x => x.id !== id));
  renderVendasPrecos();
}

// ── Config de plataformas (cabeçalho) ──────────────────────────

function _pcSetMetaCmvSite(v) {
  const cfg = _pcConfig();
  cfg.metaCmvSite = parseFloat((v + '').replace(',', '.')) || 30;
  _pcSalvarConfig(cfg);
  renderVendasPrecos();
}
function _pcSetCampoPlataforma(id, campo, v) {
  const cfg = _pcConfig();
  const p = cfg.plataformas.find(x => x.id === id); if (!p) return;
  p[campo] = parseFloat((v + '').replace(',', '.')) || 0;
  _pcSalvarConfig(cfg);
  renderVendasPrecos();
}
function _pcRemoverPlataforma(id) {
  if (!confirm('Remover esta plataforma? Os produtos deixam de mostrar o preço dela.')) return;
  const cfg = _pcConfig();
  cfg.plataformas = cfg.plataformas.filter(x => x.id !== id);
  _pcSalvarConfig(cfg);
  renderVendasPrecos();
}
function _pcAbrirNovaPlataforma() {
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Nova plataforma</div>
    <div class="field"><label class="slbl">Nome *</label><input id="npNome" class="inp" placeholder="Ex.: Rappi"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_pcSalvarNovaPlataforma(this)">Adicionar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
function _pcSalvarNovaPlataforma(btn) {
  const nome = document.getElementById('npNome')?.value.trim();
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  const cfg = _pcConfig();
  cfg.plataformas.push({ id: 'plat_' + Date.now(), nome, entregaPropria: 0, retirado: 0, pagtoOnline: 0, promocoes: 0, antecipacao: 0 });
  _pcSalvarConfig(cfg);
  btn.closest('.overlay').remove();
  renderVendasPrecos();
}

// ── Modal: adicionar produto à tabela ───────────────────────────

let _pcNovoTipo      = 'pizza'; // 'pizza' | 'produto'
let _pcNovoTamanho   = 'grande';
let _pcNovoSabor1    = null;
let _pcNovoSabor2    = null;
let _pcNovoProdutoId = null;
let _pcNovoNome      = '';   // nome customizado (opcional) — sobrepõe o gerado
let _pcEditandoId    = null; // id do produto em edição (null = criando novo)

function _pcSaborOptions(sel) {
  return `<option value="">Escolha o sabor...</option>` +
    opcoes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(o => `<option value="${o.id}"${o.id === sel ? ' selected' : ''}>${o.nome}${o.fichaTecnica?.ingredientes?.length ? '' : ' (sem ficha)'}</option>`).join('');
}
function _pcProdutoOptions(sel) {
  return `<option value="">Escolha o produto...</option>` +
    produtos.slice().sort((a, b) => (a.name || a.nome).localeCompare(b.name || b.nome)).map(x => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${x.name || x.nome}</option>`).join('');
}

// id != null → edita o produto existente (pré-carrega os campos); sem id →
// modal em branco pra criar um novo.
function _pcAbrirModalProduto(id) {
  const existente = id != null ? _pcProdutosSalvos().find(x => x.id === id) : null;
  _pcEditandoId    = existente ? existente.id : null;
  _pcNovoTipo      = existente ? existente.tipo : 'pizza';
  _pcNovoTamanho   = existente?.tamanho || 'grande';
  _pcNovoSabor1    = existente?.sabor1Id || null;
  _pcNovoSabor2    = existente?.sabor2Id || null;
  _pcNovoProdutoId = existente?.produtoId || null;
  _pcNovoNome      = existente?.nome || '';
  const ov = document.createElement('div'); ov.id = 'pcModalProduto'; ov.className = 'overlay open';
  ov.innerHTML = _pcModalProdutoHtml();
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}
function _pcAtualizarModalProduto() {
  const ov = document.getElementById('pcModalProduto'); if (!ov) return;
  ov.innerHTML = _pcModalProdutoHtml();
}
function _pcModalSetTipo(t) { _pcNovoTipo = t; _pcAtualizarModalProduto(); }
function _pcModalSetTamanho(t) { _pcNovoTamanho = t; if (t === 'pequena') _pcNovoSabor2 = null; _pcAtualizarModalProduto(); }
function _pcModalSetSabor1(v) { _pcNovoSabor1 = parseInt(v) || null; _pcAtualizarModalProduto(); }
function _pcModalSetSabor2(v) { _pcNovoSabor2 = parseInt(v) || null; _pcAtualizarModalProduto(); }
function _pcModalSetProduto(v) { _pcNovoProdutoId = parseInt(v) || null; _pcAtualizarModalProduto(); }
function _pcModalSetNome(v) { _pcNovoNome = v; }

function _pcModalProdutoHtml() {
  const seg = (opts, val, fn) => `<div style="display:inline-flex;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
    ${opts.map(([id, lbl]) => `<button onclick="${fn}('${id}')" style="padding:7px 16px;font-size:.82rem;font-weight:600;border:none;cursor:pointer;background:${id === val ? 'var(--purple)' : 'transparent'};color:${id === val ? '#fff' : 'var(--muted)'}">${lbl}</button>`).join('')}
  </div>`;

  let autoNome = '';
  let preview = '';
  if (_pcNovoTipo === 'pizza' && _pcNovoSabor1) {
    const p = { tipo: 'pizza', tamanho: _pcNovoTamanho, sabor1Id: _pcNovoSabor1, sabor2Id: _pcNovoSabor2 };
    autoNome = _pcNomeProduto(p);
    const chips = [`Base Pizza ${_pcNovoTamanho === 'grande' ? 'Grande' : 'Pequena'}`];
    const o1 = opcoes.find(o => o.id === _pcNovoSabor1);
    if (o1) chips.push(_pcNovoSabor2 ? '1/2 ' + _pcSaborNomeBase(o1) : _pcSaborNomeBase(o1));
    if (_pcNovoSabor2) { const o2 = opcoes.find(o => o.id === _pcNovoSabor2); if (o2) chips.push('1/2 ' + _pcSaborNomeBase(o2)); }
    preview = `<div style="background:var(--surface2);border-radius:var(--r8);padding:10px 12px;margin-bottom:16px">
      ${chips.map(c => `<span class="badge" style="background:var(--purple-xlight,#EFE7FE);color:var(--purple);margin:2px 4px 2px 0">${c}</span>`).join('')}
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:.86rem"><span style="color:var(--muted)">Nome final</span><b>${_pcNovoNome || autoNome}</b></div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.86rem"><span style="color:var(--muted)">Custo pela ficha</span><b>R$ ${fmt(_pcCustoProduto(p))}</b></div>
    </div>`;
  } else if (_pcNovoTipo === 'produto' && _pcNovoProdutoId) {
    const p = { tipo: 'produto', produtoId: _pcNovoProdutoId };
    autoNome = _pcNomeProduto(p);
    preview = `<div style="background:var(--surface2);border-radius:var(--r8);padding:10px 12px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;font-size:.86rem"><span style="color:var(--muted)">Nome final</span><b>${_pcNovoNome || autoNome}</b></div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:.86rem"><span style="color:var(--muted)">Custo pela ficha</span><b>R$ ${fmt(_pcCustoProduto(p))}</b></div>
    </div>`;
  }

  const podeSalvar = (_pcNovoTipo === 'pizza' && _pcNovoSabor1) || (_pcNovoTipo === 'produto' && _pcNovoProdutoId);

  return `<div class="modal" style="width:460px;max-width:92vw;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">${_pcEditandoId != null ? 'Editar produto' : 'Adicionar produto'}</div>

    <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Tipo</div>
    <div style="margin-bottom:16px">${seg([['pizza', 'Pizza (montar)'], ['produto', 'Produto do cadastro']], _pcNovoTipo, '_pcModalSetTipo')}</div>

    ${_pcNovoTipo === 'pizza' ? `
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Tamanho</div>
      <div style="margin-bottom:16px">${seg([['grande', 'Grande'], ['pequena', 'Pequena']], _pcNovoTamanho, '_pcModalSetTamanho')}</div>

      <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Sabor 1</div>
      <select class="inp" style="width:100%;margin-bottom:10px" onchange="_pcModalSetSabor1(this.value)">${_pcSaborOptions(_pcNovoSabor1)}</select>

      ${_pcNovoTamanho === 'grande' ? `
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Sabor 2 <span style="font-weight:400">(meio a meio — opcional, pode repetir o sabor 1)</span></div>
        <select class="inp" style="width:100%;margin-bottom:14px" onchange="_pcModalSetSabor2(this.value)"><option value="">Nenhum — pizza inteira</option>${_pcSaborOptions(_pcNovoSabor2)}</select>
      ` : ''}
    ` : `
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Produto</div>
      <select class="inp" style="width:100%;margin-bottom:14px" onchange="_pcModalSetProduto(this.value)">${_pcProdutoOptions(_pcNovoProdutoId)}</select>
    `}

    <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Nome do produto <span style="font-weight:400">(opcional — em branco usa o nome gerado automaticamente)</span></div>
    <input class="inp" style="width:100%;margin-bottom:16px" placeholder="${autoNome || 'Ex.: Pizza da Casa'}" value="${_pcNovoNome.replace(/"/g, '&quot;')}" onchange="_pcModalSetNome(this.value)">

    ${preview}

    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-outline btn-sm" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="_pcSalvarNovoProduto(this)"${podeSalvar ? '' : ' disabled'}>${_pcEditandoId != null ? 'Salvar alterações' : 'Salvar produto'}</button>
    </div>
  </div>`;
}

function _pcSalvarNovoProduto(btn) {
  const nome = _pcNovoNome.trim() || null;
  const arr = _pcProdutosSalvos();

  if (_pcEditandoId != null) {
    const p = arr.find(x => x.id === _pcEditandoId); if (!p) return;
    p.tipo = _pcNovoTipo; p.nome = nome;
    if (_pcNovoTipo === 'pizza') { p.tamanho = _pcNovoTamanho; p.sabor1Id = _pcNovoSabor1; p.sabor2Id = _pcNovoSabor2; delete p.produtoId; }
    else { p.produtoId = _pcNovoProdutoId; delete p.tamanho; delete p.sabor1Id; delete p.sabor2Id; }
  } else {
    const p = _pcNovoTipo === 'pizza'
      ? { id: Date.now(), tipo: 'pizza', tamanho: _pcNovoTamanho, sabor1Id: _pcNovoSabor1, sabor2Id: _pcNovoSabor2, nome, precoManual: {} }
      : { id: Date.now(), tipo: 'produto', produtoId: _pcNovoProdutoId, nome, precoManual: {} };
    arr.push(p);
  }

  _pcSalvarProdutos(arr);
  btn.closest('.overlay').remove();
  renderVendasPrecos();
  toast(_pcEditandoId != null ? 'Produto atualizado' : 'Produto adicionado', 'ok');
}

// ── Render ───────────────────────────────────────────────────────

function renderVendasPrecos() {
  const el = document.getElementById('vendasTabContent');
  if (!el) return;

  const cfg = _pcConfig();
  const produtosSalvos = _pcProdutosSalvos();

  const platCard = (p) => {
    const total = _pcTotalPlataforma(p);
    const campo = (lbl, chave) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:.76rem">
      <label style="color:var(--muted);flex:1">${lbl}</label>
      <input type="number" class="inp" value="${p[chave]}" step="0.5" onchange="_pcSetCampoPlataforma('${p.id}','${chave}',this.value)" style="width:64px;text-align:right;font-size:.8rem;padding:4px 6px">
      <span style="font-size:.78rem;color:var(--muted)">%</span>
    </div>`;
    return `<div class="card" style="padding:14px 16px;flex:1;min-width:230px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:.88rem">${p.nome}</div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="font-size:1.2rem;font-weight:800;color:var(--purple)">${fmt(total)}%</div>
          <button class="btn btn-ghost btn-xs" onclick="_pcRemoverPlataforma('${p.id}')" title="Remover plataforma">${lc('trash-2', 12, 'currentColor')}</button>
        </div>
      </div>
      ${campo('Comissão — entrega própria', 'entregaPropria')}
      ${campo('Comissão — retirado', 'retirado')}
      ${campo('Comissão — pagto. online', 'pagtoOnline')}
      ${campo('Taxa de promoções', 'promocoes')}
      ${campo('Taxa de antecipação', 'antecipacao')}
    </div>`;
  };

  const linhaProduto = (p) => {
    const precos = _pcPrecos(p, cfg);
    const corCmv = pc => pc <= 0 ? 'var(--muted)' : pc > cfg.metaCmvSite ? 'var(--red)' : 'var(--green)';
    const celulaPreco = (canalId, dado) => `<td style="text-align:right;padding:8px 12px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:4px">
        <span style="font-size:.7rem;color:var(--muted)">R$</span>
        <input type="number" class="inp" value="${dado.preco.toFixed(2)}" step="0.5"
          onchange="_pcSetPrecoManual(${p.id},'${canalId}',this.value)"
          style="width:78px;text-align:right;font-size:.84rem;font-weight:700;padding:4px 6px${dado.manual ? ';border-color:var(--orange-dark)' : ''}">
        ${dado.manual ? `<button class="btn btn-ghost btn-xs" onclick="_pcSetPrecoManual(${p.id},'${canalId}','')" title="Voltar ao calculado">${lc('refresh-cw', 11, 'currentColor')}</button>` : ''}
      </div>
      <div style="font-size:.66rem;color:${corCmv(dado.cmv)};text-align:right;margin-top:2px">CMV ${fmt(dado.cmv)}%${dado.manual ? ' · ajustado' : ''}</div>
    </td>`;

    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid var(--border)"><b>${_pcNomeProduto(p)}</b></td>
      <td style="text-align:right;padding:10px 12px;border-bottom:1px solid var(--border);color:var(--muted)">R$ ${fmt(precos.custo)}</td>
      ${celulaPreco('site', precos.site)}
      ${cfg.plataformas.map(plat => celulaPreco(plat.id, precos[plat.id])).join('')}
      <td style="text-align:center;padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap">
        <button class="btn btn-ghost btn-xs" onclick="_pcAbrirModalProduto(${p.id})" title="Editar">${lc('edit-2', 13, 'currentColor')}</button>
        <button class="btn btn-ghost btn-xs" onclick="_pcRemoverProduto(${p.id})" title="Remover">${lc('trash-2', 13, 'currentColor')}</button>
      </td>
    </tr>`;
  };

  el.innerHTML = `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:20px">Preço de cada produto pela ficha técnica, comparado nos canais de venda. Acompanhe mês a mês se algum precisa de ajuste.</div>

    <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Plataformas</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:26px;align-items:stretch">
      <div class="card" style="padding:14px 16px;flex:1;min-width:230px;background:var(--purple-xlight,#EFE7FE);border:1.5px dashed var(--purple)">
        <div style="font-weight:700;font-size:.88rem">Site / loja própria</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:6px">Preço praticado é gerado pela meta de CMV — sem comissão de terceiros.</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;font-size:.82rem">
          <label style="color:var(--muted)">Meta de CMV</label>
          <div style="display:flex;align-items:center;gap:6px"><input type="number" class="inp" value="${cfg.metaCmvSite}" min="1" max="90" onchange="_pcSetMetaCmvSite(this.value)" style="width:70px;text-align:right;font-size:.86rem;padding:6px 8px">%</div>
        </div>
      </div>
      ${cfg.plataformas.map(platCard).join('')}
      <div class="card" style="padding:14px 16px;min-width:150px;display:flex;align-items:center;justify-content:center;border:1.5px dashed var(--border);background:transparent;cursor:pointer" onclick="_pcAbrirNovaPlataforma()">
        <div style="text-align:center;color:var(--muted)">
          ${lc('plus', 18, 'currentColor')}
          <div style="font-size:.8rem;font-weight:600;margin-top:4px">Nova plataforma</div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Produtos precificados <span style="font-weight:400;text-transform:none">— ${produtosSalvos.length} cadastrado${produtosSalvos.length === 1 ? '' : 's'}</span></div>
      <button class="btn btn-primary btn-xs" onclick="_pcAbrirModalProduto()">+ Adicionar produto</button>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:.84rem">
          <thead><tr style="background:var(--surface2)">
            <th style="text-align:left;font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:10px 12px">Produto</th>
            <th style="text-align:right;font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:10px 12px">Custo</th>
            <th style="text-align:right;font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:10px 12px">Preço site<span style="display:block;font-size:.62rem;font-weight:700;color:var(--purple);text-transform:none">meta CMV ${fmt(cfg.metaCmvSite)}%</span></th>
            ${cfg.plataformas.map(p => `<th style="text-align:right;font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;padding:10px 12px">Preço ${p.nome}<span style="display:block;font-size:.62rem;font-weight:700;color:var(--purple);text-transform:none">taxa total ${fmt(_pcTotalPlataforma(p))}%</span></th>`).join('')}
            <th style="padding:10px 12px"></th>
          </tr></thead>
          <tbody>
            ${produtosSalvos.length ? produtosSalvos.map(linhaProduto).join('') : `<tr><td colspan="${4 + cfg.plataformas.length}" style="padding:24px;text-align:center;color:var(--muted)">Nenhum produto cadastrado — clique em "+ Adicionar produto" pra começar.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

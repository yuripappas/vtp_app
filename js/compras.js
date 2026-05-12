/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Módulo de Compras (v3)
 */

let _listaAtual = null;
let _comprasTab  = 'lista'; // 'lista' | 'historico'

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderComprasModule() {
  _listaAtual = getListaAtiva();
  _renderDashCompras();
  if (_comprasTab === 'historico') {
    _renderHistorico();
  } else {
    _listaAtual ? _renderEtapa(_listaAtual.etapa) : _renderSemLista();
  }
}

function setComprasTab(tab) {
  _comprasTab = tab;
  renderComprasModule();
}

function _renderComprasTabs() {
  const el = document.getElementById('comprasTabs');
  if (!el) return;
  const tabs = [
    { id: 'lista',     label: 'Lista Ativa', icon: 'clipboard-list' },
    { id: 'historico', label: 'Histórico',   icon: 'clock'          },
  ];
  el.innerHTML = tabs.map(t => {
    const active = _comprasTab === t.id;
    return `<button onclick="setComprasTab('${t.id}')"
      style="display:flex;align-items:center;gap:6px;padding:8px 16px;border:none;
      border-bottom:2.5px solid ${active ? 'var(--purple)' : 'transparent'};
      background:none;color:${active ? 'var(--purple)' : 'var(--muted)'};
      font-size:.8rem;font-weight:${active ? '700' : '500'};cursor:pointer;
      font-family:Inter,sans-serif;transition:all .15s">
      ${lc(t.icon, 13, 'currentColor')} ${t.label}
    </button>`;
  }).join('');
}

function _renderSemLista() {
  document.getElementById('comprasContent').innerHTML = `
    <div style="text-align:center;padding:52px 24px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--purple-light);
        display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        ${lc('shopping-cart', 28, 'var(--purple)')}
      </div>
      <div style="font-size:1.05rem;font-weight:800;margin-bottom:8px">Nenhuma lista ativa</div>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:28px;max-width:340px;margin-left:auto;margin-right:auto">
        Crie uma lista a partir do estoque ou inicie uma lista avulsa para compras pontuais.
      </div>

      <!-- Opções de criação -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;max-width:520px;margin:0 auto 24px">
        <button onclick="goModule('estoque')"
          style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 16px;
          background:var(--purple-xlight);border:2px solid var(--purple-light);border-radius:var(--r12);
          cursor:pointer;transition:all .15s"
          onmouseover="this.style.borderColor='var(--purple)';this.style.background='var(--purple-light)'"
          onmouseout="this.style.borderColor='var(--purple-light)';this.style.background='var(--purple-xlight)'">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--purple);display:flex;align-items:center;justify-content:center">
            ${lc('package', 20, '#fff')}
          </div>
          <div>
            <div style="font-size:.86rem;font-weight:700;color:var(--purple)">Gerar do Estoque</div>
            <div style="font-size:.7rem;color:var(--muted);margin-top:2px">A partir dos itens críticos/baixos</div>
          </div>
        </button>

        <button onclick="criarListaAvulsa()"
          style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 16px;
          background:var(--surface2);border:2px solid var(--border);border-radius:var(--r12);
          cursor:pointer;transition:all .15s"
          onmouseover="this.style.borderColor='var(--purple)';this.style.background='var(--purple-xlight)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface2)'">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--surface);border:2px solid var(--border);display:flex;align-items:center;justify-content:center">
            ${lc('plus-circle', 20, 'var(--purple)')}
          </div>
          <div>
            <div style="font-size:.86rem;font-weight:700;color:var(--text)">Lista Avulsa</div>
            <div style="font-size:.7rem;color:var(--muted);margin-top:2px">Adicione itens manualmente</div>
          </div>
        </button>
      </div>

      <button class="btn btn-outline btn-sm" onclick="setComprasTab('historico')">
        ${lc('clock', 13, 'currentColor')} Ver histórico de compras
      </button>
    </div>`;
}

function criarListaAvulsa() {
  // Cria lista vazia — sem itens do carrinho
  const lista = novaLista([]);
  lista.origem = 'avulsa';
  saveListas();
  _listaAtual = lista;
  _comprasTab = 'lista';
  _renderDashCompras();
  _renderEtapa1();
  // Abre modal de adicionar item automaticamente após breve delay
  setTimeout(() => abrirAddItemManual(), 200);
  toast('Lista avulsa criada! Adicione os itens.');
}

function _renderDashCompras() {
  const el = document.getElementById('comprasDash');
  if (!el) return;
  const la = _listaAtual;
  const st = la ? (STATUS_ETAPA[la.status] || {}) : null;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:180px">
        ${la ? `
          <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Lista ativa</div>
          <div style="font-size:.95rem;font-weight:800;color:var(--text)">${la.codigo}</div>
          <div style="font-size:.68rem;color:var(--muted)">Criada em ${fmtD(la.dataCriacao)} por ${la.criadoPor}</div>
        ` : `<div style="font-size:.88rem;font-weight:700">Compras</div><div style="font-size:.72rem;color:var(--muted)">Nenhuma lista ativa</div>`}
      </div>
      ${la ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div style="text-align:center;padding:6px 14px;background:var(--surface2);border-radius:var(--r8);border:1px solid var(--border)">
            <div style="font-size:.9rem;font-weight:800;color:var(--purple)">${la.itens.length}</div>
            <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">Itens</div>
          </div>
          <div style="text-align:center;padding:6px 14px;background:var(--surface2);border-radius:var(--r8);border:1px solid var(--border)">
            <div style="font-size:.88rem;font-weight:800;color:var(--purple)">R$${fmt(la.valorEstimado)}</div>
            <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">Estimado</div>
          </div>
          <div style="text-align:center;padding:6px 14px;background:${st.bg||'var(--surface2)'};border-radius:var(--r8);border:1px solid ${st.color||'var(--border)'}">
            <div style="font-size:.72rem;font-weight:700;color:${st.color||'var(--muted)'}">${st.label||la.status}</div>
            <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">Status</div>
          </div>
          <button class="btn btn-red btn-xs" onclick="encerrarListaManual()">${lc('x', 12)} Encerrar</button>
        </div>
      ` : `
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="criarListaAvulsa()">${lc('plus-circle',13,'#fff')} Nova lista</button>
          <button class="btn btn-outline btn-sm" onclick="goModule('estoque')">${lc('package',13,'currentColor')} Do estoque</button>
        </div>
      `}
    </div>
    <div id="comprasTabs" style="display:flex;border-bottom:1px solid var(--border);margin:-16px -24px 0;padding:0 24px;gap:4px"></div>
    ${la ? `
    <div style="margin-top:14px;display:flex;gap:3px">
      ${[{n:1,label:'Carrinho',icon:'shopping-cart'},{n:2,label:'Cotação',icon:'tag'},{n:3,label:'Aprovação',icon:'check-circle'},{n:4,label:'OC',icon:'shopping-bag'},{n:5,label:'Recebimento',icon:'package'}].map(s => {
        const done = la.etapa > s.n, cur = la.etapa === s.n;
        return `<div style="flex:1;text-align:center;cursor:${done?'pointer':'default'}" ${done?`onclick="_renderEtapa(${s.n})"`:''}>
          <div style="height:3px;border-radius:2px;background:${done?'var(--green)':cur?'var(--purple)':'var(--border)'};margin-bottom:5px"></div>
          <div style="font-size:.58rem;font-weight:600;color:${done?'var(--green)':cur?'var(--purple)':'var(--muted)'};display:flex;align-items:center;justify-content:center;gap:3px">
            ${lc(s.icon, 11, 'currentColor')} ${s.n}. ${s.label}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}`;

  _renderComprasTabs();
}

function _renderEtapa(n) {
  _comprasTab = 'lista';
  if (!_listaAtual) { _renderSemLista(); return; }
  if (n === 1) _renderEtapa1();        // Seleção / Carrinho
  else if (n === 2) _renderEtapa2Cotacao(); // Cotações
  else if (n === 3) _renderEtapa3Aprovacao(); // Aprovação
  else if (n === 4) _renderEtapa4OC(); // Ordem de Compra
  else if (n === 5) _renderEtapa5();   // Recebimento
}

// Alias para compatibilidade
function _renderEtapa2() { _renderEtapa2Cotacao(); }
function _renderEtapa3() { _renderEtapa3Aprovacao(); }

// ══════════════════════════════════════════════════════════════
// ETAPA 1 — LISTA COM AUTO-FORNECEDORES
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ETAPA 1 — CARRINHO DE COMPRAS
// Arquitetura: render completo na 1ª vez, updates parciais depois
// ══════════════════════════════════════════════════════════════

if (!window._e1Filtro) window._e1Filtro = { search:'', cat:'', status:'need' };

function _renderEtapa1() {
  _listaAtual.etapa = 1;
  saveListas();

  // Render estrutural completo (esqueleto da página)
  _e1RenderEstrutura();
  // Renderiza tabela e carrinho como partes independentes
  _e1RenderTabela();
  _e1RenderCarrinho();
}

// Renderiza o esqueleto HTML — só chamado 1 vez ou ao trocar de módulo
function _e1RenderEstrutura() {
  const l     = _listaAtual;
  const cats  = [...new Set(items.filter(i=>!i.isProd).map(i=>i.cat))].sort();
  const f     = window._e1Filtro;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start">

      <!-- Coluna principal -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:.96rem;font-weight:800;margin-bottom:3px">
              ${lc('list',14,'var(--purple)')} Selecionar itens para compra
            </h3>
            <div style="font-size:.71rem;color:var(--muted)">
              Adicione itens ao carrinho. Itens com necessidade aparecem primeiro.
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="imprimirCarrinho()"
              style="display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:var(--r8);
              border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:.78rem;font-weight:600;cursor:pointer">
              ${lc('printer',13,'currentColor')} Imprimir lista
            </button>
            <button onclick="abrirAddItemManual()"
              style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r8);
              border:1.5px solid var(--purple);background:var(--purple);color:#fff;font-size:.78rem;font-weight:700;cursor:pointer">
              ${lc('plus',13,'#fff')} Item avulso
            </button>
          </div>
        </div>

        <!-- Filtros — inputs com IDs fixos, não são recriados -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
          <input id="e1Search" class="inp" style="max-width:200px;padding:6px 10px;font-size:.78rem" placeholder="Buscar insumo..."
            value="${f.search}">
          <select id="e1Cat" class="inp" style="max-width:170px;padding:6px 8px;font-size:.78rem">
            <option value="">Todas categorias</option>
            ${cats.map(c=>`<option value="${c}" ${f.cat===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <div id="e1FiltrosBtns" style="display:flex;gap:4px;flex-wrap:wrap"></div>
        </div>

        <!-- Tabela — atualizada independentemente -->
        <div class="tbl-wrap">
          <table>
            <thead><tr>
              <th>Insumo</th>
              <th class="c" style="width:48px">Un.</th>
              <th class="c" style="width:80px">Digital</th>
              <th class="c" style="width:70px">Mínimo</th>
              <th class="c" style="width:70px">Ideal</th>
              <th style="width:110px">Nível</th>
              <th class="c" style="width:72px">Status</th>
              <th style="width:200px;text-align:right">Adicionar</th>
            </tr></thead>
            <tbody id="e1TableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Carrinho lateral — atualizado independentemente -->
      <div style="width:268px;flex-shrink:0;position:sticky;top:20px" id="e1CarrinhoWrap">
        <!-- preenchido por _e1RenderCarrinho -->
      </div>

    </div>`;

  // Bind eventos dos filtros APÓS inserir no DOM
  _e1BindFiltros();
}

function _e1BindFiltros() {
  // Search — usa input event com debounce leve, sem re-render completo
  const searchEl = document.getElementById('e1Search');
  if (searchEl) {
    searchEl.oninput = function() {
      window._e1Filtro.search = this.value;
      _e1RenderTabela(); // só tabela, não mexe no input
    };
  }

  // Category select
  const catEl = document.getElementById('e1Cat');
  if (catEl) {
    catEl.onchange = function() {
      window._e1Filtro.cat = this.value;
      _e1RenderTabela();
    };
  }

  // Botões de filtro
  _e1RenderFiltrosBtns();
}

function _e1RenderFiltrosBtns() {
  const el = document.getElementById('e1FiltrosBtns');
  if (!el) return;
  const f = window._e1Filtro;
  const btns = [
    {id:'all',  label:'Todos',       icon:'package'},
    {id:'need', label:'Necessidade', icon:'arrow-up'},
    {id:'crit', label:'Críticos',    icon:'alert-circle'},
    {id:'warn', label:'Baixo',       icon:'alert-triangle'},
  ];
  el.innerHTML = btns.map(b =>
    `<button class="filter-btn ${f.status===b.id?'active':''}"
      onclick="window._e1Filtro.status='${b.id}';_e1RenderFiltrosBtns();_e1RenderTabela()">
      ${lc(b.icon,11,'currentColor')} ${b.label}
    </button>`
  ).join('');
}

// Renderiza APENAS a tabela de insumos — sem tocar nos inputs de filtro
function _e1RenderTabela() {
  const tbody = document.getElementById('e1TableBody');
  if (!tbody) return;

  const l       = _listaAtual;
  const carrinho= l.itens;
  const f       = window._e1Filtro;
  const insumos = items.filter(i => !i.isProd);

  const stColors = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
  const stLabels = { crit:'CRÍTICO', warn:'BAIXO', ok:'OK' };
  const rowBg    = { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };

  let filt = insumos.filter(i => {
    if (f.cat && i.cat !== f.cat) return false;
    if (f.search && !i.name.toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.status === 'crit') return gst(i) === 'crit';
    if (f.status === 'warn') return gst(i) === 'warn';
    if (f.status === 'ok')   return gst(i) === 'ok';
    if (f.status === 'need') return gneed(i) > 0;
    return true;
  }).sort((a,b) => {
    const order = {crit:0,warn:1,ok:2};
    return (order[gst(a)]||2)-(order[gst(b)]||2) || a.name.localeCompare(b.name);
  });

  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px">
      <div style="font-size:.8rem;color:var(--muted)">Nenhum item encontrado</div>
    </td></tr>`;
    return;
  }

  const byCat = {};
  filt.forEach(i => { if(!byCat[i.cat]) byCat[i.cat]=[]; byCat[i.cat].push(i); });

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => {
    const catRow = `<tr>
      <td colspan="8" style="padding:6px 14px 4px;background:var(--surface2);border-top:2px solid var(--border)">
        <span style="font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">${cat}</span>
      </td>
    </tr>`;

    const rows = catItems.map(i => {
      const s      = gst(i);
      const need   = gneed(i);
      const pct    = i.ideal > 0 ? Math.min(100, Math.round(i.qty/i.ideal*100)) : 0;
      const inCart = carrinho.find(ci => ci.itemId === i.id);
      const bg     = inCart ? 'var(--purple-xlight)' : (rowBg[s]||'var(--surface)');
      const suger  = need > 0 ? need : (i.min || 1);

      // Coluna "Adicionar" — input direto com onchange que não re-renderiza a página
      const addCol = inCart ? `
        <div style="display:inline-flex;align-items:center;gap:4px;background:var(--purple);border-radius:var(--r8);padding:4px 8px">
          <button onclick="e1AjustarQtd(${i.id},-1)"
            style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
          <input type="number" id="e1qty_${i.id}" value="${inCart.qtdSelecionada}" min="0.001" step="0.001"
            style="width:56px;border:none;background:transparent;font-size:.82rem;font-weight:800;text-align:center;color:#fff;font-family:monospace"
            onchange="e1SetQtd(${i.id},this.value)"
            onblur="e1SetQtd(${i.id},this.value)">
          <span style="font-size:.62rem;color:rgba(255,255,255,.8);white-space:nowrap">${i.unit}</span>
          <button onclick="e1AjustarQtd(${i.id},1)"
            style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
          <button onclick="e1RemoverItem(${i.id})"
            style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('x',10,'#fff')}
          </button>
        </div>
      ` : `
        <div style="display:inline-flex;align-items:center;gap:8px">
          ${need > 0 ? `<div style="text-align:right">
            <div style="font-size:.9rem;font-weight:800;color:var(--purple);font-family:monospace">${fmt(need)}</div>
            <div style="font-size:.58rem;color:var(--muted)">${i.unit} sugerido</div>
          </div>` : ''}
          <button onclick="e1AddItem(${i.id})"
            style="width:30px;height:30px;border-radius:50%;border:none;background:var(--purple);
            color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;
            justify-content:center;box-shadow:0 2px 8px rgba(107,33,212,.3);transition:transform .15s"
            onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">+</button>
        </div>
      `;

      return `<tr id="e1row_${i.id}" style="background:${bg};border-bottom:1px solid var(--border)">
        <td style="padding:9px 14px">
          <div style="font-size:.82rem;font-weight:600">${i.name}</div>
          ${i.code?`<div style="font-size:.58rem;color:var(--muted);font-family:monospace">#${i.code}</div>`:''}
        </td>
        <td class="c" style="font-size:.74rem;color:var(--muted)">${i.unit}</td>
        <td class="c" style="font-size:.82rem;font-weight:600;font-family:monospace">${fmt(i.qty)}</td>
        <td class="c" style="font-size:.72rem;color:var(--muted)">${fmt(i.min)}</td>
        <td class="c" style="font-size:.72rem;color:var(--muted)">${fmt(i.ideal)}</td>
        <td style="padding:7px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${stColors[s]};border-radius:3px"></div>
            </div>
            <span style="font-size:.62rem;color:${stColors[s]};font-weight:700;min-width:28px">${pct}%</span>
          </div>
        </td>
        <td class="c">
          <span class="chip chip-${s==='crit'?'red':s==='warn'?'yellow':'green'}" style="font-size:.62rem">
            ${stLabels[s]}
          </span>
        </td>
        <td style="padding:7px 14px;text-align:right">${addCol}</td>
      </tr>`;
    }).join('');

    return catRow + rows;
  }).join('');
}

// Renderiza APENAS o carrinho lateral — sem tocar na tabela
function _e1RenderCarrinho() {
  const wrap = document.getElementById('e1CarrinhoWrap');
  if (!wrap) return;

  const l        = _listaAtual;
  const carrinho = l.itens;
  const totalEst = carrinho.reduce((s,ci) => s + ci.qtdSelecionada*(ci.precoUnitEstimado||0), 0);

  wrap.innerHTML = `
    <div class="card" style="overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight)">
        <div style="font-size:.84rem;font-weight:800;color:var(--purple)">${lc('shopping-cart',14,'var(--purple)')} Carrinho</div>
        <div style="font-size:.66rem;color:var(--muted);margin-top:1px">${carrinho.length} item(s)</div>
      </div>

      <!-- Valor estimado — DESTAQUE (fix item 1) -->
      <div style="padding:10px 14px;border-bottom:1.5px solid var(--purple-light);background:var(--purple-xlight)">
        <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--purple);margin-bottom:2px">
          Estimativa de custo
        </div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(totalEst)}</div>
        ${totalEst === 0 && carrinho.length > 0 ? `<div style="font-size:.6rem;color:var(--muted)">Cadastre custos nos insumos para ver o estimado</div>` : ''}
      </div>

      <div style="padding:10px;max-height:320px;overflow-y:auto">
        ${carrinho.length === 0 ? `
          <div style="text-align:center;padding:20px 10px">
            ${lc('shopping-cart',28,'var(--border)')}
            <div style="font-size:.74rem;color:var(--muted);margin-top:8px">Carrinho vazio</div>
            <div style="font-size:.66rem;color:var(--muted)">Use + para adicionar</div>
          </div>
        ` : carrinho.map(ci => {
          const item  = items.find(x => x.id === ci.itemId);
          const nome  = item?.name || ci.nome || '?';
          const unid  = item?.unit || ci.unidade || '';
          const custo = ci.qtdSelecionada * (ci.precoUnitEstimado||0);
          return `<div style="display:flex;align-items:center;gap:7px;padding:6px 8px;
            background:var(--surface);border:1px solid var(--border);border-radius:var(--r6);margin-bottom:4px">
            <div style="flex:1;min-width:0">
              <div style="font-size:.73rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1px">
                <span style="font-size:.62rem;color:var(--purple);font-family:monospace;font-weight:700">${fmt(ci.qtdSelecionada)} ${unid}</span>
                ${custo > 0 ? `<span style="font-size:.6rem;color:var(--muted);font-family:monospace">R$${fmt(custo)}</span>` : ''}
              </div>
            </div>
            <button onclick="e1RemoverItem(${ci.itemId || ci.id})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;padding:2px;flex-shrink:0">
              ${lc('x',12,'var(--muted)')}
            </button>
          </div>`;
        }).join('')}
      </div>

      ${carrinho.length > 0 ? `
        <div style="padding:10px;border-top:1.5px solid var(--border)">
          <button onclick="e1IrParaCotacao()"
            style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);
            font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
            ${lc('tag',14,'#fff')} Ir para Cotação
          </button>
          <button onclick="e1LimparCarrinho()"
            style="width:100%;margin-top:6px;padding:7px;background:none;color:var(--muted);
            border:1px solid var(--border);border-radius:var(--r8);font-size:.72rem;cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:5px">
            ${lc('trash',11,'var(--muted)')} Limpar carrinho
          </button>
        </div>
      ` : ''}
    </div>`;
}

// ── Ações do carrinho — atualizações cirúrgicas sem re-render completo ──
function e1AddItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  if (_listaAtual.itens.find(ci => ci.itemId === itemId)) return;
  const need = gneed(item);
  const qty  = need > 0 ? parseFloat(need.toFixed(3)) : parseFloat((item.min||1).toFixed(3));
  const newId = Math.max(0, ..._listaAtual.itens.map(x => x.id||0)) + 1;
  _listaAtual.itens.push({
    id: newId, itemId: item.id, nome: item.name,
    categoria: item.cat, unidade: item.unit,
    qtdSugerida: qty, qtdSelecionada: qty,
    qtdAprovada: null, qtdComprada: null, qtdRecebida: null,
    estoqueAtual: item.qty, estoqueMinimo: item.min, estoqueIdeal: item.ideal,
    origem: 'estoque', tipoCompra: 'fornecedor',
    fornecedorId: null, localCompra: '', responsavelCompra: '',
    precoUnitEstimado: item.cost||0, precoUnitFinal: null,
    cotacoes: [], aprovado: null, comentarioAprovador: '',
    conferido: false, divergencia: false, comentarioConferencia: '',
    conferidoPorItem: '', dataRecebimentoItem: '', horaRecebimentoItem: '',
  });
  _recalcEstimativa();
  saveListas();
  // Atualiza só a linha e o carrinho — sem re-render completo
  _e1AtualizarLinha(itemId);
  _e1RenderCarrinho();
}

function e1AjustarQtd(itemId, delta) {
  const ci   = _listaAtual.itens.find(x => x.itemId === itemId);
  const item = items.find(i => i.id === itemId);
  if (!ci || !item) return;
  const step = Math.max(0.1, Math.round((item.min||1) * 0.1 * 10) / 10);
  ci.qtdSelecionada = Math.max(0.001, parseFloat((ci.qtdSelecionada + delta * step).toFixed(3)));
  _recalcEstimativa();
  saveListas();
  // Atualiza só o input de quantidade e o carrinho
  const inp = document.getElementById(`e1qty_${itemId}`);
  if (inp) inp.value = ci.qtdSelecionada;
  _e1RenderCarrinho();
}

function e1SetQtd(itemId, val) {
  const ci = _listaAtual.itens.find(x => x.itemId === itemId);
  if (!ci) return;
  const v = parseFloat(val);
  if (isNaN(v) || v <= 0) return;
  ci.qtdSelecionada = parseFloat(v.toFixed(3));
  _recalcEstimativa();
  saveListas();
  // Só atualiza o carrinho — o input já tem o valor correto
  _e1RenderCarrinho();
}

function e1RemoverItem(itemId) {
  // Suporta itemId (do estoque) e id direto (item avulso)
  const before = _listaAtual.itens.length;
  _listaAtual.itens = _listaAtual.itens.filter(x => x.itemId !== itemId && x.id !== itemId);
  if (_listaAtual.itens.length === before) return;
  _recalcEstimativa();
  saveListas();
  // Atualiza linha e carrinho
  _e1AtualizarLinha(itemId);
  _e1RenderCarrinho();
}

function e1LimparCarrinho() {
  if (!confirm('Limpar o carrinho?')) return;
  _listaAtual.itens = [];
  _recalcEstimativa();
  saveListas();
  _e1RenderTabela(); // re-render tabela para remover destaques
  _e1RenderCarrinho();
}

// Atualiza visual de uma linha específica sem re-renderizar a tabela inteira
function _e1AtualizarLinha(itemId) {
  const item    = items.find(i => i.id === itemId);
  if (!item) { _e1RenderTabela(); return; } // item manual — re-render completo
  const inCart  = _listaAtual.itens.find(ci => ci.itemId === itemId);
  const row     = document.getElementById(`e1row_${itemId}`);
  if (!row) { _e1RenderTabela(); return; }

  const s    = gst(item);
  const need = gneed(item);
  const rowBg= { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };
  row.style.background = inCart ? 'var(--purple-xlight)' : (rowBg[s]||'var(--surface)');

  // Re-renderiza só a célula da coluna "Adicionar" (última td)
  const lastTd = row.querySelector('td:last-child');
  if (!lastTd) return;

  if (inCart) {
    lastTd.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:4px;background:var(--purple);border-radius:var(--r8);padding:4px 8px">
        <button onclick="e1AjustarQtd(${item.id},-1)"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
        <input type="number" id="e1qty_${item.id}" value="${inCart.qtdSelecionada}" min="0.001" step="0.001"
          style="width:56px;border:none;background:transparent;font-size:.82rem;font-weight:800;text-align:center;color:#fff;font-family:monospace"
          onchange="e1SetQtd(${item.id},this.value)"
          onblur="e1SetQtd(${item.id},this.value)">
        <span style="font-size:.62rem;color:rgba(255,255,255,.8);white-space:nowrap">${item.unit}</span>
        <button onclick="e1AjustarQtd(${item.id},1)"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
        <button onclick="e1RemoverItem(${item.id})"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc('x',10,'#fff')}
        </button>
      </div>`;
  } else {
    lastTd.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:8px">
        ${need > 0 ? `<div style="text-align:right">
          <div style="font-size:.9rem;font-weight:800;color:var(--purple);font-family:monospace">${fmt(need)}</div>
          <div style="font-size:.58rem;color:var(--muted)">${item.unit} sugerido</div>
        </div>` : ''}
        <button onclick="e1AddItem(${item.id})"
          style="width:30px;height:30px;border-radius:50%;border:none;background:var(--purple);
          color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;
          justify-content:center;box-shadow:0 2px 8px rgba(107,33,212,.3);transition:transform .15s"
          onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">+</button>
      </div>`;
  }
}

function e1IrParaCotacao() {
  if (_listaAtual.itens.length === 0) { toast('Carrinho vazio', 'err'); return; }
  // Popula cotações automáticas
  _listaAtual.itens.forEach(i => {
    if (!i.cotacoes) i.cotacoes = [];
    const itemCad = items.find(x => x.id === i.itemId);
    if (itemCad) {
      const supIds = itemCad.supIds?.length ? [...itemCad.supIds] : (itemCad.supId ? [itemCad.supId] : []);
      supIds.forEach(supId => {
        if (supId && !i.cotacoes.some(c => c.supId === supId)) {
          i.cotacoes.push({ supId, precoUnit:null, respondido:false, prazo:'', pagamento:'', emFalta:false });
        }
      });
    }
    if (i.origem === 'manual' && i.localCompra) i.tipoCompra = 'presencial';
  });
  _listaAtual.etapa  = 2;
  _listaAtual.status = 'cotacao';
  saveListas();
  _renderDashCompras();
  _renderEtapa2Cotacao();
  toast('Carrinho confirmado. Agora faça as cotações!');
}

// Item 4 — Imprimir lista do carrinho
function imprimirCarrinho() {
  const l        = _listaAtual;
  const carrinho = l.itens;
  const cfg      = getConfig();
  const u        = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const empresa  = cfg.empresa || 'Vai Ter Pizza!';
  const totalEst = carrinho.reduce((s,ci) => s+ci.qtdSelecionada*(ci.precoUnitEstimado||0),0);

  if (!carrinho.length) { toast('Carrinho vazio', 'err'); return; }

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Lista de Compras ${l.codigo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',Arial,sans-serif;font-size:11px;background:#fff;color:#1a1a2e;padding:24px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #6B21D4;margin-bottom:16px}
    .empresa{font-size:17px;font-weight:800;color:#6B21D4}
    .sub{font-size:10px;color:#888;margin-top:2px}
    .meta{text-align:right;font-size:10px;color:#555;line-height:1.9}
    .meta strong{color:#1a1a2e}
    .kpis{display:flex;gap:10px;margin-bottom:16px}
    .kpi{flex:1;background:#f5f0ff;border:1px solid #d8b4fe;border-radius:6px;padding:8px 12px;text-align:center}
    .kpi-v{font-size:14px;font-weight:800;color:#6B21D4}
    .kpi-l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-top:1px}
    .cat{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6B21D4;background:#f5f0ff;padding:5px 10px;border-radius:4px;margin:14px 0 5px}
    table{width:100%;border-collapse:collapse}
    thead th{background:#6B21D4;color:#fff;padding:6px 9px;font-size:9.5px;font-weight:700;text-transform:uppercase}
    thead th.r{text-align:right} thead th.c{text-align:center}
    td{padding:6px 9px;font-size:10.5px;border-bottom:1px solid #f0f0f0}
    tr:nth-child(even) td{background:#fafafa}
    .nm{font-weight:600} .ct{font-size:9px;color:#bbb}
    .r{text-align:right} .c{text-align:center}
    .chk{width:13px;height:13px;border:1.5px solid #6B21D4;border-radius:3px;display:inline-block}
    .tot td{background:#f5f0ff!important;font-weight:700;color:#6B21D4;border-top:2px solid #6B21D4;padding:7px 9px}
    .footer{margin-top:20px;padding-top:12px;border-top:1px dashed #ccc;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}
    .ass{display:flex;flex-direction:column;align-items:center;gap:3px}
    .ass-linha{border-bottom:1px solid #aaa;width:180px}
    .ass-lbl{font-size:9px;color:#888}
    @media print{body{padding:8px}}
  </style></head><body>`);

  win.document.write(`<div class="hdr">
    <div><div class="empresa">${empresa}</div><div class="sub">Lista de Compras — Carrinho</div></div>
    <div class="meta">
      <div><strong>Lista:</strong> ${l.codigo}</div>
      <div><strong>Data:</strong> ${fmtD(new Date().toISOString())}</div>
      <div><strong>Responsável:</strong> ${u?.name||'___________'}</div>
    </div>
  </div>`);

  win.document.write(`<div class="kpis">
    <div class="kpi"><div class="kpi-v">${carrinho.length}</div><div class="kpi-l">Itens</div></div>
    <div class="kpi"><div class="kpi-v">R$ ${fmt(totalEst)}</div><div class="kpi-l">Estimado</div></div>
  </div>`);

  // Agrupa por categoria
  const porCat = {};
  carrinho.forEach(ci => {
    const cat = ci.categoria || 'Geral';
    if (!porCat[cat]) porCat[cat] = [];
    porCat[cat].push(ci);
  });

  Object.entries(porCat).forEach(([cat, citens]) => {
    const subTot = citens.reduce((s,ci)=>s+ci.qtdSelecionada*(ci.precoUnitEstimado||0),0);
    win.document.write(`<div class="cat">${cat}</div>`);
    win.document.write(`<table><thead><tr>
      <th class="c" style="width:20px"></th>
      <th>Item</th>
      <th class="c" style="width:55px">Qtd</th>
      <th class="c" style="width:32px">Un.</th>
      <th class="r" style="width:80px">Est. unit.</th>
      <th class="r" style="width:80px">Total est.</th>
    </tr></thead><tbody>`);
    citens.forEach(ci => {
      const total = ci.qtdSelecionada*(ci.precoUnitEstimado||0);
      win.document.write(`<tr>
        <td class="c"><span class="chk"></span></td>
        <td><div class="nm">${ci.nome}</div></td>
        <td class="c" style="font-family:monospace;font-weight:600">${fmt(ci.qtdSelecionada)}</td>
        <td class="c" style="color:#aaa">${ci.unidade}</td>
        <td class="r">${ci.precoUnitEstimado>0?'R$ '+fmt(ci.precoUnitEstimado):'—'}</td>
        <td class="r" style="font-weight:600">${total>0?'R$ '+fmt(total):'—'}</td>
      </tr>`);
    });
    win.document.write(`<tr class="tot"><td colspan="4">Subtotal ${cat}</td>
      <td></td><td class="r">R$ ${fmt(subTot)}</td></tr>`);
    win.document.write('</tbody></table>');
  });

  win.document.write(`<div class="footer">
    <div class="ass"><div class="ass-linha"></div><div class="ass-lbl">${u?.name||'Responsável'}</div></div>
    <div style="font-size:10px;color:#999">Total estimado: <strong style="color:#6B21D4">R$ ${fmt(totalEst)}</strong></div>
    <div class="ass"><div class="ass-linha"></div><div class="ass-lbl">Aprovação</div></div>
  </div>`);

  win.document.write('<script>window.onload=()=>window.print();<\/script></body></html>');
  win.document.close();
}



function _rowsItem(i) {
  const cotacoes = i.cotacoes || [];
  const melhor   = _melhorCotacao(cotacoes);

  const mainRow = `<tr id="item1-${i.id}" style="background:var(--surface);border-bottom:${cotacoes.length?'none':'1px solid var(--border)'}">
    <td style="padding:10px 14px">
      <div style="font-size:.83rem;font-weight:700">${i.nome}</div>
      <div style="font-size:.63rem;color:var(--muted);margin-top:2px">
        ${lc(i.origem==='manual'?'edit-2':'package',11,'var(--muted)')} ${i.categoria}${i.origem==='manual'?' · Manual':''}
      </div>
    </td>
    <td class="c">
      <input type="number" value="${i.qtdSelecionada}" min="0.001" step="0.001"
        style="width:74px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;text-align:center;font-family:monospace"
        onchange="setItemQtd1(${i.id},this.value)">
    </td>
    <td class="c" style="font-size:.74rem;color:var(--muted)">${i.unidade}</td>
    <td class="r" style="padding-right:14px">
      <div style="font-size:.74rem;font-family:monospace;font-weight:600">R$ ${fmt(i.qtdSelecionada*(i.precoUnitEstimado||0))}</div>
      <div style="font-size:.6rem;color:var(--muted)">R$${fmt(i.precoUnitEstimado||0)}/${i.unidade}</div>
    </td>
    <td style="padding:8px 12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${cotacoes.length===0?`<span style="font-size:.7rem;color:var(--muted);font-style:italic">Sem fornecedor — compra presencial</span>`:''}
        <button onclick="abrirAddFornecedor(${i.id})"
          style="display:flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;
          border:1.5px dashed var(--purple);background:transparent;color:var(--purple);font-size:.68rem;font-weight:600;cursor:pointer">
          ${lc('plus',12,'var(--purple)')} Fornecedor
        </button>
      </div>
    </td>
    <td class="c">
      <div style="display:flex;gap:2px;align-items:center;justify-content:center">
        ${i.origem==='manual'?`
          <button onclick="abrirEditarItemManual(${i.id})" style="background:none;border:none;color:var(--purple);cursor:pointer;padding:4px" title="Editar item">
            ${lc('edit-2',12,'currentColor')}
          </button>
        `:''}
        <button onclick="removerItem1(${i.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px" title="Remover">
          ${lc('trash-2',13,'currentColor')}
        </button>
      </div>
    </td>
  </tr>`;

  const subRows = cotacoes.map((cot, idx) => {
    const sup    = suppliers.find(s => s.id === cot.supId);
    const isBest = melhor?.supId === cot.supId && !cot.emFalta;
    const total  = cot.precoUnit ? i.qtdSelecionada * cot.precoUnit : null;
    const bgRow  = cot.emFalta ? '#FFF1F1' : isBest&&cot.respondido ? 'var(--green-light)' : 'var(--surface2)';
    return `<tr style="background:${bgRow};border-bottom:1px solid var(--border)">
      <td style="padding:6px 14px 6px 28px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div style="width:6px;height:6px;border-radius:50%;background:${cot.emFalta?'var(--red)':cot.respondido?'var(--green)':'var(--muted)'};flex-shrink:0"></div>
          <span style="font-size:.76rem;font-weight:600;color:${cot.emFalta?'var(--red)':isBest&&cot.respondido?'var(--green)':'var(--text2)'}">${sup?.name||'—'}</span>
          ${cot.emFalta?`<span style="font-size:.58rem;font-weight:700;color:var(--red);background:var(--red-light);padding:1px 6px;border-radius:10px;border:1px solid var(--red)">${lc('alert-circle',9,'currentColor')} Em falta</span>`:''}
          ${isBest&&cot.respondido&&!cot.emFalta?`<span style="font-size:.58rem;font-weight:700;color:var(--green);background:var(--green-light);padding:1px 6px;border-radius:10px;border:1px solid var(--green)">Melhor</span>`:''}
        </div>
        ${sup?.phone?`<div style="font-size:.6rem;color:var(--muted);margin-top:1px;margin-left:12px">${sup.phone}</div>`:''}
      </td>
      <td colspan="2" class="c">
        ${cot.emFalta ? `
          <button onclick="desmarcarEmFalta(${i.id},${idx})"
            style="padding:3px 8px;border-radius:var(--r6);border:1.5px solid var(--red);background:var(--red-light);color:var(--red);font-size:.67rem;font-weight:600;cursor:pointer">
            ${lc('rotate-ccw',10,'currentColor')} Desfazer
          </button>
        ` : `
          <label style="display:flex;align-items:center;gap:5px;justify-content:center;cursor:pointer;font-size:.68rem;white-space:nowrap">
            <input type="checkbox" ${cot.respondido?'checked':''} onchange="marcarRespondido(${i.id},${idx},this.checked)" style="accent-color:var(--green);width:14px;height:14px">
            ${cot.respondido?'Respondeu':'Aguardando'}
          </label>
        `}
      </td>
      <td class="r" style="padding-right:14px">
        ${cot.emFalta ? `
          <div style="font-size:.74rem;color:var(--red);font-style:italic">Produto indisponível</div>
        ` : cot.respondido&&cot.precoUnit ? `
          <div style="font-size:.86rem;font-weight:800;color:${isBest?'var(--green)':'var(--text)'};font-family:monospace">R$ ${fmt(total||0)}</div>
          <div style="font-size:.6rem;color:var(--muted)">R$${fmt(cot.precoUnit)}/${i.unidade}</div>
        ` : `
          <div style="position:relative;display:inline-flex;align-items:center">
            <span style="position:absolute;left:7px;font-size:.65rem;color:var(--muted)">R$</span>
            <input type="number" value="${cot.precoUnit||''}" min="0" step="0.01" placeholder="0,00"
              style="width:96px;padding:4px 6px 4px 24px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.8rem;text-align:right;font-family:monospace"
              onchange="setCotacaoPreco(${i.id},${idx},this.value)">
          </div>
        `}
      </td>
      <td style="padding:6px 8px">
        <div style="display:flex;gap:4px;align-items:center">
          ${!cot.emFalta&&sup?.phone?`
            <a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(_montaMsgCotacaoForn(sup,i))}" target="_blank"
              style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#25D366;color:#fff;text-decoration:none" title="WA">
              ${lc('message-circle',12,'#fff')}
            </a>
          `:''}
          ${!cot.emFalta?`
            <button onclick="marcarEmFalta(${i.id},${idx})" title="Marcar como em falta"
              style="width:24px;height:24px;border-radius:50%;border:1.5px solid var(--red);background:var(--red-light);color:var(--red);cursor:pointer;display:inline-flex;align-items:center;justify-content:center">
              ${lc('alert-circle',11,'currentColor')}
            </button>
          `:''}
        </div>
      </td>
      <td class="c">
        <button onclick="removerCotacao(${i.id},${idx})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px">
          ${lc('x',12,'currentColor')}
        </button>
      </td>
    </tr>`;
  }).join('');

  return mainRow + subRows;
}

function _melhorCotacao(cotacoes) {
  const resp = cotacoes.filter(c => c.respondido && c.precoUnit > 0 && !c.emFalta);
  if (!resp.length) return null;
  return resp.reduce((b,c) => c.precoUnit < b.precoUnit ? c : b);
}

function marcarEmFalta(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].emFalta = true;
  i.cotacoes[idx].respondido = true;
  i.cotacoes[idx].precoUnit = null;
  saveListas(); _renderEtapa1();
  toast('Fornecedor marcado como "em falta"');
}

function desmarcarEmFalta(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].emFalta = false;
  i.cotacoes[idx].respondido = false;
  saveListas(); _renderEtapa1();
}

// Editar item manual — abre popup para alterar fornecedor, preço, nome
function abrirEditarItemManual(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  document.getElementById('popupEditItem')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupEditItem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:.9rem;font-weight:800">${lc('edit-2',15,'var(--purple)')} Editar item</div>
        <button onclick="document.getElementById('popupEditItem').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x',16,'var(--muted)')}</button>
      </div>
      <div class="field"><label>Nome</label>
        <input type="text" id="eiNome" class="inp" value="${i.nome}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field"><label>Quantidade</label>
          <input type="number" id="eiQtd" class="inp" value="${i.qtdSelecionada}" min="0.001" step="0.001">
        </div>
        <div class="field"><label>Unidade</label>
          <select id="eiUnit" class="inp">
            ${['un','kg','g','L','ml','cx','pct','sc'].map(u=>`<option ${i.unidade===u?'selected':''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>Preço estimado (R$)</label>
        <input type="number" id="eiPreco" class="inp" value="${i.precoUnitEstimado||''}" min="0" step="0.01">
      </div>
      <div class="field"><label>Categoria</label>
        <input type="text" id="eiCat" class="inp" value="${i.categoria||''}">
      </div>
      <div class="field"><label>Local de compra (deixe vazio para fornecedor)</label>
        <input type="text" id="eiLocal" class="inp" value="${i.localCompra||''}" placeholder="Ex: Atacadão (compra presencial)">
      </div>
      <div class="field"><label>Observações</label>
        <input type="text" id="eiObs" class="inp" value="${i.observacoes||''}">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupEditItem').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoItem(${itemId})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function salvarEdicaoItem(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const nome  = document.getElementById('eiNome')?.value.trim();
  const qtd   = parseFloat(document.getElementById('eiQtd')?.value);
  if (!nome) { toast('Informe o nome','err'); return; }
  if (isNaN(qtd)||qtd<=0) { toast('Informe a quantidade','err'); return; }
  i.nome     = nome;
  i.qtdSelecionada = qtd;
  i.qtdSugerida    = qtd;
  i.unidade  = document.getElementById('eiUnit')?.value || i.unidade;
  i.precoUnitEstimado = parseFloat(document.getElementById('eiPreco')?.value)||0;
  i.categoria = document.getElementById('eiCat')?.value.trim() || i.categoria;
  const local = document.getElementById('eiLocal')?.value.trim()||'';
  i.localCompra = local;
  i.tipoCompra  = local ? 'presencial' : (i.cotacoes?.length ? 'fornecedor' : i.tipoCompra);
  i.observacoes = document.getElementById('eiObs')?.value.trim()||'';
  _recalcEstimativa();
  saveListas();
  document.getElementById('popupEditItem')?.remove();
  _renderEtapa1();
  toast('Item atualizado!');
}

// Mensagem WA com link de formulário de cotação
function _montaMsgCotacaoForn(sup, item) {
  const l = _listaAtual;
  const itensForn = l.itens.filter(i => (i.cotacoes||[]).some(c => c.supId === sup.id));
  const linhas = itensForn.map(i => `• ${i.nome}: ${fmt(i.qtdSelecionada)} ${i.unidade}`).join('\n');
  const prazo  = l.prazoCotacao ? `\nPrazo: ${fmtDT(l.prazoCotacao)}` : '';
  // Link de formulário de resposta (Google Forms ou página interna futura)
  const formLink = `\n\n[Form] *Preencha sua cotação aqui:*\nhttps://docs.google.com/forms/d/e/FORMULARIO_VTP/viewform?usp=pp_url&entry.codigo=${encodeURIComponent(l.codigo)}&entry.fornecedor=${encodeURIComponent(sup.name)}`;
  return `Olá ${sup.seller||sup.name}!\n\n*Vai Ter Pizza!* solicita cotação (${l.codigo}):\n\n${linhas}${prazo}\n\nPor favor informe:\n• Valor unitário de cada item\n• Prazo de entrega\n• Forma de pagamento\n• Prazo de pagamento${formLink}\n\nObrigado!`;
}

function abrirAddFornecedor(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  if (!i.cotacoes) i.cotacoes = [];
  const jaAdicionados = new Set(i.cotacoes.map(c => c.supId));
  const disponiveis   = suppliers.filter(s => !jaAdicionados.has(s.id));
  if (!disponiveis.length) { toast('Todos os fornecedores já adicionados', 'info'); return; }
  const popup = document.createElement('div');
  popup.id = 'popupForn';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:.9rem;font-weight:800;margin-bottom:14px">${lc('building-2',15,'var(--purple)')} Adicionar fornecedor</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:10px;font-weight:600">${i.nome}</div>
      <select id="selFornPop" class="inp" style="margin-bottom:16px">
        <option value="">Selecionar fornecedor...</option>
        ${disponiveis.map(s=>`<option value="${s.id}">${s.name}${s.phone?'':' ! sem tel'}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupForn').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarAddFornecedor(${itemId})">Adicionar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function confirmarAddFornecedor(itemId) {
  const supId = parseInt(document.getElementById('selFornPop')?.value);
  if (!supId) { toast('Selecione um fornecedor', 'err'); return; }
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  if (!i.cotacoes) i.cotacoes = [];
  i.cotacoes.push({ supId, precoUnit: null, respondido: false, prazo: '', pagamento: '' });
  saveListas();
  document.getElementById('popupForn')?.remove();
  _renderEtapa1();
  toast('Fornecedor adicionado!');
}

function removerCotacao(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i?.cotacoes) { i.cotacoes.splice(idx,1); saveListas(); _renderEtapa1(); }
}

function marcarRespondido(itemId, idx, checked) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].respondido = checked;
  saveListas(); _renderEtapa1();
}

function setCotacaoPreco(itemId, idx, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  const v = parseFloat(val);
  i.cotacoes[idx].precoUnit = !isNaN(v)&&v>0 ? v : null;
  if (i.cotacoes[idx].precoUnit) i.cotacoes[idx].respondido = true;
  saveListas(); _renderEtapa1();
}

function enviarTodasCotacoesWA() {
  if (!_listaAtual) return;
  const l = _listaAtual;
  const bySup = {};
  l.itens.forEach(i => {
    (i.cotacoes||[]).forEach(cot => {
      const sup = suppliers.find(s => s.id === cot.supId);
      if (!sup?.phone) return;
      if (!bySup[cot.supId]) bySup[cot.supId] = { sup };
      bySup[cot.supId].sup = sup;
    });
  });
  const sups = Object.values(bySup);
  if (!sups.length) { toast('Nenhum fornecedor com telefone cadastrado', 'err'); return; }
  sups.forEach(({ sup }) => {
    window.open('https://wa.me/55'+sup.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(_montaMsgCotacaoForn(sup,null)),'_blank');
  });
  l.status = 'cotacao'; saveListas(); _renderDashCompras(); _renderEtapa1();
  toast(`${sups.length} mensagem(ns) enviada(s)!`);
}

function setItemQtd1(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const v = parseFloat(val);
  if (!isNaN(v)&&v>0) i.qtdSelecionada = v;
  _recalcEstimativa(); saveListas();
  const el = document.getElementById('totalEstimado');
  if (el) el.textContent = 'R$ '+fmt(_listaAtual.valorEstimado);
}

function removerItem1(itemId) {
  _listaAtual.itens = _listaAtual.itens.filter(x => x.id !== itemId);
  _recalcEstimativa(); saveListas(); _renderEtapa1();
}

function setObsLista(val) { if (_listaAtual) { _listaAtual.observacoes = val; saveListas(); } }

function setStatusLista(status) {
  if (!_listaAtual) return;
  _listaAtual.status = status; saveListas(); _renderEtapa1(); _renderDashCompras();
}

function _recalcEstimativa() {
  if (!_listaAtual) return;
  _listaAtual.valorEstimado = _listaAtual.itens.reduce((s,i) => s+i.qtdSelecionada*(i.precoUnitEstimado||0), 0);
}

function abrirAddItemManual() {
  document.getElementById('ovAddItem').classList.add('open');
  ['aiNome','aiQtd','aiPreco','aiObs','aiLocal'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const u = document.getElementById('aiUnit'); if (u) u.value='un';
}

function saveItemManual() {
  const nome = document.getElementById('aiNome').value.trim();
  const qtd  = parseFloat(document.getElementById('aiQtd').value);
  if (!nome) { toast('Informe o nome do item','err'); return; }
  if (isNaN(qtd)||qtd<=0) { toast('Informe a quantidade','err'); return; }
  const localEl = document.getElementById('aiLocal');
  const newId = Math.max(0,..._listaAtual.itens.map(x=>x.id))+1;
  _listaAtual.itens.push({
    id:newId, itemId:null, nome,
    categoria: document.getElementById('aiCat')?.value||'Geral',
    unidade:   document.getElementById('aiUnit')?.value||'un',
    qtdSugerida:qtd, qtdSelecionada:qtd,
    qtdAprovada:null, qtdComprada:null, qtdRecebida:null,
    estoqueAtual:0, estoqueMinimo:0, estoqueIdeal:0,
    origem:'manual', tipoCompra: localEl?.value?'presencial':'fornecedor',
    fornecedorId:null, localCompra:localEl?.value||'', diaCompra:'', responsavelCompra:'',
    precoUnitEstimado: parseFloat(document.getElementById('aiPreco')?.value)||0,
    precoUnitFinal:null, valorTotal:0, statusItem:'pendente',
    observacoes: document.getElementById('aiObs')?.value||'',
    cotacoes:[], aprovado:null, comentarioAprovador:'',
    conferido:false, divergencia:false, comentarioConferencia:'',
    conferidoPor:'', dataRecebimento:'', horaRecebimento:'',
  });
  _recalcEstimativa(); saveListas(); closeModal('ovAddItem'); _renderEtapa1();
  toast('Item adicionado!');
}

function abrirPrazoCotacao() {
  document.getElementById('popupPrazo')?.remove();
  const atual  = _listaAtual.prazoCotacao ? new Date(_listaAtual.prazoCotacao) : null;
  const dataVal = atual ? atual.toISOString().slice(0,10) : '';
  const horaVal = atual ? `${String(atual.getHours()).padStart(2,'0')}:00` : '18:00';
  const horas   = Array.from({length:18},(_,i)=>`${String(i+6).padStart(2,'0')}:00`);
  const popup = document.createElement('div');
  popup.id = 'popupPrazo';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:.9rem;font-weight:800;margin-bottom:16px">${lc('clock',15,'var(--purple)')} Prazo de cotação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div class="field" style="margin:0"><label>Data</label><input type="date" id="prazoData" class="inp" value="${dataVal}"></div>
        <div class="field" style="margin:0"><label>Horário</label>
          <select id="prazoHora" class="inp">
            ${horas.map(h=>`<option value="${h}" ${h===horaVal?'selected':''}>${h}</option>`).join('')}
          </select>
        </div>
      </div>
      ${atual?`<button onclick="limparPrazo()" style="width:100%;padding:6px;border:1.5px solid var(--red);border-radius:var(--r6);background:var(--red-light);color:var(--red);font-size:.74rem;font-weight:600;cursor:pointer;margin-bottom:10px">${lc('x',12,'currentColor')} Remover prazo</button>`:''}
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupPrazo').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPrazo()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function salvarPrazo() {
  const data = document.getElementById('prazoData')?.value;
  const hora = document.getElementById('prazoHora')?.value;
  if (!data) { toast('Selecione a data','err'); return; }
  _listaAtual.prazoCotacao = new Date(`${data}T${hora}:00`).toISOString();
  saveListas(); document.getElementById('popupPrazo')?.remove(); _renderEtapa1(); toast('Prazo definido!');
}

function limparPrazo() {
  _listaAtual.prazoCotacao = null; saveListas();
  document.getElementById('popupPrazo')?.remove(); _renderEtapa1(); toast('Prazo removido.');
}

function avancarParaAprovacao() {
  if (!_listaAtual) return;

  // Item 2: validar cotações obrigatórias para itens com fornecedor
  const pendentesCotacao = _listaAtual.itens.filter(i => {
    if (!i.cotacoes?.length) return false; // sem fornecedor → presencial, OK
    const todasEmFalta = i.cotacoes.every(c => c.emFalta);
    if (todasEmFalta) return false; // todos em falta → vai para presencial
    // Tem fornecedor mas nenhuma cotação com preço preenchido
    const temPreco = i.cotacoes.some(c => !c.emFalta && c.precoUnit > 0);
    return !temPreco;
  });

  if (pendentesCotacao.length > 0) {
    const nomes = pendentesCotacao.map(i => `• ${i.nome}`).join('\n');
    // Banner de aviso visível na tela
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:600;background:var(--red);color:#fff;padding:12px 20px;border-radius:var(--r10);box-shadow:0 4px 20px rgba(0,0,0,.25);font-size:.82rem;font-weight:600;max-width:380px;text-align:center;line-height:1.5';
    banner.innerHTML = `${lc('alert-circle',16,'#fff')} ${pendentesCotacao.length} item(s) sem cotação preenchida:<br><span style="font-weight:400;font-size:.74rem">${pendentesCotacao.map(i=>i.nome).join(', ')}</span>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
    return;
  }

  // Define tipo de compra por item
  _listaAtual.itens.forEach(i => {
    if (!i.cotacoes?.length || i.cotacoes.every(c => c.emFalta)) {
      i.tipoCompra = 'presencial';
    }
  });
  _listaAtual.itens.forEach(i => {
    if (i.tipoCompra !== 'presencial' && i.cotacoes?.length) {
      const melhor = _melhorCotacao(i.cotacoes);
      if (melhor) { i.precoUnitFinal = melhor.precoUnit; i.fornecedorId = melhor.supId; i.tipoCompra = 'fornecedor'; }
    }
  });
  _listaAtual.etapa = 3; _listaAtual.status = 'aguard_aprovacao'; saveListas();
  _renderDashCompras(); _renderEtapa3Aprovacao(); toast('Lista enviada para aprovação!');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 2 — APROVAÇÃO
// ══════════════════════════════════════════════════════════════
function _renderEtapa2Cotacao() {
  const l = _listaAtual;
  const itensForn       = l.itens.filter(i => i.tipoCompra!=='presencial');
  const itensPresencial = l.itens.filter(i => i.tipoCompra==='presencial');
  const totalGeral      = l.itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  const pendentes       = l.itens.filter(i=>i.aprovado===null).length;
  const aprovados       = l.itens.filter(i=>i.aprovado===true).length;
  const reprovados      = l.itens.filter(i=>i.aprovado===false).length;
  const todoRespondido  = pendentes===0;
  const apWa = l.aprovadorWa ? `https://wa.me/55${l.aprovadorWa.replace(/\D/g,'')}?text=${encodeURIComponent(`Lista ${l.codigo} aguardando sua aprovação no sistema Vai Ter Pizza!`)}` : null;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:.96rem;font-weight:800;margin-bottom:3px">${lc('check-circle',14,'var(--green)')} Aprovação · ${l.codigo}</h3>
        <div style="font-size:.71rem;color:var(--muted)">${l.aprovadorNome?`Aprovador: <strong>${l.aprovadorNome}</strong>`:'Revise e aprove cada item'}</div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa1()">${lc('arrow-left',13)} Voltar</button>
        <button class="btn btn-outline btn-sm" onclick="abrirConfigAprovador()">${lc('user',13)} Aprovador</button>
        ${apWa?`<a href="${apWa}" target="_blank" class="btn btn-wa btn-sm">${lc('message-circle',13,'#fff')} Notificar</a>`:''}
        <button class="btn btn-red btn-sm" onclick="reprovarLista()">${lc('x',12)} Reprovar tudo</button>
        <button class="btn btn-primary btn-sm" onclick="aprovarLista()" ${!todoRespondido?'disabled style="opacity:.5;cursor:not-allowed"':''}>
          ${lc('check-circle',13,'#fff')} Aprovar lista
        </button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:10px 14px;text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--purple)">R$${fmt(totalGeral)}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Total</div>
      </div>
      <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:10px 14px;text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--green)">${aprovados}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Aprovados</div>
      </div>
      <div style="background:var(--red-light);border:1.5px solid var(--red);border-radius:var(--r10);padding:10px 14px;text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--red)">${reprovados}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Reprovados</div>
      </div>
      <div style="background:var(--surface2);border:1.5px solid ${pendentes>0?'var(--yellow)':'var(--border)'};border-radius:var(--r10);padding:10px 14px;text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:${pendentes>0?'var(--orange-dark)':'var(--green)'}">${pendentes}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Pendentes</div>
      </div>
    </div>
    ${!todoRespondido?`<div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);margin-bottom:14px;font-size:.74rem;color:var(--orange-dark);font-weight:600">${lc('alert-triangle',14,'var(--yellow)')} Responda todos os itens para habilitar a aprovação</div>`:''}
    ${itensForn.length?`<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">${lc('building-2',12,'var(--muted)')} Compras via Fornecedor</div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">${itensForn.map(i=>_cardAprovacaoItem(i,false)).join('')}</div>`:''}
    ${itensPresencial.length?`<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">${lc('shopping-cart',12,'var(--muted)')} Compra Presencial</div><div style="background:var(--orange-light);border:1.5px solid var(--border);border-radius:var(--r8);padding:9px 12px;margin-bottom:8px;font-size:.72rem;color:var(--orange-dark)">${lc('info',12,'var(--orange-dark)')} Itens sem fornecedor — aprovação por orçamento máximo.</div><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">${itensPresencial.map(i=>_cardAprovacaoItem(i,true)).join('')}</div>`:''}`;
}

function _cardAprovacaoItem(i, isPresencial) {
  const sup=suppliers.find(s=>s.id===i.fornecedorId);
  const qtd=i.qtdAprovada??i.qtdSelecionada;
  // Item 3: para fornecedor só aceita preço real da cotação; presencial pode usar estimado
  const preco = isPresencial
    ? (i.precoUnitFinal||i.precoUnitEstimado||0)
    : (i.precoUnitFinal||0);
  const semPreco = !isPresencial && !i.precoUnitFinal;
  const total=qtd*preco;
  const isAprov=i.aprovado===true, isReprov=i.aprovado===false;
  return `<div style="border:1.5px solid ${isAprov?'var(--green)':isReprov?'var(--red)':'var(--border)'};border-radius:var(--r10);background:${isAprov?'var(--green-light)':isReprov?'var(--red-light)':'var(--surface)'};overflow:hidden;transition:all .2s">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap">
      <div style="width:4px;align-self:stretch;background:${isAprov?'var(--green)':isReprov?'var(--red)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:140px">
        <div style="font-size:.84rem;font-weight:700">${i.nome}</div>
        <div style="font-size:.66rem;color:var(--muted);margin-top:2px">${isPresencial?`${lc('shopping-cart',11,'var(--muted)')} Compra presencial`:`${lc('building-2',11,'var(--muted)')} ${sup?.name||'Fornecedor'}`}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">Qtd</div><div style="font-size:.82rem;font-weight:700;font-family:monospace">${fmt(qtd)} ${i.unidade}</div></div>
        <div style="text-align:center"><div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">${isPresencial?'Orç. máx.':'Preço unit.'}</div><div style="font-size:.82rem;font-weight:700;font-family:monospace;color:${isPresencial?'var(--orange-dark)':'var(--text)'}">R$ ${fmt(preco)}</div></div>
        <div style="text-align:center"><div style="font-size:.58rem;color:var(--muted);text-transform:uppercase">Total</div><div style="font-size:.88rem;font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(total)}</div></div>
        ${semPreco?`<div style="display:flex;align-items:center;gap:5px;padding:4px 8px;background:var(--red-light);border:1px solid var(--red);border-radius:var(--r6);font-size:.68rem;color:var(--red);font-weight:600">${lc('alert-circle',11,'currentColor')} Sem preço</div>`:''}
        <div style="display:flex;gap:5px">
          <button onclick="aprovarItem2(${i.id})" ${semPreco?'disabled title="Preencha o preço na cotação antes de aprovar" style="opacity:.4;cursor:not-allowed;padding:6px 13px;border-radius:var(--r8);border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:.72rem;font-weight:600;display:flex;align-items:center;gap:4px"':`style="padding:6px 13px;border-radius:var(--r8);border:1.5px solid ${isAprov?'var(--green)':'var(--border)'};background:${isAprov?'var(--green)':'var(--surface)'};color:${isAprov?'#fff':'var(--text2)'};font-size:.72rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px"`}>${lc('check',12,'currentColor')} Aprovar</button>
          <button onclick="reprovarItem2(${i.id})" style="padding:6px 13px;border-radius:var(--r8);border:1.5px solid ${isReprov?'var(--red)':'var(--border)'};background:${isReprov?'var(--red)':'var(--surface)'};color:${isReprov?'#fff':'var(--text2)'};font-size:.72rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px">${lc('x',12,'currentColor')} Reprovar</button>
        </div>
      </div>
    </div>
    <div style="padding:0 14px 10px 20px">
      ${isReprov&&i.acaoReprovacao?`
        <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--red-light);border:1px solid var(--red);border-radius:var(--r6);margin-bottom:6px;font-size:.72rem;color:var(--red);font-weight:600">
          ${lc('arrow-right',11,'currentColor')} Ação: ${_labelAcao[i.acaoReprovacao]||i.acaoReprovacao}
        </div>
      `:''}
      <input type="text" placeholder="Comentário do aprovador..." value="${i.comentarioAprovador||''}"
        style="width:100%;padding:5px 9px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem;background:var(--surface)"
        onchange="setComentarioAprovador(${i.id},this.value)">
    </div>
  </div>`;
}

function abrirConfigAprovador() {
  document.getElementById('popupAprovador')?.remove();
  const l=_listaAtual;
  const popup=document.createElement('div');
  popup.id='popupAprovador';
  popup.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML=`<div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
    <div style="font-size:.9rem;font-weight:800;margin-bottom:14px">${lc('user',15,'var(--purple)')} Configurar aprovador</div>
    <div class="field"><label>Nome do aprovador</label><input type="text" id="apNome" class="inp" placeholder="Ex: João (Gerente)" value="${l.aprovadorNome||''}"></div>
    <div class="field"><label>WhatsApp do aprovador</label><input type="tel" id="apWa" class="inp" placeholder="Ex: 11999990000" value="${l.aprovadorWa||''}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
      <button class="btn btn-outline" onclick="document.getElementById('popupAprovador').remove()">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarAprovador()">Salvar</button>
    </div>
  </div>`;
  document.body.appendChild(popup);
}

function salvarAprovador() {
  _listaAtual.aprovadorNome=document.getElementById('apNome')?.value.trim()||'';
  _listaAtual.aprovadorWa=document.getElementById('apWa')?.value.replace(/\D/g,'')||'';
  saveListas(); document.getElementById('popupAprovador')?.remove(); _renderEtapa2(); toast('Aprovador configurado!');
}

function aprovarItem2(itemId) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.aprovado=true;i.acaoReprovacao='';saveListas();_renderEtapa2();} }

function reprovarItem2(itemId) {
  // Mostra popup de ação antes de reprovar
  document.getElementById('popupReprovacao')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupReprovacao';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  const acoes = [
    { id:'orcar_outro',    label:'Orçar com outro fornecedor', icon:'building-2'    },
    { id:'pedir_prazo',    label:'Solicitar prazo de entrega', icon:'clock'         },
    { id:'negociar',       label:'Negociar preço/condição',    icon:'trending-down' },
    { id:'remover',        label:'Remover da lista',           icon:'trash-2'       },
    { id:'compra_pres',    label:'Comprar presencialmente',    icon:'shopping-cart' },
    { id:'aguardar',       label:'Aguardar próxima compra',    icon:'pause-circle'  },
  ];
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:380px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:.9rem;font-weight:800;margin-bottom:6px">${lc('alert-triangle',15,'var(--red)')} Reprovar item</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:14px">Qual ação o comprador deve tomar?</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
        ${acoes.map(a=>`
          <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;transition:all .15s"
            onmouseover="this.style.borderColor='var(--red)';this.style.background='var(--red-light)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
            <input type="radio" name="acaoRep" value="${a.id}" style="accent-color:var(--red);width:15px;height:15px">
            ${lc(a.icon,13,'var(--muted)')}
            <span style="font-size:.78rem;font-weight:600">${a.label}</span>
          </label>
        `).join('')}
      </div>
      <div class="field" style="margin-bottom:14px"><label>Observação adicional (opcional)</label>
        <input type="text" id="obsReprovacao" class="inp" placeholder="Ex: preço muito acima do mercado...">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupReprovacao').remove()">Cancelar</button>
        <button class="btn btn-red" onclick="confirmarReprovacao(${itemId})">Reprovar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function confirmarReprovacao(itemId) {
  const acao = document.querySelector('input[name="acaoRep"]:checked')?.value;
  if (!acao) { toast('Selecione uma ação para o comprador','err'); return; }
  const obs = document.getElementById('obsReprovacao')?.value.trim()||'';
  const i = _listaAtual.itens.find(x=>x.id===itemId);
  if (i) {
    i.aprovado = false;
    i.acaoReprovacao = acao;
    i.comentarioAprovador = obs || i.comentarioAprovador;
    saveListas();
  }
  document.getElementById('popupReprovacao')?.remove();
  _renderEtapa2();
}

const _labelAcao = {
  orcar_outro:'Orçar com outro fornecedor', pedir_prazo:'Solicitar prazo',
  negociar:'Negociar preço', remover:'Remover da lista',
  compra_pres:'Comprar presencialmente', aguardar:'Aguardar próxima compra',
};
function setComentarioAprovador(itemId,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.comentarioAprovador=val;saveListas();} }
function setQtdAprovada(itemId,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(!i)return; const v=parseFloat(val); i.qtdAprovada=!isNaN(v)&&v>=0?v:i.qtdSelecionada; saveListas(); }

function aprovarLista() {
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  _listaAtual.itens.forEach(i=>{if(i.aprovado===null)i.aprovado=true;});
  _listaAtual.itens=_listaAtual.itens.filter(i=>i.aprovado!==false);
  _listaAtual.status='aprovada'; _listaAtual.etapa=4;
  _listaAtual.dataAprovacao=new Date().toISOString();
  // Salva quem aprovou: aprovador configurado manualmente ou usuário logado
  _listaAtual.aprovadoPor = _listaAtual.aprovadorNome || u?.name || '';
  _listaAtual.valorAprovado=_listaAtual.itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  saveListas(); _renderDashCompras(); _renderEtapa4OC(); toast('Lista aprovada!');
}

function reprovarLista() {
  if(!confirm('Reprovar toda a lista? Ela voltará para montagem.')) return;
  _listaAtual.status='reprovada'; _listaAtual.etapa=2; saveListas();
  _renderDashCompras(); _renderEtapa2Cotacao(); toast('Lista reprovada. Revise e reenvie.');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 3 — ORDEM DE COMPRA
// ══════════════════════════════════════════════════════════════
function _renderEtapa3() {
  const l = _listaAtual;
  const itensPresencial = l.itens.filter(i => i.tipoCompra === 'presencial');
  const itensForn       = l.itens.filter(i => i.tipoCompra !== 'presencial');
  const bySup = {};
  itensForn.forEach(i => { const k = i.fornecedorId||0; if(!bySup[k]) bySup[k]=[]; bySup[k].push(i); });

  // Progresso: OCs enviadas + presenciais compradas
  const totalOCs     = Object.keys(bySup).length;
  const enviadas     = Object.values(bySup).filter(itens => itens[0]?.statusOC === 'confirmada' || itens[0]?.statusOC === 'enviada').length;
  const presCompradas= itensPresencial.filter(i => i.compraPresRealizada).length;
  const totalPresencial = itensPresencial.length ? 1 : 0; // 1 grupo presencial
  const totalGrupos  = totalOCs + totalPresencial;
  const concluidos   = enviadas + (itensPresencial.length > 0 && itensPresencial.every(i => i.compraPresRealizada) ? 1 : 0);
  const tudoPronto   = totalGrupos > 0 && concluidos >= totalGrupos;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:.96rem;font-weight:800;margin-bottom:3px">${lc('shopping-bag',14,'var(--purple)')} Ordem de Compra · ${l.codigo}</h3>
        <div style="font-size:.71rem;color:var(--muted)">Total aprovado: <strong style="color:var(--purple)">R$ ${fmt(l.valorAprovado)}</strong></div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa3Aprovacao()">${lc('arrow-left',13)} Aprovação</button>
        <button class="btn btn-sm" onclick="avancarParaRecebimento()"
          style="${tudoPronto
            ? 'background:var(--purple);color:#fff;border:none;'
            : 'background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);'
          }display:flex;align-items:center;gap:6px;padding:7px 16px;border-radius:var(--r8);font-size:.82rem;font-weight:700">
          ${lc('arrow-right',13,'currentColor')} Ir para Recebimento
        </button>
      </div>
    </div>

    <!-- OCs por fornecedor -->
    ${Object.entries(bySup).map(([supId,itens],idx) => {
      const sup    = parseInt(supId) ? suppliers.find(s => s.id === parseInt(supId)) : null;
      const total  = itens.reduce((s,i) => s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||0), 0);
      const ocText = _montaOCText(sup, itens, l);
      const stOC   = itens[0]?.statusOC || 'pendente';
      const stColors = { pendente:'var(--muted)', enviada:'var(--yellow)', confirmada:'var(--green)' };
      const stLabels = { pendente:'Não enviada', enviada:'Enviada', confirmada:'Confirmada' };
      const isConfirmada = stOC === 'confirmada';
      const isEnviada    = stOC === 'enviada' || isConfirmada;

      return `<div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${isConfirmada?'var(--green)':isEnviada?'var(--yellow)':'var(--border)'}">
        <!-- Cabeçalho OC -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
          background:${isConfirmada?'var(--green-light)':isEnviada?'var(--yellow-light)':'var(--purple-xlight)'};
          border-bottom:1.5px solid ${isConfirmada?'var(--green)':isEnviada?'var(--yellow)':'var(--purple-light)'};flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:.88rem;font-weight:800;color:${isConfirmada?'var(--green)':'var(--purple)'}">
              ${sup?.name || '⚠️ Fornecedor'}
            </div>
            ${sup?.seller?`<div style="font-size:.67rem;color:var(--muted)">${lc('user',11,'var(--muted)')} ${sup.seller}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="font-size:.9rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
            <button class="btn btn-outline btn-xs" onclick="copiarOC3(${idx})">${lc('copy',12)} Copiar</button>
            ${sup?.phone ? `
              <a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(ocText)}"
                target="_blank" onclick="marcarOCEnviada(${idx})" class="btn btn-wa btn-xs">
                ${lc('send',12,'#fff')} Enviar OC
              </a>` : ''}
          </div>
        </div>

        <!-- Itens da OC -->
        ${itens.map((i,iIdx) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);
            background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
            <div style="flex:1">
              <div style="font-size:.8rem;font-weight:600">${i.nome}</div>
              <div style="font-size:.62rem;color:var(--muted)">${i.categoria}</div>
            </div>
            <div style="font-size:.76rem;font-family:monospace;color:var(--muted)">${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade}</div>
            <div style="font-size:.8rem;font-weight:700;font-family:monospace;color:var(--purple)">
              R$ ${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||0))}
            </div>
          </div>`).join('')}

        <!-- Checklist de status da OC -->
        <div style="padding:12px 16px;background:var(--surface2);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:.72rem;color:var(--muted);font-weight:600">Status da OC:</div>
          <div style="display:flex;gap:8px">
            ${['pendente','enviada','confirmada'].map(s => {
              const labels = {pendente:'Não enviada', enviada:'OC Enviada', confirmada:'Confirmada'};
              const isActive = stOC === s;
              const colors   = {pendente:'var(--muted)', enviada:'var(--yellow)', confirmada:'var(--green)'};
              return `<button onclick="setStatusOC(${idx},'${s}')"
                style="padding:5px 11px;border-radius:20px;font-size:.7rem;font-weight:600;cursor:pointer;
                border:1.5px solid ${isActive?colors[s]:'var(--border)'};
                background:${isActive?colors[s]+'22':'var(--surface)'};color:${isActive?colors[s]:'var(--muted)'};transition:all .15s">
                ${lc(s==='confirmada'?'check-circle':s==='enviada'?'send':'clock',11,'currentColor')} ${labels[s]}
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    }).join('')}

    <!-- Compra Presencial com valor real e checklist -->
    ${itensPresencial.length ? `
    <div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--border)'}">
      <div style="padding:12px 16px;background:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green-light)':'var(--orange-light)'};
        border-bottom:1.5px solid ${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--border)'};
        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:.88rem;font-weight:800;color:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--orange-dark)'}">
            ${lc('shopping-cart',14,'currentColor')} Compra Presencial
          </div>
          <div style="font-size:.68rem;color:var(--muted)">Preencha o valor real e marque como comprado</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:.72rem;font-weight:700;color:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--orange-dark)'}">
            ${itensPresencial.filter(i=>i.compraPresRealizada).length}/${itensPresencial.length} comprados
          </span>
          <button class="btn btn-outline btn-xs" onclick="imprimirListaPresencial()">${lc('printer',12)} Imprimir</button>
        </div>
      </div>

      ${[...itensPresencial].sort((a,b)=>a.categoria.localeCompare(b.categoria)||a.nome.localeCompare(b.nome)).map((i,idx) => {
        const u = typeof getCurrentUser==='function'?getCurrentUser():null;
        const qtd = i.qtdAprovada ?? i.qtdSelecionada;
        const teto = qtd * (i.precoUnitEstimado||0);
        const realTotal = i.qtdComprada && i.precoRealUnit ? i.qtdComprada * i.precoRealUnit : null;
        const comprado = !!i.compraPresRealizada;

        return `<div style="padding:12px 16px;border-bottom:1px solid var(--border);
          background:${comprado?'var(--green-light)':'var(--surface)'}">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <div style="width:4px;align-self:stretch;min-height:40px;background:${comprado?'var(--green)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:.84rem;font-weight:700">${i.nome}</div>
              <div style="font-size:.62rem;color:var(--muted)">${i.categoria}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:.68rem;color:var(--muted)">Teto: <span style="font-weight:600;color:var(--orange-dark)">R$${fmt(teto)}</span></div>
              ${realTotal!==null?`<div style="font-size:.76rem;font-weight:700;color:${realTotal>teto?'var(--red)':'var(--green)'}">Real: R$${fmt(realTotal)}</div>`:''}
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.76rem;font-weight:600;
              padding:6px 12px;border-radius:var(--r8);border:1.5px solid ${comprado?'var(--green)':'var(--border)'};
              background:${comprado?'var(--green)':'var(--surface)'};color:${comprado?'#fff':'var(--text2)'}">
              <input type="checkbox" ${comprado?'checked':''} style="accent-color:var(--green);width:15px;height:15px"
                onchange="marcarCompraPresRealizada(${i.id},this.checked)">
              ${comprado?'Comprado':'Marcar comprado'}
            </label>
          </div>

          <!-- Campos de valor real e local -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding-left:10px">
            <div class="field" style="margin:0">
              <label style="font-size:.64rem">Qtd real comprada</label>
              <input type="number" value="${i.qtdComprada||qtd}" min="0" step="0.001"
                style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.74rem;width:100%"
                onchange="setSuperCampo(${i.id},'qtdComprada',parseFloat(this.value)||0)">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:.64rem">Preço unit. real (R$)</label>
              <input type="number" value="${i.precoRealUnit||''}" min="0" step="0.01" placeholder="0,00"
                style="padding:5px 8px;border:1.5px solid ${realTotal!==null&&realTotal>teto?'var(--red)':'var(--border)'};border-radius:var(--r6);font-size:.74rem;width:100%"
                onchange="setPrecoRealPres(${i.id},this.value)">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:.64rem">Local da compra</label>
              <input type="text" value="${i.localCompra||''}" placeholder="Ex: Atacadão"
                style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.74rem;width:100%"
                onchange="setSuperCampo(${i.id},'localCompra',this.value)">
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}`;

  window._ocBySup = Object.entries(bySup).map(([supId,itens]) => ({
    sup: parseInt(supId) ? suppliers.find(s => s.id === parseInt(supId)) : null, itens
  }));
}


function marcarOCEnviada(idx) {
  const e = window._ocBySup?.[idx];
  if (e) { e.itens.forEach(i => { i.statusOC = 'enviada'; }); saveListas(); }
}

function setStatusOC(idx, status) {
  const e = window._ocBySup?.[idx];
  if (e) {
    e.itens.forEach(i => { i.statusOC = status; });
    saveListas();
    _renderEtapa3();
  }
}

function marcarCompraPresRealizada(itemId, checked) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.compraPresRealizada = checked;
  if (checked && !i.qtdComprada) i.qtdComprada = i.qtdAprovada ?? i.qtdSelecionada;
  saveListas();
  _renderEtapa3();
}

function setPrecoRealPres(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.precoRealUnit = parseFloat(val) || 0;
  // Atualiza precoUnitFinal com valor real da compra presencial
  if (i.precoRealUnit > 0) i.precoUnitFinal = i.precoRealUnit;
  saveListas();
}
function _montaOCText(sup,itens,l) {
  const linhas=itens.map(i=>`• ${i.nome}: ${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade} × R$${fmt(i.precoUnitFinal||i.precoUnitEstimado||0)} = R$${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}`).join('\n');
  const total=itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  return `Olá ${sup?.seller||sup?.name||''}!\n\nSegue Ordem de Compra ${l.codigo}:\n\n${linhas}\n\nTotal: R$${fmt(total)}\n\nObrigado!`;
}
function copiarOC3(idx) { const e=window._ocBySup?.[idx]; if(!e)return; navigator.clipboard.writeText(_montaOCText(e.sup,e.itens,_listaAtual)).then(()=>toast('OC copiada!','info')); }
function setSuperCampo(itemId,campo,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i[campo]=val;saveListas();} }

function imprimirListaPresencial() {
  const l   = _listaAtual;
  const u   = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const cfg = getConfig();
  const empresa = cfg.empresa || 'Vai Ter Pizza!';
  const resp = l.itens.find(i=>i.responsavelCompra)?.responsavelCompra || u?.name || '___________________';

  // Ordena por categoria > nome; agrupa por categoria
  const itens = [...l.itens.filter(i=>i.tipoCompra==='presencial')]
    .sort((a,b)=>a.categoria.localeCompare(b.categoria)||a.nome.localeCompare(b.nome));
  const porCat = {};
  itens.forEach(i=>{ if(!porCat[i.categoria]) porCat[i.categoria]=[]; porCat[i.categoria].push(i); });
  const totalEst = itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0),0);

  const win = window.open('','_blank');
  win.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Lista Presencial '+l.codigo+'</title>'
  +'<style>'
  +'@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap\');'
  +'*{margin:0;padding:0;box-sizing:border-box}'
  +'body{font-family:\'Inter\',Arial,sans-serif;font-size:11px;background:#fff;color:#1a1a2e;padding:24px}'
  +'.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #6B21D4;margin-bottom:16px}'
  +'.empresa{font-size:17px;font-weight:800;color:#6B21D4}'
  +'.sub{font-size:10px;color:#888;margin-top:2px}'
  +'.meta{text-align:right;font-size:10px;color:#555;line-height:1.9}'
  +'.meta strong{color:#1a1a2e}'
  +'.kpis{display:flex;gap:10px;margin-bottom:16px}'
  +'.kpi{flex:1;background:#f5f0ff;border:1px solid #d8b4fe;border-radius:6px;padding:7px 10px;text-align:center}'
  +'.kpi-v{font-size:14px;font-weight:800;color:#6B21D4}'
  +'.kpi-l{font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:1px}'
  +'.cat{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6B21D4;background:#f5f0ff;padding:5px 10px;border-radius:4px;margin:14px 0 5px}'
  +'table{width:100%;border-collapse:collapse}'
  +'thead th{background:#6B21D4;color:#fff;padding:6px 9px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}'
  +'thead th.r{text-align:right} thead th.c{text-align:center}'
  +'td{padding:6px 9px;font-size:10.5px;border-bottom:1px solid #f0f0f0;vertical-align:middle}'
  +'tr:nth-child(even) td{background:#fafafa}'
  +'.nm{font-weight:600} .ct{font-size:9px;color:#bbb}'
  +'.r{text-align:right} .c{text-align:center}'
  +'.chk{width:13px;height:13px;border:1.5px solid #6B21D4;border-radius:3px;display:inline-block;vertical-align:middle}'
  +'.sub-tot td{background:#f5f0ff!important;font-weight:700;color:#6B21D4;border-top:1.5px solid #6B21D4;padding:6px 9px}'
  +'.footer{margin-top:20px;padding-top:12px;border-top:1px dashed #ccc;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px}'
  +'.ass{display:flex;flex-direction:column;align-items:center;gap:3px}'
  +'.ass-linha{border-bottom:1px solid #aaa;width:180px}'
  +'.ass-lbl{font-size:9px;color:#888}'
  +'@media print{body{padding:8px}}'
  +'</style></head><body>');
  win.document.write('<div class="hdr"><div><div class="empresa">'+empresa+'</div><div class="sub">Lista de Compra Presencial</div></div>'
  +'<div class="meta"><div><strong>Lista:</strong> '+l.codigo+'</div><div><strong>Data:</strong> '+fmtD(new Date().toISOString())+'</div>'
  +'<div><strong>Responsável:</strong> '+resp+'</div></div></div>');
  win.document.write('<div class="kpis">'
  +'<div class="kpi"><div class="kpi-v">'+itens.length+'</div><div class="kpi-l">Itens</div></div>'
  +'<div class="kpi"><div class="kpi-v">'+Object.keys(porCat).length+'</div><div class="kpi-l">Categorias</div></div>'
  +'<div class="kpi"><div class="kpi-v">R$ '+fmt(totalEst)+'</div><div class="kpi-l">Teto máximo</div></div>'
  +'</div>');

  Object.entries(porCat).forEach(([cat,citens])=>{
    const subTot = citens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0),0);
    win.document.write('<div class="cat">'+cat+'</div>');
    win.document.write('<table><thead><tr>'
    +'<th class="c" style="width:20px"></th><th>Item</th>'
    +'<th class="c" style="width:55px">Qtd</th><th class="c" style="width:32px">Un.</th>'
    +'<th style="width:110px">Local</th><th class="r" style="width:75px">Teto</th>'
    +'<th style="width:90px">Obs.</th></tr></thead><tbody>');
    citens.forEach(i=>{
      win.document.write('<tr>'
      +'<td class="c"><span class="chk"></span></td>'
      +'<td><div class="nm">'+i.nome+'</div></td>'
      +'<td class="c" style="font-family:monospace;font-weight:600">'+fmt(i.qtdAprovada??i.qtdSelecionada)+'</td>'
      +'<td class="c" style="color:#aaa">'+i.unidade+'</td>'
      +'<td style="color:#555">'+( i.localCompra||'—' )+'</td>'
      +'<td class="r" style="font-weight:600">R$ '+fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0))+'</td>'
      +'<td style="color:#aaa;font-size:9.5px">'+( i.observacoes||'' )+'</td></tr>');
    });
    win.document.write('<tr class="sub-tot"><td colspan="5">Subtotal '+cat+'</td>'
    +'<td class="r">R$ '+fmt(subTot)+'</td><td></td></tr>');
    win.document.write('</tbody></table>');
  });

  win.document.write('<div class="footer">'
  +'<div class="ass"><div class="ass-linha"></div><div class="ass-lbl">'+resp+' — Responsável</div></div>'
  +(l.observacoes?'<div style="flex:1;min-width:160px;background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:7px 10px;font-size:10px"><strong>Obs.:</strong> '+l.observacoes+'</div>':'')
  +'<div class="ass"><div class="ass-linha"></div><div class="ass-lbl">Conferência / Gerência</div></div>'
  +'</div>');
  win.document.write('<script>window.onload=()=>window.print();<\/script></body></html>');
  win.document.close();
}

function avancarParaRecebimento() {
  _listaAtual.etapa=5; _listaAtual.status='recebimento';
  if (!_listaAtual.dataRecebimento) _listaAtual.dataRecebimento=new Date().toISOString().slice(0,10);
  // Pré-preenche conferente com nome do usuário logado
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const nomeConferente = u?.name || '';
  if (!_listaAtual.conferidoPor) _listaAtual.conferidoPor = nomeConferente;
  // Pré-preenche cada item
  const horaAtual = `${String(new Date().getHours()).padStart(2,'0')}:00`;
  _listaAtual.itens.forEach(i=>{
    if (!i.conferidoPorItem)       i.conferidoPorItem = nomeConferente;
    if (!i.dataRecebimentoItem)    i.dataRecebimentoItem = _listaAtual.dataRecebimento;
    if (!i.horaRecebimentoItem)    i.horaRecebimentoItem = horaAtual;
  });
  // Pré-preenche responsavelCompra nos itens presenciais
  _listaAtual.itens.filter(i=>i.tipoCompra==='presencial').forEach(i=>{
    if (!i.responsavelCompra) i.responsavelCompra = nomeConferente;
  });
  saveListas(); _renderDashCompras(); _renderEtapa4(); toast('Avançado para recebimento!');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 4 — RECEBIMENTO AGRUPADO POR FORNECEDOR
// ══════════════════════════════════════════════════════════════
function _renderEtapa4OC() {
  const l          = _listaAtual;
  const total      = l.itens.length;
  const conferidos = l.itens.filter(i => i.conferido).length;
  const pct        = total > 0 ? Math.round(conferidos/total*100) : 0;
  const tudo       = conferidos === total;
  const horas      = Array.from({length:18},(_,i)=>`${String(i+6).padStart(2,'0')}:00`);
  const u          = typeof getCurrentUser==='function' ? getCurrentUser() : null;

  // Agrupa por fornecedor
  const bySup = {};
  l.itens.forEach(i => {
    const k = i.tipoCompra === 'presencial' ? 'presencial' : (i.fornecedorId || '0');
    if (!bySup[k]) bySup[k] = [];
    bySup[k].push(i);
  });

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:.96rem;font-weight:800;margin-bottom:3px">${lc('package',14,'var(--purple)')} Recebimento · ${l.codigo}</h3>
        <div style="font-size:.71rem;color:var(--muted)">${conferidos} de ${total} itens conferidos</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="_renderEtapa4OC()">${lc('arrow-left',13)} OC</button>
    </div>

    <!-- Progresso -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:.72rem;color:var(--muted)">Progresso geral</span>
        <span style="font-size:.72rem;font-weight:700;color:${pct===100?'var(--green)':'var(--purple)'}">${pct}%</span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct===100?'var(--green)':'var(--purple)'};border-radius:4px;transition:width .4s"></div>
      </div>
    </div>

    <!-- Itens agrupados por fornecedor — cada item com seus próprios dados -->
    ${Object.entries(bySup).map(([supKey, itensGrupo]) => {
      const isPresencial  = supKey === 'presencial';
      const sup           = !isPresencial && parseInt(supKey) ? suppliers.find(s => s.id === parseInt(supKey)) : null;
      const grupoConf     = itensGrupo.filter(i => i.conferido).length;
      const grupoTotal    = itensGrupo.length;
      const grupoOk       = grupoConf === grupoTotal;

      return `<div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${grupoOk?'var(--green)':'var(--border)'}">
        <!-- Cabeçalho do grupo -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;
          background:${grupoOk?'var(--green-light)':isPresencial?'var(--orange-light)':'var(--purple-xlight)'};
          border-bottom:1.5px solid ${grupoOk?'var(--green)':isPresencial?'var(--border)':'var(--purple-light)'};flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:.86rem;font-weight:800;color:${grupoOk?'var(--green)':isPresencial?'var(--orange-dark)':'var(--purple)'}">
              ${isPresencial
                ? `${lc('shopping-cart',13,'currentColor')} Compra Presencial`
                : `${lc('building-2',13,'currentColor')} ${sup?.name||'Fornecedor'}`}
            </div>
            ${sup?.seller?`<div style="font-size:.66rem;color:var(--muted)">${lc('user',10,'var(--muted)')} ${sup.seller}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:.7rem;font-weight:700;color:${grupoOk?'var(--green)':'var(--muted)'}">
              ${lc(grupoOk?'check-circle':'clock',12,'currentColor')} ${grupoConf}/${grupoTotal}
            </span>
            <button onclick="_conferirTodoGrupo('${supKey}')"
              style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--green);
              background:var(--green-light);color:var(--green);font-size:.68rem;font-weight:600;cursor:pointer">
              ${lc('check-check',11,'currentColor')} Conferir todos
            </button>
          </div>
        </div>

        <!-- Cada item com seus dados individuais de recebimento -->
        ${itensGrupo.map(i => {
          const qtdS  = i.qtdAprovada ?? i.qtdSelecionada;
          const qtdR  = i.qtdRecebida ?? null;
          const diff  = qtdR !== null ? qtdR - qtdS : null;
          const isOk  = i.conferido && !i.divergencia;
          const isDivg= i.conferido && i.divergencia;

          // Dados individuais de recebimento — sem fallback global
          const iConf = i.conferidoPorItem || u?.name || '';
          const iData = i.dataRecebimentoItem || new Date().toISOString().slice(0,10);
          const iHora = i.horaRecebimentoItem || horas[4]; // default 10:00

          return `<div style="border-bottom:1px solid var(--border);background:${isOk?'var(--green-light)':isDivg?'var(--yellow-light)':'var(--surface)'}">
            <!-- Linha principal do item -->
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap">
              <div style="width:4px;align-self:stretch;background:${isOk?'var(--green)':isDivg?'var(--yellow)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
              <div style="flex:1;min-width:110px">
                <div style="font-size:.84rem;font-weight:700">${i.nome}</div>
                <div style="font-size:.62rem;color:var(--muted)">${i.categoria}</div>
              </div>
              <!-- Pedido -->
              <div style="text-align:center">
                <div style="font-size:.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Pedido</div>
                <div style="font-size:.82rem;font-weight:700;font-family:monospace">${fmt(qtdS)} ${i.unidade}</div>
              </div>
              <!-- Recebido -->
              <div style="text-align:center">
                <div style="font-size:.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Recebido</div>
                <input type="number" value="${qtdR??''}" min="0" step="0.001" placeholder="${fmt(qtdS)}"
                  style="width:72px;padding:4px 6px;border:1.5px solid ${diff!==null&&diff<0?'var(--red)':'var(--border)'};
                  border-radius:var(--r6);font-size:.78rem;text-align:center;font-family:monospace"
                  onchange="setQtdRecebida(${i.id},this.value)">
              </div>
              <!-- Diferença -->
              ${diff!==null?`<div style="text-align:center">
                <div style="font-size:.56rem;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Dif.</div>
                <div style="font-size:.82rem;font-weight:700;font-family:monospace;color:${diff<0?'var(--red)':diff>0?'var(--yellow)':'var(--green)'}">
                  ${diff>0?'+':''}${fmt(diff)}
                </div>
              </div>`:''}
              <!-- Checkbox conferido -->
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.76rem;font-weight:600;
                white-space:nowrap;padding:5px 10px;border-radius:var(--r8);
                border:1.5px solid ${isOk?'var(--green)':'var(--border)'};
                background:${isOk?'var(--green)':'var(--surface)'};color:${isOk?'#fff':'var(--text2)'}">
                <input type="checkbox" ${i.conferido?'checked':''} style="accent-color:var(--green);width:15px;height:15px"
                  onchange="marcarConferido(${i.id},this.checked)">
                Conferido
              </label>
            </div>

            <!-- Dados de recebimento INDIVIDUAIS por item -->
            <div style="padding:6px 16px 10px 32px;background:${isOk?'rgba(34,197,94,.06)':'var(--surface2)'}">
              <div style="display:grid;grid-template-columns:2fr 1.2fr 1fr;gap:6px;margin-bottom:5px">
                <div>
                  <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;margin-bottom:2px">Quem conferiu</div>
                  <input type="text" placeholder="Nome..." value="${iConf}"
                    style="width:100%;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
                    onchange="setItemRecCampo(${i.id},'conferidoPorItem',this.value)">
                </div>
                <div>
                  <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;margin-bottom:2px">Data</div>
                  <input type="date" value="${iData}"
                    style="width:100%;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
                    onchange="setItemRecCampo(${i.id},'dataRecebimentoItem',this.value)">
                </div>
                <div>
                  <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;margin-bottom:2px">Hora</div>
                  <select style="width:100%;padding:4px 5px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
                    onchange="setItemRecCampo(${i.id},'horaRecebimentoItem',this.value)">
                    ${horas.map(h=>`<option value="${h}" ${iHora===h?'selected':''}>${h}</option>`).join('')}
                  </select>
                </div>
              </div>
              <input type="text" placeholder="Obs. de conferência (divergência, qualidade, etc)..." value="${i.comentarioConferencia||''}"
                style="width:100%;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);
                font-size:.71rem;background:var(--surface)"
                onchange="setComentarioConferencia(${i.id},this.value)">
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}

    <!-- Botão Finalizar — fixo no rodapé, verde quando tudo conferido -->
    <div style="position:sticky;bottom:0;background:var(--surface);border-top:1.5px solid var(--border);
      padding:14px 0;margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="font-size:.78rem;color:var(--muted)">
        ${tudo
          ? `${lc('check-circle',14,'var(--green)')} <span style="color:var(--green);font-weight:700">Todos os itens conferidos!</span>`
          : `${lc('clock',14,'var(--muted)')} Faltam <strong>${total-conferidos}</strong> item(s) para conferir`}
      </div>
      <button onclick="${tudo?'concluirLista()':'void(0)'}"
        style="display:flex;align-items:center;gap:8px;padding:11px 28px;border-radius:var(--r10);
        border:none;font-size:.9rem;font-weight:800;font-family:Inter,sans-serif;cursor:${tudo?'pointer':'not-allowed'};
        transition:all .3s;
        background:${tudo?'var(--green)':'var(--surface2)'};
        color:${tudo?'#fff':'var(--muted)'}">
        ${tudo ? lc('check-circle',18,'#fff') : lc('circle',18,'var(--muted)')}
        Finalizar lista
      </button>
    </div>`;
}


function _renderEtapa5() { _renderEtapa4OC_Recebimento(); }
function _renderEtapa4OC_Recebimento() {
  return _renderEtapa4OC();
}
function _conferirTodoGrupo(supKey) {
  const l=_listaAtual;
  l.itens.forEach(i=>{
    const k=i.tipoCompra==='presencial'?'presencial':(i.fornecedorId||'0');
    if(String(k)!==String(supKey)) return;
    if(!i.conferido) {
      i.conferido=true;
      if(i.qtdRecebida===null) i.qtdRecebida=i.qtdAprovada??i.qtdSelecionada;
    }
  });
  saveListas(); _renderEtapa4();
}

function _setRecGlobal(campo,val) {
  // Mantido por compatibilidade — campos globais foram substituídos por campos por item
  if (_listaAtual) { _listaAtual[campo] = val; saveListas(); }
}

function setItemRecCampo(itemId, campo, val) {
  const i=_listaAtual.itens.find(x=>x.id===itemId);
  if(i){i[campo]=val;saveListas();}
}

function setQtdRecebida(itemId,val) {
  const i=_listaAtual.itens.find(x=>x.id===itemId); if(!i) return;
  const v=parseFloat(val); const qtdS=i.qtdAprovada??i.qtdSelecionada;
  i.qtdRecebida=!isNaN(v)?parseFloat(v.toFixed(3)):null;
  i.divergencia=i.qtdRecebida!==null&&Math.abs(i.qtdRecebida-qtdS)>0.001;
  saveListas();
}

function marcarConferido(itemId,checked) {
  const i=_listaAtual.itens.find(x=>x.id===itemId); if(!i) return;
  i.conferido=checked;
  if(checked&&i.qtdRecebida===null) i.qtdRecebida=i.qtdAprovada??i.qtdSelecionada;
  saveListas(); _renderEtapa4();
}

function setComentarioConferencia(itemId,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.comentarioConferencia=val;saveListas();} }

function concluirLista() {
  if(!_listaAtual) return;

  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;

  _listaAtual.itens.forEach(i=>{
    if(!i.itemId) return;
    const item=items.find(x=>x.id===i.itemId); if(!item) return;
    if(i.qtdRecebida!==null) item.qty=parseFloat((item.qty+i.qtdRecebida).toFixed(3));
    if(i.precoUnitFinal) item.cost=i.precoUnitFinal;
  });
  saveI();

  _listaAtual.status='concluida';
  _listaAtual.dataConclusao=new Date().toISOString();
  _listaAtual.concluídoPor = u?.name || '';
  _listaAtual.valorFinal=_listaAtual.itens.reduce((s,i)=>s+(i.qtdRecebida??0)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  saveListas();

  const economia=Math.max(0,(_listaAtual.valorEstimado||0)-(_listaAtual.valorFinal||0));
  const bySup={};
  _listaAtual.itens.forEach(i=>{const k=i.fornecedorId||0;if(!bySup[k])bySup[k]=[];bySup[k].push(i);});
  cycleHistory.push({
    id:_listaAtual.codigo, date:_listaAtual.dataConclusao,
    items:_listaAtual.itens.length, sups:Object.keys(bySup).filter(k=>k!=='0').length,
    total:_listaAtual.valorFinal, economia, listaId:_listaAtual.id,
    etapas:{criacao:_listaAtual.dataCriacao,aprovacao:_listaAtual.dataAprovacao||null,conclusao:_listaAtual.dataConclusao},
    conferidoPor:_listaAtual.conferidoPor||'', dataRecebimento:_listaAtual.dataRecebimento||'', horaRecebimento:_listaAtual.horaRecebimento||'',
  });
  localStorage.setItem('vtp_cycle_history',JSON.stringify(cycleHistory));

  // Feedback visual antes de redirecionar
  const content = document.getElementById('comprasContent');
  if (content) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;text-align:center">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--green-light);border:3px solid var(--green);
          display:flex;align-items:center;justify-content:center;margin-bottom:20px;
          animation:popIn .4s cubic-bezier(.175,.885,.32,1.275)">
          ${lc('check-circle',36,'var(--green)')}
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--green);margin-bottom:8px">Lista concluída!</div>
        <div style="font-size:.84rem;color:var(--muted);margin-bottom:6px">Estoque atualizado com sucesso.</div>
        <div style="font-size:.78rem;color:var(--muted)">Redirecionando para o histórico...</div>
      </div>
      <style>
        @keyframes popIn {
          0%{transform:scale(0);opacity:0}
          100%{transform:scale(1);opacity:1}
        }
      </style>`;
  }

  // Aguarda 1.8s para o usuário ver o feedback e vai ao histórico
  setTimeout(() => {
    _listaAtual = getListaAtiva();
    _comprasTab = 'historico';
    renderDashboard();
    renderComprasModule();
  }, 1800);
}

// ══════════════════════════════════════════════════════════════
// HISTÓRICO — com filtro de período e auditoria
// ══════════════════════════════════════════════════════════════
function _renderHistorico() {
  const busca  = (document.getElementById('histBusca')?.value||'').toLowerCase();
  const filtro =  document.getElementById('histFiltro')?.value||'';
  const de     =  document.getElementById('histDe')?.value||'';
  const ate    =  document.getElementById('histAte')?.value||'';

  const hist=[...listas]
    .sort((a,b)=>new Date(b.dataCriacao||0)-new Date(a.dataCriacao||0))
    .filter(l=>{
      if (filtro && l.status!==filtro) return false;
      if (busca && !l.codigo.toLowerCase().includes(busca)) return false;
      if (de) { const d=(l.dataCriacao||'').slice(0,10); if(d<de) return false; }
      if (ate) { const d=(l.dataCriacao||'').slice(0,10); if(d>ate) return false; }
      return true;
    });

  // Totalizadores do conjunto filtrado
  const concluidas  = hist.filter(l => l.status === 'concluida');
  const emAndamento = hist.filter(l => l.status !== 'concluida');
  const totalGasto  = concluidas.reduce((s,l) => s + (l.valorFinal||0), 0);
  const totalItens  = concluidas.reduce((s,l) => s + (l.itens?.length||0), 0);
  const economia    = concluidas.reduce((s,l) => s + Math.max(0,(l.valorEstimado||0)-(l.valorFinal||0)), 0);
  const ticketMedio = concluidas.length ? totalGasto / concluidas.length : 0;
  const filtrando   = !!(busca || de || ate || filtro);

  document.getElementById('comprasContent').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:.96rem;font-weight:800;margin-bottom:3px">${lc('clock',14,'var(--purple)')} Histórico de Compras</h3>
        <div style="font-size:.71rem;color:var(--muted)">${hist.length} lista(s)${filtrando?' no período/filtro selecionado':''}</div>
      </div>
    </div>

    <!-- Totalizadores -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:12px 16px">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--purple);margin-bottom:4px">
          ${lc('dollar-sign',11,'var(--purple)')} Total comprado
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(totalGasto)}</div>
        <div style="font-size:.64rem;color:var(--muted);margin-top:2px">${concluidas.length} lista(s) concluída(s)</div>
      </div>
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px">
          ${lc('shopping-bag',11,'currentColor')} Ticket médio
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--text);font-family:monospace">R$ ${fmt(ticketMedio)}</div>
        <div style="font-size:.64rem;color:var(--muted);margin-top:2px">por lista concluída</div>
      </div>
      <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:12px 16px">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:4px">
          ${lc('trending-down',11,'var(--green)')} Economia gerada
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--green);font-family:monospace">R$ ${fmt(economia)}</div>
        <div style="font-size:.64rem;color:var(--muted);margin-top:2px">estimado vs. final</div>
      </div>
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px">
          ${lc('package',11,'currentColor')} Itens comprados
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--text)">${totalItens}</div>
        <div style="font-size:.64rem;color:var(--muted);margin-top:2px">
          ${emAndamento.length > 0 ? emAndamento.length+' em andamento' : 'todas concluídas'}
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:140px;max-width:220px">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:3px;font-weight:600">Buscar</div>
        <input type="text" id="histBusca" class="inp" placeholder="Código da lista..." value="${busca}" oninput="_renderHistorico()">
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:3px;font-weight:600">De</div>
        <input type="date" id="histDe" class="inp" value="${de}" onchange="_renderHistorico()" style="max-width:150px">
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:3px;font-weight:600">Até</div>
        <input type="date" id="histAte" class="inp" value="${ate}" onchange="_renderHistorico()" style="max-width:150px">
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:3px;font-weight:600">Status</div>
        <select id="histFiltro" class="inp" style="max-width:170px" onchange="_renderHistorico()">
          <option value="">Todos</option>
          ${Object.entries(STATUS_ETAPA).map(([k,v])=>`<option value="${k}" ${filtro===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </div>
      ${filtrando?`<button class="btn btn-outline btn-sm" onclick="_limparFiltrosHist()">${lc('x',12)} Limpar</button>`:''}
    </div>

    ${hist.length===0?`<div class="empty" style="padding:40px"><div class="empty-icon">${lc('clock',24,'var(--muted)')}</div>Nenhuma lista encontrada.</div>`
    :hist.map(l=>_cardHistorico(l)).join('')}`;
}
function _limparFiltrosHist() {
  ['histBusca','histDe','histAte'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const s=document.getElementById('histFiltro'); if(s) s.value='';
  _renderHistorico();
}

function _cardHistorico(l) {
  const st=STATUS_ETAPA[l.status]||{label:l.status,color:'var(--muted)',bg:'var(--surface2)'};
  const its=l.itens||[];
  const itensForn=its.filter(i=>i.tipoCompra!=='presencial');
  const itensPresencial=its.filter(i=>i.tipoCompra==='presencial');
  const bySup={};
  itensForn.forEach(i=>{const k=i.fornecedorId||0;if(!bySup[k])bySup[k]=[];bySup[k].push(i);});
  const numSups=Object.keys(bySup).filter(k=>k!=='0').length;
  const isOpen=l.status!=='concluida';

  const etapas=[
    {label:'Criação',icon:'file-plus',data:l.dataCriacao},
    {label:'Cotação',icon:'message-circle',data:l.etapa>=2?l.dataCriacao:null},
    {label:'Aprovação',icon:'check-circle',data:l.dataAprovacao},
    {label:'Ordem',icon:'shopping-bag',data:l.etapa>=3?(l.dataAprovacao||null):null},
    {label:'Concluído',icon:'package',data:l.dataConclusao},
  ];

  return `<div class="card" style="margin-bottom:12px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="flex:1;min-width:140px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:.9rem;font-weight:800">${l.codigo}</span>
          <span style="font-size:.67rem;font-weight:700;padding:2px 8px;border-radius:20px;background:${st.bg};color:${st.color};border:1px solid ${st.color}">${st.label}</span>
        </div>
        <div style="font-size:.66rem;color:var(--muted);margin-top:3px">
          Criada em ${fmtD(l.dataCriacao)} por ${l.criadoPor}
          ${l.conferidoPor?` · Conferida por <strong>${l.conferidoPor}</strong>`:''}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="text-align:center;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
          <div style="font-size:.82rem;font-weight:800;color:var(--purple)">${its.length}</div>
          <div style="font-size:.54rem;color:var(--muted);text-transform:uppercase">Itens</div>
        </div>
        <div style="text-align:center;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
          <div style="font-size:.82rem;font-weight:800;color:var(--purple)">${numSups}</div>
          <div style="font-size:.54rem;color:var(--muted);text-transform:uppercase">Fornec.</div>
        </div>
        <div style="text-align:center;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
          <div style="font-size:.82rem;font-weight:800;color:${l.status==='concluida'?'var(--green)':'var(--purple)'}">R$${fmt(l.valorFinal||l.valorEstimado||0)}</div>
          <div style="font-size:.54rem;color:var(--muted);text-transform:uppercase">${l.status==='concluida'?'Final':'Estimado'}</div>
        </div>
        ${isOpen?`<button class="btn btn-outline btn-xs" onclick="_reabrirLista(${l.id})">${lc('external-link',11)} Abrir</button>`:''}
        <button class="btn btn-outline btn-xs" onclick="abrirAuditoria(${l.id})">${lc('search',11)} Auditoria</button>
      </div>
    </div>

    <!-- Timeline -->
    <div style="padding:14px 16px;background:var(--surface)">
      <div style="position:relative;display:flex;align-items:flex-start">
        <div style="position:absolute;top:11px;left:12px;right:12px;height:2px;background:var(--border);z-index:0"></div>
        ${etapas.map((e,idx)=>{
          const done=!!e.data; const cur=!done&&idx===etapas.filter(x=>!!x.data).length;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative;z-index:1">
            <div style="width:22px;height:22px;border-radius:50%;background:${done?'var(--green)':cur?'var(--purple)':'var(--border)'};border:2px solid ${done?'var(--green)':cur?'var(--purple)':'var(--border)'};display:flex;align-items:center;justify-content:center;margin-bottom:5px">
              ${lc(e.icon,10,done||cur?'#fff':'var(--muted)')}
            </div>
            <div style="font-size:.58rem;font-weight:600;color:${done?'var(--green)':cur?'var(--purple)':'var(--muted)'};text-align:center;line-height:1.3">${e.label}</div>
            ${done&&e.data?`<div style="font-size:.54rem;color:var(--muted);text-align:center">${fmtD(e.data)}</div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>

    ${numSups>0||itensPresencial.length>0?`
    <div style="padding:7px 16px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:5px;align-items:center">
      ${numSups>0?`<span style="font-size:.6rem;color:var(--muted)">${lc('building-2',10,'var(--muted)')} Fornecedores:</span>`:''}
      ${Object.keys(bySup).filter(k=>k!=='0').map(k=>{const s=suppliers.find(x=>x.id===parseInt(k));return s?`<span class="badge b-purple" style="font-size:.58rem">${s.name}</span>`:''}).join('')}
      ${itensPresencial.length?`<span class="badge b-orange" style="font-size:.58rem">${lc('shopping-cart',9,'currentColor')} ${itensPresencial.length} presencial</span>`:''}
    </div>`:''}

    ${l.conferidoPor||l.dataRecebimento?`
    <div style="padding:6px 16px;border-top:1px solid var(--border);background:var(--surface2);display:flex;gap:12px;flex-wrap:wrap;font-size:.65rem;color:var(--muted);align-items:center">
      ${l.conferidoPor?`${lc('user',10,'currentColor')} Conferido por <strong>${l.conferidoPor}</strong>`:''}
      ${l.dataRecebimento?`${lc('calendar',10,'currentColor')} ${fmtD(l.dataRecebimento)} ${l.horaRecebimento||''}`:''}
    </div>`:''}
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// AUDITORIA — modal completo de uma lista
// ══════════════════════════════════════════════════════════════
function abrirAuditoria(listaId) {
  const l = listas.find(x=>x.id===listaId);
  if (!l) return;
  document.getElementById('popupAuditoria')?.remove();

  const st = STATUS_ETAPA[l.status]||{label:l.status,color:'var(--muted)',bg:'var(--surface2)'};
  const itensForn = (l.itens||[]).filter(i=>i.tipoCompra!=='presencial');
  const itensPresencial = (l.itens||[]).filter(i=>i.tipoCompra==='presencial');
  const bySup={};
  itensForn.forEach(i=>{const k=i.fornecedorId||0;if(!bySup[k])bySup[k]=[];bySup[k].push(i);});

  const popup=document.createElement('div');
  popup.id='popupAuditoria';
  popup.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';

  popup.innerHTML=`
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:720px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1rem;font-weight:800">${lc('search',16,'var(--purple)')} Auditoria · ${l.codigo}</span>
            <span style="font-size:.68rem;font-weight:700;padding:3px 10px;border-radius:20px;background:${st.bg};color:${st.color};border:1px solid ${st.color}">${st.label}</span>
          </div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:3px">Criada em ${fmtD(l.dataCriacao)} por <strong>${l.criadoPor}</strong></div>
        </div>
        <button onclick="document.getElementById('popupAuditoria').remove()"
          style="background:none;border:none;cursor:pointer;padding:6px;border-radius:var(--r6);color:var(--muted)">
          ${lc('x',18,'currentColor')}
        </button>
      </div>

      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:20px">

        <!-- Resumo geral -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:.96rem;font-weight:800;color:var(--purple)">${(l.itens||[]).length}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Itens total</div>
          </div>
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:.96rem;font-weight:800;color:var(--purple)">R$${fmt(l.valorEstimado||0)}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Estimado</div>
          </div>
          ${l.valorAprovado!=null?`<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:.96rem;font-weight:800;color:var(--green)">R$${fmt(l.valorAprovado)}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Aprovado</div>
          </div>`:''}
          ${l.valorFinal!=null?`<div style="background:var(--purple-xlight);border:1px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:.96rem;font-weight:800;color:var(--purple)">R$${fmt(l.valorFinal)}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Final</div>
          </div>`:''}
        </div>

        <!-- Linha do tempo detalhada -->
        <div>
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">${lc('clock',12,'var(--muted)')} Linha do Tempo</div>
          <div style="display:flex;flex-direction:column;gap:0">
            ${[
              {
                icon:'file-plus', label:'Lista criada', data:l.dataCriacao,
                detalhe: l.criadoPor ? `por <strong>${l.criadoPor}</strong>` : '',
                cor:'var(--purple)'
              },
              {
                icon:'message-circle', label:'Cotação enviada',
                data: l.etapa>=2 ? l.dataCriacao : null,
                detalhe: `${Object.keys(bySup).filter(k=>k!=='0').length} fornecedor(es) cotado(s)`,
                cor:'var(--yellow)'
              },
              {
                icon:'check-circle', label:'Aprovação',
                data: l.dataAprovacao,
                detalhe: (l.aprovadoPor||l.aprovadorNome)
                  ? `por <strong>${l.aprovadoPor||l.aprovadorNome}</strong>`
                  : 'sem registro de aprovador',
                cor:'var(--green)'
              },
              {
                icon:'shopping-bag', label:'Ordem de compra emitida',
                data: l.etapa>=3 ? (l.dataAprovacao||null) : null,
                detalhe: '',
                cor:'var(--purple)'
              },
              {
                icon:'package', label:'Lista concluída',
                data: l.dataConclusao,
                detalhe: l['concluídoPor'] ? `por <strong>${l['concluídoPor']}</strong>` : '',
                cor:'var(--green)'
              },
            ].map((e,idx,arr)=>{
              const done=!!e.data;
              return `<div style="display:flex;gap:14px;align-items:flex-start">
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                  <div style="width:28px;height:28px;border-radius:50%;background:${done?e.cor:'var(--border)'};display:flex;align-items:center;justify-content:center">
                    ${lc(e.icon,13,done?'#fff':'var(--muted)')}
                  </div>
                  ${idx<arr.length-1?`<div style="width:2px;height:28px;background:${done?e.cor:'var(--border)'}"></div>`:''}
                </div>
                <div style="padding-top:3px;padding-bottom:4px">
                  <div style="font-size:.82rem;font-weight:${done?'700':'500'};color:${done?'var(--text)':'var(--muted)'}">${e.label}</div>
                  ${done&&e.data?`<div style="font-size:.68rem;color:var(--muted)">${fmtDT(e.data)}${e.detalhe?' · ':''}${e.detalhe||''}</div>`:`<div style="font-size:.68rem;color:var(--muted)">Não realizado</div>`}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Aprovador card -->
        ${(l.aprovadoPor||l.aprovadorNome)?`<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px 14px;display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('check-circle',16,'#fff')}
          </div>
          <div>
            <div style="font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:2px">Aprovado por</div>
            <div style="font-size:.86rem;font-weight:700">${l.aprovadoPor||l.aprovadorNome}</div>
            ${l.dataAprovacao?`<div style="font-size:.68rem;color:var(--muted)">${fmtDT(l.dataAprovacao)}</div>`:''}
            ${l.aprovadorWa?`<div style="font-size:.68rem;color:var(--muted)">${lc('message-circle',10,'currentColor')} ${l.aprovadorWa}</div>`:''}
          </div>
        </div>`:''}

        <!-- Itens por fornecedor -->
        ${Object.entries(bySup).map(([supId,itens])=>{
          const sup=parseInt(supId)?suppliers.find(s=>s.id===parseInt(supId)):null;
          const total=itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
          const totalRecebido=itens.reduce((s,i)=>s+(i.qtdRecebida??0)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
          return `<div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
              <div style="font-size:.78rem;font-weight:700;color:var(--purple);display:flex;align-items:center;gap:6px">
                ${lc('building-2',13,'var(--purple)')} ${sup?.name||'Fornecedor não definido'}
                ${sup?.seller?`<span style="font-size:.66rem;color:var(--muted);font-weight:400">· ${sup.seller}</span>`:''}
              </div>
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <div style="font-size:.76rem;font-weight:700;color:var(--purple)">R$${fmt(total)}</div>
                ${(()=>{
                  // Datas de recebimento distintas neste grupo de fornecedor
                  const datas = [...new Set(itens.map(i=>i.dataRecebimentoItem||'').filter(Boolean))];
                  const confs = [...new Set(itens.map(i=>i.conferidoPorItem||'').filter(Boolean))];
                  if(!datas.length && !confs.length) return '';
                  return `<div style="font-size:.68rem;color:var(--muted);background:var(--surface2);padding:3px 8px;border-radius:var(--r6);border:1px solid var(--border)">
                    ${confs.length?`${lc('user',10,'currentColor')} ${confs.join(', ')} `:' '}
                    ${datas.length?`${lc('calendar',10,'currentColor')} ${datas.map(d=>fmtD(d)).join(', ')}`:'' }
                  </div>`;
                })()}
              </div>
            </div>
            <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
              <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:var(--surface2)">
                  <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Item</th>
                  <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Pedido</th>
                  <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Recebido</th>
                  <th style="padding:7px 12px;text-align:right;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Preço unit.</th>
                  <th style="padding:7px 12px;text-align:right;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Total</th>
                  <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Conferência</th>
                  <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Status</th>
                </tr></thead>
                <tbody>
                  ${itens.map((i,iIdx)=>{
                    const qtdP=i.qtdAprovada??i.qtdSelecionada;
                    const qtdR=i.qtdRecebida??null;
                    const div=qtdR!==null?qtdR-qtdP:null;
                    const aprov=i.aprovado===true?`<span style="font-size:.62rem;font-weight:700;color:var(--green)">✓ Aprovado</span>`:i.aprovado===false?`<span style="font-size:.62rem;font-weight:700;color:var(--red)">✗ Reprovado</span>`:`<span style="font-size:.62rem;color:var(--muted)">—</span>`;
                    return `<tr style="border-top:1px solid var(--border);background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
                      <td style="padding:7px 12px">
                        <div style="font-size:.78rem;font-weight:600">${i.nome}</div>
                        <div style="font-size:.62rem;color:var(--muted)">${i.categoria}</div>
                        ${i.comentarioAprovador?`<div style="font-size:.62rem;color:var(--orange-dark);margin-top:2px">${lc('message-square',10,'currentColor')} ${i.comentarioAprovador}</div>`:''}
                        ${i.comentarioConferencia?`<div style="font-size:.62rem;color:var(--muted);margin-top:2px">${lc('clipboard-list',10,'currentColor')} ${i.comentarioConferencia}</div>`:''}
                      </td>
                      <td style="padding:7px 12px;text-align:center;font-size:.76rem;font-family:monospace">${fmt(qtdP)} ${i.unidade}</td>
                      <td style="padding:7px 12px;text-align:center;font-size:.76rem;font-family:monospace;color:${div!==null&&div<0?'var(--red)':div!==null&&div>0?'var(--yellow)':'inherit'}">
                        ${qtdR!==null?fmt(qtdR)+' '+i.unidade:'—'}
                        ${div!==null&&Math.abs(div)>0.001?`<div style="font-size:.6rem">${div>0?'+':''}${fmt(div)}</div>`:''}
                      </td>
                      <td style="padding:7px 12px;text-align:right;font-size:.76rem;font-family:monospace">R$${fmt(i.precoUnitFinal||i.precoUnitEstimado||0)}</td>
                      <td style="padding:7px 12px;text-align:right;font-size:.76rem;font-weight:700;font-family:monospace;color:var(--purple)">R$${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}</td>
                      <td style="padding:7px 12px">
                        ${i.conferidoPorItem||i.dataRecebimentoItem?`
                          <div style="font-size:.72rem;font-weight:600">${i.conferidoPorItem||'—'}</div>
                          <div style="font-size:.62rem;color:var(--muted)">${i.dataRecebimentoItem?fmtD(i.dataRecebimentoItem):''} ${i.horaRecebimentoItem||''}</div>
                        `:`<span style="font-size:.68rem;color:var(--muted)">—</span>`}
                      </td>
                      <td style="padding:7px 12px;text-align:center">${aprov}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--purple-xlight);border-top:2px solid var(--purple-light)">
                    <td colspan="4" style="padding:7px 12px;font-size:.76rem;font-weight:700">Total do fornecedor</td>
                    <td style="padding:7px 12px;text-align:right;font-size:.82rem;font-weight:800;color:var(--purple);font-family:monospace">R$${fmt(total)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>`;
        }).join('')}

        <!-- Itens presenciais -->
        ${itensPresencial.length?`<div>
          <div style="font-size:.78rem;font-weight:700;color:var(--orange-dark);margin-bottom:8px;display:flex;align-items:center;gap:6px">
            ${lc('shopping-cart',13,'var(--orange-dark)')} Compra Presencial
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--orange-light)">
                <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Item</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Qtd</th>
                <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Local</th>
                <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Responsável</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase;font-weight:700">Status</th>
              </tr></thead>
              <tbody>
                ${itensPresencial.map((i,iIdx)=>{
                  const aprov=i.aprovado===true?`<span style="font-size:.62rem;font-weight:700;color:var(--green)">✓ Aprovado</span>`:i.aprovado===false?`<span style="font-size:.62rem;font-weight:700;color:var(--red)">✗ Reprovado</span>`:`<span style="font-size:.62rem;color:var(--muted)">—</span>`;
                  return `<tr style="border-top:1px solid var(--border);background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:7px 12px"><div style="font-size:.78rem;font-weight:600">${i.nome}</div></td>
                    <td style="padding:7px 12px;text-align:center;font-size:.76rem;font-family:monospace">${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade}</td>
                    <td style="padding:7px 12px;font-size:.74rem">${i.localCompra||'—'}</td>
                    <td style="padding:7px 12px;font-size:.74rem">${i.responsavelCompra||'—'}</td>
                    <td style="padding:7px 12px;text-align:center">${aprov}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`:''}

        <!-- Observações -->
        ${l.observacoes?`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px">
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px">${lc('message-square',11,'var(--muted)')} Observações</div>
          <div style="font-size:.8rem;color:var(--text)">${l.observacoes}</div>
        </div>`:''}

      </div><!-- /body -->
    </div>`;

  document.body.appendChild(popup);
  // Fechar ao clicar fora
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _reabrirLista(id) {
  const l=listas.find(x=>x.id===id); if(!l) return;
  _listaAtual=l; _comprasTab='lista'; _renderDashCompras(); _renderEtapa(l.etapa||1);
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
let _timerInterval=null;
function _startTimer(elId,deadline) {
  clearInterval(_timerInterval);
  _timerInterval=setInterval(()=>{
    const el=document.getElementById(elId); if(!el){clearInterval(_timerInterval);return;}
    const ms=new Date(deadline)-Date.now();
    if(ms<=0){el.textContent='— Encerrado';el.style.color='var(--red)';clearInterval(_timerInterval);return;}
    const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
    el.textContent=`${h}h ${m}m ${s}s restantes`;
  },1000);
}

function encerrarListaManual() {
  if(!_listaAtual) return;
  if(!confirm('Encerrar esta lista? Ela será movida para o histórico.')) return;
  _listaAtual.status='concluida'; _listaAtual.dataConclusao=new Date().toISOString(); _listaAtual.valorFinal=_listaAtual.valorEstimado||0;
  saveListas(); _listaAtual=getListaAtiva(); renderComprasModule(); toast('Lista encerrada.');
}

function calcEconomia() {
  return listas.filter(l=>l.status==='concluida').reduce((s,l)=>s+Math.max(0,(l.valorEstimado||0)-(l.valorFinal||0)),0);
}

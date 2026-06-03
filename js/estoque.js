/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Módulo de Contagem de Estoque (mobile-first, por categoria)
 * Objetivo: comparar estoque físico vs digital, detectar divergências
 */

let _estTab          = 'contagem';   // 'contagem' | 'movimentacoes'
let _contagem        = {};           // { itemId: qtyFisico }
let _contagemAtiva   = false;
let _catsSelecionadas = new Set();   // categories selected for current count
let _categoriasContando = [];        // categories in the active count session

// Storage de movimentações
const _getMov    = () => db._get('vtp_movimentacoes', []);
const _saveMov   = m  => db._set('vtp_movimentacoes', m);
const _getHistContagens  = () => db._get('vtp_hist_contagens', []);
const _saveHistContagens = h  => db._set('vtp_hist_contagens', h);

// Retorna mapa itemId → {fisico, date} da contagem mais recente
function _ultimaContagemPorItem() {
  const hist   = _getHistContagens();
  if (!hist.length) return {};
  const sorted = [...hist].sort((a,b) => new Date(b.date) - new Date(a.date));
  const mapa   = {};
  for (const c of sorted) {
    for (const it of (c.itens || [])) {
      if (it.fisico !== null && !(it.id in mapa)) {
        mapa[it.id] = { fisico: it.fisico, diverg: it.diverg ?? null, date: c.date, user: c.user };
      }
    }
  }
  return mapa;
}

// Tipos de movimentação
const MOV_TIPOS = {
  entrada_compra:   { label: 'Entrada — Compra',         icon: 'arrow-down-circle', cor: 'var(--green)', bg: 'var(--green-light)' },
  entrada_ajuste:   { label: 'Entrada — Ajuste manual',  icon: 'plus-circle',       cor: 'var(--green)', bg: 'var(--green-light)' },
  saida_venda:      { label: 'Saída — Venda (auto)',      icon: 'shopping-bag',      cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_producao:   { label: 'Saída — Produção interna', icon: 'chef-hat',          cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_ajuste:     { label: 'Saída — Ajuste manual',    icon: 'minus-circle',      cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_perda:      { label: 'Saída — Perda/Desperdício',icon: 'trash-2',           cor: 'var(--red)',   bg: 'var(--red-light)'   },
  importacao_cw:    { label: 'Importação Cardápio Web',  icon: 'upload',            cor: 'var(--green)', bg: 'var(--green-light)' },
};

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL + TABS
// ══════════════════════════════════════════════════════════════
function renderEstoque() {
  try {
    _atualizarEstTabs();
    if (_estTab === 'movimentacoes') {
      _renderMovimentacoes();
    } else {
      _renderContagemTab();
    }
    if (typeof updatePrepBadge === 'function') updatePrepBadge();
  } catch(e) {
    console.error('[Estoque] Erro ao renderizar:', e);
    const el = document.getElementById('estPanelContagem');
    if (el) el.innerHTML = `<div style="padding:24px;color:var(--red);font-size:var(--text-sm)">
      Erro ao carregar o módulo de estoque. Tente recarregar a página.<br>
      <small style="color:var(--muted)">${e.message}</small>
    </div>`;
  }
}

function setEstTab(tab) {
  _estTab = tab;
  _atualizarEstTabs();
  if (tab === 'movimentacoes') {
    document.getElementById('estPanelContagem').style.display = 'none';
    document.getElementById('estPanelMovimentacoes').style.display = '';
    _renderMovimentacoes();
  } else {
    document.getElementById('estPanelContagem').style.display = '';
    document.getElementById('estPanelMovimentacoes').style.display = 'none';
    _renderContagemTab();
  }
}

function _atualizarEstTabs() {
  ['contagem','movimentacoes'].forEach(t => {
    document.getElementById(`estTab-${t}`)?.classList.toggle('active', _estTab === t);
  });
  const btnImport = document.getElementById('estBtnImport');
  if (btnImport) btnImport.style.display = _estTab === 'contagem' ? 'flex' : 'none';
}

// ── Ícone por categoria ───────────────────────────────────────
function _estIconCat(cat) {
  const m = {
    'Preparados':'chef-hat','Laticínios':'droplets','Carnes e Frios':'flame',
    'Carnes':'flame','Frios':'flame','Massas':'layers','Massas e Farinhas':'layers',
    'Molhos':'droplets','Molhos e Bases':'droplets','Molhos e Temperos':'droplets',
    'Embalagens':'box','Descartáveis':'box','Bebidas':'coffee',
    'Refrigerantes':'coffee','Doces':'star','Sobremesas':'star',
    'Hortifruti':'leaf','Horti-Fruti':'leaf','Vegetais':'leaf',
    'Higiene/Limpeza':'sparkles','Limpeza':'sparkles','Higiene':'sparkles',
    'Temperos':'tag','Temperos e Enlatados':'tag','Outros':'package',
  };
  if (m[cat]) return m[cat];
  const l = (cat||'').toLowerCase();
  for (const [k,v] of Object.entries(m)) {
    if (l.includes(k.toLowerCase()) || k.toLowerCase().includes(l)) return v;
  }
  return 'package';
}

// ── Render principal ──────────────────────────────────────────
function _renderContagemTab() {
  const el = document.getElementById('estPanelContagem');
  if (!el) return;
  if (_contagemAtiva) _renderContagemAtiva(el);
  else                _renderCatCards(el);
}

// ── Cards de categoria ────────────────────────────────────────
function _renderCatCards(el) {
  if (!el) el = document.getElementById('estPanelContagem');
  if (!el) {
    console.error('[_renderCatCards] estPanelContagem não encontrado!');
    return;
  }
  // Diagnóstico: força visibilidade do elemento e seus pais
  el.style.display = 'block';
  el.style.minHeight = '300px';
  let p = el.parentElement;
  while (p && p !== document.body) {
    if (getComputedStyle(p).display === 'none') {
      console.error('[_renderCatCards] pai com display:none:', p.id || p.className);
      p.style.display = 'block';
    }
    p = p.parentElement;
  }
  console.log('[_renderCatCards] el encontrado, items:', typeof items !== 'undefined' ? items.length : 'undefined');

  const allItems   = typeof items !== 'undefined' ? items : [];
  const allCats    = [...new Set(allItems.map(i => i.cat || 'Outros'))].filter(Boolean).sort();
  const ultimaMapa = _ultimaContagemPorItem();

  const totalSel = [..._catsSelecionadas].reduce((s,c) =>
    s + allItems.filter(i => (i.cat||'Outros') === c).length, 0);

  // Constrói HTML sem inline onclick — usa data-cat para delegate
  let cardsHtml = '';
  allCats.forEach(cat => {
    const count   = allItems.filter(i => (i.cat||'Outros') === cat).length;
    const sel     = _catsSelecionadas.has(cat);
    const icon    = _estIconCat(cat);

    // Última contagem e divergências
    const catItems = allItems.filter(i => (i.cat||'Outros') === cat);
    const datas    = catItems.map(i => ultimaMapa[i.id]?.date).filter(Boolean).sort().reverse();
    const ultima   = datas[0] || null;
    const diverg   = catItems.filter(i => { const u = ultimaMapa[i.id]; return u && Math.abs(u.diverg||0) > 0.001; }).length;

    let ultimaLabel = 'Nunca contada';
    if (ultima) {
      const d = Math.floor((Date.now() - new Date(ultima)) / 864e5);
      ultimaLabel = d === 0 ? 'hoje' : d === 1 ? 'ontem' : d + 'd atrás';
      if (diverg > 0) ultimaLabel = diverg + ' diverg. · ' + ultimaLabel;
    }

    const checkHtml = sel
      ? '<span style="position:absolute;top:8px;right:8px;width:18px;height:18px;background:var(--purple);border-radius:50%;display:flex;align-items:center;justify-content:center">' + lc('check',10,'#fff') + '</span>'
      : '';

    cardsHtml += `
      <button data-cat="${cat.replace(/"/g,'&quot;')}" style="display:flex;flex-direction:column;align-items:center;padding:16px 10px;border-radius:var(--r12);
          border:2px solid ${sel ? 'var(--purple)' : 'var(--border)'};
          background:${sel ? 'var(--purple-xlight)' : 'var(--surface)'};
          cursor:pointer;text-align:center;gap:8px;transition:all .15s;
          min-height:110px;font-family:Inter,sans-serif;position:relative;width:100%">
        ${checkHtml}
        <div style="width:44px;height:44px;border-radius:50%;background:${sel ? 'var(--purple)' : 'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s">
          ${lc(icon, 20, sel ? '#fff' : 'var(--muted)')}
        </div>
        <div style="font-size:var(--text-xs);font-weight:700;color:${sel ? 'var(--purple)' : 'var(--text)'};line-height:1.2">${cat}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">${count} ${count === 1 ? 'item' : 'itens'}</div>
        <div style="font-size:.62rem;color:${diverg > 0 ? 'var(--orange-dark)' : 'var(--muted)'}">${ultimaLabel}</div>
      </button>`;
  });

  const nCats = _catsSelecionadas.size;
  // Passa as categorias como data-attribute para evitar dependência de escopo no onclick
  const catsEncoded = [..._catsSelecionadas].map(c => encodeURIComponent(c)).join(',');
  const barHtml = nCats > 0 ? `
    <div style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px;background:var(--surface);border-top:1.5px solid var(--border);
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        box-shadow:0 -4px 16px rgba(0,0,0,.08);z-index:100" id="ctgBarFix">
      <div style="font-size:var(--text-sm);color:var(--text2)">
        <strong style="color:var(--purple)">${nCats}</strong> categoria${nCats > 1 ? 's' : ''} ·
        <strong>${totalSel}</strong> itens
      </div>
      <button id="ctgBtnIniciar" data-cats="${catsEncoded}"
        style="padding:11px 20px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);
          font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;white-space:nowrap;min-height:44px">
        ${lc('play-circle',15,'#fff')} Iniciar contagem
      </button>
    </div>` : '';

  el.innerHTML = `
    <div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${lc('clipboard-list',16,'var(--purple)')} Contagem de Estoque</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Selecione uma ou mais categorias para contar</div>
        </div>
        <button onclick="verHistoricoContagens()"
          style="display:flex;align-items:center;gap:5px;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface);font-size:var(--text-xs);font-weight:600;cursor:pointer;color:var(--text2);min-height:40px">
          ${lc('clock',13,'currentColor')} Histórico
        </button>
      </div>
      <div id="catGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:${_catsSelecionadas.size > 0 ? '72px' : '8px'}">
        ${cardsHtml}
      </div>
    </div>
    ${barHtml}`;

  // Botão iniciar: lê categorias do data-cats (evita dependência de escopo)
  const btnIniciar = document.getElementById('ctgBtnIniciar');
  if (btnIniciar) {
    btnIniciar.addEventListener('click', function() {
      const cats = (this.getAttribute('data-cats') || '')
        .split(',').filter(Boolean).map(c => decodeURIComponent(c));
      if (cats.length === 0) { toast('Selecione pelo menos uma categoria', 'err'); return; }
      _contagemAtiva      = true;
      _categoriasContando = cats;
      _catsSelecionadas   = new Set();
      _contagem           = {};
      _renderContagemAtiva();
    });
  }

  // Delegação: qualquer clique num card com data-cat
  el.querySelector('#catGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    const cat = btn.getAttribute('data-cat');
    if (!cat) return;
    if (_catsSelecionadas.has(cat)) _catsSelecionadas.delete(cat);
    else _catsSelecionadas.add(cat);
    _renderCatCards(el);
  });
}

function _toggleCatSel(cat) {
  if (_catsSelecionadas.has(cat)) _catsSelecionadas.delete(cat);
  else _catsSelecionadas.add(cat);
  _renderCatCards(document.getElementById('estPanelContagem'));
}

function _iniciarContagem() {
  if (_catsSelecionadas.size === 0) { toast('Selecione pelo menos uma categoria', 'err'); return; }
  _contagemAtiva      = true;
  _categoriasContando = [..._catsSelecionadas];
  _catsSelecionadas   = new Set();
  _contagem           = {};
  _renderContagemAtiva();
}
window._iniciarContagem = _iniciarContagem;

function _renderContagemAtiva() {
  const el = document.getElementById('estPanelContagem');
  if (!el) return;

  const allItems = typeof items !== 'undefined' ? items : [];
  const todosItens = [];
  _categoriasContando.forEach(cat => {
    allItems.filter(i => (i.cat||'Outros') === cat).forEach(i => todosItens.push(i));
  });

  const total    = todosItens.length;
  const contados = Object.keys(_contagem).length;
  const pct      = total > 0 ? Math.round(contados / total * 100) : 0;
  const titulo   = _categoriasContando.length === 1 ? _categoriasContando[0] : _categoriasContando.length + ' categorias';

  // Header fixo
  let html = '<div style="background:var(--surface);border-bottom:2px solid var(--border);padding:12px 16px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
  html += '<button onclick="cancelarContagem()" style="padding:8px 14px;background:none;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;color:var(--muted);min-height:40px;">← Cancelar</button>';
  html += '<div style="flex:1;text-align:center;"><div style="font-size:14px;font-weight:800;">' + titulo + '</div>';
  html += '<div id="estContagemProg" style="font-size:11px;color:gray;">' + contados + '/' + total + ' contados</div></div>';
  html += '<div style="font-size:13px;font-weight:800;color:purple;">' + pct + '%</div>';
  html += '</div>';
  html += '<div style="height:4px;background:#eee;border-radius:4px;">';
  html += '<div id="estContagemBar" style="height:100%;width:' + pct + '%;background:purple;border-radius:4px;transition:width .3s;"></div></div>';
  html += '</div>';

  // Itens
  html += '<div style="padding-bottom:80px;">';
  _categoriasContando.forEach(function(cat) {
    var catItems = allItems.filter(function(i) { return (i.cat||'Outros') === cat; });
    html += '<div style="padding:10px 16px 6px;background:#f0ebff;border-bottom:1px solid #ddd;font-size:12px;font-weight:800;text-transform:uppercase;color:purple;">' + cat + ' (' + catItems.length + ' itens)</div>';
    catItems.forEach(function(item, idx) {
      var val = _contagem[item.id];
      var preenchido = val !== undefined;
      var bg = preenchido ? '#ede9fe' : (idx%2===0 ? '#fff' : '#fafafa');
      var valStr = preenchido ? String(val) : '';
      html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #eee;background:' + bg + ';">';
      html += '<div style="flex:1;"><div style="font-size:14px;font-weight:600;">' + item.name + '</div>';
      html += '<div style="font-size:11px;color:gray;">CW: ' + fmt(item.qty) + ' ' + item.unit + '</div></div>';
      html += '<input type="number" inputmode="decimal" min="0" step="0.001"';
      html += ' data-item="' + item.id + '"';
      html += ' value="' + valStr + '"';
      html += ' placeholder="—"';
      html += ' style="width:88px;height:48px;padding:0 8px;border:2px solid ' + (preenchido?'purple':'#ddd') + ';border-radius:8px;font-size:16px;font-weight:700;text-align:center;"';
      html += ' onfocus="this.select()">';
      html += '<span style="font-size:12px;color:gray;">' + item.unit + '</span>';
      html += '</div>';
    });
  });
  html += '</div>';

  // Botão concluir fixo
  html += '<div style="position:fixed;bottom:0;left:60px;right:0;padding:12px 16px;background:white;border-top:2px solid #eee;z-index:50;">';
  html += '<button onclick="concluirContagemEstoque()" style="width:100%;padding:14px;background:' + (contados>0?'#16a34a':'#ddd') + ';color:' + (contados>0?'#fff':'#999') + ';border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">';
  html += 'Concluir' + (contados>0?' · '+contados+' itens':'') + '</button></div>';

  el.innerHTML = html;

  // Input handler via delegation
  el.addEventListener('input', function(e) {
    if (e.target.tagName === 'INPUT' && e.target.getAttribute('data-item')) {
      _setCont(parseInt(e.target.getAttribute('data-item')), e.target.value);
    }
  });
}



function _setCont(itemId, val) {
  if (val === '' || val === null) delete _contagem[itemId];
  else {
    const v = parseFloat(val);
    if (!isNaN(v) && v >= 0) _contagem[itemId] = parseFloat(v.toFixed(3));
  }
  // Atualiza visual do input
  const inp = document.querySelector(`input[data-item="${itemId}"]`);
  if (inp) {
    const preenchido = _contagem[itemId] !== undefined;
    inp.style.borderColor = preenchido ? 'var(--purple)' : 'var(--border)';
    inp.style.background  = preenchido ? '#fff' : 'var(--surface)';
    const row = inp.closest('div[style*="display:flex"]');
    if (row) row.style.background = preenchido ? 'var(--purple-xlight)' : '';
  }
  // Atualiza progresso
  const total    = _categoriasContando.reduce((s,c) =>
    s + (typeof items !== 'undefined' ? items : []).filter(i => (i.cat||'Outros') === c).length, 0);
  const contados = Object.keys(_contagem).length;
  const pct      = total > 0 ? Math.round(contados/total*100) : 0;
  const progEl = document.getElementById('estContagemProg');
  const barEl  = document.getElementById('estContagemBar');
  if (progEl) progEl.textContent = `${contados}/${total} contados`;
  if (barEl)  barEl.style.width  = `${pct}%`;
  // Atualiza botão de concluir
  const btn = document.getElementById('btnConcluirContagem');
  if (btn) {
    btn.style.background = contados > 0 ? 'var(--green)' : 'var(--border)';
    btn.style.color      = contados > 0 ? '#fff' : 'var(--muted)';
    btn.innerHTML = `${lc('check-circle',16, contados > 0 ? '#fff' : 'var(--muted)')} Concluir${contados > 0 ? ' · ' + contados + ' itens' : ''}`;
  }
}

// setFisico: alias mantido para compatibilidade
function setFisico(itemId, val) { _setCont(itemId, val); }

function cancelarContagem() {
  vtpConfirm({
    title: 'Cancelar contagem',
    message: 'Os dados digitados não serão salvos.',
    confirmLabel: 'Cancelar contagem',
    onConfirm: () => {
      _contagem           = {};
      _contagemAtiva      = false;
      _categoriasContando = [];
      
      _renderCatCards(document.getElementById('estPanelContagem'));
    }
  });
}

function concluirContagemEstoque() {
  const contados = Object.keys(_contagem).length;
  if (contados === 0) { toast('Digite pelo menos uma quantidade antes de concluir.', 'err'); return; }

  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  // Monta snapshot apenas dos itens contados (nas categorias selecionadas)
  const todosCatItems = _categoriasContando.flatMap(cat =>
    items.filter(i => (i.cat||'Outros') === cat)
  );

  const snapshot = todosCatItems.map(i => ({
    id:         i.id,
    name:       i.name,
    unit:       i.unit,
    cat:        i.cat,
    debitoAuto: !!i.debitoAuto,
    digital:    i.qty,
    fisico:     _contagem[i.id] ?? null,
    diverg:     _contagem[i.id] !== undefined ? parseFloat((_contagem[i.id] - i.qty).toFixed(3)) : null,
    min:        i.min,
    ideal:      i.ideal,
  })).filter(x => x.fisico !== null);

  const hist = _getHistContagens();
  const novaContagem = {
    id:          `CNT-${String(hist.length+1).padStart(4,'0')}`,
    date:        new Date().toISOString(),
    categorias:  _categoriasContando,
    user:        u?.name || 'Sistema',
    total:       contados,
    divergs:     snapshot.filter(x => Math.abs(x.diverg) > 0.001).length,
    itens:       snapshot,
  };
  hist.push(novaContagem);
  _saveHistContagens(hist);

  _contagem           = {};
  _contagemAtiva      = false;
  _categoriasContando = [];
  

  _abrirResumoPosContagem(novaContagem);
}


// ── Resumo inteligente pós-contagem ──────────────────────────
function _abrirResumoPosContagem(contagem) {
  const cfg       = typeof getConfig === 'function' ? getConfig() : {};
  const tolerancia = parseFloat(cfg.toleranciaDiverg ?? 10) / 100; // ex: 0.10

  // Data da contagem anterior para buscar desperdícios no período
  const hist       = _getHistContagens();
  const anterior   = [...hist].sort((a,b) => new Date(b.date)-new Date(a.date))[1]; // segunda mais recente
  const dataAnterior = anterior ? anterior.date.slice(0,10) : null;
  const dataHoje     = contagem.date.slice(0,10);

  // Desperdícios registrados no VTP no período desde a última contagem
  const despsRaw = typeof desperdicios !== 'undefined' ? desperdicios : [];
  const despsPeriodo = despsRaw.filter(d => {
    if (!d.itemId) return false;
    const dDate = d.date || (d.createdAt||'').slice(0,10);
    if (dataAnterior && dDate < dataAnterior) return false;
    if (dDate > dataHoje) return false;
    return true;
  });

  // Classifica cada item com divergência
  const grupos = { ok: [], manual: [], varNormal: [], explicado: [], parcial: [], anomalia: [] };

  contagem.itens.forEach(x => {
    const divAbs = Math.abs(x.diverg ?? 0);
    if (divAbs <= 0.001) { grupos.ok.push(x); return; }

    // Soma desperdícios do item no período
    const despItem = despsPeriodo.filter(d => d.itemId === x.id);
    const qtdDesp  = despItem.reduce((s, d) => s + (parseFloat(d.qty) || 0), 0);
    const sobra    = parseFloat((divAbs - qtdDesp).toFixed(3));
    const pctDiv   = x.digital > 0 ? divAbs / x.digital : 0;

    x._despQty  = qtdDesp;
    x._sobra    = sobra;
    x._pctDiv   = pctDiv;
    x._despDocs = despItem;

    if (!x.debitoAuto) {
      // Item manual → sempre precisa atualizar CW (seja qual for a causa)
      grupos.manual.push(x);
    } else if (qtdDesp > 0 && sobra <= 0.001) {
      // Divergência totalmente explicada pelo desperdício registrado no VTP
      grupos.explicado.push(x);
    } else if (qtdDesp > 0 && sobra > 0.001) {
      // Desperdício explica parte — resto é anomalia
      grupos.parcial.push(x);
    } else if (pctDiv <= tolerancia) {
      // Sem desperdício, dentro da tolerância → variação normal da ficha técnica
      grupos.varNormal.push(x);
    } else {
      // Sem desperdício, acima da tolerância → anomalia real
      grupos.anomalia.push(x);
    }
  });

  const total = contagem.itens.length;
  const popup = document.createElement('div');
  popup.id = 'popupPosContagem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:650;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';

  const _secao = (icon, cor, titulo, lista, extra='') => {
    if (!lista.length) return '';
    return `
      <div style="border:1.5px solid ${cor}33;border-radius:var(--r10);overflow:hidden;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:${cor}11">
          <div style="display:flex;align-items:center;gap:7px;font-size:var(--text-sm);font-weight:700;color:${cor}">
            ${lc(icon,14,cor)} ${titulo}
          </div>
          <span style="background:${cor};color:#fff;border-radius:20px;padding:1px 9px;font-size:var(--text-xs);font-weight:800">${lista.length}</span>
        </div>
        ${extra}
        <div style="display:flex;flex-direction:column;gap:0">
          ${lista.map((x,i) => {
            const d = x.diverg > 0 ? `+${fmt(x.diverg)}` : fmt(x.diverg);
            const despInfo = x._despQty > 0
              ? `<span style="font-size:var(--text-2xs);color:var(--muted)"> · ${lc('trash-2',9,'currentColor')} Desp. registrado: ${fmt(x._despQty)} ${x.unit}</span>`
              : '';
            const sobraInfo = x._sobra > 0.001
              ? `<span style="font-size:var(--text-2xs);color:var(--red)"> · Saldo não explicado: ${fmt(x._sobra)} ${x.unit}</span>`
              : '';
            return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:${i>0?'1px solid var(--border)':'none'};gap:8px;flex-wrap:wrap">
              <div style="min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600">${x.name}</div>
                <div style="font-size:var(--text-xs);color:var(--muted)">CW: ${fmt(x.digital)} → Físico: ${fmt(x.fisico)} ${x.unit}${despInfo}${sobraInfo}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                <span style="font-family:monospace;font-weight:700;font-size:var(--text-sm);color:${x.diverg<0?'var(--red)':'var(--green)'}">
                  ${d} ${x.unit}
                </span>
                ${!x.debitoAuto ? `<button onclick="_marcarAtualizouCW(this,'${contagem.id}',${x.id})"
                  style="font-size:var(--text-2xs);padding:3px 8px;border:1px solid var(--muted);border-radius:var(--r6);background:var(--surface);cursor:pointer;color:var(--text2)">
                  ✓ Atualizei CW
                </button>` : ''}
                ${(grupos.anomalia.includes(x) || grupos.parcial.includes(x)) ? `<button onclick="_registrarDesperdicioDiverg(${x.id},${Math.abs(x._sobra||x.diverg)})"
                  style="font-size:var(--text-2xs);padding:3px 8px;border:1px solid var(--red);border-radius:var(--r6);background:var(--red-light);cursor:pointer;color:var(--red)">
                  + Registrar desperdício
                </button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:680px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <!-- Header -->
      <div style="padding:18px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--text-md);font-weight:800">${lc('check-circle',16,'var(--purple)')} Contagem concluída!</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${contagem.id} · ${total} itens contados · por ${contagem.user}</div>
        </div>
        <button onclick="document.getElementById('popupPosContagem').remove();renderEstoque()"
          style="background:none;border:none;cursor:pointer;padding:6px">${lc('x',18,'var(--muted)')}</button>
      </div>

      <!-- Resumo em chips -->
      <div style="padding:14px 20px;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1.5px solid var(--border)">
        ${grupos.ok.length       ? `<span style="padding:4px 12px;border-radius:20px;background:var(--green-light);border:1px solid var(--green);font-size:var(--text-xs);font-weight:700;color:var(--green)">${lc('check-circle',11,'currentColor')} OK sem divergência: ${grupos.ok.length}</span>` : ''}
        ${grupos.varNormal.length ? `<span style="padding:4px 12px;border-radius:20px;background:var(--surface2);border:1px solid var(--border);font-size:var(--text-xs);font-weight:700;color:var(--muted)">${lc('minus-circle',11,'currentColor')} Variação normal: ${grupos.varNormal.length}</span>` : ''}
        ${grupos.explicado.length ? `<span style="padding:4px 12px;border-radius:20px;background:var(--green-light);border:1px solid var(--green);font-size:var(--text-xs);font-weight:700;color:var(--green)">${lc('clipboard',11,'currentColor')} Explicado por desperdício: ${grupos.explicado.length}</span>` : ''}
        ${grupos.parcial.length   ? `<span style="padding:4px 12px;border-radius:20px;background:var(--yellow-light);border:1px solid var(--yellow);font-size:var(--text-xs);font-weight:700;color:var(--orange-dark)">${lc('alert-triangle',11,'currentColor')} Parcialmente explicado: ${grupos.parcial.length}</span>` : ''}
        ${grupos.manual.length    ? `<span style="padding:4px 12px;border-radius:20px;background:#FEF3C7;border:1px solid #FCD34D;font-size:var(--text-xs);font-weight:700;color:#D97706">${lc('refresh-cw',11,'currentColor')} Atualizar no CW: ${grupos.manual.length}</span>` : ''}
        ${grupos.anomalia.length  ? `<span style="padding:4px 12px;border-radius:20px;background:var(--red-light);border:1px solid var(--red);font-size:var(--text-xs);font-weight:700;color:var(--red)">${lc('alert-circle',11,'currentColor')} Anomalia — investigar: ${grupos.anomalia.length}</span>` : ''}
      </div>

      <!-- Detalhes por grupo -->
      <div style="padding:16px 20px;max-height:55vh;overflow-y:auto">

        ${_secao('alert-circle','var(--red)','Anomalia — Investigar',grupos.anomalia,
          `<div style="padding:6px 14px;background:var(--red-light);font-size:var(--text-xs);color:var(--red)">
            ${lc('info',10,'currentColor')} Débito automático no CW, divergência acima de ${Math.round(tolerancia*100)}% e sem desperdício registrado. Pode ser sumiço, perda não registrada ou erro de ficha técnica.
          </div>`)}

        ${_secao('alert-triangle','var(--orange-dark)','Parcialmente Explicado por Desperdício',grupos.parcial,
          `<div style="padding:6px 14px;background:var(--yellow-light);font-size:var(--text-xs);color:var(--orange-dark)">
            ${lc('info',10,'currentColor')} O desperdício registrado no VTP explica parte da diferença. Há um saldo não explicado que pode ser anomalia.
          </div>`)}

        ${_secao('refresh-cw','#D97706','Atualizar no Cardápio Web',grupos.manual,
          `<div style="padding:6px 14px;background:#FEF3C7;font-size:var(--text-xs);color:#D97706">
            ${lc('info',10,'currentColor')} Estes itens são de débito manual no CW. Atualize as quantidades no Cardápio Web e marque como feito.
          </div>`)}

        ${_secao('clipboard','var(--green)','Explicado por Desperdício no VTP',grupos.explicado)}
        ${_secao('minus-circle','var(--muted)','Variação Normal (dentro da tolerância)',grupos.varNormal)}
        ${_secao('check-circle','var(--green)','Sem Divergência',grupos.ok.slice(0,5))}
        ${grupos.ok.length > 5 ? `<div style="text-align:center;font-size:var(--text-xs);color:var(--muted);padding:4px">+${grupos.ok.length-5} itens sem divergência</div>` : ''}
      </div>

      <!-- Rodapé -->
      <div style="padding:14px 20px;border-top:1.5px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button onclick="_enviarResumoWA('${contagem.id}')"
          style="padding:9px 16px;background:#25D366;color:#fff;border:none;border-radius:var(--r8);font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">
          ${lc('message-circle',14,'#fff')} Enviar resumo WA
        </button>
        <button onclick="document.getElementById('popupPosContagem').remove();renderEstoque()"
          style="padding:9px 16px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);font-size:var(--text-sm);font-weight:700;cursor:pointer">
          Fechar
        </button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) { popup.remove(); renderEstoque(); } });
}

function _marcarAtualizouCW(btn, contagemId, itemId) {
  btn.textContent  = '✓ Feito!';
  btn.style.background    = 'var(--green-light)';
  btn.style.borderColor   = 'var(--green)';
  btn.style.color         = 'var(--green)';
  btn.disabled = true;
}

function _registrarDesperdicioDiverg(itemId, qty) {
  document.getElementById('popupPosContagem')?.remove();
  renderEstoque();
  // Abre modal de desperdício pré-preenchido
  if (typeof abrirDesperdicio === 'function') {
    setTimeout(() => abrirDesperdicio({ itemId, qty }), 300);
  } else {
    toast('Vá ao módulo Desperdício para registrar a perda.', 'info');
  }
}

function _enviarResumoWA(contagemId) {
  const hist = _getHistContagens();
  const c    = hist.find(x => x.id === contagemId);
  if (!c) return;
  const cfg  = typeof getConfig === 'function' ? getConfig() : {};
  const tolerancia = parseFloat(cfg.toleranciaDiverg ?? 10) / 100;

  const divs  = c.itens.filter(x => Math.abs(x.diverg ?? 0) > 0.001);
  const anom  = divs.filter(x => x.debitoAuto && (x.digital > 0 ? Math.abs(x.diverg)/x.digital : 0) > tolerancia);

  let msg = `📋 *Contagem de Estoque — ${fmtD(c.date)}*\n`;
  msg    += `Por: ${c.user}\n`;
  msg    += `Total: ${c.total} itens · ${divs.length} divergências\n\n`;

  if (anom.length) {
    msg += `🔴 *Anomalias a investigar:*\n`;
    anom.forEach(x => { msg += `• ${x.name}: CW ${fmt(x.digital)} → Físico ${fmt(x.fisico)} ${x.unit} (${x.diverg > 0 ? '+' : ''}${fmt(x.diverg)})\n`; });
    msg += '\n';
  }

  const manuais = divs.filter(x => !x.debitoAuto);
  if (manuais.length) {
    msg += `🟡 *Atualizar no Cardápio Web:*\n`;
    manuais.forEach(x => { msg += `• ${x.name}: CW ${fmt(x.digital)} → Físico ${fmt(x.fisico)} ${x.unit}\n`; });
  }

  const waNum = cfg.whatsapp || '';
  const url   = `https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ── Histórico de contagens ────────────────────────────────────
function verHistoricoContagens() {
  const hist  = _getHistContagens();
  const popup = document.createElement('div');
  popup.id = 'popupHistContagem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto';

  const _catChips = (cats) => {
    if (!cats?.length) return '';
    return (Array.isArray(cats) ? cats : [cats]).map(c =>
      `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--purple-xlight);color:var(--purple);border:1px solid var(--purple-light)">${c}</span>`
    ).join('');
  };

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:720px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0;position:sticky;top:0;z-index:1">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${lc('clock',16,'var(--purple)')} Histórico de Contagens</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${hist.length} contagem(ns) · todas as categorias</div>
        </div>
        <button onclick="document.getElementById('popupHistContagem').remove()"
          style="background:none;border:none;cursor:pointer;padding:8px;min-height:44px;min-width:44px;display:flex;align-items:center;justify-content:center">
          ${lc('x',20,'var(--muted)')}
        </button>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;max-height:75vh;overflow-y:auto">
        ${hist.length === 0
          ? `<div style="text-align:center;padding:40px;color:var(--muted);font-size:var(--text-sm)">Nenhuma contagem registrada ainda.</div>`
          : [...hist].reverse().map(c => {
              const cats    = c.categorias || (c.tipo ? [c.tipo] : ['—']);
              const divs    = (c.itens||[]).filter(x => Math.abs(x.diverg||0) > 0.001);
              const temDiv  = divs.length > 0;
              return `
              <div style="border:1.5px solid ${temDiv ? 'var(--yellow)' : 'var(--border)'};border-radius:var(--r10);overflow:hidden;background:var(--surface)">
                <div style="padding:12px 14px;background:${temDiv ? 'var(--yellow-light)' : 'var(--surface2)'};display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
                  <div>
                    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:4px">${fmtDT(c.date)} · ${c.user}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px">${_catChips(cats)}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                    <div style="text-align:center;padding:4px 8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
                      <div style="font-size:var(--text-md);font-weight:800;color:var(--purple)">${c.total}</div>
                      <div style="font-size:var(--text-2xs);color:var(--muted)">contados</div>
                    </div>
                    <div style="text-align:center;padding:4px 8px;background:${temDiv?'var(--yellow-light)':'var(--green-light)'};border:1px solid ${temDiv?'var(--yellow)':'var(--green)'};border-radius:var(--r6)">
                      <div style="font-size:var(--text-md);font-weight:800;color:${temDiv?'var(--orange-dark)':'var(--green)'}">${divs.length}</div>
                      <div style="font-size:var(--text-2xs);color:var(--muted)">diverg.</div>
                    </div>
                  </div>
                </div>
                <div style="padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap">
                  <button onclick="abrirDetalheContagem('${c.id}')"
                    style="flex:1;min-width:100px;padding:8px;border:1.5px solid var(--purple);border-radius:var(--r8);background:var(--surface);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;min-height:40px">
                    ${lc('search',12,'currentColor')} Ver detalhe
                  </button>
                  <button onclick="_gerarPDFContagem('${c.id}')"
                    style="flex:1;min-width:100px;padding:8px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface);color:var(--text2);font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;min-height:40px">
                    ${lc('printer',12,'currentColor')} Imprimir / PDF
                  </button>
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

function abrirDetalheContagem(id) {
  const hist = _getHistContagens();
  const c    = hist.find(x => x.id === id);
  if (!c) return;

  const cats    = c.categorias || (c.tipo ? [c.tipo] : ['—']);
  const divItems = (c.itens||[]).filter(x => Math.abs(x.diverg||0) > 0.001);
  const okItems  = (c.itens||[]).filter(x => Math.abs(x.diverg||0) <= 0.001);

  const popup2 = document.createElement('div');
  popup2.id = 'popupDetalheContagem';
  popup2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:flex-start;justify-content:center;padding:12px;overflow-y:auto';

  popup2.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:680px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${c.id} — Detalhe</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${fmtDT(c.date)} · ${c.user}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
            ${cats.map(cat => `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:var(--purple);color:#fff">${cat}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button onclick="_gerarPDFContagem('${c.id}')"
            style="padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface);color:var(--text2);font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;min-height:40px">
            ${lc('printer',12,'currentColor')} PDF
          </button>
          <button onclick="document.getElementById('popupDetalheContagem').remove()"
            style="background:none;border:none;cursor:pointer;padding:8px;min-height:44px;display:flex;align-items:center">
            ${lc('x',18,'var(--muted)')}
          </button>
        </div>
      </div>
      <div style="padding:16px 20px;max-height:65vh;overflow-y:auto">
        ${divItems.length > 0 ? `
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--orange-dark);margin-bottom:8px">
            ${lc('alert-triangle',12,'var(--orange-dark)')} Divergências (${divItems.length})
          </div>
          <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:16px;overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;min-width:400px">
              <thead><tr style="background:var(--surface2)">
                <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Item</th>
                <th style="padding:8px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">CW</th>
                <th style="padding:8px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Físico</th>
                <th style="padding:8px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Dif.</th>
                <th style="padding:8px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">%</th>
              </tr></thead>
              <tbody>
                ${divItems.map((x,idx) => {
                  const pct = x.digital > 0 ? ((x.diverg/x.digital)*100).toFixed(1) : '—';
                  return `<tr style="border-top:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:7px 12px">
                      <div style="font-size:var(--text-sm);font-weight:600">${x.name}</div>
                      <div style="font-size:var(--text-2xs);color:var(--muted)">${x.cat}</div>
                    </td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm)">${fmt(x.digital)}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm)">${fmt(x.fisico)}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm);font-weight:700;color:${x.diverg<0?'var(--red)':'var(--green)'}">${x.diverg>0?'+':''}${fmt(x.diverg)} ${x.unit}</td>
                    <td style="padding:7px 12px;text-align:center;font-size:var(--text-sm);font-weight:600;color:${x.diverg<0?'var(--red)':'var(--green)'}">${x.diverg>0?'+':''}${pct}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `
          <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:12px;text-align:center;margin-bottom:16px;font-size:var(--text-sm);font-weight:600;color:var(--green)">
            ${lc('check-circle',14,'currentColor')} Nenhuma divergência nesta contagem!
          </div>`}
        ${okItems.length > 0 ? `
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:8px">
            ${lc('check-circle',12,'var(--green)')} OK (${okItems.length})
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${okItems.map(x => `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:20px;background:var(--green-light);color:var(--green);border:1px solid var(--green)">${x.name}: ${fmt(x.fisico)} ${x.unit}</span>`).join('')}
          </div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(popup2);
  popup2.addEventListener('click', e => { if(e.target===popup2) popup2.remove(); });
}

// ── Gerador de PDF ────────────────────────────────────────────
function _gerarPDFContagem(id) {
  const hist = _getHistContagens();
  const c    = hist.find(x => x.id === id);
  if (!c) return;

  const cfg  = typeof getConfig === 'function' ? getConfig() : {};
  const tolerancia = parseFloat(cfg.toleranciaDiverg ?? 10) / 100;
  const cats = c.categorias || [c.tipo || '—'];
  const nowStr = new Date().toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });

  // Grupos de divergência
  const despsRaw = typeof desperdicios !== 'undefined' ? desperdicios : [];
  function classificar(x) {
    const divAbs = Math.abs(x.diverg ?? 0);
    if (divAbs <= 0.001) return 'ok';
    const despQty = despsRaw.filter(d => d.itemId === x.id).reduce((s,d) => s+(parseFloat(d.qty)||0), 0);
    if (!x.debitoAuto) return 'manual';
    const pct = x.digital > 0 ? divAbs/x.digital : 0;
    if (despQty > 0 && (divAbs - despQty) <= 0.001) return 'explicado';
    if (pct <= tolerancia) return 'normal';
    return 'anomalia';
  }

  const acao = { ok:'✅ OK', manual:'📋 Atualizar CW', explicado:'✅ Desperdício', normal:'📊 Variação normal', anomalia:'⚠️ Investigar' };

  // Agrupa por categoria
  const byCat = {};
  c.itens.forEach(x => { if (!byCat[x.cat]) byCat[x.cat]=[]; byCat[x.cat].push(x); });

  const rows = Object.entries(byCat).map(([cat, catItens]) => `
    <tr><td colspan="6" style="background:#EDE9FE;padding:8px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#6B21D4;border-top:2px solid #C4B5FD">${cat}</td></tr>
    ${catItens.map(x => {
      const cl = classificar(x);
      const divColor = x.diverg < 0 ? '#DC2626' : x.diverg > 0 ? '#16A34A' : '#666';
      return `<tr style="border-bottom:1px solid #E5DEFF">
        <td style="padding:7px 12px;font-weight:600">${x.name}</td>
        <td style="padding:7px 8px;text-align:center;font-family:monospace">${x.unit}</td>
        <td style="padding:7px 8px;text-align:center;font-family:monospace">${fmt(x.digital)}</td>
        <td style="padding:7px 8px;text-align:center;font-family:monospace;font-weight:700">${fmt(x.fisico)}</td>
        <td style="padding:7px 8px;text-align:center;font-family:monospace;font-weight:700;color:${divColor}">${x.diverg>0?'+':''}${fmt(x.diverg)}</td>
        <td style="padding:7px 10px;font-size:11px;font-weight:700;color:${cl==='anomalia'?'#DC2626':cl==='manual'?'#D97706':'#16A34A'}">${acao[cl]||'—'}</td>
      </tr>`;
    }).join('')}
  `).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Contagem de Estoque — Vai Ter Pizza!</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1a0a2e;background:#fff;padding:20px;font-size:13px}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #6B21D4;padding-bottom:12px;margin-bottom:16px}
    .logo-text{font-size:1rem;font-weight:800;color:#6B21D4}
    .logo-sub{font-size:11px;color:#9B91B8;margin-top:2px}
    .cats{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
    .cat-chip{padding:3px 10px;border-radius:20px;background:#EDE9FE;color:#6B21D4;font-size:11px;font-weight:700;border:1px solid #C4B5FD}
    .summary{display:grid;grid-template-columns:repeat(4,auto);gap:16px;background:#F5F3FF;border:1.5px solid #E5DEFF;border-radius:8px;padding:10px 14px;margin-bottom:16px}
    .sum-val{font-size:1.1rem;font-weight:800;color:#6B21D4}
    .sum-lbl{font-size:10px;color:#9B91B8;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:#6B21D4;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
    thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:center}
    tbody tr:nth-child(even){background:#F5F3FF}
    .footer{margin-top:20px;border-top:1px solid #E5DEFF;padding-top:8px;font-size:11px;color:#9B91B8;display:flex;justify-content:space-between}
    @media print{body{padding:10px}@page{size:A4;margin:15mm}}
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo-text">Vai Ter Pizza!</div>
      <div class="logo-sub">Sistema de Operação · Contagem de Estoque</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#9B91B8">
      <strong>${c.id}</strong><br>
      ${fmtDT(c.date)}<br>
      por <strong>${c.user}</strong><br>
      Gerado em ${nowStr}
    </div>
  </div>
  <div class="cats">${cats.map(cat => `<span class="cat-chip">${cat}</span>`).join('')}</div>
  <div class="summary">
    <div><div class="sum-val">${c.total}</div><div class="sum-lbl">Contados</div></div>
    <div><div class="sum-val" style="color:${c.divergs>0?'#D97706':'#16A34A'}">${c.divergs}</div><div class="sum-lbl">Divergências</div></div>
    <div><div class="sum-val">${cats.length}</div><div class="sum-lbl">Categoria${cats.length>1?'s':''}</div></div>
    <div><div class="sum-val">${Math.round(tolerancia*100)}%</div><div class="sum-lbl">Tolerância</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Item</th><th>Un.</th><th>CW (Digital)</th><th>Físico</th><th>Diferença</th><th>Ação</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <span>Vai Ter Pizza! · Contagem de Estoque</span>
    <span>Impresso em ${nowStr}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else toast('Permita popups para gerar o PDF', 'warn');
}

// ── Compatibilidade (funções removidas mas chamadas em algum lugar) ──
function setModoContagem(modo) { /* removido — contagem agora é por categoria */ }
function iniciarContagemEstoque() { /* removido */ }
function cancelarContagemEstoque() { cancelarContagem(); }
function setEstFiltro(status) {}
function setEstSearch(val) {}
function setEstCat(val) {}


// ── CSV Import (mantém lógica, atualiza digital) ──────────────
function openImportModal() {
  document.getElementById('ovImport').classList.add('open');
}

function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) parseCSV(file);
  document.getElementById('dropzone')?.classList.remove('drag');
}

function handleFile(inp) { if (inp.files[0]) parseCSV(inp.files[0]); }

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let text = e.target.result.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast('CSV inválido', 'err'); return; }

    const sep  = lines[0].includes(';') ? ';' : ',';
    const norm = s => s.trim().replace(/"/g,'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const header = lines[0].split(sep).map(norm);
    const col    = (...keys) => header.findIndex(h => keys.some(k => h.includes(norm(k))));

    const nameIdx = col('insumo','nome','produto');
    const codeIdx = col('cod. interno','codigo interno','cod interno','code');
    const qtyIdx  = col('estoque atual','atual','qty');
    const minIdx  = col('estoque minimo','minimo','min');
    const costIdx = col('preco de custo','custo','price');

    if (nameIdx === -1 && codeIdx === -1) {
      toast('CSV não reconhecido — verifique se é o relatório do Cardápio Web', 'err');
      return;
    }

    const parseMoney = v => parseFloat((v||'').replace(/[R$\s]/g,'').replace(',','.')) || 0;
    const parseNum   = v => parseFloat((v||'').replace(',','.'));

    importData = [];
    const naoEncontrados = [];

    lines.slice(1).forEach(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/"/g,''));
      const name = nameIdx >= 0 ? cols[nameIdx]||'' : '';
      const code = codeIdx >= 0 ? cols[codeIdx]||'' : '';
      const qty  = qtyIdx  >= 0 ? parseNum(cols[qtyIdx])  : NaN;
      const min  = minIdx  >= 0 ? parseNum(cols[minIdx])  : NaN;
      const cost = costIdx >= 0 ? parseMoney(cols[costIdx]): 0;

      if (!name && !code) return;
      if (isNaN(qty)) return;

      const item = items.find(i =>
        (code && i.code && i.code.toString() === code.toString()) ||
        (name && i.name.toLowerCase().trim() === name.toLowerCase().trim())
      );

      if (item) {
        importData.push({
          id:item.id, name:item.name,
          oldQty:item.qty, newQty:parseFloat(qty.toFixed(3)),
          oldMin:item.min, newMin:!isNaN(min)?parseFloat(min.toFixed(3)):item.min,
          oldCost:item.cost, newCost:cost > 0 ? cost : item.cost,
        });
      } else if (name) {
        naoEncontrados.push(name);
      }
    });

    const prev = document.getElementById('importPreview');
    if (!prev) return;

    if (!importData.length) {
      prev.innerHTML = `
        <div style="background:var(--red-light);border:1px solid #FCA5A5;border-radius:var(--r8);padding:12px;font-size:var(--text-sm);color:var(--red)">
          ${lc('alert-circle',14,'var(--red)')} Nenhum item encontrado. Verifique os códigos internos em Cadastros.
        </div>
        ${naoEncontrados.length ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px">${naoEncontrados.length} no CSV: ${naoEncontrados.slice(0,5).join(', ')}...</div>` : ''}`;
      return;
    }

    prev.innerHTML = `
      <div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px;margin-bottom:10px;font-size:var(--text-sm);color:var(--green);font-weight:600">
        ${lc('check-circle',13,'currentColor')} ${importData.length} itens reconhecidos — estoque digital será atualizado
      </div>
      <div style="background:var(--surface2);border-radius:var(--r6);padding:7px 10px;margin-bottom:10px;font-size:var(--text-xs);color:var(--muted)">
        ${lc('info',12,'currentColor')} O <strong>nome</strong> dos insumos nunca é alterado pela importação — permanece sempre o cadastrado no VTP App.
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${importData.map(d => {
          const diff = d.newQty - d.oldQty;
          const diffColor = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--muted)';
          const diffStr  = diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
          return `
          <div style="padding:7px 11px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
            <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:2px">${d.name}</div>
            <div style="display:flex;gap:12px;font-family:monospace;font-size:var(--text-xs);color:var(--muted)">
              <span>Qtd: <strong>${d.oldQty}</strong> → <strong style="color:var(--purple)">${d.newQty}</strong></span>
              <span style="color:${diffColor};font-weight:600">${diffStr}</span>
              ${Math.abs(d.newMin - d.oldMin) > 0.001 ? `<span>Mín: ${d.oldMin}→${d.newMin}</span>` : ''}
              ${d.newCost !== d.oldCost && d.newCost > 0 ? `<span style="color:var(--green)">Custo: R$${d.newCost}</span>` : ''}
            </div>
          </div>`;}).join('')}
      </div>
      ${naoEncontrados.length ? `
        <div style="font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-radius:var(--r6);padding:7px 10px;margin-bottom:10px">
          Não encontrados (${naoEncontrados.length}): ${naoEncontrados.slice(0,8).join(', ')}${naoEncontrados.length>8?'...':''}
        </div>` : ''}
      <button class="btn btn-primary" style="width:100%" onclick="confirmImport()">
        ${lc('check',14,'#fff')} Confirmar — atualizar digital
      </button>`;
  };
  reader.readAsText(file, 'UTF-8');
}

function confirmImport() {
  // Registra movimentações antes de alterar os itens
  registrarImportacaoCW(importData);

  // Regra: o NOME do insumo nunca é sobrescrito pela importação — permanece sempre o do VTP App.
  // Quantidade, estoque mínimo e custo são atualizados normalmente via CSV.
  importData.forEach(d => {
    const item = items.find(i => i.id === d.id);
    if (!item) return;
    item.qty  = d.newQty;
    if (d.newMin !== undefined) item.min  = d.newMin;
    if (d.newCost > 0)          item.cost = d.newCost;
    // item.name nunca é alterado pela importação
  });
  saveI();
  closeModal('ovImport');
  toast(`${importData.length} itens atualizados!`, 'ok');
  renderEstoque();
  renderDashboard();
  importData = [];
}

// ── Compatibilidade ───────────────────────────────────────────
function saveStock()           {}  // não usado no novo módulo
function addCarrinho(itemId)   { toast('Use o módulo Compras para o carrinho.', 'info'); }
function gerarListaCompras()   { goModule('compras'); }
function goToCompras()         { goModule('compras'); }
function iniciarCompras()      { goModule('compras'); }
function updateEstSelCount()   {}
function selectEstByStatus()   {}
function toggleEstAll()        {}

// ══════════════════════════════════════════════════════════════
// MÓDULO MOVIMENTAÇÕES
// ══════════════════════════════════════════════════════════════

// Gera dados simulados realistas na primeira vez
function _garantirMovSimuladas() {
  let movs = _getMov();
  if (movs.length > 0) return;

  const now   = new Date();
  const insumos = items.filter(i => !i.isProd).slice(0, 20);
  const nomes = insumos.map(i => ({ id:i.id, name:i.name, unit:i.unit, cat:i.cat }));
  const sim   = [];
  let id = 1;

  // Simula 4 semanas de movimentações
  for (let semana = 3; semana >= 0; semana--) {
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - semana * 7);

    // Importação do CW (vendas semanais) — saídas automáticas
    const cwDate = new Date(baseDate);
    cwDate.setDate(cwDate.getDate() - 1);
    nomes.forEach(ins => {
      const qtd = parseFloat((Math.random() * 15 + 2).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'saida_venda',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: -1,
        data: cwDate.toISOString(),
        origem: 'importacao_cw',
        descricao: `Saída automática CW — semana ${4-semana}`,
        usuario: 'Sistema (CW)',
        lote: `CW-SEM-${4-semana}-${semana+1}`,
      });
    });

    // Entradas de compra
    const compraDate = new Date(baseDate);
    compraDate.setDate(compraDate.getDate() + 1);
    nomes.slice(0, 8).forEach(ins => {
      if (Math.random() > 0.5) return;
      const qtd = parseFloat((Math.random() * 20 + 5).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'entrada_compra',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: 1,
        data: compraDate.toISOString(),
        origem: 'manual',
        descricao: 'Entrada de compra registrada',
        usuario: 'Yuri Pappas',
        lote: `LC${String(100 + semana * 3).padStart(4,'0')}`,
      });
    });

    // Saídas de produção interna
    const prodDate = new Date(baseDate);
    prodDate.setDate(prodDate.getDate() + 2);
    nomes.slice(0, 5).forEach(ins => {
      if (Math.random() > 0.4) return;
      const qtd = parseFloat((Math.random() * 5 + 0.5).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'saida_producao',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: -1,
        data: prodDate.toISOString(),
        origem: 'manual',
        descricao: 'Retirada para pré-produção',
        usuario: 'Yuri Pappas',
        lote: null,
      });
    });

    // Ajuste esporádico
    if (semana === 1) {
      const ins = nomes[Math.floor(Math.random() * nomes.length)];
      sim.push({
        id: id++,
        tipo: 'ajuste_manual',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: 2.5,
        sinal: -1,
        data: baseDate.toISOString(),
        origem: 'manual',
        descricao: 'Ajuste de estoque — divergência contagem',
        usuario: 'Yuri Pappas',
        lote: null,
      });
    }
  }

  _saveMov(sim.sort((a,b) => new Date(b.data) - new Date(a.data)));
}

// Registra uma movimentação manualmente
function registrarMovimentacao(tipo, itemId, qty, descricao, lote) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const movs = _getMov();
  const nova  = {
    id:        Math.max(0, ...movs.map(m => m.id)) + 1,
    tipo,
    itemId:    item.id,
    itemName:  item.name,
    itemUnit:  item.unit,
    itemCat:   item.cat,
    qty:       Math.abs(qty),
    sinal:     tipo.startsWith('entrada') ? 1 : -1,
    data:      new Date().toISOString(),
    origem:    'manual',
    descricao: descricao || '',
    usuario:   u?.name || 'Sistema',
    lote:      lote || null,
  };
  movs.unshift(nova);
  _saveMov(movs);
  try { logAudit('movimentacao', tipo + ' — ' + item.name + ' ' + Math.abs(qty) + ' ' + item.unit, 'estoque'); } catch(e) {}
  return nova;
}

// Registra movimentações em lote ao importar CSV do CW
function registrarImportacaoCW(importData) {
  const movs = _getMov();
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const lote = `CW-${new Date().toISOString().slice(0,10)}`;
  const maxId = Math.max(0, ...movs.map(m => m.id));

  importData.forEach((d, idx) => {
    const item = items.find(i => i.id === d.id);
    if (!item) return;
    const diff = d.newQty - d.oldQty;
    if (Math.abs(diff) < 0.001) return;
    movs.unshift({
      id:       maxId + idx + 1,
      tipo:     diff > 0 ? 'entrada_ajuste' : 'saida_ajuste',
      itemId:   item.id,
      itemName: item.name,
      itemUnit: item.unit,
      itemCat:  item.cat,
      qty:      Math.abs(parseFloat(diff.toFixed(3))),
      sinal:    diff > 0 ? 1 : -1,
      data:     new Date().toISOString(),
      origem:   'importacao_cw',
      descricao:`Atualização via importação CSV do Cardápio Web`,
      usuario:  u?.name || 'Sistema',
      lote,
    });
  });
  _saveMov(movs);
}

// ── Render da aba de Movimentações ───────────────────────────
let _movFiltro = { search:'', tipo:'', itemId:'', de:'', ate:'', periodo:'semana' };

function _renderMovimentacoes() {
  _garantirMovSimuladas();
  const el = document.getElementById('estPanelMovimentacoes');
  if (!el) return;

  const f    = _movFiltro;
  let movs   = _getMov();
  const now  = new Date();

  // Filtro de período rápido
  if (f.periodo !== 'todos') {
    const dias = { dia:1, semana:7, quinzena:15, mes:30 }[f.periodo] || 7;
    const limit = new Date(now); limit.setDate(limit.getDate() - dias);
    movs = movs.filter(m => new Date(m.data) >= limit);
  }
  if (f.de)     movs = movs.filter(m => m.data.slice(0,10) >= f.de);
  if (f.ate)    movs = movs.filter(m => m.data.slice(0,10) <= f.ate);
  if (f.tipo)   movs = movs.filter(m => m.tipo === f.tipo);
  if (f.search) movs = movs.filter(m => m.itemName.toLowerCase().includes(f.search.toLowerCase()));

  // KPIs resumo do período filtrado
  const totalEntradas = movs.filter(m=>m.sinal>0).reduce((s,m)=>s+m.qty,0);
  const totalSaidas   = movs.filter(m=>m.sinal<0).reduce((s,m)=>s+m.qty,0);
  const vendas        = movs.filter(m=>m.tipo==='saida_venda').reduce((s,m)=>s+m.qty,0);
  const producao      = movs.filter(m=>m.tipo==='saida_producao').reduce((s,m)=>s+m.qty,0);

  // Top insumos com mais saída no período
  const saidasPorItem = {};
  movs.filter(m=>m.sinal<0).forEach(m=>{
    if (!saidasPorItem[m.itemName]) saidasPorItem[m.itemName] = { qty:0, unit:m.itemUnit };
    saidasPorItem[m.itemName].qty += m.qty;
  });
  const topSaidas = Object.entries(saidasPorItem).sort((a,b)=>b[1].qty-a[1].qty).slice(0,5);

  el.innerHTML = `
    <div style="max-width:100%">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:1rem;font-weight:800;margin-bottom:2px">Movimentações de Estoque</h2>
          <div style="font-size:var(--text-xs);color:var(--muted)">Entradas, saídas automáticas (CW) e manuais</div>
        </div>
        <button onclick="abrirModalMovManual()"
          style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r8);
          border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer">
          ${lc('plus',13,'#fff')} Registrar movimento
        </button>
      </div>

      <!-- Período rápido -->
      <div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <span style="font-size:var(--text-xs);color:var(--muted);margin-right:4px">Período:</span>
        ${['dia','semana','quinzena','mes','todos'].map(p => {
          const labels = {dia:'Hoje',semana:'7 dias',quinzena:'15 dias',mes:'30 dias',todos:'Tudo'};
          const active = f.periodo === p;
          return `<button onclick="_movSetPeriodo('${p}')"
            style="padding:5px 11px;border-radius:20px;font-size:var(--text-xs);font-weight:600;cursor:pointer;
            border:1.5px solid ${active?'var(--purple)':'var(--border)'};
            background:${active?'var(--purple)':'var(--surface)'};
            color:${active?'#fff':'var(--muted)'}">
            ${labels[p]}
          </button>`;
        }).join('')}
        <div style="width:1px;height:18px;background:var(--border);margin:0 4px"></div>
        <input type="date" value="${f.de}" onchange="_movFiltro.de=this.value;_movFiltro.periodo='todos';_renderMovimentacoes()"
          style="padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);color:var(--muted)">
        <span style="font-size:var(--text-xs);color:var(--muted)">até</span>
        <input type="date" value="${f.ate}" onchange="_movFiltro.ate=this.value;_movFiltro.periodo='todos';_renderMovimentacoes()"
          style="padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);color:var(--muted)">
      </div>

      <!-- KPIs do período -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px">
        <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('arrow-down-circle',12,'var(--green)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--green)">Entradas</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--green)">${movs.filter(m=>m.sinal>0).length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">no período</div>
        </div>
        <div style="background:var(--red-light);border:1.5px solid var(--red)22;border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('shopping-bag',12,'var(--red)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--red)">Vendas (auto)</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${movs.filter(m=>m.tipo==='saida_venda').length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">débito automático CW</div>
        </div>
        <div style="background:var(--red-light);border:1.5px solid var(--red)22;border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('chef-hat',12,'var(--red)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--red)">Produção</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${movs.filter(m=>m.tipo==='saida_producao').length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">retiradas internas</div>
        </div>
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('activity',12,'var(--purple)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--purple)">Total movs.</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">${movs.length}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">no período selecionado</div>
        </div>
      </div>

      <!-- Grid: tabela + sidebar com top consumo -->
      <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1fr 240px'};gap:16px;align-items:flex-start">

        <!-- Tabela de movimentações -->
        <div>
          <!-- Filtros da tabela -->
          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
            <input class="inp" style="flex:1;min-width:160px;max-width:240px;padding:6px 10px;font-size:var(--text-sm)"
              placeholder="Buscar insumo..." value="${f.search}"
              oninput="_movFiltro.search=this.value;_renderMovimentacoes()">
            <select class="inp" style="max-width:200px;padding:6px 8px;font-size:var(--text-sm)"
              onchange="_movFiltro.tipo=this.value;_renderMovimentacoes()">
              <option value="">Todos os tipos</option>
              ${Object.entries(MOV_TIPOS).map(([k,v]) =>
                `<option value="${k}" ${f.tipo===k?'selected':''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>

          <div class="card" style="overflow:hidden">
            ${movs.length === 0 ? `
              <div class="empty" style="padding:40px">
                ${lc('activity',24,'var(--muted)')}
                <div style="margin-top:8px;font-size:var(--text-sm)">Nenhuma movimentação encontrada</div>
              </div>
            ` : `
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:580px">
                <thead><tr style="background:var(--surface2)">
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700;white-space:nowrap">Data/Hora</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Insumo</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Tipo</th>
                  <th style="padding:8px 12px;text-align:right;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Qtd</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Descrição</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Usuário</th>
                </tr></thead>
                <tbody>
                  ${movs.slice(0,80).map((m,idx) => {
                    const t     = MOV_TIPOS[m.tipo] || MOV_TIPOS['entrada_ajuste'];
                    const isEnt = m.sinal > 0;
                    const sinal = isEnt ? '+' : '−';
                    const cor   = isEnt ? 'var(--green)' : 'var(--red)';
                    const rowBg = idx%2===0 ? 'var(--surface)' : 'var(--surface2)';
                    return `<tr style="border-top:1px solid var(--border);background:${rowBg};border-left:3px solid ${cor}">
                      <td style="padding:7px 12px;white-space:nowrap">
                        <div style="font-size:var(--text-sm);font-weight:600">${new Date(m.data).toLocaleDateString('pt-BR')}</div>
                        <div style="font-size:var(--text-2xs);color:var(--muted)">${new Date(m.data).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                      </td>
                      <td style="padding:7px 12px">
                        <div style="font-size:var(--text-sm);font-weight:600">${m.itemName}</div>
                        <div style="font-size:var(--text-2xs);color:var(--muted)">${m.itemCat}</div>
                      </td>
                      <td style="padding:7px 12px">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:20px;font-size:var(--text-2xs);font-weight:600;
                          background:${t.bg};color:${t.cor};white-space:nowrap">
                          ${lc(t.icon,10,t.cor)} ${t.label}
                        </span>
                        ${m.lote ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${m.lote}</div>` : ''}
                      </td>
                      <td style="padding:7px 12px;text-align:right;white-space:nowrap">
                        <span style="font-size:var(--text-sm);font-weight:800;font-family:monospace;color:${cor}">${sinal}${fmt(m.qty)} ${m.itemUnit}</span>
                      </td>
                      <td style="padding:7px 12px;font-size:var(--text-xs);color:var(--muted);max-width:200px">
                        ${m.descricao || '—'}
                      </td>
                      <td style="padding:7px 12px;font-size:var(--text-xs);color:var(--muted);white-space:nowrap">
                        ${m.usuario}
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            ${movs.length > 80 ? `<div style="padding:8px 14px;font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-top:1px solid var(--border)">Mostrando 80 de ${movs.length} movimentações. Use filtros para refinar.</div>` : ''}`}
          </div>
        </div>

        <!-- Sidebar: resumo por insumo -->
        <div style="position:sticky;top:20px;display:flex;flex-direction:column;gap:12px">
          <div class="card" style="overflow:hidden">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)">
              <div style="font-size:var(--text-sm);font-weight:700">${lc('trending-down',13,'var(--orange-dark)')} Top consumo</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">mais saídas no período</div>
            </div>
            ${topSaidas.length === 0 ? `<div style="padding:14px;font-size:var(--text-xs);color:var(--muted);text-align:center">Sem dados</div>` :
              topSaidas.map(([nome,d],idx) => `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border)">
                  <div style="width:18px;height:18px;border-radius:50%;background:${idx===0?'var(--orange-dark)':'var(--surface2)'};
                    color:${idx===0?'#fff':'var(--muted)'};font-size:var(--text-2xs);font-weight:800;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">${idx+1}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:var(--text-xs);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
                    <div style="font-size:var(--text-2xs);color:var(--orange-dark);font-family:monospace;font-weight:700">−${fmt(d.qty)} ${d.unit}</div>
                  </div>
                </div>`).join('')}
          </div>

          <div class="card" style="overflow:hidden">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)">
              <div style="font-size:var(--text-sm);font-weight:700">${lc('upload',13,'var(--purple)')} Importações CW</div>
            </div>
            ${(() => {
              const cwMovs = _getMov().filter(m=>m.origem==='importacao_cw');
              const lotes  = [...new Set(cwMovs.map(m=>m.lote).filter(Boolean))];
              if (!lotes.length) return `<div style="padding:14px;font-size:var(--text-xs);color:var(--muted);text-align:center">Nenhuma importação</div>`;
              return lotes.slice(0,5).map(lote => {
                const ltMovs = cwMovs.filter(m=>m.lote===lote);
                const data   = ltMovs[0]?.data;
                return `<div style="padding:7px 12px;border-bottom:1px solid var(--border)">
                  <div style="font-size:var(--text-xs);font-weight:600">${lote}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${data?new Date(data).toLocaleDateString('pt-BR'):''} · ${ltMovs.length} insumos</div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
    </div>`;
}

function _movSetPeriodo(p) {
  _movFiltro.periodo = p;
  _movFiltro.de = '';
  _movFiltro.ate = '';
  _renderMovimentacoes();
}

// ── Modal de movimentação manual ──────────────────────────────
function abrirModalMovManual() {
  document.getElementById('popupMovManual')?.remove();
  const insumos = items.filter(i => !i.isProd).sort((a,b)=>a.name.localeCompare(b.name));
  const popup = document.createElement('div');
  popup.id = 'popupMovManual';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div style="font-size:var(--text-md);font-weight:800">${lc('activity',15,'var(--purple)')} Registrar Movimentação</div>
        <button onclick="document.getElementById('popupMovManual').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Tipo de movimentação *</label>
          <select id="movTipo" class="inp" onchange="atualizarLabelMov()">
            ${Object.entries(MOV_TIPOS).map(([k,v]) =>
              `<option value="${k}">${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Insumo *</label>
          <select id="movItemId" class="inp">
            <option value="">Selecionar insumo...</option>
            ${insumos.map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('')}
          </select>
        </div>
        <div class="f2" style="gap:10px;display:grid;grid-template-columns:1fr 1fr">
          <div class="field" style="margin:0">
            <label id="movQtdLabel">Quantidade *</label>
            <input type="number" id="movQtd" class="inp" min="0.001" step="0.001" placeholder="0,000">
          </div>
          <div class="field" style="margin:0">
            <label>Lote / Referência</label>
            <input type="text" id="movLote" class="inp" placeholder="Ex: LC0012, NF-456...">
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>Descrição / Motivo</label>
          <input type="text" id="movDesc" class="inp" placeholder="Ex: Retirada para preparo de massas">
        </div>
        <div id="movPreview" style="background:var(--surface2);border-radius:var(--r8);padding:10px 12px;font-size:var(--text-sm);color:var(--muted);min-height:36px"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border)">
        <button class="btn btn-outline" onclick="document.getElementById('popupMovManual').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarMovManual()">Registrar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
  atualizarLabelMov();
}

function atualizarLabelMov() {
  const tipo  = document.getElementById('movTipo')?.value;
  const t     = MOV_TIPOS[tipo];
  const label = document.getElementById('movQtdLabel');
  const prev  = document.getElementById('movPreview');
  if (label && t) {
    label.textContent = `Quantidade (${t.sinal||'?'}) *`;
  }
  if (prev && t) {
    prev.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:20px;background:${t.bg};color:${t.cor};font-size:var(--text-xs);font-weight:600">${lc(t.icon,11,t.cor)} ${t.label}</span>`;
  }
}

function salvarMovManual() {
  const tipo   = document.getElementById('movTipo')?.value;
  const itemId = parseInt(document.getElementById('movItemId')?.value);
  const qty    = parseFloat(document.getElementById('movQtd')?.value);
  const desc   = document.getElementById('movDesc')?.value.trim();
  const lote   = document.getElementById('movLote')?.value.trim();

  if (!tipo)       { toast('Selecione o tipo', 'err'); return; }
  if (!itemId)     { toast('Selecione o insumo', 'err'); return; }
  if (!qty||qty<=0){ toast('Informe a quantidade', 'err'); return; }

  registrarMovimentacao(tipo, itemId, qty, desc, lote||null);
  document.getElementById('popupMovManual')?.remove();
  _renderMovimentacoes();
  toast('Movimentação registrada!');
}

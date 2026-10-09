/**
 * VTP Inventário — Cadastro e Contagem de Ativos
 */


const INV_STATUS = {
  bom:     { label:'Bom',     color:'var(--green)',       bg:'var(--green-light)'  },
  atencao: { label:'Atenção', color:'var(--yellow)',      bg:'var(--yellow-light)' },
  ruim:    { label:'Ruim',    color:'var(--red)',         bg:'var(--red-light)'    },
};

const INV_CONT_STATUS = {
  bom:            { label:'Bom',       color:'var(--green)',       bg:'var(--green-light)'   },
  atencao:        { label:'Atenção',   color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  ruim:           { label:'Ruim',      color:'var(--red)',         bg:'var(--red-light)'     },
  nao_encontrado: { label:'Não está',  color:'var(--muted)',       bg:'var(--surface2)'      },
};

let contagensInv = db._get('vtp_contagens_inv', []);
const saveContagensInv = () => db._set('vtp_contagens_inv', contagensInv);

let _invBaixas = db._get('vtp_inv_baixas', []);
const _saveInvBaixas = () => db._set('vtp_inv_baixas', _invBaixas);

function _gerarCodigoInv() {
  const seq = (parseInt(db._get('vtp_inv_codigo_seq', '0')) || 0) + 1;
  db._set('vtp_inv_codigo_seq', String(seq));
  return 'VTP' + String(seq).padStart(6, '0');
}

let _invTab = 'visao_geral';
window._vtpGetTab_inventario = () => _invTab;
window._vtpSetTab_inventario = (v) => { _invTab = v; };
let _editInvId = null;
let _invContagemAtiva = null;
let _modoSelecionado = null;
let _contagemIdx = 0;
let _invStatusSel = 'bom';
let _gcStatusAtual = 'bom';

function _getInvData() { return typeof manutEquip !== 'undefined' ? manutEquip : []; }
function _saveInvData() { if (typeof _saveManutE !== 'undefined') _saveManutE(); }

const _INV_GRUPO_LEGACY = {
  producao_quente:'equipamento', refrigeracao:'equipamento', climatizacao:'equipamento',
  preparacao:'equipamento', utensilios:'utensilio', infraestrutura:'estrutura',
  tecnologia:'eletronico', delivery:'equipamento', higiene:'utensilio', seguranca:'estrutura',
};

function _migrarCamposInv() {
  let changed = false;
  _getInvData().forEach(i => {
    if (i.invTipo      === undefined) { i.invTipo = 'unico'; changed = true; }
    if (i.invStatus    === undefined) { i.invStatus = (i.status === 'ok' || !i.status) ? 'bom' : 'atencao'; changed = true; }
    if (i.invQtdIdeal  === undefined) { i.invQtdIdeal = 1; changed = true; }
    if (i.invQtdAtual  === undefined) { i.invQtdAtual = 1; changed = true; }
    if (i.invLocalizacao === undefined || !inventarioLocs.find(l => l.id === i.invLocalizacao)) {
      const l = (i.localizacao || '').toLowerCase();
      i.invLocalizacao = l.includes('escrit') ? 'escritorio'
        : l.includes('estoque') || l.includes('depós') ? 'estoque_coz'
        : l.includes('geral') ? 'cozinha_prod' : 'cozinha_fin';
      changed = true;
    }
    if (_INV_GRUPO_LEGACY[i.grupo]) { i.grupo = _INV_GRUPO_LEGACY[i.grupo]; changed = true; }
    if (!inventarioCats[i.grupo])  { i.grupo = 'equipamento'; changed = true; }
    if (i.invTemPreventiva  === undefined) { i.invTemPreventiva  = false; changed = true; }
    if (i.invFreqPreventiva === undefined) { i.invFreqPreventiva = '';    changed = true; }
    if (i.invProxPreventiva === undefined) { i.invProxPreventiva = null;  changed = true; }
    if (!i.invCodigo) { i.invCodigo = _gerarCodigoInv(); changed = true; }
  });
  if (changed) _saveInvData();
}

function calcProxPreventiva(dataExec, freq) {
  if (!dataExec || !freq) return null;
  const d = new Date(dataExec + 'T12:00:00');
  if (isNaN(d)) return null;
  switch (freq) {
    case 'semanal':    d.setDate(d.getDate() + 7);          break;
    case 'quinzenal':  d.setDate(d.getDate() + 15);         break;
    case 'mensal':     d.setMonth(d.getMonth() + 1);        break;
    case 'bimestral':  d.setMonth(d.getMonth() + 2);        break;
    case 'trimestral': d.setMonth(d.getMonth() + 3);        break;
    case 'semestral':  d.setMonth(d.getMonth() + 6);        break;
    case 'anual':      d.setFullYear(d.getFullYear() + 1);  break;
    default: return null;
  }
  return d.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderInventario() {
  try { _migrarCamposInv(); } catch(e) { console.warn('inv migration:', e); }
  _invTab = _invTab || 'visao_geral';
  const el = document.getElementById('page-inventario');
  if (!el) return;
  try {
    el.innerHTML = `
      <div style="border-bottom:1.5px solid var(--border);display:flex;gap:0;padding:0 24px;background:var(--surface);overflow-x:auto">
        ${[['visao_geral','Visão Geral'],['contagem','Contagem'],['historico','Histórico']].map(([id,label]) =>
          `<button id="invTab_${id}" onclick="setInvTab('${id}')"
            style="padding:12px 18px;border:none;border-bottom:2.5px solid transparent;background:none;
            color:var(--muted);font-size:var(--text-sm);font-weight:500;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
            ${label}</button>`).join('')}
      </div>
      <div id="invContent" style="padding-bottom:40px"></div>`;
    setInvTab(_invTab);
  } catch(e) {
    console.error('renderInventario:', e);
    el.innerHTML = `<div style="padding:32px 24px">
      <div style="color:var(--red);font-size:var(--text-sm);font-weight:700;margin-bottom:8px">Erro ao carregar Inventário</div>
      <div style="color:var(--muted);font-size:var(--text-sm);font-family:monospace">${e.message}</div>
      <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="renderInventario()">Tentar novamente</button>
    </div>`;
  }
}

function setInvTab(tab) {
  _invTab = tab;
  ['visao_geral','contagem','historico'].forEach(t => {
    const btn = document.getElementById('invTab_' + t);
    if (!btn) return;
    btn.style.color           = t === tab ? 'var(--purple)' : 'var(--muted)';
    btn.style.fontWeight      = t === tab ? '700' : '500';
    btn.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent';
  });
  if (tab === 'visao_geral') _renderInvVisaoGeral();
  if (tab === 'contagem')    _renderInvContagem();
  if (tab === 'historico')   _renderInvHistorico();
}

// ══════════════════════════════════════════════════════════════
// VISÃO GERAL
// ══════════════════════════════════════════════════════════════

function _renderInvVisaoGeral() {
  const cont = document.getElementById('invContent');
  if (!cont) return;
  const items   = _getInvData();
  const total   = items.length;
  const bom     = items.filter(i => (i.invStatus||'bom') === 'bom').length;
  const atencao = items.filter(i => (i.invStatus||'bom') === 'atencao').length;
  const ruim    = items.filter(i => (i.invStatus||'bom') === 'ruim').length;
  const ultima  = contagensInv.filter(c => c.status === 'concluida').sort((a,b) => b.data.localeCompare(a.data))[0];
  const emAnd   = contagensInv.find(c => c.status === 'em_andamento');

  cont.innerHTML = `<div style="padding:20px 24px">

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px;display:flex;align-items:center;gap:8px">
          ${lc('package',14,'var(--purple)')} Inventário
        </h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          ${total} iten${total!==1?'s':''} · ${ultima ? 'Última contagem: ' + fmtD(ultima.data) : 'Nenhuma contagem realizada'}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${emAnd
          ? `<button class="btn btn-outline btn-sm" onclick="setInvTab('contagem')" style="color:var(--purple);border-color:var(--purple)">${lc('play',13,'currentColor')} Retomar Contagem</button>`
          : `<button class="btn btn-outline btn-sm" onclick="setInvTab('contagem')">${lc('clipboard-list',13,'currentColor')} Iniciar Contagem</button>`}
        <button class="btn btn-primary btn-sm" onclick="invAbrirModalItem(null)">${lc('plus',13,'currentColor')} Novo Item</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:20px">
      <div style="background:var(--green-light);border:1.5px solid var(--green)22;border-radius:var(--r10);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${lc('check-circle',12,'var(--green)')}<span style="font-size:var(--text-xs);color:var(--green);font-weight:700">Bom estado</span></div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--green)">${bom}</div>
      </div>
      <div style="background:var(--yellow-light);border:1.5px solid var(--yellow)22;border-radius:var(--r10);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${lc('alert-triangle',12,'var(--yellow)')}<span style="font-size:var(--text-xs);color:var(--yellow);font-weight:700">Atenção</span></div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--yellow)">${atencao}</div>
      </div>
      <div style="background:var(--red-light);border:1.5px solid var(--red)22;border-radius:var(--r10);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${lc('alert-octagon',12,'var(--red)')}<span style="font-size:var(--text-xs);color:var(--red);font-weight:700">Ruim</span></div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--red)">${ruim}</div>
      </div>
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple)22;border-radius:var(--r10);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">${lc('package',12,'var(--purple)')}<span style="font-size:var(--text-xs);color:var(--purple);font-weight:700">Total</span></div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${total}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <input class="inp" id="invSearch" placeholder="Buscar item..." style="flex:1;min-width:140px" oninput="_renderInvLista()">
      <select class="inp" id="invFiltCat" style="flex:1;min-width:120px;padding:7px 10px" onchange="_renderInvLista()">
        <option value="">Todas categorias</option>
        ${Object.entries(inventarioCats).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <select class="inp" id="invFiltStatus" style="flex:1;min-width:100px;padding:7px 10px" onchange="_renderInvLista()">
        <option value="">Todos status</option>
        <option value="bom">Bom</option>
        <option value="atencao">Atenção</option>
        <option value="ruim">Ruim</option>
      </select>
    </div>

    <div id="invListaBody" style="display:flex;flex-direction:column;gap:2px"></div>
  </div>`;

  _renderInvLista();
}

function _renderInvLista() {
  const el = document.getElementById('invListaBody');
  if (!el) return;
  const q      = (document.getElementById('invSearch')?.value||'').toLowerCase();
  const catFil = document.getElementById('invFiltCat')?.value||'';
  const stFil  = document.getElementById('invFiltStatus')?.value||'';

  let filt = _getInvData().filter(i => {
    if (q      && !(i.nome||'').toLowerCase().includes(q)) return false;
    if (catFil && (i.grupo||'equipamento') !== catFil)      return false;
    if (stFil  && (i.invStatus||'bom')    !== stFil)       return false;
    return true;
  }).sort((a,b) => {
    const ord = { ruim:0, atencao:1, bom:2 };
    return (ord[a.invStatus||'bom']??2)-(ord[b.invStatus||'bom']??2)||(a.nome||'').localeCompare(b.nome||'');
  });

  if (!filt.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${lc('package',16,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">${q||catFil||stFil?'Nenhum item encontrado':'Inventário vazio'}</div><div>${q||catFil||stFil?'Tente outros filtros':'Cadastre os equipamentos e utensílios da pizzaria'}</div></div>`;
    return;
  }

  const byCat = {};
  filt.forEach(i => { const k=i.grupo||'equipamento'; if(!byCat[k]) byCat[k]=[]; byCat[k].push(i); });

  el.innerHTML = Object.entries(byCat).map(([catKey, catItems]) => {
    const cat = inventarioCats[catKey] || { label:catKey, icon:'package', color:'var(--muted)', bg:'var(--surface2)' };
    return `<div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:7px;padding:5px 2px;margin-bottom:5px;border-bottom:1px solid var(--border)">
        <div style="width:20px;height:20px;border-radius:5px;background:${cat.bg};display:flex;align-items:center;justify-content:center">${lc(cat.icon,10,cat.color)}</div>
        <span style="font-size:var(--text-xs);font-weight:700;color:var(--text2)">${cat.label}</span>
        <span style="font-size:var(--text-xs);color:var(--muted)">${catItems.length}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">${catItems.map(_invItemRow).join('')}</div>
    </div>`;
  }).join('');
}

function _invItemRow(i) {
  const st     = INV_STATUS[i.invStatus] || INV_STATUS['bom'];
  const isQtd  = i.invTipo === 'quantidade';
  const loc    = inventarioLocs.find(l => l.id === (i.invLocalizacao||''))?.label || i.localizacao || '';
  const border = i.invStatus==='ruim' ? 'var(--red)44' : i.invStatus==='atencao' ? 'var(--yellow)55' : 'var(--border)';

  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid ${border};border-radius:var(--r8);cursor:pointer" onclick="invAbrirModalItem('${i.id}')">
    <div style="width:8px;height:8px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:700">${i.nome}</span>
        ${i.invCodigo ? `<span style="padding:1px 6px;border-radius:5px;font-size:var(--text-2xs);font-weight:700;background:var(--surface2);color:var(--muted);font-family:monospace">${i.invCodigo}</span>` : ''}
        ${isQtd?`<span style="padding:1px 5px;border-radius:5px;font-size:var(--text-2xs);font-weight:700;background:var(--surface2);color:var(--muted)">${i.invQtdAtual||0}/${i.invQtdIdeal||0} un</span>`:''}
        <span style="padding:1px 6px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;background:${st.bg};color:${st.color}">${st.label}</span>
        ${i.invTemPreventiva?`<span style="padding:1px 5px;border-radius:5px;font-size:var(--text-2xs);font-weight:700;background:var(--purple-xlight);color:var(--purple)">Preventiva</span>`:''}
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px;display:flex;gap:8px;flex-wrap:wrap">
        ${loc?`<span>${loc}</span>`:''}
        ${i.modelo?`<span>${i.modelo}</span>`:''}
        ${i.invTemPreventiva&&i.invProxPreventiva?`<span style="color:var(--purple)">Próxima: ${fmtD(i.invProxPreventiva)}</span>`:''}
      </div>
    </div>
    <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();invAbrirModalItem('${i.id}')">${lc('edit-2',12,'currentColor')}</button>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODAL CRUD
// ══════════════════════════════════════════════════════════════

function invAbrirModalItem(id) {
  _editInvId   = id || null;
  _invStatusSel = 'bom';
  const i = id ? _getInvData().find(x => x.id === id) : null;

  const catSel = document.getElementById('invItemCategoria');
  if (catSel && !catSel.options.length) {
    catSel.innerHTML = Object.entries(inventarioCats)
      .map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');
  }

  const titleEl = document.getElementById('invItemModalTitle');
  if (titleEl) titleEl.textContent = i ? (i.nome + (i.invCodigo ? ' · ' + i.invCodigo : '')) : 'Novo Item';
  const hidEl = document.getElementById('eInvItemId');
  if (hidEl) hidEl.value = id || '';

  const g = (eid, val) => { const el=document.getElementById(eid); if(el) el.value=(val??''); };
  g('invItemNome',      i?.nome||'');
  g('invItemCategoria', i?.grupo||'');
  g('invItemModelo',    i?.modelo||'');
  g('invItemNroSerie',  i?.numeroSerie||'');
  g('invItemQtdIdeal',  i?.invQtdIdeal??'');
  g('invItemQtdAtual',  i?.invQtdAtual??'');
  g('invItemObs',       i?.observacoes||'');
  g('invItemFreq',      i?.invFreqPreventiva||'');
  g('invItemProxPrev',  i?.invProxPreventiva||'');
  g('invItemLoc',       i?.invLocalizacao||'');
  g('invItemPreco',     i?.invPrecoCompra??'');
  g('invItemGarantia',  i?.invGarantiaURL||'');

  const tipo = i?.invTipo || 'unico';
  const tipoUnicoEl = document.getElementById('invTipoUnico');
  const tipoQtdEl  = document.getElementById('invTipoQtd');
  if (tipoUnicoEl) tipoUnicoEl.checked = tipo === 'unico';
  if (tipoQtdEl)  tipoQtdEl.checked   = tipo === 'quantidade';
  _toggleInvTipo(tipo);

  _invStatusSel = i?.invStatus || 'bom';
  _renderInvStatusChips();

  const temPrev = !!i?.invTemPreventiva;
  const temPrevEl = document.getElementById('invItemTemPrev');
  const prevSecEl = document.getElementById('invPrevSection');
  const delBtnEl  = document.getElementById('delInvItemBtn');
  if (temPrevEl) temPrevEl.checked       = temPrev;
  if (prevSecEl) prevSecEl.style.display = temPrev ? '' : 'none';
  if (delBtnEl)  delBtnEl.style.display  = id ? 'inline-flex' : 'none';

  const ovEl = document.getElementById('ovInventItem');
  if (ovEl) ovEl.classList.add('open');
  setTimeout(() => document.getElementById('invItemNome')?.focus(), 80);
}

function _toggleInvTipo(tipo) {
  const row = document.getElementById('invQtdRow');
  if (row) row.style.display = tipo === 'quantidade' ? '' : 'none';
}

function invToggleTipo() {
  _toggleInvTipo(document.getElementById('invTipoQtd')?.checked ? 'quantidade' : 'unico');
}

function invTogglePreventiva() {
  const el = document.getElementById('invPrevSection');
  if (el) el.style.display = document.getElementById('invItemTemPrev')?.checked ? '' : 'none';
}

function _renderInvStatusChips() {
  ['bom','atencao','ruim'].forEach(s => {
    const btn = document.getElementById('invStChip_' + s);
    if (!btn) return;
    const st     = INV_STATUS[s];
    const active = s === _invStatusSel;
    btn.style.background   = active ? st.bg      : 'var(--surface2)';
    btn.style.color        = active ? st.color   : 'var(--muted)';
    btn.style.borderColor  = active ? st.color   : 'transparent';
    btn.style.fontWeight   = active ? '700'      : '500';
  });
  const alerta = document.getElementById('invRuimAlerta');
  if (alerta) alerta.style.display = _invStatusSel === 'ruim' ? '' : 'none';
}

function setInvStatus(s) {
  _invStatusSel = s;
  _renderInvStatusChips();
}

function invSalvarItem() {
  const nome = document.getElementById('invItemNome')?.value.trim();
  if (!nome) { toast('Informe o nome do item', 'err'); return; }

  const tipo    = document.getElementById('invTipoQtd')?.checked ? 'quantidade' : 'unico';
  const temPrev = !!document.getElementById('invItemTemPrev')?.checked;
  const freq    = document.getElementById('invItemFreq')?.value || '';
  const proxPrev= document.getElementById('invItemProxPrev')?.value || null;

  const data = {
    nome,
    grupo:             document.getElementById('invItemCategoria')?.value || 'equipamento',
    modelo:            document.getElementById('invItemModelo')?.value.trim()    || '',
    numeroSerie:       document.getElementById('invItemNroSerie')?.value.trim()  || '',
    localizacao:       inventarioLocs.find(l => l.id === document.getElementById('invItemLoc')?.value)?.label || '',
    observacoes:       document.getElementById('invItemObs')?.value.trim()       || '',
    invTipo:           tipo,
    invQtdIdeal:       tipo === 'quantidade' ? (parseInt(document.getElementById('invItemQtdIdeal')?.value)||1) : 1,
    invQtdAtual:       tipo === 'quantidade' ? (parseInt(document.getElementById('invItemQtdAtual')?.value)||0) : 1,
    invLocalizacao:    document.getElementById('invItemLoc')?.value              || '',
    invStatus:         _invStatusSel,
    invPrecoCompra:    parseFloat(document.getElementById('invItemPreco')?.value)||null,
    invGarantiaURL:    document.getElementById('invItemGarantia')?.value.trim()||'',
    invTemPreventiva:  temPrev,
    invFreqPreventiva: temPrev ? freq    : '',
    invProxPreventiva: temPrev ? proxPrev : null,
    updated_at:        new Date().toISOString(),
  };

  const items = _getInvData();
  if (_editInvId) {
    const idx = items.findIndex(x => x.id === _editInvId);
    if (idx >= 0) items[idx] = { ...items[idx], ...data };
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" atualizado!`);
  } else {
    items.push({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      criticidade:'media', status:'ok', marca:'', dataCompra:'', garantiaAte:'',
      invCodigo: _gerarCodigoInv(),
      ...data,
    });
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" cadastrado!`);
  }
  _saveInvData();
  closeModal('ovInventItem');
  if (document.getElementById('page-inventario')?.classList.contains('active')) _renderInvVisaoGeral();
  if (document.getElementById('page-manutencao')?.classList.contains('active')) renderManutencao();
  if (window._cfgCadActiveTab === 'inventario' && typeof _cfgRenderInvList === 'function') _cfgRenderInvList();
}

function invDeletarItem() {
  const items = _getInvData();
  const i     = items.find(x => x.id === _editInvId);
  if (!i) return;
  _invModalBaixaItem(i.id);
}

function _invModalBaixaItem(itemId) {
  const items = _getInvData();
  const i     = items.find(x => x.id === itemId);
  if (!i) return;
  document.getElementById('popupInvBaixa')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupInvBaixa';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:700;display:flex;align-items:center;justify-content:center;padding:16px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);padding:0;width:100%;max-width:400px;box-shadow:0 16px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800;margin-bottom:2px;display:flex;align-items:center;gap:8px">
          ${lc('trash-2',15,'var(--red)')} Dar baixa no item
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${i.nome}${i.invCodigo ? ' · ' + i.invCodigo : ''}</div>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Destino do item *</label>
          <select class="inp" id="invBaixaDest">
            <option value="">Selecione o destino…</option>
            <option value="vendido">Vendido</option>
            <option value="descartado">Descartado / Lixo</option>
            <option value="doado">Doado</option>
            <option value="roubado_perdido">Roubado / Perdido</option>
            <option value="transferido">Transferido para outra unidade</option>
            <option value="outros">Outros</option>
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Observação</label>
          <input class="inp" id="invBaixaObs" placeholder="Detalhes adicionais (opcional)">
        </div>
        <div style="padding:10px 12px;background:var(--red-light);border-radius:var(--r8);font-size:var(--text-xs);color:var(--red);font-weight:600;display:flex;align-items:center;gap:6px">
          ${lc('alert-circle',12,'currentColor')} O código ${i.invCodigo || 'deste item'} não será reutilizado após a baixa.
        </div>
      </div>
      <div style="padding:14px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1.5px solid var(--border)">
        <button class="btn btn-outline" onclick="document.getElementById('popupInvBaixa').remove()">Cancelar</button>
        <button style="padding:8px 16px;border-radius:var(--r8);border:none;background:var(--red);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif" onclick="_invConfirmarBaixa('${itemId}')">
          Confirmar baixa
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _invConfirmarBaixa(itemId) {
  const dest = document.getElementById('invBaixaDest')?.value;
  if (!dest) { toast('Selecione o destino do item', 'err'); return; }
  const items = _getInvData();
  const i     = items.find(x => x.id === itemId);
  if (!i) return;
  _invBaixas.push({
    id: crypto.randomUUID(),
    itemId, invCodigo: i.invCodigo || null,
    nome: i.nome, destino: dest,
    obs: document.getElementById('invBaixaObs')?.value.trim() || '',
    data: new Date().toISOString().slice(0,10),
    created_at: new Date().toISOString(),
  });
  _saveInvBaixas();
  items.splice(items.findIndex(x => x.id === itemId), 1);
  _saveInvData();
  document.getElementById('popupInvBaixa')?.remove();
  closeModal('ovInventItem');
  if (document.getElementById('page-inventario')?.classList.contains('active')) _renderInvVisaoGeral();
  if (document.getElementById('page-manutencao')?.classList.contains('active')) renderManutencao();
  if (window._cfgCadActiveTab === 'inventario' && typeof _cfgRenderInvList === 'function') _cfgRenderInvList();
  toast(`${lc('check-circle',14,'var(--green)')} "${i.nome}" baixado do inventário.`);
}

// ══════════════════════════════════════════════════════════════
// CONTAGEM
// ══════════════════════════════════════════════════════════════

function _getUltimaQtdContagem(itemId) {
  const ultima = contagensInv.filter(c => c.status === 'concluida').sort((a,b) => b.data.localeCompare(a.data))[0];
  if (!ultima) return null;
  const entry = ultima.itens.find(e => e.itemId === itemId);
  return (entry?.quantidade ?? null);
}

function _renderInvContagem() {
  const cont = document.getElementById('invContent');
  if (!cont) return;
  _invContagemAtiva = contagensInv.find(c => c.status === 'em_andamento') || null;

  if (!_invContagemAtiva) {
    _modoSelecionado = null;
    const totalItens = _getInvData().length;
    cont.innerHTML = `<div style="padding:20px 24px;max-width:640px">
      <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:4px">${lc('clipboard-list',14,'var(--purple)')} Contagem de Inventário</h3>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:24px">${totalItens} item${totalItens!==1?'s':''} no inventário. Registre o estado de cada um.</div>

      <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:12px">Modo de contagem</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">
        <div id="modoGuiadoCard" onclick="_selecionarModoContagem('guiado')"
          style="flex:1;min-width:180px;padding:18px;border:2px solid var(--border);border-radius:var(--r12);background:var(--surface);cursor:pointer;transition:border-color .15s">
          <div style="margin-bottom:8px">${lc('play-circle',26,'var(--purple)')}</div>
          <div style="font-size:var(--text-md);font-weight:700;margin-bottom:3px">Modo Guiado</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Item por item, passo a passo.</div>
        </div>
        <div id="modoListaCard" onclick="_selecionarModoContagem('lista')"
          style="flex:1;min-width:180px;padding:18px;border:2px solid var(--border);border-radius:var(--r12);background:var(--surface);cursor:pointer;transition:border-color .15s">
          <div style="margin-bottom:8px">${lc('list',26,'var(--purple)')}</div>
          <div style="font-size:var(--text-md);font-weight:700;margin-bottom:3px">Modo Lista</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Todos os itens de uma vez.</div>
        </div>
      </div>

      <div class="field">
        <label>Filtrar por local (opcional)</label>
        <select class="inp" id="invContLocal">
          <option value="">Todos os locais</option>
          ${inventarioLocs.map(l=>`<option value="${l.id}">${l.label}</option>`).join('')}
        </select>
      </div>

      <button class="btn btn-primary" id="btnIniciarContagem" onclick="iniciarContagem()"
        style="width:100%;justify-content:center;margin-top:16px;opacity:.5;pointer-events:none">
        Selecione um modo acima
      </button>
    </div>`;
    return;
  }
  _renderContagemAtiva();
}

function _selecionarModoContagem(modo) {
  _modoSelecionado = modo;
  ['guiado','lista'].forEach(m => {
    const card = document.getElementById('modo' + m.charAt(0).toUpperCase() + m.slice(1) + 'Card');
    if (card) card.style.borderColor = m === modo ? 'var(--purple)' : 'var(--border)';
  });
  const btn = document.getElementById('btnIniciarContagem');
  if (btn) {
    btn.style.opacity       = '1';
    btn.style.pointerEvents = 'auto';
    btn.textContent         = modo === 'guiado' ? 'Iniciar Contagem Guiada →' : 'Iniciar Contagem em Lista →';
  }
}

function iniciarContagem() {
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const resp = u?.name || 'Sistema';
  if (!_modoSelecionado) { toast('Selecione o modo de contagem', 'err'); return; }

  const localFiltro = document.getElementById('invContLocal')?.value || '';
  const allItems    = _getInvData();
  const filtrados   = localFiltro ? allItems.filter(i => i.invLocalizacao === localFiltro) : allItems;

  if (!filtrados.length) { toast('Nenhum item encontrado para este local', 'warn'); return; }

  _invContagemAtiva = {
    id: crypto.randomUUID(),
    data: new Date().toISOString().split('T')[0],
    responsavel: resp,
    modo: _modoSelecionado,
    localFiltro,
    status: 'em_andamento',
    itens: filtrados.map(i => ({
      itemId: i.id, nome: i.nome,
      tipo:       i.invTipo     || 'unico',
      qtdIdeal:   i.invQtdIdeal || 1,
      qtdAnterior: _getUltimaQtdContagem(i.id),
      quantidade: null, status: null, obs: '',
    })),
    created_at: new Date().toISOString(),
  };
  _contagemIdx   = 0;
  _gcStatusAtual = 'bom';
  contagensInv.unshift(_invContagemAtiva);
  saveContagensInv();
  _renderContagemAtiva();
}

function _renderContagemAtiva() {
  const cont = document.getElementById('invContent');
  if (!cont || !_invContagemAtiva) return;
  if (_invContagemAtiva.modo === 'guiado') _renderContagemGuiada(cont);
  else _renderContagemLista(cont);
}

// ── Modo Guiado ───────────────────────────────────────────────

function _renderContagemGuiada(cont) {
  const total  = _invContagemAtiva.itens.length;
  const entry  = _invContagemAtiva.itens[_contagemIdx];
  if (!entry) { _finalizarContagem(); return; }

  const invItem = _getInvData().find(x => x.id === entry.itemId);
  const cat  = inventarioCats[invItem?.grupo||'equipamento'] || { label:'', icon:'package', color:'var(--muted)', bg:'var(--surface2)' };
  const loc  = inventarioLocs.find(l => l.id === (invItem?.invLocalizacao||''))?.label || invItem?.localizacao || '';
  const pct  = Math.round((_contagemIdx / total) * 100);
  _gcStatusAtual = entry.status || null;

  const concluidos = _invContagemAtiva.itens.filter(e => e.status !== null).length;

  cont.innerHTML = `<div style="padding:20px 24px;max-width:600px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:var(--text-xs);color:var(--muted)">${_contagemIdx + 1} de ${total} · ${concluidos} respondidos</span>
      <span style="font-size:var(--text-xs);font-weight:700;color:var(--purple)">${pct}% concluído</span>
    </div>
    <div style="height:5px;background:var(--surface2);border-radius:10px;margin-bottom:20px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--purple);border-radius:10px;transition:width .3s"></div>
    </div>

    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:38px;height:38px;border-radius:var(--r10);background:${cat.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc(cat.icon,18,cat.color)}
        </div>
        <div>
          <div style="font-size:var(--text-md);font-weight:800">${entry.nome}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">${cat.label}${loc?' · '+loc:''}</div>
        </div>
      </div>

      ${entry.tipo === 'quantidade' ? `
      <div class="field" style="margin-bottom:4px">
        <label>Quantidade atual
          ${entry.qtdAnterior !== null ? `<span style="color:var(--muted);font-weight:400"> — último registro: ${entry.qtdAnterior} un</span>` : ''}
          <span style="color:var(--muted);font-weight:400"> (ideal: ${entry.qtdIdeal})</span>
        </label>
        <input class="inp" type="number" id="gcQtd" value="${entry.quantidade??''}" min="0"
          placeholder="Quantas tem agora?" oninput="_gcSalvarQtd(this.value)">
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:14px">Preencha para atualizar o estoque após a contagem</div>` : ''}

      <div style="font-size:var(--text-sm);font-weight:700;color:var(--muted);margin-bottom:8px">Estado do item</div>
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
        ${Object.entries(INV_CONT_STATUS).map(([s, st]) => {
          const active = _gcStatusAtual === s;
          return `<button id="gcSt_${s}" onclick="_gcSetStatus('${s}')"
            style="flex:1;min-width:70px;padding:9px 4px;border:2px solid ${active?st.color:'var(--border)'};border-radius:var(--r8);
            background:${active?st.bg:'var(--surface2)'};color:${active?st.color:'var(--muted)'};
            font-size:var(--text-xs);font-weight:${active?'700':'500'};cursor:pointer;font-family:Inter,sans-serif">${st.label}</button>`;
        }).join('')}
      </div>

      <div class="field" style="margin-bottom:0">
        <label>Observação (opcional)</label>
        <input class="inp" id="gcObs" value="${entry.obs||''}" placeholder="Ex: Ranhura, pede troca"
          oninput="_gcSalvarObs(this.value)">
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <button class="btn btn-outline" onclick="_gcNavegar(-1)" ${_contagemIdx===0?'disabled':''}>← Anterior</button>
      <button onclick="_pularItem()" style="font-size:var(--text-xs);color:var(--muted);background:none;border:none;cursor:pointer">Pular</button>
      ${_contagemIdx < total - 1
        ? `<button class="btn btn-primary" onclick="_gcNavegar(1)">Próximo →</button>`
        : `<button class="btn btn-primary" onclick="_finalizarContagem()" style="background:var(--green)">${lc('check',13,'currentColor')} Finalizar</button>`}
    </div>
    <div style="text-align:center;margin-top:14px">
      <button onclick="_cancelarContagem()" style="font-size:var(--text-xs);color:var(--muted);background:none;border:none;cursor:pointer">Cancelar contagem</button>
    </div>
  </div>`;
}

function _gcSetStatus(s) {
  _gcStatusAtual = s;
  if (_invContagemAtiva?.itens[_contagemIdx]) { _invContagemAtiva.itens[_contagemIdx].status = s; saveContagensInv(); }
  Object.keys(INV_CONT_STATUS).forEach(ss => {
    const btn = document.getElementById('gcSt_' + ss);
    if (!btn) return;
    const st = INV_CONT_STATUS[ss]; const active = ss === s;
    btn.style.borderColor = active ? st.color : 'var(--border)';
    btn.style.background  = active ? st.bg    : 'var(--surface2)';
    btn.style.color       = active ? st.color : 'var(--muted)';
    btn.style.fontWeight  = active ? '700'    : '500';
  });
}

function _gcSalvarQtd(val) {
  if (_invContagemAtiva?.itens[_contagemIdx]) { _invContagemAtiva.itens[_contagemIdx].quantidade = parseInt(val)||null; saveContagensInv(); }
}
function _gcSalvarObs(val) {
  if (_invContagemAtiva?.itens[_contagemIdx]) { _invContagemAtiva.itens[_contagemIdx].obs = val; saveContagensInv(); }
}

function _gcNavegar(dir) {
  const entry = _invContagemAtiva.itens[_contagemIdx];
  if (entry && !entry.status) { entry.status = _gcStatusAtual || 'bom'; saveContagensInv(); }
  _contagemIdx = Math.max(0, Math.min(_invContagemAtiva.itens.length - 1, _contagemIdx + dir));
  _renderContagemGuiada(document.getElementById('invContent'));
}
function _pularItem() {
  _contagemIdx = Math.min(_invContagemAtiva.itens.length - 1, _contagemIdx + 1);
  _renderContagemGuiada(document.getElementById('invContent'));
}

// ── Modo Lista ────────────────────────────────────────────────

function _renderContagemLista(cont) {
  const items    = _getInvData();
  const concluidos = _invContagemAtiva.itens.filter(e => e.status !== null).length;
  const total    = _invContagemAtiva.itens.length;
  const locLabel = _invContagemAtiva.localFiltro
    ? inventarioLocs.find(l => l.id === _invContagemAtiva.localFiltro)?.label || ''
    : '';

  cont.innerHTML = `<div style="padding:20px 24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:var(--text-md);font-weight:800;margin-bottom:2px">${lc('list',14,'var(--purple)')} Contagem em Lista</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${_invContagemAtiva.responsavel} · ${fmtD(_invContagemAtiva.data)}${locLabel?' · '+locLabel:''}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="_cancelarContagem()">Cancelar</button>
        <button class="btn btn-primary btn-sm" onclick="_finalizarContagem()">${lc('check',13,'currentColor')} Finalizar (${concluidos}/${total})</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:4px">
      ${_invContagemAtiva.itens.map((entry, idx) => {
        const inv  = items.find(x => x.id === entry.itemId);
        const cat  = inventarioCats[inv?.grupo||'equipamento'] || {};
        const bord = entry.status === 'nao_encontrado' ? 'var(--muted)' : entry.status === 'ruim' ? 'var(--red)44' : entry.status === 'atencao' ? 'var(--yellow)44' : entry.status === 'bom' ? 'var(--green)44' : 'var(--border)';
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid ${bord};border-radius:var(--r8)">
          <div style="width:28px;height:28px;border-radius:var(--r6);background:${cat.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
            ${lc(cat.icon||'package',12,cat.color||'var(--muted)')}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:6px">${entry.nome}${entry.qtdAnterior!==null&&entry.tipo==='quantidade'?`<span style="font-size:var(--text-xs);color:var(--muted);font-weight:400;margin-left:6px">último: ${entry.qtdAnterior}</span>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              ${entry.tipo==='quantidade'?`<input type="number" value="${entry.quantidade??''}" min="0"
                placeholder="Qtd atual"
                style="width:100px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);font-family:Inter,sans-serif;background:var(--surface2)"
                oninput="_listaSetQtd(${idx},this.value)">`:''}
              ${Object.entries(INV_CONT_STATUS).map(([s, st]) => {
                const active = entry.status === s;
                return `<button onclick="_listaSetStatus(${idx},'${s}')"
                  style="padding:3px 8px;border:1.5px solid ${active?st.color:'var(--border)'};border-radius:var(--r6);
                  background:${active?st.bg:'var(--surface2)'};color:${active?st.color:'var(--muted)'};
                  font-size:var(--text-2xs);font-weight:${active?'700':'500'};cursor:pointer;font-family:Inter,sans-serif">${st.label}</button>`;
              }).join('')}
              <input placeholder="Obs..." value="${entry.obs||''}"
                style="flex:1;min-width:80px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);font-family:Inter,sans-serif;background:var(--surface2)"
                oninput="_listaSetObs(${idx},this.value)">
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function _listaSetStatus(idx, s) {
  if (!_invContagemAtiva) return;
  _invContagemAtiva.itens[idx].status = s;
  saveContagensInv();
  _renderContagemLista(document.getElementById('invContent'));
}
function _listaSetQtd(idx, val) {
  if (!_invContagemAtiva) return;
  _invContagemAtiva.itens[idx].quantidade = parseInt(val)||null;
  saveContagensInv();
}
function _listaSetObs(idx, val) {
  if (!_invContagemAtiva) return;
  _invContagemAtiva.itens[idx].obs = val;
  saveContagensInv();
}

function _cancelarContagem() {
  vtpConfirm({
    title: 'Cancelar contagem',
    message: 'Os dados serão perdidos.',
    confirmLabel: 'Cancelar contagem',
    onConfirm: () => {
      contagensInv = contagensInv.filter(c => c.id !== _invContagemAtiva?.id);
      _invContagemAtiva = null;
      saveContagensInv();
      _renderInvContagem();
    }
  });
}

// ── Finalizar ────────────────────────────────────────────────

function _finalizarContagem() {
  if (!_invContagemAtiva) return;

  _invContagemAtiva.itens.forEach(e => { if (!e.status) e.status = 'bom'; });
  _invContagemAtiva.status       = 'concluida';
  _invContagemAtiva.concluida_at  = new Date().toISOString();

  const items    = _getInvData();
  const ruins    = [];
  const sumidos  = [];

  _invContagemAtiva.itens.forEach(entry => {
    const inv = items.find(x => x.id === entry.itemId);
    if (!inv) return;

    if (entry.status === 'nao_encontrado') {
      sumidos.push(inv.nome);
      inv.invStatus  = 'atencao';
    } else {
      inv.invStatus = entry.status;
      if (entry.status === 'ruim') ruins.push(inv.nome);
    }

    if (inv.invTipo === 'quantidade' && entry.quantidade !== null) inv.invQtdAtual = entry.quantidade;
    inv.updated_at = new Date().toISOString();

    if (inv.invTipo === 'quantidade' && entry.quantidade !== null && entry.quantidade < (inv.invQtdIdeal||1)) {
      if (typeof criarAlerta === 'function') criarAlerta({
        tipo: 'inventario_reposicao', titulo: `Reposição: ${inv.nome}`,
        mensagem: `Contagem: ${entry.quantidade}/${inv.invQtdIdeal||1}. Abaixo do ideal.`,
        modulo: 'inventario', destino_roles: ['gerente','supervisor'],
        referencia_id: inv.id, acao_label: 'Ver inventário', acao_modulo: 'inventario',
      });
    }
  });

  if (ruins.length && typeof criarAlerta === 'function') criarAlerta({
    tipo: 'inventario_item_ruim', titulo: `${ruins.length} item(ns) em estado Ruim`,
    mensagem: ruins.join(', '),
    modulo: 'inventario', destino_roles: ['gerente','supervisor'],
    acao_label: 'Ver inventário', acao_modulo: 'inventario',
  });
  if (sumidos.length && typeof criarAlerta === 'function') criarAlerta({
    tipo: 'inventario_item_ruim', titulo: `${sumidos.length} item(ns) não encontrado(s)`,
    mensagem: sumidos.join(', '),
    modulo: 'inventario', destino_roles: ['gerente','supervisor'],
    acao_label: 'Ver inventário', acao_modulo: 'inventario',
  });

  _saveInvData();
  saveContagensInv();
  _invContagemAtiva = null;
  toast(`${lc('check-circle',14,'var(--green)')} Contagem finalizada!`);
  setInvTab('historico');
}

// ══════════════════════════════════════════════════════════════
// HISTÓRICO
// ══════════════════════════════════════════════════════════════

function _renderInvHistorico() {
  const cont = document.getElementById('invContent');
  if (!cont) return;
  const sessoes = contagensInv.filter(c => c.status === 'concluida').sort((a,b) => b.data.localeCompare(a.data));

  cont.innerHTML = `<div style="padding:20px 24px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:2px">${lc('history',14,'var(--purple)')} Histórico de Contagens</h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">${sessoes.length} contagem${sessoes.length!==1?'s':''} realizada${sessoes.length!==1?'s':''}</div>
      </div>
    </div>

    ${!sessoes.length
      ? `<div class="empty"><div class="empty-icon">${lc('clipboard',16,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Nenhuma contagem realizada</div><div>As contagens mensais aparecerão aqui</div></div>`
      : `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
          <div style="display:grid;grid-template-columns:110px 1fr 60px 80px repeat(3,70px);padding:8px 14px;background:var(--surface2);font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);gap:8px;align-items:center">
            <span>Data</span><span>Responsável / Local</span><span style="text-align:center">Itens</span><span style="text-align:center">Modo</span>
            <span style="text-align:center;color:var(--red)">Ruim</span>
            <span style="text-align:center;color:var(--orange-dark)">Atenção</span>
            <span style="text-align:center;color:var(--muted)">N/E</span>
          </div>
          ${sessoes.map((s, idx) => {
            const sumidos = s.itens.filter(x => x.status==='nao_encontrado').length;
            const ruins   = s.itens.filter(x => x.status==='ruim').length;
            const atencao = s.itens.filter(x => x.status==='atencao').length;
            const tudo_ok = !sumidos && !ruins && !atencao;
            const localLabel = s.localFiltro
              ? (inventarioLocs.find(l=>l.id===s.localFiltro)?.label || s.localFiltro)
              : 'Todos os locais';
            return `<div onclick="_invToggleDetalhe('hid${s.id}')"
              style="display:grid;grid-template-columns:110px 1fr 60px 80px repeat(3,70px);padding:9px 14px;
              border-top:1px solid var(--border);align-items:center;gap:8px;cursor:pointer;
              background:${idx%2===0?'var(--surface)':'var(--surface2)'}"
              onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
              <div style="font-size:var(--text-sm);font-weight:700">${fmtD(s.data)}</div>
              <div>
                <div style="font-size:var(--text-sm);font-weight:600">${s.responsavel}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted)">${localLabel}</div>
              </div>
              <div style="text-align:center;font-size:var(--text-sm);color:var(--muted)">${s.itens.length}</div>
              <div style="text-align:center">
                <span style="font-size:var(--text-2xs);padding:1px 6px;border-radius:6px;background:var(--surface2);color:var(--muted)">${s.modo==='guiado'?'Guiado':'Lista'}</span>
              </div>
              <div style="text-align:center;font-size:var(--text-sm);font-weight:700;color:${ruins?'var(--red)':'var(--muted)'}">${ruins||'—'}</div>
              <div style="text-align:center;font-size:var(--text-sm);font-weight:700;color:${atencao?'var(--orange-dark)':'var(--muted)'}">${atencao||'—'}</div>
              <div style="text-align:center;font-size:var(--text-sm);font-weight:700;color:${sumidos?'var(--muted)':'var(--muted)'}">${sumidos||'—'}</div>
            </div>
            <div id="hid${s.id}" style="display:none;padding:10px 14px 14px;border-top:1px solid var(--border);background:var(--surface2);grid-column:1/-1">
              ${_invDetalheContagem(s)}
            </div>`;
          }).join('')}
        </div>`
    }
  </div>`;
}

function _invToggleDetalhe(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function _invDetalheContagem(s) {
  const ruins   = s.itens.filter(x => x.status==='ruim');
  const atencao = s.itens.filter(x => x.status==='atencao');
  const sumidos = s.itens.filter(x => x.status==='nao_encontrado');
  if (!ruins.length && !atencao.length && !sumidos.length) {
    return `<div style="font-size:var(--text-sm);color:var(--green);display:flex;align-items:center;gap:5px;font-weight:600">${lc('check-circle',12,'currentColor')} Tudo em bom estado</div>`;
  }
  const chip = (nome, bg, color) => `<span style="padding:2px 8px;border-radius:6px;font-size:var(--text-xs);font-weight:600;background:${bg};color:${color}">${nome}</span>`;
  return [
    ruins.length   ? `<div style="margin-bottom:6px"><span style="font-size:var(--text-xs);font-weight:700;color:var(--red);margin-right:6px">Ruim:</span><span style="display:inline-flex;gap:4px;flex-wrap:wrap">${ruins.map(x=>chip(x.nome,'var(--red-light)','var(--red)')).join('')}</span></div>` : '',
    atencao.length ? `<div style="margin-bottom:6px"><span style="font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);margin-right:6px">Atenção:</span><span style="display:inline-flex;gap:4px;flex-wrap:wrap">${atencao.map(x=>chip(x.nome,'var(--yellow-light)','var(--orange-dark)')).join('')}</span></div>` : '',
    sumidos.length ? `<div><span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);margin-right:6px">Não encontrado:</span><span style="display:inline-flex;gap:4px;flex-wrap:wrap">${sumidos.map(x=>chip(x.nome,'var(--surface2)','var(--muted)')).join('')}</span></div>` : '',
  ].filter(Boolean).join('');
}

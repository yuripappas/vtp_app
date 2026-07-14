/**
 * VTP Compras — Vai Ter Pizza!
 * cadastros.js — Módulo de Cadastros (Insumos, Fornecedores, Pré-preparo)
 */

const PREST_CATS = {
  refrigeracao:   { label:'Refrigeração',   icon:'thermometer', color:'var(--purple)',      bg:'var(--purple-xlight)' },
  fornos_gas:     { label:'Fornos e Gás',   icon:'flame',       color:'var(--red)',         bg:'var(--red-light)'     },
  eletrica:       { label:'Elétrica',       icon:'zap',         color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  climatizacao:   { label:'Climatização',   icon:'wind',        color:'var(--muted)',       bg:'var(--surface2)'      },
  equipamentos:   { label:'Equipamentos',   icon:'settings',    color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  hidraulica:     { label:'Hidráulica',     icon:'droplets',    color:'var(--purple)',      bg:'var(--purple-xlight)' },
  infraestrutura: { label:'Infraestrutura', icon:'building-2',  color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  tecnologia:     { label:'Tecnologia',     icon:'monitor',     color:'var(--purple)',      bg:'var(--purple-xlight)' },
  seguranca:      { label:'Segurança',      icon:'shield',      color:'var(--red)',         bg:'var(--red-light)'     },
  delivery:       { label:'Delivery',       icon:'truck',       color:'var(--orange-dark)', bg:'var(--orange-light)'  },
};

const PREST_CONFIANCA = {
  prioritario: { label:'Prioritário', icon:'star',       color:'var(--green)',       bg:'var(--green-light)'  },
  backup:      { label:'Backup',      icon:'bookmark',   color:'var(--yellow)',      bg:'var(--yellow-light)' },
  bloqueado:   { label:'Bloqueado',   icon:'ban',        color:'var(--red)',         bg:'var(--red-light)'    },
};

// ══════════════════════════════════════════════════════════════
// NAVEGAÇÃO DAS ABAS DE CADASTRO
// ══════════════════════════════════════════════════════════════

let _cadTab = 'insumos';
window._vtpGetTab_cadastros = () => _cadTab;
window._vtpSetTab_cadastros = (v) => { _cadTab = v; };

function setCadTab(tab) {
  _cadTab = tab;
  ['insumos', 'fornecedores', 'servicos', 'preparo', 'produtos', 'terceirizados', 'funcionarios'].forEach(t => {
    const panel = document.getElementById(`cad-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    document.getElementById(`cad-tab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'insumos')       renderCadInsumos();
  if (tab === 'fornecedores')  renderFornecedores();
  if (tab === 'servicos')      renderPrestadores();
  if (tab === 'preparo')       renderPreparoGrid();
  if (tab === 'produtos')      renderCadFichas();
  if (tab === 'terceirizados') renderTerceirizados();
  if (tab === 'funcionarios')  renderFuncionarios();
}

function renderCadastros() {
  if (typeof _cfgCadRestore === 'function') _cfgCadRestore();
  setCadTab('insumos');
}

// ══════════════════════════════════════════════════════════════
// CADASTRO DE INSUMOS
// ══════════════════════════════════════════════════════════════

function renderCadInsumos() {
  const q   = document.getElementById('srchCadInsumos')?.value?.toLowerCase() || '';
  const cat = document.getElementById('catCadFil')?.value || '';

  const insumos = items.filter(i => !i.isProd);

  // Popula filtro de categoria
  const cats  = [...new Set(insumos.map(i => i.cat))].sort();
  const catEl = document.getElementById('catCadFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
    const dl = document.getElementById('catDL');
    if (dl) dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  }

  let filt = insumos.filter(i => {
    if (q && !i.name.toLowerCase().includes(q) && !i.cat.toLowerCase().includes(q)) return false;
    if (cat && i.cat !== cat) return false;
    if (window._cadFilEmb    && !(i.unidCompra && i.qtdEmb > 0)) return false;
    if (window._cadFilDiaria && !i.debitoAuto)                    return false;
    return true;
  }).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  const el = document.getElementById('cadInsumosGrid');
  if (!filt.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">${lc("package",14,"currentColor")}</div><div style="font-weight:700;margin-bottom:4px">Nenhum insumo cadastrado</div><div>Clique em "Novo Insumo" para começar</div></div>`;
    return;
  }

  const inCfg = !!document.getElementById('cfgSectionContent')?.contains(el);

  // Agrupa por categoria
  const bycat = {};
  filt.forEach(i => { if (!bycat[i.cat]) bycat[i.cat] = []; bycat[i.cat].push(i); });

  if (inCfg) {
    const nEmb    = insumos.filter(i => i.unidCompra && i.qtdEmb > 0).length;
    const nDiaria = insumos.filter(i => i.debitoAuto).length;
    const filEmb  = !!window._cadFilEmb;
    const filDia  = !!window._cadFilDiaria;

    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '0';
    el.innerHTML = `
<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
  <span style="font-size:var(--text-xs);color:var(--muted);font-weight:600">Filtrar:</span>
  <button onclick="window._cadFilEmb=!window._cadFilEmb;renderCadInsumos()"
    style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:99px;border:1.5px solid ${filEmb?'var(--purple)':'var(--border)'};background:${filEmb?'var(--purple-xlight)':'transparent'};color:${filEmb?'var(--purple)':'var(--muted)'};font-size:var(--text-xs);font-weight:700;cursor:pointer">
    ${lc('package',11,'currentColor')} Embalagem <span style="font-size:var(--text-2xs);opacity:.7">(${nEmb})</span>
  </button>
  <button onclick="window._cadFilDiaria=!window._cadFilDiaria;renderCadInsumos()"
    style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:99px;border:1.5px solid ${filDia?'var(--orange-dark)':'var(--border)'};background:${filDia?'var(--orange-light)':'transparent'};color:${filDia?'var(--orange-dark)':'var(--muted)'};font-size:var(--text-xs);font-weight:700;cursor:pointer">
    ${lc('zap',11,'currentColor')} Débito CW <span style="font-size:var(--text-2xs);opacity:.7">(${nDiaria})</span>
  </button>
  ${filEmb||filDia ? `<button onclick="window._cadFilEmb=false;window._cadFilDiaria=false;renderCadInsumos()"
    style="font-size:var(--text-xs);color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 6px">limpar</button>` : ''}
  <span style="font-size:var(--text-xs);color:var(--muted)">${filt.length} insumo${filt.length!==1?'s':''}</span>
  <button id="cadInsumosGrid-toggleAll" class="btn btn-ghost btn-xs" style="color:var(--muted);margin-left:auto"
    onclick="toggleAllCfgCats('cadInsumosGrid')">Colapsar tudo</button>
</div>
${Object.entries(bycat).map(([cat, catItems]) => `
  <div class="cfg-cat-group">
    <button class="cfg-cat-toggle" onclick="toggleCfgCat(this)">
      <span class="cfg-cat-label">${cat}</span>
      <span class="cfg-cat-count">(${catItems.length})</span>
      <span class="cfg-cat-chevron">${lc('chevron-down',14,'currentColor')}</span>
    </button>
    <div class="cfg-cat-body" style="display:flex;flex-direction:column;gap:3px">
      ${catItems.map(item => {
        const supIds  = item.supIds?.length ? item.supIds : (item.supId ? [item.supId] : []);
        const sups    = supIds.map(id => suppliers.find(s => s.id === id)).filter(Boolean);
        const temEmb  = !!(item.unidCompra && item.qtdEmb > 0);
        const temDebito = !!item.debitoAuto;
        const supExcCfg = item.supIdExclusivo ? suppliers.find(s => s.id === item.supIdExclusivo) : null;
        return `<div class="cfg-row" style="cursor:pointer" onclick="openEditItem(${item.id})"
            onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="cfg-row-label">${item.name}</span>
              <span style="font-size:var(--text-xs);color:var(--muted)">${item.unit}${item.code?' · #'+item.code:''}</span>
              ${temEmb ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--purple-xlight);color:var(--purple);white-space:nowrap">${lc('package',9,'currentColor')} ${item.unidCompra} ${fmt(item.qtdEmb)}${item.unit}</span>` : ''}
              ${temDebito ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--green-light);color:var(--green);white-space:nowrap">${lc('zap',9,'currentColor')} Débito CW</span>` : ''}
              ${supExcCfg ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--orange-light);color:var(--orange-dark);border:1px solid var(--orange-dark);white-space:nowrap">${lc('star',9,'currentColor')} Exclusivo · ${supExcCfg.name}</span>` : ''}
            </div>
            <div class="cfg-row-sub" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:2px">
              <span>Mín: <strong>${item.min}</strong> · Ideal: <strong>${item.ideal}</strong> · Custo: <strong style="color:var(--purple)">R$ ${fmt(item.cost)}</strong></span>
              ${sups.length ? `<span>${lc("building-2",9,"currentColor")} ${sups.map(s=>s.name).join(', ')}</span>` : ''}
            </div>
          </div>
          <div class="cfg-row-actions">
            <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openEditItem(${item.id})">${lc("edit-2",12,"currentColor")}</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`).join('')}`;
    return;
  }

  el.style.display = '';

  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '0';
  el.innerHTML = Object.entries(bycat).map(([cat, catItems]) => `
    <div class="cfg-cat-group">
      <button class="cfg-cat-toggle" onclick="toggleCfgCat(this)">
        <span class="cfg-cat-label">${cat}</span>
        <span class="cfg-cat-count">(${catItems.length})</span>
        <span class="cfg-cat-chevron">${lc('chevron-down',14,'currentColor')}</span>
      </button>
      <div class="cfg-cat-body" style="padding:0;margin-bottom:8px">
        <div class="card" style="padding:0;overflow:hidden">
          ${catItems.map(item => {
            const supIds = item.supIds?.length ? item.supIds : (item.supId ? [item.supId] : []);
            const sups   = supIds.map(id => suppliers.find(s => s.id === id)).filter(Boolean);
            const temEmb = !!(item.unidCompra && item.qtdEmb > 0);
            const temDebito = !!item.debitoAuto;
            const supExc = item.supIdExclusivo ? suppliers.find(s => s.id === item.supIdExclusivo) : null;
            return `<div class="insumo-row" onclick="openEditItem(${item.id})">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-size:var(--text-sm);font-weight:700">${item.name}</span>
                  <span style="font-size:var(--text-xs);color:var(--muted)">${item.unit}${item.code?' · #'+item.code:''}</span>
                  ${temEmb?`<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--purple-xlight);color:var(--purple);white-space:nowrap">${lc('package',9,'currentColor')} ${item.unidCompra} ${fmt(item.qtdEmb)}${item.unit}</span>`:''}
                  ${temDebito?`<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--green-light);color:var(--green);white-space:nowrap">${lc('zap',9,'currentColor')} Débito CW</span>`:''}
                </div>
                ${sups.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
                  ${sups.map(s => {
                    const isExc = supExc && s.id === supExc.id;
                    return isExc
                      ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--orange-light);color:var(--orange-dark);border:1px solid var(--orange-dark);white-space:nowrap">${lc('lock',8,'currentColor')} Exclusivo · ${s.name}</span>`
                      : `<span class="badge b-gray" style="font-size:var(--text-2xs)">${s.name}</span>`;
                  }).join('')}
                </div>`:''}
              </div>
              <div class="insumo-row-meta" style="text-align:right;font-size:var(--text-xs);color:var(--muted);line-height:1.7;flex-shrink:0">
                <div>Mín <strong style="color:var(--text)">${item.min}</strong> · Ideal <strong style="color:var(--text)">${item.ideal}</strong></div>
                <div>Custo <strong style="color:var(--purple)">R$ ${fmt(item.cost)}</strong></div>
              </div>
              <button class="btn btn-ghost btn-xs" style="flex-shrink:0" onclick="event.stopPropagation();openEditItem(${item.id})">${lc("edit-2",12,"currentColor")}</button>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`).join('');
}

// ── Modal insumo (sem campo qty — só cadastro) ──
function openItemModal() {
  editItemId = null;
  document.getElementById('itemModalTitle').textContent = 'Novo Insumo';
  document.getElementById('eItemId').value = '';
  ['fName','fCat','fB0','fB1','fB2','fCode'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _setEmbDisplay('');
  ['fMin','fIdeal','fCost','fQtdEmb'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('fUnit').value = 'kg';
  const prev = document.getElementById('fEmbPreview'); if (prev) prev.textContent = '';
  populateSupChecks([]);
  const cd = document.getElementById('fContagemDiaria'); if (cd) cd.checked = false;
  document.getElementById('delItemBtn').style.display = 'none';
  document.getElementById('ovItem').classList.add('open');
  setTimeout(() => document.getElementById('fName').focus(), 80);
}

function openEditItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  editItemId = id;
  document.getElementById('itemModalTitle').textContent = `${item.name}`;
  document.getElementById('fName').value  = item.name;
  document.getElementById('fCat').value   = item.cat;
  document.getElementById('fUnit').value  = item.unit;
  document.getElementById('fMin').value   = item.min;
  document.getElementById('fIdeal').value = item.ideal;
  document.getElementById('fCost').value  = item.cost;
  document.getElementById('fCode').value  = item.code || '';
  const b = item.brands || [];
  document.getElementById('fB0').value = b[0] || '';
  document.getElementById('fB1').value = b[1] || '';
  document.getElementById('fB2').value = b[2] || '';
  // Campos de embalagem de compra
  const qeEl = document.getElementById('fQtdEmb');
  _setEmbDisplay(item.unidCompra || '');
  if (qeEl) qeEl.value = item.qtdEmb > 0 ? item.qtdEmb : '';
  atualizarLabelEmb();
  // Suporta supIds (array novo) e supId (legado)
  const supIds = item.supIds?.length ? item.supIds : (item.supId ? [item.supId] : []);
  populateSupChecks(supIds, item.supIdExclusivo ?? null);
  const da = document.getElementById('fDebitoAuto');     if (da) da.checked = !!item.debitoAuto;
  document.getElementById('delItemBtn').style.display = 'inline-flex';
  document.getElementById('ovItem').classList.add('open');
}

function _setEmbDisplay(nome) {
  const inp = document.getElementById('fUnidCompra');
  if (inp) inp.value = nome;
  const txt = document.getElementById('fUnidCompraTxt');
  if (txt) {
    txt.textContent = nome || 'Selecionar tipo de embalagem...';
    txt.style.color = nome ? 'var(--text)' : 'var(--muted)';
  }
  const btn = document.getElementById('fUnidCompraBtn');
  if (btn) btn.style.borderColor = nome ? 'var(--purple)' : 'var(--border)';
  document.querySelectorAll('._embChip').forEach(el => {
    const isSelected = el.textContent.trim().startsWith(nome) && nome;
    el.classList.toggle('sel', !!isSelected);
  });
}

function abrirEmbPicker() {
  const cur = document.getElementById('fUnidCompra')?.value || '';
  document.querySelectorAll('._embChip').forEach(el => {
    el.classList.toggle('sel', el.querySelector('strong')?.textContent === cur);
  });
  const ci = document.getElementById('fEmbCustom');
  if (ci) ci.value = '';
  document.getElementById('ovEmbPicker').classList.add('open');
}

function selecionarEmb(nome) {
  _setEmbDisplay(nome);
  document.getElementById('ovEmbPicker').classList.remove('open');
  atualizarLabelEmb();
}

function confirmarEmbCustom() {
  const val = document.getElementById('fEmbCustom')?.value.trim();
  if (!val) { document.getElementById('fEmbCustom')?.focus(); return; }
  selecionarEmb(val);
}

// Preview dinâmico da conversão de embalagem no modal
function atualizarLabelEmb() {
  const unit     = document.getElementById('fUnit')?.value || 'un';
  const nome     = document.getElementById('fUnidCompra')?.value.trim() || '';
  const qtd      = parseFloat(document.getElementById('fQtdEmb')?.value) || 0;
  const prev     = document.getElementById('fEmbPreview');
  const lbl      = document.getElementById('fQtdEmbLabel');
  if (lbl) lbl.textContent = `Qtd. em ${unit} por embalagem`;
  if (!prev) return;
  if (!nome || qtd <= 0) { prev.textContent = ''; return; }
  // Exemplos de conversão
  const ideal = parseFloat(document.getElementById('fIdeal')?.value) || 0;
  const embs  = ideal > 0 ? Math.ceil(ideal / qtd) : null;
  prev.innerHTML = `
    ${lc('info',11,'var(--purple)')}
    1 ${nome} = ${fmt(qtd)} ${unit}
    ${embs !== null ? `· Ideal: ${fmt(ideal)} ${unit} = <strong>${embs} ${nome}(s)</strong>` : ''}`;
}

function populateSupChecks(selIds, supIdExclusivo) {
  const wrap = document.getElementById('fSupIds');
  if (!wrap) return;
  const searchEl = document.getElementById('fSupSearch');
  if (searchEl) searchEl.value = '';
  if (!suppliers.length) {
    wrap.innerHTML = `<span style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Nenhum fornecedor cadastrado</span>`;
    return;
  }
  const sel = new Set((selIds||[]).map(Number));
  const excId = supIdExclusivo ? Number(supIdExclusivo) : null;

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto;font-size:var(--text-2xs);font-weight:700;color:var(--muted);
      text-transform:uppercase;letter-spacing:.5px;padding:0 6px 4px;border-bottom:1px solid var(--border);margin-bottom:4px">
      <span>Fornecedor</span>
      <span title="Marcar como exclusivo — item pula a cotação e vai direto com este fornecedor">Exclusivo</span>
    </div>
    ${suppliers.map(s => {
      const isSel = sel.has(s.id);
      const isExc = excId === s.id;
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:var(--r6);
        background:${isExc?'var(--orange-light)':isSel?'var(--purple-xlight)':'transparent'};transition:background .1s"
        id="supRow_${s.id}">
        <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer">
          <input type="checkbox" name="supCheck" value="${s.id}" ${isSel||isExc?'checked':''}
            style="accent-color:var(--purple);width:15px;height:15px;flex-shrink:0"
            onchange="_onSupCheckChange(${s.id})">
          <span style="font-size:var(--text-sm);font-weight:${isSel||isExc?'600':'400'}">${s.name}</span>
          ${s.seller?`<span style="font-size:var(--text-xs);color:var(--muted)">${s.seller}</span>`:''}
          ${isExc?`<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:99px;background:var(--orange-dark);color:#fff">exclusivo</span>`:''}
        </label>
        <input type="radio" name="supExclusivo" value="${s.id}" ${isExc?'checked':''}
          title="Fornecedor exclusivo — pula cotação"
          style="accent-color:var(--orange-dark);width:15px;height:15px;flex-shrink:0;cursor:pointer"
          onchange="_onSupExclusivoChange(${s.id})">
      </div>`;
    }).join('')}
    <button type="button" onclick="_limparExclusivo()"
      style="margin-top:6px;font-size:var(--text-xs);color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 6px;text-decoration:underline">
      Remover exclusivo
    </button>`;
}

function _onSupCheckChange(supId) {
  const cb = document.querySelector(`#supRow_${supId} input[type=checkbox]`);
  const row = document.getElementById(`supRow_${supId}`);
  const excRadio = document.querySelector(`#supRow_${supId} input[type=radio]`);
  if (!cb || !row) return;
  if (!cb.checked) {
    // Desmarcou: limpa exclusivo também se era este
    if (excRadio?.checked) { excRadio.checked = false; _atualizarCoresSupRows(); }
  }
  _atualizarCoresSupRows();
}

function _onSupExclusivoChange(supId) {
  // Ao marcar exclusivo, garante que o checkbox também está marcado
  const cb = document.querySelector(`#supRow_${supId} input[type=checkbox]`);
  if (cb) cb.checked = true;
  _atualizarCoresSupRows();
}

function _limparExclusivo() {
  document.querySelectorAll('#fSupIds input[type=radio]').forEach(r => r.checked = false);
  _atualizarCoresSupRows();
}

function _atualizarCoresSupRows() {
  suppliers.forEach(s => {
    const row = document.getElementById(`supRow_${s.id}`);
    if (!row) return;
    const cb  = row.querySelector('input[type=checkbox]');
    const rad = row.querySelector('input[type=radio]');
    const isExc = rad?.checked;
    const isSel = cb?.checked;
    row.style.background = isExc ? 'var(--orange-light)' : isSel ? 'var(--purple-xlight)' : 'transparent';
    const nameEl = row.querySelector('span:first-of-type');
    if (nameEl) nameEl.style.fontWeight = isSel || isExc ? '600' : '400';
    // Badge exclusivo
    const existingBadge = row.querySelector('.badge-exclusivo');
    if (existingBadge) existingBadge.remove();
    if (isExc) {
      const badge = document.createElement('span');
      badge.className = 'badge-exclusivo';
      badge.style.cssText = 'font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:99px;background:var(--orange-dark);color:#fff';
      badge.textContent = 'exclusivo';
      row.querySelector('label')?.appendChild(badge);
    }
  });
}

function getSupExclusivoId() {
  const rad = document.querySelector('#fSupIds input[type=radio]:checked');
  return rad ? parseInt(rad.value) : null;
}

function _filtrarFornSupSearch() {
  const norm   = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q      = norm(document.getElementById('fSupSearch')?.value.trim() || '');
  const labels = document.querySelectorAll('#fSupIds label');
  let visible  = 0;
  labels.forEach(lbl => {
    const match = !q || norm(lbl.textContent).includes(q);
    lbl.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const empty = document.getElementById('fSupSearchEmpty');
  if (empty) empty.remove();
  if (q && visible === 0) {
    const msg = document.createElement('span');
    msg.id = 'fSupSearchEmpty';
    msg.style.cssText = 'font-size:var(--text-xs);color:var(--muted);font-style:italic;padding:4px 6px';
    msg.textContent = 'Nenhum fornecedor encontrado';
    document.getElementById('fSupIds')?.appendChild(msg);
  }
}

function getSupCheckedIds() {
  const wrap = document.getElementById('fSupIds');
  if (!wrap) return [];
  return [...wrap.querySelectorAll('input[type=checkbox]:checked')].map(cb => parseInt(cb.value));
}

function saveItem() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const supIds    = getSupCheckedIds();
  const newBrands = [
    document.getElementById('fB0').value.trim(),
    document.getElementById('fB1').value.trim(),
    document.getElementById('fB2').value.trim(),
  ].filter(Boolean);

  // Proteção: avisa se dados importantes serão apagados
  if (editItemId) {
    const itemAntes = items.find(i => i.id === editItemId);
    if (itemAntes) {
      const alertas = [];
      const supAntes = itemAntes.supIds?.length || (itemAntes.supId ? 1 : 0);
      if (supAntes > 0 && supIds.length === 0)
        alertas.push(supAntes + ' fornecedor(es) vinculado(s) serão removidos');
      const brandsAntes = (itemAntes.brands || []).filter(Boolean);
      if (brandsAntes.length > 0 && newBrands.length === 0)
        alertas.push('marcas configuradas (' + brandsAntes.join(', ') + ') serão apagadas');
      if (alertas.length > 0) {
        vtpConfirm({
          title: 'Atenção — dados serão perdidos',
          message: 'Ao salvar:\n• ' + alertas.join('\n• ') + '\n\nDeseja continuar?',
          confirmLabel: 'Salvar mesmo assim',
          onConfirm: () => _saveItemConfirmado(name, supIds),
        });
        return;
      }
    }
  }
  _saveItemConfirmado(name, supIds);
}

function _saveItemConfirmado(name, supIds) {
  const unidCompra    = document.getElementById('fUnidCompra')?.value.trim() || '';
  const qtdEmb        = parseFloat(document.getElementById('fQtdEmb')?.value) || 0;
  const supIdExclusivo = getSupExclusivoId();
  const data = {
    name,
    cat:        document.getElementById('fCat').value.trim() || 'Outros',
    unit:       document.getElementById('fUnit').value,
    min:        parseFloat(document.getElementById('fMin').value)   || 0,
    ideal:      parseFloat(document.getElementById('fIdeal').value) || 0,
    cost:       parseFloat(document.getElementById('fCost').value)  || 0,
    code:       document.getElementById('fCode').value.trim(),
    supIds,
    supId:      supIds[0] ?? null,
    supIdExclusivo: supIdExclusivo,
    unidCompra,
    qtdEmb,
    brands: [
      document.getElementById('fB0').value.trim(),
      document.getElementById('fB1').value.trim(),
      document.getElementById('fB2').value.trim(),
    ],
    isProd:          false,
    debitoAuto:      document.getElementById('fDebitoAuto')?.checked || false,
  };
  if (editItemId) {
    const idx = items.findIndex(i => i.id === editItemId);
    if (idx >= 0) items[idx] = { ...items[idx], ...data };
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" atualizado!`);
  } else {
    items.push({ id: nextIid++, qty: 0, ...data });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" adicionado!`);
  }
  saveI();
  try { logAudit('insumo_salvo', name, 'cadastros'); } catch(e) {}
  closeModal('ovItem');
  renderCadInsumos();
  renderDashboard();
}

function deleteItem() {
  if (!editItemId) return;
  const item = items.find(i => i.id === editItemId);
  if (!item) return;
  vtpConfirm({
    title: `Excluir "${item.name}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      items = items.filter(i => i.id !== editItemId);
      saveI();
      closeModal('ovItem');
      renderCadInsumos();
      renderDashboard();
      toast(`${lc("trash-2",14,"currentColor")} "${item.name}" excluído.`);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// CADASTRO DE PRÉ-PREPARO
// ══════════════════════════════════════════════════════════════

let editPreparoId = null;

// ══════════════════════════════════════════════════════════════
// FICHA TÉCNICA DE CUSTO — estado e funções
// ══════════════════════════════════════════════════════════════

// Rows em memória enquanto o editor está aberto
// Cada row: { item_id: number, peso_g: number }
// Componente reaproveitado em 2 contextos, diferenciados por _ftMode/_ftPrefix:
//  - 'preparo' (prefixo '', Pré-produção): só insumos, custo dividido por rendimento_kg
//  - 'flat'    (prefixo 'x', Produto/Opção): insumos + preparados, custo = soma direta
// _ftPrefix evita colisão de id no DOM quando os dois editores existem na página
// ao mesmo tempo (modal de Preparo fica sempre no DOM, só escondido).
let _ftRows   = [];
let _ftMode   = 'preparo';
let _ftPrefix = '';

function _ftId(base) { return _ftPrefix + base; }

function _ftInit(fichaTecnica, mode = 'preparo', prefix = '') {
  _ftMode   = mode;
  _ftPrefix = prefix;
  _ftRows = fichaTecnica?.ingredientes
    ? fichaTecnica.ingredientes.map(r => ({ ...r }))
    : [];
  const rend = document.getElementById(_ftId('ftRendimento'));
  if (rend) rend.value = fichaTecnica?.rendimento_kg || '';
  _ftRenderTable();
  _ftRecalc();
}

function _ftAddRow() {
  _ftRows.push({ item_id: null, peso_g: 0 });
  _ftRenderTable();
  if (_ftMode === 'flat') {
    const inputs = document.querySelectorAll(`#${_ftId('ftTable')} input[id^="${_ftId('ftSearch')}-"]`);
    const last = inputs[inputs.length - 1];
    if (last) setTimeout(() => last.focus(), 40);
  } else {
    const selects = document.querySelectorAll(`#${_ftId('ftTable')} select[id^="${_ftId('ftItem')}-"]`);
    const last = selects[selects.length - 1];
    if (last) setTimeout(() => last.focus(), 40);
  }
}

function _ftRemoveRow(idx) {
  _ftRows.splice(idx, 1);
  _ftRenderTable();
  _ftRecalc();
}

function _ftUpdateRow(idx) {
  const sel  = document.getElementById(`${_ftId('ftItem')}-${idx}`);
  const peso = document.getElementById(`${_ftId('ftPeso')}-${idx}`);
  if (!sel || !peso) return;
  _ftRows[idx] = {
    item_id: parseInt(sel.value) || null,
    peso_g:  parseFloat(peso.value) || 0,
  };
  _ftRecalc();
  // Atualiza só a linha de custo sem re-renderizar tudo (evita perder foco)
  const ins     = items.find(i => i.id === _ftRows[idx].item_id);
  const preco   = ins ? ins.cost : 0;
  const custo   = ins ? (_ftRows[idx].peso_g / 1000) * preco : 0;
  const custoEl = document.getElementById(`${_ftId('ftCustoLn')}-${idx}`);
  const precoEl = document.getElementById(`${_ftId('ftPrecoKg')}-${idx}`);
  if (custoEl) custoEl.textContent = 'R$ ' + fmt(custo);
  if (precoEl) precoEl.textContent = 'R$ ' + fmt(preco);
  // Atualiza totais
  const totCusto = document.getElementById(_ftId('ftTotalCusto'));
  const totPeso  = document.getElementById(_ftId('ftTotalPeso'));
  if (totCusto) totCusto.textContent = 'R$ ' + fmt(_ftCalcTotalCusto());
  if (totPeso)  totPeso.textContent  = _ftCalcTotalPeso() + ' g';
}

// ── Modo 'flat' (Produto/Opção): busca de insumo por texto + qtde na
// unidade nativa do insumo (kg/un/L/g — o que estiver cadastrado), sem
// assumir grama. Custo = quantidade digitada × custo unitário do insumo.
function _ftPoolFlat() {
  return items.filter(i => i.active !== false);
}

function _ftSearchInsumo(idx, query) {
  const drop = document.getElementById(`${_ftId('ftDrop')}-${idx}`);
  if (!drop) return;
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(query);
  if (!q) { drop.style.display = 'none'; drop.innerHTML = ''; return; }
  const matches = _ftPoolFlat().filter(i => norm(i.name).includes(q)).slice(0, 8);
  if (!matches.length) {
    drop.innerHTML = `<div class="ft-ac-item" style="cursor:default;color:var(--muted)">Nenhum insumo encontrado</div>`;
    drop.style.display = 'block';
    return;
  }
  drop.innerHTML = matches.map(m => `
    <div class="ft-ac-item" onmousedown="event.preventDefault();_ftPickInsumo(${idx},${m.id})">
      <span>${m.name}</span>
      <span class="ft-ac-cat">${m.cat || ''}</span>
    </div>`).join('');
  drop.style.display = 'block';
}

function _ftPickInsumo(idx, itemId) {
  const ins = items.find(i => i.id === itemId);
  if (!_ftRows[idx]) return;
  _ftRows[idx].item_id = itemId;
  const input = document.getElementById(`${_ftId('ftSearch')}-${idx}`);
  if (input) input.value = ins?.name || '';
  _ftCloseDropdown(idx);
  _ftRenderFlatRowCusto(idx);
  _ftRecalc();
  // Foca a qtde em seguida — próximo passo natural
  const qtdInput = document.getElementById(`${_ftId('ftPeso')}-${idx}`);
  if (qtdInput) setTimeout(() => qtdInput.focus(), 20);
}

function _ftCloseDropdown(idx) {
  const drop = document.getElementById(`${_ftId('ftDrop')}-${idx}`);
  if (drop) { drop.style.display = 'none'; drop.innerHTML = ''; }
}

function _ftUpdateQtdFlat(idx) {
  const inp = document.getElementById(`${_ftId('ftPeso')}-${idx}`);
  if (!inp || !_ftRows[idx]) return;
  _ftRows[idx].peso_g = parseFloat(inp.value) || 0;
  _ftRenderFlatRowCusto(idx);
  _ftRecalc();
}

function _ftRenderFlatRowCusto(idx) {
  const row     = _ftRows[idx];
  const ins     = row ? items.find(i => i.id === row.item_id) : null;
  const custo   = ins ? (row.peso_g || 0) * ins.cost : 0;
  const total   = _ftCalcTotalCusto();
  const pct     = total > 0 ? (custo / total) * 100 : 0;
  const custoEl = document.getElementById(`${_ftId('ftCustoLn')}-${idx}`);
  const pctEl   = document.getElementById(`${_ftId('ftCustoPct')}-${idx}`);
  const unitEl  = document.getElementById(`${_ftId('ftUnit')}-${idx}`);
  if (custoEl) custoEl.textContent = 'R$ ' + fmt(custo);
  if (pctEl)   pctEl.textContent   = custo > 0 ? fmt(pct) + '%' : '';
  if (unitEl)  unitEl.textContent  = ins?.unit || '';
  const totCusto = document.getElementById(_ftId('ftTotalCusto'));
  if (totCusto) totCusto.textContent = 'R$ ' + fmt(total);
}

function _ftCalcTotalCusto() {
  if (_ftMode === 'flat') {
    return _ftRows.reduce((sum, row) => {
      const ins = items.find(i => i.id === row.item_id);
      return sum + (ins ? (row.peso_g || 0) * ins.cost : 0);
    }, 0);
  }
  return _ftRows.reduce((sum, row) => {
    const ins = items.find(i => i.id === row.item_id);
    return sum + (ins ? (row.peso_g / 1000) * ins.cost : 0);
  }, 0);
}

// Calcula o custo de uma ficha técnica já salva, sem depender do estado
// global _ftRows — usado pelos cards da lista (Produtos/Opções).
function _calcCustoFicha(fichaTecnica) {
  if (!fichaTecnica?.ingredientes?.length) return 0;
  return fichaTecnica.ingredientes.reduce((sum, r) => {
    const ins = items.find(i => i.id === r.item_id);
    return sum + (ins ? (r.peso_g || 0) * ins.cost : 0);
  }, 0);
}

function _ftCalcTotalPeso() {
  return _ftRows.reduce((sum, r) => sum + (parseFloat(r.peso_g) || 0), 0);
}

function _ftRecalc() {
  const totalCusto = _ftCalcTotalCusto();
  const display = document.getElementById(_ftId('ftCustoDisplay'));
  const sub     = document.getElementById(_ftId('ftCustoSub'));
  const hidden  = document.getElementById(_ftId('fpCost'));

  if (!display) return;

  if (_ftMode === 'flat') {
    // Produto/Opção: cada cadastro já É uma unidade (não um lote) — custo é soma direta
    if (_ftRows.length === 0) {
      display.textContent = 'R$ 0,00';
      display.style.color = 'var(--muted)';
      display.style.background = 'var(--surface2)';
      display.style.borderColor = 'var(--border)';
      if (sub) sub.textContent = 'Adicione insumos ou preparados';
    } else {
      display.textContent = `R$ ${fmt(totalCusto)}`;
      display.style.color = 'var(--brand-purple,#6B21D4)';
      display.style.background = 'var(--purple-xlight,#EDE9FE)';
      display.style.borderColor = 'var(--brand-purple,#6B21D4)';
      if (sub) sub.textContent = `${_ftRows.length} item(ns) somado(s)`;
    }
    if (hidden) hidden.value = totalCusto.toFixed(4);
    return;
  }

  const rendimento = parseFloat(document.getElementById(_ftId('ftRendimento'))?.value) || 0;
  const custoKg    = (rendimento > 0) ? totalCusto / rendimento : 0;

  if (_ftRows.length === 0) {
    display.textContent = 'R$ 0,00/kg';
    display.style.color = 'var(--muted)';
    display.style.background = 'var(--surface2)';
    display.style.borderColor = 'var(--border)';
    if (sub) sub.textContent = 'Preencha os ingredientes e o rendimento';
    if (hidden) hidden.value = '0';
    return;
  }

  if (rendimento <= 0) {
    display.textContent = 'Informe o rendimento';
    display.style.color = 'var(--warning-fg,#D97706)';
    display.style.background = 'var(--warning-bg,#FEF3C7)';
    display.style.borderColor = 'var(--warning-fg,#D97706)';
    if (sub) sub.textContent = `Custo total: R$ ${fmt(totalCusto)} — divida pelo rendimento`;
    if (hidden) hidden.value = '0';
    return;
  }

  display.textContent = `R$ ${fmt(custoKg)}/kg`;
  display.style.color = 'var(--brand-purple,#6B21D4)';
  display.style.background = 'var(--purple-xlight,#EDE9FE)';
  display.style.borderColor = 'var(--brand-purple,#6B21D4)';
  if (sub) sub.textContent = `Total: R$ ${fmt(totalCusto)} ÷ ${rendimento} kg rendimento`;
  if (hidden) hidden.value = custoKg.toFixed(4);
}

function _ftRenderTable() {
  const el = document.getElementById(_ftId('ftTable'));
  if (!el) return;

  if (_ftRows.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:24px 12px;font-size:.86rem;color:var(--muted);border:1.5px dashed var(--border);border-radius:var(--r8)">
      Nenhum insumo adicionado — clique em "+ Adicionar insumo"
    </div>`;
    return;
  }

  if (_ftMode === 'flat') { _ftRenderTableFlat(el); return; }

  // Modo 'preparo' (Pré-produção) — só insumo, custo/kg dividido por rendimento
  const pool = items.filter(i => !i.isProd);

  // Agrupa por categoria para optgroup
  const cats = [...new Set(pool.map(i => i.cat || 'Outros'))].sort();

  el.innerHTML = `
    <!-- Header -->
    <div style="display:grid;grid-template-columns:1fr 90px 80px 80px 28px;gap:6px;padding:6px 10px;background:var(--surface2);border-bottom:1.5px solid var(--border)">
      <span style="font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Ingrediente</span>
      <span style="font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;text-align:right">Peso (g)</span>
      <span style="font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;text-align:right">R$/kg</span>
      <span style="font-size:.64rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;text-align:right">Custo</span>
      <span></span>
    </div>

    <!-- Rows -->
    ${_ftRows.map((row, i) => {
      const ins   = pool.find(x => x.id === row.item_id);
      const preco = ins ? ins.cost : 0;
      const custo = ins ? (row.peso_g / 1000) * preco : 0;

      const opts = cats.map(cat => `
        <optgroup label="${cat}">
          ${pool.filter(x => (x.cat || 'Outros') === cat).map(x =>
            `<option value="${x.id}"${x.id === row.item_id ? ' selected' : ''}>${x.name}</option>`
          ).join('')}
        </optgroup>
      `).join('');

      return `
        <div style="display:grid;grid-template-columns:1fr 90px 80px 80px 28px;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border);align-items:center;background:var(--surface)">
          <select id="${_ftId('ftItem')}-${i}" class="inp" style="font-size:.74rem;padding:5px 8px"
            onchange="_ftUpdateRow(${i})">
            <option value="">Selecione...</option>
            ${opts}
          </select>
          <input type="number" id="${_ftId('ftPeso')}-${i}" class="inp" value="${row.peso_g || ''}"
            min="0" step="1" placeholder="0"
            style="font-size:.74rem;padding:5px 8px;text-align:right"
            oninput="_ftUpdateRow(${i})">
          <div id="${_ftId('ftPrecoKg')}-${i}" style="font-size:.74rem;text-align:right;color:var(--muted);padding:0 4px">
            ${preco > 0 ? 'R$ ' + fmt(preco) : '—'}
          </div>
          <div id="${_ftId('ftCustoLn')}-${i}" style="font-size:.74rem;font-weight:700;text-align:right;padding:0 4px;color:${custo > 0 ? 'var(--text)' : 'var(--muted)'}">
            ${custo > 0 ? 'R$ ' + fmt(custo) : '—'}
          </div>
          <button onclick="_ftRemoveRow(${i})"
            style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;padding:2px 4px;border-radius:4px;line-height:1;display:flex;align-items:center;justify-content:center"
            title="Remover">×</button>
        </div>
      `;
    }).join('')}

    <!-- Totals -->
    <div style="display:grid;grid-template-columns:1fr 90px 80px 80px 28px;gap:6px;padding:7px 10px;background:var(--surface2);align-items:center">
      <span style="font-size:.72rem;font-weight:700;color:var(--muted)">TOTAL</span>
      <div id="${_ftId('ftTotalPeso')}" style="font-size:.72rem;font-weight:700;text-align:right;color:var(--muted)">${_ftCalcTotalPeso()} g</div>
      <div></div>
      <div id="${_ftId('ftTotalCusto')}" style="font-size:.72rem;font-weight:700;text-align:right;color:var(--purple)">R$ ${fmt(_ftCalcTotalCusto())}</div>
      <div></div>
    </div>
  `;
}

// Tabela do modo 'flat' (Produto/Opção) — 3 colunas (Insumo, Qtde, Custo),
// busca por texto em vez de dropdown, sem assumir unidade de medida.
function _ftRenderTableFlat(el) {
  const total = _ftCalcTotalCusto();

  el.innerHTML = `
    <div class="ft-table-head">
      <span>Insumo</span><span style="text-align:right">Qtde</span><span style="text-align:right">Custo</span><span></span>
    </div>
    ${_ftRows.map((row, i) => {
      const ins   = items.find(x => x.id === row.item_id);
      const custo = ins ? (row.peso_g || 0) * ins.cost : 0;
      const pct   = total > 0 ? (custo / total) * 100 : 0;
      return `
        <div class="ft-table-row">
          <div class="ft-ac-wrap">
            <input type="text" id="${_ftId('ftSearch')}-${i}" class="inp" placeholder="Pesquise um insumo ou preparado..."
              value="${ins?.name ? ins.name.replace(/"/g,'&quot;') : ''}"
              oninput="_ftSearchInsumo(${i}, this.value)"
              onfocus="_ftSearchInsumo(${i}, this.value)"
              onblur="setTimeout(()=>_ftCloseDropdown(${i}),150)">
            <div class="ft-ac-list" id="${_ftId('ftDrop')}-${i}" style="display:none"></div>
          </div>
          <div class="ft-qtd-cell">
            <input type="number" id="${_ftId('ftPeso')}-${i}" class="inp" value="${row.peso_g || ''}"
              min="0" step="any" placeholder="0"
              oninput="_ftUpdateQtdFlat(${i})">
            <span class="ft-qtd-unit" id="${_ftId('ftUnit')}-${i}">${ins?.unit || ''}</span>
          </div>
          <div class="ft-custo-cell">
            <div id="${_ftId('ftCustoLn')}-${i}" style="font-weight:700;color:${custo > 0 ? 'var(--text)' : 'var(--muted)'}">${custo > 0 ? 'R$ ' + fmt(custo) : '—'}</div>
            <span class="ft-custo-pct" id="${_ftId('ftCustoPct')}-${i}">${custo > 0 ? fmt(pct) + '%' : ''}</span>
          </div>
          <button onclick="_ftRemoveRow(${i})"
            style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;padding:2px 4px;border-radius:4px;display:flex;align-items:center;justify-content:center"
            title="Remover">×</button>
        </div>
      `;
    }).join('')}
    <div class="ft-table-total">
      <span>TOTAL</span><span></span>
      <span id="${_ftId('ftTotalCusto')}" style="text-align:right;color:var(--purple)">R$ ${fmt(total)}</span>
      <span></span>
    </div>
  `;
}

function renderPreparoGrid() {
  const prods = items.filter(i => i.isProd);
  const el    = document.getElementById('preparoGrid');

  if (!prods.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">${lc("chef-hat",14,"currentColor")}</div><div style="font-weight:700;margin-bottom:4px">Nenhum preparado cadastrado</div><div>Clique em "Novo Preparado" para começar</div></div>`;
    return;
  }

  const inCfg = !!document.getElementById('cfgSectionContent')?.contains(el);
  if (inCfg) {
    el.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    el.innerHTML = prods.map(item => {
      const ft = item.fichaTecnica;
      const ftBadge = ft?.ingredientes?.length
        ? `<span style="font-size:10px;background:var(--purple-xlight);color:var(--purple);border-radius:4px;padding:1px 6px;font-weight:600">${ft.ingredientes.length} ing. · R$ ${fmt(item.cost)}/kg</span>`
        : `<span style="font-size:10px;background:var(--surface2);color:var(--muted);border-radius:4px;padding:1px 6px">Sem ficha</span>`;
      return `<div class="cfg-row" style="cursor:pointer" onclick="openEditPreparo(${item.id})">
        <div class="cfg-row-icon" style="background:var(--purple-xlight);color:var(--purple)">${lc('chef-hat',14,'currentColor')}</div>
        <div style="flex:1;min-width:0">
          <div class="cfg-row-label">${item.name}</div>
          <div class="cfg-row-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${item.unit} · Mín ${item.min} · Ideal ${item.ideal} ${ftBadge}</div>
        </div>
        <div class="cfg-row-actions">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openEditPreparo(${item.id})">${lc('edit-2',12,'currentColor')}</button>
        </div>
      </div>`;
    }).join('');
    return;
  }

  el.innerHTML = prods.map(item => {
    const ft = item.fichaTecnica;
    const hasFt = ft?.ingredientes?.length > 0;
    const custoLabel = hasFt
      ? `<span style="font-weight:700;color:var(--purple)">R$ ${fmt(item.cost)}/${item.unit}</span>`
      : `<span style="font-weight:500;color:var(--muted)">— sem ficha técnica</span>`;
    const ftBadge = hasFt
      ? `<span style="font-size:10px;background:var(--purple-xlight);color:var(--purple);border-radius:4px;padding:2px 7px;font-weight:600">${lc('clipboard',10,'currentColor')} ${ft.ingredientes.length} ingredientes</span>`
      : `<span style="font-size:10px;background:var(--surface2);color:var(--muted);border-radius:4px;padding:2px 7px">${lc('clipboard',10,'currentColor')} Sem ficha técnica</span>`;
    return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditPreparo(${item.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:var(--text-md);font-weight:700">${item.name}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:6px">Preparados · ${item.unit} ${ftBadge}</div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditPreparo(${item.id})">${lc("edit-2",13,"currentColor")}️</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;font-size:var(--text-xs)">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Custo produção</span>
          ${custoLabel}
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Qtd. mínima</span>
          <span style="font-weight:600">${item.min} ${item.unit}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Qtd. ideal</span>
          <span style="font-weight:600">${item.ideal} ${item.unit}</span>
        </div>
        ${item.medPorcao ? `<div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Kg/porção</span>
          <span style="font-weight:600">${item.medPorcao} kg</span>
        </div>` : ''}
      </div>
      ${item.obs ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:var(--text-xs);color:var(--muted);line-height:1.5">${item.obs}</div>` : ''}
    </div>`;
  }).join('');
}

function openPreparoModal() {
  editPreparoId = null;
  document.getElementById('preparoModalTitle').textContent = 'Novo Preparado';
  document.getElementById('ePreparoId').value = '';
  ['fpName','fpCode','fpMin','fpIdeal','fpPorcao','fpObs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fpCost').value = '0';
  document.getElementById('fpUnit').value = 'kg';
  document.getElementById('delPreparoBtn').style.display = 'none';
  _ftInit(null);
  document.getElementById('ovPreparo').classList.add('open');
  setTimeout(() => document.getElementById('fpName').focus(), 80);
}

function openEditPreparo(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  editPreparoId = id;
  document.getElementById('preparoModalTitle').textContent = `${item.name}`;
  document.getElementById('fpName').value   = item.name;
  document.getElementById('fpCode').value   = item.code  || '';
  document.getElementById('fpUnit').value   = item.unit;
  document.getElementById('fpCost').value   = item.cost  || 0;
  document.getElementById('fpMin').value    = item.min;
  document.getElementById('fpIdeal').value  = item.ideal;
  document.getElementById('fpPorcao').value = item.medPorcao || '';
  document.getElementById('fpObs').value    = item.obs   || '';
  // Ficha Técnica — _ftInit seta ftRendimento, popula _ftRows e renderiza
  _ftInit(item.fichaTecnica || null);
  document.getElementById('delPreparoBtn').style.display = 'inline-flex';
  document.getElementById('ovPreparo').classList.add('open');
}

function savePreparo() {
  const name = document.getElementById('fpName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const rendimento_kg = parseFloat(document.getElementById('ftRendimento').value) || 0;
  const novaFT = { ingredientes: _ftRows.filter(r => r.item_id), rendimento_kg };

  // Proteção: avisa se ficha técnica existente será apagada
  if (editPreparoId) {
    const itemAntes = items.find(i => i.id === editPreparoId);
    const ftAntes = itemAntes?.fichaTecnica?.ingredientes?.length || 0;
    if (ftAntes > 0 && novaFT.ingredientes.length === 0) {
      vtpConfirm({
        title: 'Ficha Técnica será apagada',
        message: `A ficha técnica de "${itemAntes.name}" tem ${ftAntes} ingrediente(s) configurado(s).\n\nSalvar sem ingredientes vai apagar toda a ficha técnica. Deseja continuar?`,
        confirmLabel: 'Apagar ficha e salvar',
        onConfirm: () => _savePreparoConfirmado(name, novaFT),
      });
      return;
    }
  }
  _savePreparoConfirmado(name, novaFT);
}

function _savePreparoConfirmado(name, fichaTecnica) {
  const custoKg = parseFloat(document.getElementById('fpCost').value) || 0;
  const data = {
    name,
    code:         document.getElementById('fpCode').value.trim(),
    cat:          'PREPARADOS',
    unit:         document.getElementById('fpUnit').value,
    cost:         custoKg,
    min:          parseFloat(document.getElementById('fpMin').value)    || 0,
    ideal:        parseFloat(document.getElementById('fpIdeal').value)  || 0,
    medPorcao:    parseFloat(document.getElementById('fpPorcao').value) || null,
    obs:          document.getElementById('fpObs').value.trim(),
    fichaTecnica: fichaTecnica.ingredientes.length > 0 ? fichaTecnica : null,
    isProd:       true,
    brands:       [],
    supId:        null,
  };
  if (editPreparoId) {
    const idx = items.findIndex(i => i.id === editPreparoId);
    if (idx >= 0) items[idx] = { ...items[idx], ...data };
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" atualizado!`);
  } else {
    items.push({ id: nextIid++, qty: 0, code: '', ...data });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" adicionado!`);
  }
  saveI();
  closeModal('ovPreparo');
  renderPreparoGrid();
  renderDashboard();
}

function deletePreparo() {
  const item = items.find(i => i.id === editPreparoId);
  if (!item) return;
  vtpConfirm({
    title: `Excluir "${item.name}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      items = items.filter(i => i.id !== editPreparoId);
      saveI();
      closeModal('ovPreparo');
      renderPreparoGrid();
      renderDashboard();
      toast(`${lc("trash-2",14,"currentColor")} "${item.name}" excluído.`);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// FORNECEDORES (dentro de Cadastros)
// ══════════════════════════════════════════════════════════════

const _FORN_CAT_LABELS = { alimentos:'Alimentos', suprimentos:'Suprimentos', bebidas:'Bebidas' };
const _FORN_CAT_COLORS = {
  alimentos:   { bg:'var(--green-light)',      color:'var(--green)'       },
  suprimentos: { bg:'var(--purple-xlight)',    color:'var(--purple)'      },
  bebidas:     { bg:'var(--orange-light)',     color:'var(--orange-dark)' },
};

function renderFornecedores() {
  const q     = document.getElementById('srchCadForn')?.value?.toLowerCase() || '';
  const catFil= document.getElementById('filFornCat')?.value || '';
  const el    = document.getElementById('supGrid');
  if (!el) return;

  const inCfg = !!document.getElementById('cfgSectionContent')?.contains(el);

  let filt = suppliers.filter(s => {
    if (q && !s.name.toLowerCase().includes(q) && !(s.seller||'').toLowerCase().includes(q)) return false;
    if (catFil && ![].concat(s.categoria||[]).includes(catFil)) return false;
    return true;
  });

  if (!filt.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">${lc("building-2",13,"var(--muted)")}</div><div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">Nenhum fornecedor</div><div>Cadastre seu primeiro fornecedor!</div></div>`;
    return;
  }

  if (inCfg) {
    el.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    el.innerHTML = filt.map(s => {
      const si = items.filter(i => { const ids = i.supIds?.length ? i.supIds : (i.supId ? [i.supId] : []); return ids.includes(s.id); });
      const cats_cfg = [].concat(s.categoria||[]).filter(Boolean);
      return `<div class="cfg-row" style="cursor:pointer" onclick="openEditSup(${s.id})"
          onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="cfg-row-label">${s.name}</span>
            ${cats_cfg.map(c => { const cc=_FORN_CAT_COLORS[c]||{}; return `<span style="padding:1px 6px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;background:${cc.bg||'var(--surface2)'};color:${cc.color||'var(--muted)'}">${_FORN_CAT_LABELS[c]||c}</span>`; }).join('')}
          </div>
          <div class="cfg-row-sub" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:2px">
            ${s.seller ? `<span>${lc("user",10,"currentColor")} ${s.seller}</span>` : ''}
            ${s.phone  ? `<span>${lc("phone",10,"currentColor")} ${s.phone}</span>` : ''}
            ${si.length ? `<span>${lc("package",10,"currentColor")} ${si.length} insumo${si.length!==1?'s':''}</span>` : ''}
          </div>
        </div>
        <div class="cfg-row-actions">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openEditSup(${s.id})">${lc("edit-2",12,"currentColor")}</button>
        </div>
      </div>`;
    }).join('');
    return;
  }
  el.style.cssText = '';

  el.innerHTML = filt.map(s => {
    const si = items.filter(i => {
      const ids = i.supIds?.length ? i.supIds : (i.supId ? [i.supId] : []);
      return ids.includes(s.id);
    });
    const feLabel = s.formaEntrega === 'presencial' ? 'Presencial' : s.formaEntrega === 'ambos' ? 'Entrega + Presencial' : 'Entrega';
    const feIcon  = s.formaEntrega === 'presencial' ? 'shopping-cart' : s.formaEntrega === 'ambos' ? 'refresh-cw' : 'truck';
    const feColor = s.formaEntrega === 'presencial' ? 'var(--orange-dark)' : s.formaEntrega === 'ambos' ? 'var(--purple)' : 'var(--green)';
    const feBg    = s.formaEntrega === 'presencial' ? 'var(--orange-light)' : s.formaEntrega === 'ambos' ? 'var(--purple-xlight)' : 'var(--green-light)';
    const cats_card = [].concat(s.categoria||[]).filter(Boolean);
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditSup(${s.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            <span style="font-size:var(--text-md);font-weight:700">${s.name}</span>
            ${cats_card.map(c => { const cc=_FORN_CAT_COLORS[c]||{}; return `<span style="padding:2px 7px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${cc.bg||'var(--surface2)'};color:${cc.color||'var(--muted)'}">${_FORN_CAT_LABELS[c]||c}</span>`; }).join('')}
            <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${feBg};color:${feColor};border:1px solid ${feColor}">${lc(feIcon,9,'currentColor')} ${feLabel}</span>
          </div>
          ${s.seller ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${lc("user",14,"currentColor")} ${s.seller}</div>` : ''}
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditSup(${s.id})">${lc("edit-2",13,"currentColor")}️</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
        ${s.phone ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("phone",12,"var(--muted)")} ${s.phone}</div>` : ''}
        ${s.email ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("mail",12,"var(--muted)")} ${s.email}</div>` : ''}
        ${s.cats  ? `<div style="font-size:var(--text-xs);color:var(--muted)">${s.cats}</div>`  : ''}
        ${s.pedidoMinimo ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc("package",11,"var(--muted)")} Ped. mín.: <strong>${s.pedidoMinTipo==='valor'?'R$ '+fmt(s.pedidoMinimo):fmt(s.pedidoMinimo)+' '+s.pedidoMinTipo}</strong></div>` : ''}
        ${s.diasPedido?.length ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc("calendar",11,"var(--muted)")} ${s.diasPedido.map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join(' · ')}${s.horarioPedido?' até '+s.horarioPedido:''}</div>` : ''}
        ${s.prazoEntregaDias ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc("truck",11,"var(--muted)")} Entrega em ${s.prazoEntregaDias} dia(s)${s.antecedenciaMinDias?' · '+s.antecedenciaMinDias+'d antecedência':''}</div>` : ''}
        ${s.aviso ? `<div style="font-size:var(--text-xs);padding:4px 7px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r6);color:var(--orange-dark);margin-top:4px">${lc("alert-triangle",10,"currentColor")} ${s.aviso}</div>` : ''}
      </div>
      ${si.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${si.map(i => `<span class="badge b-purple" style="font-size:var(--text-2xs)">${i.name}</span>`).join('')}</div>`
        : '<div style="font-size:var(--text-xs);color:var(--muted)">Sem insumos vinculados</div>'}
    </div>`;
  }).join('');
}

function openSupModal() {
  editSupId = null;
  document.getElementById('supModalTitle').textContent = 'Novo Fornecedor';
  ['sfName','sfSeller','sfPhone','sfEmail','sfCats'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('eSupId').value = '';
  document.getElementById('delSupBtn').style.display = 'none';
  ['sfPedidoMin','sfPrazoEntrega','sfAntecedencia','sfHorarioLimite','sfAviso'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('sfPedidoMinTipo').value = '';
  const feEl = document.getElementById('sfFormaEntrega'); if (feEl) feEl.value = 'entrega';
  const confEl = document.getElementById('sfConfianca'); if (confEl) confEl.value = 'backup';
  ['alimentos','suprimentos','bebidas'].forEach(c => { const el=document.getElementById('sfCat_'+c); if(el) el.checked=false; });
  ['seg','ter','qua','qui','sex','sab'].forEach(d => { const el=document.getElementById('sfDia_'+d); if(el) el.checked=false; });
  document.getElementById('supNotasSection').style.display = 'none';
  renderSupCbx([]);
  document.getElementById('ovSup').classList.add('open');
  setTimeout(() => document.getElementById('sfName').focus(), 80);
}

function openEditSup(id) {
  const s = suppliers.find(x => x.id === id);
  if (!s) return;
  editSupId = id;
  document.getElementById('supModalTitle').textContent = `${s.name}`;
  document.getElementById('sfName').value   = s.name   || '';
  document.getElementById('sfSeller').value = s.seller || '';
  document.getElementById('sfPhone').value  = s.phone  || '';
  document.getElementById('sfEmail').value  = s.email  || '';
  document.getElementById('sfCats').value   = s.cats   || '';
  const g2 = (id, val) => { const el=document.getElementById(id); if(el) el.value = val||''; };
  g2('sfPedidoMin',    s.pedidoMinimo||'');
  g2('sfPedidoMinTipo', s.pedidoMinTipo||'');
  g2('sfPrazoEntrega', s.prazoEntregaDias||'');
  g2('sfAntecedencia', s.antecedenciaMinDias||'');
  g2('sfHorarioLimite', s.horarioPedido||'');
  g2('sfAviso',        s.aviso||'');
  g2('sfFormaEntrega', s.formaEntrega||'entrega');
  const sCats = [].concat(s.categoria||[]).filter(Boolean);
  ['alimentos','suprimentos','bebidas'].forEach(c => { const el=document.getElementById('sfCat_'+c); if(el) el.checked=sCats.includes(c); });
  g2('sfConfianca', s.confianca || 'backup');
  document.getElementById('supNotasSection').style.display = '';
  _renderNotasSupplier(s);
  const dias = s.diasPedido||[];
  ['seg','ter','qua','qui','sex','sab'].forEach(d => { const el=document.getElementById('sfDia_'+d); if(el) el.checked=dias.includes(d); });
  document.getElementById('eSupId').value   = id;
  document.getElementById('delSupBtn').style.display = 'inline-flex';
  renderSupCbx(items.filter(i => {
    const ids = i.supIds?.length ? i.supIds : (i.supId ? [i.supId] : []);
    return ids.includes(id);
  }).map(i => i.id));
  document.getElementById('ovSup').classList.add('open');
}

function renderSupCbx(linked, searchQ) {
  const q = (searchQ || document.getElementById('sfItemSearch')?.value || '').toLowerCase();
  const filt = [...items]
    .filter(i => !i.isProd)
    .filter(i => !q || i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  const el = document.getElementById('sfItems');
  if (!filt.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:var(--text-sm);padding:12px">Nenhum insumo encontrado</div>`;
    return;
  }

  // Agrupa por categoria
  const byCat = {};
  filt.forEach(i => { if (!byCat[i.cat]) byCat[i.cat] = []; byCat[i.cat].push(i); });

  el.innerHTML = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:6px">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:4px 6px">${cat}</div>
      ${catItems.map(i => `
        <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r6);cursor:pointer;font-size:var(--text-sm);background:var(--surface);border:1.5px solid ${linked.includes(i.id) ? 'var(--purple-light)' : 'var(--border)'};margin-bottom:3px;transition:all .1s">
          <input type="checkbox" value="${i.id}" ${linked.includes(i.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--purple)" onchange="this.closest('label').style.borderColor=this.checked?'var(--purple-light)':'var(--border)';this.closest('label').style.background=this.checked?'var(--purple-xlight)':'var(--surface)'">
          <span style="flex:1">${i.name}</span>
          ${i.code ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">#${i.code}</span>` : ''}
        </label>`).join('')}
    </div>`).join('');
}

function filterSupItems() {
  const linked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));
  renderSupCbx(linked);
}

function saveSup() {
  const name = document.getElementById('sfName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const checked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));
  const dias = ['seg','ter','qua','qui','sex','sab'].filter(d => document.getElementById('sfDia_'+d)?.checked);
  const data = {
    name,
    seller:              document.getElementById('sfSeller').value.trim(),
    phone:               document.getElementById('sfPhone').value.trim(),
    email:               document.getElementById('sfEmail').value.trim(),
    cats:                document.getElementById('sfCats').value.trim(),
    pedidoMinimo:        parseFloat(document.getElementById('sfPedidoMin')?.value)||null,
    pedidoMinTipo:       document.getElementById('sfPedidoMinTipo')?.value||'',
    prazoEntregaDias:    parseInt(document.getElementById('sfPrazoEntrega')?.value)||null,
    antecedenciaMinDias: parseInt(document.getElementById('sfAntecedencia')?.value)||null,
    horarioPedido:       document.getElementById('sfHorarioLimite')?.value||'',
    diasPedido:          dias,
    aviso:               document.getElementById('sfAviso')?.value.trim()||'',
    formaEntrega:        document.getElementById('sfFormaEntrega')?.value || 'entrega',
    categoria:           ['alimentos','suprimentos','bebidas'].filter(c => document.getElementById('sfCat_'+c)?.checked),
    confianca:           document.getElementById('sfConfianca')?.value || 'backup',
  };
  if (editSupId) {
    const idx = suppliers.findIndex(s => s.id === editSupId);
    if (idx >= 0) suppliers[idx] = { ...suppliers[idx], ...data };
    // Remove este fornecedor de todos os insumos e re-adiciona só nos marcados
    items.forEach(i => {
      // Remove do array supIds
      if (i.supIds) i.supIds = i.supIds.filter(id => id !== editSupId);
      // Legado
      if (i.supId === editSupId) i.supId = null;
    });
    checked.forEach(iid => {
      const it = items.find(i => i.id === iid);
      if (!it) return;
      if (!it.supIds) it.supIds = it.supId ? [it.supId] : [];
      if (!it.supIds.includes(editSupId)) it.supIds.push(editSupId);
      if (!it.supId) it.supId = editSupId; // legado: primeiro da lista
    });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" atualizado!`);
  } else {
    const nid = nextSid++;
    suppliers.push({ id: nid, ...data });
    checked.forEach(iid => {
      const it = items.find(i => i.id === iid);
      if (!it) return;
      if (!it.supIds) it.supIds = it.supId ? [it.supId] : [];
      if (!it.supIds.includes(nid)) it.supIds.push(nid);
      if (!it.supId) it.supId = nid; // legado
    });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" cadastrado!`);
  }
  saveS(); saveI();
  try { logAudit('fornecedor_salvo', name, 'cadastros'); } catch(e) {}
  closeModal('ovSup');
  renderFornecedores();
  if (typeof _refreshCfgFornList === 'function') _refreshCfgFornList();
  renderDashboard();
}

function openTipoFornPicker() {
  document.getElementById('ovTipoForn').classList.add('open');
}

function _supNotaMedia(s) {
  if (!s.notas?.length) return null;
  return (s.notas.reduce((acc, n) => acc + (n.estrelas || 0), 0) / s.notas.length).toFixed(1);
}

function _renderNotasSupplier(s) {
  const el = document.getElementById('supNotasList');
  if (!el) return;
  const notas = (s.notas || []).slice().reverse();
  if (!notas.length) {
    el.innerHTML = `<div style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Nenhuma avaliação registrada ainda.</div>`;
    return;
  }
  el.innerHTML = notas.map(n => `
    <div style="display:flex;gap:10px;padding:8px 10px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px">
          <span style="color:var(--yellow);font-size:var(--text-sm)">${_prestStars(n.estrelas)}</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">${fmtD(n.data)}</span>
        </div>
        ${n.servico?`<div style="font-size:var(--text-xs);font-weight:600;margin-bottom:1px">${n.servico}</div>`:''}
        ${n.comentario?`<div style="font-size:var(--text-xs);color:var(--text2)">${n.comentario}</div>`:''}
      </div>
      <button onclick="_deletarNotaSupplier('${n.id}')" style="flex-shrink:0;border:none;background:none;cursor:pointer;color:var(--muted);padding:2px">${lc('x',12,'currentColor')}</button>
    </div>`).join('');
}

function addNotaSupplier() {
  const s = suppliers.find(x => x.id === editSupId);
  if (!s) return;
  const data = document.getElementById('sfNotaData')?.value;
  if (!data) { toast('Informe a data', 'err'); return; }
  if (!s.notas) s.notas = [];
  s.notas.push({
    id:         crypto.randomUUID(),
    data,
    estrelas:   parseInt(document.getElementById('sfNotaEstrelas')?.value) || 5,
    servico:    document.getElementById('sfNotaServico')?.value.trim() || '',
    comentario: document.getElementById('sfNotaComentario')?.value.trim() || '',
    created_at: new Date().toISOString(),
  });
  s.updated_at = new Date().toISOString();
  saveS();
  ['sfNotaData','sfNotaServico','sfNotaComentario'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('sfNotaEstrelas').value = '5';
  _renderNotasSupplier(s);
  _refreshCfgFornList();
  toast(`${lc('star',13,'var(--yellow)')} Avaliação registrada!`);
}

function _deletarNotaSupplier(notaId) {
  const s = suppliers.find(x => x.id === editSupId);
  if (!s) return;
  s.notas = (s.notas || []).filter(n => n.id !== notaId);
  s.updated_at = new Date().toISOString();
  saveS();
  _renderNotasSupplier(s);
  _refreshCfgFornList();
}

function deleteSup() {
  const s = suppliers.find(x => x.id === editSupId);
  if (!s) return;
  vtpConfirm({
    title: `Excluir "${s.name}"`,
    message: 'O fornecedor será removido de todos os insumos vinculados.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      suppliers = suppliers.filter(x => x.id !== editSupId);
      items.forEach(i => {
        if (i.supIds) i.supIds = i.supIds.filter(id => id !== editSupId);
        if (i.supId === editSupId) i.supId = i.supIds?.[0] ?? null;
      });
      saveS(); saveI();
      closeModal('ovSup');
      renderFornecedores();
      if (typeof _refreshCfgFornList === 'function') _refreshCfgFornList();
      renderDashboard();
      toast(`${lc("trash-2",14,"currentColor")} "${s.name}" excluído.`);
    }
  });
}


// ══════════════════════════════════════════════════════════════
// CADASTRO DE PRODUTOS (Pizzas e Bebidas para Desperdício)
// ══════════════════════════════════════════════════════════════

const PROD_CATS = ['Pizza Pequena', 'Pizza Grande', 'Bebida', 'Outro'];

// Aba "Outros" — bebidas, sobremesas e demais produtos vendáveis.
// Mesmo padrão de Fichas Técnicas: lista cheia → editor em tela cheia.
// A ficha de uma bebida de revenda é trivial (1 UN do insumo), mas passa
// pela mesma lógica de débito/custo de todo produto.
function renderCadProdutos() {
  const lv = document.getElementById('outrosListView');
  const dv = document.getElementById('outrosDetailView');
  if (lv) lv.style.display = '';
  if (dv) dv.style.display = 'none';
  const el = document.getElementById('listaOutros');
  if (!el) return;
  const cnt = document.getElementById('cntOutros');
  if (cnt) cnt.textContent = `(${produtos.length})`;

  if (!produtos.length) {
    el.innerHTML = `<div class="ft-empty-list">Nenhum produto — cadastre aqui bebidas, sobremesas e outros itens vendáveis</div>`;
    return;
  }
  el.innerHTML = produtos.map(p => {
    const nIng  = p.fichaTecnica?.ingredientes?.length || 0;
    const custo = _calcCustoFicha(p.fichaTecnica);
    return `<div class="ft-list-row" onclick="_selecionarFicha('outro',${p.id})">
      <div class="ft-list-main">
        <div class="ft-list-name">${p.name}</div>
        <div class="ft-list-sub">${nIng > 0 ? nIng + ' insumo(s) na ficha' : 'Sem ficha técnica — débito não configurado'}</div>
      </div>
      <div class="ft-list-cost">${nIng > 0 ? 'R$ ' + fmt(custo) : `<span class="ft-list-empty">sem ficha</span>`}</div>
      ${lc('chevron-right',20,'var(--muted)')}
    </div>`;
  }).join('');
}

let _editProdId = null;

function openProdModal(id) {
  _editProdId = id || null;
  const p = id ? produtos.find(x => x.id === id) : null;
  document.getElementById('fprodModalTitle').textContent = p ? `${p.name}` : 'Novo Produto';
  document.getElementById('fprodName').value   = p?.name   || '';
  document.getElementById('fprodCat').value    = p?.cat    || 'Pizza Pequena';
  document.getElementById('fprodPrice').value  = p?.price  || '';
  document.getElementById('fprodActive').checked = p ? p.active !== false : true;
  document.getElementById('delProdBtn').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('ovProd').classList.add('open');
  setTimeout(() => document.getElementById('fprodName').focus(), 80);
}

function saveProd() {
  const name  = document.getElementById('fprodName').value.trim();
  const cat   = document.getElementById('fprodCat').value;
  const price = parseFloat(document.getElementById('fprodPrice').value) || 0;
  if (!name) { toast('Informe o nome do produto', 'err'); return; }
  if (!price) { toast('Informe o preço de venda', 'err'); return; }

  if (_editProdId) {
    const idx = produtos.findIndex(p => p.id === _editProdId);
    if (idx >= 0) produtos[idx] = { ...produtos[idx], name, cat, price, active: document.getElementById('fprodActive').checked };
    toast('Produto atualizado!');
  } else {
    produtos.push({ id: nextPid++, name, cat, price, active: true });
    toast('Produto cadastrado!');
  }
  saveP();
  closeModal('ovProd');
  renderCadProdutos();
}

function deleteProd() {
  if (!_editProdId) return;
  vtpConfirm({
    title: 'Excluir produto',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      produtos = produtos.filter(p => p.id !== _editProdId);
      saveP();
      closeModal('ovProd');
      renderCadProdutos();
      toast('Produto excluído.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// SABORES DE PIZZA
// ══════════════════════════════════════════════════════════════

// Configurações → Produtos é SÓ cadastro (Fichas Técnicas). A parte
// analítica (CMV, curva ABC, porcionamento) vive no módulo Vendas
// (js/vendas.js + js/vendas-ui.js), não aqui.

function renderCadSabores() {
  const el = document.getElementById('cadSaboresGrid');
  if (!el) return;
  const byCat = {};
  PIZZA_TIPOS.forEach(t => {
    byCat[t.id] = { label: t.label, basePrice: t.basePrice, items: [] };
  });
  sabores.forEach(s => { if (byCat[s.tipo]) byCat[s.tipo].items.push(s); });

  el.innerHTML = PIZZA_TIPOS.map(tipo => {
    const cat = byCat[tipo.id];
    return `<div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--border)">
        <div>
          <div style="font-size:var(--text-sm);font-weight:700">${tipo.label}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Base: R$ ${fmt(tipo.basePrice)}</div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="openSaborModal('${tipo.id}')">+ Sabor</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${cat.items.sort((a,b)=>a.acr-b.acr||a.name.localeCompare(b.name)).map(s => {
          const opc     = opcoes.find(o => o.id === s.opcaoId);
          const hasFt   = opc?.fichaTecnica?.ingredientes?.length > 0;
          const ftBadge = opc
            ? `<button onclick="event.stopPropagation();_irParaFicha('opcao',${opc.id})" title="${hasFt ? 'Ver ficha técnica' : 'Cadastrar ficha técnica'}"
                style="font-size:9px;background:${hasFt ? 'var(--purple-xlight)' : 'var(--surface2)'};color:${hasFt ? 'var(--purple)' : 'var(--muted)'};border:none;border-radius:4px;padding:2px 7px;cursor:pointer;margin-left:8px;font-weight:600">${hasFt ? 'ficha ok' : 'sem ficha'}</button>`
            : '';
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border:1.5px solid ${s.active===false?'var(--border)':'var(--border)'};border-radius:var(--r6);opacity:${s.active===false?0.5:1}">
            <div style="flex:1">
              <span style="font-size:var(--text-sm);font-weight:600">${s.name}</span>
              <span style="font-size:var(--text-xs);color:var(--muted);margin-left:8px">${s.acr > 0 ? '+R$ ' + fmt(s.acr) : 'Incluso'}</span>
              <span style="font-size:var(--text-xs);color:var(--purple);font-weight:700;margin-left:8px">= R$ ${fmt(tipo.basePrice + s.acr)}</span>
              ${ftBadge}
            </div>
            <button class="btn btn-outline btn-xs" onclick="openSaborModal('${tipo.id}', ${s.id})">${lc("edit-2",13,"currentColor")}️</button>
          </div>`;
        }).join('')}
        ${cat.items.length === 0 ? `<div style="font-size:var(--text-xs);color:var(--muted);padding:8px">Nenhum sabor cadastrado</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// FICHAS TÉCNICAS — Produto (base) & Opção (cobertura)
// Layout mestre-detalhe: lista à esquerda, editor de ficha à direita.
// ══════════════════════════════════════════════════════════════

let _fichaSel = null; // { tipo:'produto'|'opcao', id: number|null }

function renderCadFichas() {
  _fichaSel = null;
  document.getElementById('fichaListView').style.display = '';
  document.getElementById('fichaDetailView').style.display = 'none';
  _renderListaProdutosPizza();
  _renderListaOpcoes();
}

function _renderListaProdutosPizza() {
  const el = document.getElementById('listaProdutosPizza');
  if (!el) return;
  // Produtos = bases de pizza + bebidas/outros (todos são produtos vendáveis)
  const linhaBase = p => {
    const nIng  = p.fichaTecnica?.ingredientes?.length || 0;
    const custo = _calcCustoFicha(p.fichaTecnica);
    return `<div class="ft-list-row" onclick="_selecionarFicha('produto',${p.id})">
      <div class="ft-list-main">
        <div class="ft-list-name">${p.nome} <span style="font-size:.68rem;font-weight:600;background:var(--purple-xlight);color:var(--purple);padding:1px 7px;border-radius:var(--r6);margin-left:6px">base</span></div>
        <div class="ft-list-sub">${nIng > 0 ? nIng + ' insumo(s) na ficha' : 'Base do produto — massa, embalagem'}</div>
      </div>
      <div class="ft-list-cost">${nIng > 0 ? 'R$ ' + fmt(custo) : `<span class="ft-list-empty">sem ficha</span>`}</div>
      ${lc('chevron-right',20,'var(--muted)')}
    </div>`;
  };
  const linhaOutro = p => {
    const nIng  = p.fichaTecnica?.ingredientes?.length || 0;
    const custo = _calcCustoFicha(p.fichaTecnica);
    return `<div class="ft-list-row" onclick="_selecionarFicha('outro',${p.id})">
      <div class="ft-list-main">
        <div class="ft-list-name">${p.name} <span style="font-size:.68rem;font-weight:600;background:var(--surface2);color:var(--muted);padding:1px 7px;border-radius:var(--r6);margin-left:6px">bebida/outro</span></div>
        <div class="ft-list-sub">${nIng > 0 ? nIng + ' insumo(s) na ficha' : 'Sem ficha técnica'}</div>
      </div>
      <div class="ft-list-cost">${nIng > 0 ? 'R$ ' + fmt(custo) : `<span class="ft-list-empty">sem ficha</span>`}</div>
      ${lc('chevron-right',20,'var(--muted)')}
    </div>`;
  };
  document.getElementById('cntProdutosPizza').textContent = `(${produtosPizza.length + produtos.length})`;
  el.innerHTML = produtosPizza.map(linhaBase).join('') + produtos.map(linhaOutro).join('');
}

function _renderListaOpcoes() {
  const el = document.getElementById('listaOpcoes');
  if (!el) return;
  const q = document.getElementById('srchOpcoes')?.value?.toLowerCase() || '';
  const lista = opcoes
    .filter(o => !q || o.nome.toLowerCase().includes(q))
    .sort((a,b) => a.nome.localeCompare(b.nome));
  document.getElementById('cntOpcoes').textContent = `(${opcoes.length})`;
  if (!lista.length) {
    el.innerHTML = `<div class="ft-empty-list">Nenhuma opção encontrada</div>`;
    return;
  }
  el.innerHTML = lista.map(o => {
    const hasFt = o.fichaTecnica?.ingredientes?.length > 0;
    const custo = _calcCustoFicha(o.fichaTecnica);
    return `<div class="ft-list-row" onclick="_selecionarFicha('opcao',${o.id})">
      <div class="ft-list-main">
        <div class="ft-list-name">${o.nome}</div>
        <div class="ft-list-sub">${o.categoria==='doce'?'Doce':'Salgada'}</div>
      </div>
      <div class="ft-list-cost">${hasFt ? 'R$ ' + fmt(custo) : `<span class="ft-list-empty">sem ficha</span>`}</div>
      ${lc('chevron-right',20,'var(--muted)')}
    </div>`;
  }).join('');
}

function _selecionarFicha(tipo, id) {
  _fichaSel = { tipo, id };
  // Bebidas ('outro') e demais fichas agora vivem todas na aba Fichas Técnicas
  document.getElementById('fichaListView').style.display = 'none';
  document.getElementById('fichaDetailView').style.display = '';
  _renderFichaDetail();
}

function _novaFicha(tipo) {
  _selecionarFicha(tipo, null);
}

function _voltarListaFichas() {
  _fichaSel = null;
  renderCadFichas();
}

function _irParaFicha(tipo, id) {
  setCadTab('produtos');
  _selecionarFicha(tipo, id);
}

function _renderFichaDetail() {
  const isOutro   = _fichaSel?.tipo === 'outro';
  const el = document.getElementById('fichaDetailView');
  if (!el || !_fichaSel) return;

  const isProduto = _fichaSel.tipo === 'produto';
  const registro  = _fichaSel.id
    ? (isProduto ? produtosPizza.find(p => p.id === _fichaSel.id)
      : isOutro  ? produtos.find(p => p.id === _fichaSel.id)
      : opcoes.find(o => o.id === _fichaSel.id))
    : null;
  const nomeAtual = (isOutro ? registro?.name : registro?.nome) || '';

  const rotulo = isProduto ? 'Produto (base — massa, molho, embalagem)'
    : isOutro ? 'Produto (bebidas, sobremesas e outros — débito via ficha técnica)'
    : 'Opção (cobertura — a "1/2 porção" do sabor)';

  el.innerHTML = `
    <button class="ft-editor-back" onclick="_voltarListaFichas()">${lc('arrow-left',16,'currentColor')} Voltar para a lista</button>
    <div style="font-size:.8rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">
      ${rotulo}
    </div>
    <div class="ft-editor-head">
      <input class="inp" id="xNome" placeholder="Nome" value="${nomeAtual.replace(/"/g,'&quot;')}" style="flex:2;min-width:260px">
      ${(isProduto || isOutro) ? '' : `
      <select class="inp" id="xCategoria" style="flex:1;min-width:140px" title="Só pra organizar a lista — não afeta cálculo nem débito">
        <option value="salgada"${registro?.categoria!=='doce'?' selected':''}>Salgada</option>
        <option value="doce"${registro?.categoria==='doce'?' selected':''}>Doce</option>
      </select>`}
    </div>
    <div class="ft-summary-row">
      <div><span class="ft-summary-val" id="xftCustoDisplay"></span><div class="ft-summary-label" id="xftCustoSub"></div></div>
    </div>
    <div id="xftTable"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
      <button class="btn btn-outline btn-sm" onclick="_ftAddRow()">+ Adicionar insumo</button>
      <div style="display:flex;gap:10px">
        ${registro ? `<button class="btn btn-red btn-sm" onclick="_excluirFicha()">Excluir</button>` : ''}
        <button class="btn btn-primary btn-sm" onclick="_salvarFicha()">Salvar</button>
      </div>
    </div>
  `;

  _ftInit(registro?.fichaTecnica || null, 'flat', 'x');
}

function _salvarFicha() {
  if (!_fichaSel) return;
  const nome = document.getElementById('xNome').value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const fichaTecnica = { ingredientes: _ftRows.filter(r => r.item_id) };

  if (_fichaSel.tipo === 'produto') {
    if (_fichaSel.id) {
      const idx = produtosPizza.findIndex(p => p.id === _fichaSel.id);
      if (idx >= 0) produtosPizza[idx] = { ...produtosPizza[idx], nome, fichaTecnica };
    } else {
      const novo = { id: nextProdPizzaId++, nome, fichaTecnica, active: true };
      produtosPizza.push(novo);
      _fichaSel.id = novo.id;
    }
    saveProdPizza();
  } else if (_fichaSel.tipo === 'outro') {
    if (_fichaSel.id) {
      const idx = produtos.findIndex(p => p.id === _fichaSel.id);
      if (idx >= 0) produtos[idx] = { ...produtos[idx], name: nome, fichaTecnica };
    } else {
      const novo = { id: nextPid++, name: nome, cat: 'Outros', price: 0, active: true, fichaTecnica };
      produtos.push(novo);
      _fichaSel.id = novo.id;
    }
    saveP();
  } else {
    const categoria = document.getElementById('xCategoria')?.value || 'salgada';
    if (_fichaSel.id) {
      const idx = opcoes.findIndex(o => o.id === _fichaSel.id);
      if (idx >= 0) opcoes[idx] = { ...opcoes[idx], nome, categoria, fichaTecnica };
    } else {
      const nova = { id: nextOpcaoId++, nome, categoria, fichaTecnica, active: true };
      opcoes.push(nova);
      _fichaSel.id = nova.id;
    }
    saveOpcoes();
  }
  toast(`${lc("check-circle",14,"var(--green)")} Ficha técnica salva!`);
  _voltarListaFichas();
}

function _excluirFicha() {
  if (!_fichaSel?.id) return;
  const tipo = _fichaSel.tipo;
  const nome = tipo === 'produto' ? produtosPizza.find(p => p.id === _fichaSel.id)?.nome
    : tipo === 'outro' ? produtos.find(p => p.id === _fichaSel.id)?.name
    : opcoes.find(o => o.id === _fichaSel.id)?.nome;
  vtpConfirm({
    title: `Excluir "${nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      if (tipo === 'produto') {
        produtosPizza = produtosPizza.filter(p => p.id !== _fichaSel.id);
        saveProdPizza();
      } else if (tipo === 'outro') {
        produtos = produtos.filter(p => p.id !== _fichaSel.id);
        saveP();
      } else {
        opcoes = opcoes.filter(o => o.id !== _fichaSel.id);
        saveOpcoes();
      }
      toast(`${lc("trash-2",14,"currentColor")} "${nome}" excluído.`);
      _voltarListaFichas();
    }
  });
}

// ══════════════════════════════════════════════════════════════
// PRODUTOS (CARDÁPIO WEB) — interpretação estrutural + mapeamento
//
// O catálogo NÃO é cadastrado à mão nem classificado por nome de item.
// O sistema INTERPRETA a estrutura de cada pedido (item → opções →
// option_group_name) para descobrir, independente do canal (iFood /
// 99Food / site), o que foi vendido — e reduz tudo a duas coisas que
// precisam de ficha técnica:
//
//   SABORES — cada sabor distinto de pizza (Calabresa, Portuguesa...),
//             não importa em qual das ~5 formas de nome ele apareça.
//             Mapeia para uma Opção (a "1/2 porção"). Tamanho e base
//             são DERIVADOS da estrutura, nunca digitados.
//   BEBIDAS — refrigerantes e itens de revenda. Mapeiam para um Produto
//             de "Outros" (débito via ficha técnica) ou insumo direto.
//
// Como a estrutura é lida (validado nos pedidos reais):
//   • Grupo "Pizza Grande/Pequena (N Pedaços) | Pizza Salgada/Doce"
//     → é um TRILHO de sabores: o grupo diz o tamanho, cada opção é um
//       sabor; a quantidade da opção é a contagem de meias porções
//       (grande inteira de 1 sabor vem como x2; meio a meio, 1+1).
//   • Item "Sabor | Pizza Tradicional" com opção "Pizza Grande/Pequena"
//     → o sabor está no nome do item, o tamanho na opção (layout iFood).
//   • Grupo com "bebida" no nome, ou opção sem grupo que não é tamanho,
//     ou item avulso sem opções → BEBIDA.
//
// O mapa (vtp_cw_mapa) é o contrato que o parser de débito vai consumir:
//   { sabores: { <chaveSabor>: {opcaoId, auto} },
//     bebidas: { <chaveBebida>: {tipo:'produto'|'insumo', id, auto} } }
// ══════════════════════════════════════════════════════════════

let _cwMapa = db._get('vtp_cw_mapa', null);
if (!_cwMapa || !_cwMapa.sabores || !_cwMapa.bebidas) _cwMapa = { sabores: {}, bebidas: {} };
const saveCwMapa = () => db._set('vtp_cw_mapa', _cwMapa);

let _cwDados     = null;   // { sabores:[...], bebidas:[...] } — cache da sessão
let _cwEditKind  = null;   // 'sabor' | 'bebida' — seção com form aberto
let _cwEditKey   = null;   // chave da linha em edição
let _cwAlvoSel   = null;   // destino escolhido no form { tipo, id }

function _cwNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Reduz qualquer forma de nome de sabor à sua "chave" canônica:
//   "1/2 Quatro Queijos"        → "quatro queijos"
//   "Quatro Queijos"            → "quatro queijos"
//   "Sonho de Valsa | Pizza Doce" → "sonho de valsa"
//   "Pizza de Calabresa"        → "calabresa"
function _cwSaborKey(nome) {
  return _cwNorm(nome)
    .replace(/^1\/2\s+/, '')
    .replace(/\s*\|\s*pizza.*$/, '')
    .replace(/^pizza\s+(de\s+)?/, '')
    .trim();
}

// ── Similaridade (matching por aproximação de nome) ────────────
// Sabores foram renomeados no CW ao longo do tempo (ex: "Frango com
// Requeijão" ≈ "Frango Catupiry" ≈ "Frango Cremoso"). Match exato não
// resolve — então casamos por semelhança de tokens + tolerância a
// grafia, com um pequeno dicionário de sinônimos culinários.
const _CW_SINONIMOS = { catupiry: 'catupiry', cremoso: 'catupiry', requeijao: 'catupiry', creme: 'catupiry' };
const _CW_STOP = new Set(['de','e','com','ao','a','o','da','do','na','no','ou','em','1','2','meia','inteira','pizza','sabor','antartica','antarctica']);
function _cwCanonTok(t) { return _CW_SINONIMOS[t] || t; }
function _cwTokens(s) {
  return _cwSaborKey(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t && !_CW_STOP.has(t)).map(_cwCanonTok);
}
function _cwLev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function _cwSim(a, b) {
  const A = _cwTokens(a), B = _cwTokens(b);
  if (!A.length || !B.length) return 0;
  const sA = new Set(A), sB = new Set(B);
  let inter = 0; for (const t of sA) if (sB.has(t)) inter++;
  const jaccard = inter / (sA.size + sB.size - inter);
  let score = jaccard;
  // Contenção DIRECIONAL: só dá bônus quando a query (A) está inteira no
  // candidato (B) — ou seja, o candidato é mais específico e contém tudo
  // que a query pediu ("Milho" ⊆ "Milho Verde"). O contrário ("COCA-COLA
  // 1L" contido em "Coca-Cola Zero 1l") NÃO ganha bônus: o candidato está
  // faltando um token que a query tem ("zero"), então é menos correto.
  let queryContida = A.length > 0; for (const t of sA) if (!sB.has(t)) { queryContida = false; break; }
  if (queryContida && [...sA].some(t => t.length >= 3)) score = Math.max(score, Math.min(0.92, jaccard + 0.35));
  // Tolerância a grafia (nível de caractere)
  const c1 = _cwSaborKey(a).replace(/[^a-z0-9]/g, ''), c2 = _cwSaborKey(b).replace(/[^a-z0-9]/g, '');
  if (c1 && c2) score = Math.max(score, (1 - _cwLev(c1, c2) / Math.max(c1.length, c2.length)) * 0.9);
  return score;
}
// Top-N candidatos de uma lista {nome} para um nome do CW
function _cwRank(nome, pool, campoNome, n = 3, minScore = 0.34) {
  return pool.map(x => ({ x, s: _cwSim(nome, x[campoNome]) }))
    .filter(r => r.s >= minScore).sort((a, b) => b.s - a.s).slice(0, n);
}

// ── Regras de estrutura ────────────────────────────────────────
const _RE_SLOT     = /pizza\s+(grande|pequena).*pizza\s+(salgada|doce)/i; // grupo = trilho de sabores
const _RE_SIZE_OPT = /^pizza\s+(grande|pequena)\b/i;                       // opção = seletor de tamanho (layout B)
const _RE_BEBIDA   = /bebida/i;                                           // grupo de bebida
const _RE_CONTAINER= /combo|promo|leve\s*\d|pague|pizza\s+(grande|pequena)/i; // item que é container/pizza, não bebida

function _cwTamDoGrupo(g)  { return /grande/i.test(g) ? 'grande' : 'pequena'; }
function _cwTamDaOpcao(n)  { return /grande/i.test(n) ? 'grande' : 'pequena'; }

async function _cwDescobrir(dias = 90) {
  const sb = _cwGetSbClient();
  const inicio = new Date(Date.now() - dias * 864e5).toISOString();
  const { data, error } = await sb
    .from('cw_pedidos')
    .select('items, cw_created_at')
    .gte('cw_created_at', inicio)
    .limit(6000);
  if (error) throw new Error(error.message);

  const sab = {}; // chave → { chave, nome, vendas, tamanhos:Set, formas:Set }
  const beb = {}; // chave → { chave, nome, vendas, ultimoPreco }

  const addSaborUm = (nome, tam, qtd) => {
    const chave = _cwSaborKey(nome);
    if (!chave) return;
    // Guarda: descritor de tamanho ("Pizza Grande", "Pequena (4 Pedaços)") não é sabor
    if (/^(grande|pequena)\b/.test(chave) || /pedaco/.test(chave)) return;
    if (!sab[chave]) sab[chave] = { chave, nome: _cwTitulo(chave), vendas: 0, tamanhos: new Set(), formas: new Set() };
    sab[chave].vendas += qtd || 1;
    if (tam) sab[chave].tamanhos.add(tam);
    sab[chave].formas.add(nome);
  };
  // Nome pode conter vários sabores ("1/2 A + 1/2 B | Pizza Grande") — quebra em cada um
  const addSabor = (nome, tam, qtd) => {
    (nome || '').split('|')[0].split('+').forEach(parte => addSaborUm(parte, tam, qtd));
  };
  const addBebida = (nome, qtd, preco) => {
    const chave = _cwNorm(nome);
    if (!chave) return;
    if (!beb[chave]) beb[chave] = { chave, nome, vendas: 0, ultimoPreco: 0 };
    beb[chave].vendas += qtd || 1;
    if (preco > 0) beb[chave].ultimoPreco = preco;
  };

  const walk = (it, mult) => {
    if (!it || it.status === 'canceled') return;
    const qtd = (it.quantity || 1) * mult;
    const opts = it.options || [];

    // Layout B: tamanho vem numa opção "Pizza Grande/Pequena", sabor no nome do item
    const sizeOpt = opts.find(o => _RE_SIZE_OPT.test(o.name || ''));
    if (sizeOpt) {
      addSabor(it.name, _cwTamDaOpcao(sizeOpt.name), qtd);
    }

    for (const o of opts) {
      const g = o.option_group_name || '';
      const oq = (o.quantity || 1) * qtd;
      if (_RE_SLOT.test(g)) {
        addSabor(o.name, _cwTamDoGrupo(g), oq);            // trilho de sabores
      } else if (_RE_BEBIDA.test(g)) {
        addBebida(o.name, oq, o.unit_price || 0);          // bebida (grátis/upsell)
      } else if (_RE_SIZE_OPT.test(o.name || '')) {
        // opção de tamanho (layout B) já tratada acima → ignora
      } else if (/\|\s*pizza/i.test(o.name || '')) {
        addSabor(o.name, null, oq);                        // opção que é sabor ("Smores | Pizza Doce")
      } else if (!g) {
        addBebida(o.name, oq, o.unit_price || 0);          // opção solta → bebida/revenda
      }
    }

    // Item avulso sem opção de tamanho e sem trilho de sabores:
    if (!sizeOpt && !opts.some(o => _RE_SLOT.test(o.option_group_name || ''))) {
      if (/\|\s*pizza/i.test(it.name || '')) {
        // Layout B sem opção de tamanho (ex: "Smores | Pizza Doce") — é sabor,
        // tamanho será derivado no débito pela estrutura do pedido
        addSabor(it.name, null, qtd);
      } else if (!opts.length && !_RE_CONTAINER.test(it.name || '')) {
        // Item avulso de verdade (bebida/revenda)
        addBebida(it.name, qtd, it.unit_price || 0);
      }
    }

    for (const sub of (it.items || [])) walk(sub, qtd);
  };

  for (const p of (data || [])) {
    for (const it of (p.items || [])) walk(it, 1);
  }

  _cwAutoMapear(sab, beb);

  const finalizar = obj => Object.values(obj)
    .map(r => ({ ...r, tamanhos: r.tamanhos ? [...r.tamanhos] : [], formas: r.formas ? [...r.formas] : [] }))
    .sort((a, b) => b.vendas - a.vendas);

  return { sabores: finalizar(sab), bebidas: finalizar(beb) };
}

// Title Case simples pra exibir a chave normalizada
function _cwTitulo(chave) {
  return chave.replace(/\b\w/g, c => c.toUpperCase());
}

// Auto-match por SIMILARIDADE. Só aplica automaticamente quando há um
// vencedor claro (alta semelhança e bem à frente do 2º) — nomes ambíguos
// (ex: "Frango com Requeijão" entre Catupiry/Cremoso) ficam pendentes com
// as sugestões clicáveis no formulário, pra você confirmar.
const _CW_AUTO_STRONG = 0.93; // match quase-exato: auto sozinho, sem exigir gap
const _CW_AUTO_MIN    = 0.82; // confiança mínima (com gap) pra auto-mapear
const _CW_AUTO_GAP    = 0.12; // distância mínima do 2º candidato

// Vencedor claro: quase-exato OU (bom o bastante E bem à frente do 2º)
function _cwVencedorClaro(cands) {
  if (!cands[0]) return false;
  if (cands[0].s >= _CW_AUTO_STRONG) return true;
  return cands[0].s >= _CW_AUTO_MIN && (!cands[1] || cands[0].s - cands[1].s >= _CW_AUTO_GAP);
}

function _cwPoolBebidas() {
  return [
    ...produtos.filter(p => p.active !== false).map(p => ({ tipo: 'produto', id: p.id, nome: p.name })),
    ...items.filter(i => i.active !== false && !i.isProd).map(i => ({ tipo: 'insumo', id: i.id, nome: i.name })),
  ];
}

function _cwAutoMapear(sab, beb) {
  let mudou = false;
  const poolBeb = _cwPoolBebidas();

  for (const k in sab) {
    if (_cwMapa.sabores[k]?.auto === false) continue;
    const cands = _cwRank(sab[k].nome, opcoes, 'nome', 2);
    const claro = _cwVencedorClaro(cands);
    if (claro) {
      if (_cwMapa.sabores[k]?.opcaoId !== cands[0].x.id) { _cwMapa.sabores[k] = { opcaoId: cands[0].x.id, auto: true }; mudou = true; }
    } else if (_cwMapa.sabores[k]?.auto) { delete _cwMapa.sabores[k]; mudou = true; }
  }

  for (const k in beb) {
    if (_cwMapa.bebidas[k]?.auto === false) continue;
    const cands = _cwRank(beb[k].nome, poolBeb, 'nome', 2);
    // produto ganha de insumo em empate de score
    if (cands[1] && Math.abs(cands[0].s - cands[1].s) < 0.001 && cands[1].x.tipo === 'produto') cands.reverse();
    const claro = _cwVencedorClaro(cands);
    const cur = _cwMapa.bebidas[k];
    if (claro) {
      const novo = { tipo: cands[0].x.tipo, id: cands[0].x.id };
      if (!cur || cur.tipo !== novo.tipo || cur.id !== novo.id) { _cwMapa.bebidas[k] = { ...novo, auto: true }; mudou = true; }
    } else if (cur?.auto) { delete _cwMapa.bebidas[k]; mudou = true; }
  }
  if (mudou) saveCwMapa();
}

// ── Render ─────────────────────────────────────────────────────
async function renderCadCw() {
  const el = document.getElementById('cadCwGrid');
  if (!el) return;
  if (!_cwDados) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:.9rem">
      ${lc('refresh-cw',18,'currentColor')} Interpretando os pedidos do Cardápio Web...</div>`;
    try { _cwDados = await _cwDescobrir(90); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:.9rem">Não consegui ler os pedidos: ${e.message}</div>`;
      return;
    }
  }
  _cwRenderLista();
}

function _cwRenderLista() {
  const el = document.getElementById('cadCwGrid');
  if (!el || !_cwDados) return;

  const busca  = _cwNorm(document.getElementById('srchCw')?.value || '');
  const soPend = document.getElementById('filCwPend')?.checked || false;

  const sabPend = _cwDados.sabores.filter(r => !_cwMapa.sabores[r.chave]).length;
  const bebPend = _cwDados.bebidas.filter(r => !_cwMapa.bebidas[r.chave]).length;

  const filtra = (lista, mapa) => lista.filter(r => {
    if (busca && !r.chave.includes(busca) && !_cwNorm(r.nome).includes(busca)) return false;
    if (soPend && mapa[r.chave]) return false;
    return true;
  });

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap">
      <div style="font-size:.82rem;color:var(--muted)">
        Interpretado de <b>90 dias</b> de pedidos · ${sabPend + bebPend === 0
          ? '<span style="color:var(--green);font-weight:700">tudo mapeado ✓</span>'
          : `<span style="color:var(--warning-fg,#D97706);font-weight:700">${sabPend + bebPend} pendente(s)</span>`}
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;color:var(--muted);cursor:pointer">
          <input type="checkbox" id="filCwPend" onchange="_cwRenderLista()" ${soPend ? 'checked' : ''}> só pendentes
        </label>
        <input class="inp" id="srchCw" placeholder="Buscar..." value="${busca}" oninput="_cwRenderLista()" style="width:200px">
        <button class="btn btn-outline btn-sm" onclick="_cwDados=null;renderCadCw()">${lc('refresh-cw',13,'currentColor')} Reinterpretar</button>
      </div>
    </div>

    <div class="ft-section">
      <div class="ft-section-head">
        <div><span class="ft-section-title">Sabores</span><span class="ft-section-count">${_cwDados.sabores.length} distintos${sabPend ? ` · ${sabPend} a mapear` : ''}</span></div>
      </div>
      ${filtra(_cwDados.sabores, _cwMapa.sabores).map(r => _cwLinhaSabor(r)).join('') || '<div class="ft-empty-list">Nenhum sabor</div>'}
    </div>

    <div class="ft-section">
      <div class="ft-section-head">
        <div><span class="ft-section-title">Bebidas e outros</span><span class="ft-section-count">${_cwDados.bebidas.length} distintos${bebPend ? ` · ${bebPend} a mapear` : ''}</span></div>
      </div>
      ${filtra(_cwDados.bebidas, _cwMapa.bebidas).map(r => _cwLinhaBebida(r)).join('') || '<div class="ft-empty-list">Nenhuma bebida</div>'}
    </div>
  `;
  if (busca && document.activeElement?.id !== 'srchCw') {
    const s = document.getElementById('srchCw');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
}

function _cwTamBadges(tamanhos) {
  return (tamanhos || []).map(t =>
    `<span style="font-size:.68rem;font-weight:600;background:var(--surface2);color:var(--muted);padding:1px 7px;border-radius:var(--r6);margin-left:6px">${t === 'grande' ? 'Grande' : 'Pequena'}</span>`
  ).join('');
}

function _cwLinhaSabor(r) {
  const m = _cwMapa.sabores[r.chave];
  const editando = _cwEditKind === 'sabor' && _cwEditKey === r.chave;
  let destino = '', badge;
  if (!m) {
    badge = `<span style="font-size:.76rem;font-weight:700;background:var(--yellow-light);color:var(--warning-fg,#B45309);padding:4px 11px;border-radius:var(--r6)">a mapear</span>`;
  } else {
    const opc = opcoes.find(o => o.id === m.opcaoId);
    const temFt = opc?.fichaTecnica?.ingredientes?.length > 0;
    destino = opc ? `<span style="font-size:.8rem;color:var(--muted)">→ ${opc.nome}</span>` : '';
    badge = temFt
      ? `<span style="font-size:.76rem;font-weight:700;background:var(--green-light);color:var(--green);padding:4px 11px;border-radius:var(--r6)">mapeado${m.auto ? ' · auto' : ''}</span>`
      : `<span style="font-size:.76rem;font-weight:700;background:var(--orange-light);color:var(--orange-dark);padding:4px 11px;border-radius:var(--r6)" title="Opção sem ficha técnica — o custo não será calculado">sem ficha</span>`;
  }
  return `
    <div class="ft-list-row" style="cursor:default;${editando ? 'border-color:var(--purple)' : ''}">
      <div class="ft-list-main">
        <div class="ft-list-name" style="font-size:.92rem">${r.nome}${_cwTamBadges(r.tamanhos)}</div>
        <div class="ft-list-sub">${r.vendas} venda(s)${r.formas.length > 1 ? ` · ${r.formas.length} formas de nome no CW` : ''}</div>
        ${editando ? _cwFormSabor(r) : ''}
      </div>
      ${destino}${badge}
      <button class="btn btn-outline btn-xs" onclick="_cwEditar('sabor','${r.chave.replace(/'/g,"\\'")}')">${editando ? 'Fechar' : (m ? 'Editar' : 'Mapear')}</button>
    </div>`;
}

function _cwLinhaBebida(r) {
  const m = _cwMapa.bebidas[r.chave];
  const editando = _cwEditKind === 'bebida' && _cwEditKey === r.chave;
  let destino = '', badge;
  if (!m) {
    badge = `<span style="font-size:.76rem;font-weight:700;background:var(--yellow-light);color:var(--warning-fg,#B45309);padding:4px 11px;border-radius:var(--r6)">a mapear</span>`;
  } else {
    const alvo = m.tipo === 'produto' ? produtos.find(p => p.id === m.id)?.name : items.find(i => i.id === m.id)?.name;
    destino = alvo ? `<span style="font-size:.8rem;color:var(--muted)">→ ${alvo}</span>` : '';
    badge = `<span style="font-size:.76rem;font-weight:700;background:var(--green-light);color:var(--green);padding:4px 11px;border-radius:var(--r6)">${m.tipo}${m.auto ? ' · auto' : ''}</span>`;
  }
  return `
    <div class="ft-list-row" style="cursor:default;${editando ? 'border-color:var(--purple)' : ''}">
      <div class="ft-list-main">
        <div class="ft-list-name" style="font-size:.92rem">${r.nome}</div>
        <div class="ft-list-sub">${r.vendas} venda(s)${r.ultimoPreco > 0 ? ' · R$ ' + fmt(r.ultimoPreco) : ''}</div>
        ${editando ? _cwFormBebida(r) : ''}
      </div>
      ${destino}${badge}
      <button class="btn btn-outline btn-xs" onclick="_cwEditar('bebida','${r.chave.replace(/'/g,"\\'")}')">${editando ? 'Fechar' : (m ? 'Editar' : 'Mapear')}</button>
    </div>`;
}

function _cwEditar(kind, chave) {
  if (_cwEditKind === kind && _cwEditKey === chave) { _cwEditKind = _cwEditKey = null; }
  else {
    _cwEditKind = kind; _cwEditKey = chave; _cwAlvoSel = null;
    // Pré-seleciona a melhor sugestão por similaridade (se não houver mapa)
    const lista = kind === 'sabor' ? _cwDados?.sabores : _cwDados?.bebidas;
    const r = lista?.find(x => x.chave === chave);
    const jaMapeado = kind === 'sabor' ? _cwMapa.sabores[chave] : _cwMapa.bebidas[chave];
    if (r && !jaMapeado) {
      const cand = _cwSugestoes(kind, r.nome)[0];
      if (cand) _cwAlvoSel = { tipo: cand.tipo, id: cand.id };
    }
  }
  _cwRenderLista();
  if (_cwEditKey) setTimeout(() => document.getElementById('cwAlvo')?.focus(), 40);
}

// Top candidatos (com tipo/id/nome/score) para exibir como chips
function _cwSugestoes(kind, nome) {
  if (kind === 'sabor') {
    return _cwRank(nome, opcoes, 'nome', 3).map(c => ({ tipo: 'opcao', id: c.x.id, nome: c.x.nome, s: c.s }));
  }
  return _cwRank(nome, _cwPoolBebidas(), 'nome', 3).map(c => ({ tipo: c.x.tipo, id: c.x.id, nome: c.x.nome, s: c.s }));
}

function _cwChipsHtml(kind, r) {
  const sug = _cwSugestoes(kind, r.nome);
  if (!sug.length) return '';
  const sel = _cwAlvoSel;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;flex-basis:100%;align-items:center">
    <span style="font-size:.7rem;color:var(--muted)">Sugestões:</span>
    ${sug.map(c => {
      const ativo = sel && sel.tipo === c.tipo && sel.id === c.id;
      return `<button class="chip" onclick="event.stopPropagation();_cwPickChip('${c.tipo}',${c.id},this.dataset.n)" data-n="${c.nome.replace(/"/g,'&quot;')}"
        style="cursor:pointer;font-size:.74rem;padding:3px 10px;border:1.5px solid ${ativo ? 'var(--purple)' : 'var(--border)'};background:${ativo ? 'var(--purple-xlight)' : 'var(--surface)'};color:${ativo ? 'var(--purple)' : 'var(--text)'};border-radius:var(--radius-pill,999px);font-weight:600">
        ${c.nome} <span style="opacity:.6;font-weight:400">${Math.round(c.s * 100)}%</span></button>`;
    }).join('')}
  </div>`;
}

function _cwPickChip(tipo, id, nome) {
  _cwPickAlvo(tipo, id, nome);
  _cwRenderLista(); // re-render pra destacar o chip ativo
}

// Nome do alvo atualmente escolhido (_cwAlvoSel) pra preencher o input
function _cwAlvoNome() {
  if (!_cwAlvoSel) return '';
  if (_cwAlvoSel.tipo === 'opcao')   return opcoes.find(o => o.id === _cwAlvoSel.id)?.nome || '';
  if (_cwAlvoSel.tipo === 'produto') return produtos.find(p => p.id === _cwAlvoSel.id)?.name || '';
  return items.find(i => i.id === _cwAlvoSel.id)?.name || '';
}

function _cwFormSabor(r) {
  const m = _cwMapa.sabores[r.chave];
  const opc = m ? opcoes.find(o => o.id === m.opcaoId) : null;
  const val = _cwAlvoSel ? _cwAlvoNome() : (opc ? opc.nome : '');
  const ch = r.chave.replace(/'/g, "\\'");
  return `
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:flex-start" onclick="event.stopPropagation()">
      <div class="ft-ac-wrap" style="flex:1;min-width:260px">
        <input type="text" class="inp" id="cwAlvo" placeholder="Buscar Opção (cobertura)..." value="${val.replace(/"/g,'&quot;')}"
          oninput="_cwSearchAlvo('sabor')" onfocus="_cwSearchAlvo('sabor')"
          onblur="setTimeout(()=>{const d=document.getElementById('cwDrop');if(d)d.style.display='none'},150)">
        <div class="ft-ac-list" id="cwDrop" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_cwSalvar('sabor','${ch}')">Salvar</button>
      ${m ? `<button class="btn btn-ghost btn-sm" onclick="_cwRemover('sabor','${ch}')">Remover</button>` : ''}
      ${_cwChipsHtml('sabor', r)}
      <div style="font-size:.72rem;color:var(--muted);flex-basis:100%;margin-top:2px">Não achou a Opção? Crie em <b>Fichas Técnicas</b> primeiro.</div>
    </div>`;
}

function _cwFormBebida(r) {
  const m = _cwMapa.bebidas[r.chave];
  const alvo = m ? (m.tipo === 'produto' ? produtos.find(p => p.id === m.id)?.name : items.find(i => i.id === m.id)?.name) : '';
  const val = _cwAlvoSel ? _cwAlvoNome() : (alvo || '');
  const ch = r.chave.replace(/'/g, "\\'");
  return `
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:flex-start" onclick="event.stopPropagation()">
      <div class="ft-ac-wrap" style="flex:1;min-width:260px">
        <input type="text" class="inp" id="cwAlvo" placeholder="Buscar Produto (Outros) ou insumo..." value="${val.replace(/"/g,'&quot;')}"
          oninput="_cwSearchAlvo('bebida')" onfocus="_cwSearchAlvo('bebida')"
          onblur="setTimeout(()=>{const d=document.getElementById('cwDrop');if(d)d.style.display='none'},150)">
        <div class="ft-ac-list" id="cwDrop" style="display:none"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_cwSalvar('bebida','${ch}')">Salvar</button>
      ${m ? `<button class="btn btn-ghost btn-sm" onclick="_cwRemover('bebida','${ch}')">Remover</button>` : ''}
      ${_cwChipsHtml('bebida', r)}
    </div>`;
}

function _cwSearchAlvo(kind) {
  const drop = document.getElementById('cwDrop');
  const q = _cwNorm(document.getElementById('cwAlvo')?.value || '');
  if (!drop) return;
  let pool;
  if (kind === 'sabor') {
    pool = opcoes.map(o => ({ tipo: 'opcao', id: o.id, nome: o.nome, sub: o.categoria }));
  } else {
    pool = [
      ...produtos.filter(p => p.active !== false).map(p => ({ tipo: 'produto', id: p.id, nome: p.name, sub: 'produto' })),
      ...items.filter(i => i.active !== false && !i.isProd).map(i => ({ tipo: 'insumo', id: i.id, nome: i.name, sub: i.cat || 'insumo' })),
    ];
  }
  const matches = pool.filter(p => !q || _cwNorm(p.nome).includes(q)).slice(0, 8);
  drop.innerHTML = matches.length
    ? matches.map(p => `<div class="ft-ac-item" onmousedown="event.preventDefault();_cwPickAlvo('${p.tipo}',${p.id},this.querySelector('span').textContent)">
        <span>${p.nome}</span><span class="ft-ac-cat">${p.sub || ''}</span></div>`).join('')
    : `<div class="ft-ac-item" style="cursor:default;color:var(--muted)">Nada encontrado</div>`;
  drop.style.display = 'block';
}

function _cwPickAlvo(tipo, id, nome) {
  _cwAlvoSel = { tipo, id };
  const inp = document.getElementById('cwAlvo');
  if (inp) inp.value = nome;
  const drop = document.getElementById('cwDrop');
  if (drop) drop.style.display = 'none';
}

function _cwSalvar(kind, chave) {
  if (!_cwAlvoSel) { toast('Escolha o destino', 'err'); return; }
  if (kind === 'sabor') {
    _cwMapa.sabores[chave] = { opcaoId: _cwAlvoSel.id, auto: false };
  } else {
    _cwMapa.bebidas[chave] = { tipo: _cwAlvoSel.tipo, id: _cwAlvoSel.id, auto: false };
  }
  saveCwMapa();
  _cwEditKind = _cwEditKey = null; _cwAlvoSel = null;
  toast(`${lc("check-circle",14,"var(--green)")} Mapeamento salvo!`);
  _cwRenderLista();
}

function _cwRemover(kind, chave) {
  if (kind === 'sabor') delete _cwMapa.sabores[chave];
  else delete _cwMapa.bebidas[chave];
  saveCwMapa();
  _cwEditKind = _cwEditKey = null;
  _cwRenderLista();
}

// renderCadProdutos already handles cadProdutosGrid correctly

let _editSaborId = null, _editSaborTipo = null;

function openSaborModal(tipoId, saborId) {
  _editSaborId   = saborId || null;
  _editSaborTipo = tipoId;
  const s    = saborId ? sabores.find(x => x.id === saborId) : null;
  const tipo = PIZZA_TIPOS.find(t => t.id === tipoId);

  document.getElementById('fsabModalTitle').textContent = s ? `${s.name}` : `Novo Sabor — ${tipo?.label}`;
  document.getElementById('fsabTipo').textContent  = tipo?.label || '';
  document.getElementById('fsabName').value        = s?.name || '';
  document.getElementById('fsabAcr').value         = s?.acr ?? '';
  document.getElementById('fsabActive').checked    = s ? s.active !== false : true;
  document.getElementById('delSaborBtn').style.display = s ? 'inline-flex' : 'none';
  document.getElementById('ovSabor').classList.add('open');
  setTimeout(() => document.getElementById('fsabName').focus(), 80);
}

function saveSabor() {
  const name   = document.getElementById('fsabName').value.trim();
  const acr    = parseFloat(document.getElementById('fsabAcr').value) || 0;
  const active = document.getElementById('fsabActive').checked;
  if (!name) { toast('Informe o nome do sabor', 'err'); return; }

  if (_editSaborId) {
    const idx = sabores.findIndex(s => s.id === _editSaborId);
    if (idx >= 0) sabores[idx] = { ...sabores[idx], name, acr, active };
    toast('Sabor atualizado!');
  } else {
    sabores.push({ id: nextSabId++, tipo: _editSaborTipo, name, acr, active });
    toast('Sabor adicionado!');
  }
  saveSab();
  closeModal('ovSabor');
  renderCadSabores();
}

function deleteSabor() {
  if (!_editSaborId) return;
  vtpConfirm({
    title: 'Excluir sabor',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      sabores = sabores.filter(s => s.id !== _editSaborId);
      saveSab();
      closeModal('ovSabor');
      renderCadSabores();
      toast('Sabor excluído.');
    }
  });
}



// ══════════════════════════════════════════════════════════════
// IMPORTAR INSUMOS DO CARDÁPIO WEB (CSV)
// ══════════════════════════════════════════════════════════════
function abrirImportCadInsumos() {
  const popup = document.createElement('div');
  popup.id = 'popupImportCad';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r12);padding:24px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.25)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">Importar insumos do Cardápio Web</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Importa nome, categoria, código, unidade e custo do relatório de estoque</div>
        </div>
        <button onclick="document.getElementById('popupImportCad').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">${lc("x",13,"currentColor")}</button>
      </div>

      <!-- Drop zone -->
      <div id="cadImportDrop"
        onclick="document.getElementById('cadImportFile').click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--purple)'"
        ondragleave="this.style.borderColor='var(--border)'"
        ondrop="event.preventDefault();parseCadCSV(event.dataTransfer.files[0])"
        style="border:2px dashed var(--border);border-radius:var(--r10);padding:28px;text-align:center;cursor:pointer;transition:border-color .2s;margin-bottom:14px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style="font-size:var(--text-sm);font-weight:600;color:var(--text2)">Clique ou arraste o arquivo CSV aqui</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">Relatório de Estoque de Insumos do Cardápio Web (.csv)</div>
        <input type="file" id="cadImportFile" accept=".csv,.txt" style="display:none" onchange="parseCadCSV(this.files[0])">
      </div>

      <div id="cadImportPreview"></div>
    </div>`;
  document.body.appendChild(popup);
}

function parseCadCSV(file) {
  if (!file) return;
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
    const codeIdx = col('cod. interno','codigo interno','cod interno');
    const catIdx  = col('categoria');
    const unitIdx = col('medida','unidade');
    const costIdx = col('preco de custo','custo de custo');
    const minIdx  = col('estoque minimo','minimo');

    if (nameIdx === -1) { toast('Coluna "Insumo" não encontrada no CSV', 'err'); return; }

    const parseMoney = v => parseFloat((v||'').replace(/[R$\s]/g,'').replace(',','.')) || 0;
    const parseNum   = v => { const n = parseFloat((v||'').replace(',','.')); return isNaN(n) ? null : n; };

    const rows = lines.slice(1).map(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/"/g,''));
      return {
        name: nameIdx >= 0 ? cols[nameIdx]||'' : '',
        code: codeIdx >= 0 ? cols[codeIdx]||'' : '',
        cat:  catIdx  >= 0 ? cols[catIdx] ||'' : '',
        unit: unitIdx >= 0 ? cols[unitIdx]||'un' : 'un',
        cost: costIdx >= 0 ? parseMoney(cols[costIdx]) : 0,
        min:  minIdx  >= 0 ? parseNum(cols[minIdx])    : null,
      };
    }).filter(r => r.name);

    // Classifica em: novos | atualizar | ignorar (sem mudança)
    const novos    = [];
    const atualizar = [];

    rows.forEach(r => {
      const exist = items.find(i =>
        (r.code && i.code && i.code.toString() === r.code) ||
        i.name.toLowerCase().trim() === r.name.toLowerCase().trim()
      );
      if (!exist) {
        novos.push(r);
      } else {
        const changes = [];
        if (r.code && exist.code !== r.code)   changes.push(`código: ${exist.code||'—'} → ${r.code}`);
        if (r.cat  && exist.cat  !== r.cat)    changes.push(`categoria: ${exist.cat} → ${r.cat}`);
        if (r.cost && Math.abs(exist.cost - r.cost) > 0.01) changes.push(`custo: R$${exist.cost} → R$${r.cost}`);
        if (r.min  !== null && Math.abs(exist.min - r.min) > 0.001) changes.push(`mín: ${exist.min} → ${r.min}`);
        if (changes.length) atualizar.push({ ...r, id: exist.id, existName: exist.name, changes });
      }
    });

    const prev = document.getElementById('cadImportPreview');
    if (!prev) return;

    prev.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        ${novos.length    ? `<span style="padding:3px 10px;border-radius:10px;font-size:var(--text-xs);font-weight:700;background:var(--green-light);color:var(--green)">${novos.length} novos</span>` : ''}
        ${atualizar.length? `<span style="padding:3px 10px;border-radius:10px;font-size:var(--text-xs);font-weight:700;background:var(--yellow-light);color:#92400e">${atualizar.length} com atualizações</span>` : ''}
        ${!novos.length && !atualizar.length ? `<span style="font-size:var(--text-sm);color:var(--muted)">Todos os itens já estão atualizados.</span>` : ''}
      </div>

      ${novos.length ? `
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          Novos insumos (${novos.length})
        </div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
          ${novos.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--green-light);border:1px solid var(--green);border-radius:var(--r6);font-size:var(--text-sm)">
              <div>
                <strong>${r.name}</strong>
                <span style="color:var(--muted);margin-left:6px">${r.cat} · ${r.unit} · #${r.code||'—'}</span>
              </div>
              ${r.cost ? `<span style="font-family:monospace;color:var(--green);font-weight:700">R$${r.cost.toFixed(2)}</span>` : ''}
            </div>`).join('')}
        </div>` : ''}

      ${atualizar.length ? `
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          Atualizações (${atualizar.length})
        </div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
          ${atualizar.map(r => `
            <div style="padding:7px 10px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r6);font-size:var(--text-sm)">
              <strong>${r.existName}</strong>
              <div style="color:var(--muted);margin-top:2px;font-size:var(--text-xs)">${r.changes.join(' · ')}</div>
            </div>`).join('')}
        </div>` : ''}

      ${(novos.length || atualizar.length) ? `
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('popupImportCad').remove()" class="btn btn-outline" style="flex:1">Cancelar</button>
          <button onclick="confirmarImportCad()" class="btn btn-primary" style="flex:2;display:flex;align-items:center;justify-content:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Confirmar importação
          </button>
        </div>` : `
        <button onclick="document.getElementById('popupImportCad').remove()" class="btn btn-outline" style="width:100%">Fechar</button>`}`;

    // Guarda para confirmar
    window._cadImportData = { novos, atualizar };
  };
  reader.readAsText(file, 'UTF-8');
}

function confirmarImportCad() {
  const data = window._cadImportData;
  if (!data) return;

  // Adiciona novos
  // Normaliza categoria: qualquer variação de "produção interna" → "PREPARADOS" (igual ao CW)
  const _normCat = cat => {
    const l = (cat || '').toLowerCase();
    if (l.includes('produção') || l.includes('producao') || l.includes('interno') || l.includes('preparado')) return 'PREPARADOS';
    return cat.trim() || 'Outros';
  };

  data.novos.forEach(r => {
    const catNorm = _normCat(r.cat);
    items.push({
      id:     nextIid++,
      name:   r.name.trim(),
      cat:    catNorm,
      unit:   r.unit || 'un',
      qty:    0,
      min:    r.min || 0,
      ideal:  (r.min || 0) * 2,
      cost:   r.cost || 0,
      supId:  null,
      brands: [],
      code:   r.code || '',
      isProd: catNorm === 'PREPARADOS',
    });
  });

  // Atualiza existentes
  data.atualizar.forEach(r => {
    const item = items.find(i => i.id === r.id);
    if (!item) return;
    if (r.code) item.code = r.code;
    if (r.cat)  item.cat  = _normCat(r.cat);
    if (r.cost > 0) item.cost = r.cost;
    if (r.min !== null) item.min = r.min;
  });

  saveI();
  document.getElementById('popupImportCad')?.remove();
  renderCadInsumos();
  toast(`${lc("check-circle",14,"var(--green)")} ${data.novos.length} novos + ${data.atualizar.length} atualizados!`);
  window._cadImportData = null;
}

// ══════════════════════════════════════════════════════════════
// PRESTADORES DE SERVIÇOS (manutenção)
// ══════════════════════════════════════════════════════════════

function _prestNotaMedia(p) {
  if (!p.notas?.length) return null;
  return (p.notas.reduce((s, n) => s + (n.estrelas || 0), 0) / p.notas.length).toFixed(1);
}

function _prestStars(n) {
  const v = parseFloat(n) || 0;
  return '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
}

function renderPrestadores() {
  const q      = document.getElementById('srchPrest')?.value?.toLowerCase() || '';
  const catFil = document.getElementById('filPrestCat')?.value || '';
  const confFil= document.getElementById('filPrestConf')?.value || '';
  const el     = document.getElementById('prestGrid');
  if (!el) return;

  const inCfg = !!document.getElementById('cfgSectionContent')?.contains(el);

  let filt = prestadores.filter(p => {
    if (q && !p.nome.toLowerCase().includes(q) && !(p.contato||'').toLowerCase().includes(q)) return false;
    if (catFil  && p.categoria  !== catFil)  return false;
    if (confFil && p.statusConfianca !== confFil) return false;
    return true;
  }).sort((a, b) => {
    const ord = { prioritario: 0, backup: 1, bloqueado: 2 };
    return (ord[a.statusConfianca] ?? 1) - (ord[b.statusConfianca] ?? 1) || a.nome.localeCompare(b.nome);
  });

  if (!filt.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${lc('wrench',14,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Nenhum prestador cadastrado</div><div>Cadastre técnicos e empresas de manutenção</div></div>`;
    return;
  }

  if (inCfg) {
    el.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    el.innerHTML = filt.map(p => {
      const cat  = PREST_CATS[p.categoria] || {};
      const conf = PREST_CONFIANCA[p.statusConfianca] || PREST_CONFIANCA.backup;
      const media= _prestNotaMedia(p);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer" onclick="openEditPrestador('${p.id}')">
        <div style="width:32px;height:32px;border-radius:var(--r8);background:${cat.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc(cat.icon||'wrench',15,cat.color||'var(--muted)')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:var(--text-sm);font-weight:700">${p.nome}</span>
            <span style="padding:1px 6px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;background:${conf.bg};color:${conf.color}">${conf.label}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px;display:flex;gap:10px;flex-wrap:wrap">
            ${p.contato?`<span>${lc('user',9,'currentColor')} ${p.contato}</span>`:''}
            ${p.phone?`<span>${lc('phone',9,'currentColor')} ${p.phone}</span>`:''}
            ${media?`<span style="color:var(--yellow)">★ ${media}</span>`:''}
          </div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditPrestador('${p.id}')">${lc('edit-2',12,'currentColor')}</button>
      </div>`;
    }).join('');
    return;
  }

  el.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px';
  el.innerHTML = filt.map(p => {
    const cat  = PREST_CATS[p.categoria] || {};
    const conf = PREST_CONFIANCA[p.statusConfianca] || PREST_CONFIANCA.backup;
    const media= _prestNotaMedia(p);
    const bloq = p.statusConfianca === 'bloqueado';
    return `<div style="background:var(--surface);border:1.5px solid ${bloq?'var(--red-light)':'var(--border)'};border-radius:var(--r12);padding:16px;cursor:pointer;opacity:${bloq?'.65':'1'}" onclick="openEditPrestador('${p.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:var(--r10);background:${cat.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc(cat.icon||'wrench',18,cat.color||'var(--muted)')}
          </div>
          <div>
            <div style="font-size:var(--text-md);font-weight:700">${p.nome}</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${cat.label||p.categoria||'—'}</div>
          </div>
        </div>
        <span style="padding:2px 8px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${conf.bg};color:${conf.color};white-space:nowrap">${conf.label}</span>
      </div>
      ${p.servicoPrincipal?`<div style="font-size:var(--text-xs);color:var(--text2);margin-bottom:8px;line-height:1.4">${p.servicoPrincipal}</div>`:''}
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
        ${p.phone?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('phone',11,'var(--muted)')} ${p.phone}</div>`:''}
        ${p.contato?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('user',11,'var(--muted)')} ${p.contato}</div>`:''}
      </div>
      ${p.aviso?`<div style="font-size:var(--text-xs);padding:4px 7px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r6);color:var(--orange-dark);margin-bottom:8px">${lc('alert-triangle',9,'currentColor')} ${p.aviso}</div>`:''}
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border)">
        ${media
          ? `<div style="font-size:var(--text-xs);color:var(--yellow);font-weight:700">${_prestStars(media)} <span style="color:var(--text2)">${media} (${p.notas.length})</span></div>`
          : `<div style="font-size:var(--text-xs);color:var(--muted)">Sem avaliações</div>`}
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditPrestador('${p.id}')">${lc('edit-2',12,'currentColor')}</button>
      </div>
    </div>`;
  }).join('');
}

let _editPrestId = null;

function _prestResetNotaForm() {
  ['pfNotaData','pfNotaServico','pfNotaComentario'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const est = document.getElementById('pfNotaEstrelas'); if (est) est.value = '5';
}

function openPrestadorModal() {
  _editPrestId = null;
  document.getElementById('prestModalTitle').textContent = 'Novo Prestador';
  document.getElementById('ePrestId').value = '';
  ['pfNome','pfServico','pfPhone','pfContato','pfEmail','pfAviso'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('pfCategoria').value  = '';
  document.getElementById('pfConfianca').value  = 'backup';
  document.getElementById('delPrestBtn').style.display = 'none';
  document.getElementById('prestNotasSection').style.display = 'none';
  _prestResetNotaForm();
  document.getElementById('ovPrest').classList.add('open');
  setTimeout(() => document.getElementById('pfNome').focus(), 80);
}

function openEditPrestador(id) {
  const p = prestadores.find(x => x.id === id);
  if (!p) return;
  _editPrestId = id;
  document.getElementById('prestModalTitle').textContent = p.nome;
  document.getElementById('ePrestId').value      = id;
  document.getElementById('pfNome').value         = p.nome || '';
  document.getElementById('pfCategoria').value    = p.categoria || '';
  document.getElementById('pfServico').value      = p.servicoPrincipal || '';
  document.getElementById('pfPhone').value        = p.phone || '';
  document.getElementById('pfContato').value      = p.contato || '';
  document.getElementById('pfEmail').value        = p.email || '';
  document.getElementById('pfConfianca').value    = p.statusConfianca || 'backup';
  document.getElementById('pfAviso').value        = p.aviso || '';
  document.getElementById('delPrestBtn').style.display = 'inline-flex';
  document.getElementById('prestNotasSection').style.display = '';
  _prestResetNotaForm();
  _renderNotasPrestador(p);
  document.getElementById('ovPrest').classList.add('open');
}

function _renderNotasPrestador(p) {
  const el = document.getElementById('prestNotasList');
  if (!el) return;
  const notas = (p.notas || []).slice().reverse();
  if (!notas.length) {
    el.innerHTML = `<div style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Nenhuma avaliação registrada ainda.</div>`;
    return;
  }
  el.innerHTML = notas.map(n => `
    <div style="display:flex;gap:10px;padding:8px 10px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px">
          <span style="color:var(--yellow);font-size:var(--text-sm)">${_prestStars(n.estrelas)}</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">${fmtD(n.data)}</span>
        </div>
        ${n.servico?`<div style="font-size:var(--text-xs);font-weight:600;margin-bottom:1px">${n.servico}</div>`:''}
        ${n.comentario?`<div style="font-size:var(--text-xs);color:var(--text2)">${n.comentario}</div>`:''}
      </div>
      <button onclick="_deletarNotaPrestador('${n.id}')" style="flex-shrink:0;border:none;background:none;cursor:pointer;color:var(--muted);padding:2px">${lc('x',12,'currentColor')}</button>
    </div>`).join('');
}

function addNotaPrestador() {
  const p = prestadores.find(x => x.id === _editPrestId);
  if (!p) return;
  const data    = document.getElementById('pfNotaData')?.value;
  const servico = document.getElementById('pfNotaServico')?.value.trim();
  if (!data) { toast('Informe a data do serviço', 'err'); return; }
  if (!p.notas) p.notas = [];
  p.notas.push({
    id:         crypto.randomUUID(),
    data,
    estrelas:   parseInt(document.getElementById('pfNotaEstrelas')?.value) || 5,
    servico,
    comentario: document.getElementById('pfNotaComentario')?.value.trim() || '',
    created_at: new Date().toISOString(),
  });
  p.updated_at = new Date().toISOString();
  savePrest();
  ['pfNotaData','pfNotaServico','pfNotaComentario'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('pfNotaEstrelas').value = '5';
  _renderNotasPrestador(p);
  renderPrestadores();
  toast(`${lc('star',13,'var(--yellow)')} Avaliação registrada!`);
}

function _deletarNotaPrestador(notaId) {
  const p = prestadores.find(x => x.id === _editPrestId);
  if (!p) return;
  p.notas = (p.notas || []).filter(n => n.id !== notaId);
  p.updated_at = new Date().toISOString();
  savePrest();
  _renderNotasPrestador(p);
  renderPrestadores();
}

function savePrestador() {
  const nome = document.getElementById('pfNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const data = {
    nome,
    categoria:        document.getElementById('pfCategoria')?.value || '',
    servicoPrincipal: document.getElementById('pfServico')?.value.trim() || '',
    phone:            document.getElementById('pfPhone')?.value.trim() || '',
    contato:          document.getElementById('pfContato')?.value.trim() || '',
    email:            document.getElementById('pfEmail')?.value.trim() || '',
    statusConfianca:  document.getElementById('pfConfianca')?.value || 'backup',
    aviso:            document.getElementById('pfAviso')?.value.trim() || '',
    updated_at:       new Date().toISOString(),
  };
  if (_editPrestId) {
    const idx = prestadores.findIndex(x => x.id === _editPrestId);
    if (idx >= 0) prestadores[idx] = { ...prestadores[idx], ...data };
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" atualizado!`);
  } else {
    prestadores.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), notas: [], ...data });
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" cadastrado!`);
  }
  savePrest();
  closeModal('ovPrest');
  renderPrestadores();
}

function deletePrestador() {
  const p = prestadores.find(x => x.id === _editPrestId);
  if (!p) return;
  vtpConfirm({
    title: `Excluir "${p.nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      prestadores = prestadores.filter(x => x.id !== _editPrestId);
      savePrest();
      closeModal('ovPrest');
      renderPrestadores();
      toast(`${lc('trash-2',14,'currentColor')} "${p.nome}" excluído.`);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// TERCEIRIZADOS
// ══════════════════════════════════════════════════════════════

function _tercStars(n) {
  const f = Math.round(n);
  return '★'.repeat(f) + '☆'.repeat(5 - f);
}
function _tercNotaMedia(t) {
  const notas = t.notas || [];
  if (!notas.length) return null;
  return (notas.reduce((s, n) => s + n.estrelas, 0) / notas.length).toFixed(1);
}

function renderTerceirizados() {
  const q       = document.getElementById('srchTerceir')?.value?.toLowerCase() || '';
  const funcFil = document.getElementById('filTerceirFuncao')?.value || '';
  const stFil   = document.getElementById('filTerceirStatus')?.value || '';
  const el      = document.getElementById('terceirGrid');
  if (!el) return;

  let filt = terceirizados.filter(t => {
    if (q && !t.nome.toLowerCase().includes(q) && !(t.obs||'').toLowerCase().includes(q)) return false;
    if (funcFil && t.funcao !== funcFil) return false;
    if (stFil  && t.status !== stFil)   return false;
    return true;
  }).sort((a, b) => {
    if ((a.status==='ativo') !== (b.status==='ativo')) return a.status==='ativo' ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });

  if (!filt.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${lc('users',14,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Nenhum terceirizado cadastrado</div><div>Cadastre motoboys, diaristas e freelancers da operação</div></div>`;
    return;
  }

  el.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px';
  el.innerHTML = filt.map(t => {
    const fn    = TERCEIR_FUNCOES[t.funcao] || TERCEIR_FUNCOES.outros;
    const media = _tercNotaMedia(t);
    const inativo = t.status === 'inativo';
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;opacity:${inativo?.65:1}" onclick="openEditTerceirizado('${t.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:var(--r10);background:${fn.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc(fn.icon,18,fn.color)}
          </div>
          <div>
            <div style="font-size:var(--text-md);font-weight:700">${t.nome}</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${fn.label}</div>
          </div>
        </div>
        <span style="padding:2px 8px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${inativo?'var(--surface2)':'var(--green-light)'};color:${inativo?'var(--muted)':'var(--green)'};white-space:nowrap">
          ${inativo ? 'Inativo' : 'Ativo'}
        </span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
        ${t.phone?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('phone',11,'var(--muted)')} ${t.phone}</div>`:''}
        ${t.valorHora?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('dollar-sign',11,'var(--muted)')} R$ ${fmt(t.valorHora)}/h</div>`:''}
      </div>
      ${t.obs?`<div style="font-size:var(--text-xs);padding:4px 7px;background:var(--surface2);border-radius:var(--r6);color:var(--muted);margin-bottom:8px">${t.obs}</div>`:''}
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border)">
        ${media
          ? `<div style="font-size:var(--text-xs);color:var(--yellow);font-weight:700">${_tercStars(media)} <span style="color:var(--text2)">${media} (${t.notas.length})</span></div>`
          : `<div style="font-size:var(--text-xs);color:var(--muted)">Sem avaliações</div>`}
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditTerceirizado('${t.id}')">${lc('edit-2',12,'currentColor')}</button>
      </div>
    </div>`;
  }).join('');
}

let _editTerceirId = null;

function _tercResetNotaForm() {
  ['tfNotaData','tfNotaOcorrencia','tfNotaComentario'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const est = document.getElementById('tfNotaEstrelas'); if (est) est.value = '5';
}

function openTerceirizadoModal() {
  _editTerceirId = null;
  document.getElementById('terceirModalTitle').textContent = 'Novo Terceirizado';
  document.getElementById('eTerceirId').value = '';
  ['tfNome','tfPhone','tfCpf','tfObs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('tfFuncao').value = '';
  document.getElementById('tfStatus').value = 'ativo';
  document.getElementById('tfValorHora').value = '';
  document.getElementById('delTerceirBtn').style.display = 'none';
  document.getElementById('terceirNotasSection').style.display = 'none';
  _tercResetNotaForm();
  document.getElementById('ovTerceir').classList.add('open');
  setTimeout(() => document.getElementById('tfNome').focus(), 80);
}

function openEditTerceirizado(id) {
  const t = terceirizados.find(x => x.id === id);
  if (!t) return;
  _editTerceirId = id;
  document.getElementById('terceirModalTitle').textContent = t.nome;
  document.getElementById('eTerceirId').value   = id;
  document.getElementById('tfNome').value        = t.nome || '';
  document.getElementById('tfFuncao').value      = t.funcao || '';
  document.getElementById('tfPhone').value       = t.phone || '';
  document.getElementById('tfCpf').value         = t.cpf || '';
  document.getElementById('tfValorHora').value   = t.valorHora || '';
  document.getElementById('tfStatus').value      = t.status || 'ativo';
  document.getElementById('tfObs').value         = t.obs || '';
  document.getElementById('delTerceirBtn').style.display = 'inline-flex';
  document.getElementById('terceirNotasSection').style.display = '';
  _tercResetNotaForm();
  _renderNotasTerceirizado(t);
  document.getElementById('ovTerceir').classList.add('open');
}

function _renderNotasTerceirizado(t) {
  const el = document.getElementById('terceirNotasList');
  if (!el) return;
  const notas = (t.notas || []).slice().reverse();
  if (!notas.length) {
    el.innerHTML = `<div style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Nenhuma avaliação registrada ainda.</div>`;
    return;
  }
  el.innerHTML = notas.map(n => `
    <div style="display:flex;gap:10px;padding:8px 10px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px">
          <span style="color:var(--yellow);font-size:var(--text-sm)">${_tercStars(n.estrelas)}</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">${fmtD(n.data)}</span>
        </div>
        ${n.ocorrencia?`<div style="font-size:var(--text-xs);font-weight:600;margin-bottom:1px">${n.ocorrencia}</div>`:''}
        ${n.comentario?`<div style="font-size:var(--text-xs);color:var(--text2)">${n.comentario}</div>`:''}
      </div>
      <button onclick="_deletarNotaTerceirizado('${n.id}')" style="flex-shrink:0;border:none;background:none;cursor:pointer;color:var(--muted);padding:2px">${lc('x',12,'currentColor')}</button>
    </div>`).join('');
}

function addNotaTerceirizado() {
  const t = terceirizados.find(x => x.id === _editTerceirId);
  if (!t) return;
  const data = document.getElementById('tfNotaData')?.value;
  if (!data) { toast('Informe a data', 'err'); return; }
  if (!t.notas) t.notas = [];
  t.notas.push({
    id:          crypto.randomUUID(),
    data,
    estrelas:    parseInt(document.getElementById('tfNotaEstrelas')?.value) || 5,
    ocorrencia:  document.getElementById('tfNotaOcorrencia')?.value.trim() || '',
    comentario:  document.getElementById('tfNotaComentario')?.value.trim() || '',
    created_at:  new Date().toISOString(),
  });
  t.updated_at = new Date().toISOString();
  saveTerceir();
  ['tfNotaData','tfNotaOcorrencia','tfNotaComentario'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('tfNotaEstrelas').value = '5';
  _renderNotasTerceirizado(t);
  renderTerceirizados();
  toast(`${lc('star',13,'var(--yellow)')} Avaliação registrada!`);
}

function _deletarNotaTerceirizado(notaId) {
  const t = terceirizados.find(x => x.id === _editTerceirId);
  if (!t) return;
  t.notas = (t.notas || []).filter(n => n.id !== notaId);
  t.updated_at = new Date().toISOString();
  saveTerceir();
  _renderNotasTerceirizado(t);
  renderTerceirizados();
}

function saveTerceirizado() {
  const nome = document.getElementById('tfNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const funcao = document.getElementById('tfFuncao')?.value;
  if (!funcao) { toast('Selecione a função', 'err'); return; }
  const valorHora = parseFloat(document.getElementById('tfValorHora')?.value) || null;
  const data = {
    nome, funcao, valorHora,
    phone:      document.getElementById('tfPhone')?.value.trim() || '',
    cpf:        document.getElementById('tfCpf')?.value.trim() || '',
    status:     document.getElementById('tfStatus')?.value || 'ativo',
    obs:        document.getElementById('tfObs')?.value.trim() || '',
    updated_at: new Date().toISOString(),
  };
  if (_editTerceirId) {
    const idx = terceirizados.findIndex(x => x.id === _editTerceirId);
    if (idx >= 0) terceirizados[idx] = { ...terceirizados[idx], ...data };
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" atualizado!`);
  } else {
    terceirizados.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), notas: [], ...data });
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" cadastrado!`);
  }
  saveTerceir();
  closeModal('ovTerceir');
  renderTerceirizados();
}

function deleteTerceirizado() {
  const t = terceirizados.find(x => x.id === _editTerceirId);
  if (!t) return;
  vtpConfirm({
    title: `Excluir "${t.nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      terceirizados = terceirizados.filter(x => x.id !== _editTerceirId);
      saveTerceir();
      closeModal('ovTerceir');
      renderTerceirizados();
      toast(`${lc('trash-2',14,'currentColor')} "${t.nome}" excluído.`);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// FUNCIONÁRIOS
// ══════════════════════════════════════════════════════════════

function renderFuncionarios() {
  const q       = document.getElementById('srchFuncs')?.value?.toLowerCase() || '';
  const cargoFil= document.getElementById('filFuncsCargo')?.value || '';
  const stFil   = document.getElementById('filFuncsStatus')?.value || '';
  const el      = document.getElementById('funcsGrid');
  if (!el) return;

  const STATUS_FUNC = {
    ativo:    { label:'Ativo',     color:'var(--green)',       bg:'var(--green-light)'   },
    ferias:   { label:'Férias',    color:'var(--purple)',      bg:'var(--purple-xlight)' },
    afastado: { label:'Afastado',  color:'var(--orange-dark)', bg:'var(--orange-light)'  },
    inativo:  { label:'Inativo',   color:'var(--muted)',       bg:'var(--surface2)'      },
  };

  let filt = funcionarios.filter(f => {
    if (q && !f.nome.toLowerCase().includes(q) && !(f.cargo||'').toLowerCase().includes(q)) return false;
    if (cargoFil && f.cargo !== cargoFil) return false;
    if (stFil    && f.status !== stFil)   return false;
    return true;
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  if (!filt.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${lc('user-check',14,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Nenhum funcionário cadastrado</div><div>Cadastre a equipe da pizzaria para uso nos módulos de RH</div></div>`;
    return;
  }

  el.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px';
  el.innerHTML = filt.map(f => {
    const cargo = FUNC_CARGOS[f.cargo] || { label: f.cargo, icon:'user', color:'var(--muted)', bg:'var(--surface2)' };
    const st    = STATUS_FUNC[f.status] || STATUS_FUNC.ativo;
    const dias  = f.admissao ? Math.floor((Date.now() - new Date(f.admissao)) / 86400000) : null;
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer" onclick="openEditFuncionario('${f.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:50%;background:${cargo.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc(cargo.icon,18,cargo.color)}
          </div>
          <div>
            <div style="font-size:var(--text-md);font-weight:700">${f.nome}</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${cargo.label}</div>
          </div>
        </div>
        <span style="padding:2px 8px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${st.bg};color:${st.color};white-space:nowrap">${st.label}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
        ${f.phone?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('phone',11,'var(--muted)')} ${f.phone}</div>`:''}
        ${f.turno?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('clock',11,'var(--muted)')} Turno: ${f.turno}</div>`:''}
        ${f.salario?`<div style="font-size:var(--text-xs);color:var(--text2)">${lc('dollar-sign',11,'var(--muted)')} R$ ${fmt(f.salario)}/mês</div>`:''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border)">
        ${dias !== null ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc('calendar',9,'currentColor')} ${dias} dias na empresa</div>` : '<div></div>'}
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditFuncionario('${f.id}')">${lc('edit-2',12,'currentColor')}</button>
      </div>
    </div>`;
  }).join('');
}

let _editFuncId = null;

function openFuncionarioModal() {
  _editFuncId = null;
  document.getElementById('funcModalTitle').textContent = 'Novo Funcionário';
  document.getElementById('eFuncId').value = '';
  ['ffNome','ffCpf','ffPhone','ffEmail','ffObs','ffSalario','ffAdmissao'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('ffCargo').value  = '';
  document.getElementById('ffTurno').value  = '';
  document.getElementById('ffStatus').value = 'ativo';
  document.getElementById('delFuncBtn').style.display = 'none';
  document.getElementById('ovFuncionario').classList.add('open');
  setTimeout(() => document.getElementById('ffNome').focus(), 80);
}

function openEditFuncionario(id) {
  const f = funcionarios.find(x => x.id === id);
  if (!f) return;
  _editFuncId = id;
  document.getElementById('funcModalTitle').textContent = f.nome;
  document.getElementById('eFuncId').value    = id;
  document.getElementById('ffNome').value      = f.nome || '';
  document.getElementById('ffCargo').value     = f.cargo || '';
  document.getElementById('ffCpf').value       = f.cpf || '';
  document.getElementById('ffPhone').value     = f.phone || '';
  document.getElementById('ffEmail').value     = f.email || '';
  document.getElementById('ffAdmissao').value  = f.admissao || '';
  document.getElementById('ffSalario').value   = f.salario || '';
  document.getElementById('ffTurno').value     = f.turno || '';
  document.getElementById('ffStatus').value    = f.status || 'ativo';
  document.getElementById('ffObs').value       = f.obs || '';
  document.getElementById('delFuncBtn').style.display = 'inline-flex';
  document.getElementById('ovFuncionario').classList.add('open');
}

function saveFuncionario() {
  const nome  = document.getElementById('ffNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const cargo = document.getElementById('ffCargo')?.value;
  if (!cargo) { toast('Selecione o cargo', 'err'); return; }
  const data = {
    nome, cargo,
    cpf:       document.getElementById('ffCpf')?.value.trim() || '',
    phone:     document.getElementById('ffPhone')?.value.trim() || '',
    email:     document.getElementById('ffEmail')?.value.trim() || '',
    admissao:  document.getElementById('ffAdmissao')?.value || null,
    salario:   parseFloat(document.getElementById('ffSalario')?.value) || null,
    turno:     document.getElementById('ffTurno')?.value || '',
    status:    document.getElementById('ffStatus')?.value || 'ativo',
    obs:       document.getElementById('ffObs')?.value.trim() || '',
    updated_at: new Date().toISOString(),
  };
  if (_editFuncId) {
    const idx = funcionarios.findIndex(x => x.id === _editFuncId);
    if (idx >= 0) funcionarios[idx] = { ...funcionarios[idx], ...data };
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" atualizado!`);
  } else {
    funcionarios.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...data });
    toast(`${lc('check-circle',14,'var(--green)')} "${nome}" cadastrado!`);
  }
  saveFuncs();
  closeModal('ovFuncionario');
  renderFuncionarios();
  if (typeof _renderCfgFuncionarios === 'function') _renderCfgFuncionarios();
}

function deleteFuncionario() {
  const f = funcionarios.find(x => x.id === _editFuncId);
  if (!f) return;
  vtpConfirm({
    title: `Excluir "${f.nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      funcionarios = funcionarios.filter(x => x.id !== _editFuncId);
      saveFuncs();
      closeModal('ovFuncionario');
      renderFuncionarios();
      if (typeof _renderCfgFuncionarios === 'function') _renderCfgFuncionarios();
      toast(`${lc('trash-2',14,'currentColor')} "${f.nome}" excluído.`);
    }
  });
}

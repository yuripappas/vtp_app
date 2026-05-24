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

function setCadTab(tab) {
  ['insumos', 'fornecedores', 'servicos', 'preparo', 'produtos', 'terceirizados', 'funcionarios'].forEach(t => {
    const panel = document.getElementById(`cad-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    document.getElementById(`cad-tab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'insumos')       renderCadInsumos();
  if (tab === 'fornecedores')  renderFornecedores();
  if (tab === 'servicos')      renderPrestadores();
  if (tab === 'preparo')       renderPreparoGrid();
  if (tab === 'produtos')      { renderCadSabores(); setProdTab('sabores'); }
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
    if (window._cadFilDiaria && !i.contagemDiaria)                return false;
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
    const nDiaria = insumos.filter(i => i.contagemDiaria).length;
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
    ${lc('sun',11,'currentColor')} Contagem Diária <span style="font-size:var(--text-2xs);opacity:.7">(${nDiaria})</span>
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
        const temDia  = !!item.contagemDiaria;
        return `<div class="cfg-row" style="cursor:pointer" onclick="openEditItem(${item.id})"
            onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="cfg-row-label">${item.name}</span>
              <span style="font-size:var(--text-xs);color:var(--muted)">${item.unit}${item.code?' · #'+item.code:''}</span>
              ${temEmb ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--purple-xlight);color:var(--purple);white-space:nowrap">${lc('package',9,'currentColor')} ${item.unidCompra} ${fmt(item.qtdEmb)}${item.unit}</span>` : ''}
              ${temDia  ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--orange-light);color:var(--orange-dark);white-space:nowrap">${lc('sun',9,'currentColor')} Diária</span>` : ''}
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

  el.innerHTML = Object.entries(bycat).map(([cat, catItems]) => `
    <div style="margin-bottom:24px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">${cat} <span style="font-weight:400">(${catItems.length})</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${catItems.map(item => {
          const b   = (item.brands || []).filter(x => x);
          const supIds = item.supIds?.length ? item.supIds : (item.supId ? [item.supId] : []);
          const sups   = supIds.map(id => suppliers.find(s => s.id === id)).filter(Boolean);
          const temEmb = !!(item.unidCompra && item.qtdEmb > 0);
          const temDia = !!item.contagemDiaria;
          return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px;transition:border-color .15s;cursor:pointer"
            onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="this.style.borderColor='var(--border)'"
            onclick="openEditItem(${item.id})">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
              <div>
                <div style="font-size:var(--text-sm);font-weight:700">${item.name}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${item.unit}${item.code ? ' · #' + item.code : ''}</div>
              </div>
              <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditItem(${item.id})">${lc("edit-2",13,"currentColor")}</button>
            </div>
            ${(temEmb || temDia) ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
              ${temEmb ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--purple-xlight);color:var(--purple)">${lc('package',9,'currentColor')} ${item.unidCompra} ${fmt(item.qtdEmb)}${item.unit}</span>` : ''}
              ${temDia ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:var(--orange-light);color:var(--orange-dark)">${lc('sun',9,'currentColor')} Diária</span>` : ''}
            </div>` : ''}
            <div style="display:flex;flex-direction:column;gap:4px;font-size:var(--text-xs);color:var(--text2)">
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--muted)">Mínimo</span><span style="font-weight:600">${item.min} ${item.unit}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--muted)">Ideal</span><span style="font-weight:600">${item.ideal} ${item.unit}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--muted)">Custo ref.</span><span style="font-weight:600;color:var(--purple)">R$ ${fmt(item.cost)}</span>
              </div>
            </div>
            ${sups.length ? `
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                <div style="font-size:var(--text-2xs);color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px;font-weight:600">
                  ${lc("building-2",10,"var(--muted)")} ${sups.length > 1 ? sups.length+' fornecedores' : 'Fornecedor'}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:3px">
                  ${sups.map((s,idx) => `<span class="badge ${idx===0?'b-purple':'b-gray'}" style="font-size:var(--text-2xs)">${idx===0?'★ ':''}${s.name}</span>`).join('')}
                </div>
              </div>` : ''}
            ${b.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:7px">${b[0] ? `<span class="badge b-purple" style="font-size:var(--text-2xs)">⭐ ${b[0]}</span>` : ''}${b.slice(1).map(x => `<span class="badge b-gray" style="font-size:var(--text-2xs)">${x}</span>`).join('')}</div>` : ''}
          </div>`;
        }).join('')}
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
  populateSupChecks(supIds);
  const cd = document.getElementById('fContagemDiaria'); if (cd) cd.checked = !!item.contagemDiaria;
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

function populateSupChecks(selIds) {
  const wrap = document.getElementById('fSupIds');
  if (!wrap) return;
  const searchEl = document.getElementById('fSupSearch');
  if (searchEl) searchEl.value = '';
  if (!suppliers.length) {
    wrap.innerHTML = `<span style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Nenhum fornecedor cadastrado</span>`;
    return;
  }
  const sel = new Set((selIds||[]).map(Number));
  wrap.innerHTML = suppliers.map(s => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:var(--r6);cursor:pointer;
      background:${sel.has(s.id)?'var(--purple-xlight)':'transparent'};transition:background .1s"
      onmouseover="this.style.background='var(--purple-xlight)'" onmouseout="this.style.background='${sel.has(s.id)?'var(--purple-xlight)':'transparent'}'">
      <input type="checkbox" value="${s.id}" ${sel.has(s.id)?'checked':''}
        style="accent-color:var(--purple);width:15px;height:15px;flex-shrink:0"
        onchange="this.closest('label').style.background=this.checked?'var(--purple-xlight)':'transparent'">
      <span style="font-size:var(--text-sm);font-weight:${sel.has(s.id)?'600':'400'}">${s.name}</span>
      ${s.seller?`<span style="font-size:var(--text-xs);color:var(--muted);margin-left:auto">${s.seller}</span>`:''}
    </label>
  `).join('');
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
  const supIds     = getSupCheckedIds();
  const unidCompra = document.getElementById('fUnidCompra')?.value.trim() || '';
  const qtdEmb     = parseFloat(document.getElementById('fQtdEmb')?.value) || 0;
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
    unidCompra, // nome da embalagem (ex: "Barra", "Pacote")
    qtdEmb,     // qtd da unidade base por embalagem (ex: 25 para barra de 25kg)
    brands: [
      document.getElementById('fB0').value.trim(),
      document.getElementById('fB1').value.trim(),
      document.getElementById('fB2').value.trim(),
    ],
    isProd:          false,
    contagemDiaria:  document.getElementById('fContagemDiaria')?.checked || false,
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
    el.innerHTML = prods.map(item =>
      `<div class="cfg-row" style="cursor:pointer" onclick="openEditPreparo(${item.id})">
        <div class="cfg-row-icon" style="background:var(--purple-xlight);color:var(--purple)">${lc('chef-hat',14,'currentColor')}</div>
        <div style="flex:1;min-width:0">
          <div class="cfg-row-label">${item.name}</div>
          <div class="cfg-row-sub">${item.unit} · R$ ${fmt(item.cost)}/${item.unit} · Mín ${item.min} · Ideal ${item.ideal}</div>
        </div>
        <div class="cfg-row-actions">
          <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();openEditPreparo(${item.id})">${lc('edit-2',12,'currentColor')}</button>
        </div>
      </div>`).join('');
    return;
  }

  el.innerHTML = prods.map(item => `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditPreparo(${item.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:var(--text-md);font-weight:700">${item.name}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Produção Interna · ${item.unit}</div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditPreparo(${item.id})">${lc("edit-2",13,"currentColor")}️</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;font-size:var(--text-xs)">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--muted)">Custo produção</span>
          <span style="font-weight:700;color:var(--purple)">R$ ${fmt(item.cost)}/${item.unit}</span>
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
    </div>`).join('');
}

function openPreparoModal() {
  editPreparoId = null;
  document.getElementById('preparoModalTitle').textContent = 'Novo Preparado';
  document.getElementById('ePreparoId').value = '';
  ['fpName','fpCode','fpCost','fpMin','fpIdeal','fpPorcao','fpObs','fpFicha'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fpUnit').value = 'kg';
  document.getElementById('delPreparoBtn').style.display = 'none';
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
  document.getElementById('fpCost').value   = item.cost;
  document.getElementById('fpMin').value    = item.min;
  document.getElementById('fpIdeal').value  = item.ideal;
  document.getElementById('fpPorcao').value = item.medPorcao || '';
  document.getElementById('fpObs').value    = item.obs   || '';
  document.getElementById('fpFicha').value  = item.ficha || '';
  document.getElementById('delPreparoBtn').style.display = 'inline-flex';
  document.getElementById('ovPreparo').classList.add('open');
}

function savePreparo() {
  const name = document.getElementById('fpName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const data = {
    name,
    code:      document.getElementById('fpCode').value.trim(),
    cat:       'Produção Interna',
    unit:      document.getElementById('fpUnit').value,
    cost:      parseFloat(document.getElementById('fpCost').value)   || 0,
    min:       parseFloat(document.getElementById('fpMin').value)    || 0,
    ideal:     parseFloat(document.getElementById('fpIdeal').value)  || 0,
    medPorcao: parseFloat(document.getElementById('fpPorcao').value) || null,
    obs:       document.getElementById('fpObs').value.trim(),
    ficha:     document.getElementById('fpFicha').value.trim(),
    isProd:    true,
    brands:    [],
    supId:     null,
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

function renderCadProdutos() {
  const el = document.getElementById('cadProdutosGrid');
  if (!el) return;

  const byCat = {};
  produtos.forEach(p => {
    if (!byCat[p.cat]) byCat[p.cat] = [];
    byCat[p.cat].push(p);
  });

  el.innerHTML = Object.entries(byCat).map(([cat, prods]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--border)">${cat}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${prods.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:700">${p.name}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">Preço de venda: R$ ${fmt(p.price)} · ${p.active ? 'Ativo' : 'Inativo'}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="openProdModal(${p.id})">Editar</button>
          </div>`).join('')}
      </div>
    </div>`).join('') || `<div class="empty"><div class="empty-icon">${lc("tag",13,"currentColor")}</div>Nenhum produto cadastrado</div>`;
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

function setProdTab(tab) {
  ['sabores','outros'].forEach(t => {
    const btn = document.getElementById('prod-tab-' + t);
    if (!btn) return;
    const isActive = t === tab;
    btn.style.color             = isActive ? 'var(--purple)' : 'var(--muted)';
    btn.style.borderBottomColor = isActive ? 'var(--purple)' : 'transparent';
  });
  const sabGrid  = document.getElementById('cadSaboresGrid');
  const prodGrid = document.getElementById('cadProdutosGrid');
  if (sabGrid)  sabGrid.style.display  = tab === 'sabores' ? '' : 'none';
  if (prodGrid) prodGrid.style.display = tab === 'outros'  ? '' : 'none';
  if (tab === 'sabores') renderCadSabores();
  else renderCadProdutos();
}

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
        ${cat.items.sort((a,b)=>a.acr-b.acr||a.name.localeCompare(b.name)).map(s => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border:1.5px solid ${s.active===false?'var(--border)':'var(--border)'};border-radius:var(--r6);opacity:${s.active===false?0.5:1}">
            <div style="flex:1">
              <span style="font-size:var(--text-sm);font-weight:600">${s.name}</span>
              <span style="font-size:var(--text-xs);color:var(--muted);margin-left:8px">${s.acr > 0 ? '+R$ ' + fmt(s.acr) : 'Incluso'}</span>
              <span style="font-size:var(--text-xs);color:var(--purple);font-weight:700;margin-left:8px">= R$ ${fmt(tipo.basePrice + s.acr)}</span>
            </div>
            <button class="btn btn-outline btn-xs" onclick="openSaborModal('${tipo.id}', ${s.id})">${lc("edit-2",13,"currentColor")}️</button>
          </div>`).join('')}
        ${cat.items.length === 0 ? `<div style="font-size:var(--text-xs);color:var(--muted);padding:8px">Nenhum sabor cadastrado</div>` : ''}
      </div>
    </div>`;
  }).join('');
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
  data.novos.forEach(r => {
    items.push({
      id:     nextIid++,
      name:   r.name.trim(),
      cat:    r.cat.trim() || 'Geral',
      unit:   r.unit || 'un',
      qty:    0,
      min:    r.min || 0,
      ideal:  (r.min || 0) * 2,
      cost:   r.cost || 0,
      supId:  null,
      brands: [],
      code:   r.code || '',
      isProd: r.cat.toLowerCase().includes('produção') || r.cat.toLowerCase().includes('interno'),
    });
  });

  // Atualiza existentes
  data.atualizar.forEach(r => {
    const item = items.find(i => i.id === r.id);
    if (!item) return;
    if (r.code) item.code = r.code;
    if (r.cat)  item.cat  = r.cat;
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

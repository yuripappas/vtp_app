/**
 * VTP Compras — Vai Ter Pizza!
 * cadastros.js — Módulo de Cadastros (Insumos, Fornecedores, Pré-preparo)
 */

// ══════════════════════════════════════════════════════════════
// NAVEGAÇÃO DAS ABAS DE CADASTRO
// ══════════════════════════════════════════════════════════════

function setCadTab(tab) {
  ['insumos', 'fornecedores', 'preparo', 'produtos'].forEach(t => {
    document.getElementById(`cad-${t}`).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById(`cad-tab-${t}`);
    if (btn) {
      btn.style.color            = t === tab ? 'var(--purple)' : 'var(--muted)';
      btn.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent';
    }
  });
  if (tab === 'insumos')      renderCadInsumos();
  if (tab === 'fornecedores') renderFornecedores();
  if (tab === 'preparo')      renderPreparoGrid();
  if (tab === 'produtos')     { renderCadSabores(); setProdTab('sabores'); }
}

function renderCadastros() {
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
    return true;
  }).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  const el = document.getElementById('cadInsumosGrid');
  if (!filt.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">📦</div><div style="font-weight:700;margin-bottom:4px">Nenhum insumo cadastrado</div><div>Clique em "${lc("plus",13,"#fff")} Novo Insumo" para começar</div></div>`;
    return;
  }

  // Agrupa por categoria
  const bycat = {};
  filt.forEach(i => { if (!bycat[i.cat]) bycat[i.cat] = []; bycat[i.cat].push(i); });

  el.innerHTML = Object.entries(bycat).map(([cat, catItems]) => `
    <div style="margin-bottom:24px">
      <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">${cat} <span style="font-weight:400">(${catItems.length})</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${catItems.map(item => {
          const b   = (item.brands || []).filter(x => x);
          const sup = suppliers.find(s => s.id === item.supId);
          return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px;transition:border-color .15s;cursor:pointer" onclick="openEditItem(${item.id})">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
              <div>
                <div style="font-size:.84rem;font-weight:700">${item.name}</div>
                <div style="font-size:.67rem;color:var(--muted);margin-top:2px">${item.unit}${item.code ? ' · #' + item.code : ''}</div>
              </div>
              <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditItem(${item.id})">✏️</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;font-size:.72rem;color:var(--text2)">
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
            ${sup ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:.68rem;color:var(--muted)">${lc("store",12,"var(--muted)")} ${sup.name}</div>` : ''}
            ${b.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:7px">${b[0] ? `<span class="badge b-purple" style="font-size:.58rem">⭐ ${b[0]}</span>` : ''}${b.slice(1).map(x => `<span class="badge b-gray" style="font-size:.58rem">${x}</span>`).join('')}</div>` : ''}
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
  ['fName','fCat','fB0','fB1','fB2','fCode'].forEach(id => document.getElementById(id).value = '');
  ['fMin','fIdeal','fCost'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fUnit').value = 'kg';
  populateSupSel(null);
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
  populateSupSel(item.supId);
  document.getElementById('delItemBtn').style.display = 'inline-flex';
  document.getElementById('ovItem').classList.add('open');
}

function populateSupSel(selId) {
  document.getElementById('fSupId').innerHTML =
    '<option value="">— Sem fornecedor —</option>' +
    suppliers.map(s => `<option value="${s.id}"${s.id === selId ? ' selected' : ''}>${s.name}</option>`).join('');
}

function saveItem() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const supVal = document.getElementById('fSupId').value;
  const data = {
    name,
    cat:    document.getElementById('fCat').value.trim() || 'Outros',
    unit:   document.getElementById('fUnit').value,
    min:    parseFloat(document.getElementById('fMin').value)   || 0,
    ideal:  parseFloat(document.getElementById('fIdeal').value) || 0,
    cost:   parseFloat(document.getElementById('fCost').value)  || 0,
    code:   document.getElementById('fCode').value.trim(),
    supId:  supVal ? parseInt(supVal) : null,
    brands: [
      document.getElementById('fB0').value.trim(),
      document.getElementById('fB1').value.trim(),
      document.getElementById('fB2').value.trim(),
    ],
    isProd: false,
  };
  if (editItemId) {
    const idx = items.findIndex(i => i.id === editItemId);
    if (idx >= 0) items[idx] = { ...items[idx], ...data };
    toast(`✅ "${name}" atualizado!`);
  } else {
    items.push({ id: nextIid++, qty: 0, ...data });
    toast(`✅ "${name}" adicionado!`);
  }
  saveI();
  closeModal('ovItem');
  renderCadInsumos();
  renderDashboard();
}

function deleteItem() {
  if (!editItemId) return;
  const item = items.find(i => i.id === editItemId);
  if (!item || !confirm(`Excluir "${item.name}"?`)) return;
  items = items.filter(i => i.id !== editItemId);
  saveI();
  closeModal('ovItem');
  renderCadInsumos();
  renderDashboard();
  toast(`🗑 "${item.name}" excluído.`);
}

// ══════════════════════════════════════════════════════════════
// CADASTRO DE PRÉ-PREPARO
// ══════════════════════════════════════════════════════════════

let editPreparoId = null;

function renderPreparoGrid() {
  const prods = items.filter(i => i.isProd);
  const el    = document.getElementById('preparoGrid');

  if (!prods.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🍳</div><div style="font-weight:700;margin-bottom:4px">Nenhum preparado cadastrado</div><div>Clique em "${lc("plus",13,"#fff")} Novo Preparado" para começar</div></div>`;
    return;
  }

  el.innerHTML = prods.map(item => `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditPreparo(${item.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:.88rem;font-weight:700">${item.name}</div>
          <div style="font-size:.67rem;color:var(--muted);margin-top:2px">Produção Interna · ${item.unit}</div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditPreparo(${item.id})">✏️</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;font-size:.73rem">
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
          <span style="color:var(--muted)">Porção/pizza</span>
          <span style="font-weight:600">${item.medPorcao} kg</span>
        </div>` : ''}
      </div>
      ${item.obs ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:.68rem;color:var(--muted);line-height:1.5">${item.obs}</div>` : ''}
    </div>`).join('');
}

function openPreparoModal() {
  editPreparoId = null;
  document.getElementById('preparoModalTitle').textContent = 'Novo Preparado';
  document.getElementById('ePreparoId').value = '';
  ['fpName','fpCode','fpCost','fpMin','fpIdeal','fpPorcao','fpObs'].forEach(id => document.getElementById(id).value = '');
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
  document.getElementById('fpObs').value    = item.obs || '';
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
    isProd:    true,
    brands:    [],
    supId:     null,
  };
  if (editPreparoId) {
    const idx = items.findIndex(i => i.id === editPreparoId);
    if (idx >= 0) items[idx] = { ...items[idx], ...data };
    toast(`✅ "${name}" atualizado!`);
  } else {
    items.push({ id: nextIid++, qty: 0, code: '', ...data });
    toast(`✅ "${name}" adicionado!`);
  }
  saveI();
  closeModal('ovPreparo');
  renderPreparoGrid();
  renderDashboard();
}

function deletePreparo() {
  const item = items.find(i => i.id === editPreparoId);
  if (!item || !confirm(`Excluir "${item.name}"?`)) return;
  items = items.filter(i => i.id !== editPreparoId);
  saveI();
  closeModal('ovPreparo');
  renderPreparoGrid();
  renderDashboard();
  toast(`🗑 "${item.name}" excluído.`);
}

// ══════════════════════════════════════════════════════════════
// FORNECEDORES (dentro de Cadastros)
// ══════════════════════════════════════════════════════════════

function renderFornecedores() {
  const q  = document.getElementById('srchCadForn')?.value?.toLowerCase() || '';
  const el = document.getElementById('supGrid');
  if (!el) return;

  let filt = suppliers.filter(s => !q || s.name.toLowerCase().includes(q) || (s.seller || '').toLowerCase().includes(q));

  if (!filt.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏢</div><div style="font-size:.9rem;font-weight:700;margin-bottom:4px">Nenhum fornecedor</div><div>Cadastre seu primeiro fornecedor!</div></div>`;
    return;
  }

  el.innerHTML = filt.map(s => {
    const si = items.filter(i => i.supId === s.id);
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditSup(${s.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:.88rem;font-weight:700">${s.name}</div>
          ${s.seller ? `<div style="font-size:.72rem;color:var(--muted);margin-top:2px">👤 ${s.seller}</div>` : ''}
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditSup(${s.id})">✏️</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
        ${s.phone ? `<div style="font-size:.74rem;color:var(--text2)">${lc("phone",12,"var(--muted)")} ${s.phone}</div>` : ''}
        ${s.email ? `<div style="font-size:.74rem;color:var(--text2)">${lc("mail",12,"var(--muted)")} ${s.email}</div>` : ''}
        ${s.cats  ? `<div style="font-size:.72rem;color:var(--muted)">${s.cats}</div>`  : ''}
      </div>
      ${si.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${si.map(i => `<span class="badge b-purple" style="font-size:.6rem">${i.name}</span>`).join('')}</div>`
        : '<div style="font-size:.71rem;color:var(--muted)">Sem insumos vinculados</div>'}
    </div>`;
  }).join('');
}

function openSupModal() {
  editSupId = null;
  document.getElementById('supModalTitle').textContent = 'Novo Fornecedor';
  ['sfName','sfSeller','sfPhone','sfEmail','sfCats'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('eSupId').value = '';
  document.getElementById('delSupBtn').style.display = 'none';
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
  document.getElementById('eSupId').value   = id;
  document.getElementById('delSupBtn').style.display = 'inline-flex';
  renderSupCbx(items.filter(i => i.supId === id).map(i => i.id));
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
    el.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:.75rem;padding:12px">Nenhum insumo encontrado</div>`;
    return;
  }

  // Agrupa por categoria
  const byCat = {};
  filt.forEach(i => { if (!byCat[i.cat]) byCat[i.cat] = []; byCat[i.cat].push(i); });

  el.innerHTML = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:6px">
      <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:4px 6px">${cat}</div>
      ${catItems.map(i => `
        <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r6);cursor:pointer;font-size:.77rem;background:var(--surface);border:1.5px solid ${linked.includes(i.id) ? 'var(--purple-light)' : 'var(--border)'};margin-bottom:3px;transition:all .1s">
          <input type="checkbox" value="${i.id}" ${linked.includes(i.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--purple)" onchange="this.closest('label').style.borderColor=this.checked?'var(--purple-light)':'var(--border)';this.closest('label').style.background=this.checked?'var(--purple-xlight)':'var(--surface)'">
          <span style="flex:1">${i.name}</span>
          ${i.code ? `<span style="font-size:.58rem;color:var(--muted);font-family:monospace">#${i.code}</span>` : ''}
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
  const data = {
    name,
    seller: document.getElementById('sfSeller').value.trim(),
    phone:  document.getElementById('sfPhone').value.trim(),
    email:  document.getElementById('sfEmail').value.trim(),
    cats:   document.getElementById('sfCats').value.trim(),
  };
  if (editSupId) {
    const idx = suppliers.findIndex(s => s.id === editSupId);
    if (idx >= 0) suppliers[idx] = { ...suppliers[idx], ...data };
    items.forEach(i => { if (i.supId === editSupId) i.supId = null; });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = editSupId; });
    toast(`✅ "${name}" atualizado!`);
  } else {
    const nid = nextSid++;
    suppliers.push({ id: nid, ...data });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = nid; });
    toast(`✅ "${name}" cadastrado!`);
  }
  saveS(); saveI();
  closeModal('ovSup');
  renderFornecedores();
  renderDashboard();
}

function deleteSup() {
  const s = suppliers.find(x => x.id === editSupId);
  if (!s || !confirm(`Excluir "${s.name}"?`)) return;
  suppliers = suppliers.filter(x => x.id !== editSupId);
  items.forEach(i => { if (i.supId === editSupId) i.supId = null; });
  saveS(); saveI();
  closeModal('ovSup');
  renderFornecedores();
  renderDashboard();
  toast(`🗑 "${s.name}" excluído.`);
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
      <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--border)">${cat}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${prods.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
            <div style="flex:1">
              <div style="font-size:.84rem;font-weight:700">${p.name}</div>
              <div style="font-size:.68rem;color:var(--muted)">Preço de venda: R$ ${fmt(p.price)} · ${p.active ? 'Ativo' : 'Inativo'}</div>
            </div>
            <button class="btn btn-outline btn-sm" onclick="openProdModal(${p.id})">Editar</button>
          </div>`).join('')}
      </div>
    </div>`).join('') || `<div class="empty"><div class="empty-icon">🍕</div>Nenhum produto cadastrado</div>`;
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
    toast('✅ Produto atualizado!');
  } else {
    produtos.push({ id: nextPid++, name, cat, price, active: true });
    toast('✅ Produto cadastrado!');
  }
  saveP();
  closeModal('ovProd');
  renderCadProdutos();
}

function deleteProd() {
  if (!_editProdId) return;
  if (!confirm('Excluir este produto?')) return;
  produtos = produtos.filter(p => p.id !== _editProdId);
  saveP();
  closeModal('ovProd');
  renderCadProdutos();
  toast('🗑 Produto excluído.');
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
          <div style="font-size:.82rem;font-weight:700">${tipo.label}</div>
          <div style="font-size:.67rem;color:var(--muted)">Base: R$ ${fmt(tipo.basePrice)}</div>
        </div>
        <button class="btn btn-outline btn-xs" onclick="openSaborModal('${tipo.id}')">+ Sabor</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${cat.items.sort((a,b)=>a.acr-b.acr||a.name.localeCompare(b.name)).map(s => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border:1.5px solid ${s.active===false?'var(--border)':'var(--border)'};border-radius:var(--r6);opacity:${s.active===false?0.5:1}">
            <div style="flex:1">
              <span style="font-size:.8rem;font-weight:600">${s.name}</span>
              <span style="font-size:.7rem;color:var(--muted);margin-left:8px">${s.acr > 0 ? '+R$ ' + fmt(s.acr) : 'Incluso'}</span>
              <span style="font-size:.7rem;color:var(--purple);font-weight:700;margin-left:8px">= R$ ${fmt(tipo.basePrice + s.acr)}</span>
            </div>
            <button class="btn btn-outline btn-xs" onclick="openSaborModal('${tipo.id}', ${s.id})">✏️</button>
          </div>`).join('')}
        ${cat.items.length === 0 ? `<div style="font-size:.72rem;color:var(--muted);padding:8px">Nenhum sabor cadastrado</div>` : ''}
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
    toast('✅ Sabor atualizado!');
  } else {
    sabores.push({ id: nextSabId++, tipo: _editSaborTipo, name, acr, active });
    toast('✅ Sabor adicionado!');
  }
  saveSab();
  closeModal('ovSabor');
  renderCadSabores();
}

function deleteSabor() {
  if (!_editSaborId) return;
  if (!confirm('Excluir este sabor?')) return;
  sabores = sabores.filter(s => s.id !== _editSaborId);
  saveSab();
  closeModal('ovSabor');
  renderCadSabores();
  toast('🗑 Sabor excluído.');
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
          <div style="font-size:.96rem;font-weight:800">Importar insumos do Cardápio Web</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px">Importa nome, categoria, código, unidade e custo do relatório de estoque</div>
        </div>
        <button onclick="document.getElementById('popupImportCad').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>

      <!-- Drop zone -->
      <div id="cadImportDrop"
        onclick="document.getElementById('cadImportFile').click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--purple)'"
        ondragleave="this.style.borderColor='var(--border)'"
        ondrop="event.preventDefault();parseCadCSV(event.dataTransfer.files[0])"
        style="border:2px dashed var(--border);border-radius:var(--r10);padding:28px;text-align:center;cursor:pointer;transition:border-color .2s;margin-bottom:14px">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style="font-size:.82rem;font-weight:600;color:var(--text2)">Clique ou arraste o arquivo CSV aqui</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:4px">Relatório de Estoque de Insumos do Cardápio Web (.csv)</div>
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
        ${novos.length    ? `<span style="padding:3px 10px;border-radius:10px;font-size:.72rem;font-weight:700;background:var(--green-light);color:var(--green)">${novos.length} novos</span>` : ''}
        ${atualizar.length? `<span style="padding:3px 10px;border-radius:10px;font-size:.72rem;font-weight:700;background:var(--yellow-light);color:#92400e">${atualizar.length} com atualizações</span>` : ''}
        ${!novos.length && !atualizar.length ? `<span style="font-size:.8rem;color:var(--muted)">Todos os itens já estão atualizados.</span>` : ''}
      </div>

      ${novos.length ? `
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          Novos insumos (${novos.length})
        </div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
          ${novos.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--green-light);border:1px solid var(--green);border-radius:var(--r6);font-size:.74rem">
              <div>
                <strong>${r.name}</strong>
                <span style="color:var(--muted);margin-left:6px">${r.cat} · ${r.unit} · #${r.code||'—'}</span>
              </div>
              ${r.cost ? `<span style="font-family:monospace;color:var(--green);font-weight:700">R$${r.cost.toFixed(2)}</span>` : ''}
            </div>`).join('')}
        </div>` : ''}

      ${atualizar.length ? `
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          Atualizações (${atualizar.length})
        </div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
          ${atualizar.map(r => `
            <div style="padding:7px 10px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r6);font-size:.74rem">
              <strong>${r.existName}</strong>
              <div style="color:var(--muted);margin-top:2px;font-size:.68rem">${r.changes.join(' · ')}</div>
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
  toast(`✅ ${data.novos.length} novos + ${data.atualizar.length} atualizados!`);
  window._cadImportData = null;
}

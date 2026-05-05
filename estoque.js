/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Módulo de Estoque de Insumos
 */

// ══════════════════════════════════════════════════════════════
// RENDERIZAÇÃO DO ESTOQUE
// ══════════════════════════════════════════════════════════════

function renderEstoque() {
  const q   = document.getElementById('srchEstoque')?.value?.toLowerCase() || '';
  const cat = document.getElementById('catFil')?.value || '';
  const st  = document.getElementById('stFil')?.value || '';
  const insumos = items.filter(i => !i.isProd);

  let filt = insumos.filter(i => {
    if (q && !i.name.toLowerCase().includes(q) && !i.cat.toLowerCase().includes(q)) return false;
    if (cat && i.cat !== cat) return false;
    if (st && gst(i) !== st) return false;
    return true;
  }).sort((a, b) =>
    ({ crit: 0, warn: 1, ok: 2 }[gst(a)] - { crit: 0, warn: 1, ok: 2 }[gst(b)] || a.name.localeCompare(b.name))
  );

  // KPIs
  document.getElementById('estoqueKpi').innerHTML = `
    <div class="kpi"><div class="kpi-v">${insumos.length}</div><div class="kpi-l">Insumos</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--red)">${insumos.filter(i => gst(i) === 'crit').length}</div><div class="kpi-l">Críticos</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--yellow)">${insumos.filter(i => gst(i) === 'warn').length}</div><div class="kpi-l">Baixo</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--green)">${insumos.filter(i => gst(i) === 'ok').length}</div><div class="kpi-l">OK</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--orange-dark);font-size:1.1rem">R$${fmt(insumos.reduce((s, i) => s + gneed(i) * i.cost, 0))}</div><div class="kpi-l">Estimativa</div></div>`;

  // Popula select de categorias
  const cats  = [...new Set(insumos.map(i => i.cat))].sort();
  const catEl = document.getElementById('catFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
    document.getElementById('catDL').innerHTML = cats.map(c => `<option value="${c}">`).join('');
  }

  // Tbody da tabela
  const tbody = document.getElementById('estoqueBody');
  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-icon">🔍</div>Nada encontrado</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filt.map(item => {
    const s    = gst(item);
    const need = gneed(item);
    const pct  = item.ideal <= 0 ? 0 : Math.min(100, Math.round(item.qty / item.ideal * 100));
    const rc   = s === 'crit' ? 'background:#FFF5F5' : s === 'warn' ? 'background:#FEFCE8' : '';
    const b    = (item.brands || []).filter(x => x);

    return `<tr style="${rc}">
      <td>
        <div class="iname">${item.name}</div>
        <div class="isub">${item.cat}${item.code ? ' · #' + item.code : ''}</div>
        ${b.length ? `<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">
          ${b[0] ? `<span class="badge b-purple" style="font-size:.58rem">⭐ ${b[0]}</span>` : ''}
          ${b.slice(1).map(x => `<span class="badge b-gray" style="font-size:.58rem">${x}</span>`).join('')}
        </div>` : ''}
      </td>
      <td class="c"><span style="font-size:.74rem;font-weight:600;color:var(--muted)">${item.unit}</span></td>
      <td class="c">
        <input type="number"
          style="width:62px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.77rem;text-align:center;background:var(--surface2);outline:none"
          id="qty-${item.id}" value="${item.qty}" min="0" step="0.1"
          oninput="onQty(${item.id},this)">
      </td>
      <td class="c"><span style="font-family:monospace;font-size:.77rem">${item.min}</span></td>
      <td class="c"><span style="font-family:monospace;font-size:.77rem">${item.ideal}</span></td>
      <td>
        <div class="prog-wrap">
          <div class="prog-track">
            <div class="prog-fill" style="width:${pct}%;background:${s === 'crit' ? 'var(--red)' : s === 'warn' ? 'var(--yellow)' : 'var(--green)'}"></div>
          </div>
          <span style="font-size:.62rem;color:var(--muted);width:28px">${pct}%</span>
        </div>
      </td>
      <td class="c">
        <span class="badge ${s === 'crit' ? 'b-red' : s === 'warn' ? 'b-yellow' : 'b-green'}">
          ${s === 'crit' ? 'CRÍTICO' : s === 'warn' ? 'BAIXO' : 'OK'}
        </span>
      </td>
      <td class="r">
        ${need > 0
          ? `<div style="font-family:monospace;font-size:.77rem;font-weight:700;color:${s === 'crit' ? 'var(--red)' : 'var(--yellow)'}">
               ${need % 1 === 0 ? need : need.toFixed(1)} ${item.unit}
             </div>
             <div style="font-size:.65rem;color:var(--muted)">R$${fmt(need * item.cost)}</div>`
          : `<span style="color:var(--green);font-size:.77rem">— OK</span>`}
      </td>
      <td class="c">
        <button class="btn btn-outline btn-xs" onclick="openEditItem(${item.id})">✏️</button>
      </td>
    </tr>`;
  }).join('');

  updateSaveBtn();
}

// ── Contagem / salvar ──
function onQty(id, inp) {
  const i = items.find(x => x.id === id);
  if (!i) return;
  i.qty = parseFloat(inp.value) || 0;
  changedIds.add(id);
  updateSaveBtn();
}

function updateSaveBtn() {
  document.getElementById('saveBtn').style.display = changedIds.size ? 'block' : 'none';
  document.getElementById('chgCnt').textContent    = changedIds.size ? `${changedIds.size} alteração(ões)` : '';
}

function saveStock() {
  saveI();
  changedIds.clear();
  updateSaveBtn();
  toast('✅ Contagem salva!');
  renderEstoque();
  renderDashboard();
}

// ══════════════════════════════════════════════════════════════
// AJUSTE SAZONAL
// ══════════════════════════════════════════════════════════════

function goToCompras() {
  const need = items.filter(i => !i.isProd && gneed(i) > 0);
  if (!need.length) { toast('Nenhum item precisa de reposição!', 'info'); return; }
  sazonalPctAtual = 0;
  document.getElementById('sazonalPct').value   = 0;
  document.getElementById('sazonalNome').value  = '';
  document.getElementById('sazonalPreview').style.display = 'none';
  document.querySelectorAll('.sazonal-preset').forEach(p => {
    p.style.background  = '';
    p.style.borderColor = 'var(--border)';
  });
  const normal = document.querySelector('.sazonal-preset[data-val="0"]');
  if (normal) { normal.style.background = 'var(--purple-xlight)'; normal.style.borderColor = 'var(--purple)'; }
  document.getElementById('ovSazonal').classList.add('open');
}

function selectPreset(el, val) {
  document.querySelectorAll('.sazonal-preset').forEach(p => {
    p.style.background  = '';
    p.style.borderColor = 'var(--border)';
  });
  el.style.borderColor = 'var(--purple)';
  el.style.background  = 'var(--purple-xlight)';
  sazonalPctAtual = val;
  document.getElementById('sazonalPct').value = val;
  renderSazonalPreview(val);
}

function onPctChange(inp) {
  sazonalPctAtual = parseFloat(inp.value) || 0;
  document.querySelectorAll('.sazonal-preset').forEach(p => {
    p.style.background  = '';
    p.style.borderColor = 'var(--border)';
  });
  renderSazonalPreview(sazonalPctAtual);
}

function renderSazonalPreview(pct) {
  const needItems = items.filter(i => !i.isProd && gneed(i) > 0);
  if (!needItems.length || pct === 0) {
    document.getElementById('sazonalPreview').style.display = 'none';
    return;
  }
  document.getElementById('sazonalPreview').style.display = 'block';
  document.getElementById('sazonalPreviewBody').innerHTML = needItems.map(item => {
    const idealAdj  = Math.round(item.ideal * (1 + pct / 100) * 10) / 10;
    const needOrig  = gneed(item);
    const needAdj   = Math.max(0, idealAdj - item.qty);
    const diff      = needAdj - needOrig;
    return `<tr>
      <td><div class="iname">${item.name}</div></td>
      <td class="c" style="font-family:monospace;font-size:.75rem">${item.ideal} ${item.unit}</td>
      <td class="c" style="font-family:monospace;font-size:.75rem;font-weight:700;color:var(--purple)">${idealAdj} ${item.unit}</td>
      <td class="r" style="font-family:monospace;font-size:.75rem">${needOrig % 1 === 0 ? needOrig : needOrig.toFixed(1)} ${item.unit}</td>
      <td class="r" style="font-family:monospace;font-size:.75rem;font-weight:700">
        ${needAdj % 1 === 0 ? needAdj : needAdj.toFixed(1)} ${item.unit}
        <span style="font-size:.65rem;color:${diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--muted)'};margin-left:3px">
          ${diff > 0 ? '+' : ''}${diff % 1 === 0 ? diff : diff.toFixed(1)}
        </span>
      </td>
    </tr>`;
  }).join('');
}

function confirmarSazonal() {
  const pct  = sazonalPctAtual;
  const nome = document.getElementById('sazonalNome').value.trim();
  if (pct !== 0) {
    items.forEach(i => {
      if (!i.isProd && gneed(i) > 0) {
        i._idealOrig = i._idealOrig || i.ideal;
        i.ideal = Math.round(i._idealOrig * (1 + pct / 100) * 10) / 10;
      }
    });
    toast(`✅ Ajuste de ${pct > 0 ? '+' : ''}${pct}% aplicado${nome ? ' para "' + nome + '"' : ''}!`);
  }
  closeModal('ovSazonal');
  iniciarCompras();
}

function iniciarCompras() { goModule('compras'); }

// ══════════════════════════════════════════════════════════════
// MODAL DE INSUMO
// ══════════════════════════════════════════════════════════════

function openItemModal() {
  editItemId = null;
  document.getElementById('itemModalTitle').textContent = 'Novo Insumo';
  document.getElementById('eItemId').value = '';
  ['fName','fCat','fB0','fB1','fB2','fCode'].forEach(id => document.getElementById(id).value = '');
  ['fQty','fMin','fIdeal','fCost'].forEach(id => document.getElementById(id).value = '');
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
  document.getElementById('itemModalTitle').textContent = `✏️ ${item.name}`;
  document.getElementById('fName').value  = item.name;
  document.getElementById('fCat').value   = item.cat;
  document.getElementById('fUnit').value  = item.unit;
  document.getElementById('fQty').value   = item.qty;
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
    qty:    parseFloat(document.getElementById('fQty').value)   || 0,
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
    items.push({ id: nextIid++, ...data });
    toast(`✅ "${name}" adicionado!`);
  }
  saveI();
  closeModal('ovItem');
  renderEstoque();
  renderDashboard();
}

function deleteItem() {
  if (!editItemId) return;
  const item = items.find(i => i.id === editItemId);
  if (!item || !confirm(`Excluir "${item.name}"?`)) return;
  items = items.filter(i => i.id !== editItemId);
  saveI();
  closeModal('ovItem');
  renderEstoque();
  renderDashboard();
  toast(`🗑 "${item.name}" excluído.`);
}

// ══════════════════════════════════════════════════════════════
// IMPORTAÇÃO CSV
// ══════════════════════════════════════════════════════════════

function openImportModal() {
  document.getElementById('ovImport').classList.add('open');
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importBtn').style.display = 'none';
  importData = [];
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) parseCSV(f);
}

function handleFile(inp) {
  if (inp.files[0]) parseCSV(inp.files[0]);
}

function parseCSV(file) {
  const r = new FileReader();
  r.onload = e => {
    const txt   = e.target.result;
    const lines = txt.split('\n').filter(l => l.trim());
    if (!lines.length) return;
    const sep     = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
    importData = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
      if (cols.length < 4) continue;
      const row  = {};
      headers.forEach((h, j) => row[h] = cols[j] || '');
      const name = row['Insumo'] || row['Nome'] || '';
      const cat  = row['Categoria'] || '';
      const unit = row['Medida'] || 'kg';
      const qty  = parseFloat((row['Estoque atual']    || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      const min  = parseFloat((row['Estoque mínimo']   || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      const cost = parseFloat((row['Preço de custo']   || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      const code = row['Cód. interno'] || '';
      if (!name) continue;
      importData.push({ name, cat, unit, qty, min, ideal: min * 2, cost, code, isProd: cat === 'PRODUÇÃO INTERNA' || cat === 'Produção Interna' });
    }
    const novo      = importData.filter(d => !items.find(i => i.name.toLowerCase() === d.name.toLowerCase())).length;
    const atualizar = importData.filter(d =>  items.find(i => i.name.toLowerCase() === d.name.toLowerCase())).length;
    document.getElementById('importPreview').innerHTML = `
      <div style="background:var(--green-light);border:1.5px solid #86EFAC;border-radius:var(--r8);padding:12px 14px;font-size:.78rem;margin-top:10px">
        <div style="font-weight:700;color:var(--green);margin-bottom:4px">✅ ${importData.length} itens identificados</div>
        <div style="color:var(--green)">• ${novo} novos · ${atualizar} para atualizar · Produção Interna separada automaticamente</div>
      </div>
      <div class="tbl-wrap" style="max-height:180px;overflow-y:auto;margin-top:10px">
        <table>
          <thead><tr><th>Nome</th><th>Categoria</th><th class="c">Atual</th><th class="r">Custo</th></tr></thead>
          <tbody>
            ${importData.slice(0, 10).map(d => `
              <tr>
                <td><div class="iname">${d.name}</div></td>
                <td><span class="badge ${d.isProd ? 'b-purple' : 'b-gray'}" style="font-size:.6rem">${d.cat}</span></td>
                <td class="c" style="font-family:monospace;font-size:.75rem">${d.qty}</td>
                <td class="r" style="font-family:monospace;font-size:.75rem">R$${fmt(d.cost)}</td>
              </tr>`).join('')}
            ${importData.length > 10 ? `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-size:.72rem;padding:8px">... e mais ${importData.length - 10} itens</td></tr>` : ''}
          </tbody>
        </table>
      </div>`;
    document.getElementById('importBtn').style.display = 'block';
  };
  r.readAsText(file, 'UTF-8');
}

function confirmImport() {
  let added = 0, updated = 0;
  importData.forEach(d => {
    const exist = items.find(i => i.name.toLowerCase() === d.name.toLowerCase());
    if (exist) {
      exist.qty  = d.qty;
      exist.min  = d.min;
      exist.cost = d.cost || exist.cost;
      exist.cat  = d.cat  || exist.cat;
      exist.code = d.code || exist.code;
      updated++;
    } else {
      items.push({ id: nextIid++, ...d, supId: null, brands: [] });
      added++;
    }
  });
  saveI();
  closeModal('ovImport');
  renderEstoque();
  renderDashboard();
  toast(`✅ ${added} adicionados, ${updated} atualizados!`);
}

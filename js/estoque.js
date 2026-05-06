/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Operação: quantidade, mínimo e ideal (inline, salva ao sair)
 */

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
    <div class="kpi"><div class="kpi-v" style="color:var(--orange-dark);font-size:1.1rem">R$${fmt(insumos.reduce((s, i) => s + gneed(i) * i.cost, 0))}</div><div class="kpi-l">Estimativa compras</div></div>`;

  // Categorias
  const cats  = [...new Set(insumos.map(i => i.cat))].sort();
  const catEl = document.getElementById('catFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
  }

  const tbody = document.getElementById('estoqueBody');
  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-icon">🔍</div>Nada encontrado</div></td></tr>`;
    return;
  }

  const inputStyle = `width:68px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.78rem;text-align:center;background:var(--surface2);outline:none;transition:border-color .15s`;

  tbody.innerHTML = filt.map(item => {
    const s    = gst(item);
    const need = gneed(item);
    const pct  = item.ideal <= 0 ? 0 : Math.min(100, Math.round(item.qty / item.ideal * 100));
    const rc   = s === 'crit' ? 'background:#FFF5F5' : s === 'warn' ? 'background:#FEFCE8' : '';

    const needChk = need > 0;
    return `<tr style="${rc}" id="row-${item.id}">
      <td class="c" style="width:36px">
        <input type="checkbox" class="est-chk" value="${item.id}" ${needChk ? 'checked' : ''}
          style="accent-color:var(--purple);width:15px;height:15px" title="Incluir na lista de compras"
          onchange="updateEstSelCount()">
      </td>
      <td>
        <div class="iname">${item.name}</div>
        <div class="isub">${item.cat}${item.code ? ' · #' + item.code : ''}</div>
      </td>
      <td class="c"><span style="font-size:.74rem;font-weight:600;color:var(--muted)">${item.unit}</span></td>
      <td class="c">
        <input type="number" style="${inputStyle}" id="qty-${item.id}"
          value="${item.qty}" min="0" step="0.1"
          oninput="onQty(${item.id},this)"
          title="Quantidade atual">
      </td>
      <td class="c">
        <input type="number" style="${inputStyle}" id="min-${item.id}"
          value="${item.min}" min="0" step="0.1"
          onblur="onMinIdeal(${item.id},'min',this)"
          onfocus="this.style.borderColor='var(--purple)'"
          title="Mínimo — edite e saia do campo para salvar">
      </td>
      <td class="c">
        <input type="number" style="${inputStyle}" id="ideal-${item.id}"
          value="${item.ideal}" min="0" step="0.1"
          onblur="onMinIdeal(${item.id},'ideal',this)"
          onfocus="this.style.borderColor='var(--purple)'"
          title="Ideal — edite e saia do campo para salvar">
      </td>
      <td>
        <div class="prog-wrap">
          <div class="prog-track">
            <div class="prog-fill" id="prog-${item.id}" style="width:${pct}%;background:${s === 'crit' ? 'var(--red)' : s === 'warn' ? 'var(--yellow)' : 'var(--green)'}"></div>
          </div>
          <span style="font-size:.62rem;color:var(--muted);width:28px" id="pct-${item.id}">${pct}%</span>
        </div>
      </td>
      <td class="c">
        <span class="badge ${s === 'crit' ? 'b-red' : s === 'warn' ? 'b-yellow' : 'b-green'}" id="badge-${item.id}">
          ${s === 'crit' ? 'CRÍTICO' : s === 'warn' ? 'BAIXO' : 'OK'}
        </span>
      </td>
      <td class="r" id="need-${item.id}">
        ${need > 0
          ? `<div style="font-family:monospace;font-size:.77rem;font-weight:700;color:${s === 'crit' ? 'var(--red)' : 'var(--yellow)'}">
               ${need % 1 === 0 ? need : need.toFixed(1)} ${item.unit}
             </div>
             <div style="font-size:.65rem;color:var(--muted)">R$${fmt(need * item.cost)}</div>`
          : `<span style="color:var(--green);font-size:.77rem">— OK</span>`}
      </td>
    </tr>`;
  }).join('');

  updateSaveBtn();
  updateEstSelCount();
}

// ── Quantidade (acumula para salvar juntos) ──
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

// ── Mínimo / Ideal (salva inline ao sair do campo) ──
function onMinIdeal(id, field, inp) {
  inp.style.borderColor = 'var(--border)';
  const i = items.find(x => x.id === id);
  if (!i) return;
  const val = parseFloat(inp.value);
  if (isNaN(val) || val < 0) { inp.value = i[field]; return; }
  i[field] = val;
  saveI();
  // Atualiza progresso e status sem re-renderizar tudo
  _refreshRow(id);
  renderDashboard();
  toast(`✅ ${field === 'min' ? 'Mínimo' : 'Ideal'} atualizado!`, 'ok');
}

function _refreshRow(id) {
  const i    = items.find(x => x.id === id);
  if (!i) return;
  const s    = gst(i);
  const need = gneed(i);
  const pct  = i.ideal <= 0 ? 0 : Math.min(100, Math.round(i.qty / i.ideal * 100));

  const progEl  = document.getElementById(`prog-${id}`);
  const pctEl   = document.getElementById(`pct-${id}`);
  const badgeEl = document.getElementById(`badge-${id}`);
  const needEl  = document.getElementById(`need-${id}`);
  const rowEl   = document.getElementById(`row-${id}`);

  if (progEl)  { progEl.style.width = `${pct}%`; progEl.style.background = s === 'crit' ? 'var(--red)' : s === 'warn' ? 'var(--yellow)' : 'var(--green)'; }
  if (pctEl)   pctEl.textContent = `${pct}%`;
  if (badgeEl) { badgeEl.className = `badge ${s === 'crit' ? 'b-red' : s === 'warn' ? 'b-yellow' : 'b-green'}`; badgeEl.textContent = s === 'crit' ? 'CRÍTICO' : s === 'warn' ? 'BAIXO' : 'OK'; }
  if (rowEl)   rowEl.style.background = s === 'crit' ? '#FFF5F5' : s === 'warn' ? '#FEFCE8' : '';
  if (needEl)  needEl.innerHTML = need > 0
    ? `<div style="font-family:monospace;font-size:.77rem;font-weight:700;color:${s === 'crit' ? 'var(--red)' : 'var(--yellow)'}">${need % 1 === 0 ? need : need.toFixed(1)} ${i.unit}</div><div style="font-size:.65rem;color:var(--muted)">R$${fmt(need * i.cost)}</div>`
    : `<span style="color:var(--green);font-size:.77rem">— OK</span>`;
}

// ── Sazonal ──


function selectPreset(el, val) {
  document.querySelectorAll('.sazonal-preset').forEach(p => { p.style.background = ''; p.style.borderColor = 'var(--border)'; });
  el.style.borderColor = 'var(--purple)'; el.style.background = 'var(--purple-xlight)';
  sazonalPctAtual = val; document.getElementById('sazonalPct').value = val;
  renderSazonalPreview(val);
}

function onPctChange(inp) {
  sazonalPctAtual = parseFloat(inp.value) || 0;
  document.querySelectorAll('.sazonal-preset').forEach(p => { p.style.background = ''; p.style.borderColor = 'var(--border)'; });
  renderSazonalPreview(sazonalPctAtual);
}

function renderSazonalPreview(pct) {
  const needItems = items.filter(i => !i.isProd && gneed(i) > 0);
  if (!needItems.length || pct === 0) { document.getElementById('sazonalPreview').style.display = 'none'; return; }
  document.getElementById('sazonalPreview').style.display = 'block';
  document.getElementById('sazonalPreviewBody').innerHTML = needItems.map(item => {
    const idealAdj = Math.round(item.ideal * (1 + pct / 100) * 10) / 10;
    const needOrig = gneed(item); const needAdj = Math.max(0, idealAdj - item.qty); const diff = needAdj - needOrig;
    return `<tr>
      <td><div class="iname">${item.name}</div></td>
      <td class="c" style="font-family:monospace;font-size:.75rem">${item.ideal} ${item.unit}</td>
      <td class="c" style="font-family:monospace;font-size:.75rem;font-weight:700;color:var(--purple)">${idealAdj} ${item.unit}</td>
      <td class="r" style="font-family:monospace;font-size:.75rem">${needOrig % 1 === 0 ? needOrig : needOrig.toFixed(1)} ${item.unit}</td>
      <td class="r" style="font-family:monospace;font-size:.75rem;font-weight:700">
        ${needAdj % 1 === 0 ? needAdj : needAdj.toFixed(1)} ${item.unit}
        <span style="font-size:.65rem;color:${diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--muted)'};margin-left:3px">${diff > 0 ? '+' : ''}${diff % 1 === 0 ? diff : diff.toFixed(1)}</span>
      </td>
    </tr>`;
  }).join('');
}

function confirmarSazonal() {
  const pct = sazonalPctAtual; const nome = document.getElementById('sazonalNome').value.trim();
  if (pct !== 0) {
    items.forEach(i => { if (!i.isProd && gneed(i) > 0) { i._idealOrig = i._idealOrig || i.ideal; i.ideal = Math.round(i._idealOrig * (1 + pct / 100) * 10) / 10; } });
    toast(`✅ Ajuste de ${pct > 0 ? '+' : ''}${pct}% aplicado${nome ? ' para "' + nome + '"' : ''}!`);
  }
  closeModal('ovSazonal'); iniciarCompras();
}

function iniciarCompras() { goModule('compras'); }

function toggleEstAll(chk) {
  document.querySelectorAll('.est-chk').forEach(c => c.checked = chk.checked);
  updateEstSelCount();
}

function selectEstByStatus(mode) {
  document.querySelectorAll('.est-chk').forEach(c => {
    const id   = parseInt(c.value);
    const item = items.find(i => i.id === id);
    if (!item) return;
    const s = gst(item);
    if      (mode === 'crit') c.checked = s === 'crit';
    else if (mode === 'warn') c.checked = s === 'warn';
    else if (mode === 'need') c.checked = gneed(item) > 0;
    else if (mode === 'none') c.checked = false;
  });
  updateEstSelCount();
  // Sincroniza checkbox "selecionar tudo"
  const all = document.querySelectorAll('.est-chk');
  const chk = document.querySelectorAll('.est-chk:checked');
  const allChk = document.getElementById('estChkAll');
  if (allChk) {
    allChk.checked = chk.length === all.length && all.length > 0;
    allChk.indeterminate = chk.length > 0 && chk.length < all.length;
  }
}

function updateEstSelCount() {
  const total   = document.querySelectorAll('.est-chk').length;
  const checked = document.querySelectorAll('.est-chk:checked').length;
  const el = document.getElementById('estSelCount');
  if (el) el.textContent = checked > 0 ? `${checked} de ${total} selecionados` : '';
  // Sync header checkbox
  const allChk = document.getElementById('estChkAll');
  if (allChk) {
    allChk.checked = checked === total && total > 0;
    allChk.indeterminate = checked > 0 && checked < total;
  }
}

function goToCompras() {
  // Coleta itens selecionados (com checkbox marcado) na tela de estoque
  const checked = [...document.querySelectorAll('.est-chk:checked')].map(c => parseInt(c.value));
  
  if (checked.length > 0) {
    // Salva seleção para compras usar no step 1
    localStorage.setItem('vtp_estoque_sel', JSON.stringify(checked));
  } else {
    // Se nenhum selecionado, limpa para carregar padrão
    localStorage.removeItem('vtp_estoque_sel');
  }
  goModule('compras');
}

// ── Importação CSV com deduplicação por CÓDIGO ──
function openImportModal() {
  document.getElementById('ovImport').classList.add('open');
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importBtn').style.display = 'none';
  importData = [];
}

function handleDrop(e) {
  e.preventDefault(); document.getElementById('dropzone').classList.remove('drag');
  const f = e.dataTransfer.files[0]; if (f) parseCSV(f);
}

function handleFile(inp) { if (inp.files[0]) parseCSV(inp.files[0]); }

function parseCSV(file) {
  const r = new FileReader();
  r.onload = e => {
    const txt = e.target.result;
    const lines = txt.split('\n').filter(l => l.trim());
    if (!lines.length) return;
    const sep     = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
    importData = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
      if (cols.length < 4) continue;
      const row  = {}; headers.forEach((h, j) => row[h] = cols[j] || '');
      const name = row['Insumo'] || row['Nome'] || '';
      const code = row['Cód. interno'] || row['Código'] || '';
      const cat  = row['Categoria'] || '';
      const unit = row['Medida'] || 'kg';
      const qty  = parseFloat((row['Estoque atual']  || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      const min  = parseFloat((row['Estoque mínimo'] || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      const cost = parseFloat((row['Preço de custo'] || '0').replace(',', '.').replace(/[R$\s]/g, '')) || 0;
      if (!name) continue;
      importData.push({ name, code, cat, unit, qty, min, ideal: min * 2, cost, isProd: cat === 'PRODUÇÃO INTERNA' || cat === 'Produção Interna' });
    }

    // Deduplicação por CÓDIGO (principal) ou nome (fallback)
    let novo = 0, atuQty = 0, atuCad = 0, semCod = 0;
    importData.forEach(d => {
      const byCode = d.code ? items.find(i => i.code && i.code === d.code) : null;
      const byName = items.find(i => i.name.toLowerCase() === d.name.toLowerCase());
      const exist  = byCode || byName;
      if (!d.code) semCod++;
      if (exist) { atuQty++; if (byCode && byCode !== byName) atuCad++; }
      else novo++;
    });

    document.getElementById('importPreview').innerHTML = `
      <div style="background:var(--green-light);border:1.5px solid #86EFAC;border-radius:var(--r8);padding:12px 14px;font-size:.78rem;margin-top:10px">
        <div style="font-weight:700;color:var(--green);margin-bottom:6px">✅ ${importData.length} itens identificados</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span class="badge b-purple">${novo} novos</span>
          <span class="badge b-green">${atuQty} para atualizar quantidade</span>
          ${semCod > 0 ? `<span class="badge b-yellow">⚠️ ${semCod} sem código (match por nome)</span>` : ''}
        </div>
      </div>
      <div class="tbl-wrap" style="max-height:200px;overflow-y:auto;margin-top:10px">
        <table>
          <thead><tr><th>Nome</th><th>Cód.</th><th>Categoria</th><th class="c">Qtd.</th><th class="r">Custo</th></tr></thead>
          <tbody>
            ${importData.slice(0, 12).map(d => {
              const byCode = d.code ? items.find(i => i.code && i.code === d.code) : null;
              const byName = items.find(i => i.name.toLowerCase() === d.name.toLowerCase());
              const exist  = byCode || byName;
              return `<tr>
                <td><div class="iname">${d.name}</div></td>
                <td style="font-family:monospace;font-size:.7rem;color:var(--muted)">${d.code || '—'}</td>
                <td><span class="badge ${d.isProd ? 'b-purple' : 'b-gray'}" style="font-size:.6rem">${d.cat}</span></td>
                <td class="c" style="font-family:monospace;font-size:.75rem">${d.qty}</td>
                <td class="r" style="font-family:monospace;font-size:.75rem">R$${fmt(d.cost)}</td>
              </tr>`;
            }).join('')}
            ${importData.length > 12 ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-size:.72rem;padding:8px">... e mais ${importData.length - 12} itens</td></tr>` : ''}
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
    // Busca por código primeiro, depois por nome
    const exist = (d.code ? items.find(i => i.code && i.code === d.code) : null)
               || items.find(i => i.name.toLowerCase() === d.name.toLowerCase());
    if (exist) {
      exist.qty  = d.qty;
      // Atualiza custo e mínimo só se vieram preenchidos
      if (d.cost > 0) exist.cost = d.cost;
      if (d.min  > 0) exist.min  = d.min;
      // Garante que o código seja sincronizado
      if (d.code && !exist.code) exist.code = d.code;
      updated++;
    } else {
      items.push({ id: nextIid++, qty: d.qty, supId: null, brands: [], ...d });
      added++;
    }
  });
  saveI();
  closeModal('ovImport');
  renderEstoque();
  renderDashboard();
  toast(`✅ ${added} adicionados, ${updated} atualizados!`);
}

/**
 * VTP Compras — Vai Ter Pizza!
 * modules.js — Pré-produção, Fornecedores, Relatórios, Usuários, PDF
 */

// ══════════════════════════════════════════════════════════════
// PRÉ-PRODUÇÃO
// ══════════════════════════════════════════════════════════════

function renderPreproducao() {
  const prod = items.filter(i => i.isProd);
  const pend = ordens.filter(o => o.status === 'pendente').length;
  const prod_ = ordens.filter(o => o.status === 'produzido').length;

  document.getElementById('prepKpi').innerHTML = `
    <div class="kpi"><div class="kpi-v">${prod.length}</div><div class="kpi-l">Preparados</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--orange-dark)">${pend}</div><div class="kpi-l">Ordens pendentes</div></div>
    <div class="kpi"><div class="kpi-v" style="color:var(--green)">${prod_}</div><div class="kpi-l">Produzidos</div></div>`;

  const grid = document.getElementById('prepGrid');
  grid.innerHTML = prod.map(item => {
    const itemOrdens = ordens.filter(o => o.itemId === item.id).sort((a, b) => b.id - a.id);
    const s          = gst(item);
    const pct        = item.ideal <= 0 ? 0 : Math.min(100, Math.round(item.qty / item.ideal * 100));
    return `<div class="card" style="margin-bottom:0">
      <div class="card-header">
        <div>
          <div class="card-title">${item.name}</div>
          <div style="font-size:.67rem;color:var(--muted);margin-top:2px">${item.qty} ${item.unit} atual · ideal: ${item.ideal}</div>
        </div>
        <span class="badge ${s === 'crit' ? 'b-red' : s === 'warn' ? 'b-yellow' : 'b-green'}">${s === 'crit' ? 'CRÍTICO' : s === 'warn' ? 'BAIXO' : 'OK'}</span>
      </div>
      <div class="card-body">
        <div class="prog-wrap" style="margin-bottom:10px">
          <div class="prog-track">
            <div class="prog-fill" style="width:${pct}%;background:${s === 'crit' ? 'var(--red)' : s === 'warn' ? 'var(--yellow)' : 'var(--green)'}"></div>
          </div>
          <span style="font-size:.7rem;color:var(--muted)">${pct}%</span>
        </div>
        ${item.medPorcao ? `<div style="font-size:.7rem;color:var(--muted);margin-bottom:8px">Porção: ${item.medPorcao} kg/pizza · Rende ≈ ${Math.round(item.qty / item.medPorcao)} pizzas</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:120px;overflow-y:auto">
          ${itemOrdens.slice(0, 4).map(o => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--surface2);border-radius:var(--r6);font-size:.73rem">
              <div>
                <span style="font-weight:600">${o.qty} ${item.unit}</span>
                <span style="color:var(--muted);margin-left:6px">${fmtD(o.date)} · ${o.turno || '—'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="badge ${o.status === 'produzido' ? 'b-green' : 'b-orange'}" style="font-size:.58rem">${o.status === 'produzido' ? '✓ Prod.' : 'Pend.'}</span>
                ${o.status === 'pendente' ? `<button class="btn btn-green btn-xs" onclick="finishOrdem(${o.id})">✓</button>` : ''}
              </div>
            </div>`).join('')}
          ${itemOrdens.length === 0 ? `<div style="font-size:.72rem;color:var(--muted);text-align:center;padding:8px">Nenhuma ordem criada</div>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%;justify-content:center" onclick="openOrdemModal(${item.id})">+ Nova Ordem</button>
      </div>
    </div>`;
  }).join('');
}

function openOrdemModal(preItemId) {
  const sel = document.getElementById('opItem');
  sel.innerHTML = '<option value="">Selecionar...</option>' +
    items.filter(i => i.isProd).map(i => `<option value="${i.id}"${i.id === preItemId ? ' selected' : ''}>${i.name}</option>`).join('');
  document.getElementById('opQty').value  = '';
  document.getElementById('opResp').value = '';
  document.getElementById('opConf').value = '';
  document.getElementById('opObs').value  = '';
  document.getElementById('opDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ovOrdem').classList.add('open');
  setTimeout(() => sel.focus(), 80);
}

function saveOrdem() {
  const itemId = parseInt(document.getElementById('opItem').value);
  const qty    = parseFloat(document.getElementById('opQty').value);
  if (!itemId) { toast('Selecione o preparado', 'err'); return; }
  if (!qty)    { toast('Informe a quantidade',  'err'); return; }
  ordens.push({
    id:     (Math.max(...ordens.map(o => o.id), 0) + 1),
    itemId,
    qty,
    date:   document.getElementById('opDate').value,
    resp:   document.getElementById('opResp').value.trim(),
    conf:   document.getElementById('opConf').value.trim(),
    turno:  document.getElementById('opTurno').value,
    obs:    document.getElementById('opObs').value.trim(),
    status: 'pendente',
    createdAt: new Date().toISOString(),
  });
  saveO();
  closeModal('ovOrdem');
  renderPreproducao();
  renderDashboard();
  toast('✅ Ordem criada!');
}

function finishOrdem(id) {
  const o = ordens.find(x => x.id === id);
  if (!o) return;
  o.status     = 'produzido';
  o.finishedAt = new Date().toISOString();
  const item = items.find(i => i.id === o.itemId);
  if (item) { item.qty = parseFloat((item.qty + o.qty).toFixed(3)); saveI(); }
  saveO();
  renderPreproducao();
  renderDashboard();
  toast('✅ Produção registrada!');
}

// ── PDF de ordens ──
function openExportPDF() {
  const today = new Date().toISOString().slice(0, 10);
  const week  = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  document.getElementById('pdfDe').value     = today;
  document.getElementById('pdfAte').value    = week;
  document.getElementById('pdfStatus').value = '';
  renderPDFList();
  document.getElementById('ovPDF').classList.add('open');
  ['pdfDe', 'pdfAte', 'pdfStatus'].forEach(id => document.getElementById(id).addEventListener('change', renderPDFList));
}

function renderPDFList() {
  const de  = document.getElementById('pdfDe').value;
  const ate = document.getElementById('pdfAte').value;
  const st  = document.getElementById('pdfStatus').value;
  let filtered = ordens.filter(o => {
    if (de  && o.date < de)  return false;
    if (ate && o.date > ate) return false;
    if (st  && o.status !== st) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const list  = document.getElementById('pdfOrdensList');
  const empty = document.getElementById('pdfEmpty');
  if (!filtered.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border-radius:var(--r6);margin-bottom:4px">
      <input type="checkbox" id="chkAllPDF" onchange="toggleAllPDF(this)" checked style="accent-color:var(--purple);width:15px;height:15px">
      <span style="font-size:.72rem;font-weight:700;color:var(--text2)">${filtered.length} ordem(ns) encontrada(s)</span>
    </div>
    ${filtered.map(o => {
      const item = items.find(i => i.id === o.itemId);
      return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;background:var(--surface)">
        <input type="checkbox" class="pdf-chk" value="${o.id}" checked style="accent-color:var(--purple);width:15px;height:15px;flex-shrink:0">
        <div style="flex:1">
          <div style="font-size:.82rem;font-weight:600">${item?.name || '—'}</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:2px">${fmtD(o.date)} · ${o.qty} ${item?.unit || 'kg'} · ${o.turno || '—'} · ${o.resp || '—'}</div>
        </div>
        <span class="badge ${o.status === 'produzido' ? 'b-green' : 'b-orange'}">${o.status === 'produzido' ? 'Produzido' : 'Pendente'}</span>
      </label>`;
    }).join('')}`;
}

function toggleAllPDF(chk) {
  document.querySelectorAll('.pdf-chk').forEach(c => c.checked = chk.checked);
}

function generatePDF() {
  const selected  = [...document.querySelectorAll('.pdf-chk:checked')].map(c => parseInt(c.value));
  if (!selected.length) { toast('Selecione pelo menos uma ordem', 'err'); return; }
  const selOrdens = ordens.filter(o => selected.includes(o.id)).sort((a, b) => a.date.localeCompare(b.date));
  const nowStr    = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Ordens de Produção — Vai Ter Pizza</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;color:#1a0a2e;background:#fff;padding:24px}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #6B21D4;padding-bottom:14px;margin-bottom:20px}
    .logo-box{width:48px;height:48px;background:#6B21D4;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.4rem}
    .logo-text{font-size:1.1rem;font-weight:800;color:#6B21D4}
    .logo-sub{font-size:.72rem;color:#9B91B8;margin-top:2px}
    .header-right{text-align:right;font-size:.72rem;color:#9B91B8}
    .summary{background:#F5F3FF;border:1.5px solid #E5DEFF;border-radius:8px;padding:12px 14px;margin-bottom:20px;display:flex;gap:24px}
    .sum-val{font-size:1.2rem;font-weight:800;color:#6B21D4}
    .sum-lbl{font-size:.63rem;color:#9B91B8;text-transform:uppercase;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;font-size:.78rem;margin-bottom:28px}
    thead th{background:#6B21D4;color:#fff;padding:9px 10px;text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.5px}
    tbody tr{border-bottom:1px solid #E5DEFF}
    tbody tr:nth-child(even){background:#F5F3FF}
    td{padding:9px 10px;vertical-align:top}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.62rem;font-weight:700}
    .b-pend{background:#FEF3C7;color:#D97706}
    .b-prod{background:#DCFCE7;color:#16A34A}
    .sign-area{display:flex;gap:20px;margin-top:8px}
    .sign-box{flex:1;border-top:1.5px solid #1a0a2e;padding-top:4px;font-size:.67rem;color:#9B91B8;text-align:center}
    .footer{margin-top:24px;border-top:1px solid #E5DEFF;padding-top:10px;font-size:.67rem;color:#9B91B8;display:flex;justify-content:space-between}
    @media print{body{padding:12px}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="logo-box">🍕</div>
      <div><div class="logo-text">Vai Ter Pizza!</div><div class="logo-sub">Sistema de Compras · Pré-produção</div></div>
    </div>
    <div class="header-right"><strong>Ordens de Produção</strong><br>Gerado em ${nowStr}<br>${selOrdens.length} ordem(ns)</div>
  </div>
  <div class="summary">
    <div><div class="sum-val">${selOrdens.length}</div><div class="sum-lbl">Total ordens</div></div>
    <div><div class="sum-val">${selOrdens.filter(o => o.status === 'pendente').length}</div><div class="sum-lbl">Pendentes</div></div>
    <div><div class="sum-val">${selOrdens.filter(o => o.status === 'produzido').length}</div><div class="sum-lbl">Produzidos</div></div>
    <div><div class="sum-val">${[...new Set(selOrdens.map(o => o.date))].length}</div><div class="sum-lbl">Dias cobertos</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Preparado</th><th>Quantidade</th><th>Data</th><th>Turno</th><th>Responsável</th><th>Conferente</th><th>Status</th><th>Observações</th></tr></thead>
    <tbody>
      ${selOrdens.map((o, i) => {
        const item = items.find(x => x.id === o.itemId);
        return `<tr>
          <td style="color:#9B91B8;font-size:.7rem">${i + 1}</td>
          <td><strong>${item?.name || '—'}</strong>${item?.medPorcao ? `<br><span style="font-size:.67rem;color:#9B91B8">Porção: ${item.medPorcao} kg/pizza</span>` : ''}</td>
          <td><strong>${o.qty} ${item?.unit || 'kg'}</strong></td>
          <td>${fmtD(o.date)}</td>
          <td>${o.turno || '—'}</td>
          <td>${o.resp  || '—'}</td>
          <td>${o.conf  || '—'}</td>
          <td><span class="badge ${o.status === 'produzido' ? 'b-prod' : 'b-pend'}">${o.status === 'produzido' ? 'Produzido' : 'Pendente'}</span></td>
          <td style="font-size:.72rem;color:#4B4569">${o.obs || '—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <div class="sign-area">
    <div class="sign-box">Responsável pela produção</div>
    <div class="sign-box">Conferente / Supervisor</div>
    <div class="sign-box">Gerente</div>
  </div>
  <div class="footer">
    <span>Vai Ter Pizza! · Sistema de Compras</span>
    <span>Impresso em ${nowStr}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  closeModal('ovPDF');
  toast('📄 PDF gerado!', 'ok');
}

// ══════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════

function renderFornecedores() {
  const el = document.getElementById('supGrid');
  if (!suppliers.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🏢</div><div style="font-size:.9rem;font-weight:700;margin-bottom:4px">Nenhum fornecedor</div><div>Cadastre seu primeiro fornecedor!</div></div>`;
    return;
  }
  el.innerHTML = suppliers.map(s => {
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
        ${s.phone ? `<div style="font-size:.74rem;color:var(--text2)">📞 ${s.phone}</div>` : ''}
        ${s.email ? `<div style="font-size:.74rem;color:var(--text2)">✉️ ${s.email}</div>` : ''}
        ${s.cats  ? `<div style="font-size:.72rem;color:var(--muted)">${s.cats}</div>` : ''}
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
  document.getElementById('supModalTitle').textContent = `✏️ ${s.name}`;
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

function renderSupCbx(linked) {
  document.getElementById('sfItems').innerHTML = [...items]
    .filter(i => !i.isProd)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => `
      <label style="display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:var(--r6);cursor:pointer;font-size:.77rem;background:var(--surface);border:1.5px solid var(--border)">
        <input type="checkbox" value="${i.id}" ${linked.includes(i.id) ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--purple)">
        ${i.name}
        <span class="badge b-gray" style="font-size:.58rem;margin-left:auto">${i.cat}</span>
      </label>`).join('');
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
// RELATÓRIOS
// ══════════════════════════════════════════════════════════════

function renderRelatorios() {
  // Histórico de ciclos
  document.getElementById('relHistorico').innerHTML = cycleHistory.length
    ? cycleHistory.slice().reverse().map(c => `
        <div class="hist-row">
          <div style="flex:1">
            <div style="font-size:.82rem;font-weight:700">${c.id}</div>
            <div style="font-size:.68rem;color:var(--muted)">${fmtD(c.date)} · ${c.items} itens · ${c.sups} fornecedores</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:monospace;font-size:.82rem;font-weight:700;color:var(--purple)">R$${fmt(c.total)}</div>
            <div style="font-size:.65rem;color:var(--green)">↓ R$${fmt(c.economia)}</div>
          </div>
        </div>`).join('')
    : `<div class="empty" style="padding:24px"><div class="empty-icon">📋</div>Nenhum ciclo finalizado.</div>`;

  // Evolução de preços (top 5 insumos por custo)
  const top5 = [...items].filter(i => !i.isProd).sort((a, b) => b.cost - a.cost).slice(0, 5);
  document.getElementById('relPrecos').innerHTML = top5.length
    ? `<div style="display:flex;flex-direction:column;gap:10px">
        ${top5.map(i => `
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:.8rem;font-weight:600">${i.name}</div>
              <div style="font-size:.65rem;color:var(--muted)">${i.cat}</div>
            </div>
            <div style="font-family:monospace;font-weight:700">R$${fmt(i.cost)}</div>
          </div>`).join('')}
       </div>`
    : `<div class="empty" style="padding:20px">Sem dados.</div>`;

  // Desempenho por fornecedor
  document.getElementById('relFornecedores').innerHTML = suppliers.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        ${suppliers.map(s => {
          const si = items.filter(i => i.supId === s.id);
          return `<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px">
            <div style="font-size:.82rem;font-weight:700;margin-bottom:4px">${s.name}</div>
            ${s.seller ? `<div style="font-size:.7rem;color:var(--muted)">👤 ${s.seller}</div>` : ''}
            <div style="font-size:.7rem;color:var(--muted);margin-top:4px">${si.length} insumo(s) vinculado(s)</div>
            ${si.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${si.slice(0, 3).map(i => `<span class="badge b-purple" style="font-size:.58rem">${i.name}</span>`).join('')}${si.length > 3 ? `<span class="badge b-gray" style="font-size:.58rem">+${si.length - 3}</span>` : ''}</div>` : ''}
          </div>`;
        }).join('')}
       </div>`
    : `<div class="empty" style="padding:20px">Nenhum fornecedor cadastrado.</div>`;
}

// ══════════════════════════════════════════════════════════════
// USUÁRIOS
// ══════════════════════════════════════════════════════════════

function renderUsuarios() {
  document.getElementById('userList').innerHTML = users.map(u => {
    const p = PERMS[u.role];
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:50%;background:${u.role === 'gerente' ? 'var(--purple)' : u.role === 'supervisor' ? 'var(--orange-dark)' : 'var(--green)'};display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:#fff;flex-shrink:0">${u.name.charAt(0)}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-size:.86rem;font-weight:700">${u.name}</span>
          <span class="badge" style="background:${p.bg};color:${p.color}">${p.label}</span>
        </div>
        <div style="font-size:.72rem;color:var(--muted)">${u.email}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">
          ${p.perms.map(perm => `<span class="badge b-gray" style="font-size:.6rem">✓ ${perm}</span>`).join('')}
        </div>
      </div>
      <button class="btn btn-outline btn-xs" onclick="openEditUser(${u.id})">✏️</button>
    </div>`;
  }).join('');
}

function openUserModal() {
  editUserId = null;
  document.getElementById('userModalTitle').textContent = 'Novo Usuário';
  ['fuName','fuEmail','fuPass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fuRole').value = 'comprador';
  document.getElementById('delUserBtn').style.display = 'none';
  renderPermPreview();
  document.getElementById('ovUser').classList.add('open');
  setTimeout(() => document.getElementById('fuName').focus(), 80);
}

function openEditUser(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  editUserId = id;
  document.getElementById('userModalTitle').textContent = `✏️ ${u.name}`;
  document.getElementById('fuName').value  = u.name;
  document.getElementById('fuEmail').value = u.email;
  document.getElementById('fuRole').value  = u.role;
  document.getElementById('fuPass').value  = '';
  document.getElementById('delUserBtn').style.display = id === 1 ? 'none' : 'inline-flex';
  renderPermPreview();
  document.getElementById('ovUser').classList.add('open');
}

function renderPermPreview() {
  const role = document.getElementById('fuRole')?.value || 'comprador';
  const p    = PERMS[role];
  const all  = ['Ver Dashboard','Estoque','Pré-produção','Compras','Aprovação de compras','Fornecedores','Relatórios','Gerenciar usuários','Configurações'];
  document.getElementById('permPreview').innerHTML = all.map(perm => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:.79rem">
      <span>${perm}</span>
      <span style="font-size:.72rem;font-weight:700;color:${p.perms.includes(perm) ? 'var(--green)' : 'var(--red)'}">
        ${p.perms.includes(perm) ? '✅ Permitido' : '❌ Bloqueado'}
      </span>
    </div>`).join('');
}

function saveUser() {
  const name  = document.getElementById('fuName').value.trim();
  const email = document.getElementById('fuEmail').value.trim();
  const role  = document.getElementById('fuRole').value;
  if (!name || !email) { toast('Preencha nome e e-mail', 'err'); return; }
  if (editUserId) {
    const idx = users.findIndex(u => u.id === editUserId);
    if (idx >= 0) users[idx] = { ...users[idx], name, email, role };
    toast(`✅ "${name}" atualizado!`);
  } else {
    if (users.find(u => u.email === email)) { toast('E-mail já cadastrado', 'err'); return; }
    users.push({ id: nextUid++, name, email, role, active: true });
    toast(`✅ "${name}" criado!`);
  }
  saveU();
  closeModal('ovUser');
  renderUsuarios();
}

function deleteUser() {
  const u = users.find(x => x.id === editUserId);
  if (!u || !confirm(`Excluir "${u.name}"?`)) return;
  users = users.filter(x => x.id !== editUserId);
  saveU();
  closeModal('ovUser');
  renderUsuarios();
  toast(`🗑 "${u.name}" excluído.`);
}

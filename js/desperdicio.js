/**
 * VTP Compras — Vai Ter Pizza!
 * desperdicio.js — Módulo de Controle de Desperdício
 */

// ══════════════════════════════════════════════════════════════
// DADOS
// ══════════════════════════════════════════════════════════════

let desperdicios = JSON.parse(localStorage.getItem('vtp_desperdicios') || '[]');
const saveD = () => localStorage.setItem('vtp_desperdicios', JSON.stringify(desperdicios));

const TIPOS_DESPERDICIO = [
  { id: 'preproducao', label: 'Erro de pré-produção', icon: '🍳', color: 'var(--red)',         bg: 'var(--red-light)' },
  { id: 'montagem',    label: 'Montagem incorreta',   icon: '🍕', color: 'var(--orange-dark)',  bg: 'var(--orange-light)' },
  { id: 'entrega',     label: 'Erro de entrega',      icon: '🛵', color: 'var(--yellow)',        bg: 'var(--yellow-light)' },
  { id: 'validade',    label: 'Vencimento/validade',  icon: '📅', color: '#7C3AED',             bg: '#EDE9FE' },
  { id: 'acidente',    label: 'Acidente/queda',       icon: '⚠️', color: 'var(--muted)',         bg: 'var(--surface2)' },
  { id: 'outro',       label: 'Outro',                icon: '📦', color: 'var(--text2)',         bg: 'var(--surface2)' },
];

// ══════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════

function renderDesperdicio() {
  const de  = document.getElementById('despDe')?.value  || '';
  const ate = document.getElementById('despAte')?.value || '';
  const tipo = document.getElementById('despTipoFil')?.value || '';

  const filt = desperdicios.filter(d => {
    if (de   && d.date < de)   return false;
    if (ate  && d.date > ate)  return false;
    if (tipo && d.tipo !== tipo) return false;
    return true;
  });

  // ── KPIs ──
  const totalCusto = filt.reduce((s, d) => {
    const item = items.find(i => i.id === d.itemId);
    return s + (item?.cost || 0) * d.qty;
  }, 0);

  const porTipo = {};
  TIPOS_DESPERDICIO.forEach(t => { porTipo[t.id] = { qty: 0, custo: 0 }; });
  filt.forEach(d => {
    const item = items.find(i => i.id === d.itemId);
    if (!porTipo[d.tipo]) porTipo[d.tipo] = { qty: 0, custo: 0 };
    porTipo[d.tipo].qty   += d.qty;
    porTipo[d.tipo].custo += (item?.cost || 0) * d.qty;
  });

  document.getElementById('despKpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-v" style="color:var(--red)">${filt.length}</div>
      <div class="kpi-l">Registros</div>
    </div>
    <div class="kpi">
      <div class="kpi-v" style="color:var(--red);font-size:1.1rem">R$ ${fmt(totalCusto)}</div>
      <div class="kpi-l">Custo desperdiçado</div>
    </div>
    ${TIPOS_DESPERDICIO.filter(t => porTipo[t.id]?.custo > 0).slice(0, 3).map(t => `
      <div class="kpi">
        <div style="font-size:1.2rem;margin-bottom:4px">${t.icon}</div>
        <div class="kpi-v" style="font-size:1rem;color:${t.color}">R$ ${fmt(porTipo[t.id].custo)}</div>
        <div class="kpi-l">${t.label}</div>
      </div>`).join('')}`;

  // ── Gráfico por tipo ──
  const maxCusto = Math.max(...Object.values(porTipo).map(v => v.custo), 1);
  document.getElementById('despChart').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${TIPOS_DESPERDICIO.filter(t => porTipo[t.id]?.custo > 0).sort((a, b) => porTipo[b.id].custo - porTipo[a.id].custo).map(t => `
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:1rem;width:24px;text-align:center">${t.icon}</div>
          <div style="font-size:.72rem;width:130px;color:var(--text2)">${t.label}</div>
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${Math.round(porTipo[t.id].custo / maxCusto * 100)}%;background:${t.color};border-radius:4px;transition:width .5s"></div>
          </div>
          <div style="font-size:.72rem;font-weight:700;width:70px;text-align:right;color:${t.color}">R$ ${fmt(porTipo[t.id].custo)}</div>
        </div>`).join('')}
      ${Object.values(porTipo).every(v => v.custo === 0) ? '<div style="color:var(--muted);font-size:.8rem;text-align:center;padding:16px">Nenhum desperdício no período 🎉</div>' : ''}
    </div>`;

  // ── Top insumos mais desperdiçados ──
  const porItem = {};
  filt.forEach(d => {
    if (!porItem[d.itemId]) porItem[d.itemId] = { qty: 0, custo: 0 };
    const item = items.find(i => i.id === d.itemId);
    porItem[d.itemId].qty   += d.qty;
    porItem[d.itemId].custo += (item?.cost || 0) * d.qty;
    porItem[d.itemId].name  = item?.name || '—';
    porItem[d.itemId].unit  = item?.unit || '';
  });

  const topItems = Object.entries(porItem).sort(([,a],[,b]) => b.custo - a.custo).slice(0, 5);
  document.getElementById('despTopItems').innerHTML = topItems.length
    ? `<div style="display:flex;flex-direction:column;gap:0">
        ${topItems.map(([id, v]) => `
          <div style="display:flex;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-size:.82rem;font-weight:600">${v.name}</div>
              <div style="font-size:.67rem;color:var(--muted)">${fmt(v.qty)} ${v.unit} desperdiçado(s)</div>
            </div>
            <div style="font-family:monospace;font-weight:700;color:var(--red)">R$ ${fmt(v.custo)}</div>
          </div>`).join('')}
       </div>`
    : `<div class="empty" style="padding:24px"><div class="empty-icon">✅</div>Nenhum desperdício registrado</div>`;

  // ── Lista de registros ──
  document.getElementById('despLista').innerHTML = filt.length
    ? `<div style="display:flex;flex-direction:column;gap:8px">
        ${filt.slice().reverse().map(d => {
          const item  = items.find(i => i.id === d.itemId);
          const tipo  = TIPOS_DESPERDICIO.find(t => t.id === d.tipo);
          const custo = (item?.cost || 0) * d.qty;
          return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10)">
            <div style="width:36px;height:36px;border-radius:var(--r8);background:${tipo?.bg || 'var(--surface2)'};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${tipo?.icon || '📦'}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                <span style="font-size:.83rem;font-weight:700">${item?.name || '—'}</span>
                <span class="badge" style="background:${tipo?.bg};color:${tipo?.color};font-size:.6rem">${tipo?.label || d.tipo}</span>
              </div>
              <div style="font-size:.7rem;color:var(--muted)">${fmtD(d.date)} · ${d.qty} ${item?.unit || ''} · Custo: R$ ${fmt(custo)}</div>
              ${d.resp ? `<div style="font-size:.7rem;color:var(--muted)">Resp.: ${d.resp}</div>` : ''}
              ${d.obs ? `<div style="font-size:.72rem;color:var(--text2);margin-top:4px;font-style:italic">"${d.obs}"</div>` : ''}
            </div>
            <button class="btn btn-red btn-xs" onclick="deleteDesperdicios(${d.id})" title="Excluir">🗑</button>
          </div>`;
        }).join('')}
       </div>`
    : `<div class="empty" style="padding:32px"><div class="empty-icon">✅</div>Nenhum desperdício registrado no período!</div>`;
}

// ══════════════════════════════════════════════════════════════
// MODAL: REGISTRAR DESPERDÍCIO
// ══════════════════════════════════════════════════════════════

let _editDespId = null;

function openDespModal() {
  _editDespId = null;
  document.getElementById('despModalTitle').textContent = 'Registrar Desperdício';
  document.getElementById('fdItemId').value   = '';
  document.getElementById('fdQty').value      = '';
  document.getElementById('fdObs').value      = '';
  document.getElementById('fdResp').value     = '';
  document.getElementById('fdDate').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('fdTipo').value     = 'preproducao';
  document.getElementById('delDespBtn').style.display = 'none';

  // Popula select de insumos (todos, incluindo produção interna)
  document.getElementById('fdItemId').innerHTML =
    '<option value="">Selecionar insumo...</option>' +
    [...items].sort((a, b) => a.name.localeCompare(b.name))
      .map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');

  document.getElementById('ovDesp').classList.add('open');
  setTimeout(() => document.getElementById('fdItemId').focus(), 80);
}

function saveDesp() {
  const itemId = parseInt(document.getElementById('fdItemId').value);
  const qty    = parseFloat(document.getElementById('fdQty').value);
  const tipo   = document.getElementById('fdTipo').value;
  if (!itemId) { toast('Selecione o insumo', 'err'); return; }
  if (!qty || qty <= 0) { toast('Informe a quantidade', 'err'); return; }

  const item  = items.find(i => i.id === itemId);
  const custo = (item?.cost || 0) * qty;

  const d = {
    id:     _editDespId || (Math.max(...desperdicios.map(d => d.id), 0) + 1),
    itemId,
    qty,
    tipo,
    date:   document.getElementById('fdDate').value,
    resp:   document.getElementById('fdResp').value.trim(),
    obs:    document.getElementById('fdObs').value.trim(),
    custo,
    createdAt: new Date().toISOString(),
  };

  if (_editDespId) {
    const idx = desperdicios.findIndex(x => x.id === _editDespId);
    if (idx >= 0) desperdicios[idx] = d;
    toast(`✅ Registro atualizado!`);
  } else {
    // Debita do estoque automaticamente
    if (item) {
      item.qty = Math.max(0, parseFloat((item.qty - qty).toFixed(3)));
      saveI();
    }
    desperdicios.push(d);
    toast(`✅ Desperdício registrado! ${qty} ${item?.unit || ''} debitado do estoque.`);
  }

  saveD();
  closeModal('ovDesp');
  renderDesperdicio();
  renderDashboard();
}

function deleteDesperdicios(id) {
  if (!confirm('Excluir este registro?')) return;
  desperdicios = desperdicios.filter(d => d.id !== id);
  saveD();
  renderDesperdicio();
  toast('🗑 Registro excluído.');
}

function clearDespFiltro() {
  document.getElementById('despDe').value       = '';
  document.getElementById('despAte').value      = '';
  document.getElementById('despTipoFil').value  = '';
  renderDesperdicio();
}

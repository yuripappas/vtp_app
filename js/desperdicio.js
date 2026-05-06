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
          // Suporta registros novos (d.nome) e antigos (d.itemId)
          const item  = d.itemId ? items.find(i => i.id === d.itemId) : null;
          const prod  = d.prodId ? (typeof produtos !== 'undefined' ? produtos : []).find(p => p.id === d.prodId) : null;
          const nome  = d.nome || item?.name || '—';
          const unit  = d.unidade || item?.unit || '';
          const custo = d.custo !== undefined ? d.custo : (item?.cost || 0) * d.qty;
          const tipo  = TIPOS_DESPERDICIO.find(t => t.id === d.tipo);
          const origemBadge = d.origem === 'produto' ? '🍕 Produto' : d.origem === 'preparado' ? '🍳 Preparado' : '📦 Insumo';
          return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10)">
            <div style="width:36px;height:36px;border-radius:var(--r8);background:${tipo?.bg || 'var(--surface2)'};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${tipo?.icon || '📦'}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
                <span style="font-size:.83rem;font-weight:700">${nome}</span>
                <span class="badge b-gray" style="font-size:.58rem">${origemBadge}</span>
                <span class="badge" style="background:${tipo?.bg};color:${tipo?.color};font-size:.6rem">${tipo?.label || d.tipo}</span>
              </div>
              <div style="font-size:.7rem;color:var(--muted)">${fmtD(d.date)} · ${d.qty} ${unit} · Custo: R$ ${fmt(custo)}</div>
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
  document.getElementById('fdQty').value   = '';
  document.getElementById('fdObs').value   = '';
  document.getElementById('fdResp').value  = '';
  document.getElementById('fdDate').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('fdTipo').value  = 'preproducao';
  document.getElementById('delDespBtn').style.display = 'none';

  // Seta origem padrão e popula lista
  document.getElementById('fdOrigem').value = 'insumo';
  updateDespOrigemList();

  document.getElementById('ovDesp').classList.add('open');
  setTimeout(() => document.getElementById('fdOrigem').focus(), 80);
}

function setDespOrigem(origem) {
  try {
    // Atualiza hidden input
    const hiddenEl = document.getElementById('fdOrigem');
    if (hiddenEl) hiddenEl.value = origem;

    // Atualiza botões
    ['insumo','preparado','produto'].forEach(o => {
      const btn = document.getElementById('orig-btn-' + o);
      if (!btn) return;
      if (o === origem) {
        btn.style.background  = 'var(--purple)';
        btn.style.borderColor = 'var(--purple)';
        btn.style.color       = '#fff';
      } else {
        btn.style.background  = 'var(--surface)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color       = 'var(--text2)';
      }
    });

    // Atualiza nota
    const noteEl = document.getElementById('origemNote');
    if (noteEl) {
      const notes = {
        insumo:    '📦 Insumos de compras — quantidade debitada do estoque automaticamente',
        preparado: '🍳 Preparados de produção — quantidade debitada do estoque automaticamente',
        produto:   '🍕 Produto final (pizza/bebida) — custo = preço de venda',
      };
      noteEl.textContent = notes[origem] || '';
    }

    // Popula lista
    updateDespOrigemList();
  } catch(e) {
    console.error('setDespOrigem error:', e);
  }
}

function updateDespOrigemList() {
  const origem    = document.getElementById('fdOrigem').value;
  const sel       = document.getElementById('fdItemId');
  const qtyLabel  = document.getElementById('fdQtyLabel');
  const pizzaArea = document.getElementById('fdPizzaArea');

  sel.innerHTML = '<option value="">Selecionar...</option>';
  if (pizzaArea) pizzaArea.style.display = 'none';

  if (origem === 'insumo') {
    [...items].filter(i => !i.isProd)
      .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
      .forEach(i => {
        sel.innerHTML += `<option value="i_${i.id}">[${i.cat}] ${i.name} (${i.unit})</option>`;
      });
    if (qtyLabel) qtyLabel.textContent = 'Insumo *';

  } else if (origem === 'preparado') {
    [...items].filter(i => i.isProd)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(i => {
        sel.innerHTML += `<option value="i_${i.id}">[Preparado] ${i.name} (${i.unit})</option>`;
      });
    if (qtyLabel) qtyLabel.textContent = 'Preparado *';

  } else if (origem === 'produto') {
    // Pizza: seleciona tipo primeiro, depois sabores
    if (qtyLabel) qtyLabel.textContent = 'Tipo de pizza *';
    PIZZA_TIPOS.forEach(t => {
      sel.innerHTML += `<option value="pt_${t.id}">${t.label} — base R$${fmt(t.basePrice)}</option>`;
    });
    // Também mostra outros produtos (bebidas etc)
    const prods = typeof produtos !== 'undefined' ? produtos : [];
    prods.filter(p => p.active !== false)
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(p => {
        sel.innerHTML += `<option value="p_${p.id}">[Outro] ${p.name} — R$${fmt(p.price)}</option>`;
      });
    if (pizzaArea) pizzaArea.style.display = 'none';
  }
}

function onDespItemChange() {
  const rawId     = document.getElementById('fdItemId').value;
  const pizzaArea = document.getElementById('fdPizzaArea');
  const custoEl   = document.getElementById('fdCustoPreview');
  if (!rawId.startsWith('pt_')) {
    if (pizzaArea) pizzaArea.style.display = 'none';
    return;
  }
  const tipoId = rawId.replace('pt_', '');
  const tipo   = PIZZA_TIPOS.find(t => t.id === tipoId);
  if (!tipo || !pizzaArea) return;

  pizzaArea.style.display = '';
  const isGrande = tipo.grande;
  const sabs     = sabores.filter(s => s.tipo === tipoId && s.active !== false)
                          .sort((a,b) => a.acr - b.acr || a.name.localeCompare(b.name));

  const opts = '<option value="">Selecionar sabor...</option>' +
    sabs.map(s => `<option value="${s.id}">${s.name}${s.acr > 0 ? ' (+R$' + fmt(s.acr) + ')' : ''}</option>`).join('');

  document.getElementById('fdSabor1').innerHTML = opts;
  document.getElementById('fdSabor1Label').textContent = isGrande ? '1º Sabor (1/2) *' : 'Sabor *';

  const sab2Row = document.getElementById('fdSabor2Row');
  if (sab2Row) sab2Row.style.display = isGrande ? '' : 'none';
  document.getElementById('fdSabor2').innerHTML = opts;

  _calcPizzaCusto();
}

function _calcPizzaCusto() {
  const rawId   = document.getElementById('fdItemId').value;
  const tipoId  = rawId.replace('pt_', '');
  const tipo    = PIZZA_TIPOS.find(t => t.id === tipoId);
  if (!tipo) return;

  const sab1Id  = parseInt(document.getElementById('fdSabor1').value);
  const sab2Id  = parseInt(document.getElementById('fdSabor2')?.value);
  const sab1    = sabores.find(s => s.id === sab1Id);
  const sab2    = sabores.find(s => s.id === sab2Id);

  let total = tipo.basePrice;
  if (sab1) total += sab1.acr;
  if (tipo.grande && sab2) total += sab2.acr;

  const el = document.getElementById('fdCustoPreview');
  if (el) {
    const sabDesc = sab1 ? (tipo.grande && sab2 ? sab1.name + ' + ' + sab2.name : sab1.name) : '—';
    el.innerHTML = `
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px">
        <div style="font-size:.7rem;color:var(--muted);margin-bottom:4px">Valor total do produto desperdiçado</div>
        <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
        <div style="font-size:.68rem;color:var(--muted);margin-top:2px">${tipo.label} · ${sabDesc}</div>
      </div>`;
  }
}

function saveDesp() {
  const rawId  = document.getElementById('fdItemId').value;
  const qty    = parseFloat(document.getElementById('fdQty').value);
  const tipo   = document.getElementById('fdTipo').value;
  const origem = document.getElementById('fdOrigem').value;

  if (!rawId) { toast('Selecione o item', 'err'); return; }
  if (!qty || qty <= 0) { toast('Informe a quantidade', 'err'); return; }

  // Resolve item/produto e custo
  let itemId = null, prodId = null, nome = '', unidade = '', custo = 0, d_extra = {};

  if (rawId.startsWith('p_')) {
    // Produto (pizza/bebida) — custo = preço de venda
    prodId = parseInt(rawId.slice(2));
    const prod = (typeof produtos !== 'undefined' ? produtos : []).find(p => p.id === prodId);
    if (!prod) { toast('Produto não encontrado', 'err'); return; }
    nome    = prod.name;
    unidade = 'un';
    custo   = prod.price * qty;
  } else {
    // Insumo ou Preparado
    itemId = parseInt(rawId.slice(2));
    const item = items.find(i => i.id === itemId);
    if (!item) { toast('Insumo não encontrado', 'err'); return; }
    nome    = item.name;
    unidade = item.unit;
    custo   = (item.cost || 0) * qty;
  }

  const d = {
    id:      _editDespId || (Math.max(0, ...desperdicios.map(d => d.id)) + 1),
    itemId,
    prodId,
    origem,
    nome,
    unidade,
    qty,
    tipo,
    custo,
    ...d_extra,
    date:      document.getElementById('fdDate').value,
    resp:      document.getElementById('fdResp').value.trim(),
    obs:       document.getElementById('fdObs').value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (_editDespId) {
    const idx = desperdicios.findIndex(x => x.id === _editDespId);
    if (idx >= 0) desperdicios[idx] = d;
    toast('✅ Registro atualizado!');
  } else {
    // Debita do estoque apenas para insumos/preparados
    if (itemId) {
      const item = items.find(i => i.id === itemId);
      if (item) { item.qty = Math.max(0, parseFloat((item.qty - qty).toFixed(3))); saveI(); }
    }
    desperdicios.push(d);
    const msg = itemId
      ? `✅ Desperdício registrado! ${qty} ${unidade} debitado do estoque.`
      : `✅ Desperdício de produto registrado! Custo: R$ ${fmt(custo)}`;
    toast(msg);
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

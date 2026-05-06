/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Módulo de Compras (Requisição → Cotação → Mapa → OC)
 */

// ══════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ══════════════════════════════════════════════════════════════

// ── Dashboard fixo de compras (sempre visível no topo) ──
function _renderComprasDashboard() {
  const cicloEl   = document.getElementById('cDashCiclo');
  const kpisEl    = document.getElementById('cDashKpis');
  const timerEl   = document.getElementById('cDashTimer');
  const actEl     = document.getElementById('cDashActions');
  const progDiv   = document.getElementById('cDashProgress');
  const progBar   = document.getElementById('cDashProgBar');
  const progPct   = document.getElementById('cDashProgPct');
  const supStatus = document.getElementById('cDashSupStatus');
  if (!cicloEl) return;

  if (!cycle) {
    cicloEl.textContent = 'Nenhum ciclo ativo';
    kpisEl.innerHTML    = '<span style="font-size:.74rem;color:var(--muted)">Inicie uma requisição para começar</span>';
    timerEl.innerHTML   = '';
    actEl.innerHTML     = '';
    if (progDiv) progDiv.style.display = 'none';
    return;
  }

  const disps      = cycle.dispatches || [];
  const responded  = disps.filter(d => d.status === 'responded').length;
  const pending    = disps.filter(d => d.status === 'sent').length;
  const approved   = Object.keys(approvals).length;
  const totalItems = cycle.items?.length || 0;
  const deadlineMs = new Date(cycle.deadline) - Date.now();
  const hoursLeft  = Math.max(0, Math.floor(deadlineMs / 3600000));
  const minsLeft   = Math.max(0, Math.floor((deadlineMs % 3600000) / 60000));
  const isExp      = deadlineMs < 0;
  const pct        = disps.length ? Math.round(responded / disps.length * 100) : 0;

  cicloEl.textContent = cycle.id;

  kpisEl.innerHTML = `
    <div style="text-align:center;padding:6px 12px;background:var(--surface2);border-radius:var(--r8)">
      <div style="font-size:1rem;font-weight:800;color:var(--purple)">${totalItems}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Itens</div>
    </div>
    <div style="text-align:center;padding:6px 12px;background:var(--surface2);border-radius:var(--r8)">
      <div style="font-size:1rem;font-weight:800;color:var(--text)">${disps.length}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Fornecedores</div>
    </div>
    <div style="text-align:center;padding:6px 12px;background:var(--green-light);border-radius:var(--r8)">
      <div style="font-size:1rem;font-weight:800;color:var(--green)">${responded}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Responderam</div>
    </div>
    <div style="text-align:center;padding:6px 12px;background:${pending > 0 ? 'var(--yellow-light)' : 'var(--surface2)'};border-radius:var(--r8)">
      <div style="font-size:1rem;font-weight:800;color:${pending > 0 ? 'var(--yellow)' : 'var(--muted)'}">${pending}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Pendentes</div>
    </div>
    <div style="text-align:center;padding:6px 12px;background:var(--purple-xlight);border-radius:var(--r8)">
      <div style="font-size:1rem;font-weight:800;color:var(--purple)">${approved}</div>
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Aprovados</div>
    </div>`;

  // Timer
  timerEl.innerHTML = `
    <div style="text-align:center;padding:6px 14px;border-radius:var(--r8);background:${isExp ? 'var(--green-light)' : hoursLeft < 3 ? 'var(--red-light)' : 'var(--yellow-light)'};border:1.5px solid ${isExp ? 'var(--green)' : hoursLeft < 3 ? 'var(--red)' : 'var(--yellow)'}">
      <div style="font-size:1rem;font-weight:800;color:${isExp ? 'var(--green)' : hoursLeft < 3 ? 'var(--red)' : 'var(--yellow)'}">
        ${isExp ? '✓ Encerrado' : hoursLeft + 'h ' + minsLeft + 'm'}
      </div>
      <div style="font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${isExp ? 'prazo encerrado' : 'restantes'}</div>
    </div>`;

  // Ações rápidas
  const pendDisps = disps.filter(d => d.status === 'sent');
  actEl.innerHTML = `
    ${pendDisps.length > 0 ? pendDisps.map(d => {
      const sup = suppliers.find(s => s.id === d.supId);
      return `<button class="btn btn-primary btn-xs" onclick="openManualResponse('${d.token}')" title="Inserir resposta de ${sup?.name}">
        ✏️ ${sup?.name?.split(' ')[0] || 'Forn.'}
      </button>`;
    }).join('') : ''}
    ${responded > 0 ? `<button class="btn btn-outline btn-xs" onclick="goStep(3)">📊 Ver mapa</button>` : ''}`;

  // Barra progresso
  if (progDiv) progDiv.style.display = disps.length ? '' : 'none';
  if (progBar) progBar.style.width = pct + '%';
  if (progBar) progBar.style.background = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
  if (progPct) progPct.textContent = pct + '% respondidos';

  // Status por fornecedor
  if (supStatus) {
    supStatus.innerHTML = disps.map(d => {
      const sup  = suppliers.find(s => s.id === d.supId);
      const resp = responses[d.token];
      const isResp = d.status === 'responded';
      const isMan  = resp?.isManual;
      return `<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:20px;font-size:.68rem;font-weight:600;border:1.5px solid ${isResp ? 'var(--green)' : 'var(--border)'};background:${isResp ? 'var(--green-light)' : 'var(--surface2)'}">
        <span>${isResp ? '✓' : '⏳'}</span>
        <span>${sup?.name?.split(' ')[0] || '?'}</span>
        ${isMan ? '<span style="font-size:.55rem;color:var(--muted)">(manual)</span>' : ''}
      </div>`;
    }).join('');
  }
}

function renderComprasModule() {
  const d = new Date(Date.now() + 24 * 36e5);
  if (!document.getElementById('cfgDeadline').value)
    document.getElementById('cfgDeadline').value = d.toISOString().slice(0, 16);
  const d2 = new Date(Date.now() + 3 * 864e5);
  if (!document.getElementById('cfgDelivery').value)
    document.getElementById('cfgDelivery').value = d2.toISOString().slice(0, 10);
  renderBuyItems();
  goStep(1);
  _renderComprasDashboard();
  // Atualiza dashboard a cada 60s
  clearInterval(window._comprasDashTimer);
  window._comprasDashTimer = setInterval(_renderComprasDashboard, 60000);
}

function goStep(n) {
  [1, 2, 3, 4].forEach(i => {
    document.getElementById(`cstep${i}`).classList.toggle('active', i === n);
    document.getElementById(`snav${i}`).classList.toggle('active', i === n);
  });
  if (n === 2) renderDispatchSups();
  if (n === 3) { renderMapaStatus(); setTab3('compare'); }
  if (n === 4) renderOrdemCompra();
}

// ── STEP 1: Itens para compra ──
let _buyFilter = { cat: '', status: 'need', search: '' };

// Seleção vinda do estoque (se existir)
function _getEstSel() {
  try { return JSON.parse(localStorage.getItem('vtp_estoque_sel') || 'null'); } catch { return null; }
}

function renderBuyItems() {
  // Se veio seleção do estoque, aplica e limpa
  const estSel = _getEstSel();
  if (estSel && estSel.length > 0) {
    localStorage.removeItem('vtp_estoque_sel');
    _buyFilter.status = 'sel'; // modo seleção: só mostra os marcados
    _buyFilter._sel   = estSel;
  }
  const insumos = items.filter(i => !i.isProd && i.ideal > 0);

  // Popula filtro de categoria
  const cats = [...new Set(insumos.map(i => i.cat))].sort();
  const catEl = document.getElementById('buyCatFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}"${c === cur ? ' selected' : ''}>${c}</option>`).join('');
  }

  // Aplica filtros
  const q = (_buyFilter.search || '').toLowerCase();
  let filt = insumos.filter(i => {
    if (_buyFilter.cat && i.cat !== _buyFilter.cat) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    if (_buyFilter.status === 'sel')    return (_buyFilter._sel || []).includes(i.id);
    if (_buyFilter.status === 'need')   return gneed(i) > 0;
    if (_buyFilter.status === 'crit')   return gst(i) === 'crit';
    if (_buyFilter.status === 'warn')   return gst(i) === 'warn';
    if (_buyFilter.status === 'all')    return true;
    return gneed(i) > 0;
  }).sort((a, b) => ({crit:0,warn:1,ok:2}[gst(a)] - {crit:0,warn:1,ok:2}[gst(b)] || a.name.localeCompare(b.name)));

  const total = filt.length;
  document.getElementById('buyItemCount').textContent = `${total} item(ns)`;

  const tbody = document.getElementById('buyItemsBody');
  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">🔍</div>Nenhum item encontrado com esses filtros</div></td></tr>`;
    _updateBuyCounter();
    return;
  }

  // Agrupa por categoria
  const byCat = {};
  filt.forEach(i => { if (!byCat[i.cat]) byCat[i.cat] = []; byCat[i.cat].push(i); });

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => `
    <tr style="background:var(--surface2)">
      <td colspan="7" style="padding:6px 12px">
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" class="cat-chk" data-cat="${cat}" onchange="toggleCatItems('${cat}',this)" checked
            style="accent-color:var(--purple);width:14px;height:14px">
          <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">${cat}</span>
          <span class="badge b-gray" style="font-size:.58rem">${catItems.length}</span>
        </div>
      </td>
    </tr>
    ${catItems.map(item => {
      const b    = (item.brands || []).filter(x => x);
      const need = gneed(item);
      const s    = gst(item);
      const isChecked = estSel ? estSel.includes(item.id) : true;
      return `<tr>
        <td class="c"><input type="checkbox" class="buy-chk" value="${item.id}" ${isChecked ? 'checked' : ''}
          style="accent-color:var(--purple);width:15px;height:15px" onchange="_updateBuyCounter()"></td>
        <td>
          <div class="iname">${item.name}</div>
          <div class="isub">${item.cat}</div>
        </td>
        <td class="c">
          <input type="number" id="bq-${item.id}"
            value="${need % 1 === 0 ? need : need.toFixed(1)}" min="0" step="0.1"
            style="width:70px;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.8rem;text-align:center;background:var(--surface2);outline:none">
        </td>
        <td class="c"><span style="font-family:monospace;font-size:.74rem">${item.unit}</span></td>
        <td>${b[0] ? `<span class="badge b-purple" style="font-size:.62rem">⭐ ${b[0]}</span>` : '<span style="color:var(--muted);font-size:.72rem">—</span>'}</td>
        <td><span style="font-size:.72rem;color:var(--muted)">${b.slice(1).join(' / ') || '—'}</span></td>
        <td class="r">
          <div style="font-family:monospace;font-size:.74rem;color:var(--muted)">R$ ${fmt(item.cost)}</div>
          <div class="badge ${s==='crit'?'b-red':s==='warn'?'b-yellow':'b-green'}" style="font-size:.55rem;margin-top:2px">${s==='crit'?'CRÍTICO':s==='warn'?'BAIXO':'OK'}</div>
        </td>
      </tr>`;
    }).join('')}`).join('');

  _updateBuyCounter();
  // Show import badge if came from estoque
  const badge = document.getElementById('estSelBadge');
  if (badge) badge.style.display = _buyFilter.status === 'sel' ? '' : 'none';
}

function _updateBuyCounter() {
  const total   = document.querySelectorAll('.buy-chk').length;
  const checked = document.querySelectorAll('.buy-chk:checked').length;
  document.getElementById('buyItemCount').textContent = `${checked} de ${total} selecionados`;
  const chkAll = document.getElementById('chkAll');
  if (chkAll) chkAll.indeterminate = checked > 0 && checked < total;
  if (chkAll) chkAll.checked = checked === total;
}

function toggleAllItems(chk) {
  document.querySelectorAll('.buy-chk').forEach(c => c.checked = chk.checked);
  _updateBuyCounter();
}

function toggleCatItems(cat, chk) {
  document.querySelectorAll('.buy-chk').forEach(c => {
    const row = c.closest('tr');
    const catLabel = row?.previousElementSibling?.querySelector(`[data-cat="${cat}"]`);
    // find items in this category
    const item = items.find(i => i.id === parseInt(c.value));
    if (item?.cat === cat) c.checked = chk.checked;
  });
  _updateBuyCounter();
}

function setBuyFilter(field, val) {
  _buyFilter[field] = val;
  renderBuyItems();
}

function _setBuyBtn(active) {
  ['sel','need','crit','warn','all'].forEach(k => {
    const btn = document.getElementById(`bf-${k}`);
    if (!btn) return;
    if (k === active) { btn.style.background = 'var(--purple)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--purple)'; }
    else              { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; btn.className = 'btn btn-outline btn-sm'; btn.style.fontSize = '.7rem'; }
  });
}

// ── STEP 2: Fornecedores com canal de cotação ──
// Canal salvo por fornecedor: 'whatsapp' | 'email' | 'manual'
let _supCanais = JSON.parse(localStorage.getItem('vtp_sup_canais') || '{}');
function _saveCanais() { localStorage.setItem('vtp_sup_canais', JSON.stringify(_supCanais)); }

function setSupCanal(supId, canal) {
  _supCanais[supId] = canal;
  _saveCanais();
  // Atualiza visual do card
  ['whatsapp','email','manual'].forEach(c => {
    const btn = document.getElementById(`canal-${supId}-${c}`);
    if (!btn) return;
    const isActive = c === canal;
    btn.style.background   = isActive ? 'var(--purple)' : 'var(--surface)';
    btn.style.color        = isActive ? '#fff' : 'var(--text2)';
    btn.style.borderColor  = isActive ? 'var(--purple)' : 'var(--border)';
  });
}

function renderDispatchSups() {
  const container = document.getElementById('dispatchSupList');
  if (!suppliers.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>Nenhum fornecedor cadastrado. <a href="#" onclick="goModule('cadastros')" style="color:var(--purple)">Cadastre aqui</a>.</div>`;
    return;
  }

  const selItemIds = getSelItems().map(si => si.itemId);
  const filtSups = suppliers.filter(s => {
    const supItems = items.filter(i => i.supId === s.id).map(i => i.id);
    if (!supItems.length) return true;
    return supItems.some(id => selItemIds.includes(id));
  });

  if (!filtSups.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>Nenhum fornecedor vinculado aos insumos selecionados. <a href="#" onclick="goModule('cadastros')" style="color:var(--purple)">Cadastre aqui</a>.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px;background:var(--surface2);border-radius:var(--r8);padding:8px 12px">
      Selecione os fornecedores e escolha o canal de cada cotação. Você poderá inserir as respostas manualmente no Mapa de Cotação.
    </div>
    ${filtSups.map(s => {
      const si         = items.filter(i => i.supId === s.id && selItemIds.includes(i.id));
      const dispatched = cycle?.dispatches?.find(d => d.supId === s.id);
      const canal      = _supCanais[s.id] || (s.phone ? 'whatsapp' : 'manual');
      // Pré-seleciona canal padrão se não definido
      if (!_supCanais[s.id]) { _supCanais[s.id] = canal; }

      const canalLabels = {
        whatsapp: { icon: '💬', label: 'WhatsApp', color: '#25D366' },
        email:    { icon: '📧', label: 'E-mail',   color: 'var(--purple)' },
        manual:   { icon: '📞', label: 'Manual',   color: 'var(--orange-dark)' },
      };

      return `<div class="dispatch-card" style="flex-direction:column;gap:10px;padding:14px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <input type="checkbox" class="sup-chk" value="${s.id}" ${si.length || dispatched ? 'checked' : ''}
            style="accent-color:var(--purple);width:16px;height:16px;margin-top:3px;flex-shrink:0">
          <div style="flex:1">
            <div style="font-size:.88rem;font-weight:700">${s.name}</div>
            <div style="font-size:.71rem;color:var(--muted);margin-top:2px">
              ${s.seller ? `👤 ${s.seller}` : ''}
              ${s.phone  ? ` · 📞 ${s.phone}` : ''}
              ${s.email  ? ` · ✉️ ${s.email}` : ''}
            </div>
            ${si.length
              ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${si.map(i => `<span class="badge b-purple" style="font-size:.6rem">${i.name}</span>`).join('')}</div>`
              : '<div style="font-size:.68rem;color:var(--muted);margin-top:4px">Receberá todos os itens selecionados</div>'}
          </div>
          ${dispatched ? `<span class="badge b-green" style="flex-shrink:0">✓ Enviado</span>` : ''}
        </div>
        <!-- Canal de cotação -->
        <div style="display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px solid var(--border)">
          <span style="font-size:.68rem;color:var(--muted);font-weight:600;margin-right:4px">Canal:</span>
          ${['whatsapp','email','manual'].map(c => {
            const isActive = canal === c;
            const cl = canalLabels[c];
            const disabled = c === 'whatsapp' && !s.phone ? 'opacity:.4;cursor:not-allowed' : '';
            return `<button id="canal-${s.id}-${c}" onclick="setSupCanal(${s.id},'${c}')"
              style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:.72rem;font-weight:600;border:1.5px solid ${isActive ? 'var(--purple)' : 'var(--border)'};background:${isActive ? 'var(--purple)' : 'var(--surface)'};color:${isActive ? '#fff' : 'var(--text2)'};cursor:pointer;transition:all .15s;${disabled}">
              ${cl.icon} ${cl.label}
            </button>`;
          }).join('')}
          ${canal === 'manual' ? `<span style="font-size:.65rem;color:var(--muted);margin-left:4px">Você inserirá a cotação manualmente no Mapa</span>` : ''}
          ${canal === 'email' && s.email ? `<span style="font-size:.65rem;color:var(--muted);margin-left:4px">${s.email}</span>` : ''}
        </div>
      </div>`;
    }).join('')}`;
  _saveCanais();
}

function getSelPresenciais() { return []; } // mantido por compatibilidade

function getSelItems() {
  return [...document.querySelectorAll('.buy-chk:checked')].map(c => {
    const id  = parseInt(c.value);
    const qty = parseFloat(document.getElementById(`bq-${id}`)?.value) || gneed(items.find(i => i.id === id));
    return { itemId: id, qty };
  });
}

function getSelSups() {
  return [...document.querySelectorAll('.sup-chk:checked')].map(c => parseInt(c.value));
}

function dispatchSelected() {
  const selItems = getSelItems();
  const selSups  = getSelSups();
  if (!selItems.length) { toast('Selecione pelo menos um item', 'err'); return; }
  if (!selSups.length)  { toast('Selecione pelo menos um fornecedor', 'err'); return; }
  const deadline  = document.getElementById('cfgDeadline').value;
  const delivery  = document.getElementById('cfgDelivery').value;
  const payTerm   = document.getElementById('cfgPayTerm').value;
  const payMethod = document.getElementById('cfgPayMethod').value;
  const obs       = document.getElementById('cfgObs').value;
  if (!deadline) { toast('Defina o prazo para resposta', 'err'); return; }

  if (!cycle) {
    cycle = { id: 'CIC' + Date.now(), deadline, deliveryDate: delivery, payTerm, payMethod, obs, items: selItems, dispatches: [], status: 'open', createdAt: new Date().toISOString() };
  } else {
    cycle.deadline     = deadline;
    cycle.deliveryDate = delivery;
    cycle.payTerm      = payTerm;
    cycle.payMethod    = payMethod;
    cycle.obs          = obs;
    cycle.items        = selItems;
  }

  const newDisps = [];
  selSups.forEach(supId => {
    const exist = cycle.dispatches?.find(d => d.supId === supId);
    if (!exist) {
      const token      = genToken();
      const supItemIds = items.filter(i => i.supId === supId).map(i => i.id);
      const relItems   = supItemIds.length ? selItems.filter(si => supItemIds.includes(si.itemId)) : selItems;
      newDisps.push({ supId, token, sentAt: new Date().toISOString(), status: 'sent', itemIds: relItems.map(i => i.itemId) });
    } else {
      exist.sentAt = new Date().toISOString();
      exist.status = 'sent';
    }
  });
  cycle.dispatches = [...(cycle.dispatches || []), ...newDisps];
  saveC();

  // Abre WA apenas para fornecedores com canal WhatsApp
  const waDisps = newDisps.filter(d => d.canal === 'whatsapp');
  if (waDisps.length) {
    showWAMessages(waDisps, selItems, deadline, delivery, payTerm, payMethod, obs);
  }

  // Notifica canais manuais/email
  const manualDisps = newDisps.filter(d => d.canal !== 'whatsapp');
  if (manualDisps.length && !waDisps.length) {
    const names = manualDisps.map(d => suppliers.find(s => s.id === d.supId)?.name).join(', ');
    toast(`✅ ${manualDisps.length} fornecedor(es) registrado(s) para cotação manual: ${names}`);
    goStep(3);
  }

  if (!newDisps.length) {
    toast('Todos os fornecedores já foram registrados neste ciclo', 'info');
    goStep(3);
  }

  document.getElementById('snav2').classList.add('done');
  document.getElementById('snum2').textContent = '✓';
  _renderComprasDashboard();
}

function showWAMessages(disps, selItems, deadline, delivery, payTerm, payMethod, obs) {
  if (!disps.length) { toast('Todos os fornecedores já foram contactados', 'info'); goStep(3); return; }
  // Cotação recebida diretamente pelo WhatsApp — inserida manualmente no mapa
  const itemLines = selItems.map(si => {
    const item = items.find(i => i.id === si.itemId);
    const b    = (item?.brands || []).filter(x => x);
    return `• ${item?.name} — ${si.qty} ${item?.unit}${b[0] ? ' (marca: ' + b[0] + ')' : ''}`;
  }).join('\n');

  document.getElementById('respTitle').textContent = `💬 Mensagens para enviar`;
  document.getElementById('respBody').innerHTML = `
    <div style="background:var(--green-light);border:1.5px solid #86EFAC;border-radius:var(--r8);padding:12px 14px;font-size:.77rem;color:var(--green);font-weight:600;margin-bottom:12px">
      ✅ Ciclo aberto! Abra o WhatsApp e envie as mensagens abaixo para cada fornecedor.
    </div>
    ${disps.map(d => {
      const sup   = suppliers.find(s => s.id === d.supId);
      // Monta mensagem com instruções para responder via WhatsApp
      const msg   = `Olá ${sup?.seller || sup?.name}! 👋\n\nA *Vai Ter Pizza!* solicita sua cotação para os itens abaixo. Por favor, responda com preço unitário, marca e prazo de entrega de cada item:\n\n${itemLines}\n\n📅 *Prazo para cotação:* ${fmtDT(deadline)}\n🚚 *Entrega desejada:* ${fmtD(delivery)}\n💳 *Pagamento:* ${payTerm} — ${payMethod}\n${obs ? '\n📝 ' + obs + '\n' : ''}\nResponda neste mesmo WhatsApp com os preços. Obrigado! 🍕`;
      const waUrl = `https://wa.me/55${(sup?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
      return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:14px;margin-bottom:10px">
        <div style="font-weight:700;font-size:.86rem;margin-bottom:8px">🏢 ${sup?.name} ${sup?.seller ? '· ' + sup.seller : ''}</div>
        <div style="background:var(--surface2);border-radius:var(--r6);padding:10px;font-size:.72rem;font-family:monospace;white-space:pre-wrap;color:var(--text2);max-height:120px;overflow-y:auto;margin-bottom:10px">${msg}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${sup?.phone ? `<a href="${waUrl}" target="_blank" class="btn btn-wa btn-sm">💬 Abrir WhatsApp</a>` : ''}
          <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${d.token}');toast('Token copiado!','info')">📋 Token: ${d.token}</button>
          <button class="btn btn-orange btn-sm" onclick="openSimResponse('${d.token}')">🧪 Simular Resposta</button>
        </div>
      </div>`;
    }).join('')}`;
  document.getElementById('respFoot').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('ovResponse')">Fechar</button>
    <button class="btn btn-primary" onclick="closeModal('ovResponse');goStep(3)">Ver Mapa de Cotação →</button>`;
  document.getElementById('ovResponse').classList.add('open');
}

// ── STEP 2B: Simular resposta ──
// Inserção manual de cotação (fornecedor respondeu por telefone/outra via)
function openManualResponse(token) {
  const dispatch = cycle?.dispatches?.find(d => d.token === token);
  if (!dispatch) return;
  const sup       = suppliers.find(s => s.id === dispatch.supId);
  const selItems  = dispatch.itemIds?.length
    ? cycle.items.filter(ci => dispatch.itemIds.includes(ci.itemId))
    : cycle.items;

  document.getElementById('respTitle').textContent = `✏️ Inserir cotação — ${sup?.name}`;
  document.getElementById('respBody').innerHTML = `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 12px;font-size:.76rem;color:var(--text2);margin-bottom:12px">
      <strong>📞 Resposta manual</strong> — use quando o fornecedor respondeu por telefone, e-mail ou outra via.
    </div>
    <div class="f2" style="margin-bottom:10px">
      <div class="field"><label>Forma de pagamento</label>
        <select class="inp" id="rPayTerm">
          <option>30 dias</option><option>28 dias</option><option>21 dias</option>
          <option>14 dias</option><option>7 dias</option><option>À vista</option>
        </select>
      </div>
      <div class="field"><label>Modalidade</label>
        <select class="inp" id="rPayMethod">
          <option>Boleto</option><option>PIX</option><option>Cartão</option><option>Dinheiro</option>
        </select>
      </div>
    </div>
    <div class="field" style="margin-bottom:12px"><label>Observação</label><input class="inp" id="rNote" placeholder="ex: respondeu por telefone às 14h"></div>
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Preços por item</div>
    <div style="display:flex;flex-direction:column;gap:6px" id="rItemsManual">
      ${selItems.map(ci => {
        const item = items.find(i => i.id === ci.itemId);
        const existing = responses[token]?.items?.find(x => x.itemId === ci.itemId);
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface)">
          <div style="flex:1">
            <div style="font-size:.8rem;font-weight:600">${item?.name}</div>
            <div style="font-size:.65rem;color:var(--muted)">${ci.qty} ${item?.unit} necessários · ref R$${fmt(item?.cost || 0)}/un</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" placeholder="Marca" style="width:90px;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.74rem;font-family:Inter,sans-serif"
              id="rm-brand-${ci.itemId}" value="${existing?.brand || ''}">
            <div style="position:relative">
              <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:.7rem;color:var(--muted)">R$</span>
              <input type="number" placeholder="0,00" step="0.01" min="0"
                style="width:80px;padding:4px 7px 4px 24px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;font-weight:600;font-family:monospace"
                id="rm-price-${ci.itemId}" value="${existing?.unitPrice || ''}"
                oninput="updateManualTotal(${ci.itemId},${ci.qty})">
            </div>
            <div style="font-size:.72rem;font-weight:700;color:var(--purple);font-family:monospace;min-width:60px;text-align:right" id="rm-total-${ci.itemId}">
              ${existing?.unitPrice ? 'R$' + fmt(existing.unitPrice * ci.qty) : '—'}
            </div>
            <div style="font-size:.58rem;color:var(--muted)" id="rm-dias-wrap-${ci.itemId}">
              <input type="number" placeholder="dias" min="1" max="90"
                style="width:48px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem;text-align:center;font-family:monospace"
                id="rm-days-${ci.itemId}" value="${existing?.deliveryDays || 1}">
              <div style="text-align:center;font-size:.58rem;color:var(--muted)">dias</div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:12px;padding:10px 12px;background:var(--surface2);border-radius:var(--r8);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.8rem;font-weight:600;color:var(--text2)">Total da cotação:</span>
      <span style="font-size:1rem;font-weight:800;color:var(--purple);font-family:monospace" id="rmGrandTotal">—</span>
    </div>`;

  document.getElementById('respFoot').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('ovResponse')">Cancelar</button>
    <button class="btn btn-primary" onclick="submitManualResponse('${token}')">✅ Confirmar cotação</button>`;
  document.getElementById('ovResponse').classList.add('open');

  // Calcula totais iniciais
  selItems.forEach(ci => updateManualTotal(ci.itemId, ci.qty));
}

function updateManualTotal(itemId, qty) {
  const price = parseFloat(document.getElementById(`rm-price-${itemId}`)?.value) || 0;
  const el = document.getElementById(`rm-total-${itemId}`);
  if (el) el.textContent = price > 0 ? 'R$' + fmt(price * qty) : '—';
  // Atualiza grand total
  const allPrices = document.querySelectorAll('[id^="rm-price-"]');
  let grand = 0;
  allPrices.forEach(inp => {
    const iid = parseInt(inp.id.replace('rm-price-',''));
    const ci  = cycle?.items?.find(c => c.itemId === iid);
    grand += (parseFloat(inp.value) || 0) * (ci?.qty || 0);
  });
  const gtEl = document.getElementById('rmGrandTotal');
  if (gtEl) gtEl.textContent = grand > 0 ? 'R$ ' + fmt(grand) : '—';
}

function submitManualResponse(token) {
  const dispatch = cycle?.dispatches?.find(d => d.token === token);
  if (!dispatch) return;
  const selItems = dispatch.itemIds?.length
    ? cycle.items.filter(ci => dispatch.itemIds.includes(ci.itemId))
    : cycle.items;

  const respItems = selItems.map(ci => {
    const price = parseFloat(document.getElementById(`rm-price-${ci.itemId}`)?.value) || 0;
    return {
      itemId:       ci.itemId,
      unitPrice:    price,
      brand:        document.getElementById(`rm-brand-${ci.itemId}`)?.value?.trim() || '',
      deliveryDays: parseInt(document.getElementById(`rm-days-${ci.itemId}`)?.value) || 1,
      qty:          ci.qty,
    };
  }).filter(r => r.unitPrice > 0);

  if (!respItems.length) { toast('Insira pelo menos um preço', 'err'); return; }

  responses[token] = {
    supId:       dispatch.supId,
    token,
    items:       respItems,
    payTerm:     document.getElementById('rPayTerm')?.value   || '30 dias',
    payMethod:   document.getElementById('rPayMethod')?.value || 'Boleto',
    note:        (document.getElementById('rNote')?.value     || '') + ' [manual]',
    submittedAt: new Date().toISOString(),
    isManual:    true,
  };
  dispatch.status = 'responded';
  saveR(); saveC();
  closeModal('ovResponse');
  toast('✅ Cotação registrada manualmente!');
  _renderCotacoesAbertas();
  renderMapaStatus();
  setTab3(currentTab3);
  renderDashboard();
}

function openSimResponse(token) {
  const dispatch   = cycle?.dispatches?.find(d => d.token === token);
  if (!dispatch) return;
  const sup        = suppliers.find(s => s.id === dispatch.supId);
  const itemIds    = dispatch.itemIds || cycle.items.map(i => i.itemId);
  const cycleItems = cycle.items.filter(ci => itemIds.includes(ci.itemId));
  const existing   = responses[token] || {};
  document.getElementById('respTitle').textContent = `🧪 Simular: ${sup?.name}`;
  document.getElementById('respBody').innerHTML = `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 12px;font-size:.75rem;margin-bottom:10px">
      Prazo: <strong>${fmtDT(cycle.deadline)}</strong> · Pagamento: <strong>${cycle.payTerm}</strong>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Produto</th><th class="c">Qtd.</th><th>Marca</th><th class="r">Preço unit.</th><th class="c">Entrega (dias)</th></tr></thead>
      <tbody>
        ${cycleItems.map(ci => {
          const item = items.find(i => i.id === ci.itemId);
          const b    = (item?.brands || []).filter(x => x);
          const prev = existing.items?.find(r => r.itemId === ci.itemId) || {};
          const brandOpts = b.map((br, i2) => `<option value="${br}"${prev.brand === br ? ' selected' : ''}>${i2 === 0 ? '⭐ ' + br : br}</option>`).join('');
          return `<tr>
            <td><div class="iname">${item?.name}</div></td>
            <td class="c" style="font-family:monospace;font-size:.75rem">${ci.qty} ${item?.unit}</td>
            <td>
              ${b.length
                ? `<select style="padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.75rem;background:var(--surface2);outline:none" id="rb-${ci.itemId}">
                     <option value="">Selecionar...</option>${brandOpts}
                   </select>`
                : `<input type="text" id="rb-${ci.itemId}" value="${prev.brand || ''}" style="width:120px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.75rem;background:var(--surface2);outline:none">`}
            </td>
            <td class="r">
              <input type="number" id="rp-${ci.itemId}" value="${prev.unitPrice || item?.cost}" min="0" step="0.01"
                style="width:80px;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:monospace;font-size:.79rem;text-align:right;background:var(--surface2);outline:none">
            </td>
            <td class="c">
              <input type="number" id="rd-${ci.itemId}" value="${prev.deliveryDays || 3}" min="0" max="60"
                style="width:50px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:monospace;font-size:.77rem;text-align:center;background:var(--surface2);outline:none">
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div class="f2" style="margin-top:10px">
      <div class="field"><label>Prazo de pagamento</label>
        <select class="inp" id="rPayTerm"><option>À vista</option><option>7 dias</option><option>14 dias</option><option selected>28 dias</option><option>30 dias</option></select>
      </div>
      <div class="field"><label>Forma de pagamento</label>
        <select class="inp" id="rPayMethod"><option>PIX</option><option>Boleto</option><option>Transferência</option></select>
      </div>
    </div>
    <div class="field"><label>Observação do fornecedor</label>
      <textarea class="inp" id="rNote" rows="2" placeholder="Observações...">${existing.note || ''}</textarea>
    </div>`;
  document.getElementById('respFoot').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('ovResponse')">Cancelar</button>
    <button class="btn btn-primary" onclick="submitSimResponse('${token}')">✅ Confirmar Resposta</button>`;
  document.getElementById('ovResponse').classList.add('open');
}

function submitSimResponse(token) {
  const dispatch   = cycle?.dispatches?.find(d => d.token === token);
  if (!dispatch) return;
  const itemIds    = dispatch.itemIds || cycle.items.map(i => i.itemId);
  const cycleItems = cycle.items.filter(ci => itemIds.includes(ci.itemId));
  const respItems  = cycleItems.map(ci => {
    const item = items.find(i => i.id === ci.itemId);
    return {
      itemId:       ci.itemId,
      qty:          ci.qty,
      brand:        document.getElementById(`rb-${ci.itemId}`)?.value || '',
      unitPrice:    parseFloat(document.getElementById(`rp-${ci.itemId}`)?.value) || item?.cost,
      deliveryDays: parseInt(document.getElementById(`rd-${ci.itemId}`)?.value) || 3,
    };
  });
  responses[token] = {
    supId:       dispatch.supId,
    token,
    items:       respItems,
    payTerm:     document.getElementById('rPayTerm')?.value   || cycle.payTerm,
    payMethod:   document.getElementById('rPayMethod')?.value || cycle.payMethod,
    note:        document.getElementById('rNote')?.value      || '',
    submittedAt: new Date().toISOString(),
  };
  dispatch.status = 'responded';
  saveR(); saveC();
  closeModal('ovResponse');
  toast('✅ Resposta registrada!');
  _renderComprasDashboard();
  renderMapaStatus();
  setTab3(currentTab3);
  renderDashboard();
}

// ── STEP 3: Mapa de cotação ──
function renderMapaStatus() {
  if (!cycle) {
    document.getElementById('mapaStatus').innerHTML = `<div class="empty"><div class="empty-icon">📋</div>Nenhum ciclo ativo.</div>`;
    return;
  }
  const disps      = cycle.dispatches || [];
  const responded  = disps.filter(d => d.status === 'responded').length;
  const total      = disps.length;
  const deadlineMs = new Date(cycle.deadline) - Date.now();
  const hoursLeft  = Math.max(0, Math.floor(deadlineMs / 3600000));
  const isExp      = deadlineMs < 0;

  document.getElementById('mapaStatus').innerHTML = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:.88rem;font-weight:700">Ciclo ${cycle.id}</div>
        <div style="font-size:.71rem;color:var(--muted)">Criado ${fmtDT(cycle.createdAt)} · Prazo: ${fmtDT(cycle.deadline)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:var(--r6);font-family:monospace;font-size:.79rem;background:${isExp ? 'var(--green-light)' : hoursLeft < 6 ? 'var(--red-light)' : 'var(--yellow-light)'};color:${isExp ? 'var(--green)' : hoursLeft < 6 ? 'var(--red)' : 'var(--yellow)'}">
        ⏱ ${isExp ? 'Encerrado' : `${hoursLeft}h restantes`}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800">${total}</div><div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Enviados</div></div>
        <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--green)">${responded}</div><div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Respondidos</div></div>
        <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--yellow)">${total - responded}</div><div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Pendentes</div></div>
        <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--purple)">${Object.keys(approvals).length}</div><div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Aprovados</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${disps.filter(d => d.status !== 'responded').map(d =>
          `<div style="display:flex;gap:5px">
             <button class="btn btn-primary btn-sm" onclick="openManualResponse('${d.token}')">✏️ ${sname(d.supId)}</button>
             <button class="btn btn-orange btn-sm" onclick="openSimResponse('${d.token}')">🧪</button>
           </div>`
        ).join('')}
      </div>
    </div>`;
}

function setTab3(tab) {
  currentTab3 = tab;
  ['compare', 'suppliers', 'approval'].forEach(t => {
    document.getElementById(`tab3-${t}`).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById(`tab3${{ compare: 'a', suppliers: 'b', approval: 'c' }[t]}`);
    if (btn) {
      btn.style.color            = t === tab ? 'var(--purple)' : 'var(--muted)';
      btn.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent';
    }
  });
  if (tab === 'compare')   renderCompareTab();
  else if (tab === 'suppliers') renderSuppliersTab();
  else renderApprovalTab();
}

function renderCompareTab() {
  const el         = document.getElementById('tab3-compare');
  const respTokens = Object.keys(responses);
  if (!respTokens.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div>Nenhuma cotação recebida ainda.<br>
      ${(cycle?.dispatches||[]).filter(d=>d.status!=='responded').length > 0
        ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center">
            ${(cycle.dispatches||[]).filter(d=>d.status!=='responded').map(d =>
              `<button class="btn btn-primary btn-sm" onclick="openManualResponse('${d.token}')">✏️ Inserir: ${sname(d.supId)}</button>`
            ).join('')}
           </div>` : ''}
    </div>`;
    return;
  }

  const cycleItemIds = [...new Set(cycle.items.map(i => i.itemId))];
  const respSups     = respTokens.map(t => ({ token: t, ...responses[t] }));

  const totalPrev  = cycle.items.reduce((s, ci) => { const item = items.find(i => i.id === ci.itemId); return s + ci.qty * (item?.cost || 0); }, 0);
  const totalAprov = Object.entries(approvals).reduce((s, [itemId, ap]) => {
    const resp = responses[ap.token];
    const ri   = resp?.items?.find(x => x.itemId === parseInt(itemId));
    const ci   = cycle.items.find(c => c.itemId === parseInt(itemId));
    return s + (ri?.unitPrice || 0) * (ci?.qty || 0);
  }, 0);
  const economia = totalPrev - totalAprov;

  // Separa itens com múltiplas cotações vs. única cotação
  const itemsMulti   = cycleItemIds.filter(id => respSups.filter(r => r.items?.find(x => x.itemId === id)).length > 1);
  const itemsSingle  = cycleItemIds.filter(id => respSups.filter(r => r.items?.find(x => x.itemId === id)).length === 1);
  const itemsNone    = cycleItemIds.filter(id => respSups.filter(r => r.items?.find(x => x.itemId === id)).length === 0);

  el.innerHTML = `
    ${Object.keys(approvals).length > 0 ? `
      <div style="background:var(--green-light);border:1.5px solid #86EFAC;border-radius:var(--r10);padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div><div style="font-weight:700;color:var(--green);font-size:.84rem">💰 Economia gerada neste ciclo</div>
        <div style="font-size:.72rem;color:var(--green);margin-top:2px">Comparado ao custo de referência</div></div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--green)">R$ ${fmt(Math.max(0, economia))}</div>
      </div>` : ''}

    ${itemsMulti.length > 0 ? `
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">
        🏆 Comparativo de preços <span class="badge b-purple" style="font-size:.6rem">${itemsMulti.length} produto(s) com mais de 1 cotação</span>
      </div>
      <div style="font-size:.7rem;color:var(--muted);margin-bottom:10px">Score = preço (50%) + prazo entrega (30%) + pagamento (20%)</div>
      <div class="tbl-wrap" style="overflow-x:auto;margin-bottom:20px"><table>
        <thead><tr>
          <th style="min-width:140px">Produto</th>
          <th class="c">Qtd.</th>
          ${respSups.map(r => `<th class="c" style="min-width:160px">${sname(r.supId)}${r.isManual?'<br><span style="font-size:.6rem;color:var(--muted)">manual</span>':''}</th>`).join('')}
          <th class="c">Melhor</th>
        </tr></thead>
        <tbody>
        ${itemsMulti.map(itemId => {
          const item     = items.find(i => i.id === itemId);
          const ci       = cycle.items.find(c => c.itemId === itemId);
          const opts     = respSups.map(r => ({ ...r, ri: r.items?.find(x => x.itemId === itemId) })).filter(r => r.ri);
          const prices   = opts.map(r => r.ri.unitPrice), dels = opts.map(r => r.ri.deliveryDays);
          const minP = Math.min(...prices), maxP = Math.max(...prices), minD = Math.min(...dels), maxD = Math.max(...dels);
          const scored   = opts.map(r => ({ ...r, score: calcScore(r.ri.unitPrice, r.ri.deliveryDays, r.payTerm, minP, maxP, minD, maxD) })).sort((a,b) => b.score-a.score);
          const approved = approvals[itemId];
          return `<tr>
            <td><div class="iname">${item?.name}</div><div class="isub">${item?.cat} · ref R$${fmt(item?.cost||0)}</div></td>
            <td class="c" style="font-size:.78rem">${ci?.qty} ${item?.unit}</td>
            ${respSups.map(r => {
              const ri = r.items?.find(x => x.itemId === itemId);
              if (!ri) return `<td class="c"><span style="color:var(--muted);font-size:.72rem">Sem resposta</span></td>`;
              const sc = scored.find(s => s.token === r.token);
              const isApp = approved?.token === r.token;
              const isBest = scored[0]?.token === r.token;
              return `<td class="c" style="background:${isApp?'var(--green-light)':isBest?'var(--purple-xlight)':''}">
                <div style="font-family:monospace;font-weight:700;font-size:.88rem;color:${isApp?'var(--green)':isBest?'var(--purple)':'var(--text)'}">R$${fmt(ri.unitPrice)}</div>
                <div style="font-size:.64rem;color:var(--muted)">${ri.brand||'—'} · ${ri.deliveryDays}d</div>
                <div style="font-size:.62rem;font-weight:700;color:${isBest?'var(--purple)':'var(--muted)'}">score ${sc?.score||0}</div>
                ${isApp
                  ? `<span class="badge b-green" style="font-size:.58rem;margin-top:3px">✓ Aprovado</span>`
                  : `<button class="btn btn-primary btn-xs" style="margin-top:4px" onclick="approveItem(${itemId},'${r.token}')">Aprovar</button>`}
              </td>`;
            }).join('')}
            <td class="c"><div style="font-size:.78rem;font-weight:700;color:var(--purple)">${sname(scored[0]?.supId)}</div><div style="font-size:.62rem;color:var(--muted)">Score ${scored[0]?.score}</div></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>` : ''}

    ${itemsSingle.length > 0 ? `
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">
        📋 Cotação única <span class="badge b-gray" style="font-size:.6rem">${itemsSingle.length} produto(s) com 1 fornecedor</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
        ${itemsSingle.map(itemId => {
          const item     = items.find(i => i.id === itemId);
          const ci       = cycle.items.find(c => c.itemId === itemId);
          const r        = respSups.find(r => r.items?.find(x => x.itemId === itemId));
          const ri       = r?.items?.find(x => x.itemId === itemId);
          const approved = approvals[itemId];
          const isApp    = approved?.token === r?.token;
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid ${isApp?'var(--green)':'var(--border)'};border-radius:var(--r8);background:${isApp?'var(--green-light)':'var(--surface)'}">
            <div style="flex:1">
              <div style="font-size:.82rem;font-weight:600">${item?.name}</div>
              <div style="font-size:.67rem;color:var(--muted)">${ci?.qty} ${item?.unit} · ${sname(r?.supId)} · ${ri?.brand||'—'} · ${ri?.deliveryDays}d</div>
            </div>
            <div style="text-align:right">
              <div style="font-family:monospace;font-weight:700">R$${fmt(ri?.unitPrice||0)}</div>
              <div style="font-size:.65rem;color:var(--muted)">total R$${fmt((ri?.unitPrice||0)*(ci?.qty||0))}</div>
            </div>
            ${isApp
              ? `<span class="badge b-green">✓ Aprovado</span>`
              : `<button class="btn btn-primary btn-sm" onclick="approveItem(${itemId},'${r?.token}')">Aprovar</button>`}
          </div>`;
        }).join('')}
      </div>` : ''}

    ${itemsNone.length > 0 ? `
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--red);margin-bottom:8px">
        ⏳ Aguardando cotação <span class="badge b-red" style="font-size:.6rem">${itemsNone.length} produto(s)</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${itemsNone.map(itemId => {
          const item = items.find(i => i.id === itemId);
          const ci   = cycle.items.find(c => c.itemId === itemId);
          const pend = (cycle.dispatches||[]).filter(d => d.status !== 'responded' && (d.itemIds?.includes(itemId) || !d.itemIds?.length));
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface2)">
            <div style="flex:1"><div style="font-size:.8rem;font-weight:600">${item?.name}</div>
            <div style="font-size:.65rem;color:var(--muted)">${ci?.qty} ${item?.unit}</div></div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${pend.map(d => `<button class="btn btn-primary btn-xs" onclick="openManualResponse('${d.token}')">✏️ ${sname(d.supId)}</button>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

    <!-- Botão enviar para aprovador -->
    <div style="margin-top:16px;padding-top:14px;border-top:2px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div style="font-size:.75rem;color:var(--muted)">
        ${Object.keys(approvals).length} de ${cycleItemIds.length} itens aprovados
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Object.keys(approvals).length < cycleItemIds.length && respTokens.length > 0
          ? `<button class="btn btn-outline btn-sm" onclick="enviarParaAprovador()" title="Notifica o aprovador que as cotações estão prontas para análise">
               📤 Enviar para aprovador
             </button>` : ''}
        ${Object.keys(approvals).length > 0
          ? `<button class="btn btn-primary" onclick="goStep(4)">Gerar Ordem de Compra →</button>` : ''}
      </div>
    </div>`;
}
function renderSuppliersTab() {
  const el    = document.getElementById('tab3-suppliers');
  const disps = cycle?.dispatches || [];
  if (!disps.length) { el.innerHTML = `<div class="empty">Nenhum fornecedor contactado.</div>`; return; }
  el.innerHTML = disps.map(d => {
    const sup   = suppliers.find(s => s.id === d.supId);
    const resp  = responses[d.token];
    const isExp = new Date(cycle.deadline) < new Date();
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <div class="card-title">🏢 ${sup?.name || '?'} ${sup?.seller ? '· ' + sup.seller : ''}</div>
        <div style="display:flex;gap:8px;align-items:center">
          ${resp
            ? `<span class="badge b-green">✅ ${fmtDT(resp.submittedAt)}</span>`
            : `<span class="badge ${isExp ? 'b-red' : 'b-yellow'}">${isExp ? '⏰ Expirado' : '⏳ Aguardando'}</span>`}
          ${!resp ? `<button class="btn btn-orange btn-sm" onclick="openSimResponse('${d.token}')">🧪 Simular</button>` : ''}
        </div>
      </div>
      ${resp
        ? `<div class="card-body">
             <div style="font-size:.74rem;color:var(--muted);margin-bottom:10px">${resp.payTerm} · ${resp.payMethod}${resp.note ? ' · ' + resp.note : ''}</div>
             <div class="tbl-wrap"><table>
               <thead><tr><th>Produto</th><th class="c">Qtd.</th><th>Marca</th><th class="r">Unit.</th><th class="r">Total</th><th class="c">Entrega</th></tr></thead>
               <tbody>
                 ${resp.items.map(ri => {
                   const item = items.find(i => i.id === ri.itemId);
                   return `<tr>
                     <td><div class="iname">${item?.name}</div></td>
                     <td class="c" style="font-family:monospace;font-size:.74rem">${ri.qty} ${item?.unit}</td>
                     <td style="font-size:.75rem">${ri.brand || '—'}</td>
                     <td class="r" style="font-family:monospace;font-weight:600">R$${fmt(ri.unitPrice)}</td>
                     <td class="r" style="font-family:monospace">R$${fmt(ri.qty * ri.unitPrice)}</td>
                     <td class="c" style="font-family:monospace;font-size:.74rem">${ri.deliveryDays}d</td>
                   </tr>`;
                 }).join('')}
                 <tr style="background:var(--surface2)">
                   <td colspan="4" style="font-weight:700;font-size:.8rem">Total</td>
                   <td class="r" style="font-family:monospace;font-weight:800;color:var(--purple)">R$${fmt(resp.items.reduce((s, r) => s + r.qty * r.unitPrice, 0))}</td>
                   <td></td>
                 </tr>
               </tbody>
             </table></div>
           </div>`
        : `<div class="card-body"><div style="display:flex;align-items:center;justify-content:space-between"><span style="color:var(--muted);font-size:.8rem">Aguardando resposta...</span><button class="btn btn-primary btn-sm" onclick="openManualResponse('${d.token}')">✏️ Inserir cotação</button></div></div>`}
    </div>`;
  }).join('');
}

// Notificação para aprovador
function enviarParaAprovador() {
  const gerentes = users.filter(u => u.role === 'gerente' || u.role === 'supervisor');
  const aprovados = Object.keys(approvals).length;
  const total     = cycle?.items?.length || 0;
  const msg = `As cotações do ciclo ${cycle?.id} estão prontas para aprovação.

${aprovados} de ${total} itens já com proposta selecionada.

Acesse o sistema para aprovar: yuripappas.github.io/vtp-compras/`;

  // Salva notificação
  const notifs = JSON.parse(localStorage.getItem('vtp_notifs') || '[]');
  notifs.push({ type: 'aprovacao', msg, date: new Date().toISOString(), cycleId: cycle?.id, read: false });
  localStorage.setItem('vtp_notifs', JSON.stringify(notifs));

  // Abre WhatsApp do gerente/supervisor se tiver número
  const cfgWa = localStorage.getItem('vtp_wa_empresa');
  if (cfgWa) {
    window.open(`https://wa.me/55${cfgWa.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
    toast('✅ Aprovador notificado via WhatsApp!');
  } else {
    navigator.clipboard.writeText(msg).then(() => toast('📋 Mensagem copiada! Envie para o aprovador.', 'info'));
  }
}

function renderApprovalTab() {
  const el           = document.getElementById('tab3-approval');
  const cycleItemIds = [...new Set(cycle?.items.map(i => i.itemId) || [])];
  const respTokens   = Object.keys(responses);
  if (!respTokens.length) { el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div>Nenhuma cotação recebida.</div>`; return; }

  el.innerHTML = `
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:12px">Aprove item a item escolhendo o melhor fornecedor. O score considera preço, entrega e pagamento.</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${cycleItemIds.map(itemId => {
        const item     = items.find(i => i.id === itemId);
        const ci       = cycle.items.find(c => c.itemId === itemId);
        const approved = approvals[itemId];
        const opts     = respTokens
          .map(t => ({ token: t, ...responses[t] }))
          .map(r => ({ ...r, ri: r.items?.find(x => x.itemId === itemId) }))
          .filter(r => r.ri);

        if (!opts.length) return `<div style="padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface2)">
          <div style="font-size:.82rem;font-weight:600;color:var(--muted)">${item?.name}</div>
          <div style="font-size:.68rem;color:var(--muted)">Aguardando cotação...</div>
          <div style="display:flex;gap:4px;margin-top:6px">
            ${(cycle.dispatches||[]).filter(d=>d.status!=='responded').map(d =>
              `<button class="btn btn-primary btn-xs" onclick="openManualResponse('${d.token}')">✏️ Inserir: ${sname(d.supId)}</button>`
            ).join('')}
          </div>
        </div>`;

        const prices     = opts.map(r => r.ri.unitPrice);
        const deliveries = opts.map(r => r.ri.deliveryDays);
        const minP = Math.min(...prices), maxP = Math.max(...prices);
        const minD = Math.min(...deliveries), maxD = Math.max(...deliveries);
        const scored = opts.map(r => ({ ...r, score: calcScore(r.ri.unitPrice, r.ri.deliveryDays, r.payTerm, minP, maxP, minD, maxD) }))
                           .sort((a, b) => b.score - a.score);

        return `<div class="card">
          <div class="card-header">
            <div class="card-title">${item?.name}</div>
            <div style="font-size:.72rem;color:var(--muted)">${ci?.qty} ${item?.unit} · ref R$${fmt(item?.cost || 0)}</div>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-direction:column;gap:8px">
              ${scored.map((r, idx) => {
                const isApp = approved?.token === r.token;
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid ${isApp ? 'var(--green)' : idx === 0 ? 'var(--purple-light)' : 'var(--border)'};border-radius:var(--r8);background:${isApp ? 'var(--green-light)' : idx === 0 ? 'var(--purple-xlight)' : 'var(--surface)'}">
                  <div style="flex:1">
                    <div style="font-size:.82rem;font-weight:700">${sname(r.supId)}</div>
                    <div style="font-size:.7rem;color:var(--muted)">${r.ri.brand || '—'} · ${r.ri.deliveryDays}d · ${r.payTerm}${r.isManual?' · <em>manual</em>':''}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-family:monospace;font-weight:800;font-size:.92rem">R$${fmt(r.ri.unitPrice)}</div>
                    <div style="font-size:.67rem;color:var(--muted)">total R$${fmt(r.ri.unitPrice * ci?.qty)}</div>
                  </div>
                  <div style="text-align:center;min-width:48px">
                    <div style="font-size:1rem;font-weight:800;color:${idx === 0 ? 'var(--purple)' : 'var(--muted)'}">${r.score}</div>
                    <div style="font-size:.6rem;color:var(--muted)">score</div>
                  </div>
                  ${isApp
                    ? `<span class="badge b-green">✅ Aprovado</span>`
                    : `<button class="btn btn-green btn-sm" onclick="approveItem(${itemId},'${r.token}')">Aprovar</button>`}
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function approveItem(itemId, token) {
  approvals[itemId] = { token, approvedAt: new Date().toISOString() };
  saveAp();
  toast('✅ Item aprovado!');
  setTab3(currentTab3);
  renderCompareTab();
}

// ── STEP 4: Ordem de Compra ──
function renderOrdemCompra() {
  const appEntries = Object.entries(approvals);
  if (!appEntries.length) {
    document.getElementById('ocContent').innerHTML = `<div class="empty"><div class="empty-icon">📋</div>Nenhum item aprovado ainda.<br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="goStep(3)">← Voltar ao Mapa</button></div>`;
    return;
  }

  const bySupplier = {};
  appEntries.forEach(([itemId, ap]) => {
    const resp = responses[ap.token];
    if (!resp) return;
    if (!bySupplier[resp.supId]) bySupplier[resp.supId] = { supId: resp.supId, token: ap.token, payTerm: resp.payTerm, payMethod: resp.payMethod, canal: cycle?.dispatches?.find(d=>d.token===ap.token)?.canal||'manual', items: [] };
    const ri = resp.items?.find(x => x.itemId === parseInt(itemId));
    const ci = cycle.items.find(c => c.itemId === parseInt(itemId));
    if (ri && ci) bySupplier[resp.supId].items.push({ ...ri, qty: ci.qty });
  });

  const totalGeral = Object.values(bySupplier).reduce((s, sg) => s + sg.items.reduce((ss, i) => ss + i.qty * i.unitPrice, 0), 0);
  const nowStr     = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  document.getElementById('ocContent').innerHTML = `
    <!-- Header OC -->
    <div class="oc-header" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:.72rem;opacity:.7;margin-bottom:4px">ORDEM DE COMPRA</div>
          <div style="font-size:1.2rem;font-weight:800">${cycle?.id}</div>
          <div style="font-size:.74rem;opacity:.7;margin-top:3px">Entrega prevista: ${fmtD(cycle?.deliveryDate)} · Gerado em ${nowStr}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.72rem;opacity:.7">TOTAL APROVADO</div>
          <div style="font-size:1.6rem;font-weight:800">R$ ${fmt(totalGeral)}</div>
          <div style="font-size:.7rem;opacity:.7">${appEntries.length} itens · ${Object.keys(bySupplier).length} fornecedor(es)</div>
        </div>
      </div>
    </div>

    <!-- Lista por fornecedor -->
    <div style="display:flex;flex-direction:column;gap:12px">
      ${Object.values(bySupplier).map((sg, idx) => {
        const sup   = suppliers.find(s => s.id === sg.supId);
        const total = sg.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
        const canal = sg.canal;
        const num   = idx + 1;

        // Monta texto da OC para envio
        const ocLines = sg.items.map(i => { const item = items.find(x => x.id === i.itemId); return '• ' + (item?.name) + ': ' + i.qty + ' ' + (item?.unit) + ' × R$' + fmt(i.unitPrice) + ' = R$' + fmt(i.qty*i.unitPrice); });
        const ocText = 'Olá ' + (sup?.seller || sup?.name) + '! 👋\n\nSegue nossa Ordem de Compra ' + (cycle?.id || '') + ':\n\n' + ocLines.join('\n') + '\n\nTotal: R$' + fmt(total) + '\nEntrega: ' + fmtD(cycle?.deliveryDate) + '\nPagamento: ' + sg.payTerm + ' — ' + sg.payMethod + '\n\nObrigado! 🍕';

        return `<div style="border:2px solid var(--border);border-radius:var(--r12);overflow:hidden;background:var(--surface)">
          <!-- Header do fornecedor -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--purple-xlight);border-bottom:1.5px solid var(--purple-light);flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:28px;height:28px;border-radius:50%;background:var(--purple);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.8rem;font-weight:800;flex-shrink:0">${num}</div>
              <div>
                <div style="font-size:.9rem;font-weight:800;color:var(--purple)">${sup?.name || '—'}</div>
                <div style="font-size:.68rem;color:var(--muted)">${sup?.seller ? '👤 ' + sup.seller + ' · ' : ''}${sg.payTerm} · ${sg.payMethod}</div>
              </div>
            </div>
            <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
          </div>

          <!-- Lista de itens -->
          <div style="padding:0">
            ${sg.items.map((i, iIdx) => {
              const item = items.find(x => x.id === i.itemId);
              return `<div style="display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
                <div style="flex:1">
                  <div style="font-size:.82rem;font-weight:600">${item?.name}</div>
                  <div style="font-size:.65rem;color:var(--muted)">${i.qty} ${item?.unit} · ${i.brand||'—'}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-family:monospace;font-size:.78rem;color:var(--muted)">R$${fmt(i.unitPrice)}/un</div>
                  <div style="font-family:monospace;font-size:.84rem;font-weight:700">R$${fmt(i.qty*i.unitPrice)}</div>
                </div>
              </div>`;
            }).join('')}
          </div>

          <!-- Ações de envio -->
          <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;background:var(--surface2);border-top:1.5px solid var(--border)">
            <span style="font-size:.68rem;font-weight:700;color:var(--muted);align-self:center">Enviar OC:</span>
            ${sup?.phone
              ? `<a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(ocText)}"
                  target="_blank" class="btn btn-wa btn-sm">💬 WhatsApp</a>`
              : `<span style="font-size:.68rem;color:var(--muted)">Sem WhatsApp cadastrado</span>`}
            ${sup?.email
              ? `<a href="mailto:${sup.email}?subject=Ordem de Compra ${cycle?.id}&body=${encodeURIComponent(ocText)}"
                  class="btn btn-outline btn-sm">📧 E-mail</a>`
              : ''}
            <button class="btn btn-outline btn-sm" onclick="copiarOC(${sg.supId})">
              📋 Copiar texto
            </button>
            ${canal === 'manual' ? '<span class="badge b-orange" style="align-self:center">Compra manual</span>' : ''}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:16px">
      <button class="btn btn-outline" onclick="goStep(3)">← Voltar ao Mapa</button>
      <button class="btn btn-primary" onclick="finalizarCiclo()">✅ Finalizar Ciclo</button>
    </div>`;
}

function copiarOC(supId) {
  const sg = Object.values((() => {
    const by = {};
    Object.entries(approvals).forEach(([itemId, ap]) => {
      const resp = responses[ap.token];
      if (!resp || resp.supId !== supId) return;
      if (!by[supId]) by[supId] = { supId, payTerm: resp.payTerm, payMethod: resp.payMethod, items: [] };
      const ri = resp.items?.find(x => x.itemId === parseInt(itemId));
      const ci = cycle?.items?.find(c => c.itemId === parseInt(itemId));
      if (ri && ci) by[supId].items.push({ ...ri, qty: ci.qty });
    });
    return by;
  })())[0];
  if (!sg) return;
  const sup   = suppliers.find(s => s.id === supId);
  const total = sg.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const text  = 'Olá ' + (sup?.seller || sup?.name) + '! Segue nossa OC ' + (cycle?.id || '') + ':\n\n' +
    sg.items.map(i => { const item = items.find(x => x.id === i.itemId); return '• ' + item?.name + ': ' + i.qty + ' ' + item?.unit + ' × R$' + fmt(i.unitPrice) + ' = R$' + fmt(i.qty * i.unitPrice); }).join('\n') +
    '\n\nTotal: R$' + fmt(total) + '\nEntrega: ' + fmtD(cycle?.deliveryDate) + '\nPagamento: ' + sg.payTerm + ' — ' + sg.payMethod;
  navigator.clipboard.writeText(text).then(() => toast('📋 OC copiada!', 'info'));
}

function finalizarCiclo() {
  if (!confirm('Finalizar este ciclo? Os dados serão salvos no histórico.')) return;
  const appEntries = Object.entries(approvals);
  const total      = appEntries.reduce((s, [itemId, ap]) => {
    const resp = responses[ap.token];
    const ri   = resp?.items?.find(x => x.itemId === parseInt(itemId));
    const ci   = cycle.items.find(c => c.itemId === parseInt(itemId));
    return s + (ri?.unitPrice || 0) * (ci?.qty || 0);
  }, 0);
  const totalRef = cycle.items.reduce((s, ci) => {
    const item = items.find(i => i.id === ci.itemId);
    return s + ci.qty * (item?.cost || 0);
  }, 0);
  cycleHistory.push({
    id:      cycle.id,
    date:    cycle.createdAt,
    items:   cycle.items.length,
    sups:    cycle.dispatches.length,
    total,
    economia: Math.max(0, totalRef - total),
  });
  // Atualiza preços de custo dos itens
  appEntries.forEach(([itemId, ap]) => {
    const resp = responses[ap.token];
    const ri   = resp?.items?.find(x => x.itemId === parseInt(itemId));
    const item = items.find(i => i.id === parseInt(itemId));
    if (ri && item) item.cost = ri.unitPrice;
  });
  saveI(); saveCH();
  cycle     = null; saveC();
  responses = {};   saveR();
  approvals = {};   saveAp();
  toast('🎉 Ciclo finalizado! Histórico atualizado.');
  goModule('dashboard');
}

// ══════════════════════════════════════════════════════════════
// CHECKLIST PRESENCIAL
// ══════════════════════════════════════════════════════════════







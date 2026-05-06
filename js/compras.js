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

// ── STEP 2: Fornecedores ──
function renderDispatchSups() {
  const container = document.getElementById('dispatchSupList');
  if (!suppliers.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>Nenhum fornecedor cadastrado. <a href="#" onclick="goModule('fornecedores')" style="color:var(--purple)">Cadastre aqui</a>.</div>`;
    return;
  }

  // Insumos selecionados no step 1
  const selItemIds = getSelItems().map(si => si.itemId);

  // Filtra fornecedores: só os que têm pelo menos 1 insumo selecionado, ou sem vínculo (recebem todos)
  const filtSups = suppliers.filter(s => {
    const supItems = items.filter(i => i.supId === s.id).map(i => i.id);
    if (!supItems.length) return true; // sem vínculo recebe todos
    return supItems.some(id => selItemIds.includes(id));
  });

  if (!filtSups.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>Nenhum fornecedor vinculado aos insumos selecionados. <a href="#" onclick="goModule('cadastros')" style="color:var(--purple)">Cadastre aqui</a>.</div>`;
    return;
  }

  container.innerHTML = `
    <!-- Fornecedores com WhatsApp -->
    <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px">💬 Via WhatsApp <span class="badge b-gray" style="font-size:.58rem">${filtSups.length} fornecedor(es) com insumos selecionados</span></div>
    ${filtSups.map(s => {
      const si         = items.filter(i => i.supId === s.id && selItemIds.includes(i.id));
      const dispatched = cycle?.dispatches?.find(d => d.supId === s.id && d.type !== 'presencial');
      return `<div class="dispatch-card">
        <div style="padding-top:2px">
          <input type="checkbox" class="sup-chk" value="${s.id}" ${si.length || dispatched ? 'checked' : ''} style="accent-color:var(--purple);width:16px;height:16px">
        </div>
        <div style="flex:1">
          <div style="font-size:.86rem;font-weight:700">${s.name}</div>
          <div style="font-size:.71rem;color:var(--muted);margin-top:2px">${s.seller ? `👤 ${s.seller} ` : ''}${s.phone ? `📞 ${s.phone}` : '<span style="color:var(--orange-dark)">⚠️ Sem WhatsApp</span>'}</div>
          ${si.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${si.map(i => `<span class="badge b-purple" style="font-size:.6rem">${i.name}</span>`).join('')}</div>`
            : '<div style="font-size:.68rem;color:var(--muted);margin-top:4px">Receberá todos os itens</div>'}
        </div>
        <div>${dispatched ? `<span class="badge b-green">✓ Enviado</span>` : ''}</div>
      </div>`;
    }).join('')}

    <!-- Compra Presencial -->
    <div style="margin-top:20px;padding-top:16px;border-top:2px dashed var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">🛒 Compra Presencial</div>
          <div style="font-size:.69rem;color:var(--muted);margin-top:2px">Supermercado, atacado ou fornecedor sem WhatsApp</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="addPresencialLocal()">+ Adicionar local</button>
      </div>
      <div id="presencialList"></div>
    </div>`;

  renderPresencialList();
}

// ── Compra Presencial ──
let presencialLocais = JSON.parse(localStorage.getItem('vtp_presencial') || '[]');

function savePresencial() { localStorage.setItem('vtp_presencial', JSON.stringify(presencialLocais)); }

function renderPresencialList() {
  const el = document.getElementById('presencialList');
  if (!el) return;
  if (!presencialLocais.length) {
    el.innerHTML = `<div style="font-size:.75rem;color:var(--muted);padding:10px 0">Nenhum local cadastrado. Adicione supermercados ou fornecedores sem WhatsApp.</div>`;
    return;
  }
  el.innerHTML = presencialLocais.map((loc, idx) => `
    <div class="dispatch-card" style="margin-bottom:8px">
      <div style="padding-top:2px">
        <input type="checkbox" class="presencial-chk" value="${idx}" checked style="accent-color:var(--purple);width:16px;height:16px">
      </div>
      <div style="flex:1">
        <div style="font-size:.86rem;font-weight:700">${loc.name}</div>
        ${loc.obs ? `<div style="font-size:.7rem;color:var(--muted);margin-top:2px">${loc.obs}</div>` : ''}
      </div>
      <button class="btn btn-red btn-xs" onclick="removePresencialLocal(${idx})">🗑</button>
    </div>`).join('');
}

function addPresencialLocal() {
  const name = prompt('Nome do local (ex: Atacadão, Supermercado X):');
  if (!name || !name.trim()) return;
  const obs = prompt('Observação opcional (ex: avenida, bairro):') || '';
  presencialLocais.push({ name: name.trim(), obs: obs.trim() });
  savePresencial();
  renderPresencialList();
}

function removePresencialLocal(idx) {
  presencialLocais.splice(idx, 1);
  savePresencial();
  renderPresencialList();
}

function getSelPresenciais() {
  return [...document.querySelectorAll('.presencial-chk:checked')].map(c => parseInt(c.value));
}

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

  // Compras presenciais
  const selPresenciais = getSelPresenciais();
  if (selPresenciais.length) {
    openChecklistPresencial(selItems, selPresenciais);
  }

  if (newDisps.length) {
    showWAMessages(newDisps, selItems, deadline, delivery, payTerm, payMethod, obs);
  } else if (!selPresenciais.length) {
    toast('Todos os fornecedores já foram contactados', 'info');
    goStep(3);
  }

  document.getElementById('snav2').classList.add('done');
  document.getElementById('snum2').textContent = '✓';
  _renderCotacoesAbertas();
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
    el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div>Nenhuma cotação recebida ainda.<br><button class="btn btn-orange btn-sm" style="margin-top:12px" onclick="goStep(2)">Ir para envio</button></div>`;
    return;
  }
  const cycleItemIds = [...new Set(cycle.items.map(i => i.itemId))];
  const respSups     = respTokens.map(t => ({ token: t, ...responses[t] }));
  const totalPrev    = cycle.items.reduce((s, ci) => { const item = items.find(i => i.id === ci.itemId); return s + ci.qty * (item?.cost || 0); }, 0);
  const totalAprov   = Object.entries(approvals).reduce((s, [itemId, ap]) => {
    const resp = responses[ap.token];
    const ri   = resp?.items?.find(x => x.itemId === parseInt(itemId));
    const ci   = cycle.items.find(c => c.itemId === parseInt(itemId));
    return s + (ri?.unitPrice || 0) * (ci?.qty || 0);
  }, 0);
  const economia = totalPrev - totalAprov;

  el.innerHTML = `
    ${Object.keys(approvals).length > 0
      ? `<div style="background:var(--green-light);border:1.5px solid #86EFAC;border-radius:var(--r10);padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
           <div>
             <div style="font-weight:700;color:var(--green);font-size:.84rem">💰 Economia gerada neste ciclo</div>
             <div style="font-size:.72rem;color:var(--green);margin-top:2px">Comparado ao custo de referência</div>
           </div>
           <div style="font-size:1.3rem;font-weight:800;color:var(--green)">R$ ${fmt(Math.max(0, economia))}</div>
         </div>` : ''}
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:10px">🏆 Score = preço (50%) + prazo entrega (30%) + condição pagamento (20%)</div>
    <div class="tbl-wrap" style="overflow-x:auto"><table>
      <thead><tr>
        <th style="min-width:140px">Produto</th>
        <th class="c">Qtd.</th>
        ${respSups.map(r => `<th class="c" style="min-width:160px">${sname(r.supId)}</th>`).join('')}
        <th class="c">🏆 Melhor</th>
      </tr></thead>
      <tbody>
        ${cycleItemIds.map(itemId => {
          const item     = items.find(i => i.id === itemId);
          const ci       = cycle.items.find(c => c.itemId === itemId);
          const rowData  = respSups.map(r => { const ri = r.items?.find(x => x.itemId === itemId); return { token: r.token, supId: r.supId, ri, payTerm: r.payTerm }; });
          const prices   = rowData.map(d => d.ri?.unitPrice || Infinity).filter(p => p < Infinity);
          const deliveries = rowData.map(d => d.ri?.deliveryDays || 99).filter(d => d < 99);
          const minP = Math.min(...prices), maxP = Math.max(...prices);
          const minD = Math.min(...deliveries), maxD = Math.max(...deliveries);
          const scores   = rowData.map(d => d.ri ? calcScore(d.ri.unitPrice, d.ri.deliveryDays, d.payTerm, minP, maxP, minD, maxD) : null);
          const maxScore = Math.max(...scores.filter(s => s !== null));
          const winIdx   = scores.indexOf(maxScore);
          const approved = approvals[itemId];
          const refCost  = ci?.qty * (item?.cost || 0);
          return `<tr>
            <td>
              <div class="iname">${item?.name}</div>
              <div class="isub">${item?.cat} · ref: R$${fmt(item?.cost || 0)}</div>
            </td>
            <td class="c"><span style="font-family:monospace;font-size:.74rem">${ci?.qty} ${item?.unit}</span></td>
            ${rowData.map((d, i) => {
              const isWin = scores[i] === maxScore && scores[i] !== null;
              const isApp = approved?.token === d.token;
              if (!d.ri) return `<td class="c"><span class="badge b-gray">Sem resposta</span></td>`;
              const saving = refCost - (d.ri.unitPrice * ci?.qty);
              return `<td class="c" style="${isApp ? 'background:#F0FDF4;border:2px solid var(--green)' : isWin ? 'background:#F5F3FF' : ''}">
                <div style="font-family:monospace;font-weight:700;font-size:.88rem;color:${isApp ? 'var(--green)' : isWin ? 'var(--purple)' : 'var(--text)'}">R$ ${fmt(d.ri.unitPrice)}</div>
                <div style="font-size:.62rem;color:var(--muted);margin:2px 0">${d.ri.brand || '—'} · ${d.ri.deliveryDays}d · ${d.payTerm}</div>
                <div style="display:flex;align-items:center;gap:3px;margin:3px 0">
                  <div class="score-bar" style="flex:1">
                    <div class="score-fill" style="width:${scores[i]}%;background:${isApp ? 'var(--green)' : isWin ? 'var(--purple)' : 'var(--muted)'}"></div>
                  </div>
                  <span style="font-size:.6rem;font-family:monospace;color:${isWin ? 'var(--purple)' : 'var(--muted)'}">${scores[i]}</span>
                </div>
                ${saving > 0 ? `<div style="font-size:.62rem;color:var(--green)">-R$${fmt(saving)}</div>` : ''}
                ${isApp
                  ? `<span class="badge b-green" style="font-size:.6rem">✅ Aprovado</span>`
                  : `<button class="btn btn-green btn-xs" style="margin-top:4px" onclick="approveItem(${itemId},'${d.token}')">Aprovar</button>`}
              </td>`;
            }).join('')}
            <td class="c">
              ${winIdx >= 0 && rowData[winIdx]?.ri
                ? `<div style="font-weight:700;color:var(--purple);font-size:.79rem">${sname(rowData[winIdx].supId)}</div><div style="font-size:.66rem;color:var(--muted)">Score ${maxScore}</div>`
                : '—'}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
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

function renderApprovalTab() {
  const el           = document.getElementById('tab3-approval');
  const cycleItemIds = [...new Set(cycle?.items.map(i => i.itemId) || [])];
  const respTokens   = Object.keys(responses);
  if (!respTokens.length) { el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div>Nenhuma cotação recebida.</div>`; return; }

  el.innerHTML = `
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:12px">Aprove item a item. O score indica a melhor proposta considerando preço, entrega e pagamento.</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${cycleItemIds.map(itemId => {
        const item     = items.find(i => i.id === itemId);
        const ci       = cycle.items.find(c => c.itemId === itemId);
        const approved = approvals[itemId];
        const opts     = respTokens
          .map(t => ({ token: t, ...responses[t] }))
          .map(r => ({ ...r, ri: r.items?.find(x => x.itemId === itemId) }))
          .filter(r => r.ri);

        if (!opts.length) return '';
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
                    <div style="font-size:.7rem;color:var(--muted)">${r.ri.brand || '—'} · ${r.ri.deliveryDays}d entrega · ${r.payTerm}</div>
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

  // Agrupa por fornecedor
  const bySupplier = {};
  appEntries.forEach(([itemId, ap]) => {
    const resp = responses[ap.token];
    if (!resp) return;
    const key = resp.supId;
    if (!bySupplier[key]) bySupplier[key] = { supId: resp.supId, payTerm: resp.payTerm, payMethod: resp.payMethod, items: [] };
    const ri   = resp.items?.find(x => x.itemId === parseInt(itemId));
    const ci   = cycle.items.find(c => c.itemId === parseInt(itemId));
    if (ri && ci) bySupplier[key].items.push({ ...ri, qty: ci.qty });
  });

  const totalGeral = Object.values(bySupplier).reduce((s, sg) => s + sg.items.reduce((ss, i) => ss + i.qty * i.unitPrice, 0), 0);
  const nowStr     = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  document.getElementById('ocContent').innerHTML = `
    <div class="oc-header">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:.72rem;opacity:.7;margin-bottom:4px">ORDEM DE COMPRA</div>
          <div style="font-size:1.2rem;font-weight:800">${cycle?.id}</div>
          <div style="font-size:.74rem;opacity:.7;margin-top:3px">Entrega prevista: ${fmtD(cycle?.deliveryDate)} · Gerado em ${nowStr}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.72rem;opacity:.7">TOTAL APROVADO</div>
          <div style="font-size:1.6rem;font-weight:800">R$ ${fmt(totalGeral)}</div>
          <div style="font-size:.7rem;opacity:.7">${appEntries.length} itens · ${Object.keys(bySupplier).length} fornecedores</div>
        </div>
      </div>
    </div>
    <div class="oc-grid">
      ${Object.values(bySupplier).map(sg => {
        const sup   = suppliers.find(s => s.id === sg.supId);
        const total = sg.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
        return `<div class="oc-sup-card">
          <div class="oc-sup-header">
            <div>
              <div style="font-size:.84rem;font-weight:700;color:var(--purple)">${sup?.name || '—'}</div>
              ${sup?.seller ? `<div style="font-size:.68rem;color:var(--muted)">👤 ${sup.seller}</div>` : ''}
            </div>
            <div style="text-align:right">
              <div style="font-family:monospace;font-weight:800;color:var(--purple)">R$${fmt(total)}</div>
              <div style="font-size:.65rem;color:var(--muted)">${sg.payTerm} · ${sg.payMethod}</div>
            </div>
          </div>
          <div style="padding:12px 14px">
            ${sg.items.map(i => {
              const item = items.find(x => x.id === i.itemId);
              return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
                <div>
                  <div style="font-size:.8rem;font-weight:600">${item?.name}</div>
                  <div style="font-size:.65rem;color:var(--muted)">${i.qty} ${item?.unit} · ${i.brand || '—'}</div>
                </div>
                <div style="font-family:monospace;font-size:.78rem;font-weight:700">R$${fmt(i.qty * i.unitPrice)}</div>
              </div>`;
            }).join('')}
          </div>
          ${sup?.phone
            ? `<div style="padding:10px 14px;border-top:1px solid var(--border)">
                 <a href="https://wa.me/55${sup.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${sup.seller || sup.name}! Segue nossa OC:\n\n${sg.items.map(i => { const item = items.find(x => x.id === i.itemId); return `• ${item?.name}: ${i.qty} ${item?.unit} — R$${fmt(i.unitPrice)}/un`; }).join('\n')}\n\nTotal: R$${fmt(total)}\nEntrega: ${fmtD(cycle?.deliveryDate)}\nPagamento: ${sg.payTerm} — ${sg.payMethod}`)}"
                    target="_blank" class="btn btn-wa btn-sm" style="width:100%;justify-content:center">
                   💬 Enviar OC por WhatsApp
                 </a>
               </div>`
            : ''}
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <button class="btn btn-outline" onclick="goStep(3)">← Voltar ao Mapa</button>
      <button class="btn btn-primary" onclick="finalizarCiclo()">✅ Finalizar Ciclo</button>
    </div>`;
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

function openChecklistPresencial(selItems, selPresencialIdxs) {
  const locs = selPresencialIdxs.map(i => presencialLocais[i]).filter(Boolean);

  // Estado do checklist (salvo no localStorage por ciclo)
  const checkKey = `vtp_checklist_${cycle?.id || 'avulso'}`;
  let checked = JSON.parse(localStorage.getItem(checkKey) || '{}');

  document.getElementById('respTitle').textContent = `🛒 Checklist de Compra Presencial`;
  document.getElementById('respBody').innerHTML = `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;font-size:.77rem;color:var(--text2);margin-bottom:14px;line-height:1.6">
      <strong style="color:var(--purple)">Como usar:</strong> Marque os itens conforme for comprando. O checklist fica salvo — você pode fechar e voltar depois. Ao finalizar, as quantidades são atualizadas no estoque.
    </div>

    ${locs.map((loc, li) => `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="width:28px;height:28px;background:var(--purple);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.75rem;font-weight:700;flex-shrink:0">${li + 1}</div>
          <div>
            <div style="font-size:.88rem;font-weight:700">${loc.name}</div>
            ${loc.obs ? `<div style="font-size:.7rem;color:var(--muted)">${loc.obs}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${selItems.map(si => {
            const item   = items.find(i => i.id === si.itemId);
            const key    = `${li}_${si.itemId}`;
            const isDone = checked[key];
            return `<div id="chk-row-${li}-${si.itemId}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1.5px solid ${isDone ? 'var(--green)' : 'var(--border)'};border-radius:var(--r8);background:${isDone ? 'var(--green-light)' : 'var(--surface)'};transition:all .2s;cursor:pointer" onclick="toggleChecklistItem('${checkKey}',${li},${si.itemId},this)">
              <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${isDone ? 'var(--green)' : 'var(--border2)'};background:${isDone ? 'var(--green)' : 'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s">
                ${isDone ? '<span style="color:#fff;font-size:.75rem">✓</span>' : ''}
              </div>
              <div style="flex:1">
                <div style="font-size:.82rem;font-weight:600;${isDone ? 'text-decoration:line-through;color:var(--muted)' : ''}">${item?.name}</div>
                <div style="font-size:.67rem;color:var(--muted)">${si.qty} ${item?.unit} · ref R$${fmt(item?.cost || 0)}</div>
              </div>
              ${item?.brands?.[0] ? `<span class="badge b-purple" style="font-size:.6rem">⭐ ${item.brands[0]}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('')}

    <div id="checklistProgress" style="margin-top:10px"></div>`;

  _updateChecklistProgress(checkKey, selItems, locs);

  document.getElementById('respFoot').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('ovResponse')">Fechar</button>
    <button class="btn btn-primary" onclick="finalizarChecklist('${checkKey}')">✅ Finalizar e atualizar estoque</button>`;

  document.getElementById('ovResponse').classList.add('open');
}

function toggleChecklistItem(checkKey, locIdx, itemId, row) {
  let checked = JSON.parse(localStorage.getItem(checkKey) || '{}');
  const key   = `${locIdx}_${itemId}`;
  checked[key] = !checked[key];
  localStorage.setItem(checkKey, JSON.stringify(checked));

  const isDone = checked[key];
  row.style.border      = `1.5px solid ${isDone ? 'var(--green)' : 'var(--border)'}`;
  row.style.background  = isDone ? 'var(--green-light)' : 'var(--surface)';
  const circle = row.querySelector('div');
  circle.style.borderColor = isDone ? 'var(--green)' : 'var(--border2)';
  circle.style.background  = isDone ? 'var(--green)' : 'transparent';
  circle.innerHTML         = isDone ? '<span style="color:#fff;font-size:.75rem">✓</span>' : '';
  const nameEl = row.querySelector('.\\82rem');
  row.querySelectorAll('[style*="font-size:.82rem"]').forEach(el => {
    el.style.textDecoration = isDone ? 'line-through' : 'none';
    el.style.color          = isDone ? 'var(--muted)' : '';
  });

  // Atualiza progresso
  const selItems = cycle?.items || [];
  const locs     = presencialLocais;
  _updateChecklistProgress(checkKey, selItems, locs);
}

function _updateChecklistProgress(checkKey, selItems, locs) {
  const el = document.getElementById('checklistProgress');
  if (!el) return;
  const checked = JSON.parse(localStorage.getItem(checkKey) || '{}');
  const total   = selItems.length * locs.length;
  const done    = Object.values(checked).filter(Boolean).length;
  const pct     = total ? Math.round(done / total * 100) : 0;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:.74rem;font-weight:600;color:var(--text2)">Progresso da compra</span>
      <span style="font-size:.74rem;font-weight:700;color:${pct === 100 ? 'var(--green)' : 'var(--purple)'}">${done}/${total} itens · ${pct}%</span>
    </div>
    <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${pct === 100 ? 'var(--green)' : 'var(--purple)'};border-radius:3px;transition:width .4s"></div>
    </div>
    ${pct === 100 ? '<div style="margin-top:8px;font-size:.75rem;color:var(--green);font-weight:700;text-align:center">🎉 Todos os itens comprados!</div>' : ''}`;
}

function finalizarChecklist(checkKey) {
  const checked  = JSON.parse(localStorage.getItem(checkKey) || '{}');
  const selItems = cycle?.items || [];
  let updated    = 0;

  // Para cada item marcado como comprado, atualiza a quantidade no estoque
  Object.entries(checked).forEach(([key, done]) => {
    if (!done) return;
    const [, itemIdStr] = key.split('_');
    const itemId = parseInt(itemIdStr);
    const si     = selItems.find(s => s.itemId === itemId);
    const item   = items.find(i => i.id === itemId);
    if (si && item) {
      item.qty = parseFloat((item.qty + si.qty).toFixed(3));
      updated++;
    }
  });

  if (updated) {
    saveI();
    renderDashboard();
    toast(`✅ ${updated} item(ns) atualizado(s) no estoque!`);
  } else {
    toast('Nenhum item marcado como comprado', 'err');
    return;
  }

  localStorage.removeItem(checkKey);
  closeModal('ovResponse');
  goStep(3);
}

// Reabre checklist se existir sessão em andamento
function checkOpenChecklist() {
  if (!cycle) return;
  const checkKey = `vtp_checklist_${cycle.id}`;
  const saved    = localStorage.getItem(checkKey);
  if (saved && cycle.items?.length) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-orange btn-sm';
    btn.textContent = '🛒 Retomar checklist presencial';
    btn.onclick = () => openChecklistPresencial(cycle.items, presencialLocais.map((_, i) => i));
    document.getElementById('topbarActions').appendChild(btn);
  }
}

// Lista avulsa — checklist sem ciclo ativo
function openChecklistAvulso() {
  const needItems = items.filter(i => !i.isProd && gneed(i) > 0);
  if (!needItems.length) { toast('Nenhum item precisa de reposição', 'info'); return; }

  const selItems = needItems.map(i => ({ itemId: i.id, qty: gneed(i) }));

  if (!presencialLocais.length) {
    toast('Adicione pelo menos um local de compra presencial primeiro', 'err');
    return;
  }

  const idxs = presencialLocais.map((_, i) => i);
  // Usa um ciclo temporário para o checklist
  const tempCycle = cycle || { id: 'AVULSO_' + Date.now(), items: selItems };
  if (!cycle) {
    const checkKey = `vtp_checklist_${tempCycle.id}`;
    // Injeta items temporários
    const fakeCycle = { id: tempCycle.id, items: selItems };
    const origCycle = cycle;
    cycle = fakeCycle;
    openChecklistPresencial(selItems, idxs);
    cycle = origCycle;
  } else {
    openChecklistPresencial(selItems, idxs);
  }
}

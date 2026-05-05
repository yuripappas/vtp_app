/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Módulo de Compras (Requisição → Cotação → Mapa → OC)
 */

// ══════════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderComprasModule() {
  const d = new Date(Date.now() + 24 * 36e5);
  if (!document.getElementById('cfgDeadline').value)
    document.getElementById('cfgDeadline').value = d.toISOString().slice(0, 16);
  const d2 = new Date(Date.now() + 3 * 864e5);
  if (!document.getElementById('cfgDelivery').value)
    document.getElementById('cfgDelivery').value = d2.toISOString().slice(0, 10);
  renderBuyItems();
  goStep(1);
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
function renderBuyItems() {
  const needItems = items.filter(i => !i.isProd && gneed(i) > 0);
  document.getElementById('buyItemCount').textContent = `${needItems.length} itens necessários`;
  const tbody = document.getElementById('buyItemsBody');
  if (!needItems.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty">Nenhum item precisa de reposição</div></td></tr>`;
    return;
  }
  tbody.innerHTML = needItems.map(item => {
    const b    = (item.brands || []).filter(x => x);
    const need = gneed(item);
    return `<tr>
      <td class="c"><input type="checkbox" class="buy-chk" value="${item.id}" checked style="accent-color:var(--purple);width:15px;height:15px"></td>
      <td><div class="iname">${item.name}</div><div class="isub">${item.cat}</div></td>
      <td class="c">
        <input type="number" id="bq-${item.id}" value="${need % 1 === 0 ? need : need.toFixed(1)}" min="0" step="0.1"
          style="width:70px;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-family:'Inter',sans-serif;font-size:.8rem;text-align:center;background:var(--surface2);outline:none">
      </td>
      <td class="c"><span style="font-family:monospace;font-size:.74rem">${item.unit}</span></td>
      <td>${b[0] ? `<span class="badge b-purple" style="font-size:.62rem">⭐ ${b[0]}</span>` : '<span style="color:var(--muted);font-size:.72rem">—</span>'}</td>
      <td><span style="font-size:.72rem;color:var(--muted)">${b.slice(1).join(' / ') || '—'}</span></td>
      <td class="r"><span style="font-family:monospace;font-size:.74rem;color:var(--muted)">R$ ${fmt(item.cost)}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('chkAll').checked = true;
}

function toggleAllItems(chk) {
  document.querySelectorAll('.buy-chk').forEach(c => c.checked = chk.checked);
}

// ── STEP 2: Fornecedores ──
function renderDispatchSups() {
  const container = document.getElementById('dispatchSupList');
  if (!suppliers.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>Nenhum fornecedor cadastrado. <a href="#" onclick="goModule('fornecedores')" style="color:var(--purple)">Cadastre aqui</a>.</div>`;
    return;
  }
  container.innerHTML = suppliers.map(s => {
    const si         = items.filter(i => i.supId === s.id);
    const dispatched = cycle?.dispatches?.find(d => d.supId === s.id);
    return `<div class="dispatch-card">
      <div style="padding-top:2px">
        <input type="checkbox" class="sup-chk" value="${s.id}" ${si.length || dispatched ? 'checked' : ''} style="accent-color:var(--purple);width:16px;height:16px">
      </div>
      <div style="flex:1">
        <div style="font-size:.86rem;font-weight:700">${s.name}</div>
        <div style="font-size:.71rem;color:var(--muted);margin-top:2px">${s.seller ? `👤 ${s.seller} ` : ''}${s.phone ? `📞 ${s.phone}` : ''}</div>
        ${si.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${si.map(i => `<span class="badge b-purple" style="font-size:.6rem">${i.name}</span>`).join('')}</div>`
          : '<div style="font-size:.68rem;color:var(--muted);margin-top:4px">Receberá todos os itens</div>'}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${dispatched ? `<span class="badge b-green">✓ Enviado</span>` : ''}
      </div>
    </div>`;
  }).join('');
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
  showWAMessages(newDisps, selItems, deadline, delivery, payTerm, payMethod, obs);
  document.getElementById('snav2').classList.add('done');
  document.getElementById('snum2').textContent = '✓';
}

function showWAMessages(disps, selItems, deadline, delivery, payTerm, payMethod, obs) {
  if (!disps.length) { toast('Todos os fornecedores já foram contactados', 'info'); goStep(3); return; }
  const baseUrl   = window.location.href.split('?')[0].replace('.html', '') + 'cotacao-fornecedor.html';
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
      const msg   = `Olá ${sup?.seller || sup?.name}! 👋\n\nA *Vai Ter Pizza!* solicita sua cotação:\n\n${itemLines}\n\n📅 *Prazo:* ${fmtDT(deadline)}\n🚚 *Entrega:* ${fmtD(delivery)}\n💳 *Pagamento:* ${payTerm} — ${payMethod}\n${obs ? '\n📝 ' + obs + '\n' : ''}\nPreencha sua proposta:\n👉 ${baseUrl}?token=${d.token}\n\nObrigado! 🍕`;
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
          `<button class="btn btn-orange btn-sm" onclick="openSimResponse('${d.token}')">🧪 Simular: ${sname(d.supId)}</button>`
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
        : `<div class="card-body"><div style="color:var(--muted);font-size:.8rem">Aguardando resposta...</div></div>`}
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

/**
 * VTP Compras — Vai Ter Pizza!
 * modules.js — Pré-produção, Fornecedores, Relatórios, Usuários, PDF
 */

// ══════════════════════════════════════════════════════════════
// PRÉ-PRODUÇÃO
// ══════════════════════════════════════════════════════════════

function renderPreproducao() {
  const prod   = items.filter(i => i.isProd);
  const orFilt = ordens.filter(o => !o.archived);

  const critCount  = prod.filter(i => gst(i) === 'crit').length;
  const warnCount  = prod.filter(i => gst(i) === 'warn').length;
  const okCount    = prod.filter(i => gst(i) === 'ok').length;
  const pendCount  = orFilt.filter(o => o.status === 'pendente').length;
  const prodCount  = orFilt.filter(o => o.status === 'produzido').length;

  // KPIs
  document.getElementById('prepKpi').innerHTML = `
    ${_prepKpi(critCount, 'Críticos',  'var(--red)',        'crit', 'alert-circle')}
    ${_prepKpi(warnCount, 'Baixo',     'var(--yellow)',     'warn', 'alert-triangle')}
    ${_prepKpi(okCount,   'OK',        'var(--green)',      'ok',   'check-circle')}
    ${_prepKpi(pendCount, 'Pendentes', 'var(--orange-dark)','pend', 'clock')}
    ${_prepKpi(prodCount, 'Produzidos','var(--purple)',     'prod', 'check-circle')}`;

  // Filtro bar
  _renderPrepFiltros();

  // Grid de cards
  _renderPrepGrid(prod, orFilt);
  updatePrepBadge();
}

function _prepKpi(val, label, cor, filtro, icon) {
  const active = (window._prepFiltro || 'all') === filtro;
  return `
    <div class="kpi" onclick="_setPrepFiltro('${filtro}')"
      style="cursor:pointer;border-color:${active ? cor : 'var(--border)'};background:${active ? cor + '11' : 'var(--surface)'}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc(icon, 16, active ? cor : 'var(--muted)')}
        <div class="kpi-v" style="color:${cor};font-size:1.4rem">${val}</div>
      </div>
      <div class="kpi-l">${label}</div>
    </div>`;
}

function _renderPrepFiltros() {
  const el = document.getElementById('prepFiltroBar');
  if (!el) return;
  const f = window._prepFiltro || 'all';
  const btns = [
    { id:'all',  label:'Todos',     icon:'package',        cls:'' },
    { id:'crit', label:'Críticos',  icon:'alert-circle',   cls:'f-red' },
    { id:'warn', label:'Baixo',     icon:'alert-triangle', cls:'f-yellow' },
    { id:'ok',   label:'OK',        icon:'check-circle',   cls:'f-green' },
    { id:'pend', label:'Pendentes', icon:'clock',          cls:'' },
    { id:'prod', label:'Produzidos',icon:'check',          cls:'f-green' },
  ];
  el.innerHTML = btns.map(b =>
    `<button class="filter-btn ${b.cls} ${f===b.id?'active':''}" onclick="_setPrepFiltro('${b.id}')">
      ${lc(b.icon, 12, 'currentColor')} ${b.label}
    </button>`
  ).join('');
}

function _setPrepFiltro(filtro) {
  window._prepFiltro = (window._prepFiltro === filtro && filtro !== 'all') ? 'all' : filtro;
  renderPreproducao();
}

function _renderPrepGrid(prod, orFilt) {
  const f    = window._prepFiltro || 'all';
  const q    = (document.getElementById('prepSearch')?.value || '').toLowerCase();
  const grid = document.getElementById('prepGrid');
  if (!grid) return;

  let filtProd = prod.filter(item => {
    if (q && !item.name.toLowerCase().includes(q) && !(item.cat||'').toLowerCase().includes(q)) return false;
    const s = gst(item);
    if (f === 'crit') return s === 'crit';
    if (f === 'warn') return s === 'warn';
    if (f === 'ok')   return s === 'ok';
    if (f === 'pend') return orFilt.some(o => o.itemId === item.id && o.status === 'pendente');
    if (f === 'prod') return orFilt.some(o => o.itemId === item.id && o.status === 'produzido');
    return true;
  }).sort((a,b) => {
    const order = { crit:0, warn:1, ok:2 };
    return (order[gst(a)]||2) - (order[gst(b)]||2) || a.name.localeCompare(b.name);
  });

  if (!filtProd.length) {
    grid.style.cssText = '';
    grid.innerHTML = `
      <div style="padding:40px;text-align:center">
        <div class="empty-icon">${lc('chef-hat', 24, 'var(--muted)')}</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:8px">Nenhum item encontrado</div>
      </div>`;
    return;
  }

  grid.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  grid.innerHTML = filtProd.map(item => {
    const itemOrdens = orFilt.filter(o => o.itemId === item.id).sort((a,b) => b.id - a.id);
    const s          = gst(item);
    const pct        = item.ideal <= 0 ? 0 : Math.min(100, Math.round(item.qty / item.ideal * 100));
    const stColor    = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' }[s];
    const pendOrdens = itemOrdens.filter(o => o.status === 'pendente');
    const lastProd   = itemOrdens.find(o => o.status === 'produzido');
    const rendePizzas = item.medPorcao && item.qty > 0 ? Math.floor(item.qty / item.medPorcao) : null;

    return `
      <div style="background:var(--surface);border:1.5px solid var(--border);border-left:3px solid ${stColor};border-radius:var(--r10);overflow:hidden">
        <!-- Linha principal -->
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;flex-wrap:wrap">
          <!-- Status chip -->
          <span class="chip chip-${s==='crit'?'red':s==='warn'?'yellow':'green'}" style="flex-shrink:0;min-width:64px;justify-content:center">
            ${lc(s==='crit'?'alert-circle':s==='warn'?'alert-triangle':'check-circle', 10, 'currentColor')}
            ${s==='crit'?'CRÍTICO':s==='warn'?'BAIXO':'OK'}
          </span>

          <!-- Nome + categoria -->
          <div style="flex:1;min-width:120px">
            <div style="font-size:var(--text-md);font-weight:700">${item.name}</div>
            ${item.cat ? `<div style="font-size:var(--text-2xs);color:var(--muted)">${item.cat}</div>` : ''}
          </div>

          <!-- Qtd atual -->
          <div style="text-align:center;min-width:56px">
            <div style="font-size:1rem;font-weight:800;color:${stColor};font-family:monospace">${fmt(item.qty)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">${item.unit} atual</div>
          </div>

          <!-- Barra + % -->
          <div style="display:flex;align-items:center;gap:6px;min-width:120px;flex:0 0 160px">
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${stColor};border-radius:3px"></div>
            </div>
            <span style="font-size:var(--text-xs);font-weight:700;color:${stColor};min-width:30px">${pct}%</span>
          </div>

          <!-- Ideal -->
          <div style="text-align:center;min-width:56px">
            <div style="font-size:var(--text-sm);font-weight:700;font-family:monospace;color:var(--muted)">${fmt(item.ideal)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">${item.unit} ideal</div>
          </div>

          ${rendePizzas !== null ? `
            <div style="font-size:var(--text-xs);color:var(--muted);white-space:nowrap">
              ${lc('tag',11,'var(--muted)')} ≈ <strong style="color:var(--text)">${rendePizzas}</strong> porções
            </div>` : ''}

          ${pendOrdens.length ? `
            <span class="chip" style="background:var(--orange-light);color:var(--orange-dark);border:1px solid #FCD34D;flex-shrink:0">
              ${lc('clock',10,'currentColor')} ${pendOrdens.length} pendente${pendOrdens.length>1?'s':''} ${pendOrdens.length===1 ? '· Prog. '+fmtD(pendOrdens[0].date) : ''}
            </span>` : ''}

          <!-- Ações -->
          <div style="display:flex;gap:6px;flex-shrink:0;margin-left:auto">
            ${pendOrdens.length ? `
              <button class="btn btn-primary btn-sm" onclick="openFinishOrdem(${pendOrdens[0].id})" style="gap:4px">
                ${lc('check',12,'#fff')} Finalizar
              </button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="openOrdemModal(${item.id})" style="gap:4px">
              ${lc('plus',12,'currentColor')} Ordem
            </button>
          </div>
        </div>

        <!-- Ordens pendentes expandidas (só quando há mais de 1) -->
        ${pendOrdens.length > 1 ? `
          <div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--border)">
            <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);padding-top:8px;margin-bottom:2px">Ordens pendentes</div>
            ${pendOrdens.map(o => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--orange-light);border:1px solid #FCD34D;border-radius:var(--r8)">
                <div style="font-size:var(--text-sm);font-weight:600">${fmt(o.qty)} ${item.unit} · Prog. ${fmtD(o.date)}${o.resp?' · '+o.resp:''}</div>
                <button class="btn btn-primary btn-sm" onclick="openFinishOrdem(${o.id})">${lc('check',11,'#fff')} Finalizar</button>
              </div>`).join('')}
          </div>` : ''}

        <!-- Última produção concluída -->
        ${lastProd ? `
          <div style="padding:4px 14px 8px;font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px;border-top:1px solid var(--border)">
            ${lc('check-circle',10,'var(--green)')} ${fmt(lastProd.qty)} ${item.unit} · Prog. ${fmtD(lastProd.date)}${lastProd.finishedAt ? ' · Conc. '+fmtDT(lastProd.finishedAt) : ''}${lastProd.resp ? ' · '+lastProd.resp : ''}
          </div>` : ''}

        <!-- Accordion ficha técnica de custo -->
        ${(() => {
          const ft = item.fichaTecnica;
          if (!ft?.ingredientes?.length) return `
            <div style="border-top:1px solid var(--border);padding:7px 14px;font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px">
              ${lc('clipboard',11,'currentColor')} Sem ficha técnica · <a href="#" style="color:var(--purple);text-decoration:none;font-weight:600" onclick="event.preventDefault();setCadTab('preparo');goModule('cadastros')">Cadastrar →</a>
            </div>`;
          // Recalcula ao vivo com preços atuais
          let totalFt = 0;
          const linhFt = ft.ingredientes.map(r => {
            const ins = items.find(x => x.id === r.item_id && !x.isProd);
            const preco = ins ? ins.cost : 0;
            const custo = (r.peso_g / 1000) * preco;
            totalFt += custo;
            return ins
              ? `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:.68rem;white-space:nowrap">${ins.name} ${r.peso_g}g <strong style="color:var(--purple)">R$ ${fmt(custo)}</strong></span>`
              : '';
          }).filter(Boolean).join('');
          const rendFt   = ft.rendimento_kg || 1;
          const custoKgFt = totalFt / rendFt;
          return `
            <div style="border-top:1px solid var(--border)">
              <button onclick="_ppToggleFicha(${item.id})" style="width:100%;text-align:left;background:none;border:none;padding:7px 14px;font-size:var(--text-xs);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px">
                <span style="display:flex;align-items:center;gap:5px">
                  ${lc('clipboard',11,'currentColor')}
                  Ficha técnica · <strong style="color:var(--purple)">R$ ${fmt(custoKgFt)}/kg</strong> · ${ft.ingredientes.length} ingredientes
                </span>
                <span id="fichachev_${item.id}" style="transition:transform .2s">${lc('chevron-down',11,'currentColor')}</span>
              </button>
              <div id="fichabox_${item.id}" style="display:none;padding:4px 14px 12px">
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">${linhFt}</div>
                <div style="font-size:.72rem;color:var(--muted)">Total insumos: <strong style="color:var(--text)">R$ ${fmt(totalFt)}</strong> · rendimento ${rendFt} kg → <strong style="color:var(--purple)">R$ ${fmt(custoKgFt)}/kg</strong></div>
              </div>
            </div>`;
        })()}
      </div>`;
  }).join('');
}


function clearPrepFiltro() {
  renderPreproducao();
}

function _ppVerFicha(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item?.ficha) return;

  const popup = document.createElement('div');
  popup.className = 'overlay open';
  popup.innerHTML = `
  <div class="modal" style="width:560px;max-height:86vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-size:var(--text-md);font-weight:700">${item.name}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Ficha Técnica · apenas leitura</div>
      </div>
      <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted)">${lc('x',16,'currentColor')}</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px;font-size:var(--text-sm);line-height:1.7;white-space:pre-wrap;color:var(--text)">${item.ficha.replace(/</g,'&lt;')}</div>
    <div style="padding:12px 20px;border-top:1px solid var(--border);flex-shrink:0;display:flex;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Fechar</button>
    </div>
  </div>`;
  popup.onclick = e => { if (e.target === popup) popup.remove(); };
  document.body.appendChild(popup);
}

function _ppToggleFicha(id) {
  const box  = document.getElementById('fichabox_' + id);
  const chev = document.getElementById('fichachev_' + id);
  if (!box) return;
  const open = box.style.display !== 'none';
  box.style.display           = open ? 'none' : 'block';
  if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
}

function zerarCicloPrepara() {
  vtpConfirm({
    title: 'Zerar ciclo de pré-produção',
    message: 'Zera a quantidade atual de todos os preparados e arquiva todas as ordens existentes. Após isso, importe o CSV do Cardápio Web.',
    confirmLabel: 'Zerar ciclo',
    onConfirm: () => {
      items.filter(i => i.isProd).forEach(i => { i.qty = 0; });
      saveI();
      const count = ordens.filter(o => !o.archived).length;
      ordens.forEach(o => o.archived = true);
      saveO();
      renderPreproducao();
      renderDashboard();
      toast(`Ciclo zerado! ${count} ordem(ns) arquivadas. Importe o CSV para atualizar.`);
    }
  });
}

function openOrdemModal(preItemId) {
  const sel = document.getElementById('opItem');
  sel.innerHTML = '<option value="">Selecionar...</option>' +
    items.filter(i => i.isProd).map(i => `<option value="${i.id}"${i.id === preItemId ? ' selected' : ''}>${i.name}</option>`).join('');
  document.getElementById('opQty').value  = '';
  document.getElementById('opObs').value  = '';
  document.getElementById('opDate').value = new Date().toISOString().slice(0, 10);
  // Popula selects de responsável e conferente com funcionários cadastrados
  const funcs = (typeof users !== 'undefined' ? users : []).filter(u => u.active !== false);
  const optsFunc = '<option value="">Selecionar...</option>' +
    funcs.map(u => `<option value="${u.name}">${u.name} — ${u.role}</option>`).join('');
  const respEl = document.getElementById('opResp');
  const confEl = document.getElementById('opConf');
  if (respEl) { respEl.innerHTML = optsFunc; respEl.value = ''; }
  if (confEl) { confEl.innerHTML = optsFunc; confEl.value = ''; }
  _ppUpdateCusto();
  document.getElementById('ovOrdem').classList.add('open');
  setTimeout(() => sel.focus(), 80);
}

// Custo em tempo real baseado na ficha técnica do preparado
function _ppUpdateCusto() {
  const el    = document.getElementById('opCustoInfo');
  const itemId = parseInt(document.getElementById('opItem')?.value);
  const qty    = parseFloat(document.getElementById('opQty')?.value) || 0;
  if (!el) return;

  if (!itemId) { el.style.display = 'none'; return; }

  const item = items.find(i => i.id === itemId && i.isProd);
  if (!item) { el.style.display = 'none'; return; }

  const ft = item.fichaTecnica;
  const custoKg = item.cost || 0;

  el.style.display = 'block';

  if (!ft || !ft.ingredientes?.length) {
    el.innerHTML = `
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 14px;font-size:.75rem;color:var(--muted)">
        ${lc('info',13,'currentColor')} <strong>${item.name}</strong> não possui ficha técnica — cadastre os ingredientes para ver o custo calculado.
      </div>`;
    return;
  }

  // Recalcula o custo ao vivo com preços atuais dos insumos
  let totalCusto = 0;
  const linhas = ft.ingredientes.map(r => {
    const ins  = items.find(i => i.id === r.item_id && !i.isProd);
    const preco = ins ? ins.cost : 0;
    const custo = (r.peso_g / 1000) * preco;
    totalCusto += custo;
    return ins ? `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
      <span>${ins.name} — ${r.peso_g}g</span>
      <span style="font-weight:600">R$ ${fmt(custo)}</span>
    </div>` : '';
  }).filter(Boolean).join('');

  const rendimento = ft.rendimento_kg || 1;
  const custoKgAtual = totalCusto / rendimento;
  const custoOrdem  = qty > 0 ? custoKgAtual * qty : null;

  el.innerHTML = `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light,#C4B5FD);border-radius:var(--r8);padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:.72rem;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.4px">
          ${lc('clipboard',12,'var(--purple)')} Custo da ficha técnica
        </span>
        <span style="font-size:.72rem;color:var(--muted)">${ft.ingredientes.length} ingredientes · rendimento ${rendimento} kg</span>
      </div>
      <div style="font-size:.72rem;color:var(--text);margin-bottom:8px;display:flex;flex-direction:column;gap:0">
        ${linhas}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1.5px solid var(--purple-light,#C4B5FD)">
        <span style="font-size:.75rem;font-weight:700;color:var(--purple)">Custo/kg atual</span>
        <span style="font-size:.88rem;font-weight:800;color:var(--purple)">R$ ${fmt(custoKgAtual)}/kg</span>
      </div>
      ${custoOrdem !== null ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding:8px 12px;background:var(--purple);border-radius:var(--r6);color:#fff">
        <span style="font-size:.75rem;font-weight:700">Custo total desta ordem (${qty} ${item.unit})</span>
        <span style="font-size:1rem;font-weight:800">R$ ${fmt(custoOrdem)}</span>
      </div>` : ''}
    </div>`;
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
  toast('Ordem criada!');
}

function openFinishOrdem(id) {
  const o    = ordens.find(x => x.id === id);
  const item = items.find(i => i.id === o?.itemId);
  if (!o || !item) return;

  document.getElementById('respTitle').textContent = `Finalizar: ${item.name}`;
  document.getElementById('respBody').innerHTML = `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;font-size:var(--text-sm);margin-bottom:14px">
      <strong>Quantidade planejada:</strong> ${o.qty} ${item.unit}<br>
      <strong>Data:</strong> ${fmtD(o.date)} · ${o.turno || '—'} · ${o.resp || '—'}
    </div>
    <div class="field">
      <label>Quantidade realizada (${item.unit})</label>
      <input class="inp" type="number" id="fOrdemReal" value="${o.qty}" min="0" step="0.01"
        placeholder="${o.qty}" style="font-size:1rem;font-weight:700;text-align:center">
      <span style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">
        Informe o que realmente foi produzido. Pode ser diferente do planejado.
      </span>
    </div>
    <div class="field" style="margin-top:8px">
      <label>Observação (opcional)</label>
      <input class="inp" id="fOrdemObs" placeholder="ex: rendeu menos por conta da textura da carne..." value="${o.obs || ''}">
    </div>`;
  document.getElementById('respFoot').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal('ovResponse')">Cancelar</button>
    <button class="btn btn-primary" onclick="finishOrdem(${id})">Confirmar produção</button>`;
  document.getElementById('ovResponse').classList.add('open');
}

function finishOrdem(id) {
  const o    = ordens.find(x => x.id === id);
  const item = items.find(i => i.id === o?.itemId);
  if (!o || !item) return;

  const qtyReal = parseFloat(document.getElementById('fOrdemReal')?.value) ?? o.qty;
  const obs     = document.getElementById('fOrdemObs')?.value?.trim() || o.obs;

  o.status     = 'produzido';
  o.qtyReal    = parseFloat(qtyReal.toFixed(3));
  o.obs        = obs;
  o.finishedAt = new Date().toISOString();

  // Atualiza estoque com quantidade REAL produzida
  item.qty = parseFloat((item.qty + o.qtyReal).toFixed(3));
  saveI();
  saveO();
  closeModal('ovResponse');
  renderPreproducao();
  renderDashboard();
  toast(`Produção registrada! ${o.qtyReal} ${item.unit} adicionados ao estoque.`);
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
      <span style="font-size:var(--text-xs);font-weight:700;color:var(--text2)">${filtered.length} ordem(ns) encontrada(s)</span>
    </div>
    ${filtered.map(o => {
      const item = items.find(i => i.id === o.itemId);
      return `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;background:var(--surface)">
        <input type="checkbox" class="pdf-chk" value="${o.id}" checked style="accent-color:var(--purple);width:15px;height:15px;flex-shrink:0">
        <div style="flex:1">
          <div style="font-size:var(--text-sm);font-weight:600">${item?.name || '—'}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${fmtD(o.date)} · ${o.qty} ${item?.unit || 'kg'} · ${o.turno || '—'} · ${o.resp || '—'}</div>
          ${o.finishedAt ? `<div style="font-size:var(--text-2xs);color:var(--green);margin-top:2px;display:flex;align-items:center;gap:4px">${lc('check-circle',9,'currentColor')} Concluído ${fmtDT(o.finishedAt)}</div>` : ''}
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
    .logo-box{width:56px;height:56px;display:flex;align-items:center;justify-content:center}
    .logo-box img{width:56px;height:56px;object-fit:contain}
    .logo-text{font-size:1.1rem;font-weight:800;color:#6B21D4}
    .logo-sub{font-size:var(--text-xs);color:#9B91B8;margin-top:2px}
    .header-right{text-align:right;font-size:var(--text-xs);color:#9B91B8}
    .summary{background:#F5F3FF;border:1.5px solid #E5DEFF;border-radius:8px;padding:12px 14px;margin-bottom:20px;display:flex;gap:24px}
    .sum-val{font-size:1.2rem;font-weight:800;color:#6B21D4}
    .sum-lbl{font-size:var(--text-2xs);color:#9B91B8;text-transform:uppercase;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;font-size:var(--text-sm);margin-bottom:28px}
    thead th{background:#6B21D4;color:#fff;padding:9px 10px;text-align:left;font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.5px}
    tbody tr{border-bottom:1px solid #E5DEFF}
    tbody tr:nth-child(even){background:#F5F3FF}
    td{padding:9px 10px;vertical-align:top}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:var(--text-2xs);font-weight:700}
    .b-pend{background:#FEF3C7;color:#D97706}
    .b-prod{background:#DCFCE7;color:#16A34A}
    .sign-area{display:flex;gap:20px;margin-top:8px}
    .sign-box{flex:1;border-top:1.5px solid #1a0a2e;padding-top:4px;font-size:var(--text-xs);color:#9B91B8;text-align:center}
    .footer{margin-top:24px;border-top:1px solid #E5DEFF;padding-top:10px;font-size:var(--text-xs);color:#9B91B8;display:flex;justify-content:space-between}
    @media print{body{padding:12px}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iQ2FtYWRhXzIiIGRhdGEtbmFtZT0iQ2FtYWRhIDIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDE5My41OCAyMDIuMzYiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6ICM3NTE4Y2Q7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxnIGlkPSJDYW1hZGFfMS0yIiBkYXRhLW5hbWU9IkNhbWFkYSAxIj4KICAgIDxnPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik05OC44OSwyMDIuMzZjLTcuNDcsMC0xMC44Mi05LjktMTQuMjgtMTUuMjYtMS41NC0yLjM4LTUuNzgtMS45Ny05LjYxLTUuNDktNC4zOC00LjAyLTIuNDgtNy43OC02LjUtMTAuMzItNC41Ny0yLjg4LTguNzYtMi43NS0xMS43MS0zLjU4LTEuMy0uMzctNC45LTEuMzQtMS4yLTcuNzIsNy41LTEyLjkzLDM0LjQ3LTE3LjY5LDU2LjY5LTE4LjA4LDcuNzYtLjE0LDE3Ljk1Ljk5LDI0LjMxLTUuMDYsMi40OC0yLjM2LDMtNi40NSwzLjAxLTkuODcsMC0xLjgxLS4zMi0zLjEtLjk3LTMuNzYtMS4yMi0xLjI2LTUuMTMtLjc1LTUuMzguMjItMS41LDUuMzItLjE1LDEwLjQyLTcuNTksMTAuNi01LjAxLjEzLTUuODgtMS4xMi00LjY1LTUuNzYsMy42NC0xMy44MSw5LjgxLTI5LjI1LDE0LjQ5LTM4Ljk0Ljg3LTEuODEsMi4wNy0zLjQyLDQuMTQtMy45MSwxLjc4LS40Miw4LjIsMS4wNSw5LjQsMi40MiwxLjgzLDIuMDgsMS45LDYuMTQsMS44LDguODQtLjQsMTEuMDQtMy4yLDIyLjM2LTIuNTEsMzMuMzUuMjksNC42NiwxLjU4LDYuMjIsMS43NSw5LjMxLjIxLDMuNjYtMi41NSw1LjAyLTUuMDksNS42Ni0zLjM0LjgzLTguMzUsNC42Mi0xMC4yMSw4LjM2LTEuMzQsMi42OC0xLjA0LDUuNTktMy4xOSw3LjkxLTMuNDIsMy43LTYuNjcsMy4zMi05LjIyLDguMDItMi4zMSw0LjI2LTEuMzUsNy4zOC00LjUyLDEyLjItMy41Nyw1LjQzLTYuMzgsNS4yMS04LjEsNy4zOS00LjA5LDUuMTktNC43NywxMy40Ni0xMC44NiwxMy40NlpNMTQxLjc5LDk4LjFjLTEuNTUsMC02LjI3LDE1LjQ1LTYuMjcsMTUuNDUuMzEuODEsMy4zNywxLjI1LDQuMjEsMS4xNy4zNS0uMDMuNjksMCwuODUtLjQsMCwwLDIuNC0xNi4yMiwxLjIxLTE2LjIyWiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0zOS4yOCw5Ni4wNmM3Ljk2LTMuODcsMTYuMjgtLjg3LDE5LjczLDcuMzUsMy40LDguMDksMS40NSwxOC41NC00LjE3LDI1LjEyLTEuNTgsMS44NS00LjYxLDMuNTEtMy4yNiw2LjM4LDIuNjgsNS42OCwxMC4wMyw5LjAzLDYuNDIsMTUuNzYtMy4xNiw1LjkyLTEwLjE3LDYuNzctMTIuNDkuNjQtMS4zMS0zLjQ3LTIuMDgtNy44MS0zLjI0LTExLjQ0LTEuNzEtNS4zNS0zLjQ2LTEwLjg1LTUuMzQtMTYuMTQtLjQyLTEuMi0xLjA3LTMuMzQtMS42OS00LjMyLTEuNDQtMi4zLTMuMjguMzEtNS44NC0xLjIxLTMuODgtMi4zMS0yLjQ0LTcuOTItLjktMTEuMjMsMi4yMi00Ljc1LDYuMDItOC42MSwxMC43Ni0xMC45MVpNNDEuNiwxMDUuMThjLS40Ny40LS44NywxLjE2LS42OCwxLjk1LDEuMTksNC45MiwzLjM0LDEwLjkyLDUuMjcsMTUuNjksMS4wMiwyLjUzLDMuNDUtMS45NSwzLjkzLTMuMzksMS4yOS0zLjk0LDEuNjMtOC43OS0yLjM1LTEzLjQ4LTEuNTMtMS44MS00LjMzLTIuMzItNi4xNy0uNzZaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEwNi4zNSw4My4xNGMyLjc4LTEuMDQsMTYuNDQtLjQsMTkuMjguNzgsMS4zNC41NiwyLjUxLDEuMzgsMi44NywyLjg4LDEuMjEsNS4wNS00LjQxLDEzLjY0LTcuMDIsMTguMDQtNC4wOCw2LjkxLTcuNjIsMTIuNDctMTAuMjYsMTguMzEsMS4xNSwxLjEyLDUuNDEtLjEzLDcuNjQtLjM3LDEuMDMtLjExLjcxLDMuMzIuNTEsNC40Ni0uMzMsMS45NS0uODIsNi40LTMuMDQsNi43LTMuMzcuNDctNy4wNi43Ni0xMC40Mi42Ny0yLjItLjA2LTQuNS0uMy01LjA4LTIuOC0xLjMtNS42LDUuNTItMTcuNjEsOC43NS0yNC4yMywxLjgzLTMuNzYsNS40My05LDcuMTItMTMuMi4zNS0uODUtMi44Ny0xLjExLTUuMzMtLjM1LTQuMzUsMS4zNi02LjYzLDEuMzgtNy4yMS0yLjI1LS4yOC0xLjc4LS4zMi0zLjgzLS4xNy01LjYxLjEzLTEuNTMuODUtMi40OCwyLjM1LTMuMDRaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTc3LjYxLDg2LjljMi42My0xLjM3LDE2LjcxLTMuNTIsMTkuNzktMy4zOSwxLjk2LjA4LDMuMTMsMS41NywzLjY3LDMuMDIsMS44Miw0Ljg5LTMuOTQsMTUuMjktNS42OSwyMC4xLTIuMzYsNi41LTQuNTYsMTMuMDUtNi44NiwxOS41NywzLjYyLjExLDcuMDUtMS44NCw5LjM0LTIuMTcsMS4wMi0uMTUsMS4xLDMuMjIsMS4wNSw0LjM4LS4wOSwxLjk4LS4zOSw2LjQ5LTIuNTYsNy4wNi0zLjI5Ljg3LTguMzYsMi40NS0xMS43MiwyLjc3LTIuMTkuMi00LjUxLjI0LTUuMzktMi4xOC0xLjk4LTUuNDIsMy4zNS0xOC4yLDUuNzUtMjUuMTgsMS4zNi0zLjk3LDMuOTYtMTAuNDEsNS4xMy0xNC43OS4yNS0uODgtMy4xNi0uOC01LjUxLjI2LTQuMTUsMS44Ny03LjExLDIuOTUtOC4xMi0uNTktLjQ5LTEuNzQtLjgyLTMuNzgtLjg4LTUuNTctLjA1LTEuNTQuNTgtMi41NywxLjk5LTMuM1oiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNNjMuNTksODkuMjRjMS44Mi0uNzgsNS44Mi0yLjQzLDcuMTgtLjI0LDEuMzksMi4yNCwxLjgsMTEuNzMsMi4zLDE2LjkyLjU5LDYuMiwxLjI2LDEzLjIsMi4zLDE5LjM0LjUxLDMsMi42MywxMC44NSwyLjIzLDEzLjI4LS42LDMuNi05LjEsNS44My0xMC4yLDEuNjUtMS4zOS04LjI1LTEuMzktMTcuMDctMi45Mi0yNS4zLTEuMTgtNi4zNy0zLjk2LTE1LjA2LTQuMjgtMjEuMjQtLjE0LTIuNjUsMS4xOS0zLjQ2LDMuNC00LjQxWiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNjMuOTEsOTAuMjNjNS41MS0yLjMyLDguNzcsMy4wNSw3LjgsOC4xLTEuNDEsNy4zMi02LjY4LDE3Ljk5LTEwLjMsMjMuMzktMS45NywyLjU2LTUuODcsMS41OS01LjUtMS45OS4zMi0zLjExLDEuNTItNi45NSwyLjA3LTEwLjE0Ljc0LTQuMjIsMS4xLTguODYsMi4xMS0xMi45Ny41Ni0yLjI4LDEuNDMtNS40LDMuODItNi40WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNTYuNDEsMTI0Ljk1YzUuMzIuOTIsNS40OCw5LjE0LjYsMTAuNzctNy4xLDIuMzctOC4wNS0xMi4wNS0uNi0xMC43N1oiLz4KICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTg1LjgzLDI0LjYyYy0zLjk5LTIuOTktMTYuNjctMTEuNjgtMjEuODQtMTMuNDhDMTE2LjI5LTUuMzksNjUuMjktNC45LDIwLjI0LDIxLjkyLDExLjUsMjcuMTItMy4yOSwzNi4xMi42Niw0Ny41M2MxLjQ2LDQuMjIsNi4zMiw5Ljg5LDkuMDMsMTMuNzQsMi4zOSwzLjM3LDUuNDQsOS41NCw3LjA3LDE0LjMyLDEuMzksNC4wNyw1LDE3LjI5LDguNTksMTkuOCwzLjM1LDIuMzUsNi4wOC0zLjY4LDUuNzQtNi43OC0uNTctNS4yNS00Ljg2LTguNDUtNi4zNi0xMy4wOS0xLjUyLTMuNTMtMi41OS0xMi40MS02LjAyLTE4LjMtNS4wNy04LjczLDMuNDEtMTMuNzEsNi4yMi0xNC4zMyw1Ljg5LTEuMzEsMTEuOC0uNjUsMTYuMjItMi44Myw1LjM3LTIuNjUsOS41NS0xMC42NCwxNC44Ny0xMS44NSwyLjgyLS42NSw2LjIyLS4yNSw5LjA3LS44MSw0LjQyLS44Niw4LjkxLTMuMzgsMTMuNTItNC4yNyw4Ljc3LTEuNjksMTYuMjEsMS41MSwyNC43Ni44NCw0LjQ5LS4zNSw4LjkzLTEuNDcsMTMuNDQtMS40NSw4Ljk4LjA0LDE3LjYxLDYuNzMsMjYuMjgsNy44MSw4LjQ1LDEuMDYsMjYuMSw3Ljc3LDMwLjY3LDE2LjM4LDUuNTUsMTAuNDYuNywxMC4yMy0yLjMxLDIxLjE2LS42NCwyLjMzLTIuNTksOC44My0xLjgzLDEyLjE3Ljg2LDMuNzgsNS4xNiwzLjk5LDcuMjguMzksMy40LTUuNzgsMy4wMy0xMC42Miw1LjItMTUuMywxLjctMy42OCw0LjI0LTguNDgsNS44Ny0xMS41LDQuNDItOC4xNywxMC45Ny0xOS4xNS0yLjE1LTI4Ljk4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik03OS4wNywzMy44NGMxLjgyLDEuNiwxLjcsMTUuMDksMy4wOSwyNC44NC4zOSwyLjcxLDEuODIsMTQuMTksMi4xNCwxNi44Mi40NCwzLjYxLTMuMzcsNS4wNy01Ljk2LDUuNTQtNS4yLjk0LTMuMTYtNi4zNi00LjkzLTcuOTctLjc2LS42OS00LjEyLjQ0LTUuMDguODQtMS4zNy41Ny0xLjY0LDYuMTMtMS45Myw3LjYxLS42MSwzLjExLTMuNzIsNC4yMS02LjI5LDQuNTItMy43NS40NS0zLjQ4LTMuMjUtMy4xLTYuMDIuNzctNS40NSwyLjUzLTExLjYzLDMuNjEtMTcuMTMsMS4xOS02LjA2LDIuNDItMTIuMDksMy44Mi0xOC4xLjYzLTIuNjgsMS40MS03LjQ1LDMuNDQtOS4xMywxLjU0LTEuMjgsOS42MS0zLjIsMTEuMi0xLjgyWk03MS44Niw0OC4wNmMtLjQ1LjItMS4wMiw0LjA1LTEuMzYsNS45MS0uMzksMi4xNi0xLjcsOC4wMi0yLDEwLjc0LjAyLDEuMDIsNC45Mi40Myw1LjI2LS44Ny4zMy0xLjMtLjYxLTExLjQxLTEuMTctMTQuOTUtLjA2LS4zNi0uMTktMS4wNy0uNzMtLjgzWiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNjAuMDksNzEuNTRjLS40Ny4xOC0uMjksMi4yMy4yMiwzLjIuOTcsMS44MywyLjE1LDMuMjEsNC45Myw0LjU1LDMuNzEsMS43OC0yLjk4LDcuNjItNC45Myw3LjMxLTMuMzktLjUzLTQuNjgtMy45Ny01LjI1LTYuMDQtMS40MS01LjEyLS4xNC04LjU1LTEuNjktOC40Ni0uNTUuMDMtLjUyLjcyLS44MywxLjg0LS41MSwxLjgtLjk4LDcuODctMi4wOCw4LjU2LTEuNC44OC04LjE4LjE2LTcuMi0zLjE0LDEuMzktNi4xNiwzLjA4LTEyLjI1LDQuMzYtMTguNDQuOTYtNC42MSwxLjU4LTExLjg3LDIuODMtMTUuNDkuODgtMi41Nyw0LjUyLTEuMzMsNi40OC0uOCw3LjcyLDIuMSwxNC4zOSw3LjYyLDExLjgsMTguMzMtMS4yNiw1LjIyLTQuNDYsOC4xMy04LjYzLDguNTlaTTE1Ny44MSw1Mi44NmMtMS4wOC0uMTktLjkzLDIuMTUtMi45MiwxMC44OSw3LjU0LDIuNyw3Ljg0LTEwLjA0LDIuOTItMTAuODlaIi8+CiAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEyNi45Nyw0NC43NmMtMS4xLDEuNDUtNi4wOC0uNjMtNi41NS4xLS4yNCwxLjA2LS4yOSwzLjQyLS4zNSw0LjU0LS4yOCw0LjcxLS42MSw4LjY0LTEuMDMsMTMuMzQtLjM1LDMuODktLjQ3LDcuNjUtLjkxLDExLjQxLS4xMS45OC0uMjIsMi4wMS0uOTgsMi42OS0xLjcxLDEuNTMtNy4zNywxLjg5LTguNC0uOS0uNzktMi4xNi4yOS03LjA2LjY4LTkuNTIuNzMtNC42OSwxLjI5LTguODQsMS43LTEzLjUzLjE0LTEuNTcuNjEtNi45OS4zMy04LjIzLS40Ny0yLjA5LTYuMDMuNC03LjgyLTIuMDMtLjctLjk1LS45NC0zLjUzLTEuMDktNC44NC0uMTMtMS4xOC0uNDMtNC44NC4wMy01Ljc1LDEuMTEtMi4yLDcuODUtMS4xNSw5LjY3LS45Niw0LjMuNDcsNi42NSwxLjE3LDEwLjgxLDIuMzIsMy4xNi44Nyw0LjQ5LDEuNjMsNS4xMiwzLjQ4LjM0LDEtLjA4LDYuNDItMS4xOCw3Ljg4WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNDEuMDIsNjIuODljLTEuMTIsMS44Ni01LjAxLTEuNy01LjgxLS4xMS0uNjMsMS4yNS0xLjQsNS4xOS0uNCw2LjE1Ljg4Ljg0LDUuNDcuMzYsNy4xNSwyLjE5LDEsMS4xLS43Miw3LjMyLTIsOC4xMi0xLjYzLDEuMDItNS42NS0uMjgtNy41NC0uN3MtNi43OC0uNDQtNy41Ny0yLjU3Yy0uMzktMS4wNS0uMjItMi4xMS0uMS0zLjE5LjU2LTQuNzcsMi4yMS0xMS43OSwzLjA1LTE2LjgzLjk3LTUuODIsMS41NC0xMS4yNSwyLjYtMTYuODkuMzMtMS43OS42Ny0yLjcxLDIuNi0yLjc2LDEuNjktLjA1LDExLjk3LDMuMzQsMTMuMzMsNC42MywxLjc0LDEuNjYsMS44LDMuMTcsMS4zOSw1LjQ4LTEuMzgsNy42Ni02LjQxLDEuMjEtOS42OSwxLjU1LS44OS4wOS0yLjM3LDQuNzItMS4xMyw2LjExLjgyLjkyLDQuOS42Myw1LjU4LDIuNDguMTkuNTEtMS4yLDUuOTItMS40Niw2LjM0WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik04OC4xMSwzMi4wNGMxLjc0LS42MSw1Ljc3LTEuNjQsNi43NS4zMywxLjAxLDIuMDItLjA2LDEyLjM2LS4yMSwxNS4zOC0uMjQsNC41NS0uMzEsOS4yOC42LDE2LjMyLjM0LDIuNjMsMi4wNCw5LjMzLDEuNCwxMS40NC0uOTUsMy4xMi05LjU4LDQuNjctMTAuMTEuOTctLjMyLTcuMjktLjg3LTE0LjU3LTEuMzEtMjEuODQtLjM0LTUuNjMtMS44LTEyLjIxLTEuMzktMTcuNjMuMTgtMi4zMywyLjE2LTQuMjMsNC4yNi00Ljk3WiIvPgogICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0yNS4xNCw1Mi40M2MxLjgxLTIuOCw5LjMyLTUuMjQsMTIuMDMtMy44OCwyLjE2LDEuMDgsMy41Nyw0Ljk1LDQuNzcsMTEuNiwxLjA4LDYsMi4yNiwxMS4zMyw0LjM4LDE2LjgyLjI4LjEzLjc2LTQuMTQuOTItNiwuOS0xMC42LDEuNjEtMTUuNDIsMi45MS0yMy41Mi42Ny00LjE4LDIuOTktOC4yOSw2LjkyLTkuODQsNS0xLjk2LDQuOTMsMS4wNSw0LjI0LDQuNDgtMS42Niw4LjIxLTQuMzEsMTkuNTEtNS44NCwyNy45Ni0uNjYsMy42NC0xLjA1LDcuNDctMS43MiwxMS4wNy0uOTIsNC45MS0xLjQxLDcuOTEtNi4yMyw5Ljc0LTQuOTMsMS44Ny01Ljg0LjQ5LTcuNjEtNC40My0yLjE1LTUuOTYtMy43OS0xMi42LTUuNS0xOC44LS43My0yLjY1LTEuNDktNS40Ni0zLjEzLTYuMzEtMS41My0uOC0yLjY3Ljg2LTQuNzYtLjM0LS45My0uNTQtNC43Ny0zLjM1LTEuMzktOC41NloiLz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPg==" alt="Vai Ter Pizza!" style="width:56px;height:56px;object-fit:contain">
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
          <td style="color:#9B91B8;font-size:var(--text-xs)">${i + 1}</td>
          <td><strong>${item?.name || '—'}</strong>${item?.medPorcao ? `<br><span style="font-size:var(--text-xs);color:#9B91B8">Porção: ${item.medPorcao} kg/porção</span>` : ''}</td>
          <td><strong>${o.qty} ${item?.unit || 'kg'}</strong></td>
          <td>${fmtD(o.date)}</td>
          <td>${o.turno || '—'}</td>
          <td>${o.resp  || '—'}</td>
          <td>${o.conf  || '—'}</td>
          <td><span class="badge ${o.status === 'produzido' ? 'b-prod' : 'b-pend'}">${o.status === 'produzido' ? 'Produzido' : 'Pendente'}</span></td>
          <td style="font-size:var(--text-xs);color:#4B4569">${o.obs || '—'}</td>
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
  toast('PDF gerado!', 'ok');
}

// ══════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════

function renderFornecedores() {
  const el = document.getElementById('supGrid');
  if (!suppliers.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon" style="font-size:0">${lc("building-2",13,"var(--muted)")}</div><div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">Nenhum fornecedor</div><div>Cadastre seu primeiro fornecedor!</div></div>`;
    return;
  }
  el.innerHTML = suppliers.map(s => {
    const si = items.filter(i => { const ids=i.supIds?.length?i.supIds:(i.supId?[i.supId]:[]); return ids.includes(s.id); });
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditSup(${s.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:var(--text-md);font-weight:700">${s.name}</div>
          ${s.seller ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${lc("user",14,"currentColor")} ${s.seller}</div>` : ''}
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditSup(${s.id})">${lc("edit-2",13,"currentColor")}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
        ${s.phone ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("phone",13,"var(--muted)")} ${s.phone}</div>` : ''}
        ${s.email ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("mail",14,"currentColor")} ${s.email}</div>` : ''}
        ${s.cats  ? `<div style="font-size:var(--text-xs);color:var(--muted)">${s.cats}</div>` : ''}
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
  ['sfName','sfSeller','sfPhone','sfEmail'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const sfFE = document.getElementById('sfFormaEntrega'); if(sfFE) sfFE.value = 'entrega';
  document.getElementById('eSupId').value = '';
  document.getElementById('delSupBtn').style.display = 'none';
  const srch = document.getElementById('sfItemSearch'); if(srch) srch.value = '';
  renderSupCbx([]);
  renderCatTags([]);
  document.getElementById('ovSup').classList.add('open');
  setTimeout(() => document.getElementById('sfName').focus(), 80);
}

function openEditSup(id) {
  const s = suppliers.find(x => x.id === id);
  if (!s) return;
  editSupId = id;
  document.getElementById('supModalTitle').innerHTML = `${lc("edit-2",13,"currentColor")} ${s.name}`;
  document.getElementById('sfName').value   = s.name   || '';
  document.getElementById('sfSeller').value = s.seller || '';
  document.getElementById('sfPhone').value  = s.phone  || '';
  document.getElementById('sfEmail').value  = s.email  || '';
  const sfFE2 = document.getElementById('sfFormaEntrega'); if(sfFE2) sfFE2.value = s.formaEntrega || 'entrega';
  document.getElementById('eSupId').value   = id;
  document.getElementById('delSupBtn').style.display = 'inline-flex';
  const srch = document.getElementById('sfItemSearch'); if(srch) srch.value = '';
  renderSupCbx(items.filter(i => { const ids=i.supIds?.length?i.supIds:(i.supId?[i.supId]:[]); return ids.includes(id); }).map(i => i.id));
  // Carrega categorias salvas como array
  const cats = Array.isArray(s.cats) ? s.cats : (s.cats ? s.cats.split(',').map(c => c.trim()).filter(Boolean) : []);
  renderCatTags(cats);
  document.getElementById('ovSup').classList.add('open');
}

function renderSupCbx(linked, q) {
  // Preserva checkeds existentes se já renderizado
  const existingChecked = [...(document.querySelectorAll('#sfItems input:checked') || [])].map(c => parseInt(c.value));
  const allLinked = [...new Set([...linked, ...existingChecked])];

  const query = (q !== undefined ? q : (document.getElementById('sfItemSearch')?.value || '')).toLowerCase().trim();

  const insumos = [...items]
    .filter(i => !i.isProd)
    .filter(i => !query || i.name.toLowerCase().includes(query) || i.cat.toLowerCase().includes(query))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  // Agrupa por categoria
  const byCat = {};
  insumos.forEach(i => { if (!byCat[i.cat]) byCat[i.cat] = []; byCat[i.cat].push(i); });

  const el = document.getElementById('sfItems');
  if (!insumos.length) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);font-size:var(--text-sm)">Nenhum insumo encontrado</div>`;
    return;
  }

  el.innerHTML = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:8px">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:4px 8px 4px 0;margin-bottom:3px">${cat}</div>
      ${catItems.map(i => {
        const isChecked = allLinked.includes(i.id);
        return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r6);cursor:pointer;font-size:var(--text-sm);border:1.5px solid ${isChecked ? 'var(--purple-light)' : 'var(--border)'};background:${isChecked ? 'var(--purple-xlight)' : 'var(--surface)'};margin-bottom:3px;transition:all .1s" onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="if(!this.querySelector('input').checked)this.style.borderColor='var(--border)'">
          <input type="checkbox" value="${i.id}" ${isChecked ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--purple);flex-shrink:0"
            onchange="this.closest('label').style.borderColor=this.checked?'var(--purple-light)':'var(--border)';this.closest('label').style.background=this.checked?'var(--purple-xlight)':'var(--surface)'">
          <span style="flex:1">${query ? i.name.replace(new RegExp(query,'gi'), m => `<mark style="background:var(--yellow-light);border-radius:2px;padding:0 1px">${m}</mark>`) : i.name}</span>
          ${i.code ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">#${i.code}</span>` : ''}
        </label>`;
      }).join('')}
    </div>`).join('');
}

function filterSupItems() {
  const linked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));
  renderSupCbx(linked);
}


// Categorias pré-definidas para fornecedores
const SUP_CATS = ['Laticínios','Massas','Carnes e Frios','Embalagens','Molhos','Produção Interna','Bebidas','Higiene/Limpeza','Descartáveis','Outros'];

function renderCatTags(selected) {
  const wrap = document.getElementById('sfCatsWrap');
  if (!wrap) return;
  wrap.innerHTML = SUP_CATS.map(cat => {
    const active = selected.includes(cat);
    return `<span class="sup-cat-tag${active ? ' active' : ''}" data-cat="${cat}"
      style="padding:3px 10px;border-radius:20px;font-size:var(--text-xs);font-weight:600;cursor:pointer;border:1.5px solid ${active ? 'var(--purple)' : 'var(--border)'};background:${active ? 'var(--purple)' : 'var(--surface)'};color:${active ? '#fff' : 'var(--text2)'};transition:all .15s;user-select:none"
      onclick="toggleCatTag(this)">${cat}</span>`;
  }).join('');
}

function toggleCatTag(el) {
  el.classList.toggle('active');
  const isActive = el.classList.contains('active');
  el.style.background   = isActive ? 'var(--purple)' : 'var(--surface)';
  el.style.borderColor  = isActive ? 'var(--purple)' : 'var(--border)';
  el.style.color        = isActive ? '#fff' : 'var(--text2)';
}

// Badge críticos na sidebar (estoque + pré-produção)
function updatePrepBadge() {
  const prepCrit = items.filter(i => i.isProd && gst(i) === 'crit').length;
  const badge = document.getElementById('prepBadge');
  if (badge) { badge.textContent = prepCrit > 0 ? prepCrit : ''; badge.style.display = prepCrit > 0 ? 'inline-flex' : 'none'; }

  const estCrit = items.filter(i => !i.isProd && gst(i) === 'crit').length;
  const badgeEst = document.getElementById('badge-estoque');
  if (badgeEst) { badgeEst.textContent = estCrit > 0 ? estCrit : ''; badgeEst.style.display = estCrit > 0 ? 'inline-flex' : 'none'; }
}

function saveSup() {
  const name = document.getElementById('sfName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const checked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));
  // Pega categorias das tags selecionadas
  const selectedCats = [...document.querySelectorAll('.sup-cat-tag.active')].map(t => t.dataset.cat);
  const data = {
    name,
    seller:       document.getElementById('sfSeller').value.trim(),
    phone:        document.getElementById('sfPhone').value.trim(),
    email:        document.getElementById('sfEmail').value.trim(),
    cats:         selectedCats.join(', '),
    formaEntrega: document.getElementById('sfFormaEntrega')?.value || 'entrega',
  };
  if (editSupId) {
    const idx = suppliers.findIndex(s => s.id === editSupId);
    if (idx >= 0) suppliers[idx] = { ...suppliers[idx], ...data };
    items.forEach(i => { if(i.supIds) i.supIds=i.supIds.filter(x=>x!==editSupId); if(i.supId===editSupId) i.supId=i.supIds?.[0]??null; });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = editSupId; });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" atualizado!`);
  } else {
    const nid = nextSid++;
    suppliers.push({ id: nid, ...data });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = nid; });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" cadastrado!`);
  }
  saveS(); saveI();
  closeModal('ovSup');
  renderFornecedores();
  renderDashboard();
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
      items.forEach(i => { if(i.supIds) i.supIds=i.supIds.filter(x=>x!==editSupId); if(i.supId===editSupId) i.supId=i.supIds?.[0]??null; });
      saveS(); saveI();
      closeModal('ovSup');
      renderFornecedores();
      renderDashboard();
      toast(`${lc("trash-2",14,"currentColor")} "${s.name}" excluído.`);
    }
  });
}

// renderRelatorios() → ver js/relatorios.js


function renderUsuarios() {
  // Usa a versão nas configurações (aba Usuários)
  if (typeof setCfgTab === 'function') { setCfgTab('usuarios'); return; }
}

function openUserModal() {
  if (typeof _cfgAbrirModalUsuario === 'function') _cfgAbrirModalUsuario(null);
}

function openEditUser(id) {
  if (typeof _cfgAbrirModalUsuario === 'function') _cfgAbrirModalUsuario(id);
}

function saveUser()         { /* delegado ao modal unificado */ }
function deleteUser()       { /* delegado ao modal unificado */ }
function renderPermPreview(){ /* substituído pelo modal unificado */ }

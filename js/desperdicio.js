/**
 * VTP Compras — Vai Ter Pizza!
 * desperdicio.js — Módulo de Controle de Desperdício
 */

// ══════════════════════════════════════════════════════════════
// DADOS
// ══════════════════════════════════════════════════════════════
let desperdicios = db._get('vtp_desperdicios', []);
const saveD = () => db._set('vtp_desperdicios', desperdicios);

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function _populaDespTipoSelects() {
  const opts = TIPOS_DESPERDICIO.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  const fil  = document.getElementById('despTipoFil');
  const frm  = document.getElementById('fdTipo');
  if (fil) fil.innerHTML = '<option value="">Todos os tipos</option>' + opts;
  if (frm) frm.innerHTML = opts;
}

function renderDesperdicio() {
  _populaDespTipoSelects();
  const de   = document.getElementById('despDe')?.value  || '';
  const ate  = document.getElementById('despAte')?.value || '';
  const tipo = document.getElementById('despTipoFil')?.value || '';

  const filt = desperdicios.filter(d => {
    if (de  && d.date < de)      return false;
    if (ate && d.date > ate)     return false;
    if (tipo && d.tipo !== tipo) return false;
    return true;
  });

  const _getCusto = d => {
    if (d.custo !== undefined && d.custo !== null) return d.custo;
    const item = items.find(i => i.id === d.itemId);
    return (item?.cost || 0) * d.qty;
  };

  const totalCusto = filt.reduce((s, d) => s + _getCusto(d), 0);

  const porTipo = {};
  TIPOS_DESPERDICIO.forEach(t => { porTipo[t.id] = { qty: 0, custo: 0 }; });
  filt.forEach(d => {
    if (!porTipo[d.tipo]) porTipo[d.tipo] = { qty: 0, custo: 0 };
    porTipo[d.tipo].qty   += d.qty;
    porTipo[d.tipo].custo += _getCusto(d);
  });

  // ── KPIs ──
  document.getElementById('despKpi').innerHTML = `
    <div class="kpi">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc('clipboard-list', 16, 'var(--muted)')}
        <div class="kpi-v" style="color:var(--red)">${filt.length}</div>
      </div>
      <div class="kpi-l">Registros</div>
    </div>
    <div class="kpi">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc('dollar-sign', 16, 'var(--muted)')}
        <div class="kpi-v" style="color:var(--red);font-size:1.1rem">R$ ${fmt(totalCusto)}</div>
      </div>
      <div class="kpi-l">Custo desperdiçado</div>
    </div>
    ${TIPOS_DESPERDICIO.filter(t => porTipo[t.id]?.custo > 0).sort((a,b) => porTipo[b.id].custo - porTipo[a.id].custo).slice(0,3).map(t => `
      <div class="kpi">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          ${lc(t.icon, 16, t.color)}
          <div class="kpi-v" style="font-size:1rem;color:${t.color}">R$ ${fmt(porTipo[t.id].custo)}</div>
        </div>
        <div class="kpi-l">${t.label}</div>
      </div>`).join('')}`;

  // ── Gráfico por tipo ──
  const maxCusto = Math.max(...Object.values(porTipo).map(v => v.custo), 1);
  document.getElementById('despChart').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${TIPOS_DESPERDICIO.filter(t => porTipo[t.id]?.custo > 0)
        .sort((a,b) => porTipo[b.id].custo - porTipo[a.id].custo)
        .map(t => `
          <div style="display:flex;align-items:center;gap:10px">
            ${lc(t.icon, 16, t.color)}
            <div style="font-size:var(--text-xs);width:130px;color:var(--text2)">${t.label}</div>
            <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(porTipo[t.id].custo/maxCusto*100)}%;background:${t.color};border-radius:4px;transition:width .5s"></div>
            </div>
            <div style="font-size:var(--text-xs);font-weight:700;width:72px;text-align:right;color:${t.color}">R$ ${fmt(porTipo[t.id].custo)}</div>
          </div>`).join('')}
      ${Object.values(porTipo).every(v => v.custo === 0)
        ? `<div style="color:var(--muted);font-size:var(--text-sm);text-align:center;padding:16px;display:flex;align-items:center;justify-content:center;gap:6px">${lc('check-circle',16,'var(--green)')} Nenhum desperdício no período</div>`
        : ''}
    </div>`;

  // ── Top itens ──
  const porItem = {};
  filt.forEach(d => {
    const item  = d.itemId ? items.find(i => i.id === d.itemId) : null;
    const chave = d.prodId ? 'prod_'+d.prodId : d.itemId ? 'item_'+d.itemId : 'nome_'+(d.nome||'x');
    if (!porItem[chave]) porItem[chave] = { qty:0, custo:0 };
    porItem[chave].qty   += d.qty;
    porItem[chave].custo += _getCusto(d);
    porItem[chave].name   = d.nome || item?.name || '—';
    porItem[chave].unit   = d.unidade || item?.unit || '';
  });

  const topItems = Object.entries(porItem).sort(([,a],[,b]) => b.custo - a.custo).slice(0,5);
  document.getElementById('despTopItems').innerHTML = topItems.length
    ? topItems.map(([,v]) => `
        <div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:var(--text-sm);font-weight:600">${v.name}</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">${fmt(v.qty)} ${v.unit} desperdiçado(s)</div>
          </div>
          <div style="font-family:monospace;font-weight:700;color:var(--red)">R$ ${fmt(v.custo)}</div>
        </div>`).join('')
    : `<div style="padding:24px;text-align:center;color:var(--muted);font-size:var(--text-sm)">${lc('check-circle',16,'var(--green)')} Nenhum desperdício registrado</div>`;

  // ── Lista de registros ──
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const podeExcluir = user?.role === 'gerente' || user?.role === 'supervisor';

  document.getElementById('despLista').innerHTML = filt.length
    ? `<div style="display:flex;flex-direction:column;gap:8px">
        ${[...filt].reverse().map(d => {
          const item   = d.itemId ? items.find(i => i.id === d.itemId) : null;
          const nome   = d.nome  || item?.name || '—';
          const unit   = d.unidade || item?.unit || '';
          const custo  = _getCusto(d);
          const tipo   = TIPOS_DESPERDICIO.find(t => t.id === d.tipo);
          const origemLabel = d.origem === 'produto' ? 'Produto' : d.origem === 'preparado' ? 'Preparado' : 'Insumo';
          const origemIcon  = d.origem === 'produto' ? 'tag' : d.origem === 'preparado' ? 'chef-hat' : 'package';

          return `
            <div style="display:flex;align-items:flex-start;gap:12px;padding:13px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10)">
              <!-- Ícone tipo -->
              <div style="width:38px;height:38px;border-radius:var(--r8);background:${tipo?.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${lc(tipo?.icon||'package', 18, tipo?.color||'var(--muted)')}
              </div>

              <!-- Conteúdo -->
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                  <span style="font-size:var(--text-sm);font-weight:700">${nome}</span>
                  <span class="chip chip-gray" style="font-size:var(--text-2xs)">
                    ${lc(origemIcon, 10, 'currentColor')} ${origemLabel}
                  </span>
                  <span class="chip" style="background:${tipo?.bg};color:${tipo?.color};font-size:var(--text-2xs);border-color:transparent">
                    ${tipo?.label || d.tipo}
                  </span>
                </div>
                <div style="font-size:var(--text-xs);color:var(--muted);display:flex;gap:12px;flex-wrap:wrap">
                  <span>${fmtD(d.date)}</span>
                  <span>${fmt(d.qty)} ${unit}</span>
                  <span style="color:var(--red);font-weight:600">R$ ${fmt(custo)}</span>
                  ${d.resp ? `<span>${lc('user',11,'var(--muted)')} ${d.resp}</span>` : ''}
                </div>
                ${d.obs ? `<div style="font-size:var(--text-xs);color:var(--text2);margin-top:5px;font-style:italic">"${d.obs}"</div>` : ''}
              </div>

              <!-- Ações -->
              <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
                <button onclick="imprimirComanda(${d.id})"
                  style="padding:5px 8px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);cursor:pointer;display:flex;align-items:center;gap:4px;font-size:var(--text-xs);color:var(--text2)"
                  title="Imprimir comanda">
                  ${lc('printer', 13, 'currentColor')}
                </button>
                ${podeExcluir ? `
                  <button onclick="deleteDesperdicios(${d.id})"
                    style="padding:5px 8px;border-radius:var(--r6);border:1.5px solid var(--red-light);background:var(--red-light);cursor:pointer;display:flex;align-items:center;gap:4px;font-size:var(--text-xs);color:var(--red)"
                    title="Excluir registro">
                    ${lc('trash-2', 13, 'var(--red)')}
                  </button>` : ''}
              </div>
            </div>`;
        }).join('')}
       </div>`
    : `<div style="padding:40px;text-align:center">
        <div class="empty-icon">${lc('check-circle', 24, 'var(--green)')}</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:8px">Nenhum desperdício registrado no período</div>
       </div>`;
}

// ══════════════════════════════════════════════════════════════
// IMPRIMIR COMANDA
// ══════════════════════════════════════════════════════════════
function imprimirComanda(id) {
  const d    = desperdicios.find(x => x.id === id);
  if (!d) return;
  const tipo = TIPOS_DESPERDICIO.find(t => t.id === d.tipo);
  const hora = new Date(d.createdAt || d.date).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const win = window.open('', '_blank', 'width=320,height=500');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Comanda Desperdício</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; padding: 12px; width: 280px; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 8px 0; }
    .big { font-size: 16px; font-weight: bold; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:14px">VAI TER PIZZA!</div>
    <div style="font-size:10px">Registro de Desperdício</div>
  </div>
  <div class="line"></div>
  <div class="row"><span>Data:</span><span>${fmtD(d.date)}</span></div>
  <div class="row"><span>Hora:</span><span>${hora}</span></div>
  <div class="row"><span>Respons.:</span><span>${d.resp || '—'}</span></div>
  <div class="line"></div>
  <div class="center bold" style="margin:6px 0">${d.nome || '—'}</div>
  <div class="center">Qtd: ${fmt(d.qty)} ${d.unidade || ''}</div>
  <div class="center" style="margin-top:4px;font-size:11px">Tipo: ${tipo?.label || d.tipo}</div>
  <div class="line"></div>
  ${d.obs ? `<div style="margin:4px 0;font-size:11px">Obs: ${d.obs}</div><div class="line"></div>` : ''}
  <div class="center" style="font-size:10px;margin-top:8px">Sistema VTP Compras</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ══════════════════════════════════════════════════════════════
// MODAL: REGISTRAR DESPERDÍCIO
// ══════════════════════════════════════════════════════════════
let _editDespId = null;

function openDespModal() {
  _editDespId = null;
  document.getElementById('despModalTitle').textContent = 'Registrar Desperdício';
  _populaDespTipoSelects();

  // Preenche responsável com usuário logado
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  document.getElementById('fdResp').value  = user?.name || '';
  document.getElementById('fdQty').value   = '';
  document.getElementById('fdObs').value   = '';
  document.getElementById('fdDate').value  = new Date().toISOString().slice(0,10);
  const firstTipo = TIPOS_DESPERDICIO[0]?.id || '';
  document.getElementById('fdTipo').value  = firstTipo;
  document.getElementById('delDespBtn').style.display = 'none';
  document.getElementById('fdOrigem').value = 'insumo';
  updateDespOrigemList();
  setDespOrigem('insumo');
  document.getElementById('ovDesp').classList.add('open');
}

function setDespOrigem(origem) {
  const hiddenEl = document.getElementById('fdOrigem');
  if (hiddenEl) hiddenEl.value = origem;

  ['insumo','preparado','produto'].forEach(o => {
    const btn = document.getElementById('orig-btn-' + o);
    if (!btn) return;
    const ativo = o === origem;
    btn.style.background  = ativo ? 'var(--purple)' : 'var(--surface)';
    btn.style.borderColor = ativo ? 'var(--purple)' : 'var(--border)';
    btn.style.color       = ativo ? '#fff' : 'var(--text2)';
  });

  const noteEl = document.getElementById('origemNote');
  if (noteEl) {
    const notes = {
      insumo:    'Insumos de compras — quantidade debitada do estoque',
      preparado: 'Preparados de produção — quantidade debitada do estoque',
      produto:   'Produto final (pizza/bebida) — custo = preço de venda',
    };
    noteEl.textContent = notes[origem] || '';
  }
  updateDespOrigemList();
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
      .sort((a,b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
      .forEach(i => { sel.innerHTML += `<option value="i_${i.id}">[${i.cat}] ${i.name} (${i.unit})</option>`; });
    if (qtyLabel) qtyLabel.textContent = 'Insumo *';

  } else if (origem === 'preparado') {
    [...items].filter(i => i.isProd)
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(i => { sel.innerHTML += `<option value="i_${i.id}">${i.name} (${i.unit})</option>`; });
    if (qtyLabel) qtyLabel.textContent = 'Preparado *';

  } else if (origem === 'produto') {
    if (qtyLabel) qtyLabel.textContent = 'Tipo de pizza *';
    PIZZA_TIPOS.forEach(t => {
      sel.innerHTML += `<option value="pt_${t.id}">${t.label} — base R$${fmt(t.basePrice)}</option>`;
    });
    const prods = typeof produtos !== 'undefined' ? produtos : [];
    prods.filter(p => p.active !== false)
      .sort((a,b) => a.name.localeCompare(b.name))
      .forEach(p => { sel.innerHTML += `<option value="p_${p.id}">[Outro] ${p.name} — R$${fmt(p.price)}</option>`; });
  }
}

function onDespItemChange() {
  const rawId     = document.getElementById('fdItemId').value;
  const pizzaArea = document.getElementById('fdPizzaArea');
  if (!rawId.startsWith('pt_')) { if (pizzaArea) pizzaArea.style.display = 'none'; return; }

  const tipoId = rawId.replace('pt_', '');
  const tipo   = PIZZA_TIPOS.find(t => t.id === tipoId);
  if (!tipo || !pizzaArea) return;

  pizzaArea.style.display = '';
  const sabs = sabores.filter(s => s.tipo === tipoId && s.active !== false)
                      .sort((a,b) => a.acr - b.acr || a.name.localeCompare(b.name));
  const opts = '<option value="">Selecionar sabor...</option>' +
    sabs.map(s => `<option value="${s.id}">${s.name}${s.acr > 0 ? ' (+R$'+fmt(s.acr)+')' : ''}</option>`).join('');

  document.getElementById('fdSabor1').innerHTML = opts;
  document.getElementById('fdSabor1Label').textContent = tipo.grande ? '1º Sabor (1/2) *' : 'Sabor *';
  const sab2Row = document.getElementById('fdSabor2Row');
  if (sab2Row) sab2Row.style.display = tipo.grande ? '' : 'none';
  document.getElementById('fdSabor2').innerHTML = opts;
  _calcPizzaCusto();
}

function _calcPizzaCusto() {
  const rawId  = document.getElementById('fdItemId').value;
  const tipoId = rawId.replace('pt_', '');
  const tipo   = PIZZA_TIPOS.find(t => t.id === tipoId);
  if (!tipo) return;

  const sab1Id = parseInt(document.getElementById('fdSabor1').value);
  const sab2Id = parseInt(document.getElementById('fdSabor2')?.value);
  const sab1   = sabores.find(s => s.id === sab1Id);
  const sab2   = sabores.find(s => s.id === sab2Id);

  let total = tipo.basePrice;
  if (sab1) total += sab1.acr;
  if (tipo.grande && sab2) total += sab2.acr;

  const el = document.getElementById('fdCustoPreview');
  if (el) {
    const sabDesc = sab1 ? (tipo.grande && sab2 ? sab1.name+' + '+sab2.name : sab1.name) : '—';
    el.innerHTML = `
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px">
        <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:3px">Valor total do produto desperdiçado</div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${tipo.label} · ${sabDesc}</div>
      </div>`;
  }
}

function saveDesp() {
  const rawId  = document.getElementById('fdItemId').value;
  const qty    = parseFloat(document.getElementById('fdQty').value);
  const tipo   = document.getElementById('fdTipo').value;
  const origem = document.getElementById('fdOrigem').value;
  const resp   = document.getElementById('fdResp').value.trim();

  if (!rawId)          { toast('Selecione o item', 'err'); return; }
  if (!qty || qty <= 0){ toast('Informe a quantidade', 'err'); return; }
  if (!resp)           { toast('Informe o responsável', 'err'); return; }

  let itemId = null, prodId = null, nome = '', unidade = '', custo = 0, d_extra = {};

  if (rawId.startsWith('pt_')) {
    const tipoId = rawId.replace('pt_', '');
    const t      = PIZZA_TIPOS.find(x => x.id === tipoId);
    if (!t) { toast('Tipo de pizza não encontrado', 'err'); return; }
    const sab1Id = parseInt(document.getElementById('fdSabor1')?.value);
    const sab2Id = parseInt(document.getElementById('fdSabor2')?.value);
    const sab1   = sabores.find(s => s.id === sab1Id);
    const sab2   = t.grande ? sabores.find(s => s.id === sab2Id) : null;
    if (!sab1) { toast('Selecione o sabor', 'err'); return; }
    if (t.grande && !sab2) { toast('Selecione o 2º sabor', 'err'); return; }
    const precoTotal = t.basePrice + (sab1?.acr||0) + (sab2?.acr||0);
    const sabDesc    = t.grande && sab2 ? sab1.name+' + '+sab2.name : sab1.name;
    nome    = t.label + ' · ' + sabDesc;
    unidade = 'un';
    custo   = precoTotal * qty;
    d_extra = { tipoId, sab1Id, sab2Id: sab2?.id||null, precoUnitario: precoTotal, sabDesc };

  } else if (rawId.startsWith('p_')) {
    prodId = parseInt(rawId.slice(2));
    const prod = (typeof produtos !== 'undefined' ? produtos : []).find(p => p.id === prodId);
    if (!prod) { toast('Produto não encontrado', 'err'); return; }
    nome    = prod.name;
    unidade = 'un';
    custo   = prod.price * qty;

  } else if (rawId.startsWith('i_')) {
    itemId = parseInt(rawId.slice(2));
    const item = items.find(i => i.id === itemId);
    if (!item) { toast('Insumo não encontrado', 'err'); return; }
    nome    = item.name;
    unidade = item.unit;
    custo   = (item.cost || 0) * qty;
  } else {
    toast('Item inválido', 'err'); return;
  }

  const d = {
    id:        _editDespId || (Math.max(0, ...desperdicios.map(x => x.id)) + 1),
    itemId, prodId, origem, nome, unidade, qty, tipo, custo,
    ...d_extra,
    date:      document.getElementById('fdDate').value,
    resp,
    obs:       document.getElementById('fdObs').value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (_editDespId) {
    const idx = desperdicios.findIndex(x => x.id === _editDespId);
    if (idx >= 0) desperdicios[idx] = d;
    toast('Registro atualizado!', 'ok');
  } else {
    if (itemId) {
      const item = items.find(i => i.id === itemId);
      if (item) {
        item.qty = Math.max(0, parseFloat((item.qty - qty).toFixed(3)));
        saveI();
        if (typeof registrarMovimentacao === 'function') {
          registrarMovimentacao('saida_perda', itemId, qty, 'Desperdício: ' + tipo + (d.obs ? ' — ' + d.obs : ''), null);
        }
      }
    }
    desperdicios.push(d);
    toast('Desperdício registrado!', 'ok');
  }

  saveD();
  try { logAudit('desperdicio_registrado', tipo + ' — ' + nome + ' ' + qty + ' ' + unidade, 'desperdicio'); } catch(e) {}
  closeModal('ovDesp');
  renderDesperdicio();
  renderDashboard();
}

function deleteDesperdicios(id) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user?.role !== 'gerente' && user?.role !== 'supervisor') {
    toast('Apenas gerentes e supervisores podem excluir registros', 'err');
    return;
  }
  vtpConfirm({
    title: 'Excluir registro',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      desperdicios = desperdicios.filter(d => d.id !== id);
      saveD();
      renderDesperdicio();
      toast('Registro excluído.');
    }
  });
}

function clearDespFiltro() {
  document.getElementById('despDe').value      = '';
  document.getElementById('despAte').value     = '';
  document.getElementById('despTipoFil').value = '';
  renderDesperdicio();
}

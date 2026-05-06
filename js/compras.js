/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Módulo de Compras (4 etapas: Lista → Aprovação → OC → Recebimento)
 */

// ── Estado ──
let _listaAtual = null; // lista aberta no momento

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderComprasModule() {
  _listaAtual = getListaAtiva();
  _renderDashCompras();

  if (_listaAtual) {
    _renderEtapa(_listaAtual.etapa);
  } else {
    _renderSemLista();
  }
}

function _renderSemLista() {
  document.getElementById('comprasContent').innerHTML = `
    <div style="text-align:center;padding:60px 24px">
      <div style="font-size:3rem;margin-bottom:16px">🛒</div>
      <div style="font-size:1.1rem;font-weight:700;color:var(--text);margin-bottom:8px">Nenhuma lista ativa</div>
      <div style="font-size:.82rem;color:var(--muted);margin-bottom:24px">Vá ao Estoque, adicione itens ao carrinho e clique em "Gerar Lista de Compras"</div>
      <button class="btn btn-primary" onclick="goModule('estoque')">📦 Ir para o Estoque</button>
    </div>`;
}

// ── Dashboard fixo de compras ──
function _renderDashCompras() {
  const el = document.getElementById('comprasDash');
  if (!el) return;

  const total = listas.length;
  const ativas = listas.filter(l => l.status !== 'concluida').length;
  const concluidas = listas.filter(l => l.status === 'concluida').length;

  // Lista ativa principal
  const la = _listaAtual;
  const st = la ? (STATUS_ETAPA[la.status] || {}) : null;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        ${la ? `
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Lista ativa</div>
          <div style="font-size:.9rem;font-weight:800;color:var(--text);margin-top:2px">${la.codigo}</div>
          <div style="font-size:.7rem;color:var(--muted)">Criada em ${fmtD(la.dataCriacao)} por ${la.criadoPor}</div>
        ` : `<div style="font-size:.82rem;color:var(--muted)">Nenhuma lista ativa</div>`}
      </div>
      ${la ? `
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="text-align:center;padding:6px 14px;background:var(--surface2);border-radius:var(--r8)">
            <div style="font-size:.9rem;font-weight:800;color:var(--purple)">${la.itens.length}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Itens</div>
          </div>
          <div style="text-align:center;padding:6px 14px;background:var(--surface2);border-radius:var(--r8)">
            <div style="font-size:.9rem;font-weight:800;color:var(--purple)">R$${fmt(la.valorEstimado)}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Estimado</div>
          </div>
          <div style="text-align:center;padding:6px 14px;background:${st.bg||'var(--surface2)'};border-radius:var(--r8)">
            <div style="font-size:.75rem;font-weight:700;color:${st.color||'var(--muted)'}">${st.label||la.status}</div>
            <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase">Status</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          ${la.etapa > 1 ? `<button class="btn btn-outline btn-xs" onclick="verListasAnteriores()">📋 Histórico</button>` : ''}
          ${la.status !== 'concluida' ? `<button class="btn btn-red btn-xs" onclick="encerrarListaManual()">✕ Encerrar</button>` : ''}
        </div>
      ` : `<button class="btn btn-primary btn-sm" onclick="goModule('estoque')">🛒 Ir ao Estoque</button>`}
    </div>
    <!-- Progress bar etapas -->
    ${la ? `
    <div style="margin-top:14px;display:flex;gap:4px">
      ${[
        {n:1, label:'Lista'},
        {n:2, label:'Aprovação'},
        {n:3, label:'Ordem de Compra'},
        {n:4, label:'Recebimento'},
      ].map(s => {
        const done    = la.etapa > s.n;
        const current = la.etapa === s.n;
        return `<div style="flex:1;text-align:center;cursor:pointer" onclick="${done ? `_renderEtapa(${s.n})` : ''}">
          <div style="height:4px;border-radius:2px;background:${done?'var(--green)':current?'var(--purple)':'var(--border)'};margin-bottom:4px;transition:background .3s"></div>
          <div style="font-size:.6rem;font-weight:600;color:${done?'var(--green)':current?'var(--purple)':'var(--muted)'}">${s.n}. ${s.label}</div>
        </div>`;
      }).join('')}
    </div>` : ''}`;
}

// ══════════════════════════════════════════════════════════════
// ETAPA 1 — LISTA DE COMPRAS
// ══════════════════════════════════════════════════════════════
function _renderEtapa(n) {
  if (!_listaAtual) { _renderSemLista(); return; }
  if (n === 1) _renderEtapa1();
  else if (n === 2) _renderEtapa2();
  else if (n === 3) _renderEtapa3();
  else if (n === 4) _renderEtapa4();
}

function _renderEtapa1() {
  const l = _listaAtual;
  _listaAtual.etapa = 1;
  saveListas();

  // Prazo
  const prazoHtml = l.prazoCotacao ? `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);font-size:.75rem">
      ⏰ Prazo: ${fmtDT(l.prazoCotacao)} · <span id="timer1"></span>
    </div>` : '';

  document.getElementById('comprasContent').innerHTML = `
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:1rem;font-weight:800;margin-bottom:4px">📋 Lista de Compras · ${l.codigo}</h3>
        <div style="font-size:.72rem;color:var(--muted)">${l.itens.length} itens · Estimativa: <strong style="color:var(--purple)">R$ ${fmt(l.valorEstimado)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="abrirAddItemManual()">+ Adicionar item</button>
        <button class="btn btn-outline btn-sm" onclick="abrirPrazoCotacao()">⏰ Prazo</button>
        <button class="btn btn-primary btn-sm" onclick="enviarCotacaoWA()">💬 Enviar cotação WA</button>
      </div>
    </div>

    ${prazoHtml}

    <!-- Status bar -->
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${['montagem','cotacao','cotacao_encerrada'].map(s => {
        const st = STATUS_ETAPA[s];
        const isActive = l.status === s;
        return `<button onclick="setStatusLista('${s}')"
          style="padding:5px 12px;border-radius:20px;font-size:.72rem;font-weight:600;border:1.5px solid ${isActive ? st.color : 'var(--border)'};background:${isActive ? st.bg : 'var(--surface)'};color:${isActive ? st.color : 'var(--muted)'};cursor:pointer">
          ${st.label}
        </button>`;
      }).join('')}
    </div>

    <!-- Tabela de itens -->
    <div class="card" style="margin-bottom:16px">
      <div class="tbl-wrap" style="border:none">
        <table>
          <thead><tr>
            <th>Item</th>
            <th class="c">Qtd</th>
            <th class="c">Un.</th>
            <th class="r">Preço unit.</th>
            <th class="r">Total</th>
            <th class="c">Fornecedor</th>
            <th class="c">Obs.</th>
            <th class="c"></th>
          </tr></thead>
          <tbody id="itens1Body">
            ${l.itens.map(i => _rowEtapa1(i)).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--purple-xlight)">
              <td colspan="4" style="padding:10px 14px;font-weight:700;font-size:.82rem">Total estimado</td>
              <td class="r" style="padding:10px 14px;font-weight:800;font-size:.9rem;color:var(--purple)">R$ ${fmt(l.valorEstimado)}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Observações -->
    <div class="field" style="margin-bottom:16px">
      <label>Observações gerais</label>
      <textarea class="inp" rows="2" placeholder="Condições de pagamento, urgência..." onchange="setObsLista(this.value)">${l.observacoes}</textarea>
    </div>

    <!-- Ação -->
    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="avancarParaAprovacao()"
        style="padding:12px 28px;font-size:.88rem">
        Enviar para aprovação →
      </button>
    </div>`;

  if (l.prazoCotacao) _startTimer('timer1', l.prazoCotacao);
}

function _rowEtapa1(i) {
  const sup = suppliers.find(s => s.id === i.fornecedorId);
  const tot = i.qtdSelecionada * (i.precoUnitFinal || i.precoUnitEstimado || 0);
  return `<tr id="item1-${i.id}">
    <td style="padding:8px 14px">
      <div style="font-size:.82rem;font-weight:600">${i.nome}</div>
      <div style="font-size:.65rem;color:var(--muted)">${i.categoria} · ${i.origem === 'manual' ? '✏️ Manual' : '📦 Estoque'}</div>
    </td>
    <td class="c">
      <input type="number" value="${i.qtdSelecionada}" min="0.001" step="0.001"
        style="width:70px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;text-align:center;font-family:monospace"
        onchange="setItemQtd1(${i.id}, this.value)">
    </td>
    <td class="c" style="font-size:.75rem;color:var(--muted)">${i.unidade}</td>
    <td class="r">
      <div style="position:relative;display:inline-block">
        <span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:.65rem;color:var(--muted)">R$</span>
        <input type="number" value="${i.precoUnitFinal || i.precoUnitEstimado || ''}" min="0" step="0.01" placeholder="0,00"
          style="width:80px;padding:4px 6px 4px 22px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;text-align:right;font-family:monospace"
          onchange="setItemPreco1(${i.id}, this.value)">
      </div>
    </td>
    <td class="r" style="font-family:monospace;font-size:.78rem;font-weight:600;color:${tot>0?'var(--purple)':'var(--muted)'}" id="item1-tot-${i.id}">
      ${tot > 0 ? 'R$ ' + fmt(tot) : '—'}
    </td>
    <td class="c">
      <select style="font-size:.72rem;border:1.5px solid var(--border);border-radius:var(--r6);padding:4px 6px;max-width:130px"
        onchange="setItemFornecedor1(${i.id}, this.value)">
        <option value="">— Selecionar</option>
        ${suppliers.map(s => `<option value="${s.id}" ${s.id===i.fornecedorId?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </td>
    <td class="c">
      <input type="text" value="${i.observacoes}" placeholder="obs..."
        style="font-size:.72rem;border:1.5px solid var(--border);border-radius:var(--r6);padding:4px 6px;width:100px"
        onchange="setItemObs1(${i.id}, this.value)">
    </td>
    <td class="c">
      <button onclick="removerItem1(${i.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px 6px" title="Remover">🗑</button>
    </td>
  </tr>`;
}

// Ações Etapa 1
function setItemQtd1(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const v = parseFloat(val);
  if (!isNaN(v) && v > 0) i.qtdSelecionada = v;
  _recalcEstimativa();
  saveListas();
  const tot = i.qtdSelecionada * (i.precoUnitFinal || i.precoUnitEstimado || 0);
  const el = document.getElementById('item1-tot-' + itemId);
  if (el) el.textContent = tot > 0 ? 'R$ ' + fmt(tot) : '—';
}

function setItemPreco1(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const v = parseFloat(val);
  i.precoUnitFinal = !isNaN(v) && v > 0 ? v : null;
  _recalcEstimativa();
  saveListas();
  const tot = i.qtdSelecionada * (i.precoUnitFinal || i.precoUnitEstimado || 0);
  const el = document.getElementById('item1-tot-' + itemId);
  if (el) { el.textContent = tot > 0 ? 'R$ ' + fmt(tot) : '—'; el.style.color = i.precoUnitFinal ? 'var(--green)' : 'var(--muted)'; }
}

function setItemFornecedor1(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.fornecedorId = val ? parseInt(val) : null; saveListas(); }
}

function setItemObs1(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.observacoes = val; saveListas(); }
}

function removerItem1(itemId) {
  _listaAtual.itens = _listaAtual.itens.filter(x => x.id !== itemId);
  _recalcEstimativa();
  saveListas();
  document.getElementById('item1-' + itemId)?.remove();
}

function setObsLista(val) { if (_listaAtual) { _listaAtual.observacoes = val; saveListas(); } }

function setStatusLista(status) {
  if (!_listaAtual) return;
  _listaAtual.status = status;
  saveListas();
  _renderEtapa1();
  _renderDashCompras();
}

function _recalcEstimativa() {
  if (!_listaAtual) return;
  _listaAtual.valorEstimado = _listaAtual.itens.reduce((s, i) =>
    s + i.qtdSelecionada * (i.precoUnitFinal || i.precoUnitEstimado || 0), 0);
}

function abrirAddItemManual() {
  document.getElementById('ovAddItem').classList.add('open');
  document.getElementById('aiNome').value = '';
  document.getElementById('aiQtd').value  = '';
  document.getElementById('aiUnit').value = 'un';
  document.getElementById('aiCat').value  = '';
  document.getElementById('aiPreco').value= '';
  document.getElementById('aiObs').value  = '';
}

function saveItemManual() {
  const nome = document.getElementById('aiNome').value.trim();
  const qtd  = parseFloat(document.getElementById('aiQtd').value);
  if (!nome) { toast('Informe o nome do item', 'err'); return; }
  if (isNaN(qtd) || qtd <= 0) { toast('Informe a quantidade', 'err'); return; }

  const newId = Math.max(0, ..._listaAtual.itens.map(x => x.id)) + 1;
  _listaAtual.itens.push({
    id:               newId,
    itemId:           null,
    nome,
    categoria:        document.getElementById('aiCat').value.trim() || 'Geral',
    unidade:          document.getElementById('aiUnit').value || 'un',
    qtdSugerida:      qtd,
    qtdSelecionada:   qtd,
    qtdAprovada:      null,
    qtdComprada:      null,
    qtdRecebida:      null,
    estoqueAtual:     0, estoqueMinimo: 0, estoqueIdeal: 0,
    origem:           'manual',
    tipoCompra:       'fornecedor',
    fornecedorId:     null,
    localCompra:      '',
    diaCompra:        '',
    responsavelCompra:'',
    precoUnitEstimado: parseFloat(document.getElementById('aiPreco').value) || 0,
    precoUnitFinal:   null,
    valorTotal:       0,
    statusItem:       'pendente',
    observacoes:      document.getElementById('aiObs').value.trim(),
    aprovado:         null,
    comentarioAprovador: '',
    conferido:        false,
    divergencia:      false,
    comentarioConferencia: '',
  });
  _recalcEstimativa();
  saveListas();
  closeModal('ovAddItem');
  _renderEtapa1();
  toast('✅ Item adicionado!');
}

function abrirPrazoCotacao() {
  const d = _listaAtual.prazoCotacao ? new Date(_listaAtual.prazoCotacao).toISOString().slice(0,16) : '';
  const val = prompt('Prazo de encerramento da cotação (AAAA-MM-DDTHH:MM):', d || new Date(Date.now() + 24*3600000).toISOString().slice(0,16));
  if (!val) return;
  _listaAtual.prazoCotacao = new Date(val).toISOString();
  saveListas();
  _renderEtapa1();
  toast('⏰ Prazo definido!');
}

function enviarCotacaoWA() {
  if (!_listaAtual) return;
  const l    = _listaAtual;
  const sups = [...new Set(l.itens.map(i => i.fornecedorId).filter(Boolean))];
  if (!sups.length) {
    toast('Defina fornecedores para os itens primeiro', 'err'); return;
  }
  sups.forEach(supId => {
    const sup    = suppliers.find(s => s.id === supId);
    if (!sup?.phone) return;
    const itens  = l.itens.filter(i => i.fornecedorId === supId);
    const linhas = itens.map(i => `• ${i.nome}: ${i.qtdSelecionada} ${i.unidade}`).join('\n');
    const prazo  = l.prazoCotacao ? '\n⏰ Prazo: ' + fmtDT(l.prazoCotacao) : '';
    const msg    = `Olá ${sup.seller || sup.name}! 👋\n\nSolicitamos cotação dos itens abaixo (${l.codigo}):\n\n${linhas}${prazo}\n\nPor favor, responda com preço unitário e prazo de entrega.\n\nObrigado! 🍕`;
    window.open('https://wa.me/55' + sup.phone.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg), '_blank');
  });
  l.status = 'cotacao';
  saveListas();
  _renderDashCompras();
  _renderEtapa1();
  toast('💬 Cotação enviada!');
}

function avancarParaAprovacao() {
  if (!_listaAtual) return;
  _listaAtual.etapa  = 2;
  _listaAtual.status = 'aguard_aprovacao';
  saveListas();
  // Notifica aprovador
  const cfg = localStorage.getItem('vtp_config');
  const wa  = cfg ? JSON.parse(cfg).whatsapp : '';
  if (wa) {
    const msg = `Nova lista de compras para aprovação!\n\n📋 ${_listaAtual.codigo}\n💰 Estimativa: R$${fmt(_listaAtual.valorEstimado)}\n📦 ${_listaAtual.itens.length} itens\n\nAcesse o sistema para aprovar.`;
    window.open('https://wa.me/55' + wa + '?text=' + encodeURIComponent(msg), '_blank');
  }
  _renderDashCompras();
  _renderEtapa2();
  toast('📤 Lista enviada para aprovação!');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 2 — APROVAÇÃO
// ══════════════════════════════════════════════════════════════
function _renderEtapa2() {
  const l = _listaAtual;

  const totalAprov = l.itens
    .filter(i => i.aprovado !== false)
    .reduce((s, i) => s + (i.qtdAprovada ?? i.qtdSelecionada) * (i.precoUnitFinal || i.precoUnitEstimado || 0), 0);

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:1rem;font-weight:800;margin-bottom:4px">✅ Aprovação da Lista · ${l.codigo}</h3>
        <div style="font-size:.72rem;color:var(--muted)">Revise e aprove os itens antes da compra</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa1()">← Voltar</button>
        <button class="btn btn-red btn-sm" onclick="reprovarLista()">✕ Reprovar lista</button>
        <button class="btn btn-primary btn-sm" onclick="aprovarLista()">✅ Aprovar lista</button>
      </div>
    </div>

    <!-- Total aprovado -->
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="font-size:.78rem;font-weight:600;color:var(--purple)">Total aprovado (estimado)</div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">R$ ${fmt(totalAprov)}</div>
    </div>

    <!-- Itens para aprovação -->
    <div style="display:flex;flex-direction:column;gap:8px">
      ${l.itens.map(i => {
        const sup    = suppliers.find(s => s.id === i.fornecedorId);
        const total  = (i.qtdAprovada ?? i.qtdSelecionada) * (i.precoUnitFinal || i.precoUnitEstimado || 0);
        const isAprov = i.aprovado === true;
        const isReprov= i.aprovado === false;
        return `<div style="border:1.5px solid ${isAprov?'var(--green)':isReprov?'var(--red)':'var(--border)'};border-radius:var(--r10);background:${isAprov?'var(--green-light)':isReprov?'var(--red-light)':'var(--surface)'};overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap">
            <div style="flex:1;min-width:150px">
              <div style="font-size:.84rem;font-weight:700">${i.nome}</div>
              <div style="font-size:.68rem;color:var(--muted)">${i.categoria} · ${sup?.name || 'Fornecedor não definido'}</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <div style="text-align:center">
                <div style="font-size:.65rem;color:var(--muted)">Solicitado</div>
                <div style="font-size:.82rem;font-weight:700;font-family:monospace">${fmt(i.qtdSelecionada)} ${i.unidade}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:.65rem;color:var(--muted)">Aprovado</div>
                <input type="number" value="${i.qtdAprovada ?? i.qtdSelecionada}" min="0" step="0.001"
                  style="width:70px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;text-align:center;font-family:monospace"
                  onchange="setQtdAprovada(${i.id}, this.value)">
              </div>
              <div style="text-align:center">
                <div style="font-size:.65rem;color:var(--muted)">Preço unit.</div>
                <div style="font-size:.82rem;font-weight:700;font-family:monospace">R$ ${fmt(i.precoUnitFinal || i.precoUnitEstimado || 0)}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:.65rem;color:var(--muted)">Total</div>
                <div style="font-size:.88rem;font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(total)}</div>
              </div>
              <div style="display:flex;gap:5px">
                <button onclick="aprovarItem2(${i.id})"
                  style="padding:6px 12px;border-radius:var(--r8);border:1.5px solid ${isAprov?'var(--green)':'var(--border)'};background:${isAprov?'var(--green)':'var(--surface)'};color:${isAprov?'#fff':'var(--text2)'};font-size:.72rem;font-weight:600;cursor:pointer">
                  ✓ Aprovar
                </button>
                <button onclick="reprovarItem2(${i.id})"
                  style="padding:6px 12px;border-radius:var(--r8);border:1.5px solid ${isReprov?'var(--red)':'var(--border)'};background:${isReprov?'var(--red)':'var(--surface)'};color:${isReprov?'#fff':'var(--text2)'};font-size:.72rem;font-weight:600;cursor:pointer">
                  ✕ Reprovar
                </button>
              </div>
            </div>
          </div>
          ${i.comentarioAprovador || !isReprov ? '' : ''}
          <div style="padding:0 14px 10px;display:flex;gap:8px;align-items:center">
            <input type="text" placeholder="Comentário do aprovador..." value="${i.comentarioAprovador}"
              style="flex:1;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
              onchange="setComentarioAprovador(${i.id}, this.value)">
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function setQtdAprovada(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const v = parseFloat(val);
  i.qtdAprovada = !isNaN(v) && v >= 0 ? v : i.qtdSelecionada;
  saveListas();
}

function aprovarItem2(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.aprovado = true; saveListas(); _renderEtapa2(); }
}

function reprovarItem2(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.aprovado = false; saveListas(); _renderEtapa2(); }
}

function setComentarioAprovador(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.comentarioAprovador = val; saveListas(); }
}

function aprovarLista() {
  if (!_listaAtual) return;
  // Aprova todos os não marcados
  _listaAtual.itens.forEach(i => { if (i.aprovado === null) i.aprovado = true; });
  _listaAtual.itens = _listaAtual.itens.filter(i => i.aprovado !== false);
  _listaAtual.status = 'aprovada';
  _listaAtual.etapa  = 3;
  _listaAtual.valorAprovado = _listaAtual.itens.reduce((s,i) =>
    s + (i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0), 0);
  saveListas();
  _renderDashCompras();
  _renderEtapa3();
  toast('✅ Lista aprovada! Gerando ordens de compra...');
}

function reprovarLista() {
  if (!confirm('Reprovar toda a lista? Ela voltará para montagem.')) return;
  _listaAtual.status = 'reprovada';
  _listaAtual.etapa  = 1;
  saveListas();
  _renderDashCompras();
  _renderEtapa1();
  toast('❌ Lista reprovada. Revise e reenvie.');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 3 — ORDEM DE COMPRA
// ══════════════════════════════════════════════════════════════
function _renderEtapa3() {
  const l = _listaAtual;

  // Separa fornecedores e supermercado
  const itensSuper = l.itens.filter(i => i.tipoCompra === 'supermercado');
  const itensForn  = l.itens.filter(i => i.tipoCompra !== 'supermercado');

  // Agrupa por fornecedor
  const bySup = {};
  itensForn.forEach(i => {
    const key = i.fornecedorId || 0;
    if (!bySup[key]) bySup[key] = [];
    bySup[key].push(i);
  });

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:1rem;font-weight:800;margin-bottom:4px">🛍️ Ordem de Compra · ${l.codigo}</h3>
        <div style="font-size:.72rem;color:var(--muted)">Total aprovado: <strong style="color:var(--purple)">R$ ${fmt(l.valorAprovado)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa2()">← Aprovação</button>
        <button class="btn btn-primary btn-sm" onclick="avancarParaRecebimento()">Registrar recebimento →</button>
      </div>
    </div>

    <!-- Classifica itens -->
    <div style="background:var(--surface2);border-radius:var(--r10);padding:12px 14px;margin-bottom:16px;font-size:.76rem;color:var(--text2)">
      💡 Classifique cada item como <strong>Fornecedor</strong> (entrega) ou <strong>Supermercado</strong> (compra manual). Use o botão ↕ em cada linha.
    </div>

    <!-- Por fornecedor -->
    ${Object.entries(bySup).map(([supId, itens]) => {
      const sup   = supId !== '0' ? suppliers.find(s => s.id === parseInt(supId)) : null;
      const total = itens.reduce((s, i) => s + (i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0), 0);
      const waMsg = _montaOCText(sup, itens, l);
      return `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--purple-xlight);border-bottom:1.5px solid var(--purple-light);flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:.88rem;font-weight:800;color:var(--purple)">${sup?.name || '⚠️ Fornecedor não definido'}</div>
            ${sup?.seller ? `<div style="font-size:.68rem;color:var(--muted)">👤 ${sup.seller}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:1rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
            ${sup?.phone ? `<a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(waMsg)}" target="_blank" class="btn btn-wa btn-sm">💬 Enviar OC</a>` : ''}
            <button class="btn btn-outline btn-sm" onclick="copiarOC3(${supId})">📋 Copiar</button>
          </div>
        </div>
        <div style="padding:0">
          ${itens.map((i, idx) => `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
              <div style="flex:1">
                <div style="font-size:.8rem;font-weight:600">${i.nome}</div>
                <div style="font-size:.65rem;color:var(--muted)">${i.observacoes||''}</div>
              </div>
              <div style="font-size:.75rem;font-family:monospace;color:var(--muted)">${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade}</div>
              <div style="font-size:.78rem;font-weight:700;font-family:monospace">R$ ${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}</div>
              <button onclick="toggleTipoCompra(${i.id})"
                title="Mover para supermercado"
                style="padding:3px 8px;border-radius:var(--r6);border:1px solid var(--border);background:var(--surface);font-size:.65rem;cursor:pointer">
                🛒 Super
              </button>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('')}

    <!-- Supermercado -->
    ${itensSuper.length ? `
    <div class="card" style="margin-bottom:12px">
      <div style="padding:12px 14px;background:var(--orange-light);border-bottom:1.5px solid var(--border)">
        <div style="font-size:.88rem;font-weight:800;color:var(--orange-dark)">🛒 Compras no Supermercado</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:4px">Defina responsável, local e data por item</div>
      </div>
      ${itensSuper.map((i,idx) => `
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
            <div style="flex:1;font-size:.82rem;font-weight:600">${i.nome}</div>
            <div style="font-size:.75rem;font-family:monospace">${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade}</div>
            <button onclick="toggleTipoCompra(${i.id})" style="padding:3px 8px;border-radius:var(--r6);border:1px solid var(--border);background:var(--surface);font-size:.65rem;cursor:pointer">🏢 Fornecedor</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="text" placeholder="Local (ex: Atacadão)" value="${i.localCompra}"
              style="flex:1;min-width:120px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
              onchange="setSuperCampo(${i.id},'localCompra',this.value)">
            <input type="date" value="${i.diaCompra}"
              style="padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
              onchange="setSuperCampo(${i.id},'diaCompra',this.value)">
            <input type="text" placeholder="Responsável" value="${i.responsavelCompra}"
              style="flex:1;min-width:120px;padding:4px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
              onchange="setSuperCampo(${i.id},'responsavelCompra',this.value)">
          </div>
        </div>`).join('')}
    </div>` : ''}`;
}

function toggleTipoCompra(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.tipoCompra = i.tipoCompra === 'supermercado' ? 'fornecedor' : 'supermercado';
  saveListas();
  _renderEtapa3();
}

function setSuperCampo(itemId, campo, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i[campo] = val; saveListas(); }
}

function _montaOCText(sup, itens, l) {
  const linhas = itens.map(i => `• ${i.nome}: ${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade} × R$${fmt(i.precoUnitFinal||i.precoUnitEstimado||0)} = R$${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}`).join('\n');
  const total  = itens.reduce((s,i) => s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0), 0);
  return `Olá ${sup?.seller||sup?.name||''}! 👋\n\nSegue nossa Ordem de Compra ${l.codigo}:\n\n${linhas}\n\nTotal: R$${fmt(total)}\n\nObrigado! 🍕`;
}

function copiarOC3(supId) {
  const sup   = supId !== '0' ? suppliers.find(s => s.id === parseInt(supId)) : null;
  const itens = _listaAtual.itens.filter(i => (i.fornecedorId||0) === parseInt(supId));
  const txt   = _montaOCText(sup, itens, _listaAtual);
  navigator.clipboard.writeText(txt).then(() => toast('📋 OC copiada!', 'info'));
}

function avancarParaRecebimento() {
  _listaAtual.etapa  = 4;
  _listaAtual.status = 'recebimento';
  saveListas();
  _renderDashCompras();
  _renderEtapa4();
  toast('📦 Avançado para recebimento!');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 4 — RECEBIMENTO E CONFERÊNCIA
// ══════════════════════════════════════════════════════════════
function _renderEtapa4() {
  const l = _listaAtual;
  const total     = l.itens.length;
  const conferidos= l.itens.filter(i => i.conferido).length;
  const pct       = total > 0 ? Math.round(conferidos/total*100) : 0;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:1rem;font-weight:800;margin-bottom:4px">📦 Recebimento · ${l.codigo}</h3>
        <div style="font-size:.72rem;color:var(--muted)">${conferidos} de ${total} itens conferidos</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa3()">← OC</button>
        <button class="btn btn-primary btn-sm" onclick="concluirLista()" ${conferidos < total ? 'disabled title="Confira todos os itens primeiro"' : ''}>
          ✅ Concluir lista
        </button>
      </div>
    </div>

    <!-- Progresso -->
    <div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.72rem;color:var(--muted)">
        <span>Progresso da conferência</span>
        <span>${pct}%</span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct===100?'var(--green)':'var(--purple)'};border-radius:4px;transition:width .4s"></div>
      </div>
    </div>

    <!-- Itens -->
    <div style="display:flex;flex-direction:column;gap:8px">
      ${l.itens.map(i => {
        const sup  = suppliers.find(s => s.id === i.fornecedorId);
        const qtdS = i.qtdAprovada ?? i.qtdSelecionada;
        const qtdR = i.qtdRecebida ?? null;
        const diff = qtdR !== null ? qtdR - qtdS : null;
        const isOk = i.conferido && !i.divergencia;
        const isDiverg = i.conferido && i.divergencia;
        return `<div style="border:1.5px solid ${isOk?'var(--green)':isDiverg?'var(--yellow)':i.conferido?'var(--border)':'var(--border)'};border-radius:var(--r10);background:${isOk?'var(--green-light)':isDiverg?'var(--yellow-light)':'var(--surface)'};overflow:hidden">
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <div style="font-size:.84rem;font-weight:700">${i.nome}</div>
              <div style="font-size:.68rem;color:var(--muted)">${i.tipoCompra==='supermercado'?'🛒 '+i.localCompra:'🏢 '+(sup?.name||'Fornecedor')}</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <div style="text-align:center">
                <div style="font-size:.6rem;color:var(--muted)">Solicitado</div>
                <div style="font-size:.82rem;font-weight:700;font-family:monospace">${fmt(qtdS)} ${i.unidade}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:.6rem;color:var(--muted)">Recebido</div>
                <input type="number" value="${qtdR ?? ''}" min="0" step="0.001" placeholder="${fmt(qtdS)}"
                  style="width:72px;padding:4px 6px;border:1.5px solid ${diff!==null&&diff<0?'var(--red)':'var(--border)'};border-radius:var(--r6);font-size:.78rem;text-align:center;font-family:monospace"
                  onchange="setQtdRecebida(${i.id}, this.value)">
              </div>
              ${diff !== null ? `
                <div style="text-align:center">
                  <div style="font-size:.6rem;color:var(--muted)">Diferença</div>
                  <div style="font-size:.82rem;font-weight:700;font-family:monospace;color:${diff<0?'var(--red)':diff>0?'var(--yellow)':'var(--green)'}">${diff>0?'+':''}${fmt(diff)} ${i.unidade}</div>
                </div>` : ''}
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.76rem;font-weight:600">
                <input type="checkbox" ${i.conferido?'checked':''} style="accent-color:var(--green);width:16px;height:16px" onchange="marcarConferido(${i.id}, this.checked)">
                Conferido
              </label>
            </div>
          </div>
          <div style="padding:0 14px 10px">
            <input type="text" placeholder="Observação de conferência..." value="${i.comentarioConferencia}"
              style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.72rem"
              onchange="setComentarioConferencia(${i.id}, this.value)">
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function setQtdRecebida(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const v = parseFloat(val);
  const qtdS = i.qtdAprovada ?? i.qtdSelecionada;
  i.qtdRecebida = !isNaN(v) ? parseFloat(v.toFixed(3)) : null;
  i.divergencia = i.qtdRecebida !== null && Math.abs(i.qtdRecebida - qtdS) > 0.001;
  saveListas();
}

function marcarConferido(itemId, checked) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.conferido = checked;
  if (checked && i.qtdRecebida === null) i.qtdRecebida = i.qtdAprovada ?? i.qtdSelecionada;
  saveListas();
  _renderEtapa4();
}

function setComentarioConferencia(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.comentarioConferencia = val; saveListas(); }
}

function concluirLista() {
  if (!_listaAtual) return;
  const naoConferidos = _listaAtual.itens.filter(i => !i.conferido).length;
  if (naoConferidos > 0) { toast('Confira todos os itens primeiro', 'err'); return; }

  // Atualiza custo dos itens no estoque
  _listaAtual.itens.forEach(i => {
    if (!i.itemId) return;
    const item = items.find(x => x.id === i.itemId);
    if (!item) return;
    if (i.qtdRecebida !== null) item.qty = parseFloat((item.qty + i.qtdRecebida).toFixed(3));
    if (i.precoUnitFinal) item.cost = i.precoUnitFinal;
  });
  saveI();

  _listaAtual.status       = 'concluida';
  _listaAtual.etapa        = 4;
  _listaAtual.dataConclusao= new Date().toISOString();
  _listaAtual.valorFinal   = _listaAtual.itens.reduce((s,i) =>
    s + (i.qtdRecebida??0) * (i.precoUnitFinal||i.precoUnitEstimado||0), 0);
  saveListas();

  _listaAtual = getListaAtiva();
  renderDashboard();
  renderComprasModule();
  toast('🎉 Lista concluída! Estoque atualizado.');
}

// ══════════════════════════════════════════════════════════════
// TIMER REGRESSIVO
// ══════════════════════════════════════════════════════════════
let _timerInterval = null;
function _startTimer(elId, deadline) {
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    const el = document.getElementById(elId);
    if (!el) { clearInterval(_timerInterval); return; }
    const ms  = new Date(deadline) - Date.now();
    if (ms <= 0) { el.textContent = 'Encerrado'; clearInterval(_timerInterval); return; }
    const h   = Math.floor(ms/3600000);
    const m   = Math.floor((ms%3600000)/60000);
    const s   = Math.floor((ms%60000)/1000);
    el.textContent = `${h}h ${m}m ${s}s`;
  }, 1000);
}

// ══════════════════════════════════════════════════════════════
// HISTÓRICO / OUTRAS LISTAS
// ══════════════════════════════════════════════════════════════
function verListasAnteriores() {
  const concluidas = listas.filter(l => l.status === 'concluida').sort((a,b) => b.id - a.id);
  if (!concluidas.length) { toast('Nenhuma lista concluída ainda', 'info'); return; }
  const linhas = concluidas.slice(0,10).map(l =>
    `${l.codigo} · ${fmtD(l.dataCriacao)} · R$${fmt(l.valorFinal)} · ${l.itens.length} itens`
  ).join('\n');
  alert('Histórico de listas concluídas:\n\n' + linhas);
}

function encerrarListaManual() {
  if (!_listaAtual) return;
  if (!confirm('Encerrar esta lista? Ela será arquivada sem concluir.')) return;
  _listaAtual.status = 'concluida';
  _listaAtual.dataConclusao = new Date().toISOString();
  saveListas();
  _listaAtual = getListaAtiva();
  renderComprasModule();
  toast('Lista encerrada.');
}

// Compat. legado
function calcEconomia() { return listas.filter(l=>l.status==='concluida').reduce((s,l)=>s+(l.valorEstimado-l.valorFinal||0),0); }

/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Módulo de Compras (v3)
 */

let _listaAtual      = null;
let _comprasTab      = 'lista';   // legado — mantido para compat interna
let _cpSection       = 'listas';  // 'listas' | 'historico' | 'insumos' | 'fornecedores'
let _cpListaAberta   = null;      // lista aberta no detalhe (flow)

// Retorna listas abertas (≠ concluida) que contêm o mesmo itemId, excluindo a lista atual
function _conflitosItem(itemId, listaIdIgnorar) {
  if (!itemId) return [];
  return listas.filter(l =>
    l.id !== listaIdIgnorar &&
    l.status !== 'concluida' &&
    l.itens?.some(i => i.itemId === itemId)
  );
}

// Badge compacto de conflito para uso inline nos cards de item
function _conflitoBadge(itemId) {
  const cs = _conflitosItem(itemId, _listaAtual?.id);
  if (!cs.length) return '';
  const nomes = cs.map(l => `#${l.codigo||l.id}`).join(', ');
  return `<span title="Insumo já está na(s) lista(s): ${nomes}" style="display:inline-flex;align-items:center;gap:3px;
    padding:1px 6px;border-radius:8px;border:1px solid var(--yellow);background:var(--yellow-light);
    color:var(--orange-dark);font-size:var(--text-2xs);font-weight:700;white-space:nowrap;cursor:default">
    ${lc('alert-triangle',8,'currentColor')} Lista ${nomes}
  </span>`;
}

// Banner de conflitos para o topo de cada etapa
function _conflitoBanner() {
  if (!_listaAtual) return '';
  const itensConflito = (_listaAtual.itens||[]).filter(i => _conflitosItem(i.itemId, _listaAtual.id).length > 0);
  if (!itensConflito.length) return '';
  const plural = itensConflito.length > 1 ? 'insumos estão' : 'insumo está';
  const nomes = itensConflito.map(i => i.nome).join(', ');
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;
    background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r10);font-size:var(--text-xs);color:var(--orange-dark)">
    ${lc('alert-triangle',14,'currentColor')}
    <div>
      <strong>${itensConflito.length} ${plural} presentes em outra(s) lista(s) ativa(s).</strong>
      Verifique se não haverá duplicidade no recebimento: <em>${nomes}</em>.
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL — settings-layout (nav lateral + conteúdo)
// ══════════════════════════════════════════════════════════════
function renderComprasModule() {
  renderComprasLayout();
}

function renderComprasLayout(section) {
  if (section) _cpSection = section;

  // Renderiza seção full-width (sem nav lateral — navegação é via sidebar)
  if (_cpSection === 'insumos') {
    _renderCpInsumos();
  } else if (_cpSection === 'fornecedores') {
    _renderCpFornecedores();
  } else if (_cpListaAberta) {
    _renderFlowLayout(_cpListaAberta);
  } else {
    _renderListaCompras();
  }
}

function setCpSection(section) {
  _cpSection = section;
  if (section !== 'listas') _cpListaAberta = null;
  renderComprasLayout();
}

// Alias legado
function setComprasTab(tab) {
  _cpSection = 'listas';
  _cpListaAberta = null;
  renderComprasLayout();
}

// Abre uma lista específica no flow de etapas (master → detail)
function _abrirListaDetalhe(listaId) {
  const l = listas.find(x => x.id === listaId);
  if (!l) return;
  _cpListaAberta = l;
  _listaAtual    = l;
  _cpSection     = 'listas';
  renderComprasLayout();
}

// Volta da lista detalhe para a lista principal
function _voltarParaListaCompras() {
  _cpListaAberta = null;
  _listaAtual    = getListaAtiva();
  renderComprasLayout();
}

// ── Renderiza o flow de etapas dentro do painel direito ──────
function _renderFlowLayout(lista) {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;
  const tp = TIPOS_LISTA[lista.tipo || 'insumos'] || TIPOS_LISTA.insumos;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 20px;
      background:var(--surface);border-bottom:1px solid var(--border)">
      <button onclick="_voltarParaListaCompras()"
        style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--r8);
        border:1.5px solid var(--border);background:var(--surface2);color:var(--text2);
        font-size:var(--text-xs);font-weight:600;cursor:pointer;font-family:Inter,sans-serif;flex-shrink:0">
        ${lc('arrow-left', 13, 'currentColor')} Voltar
      </button>
      <span style="font-size:var(--text-xs);color:var(--muted);flex-shrink:0">Lista de Compras</span>
      <span style="color:var(--muted);flex-shrink:0">/</span>
      <span style="font-size:var(--text-xs);font-weight:700;flex-shrink:0">${lista.codigo}</span>
      <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;
        font-size:var(--text-2xs);font-weight:700;background:${tp.bg};color:${tp.color};
        border:1px solid ${tp.color};flex-shrink:0">
        ${lc(tp.icon, 9, 'currentColor')} ${tp.label}
      </span>
    </div>
    <div id="comprasDash" style="background:var(--surface);border-bottom:2px solid var(--border);padding:14px 20px"></div>
    <div id="comprasContent" style="padding:24px"></div>`;

  _listaAtual = lista;
  _renderDashCompras();
  _renderEtapa(lista.etapa || 1);
}

// ── Modal de confirmação para excluir lista ───────────────────
function _abrirModalDeletarLista(listaId) {
  const lista = listas.find(l => l.id === listaId);
  if (!lista) return;
  const existing = document.getElementById('ovDeletarLista');
  if (existing) existing.remove();

  const ov = document.createElement('div');
  ov.id = 'ovDeletarLista';
  ov.className = 'overlay open';
  ov.innerHTML = `
    <div class="modal">
      <div class="mbox" style="max-width:440px;padding:0;overflow:hidden">

        <!-- Cabeçalho vermelho -->
        <div style="background:var(--red);padding:24px 28px 20px;display:flex;align-items:flex-start;gap:14px">
          <div style="width:44px;height:44px;border-radius:var(--r10);background:rgba(255,255,255,.18);
            display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('trash-2', 22, '#fff')}
          </div>
          <div>
            <div style="font-size:var(--text-md);font-weight:800;color:#fff;margin-bottom:3px">
              Excluir lista ${lista.codigo}
            </div>
            <div style="font-size:var(--text-xs);color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px">
              ${lc('alert-triangle', 11, 'rgba(255,255,255,.75)')} Esta ação é permanente e não pode ser desfeita
            </div>
          </div>
        </div>

        <!-- Corpo -->
        <div style="padding:24px 28px 20px">
          <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:20px;line-height:1.55">
            Você está prestes a excluir a lista <strong style="color:var(--text)">${lista.codigo}</strong>
            com todos os seus itens e cotações. Para confirmar, digite o código abaixo:
          </div>

          <div style="margin-bottom:20px">
            <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--text2);
              text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">
              Código de confirmação
            </label>
            <input id="inputConfirmCodigo" class="inp" placeholder="${lista.codigo}" autocomplete="off"
              oninput="_checkCodigoDeletar('${lista.codigo}', ${listaId})"
              style="font-size:var(--text-base);font-family:monospace;letter-spacing:3px;text-align:center;
              font-weight:700;padding:12px">
            <div id="msgConfirmCodigo" style="font-size:var(--text-xs);margin-top:5px;min-height:16px;color:var(--muted);text-align:center">
              Digite <strong>${lista.codigo}</strong> para habilitar a exclusão
            </div>
          </div>

          <!-- Ações -->
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" onclick="document.getElementById('ovDeletarLista').remove()"
              style="flex:1;min-height:44px;font-size:var(--text-sm);font-weight:600">
              Cancelar
            </button>
            <button id="btnConfirmarDeletar" class="btn btn-red" disabled
              onclick="_confirmarDeletarLista(${listaId})"
              style="flex:1;min-height:44px;font-size:var(--text-sm);font-weight:700;
              opacity:.4;cursor:not-allowed;display:flex;align-items:center;justify-content:center;gap:6px">
              ${lc('trash-2', 15, 'currentColor')} Excluir lista
            </button>
          </div>
        </div>

      </div>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('inputConfirmCodigo')?.focus(), 50);
}

function _checkCodigoDeletar(codigoEsperado, listaId) {
  const val = document.getElementById('inputConfirmCodigo')?.value?.trim().toUpperCase();
  const btn = document.getElementById('btnConfirmarDeletar');
  if (!btn) return;
  const ok = val === codigoEsperado.toUpperCase();
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.4';
  btn.style.cursor  = ok ? 'pointer' : 'not-allowed';
  const msg = document.getElementById('msgConfirmCodigo');
  if (msg) {
    if (!val) {
      msg.style.color = 'var(--muted)';
      msg.innerHTML = `Digite <strong>${codigoEsperado}</strong> para habilitar a exclusão`;
    } else if (ok) {
      msg.style.color = 'var(--red)';
      msg.innerHTML = `${lc('check-circle', 11, 'currentColor')} Código confirmado — clique em "Excluir lista" para continuar`;
    } else {
      msg.style.color = 'var(--orange-dark)';
      msg.innerHTML = `${lc('alert-circle', 11, 'currentColor')} Código incorreto`;
    }
  }
}

function _confirmarDeletarLista(listaId) {
  const idx = listas.findIndex(l => l.id === listaId);
  if (idx < 0) return;
  const codigo = listas[idx].codigo;
  listas.splice(idx, 1);
  saveListas();
  document.getElementById('ovDeletarLista')?.remove();
  _cpListaAberta = null;
  _listaAtual = null;
  renderComprasLayout();
  toast(`${lc('check-circle', 14, 'var(--green)')} Lista ${codigo} excluída`);
}

// ── Renderiza historico dentro do painel direito ─────────────
// ── Nova página principal: Lista de Compras ──────────────────
// Retorna { de, ate } da semana atual (seg–dom) como string YYYY-MM-DD
function _semanaAtualDates() {
  const hoje = new Date();
  const dow = hoje.getDay(); // 0=dom
  const diffSeg = dow === 0 ? -6 : 1 - dow;
  const seg = new Date(hoje); seg.setDate(hoje.getDate() + diffSeg);
  const dom = new Date(seg);  dom.setDate(seg.getDate() + 6);
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return { de: fmt(seg), ate: fmt(dom) };
}

function _renderListaCompras() {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;

  // Inicializa filtros de data com semana atual na primeira renderização
  if (window._lcDe === undefined && window._lcAte === undefined) {
    const { de: deSem, ate: ateSem } = _semanaAtualDates();
    window._lcDe  = deSem;
    window._lcAte = ateSem;
  }

  const busca   = (window._lcBusca   || '').toLowerCase();
  const status  =  window._lcStatus  || 'all';
  const etapa   =  window._lcEtapa   || '';
  const de      =  window._lcDe      !== undefined ? window._lcDe  : '';
  const ate     =  window._lcAte     !== undefined ? window._lcAte : '';

  const ETAPAS = [
    { n: 1, label: 'Montagem' }, { n: 2, label: 'Pré-Aprov.' },
    { n: 3, label: 'Cotação'  }, { n: 4, label: 'Aprovação'  },
    { n: 5, label: 'OC'       }, { n: 6, label: 'Recebimento' },
  ];

  let lista = [...listas].sort((a, b) => new Date(b.dataCriacao || 0) - new Date(a.dataCriacao || 0));
  if (status === 'ativas')     lista = lista.filter(l => l.status !== 'concluida');
  if (status === 'concluidas') lista = lista.filter(l => l.status === 'concluida');
  if (etapa) lista = lista.filter(l => String(l.etapa) === etapa);
  if (busca) lista = lista.filter(l =>
    (l.codigo || '').toLowerCase().includes(busca) ||
    (l.criadoPor || '').toLowerCase().includes(busca) ||
    (l.itens || []).some(i => (i.nome || '').toLowerCase().includes(busca))
  );
  if (de)  lista = lista.filter(l => (l.dataCriacao || '').slice(0, 10) >= de);
  if (ate) lista = lista.filter(l => (l.dataCriacao || '').slice(0, 10) <= ate);

  const filtrando = !!(busca || status !== 'all' || etapa || de || ate);

  // KPIs do período filtrado
  const concluidas  = lista.filter(l => l.status === 'concluida');
  const emAndamento = lista.filter(l => l.status !== 'concluida');
  const totalGasto  = concluidas.reduce((s, l) => s + (l.valorFinal || 0), 0);
  const totalItens  = lista.reduce((s, l) => s + (l.itens?.length || 0), 0);
  const economia    = concluidas.reduce((s, l) => s + Math.max(0, (l.valorEstimado || 0) - (l.valorFinal || 0)), 0);
  const ticketMedio = concluidas.length ? totalGasto / concluidas.length : 0;
  const { de: deSem, ate: ateSem } = _semanaAtualDates();
  const isSemanaAtual = de === deSem && ate === ateSem;

  el.innerHTML = `
    <div style="padding:20px 24px">
      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${lc('clipboard-list', 16, 'var(--purple)')} Lista de Compras</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${lista.length} lista(s)${filtrando ? ' · filtrado' : ''}</div>
        </div>
        <button onclick="_abrirModalCriarLista()"
          style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r8);
          border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;
          cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
          ${lc('plus', 14, '#fff')} Nova lista
        </button>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light,#c4b5fd);border-radius:var(--r10);padding:13px 16px">
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--purple);margin-bottom:5px;display:flex;align-items:center;gap:4px">
            ${lc('dollar-sign', 10, 'currentColor')} Total comprado
          </div>
          <div style="font-size:1.18rem;font-weight:800;color:var(--purple);font-family:monospace;line-height:1">R$ ${fmt(totalGasto)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px">${concluidas.length} lista(s) concluída(s)</div>
        </div>
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:13px 16px">
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px;display:flex;align-items:center;gap:4px">
            ${lc('shopping-bag', 10, 'currentColor')} Ticket médio
          </div>
          <div style="font-size:1.18rem;font-weight:800;color:var(--text);font-family:monospace;line-height:1">R$ ${fmt(ticketMedio)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px">por lista concluída</div>
        </div>
        <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:13px 16px">
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:5px;display:flex;align-items:center;gap:4px">
            ${lc('trending-down', 10, 'currentColor')} Economia gerada
          </div>
          <div style="font-size:1.18rem;font-weight:800;color:var(--green);font-family:monospace;line-height:1">R$ ${fmt(economia)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px">estimado vs. final</div>
        </div>
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:13px 16px">
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px;display:flex;align-items:center;gap:4px">
            ${lc('package', 10, 'currentColor')} Itens comprados
          </div>
          <div style="font-size:1.18rem;font-weight:800;color:var(--text);line-height:1">${totalItens}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px">${emAndamento.length > 0 ? emAndamento.length + ' em andamento' : 'todas concluídas'}</div>
        </div>
      </div>

      <!-- Filtros -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end">
        <div style="flex:2;min-width:160px">
          <input type="text" class="inp" placeholder="Buscar por código, fornecedor..."
            value="${busca}"
            oninput="window._lcBusca=this.value; _renderListaCompras()"
            style="width:100%">
        </div>
        <div style="min-width:130px">
          <select class="inp" style="width:100%"
            onchange="window._lcStatus=this.value; _renderListaCompras()">
            <option value="all"        ${status==='all'        ?'selected':''}>Todas</option>
            <option value="ativas"     ${status==='ativas'     ?'selected':''}>Ativas</option>
            <option value="concluidas" ${status==='concluidas' ?'selected':''}>Concluídas</option>
          </select>
        </div>
        <div style="min-width:140px">
          <select class="inp" style="width:100%"
            onchange="window._lcEtapa=this.value; _renderListaCompras()">
            <option value="">Todas as etapas</option>
            ${ETAPAS.map(e => `<option value="${e.n}" ${etapa===String(e.n)?'selected':''}>${e.label}</option>`).join('')}
          </select>
        </div>
        <div style="min-width:110px">
          <input type="date" class="inp" style="width:100%" value="${de}"
            onchange="window._lcDe=this.value; _renderListaCompras()">
        </div>
        <div style="min-width:110px">
          <input type="date" class="inp" style="width:100%" value="${ate}"
            onchange="window._lcAte=this.value; _renderListaCompras()">
        </div>
        ${!isSemanaAtual ? `<button class="btn btn-outline btn-xs" onclick="_lcSemanaAtual()" title="Voltar para semana atual">${lc('calendar', 11, 'currentColor')} Esta semana</button>` : ''}
        ${filtrando ? `<button class="btn btn-outline btn-sm" onclick="_lcLimparFiltros()">${lc('x', 12)} Limpar</button>` : ''}
      </div>

      <!-- Lista -->
      ${lista.length === 0
        ? `<div class="empty" style="padding:48px">
            <div class="empty-icon">${lc('clipboard-list', 28, 'var(--muted)')}</div>
            ${filtrando ? 'Nenhuma lista encontrada para estes filtros.' : 'Nenhuma lista de compras criada ainda.'}
          </div>`
        : lista.map(l => _cardListaCompras(l)).join('')
      }
    </div>`;
}

function _cardListaCompras(l) {
  const st  = STATUS_ETAPA[l.status] || { label: l.status, color: 'var(--muted)', bg: 'var(--surface2)' };
  const tp  = TIPOS_LISTA[l.tipo || 'insumos'] || TIPOS_LISTA.insumos;
  const val = l.valorFinal || l.valorEstimado || 0;
  const ETAPAS_LABEL = ['', 'Montagem', 'Pré-Aprov.', 'Cotação', 'Aprovação', 'OC', 'Recebimento'];
  const etapaLabel = l.status === 'concluida' ? 'Concluída' : (ETAPAS_LABEL[l.etapa] || `Etapa ${l.etapa}`);
  const isConcluida = l.status === 'concluida';

  return `
    <div onclick="_abrirListaDetalhe(${l.id})"
      style="display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:8px;
      background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);
      cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--purple-light)';this.style.background='var(--purple-xlight)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">

      <!-- Ícone tipo -->
      <div style="width:40px;height:40px;border-radius:var(--r8);background:${tp.bg};
        display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lc(tp.icon, 18, tp.color)}
      </div>

      <!-- Info principal -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
          <span style="font-size:var(--text-sm);font-weight:800">${l.codigo}</span>
          <span style="padding:2px 8px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;
            background:${st.bg};color:${st.color};border:1px solid ${st.color}">${etapaLabel}</span>
          <span style="padding:2px 7px;border-radius:10px;font-size:var(--text-2xs);font-weight:600;
            background:${tp.bg};color:${tp.color}">${tp.label}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          ${lc('user', 10, 'currentColor')} ${l.criadoPor || '—'}
          &nbsp;·&nbsp;
          ${lc('calendar', 10, 'currentColor')} ${fmtD(l.dataCriacao)}
        </div>
      </div>

      <!-- Resumo numérico + ações -->
      <div style="display:flex;gap:12px;align-items:center;flex-shrink:0">
        <div style="text-align:right">
          <div style="font-size:var(--text-sm);font-weight:800;font-family:monospace;color:var(--purple)">
            R$ ${fmt(val)}
          </div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${(l.itens || []).length} iten(s)</div>
        </div>
        ${(['gerente','supervisor'].includes(getCurrentUser()?.role)) ? `
        <button onclick="event.stopPropagation();_abrirAuditoriaLista(${l.id})"
          title="Ver auditoria"
          style="width:32px;height:32px;border-radius:var(--r8);border:1.5px solid var(--border);
          background:var(--surface2);cursor:pointer;display:flex;align-items:center;justify-content:center;
          transition:all .15s;flex-shrink:0"
          onmouseover="this.style.background='var(--purple-xlight)';this.style.borderColor='var(--purple-light)'"
          onmouseout="this.style.background='var(--surface2)';this.style.borderColor='var(--border)'">
          ${lc('file-text', 14, 'var(--muted)')}
        </button>` : ''}
        ${lc('chevron-right', 16, 'var(--muted)')}
      </div>
    </div>`;
}

function _lcLimparFiltros() {
  window._lcBusca  = '';
  window._lcStatus = 'all';
  window._lcEtapa  = '';
  window._lcDe     = '';
  window._lcAte    = '';
  _renderListaCompras();
}

function _lcSemanaAtual() {
  const { de, ate } = _semanaAtualDates();
  window._lcDe  = de;
  window._lcAte = ate;
  _renderListaCompras();
}

function _abrirAuditoriaLista(listaId) {
  const lista   = listas.find(l => l.id === listaId);
  if (!lista) return;
  const entries = (auditLog || []).filter(e =>
    String(e.lista_id) === String(listaId) ||
    (e.detalhe || '').includes('Lista #' + listaId) ||
    (e.detalhe || '').includes('#' + (lista.codigo || ''))
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let ov = document.getElementById('ovAuditoria');
  if (!ov) { ov = document.createElement('div'); ov.id = 'ovAuditoria'; document.body.appendChild(ov); }

  const rowHtml = entries.length === 0
    ? `<div style="padding:32px;text-align:center;color:var(--muted)">${lc('inbox', 28, 'currentColor')}<br><br>Nenhum registro de auditoria para esta lista.</div>`
    : entries.map(e => `
        <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--purple-xlight);
            display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('user', 13, 'var(--purple)')}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-xs);font-weight:700">${e.user_name || '—'} <span style="font-weight:400;color:var(--muted)">(${e.user_role || ''})</span></div>
            <div style="font-size:var(--text-xs);color:var(--text);margin-top:2px">${e.acao || ''}</div>
            ${e.detalhe ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${e.detalhe}</div>` : ''}
            <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:3px">${lc('clock', 9, 'currentColor')} ${fmtDT(e.created_at)}</div>
          </div>
        </div>`).join('');

  ov.className = 'overlay open';
  ov.onclick = e => { if (e.target === ov) { ov.className = 'overlay'; } };
  ov.innerHTML = `
    <div class="modal">
      <div class="mbox" style="max-width:520px;padding:0;overflow:hidden;max-height:90vh;display:flex;flex-direction:column">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:var(--r8);background:var(--purple-xlight);
            display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('file-text', 16, 'var(--purple)')}
          </div>
          <div style="flex:1">
            <div style="font-size:var(--text-sm);font-weight:800">Auditoria · ${lista.codigo}</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">${entries.length} registro(s)</div>
          </div>
          <button onclick="document.getElementById('ovAuditoria').className='overlay'"
            style="width:32px;height:32px;border:none;background:var(--surface2);border-radius:var(--r8);cursor:pointer;display:flex;align-items:center;justify-content:center">
            ${lc('x', 14, 'var(--muted)')}
          </button>
        </div>
        <div style="padding:0 24px;overflow-y:auto;flex:1">
          ${rowHtml}
        </div>
      </div>
    </div>`;
}

function _renderComprasTabs() {
  // tabs removidas — Histórico foi descontinuado
}

function _renderSemLista() {
  document.getElementById('comprasContent').innerHTML = `
    <div style="text-align:center;padding:52px 24px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--purple-light);
        display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        ${lc('shopping-cart', 28, 'var(--purple)')}
      </div>
      <div style="font-size:1.05rem;font-weight:800;margin-bottom:8px">Nenhuma lista ativa</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:28px;max-width:320px;margin-left:auto;margin-right:auto">
        Crie uma lista de compras para iniciar o ciclo de cotação e aprovação.
      </div>
      <button class="btn btn-primary" onclick="_abrirModalCriarLista()"
        style="font-size:var(--text-md);padding:12px 28px;gap:8px">
        ${lc('plus-circle', 17, '#fff')} Criar Lista de Compras
      </button>
    </div>`;
}

function _abrirModalCriarLista() {
  _abrirModalTipoLista(tipo => {
    if (tipo === 'insumos') _criarListaDoEstoque();
    else _criarListaAvulsa(tipo);
  });
}

function _criarListaDoEstoque() {
  // Apenas insumos (!isProd) — preparados são produção interna, não compra
  const criticos = items.filter(i => !i.isProd && gst(i) !== 'ok');
  if (!criticos.length) {
    toast('Todos os insumos estão acima do mínimo no estoque!', 'warn');
    return;
  }
  const carrinho = criticos.map(i => ({
    itemId:      i.id,
    qty:         Math.max(1, Math.round((i.ideal || i.min * 1.5 || 5) - (i.qty || 0))),
    qtdSugerida: Math.max(1, Math.round((i.ideal || i.min * 1.5 || 5) - (i.qty || 0))),
    origem:      'estoque',
  }));
  const lista = novaLista(carrinho);
  lista.tipo   = 'insumos';
  lista.origem = 'estoque';
  saveListas();
  try { logAudit('lista_criada', 'Lista #' + lista.id + ' (do estoque)', 'compras'); } catch(e) {}
  _listaAtual = lista;
  toast(`Lista criada com ${criticos.length} insumo(s) abaixo do mínimo!`);
  _abrirListaDetalhe(lista.id);
}

function _criarListaAvulsa(tipo) {
  const lista = novaLista([]);
  lista.origem = 'avulsa';
  lista.tipo   = tipo;
  saveListas();
  try { logAudit('lista_criada', 'Lista #' + lista.id + ' (avulsa — ' + tipo + ')', 'compras'); } catch(e) {}
  _listaAtual = lista;
  toast('Lista criada! Adicione os itens.');
  _abrirListaDetalhe(lista.id);
}

// Mantido para compatibilidade com referências externas
function criarListaAvulsa() { _abrirModalCriarLista(); }

function _abrirModalTipoLista(onConfirm) {
  const popup = document.createElement('div');
  popup.id = 'popupTipoLista';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r16);padding:24px;width:100%;max-width:480px;box-shadow:0 16px 48px rgba(0,0,0,.22)">
      <div style="font-size:var(--text-base);font-weight:800;margin-bottom:4px">${lc('clipboard-list',16,'var(--purple)')} Nova lista de compras</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:16px">Selecione o tipo de compra desta lista</div>

      <!-- Insumos — destaque especial -->
      <button data-tipo="insumos" onclick="_selecionarTipoCard('insumos')" id="tipoCard-insumos"
        style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--r10);
        width:100%;margin-bottom:8px;
        border:2px solid var(--purple);background:var(--purple-xlight);
        cursor:pointer;text-align:left;transition:all .12s">
        <span style="width:36px;height:36px;border-radius:50%;background:var(--purple);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc('package',16,'#fff')}
        </span>
        <div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple)">Insumos de Produção</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${lc('zap',9,'var(--green)')} Preenche automaticamente com itens abaixo do mínimo no estoque</div>
        </div>
      </button>

      <!-- Outros tipos -->
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin:12px 0 7px">Outros tipos — lista manual</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:18px" id="tipoListaGrid">
        ${Object.entries(TIPOS_LISTA).filter(([k]) => k !== 'insumos').map(([k,t]) => `
          <button data-tipo="${k}" onclick="_selecionarTipoCard('${k}')"
            style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:var(--r8);
            border:1.5px solid var(--border);background:var(--surface);
            cursor:pointer;text-align:left;transition:all .12s" id="tipoCard-${k}">
            <span style="color:var(--muted);flex-shrink:0">${lc(t.icon,13,'currentColor')}</span>
            <span style="font-size:var(--text-xs);font-weight:600;color:var(--text2)">${t.label}</span>
          </button>`).join('')}
      </div>
      <input type="hidden" id="tipoListaSel" value="insumos">
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupTipoLista').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_confirmarTipoLista()">Criar lista</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup._onConfirm = onConfirm;
}

function _selecionarTipoCard(tipo) {
  document.getElementById('tipoListaSel').value = tipo;
  // Insumos card — estilo especial
  const insBtn = document.getElementById('tipoCard-insumos');
  if (insBtn) {
    const sel = tipo === 'insumos';
    insBtn.style.borderColor = sel ? 'var(--purple)' : 'var(--border)';
    insBtn.style.borderWidth = sel ? '2px' : '1.5px';
    insBtn.style.background  = sel ? 'var(--purple-xlight)' : 'var(--surface)';
  }
  // Outros tipos
  Object.keys(TIPOS_LISTA).filter(k => k !== 'insumos').forEach(k => {
    const btn = document.getElementById('tipoCard-' + k);
    if (!btn) return;
    const t = TIPOS_LISTA[k];
    const sel = k === tipo;
    btn.style.borderColor = sel ? t.color : 'var(--border)';
    btn.style.background  = sel ? t.bg    : 'var(--surface)';
    const spans = btn.querySelectorAll('span');
    if (spans[0]) spans[0].style.color = sel ? t.color : 'var(--muted)';
    if (spans[1]) spans[1].style.color = sel ? t.color : 'var(--text2)';
  });
}

function _confirmarTipoLista() {
  const tipo  = document.getElementById('tipoListaSel')?.value || 'insumos';
  const popup = document.getElementById('popupTipoLista');
  const cb    = popup?._onConfirm;
  popup?.remove();
  if (cb) cb(tipo);
}

function _alterarTipoLista() {
  if (!_listaAtual) return;
  _abrirModalTipoLista(tipo => {
    _listaAtual.tipo = tipo;
    saveListas();
    _renderDashCompras();
    _renderEtapa1();
    toast('Tipo da lista atualizado!');
  });
  // Pré-seleciona o tipo atual no modal
  setTimeout(() => _selecionarTipoCard(_listaAtual.tipo || 'insumos'), 50);
}

function _renderDashCompras() {
  const el = document.getElementById('comprasDash');
  if (!el) return;
  const la = _listaAtual;
  const st = la ? (STATUS_ETAPA[la.status] || {}) : null;

  // Todas as listas em andamento (não concluídas), mais recentes primeiro
  const ativas = listas.filter(l => l.status !== 'concluida').sort((a,b) => b.id - a.id);

  const u2 = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const podeExcluir = u2 && la && ['gerente', 'supervisor'].includes(u2.role);

  el.innerHTML = `
    <!-- Linha principal: identidade + KPIs inline + ações -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:${ativas.length > 1 ? '10px' : '0'}">
      <div style="flex:1;min-width:160px">
        ${la ? `
          <div style="font-size:var(--text-md);font-weight:800;color:var(--text);line-height:1.2">${la.codigo}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Criada ${fmtD(la.dataCriacao)} por ${la.criadoPor}</div>
        ` : `<div style="font-size:var(--text-md);font-weight:700">Compras</div><div style="font-size:var(--text-xs);color:var(--muted)">Nenhuma lista ativa</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${la ? `
          <!-- KPIs inline compactos -->
          <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--r8);background:var(--surface2);border:1px solid var(--border)">
            <span style="font-size:var(--text-sm);font-weight:800;color:var(--purple)">${la.itens.length}</span>
            <span style="font-size:var(--text-2xs);color:var(--muted)">itens</span>
          </div>
          <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--r8);background:var(--surface2);border:1px solid var(--border)">
            <span style="font-size:var(--text-xs);font-weight:800;color:var(--purple);font-family:monospace">R$${fmt(la.valorEstimado||0)}</span>
            <span style="font-size:var(--text-2xs);color:var(--muted)">est.</span>
          </div>
          <!-- Status como pill com dot colorido -->
          <div style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:var(--r8);
            background:var(--surface2);border:1px solid var(--border)">
            <span style="width:7px;height:7px;border-radius:50%;background:${st.color||'var(--muted)'};flex-shrink:0;display:inline-block"></span>
            <span style="font-size:var(--text-xs);font-weight:700;color:${st.color||'var(--muted)'}">${st.label||la.status}</span>
          </div>
          <!-- Divisor + ações -->
          <div style="width:1px;height:28px;background:var(--border);flex-shrink:0"></div>
          <button onclick="encerrarListaManual()"
            style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:var(--r8);
            border:1.5px solid var(--red);background:transparent;color:var(--red);
            font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
            ${lc('x',11,'currentColor')} Encerrar
          </button>
        ` : ''}
        <button onclick="_abrirModalCriarLista()"
          style="display:inline-flex;align-items:center;gap:5px;padding:6px 13px;
          border-radius:var(--r8);border:none;background:var(--purple);
          color:#fff;font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
          ${lc('plus',12,'#fff')} Nova lista
        </button>
        ${podeExcluir ? `
        <button onclick="_abrirModalDeletarLista(${la.id})"
          title="Excluir lista"
          style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;
          border-radius:var(--r8);border:1.5px solid var(--border);background:transparent;
          color:var(--muted);cursor:pointer;font-family:Inter,sans-serif;flex-shrink:0;transition:all .15s"
          onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)';this.style.background='var(--red-light)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)';this.style.background='transparent'">
          ${lc('trash-2',13,'currentColor')}
        </button>` : ''}
      </div>
    </div>

    <!-- Seletor de listas em andamento (só quando >1) -->
    ${ativas.length > 1 ? `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);white-space:nowrap;flex-shrink:0">Listas abertas:</span>
      ${ativas.map(l => {
        const isCur = la && l.id === la.id;
        const s = STATUS_ETAPA[l.status] || {};
        return `<button onclick="_trocarLista(${l.id})"
          style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;
          border-radius:20px;border:1.5px solid ${isCur?'var(--purple)':'var(--border)'};
          background:${isCur?'var(--purple-xlight)':'var(--surface)'};
          color:${isCur?'var(--purple)':'var(--text2)'};font-size:var(--text-xs);font-weight:${isCur?'700':'500'};
          cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
          <span style="font-weight:700">${l.codigo}</span>
          <span style="padding:1px 6px;border-radius:8px;background:${s.bg||'var(--surface2)'};color:${s.color||'var(--muted)'};font-size:var(--text-2xs);font-weight:700">${s.label||l.status}</span>
        </button>`;
      }).join('')}
    </div>` : ''}

    <!-- Stepper de etapas -->
    ${la ? `
    <div style="display:flex;gap:0;margin:${ativas.length > 1 ? '0' : '10px'} -20px 0;border-top:1px solid var(--border)">
      ${[{n:1,label:'Lista',icon:'list'},{n:2,label:'Pré-Aprov.',icon:'user-check'},{n:3,label:'Cotação',icon:'tag'},{n:4,label:'Aprovação',icon:'check-circle'},{n:5,label:'OC',icon:'shopping-bag'},{n:6,label:'Recebimento',icon:'package'}].map((s,idx,arr) => {
        const done = la.etapa > s.n, cur = la.etapa === s.n;
        const barColor  = done ? 'var(--green)' : cur ? 'var(--purple)' : 'transparent';
        const txtColor  = done ? 'var(--green)' : cur ? 'var(--purple)' : 'var(--muted)';
        const iconName  = done ? 'check' : s.icon;
        const iconColor = done ? 'var(--green)' : cur ? 'var(--purple)' : 'var(--muted)';
        return `<div style="flex:1;text-align:center;cursor:${done||cur?'pointer':'default'};padding:8px 2px 6px;
          border-top:3px solid ${barColor};transition:border-color .2s" ${done||cur?`onclick="_renderEtapa(${s.n})"`:''}>
          <div style="font-size:var(--text-2xs);font-weight:${done||cur?'700':'500'};color:${txtColor};
            display:flex;align-items:center;justify-content:center;gap:2px;line-height:1.3">
            ${lc(iconName, 10, iconColor)} ${s.label}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}`;

  _renderComprasTabs();
}

function _trocarLista(listaId) {
  const l = listas.find(x => x.id === listaId);
  if (!l) return;
  _cpListaAberta = l;
  _listaAtual    = l;
  _renderDashCompras();
  _renderEtapa(l.etapa || 1);
}

function _renderEtapa(n) {
  _comprasTab = 'lista';
  if (!_listaAtual) { _renderSemLista(); return; }
  if      (n === 1) _renderEtapa1();
  else if (n === 2) _renderEtapaAprovPre();
  else if (n === 3) _renderEtapa3Cotacao();
  else if (n === 4) _renderEtapaAprovFinal();
  else if (n === 5) _renderEtapaOC();
  else if (n === 6) _renderEtapaRecebimento();
  const banner = _conflitoBanner();
  if (banner) {
    const el = document.getElementById('comprasContent');
    if (el) el.insertAdjacentHTML('afterbegin', banner);
  }
}

// Aliases — nomes canônicos usados pelo router
function _renderEtapa3Cotacao()    { _renderEtapa2Cotacao(); }
function _renderEtapaAprovFinal()  { _renderAprovacaoFinal(); }
function _renderEtapaOC()          { _renderOCPorFornecedor(); }
function _renderEtapaRecebimento() { _renderEtapa4OC(); }
// Legacy aliases (mantidos para calls internos antigos)
function _renderEtapa2()              { _renderEtapa2Cotacao(); }
function _renderEtapa3Aprovacao()     { _renderAprovacaoFinal(); }
// Nota: _renderEtapa3() tem implementação real na linha ~2305 (OC), não sobrescrever aqui

// ══════════════════════════════════════════════════════════════
// ETAPA 1 — LISTA COM AUTO-FORNECEDORES
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ETAPA 1 — CARRINHO DE COMPRAS
// Arquitetura: render completo na 1ª vez, updates parciais depois
// ══════════════════════════════════════════════════════════════

if (!window._e1Filtro) window._e1Filtro = { search:'', cat:'', status:'need' };
if (!window._e1ModoEmb) window._e1ModoEmb = false; // false = base (kg), true = embalagem

// ── Helpers de embalagem ──────────────────────────────────────
// Converte qtd em unidade base para embalagens (arredonda para cima)
function toEmb(item, qtdBase) {
  if (!item?.qtdEmb || item.qtdEmb <= 0) return null;
  return Math.ceil(qtdBase / item.qtdEmb);
}
// Converte embalagens para unidade base
function fromEmb(item, embs) {
  if (!item?.qtdEmb || item.qtdEmb <= 0) return embs;
  return parseFloat((embs * item.qtdEmb).toFixed(3));
}
// Formata quantidade com informação de embalagem
function fmtQtdEmb(item, qtdBase) {
  if (!item?.unidCompra || !item?.qtdEmb || item.qtdEmb <= 0) return null;
  const embs = toEmb(item, qtdBase);
  return { embs, texto: `${embs} ${item.unidCompra}(s) = ${fmt(qtdBase)} ${item.unit}` };
}

// Retorna dados de embalagem para um item da lista (usa itemId para buscar cadastro)
function _qEmb(listaItem, qtdBase) {
  const ic = listaItem?.itemId ? items.find(x => x.id === listaItem.itemId) : null;
  if (!ic?.unidCompra || !(ic.qtdEmb > 0)) return null;
  return { embs: Math.ceil(qtdBase / ic.qtdEmb), uc: ic.unidCompra, ic };
}

// HTML compacto mostrando qtd em embalagem + unidade base (empilhados)
function _qtdHtml(listaItem, qtdBase, opts = {}) {
  const e   = _qEmb(listaItem, qtdBase);
  const uid = listaItem?.unidade || '';
  const baseSpan = `<span style="font-family:monospace${opts.bold ? ';font-weight:700' : ''}">${fmt(qtdBase)} ${uid}</span>`;
  if (!e) return baseSpan;
  const sz = opts.sz || '.82rem';
  return `<div style="line-height:1.35;text-align:${opts.align||'center'}">
    <div style="font-size:${sz};font-weight:800;font-family:monospace;color:var(--purple)">${e.embs} ${e.uc}</div>
    <div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">${fmt(qtdBase)} ${uid}</div>
  </div>`;
}

function _renderEtapa1() {
  _listaAtual.etapa = 1;
  saveListas();

  // Render estrutural completo (esqueleto da página)
  _e1RenderEstrutura();
  // Renderiza tabela e carrinho como partes independentes
  _e1RenderTabela();
  _e1RenderCarrinho();
}

// Renderiza o esqueleto HTML — só chamado 1 vez ou ao trocar de módulo
function _e1RenderEstrutura() {
  const l     = _listaAtual;
  const cats  = [...new Set(items.filter(i=>!i.isProd).map(i=>i.cat))].sort();
  const f     = window._e1Filtro;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;${isMobile()?'flex-direction:column':''}">

      <!-- Coluna principal -->
      <div style="flex:1;min-width:0;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">
              ${lc('list',14,'var(--purple)')} Selecionar itens para compra
            </h3>
            <div style="display:flex;align-items:center;gap:7px;margin-top:2px">
              ${(()=>{ const tp=TIPOS_LISTA[l.tipo||'insumos']||TIPOS_LISTA.insumos; return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${tp.bg};color:${tp.color};border:1px solid ${tp.color}">${lc(tp.icon,9,'currentColor')} ${tp.label}</span>`; })()}
              <button onclick="_alterarTipoLista()" style="background:none;border:none;font-size:var(--text-xs);color:var(--muted);cursor:pointer;padding:0;text-decoration:underline">alterar</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <!-- Toggle kg / embalagem — só aparece se houver itens com embalagem cadastrada -->
            <div id="e1ToggleModoWrap" style="display:none;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);padding:3px;display:flex;gap:2px">
              <button id="e1BtnBase" onclick="e1SetModoEmb(false)"
                style="padding:5px 11px;border-radius:var(--r6);border:none;font-size:var(--text-sm);font-weight:600;cursor:pointer;transition:all .15s;
                background:var(--surface);color:var(--muted)">
                ${lc('weight',11,'currentColor')} Base
              </button>
              <button id="e1BtnEmb" onclick="e1SetModoEmb(true)"
                style="padding:5px 11px;border-radius:var(--r6);border:none;font-size:var(--text-sm);font-weight:600;cursor:pointer;transition:all .15s;
                background:var(--surface);color:var(--muted)">
                ${lc('package',11,'currentColor')} Embalagem
              </button>
            </div>
            <button onclick="imprimirCarrinho()"
              style="display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:var(--r8);
              border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:var(--text-sm);font-weight:600;cursor:pointer">
              ${lc('printer',13,'currentColor')} Imprimir lista
            </button>
            <button onclick="abrirAddItemManual()"
              style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r8);
              border:1.5px solid var(--purple);background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer">
              ${lc('plus',13,'#fff')} Item avulso
            </button>
          </div>
        </div>

        <!-- Filtros — inputs com IDs fixos, não são recriados -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
          <input id="e1Search" class="inp" style="max-width:200px;padding:6px 10px;font-size:var(--text-sm)" placeholder="Buscar insumo..."
            value="${f.search}">
          <select id="e1Cat" class="inp" style="max-width:170px;padding:6px 8px;font-size:var(--text-sm)">
            <option value="">Todas categorias</option>
            ${cats.map(c=>`<option value="${c}" ${f.cat===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <div id="e1FiltrosBtns" style="display:flex;gap:4px;flex-wrap:wrap"></div>
        </div>

        <!-- Tabela — atualizada independentemente -->
        <div class="tbl-wrap">
          <table id="e1Table">
            <thead><tr>
              <th>Insumo</th>
              <th class="c" style="width:48px">Un.</th>
              <th class="c" style="width:80px">Digital</th>
              <th class="c" style="width:70px">Mínimo</th>
              <th class="c" style="width:70px">Ideal</th>
              <th style="width:110px">Nível</th>
              <th class="c" style="width:72px">Status</th>
              <th style="width:200px;text-align:right">Adicionar</th>
            </tr></thead>
            <tbody id="e1TableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Carrinho lateral — atualizado independentemente -->
      <div style="width:${isMobile()?'100%':'268px'};flex-shrink:0;${isMobile()?'':'position:sticky;top:20px'}" id="e1CarrinhoWrap">
        <!-- preenchido por _e1RenderCarrinho -->
      </div>

    </div>`;

  // Bind eventos dos filtros APÓS inserir no DOM
  _e1BindFiltros();
}

function _e1BindFiltros() {
  // Search
  const searchEl = document.getElementById('e1Search');
  if (searchEl) {
    searchEl.oninput = function() {
      window._e1Filtro.search = this.value;
      _e1RenderTabela();
    };
  }
  // Category
  const catEl = document.getElementById('e1Cat');
  if (catEl) {
    catEl.onchange = function() {
      window._e1Filtro.cat = this.value;
      _e1RenderTabela();
    };
  }
  // Filtro buttons
  _e1RenderFiltrosBtns();
  // Toggle modo embalagem — mostra se houver algum insumo com embalagem cadastrada
  _e1AtualizarToggle();
}

function _e1AtualizarToggle() {
  const temEmb = items.some(i => !i.isProd && i.unidCompra && i.qtdEmb > 0);
  const wrap   = document.getElementById('e1ToggleModoWrap');
  if (!wrap) return;
  wrap.style.display = temEmb ? 'flex' : 'none';
  _e1AtualizarBotoesToggle();
}

function _e1AtualizarBotoesToggle() {
  const modo   = window._e1ModoEmb;
  const btnBase= document.getElementById('e1BtnBase');
  const btnEmb = document.getElementById('e1BtnEmb');
  if (btnBase) {
    btnBase.style.background = !modo ? 'var(--purple)' : 'transparent';
    btnBase.style.color      = !modo ? '#fff' : 'var(--muted)';
  }
  if (btnEmb) {
    btnEmb.style.background = modo ? 'var(--purple)' : 'transparent';
    btnEmb.style.color      = modo ? '#fff' : 'var(--muted)';
  }
}

function e1SetModoEmb(modoEmb) {
  window._e1ModoEmb = modoEmb;
  _e1AtualizarBotoesToggle();
  _e1RenderTabela();
  _e1RenderCarrinho();
}

function _e1RenderFiltrosBtns() {
  const el = document.getElementById('e1FiltrosBtns');
  if (!el) return;
  const f = window._e1Filtro;
  const btns = [
    {id:'all',  label:'Todos',       icon:'package'},
    {id:'need', label:'Necessidade', icon:'arrow-up'},
    {id:'crit', label:'Críticos',    icon:'alert-circle'},
    {id:'warn', label:'Baixo',       icon:'alert-triangle'},
  ];
  el.innerHTML = btns.map(b =>
    `<button class="filter-btn ${f.status===b.id?'active':''}"
      onclick="window._e1Filtro.status='${b.id}';_e1RenderFiltrosBtns();_e1RenderTabela()">
      ${lc(b.icon,11,'currentColor')} ${b.label}
    </button>`
  ).join('');
}

// Renderiza APENAS a tabela de insumos — sem tocar nos inputs de filtro
function _e1ToggleCat(cat) {
  if (!window._e1CatColapso) window._e1CatColapso = {};
  window._e1CatColapso[cat] = !window._e1CatColapso[cat];
  _e1RenderTabela();
}

function _e1RenderTabela() {
  const tbody = document.getElementById('e1TableBody');
  if (!tbody) return;

  if (!window._e1CatColapso) window._e1CatColapso = {};

  const l       = _listaAtual;
  const carrinho= l.itens;
  const f       = window._e1Filtro;
  const insumos = items.filter(i => !i.isProd);

  const stColors = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
  const stLabels = { crit:'CRÍTICO', warn:'BAIXO', ok:'OK' };
  const rowBg    = { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };

  let filt = insumos.filter(i => {
    if (f.cat && i.cat !== f.cat) return false;
    if (f.search && !i.name.toLowerCase().includes(f.search.toLowerCase())) return false;
    if (f.status === 'crit') return gst(i) === 'crit';
    if (f.status === 'warn') return gst(i) === 'warn';
    if (f.status === 'ok')   return gst(i) === 'ok';
    if (f.status === 'need') return gneed(i) > 0;
    return true;
  }).sort((a,b) => {
    const order = {crit:0,warn:1,ok:2};
    return (order[gst(a)]||2)-(order[gst(b)]||2) || a.name.localeCompare(b.name);
  });

  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px">
      <div style="font-size:var(--text-sm);color:var(--muted)">Nenhum item encontrado</div>
    </td></tr>`;
    return;
  }

  const byCat = {};
  filt.forEach(i => { if(!byCat[i.cat]) byCat[i.cat]=[]; byCat[i.cat].push(i); });

  const _CAT_ICONS = {
    'Laticínios':'milk','Carnes e Frios':'beef','Massas e Farinhas':'wheat',
    'Molhos e Temperos':'droplets','Queijos':'layers','Vegetais':'leaf',
    'Bebidas':'coffee','Embalagens':'box','Limpeza':'sparkles',
    'Descartáveis':'archive','Outros':'package',
  };

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => {
    const collapsed = !!window._e1CatColapso[cat];
    const catKey    = encodeURIComponent(cat);
    const catRow = `<tr style="cursor:pointer" onclick="_e1ToggleCat(decodeURIComponent('${catKey}'))">
      <td colspan="8" style="padding:6px 14px 4px;background:var(--surface2);border-top:2px solid var(--border)">
        <span style="font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--purple);display:inline-flex;align-items:center;gap:5px">
          ${lc(_CAT_ICONS[cat]||'package',10,'var(--purple)')} ${cat}
          ${lc(collapsed?'chevron-right':'chevron-down',9,'var(--muted)')}
          <span style="font-size:var(--text-2xs);color:var(--muted);font-weight:500;letter-spacing:0">${catItems.length}</span>
        </span>
      </td>
    </tr>`;

    const rows = catItems.map(i => {
      const s      = gst(i);
      const need   = gneed(i);
      const pct    = i.ideal > 0 ? Math.min(100, Math.round(i.qty/i.ideal*100)) : 0;
      const inCart = carrinho.find(ci => ci.itemId === i.id);
      const bg     = inCart ? 'var(--purple-xlight)' : (rowBg[s]||'var(--surface)');
      const suger  = need > 0 ? need : (i.min || 1);

      // Modo embalagem: converte sugestão e input para embalagens
      const modoEmb   = window._e1ModoEmb && i.unidCompra && i.qtdEmb > 0;
      const needEmbs  = modoEmb && need > 0 ? toEmb(i, need) : null;
      const inCartEmbs= modoEmb && inCart ? toEmb(i, inCart.qtdSelecionada) : null;
      const displayVal= inCart ? (modoEmb && inCartEmbs ? inCartEmbs : inCart.qtdSelecionada) : '';
      const displayUnit= modoEmb ? (i.unidCompra||i.unit) : i.unit;
      const displayStep= modoEmb ? 1 : 0.001;

      // Coluna "Adicionar"
      const addCol = inCart ? `
        <div style="display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="display:inline-flex;align-items:center;gap:4px;background:var(--purple);border-radius:var(--r8);padding:4px 8px">
            <button onclick="e1AjustarQtd(${i.id},-1)"
              style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:var(--text-md);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
            <input type="number" id="e1qty_${i.id}" value="${displayVal}" min="${displayStep}" step="${displayStep}"
              style="width:56px;border:none;background:transparent;font-size:var(--text-sm);font-weight:800;text-align:center;color:#fff;font-family:monospace"
              onchange="e1SetQtd(${i.id},this.value,${modoEmb})"
              onblur="e1SetQtd(${i.id},this.value,${modoEmb})">
            <span style="font-size:var(--text-2xs);color:rgba(255,255,255,.8);white-space:nowrap">${displayUnit}</span>
            <button onclick="e1AjustarQtd(${i.id},1)"
              style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:var(--text-md);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
            <button onclick="e1RemoverItem(${i.id})"
              style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${lc('x',10,'#fff')}
            </button>
          </div>
          ${modoEmb && inCartEmbs ? `<div style="font-size:var(--text-2xs);color:var(--purple);font-family:monospace">${fmt(inCart.qtdSelecionada)} ${i.unit}</div>` : ''}
        </div>
      ` : `
        <div style="display:inline-flex;align-items:center;gap:8px">
          ${need > 0 ? `<div style="text-align:right">
            <div style="font-size:var(--text-md);font-weight:800;color:var(--purple);font-family:monospace">
              ${modoEmb && needEmbs ? needEmbs : fmt(need)}
            </div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">
              ${modoEmb ? `${i.unidCompra}(s)` : i.unit+' sugerido'}
            </div>
            ${modoEmb && needEmbs ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">${fmt(need)} ${i.unit}</div>` : ''}
          </div>` : ''}
          <button onclick="e1AddItem(${i.id})"
            style="width:30px;height:30px;border-radius:50%;border:none;background:var(--purple);
            color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;
            justify-content:center;box-shadow:0 2px 8px rgba(107,33,212,.3);transition:transform .15s"
            onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">+</button>
        </div>
      `;

      return `<tr id="e1row_${i.id}" style="background:${bg};border-bottom:1px solid var(--border);${collapsed?'display:none':''}">
        <td style="padding:9px 14px">
          <div style="font-size:var(--text-sm);font-weight:600">${i.name}</div>
          ${i.code?`<div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">#${i.code}</div>`:''}
        </td>
        <td class="c" style="font-size:var(--text-sm);color:var(--muted)">${i.unit}</td>
        <td class="c" style="font-size:var(--text-sm);font-weight:600;font-family:monospace">${fmt(i.qty)}</td>
        <td class="c" style="font-size:var(--text-xs);color:var(--muted)">${fmt(i.min)}</td>
        <td class="c" style="font-size:var(--text-xs);color:var(--muted)">${fmt(i.ideal)}</td>
        <td style="padding:7px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${stColors[s]};border-radius:3px"></div>
            </div>
            <span style="font-size:var(--text-2xs);color:${stColors[s]};font-weight:700;min-width:28px">${pct}%</span>
          </div>
        </td>
        <td class="c">
          <span class="chip chip-${s==='crit'?'red':s==='warn'?'yellow':'green'}" style="font-size:var(--text-2xs)">
            ${stLabels[s]}
          </span>
        </td>
        <td style="padding:7px 14px;text-align:right">${addCol}</td>
      </tr>`;
    }).join('');

    return catRow + rows;
  }).join('');
}

// Renderiza APENAS o carrinho lateral — sem tocar na tabela
function _e1RenderCarrinho() {
  const wrap = document.getElementById('e1CarrinhoWrap');
  if (!wrap) return;

  const l        = _listaAtual;
  const carrinho = l.itens;
  const totalEst = carrinho.reduce((s,ci) => s + ci.qtdSelecionada*(ci.precoUnitEstimado||0), 0);

  wrap.innerHTML = `
    <div class="card" style="overflow:hidden">
      <div style="padding:12px 16px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight)">
        <div style="font-size:var(--text-sm);font-weight:800;color:var(--purple)">${lc('shopping-cart',14,'var(--purple)')} Carrinho</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${carrinho.length} item(s)</div>
      </div>

      <!-- Valor estimado — DESTAQUE (fix item 1) -->
      <div style="padding:10px 14px;border-bottom:1.5px solid var(--purple-light);background:var(--purple-xlight)">
        <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--purple);margin-bottom:2px">
          Estimativa de custo
        </div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(totalEst)}</div>
        ${totalEst === 0 && carrinho.length > 0 ? `<div style="font-size:var(--text-2xs);color:var(--muted)">Cadastre custos nos insumos para ver o estimado</div>` : ''}
      </div>

      <div style="padding:10px;max-height:320px;overflow-y:auto">
        ${carrinho.length === 0 ? `
          <div style="text-align:center;padding:20px 10px">
            ${lc('shopping-cart',28,'var(--border)')}
            <div style="font-size:var(--text-sm);color:var(--muted);margin-top:8px">Carrinho vazio</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">Use + para adicionar</div>
          </div>
        ` : carrinho.map(ci => {
          const item  = items.find(x => x.id === ci.itemId);
          const modoEmb = window._e1ModoEmb;
          const nome  = item?.name || ci.nome || '?';
          const unid  = item?.unit || ci.unidade || '';
          const custo = ci.qtdSelecionada * (ci.precoUnitEstimado||0);
          const embInfo = modoEmb && item ? fmtQtdEmb(item, ci.qtdSelecionada) : null;
          const conflitoBadgeCarrinho = _conflitoBadge(ci.itemId);
          return `<div style="display:flex;align-items:center;gap:7px;padding:6px 8px;
            background:var(--surface);border:1px solid ${conflitoBadgeCarrinho?'var(--yellow)':'var(--border)'};border-radius:var(--r6);margin-bottom:4px">
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-xs);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</div>
              ${conflitoBadgeCarrinho ? `<div style="margin-top:2px">${conflitoBadgeCarrinho}</div>` : ''}
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1px;gap:4px;flex-wrap:wrap">
                ${embInfo ? `
                  <span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple)">${embInfo.embs} ${item.unidCompra}</span>
                  <span style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">${fmt(ci.qtdSelecionada)} ${unid}</span>
                ` : `
                  <span style="font-size:var(--text-2xs);color:var(--purple);font-family:monospace;font-weight:700">${fmt(ci.qtdSelecionada)} ${unid}</span>
                `}
                ${custo > 0 ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">R$${fmt(custo)}</span>` : ''}
              </div>
            </div>
            <button onclick="e1RemoverItem(${ci.itemId || ci.id})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;padding:2px;flex-shrink:0">
              ${lc('x',12,'var(--muted)')}
            </button>
          </div>`;
        }).join('')}
      </div>

      ${carrinho.length > 0 ? `
        <div style="padding:10px;border-top:1.5px solid var(--border)">
          <button onclick="e1IrParaCotacao()"
            style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);
            font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
            ${lc('check-circle',14,'#fff')} Aprovar lista
          </button>
          <button onclick="e1LimparCarrinho()"
            style="width:100%;margin-top:6px;padding:7px;background:none;color:var(--muted);
            border:1px solid var(--border);border-radius:var(--r8);font-size:var(--text-xs);cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:5px">
            ${lc('trash',11,'var(--muted)')} Limpar carrinho
          </button>
        </div>
      ` : ''}
    </div>`;
}

// ── Ações do carrinho — atualizações cirúrgicas sem re-render completo ──
function e1AddItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  if (item.isProd) { toast('Preparados são produção interna — não entram na lista de compras.', 'warn'); return; }
  if (_listaAtual.itens.find(ci => ci.itemId === itemId)) return;
  const need = gneed(item);
  const qty  = need > 0 ? parseFloat(need.toFixed(3)) : parseFloat((item.min||1).toFixed(3));
  const newId = Math.max(0, ..._listaAtual.itens.map(x => x.id||0)) + 1;
  _listaAtual.itens.push({
    id: newId, itemId: item.id, nome: item.name,
    categoria: item.cat, unidade: item.unit,
    qtdSugerida: qty, qtdSelecionada: qty,
    qtdAprovada: null, qtdComprada: null, qtdRecebida: null,
    estoqueAtual: item.qty, estoqueMinimo: item.min, estoqueIdeal: item.ideal,
    origem: 'estoque', tipoCompra: 'fornecedor',
    fornecedorId: null, localCompra: '', responsavelCompra: '',
    precoUnitEstimado: item.cost||0, precoUnitFinal: null,
    cotacoes: [], aprovado: null, comentarioAprovador: '',
    conferido: false, divergencia: false, comentarioConferencia: '',
    conferidoPorItem: '', dataRecebimentoItem: '', horaRecebimentoItem: '',
    anexos: [],
  });
  _recalcEstimativa();
  saveListas();
  // Atualiza só a linha e o carrinho — sem re-render completo
  _e1AtualizarLinha(itemId);
  _e1RenderCarrinho();
}

function e1AjustarQtd(itemId, delta) {
  const ci   = _listaAtual.itens.find(x => x.itemId === itemId);
  const item = items.find(i => i.id === itemId);
  if (!ci || !item) return;

  const modoEmb = window._e1ModoEmb && item.unidCompra && item.qtdEmb > 0;
  let nova;

  if (modoEmb) {
    // Incrementa/decrementa 1 embalagem de cada vez
    const embAtual = Math.round(ci.qtdSelecionada / item.qtdEmb);
    const novaEmb  = Math.max(1, embAtual + delta);
    nova = parseFloat((novaEmb * item.qtdEmb).toFixed(3));
  } else {
    const step = Math.max(0.1, Math.round((item.min||1) * 0.1 * 10) / 10);
    nova = Math.max(0.001, parseFloat((ci.qtdSelecionada + delta * step).toFixed(3)));
  }

  ci.qtdSelecionada = nova;
  _recalcEstimativa();
  saveListas();

  // Atualiza só o input de quantidade
  const inp = document.getElementById(`e1qty_${itemId}`);
  if (inp) {
    inp.value = modoEmb ? toEmb(item, nova) : nova;
  }
  _e1RenderCarrinho();
}

function e1SetQtd(itemId, val, modoEmb) {
  const ci   = _listaAtual.itens.find(x => x.itemId === itemId);
  if (!ci) return;
  const item = items.find(i => i.id === itemId);
  let v = parseFloat(val);
  if (isNaN(v) || v <= 0) return;
  // Se estiver em modo embalagem, converte para unidade base
  if (modoEmb && item?.qtdEmb > 0) {
    v = parseFloat((v * item.qtdEmb).toFixed(3));
  }
  ci.qtdSelecionada = parseFloat(v.toFixed(3));
  _recalcEstimativa();
  saveListas();
  _e1RenderCarrinho();
}

function e1RemoverItem(itemId) {
  // Suporta itemId (do estoque) e id direto (item avulso)
  const before = _listaAtual.itens.length;
  _listaAtual.itens = _listaAtual.itens.filter(x => x.itemId !== itemId && x.id !== itemId);
  if (_listaAtual.itens.length === before) return;
  _recalcEstimativa();
  saveListas();
  // Atualiza linha e carrinho
  _e1AtualizarLinha(itemId);
  _e1RenderCarrinho();
}

function e1LimparCarrinho() {
  vtpConfirm({
    title: 'Limpar carrinho',
    message: 'Todos os itens selecionados serão removidos.',
    confirmLabel: 'Limpar',
    onConfirm: () => {
      _listaAtual.itens = [];
      _recalcEstimativa();
      saveListas();
      _e1RenderTabela();
      _e1RenderCarrinho();
    }
  });
}

// Atualiza visual de uma linha específica sem re-renderizar a tabela inteira
function _e1AtualizarLinha(itemId) {
  const item    = items.find(i => i.id === itemId);
  if (!item) { _e1RenderTabela(); return; } // item manual — re-render completo
  const inCart  = _listaAtual.itens.find(ci => ci.itemId === itemId);
  const row     = document.getElementById(`e1row_${itemId}`);
  if (!row) { _e1RenderTabela(); return; }

  const s    = gst(item);
  const need = gneed(item);
  const rowBg= { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };
  row.style.background = inCart ? 'var(--purple-xlight)' : (rowBg[s]||'var(--surface)');

  // Re-renderiza só a célula da coluna "Adicionar" (última td)
  const lastTd = row.querySelector('td:last-child');
  if (!lastTd) return;

  if (inCart) {
    lastTd.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:4px;background:var(--purple);border-radius:var(--r8);padding:4px 8px">
        <button onclick="e1AjustarQtd(${item.id},-1)"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:var(--text-md);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
        <input type="number" id="e1qty_${item.id}" value="${inCart.qtdSelecionada}" min="0.001" step="0.001"
          style="width:56px;border:none;background:transparent;font-size:var(--text-sm);font-weight:800;text-align:center;color:#fff;font-family:monospace"
          onchange="e1SetQtd(${item.id},this.value)"
          onblur="e1SetQtd(${item.id},this.value)">
        <span style="font-size:var(--text-2xs);color:rgba(255,255,255,.8);white-space:nowrap">${item.unit}</span>
        <button onclick="e1AjustarQtd(${item.id},1)"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);color:#fff;font-size:var(--text-md);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
        <button onclick="e1RemoverItem(${item.id})"
          style="width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc('x',10,'#fff')}
        </button>
      </div>`;
  } else {
    lastTd.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:8px">
        ${need > 0 ? `<div style="text-align:right">
          <div style="font-size:var(--text-md);font-weight:800;color:var(--purple);font-family:monospace">${fmt(need)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${item.unit} sugerido</div>
        </div>` : ''}
        <button onclick="e1AddItem(${item.id})"
          style="width:30px;height:30px;border-radius:50%;border:none;background:var(--purple);
          color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;
          justify-content:center;box-shadow:0 2px 8px rgba(107,33,212,.3);transition:transform .15s"
          onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">+</button>
      </div>`;
  }
}

function e1IrParaCotacao() {
  if (!_listaAtual) { toast('Nenhuma lista ativa', 'err'); return; }
  if (_listaAtual.itens.length === 0) { toast('Carrinho vazio', 'err'); return; }
  if (_listaAtual.etapa > 1) { _renderEtapa(_listaAtual.etapa); return; }
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const temPermissao = u && ['gerente', 'supervisor'].includes(u.role);

  const _avancarParaAprovPre = (aprovador) => {
    _listaAtual.itens.forEach(i => {
      // Define presencial ANTES de configurar cotações — itens presenciais não precisam de cotação digital
      if (i.origem === 'manual' && i.localCompra) i.tipoCompra = 'presencial';
      if (i.tipoCompra === 'presencial') return;

      if (!i.cotacoes) i.cotacoes = [];
      const itemCad = items.find(x => x.id === i.itemId);
      if (itemCad) {
        if (itemCad.supIdExclusivo) {
          // Fornecedor exclusivo: pula cotação, vai direto com ele
          i.fornecedorExclusivo = true;
          i.fornecedorId = itemCad.supIdExclusivo;
          i.tipoCompra = 'fornecedor';
          if (!i.cotacoes.some(c => c.supId === itemCad.supIdExclusivo)) {
            i.cotacoes = [{ supId: itemCad.supIdExclusivo, precoUnit: i.precoUnitEstimado || null, valorFinal: null, respondido: false, emFalta: false, diasPedido: null, dataEntrega: null, formaPagamento: '', boletoDias: null, parceladoVezes: null, parceladoFreq: '', obs: '' }];
          }
        } else {
          i.fornecedorExclusivo = false;
          const supIds = itemCad.supIds?.length ? [...itemCad.supIds] : (itemCad.supId ? [itemCad.supId] : []);
          supIds.forEach(supId => {
            if (supId && !i.cotacoes.some(c => c.supId === supId)) {
              i.cotacoes.push({ supId, precoUnit:null, valorFinal:null, respondido:false, emFalta:false, diasPedido:null, dataEntrega:null, formaPagamento:'', boletoDias:null, parceladoVezes:null, parceladoFreq:'', obs:'' });
            }
          });
        }
      }
    });
    _listaAtual.etapa  = 2;
    _listaAtual.status = 'aguard_aprov_pre';
    _listaAtual.dataPreAprovacao = new Date().toISOString();
    if (aprovador) {
      _listaAtual.aprovadorPreId   = aprovador.id;
      _listaAtual.aprovadorPreNome = aprovador.name;
      _listaAtual.aprovadorPreRole = aprovador.role;
    }
    saveListas();
    _renderDashCompras();
    _renderEtapaAprovPre();
  };

  if (temPermissao) {
    // Usuário já tem permissão — avança direto, sem picker, sem aguardar
    _avancarParaAprovPre(u);
    toast(`Pré-aprovação disponível · aprove os itens e libere para cotação`);
  } else {
    _comprasPickAprovador(
      'Selecionar aprovador — Pré-aprovação',
      'Defina quem será responsável por pré-aprovar esta lista antes de ir para cotação.',
      (aprovador) => {
        _avancarParaAprovPre(aprovador);
        if (typeof criarAlerta === 'function') criarAlerta({
          tipo: 'compras_pre_aprovacao',
          titulo: 'Pré-aprovação necessária',
          mensagem: `Lista ${_listaAtual.codigo} aguarda pré-aprovação antes da cotação.`,
          modulo: 'compras',
          destino_roles: ['gerente', 'supervisor'],
          referencia_id: String(_listaAtual.id),
          acao_label: 'Ver lista',
          acao_modulo: 'compras',
        });
        toast('Lista enviada para pré-aprovação!');
      }
    );
  }
}

// Item 4 — Imprimir lista do carrinho
function imprimirCarrinho() {
  const l        = _listaAtual;
  const carrinho = l.itens;
  const cfg      = getConfig();
  const u        = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const empresa  = cfg.empresa || 'Vai Ter Pizza!';
  const totalEst = carrinho.reduce((s,ci) => s+ci.qtdSelecionada*(ci.precoUnitEstimado||0),0);

  if (!carrinho.length) { toast('Carrinho vazio', 'err'); return; }

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Lista de Compras ${l.codigo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',Arial,sans-serif;font-size:11px;background:#fff;color:#1a1a2e;padding:24px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #6B21D4;margin-bottom:16px}
    .empresa{font-size:17px;font-weight:800;color:#6B21D4}
    .sub{font-size:10px;color:#888;margin-top:2px}
    .meta{text-align:right;font-size:10px;color:#555;line-height:1.9}
    .meta strong{color:#1a1a2e}
    .kpis{display:flex;gap:10px;margin-bottom:16px}
    .kpi{flex:1;background:#f5f0ff;border:1px solid #d8b4fe;border-radius:6px;padding:8px 12px;text-align:center}
    .kpi-v{font-size:14px;font-weight:800;color:#6B21D4}
    .kpi-l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-top:1px}
    .cat{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6B21D4;background:#f5f0ff;padding:5px 10px;border-radius:4px;margin:14px 0 5px}
    table{width:100%;border-collapse:collapse}
    thead th{background:#6B21D4;color:#fff;padding:6px 9px;font-size:9.5px;font-weight:700;text-transform:uppercase}
    thead th.r{text-align:right} thead th.c{text-align:center}
    td{padding:6px 9px;font-size:10.5px;border-bottom:1px solid #f0f0f0}
    tr:nth-child(even) td{background:#fafafa}
    .nm{font-weight:600} .ct{font-size:9px;color:#bbb}
    .r{text-align:right} .c{text-align:center}
    .chk{width:13px;height:13px;border:1.5px solid #6B21D4;border-radius:3px;display:inline-block}
    .tot td{background:#f5f0ff!important;font-weight:700;color:#6B21D4;border-top:2px solid #6B21D4;padding:7px 9px}
    .footer{margin-top:20px;padding-top:12px;border-top:1px dashed #ccc;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}
    .ass{display:flex;flex-direction:column;align-items:center;gap:3px}
    .ass-linha{border-bottom:1px solid #aaa;width:180px}
    .ass-lbl{font-size:9px;color:#888}
    @media print{body{padding:8px}}
  </style></head><body>`);

  win.document.write(`<div class="hdr">
    <div><div class="empresa">${empresa}</div><div class="sub">Lista de Compras — Carrinho</div></div>
    <div class="meta">
      <div><strong>Lista:</strong> ${l.codigo}</div>
      <div><strong>Data:</strong> ${fmtD(new Date().toISOString())}</div>
      <div><strong>Responsável:</strong> ${u?.name||'___________'}</div>
    </div>
  </div>`);

  win.document.write(`<div class="kpis">
    <div class="kpi"><div class="kpi-v">${carrinho.length}</div><div class="kpi-l">Itens</div></div>
    <div class="kpi"><div class="kpi-v">R$ ${fmt(totalEst)}</div><div class="kpi-l">Estimado</div></div>
  </div>`);

  // Agrupa por categoria
  const porCat = {};
  carrinho.forEach(ci => {
    const cat = ci.categoria || 'Geral';
    if (!porCat[cat]) porCat[cat] = [];
    porCat[cat].push(ci);
  });

  Object.entries(porCat).forEach(([cat, citens]) => {
    const subTot = citens.reduce((s,ci)=>s+ci.qtdSelecionada*(ci.precoUnitEstimado||0),0);
    win.document.write(`<div class="cat">${cat}</div>`);
    win.document.write(`<table><thead><tr>
      <th class="c" style="width:20px"></th>
      <th>Item</th>
      <th class="c" style="width:55px">Qtd</th>
      <th class="c" style="width:32px">Un.</th>
      <th class="r" style="width:80px">Est. unit.</th>
      <th class="r" style="width:80px">Total est.</th>
    </tr></thead><tbody>`);
    citens.forEach(ci => {
      const total = ci.qtdSelecionada*(ci.precoUnitEstimado||0);
      win.document.write(`<tr>
        <td class="c"><span class="chk"></span></td>
        <td><div class="nm">${ci.nome}</div></td>
        <td class="c" style="font-family:monospace;font-weight:600">${fmt(ci.qtdSelecionada)}</td>
        <td class="c" style="color:#aaa">${ci.unidade}</td>
        <td class="r">${ci.precoUnitEstimado>0?'R$ '+fmt(ci.precoUnitEstimado):'—'}</td>
        <td class="r" style="font-weight:600">${total>0?'R$ '+fmt(total):'—'}</td>
      </tr>`);
    });
    win.document.write(`<tr class="tot"><td colspan="4">Subtotal ${cat}</td>
      <td></td><td class="r">R$ ${fmt(subTot)}</td></tr>`);
    win.document.write('</tbody></table>');
  });

  win.document.write(`<div class="footer">
    <div class="ass"><div class="ass-linha"></div><div class="ass-lbl">${u?.name||'Responsável'}</div></div>
    <div style="font-size:10px;color:#999">Total estimado: <strong style="color:#6B21D4">R$ ${fmt(totalEst)}</strong></div>
    <div class="ass"><div class="ass-linha"></div><div class="ass-lbl">Aprovação</div></div>
  </div>`);

  win.document.write('<script>window.onload=()=>window.print();<\/script></body></html>');
  win.document.close();
}



function _rowsItem(i) {
  const cotacoes = i.cotacoes || [];
  const melhor   = _melhorCotacao(cotacoes);

  // Cobertura de marcas padrão
  const itemCad  = items.find(x => x.id === i.itemId);
  const brands   = (itemCad?.brands || []).filter(Boolean);
  const marcasCotadas = new Set(cotacoes.filter(c => !c.emFalta && c.respondido && c.marca).map(c => c.marca));
  const coberturaBadge = brands.length ? (() => {
    const cobertas  = brands.filter(m => marcasCotadas.has(m));
    const faltam    = brands.filter(m => !marcasCotadas.has(m));
    const tudo      = faltam.length === 0;
    return `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">
      ${brands.map(m => {
        const coberta = marcasCotadas.has(m);
        const isPrincipal = m === brands[0];
        return `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:8px;
          border:1px solid ${coberta ? 'var(--green)' : isPrincipal ? 'var(--red)' : 'var(--yellow)'};
          background:${coberta ? 'var(--green-light)' : isPrincipal ? 'var(--red-light)' : 'var(--yellow-light)'};
          color:${coberta ? 'var(--green)' : isPrincipal ? 'var(--red)' : 'var(--orange-dark)'};
          display:inline-flex;align-items:center;gap:2px">
          ${lc(coberta ? 'check' : 'clock', 8, 'currentColor')} ${m}
        </span>`;
      }).join('')}
    </div>`;
  })() : '';

  const _cbCot = _conflitoBadge(i.itemId);
  const exclusivoBadge = i.fornecedorExclusivo ? (() => {
    const sup = suppliers.find(s => s.id === (i.cotacoes?.[0]?.supId));
    return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:99px;
      font-size:var(--text-2xs);font-weight:700;background:var(--orange-light);color:var(--orange-dark);
      border:1px solid var(--orange-dark)">
      ${lc('star',8,'currentColor')} Exclusivo${sup?' · '+sup.name:''}
    </span>`;
  })() : '';

  const mainRow = `<tr id="item1-${i.id}" style="background:var(--surface);border-bottom:${cotacoes.length?'none':'1px solid var(--border)'}">
    <td style="padding:10px 14px">
      <div style="font-size:var(--text-sm);font-weight:700">${i.nome} ${exclusivoBadge}</div>
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">
        ${lc(i.origem==='manual'?'edit-2':'package',11,'var(--muted)')} ${i.categoria}${i.origem==='manual'?' · Manual':''}
      </div>
      ${coberturaBadge}
      ${_cbCot ? `<div style="margin-top:4px">${_cbCot}</div>` : ''}
    </td>
    <td class="c">
      ${(()=>{
        const e = _qEmb(i, i.qtdSelecionada);
        if (e) return `
          <input type="number" value="${e.embs}" min="1" step="1"
            style="width:64px;padding:4px 6px;border:1.5px solid var(--purple);border-radius:var(--r6);
            font-size:var(--text-sm);font-weight:800;text-align:center;font-family:monospace;color:var(--purple)"
            onchange="setItemQtd1(${i.id},this.value,true)">
          <div style="font-size:var(--text-2xs);font-weight:700;color:var(--purple);font-family:monospace;margin-top:1px">${e.uc}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">${fmt(i.qtdSelecionada)} ${i.unidade}</div>`;
        return `
          <input type="number" value="${i.qtdSelecionada}" min="0.001" step="0.001"
            style="width:74px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);text-align:center;font-family:monospace"
            onchange="setItemQtd1(${i.id},this.value,false)">`;
      })()}
    </td>
    <td class="c">
      ${(()=>{
        const e = _qEmb(i, i.qtdSelecionada);
        if (e) return `
          <div style="font-size:var(--text-sm);font-weight:800;font-family:monospace;color:var(--text)">${fmt(i.qtdSelecionada)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${i.unidade}</div>`;
        return `<span style="font-size:var(--text-sm);color:var(--muted)">${i.unidade}</span>`;
      })()}
    </td>
    <td class="r" style="padding-right:14px">
      <div style="font-size:var(--text-sm);font-family:monospace;font-weight:600">R$ ${fmt(i.qtdSelecionada*(i.precoUnitEstimado||0))}</div>
      <div style="font-size:var(--text-2xs);color:var(--muted)">R$${fmt(i.precoUnitEstimado||0)}/${i.unidade}</div>
    </td>
    <td style="padding:8px 12px">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        ${cotacoes.length===0?`<span style="font-size:var(--text-xs);color:var(--muted);font-style:italic">Sem fornecedor — compra presencial</span>`:''}
        <button onclick="abrirAddFornecedor(${i.id})"
          style="display:flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;
          border:1.5px dashed var(--purple);background:transparent;color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer">
          ${lc('plus',12,'var(--purple)')} Fornecedor
        </button>
      </div>
    </td>
    <td class="c">
      <div style="display:flex;gap:2px;align-items:center;justify-content:center">
        ${i.origem==='manual'?`
          <button onclick="abrirEditarItemManual(${i.id})" style="background:none;border:none;color:var(--purple);cursor:pointer;padding:4px" title="Editar item">
            ${lc('edit-2',12,'currentColor')}
          </button>
        `:''}
        <button onclick="removerItem1(${i.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px" title="Remover">
          ${lc('trash-2',13,'currentColor')}
        </button>
      </div>
    </td>
  </tr>`;

  const subRows = cotacoes.map((cot, idx) => {
    const sup    = suppliers.find(s => s.id === cot.supId);
    const isBest = melhor?.supId === cot.supId && !cot.emFalta;
    const total  = cot.valorFinal ?? (cot.precoUnit ? i.qtdSelecionada * cot.precoUnit : null);
    const bgRow  = cot.emFalta ? 'var(--red-light)' : isBest && cot.respondido ? 'var(--green-light)' : 'var(--surface2)';
    const pgLabel = _labelPagamento(cot);

    return `<tr style="background:${bgRow};border-bottom:1px solid var(--border)">
      <td style="padding:7px 14px 7px 28px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${cot.emFalta?'var(--red)':cot.respondido?'var(--green)':'var(--muted)'}"></div>
          <span style="font-size:var(--text-sm);font-weight:700;color:${cot.emFalta?'var(--red)':isBest&&cot.respondido?'var(--green)':'var(--text2)'}">${sup?.name||'—'}</span>
          ${cot.emFalta ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red);background:#fee2e2;padding:1px 7px;border-radius:10px;border:1px solid var(--red)">Em falta</span>` : ''}
          ${isBest && cot.respondido ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--green);background:var(--green-light);padding:1px 7px;border-radius:10px;border:1px solid var(--green)">Melhor</span>` : ''}
          ${cot.modalidade === 'presencial' ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--orange-dark);background:var(--orange-light);padding:1px 7px;border-radius:10px;border:1px solid var(--orange-dark)">${lc('shopping-cart',8,'currentColor')} Presencial</span>` : ''}
          ${!cot.emFalta && !cot.respondido ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-style:italic">Aguardando</span>` : ''}
          ${cot.marca ? `<span style="font-size:var(--text-2xs);font-weight:600;color:var(--purple);background:var(--purple-xlight);padding:1px 7px;border-radius:10px;border:1px solid var(--purple-light)">${lc('tag',8,'currentColor')} ${cot.marca}</span>` : ''}
        </div>
        ${cot.dataEntrega ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px;margin-left:13px">${lc('truck',10,'var(--muted)')} Entrega: <strong>${fmtD(cot.dataEntrega)}</strong></div>` : ''}
        ${cot.diasPedido  ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;margin-left:13px">${lc('clock',10,'var(--muted)')} Pedido até: ${fmtD(cot.diasPedido)}</div>` : ''}
      </td>
      <td class="r" style="padding:6px 10px">
        ${cot.respondido && !cot.emFalta && cot.precoUnit > 0 && i.precoUnitEstimado > 0 ? (() => {
          const diff = ((cot.precoUnit - i.precoUnitEstimado) / i.precoUnitEstimado) * 100;
          const absDiff = Math.abs(diff).toFixed(1);
          const isCheaper = diff < -0.5;
          const isDearer  = diff >  0.5;
          const color = isCheaper ? 'var(--green)' : isDearer ? 'var(--red)' : 'var(--muted)';
          const icon  = isCheaper ? '↓' : isDearer ? '↑' : '=';
          return `<div style="font-size:var(--text-sm);font-weight:800;color:${color};font-family:monospace;white-space:nowrap">
            R$ ${fmt(cot.precoUnit)}
          </div>
          <div style="font-size:var(--text-2xs);font-weight:700;color:${color};white-space:nowrap">
            ${icon} ${absDiff}% vs est.
          </div>`;
        })() : cot.respondido && !cot.emFalta ? `<div style="font-size:var(--text-sm);font-weight:700;font-family:monospace">R$ ${fmt(cot.precoUnit)}</div>` : ''}
      </td>
      <td class="c" style="padding:6px 8px">
        ${cot.emFalta ? `
          <button onclick="desmarcarEmFalta(${i.id},${idx})"
            style="padding:3px 9px;border-radius:var(--r6);border:1.5px solid var(--red);background:white;color:var(--red);font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px">
            ${lc('rotate-ccw',10,'currentColor')} Desfazer
          </button>
        ` : `
          <button onclick="abrirEditarCotacao(${i.id},${idx})"
            style="padding:4px 11px;border-radius:var(--r6);border:1.5px solid ${cot.respondido?'var(--green)':'var(--purple)'};
            background:${cot.respondido?'var(--green-light)':'var(--purple-xlight)'};
            color:${cot.respondido?'var(--green)':'var(--purple)'};
            font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;white-space:nowrap">
            ${lc(cot.respondido?'edit-2':'clipboard-list',11,'currentColor')}
            ${cot.respondido ? 'Editar' : 'Preencher'}
          </button>
        `}
      </td>
      <td class="r" style="padding:6px 14px 6px 8px">
        ${cot.emFalta ? `
          <span style="font-size:var(--text-xs);color:var(--red);font-style:italic">Indisponível</span>
        ` : cot.precoUnit ? `
          <div style="font-size:var(--text-md);font-weight:800;color:${isBest?'var(--green)':'var(--text)'};font-family:monospace">R$ ${fmt(total||0)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">R$${fmt(cot.precoUnit)}/${i.unidade}</div>
        ` : `<span style="font-size:var(--text-xs);color:var(--muted)">—</span>`}
      </td>
      <td style="padding:6px 8px">
        ${pgLabel ? `
          <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;
            font-size:var(--text-2xs);font-weight:600;background:var(--purple-xlight);color:var(--purple);white-space:nowrap">
            ${lc('credit-card',9,'currentColor')} ${pgLabel}
          </span>
        ` : cot.respondido ? '' : `<span style="font-size:var(--text-xs);color:var(--muted)">—</span>`}
        ${!cot.emFalta && sup?.phone ? `
          <a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(_montaMsgCotacaoForn(sup,i))}" target="_blank"
            title="Enviar via WhatsApp"
            style="display:inline-flex;align-items:center;gap:3px;margin-top:4px;padding:2px 7px;border-radius:10px;
            background:#dcfce7;color:#16a34a;font-size:var(--text-2xs);font-weight:600;text-decoration:none;border:1px solid #86efac">
            ${lc('message-circle',9,'currentColor')} WA
          </a>
        ` : ''}
      </td>
      <td class="c" style="padding:4px">
        <div style="display:flex;flex-direction:column;gap:2px;align-items:center">
          ${!cot.emFalta ? `
            <button onclick="marcarEmFalta(${i.id},${idx})" title="Marcar como em falta"
              style="width:22px;height:22px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center"
              title="Em falta">
              ${lc('alert-circle',11,'currentColor')}
            </button>
          ` : ''}
          <button onclick="removerCotacao(${i.id},${idx})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:2px" title="Remover">
            ${lc('x',12,'currentColor')}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return mainRow + subRows;
}

function _melhorCotacao(cotacoes) {
  const resp = cotacoes.filter(c => c.respondido && c.precoUnit > 0 && !c.emFalta);
  if (!resp.length) return null;
  return resp.reduce((b,c) => c.precoUnit < b.precoUnit ? c : b);
}

function _labelPagamento(cot) {
  if (!cot.formaPagamento) return '';
  if (cot.formaPagamento === 'pix')       return 'PIX / À vista';
  if (cot.formaPagamento === 'cartao')    return 'Cartão';
  if (cot.formaPagamento === 'boleto')    return cot.boletoDias ? `Boleto ${cot.boletoDias}d` : 'Boleto';
  if (cot.formaPagamento === 'parcelado') {
    const freq = cot.parceladoFreq === 'semanal' ? 'sem.' : 'men.';
    return cot.parceladoVezes ? `${cot.parceladoVezes}x ${freq}` : 'Parcelado';
  }
  return cot.formaPagamento;
}

function abrirEditarCotacao(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  const cot = i.cotacoes[idx];
  const sup = suppliers.find(s => s.id === cot.supId);
  const qtd = i.qtdSelecionada;

  // Memória: pré-preenche com últimas condições do fornecedor se cotação ainda não foi preenchida
  const mem = sup?.ultimasCond || {};
  if (!cot.respondido) {
    if (!cot.formaPagamento && mem.formaPagamento) cot.formaPagamento = mem.formaPagamento;
    // Se não há memória, usa a primeira forma de pagamento cadastrada no fornecedor
    if (!cot.formaPagamento && Array.isArray(sup?.formasPagamento) && sup.formasPagamento.length) {
      const mapPgto = { pix:'pix', especie:'pix', boleto:'boleto', cartao:'cartao', cheque:'boleto', crediario:'parcelado' };
      cot.formaPagamento = mapPgto[sup.formasPagamento[0]] || '';
    }
    if (!cot.boletoDias    && mem.boletoDias)    cot.boletoDias    = mem.boletoDias;
    // Pré-preenche prazo de pagamento do cadastro do fornecedor
    if (!cot.boletoDias && sup?.prazoPagamento > 0) cot.boletoDias = sup.prazoPagamento;
    if (!cot.parceladoVezes&& mem.parceladoVezes) cot.parceladoVezes = mem.parceladoVezes;
    if (!cot.parceladoFreq && mem.parceladoFreq)  cot.parceladoFreq  = mem.parceladoFreq;
    if (!cot.dataEntrega   && mem.prazoEntregaDias) {
      const d = _addDiasUteis(new Date(), mem.prazoEntregaDias);
      cot.dataEntrega = d.toISOString().slice(0,10);
    }
  }

  const formaEntrega = sup?.formaEntrega || 'entrega';
  const isPresencialFixo = formaEntrega === 'presencial';
  const permitePresencial = formaEntrega === 'ambos';
  const jaPresencial = i.tipoCompra === 'presencial' || cot.modalidade === 'presencial';

  document.getElementById('popupCotacao')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupCotacao';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);padding:0;width:100%;max-width:480px;box-shadow:0 16px 60px rgba(0,0,0,.25);overflow:hidden">

      <div style="padding:18px 20px 14px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--text-md);font-weight:800">
            ${isPresencialFixo
              ? `${lc('shopping-cart',15,'var(--orange-dark)')} <span style="color:var(--orange-dark)">Compra Presencial — ${sup?.name||'Fornecedor'}</span>`
              : `${lc('clipboard-list',15,'var(--purple)')} Cotação — ${sup?.name||'Fornecedor'}`}
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${i.nome} · ${(()=>{ const e=_qEmb(i,qtd); return e ? `<strong style="color:var(--purple)">${e.embs} ${e.uc}</strong> <span style="color:var(--muted)">(${fmt(qtd)} ${i.unidade})</span>` : `${fmt(qtd)} ${i.unidade}`; })()}
            ${mem.formaPagamento ? `<span style="margin-left:6px;padding:1px 6px;border-radius:8px;background:var(--purple-xlight);color:var(--purple);font-size:var(--text-2xs);font-weight:600">${lc('history',9,'currentColor')} Condições memorizadas</span>` : ''}
          </div>
        </div>
        <button onclick="document.getElementById('popupCotacao').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x',16,'var(--muted)')}</button>
      </div>

      ${permitePresencial || isPresencialFixo ? `
      <div style="padding:12px 20px 0;display:flex;align-items:center;gap:10px;background:var(--orange-light);border-bottom:1.5px solid var(--border)">
        ${isPresencialFixo
          ? `<div style="display:flex;align-items:center;gap:7px;font-size:var(--text-sm);font-weight:700;color:var(--orange-dark);padding-bottom:12px">
              ${lc('shopping-cart',14,'currentColor')} Fornecedor somente presencial — compra será marcada como presencial
             </div>`
          : `<div style="display:flex;align-items:center;gap:12px;padding-bottom:12px">
              <span style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark)">${lc('shopping-cart',13,'currentColor')} Modalidade de compra:</span>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;cursor:pointer">
                <input type="radio" name="cqModalidade" value="entrega" ${!jaPresencial?'checked':''} style="accent-color:var(--purple)"> Entrega
              </label>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;cursor:pointer">
                <input type="radio" name="cqModalidade" value="presencial" ${jaPresencial?'checked':''} style="accent-color:var(--orange-dark)"> Presencial
              </label>
             </div>`}
      </div>` : ''}

      <!-- Condições comerciais cadastradas para este fornecedor -->
      ${(() => {
        if (!sup) return '';
        const pgtos = Array.isArray(sup.formasPagamento) && sup.formasPagamento.length ? sup.formasPagamento : [];
        const prazo = sup.prazoPagamento != null && sup.prazoPagamento !== '' ? parseInt(sup.prazoPagamento) : null;
        const taxa  = sup.taxaEntrega || {};
        if (!pgtos.length && prazo === null && !taxa.tipo) return '';

        const pgtoLabels = { pix:'PIX', especie:'Espécie', boleto:'Boleto', cartao:'Cartão', cheque:'Cheque', crediario:'Crediário' };

        return `
        <div style="padding:10px 20px;background:var(--purple-xlight);border-bottom:1.5px solid var(--purple-light,#C4B5FD);display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--purple);margin-bottom:5px">
              ${lc('info',10,'currentColor')} Condições cadastradas deste fornecedor
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${pgtos.map(p => `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:#fff;color:var(--purple);border:1.5px solid var(--purple-light)">${pgtoLabels[p]||p}</span>`).join('')}
              ${prazo === 0 ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:#fff;color:var(--purple);border:1.5px solid var(--purple-light)">À vista</span>`
                : prazo > 0 ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:#fff;color:var(--purple);border:1.5px solid var(--purple-light)">${prazo} dias p/ pagar</span>` : ''}
              ${taxa.tipo === 'fixo' && taxa.valor > 0 ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:#FEF3C7;color:#D97706;border:1.5px solid #FCD34D">Frete R$ ${fmt(taxa.valor)}</span>`
                : taxa.tipo === 'variavel' ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:#FEF3C7;color:#D97706;border:1.5px solid #FCD34D">Frete variável${taxa.obs?' · '+taxa.obs:''}</span>`
                : `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:20px;background:var(--green-light);color:var(--green);border:1.5px solid var(--green)">Frete grátis</span>`}
            </div>
          </div>
        </div>`;
      })()}

      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">

        <!-- Marca — controlada pelo cadastro do insumo -->
        ${(() => {
          const itemCad  = items.find(x => x.id === i.itemId);
          const brands   = (itemCad?.brands || []).filter(Boolean);
          const marcaAtual = cot.marca || '';

          if (!brands.length) {
            return `<div style="padding:10px 14px;background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);display:flex;gap:8px;align-items:flex-start">
              ${lc('alert-triangle',14,'var(--orange-dark)')}
              <div>
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark)">Insumo sem marcas padrão</div>
                <div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:2px">Cadastre as marcas aprovadas em <strong>Cadastros → Insumos</strong> para controlar a padronização das compras.</div>
              </div>
            </div>`;
          }

          // Principal = brands[0], secundárias = brands[1...]
          const principal = brands[0];
          const defaultVal = marcaAtual || principal;
          return `<div style="padding:12px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10)">
            <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">
              ${lc('tag',10,'var(--purple)')} Marca — selecione uma das marcas padrão
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${brands.map((m, idx) => {
                const isPrincipal = idx === 0;
                const isSelected  = defaultVal === m;
                return `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:var(--r8);cursor:pointer;
                  border:1.5px solid ${isSelected ? 'var(--purple)' : 'var(--border)'};
                  background:${isSelected ? 'var(--purple-xlight)' : 'var(--surface)'};transition:all .15s"
                  onclick="document.querySelectorAll('[name=cqMarcaRad]').forEach(r=>{ r.closest('label').style.borderColor='var(--border)'; r.closest('label').style.background='var(--surface)'; }); this.style.borderColor='var(--purple)'; this.style.background='var(--purple-xlight)'">
                  <input type="radio" name="cqMarcaRad" value="${m}" ${isSelected?'checked':''} style="accent-color:var(--purple);width:15px;height:15px;flex-shrink:0">
                  <span style="font-size:var(--text-sm);font-weight:${isPrincipal?'700':'500'}">${m}</span>
                  ${isPrincipal ? `<span style="margin-left:auto;font-size:var(--text-2xs);font-weight:700;padding:1px 7px;border-radius:8px;background:var(--purple);color:#fff">Principal</span>` : `<span style="margin-left:auto;font-size:var(--text-2xs);color:var(--muted)">Secundária</span>`}
                </label>`;
              }).join('')}
            </div>
          </div>`;
        })()}

        <!-- Preço -->
        <div style="padding:14px;background:var(--surface2);border-radius:var(--r10);border:1.5px solid var(--border)">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">
            ${isPresencialFixo ? 'Orçamento máximo (opcional)' : 'Preço'}
          </div>
          <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1fr 1fr'};gap:10px">
            <div class="field" style="margin:0">
              <label style="display:flex;align-items:baseline;justify-content:space-between;gap:6px">
                <span>Valor por ${i.unidade} (R$)${isPresencialFixo ? '' : ' *'}</span>
                ${i.precoUnitEstimado > 0 ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-weight:400;white-space:nowrap">
                  ref. ${fmt(i.precoUnitEstimado)}</span>` : ''}
              </label>
              <input type="number" id="cqPrecoUnit" class="inp" value="${cot.precoUnit||''}" min="0" step="0.01"
                placeholder="${isPresencialFixo ? 'Opcional' : '0,00'}"
                oninput="(function(){const u=parseFloat(document.getElementById('cqPrecoUnit').value)||0;const vf=document.getElementById('cqValorFinal');if(vf&&!vf._edited)vf.value=u*${qtd}>0?(u*${qtd}).toFixed(2):'';})()" style="font-family:monospace">
            </div>
            <div class="field" style="margin:0">
              <label>Valor final (R$)</label>
              <input type="number" id="cqValorFinal" class="inp" value="${cot.valorFinal!=null?cot.valorFinal:cot.precoUnit?(cot.precoUnit*qtd).toFixed(2):''}" min="0" step="0.01" placeholder="Auto"
                onfocus="this._edited=true" style="font-family:monospace">
            </div>
          </div>
          ${isPresencialFixo
            ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:6px">${lc('info',10,'currentColor')} Informe um teto de orçamento para controle — não é enviado ao fornecedor</div>`
            : `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:6px">O valor final pode diferir se houver frete ou desconto</div>`}
        </div>

        ${isPresencialFixo ? `
        <!-- Local de compra presencial -->
        <div style="padding:14px;background:var(--orange-light);border-radius:var(--r10);border:1.5px solid var(--yellow)">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--orange-dark);margin-bottom:10px">
            ${lc('map-pin',11,'currentColor')} Local de compra
          </div>
          <input type="text" id="cqLocalCompra" class="inp" value="${i.localCompra||sup?.name||''}" placeholder="Ex: Assaí Av. Principal, Atacadão...">
          <div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:6px">Registre o estabelecimento onde será feita a compra</div>
        </div>
        ` : `
        <!-- Prazo comercial -->
        <div style="padding:14px;background:var(--surface2);border-radius:var(--r10);border:1.5px solid var(--border)">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Prazo comercial</div>
          <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1fr 1fr'};gap:10px">
            <div class="field" style="margin:0">
              <label>Último dia de pedido</label>
              <input type="date" id="cqDiasPedido" class="inp" value="${cot.diasPedido||''}">
            </div>
            <div class="field" style="margin:0">
              <label>Data de entrega</label>
              <input type="date" id="cqDataEntrega" class="inp" value="${cot.dataEntrega||''}">
            </div>
          </div>
        </div>

        <!-- Pagamento -->
        <div style="padding:14px;background:var(--surface2);border-radius:var(--r10);border:1.5px solid var(--border)">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Forma de pagamento</div>
          <div class="field" style="margin-bottom:10px">
            <select id="cqFormaPgto" class="inp" onchange="toggleCamposPgto()">
              <option value="">Selecionar...</option>
              <option value="pix"       ${cot.formaPagamento==='pix'      ?'selected':''}>PIX / À vista</option>
              <option value="boleto"    ${cot.formaPagamento==='boleto'   ?'selected':''}>Boleto</option>
              <option value="parcelado" ${cot.formaPagamento==='parcelado'?'selected':''}>Parcelado</option>
              <option value="cartao"    ${cot.formaPagamento==='cartao'   ?'selected':''}>Cartão de crédito</option>
            </select>
          </div>
          <div id="cqCamposBoleto" style="display:${cot.formaPagamento==='boleto'?'block':'none'}">
            <div class="field" style="margin:0">
              <label>Vencimento (dias após entrega)</label>
              <input type="number" id="cqBoletoDias" class="inp" value="${cot.boletoDias||''}" min="1" max="120" placeholder="Ex: 30">
            </div>
          </div>
          <div id="cqCamposParcelado" style="display:${cot.formaPagamento==='parcelado'?'grid':'none'};grid-template-columns:${isMobile()?'1fr':'1fr 1fr'};gap:10px">
            <div class="field" style="margin:0">
              <label>Quantas vezes</label>
              <input type="number" id="cqParceladoVezes" class="inp" value="${cot.parceladoVezes||''}" min="2" max="52" placeholder="Ex: 3">
            </div>
            <div class="field" style="margin:0">
              <label>Frequência</label>
              <select id="cqParceladoFreq" class="inp">
                <option value="mensal"  ${cot.parceladoFreq==='mensal' ?'selected':''}>Mensal</option>
                <option value="semanal" ${cot.parceladoFreq==='semanal'?'selected':''}>Semanal</option>
              </select>
            </div>
          </div>
        </div>`}

        <!-- Observações -->
        <div class="field" style="margin:0">
          <label>Observações</label>
          <textarea id="cqObs" class="inp" rows="2" placeholder="Condições especiais, restrições de entrega...">${cot.obs||''}</textarea>
        </div>

      </div>

      <div style="padding:14px 20px;border-top:1.5px solid var(--border);display:flex;gap:8px;justify-content:space-between;align-items:center">
        <button onclick="marcarEmFalta(${itemId},${idx});document.getElementById('popupCotacao').remove()"
          style="padding:7px 13px;border-radius:var(--r8);border:1.5px solid var(--red);background:var(--red-light);color:var(--red);font-size:var(--text-sm);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px">
          ${lc('alert-circle',12,'currentColor')} Em falta
        </button>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('popupCotacao').remove()" class="btn btn-outline">Cancelar</button>
          <button onclick="salvarCotacao(${itemId},${idx})"
            class="btn btn-primary" style="${isPresencialFixo ? 'background:var(--orange-dark);border-color:var(--orange-dark)' : ''}">
            ${isPresencialFixo ? `${lc('check',13,'#fff')} Confirmar presencial` : 'Salvar cotação'}
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function toggleCamposPgto() {
  const v = document.getElementById('cqFormaPgto')?.value;
  const b = document.getElementById('cqCamposBoleto');
  const p = document.getElementById('cqCamposParcelado');
  if (b) b.style.display = v === 'boleto' ? 'block' : 'none';
  if (p) p.style.display = v === 'parcelado' ? 'grid' : 'none';
}

function salvarCotacao(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  const cot = i.cotacoes[idx];

  const sup = suppliers.find(s => s.id === cot.supId);
  const isPresencialFixo = sup?.formaEntrega === 'presencial';
  const modalidade = isPresencialFixo ? 'presencial'
    : (document.querySelector('input[name="cqModalidade"]:checked')?.value || 'entrega');
  const isPresencial = isPresencialFixo || modalidade === 'presencial';

  const precoUnit = parseFloat(document.getElementById('cqPrecoUnit')?.value) || null;
  if (!precoUnit && !isPresencial) { toast('Informe o valor unitário', 'err'); return; }

  const valorFinalInput = parseFloat(document.getElementById('cqValorFinal')?.value) || null;

  cot.precoUnit      = precoUnit;
  cot.valorFinal     = precoUnit ? (valorFinalInput ?? (precoUnit * i.qtdSelecionada)) : null;
  cot.diasPedido     = document.getElementById('cqDiasPedido')?.value   || null;
  cot.dataEntrega    = document.getElementById('cqDataEntrega')?.value  || null;
  cot.formaPagamento = document.getElementById('cqFormaPgto')?.value    || '';
  cot.boletoDias     = parseInt(document.getElementById('cqBoletoDias')?.value)     || null;
  cot.parceladoVezes = parseInt(document.getElementById('cqParceladoVezes')?.value) || null;
  cot.parceladoFreq  = document.getElementById('cqParceladoFreq')?.value || '';
  cot.obs            = document.getElementById('cqObs')?.value.trim()   || '';
  cot.respondido     = true;
  cot.emFalta        = false;
  cot.marca          = document.querySelector('input[name="cqMarcaRad"]:checked')?.value || '';

  if (isPresencial) {
    cot.modalidade = 'presencial';
    i.tipoCompra   = 'presencial';
    i.localCompra  = document.getElementById('cqLocalCompra')?.value.trim() || sup?.name || '';
  } else {
    cot.modalidade = 'entrega';
    if (i.tipoCompra === 'presencial' && cot.supId === i.fornecedorId) i.tipoCompra = 'fornecedor';
  }

  // Memoriza condições comerciais no fornecedor
  if (sup && cot.formaPagamento) {
    sup.ultimasCond = {
      formaPagamento:  cot.formaPagamento,
      boletoDias:      cot.boletoDias     || null,
      parceladoVezes:  cot.parceladoVezes || null,
      parceladoFreq:   cot.parceladoFreq  || '',
      prazoEntregaDias: cot.dataEntrega
        ? Math.round((new Date(cot.dataEntrega) - new Date()) / 86400000)
        : null,
    };
    saveS();
  }

  saveListas();
  document.getElementById('popupCotacao')?.remove();
  _renderEtapa2Cotacao();
  toast(isPresencial
    ? `${lc('shopping-cart',13,'var(--orange-dark)')} Compra presencial confirmada!`
    : `${lc('check-circle',13,'var(--green)')} Cotação salva!`);
}

function marcarEmFalta(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].emFalta = true;
  i.cotacoes[idx].respondido = true;
  i.cotacoes[idx].precoUnit = null;
  saveListas(); _renderEtapa2Cotacao();
  toast('Fornecedor marcado como "em falta"');
}

function desmarcarEmFalta(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].emFalta = false;
  i.cotacoes[idx].respondido = false;
  saveListas(); _renderEtapa2Cotacao();
}

// Editar item manual — abre popup para alterar fornecedor, preço, nome
function abrirEditarItemManual(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  document.getElementById('popupEditItem')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupEditItem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:420px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:var(--text-md);font-weight:800">${lc('edit-2',15,'var(--purple)')} Editar item</div>
        <button onclick="document.getElementById('popupEditItem').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x',16,'var(--muted)')}</button>
      </div>
      <div class="field"><label>Nome</label>
        <input type="text" id="eiNome" class="inp" value="${i.nome}">
      </div>
      ${(()=>{
        const e = _qEmb(i, i.qtdSelecionada);
        if (e) return `
          <input type="hidden" id="eiModoEmb" value="1">
          <div class="field">
            <label>Quantidade (${e.uc})</label>
            <input type="number" id="eiQtd" class="inp" value="${e.embs}" min="1" step="1"
              style="font-weight:800;color:var(--purple)">
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:3px">
              = ${fmt(i.qtdSelecionada)} ${i.unidade} (${fmt(e.ic.qtdEmb)} ${i.unidade} por ${e.uc})
            </div>
          </div>`;
        return `
          <input type="hidden" id="eiModoEmb" value="0">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field"><label>Quantidade</label>
              <input type="number" id="eiQtd" class="inp" value="${i.qtdSelecionada}" min="0.001" step="0.001">
            </div>
            <div class="field"><label>Unidade</label>
              <select id="eiUnit" class="inp">
                ${['un','kg','g','L','ml','cx','pct','sc'].map(u=>`<option ${i.unidade===u?'selected':''}>${u}</option>`).join('')}
              </select>
            </div>
          </div>`;
      })()}
      <div class="field"><label>Preço estimado (R$)</label>
        <input type="number" id="eiPreco" class="inp" value="${i.precoUnitEstimado||''}" min="0" step="0.01">
      </div>
      <div class="field"><label>Categoria</label>
        <input type="text" id="eiCat" class="inp" value="${i.categoria||''}">
      </div>
      <div class="field"><label>Local de compra (deixe vazio para fornecedor)</label>
        <input type="text" id="eiLocal" class="inp" value="${i.localCompra||''}" placeholder="Ex: Atacadão (compra presencial)">
      </div>
      <div class="field"><label>Observações</label>
        <input type="text" id="eiObs" class="inp" value="${i.observacoes||''}">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupEditItem').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoItem(${itemId})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function salvarEdicaoItem(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  const nome  = document.getElementById('eiNome')?.value.trim();
  let qtd     = parseFloat(document.getElementById('eiQtd')?.value);
  if (!nome) { toast('Informe o nome','err'); return; }
  if (isNaN(qtd)||qtd<=0) { toast('Informe a quantidade','err'); return; }
  const isModoEmb = document.getElementById('eiModoEmb')?.value === '1';
  if (isModoEmb) {
    const ic = items.find(x => x.id === i.itemId);
    if (ic?.qtdEmb > 0) qtd = parseFloat((Math.max(1, Math.round(qtd)) * ic.qtdEmb).toFixed(3));
  }
  i.nome     = nome;
  i.qtdSelecionada = qtd;
  i.qtdSugerida    = qtd;
  i.unidade  = document.getElementById('eiUnit')?.value || i.unidade;
  i.precoUnitEstimado = parseFloat(document.getElementById('eiPreco')?.value)||0;
  i.categoria = document.getElementById('eiCat')?.value.trim() || i.categoria;
  const local = document.getElementById('eiLocal')?.value.trim()||'';
  i.localCompra = local;
  i.tipoCompra  = local ? 'presencial' : (i.cotacoes?.length ? 'fornecedor' : i.tipoCompra);
  i.observacoes = document.getElementById('eiObs')?.value.trim()||'';
  _recalcEstimativa();
  saveListas();
  document.getElementById('popupEditItem')?.remove();
  _renderEtapa2Cotacao();
  toast('Item atualizado!');
}

// Mensagem WA com link de formulário de cotação
function _montaMsgCotacaoForn(sup, item) {
  const l = _listaAtual;
  const itensForn = l.itens.filter(i => (i.cotacoes||[]).some(c => c.supId === sup.id));
  const linhas = itensForn.map(i => `• ${i.nome}: ${fmt(i.qtdSelecionada)} ${i.unidade}`).join('\n');
  const prazo  = l.prazoCotacao ? `\nPrazo: ${fmtDT(l.prazoCotacao)}` : '';
  // Link de formulário de resposta (Google Forms ou página interna futura)
  const formLink = `\n\n[Form] *Preencha sua cotação aqui:*\nhttps://docs.google.com/forms/d/e/FORMULARIO_VTP/viewform?usp=pp_url&entry.codigo=${encodeURIComponent(l.codigo)}&entry.fornecedor=${encodeURIComponent(sup.name)}`;
  return `Olá ${sup.seller||sup.name}!\n\n*Vai Ter Pizza!* solicita cotação (${l.codigo}):\n\n${linhas}${prazo}\n\nPor favor informe:\n• Valor unitário de cada item\n• Prazo de entrega\n• Forma de pagamento\n• Prazo de pagamento${formLink}\n\nObrigado!`;
}

function abrirAddFornecedor(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  if (!i.cotacoes) i.cotacoes = [];
  const jaAdicionados = new Set(i.cotacoes.map(c => c.supId));

  // Resolve candidatos: itens do catálogo respeitam supIds; itens avulsos aceitam qualquer fornecedor
  const itemCad = items.find(x => x.id === i.itemId);
  let candidatos;
  if (itemCad) {
    const supIds = itemCad.supIds?.length ? itemCad.supIds : (itemCad.supId ? [itemCad.supId] : []);
    if (!supIds.length) {
      _popupSemFornecedorVinculado(i.nome, i.itemId, i.id);
      return;
    }
    candidatos = suppliers.filter(s => supIds.includes(s.id) && !jaAdicionados.has(s.id));
    if (!candidatos.length) { toast('Todos os fornecedores vinculados já foram adicionados', 'info'); return; }
  } else {
    candidatos = suppliers.filter(s => !jaAdicionados.has(s.id));
    if (!candidatos.length) { toast('Todos os fornecedores já adicionados', 'info'); return; }
  }

  const popup = document.createElement('div');
  popup.id = 'popupForn';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:14px">${lc('building-2',15,'var(--purple)')} Adicionar fornecedor</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:10px;font-weight:600">${i.nome}</div>
      ${!itemCad ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:10px;padding:6px 10px;background:var(--surface2);border-radius:var(--r6)">${lc('info',11,'var(--muted)')} Item avulso — todos os fornecedores disponíveis</div>` : ''}
      <select id="selFornPop" class="inp" style="margin-bottom:16px">
        <option value="">Selecionar fornecedor...</option>
        ${candidatos.map(s=>`<option value="${s.id}">${s.name}${s.phone?'':' ⚠ sem tel'}</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupForn').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarAddFornecedor(${itemId})">Adicionar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function _popupSemFornecedorVinculado(nomeItem, itemCadId, listaItemId) {
  document.getElementById('popupSemForn')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupSemForn';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';

  const supOpts = suppliers.map(s =>
    `<div data-sid="${s.id}" onclick="_sfSelSup(${s.id})" id="sfOpt-${s.id}"
      style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:var(--r8);
      border:1.5px solid var(--border);background:var(--surface);cursor:pointer;transition:all .12s;margin-bottom:5px">
      <span style="width:30px;height:30px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lc('building-2',13,'var(--purple)')}
      </span>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</div>
        ${s.cats ? `<div style="font-size:var(--text-2xs);color:var(--muted)">${s.cats}</div>` : ''}
      </div>
      ${s.phone ? `<span style="font-size:var(--text-2xs);color:var(--muted);flex-shrink:0">${lc('phone',9,'currentColor')} ${s.phone}</span>` : ''}
    </div>`
  ).join('');

  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r16);width:100%;max-width:540px;box-shadow:0 16px 48px rgba(0,0,0,.22);overflow:hidden">
      <!-- Header -->
      <div style="padding:18px 20px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800;margin-bottom:3px">${lc('building-2',15,'var(--purple)')} Associar fornecedor</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          <strong style="color:var(--text)">${nomeItem}</strong> não tem fornecedor vinculado
        </div>
      </div>

      <!-- Abas -->
      <div style="display:flex;border-bottom:1px solid var(--border)">
        <button id="sfTab-existente" onclick="_sfMudarAba('existente')"
          style="flex:1;padding:10px;border:none;border-bottom:2.5px solid var(--purple);background:none;
          font-size:var(--text-sm);font-weight:700;color:var(--purple);cursor:pointer;font-family:Inter,sans-serif">
          ${lc('search',12,'currentColor')} Fornecedor existente
        </button>
        <button id="sfTab-novo" onclick="_sfMudarAba('novo')"
          style="flex:1;padding:10px;border:none;border-bottom:2.5px solid transparent;background:none;
          font-size:var(--text-sm);font-weight:600;color:var(--muted);cursor:pointer;font-family:Inter,sans-serif">
          ${lc('plus-circle',12,'currentColor')} Criar novo
        </button>
      </div>

      <!-- Aba: Existente -->
      <div id="sfPane-existente" style="padding:16px 20px">
        ${suppliers.length ? `
          <input type="text" placeholder="Buscar fornecedor..." oninput="_sfFiltrar(this.value)"
            style="width:100%;padding:8px 11px;border:1.5px solid var(--border);border-radius:var(--r8);
            font-size:var(--text-sm);margin-bottom:10px;box-sizing:border-box;font-family:Inter,sans-serif">
          <div id="sfListaSups" style="max-height:220px;overflow-y:auto">
            ${supOpts}
          </div>
          <input type="hidden" id="sfSupSel" value="">
        ` : `
          <div style="text-align:center;padding:24px 0;color:var(--muted)">
            <div style="margin-bottom:8px">${lc('building-2',28,'var(--border)')}</div>
            <div style="font-size:var(--text-sm)">Nenhum fornecedor cadastrado ainda</div>
            <div style="font-size:var(--text-xs);margin-top:4px">Use a aba "Criar novo" para cadastrar</div>
          </div>
        `}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
          <button class="btn btn-outline" onclick="document.getElementById('popupSemForn').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="_sfConfirmarExistente(${itemCadId},${listaItemId})">
            ${lc('link',13,'#fff')} Associar e cotar
          </button>
        </div>
      </div>

      <!-- Aba: Criar novo -->
      <div id="sfPane-novo" style="padding:16px 20px;display:none;max-height:72vh;overflow-y:auto">
        <div class="f2">
          <div class="field"><label>Nome da empresa *</label><input class="inp" id="sfnName" placeholder="ex: Up Distribuidora"></div>
          <div class="field">
            <label>Categoria do fornecedor</label>
            <div style="display:flex;gap:5px;flex-wrap:wrap;padding:7px 8px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8)">
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnCat_alimentos" style="accent-color:var(--purple)"> Alimentos</label>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnCat_suprimentos" style="accent-color:var(--purple)"> Suprimentos</label>
              <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnCat_bebidas" style="accent-color:var(--purple)"> Bebidas</label>
            </div>
          </div>
        </div>
        <div class="f2">
          <div class="field"><label>Vendedor / Contato</label><input class="inp" id="sfnSeller" placeholder="ex: João Miguel"></div>
          <div class="field"><label>WhatsApp</label><input class="inp" id="sfnPhone" placeholder="ex: 82999999999"></div>
        </div>
        <div class="f2">
          <div class="field"><label>E-mail</label><input class="inp" id="sfnEmail" type="email" placeholder="ex: joao@empresa.com"></div>
          <div class="field">
            <label>Modalidade de compra</label>
            <select class="inp" id="sfnFormaEntrega">
              <option value="entrega">Entrega (pedido remoto)</option>
              <option value="presencial">Somente presencial</option>
              <option value="ambos">Entrega ou presencial</option>
            </select>
          </div>
        </div>
        <hr class="sdiv"><div class="slbl">Regras de Compra</div>
        <div class="f2">
          <div class="field">
            <label>Pedido mínimo</label>
            <div style="display:flex;gap:6px">
              <input class="inp" id="sfnPedidoMin" type="number" placeholder="Ex: 150" min="0" step="0.01" style="flex:1">
              <select class="inp" id="sfnPedidoMinTipo" style="width:80px">
                <option value="">—</option>
                <option value="valor">R$</option>
                <option value="peso">kg/un</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Prazo de entrega (dias)</label><input class="inp" id="sfnPrazoEntrega" type="number" placeholder="Ex: 2" min="0"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Antecedência mínima (dias)</label><input class="inp" id="sfnAntecedencia" type="number" placeholder="Ex: 20" min="0"></div>
          <div class="field"><label>Horário limite do pedido</label><input class="inp" id="sfnHorarioLimite" type="time"></div>
        </div>
        <div class="field">
          <label>Dias que aceita pedido</label>
          <div style="display:flex;gap:5px;flex-wrap:wrap;padding:7px 8px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8)">
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_seg" style="accent-color:var(--purple)"> Seg</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_ter" style="accent-color:var(--purple)"> Ter</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_qua" style="accent-color:var(--purple)"> Qua</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_qui" style="accent-color:var(--purple)"> Qui</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_sex" style="accent-color:var(--purple)"> Sex</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-sm);font-weight:600;padding:4px 9px;border-radius:var(--r6);cursor:pointer"><input type="checkbox" id="sfnDia_sab" style="accent-color:var(--purple)"> Sáb</label>
            <span style="font-size:var(--text-xs);color:var(--muted);align-self:center;padding-left:4px">vazio = qualquer dia</span>
          </div>
        </div>
        <div class="field"><label>Aviso interno</label><input class="inp" id="sfnAviso" placeholder="Ex: Pedir embalagens no início do mês. Gráfica precisa 20 dias."></div>
        <div class="field">
          <label>Status de confiança</label>
          <select class="inp" id="sfnConfianca">
            <option value="backup">Backup (segunda opção)</option>
            <option value="prioritario">Prioritário</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </div>
        <div class="field">
          <label>Categorias que fornece</label>
          <input class="inp" id="sfnCats" placeholder="ex: Laticínios, Frios, Massas — separe por vírgula">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
          <button class="btn btn-outline" onclick="document.getElementById('popupSemForn').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="_sfCriarECotar(${itemCadId},${listaItemId})">
            ${lc('plus',13,'#fff')} Criar e cotar
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(popup);
}

function _sfMudarAba(aba) {
  ['existente','novo'].forEach(a => {
    document.getElementById('sfPane-' + a).style.display = a === aba ? 'block' : 'none';
    const tab = document.getElementById('sfTab-' + a);
    tab.style.borderBottomColor = a === aba ? 'var(--purple)' : 'transparent';
    tab.style.color   = a === aba ? 'var(--purple)' : 'var(--muted)';
    tab.style.fontWeight = a === aba ? '700' : '600';
  });
}

function _sfFiltrar(q) {
  const q2 = q.toLowerCase();
  document.querySelectorAll('#sfListaSups [data-sid]').forEach(el => {
    const nome = el.querySelector('div')?.textContent?.toLowerCase() || '';
    el.style.display = nome.includes(q2) ? '' : 'none';
  });
}

function _sfSelSup(supId) {
  document.querySelectorAll('#sfListaSups [data-sid]').forEach(el => {
    const sel = parseInt(el.dataset.sid) === supId;
    el.style.borderColor  = sel ? 'var(--purple)' : 'var(--border)';
    el.style.background   = sel ? 'var(--purple-xlight)' : 'var(--surface)';
  });
  const inp = document.getElementById('sfSupSel');
  if (inp) inp.value = supId;
}

function _sfConfirmarExistente(itemCadId, listaItemId) {
  const supId = parseInt(document.getElementById('sfSupSel')?.value);
  if (!supId) { toast('Selecione um fornecedor', 'err'); return; }
  _sfVincularECotar(itemCadId, listaItemId, supId);
}

function _sfCriarECotar(itemCadId, listaItemId) {
  const nome = document.getElementById('sfnName')?.value.trim();
  if (!nome) { toast('Informe o nome do fornecedor', 'err'); return; }
  const diasPedido = ['seg','ter','qua','qui','sex','sab'].filter(d => document.getElementById('sfnDia_'+d)?.checked);
  const categoria  = ['alimentos','suprimentos','bebidas'].filter(c => document.getElementById('sfnCat_'+c)?.checked);
  const nid = nextSid++;
  suppliers.push({
    id:                 nid,
    name:               nome,
    seller:             document.getElementById('sfnSeller')?.value.trim() || '',
    phone:              document.getElementById('sfnPhone')?.value.trim() || '',
    email:              document.getElementById('sfnEmail')?.value.trim() || '',
    cats:               document.getElementById('sfnCats')?.value.trim() || '',
    formaEntrega:       document.getElementById('sfnFormaEntrega')?.value || 'entrega',
    pedidoMinimo:       parseFloat(document.getElementById('sfnPedidoMin')?.value) || null,
    pedidoMinTipo:      document.getElementById('sfnPedidoMinTipo')?.value || '',
    prazoEntregaDias:   parseInt(document.getElementById('sfnPrazoEntrega')?.value) || null,
    antecedenciaMinDias:parseInt(document.getElementById('sfnAntecedencia')?.value) || null,
    horarioPedido:      document.getElementById('sfnHorarioLimite')?.value || '',
    diasPedido,
    aviso:              document.getElementById('sfnAviso')?.value.trim() || '',
    confianca:          document.getElementById('sfnConfianca')?.value || 'backup',
    categoria,
  });
  saveS();
  toast(`Fornecedor "${nome}" criado!`);
  _sfVincularECotar(itemCadId, listaItemId, nid);
}

function _sfVincularECotar(itemCadId, listaItemId, supId) {
  // Vincula o fornecedor ao insumo no cadastro
  const itemCad = items.find(i => i.id === itemCadId);
  if (itemCad) {
    if (!itemCad.supIds) itemCad.supIds = itemCad.supId ? [itemCad.supId] : [];
    if (!itemCad.supIds.includes(supId)) itemCad.supIds.push(supId);
    if (!itemCad.supId) itemCad.supId = supId;
    saveI();
  }
  // Adiciona à cotação do item da lista
  const li = _listaAtual.itens.find(x => x.id === listaItemId);
  if (li) {
    if (!li.cotacoes) li.cotacoes = [];
    const supObj = suppliers.find(s => s.id === supId);
    const isPresencialOnly = supObj?.formaEntrega === 'presencial';
    const modalidade = isPresencialOnly ? 'presencial' : 'entrega';
    if (!li.cotacoes.find(c => c.supId === supId)) {
      li.cotacoes.push({ supId, modalidade, precoUnit: null, valorFinal: null, respondido: false, emFalta: false,
        diasPedido: null, dataEntrega: null, formaPagamento: '', boletoDias: null,
        parceladoVezes: null, parceladoFreq: '', obs: '' });
    }
    if (isPresencialOnly) {
      li.tipoCompra = 'presencial';
      li.localCompra = supObj.name;
    }
    saveListas();
  }
  document.getElementById('popupSemForn')?.remove();
  _renderEtapa2Cotacao();
  const supForMsg = suppliers.find(s => s.id === supId);
  toast(supForMsg?.formaEntrega === 'presencial'
    ? `${lc('shopping-cart',13,'currentColor')} Marcado para compra presencial em ${supForMsg.name}!`
    : 'Fornecedor associado e adicionado à cotação!');
}

function confirmarAddFornecedor(itemId) {
  const supId = parseInt(document.getElementById('selFornPop')?.value);
  if (!supId) { toast('Selecione um fornecedor', 'err'); return; }
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  if (!i.cotacoes) i.cotacoes = [];
  i.cotacoes.push({ supId, precoUnit: null, valorFinal: null, respondido: false, emFalta: false, diasPedido: null, dataEntrega: null, formaPagamento: '', boletoDias: null, parceladoVezes: null, parceladoFreq: '', obs: '' });
  saveListas();
  document.getElementById('popupForn')?.remove();
  _renderEtapa2Cotacao();
  toast('Fornecedor adicionado!');
}

function removerCotacao(itemId, idx) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i?.cotacoes) { i.cotacoes.splice(idx,1); saveListas(); _renderEtapa2Cotacao(); }
}

function marcarRespondido(itemId, idx, checked) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  i.cotacoes[idx].respondido = checked;
  saveListas(); _renderEtapa2Cotacao();
}

function setCotacaoPreco(itemId, idx, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i?.cotacoes?.[idx]) return;
  const v = parseFloat(val);
  i.cotacoes[idx].precoUnit = !isNaN(v)&&v>0 ? v : null;
  if (i.cotacoes[idx].precoUnit) i.cotacoes[idx].respondido = true;
  saveListas(); _renderEtapa2Cotacao();
}

function desmarcarPresencialCotacao(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.tipoCompra = 'fornecedor';
  saveListas(); _renderEtapa2Cotacao();
}

function enviarTodasCotacoesWA() {
  if (!_listaAtual) return;
  const l = _listaAtual;
  const bySup = {};
  l.itens.forEach(i => {
    (i.cotacoes||[]).forEach(cot => {
      const sup = suppliers.find(s => s.id === cot.supId);
      if (!sup?.phone) return;
      if (!bySup[cot.supId]) bySup[cot.supId] = { sup };
      bySup[cot.supId].sup = sup;
    });
  });
  const sups = Object.values(bySup);
  if (!sups.length) { toast('Nenhum fornecedor com telefone cadastrado', 'err'); return; }
  sups.forEach(({ sup }) => {
    window.open('https://wa.me/55'+sup.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(_montaMsgCotacaoForn(sup,null)),'_blank');
  });
  l.status = 'cotacao'; saveListas(); _renderDashCompras(); _renderEtapa2Cotacao();
  toast(`${sups.length} mensagem(ns) enviada(s)!`);
}

function setItemQtd1(itemId, val, isModoEmb) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  let v = parseFloat(val);
  if (isNaN(v) || v <= 0) return;
  if (isModoEmb) {
    const ic = items.find(x => x.id === i.itemId);
    if (ic?.qtdEmb > 0) v = parseFloat((Math.max(1, Math.round(v)) * ic.qtdEmb).toFixed(3));
  }
  i.qtdSelecionada = parseFloat(v.toFixed(3));
  _recalcEstimativa(); saveListas();
  const el = document.getElementById('totalEstimado');
  if (el) el.textContent = 'R$ '+fmt(_listaAtual.valorEstimado);
}

function removerItem1(itemId) {
  _listaAtual.itens = _listaAtual.itens.filter(x => x.id !== itemId);
  _recalcEstimativa(); saveListas(); _renderEtapa2Cotacao();
}

function setObsLista(val) { if (_listaAtual) { _listaAtual.observacoes = val; saveListas(); } }

function setStatusLista(status) {
  if (!_listaAtual) return;
  _listaAtual.status = status; saveListas(); _renderEtapa1(); _renderDashCompras();
  try { logAudit('lista_etapa', 'Lista #' + _listaAtual.id + ' → ' + status, 'compras'); } catch(e) {}
}

function _recalcEstimativa() {
  if (!_listaAtual) return;
  _listaAtual.valorEstimado = _listaAtual.itens.reduce((s,i) => s+i.qtdSelecionada*(i.precoUnitEstimado||0), 0);
}

function abrirAddItemManual() {
  document.getElementById('ovAddItem').classList.add('open');
  ['aiNome','aiQtd','aiPreco','aiObs','aiLocal'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const u = document.getElementById('aiUnit'); if (u) u.value='un';
}

function saveItemManual() {
  const nome = document.getElementById('aiNome').value.trim();
  const qtd  = parseFloat(document.getElementById('aiQtd').value);
  if (!nome) { toast('Informe o nome do item','err'); return; }
  if (isNaN(qtd)||qtd<=0) { toast('Informe a quantidade','err'); return; }
  const localEl = document.getElementById('aiLocal');
  const newId = Math.max(0,..._listaAtual.itens.map(x=>x.id))+1;
  _listaAtual.itens.push({
    id:newId, itemId:null, nome,
    categoria: document.getElementById('aiCat')?.value||'Geral',
    unidade:   document.getElementById('aiUnit')?.value||'un',
    qtdSugerida:qtd, qtdSelecionada:qtd,
    qtdAprovada:null, qtdComprada:null, qtdRecebida:null,
    estoqueAtual:0, estoqueMinimo:0, estoqueIdeal:0,
    origem:'manual', tipoCompra: localEl?.value?'presencial':'fornecedor',
    fornecedorId:null, localCompra:localEl?.value||'', diaCompra:'', responsavelCompra:'',
    precoUnitEstimado: parseFloat(document.getElementById('aiPreco')?.value)||0,
    precoUnitFinal:null, valorTotal:0, statusItem:'pendente',
    observacoes: document.getElementById('aiObs')?.value||'',
    cotacoes:[], aprovado:null, comentarioAprovador:'',
    conferido:false, divergencia:false, comentarioConferencia:'',
    conferidoPor:'', dataRecebimento:'', horaRecebimento:'',
    anexos: [],
  });
  _recalcEstimativa(); saveListas(); closeModal('ovAddItem'); _renderEtapa1();
  toast('Item adicionado!');
}

function abrirPrazoCotacao() {
  document.getElementById('popupPrazo')?.remove();
  const atual  = _listaAtual.prazoCotacao ? new Date(_listaAtual.prazoCotacao) : null;
  const dataVal = atual ? atual.toISOString().slice(0,10) : '';
  const horaVal = atual ? `${String(atual.getHours()).padStart(2,'0')}:00` : '18:00';
  const horas   = Array.from({length:18},(_,i)=>`${String(i+6).padStart(2,'0')}:00`);
  const popup = document.createElement('div');
  popup.id = 'popupPrazo';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:340px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:16px">${lc('clock',15,'var(--purple)')} Prazo de cotação</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div class="field" style="margin:0"><label>Data</label><input type="date" id="prazoData" class="inp" value="${dataVal}"></div>
        <div class="field" style="margin:0"><label>Horário</label>
          <select id="prazoHora" class="inp">
            ${horas.map(h=>`<option value="${h}" ${h===horaVal?'selected':''}>${h}</option>`).join('')}
          </select>
        </div>
      </div>
      ${atual?`<button onclick="limparPrazo()" style="width:100%;padding:6px;border:1.5px solid var(--red);border-radius:var(--r6);background:var(--red-light);color:var(--red);font-size:var(--text-sm);font-weight:600;cursor:pointer;margin-bottom:10px">${lc('x',12,'currentColor')} Remover prazo</button>`:''}
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupPrazo').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPrazo()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function salvarPrazo() {
  const data = document.getElementById('prazoData')?.value;
  const hora = document.getElementById('prazoHora')?.value;
  if (!data) { toast('Selecione a data','err'); return; }
  _listaAtual.prazoCotacao = new Date(`${data}T${hora}:00`).toISOString();
  saveListas(); document.getElementById('popupPrazo')?.remove(); _renderEtapa1(); toast('Prazo definido!');
}

function limparPrazo() {
  _listaAtual.prazoCotacao = null; saveListas();
  document.getElementById('popupPrazo')?.remove(); _renderEtapa1(); toast('Prazo removido.');
}

// ══════════════════════════════════════════════════════════════
// ETAPA 2 — PRÉ-APROVAÇÃO (aprovador revisa lista antes da cotação)
// ══════════════════════════════════════════════════════════════

function _renderAguardandoAprovacao(tipo) {
  const l           = _listaAtual;
  const isPre       = tipo === 'pre';
  const aprovNome   = isPre ? l.aprovadorPreNome : l.aprovadorFinalNome;
  const etapaNum    = isPre ? 2 : 4;
  const proxEtapa   = isPre ? 'cotação' : 'emissão das Ordens de Compra';
  const titulo      = isPre ? 'Aguardando pré-aprovação' : 'Aguardando aprovação final';

  const aprovadosCount  = l.itens.filter(i => i.aprovado === true).length;
  const reprovadosCount = l.itens.filter(i => i.aprovado === false).length;
  const pendentesCount  = l.itens.filter(i => i.aprovado === null || i.aprovado === undefined).length;
  const totalCount      = l.itens.length;
  const pct = totalCount > 0 ? Math.round((aprovadosCount + reprovadosCount) / totalCount * 100) : 0;

  document.getElementById('comprasContent').innerHTML = `
    <div style="max-width:560px;margin:0 auto;padding:32px 0">

      <div style="display:flex;align-items:flex-start;gap:16px;padding:20px;background:var(--purple-xlight);
        border:1.5px solid var(--purple);border-radius:var(--r14);margin-bottom:20px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--purple);flex-shrink:0;
          display:flex;align-items:center;justify-content:center">
          ${lc('clock', 22, '#fff')}
        </div>
        <div>
          <div style="font-size:var(--text-md);font-weight:800;color:var(--purple);margin-bottom:4px">${titulo}</div>
          <div style="font-size:var(--text-sm);color:var(--text2);line-height:1.5">
            ${aprovNome
              ? `${lc('user',11,'var(--purple)')} <strong style="color:var(--purple)">${aprovNome}</strong> está revisando os itens antes de liberar para ${proxEtapa}.`
              : `Um Gerente ou Supervisor precisa revisar e aprovar os itens para liberar para ${proxEtapa}.`}
          </div>
        </div>
      </div>

      ${totalCount > 0 ? `
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text2)">Progresso da revisão</div>
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--purple)">${aprovadosCount + reprovadosCount}/${totalCount} itens revisados</div>
        </div>
        <div style="height:6px;border-radius:3px;background:var(--surface2);overflow:hidden;margin-bottom:10px">
          <div style="height:100%;width:${pct}%;background:var(--purple);border-radius:3px;transition:width .3s"></div>
        </div>
        <div style="display:flex;gap:8px">
          <div style="flex:1;padding:8px;background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);text-align:center">
            <div style="font-size:1rem;font-weight:800;color:var(--green)">${aprovadosCount}</div>
            <div style="font-size:var(--text-2xs);color:var(--green);font-weight:600">${lc('check',9,'currentColor')} Aprovados</div>
          </div>
          <div style="flex:1;padding:8px;background:var(--red-light);border:1px solid var(--red);border-radius:var(--r8);text-align:center">
            <div style="font-size:1rem;font-weight:800;color:var(--red)">${reprovadosCount}</div>
            <div style="font-size:var(--text-2xs);color:var(--red);font-weight:600">${lc('x',9,'currentColor')} Reprovados</div>
          </div>
          <div style="flex:1;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);text-align:center">
            <div style="font-size:1rem;font-weight:800;color:var(--muted)">${pendentesCount}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);font-weight:600">${lc('clock',9,'currentColor')} Pendentes</div>
          </div>
        </div>
      </div>` : ''}

      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">
        ${lc('list', 10, 'var(--muted)')} Itens (${l.itens.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${l.itens.map(i => {
          const isAprov  = i.aprovado === true;
          const isReprov = i.aprovado === false;
          const borderC  = isAprov ? 'var(--green)' : isReprov ? 'var(--red)' : 'var(--border)';
          const bgC      = isAprov ? 'var(--green-light)' : isReprov ? 'var(--red-light)' : 'var(--surface)';
          const statusIcon = isAprov ? lc('check',11,'var(--green)') : isReprov ? lc('x',11,'var(--red)') : lc('clock',11,'var(--muted)');
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;
            background:${bgC};border:1.5px solid ${borderC};border-radius:var(--r8)">
            ${statusIcon}
            <div style="flex:1;font-size:var(--text-sm);font-weight:600">${i.itemName || i.nome || '—'}</div>
            <div style="font-size:var(--text-xs);color:var(--muted);font-family:monospace">${fmt(i.qtdSelecionada || i.qty || 0)} ${i.unit || i.unidade || ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _renderEtapaAprovPre() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (u && !['gerente', 'supervisor'].includes(u.role)) {
    _renderAguardandoAprovacao('pre');
    return;
  }

  const l = _listaAtual;
  l.itens.forEach(i => { if (i.aprovado === undefined) i.aprovado = null; });

  const aprovados  = l.itens.filter(i => i.aprovado === true).length;
  const reprovados = l.itens.filter(i => i.aprovado === false).length;
  const pendentes  = l.itens.filter(i => i.aprovado === null).length;
  const todosDecididos = pendentes === 0 && aprovados > 0;

  const etapaConcluidaPre = l.etapa > 2;
  document.getElementById('comprasContent').innerHTML = `
    ${etapaConcluidaPre ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
      background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);margin-bottom:14px;font-size:var(--text-sm);font-weight:600;color:var(--green)">
      ${lc('check-circle',14,'currentColor')} Etapa concluída — pré-aprovação realizada
      ${l.dataPreAprovacao ? `<span style="font-size:var(--text-xs);font-weight:400;color:var(--muted)">· ${fmtDT(l.dataPreAprovacao)}</span>` : ''}
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">
          ${lc('user-check',14,'var(--purple)')} Pré-aprovação · ${l.codigo}
        </h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          ${l.aprovadorPreNome
            ? `${lc('user',11,'var(--purple)')} <span style="color:var(--purple);font-weight:600">${l.aprovadorPreNome}</span> · responsável por esta etapa`
            : 'Ajuste as quantidades e aprove os itens antes de liberar para cotação'}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa1()">${lc('arrow-left',13)} Voltar à lista</button>
        ${pendentes > 0 ? `<button class="btn btn-outline btn-sm" onclick="_aprovPreTodos()">${lc('check-check',13,'currentColor')} Aprovar todos</button>` : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
      <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:var(--green)">${aprovados}</div>
        <div style="font-size:var(--text-2xs);font-weight:600;color:var(--green)">${lc('check',10,'currentColor')} Aprovados</div>
      </div>
      <div style="background:var(--red-light);border:1.5px solid var(--red);border-radius:var(--r8);padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:var(--red)">${reprovados}</div>
        <div style="font-size:var(--text-2xs);font-weight:600;color:var(--red)">${lc('x',10,'currentColor')} Reprovados</div>
      </div>
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:800;color:var(--muted)">${pendentes}</div>
        <div style="font-size:var(--text-2xs);font-weight:600;color:var(--muted)">${lc('clock',10,'currentColor')} Pendentes</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${l.itens.map(i => _cardPreAprovItem(i)).join('')}
    </div>

    <div style="margin-bottom:16px">
      <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">
        ${lc('message-circle',12,'var(--purple)')} Observações para o comprador
      </label>
      <textarea id="obsPreAprovacao" rows="3" placeholder="Ex: se não tiver a marca preferencial, aceitar marca X · instruções específicas para esta compra…"
        oninput="_salvarObsPreAprov(this.value)"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:var(--r8);border:1.5px solid var(--border);
        background:var(--surface);color:var(--text);font-size:var(--text-sm);font-family:Inter,sans-serif;
        resize:vertical;min-height:72px;line-height:1.5;transition:border-color .15s"
        onfocus="this.style.borderColor='var(--purple)'" onblur="this.style.borderColor='var(--border)'"
        ${etapaConcluidaPre ? 'readonly style="opacity:.7"' : ''}>${l.observacaoPre || ''}</textarea>
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px">Visível para o comprador nas etapas seguintes.</div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
      padding:14px 16px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r12)">
      <button onclick="_reprovarListaPre()"
        style="padding:9px 18px;border-radius:var(--r8);border:1.5px solid var(--red);background:var(--red-light);
        color:var(--red);font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:Inter,sans-serif">
        ${lc('rotate-ccw',14,'currentColor')} Solicitar revisão ao comprador
      </button>
      <button onclick="${todosDecididos ? 'enviarParaCotacao()' : 'void(0)'}"
        style="padding:11px 28px;border-radius:var(--r10);border:none;font-size:var(--text-md);font-weight:800;font-family:Inter,sans-serif;
        background:${todosDecididos ? 'var(--purple)' : 'var(--surface2)'};
        color:${todosDecididos ? '#fff' : 'var(--muted)'};cursor:${todosDecididos ? 'pointer' : 'not-allowed'};
        display:flex;align-items:center;gap:8px"
        title="${todosDecididos ? '' : 'Decida todos os itens primeiro'}">
        ${lc('tag',18,todosDecididos?'#fff':'var(--muted)')} Liberar para cotação
      </button>
    </div>`;
}

function _cardPreAprovItem(i) {
  const isAprov  = i.aprovado === true;
  const isReprov = i.aprovado === false;
  const borderColor = isAprov ? 'var(--green)' : isReprov ? 'var(--red)' : 'var(--border)';
  const bgColor     = isAprov ? 'var(--green-light)' : isReprov ? 'var(--red-light)' : 'var(--surface)';
  const accentColor = isAprov ? 'var(--green)' : isReprov ? 'var(--red)' : 'var(--border)';
  const qtd         = i.qtdAprovada ?? i.qtdSelecionada;
  const precoEst    = i.precoUnitEstimado || 0;
  const totalEst    = qtd * precoEst;

  // Dados de estoque do cadastro
  const itemCad  = items.find(x => x.id === i.itemId);
  const estoqueHtml = (() => {
    if (!itemCad) return '';
    const atual   = itemCad.qty  || 0;
    const ideal   = itemCad.ideal || 0;
    const minimo  = itemCad.min  || 0;
    const qtdAdd  = i.qtdAprovada ?? i.qtdSelecionada;
    const posComp = atual + qtdAdd;

    // Ideal fixado em 70% da barra — escala estável independente da qtd comprada
    const chartMax = (ideal > 0 ? ideal : Math.max(posComp, minimo)) / 0.70;

    const pctAtual    = Math.min(100, atual / chartMax * 100);
    // Compra dividida em: até o ideal (roxo) + excesso (laranja)
    const limiteIdeal = Math.max(0, ideal - atual);
    const excesso     = Math.max(0, qtdAdd - limiteIdeal);
    const pctAddIdeal = Math.min(100 - pctAtual, Math.min(qtdAdd, limiteIdeal) / chartMax * 100);
    const pctExcesso  = Math.min(100 - pctAtual - pctAddIdeal, excesso / chartMax * 100);
    const pctIdeal    = ideal  > 0 ? Math.min(98, ideal  / chartMax * 100) : 0;
    const pctMin      = minimo > 0 ? Math.min(98, minimo / chartMax * 100) : 0;
    const temOverflow = posComp > chartMax * 0.98;

    const stPos   = posComp < minimo ? 'crit'
                  : posComp < ideal  ? 'warn'
                  : excesso > ideal * 0.3 ? 'over' : 'ok';
    const stColor = stPos === 'crit' ? 'var(--red)' : stPos === 'warn' ? 'var(--yellow)'
                  : stPos === 'over' ? 'var(--orange-dark)' : 'var(--green)';
    const stLabel = stPos === 'crit' ? 'Abaixo do mínimo' : stPos === 'warn' ? 'Abaixo do ideal'
                  : stPos === 'over' ? 'Acima do ideal' : 'Dentro do ideal';
    const stIcon  = stPos === 'crit' ? 'alert-circle' : stPos === 'warn' ? 'alert-triangle'
                  : stPos === 'over' ? 'trending-up' : 'check-circle';
    const atualBg = stPos === 'crit' ? '#fee2e2' : stPos === 'warn' ? '#fef9c3' : '#dcfce7';

    return `
    <div style="padding:8px 14px 10px 22px;border-top:1px solid ${borderColor};
      background:${isAprov?'rgba(34,197,94,.04)':isReprov?'rgba(239,68,68,.04)':'var(--surface2)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <div style="font-size:var(--text-2xs);color:var(--muted);display:flex;align-items:center;gap:3px">
          ${lc('package',10,'var(--muted)')} Estoque pós-compra
        </div>
        <div style="display:flex;align-items:center;gap:7px">
          <span id="preaprov_status_${i.id}" style="font-size:var(--text-2xs);font-weight:700;color:${stColor};display:flex;align-items:center;gap:3px">
            ${lc(stIcon,10,'currentColor')} ${stLabel}
          </span>
          <span id="preaprov_posval_${i.id}" style="font-size:var(--text-xs);font-weight:800;color:${stColor};font-family:monospace">
            ${fmt(posComp)} ${itemCad.unit}
          </span>
        </div>
      </div>

      <!-- Barra: atual | até ideal (roxo) | excesso (laranja) | resto cinza | marcadores -->
      <div style="position:relative;height:16px;background:var(--border);border-radius:4px;margin-bottom:7px;overflow:hidden">
        <!-- Atual -->
        <div style="position:absolute;left:0;top:0;height:100%;width:${pctAtual}%;
          background:${atualBg};border-right:${pctAtual>0?'1.5px solid rgba(0,0,0,.08)':'none'}"></div>
        <!-- Compra até ideal (roxo) -->
        <div id="preaprov_barseg_${i.id}" style="position:absolute;left:${pctAtual}%;top:0;height:100%;width:${pctAddIdeal}%;
          background:var(--purple);transition:width .2s,left .2s"></div>
        <!-- Excesso acima do ideal (laranja) -->
        <div id="preaprov_barexc_${i.id}" style="position:absolute;left:${pctAtual+pctAddIdeal}%;top:0;height:100%;width:${pctExcesso}%;
          background:var(--orange-dark,#c2410c);opacity:.85;transition:width .2s,left .2s"></div>
        ${temOverflow?`<div style="position:absolute;right:0;top:0;height:100%;width:18px;
          background:linear-gradient(to right,transparent,rgba(0,0,0,.12));pointer-events:none"></div>`:''}
      </div>
      <!-- Marcadores abaixo da barra -->
      <div style="position:relative;height:10px;margin-bottom:5px">
        ${ideal>0?`<div style="position:absolute;left:${pctIdeal}%;transform:translateX(-50%)">
          <div style="width:1.5px;height:6px;background:var(--green);margin:0 auto"></div>
          <div style="font-size:var(--text-2xs);color:var(--green);font-weight:700;white-space:nowrap;transform:translateX(-30%)">Ideal</div>
        </div>`:''}
        ${minimo>0?`<div style="position:absolute;left:${pctMin}%;transform:translateX(-50%)">
          <div style="width:1.5px;height:5px;background:var(--yellow);margin:0 auto"></div>
          <div style="font-size:var(--text-2xs);color:var(--muted);white-space:nowrap;transform:translateX(-20%)">Mín</div>
        </div>`:''}
      </div>

      <!-- Legenda -->
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:var(--text-2xs);color:var(--muted)">
        <span style="display:flex;align-items:center;gap:3px">
          <span style="width:9px;height:9px;border-radius:2px;background:${atualBg};border:1px solid var(--border);flex-shrink:0"></span>
          Atual: <strong>${fmt(atual)}</strong>
        </span>
        <span style="display:flex;align-items:center;gap:3px">
          <span style="width:9px;height:9px;border-radius:2px;background:var(--purple);flex-shrink:0"></span>
          +Compra: <strong id="preaprov_legqtd_${i.id}">${fmt(qtdAdd)}</strong>
        </span>
        ${excesso>0?`<span style="display:flex;align-items:center;gap:3px">
          <span style="width:9px;height:9px;border-radius:2px;background:var(--orange-dark,#c2410c);flex-shrink:0"></span>
          Excesso: <strong id="preaprov_legexc_${i.id}">${fmt(excesso)}</strong>
        </span>`:`<span id="preaprov_legexc_wrap_${i.id}"></span>`}
        ${ideal>0?`<span style="display:flex;align-items:center;gap:3px">
          <span style="width:1.5px;height:11px;background:var(--green);border-radius:1px;flex-shrink:0"></span>
          Ideal: <strong>${fmt(ideal)}</strong>
        </span>`:''}
        ${minimo>0?`<span style="display:flex;align-items:center;gap:3px">
          <span style="width:1.5px;height:11px;background:var(--yellow);border-radius:1px;flex-shrink:0"></span>
          Mín: <strong>${fmt(minimo)}</strong>
        </span>`:''}
      </div>
    </div>`;
  })();

  const statusBadge = isAprov
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--green);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px">${lc('check',9,'#fff')} Aprovado</span>`
    : isReprov
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--red);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px">${lc('x',9,'#fff')} Reprovado</span>`
    : `<span style="padding:2px 9px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);font-size:var(--text-2xs);font-weight:600">Pendente</span>`;

  return `<div style="border:1.5px solid ${borderColor};border-radius:var(--r10);background:${bgColor};overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;flex-wrap:wrap">
      <div style="width:4px;align-self:stretch;min-height:32px;background:${accentColor};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:120px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:var(--text-md);font-weight:700">${i.nome}</span>
          ${i.fornecedorExclusivo ? (() => { const sup = suppliers.find(s => s.id === i.fornecedorId); return `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:99px;background:var(--orange-light);color:var(--orange-dark);border:1px solid var(--orange-dark)">${lc('star',8,'currentColor')} Exclusivo${sup?' · '+sup.name:''}</span>`; })() : ''}
        </div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
        ${_conflitoBadge(i.itemId) ? `<div style="margin-top:3px">${_conflitoBadge(i.itemId)}</div>` : ''}
        ${i.qtdSugerida && Math.abs((i.qtdSelecionada||0)-(i.qtdSugerida||0)) > 0.001 ? `
          <div style="display:inline-flex;align-items:center;gap:3px;margin-top:3px;padding:1px 7px;border-radius:8px;
            background:var(--yellow-light);border:1px solid var(--yellow);font-size:var(--text-2xs);color:var(--yellow-dark,#854d0e)">
            ${lc('alert-triangle',9,'currentColor')} Comprador ajustou qtd: sugerido ${fmt(i.qtdSugerida)} → solicitado ${fmt(i.qtdSelecionada)} ${i.unidade}
          </div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="text-align:center">
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Solicitado</div>
          ${_qtdHtml(i, i.qtdSelecionada, {sz:'.78rem',align:'center'})}
        </div>
        <div style="text-align:center">
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Ajustar qtd</div>
          ${(()=>{
            const e = _qEmb(i, qtd);
            if (e) {
              // Base units = embs × qtdEmb (não qtd raw, que pode não ser múltiplo exato)
              const baseReal = e.embs * e.ic.qtdEmb;
              return `
              <input type="number" value="${e.embs}" min="0" step="1"
                style="width:70px;padding:4px 6px;border:1.5px solid var(--purple);border-radius:var(--r6);
                font-size:var(--text-sm);font-weight:800;text-align:center;font-family:monospace;background:var(--surface);color:var(--purple)"
                oninput="setQtdAprovada(${i.id},this.value,true)"
                onchange="setQtdAprovada(${i.id},this.value,true)">
              <div style="font-size:var(--text-2xs);font-weight:700;color:var(--purple);font-family:monospace;margin-top:1px">${e.uc}</div>
              <div id="preaprov_baseqtd_${i.id}" style="font-size:var(--text-2xs);font-weight:700;color:var(--text);font-family:monospace;margin-top:1px">${fmt(baseReal)} ${i.unidade}</div>`;
            }
            return `
              <input type="number" value="${qtd}" min="0" step="0.001"
                style="width:70px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);
                font-size:var(--text-sm);text-align:center;font-family:monospace;background:var(--surface)"
                oninput="setQtdAprovada(${i.id},this.value,false)"
                onchange="setQtdAprovada(${i.id},this.value,false)">`;
          })()}
        </div>
        ${precoEst > 0 ? `<div style="text-align:center">
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Estimado</div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple);font-family:monospace">R$ ${fmt(totalEst)}</div>
        </div>` : ''}
        ${statusBadge}
        <div style="display:flex;gap:5px">
          <button onclick="reprovarItemPre(${i.id})"
            style="padding:5px 10px;border-radius:var(--r8);border:1.5px solid ${isReprov?'var(--red)':'var(--border)'};
            background:${isReprov?'var(--red)':'var(--surface)'};color:${isReprov?'#fff':'var(--text2)'};
            font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:3px">
            ${lc('x',11,'currentColor')} Reprovar
          </button>
          <button onclick="aprovarItemPre(${i.id})"
            style="padding:5px 11px;border-radius:var(--r8);border:1.5px solid ${isAprov?'var(--green)':'var(--purple)'};
            background:${isAprov?'var(--green)':'var(--purple)'};color:#fff;
            font-size:var(--text-xs);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:3px">
            ${lc('check',11,'#fff')} ${isAprov?'Aprovado':'Aprovar'}
          </button>
        </div>
      </div>
    </div>
    ${estoqueHtml}
    ${i.comentarioAprovador ? `<div style="padding:3px 14px 8px 22px;font-size:var(--text-xs);color:var(--muted);font-style:italic">${lc('message-square',9,'var(--muted)')} ${i.comentarioAprovador}</div>` : ''}
  </div>`;
}

function aprovarItemPre(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (i) { i.aprovado = true; i.acaoReprovacao = ''; saveListas(); _renderEtapaAprovPre(); }
}

function reprovarItemPre(itemId) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  const obs = prompt('Motivo da reprovação (opcional):') ?? '';
  if (i) { i.aprovado = false; i.comentarioAprovador = obs; saveListas(); _renderEtapaAprovPre(); }
}

function _salvarObsPreAprov(valor) {
  if (!_listaAtual) return;
  _listaAtual.observacaoPre = valor;
  saveListas();
}

function _aprovPreTodos() {
  _listaAtual.itens.forEach(i => { if (i.aprovado === null || i.aprovado === undefined) i.aprovado = true; });
  saveListas(); _renderEtapaAprovPre(); toast('Todos os itens aprovados!');
}

function _reprovarListaPre() {
  vtpConfirm({
    title: 'Devolver para revisão',
    message: 'A lista voltará para montagem e o comprador será notificado.',
    confirmLabel: 'Devolver',
    onConfirm: () => {
      _listaAtual.status = 'montagem'; _listaAtual.etapa = 1;
      saveListas();
      if (typeof criarAlerta === 'function') criarAlerta({
        tipo: 'compras_devolvida_revisao',
        titulo: 'Lista devolvida para revisão',
        mensagem: `Lista ${_listaAtual.codigo} foi devolvida pelo gestor. Revise os itens e reenvie.`,
        modulo: 'compras',
        destino_roles: ['comprador'],
        referencia_id: String(_listaAtual.id),
        acao_label: 'Ver lista',
        acao_modulo: 'compras',
      });
      _renderDashCompras(); _renderEtapa1(); toast('Lista devolvida para revisão.', 'warn');
    }
  });
}

function enviarParaCotacao() {
  if (!_listaAtual) return;
  const aprovados = _listaAtual.itens.filter(i => i.aprovado === true);
  if (!aprovados.length) { toast('Nenhum item aprovado', 'err'); return; }
  _listaAtual.itens = aprovados;
  _listaAtual.etapa  = 3;
  _listaAtual.status = 'cotacao';
  _listaAtual.dataCotacaoEnviada = new Date().toISOString();
  _listaAtual.cotacaoEnviadaPor  = (typeof getCurrentUser==='function' ? getCurrentUser()?.name : null) || '';
  saveListas(); _renderDashCompras(); _renderEtapa2Cotacao();
  toast('Lista liberada para cotação!');
}

function avancarParaAprovacao() {
  if (!_listaAtual) return;

  // Item 2: validar cotações obrigatórias para itens com fornecedor
  const pendentesCotacao = _listaAtual.itens.filter(i => {
    if (i.tipoCompra === 'presencial') return false; // presencial não precisa de cotação digital
    if (!i.cotacoes?.length) return false; // sem fornecedor → presencial, OK
    const todasEmFalta = i.cotacoes.every(c => c.emFalta);
    if (todasEmFalta) return false; // todos em falta → vai para presencial
    // Tem fornecedor mas nenhuma cotação com preço preenchido
    const temPreco = i.cotacoes.some(c => !c.emFalta && c.precoUnit > 0);
    return !temPreco;
  });

  if (pendentesCotacao.length > 0) {
    const nomes = pendentesCotacao.map(i => `• ${i.nome}`).join('\n');
    // Banner de aviso visível na tela
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:600;background:var(--red);color:#fff;padding:12px 20px;border-radius:var(--r10);box-shadow:0 4px 20px rgba(0,0,0,.25);font-size:var(--text-sm);font-weight:600;max-width:380px;text-align:center;line-height:1.5';
    banner.innerHTML = `${lc('alert-circle',16,'#fff')} ${pendentesCotacao.length} item(s) sem cotação preenchida:<br><span style="font-weight:400;font-size:var(--text-sm)">${pendentesCotacao.map(i=>i.nome).join(', ')}</span>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
    return;
  }

  // Validação de cobertura de marca principal
  const semMarcaPrincipal = _listaAtual.itens.filter(i => {
    if (i.tipoCompra === 'presencial') return false;
    const itemCad = items.find(x => x.id === i.itemId);
    const principal = (itemCad?.brands || []).filter(Boolean)[0];
    if (!principal) return false; // sem marcas cadastradas, não valida
    const marcasCotadas = (i.cotacoes || []).filter(c => !c.emFalta && c.respondido && c.marca).map(c => c.marca);
    return !marcasCotadas.includes(principal);
  });

  const _doEncerrarCotacao = () => {
    _listaAtual.itens.forEach(i => {
      if (!i.cotacoes?.length || i.cotacoes.every(c => c.emFalta)) {
        i.tipoCompra = 'presencial';
      }
    });
    _listaAtual.itens.forEach(i => {
      if (i.tipoCompra !== 'presencial' && i.cotacoes?.length) {
        const melhor = _melhorCotacao(i.cotacoes);
        if (melhor) { i.precoUnitFinal = melhor.precoUnit; i.fornecedorId = melhor.supId; i.tipoCompra = 'fornecedor'; }
      }
    });
    const uAprov = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const temPermAprov = uAprov && ['gerente', 'supervisor'].includes(uAprov.role);
    const _avancarAprovFinal = (aprovador) => {
      _listaAtual.etapa  = 4;
      _listaAtual.status = 'aguard_aprov_final';
      if (aprovador) {
        _listaAtual.aprovadorId   = aprovador.id;
        _listaAtual.aprovadorNome = aprovador.name;
        _listaAtual.aprovadorFinalNome = aprovador.name;
        _listaAtual.aprovadorRole = aprovador.role;
        _listaAtual.aprovadorWa   = aprovador.whatsapp || '';
      }
      saveListas();
      _renderDashCompras(); _renderAprovacaoFinal();
    };
    if (temPermAprov) {
      _avancarAprovFinal(uAprov);
      toast('Aprovação final disponível · revise e aprove os itens');
    } else {
      _comprasPickAprovador(
        'Selecionar aprovador — Aprovação final',
        'Defina quem será responsável pela aprovação final antes de gerar as Ordens de Compra.',
        (aprovador) => {
          _avancarAprovFinal(aprovador);
          if (typeof criarAlerta === 'function') criarAlerta({
            tipo: 'compras_aprov_final',
            titulo: 'Aprovação final necessária',
            mensagem: `Lista ${_listaAtual.codigo} foi cotada e aguarda aprovação para gerar as OCs.`,
            modulo: 'compras',
            destino_roles: ['gerente', 'supervisor'],
            referencia_id: String(_listaAtual.id),
            acao_label: 'Aprovar',
            acao_modulo: 'compras',
          });
          toast('Lista enviada para aprovação final!');
        }
      );
    }
  };

  if (semMarcaPrincipal.length > 0) {
    vtpConfirm({
      title: 'Marca principal não cotada',
      message: `${semMarcaPrincipal.length} item(s) não têm a marca principal cotada. Deseja enviar mesmo assim?`,
      confirmLabel: 'Enviar mesmo assim',
      danger: false,
      onConfirm: _doEncerrarCotacao
    });
    return;
  }

  _doEncerrarCotacao();
}

// ══════════════════════════════════════════════════════════════
// ETAPA 3 — APROVAÇÃO
// ══════════════════════════════════════════════════════════════
function _renderEtapaAprovacao() {
  const l = _listaAtual;
  l.itens.forEach(i => { if (i.aprovado === undefined) i.aprovado = null; });

  const aprovados  = l.itens.filter(i => i.aprovado === true).length;
  const reprovados = l.itens.filter(i => i.aprovado === false).length;
  const pendentes  = l.itens.filter(i => i.aprovado === null).length;
  const algumAprovado = aprovados > 0;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">
          ${lc('check-circle',14,'var(--purple)')} Aprovação · ${l.codigo}
        </h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          ${l.aprovadorNome
            ? `${lc('user',11,'var(--purple)')} <span style="color:var(--purple);font-weight:600">${l.aprovadorNome}</span> · responsável por esta etapa`
            : 'Nenhum aprovador definido'}
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa2Cotacao()">${lc('arrow-left',13)} Cotação</button>
        <button class="btn btn-outline btn-sm" onclick="abrirConfigAprovador()">${lc('user',13,'currentColor')} Trocar aprovador</button>
        ${pendentes > 0 ? `<button class="btn btn-outline btn-sm" onclick="aprovarTodosPendentes()">${lc('check-check',13,'currentColor')} Aprovar pendentes</button>` : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
      <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:12px;text-align:center">
        <div style="font-size:1.5rem;font-weight:800;color:var(--green)">${aprovados}</div>
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--green)">${lc('check',11,'currentColor')} Aprovados</div>
      </div>
      <div style="background:var(--red-light);border:1.5px solid var(--red);border-radius:var(--r10);padding:12px;text-align:center">
        <div style="font-size:1.5rem;font-weight:800;color:var(--red)">${reprovados}</div>
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--red)">${lc('x',11,'currentColor')} Reprovados</div>
      </div>
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px;text-align:center">
        <div style="font-size:1.5rem;font-weight:800;color:var(--muted)">${pendentes}</div>
        <div style="font-size:var(--text-xs);font-weight:600;color:var(--muted)">${lc('clock',11,'currentColor')} Pendentes</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
      ${l.itens.map(i => {
        const isPresencial = !i.cotacoes?.length || i.cotacoes.every(c => c.emFalta) || i.tipoCompra === 'presencial';
        return _cardAprovacaoItem(i, isPresencial);
      }).join('')}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;
      padding:14px 16px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r12)">
      <button onclick="reprovarLista()"
        style="padding:9px 18px;border-radius:var(--r8);border:1.5px solid var(--red);background:var(--red-light);
        color:var(--red);font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:Inter,sans-serif">
        ${lc('x-circle',14,'currentColor')} Reprovar lista
      </button>
      <button onclick="${algumAprovado ? 'aprovarLista()' : 'void(0)'}"
        style="padding:11px 28px;border-radius:var(--r10);border:none;font-size:var(--text-md);font-weight:800;font-family:Inter,sans-serif;
        background:${algumAprovado ? 'var(--green)' : 'var(--surface2)'};
        color:${algumAprovado ? '#fff' : 'var(--muted)'};
        cursor:${algumAprovado ? 'pointer' : 'not-allowed'};
        display:flex;align-items:center;gap:8px">
        ${lc('check-circle', 18, algumAprovado ? '#fff' : 'var(--muted)')} Aprovar e ir para OC
      </button>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ETAPA 2 — COTAÇÃO
// ══════════════════════════════════════════════════════════════
function _renderEtapa2Cotacao() {
  const l = _listaAtual;
  // Remove preparados (isProd) de listas existentes — não são itens de compra
  const antes = l.itens.length;
  l.itens = l.itens.filter(ci => {
    const item = items.find(x => x.id === ci.itemId);
    return item ? !item.isProd : true;
  });
  if (l.itens.length !== antes) saveListas();

  l.itens.forEach(i => {
    if (!i.cotacoes) i.cotacoes = [];
    if (i.tipoCompra !== 'presencial') {
      const supForn = suppliers.find(s => s.id === i.fornecedorId);
      if (supForn?.formaEntrega === 'presencial') {
        i.tipoCompra = 'presencial';
      } else if (!supForn && i.cotacoes.length > 0) {
        // Sem fornecedor principal definido: se todos os fornecedores em cotações são presencial-only, marca presencial
        const allPres = i.cotacoes.every(c => {
          const s = suppliers.find(x => x.id === c.supId);
          return s?.formaEntrega === 'presencial';
        });
        if (allPres) i.tipoCompra = 'presencial';
      }
    }
  });

  const itensCotacao   = l.itens.filter(i => i.tipoCompra !== 'presencial');
  const itensPresencial = l.itens.filter(i => i.tipoCompra === 'presencial');

  const prazoHtml = l.prazoCotacao ? `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--yellow-light);
      border:1.5px solid var(--yellow);border-radius:var(--r8);font-size:var(--text-sm);margin-bottom:14px">
      ${lc('clock',14,'var(--orange-dark)')}
      <span>Prazo: <strong>${fmtDT(l.prazoCotacao)}</strong></span>
      <span id="timer1" style="font-weight:800;color:var(--orange-dark);margin-left:4px"></span>
      <button onclick="abrirPrazoCotacao()"
        style="margin-left:auto;background:none;border:1px solid var(--yellow);border-radius:var(--r6);
        padding:2px 8px;font-size:var(--text-xs);color:var(--orange-dark);cursor:pointer">
        ${lc('edit-2',11,'currentColor')} Alterar
      </button>
    </div>` : '';

  const obsPreHtml = l.observacaoPre ? `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;margin-bottom:14px;
      background:var(--purple-xlight);border:1.5px solid var(--purple-light, #c4b5fd);border-radius:var(--r8)">
      ${lc('message-circle',14,'var(--purple)')}
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--purple);margin-bottom:2px">Observações do aprovador</div>
        <div style="font-size:var(--text-sm);color:var(--text2);white-space:pre-line">${l.observacaoPre}</div>
      </div>
    </div>` : '';

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">
          ${lc('tag',14,'var(--purple)')} Cotação · ${l.codigo}
        </h3>
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:var(--text-xs);color:var(--muted)">${itensCotacao.length} com fornecedor${itensPresencial.length ? ` · ${itensPresencial.length} presencial` : ''} · R$${fmt(l.valorEstimado)} estimado</span>
          ${(()=>{ const tp=TIPOS_LISTA[l.tipo||'insumos']||TIPOS_LISTA.insumos; return `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${tp.bg};color:${tp.color};border:1px solid ${tp.color}">${lc(tp.icon,8,'currentColor')} ${tp.label}</span>`; })()}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa1()">${lc('arrow-left',13)} Carrinho</button>
        ${(()=>{const pills=[];['montagem','cotacao','cotacao_encerrada'].forEach(s=>{const st=STATUS_ETAPA[s];const isActive=l.status===s;pills.push('<button onclick="setStatusLista(\'' +s+ '\')" style="padding:4px 10px;border-radius:20px;font-size:var(--text-xs);font-weight:600;border:1.5px solid '+( isActive?st.color:'var(--border)')+';background:'+(isActive?st.bg:'var(--surface)')+';color:'+(isActive?st.color:'var(--muted)')+';cursor:pointer">'+st.label+'</button>');});return pills.join('');})()}
        <div style="width:1px;height:20px;background:var(--border)"></div>
        <button class="btn btn-outline btn-sm" onclick="abrirPrazoCotacao()">${lc('clock',13,'currentColor')} Prazo</button>
        <button class="btn btn-wa btn-sm" onclick="enviarTodasCotacoesWA()">${lc('message-circle',13,'#fff')} Cotar WA</button>
      </div>
    </div>

    ${prazoHtml}
    ${obsPreHtml}

    ${itensCotacao.length ? `
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);
      margin-bottom:8px;display:flex;align-items:center;gap:6px">
      ${lc('building-2',11,'var(--purple)')} Cotação com fornecedor
    </div>
    <div class="card" style="margin-bottom:16px;overflow:hidden">
      <div class="tbl-wrap" style="border:none">
        <table>
          <thead><tr>
            <th style="min-width:180px">Item</th>
            <th class="c" style="width:100px">Qtd</th>
            <th class="c" style="width:48px">Un.</th>
            <th class="r" style="width:110px">Estimado</th>
            <th style="min-width:220px">Fornecedores / Cotações</th>
            <th class="c" style="width:32px"></th>
          </tr></thead>
          <tbody id="cotacaoBody">
            ${itensCotacao.map(i => _rowsItem(i)).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--purple-xlight)">
              <td colspan="3" style="padding:10px 14px;font-weight:700;font-size:var(--text-sm)">Total estimado (fornecedor)</td>
              <td class="r" style="padding:10px 14px;font-weight:800;font-size:var(--text-md);color:var(--purple)">
                R$ ${fmt(itensCotacao.reduce((s,i) => s + i.qtdSelecionada*(i.precoUnitEstimado||0), 0))}
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>` : ''}

    ${itensPresencial.length ? `
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--orange-dark);
      margin-bottom:8px;display:flex;align-items:center;gap:6px">
      ${lc('shopping-cart',11,'currentColor')} Compra presencial (sem cotação)
    </div>
    <div class="card" style="margin-bottom:16px;overflow:hidden;border:1.5px solid var(--yellow)">
      <div style="padding:8px 14px;background:var(--orange-light);border-bottom:1px solid var(--yellow);
        font-size:var(--text-xs);color:var(--orange-dark)">
        ${lc('info',11,'currentColor')} Estes itens não passam por cotação — registre o local e orçamento estimado
      </div>
      ${itensPresencial.map(i => {
        const qtd     = i.qtdAprovada ?? i.qtdSelecionada;
        const totalEst= qtd * (i.precoUnitEstimado || 0);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <div style="font-size:var(--text-sm);font-weight:700">${i.nome}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
          </div>
          <div style="font-size:var(--text-sm);font-family:monospace;color:var(--muted);white-space:nowrap">${fmt(qtd)} ${i.unidade}</div>
          ${totalEst > 0 ? `<div style="font-size:var(--text-sm);font-family:monospace;font-weight:600;color:var(--orange-dark)">~R$ ${fmt(totalEst)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:160px">
            ${lc('map-pin',11,'var(--muted)')}
            <input type="text" value="${i.localCompra||''}" placeholder="Local de compra (ex: Atacadão)"
              style="flex:1;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm)"
              onchange="setSuperCampo(${i.id},'localCompra',this.value)">
          </div>
          <button onclick="desmarcarPresencialCotacao(${i.id})"
            style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);
            color:var(--muted);font-size:var(--text-2xs);font-weight:600;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px">
            ${lc('rotate-ccw',10,'currentColor')} Mover p/ cotação
          </button>
        </div>`;
      }).join('')}
      <div style="padding:10px 14px;background:var(--surface2);display:flex;justify-content:flex-end">
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark)">
          Total estimado presencial: R$ ${fmt(itensPresencial.reduce((s,i) => s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0),0))}
        </span>
      </div>
    </div>` : ''}

    <div class="field" style="margin-bottom:16px">
      <label>Observações gerais</label>
      <textarea class="inp" rows="2" placeholder="Condições de pagamento, urgência..."
        onchange="setObsLista(this.value)">${l.observacoes||''}</textarea>
    </div>

    <div id="paineisForn" style="margin-bottom:16px"></div>

    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-primary" onclick="avancarParaAprovacao()" style="padding:11px 28px;font-size:var(--text-md)">
        Enviar para aprovação ${lc('arrow-right',14,'#fff')}
      </button>
    </div>`;

  if (l.prazoCotacao) _startTimer('timer1', l.prazoCotacao);
  _renderPaineisForn();
}


// ══════════════════════════════════════════════════════════════
// INTELIGÊNCIA DE COTAÇÃO — painéis por fornecedor
// ══════════════════════════════════════════════════════════════

function _addDiasUteis(dataBase, dias) {
  const d = new Date(dataBase);
  let adicionados = 0;
  while (adicionados < dias) {
    d.setDate(d.getDate() + 1);
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) adicionados++;
  }
  return d;
}

function _calcTotalFornecedor(supId) {
  if (!_listaAtual) return 0;
  return _listaAtual.itens.reduce((s, i) => {
    const cot = (i.cotacoes||[]).find(c => c.supId === supId && !c.emFalta && c.precoUnit > 0);
    if (!cot) return s;
    return s + (cot.valorFinal ?? cot.precoUnit * (i.qtdSelecionada||0));
  }, 0);
}

function _verificaJanelaFornecedor(sup) {
  const diasIdx  = ['dom','seg','ter','qua','qui','sex','sab'];
  const diasNome = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const hojeIdx  = new Date().getDay();
  const hojeStr  = diasIdx[hojeIdx];

  const aceitaHoje = !sup.diasPedido?.length || sup.diasPedido.includes(hojeStr);

  let horarioOk  = true;
  let horarioInfo = '';
  if (sup.horarioPedido) {
    const [h, m]  = sup.horarioPedido.split(':').map(Number);
    const agora   = new Date();
    const limite  = new Date(); limite.setHours(h, m, 0, 0);
    horarioOk     = agora < limite;
    if (horarioOk) {
      const diff  = limite - agora;
      const horas = Math.floor(diff / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      horarioInfo = horas > 0 ? `${horas}h${mins}min restantes` : `${mins}min restantes`;
    } else {
      horarioInfo = 'encerrado hoje';
    }
  }

  let proximoDia = '';
  if ((!aceitaHoje || !horarioOk) && sup.diasPedido?.length) {
    for (let offset = 1; offset <= 7; offset++) {
      const idx = (hojeIdx + offset) % 7;
      if (sup.diasPedido.includes(diasIdx[idx])) { proximoDia = diasNome[idx]; break; }
    }
  }

  return { aceitaHoje, horarioOk, horarioInfo, hojeNome: diasNome[hojeIdx], proximoDia };
}

function _sugestoesFornecedor(supId) {
  if (!_listaAtual) return [];
  const jaNoCarrinho = new Set(_listaAtual.itens.map(i => i.itemId).filter(Boolean));
  return items
    .filter(item => {
      const ids = item.supIds?.length ? item.supIds : (item.supId ? [item.supId] : []);
      return ids.includes(supId) && !jaNoCarrinho.has(item.id) && !item.isProd && (item.qty||0) < (item.ideal||0);
    })
    .sort((a, b) => {
      const uA = (a.qty||0) < (a.min||0) ? 0 : 1;
      const uB = (b.qty||0) < (b.min||0) ? 0 : 1;
      if (uA !== uB) return uA - uB;
      return ((a.qty||0) / Math.max(a.ideal||1, 1)) - ((b.qty||0) / Math.max(b.ideal||1, 1));
    })
    .map(item => ({
      item,
      qtdSugerida:   parseFloat(((item.ideal||0) - (item.qty||0)).toFixed(3)),
      custoEstimado: parseFloat((((item.ideal||0) - (item.qty||0)) * (item.cost||0)).toFixed(2)),
      isUrgente:     (item.qty||0) < (item.min||0),
    }));
}

function adicionarSugestaoCarrinho(itemId, supId) {
  const item = items.find(x => x.id === itemId);
  if (!item || !_listaAtual) return;
  if (_listaAtual.itens.some(i => i.itemId === itemId)) { toast('Item já está no carrinho', 'warn'); return; }
  const qtdSugerida = parseFloat(((item.ideal||0) - (item.qty||0)).toFixed(3));
  if (qtdSugerida <= 0) return;
  const newId = Math.max(0, ..._listaAtual.itens.map(x => x.id)) + 1;
  _listaAtual.itens.push({
    id: newId, itemId: item.id, nome: item.name,
    categoria: item.cat||'Geral', unidade: item.unit||'un',
    qtdSugerida, qtdSelecionada: qtdSugerida,
    qtdAprovada: null, qtdComprada: null, qtdRecebida: null,
    estoqueAtual: item.qty||0, estoqueMinimo: item.min||0, estoqueIdeal: item.ideal||0,
    origem: 'sugestao', tipoCompra: 'fornecedor',
    fornecedorId: supId, localCompra: '', diaCompra: '', responsavelCompra: '',
    precoUnitEstimado: item.cost||0, precoUnitFinal: null, valorTotal: 0,
    statusItem: 'pendente', observacoes: 'Sugerido pelo sistema — reposição antecipada',
    cotacoes: [{ supId, precoUnit: null, valorFinal: null, respondido: false, emFalta: false,
      diasPedido: null, dataEntrega: null, formaPagamento: '', boletoDias: null,
      parceladoVezes: null, parceladoFreq: '', obs: '' }],
    aprovado: null, comentarioAprovador: '',
    conferido: false, divergencia: false, comentarioConferencia: '',
    conferidoPor: '', dataRecebimento: '', horaRecebimento: '',
    anexos: [],
  });
  _recalcEstimativa(); saveListas(); _renderEtapa2Cotacao();
  toast(`${item.name} adicionado ao carrinho!`);
}

function togglePainelForn(panelId) {
  const el = document.getElementById(panelId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function _renderPaineisForn() {
  const el = document.getElementById('paineisForn');
  if (!el || !_listaAtual) return;

  const supIds = [...new Set(
    _listaAtual.itens.flatMap(i => (i.cotacoes||[]).map(c => c.supId))
  )].filter(Boolean);

  if (!supIds.length) { el.innerHTML = ''; return; }

  const diasIdx  = ['dom','seg','ter','qua','qui','sex','sab'];
  const diasLabel = { seg:'Seg', ter:'Ter', qua:'Qua', qui:'Qui', sex:'Sex', sab:'Sáb' };
  const nomesDias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  el.innerHTML = `
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);
      margin-bottom:10px;display:flex;align-items:center;gap:6px">
      ${lc('zap',12,'var(--purple)')} Inteligência por fornecedor
    </div>
    ${supIds.map(supId => {
      const sup = suppliers.find(s => s.id === supId);
      if (!sup) return '';

      const totalValor  = _calcTotalFornecedor(supId);
      const janela      = _verificaJanelaFornecedor(sup);
      const sugestoes   = _sugestoesFornecedor(supId);
      const atingiuMin  = !sup.pedidoMinimo || totalValor >= sup.pedidoMinimo;
      const faltaMin    = sup.pedidoMinimo ? Math.max(0, sup.pedidoMinimo - totalValor) : 0;
      const pctMin      = sup.pedidoMinimo ? Math.min(100, Math.round(totalValor / sup.pedidoMinimo * 100)) : 100;
      const janelaOk    = janela.aceitaHoje && janela.horarioOk;
      const alertCount  = ((!atingiuMin && sup.pedidoMinimo) ? 1 : 0) + (!janelaOk ? 1 : 0);
      const panelId     = `pforn-${supId}`;

      let entregaEstimada = '';
      if (sup.prazoEntregaDias) {
        const d = _addDiasUteis(new Date(), sup.prazoEntregaDias);
        entregaEstimada = `${fmtD(d.toISOString())} (${nomesDias[d.getDay()]})`;
      }

      const borderColor = !atingiuMin && sup.pedidoMinimo ? 'var(--red)'
        : !janelaOk ? 'var(--yellow)'
        : 'var(--border)';

      return `<div style="border:1.5px solid ${borderColor};border-radius:var(--r10);overflow:hidden;margin-bottom:8px">

        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
          background:var(--surface2);cursor:pointer" onclick="togglePainelForn('${panelId}')">
          <div style="flex:1;font-size:var(--text-sm);font-weight:700;display:flex;align-items:center;gap:7px">
            ${lc('building-2',13,'var(--purple)')} ${sup.name}
            ${sup.seller ? `<span style="font-size:var(--text-xs);color:var(--muted);font-weight:500">${sup.seller}</span>` : ''}
          </div>
          <div style="display:flex;gap:5px;align-items:center">
            ${sup.pedidoMinimo ? (atingiuMin
              ? `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--green-light);color:var(--green);border:1px solid var(--green);font-weight:600;white-space:nowrap">${lc('check',9,'currentColor')} Mín OK</span>`
              : `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--red-light);color:var(--red);border:1px solid var(--red);font-weight:700;white-space:nowrap">${lc('alert-circle',9,'currentColor')} Falta R$${fmt(faltaMin)}</span>`
            ) : ''}
            ${janelaOk
              ? `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--green-light);color:var(--green);border:1px solid var(--green);font-weight:600;white-space:nowrap">${lc('clock',9,'currentColor')} Aberto</span>`
              : `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--yellow-light);color:var(--orange-dark);border:1px solid var(--yellow);font-weight:700;white-space:nowrap">${lc('clock',9,'currentColor')} ${!janela.aceitaHoje ? 'Sem pedido hoje' : 'Encerrado'}</span>`
            }
          </div>
          ${lc('chevron-down',13,'var(--muted)')}
        </div>

        <div id="${panelId}" style="display:none;padding:14px 16px;display:flex;flex-direction:column;gap:14px">

          <div>
            <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">Janela de pedido</div>
            ${sup.diasPedido?.length ? `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <div style="display:flex;gap:3px">
                ${['seg','ter','qua','qui','sex','sab'].map(d => {
                  const hojeD = diasIdx[new Date().getDay()];
                  const active = sup.diasPedido.includes(d);
                  const isHoje = hojeD === d;
                  return `<span style="width:30px;height:22px;border-radius:var(--r6);display:inline-flex;align-items:center;justify-content:center;font-size:var(--text-2xs);font-weight:700;
                    background:${active&&isHoje?'var(--purple)':active?'var(--purple-xlight)':'var(--surface2)'};
                    color:${active&&isHoje?'#fff':active?'var(--purple)':'var(--muted)'};
                    border:1.5px solid ${active&&isHoje?'var(--purple)':active?'var(--purple-light)':'var(--border)'}">${diasLabel[d]}</span>`;
                }).join('')}
              </div>
              ${janela.aceitaHoje
                ? `<span style="font-size:var(--text-xs);font-weight:600;color:var(--green);display:flex;align-items:center;gap:4px">${lc('check-circle',12,'currentColor')} Aceita pedido hoje (${janela.hojeNome})</span>`
                : `<span style="font-size:var(--text-xs);font-weight:600;color:var(--orange-dark);display:flex;align-items:center;gap:4px">${lc('x-circle',12,'currentColor')} Sem pedido hoje${janela.proximoDia ? ` · Próximo: <strong style="margin-left:3px">${janela.proximoDia}</strong>` : ''}</span>`
              }
            </div>` : `<div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:6px">${lc('calendar',11,'currentColor')} Aceita pedido qualquer dia da semana</div>`}

            ${sup.horarioPedido ? `
            <div style="font-size:var(--text-xs);display:flex;align-items:center;gap:6px;margin-bottom:4px">
              ${janela.horarioOk
                ? `${lc('clock',12,'var(--green)')} <span style="color:var(--green);font-weight:600">Até ${sup.horarioPedido}</span> <span style="color:var(--muted)">(${janela.horarioInfo})</span>`
                : `${lc('clock',12,'var(--red)')} <span style="color:var(--red);font-weight:600">Horário encerrado (${sup.horarioPedido})</span> <span style="color:var(--muted)">— pedir no próximo dia</span>`
              }
            </div>` : ''}

            ${entregaEstimada ? `
            <div style="font-size:var(--text-xs);display:flex;align-items:center;gap:6px;color:var(--text2)">
              ${lc('truck',12,'var(--muted)')} Entrega estimada: <strong>${entregaEstimada}</strong>
              ${sup.antecedenciaMinDias > 0 ? `<span style="color:var(--muted)">(mín. ${sup.antecedenciaMinDias}d de antecedência)</span>` : ''}
            </div>` : ''}
          </div>

          ${sup.pedidoMinimo ? `
          <div>
            <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">Pedido mínimo</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:4px">
              <span style="font-size:var(--text-sm);color:var(--muted)">Mínimo: <strong style="color:var(--text)">${sup.pedidoMinTipo==='peso' ? fmt(sup.pedidoMinimo)+' kg/un' : 'R$ '+fmt(sup.pedidoMinimo)}</strong></span>
              <span style="font-size:var(--text-sm);font-weight:800;color:${atingiuMin?'var(--green)':'var(--red)'}">
                R$ ${fmt(totalValor)}
                <span style="font-size:var(--text-2xs);font-weight:500;color:var(--muted)">${atingiuMin ? '— mínimo atingido' : `— faltam R$${fmt(faltaMin)}`}</span>
              </span>
            </div>
            <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;border:1px solid var(--border)">
              <div style="height:100%;width:${pctMin}%;background:${atingiuMin?'var(--green)':pctMin>60?'var(--yellow)':'var(--red)'};border-radius:4px;transition:width .4s"></div>
            </div>
            ${totalValor === 0 ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${lc('info',10,'var(--muted)')} Preencha os preços das cotações para calcular o total</div>` : ''}
          </div>` : ''}

          ${sugestoes.length > 0 ? `
          <div>
            <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:5px">
              ${lc('plus-circle',11,'var(--purple)')}
              ${!atingiuMin && sup.pedidoMinimo ? 'Adicionar itens para atingir o pedido mínimo' : 'Outros itens deste fornecedor com estoque abaixo do ideal'}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${sugestoes.slice(0, 5).map(({ item, qtdSugerida, custoEstimado, isUrgente }) => {
                const pctEst = item.ideal > 0 ? Math.round((item.qty||0) / item.ideal * 100) : 0;
                const novoTotal = totalValor + custoEstimado;
                const completaria = sup.pedidoMinimo && !atingiuMin && novoTotal >= sup.pedidoMinimo;
                return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
                  background:${isUrgente?'var(--red-light)':'var(--surface2)'};
                  border:1.5px solid ${isUrgente?'var(--red)':completaria?'var(--green)':'var(--border)'};
                  border-radius:var(--r8);flex-wrap:wrap">
                  <div style="flex:1;min-width:110px">
                    <div style="font-size:var(--text-sm);font-weight:700;display:flex;align-items:center;gap:5px">
                      ${isUrgente ? lc('alert-circle',11,'var(--red)') : ''}
                      ${item.name}
                      ${isUrgente ? `<span style="font-size:var(--text-2xs);padding:1px 5px;border-radius:8px;background:var(--red);color:#fff;font-weight:700">Crítico</span>` : ''}
                      ${completaria ? `<span style="font-size:var(--text-2xs);padding:1px 5px;border-radius:8px;background:var(--green);color:#fff;font-weight:700">${lc('check',8,'#fff')} Completa o mín.</span>` : ''}
                    </div>
                    <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px">
                      Estoque: ${fmt(item.qty||0)} ${item.unit} · Ideal: ${fmt(item.ideal||0)} ${item.unit}
                      <span style="font-weight:600;color:${isUrgente?'var(--red)':'var(--orange-dark)'}"> (${pctEst}%)</span>
                    </div>
                  </div>
                  <div style="text-align:right;min-width:64px">
                    <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple)">+ ${fmt(qtdSugerida)} ${item.unit}</div>
                    ${custoEstimado > 0 ? `<div style="font-size:var(--text-2xs);color:var(--muted)">~R$${fmt(custoEstimado)}</div>` : ''}
                  </div>
                  <button onclick="adicionarSugestaoCarrinho(${item.id},${supId})"
                    style="padding:5px 10px;border-radius:var(--r6);border:1.5px solid var(--purple-light);
                    background:var(--purple-xlight);color:var(--purple);font-size:var(--text-xs);font-weight:700;
                    cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px">
                    ${lc('plus',11,'currentColor')} Adicionar
                  </button>
                </div>`;
              }).join('')}
              ${sugestoes.length > 5 ? `<div style="font-size:var(--text-xs);color:var(--muted);text-align:center;padding:4px">${lc('more-horizontal',11,'var(--muted)')} +${sugestoes.length - 5} itens com estoque baixo deste fornecedor</div>` : ''}
            </div>
          </div>` : ''}

          ${sup.aviso ? `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;
            background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8)">
            ${lc('alert-triangle',13,'var(--orange-dark)')}
            <span style="font-size:var(--text-sm);color:var(--orange-dark);font-weight:600;line-height:1.4">${sup.aviso}</span>
          </div>` : ''}

        </div>
      </div>`;
    }).join('')}`;
}

// ══════════════════════════════════════════════════════════════
// ETAPA 4 — APROVAÇÃO FINAL (compacta, vencedor já escolhido)
// ══════════════════════════════════════════════════════════════

function _renderAprovacaoFinal() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (u && !['gerente', 'supervisor'].includes(u.role)) {
    _renderAguardandoAprovacao('final');
    return;
  }

  const l = _listaAtual;
  // Inicializa flags de aprovação individual
  l.itens.forEach(i => { if (i.aprovacaoFinalGestor === undefined) i.aprovacaoFinalGestor = null; });

  const itensForn       = l.itens.filter(i => i.tipoCompra !== 'presencial');
  const itensPresencial = l.itens.filter(i => i.tipoCompra === 'presencial');
  const totalAprov      = itensForn
    .filter(i => i.aprovacaoFinalGestor !== false)
    .reduce((s,i) => s + (i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||0), 0);

  const nAprov    = itensForn.filter(i => i.aprovacaoFinalGestor === true).length;
  const nReprov   = itensForn.filter(i => i.aprovacaoFinalGestor === false).length;
  const nPendente = itensForn.filter(i => i.aprovacaoFinalGestor === null).length;
  const podeConcluir = nPendente === 0 && nAprov > 0;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">
          ${lc('check-circle',14,'var(--purple)')} Aprovação final · ${l.codigo}
        </h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">
          ${l.aprovadorNome
            ? `${lc('user',11,'var(--purple)')} <span style="color:var(--purple);font-weight:600">${l.aprovadorNome}</span> · responsável por esta etapa`
            : 'Aprove ou reprove cada item individualmente antes de gerar as Ordens de Compra'}
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa2Cotacao()">${lc('arrow-left',13)} Cotação</button>
        <button class="btn btn-outline btn-sm" onclick="abrirConfigAprovador()">${lc('user',13,'currentColor')} Trocar aprovador</button>
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:18px">
      <div style="padding:10px 14px;background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--purple)">R$ ${fmt(totalAprov)}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">Total aprovado</div>
      </div>
      <div style="padding:10px 14px;background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--green)">${nAprov}</div>
        <div style="font-size:var(--text-2xs);color:var(--green)">${lc('check',9,'currentColor')} Aprovados</div>
      </div>
      <div style="padding:10px 14px;background:var(--red-light);border:1.5px solid var(--red);border-radius:var(--r10);text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--red)">${nReprov}</div>
        <div style="font-size:var(--text-2xs);color:var(--red)">${lc('x',9,'currentColor')} Reprovados</div>
      </div>
      <div style="padding:10px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--muted)">${nPendente}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">${lc('clock',9,'currentColor')} Pendentes</div>
      </div>
      ${itensPresencial.length ? `<div style="padding:10px 14px;background:var(--orange-light);border:1.5px solid var(--yellow);border-radius:var(--r10);text-align:center">
        <div style="font-size:1.05rem;font-weight:800;color:var(--orange-dark)">${itensPresencial.length}</div>
        <div style="font-size:var(--text-2xs);color:var(--orange-dark)">${lc('shopping-cart',9,'currentColor')} Presencial</div>
      </div>` : ''}
    </div>

    <!-- Cards de itens com fornecedor -->
    ${itensForn.length ? `
    <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <span>${lc('building-2',10,'var(--purple)')} Itens com fornecedor</span>
      ${nPendente > 0 ? `<button onclick="aprovarTodosItensFinais()"
        style="font-size:var(--text-xs);font-weight:700;padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--green);background:var(--green-light);color:var(--green);cursor:pointer;display:flex;align-items:center;gap:4px">
        ${lc('check-check',10,'currentColor')} Aprovar todos
      </button>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
      ${itensForn.map(i => _rowAprovFinal(i)).join('')}
    </div>` : ''}

    <!-- Itens presenciais -->
    ${itensPresencial.length ? `
    <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--orange-dark);margin-bottom:8px;display:flex;align-items:center;gap:6px">
      ${lc('shopping-cart',10,'currentColor')} Compra presencial
    </div>
    <div class="card" style="overflow:hidden;margin-bottom:18px;border:1.5px solid var(--yellow)">
      ${itensPresencial.map(i => {
        const qtd = i.qtdAprovada ?? i.qtdSelecionada;
        const est = qtd * (i.precoUnitEstimado || 0);
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)">
          <div style="width:3px;align-self:stretch;background:var(--yellow);border-radius:2px;flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-size:var(--text-sm);font-weight:700">${i.nome}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
          </div>
          <div style="font-size:var(--text-sm);font-family:monospace;color:var(--muted)">${fmt(qtd)} ${i.unidade}</div>
          ${i.localCompra ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc('map-pin',10,'var(--muted)')} ${i.localCompra}</div>` : ''}
          ${est > 0 ? `<div style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark);font-family:monospace">~R$ ${fmt(est)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Rodapé de ação -->
    <div style="position:sticky;bottom:0;background:var(--surface);border-top:1.5px solid var(--border);
      padding:14px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <button onclick="reprovarListaFinal()"
        style="padding:9px 18px;border-radius:var(--r8);border:1.5px solid var(--red);background:var(--red-light);
        color:var(--red);font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:Inter,sans-serif">
        ${lc('rotate-ccw',14,'currentColor')} Devolver para revisão
      </button>
      <div style="display:flex;align-items:center;gap:10px">
        ${!podeConcluir ? `<span style="font-size:var(--text-xs);color:var(--muted)">${lc('clock',12,'var(--muted)')} ${nPendente} item(s) pendente(s)</span>` : ''}
        <button onclick="${podeConcluir ? 'aprovarListaFinal()' : 'void(0)'}"
          style="padding:11px 28px;border-radius:var(--r10);border:none;font-size:var(--text-md);font-weight:800;font-family:Inter,sans-serif;
          background:${podeConcluir ? 'var(--green)' : 'var(--surface2)'};
          color:${podeConcluir ? '#fff' : 'var(--muted)'};cursor:${podeConcluir ? 'pointer' : 'not-allowed'};
          display:flex;align-items:center;gap:8px">
          ${lc('check-circle',18,podeConcluir ? '#fff' : 'var(--muted)')} Aprovar e gerar OC
        </button>
      </div>
    </div>`;
}

function _rowAprovFinal(i) {
  const qtd      = i.qtdAprovada ?? i.qtdSelecionada;
  const cots     = (i.cotacoes||[]).filter(c => !c.emFalta && c.precoUnit > 0);
  const selSupId = i.fornecedorId || cots[0]?.supId;
  const selCot   = cots.find(c => c.supId === selSupId) || cots[0];
  const selSup   = selCot ? suppliers.find(s => s.id === selCot.supId) : null;
  const outras   = cots.filter(c => c.supId !== selSupId);
  const total    = qtd * (selCot?.precoUnit || 0);
  const status   = i.aprovacaoFinalGestor;

  const borderColor = status === true ? 'var(--green)' : status === false ? 'var(--red)' : 'var(--border)';
  const bgColor     = status === true ? 'var(--green-light)' : status === false ? 'var(--red-light)' : 'var(--surface)';

  const statusBadge = status === true
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--green);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px;white-space:nowrap">${lc('check',9,'#fff')} Aprovado</span>`
    : status === false
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--red);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px;white-space:nowrap">${lc('x',9,'#fff')} Reprovado</span>`
    : `<span style="padding:2px 9px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);font-size:var(--text-2xs);font-weight:600;white-space:nowrap">Pendente</span>`;

  const minPrice = cots.length > 1 ? Math.min(...cots.map(c => c.precoUnit)) : null;
  const criterio = cots.length > 1
    ? (selCot?.precoUnit === minPrice
      ? `<span style="font-size:var(--text-2xs);padding:1px 5px;border-radius:8px;background:#dcfce7;color:#16a34a;border:1px solid #86efac">${lc('trending-down',8,'currentColor')} menor preço</span>`
      : `<span style="font-size:var(--text-2xs);padding:1px 5px;border-radius:8px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)">${lc('user',8,'currentColor')} escolha do comprador</span>`)
    : '';

  const varHtml = (() => {
    if (!selCot || !i.precoUnitEstimado) return '';
    const diff = ((selCot.precoUnit - i.precoUnitEstimado) / i.precoUnitEstimado) * 100;
    const abs  = Math.abs(diff).toFixed(1);
    if (Math.abs(diff) < 0.5) return `<span style="font-size:var(--text-xs);color:var(--muted);font-family:monospace">= vs est.</span>`;
    const cheaper = diff < 0;
    return `<span style="font-size:var(--text-xs);font-weight:700;color:${cheaper?'var(--green)':'var(--red)'};font-family:monospace;display:inline-flex;align-items:center;gap:2px">
      ${cheaper ? lc('arrow-down',10,'currentColor') : lc('arrow-up',10,'currentColor')} ${abs}% vs est.
    </span>`;
  })();

  const altId  = `af-alt-${i.id}`;
  const histId = `af-hist-${i.id}`;

  const histPrecos = (typeof priceHistory !== 'undefined')
    ? priceHistory
        .filter(h => h.itemId == i.itemId)
        .sort((a,b) => new Date(b.data) - new Date(a.data))
        .slice(0, 4)
    : [];

  const histHtml = histPrecos.length
    ? `<div style="border-top:1px solid ${borderColor}22;padding:4px 12px 5px 20px;background:${bgColor}">
        <button onclick="toggleAltAprov('${histId}')" id="btn-${histId}"
          style="font-size:var(--text-2xs);padding:2px 8px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:3px">
          ${lc('history',9,'currentColor')} Histórico de preços (${histPrecos.length})
        </button>
        <div id="${histId}" style="display:none;margin-top:5px;margin-bottom:3px">
          <div style="display:flex;flex-direction:column;gap:3px">
            ${histPrecos.map(h => {
              const currPreco = selCot?.precoUnit || 0;
              const diff = currPreco && h.precoUnit ? ((currPreco - h.precoUnit) / h.precoUnit * 100) : null;
              const diffStr = diff !== null && Math.abs(diff) > 0.5
                ? `<span style="font-size:var(--text-2xs);font-weight:700;color:${diff > 0 ? 'var(--red)' : 'var(--green)'};font-family:monospace">${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs agora</span>`
                : '';
              return `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--surface);border-radius:var(--r6)">
                <span style="font-size:var(--text-2xs);color:var(--muted);white-space:nowrap">${fmtD(h.data)}</span>
                <span style="font-size:var(--text-xs);font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.fornecedorNome}</span>
                ${h.marca ? `<span style="font-size:var(--text-2xs);padding:1px 5px;background:var(--purple-xlight);color:var(--purple);border-radius:8px">${h.marca}</span>` : ''}
                <span style="font-size:var(--text-xs);font-weight:800;font-family:monospace;white-space:nowrap">R$ ${fmt(h.precoUnit)}</span>
                ${diffStr}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`
    : '';

  return `<div style="border:1.5px solid ${borderColor};border-radius:var(--r8);background:${bgColor};overflow:hidden">
    <!-- Linha principal compacta -->
    <div style="display:flex;align-items:center;gap:0;min-height:44px;${isMobile()?'overflow-x:auto;':''}">
      <!-- Barra lateral de status -->
      <div style="width:4px;align-self:stretch;background:${borderColor};flex-shrink:0"></div>

      <!-- Nome + info -->
      <div style="padding:8px 12px;min-width:160px;flex:1.5">
        <div style="font-size:var(--text-sm);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.nome}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px">${i.categoria} · <span style="font-family:monospace">${fmt(qtd)} ${i.unidade}</span></div>
      </div>

      <!-- Fornecedor -->
      <div style="padding:8px 10px;min-width:120px;border-left:1px solid ${borderColor}33">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Fornecedor</div>
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple);display:flex;align-items:center;gap:3px;flex-wrap:wrap">
          ${selSup?.name || '—'}
          ${criterio}
        </div>
      </div>

      <!-- Marca -->
      ${selCot?.marca ? `<div style="padding:8px 10px;border-left:1px solid ${borderColor}33">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Marca</div>
        <span style="font-size:var(--text-xs);font-weight:700;padding:1px 7px;border-radius:10px;background:var(--purple-xlight);color:var(--purple);border:1px solid var(--purple-light);white-space:nowrap">${selCot.marca}</span>
      </div>` : ''}

      <!-- Pagamento -->
      ${selCot?.formaPagamento ? `<div style="padding:8px 10px;border-left:1px solid ${borderColor}33">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Pagamento</div>
        <div style="font-size:var(--text-xs);font-weight:600;white-space:nowrap">${_labelPagamento(selCot)}</div>
      </div>` : ''}

      <!-- Entrega -->
      ${selCot?.dataEntrega ? `<div style="padding:8px 10px;border-left:1px solid ${borderColor}33">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Entrega</div>
        <div style="font-size:var(--text-xs);font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:3px">${lc('truck',10,'var(--muted)')} ${fmtD(selCot.dataEntrega)}</div>
      </div>` : ''}

      <!-- Preço + variação -->
      <div style="padding:8px 10px;border-left:1px solid ${borderColor}33;text-align:right">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Preço unit.</div>
        <div style="font-size:var(--text-sm);font-weight:700;font-family:monospace;white-space:nowrap">R$ ${fmt(selCot?.precoUnit||0)}</div>
        ${varHtml ? `<div style="margin-top:1px">${varHtml}</div>` : ''}
      </div>

      <!-- Total -->
      <div style="padding:8px 12px;border-left:1px solid ${borderColor}33;text-align:right">
        <div style="font-size:var(--text-2xs);text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Total</div>
        <div style="font-size:var(--text-sm);font-weight:800;font-family:monospace;color:var(--purple);white-space:nowrap">R$ ${fmt(total)}</div>
      </div>

      <!-- Ações + status -->
      <div style="padding:6px 10px;border-left:1px solid ${borderColor}33;display:flex;align-items:center;gap:5px;flex-shrink:0">
        <button onclick="reprovarItemFinalGestor('${i.id}')"
          style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid ${status===false?'var(--red)':'var(--border)'};
          background:${status===false?'var(--red)':'var(--surface)'};color:${status===false?'#fff':'var(--text2)'};
          font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:3px;white-space:nowrap">
          ${lc('x',10,status===false?'#fff':'currentColor')} Reprovar
        </button>
        <button onclick="aprovarItemFinal('${i.id}')"
          style="padding:4px 12px;border-radius:var(--r6);border:none;
          background:${status===true?'var(--green)':'var(--purple)'};color:#fff;
          font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:3px;white-space:nowrap">
          ${lc('check',10,'#fff')} ${status===true?'Aprovado':'Aprovar'}
        </button>
        ${statusBadge}
      </div>
    </div>

    <!-- Outras propostas (expansível) -->
    ${outras.length > 0 ? `
    <div style="border-top:1px solid ${borderColor}22;padding:4px 12px 5px 20px;background:${bgColor}">
      <button onclick="toggleAltAprov('${altId}')" id="btn-${altId}"
        style="font-size:var(--text-2xs);padding:2px 8px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:3px">
        ${lc('chevron-down',9,'currentColor')} ${outras.length} outra${outras.length>1?'s':''} proposta${outras.length>1?'s':''}
      </button>
      <div id="${altId}" style="display:none;margin-top:5px;margin-bottom:3px">
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${outras.map(cot => {
            const s = suppliers.find(x => x.id === cot.supId);
            const isBetter = cot.precoUnit < (selCot?.precoUnit || Infinity);
            return `<button onclick="selecionarFornAprovacao('${i.id}','${cot.supId}')"
              style="padding:4px 9px;border-radius:var(--r6);border:1.5px solid ${isBetter?'var(--green)':'var(--border)'};
              background:${isBetter?'var(--green-light)':'var(--surface)'};cursor:pointer;font-size:var(--text-xs);font-family:Inter,sans-serif">
              <span style="font-weight:700">${s?.name||'?'}</span>
              <span style="color:var(--muted);margin-left:4px">R$ ${fmt(cot.precoUnit)}/${i.unidade}</span>
              ${isBetter ? lc('trending-down',9,'var(--green)') : ''}
            </button>`;
          }).join('')}
        </div>
      </div>
    </div>` : ''}
    ${histHtml}
  </div>`;
}

function aprovarItemFinal(itemId) {
  const i = _listaAtual.itens.find(x => String(x.id) === String(itemId));
  if (!i) return;
  i.aprovacaoFinalGestor = i.aprovacaoFinalGestor === true ? null : true;
  saveListas(); _renderAprovacaoFinal();
}

function reprovarItemFinalGestor(itemId) {
  const i = _listaAtual.itens.find(x => String(x.id) === String(itemId));
  if (!i) return;
  i.aprovacaoFinalGestor = i.aprovacaoFinalGestor === false ? null : false;
  saveListas(); _renderAprovacaoFinal();
}

function aprovarTodosItensFinais() {
  _listaAtual.itens.filter(i => i.tipoCompra !== 'presencial' && i.aprovacaoFinalGestor === null)
    .forEach(i => { i.aprovacaoFinalGestor = true; });
  saveListas(); _renderAprovacaoFinal();
}

function toggleAltAprov(id) {
  const el  = document.getElementById(id);
  const btn = document.getElementById('btn-' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (btn) {
    const n = btn.textContent.match(/\d+/)?.[0] || '';
    btn.innerHTML = open
      ? `${lc('chevron-down',10,'currentColor')} ${n} outra${n>1?'s':''} proposta${n>1?'s':''}`
      : `${lc('chevron-up',10,'currentColor')} fechar`;
  }
}

function aprovarListaFinal() {
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  // Remove itens reprovados pelo gestor na aprovação final
  _listaAtual.itens = _listaAtual.itens.filter(i =>
    i.tipoCompra === 'presencial' || i.aprovacaoFinalGestor !== false
  );
  _listaAtual.status        = 'aprovada';
  _listaAtual.etapa         = 5;
  _listaAtual.dataAprovacao = new Date().toISOString();
  _listaAtual.aprovadoPor   = _listaAtual.aprovadorNome || u?.name || '';
  _listaAtual.valorAprovado = _listaAtual.itens.reduce(
    (s,i) => s + (i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0), 0);
  saveListas();
  if (typeof criarAlerta === 'function') criarAlerta({
    tipo: 'compras_aprovada',
    titulo: 'Compra aprovada',
    mensagem: `Lista ${_listaAtual.codigo} foi aprovada. Gere as Ordens de Compra e acompanhe o recebimento.`,
    modulo: 'compras',
    destino_roles: ['comprador'],
    referencia_id: String(_listaAtual.id),
    acao_label: 'Ver OCs',
    acao_modulo: 'compras',
  });
  _renderDashCompras(); _renderOCPorFornecedor(); toast('Lista aprovada! Gere as Ordens de Compra.');
}

function reprovarListaFinal() {
  vtpConfirm({
    title: 'Devolver para cotação',
    message: 'A lista voltará para revisão de cotação.',
    confirmLabel: 'Devolver',
    onConfirm: () => {
      _listaAtual.status = 'cotacao'; _listaAtual.etapa = 3;
      saveListas();
      if (typeof criarAlerta === 'function') criarAlerta({
        tipo: 'compras_devolvida_cotacao',
        titulo: 'Cotação devolvida para revisão',
        mensagem: `Lista ${_listaAtual.codigo} foi devolvida pelo gestor. Revise a cotação e reenvie.`,
        modulo: 'compras',
        destino_roles: ['comprador'],
        referencia_id: String(_listaAtual.id),
        acao_label: 'Ver cotação',
        acao_modulo: 'compras',
      });
      _renderDashCompras(); _renderEtapa2Cotacao(); toast('Lista devolvida para cotação.', 'warn');
    }
  });
}

function _cardAprovacaoItem(i, isPresencial) {
  const qtd = i.qtdAprovada ?? i.qtdSelecionada;
  const isAprov = i.aprovado === true, isReprov = i.aprovado === false;
  const borderColor = isAprov ? 'var(--green)' : isReprov ? 'var(--red)' : 'var(--border)';
  const bgColor = isAprov ? 'var(--green-light)' : isReprov ? 'var(--red-light)' : 'var(--surface)';

  const statusBadge = isAprov
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--green);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px">${lc('check',10,'#fff')} Aprovado</span>`
    : isReprov
    ? `<span style="padding:2px 9px;border-radius:10px;background:var(--red);color:#fff;font-size:var(--text-2xs);font-weight:700;display:inline-flex;align-items:center;gap:3px">${lc('x',10,'#fff')} Reprovado</span>`
    : `<span style="padding:2px 9px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);font-size:var(--text-2xs);font-weight:600">Pendente</span>`;

  const header = `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1.5px solid ${borderColor}44;flex-wrap:wrap">
      <div style="width:4px;align-self:stretch;min-height:32px;background:${isAprov?'var(--green)':isReprov?'var(--red)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:120px">
        <div style="font-size:var(--text-md);font-weight:700">${i.nome}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          ${(()=>{ const e=_qEmb(i,qtd); return e
            ? `<span style="font-family:monospace;font-weight:800;color:var(--purple);font-size:var(--text-xs)">${e.embs} ${e.uc}</span><span style="color:var(--border)">·</span><span style="font-family:monospace">${fmt(qtd)} ${i.unidade}</span>`
            : `<span style="font-family:monospace">${fmt(qtd)} ${i.unidade}</span>`;
          })()}
          <span style="color:var(--border)">·</span>
          ${isPresencial ? lc('shopping-cart',10,'var(--muted)')+' Compra presencial' : lc('building-2',10,'var(--muted)')+' Cotação com fornecedor'}
        </div>
      </div>
      ${statusBadge}
    </div>`;

  const actionFooter = (selectedSupName) => `
    <div style="padding:8px 14px 10px;border-top:1px solid ${borderColor}33;display:flex;gap:7px;align-items:center;flex-wrap:wrap">
      ${isReprov && i.acaoReprovacao ? `<div style="padding:3px 8px;background:var(--red-light);border:1px solid var(--red);border-radius:var(--r6);font-size:var(--text-xs);color:var(--red);font-weight:600;white-space:nowrap">${lc('arrow-right',9,'currentColor')} ${_labelAcao[i.acaoReprovacao]||i.acaoReprovacao}</div>` : ''}
      <input type="text" placeholder="Comentário do aprovador..." value="${i.comentarioAprovador||''}"
        style="flex:1;min-width:120px;padding:5px 9px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);background:var(--surface)"
        onchange="setComentarioAprovador(${i.id},this.value)">
      <button onclick="reprovarItem2(${i.id})"
        style="padding:5px 10px;border-radius:var(--r8);border:1.5px solid ${isReprov?'var(--red)':'var(--border)'};
        background:${isReprov?'var(--red)':'var(--surface)'};color:${isReprov?'#fff':'var(--text2)'};
        font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:3px">
        ${lc('x',11,'currentColor')} Reprovar
      </button>
      <button onclick="aprovarItem2(${i.id})"
        style="padding:5px 11px;border-radius:var(--r8);border:1.5px solid ${isAprov?'var(--green)':'var(--purple)'};
        background:${isAprov?'var(--green)':'var(--purple)'};color:#fff;
        font-size:var(--text-xs);font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:3px">
        ${lc('check',11,'#fff')} ${isAprov?'Aprovado':'Aprovar'}${selectedSupName?' — '+selectedSupName:''}
      </button>
    </div>`;

  // Presencial card
  if (isPresencial) {
    const preco = i.precoUnitFinal || i.precoUnitEstimado || 0;
    const total = qtd * preco;
    return `<div style="border:1.5px solid ${borderColor};border-radius:var(--r10);background:${bgColor};overflow:hidden">
      ${header}
      <div style="padding:10px 14px 8px 20px;display:flex;gap:18px;flex-wrap:wrap">
        <div><div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Orçamento máx.</div><div style="font-size:var(--text-md);font-weight:800;color:var(--orange-dark);font-family:monospace">R$ ${fmt(preco)}/unit</div></div>
        <div><div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Total</div><div style="font-size:var(--text-md);font-weight:800;color:var(--purple);font-family:monospace">R$ ${fmt(total)}</div></div>
        ${i.localCompra ? `<div><div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Local</div><div style="font-size:var(--text-sm);font-weight:600">${i.localCompra}</div></div>` : ''}
      </div>
      ${actionFooter('')}
    </div>`;
  }

  // With suppliers
  const cots = (i.cotacoes||[]).filter(c => !c.emFalta && c.precoUnit > 0);
  const cotsEmFalta = (i.cotacoes||[]).filter(c => c.emFalta);

  if (!cots.length) {
    return `<div style="border:1.5px solid var(--red);border-radius:var(--r10);overflow:hidden">
      ${header}
      <div style="padding:12px 14px 12px 20px;font-size:var(--text-sm);color:var(--red);font-weight:600;display:flex;align-items:center;gap:6px">
        ${lc('alert-circle',13,'currentColor')} Nenhuma cotação com preço — volte à etapa de cotação.
      </div>
    </div>`;
  }

  const minPrice = Math.min(...cots.map(c => c.precoUnit));
  const cotsComEntrega = cots.filter(c => c.dataEntrega);
  const minEntrega = cotsComEntrega.length > 1
    ? cotsComEntrega.reduce((a,b) => a.dataEntrega <= b.dataEntrega ? a : b).dataEntrega
    : null;
  const melhorPgtoOrder = ['boleto','parcelado','cartao','pix',''];
  const melhorPgtoCot = cots.length > 1
    ? cots.slice().sort((a,b) => melhorPgtoOrder.indexOf(a.formaPagamento||'') - melhorPgtoOrder.indexOf(b.formaPagamento||''))[0]
    : null;
  const isMelhorPgtoReal = melhorPgtoCot && ['boleto','parcelado'].includes(melhorPgtoCot.formaPagamento);

  const selectedSupId = i.fornecedorId || cots[0].supId;
  const selectedCot = cots.find(c => c.supId === selectedSupId) || cots[0];
  const selectedSup = suppliers.find(s => s.id === selectedCot?.supId);

  const cotCards = cots.map(cot => {
    const sup = suppliers.find(s => s.id === cot.supId);
    const total = cot.valorFinal ?? qtd * cot.precoUnit;
    const isSelected = cot.supId === selectedSupId;
    const isBestPrice = cots.length > 1 && cot.precoUnit === minPrice;
    const isFastest = minEntrega && cot.dataEntrega === minEntrega;
    const isBestPgto = isMelhorPgtoReal && melhorPgtoCot && cot.supId === melhorPgtoCot.supId;

    const badges = [
      isBestPrice ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 5px;border-radius:8px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;display:inline-flex;align-items:center;gap:2px">${lc('trending-down',8,'currentColor')} Menor preço</span>` : '',
      isFastest   ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 5px;border-radius:8px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;display:inline-flex;align-items:center;gap:2px">${lc('zap',8,'currentColor')} Mais rápido</span>` : '',
      isBestPgto  ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 5px;border-radius:8px;background:var(--purple-xlight);color:var(--purple);border:1px solid var(--purple-light);display:inline-flex;align-items:center;gap:2px">${lc('credit-card',8,'currentColor')} Melhor pgto</span>` : '',
    ].filter(Boolean).join('');

    return `<div
      style="border:2px solid ${isSelected?'var(--purple)':'var(--border)'};border-radius:var(--r8);padding:10px 12px;
        background:${isSelected?'var(--purple-xlight)':'var(--surface2)'};
        cursor:${isSelected?'default':'pointer'};transition:all .15s"
      ${isSelected?'':(`onclick="selecionarFornAprovacao('${i.id}','${cot.supId}')"`)}>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;gap:6px">
        <span style="font-size:var(--text-sm);font-weight:700;color:${isSelected?'var(--purple)':'var(--text)'}">${sup?.name||'—'}</span>
        ${isSelected
          ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple);display:flex;align-items:center;gap:2px">${lc('check-circle',10,'currentColor')} Selecionado</span>`
          : `<span style="font-size:var(--text-2xs);color:var(--muted)">Selecionar</span>`}
      </div>
      ${badges ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">${badges}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:var(--text-xs);line-height:1.6">
        <div><span style="color:var(--muted)">Preço: </span><span style="font-weight:700;font-family:monospace;color:${isBestPrice?'#16a34a':'var(--text)'}">R$${fmt(cot.precoUnit)}/${i.unidade}</span></div>
        <div><span style="color:var(--muted)">Total: </span><span style="font-weight:800;font-family:monospace;color:var(--purple)">R$${fmt(total)}</span></div>
        <div><span style="color:var(--muted)">Entrega: </span><span style="font-weight:600;color:${isFastest?'#1d4ed8':'var(--text)'}">${cot.dataEntrega?fmtD(cot.dataEntrega):'—'}</span></div>
        <div><span style="color:var(--muted)">Ped. até: </span><span style="font-weight:600">${cot.diasPedido?fmtD(cot.diasPedido):'—'}</span></div>
        ${cot.formaPagamento ? `<div style="grid-column:1/-1"><span style="color:var(--muted)">Pgto: </span><span style="font-weight:600;color:${isBestPgto?'var(--purple)':'var(--text)'}">${_labelPagamento(cot)}</span></div>` : ''}
        ${cot.obs ? `<div style="grid-column:1/-1;font-size:var(--text-2xs);color:var(--muted);font-style:italic;margin-top:1px">${lc('message-square',9,'var(--muted)')} ${cot.obs}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  const emFaltaHtml = cotsEmFalta.length ? `
    <div style="font-size:var(--text-xs);color:var(--red);padding:2px 0 4px;display:flex;align-items:center;gap:5px">
      ${lc('alert-circle',10,'currentColor')} Em falta: ${cotsEmFalta.map(c=>suppliers.find(s=>s.id===c.supId)?.name||'?').join(', ')}
    </div>` : '';

  return `<div style="border:1.5px solid ${borderColor};border-radius:var(--r10);background:${bgColor};overflow:hidden">
    ${header}
    <div style="padding:10px 14px 6px">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:8px;margin-bottom:4px">
        ${cotCards}
      </div>
      ${emFaltaHtml}
    </div>
    ${actionFooter(selectedSup?.name||'')}
  </div>`;
}

function selecionarFornAprovacao(itemId, supId) {
  const i = _listaAtual.itens.find(x => String(x.id) === String(itemId));
  if (!i) return;
  const cot = (i.cotacoes||[]).find(c => String(c.supId) === String(supId));
  if (!cot) return;
  i.fornecedorId = supId;
  i.precoUnitFinal = cot.precoUnit;
  saveListas();
  // Redireciona para a tela de aprovação correta conforme etapa
  if (_listaAtual.etapa === 4) _renderAprovacaoFinal();
  else _renderEtapaAprovacao();
}

function aprovarTodosPendentes() {
  _listaAtual.itens.forEach(i => {
    if (i.aprovado === null || i.aprovado === undefined) {
      i.aprovado = true;
      i.acaoReprovacao = '';
    }
  });
  saveListas();
  _renderEtapaAprovacao();
  toast('Todos os itens pendentes aprovados!');
}

function abrirConfigAprovador() {
  const etapa = _listaAtual?.etapa;
  const titulo = etapa === 4
    ? 'Alterar aprovador — Aprovação final'
    : 'Alterar aprovador — Pré-aprovação';
  const descricao = 'Troque o responsável por esta etapa de aprovação.';
  _comprasPickAprovador(titulo, descricao, (aprovador) => {
    if (!aprovador) return;
    if (etapa === 4) {
      _listaAtual.aprovadorId   = aprovador.id;
      _listaAtual.aprovadorNome = aprovador.name;
      _listaAtual.aprovadorRole = aprovador.role;
      _listaAtual.aprovadorWa   = aprovador.whatsapp || '';
    } else {
      _listaAtual.aprovadorPreId   = aprovador.id;
      _listaAtual.aprovadorPreNome = aprovador.name;
      _listaAtual.aprovadorPreRole = aprovador.role;
    }
    saveListas();
    if (etapa === 4) _renderAprovacaoFinal(); else _renderEtapaAprovacao();
    toast('Aprovador atualizado!');
  });
}

// ── Picker de aprovador ────────────────────────────────────────

function _comprasPickAprovador(titulo, descricao, onConfirm) {
  document.getElementById('_aprovPickOverlay')?.remove();
  const elegiveis = (typeof users !== 'undefined' ? users : [])
    .filter(u => u.active !== false && (u.role === 'supervisor' || u.role === 'gerente'));
  const cur = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const defaultSel = cur && elegiveis.find(u => u.id === cur.id)
    ? cur.id
    : (elegiveis[0]?.id ?? null);

  window._aprovPick = { sel: defaultSel, users: elegiveis, onConfirm };

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = '_aprovPickOverlay';
  overlay.innerHTML = `
    <div class="modal" style="width:440px;max-width:94vw">
      <div class="modal-header" style="padding:18px 20px 14px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-md);font-weight:800">
          ${lc('user-check',16,'var(--purple)')} ${titulo}
        </div>
      </div>
      <div style="padding:16px 20px">
        <p style="font-size:var(--text-sm);color:var(--text2);margin:0 0 16px;line-height:1.5">${descricao}</p>
        ${!elegiveis.length
          ? `<div style="padding:20px;text-align:center;font-size:var(--text-sm);color:var(--muted)">
              ${lc('alert-circle',16,'var(--muted)')}
              <div style="margin-top:8px">Nenhum supervisor ou gerente ativo encontrado.</div>
             </div>`
          : `<div id="_aprovPickList" style="display:flex;flex-direction:column;gap:6px"></div>`
        }
      </div>
      <div style="padding:12px 20px 16px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" onclick="document.getElementById('_aprovPickOverlay')?.remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_aprovPickConfirm()" ${!elegiveis.length ? 'disabled' : ''}>
          ${lc('check',13,'#fff')} Confirmar
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.classList.add('open');
  if (elegiveis.length) _aprovPickRenderList();
}

function _aprovPickRenderList() {
  const el = document.getElementById('_aprovPickList');
  if (!el || !window._aprovPick) return;
  const { sel, users: lista } = window._aprovPick;
  el.innerHTML = lista.map(u => {
    const isSelected = u.id === sel;
    const roleLabel  = u.role === 'gerente' ? 'Gerente' : 'Supervisor';
    const roleColor  = u.role === 'gerente' ? 'var(--purple)' : 'var(--green)';
    const roleBg     = u.role === 'gerente' ? 'var(--purple-xlight)' : 'var(--green-light)';
    return `
      <div onclick="_aprovPickSel('${u.id}')" style="
        display:flex;align-items:center;gap:12px;padding:11px 14px;
        border:1.5px solid ${isSelected ? 'var(--purple)' : 'var(--border)'};
        border-radius:var(--r8);cursor:pointer;
        background:${isSelected ? 'var(--purple-xlight)' : 'var(--surface)'};
        transition:all .12s" id="_aprovU_${u.id}">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--surface2);
          display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc('user',16,'var(--muted)')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text)">${u.name}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">${u.email || ''}</div>
        </div>
        <span style="padding:2px 8px;border-radius:20px;font-size:var(--text-2xs);font-weight:700;
          background:${roleBg};color:${roleColor}">${roleLabel}</span>
        <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${isSelected ? 'var(--purple)' : 'var(--border)'};
          background:${isSelected ? 'var(--purple)' : 'transparent'};
          display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${isSelected ? `<div style="width:8px;height:8px;border-radius:50%;background:#fff"></div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function _aprovPickSel(id) {
  if (!window._aprovPick) return;
  // Normaliza para o mesmo tipo do u.id (número quando possível)
  window._aprovPick.sel = isNaN(id) ? id : Number(id);
  _aprovPickRenderList();
}

function _aprovPickConfirm() {
  if (!window._aprovPick) return;
  const { sel, users: lista, onConfirm } = window._aprovPick;
  const aprovador = lista.find(u => u.id === sel) || null;
  document.getElementById('_aprovPickOverlay')?.remove();
  window._aprovPick = null;
  if (typeof onConfirm === 'function') onConfirm(aprovador);
}

function aprovarItem2(itemId) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.aprovado=true;i.acaoReprovacao='';saveListas();_renderEtapaAprovacao();} }

function reprovarItem2(itemId) {
  // Mostra popup de ação antes de reprovar
  document.getElementById('popupReprovacao')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupReprovacao';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px';
  const acoes = [
    { id:'orcar_outro',    label:'Orçar com outro fornecedor', icon:'building-2'    },
    { id:'pedir_prazo',    label:'Solicitar prazo de entrega', icon:'clock'         },
    { id:'negociar',       label:'Negociar preço/condição',    icon:'trending-down' },
    { id:'remover',        label:'Remover da lista',           icon:'trash-2'       },
    { id:'compra_pres',    label:'Comprar presencialmente',    icon:'shopping-cart' },
    { id:'aguardar',       label:'Aguardar próxima compra',    icon:'pause-circle'  },
  ];
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r14);padding:22px;width:100%;max-width:380px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:6px">${lc('alert-triangle',15,'var(--red)')} Reprovar item</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:14px">Qual ação o comprador deve tomar?</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
        ${acoes.map(a=>`
          <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;transition:all .15s"
            onmouseover="this.style.borderColor='var(--red)';this.style.background='var(--red-light)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
            <input type="radio" name="acaoRep" value="${a.id}" style="accent-color:var(--red);width:15px;height:15px">
            ${lc(a.icon,13,'var(--muted)')}
            <span style="font-size:var(--text-sm);font-weight:600">${a.label}</span>
          </label>
        `).join('')}
      </div>
      <div class="field" style="margin-bottom:14px"><label>Observação adicional (opcional)</label>
        <input type="text" id="obsReprovacao" class="inp" placeholder="Ex: preço muito acima do mercado...">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupReprovacao').remove()">Cancelar</button>
        <button class="btn btn-red" onclick="confirmarReprovacao(${itemId})">Reprovar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function confirmarReprovacao(itemId) {
  const acao = document.querySelector('input[name="acaoRep"]:checked')?.value;
  if (!acao) { toast('Selecione uma ação para o comprador','err'); return; }
  const obs = document.getElementById('obsReprovacao')?.value.trim()||'';
  const i = _listaAtual.itens.find(x=>x.id===itemId);
  if (i) {
    i.aprovado = false;
    i.acaoReprovacao = acao;
    i.comentarioAprovador = obs || i.comentarioAprovador;
    saveListas();
  }
  document.getElementById('popupReprovacao')?.remove();
  _renderEtapaAprovacao();
}

const _labelAcao = {
  orcar_outro:'Orçar com outro fornecedor', pedir_prazo:'Solicitar prazo',
  negociar:'Negociar preço', remover:'Remover da lista',
  compra_pres:'Comprar presencialmente', aguardar:'Aguardar próxima compra',
};
function setComentarioAprovador(itemId,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.comentarioAprovador=val;saveListas();} }
function setQtdAprovada(itemId, val, isModoEmb) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  let v = parseFloat(val);
  if (isNaN(v) || v < 0) { i.qtdAprovada = i.qtdSelecionada; saveListas(); return; }
  if (isModoEmb) {
    const ic = items.find(x => x.id === i.itemId);
    if (ic?.qtdEmb > 0) v = parseFloat((Math.max(0, Math.round(v)) * ic.qtdEmb).toFixed(3));
  }
  i.qtdAprovada = v;
  saveListas();

  // Atualiza gráfico de estoque sem re-render completo
  const itemCad = items.find(x => x.id === i.itemId);
  if (!itemCad) return;
  const atual    = itemCad.qty   || 0;
  const ideal    = itemCad.ideal || 0;
  const minimo   = itemCad.min   || 0;
  const posComp  = atual + v;
  const chartMax = (ideal > 0 ? ideal : Math.max(posComp, minimo)) / 0.70;
  const pctAtual     = Math.min(100, atual / chartMax * 100);
  const limiteIdeal  = Math.max(0, ideal - atual);
  const excesso      = Math.max(0, v - limiteIdeal);
  const pctAddIdeal  = Math.min(100 - pctAtual, Math.min(v, limiteIdeal) / chartMax * 100);
  const pctExcesso   = Math.min(100 - pctAtual - pctAddIdeal, excesso / chartMax * 100);

  const stPos   = posComp < minimo ? 'crit' : posComp < ideal ? 'warn'
                : excesso > ideal * 0.3 ? 'over' : 'ok';
  const stColor = stPos === 'crit' ? 'var(--red)' : stPos === 'warn' ? 'var(--yellow)'
                : stPos === 'over' ? 'var(--orange-dark)' : 'var(--green)';
  const stLabel = stPos === 'crit' ? 'Abaixo do mínimo' : stPos === 'warn' ? 'Abaixo do ideal'
                : stPos === 'over' ? 'Acima do ideal' : 'Dentro do ideal';
  const stIcon  = stPos === 'crit' ? 'alert-circle' : stPos === 'warn' ? 'alert-triangle'
                : stPos === 'over' ? 'trending-up' : 'check-circle';

  const elStatus  = document.getElementById(`preaprov_status_${i.id}`);
  const elPosVal  = document.getElementById(`preaprov_posval_${i.id}`);
  const elBarSeg  = document.getElementById(`preaprov_barseg_${i.id}`);
  const elBarExc  = document.getElementById(`preaprov_barexc_${i.id}`);
  const elLegQtd  = document.getElementById(`preaprov_legqtd_${i.id}`);
  const elLegExcW = document.getElementById(`preaprov_legexc_wrap_${i.id}`);
  const elLegExc  = document.getElementById(`preaprov_legexc_${i.id}`);
  const elBaseQtd = document.getElementById(`preaprov_baseqtd_${i.id}`);

  if (elPosVal)  { elPosVal.style.color = stColor; elPosVal.textContent = `${fmt(posComp)} ${itemCad.unit}`; }
  if (elStatus)  { elStatus.style.color = stColor; elStatus.innerHTML = `${lc(stIcon,10,'currentColor')} ${stLabel}`; }
  if (elBarSeg)  { elBarSeg.style.width = pctAddIdeal + '%'; elBarSeg.style.left = pctAtual + '%'; }
  if (elBarExc)  { elBarExc.style.width = pctExcesso + '%'; elBarExc.style.left = (pctAtual + pctAddIdeal) + '%'; }
  if (elLegQtd)  { elLegQtd.textContent = fmt(v); }
  if (elBaseQtd) { elBaseQtd.textContent = `${fmt(v)} ${itemCad.unit}`; }
  // Legenda de excesso — mostra/esconde conforme necessário
  if (elLegExc)  { elLegExc.textContent = fmt(excesso); }
  if (elLegExcW && excesso > 0) {
    elLegExcW.outerHTML = `<span style="display:flex;align-items:center;gap:3px;font-size:var(--text-2xs);color:var(--muted)">
      <span style="width:9px;height:9px;border-radius:2px;background:var(--orange-dark,#c2410c);flex-shrink:0"></span>
      Excesso: <strong id="preaprov_legexc_${i.id}">${fmt(excesso)}</strong></span>`;
  }
}

function aprovarLista() {
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  _listaAtual.itens.forEach(i=>{if(i.aprovado===null)i.aprovado=true;});
  _listaAtual.itens=_listaAtual.itens.filter(i=>i.aprovado!==false);
  _listaAtual.status='aprovada'; _listaAtual.etapa=5;
  _listaAtual.dataAprovacao=new Date().toISOString();
  _listaAtual.aprovadoPor = _listaAtual.aprovadorNome || u?.name || '';
  _listaAtual.valorAprovado=_listaAtual.itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  saveListas(); _renderDashCompras(); _renderOCPorFornecedor(); toast('Lista aprovada!');
  try { logAudit('lista_etapa', 'Lista #' + _listaAtual.id + ' → aprovada', 'compras'); } catch(e) {}
}

function reprovarLista() {
  vtpConfirm({
    title: 'Reprovar lista',
    message: 'A lista voltará para cotação e precisará ser revisada.',
    confirmLabel: 'Reprovar',
    onConfirm: () => {
      _listaAtual.status='cotacao'; _listaAtual.etapa=3; saveListas();
      _renderDashCompras(); _renderEtapa2Cotacao(); toast('Lista devolvida para cotação.', 'warn');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ETAPA 5 — ORDEM DE COMPRA
// ══════════════════════════════════════════════════════════════
function _renderEtapa3() { _renderOCPorFornecedor(); } // alias legado
function _renderOCPorFornecedor() {
  const l = _listaAtual;
  const itensPresencial = l.itens.filter(i => i.tipoCompra === 'presencial');
  const itensForn       = l.itens.filter(i => i.tipoCompra !== 'presencial');
  const bySup = {};
  itensForn.forEach(i => { const k = i.fornecedorId||0; if(!bySup[k]) bySup[k]=[]; bySup[k].push(i); });

  // Progresso: OCs enviadas + presenciais compradas
  const totalOCs     = Object.keys(bySup).length;
  const enviadas     = Object.values(bySup).filter(itens => itens[0]?.statusOC === 'confirmada' || itens[0]?.statusOC === 'enviada').length;
  const presCompradas= itensPresencial.filter(i => i.compraPresRealizada).length;
  const totalPresencial = itensPresencial.length ? 1 : 0; // 1 grupo presencial
  const totalGrupos  = totalOCs + totalPresencial;
  const concluidos   = enviadas + (itensPresencial.length > 0 && itensPresencial.every(i => i.compraPresRealizada) ? 1 : 0);
  const tudoPronto   = totalGrupos > 0 && concluidos >= totalGrupos;

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">${lc('shopping-bag',14,'var(--purple)')} Ordem de Compra · ${l.codigo}</h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">Total aprovado: <strong style="color:var(--purple)">R$ ${fmt(l.valorAprovado)}</strong></div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="_renderEtapa3Aprovacao()">${lc('arrow-left',13)} Aprovação</button>
        <button class="btn btn-sm" onclick="avancarParaRecebimento()"
          style="${tudoPronto
            ? 'background:var(--purple);color:#fff;border:none;'
            : 'background:var(--surface2);color:var(--muted);border:1.5px solid var(--border);'
          }display:flex;align-items:center;gap:6px;padding:7px 16px;border-radius:var(--r8);font-size:var(--text-sm);font-weight:700">
          ${lc('arrow-right',13,'currentColor')} Ir para Recebimento
        </button>
      </div>
    </div>

    <!-- OCs por fornecedor -->
    ${Object.entries(bySup).map(([supId,itens],idx) => {
      const sup    = parseInt(supId) ? suppliers.find(s => s.id === parseInt(supId)) : null;
      const total  = itens.reduce((s,i) => s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||0), 0);
      const ocText = _montaOCText(sup, itens, l);
      const stOC   = itens[0]?.statusOC || 'pendente';
      const isConfirmada = stOC === 'confirmada';
      const isEnviada    = stOC === 'enviada' || isConfirmada;

      // Dados da cotação do primeiro item para condições gerais do fornecedor
      const refCot = (() => {
        for (const i of itens) {
          const c = (i.cotacoes||[]).find(c => c.supId === parseInt(supId) && !c.emFalta);
          if (c) return c;
        }
        return null;
      })();
      const dataEntregaRef = refCot?.dataEntrega || null;
      const pgtoLabel = refCot ? _labelPagamento(refCot) : '';
      const isPresencialOC = itens[0]?.tipoCompra === 'presencial';

      return `<div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${isConfirmada?'var(--green)':isEnviada?'var(--yellow)':isPresencialOC?'var(--yellow)':'var(--border)'}">
        <!-- Cabeçalho OC -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
          background:${isConfirmada?'var(--green-light)':isEnviada?'var(--yellow-light)':isPresencialOC?'var(--orange-light)':'var(--purple-xlight)'};
          border-bottom:1.5px solid ${isConfirmada?'var(--green)':isEnviada?'var(--yellow)':isPresencialOC?'var(--yellow)':'var(--purple-light)'};flex-wrap:wrap;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div style="font-size:var(--text-md);font-weight:800;color:${isConfirmada?'var(--green)':isPresencialOC?'var(--orange-dark)':'var(--purple)'}">
                ${isPresencialOC ? lc('shopping-cart',14,'currentColor') : lc('building-2',14,'currentColor')}
                ${sup?.name || 'Fornecedor'}
              </div>
              ${isPresencialOC ? `<span style="font-size:var(--text-2xs);padding:1px 7px;border-radius:8px;background:var(--orange-dark);color:#fff;font-weight:700">Presencial</span>` : ''}
            </div>
            ${sup?.seller?`<div style="font-size:var(--text-xs);color:var(--muted)">${lc('user',11,'var(--muted)')} ${sup.seller}</div>`:''}
            <!-- Condições comerciais da cotação -->
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px">
              ${dataEntregaRef ? `<span style="font-size:var(--text-2xs);color:var(--muted);display:flex;align-items:center;gap:3px">${lc('calendar',10,'var(--muted)')} Prev. chegada: <strong style="color:var(--text)">${fmtD(dataEntregaRef)}</strong></span>` : ''}
              ${pgtoLabel ? `<span style="font-size:var(--text-2xs);color:var(--muted);display:flex;align-items:center;gap:3px">${lc('credit-card',10,'var(--muted)')} ${pgtoLabel}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="font-size:var(--text-md);font-weight:800;color:var(--purple)">R$ ${fmt(total)}</div>
            ${!isPresencialOC ? `<button class="btn btn-outline btn-xs" onclick="copiarOC3(${idx})">${lc('copy',12)} Copiar</button>` : ''}
            ${!isPresencialOC && sup?.phone ? `
              <a href="https://wa.me/55${(sup.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(ocText)}"
                target="_blank" onclick="marcarOCEnviada(${idx})" class="btn btn-wa btn-xs">
                ${lc('send',12,'#fff')} Enviar OC
              </a>` : ''}
          </div>
        </div>

        <!-- Itens da OC -->
        ${itens.map((i,iIdx) => {
          const qtd = i.qtdAprovada??i.qtdSelecionada;
          const cot = (i.cotacoes||[]).find(c => c.supId === parseInt(supId) && !c.emFalta);
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);
            background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:600">${i.nome}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
            </div>
            <div style="font-family:monospace;color:var(--muted);text-align:right">${_qtdHtml(i,qtd,{sz:'.74rem',align:'right'})}</div>
            <div style="font-size:var(--text-sm);color:var(--muted);font-family:monospace">R$ ${fmt(i.precoUnitFinal||0)}/un.</div>
            <div style="font-size:var(--text-sm);font-weight:700;font-family:monospace;color:var(--purple)">
              R$ ${fmt(qtd*(i.precoUnitFinal||0))}
            </div>
          </div>`;
        }).join('')}

        <!-- Status da OC + campo data prevista chegada -->
        <div style="padding:12px 16px;background:var(--surface2);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:var(--text-xs);color:var(--muted);font-weight:600">Status:</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(isPresencialOC ? ['pendente','comprado'] : ['pendente','enviada','confirmada']).map(s => {
              const labels = {pendente:'Não enviada', enviada:'OC Enviada', confirmada:'Confirmada pelo fornecedor', comprado:'Comprado'};
              const isActive = stOC === s;
              const colors   = {pendente:'var(--muted)', enviada:'var(--yellow)', confirmada:'var(--green)', comprado:'var(--green)'};
              return `<button onclick="setStatusOC(${idx},'${s}')"
                style="padding:5px 11px;border-radius:20px;font-size:var(--text-xs);font-weight:600;cursor:pointer;
                border:1.5px solid ${isActive?colors[s]:'var(--border)'};
                background:${isActive?colors[s]+'22':'var(--surface)'};color:${isActive?colors[s]:'var(--muted)'};transition:all .15s">
                ${lc(s==='confirmada'||s==='comprado'?'check-circle':s==='enviada'?'send':'clock',11,'currentColor')} ${labels[s]}
              </button>`;
            }).join('')}
          </div>
          ${!isPresencialOC ? `<div style="margin-left:auto;display:flex;align-items:center;gap:7px">
            <span style="font-size:var(--text-xs);color:var(--muted)">${lc('calendar',11,'var(--muted)')} Data prevista chegada:</span>
            <input type="date" value="${itens[0]?.previsaoChegada||dataEntregaRef||''}"
              style="padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs)"
              onchange="setPrevisaoChegada(${idx},this.value)">
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}

    <!-- Compra Presencial com valor real e checklist -->
    ${itensPresencial.length ? `
    <div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--border)'}">
      <div style="padding:12px 16px;background:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green-light)':'var(--orange-light)'};
        border-bottom:1.5px solid ${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--border)'};
        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:var(--text-md);font-weight:800;color:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--orange-dark)'}">
            ${lc('shopping-cart',14,'currentColor')} Compra Presencial
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Preencha o valor real e marque como comprado</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:var(--text-xs);font-weight:700;color:${itensPresencial.every(i=>i.compraPresRealizada)?'var(--green)':'var(--orange-dark)'}">
            ${itensPresencial.filter(i=>i.compraPresRealizada).length}/${itensPresencial.length} comprados
          </span>
          <button class="btn btn-outline btn-xs" onclick="imprimirListaPresencial()">${lc('printer',12)} Imprimir</button>
          ${!itensPresencial.every(i=>i.compraPresRealizada) ? `<button class="btn btn-xs" onclick="marcarTodasPresencialCompradas()"
            style="background:var(--green);color:#fff;border:none">${lc('check-check',12,'#fff')} Todos comprados</button>` : ''}
        </div>
      </div>

      ${[...itensPresencial].sort((a,b)=>a.categoria.localeCompare(b.categoria)||a.nome.localeCompare(b.nome)).map((i,idx) => {
        const u = typeof getCurrentUser==='function'?getCurrentUser():null;
        const qtd = i.qtdAprovada ?? i.qtdSelecionada;
        const teto = qtd * (i.precoUnitEstimado||0);
        const realTotal = i.qtdComprada && i.precoRealUnit ? i.qtdComprada * i.precoRealUnit : null;
        const comprado = !!i.compraPresRealizada;

        return `<div style="padding:12px 16px;border-bottom:1px solid var(--border);
          background:${comprado?'var(--green-light)':'var(--surface)'}">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <div style="width:4px;align-self:stretch;min-height:40px;background:${comprado?'var(--green)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:700">${i.nome}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:var(--text-xs);color:var(--muted)">Teto: <span style="font-weight:600;color:var(--orange-dark)">R$${fmt(teto)}</span></div>
              ${realTotal!==null?`<div style="font-size:var(--text-sm);font-weight:700;color:${realTotal>teto?'var(--red)':'var(--green)'}">Real: R$${fmt(realTotal)}</div>`:''}
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--text-sm);font-weight:600;
              padding:6px 12px;border-radius:var(--r8);border:1.5px solid ${comprado?'var(--green)':'var(--border)'};
              background:${comprado?'var(--green)':'var(--surface)'};color:${comprado?'#fff':'var(--text2)'}">
              <input type="checkbox" ${comprado?'checked':''} style="accent-color:var(--green);width:15px;height:15px"
                onchange="marcarCompraPresRealizada(${i.id},this.checked)">
              ${comprado?'Comprado':'Marcar comprado'}
            </label>
          </div>

          <!-- Campos de valor real e local -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding-left:10px">
            <div class="field" style="margin:0">
              <label style="font-size:var(--text-2xs)">Qtd real comprada</label>
              <input type="number" value="${i.qtdComprada||qtd}" min="0" step="0.001"
                style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);width:100%"
                onchange="setSuperCampo(${i.id},'qtdComprada',parseFloat(this.value)||0)">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:var(--text-2xs)">Preço unit. real (R$)</label>
              <input type="number" value="${i.precoRealUnit||''}" min="0" step="0.01" placeholder="0,00"
                style="padding:5px 8px;border:1.5px solid ${realTotal!==null&&realTotal>teto?'var(--red)':'var(--border)'};border-radius:var(--r6);font-size:var(--text-sm);width:100%"
                onchange="setPrecoRealPres(${i.id},this.value)">
            </div>
            <div class="field" style="margin:0">
              <label style="font-size:var(--text-2xs)">Local da compra</label>
              <input type="text" value="${i.localCompra||''}" placeholder="Ex: Atacadão"
                style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);width:100%"
                onchange="setSuperCampo(${i.id},'localCompra',this.value)">
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}`;

  window._ocBySup = Object.entries(bySup).map(([supId,itens]) => ({
    sup: parseInt(supId) ? suppliers.find(s => s.id === parseInt(supId)) : null, itens
  }));
}


function marcarOCEnviada(idx) {
  const e = window._ocBySup?.[idx];
  if (e) { e.itens.forEach(i => { i.statusOC = 'enviada'; }); saveListas(); }
}

function setStatusOC(idx, status) {
  const e = window._ocBySup?.[idx];
  if (e) {
    e.itens.forEach(i => { i.statusOC = status; });
    if (status === 'enviada' && !_listaAtual.dataOCEmitida) {
      _listaAtual.dataOCEmitida = new Date().toISOString();
      _listaAtual.ocEmitidaPor  = (typeof getCurrentUser==='function' ? getCurrentUser()?.name : null) || '';
    }
    saveListas();
    _renderEtapa3();
  }
}

function marcarTodasPresencialCompradas() {
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  _listaAtual.itens.forEach(i => {
    if (i.tipoCompra !== 'presencial') return;
    if (!i.compraPresRealizada) {
      i.compraPresRealizada = true;
      if (!i.qtdComprada) i.qtdComprada = i.qtdAprovada ?? i.qtdSelecionada;
    }
  });
  if (!_listaAtual.dataOCEmitida) {
    _listaAtual.dataOCEmitida = new Date().toISOString();
    _listaAtual.ocEmitidaPor  = u?.name || '';
  }
  saveListas();
  _renderEtapa3();
  toast('Todos os itens marcados como comprados!', 'ok');
}

function marcarCompraPresRealizada(itemId, checked) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.compraPresRealizada = checked;
  if (checked && !i.qtdComprada) i.qtdComprada = i.qtdAprovada ?? i.qtdSelecionada;
  saveListas();
  _renderEtapa3();
}

function setPrecoRealPres(itemId, val) {
  const i = _listaAtual.itens.find(x => x.id === itemId);
  if (!i) return;
  i.precoRealUnit = parseFloat(val) || 0;
  // Atualiza precoUnitFinal com valor real da compra presencial
  if (i.precoRealUnit > 0) i.precoUnitFinal = i.precoRealUnit;
  saveListas();
}
function _montaOCText(sup,itens,l) {
  const linhas=itens.map(i=>`• ${i.nome}: ${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade} × R$${fmt(i.precoUnitFinal||i.precoUnitEstimado||0)} = R$${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}`).join('\n');
  const total=itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  return `Olá ${sup?.seller||sup?.name||''}!\n\nSegue Ordem de Compra ${l.codigo}:\n\n${linhas}\n\nTotal: R$${fmt(total)}\n\nObrigado!`;
}
function copiarOC3(idx) { const e=window._ocBySup?.[idx]; if(!e)return; navigator.clipboard.writeText(_montaOCText(e.sup,e.itens,_listaAtual)).then(()=>toast('OC copiada!','info')); }
function setSuperCampo(itemId,campo,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i[campo]=val;saveListas();} }

function setPrevisaoChegada(idx, val) {
  const e = window._ocBySup?.[idx];
  if (!e) return;
  e.itens.forEach(i => { i.previsaoChegada = val; });
  saveListas();
}

function imprimirListaPresencial() {
  const l   = _listaAtual;
  const u   = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const cfg = getConfig();
  const empresa = cfg.empresa || 'Vai Ter Pizza!';
  const resp = l.itens.find(i=>i.responsavelCompra)?.responsavelCompra || u?.name || '___________________';

  // Ordena por categoria > nome; agrupa por categoria
  const itens = [...l.itens.filter(i=>i.tipoCompra==='presencial')]
    .sort((a,b)=>a.categoria.localeCompare(b.categoria)||a.nome.localeCompare(b.nome));
  const porCat = {};
  itens.forEach(i=>{ if(!porCat[i.categoria]) porCat[i.categoria]=[]; porCat[i.categoria].push(i); });
  const totalEst = itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0),0);

  const win = window.open('','_blank');
  win.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Lista Presencial '+l.codigo+'</title>'
  +'<style>'
  +'@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap\');'
  +'*{margin:0;padding:0;box-sizing:border-box}'
  +'body{font-family:\'Inter\',Arial,sans-serif;font-size:11px;background:#fff;color:#1a1a2e;padding:24px}'
  +'.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #6B21D4;margin-bottom:16px}'
  +'.empresa{font-size:17px;font-weight:800;color:#6B21D4}'
  +'.sub{font-size:10px;color:#888;margin-top:2px}'
  +'.meta{text-align:right;font-size:10px;color:#555;line-height:1.9}'
  +'.meta strong{color:#1a1a2e}'
  +'.kpis{display:flex;gap:10px;margin-bottom:16px}'
  +'.kpi{flex:1;background:#f5f0ff;border:1px solid #d8b4fe;border-radius:6px;padding:7px 10px;text-align:center}'
  +'.kpi-v{font-size:14px;font-weight:800;color:#6B21D4}'
  +'.kpi-l{font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:1px}'
  +'.cat{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6B21D4;background:#f5f0ff;padding:5px 10px;border-radius:4px;margin:14px 0 5px}'
  +'table{width:100%;border-collapse:collapse}'
  +'thead th{background:#6B21D4;color:#fff;padding:6px 9px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.3px}'
  +'thead th.r{text-align:right} thead th.c{text-align:center}'
  +'td{padding:6px 9px;font-size:10.5px;border-bottom:1px solid #f0f0f0;vertical-align:middle}'
  +'tr:nth-child(even) td{background:#fafafa}'
  +'.nm{font-weight:600} .ct{font-size:9px;color:#bbb}'
  +'.r{text-align:right} .c{text-align:center}'
  +'.chk{width:13px;height:13px;border:1.5px solid #6B21D4;border-radius:3px;display:inline-block;vertical-align:middle}'
  +'.sub-tot td{background:#f5f0ff!important;font-weight:700;color:#6B21D4;border-top:1.5px solid #6B21D4;padding:6px 9px}'
  +'.footer{margin-top:20px;padding-top:12px;border-top:1px dashed #ccc;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:14px}'
  +'.ass{display:flex;flex-direction:column;align-items:center;gap:3px}'
  +'.ass-linha{border-bottom:1px solid #aaa;width:180px}'
  +'.ass-lbl{font-size:9px;color:#888}'
  +'@media print{body{padding:8px}}'
  +'</style></head><body>');
  win.document.write('<div class="hdr"><div><div class="empresa">'+empresa+'</div><div class="sub">Lista de Compra Presencial</div></div>'
  +'<div class="meta"><div><strong>Lista:</strong> '+l.codigo+'</div><div><strong>Data:</strong> '+fmtD(new Date().toISOString())+'</div>'
  +'<div><strong>Responsável:</strong> '+resp+'</div></div></div>');
  win.document.write('<div class="kpis">'
  +'<div class="kpi"><div class="kpi-v">'+itens.length+'</div><div class="kpi-l">Itens</div></div>'
  +'<div class="kpi"><div class="kpi-v">'+Object.keys(porCat).length+'</div><div class="kpi-l">Categorias</div></div>'
  +'<div class="kpi"><div class="kpi-v">R$ '+fmt(totalEst)+'</div><div class="kpi-l">Teto máximo</div></div>'
  +'</div>');

  Object.entries(porCat).forEach(([cat,citens])=>{
    const subTot = citens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0),0);
    win.document.write('<div class="cat">'+cat+'</div>');
    win.document.write('<table><thead><tr>'
    +'<th class="c" style="width:20px"></th><th>Item</th>'
    +'<th class="c" style="width:55px">Qtd</th><th class="c" style="width:32px">Un.</th>'
    +'<th style="width:110px">Local</th><th class="r" style="width:75px">Teto</th>'
    +'<th style="width:90px">Obs.</th></tr></thead><tbody>');
    citens.forEach(i=>{
      win.document.write('<tr>'
      +'<td class="c"><span class="chk"></span></td>'
      +'<td><div class="nm">'+i.nome+'</div></td>'
      +'<td class="c" style="font-family:monospace;font-weight:600">'+fmt(i.qtdAprovada??i.qtdSelecionada)+'</td>'
      +'<td class="c" style="color:#aaa">'+i.unidade+'</td>'
      +'<td style="color:#555">'+( i.localCompra||'—' )+'</td>'
      +'<td class="r" style="font-weight:600">R$ '+fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitEstimado||0))+'</td>'
      +'<td style="color:#aaa;font-size:9.5px">'+( i.observacoes||'' )+'</td></tr>');
    });
    win.document.write('<tr class="sub-tot"><td colspan="5">Subtotal '+cat+'</td>'
    +'<td class="r">R$ '+fmt(subTot)+'</td><td></td></tr>');
    win.document.write('</tbody></table>');
  });

  win.document.write('<div class="footer">'
  +'<div class="ass"><div class="ass-linha"></div><div class="ass-lbl">'+resp+' — Responsável</div></div>'
  +(l.observacoes?'<div style="flex:1;min-width:160px;background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:7px 10px;font-size:10px"><strong>Obs.:</strong> '+l.observacoes+'</div>':'')
  +'<div class="ass"><div class="ass-linha"></div><div class="ass-lbl">Conferência / Gerência</div></div>'
  +'</div>');
  win.document.write('<script>window.onload=()=>window.print();<\/script></body></html>');
  win.document.close();
}

function avancarParaRecebimento() {
  _listaAtual.etapa=6; _listaAtual.status='recebimento';
  if (!_listaAtual.dataRecebimento) _listaAtual.dataRecebimento=new Date().toISOString().slice(0,10);
  // Pré-preenche conferente com nome do usuário logado
  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;
  const nomeConferente = u?.name || '';
  if (!_listaAtual.conferidoPor) _listaAtual.conferidoPor = nomeConferente;
  // Pré-preenche cada item
  const horaAtual = `${String(new Date().getHours()).padStart(2,'0')}:00`;
  _listaAtual.itens.forEach(i=>{
    if (!i.conferidoPorItem)       i.conferidoPorItem = nomeConferente;
    if (!i.dataRecebimentoItem)    i.dataRecebimentoItem = _listaAtual.dataRecebimento;
    if (!i.horaRecebimentoItem)    i.horaRecebimentoItem = horaAtual;
  });
  // Pré-preenche responsavelCompra nos itens presenciais
  _listaAtual.itens.filter(i=>i.tipoCompra==='presencial').forEach(i=>{
    if (!i.responsavelCompra) i.responsavelCompra = nomeConferente;
  });
  saveListas(); _renderDashCompras(); _renderEtapa4(); toast('Avançado para recebimento!');
  try { logAudit('lista_etapa', 'Lista #' + _listaAtual.id + ' → recebimento', 'compras'); } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
// ETAPA 6 — RECEBIMENTO AGRUPADO POR FORNECEDOR
// ══════════════════════════════════════════════════════════════
function _renderEtapa4() { _renderEtapa4OC(); } // alias legado (sobrescreve alias quebrado do topo)
function _renderEtapa5() { _renderEtapa4OC(); } // alias legado
function _renderEtapa4OC_Recebimento() { _renderEtapa4OC(); } // alias legado
function _renderEtapa4OC() {
  const l          = _listaAtual;
  const total      = l.itens.length;
  const conferidos = l.itens.filter(i => i.conferido).length;
  const pct        = total > 0 ? Math.round(conferidos/total*100) : 0;
  const tudo       = conferidos === total;
  const horas      = Array.from({length:18},(_,i)=>`${String(i+6).padStart(2,'0')}:00`);
  const u          = typeof getCurrentUser==='function' ? getCurrentUser() : null;

  // Contador CW
  const confItems  = l.itens.filter(i => i.conferido);
  const cwTotal    = confItems.length;
  const cwFeitos   = confItems.filter(i => i.cwAtualizado).length;

  // Agrupa por fornecedor
  const bySup = {};
  l.itens.forEach(i => {
    const k = i.tipoCompra === 'presencial' ? 'presencial' : (i.fornecedorId || '0');
    if (!bySup[k]) bySup[k] = [];
    bySup[k].push(i);
  });

  document.getElementById('comprasContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div>
        <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">${lc('package',14,'var(--purple)')} Recebimento · ${l.codigo}</h3>
        <div style="font-size:var(--text-xs);color:var(--muted);display:flex;gap:12px;flex-wrap:wrap">
          <span>${conferidos} de ${total} itens conferidos</span>
          ${cwTotal > 0 ? `<span style="color:${cwFeitos===cwTotal?'var(--green)':'var(--purple)'}">
            ${lc('monitor',10,'currentColor')} CW: ${cwFeitos}/${cwTotal} atualizados
          </span>` : ''}
        </div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="_renderEtapa3()">${lc('arrow-left',13)} OC</button>
    </div>

    <!-- Progresso -->
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:var(--text-xs);color:var(--muted)">Progresso geral</span>
        <span style="font-size:var(--text-xs);font-weight:700;color:${pct===100?'var(--green)':'var(--purple)'}">${pct}%</span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct===100?'var(--green)':'var(--purple)'};border-radius:4px;transition:width .4s"></div>
      </div>
    </div>

    <!-- Itens agrupados por fornecedor — cada item com seus próprios dados -->
    ${Object.entries(bySup).map(([supKey, itensGrupo]) => {
      const isPresencial  = supKey === 'presencial';
      const sup           = !isPresencial && parseInt(supKey) ? suppliers.find(s => s.id === parseInt(supKey)) : null;
      const grupoConf     = itensGrupo.filter(i => i.conferido).length;
      const grupoTotal    = itensGrupo.length;
      const grupoOk       = grupoConf === grupoTotal;

      return `<div class="card" style="margin-bottom:14px;overflow:hidden;border:1.5px solid ${grupoOk?'var(--green)':'var(--border)'}">
        <!-- Cabeçalho do grupo -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;
          background:${grupoOk?'var(--green-light)':isPresencial?'var(--orange-light)':'var(--purple-xlight)'};
          border-bottom:1.5px solid ${grupoOk?'var(--green)':isPresencial?'var(--border)':'var(--purple-light)'};flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:var(--text-md);font-weight:800;color:${grupoOk?'var(--green)':isPresencial?'var(--orange-dark)':'var(--purple)'}">
              ${isPresencial
                ? `${lc('shopping-cart',13,'currentColor')} Compra Presencial`
                : `${lc('building-2',13,'currentColor')} ${sup?.name||'Fornecedor'}`}
            </div>
            ${sup?.seller?`<div style="font-size:var(--text-xs);color:var(--muted)">${lc('user',10,'var(--muted)')} ${sup.seller}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:var(--text-xs);font-weight:700;color:${grupoOk?'var(--green)':'var(--muted)'}">
              ${lc(grupoOk?'check-circle':'clock',12,'currentColor')} ${grupoConf}/${grupoTotal}
            </span>
            <button onclick="_conferirTodoGrupo('${supKey}')"
              style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--green);
              background:var(--green-light);color:var(--green);font-size:var(--text-xs);font-weight:600;cursor:pointer">
              ${lc('check-check',11,'currentColor')} Conferir todos
            </button>
            <button onclick="_abrirAnexoNF('${supKey}','${_listaAtual?.codigo||'LC'}')"
              style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--purple-light);
              background:var(--purple-xlight);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px">
              ${lc('file-text',11,'currentColor')} Nota Fiscal
            </button>
          </div>
        </div>

        <!-- Cada item com seus dados individuais de recebimento -->
        ${itensGrupo.map(i => {
          const qtdS  = i.qtdAprovada ?? i.qtdSelecionada;
          const qtdR  = i.qtdRecebida ?? null;
          const diff  = qtdR !== null ? qtdR - qtdS : null;
          const isOk  = i.conferido && !i.divergencia;
          const isDivg= i.conferido && i.divergencia;

          return `<div style="border-bottom:1px solid var(--border);background:${isOk?'var(--green-light)':isDivg?'var(--yellow-light)':'var(--surface)'}">
            <!-- Linha principal do item -->
            <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap">
              <div style="width:4px;align-self:stretch;background:${isOk?'var(--green)':isDivg?'var(--yellow)':'var(--border)'};border-radius:2px;flex-shrink:0"></div>
              <div style="flex:1;min-width:110px">
                <div style="font-size:var(--text-sm);font-weight:700">${i.nome}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
                ${_conflitoBadge(i.itemId) ? `<div style="margin-top:3px">${_conflitoBadge(i.itemId)}</div>` : ''}
              </div>
              <!-- Pedido -->
              <div style="text-align:center">
                <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Pedido</div>
                ${_qtdHtml(i,qtdS,{sz:'.8rem',align:'center',bold:true})}
              </div>
              <!-- Recebido -->
              <div style="text-align:center">
                <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Recebido</div>
                <input type="number" value="${qtdR??''}" min="0" step="0.001" placeholder="${fmt(qtdS)}"
                  style="width:72px;padding:4px 6px;border:1.5px solid ${diff!==null&&diff<0?'var(--red)':'var(--border)'};
                  border-radius:var(--r6);font-size:var(--text-sm);text-align:center;font-family:monospace"
                  onchange="setQtdRecebida(${i.id},this.value)">
              </div>
              <!-- Diferença -->
              ${diff!==null?`<div style="text-align:center">
                <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Dif.</div>
                <div style="font-size:var(--text-sm);font-weight:700;font-family:monospace;color:${diff<0?'var(--red)':diff>0?'var(--yellow)':'var(--green)'}">
                  ${diff>0?'+':''}${fmt(diff)}
                </div>
              </div>`:''}
              <!-- Checkbox conferido -->
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:var(--text-sm);font-weight:600;
                white-space:nowrap;padding:5px 10px;border-radius:var(--r8);
                border:1.5px solid ${isOk?'var(--green)':'var(--border)'};
                background:${isOk?'var(--green)':'var(--surface)'};color:${isOk?'#fff':'var(--text2)'}">
                <input type="checkbox" ${i.conferido?'checked':''} style="accent-color:var(--green);width:15px;height:15px"
                  onchange="marcarConferido(${i.id},this.checked)">
                Conferido
              </label>
            </div>

            <!-- Obs + anexo -->
            <div style="padding:6px 16px 10px 32px;background:${isOk?'rgba(34,197,94,.06)':'var(--surface2)'}">
              <div style="display:flex;align-items:center;gap:6px">
                <input type="text" placeholder="Obs. de conferência (divergência, qualidade, etc)..." value="${i.comentarioConferencia||''}"
                  style="flex:1;padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);
                  font-size:var(--text-xs);background:var(--surface)"
                  onchange="setComentarioConferencia(${i.id},this.value)">
                <button onclick="_abrirAnexoRecebimento(${i.id},'${_listaAtual?.codigo||'LC'}')"
                  style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:var(--r6);
                  border:1.5px solid ${(i.anexos?.length)?'var(--purple)':'var(--border)'};
                  background:${(i.anexos?.length)?'var(--purple-xlight)':'var(--surface)'};
                  color:${(i.anexos?.length)?'var(--purple)':'var(--muted)'};
                  font-size:var(--text-xs);font-weight:600;cursor:pointer;white-space:nowrap">
                  ${lc('paperclip',11,'currentColor')} ${(i.anexos?.length) ? 'Notas ('+i.anexos.length+')' : 'Anexar'}
                </button>
              </div>
            </div>

            <!-- Painel Atualizar CW — aparece só quando conferido -->
            ${i.conferido ? (() => {
              const cw    = _calcDadosCW(i);
              const feito = !!i.cwAtualizado;
              if (!cw) return '';
              return `
              <div style="margin:0 12px 10px 32px;border-radius:var(--r8);overflow:hidden;
                border:1.5px solid ${feito?'var(--green)':'#e5deff'};
                background:${feito?'var(--green-light)':'var(--purple-xlight)'}">
                <div style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                  <div>
                    <div style="font-size:var(--text-xs);font-weight:800;color:${feito?'var(--green)':'var(--purple)'};margin-bottom:3px">
                      ${feito?lc('check-circle',11,'currentColor'):lc('monitor',11,'currentColor')} Atualizar no Cardápio Web
                    </div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                      <span style="font-size:var(--text-xs);color:var(--text2)">
                        Qtd: <strong style="font-family:monospace">${fmt(cw.qtd)} ${i.unidade}</strong>
                      </span>
                      <span style="font-size:var(--text-xs);color:var(--text2)">
                        Custo: <strong style="font-family:monospace;color:${feito?'var(--green)':'var(--purple)'}">R$ ${fmt(cw.preco)}/${i.unidade}</strong>
                      </span>
                      <span style="font-size:var(--text-2xs);color:var(--muted)">
                        R$ ${fmt(cw.valorTotal)} ÷ ${fmt(cw.qtd)}${i.unidade} = R$${fmt(cw.preco)}/${i.unidade}
                      </span>
                      ${cw.embInfo ? `<span style="font-size:var(--text-2xs);color:var(--muted)">${cw.embInfo}</span>` : ''}
                    </div>
                  </div>
                  <label style="display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;
                    padding:5px 10px;border-radius:var(--r6);font-size:var(--text-xs);font-weight:700;
                    border:1.5px solid ${feito?'var(--green)':'var(--purple)'};
                    background:${feito?'var(--green)':'var(--surface)'};
                    color:${feito?'#fff':'var(--purple)'}">
                    <input type="checkbox" ${feito?'checked':''} style="accent-color:var(--green);width:15px;height:15px"
                      onchange="marcarCWAtualizado(${i.id},this.checked)">
                    ${feito?'✓ Atualizado':'Atualizei no CW'}
                  </label>
                </div>
              </div>`;
            })() : ''}
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}

    <!-- Botão Finalizar — fixo no rodapé, verde quando tudo conferido -->
    <div style="position:sticky;bottom:0;background:var(--surface);border-top:1.5px solid var(--border);
      padding:14px 0;margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="font-size:var(--text-sm);color:var(--muted)">
        ${tudo
          ? `${lc('check-circle',14,'var(--green)')} <span style="color:var(--green);font-weight:700">Todos os itens conferidos!</span>`
          : `${lc('clock',14,'var(--muted)')} Faltam <strong>${total-conferidos}</strong> item(s) para conferir`}
      </div>
      <button onclick="${tudo?'concluirLista()':'void(0)'}"
        style="display:flex;align-items:center;gap:8px;padding:11px 28px;border-radius:var(--r10);
        border:none;font-size:var(--text-md);font-weight:800;font-family:Inter,sans-serif;cursor:${tudo?'pointer':'not-allowed'};
        transition:all .3s;
        background:${tudo?'var(--green)':'var(--surface2)'};
        color:${tudo?'#fff':'var(--muted)'}">
        ${tudo ? lc('check-circle',18,'#fff') : lc('circle',18,'var(--muted)')}
        Finalizar lista
      </button>
    </div>`;
}


function _conferirTodoGrupo(supKey) {
  const l=_listaAtual;
  l.itens.forEach(i=>{
    const k=i.tipoCompra==='presencial'?'presencial':(i.fornecedorId||'0');
    if(String(k)!==String(supKey)) return;
    if(!i.conferido) {
      i.conferido=true;
      if(i.qtdRecebida===null) i.qtdRecebida=i.qtdAprovada??i.qtdSelecionada;
    }
  });
  saveListas(); _renderEtapa4();
}

function _setRecGlobal(campo,val) {
  // Mantido por compatibilidade — campos globais foram substituídos por campos por item
  if (_listaAtual) { _listaAtual[campo] = val; saveListas(); }
}

function setItemRecCampo(itemId, campo, val) {
  const i=_listaAtual.itens.find(x=>x.id===itemId);
  if(i){i[campo]=val;saveListas();}
}

function setQtdRecebida(itemId,val) {
  const i=_listaAtual.itens.find(x=>x.id===itemId); if(!i) return;
  const v=parseFloat(val); const qtdS=i.qtdAprovada??i.qtdSelecionada;
  i.qtdRecebida=!isNaN(v)?parseFloat(v.toFixed(3)):null;
  i.divergencia=i.qtdRecebida!==null&&Math.abs(i.qtdRecebida-qtdS)>0.001;
  saveListas();
}

function marcarConferido(itemId,checked) {
  const i=_listaAtual.itens.find(x=>x.id===itemId); if(!i) return;
  i.conferido=checked;
  if(checked) {
    if(i.qtdRecebida===null) i.qtdRecebida=i.qtdAprovada??i.qtdSelecionada;
    const u=typeof getCurrentUser==='function'?getCurrentUser():null;
    const now=new Date();
    if(!i.conferidoPorItem) i.conferidoPorItem=u?.name||'';
    if(!i.dataRecebimentoItem) i.dataRecebimentoItem=now.toISOString().slice(0,10);
    if(!i.horaRecebimentoItem) {
      const horas=Array.from({length:18},(_,k)=>`${String(k+6).padStart(2,'0')}:00`);
      const hAtual=`${String(now.getHours()).padStart(2,'0')}:00`;
      i.horaRecebimentoItem=horas.includes(hAtual)?hAtual:horas[4];
    }
  }
  saveListas(); _renderEtapa4();
  if (checked) try { logAudit('recebimento_item', (i.itemName || 'Item') + ' — Lista #' + _listaAtual.id, 'compras'); } catch(e) {}
}

function setComentarioConferencia(itemId,val) { const i=_listaAtual.itens.find(x=>x.id===itemId); if(i){i.comentarioConferencia=val;saveListas();} }

// Calcula dados para o usuário atualizar no Cardápio Web
function _calcDadosCW(i) {
  const qtdR = i.qtdRecebida ?? (i.qtdAprovada ?? i.qtdSelecionada);
  if (!qtdR || qtdR <= 0) return null;

  // Acha a cotação vencedora (fornecedor escolhido)
  const cot = (i.cotacoes||[]).find(c => c.supId === i.fornecedorId && c.respondido && !c.emFalta && c.precoUnit > 0)
           || (i.cotacoes||[]).find(c => c.respondido && !c.emFalta && c.precoUnit > 0);

  if (!cot && !i.precoUnitEstimado) return null;

  const precoUnit  = cot?.precoUnit || i.precoUnitEstimado || 0;
  const valorTotal = cot?.valorFinal || (precoUnit * qtdR);
  const precoPorBase = valorTotal > 0 && qtdR > 0 ? valorTotal / qtdR : precoUnit;

  // Info de embalagem (se configurada)
  const itemCad = typeof items !== 'undefined' ? items.find(x => x.id === i.itemId) : null;
  let embInfo = null;
  if (itemCad?.qtdEmb > 0 && itemCad?.unidCompra) {
    const nEmb = Math.round(qtdR / itemCad.qtdEmb);
    embInfo = `${nEmb} ${itemCad.unidCompra}(s) × ${fmt(itemCad.qtdEmb)}${i.unidade}`;
  }

  return { qtd: qtdR, preco: parseFloat(precoPorBase.toFixed(2)), valorTotal, embInfo };
}

function marcarCWAtualizado(itemId, checked) {
  const i = _listaAtual?.itens?.find(x => x.id === itemId);
  if (!i) return;
  i.cwAtualizado = checked;
  i.cwAtualizadoEm = checked ? new Date().toISOString() : null;
  saveListas();
  _renderEtapa4();
}

function setGrupoNF(supKey, campo, val) {
  _listaAtual.itens.forEach(i => {
    const k = i.tipoCompra === 'presencial' ? 'presencial' : (i.fornecedorId || '0');
    if (String(k) === String(supKey)) i[campo] = val;
  });
  saveListas();
}

function concluirLista() {
  if(!_listaAtual) return;

  const u = typeof getCurrentUser==='function' ? getCurrentUser() : null;

  const dataCompra = (_listaAtual.dataRecebimento || new Date().toISOString()).slice(0,10);

  _listaAtual.itens.forEach(i=>{
    if(!i.itemId) return;
    const item=items.find(x=>x.id===i.itemId); if(!item) return;
    if(i.qtdRecebida!==null) item.qty=parseFloat((item.qty+i.qtdRecebida).toFixed(3));

    const precoFinal = i.precoRealUnit || i.precoUnitFinal || 0;
    if(precoFinal > 0) {
      item.cost = precoFinal;

      // Grava ponto no histórico de preços
      const sup = suppliers.find(s => s.id === i.fornecedorId);
      priceHistory.push({
        itemId:         i.itemId,
        itemName:       item.name,
        cat:            item.cat,
        unidade:        item.unit,
        marca:          i.cotacoes?.find(c => c.supId === i.fornecedorId && !c.emFalta)?.marca || '',
        fornecedorId:   i.fornecedorId || null,
        fornecedorNome: sup?.name || (i.tipoCompra === 'presencial' ? (i.localCompra || 'Presencial') : '—'),
        tipoCompra:     i.tipoCompra || 'fornecedor',
        precoUnit:      precoFinal,
        precoEstimado:  i.precoUnitEstimado || 0,
        data:           dataCompra,
        listaId:        _listaAtual.codigo,
      });
    }
  });
  savePriceHistory();
  saveI();

  // Após dar entrada no estoque, atualizar o snapshot estoqueAtual
  // em todas as outras listas abertas que tenham os mesmos insumos
  const idsAtualizados = _listaAtual.itens.filter(i => i.itemId && i.qtdRecebida !== null).map(i => i.itemId);
  if (idsAtualizados.length) {
    listas.forEach(l => {
      if (l.id === _listaAtual.id || l.status === 'concluida') return;
      let touched = false;
      l.itens.forEach(li => {
        if (!idsAtualizados.includes(li.itemId)) return;
        const itemAtualizado = items.find(x => x.id === li.itemId);
        if (itemAtualizado) { li.estoqueAtual = itemAtualizado.qty; touched = true; }
      });
      if (touched) saveListas();
    });
  }

  _listaAtual.status='concluida';
  _listaAtual.dataConclusao=new Date().toISOString();
  _listaAtual.concluídoPor = u?.name || '';
  _listaAtual.valorFinal=_listaAtual.itens.reduce((s,i)=>s+(i.qtdRecebida??0)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
  saveListas();
  try { logAudit('lista_etapa', 'Lista #' + _listaAtual.id + ' → concluida', 'compras'); } catch(e) {}

  const economia=Math.max(0,(_listaAtual.valorEstimado||0)-(_listaAtual.valorFinal||0));
  const bySup={};
  _listaAtual.itens.forEach(i=>{const k=i.fornecedorId||0;if(!bySup[k])bySup[k]=[];bySup[k].push(i);});
  cycleHistory.push({
    id:_listaAtual.codigo, date:_listaAtual.dataConclusao,
    items:_listaAtual.itens.length, sups:Object.keys(bySup).filter(k=>k!=='0').length,
    total:_listaAtual.valorFinal, economia, listaId:_listaAtual.id,
    etapas:{criacao:_listaAtual.dataCriacao,aprovacao:_listaAtual.dataAprovacao||null,conclusao:_listaAtual.dataConclusao},
    conferidoPor:_listaAtual.conferidoPor||'', dataRecebimento:_listaAtual.dataRecebimento||'', horaRecebimento:_listaAtual.horaRecebimento||'',
  });
  db._set('vtp_cycle_history', cycleHistory);

  // Feedback visual antes de redirecionar
  const content = document.getElementById('comprasContent');
  if (content) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;text-align:center">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--green-light);border:3px solid var(--green);
          display:flex;align-items:center;justify-content:center;margin-bottom:20px;
          animation:popIn .4s cubic-bezier(.175,.885,.32,1.275)">
          ${lc('check-circle',36,'var(--green)')}
        </div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--green);margin-bottom:8px">Lista concluída!</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:6px">Estoque atualizado com sucesso.</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">Redirecionando para o histórico...</div>
      </div>
      <style>
        @keyframes popIn {
          0%{transform:scale(0);opacity:0}
          100%{transform:scale(1);opacity:1}
        }
      </style>`;
  }

  // Aguarda 1.8s para o usuário ver o feedback e vai ao histórico
  setTimeout(() => {
    _listaAtual    = getListaAtiva();
    _cpSection     = 'historico';
    _cpListaAberta = null;
    renderDashboard();
    renderComprasModule();
  }, 1800);
}

// ══════════════════════════════════════════════════════════════
// AUDITORIA_PLACEHOLDER — removido, ver _abrirAuditoriaLista()
// ══════════════════════════════════════════════════════════════
function _renderHistorico() { /* obsoleto */ }

// ══════════════════════════════════════════════════════════════
// AUDITORIA — modal completo de uma lista
// ══════════════════════════════════════════════════════════════
function abrirAuditoria(listaId) {
  const l = listas.find(x=>x.id===listaId);
  if (!l) return;
  document.getElementById('popupAuditoria')?.remove();

  const st = STATUS_ETAPA[l.status]||{label:l.status,color:'var(--muted)',bg:'var(--surface2)'};
  const itensForn = (l.itens||[]).filter(i=>i.tipoCompra!=='presencial');
  const itensPresencial = (l.itens||[]).filter(i=>i.tipoCompra==='presencial');
  const bySup={};
  itensForn.forEach(i=>{const k=i.fornecedorId||0;if(!bySup[k])bySup[k]=[];bySup[k].push(i);});

  const popup=document.createElement('div');
  popup.id='popupAuditoria';
  popup.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';

  popup.innerHTML=`
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:720px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1rem;font-weight:800">${lc('search',16,'var(--purple)')} Auditoria · ${l.codigo}</span>
            <span style="font-size:var(--text-xs);font-weight:700;padding:3px 10px;border-radius:20px;background:${st.bg};color:${st.color};border:1px solid ${st.color}">${st.label}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:3px">Criada em ${fmtD(l.dataCriacao)} por <strong>${l.criadoPor}</strong></div>
        </div>
        <button onclick="document.getElementById('popupAuditoria').remove()"
          style="background:none;border:none;cursor:pointer;padding:6px;border-radius:var(--r6);color:var(--muted)">
          ${lc('x',18,'currentColor')}
        </button>
      </div>

      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:20px">

        <!-- Resumo geral -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:var(--text-base);font-weight:800;color:var(--purple)">${(l.itens||[]).length}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Itens total</div>
          </div>
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:var(--text-base);font-weight:800;color:var(--purple)">R$${fmt(l.valorEstimado||0)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Estimado</div>
          </div>
          ${l.valorAprovado!=null?`<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:var(--text-base);font-weight:800;color:var(--green)">R$${fmt(l.valorAprovado)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Aprovado</div>
          </div>`:''}
          ${l.valorFinal!=null?`<div style="background:var(--purple-xlight);border:1px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;text-align:center">
            <div style="font-size:var(--text-base);font-weight:800;color:var(--purple)">R$${fmt(l.valorFinal)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Final</div>
          </div>`:''}
        </div>

        <!-- Linha do tempo detalhada -->
        <div>
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">${lc('clock',12,'var(--muted)')} Linha do Tempo</div>
          <div style="display:flex;flex-direction:column;gap:0">
            ${[
              {
                icon:'file-plus', label:'Lista criada', data:l.dataCriacao,
                detalhe: l.criadoPor ? `por <strong>${l.criadoPor}</strong>` : '',
                cor:'var(--purple)'
              },
              {
                icon:'user-check', label:'Pré-aprovação',
                data: l.dataPreAprovacao || (l.etapa>=3 ? l.dataCriacao : null),
                detalhe: l.aprovadorPreNome ? `por <strong>${l.aprovadorPreNome}</strong>` : '',
                cor:'var(--purple)'
              },
              {
                icon:'tag', label:'Cotação liberada',
                data: l.dataCotacaoEnviada || (l.etapa>=3 ? l.dataPreAprovacao||l.dataCriacao : null),
                detalhe: l.cotacaoEnviadaPor ? `por <strong>${l.cotacaoEnviadaPor}</strong>` : `${Object.keys(bySup).filter(k=>k!=='0').length} fornecedor(es) cotado(s)`,
                cor:'var(--yellow)'
              },
              {
                icon:'check-circle', label:'Aprovação final',
                data: l.dataAprovacao,
                detalhe: (l.aprovadoPor||l.aprovadorNome)
                  ? `por <strong>${l.aprovadoPor||l.aprovadorNome}</strong>`
                  : 'sem registro de aprovador',
                cor:'var(--green)'
              },
              {
                icon:'shopping-bag', label:'Ordem de compra emitida',
                data: l.dataOCEmitida || (l.etapa>=5 ? l.dataAprovacao||null : null),
                detalhe: l.ocEmitidaPor ? `por <strong>${l.ocEmitidaPor}</strong>` : '',
                cor:'var(--purple)'
              },
              {
                icon:'package', label:'Lista concluída',
                data: l.dataConclusao,
                detalhe: l['concluídoPor'] ? `por <strong>${l['concluídoPor']}</strong>` : '',
                cor:'var(--green)'
              },
            ].map((e,idx,arr)=>{
              const done=!!e.data;
              return `<div style="display:flex;gap:14px;align-items:flex-start">
                <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                  <div style="width:28px;height:28px;border-radius:50%;background:${done?e.cor:'var(--border)'};display:flex;align-items:center;justify-content:center">
                    ${lc(e.icon,13,done?'#fff':'var(--muted)')}
                  </div>
                  ${idx<arr.length-1?`<div style="width:2px;height:28px;background:${done?e.cor:'var(--border)'}"></div>`:''}
                </div>
                <div style="padding-top:3px;padding-bottom:4px">
                  <div style="font-size:var(--text-sm);font-weight:${done?'700':'500'};color:${done?'var(--text)':'var(--muted)'}">${e.label}</div>
                  ${done&&e.data?`<div style="font-size:var(--text-xs);color:var(--muted)">${fmtDT(e.data)}${e.detalhe?' · ':''}${e.detalhe||''}</div>`:`<div style="font-size:var(--text-xs);color:var(--muted)">Não realizado</div>`}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Aprovador card -->
        ${(l.aprovadoPor||l.aprovadorNome)?`<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px 14px;display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('check-circle',16,'#fff')}
          </div>
          <div>
            <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:2px">Aprovado por</div>
            <div style="font-size:var(--text-md);font-weight:700">${l.aprovadoPor||l.aprovadorNome}</div>
            ${l.dataAprovacao?`<div style="font-size:var(--text-xs);color:var(--muted)">${fmtDT(l.dataAprovacao)}</div>`:''}
            ${l.aprovadorWa?`<div style="font-size:var(--text-xs);color:var(--muted)">${lc('message-circle',10,'currentColor')} ${l.aprovadorWa}</div>`:''}
          </div>
        </div>`:''}

        <!-- Itens por fornecedor -->
        ${Object.entries(bySup).map(([supId,itens])=>{
          const sup=parseInt(supId)?suppliers.find(s=>s.id===parseInt(supId)):null;
          const total=itens.reduce((s,i)=>s+(i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
          const totalRecebido=itens.reduce((s,i)=>s+(i.qtdRecebida??0)*(i.precoUnitFinal||i.precoUnitEstimado||0),0);
          return `<div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
              <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple);display:flex;align-items:center;gap:6px">
                ${lc('building-2',13,'var(--purple)')} ${sup?.name||'Fornecedor não definido'}
                ${sup?.seller?`<span style="font-size:var(--text-xs);color:var(--muted);font-weight:400">· ${sup.seller}</span>`:''}
              </div>
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple)">R$${fmt(total)}</div>
                ${(()=>{
                  // Datas de recebimento distintas neste grupo de fornecedor
                  const datas = [...new Set(itens.map(i=>i.dataRecebimentoItem||'').filter(Boolean))];
                  const confs = [...new Set(itens.map(i=>i.conferidoPorItem||'').filter(Boolean))];
                  if(!datas.length && !confs.length) return '';
                  return `<div style="font-size:var(--text-xs);color:var(--muted);background:var(--surface2);padding:3px 8px;border-radius:var(--r6);border:1px solid var(--border)">
                    ${confs.length?`${lc('user',10,'currentColor')} ${confs.join(', ')} `:' '}
                    ${datas.length?`${lc('calendar',10,'currentColor')} ${datas.map(d=>fmtD(d)).join(', ')}`:'' }
                  </div>`;
                })()}
              </div>
            </div>
            <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
              <table style="width:100%;border-collapse:collapse">
                <thead><tr style="background:var(--surface2)">
                  <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Item</th>
                  <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Pedido</th>
                  <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Recebido</th>
                  <th style="padding:7px 12px;text-align:right;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Preço unit.</th>
                  <th style="padding:7px 12px;text-align:right;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Total</th>
                  <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Conferência</th>
                  <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Status</th>
                </tr></thead>
                <tbody>
                  ${itens.map((i,iIdx)=>{
                    const qtdP=i.qtdAprovada??i.qtdSelecionada;
                    const qtdR=i.qtdRecebida??null;
                    const div=qtdR!==null?qtdR-qtdP:null;
                    const aprov=i.aprovado===true?`<span style="font-size:var(--text-2xs);font-weight:700;color:var(--green)">✓ Aprovado</span>`:i.aprovado===false?`<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red)">✗ Reprovado</span>`:`<span style="font-size:var(--text-2xs);color:var(--muted)">—</span>`;
                    return `<tr style="border-top:1px solid var(--border);background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
                      <td style="padding:7px 12px">
                        <div style="font-size:var(--text-sm);font-weight:600">${i.nome}</div>
                        <div style="font-size:var(--text-2xs);color:var(--muted)">${i.categoria}</div>
                        ${i.comentarioAprovador?`<div style="font-size:var(--text-2xs);color:var(--orange-dark);margin-top:2px">${lc('message-square',10,'currentColor')} ${i.comentarioAprovador}</div>`:''}
                        ${i.comentarioConferencia?`<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${lc('clipboard-list',10,'currentColor')} ${i.comentarioConferencia}</div>`:''}
                      </td>
                      <td style="padding:7px 12px;text-align:center;font-size:var(--text-sm);font-family:monospace">${fmt(qtdP)} ${i.unidade}</td>
                      <td style="padding:7px 12px;text-align:center;font-size:var(--text-sm);font-family:monospace;color:${div!==null&&div<0?'var(--red)':div!==null&&div>0?'var(--yellow)':'inherit'}">
                        ${qtdR!==null?fmt(qtdR)+' '+i.unidade:'—'}
                        ${div!==null&&Math.abs(div)>0.001?`<div style="font-size:var(--text-2xs)">${div>0?'+':''}${fmt(div)}</div>`:''}
                      </td>
                      <td style="padding:7px 12px;text-align:right;font-size:var(--text-sm);font-family:monospace">R$${fmt(i.precoUnitFinal||i.precoUnitEstimado||0)}</td>
                      <td style="padding:7px 12px;text-align:right;font-size:var(--text-sm);font-weight:700;font-family:monospace;color:var(--purple)">R$${fmt((i.qtdAprovada??i.qtdSelecionada)*(i.precoUnitFinal||i.precoUnitEstimado||0))}</td>
                      <td style="padding:7px 12px">
                        ${i.conferidoPorItem||i.dataRecebimentoItem?`
                          <div style="font-size:var(--text-xs);font-weight:600">${i.conferidoPorItem||'—'}</div>
                          <div style="font-size:var(--text-2xs);color:var(--muted)">${i.dataRecebimentoItem?fmtD(i.dataRecebimentoItem):''} ${i.horaRecebimentoItem||''}</div>
                        `:`<span style="font-size:var(--text-xs);color:var(--muted)">—</span>`}
                      </td>
                      <td style="padding:7px 12px;text-align:center">${aprov}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--purple-xlight);border-top:2px solid var(--purple-light)">
                    <td colspan="4" style="padding:7px 12px;font-size:var(--text-sm);font-weight:700">Total do fornecedor</td>
                    <td style="padding:7px 12px;text-align:right;font-size:var(--text-sm);font-weight:800;color:var(--purple);font-family:monospace">R$${fmt(total)}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>`;
        }).join('')}

        <!-- Itens presenciais -->
        ${itensPresencial.length?`<div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark);margin-bottom:8px;display:flex;align-items:center;gap:6px">
            ${lc('shopping-cart',13,'var(--orange-dark)')} Compra Presencial
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--orange-light)">
                <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Item</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Qtd</th>
                <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Local</th>
                <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Responsável</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Status</th>
              </tr></thead>
              <tbody>
                ${itensPresencial.map((i,iIdx)=>{
                  const aprov=i.aprovado===true?`<span style="font-size:var(--text-2xs);font-weight:700;color:var(--green)">✓ Aprovado</span>`:i.aprovado===false?`<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red)">✗ Reprovado</span>`:`<span style="font-size:var(--text-2xs);color:var(--muted)">—</span>`;
                  return `<tr style="border-top:1px solid var(--border);background:${iIdx%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:7px 12px"><div style="font-size:var(--text-sm);font-weight:600">${i.nome}</div></td>
                    <td style="padding:7px 12px;text-align:center;font-size:var(--text-sm);font-family:monospace">${fmt(i.qtdAprovada??i.qtdSelecionada)} ${i.unidade}</td>
                    <td style="padding:7px 12px;font-size:var(--text-sm)">${i.localCompra||'—'}</td>
                    <td style="padding:7px 12px;font-size:var(--text-sm)">${i.responsavelCompra||'—'}</td>
                    <td style="padding:7px 12px;text-align:center">${aprov}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`:''}

        <!-- Observações -->
        ${l.observacoes?`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:10px 14px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:5px">${lc('message-square',11,'var(--muted)')} Observações</div>
          <div style="font-size:var(--text-sm);color:var(--text)">${l.observacoes}</div>
        </div>`:''}

      </div><!-- /body -->
    </div>`;

  document.body.appendChild(popup);
  // Fechar ao clicar fora
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _reabrirLista(id) {
  const l = listas.find(x => x.id === id); if (!l) return;
  _abrirListaDetalhe(l.id);
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
let _timerInterval=null;
function _startTimer(elId,deadline) {
  clearInterval(_timerInterval);
  _timerInterval=setInterval(()=>{
    const el=document.getElementById(elId); if(!el){clearInterval(_timerInterval);return;}
    const ms=new Date(deadline)-Date.now();
    if(ms<=0){el.textContent='— Encerrado';el.style.color='var(--red)';clearInterval(_timerInterval);return;}
    const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
    el.textContent=`${h}h ${m}m ${s}s restantes`;
  },1000);
}

function encerrarListaManual() {
  if(!_listaAtual) return;
  vtpConfirm({
    title: 'Encerrar lista',
    message: 'A lista será movida para o histórico e não poderá mais ser editada.',
    confirmLabel: 'Encerrar',
    onConfirm: () => {
      _listaAtual.status='concluida'; _listaAtual.dataConclusao=new Date().toISOString(); _listaAtual.valorFinal=_listaAtual.valorEstimado||0;
      saveListas(); _listaAtual=getListaAtiva(); _cpListaAberta=null; renderComprasModule(); toast('Lista encerrada.');
    }
  });
}

function calcEconomia() {
  return listas.filter(l=>l.status==='concluida').reduce((s,l)=>s+Math.max(0,(l.valorEstimado||0)-(l.valorFinal||0)),0);
}

// ══════════════════════════════════════════════════════════════
// INTEGRAÇÃO GOOGLE DRIVE — ANEXAR NOTA FISCAL
// ══════════════════════════════════════════════════════════════

const _DRIVE_URL = 'https://script.google.com/macros/s/AKfycbxBJqwoZogKJF76yyq6igOJk72Stpc2LsmNw0ONlm724NbrR2AwrhUGi_HJW9Ebn2SA/exec';

// Abre modal para anexar NF do fornecedor (nível do grupo)
function _abrirAnexoNF(supKey, listaCodigo) {
  const sup = parseInt(supKey) ? suppliers.find(s => s.id === parseInt(supKey)) : null;
  const supNome = sup?.name || 'Presencial';

  // Anexos já salvos neste grupo
  const lista  = _listaAtual;
  if (!lista._nfAnexos) lista._nfAnexos = {};
  const anexos = lista._nfAnexos[supKey] || [];

  const popup = document.createElement('div');
  popup.id = '_popupNF';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:800;display:flex;align-items:center;justify-content:center;padding:16px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:480px;box-shadow:0 16px 60px rgba(0,0,0,.25)">
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--text-md);font-weight:800">${lc('file-text',15,'var(--purple)')} Nota Fiscal — ${supNome}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Lista ${listaCodigo} · Salvo no Google Drive</div>
        </div>
        <button onclick="document.getElementById('_popupNF').remove()" style="background:none;border:none;cursor:pointer;padding:6px">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
        <!-- Upload -->
        <label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;border:2px dashed var(--purple-light);border-radius:var(--r10);cursor:pointer;background:var(--purple-xlight)">
          ${lc('upload',24,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:600;color:var(--purple)">Selecionar arquivo</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">PDF, JPG, PNG — máx. 10MB</span>
          <input type="file" id="_nfFileInput" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
            onchange="_uploadNF(this,'${supKey}','${listaCodigo}','${supNome}')">
        </label>
        <!-- Status upload -->
        <div id="_nfStatus" style="display:none;padding:10px 14px;border-radius:var(--r8);font-size:var(--text-sm);font-weight:600"></div>
        <!-- Lista de anexos -->
        ${anexos.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Arquivos enviados</div>
          ${anexos.map(a => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border-radius:var(--r8);border:1px solid var(--border)">
              ${lc('file-text',14,'var(--purple)')}
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.fileName}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted)">${a.data ? new Date(a.data).toLocaleString('pt-BR') : ''}</div>
              </div>
              <a href="${a.viewUrl}" target="_blank"
                style="padding:4px 10px;border:1.5px solid var(--purple);border-radius:var(--r6);color:var(--purple);font-size:var(--text-xs);font-weight:600;text-decoration:none;white-space:nowrap">
                ${lc('external-link',11,'currentColor')} Ver
              </a>
            </div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

// Anexar arquivo a um item específico do recebimento
function _abrirAnexoRecebimento(itemId, listaCodigo) {
  const item = _listaAtual?.itens?.find(i => i.id === itemId);
  if (!item) return;
  const supNome = item.nome || item.name || 'Item';

  const popup = document.createElement('div');
  popup.id = '_popupAnexoItem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:800;display:flex;align-items:center;justify-content:center;padding:16px';
  const anexos = item.anexos || [];
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:480px;box-shadow:0 16px 60px rgba(0,0,0,.25)">
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--text-md);font-weight:800">${lc('paperclip',15,'var(--purple)')} Anexar documento</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${supNome} · Lista ${listaCodigo}</div>
        </div>
        <button onclick="document.getElementById('_popupAnexoItem').remove()" style="background:none;border:none;cursor:pointer;padding:6px">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
        <label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;border:2px dashed var(--purple-light);border-radius:var(--r10);cursor:pointer;background:var(--purple-xlight)">
          ${lc('upload',24,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:600;color:var(--purple)">Selecionar arquivo</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">PDF, JPG, PNG — máx. 10MB</span>
          <input type="file" id="_nfFileInputItem" accept=".pdf,.jpg,.jpeg,.png" style="display:none"
            onchange="_uploadNFItem(this,${itemId},'${listaCodigo}')">
        </label>
        <div id="_nfStatusItem" style="display:none;padding:10px 14px;border-radius:var(--r8);font-size:var(--text-sm);font-weight:600"></div>
        ${anexos.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Arquivos enviados</div>
          ${anexos.map(a => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border-radius:var(--r8);border:1px solid var(--border)">
              ${lc('file-text',14,'var(--purple)')}
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.fileName}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted)">${a.data ? new Date(a.data).toLocaleString('pt-BR') : ''}</div>
              </div>
              <a href="${a.viewUrl}" target="_blank" style="padding:4px 10px;border:1.5px solid var(--purple);border-radius:var(--r6);color:var(--purple);font-size:var(--text-xs);font-weight:600;text-decoration:none">${lc('external-link',11,'currentColor')} Ver</a>
            </div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

// Upload da NF do fornecedor (nível grupo)
async function _uploadNF(input, supKey, listaCodigo, supNome) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('Arquivo muito grande (máx. 10MB)', 'err'); return; }

  const statusEl = document.getElementById('_nfStatus');
  if (statusEl) { statusEl.style.display='block'; statusEl.style.background='var(--yellow-light)'; statusEl.style.color='var(--orange-dark)'; statusEl.textContent='⏳ Enviando para o Google Drive...'; }

  try {
    const b64 = await _fileToBase64(file);
    const u   = typeof getCurrentUser==='function' ? getCurrentUser() : null;
    const json = await _postToGAS(_DRIVE_URL, {
        fileName:    listaCodigo + '_' + supNome.replace(/\s/g,'_') + '_' + file.name,
        fileContent: b64,
        mimeType:    file.type,
        listaCodigo,
        fornecedor:  supNome,
      });
    if (!json.ok) throw new Error(json.error);

    // Salva referência na lista
    if (!_listaAtual._nfAnexos) _listaAtual._nfAnexos = {};
    if (!_listaAtual._nfAnexos[supKey]) _listaAtual._nfAnexos[supKey] = [];
    const nfNome = listaCodigo + '_' + supNome.replace(/\s/g,'_') + '_' + file.name;
    _listaAtual._nfAnexos[supKey].push({ fileName: nfNome, viewUrl: 'https://drive.google.com/drive/folders/14YHsIhoHv3TU4oh8U_ye1S_3wr0vWOzT', data: new Date().toISOString(), user: u?.name||'Sistema' });
    saveListas();

    const driveUrl = json.viewUrl || 'https://drive.google.com/drive/folders/14YHsIhoHv3TU4oh8U_ye1S_3wr0vWOzT';
    const pasta    = json.pasta || ('COMPRAS/' + listaCodigo + '/NOTAS/');
    if (statusEl) { statusEl.style.background='var(--green-light)'; statusEl.style.color='var(--green)'; statusEl.innerHTML=`✅ Salvo em <strong>${pasta}</strong> · <a href="${driveUrl}" target="_blank" style="color:var(--purple)">Abrir no Drive →</a>`; }
    toast('Nota fiscal salva no Google Drive!', 'ok');
    // Atualiza URL com a real retornada pelo Drive
    if (json.viewUrl) _listaAtual._nfAnexos[supKey].slice(-1)[0].viewUrl = json.viewUrl;
    saveListas();
    setTimeout(() => { document.getElementById('_popupNF')?.remove(); _renderEtapa4Recebimento(); }, 3000);
  } catch(e) {
    if (statusEl) { statusEl.style.background='var(--red-light)'; statusEl.style.color='var(--red)'; statusEl.textContent='❌ Erro: ' + e.message; }
    toast('Erro ao enviar: ' + e.message, 'err');
  }
}

// Upload de documento de item individual
async function _uploadNFItem(input, itemId, listaCodigo) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('Arquivo muito grande (máx. 10MB)', 'err'); return; }

  const item = _listaAtual?.itens?.find(i => i.id === itemId);
  if (!item) return;

  const statusEl = document.getElementById('_nfStatusItem');
  if (statusEl) { statusEl.style.display='block'; statusEl.style.background='var(--yellow-light)'; statusEl.style.color='var(--orange-dark)'; statusEl.textContent='⏳ Enviando para o Google Drive...'; }

  try {
    const b64 = await _fileToBase64(file);
    const u   = typeof getCurrentUser==='function' ? getCurrentUser() : null;
    const json = await _postToGAS(_DRIVE_URL, {
        fileName:    listaCodigo + '_' + (item.nome||'item') + '_' + file.name,
        fileContent: b64,
        mimeType:    file.type,
        listaCodigo,
        fornecedor:  item.nome || 'item',
      });
    if (!json.ok) throw new Error(json.error);

    if (!item.anexos) item.anexos = [];
    const itemNome = listaCodigo + '_' + (item.nome||'item') + '_' + file.name;
    item.anexos.push({ fileName: itemNome, viewUrl: 'https://drive.google.com/drive/folders/14YHsIhoHv3TU4oh8U_ye1S_3wr0vWOzT', data: new Date().toISOString(), user: u?.name||'Sistema' });
    saveListas();

    const driveUrl2 = json.viewUrl || 'https://drive.google.com/drive/folders/14YHsIhoHv3TU4oh8U_ye1S_3wr0vWOzT';
    if (statusEl) { statusEl.style.background='var(--green-light)'; statusEl.style.color='var(--green)'; statusEl.innerHTML=`✅ Enviado! <a href="${driveUrl2}" target="_blank" style="color:var(--purple)">Abrir no Drive →</a>`; }
    toast('Documento enviado!', 'ok');
    if (json.viewUrl) item.anexos.slice(-1)[0].viewUrl = json.viewUrl;
    saveListas();
    setTimeout(() => { document.getElementById('_popupAnexoItem')?.remove(); _renderEtapa4Recebimento(); }, 3000);
  } catch(e) {
    if (statusEl) { statusEl.style.background='var(--red-light)'; statusEl.style.color='var(--red)'; statusEl.textContent='❌ Erro: ' + e.message; }
    toast('Erro ao enviar: ' + e.message, 'err');
  }
}

// Converte File para base64
function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// POST para Google Apps Script como form-encoded (simple request — sem CORS preflight)
// GAS lê via e.parameter.payload
async function _postToGAS(url, data) {
  const params = new URLSearchParams();
  params.append('payload', JSON.stringify(data));

  const res = await fetch(url, {
    method: 'POST',
    body: params,
    // Content-Type: application/x-www-form-urlencoded → simple request, sem preflight
    redirect: 'follow',
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { return { ok: true, raw: text }; }
}

// Alias para compatibilidade
function _renderEtapa4Recebimento() { _renderRecebimento?.() || _renderEtapa4?.(); }


// ── Insumos dentro do módulo Compras ─────────────────────────
function _renderCpInsumos() {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${lc('package', 16, 'var(--purple)')} Insumos</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Matérias-primas e ingredientes usados na produção</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="inp" style="max-width:200px;padding:7px 12px" id="srchCadInsumos" placeholder=" Buscar..." oninput="renderCadInsumos()">
          <select class="inp" style="max-width:160px;padding:7px 10px" id="catCadFil" onchange="renderCadInsumos()"><option value="">Todas categorias</option></select>
          <button class="btn btn-outline btn-sm" onclick="abrirImportCadInsumos()" style="display:flex;align-items:center;gap:5px">
            ${lc('upload', 13, 'currentColor')} Importar
          </button>
          <button class="btn btn-primary btn-sm" onclick="openItemModal()">+ Novo Insumo</button>
        </div>
      </div>
      <div id="cadInsumosGrid"></div>
    </div>`;
  renderCadInsumos();
}

// ── Fornecedores dentro do módulo Compras ────────────────────
function _renderCpFornecedores() {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;
  el.innerHTML = `
    <div style="padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${lc('truck', 16, 'var(--purple)')} Fornecedores</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Cadastro de fornecedores e condições comerciais</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="inp" style="max-width:180px;padding:7px 12px" id="srchCadForn" placeholder=" Buscar..." oninput="renderFornecedores()">
          <select class="inp" id="filFornCat" style="max-width:160px;padding:7px 12px" onchange="renderFornecedores()">
            <option value="">Todas categorias</option>
            <option value="alimentos">Alimentos</option>
            <option value="suprimentos">Suprimentos</option>
            <option value="bebidas">Bebidas</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="openSupModal()">+ Novo Fornecedor</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px" id="supGrid"></div>
    </div>`;
  renderFornecedores();
}

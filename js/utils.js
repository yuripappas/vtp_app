/**
 * VTP Compras — Vai Ter Pizza!
 * utils.js — Funções utilitárias, helpers e UI geral
 */

const gst   = i => i.qty <= i.min * .4 ? 'crit' : i.qty < i.min ? 'warn' : i.qty < i.ideal ? 'warn' : 'ok';
const gneed = i => Math.max(0, i.ideal - i.qty);
const fmt   = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD  = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtDT = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const sname = id => { const s = suppliers.find(x => x.id === id); return s ? s.name : '—'; };
const genToken = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.innerHTML = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.className = 'toast', 3000);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.overlay').forEach(o =>
  o.addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  })
);

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', sidebarOpen);
  document.getElementById('toggleIcon').innerHTML = sidebarOpen
    ? '<path d="M8 2l-4 4 4 4"/>'
    : '<path d="M4 2l4 4-4 4"/>';
  document.getElementById('sbToggle').style.left = sidebarOpen
    ? `calc(var(--sb-w) - 12px)`
    : `calc(var(--sb-min) - 12px)`;
}

// ══════════════════════════════════════════════════════════════
// MOBILE NAV — drawer lateral + submenu drill-down
// ══════════════════════════════════════════════════════════════

function isMobile() { return window.innerWidth <= 768; }

let _mobileMenuOpen      = false;
let _mobileSubmenuActive = false;

const _MB_HAMBURGER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const _MB_CLOSE     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

function toggleMobileMenu() {
  _mobileMenuOpen = !_mobileMenuOpen;
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobileBackdrop');
  const btn      = document.getElementById('mobileMenuBtn');

  if (_mobileMenuOpen) {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('visible');
    btn.innerHTML = _MB_CLOSE;
    // Trava scroll do body para evitar scroll-behind
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('visible');
    btn.innerHTML = _MB_HAMBURGER;
    // Restaura scroll
    document.body.style.overflow = '';
    if (_mobileSubmenuActive) _closeMobileSubmenu();
  }
}

// Submenu items de Operação
const _OPERACAO_SUBMENU_ITEMS = [
  { id: 'estoque',     icon: 'package',      label: 'Estoque'      },
  { id: 'preproducao', icon: 'chef-hat',     label: 'Pré-produção' },
  { id: 'desperdicio', icon: 'trash-2',      label: 'Desperdício'  },
  { id: 'previsao',    icon: 'trending-up',  label: 'Previsão'     },
  { id: 'checklist',   icon: 'check-square', label: 'Checklist'    },
  { id: 'manutencao',  icon: 'wrench',       label: 'Manutenção'   },
  { id: 'inventario',  icon: 'layers',       label: 'Inventário'   },
  { id: 'etiquetagem', icon: 'tag',          label: 'Etiquetagem'  },
];

// Submenu items de Configurações
const _CFG_SUBMENU_ITEMS = [
  { id: 'empresa',      icon: 'building-2', label: 'Empresa'        },
  { id: 'usuarios',     icon: 'shield',     label: 'Usuários'       },
  { id: 'preparo',      icon: 'chef-hat',   label: 'Preparados'     },
  { id: 'produtos',     icon: 'pizza',      label: 'Produtos'       },
  { id: 'servicos',     icon: 'wrench',     label: 'Serviços'       },
  { id: 'modulos',      icon: 'settings',   label: 'Personalização' },
  { id: 'integracoes',  icon: 'zap',        label: 'Integrações'    },
  { id: 'etiquetagem', icon: 'tag',        label: 'Etiquetagem'    },
];

function _openMobileSubmenu(items, parentLabel) {
  const sidebar = document.getElementById('sidebar');
  const nav     = sidebar.querySelector('.sb-nav');
  const bottom  = sidebar.querySelector('.sb-bottom');
  _mobileSubmenuActive = true;

  nav._origHTML    = nav.innerHTML;
  bottom._origDisp = bottom.style.display;
  bottom.style.display = 'none';

  nav.innerHTML = `
    <button class="sb-mobile-back" onclick="_closeMobileSubmenu()">
      ${lc('arrow-left', 16, 'currentColor')}
      ${parentLabel}
    </button>
    <div class="sb-mobile-submenu-label">${parentLabel}</div>
    ${items.map(item => `
      <button class="sb-item" style="justify-content:flex-start;gap:10px" onclick="${item.action}">
        <span class="sb-icon">${lc(item.icon, 18, 'currentColor')}</span>
        <span class="sb-label" style="opacity:1;width:auto">${item.label}</span>
      </button>
    `).join('')}
  `;
}

function _closeMobileSubmenu() {
  const sidebar = document.getElementById('sidebar');
  const nav    = sidebar.querySelector('.sb-nav');
  const bottom = sidebar.querySelector('.sb-bottom');
  if (nav._origHTML !== undefined) {
    nav.innerHTML    = nav._origHTML;
    nav._origHTML    = undefined;
    bottom.style.display = bottom._origDisp || '';
  }
  _mobileSubmenuActive = false;
}

// ══════════════════════════════════════════════════════════════
// SUB-PANEL — two-column nav (desktop) estilo Intercom
// ══════════════════════════════════════════════════════════════

let _subPanelGroupId = null;

function _openSubPanel(items, parentLabel, groupId) {
  // Mesmo grupo: toggle
  if (_subPanelGroupId === groupId) { _closeSubPanel(); return; }

  _subPanelGroupId = groupId;

  const panel    = document.getElementById('sbSubPanel');
  const header   = document.getElementById('sbSubPanelHeader');
  const itemsEl  = document.getElementById('sbSubPanelItems');
  if (!panel) return;

  header.textContent = parentLabel;
  itemsEl.innerHTML  = items.map(item => `
    <button class="sb-sub-item" onclick="${item.action}">
      ${lc(item.icon, 15, 'currentColor')}
      <span>${item.label}</span>
    </button>`).join('');

  panel.classList.add('open');

  // Destaca o grupo no sidebar principal
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`nav-${groupId}`)?.classList.add('active');
}

function _closeSubPanel() {
  _subPanelGroupId = null;
  document.getElementById('sbSubPanel')?.classList.remove('open');
}

// Marca um sub-item como ativo dentro do painel aberto
function _setSubPanelActive(selector) {
  document.querySelectorAll('#sbSubPanelItems .sb-sub-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`#sbSubPanelItems .sb-sub-item[onclick*="${selector}"]`);
  if (btn) btn.classList.add('active');
}

// ── Hover-expand sidebar (só desktop, só quando sidebar colapsado) ──
function _initSidebarHover() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.addEventListener('mouseenter', () => {
    if (!sidebarOpen && !_subPanelGroupId) sidebar.classList.add('hover-expand');
  });
  sidebar.addEventListener('mouseleave', () => {
    sidebar.classList.remove('hover-expand');
  });
}

// Submenu items de Compras
const _COMPRAS_SUBMENU_ITEMS = [
  { id: 'listas',       icon: 'clipboard-list', label: 'Lista de Compras' },
  { id: 'insumos',      icon: 'package',        label: 'Insumos'          },
  { id: 'fornecedores', icon: 'truck',          label: 'Fornecedores'     },
  { id: 'estoque',      icon: 'archive',        label: 'Estoque'          },
];

function _handleNavCompras() {
  if (window.innerWidth <= 480) {
    _openMobileSubmenu(
      _COMPRAS_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `_cpSection='${item.id}'; goModule('compras');`
      })),
      'Compras'
    );
  } else {
    _openSubPanel(
      _COMPRAS_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `_cpSection='${item.id}'; goModule('compras');`
      })),
      'Compras',
      'compras'
    );
  }
}

function _handleNavOperacao() {
  if (window.innerWidth <= 480) {
    _openMobileSubmenu(
      _OPERACAO_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `goModule('${item.id}');`
      })),
      'Operação'
    );
  } else {
    _openSubPanel(
      _OPERACAO_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `goModule('${item.id}');`
      })),
      'Operação',
      'operacao'
    );
  }
}

function _handleNavConfiguracoes() {
  if (window.innerWidth <= 480) {
    _openMobileSubmenu(
      _CFG_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `_cfgSection='${item.id}'; goModule('configuracoes');`
      })),
      'Configurações'
    );
  } else {
    _openSubPanel(
      _CFG_SUBMENU_ITEMS.map(item => ({
        ...item,
        action: `_cfgSection='${item.id}'; goModule('configuracoes');`
      })),
      'Configurações',
      'configuracoes'
    );
  }
}

const modInfo = {
  dashboard:      { title: 'Dashboard',             sub: 'Visão geral do sistema' },
  operacao:       { title: 'Operação',              sub: 'Estoque · Produção · Checklist · Inventário e mais' },
  omnichannel:    { title: 'Omnichannel',           sub: 'Central de atendimento e canais de venda' },
  estoque:        { title: 'Estoque',               sub: 'Contagem e movimentações' },
  preproducao:    { title: 'Pré-produção',           sub: 'Ordens de produção interna' },
  desperdicio:    { title: 'Controle de Desperdício', sub: 'Monitore perdas e seu impacto financeiro' },
  compras:        { title: 'Compras',               sub: 'Carrinho · Cotação · Aprovação · OC · Recebimento' },
  cadastros:      { title: 'Cadastros',             sub: 'Insumos · Fornecedores · Pré-preparo' },
  previsao:       { title: 'Previsão de Demanda',   sub: 'Planejamento do dia · Massas · Fermento · Motoboys' },
  configuracoes:  { title: 'Configurações',         sub: 'WhatsApp da empresa · preferências do sistema' },
  relatorios:     { title: 'Relatórios',            sub: 'Histórico, análises e inteligência' },
  usuarios:       { title: 'Usuários & Permissões', sub: 'Gestão de acesso à plataforma' },
  checklist:      { title: 'Checklist',             sub: 'Tarefas diárias · Controle de equipe' },
  manutencao:     { title: 'Manutenção',             sub: 'Equipamentos · Preventiva · Documentos · Histórico' },
  inventario:     { title: 'Inventário',             sub: 'Ativos · Utensílios · Contagem mensal' },
  alertas:        { title: 'Alertas',                sub: 'Notificações de movimentações e eventos do sistema' },
  rh:             { title: 'RH',                     sub: 'Escala · Presença · Horas Extras · Materiais · Indicadores' },
  auditoria:      { title: 'Auditoria',              sub: 'Log de ações · Rastreabilidade · Histórico do sistema' },
  etiquetagem:    { title: 'Etiquetagem',             sub: 'Impressão · Validades · Produção · Cadastros' },
};

// ─── Hash-based routing ────────────────────────────────────────
// Grava o módulo atual no hash da URL (ex: app.vaiterpizza.com/#estoque)
// para que o refresh restaure a mesma página.

let _vtpNavFromPop = false; // flag para evitar loop no popstate

function _vtpPushRoute(mod) {
  // Normaliza: 'usuarios' exibe dentro de configuracoes
  const hashMod = mod === 'usuarios' ? 'configuracoes' : mod;
  history.pushState({ mod: hashMod }, '', '#' + hashMod);
}

// Botão Voltar / Avançar do navegador
window.addEventListener('popstate', e => {
  const mod = e.state?.mod || location.hash.replace('#', '') || 'dashboard';
  if (modInfo[mod]) { _vtpNavFromPop = true; goModule(mod); _vtpNavFromPop = false; }
});

// Chamado pelo initAuth para restaurar a rota salva no hash
function _vtpRestoreRoute() {
  const hash = location.hash.replace('#', '').trim();
  const mod  = hash && modInfo[hash] ? hash : 'dashboard';
  // Verifica permissão antes de restaurar
  if (mod !== 'dashboard' && typeof canAccess === 'function' && !canAccess(mod)) {
    goModule('dashboard');
    return;
  }
  goModule(mod);
}

function goModule(mod) {
  // Operação e Configurações sem seção definida → abrem submenu no sidebar
  if (mod === 'operacao') { _handleNavOperacao(); return; }

  // Verifica permissão
  if (typeof canAccess === 'function' && !canAccess(mod)) {
    toast('Acesso não permitido para seu perfil', 'err');
    return;
  }

  // Atualiza URL (não duplica entrada se veio do popstate)
  if (!_vtpNavFromPop) _vtpPushRoute(mod);

  // Fecha drawer mobile ao navegar
  if (_mobileSubmenuActive) _closeMobileSubmenu();
  if (_mobileMenuOpen) toggleMobileMenu();
  // Fecha sub-panel desktop sempre que navegar
  if (_subPanelGroupId) _closeSubPanel();

  const _OPERACAO_MODS = ['estoque','preproducao','desperdicio','previsao','checklist','manutencao','inventario','etiquetagem'];

  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  // Submódulos de Operação destacam o item "Operação" no sidebar
  if (_OPERACAO_MODS.includes(mod)) {
    document.getElementById('nav-operacao')?.classList.add('active');
  } else {
    document.getElementById(`nav-${mod}`)?.classList.add('active');
  }
  // Configurações tem dois botões (nav e rodapé) — ativa ambos
  if (mod === 'configuracoes') {
    document.getElementById('nav-configuracoes-bottom')?.classList.add('active');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${mod}`)?.classList.add('active');
  const info = modInfo[mod];
  if (info) {
    document.getElementById('topbarTitle').textContent = info.title;
    document.getElementById('topbarSub').textContent   = info.sub;
    // Mobile: atualiza título do topbar e fecha drawer
    const mobileTitle = document.getElementById('mobileModuleTitle');
    if (mobileTitle) mobileTitle.textContent = info.title;
  }
  if (mod === 'operacao')        renderOperacao();
  else if (mod === 'omnichannel') renderOmnichannel();
  else if (mod === 'dashboard')  renderDashboard();
  else if (mod === 'estoque')    renderEstoque();
  else if (mod === 'preproducao') renderPreproducao();
  else if (mod === 'compras')    renderComprasModule();
  else if (mod === 'cadastros')  renderCadastros();
  else if (mod === 'desperdicio')   renderDesperdicio();
  else if (mod === 'previsao')      renderPrevisao();
  else if (mod === 'configuracoes') renderConfiguracoes();
  else if (mod === 'relatorios') renderRelatorios();
  else if (mod === 'usuarios') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-configuracoes')?.classList.add('active');
    _cfgSection = 'usuarios';
    renderConfiguracoes();
  }
  else if (mod === 'checklist')  renderChecklist();
  else if (mod === 'manutencao') renderManutencao();
  else if (mod === 'inventario') {
    if (typeof renderInventario !== 'function') {
      document.getElementById('page-inventario').innerHTML =
        '<div style="padding:32px 24px;color:var(--red);font-size:var(--text-sm);font-weight:700">inventario.js não carregou — verifique o console (F12)</div>';
    } else { renderInventario(); }
  }
  else if (mod === 'alertas')      renderAlertas();
  else if (mod === 'rh')           renderRh();
  else if (mod === 'auditoria')    renderAuditoria();
  else if (mod === 'etiquetagem')  renderEtiquetagem();
}

function calcScore(price, delivery, payTerm, minP, maxP, minD, maxD) {
  const ps  = minP === maxP ? 100 : 100 - (((price - minP)    / (maxP - minP)) * 100);
  const ds  = minD === maxD ? 100 : 100 - (((delivery - minD) / (maxD - minD)) * 100);
  const pms = Math.min(100, (parseInt(payTerm) || 0) / 60 * 100);
  return Math.round(ps * .5 + ds * .3 + pms * .2);
}

function calcEconomia() {
  return cycleHistory.reduce((s, c) => s + c.economia, 0);
}

let _vtpConfirmCallback = null;

function vtpConfirm({ title, message, confirmLabel = 'Confirmar', onConfirm, danger = true } = {}) {
  _vtpConfirmCallback = onConfirm || null;
  document.getElementById('vtpConfirmTitle').textContent = title || 'Confirmar ação';
  document.getElementById('vtpConfirmMsg').textContent   = message || '';
  document.getElementById('vtpConfirmBtn').textContent   = confirmLabel;

  const btn  = document.getElementById('vtpConfirmBtn');
  const icon = document.getElementById('vtpConfirmIcon');

  btn.className  = danger ? 'btn btn-red' : 'btn btn-primary';
  icon.className = danger ? 'confirm-icon danger' : 'confirm-icon info';
  icon.innerHTML = danger
    ? lc('trash-2', 20, 'var(--danger-fg)')
    : lc('help-circle', 20, 'var(--accent)');

  document.getElementById('vtpConfirmOverlay').classList.add('open');
}

function vtpConfirmClose() {
  document.getElementById('vtpConfirmOverlay').classList.remove('open');
  _vtpConfirmCallback = null;
}

function vtpConfirmExec() {
  const cb = _vtpConfirmCallback;
  vtpConfirmClose();
  if (typeof cb === 'function') cb();
}

// Inicia hover-expand do sidebar (chamado após DOM pronto)
_initSidebarHover();

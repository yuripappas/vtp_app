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

// Reposiciona a seta de colapsar/expandir — reaproveitado pelo estado de
// submenu aberto, além do próprio toggleSidebar(). Colapsada, a sidebar é
// só uma tarja fina (--sb-min), então a seta fica num offset fixo perto
// da borda em vez de derivar de --sb-min (que ficaria negativo).
function _positionSbToggle(expanded) {
  const toggle = document.getElementById('sbToggle');
  if (toggle) toggle.style.left = expanded
    ? `calc(var(--sb-w) - 12px)`
    : `2px`;
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('open', sidebarOpen);
  document.getElementById('toggleIcon').innerHTML = sidebarOpen
    ? '<path d="M8 2l-4 4 4 4"/>'
    : '<path d="M4 2l4 4-4 4"/>';
  _positionSbToggle(sidebarOpen);
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
  { id: 'preproducao', icon: 'chef-hat',     label: 'Pré-produção' },
  { id: 'desperdicio', icon: 'trash-2',      label: 'Desperdício'  },
  { id: 'previsao',    icon: 'trending-up',  label: 'Previsão'     },
  { id: 'manutencao',  icon: 'wrench',       label: 'Manutenção'   },
  { id: 'inventario',  icon: 'layers',       label: 'Inventário'   },
];

// Submenu items de Vendas
const _VENDAS_SUBMENU_ITEMS = [
  { id: 'cmv',           icon: 'dollar-sign', label: 'CMV'                     },
  { id: 'produtos',      icon: 'bar-chart-2', label: 'Produtos (Curva ABC)'    },
  { id: 'insumos',       icon: 'package',     label: 'Consumo de Insumos'      },
  { id: 'canais',        icon: 'link',        label: 'Vendas'                  },
  { id: 'precos',        icon: 'tag',         label: 'Precificação'            },
];

function _handleNavVendas() {
  const action = (id) => `_vdTab='${id}'; goModule('vendas');`;
  _openMobileSubmenu(_VENDAS_SUBMENU_ITEMS.map(item => ({ ...item, action: action(item.id) })), 'Vendas');
}

function _openMobileSubmenu(items, parentLabel) {
  const sidebar = document.getElementById('sidebar');
  const nav     = sidebar.querySelector('.sb-nav');
  const bottom  = sidebar.querySelector('.sb-bottom'); // rodapé não existe mais no sidebar (header global) — segue opcional
  _mobileSubmenuActive = true;
  sidebar.classList.add('submenu-open');
  if (!isMobile()) _positionSbToggle(true);

  nav._origHTML = nav.innerHTML;
  if (bottom) {
    bottom._origDisp = bottom.style.display;
    bottom.style.display = 'none';
  }

  nav.innerHTML = `
    <button class="sb-mobile-back" onclick="_closeMobileSubmenu()">
      ${lc('arrow-left', 16, 'currentColor')}
      Voltar
    </button>
    <div class="sb-mobile-submenu-label">${parentLabel}</div>
    ${items.map(item => `
      <button class="sb-item sb-item-plain" onclick="${item.action}">
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
    if (bottom) bottom.style.display = bottom._origDisp || '';
  }
  _mobileSubmenuActive = false;
  sidebar.classList.remove('submenu-open');
  if (!isMobile() && !sidebarOpen) _positionSbToggle(false);
}

// Marca um sub-item como ativo dentro do drill-down aberto (chamada por
// renderOmnichannel() em js/atendimento.js — mantém a mesma assinatura,
// só aponta pro drill-down único do .sb-nav em vez do antigo painel de 2 colunas).
function _setSubPanelActive(selector) {
  document.querySelectorAll('.sb-nav .sb-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.sb-nav .sb-item[onclick*="${selector}"]`);
  if (btn) btn.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
// SWITCHER DE EMPRESA/UNIDADE — dropdown ancorado na caixa do topo da sidebar
// ══════════════════════════════════════════════════════════════

function toggleBrandSwitcher(anchorEl) {
  const existing = document.getElementById('brandSwitcherPopup');
  if (existing) { existing.remove(); return; }

  const cfg      = typeof getConfig === 'function' ? getConfig() : {};
  const nome     = cfg.empresa  || 'Vai Ter Pizza!';
  const endereco = cfg.endereco || 'Unidade principal';
  const logoSrc  = document.getElementById('sbLogoImg')?.src || 'assets/logo-bg.jpg';

  const rect  = anchorEl?.getBoundingClientRect() || { left: 16, bottom: 60 };
  const cardW = 260;
  const left  = Math.max(8, Math.min(rect.left, window.innerWidth - cardW - 12));
  const top   = rect.bottom + 8;

  const wrap = document.createElement('div');
  wrap.id = 'brandSwitcherPopup';
  // z-index acima do drawer mobile (950) — o chevron vive dentro da própria sidebar,
  // diferente do sino/config (fora do drawer), então precisa ficar por cima dele.
  wrap.style.cssText = 'position:fixed;inset:0;z-index:960';
  wrap.innerHTML = `
    <div style="position:fixed;top:${top}px;left:${left}px;width:${cardW}px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-xl);box-shadow:0 16px 48px rgba(0,0,0,.16);overflow:hidden">
      <div style="padding:10px 14px;font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-subtle);border-bottom:1px solid var(--border)">Empresas &amp; unidades</div>
      <div style="padding:8px">
        <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--radius-md);background:var(--accent-subtle)">
          <div style="width:30px;height:30px;border-radius:var(--radius-md);overflow:hidden;flex-shrink:0">
            <img src="${logoSrc}" style="width:100%;height:100%;object-fit:cover">
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            <div style="font-size:var(--text-2xs);color:var(--fg-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${endereco}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
      <button onclick="document.getElementById('brandSwitcherPopup')?.remove(); toast('Em breve: múltiplas empresas e unidades','info')"
        style="width:100%;padding:11px;border:none;border-top:1px solid var(--border);background:var(--bg-subtle);color:var(--purple);font-weight:700;font-size:var(--text-xs);cursor:pointer;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px">
        + Adicionar empresa/unidade
      </button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
}

// Submenu items de Compras
const _COMPRAS_SUBMENU_ITEMS = [
  { id: 'listas',       icon: 'clipboard-list', label: 'Lista de Compras' },
  { id: 'fornecedores', icon: 'truck',          label: 'Fornecedores'     },
];

function _handleNavCompras() {
  _openMobileSubmenu(
    _COMPRAS_SUBMENU_ITEMS.map(item => ({
      ...item,
      action: `_cpSection='${item.id}'; goModule('compras');`
    })),
    'Compras'
  );
}

function _handleNavOperacao() {
  _openMobileSubmenu(
    _OPERACAO_SUBMENU_ITEMS.map(item => ({
      ...item,
      action: `goModule('${item.id}');`
    })),
    'Operação'
  );
}

// Submenu items de Omnichannel
const _OMNI_SUBMENU_ITEMS = [
  { id: 'inbox',            icon: 'inbox',       label: 'Inbox'             },
  { id: 'respostas',        icon: 'zap',         label: 'Respostas'         },
  { id: 'avaliacoes-ifood', icon: 'star',        label: 'Avaliações iFood'  },
  { id: 'estatisticas',     icon: 'bar-chart-2', label: 'Estatísticas'      },
  { id: 'integracoes',      icon: 'link',        label: 'Integrações'       },
  { id: 'configuracoes',    icon: 'settings',    label: 'Configurações'     },
];

function _handleNavOmnichannel() {
  const action = (id) => `_atdPaginaAtiva='${id}'; goModule('omnichannel');`;
  _openMobileSubmenu(
    _OMNI_SUBMENU_ITEMS.map(item => ({ ...item, action: action(item.id) })),
    'Omnichannel'
  );
}

const modInfo = {
  dashboard:      { title: 'Dashboard',             sub: 'Visão geral do sistema' },
  operacao:       { title: 'Operação',              sub: 'Pré-produção · Desperdício · Previsão · Manutenção · Inventário' },
  omnichannel:    { title: 'Omnichannel',           sub: 'Central de atendimento e canais de venda' },
  estoque:        { title: 'Estoque',               sub: 'Contagem e movimentações' },
  preproducao:    { title: 'Pré-produção',           sub: 'Ordens de produção interna' },
  desperdicio:    { title: 'Controle de Desperdício', sub: 'Monitore perdas e seu impacto financeiro' },
  compras:        { title: 'Compras',               sub: 'Lista · Cotação · Aprovação · OC · Recebimento · Fornecedores' },
  vendas:         { title: 'Vendas',                sub: 'CMV · Produtos · Consumo de Insumos · Vendas · Precificação — interpretado dos pedidos' },
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

// ══════════════════════════════════════════════════════════════
// REALTIME — Fase 2: subscription única em kv_store
// ══════════════════════════════════════════════════════════════

// Chave → módulos que a usam (para saber quem re-renderizar)
const _VTP_KEY_MODS = {
  'vtp_items':          ['estoque','compras','cadastros','dashboard','inventario'],
  'vtp_listas':         ['compras','dashboard'],
  'vtp_suppliers':      ['compras','cadastros'],
  'vtp_funcionarios':   ['rh','dashboard','configuracoes'],
  'vtp_rh_escalas':     ['rh'],
  'vtp_rh_presencas':   ['rh'],
  'vtp_rh_horasextras': ['rh'],
  'vtp_rh_materiais':   ['rh'],
  'vtp_rh_periodos':    ['rh'],
  'vtp_rh_config':      ['rh'],
  'vtp_rh_diaristas':   ['rh'],
  'vtp_rh_avaliacoes':  ['rh'],
  'vtp_movimentacoes':  ['estoque'],
  'vtp_hist_contagens': ['estoque'],
  'vtp_ck_templates':   ['checklist'],
  'vtp_ck_sessoes':     ['checklist'],
  'vtp_manut_itens':    ['manutencao'],
  'vtp_manut_equip':    ['manutencao'],
  'vtp_manut_log':      ['manutencao'],
  'vtp_contagens_inv':  ['inventario'],
  'vtp_inv_baixas':     ['inventario'],
  'vtp_desperdicios':   ['desperdicio','dashboard'],
  'vtp_config':         ['configuracoes','dashboard'],
  'vtp_etiq_metodos':   ['etiquetagem'],
  'vtp_etiq_validades': ['etiquetagem'],
  'vtp_etiquetas':      ['etiquetagem'],
  'vtp_sabores':        ['cadastros'],
  'vtp_produtos':       ['cadastros'],
  'vtp_prestadores':    ['cadastros','manutencao'],
  'vtp_terceirizados':  ['cadastros'],
  'vtp_emp_cargos':     ['configuracoes','rh'],
  'vtp_emp_tipos_desp': ['configuracoes','desperdicio'],
  'vtp_emp_cat_insumo': ['configuracoes','cadastros'],
  'vtp_auditlog':       ['auditoria'],
};

// Re-renders o módulo ativo sem mudar de tela
function _vtpCallRender(mod) {
  switch (mod) {
    case 'dashboard':     typeof renderDashboard    === 'function' && renderDashboard();    break;
    case 'compras':       typeof renderComprasModule === 'function' && renderComprasModule(); break;
    case 'estoque':       typeof renderComprasLayout === 'function' && renderComprasLayout(); break;
    case 'checklist':     typeof renderChecklist    === 'function' && renderChecklist();    break;
    case 'manutencao':    typeof renderManutencao   === 'function' && renderManutencao();   break;
    case 'rh':            typeof renderRh           === 'function' && renderRh();           break;
    case 'inventario':    typeof renderInventario   === 'function' && renderInventario();   break;
    case 'etiquetagem':   typeof renderEtiquetagem  === 'function' && renderEtiquetagem();  break;
    case 'cadastros':     typeof renderCadastros    === 'function' && renderCadastros();    break;
    case 'configuracoes': typeof renderConfiguracoes === 'function' && renderConfiguracoes(); break;
    case 'desperdicio':   typeof renderDesperdicio  === 'function' && renderDesperdicio();  break;
    case 'auditoria':     typeof renderAuditoria    === 'function' && renderAuditoria();    break;
    // omnichannel tem seu próprio realtime — não re-renderiza aqui
  }
}

// Fase 3: conjunto de writes próprios (para não reagir ao eco do Realtime)
window._vtpOwnWrites = new Set();

// Debounce por módulo para agrupar atualizações rápidas
const _vtpRtDebounce = {};

// Chamado por db.js quando kv_store recebe UPDATE de outro usuário
window._vtpOnRealtimeUpdate = function(key) {
  if (window._vtpOwnWrites.has(key)) return; // eco do próprio write — ignora

  const currentMod = location.hash.replace('#', '').split('/')[0] || 'dashboard';
  const affected = _VTP_KEY_MODS[key] || [];
  if (!affected.includes(currentMod)) return;

  // Fase 3: modal aberto → avisa em vez de re-renderizar (protege formulário em edição)
  if (document.querySelector('.overlay')) {
    if (typeof toast === 'function') toast('Dados alterados por outro usuário — salve com atenção', 'warn');
    return;
  }

  clearTimeout(_vtpRtDebounce[currentMod]);
  _vtpRtDebounce[currentMod] = setTimeout(() => _vtpCallRender(currentMod), 400);
};

// Fase 1: re-fetch do Supabase ao navegar (garante dados frescos)
async function _vtpRefreshMod(mod) {
  const sb = window._vtpSb;
  if (!sb) return;
  const keysSet = new Set();
  for (const [k, mods] of Object.entries(_VTP_KEY_MODS)) {
    if (mods.includes(mod)) keysSet.add(k);
  }
  const keys = [...keysSet];
  if (!keys.length) return;
  try {
    const { data } = await sb.from('kv_store').select('key, value').in('key', keys);
    if (!data?.length) return;
    let changed = false;
    for (const row of data) {
      const newStr = JSON.stringify(row.value);
      if (localStorage.getItem(row.key) !== newStr) {
        localStorage.setItem(row.key, newStr);
        window._vtpSetGlobal?.(row.key, row.value);
        changed = true;
      }
    }
    // Re-renderiza só se ainda estiver no mesmo módulo e sem modal aberto
    const nowMod = location.hash.replace('#', '').split('/')[0] || 'dashboard';
    if (changed && nowMod === mod && !document.querySelector('.overlay')) {
      _vtpCallRender(mod);
    }
  } catch (_) { /* offline — silencioso */ }
}

function _vtpPushRoute(mod) {
  const hashMod = mod === 'usuarios' ? 'configuracoes' : mod;
  const getTab = window[`_vtpGetTab_${hashMod}`];
  const sub = getTab ? getTab() : null;
  const hash = sub ? `${hashMod}/${sub}` : hashMod;
  history.pushState({ mod: hashMod, sub }, '', '#' + hash);
}

function _vtpApplySub(mod, sub) {
  const setTab = window[`_vtpSetTab_${mod}`];
  if (setTab && sub) setTab(sub);
}

// Botão Voltar / Avançar do navegador
window.addEventListener('popstate', e => {
  const parts = (location.hash.replace('#', '') || '').split('/');
  const mod = e.state?.mod || parts[0] || 'dashboard';
  const sub = e.state?.sub || parts[1] || null;
  if (modInfo[mod]) {
    _vtpNavFromPop = true;
    _vtpApplySub(mod, sub);
    goModule(mod);
    _vtpNavFromPop = false;
  }
});

// Chamado pelo initAuth para restaurar a rota salva no hash
function _vtpRestoreRoute() {
  const parts = location.hash.replace('#', '').trim().split('/');
  const mod   = parts[0] && modInfo[parts[0]] ? parts[0] : 'dashboard';
  const sub   = parts[1] || null;
  // Verifica permissão antes de restaurar
  if (mod !== 'dashboard' && typeof canAccess === 'function' && !canAccess(mod)) {
    goModule('dashboard');
    return;
  }
  _vtpApplySub(mod, sub);
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

  // Fecha drill-down (desktop e mobile) e drawer mobile ao navegar
  if (_mobileSubmenuActive) _closeMobileSubmenu();
  if (_mobileMenuOpen) toggleMobileMenu();

  const _OPERACAO_MODS = ['preproducao','desperdicio','previsao','manutencao','inventario'];

  // Mostra widget iFood apenas no Omnichannel
  document.body.classList.toggle('vtp-omnichannel', mod === 'omnichannel');

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
  else if (mod === 'estoque')    {
    // Estoque agora é módulo próprio na sidebar, mas a implementação real
    // (contagens, categorias, divergências) vive dentro de page-compras
    // (_renderCpEstoque, ~1100 linhas) — reaproveita o mesmo container em
    // vez de duplicar. page-estoque (a página vazia genérica) fica sem uso.
    document.getElementById('page-estoque')?.classList.remove('active');
    document.getElementById('page-compras')?.classList.add('active');
    _cpSection = 'estoque';
    renderComprasLayout();
  }
  else if (mod === 'preproducao') renderPreproducao();
  else if (mod === 'compras')    renderComprasModule();
  else if (mod === 'vendas')     renderVendas();
  else if (mod === 'cadastros')  renderCadastros();
  else if (mod === 'desperdicio')   renderDesperdicio();
  else if (mod === 'previsao')      renderPrevisao();
  else if (mod === 'configuracoes') renderConfiguracoes();
  else if (mod === 'relatorios') renderRelatorios();
  else if (mod === 'usuarios') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-configuracoes')?.classList.add('active');
    // setCfgSection() compara a seção nova com o valor atual de _cfgSection
    // (a seção anterior) para decidir o que limpar do DOM — nunca atribuir
    // _cfgSection manualmente antes de chamá-la, ou a comparação vira sempre
    // "igual" e o conteúdo da seção antiga fica grudado por baixo da nova.
    _initCfgNav();
    setCfgSection('usuarios');
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

  // Fase 1: re-fetch em background — atualiza se dados mudaram desde o último acesso
  if (mod !== 'omnichannel') _vtpRefreshMod(mod);
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


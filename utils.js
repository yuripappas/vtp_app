/**
 * VTP Compras — Vai Ter Pizza!
 * utils.js — Funções utilitárias, helpers e UI geral
 */

// ══════════════════════════════════════════════════════════════
// HELPERS DE DADOS
// ══════════════════════════════════════════════════════════════

/** Status de estoque de um item */
const gst   = i => i.qty <= i.min * .4 ? 'crit' : i.qty < i.min ? 'warn' : 'ok';

/** Quantidade necessária para atingir o ideal */
const gneed = i => Math.max(0, i.ideal - i.qty);

/** Formata número para moeda pt-BR (2 casas decimais) */
const fmt   = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formata data */
const fmtD  = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

/** Formata data + hora */
const fmtDT = d => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Nome do fornecedor pelo ID */
const sname = id => { const s = suppliers.find(x => x.id === id); return s ? s.name : '—'; };

/** Gera token aleatório de 8 caracteres */
const genToken = () => Math.random().toString(36).slice(2, 10).toUpperCase();

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.className = 'toast', 3000);
}

// ══════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Fecha modal ao clicar no fundo
document.querySelectorAll('.overlay').forEach(o =>
  o.addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('open');
  })
);

// ══════════════════════════════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════════════════════════════

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
// NAVEGAÇÃO DE MÓDULOS
// ══════════════════════════════════════════════════════════════

const modInfo = {
  dashboard:     { title: 'Dashboard',               sub: 'Visão geral do sistema' },
  estoque:       { title: 'Estoque',                 sub: 'Gestão de insumos e contagem' },
  preproducao:   { title: 'Pré-produção',             sub: 'Ordens de produção interna' },
  compras:       { title: 'Compras',                 sub: 'Requisição · Cotação · Mapa · Ordem de Compra' },
  fornecedores:  { title: 'Fornecedores',            sub: 'Cadastro e gestão de parceiros' },
  relatorios:    { title: 'Relatórios',              sub: 'Histórico, análises e inteligência' },
  usuarios:      { title: 'Usuários & Permissões',   sub: 'Gestão de acesso à plataforma' },
  configuracoes: { title: 'Configurações',           sub: 'Preferências do sistema' },
};

function goModule(mod) {
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`nav-${mod}`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${mod}`).classList.add('active');

  const info = modInfo[mod];
  document.getElementById('topbarTitle').textContent = info.title;
  document.getElementById('topbarSub').textContent   = info.sub;

  if (mod === 'dashboard')    renderDashboard();
  else if (mod === 'estoque') renderEstoque();
  else if (mod === 'preproducao') renderPreproducao();
  else if (mod === 'compras') renderComprasModule();
  else if (mod === 'fornecedores') renderFornecedores();
  else if (mod === 'relatorios') renderRelatorios();
  else if (mod === 'usuarios') renderUsuarios();
}

// ══════════════════════════════════════════════════════════════
// SCORE DE COTAÇÃO
// ══════════════════════════════════════════════════════════════

function calcScore(price, delivery, payTerm, minP, maxP, minD, maxD) {
  const ps  = minP === maxP ? 100 : 100 - (((price - minP)    / (maxP - minP)) * 100);
  const ds  = minD === maxD ? 100 : 100 - (((delivery - minD) / (maxD - minD)) * 100);
  const pms = Math.min(100, (parseInt(payTerm) || 0) / 60 * 100);
  return Math.round(ps * .5 + ds * .3 + pms * .2);
}

// ══════════════════════════════════════════════════════════════
// ECONOMIA ACUMULADA
// ══════════════════════════════════════════════════════════════

function calcEconomia() {
  return cycleHistory.reduce((s, c) => s + c.economia, 0);
}

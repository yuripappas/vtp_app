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
  el.textContent = msg;
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

const modInfo = {
  dashboard:      { title: 'Dashboard',             sub: 'Visão geral do sistema' },
  estoque:        { title: 'Estoque',               sub: 'Contagem e atualização de quantidades' },
  preproducao:    { title: 'Pré-produção',           sub: 'Ordens de produção interna' },
  desperdicio:    { title: 'Controle de Desperdício', sub: 'Monitore perdas e seu impacto financeiro' },
  compras:        { title: 'Compras',               sub: 'Requisição · Cotação · Mapa · Ordem de Compra' },
  cadastros:      { title: 'Cadastros',             sub: 'Insumos · Fornecedores · Pré-preparo' },
  previsao:       { title: 'Previsão de Demanda', sub: 'Planejamento do dia · Massas · Fermento · Motoboys' },
  configuracoes:  { title: 'Configurações',         sub: 'WhatsApp da empresa · preferências do sistema' },
  relatorios:     { title: 'Relatórios',            sub: 'Histórico, análises e inteligência' },
  usuarios:       { title: 'Usuários & Permissões', sub: 'Gestão de acesso à plataforma' },
};

function goModule(mod) {
  // Verifica permissão
  if (typeof canAccess === 'function' && !canAccess(mod)) {
    toast('Acesso não permitido para seu perfil', 'err');
    return;
  }
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  document.getElementById(`nav-${mod}`)?.classList.add('active');
  // Configurações tem dois botões (nav e rodapé) — ativa ambos
  if (mod === 'configuracoes') {
    document.getElementById('nav-configuracoes-bottom')?.classList.add('active');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${mod}`).classList.add('active');
  const info = modInfo[mod];
  if (info) {
    document.getElementById('topbarTitle').textContent = info.title;
    document.getElementById('topbarSub').textContent   = info.sub;
  }
  if (mod === 'dashboard')       renderDashboard();
  else if (mod === 'estoque')    renderEstoque();
  else if (mod === 'preproducao') renderPreproducao();
  else if (mod === 'compras')    renderComprasModule();
  else if (mod === 'cadastros')  renderCadastros();
  else if (mod === 'desperdicio')   renderDesperdicio();
  else if (mod === 'previsao')      renderPrevisao();
  else if (mod === 'configuracoes') renderConfiguracoes();
  else if (mod === 'relatorios') renderRelatorios();
  else if (mod === 'usuarios')   { setCfgTab('usuarios'); }
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

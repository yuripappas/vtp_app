/**
 * VTP Compras — Vai Ter Pizza!
 * login.js — Sistema de autenticação e controle de permissões
 */

// ══════════════════════════════════════════════════════════════
// PERMISSÕES POR MÓDULO
// ══════════════════════════════════════════════════════════════

const MODULE_PERMISSIONS = {
  dashboard:     ['gerente', 'supervisor', 'comprador'],
  estoque:       ['gerente', 'supervisor', 'comprador'],
  preproducao:   ['gerente', 'supervisor', 'comprador'],
  desperdicio:   ['gerente', 'supervisor'],
  compras:       ['gerente', 'supervisor', 'comprador'],
  cadastros:     ['gerente', 'supervisor'],
  configuracoes: ['gerente'],
  relatorios:    ['gerente', 'supervisor'],
  usuarios:      ['gerente'],
};

// ══════════════════════════════════════════════════════════════
// SESSÃO
// ══════════════════════════════════════════════════════════════

function getCurrentUser() {
  return JSON.parse(sessionStorage.getItem('vtp_session') || 'null');
}

function setSession(user) {
  sessionStorage.setItem('vtp_session', JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem('vtp_session');
}

function isLoggedIn() {
  return !!getCurrentUser();
}

// ══════════════════════════════════════════════════════════════
// TELA DE LOGIN
// ══════════════════════════════════════════════════════════════

function showLogin() {
  document.getElementById('loginScreen').style.display  = 'flex';
  document.getElementById('appScreen').style.display    = 'none';
  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display   = 'flex';
}

// ══════════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════════

function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');

  if (!email || !password) {
    errorEl.textContent = 'Preencha e-mail e senha.';
    return;
  }

  // Busca usuário no localStorage
  const user = users.find(u => u.email.toLowerCase() === email && u.active !== false);
  if (!user) {
    errorEl.textContent = 'E-mail não encontrado.';
    shakeForm();
    return;
  }

  // Verifica senha (hash simples ou texto — para prod usar bcrypt)
  const storedPass = localStorage.getItem(`vtp_pass_${user.id}`) || _defaultPass(user.role);
  if (password !== storedPass) {
    errorEl.textContent = 'Senha incorreta.';
    shakeForm();
    return;
  }

  // Login OK
  setSession(user);
  applyPermissions(user);
  showApp();
  renderDashboard();

  // Atualiza nome na sidebar
  const sbName = document.getElementById('sbUserName');
  if (sbName) sbName.textContent = user.name;
  const sbRole = document.getElementById('sbUserRole');
  if (sbRole) sbRole.textContent = PERMS[user.role]?.label || user.role;
  const sbAvatar = document.getElementById('sbAvatar');
  if (sbAvatar) sbAvatar.textContent = user.name.charAt(0).toUpperCase();
}

function doLogout() {
  clearSession();
  showLogin();
}

// Senha padrão por perfil (usuários novos sem senha definida)
function _defaultPass(role) {
  const defaults = { gerente: 'gerente123', supervisor: 'supervisor123', comprador: 'comprador123' };
  return defaults[role] || '123456';
}

function shakeForm() {
  const form = document.getElementById('loginForm');
  form.classList.add('shake');
  setTimeout(() => form.classList.remove('shake'), 500);
}

// ══════════════════════════════════════════════════════════════
// PERMISSÕES — esconde itens da sidebar que o perfil não acessa
// ══════════════════════════════════════════════════════════════

function applyPermissions(user) {
  const role = user.role;
  Object.entries(MODULE_PERMISSIONS).forEach(([mod, roles]) => {
    const navEl = document.getElementById(`nav-${mod}`);
    if (navEl) {
      navEl.style.display = roles.includes(role) ? '' : 'none';
    }
  });
  // Seções da sidebar
  _updateSections();
}

function _updateSections() {
  // Esconde seção "Configuração" se todos os itens estiverem ocultos
  const sections = document.querySelectorAll('.sb-section');
  sections.forEach(section => {
    let next = section.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('sb-section')) {
      if (next.style.display !== 'none' && next.classList.contains('sb-item')) {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    section.style.display = hasVisible ? '' : 'none';
  });
}

function canAccess(mod) {
  const user = getCurrentUser();
  if (!user) return false;
  return (MODULE_PERMISSIONS[mod] || []).includes(user.role);
}

// ══════════════════════════════════════════════════════════════
// TROCAR SENHA
// ══════════════════════════════════════════════════════════════

function saveUserPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    toast('Senha deve ter pelo menos 6 caracteres', 'err');
    return false;
  }
  localStorage.setItem(`vtp_pass_${userId}`, newPassword);
  return true;
}

// ══════════════════════════════════════════════════════════════
// INIT — verifica sessão ao carregar
// ══════════════════════════════════════════════════════════════

function initAuth() {
  if (isLoggedIn()) {
    const user = getCurrentUser();
    // Verifica se o usuário ainda existe e está ativo
    const stillExists = users.find(u => u.id === user.id && u.active !== false);
    if (stillExists) {
      applyPermissions(stillExists);
      showApp();
      renderDashboard();
      const sbName = document.getElementById('sbUserName');
      if (sbName) sbName.textContent = stillExists.name;
      const sbRole = document.getElementById('sbUserRole');
      if (sbRole) sbRole.textContent = PERMS[stillExists.role]?.label || stillExists.role;
      const sbAvatar = document.getElementById('sbAvatar');
      if (sbAvatar) sbAvatar.textContent = stillExists.name.charAt(0).toUpperCase();
      return;
    }
  }
  showLogin();
}

// Enter no campo de senha faz login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen')?.style.display !== 'none') {
    doLogin();
  }
});

function toggleLoginPass() {
  const inp = document.getElementById('loginPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

/**
 * VTP Compras — Vai Ter Pizza!
 * login.js — Sistema de autenticação e controle de permissões
 */

// ══════════════════════════════════════════════════════════════
// PERMISSÕES POR MÓDULO
// ══════════════════════════════════════════════════════════════

const MODULE_PERMISSIONS = {
  dashboard:     ['gerente', 'supervisor', 'comprador', 'funcionario'],
  omnichannel:   ['gerente', 'supervisor', 'comprador', 'funcionario'],
  operacao:      ['gerente', 'supervisor', 'comprador', 'funcionario'],
  estoque:       ['gerente', 'supervisor', 'comprador'],
  preproducao:   ['gerente', 'supervisor', 'comprador'],
  desperdicio:   ['gerente', 'supervisor'],
  compras:       ['gerente', 'supervisor', 'comprador'],
  previsao:      ['gerente', 'supervisor', 'comprador'],
  cadastros:     ['gerente', 'supervisor'],
  configuracoes: ['gerente'],
  relatorios:    ['gerente', 'supervisor'],
  usuarios:      ['gerente'],
  checklist:     ['gerente', 'supervisor', 'comprador', 'funcionario'],
  manutencao:    ['gerente', 'supervisor', 'comprador'],
  inventario:    ['gerente', 'supervisor', 'comprador'],
  alertas:       ['gerente', 'supervisor', 'comprador'],
  rh:            ['gerente', 'supervisor'],
  auditoria:     ['gerente', 'supervisor'],
  etiquetagem:   ['gerente', 'supervisor', 'comprador', 'funcionario'],
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
  document.getElementById('loginScreen').classList.add('open');
  document.getElementById('appScreen').style.display    = 'none';
  document.getElementById('loginEmail').value    = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

function showApp() {
  document.getElementById('loginScreen').classList.remove('open');
  document.getElementById('appScreen').style.display   = 'flex';
  if (typeof _updateSidebarLogo === 'function') _updateSidebarLogo();
}

// ══════════════════════════════════════════════════════════════
// HASH DE SENHA — Web Crypto API (SHA-256)
// Prefixo "sha256:" distingue senhas hasheadas de legado plaintext.
// ══════════════════════════════════════════════════════════════

async function _hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
  return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _checkPass(input, stored) {
  if (!stored) return false;
  if (stored.startsWith('sha256:')) {
    return (await _hashPass(input)) === stored;
  }
  // Legado plaintext — aceita e agenda migração silenciosa
  return input === stored;
}

// ══════════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════════

async function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btnLogin = document.querySelector('#loginForm .btn-primary');

  if (!email || !password) {
    errorEl.textContent = 'Preencha e-mail e senha.';
    return;
  }

  const user = users.find(u => u.email.toLowerCase() === email && u.active !== false);
  if (!user) {
    errorEl.textContent = 'E-mail não encontrado.';
    shakeForm();
    return;
  }

  if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = 'Verificando...'; }

  const storedPass = db._get(`vtp_pass_${user.id}`, null) || _defaultPass(user.role);
  const ok = await _checkPass(password, storedPass);

  if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = 'Entrar →'; }

  if (!ok) {
    errorEl.textContent = 'Senha incorreta.';
    shakeForm();
    return;
  }

  // Migração silenciosa: se senha ainda era plaintext, re-salva com hash
  if (!storedPass.startsWith('sha256:')) {
    _hashPass(password).then(h => db._set(`vtp_pass_${user.id}`, h));
  }

  setSession(user);
  logAudit('login', 'Acesso ao sistema', 'sistema');
  applyPermissions(user);
  showApp();

  if (user.role === 'funcionario') {
    goModule('checklist');
  } else {
    renderDashboard();
  }

  const sbName = document.getElementById('sbUserName');
  if (sbName) sbName.textContent = user.name;
  const sbRole = document.getElementById('sbUserRole');
  if (sbRole) { const p=PERMS[user.role]; sbRole.innerHTML = p ? (lc(p.icon||'user',11,p.color) + ' ' + p.label) : user.role; }
  const sbAvatar = document.getElementById('sbAvatar');
  if (sbAvatar) sbAvatar.textContent = user.name.charAt(0).toUpperCase();
  const dashBadge = document.getElementById('dashRoleBadge');
  if (dashBadge) dashBadge.textContent = (PERMS[user.role]?.label || user.role) + ' · ' + user.name;
}

function doLogout() {
  logAudit('logout', 'Saiu do sistema', 'sistema');
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
  const hasCustomPerms = Array.isArray(user.perms);
  const userPerms = hasCustomPerms ? user.perms : (typeof getUserPerms === 'function' ? getUserPerms(user) : []);
  Object.entries(MODULE_PERMISSIONS).forEach(([mod, roles]) => {
    const navEl = document.getElementById(`nav-${mod}`);
    if (!navEl) return;
    if (mod === 'etiquetagem' && hasCustomPerms) {
      navEl.style.display = userPerms.includes('Etiquetagem') ? '' : 'none';
      return;
    }
    navEl.style.display = roles.includes(role) ? '' : 'none';
  });
  // Botão de configurações no rodapé (id diferente)
  const cfgBottom = document.getElementById('nav-configuracoes-bottom');
  if (cfgBottom) {
    cfgBottom.style.display = (MODULE_PERMISSIONS.configuracoes||[]).includes(role) ? '' : 'none';
  }
  _updateSections();
  if (typeof atualizarBadgeAlertas === 'function') atualizarBadgeAlertas();
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

async function saveUserPassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    toast('Senha deve ter pelo menos 6 caracteres', 'err');
    return false;
  }
  const hash = await _hashPass(newPassword);
  db._set(`vtp_pass_${userId}`, hash);
  return true;
}

// ══════════════════════════════════════════════════════════════
// INIT — verifica sessão ao carregar
// ══════════════════════════════════════════════════════════════

function initAuth() {
  _verificarResetToken().then(isReset => { if (isReset) return;
  if (isLoggedIn()) {
    const user = getCurrentUser();
    // Verifica se o usuário ainda existe e está ativo
    const stillExists = users.find(u => u.id === user.id && u.active !== false);
    if (stillExists) {
      applyPermissions(stillExists);
      showApp();
      _vtpRestoreRoute(); // restaura o módulo salvo no hash (ex: #estoque)
      const sbName = document.getElementById('sbUserName');
      if (sbName) sbName.textContent = stillExists.name;
      const sbRole = document.getElementById('sbUserRole');
      if (sbRole) { const p=PERMS[stillExists.role]; sbRole.innerHTML = p ? (lc(p.icon||'user',11,p.color) + ' ' + p.label) : stillExists.role; }
      const sbAvatar = document.getElementById('sbAvatar');
      if (sbAvatar) sbAvatar.textContent = stillExists.name.charAt(0).toUpperCase();
      const dashBadge = document.getElementById('dashRoleBadge');
      if (dashBadge) dashBadge.textContent = (PERMS[stillExists.role]?.label || stillExists.role) + ' · ' + stillExists.name;
      return;
    }
  }
  showLogin();
  }); // end _verificarResetToken
}

// Enter no campo de senha faz login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen')?.classList.contains('open')) {
    doLogin();
  }
});

function toggleLoginPass() {
  const inp = document.getElementById('loginPassword');
  const btn = document.getElementById('loginPassToggle');
  const showing = inp.type === 'password';
  inp.type = showing ? 'text' : 'password';
  if (btn) btn.innerHTML = showing
    ? lc('eye-off', 15, 'var(--fg-subtle)')
    : lc('eye',     15, 'var(--fg-subtle)');
}

// ══════════════════════════════════════════════════════════════
// MENU DE PERFIL — popup ancorado no avatar da sidebar
// ══════════════════════════════════════════════════════════════

function _fecharMenuPerfil() {
  document.getElementById('menuPerfilPopup')?.remove();
}

function abrirModalPerfil() {
  const u = getCurrentUser();
  if (!u) return;
  const p         = PERMS[u.role];
  const isGestao  = ['gerente', 'supervisor'].includes(u.role);

  _fecharMenuPerfil();

  const avatarEl  = document.getElementById('sbAvatar');
  const rect      = avatarEl?.getBoundingClientRect() || { right: 72, top: window.innerHeight - 200 };
  const cardW     = 268;
  const leftRaw   = rect.right + 14;
  const left      = Math.min(leftRaw, window.innerWidth - cardW - 12);
  const topRaw    = rect.top - 10;
  const top       = Math.max(8, Math.min(topRaw, window.innerHeight - 420));

  const fotoHtml  = u.foto
    ? `<img src="${u.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
    : `<span style="font-size:1.4rem;font-weight:800;color:#fff">${u.name.charAt(0).toUpperCase()}</span>`;

  const badgeHtml = isGestao
    ? `<div style="margin-top:10px">
        <span style="display:inline-flex;align-items:center;gap:4px;background:var(--purple-xlight);color:var(--purple);
          font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:.7px;
          padding:3px 9px;border-radius:var(--radius-pill)">
          ${lc(p.icon || 'user', 10, 'var(--purple)')} ${p.label}
        </span>
      </div>`
    : '';

  function _item(icon, label, onclick, danger = false) {
    const color = danger ? 'var(--red)' : 'var(--fg)';
    return `<button onclick="${onclick}"
      style="width:100%;display:flex;align-items:center;gap:10px;padding:9px 12px;border:none;
        background:none;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-sans);
        font-size:var(--text-sm);color:${color};text-align:left;transition:background var(--dur-fast)"
      onmouseenter="this.style.background='${danger ? 'var(--red-light)' : 'var(--bg-subtle)'}'"
      onmouseleave="this.style.background='none'">
      ${lc(icon, 15, danger ? 'var(--red)' : 'var(--fg-muted)')}
      ${label}
    </button>`;
  }

  const wrap = document.createElement('div');
  wrap.id    = 'menuPerfilPopup';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:700';

  wrap.innerHTML = `
    <div style="position:fixed;top:${top}px;left:${left}px;width:${cardW}px;
      background:var(--surface);border:1.5px solid var(--border);
      border-radius:var(--radius-xl);box-shadow:0 16px 48px rgba(0,0,0,.16);
      overflow:hidden;animation:confirmIn .18s var(--ease-out) both">

      <!-- Cabeçalho -->
      <div style="padding:18px 18px 16px;background:var(--purple-xlight)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:46px;height:46px;border-radius:50%;background:var(--purple);
              display:flex;align-items:center;justify-content:center;flex-shrink:0;
              border:2.5px solid rgba(107,33,212,.25)">
              ${fotoHtml}
            </div>
            <div>
              <div style="font-size:var(--text-base);font-weight:800;color:var(--fg)">Olá, ${u.name.split(' ')[0]}!</div>
              <div style="font-size:var(--text-xs);color:var(--fg-muted);margin-top:2px">${u.email}</div>
              ${badgeHtml}
            </div>
          </div>
          <button onclick="_fecharMenuPerfil()"
            style="background:none;border:none;cursor:pointer;padding:4px;border-radius:var(--radius-sm);
              color:var(--fg-subtle);flex-shrink:0;margin-left:6px">
            ${lc('x', 16, 'currentColor')}
          </button>
        </div>
      </div>

      <!-- Ações -->
      <div style="padding:6px">
        ${_item('pencil', 'Editar perfil', 'abrirEditarPerfil()')}
        ${_item('key', 'Alterar senha', 'abrirAlterarSenha()')}
        ${_item('file-text', 'Termos de uso', 'abrirTermosUso()')}
        ${_item('shield', 'Política de privacidade', 'abrirPoliticaPrivacidade()')}
      </div>
      <div style="border-top:1px solid var(--border);padding:6px">
        ${_item('log-out', 'Sair da conta', 'doLogout()', true)}
      </div>
    </div>`;

  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) _fecharMenuPerfil(); });
}

// ══════════════════════════════════════════════════════════════
// EDITAR PERFIL
// ══════════════════════════════════════════════════════════════

function abrirEditarPerfil() {
  _fecharMenuPerfil();
  const u        = getCurrentUser();
  if (!u) return;
  const isGestor = u.role === 'gerente';

  const popup = document.createElement('div');
  popup.id    = 'modalEditarPerfil';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl);width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="padding:18px 22px 14px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-base);font-weight:800">
          ${lc('pencil', 16, 'var(--purple)')} Editar perfil
        </div>
        <button onclick="document.getElementById('modalEditarPerfil').remove()"
          style="background:none;border:none;cursor:pointer;padding:4px;color:var(--fg-subtle)">
          ${lc('x', 18, 'currentColor')}
        </button>
      </div>

      <!-- Avatar -->
      <div style="display:flex;flex-direction:column;align-items:center;padding:20px 22px 0">
        <div id="perfilAvatarPreview"
          style="width:72px;height:72px;border-radius:50%;background:var(--purple);color:#fff;
            font-size:1.8rem;font-weight:800;display:flex;align-items:center;justify-content:center;
            border:3px solid var(--border);box-shadow:0 4px 16px rgba(107,33,212,.2);
            margin-bottom:6px;cursor:pointer;position:relative"
          onclick="document.getElementById('perfilFotoInput').click()" title="Trocar foto">
          ${u.foto ? `<img src="${u.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : u.name.charAt(0).toUpperCase()}
          <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;background:var(--purple);
            border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center">
            ${lc('camera', 10, '#fff')}
          </div>
        </div>
        <input type="file" id="perfilFotoInput" accept="image/*" style="display:none" onchange="previewFotoPerfil(this)">
        <div style="font-size:var(--text-2xs);color:var(--fg-subtle)">Clique para trocar a foto</div>
      </div>

      <div style="padding:16px 22px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Nome completo</label>
          <input type="text" id="perfilNome" class="inp" value="${u.name}" placeholder="Seu nome">
        </div>
        <div class="field" style="margin:0">
          <label>E-mail</label>
          <input type="email" id="perfilEmail" class="inp" value="${u.email}"
            ${!isGestor ? 'readonly style="opacity:.6;cursor:not-allowed"' : ''}>
          ${!isGestor ? `<div style="font-size:var(--text-2xs);color:var(--fg-subtle);margin-top:3px">Só o gestor pode alterar o e-mail</div>` : ''}
        </div>
        <div class="field" style="margin:0">
          <label>Telefone</label>
          <input type="tel" id="perfilTelefone" class="inp" value="${u.phone || ''}" placeholder="(00) 00000-0000">
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" onclick="document.getElementById('modalEditarPerfil').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarPerfil()">Salvar</button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

function previewFotoPerfil(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('perfilAvatarPreview');
    if (preview) preview.innerHTML = `
      <img src="${e.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">
      <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;background:var(--purple);
        border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center">
        ${lc('camera', 10, '#fff')}
      </div>`;
    window._perfilFotoTemp = e.target.result;
  };
  reader.readAsDataURL(file);
}

function salvarPerfil() {
  const u     = getCurrentUser();
  if (!u) return;
  const nome  = document.getElementById('perfilNome')?.value.trim();
  const email = document.getElementById('perfilEmail')?.value.trim();
  const phone = document.getElementById('perfilTelefone')?.value.trim();

  if (!nome) { toast('Informe seu nome', 'err'); return; }

  const uIdx = users.findIndex(x => x.id === u.id);
  if (uIdx >= 0) {
    users[uIdx].name  = nome;
    users[uIdx].phone = phone;
    if (u.role === 'gerente') users[uIdx].email = email;
    if (window._perfilFotoTemp) users[uIdx].foto = window._perfilFotoTemp;
    localStorage.setItem('vtp_users', JSON.stringify(users));
  }

  const sessaoAtualizada = { ...u, name: nome, phone, foto: window._perfilFotoTemp || u.foto };
  setSession(sessaoAtualizada);
  window._perfilFotoTemp = null;

  const sbName = document.getElementById('sbUserName');
  if (sbName) sbName.textContent = nome;
  const sbAvatar = document.getElementById('sbAvatar');
  if (sbAvatar) {
    if (sessaoAtualizada.foto) {
      sbAvatar.innerHTML = `<img src="${sessaoAtualizada.foto}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
      sbAvatar.textContent = nome.charAt(0).toUpperCase();
    }
  }

  document.getElementById('modalEditarPerfil')?.remove();
  toast('Perfil atualizado!');
}

// ══════════════════════════════════════════════════════════════
// ALTERAR SENHA
// ══════════════════════════════════════════════════════════════

function abrirAlterarSenha() {
  _fecharMenuPerfil();
  const u = getCurrentUser();
  if (!u) return;

  const popup = document.createElement('div');
  popup.id    = 'modalAlterarSenha';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl);width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="padding:18px 22px 14px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-base);font-weight:800">
          ${lc('key-round', 16, 'var(--purple)')} Alterar senha
        </div>
        <button onclick="document.getElementById('modalAlterarSenha').remove()"
          style="background:none;border:none;cursor:pointer;padding:4px;color:var(--fg-subtle)">
          ${lc('x', 18, 'currentColor')}
        </button>
      </div>
      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Nova senha</label>
          <div style="position:relative">
            <input type="password" id="perfilSenha" class="inp" placeholder="Mínimo 6 caracteres" style="padding-right:38px">
            <button onclick="togglePassField('perfilSenha')"
              style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--fg-subtle)">
              ${lc('eye', 16, 'currentColor')}
            </button>
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>Confirmar nova senha</label>
          <input type="password" id="perfilSenhaConf" class="inp" placeholder="Repita a senha">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" onclick="document.getElementById('modalAlterarSenha').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarSenha()">Salvar senha</button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

async function salvarSenha() {
  const u     = getCurrentUser();
  if (!u) return;
  const senha = document.getElementById('perfilSenha')?.value;
  const conf  = document.getElementById('perfilSenhaConf')?.value;
  if (!senha || senha.length < 6) { toast('Mínimo 6 caracteres', 'err'); return; }
  if (senha !== conf) { toast('As senhas não coincidem', 'err'); return; }
  await saveUserPassword(u.id, senha);
  document.getElementById('modalAlterarSenha')?.remove();
  toast('Senha alterada com sucesso!');
}

function togglePassField(id) {
  const inp = document.getElementById(id);
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ══════════════════════════════════════════════════════════════
// TERMOS DE USO
// ══════════════════════════════════════════════════════════════

function abrirTermosUso() {
  _fecharMenuPerfil();
  _abrirModalTexto('Termos de Uso', 'file-text', `
    <p><strong>Última atualização:</strong> maio de 2025</p>

    <p>Bem-vindo ao <strong>VTP Compras</strong>, sistema de gestão operacional da <strong>Vai Ter Pizza!</strong> Ao utilizar esta plataforma, você concorda com os termos a seguir.</p>

    <h4>1. Uso autorizado</h4>
    <p>O acesso é exclusivo a colaboradores e parceiros devidamente cadastrados. É proibido compartilhar credenciais de acesso ou utilizar a plataforma para fins alheios às atividades da empresa.</p>

    <h4>2. Responsabilidades do usuário</h4>
    <p>Cada usuário é responsável pelas ações realizadas com seu login. Registros de estoque, compras, checklist e demais módulos geram histórico de auditoria vinculado ao usuário autenticado.</p>

    <h4>3. Disponibilidade</h4>
    <p>A plataforma pode passar por manutenções programadas. A Vai Ter Pizza! não se responsabiliza por indisponibilidades decorrentes de falhas de conectividade, dispositivo ou força maior.</p>

    <h4>4. Propriedade intelectual</h4>
    <p>Todo o conteúdo, código e dados da plataforma pertencem exclusivamente à Vai Ter Pizza! É vedada a reprodução ou distribuição sem autorização expressa.</p>

    <h4>5. Alterações</h4>
    <p>Estes termos podem ser atualizados a qualquer momento. A continuidade do uso após publicação de novos termos implica aceitação automática.</p>
  `);
}

// ══════════════════════════════════════════════════════════════
// POLÍTICA DE PRIVACIDADE
// ══════════════════════════════════════════════════════════════

function abrirPoliticaPrivacidade() {
  _fecharMenuPerfil();
  _abrirModalTexto('Política de Privacidade', 'shield', `
    <p><strong>Última atualização:</strong> maio de 2025</p>

    <p>A <strong>Vai Ter Pizza!</strong> trata seus dados com responsabilidade e em conformidade com a <strong>LGPD (Lei nº 13.709/2018)</strong>.</p>

    <h4>1. Dados coletados</h4>
    <p>Coletamos nome, e-mail, telefone e foto de perfil para fins de autenticação e identificação dentro do sistema. Registros de atividade (movimentações, compras, checklists) são associados ao usuário para fins de auditoria interna.</p>

    <h4>2. Uso dos dados</h4>
    <p>Os dados são utilizados exclusivamente para operação da plataforma, controle de acesso e rastreabilidade das ações no sistema. Não compartilhamos informações pessoais com terceiros.</p>

    <h4>3. Armazenamento</h4>
    <p>Os dados são armazenados localmente no dispositivo (localStorage) e, futuramente, em servidores seguros com criptografia em trânsito e em repouso.</p>

    <h4>4. Seus direitos</h4>
    <p>Você pode solicitar ao gestor a correção ou exclusão dos seus dados a qualquer momento, conforme previsto na LGPD.</p>

    <h4>5. Contato</h4>
    <p>Dúvidas sobre privacidade: <strong>contato@vaiter pizza.com.br</strong></p>
  `);
}

function _abrirModalTexto(titulo, icon, conteudoHtml) {
  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--radius-xl);width:100%;max-width:520px;
      max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="padding:18px 22px 14px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-base);font-weight:800">
          ${lc(icon, 16, 'var(--purple)')} ${titulo}
        </div>
        <button onclick="this.closest('[style*=inset]').remove()"
          style="background:none;border:none;cursor:pointer;padding:4px;color:var(--fg-subtle)">
          ${lc('x', 18, 'currentColor')}
        </button>
      </div>
      <div style="padding:20px 22px;overflow-y:auto;font-size:var(--text-sm);color:var(--fg-muted);
        line-height:1.7;display:flex;flex-direction:column;gap:12px">
        ${conteudoHtml}
      </div>
      <div style="padding:14px 22px;border-top:1px solid var(--border);flex-shrink:0">
        <button class="btn btn-primary" style="width:100%;justify-content:center"
          onclick="this.closest('[style*=inset]').remove()">Entendi</button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

// ══════════════════════════════════════════════════════════════
// ESQUECI MINHA SENHA
// ══════════════════════════════════════════════════════════════

function abrirEsqueciSenha() {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:360px;padding:28px 28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)" onclick="event.stopPropagation()">
      <div style="font-size:1rem;font-weight:700;margin-bottom:6px;color:var(--text,#111)">Esqueci minha senha</div>
      <div style="font-size:.8rem;color:var(--muted,#888);margin-bottom:18px;line-height:1.5">Digite seu e-mail cadastrado e enviaremos um link para criar uma nova senha.</div>
      <div class="field" style="margin-bottom:14px">
        <label>E-mail</label>
        <input class="inp" type="email" id="resetEmail" placeholder="seu@email.com" autocomplete="email">
      </div>
      <div id="resetMsg" style="font-size:.75rem;min-height:18px;margin-bottom:10px;text-align:center"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="document.getElementById('_ovEsqueci').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="_enviarResetSenha(this)">Enviar link</button>
      </div>
    </div>`;
  ov.id = '_ovEsqueci';
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('resetEmail')?.focus(), 60);
}

async function _enviarResetSenha(btn) {
  const email = document.getElementById('resetEmail')?.value.trim().toLowerCase();
  const msg   = document.getElementById('resetMsg');
  if (!email) { msg.style.color = 'var(--red)'; msg.textContent = 'Digite seu e-mail.'; return; }

  const user = users.find(u => u.email.toLowerCase() === email && u.active !== false);
  if (!user) {
    msg.style.color = 'var(--red,#e53e3e)';
    msg.textContent = 'E-mail não encontrado. Verifique com o gestor.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const token   = crypto.randomUUID();
  const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hora
  const tokens  = db._get('vtp_reset_tokens', {});
  tokens[token] = { userId: user.id, email: user.email, expires };
  db._set('vtp_reset_tokens', tokens);

  const resetLink = `https://app.vaiterpizza.com?reset=${token}`;

  try {
    await fetch('https://yuridisrupy.app.n8n.cloud/webhook/vtp-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'reset', to: user.email, name: user.name, resetLink })
    });
  } catch(e) {}

  msg.style.color = 'var(--green)';
  msg.textContent = 'Link enviado! Verifique seu e-mail.';
}

async function _verificarResetToken() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('reset');
  if (!token) return false;

  // Remove o token da URL sem recarregar
  window.history.replaceState({}, '', window.location.pathname);

  await new Promise(r => setTimeout(r, 800)); // aguarda sync do Supabase
  const tokens = db._get('vtp_reset_tokens', {});
  const data   = tokens[token];

  if (!data || new Date(data.expires) < new Date()) {
    _mostrarErroReset('Link inválido ou expirado. Solicite um novo.');
    return true;
  }

  _mostrarTelaReset(token, data);
  return true;
}

function _mostrarErroReset(msg) {
  const ls = document.getElementById('loginScreen');
  if (ls) ls.classList.add('open');
  document.getElementById('appScreen').style.display = 'none';
  const err = document.getElementById('loginError');
  if (err) err.textContent = msg;
}

function _mostrarTelaReset(token, data) {
  const ls = document.getElementById('loginScreen');
  if (ls) ls.classList.add('open');
  document.getElementById('appScreen').style.display = 'none';

  const form = document.getElementById('loginForm');
  if (!form) return;
  form.innerHTML = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="width:72px;height:72px;border-radius:var(--r12);overflow:hidden;margin:0 auto 12px;box-shadow:0 4px 16px rgba(107,33,212,.3)">
        <img src="assets/logo-bg.jpg" alt="VTP360" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--text)">Nova senha</div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:3px">Defina sua nova senha de acesso</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field">
        <label>Nova senha</label>
        <input class="inp" type="password" id="novaSenha" placeholder="mínimo 6 caracteres">
      </div>
      <div class="field">
        <label>Confirmar nova senha</label>
        <input class="inp" type="password" id="novaSenhaConf" placeholder="repita a senha">
      </div>
      <div id="resetSenhaErr" style="font-size:.75rem;color:var(--red);min-height:18px;text-align:center"></div>
      <button class="btn btn-primary" onclick="_salvarNovaSenha('${token}',${data.userId})" style="width:100%;justify-content:center;padding:11px">Salvar nova senha</button>
    </div>`;
}

async function _salvarNovaSenha(token, userId) {
  const nova  = document.getElementById('novaSenha')?.value;
  const conf  = document.getElementById('novaSenhaConf')?.value;
  const err   = document.getElementById('resetSenhaErr');

  if (!nova || nova.length < 6) { err.textContent = 'Senha deve ter pelo menos 6 caracteres.'; return; }
  if (nova !== conf)            { err.textContent = 'As senhas não coincidem.'; return; }

  await saveUserPassword(userId, nova);

  // Remove token usado
  const tokens = db._get('vtp_reset_tokens', {});
  delete tokens[token];
  db._set('vtp_reset_tokens', tokens);

  toast('Senha atualizada! Faça login com a nova senha.', 'ok');

  // Restaura tela de login
  setTimeout(() => location.reload(), 1500);
}

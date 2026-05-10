/**
 * VTP Compras — Vai Ter Pizza!
 * configuracoes.js — Módulo de Configurações (3 abas)
 */

let _cfgTab = 'empresa';

function renderConfiguracoes() {
  _cfgTab = _cfgTab || 'empresa';
  setCfgTab(_cfgTab);
}

function setCfgTab(tab) {
  _cfgTab = tab;
  const panels = ['empresa','cadastros','usuarios'];

  // Atualiza tabs
  panels.forEach(t => {
    const btn = document.getElementById('cfgTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) {
      const active = t === tab;
      btn.style.color       = active ? 'var(--purple)' : 'var(--muted)';
      btn.style.fontWeight  = active ? '700' : '500';
      btn.style.borderBottom = active ? '2.5px solid var(--purple)' : '2.5px solid transparent';
    }
    const panel = document.getElementById('cfgPanel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });

  if (tab === 'empresa')   _renderCfgEmpresa();
  if (tab === 'cadastros') _renderCfgCadastros();
  if (tab === 'usuarios')  _renderCfgUsuarios();
}

// ── Aba Empresa ───────────────────────────────────────────────
function _renderCfgEmpresa() {
  const cfg = getConfig();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('cfgEmpresa',    cfg.empresa    || 'Vai Ter Pizza!');
  set('cfgResponsavel', cfg.responsavel || '');
  set('cfgWhatsapp',   cfg.whatsapp   || '');
  set('cfgCodLoja',    cfg.codLoja    || '');
  set('cfgPctCrit',    cfg.pctCrit    || '40');
}

function saveConfiguracoes() {
  const g = id => document.getElementById(id)?.value || '';
  const cfg = {
    empresa:     g('cfgEmpresa').trim(),
    responsavel: g('cfgResponsavel').trim(),
    whatsapp:    g('cfgWhatsapp').replace(/\D/g,''),
    codLoja:     g('cfgCodLoja').trim(),
    pctCrit:     g('cfgPctCrit') || '40',
  };
  localStorage.setItem('vtp_config', JSON.stringify(cfg));
  if (cfg.responsavel) {
    const el = document.getElementById('sbUserName');
    if (el) el.textContent = cfg.responsavel;
  }
  toast('Configurações salvas!');
}

// ── Aba Cadastros ─────────────────────────────────────────────
function _renderCfgCadastros() {
  const el = document.getElementById('cfgCadastrosContent');
  if (!el) return;

  const insumos    = items.filter(i => !i.isProd);
  const preparados = items.filter(i =>  i.isProd);
  const cats       = [...new Set(insumos.map(i => i.cat))];

  const cards = [
    {
      icon:'package', label:'Insumos', cor:'var(--purple)', bg:'var(--purple-xlight)',
      val: insumos.length, sub: `${cats.length} categorias`,
      tab:'insumos', desc:'Cadastre e gerencie todos os insumos da cozinha'
    },
    {
      icon:'building-2', label:'Fornecedores', cor:'#3B82F6', bg:'#EFF6FF',
      val: suppliers.length, sub: `${suppliers.filter(s=>s.phone).length} com WhatsApp`,
      tab:'fornecedores', desc:'Gerencie fornecedores e vínculos com insumos'
    },
    {
      icon:'chef-hat', label:'Pré-preparo', cor:'var(--orange-dark)', bg:'var(--orange-light)',
      val: preparados.length, sub: `${ordens?.filter(o=>o.status==='pendente').length||0} ordens pendentes`,
      tab:'preparo', desc:'Cadastre preparados e controle ordens de produção'
    },
    {
      icon:'tag', label:'Produtos / Cardápio', cor:'var(--green)', bg:'var(--green-light)',
      val: (typeof produtos !== 'undefined' ? produtos.length : 0), sub: 'sabores e tamanhos',
      tab:'produtos', desc:'Gerencie o cardápio e produtos à venda'
    },
  ];

  el.innerHTML = `
    <div style="padding:20px 24px">
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:16px">
        Clique em qualquer card para abrir o cadastro correspondente.
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${cards.map(c => `
          <div onclick="abrirCadastroNaConfig('${c.tab}')"
            style="background:${c.bg};border:1.5px solid ${c.cor}22;border-radius:var(--r12);padding:18px;cursor:pointer;transition:all .15s"
            onmouseover="this.style.borderColor='${c.cor}';this.style.transform='translateY(-2px)'"
            onmouseout="this.style.borderColor='${c.cor}22';this.style.transform=''">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="width:36px;height:36px;border-radius:50%;background:${c.cor};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${lc(c.icon, 16, '#fff')}
              </div>
              <div>
                <div style="font-size:.84rem;font-weight:700">${c.label}</div>
                <div style="font-size:.62rem;color:var(--muted)">${c.sub}</div>
              </div>
            </div>
            <div style="font-size:1.6rem;font-weight:800;color:${c.cor};font-family:monospace;margin-bottom:4px">${c.val}</div>
            <div style="font-size:.68rem;color:var(--muted);line-height:1.4">${c.desc}</div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:10px;font-size:.7rem;font-weight:600;color:${c.cor}">
              ${lc('external-link', 11, 'currentColor')} Abrir cadastro
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function abrirCadastroNaConfig(tab) {
  // Navega para o módulo de cadastros na aba certa
  goModule('cadastros');
  if (typeof setCadTab === 'function') {
    setTimeout(() => setCadTab(tab), 50);
  }
}

// ── Aba Usuários ──────────────────────────────────────────────
function _renderCfgUsuarios() {
  const el = document.getElementById('cfgUserList');
  if (!el) return;

  if (!users.length) {
    el.innerHTML = `<div class="empty" style="padding:40px"><div class="empty-icon">${lc('users',24,'var(--muted)')}</div>Nenhum usuário cadastrado.</div>`;
    return;
  }

  el.innerHTML = users.map(u => {
    const p = PERMS[u.role] || {};
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;display:flex;align-items:center;gap:14px">
      <div style="width:44px;height:44px;border-radius:50%;
        background:${u.role==='gerente'?'var(--purple)':u.role==='supervisor'?'var(--orange-dark)':'var(--green)'};
        display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:#fff;flex-shrink:0">
        ${u.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
          <span style="font-size:.86rem;font-weight:700">${u.name}</span>
          <span class="badge" style="background:${p.bg||'var(--surface2)'};color:${p.color||'var(--muted)'}">${p.label||u.role}</span>
          ${u.active===false?'<span class="badge b-red">Inativo</span>':''}
        </div>
        <div style="font-size:.72rem;color:var(--muted)">${u.email}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:7px">
          ${(p.perms||[]).map(perm => `<span class="badge b-gray" style="font-size:.6rem">${lc('check',11,'currentColor')} ${perm}</span>`).join('')}
        </div>
      </div>
      <button class="btn btn-outline btn-xs" onclick="openEditUser(${u.id})">${lc('edit-2',13,'currentColor')}</button>
    </div>`;
  }).join('');
}

// ── Helpers ───────────────────────────────────────────────────
function getConfig() {
  return JSON.parse(localStorage.getItem('vtp_config') || '{}');
}

function getEmpresaWhatsapp() {
  return getConfig().whatsapp || '';
}

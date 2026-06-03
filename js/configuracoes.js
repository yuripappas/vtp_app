/**
 * VTP Compras — Vai Ter Pizza!
 * configuracoes.js — Módulo de Configurações (settings layout)
 */

let _cfgSection         = 'empresa';
let _cfgGrupoTab        = 'compras';
let _cfgEditCtx         = null;
let _cfgMostrarInativos = false;

const _CFG_SECTIONS = [
  { id:'empresa',      icon:'building-2', label:'Empresa'        },
  { id:'usuarios',     icon:'shield',     label:'Usuários'       },
  { id:'insumos',      icon:'package',    label:'Insumos'        },
  { id:'fornecedores', icon:'truck',      label:'Fornecedores'   },
  { id:'preparo',      icon:'chef-hat',   label:'Preparados'     },
  { id:'produtos',     icon:'pizza',      label:'Produtos'       },
  { id:'servicos',     icon:'wrench',     label:'Serviços'       },
  { id:'modulos',      icon:'settings',   label:'Personalização' },
  { id:'integracoes',  icon:'zap',        label:'Integrações'    },
  { id:'etiquetagem',  icon:'tag',        label:'Etiquetagem'    },
];

// Seções que usam o DOM transplant do page-cadastros
const _CFG_CAD_SECTIONS = new Set(['insumos','fornecedores','preparo','produtos','servicos']);

const _CFG_MODULOS_TABS = [
  { id:'equipe',     icon:'users',        label:'Equipe'     },
  { id:'estoque',    icon:'tag',          label:'Estoque'    },
  { id:'compras',    icon:'shopping-bag', label:'Compras'    },
  { id:'inventario', icon:'layers',       label:'Inventário' },
  { id:'manutencao', icon:'wrench',       label:'Manutenção' },
  { id:'desperdicio',icon:'trash-2',      label:'Desperdício'},
  { id:'checklist',  icon:'clock',        label:'Checklist'  },
];

const _CFG_ROLE_COLORS = {
  gerente:     { color:'var(--purple)',      bg:'var(--purple-xlight)' },
  supervisor:  { color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  comprador:   { color:'var(--green)',       bg:'var(--green-light)'   },
  funcionario: { color:'var(--muted)',       bg:'var(--surface2)'      },
};

const _CFG_EMP_ICONS = ['crown','key','chef-hat','utensils','headphones','bike','dollar-sign','sparkles','user','briefcase','coffee','truck','shield','package','star','wrench','scissors','clipboard-list','flame','thermometer','wind','settings','building-2','monitor','layers','map-pin','zap','droplets','hammer','grid','clock','check-square','tag'];
const _CFG_EMP_CORS  = [
  { label:'Roxo',    v:'var(--purple)',      bg:'var(--purple-xlight)' },
  { label:'Verde',   v:'var(--green)',       bg:'var(--green-light)'   },
  { label:'Vermelho',v:'var(--red)',         bg:'var(--red-light)'     },
  { label:'Amarelo', v:'var(--yellow)',      bg:'var(--yellow-light)'  },
  { label:'Laranja', v:'var(--orange-dark)', bg:'var(--orange-light)'  },
  { label:'Cinza',   v:'var(--muted)',       bg:'var(--surface2)'      },
];

// ── Entrada ───────────────────────────────────────────────────

function renderConfiguracoes() {
  _cfgSection = _cfgSection || 'empresa';
  _initCfgNav();
  setCfgSection(_cfgSection);
}

function _initCfgNav() {
  _CFG_SECTIONS.forEach(s => {
    const btn = document.getElementById(`cfgNav-${s.id}`);
    if (btn) btn.innerHTML = `${lc(s.icon, 14, 'currentColor')} ${s.label}`;
  });
}

function setCfgSection(section) {
  const wasCad = _CFG_CAD_SECTIONS.has(_cfgSection);
  const isCad  = _CFG_CAD_SECTIONS.has(section);

  // Se estava numa seção de cadastro e sai → devolve nós ao page-cadastros
  if (wasCad && !isCad) {
    const cadPage = document.getElementById('page-cadastros');
    const cfgEl   = document.getElementById('cfgSectionContent');
    if (cadPage && cfgEl) {
      // Remove cabeçalho injetado — não faz parte do conteúdo nativo do page-cadastros
      const injHdr = cfgEl.querySelector('.cfg-cad-header');
      if (injHdr) injHdr.remove();
      while (cfgEl.firstChild) cadPage.appendChild(cfgEl.firstChild);
    }
  }

  _cfgSection = section;
  _CFG_SECTIONS.forEach(s =>
    document.getElementById(`cfgNav-${s.id}`)?.classList.toggle('active', s.id === section)
  );

  const el = document.getElementById('cfgSectionContent');
  if (!el) return;

  // Limpa conteúdo, exceto quando navega entre duas seções de cadastro
  if (!(wasCad && isCad)) el.innerHTML = '';

  if      (section === 'empresa')     _renderCfgSecEmpresa(el);
  else if (section === 'integracoes') _renderCfgSecIntegracoes(el);
  else if (section === 'usuarios')    _renderCfgSecUsuarios(el);
  else if (section === 'modulos')     _renderCfgSecModulos(el);
  else if (section === 'etiquetagem') _renderCfgSecEtiquetagem(el);
  else if (isCad)                     _renderCfgCadSection(section, el);
}

function _renderCfgCadSection(section, el) {
  const cadPage = document.getElementById('page-cadastros');
  if (!cadPage) return;

  // 1. Mapas de título/ícone por seção
  const titles = {
    insumos:      { icon:'package',  title:'Insumos',      sub:'Matérias-primas e ingredientes usados na produção' },
    fornecedores: { icon:'truck',    title:'Fornecedores', sub:'Cadastro de fornecedores e condições comerciais'   },
    preparo:      { icon:'chef-hat', title:'Preparados',   sub:'Preparados internos usados na produção'            },
    produtos:     { icon:'pizza',    title:'Produtos',     sub:'Sabores de pizza e outros produtos'                },
    servicos:     { icon:'wrench',   title:'Serviços',     sub:'Prestadores externos e categorias de serviço'      },
  };
  const info = titles[section];

  // 2. Injeta ou atualiza cabeçalho padronizado
  const existingTitle = el.querySelector('.settings-section-title');
  if (existingTitle && info) {
    // Já existe (navegando entre seções de cadastro) — só atualiza
    existingTitle.innerHTML = `${lc(info.icon, 16, 'var(--purple)')} ${info.title}`;
    const existingSub = el.querySelector('.settings-section-sub');
    if (existingSub) existingSub.textContent = info.sub;
  } else if (info) {
    // Primeira entrada — injeta o cabeçalho antes de tudo
    const hdr = document.createElement('div');
    hdr.className = 'cfg-cad-header';
    hdr.innerHTML = `
      <div class="settings-section-title">${lc(info.icon, 16, 'var(--purple)')} ${info.title}</div>
      <div class="settings-section-sub">${info.sub}</div>`;
    el.insertBefore(hdr, el.firstChild);
  }

  // 3. Transplanta conteúdo do page-cadastros
  if (cadPage.children.length > 0) {
    while (cadPage.firstChild) el.appendChild(cadPage.firstChild);
  }

  // 4. Tab-bar some (nav lateral substitui)
  const tabBar = el.querySelector('.tab-bar');
  if (tabBar) tabBar.style.display = 'none';

  // 5. Ativa a aba correta
  setCadTab(section);
}

function _cfgToggleAddRow(id) {
  const el = document.getElementById('cfgAddRow-' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    const inp = el.querySelector('input.inp');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 40); }
  }
}

// Toggle individual category group (Insumos, Preparados, Produtos)
function toggleCfgCat(btn) {
  btn.closest('.cfg-cat-group').classList.toggle('collapsed');
}

// Toggle individual section block (Personalização sub-tabs)
function toggleCfgBlock(btn) {
  btn.closest('.cfg-section-block').classList.toggle('collapsed');
}

// Colapsar/expandir todos os .cfg-cat-group dentro de um container
function toggleAllCfgCats(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const groups = [...el.querySelectorAll('.cfg-cat-group')];
  const anyExpanded = groups.some(g => !g.classList.contains('collapsed'));
  groups.forEach(g => g.classList.toggle('collapsed', anyExpanded));
  const btn = document.getElementById(containerId + '-toggleAll');
  if (btn) btn.textContent = anyExpanded ? 'Expandir tudo' : 'Colapsar tudo';
}

// Colapsar/expandir todos os .cfg-section-block dentro de um container
function toggleAllCfgBlocks(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const blocks = [...el.querySelectorAll('.cfg-section-block')];
  const anyExpanded = blocks.some(b => !b.classList.contains('collapsed'));
  blocks.forEach(b => b.classList.toggle('collapsed', anyExpanded));
  const btn = document.getElementById(containerId + '-toggleAll');
  if (btn) btn.textContent = anyExpanded ? 'Expandir tudo' : 'Colapsar tudo';
}

// Compat: utils.js pode chamar setCfgTab('usuarios'), login.js, etc.
function setCfgTab(tab) {
  const map = {
    empresa:'empresa', usuarios:'usuarios',
    cadastros:'insumos', insumos:'insumos',
    fornecedores:'fornecedores', preparo:'preparo',
    produtos:'produtos', servicos:'servicos',
    equipe:'modulos', rh:'modulos',
    estoque:'modulos', estoque_cfg:'modulos', modulos:'modulos',
    etiquetagem:'etiquetagem',
  };
  _cfgSection = map[tab] || tab;
  if (document.getElementById('cfgSectionContent')) {
    _initCfgNav();
    setCfgSection(_cfgSection);
  }
}

// ── Seção: Empresa ────────────────────────────────────────────

function _renderCfgSecEmpresa(el) {
  const cfg = getConfig();
  const logoHtml = cfg.logoBase64
    ? `<img src="${cfg.logoBase64}" alt="Logo">`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">${lc('image', 26, 'var(--border-strong)')}</div>`;

  el.innerHTML = `
    <div class="settings-section-title">${lc('building-2',16,'var(--purple)')} Empresa</div>
    <div class="settings-section-sub">Identidade da empresa e aparência do sistema</div>

    <div style="margin-bottom:28px">
      <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Logo / Foto da empresa</div>
      <div class="cfg-logo-wrap">
        <div class="cfg-logo-preview" id="cfgLogoPreview">${logoHtml}</div>
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:3px">Logotipo ou foto</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:10px">Aparece no topo da barra lateral. Máx. 512 KB.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <label for="cfgLogoInput" class="btn btn-outline btn-sm" style="cursor:pointer">
              ${lc('upload', 12, 'currentColor')} Enviar imagem
            </label>
            <input type="file" id="cfgLogoInput" accept="image/*" style="display:none" onchange="cfgHandleLogoUpload(this)">
            ${cfg.logoBase64 ? `<button class="btn btn-ghost btn-sm" onclick="cfgRemoverLogo()">Remover</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:8px">
      <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px">Dados</div>
      <div class="f2" style="margin-bottom:12px">
        <div class="field" style="margin:0">
          <label>Nome da empresa</label>
          <input class="inp" id="cfgEmpresa" value="${cfg.empresa||''}" placeholder="ex: Vai Ter Pizza!">
        </div>
        <div class="field" style="margin:0">
          <label>Responsável</label>
          <input class="inp" id="cfgResponsavel" value="${cfg.responsavel||''}" placeholder="Nome do gestor">
        </div>
        <div class="field" style="margin:0">
          <label>CNPJ</label>
          <input class="inp" id="cfgCnpj" value="${cfg.cnpj||''}" placeholder="ex: 00.000.000/0001-00" maxlength="18">
        </div>
        <div class="field" style="margin:0">
          <label>WhatsApp (com DDD)</label>
          <input class="inp" id="cfgWhatsapp" value="${cfg.whatsapp||''}" placeholder="ex: 82999999999" maxlength="11">
        </div>
        <div class="field" style="margin:0">
          <label>CEP</label>
          <input class="inp" id="cfgCep" value="${cfg.cep||''}" placeholder="ex: 57025-355" maxlength="9">
        </div>
        <div class="field" style="margin:0">
          <label>Endereço</label>
          <input class="inp" id="cfgEndereco" value="${cfg.endereco||''}" placeholder="Rua, número, bairro, cidade/UF">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary btn-sm" onclick="saveConfiguracoes()">${lc('save',12,'#fff')} Salvar</button>
      </div>
    </div>`;
}

// ── Seção: RH ─────────────────────────────────────────────────

function _renderCfgSecRh(el) {
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}">${i}</option>`).join('');
  const _secTitle = (t, fn) => `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <span style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">${t}</span>
    ${fn ? `<button class="btn btn-ghost" style="font-size:var(--text-xs);color:var(--muted)" onclick="${fn}()">Restaurar</button>` : ''}
  </div>`;
  const _addBar = fields => `<div style="background:var(--surface2);padding:10px 12px;display:flex;gap:6px;align-items:center;border-bottom:1.5px solid var(--border)">${fields}</div>`;
  const _block = (titleHtml, addBarHtml, listId) => `<div style="margin-bottom:22px">
    ${titleHtml}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${addBarHtml}
      <div id="${listId}"></div>
    </div>
  </div>`;

  el.innerHTML = `
    <div class="settings-section-title">${lc('users',16,'var(--purple)')} Equipe</div>
    <div class="settings-section-sub">Cargos, funções de prestadores e tipos de ausência</div>
    ${_block(_secTitle('Cargos dos funcionários','_cfgResetCargos'), _addBar(`
      <input class="inp" id="cfgNewCargoNome" placeholder="Nome do cargo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddCargo()">
      <select class="inp" id="cfgNewCargoIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_cfgAddCargo()">${lc('plus',13,'#fff')} Add</button>`), 'cfgCargosList')}
    ${_block(_secTitle('Funções de Prestadores de Serviço','_cfgResetFuncoes'), _addBar(`
      <input class="inp" id="cfgNewFuncaoNome" placeholder="Nome da função" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddFuncao()">
      <select class="inp" id="cfgNewFuncaoIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_cfgAddFuncao()">${lc('plus',13,'#fff')} Add</button>`), 'cfgFuncoesList')}
    ${_block(_secTitle('Ausências / Afastamentos', null), _addBar(`
      <input class="inp" id="cfgNewAusencia" placeholder="Nome do tipo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddAusencia()">
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_cfgAddAusencia()">${lc('plus',13,'#fff')} Add</button>`), 'cfgAusenciaList')}`;
  _cfgRenderCargos(); _cfgRenderFuncoes(); _cfgRenderAusencias();
}

// ── Seção: Estoque ────────────────────────────────────────────

function _renderCfgSecEstoque(el) {
  const cfg = getConfig();
  const _secTitle = (t, fn) => `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <span style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">${t}</span>
    ${fn ? `<button class="btn btn-ghost" style="font-size:var(--text-xs);color:var(--muted)" onclick="${fn}()">Restaurar</button>` : ''}
  </div>`;
  const _addBar = fields => `<div style="background:var(--surface2);padding:10px 12px;display:flex;gap:6px;align-items:center;border-bottom:1.5px solid var(--border)">${fields}</div>`;
  const _block = (titleHtml, addBarHtml, listId) => `<div style="margin-bottom:22px">
    ${titleHtml}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${addBarHtml}
      <div id="${listId}"></div>
    </div>
  </div>`;

  el.innerHTML = `
    <div class="settings-section-title">${lc('tag',16,'var(--purple)')} Estoque</div>
    <div class="settings-section-sub">Limiares de alerta, categorias e permissões de contagem</div>

    <div style="margin-bottom:22px">
      ${_secTitle('Alerta Crítico de Estoque', null)}
      <div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:180px;font-size:var(--text-sm);color:var(--text2);line-height:1.6">
            Itens abaixo de <strong id="cfgPctCritDisplay">${cfg.pctCrit||40}%</strong> do mínimo entram em status <span style="color:var(--red);font-weight:700">CRÍTICO</span>.
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <input class="inp" type="number" id="cfgPctCrit" value="${cfg.pctCrit||40}" min="1" max="100"
              style="width:64px;text-align:center;font-size:var(--text-md);font-weight:700"
              oninput="const d=document.getElementById('cfgPctCritDisplay');if(d)d.textContent=(this.value||40)+'%'">
            <span style="font-size:var(--text-sm);color:var(--text2)">% do mínimo</span>
            <button class="btn btn-primary btn-sm" onclick="saveConfiguracoes()">Salvar</button>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:22px">
      ${_secTitle('Contagem de Estoque — Tolerância de Divergência', null)}
      <div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:180px;font-size:var(--text-sm);color:var(--text2);line-height:1.6">
            Para itens com <strong>débito automático no CW</strong>, divergências abaixo de
            <strong id="cfgTolDivDisplay">${cfg.toleranciaDiverg ?? 10}%</strong>
            são classificadas como <span style="color:var(--muted);font-weight:600">variação normal</span>.
            Acima disso, geram alerta de <span style="color:var(--red);font-weight:600">anomalia</span>.
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <input class="inp" type="number" id="cfgTolDiv" value="${cfg.toleranciaDiverg ?? 10}" min="1" max="50"
              style="width:64px;text-align:center;font-size:var(--text-md);font-weight:700"
              oninput="const d=document.getElementById('cfgTolDivDisplay');if(d)d.textContent=(this.value||10)+'%'">
            <span style="font-size:var(--text-sm);color:var(--text2)">% de tolerância</span>
            <button class="btn btn-primary btn-sm" onclick="saveConfiguracoes()">Salvar</button>
          </div>
        </div>
      </div>
    </div>

    ${_block(_secTitle('Categorias de Insumo', null), _addBar(`
      <input class="inp" id="cfgNewCatInsumo" placeholder="Nova categoria" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddCatInsumo()">
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_cfgAddCatInsumo()">${lc('plus',13,'#fff')} Add</button>`), 'cfgCatInsumoList')}
    ${_cfgContagemPermsHtml()}`;
  _cfgRenderCatInsumo();
}

// ── Seção: Módulos ────────────────────────────────────────────

function _renderCfgSecModulos(el) {
  if (!_CFG_MODULOS_TABS.find(t => t.id === _cfgGrupoTab)) {
    _cfgGrupoTab = 'equipe';
  }
  const tabsHtml = _CFG_MODULOS_TABS.map(t => {
    const active = _cfgGrupoTab === t.id;
    return `<button id="cfgGrupoTab-${t.id}" onclick="_cfgSetGrupoTab('${t.id}')"
      style="display:flex;align-items:center;gap:6px;padding:10px 14px;border:none;border-bottom:2.5px solid ${active?'var(--purple)':'transparent'};background:none;color:${active?'var(--purple)':'var(--text2)'};font-size:var(--text-sm);font-weight:${active?'700':'500'};cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">
      ${lc(t.icon,13,'currentColor')} ${t.label}
    </button>`;
  }).join('');

  el.innerHTML = `
    <div class="settings-section-title">${lc('settings',16,'var(--purple)')} Personalização</div>
    <div class="settings-section-sub">Configurações específicas de cada módulo operacional</div>
    <div style="display:flex;overflow-x:auto;border-bottom:1.5px solid var(--border);margin-bottom:20px">
      ${tabsHtml}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px;margin-top:-4px">
      <button id="cfgGrupoContent-toggleAll" class="btn btn-ghost btn-xs" style="color:var(--muted)"
        onclick="toggleAllCfgBlocks('cfgGrupoContent')">Colapsar tudo</button>
    </div>
    <div id="cfgGrupoContent"></div>`;
  _cfgRenderGrupoContent();
}

// ── Seção: Usuários ───────────────────────────────────────────

function _renderCfgSecUsuarios(el) {
  el.innerHTML = `
    <div class="settings-section-title">${lc('shield',16,'var(--purple)')} Usuários & Permissões</div>
    <div class="settings-section-sub">Cadastro de usuários e controle de acesso ao sistema</div>
    <div id="cfgUserList" style="display:flex;flex-direction:column;gap:12px"></div>`;
  _renderCfgUsuarios();
}

// ── Seção: Integrações ────────────────────────────────────────

function _renderCfgSecIntegracoes(el) {
  const cfg = getConfig();
  el.innerHTML = `
    <div class="settings-section-title">${lc('zap',16,'var(--purple)')} Integrações</div>
    <div class="settings-section-sub">Tokens e conexões com sistemas externos</div>

    <div style="border:1.5px solid var(--border);border-radius:var(--r12);padding:18px 20px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        ${lc('monitor',16,'var(--purple)')}
        <div>
          <div style="font-size:var(--text-sm);font-weight:700">Cardápio Web</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Token da API de integração do sistema de pedidos</div>
        </div>
      </div>
      <div class="field" style="margin:0 0 12px">
        <label>Token API</label>
        <input class="inp" id="cfgCodLoja" value="${cfg.codLoja||''}" placeholder="Cole aqui o token gerado em Configurações → Integrações → API de Integração">
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary btn-sm" onclick="saveConfiguracoes()">${lc('save',12,'#fff')} Salvar</button>
      </div>
    </div>`;
}

// ── Logo da empresa ───────────────────────────────────────────

function cfgHandleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512 * 1024) { toast('Imagem muito grande (máx. 512 KB)', 'err'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const b64 = e.target.result;
    const prev = document.getElementById('cfgLogoPreview');
    if (prev) prev.innerHTML = `<img src="${b64}" alt="Logo">`;
    const cfg = getConfig();
    cfg.logoBase64 = b64;
    db._set('vtp_config', cfg);
    _updateSidebarLogo();
    // Re-render para mostrar botão Remover
    setCfgSection('empresa');
    toast('Logo atualizada!');
  };
  reader.readAsDataURL(file);
}

function cfgRemoverLogo() {
  const cfg = getConfig();
  delete cfg.logoBase64;
  db._set('vtp_config', cfg);
  _updateSidebarLogo();
  setCfgSection('empresa');
  toast('Logo removida');
}

function _updateSidebarLogo() {
  const cfg = getConfig();
  const img = document.getElementById('sbLogoImg');
  if (img) img.src = cfg.logoBase64 || 'assets/logo-bg.jpg';
  const txt = document.getElementById('sbLogoText');
  if (txt) txt.textContent = cfg.empresa || 'Vai Ter Pizza!';
}

function _cfgSetGrupoTab(tab) {
  _cfgGrupoTab = tab;
  document.querySelectorAll('[id^="cfgGrupoTab-"]').forEach(btn => {
    const active = btn.id === `cfgGrupoTab-${tab}`;
    btn.style.borderBottomColor = active ? 'var(--purple)' : 'transparent';
    btn.style.color = active ? 'var(--purple)' : 'var(--text2)';
    btn.style.fontWeight = active ? '700' : '500';
  });
  _cfgRenderGrupoContent();
}

function _cfgRenderGrupoContent() {
  const el = document.getElementById('cfgGrupoContent');
  if (!el) return;
  // Reseta label do botão global ao trocar de aba
  const toggleAllBtn = document.getElementById('cfgGrupoContent-toggleAll');
  if (toggleAllBtn) toggleAllBtn.textContent = 'Colapsar tudo';
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}">${i}</option>`).join('');

  // Helper: seção colapsável com título, chevron, botão "Adicionar" e lista
  const _sb = (title, resetFn, addRowId, addRowHtml, listId) => `
    <div class="cfg-section-block">
      <div class="cfg-section-block-header">
        <button class="cfg-section-block-toggle" onclick="toggleCfgBlock(this)">
          <span class="cfg-section-block-chevron">${lc('chevron-down',13,'currentColor')}</span>
          <span class="cfg-section-block-title">${title}</span>
        </button>
        <div class="cfg-section-block-actions">
          ${resetFn ? `<button class="btn btn-ghost btn-xs" onclick="${resetFn}()" style="color:var(--muted)">Restaurar</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="_cfgToggleAddRow('${addRowId}')">${lc('plus',12,'currentColor')} Adicionar</button>
        </div>
      </div>
      <div class="cfg-section-block-body">
        <div id="cfgAddRow-${addRowId}" style="display:none;margin-bottom:6px">
          <div style="display:flex;gap:6px;align-items:center;padding:10px 14px;background:var(--purple-xlight);border:1.5px solid var(--purple);border-radius:var(--r8)">
            ${addRowHtml}
          </div>
        </div>
        <div id="${listId}"></div>
      </div>
    </div>`;

  if (_cfgGrupoTab === 'equipe' || _cfgGrupoTab === 'empresa') {
    el.innerHTML =
      _sb('Cargos dos Funcionários', '_cfgResetCargos', 'cargos',
        `<input class="inp" id="cfgNewCargoNome" placeholder="Nome do cargo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddCargo()">
         <select class="inp" id="cfgNewCargoIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddCargo()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('cargos')">Cancelar</button>`,
        'cfgCargosList') +
      _sb('Funções de Prestadores', '_cfgResetFuncoes', 'funcoes',
        `<input class="inp" id="cfgNewFuncaoNome" placeholder="Nome da função" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddFuncao()">
         <select class="inp" id="cfgNewFuncaoIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddFuncao()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('funcoes')">Cancelar</button>`,
        'cfgFuncoesList') +
      _sb('Ausências / Afastamentos', null, 'ausencias',
        `<input class="inp" id="cfgNewAusencia" placeholder="Nome do tipo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddAusencia()">
         <button class="btn btn-primary btn-sm" onclick="_cfgAddAusencia()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('ausencias')">Cancelar</button>`,
        'cfgAusenciaList');
    _cfgRenderCargos(); _cfgRenderFuncoes(); _cfgRenderAusencias();

  } else if (_cfgGrupoTab === 'estoque') {
    const cfg = getConfig();
    el.innerHTML =
      `<div class="cfg-section-block">
        <div class="cfg-section-block-header">
          <button class="cfg-section-block-toggle" onclick="toggleCfgBlock(this)">
            <span class="cfg-section-block-chevron">${lc('chevron-down',13,'currentColor')}</span>
            <span class="cfg-section-block-title">Alerta Crítico de Estoque</span>
          </button>
        </div>
        <div class="cfg-section-block-body">
          <div class="card" style="padding:14px 16px">
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:180px;font-size:var(--text-sm);color:var(--text2);line-height:1.6">
                Itens abaixo de <strong id="cfgPctCritDisplay">${cfg.pctCrit||40}%</strong> do mínimo entram em status <span style="color:var(--red);font-weight:700">CRÍTICO</span>.
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <input class="inp" type="number" id="cfgPctCrit" value="${cfg.pctCrit||40}" min="1" max="100"
                  style="width:64px;text-align:center;font-size:var(--text-md);font-weight:700"
                  oninput="const d=document.getElementById('cfgPctCritDisplay');if(d)d.textContent=(this.value||40)+'%'">
                <span style="font-size:var(--text-sm);color:var(--text2)">% do mínimo</span>
                <button class="btn btn-primary btn-sm" onclick="saveConfiguracoes()">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      </div>` +
      _sb('Categorias de Insumo', null, 'catInsumo',
        `<input class="inp" id="cfgNewCatInsumo" placeholder="Nova categoria" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddCatInsumo()">
         <button class="btn btn-primary btn-sm" onclick="_cfgAddCatInsumo()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('catInsumo')">Cancelar</button>`,
        'cfgCatInsumoList');
    _cfgRenderCatInsumo();

  } else if (_cfgGrupoTab === 'compras') {
    el.innerHTML =
      _sb('Tipos de Lista de Compras', null, 'tiposLista',
        `<input class="inp" id="cfgNewTipoListaLabel" placeholder="Nome do tipo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddTipoLista()">
         <select class="inp" id="cfgNewTipoListaIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddTipoLista()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('tiposLista')">Cancelar</button>`,
        'cfgTiposListaList');
    _cfgRenderTiposLista();

  } else if (_cfgGrupoTab === 'inventario') {
    el.innerHTML =
      _sb('Localizações', '_cfgResetInvLocais', 'invLoc',
        `<input class="inp" id="cfgNewInvLoc" placeholder="Nome da localização" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddInvLoc()">
         <button class="btn btn-primary btn-sm" onclick="_cfgAddInvLoc()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('invLoc')">Cancelar</button>`,
        'cfgInvLocaisList') +
      _sb('Tipos de Ativo', '_cfgResetInvCats', 'invCat',
        `<input class="inp" id="cfgNewInvCatLabel" placeholder="Nome do tipo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddInvCat()">
         <select class="inp" id="cfgNewInvCatIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddInvCat()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('invCat')">Cancelar</button>`,
        'cfgInvCatsList');
    _cfgRenderInvLocais(); _cfgRenderInvCats();

  } else if (_cfgGrupoTab === 'manutencao') {
    el.innerHTML =
      _sb('Categorias de Manutenção', '_cfgResetManutCats', 'manutCat',
        `<input class="inp" id="cfgNewManutCatLabel" placeholder="Nome da categoria" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddManutCat()">
         <select class="inp" id="cfgNewManutCatIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddManutCat()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('manutCat')">Cancelar</button>`,
        'cfgManutCatsList') +
      _sb('Grupos / Setores', '_cfgResetManutGrupos', 'manutGrupo',
        `<input class="inp" id="cfgNewManutGrupoLabel" placeholder="Nome do grupo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddManutGrupo()">
         <select class="inp" id="cfgNewManutGrupoIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddManutGrupo()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('manutGrupo')">Cancelar</button>`,
        'cfgManutGruposList');
    _cfgRenderManutCats(); _cfgRenderManutGrupos();

  } else if (_cfgGrupoTab === 'desperdicio') {
    el.innerHTML =
      _sb('Tipos de Desperdício', '_cfgResetTiposDesp', 'tiposDesp',
        `<input class="inp" id="cfgNewDespNome" placeholder="Nome do tipo" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddTipoDesp()">
         <select class="inp" id="cfgNewDespIcon" style="padding:7px 8px;font-size:var(--text-sm);width:auto">${iconOpts}</select>
         <button class="btn btn-primary btn-sm" onclick="_cfgAddTipoDesp()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('tiposDesp')">Cancelar</button>`,
        'cfgTiposDespList');
    _cfgRenderTiposDesp();

  } else if (_cfgGrupoTab === 'checklist') {
    el.innerHTML =
      `<div style="display:flex;align-items:flex-start;gap:8px;padding:9px 12px;background:var(--surface2);border-radius:var(--r8);border-left:3px solid var(--border);margin-bottom:12px;font-size:var(--text-xs);color:var(--text2);line-height:1.5">
        ${lc('info',12,'var(--text2)')} Os turnos são referenciados pelos checklists. Renomear o rótulo não afeta dados existentes.
      </div>` +
      _sb('Turnos', '_cfgResetCkTurnos', 'ckTurno',
        `<input class="inp" id="cfgNewCkTurnoLabel" placeholder="Rótulo do turno" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_cfgAddCkTurno()">
         <button class="btn btn-primary btn-sm" onclick="_cfgAddCkTurno()">${lc('check',12,'#fff')} Salvar</button>
         <button class="btn btn-ghost btn-sm" onclick="_cfgToggleAddRow('ckTurno')">Cancelar</button>`,
        'cfgCkTurnosList');
    _cfgRenderCkTurnos();
  }
}

// ── Render helpers ────────────────────────────────────────────

const _cfgDelBtn = (onclick, title) =>
  `<button onclick="${onclick}" title="${title||'Remover'}"
    style="background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;line-height:0;color:var(--muted);flex-shrink:0"
    onmouseover="this.style.background='var(--red-light)';this.style.color='var(--red)'"
    onmouseout="this.style.background='none';this.style.color='var(--muted)'">${lc('trash-2',14,'currentColor')}</button>`;

const _cfgIconDot = (icon, color, bg, size) => {
  const s = size || 28;
  return `<div style="width:${s}px;height:${s}px;border-radius:7px;background:${bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">${lc(icon||'package',Math.round(s*.5),color||'var(--muted)')}</div>`;
};

function _cfgRenderCargos() {
  const el = document.getElementById('cfgCargosList');
  if (!el) return;
  const entries = Object.entries(typeof FUNC_CARGOS !== 'undefined' ? FUNC_CARGOS : {});
  if (!entries.length) { el.innerHTML = `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum cargo cadastrado.</div>`; return; }
  el.innerHTML = entries.map(([k, v]) =>
    `<div class="cfg-row">
      ${_cfgIconDot(v.icon||'user', 'var(--purple)', 'var(--purple-xlight)')}
      <span class="cfg-row-label">${v.label}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditarCargo('${k}')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverCargo('${k}')`, 'Remover cargo')}
      </div>
    </div>`).join('');
  _cfgUpdateNavBadge('cargos', entries.length);
}

function _cfgEditarCargo(key) {
  const v = FUNC_CARGOS[key]; if (!v) return;
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}" ${v.icon===i?'selected':''}>${i}</option>`).join('');
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Editar cargo</div>
    <div class="field"><label class="slbl">Nome *</label><input id="ceNome" class="inp" value="${v.label}"></div>
    <div class="field"><label class="slbl">Ícone</label><select id="ceIcon" class="inp" style="font-size:var(--text-sm)">${iconOpts}</select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarCargo('${key}',this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

function _cfgSalvarCargo(key, btn) {
  const nome = document.getElementById('ceNome')?.value.trim();
  const icon = document.getElementById('ceIcon')?.value || 'user';
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  FUNC_CARGOS[key] = { ...FUNC_CARGOS[key], label: nome, icon, color: 'var(--purple)', bg: 'var(--purple-xlight)' };
  saveFuncCargos();
  btn.closest('.overlay').remove();
  _cfgRenderCargos();
  toast('Cargo atualizado', 'ok');
}

// ── Edit genérico para dicts {label, icon, color, bg} ─────────

function _cfgAbrirEditItem(titulo, dictName, saveName, key, renderName) {
  const dict = window[dictName];
  if (!dict?.[key]) return;
  const v = dict[key];
  _cfgEditCtx = { dictName, saveName, key, renderName };
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}" ${v.icon===i?'selected':''}>${i}</option>`).join('');
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">${titulo}</div>
    <div class="field"><label class="slbl">Nome *</label><input id="ceItemNome" class="inp" value="${v.label.replace(/"/g,'&quot;')}"></div>
    <div class="field"><label class="slbl">Ícone</label><select id="ceItemIcon" class="inp" style="font-size:var(--text-sm)">${iconOpts}</select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarEditItem(this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('ceItemNome')?.focus(), 60);
}

function _cfgSalvarEditItem(btn) {
  if (!_cfgEditCtx) return;
  const { dictName, saveName, key, renderName } = _cfgEditCtx;
  const nome = document.getElementById('ceItemNome')?.value.trim();
  const icon = document.getElementById('ceItemIcon')?.value || 'package';
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  window[dictName][key] = { ...window[dictName][key], label: nome, icon, color: 'var(--purple)', bg: 'var(--purple-xlight)' };
  window[saveName]();
  btn.closest('.overlay').remove();
  window[renderName]();
  toast('Atualizado', 'ok');
  _cfgEditCtx = null;
}

// ── Edit Tipos de Desperdício (array) ─────────────────────────

function _cfgEditarTipoDesp(id) {
  const t = typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO.find(x => x.id === id) : null;
  if (!t) return;
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}" ${t.icon===i?'selected':''}>${i}</option>`).join('');
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Editar tipo de desperdício</div>
    <div class="field"><label class="slbl">Nome *</label><input id="ceTipoNome" class="inp" value="${t.label.replace(/"/g,'&quot;')}"></div>
    <div class="field"><label class="slbl">Ícone</label><select id="ceTipoIcon" class="inp" style="font-size:var(--text-sm)">${iconOpts}</select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarTipoDesp('${id}',this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('ceTipoNome')?.focus(), 60);
}

function _cfgSalvarTipoDesp(id, btn) {
  const nome = document.getElementById('ceTipoNome')?.value.trim();
  const icon = document.getElementById('ceTipoIcon')?.value || 'trash-2';
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  const idx = TIPOS_DESPERDICIO.findIndex(x => x.id === id);
  if (idx < 0) return;
  TIPOS_DESPERDICIO[idx] = { ...TIPOS_DESPERDICIO[idx], label: nome, icon };
  saveTiposDesperdicio();
  btn.closest('.overlay').remove();
  _cfgRenderTiposDesp();
  toast('Tipo atualizado', 'ok');
}

// ── Edit Ausências (array) ────────────────────────────────────

function _cfgEditarAusencia(id) {
  const a = typeof TIPOS_AUSENCIA !== 'undefined' ? TIPOS_AUSENCIA.find(x => x.id === id) : null;
  if (!a) return;
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Editar tipo de ausência</div>
    <div class="field"><label class="slbl">Nome *</label><input id="ceAusNome" class="inp" value="${a.label.replace(/"/g,'&quot;')}"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarAusencia('${id}',this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('ceAusNome')?.focus(), 60);
}

function _cfgSalvarAusencia(id, btn) {
  const nome = document.getElementById('ceAusNome')?.value.trim();
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  const idx = TIPOS_AUSENCIA.findIndex(x => x.id === id);
  if (idx < 0) return;
  TIPOS_AUSENCIA[idx] = { ...TIPOS_AUSENCIA[idx], label: nome };
  saveTiposAusencia();
  btn.closest('.overlay').remove();
  _cfgRenderAusencias();
  toast('Tipo atualizado', 'ok');
}

function _cfgRenderFuncoes() {
  const el = document.getElementById('cfgFuncoesList');
  if (!el) return;
  const entries = Object.entries(typeof TERCEIR_FUNCOES !== 'undefined' ? TERCEIR_FUNCOES : {});
  if (!entries.length) { el.innerHTML = `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhuma função cadastrada.</div>`; return; }
  el.innerHTML = entries.map(([k, v]) =>
    `<div class="cfg-row">
      ${_cfgIconDot(v.icon||'user', 'var(--purple)', 'var(--purple-xlight)')}
      <span class="cfg-row-label">${v.label}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgAbrirEditItem('Editar função','TERCEIR_FUNCOES','saveTerceirFuncoes','${k}','_cfgRenderFuncoes')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverFuncao('${k}')`, 'Remover função')}
      </div>
    </div>`).join('');
  _cfgUpdateNavBadge('funcoes', entries.length);
}

function _cfgRenderTiposDesp() {
  const el = document.getElementById('cfgTiposDespList');
  if (!el) return;
  const lista = typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO : [];
  if (!lista.length) { el.innerHTML = `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum tipo cadastrado.</div>`; return; }
  el.innerHTML = lista.map(t =>
    `<div class="cfg-row">
      ${_cfgIconDot(t.icon||'trash-2', 'var(--purple)', 'var(--purple-xlight)')}
      <span class="cfg-row-label">${t.label}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditarTipoDesp('${t.id}')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverTipoDesp('${t.id}')`, 'Remover tipo')}
      </div>
    </div>`).join('');
  _cfgUpdateNavBadge('desperdicio', lista.length);
}

function _cfgContagemPermsHtml() {
  const perms = getContagemPerms();
  const ROLES = [
    { id:'gerente',     label:'Gerente'     },
    { id:'supervisor',  label:'Supervisor'  },
    { id:'comprador',   label:'Comprador'   },
    { id:'funcionario', label:'Funcionário' },
  ];
  const _row = (tipo, titulo, desc) => `
    <div style="padding:14px 16px;${tipo==='semanal'?'border-top:1px solid var(--border)':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="min-width:180px">
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:2px">${titulo}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">${desc}</div>
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          ${ROLES.map(r => {
            const checked = (perms[tipo] || []).includes(r.id);
            return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--text-sm);color:var(--text2);user-select:none">
              <input type="checkbox" id="cperm_${tipo}_${r.id}" ${checked?'checked':''} style="accent-color:var(--purple);width:14px;height:14px">
              ${r.label}
            </label>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  return `<div style="margin-bottom:22px;margin-top:22px">
    <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Permissões de Contagem</div>
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${_row('diaria',  'Contagem Diária',  'Quem pode realizar a contagem diária de estoque')}
      ${_row('semanal', 'Contagem Semanal', 'Quem pode realizar a contagem semanal completa')}
      <div style="padding:10px 16px;border-top:1px solid var(--border);background:var(--surface2);display:flex;justify-content:flex-end">
        <button class="btn btn-primary btn-sm" onclick="saveContagemPerms()">Salvar permissões</button>
      </div>
    </div>
  </div>`;
}

let _cfgCatInsumoEditIdx = null;

function _cfgRenderCatInsumo() {
  const el = document.getElementById('cfgCatInsumoList');
  if (!el) return;
  const lista = typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : [];
  if (!lista.length) { el.innerHTML = `<div style="padding:20px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhuma categoria cadastrada.</div>`; return; }
  el.innerHTML = lista.map((cat, idx) => {
    if (_cfgCatInsumoEditIdx === idx) {
      return `<div class="cfg-row" style="border-color:var(--purple);background:var(--purple-xlight)">
        <input class="inp" id="cfgCatInsumoEditInp" value="${cat.replace(/"/g,'&quot;')}" style="flex:1;font-size:var(--text-sm);height:32px"
          onkeydown="if(event.key==='Enter')_cfgSaveCatInsumo(${idx});if(event.key==='Escape')_cfgCancelCatInsumo()">
        <div class="cfg-row-actions">
          <button class="btn btn-primary btn-xs" onclick="_cfgSaveCatInsumo(${idx})">${lc('check',11,'#fff')}</button>
          <button class="btn btn-ghost btn-xs" onclick="_cfgCancelCatInsumo()">${lc('x',11,'currentColor')}</button>
        </div>
      </div>`;
    }
    return `<div class="cfg-row">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0"></div>
      <span class="cfg-row-label">${cat}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditCatInsumo(${idx})" title="Renomear">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverCatInsumo(${idx})`, 'Remover categoria')}
      </div>
    </div>`;
  }).join('');
  if (_cfgCatInsumoEditIdx !== null) setTimeout(() => document.getElementById('cfgCatInsumoEditInp')?.focus(), 40);
  _cfgUpdateNavBadge('insumos', lista.length);
}

function _cfgEditCatInsumo(idx) {
  _cfgCatInsumoEditIdx = idx;
  _cfgRenderCatInsumo();
}

function _cfgSaveCatInsumo(idx) {
  const val = document.getElementById('cfgCatInsumoEditInp')?.value.trim();
  if (!val) { toast('Nome não pode ser vazio', 'err'); return; }
  if (CATEGORIAS_INSUMO.some((c, i) => i !== idx && c === val)) { toast('Categoria já existe', 'err'); return; }
  CATEGORIAS_INSUMO[idx] = val;
  saveCategoriasInsumo();
  _cfgCatInsumoEditIdx = null;
  _cfgRenderCatInsumo();
  toast(`Categoria renomeada para "${val}"`, 'ok');
}

function _cfgCancelCatInsumo() {
  _cfgCatInsumoEditIdx = null;
  _cfgRenderCatInsumo();
}

function _cfgRenderAusencias() {
  const el = document.getElementById('cfgAusenciaList');
  if (!el) return;
  const lista = typeof TIPOS_AUSENCIA !== 'undefined' ? TIPOS_AUSENCIA : [];
  if (!lista.length) { el.innerHTML = `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum tipo cadastrado.</div>`; return; }
  el.innerHTML = lista.map(a =>
    `<div class="cfg-row">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0"></div>
      <span class="cfg-row-label">${a.label}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditarAusencia('${a.id}')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverAusencia('${a.id}')`, 'Remover ausência')}
      </div>
    </div>`).join('');
  _cfgUpdateNavBadge('ausencias', lista.length);
}

function _cfgUpdateNavBadge(sec, count) {
  const btn = document.getElementById(`cfgEmpNav-${sec}`);
  if (!btn) return;
  const badge = btn.querySelector('span:last-child');
  if (badge) badge.textContent = count;
}

// ── Ações — Cargos ────────────────────────────────────────────

function _cfgAddCargo() {
  const nome = document.getElementById('cfgNewCargoNome')?.value.trim();
  if (!nome) { toast('Informe o nome do cargo', 'err'); return; }
  const icon = document.getElementById('cfgNewCargoIcon')?.value || 'user';

  const key = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (!key) { toast('Nome inválido para chave', 'err'); return; }

  FUNC_CARGOS[key] = { label: nome, icon, color: 'var(--purple)', bg: 'var(--purple-xlight)' };
  saveFuncCargos();

  if (typeof rhConfig !== 'undefined' && rhConfig.cargoParaTime) {
    rhConfig.cargoParaTime[key] = 'fechamento';
    saveRhConfig();
  }

  document.getElementById('cfgNewCargoNome').value = '';
  _cfgRenderCargos();
  toast(`Cargo "${nome}" adicionado!`);
}

function _cfgRemoverCargo(key) {
  if (Object.keys(FUNC_CARGOS).length <= 1) {
    toast('Deve existir ao menos um cargo', 'err');
    return;
  }
  const label = FUNC_CARGOS[key]?.label || key;
  delete FUNC_CARGOS[key];
  saveFuncCargos();
  if (typeof rhConfig !== 'undefined' && rhConfig.cargoParaTime) {
    delete rhConfig.cargoParaTime[key];
    saveRhConfig();
  }
  _cfgRenderCargos();
  toast(`Cargo "${label}" removido.`);
}

function _cfgResetCargos() {
  vtpConfirm({
    title: 'Restaurar cargos padrão',
    message: 'Os cargos personalizados serão perdidos.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      Object.keys(FUNC_CARGOS).forEach(k => delete FUNC_CARGOS[k]);
      Object.assign(FUNC_CARGOS, JSON.parse(JSON.stringify(_FUNC_CARGOS_DEFAULT)));
      saveFuncCargos();
      _cfgRenderCargos();
      toast('Cargos restaurados para o padrão.');
    }
  });
}

// ── Ações — Funções de Terceirizados ─────────────────────────

function _cfgAddFuncao() {
  const nome = document.getElementById('cfgNewFuncaoNome')?.value.trim();
  if (!nome) { toast('Informe o nome da função', 'err'); return; }
  const icon = document.getElementById('cfgNewFuncaoIcon')?.value || 'user';
  const key  = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!key) { toast('Nome inválido', 'err'); return; }
  TERCEIR_FUNCOES[key] = { label: nome, icon, color: 'var(--purple)', bg: 'var(--purple-xlight)' };
  saveTerceirFuncoes();
  document.getElementById('cfgNewFuncaoNome').value = '';
  _cfgRenderFuncoes();
  toast(`Função "${nome}" adicionada!`);
}

function _cfgRemoverFuncao(key) {
  if (Object.keys(TERCEIR_FUNCOES).length <= 1) { toast('Deve existir ao menos uma função', 'err'); return; }
  const label = TERCEIR_FUNCOES[key]?.label || key;
  delete TERCEIR_FUNCOES[key];
  saveTerceirFuncoes();
  _cfgRenderFuncoes();
  toast(`Função "${label}" removida.`);
}

function _cfgResetFuncoes() {
  vtpConfirm({
    title: 'Restaurar funções padrão',
    message: 'As funções personalizadas serão perdidas.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      Object.keys(TERCEIR_FUNCOES).forEach(k => delete TERCEIR_FUNCOES[k]);
      Object.assign(TERCEIR_FUNCOES, JSON.parse(JSON.stringify(_TERCEIR_FUNCOES_DEFAULT)));
      saveTerceirFuncoes();
      _cfgRenderFuncoes();
      toast('Funções restauradas para o padrão.');
    }
  });
}

// ── Ações — Tipos de Desperdício ──────────────────────────────

function _cfgAddTipoDesp() {
  if (typeof TIPOS_DESPERDICIO === 'undefined') { toast('TIPOS_DESPERDICIO não disponível', 'err'); return; }
  const nome = document.getElementById('cfgNewDespNome')?.value.trim();
  if (!nome) { toast('Informe o nome do tipo', 'err'); return; }
  const icon = document.getElementById('cfgNewDespIcon')?.value || 'trash-2';

  const id = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (!id) { toast('Nome inválido', 'err'); return; }

  TIPOS_DESPERDICIO.push({ id, label: nome, icon });
  saveTiposDesperdicio();
  document.getElementById('cfgNewDespNome').value = '';
  _cfgRenderTiposDesp();
  toast(`Tipo "${nome}" adicionado!`);
}

function _cfgRemoverTipoDesp(id) {
  if (typeof TIPOS_DESPERDICIO === 'undefined') return;
  const t = TIPOS_DESPERDICIO.find(x => x.id === id);
  TIPOS_DESPERDICIO.splice(TIPOS_DESPERDICIO.findIndex(x => x.id === id), 1);
  saveTiposDesperdicio();
  _cfgRenderTiposDesp();
  toast(`Tipo "${t?.label || id}" removido.`);
}

function _cfgResetTiposDesp() {
  if (typeof TIPOS_DESPERDICIO === 'undefined' || typeof _TIPOS_DESPERDICIO_DEFAULT === 'undefined') return;
  vtpConfirm({
    title: 'Restaurar tipos de desperdício',
    message: 'Os tipos personalizados serão substituídos pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      TIPOS_DESPERDICIO.splice(0, TIPOS_DESPERDICIO.length, ...JSON.parse(JSON.stringify(_TIPOS_DESPERDICIO_DEFAULT)));
      saveTiposDesperdicio();
      _cfgRenderTiposDesp();
      toast('Tipos de desperdício restaurados.');
    }
  });
}

// ── Ações — Categorias de Insumo ─────────────────────────────

function _cfgAddCatInsumo() {
  if (typeof CATEGORIAS_INSUMO === 'undefined') { toast('CATEGORIAS_INSUMO não disponível', 'err'); return; }
  const nome = document.getElementById('cfgNewCatInsumo')?.value.trim();
  if (!nome) { toast('Informe o nome da categoria', 'err'); return; }
  if (CATEGORIAS_INSUMO.includes(nome)) { toast('Categoria já existe', 'err'); return; }
  CATEGORIAS_INSUMO.push(nome);
  saveCategoriasInsumo();
  document.getElementById('cfgNewCatInsumo').value = '';
  _cfgRenderCatInsumo();
  toast(`Categoria "${nome}" adicionada!`);
}

function _cfgRemoverCatInsumo(idx) {
  if (typeof CATEGORIAS_INSUMO === 'undefined') return;
  const nome = CATEGORIAS_INSUMO[idx];
  CATEGORIAS_INSUMO.splice(idx, 1);
  saveCategoriasInsumo();
  _cfgRenderCatInsumo();
  toast(`Categoria "${nome}" removida.`);
}

// ── Ações — Tipos de Ausência ─────────────────────────────────

function _cfgAddAusencia() {
  if (typeof TIPOS_AUSENCIA === 'undefined') { toast('TIPOS_AUSENCIA não disponível', 'err'); return; }
  const nome = document.getElementById('cfgNewAusencia')?.value.trim();
  if (!nome) { toast('Informe o nome do tipo de ausência', 'err'); return; }

  const id = nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (!id) { toast('Nome inválido', 'err'); return; }
  if (TIPOS_AUSENCIA.find(a => a.id === id)) { toast('Tipo de ausência já existe', 'err'); return; }

  TIPOS_AUSENCIA.push({ id, label: nome });
  saveTiposAusencia();
  document.getElementById('cfgNewAusencia').value = '';
  _cfgRenderAusencias();
  toast(`Tipo "${nome}" adicionado!`);
}

function _cfgRemoverAusencia(id) {
  if (typeof TIPOS_AUSENCIA === 'undefined') return;
  const a = TIPOS_AUSENCIA.find(x => x.id === id);
  TIPOS_AUSENCIA.splice(TIPOS_AUSENCIA.findIndex(x => x.id === id), 1);
  saveTiposAusencia();
  _cfgRenderAusencias();
  toast(`Tipo "${a?.label || id}" removido.`);
}

// ── Helper: renderiza dict de categorias (inv_cats / manut_cats / manut_grupos) ──

function _cfgRenderDictSec(listId, dict, removeFn, badgeSec, getEditOnclick) {
  const el = document.getElementById(listId);
  if (!el) return;
  const entries = Object.entries(dict);
  if (!entries.length) { el.innerHTML = `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum item cadastrado.</div>`; return; }
  el.innerHTML = entries.map(([k, v]) =>
    `<div class="cfg-row">
      ${_cfgIconDot(v.icon||'package', 'var(--purple)', 'var(--purple-xlight)')}
      <div style="flex:1;min-width:0">
        <span class="cfg-row-label">${v.label}</span>
        ${v._builtin ? `<span style="display:inline-block;margin-left:6px;font-size:var(--text-2xs);background:var(--border);color:var(--text2);border-radius:4px;padding:1px 6px">Sistema</span>` : ''}
      </div>
      <div class="cfg-row-actions">
        ${getEditOnclick ? `<button class="btn btn-ghost btn-xs" onclick="${getEditOnclick(k)}" title="Editar">${lc('edit-2',12,'currentColor')}</button>` : ''}
        ${_cfgDelBtn(`${removeFn}('${k}')`, 'Remover')}
      </div>
    </div>`
  ).join('');
  if (badgeSec) _cfgUpdateNavBadge(badgeSec, entries.length);
}

function _cfgAddDictEntry(dict, saveFn, labelInputId, iconInputId, _unused, renderFn, badgeSec) {
  const label = document.getElementById(labelInputId)?.value.trim();
  if (!label) { toast('Informe o nome', 'err'); return; }
  const icon = document.getElementById(iconInputId)?.value || 'package';
  const key = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!key) { toast('Nome inválido', 'err'); return; }
  if (dict[key]) { toast('Já existe um item com esse nome', 'err'); return; }
  dict[key] = { label, icon, color: 'var(--purple)', bg: 'var(--purple-xlight)' };
  saveFn();
  document.getElementById(labelInputId).value = '';
  renderFn();
  toast(`"${label}" adicionado!`);
}

function _cfgRemoveDictEntry(dict, saveFn, key, renderFn, badgeSec) {
  if (Object.keys(dict).length <= 1) { toast('Deve existir ao menos um item', 'err'); return; }
  const label = dict[key]?.label || key;
  const isBuiltin = dict[key]?._builtin;
  const _doRemove = () => { delete dict[key]; saveFn(); renderFn(); toast(`"${label}" removido.`); };
  if (isBuiltin) {
    vtpConfirm({
      title: `Remover item padrão "${label}"`,
      message: 'Este é um item padrão do sistema. Remover pode afetar funcionalidades.',
      confirmLabel: 'Remover',
      onConfirm: _doRemove
    });
    return;
  }
  delete dict[key];
  saveFn();
  renderFn();
  toast(`"${label}" removido.`);
}

// ── Localizações do Inventário ────────────────────────────────

function _cfgRenderInvLocais() {
  const el = document.getElementById('cfgInvLocaisList');
  if (!el) return;
  const lista = typeof inventarioLocs !== 'undefined' ? inventarioLocs : [];
  if (!lista.length) { el.innerHTML = `<div style="padding:20px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhuma localização cadastrada.</div>`; return; }
  el.innerHTML = lista.map((loc, idx) =>
    `<div class="cfg-row">
      <div class="cfg-row-icon" style="background:var(--purple-xlight);color:var(--purple)">${lc('map-pin',14,'currentColor')}</div>
      <span class="cfg-row-label">${loc.label}</span>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditarInvLoc(${idx})" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverInvLoc(${idx})`, 'Remover localização')}
      </div>
    </div>`
  ).join('');
  _cfgUpdateNavBadge('inv_locais', lista.length);
}

function _cfgAddInvLoc() {
  const label = document.getElementById('cfgNewInvLoc')?.value.trim();
  if (!label) { toast('Informe o nome da localização', 'err'); return; }
  const id = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!id) { toast('Nome inválido', 'err'); return; }
  if (inventarioLocs.find(l => l.id === id)) { toast('Localização já existe', 'err'); return; }
  inventarioLocs.push({ id, label });
  saveInventarioLocs();
  document.getElementById('cfgNewInvLoc').value = '';
  _cfgRenderInvLocais();
  toast(`Localização "${label}" adicionada!`);
}

function _cfgRemoverInvLoc(idx) {
  if (inventarioLocs.length <= 1) { toast('Deve existir ao menos uma localização', 'err'); return; }
  const label = inventarioLocs[idx]?.label;
  inventarioLocs.splice(idx, 1);
  saveInventarioLocs();
  _cfgRenderInvLocais();
  toast(`Localização "${label}" removida.`);
}

function _cfgEditarInvLoc(idx) {
  const loc = inventarioLocs[idx];
  if (!loc) return;
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Editar localização</div>
    <div class="field"><label class="slbl">Nome *</label><input id="ceLocNome" class="inp" value="${loc.label.replace(/"/g,'&quot;')}"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarInvLoc(${idx},this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('ceLocNome')?.focus(), 60);
}

function _cfgSalvarInvLoc(idx, btn) {
  const nome = document.getElementById('ceLocNome')?.value.trim();
  if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
  inventarioLocs[idx] = { ...inventarioLocs[idx], label: nome };
  saveInventarioLocs();
  btn.closest('.overlay').remove();
  _cfgRenderInvLocais();
  toast('Localização atualizada', 'ok');
}

function _cfgResetInvLocais() {
  vtpConfirm({
    title: 'Restaurar localizações',
    message: 'As localizações personalizadas serão substituídas pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      inventarioLocs = [
        { id:'cozinha_fin',  label:'Cozinha Finalização' },
        { id:'cozinha_prod', label:'Cozinha Produção'    },
        { id:'escritorio',   label:'Escritório'           },
        { id:'atendimento',  label:'Atendimento'          },
        { id:'delivery',     label:'Delivery'             },
        { id:'estoque_coz',  label:'Estoque Cozinha'      },
        { id:'corredor',     label:'Corredor'             },
        { id:'quintal',      label:'Quintal'              },
      ];
      saveInventarioLocs();
      _cfgRenderInvLocais();
      toast('Localizações restauradas.');
    }
  });
}

// ── Tipos de Ativo (Inventário) ───────────────────────────────

function _cfgRenderInvCats() {
  _cfgRenderDictSec('cfgInvCatsList', inventarioCats, '_cfgRemoverInvCat', 'inv_cats',
    k => `_cfgAbrirEditItem('Editar tipo de ativo','inventarioCats','saveInventarioCats','${k}','_cfgRenderInvCats')`);
}
function _cfgAddInvCat() {
  _cfgAddDictEntry(inventarioCats, saveInventarioCats, 'cfgNewInvCatLabel', 'cfgNewInvCatIcon', null, _cfgRenderInvCats, 'inv_cats');
}
function _cfgRemoverInvCat(key) {
  _cfgRemoveDictEntry(inventarioCats, saveInventarioCats, key, _cfgRenderInvCats, 'inv_cats');
}
function _cfgResetInvCats() {
  vtpConfirm({
    title: 'Restaurar tipos de ativo',
    message: 'Os tipos personalizados serão substituídos pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      Object.keys(inventarioCats).forEach(k => delete inventarioCats[k]);
      Object.assign(inventarioCats, {
        equipamento: { label:'Equipamento', icon:'settings',   color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
        estrutura:   { label:'Estrutura',   icon:'building-2', color:'var(--yellow)',      bg:'var(--yellow-light)',  _builtin:true },
        mobiliario:  { label:'Mobiliário',  icon:'layers',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        eletronico:  { label:'Eletrônico',  icon:'monitor',    color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        utensilio:   { label:'Utensílio',   icon:'utensils',   color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
      });
      saveInventarioCats();
      _cfgRenderInvCats();
      toast('Tipos de ativo restaurados.');
    }
  });
}

// ── Categorias de Manutenção ──────────────────────────────────

function _cfgRenderManutCats() {
  _cfgRenderDictSec('cfgManutCatsList', manutCats, '_cfgRemoverManutCat', 'manut_cats',
    k => `_cfgAbrirEditItem('Editar categoria','manutCats','saveManutCats','${k}','_cfgRenderManutCats')`);
}
function _cfgAddManutCat() {
  _cfgAddDictEntry(manutCats, saveManutCats, 'cfgNewManutCatLabel', 'cfgNewManutCatIcon', null, _cfgRenderManutCats, 'manut_cats');
}
function _cfgRemoverManutCat(key) {
  _cfgRemoveDictEntry(manutCats, saveManutCats, key, _cfgRenderManutCats, 'manut_cats');
}
function _cfgResetManutCats() {
  vtpConfirm({
    title: 'Restaurar categorias de manutenção',
    message: 'As categorias personalizadas serão substituídas pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      Object.keys(manutCats).forEach(k => delete manutCats[k]);
      Object.assign(manutCats, {
        limpeza:      { label:'Limpeza',      icon:'sparkles',        color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
        eletrica:     { label:'Elétrica',     icon:'zap',             color:'var(--yellow)',      bg:'var(--yellow-light)',  _builtin:true },
        hidraulica:   { label:'Hidráulica',   icon:'droplets',        color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        refrigeracao: { label:'Refrigeração', icon:'thermometer',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        equipamento:  { label:'Equipamento',  icon:'wrench',          color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
        pragas:       { label:'Pragas',       icon:'shield',          color:'var(--red)',         bg:'var(--red-light)',     _builtin:true },
        documento:    { label:'Doc / Alvará', icon:'file-text',       color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
        estrutura:    { label:'Estrutura',    icon:'hammer',          color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
        outros:       { label:'Outros',       icon:'more-horizontal', color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
      });
      saveManutCats();
      _cfgRenderManutCats();
      toast('Categorias de manutenção restauradas.');
    }
  });
}

// ── Grupos/Setores de Manutenção ──────────────────────────────

function _cfgRenderManutGrupos() {
  _cfgRenderDictSec('cfgManutGruposList', manutGrupos, '_cfgRemoverManutGrupo', 'manut_grupos',
    k => `_cfgAbrirEditItem('Editar grupo/setor','manutGrupos','saveManutGrupos','${k}','_cfgRenderManutGrupos')`);
}
function _cfgAddManutGrupo() {
  _cfgAddDictEntry(manutGrupos, saveManutGrupos, 'cfgNewManutGrupoLabel', 'cfgNewManutGrupoIcon', null, _cfgRenderManutGrupos, 'manut_grupos');
}
function _cfgRemoverManutGrupo(key) {
  _cfgRemoveDictEntry(manutGrupos, saveManutGrupos, key, _cfgRenderManutGrupos, 'manut_grupos');
}
function _cfgResetManutGrupos() {
  vtpConfirm({
    title: 'Restaurar grupos/setores',
    message: 'Os grupos personalizados serão substituídos pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      Object.keys(manutGrupos).forEach(k => delete manutGrupos[k]);
      Object.assign(manutGrupos, {
        producao_quente: { label:'Produção Quente',            icon:'flame',       color:'var(--red)',         bg:'var(--red-light)',     _builtin:true },
        refrigeracao:    { label:'Refrigeração e Conservação', icon:'thermometer', color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        climatizacao:    { label:'Climatização e Exaustão',    icon:'wind',        color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
        preparacao:      { label:'Preparação e Processamento', icon:'settings',    color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
        utensilios:      { label:'Utensílios Operacionais',    icon:'utensils',    color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
        infraestrutura:  { label:'Infraestrutura / Instalações',icon:'building-2', color:'var(--yellow)',      bg:'var(--yellow-light)',  _builtin:true },
        tecnologia:      { label:'Tecnologia e Atendimento',   icon:'monitor',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
        delivery:        { label:'Delivery e Logística',       icon:'truck',       color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
      });
      saveManutGrupos();
      _cfgRenderManutGrupos();
      toast('Grupos/setores restaurados.');
    }
  });
}

// ── Turnos do Checklist ───────────────────────────────────────

function _cfgRenderCkTurnos() {
  const el = document.getElementById('cfgCkTurnosList');
  if (!el) return;
  const lista = typeof checklistTurnos !== 'undefined' ? checklistTurnos : [];
  if (!lista.length) { el.innerHTML = `<div style="padding:20px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum turno cadastrado.</div>`; return; }
  el.innerHTML = lista.map((t, idx) =>
    `<div class="cfg-row">
      <div class="cfg-row-icon" style="background:var(--purple-xlight);color:var(--purple)">${lc('clock',14,'currentColor')}</div>
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px">
        <span class="cfg-row-label">${t.label}</span>
        <span style="font-size:var(--text-2xs);background:var(--border);color:var(--text2);border-radius:4px;padding:1px 6px">${t.id}</span>
      </div>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgRenameCkTurno(${idx})" title="Renomear">${lc('pen',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverCkTurno(${idx})`, 'Remover turno')}
      </div>
    </div>`
  ).join('');
  _cfgUpdateNavBadge('ck_turnos', lista.length);
}

function _cfgAddCkTurno() {
  const label = document.getElementById('cfgNewCkTurnoLabel')?.value.trim();
  if (!label) { toast('Informe o rótulo do turno', 'err'); return; }
  const id = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!id) { toast('Nome inválido', 'err'); return; }
  if (checklistTurnos.find(t => t.id === id)) { toast('Turno já existe', 'err'); return; }
  checklistTurnos.push({ id, label });
  saveChecklistTurnos();
  document.getElementById('cfgNewCkTurnoLabel').value = '';
  _cfgRenderCkTurnos();
  toast(`Turno "${label}" adicionado!`);
}

function _cfgRenameCkTurno(idx) {
  const atual = checklistTurnos[idx]?.label || '';
  const novo = prompt(`Novo rótulo para "${atual}":`, atual);
  if (!novo || !novo.trim()) return;
  checklistTurnos[idx].label = novo.trim();
  saveChecklistTurnos();
  _cfgRenderCkTurnos();
  toast(`Turno renomeado para "${novo.trim()}".`);
}

function _cfgRemoverCkTurno(idx) {
  if (checklistTurnos.length <= 1) { toast('Deve existir ao menos um turno', 'err'); return; }
  const label = checklistTurnos[idx]?.label;
  checklistTurnos.splice(idx, 1);
  saveChecklistTurnos();
  _cfgRenderCkTurnos();
  toast(`Turno "${label}" removido.`);
}

function _cfgResetCkTurnos() {
  vtpConfirm({
    title: 'Restaurar turnos padrão',
    message: 'Os turnos personalizados serão substituídos pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      checklistTurnos = [
        { id:'abertura',   label:'Abertura'   },
        { id:'producao',   label:'Produção'   },
        { id:'operacao',   label:'Operação'   },
        { id:'fechamento', label:'Fechamento' },
        { id:'diario',     label:'Diário'     },
        { id:'turno',      label:'Turno'      },
      ];
      saveChecklistTurnos();
      _cfgRenderCkTurnos();
      toast('Turnos restaurados.');
    }
  });
}

function saveConfiguracoes() {
  const g   = id => document.getElementById(id)?.value ?? null;
  const cfg = { ...getConfig() };

  const empresa    = g('cfgEmpresa');     if (empresa    !== null) cfg.empresa     = empresa.trim();
  const resp       = g('cfgResponsavel'); if (resp       !== null) cfg.responsavel = resp.trim();
  const cnpj       = g('cfgCnpj');        if (cnpj       !== null) cfg.cnpj        = cnpj.trim();
  const cep        = g('cfgCep');         if (cep        !== null) cfg.cep         = cep.trim();
  const endereco   = g('cfgEndereco');    if (endereco   !== null) cfg.endereco    = endereco.trim();
  const whatsapp   = g('cfgWhatsapp');    if (whatsapp   !== null) cfg.whatsapp    = whatsapp.replace(/\D/g,'');
  const codLoja    = g('cfgCodLoja');     if (codLoja    !== null) cfg.codLoja     = codLoja.trim();
  const pctCrit    = g('cfgPctCrit');     if (pctCrit    !== null) cfg.pctCrit          = pctCrit;
  const tolDiv     = g('cfgTolDiv');      if (tolDiv     !== null) cfg.toleranciaDiverg  = parseFloat(tolDiv) || 10;

  db._set('vtp_config', cfg);
  _updateSidebarLogo();
  toast('Configurações salvas!');
}

// ── Tipos de Lista de Compras ─────────────────────────────────

function _cfgRenderTiposLista() {
  const el = document.getElementById('cfgTiposListaList');
  if (!el) return;
  const entries = typeof TIPOS_LISTA !== 'undefined' ? Object.entries(TIPOS_LISTA) : [];
  if (!entries.length) { el.innerHTML = `<div style="padding:20px;text-align:center;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum tipo disponível.</div>`; return; }
  el.innerHTML = entries.map(([k, v]) =>
    `<div class="cfg-row">
      ${_cfgIconDot(v.icon||'package', 'var(--purple)', 'var(--purple-xlight)')}
      <div style="flex:1;min-width:0">
        <div class="cfg-row-label">${v.label}</div>
        <div class="cfg-row-sub">${k}</div>
      </div>
      <div class="cfg-row-actions">
        <button class="btn btn-ghost btn-xs" onclick="_cfgEditarTipoLista('${k}')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
        ${_cfgDelBtn(`_cfgRemoverTipoLista('${k}')`, 'Remover tipo de lista')}
      </div>
    </div>`
  ).join('');
}

function _cfgEditarTipoLista(key) {
  const v = typeof TIPOS_LISTA !== 'undefined' ? TIPOS_LISTA[key] : null;
  if (!v) return;
  const iconOpts = _CFG_EMP_ICONS.map(i => `<option value="${i}" ${v.icon===i?'selected':''}>${i}</option>`).join('');
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `<div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">Editar tipo de lista</div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:16px">Chave: <code style="background:var(--surface2);padding:1px 5px;border-radius:4px">${key}</code></div>
    <div class="field"><label class="slbl">Rótulo *</label><input id="ceTlNome" class="inp" value="${v.label.replace(/"/g,'&quot;')}"></div>
    <div class="field"><label class="slbl">Ícone</label><select id="ceTlIcon" class="inp" style="font-size:var(--text-sm)">${iconOpts}</select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarTipoLista('${key}',this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('ceTlNome')?.focus(), 60);
}

function _cfgSalvarTipoLista(key, btn) {
  const nome = document.getElementById('ceTlNome')?.value.trim();
  const icon = document.getElementById('ceTlIcon')?.value || 'package';
  if (!nome) { toast('Rótulo não pode ser vazio', 'err'); return; }
  TIPOS_LISTA[key].label = nome;
  TIPOS_LISTA[key].icon  = icon;
  if (typeof saveTiposLista === 'function') saveTiposLista();
  btn.closest('.overlay').remove();
  _cfgRenderTiposLista();
  toast('Tipo de lista atualizado', 'ok');
}

function _cfgAddTipoLista() {
  const label = document.getElementById('cfgNewTipoListaLabel')?.value.trim();
  const icon  = document.getElementById('cfgNewTipoListaIcon')?.value || 'list';
  if (!label) { toast('Informe o nome do tipo', 'err'); return; }
  const key = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!key) { toast('Nome inválido', 'err'); return; }
  if (typeof TIPOS_LISTA !== 'undefined' && TIPOS_LISTA[key]) { toast('Tipo já existe', 'err'); return; }
  TIPOS_LISTA[key] = { label, icon };
  if (typeof saveTiposLista === 'function') saveTiposLista();
  document.getElementById('cfgNewTipoListaLabel').value = '';
  _cfgToggleAddRow('tiposLista');
  _cfgRenderTiposLista();
  toast(`Tipo "${label}" adicionado!`);
}

function _cfgRemoverTipoLista(key) {
  const entries = typeof TIPOS_LISTA !== 'undefined' ? Object.keys(TIPOS_LISTA) : [];
  if (entries.length <= 1) { toast('Deve haver ao menos um tipo de lista', 'err'); return; }
  vtpConfirm({
    title: 'Remover tipo de lista',
    message: `Remover "${TIPOS_LISTA[key]?.label}"? Listas existentes deste tipo não serão afetadas.`,
    confirmLabel: 'Remover',
    onConfirm: () => {
      delete TIPOS_LISTA[key];
      if (typeof saveTiposLista === 'function') saveTiposLista();
      _cfgRenderTiposLista();
      toast('Tipo removido.');
    }
  });
}

// ── Aba Cadastros — inline, sem sair de Configurações ──────────
function _renderCfgCadastros() {
  const el = document.getElementById('cfgCadastrosContent');
  if (!el) return;

  const tabs = [
    { id: 'insumos',       label: 'Insumos'       },
    { id: 'fornecedores',  label: 'Fornecedores'   },
    { id: 'inventario',    label: 'Inventário'      },
    { id: 'preparo',       label: 'Pré-preparo'    },
    { id: 'produtos',      label: 'Produtos'       },
  ];

  el.innerHTML = `
    <div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);padding:0 24px;background:var(--surface);overflow-x:auto">
      ${tabs.map(t => `
        <button id="cfg-cad-tab-${t.id}" onclick="_renderCfgCadInline('${t.id}')"
          style="padding:10px 16px;border:none;border-bottom:2.5px solid transparent;
          background:none;color:var(--muted);font-size:var(--text-sm);font-weight:500;
          cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
          ${t.label}
        </button>`).join('')}
    </div>
    <div id="cfgCadSubContent" style="padding:20px 24px"></div>`;

  _renderCfgCadInline('insumos');
}

window._cfgCadActiveTab = null;

function _renderCfgCadInline(subTab) {
  window._cfgCadActiveTab = subTab;

  _cfgCadRestore();

  ['insumos','fornecedores','inventario','preparo','produtos'].forEach(t => {
    const btn = document.getElementById('cfg-cad-tab-' + t);
    if (!btn) return;
    const active = t === subTab;
    btn.style.color             = active ? 'var(--purple)' : 'var(--muted)';
    btn.style.fontWeight        = active ? '700' : '500';
    btn.style.borderBottomColor = active ? 'var(--purple)' : 'transparent';
  });

  const subContent = document.getElementById('cfgCadSubContent');
  if (!subContent) return;

  if (subTab === 'fornecedores') {
    subContent.innerHTML = '';
    _cfgRenderFornList(subContent);
    return;
  }

  if (subTab === 'inventario') {
    subContent.innerHTML = '';
    _cfgRenderInvList(subContent);
    return;
  }

  const cadDiv = document.getElementById('cad-' + subTab);
  if (!cadDiv) return;
  cadDiv.style.display = 'block';
  subContent.innerHTML = '';
  subContent.appendChild(cadDiv);

  if (subTab === 'insumos')       renderCadInsumos();
  else if (subTab === 'preparo')  renderPreparoGrid();
  else if (subTab === 'produtos') { renderCadSabores(); setProdTab('sabores'); }
}

function _cfgRenderInvList(container) {
  const equip = typeof manutEquip !== 'undefined' ? manutEquip : [];
  const CATS  = typeof INVENTARIO_CATS !== 'undefined' ? INVENTARIO_CATS : {};

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:var(--text-sm);color:var(--muted)">${equip.length} item${equip.length!==1?'s':''} no inventário</div>
      <button class="btn btn-primary btn-sm" onclick="invAbrirModalItem(null)">${lc('plus',13,'currentColor')} Novo Item</button>
    </div>
    ${!equip.length ? `<div class="empty"><div class="empty-icon">${lc('package',16,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Inventário vazio</div><div>Cadastre os equipamentos e utensílios da pizzaria</div></div>` :
      `<div style="display:flex;flex-direction:column;gap:3px">
        ${equip.map(e => {
          const cat = CATS[e.invCategoria || e.grupo] || {};
          const statusColors = { bom:'var(--green)', atencao:'var(--yellow)', ruim:'var(--red)' };
          const statusLabels = { bom:'Bom', atencao:'Atenção', ruim:'Ruim' };
          const st = e.invStatus || 'bom';
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer" onclick="invAbrirModalItem('${e.id}')">
            <div style="width:32px;height:32px;border-radius:var(--r8);background:${cat.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${lc(cat.icon||'package',15,cat.color||'var(--muted)')}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:700">${e.nome}</div>
              <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${cat.label||'Geral'}${e.modelo?' · '+e.modelo:''}</div>
            </div>
            <span style="font-size:var(--text-xs);font-weight:700;padding:2px 7px;border-radius:var(--r8);background:${statusColors[st]+'22'};color:${statusColors[st]}">${statusLabels[st]}</span>
            <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();invAbrirModalItem('${e.id}')">${lc('edit-2',12,'currentColor')}</button>
          </div>`;
        }).join('')}
      </div>`
    }`;

  (container || document.getElementById('cfgCadSubContent')).innerHTML = html;
}

function _cfgCadRestore() {
  // Não restaura enquanto estiver dentro de uma seção de cadastros no painel de config
  if (_CFG_CAD_SECTIONS.has(_cfgSection)) return;
  const cadPage = document.getElementById('page-cadastros');
  if (!cadPage) return;
  ['insumos','fornecedores','preparo','produtos','servicos'].forEach(t => {
    const div = document.getElementById('cad-' + t);
    if (div && !cadPage.contains(div)) {
      div.style.display = 'none';
      cadPage.appendChild(div);
    }
  });
}

function abrirCadastroNaConfig(tab) {
  goModule('cadastros');
  if (typeof setCadTab === 'function') setTimeout(() => setCadTab(tab), 50);
}

// ── Aba Usuários ──────────────────────────────────────────────

// Todos os IDs de permissão (folhas da árvore) — mantido para compatibilidade
const _CFG_ALL_PERMS = [
  'Ver Dashboard','Estoque','Estoque: Contagem Diária','Estoque: Contagem Semanal','Estoque: Movimentações',
  'Pré-produção','Desperdício','Compras','Aprovação de compras','Fornecedores','Relatórios',
  'Checklist Meu','Checklist','Manutenção','RH','Performance','Gerenciar usuários','Configurações',
];

// Árvore hierárquica de permissões
const _CFG_PERMS_TREE = [
  { id:'Ver Dashboard',      label:'Dashboard',           icon:'layout-dashboard' },
  { id:'_estoque',           label:'Estoque',             icon:'package',
    sub:[
      { id:'Estoque',                    label:'Visualizar e editar'        },
      { id:'Estoque: Contagem Diária',   label:'Contagem diária'            },
      { id:'Estoque: Contagem Semanal',  label:'Contagem semanal'           },
      { id:'Estoque: Movimentações',     label:'Registrar movimentações'    },
    ]},
  { id:'Pré-produção',       label:'Pré-produção',        icon:'chef-hat'        },
  { id:'Desperdício',        label:'Desperdício',         icon:'trash-2'         },
  { id:'_compras',           label:'Compras',             icon:'shopping-cart',
    sub:[
      { id:'Compras',               label:'Criar e gerenciar listas' },
      { id:'Aprovação de compras',  label:'Aprovar compras'          },
    ]},
  { id:'Fornecedores',       label:'Fornecedores',        icon:'truck'           },
  { id:'Relatórios',         label:'Relatórios',          icon:'bar-chart-2'     },
  { id:'_checklist',         label:'Checklist',           icon:'check-square',
    sub:[
      { id:'Checklist Meu', label:'Ver meu checklist'                    },
      { id:'Checklist',     label:'Equipe, templates e dashboard'         },
    ]},
  { id:'Etiquetagem',        label:'Etiquetagem',         icon:'tag'             },
  { id:'Manutenção',         label:'Manutenção',          icon:'wrench'          },
  { id:'RH',                 label:'RH',                  icon:'users'           },
  { id:'Performance',        label:'Performance',         icon:'trending-up'     },
  { id:'Gerenciar usuários', label:'Gerenciar usuários',  icon:'user-cog'        },
  { id:'Configurações',      label:'Configurações',       icon:'settings'        },
];

// ── Toggle helpers ────────────────────────────────────────────
const _cfgSafe = s => s.replace(/[^a-zA-Z0-9]/g,'_');
let   _cfgMid  = 0; // instância única por modal — evita conflito de IDs

// Toggle individual (com checkbox oculto)
function _cfgMakeTgl(m, sid, on, grp) {
  const gAttr = grp ? ` data-grp="${m}|${grp}"` : '';
  return `<div id="pt-${m}-${sid}" onclick="_cfgTglItem(${m},'${sid}')"${gAttr}
    style="position:relative;width:42px;height:24px;border-radius:12px;flex-shrink:0;
    background:${on?'var(--purple)':'#CBD5E1'};cursor:pointer;transition:background .18s;user-select:none">
    <div id="pd-${m}-${sid}" style="position:absolute;top:3px;left:${on?'21px':'3px'};
      width:18px;height:18px;background:#fff;border-radius:50%;pointer-events:none;
      transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>
    <input type="checkbox" id="pc-${m}-${sid}" ${on?'checked':''} style="display:none">
  </div>`;
}

// Toggle de grupo (sem checkbox — visual derivado dos filhos)
function _cfgMakeGrpTgl(m, g, allOn) {
  return `<div id="pgt-${m}-${g}" onclick="_cfgTglGroup(${m},'${g}')"
    style="position:relative;width:42px;height:24px;border-radius:12px;flex-shrink:0;
    background:${allOn?'var(--purple)':'#CBD5E1'};cursor:pointer;transition:background .18s;user-select:none">
    <div id="pgd-${m}-${g}" style="position:absolute;top:3px;left:${allOn?'21px':'3px'};
      width:18px;height:18px;background:#fff;border-radius:50%;pointer-events:none;
      transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>
  </div>`;
}

// Clique num toggle individual
function _cfgTglItem(m, sid) {
  const cb  = document.getElementById('pc-'+m+'-'+sid);
  const div = document.getElementById('pt-'+m+'-'+sid);
  const dot = document.getElementById('pd-'+m+'-'+sid);
  if (!cb || !div || !dot) return;
  cb.checked = !cb.checked;
  div.style.background = cb.checked ? 'var(--purple)' : '#CBD5E1';
  dot.style.left = cb.checked ? '21px' : '3px';
  const grpAttr = div.dataset.grp; // "m|groupSafe"
  if (grpAttr) {
    const g      = grpAttr.split('|')[1];
    _cfgSyncGroup(m, g);
    // Se ligou um filho, garante que o acordeão está aberto
    const subsEl = document.getElementById('ps-'+m+'-'+g);
    if (subsEl && cb.checked) subsEl.style.display = 'block';
    // Se desligou o último filho, fecha o acordeão
    const node   = _CFG_PERMS_TREE.find(n => _cfgSafe(n.id) === g);
    if (subsEl && node?.sub) {
      const anyOn = node.sub.some(s => document.getElementById('pc-'+m+'-'+_cfgSafe(s.id))?.checked);
      if (!anyOn) subsEl.style.display = 'none';
    }
  }
}

// Clique no toggle de grupo: liga/desliga todos os filhos + acordeão
function _cfgTglGroup(m, g) {
  const node = _CFG_PERMS_TREE.find(n => _cfgSafe(n.id) === g);
  if (!node?.sub) return;
  const allOn = node.sub.every(s => document.getElementById('pc-'+m+'-'+_cfgSafe(s.id))?.checked);
  const newVal = !allOn;
  node.sub.forEach(s => {
    const sid = _cfgSafe(s.id);
    const cb  = document.getElementById('pc-'+m+'-'+sid);
    const div = document.getElementById('pt-'+m+'-'+sid);
    const dot = document.getElementById('pd-'+m+'-'+sid);
    if (cb)  cb.checked  = newVal;
    if (div) div.style.background = newVal ? 'var(--purple)' : '#CBD5E1';
    if (dot) dot.style.left       = newVal ? '21px' : '3px';
  });
  // Atualiza visual do toggle pai
  const pDiv = document.getElementById('pgt-'+m+'-'+g);
  const pDot = document.getElementById('pgd-'+m+'-'+g);
  if (pDiv) pDiv.style.background = newVal ? 'var(--purple)' : '#CBD5E1';
  if (pDot) pDot.style.left       = newVal ? '21px' : '3px';
  // Acordeão
  const subsEl = document.getElementById('ps-'+m+'-'+g);
  if (subsEl) subsEl.style.display = newVal ? 'block' : 'none';
}

// Atualiza o toggle pai com base no estado dos filhos
function _cfgSyncGroup(m, g) {
  const node = _CFG_PERMS_TREE.find(n => _cfgSafe(n.id) === g);
  if (!node?.sub) return;
  const allOn = node.sub.every(s => document.getElementById('pc-'+m+'-'+_cfgSafe(s.id))?.checked);
  const pDiv = document.getElementById('pgt-'+m+'-'+g);
  const pDot = document.getElementById('pgd-'+m+'-'+g);
  if (pDiv) pDiv.style.background = allOn ? 'var(--purple)' : '#CBD5E1';
  if (pDot) pDot.style.left       = allOn ? '21px' : '3px';
}

// ── Renderiza árvore de permissões (modo edição) ──────────────
function _cfgRenderPermTree(currentPerms, m) {
  return _CFG_PERMS_TREE.map(node => {
    if (node.sub) {
      const g      = _cfgSafe(node.id);
      const anyOn  = node.sub.some(s => currentPerms.includes(s.id));
      const allOn  = node.sub.every(s => currentPerms.includes(s.id));
      return `
      <div style="background:var(--surface2);border-radius:var(--r8);overflow:hidden;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
          ${anyOn ? 'border-bottom:1px solid var(--border)' : ''}">
          <div style="width:28px;height:28px;border-radius:7px;background:var(--purple-xlight);
            display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc(node.icon||'circle',14,'var(--purple)')}
          </div>
          <span style="flex:1;font-size:var(--text-sm);font-weight:700">${node.label}</span>
          ${_cfgMakeGrpTgl(m, g, allOn)}
        </div>
        <div id="ps-${m}-${g}" style="display:${anyOn ? 'block' : 'none'}">
          ${node.sub.map(sub => {
            const sid = _cfgSafe(sub.id);
            const on  = currentPerms.includes(sub.id);
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 14px 9px 52px;
              border-bottom:1px solid var(--border)">
              <span style="flex:1;font-size:var(--text-sm);color:var(--text)">${sub.label}</span>
              ${_cfgMakeTgl(m, sid, on, g)}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }
    const sid = _cfgSafe(node.id);
    const on  = currentPerms.includes(node.id);
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);
      border-radius:var(--r8);margin-bottom:4px">
      <div style="width:28px;height:28px;border-radius:7px;background:var(--purple-xlight);
        display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lc(node.icon||'circle',14,'var(--purple)')}
      </div>
      <span style="flex:1;font-size:var(--text-sm);font-weight:700">${node.label}</span>
      ${_cfgMakeTgl(m, sid, on, null)}
    </div>`;
  }).join('');
}

function _renderCfgUsuarios() {
  const el = document.getElementById('cfgUserList');
  if (!el) return;

  const profilesHtml = Object.entries(PERMS).map(([role, p]) => {
    const isLocked = !p.mutavel;
    const cnt      = p.perms.length;
    const inUse    = users.some(u => u.role === role);
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:${p.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc(p.icon||'user',17,p.color||'var(--muted)')}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:var(--text-md);font-weight:700">${p.label}</span>
            ${isLocked ? `<span style="font-size:var(--text-2xs);background:var(--purple-xlight);color:var(--purple);padding:1px 6px;border-radius:4px;font-weight:700">Padrão</span>` : ''}
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${cnt} permissão${cnt!==1?'ões':''}</div>
        </div>
        <div style="display:flex;gap:2px">
          ${!isLocked ? `<button title="Renomear" onclick="_cfgRenomearPerfil('${role}')"
            style="background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;color:var(--muted)"
            onmouseover="this.style.color='var(--purple)'" onmouseout="this.style.color='var(--muted)'">${lc('pen',12,'currentColor')}</button>` : ''}
          <button title="Editar permissões" onclick="_cfgEditarPerfil('${role}')"
            style="background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;color:var(--muted)"
            onmouseover="this.style.color='var(--purple)'" onmouseout="this.style.color='var(--muted)'">${lc('sliders',12,'currentColor')}</button>
          ${!isLocked && !inUse ? `<button title="Excluir perfil" onclick="_cfgExcluirPerfil('${role}')"
            style="background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;color:var(--muted)"
            onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">${lc('trash-2',12,'currentColor')}</button>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${p.perms.slice(0,5).map(perm => `<span style="font-size:var(--text-2xs);padding:2px 6px;border-radius:4px;background:${p.bg||'var(--surface2)'};color:${p.color||'var(--muted)'};font-weight:600;white-space:nowrap">${perm}</span>`).join('')}
        ${cnt > 5 ? `<span style="font-size:var(--text-2xs);padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--muted)">+${cnt-5}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  const STATUS_EMP = {
    ativo:    { label:'Ativo',    color:'var(--green)',       bg:'var(--green-light)'   },
    ferias:   { label:'Férias',   color:'var(--purple)',      bg:'var(--purple-xlight)' },
    afastado: { label:'Afastado', color:'var(--orange-dark)', bg:'var(--orange-light)'  },
    inativo:  { label:'Inativo',  color:'var(--muted)',       bg:'var(--surface2)'      },
  };

  const _userCard = u => {
    const p     = PERMS[u.role] || {};
    const cargo = typeof FUNC_CARGOS !== 'undefined' ? (FUNC_CARGOS[u.cargo] || null) : null;
    const st    = STATUS_EMP[u.empStatus] || STATUS_EMP.ativo;
    const hasCustomPerms = Array.isArray(u.perms);
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8)">
      <div style="width:36px;height:36px;border-radius:50%;background:${p.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;font-size:var(--text-md);font-weight:700;color:${p.color||'var(--muted)'};flex-shrink:0">
        ${u.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:var(--text-sm);font-weight:700">${u.name}</span>
          <span style="padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:${p.bg||'var(--surface2)'};color:${p.color||'var(--muted)'}">${p.label||u.role}</span>
          <span style="padding:1px 7px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;background:${st.bg};color:${st.color}">${st.label}</span>
          ${hasCustomPerms ? `<span style="font-size:var(--text-2xs);background:var(--yellow-light);color:var(--yellow);padding:1px 5px;border-radius:4px;font-weight:700">Perms. individuais</span>` : ''}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap">
          <span>${u.email}</span>
          ${cargo ? `<span>${cargo.label}</span>` : ''}
          ${u.telefone ? `<span>${u.telefone}</span>` : ''}
        </div>
      </div>
      <button class="btn btn-outline btn-xs" onclick="_cfgAbrirModalUsuario(${u.id})">${lc('edit-2',12,'currentColor')}</button>
    </div>`;
  };

  const ativos   = users.filter(u => u.empStatus !== 'inativo');
  const inativos = users.filter(u => u.empStatus === 'inativo');

  const ativosHtml = !ativos.length
    ? `<div class="empty" style="padding:32px">${lc('users',22,'var(--border)')}<p style="margin:10px 0 4px;font-size:var(--text-sm);font-weight:700;color:var(--text)">Nenhum usuário ativo</p></div>`
    : ativos.map(_userCard).join('');

  const inativosSection = !inativos.length ? '' : `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
      <button onclick="_cfgToggleInativos()" style="display:flex;align-items:center;gap:7px;width:100%;padding:8px 12px;background:none;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;font-size:var(--text-sm);color:var(--text2);font-family:inherit;font-weight:600" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='none'">
        <span id="cfgInativosChevron" style="display:inline-flex;transition:transform .2s;transform:${_cfgMostrarInativos?'rotate(180deg)':'rotate(0deg)'}">${lc('chevron-down',14,'currentColor')}</span>
        ${inativos.length} funcionário${inativos.length!==1?'s':''} inativo${inativos.length!==1?'s':''}
        <span style="margin-left:auto;font-size:var(--text-xs);color:var(--muted);font-weight:400">${_cfgMostrarInativos?'ocultar':'mostrar'}</span>
      </button>
      <div id="cfgInativosLista" style="display:${_cfgMostrarInativos?'flex':'none'};flex-direction:column;gap:6px;margin-top:8px;opacity:.65">
        ${inativos.map(_userCard).join('')}
      </div>
    </div>`;

  const usersHtml = `<div style="display:flex;flex-direction:column;gap:8px">${ativosHtml}</div>${inativosSection}`;

  el.innerHTML = `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">Perfis de Acesso</div>
        <button class="btn btn-ghost btn-xs" onclick="_cfgNovoPerfil()" style="display:flex;align-items:center;gap:4px">${lc('plus',11,'currentColor')} Novo perfil</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${profilesHtml}
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">Usuários e Funcionários</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${ativos.length} ativo${ativos.length!==1?'s':''}${inativos.length ? ` · ${inativos.length} inativo${inativos.length!==1?'s':''}` : ''}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_cfgAbrirModalUsuario(null)" style="display:flex;align-items:center;gap:5px">${lc('user-plus',13,'#fff')} Novo Usuário</button>
    </div>
    ${usersHtml}`;
}

// ── Perfis — editar permissões ────────────────────────────────
function _cfgEditarPerfil(role) {
  const p = PERMS[role]; if (!p) return;
  const m = ++_cfgMid;
  const treeHtml = _cfgRenderPermTree(p.perms, m);
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:440px;padding:0" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1.5px solid var(--border);background:var(--surface2)">
        <div style="width:36px;height:36px;border-radius:50%;background:${p.bg||'var(--surface2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${lc(p.icon||'user',18,p.color||'var(--muted)')}
        </div>
        <div style="flex:1">
          <div style="font-size:var(--text-md);font-weight:700">${p.label}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">Permissões de acesso ao sistema</div>
        </div>
        <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:12px 14px;max-height:460px;overflow-y:auto">
        ${treeHtml}
      </div>
      <div style="display:flex;gap:8px;padding:14px 18px;border-top:1.5px solid var(--border)">
        <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="_cfgSalvarPerfil('${role}',this,${m})">Salvar</button>
      </div>
    </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

function _cfgSalvarPerfil(role, btn, m) {
  const novas = [];
  _CFG_PERMS_TREE.forEach(node => {
    if (node.sub) {
      node.sub.forEach(sub => {
        if (document.getElementById('pc-'+m+'-'+_cfgSafe(sub.id))?.checked) novas.push(sub.id);
      });
    } else {
      if (document.getElementById('pc-'+m+'-'+_cfgSafe(node.id))?.checked) novas.push(node.id);
    }
  });
  if (!novas.length) { toast('Selecione ao menos uma permissão', 'err'); return; }
  PERMS[role].perms = novas;
  savePerms();
  btn.closest('.overlay').remove();
  _renderCfgUsuarios();
  toast(`Permissões de "${PERMS[role].label}" atualizadas`, 'ok');
}

// ── Perfis — renomear / excluir / criar ───────────────────────
function _cfgRenomearPerfil(role) {
  const p = PERMS[role];
  if (!p || !p.mutavel) return;
  const novo = prompt(`Novo nome para "${p.label}":`, p.label);
  if (!novo || !novo.trim()) return;
  PERMS[role].label = novo.trim();
  savePerms();
  _renderCfgUsuarios();
  toast(`Perfil renomeado para "${novo.trim()}"`, 'ok');
}

function _cfgExcluirPerfil(role) {
  const p = PERMS[role];
  if (!p || !p.mutavel) return;
  if (users.some(u => u.role === role)) {
    toast('Não é possível excluir: existem usuários com este perfil', 'err'); return;
  }
  vtpConfirm({
    title: `Excluir perfil "${p.label}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      delete PERMS[role];
      savePerms();
      _renderCfgUsuarios();
      toast(`Perfil "${p.label}" excluído`);
    }
  });
}

function _cfgNovoPerfil() {
  const m = ++_cfgMid;
  const treeHtml = _cfgRenderPermTree([], m);
  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:440px;padding:0" onclick="event.stopPropagation()">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:700">Novo Perfil de Acesso</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Defina o nome e as permissões do perfil</div>
      </div>
      <div style="max-height:500px;overflow-y:auto;padding:14px 16px">
        <div class="field" style="margin-bottom:14px">
          <label class="slbl">Nome do perfil *</label>
          <input class="inp" id="npNome-${m}" placeholder="ex: Supervisor de Vendas">
        </div>
        <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Permissões</div>
        ${treeHtml}
      </div>
      <div style="display:flex;gap:8px;padding:14px 18px;border-top:1.5px solid var(--border)">
        <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="_cfgCriarPerfil(${m},this)">Criar perfil</button>
      </div>
    </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('npNome-'+m)?.focus(), 60);
}

function _cfgCriarPerfil(m, btn) {
  const nome = document.getElementById('npNome-'+m)?.value.trim();
  if (!nome) { toast('Informe o nome do perfil', 'err'); return; }
  const key = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  if (!key)       { toast('Nome inválido', 'err'); return; }
  if (PERMS[key]) { toast('Já existe um perfil com esse nome', 'err'); return; }

  const perms = [];
  _CFG_PERMS_TREE.forEach(node => {
    if (node.sub) {
      node.sub.forEach(sub => {
        if (document.getElementById('pc-'+m+'-'+_cfgSafe(sub.id))?.checked) perms.push(sub.id);
      });
    } else {
      if (document.getElementById('pc-'+m+'-'+_cfgSafe(node.id))?.checked) perms.push(node.id);
    }
  });

  PERMS[key] = { label: nome, icon: 'user', color: 'var(--muted)', bg: 'var(--surface2)', mutavel: true, perms };
  savePerms();
  btn.closest('.overlay').remove();
  _renderCfgUsuarios();
  toast(`Perfil "${nome}" criado!`, 'ok');
}

// ── Modal unificado de Usuário / Funcionário ──────────────────
function _cfgAbrirModalUsuario(id) {
  const u     = id != null ? users.find(x => x.id === id) : null;
  const m     = ++_cfgMid;
  const isNew = !u;

  const profileOpts = Object.entries(PERMS)
    .map(([k, v]) => `<option value="${k}" ${(u?.role||'comprador')===k?'selected':''}>${v.label}</option>`)
    .join('');

  const cargoOpts = `<option value="">Sem cargo</option>` +
    Object.entries(typeof FUNC_CARGOS !== 'undefined' ? FUNC_CARGOS : {})
      .map(([k, v]) => `<option value="${k}" ${(u?.cargo||'')===k?'selected':''}>${v.label}</option>`)
      .join('');

  const turnoOpts = `<option value="">Sem turno</option>` +
    (typeof checklistTurnos !== 'undefined' ? checklistTurnos : [])
      .map(t => `<option value="${t.id}" ${(u?.turno||'')===t.id?'selected':''}>${t.label}</option>`)
      .join('');

  const statusOpts = [
    ['ativo','Ativo'], ['ferias','Férias'], ['afastado','Afastado'], ['inativo','Inativo'],
  ].map(([k, v]) => `<option value="${k}" ${(u?.empStatus||'ativo')===k?'selected':''}>${v}</option>`).join('');

  const currentPerms = typeof getUserPerms === 'function'
    ? getUserPerms(u || { role:'comprador', perms: null })
    : (PERMS[u?.role||'comprador']?.perms || []);

  const treeHtml = _cfgRenderPermTree(currentPerms, m);

  const pRole = PERMS[u?.role || 'comprador'] || {};
  const avatarBg    = pRole.bg    || 'var(--surface2)';
  const avatarColor = pRole.color || 'var(--muted)';

  const ov = document.createElement('div'); ov.className = 'overlay open';
  ov.innerHTML = `
    <div class="modal" style="width:520px;padding:0" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1.5px solid var(--border);background:var(--surface2)">
        <div style="width:36px;height:36px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:var(--text-md);font-weight:700;color:${avatarColor};flex-shrink:0">
          ${u ? u.name.charAt(0).toUpperCase() : lc('user-plus',18,'var(--muted)')}
        </div>
        <div style="flex:1">
          <div style="font-size:var(--text-md);font-weight:700">${u ? u.name : 'Novo Usuário'}</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">${isNew ? 'Preencha os dados do novo usuário' : u.email}</div>
        </div>
        <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>

      <div style="max-height:560px;overflow-y:auto;padding:16px 18px">

        <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Dados Pessoais</div>

        <div class="f2">
          <div class="field" style="margin-bottom:10px"><label class="slbl">Nome completo *</label><input class="inp" id="uNome-${m}" value="${(u?.name||'').replace(/"/g,'&quot;')}" placeholder="ex: Ana Silva"></div>
          <div class="field" style="margin-bottom:10px"><label class="slbl">E-mail *</label><input class="inp" type="email" id="uEmail-${m}" value="${u?.email||''}" placeholder="ana@vaiterpizza.com"></div>
        </div>
        <div class="f2">
          <div class="field" style="margin-bottom:10px"><label class="slbl">CPF</label><input class="inp" id="uCpf-${m}" value="${u?.cpf||''}" placeholder="000.000.000-00"></div>
          <div class="field" style="margin-bottom:10px"><label class="slbl">Telefone</label><input class="inp" id="uTelefone-${m}" value="${u?.telefone||''}" placeholder="(00) 00000-0000"></div>
        </div>
        <div class="f2">
          <div class="field" style="margin-bottom:10px"><label class="slbl">Cargo</label><select class="inp" id="uCargo-${m}">${cargoOpts}</select></div>
          <div class="field" style="margin-bottom:10px"><label class="slbl">Turno</label><select class="inp" id="uTurno-${m}">${turnoOpts}</select></div>
        </div>
        <div class="f2">
          <div class="field" style="margin-bottom:10px"><label class="slbl">Salário (R$)</label><input class="inp" type="number" id="uSalario-${m}" value="${u?.salario||''}" placeholder="0,00" step="0.01" min="0"></div>
          <div class="field" style="margin-bottom:10px"><label class="slbl">Admissão</label><input class="inp" type="date" id="uAdmissao-${m}" value="${u?.admissao||''}"></div>
        </div>
        <div class="f2">
          <div class="field" style="margin-bottom:10px"><label class="slbl">Status</label><select class="inp" id="uEmpStatus-${m}">${statusOpts}</select></div>
          <div></div>
        </div>
        <div class="field" style="margin-bottom:0"><label class="slbl">Observações</label>
          <textarea class="inp" id="uObs-${m}" rows="2" style="resize:vertical" placeholder="Notas internas...">${u?.obs||''}</textarea>
        </div>

        <div style="height:1px;background:var(--border);margin:14px 0"></div>
        <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Acesso ao Sistema</div>

        <div class="f2">
          <div class="field" style="margin-bottom:0"><label class="slbl">${isNew?'Senha *':'Nova senha'}</label>
            <input class="inp" type="password" id="uPass-${m}" placeholder="${isNew?'mínimo 6 caracteres':'deixe em branco para não alterar'}"></div>
          <div class="field" style="margin-bottom:0"><label class="slbl">Confirmar senha</label>
            <input class="inp" type="password" id="uPass2-${m}" placeholder="repita a senha"></div>
        </div>

        <div style="height:1px;background:var(--border);margin:14px 0"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">Permissões</div>
          <div style="display:flex;align-items:center;gap:6px">
            <select class="inp" id="uPerfil-${m}" style="font-size:var(--text-sm);padding:5px 8px;width:auto">
              ${profileOpts}
            </select>
            <button class="btn btn-ghost btn-xs" onclick="_cfgAplicarPerfilUsuario(${m})" title="Carregar permissões do perfil selecionado" style="display:flex;align-items:center;gap:4px">
              ${lc('refresh-cw',11,'currentColor')} Usar perfil
            </button>
          </div>
        </div>

        <div id="uPermTree-${m}">
          ${treeHtml}
        </div>

      </div>

      <div style="display:flex;gap:8px;padding:14px 18px;border-top:1.5px solid var(--border);align-items:center">
        ${!isNew && id !== 1 ? `<button style="background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:var(--r8);color:var(--red);font-size:var(--text-sm);display:flex;align-items:center;gap:5px;margin-right:auto"
          onmouseover="this.style.background='var(--red-light)'" onmouseout="this.style.background='none'"
          onclick="_cfgExcluirUsuario(${id},this)">${lc('trash-2',12,'currentColor')} Excluir</button>` : `<div style="flex:1"></div>`}
        <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_cfgSalvarUsuario(${JSON.stringify(id)},${m},this)">Salvar</button>
      </div>
    </div>`;
  ov.onclick = e => { if (e.target===ov) ov.remove(); };
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('uNome-'+m)?.focus(), 60);
}

function _cfgAplicarPerfilUsuario(m) {
  const role = document.getElementById('uPerfil-'+m)?.value;
  if (!role || !PERMS[role]) return;
  const container = document.getElementById('uPermTree-'+m);
  if (!container) return;
  container.innerHTML = _cfgRenderPermTree(PERMS[role].perms || [], m);
  toast(`Permissões de "${PERMS[role].label}" carregadas`, 'ok');
}

function _cfgSalvarUsuario(id, m, btn) {
  const nome  = document.getElementById('uNome-'+m)?.value.trim();
  const email = document.getElementById('uEmail-'+m)?.value.trim().toLowerCase();
  const pass  = document.getElementById('uPass-'+m)?.value;
  const pass2 = document.getElementById('uPass2-'+m)?.value;

  if (!nome || !email) { toast('Preencha nome e e-mail', 'err'); return; }
  if (users.find(u => u.email === email && u.id !== id)) { toast('E-mail já está em uso', 'err'); return; }
  if (id === null && (!pass || pass.length < 6)) { toast('Defina uma senha de pelo menos 6 caracteres', 'err'); return; }
  if (pass && pass !== pass2) { toast('As senhas não coincidem', 'err'); return; }
  if (pass && pass.length < 6) { toast('Senha deve ter pelo menos 6 caracteres', 'err'); return; }

  const role = document.getElementById('uPerfil-'+m)?.value || 'comprador';

  const perms = [];
  _CFG_PERMS_TREE.forEach(node => {
    if (node.sub) {
      node.sub.forEach(sub => {
        if (document.getElementById('pc-'+m+'-'+_cfgSafe(sub.id))?.checked) perms.push(sub.id);
      });
    } else {
      if (document.getElementById('pc-'+m+'-'+_cfgSafe(node.id))?.checked) perms.push(node.id);
    }
  });

  const profilePerms  = PERMS[role]?.perms || [];
  const permsEqualProfile = perms.length === profilePerms.length &&
    perms.every(p => profilePerms.includes(p));
  // Só armazena override se diferente do perfil
  const finalPerms = permsEqualProfile ? null : perms;

  const empFields = {
    cpf:       document.getElementById('uCpf-'+m)?.value.trim()        || '',
    telefone:  document.getElementById('uTelefone-'+m)?.value.trim()   || '',
    cargo:     document.getElementById('uCargo-'+m)?.value             || '',
    turno:     document.getElementById('uTurno-'+m)?.value             || '',
    salario:   parseFloat(document.getElementById('uSalario-'+m)?.value) || null,
    admissao:  document.getElementById('uAdmissao-'+m)?.value          || '',
    empStatus: document.getElementById('uEmpStatus-'+m)?.value         || 'ativo',
    obs:       document.getElementById('uObs-'+m)?.value.trim()        || '',
  };

  const isActive = empFields.empStatus !== 'inativo';
  if (id != null) {
    const idx = users.findIndex(u => u.id === id);
    if (idx >= 0) users[idx] = { ...users[idx], name: nome, email, role, perms: finalPerms, ...empFields, active: isActive };
    if (pass) saveUserPassword(id, pass);
    toast(`"${nome}" atualizado!`, 'ok');
  } else {
    const newId = nextUid++;
    users.push({ id: newId, name: nome, email, role, active: true, perms: finalPerms, ...empFields });
    saveUserPassword(newId, pass);
    // Envia email de boas-vindas
    fetch('https://yuridisrupy.app.n8n.cloud/webhook/vtp-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'welcome', to: email, name: nome, email, tempPassword: pass })
    }).catch(() => {});
    toast(`"${nome}" criado!`, 'ok');
  }

  saveU();
  btn.closest('.overlay').remove();
  _renderCfgUsuarios();
}

function _cfgExcluirUsuario(id, btn) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  vtpConfirm({
    title: `Excluir "${u.name}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      users = users.filter(x => x.id !== id);
      saveU();
      btn.closest('.overlay').remove();
      _renderCfgUsuarios();
      toast(`"${u.name}" excluído`);
    }
  });
}

function _cfgToggleInativos() {
  _cfgMostrarInativos = !_cfgMostrarInativos;
  const lista   = document.getElementById('cfgInativosLista');
  const chevron = document.getElementById('cfgInativosChevron');
  const btn     = chevron?.closest('button');
  if (lista)   lista.style.display = _cfgMostrarInativos ? 'flex' : 'none';
  if (chevron) chevron.style.transform = _cfgMostrarInativos ? 'rotate(180deg)' : 'rotate(0deg)';
  if (btn) {
    const label = btn.querySelector('span:last-child');
    if (label) label.textContent = _cfgMostrarInativos ? 'ocultar' : 'mostrar';
  }
}

// ── Lista unificada de Fornecedores (Insumos + Serviços) ──────
function _cfgRenderFornList(container) {
  const el = container || document.getElementById('cfgCadSubContent');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <input class="inp" id="cfgFornSearch" placeholder="Buscar por nome, insumo ou serviço..."
        style="flex:1;min-width:160px" oninput="_refreshCfgFornList()">
      <select class="inp" id="cfgFornTipo" style="width:150px;padding:7px 10px" onchange="_refreshCfgFornList()">
        <option value="">Todos</option>
        <option value="insumos">Insumos</option>
        <option value="servicos">Serviços</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="openTipoFornPicker()">${lc('plus',13,'currentColor')} Novo Fornecedor</button>
    </div>
    <div id="cfgFornListBody" style="display:flex;flex-direction:column;gap:3px"></div>`;
  _refreshCfgFornList();
}

function _refreshCfgFornList() {
  const q    = (document.getElementById('cfgFornSearch')?.value || '').toLowerCase();
  const tipo = document.getElementById('cfgFornTipo')?.value || '';
  const el   = document.getElementById('cfgFornListBody');
  if (!el) return;

  const ord = { prioritario: 0, backup: 1, bloqueado: 2 };

  const listInsumos = (tipo === 'servicos' ? [] : suppliers).map(s => {
    const cnt = items.filter(i => {
      const ids = i.supIds?.length ? i.supIds : (i.supId ? [i.supId] : []);
      return ids.includes(s.id);
    }).length;
    return {
      tipo: 'insumos', id: s.id, nome: s.name,
      confianca: s.confianca || 'backup',
      media: typeof _supNotaMedia === 'function' ? _supNotaMedia(s) : null,
      notasCount: (s.notas||[]).length,
      extra: cnt ? `${cnt} insumo${cnt!==1?'s':''}` : '',
      sub: s.seller || s.phone || '',
      onclick: `openEditSup(${s.id})`,
    };
  });

  const listServicos = (tipo === 'insumos' ? [] : prestadores).map(p => {
    const cat = typeof PREST_CATS !== 'undefined' ? (PREST_CATS[p.categoria] || {}) : {};
    return {
      tipo: 'servicos', id: p.id, nome: p.nome,
      confianca: p.statusConfianca || 'backup',
      media: typeof _prestNotaMedia === 'function' ? _prestNotaMedia(p) : null,
      notasCount: (p.notas||[]).length,
      extra: cat.label || p.categoria || '',
      sub: p.contato || p.phone || '',
      onclick: `openEditPrestador('${p.id}')`,
    };
  });

  const all = [...listInsumos, ...listServicos]
    .filter(x => !q || x.nome.toLowerCase().includes(q) || x.extra.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q))
    .sort((a, b) => (ord[a.confianca]??1) - (ord[b.confianca]??1) || a.nome.localeCompare(b.nome));

  if (!all.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${lc('building-2',16,'var(--muted)')}</div><div style="font-weight:700;margin-bottom:4px">Nenhum fornecedor encontrado</div></div>`;
    return;
  }

  const CONF = typeof PREST_CONFIANCA !== 'undefined' ? PREST_CONFIANCA : {};
  el.innerHTML = all.map(x => {
    const conf      = CONF[x.confianca] || { label:'Backup', bg:'var(--yellow-light)', color:'var(--orange-dark)' };
    const tipoBg    = x.tipo === 'insumos' ? 'var(--green-light)'  : 'var(--orange-light)';
    const tipoColor = x.tipo === 'insumos' ? 'var(--green)'        : 'var(--orange-dark)';
    const tipoIcon  = x.tipo === 'insumos' ? 'package'             : 'wrench';
    const tipoLabel = x.tipo === 'insumos' ? 'Insumos'             : 'Serviços';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer" onclick="${x.onclick}">
      <div style="width:32px;height:32px;border-radius:var(--r8);background:${tipoBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lc(tipoIcon,15,tipoColor)}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:var(--text-sm);font-weight:700">${x.nome}</span>
          <span style="padding:1px 6px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;background:${tipoBg};color:${tipoColor}">${tipoLabel}</span>
          <span style="padding:1px 6px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;background:${conf.bg};color:${conf.color}">${conf.label}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px;display:flex;gap:10px;flex-wrap:wrap">
          ${x.sub  ? `<span>${x.sub}</span>` : ''}
          ${x.extra ? `<span>${x.extra}</span>` : ''}
          ${x.media ? `<span style="color:var(--yellow)">★ ${x.media} (${x.notasCount})</span>` : ''}
        </div>
      </div>
      <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();${x.onclick}">${lc('edit-2',12,'currentColor')}</button>
    </div>`;
  }).join('');
}

// ── Aba Funcionários ──────────────────────────────────────────
function _renderCfgFuncionarios() {
  const panel = document.getElementById('cfgPanelFuncionarios');
  if (!panel) return;

  const STATUS_FUNC = {
    ativo:    { label:'Ativo',    color:'var(--green)',       bg:'var(--green-light)'   },
    ferias:   { label:'Férias',   color:'var(--purple)',      bg:'var(--purple-xlight)' },
    afastado: { label:'Afastado', color:'var(--orange-dark)', bg:'var(--orange-light)'  },
    inativo:  { label:'Inativo',  color:'var(--muted)',       bg:'var(--surface2)'      },
  };

  const q        = document.getElementById('cfgSrchFuncs')?.value?.toLowerCase() || '';
  const cargoFil = document.getElementById('cfgFilFuncsCargo')?.value || '';
  const stFil    = document.getElementById('cfgFilFuncsStatus')?.value || '';

  const filt = funcionarios.filter(f => {
    if (q        && !f.nome.toLowerCase().includes(q) && !(f.cargo||'').toLowerCase().includes(q)) return false;
    if (cargoFil && f.cargo  !== cargoFil) return false;
    if (stFil    && f.status !== stFil)    return false;
    return true;
  }).sort((a,b) => a.nome.localeCompare(b.nome));

  const gridHtml = filt.length === 0
    ? `<div style="text-align:center;padding:48px 24px;color:var(--muted)">
        ${lc('user-check',32,'var(--border)')}
        <p style="margin:12px 0 4px;font-size:var(--text-md);font-weight:700;color:var(--text)">Nenhum funcionário cadastrado</p>
        <p style="font-size:var(--text-sm)">Clique em "+ Novo Funcionário" para começar</p>
       </div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
        ${filt.map(f => {
          const cargo = FUNC_CARGOS[f.cargo] || { label:f.cargo||'—', icon:'user', color:'var(--muted)', bg:'var(--surface2)' };
          const st    = STATUS_FUNC[f.status] || STATUS_FUNC.ativo;
          const dias  = f.admissao ? Math.floor((Date.now() - new Date(f.admissao)) / 86400000) : null;
          return `
          <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer"
            onclick="openEditFuncionario('${f.id}')">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:38px;height:38px;border-radius:50%;background:${cargo.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  ${lc(cargo.icon,18,cargo.color)}
                </div>
                <div>
                  <div style="font-size:var(--text-md);font-weight:700">${f.nome}</div>
                  <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${cargo.label}</div>
                </div>
              </div>
              <span style="padding:2px 8px;border-radius:10px;font-size:var(--text-2xs);font-weight:700;background:${st.bg};color:${st.color};white-space:nowrap">${st.label}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
              ${f.phone  ? `<div style="font-size:var(--text-xs);color:var(--text2)">${lc('phone',11,'var(--muted)')} ${f.phone}</div>` : ''}
              ${f.turno  ? `<div style="font-size:var(--text-xs);color:var(--text2)">${lc('clock',11,'var(--muted)')} Turno: ${f.turno}</div>` : ''}
              ${f.salario? `<div style="font-size:var(--text-xs);color:var(--text2)">${lc('dollar-sign',11,'var(--muted)')} R$ ${fmt(f.salario)}/mês</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border)">
              ${dias !== null ? `<div style="font-size:var(--text-xs);color:var(--muted)">${lc('calendar',9,'currentColor')} ${dias} dias na empresa</div>` : '<div></div>'}
              <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditFuncionario('${f.id}')">${lc('edit-2',12,'currentColor')}</button>
            </div>
          </div>`;
        }).join('')}
       </div>`;

  panel.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
  <div>
    <div style="font-size:var(--text-base);font-weight:800;margin-bottom:3px">Funcionários</div>
    <div style="font-size:var(--text-xs);color:var(--muted)">Equipe interna da pizzaria · ${funcionarios.length} cadastrado${funcionarios.length!==1?'s':''}</div>
  </div>
  <button class="btn btn-primary btn-sm" onclick="openFuncionarioModal()">${lc('plus',13,'currentColor')} Novo Funcionário</button>
</div>
<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
  <input class="inp" id="cfgSrchFuncs" placeholder="Buscar..." style="max-width:200px;padding:7px 12px"
    value="${q}" oninput="_renderCfgFuncionarios()">
  <select class="inp" id="cfgFilFuncsCargo" style="max-width:180px;padding:7px 12px" onchange="_renderCfgFuncionarios()">
    <option value="">Todos os cargos</option>
    ${Object.entries(FUNC_CARGOS).map(([k,v]) => `<option value="${k}" ${cargoFil===k?'selected':''}>${v.label}</option>`).join('')}
  </select>
  <select class="inp" id="cfgFilFuncsStatus" style="max-width:150px;padding:7px 12px" onchange="_renderCfgFuncionarios()">
    <option value="">Todos os status</option>
    ${Object.entries(STATUS_FUNC).map(([k,v]) => `<option value="${k}" ${stFil===k?'selected':''}>${v.label}</option>`).join('')}
  </select>
</div>
${gridHtml}`;
}

// ── Helpers ───────────────────────────────────────────────────
function getConfig() {
  return db._get('vtp_config', {});
}

function getEmpresaWhatsapp() {
  return getConfig().whatsapp || '';
}

function getContagemPerms() {
  const defaults = {
    diaria:  ['gerente','supervisor','comprador','funcionario'],
    semanal: ['gerente','supervisor','comprador'],
  };
  return db._get('vtp_contagem_perms', defaults);
}

function saveContagemPerms() {
  const roles = ['gerente','supervisor','comprador','funcionario'];
  const perms = {
    diaria:  roles.filter(r => document.getElementById('cperm_diaria_'  + r)?.checked),
    semanal: roles.filter(r => document.getElementById('cperm_semanal_' + r)?.checked),
  };
  if (!perms.diaria.length && !perms.semanal.length) {
    toast('Pelo menos um perfil deve ter acesso a cada tipo de contagem', 'err'); return;
  }
  db._set('vtp_contagem_perms', perms);
  toast('Permissões de contagem salvas!', 'ok');
}

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES → ETIQUETAGEM
// ══════════════════════════════════════════════════════════════

let _cfgEtqTab = 'metodos'; // 'metodos' | 'validades' | 'pontos'

function _renderCfgSecEtiquetagem(el) {
  if (typeof _etqInit === 'function') _etqInit();

  el.innerHTML = `
    <div class="settings-section-title">${lc('tag', 16, 'var(--purple)')} Etiquetagem</div>
    <div class="settings-section-sub">Métodos de conservação · Validades por produto · Pontos de impressão</div>

    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      <button onclick="_cfgEtqTab='metodos';_renderCfgSecEtiquetagem(document.getElementById('cfgSectionContent'))"
        class="btn btn-sm ${_cfgEtqTab==='metodos'?'btn-primary':'btn-ghost'}">
        ${lc('thermometer',12,'currentColor')} Métodos de Conservação
      </button>
      <button onclick="_cfgEtqTab='validades';_renderCfgSecEtiquetagem(document.getElementById('cfgSectionContent'))"
        class="btn btn-sm ${_cfgEtqTab==='validades'?'btn-primary':'btn-ghost'}">
        ${lc('clock',12,'currentColor')} Validades por Produto
      </button>
      <button onclick="_cfgEtqTab='pontos';_renderCfgSecEtiquetagem(document.getElementById('cfgSectionContent'))"
        class="btn btn-sm ${_cfgEtqTab==='pontos'?'btn-primary':'btn-ghost'}">
        ${lc('cpu',12,'currentColor')} Pontos de Impressão
      </button>
    </div>

    <div id="cfgEtqContent"></div>
  `;

  const cadEl = document.getElementById('cfgEtqContent');
  if (!cadEl) return;

  if (_cfgEtqTab === 'metodos')   _cfgEtqMetodos(cadEl);
  else if (_cfgEtqTab === 'validades') _cfgEtqValidades(cadEl);
  else if (_cfgEtqTab === 'pontos')    _cfgEtqPontos(cadEl);
}

// ── Métodos de Conservação ────────────────────────────────────

function _cfgEtqMetodos(el) {
  if (typeof _etqMetodos === 'undefined' || !_etqMetodos) return;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:.84rem;font-weight:700;color:var(--text)">Métodos de conservação</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:2px">Cada método pode ter um sub-status (ex: Resfriado · Amostra)</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="_etqOpenMetodoModal(null)">
        ${lc('plus', 13, '#fff')} Novo método
      </button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;max-width:900px">
      ${_etqMetodos.map(m => {
        const label  = m.status ? `${m.nome} · ${m.status}` : m.nome;
        const vCount = _etqValidades ? _etqValidades.filter(v => v.metodo_id === m.id).length : 0;
        return `
          <div style="padding:14px;border-radius:var(--r10);border:1.5px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:${m.cor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${lc(m.icone || 'thermometer', 20, m.cor)}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>
              <div style="font-size:.67rem;color:var(--muted);margin-top:2px">${vCount} produto${vCount !== 1 ? 's' : ''} configurado${vCount !== 1 ? 's' : ''}</div>
            </div>
            <button onclick="_cfgEtqOpenMetodo('${m.id}')"
              style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:4px;flex-shrink:0">
              ${lc('edit-2', 14, 'currentColor')}
            </button>
          </div>
        `;
      }).join('')}
    </div>
    ${_etqMetodos.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum método cadastrado</div>` : ''}
  `;
}

function _cfgEtqOpenMetodo(id) {
  if (typeof _etqOpenMetodoModal === 'function') {
    _etqOpenMetodoModal(id || null);
    // Após fechar o modal, re-renderiza a seção
    const origSave = window._etqSaveMetodo;
    // Override temporário para re-renderizar após salvar
    window._etqSaveMetodoAndRefresh = () => {
      if (typeof origSave === 'function') origSave();
      setTimeout(() => _cfgEtqMetodos(document.getElementById('cfgEtqContent')), 80);
    };
  }
}

// ── Validades por Produto ─────────────────────────────────────

function _cfgEtqValidades(el) {
  if (typeof _etqMetodos === 'undefined' || !_etqMetodos) return;

  const allItems  = typeof items !== 'undefined' ? items : [];
  const busca     = _cfgEtqBusca || '';
  const filtrados = allItems.filter(i => i.name.toLowerCase().includes(busca.toLowerCase()));

  el.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:.84rem;font-weight:700;color:var(--text);margin-bottom:4px">Validades por produto</div>
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:10px">
        Configure quantos dias cada produto dura em cada método de conservação.
        Esses valores são usados automaticamente no wizard de impressão.
      </div>
      <input class="inp" placeholder="Buscar produto..." value="${busca}"
        oninput="_cfgEtqBusca=this.value;_cfgEtqValidades(document.getElementById('cfgEtqContent'))"
        style="max-width:380px">
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;max-width:900px">
      ${filtrados.map(item => {
        const validsItem = _etqValidades ? _etqValidades.filter(v => v.item_id == item.id) : [];
        const isProd = item.isProd ? 'Produção Interna' : 'Insumo';
        return `
          <div style="border:1.5px solid var(--border);border-radius:var(--r10);background:var(--surface);overflow:hidden">
            <div style="padding:11px 14px;background:var(--surface2);border-bottom:1.5px solid var(--border);display:flex;align-items:center;gap:10px">
              <div style="flex:1;min-width:0">
                <div style="font-size:.82rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
                <div style="font-size:.67rem;color:var(--muted)">${item.cat || '—'} · ${isProd}</div>
              </div>
              <button class="btn btn-outline btn-xs" onclick="_cfgEtqOpenVal('${item.id}', null)">
                ${lc('plus', 11, 'currentColor')} Adicionar
              </button>
            </div>
            ${validsItem.length > 0 ? `
              <div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 14px">
                ${validsItem.map(v => {
                  const met = _etqMetodos.find(m => m.id === v.metodo_id);
                  if (!met) return '';
                  const label = met.status ? `${met.nome} · ${met.status}` : met.nome;
                  return `
                    <button onclick="_cfgEtqOpenVal('${item.id}','${v.metodo_id}')"
                      title="Clique para editar"
                      style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;
                        border:1.5px solid ${met.cor}44;background:${met.cor}11;
                        cursor:pointer;font-family:Inter,sans-serif;font-size:.72rem;font-weight:600;color:var(--text)">
                      ${lc(met.icone || 'thermometer', 10, met.cor)}
                      ${label}
                      <strong style="color:${met.cor}">${v.validade_dias}d</strong>
                    </button>
                  `;
                }).join('')}
              </div>
            ` : `
              <div style="padding:9px 14px;font-size:.72rem;color:var(--muted)">
                Nenhuma conservação configurada — clique em Adicionar
              </div>
            `}
          </div>
        `;
      }).join('')}
      ${filtrados.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum produto encontrado</div>` : ''}
    </div>
  `;
}

let _cfgEtqBusca = '';

function _cfgEtqOpenVal(itemId, metodoId) {
  if (typeof _etqOpenValidadeModal === 'function') {
    _etqOpenValidadeModal(itemId, metodoId);
  }
}

// ── Pontos de Impressão (Fase 3) ──────────────────────────────

function _cfgEtqPontos(el) {
  el.innerHTML = `
    <div style="max-width:680px">
      <div style="font-size:.84rem;font-weight:700;color:var(--text);margin-bottom:4px">Pontos de Impressão</div>
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:16px">
        Cada ponto é um Raspberry Pi conectado a uma impressora Zebra ZD220 via USB na cozinha.
      </div>

      <div style="background:var(--warning-bg,#FEF3C7);border:1.5px solid var(--warning-border,#FDE68A);border-radius:var(--r10);padding:16px;display:flex;gap:12px;align-items:flex-start;margin-bottom:20px">
        ${lc('alert-triangle', 16, 'var(--warning-fg,#D97706)')}
        <div>
          <div style="font-size:.8rem;font-weight:700;color:var(--warning-fg,#D97706);margin-bottom:4px">Fase 3 — Em desenvolvimento</div>
          <div style="font-size:.74rem;color:var(--warning-fg,#D97706);line-height:1.6">
            A integração com Raspberry Pi + Zebra ZD220 via protocolo ZPL está planejada para a Fase 3.
            Quando ativada, cada etiqueta gerada no wizard será impressa automaticamente no ponto configurado.
            <br><br>
            <strong>Hardware necessário:</strong> Raspberry Pi 4B (2GB+) · Zebra ZD220 · Cabo USB-B · Rede local
          </div>
        </div>
      </div>

      <div style="border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden;margin-bottom:14px">
        <div style="padding:12px 16px;background:var(--surface2);border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:.8rem;font-weight:700">Pontos cadastrados</div>
          <button class="btn btn-outline btn-xs" disabled style="opacity:.5;cursor:not-allowed">
            ${lc('plus',11,'currentColor')} Adicionar ponto
          </button>
        </div>
        <div style="padding:14px 16px;opacity:.5">
          <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1.5px dashed var(--border);border-radius:var(--r8)">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center">
              ${lc('cpu', 18, 'var(--muted)')}
            </div>
            <div>
              <div style="font-size:.8rem;font-weight:700">COZINHA</div>
              <div style="font-size:.68rem;color:var(--muted)">Raspberry Pi 4B · Zebra ZD220 · Aguardando Fase 3</div>
            </div>
            <span style="margin-left:auto;font-size:.65rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:var(--muted)">OFFLINE</span>
          </div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">Especificações técnicas do agente</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.76rem">
          <div><span style="color:var(--muted)">Hardware</span><br><strong>Raspberry Pi 4B (2GB+)</strong></div>
          <div><span style="color:var(--muted)">Impressora</span><br><strong>Zebra ZD220</strong></div>
          <div><span style="color:var(--muted)">Protocolo</span><br><strong>ZPL via USB (lp0)</strong></div>
          <div><span style="color:var(--muted)">Comunicação</span><br><strong>Supabase Realtime</strong></div>
          <div><span style="color:var(--muted)">Etiqueta</span><br><strong>60×60mm térmica direta</strong></div>
          <div><span style="color:var(--muted)">Runtime</span><br><strong>Node.js + systemd</strong></div>
        </div>
      </div>
    </div>
  `;
}

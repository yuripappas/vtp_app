// ══════════════════════════════════════════════════════════════
// empresa.js — Módulo de Configurações da Empresa
// ══════════════════════════════════════════════════════════════

const _EMP_ICONS = [
  'user','users','chef-hat','bike','headphones','dollar-sign','shield',
  'sparkles','utensils','key','crown','shopping-cart','truck','star',
  'wrench','package','tag','coffee','clipboard','briefcase',
];

const _EMP_CORES = [
  { label:'Roxo',     color:'var(--purple)',      bg:'var(--purple-xlight)' },
  { label:'Verde',    color:'var(--green)',        bg:'var(--green-light)'   },
  { label:'Amarelo',  color:'var(--yellow)',       bg:'var(--yellow-light)'  },
  { label:'Vermelho', color:'var(--red)',          bg:'var(--red-light)'     },
  { label:'Laranja',  color:'var(--orange-dark)',  bg:'var(--orange-light)'  },
  { label:'Cinza',    color:'var(--muted)',        bg:'var(--surface2)'      },
  { label:'Azul',     color:'#0EA5E9',             bg:'#E0F2FE'              },
  { label:'Índigo',   color:'#7C3AED',             bg:'#EDE9FE'              },
];

const _EMP_DESP_CORES = [
  { label:'Vermelho', color:'var(--red)',         bg:'var(--red-light)'     },
  { label:'Laranja',  color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  { label:'Amarelo',  color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  { label:'Roxo',     color:'#7C3AED',            bg:'#EDE9FE'              },
  { label:'Verde',    color:'var(--green)',        bg:'var(--green-light)'   },
  { label:'Azul',     color:'#0EA5E9',            bg:'#E0F2FE'              },
  { label:'Cinza',    color:'var(--muted)',        bg:'var(--surface2)'      },
];

function renderEmpresa() {
  const el = document.getElementById('page-empresa');
  el.innerHTML = `
    <div style="padding:24px 24px 40px">
      <!-- ── Cargos Internos ─────────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">Cargos Internos</div>
            <div class="card-sub">Cargos usados no cadastro de funcionários e na escala de RH</div>
          </div>
          <button class="btn btn-primary" style="font-size:var(--text-sm)" onclick="_empNovoCargoOpen()">
            ${lc('plus',14,'#fff')} Novo cargo
          </button>
        </div>
        <div id="empCargosList" style="padding:0 20px 16px"></div>
      </div>

      <!-- ── Funções de Terceirizados ────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">Funções de Terceirizados</div>
            <div class="card-sub">Funções usadas no cadastro de terceirizados</div>
          </div>
          <button class="btn btn-primary" style="font-size:var(--text-sm)" onclick="_empNovaFuncaoOpen()">
            ${lc('plus',14,'#fff')} Nova função
          </button>
        </div>
        <div id="empFuncoesList" style="padding:0 20px 16px"></div>
      </div>

      <!-- ── Tipos de Desperdício ────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">Tipos de Desperdício</div>
            <div class="card-sub">Categorias disponíveis no registro de desperdício</div>
          </div>
          <button class="btn btn-primary" style="font-size:var(--text-sm)" onclick="_empNovoTipoDesp()">
            ${lc('plus',14,'#fff')} Novo tipo
          </button>
        </div>
        <div id="empTiposDespList" style="padding:0 20px 16px"></div>
      </div>

      <!-- ── Categorias de Insumo ────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">Categorias de Insumo</div>
            <div class="card-sub">Categorias disponíveis no cadastro de insumos do estoque</div>
          </div>
          <button class="btn btn-primary" style="font-size:var(--text-sm)" onclick="_empNovaCatInsumo()">
            ${lc('plus',14,'#fff')} Nova categoria
          </button>
        </div>
        <div id="empCatInsumoList" style="padding:0 20px 16px"></div>
      </div>

      <!-- ── Tipos de Ausência ───────────────────────────────── -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <div class="card-title">Tipos de Ausência</div>
            <div class="card-sub">Tipos de ausência disponíveis no módulo de RH</div>
          </div>
          <button class="btn btn-primary" style="font-size:var(--text-sm)" onclick="_empNovaAusencia()">
            ${lc('plus',14,'#fff')} Novo tipo
          </button>
        </div>
        <div id="empAusenciasList" style="padding:0 20px 16px"></div>
      </div>
    </div>

    <!-- ── Modal: Cargo Interno ─────────────────────────────── -->
    <div class="overlay" id="modalEmpCargo">
      <div class="modal" style="width:380px">
        <div class="modal-header">
          <span id="empCargoModalTitle" class="modal-title">Novo Cargo</span>
          <button class="btn-ghost" style="padding:4px" onclick="closeModal('modalEmpCargo')">${lc('x',18,'var(--text2)')}</button>
        </div>
        <div class="modal-body" style="padding:20px 20px 8px">
          <input type="hidden" id="empCargoKey">
          <div class="field"><label>Nome do cargo *</label>
            <input class="inp" id="empCargoLabel" placeholder="ex: Auxiliar de Limpeza" maxlength="40">
          </div>
          <div class="field"><label>Ícone</label>
            <select class="inp" id="empCargoIcon">
              ${_EMP_ICONS.map(i => `<option value="${i}">${i}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Cor</label>
            <select class="inp" id="empCargoCor">
              ${_EMP_CORES.map((c,i) => `<option value="${i}">${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px 16px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="closeModal('modalEmpCargo')">Cancelar</button>
          <button class="btn btn-primary" onclick="_empSalvarCargo()">Salvar</button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Função Terceirizado ───────────────────────── -->
    <div class="overlay" id="modalEmpFuncao">
      <div class="modal" style="width:380px">
        <div class="modal-header">
          <span id="empFuncaoModalTitle" class="modal-title">Nova Função</span>
          <button class="btn-ghost" style="padding:4px" onclick="closeModal('modalEmpFuncao')">${lc('x',18,'var(--text2)')}</button>
        </div>
        <div class="modal-body" style="padding:20px 20px 8px">
          <input type="hidden" id="empFuncaoKey">
          <div class="field"><label>Nome da função *</label>
            <input class="inp" id="empFuncaoLabel" placeholder="ex: Barista" maxlength="40">
          </div>
          <div class="field"><label>Ícone</label>
            <select class="inp" id="empFuncaoIcon">
              ${_EMP_ICONS.map(i => `<option value="${i}">${i}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Cor</label>
            <select class="inp" id="empFuncaoCor">
              ${_EMP_CORES.map((c,i) => `<option value="${i}">${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px 16px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="closeModal('modalEmpFuncao')">Cancelar</button>
          <button class="btn btn-primary" onclick="_empSalvarFuncao()">Salvar</button>
        </div>
      </div>
    </div>
  `;

  _empRenderCargos();
  _empRenderFuncoes();
  _empRenderTiposDesp();
  _empRenderCatInsumo();
  _empRenderAusencias();
}

// ─── Cargos ──────────────────────────────────────────────────

function _empRenderCargos() {
  const keys = Object.keys(FUNC_CARGOS);
  document.getElementById('empCargosList').innerHTML = keys.length === 0
    ? '<p style="color:var(--text2);font-size:var(--text-sm);text-align:center;padding:16px 0">Nenhum cargo cadastrado</p>'
    : `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${
        keys.map(k => {
          const c = FUNC_CARGOS[k];
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:var(--r8)">
            <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--r8);background:${c.bg};color:${c.color};flex-shrink:0">
              ${lc(c.icon,16,c.color)}
            </span>
            <span style="flex:1;font-size:var(--text-md);font-weight:600;color:var(--text)">${c.label}</span>
            <span style="font-size:var(--text-xs);color:var(--text2);margin-right:4px">${k}</span>
            <button class="btn-ghost" style="padding:4px;color:var(--text2)" onclick="_empEditCargo('${k}')" title="Editar">${lc('pencil',14,'var(--text2)')}</button>
            <button class="btn-ghost" style="padding:4px;color:var(--red)" onclick="_empRemoveCargo('${k}')" title="Remover">${lc('trash-2',14,'var(--red)')}</button>
          </div>`;
        }).join('')
      }</div>`;
}

function _empNovoCargoOpen() {
  document.getElementById('empCargoKey').value = '';
  document.getElementById('empCargoLabel').value = '';
  document.getElementById('empCargoIcon').value = 'user';
  document.getElementById('empCargoCor').value = '0';
  document.getElementById('empCargoModalTitle').textContent = 'Novo Cargo';
  document.getElementById('modalEmpCargo').classList.add('open');
}

function _empEditCargo(key) {
  const c = FUNC_CARGOS[key];
  document.getElementById('empCargoKey').value = key;
  document.getElementById('empCargoLabel').value = c.label;
  document.getElementById('empCargoIcon').value = c.icon || 'user';
  const ci = _EMP_CORES.findIndex(x => x.color === c.color);
  document.getElementById('empCargoCor').value = ci >= 0 ? ci : 0;
  document.getElementById('empCargoModalTitle').textContent = 'Editar Cargo';
  document.getElementById('modalEmpCargo').classList.add('open');
}

function _empSalvarCargo() {
  const label = document.getElementById('empCargoLabel').value.trim();
  if (!label) { toast('Informe o nome do cargo','err'); return; }
  const icon  = document.getElementById('empCargoIcon').value;
  const corIdx = parseInt(document.getElementById('empCargoCor').value);
  const cor = _EMP_CORES[corIdx];
  const existingKey = document.getElementById('empCargoKey').value;
  const key = existingKey || label.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_');
  FUNC_CARGOS[key] = { label, icon, color: cor.color, bg: cor.bg };
  saveFuncCargos();
  closeModal('modalEmpCargo');
  _empRenderCargos();
  toast('Cargo salvo','ok');
}

function _empRemoveCargo(key) {
  const cargoLabel = FUNC_CARGOS[key]?.label;
  vtpConfirm({
    title: `Remover cargo "${cargoLabel}"`,
    message: 'Funcionários com este cargo não serão apagados.',
    confirmLabel: 'Remover',
    onConfirm: () => {
      delete FUNC_CARGOS[key];
      saveFuncCargos();
      _empRenderCargos();
      toast('Cargo removido','ok');
    }
  });
}

// ─── Funções Terceirizados ────────────────────────────────────

function _empRenderFuncoes() {
  const keys = Object.keys(TERCEIR_FUNCOES);
  document.getElementById('empFuncoesList').innerHTML = keys.length === 0
    ? '<p style="color:var(--text2);font-size:var(--text-sm);text-align:center;padding:16px 0">Nenhuma função cadastrada</p>'
    : `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${
        keys.map(k => {
          const f = TERCEIR_FUNCOES[k];
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:var(--r8)">
            <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--r8);background:${f.bg};color:${f.color};flex-shrink:0">
              ${lc(f.icon,16,f.color)}
            </span>
            <span style="flex:1;font-size:var(--text-md);font-weight:600;color:var(--text)">${f.label}</span>
            <span style="font-size:var(--text-xs);color:var(--text2);margin-right:4px">${k}</span>
            <button class="btn-ghost" style="padding:4px;color:var(--text2)" onclick="_empEditFuncao('${k}')" title="Editar">${lc('pencil',14,'var(--text2)')}</button>
            <button class="btn-ghost" style="padding:4px;color:var(--red)" onclick="_empRemoveFuncao('${k}')" title="Remover">${lc('trash-2',14,'var(--red)')}</button>
          </div>`;
        }).join('')
      }</div>`;
}

function _empNovaFuncaoOpen() {
  document.getElementById('empFuncaoKey').value = '';
  document.getElementById('empFuncaoLabel').value = '';
  document.getElementById('empFuncaoIcon').value = 'user';
  document.getElementById('empFuncaoCor').value = '0';
  document.getElementById('empFuncaoModalTitle').textContent = 'Nova Função';
  document.getElementById('modalEmpFuncao').classList.add('open');
}

function _empEditFuncao(key) {
  const f = TERCEIR_FUNCOES[key];
  document.getElementById('empFuncaoKey').value = key;
  document.getElementById('empFuncaoLabel').value = f.label;
  document.getElementById('empFuncaoIcon').value = f.icon || 'user';
  const ci = _EMP_CORES.findIndex(x => x.color === f.color);
  document.getElementById('empFuncaoCor').value = ci >= 0 ? ci : 0;
  document.getElementById('empFuncaoModalTitle').textContent = 'Editar Função';
  document.getElementById('modalEmpFuncao').classList.add('open');
}

function _empSalvarFuncao() {
  const label = document.getElementById('empFuncaoLabel').value.trim();
  if (!label) { toast('Informe o nome da função','err'); return; }
  const icon   = document.getElementById('empFuncaoIcon').value;
  const corIdx = parseInt(document.getElementById('empFuncaoCor').value);
  const cor    = _EMP_CORES[corIdx];
  const existingKey = document.getElementById('empFuncaoKey').value;
  const key = existingKey || label.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_');
  TERCEIR_FUNCOES[key] = { label, icon, color: cor.color, bg: cor.bg };
  saveTerceirFuncoes();
  closeModal('modalEmpFuncao');
  _empRenderFuncoes();
  toast('Função salva','ok');
}

function _empRemoveFuncao(key) {
  const funcLabel = TERCEIR_FUNCOES[key]?.label;
  vtpConfirm({
    title: `Remover função "${funcLabel}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    onConfirm: () => {
      delete TERCEIR_FUNCOES[key];
      saveTerceirFuncoes();
      _empRenderFuncoes();
      toast('Função removida','ok');
    }
  });
}

// ─── Tipos de Desperdício ─────────────────────────────────────

function _empRenderTiposDesp() {
  document.getElementById('empTiposDespList').innerHTML = TIPOS_DESPERDICIO.length === 0
    ? '<p style="color:var(--text2);font-size:var(--text-sm);text-align:center;padding:16px 0">Nenhum tipo cadastrado</p>'
    : `<div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">${
        TIPOS_DESPERDICIO.map((t,i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface2);border-radius:var(--r8)">
            <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:var(--r8);background:${t.bg};flex-shrink:0">
              ${lc(t.icon||'package',16,t.color)}
            </span>
            <span style="flex:1;font-size:var(--text-md);font-weight:600;color:var(--text)">${t.label}</span>
            <span style="font-size:var(--text-xs);color:var(--text2);margin-right:4px">${t.id}</span>
            <button class="btn-ghost" style="padding:4px;color:var(--red)" onclick="_empRemoveTipoDesp(${i})" title="Remover">${lc('trash-2',14,'var(--red)')}</button>
          </div>`).join('')
      }</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <input class="inp" id="empTipoDespLabel" placeholder="Nome do tipo" style="flex:1;min-width:160px;font-size:var(--text-sm)">
      <select class="inp" id="empTipoDespCor" style="width:110px;font-size:var(--text-sm)">
        ${_EMP_DESP_CORES.map((c,i) => `<option value="${i}">${c.label}</option>`).join('')}
      </select>
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_empAddTipoDesp()">
        ${lc('plus',14,'#fff')} Adicionar
      </button>
    </div>`;
}

function _empNovoTipoDesp() {
  document.getElementById('empTipoDespLabel')?.focus();
}

function _empAddTipoDesp() {
  const label = document.getElementById('empTipoDespLabel').value.trim();
  if (!label) { toast('Informe o nome do tipo','err'); return; }
  const corIdx = parseInt(document.getElementById('empTipoDespCor').value);
  const cor = _EMP_DESP_CORES[corIdx];
  const id = label.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_');
  if (TIPOS_DESPERDICIO.find(t => t.id === id)) { toast('Tipo com este nome já existe','err'); return; }
  TIPOS_DESPERDICIO.push({ id, label, color: cor.color, bg: cor.bg, icon: 'package' });
  saveTiposDesperdicio();
  _empRenderTiposDesp();
  toast('Tipo adicionado','ok');
}

function _empRemoveTipoDesp(idx) {
  const t = TIPOS_DESPERDICIO[idx];
  vtpConfirm({
    title: `Remover tipo "${t.label}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    onConfirm: () => {
      TIPOS_DESPERDICIO.splice(idx, 1);
      saveTiposDesperdicio();
      _empRenderTiposDesp();
      toast('Tipo removido','ok');
    }
  });
}

// ─── Categorias de Insumo ─────────────────────────────────────

function _empRenderCatInsumo() {
  document.getElementById('empCatInsumoList').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${
      CATEGORIAS_INSUMO.map((c,i) => `
        <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface2);border-radius:var(--r8);font-size:var(--text-sm);color:var(--text)">
          ${c}
          <button class="btn-ghost" style="padding:2px;color:var(--text2);line-height:1" onclick="_empRemoveCatInsumo(${i})" title="Remover">${lc('x',12,'var(--text2)')}</button>
        </span>`).join('')
    }</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input class="inp" id="empCatInsumoNew" placeholder="Nova categoria" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_empAddCatInsumo()">
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_empAddCatInsumo()">
        ${lc('plus',14,'#fff')} Adicionar
      </button>
    </div>`;
}

function _empNovaCatInsumo() {
  document.getElementById('empCatInsumoNew')?.focus();
}

function _empAddCatInsumo() {
  const val = document.getElementById('empCatInsumoNew').value.trim();
  if (!val) { toast('Informe o nome da categoria','err'); return; }
  if (CATEGORIAS_INSUMO.map(c=>c.toLowerCase()).includes(val.toLowerCase())) { toast('Categoria já existe','err'); return; }
  CATEGORIAS_INSUMO.push(val);
  saveCategoriasInsumo();
  _empRenderCatInsumo();
  toast('Categoria adicionada','ok');
}

function _empRemoveCatInsumo(idx) {
  const catLabel = CATEGORIAS_INSUMO[idx];
  vtpConfirm({
    title: `Remover categoria "${catLabel}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    onConfirm: () => {
      CATEGORIAS_INSUMO.splice(idx, 1);
      saveCategoriasInsumo();
      _empRenderCatInsumo();
      toast('Categoria removida','ok');
    }
  });
}

// ─── Tipos de Ausência ────────────────────────────────────────

function _empRenderAusencias() {
  document.getElementById('empAusenciasList').innerHTML = TIPOS_AUSENCIA.length === 0
    ? '<p style="color:var(--text2);font-size:var(--text-sm);text-align:center;padding:16px 0">Nenhum tipo cadastrado</p>'
    : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${
        TIPOS_AUSENCIA.map((a,i) => `
          <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface2);border-radius:var(--r8);font-size:var(--text-sm);color:var(--text)">
            ${a.label}
            <button class="btn-ghost" style="padding:2px;color:var(--text2);line-height:1" onclick="_empRemoveAusencia(${i})" title="Remover">${lc('x',12,'var(--text2)')}</button>
          </span>`).join('')
      }</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input class="inp" id="empAusenciaNew" placeholder="Nome do tipo de ausência" style="flex:1;font-size:var(--text-sm)" onkeydown="if(event.key==='Enter')_empAddAusencia()">
      <button class="btn btn-primary" style="font-size:var(--text-sm);white-space:nowrap" onclick="_empAddAusencia()">
        ${lc('plus',14,'#fff')} Adicionar
      </button>
    </div>`;
}

function _empNovaAusencia() {
  document.getElementById('empAusenciaNew')?.focus();
}

function _empAddAusencia() {
  const label = document.getElementById('empAusenciaNew').value.trim();
  if (!label) { toast('Informe o nome do tipo','err'); return; }
  if (TIPOS_AUSENCIA.find(a => a.label.toLowerCase() === label.toLowerCase())) { toast('Tipo já existe','err'); return; }
  const id = label.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_');
  TIPOS_AUSENCIA.push({ id, label });
  saveTiposAusencia();
  _empRenderAusencias();
  toast('Tipo adicionado','ok');
}

function _empRemoveAusencia(idx) {
  const ausLabel = TIPOS_AUSENCIA[idx]?.label;
  vtpConfirm({
    title: `Remover tipo "${ausLabel}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    onConfirm: () => {
      TIPOS_AUSENCIA.splice(idx, 1);
      saveTiposAusencia();
      _empRenderAusencias();
      toast('Tipo removido','ok');
    }
  });
}

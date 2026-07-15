/**
 * VTP360 — Etiquetagem
 * Módulo completo de etiquetagem para cozinha profissional
 * Inspirado na Suflex · Integrado com items, users e funcionarios do app
 *
 * Fase 1: Wizard de impressão (simulada) + Validades + Produção + Cadastros
 * Fase 2: Integração com Pré-produção e Dashboard
 * Fase 3 (pendente): Raspberry Pi + Zebra ZD220 + Supabase Realtime
 */

// ═══════════════════════════════════════════════════════════════
// ESTADO E CONSTANTES
// ═══════════════════════════════════════════════════════════════

const ETQ_METODOS_DEFAULT = [
  { id: 'resf',       nome: 'Resfriado',      status: null,          icone: 'wind',        cor: '#0EA5E9' },
  { id: 'resf_amos',  nome: 'Resfriado',      status: 'Amostra',     icone: 'wind',        cor: '#0EA5E9' },
  { id: 'resf_desc',  nome: 'Resfriado',      status: 'Descongelando', icone: 'wind',      cor: '#0EA5E9' },
  { id: 'resf_pist',  nome: 'Resfriado',      status: 'Pista fria',  icone: 'wind',        cor: '#0EA5E9' },
  { id: 'cong',       nome: 'Congelado',      status: null,          icone: 'thermometer', cor: '#6366F1' },
  { id: 'cong_amos',  nome: 'Congelado',      status: 'Amostra',     icone: 'thermometer', cor: '#6366F1' },
  { id: 'tamb',       nome: 'Temp. Ambiente', status: null,          icone: 'sun',         cor: '#F59E0B' },
];

// Mapa de ícones por categoria — usa exatamente os mesmos nomes que aparecem
// em item.cat (vindos do Cardápio Web ou cadastrados manualmente).
// Qualquer categoria não listada recebe o ícone genérico 'package'.
const ETQ_CAT_ICONS = {
  // Preparados / Produção interna
  'Produção Interna':   'chef-hat',
  'Preparados':         'chef-hat',

  // Laticínios e derivados
  'Laticínios':         'droplets',
  'Queijos':            'droplets',

  // Proteínas
  'Carnes e Frios':     'flame',
  'Carnes':             'flame',
  'Frios':              'flame',

  // Massas / farinhas
  'Massas':             'layers',
  'Massas e Farinhas':  'layers',
  'Farinhas':           'layers',

  // Molhos / temperos
  'Molhos':             'droplets',
  'Molhos e Temperos':  'droplets',
  'Molhos e Pastas':    'droplets',
  'Temperos':           'tag',

  // Embalagens
  'Embalagens':         'box',
  'Descartáveis':       'box',

  // Bebidas
  'Bebidas':            'coffee',

  // Hortifruti / vegetais
  'Hortifruti':         'leaf',
  'Vegetais':           'leaf',
  'Frutas':             'leaf',

  // Higiene / limpeza
  'Limpeza':            'sparkles',
  'Higiene/Limpeza':    'sparkles',
  'Higiene':            'sparkles',

  // Secos / grãos
  'Secos':              'archive',
  'Grãos':              'archive',

  // Sobremesas / doces
  'Sobremesas':         'star',
  'Doces':              'star',

  // Outros
  'Outros':             'package',
};

// Retorna o ícone para qualquer categoria, com fallback genérico
function _etqIconCat(cat) {
  if (!cat) return 'package';
  if (ETQ_CAT_ICONS[cat]) return ETQ_CAT_ICONS[cat];
  const lower = cat.toLowerCase();
  for (const [key, icon] of Object.entries(ETQ_CAT_ICONS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return icon;
  }
  return 'package';
}

// Normaliza o nome da categoria para exibição.
// Garante consistência mesmo que itens antigos ainda tenham 'Produção Interna'.
function _etqCatDisplay(item) {
  if (!item) return 'Outros';
  const cat = item.cat || '';
  if (item.isProd || cat.toLowerCase().includes('produção') || cat.toLowerCase().includes('interno')) return 'Preparados';
  return cat || 'Outros';
}

// Estado do módulo
let _etqTab    = 'imprimir';
window._vtpGetTab_etiquetagem = () => _etqTab;
window._vtpSetTab_etiquetagem = (v) => { _etqTab = v; };
let _etqCadTab = 'metodos';
let _etqWizardStep = 1;
let _etqWizardState = {};

// Dados
let _etqMetodos   = null;
let _etqValidades = null;
let _etiquetas    = null;
let _etqPontos    = null;

// Produção — filtro ativo
let _etqProdFiltro = 'hoje';

// Validades — drill
let _etqValidDrill = null;

// Detalhe overlay — id do lote atual
let _etqDetalheId  = null;

// ── Persistência ──────────────────────────────────────────────

function _etqInit() {
  _etqMetodos   = db._get('vtp_etiq_metodos', null);
  if (!_etqMetodos || _etqMetodos.length === 0) {
    _etqMetodos = ETQ_METODOS_DEFAULT.map(m => ({ ...m }));
    db._set('vtp_etiq_metodos', _etqMetodos);
  }
  _etqValidades = db._get('vtp_etiq_validades', []);
  _etiquetas    = db._get('vtp_etiquetas', []);
  _etqPontos    = db._get('vtp_etiq_pontos', []);
}

const _saveEtqMetodos   = () => db._set('vtp_etiq_metodos',   _etqMetodos);
const _saveEtqValidades = () => db._set('vtp_etiq_validades', _etqValidades);
const _saveEtiquetas    = () => db._set('vtp_etiquetas',       _etiquetas);
const _saveEtqPontos    = () => db._set('vtp_etiq_pontos',    _etqPontos);

// ═══════════════════════════════════════════════════════════════
// PONTO DE ENTRADA
// ═══════════════════════════════════════════════════════════════

function renderEtiquetagem() {
  _etqInit();
  _etqTab = 'imprimir';
  _etqWizardStep = 1;
  _etqWizardState = {};
  _etqValidDrill  = null;

  const el = document.getElementById('etqContent');
  if (!el) return;
  el.innerHTML = _etqShell();
  _etqRenderTab();
  _etqUpdateBadge();
}

function _etqCanProd()     {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return false;
  const p = typeof getUserPerms === 'function' ? getUserPerms(u) : (PERMS[u.role]?.perms || []);
  return p.includes('Etiquetagem: Produção');
}
function _etqCanCadastro() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return false;
  const p = typeof getUserPerms === 'function' ? getUserPerms(u) : (PERMS[u.role]?.perms || []);
  return p.includes('Etiquetagem: Cadastros');
}

function _etqShell() {
  const tabs = [
    { id: 'imprimir',  icon: 'printer', label: 'Imprimir'  },
    { id: 'validades', icon: 'clock',   label: 'Validades' },
  ];
  if (_etqCanProd()) tabs.push({ id: 'producao', icon: 'list', label: 'Produção' });

  return `
    <div style="display:flex;flex-direction:column;height:100%;min-height:calc(100vh - 56px)">
      <div class="tab-bar" id="etqTabBar" style="padding:0 24px;flex-shrink:0;border-bottom:1.5px solid var(--border)">
        ${tabs.map(t => `
          <button id="etqTab-${t.id}" onclick="_etqSetTab('${t.id}')"
            class="tab-btn${_etqTab === t.id ? ' active' : ''}">
            ${lc(t.icon, 13, 'currentColor')}
            ${t.label}
          </button>
        `).join('')}
        ${_etqCanCadastro() ? `
          <button class="tab-btn" onclick="goModule('configuracoes');_cfgSection='etiquetagem';renderConfiguracoes()"
            style="margin-left:auto;color:var(--muted)">
            ${lc('settings', 13, 'currentColor')} Cadastros
          </button>
        ` : ''}
      </div>
      <div id="etqTabContent" style="flex:1;overflow-y:auto"></div>
    </div>
  `;
}

function _etqSetTab(tab) {
  // Bloqueia acesso a Produção sem permissão
  if (tab === 'producao' && !_etqCanProd()) {
    toast('Acesso não permitido para seu perfil', 'err');
    return;
  }
  _etqTab = tab;
  _etqWizardStep  = 1;
  _etqWizardState = {};
  _etqValidDrill  = null;

  document.querySelectorAll('#etqTabBar .tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`etqTab-${tab}`);
  if (btn) btn.classList.add('active');
  _etqRenderTab();
}

function _etqRenderTab() {
  const el = document.getElementById('etqTabContent');
  if (!el) return;
  if (_etqTab === 'imprimir')       _etqRenderWizard(el);
  else if (_etqTab === 'validades') _etqRenderValidades(el);
  else if (_etqTab === 'producao')  _etqRenderProducao(el);
  else _etqRenderWizard(el); // fallback
}

// ═══════════════════════════════════════════════════════════════
// WIZARD — 5 PASSOS + SUCESSO
// ═══════════════════════════════════════════════════════════════

function _etqRenderWizard(el) {
  const catLabel   = _etqWizardState.categoria || 'Produto';
  const stepTitles = ['','Responsável','Categoria', catLabel, 'Conservação','Confirmar'];
  const step = _etqWizardStep;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;min-height:calc(100vh - 112px)">
      ${step <= 5 ? `
        <div style="padding:16px 24px 0;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            ${step > 1 ? `<button onclick="_etqWizBack()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:6px;display:flex;align-items:center;gap:4px;font-size:.75rem;font-weight:600">${lc('arrow-left',14,'currentColor')} Voltar</button>` : ''}
            <div style="flex:1"></div>
            <span style="font-size:.72rem;color:var(--muted);font-weight:600">${step} de 5</span>
          </div>
          <div style="height:4px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-bottom:4px">
            <div style="height:100%;width:${step*20}%;background:var(--brand-purple);border-radius:4px;transition:width .3s"></div>
          </div>
          <div style="font-size:1rem;font-weight:800;color:var(--text);padding:8px 0 4px">${stepTitles[step]}</div>
        </div>
      ` : ''}
      <div id="etqWizContent" style="flex:1;overflow-y:auto;padding:16px 24px 24px"></div>
    </div>
  `;
  _etqRenderWizStep(document.getElementById('etqWizContent'));
}

function _etqRenderWizStep(el) {
  if (!el) return;
  if (_etqWizardStep === 1) _etqStep1(el);
  else if (_etqWizardStep === 2) _etqStep2(el);
  else if (_etqWizardStep === 3) _etqStep3(el);
  else if (_etqWizardStep === 4) _etqStep4(el);
  else if (_etqWizardStep === 5) _etqStep5(el);
  else if (_etqWizardStep === 6) _etqStep6(el);
}

function _etqWizBack() {
  if (_etqWizardStep <= 1) return;
  _etqWizardStep--;
  _etqRenderWizard(document.getElementById('etqTabContent'));
}

function _etqWizNext() {
  _etqWizardStep++;
  _etqRenderWizard(document.getElementById('etqTabContent'));
}

// ── Passo 1: Responsável ──────────────────────────────────────

function _etqStep1(el) {
  const resp = _etqGetResponsaveis();
  const busca = _etqWizardState._buscaResp || '';

  const filtrados = resp.filter(r =>
    r.nome.toLowerCase().includes(busca.toLowerCase())
  );

  el.innerHTML = `
    <div style="margin-bottom:14px">
      <input class="inp" id="etqBuscaResp" placeholder="Buscar responsável..." value="${busca}"
        oninput="_etqWizardState._buscaResp=this.value;_etqRenderWizStep(document.getElementById('etqWizContent'))"
        style="max-width:360px">
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-width:700px">
      ${filtrados.map(r => `
        <button onclick="_etqWizardState.responsavel=${JSON.stringify(r).replace(/"/g,'&quot;')};_etqWizNext()"
          style="padding:14px 12px;border-radius:var(--r10);border:2px solid var(--border);background:var(--surface);
            cursor:pointer;text-align:left;transition:all .12s;font-family:Inter,sans-serif">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--brand-purple);display:flex;align-items:center;justify-content:center;margin-bottom:8px">
            <span style="font-size:.85rem;font-weight:800;color:#fff">${r.nome.charAt(0).toUpperCase()}</span>
          </div>
          <div style="font-size:.82rem;font-weight:700;color:var(--text);line-height:1.2">${r.nome}</div>
          ${r.cargo ? `<div style="font-size:.66rem;color:var(--muted);margin-top:2px">${r.cargo}</div>` : ''}
        </button>
      `).join('')}
    </div>
    ${filtrados.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum responsável encontrado</div>` : ''}
  `;
}

// ── Passo 2: Categoria ────────────────────────────────────────

function _etqStep2(el) {
  const allItems = typeof items !== 'undefined' ? items : [];
  // Categorias exatamente como estão em item.cat — sem normalização, sem mapeamento
  const habilitadas = typeof db !== 'undefined' ? db._get('vtp_etiq_categorias', null) : null;
  const todasCats = [...new Set(allItems.map(i => i.cat || 'Outros'))].filter(Boolean).sort();
  const cats = habilitadas !== null ? todasCats.filter(c => habilitadas.includes(c)) : todasCats;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;max-width:700px">
      ${cats.map(cat => {
        const count = allItems.filter(i => (i.cat || 'Outros') === cat).length;
        const icon  = _etqIconCat(cat);
        return `
          <button onclick="_etqWizardState.categoria='${cat.replace(/'/g,'\\\'')
          }';_etqWizNext()"
            class="etq-card"
            style="padding:18px 14px;border-radius:var(--r12);border:2px solid var(--border);background:var(--surface);
              text-align:center;font-family:Inter,sans-serif;
              display:flex;flex-direction:column;align-items:center;gap:10px">
            <div style="width:44px;height:44px;border-radius:50%;background:var(--brand-purple);display:flex;align-items:center;justify-content:center">
              ${lc(icon, 20, '#fff')}
            </div>
            <div style="font-size:.8rem;font-weight:700;color:var(--text);line-height:1.2">${cat}</div>
            <div style="font-size:.66rem;color:var(--muted)">${count} ${count === 1 ? 'item' : 'itens'}</div>
          </button>
        `;
      }).join('')}
    </div>
    ${cats.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum insumo ou preparado cadastrado</div>` : ''}
  `;
}

// ── Passo 3: Produto ──────────────────────────────────────────

function _etqStep3(el) {
  const allItems  = typeof items !== 'undefined' ? items : [];
  const cat       = _etqWizardState.categoria;
  const catItems  = allItems.filter(i => (i.cat || 'Outros') === cat);
  const busca     = _etqWizardState._buscaProd || '';
  const filtrados = catItems.filter(i => i.name.toLowerCase().includes(busca.toLowerCase()));
  const selId     = _etqWizardState.item?.id;

  el.innerHTML = `
    <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input class="inp" id="etqBuscaProd" placeholder="Buscar produto..." value="${busca}"
        oninput="_etqWizardState._buscaProd=this.value;_etqRenderWizStep(document.getElementById('etqWizContent'))"
        style="max-width:300px">
      <span style="font-size:.72rem;color:var(--muted)">${filtrados.length} ${filtrados.length === 1 ? 'item' : 'itens'}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;max-width:700px">
      ${filtrados.map(item => {
        const isSel = selId === item.id;
        const valids = _etqValidades.filter(v => v.item_id == item.id);
        return `
          <button onclick="_etqWizardState.item=${JSON.stringify({id:item.id,name:item.name,cat:item.cat,isProd:item.isProd,unit:item.unit}).replace(/"/g,'&quot;')};_etqWizNext()"
            class="etq-card"
            style="padding:14px;border-radius:var(--r10);border:2px solid ${isSel ? 'var(--brand-purple)' : 'var(--border)'};
              background:${isSel ? 'var(--purple-xlight)' : 'var(--surface)'};
              text-align:left;font-family:Inter,sans-serif">
            <div style="font-size:.82rem;font-weight:700;color:${isSel ? 'var(--brand-purple)' : 'var(--text)'};line-height:1.3;margin-bottom:4px">${item.name}</div>
            <div style="font-size:.66rem;color:var(--muted)">${item.cat || 'Outros'}</div>
            <div style="font-size:.64rem;color:var(--muted);margin-top:3px">${valids.length} conservação${valids.length !== 1 ? 'ões' : ''} conf.</div>
          </button>
        `;
      }).join('')}
    </div>
    ${filtrados.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum produto encontrado</div>` : ''}
  `;
}

// ── Passo 4: Conservação ──────────────────────────────────────

function _etqStep4(el) {
  const itemId  = _etqWizardState.item?.id;
  // Validades configuradas para este item
  const valids  = _etqValidades.filter(v => v.item_id == itemId);

  if (valids.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 24px;max-width:480px;margin:0 auto">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--warning-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          ${lc('alert-triangle', 24, 'var(--warning-fg)')}
        </div>
        <div style="font-size:.94rem;font-weight:700;color:var(--text);margin-bottom:8px">
          Nenhuma conservação configurada
        </div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:20px">
          Configure as validades de <strong>${_etqWizardState.item?.name}</strong> em
          Configurações → Etiquetagem antes de imprimir.
        </div>
        ${_etqCanCadastro() ? `
          <button class="btn btn-outline" onclick="goModule('configuracoes');_cfgSection='etiquetagem';_cfgEtqTab='validades';renderConfiguracoes()">
            ${lc('settings', 14, 'currentColor')} Ir para Configurações → Etiquetagem
          </button>
        ` : `
          <div style="font-size:.76rem;color:var(--muted)">Solicite ao gerente ou supervisor que configure as validades deste produto.</div>
        `}
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;max-width:700px">
      ${valids.map(v => {
        const met = _etqMetodos.find(m => m.id === v.metodo_id);
        if (!met) return '';
        const label = met.status ? `${met.nome} · ${met.status}` : met.nome;
        const isSel = _etqWizardState.metodo?.id === v.metodo_id;
        return `
          <button onclick="_etqWizardState.metodo=${JSON.stringify({id:met.id,nome:met.nome,status:met.status,icone:met.icone,cor:met.cor,validade_dias:v.validade_dias}).replace(/"/g,'&quot;')};_etqWizNext()"
            class="etq-card"
            style="padding:20px 16px;border-radius:var(--r12);border:2px solid ${isSel ? 'var(--brand-purple)' : 'var(--border)'};
              background:${isSel ? 'var(--purple-xlight)' : 'var(--surface)'};
              text-align:center;font-family:Inter,sans-serif">
            <div style="width:44px;height:44px;border-radius:50%;background:${met.cor}22;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">
              ${lc(met.icone || 'thermometer', 22, met.cor)}
            </div>
            <div style="font-size:.8rem;font-weight:700;color:${isSel ? 'var(--brand-purple)' : 'var(--text)'};">${label}</div>
            <div style="font-size:.72rem;color:var(--muted);margin-top:6px;font-weight:600">${v.validade_dias} dia${v.validade_dias !== 1 ? 's' : ''}</div>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// ── Passo 5: Preview + imprimir ───────────────────────────────

function _etqStep5(el) {
  const s    = _etqWizardState;
  const now  = new Date();
  const dias = s.metodo?.validade_dias || 0;
  const dtVal = new Date(now.getTime() + dias * 864e5);

  const cfg = _etqConfigEmpresa();

  el.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;max-width:800px">

      <!-- Preview da etiqueta -->
      <div style="flex-shrink:0">
        <div style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Preview 60×60mm</div>
        <div id="etqPreviewBox" style="width:220px;padding:12px;border:1.5px solid var(--border);border-radius:var(--r8);background:#fff;font-family:monospace;font-size:10px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          ${_etqPreviewHtml(s, cfg, now, dtVal)}
        </div>
      </div>

      <!-- Campos e ações -->
      <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:14px">

        <!-- Campos opcionais -->
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px">
          <div style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Campos opcionais</div>
          <div class="f2" style="gap:8px">
            <div class="field" style="margin-bottom:8px">
              <label style="font-size:.72rem">Medida</label>
              <input class="inp" type="number" id="etqMedida" placeholder="0" step="0.01" min="0"
                oninput="_etqStep5UpdatePreview()" style="font-size:.82rem;padding:6px 10px">
            </div>
            <div class="field" style="margin-bottom:8px">
              <label style="font-size:.72rem">Unidade</label>
              <select class="inp" id="etqUnidade" onchange="_etqStep5UpdatePreview()" style="font-size:.82rem;padding:6px 10px">
                <option value="">—</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="L">L</option>
                <option value="un">un</option>
              </select>
            </div>
          </div>
          <div class="f2" style="gap:8px">
            <div class="field" style="margin-bottom:8px">
              <label style="font-size:.72rem">Val. original</label>
              <input class="inp" type="date" id="etqValOrig" style="font-size:.82rem;padding:6px 10px">
            </div>
            <div class="field" style="margin-bottom:8px">
              <label style="font-size:.72rem">Lote</label>
              <input class="inp" id="etqLote" placeholder="Ex: L2025-01" style="font-size:.82rem;padding:6px 10px">
            </div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label style="font-size:.72rem">SIF (se aplicável)</label>
            <input class="inp" id="etqSif" placeholder="Ex: 1234" style="font-size:.82rem;padding:6px 10px">
          </div>
        </div>

        <!-- Quantidade -->
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px">
          <div style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Quantidade de etiquetas</div>
          <div style="display:flex;align-items:center;gap:14px">
            <button onclick="_etqQtyChange(-1)" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:var(--surface);cursor:pointer;font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
            <span id="etqQtyDisplay" style="font-size:1.5rem;font-weight:800;color:var(--text);min-width:32px;text-align:center">1</span>
            <button onclick="_etqQtyChange(1)" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:var(--surface);cursor:pointer;font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
          </div>
        </div>

        <!-- Botão imprimir -->
        <button class="btn btn-primary" onclick="_etqImprimir()" style="justify-content:center;padding:13px;font-size:.9rem;gap:8px">
          ${lc('printer', 16, '#fff')} Imprimir etiqueta${1 > 1 ? 's' : ''}
        </button>

        <!-- Resumo -->
        <div style="font-size:.72rem;color:var(--muted);line-height:1.6">
          <div>${lc('user', 12, 'currentColor')} <strong>Resp.:</strong> ${s.responsavel?.nome || '—'}</div>
          <div>${lc('package', 12, 'currentColor')} <strong>Produto:</strong> ${s.item?.name || '—'}</div>
          <div>${lc('thermometer', 12, 'currentColor')} <strong>Conservação:</strong> ${s.metodo ? (s.metodo.status ? `${s.metodo.nome} · ${s.metodo.status}` : s.metodo.nome) : '—'}</div>
          <div>${lc('clock', 12, 'currentColor')} <strong>Validade:</strong> ${dias} dia${dias !== 1 ? 's' : ''} (${_etqFmtDT(dtVal.toISOString())})</div>
        </div>
      </div>
    </div>
  `;

  // Gera hash de preview fixo para este step (reutilizado ao atualizar)
  if (!s._previewQR) s._previewQR = _etqQRHash();

  // Restaura estado dos campos
  if (s._medida)  document.getElementById('etqMedida').value  = s._medida;
  if (s._unidade) document.getElementById('etqUnidade').value = s._unidade;
  if (s._valOrig) document.getElementById('etqValOrig').value = s._valOrig;
  if (s._lote)    document.getElementById('etqLote').value    = s._lote;
  if (s._sif)     document.getElementById('etqSif').value     = s._sif;
  if (s._qty)     document.getElementById('etqQtyDisplay').textContent = s._qty;

  // Popula preview com QR real
  const box5 = document.getElementById('etqPreviewBox');
  if (box5) {
    box5.innerHTML = _etqPreviewHtml(s, cfg, now, dtVal, s._previewQR);
    _etqRenderQR('etqQRImg_preview', s._previewQR, 62);
  }
}

function _etqStep5UpdatePreview() {
  const s = _etqWizardState;
  s._medida  = document.getElementById('etqMedida')?.value  || '';
  s._unidade = document.getElementById('etqUnidade')?.value || '';
  const now  = new Date();
  const dias = s.metodo?.validade_dias || 0;
  const dtVal = new Date(now.getTime() + dias * 864e5);
  const cfg  = _etqConfigEmpresa();
  const box  = document.getElementById('etqPreviewBox');
  if (!s._previewQR) s._previewQR = _etqQRHash();
  if (box) {
    box.innerHTML = _etqPreviewHtml(s, cfg, now, dtVal, s._previewQR);
    _etqRenderQR('etqQRImg_preview', s._previewQR, 62);
  }
}

function _etqQtyChange(delta) {
  const s = _etqWizardState;
  const cur = parseInt(s._qty || 1);
  const next = Math.max(1, Math.min(99, cur + delta));
  s._qty = next;
  const el = document.getElementById('etqQtyDisplay');
  if (el) el.textContent = next;
  const btn = document.querySelector('[onclick="_etqImprimir()"]');
  if (btn) btn.innerHTML = `${lc('printer', 16, '#fff')} Imprimir ${next > 1 ? next + ' etiquetas' : 'etiqueta'}`;
}

function _etqPreviewHtml(s, cfg, dtManip, dtVal, qrHash) {
  const produto  = s.item?.name?.toUpperCase() || '';
  const metodo   = s.metodo ? (s.metodo.status ? `${s.metodo.nome.toUpperCase()} · ${s.metodo.status.toUpperCase()}` : s.metodo.nome.toUpperCase()) : '';
  const peso     = s._medida && s._unidade ? `${s._medida} ${s._unidade}` : '0 g';
  const resp     = s.responsavel?.nome?.toUpperCase() || '';
  const empresa  = (cfg.nome || 'VAI TER PIZZA!').toUpperCase();
  const cnpj     = cfg.cnpj || '';
  const cep      = cfg.cep  || '';
  const end      = cfg.endereco || '';
  const qr       = qrHash || '—';

  return `
    <div style="font-size:9px;font-family:monospace;line-height:1.5;color:#000">
      <div style="font-size:12px;font-weight:bold;margin-bottom:3px;border-bottom:1.5px solid #333;padding-bottom:3px">${produto}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:9px">
        <span>${metodo}</span>
        <span>${peso}</span>
      </div>
      <div style="border-top:1px solid #ccc;padding-top:4px;margin-bottom:4px">
        <div><strong>MANIPULAÇÃO:</strong> ${_etqFmtDT(dtManip.toISOString())}</div>
        <div><strong>VALIDADE:</strong>    ${_etqFmtDT(dtVal.toISOString())}</div>
      </div>
      <div style="border-top:1px solid #ccc;padding-top:4px;margin-bottom:4px;display:flex;gap:8px;align-items:flex-end;justify-content:space-between">
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold">RESP.: ${resp}</div>
          <div style="font-weight:bold">${empresa}</div>
          ${cnpj ? `<div>CNPJ: ${cnpj}</div>` : ''}
          ${cep  ? `<div>CEP: ${cep}${end ? ' ' + end : ''}</div>` : (end ? `<div style="font-size:7.5px">${end}</div>` : '')}
          <div style="margin-top:4px;font-size:11px;font-weight:bold">${qr}</div>
        </div>
        <img id="etqQRImg_preview" width="62" height="62" alt="QR" style="border-radius:3px;flex-shrink:0">
      </div>
    </div>
  `;
}

// ── QR Code rendering (real matrix via qrcode.js) ─────────────

function _etqRenderQR(imgId, text, size = 80) {
  // qrcode-generator: usa createDataURL() nativo (GIF embutido, sem canvas, síncrono)
  const img = document.getElementById(imgId);
  if (!img || !text || text === '—') return;

  try {
    if (typeof qrcode !== 'undefined') {
      const qr = qrcode(0, 'M');
      qr.addData(text, 'Byte');
      qr.make();
      // cellSize: quantos px por módulo. Margem = 2 células.
      const cellSize = Math.max(2, Math.floor(size / (qr.getModuleCount() + 8)));
      img.src = qr.createDataURL(cellSize, cellSize * 2);
      return;
    }
  } catch(e) {
    console.warn('[VTP QR]', e);
  }

  // Fallback: SVG inline sem dependência externa
  _etqRenderQRSvgFallback(imgId, text, size);
}

function _etqRenderQRSvgFallback(imgId, text, size) {
  // Renderiza via canvas nativo se o fallback SVG for necessário
  const img = document.getElementById(imgId);
  if (!img) return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n      = qr.getModuleCount();
    const canvas = document.createElement('canvas');
    const tile   = Math.max(2, Math.floor(size / n));
    canvas.width = canvas.height = n * tile;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) ctx.fillRect(c*tile, r*tile, tile, tile);
    img.src = canvas.toDataURL('image/png');
  } catch(_) {
    img.alt = text; // último recurso: mostra o hash como texto
  }
}

// ── Passo 6: Sucesso ──────────────────────────────────────────

function _etqStep6(el) {
  const hashes = _etqWizardState._impressas || [];
  el.innerHTML = `
    <div style="text-align:center;padding:40px 24px;max-width:480px;margin:0 auto">
      <div class="state-complete-icon" style="margin:0 auto 16px">
        ${lc('printer', 28, 'var(--success-fg)')}
      </div>
      <div class="state-complete-title">Etiqueta${hashes.length > 1 ? 's' : ''} registrada${hashes.length > 1 ? 's' : ''}!</div>
      <div class="state-complete-sub" style="margin-bottom:20px">
        ${hashes.length} etiqueta${hashes.length > 1 ? 's' : ''} gerada${hashes.length > 1 ? 's' : ''} para
        <strong>${_etqWizardState.item?.name}</strong>
        · ${_etqWizardState.metodo?.nome || ''}
        ${_etqWizardState.metodo?.status ? `· ${_etqWizardState.metodo.status}` : ''}
      </div>

      ${hashes.length > 0 ? `
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:14px;text-align:left;margin-bottom:20px">
          <div style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">QR Codes gerados</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${hashes.map(h => `<span style="font-family:monospace;font-size:.8rem;font-weight:700;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--brand-purple)">${h}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div style="background:var(--warning-bg);border:1.5px solid var(--warning-border,var(--border));border-radius:var(--r8);padding:10px 14px;font-size:.76rem;color:var(--warning-fg);margin-bottom:20px;text-align:left;display:flex;gap:8px;align-items:flex-start">
        ${lc('alert-triangle', 14, 'currentColor')}
        <span>Impressão de etiquetas físicas via Zebra ZD220 está disponível na Fase 3 (Raspberry Pi). Por agora, os registros estão salvos no sistema.</span>
      </div>

      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="_etqSetTab('imprimir')">
          ${lc('plus', 14, 'currentColor')} Nova etiqueta
        </button>
        <button class="btn btn-ghost" onclick="_etqSetTab('validades')">
          ${lc('clock', 14, 'currentColor')} Ver validades
        </button>
      </div>
    </div>
  `;
}

// ── Ação de imprimir ─────────────────────────────────────────

function _etqImprimir() {
  const s    = _etqWizardState;
  const qty  = parseInt(s._qty || 1);
  const now  = new Date();
  const dias = s.metodo?.validade_dias || 0;
  const dtVal = new Date(now.getTime() + dias * 864e5);

  const medida  = parseFloat(document.getElementById('etqMedida')?.value)  || null;
  const unidade = document.getElementById('etqUnidade')?.value  || null;
  const valOrig = document.getElementById('etqValOrig')?.value  || null;
  const lote    = document.getElementById('etqLote')?.value     || null;
  const sif     = document.getElementById('etqSif')?.value      || null;

  const hashes = [];
  const novasEtiquetas = [];
  for (let i = 0; i < qty; i++) {
    const qr = _etqQRHash();
    hashes.push(qr);
    const etq = {
      id:             _etqGenId(),
      item_id:        s.item?.id,
      item_nome:      s.item?.name || '',
      item_cat:       s.item?.cat  || '',
      item_isProd:    s.item?.isProd || false,
      metodo_id:      s.metodo?.id,
      metodo_nome:    s.metodo?.nome || '',
      metodo_status:  s.metodo?.status || null,
      responsavel_id:   s.responsavel?.id   || null,
      responsavel_nome: s.responsavel?.nome || '',
      dt_manipulacao: now.toISOString(),
      dt_validade:    dtVal.toISOString(),
      quantidade:     qty,
      medida:         medida,
      unidade:        unidade,
      validade_original: valOrig,
      sif:            sif,
      lote:           lote,
      qr_hash:        qr,
      status:         'valida',
      ponto_id:       null,
      created_at:     now.toISOString(),
    };
    _etiquetas.push(etq);
    novasEtiquetas.push(etq);
  }

  _saveEtiquetas();
  _etqUpdateBadge();

  _etqWizardState._impressas = hashes;
  _etqWizardState._medida    = medida;
  _etqWizardState._unidade   = unidade;

  // Abre janela de impressão 60×60mm (browser)
  _etqAbrirJanelaPrint(s, hashes, now, dtVal, medida, unidade);

  // Tenta também mandar via bridge local (Zebra ZD220 real, se o agent estiver rodando).
  // Fire-and-forget: nunca bloqueia a UI nem falha visivelmente quando não há bridge
  // (caso normal em produção, sem Mac/impressora conectados).
  _etqEnviarParaBridge(novasEtiquetas, _etqConfigEmpresa())
    .then(ok => {
      if (ok) toast(`${lc('printer',14,'#fff')} Etiqueta${novasEtiquetas.length>1?'s':''} enviada${novasEtiquetas.length>1?'s':''} para a Zebra ZD220`, 'ok');
    });

  _etqWizardStep = 6;
  _etqRenderWizard(document.getElementById('etqTabContent'));
}

function _etqAbrirJanelaPrint(s, hashes, dtManip, dtVal, medida, unidade) {
  const produto = (s.item?.name || '').toUpperCase();
  const metodo  = s.metodo ? (s.metodo.status
    ? `${s.metodo.nome.toUpperCase()} · ${s.metodo.status.toUpperCase()}`
    : s.metodo.nome.toUpperCase()) : '';
  const peso    = medida && unidade ? `${medida} ${unidade}` : '';
  const resp    = (s.responsavel?.nome || '').toUpperCase();
  const cfg     = (typeof empresaConfig !== 'undefined') ? empresaConfig : {};
  const empresa = (cfg.nome || 'VAI TER PIZZA!').toUpperCase();
  const cnpj    = cfg.cnpj || '';
  const end     = cfg.endereco || '';

  const fmtDT = iso => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yy} − ${hh}H${mi}`;
  };

  // Gera QR como data URL síncrono para cada etiqueta
  const qrDataURLs = hashes.map(hash => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(hash, 'Byte');
      qr.make();
      // Para 60×60mm a ~96dpi ≈ 227px; reservamos ~56px para o QR
      const cell = 3;
      return { hash, url: qr.createDataURL(cell, cell * 2) };
    } catch(e) {
      return { hash, url: '' };
    }
  });

  const etiquetasHtml = qrDataURLs.map(({ hash, url }) => `
    <div class="etiqueta">
      <div class="produto">${produto}</div>
      <div class="linha-metodo">
        <span>${metodo}</span>
        <span>${peso}</span>
      </div>
      <div class="divisor"></div>
      <div class="datas">
        <div><b>MANIPULAÇÃO:</b> ${fmtDT(dtManip.toISOString())}</div>
        <div><b>VALIDADE:</b>    ${fmtDT(dtVal.toISOString())}</div>
      </div>
      <div class="divisor"></div>
      <div class="rodape">
        <div class="rodape-texto">
          <div><b>RESP.: ${resp}</b></div>
          <div><b>${empresa}</b></div>
          ${cnpj ? `<div>CNPJ: ${cnpj}</div>` : ''}
          ${end  ? `<div class="end">${end}</div>` : ''}
          <div class="hash">${hash}</div>
        </div>
        ${url ? `<img src="${url}" class="qr" alt="QR">` : ''}
      </div>
    </div>
  `).join('');

  const win = window.open('', '_blank', 'width=400,height=400');
  if (!win) { toast('Permita popups para imprimir', 'err'); return; }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Etiqueta VTP</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    @page {
      size: 60mm 60mm;
      margin: 0;
    }
    body {
      font-family: monospace;
      background: #fff;
    }
    .etiqueta {
      width: 60mm;
      height: 60mm;
      padding: 2.5mm;
      overflow: hidden;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .produto {
      font-size: 9pt;
      font-weight: bold;
      border-bottom: 1pt solid #333;
      padding-bottom: 1mm;
      margin-bottom: 1mm;
      line-height: 1.2;
    }
    .linha-metodo {
      display: flex;
      justify-content: space-between;
      font-size: 7pt;
      margin-bottom: 1mm;
    }
    .divisor {
      border-top: 0.5pt solid #ccc;
      margin: 1mm 0;
    }
    .datas {
      font-size: 7pt;
      line-height: 1.4;
    }
    .rodape {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 1mm;
      margin-top: auto;
    }
    .rodape-texto {
      font-size: 6.5pt;
      line-height: 1.35;
      flex: 1;
      min-width: 0;
    }
    .end { font-size: 6pt; }
    .hash {
      font-size: 8pt;
      font-weight: bold;
      margin-top: 1mm;
    }
    .qr {
      width: 16mm;
      height: 16mm;
      flex-shrink: 0;
      border-radius: 1mm;
    }
    @media print {
      html, body { width: 60mm; height: 60mm; }
    }
  </style>
  </head><body>
    ${etiquetasHtml}
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  <\/script>
  </body></html>`);
  win.document.close();
}

// ── Impressão real via bridge local (Zebra ZD220 + ZPL) ───────
// Um serviço Node rodando na mesma máquina (ver print-agent/) recebe
// o ZPL e manda pra impressora via CUPS. Roda em HTTPS (certificado
// autoassinado) pra funcionar tanto local quanto a partir do site em
// produção. Quando o bridge não está rodando (caso normal em
// dispositivos sem Mac/impressora conectados) isso falha em silêncio
// e o fluxo de impressão pelo navegador continua igual.

const ETQ_BRIDGE_URL = 'https://localhost:9123';

function _etqGerarZPL(etq, cfg) {
  const esc = s => String(s ?? '').replace(/\^/g, '').replace(/~/g, '');

  const produto = esc((etq.item_nome || '').toUpperCase());
  const metodo  = esc(etq.metodo_status
    ? `${etq.metodo_nome.toUpperCase()} · ${etq.metodo_status.toUpperCase()}`
    : (etq.metodo_nome || '').toUpperCase());
  const peso    = etq.medida && etq.unidade ? esc(`${etq.medida} ${etq.unidade}`) : '';
  const resp    = esc((etq.responsavel_nome || '').toUpperCase());
  const empresa = esc((cfg.nome || 'VAI TER PIZZA!').toUpperCase());
  const cnpj    = esc(cfg.cnpj || '');
  const end     = esc(cfg.endereco || '');
  const dtManip = esc(_etqFmtDT(etq.dt_manipulacao));
  const dtVal   = esc(_etqFmtDT(etq.dt_validade));
  const hash    = esc(etq.qr_hash);

  // Etiqueta 60×60mm a 203dpi → 480×480 dots (^PW/^LL). QR nativo via ^BQN.
  return [
    '^XA',
    '^PW480',
    '^LL480',
    '^CI28',
    `^FO20,20^A0N,36,36^FD${produto}^FS`,
    `^FO20,65^A0N,22,22^FD${metodo}^FS`,
    peso ? `^FO380,65^A0N,22,22^FD${peso}^FS` : '',
    '^FO20,90^GB440,2,2^FS',
    '^FO20,105^A0N,22,22^FDMANIPULAÇÃO:^FS',
    `^FO260,105^A0N,22,22^FD${dtManip}^FS`,
    '^FO20,135^A0N,22,22^FDVALIDADE:^FS',
    `^FO260,135^A0N,22,22^FD${dtVal}^FS`,
    '^FO20,175^GB440,2,2^FS',
    `^FO20,190^A0N,20,20^FDRESP.: ${resp}^FS`,
    `^FO20,215^A0N,20,20^FD${empresa}^FS`,
    cnpj ? `^FO20,238^A0N,18,18^FDCNPJ: ${cnpj}^FS` : '',
    // ^FB limita a largura do endereço a 290 dots (com quebra em até 2 linhas)
    // pra não invadir a coluna do QR Code, que começa em x=320.
    end  ? `^FO20,260^A0N,16,16^FB290,2,0,L,0^FD${end}^FS` : '',
    `^FO320,185^BQN,2,5^FDQA,${hash}^FS`,
    `^FO20,310^A0N,22,22^FD${hash}^FS`,
    '^XZ',
  ].filter(Boolean).join('\n');
}

async function _etqEnviarParaBridge(etqList, cfg) {
  if (!etqList || etqList.length === 0) return false;
  try {
    const zpl = etqList.map(e => _etqGerarZPL(e, cfg)).join('\n');
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${ETQ_BRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zpl }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    return res.ok;
  } catch (_) {
    // Bridge não está rodando (caso normal fora da validação) — falha em silêncio.
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// ABA: VALIDADES
// ═══════════════════════════════════════════════════════════════

function _etqRenderValidades(el) {
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const amanha  = new Date(hoje.getTime() + 864e5);
  const depAmanha = new Date(hoje.getTime() + 2 * 864e5);
  const ontem   = new Date(hoje.getTime() - 864e5);

  // Atualiza status das vencidas
  const agora = new Date();
  _etiquetas.forEach(e => {
    if (e.status === 'valida' && new Date(e.dt_validade) < agora) {
      e.status = 'vencida';
    }
  });
  _saveEtiquetas();

  if (_etqValidDrill) {
    _etqRenderValidadesDrill(el, _etqValidDrill);
    return;
  }

  const vencOntem   = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), ontem));
  const vencHoje    = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), hoje));
  const vencAmanha  = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), amanha));
  const vencDepAmanha = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), depAmanha));

  el.innerHTML = `
    <div style="padding:20px 24px">

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="_etqOpenScanner()" style="display:flex;align-items:center;gap:7px">
          ${lc('scan-line',16,'#fff')} Dar Baixa por QR
        </button>
        <div style="font-size:.75rem;color:var(--muted)">ou abra uma etiqueta abaixo e use os botões de baixa</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;max-width:900px;margin-bottom:28px">
        ${_etqValidCard('Ontem', vencOntem, 'var(--red)', 'var(--danger-bg)', ontem)}
        ${_etqValidCard('Hoje', vencHoje, 'var(--orange-dark,#D97706)', '#FEF3C7', hoje)}
        ${_etqValidCard('Amanhã', vencAmanha, 'var(--success-fg,#059669)', 'var(--success-bg,#D1FAE5)', amanha)}
        ${_etqValidCard('Depois de amanhã', vencDepAmanha, 'var(--muted)', 'var(--surface2)', depAmanha)}
      </div>

      <div>
        <div style="font-size:.8rem;font-weight:700;color:var(--text);margin-bottom:12px">Próximos 7 dias</div>
        ${_etqValidTimelineHtml()}
      </div>
    </div>
  `;
}

function _etqValidCard(label, etqs, cor, bg, date) {
  return `
    <button onclick="_etqValidDrill='${date.toISOString()}';_etqRenderValidades(document.getElementById('etqTabContent'))"
      style="padding:18px;border-radius:var(--r12);border:1.5px solid ${cor}44;background:${bg};
        cursor:pointer;text-align:left;font-family:Inter,sans-serif;transition:all .12s;width:100%">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${cor};margin-bottom:8px">${label}</div>
      <div style="font-size:2rem;font-weight:900;color:${cor};line-height:1">${etqs.length}</div>
      <div style="font-size:.7rem;color:${cor};opacity:.8;margin-top:4px">etiqueta${etqs.length !== 1 ? 's' : ''}</div>
    </button>
  `;
}

function _etqValidTimelineHtml() {
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje.getTime() + i * 864e5);
    const etqs = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), d));
    if (etqs.length > 0) dias.push({ d, etqs });
  }
  if (dias.length === 0) return `<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:.82rem">Nenhuma etiqueta vencendo nos próximos 7 dias</div>`;

  return dias.map(({ d, etqs }) => {
    const label = _sameDay(d, hoje) ? 'Hoje' : _sameDay(d, new Date(hoje.getTime() + 864e5)) ? 'Amanhã' : _etqFmtDate(d);
    return `
      <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer"
        onclick="_etqValidDrill='${d.toISOString()}';_etqRenderValidades(document.getElementById('etqTabContent'))">
        <div style="min-width:80px;font-size:.75rem;font-weight:700;color:var(--text)">${label}</div>
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:6px">
          ${etqs.slice(0, 6).map(e => `
            <span style="font-size:.72rem;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--text)">${e.item_nome}</span>
          `).join('')}
          ${etqs.length > 6 ? `<span style="font-size:.72rem;color:var(--muted)">+${etqs.length - 6}</span>` : ''}
        </div>
        <div style="font-size:.76rem;font-weight:700;color:var(--muted)">${etqs.length}</div>
        ${lc('chevron-right', 14, 'var(--muted)')}
      </div>
    `;
  }).join('');
}

function _etqRenderValidadesDrill(el, dateIso) {
  const drillDate = new Date(dateIso);
  drillDate.setHours(0,0,0,0);
  const etqs = _etiquetas.filter(e => e.status !== 'excluida' && _sameDay(new Date(e.dt_validade), drillDate));

  el.innerHTML = `
    <div style="padding:16px 24px">
      <button onclick="_etqValidDrill=null;_etqRenderValidades(document.getElementById('etqTabContent'))"
        style="background:none;border:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:6px;font-size:.76rem;font-weight:600;margin-bottom:14px">
        ${lc('arrow-left', 14, 'currentColor')} Voltar às validades
      </button>
      <div style="font-size:.94rem;font-weight:800;color:var(--text);margin-bottom:4px">
        Vencem em ${_etqFmtDate(drillDate)}
      </div>
      <div style="font-size:.76rem;color:var(--muted);margin-bottom:16px">${etqs.length} etiqueta${etqs.length !== 1 ? 's' : ''}</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-width:900px">
        ${etqs.map(e => {
          const sv = _etqStatusValidade(e.dt_validade);
          const metLabel = e.metodo_status ? `${e.metodo_nome} · ${e.metodo_status}` : e.metodo_nome;
          return `
            <div onclick="_etqAbrirDetalheEtq('${e.id}')"
              style="padding:14px;border-radius:var(--r10);border:1.5px solid ${sv.cor}44;background:${sv.bg};
                cursor:pointer;transition:all .12s">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div style="font-size:.82rem;font-weight:700;color:var(--text);line-height:1.3">${e.item_nome}</div>
                <span style="font-size:.65rem;font-weight:700;background:${sv.cor}22;color:${sv.cor};border-radius:4px;padding:2px 6px;flex-shrink:0;margin-left:6px">${sv.label}</span>
              </div>
              <div style="font-size:.72rem;color:var(--muted);margin-bottom:4px">${metLabel}</div>
              <div style="font-size:.72rem;color:var(--muted)">Resp.: ${e.responsavel_nome}</div>
              <div style="font-size:.7rem;color:var(--muted);margin-top:6px">Validade: ${_etqFmtDT(e.dt_validade)}</div>
              <div style="font-family:monospace;font-size:.72rem;color:var(--brand-purple);margin-top:6px">${e.qr_hash}</div>
            </div>
          `;
        }).join('')}
      </div>
      ${etqs.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted)">Nenhuma etiqueta vencendo neste dia</div>` : ''}
    </div>
  `;
}

function _etqAbrirDetalheEtq(id) {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  const e = _etiquetas.find(x => x.id === id);
  if (!e) return;
  _etqDetalheId = id;

  const cfg = _etqConfigEmpresa();
  const sv  = _etqStatusValidade(e.dt_validade);
  const metLabel = e.metodo_status ? `${e.metodo_nome} · ${e.metodo_status}` : e.metodo_nome;
  const dtManip  = new Date(e.dt_manipulacao);
  const dtVal    = new Date(e.dt_validade);

  // Breadcrumb: categoria > produto
  document.getElementById('etqDetalheBreadcrumb').innerHTML =
    `<span style="color:var(--muted)">${e.item_cat || '—'}</span>
     <span style="margin:0 5px;color:var(--muted)">›</span>
     <span style="color:var(--brand-orange);font-weight:700">${e.item_nome}</span>`;
  document.getElementById('etqDetalheTitle').textContent = e.item_nome;

  // Preview (Suflex style)
  const previewEl = document.getElementById('etqDetalhePreview');
  const peso = e.medida ? `${e.medida} ${e.unidade || ''}` : '0 g';
  previewEl.innerHTML = `
    <div style="font-size:12px;font-weight:bold;border-bottom:1.5px solid #333;padding-bottom:3px;margin-bottom:3px">${e.item_nome.toUpperCase()}</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:9px">
      <span>${metLabel.toUpperCase()}</span><span>${peso}</span>
    </div>
    <div style="border-top:1px solid #ccc;padding-top:3px;margin-bottom:3px;font-size:9px">
      <div><strong>MANIPULAÇÃO:</strong> ${_etqFmtDT(e.dt_manipulacao)}</div>
      <div><strong>VALIDADE:</strong>    ${_etqFmtDT(e.dt_validade)}</div>
    </div>
    <div style="border-top:1px solid #ccc;padding-top:3px;display:flex;gap:8px;align-items:flex-end;justify-content:space-between">
      <div style="flex:1;min-width:0;font-size:9px">
        <div style="font-weight:bold">RESP.: ${(e.responsavel_nome || '').toUpperCase()}</div>
        <div style="font-weight:bold">${(cfg.nome || 'VAI TER PIZZA!').toUpperCase()}</div>
        ${cfg.cnpj ? `<div>CNPJ: ${cfg.cnpj}</div>` : ''}
        ${cfg.cep  ? `<div>CEP: ${cfg.cep}${cfg.endereco ? ' ' + cfg.endereco : ''}</div>` : ''}
        <div style="margin-top:4px;font-size:11px;font-weight:bold">${e.qr_hash}</div>
      </div>
      <img id="etqDetQRImg" width="62" height="62" alt="QR" style="border-radius:3px;flex-shrink:0">
    </div>
  `;
  // Gera QR real
  setTimeout(() => _etqRenderQR('etqDetQRImg', e.qr_hash, 62), 30);

  // Zona de baixa rápida (apenas se válida)
  const baixaEl = document.getElementById('etqDetalheBaixaZone');
  if (e.status === 'valida') {
    baixaEl.innerHTML = `
      <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Dar baixa nesta etiqueta</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="_etqDarBaixa('${id}','consumida')" style="justify-content:flex-start;gap:8px">
          ${lc('check-circle',14,'var(--green)')} Consumida / Utilizada
        </button>
        <button class="btn btn-outline btn-sm" onclick="_etqDarBaixa('${id}','descartada')" style="justify-content:flex-start;gap:8px">
          ${lc('trash-2',14,'var(--orange-dark)')} Descartada / Perdida
        </button>
        <button class="btn btn-outline btn-sm" onclick="_etqDarBaixa('${id}','nao_encontrada')" style="justify-content:flex-start;gap:8px">
          ${lc('help-circle',14,'var(--muted)')} Não encontrada
        </button>
      </div>`;
  } else {
    const statusLabel = { excluida: 'Excluída', consumida: 'Consumida', descartada: 'Descartada', nao_encontrada: 'Não encontrada', vencida: 'Vencida' }[e.status] || e.status;
    baixaEl.innerHTML = `
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);padding:10px;font-size:.76rem;color:var(--muted);text-align:center">
        ${lc('info',13,'currentColor')} Status: <strong>${statusLabel}</strong>
      </div>`;
  }

  // Etiquetas associadas (mesmo lote / mesmo item+metodo+data)
  const assocEl = document.getElementById('etqDetalheAssociadas');
  const sameBatch = _etiquetas.filter(x =>
    x.item_id === e.item_id &&
    x.metodo_id === e.metodo_id &&
    _sameDay(new Date(x.dt_manipulacao), dtManip) &&
    x.status !== 'excluida'
  ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  assocEl.innerHTML = sameBatch.map((x, idx) => {
    const xsv = _etqStatusValidade(x.dt_validade);
    const isThis = x.id === id;
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r8);
        border:1.5px solid ${isThis ? 'var(--brand-purple)' : 'var(--border)'};
        background:${isThis ? 'var(--purple-xlight)' : 'var(--surface)'};cursor:pointer">
        <span style="font-size:.72rem;color:var(--muted);min-width:20px;text-align:right">${String(idx+1).padStart(2,'0')}</span>
        <span style="font-family:monospace;font-size:.78rem;font-weight:700;color:var(--brand-purple);flex:1">${x.qr_hash}</span>
        <span style="font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:10px;background:${xsv.bg};color:${xsv.cor}">${xsv.label}</span>
        <input type="checkbox" class="etq-assoc-chk" data-id="${x.id}" ${isThis ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--brand-purple)">
      </label>`;
  }).join('') || `<div style="text-align:center;padding:30px 0;color:var(--muted);font-size:.8rem">Nenhuma etiqueta associada</div>`;

  // Footer: Excluir só se há etiquetas válidas
  const delBtn = document.getElementById('etqDetalheExcluirBtn');
  if (delBtn) delBtn.style.display = sameBatch.length > 0 ? 'inline-flex' : 'none';

  document.getElementById('etqDetalheOverlay').classList.add('open');
}

function _etqDetalheToggleAll() {
  const chks = document.querySelectorAll('.etq-assoc-chk');
  const allChecked = [...chks].every(c => c.checked);
  chks.forEach(c => c.checked = !allChecked);
  const btn = document.getElementById('etqDetalheSelAll');
  if (btn) btn.textContent = allChecked ? 'Selecionar todas' : 'Desmarcar todas';
}

function _etqDarBaixaSelecao(tipo) {
  const chks = [...document.querySelectorAll('.etq-assoc-chk:checked')];
  const ids = chks.map(c => c.dataset.id);
  if (ids.length === 0) { toast('Selecione ao menos uma etiqueta', 'err'); return; }
  const tipoLabel = { excluida: 'excluir', consumida: 'marcar como consumida', descartada: 'marcar como descartada', nao_encontrada: 'marcar como não encontrada' }[tipo] || tipo;
  vtpConfirm({
    title: `${ids.length} etiqueta${ids.length > 1 ? 's' : ''} selecionada${ids.length > 1 ? 's' : ''}`,
    message: `Confirma ${tipoLabel} as etiquetas selecionadas?`,
    confirmLabel: tipo === 'excluida' ? 'Excluir' : 'Confirmar',
    danger: tipo === 'excluida',
    onConfirm: () => {
      ids.forEach(id => {
        const etq = _etiquetas.find(x => x.id === id);
        if (etq) etq.status = tipo;
      });
      _saveEtiquetas();
      _etqUpdateBadge();
      closeModal('etqDetalheOverlay');
      toast(`${ids.length} etiqueta${ids.length > 1 ? 's' : ''} ${tipoLabel === 'excluir' ? 'excluída' + (ids.length > 1 ? 's' : '') : 'atualizadas'}`, 'ok');
      const tabEl = document.getElementById('etqTabContent');
      if (tabEl) _etqRenderValidades(tabEl);
    },
  });
}

function _etqDarBaixa(id, tipo) {
  const e = _etiquetas.find(x => x.id === id);
  if (!e) return;

  // Descartada → abre modal de desperdício pré-preenchido
  if (tipo === 'descartada') {
    _etqAbrirModalDesperdicio(e);
    return;
  }

  const tipoLabel = { consumida: 'Consumida / Utilizada', nao_encontrada: 'Não encontrada', excluida: 'Excluída' }[tipo] || tipo;
  vtpConfirm({
    title: `Dar baixa: ${e.item_nome}`,
    message: `Marcar esta etiqueta como "${tipoLabel}"?`,
    confirmLabel: 'Confirmar baixa',
    danger: tipo === 'excluida',
    onConfirm: () => {
      e.status = tipo;
      _saveEtiquetas();
      _etqUpdateBadge();
      closeModal('etqDetalheOverlay');
      closeModal('etqScannerOverlay');
      closeModal('etqBaixaOverlay');
      toast(`${lc('check-circle',14,'var(--green)')} Etiqueta marcada como ${tipoLabel.toLowerCase()}`, 'ok');
      const tabEl = document.getElementById('etqTabContent');
      if (tabEl && _etqTab === 'validades') _etqRenderValidades(tabEl);
    },
  });
}

function _etqAbrirModalDesperdicio(e) {
  // Monta opções de tipo de desperdício
  const tiposOpts = (typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO : [])
    .map(t => `<option value="${t.id}">${t.label}</option>`).join('');

  const qty    = e.medida  || e.quantidade || '';
  const unid   = e.unidade || '';
  const hoje   = new Date().toISOString().slice(0,10);

  // Cria overlay temporário
  const ovId = 'etqDespOverlay';
  let ov = document.getElementById(ovId);
  if (!ov) {
    ov = document.createElement('div');
    ov.id = ovId;
    ov.className = 'overlay';
    document.body.appendChild(ov);
  }

  ov.innerHTML = `
    <div class="mbox" style="max-width:420px">
      <div class="mh">
        <div class="mt">${lc('trash-2',16,'var(--orange-dark)')} Registrar Desperdício</div>
        <button class="mc" onclick="closeModal('${ovId}')"></button>
      </div>
      <div class="mb" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--surface2);border-radius:var(--r8);padding:10px 14px;font-size:var(--text-sm)">
          <div style="font-weight:700;color:var(--text)">${e.item_nome}</div>
          <div style="color:var(--muted);margin-top:2px">${qty ? qty + ' ' + unid : 'Quantidade não informada'}</div>
        </div>
        <div class="field">
          <label>Tipo de desperdício *</label>
          <select class="inp" id="etqDespTipo">${tiposOpts}</select>
        </div>
        <div class="f2">
          <div class="field">
            <label>Quantidade *</label>
            <input class="inp" type="number" id="etqDespQty" value="${qty}" min="0.001" step="0.001" placeholder="0">
          </div>
          <div class="field">
            <label>Unidade</label>
            <input class="inp" id="etqDespUnid" value="${unid}" placeholder="kg, g, L…">
          </div>
        </div>
        <div class="field">
          <label>Responsável *</label>
          <input class="inp" id="etqDespResp" placeholder="Nome de quem está registrando">
        </div>
        <div class="field">
          <label>Observação</label>
          <input class="inp" id="etqDespObs" placeholder="Opcional">
        </div>
      </div>
      <div class="mf" style="gap:8px">
        <button class="btn btn-ghost" onclick="closeModal('${ovId}')">Cancelar</button>
        <button class="btn btn-primary" style="background:var(--orange-dark);border-color:var(--orange-dark)"
          onclick="_etqConfirmarDesperdicio('${e.id}','${ovId}')">
          ${lc('check-circle',14,'#fff')} Confirmar desperdício
        </button>
      </div>
    </div>`;

  ov.classList.add('open');
}

function _etqConfirmarDesperdicio(etqId, ovId) {
  const e    = _etiquetas.find(x => x.id === etqId);
  if (!e) return;

  const tipo = document.getElementById('etqDespTipo')?.value;
  const qty  = parseFloat(document.getElementById('etqDespQty')?.value);
  const unid = document.getElementById('etqDespUnid')?.value.trim() || e.unidade || '';
  const resp = document.getElementById('etqDespResp')?.value.trim();
  const obs  = document.getElementById('etqDespObs')?.value.trim();

  if (!tipo)         { toast('Selecione o tipo de desperdício', 'err'); return; }
  if (!qty || qty <= 0) { toast('Informe a quantidade', 'err'); return; }
  if (!resp)         { toast('Informe o responsável', 'err'); return; }

  // Registra no módulo de desperdício
  if (typeof desperdicios !== 'undefined') {
    const item   = (typeof items !== 'undefined') ? items.find(i => i.id === e.item_id) : null;
    const custo  = item ? (item.cost || 0) * qty : 0;
    const nextId = Math.max(0, ...desperdicios.map(x => x.id)) + 1;
    const d = {
      id:        nextId,
      itemId:    e.item_id || null,
      prodId:    null,
      origem:    'etiquetagem',
      nome:      e.item_nome,
      unidade:   unid,
      qty,
      tipo,
      custo,
      date:      new Date().toISOString().slice(0,10),
      resp,
      obs:       obs || `Descartada via Etiquetagem (etq #${etqId})`,
      createdAt: new Date().toISOString(),
    };
    desperdicios.push(d);
    if (typeof saveD === 'function') saveD();

    // Baixa no estoque
    if (item) {
      item.qty = Math.max(0, parseFloat((item.qty - qty).toFixed(3)));
      if (typeof saveI === 'function') saveI();
      if (typeof registrarMovimentacao === 'function') {
        registrarMovimentacao('saida_perda', item.id, qty, 'Desperdício via Etiquetagem: ' + tipo, null);
      }
    }

    try { if (typeof logAudit === 'function') logAudit('desperdicio_registrado', tipo + ' — ' + e.item_nome + ' ' + qty + ' ' + unid, 'desperdicio'); } catch(_){}
    if (typeof renderDesperdicio === 'function') renderDesperdicio();
    if (typeof renderDashboard   === 'function') renderDashboard();
  }

  // Marca etiqueta como descartada
  e.status = 'descartada';
  _saveEtiquetas();
  _etqUpdateBadge();

  closeModal(ovId);
  closeModal('etqDetalheOverlay');
  closeModal('etqScannerOverlay');
  closeModal('etqBaixaOverlay');

  toast(`${lc('check-circle',14,'var(--green)')} Desperdício registrado e etiqueta baixada`, 'ok');

  const tabEl = document.getElementById('etqTabContent');
  if (tabEl && _etqTab === 'validades') _etqRenderValidades(tabEl);
}

// ═══════════════════════════════════════════════════════════════
// SCANNER QR — câmera + baixa manual
// ═══════════════════════════════════════════════════════════════

let _etqCamStream   = null;
let _etqScanActive  = false;
let _etqScanRAF     = null;

function _etqOpenScanner() {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  document.getElementById('etqHashManual').value = '';
  document.getElementById('etqScanStatus').textContent = 'Aponte para o QR Code da etiqueta';
  document.getElementById('etqScannerOverlay').classList.add('open');
  setTimeout(_etqStartCamera, 200);
}

function _etqStartCamera() {
  if (_etqCamStream) return; // já ativa
  const video = document.getElementById('etqCamVideo');
  if (!video) return;
  navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      _etqCamStream  = stream;
      _etqScanActive = true;
      video.srcObject = stream;
      video.play();
      video.onloadedmetadata = () => _etqScanLoop();
    })
    .catch(err => {
      const st = document.getElementById('etqScanStatus');
      if (st) st.textContent = 'Câmera não disponível — use o campo manual abaixo';
    });
}

function _etqStopCamera() {
  _etqScanActive = false;
  if (_etqScanRAF) { cancelAnimationFrame(_etqScanRAF); _etqScanRAF = null; }
  if (_etqCamStream) {
    _etqCamStream.getTracks().forEach(t => t.stop());
    _etqCamStream = null;
  }
  const video = document.getElementById('etqCamVideo');
  if (video) { video.srcObject = null; }
}

function _etqScanLoop() {
  if (!_etqScanActive) return;
  const video  = document.getElementById('etqCamVideo');
  const canvas = document.getElementById('etqCamCanvas');
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
    _etqScanRAF = requestAnimationFrame(_etqScanLoop);
    return;
  }
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (typeof jsQR !== 'undefined') {
    const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) {
      _etqScanActive = false; // pausa scan
      _etqHandleQRFound(code.data.trim().toUpperCase());
      return;
    }
  }
  _etqScanRAF = requestAnimationFrame(_etqScanLoop);
}

function _etqHandleQRFound(hash) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(80);
  const st = document.getElementById('etqScanStatus');
  if (st) st.textContent = `✅ Lido: ${hash}`;
  setTimeout(() => _etqBaixaPorHash(hash), 300);
}

function _etqBaixaManual() {
  const raw = (document.getElementById('etqHashManual')?.value || '').trim().toUpperCase();
  if (!raw) { toast('Digite o código da etiqueta', 'err'); return; }
  const hash = raw.startsWith('#') ? raw : '#' + raw;
  _etqBaixaPorHash(hash);
}

function _etqBaixaPorHash(hash) {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  const e = _etiquetas.find(x => x.qr_hash === hash);

  if (!e) {
    toast(`QR ${hash} não encontrado no sistema`, 'err');
    // Reativa scan
    setTimeout(() => { _etqScanActive = true; _etqScanLoop(); }, 1500);
    return;
  }

  // Fecha scanner e abre resultado
  _etqStopCamera();
  closeModal('etqScannerOverlay');

  const sv  = _etqStatusValidade(e.dt_validade);
  const cfg = _etqConfigEmpresa();

  document.getElementById('etqBaixaTitle').textContent = e.item_nome;
  document.getElementById('etqBaixaBody').innerHTML = `
    <div style="padding:16px 20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:.76rem;font-weight:700;padding:3px 10px;border-radius:10px;background:${sv.bg};color:${sv.cor}">${sv.label}</span>
        <span style="font-size:.76rem;color:var(--muted)">${e.metodo_nome}${e.metodo_status ? ' · ' + e.metodo_status : ''}</span>
      </div>
      <div style="background:#fff;border:1.5px solid var(--border);border-radius:var(--r8);padding:10px;font-family:monospace;font-size:9px;color:#000;margin-bottom:14px">
        <div style="font-size:11px;font-weight:bold;border-bottom:1px solid #ccc;padding-bottom:2px;margin-bottom:2px">${e.item_nome.toUpperCase()}</div>
        <div><strong>MANIPULAÇÃO:</strong> ${_etqFmtDT(e.dt_manipulacao)}</div>
        <div><strong>VALIDADE:</strong>    ${_etqFmtDT(e.dt_validade)}</div>
        <div style="margin-top:4px"><strong>RESP.:</strong> ${(e.responsavel_nome||'').toUpperCase()}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;border-top:1px solid #eee;padding-top:4px">
          <span style="font-size:10px;font-weight:bold">${e.qr_hash}</span>
          <img id="etqBaixaQRImg" width="50" height="50" alt="QR" style="border-radius:2px">
        </div>
      </div>
      ${e.status !== 'valida' ? `
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);padding:10px;font-size:.78rem;color:var(--muted);text-align:center">
          ${lc('info',13,'currentColor')} Esta etiqueta já tem status: <strong>${e.status}</strong>
        </div>` : ''}
    </div>`;

  setTimeout(() => _etqRenderQR('etqBaixaQRImg', e.qr_hash, 50), 30);

  const foot = document.getElementById('etqBaixaFoot');
  if (e.status === 'valida') {
    foot.innerHTML = `
      <button class="btn btn-outline" onclick="closeModal('etqBaixaOverlay');_etqOpenScanner()">${lc('scan-line',14,'currentColor')} Escanear outro</button>
      <button class="btn btn-ghost" onclick="_etqDarBaixa('${e.id}','nao_encontrada')" style="color:var(--muted)">${lc('help-circle',13,'currentColor')} Não encontrada</button>
      <button class="btn btn-outline btn-sm" onclick="_etqDarBaixa('${e.id}','descartada')" style="color:var(--orange-dark)">${lc('trash-2',13,'currentColor')} Descartada</button>
      <button class="btn btn-primary" onclick="_etqDarBaixa('${e.id}','consumida')">${lc('check-circle',14,'#fff')} Consumida</button>`;
  } else {
    foot.innerHTML = `
      <button class="btn btn-outline" onclick="closeModal('etqBaixaOverlay');_etqOpenScanner()">${lc('scan-line',14,'currentColor')} Escanear outro</button>
      <button class="btn btn-primary" onclick="closeModal('etqBaixaOverlay')">Fechar</button>`;
  }
  document.getElementById('etqBaixaOverlay').classList.add('open');
}

function _etqExcluirBatch() {
  _etqDarBaixaSelecao('excluida');
}

// ═══════════════════════════════════════════════════════════════
// ABA: PRODUÇÃO
// ═══════════════════════════════════════════════════════════════

function _etqRenderProducao(el) {
  const filtros = [
    { id: 'hoje',   label: 'Hoje' },
    { id: 'ontem',  label: 'Ontem' },
    { id: '7dias',  label: '7 dias' },
    { id: '30dias', label: '30 dias' },
  ];

  const hoje  = new Date();
  hoje.setHours(0,0,0,0);
  const ontem = new Date(hoje.getTime() - 864e5);

  let etqs = _etiquetas.filter(e => e.status !== 'excluida');
  if (_etqProdFiltro === 'hoje') {
    etqs = etqs.filter(e => _sameDay(new Date(e.dt_manipulacao), hoje));
  } else if (_etqProdFiltro === 'ontem') {
    etqs = etqs.filter(e => _sameDay(new Date(e.dt_manipulacao), ontem));
  } else if (_etqProdFiltro === '7dias') {
    etqs = etqs.filter(e => new Date(e.dt_manipulacao) >= new Date(hoje.getTime() - 7 * 864e5));
  } else if (_etqProdFiltro === '30dias') {
    etqs = etqs.filter(e => new Date(e.dt_manipulacao) >= new Date(hoje.getTime() - 30 * 864e5));
  }

  // Ordena por mais recente
  etqs.sort((a, b) => new Date(b.dt_manipulacao) - new Date(a.dt_manipulacao));

  el.innerHTML = `
    <div style="padding:16px 24px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
        ${filtros.map(f => `
          <button onclick="_etqProdFiltro='${f.id}';_etqRenderProducao(document.getElementById('etqTabContent'))"
            class="btn btn-sm ${_etqProdFiltro === f.id ? 'btn-primary' : 'btn-ghost'}">${f.label}</button>
        `).join('')}
        <span style="font-size:.72rem;color:var(--muted);margin-left:4px">${etqs.length} registro${etqs.length !== 1 ? 's' : ''}</span>
      </div>

      ${etqs.length === 0 ? `
        <div style="text-align:center;padding:60px 24px;color:var(--muted)">
          ${lc('list', 28, 'var(--border)')}
          <div style="font-size:.82rem;margin-top:10px">Nenhuma etiqueta no período selecionado</div>
        </div>
      ` : `
        <div style="overflow-x:auto;border-radius:var(--r10);border:1.5px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:.78rem;min-width:600px">
            <thead>
              <tr style="border-bottom:2px solid var(--border);background:var(--surface2)">
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Manipulação</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Produto</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Categoria</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Conservação</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Medida</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Qtd</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Responsável</th>
                <th style="padding:10px 14px;text-align:left;font-weight:700;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.5px">Status</th>
              </tr>
            </thead>
            <tbody>
              ${etqs.map((e, i) => {
                const sv = _etqStatusValidade(e.dt_validade);
                const metLabel = e.metodo_status ? `${e.metodo_nome} · ${e.metodo_status}` : e.metodo_nome;
                const medidaStr = e.medida ? `${e.medida} ${e.unidade || ''}` : '—';
                return `
                  <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:10px 14px;color:var(--muted);white-space:nowrap">${_etqFmtDT(e.dt_manipulacao)}</td>
                    <td style="padding:10px 14px;font-weight:600;color:var(--text)">${e.item_nome}</td>
                    <td style="padding:10px 14px;color:var(--muted)">${e.item_cat || '—'}</td>
                    <td style="padding:10px 14px;color:var(--muted)">${metLabel}</td>
                    <td style="padding:10px 14px;color:var(--muted);font-family:monospace">${medidaStr}</td>
                    <td style="padding:10px 14px;font-weight:700;text-align:center">${e.quantidade}</td>
                    <td style="padding:10px 14px;color:var(--muted)">${e.responsavel_nome || '—'}</td>
                    <td style="padding:10px 14px">
                      <span style="font-size:.65rem;font-weight:700;background:${sv.cor}22;color:${sv.cor};border-radius:4px;padding:2px 7px">${sv.label}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// ABA: CADASTROS
// ═══════════════════════════════════════════════════════════════

function _etqRenderCadastros(el) {
  el.innerHTML = `
    <div style="padding:16px 24px">
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <button onclick="_etqCadTab='metodos';_etqRenderCadastros(document.getElementById('etqTabContent'))"
          class="btn btn-sm ${_etqCadTab==='metodos'?'btn-primary':'btn-ghost'}">Métodos de Conservação</button>
        <button onclick="_etqCadTab='validades';_etqRenderCadastros(document.getElementById('etqTabContent'))"
          class="btn btn-sm ${_etqCadTab==='validades'?'btn-primary':'btn-ghost'}">Validades por Produto</button>
      </div>
      <div id="etqCadContent"></div>
    </div>
  `;
  const cadEl = document.getElementById('etqCadContent');
  if (_etqCadTab === 'metodos') _etqCadMetodos(cadEl);
  else _etqCadValidades(cadEl);
}

// ── Métodos ───────────────────────────────────────────────────

function _etqCadMetodos(el) {
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:.8rem;font-weight:700;color:var(--text)">Métodos de conservação e sub-status</div>
      <button class="btn btn-primary btn-sm" onclick="_etqOpenMetodoModal(null)">
        ${lc('plus', 13, '#fff')} Novo método
      </button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;max-width:900px">
      ${_etqMetodos.map(m => {
        const label = m.status ? `${m.nome} · ${m.status}` : m.nome;
        const vCount = _etqValidades.filter(v => v.metodo_id === m.id).length;
        return `
          <div style="padding:14px;border-radius:var(--r10);border:1.5px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:50%;background:${m.cor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${lc(m.icone || 'thermometer', 18, m.cor)}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>
              <div style="font-size:.66rem;color:var(--muted)">${vCount} produto${vCount !== 1 ? 's' : ''} configurado${vCount !== 1 ? 's' : ''}</div>
            </div>
            <button onclick="_etqOpenMetodoModal('${m.id}')"
              style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px;border-radius:4px;flex-shrink:0">
              ${lc('edit-2', 14, 'currentColor')}
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _etqOpenMetodoModal(id) {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  const m = id ? _etqMetodos.find(x => x.id === id) : null;
  document.getElementById('etqMetodoId').value     = id || '';
  document.getElementById('etqMetodoNome').value   = m?.nome   || '';
  document.getElementById('etqMetodoStatus').value = m?.status || '';
  document.getElementById('etqMetodoIcone').value  = m?.icone  || 'wind';
  document.getElementById('etqMetodoCor').value    = m?.cor    || '#0EA5E9';
  document.getElementById('etqMetodoTitle').textContent = id ? 'Editar Método' : 'Novo Método';
  document.getElementById('etqMetodoDelBtn').style.display = id ? 'inline-flex' : 'none';
  document.getElementById('etqMetodoOverlay').classList.add('open');
}

function _etqSaveMetodo() {
  const id    = document.getElementById('etqMetodoId').value;
  const nome  = document.getElementById('etqMetodoNome').value.trim();
  const status = document.getElementById('etqMetodoStatus').value.trim() || null;
  const icone = document.getElementById('etqMetodoIcone').value;
  const cor   = document.getElementById('etqMetodoCor').value;

  if (!nome) { toast('Nome é obrigatório', 'err'); return; }

  if (id) {
    const idx = _etqMetodos.findIndex(m => m.id === id);
    if (idx >= 0) { _etqMetodos[idx] = { ..._etqMetodos[idx], nome, status, icone, cor }; }
  } else {
    _etqMetodos.push({ id: _etqGenId(), nome, status, icone, cor });
  }
  _saveEtqMetodos();
  closeModal('etqMetodoOverlay');
  toast('Método salvo', 'ok');
  _etqRefreshCadastros();
}

function _etqDeleteMetodo() {
  const id = document.getElementById('etqMetodoId').value;
  if (!id) return;
  vtpConfirm({
    title: 'Excluir método',
    message: 'As validades configuradas para este método também serão removidas.',
    confirmLabel: 'Excluir',
    danger: true,
    onConfirm: () => {
      _etqMetodos = _etqMetodos.filter(m => m.id !== id);
      _etqValidades = _etqValidades.filter(v => v.metodo_id !== id);
      _saveEtqMetodos();
      _saveEtqValidades();
      closeModal('etqMetodoOverlay');
      toast('Método excluído', 'ok');
      _etqRefreshCadastros();
    },
  });
}

// ── Validades por produto ─────────────────────────────────────

function _etqCadValidades(el) {
  const allItems = typeof items !== 'undefined' ? items : [];
  const busca    = _etqWizardState._buscaCadVal || '';

  const filtrados = allItems.filter(i => i.name.toLowerCase().includes(busca.toLowerCase()));

  el.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <div style="font-size:.8rem;font-weight:700;color:var(--text)">Configure quantos dias cada produto dura por método de conservação</div>
    </div>
    <div style="margin-bottom:14px">
      <input class="inp" placeholder="Buscar produto..." value="${busca}"
        oninput="_etqWizardState._buscaCadVal=this.value;_etqCadValidades(document.getElementById('etqCadContent'))"
        style="max-width:360px">
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;max-width:900px">
      ${filtrados.map(item => {
        const validsItem = _etqValidades.filter(v => v.item_id == item.id);
        return `
          <div style="border:1.5px solid var(--border);border-radius:var(--r10);background:var(--surface);overflow:hidden">
            <div style="padding:12px 14px;background:var(--surface2);border-bottom:1.5px solid var(--border);display:flex;align-items:center;gap:10px">
              <div style="flex:1">
                <div style="font-size:.84rem;font-weight:700;color:var(--text)">${item.name}</div>
                <div style="font-size:.68rem;color:var(--muted)">${item.cat || '—'} · ${item.isProd ? 'Preparado' : 'Insumo'}</div>
              </div>
              <button class="btn btn-outline btn-xs" onclick="_etqOpenValidadeModal('${item.id}', null)">
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
                    <button onclick="_etqOpenValidadeModal('${item.id}','${v.metodo_id}')"
                      style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;
                        border:1.5px solid ${met.cor}44;background:${met.cor}11;
                        cursor:pointer;font-family:Inter,sans-serif;font-size:.72rem;font-weight:600;color:var(--text)">
                      ${lc(met.icone || 'thermometer', 11, met.cor)}
                      ${label}
                      <span style="font-weight:800;color:${met.cor}">${v.validade_dias}d</span>
                    </button>
                  `;
                }).join('')}
              </div>
            ` : `<div style="padding:10px 14px;font-size:.72rem;color:var(--muted)">Nenhuma conservação configurada — clique em Adicionar</div>`}
          </div>
        `;
      }).join('')}
      ${filtrados.length === 0 ? `<div style="text-align:center;padding:40px 0;color:var(--muted);font-size:.82rem">Nenhum produto encontrado</div>` : ''}
    </div>
  `;
}

function _etqOpenValidadeModal(itemId, metodoId) {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  const item = (typeof items !== 'undefined' ? items : []).find(i => i.id == itemId);
  const existing = metodoId ? _etqValidades.find(v => v.item_id == itemId && v.metodo_id === metodoId) : null;

  document.getElementById('etqValidadeItemId').value   = itemId;
  document.getElementById('etqValidadeMetodoId').value = metodoId || '';
  document.getElementById('etqValidadeDias').value     = existing?.validade_dias || '';
  document.getElementById('etqValidadeTitle').textContent = existing ? 'Editar Validade' : 'Nova Validade';
  document.getElementById('etqValidadeDelBtn').style.display = existing ? 'inline-flex' : 'none';

  const infoEl = document.getElementById('etqValidadeInfo');
  if (existing) {
    const met = _etqMetodos.find(m => m.id === metodoId);
    const metLabel = met ? (met.status ? `${met.nome} · ${met.status}` : met.nome) : '—';
    infoEl.innerHTML = `<strong>${item?.name || ''}</strong> &nbsp;·&nbsp; ${metLabel}`;
  } else {
    // Mostra selector de método
    const usedMetIds = _etqValidades.filter(v => v.item_id == itemId).map(v => v.metodo_id);
    const available  = _etqMetodos.filter(m => !usedMetIds.includes(m.id));
    if (available.length === 0) {
      infoEl.innerHTML = `<strong>${item?.name || ''}</strong> — Todos os métodos já estão configurados.`;
      document.getElementById('etqValidadeMetodoId').value = '';
    } else {
      infoEl.innerHTML = `
        <strong style="display:block;margin-bottom:6px">${item?.name || ''}</strong>
        <label style="font-size:.72rem;display:block;margin-bottom:4px">Método de conservação *</label>
        <select class="inp" id="etqValidadeMetodoSel" style="font-size:.8rem;padding:6px 10px">
          <option value="">Selecione...</option>
          ${available.map(m => {
            const label = m.status ? `${m.nome} · ${m.status}` : m.nome;
            return `<option value="${m.id}">${label}</option>`;
          }).join('')}
        </select>
      `;
    }
  }

  document.getElementById('etqValidadeOverlay').classList.add('open');
}

function _etqSaveValidade() {
  if (!_etqMetodos || !_etqValidades) _etqInit();
  const itemId   = parseInt(document.getElementById('etqValidadeItemId').value) || document.getElementById('etqValidadeItemId').value;
  let metodoId   = document.getElementById('etqValidadeMetodoId').value;
  const dias     = parseInt(document.getElementById('etqValidadeDias').value);

  // Se novo, pega do select
  if (!metodoId) {
    const sel = document.getElementById('etqValidadeMetodoSel');
    if (sel) metodoId = sel.value;
  }

  if (!metodoId) { toast('Selecione um método', 'err'); return; }
  if (!dias || dias < 1) { toast('Validade deve ser pelo menos 1 dia', 'err'); return; }

  const idx = _etqValidades.findIndex(v => v.item_id == itemId && v.metodo_id === metodoId);
  if (idx >= 0) {
    _etqValidades[idx].validade_dias = dias;
  } else {
    // Salva item_id sempre como número para consistência com items array
    const itemIdNum = parseInt(itemId) || itemId;
    _etqValidades.push({ id: _etqGenId(), item_id: itemIdNum, metodo_id: metodoId, validade_dias: dias });
  }
  _saveEtqValidades();
  closeModal('etqValidadeOverlay');
  toast('Validade salva', 'ok');
  _etqRefreshCadastros();
}

function _etqDeleteValidade() {
  if (!_etqValidades) _etqInit();
  const itemId   = document.getElementById('etqValidadeItemId').value;
  const metodoId = document.getElementById('etqValidadeMetodoId').value;
  _etqValidades = _etqValidades.filter(v => !(v.item_id == itemId && v.metodo_id === metodoId));
  _saveEtqValidades();
  closeModal('etqValidadeOverlay');
  toast('Validade removida', 'ok');
  _etqRefreshCadastros();
}

// ═══════════════════════════════════════════════════════════════
// ABA: CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════

function _etqRenderConfig(el) {
  const cfg = _etqConfigEmpresa();

  el.innerHTML = `
    <div style="padding:20px 24px;max-width:700px">

      <!-- Dados da unidade (read-only — editar em Configurações) -->
      <div class="card" style="margin-bottom:20px;padding:18px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--brand-purple);display:flex;align-items:center;justify-content:center">
            ${lc('building-2', 16, '#fff')}
          </div>
          <div>
            <div style="font-size:.86rem;font-weight:800;color:var(--text)">Dados da Unidade</div>
            <div style="font-size:.68rem;color:var(--muted)">Exibidos nas etiquetas — editar em Configurações → Empresa</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.78rem">
          <div><span style="color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.4px">Empresa</span><br><strong>${cfg.nome || '—'}</strong></div>
          <div><span style="color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.4px">Responsável</span><br><strong>${cfg.resp || '—'}</strong></div>
          ${cfg.cnpj     ? `<div><span style="color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.4px">CNPJ</span><br><strong>${cfg.cnpj}</strong></div>` : ''}
          ${cfg.endereco ? `<div style="grid-column:1/-1"><span style="color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.4px">Endereço</span><br><strong>${cfg.endereco}</strong></div>` : ''}
        </div>
      </div>

      <!-- Pontos de impressão (Fase 3 placeholder) -->
      <div class="card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center">
            ${lc('cpu', 16, 'var(--muted)')}
          </div>
          <div>
            <div style="font-size:.86rem;font-weight:800;color:var(--text)">Pontos de Impressão</div>
            <div style="font-size:.68rem;color:var(--muted)">Raspberry Pi + Zebra ZD220</div>
          </div>
        </div>

        <div style="background:var(--warning-bg,#FEF3C7);border:1.5px solid var(--warning-border,#FDE68A);border-radius:var(--r8);padding:14px;display:flex;gap:12px;align-items:flex-start">
          ${lc('alert-triangle', 16, 'var(--warning-fg,#D97706)')}
          <div>
            <div style="font-size:.8rem;font-weight:700;color:var(--warning-fg,#D97706);margin-bottom:4px">Fase 3 — Em desenvolvimento</div>
            <div style="font-size:.74rem;color:var(--warning-fg,#D97706);line-height:1.5">
              A integração com Raspberry Pi e a impressora Zebra ZD220 via protocolo ZPL está planejada para a Fase 3.
              Quando ativada, cada etiqueta gerada aqui será impressa automaticamente no ponto de cozinha mais próximo.
            </div>
          </div>
        </div>

        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
          <div style="padding:14px;border-radius:var(--r8);border:1.5px dashed var(--border);display:flex;align-items:center;gap:12px;opacity:.5">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center">
              ${lc('cpu', 18, 'var(--muted)')}
            </div>
            <div>
              <div style="font-size:.8rem;font-weight:700">COZINHA</div>
              <div style="font-size:.68rem;color:var(--muted)">Raspberry Pi 4B · Zebra ZD220 · USB · Offline</div>
            </div>
            <span style="margin-left:auto;font-size:.66rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:2px 8px;color:var(--muted)">OFFLINE</span>
          </div>
        </div>

        <div style="margin-top:12px">
          <button class="btn btn-outline btn-sm" disabled style="opacity:.5;cursor:not-allowed">
            ${lc('plus', 12, 'currentColor')} Adicionar ponto (disponível na Fase 3)
          </button>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// INTEGRAÇÃO — DASHBOARD BADGE
// ═══════════════════════════════════════════════════════════════

function _etqUpdateBadge() {
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  const amanha = new Date(hoje.getTime() + 864e5);

  const urgentes = _etiquetas.filter(e =>
    e.status !== 'excluida' &&
    new Date(e.dt_validade) >= hoje &&
    new Date(e.dt_validade) < amanha
  ).length;

  const badge = document.getElementById('badge-etiquetagem');
  if (badge) {
    if (urgentes > 0) {
      badge.style.display = 'flex';
      badge.textContent   = urgentes > 9 ? '9+' : urgentes;
    } else {
      badge.style.display = 'none';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function _etqFmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} - ${pad(d.getHours())}H${pad(d.getMinutes())}`;
}

function _etqFmtDate(d) {
  if (!d) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}

let _etqQRCounter = 0;
function _etqQRHash() {
  _etqQRCounter++;
  const rand = Math.random().toString(16).substr(2, 6).toUpperCase();
  return '#' + rand;
}

function _etqGenId() {
  return 'etq_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function _etqGetResponsaveis() {
  const result = [];
  const usrs = typeof users !== 'undefined' ? users : [];
  usrs.filter(u => {
    if (u.active === false) return false;
    // Só quem tiver a permissão 'Etiquetagem' configurada no perfil
    const perms = typeof getUserPerms === 'function'
      ? getUserPerms(u)
      : (typeof PERMS !== 'undefined' ? (PERMS[u.role]?.perms || []) : []);
    return perms.includes('Etiquetagem');
  }).forEach(u => {
    result.push({ id: 'u_' + u.id, nome: u.name, cargo: u.role });
  });
  return result;
}

function _etqConfigEmpresa() {
  const cfg = db._get('vtp_config', {}) || {};
  return {
    nome:     cfg.empresa    || 'Vai Ter Pizza!',
    cnpj:     cfg.cnpj      || '',
    endereco: cfg.endereco  || '',
    cep:      cfg.cep       || '',
    resp:     cfg.responsavel || '',
  };
}

function _etqStatusValidade(dtIso) {
  const agora = new Date();
  const val   = new Date(dtIso);
  const diffMs = val - agora;
  const diffH  = diffMs / 3600000;

  if (diffMs < 0) return { label: 'Vencida',  cor: 'var(--red)',          bg: 'var(--danger-bg,#FEE2E2)' };
  if (diffH <= 8)  return { label: 'Crítico',  cor: '#DC2626',              bg: '#FEE2E2' };
  if (diffH <= 24) return { label: 'Hoje',     cor: '#D97706',              bg: '#FEF3C7' };
  if (diffH <= 48) return { label: 'Amanhã',   cor: 'var(--success-fg,#059669)', bg: 'var(--success-bg,#D1FAE5)' };
  return { label: _etqFmtDate(val), cor: 'var(--muted)', bg: 'var(--surface2)' };
}

function _sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

// ── Re-render helper após salvar/excluir nos modais ──────────

function _etqRefreshCadastros() {
  // Se está na seção Etiquetagem do Configurações
  const cfgEl = document.getElementById('cfgEtqContent');
  if (cfgEl) {
    if (_cfgEtqTab === 'metodos')   _cfgEtqMetodos(cfgEl);
    else if (_cfgEtqTab === 'validades') _cfgEtqValidades(cfgEl);
    return;
  }
  // Fallback: re-renderiza seção inteira de Configurações
  const cfgSec = document.getElementById('cfgSectionContent');
  if (cfgSec && typeof _renderCfgSecEtiquetagem === 'function') {
    _renderCfgSecEtiquetagem(cfgSec);
  }
}

// Inicializa badge ao carregar o módulo
_etqInit();
_etqUpdateBadge();

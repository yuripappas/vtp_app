/**
 * VTP — Vai Ter Pizza!
 * gestao.js — Módulo Gestão (v2): Plano de Ação · Balanço · Processos
 *
 * Plano: docs/modulo-gestao-plano.md
 * Tudo pertence a uma sub-área; a área (ADM, OPE, PRO, MKT) vem dela.
 *
 * Leitura: tabelas gestao_* (liberadas para anon, como o resto do app).
 * Escrita: SEMPRE pelas funções gestao_* (RPC), que recebem o usuário logado.
 * No protótipo, window.GES_MOCK (docs/prototipo-gestao/gestao-mock.js)
 * substitui o backend com a mesma interface.
 */

const _GES_ABAS = [
  { id: 'plano',     icon: 'clipboard-check', label: 'Plano de Ação' },
  { id: 'balanco',   icon: 'activity',        label: 'Balanço'       },
  { id: 'processos', icon: 'layers',          label: 'Processos'     },
];

const GES_AREAS = [
  { id: 'adm', sigla: 'ADM', nome: 'Administrativo' },
  { id: 'ope', sigla: 'OPE', nome: 'Operação'       },
  { id: 'pro', sigla: 'PRO', nome: 'Produto'        },
  { id: 'mkt', sigla: 'MKT', nome: 'Marketing'      },
];

const GES_STATUS = [
  { id: 'a_fazer',      label: 'A fazer'      },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'concluido',    label: 'Concluído'    },
];
const GES_PRIO = [
  { id: 1, label: 'P1', nome: 'P1 · Urgente'    },
  { id: 2, label: 'P2', nome: 'P2 · Importante' },
  { id: 3, label: 'P3', nome: 'P3 · Normal'     },
];
const _GES_F_PADRAO = { q: '', status: ['a_fazer', 'em_andamento'], pessoa: '', area: '', ordem: 'status', dir: 'asc' };

const _ges = {
  aba: 'plano',
  D: null,
  erro: null,
  f: null,                 // filtros do Plano (salvos por usuário)
  abertas: new Set(),      // atividades com subtarefas expandidas
  recolhidas: new Set(),   // áreas recolhidas
  mobile: false,
};

window._vtpGetTab_gestao = () => _ges.aba;
window._vtpSetTab_gestao = v => { if (_GES_ABAS.some(a => a.id === v)) _ges.aba = v; };

// ══════════════════════════════════════════════════════════════
// BACKEND — real (Supabase) ou simulado (protótipo)
// ══════════════════════════════════════════════════════════════

async function gesRpc(fn, params = {}) {
  const sb = window._vtpSb;
  if (!sb) throw new Error('Sem conexão com o servidor');
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) throw new Error('Sessão expirada — entre novamente');
  const { data, error } = await sb.rpc(fn, { p_usuario_id: String(u.id), ...params });
  if (error) throw new Error(error.message || 'Erro ao salvar');
  return data;
}

const _gesReal = {
  async carregar() {
    const sb = window._vtpSb;
    if (!sb) throw new Error('Sem conexão com o servidor');
    const t = ['gestao_subareas', 'gestao_atividades', 'gestao_atividade_exec', 'gestao_atividade_links', 'gestao_processos', 'gestao_processo_rec',
      'gestao_rotinas', 'gestao_balancos', 'gestao_balanco_aval'];
    const r = await Promise.all(t.map(n => sb.from(n).select('*')));
    const e = r.find(x => x.error); if (e) throw new Error(e.error.message);
    const [subareas, atividades, exec, links, processos, recursos, rotinas, balancos, avals] = r.map(x => x.data || []);
    return { subareas, atividades, exec, links, processos, recursos, rotinas, balancos, avals };
  },
  // dados parciais: { descritivo, subarea_id, parent_id, status, resp_final_id, prazo, prioridade, observacao, exec: [ids] }
  atividadeSalvar: (id, d) => gesRpc('gestao_atividade_salvar', { p_id: id || null, p_dados: d }),
  atividadeArquivar: id => gesRpc('gestao_atividade_arquivar', { p_id: id }),
  // substitui a lista inteira de links: [{ tipo, titulo, url }]
  atividadeLinks: (id, lista) => gesRpc('gestao_atividade_links', { p_id: id, p_links: lista }),
  // dados: { subarea_id, nome, descricao, status, responsavel_id, revisado_em, recursos: [{ tipo, titulo, url }] }
  processoSalvar: (id, d) => gesRpc('gestao_processo_salvar', { p_id: id || null, p_dados: d }),
  processoArquivar: id => gesRpc('gestao_processo_arquivar', { p_id: id }),
  rotinaSalvar: (id, d) => gesRpc('gestao_rotina_salvar', { p_id: id || null, p_dados: d }),
  balancoAbrir: mes => gesRpc('gestao_balanco_abrir', { p_mes: mes }),
  // resposta: 'sim' | 'nao' | null (limpa)
  balancoResponder: (bid, rid, resposta, obs) => gesRpc('gestao_balanco_responder', { p_balanco_id: bid, p_rotina_id: rid, p_resposta: resposta, p_observacao: obs ?? null }),
  balancoFechar: bid => gesRpc('gestao_balanco_fechar', { p_balanco_id: bid }),
};
const gesApi = () => window.GES_MOCK || _gesReal;

async function _gesCarregar() {
  try { _ges.D = await gesApi().carregar(); _ges.erro = null; }
  catch (e) { _ges.erro = e.message; }
}

// Executa uma escrita, recarrega e redesenha. Devolve o retorno ou false.
async function _gesExec(fn, okMsg) {
  try {
    const r = await fn();
    await _gesCarregar();
    _gesRenderBody();
    if (okMsg) toast(okMsg);
    return r ?? true;   // funções do banco sem retorno devolvem null
  } catch (e) {
    toast(_gesEsc(e.message), 'err');
    _gesRenderBody();   // desfaz o que estava na tela
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _gesEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _gesNorm(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function gesHoje() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(new Date()); }
function _gesDias(prazo) { if (!prazo) return null; return Math.round((new Date(prazo + 'T12:00:00') - new Date(gesHoje() + 'T12:00:00')) / 864e5); }
function _gesData(iso) { if (!iso) return ''; const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; }

function _gesEu() { const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; return u ? String(u.id) : ''; }
function gesPref(chave, valor) {
  const k = `vtp_ges_${chave}_${_gesEu() || 'anon'}`;
  try { if (valor === undefined) return localStorage.getItem(k); localStorage.setItem(k, valor); } catch (_) { return null; }
}
function _gesUser(id) { return (typeof users !== 'undefined' ? users : []).find(u => String(u.id) === String(id)); }
function _gesNome(id) { return _gesUser(id)?.name || '—'; }
function _gesPrimeiroNome(id) { return (_gesNome(id) || '').split(' ')[0]; }
function _gesUsuariosAtivos() { return (typeof users !== 'undefined' ? users : []).filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name)); }
function _gesAvatar(id, size = '') {
  if (!id) return `<span class="ges-av ges-av-vazio ${size}" title="Sem responsável">${lc('user', 11, 'currentColor')}</span>`;
  const u = _gesUser(id); const nome = u?.name || '?';
  const ini = nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const cor = (String(id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 8) + 1;
  return u?.foto ? `<span class="ges-av ${size}" title="${_gesEsc(nome)}"><img src="${u.foto}" alt=""></span>`
    : `<span class="ges-av ${size}" data-cor="${cor}" title="${_gesEsc(nome)}">${ini}</span>`;
}

// Acessores
const _gSub    = id => _ges.D.subareas.find(s => s.id === id);
const _gArea   = id => GES_AREAS.find(a => a.id === id);
const _gAtv    = id => _ges.D.atividades.find(a => a.id === id);
const _gExec   = id => _ges.D.exec.filter(x => x.atividade_id === id).map(x => String(x.usuario_id));
const _gLinks  = id => (_ges.D.links || []).filter(l => l.atividade_id === id).sort((a, b) => a.ordem - b.ordem);
const _gFilhas = id => _ges.D.atividades.filter(a => a.parent_id === id && !a.arquivado).sort((a, b) => a.posicao - b.posicao);
const _gSubsAtivas = area => _ges.D.subareas.filter(s => s.ativo && (!area || s.area === area)).sort((a, b) => a.ordem - b.ordem);

function gesAtrasada(a) { return a.status !== 'concluido' && a.prazo && a.prazo < gesHoje(); }
function _gesTomPrazo(a) {
  if (!a.prazo || a.status === 'concluido') return '';
  const d = _gesDias(a.prazo);
  return d < 0 ? 'atraso' : d <= 2 ? 'perto' : '';
}
function _gesSelo(area) { const a = _gArea(area); return a ? `<span class="ges-selo" data-area="${a.id}" title="${a.nome}">${a.sigla}</span>` : ''; }
function _gesChipStatus(st) { const s = GES_STATUS.find(x => x.id === st); return `<span class="ges-st-chip" data-st="${st}">${s?.label || st}</span>`; }
function _gesMobile() { return window.matchMedia('(max-width: 768px)').matches; }

function _gesOptUsuarios(sel, vazio = '— Sem responsável') {
  return `<option value="">${vazio}</option>` + _gesUsuariosAtivos()
    .map(u => `<option value="${u.id}" ${String(sel) === String(u.id) ? 'selected' : ''}>${_gesEsc(u.name)}</option>`).join('');
}
function _gesOptSubareas(sel) {
  return GES_AREAS.map(a => `<optgroup label="${a.sigla} · ${a.nome}">${_gSubsAtivas(a.id)
    .map(s => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${_gesEsc(s.nome)}</option>`).join('')}</optgroup>`).join('');
}
function _gesOptStatus(sel) { return GES_STATUS.map(s => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${s.label}</option>`).join(''); }
function _gesOptPrio(sel) { return GES_PRIO.map(p => `<option value="${p.id}" ${Number(sel) === p.id ? 'selected' : ''}>${p.label}</option>`).join(''); }

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

async function renderGestao() {
  const el = document.getElementById('page-gestao');
  if (!el) return;
  if (!_GES_ABAS.some(a => a.id === _ges.aba)) _ges.aba = 'plano';
  _setPageTitle('Gestão');
  _gesCarregarFiltros();

  el.innerHTML = `
    <div class="ges">
      <div class="tab-bar" role="tablist">
        ${_GES_ABAS.map(a => `
          <button class="tab-btn ${_ges.aba === a.id ? 'active' : ''}" role="tab"
            aria-selected="${_ges.aba === a.id}" onclick="gesSetAba('${a.id}')">
            ${lc(a.icon, 15, 'currentColor')} ${a.label}
          </button>`).join('')}
        ${window.GES_MOCK ? '<span class="ges-proto">Protótipo · dados fictícios</span>' : ''}
      </div>
      <div class="ges-body" id="gesBody"></div>
    </div>`;

  if (!_ges.D) {
    document.getElementById('gesBody').innerHTML = '<div class="ges-carregando">Carregando…</div>';
    await _gesCarregar();
  }
  _gesRenderBody();
}

function _gesRenderBody() {
  const body = document.getElementById('gesBody');
  if (!body) return;
  if (_ges.erro || !_ges.D) {
    body.innerHTML = `<div class="ges-vazio"><div class="ges-vazio-titulo">Não foi possível carregar</div>
      <div class="ges-vazio-texto ges-erro">${_gesEsc(_ges.erro || '')}</div>
      <button class="btn btn-outline ges-mt" onclick="_ges.D=null;renderGestao()">Tentar de novo</button></div>`;
    return;
  }
  // Guarda o foco (edição inline) para devolver depois de redesenhar
  const foco = document.activeElement?.dataset?.k;
  if (_ges.chart) { _ges.chart.destroy(); _ges.chart = null; }
  _ges.mobile = _gesMobile();

  if (_ges.aba === 'plano') body.innerHTML = _gesHtmlPlano();
  else if (_ges.aba === 'processos') body.innerHTML = _gesHtmlProcessos();
  else body.innerHTML = _gesHtmlBalanco();
  const rotBody = document.getElementById('gesRotBody');
  if (rotBody) { const sc = rotBody.closest('.fm-body'), top = sc?.scrollTop; rotBody.innerHTML = _gesHtmlRotinasCorpo(); if (sc) sc.scrollTop = top; }

  document.querySelectorAll('.ges-lk-box').forEach(b => { b.innerHTML = _gesHtmlLinksCorpo(b.dataset.kind, b.dataset.id); });
  const filhasModal = document.getElementById('gesAtvFilhas');
  if (filhasModal) filhasModal.innerHTML = _gesHtmlFilhas(filhasModal.dataset.id, true);
  if (foco) document.querySelector(`[data-k="${foco}"]`)?.focus();
}

function gesSetAba(id) {
  _ges.aba = id;
  if (typeof _vtpPushRoute === 'function') _vtpPushRoute('gestao');
  renderGestao();
}

// Troca o layout ao cruzar o breakpoint (tabela ↔ cards)
window.addEventListener('resize', () => {
  clearTimeout(_ges._rz);
  _ges._rz = setTimeout(() => {
    if (document.getElementById('gesBody') && _ges.D && _gesMobile() !== _ges.mobile) _gesRenderBody();
  }, 150);
});


// ══════════════════════════════════════════════════════════════
// PLANO DE AÇÃO — filtros
// ══════════════════════════════════════════════════════════════

function _gesCarregarFiltros() {
  if (_ges.f) return;
  let f = null;
  try { f = JSON.parse(gesPref('f') || 'null'); } catch (_) { f = null; }
  _ges.f = { ..._GES_F_PADRAO, ...(f || {}), q: '' };
  if (!_GES_ORDENS[_ges.f.ordem]) { _ges.f.ordem = 'status'; _ges.f.dir = 'asc'; }
}
function _gesSalvarFiltros() { const { q, ...resto } = _ges.f; gesPref('f', JSON.stringify(resto)); }
function gesFiltro(k, v) { _ges.f[k] = v; _gesSalvarFiltros(); _gesRenderBody(); }
function gesFiltroStatus(st) {
  const s = new Set(_ges.f.status);
  s.has(st) ? s.delete(st) : s.add(st);
  gesFiltro('status', GES_STATUS.map(x => x.id).filter(x => s.has(x)));
}
function gesBuscar(v) {
  _ges.f.q = v;
  clearTimeout(_ges._bq);
  _ges._bq = setTimeout(_gesRenderBody, 200);
}
function gesLimparFiltros() { _ges.f = { ..._GES_F_PADRAO }; _gesSalvarFiltros(); _gesRenderBody(); }
function _gesFiltrosAtivos() {
  const f = _ges.f, p = _GES_F_PADRAO;
  return !!(f.q || f.pessoa || f.area || f.status.join() !== p.status.join());
}

// Atividades (nível de cima) que passam pelos filtros — exceto status quando semStatus
function _gesAtividadesFiltradas(semStatus = false) {
  const f = _ges.f;
  const pessoa = f.pessoa === 'eu' ? _gesEu() : f.pessoa;
  const q = _gesNorm(f.q.trim());
  return _ges.D.atividades.filter(a => {
    if (a.parent_id || a.arquivado) return false;
    const sub = _gSub(a.subarea_id);
    if (f.area) {
      if (f.area.startsWith('sub:')) { if (a.subarea_id !== f.area.slice(4)) return false; }
      else if (sub?.area !== f.area) return false;
    }
    if (!semStatus && f.status.length && !f.status.includes(a.status)) return false;
    const filhas = _gFilhas(a.id);
    if (pessoa) {
      const envolve = String(a.resp_final_id) === pessoa || _gExec(a.id).includes(pessoa)
        || filhas.some(x => String(x.resp_final_id) === pessoa || _gExec(x.id).includes(pessoa));
      if (!envolve) return false;
    }
    if (q) {
      const txt = _gesNorm([a.descritivo, a.observacao, sub?.nome, ...filhas.map(x => x.descritivo), ..._gLinks(a.id).map(l => l.titulo)].join(' '));
      if (!txt.includes(q)) return false;
    }
    return true;
  });
}

// ── Ordenação: clicar na coluna ordena; clicar de novo inverte ──
const _gesOrdSt   = { em_andamento: 0, a_fazer: 1, concluido: 2 };
const _gesOrdArea = a => GES_AREAS.findIndex(x => x.id === _gSub(a.subarea_id)?.area);
const _gesPrazo   = a => a.prazo || '9999-12-31';
const _gesTxt     = (x, y) => String(x || '').localeCompare(String(y || ''), 'pt-BR');
const _GES_ORDENS = {
  area:   { label: 'Área',        cmp: (a, b) => _gesOrdArea(a) - _gesOrdArea(b) || (_gSub(a.subarea_id)?.ordem ?? 0) - (_gSub(b.subarea_id)?.ordem ?? 0) || _gesOrdSt[a.status] - _gesOrdSt[b.status] },
  sub:    { label: 'Sub-área',    cmp: (a, b) => _gesTxt(_gSub(a.subarea_id)?.nome, _gSub(b.subarea_id)?.nome) || _gesOrdSt[a.status] - _gesOrdSt[b.status] },
  desc:   { label: 'Descritivo',  cmp: (a, b) => _gesTxt(a.descritivo, b.descritivo) },
  status: { label: 'Status',      cmp: (a, b) => _gesOrdSt[a.status] - _gesOrdSt[b.status] || _gesPrazo(a).localeCompare(_gesPrazo(b)) || a.prioridade - b.prioridade },
  resp:   { label: 'Resp. Final', cmp: (a, b) => (!a.resp_final_id) - (!b.resp_final_id) || _gesTxt(_gesNome(a.resp_final_id), _gesNome(b.resp_final_id)) || _gesPrazo(a).localeCompare(_gesPrazo(b)) },
  prazo:  { label: 'Prazo',       cmp: (a, b) => _gesPrazo(a).localeCompare(_gesPrazo(b)) || a.prioridade - b.prioridade },
  prio:   { label: 'Prioridade',  cmp: (a, b) => a.prioridade - b.prioridade || _gesPrazo(a).localeCompare(_gesPrazo(b)) },
};
function _gesOrdenar(lista) {
  const o = _GES_ORDENS[_ges.f.ordem] || _GES_ORDENS.status;
  const s = _ges.f.dir === 'desc' ? -1 : 1;
  return lista.sort((a, b) => s * o.cmp(a, b) || a.posicao - b.posicao);
}
function gesOrdenarPor(k) {
  if (_ges.f.ordem === k) _ges.f.dir = _ges.f.dir === 'desc' ? 'asc' : 'desc';
  else { _ges.f.ordem = k; _ges.f.dir = 'asc'; }
  _gesSalvarFiltros(); _gesRenderBody();
}

// ══════════════════════════════════════════════════════════════
// PLANO DE AÇÃO — tela
// ══════════════════════════════════════════════════════════════

function _gesHtmlPlano() {
  const base = _gesAtividadesFiltradas(true);
  const lista = _gesOrdenar(_gesAtividadesFiltradas());
  return `
    <div class="ges-pa">
      <div class="ges-pa-topo">
        <div>
          <div class="ges-h1">Plano de Ação</div>
          <div class="ges-sub">Demandas da gestão, com responsável e prazo</div>
        </div>
        <button class="btn btn-primary ges-btn" onclick="gesAbrirAtv()">${lc('plus', 16, 'currentColor')} Nova atividade</button>
      </div>
      ${_gesHtmlResumo(base)}
      ${_gesHtmlFiltros()}
      ${_ges.mobile ? '' : _gesHtmlAddRapido()}
      ${lista.length ? (_ges.mobile
          ? `<div class="ges-pa-lista ges-pa-cards">${lista.map(_gesHtmlCard).join('')}</div>`
          : `<div class="ges-pa-lista"><div class="ges-pa-tab">${_gesHtmlCabecalho()}${lista.map(_gesHtmlLinha).join('')}</div></div>`)
        : `<div class="ges-vazio"><div class="ges-vazio-titulo">Nenhuma atividade aqui</div>
            <div class="ges-vazio-texto">${_gesFiltrosAtivos() ? 'Nada passa pelos filtros escolhidos.' : 'Comece pela primeira atividade da gestão.'}</div>
            ${_gesFiltrosAtivos() ? '<button class="btn btn-outline ges-mt" onclick="gesLimparFiltros()">Limpar filtros</button>' : ''}</div>`}
    </div>`;
}

function _gesHtmlResumo(lista) {
  const n = st => lista.filter(a => a.status === st).length;
  const atraso = lista.filter(gesAtrasada).length;
  return `
    <div class="ges-card ges-pa-resumo">
      <div class="ges-pa-resumo-l">
        <span class="ges-pa-resumo-tot">${lista.length} atividade${lista.length === 1 ? '' : 's'}</span>
        ${GES_STATUS.map(s => `<span class="ges-pa-resumo-it" data-st="${s.id}"><i></i>${s.label}: <b>${n(s.id)}</b></span>`).join('')}
        ${atraso ? `<button class="ges-pa-resumo-atraso" onclick="_ges.f.ordem='prazo';_ges.f.dir='asc';_gesSalvarFiltros();_gesRenderBody()"
          title="Ordenar por prazo">${lc('alert-circle', 13, 'currentColor')} ${atraso} atrasada${atraso === 1 ? '' : 's'}</button>` : ''}
      </div>
    </div>`;
}

function _gesHtmlFiltros() {
  const f = _ges.f;
  const pessoas = _gesUsuariosAtivos();
  return `
    <div class="ges-pa-filtros">
      <div class="ges-busca">
        ${lc('search', 15, 'currentColor')}
        <input class="inp" type="search" placeholder="Buscar atividade" value="${_gesEsc(f.q)}" oninput="gesBuscar(this.value)" data-k="busca">
      </div>
      <div class="ges-fchips" role="group" aria-label="Status">
        ${GES_STATUS.map(s => `<button class="ges-fchip ${f.status.includes(s.id) ? 'on' : ''}" data-st="${s.id}"
          aria-pressed="${f.status.includes(s.id)}" onclick="gesFiltroStatus('${s.id}')"><i></i>${s.label}</button>`).join('')}
      </div>
      <select class="inp ges-sel" onchange="gesFiltro('pessoa',this.value)" aria-label="Pessoa">
        <option value="">Todas as pessoas</option>
        <option value="eu" ${f.pessoa === 'eu' ? 'selected' : ''}>Minhas atividades</option>
        ${pessoas.map(u => `<option value="${u.id}" ${String(f.pessoa) === String(u.id) ? 'selected' : ''}>${_gesEsc(u.name)}</option>`).join('')}
      </select>
      <select class="inp ges-sel" onchange="gesFiltro('area',this.value)" aria-label="Área">
        <option value="">Todas as áreas</option>
        ${GES_AREAS.map(a => `<optgroup label="${a.sigla} · ${a.nome}">
          <option value="${a.id}" ${f.area === a.id ? 'selected' : ''}>${a.nome} (toda a área)</option>
          ${_gSubsAtivas(a.id).map(s => `<option value="sub:${s.id}" ${f.area === 'sub:' + s.id ? 'selected' : ''}>${_gesEsc(s.nome)}</option>`).join('')}
        </optgroup>`).join('')}
      </select>
      ${_ges.mobile ? `<select class="inp ges-sel" onchange="_ges.f.dir='asc';gesFiltro('ordem',this.value)" aria-label="Ordenar">
        ${Object.entries(_GES_ORDENS).map(([k, o]) => `<option value="${k}" ${f.ordem === k ? 'selected' : ''}>Ordem: ${o.label}</option>`).join('')}
      </select>` : ''}
      ${_gesFiltrosAtivos() ? `<button class="ges-link" onclick="gesLimparFiltros()">Limpar</button>` : ''}
    </div>`;
}

function _gesSubPadrao() {
  const f = _ges.f.area;
  if (f.startsWith('sub:')) return f.slice(4);
  const ult = gesPref('ultSub');
  if (ult && _gSub(ult)?.ativo && (!f || _gSub(ult).area === f)) return ult;
  return _gSubsAtivas(f || null)[0]?.id || '';
}

function _gesHtmlAddRapido() {
  return `
    <div class="ges-pa-add">
      ${lc('plus', 16, 'currentColor')}
      <select class="inp ges-sel" id="gesAddSub" aria-label="Sub-área da nova atividade">${_gesOptSubareas(_gesSubPadrao())}</select>
      <input class="inp" id="gesAddTxt" placeholder="Nova atividade — descreva e tecle Enter"
        onkeydown="if(event.key==='Enter'){event.preventDefault();gesAddRapido()}">
      <button class="btn btn-outline ges-btn" onclick="gesAddRapido()">Adicionar</button>
    </div>`;
}

async function gesAddRapido() {
  const txt = document.getElementById('gesAddTxt'), sub = document.getElementById('gesAddSub').value;
  if (!txt.value.trim()) { txt.focus(); return; }
  gesPref('ultSub', sub);
  const v = txt.value;
  const ok = await _gesExec(() => gesApi().atividadeSalvar(null, { descritivo: v, subarea_id: sub }), 'Atividade criada');
  if (ok) document.getElementById('gesAddTxt')?.focus();
}

function gesToggleAtv(id) { _ges.abertas.has(id) ? _ges.abertas.delete(id) : _ges.abertas.add(id); _gesRenderBody(); }

function _gesHtmlCabecalho() {
  const f = _ges.f;
  const col = (label, k) => !k ? `<span>${label}</span>`
    : `<button class="ges-pa-ord ${f.ordem === k ? 'on' : ''}" onclick="gesOrdenarPor('${k}')" aria-label="Ordenar por ${label}"
        title="Ordenar por ${label}">${label}${f.ordem === k ? lc(f.dir === 'desc' ? 'arrow-up' : 'arrow-down', 12, 'currentColor') : ''}</button>`;
  return `<div class="ges-pa-row ges-pa-cab">
    <span></span>${col('Área', 'area')}${col('Sub-área', 'sub')}${col('Descritivo', 'desc')}${col('Status', 'status')}${col('Resp. Final', 'resp')}
    ${col('Resp. Execução')}${col('Prazo', 'prazo')}${col('Prior.', 'prio')}${col('Links')}${col('Observação')}<span></span>
  </div>`;
}

// Botões reaproveitados na linha, na subtarefa e no detalhe
function _gesBtnExec(id) {
  const exec = _gExec(id);
  return `<button class="ges-pa-exec" onclick="gesEscolherExec('${id}',this)" aria-label="Resp. Execução"
    title="${exec.length ? exec.map(_gesNome).map(_gesEsc).join(', ') : 'Definir quem executa'}">
    ${exec.length ? `<span class="ges-av-pilha">${exec.slice(0, 3).map(u => _gesAvatar(u, 'ges-av-sm')).join('')}</span>${exec.length > 3 ? `<span class="ges-mais">+${exec.length - 3}</span>` : ''}`
      : `<span class="ges-pa-vazio">${lc('user-plus', 14, 'currentColor')}</span>`}
  </button>`;
}
function _gesBtnLinks(kind, id) {
  const n = (kind === 'atv' ? _gLinks(id) : _gRecursos(id)).length;
  return `<button class="ges-pa-links ${n ? 'tem' : ''}" onclick="event.stopPropagation();gesLinks('${kind}','${id}',this)"
    title="${n ? `${n} link${n === 1 ? '' : 's'}` : 'Adicionar link'}" aria-label="Links">${lc('paperclip', 14, 'currentColor')}${n ? `<b>${n}</b>` : ''}</button>`;
}

// ── Linha (desktop): tudo editável no lugar ──
function _gesHtmlLinha(a) {
  const filhas = _gFilhas(a.id);
  const fConc = filhas.filter(x => x.status === 'concluido').length;
  const aberta = _ges.abertas.has(a.id);
  const tom = _gesTomPrazo(a);
  const sub = _gSub(a.subarea_id);
  return `
    <div class="ges-pa-row ${a.status === 'concluido' ? 'concl' : ''}" data-id="${a.id}">
      <button class="ges-pa-car ${aberta ? 'on' : ''}" onclick="gesToggleAtv('${a.id}')"
        title="${filhas.length ? 'Subtarefas' : 'Adicionar subtarefa'}" aria-expanded="${aberta}">${lc('chevron-right', 16, 'currentColor')}</button>
      ${_gesSelo(sub?.area)}
      <span class="ges-pa-sub" title="${_gesEsc(sub?.nome)}">${_gesEsc(sub?.nome)}</span>
      <span class="ges-pa-desc-w">
        <input class="ges-pa-desc" value="${_gesEsc(a.descritivo)}" title="${_gesEsc(a.descritivo)}" data-k="${a.id}:d" aria-label="Descritivo"
          onkeydown="if(event.key==='Enter')this.blur()" onchange="gesAtvCampo('${a.id}','descritivo',this.value)">
        ${filhas.length ? `<button class="ges-pa-prog ${fConc === filhas.length ? 'ok' : ''}" onclick="gesToggleAtv('${a.id}')"
          title="Subtarefas concluídas">${lc('check-square', 12, 'currentColor')} ${fConc}/${filhas.length}</button>` : ''}
      </span>
      <select class="ges-st" data-st="${a.status}" data-k="${a.id}:s" aria-label="Status"
        onchange="gesAtvCampo('${a.id}','status',this.value)">${_gesOptStatus(a.status)}</select>
      <label class="ges-pa-resp">${_gesAvatar(a.resp_final_id, 'ges-av-sm')}
        <select data-k="${a.id}:r" aria-label="Resp. Final" onchange="gesAtvCampo('${a.id}','resp_final_id',this.value||null)">${_gesOptUsuarios(a.resp_final_id, '—')}</select>
      </label>
      ${_gesBtnExec(a.id)}
      <input type="date" class="ges-pa-prazo" data-tom="${tom}" value="${a.prazo || ''}" data-k="${a.id}:p" aria-label="Prazo"
        title="${tom === 'atraso' ? `Atrasada ${-_gesDias(a.prazo)} dia(s)` : ''}" onchange="gesAtvCampo('${a.id}','prazo',this.value||null)">
      <select class="ges-pr" data-p="${a.prioridade}" data-k="${a.id}:q" aria-label="Prioridade"
        onchange="gesAtvCampo('${a.id}','prioridade',Number(this.value))">${_gesOptPrio(a.prioridade)}</select>
      ${_gesBtnLinks('atv', a.id)}
      <input class="ges-pa-obs" value="${_gesEsc(a.observacao || '')}" placeholder="Adicionar observação…" data-k="${a.id}:o" aria-label="Observação"
        title="${_gesEsc(a.observacao || '')}" onkeydown="if(event.key==='Enter')this.blur()" onchange="gesAtvCampo('${a.id}','observacao',this.value)">
      <button class="ges-pa-abrir" onclick="gesAbrirAtv('${a.id}')" title="Abrir detalhes" aria-label="Abrir detalhes">${lc('more-horizontal', 16, 'currentColor')}</button>
    </div>
    ${aberta ? `<div class="ges-pa-filhas" id="gesFilhas-${a.id}">${_gesHtmlFilhas(a.id)}</div>` : ''}`;
}

// ── Subtarefas (na linha expandida e no detalhe) ──
function _gesHtmlFilhas(id, modal = false) {
  const pai = _gAtv(id);
  if (!pai) return '';
  const filhas = _gFilhas(id);
  return `
    ${filhas.length ? `<div class="ges-sub-row ges-sub-cab"><span></span><span>Subtarefa</span><span>Status</span><span>Responsável</span><span>Execução</span><span>Prazo</span><span>Links</span><span></span></div>` : ''}
    ${filhas.map(s => {
      const tom = _gesTomPrazo(s);
      return `
      <div class="ges-sub-row ${s.status === 'concluido' ? 'concl' : ''}">
        <button class="ges-sub-check ${s.status === 'concluido' ? 'on' : ''}" title="${s.status === 'concluido' ? 'Reabrir' : 'Concluir'}"
          aria-label="Concluir subtarefa" onclick="gesAtvCampo('${s.id}','status','${s.status === 'concluido' ? 'a_fazer' : 'concluido'}')">${lc('check', 13, 'currentColor')}</button>
        <input class="ges-pa-desc" value="${_gesEsc(s.descritivo)}" title="${_gesEsc(s.descritivo)}" data-k="${s.id}:d${modal ? 'm' : ''}" aria-label="Subtarefa"
          onkeydown="if(event.key==='Enter')this.blur()" onchange="gesAtvCampo('${s.id}','descritivo',this.value)">
        <select class="ges-st" data-st="${s.status}" aria-label="Status da subtarefa" onchange="gesAtvCampo('${s.id}','status',this.value)">${_gesOptStatus(s.status)}</select>
        <label class="ges-pa-resp">${_gesAvatar(s.resp_final_id, 'ges-av-sm')}
          <select aria-label="Responsável" onchange="gesAtvCampo('${s.id}','resp_final_id',this.value||null)">${_gesOptUsuarios(s.resp_final_id, '—')}</select>
        </label>
        ${_gesBtnExec(s.id)}
        <input type="date" class="ges-pa-prazo" data-tom="${tom}" value="${s.prazo || ''}" aria-label="Prazo da subtarefa"
          onchange="gesAtvCampo('${s.id}','prazo',this.value||null)">
        ${_gesBtnLinks('atv', s.id)}
        <button class="ges-pa-abrir" title="Excluir subtarefa" aria-label="Excluir subtarefa" onclick="gesExcluirAtv('${s.id}',true)">${lc('x', 15, 'currentColor')}</button>
      </div>`;
    }).join('')}
    <div class="ges-sub-add">
      ${lc('plus', 14, 'currentColor')}
      <input class="inp" placeholder="Adicionar subtarefa e teclar Enter" data-k="${id}:nova${modal ? 'm' : ''}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();gesAddFilha('${id}',this)}">
    </div>`;
}

async function gesAddFilha(paiId, inp) {
  if (!inp.value.trim()) return;
  await _gesExec(() => gesApi().atividadeSalvar(null, { parent_id: paiId, descritivo: inp.value }));
}

async function gesAtvCampo(id, campo, valor) {
  const a = _gAtv(id);
  if (!a) return;
  if (campo === 'descritivo' && !String(valor).trim()) { toast('O descritivo não pode ficar vazio', 'err'); _gesRenderBody(); return; }
  const ok = await _gesExec(() => gesApi().atividadeSalvar(id, { [campo]: valor }));
  // Concluiu a última subtarefa → pergunta se conclui a atividade
  if (ok && campo === 'status' && valor === 'concluido' && a.parent_id) {
    const pai = _gAtv(a.parent_id);
    if (pai && pai.status !== 'concluido' && _gFilhas(pai.id).every(x => x.status === 'concluido')
        && confirm(`Todas as subtarefas de "${pai.descritivo}" estão concluídas.\nConcluir a atividade também?`)) {
      await _gesExec(() => gesApi().atividadeSalvar(pai.id, { status: 'concluido' }), 'Atividade concluída');
    }
  }
}

async function gesExcluirAtv(id, sub = false) {
  const a = _gAtv(id);
  const n = _gFilhas(id).length;
  if (!confirm(sub ? `Excluir a subtarefa "${a.descritivo}"?` : `Excluir a atividade "${a.descritivo}"${n ? ` e suas ${n} subtarefas` : ''}?`)) return false;
  const ok = await _gesExec(() => gesApi().atividadeArquivar(id), sub ? null : 'Atividade excluída');
  if (ok && !sub) document.getElementById('gesAtvModal')?.remove();
  return ok;
}

// ── Popover genérico (abre junto ao botão; fecha ao clicar fora) ──
function _gesPop(chave, btn, html, cls = '') {
  const aberto = document.getElementById('gesPop');
  if (aberto) { const mesmo = aberto.dataset.chave === chave; aberto.remove(); if (mesmo) return null; }
  const pop = document.createElement('div');
  pop.id = 'gesPop'; pop.className = 'ges-pop ' + cls; pop.dataset.chave = chave;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
  const top = r.bottom + 6 + pop.offsetHeight > window.innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6;
  pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
  const fechar = e => {
    if (!document.getElementById('gesPop')) return document.removeEventListener('mousedown', fechar);
    if (!pop.contains(e.target) && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', fechar); }
  };
  setTimeout(() => document.addEventListener('mousedown', fechar), 0);
  return pop;
}

// ── Resp. Execução: lista de marcar que salva na hora (atividade e subtarefa) ──
function gesEscolherExec(id, btn) {
  const sel = new Set(_gExec(id));
  _gesPop('exec:' + id, btn, `<div class="ges-pop-t">Resp. Execução</div>
    <div class="ges-pop-lista">${_gesUsuariosAtivos().map(u => `
      <label class="ges-pop-op"><input type="checkbox" value="${u.id}" ${sel.has(String(u.id)) ? 'checked' : ''}
        onchange="gesExecSalvar('${id}')"> ${_gesAvatar(u.id, 'ges-av-sm')} <span>${_gesEsc(u.name)}</span></label>`).join('')}</div>`);
}
async function gesExecSalvar(id) {
  const ids = [...document.querySelectorAll('#gesPop input:checked')].map(i => i.value);
  await _gesExec(() => gesApi().atividadeSalvar(id, { exec: ids }));
}

// ── Links (entregas da atividade/subtarefa e material do processo) ──
function _gesLinksDe(kind, id) {
  return (kind === 'atv' ? _gLinks(id) : _gRecursos(id)).map(l => ({ tipo: l.tipo, titulo: l.titulo || '', url: l.url }));
}
function _gesHtmlLinksCorpo(kind, id) {
  const l = _gesLinksDe(kind, id);
  return `
    <div class="ges-pop-t">${kind === 'atv' ? 'Entregas e links' : 'Material do processo'}</div>
    <div class="ges-lk-lista">
      ${l.length ? l.map((x, i) => {
        const t = GES_REC_TIPOS.find(y => y.id === x.tipo);
        return `<div class="ges-lk">
          <a href="${_gesEsc(_gesUrl(x.url))}" target="_blank" rel="noopener noreferrer" title="${_gesEsc(x.url)}">
            ${lc(t?.icon || 'link', 15, 'currentColor')}<span>${_gesEsc(x.titulo || x.url.replace(/^https?:\/\//, ''))}</span></a>
          <button class="ges-pa-abrir" title="Remover link" aria-label="Remover link" onclick="gesLinkRemover('${kind}','${id}',${i})">${lc('x', 14, 'currentColor')}</button>
        </div>`;
      }).join('') : `<div class="ges-dica">${kind === 'atv' ? 'Registre o que foi entregue (documento, vídeo, pasta) para a equipe acessar e avaliar.' : 'Nenhum link ainda.'}</div>`}
    </div>
    <div class="ges-lk-add">
      <select class="inp" aria-label="Tipo">${GES_REC_TIPOS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}</select>
      <input class="inp" placeholder="Título (opcional)" aria-label="Título">
      <input class="inp" type="url" placeholder="Cole o link (https://…)" aria-label="Link"
        onkeydown="if(event.key==='Enter'){event.preventDefault();gesLinkAdd('${kind}','${id}',this)}">
      <button class="btn btn-primary btn-sm ges-btn" onclick="gesLinkAdd('${kind}','${id}',this)">Adicionar link</button>
    </div>`;
}
function gesLinks(kind, id, btn) {
  _gesPop(`lk:${kind}:${id}`, btn, `<div class="ges-lk-box" data-kind="${kind}" data-id="${id}">${_gesHtmlLinksCorpo(kind, id)}</div>`, 'ges-pop-lk');
  setTimeout(() => document.querySelector('#gesPop input[type=url]')?.focus(), 30);
}
async function _gesLinksSalvar(kind, id, lista) {
  return _gesExec(() => kind === 'atv' ? gesApi().atividadeLinks(id, lista) : gesApi().processoSalvar(id, { recursos: lista }));
}
async function gesLinkAdd(kind, id, el) {
  const box = el.closest('.ges-lk-box');
  const [tipo, titulo, url] = box.querySelectorAll('.ges-lk-add select, .ges-lk-add input');
  const u = url.value.trim();
  if (!/^https?:\/\/\S+$/i.test(u)) { toast('Cole um link que comece com https://', 'err'); url.focus(); return; }
  const ok = await _gesLinksSalvar(kind, id, [..._gesLinksDe(kind, id), { tipo: tipo.value, titulo: titulo.value.trim(), url: u }]);
  if (ok) document.querySelector(`.ges-lk-box[data-kind="${kind}"][data-id="${id}"] input[type=url]`)?.focus();
}
async function gesLinkRemover(kind, id, i) {
  const l = _gesLinksDe(kind, id);
  if (!confirm(`Remover o link "${l[i].titulo || l[i].url}"?`)) return;
  l.splice(i, 1);
  await _gesLinksSalvar(kind, id, l);
}

// ── Card (mobile) ──
function _gesHtmlCard(a) {
  const filhas = _gFilhas(a.id);
  const fConc = filhas.filter(x => x.status === 'concluido').length;
  const pessoas = [...new Set([a.resp_final_id && String(a.resp_final_id), ..._gExec(a.id)].filter(Boolean))];
  const tom = _gesTomPrazo(a);
  const sub = _gSub(a.subarea_id);
  const nl = _gLinks(a.id).length;
  return `
    <button class="ges-pa-card ${a.status === 'concluido' ? 'concl' : ''}" onclick="gesAbrirAtv('${a.id}')">
      <span class="ges-pa-card-l1">
        ${_gesSelo(sub?.area)}
        <span class="ges-pa-sub">${_gesEsc(sub?.nome)}</span>
        <span class="ges-pr-txt" data-p="${a.prioridade}">P${a.prioridade}</span>
      </span>
      <span class="ges-pa-card-desc">${_gesEsc(a.descritivo)}</span>
      ${a.observacao ? `<span class="ges-pa-card-obs">${_gesEsc(a.observacao)}</span>` : ''}
      <span class="ges-pa-card-l3">
        ${_gesChipStatus(a.status)}
        ${a.prazo ? `<span class="ges-prazo" data-tom="${tom}">${lc('calendar', 12, 'currentColor')} ${_gesData(a.prazo)}${tom === 'atraso' ? ' · atrasada' : ''}</span>` : ''}
        ${filhas.length ? `<span class="ges-prazo">${lc('check-square', 12, 'currentColor')} ${fConc}/${filhas.length}</span>` : ''}
        ${nl ? `<span class="ges-prazo">${lc('paperclip', 12, 'currentColor')} ${nl}</span>` : ''}
        <span class="ges-av-pilha ges-push">${pessoas.length ? pessoas.slice(0, 3).map(id => _gesAvatar(id, 'ges-av-sm')).join('') : _gesAvatar(null, 'ges-av-sm')}</span>
      </span>
    </button>`;
}

// ══════════════════════════════════════════════════════════════
// DETALHE / NOVA ATIVIDADE (modal)
// ══════════════════════════════════════════════════════════════

function gesAbrirAtv(id, pre = {}) {
  document.getElementById('gesPop')?.remove();
  const a = id ? _gAtv(id) : { descritivo: '', subarea_id: _gesSubPadrao(), status: 'a_fazer', prioridade: 3, prazo: null, resp_final_id: null, observacao: '', ...pre };
  // Ligações de origem (processo ou rotina do balanço) só valem na criação
  _ges.atvExtra = id ? null : { processo_id: pre.processo_id, rotina_origem_id: pre.rotina_origem_id, balanco_origem_id: pre.balanco_origem_id };
  const exec = new Set(id ? _gExec(id) : []);
  const sub = _gSub(a.subarea_id);
  const corpo = `
    <div class="ges-atv-form">
      <label class="field"><span class="ges-lbl">Sub-área</span>
        <select class="inp" id="gaSub">${_gesOptSubareas(a.subarea_id)}</select></label>
      <label class="field"><span class="ges-lbl">Descritivo</span>
        <textarea class="inp ges-ta" id="gaDesc" rows="2" placeholder="O que precisa ser feito">${_gesEsc(a.descritivo)}</textarea></label>
      <div class="field"><span class="ges-lbl">Status</span>
        <div class="ges-seg ges-seg-full" id="gaSt">${GES_STATUS.map(s => `<button type="button" class="${a.status === s.id ? 'on' : ''}" data-v="${s.id}"
          onclick="_gesSeg(this)">${s.label}</button>`).join('')}</div></div>
      <div class="ges-atv-2">
        <label class="field"><span class="ges-lbl">Resp. Final</span>
          <select class="inp" id="gaResp">${_gesOptUsuarios(a.resp_final_id)}</select></label>
        <label class="field"><span class="ges-lbl">Prazo</span>
          <input class="inp" type="date" id="gaPrazo" value="${a.prazo || ''}"></label>
      </div>
      <div class="field"><span class="ges-lbl">Prioridade</span>
        <div class="ges-seg ges-seg-full" id="gaPrio">${GES_PRIO.map(p => `<button type="button" class="${Number(a.prioridade) === p.id ? 'on' : ''}" data-v="${p.id}"
          onclick="_gesSeg(this)">${p.nome}</button>`).join('')}</div></div>
      <div class="field"><span class="ges-lbl">Resp. Execução</span>
        <div class="ges-exec-grid" id="gaExec">${_gesUsuariosAtivos().map(u => `
          <label class="ges-pop-op"><input type="checkbox" value="${u.id}" ${exec.has(String(u.id)) ? 'checked' : ''}>
            ${_gesAvatar(u.id, 'ges-av-sm')} <span>${_gesEsc(u.name)}</span></label>`).join('')}</div></div>
      <label class="field"><span class="ges-lbl">Observação</span>
        <textarea class="inp ges-ta" id="gaObs" rows="2" placeholder="Contexto, links, combinados">${_gesEsc(a.observacao || '')}</textarea></label>
      <div class="field"><span class="ges-lbl">Subtarefas</span>
        ${id ? `<div class="ges-pa-filhas ges-pa-filhas-modal" id="gesAtvFilhas" data-id="${id}">${_gesHtmlFilhas(id, true)}</div>`
          : '<div class="ges-dica">Salve a atividade para adicionar subtarefas.</div>'}</div>
      <div class="field"><span class="ges-lbl">Entregas e links</span>
        ${id ? `<div class="ges-lk-box ges-lk-inline" data-kind="atv" data-id="${id}">${_gesHtmlLinksCorpo('atv', id)}</div>`
          : '<div class="ges-dica">Salve a atividade para adicionar links.</div>'}</div>
      ${a.processo_id && _gProc(a.processo_id) ? `<div class="ges-dica">${lc('layers', 13, 'currentColor')} Ligada ao processo <b>${_gesEsc(_gProc(a.processo_id).nome)}</b></div>` : ''}
      ${a.rotina_origem_id && _gRotina(a.rotina_origem_id) ? `<div class="ges-dica">${lc('activity', 13, 'currentColor')} Nasceu do balanço${(() => { const b = (_ges.D.balancos || []).find(x => x.id === a.balanco_origem_id); return b ? ' de ' + _gesMesLabel(b.mes) : ''; })()}: <b>${_gesEsc(_gRotina(a.rotina_origem_id).titulo)}</b></div>` : ''}

      ${id ? `<button class="ges-link ges-link-perigo" onclick="gesExcluirAtv('${id}')">${lc('trash', 13, 'currentColor')} Excluir atividade</button>` : ''}
    </div>`;
  _gesModal('gesAtvModal', id ? `${_gesSelo(sub?.area)} ${id ? 'Atividade' : ''}` : 'Nova atividade', corpo, `gesSalvarAtv(${id ? `'${id}'` : 'null'})`, id ? 'Salvar' : 'Criar atividade', 620);
  if (!id) setTimeout(() => document.getElementById('gaDesc')?.focus(), 50);
}

function _gesSeg(btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); }
const _gesSegVal = id => document.querySelector(`#${id} button.on`)?.dataset.v;

async function gesSalvarAtv(id) {
  const g = k => document.getElementById(k);
  const d = {
    subarea_id: g('gaSub').value,
    descritivo: g('gaDesc').value,
    status: _gesSegVal('gaSt'),
    resp_final_id: g('gaResp').value || null,
    prazo: g('gaPrazo').value || null,
    prioridade: Number(_gesSegVal('gaPrio')),
    observacao: g('gaObs').value,
    exec: [...document.querySelectorAll('#gaExec input:checked')].map(i => i.value),
  };
  if (!id && _ges.atvExtra) Object.entries(_ges.atvExtra).forEach(([k, v]) => { if (v) d[k] = v; });
  if (!d.descritivo.trim()) { toast('Descreva a atividade', 'err'); g('gaDesc').focus(); return; }
  if (!id) gesPref('ultSub', d.subarea_id);
  const ok = await _gesExec(() => gesApi().atividadeSalvar(id, d), id ? 'Atividade salva' : 'Atividade criada');
  if (ok) g('gesAtvModal')?.remove();
}

// ══════════════════════════════════════════════════════════════
// PROCESSOS — quadro área → sub-área → cards
// ══════════════════════════════════════════════════════════════

const GES_PROC_STATUS = [
  { id: 'a_construir',   label: 'A construir'   },
  { id: 'em_construcao', label: 'Em construção' },
  { id: 'implantado',    label: 'Implantado'    },
  { id: 'em_revisao',    label: 'Em revisão'    },
];
const GES_REC_TIPOS = [
  { id: 'pasta', label: 'Pasta / documento', icon: 'folder' },
  { id: 'video', label: 'Vídeo',             icon: 'video'  },
  { id: 'link',  label: 'Outro link',        icon: 'link'   },
];
const _gProc     = id => (_ges.D.processos || []).find(p => p.id === id);
const _gRecursos = id => (_ges.D.recursos || []).filter(r => r.processo_id === id).sort((a, b) => a.ordem - b.ordem);
const _gesProcF  = () => (_ges.pf ||= { q: '', status: [] });
// Só http(s): evita link javascript: vindo de dado salvo
const _gesUrl = u => /^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#';

function gesProcFiltroStatus(st) {
  const f = _gesProcF(), s = new Set(f.status);
  s.has(st) ? s.delete(st) : s.add(st);
  f.status = GES_PROC_STATUS.map(x => x.id).filter(x => s.has(x));
  _gesRenderBody();
}
function gesProcBuscar(v) { _gesProcF().q = v; clearTimeout(_ges._bp); _ges._bp = setTimeout(_gesRenderBody, 200); }

function _gesProcVisiveis() {
  const f = _gesProcF(), q = _gesNorm(f.q.trim());
  return (_ges.D.processos || []).filter(p => !p.arquivado
    && (!f.status.length || f.status.includes(p.status))
    && (!q || _gesNorm(p.nome + ' ' + (p.descricao || '')).includes(q)));
}

function _gesHtmlProcessos() {
  const todos = (_ges.D.processos || []).filter(p => !p.arquivado);
  const vis = _gesProcVisiveis();
  const f = _gesProcF();
  const n = st => todos.filter(p => p.status === st).length;
  const impl = n('implantado');
  return `
    <div class="ges-proc">
      <div class="ges-pa-topo">
        <div>
          <div class="ges-h1">Processos</div>
          <div class="ges-sub">Os processos da loja por área, o status de cada um e onde está o material</div>
        </div>
        <button class="btn btn-primary ges-btn" onclick="gesAbrirProc()">${lc('plus', 16, 'currentColor')} Novo processo</button>
      </div>
      <div class="ges-card ges-pa-resumo">
        <div class="ges-pa-resumo-l">
          <span class="ges-pa-resumo-tot">${todos.length} processos</span>
          ${GES_PROC_STATUS.map(s => `<span class="ges-pa-resumo-it" data-st="${s.id}"><i></i>${s.label}: <b>${n(s.id)}</b></span>`).join('')}
          <span class="ges-pa-resumo-pct">${todos.length ? Math.round(impl / todos.length * 100) : 0}% implantado</span>
        </div>
        <div class="ges-pa-stack">
          ${['implantado', 'em_revisao', 'em_construcao'].map(st => `<span data-st="${st}" style="width:${todos.length ? (n(st) / todos.length * 100).toFixed(1) : 0}%"></span>`).join('')}
        </div>
      </div>
      <div class="ges-pa-filtros">
        <div class="ges-busca">
          ${lc('search', 15, 'currentColor')}
          <input class="inp" type="search" placeholder="Buscar processo" value="${_gesEsc(f.q)}" oninput="gesProcBuscar(this.value)" data-k="pbusca">
        </div>
        <div class="ges-fchips ges-fchips-4" role="group" aria-label="Status">
          ${GES_PROC_STATUS.map(s => `<button class="ges-fchip ${f.status.includes(s.id) ? 'on' : ''}" data-st="${s.id}"
            aria-pressed="${f.status.includes(s.id)}" onclick="gesProcFiltroStatus('${s.id}')"><i></i>${s.label}</button>`).join('')}
        </div>
        ${f.status.length || f.q ? `<button class="ges-link" onclick="_ges.pf=null;_gesRenderBody()">Limpar</button>` : ''}
      </div>
      <div class="ges-pr-ir">
        <span class="ges-muted">Ir para</span>
        ${GES_AREAS.map(a => `<button class="ges-fchip on" data-area="${a.id}" onclick="document.getElementById('gesPrA-${a.id}')?.scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'})">${_gesSelo(a.id)} ${a.nome}</button>`).join('')}
      </div>
      <div class="ges-pr-areas">
        ${GES_AREAS.map(ar => _gesHtmlProcArea(ar, vis)).join('')}
      </div>
    </div>`;
}

function _gesHtmlProcArea(ar, vis) {
  const subs = _gSubsAtivas(ar.id);
  const filtrando = _gesProcF().status.length || _gesProcF().q;
  const daArea = vis.filter(p => _gSub(p.subarea_id)?.area === ar.id);
  if (filtrando && !daArea.length) return '';
  return `
    <section class="ges-pr-area" data-area="${ar.id}" id="gesPrA-${ar.id}" style="--n:${subs.length}">
      <div class="ges-pr-area-h">${_gesSelo(ar.id)} ${ar.nome}</div>
      <div class="ges-pr-cols">
        ${subs.map(s => {
          const procs = daArea.filter(p => p.subarea_id === s.id).sort((a, b) => a.ordem - b.ordem);
          return `
          <div class="ges-pr-col">
            <div class="ges-pr-col-h"><span>${_gesEsc(s.nome)}</span><span class="ges-pa-area-qtd">${procs.length}</span></div>
            <div class="ges-pr-cards">
              ${procs.map(_gesHtmlProcCard).join('') || (filtrando ? '' : '<div class="ges-pr-vazio">Nenhum processo</div>')}
            </div>
            <div class="ges-pr-add">
              <input class="inp" placeholder="+ Adicionar processo" data-k="padd:${s.id}" aria-label="Novo processo em ${_gesEsc(s.nome)}"
                onkeydown="if(event.key==='Enter'){event.preventDefault();gesProcRapido('${s.id}',this)}">
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function _gesHtmlProcCard(p) {
  const rec = _gRecursos(p.id);
  const st = GES_PROC_STATUS.find(x => x.id === p.status);
  const atv = _ges.D.atividades.filter(a => a.processo_id === p.id && !a.arquivado && !a.parent_id && a.status !== 'concluido').length;
  return `
    <div class="ges-pr-card" data-st="${p.status}" role="button" tabindex="0"
      onclick="gesAbrirProc('${p.id}')" onkeydown="if(event.key==='Enter'&&event.target===this)gesAbrirProc('${p.id}')">
      <div class="ges-pr-card-nome">${_gesEsc(p.nome)}</div>
      <div class="ges-pr-card-l2">
        <span class="ges-pr-card-st">${st?.label || p.status}</span>
        ${atv ? `<span class="ges-mini" title="Atividades abertas no Plano">${lc('clipboard-check', 11, 'currentColor')} ${atv}</span>` : ''}
        <span class="ges-pr-recs">
          ${rec.map(r => `<a class="ges-pr-rec" href="${_gesEsc(_gesUrl(r.url))}" target="_blank" rel="noopener noreferrer"
            title="${_gesEsc(r.titulo || GES_REC_TIPOS.find(t => t.id === r.tipo)?.label)}" onclick="event.stopPropagation()">
            ${lc(GES_REC_TIPOS.find(t => t.id === r.tipo)?.icon || 'link', 14, 'currentColor')}</a>`).join('')}
          <button class="ges-pr-rec ges-pr-rec-add" onclick="event.stopPropagation();gesLinks('proc','${p.id}',this)"
            title="Adicionar link" aria-label="Adicionar link">${lc(rec.length ? 'plus' : 'paperclip', 14, 'currentColor')}</button>
        </span>
      </div>
    </div>`;
}

async function gesProcRapido(subId, inp) {
  if (!inp.value.trim()) return;
  await _gesExec(() => gesApi().processoSalvar(null, { subarea_id: subId, nome: inp.value }), 'Processo criado');
}

// ── Detalhe do processo ──
function gesAbrirProc(id) {
  const p = id ? _gProc(id) : { nome: '', descricao: '', status: 'a_construir', subarea_id: _gesSubPadrao(), responsavel_id: null, revisado_em: null };
  const rec = id ? _gRecursos(id) : [];
  const atvs = id ? _ges.D.atividades.filter(a => a.processo_id === id && !a.arquivado && !a.parent_id) : [];
  const corpo = `
    <div class="ges-atv-form">
      <label class="field"><span class="ges-lbl">Nome do processo</span>
        <input class="inp" id="gpNome" value="${_gesEsc(p.nome)}" placeholder="Ex.: Recebimento de mercadorias"></label>
      <label class="field"><span class="ges-lbl">Sub-área</span>
        <select class="inp" id="gpSub">${_gesOptSubareas(p.subarea_id)}</select></label>
      <div class="field"><span class="ges-lbl">Status</span>
        <div class="ges-seg ges-seg-full ges-seg-wrap" id="gpSt">${GES_PROC_STATUS.map(s => `<button type="button" class="${p.status === s.id ? 'on' : ''}" data-v="${s.id}"
          onclick="_gesSeg(this)">${s.label}</button>`).join('')}</div></div>
      <div class="ges-atv-2">
        <label class="field"><span class="ges-lbl">Dono do processo</span>
          <select class="inp" id="gpResp">${_gesOptUsuarios(p.responsavel_id)}</select></label>
        <label class="field"><span class="ges-lbl">Última revisão</span>
          <input class="inp" type="date" id="gpRev" value="${p.revisado_em || ''}"></label>
      </div>
      <label class="field"><span class="ges-lbl">Descrição</span>
        <textarea class="inp ges-ta" id="gpDesc" rows="3" placeholder="Para que serve, quando é feito, quem executa">${_gesEsc(p.descricao || '')}</textarea></label>
      <div class="field"><span class="ges-lbl">Material (links)</span>
        ${id ? `<div class="ges-lk-box ges-lk-inline" data-kind="proc" data-id="${id}">${_gesHtmlLinksCorpo('proc', id)}</div>`
          : `<div class="ges-rec-lista" id="gpRec">${rec.map(_gesHtmlRecLinha).join('')}</div>
             <button type="button" class="ges-link" onclick="gesRecNovo()">${lc('plus', 13, 'currentColor')} Adicionar link</button>`}
        <div class="ges-dica">Pasta do Drive, vídeo do YouTube ou qualquer link. Confira se o compartilhamento está liberado para a equipe.</div>
      </div>
      ${id ? `
      <div class="field"><span class="ges-lbl">Atividades no Plano de Ação</span>
        ${atvs.length ? `<div class="ges-pr-atvs">${atvs.map(a => `<button type="button" class="ges-pr-atv" onclick="gesIrAtividade('${a.id}')">
            ${_gesChipStatus(a.status)}<span>${_gesEsc(a.descritivo)}</span></button>`).join('')}</div>` : ''}
        <button type="button" class="ges-link" onclick="gesProcCriarAtv('${id}')">${lc('clipboard-check', 13, 'currentColor')} Criar atividade para este processo</button>
      </div>
      <button class="ges-link ges-link-perigo" onclick="gesExcluirProc('${id}')">${lc('trash', 13, 'currentColor')} Excluir processo</button>` : ''}
    </div>`;
  const sub = _gSub(p.subarea_id);
  _gesModal('gesProcModal', id ? `${_gesSelo(sub?.area)} Processo` : 'Novo processo', corpo, `gesSalvarProc(${id ? `'${id}'` : 'null'})`, id ? 'Salvar' : 'Criar processo', 620);
  if (!id) setTimeout(() => document.getElementById('gpNome')?.focus(), 50);
}

function _gesHtmlRecLinha(r = {}) {
  return `
    <div class="ges-rec-linha">
      <select class="inp" aria-label="Tipo">${GES_REC_TIPOS.map(t => `<option value="${t.id}" ${r.tipo === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
      <input class="inp" placeholder="Título (opcional)" value="${_gesEsc(r.titulo || '')}" aria-label="Título">
      <input class="inp" type="url" placeholder="https://…" value="${_gesEsc(r.url || '')}" aria-label="Link">
      ${r.url ? `<a class="ges-pa-abrir" href="${_gesEsc(_gesUrl(r.url))}" target="_blank" rel="noopener noreferrer" title="Abrir">${lc('external-link', 15, 'currentColor')}</a>` : '<span></span>'}
      <button type="button" class="ges-pa-abrir" title="Remover link" aria-label="Remover link" onclick="this.closest('.ges-rec-linha').remove()">${lc('x', 15, 'currentColor')}</button>
    </div>`;
}
function gesRecNovo() {
  const l = document.getElementById('gpRec');
  l.insertAdjacentHTML('beforeend', _gesHtmlRecLinha());
  l.lastElementChild.querySelector('input[type=url]').focus();
}

async function gesSalvarProc(id) {
  const g = k => document.getElementById(k);
  const recursos = !g('gpRec') ? undefined : [...document.querySelectorAll('#gpRec .ges-rec-linha')].map(l => {
    const [tipo, titulo, url] = l.querySelectorAll('select, input');
    return { tipo: tipo.value, titulo: titulo.value.trim(), url: url.value.trim() };
  }).filter(r => r.url || r.titulo);
  const d = { nome: g('gpNome').value, subarea_id: g('gpSub').value, status: _gesSegVal('gpSt'), responsavel_id: g('gpResp').value || null,
    revisado_em: g('gpRev').value || null, descricao: g('gpDesc').value };
  if (recursos) d.recursos = recursos;
  if (!d.nome.trim()) { toast('Dê um nome ao processo', 'err'); g('gpNome').focus(); return; }
  const ok = await _gesExec(() => gesApi().processoSalvar(id, d), id ? 'Processo salvo' : 'Processo criado');
  if (ok) g('gesProcModal')?.remove();
}

async function gesExcluirProc(id) {
  if (!confirm(`Excluir o processo "${_gProc(id).nome}"? As atividades ligadas a ele continuam no Plano.`)) return;
  if (await _gesExec(() => gesApi().processoArquivar(id), 'Processo excluído')) document.getElementById('gesProcModal')?.remove();
}

function gesProcCriarAtv(id) {
  const p = _gProc(id);
  document.getElementById('gesProcModal')?.remove();
  const verbo = { a_construir: 'Construir', em_construcao: 'Concluir', em_revisao: 'Revisar' }[p.status] || 'Atualizar';
  gesAbrirAtv(null, { descritivo: `${verbo} o processo: ${p.nome}`, subarea_id: p.subarea_id, processo_id: p.id, resp_final_id: p.responsavel_id });
}

function gesIrAtividade(id) {
  document.getElementById('gesProcModal')?.remove();
  _ges.aba = 'plano';
  if (typeof _vtpPushRoute === 'function') _vtpPushRoute('gestao');
  renderGestao().then(() => gesAbrirAtv(id));
}

// ══════════════════════════════════════════════════════════════
// BALANÇO — rotinas-chave por sub-área, Sim / Não por mês
// Nota da sub-área = % de "Sim" · área = média das sub-áreas
// · Gestão = média das áreas. Faixas: ≥85 saudável · 70–84 atenção · <70 crítico
// ══════════════════════════════════════════════════════════════

const GES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const GES_MESES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const GES_FAIXAS = { ok: 'Saudável', atencao: 'Atenção', critico: 'Crítico' };

function gesFaixa(n) { return n == null ? '' : n >= 85 ? 'ok' : n >= 70 ? 'atencao' : 'critico'; }
function _gesMesAtual() { return gesHoje().slice(0, 7) + '-01'; }
function _gesMesSomar(mes, n) { const [a, m] = mes.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function _gesMesLabel(mes, curto = false) { const [a, m] = mes.split('-').map(Number); return curto ? `${GES_MESES_C[m - 1]}/${String(a).slice(2)}` : `${GES_MESES[m - 1]} ${a}`; }

const _gBal      = mes => (_ges.D.balancos || []).find(b => b.mes === mes);
const _gAvals    = bid => (_ges.D.avals || []).filter(v => v.balanco_id === bid);
const _gAval     = (bid, rid) => (_ges.D.avals || []).find(v => v.balanco_id === bid && v.rotina_id === rid);
const _gRotina   = id => (_ges.D.rotinas || []).find(r => r.id === id);

// Rotinas que entram no balanço: fechado = o que foi registrado; rascunho = ativas + as que já têm resposta
function _gesRotinasDoBal(bal) {
  const av = bal ? _gAvals(bal.id) : [];
  if (bal?.status === 'fechado') return av.map(v => ({ id: v.rotina_id, titulo: v.rotina_titulo, subarea_id: v.subarea_id, processo_id: _gRotina(v.rotina_id)?.processo_id }));
  const ids = new Set(av.map(v => v.rotina_id));
  return (_ges.D.rotinas || []).filter(r => r.ativo || ids.has(r.id)).sort((a, b) => a.ordem - b.ordem);
}

// Notas de um balanço: { sub: {id: n}, area: {id: n}, gestao: n }
function gesNotas(bal) {
  const r = { sub: {}, area: {}, gestao: null };
  if (!bal) return r;
  const av = _gAvals(bal.id).filter(v => v.resposta === 'sim' || v.resposta === 'nao');
  const media = l => l.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : null;
  _ges.D.subareas.forEach(s => {
    const l = av.filter(v => v.subarea_id === s.id);
    if (l.length) r.sub[s.id] = Math.round(l.filter(v => v.resposta === 'sim').length / l.length * 100);
  });
  GES_AREAS.forEach(a => {
    const n = media(_ges.D.subareas.filter(s => s.area === a.id && r.sub[s.id] != null).map(s => r.sub[s.id]));
    if (n != null) r.area[a.id] = n;
  });
  r.gestao = media(Object.values(r.area));
  return r;
}

function _gesBalSt() { return (_ges.bal ||= { mes: _gesMesAtual(), vis: 'mes', ano: Number(gesHoje().slice(0, 4)) }); }
function gesBalMes(n) {
  const st = _gesBalSt(), novo = _gesMesSomar(st.mes, n);
  if (novo > _gesMesAtual()) return;
  st.mes = novo; _gesRenderBody();
}
function gesBalVis(v) { _gesBalSt().vis = v; _gesRenderBody(); }
function gesBalAno(n) { const st = _gesBalSt(); st.ano = Math.min(Number(gesHoje().slice(0, 4)), st.ano + n); _gesRenderBody(); }
function gesBalIrMes(mes) { const st = _gesBalSt(); st.mes = mes; st.vis = 'mes'; _gesRenderBody(); }

function _gesDelta(atual, ant) {
  if (atual == null || ant == null) return '';
  const d = atual - ant;
  if (!d) return '<span class="ges-delta">= mês anterior</span>';
  return `<span class="ges-delta" data-sinal="${d > 0 ? 'mais' : 'menos'}">${lc(d > 0 ? 'arrow-up' : 'arrow-down', 11, 'currentColor')} ${Math.abs(d)} pts</span>`;
}
function _gesNota(n, grande = false) {
  return n == null ? `<span class="ges-nota ${grande ? 'ges-nota-g' : ''}" data-faixa="">—</span>`
    : `<span class="ges-nota ${grande ? 'ges-nota-g' : ''}" data-faixa="${gesFaixa(n)}">${n}</span>`;
}

function _gesHtmlBalanco() {
  const st = _gesBalSt();
  return `
    <div class="ges-bl">
      <div class="ges-pa-topo">
        <div>
          <div class="ges-h1">Balanço da Gestão</div>
          <div class="ges-sub">As rotinas-chave de cada sub-área foram feitas do jeito certo no mês?</div>
        </div>
        <div class="ges-bl-acoes">
          <div class="ges-seg">
            <button class="${st.vis === 'mes' ? 'on' : ''}" onclick="gesBalVis('mes')">Mês</button>
            <button class="${st.vis === 'ano' ? 'on' : ''}" onclick="gesBalVis('ano')">Ano</button>
          </div>
          <button class="btn btn-outline ges-btn" onclick="gesAbrirRotinas()">${lc('list', 15, 'currentColor')} Rotinas</button>
        </div>
      </div>
      ${st.vis === 'mes' ? _gesHtmlBalMes() : _gesHtmlBalAno()}
    </div>`;
}

// ── Visão do mês ──
function _gesHtmlBalMes() {
  const st = _gesBalSt();
  const bal = _gBal(st.mes);
  const ehAtual = st.mes === _gesMesAtual();
  const nav = `
    <div class="ges-bl-nav">
      <button class="ges-pa-abrir" onclick="gesBalMes(-1)" aria-label="Mês anterior">${lc('chevron-left', 18, 'currentColor')}</button>
      <span class="ges-bl-nav-mes">${_gesMesLabel(st.mes)}</span>
      <button class="ges-pa-abrir" onclick="gesBalMes(1)" aria-label="Próximo mês" ${ehAtual ? 'disabled' : ''}>${lc('chevron-right', 18, 'currentColor')}</button>
      ${bal ? `<span class="ges-st-chip" data-st="${bal.status === 'fechado' ? 'concluido' : 'em_andamento'}">${bal.status === 'fechado' ? 'Fechado' : 'Em avaliação'}</span>` : ''}
    </div>`;
  if (!bal) {
    const semRotinas = !(_ges.D.rotinas || []).some(r => r.ativo);
    return nav + `<div class="ges-vazio">
      <div class="ges-vazio-icone">${lc('activity', 22, 'currentColor')}</div>
      <div class="ges-vazio-titulo">Balanço de ${_gesMesLabel(st.mes)} ainda não começou</div>
      <div class="ges-vazio-texto">${semRotinas ? 'Cadastre as rotinas-chave de cada sub-área para começar.' : 'Avaliem juntos cada rotina-chave: foi feita do jeito certo no mês?'}</div>
      ${semRotinas ? `<button class="btn btn-primary ges-btn ges-mt" onclick="gesAbrirRotinas()">Cadastrar rotinas</button>`
        : `<button class="btn btn-primary ges-btn ges-mt" onclick="gesBalAbrir('${st.mes}')">Começar balanço</button>`}
    </div>`;
  }
  const fechado = bal.status === 'fechado';
  const rot = _gesRotinasDoBal(bal);
  const av = _gAvals(bal.id);
  const resp = rot.filter(r => av.some(v => v.rotina_id === r.id && v.resposta)).length;
  const naoSemObs = av.filter(v => v.resposta === 'nao' && !String(v.observacao || '').trim()).length;
  const notas = gesNotas(bal), ant = gesNotas(_gBal(_gesMesSomar(st.mes, -1)));
  const balAnt = _gBal(_gesMesSomar(st.mes, -1));
  const acoesAnt = balAnt ? _ges.D.atividades.filter(a => a.balanco_origem_id === balAnt.id && !a.arquivado && !a.parent_id) : [];

  return nav + `
    <div class="ges-bl-resumo">
      <div class="ges-card ges-bl-gestao" data-faixa="${gesFaixa(notas.gestao)}">
        <div class="ges-bl-lbl">Nota da Gestão${fechado ? '' : ' · parcial'}</div>
        <div class="ges-bl-gestao-n">${_gesNota(notas.gestao, true)}
          <span>${notas.gestao != null ? `<b>${GES_FAIXAS[gesFaixa(notas.gestao)]}</b>` : 'Sem respostas ainda'}${_gesDelta(notas.gestao, ant.gestao)}</span>
        </div>
        <div class="ges-bl-prog"><span class="ges-pa-stack"><span data-st="concluido" style="width:${rot.length ? resp / rot.length * 100 : 0}%"></span></span>
          ${resp} de ${rot.length} rotinas respondidas</div>
        ${fechado ? `<div class="ges-dica">Fechado em ${new Date(bal.fechado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Maceio' })}${bal.fechado_por ? ' por ' + _gesEsc(_gesPrimeiroNome(bal.fechado_por)) : ''}. Não pode mais ser alterado.</div>`
          : `<button class="btn btn-primary ges-btn" onclick="gesBalFechar('${bal.id}')" ${resp < rot.length || naoSemObs ? 'data-pendente="1"' : ''}>${lc('lock', 14, 'currentColor')} Fechar balanço</button>`}
      </div>
      ${GES_AREAS.map(a => `
        <button class="ges-card ges-bl-area" data-area="${a.id}" onclick="document.getElementById('gesBlA-${a.id}')?.scrollIntoView({behavior:'smooth',block:'start'})">
          <span class="ges-bl-area-h">${_gesSelo(a.id)} ${a.nome}</span>
          <span class="ges-bl-area-n">${_gesNota(notas.area[a.id])}${_gesDelta(notas.area[a.id], ant.area[a.id])}</span>
        </button>`).join('')}
    </div>
    ${acoesAnt.length ? `
      <div class="ges-card ges-bl-ant">
        <div class="ges-bl-lbl">${lc('clipboard-check', 13, 'currentColor')} Atividades que nasceram do balanço de ${_gesMesLabel(balAnt.mes)}</div>
        <div class="ges-pr-atvs">${acoesAnt.map(a => `<button type="button" class="ges-pr-atv" onclick="gesIrAtividade('${a.id}')">
          ${_gesChipStatus(a.status)}<span>${_gesEsc(a.descritivo)}</span>${a.prazo ? `<span class="ges-prazo ges-push" data-tom="${_gesTomPrazo(a)}">${_gesData(a.prazo)}</span>` : ''}</button>`).join('')}</div>
      </div>` : ''}
    ${GES_AREAS.map(a => {
      const subs = _ges.D.subareas.filter(s => s.area === a.id).sort((x, y) => x.ordem - y.ordem)
        .map(s => ({ s, rs: rot.filter(r => r.subarea_id === s.id) })).filter(x => x.rs.length);
      if (!subs.length) return '';
      return `
      <section class="ges-pa-area ges-bl-sec" data-area="${a.id}" id="gesBlA-${a.id}">
        <div class="ges-pa-area-h ges-bl-sec-h">${_gesSelo(a.id)}<span class="ges-pa-area-nome">${a.nome}</span>
          <span class="ges-push">${_gesNota(notas.area[a.id])}</span></div>
        ${subs.map(({ s, rs }) => `
          <div class="ges-bl-sub">
            <div class="ges-bl-sub-h"><span>${_gesEsc(s.nome)}</span>${_gesNota(notas.sub[s.id])}</div>
            ${rs.map(r => _gesHtmlBalRotina(bal, r, fechado)).join('')}
          </div>`).join('')}
      </section>`;
    }).join('')}`;
}

function _gesHtmlBalRotina(bal, r, fechado) {
  const v = _gAval(bal.id, r.id);
  const resp = v?.resposta || '';
  const atv = _ges.D.atividades.find(a => a.rotina_origem_id === r.id && a.balanco_origem_id === bal.id && !a.arquivado);
  const semObs = resp === 'nao' && !String(v?.observacao || '').trim();
  return `
    <div class="ges-bl-rot" data-resp="${resp}">
      <div class="ges-bl-rot-t">
        <span>${_gesEsc(r.titulo)}</span>
      </div>
      <div class="ges-bl-resp" role="group" aria-label="Resposta">
        ${[['sim', 'check', 'Sim'], ['nao', 'x', 'Não']].map(([k, ic, t]) => `
          <button class="${resp === k ? 'on' : ''}" data-v="${k}" aria-pressed="${resp === k}" ${fechado ? 'disabled' : ''}
            onclick="gesBalResp('${bal.id}','${r.id}','${resp === k ? '' : k}')">${ic ? lc(ic, 14, 'currentColor') : ''} ${t}</button>`).join('')}
      </div>
      ${resp === 'nao' ? `
        <div class="ges-bl-nao">
          ${fechado ? `<div class="ges-bl-obs-txt">${_gesEsc(v.observacao || '—')}</div>`
            : `<textarea class="inp ges-ta ${semObs ? 'ges-inp-erro' : ''}" rows="2" data-k="obs:${r.id}" placeholder="O que aconteceu? (obrigatório)"
                onchange="gesBalObs('${bal.id}','${r.id}',this.value)">${_gesEsc(v.observacao || '')}</textarea>`}
          ${atv ? `<button class="ges-pr-atv" onclick="gesIrAtividade('${atv.id}')">${_gesChipStatus(atv.status)}<span>${_gesEsc(atv.descritivo)}</span></button>`
            : `<button class="btn btn-outline btn-sm ges-btn" onclick="gesBalCriarAtv('${bal.id}','${r.id}')">${lc('plus', 14, 'currentColor')} Criar atividade no Plano</button>`}
        </div>` : ''}
    </div>`;
}

async function gesBalAbrir(mes) { await _gesExec(() => gesApi().balancoAbrir(mes), 'Balanço iniciado'); }
async function gesBalResp(bid, rid, resposta) {
  const v = _gAval(bid, rid);
  await _gesExec(() => gesApi().balancoResponder(bid, rid, resposta || null, v?.observacao ?? null));
  if (resposta === 'nao') setTimeout(() => document.querySelector(`[data-k="obs:${rid}"]`)?.focus(), 30);
}
async function gesBalObs(bid, rid, txt) { await _gesExec(() => gesApi().balancoResponder(bid, rid, 'nao', txt)); }
async function gesBalFechar(bid) {
  const bal = (_ges.D.balancos || []).find(b => b.id === bid);
  if (!confirm(`Fechar o balanço de ${_gesMesLabel(bal.mes)}?\nDepois de fechado, ninguém consegue mudar as respostas.`)) return;
  await _gesExec(() => gesApi().balancoFechar(bid), 'Balanço fechado');
}
function gesBalCriarAtv(bid, rid) {
  const r = _gRotina(rid), v = _gAval(bid, rid);
  gesAbrirAtv(null, { descritivo: `Corrigir rotina: ${r.titulo}`, subarea_id: r.subarea_id, prioridade: 2,
    observacao: v?.observacao || '', rotina_origem_id: rid, balanco_origem_id: bid, processo_id: r.processo_id });
}

// ── Visão do ano ──
function _gesHtmlBalAno() {
  const st = _gesBalSt();
  const meses = Array.from({ length: 12 }, (_, i) => `${st.ano}-${String(i + 1).padStart(2, '0')}-01`);
  const N = meses.map(m => { const b = _gBal(m); return b && _gAvals(b.id).length ? gesNotas(b) : null; });
  const val = N.map(n => n?.gestao).filter(x => x != null);
  const media = val.length ? Math.round(val.reduce((s, x) => s + x, 0) / val.length) : null;
  const ini = N.findIndex(n => n?.gestao != null), fim = N.length - 1 - [...N].reverse().findIndex(n => n?.gestao != null);
  const saud = val.filter(x => x >= 85).length;
  const celula = (n, m) => `<td>${n == null ? '<span class="ges-mapa-v">·</span>'
    : `<button class="ges-mapa-c" data-faixa="${gesFaixa(n)}" onclick="gesBalIrMes('${m}')" title="${_gesMesLabel(m)}: ${n} (${GES_FAIXAS[gesFaixa(n)]})">${n}</button>`}</td>`;
  const manut = l => { const a = l.filter(x => x != null); return a.length ? `${a.filter(x => x >= 85).length}/${a.length}` : '—'; };

  return `
    <div class="ges-bl-nav">
      <button class="ges-pa-abrir" onclick="gesBalAno(-1)" aria-label="Ano anterior">${lc('chevron-left', 18, 'currentColor')}</button>
      <span class="ges-bl-nav-mes">${st.ano}</span>
      <button class="ges-pa-abrir" onclick="gesBalAno(1)" aria-label="Próximo ano" ${st.ano >= Number(gesHoje().slice(0, 4)) ? 'disabled' : ''}>${lc('chevron-right', 18, 'currentColor')}</button>
    </div>
    <div class="ges-bl-resumo ges-bl-resumo-ano">
      <div class="ges-card ges-bl-kpi"><div class="ges-bl-lbl">Média do ano</div>${_gesNota(media, true)}</div>
      <div class="ges-card ges-bl-kpi"><div class="ges-bl-lbl">Evolução</div>
        <div class="ges-bl-kpi-t">${ini >= 0 ? `${_gesNota(N[ini].gestao)} <span class="ges-muted">${GES_MESES_C[ini]}</span> ${lc('arrow-right', 14, 'currentColor')} ${_gesNota(N[fim].gestao)} <span class="ges-muted">${GES_MESES_C[fim]}</span>` : '—'}</div></div>
      <div class="ges-card ges-bl-kpi"><div class="ges-bl-lbl">Meses saudáveis</div>
        <div class="ges-bl-kpi-t"><b>${saud}</b> de ${val.length}</div><div class="ges-dica">Gestão ≥ 85 no mês</div></div>
    </div>
    <div class="ges-card ges-bl-mapa-card">
      <div class="ges-bl-mapa-h">
        <div class="ges-bl-lbl">Mapa do ano por sub-área</div>
        <div class="ges-bl-legenda">${Object.entries(GES_FAIXAS).map(([k, t]) => `<span><i data-faixa="${k}"></i>${t}${k === 'ok' ? ' ≥ 85' : k === 'atencao' ? ' 70–84' : ' < 70'}</span>`).join('')}</div>
      </div>
      <div class="ges-bl-mapa-w">
        <table class="ges-bl-mapa">
          <thead><tr><th>Sub-área</th>${GES_MESES_C.map(m => `<th>${m}</th>`).join('')}<th title="Meses saudáveis / meses avaliados">Saudável</th></tr></thead>
          <tbody>
            <tr class="ges-mapa-gestao"><th>Gestão</th>${N.map((n, i) => celula(n?.gestao, meses[i])).join('')}<td class="ges-mapa-m">${manut(N.map(n => n?.gestao))}</td></tr>
            ${GES_AREAS.map(a => `
              <tr class="ges-mapa-area" data-area="${a.id}"><th>${_gesSelo(a.id)} ${a.nome}</th>${N.map((n, i) => celula(n?.area[a.id], meses[i])).join('')}
                <td class="ges-mapa-m">${manut(N.map(n => n?.area[a.id]))}</td></tr>
              ${_ges.D.subareas.filter(s => s.area === a.id).sort((x, y) => x.ordem - y.ordem).map(s => `
                <tr><th class="ges-mapa-sub">${_gesEsc(s.nome)}</th>${N.map((n, i) => celula(n?.sub[s.id], meses[i])).join('')}
                  <td class="ges-mapa-m">${manut(N.map(n => n?.sub[s.id]))}</td></tr>`).join('')}`).join('')}
          </tbody>
        </table>
      </div>
      <div class="ges-dica">Toque numa nota para abrir o balanço daquele mês.</div>
    </div>`;
}

// ── Cadastro de rotinas-chave ──
function gesAbrirRotinas() {
  _gesModal('gesRotModal', 'Rotinas-chave do Balanço', `<div id="gesRotBody">${_gesHtmlRotinasCorpo()}</div>`, null, '', 680);
}
function _gesHtmlRotinasCorpo() {
  return `
    <div class="ges-dica ges-rot-dica">O que precisa acontecer todo mês em cada sub-área. Escreva como algo verificável
      (ex.: "Contagem de estoque feita todos os dias antes das 17h"). Mudar ou desativar não altera balanços já fechados.</div>
    ${GES_AREAS.map(a => `
      <div class="ges-rot-area" data-area="${a.id}">
        <div class="ges-rot-area-h">${_gesSelo(a.id)} ${a.nome}</div>
        ${_gSubsAtivas(a.id).map(s => {
          const rs = (_ges.D.rotinas || []).filter(r => r.subarea_id === s.id).sort((x, y) => x.ordem - y.ordem);
          const procs = (_ges.D.processos || []).filter(p => p.subarea_id === s.id && !p.arquivado);
          return `
          <div class="ges-rot-sub">
            <div class="ges-rot-sub-h">${_gesEsc(s.nome)} <span class="ges-pa-area-qtd">${rs.filter(r => r.ativo).length}</span></div>
            ${rs.map(r => `
              <div class="ges-rot-linha ${r.ativo ? '' : 'off'}">
                <input class="inp" value="${_gesEsc(r.titulo)}" aria-label="Rotina" onchange="gesRotSalvar('${r.id}',{titulo:this.value})">
                <select class="inp" aria-label="Processo ligado" onchange="gesRotSalvar('${r.id}',{processo_id:this.value||null})">
                  <option value="">Sem processo</option>
                  ${procs.map(p => `<option value="${p.id}" ${r.processo_id === p.id ? 'selected' : ''}>${_gesEsc(p.nome)}</option>`).join('')}
                </select>
                <button class="ges-pa-abrir" title="${r.ativo ? 'Desativar' : 'Reativar'}" aria-label="${r.ativo ? 'Desativar' : 'Reativar'}"
                  onclick="gesRotSalvar('${r.id}',{ativo:${!r.ativo}})">${lc(r.ativo ? 'eye-off' : 'eye', 15, 'currentColor')}</button>
              </div>`).join('')}
            <div class="ges-sub-add">
              ${lc('plus', 14, 'currentColor')}
              <input class="inp" placeholder="Nova rotina e teclar Enter" data-k="rot:${s.id}"
                onkeydown="if(event.key==='Enter'){event.preventDefault();gesRotNova('${s.id}',this)}">
            </div>
          </div>`;
        }).join('')}
      </div>`).join('')}`;
}
async function gesRotSalvar(id, d) { await _gesExec(() => gesApi().rotinaSalvar(id, d)); }
async function gesRotNova(subId, inp) {
  if (!inp.value.trim()) return;
  await _gesExec(() => gesApi().rotinaSalvar(null, { subarea_id: subId, titulo: inp.value }));
}

// ══════════════════════════════════════════════════════════════
// MODAL (padrão fm-* do app)
// ══════════════════════════════════════════════════════════════
function _gesModal(id, titulo, corpo, salvarFn, salvarLabel = 'Salvar', largura = 560) {
  document.getElementById(id)?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = id;
  ov.innerHTML = `<div class="modal fm-modal ges-modal" style="width:${largura}px" onclick="event.stopPropagation()">
    <div class="fm-head">
      <div class="ges-modal-tit"><div class="fm-title">${titulo}</div></div>
      <button class="fm-close" title="Fechar" onclick="this.closest('.overlay').remove()">${lc('x', 18, 'currentColor')}</button>
    </div>
    <div class="fm-body">${corpo}</div>
    <div class="fm-foot">
      <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">${salvarFn ? 'Cancelar' : 'Fechar'}</button>
      ${salvarFn ? `<button class="btn btn-primary" onclick="${salvarFn}">${salvarLabel}</button>` : ''}
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  return ov;
}

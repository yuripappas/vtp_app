/**
 * VTP — Vai Ter Pizza!
 * checklist.js — Módulo de Checklist Operacional
 */

// ══════════════════════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════════════════════
const _CK_SESS_KEY     = 'vtp_ck_sessoes';
const _getCkTemplates  = () => db._get('vtp_ck_templates', null) || _ckTemplatesDefault();
const _saveCkTemplates = t  => db._set('vtp_ck_templates', t);
const _getCkSessoes    = () => db._get(_CK_SESS_KEY, []);

// Templates excluídos continuam gravados (histórico das sessões mostra o nome),
// mas somem das listas e da atribuição.
const _ckTemplatesVisiveis = () => _getCkTemplates().filter(t => !t.excluido);
const _ckTmpl    = id => _getCkTemplates().find(t => t.id === id) || null;
const _ckSessao  = id => _getCkSessoes().find(s => s.id === id) || null;

// ── Sincronização das sessões ─────────────────────────────────
// Cada gravação vira um diff (ops) aplicado no servidor por ck_aplicar_ops com
// lock — vários celulares marcando itens ao mesmo tempo não se sobrescrevem mais.
// Sem a função no banco (ou offline), cai na gravação antiga do array inteiro.
let _ckOpsFila          = [];
let _ckOpsTimer         = null;
let _ckOpsEnviando      = false;
let _ckRpcIndisponivel  = false;
let _ckUltimoLocal      = '';

// JSON com chaves ordenadas — o jsonb do Postgres reordena chaves
function _ckCanon(v) {
  if (Array.isArray(v)) return '[' + v.map(_ckCanon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + _ckCanon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

function _ckGravarLocal(arr) {
  try { localStorage.setItem(_CK_SESS_KEY, JSON.stringify(arr)); } catch (e) {}
  _ckUltimoLocal = _ckCanon(arr);
}

function _ckDiffSessoes(antes, depois) {
  const ops  = [];
  const mapA = new Map(antes.map(s => [s.id, s]));
  const idsD = new Set();
  for (const s of depois) {
    idsD.add(s.id);
    const a = mapA.get(s.id);
    if (!a) { ops.push({ op: 'add', sess: s }); continue; }
    const fields = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(s)]);
    keys.delete('respostas');
    for (const k of keys) {
      if (_ckCanon(a[k]) !== _ckCanon(s[k])) fields[k] = s[k] === undefined ? null : s[k];
    }
    if (Object.keys(fields).length) ops.push({ op: 'patch', id: s.id, fields });
    const ra = a.respostas || {}, rd = s.respostas || {};
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rd)])) {
      if (_ckCanon(ra[k]) !== _ckCanon(rd[k])) ops.push({ op: 'resp', id: s.id, item: k, val: rd[k] === undefined ? null : rd[k] });
    }
  }
  for (const a of antes) if (!idsD.has(a.id)) ops.push({ op: 'del', id: a.id });
  return ops;
}

// Mesma semântica de ck_aplicar_ops (SQL) — usado para reaplicar ops ainda
// não confirmadas sobre o valor que veio do servidor
function _ckAplicarOps(arr, ops) {
  const v = (Array.isArray(arr) ? arr : []).map(s => ({ ...s, respostas: { ...(s.respostas || {}) } }));
  for (const o of ops) {
    if (o.op === 'add') {
      const s = o.sess;
      const existe = v.some(x => x.id === s.id ||
        (String(x.templateId) === String(s.templateId) && String(x.userId) === String(s.userId) && x.data === s.data));
      if (!existe) v.push(s);
      continue;
    }
    const i = v.findIndex(x => x.id === o.id);
    if (i < 0) continue;
    if (o.op === 'del')        v.splice(i, 1);
    else if (o.op === 'patch') Object.assign(v[i], o.fields);
    else if (o.op === 'resp') {
      if (o.val === null) delete v[i].respostas[o.item];
      else v[i].respostas[o.item] = o.val;
    }
  }
  return v;
}

function _saveCkSessoes(novo) {
  if (!window._vtpSb || _ckRpcIndisponivel) { _ckUltimoLocal = _ckCanon(novo); return db._set(_CK_SESS_KEY, novo); }
  const ops = _ckDiffSessoes(_getCkSessoes(), novo);
  _ckGravarLocal(novo);
  if (!ops.length) return true;
  _ckOpsFila.push(...ops);
  clearTimeout(_ckOpsTimer);
  _ckOpsTimer = setTimeout(_ckEnviarOps, 250);
  return true;
}

async function _ckEnviarOps() {
  if (_ckOpsEnviando || !_ckOpsFila.length) return;
  _ckOpsEnviando = true;
  const lote = _ckOpsFila.slice();
  let tentarDeNovo = false;
  try {
    const { data, error } = await window._vtpSb.rpc('ck_aplicar_ops', { p_ops: lote });
    if (error) throw error;
    _ckOpsFila = _ckOpsFila.slice(lote.length);
    const merged  = _ckAplicarOps(data, _ckOpsFila);
    const mudou   = _ckCanon(merged) !== _ckUltimoLocal;
    _ckGravarLocal(merged);
    if (mudou) _ckRerenderSeAtivo();
  } catch (e) {
    const msg = e?.message || '';
    if (e?.code === 'PGRST202' || e?.code === '42883' || /ck_aplicar_ops/.test(msg)) {
      console.warn('[checklist] ck_aplicar_ops indisponível no banco — usando gravação do array inteiro');
      _ckRpcIndisponivel = true;
      _ckOpsFila = [];
      db._set(_CK_SESS_KEY, _getCkSessoes());
    } else {
      console.warn('[checklist] falha ao sincronizar, nova tentativa em 3s:', msg);
      tentarDeNovo = true;
    }
  } finally {
    _ckOpsEnviando = false;
    if (_ckOpsFila.length && !_ckRpcIndisponivel) setTimeout(_ckEnviarOps, tentarDeNovo ? 3000 : 0);
  }
}

// Realtime: mantém as marcações ainda não enviadas por cima do valor recebido
// e ignora o eco da própria gravação (evita re-render piscando)
(function _ckHookRealtime() {
  const orig = window._vtpOnRealtimeUpdate;
  if (typeof orig !== 'function' || orig._ck) return;
  const wrapped = function (key) {
    if (key === _CK_SESS_KEY) {
      const recebido = db._get(_CK_SESS_KEY, []);
      const merged   = _ckOpsFila.length ? _ckAplicarOps(recebido, _ckOpsFila) : recebido;
      const canon    = _ckCanon(merged);
      if (canon === _ckUltimoLocal) return;
      _ckGravarLocal(merged);
      if (document.getElementById('ckGuiadoOverlay')) return;
    }
    return orig.apply(this, arguments);
  };
  wrapped._ck = true;
  window._vtpOnRealtimeUpdate = wrapped;
})();

function _ckRerenderSeAtivo() {
  const el = document.getElementById('ckPanelContent');
  if (!el || !el.offsetParent || document.getElementById('ckGuiadoOverlay')) return;
  const ativo = document.activeElement;
  if (ativo && el.contains(ativo) && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName)) return;
  _renderCkTab();
  _atualizarBadgeEquipe();
}

// Lê a sessão atual (fresca), aplica fn e grava — nunca grava cópia antiga,
// senão o diff desfaria mudanças que chegaram de outro aparelho no meio tempo.
function _ckAtualizarSessao(id, fn) {
  const sessoes = _getCkSessoes();
  const inst    = sessoes.find(s => s.id === id);
  if (!inst) return null;
  fn(inst, sessoes);
  _saveCkSessoes(sessoes);
  return inst;
}

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════
function _ckEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _ckIsGestor() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return u?.role === 'gerente' || u?.role === 'supervisor';
}

function _ckTurnos() {
  return typeof checklistTurnos !== 'undefined' ? checklistTurnos :
    [{id:'abertura',label:'Abertura'},{id:'producao',label:'Produção'},{id:'operacao',label:'Operação'},{id:'fechamento',label:'Fechamento'},{id:'diario',label:'Diário'}];
}
const _ckTurnoLabel = id => _ckTurnos().find(t => t.id === id)?.label || id || '';

// Data YYYY-MM-DD no fuso local (toISOString usa UTC e vira o dia às 21h em Brasília)
function _ckData(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Dia operacional: vira às 04:00, não à meia-noite — o fechamento da pizzaria
// passa da meia-noite e continua sendo "do dia". Horários antes das 04:00
// pertencem à madrugada do dia operacional.
const CK_VIRADA_MIN = 4 * 60;
const CK_VIRADA_LBL = '04:00';

function _ckHoje(now = new Date()) {
  const d = new Date(now.getTime());
  if (d.getHours() * 60 + d.getMinutes() < CK_VIRADA_MIN) d.setDate(d.getDate() - 1);
  return _ckData(d);
}
const _ckDataObj  = data => new Date(data + 'T12:00');
const _ckDataLbl  = (data, opts = { weekday:'long', day:'numeric', month:'long' }) => data ? _ckDataObj(data).toLocaleDateString('pt-BR', opts) : '';

// Minutos no dia operacional (madrugada conta depois das 23:59)
function _ckMinNum(v) { return v < CK_VIRADA_MIN ? v + 1440 : v; }
function _ckMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return _ckMinNum(h * 60 + m);
}

// ── Janela de horário do item ─────────────────────────────────
// tipo: 'livre' (qualquer hora do dia) | 'ate' (até horaFim) | 'entre' (horaIni–horaFim)
// Itens antigos só têm `horario` em texto livre: "HH:MM" vira "até HH:MM", o resto vira livre.
function _ckJanela(item) {
  if (item.janela) return { tipo: item.janela, ini: item.horaIni || '', fim: item.horaFim || '' };
  const h = String(item.horario || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(h)) return { tipo: 'ate', ini: '', fim: h.padStart(5, '0') };
  return { tipo: 'livre', ini: '', fim: '' };
}

function _ckJanelaLabel(j) {
  if (j.tipo === 'entre') return `${j.ini}–${j.fim}`;
  if (j.tipo === 'ate')   return `até ${j.fim}`;
  return '';
}

// 'livre' | 'aguardando' | 'aberto' | 'encerrado' — só avalia a hora no dia da instância;
// instâncias de dias passados são bloqueadas inteiras em _ckGuardMarcacao
function _ckEstadoJanela(item, dataInst, now = new Date()) {
  const j = _ckJanela(item);
  if (j.tipo === 'livre' || dataInst !== _ckHoje(now)) return { estado: 'livre', j };
  const agora = _ckMinNum(now.getHours() * 60 + now.getMinutes());
  if (j.tipo === 'entre' && j.ini && agora < _ckMin(j.ini)) return { estado: 'aguardando', j };
  if (j.fim && agora > _ckMin(j.fim))                       return { estado: 'encerrado', j };
  return { estado: 'aberto', j };
}
const _ckForaJanela = (item, data) => ['aguardando','encerrado'].includes(_ckEstadoJanela(item, data).estado);

// Itens feitos contando só os que ainda existem no template
const _ckFeitos = (inst, tmpl) => tmpl.itens.filter(i => (inst.respostas || {})[i.id]).length;

// Status visual padrão do módulo: cinza não iniciado · amarelo em andamento · verde concluído · vermelho atrasado
function _ckStatusVisual(s) {
  if (s.status === 'concluido')  return { key:'concluido', label:'Concluído',     cor:'var(--green)',  bg:'var(--green-light)',  icon:'check-circle' };
  if (s.data && s.data < _ckHoje()) return { key:'atrasado', label:'Não concluído', cor:'var(--red)', bg:'var(--red-light)', icon:'alert-circle' };
  if (s.status === 'em_andamento') return { key:'andamento', label:'Em andamento', cor:'var(--yellow)', bg:'var(--yellow-light)', icon:'clock' };
  return { key:'pendente', label:'Não iniciado', cor:'var(--muted)', bg:'var(--surface2)', icon:'circle' };
}

// Recalcula status/conclusão após mudar respostas
function _ckRecalcStatus(inst, tmpl) {
  const obrigs = tmpl.itens.filter(i => i.obrigatorio);
  const alvo   = obrigs.length ? obrigs : tmpl.itens;
  const ok     = alvo.every(i => (inst.respostas || {})[i.id]);
  if (ok && !inst.concluidoEm) {
    inst.concluidoEm = new Date().toISOString();
    inst.status      = 'concluido';
    toast('Checklist concluído!', 'ok');
    try { logAudit('checklist_concluido', (tmpl.nome || 'Checklist') + ' — sessão #' + inst.id, 'checklist'); } catch(e) {}
  } else if (!ok) {
    inst.status      = _ckFeitos(inst, tmpl) > 0 ? 'em_andamento' : 'pendente';
    inst.concluidoEm = null;
  }
}

// ── Modal de texto (justificativa / evidência) ────────────────
// Substitui window.prompt, que não aparece em PWA/celular
function _ckPedirTexto({ titulo, mensagem = '', placeholder = '', confirmar = 'Confirmar', icone = 'edit-3' }) {
  return new Promise(resolve => {
    document.getElementById('popupCkTexto')?.remove();
    const popup = document.createElement('div');
    popup.id = 'popupCkTexto';
    popup.className = 'ck-overlay';
    popup.style.zIndex = '800';
    popup.innerHTML = `
      <div class="ck-modal" style="max-width:440px" role="dialog" aria-modal="true" aria-labelledby="ckTextoTit">
        <div class="ck-modal-head">
          <div id="ckTextoTit" style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:7px">${lc(icone,15,'var(--purple)')} ${_ckEsc(titulo)}</div>
          <button data-ck-fechar aria-label="Fechar" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
        </div>
        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
          ${mensagem ? `<div style="font-size:var(--text-sm);color:var(--text2);line-height:1.5">${_ckEsc(mensagem)}</div>` : ''}
          <textarea id="ckTextoVal" class="inp" rows="3" placeholder="${_ckEsc(placeholder)}"
            style="width:100%;resize:vertical;min-height:84px;font-family:Inter,sans-serif;box-sizing:border-box"></textarea>
        </div>
        <div class="ck-modal-foot">
          <button class="btn btn-outline" data-ck-fechar>Cancelar</button>
          <button class="btn btn-primary" id="ckTextoOk">${_ckEsc(confirmar)}</button>
        </div>
      </div>`;
    const fim = val => { popup.remove(); resolve(val); };
    popup.addEventListener('click', e => { if (e.target === popup || e.target.closest('[data-ck-fechar]')) fim(null); });
    popup.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); fim(null); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) popup.querySelector('#ckTextoOk').click();
    });
    document.body.appendChild(popup);
    const ta = popup.querySelector('#ckTextoVal');
    popup.querySelector('#ckTextoOk').onclick = () => {
      const v = ta.value.trim();
      if (!v) { ta.style.borderColor = 'var(--red)'; ta.focus(); return; }
      fim(v);
    };
    setTimeout(() => ta.focus(), 30);
  });
}

// ESC fecha o modal do checklist que estiver por cima
if (!window._ckEscBound) {
  window._ckEscBound = true;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.getElementById('popupCkTexto')) return;
    for (const id of ['popupCkInstr','popupCkDetalhe','popupCkAtribuir','popupCkTemplate']) {
      const el = document.getElementById(id);
      if (el) { el.remove(); return; }
    }
    if (document.getElementById('ckGuiadoOverlay')) _ckFecharGuiado();
  });
}

// Valida se o item pode ser registrado agora. Funcionário fica bloqueado fora do prazo;
// gestor registra com justificativa. Retorna null (bloqueado) ou { aplicar(inst), justificativa }.
async function _ckGuardMarcacao(inst, item, marcando) {
  const isGestor = _ckIsGestor();
  if (inst.data && inst.data < _ckHoje()) {
    if (!isGestor) { toast('Prazo encerrado — checklist bloqueado. Contate seu supervisor.', 'err'); return null; }
    if (inst._justificativaAtraso) return { aplicar: () => {} };
    const just = await _ckPedirTexto({
      titulo: 'Registro fora do prazo', icone: 'alert-circle',
      mensagem: `Este checklist era de ${_ckDataLbl(inst.data)}. Informe a justificativa para registrá-lo fora do prazo.`,
      placeholder: 'Ex.: funcionário registrou no papel, sistema fora do ar…', confirmar: 'Registrar',
    });
    if (!just) return null;
    return { aplicar: s => { s._justificativaAtraso = just; s._atualizadoForaDoPrazo = new Date().toISOString(); } };
  }
  if (!marcando || !item) return { aplicar: () => {} };
  const { estado, j } = _ckEstadoJanela(item, inst.data);
  if (estado !== 'aguardando' && estado !== 'encerrado') return { aplicar: () => {} };
  const msg = estado === 'aguardando' ? `Item disponível a partir das ${j.ini}` : `Horário encerrado (${_ckJanelaLabel(j)})`;
  if (!isGestor) { toast(`${msg}. Contate seu supervisor.`, 'err'); return null; }
  const just = await _ckPedirTexto({
    titulo: 'Registro fora do horário', icone: 'clock',
    mensagem: `${msg}. Informe a justificativa para registrar mesmo assim.`, confirmar: 'Registrar',
  });
  if (!just) return null;
  return { aplicar: () => {}, justificativa: just };
}

let _ckTab = 'meu'; // 'meu' | 'equipe' | 'templates' | 'dashboard'
window._vtpGetTab_checklist = () => _ckTab;
window._vtpSetTab_checklist = (v) => { _ckTab = v; };


// ══════════════════════════════════════════════════════════════
// TEMPLATES PADRÃO
// ══════════════════════════════════════════════════════════════
function _ckTemplatesDefault() {
  return [
    {
      id: 1,
      nome: 'Pizzaiolo — Abertura',
      funcao: 'pizzaiolo',
      turno: 'abertura',
      cor: 'var(--red)', bg: 'var(--red-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Verificar temperatura do forno principal',            horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Conferir estoque de massas abertas',                  horario:'17:00', obrigatorio:true  },
        { id:3, texto:'Organizar bancada de trabalho e utensílios',          horario:'17:00', obrigatorio:true  },
        { id:4, texto:'Verificar nível de gás',                              horario:'17:00', obrigatorio:true  },
        { id:5, texto:'Conferir estoque de insumos (queijo, calabresa, etc)',horario:'17:15', obrigatorio:true  },
        { id:6, texto:'Ligar e testar equipamentos (forno, divisora)',       horario:'17:15', obrigatorio:true  },
        { id:7, texto:'Verificar limpeza dos carrinhos de massa',            horario:'17:20', obrigatorio:false },
      ]
    },
    {
      id: 2,
      nome: 'Pizzaiolo — Fechamento',
      funcao: 'pizzaiolo',
      turno: 'fechamento',
      cor: 'var(--red)', bg: 'var(--red-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Desligar fornos e equipamentos',                      horario:'23:30', obrigatorio:true  },
        { id:2, texto:'Limpar e organizar bancada de trabalho',              horario:'23:30', obrigatorio:true  },
        { id:3, texto:'Guardar insumos sobressalentes na câmara fria',       horario:'23:30', obrigatorio:true  },
        { id:4, texto:'Registrar sobra de massas (quantidade)',              horario:'23:45', obrigatorio:true  },
        { id:5, texto:'Higienizar utensílios e formas',                      horario:'23:45', obrigatorio:true  },
        { id:6, texto:'Verificar se câmara fria está fechada',               horario:'00:00', obrigatorio:true  },
      ]
    },
    {
      id: 3,
      nome: 'Pré-Produção — Diário',
      funcao: 'preproducao',
      turno: 'producao',
      cor: 'var(--purple)', bg: 'var(--purple-xlight)',
      ativo: true,
      itens: [
        { id:1, texto:'Verificar ordens de produção do dia',                 horario:'14:00', obrigatorio:true  },
        { id:2, texto:'Separar e pesar insumos para preparo',                horario:'14:15', obrigatorio:true  },
        { id:3, texto:'Preparar frango (cozinhar e desfiar)',                horario:'14:30', obrigatorio:false },
        { id:4, texto:'Preparar carne de sol',                               horario:'15:00', obrigatorio:false },
        { id:5, texto:'Preparar brigadeiros e cremes',                       horario:'15:30', obrigatorio:false },
        { id:6, texto:'Etiquetar e armazenar preparados com data',           horario:'16:30', obrigatorio:true  },
        { id:7, texto:'Registrar quantidades produzidas',                    horario:'16:45', obrigatorio:true  },
        { id:8, texto:'Higienizar área de produção',                         horario:'17:00', obrigatorio:true  },
      ]
    },
    {
      id: 4,
      nome: 'Atendimento — Abertura',
      funcao: 'atendimento',
      turno: 'abertura',
      cor: 'var(--green)', bg: 'var(--green-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Ligar sistema de pedidos (cardápio web)',             horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Verificar impressora de pedidos',                     horario:'17:00', obrigatorio:true  },
        { id:3, texto:'Conferir troco do caixa',                             horario:'17:00', obrigatorio:true  },
        { id:4, texto:'Atualizar cardápio / pausar itens em falta',         horario:'17:10', obrigatorio:true  },
        { id:5, texto:'Verificar funcionamento do delivery (iFood, CW)',    horario:'17:15', obrigatorio:true  },
        { id:6, texto:'Checar disponibilidade dos motoboys',                horario:'17:15', obrigatorio:true  },
      ]
    },
    {
      id: 5,
      nome: 'Atendimento — Fechamento',
      funcao: 'atendimento',
      turno: 'fechamento',
      cor: 'var(--green)', bg: 'var(--green-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Pausar todos os canais de venda',                    horario:'23:00', obrigatorio:true  },
        { id:2, texto:'Fechar caixa e conferir valores',                    horario:'23:15', obrigatorio:true  },
        { id:3, texto:'Registrar total de pedidos e faturamento do dia',    horario:'23:30', obrigatorio:true  },
        { id:4, texto:'Enviar relatório diário para gerência',              horario:'23:45', obrigatorio:false },
        { id:5, texto:'Desligar sistema e equipamentos de atendimento',     horario:'00:00', obrigatorio:true  },
      ]
    },
    {
      id: 6,
      nome: 'Auxiliar de Cozinha — Turno',
      funcao: 'auxiliar',
      turno: 'turno',
      cor: 'var(--yellow)', bg: 'var(--yellow-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Higienizar bancadas e equipamentos',                 horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Repor material de limpeza',                          horario:'17:00', obrigatorio:false },
        { id:3, texto:'Lavar e organizar louças e utensílios',              horario:'Contínuo', obrigatorio:true },
        { id:4, texto:'Manter área de descarte organizada',                 horario:'Contínuo', obrigatorio:true },
        { id:5, texto:'Apoiar pré-produção conforme demanda',               horario:'Contínuo', obrigatorio:false},
        { id:6, texto:'Limpeza geral ao final do turno',                   horario:'23:30', obrigatorio:true  },
      ]
    },
    {
      id: 7,
      nome: 'Compras e Estoque — Diário',
      funcao: 'compras',
      turno: 'diario',
      cor: 'var(--chart-2)', bg: 'var(--chart-2-soft)',
      ativo: true,
      itens: [
        { id:1, texto:'Conferir estoque e atualizar sistema',               horario:'09:00', obrigatorio:true  },
        { id:2, texto:'Verificar itens críticos e gerar lista de compras',  horario:'09:30', obrigatorio:true  },
        { id:3, texto:'Contatar fornecedores para pedidos urgentes',        horario:'10:00', obrigatorio:false },
        { id:4, texto:'Receber e conferir entregas do dia',                 horario:'Conforme chegada', obrigatorio:true },
        { id:5, texto:'Registrar entradas no sistema',                      horario:'Conforme chegada', obrigatorio:true },
        { id:6, texto:'Organizar estoque por validade (PVPS)',              horario:'Conforme chegada', obrigatorio:true },
      ]
    },
  ];
}


// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderChecklist() {
  const isGestor = _ckIsGestor();
  _ckAutoAssign();

  const el = document.getElementById('checklistContent');
  if (!el) return;

  const tab = (id, icon, label, extra = '') => `
    <button onclick="setCkTab('${id}')" id="ckTab-${id}" class="tab-btn ${_ckTab===id?'active':''}" aria-label="${label}">
      ${lc(icon,13,'currentColor')} <span class="ck-tab-lbl">${label}</span>${extra}
    </button>`;

  el.innerHTML = `
    <div class="tab-bar ck-tabbar ${isGestor?'ck-tabbar-multi':''}" style="position:sticky;top:0;z-index:10;justify-content:space-between">
      <div style="display:flex">
        ${tab('meu','check-square','Meu Checklist')}
        ${isGestor ? `
          ${tab('equipe','users','Equipe','<span id="ckBadgeEquipe" class="sb-badge" style="display:none"></span>')}
          ${tab('templates','layout','Templates')}
          ${tab('dashboard','bar-chart-2','Ranking')}` : ''}
      </div>
      ${isGestor ? `
      <div style="padding:8px 0;flex-shrink:0">
        <button onclick="abrirModalNovaInstancia()" class="btn btn-primary btn-sm" style="gap:6px" aria-label="Atribuir checklist">
          ${lc('plus',13,'currentColor')} <span class="ck-tab-lbl">Atribuir checklist</span>
        </button>
      </div>` : ''}
    </div>
    <div id="ckPanelContent" class="ck-panel"></div>`;

  _renderCkTab();
  _atualizarBadgeEquipe();
}

function setCkTab(tab) {
  _ckTab = tab;
  renderChecklist();
}

function _renderCkTab() {
  if (!_ckIsGestor() && _ckTab !== 'meu') _ckTab = 'meu';
  if (_ckTab === 'meu')            _renderCkMeu();
  else if (_ckTab === 'equipe')    _renderCkEquipe();
  else if (_ckTab === 'templates') _renderCkTemplates();
  else if (_ckTab === 'dashboard') _renderCkDashboard();
}

// ══════════════════════════════════════════════════════════════
// ABA: MEU CHECKLIST
// ══════════════════════════════════════════════════════════════
const CK_DIAS_ATRASO_VISIVEIS = 30;

function _renderCkMeu() {
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const el   = document.getElementById('ckPanelContent');
  if (!el) return;
  const hoje = _ckHoje();
  const all  = _getCkSessoes().filter(s => s.userId === u?.id && _ckTmpl(s.templateId));

  const limite = new Date(); limite.setDate(limite.getDate() - CK_DIAS_ATRASO_VISIVEIS);
  const limiteStr = _ckData(limite);

  const instancias = all.filter(s => s.data === hoje);
  const atrasadas  = all.filter(s => s.data < hoje && s.data >= limiteStr && s.status !== 'concluido')
    .sort((a,b) => b.data.localeCompare(a.data));
  const recentes   = all.filter(s => s.status === 'concluido' && s.data !== hoje)
    .sort((a,b) => (b.concluidoEm||b.data) > (a.concluidoEm||a.data) ? 1 : -1)
    .slice(0,3);

  const hora = new Date().getHours();
  const saud = hora >= 4 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';

  const blocoAtrasadas = atrasadas.length === 0 ? '' : `
    <details class="ck-atrasadas" style="margin-top:20px">
      <summary style="font-size:var(--text-xs);font-weight:700;color:var(--red);text-transform:uppercase;
        letter-spacing:.05em;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 0">
        ${lc('alert-circle',12,'currentColor')} ${atrasadas.length} checklist${atrasadas.length>1?'s':''} não concluído${atrasadas.length>1?'s':''} (últimos ${CK_DIAS_ATRASO_VISIVEIS} dias)
      </summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        ${atrasadas.map(s => {
          const t = _ckTmpl(s.templateId);
          const total = t.itens.length, feitos = _ckFeitos(s, t);
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--red-light);
            border-radius:var(--r8);border:1px solid var(--red)">
            ${lc('lock',14,'var(--red)')}
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_ckEsc(t.nome)}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${_ckDataLbl(s.data,{weekday:'short',day:'numeric',month:'short'})} · ${feitos}/${total} itens</div>
            </div>
            ${_ckIsGestor()
              ? `<button class="btn btn-outline btn-xs" onclick="verDetalheInstancia('${s.id}')">Ver</button>`
              : `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red);white-space:nowrap">Bloqueado</span>`}
          </div>`;
        }).join('')}
        ${!_ckIsGestor() ? `<div style="font-size:var(--text-xs);color:var(--muted);padding:2px 2px 0">Para registrar um checklist atrasado, fale com seu supervisor.</div>` : ''}
      </div>
    </details>`;

  const blocoRecentes = recentes.length === 0 ? '' : `
    <details style="margin-top:12px" ${instancias.length===0?'open':''}>
      <summary style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;
        letter-spacing:.05em;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 0">
        ${lc('check-circle',12,'var(--muted)')} Últimos concluídos
      </summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        ${recentes.map(s => {
          const t = _ckTmpl(s.templateId);
          const hr = s.concluidoEm ? new Date(s.concluidoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--green-light);
            border-radius:var(--r8);border:1px solid var(--green)">
            ${lc('check-circle',14,'var(--green)')}
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_ckEsc(t.nome)}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${_ckDataLbl(s.data,{weekday:'short',day:'numeric',month:'short'})}${hr?' · '+hr:''}</div>
            </div>
            <span style="font-size:var(--text-2xs);font-weight:700;color:var(--green);white-space:nowrap">Concluído ✓</span>
          </div>`;
        }).join('')}
      </div>
    </details>`;

  el.innerHTML = `
    <div style="max-width:720px;margin:0 auto">
      <div style="text-align:center;padding:16px 0 20px">
        <div style="font-size:1.4rem;font-weight:800;margin-bottom:4px">${saud}, ${_ckEsc(u?.name?.split(' ')[0] || 'você')}!</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">${_ckDataLbl(hoje)}</div>
      </div>

      ${instancias.length === 0 ? `
      <div style="text-align:center;padding:36px 20px 24px;background:var(--surface2);border-radius:var(--r12);border:1.5px dashed var(--border)">
        ${lc('check-square',32,'var(--muted)')}
        <div style="font-size:var(--text-md);font-weight:700;margin-top:12px;margin-bottom:4px">Nenhum checklist para hoje</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">Aguarde seu supervisor atribuir as tarefas do dia</div>
      </div>` :
      instancias.map(inst => _cardInstanciaFuncionario(inst)).join('')}

      ${blocoAtrasadas}
      ${blocoRecentes}
    </div>`;
}

// Próximo prazo ainda aberto entre os itens não feitos
function _ckProximoPrazo(inst, tmpl) {
  const agora = new Date();
  const abertos = tmpl.itens
    .filter(i => !(inst.respostas || {})[i.id])
    .map(i => ({ i, e: _ckEstadoJanela(i, inst.data, agora) }))
    .filter(x => x.e.estado === 'aberto' && x.e.j.fim)
    .sort((a, b) => _ckMin(a.e.j.fim) - _ckMin(b.e.j.fim));
  return abertos[0]?.e.j.fim || '';
}

function _cardInstanciaFuncionario(inst) {
  const tmpl  = _ckTmpl(inst.templateId);
  if (!tmpl) return '';
  const total    = tmpl.itens.length;
  const feitos   = _ckFeitos(inst, tmpl);
  const pct      = total > 0 ? Math.round(feitos/total*100) : 0;
  const concluido= inst.status === 'concluido' || !!inst.concluidoEm;
  const cor      = concluido ? 'var(--green)' : (tmpl.cor || 'var(--purple)');
  const prazo    = concluido ? '' : _ckProximoPrazo(inst, tmpl);
  if (!window._ckInstrucoes) window._ckInstrucoes = {};

  return `
  <div style="margin-bottom:16px;border-radius:var(--r12);overflow:hidden;border:1.5px solid ${cor}">
    <div style="padding:16px;background:${cor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:1.05rem;font-weight:800;color:#fff;line-height:1.3">${_ckEsc(tmpl.nome)}</div>
          <div style="font-size:var(--text-xs);color:rgba(255,255,255,.85);margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
            ${inst.turno ? `<span>${_ckEsc(_ckTurnoLabel(inst.turno))}</span>` : ''}
            ${prazo ? `<span style="display:inline-flex;align-items:center;gap:3px;font-weight:700">${lc('clock',11,'#fff')} Próximo prazo: ${prazo}</span>` : ''}
          </div>
        </div>
        ${concluido ? `
          <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.25);color:#fff;
            padding:6px 13px;border-radius:20px;font-size:var(--text-sm);font-weight:700;white-space:nowrap;flex-shrink:0">
            ${lc('check-circle',14,'#fff')} Concluído
          </div>
        ` : `
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.7rem;font-weight:800;color:#fff;line-height:1">${pct}%</div>
            <div style="font-size:var(--text-xs);color:rgba(255,255,255,.8)">${feitos}/${total} itens</div>
          </div>
        `}
      </div>
      <div style="height:5px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;margin-top:12px">
        <div style="height:100%;width:${pct}%;background:#fff;border-radius:3px;transition:width .4s"></div>
      </div>
      ${!concluido ? `
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button onclick="event.stopPropagation();_ckAbrirModoGuiado('${inst.id}')"
          style="display:inline-flex;align-items:center;gap:5px;padding:8px 14px;min-height:36px;
            border-radius:var(--radius-pill);border:1.5px solid rgba(255,255,255,.5);
            background:rgba(255,255,255,.15);color:#fff;font-size:var(--text-xs);
            font-weight:700;cursor:pointer;font-family:var(--font-sans)">
          ${lc('play', 12, 'currentColor')} Modo Guiado
        </button>
      </div>` : ''}
    </div>

    <div style="background:var(--surface)">
      ${tmpl.itens.map(item => _ckItemLinha(inst, tmpl, item)).join('')}
    </div>

    ${concluido ? `
    <div style="padding:12px 16px;background:var(--green-light);border-top:1px solid var(--green)">
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--green);text-align:center;
        display:flex;align-items:center;justify-content:center;gap:6px">
        ${lc('check-circle',14,'var(--green)')} Checklist assinado às ${inst.concluidoEm ? new Date(inst.concluidoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'}
      </div>
    </div>` : ''}
  </div>`;
}

function _ckItemLinha(inst, tmpl, item) {
  const tipo     = item.tipo || 'check';
  const resp     = (inst.respostas||{})[item.id];
  const feito    = !!resp;
  const hasInstr = !!(item.instrucoes || item.videoUrl);
  if (hasInstr) window._ckInstrucoes[item.id] = { instrucoes: item.instrucoes||'', videoUrl: item.videoUrl||'' };
  const itemCor  = tmpl.cor || 'var(--purple)';
  const janela   = _ckEstadoJanela(item, inst.data);
  const foraJanela = !feito && (janela.estado === 'encerrado' || janela.estado === 'aguardando');
  const lbl      = _ckJanelaLabel(janela.j);

  let horaHtml = '';
  if (lbl) {
    if (!feito && janela.estado === 'encerrado')
      horaHtml = `<span style="font-size:var(--text-xs);color:var(--red);display:flex;align-items:center;gap:3px;font-weight:700">${lc('lock',10,'var(--red)')} ${lbl} · encerrado</span>`;
    else if (!feito && janela.estado === 'aguardando')
      horaHtml = `<span style="font-size:var(--text-xs);color:var(--orange-dark);display:flex;align-items:center;gap:3px;font-weight:700">${lc('clock',10,'currentColor')} ${lbl} · abre às ${janela.j.ini}</span>`;
    else
      horaHtml = `<span style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:3px">${lc('clock',10,'currentColor')} ${lbl}</span>`;
  }

  const clicavel = tipo === 'check';
  return `
  <div style="border-bottom:1px solid var(--border);background:${feito ? 'var(--green-light)' : 'var(--surface)'};${foraJanela ? 'opacity:.6' : ''}">
    <div class="ck-item-hit" style="display:flex;align-items:center;min-height:${clicavel?58:46}px;padding:10px 14px;gap:14px;${clicavel?'cursor:pointer':''}"
      ${clicavel ? `role="checkbox" aria-checked="${feito}" tabindex="0"
        onclick="marcarItemCkClick('${inst.id}',${item.id})"
        onkeydown="if(event.key===' '||event.key==='Enter'){event.preventDefault();marcarItemCkClick('${inst.id}',${item.id})}"` : ''}>
      <div style="width:26px;height:26px;min-width:26px;border-radius:7px;
        border:2.5px solid ${feito ? 'var(--green)' : itemCor};
        background:${feito ? 'var(--green)' : 'var(--surface)'};
        display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0">
        ${feito ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-md);font-weight:${feito ? '500' : '600'};color:${feito ? 'var(--muted)' : 'var(--text)'};
          text-decoration:${feito ? 'line-through' : 'none'};line-height:1.4">${_ckEsc(item.texto)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">
          ${horaHtml}
          ${item.obrigatorio ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red)">obrigatório</span>` : ''}
          ${item.exigeEvidencia && tipo === 'check' ? `<span style="font-size:var(--text-2xs);font-weight:600;color:var(--orange-dark);display:flex;align-items:center;gap:3px">${lc('camera',10,'currentColor')} evidência</span>` : ''}
          ${tipo !== 'check' ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple)">${tipo==='numero'?'123 Número':'Aa Texto'}</span>` : ''}
        </div>
        ${feito && resp.evidencia ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:4px;display:flex;align-items:flex-start;gap:4px">${lc('camera',11,'currentColor')} <span>${_ckEsc(resp.evidencia)}</span></div>` : ''}
      </div>
      ${hasInstr ? `
      <button onclick="event.stopPropagation();_ckAbrirInstrucoes(${item.id})" aria-label="Ver instruções"
        style="width:36px;height:36px;min-width:36px;border-radius:50%;background:rgba(0,0,0,.06);
        border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
        ${lc('info',17,'var(--purple)')}
      </button>` : ''}
    </div>
    ${tipo !== 'check' ? `
    <div style="padding:0 14px 12px 54px;display:flex;gap:8px;align-items:center">
      <input id="ck-val-${inst.id}-${item.id}" type="${tipo==='numero'?'number':'text'}"
        value="${_ckEsc(resp?.valor||'')}" aria-label="${_ckEsc(item.texto)}"
        placeholder="${tipo==='numero'?'Valor numérico...':'Descreva o resultado...'}"
        onkeydown="if(event.key==='Enter')_ckSalvarValorItem('${inst.id}',${item.id})"
        style="flex:1;min-width:0;padding:9px 10px;border:1.5px solid ${feito?'var(--green)':'var(--border)'};border-radius:var(--r6);font-size:var(--text-sm);font-family:Inter,sans-serif" step="any">
      <button onclick="event.stopPropagation();_ckSalvarValorItem('${inst.id}',${item.id})"
        style="padding:9px 14px;min-height:40px;border:none;border-radius:var(--r6);background:${feito?'var(--green)':'var(--purple)'};color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">
        ${feito?lc('check',12,'currentColor'):'Salvar'}
      </button>
    </div>` : ''}
  </div>`;
}

// ── Marcação ──────────────────────────────────────────────────
// Retorna true se registrou
async function marcarItemCkClick(instId, itemId) {
  const inst = _ckSessao(instId);
  if (!inst) return false;
  const tmpl = _ckTmpl(inst.templateId);
  const item = tmpl?.itens.find(i => i.id === itemId);
  if (!item || (item.tipo && item.tipo !== 'check')) return false;

  const marcando = !(inst.respostas || {})[itemId];
  const guard = await _ckGuardMarcacao(inst, item, marcando);
  if (!guard) return false;

  let evidencia = null;
  if (marcando && item.exigeEvidencia) {
    evidencia = await _ckPedirTexto({
      titulo: 'Evidência obrigatória', icone: 'camera',
      mensagem: `"${item.texto}" exige evidência. Descreva o que foi verificado (ex.: temperatura, quantidade, estado encontrado).`,
      placeholder: 'Ex.: forno a 280 °C, gás com 60%…', confirmar: 'Concluir item',
    });
    if (!evidencia) return false;
  }

  _ckAtualizarSessao(instId, s => {
    guard.aplicar(s);
    if (!s.respostas) s.respostas = {};
    if (marcando) {
      s.respostas[itemId] = { feito: true, hora: new Date().toISOString(),
        ...(evidencia ? { evidencia } : {}), ...(guard.justificativa ? { justificativa: guard.justificativa } : {}) };
    } else {
      delete s.respostas[itemId];
    }
    _ckRecalcStatus(s, tmpl);
  });
  _renderCkMeu();
  _atualizarBadgeEquipe();
  return true;
}

function marcarItemCk(instId, itemId) {
  return marcarItemCkClick(instId, itemId);
}

async function _ckSalvarValorItem(instId, itemId, valorOverride) {
  let valor;
  if (valorOverride !== undefined) {
    valor = String(valorOverride).trim();
  } else {
    const input = document.getElementById(`ck-val-${instId}-${itemId}`);
    valor = input?.value?.trim();
  }
  if (!valor) { toast('Informe um valor', 'err'); return false; }
  const inst = _ckSessao(instId);
  if (!inst) return false;
  const tmpl = _ckTmpl(inst.templateId);
  const item = tmpl?.itens.find(i => i.id === itemId);
  if (!tmpl || !item) return false;
  const guard = await _ckGuardMarcacao(inst, item, true);
  if (!guard) return false;

  _ckAtualizarSessao(instId, s => {
    guard.aplicar(s);
    if (!s.respostas) s.respostas = {};
    s.respostas[itemId] = { feito: true, valor, hora: new Date().toISOString(),
      ...(guard.justificativa ? { justificativa: guard.justificativa } : {}) };
    _ckRecalcStatus(s, tmpl);
  });
  _renderCkMeu();
  _atualizarBadgeEquipe();
  return true;
}



// ══════════════════════════════════════════════════════════════
// ABA: EQUIPE (GESTOR)
// ══════════════════════════════════════════════════════════════
function _renderCkEquipe() {
  const el   = document.getElementById('ckPanelContent');
  if (!el) return;
  const hoje = _ckHoje();

  if (!window._ckEquipeFiltro) window._ckEquipeFiltro = { data: hoje, userId: '', todos: false };
  const f    = window._ckEquipeFiltro;
  const sFs  = _getCkSessoes().filter(s => s.data === f.data && _ckTmpl(s.templateId)
    && (f.userId ? s.userId === parseInt(f.userId) : true));
  const ehHoje  = f.data === hoje;
  const diaLbl  = ehHoje ? 'hoje' : 'no dia';
  const funcUsers = users.filter(u => u.active !== false);

  const vis = sFs.map(_ckStatusVisual);
  const conta = k => vis.filter(v => v.key === k).length;
  const kpis = [
    { label:'Total',        val:sFs.length,           cor:'var(--purple)', bg:'var(--purple-xlight)' },
    { label:'Concluídos',   val:conta('concluido'),   cor:'var(--green)',  bg:'var(--green-light)' },
    { label:'Em andamento', val:conta('andamento'),   cor:'var(--yellow)', bg:'var(--yellow-light)' },
    f.data < hoje
      ? { label:'Não concluídos', val:conta('atrasado'), cor:'var(--red)', bg:'var(--red-light)' }
      : { label:'Não iniciados',  val:conta('pendente'), cor:'var(--muted)', bg:'var(--surface2)' },
  ];

  // Quem tem pendência primeiro; sem checklist só com "mostrar todos"
  const peso = u => {
    const us = sFs.filter(s => s.userId === u.id);
    return { us, abertos: us.filter(s => s.status !== 'concluido').length };
  };
  const linhas = funcUsers
    .filter(u => f.userId ? u.id === parseInt(f.userId) : true)
    .map(u => ({ u, ...peso(u) }))
    .filter(x => f.todos || f.userId || x.us.length > 0)
    .sort((a, b) => b.abertos - a.abertos || b.us.length - a.us.length || a.u.name.localeCompare(b.u.name));
  const semChecklist = funcUsers.filter(u => !sFs.some(s => s.userId === u.id)).length;

  el.innerHTML = `
    <div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:3px;font-weight:600">Data</div>
          <input type="date" value="${f.data}" class="inp" style="max-width:170px"
            onchange="window._ckEquipeFiltro.data=this.value||'${hoje}';_renderCkEquipe()">
        </div>
        <div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:3px;font-weight:600">Funcionário</div>
          <select class="inp" style="max-width:220px" onchange="window._ckEquipeFiltro.userId=this.value;_renderCkEquipe()">
            <option value="">Todos</option>
            ${funcUsers.map(u => `<option value="${u.id}" ${f.userId==u.id?'selected':''}>${_ckEsc(u.name)}</option>`).join('')}
          </select>
        </div>
        ${!f.userId ? `
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;padding-bottom:8px">
          <input type="checkbox" ${f.todos?'checked':''} onchange="window._ckEquipeFiltro.todos=this.checked;_renderCkEquipe()" style="accent-color:var(--purple)">
          Mostrar quem não tem checklist (${semChecklist})
        </label>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">
        ${kpis.map(k => `
          <div style="background:${k.bg};border:1.5px solid var(--border);border-radius:var(--r10);padding:11px 14px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:${k.cor}">${k.val}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${k.label}</div>
          </div>`).join('')}
      </div>

      ${linhas.length === 0 ? `
        <div style="text-align:center;padding:32px;background:var(--surface2);border-radius:var(--r12);border:1.5px dashed var(--border)">
          ${lc('clipboard-list',28,'var(--muted)')}
          <div style="font-size:var(--text-sm);color:var(--muted);margin-top:10px">Nenhum checklist atribuído ${diaLbl}</div>
        </div>` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${linhas.map(({ u, us }) => {
          const uVis  = us.map(_ckStatusVisual);
          const uConc = uVis.filter(v => v.key === 'concluido').length;
          const uAbert= us.length - uConc;
          return `
          <div class="card" style="overflow:hidden">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--purple);color:#fff;font-size:var(--text-md);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${_ckEsc(u.name.charAt(0).toUpperCase())}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-md);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_ckEsc(u.name)}</div>
                <div style="font-size:var(--text-xs);color:var(--muted)">${_ckEsc(u.funcao||u.role)} · ${us.length} checklist(s) ${diaLbl}</div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex-shrink:0">
                ${uConc > 0 ? `<span style="background:var(--green-light);color:var(--green);border:1px solid var(--green);border-radius:20px;padding:2px 8px;font-size:var(--text-xs);font-weight:700">${uConc} concluído(s)</span>` : ''}
                ${uAbert > 0 ? `<span style="background:${f.data<hoje?'var(--red-light)':'var(--yellow-light)'};color:${f.data<hoje?'var(--red)':'var(--yellow)'};border:1px solid currentColor;border-radius:20px;padding:2px 8px;font-size:var(--text-xs);font-weight:700">${uAbert} em aberto</span>` : ''}
                <button class="btn btn-outline btn-xs" onclick="abrirModalNovaInstanciaUser(${u.id})">+ Atribuir</button>
              </div>
            </div>
            ${us.length === 0 ? `
              <div style="padding:12px 16px;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum checklist atribuído ${diaLbl}</div>
            ` : us.map(s => {
              const tmpl  = _ckTmpl(s.templateId);
              const total = tmpl.itens.length;
              const feitos= _ckFeitos(s, tmpl);
              const pct   = total > 0 ? Math.round(feitos/total*100) : 0;
              const v     = _ckStatusVisual(s);
              return `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                ${lc(v.icon,13,v.cor)}
                <div style="flex:1;min-width:140px">
                  <div style="font-size:var(--text-sm);font-weight:600">${_ckEsc(tmpl.nome)}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${feitos}/${total} itens${s.turno?' · '+_ckEsc(_ckTurnoLabel(s.turno)):''} · <span style="color:${v.cor};font-weight:700">${v.label}</span></div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                  <div style="width:60px;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${v.cor};border-radius:3px"></div>
                  </div>
                  <span style="font-size:var(--text-xs);font-weight:700;color:${v.cor}">${pct}%</span>
                  <button class="btn btn-outline btn-xs" onclick="verDetalheInstancia('${s.id}')">Ver</button>
                </div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>`}
    </div>`;
}

// Badge: checklists de hoje ainda não concluídos
function _atualizarBadgeEquipe() {
  const hoje  = _ckHoje();
  const pend  = _getCkSessoes().filter(s => s.data === hoje && s.status !== 'concluido' && _ckTmpl(s.templateId)).length;
  const badge = document.getElementById('ckBadgeEquipe');
  if (badge) { badge.textContent = pend > 0 ? pend : ''; badge.style.display = pend > 0 ? 'inline' : 'none'; }
  const sbBadge = document.getElementById('badge-checklist');
  if (sbBadge) { sbBadge.style.display = pend > 0 ? 'block' : 'none'; }
}

// ══════════════════════════════════════════════════════════════
// ABA: TEMPLATES
// ══════════════════════════════════════════════════════════════
function _renderCkTemplates() {
  const el    = document.getElementById('ckPanelContent');
  if (!el) return;
  const tmpls = _ckTemplatesVisiveis().sort((a, b) => (b.ativo !== false) - (a.ativo !== false));

  el.innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:2px">Templates de Checklist</h3>
          <div style="font-size:var(--text-xs);color:var(--muted)">Crie e edite os checklists por função e turno</div>
        </div>
        <button onclick="abrirModalNovoTemplate()" class="btn btn-outline btn-sm" style="gap:6px">
          ${lc('plus',13,'currentColor')} Novo template
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${tmpls.map(t => `
          <div class="card" role="button" tabindex="0" style="overflow:hidden;cursor:pointer;${t.ativo===false?'opacity:.6':''}"
            onclick="abrirModalEditarTemplate(${t.id})" onkeydown="if(event.key==='Enter')abrirModalEditarTemplate(${t.id})">
            <div style="padding:14px 16px;background:${t.bg||'var(--surface2)'};border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="font-size:var(--text-md);font-weight:800;color:${t.cor||'var(--text)'}">${_ckEsc(t.nome)}</div>
                <span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;flex-shrink:0;
                  background:${t.ativo!==false?'var(--green-light)':'var(--surface)'};
                  color:${t.ativo!==false?'var(--green)':'var(--muted)'};
                  border:1px solid ${t.ativo!==false?'var(--green)':'var(--border)'}">
                  ${t.ativo!==false?'Ativo':'Inativo'}
                </span>
              </div>
            </div>
            <div style="padding:10px 16px">
              <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:7px">${t.itens.length} itens · ${t.itens.filter(i=>i.obrigatorio).length} obrigatórios</div>
              ${_ckResumoRecorrencia(t)}
              <div style="display:flex;flex-direction:column;gap:4px">
                ${t.itens.slice(0,3).map(i => `
                  <div style="display:flex;align-items:center;gap:7px;font-size:var(--text-xs);color:var(--muted)">
                    <div style="width:5px;height:5px;border-radius:50%;background:${t.cor||'var(--border)'};flex-shrink:0"></div>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_ckEsc(i.texto)}</span>
                  </div>`).join('')}
                ${t.itens.length > 3 ? `<div style="font-size:var(--text-xs);color:var(--muted)">+${t.itens.length-3} mais...</div>` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function _ckResumoRecorrencia(t) {
  const r = t.recorrencia;
  if (!r?.ativa || t.ativo === false) return '';
  const nomesDia = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dias   = (r.dias||[]).slice().sort();
  const nUsers = (r.usuarios||[]).length;
  if (!dias.length || !nUsers) {
    return `<div style="font-size:var(--text-xs);font-weight:700;color:var(--red);margin-bottom:7px;display:flex;align-items:center;gap:4px">
      ${lc('alert-circle',11,'currentColor')} Recorrência incompleta — ${!dias.length ? 'sem dias' : 'sem funcionários'}</div>`;
  }
  const diasLbl = dias.length === 7 ? 'Todos os dias' : dias.map(d => nomesDia[d]).join(', ');
  return `<div style="font-size:var(--text-xs);font-weight:600;color:var(--purple);margin-bottom:7px;display:flex;align-items:center;gap:4px">
    ${lc('repeat',11,'currentColor')} ${diasLbl} · ${nUsers} funcionário${nUsers>1?'s':''}</div>`;
}

// ══════════════════════════════════════════════════════════════
// RECORRÊNCIA — auto-assign diário
// ══════════════════════════════════════════════════════════════

// Roda para qualquer usuário que abrir o Checklist: gestor gera para todos,
// funcionário gera só os próprios — não depende de um gestor abrir a tela no dia.
function _ckAutoAssign() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;
  const isGestor  = _ckIsGestor();
  const hoje      = _ckHoje();
  const diaSemana = _ckDataObj(hoje).getDay();
  const sessoes   = _getCkSessoes();
  const ativos    = new Set(users.filter(x => x.active !== false).map(x => x.id));
  const tmpls     = _ckTemplatesVisiveis().filter(t => t.ativo !== false && t.recorrencia?.ativa);
  let criados = 0;
  tmpls.forEach(tmpl => {
    if (!(tmpl.recorrencia.dias||[]).includes(diaSemana)) return;
    const turno = tmpl.recorrencia.turno || 'diario';
    (tmpl.recorrencia.usuarios||[]).forEach(uid => {
      if (!isGestor && uid !== u.id) return;
      if (!ativos.has(uid)) return;
      if (sessoes.some(s => s.templateId === tmpl.id && s.userId === uid && s.data === hoje)) return;
      sessoes.push({
        id:          'ck-auto-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
        templateId:  tmpl.id,
        userId:      uid,
        data:        hoje,
        turno,
        status:      'pendente',
        criadoPor:   'Sistema (automático)',
        criadoEm:    new Date().toISOString(),
        respostas:   {},
        concluidoEm: null,
      });
      criados++;
    });
  });
  if (criados > 0) {
    _saveCkSessoes(sessoes);
    if (isGestor) toast(`${criados} checklist(s) atribuído(s) automaticamente`);
  }
}

function _ckChipStyle(cb) {
  const label = cb.closest('label');
  if (!label) return;
  label.style.border     = cb.checked ? '1.5px solid var(--purple)' : '1.5px solid var(--border)';
  label.style.background = cb.checked ? 'var(--purple-xlight)'      : 'var(--surface)';
  label.style.color      = cb.checked ? 'var(--purple)'             : 'var(--muted)';
}

// ══════════════════════════════════════════════════════════════
// MODAIS
// ══════════════════════════════════════════════════════════════

function abrirModalNovaInstancia() { _modalAtribuir(null); }
function abrirModalNovaInstanciaUser(userId) { _modalAtribuir(userId); }

function _modalAtribuir(preUserId) {
  document.getElementById('popupCkAtribuir')?.remove();
  const tmpls = _ckTemplatesVisiveis().filter(t => t.ativo !== false);
  const data0 = window._ckEquipeFiltro?.data && _ckTab === 'equipe' ? window._ckEquipeFiltro.data : _ckHoje();

  const popup = document.createElement('div');
  popup.id = 'popupCkAtribuir';
  popup.className = 'ck-overlay';
  popup.innerHTML = `
    <div class="ck-modal" style="max-width:480px" role="dialog" aria-modal="true">
      <div class="ck-modal-head">
        <div style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:7px">${lc('user-check',15,'var(--purple)')} Atribuir Checklist</div>
        <button onclick="document.getElementById('popupCkAtribuir').remove()" aria-label="Fechar" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Funcionário *</label>
          <select id="ckAtribUser" class="inp">
            <option value="">Selecionar funcionário...</option>
            ${users.filter(u=>u.active!==false).map(u => `<option value="${u.id}" ${preUserId==u.id?'selected':''}>${_ckEsc(u.name)} (${_ckEsc(u.role)})</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Template *</label>
          <select id="ckAtribTmpl" class="inp" onchange="const t=_ckTmpl(parseInt(this.value));if(t?.recorrencia?.turno)document.getElementById('ckAtribTurno').value=t.recorrencia.turno">
            <option value="">Selecionar template...</option>
            ${tmpls.map(t => `<option value="${t.id}">${_ckEsc(t.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="f2 ck-f2">
          <div class="field" style="margin:0">
            <label>Data</label>
            <input type="date" id="ckAtribData" class="inp" value="${data0}">
          </div>
          <div class="field" style="margin:0">
            <label>Turno</label>
            <select id="ckAtribTurno" class="inp">
              ${_ckTurnos().map(t=>`<option value="${t.id}">${_ckEsc(t.label)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="ck-modal-foot">
        <button class="btn btn-outline" onclick="document.getElementById('popupCkAtribuir').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAtribuicaoCk()">Atribuir</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function salvarAtribuicaoCk() {
  const userId   = parseInt(document.getElementById('ckAtribUser')?.value);
  const tmplId   = parseInt(document.getElementById('ckAtribTmpl')?.value);
  const data     = document.getElementById('ckAtribData')?.value;
  const turno    = document.getElementById('ckAtribTurno')?.value;
  const u        = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  if (!userId) { toast('Selecione um funcionário','err'); return; }
  if (!tmplId) { toast('Selecione um template','err'); return; }
  if (!data)   { toast('Informe a data','err'); return; }

  const sessoes = _getCkSessoes();
  if (sessoes.some(s => s.templateId === tmplId && s.userId === userId && s.data === data)) {
    const nome = users.find(x => x.id === userId)?.name || 'o funcionário';
    toast(`${nome} já tem esse checklist em ${_ckDataLbl(data,{day:'numeric',month:'short'})}`, 'err');
    return;
  }
  sessoes.push({
    id:          'ck-' + Date.now(),
    templateId:  tmplId,
    userId,
    data,
    turno,
    status:      'pendente',
    criadoPor:   u?.name||'Sistema',
    criadoEm:    new Date().toISOString(),
    respostas:   {},
    concluidoEm: null,
  });
  _saveCkSessoes(sessoes);
  document.getElementById('popupCkAtribuir')?.remove();
  renderChecklist();
  toast('Checklist atribuído!');
}

function excluirInstanciaCk(instId) {
  const inst = _ckSessao(instId);
  if (!inst) return;
  const tmpl = _ckTmpl(inst.templateId);
  const nome = users.find(u => u.id === inst.userId)?.name || '';
  vtpConfirm({
    title: 'Excluir atribuição',
    message: `Remover "${tmpl?.nome || 'checklist'}" de ${nome} (${_ckDataLbl(inst.data,{day:'numeric',month:'short'})})? As respostas registradas serão perdidas.`,
    confirmLabel: 'Excluir',
    onConfirm: () => {
      _saveCkSessoes(_getCkSessoes().filter(s => s.id !== instId));
      try { logAudit('checklist_excluido', (tmpl?.nome || 'Checklist') + ' — ' + nome + ' — ' + inst.data, 'checklist'); } catch(e) {}
      document.getElementById('popupCkDetalhe')?.remove();
      renderChecklist();
      toast('Atribuição excluída.');
    }
  });
}

// Modal: Ver detalhe de uma instância
function verDetalheInstancia(instId) {
  const inst  = _ckSessao(instId);
  if (!inst) return;
  const tmpl  = _ckTmpl(inst.templateId);
  if (!tmpl) return;
  const user  = users.find(u => u.id === inst.userId);
  const total = tmpl.itens.length;
  const feitos= _ckFeitos(inst, tmpl);
  const isGestor = _ckIsGestor();
  const v     = _ckStatusVisual(inst);
  if (!window._ckAvalEstrelas) window._ckAvalEstrelas = {};
  window._ckAvalEstrelas[instId] = inst.avaliacao?.estrelas || 0;

  document.getElementById('popupCkDetalhe')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupCkDetalhe';
  popup.className = 'ck-overlay';
  popup.innerHTML = `
    <div class="ck-modal" style="max-width:600px" role="dialog" aria-modal="true">
      <div class="ck-modal-head" style="background:${tmpl.bg||'var(--surface2)'}">
        <div style="min-width:0">
          <div style="font-size:var(--text-md);font-weight:800;color:${tmpl.cor||'var(--text)'}">${_ckEsc(tmpl.nome)}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${_ckEsc(user?.name||'?')} · ${_ckDataLbl(inst.data,{weekday:'short',day:'numeric',month:'short'})} · <span style="color:${v.cor};font-weight:700">${v.label}</span></div>
        </div>
        <button onclick="document.getElementById('popupCkDetalhe').remove()" aria-label="Fechar" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      ${inst._justificativaAtraso ? `
      <div style="margin:14px 20px 0;padding:8px 12px;border-radius:var(--r8);background:var(--orange-light);font-size:var(--text-xs);color:var(--orange-dark)">
        ${lc('alert-circle',11,'currentColor')} Registrado fora do prazo: ${_ckEsc(inst._justificativaAtraso)}
      </div>` : ''}
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:6px">
        ${tmpl.itens.map(item => {
          const resp  = (inst.respostas||{})[item.id];
          const feito = !!resp;
          const jl    = _ckJanelaLabel(_ckJanela(item));
          return `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:var(--r8);background:${feito?'var(--green-light)':'var(--surface2)'}">
            <div style="width:20px;height:20px;border-radius:5px;border:2px solid ${feito?'var(--green)':'var(--border)'};background:${feito?'var(--green)':'var(--surface)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
              ${feito?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`:''}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:500;color:${feito?'var(--muted)':'var(--text)'};text-decoration:${feito?'line-through':'none'}">${_ckEsc(item.texto)}</div>
              <div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap">
                ${jl?`<span style="font-size:var(--text-2xs);color:var(--muted)">${jl}</span>`:''}
                ${item.obrigatorio?`<span style="font-size:var(--text-2xs);color:var(--red);font-weight:700">obrigatório</span>`:''}
                ${feito && resp.hora ? `<span style="font-size:var(--text-2xs);color:var(--green)">✓ ${new Date(resp.hora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
              </div>
              ${resp?.valor ? `<div style="font-size:var(--text-xs);color:var(--purple);margin-top:4px;font-weight:600">${lc('edit-3',10,'currentColor')} ${_ckEsc(resp.valor)}</div>` : ''}
              ${resp?.evidencia ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:4px;display:flex;align-items:flex-start;gap:4px">${lc('camera',10,'currentColor')} <span>${_ckEsc(resp.evidencia)}</span></div>` : ''}
              ${resp?.justificativa ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:4px;display:flex;align-items:flex-start;gap:4px">${lc('clock',10,'currentColor')} <span>Fora do horário: ${_ckEsc(resp.justificativa)}</span></div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${isGestor ? `
      <div style="padding:14px 20px;border-top:1px solid var(--border)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">
          ${lc('star',13,'var(--yellow)')} Avaliação de qualidade
          ${inst.avaliacao ? `<span style="font-size:var(--text-xs);color:var(--green);font-weight:500">— já avaliado</span>` : ''}
        </div>
        <div style="display:flex;gap:3px;margin-bottom:8px" role="radiogroup" aria-label="Nota">
          ${[1,2,3,4,5].map(n => `
            <button type="button" onclick="_ckSelecionarEstrela(${n},'${instId}')" id="ckStar-${instId}-${n}" aria-label="${n} estrela${n>1?'s':''}"
              style="font-size:1.6rem;cursor:pointer;line-height:1;background:none;border:none;padding:0 2px;color:${(inst.avaliacao?.estrelas||0)>=n?'var(--yellow)':'var(--border)'}">★</button>
          `).join('')}
        </div>
        <textarea id="ckAvalFeedback-${instId}" class="inp"
          style="width:100%;resize:vertical;min-height:58px;font-size:var(--text-sm);font-family:Inter,sans-serif;box-sizing:border-box;margin-bottom:8px"
          placeholder="Feedback para o funcionário (opcional)...">${_ckEsc(inst.avaliacao?.feedback||'')}</textarea>
        <button class="btn btn-primary btn-sm" onclick="avaliarInstanciaCk('${instId}')">
          ${inst.avaliacao ? 'Atualizar avaliação' : 'Salvar avaliação'}
        </button>
      </div>` : ''}
      <div class="ck-modal-foot" style="justify-content:space-between;background:var(--surface2)">
        <div style="font-size:var(--text-sm);color:var(--muted)">
          ${feitos}/${total} itens
          ${inst.concluidoEm ? ` · <span style="font-weight:700;color:var(--green)">${lc('check-circle',12,'currentColor')} Finalizado às ${new Date(inst.concluidoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
        </div>
        ${isGestor ? `<button class="btn btn-red btn-sm" onclick="excluirInstanciaCk('${instId}')">${lc('trash-2',13,'currentColor')} Excluir atribuição</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

// ── Editor de template ────────────────────────────────────────
function abrirModalNovoTemplate()      { _modalTemplate(null); }
function abrirModalEditarTemplate(id)  { _modalTemplate(id); }

const _CK_CORES = [
  { cor:'var(--red)',        bg:'var(--red-light)',     label:'Vermelho' },
  { cor:'var(--purple)',     bg:'var(--purple-xlight)', label:'Roxo' },
  { cor:'var(--green)',      bg:'var(--green-light)',   label:'Verde' },
  { cor:'var(--yellow)',     bg:'var(--yellow-light)',  label:'Laranja' },
  { cor:'var(--chart-2)',    bg:'var(--chart-2-soft)',  label:'Azul' },
];

let _tmplItemCounter = 100;

function _modalTemplate(id, base) {
  document.getElementById('popupCkTemplate')?.remove();
  const tmpl = base || (id ? _ckTmpl(id) : null);
  // Próximo id de item a partir do maior existente — evita ids repetidos no template
  _tmplItemCounter = Math.max(100, ...((tmpl?.itens || []).map(i => Number(i.id) || 0)));
  const itens = tmpl?.itens?.length ? tmpl.itens : [{ id: ++_tmplItemCounter, texto:'', janela:'livre', obrigatorio:false }];
  const ativo = tmpl ? tmpl.ativo !== false : true;
  const corSel = tmpl?.cor || 'var(--red)';

  const popup = document.createElement('div');
  popup.id = 'popupCkTemplate';
  popup.className = 'ck-overlay ck-overlay-top';
  popup.innerHTML = `
    <div class="ck-modal ck-modal-lg" role="dialog" aria-modal="true">
      <div class="ck-modal-head ck-sticky-top">
        <div style="font-size:var(--text-md);font-weight:800">${id ? 'Editar' : base ? 'Duplicar' : 'Novo'} Template</div>
        <div style="display:flex;align-items:center;gap:14px">
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:600;cursor:pointer">
            <input type="checkbox" id="tmplAtivo" ${ativo?'checked':''} style="accent-color:var(--green);width:15px;height:15px"> Ativo
          </label>
          <button onclick="document.getElementById('popupCkTemplate').remove()" aria-label="Fechar" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
        </div>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <div class="ck-f2" style="grid-template-columns:2fr 1fr">
          <div class="field" style="margin:0">
            <label>Nome do checklist *</label>
            <input type="text" id="tmplNome" class="inp" value="${_ckEsc(tmpl?.nome||'')}" placeholder="Ex: Pizzaiolo — Abertura">
          </div>
          <div class="field" style="margin:0">
            <label>Cor</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:6px">
              ${_CK_CORES.map(c => `
                <button type="button" title="${c.label}" aria-label="${c.label}" class="ck-cor-btn"
                  onclick="document.getElementById('tmplCorSel').value='${c.cor}';document.getElementById('tmplBgSel').value='${c.bg}';document.querySelectorAll('.ck-cor-btn').forEach(b=>b.style.outline='none');this.style.outline='2px solid var(--purple)'"
                  style="width:26px;height:26px;border-radius:50%;border:none;outline-offset:2px;background:${c.cor};cursor:pointer;${corSel===c.cor?'outline:2px solid var(--purple)':''}">
                </button>`).join('')}
              <input type="hidden" id="tmplCorSel" value="${corSel}">
              <input type="hidden" id="tmplBgSel" value="${tmpl?.bg||'var(--red-light)'}">
            </div>
          </div>
        </div>

        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:12px 14px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:0">
            <input type="checkbox" id="tmplRecAtiva" ${tmpl?.recorrencia?.ativa?'checked':''}
              onchange="document.getElementById('tmplRecCfg').style.display=this.checked?'flex':'none'"
              style="accent-color:var(--purple);width:15px;height:15px">
            <span style="font-size:var(--text-sm);font-weight:700">Atribuição automática por recorrência</span>
          </label>
          <div id="tmplRecCfg" style="display:${tmpl?.recorrencia?.ativa?'flex':'none'};flex-direction:column;gap:10px;margin-top:10px">
            <div>
              <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);margin-bottom:6px">Dias da semana</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${[{n:0,l:'Dom'},{n:1,l:'Seg'},{n:2,l:'Ter'},{n:3,l:'Qua'},{n:4,l:'Qui'},{n:5,l:'Sex'},{n:6,l:'Sáb'}].map(d => {
                  const sel = (tmpl?.recorrencia?.dias||[]).includes(d.n);
                  return `<label style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:var(--text-xs);font-weight:600;transition:all .15s;border:1.5px solid ${sel?'var(--purple)':'var(--border)'};background:${sel?'var(--purple-xlight)':'var(--surface)'};color:${sel?'var(--purple)':'var(--muted)'}">
                    <input type="checkbox" value="${d.n}" class="tmpl-rec-dia" ${sel?'checked':''}
                      style="position:absolute;opacity:0;width:0;height:0" onchange="_ckChipStyle(this)"> ${d.l}
                  </label>`;
                }).join('')}
              </div>
            </div>
            <div class="ck-f2">
              <div class="field" style="margin:0">
                <label>Turno padrão</label>
                <select id="tmplRecTurno" class="inp">
                  ${_ckTurnos().map(t=>`<option value="${t.id}" ${(tmpl?.recorrencia?.turno||'diario')===t.id?'selected':''}>${_ckEsc(t.label)}</option>`).join('')}
                </select>
              </div>
              <div class="field" style="margin:0">
                <label>Funcionários</label>
                <div style="max-height:150px;overflow-y:auto;border:1.5px solid var(--border);border-radius:var(--r6);padding:6px 8px;background:var(--surface)">
                  ${users.filter(u=>u.active!==false).map(u => `
                  <label style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer;font-size:var(--text-sm)">
                    <input type="checkbox" value="${u.id}" class="tmpl-rec-user" ${(tmpl?.recorrencia?.usuarios||[]).includes(u.id)?'checked':''} style="accent-color:var(--purple)">
                    ${_ckEsc(u.name)}
                  </label>`).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">Itens do checklist</label>
            <span style="font-size:var(--text-xs);color:var(--muted)">O dia operacional vira às ${CK_VIRADA_LBL} — horários de madrugada contam no mesmo dia</span>
          </div>
          <div id="tmplItens" style="display:flex;flex-direction:column;gap:8px">
            ${itens.map(item => _rowItemTemplate(item)).join('')}
          </div>
          <button onclick="adicionarItemTemplate()" class="btn btn-outline btn-sm" style="margin-top:10px;width:100%;justify-content:center">
            ${lc('plus',13,'currentColor')} Adicionar item
          </button>
        </div>
      </div>
      <div class="ck-modal-foot ck-sticky-bottom" style="justify-content:space-between">
        <div style="display:flex;gap:8px">
          ${id ? `<button class="btn btn-red btn-sm" onclick="excluirTemplate(${id})">${lc('trash-2',13,'currentColor')} Excluir</button>
                  <button class="btn btn-outline btn-sm" onclick="duplicarTemplate(${id})">${lc('copy',13,'currentColor')} Duplicar</button>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="document.getElementById('popupCkTemplate').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarTemplate(${id||'null'})">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
  popup.querySelectorAll('textarea[data-field="texto"]').forEach(_ckAutoGrow);
}

function _ckAutoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function _rowItemTemplate(item) {
  const hasExtra = !!(item.instrucoes || item.videoUrl || item.exigeEvidencia);
  const j = _ckJanela(item);
  const id = item.id;
  return `
  <div id="tmplItem-${id}" class="ck-item-edit" data-item-id="${id}">
    <div class="ck-item-top">
      <textarea rows="1" placeholder="Descreva a tarefa..." data-item-id="${id}" data-field="texto" oninput="_ckAutoGrow(this)"
        class="ck-item-texto">${_ckEsc(item.texto||'')}</textarea>
      <div class="ck-item-acoes">
        <button type="button" onclick="_ckMoverItem(${id},-1)" class="ck-icon-btn" aria-label="Mover para cima" title="Mover para cima">${lc('chevron-up',15,'currentColor')}</button>
        <button type="button" onclick="_ckMoverItem(${id},1)"  class="ck-icon-btn" aria-label="Mover para baixo" title="Mover para baixo">${lc('chevron-down',15,'currentColor')}</button>
        <button type="button" onclick="removerItemTemplate(${id})" class="ck-icon-btn" aria-label="Remover item" title="Remover item">${lc('x',15,'currentColor')}</button>
      </div>
    </div>
    <div class="ck-item-opts">
      <select data-item-id="${id}" data-field="tipo" aria-label="Tipo de resposta">
        <option value="check"  ${(item.tipo||'check')==='check'?'selected':''}>✓ Verificar</option>
        <option value="numero" ${item.tipo==='numero'?'selected':''}>123 Número</option>
        <option value="texto"  ${item.tipo==='texto'?'selected':''}>Aa Texto</option>
      </select>
      <span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${lc('clock',13,'var(--muted)')}
        <select data-item-id="${id}" data-field="janela" onchange="_ckJanelaChange(${id})" aria-label="Horário">
          <option value="livre" ${j.tipo==='livre'?'selected':''}>Sem horário</option>
          <option value="ate"   ${j.tipo==='ate'?'selected':''}>Até</option>
          <option value="entre" ${j.tipo==='entre'?'selected':''}>Entre</option>
        </select>
        <input type="time" data-item-id="${id}" data-field="horaIni" value="${j.ini}" aria-label="Início"
          style="display:${j.tipo==='entre'?'inline-block':'none'}">
        <span data-item-id="${id}" data-field="janelaSep" style="font-size:var(--text-xs);color:var(--muted);display:${j.tipo==='entre'?'inline':'none'}">e</span>
        <input type="time" data-item-id="${id}" data-field="horaFim" value="${j.fim}" aria-label="Fim"
          style="display:${j.tipo==='livre'?'none':'inline-block'}">
      </span>
      <label style="display:flex;align-items:center;gap:5px;font-size:var(--text-xs);font-weight:600;white-space:nowrap;cursor:pointer">
        <input type="checkbox" ${item.obrigatorio?'checked':''} data-item-id="${id}" data-field="obrigatorio" style="accent-color:var(--red)"> Obrigatório
      </label>
      <button type="button" onclick="_toggleItemExtra(${id})"
        style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;margin-left:auto;
        padding:4px 2px;font-size:var(--text-xs);font-weight:600;font-family:Inter,sans-serif;
        color:${hasExtra?'var(--purple)':'var(--muted)'}">
        <span id="tmplItemExtraArrow-${id}">${hasExtra ? lc('chevron-up',12,'currentColor') : lc('chevron-down',12,'currentColor')}</span><span id="tmplItemExtraLbl-${id}">${hasExtra ? 'Instruções / evidência' : 'Instruções ou evidência'}</span>
      </button>
    </div>
    <div id="tmplItemExtra-${id}" style="display:${hasExtra?'flex':'none'};flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--border);margin-top:8px">
      <textarea data-item-id="${id}" data-field="instrucoes"
        placeholder="Instruções detalhadas para o funcionário (opcional)..."
        style="width:100%;padding:7px 9px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);resize:vertical;min-height:52px;font-family:Inter,sans-serif;box-sizing:border-box">${_ckEsc(item.instrucoes||'')}</textarea>
      <input type="text" data-item-id="${id}" data-field="videoUrl"
        placeholder="URL do vídeo de instrução (YouTube, Vimeo...)"
        value="${_ckEsc(item.videoUrl||'')}"
        style="padding:7px 9px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm)">
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer">
        <input type="checkbox" ${item.exigeEvidencia?'checked':''} data-item-id="${id}" data-field="exigeEvidencia" style="accent-color:var(--orange-dark)">
        Exige evidência ao concluir (descrição obrigatória do que foi verificado)
      </label>
    </div>
  </div>`;
}

function _ckJanelaChange(itemId) {
  const q = f => document.querySelector(`#tmplItem-${itemId} [data-field="${f}"]`);
  const tipo = q('janela').value;
  q('horaIni').style.display   = tipo === 'entre' ? 'inline-block' : 'none';
  q('janelaSep').style.display = tipo === 'entre' ? 'inline' : 'none';
  q('horaFim').style.display   = tipo === 'livre' ? 'none' : 'inline-block';
}

function _ckMoverItem(itemId, dir) {
  const el = document.getElementById(`tmplItem-${itemId}`);
  if (!el) return;
  const alvo = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
  if (!alvo) return;
  if (dir < 0) el.parentNode.insertBefore(el, alvo);
  else el.parentNode.insertBefore(alvo, el);
}

function adicionarItemTemplate() {
  const wrap = document.getElementById('tmplItens');
  if (!wrap) return;
  const novoItem = { id: ++_tmplItemCounter, texto:'', janela:'livre', obrigatorio:false };
  const div = document.createElement('div');
  div.innerHTML = _rowItemTemplate(novoItem);
  const row = div.firstElementChild;
  wrap.appendChild(row);
  const ta = row.querySelector('[data-field="texto"]');
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ta.focus();
}

function removerItemTemplate(itemId) {
  document.getElementById(`tmplItem-${itemId}`)?.remove();
}

// Retorna null (com toast) se algum horário estiver incompleto/inválido
function _coletarItensTemplate() {
  const wrap = document.getElementById('tmplItens');
  if (!wrap) return [];
  let erro = null;
  const itens = [...wrap.querySelectorAll('.ck-item-edit')].map(row => {
    const id  = parseInt(row.dataset.itemId);
    const q   = f => row.querySelector(`[data-field="${f}"]`);
    const texto   = q('texto').value.trim();
    const janela  = q('janela')?.value || 'livre';
    const horaIni = janela === 'entre' ? (q('horaIni')?.value || '') : '';
    const horaFim = janela !== 'livre' ? (q('horaFim')?.value || '') : '';
    if (texto && !erro) {
      if (janela !== 'livre' && !horaFim)      erro = `"${texto}": informe o horário limite`;
      else if (janela === 'entre' && !horaIni) erro = `"${texto}": informe o horário de início`;
      else if (janela === 'entre' && _ckMin(horaIni) >= _ckMin(horaFim))
        erro = `"${texto}": o início deve ser antes do fim (o dia operacional vira às ${CK_VIRADA_LBL})`;
    }
    return {
      id,
      texto,
      tipo:           q('tipo')?.value || 'check',
      janela, horaIni, horaFim,
      obrigatorio:    q('obrigatorio')?.checked || false,
      instrucoes:     q('instrucoes')?.value.trim() || '',
      videoUrl:       q('videoUrl')?.value.trim() || '',
      exigeEvidencia: q('exigeEvidencia')?.checked || false,
    };
  }).filter(i => i.texto);
  if (erro) { toast(erro, 'err'); return null; }
  return itens;
}

function salvarTemplate(id) {
  const nome   = document.getElementById('tmplNome')?.value.trim();
  if (!nome) { toast('Informe o nome','err'); return; }
  const itens = _coletarItensTemplate();
  if (!itens) return;
  if (!itens.length) { toast('Adicione ao menos 1 item','err'); return; }

  const recorrencia = {
    ativa:    document.getElementById('tmplRecAtiva')?.checked||false,
    dias:     [...document.querySelectorAll('.tmpl-rec-dia:checked')].map(el=>parseInt(el.value)),
    usuarios: [...document.querySelectorAll('.tmpl-rec-user:checked')].map(el=>parseInt(el.value)),
    turno:    document.getElementById('tmplRecTurno')?.value||'diario',
  };
  if (recorrencia.ativa && !recorrencia.dias.length)     { toast('Recorrência: selecione ao menos um dia da semana','err'); return; }
  if (recorrencia.ativa && !recorrencia.usuarios.length) { toast('Recorrência: selecione ao menos um funcionário','err'); return; }

  const tmpls  = _getCkTemplates();
  const data   = {
    nome,
    cor:   document.getElementById('tmplCorSel')?.value||'var(--purple)',
    bg:    document.getElementById('tmplBgSel')?.value||'var(--purple-xlight)',
    ativo: document.getElementById('tmplAtivo')?.checked !== false,
    itens,
    recorrencia,
  };

  if (id && id !== 'null') {
    const idx = tmpls.findIndex(t=>t.id===id);
    if (idx>=0) tmpls[idx] = { ...tmpls[idx], ...data };
    toast('Template atualizado!');
  } else {
    tmpls.push({ id: Math.max(0,...tmpls.map(t=>t.id)) + 1, ...data });
    toast('Template criado!');
  }
  _saveCkTemplates(tmpls);
  document.getElementById('popupCkTemplate')?.remove();
  renderChecklist();
}

// Abre o editor pré-preenchido com uma cópia (só grava ao salvar)
function duplicarTemplate(id) {
  const t = _ckTmpl(id);
  if (!t) return;
  const copia = JSON.parse(JSON.stringify(t));
  copia.nome = t.nome + ' (cópia)';
  copia.recorrencia = { ...(copia.recorrencia || {}), ativa: false, usuarios: [] };
  delete copia.id;
  _modalTemplate(null, copia);
}

function excluirTemplate(id) {
  vtpConfirm({
    title: 'Excluir template',
    message: 'O template some da lista e para de gerar checklists. O histórico já registrado é mantido.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      const tmpls = _getCkTemplates().map(t => t.id === id
        ? { ...t, excluido: true, ativo: false, recorrencia: { ...(t.recorrencia||{}), ativa: false } } : t);
      _saveCkTemplates(tmpls);
      document.getElementById('popupCkTemplate')?.remove();
      renderChecklist();
      toast('Template excluído.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// INSTRUÇÕES / AVALIAÇÃO
// ══════════════════════════════════════════════════════════════

function _toggleItemExtra(id) {
  const el     = document.getElementById(`tmplItemExtra-${id}`);
  const arrow  = document.getElementById(`tmplItemExtraArrow-${id}`);
  if (!el) return;
  const aberto = el.style.display === 'none';
  el.style.display = aberto ? 'flex' : 'none';
  if (arrow) arrow.innerHTML = aberto ? lc('chevron-up',12,'currentColor') : lc('chevron-down',12,'currentColor');
}

function _ckEmbedUrl(url) {
  const yt = String(url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]+)/);
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : '';
}
const _ckUrlSegura = url => /^https?:\/\//i.test(String(url || '')) ? url : '';

function _ckAbrirInstrucoes(itemId) {
  const data = (window._ckInstrucoes||{})[itemId];
  if (!data) return;
  document.getElementById('popupCkInstr')?.remove();
  const embedUrl = _ckEmbedUrl(data.videoUrl);
  const link     = _ckUrlSegura(data.videoUrl);

  const popup = document.createElement('div');
  popup.id = 'popupCkInstr';
  popup.className = 'ck-overlay';
  popup.style.zIndex = '700';
  popup.innerHTML = `
    <div class="ck-modal" style="max-width:520px" role="dialog" aria-modal="true">
      <div class="ck-modal-head ck-sticky-top">
        <div style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:7px">${lc('book-open',15,'var(--purple)')} Instruções</div>
        <button onclick="document.getElementById('popupCkInstr').remove()" aria-label="Fechar" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:18px">
        ${data.instrucoes ? `<p style="font-size:var(--text-md);line-height:1.65;color:var(--text);white-space:pre-wrap;margin:0">${_ckEsc(data.instrucoes)}</p>` : ''}
        ${embedUrl ? `
        <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:var(--r8);overflow:hidden;margin-top:${data.instrucoes?'14px':'0'}">
          <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>
        </div>` : (link ? `<a href="${_ckEsc(link)}" target="_blank" rel="noopener" style="display:inline-flex;gap:4px;margin-top:10px;font-size:var(--text-sm);color:var(--purple);word-break:break-all">${lc('external-link',12,'currentColor')} ${_ckEsc(link)}</a>` : '')}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _ckSelecionarEstrela(n, instId) {
  if (!window._ckAvalEstrelas) window._ckAvalEstrelas = {};
  window._ckAvalEstrelas[instId] = n;
  for (let i = 1; i <= 5; i++) {
    const star = document.getElementById(`ckStar-${instId}-${i}`);
    if (star) star.style.color = i <= n ? 'var(--yellow)' : 'var(--border)';
  }
}

function avaliarInstanciaCk(instId) {
  const estrelas = window._ckAvalEstrelas?.[instId] || 0;
  const feedback = document.getElementById(`ckAvalFeedback-${instId}`)?.value.trim() || '';
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!estrelas) { toast('Selecione uma nota de 1 a 5', 'err'); return; }
  const ok = _ckAtualizarSessao(instId, s => {
    s.avaliacao = { estrelas, feedback, avaliadorId: u?.id, avaliadorNome: u?.name, avaliadoEm: new Date().toISOString() };
  });
  if (!ok) return;
  document.getElementById('popupCkDetalhe')?.remove();
  toast('Avaliação salva!', 'ok');
  renderChecklist();
}


// ══════════════════════════════════════════════════════════════
// ABA: RANKING
// ══════════════════════════════════════════════════════════════

function _renderCkDashboard() {
  const el = document.getElementById('ckPanelContent');
  if (!el) return;
  if (!window._ckDashPer) window._ckDashPer = 'mes';
  const per  = window._ckDashPer;
  const hoje = _ckHoje();
  const base = _ckDataObj(hoje);

  let dInicio;
  if (per === 'semana')   { dInicio = new Date(base); dInicio.setDate(base.getDate() - 7); }
  else if (per === 'mes') { dInicio = new Date(base.getFullYear(), base.getMonth(), 1); }
  else                    { dInicio = new Date(base); dInicio.setDate(base.getDate() - 30); }
  const dStr = _ckData(dInicio);

  // Checklists de hoje ainda abertos não contam contra ninguém — o turno não acabou
  const sf = _getCkSessoes().filter(s => s.data >= dStr && _ckTmpl(s.templateId)
    && (s.data < hoje || s.status === 'concluido'));
  const total  = sf.length;
  const conc   = sf.filter(s => s.status === 'concluido').length;
  const aval   = sf.filter(s => s.avaliacao);
  const mediaGeral = aval.length ? (aval.reduce((a,s) => a + s.avaliacao.estrelas, 0) / aval.length) : null;
  const pctGeral   = total > 0 ? Math.round(conc / total * 100) : 0;

  const stats = users.filter(u => u.active !== false).map(u => {
    const us  = sf.filter(s => s.userId === u.id);
    const uc  = us.filter(s => s.status === 'concluido').length;
    const ua  = us.filter(s => s.avaliacao);
    const um  = ua.length ? (ua.reduce((a,s) => a + s.avaliacao.estrelas, 0) / ua.length) : null;
    const pct = us.length > 0 ? Math.round(uc / us.length * 100) : 0;
    return { u, total: us.length, conc: uc, pct, media: um, score: pct * 0.6 + (um||0) * 8 };
  }).filter(s => s.total > 0).sort((a,b) => b.score - a.score);

  const faixa  = p => p >= 80 ? ['var(--green)','var(--green-light)'] : p >= 50 ? ['var(--yellow)','var(--yellow-light)'] : ['var(--red)','var(--red-light)'];
  const [pctCor, pctBg] = faixa(pctGeral);
  const kpi = (icon, cor, bg, val, label) => `
    <div style="background:${bg};border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 14px;text-align:center">
      <div style="margin-bottom:4px">${lc(icon,18,cor)}</div>
      <div style="font-size:1.3rem;font-weight:800;color:${cor}">${val}</div>
      <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px">${label}</div>
    </div>`;

  el.innerHTML = `
    <div>
      <div style="display:flex;gap:6px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:600;color:var(--muted)">Período:</span>
        ${[{k:'semana',l:'Últimos 7 dias'},{k:'mes',l:'Este mês'},{k:'30dias',l:'Últimos 30 dias'}].map(p => `
          <button onclick="window._ckDashPer='${p.k}';_renderCkDashboard()" aria-pressed="${per===p.k}"
            style="padding:6px 12px;border-radius:20px;border:1.5px solid ${per===p.k?'var(--purple)':'var(--border)'};
            background:${per===p.k?'var(--purple)':'var(--surface)'};color:${per===p.k?'#fff':'var(--muted)'};
            font-size:var(--text-xs);font-weight:${per===p.k?'700':'500'};cursor:pointer">${p.l}</button>
        `).join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:8px">
        ${kpi('clipboard-list','var(--purple)','var(--purple-xlight)', total, 'Checklists')}
        ${kpi('check-circle','var(--green)','var(--green-light)', conc, 'Concluídos')}
        ${kpi('trending-up', pctCor, pctBg, pctGeral + '%', 'Taxa conclusão')}
        ${kpi('star','var(--yellow)','var(--yellow-light)', mediaGeral ? mediaGeral.toFixed(1) : '—', 'Nota média')}
      </div>
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-bottom:24px">Checklists de hoje ainda em aberto não entram no cálculo.</div>

      <div style="margin-bottom:12px">
        <h3 style="font-size:var(--text-md);font-weight:800;margin-bottom:2px">Ranking da Equipe</h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">Pontuação = 60% conclusão + 40% qualidade</div>
      </div>

      ${stats.length === 0 ? `
        <div style="text-align:center;padding:32px;background:var(--surface2);border-radius:var(--r12);border:1.5px dashed var(--border)">
          ${lc('bar-chart-2',28,'var(--muted)')}
          <div style="font-size:var(--text-sm);color:var(--muted);margin-top:10px">Nenhum dado no período selecionado</div>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${stats.map((s, idx) => {
            const posColors = ['var(--rank-gold)','var(--rank-silver)','var(--rank-bronze)'];
            const posColor  = idx < 3 ? posColors[idx] : 'var(--muted)';
            const stars     = s.media !== null ? Math.round(s.media) : 0;
            const [cp]      = faixa(s.pct);
            return `
            <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="font-size:1rem;font-weight:800;color:${posColor};width:22px;text-align:center;flex-shrink:0">${idx+1}</div>
              <div style="width:36px;height:36px;border-radius:50%;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${_ckEsc(s.u.name.charAt(0).toUpperCase())}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:700">${_ckEsc(s.u.name)}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${_ckEsc(s.u.funcao||s.u.role||'')} · ${s.conc}/${s.total} checklist(s)</div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:var(--accent)">${Math.round(s.score)}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">pts</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:${cp}">${s.pct}%</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">conclusão</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:var(--yellow)">${s.media !== null ? s.media.toFixed(1) : '—'}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">qualidade</div>
                </div>
                <div style="display:flex;gap:1px" aria-label="${stars} de 5 estrelas">
                  ${[1,2,3,4,5].map(n => `<span style="font-size:var(--text-xs);color:${n<=stars?'var(--yellow)':'var(--border)'}">★</span>`).join('')}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODO GUIADO
// ══════════════════════════════════════════════════════════════

let _ckGuiadoInstId  = null;
let _ckGuiadoIdx     = 0;
let _ckGuiadoPulados = new Set();

function _ckAbrirModoGuiado(instId) {
  const inst = _ckSessao(instId);
  const tmpl = inst ? _ckTmpl(inst.templateId) : null;
  if (!inst || !tmpl) return;
  _ckGuiadoInstId  = instId;
  _ckGuiadoPulados = new Set();
  // Começa no primeiro item não feito que já pode ser feito; senão, no primeiro não feito
  const naoFeitos = tmpl.itens.map((i, idx) => ({ i, idx })).filter(x => !(inst.respostas||{})[x.i.id]);
  const primeiro  = naoFeitos.find(x => !_ckForaJanela(x.i, inst.data)) || naoFeitos[0];
  _ckGuiadoIdx = primeiro ? primeiro.idx : 0;
  _ckRenderGuiado();
}

function _ckRenderGuiado() {
  const inst  = _ckSessao(_ckGuiadoInstId);
  const tmpl  = inst ? _ckTmpl(inst.templateId) : null;
  if (!inst || !tmpl) return;

  const item  = tmpl.itens[_ckGuiadoIdx];
  if (!item) { _ckGuiadoMostrarConclusao(); return; }

  const total  = tmpl.itens.length;
  const pct    = Math.round((_ckFeitos(inst, tmpl) / total) * 100);
  const cor    = tmpl.cor || 'var(--accent)';
  const feito  = !!(inst.respostas || {})[item.id];
  const jan    = _ckEstadoJanela(item, inst.data);
  const fora   = !feito && (jan.estado === 'aguardando' || jan.estado === 'encerrado');
  const isGestor = _ckIsGestor();
  const lbl    = _ckJanelaLabel(jan.j);

  let instrHtml = '';
  if (item.instrucoes || item.videoUrl) {
    const embedUrl = _ckEmbedUrl(item.videoUrl);
    const link     = _ckUrlSegura(item.videoUrl);
    instrHtml = `
      <div style="background:var(--info-bg);border:1px solid var(--info-border);
        border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-top:var(--space-3)">
        ${item.instrucoes ? `
          <div style="display:flex;gap:var(--space-2);align-items:flex-start;margin-bottom:${embedUrl||link?'var(--space-3)':'0'}">
            ${lc('book-open',14,'var(--info-fg)')}
            <span style="font-size:var(--text-sm);color:var(--fg-muted);line-height:var(--leading-relaxed);white-space:pre-wrap">${_ckEsc(item.instrucoes)}</span>
          </div>` : ''}
        ${embedUrl ? `
          <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:var(--radius-sm);overflow:hidden">
            <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>
          </div>` : (link ? `
          <a href="${_ckEsc(link)}" target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);color:var(--accent)">
            ${lc('external-link',12,'currentColor')} Ver instrução em vídeo
          </a>` : '')}
      </div>`;
  }

  const avisoFora = !fora ? '' : `
    <div style="margin-top:var(--space-3);padding:10px 12px;border-radius:var(--radius-md);display:flex;gap:8px;align-items:flex-start;
      background:${jan.estado==='encerrado'?'var(--danger-bg)':'var(--orange-light)'};
      color:${jan.estado==='encerrado'?'var(--danger-fg)':'var(--orange-dark)'};font-size:var(--text-sm);font-weight:600">
      ${lc(jan.estado==='encerrado'?'lock':'clock',14,'currentColor')}
      <span>${jan.estado==='encerrado' ? `Horário encerrado (${lbl}).` : `Disponível a partir das ${jan.j.ini}.`}
        ${isGestor ? 'Você pode registrar com justificativa.' : 'Pule e siga para os próximos itens.'}</span>
    </div>`;

  const podePular = !item.obrigatorio || fora;
  const mostraFeito = !fora || isGestor;

  document.getElementById('ckGuiadoOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id        = 'ckGuiadoOverlay';
  overlay.className = 'ck-guided-overlay';

  overlay.innerHTML = `
    <div class="ck-guided-card" role="dialog" aria-modal="true" aria-label="Modo guiado">

      <div class="ck-guided-progress-bar">
        <div class="ck-guided-progress-fill" style="width:${pct}%;background:${cor}"></div>
      </div>

      <div class="ck-guided-header">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)">
          <div style="min-width:0">
            <div style="font-size:var(--text-xs);font-weight:700;color:${cor};
              text-transform:uppercase;letter-spacing:var(--tracking-caps);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${_ckEsc(tmpl.nome)}
            </div>
            <div style="font-size:var(--text-2xs);color:var(--fg-subtle);margin-top:2px">
              Item ${_ckGuiadoIdx + 1} de ${total} · ${_ckFeitos(inst, tmpl)} feitos
            </div>
          </div>
          <button onclick="_ckFecharGuiado()" aria-label="Fechar modo guiado"
            style="width:36px;height:36px;min-width:36px;border-radius:50%;border:none;
              background:var(--bg-subtle);cursor:pointer;display:flex;
              align-items:center;justify-content:center;flex-shrink:0">
            ${lc('x', 15, 'var(--fg-muted)')}
          </button>
        </div>
      </div>

      <div class="ck-guided-body">
        <div id="ckGuiadoItemBody" class="ck-item-entrando">
          <div style="font-size:var(--text-xl);font-weight:800;line-height:1.3;
            color:var(--fg);margin-bottom:var(--space-3)">
            ${_ckEsc(item.texto)}
          </div>
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
            ${lbl ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);
                color:var(--fg-subtle);background:var(--bg-subtle);padding:3px 8px;
                border-radius:var(--radius-pill)">
                ${lc('clock',11,'currentColor')} ${lbl}
              </span>` : ''}
            ${item.obrigatorio ? `
              <span style="font-size:var(--text-xs);font-weight:700;color:var(--danger-fg);
                background:var(--danger-bg);padding:3px 8px;border-radius:var(--radius-pill)">
                obrigatório
              </span>` : ''}
            ${item.exigeEvidencia && (item.tipo||'check') === 'check' ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);
                background:var(--orange-light);padding:3px 8px;border-radius:var(--radius-pill)">
                ${lc('camera',11,'currentColor')} exige evidência
              </span>` : ''}
            ${feito ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:700;color:var(--green);
                background:var(--green-light);padding:3px 8px;border-radius:var(--radius-pill)">
                ${lc('check',11,'currentColor')} já feito
              </span>` : ''}
          </div>
          ${avisoFora}
          ${instrHtml}
        </div>
      </div>

      ${item.tipo && item.tipo !== 'check' && mostraFeito ? `
      <div style="padding:0 var(--space-4) var(--space-3)">
        <input id="ck-guided-val-${item.id}" type="${item.tipo==='numero'?'number':'text'}"
          value="${_ckEsc((inst.respostas||{})[item.id]?.valor||'')}" aria-label="${_ckEsc(item.texto)}"
          placeholder="${item.tipo==='numero'?'Informe o valor numérico...':'Descreva o resultado...'}"
          onkeydown="if(event.key==='Enter')_ckGuiadoMarcarFeito()"
          style="width:100%;padding:12px;border:2px solid var(--border);border-radius:var(--r8);
          font-size:var(--text-md);font-family:Inter,sans-serif;box-sizing:border-box" step="any">
      </div>` : ''}
      <div class="ck-guided-actions">
        ${mostraFeito ? `
        <button class="ck-guided-btn-feito" onclick="_ckGuiadoMarcarFeito()">
          ${item.tipo && item.tipo !== 'check' ? lc('save', 18, 'currentColor') : lc('check', 20, 'currentColor')}
          ${feito ? 'Próximo' : item.tipo && item.tipo !== 'check' ? 'Salvar e avançar' : 'Feito'}
        </button>` : ''}
        ${podePular && !feito ? `
          <button class="ck-guided-btn-pular" onclick="_ckGuiadoPular()">
            ${fora ? 'Pular — fazer no horário' : 'Pular este item'}
          </button>` : ''}
      </div>

    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _ckFecharGuiado(); });
}

async function _ckGuiadoMarcarFeito() {
  const inst = _ckSessao(_ckGuiadoInstId);
  const tmpl = inst ? _ckTmpl(inst.templateId) : null;
  if (!inst || !tmpl) return;
  const item = tmpl.itens[_ckGuiadoIdx];
  if (!item) return;

  // Já feito: só avança (não desmarca)
  if (!(inst.respostas||{})[item.id]) {
    const tipo = item.tipo || 'check';
    if (tipo !== 'check') {
      const valor = document.getElementById(`ck-guided-val-${item.id}`)?.value?.trim();
      if (!valor) { toast('Informe um valor', 'err'); return; }
      if (!(await _ckSalvarValorItem(_ckGuiadoInstId, item.id, valor))) return;
    } else if (!(await marcarItemCkClick(_ckGuiadoInstId, item.id))) {
      return;
    }
  }
  _ckGuiadoAvancar();
}

function _ckGuiadoPular() {
  const inst = _ckSessao(_ckGuiadoInstId);
  const tmpl = inst ? _ckTmpl(inst.templateId) : null;
  const item = tmpl?.itens[_ckGuiadoIdx];
  if (item) _ckGuiadoPulados.add(item.id);
  _ckGuiadoAvancar();
}

function _ckGuiadoAvancar() {
  const inst = _ckSessao(_ckGuiadoInstId);
  const tmpl = inst ? _ckTmpl(inst.templateId) : null;
  if (!inst || !tmpl) return;

  // Próximo item não feito e não pulado, a partir do atual (dá a volta)
  const respostas = inst.respostas || {};
  const n = tmpl.itens.length;
  let proximo = -1;
  for (let k = 1; k <= n; k++) {
    const i = (_ckGuiadoIdx + k) % n;
    const it = tmpl.itens[i];
    if (!respostas[it.id] && !_ckGuiadoPulados.has(it.id)) { proximo = i; break; }
  }

  if (proximo === -1) { _ckGuiadoMostrarConclusao(); return; }

  _ckGuiadoIdx = proximo;
  const body = document.getElementById('ckGuiadoItemBody');
  if (body) {
    body.classList.remove('ck-item-entrando');
    body.classList.add('ck-item-saindo');
    setTimeout(() => _ckRenderGuiado(), 140);
  } else {
    _ckRenderGuiado();
  }
}

function _ckGuiadoMostrarConclusao() {
  const overlay = document.getElementById('ckGuiadoOverlay');
  const card    = overlay?.querySelector('.ck-guided-card');
  if (!card) return;

  const inst   = _ckSessao(_ckGuiadoInstId);
  const tmpl   = inst ? _ckTmpl(inst.templateId) : null;
  const nome   = tmpl?.nome || 'Checklist';
  const total  = tmpl ? tmpl.itens.length : 0;
  const feitos = inst && tmpl ? _ckFeitos(inst, tmpl) : 0;
  const concluido = inst?.status === 'concluido';

  if (concluido) {
    card.innerHTML = `
      <div class="state-complete" style="border-radius:var(--radius-2xl);margin:0;min-height:280px;
        justify-content:center;display:flex;flex-direction:column;align-items:center">
        <div class="state-complete-icon">${lc('check-circle', 26, '#fff')}</div>
        <div class="state-complete-title">Checklist concluído!</div>
        <div class="state-complete-sub">${_ckEsc(nome)}</div>
        <div style="margin-top:var(--space-3);font-size:var(--text-sm);opacity:.75;position:relative">
          ${feitos} de ${total} itens realizados
        </div>
        <button onclick="_ckFecharGuiado()"
          style="margin-top:var(--space-6);padding:10px 28px;border-radius:var(--radius-pill);
            border:2px solid rgba(255,255,255,.5);background:transparent;
            color:#fff;font-size:var(--text-sm);font-weight:700;
            cursor:pointer;font-family:var(--font-sans);position:relative">
          Fechar
        </button>
      </div>`;
    return;
  }

  const pendentes = tmpl ? tmpl.itens.filter(i => !(inst.respostas||{})[i.id]) : [];
  card.innerHTML = `
    <div style="padding:var(--space-6) var(--space-5);display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--space-2)">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--orange-light);display:flex;align-items:center;justify-content:center">
        ${lc('clock', 24, 'var(--orange-dark)')}
      </div>
      <div style="font-size:var(--text-lg);font-weight:800;margin-top:var(--space-2)">Por enquanto é isso</div>
      <div style="font-size:var(--text-sm);color:var(--fg-muted)">${_ckEsc(nome)} · ${feitos} de ${total} itens feitos</div>
      <div style="width:100%;margin-top:var(--space-3);display:flex;flex-direction:column;gap:6px;text-align:left">
        ${pendentes.map(i => {
          const e = _ckEstadoJanela(i, inst.data);
          const motivo = e.estado === 'aguardando' ? `abre às ${e.j.ini}` : e.estado === 'encerrado' ? 'horário encerrado' : 'pulado';
          return `<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:var(--r8);background:var(--bg-subtle);font-size:var(--text-sm)">
            ${lc('circle',12,'var(--muted)')}<span style="flex:1;min-width:0">${_ckEsc(i.texto)}</span>
            <span style="font-size:var(--text-2xs);color:var(--muted);white-space:nowrap">${motivo}${i.obrigatorio?' · obrig.':''}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-primary" onclick="_ckFecharGuiado()" style="margin-top:var(--space-4);min-width:160px;justify-content:center">Fechar</button>
    </div>`;
}

function _ckFecharGuiado() {
  document.getElementById('ckGuiadoOverlay')?.remove();
  _ckGuiadoInstId  = null;
  _ckGuiadoIdx     = 0;
  _ckGuiadoPulados = new Set();
  _renderCkMeu();
}

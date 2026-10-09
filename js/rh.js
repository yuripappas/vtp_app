// ══════════════════════════════════════════════════════════════
// RH — Recursos Humanos
// ══════════════════════════════════════════════════════════════

let _rhTab          = 'escala';
let _rhSemana       = '';
let _rhFuncPopupTab = 'periodos';
let _rhIndPer       = '30';
let _rhDiaristaId   = null;
let _rhNewTimeIdx   = 0;

const _RH_TIME_PALETTE = [
  { color:'var(--purple)',      bg:'transparent', border:'var(--purple)'      }, // abertura   — outline lilás
  { color:'var(--orange-dark)', bg:'transparent', border:'var(--orange-dark)' }, // fechamento — outline laranja
  { color:'#111',               bg:'transparent', border:'#111'               }, // admin      — outline preto
  { color:'#0891b2',            bg:'transparent', border:'#0891b2'            }, // extra 4    — outline ciano
  { color:'#dc2626',            bg:'transparent', border:'#dc2626'            }, // extra 5    — outline vermelho
  { color:'var(--muted)', bg:'var(--surface2)', border:'var(--border)'}, // fallback
];

const _RH_PRES_ICONS = {
  presente: { icon:'check-circle', color:'var(--green)',       bg:'var(--green-light)',   title:'Presente' },
  ausente:  { icon:'x-circle',     color:'var(--red)',         bg:'var(--red-light)',     title:'Ausente'  },
  atraso:   { icon:'clock',        color:'var(--orange-dark)', bg:'var(--orange-light)',  title:'Atraso'   },
};

const _RH_DAYS = ['seg','ter','qua','qui','sex','sab','dom'];
const _RH_DLBL = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

const _RH_PRES_CYCLE = [null, 'presente', 'ausente', 'atraso'];

const _RH_PRES_STATUS = {
  presente: { label:'Presente',  color:'var(--green)',       bg:'var(--green-light)'   },
  ausente:  { label:'Ausente',   color:'var(--red)',         bg:'var(--red-light)'     },
  atraso:   { label:'Atraso',    color:'var(--orange-dark)', bg:'var(--orange-light)'  },
};

const _RH_MAT_TIPOS = {
  uniforme:    { label:'Uniforme / EPI',     icon:'shirt'     },
  equipamento: { label:'Equipamento',        icon:'cpu'       },
  documento:   { label:'Documento assinado', icon:'file-text' },
  outro:       { label:'Outro',              icon:'package'   },
};

// ── helpers de semana ISO ──────────────────────────────────────
function _rhIsoWeek(d) {
  d = d || new Date();
  const dt  = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y1  = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk  = Math.ceil(((dt - y1) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
}

function _rhWeekDates(isoWeek) {
  const [y, w] = isoWeek.split('-W').map(Number);
  const jan4   = new Date(y, 0, 4);
  const d0     = jan4.getDay() || 7;
  const start  = new Date(jan4);
  start.setDate(jan4.getDate() - d0 + 1 + (w - 1) * 7);
  return Array.from({length:7}, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function _rhFmtDate(d) {
  return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
}

function _rhIsoDate(d) {
  return d.toISOString().slice(0,10);
}

function _rhNavWeek(delta) {
  const dates = _rhWeekDates(_rhSemana);
  const ref   = new Date(dates[0]);
  ref.setDate(ref.getDate() + delta * 7);
  _rhSemana = _rhIsoWeek(ref);
  _renderRhEscala();
}

// ── verificação de bloqueio por período (férias/licença) ──────
function _rhInPeriodo(funcId, dateIso) {
  const id = String(funcId);
  return rhPeriodos.some(p =>
    String(p.funcionarioId) === id &&
    p.dataInicio <= dateIso &&
    p.dataFim >= dateIso
  );
}

function _rhGetPeriodo(funcId, dateIso) {
  const id = String(funcId);
  return rhPeriodos.find(p =>
    String(p.funcionarioId) === id &&
    p.dataInicio <= dateIso &&
    p.dataFim >= dateIso
  ) || null;
}

// ── alerta: funcionários sem domingo de folga no mês atual ────
function _rhGetDomingoAlerts() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  const sundays = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) {
    sundays.push(_rhIsoDate(new Date(d)));
    d.setDate(d.getDate() + 7);
  }

  if (sundays.length === 0) return [];

  return funcionarios
    .filter(f => f.active !== false)
    .filter(f => {
      return !sundays.some(sunIso => {
        if (_rhInPeriodo(f.id, sunIso)) return true;
        const sunDate = new Date(sunIso + 'T12:00:00');
        const rec  = rhEscalas.find(e => e.semana === _rhIsoWeek(sunDate));
        const turn = rec?.turnos?.[f.id]?.dom;
        return !!(turn && turn.folga);
      });
    })
    .map(f => ({ id: f.id, nome: f.nome }));
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderRh() {
  if (!_rhSemana) _rhSemana = _rhIsoWeek();

  const el = document.getElementById('page-rh');
  el.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
  <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;background:var(--surface);flex-shrink:0">
    ${[
      ['escala',      'calendar',    'Escala'     ],
      ['geral',       'users',       'Diaristas'  ],
      ['indicadores', 'bar-chart-2', 'Indicadores'],
    ].map(([id, icon, label]) => `
    <button onclick="setRhTab('${id}')" id="rhTab-${id}"
      style="display:flex;align-items:center;gap:6px;padding:12px 16px;border:none;background:none;cursor:pointer;font-size:var(--text-sm);font-weight:600;white-space:nowrap;color:${_rhTab===id?'var(--purple)':'var(--muted)'};border-bottom:2.5px solid ${_rhTab===id?'var(--purple)':'transparent'};margin-bottom:-1px">
      ${lc(icon,13,'currentColor')} ${label}
    </button>`).join('')}
  </div>
  <div id="rhContent" style="flex:1;overflow:auto;padding:20px 24px"></div>
</div>`;

  _renderRhTabContent();
}

function setRhTab(tab) {
  _rhTab = tab;
  document.querySelectorAll('[id^="rhTab-"]').forEach(b => {
    const t = b.id.replace('rhTab-','');
    b.style.color             = t === tab ? 'var(--purple)' : 'var(--muted)';
    b.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent';
  });
  _renderRhTabContent();
}

function _renderRhTabContent() {
  if      (_rhTab === 'escala')      _renderRhEscala();
  else if (_rhTab === 'indicadores') _renderRhIndicadores();
  else if (_rhTab === 'geral')       _renderRhGeral();
}

// ══════════════════════════════════════════════════════════════
// ABA ESCALA
// ══════════════════════════════════════════════════════════════

function _renderRhEscala() {
  const el = document.getElementById('rhContent');
  if (!el) return;

  const dates     = _rhWeekDates(_rhSemana);
  const [y, w]    = _rhSemana.split('-W');
  const weekLabel = `Semana ${w}/${y} · ${_rhFmtDate(dates[0])} – ${_rhFmtDate(dates[6])}`;
  const rec       = rhEscalas.find(e => e.semana === _rhSemana) || null;
  const funcs     = funcionarios.filter(f => f.active !== false);
  const today     = new Date().toISOString().slice(0,10);

  const presMap = {};
  rhPresencas.forEach(p => { presMap[`${p.funcionarioId}::${p.data}`] = p; });

  const bannerAval = _rhBannerAvalPendente();
  const domAlerts  = _rhGetDomingoAlerts();
  const alertHtml  = domAlerts.length > 0 ? `
  <div style="background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r12);padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
    <span style="color:var(--yellow);flex-shrink:0;margin-top:1px">${lc('alert-triangle',16,'currentColor')}</span>
    <div>
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--text)">Domingo sem folga — mês atual</div>
      <div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">
        Funcionários sem nenhum domingo de folga programado este mês:
        <strong>${domAlerts.map(a => a.nome).join(', ')}</strong>
      </div>
    </div>
  </div>` : '';

  // Mapa de índice de cada timeKey para cor
  const _timeKeys   = Object.keys(rhConfig.times || {});
  const _timePalIdx = k => { const i = _timeKeys.indexOf(k); return _RH_TIME_PALETTE[Math.min(i, _RH_TIME_PALETTE.length - 1)] || _RH_TIME_PALETTE[3]; };

  const cellContent = (f, dayIdx) => {
    const dk      = _RH_DAYS[dayIdx];
    const dateIso = _rhIsoDate(dates[dayIdx]);
    const turn    = rec?.turnos?.[f.id]?.[dk];
    const presRec = presMap[`${f.id}::${dateIso}`];
    const periodo = _rhGetPeriodo(f.id, dateIso);

    if (periodo) {
      const isFer = periodo.tipo === 'ferias';
      return `<div style="background:${isFer?'var(--purple-xlight)':'var(--surface2)'};border-radius:var(--r8);padding:4px 6px;text-align:center;cursor:default">
        <div style="font-size:var(--text-2xs);font-weight:700;color:${isFer?'var(--purple)':'var(--muted)'};white-space:nowrap">
          ${lc(isFer?'sun':'file-text',10,'currentColor')} ${isFer?'Férias':'Licença'}
        </div>
      </div>`;
    }

    // Turno — tipo com cor ou folga em destaque
    let shiftBadge;
    if (!turn) {
      shiftBadge = `<span style="background:var(--surface2);color:var(--muted);font-size:var(--text-2xs);padding:2px 7px;
        border-radius:99px;cursor:pointer;white-space:nowrap;border:1px dashed var(--border)"
        onclick="event.stopPropagation();_rhAbrirTurno('${f.id}','${dk}',${dayIdx})">+ turno</span>`;
    } else if (turn.folga) {
      shiftBadge = `<div onclick="event.stopPropagation();_rhAbrirTurno('${f.id}','${dk}',${dayIdx})"
        style="background:var(--purple);border-radius:var(--r8);padding:4px 10px;text-align:center;cursor:pointer;min-width:60px">
        <div style="font-size:var(--text-2xs);font-weight:900;color:#fff;letter-spacing:.04em;display:flex;align-items:center;justify-content:center;gap:3px">
          ${lc('moon',9,'#fff')} FOLGA
        </div>
      </div>`;
    } else {
      const storedKey = turn.timeKey && rhConfig.times?.[turn.timeKey] ? turn.timeKey : null;
      const timeKey   = storedKey || rhConfig.cargoParaTime?.[f.cargo] || Object.keys(rhConfig.times||{})[0];
      const timeInfo  = rhConfig.times?.[timeKey];
      if (timeInfo) {
        const pal = _timePalIdx(timeKey);
        shiftBadge = `<span onclick="event.stopPropagation();_rhAbrirTurno('${f.id}','${dk}',${dayIdx})"
          style="background:${pal.bg};color:${pal.color};border:1.5px solid ${pal.border};
          font-size:var(--text-2xs);font-weight:700;padding:3px 10px;border-radius:99px;cursor:pointer;white-space:nowrap;
          display:inline-flex;align-items:center;gap:3px">
          ${lc('clock',9,'currentColor')} ${timeInfo.label}
        </span>`;
      } else {
        const raw = (turn.entrada && turn.saida) ? `${turn.entrada}–${turn.saida}` : 'Manual';
        shiftBadge = `<span onclick="event.stopPropagation();_rhAbrirTurno('${f.id}','${dk}',${dayIdx})"
          style="background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);
          font-size:var(--text-2xs);font-weight:700;padding:2px 8px;border-radius:99px;cursor:pointer;white-space:nowrap">
          ${raw}
        </span>`;
      }
    }

    // Presença — ícone compacto
    const pi = presRec ? _RH_PRES_ICONS[presRec.status] : null;
    const presBadge = pi
      ? `<span title="${pi.title}" onclick="event.stopPropagation();_rhCyclePresenca('${f.id}','${dateIso}')"
          style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
          border-radius:50%;background:${pi.bg};cursor:pointer;flex-shrink:0">
          ${lc(pi.icon,13,pi.color)}
        </span>`
      : `<span onclick="event.stopPropagation();_rhCyclePresenca('${f.id}','${dateIso}')"
          style="border:1px dashed var(--border);color:var(--muted);font-size:var(--text-2xs);
          padding:1px 5px;border-radius:99px;cursor:pointer;white-space:nowrap">
          Marcar
        </span>`;

    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-height:38px;justify-content:center">
      ${shiftBadge}
      ${presBadge}
    </div>`;
  };

  el.innerHTML = `
<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
  <button class="btn btn-ghost" onclick="_rhNavWeek(-1)" style="padding:7px 11px">${lc('chevron-left',15,'currentColor')}</button>
  <span style="font-weight:700;font-size:var(--text-md);flex:1;text-align:center;white-space:nowrap">${weekLabel}</span>
  <button class="btn btn-ghost" onclick="_rhNavWeek(1)" style="padding:7px 11px">${lc('chevron-right',15,'currentColor')}</button>
  <button class="btn btn-ghost" onclick="_rhSemana=_rhIsoWeek();_renderRhEscala()" style="padding:7px 12px;font-size:var(--text-xs);color:var(--purple)">Semana atual</button>
  <div style="width:1px;height:24px;background:var(--border)"></div>
  <button class="btn btn-ghost" onclick="_rhAbrirParticipantes()" style="padding:7px 11px;gap:6px;font-size:var(--text-xs)">
    ${lc('users',13,'currentColor')} Participantes
  </button>
  <button class="btn btn-ghost" onclick="_rhAbrirConfig()" style="padding:7px 11px;gap:6px;font-size:var(--text-xs)">
    ${lc('settings',13,'currentColor')} Config
  </button>
  <button class="btn btn-ghost" onclick="_rhImprimirEscala()" style="padding:7px 11px;gap:6px;font-size:var(--text-xs)">
    ${lc('printer',13,'currentColor')} Imprimir
  </button>
  <div style="position:relative;display:inline-flex" id="rhEscalaMenuWrap">
    <button class="btn btn-primary" onclick="_rhModalAutoEscala()" style="padding:7px 13px;gap:6px;font-size:var(--text-xs);border-radius:var(--r8) 0 0 var(--r8);border-right:1px solid rgba(255,255,255,.25)">
      ${lc('zap',13,'currentColor')} Gerar escala
    </button>
    <button class="btn btn-primary" onclick="event.stopPropagation();_rhToggleEscalaMenu()" style="padding:7px 9px;border-radius:0 var(--r8) var(--r8) 0;border-left:none">
      ${lc('chevron-down',13,'currentColor')}
    </button>
    <div id="rhEscalaMenu" style="display:none;position:absolute;top:calc(100% + 4px);right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:160px;z-index:200;overflow:hidden">
      <button onclick="_rhLimparEscala()" style="display:flex;align-items:center;gap:8px;width:100%;padding:9px 14px;background:none;border:none;cursor:pointer;font-size:var(--text-sm);color:var(--red);font-family:inherit;font-weight:600" onmouseover="this.style.background='var(--red-light)'" onmouseout="this.style.background='none'">
        ${lc('trash-2',14,'currentColor')} Limpar semana
      </button>
    </div>
  </div>
</div>

${bannerAval}
${alertHtml}

${funcs.length === 0 ? _rhEmptyState('users','Nenhum participante na escala','Clique em "Participantes" para adicionar pessoas à escala') : `
<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--r12)">
  <table style="width:100%;border-collapse:collapse;min-width:740px">
    <thead>
      <tr>
        <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--muted);font-weight:700;background:var(--surface2);border-bottom:1px solid var(--border);min-width:160px;position:sticky;left:0;z-index:2">FUNCIONÁRIO</th>
        ${dates.map((d, i) => {
          const iso   = _rhIsoDate(d);
          const isT   = iso === today;
          const isDom = i === 6;
          return `<th style="padding:9px 6px;text-align:center;font-size:var(--text-xs);font-weight:700;background:${isT?'var(--purple-xlight)':isDom?'#FEF2F2':'var(--surface2)'};color:${isT?'var(--purple)':isDom?'var(--red)':'var(--muted)'};border-bottom:1px solid var(--border)">
            ${_RH_DLBL[i]}<br>
            <span style="font-weight:400;font-size:var(--text-2xs)">${_rhFmtDate(d)}</span>
          </th>`;
        }).join('')}
      </tr>
    </thead>
    <tbody>
      ${funcs.map((f, ri) => {
        const cargo = FUNC_CARGOS[f.cargo] || {label:f.cargo||'—',color:'var(--muted)'};
        return `
        <tr style="border-bottom:${ri<funcs.length-1?'1px solid var(--border)':'none'}">
          <td style="padding:9px 14px;background:var(--surface);position:sticky;left:0;z-index:1;cursor:pointer;transition:background .12s"
            onclick="_rhAbrirFuncPopup('${f.id}')"
            onmouseover="this.style.background='var(--purple-xlight)'"
            onmouseout="this.style.background='var(--surface)'">
            <div style="display:flex;align-items:center;gap:9px">
              <div style="width:30px;height:30px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--text-sm);color:var(--purple);flex-shrink:0">${f.nome.charAt(0).toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.nome}</div>
                <div style="font-size:var(--text-2xs);color:${cargo.color};margin-top:1px">${cargo.label}</div>
              </div>
              <span style="color:var(--border);flex-shrink:0">${lc('chevron-right',11,'currentColor')}</span>
            </div>
          </td>
          ${_RH_DAYS.map((dk, di) => {
            const iso   = _rhIsoDate(dates[di]);
            const isT   = iso === today;
            const isDom = di === 6;
            return `<td style="padding:6px;text-align:center;background:${isT?'rgba(107,33,212,.04)':isDom?'rgba(220,38,38,.03)':''};vertical-align:middle">
              ${cellContent(f, di)}
            </td>`;
          }).join('')}
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
<div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap;align-items:center">
  <span style="font-size:var(--text-xs);color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Legenda:</span>
  ${_timeKeys.map((k,i) => {
    const pal = _RH_TIME_PALETTE[Math.min(i, _RH_TIME_PALETTE.length-1)] || _RH_TIME_PALETTE[3];
    const lbl = rhConfig.times?.[k]?.label || k;
    return `<span style="background:${pal.bg};color:${pal.color};border:1.5px solid ${pal.border};font-size:var(--text-2xs);font-weight:700;padding:3px 10px;border-radius:99px;display:inline-flex;align-items:center;gap:3px">${lc('clock',8,'currentColor')} ${lbl}</span>`;
  }).join('')}
  <span style="background:var(--purple);color:#fff;font-size:var(--text-2xs);font-weight:900;padding:2px 9px;border-radius:var(--r6);display:inline-flex;align-items:center;gap:3px">${lc('moon',8,'#fff')} Folga</span>
  <span style="display:inline-flex;align-items:center;gap:3px;font-size:var(--text-2xs);color:var(--green)">${lc('check-circle',12,'currentColor')} Presente</span>
  <span style="display:inline-flex;align-items:center;gap:3px;font-size:var(--text-2xs);color:var(--orange-dark)">${lc('clock',12,'currentColor')} Atraso</span>
  <span style="display:inline-flex;align-items:center;gap:3px;font-size:var(--text-2xs);color:var(--red)">${lc('x-circle',12,'currentColor')} Ausente</span>
</div>`}`;
}

// ── ciclagem de presença na grade ─────────────────────────────
function _rhCyclePresenca(funcId, dateIso) {
  const existing = rhPresencas.find(p => p.data === dateIso && p.funcionarioId === funcId);
  const user     = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  if (!existing) {
    rhPresencas.push({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      data: dateIso, funcionarioId: funcId, status: 'presente',
      obs: '', registradoPor: user?.name || '',
    });
  } else {
    const idx  = _RH_PRES_CYCLE.indexOf(existing.status);
    const next = _RH_PRES_CYCLE[(idx + 1) % _RH_PRES_CYCLE.length];
    if (!next) {
      rhPresencas = rhPresencas.filter(p => !(p.data === dateIso && p.funcionarioId === funcId));
    } else {
      existing.status     = next;
      existing.updated_at = new Date().toISOString();
    }
  }
  saveRhPresencas();
  _renderRhEscala();
}

// ── modal de turno ────────────────────────────────────────────

function _rhGetTimeInfoHtml(timeKey) {
  const t = rhConfig.times?.[timeKey];
  if (!t) return '';
  return `${lc('clock',10,'currentColor')} ${t.entrada} – ${t.saida}${t.intervalo ? ` · ${t.intervalo}min intervalo` : ''}`;
}

function _rhTurnModeChange(mode) {
  const tb = document.getElementById('rhModeTimeBtn');
  const mb = document.getElementById('rhModeManualBtn');
  const ts = document.getElementById('rhTurnTimeSelector');
  const mf = document.getElementById('rhTurnManualFields');
  if (tb) { tb.style.background = mode==='time'?'var(--purple)':'var(--surface)'; tb.style.color = mode==='time'?'#fff':'var(--text2)'; }
  if (mb) { mb.style.background = mode==='manual'?'var(--purple)':'var(--surface)'; mb.style.color = mode==='manual'?'#fff':'var(--text2)'; }
  if (ts) ts.style.display = mode==='time'   ? 'block' : 'none';
  if (mf) mf.style.display = mode==='manual' ? 'block' : 'none';
}

function _rhTurnTimeSelected(sel) {
  const info = document.getElementById('rhTurnTimeInfo');
  if (info) info.innerHTML = _rhGetTimeInfoHtml(sel.value);
}

function _rhAbrirTurno(funcId, dayKey, dayIdx) {
  const func     = funcionarios.find(f => String(f.id) === String(funcId));
  const funcNome = func?.nome || '—';
  const rec      = rhEscalas.find(e => e.semana === _rhSemana);
  const turn     = rec?.turnos?.[funcId]?.[dayKey] || {};
  const isFolga  = !!turn.folga;
  const dates    = _rhWeekDates(_rhSemana);

  const timesEntries = Object.entries(rhConfig.times || {});
  const storedKey    = turn.timeKey && rhConfig.times?.[turn.timeKey] ? turn.timeKey : null;
  const defaultKey   = storedKey || rhConfig.cargoParaTime?.[func?.cargo] || timesEntries[0]?.[0] || '';
  const defaultMode  = (storedKey || (!turn.entrada && !turn.saida)) ? 'time' : 'manual';

  const timesOpts = timesEntries.map(([k,t]) =>
    `<option value="${k}" ${defaultKey===k?'selected':''}>${t.label}</option>`).join('');

  const popup = document.createElement('div');
  popup.className = 'overlay open';
  popup.innerHTML = `
  <div class="modal" style="width:320px;padding:22px" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px">
      <div>
        <div style="font-size:var(--text-md);font-weight:700">${funcNome}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${_RH_DLBL[dayIdx]} · ${_rhFmtDate(dates[dayIdx])}</div>
      </div>
      <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0">${lc('x',16,'currentColor')}</button>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <label id="rhLblTrabalho" style="flex:1;display:flex;align-items:center;gap:7px;padding:9px 12px;border:1.5px solid ${!isFolga?'var(--purple)':'var(--border)'};border-radius:var(--r8);cursor:pointer;background:${!isFolga?'var(--purple-xlight)':'transparent'};font-size:var(--text-sm);font-weight:600">
        <input type="radio" name="rhTurnTipo" value="trabalho" ${!isFolga?'checked':''} onchange="_rhTipoChange(this)"> Trabalhando
      </label>
      <label id="rhLblFolga" style="flex:1;display:flex;align-items:center;gap:7px;padding:9px 12px;border:1.5px solid ${isFolga?'var(--purple)':'var(--border)'};border-radius:var(--r8);cursor:pointer;background:${isFolga?'var(--purple-xlight)':'transparent'};font-size:var(--text-sm);font-weight:600">
        <input type="radio" name="rhTurnTipo" value="folga" ${isFolga?'checked':''} onchange="_rhTipoChange(this)"> Folga
      </label>
    </div>

    <div id="rhTurnTimeFields" style="display:${isFolga?'none':'block'}">

      <div style="display:flex;gap:0;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:14px">
        <button id="rhModeTimeBtn" onclick="_rhTurnModeChange('time')"
          style="flex:1;padding:7px 10px;border:none;cursor:pointer;font-size:var(--text-sm);font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;
          background:${defaultMode==='time'?'var(--purple)':'var(--surface)'};color:${defaultMode==='time'?'#fff':'var(--text2)'}">
          ${lc('users',11,defaultMode==='time'?'#fff':'currentColor')} Time
        </button>
        <button id="rhModeManualBtn" onclick="_rhTurnModeChange('manual')"
          style="flex:1;padding:7px 10px;border:none;border-left:1.5px solid var(--border);cursor:pointer;font-size:var(--text-sm);font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;
          background:${defaultMode==='manual'?'var(--purple)':'var(--surface)'};color:${defaultMode==='manual'?'#fff':'var(--text2)'}">
          ${lc('edit-2',11,defaultMode==='manual'?'#fff':'currentColor')} Manual
        </button>
      </div>

      <div id="rhTurnTimeSelector" style="display:${defaultMode==='time'?'block':'none'};margin-bottom:4px">
        <label class="slbl">Time de trabalho</label>
        <select id="rhTurnTimeKey" class="inp" onchange="_rhTurnTimeSelected(this)">${timesOpts}</select>
        <div id="rhTurnTimeInfo" style="font-size:var(--text-xs);color:var(--muted);margin-top:7px;display:flex;align-items:center;gap:5px">
          ${_rhGetTimeInfoHtml(defaultKey)}
        </div>
      </div>

      <div id="rhTurnManualFields" style="display:${defaultMode==='manual'?'block':'none'}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field">
            <label class="slbl">Entrada</label>
            <input id="rhTurnEntrada" type="time" class="inp" value="${turn.entrada||''}">
          </div>
          <div class="field">
            <label class="slbl">Saída</label>
            <input id="rhTurnSaida" type="time" class="inp" value="${turn.saida||''}">
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_rhSalvarTurno('${funcId}','${dayKey}',this)">Salvar</button>
    </div>
    ${rec?.turnos?.[funcId]?.[dayKey] ? `
    <button onclick="_rhRemoverTurno('${funcId}','${dayKey}',this)"
      style="margin-top:10px;width:100%;background:none;border:none;color:var(--red);font-size:var(--text-xs);cursor:pointer;padding:4px">
      Remover turno
    </button>` : ''}
  </div>`;
  popup.onclick = () => popup.remove();
  document.body.appendChild(popup);
}

function _rhTipoChange(radio) {
  const tf = document.getElementById('rhTurnTimeFields');
  if (tf) tf.style.display = radio.value === 'trabalho' ? 'block' : 'none';
  const modal = radio.closest('.modal');
  modal.querySelectorAll('label[id^="rhLbl"]').forEach(l => {
    const r = l.querySelector('input[type=radio]');
    if (!r) return;
    l.style.borderColor = r.checked ? 'var(--purple)' : 'var(--border)';
    l.style.background  = r.checked ? 'var(--purple-xlight)' : 'transparent';
  });
}

function _rhSalvarTurno(funcId, dayKey, btn) {
  const tipo = btn.closest('.modal').querySelector('input[name=rhTurnTipo]:checked')?.value;

  let rec = rhEscalas.find(e => e.semana === _rhSemana);
  if (!rec) {
    rec = { id: crypto.randomUUID(), semana: _rhSemana, turnos: {}, created_at: new Date().toISOString() };
    rhEscalas.push(rec);
  }
  if (!rec.turnos[funcId]) rec.turnos[funcId] = {};

  if (tipo === 'folga') {
    rec.turnos[funcId][dayKey] = { folga: true };
  } else {
    const isTimeMode = document.getElementById('rhTurnTimeSelector')?.style.display !== 'none';
    if (isTimeMode) {
      const timeKey  = document.getElementById('rhTurnTimeKey')?.value;
      const timeInfo = rhConfig.times?.[timeKey];
      if (!timeKey || !timeInfo) { toast('Selecione um time válido', 'err'); return; }
      rec.turnos[funcId][dayKey] = { folga: false, timeKey, entrada: timeInfo.entrada, saida: timeInfo.saida };
    } else {
      const entrada = document.getElementById('rhTurnEntrada')?.value || '';
      const saida   = document.getElementById('rhTurnSaida')?.value   || '';
      rec.turnos[funcId][dayKey] = { folga: false, entrada, saida };
    }
  }

  saveRhEscalas();
  btn.closest('.overlay').remove();
  _renderRhEscala();
  toast('Turno salvo', 'ok');
}

function _rhRemoverTurno(funcId, dayKey, btn) {
  const rec = rhEscalas.find(e => e.semana === _rhSemana);
  if (rec?.turnos?.[funcId]) delete rec.turnos[funcId][dayKey];
  saveRhEscalas();
  btn.closest('.overlay').remove();
  _renderRhEscala();
}

// ══════════════════════════════════════════════════════════════
// POPUP DO FUNCIONÁRIO (Férias/Licença · HE · Materiais)
// ══════════════════════════════════════════════════════════════

function _rhAbrirFuncPopup(funcId) {
  const func = funcionarios.find(f => String(f.id) === String(funcId));
  if (!func) return;

  document.getElementById('rhFuncPopupOverlay')?.remove();

  const popup = document.createElement('div');
  popup.className = 'overlay open';
  popup.id        = 'rhFuncPopupOverlay';
  popup.innerHTML = _rhBuildFuncPopup(funcId, _rhFuncPopupTab);
  popup.onclick   = e => { if (e.target === popup) popup.remove(); };
  document.body.appendChild(popup);
}

function _rhBuildFuncPopup(funcId, tab) {
  const func  = funcionarios.find(f => String(f.id) === String(funcId));
  if (!func) return '';
  const cargo = FUNC_CARGOS[func.cargo] || {label:func.cargo||'—',color:'var(--muted)'};

  const tabs = [
    ['periodos',  'calendar', 'Férias / Licença'],
    ['he',        'clock',    'Horas Extras'    ],
    ['materiais', 'package',  'Materiais'       ],
  ];

  return `
  <div id="rhFuncPopup" class="modal" style="width:500px;max-height:86vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--text-md);color:var(--purple);flex-shrink:0">${func.nome.charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:var(--text-md);font-weight:700">${func.nome}</div>
        <div style="font-size:var(--text-xs);color:${cargo.color};margin-top:2px">${cargo.label}</div>
      </div>
      <button onclick="document.getElementById('rhFuncPopupOverlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">${lc('x',16,'currentColor')}</button>
    </div>

    <div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 20px">
      ${tabs.map(([t, icon, label]) => `
      <button id="rhFPTab-${t}" onclick="_rhSetFuncPopupTab('${funcId}','${t}')"
        style="display:flex;align-items:center;gap:5px;padding:10px 12px;border:none;background:none;cursor:pointer;font-size:var(--text-sm);font-weight:600;white-space:nowrap;color:${tab===t?'var(--purple)':'var(--muted)'};border-bottom:2px solid ${tab===t?'var(--purple)':'transparent'};margin-bottom:-1px">
        ${lc(icon,12,'currentColor')} ${label}
      </button>`).join('')}
    </div>

    <div id="rhFuncPopupContent" style="flex:1;overflow-y:auto;padding:18px 20px">
      ${_rhFuncTabContent(funcId, tab)}
    </div>
  </div>`;
}

function _rhSetFuncPopupTab(funcId, tab) {
  _rhFuncPopupTab = tab;
  const content = document.getElementById('rhFuncPopupContent');
  if (content) content.innerHTML = _rhFuncTabContent(funcId, tab);
  document.querySelectorAll('[id^="rhFPTab-"]').forEach(b => {
    const t = b.id.replace('rhFPTab-', '');
    b.style.color             = t === tab ? 'var(--purple)' : 'var(--muted)';
    b.style.borderBottomColor = t === tab ? 'var(--purple)' : 'transparent';
  });
}

function _rhFuncTabContent(funcId, tab) {
  if (tab === 'periodos')  return _rhFuncPeriodosHtml(funcId);
  if (tab === 'he')        return _rhFuncHEHtml(funcId);
  if (tab === 'materiais') return _rhFuncMatHtml(funcId);
  return '';
}

// ── Aba Férias / Licença ──────────────────────────────────────
function _rhFuncPeriodosHtml(funcId) {
  const lista = rhPeriodos
    .filter(p => String(p.funcionarioId) === String(funcId))
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));

  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div style="background:var(--surface2);border-radius:var(--r12);padding:16px">
      <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:12px;color:var(--text)">${lc('calendar-plus',14,'var(--purple)')} Adicionar período</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="field" style="grid-column:span 1">
          <label class="slbl">Tipo *</label>
          <select id="fpTipo" class="inp">
            <option value="ferias">Férias</option>
            <option value="licenca">Licença</option>
          </select>
        </div>
        <div class="field">
          <label class="slbl">Data início *</label>
          <input id="fpInicio" type="date" class="inp">
        </div>
        <div class="field">
          <label class="slbl">Data fim *</label>
          <input id="fpFim" type="date" class="inp">
        </div>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label class="slbl">Observação</label>
        <input id="fpObs" type="text" class="inp" placeholder="Opcional">
      </div>
      <button class="btn btn-primary" style="width:100%;padding:9px" onclick="_rhSalvarPeriodo('${funcId}',this)">
        ${lc('plus',14,'currentColor')} Salvar período
      </button>
    </div>

    ${lista.length === 0
      ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:var(--text-sm)">Nenhum período registrado</div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">
        ${lista.map(p => {
          const isFer = p.tipo === 'ferias';
          const ini   = new Date(p.dataInicio+'T12:00:00').toLocaleDateString('pt-BR');
          const fim   = new Date(p.dataFim+'T12:00:00').toLocaleDateString('pt-BR');
          const dias  = Math.round((new Date(p.dataFim+'T12:00:00') - new Date(p.dataInicio+'T12:00:00')) / 86400000) + 1;
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);padding:12px 14px;display:flex;align-items:center;gap:12px">
            <span style="color:${isFer?'var(--purple)':'var(--muted)'};line-height:0;flex-shrink:0">${lc(isFer?'sun':'file-text',16,'currentColor')}</span>
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:700;color:${isFer?'var(--purple)':'var(--text)'}">${isFer?'Férias':'Licença'}</div>
              <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${ini} – ${fim} · ${dias} dia${dias!==1?'s':''}</div>
              ${p.obs ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${p.obs}</div>` : ''}
            </div>
            <button onclick="_rhExcluirPeriodo('${p.id}','${funcId}')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px;line-height:0">${lc('trash-2',14,'currentColor')}</button>
          </div>`;
        }).join('')}
      </div>`}
  </div>`;
}

function _rhSalvarPeriodo(funcId, btn) {
  const tipo   = document.getElementById('fpTipo')?.value;
  const inicio = document.getElementById('fpInicio')?.value;
  const fim    = document.getElementById('fpFim')?.value;
  const obs    = document.getElementById('fpObs')?.value.trim() || '';

  if (!inicio || !fim) { toast('Informe as datas de início e fim', 'err'); return; }
  if (inicio > fim)    { toast('Data de início deve ser anterior ao fim', 'err'); return; }

  rhPeriodos.push({
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    funcionarioId: funcId, tipo, dataInicio: inicio, dataFim: fim, obs,
  });
  saveRhPeriodos();

  const content = document.getElementById('rhFuncPopupContent');
  if (content) content.innerHTML = _rhFuncPeriodosHtml(funcId);
  _renderRhEscala();
  toast('Período salvo', 'ok');
}

function _rhExcluirPeriodo(id, funcId) {
  vtpConfirm({
    title: 'Excluir período',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      rhPeriodos = rhPeriodos.filter(p => p.id !== id);
      saveRhPeriodos();
      const content = document.getElementById('rhFuncPopupContent');
      if (content) content.innerHTML = _rhFuncPeriodosHtml(funcId);
      _renderRhEscala();
    }
  });
}

// ── Aba Horas Extras (no popup) ───────────────────────────────
function _rhFuncHEHtml(funcId) {
  const lista  = rhHorasExtras
    .filter(h => String(h.funcionarioId) === String(funcId))
    .sort((a, b) => b.data.localeCompare(a.data));
  const totalH = lista.reduce((s, h) => s + (parseFloat(h.horas) || 0), 0);

  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div style="background:var(--surface2);border-radius:var(--r12);padding:16px">
      <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:12px">${lc('clock',14,'var(--purple)')} Registrar horas extras</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="field">
          <label class="slbl">Data *</label>
          <input id="fpHeData" type="date" class="inp" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="field">
          <label class="slbl">Horas *</label>
          <input id="fpHeHoras" type="number" step="0.5" min="0.5" max="12" class="inp" placeholder="Ex: 2.5">
        </div>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label class="slbl">Motivo</label>
        <input id="fpHeMotivo" type="text" class="inp" placeholder="Alta demanda, evento especial...">
      </div>
      <div class="field" style="margin-bottom:10px">
        <label class="slbl">Autorizado por *</label>
        <input id="fpHeAutor" type="text" class="inp" placeholder="Nome do responsável">
      </div>
      <button class="btn btn-primary" style="width:100%;padding:9px" onclick="_rhSalvarHEFP('${funcId}',this)">
        ${lc('plus',14,'currentColor')} Registrar
      </button>
    </div>

    ${lista.length === 0
      ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:var(--text-sm)">Nenhuma hora extra registrada</div>`
      : `<div>
          ${totalH > 0 ? `<div style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark);margin-bottom:10px">${lc('clock',13,'currentColor')} Total: ${totalH.toFixed(1)}h</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:7px">
            ${lista.map(h => `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);padding:10px 13px;display:flex;align-items:center;gap:10px">
              <span style="background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm);font-weight:700;padding:3px 10px;border-radius:99px;flex-shrink:0">${parseFloat(h.horas).toFixed(1)}h</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${h.motivo||'—'} · Auth: ${h.autorizadoPor||'—'}</div>
              </div>
              <button onclick="_rhExcluirHEFP('${h.id}','${funcId}')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px;line-height:0">${lc('trash-2',13,'currentColor')}</button>
            </div>`).join('')}
          </div>
        </div>`}
  </div>`;
}

function _rhSalvarHEFP(funcId, btn) {
  const data     = document.getElementById('fpHeData')?.value;
  const horas    = parseFloat(document.getElementById('fpHeHoras')?.value);
  const motivo   = document.getElementById('fpHeMotivo')?.value.trim();
  const autorPor = document.getElementById('fpHeAutor')?.value.trim();

  if (!data || !horas || !autorPor) { toast('Preencha os campos obrigatórios', 'err'); return; }

  rhHorasExtras.push({
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    data, funcionarioId: funcId, horas, motivo, autorizadoPor: autorPor,
  });
  saveRhHorasExtras();
  const content = document.getElementById('rhFuncPopupContent');
  if (content) content.innerHTML = _rhFuncHEHtml(funcId);
  toast('Horas extras registradas', 'ok');
}

function _rhExcluirHEFP(id, funcId) {
  vtpConfirm({
    title: 'Excluir registro',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      rhHorasExtras = rhHorasExtras.filter(h => h.id !== id);
      saveRhHorasExtras();
      const content = document.getElementById('rhFuncPopupContent');
      if (content) content.innerHTML = _rhFuncHEHtml(funcId);
    }
  });
}

// ── Aba Materiais (no popup) ──────────────────────────────────
function _rhFuncMatHtml(funcId) {
  const itens = rhMateriais
    .filter(m => String(m.funcionarioId) === String(funcId))
    .sort((a, b) => b.dataEntrega.localeCompare(a.dataEntrega));

  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div style="background:var(--surface2);border-radius:var(--r12);padding:16px">
      <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:12px">${lc('package',14,'var(--purple)')} Registrar material</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="field">
          <label class="slbl">Tipo *</label>
          <select id="fpMatTipo" class="inp" onchange="_rhFPMatTipoChange()">
            ${Object.entries(_RH_MAT_TIPOS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="fpMatTamanhoField">
          <label class="slbl">Tamanho</label>
          <input id="fpMatTamanho" type="text" class="inp" placeholder="P / M / G / 42">
        </div>
        <div class="field" id="fpMatSerialField" style="display:none">
          <label class="slbl">Nº de série</label>
          <input id="fpMatSerial" type="text" class="inp" placeholder="SN-...">
        </div>
      </div>
      <div class="field" style="margin-bottom:10px">
        <label class="slbl">Descrição *</label>
        <input id="fpMatDesc" type="text" class="inp" placeholder="Ex: Camiseta VTP, Capacete...">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="field">
          <label class="slbl">Data de entrega *</label>
          <input id="fpMatData" type="date" class="inp" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="field">
          <label class="slbl">Entregue por *</label>
          <input id="fpMatEntregador" type="text" class="inp" placeholder="Nome">
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;padding:9px" onclick="_rhSalvarMatFP('${funcId}',this)">
        ${lc('plus',14,'currentColor')} Registrar
      </button>
    </div>

    ${itens.length === 0
      ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:var(--text-sm)">Nenhum material registrado</div>`
      : `<div style="display:flex;flex-direction:column;gap:7px">
          ${itens.map(m => {
            const tipo = _RH_MAT_TIPOS[m.tipo] || _RH_MAT_TIPOS['outro'];
            return `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);padding:10px 13px;display:flex;align-items:center;gap:10px">
              <span style="color:var(--purple);line-height:0;flex-shrink:0">${lc(tipo.icon,15,'currentColor')}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.descricao}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${tipo.label}${m.tamanho?' · '+m.tamanho:''}${m.serialNum?' · #'+m.serialNum:''} · ${new Date(m.dataEntrega+'T12:00:00').toLocaleDateString('pt-BR')}</div>
              </div>
              <button onclick="_rhExcluirMatFP('${m.id}','${funcId}')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px;line-height:0">${lc('trash-2',13,'currentColor')}</button>
            </div>`;
          }).join('')}
        </div>`}
  </div>`;
}

function _rhFPMatTipoChange() {
  const tipo = document.getElementById('fpMatTipo')?.value;
  const tf   = document.getElementById('fpMatTamanhoField');
  const sf   = document.getElementById('fpMatSerialField');
  if (tf) tf.style.display = tipo === 'equipamento' ? 'none' : '';
  if (sf) sf.style.display = tipo === 'equipamento' ? ''     : 'none';
}

function _rhSalvarMatFP(funcId, btn) {
  const tipo         = document.getElementById('fpMatTipo')?.value;
  const descricao    = document.getElementById('fpMatDesc')?.value.trim();
  const tamanho      = document.getElementById('fpMatTamanho')?.value.trim();
  const serialNum    = document.getElementById('fpMatSerial')?.value.trim();
  const dataEntrega  = document.getElementById('fpMatData')?.value;
  const entregadoPor = document.getElementById('fpMatEntregador')?.value.trim();

  if (!tipo || !descricao || !dataEntrega || !entregadoPor) {
    toast('Preencha os campos obrigatórios', 'err'); return;
  }
  rhMateriais.push({
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    funcionarioId: funcId, tipo, descricao, tamanho, serialNum, dataEntrega, entregadoPor,
  });
  saveRhMateriais();
  const content = document.getElementById('rhFuncPopupContent');
  if (content) content.innerHTML = _rhFuncMatHtml(funcId);
  toast('Material registrado', 'ok');
}

function _rhExcluirMatFP(id, funcId) {
  vtpConfirm({
    title: 'Excluir registro',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      rhMateriais = rhMateriais.filter(m => m.id !== id);
      saveRhMateriais();
      const content = document.getElementById('rhFuncPopupContent');
      if (content) content.innerHTML = _rhFuncMatHtml(funcId);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// BANNER DE AVALIAÇÃO PENDENTE
// ══════════════════════════════════════════════════════════════

function _rhGetAvaliacaoPendente() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u || !['gerente','supervisor'].includes(u.role)) return null;

  const hoje = new Date();
  for (let delta = 1; delta <= 4; delta++) {
    const ref = new Date(hoje);
    ref.setDate(ref.getDate() - delta * 7);
    const semana = _rhIsoWeek(ref);
    const dates  = _rhWeekDates(semana);
    if (new Date(dates[6]) >= hoje) continue; // semana ainda não acabou

    const rec = rhEscalas.find(e => e.semana === semana);
    if (!rec) continue;

    const pendentes = funcionarios
      .filter(f => f.active !== false)
      .filter(f => {
        const turnos   = rec.turnos?.[f.id] || {};
        const trabalhou = Object.values(turnos).some(t => t && !t.folga);
        if (!trabalhou) return false;
        // Não incluir quem estava em período (férias/licença) durante toda a semana
        const todosEmPeriodo = _RH_DAYS.every((dk, di) =>
          _rhInPeriodo(f.id, _rhIsoDate(dates[di]))
        );
        if (todosEmPeriodo) return false;
        return !rhAvaliacoes.some(a => String(a.funcionarioId)===String(f.id) && a.semana===semana);
      });

    if (pendentes.length > 0) {
      const [y, w] = semana.split('-W');
      return { semana, pendentes, label: `Semana ${w}/${y}` };
    }
  }
  return null;
}

function _rhBannerAvalPendente() {
  const p = _rhGetAvaliacaoPendente();
  if (!p) return '';
  return `
  <div style="background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r12);
    padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
    <span style="color:var(--yellow);line-height:0;flex-shrink:0">${lc('bell',16,'currentColor')}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:var(--text-sm);font-weight:700">Avaliação pendente — ${p.label}</div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">
        ${p.pendentes.length} funcionário${p.pendentes.length!==1?'s':''} ainda não avaliado${p.pendentes.length!==1?'s':''}
      </div>
    </div>
    <button onclick="setRhTab('indicadores')" class="btn btn-primary"
      style="padding:7px 14px;font-size:var(--text-sm);gap:5px;flex-shrink:0;white-space:nowrap">
      ${lc('clipboard-check',13,'currentColor')} Avaliar equipe
    </button>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ABA INDICADORES
// ══════════════════════════════════════════════════════════════

function _renderRhIndicadores() {
  const el    = document.getElementById('rhContent');
  if (!el) return;
  const funcs = funcionarios.filter(f => f.active !== false);
  const per   = parseInt(_rhIndPer) || 30;

  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() - per);
  const cutoffStr = cutoff.toISOString().slice(0,10);

  const presF = rhPresencas.filter(p => p.data >= cutoffStr);
  const heF   = rhHorasExtras.filter(h => h.data >= cutoffStr);

  const diasComReg = [...new Set(presF.map(p => p.data))].length;

  const semanaAtual = _rhIsoWeek();

  const stats = funcs.map(f => {
    const fid    = String(f.id);
    const fp     = presF.filter(p => String(p.funcionarioId) === fid);
    const nPres  = fp.filter(p => p.status === 'presente').length;
    const nAus   = fp.filter(p => p.status === 'ausente').length;
    const nAtr   = fp.filter(p => p.status === 'atraso').length;
    const total  = fp.length;
    const pRate  = total > 0 ? Math.round((nPres / total) * 100) : null;
    const heTotal= heF.filter(h => String(h.funcionarioId) === fid).reduce((s,h) => s + (parseFloat(h.horas)||0), 0);
    const nMat   = rhMateriais.filter(m => String(m.funcionarioId) === fid).length;
    const nPer   = rhPeriodos.filter(p => String(p.funcionarioId) === fid).length;

    // Avaliação semanal mais recente
    const avaliacoes = rhAvaliacoes.filter(a => String(a.funcionarioId) === fid)
      .sort((a, b) => b.semana.localeCompare(a.semana));
    const ultimaAval = avaliacoes[0] || null;
    const mediaAval  = ultimaAval ? _rhMediaNotas(ultimaAval.notas) : null;
    const avalSemanaAtual = rhAvaliacoes.find(a => String(a.funcionarioId)===fid && a.semana===semanaAtual);

    // Score de checklist (sessões atribuídas a este funcionário)
    let ckScore = null;
    if (typeof sessoes !== 'undefined') {
      const ckSessoes = sessoes.filter(s => {
        if (s.responsavel !== fid && s.responsavel !== f.nome) return false;
        const sd = s.data || s.created_at?.slice(0,10) || '';
        return sd >= cutoffStr;
      });
      if (ckSessoes.length) {
        const scores = ckSessoes
          .map(s => { const total=s.itens?.length||0; const done=s.itens?.filter(i=>i.ok||i.concluido).length||0; return total>0?done/total*100:null; })
          .filter(v=>v!==null);
        if (scores.length) ckScore = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
      }
    }

    return { f, nPres, nAus, nAtr, total, pRate, heTotal, nMat, nPer, mediaAval, avalSemanaAtual, ckScore, ultimaAval };
  });

  const periodos = [{v:'7',l:'7 dias'},{v:'30',l:'30 dias'},{v:'90',l:'3 meses'}];

  el.innerHTML = `
${_rhBannerAvalPendente()}
<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
  <span style="font-size:var(--text-sm);font-weight:600;color:var(--muted)">Período:</span>
  <div style="display:flex;gap:4px">
    ${periodos.map(p => `
    <button onclick="_rhIndPer='${p.v}';_renderRhIndicadores()"
      style="padding:5px 13px;border-radius:99px;border:1.5px solid ${_rhIndPer===p.v?'var(--purple)':'var(--border)'};background:${_rhIndPer===p.v?'var(--purple-xlight)':'transparent'};color:${_rhIndPer===p.v?'var(--purple)':'var(--muted)'};font-size:var(--text-xs);font-weight:600;cursor:pointer">
      ${p.l}
    </button>`).join('')}
  </div>
  <div style="flex:1"></div>
  <span style="font-size:var(--text-xs);color:var(--muted)">${diasComReg} dia${diasComReg!==1?'s':''} com registros</span>
</div>

${funcs.length === 0 ? _rhEmptyState('bar-chart-2','Nenhum funcionário cadastrado','Cadastre funcionários em Cadastros → Funcionários') : `
<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--r12)">
  <table style="width:100%;border-collapse:collapse;min-width:620px">
    <thead>
      <tr style="background:var(--surface2)">
        <th style="padding:10px 14px;text-align:left;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">FUNCIONÁRIO</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">PRESENÇA</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">FALTAS</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">ATRASOS</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">CHECKLIST</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">AVALIAÇÃO</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">H. EXTRAS</th>
        <th style="padding:10px 10px;text-align:center;font-size:var(--text-xs);color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)">STATUS</th>
      </tr>
    </thead>
    <tbody>
      ${stats.map(({f, nPres, nAus, nAtr, total, pRate, heTotal, nMat, mediaAval, avalSemanaAtual, ckScore}, i) => {
        const cargo     = FUNC_CARGOS[f.cargo] || {label:f.cargo||'—', color:'var(--muted)'};
        const presColor = pRate === null ? 'var(--muted)' : pRate >= 90 ? 'var(--green)' : pRate >= 75 ? 'var(--orange-dark)' : 'var(--red)';
        const statusOk  = pRate !== null && pRate >= 90 && nAus === 0;
        const statusBad = pRate !== null && (pRate < 75 || nAus > 1);
        const avalColor = mediaAval === null ? 'var(--muted)' : mediaAval >= 4 ? 'var(--green)' : mediaAval >= 2 ? 'var(--orange-dark)' : 'var(--red)';
        const ckColor   = ckScore === null ? 'var(--muted)' : ckScore >= 90 ? 'var(--green)' : ckScore >= 70 ? 'var(--orange-dark)' : 'var(--red)';
        return `
        <tr style="border-bottom:${i<stats.length-1?'1px solid var(--border)':'none'}"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <td style="padding:10px 14px">
            <div style="display:flex;align-items:center;gap:9px">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--text-sm);color:var(--purple);flex-shrink:0">
                ${f.nome.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-size:var(--text-sm);font-weight:700">${f.nome}</div>
                <div style="font-size:var(--text-xs);color:${cargo.color}">${cargo.label}</div>
              </div>
            </div>
          </td>
          <td style="padding:10px;text-align:center">
            ${pRate === null
              ? `<span style="color:var(--muted);font-size:var(--text-xs)">—</span>`
              : `<span style="font-size:var(--text-md);font-weight:800;color:${presColor}">${pRate}%</span>`}
            ${total > 0 ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${nPres}/${total} dias</div>` : ''}
          </td>
          <td style="padding:10px;text-align:center">
            <span style="font-size:var(--text-md);font-weight:700;color:${nAus>0?'var(--red)':'var(--green)'}">${nAus}</span>
          </td>
          <td style="padding:10px;text-align:center">
            <span style="font-size:var(--text-md);font-weight:700;color:${nAtr>0?'var(--orange-dark)':'var(--green)'}">${nAtr}</span>
          </td>
          <td style="padding:10px;text-align:center">
            ${ckScore !== null
              ? `<span style="font-size:var(--text-sm);font-weight:800;color:${ckColor}">${ckScore}%</span>`
              : `<span style="color:var(--muted);font-size:var(--text-xs)">—</span>`}
          </td>
          <td style="padding:10px;text-align:center">
            <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
              ${mediaAval !== null
                ? `<span style="font-size:var(--text-sm);font-weight:800;color:${avalColor}">${_rhNotaLabel(Math.round(mediaAval))}</span>`
                : `<span style="color:var(--muted);font-size:var(--text-xs)">—</span>`}
              <button onclick="_rhAbrirAvaliacaoSemanal('${f.id}')"
                style="font-size:var(--text-2xs);padding:2px 6px;border-radius:4px;border:1px solid ${avalSemanaAtual?'var(--green)':'var(--border)'};
                background:${avalSemanaAtual?'var(--green-light)':'var(--surface2)'};color:${avalSemanaAtual?'var(--green)':'var(--muted)'};cursor:pointer;white-space:nowrap">
                ${avalSemanaAtual?'✓ Avaliado':'+ Avaliar'}
              </button>
            </div>
          </td>
          <td style="padding:10px;text-align:center">
            ${heTotal > 0
              ? `<span style="font-size:var(--text-sm);font-weight:700;color:var(--orange-dark)">${heTotal.toFixed(1)}h</span>`
              : `<span style="color:var(--muted);font-size:var(--text-xs)">—</span>`}
          </td>
          <td style="padding:10px;text-align:center">
            ${pRate === null
              ? `<span style="font-size:var(--text-xs);color:var(--muted)">Sem dados</span>`
              : statusOk
                ? `<span style="background:var(--green-light);color:var(--green);font-size:var(--text-xs);font-weight:700;padding:3px 9px;border-radius:99px">Em dia</span>`
                : statusBad
                  ? `<span style="background:var(--red-light);color:var(--red);font-size:var(--text-xs);font-weight:700;padding:3px 9px;border-radius:99px">Atenção</span>`
                  : `<span style="background:var(--yellow-light);color:var(--yellow);font-size:var(--text-xs);font-weight:700;padding:3px 9px;border-radius:99px">Regular</span>`}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px">
  ${[
    { label:'Funcionários ativos', value: funcs.length,                                                     icon:'users',    color:'var(--purple)'      },
    { label:'Dias registrados',    value: diasComReg,                                                        icon:'calendar', color:'var(--green)'       },
    { label:'Total H. extras',     value: heF.reduce((s,h)=>s+(parseFloat(h.horas)||0),0).toFixed(1)+'h',   icon:'clock',    color:'var(--orange-dark)' },
    { label:'Materiais entregues', value: rhMateriais.length,                                                icon:'package',  color:'var(--purple)'      },
    { label:'Períodos de ausência',value: rhPeriodos.length,                                                 icon:'calendar-off', color:'var(--muted)'  },
  ].map(k => `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r12);padding:14px 16px;display:flex;align-items:center;gap:12px">
    <span style="color:${k.color};line-height:0">${lc(k.icon,18,'currentColor')}</span>
    <div>
      <div style="font-size:1.1rem;font-weight:800;color:${k.color}">${k.value}</div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${k.label}</div>
    </div>
  </div>`).join('')}
</div>`}`;
}

// ══════════════════════════════════════════════════════════════
// ABA GERAL — BANCO DE DIARISTAS
// ══════════════════════════════════════════════════════════════

let _rhDiaristaFiltro    = '';
let _rhDiaristaFiltroEsp = '';
const _RH_DECISAO = {
  chamar_novamente: { label:'Chamar novamente', color:'var(--green)',       bg:'var(--green-light)',   icon:'refresh-cw' },
  contratar:        { label:'Contratar',        color:'var(--purple)',      bg:'var(--purple-xlight)', icon:'user-plus'  },
  bloquear:         { label:'Bloquear',         color:'var(--red)',         bg:'var(--red-light)',     icon:'ban'        },
};

function _renderRhGeral() {
  const el = document.getElementById('rhContent');
  if (!el) return;

  const esps = [...new Set(rhDiaristas.map(d => d.especialidade).filter(Boolean))].sort();

  el.innerHTML = `
<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
  <input id="rhDiaristaSearch" class="inp" placeholder="Buscar por nome..."
    style="flex:1;min-width:160px" oninput="_rhDiaristaFiltro=this.value;_rhRenderDiaristaLista()"
    value="${_rhDiaristaFiltro.replace(/"/g,'&quot;')}">
  <select id="rhDiaristaFiltroEsp" class="inp" style="width:180px;flex-shrink:0"
    onchange="_rhDiaristaFiltroEsp=this.value;_rhRenderDiaristaLista()">
    <option value="">Todas especialidades</option>
    ${esps.map(e => `<option value="${e}" ${_rhDiaristaFiltroEsp===e?'selected':''}>${e}</option>`).join('')}
  </select>
  <button class="btn btn-primary" style="gap:6px;padding:8px 14px;font-size:var(--text-sm);flex-shrink:0"
    onclick="_rhAbrirDiarista(null)">
    ${lc('plus',13,'currentColor')} Novo diarista
  </button>
</div>
<div id="rhDiaristaLista"></div>`;

  _rhRenderDiaristaLista();
}

function _rhRenderDiaristaLista() {
  const el = document.getElementById('rhDiaristaLista');
  if (!el) return;

  const q = _rhDiaristaFiltro.toLowerCase();
  const lista = rhDiaristas
    .filter(d => (!q || d.nome.toLowerCase().includes(q)))
    .filter(d => (!_rhDiaristaFiltroEsp || d.especialidade === _rhDiaristaFiltroEsp))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const _mediaAval = d => {
    if (!d.avaliacoes?.length) return null;
    return _rhMediaNotas(d.avaliacoes[d.avaliacoes.length - 1]?.notas);
  };

  if (!lista.length) {
    el.innerHTML = _rhEmptyState('users','Nenhum diarista encontrado','Ajuste os filtros ou cadastre um novo diarista');
    return;
  }

  el.innerHTML = `
<div style="border:1px solid var(--border);border-radius:var(--r12);overflow:hidden">
  <div style="display:grid;grid-template-columns:1fr 140px 110px 80px 100px 36px;gap:8px;
    padding:8px 14px;background:var(--surface2);border-bottom:1px solid var(--border)">
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted)">NOME</span>
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted)">ESPECIALIDADE</span>
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted)">TELEFONE</span>
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-align:center">AVALIAÇÃO</span>
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted)">DECISÃO</span>
    <span></span>
  </div>
  ${lista.map((d, i) => {
    const media = _mediaAval(d);
    const dec   = d.decisao ? _RH_DECISAO[d.decisao] : null;
    const border = i < lista.length - 1 ? 'border-bottom:1px solid var(--border)' : '';
    return `
    <div style="display:grid;grid-template-columns:1fr 140px 110px 80px 100px 36px;gap:8px;
      align-items:center;padding:9px 14px;cursor:pointer;transition:background .12s;${border}"
      onclick="_rhAbrirDiarista('${d.id}')"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="display:flex;align-items:center;gap:9px;min-width:0">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--purple-xlight);
          display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--text-sm);
          color:var(--purple);flex-shrink:0">${d.nome.charAt(0).toUpperCase()}</div>
        <span style="font-size:var(--text-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.nome}</span>
      </div>
      <span style="font-size:var(--text-sm);color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.especialidade||'—'}</span>
      <span style="font-size:var(--text-xs);color:var(--muted)">${d.telefone||'—'}</span>
      <span style="font-size:var(--text-xs);font-weight:700;text-align:center;color:${media!==null?_rhNotaColor(Math.round(media)):'var(--border)'}">
        ${media !== null ? _rhNotaLabel(Math.round(media)) : '—'}
      </span>
      <span>${dec ? `<span style="padding:2px 8px;border-radius:6px;font-size:var(--text-2xs);font-weight:700;
        background:${dec.bg};color:${dec.color};display:inline-flex;align-items:center;gap:3px;white-space:nowrap">
        ${lc(dec.icon,9,'currentColor')} ${dec.label}</span>` : ''}</span>
      <span style="color:var(--muted);line-height:0">${lc('chevron-right',14,'currentColor')}</span>
    </div>`;
  }).join('')}
</div>`;
}

function _rhEspChange(sel) {
  const inp = document.getElementById('dEspNova');
  if (!inp) return;
  if (sel.value === '__add__') {
    inp.style.display = 'block';
    sel.value = '';
    inp.focus();
  } else {
    inp.style.display = 'none';
    inp.value = '';
  }
}

function _rhAbrirDiarista(id) {
  _rhDiaristaId = id;
  const d = id ? rhDiaristas.find(x => x.id === id) : null;

  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.innerHTML = `
  <div class="modal" style="width:540px;max-height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="font-size:var(--text-md);font-weight:700">${d ? d.nome : 'Novo diarista'}</div>
      <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">${lc('x',16,'currentColor')}</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:18px">

      <!-- Dados básicos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="grid-column:1/-1">
          <label class="slbl">Nome completo *</label>
          <input id="dNome" class="inp" value="${d?.nome||''}" placeholder="Nome do diarista">
        </div>
        <div class="field">
          <label class="slbl">Telefone</label>
          <input id="dTel" class="inp" value="${d?.telefone||''}" placeholder="(82) 9 9999-9999">
        </div>
        <div class="field">
          <label class="slbl">Especialidade</label>
          ${(() => {
            const esp  = d?.especialidade || '';
            const list = rhConfig.especialidadesDiarista || [];
            const known = list.includes(esp);
            return `<select id="dEsp" class="inp" onchange="_rhEspChange(this)">
              <option value="">Selecionar...</option>
              ${list.map(e => `<option value="${e}"${esp===e?' selected':''}>${e}</option>`).join('')}
              ${esp && !known ? `<option value="${esp}" selected>${esp}</option>` : ''}
              <option value="__add__">+ Adicionar especialidade</option>
            </select>
            <input id="dEspNova" class="inp" placeholder="Nova especialidade..." style="display:none;margin-top:6px">`;
          })()}
        </div>
      </div>

      <!-- Avaliação qualitativa -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Nova avaliação</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_RH_AVAL_TOPICOS.map(t => _rhTriBtn('daval_', t, '')).join('')}
        </div>
        <div class="field" style="margin-top:8px">
          <label class="slbl">Observação desta avaliação</label>
          <input id="dAvalObs" class="inp" placeholder="Pontos fortes, situações específicas...">
        </div>
      </div>

      <!-- Decisão -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Decisão</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          ${Object.entries(_RH_DECISAO).map(([k,v]) => `
          <label id="dDecBtn_${k}" onclick="_rhDecisaoClick('${k}')"
            style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:9px 8px;
            border:1.5px solid ${d?.decisao===k?v.color:'var(--border)'};border-radius:var(--r8);cursor:pointer;
            background:${d?.decisao===k?v.bg:'transparent'};font-size:var(--text-xs);font-weight:700;color:${d?.decisao===k?v.color:'var(--muted)'};
            transition:all .15s;text-align:center;flex-direction:column;gap:3px">
            ${lc(v.icon,13,'currentColor')}
            <span>${v.label}</span>
          </label>`).join('')}
        </div>
        <input type="hidden" id="dDecisao" value="${d?.decisao||''}">
        <div class="field">
          <label class="slbl">Observação da decisão</label>
          <input id="dObsDecisao" class="inp" value="${d?.obsDecisao||''}" placeholder="Motivo da decisão, quando chamar novamente...">
        </div>
      </div>

      ${d?.avaliacoes?.length ? `
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Histórico de avaliações</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${[...d.avaliacoes].reverse().slice(0,5).map(av => {
            const media = _rhMediaNotas(av.notas);
            const mediaTxt = media !== null ? _rhNotaLabel(Math.round(media)) : '—';
            const mediaClr = media !== null ? _rhNotaColor(Math.round(media)) : 'var(--muted)';
            const dt = av.data ? new Date(av.data+'T12:00:00').toLocaleDateString('pt-BR') : '—';
            return `<div style="background:var(--surface2);border-radius:var(--r8);padding:9px 12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:var(--text-xs);font-weight:700;color:${mediaClr}">${lc('award',11,'currentColor')} ${mediaTxt}</span>
                <span style="font-size:var(--text-xs);color:var(--muted)">${dt}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                ${_RH_AVAL_TOPICOS.map(t => {
                  const nota = av.notas?.[t.id];
                  if (nota === undefined || nota === null) return '';
                  const clr = _rhNotaColor(nota);
                  return `<span style="font-size:var(--text-2xs);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 7px;color:${clr};font-weight:700">${t.label}: ${_rhNotaLabel(nota)}</span>`;
                }).join('')}
              </div>
              ${av.obs ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:5px">${av.obs}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    </div>

    <div style="display:flex;gap:8px;padding:16px 22px;border-top:1px solid var(--border);flex-shrink:0">
      ${d ? `<button class="btn btn-ghost" style="color:var(--red);border-color:var(--red-light)"
        onclick="_rhExcluirDiarista('${d.id}',this)">Excluir</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" onclick="_rhSalvarDiarista(this)">Salvar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

const _RH_TRI = [
  { val: 0, label: 'Ruim',    color: 'var(--red)',         bg: 'var(--red-light)'    },
  { val: 3, label: 'Regular', color: 'var(--orange-dark)', bg: 'var(--orange-light)' },
  { val: 5, label: 'Ótimo',   color: 'var(--green)',       bg: 'var(--green-light)'  },
];

const _rhNotaLabel = v => v === 0 ? 'Ruim' : v === 3 ? 'Regular' : v === 5 ? 'Ótimo' : `${v}`;
const _rhNotaColor = v => v === 0 ? 'var(--red)' : v === 3 ? 'var(--orange-dark)' : 'var(--green)';

function _rhTriBtn(prefix, topic, currentVal) {
  const inputId = `${prefix}${topic.id}`;
  const cur     = (currentVal !== undefined && currentVal !== null && currentVal !== '') ? String(currentVal) : '';
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px;background:var(--surface2);border-radius:var(--r8)">
    <span style="font-size:var(--text-sm);font-weight:600;flex:1;min-width:0">${topic.label}</span>
    <div style="display:flex;gap:4px;flex-shrink:0">
      ${_RH_TRI.map(o => {
        const active = cur === String(o.val);
        return `<button id="${inputId}_${o.val}" onclick="_rhTriClick('${inputId}',${o.val})"
          style="padding:3px 10px;border-radius:99px;font-size:var(--text-xs);font-weight:700;cursor:pointer;white-space:nowrap;
          border:1.5px solid ${active?o.color:'var(--border)'};background:${active?o.bg:'transparent'};
          color:${active?o.color:'var(--muted)'};transition:all .12s">${o.label}</button>`;
      }).join('')}
      <input type="hidden" id="${inputId}" value="${cur}">
    </div>
  </div>`;
}

function _rhTriClick(inputId, val) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.value = String(val);
  _RH_TRI.forEach(o => {
    const btn = document.getElementById(`${inputId}_${o.val}`);
    if (!btn) return;
    const active = String(val) === String(o.val);
    btn.style.borderColor = active ? o.color : 'var(--border)';
    btn.style.background  = active ? o.bg    : 'transparent';
    btn.style.color       = active ? o.color : 'var(--muted)';
  });
}

function _rhMediaNotas(notas) {
  const vals = Object.values(notas || {}).filter(v => typeof v === 'number' && !isNaN(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function _rhDecisaoClick(key) {
  document.getElementById('dDecisao').value = key;
  Object.entries(_RH_DECISAO).forEach(([k, v]) => {
    const btn = document.getElementById(`dDecBtn_${k}`);
    if (!btn) return;
    const active = k === key;
    btn.style.borderColor = active ? v.color : 'var(--border)';
    btn.style.background  = active ? v.bg    : 'transparent';
    btn.style.color       = active ? v.color : 'var(--muted)';
  });
}

function _rhSalvarDiarista(btn) {
  const nome = document.getElementById('dNome')?.value.trim();
  if (!nome) { toast('Informe o nome do diarista', 'err'); return; }

  const notas = {};
  _RH_AVAL_TOPICOS.forEach(t => {
    const raw = document.getElementById(`daval_${t.id}`)?.value;
    if (raw !== '' && raw !== null && raw !== undefined) notas[t.id] = parseInt(raw);
  });
  const avalObs  = document.getElementById('dAvalObs')?.value.trim() || '';
  const decisao  = document.getElementById('dDecisao')?.value || null;
  const obsDecisao = document.getElementById('dObsDecisao')?.value.trim() || '';
  const telefone   = document.getElementById('dTel')?.value.trim() || '';
  const novaEsp    = document.getElementById('dEspNova')?.value.trim() || '';
  const selEsp     = document.getElementById('dEsp')?.value || '';
  const especialidade = novaEsp || selEsp || '';
  if (novaEsp) {
    if (!rhConfig.especialidadesDiarista) rhConfig.especialidadesDiarista = [];
    if (!rhConfig.especialidadesDiarista.includes(novaEsp)) {
      rhConfig.especialidadesDiarista.push(novaEsp);
      saveRhConfig();
    }
  }

  const temNotas = Object.keys(notas).length > 0;
  const novaAval = temNotas ? {
    id: crypto.randomUUID(),
    data: new Date().toISOString().slice(0,10),
    notas,
    obs: avalObs,
  } : null;

  if (_rhDiaristaId) {
    const d = rhDiaristas.find(x => x.id === _rhDiaristaId);
    if (d) {
      d.nome = nome; d.telefone = telefone; d.especialidade = especialidade;
      d.decisao = decisao || null; d.obsDecisao = obsDecisao;
      if (novaAval) d.avaliacoes.push(novaAval);
      d.updated_at = new Date().toISOString();
    }
  } else {
    rhDiaristas.push({
      id: crypto.randomUUID(), created_at: new Date().toISOString(),
      nome, telefone, especialidade,
      avaliacoes: novaAval ? [novaAval] : [],
      decisao: decisao || null, obsDecisao,
    });
  }

  saveRhDiaristas();
  btn.closest('.overlay').remove();
  _renderRhGeral();
  toast(_rhDiaristaId ? 'Diarista atualizado' : 'Diarista cadastrado', 'ok');
}

function _rhExcluirDiarista(id, btn) {
  vtpConfirm({
    title: 'Excluir diarista',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      rhDiaristas = rhDiaristas.filter(d => d.id !== id);
      saveRhDiaristas();
      btn.closest('.overlay').remove();
      _renderRhGeral();
      toast('Diarista excluído');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// AVALIAÇÃO SEMANAL DO SUPERVISOR
// ══════════════════════════════════════════════════════════════

function _rhAbrirAvaliacaoSemanal(funcId) {
  const func = funcionarios.find(f => String(f.id) === String(funcId));
  if (!func) return;
  const semanaAtual = _rhIsoWeek();
  const jaAvaliado  = rhAvaliacoes.find(a => String(a.funcionarioId) === String(funcId) && a.semana === semanaAtual);
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.innerHTML = `
  <div class="modal" style="width:440px;max-height:86vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div>
        <div style="font-size:var(--text-md);font-weight:700">Avaliação semanal — ${func.nome}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Semana atual${jaAvaliado?' · já avaliado (será substituído)':''}</div>
      </div>
      <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">${lc('x',16,'currentColor')}</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:18px 20px">
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${_RH_AVAL_TOPICOS.map(t => {
          const nota = jaAvaliado?.notas?.[t.id];
          const val  = (nota !== undefined && nota !== null) ? nota : '';
          return _rhTriBtn('avs_', t, val);
        }).join('')}
      </div>
      <div class="field">
        <label class="slbl">Observações</label>
        <textarea id="avsObs" class="inp" rows="3" placeholder="Pontos de melhoria, destaques positivos..."
          style="resize:vertical">${jaAvaliado?.obs||''}</textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_rhSalvarAvaliacaoSemanal('${funcId}','${semanaAtual}',this)">
        ${lc('check',13,'currentColor')} Salvar avaliação
      </button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

function _rhSalvarAvaliacaoSemanal(funcId, semana, btn) {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const notas = {};
  _RH_AVAL_TOPICOS.forEach(t => {
    const raw = document.getElementById(`avs_${t.id}`)?.value;
    if (raw !== '' && raw !== null && raw !== undefined) notas[t.id] = parseInt(raw);
  });
  if (!Object.keys(notas).length) { toast('Avalie pelo menos um critério', 'warn'); return; }
  const obs = document.getElementById('avsObs')?.value.trim() || '';

  rhAvaliacoes = rhAvaliacoes.filter(a => !(String(a.funcionarioId)===String(funcId) && a.semana===semana));
  rhAvaliacoes.push({
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    funcionarioId: funcId, semana, avaliador: u?.name || '',
    notas, obs,
  });
  saveRhAvaliacoes();
  btn.closest('.overlay').remove();
  _renderRhIndicadores();
  toast('Avaliação salva', 'ok');
}

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES DE ESCALA
// ══════════════════════════════════════════════════════════════

function _rhBuildTimeRow(key, time, isNew) {
  return `<div data-tr data-key="${key}" data-new="${isNew}" style="display:grid;grid-template-columns:1fr 84px 84px 62px 30px;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--border)">
    <input data-field="label" class="inp" value="${(time.label||'').replace(/"/g,'&quot;')}" placeholder="Nome do time"
      oninput="_rhSyncCargoSelects()" style="font-size:var(--text-sm);padding:5px 8px">
    <input data-field="entrada" type="time" class="inp" value="${time.entrada||''}" style="font-size:var(--text-sm);padding:5px;text-align:center">
    <input data-field="saida"   type="time" class="inp" value="${time.saida||''}"   style="font-size:var(--text-sm);padding:5px;text-align:center">
    <input data-field="intervalo" type="number" class="inp" value="${time.intervalo||0}" min="0" max="120" step="5"
      style="font-size:var(--text-sm);padding:5px;text-align:center">
    <button onclick="_rhRemoveTimeRow(this)" title="Remover time"
      style="background:none;border:none;cursor:pointer;color:var(--red);padding:2px;display:flex;align-items:center;justify-content:center;border-radius:var(--r8);flex-shrink:0">${lc('trash-2',13,'currentColor')}</button>
  </div>`;
}

function _rhAddTimeRow() {
  const body = document.getElementById('rhConfigTimesBody');
  if (!body) return;
  const tempKey = `__new__${_rhNewTimeIdx++}`;
  const tmp = document.createElement('div');
  tmp.innerHTML = _rhBuildTimeRow(tempKey, { label:'', entrada:'', saida:'', intervalo:0 }, true);
  body.appendChild(tmp.firstElementChild);
  _rhSyncCargoSelects();
  body.lastElementChild?.querySelector('[data-field="label"]')?.focus();
}

function _rhRemoveTimeRow(btn) {
  const body = document.getElementById('rhConfigTimesBody');
  if (!body) return;
  if (body.querySelectorAll('[data-tr]').length <= 1) {
    toast('É necessário pelo menos um time de trabalho', 'warn');
    return;
  }
  btn.closest('[data-tr]').remove();
  _rhSyncCargoSelects();
}

function _rhSyncCargoSelects() {
  const body = document.getElementById('rhConfigTimesBody');
  if (!body) return;
  const opts = [];
  body.querySelectorAll('[data-tr]').forEach(row => {
    const label = row.querySelector('[data-field="label"]')?.value?.trim() || '(sem nome)';
    opts.push({ key: row.dataset.key, label });
  });
  document.querySelectorAll('[id^="cfgC_"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = opts.map(o => `<option value="${o.key}"${cur===o.key?' selected':''}>${o.label}</option>`).join('');
    if (!opts.find(o => o.key === cur) && opts.length) sel.value = opts[0].key;
  });
}

// ══════════════════════════════════════════════════════════════
// GERENCIAR PARTICIPANTES DA ESCALA
// ══════════════════════════════════════════════════════════════

function _rhAbrirParticipantes() {
  document.getElementById('rhParticipantesOverlay')?.remove();

  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.id = 'rhParticipantesOverlay';
  ov.onclick = e => { if (e.target === ov) ov.remove(); };

  const _roleLabel = r => ({ gerente:'Gerente', supervisor:'Supervisor', comprador:'Comprador', funcionario:'Funcionário' }[r] || r);

  const _buildUserOpts = () => {
    const linked = new Set(funcionarios.filter(f => f.userId).map(f => String(f.userId)));
    const avail  = users.filter(u => u.active !== false && !linked.has(String(u.id)));
    if (avail.length === 0) return '<option value="">Todos os usuários já foram adicionados</option>';
    return '<option value="">Selecione um usuário...</option>' +
      avail.map(u => `<option value="${u.id}">${u.name} — ${_roleLabel(u.role)}</option>`).join('');
  };

  const _renderLista = () => {
    const lista = funcionarios.filter(f => f.active !== false);
    const vazio = lista.length === 0
      ? `<div style="padding:24px;text-align:center;color:var(--muted);font-size:var(--text-sm);font-style:italic">Nenhum participante adicionado.</div>`
      : lista.map(f => {
          const cargo  = FUNC_CARGOS[f.cargo] || { label: f.cargo || '—' };
          const linked = f.userId
            ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--purple);background:var(--purple-xlight);border-radius:4px;padding:1px 5px;flex-shrink:0">${lc('link',9,'currentColor')} conta vinculada</span>`
            : '';
          return `<div class="cfg-row">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--text-sm);color:var(--purple);flex-shrink:0">
              ${(f.nome||'?').charAt(0).toUpperCase()}
            </div>
            <div style="flex:1;min-width:0">
              <div class="cfg-row-label" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${f.nome} ${linked}</div>
              <div class="cfg-row-sub">${cargo.label}</div>
            </div>
            <div class="cfg-row-actions">
              <button class="btn btn-ghost btn-xs" onclick="_rhEditarParticipante('${f.id}')" title="Editar">${lc('edit-2',12,'currentColor')}</button>
              <button onclick="_rhRemoverParticipante('${f.id}')" title="Remover"
                style="background:none;border:none;cursor:pointer;padding:5px;border-radius:5px;line-height:0;color:var(--muted)"
                onmouseover="this.style.background='var(--red-light)';this.style.color='var(--red)'"
                onmouseout="this.style.background='none';this.style.color='var(--muted)'">${lc('trash-2',14,'currentColor')}</button>
            </div>
          </div>`;
        }).join('');
    const el = ov.querySelector('#rhPartLista');
    if (el) el.innerHTML = vazio;
    const selEl = ov.querySelector('#rhPartUser');
    if (selEl) selEl.innerHTML = _buildUserOpts();
  };

  const cargoOpts = Object.entries(FUNC_CARGOS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');

  ov.innerHTML = `
    <div class="modal" style="width:460px;max-height:80vh;display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
      <div style="padding:20px 22px 16px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="font-size:var(--text-md);font-weight:800;margin-bottom:2px">Participantes da Escala</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">Pessoas que aparecem na grade semanal</div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:16px 22px">
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:16px" id="rhPartLista"></div>

        <div style="border:1.5px dashed var(--border);border-radius:var(--r8);padding:14px;background:var(--surface2)" id="rhPartAddForm">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Adicionar participante</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select class="inp" id="rhPartUser" style="flex:2;min-width:160px;font-size:var(--text-sm)"
              onchange="(function(v){if(!v)return;const u=users.find(x=>String(x.id)===v);if(!u)return;const key=(u.funcao&&FUNC_CARGOS[u.funcao])?u.funcao:(FUNC_CARGOS[u.role]?u.role:Object.keys(FUNC_CARGOS)[0]);const cs=document.getElementById('rhPartCargo');if(cs&&key)cs.value=key;})(this.value)"></select>
            <select class="inp" id="rhPartCargo" style="flex:1;min-width:120px;font-size:var(--text-sm)">${cargoOpts}</select>
            <button class="btn btn-primary btn-sm" onclick="_rhAdicionarParticipante()">${lc('plus',12,'#fff')} Adicionar</button>
          </div>
        </div>
      </div>

      <div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-ghost" onclick="document.getElementById('rhParticipantesOverlay')?.remove()">Fechar</button>
      </div>
    </div>`;

  document.body.appendChild(ov);
  _renderLista();

  window._rhPartRenderLista = _renderLista;
}

function _rhAdicionarParticipante() {
  const userId = document.getElementById('rhPartUser')?.value;
  const cargo  = document.getElementById('rhPartCargo')?.value || '';
  if (!userId) { toast('Selecione um usuário', 'err'); return; }
  const u = users.find(x => String(x.id) === String(userId));
  if (!u) return;
  if (funcionarios.some(f => String(f.userId) === String(userId))) {
    toast(`${u.name} já está na escala`, 'warn'); return;
  }
  funcionarios.push({ id: crypto.randomUUID(), userId: u.id, nome: u.name, cargo, active: true });
  saveFuncs();
  window._rhPartRenderLista?.();
  _renderRhEscala();
  toast(`${u.name} adicionado à escala`);
}

function _rhRemoverParticipante(id) {
  const f = funcionarios.find(x => String(x.id) === String(id));
  if (!f) return;
  vtpConfirm({
    title: 'Remover participante',
    message: `Remover ${f.nome} da escala? Os turnos já registrados serão mantidos.`,
    confirmLabel: 'Remover',
    onConfirm: () => {
      funcionarios = funcionarios.filter(x => String(x.id) !== String(id));
      saveFuncs();
      window._rhPartRenderLista?.();
      _renderRhEscala();
      toast(`${f.nome} removido`);
    }
  });
}

function _rhEditarParticipante(id) {
  const f = funcionarios.find(x => String(x.id) === String(id));
  if (!f) return;
  const cargoOpts  = Object.entries(FUNC_CARGOS).map(([k,v]) =>
    `<option value="${k}" ${f.cargo===k?'selected':''}>${v.label}</option>`).join('');
  const linkedUser = f.userId ? users.find(u => String(u.id) === String(f.userId)) : null;
  const nomeField  = linkedUser
    ? `<div class="field"><label class="slbl">Nome</label>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border-radius:var(--r8);font-size:var(--text-sm)">
          <span style="flex:1">${linkedUser.name}</span>
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--purple);background:var(--purple-xlight);border-radius:4px;padding:1px 5px">${lc('link',9,'currentColor')} conta vinculada</span>
        </div></div>`
    : `<div class="field"><label class="slbl">Nome *</label><input id="rhEditNome" class="inp" value="${f.nome.replace(/"/g,'&quot;')}"></div>`;
  const ov2 = document.createElement('div'); ov2.className = 'overlay open';
  ov2.innerHTML = `<div class="modal" style="width:340px;padding:22px" onclick="event.stopPropagation()">
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:16px">Editar participante</div>
    ${nomeField}
    <div class="field"><label class="slbl">Cargo</label><select id="rhEditCargo" class="inp" style="font-size:var(--text-sm)">${cargoOpts}</select></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_rhSalvarParticipante('${id}',this)">Salvar</button>
    </div>
  </div>`;
  ov2.onclick = e => { if (e.target===ov2) ov2.remove(); };
  document.body.appendChild(ov2);
  if (!linkedUser) setTimeout(() => document.getElementById('rhEditNome')?.focus(), 60);
}

function _rhSalvarParticipante(id, btn) {
  const cargo = document.getElementById('rhEditCargo')?.value || '';
  const f = funcionarios.find(x => String(x.id) === String(id));
  if (!f) return;
  if (f.userId) {
    const u = users.find(x => String(x.id) === String(f.userId));
    if (u) f.nome = u.name;
  } else {
    const nome = document.getElementById('rhEditNome')?.value.trim();
    if (!nome) { toast('Nome não pode ser vazio', 'err'); return; }
    f.nome = nome;
  }
  f.cargo = cargo;
  saveFuncs();
  btn.closest('.overlay').remove();
  window._rhPartRenderLista?.();
  _renderRhEscala();
  toast('Participante atualizado', 'ok');
}

function _rhAbrirConfig() {
  document.getElementById('rhConfigOverlay')?.remove();

  const timesEntries  = Object.entries(rhConfig.times || {});
  const cargosEntries = Object.entries(FUNC_CARGOS);

  const popup = document.createElement('div');
  popup.className = 'overlay open';
  popup.id        = 'rhConfigOverlay';
  popup.innerHTML = `
  <div class="modal" style="width:600px;max-height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="font-size:var(--text-md);font-weight:700">${lc('settings',16,'var(--purple)')} Configurações de Escala</div>
      <button onclick="document.getElementById('rhConfigOverlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">${lc('x',16,'currentColor')}</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:22px">

      <!-- Operação geral -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:10px">OPERAÇÃO</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="field">
            <label class="slbl">Abertura da loja</label>
            <input id="cfgAbertura" type="time" class="inp" value="${rhConfig.abertura}">
          </div>
          <div class="field">
            <label class="slbl">Fechamento</label>
            <input id="cfgFechamento" type="time" class="inp" value="${rhConfig.fechamento}">
          </div>
          <div class="field">
            <label class="slbl">Folgas / semana</label>
            <select id="cfgFolgas" class="inp">
              ${[1,2].map(n=>`<option value="${n}" ${rhConfig.folgasPorSemana===n?'selected':''}>${n} dia${n>1?'s':''}</option>`).join('')}
            </select>
          </div>
        </div>
        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-sm);font-weight:600;color:var(--text)">
          <input type="checkbox" id="cfgAbreDom" ${rhConfig.abreNoDomingo!==false?'checked':''} style="width:15px;height:15px;accent-color:var(--purple)">
          Abre no domingo
        </label>
      </div>

      <!-- Times de trabalho -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em">TIMES DE TRABALHO</div>
          <button onclick="_rhAddTimeRow()" class="btn btn-ghost" style="padding:4px 10px;gap:5px;font-size:var(--text-xs)">
            ${lc('plus',13,'currentColor')} Adicionar time
          </button>
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--r12);overflow:hidden">
          <div style="display:grid;grid-template-columns:1fr 84px 84px 62px 30px;gap:6px;padding:7px 10px;background:var(--surface2);border-bottom:1px solid var(--border)">
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted)">TIME</span>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-align:center">ENTRADA</span>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-align:center">SAÍDA</span>
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-align:center">INTERVALO</span>
            <span></span>
          </div>
          <div id="rhConfigTimesBody">
            ${timesEntries.map(([key, time]) => _rhBuildTimeRow(key, time, false)).join('')}
          </div>
        </div>
      </div>

      <!-- Regras de folga -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:10px">REGRAS DE FOLGA AUTOMÁTICA</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:inline-flex;align-items:flex-start;gap:9px;cursor:pointer;font-size:var(--text-sm);font-weight:600;color:var(--text)">
            <input type="checkbox" id="cfgNaoConc" ${rhConfig.regrasEscala?.naoCoincidirFolgas!==false?'checked':''}
              style="width:15px;height:15px;accent-color:var(--purple);margin-top:1px;flex-shrink:0">
            <span>Evitar que funcionários da mesma função folguem no mesmo dia</span>
          </label>
          <label style="display:inline-flex;align-items:flex-start;gap:9px;cursor:pointer;font-size:var(--text-sm);font-weight:600;color:var(--text)">
            <input type="checkbox" id="cfgGarDom" ${rhConfig.regrasEscala?.garantirDomingo!==false?'checked':''}
              style="width:15px;height:15px;accent-color:var(--purple);margin-top:1px;flex-shrink:0">
            <span>Garantir ao menos uma folga no domingo por mês para cada funcionário</span>
          </label>
        </div>
        <div style="margin-top:12px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:8px">DIAS PREFERIDOS PARA FOLGA</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${_RH_DLBL.map((lbl, i) => `
            <label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;
              border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer;font-size:var(--text-sm);font-weight:600">
              <input type="checkbox" name="cfgDiaPref" value="${i}"
                ${(rhConfig.regrasEscala?.diasPreferenciaFolga??[0,1,2,3]).includes(i)?'checked':''}
                style="accent-color:var(--purple)"> ${lbl}
            </label>`).join('')}
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:5px">Dias marcados têm prioridade — folgas são evitadas nos outros dias sempre que possível.</div>
        </div>
      </div>

      <!-- Cobertura nos picos -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:10px">COBERTURA MÍNIMA NOS PICOS (SÁB/DOM)</div>
        <div style="border:1px solid var(--border);border-radius:var(--r12);overflow:hidden">
          ${Object.keys(FUNC_CARGOS).map((cargo, i, arr) => {
            const cfg   = FUNC_CARGOS[cargo];
            const atual = rhConfig.coberturaPico?.minimos?.[cargo] ?? 0;
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:7px 14px;${i<arr.length-1?'border-bottom:1px solid var(--border)':''}">
              <span style="color:${cfg.color};line-height:0;flex-shrink:0">${lc(cfg.icon,13,'currentColor')}</span>
              <span style="font-size:var(--text-sm);font-weight:600;flex:1">${cfg.label}</span>
              <div style="display:flex;align-items:center;gap:6px">
                <input id="cfgPico_${cargo}" type="number" class="inp" value="${atual}" min="0" max="10"
                  style="width:54px;text-align:center;padding:4px 6px;font-size:var(--text-sm)">
                <span style="font-size:var(--text-xs);color:var(--muted)">mín.</span>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:5px">Valor 0 = sem mínimo configurado. Ao gerar escala, um aviso aparece se a cobertura ficar abaixo do mínimo.</div>
      </div>

      <!-- Cargo → Time -->
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:10px">CARGO → TIME PADRÃO</div>
        <div style="border:1px solid var(--border);border-radius:var(--r12);overflow:hidden">
          ${cargosEntries.map(([key, cfg], i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:7px 14px;${i<cargosEntries.length-1?'border-bottom:1px solid var(--border)':''}">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
              <span style="color:${cfg.color};line-height:0;flex-shrink:0">${lc(cfg.icon,13,'currentColor')}</span>
              <span style="font-size:var(--text-sm);font-weight:600">${cfg.label}</span>
            </div>
            <select id="cfgC_${key}" class="inp" style="font-size:var(--text-sm);padding:4px 8px;width:160px;flex-shrink:0">
              ${timesEntries.map(([tk,tt])=>`<option value="${tk}" ${(rhConfig.cargoParaTime?.[key]||timesEntries[0]?.[0])===tk?'selected':''}>${tt.label}</option>`).join('')}
            </select>
          </div>`).join('')}
        </div>
      </div>

    </div>

    <div style="display:flex;gap:8px;padding:16px 22px;border-top:1px solid var(--border);flex-shrink:0">
      <button class="btn btn-ghost" style="flex:1" onclick="document.getElementById('rhConfigOverlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1" onclick="_rhSalvarConfig(this)">Salvar configurações</button>
    </div>
  </div>`;
  popup.onclick = e => { if (e.target === popup) popup.remove(); };
  document.body.appendChild(popup);
}

function _rhSalvarConfig(btn) {
  rhConfig.abertura        = document.getElementById('cfgAbertura')?.value || rhConfig.abertura;
  rhConfig.fechamento      = document.getElementById('cfgFechamento')?.value || rhConfig.fechamento;
  rhConfig.folgasPorSemana = parseInt(document.getElementById('cfgFolgas')?.value) || 1;
  rhConfig.abreNoDomingo   = document.getElementById('cfgAbreDom')?.checked !== false;

  const newTimes = {};
  const keyRemap = {};
  document.querySelectorAll('#rhConfigTimesBody [data-tr]').forEach(row => {
    const label     = row.querySelector('[data-field="label"]')?.value?.trim();
    const entrada   = row.querySelector('[data-field="entrada"]')?.value;
    const saida     = row.querySelector('[data-field="saida"]')?.value;
    const intervalo = parseInt(row.querySelector('[data-field="intervalo"]')?.value) || 0;
    if (!label || !entrada || !saida) return;
    const isNew   = row.dataset.new === 'true';
    const origKey = row.dataset.key;
    let   finalKey;
    if (isNew) {
      finalKey = label.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'')
        .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') || `time_${_rhNewTimeIdx}`;
      if (newTimes[finalKey]) finalKey += '_' + Math.random().toString(36).slice(2,5);
    } else {
      finalKey = origKey;
    }
    newTimes[finalKey]  = { label, entrada, saida, intervalo };
    keyRemap[origKey]   = finalKey;
  });

  if (!Object.keys(newTimes).length) {
    toast('Adicione pelo menos um time de trabalho', 'err');
    return;
  }

  const firstKey = Object.keys(newTimes)[0];
  const newCargoParaTime = {};
  Object.keys(FUNC_CARGOS).forEach(cargo => {
    const selVal = document.getElementById(`cfgC_${cargo}`)?.value;
    const mapped = selVal ? (keyRemap[selVal] || selVal) : null;
    newCargoParaTime[cargo] = (mapped && newTimes[mapped]) ? mapped : firstKey;
  });

  rhConfig.times         = newTimes;
  rhConfig.cargoParaTime = newCargoParaTime;

  // Regras de folga
  const diasPref = Array.from(document.querySelectorAll('input[name="cfgDiaPref"]:checked'))
    .map(cb => parseInt(cb.value));
  rhConfig.regrasEscala = {
    diasPreferenciaFolga: diasPref,
    naoCoincidirFolgas:   document.getElementById('cfgNaoConc')?.checked !== false,
    garantirDomingo:      document.getElementById('cfgGarDom')?.checked  !== false,
  };

  // Cobertura nos picos
  const minimos = {};
  Object.keys(FUNC_CARGOS).forEach(cargo => {
    const v = parseInt(document.getElementById(`cfgPico_${cargo}`)?.value) || 0;
    if (v > 0) minimos[cargo] = v;
  });
  rhConfig.coberturaPico = { diasPico: [5, 6], minimos };

  saveRhConfig();
  document.getElementById('rhConfigOverlay')?.remove();
  toast('Configurações salvas', 'ok');
}

// ══════════════════════════════════════════════════════════════
// ESCALA AUTOMÁTICA
// ══════════════════════════════════════════════════════════════

function _rhToggleEscalaMenu() {
  const menu = document.getElementById('rhEscalaMenu');
  if (!menu) return;
  const open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'block';
  if (!open) {
    const close = () => { menu.style.display = 'none'; document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function _rhLimparEscala() {
  document.getElementById('rhEscalaMenu').style.display = 'none';
  const semLabel = _rhSemana.replace('-W', ' — semana ');
  vtpConfirm({
    title: `Limpar escala de ${semLabel}`,
    message: 'Todos os turnos da semana serão removidos. Presenças registradas não são afetadas.',
    confirmLabel: 'Limpar escala',
    onConfirm: () => {
      const rec = rhEscalas.find(e => e.semana === _rhSemana);
      if (rec) { rec.turnos = {}; rec.updated_at = new Date().toISOString(); }
      saveRhEscalas();
      _renderRhEscala();
      toast('Escala da semana zerada', 'ok');
    }
  });
}

function _rhModalAutoEscala() {
  const funcs  = funcionarios.filter(f => f.active !== false);
  const dates  = _rhWeekDates(_rhSemana);
  const [y, w] = _rhSemana.split('-W');

  document.getElementById('rhAutoOverlay')?.remove();

  const popup = document.createElement('div');
  popup.className = 'overlay open';
  popup.id        = 'rhAutoOverlay';
  popup.innerHTML = `
  <div class="modal" style="width:420px;padding:24px" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div style="font-size:var(--text-md);font-weight:700">${lc('zap',16,'var(--purple)')} Gerar Escala Automática</div>
      <button onclick="document.getElementById('rhAutoOverlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">${lc('x',16,'currentColor')}</button>
    </div>

    <div style="background:var(--surface2);border-radius:var(--r8);padding:12px 14px;margin-bottom:18px;font-size:var(--text-sm);color:var(--text2)">
      <div style="font-weight:700;color:var(--text);margin-bottom:4px">Semana ${w}/${y} · ${_rhFmtDate(dates[0])} – ${_rhFmtDate(dates[6])}</div>
      <div>${funcs.length} funcionário${funcs.length!==1?'s':''} · ${rhConfig.folgasPorSemana} folga${rhConfig.folgasPorSemana!==1?'s':''}/semana · Abertura ${rhConfig.abertura} – Fechamento ${rhConfig.fechamento}</div>
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);margin-bottom:10px">MODO DE GERAÇÃO</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 13px;border:1.5px solid var(--purple);border-radius:var(--r8);cursor:pointer;background:var(--purple-xlight)">
          <input type="radio" name="autoModo" value="vazio" checked style="margin-top:2px">
          <div>
            <div style="font-size:var(--text-sm);font-weight:700">Preencher células vazias</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Mantém turnos já definidos e preenche apenas o que está sem horário</div>
          </div>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 13px;border:1.5px solid var(--border);border-radius:var(--r8);cursor:pointer">
          <input type="radio" name="autoModo" value="substituir" style="margin-top:2px">
          <div>
            <div style="font-size:var(--text-sm);font-weight:700">Substituir toda a semana</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Regera a escala completa, sobrescrevendo turnos existentes</div>
          </div>
        </label>
      </div>
    </div>

    <div style="background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r8);padding:10px 13px;margin-bottom:18px;font-size:var(--text-xs);color:var(--text2)">
      ${lc('info',12,'var(--yellow)')} Funcionários em férias ou licença nessa semana serão ignorados automaticamente.
    </div>

    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" style="flex:1" onclick="document.getElementById('rhAutoOverlay').remove()">Cancelar</button>
      <button class="btn btn-primary" style="flex:1;gap:6px" onclick="_rhGerarEscalaAuto(this)">
        ${lc('zap',14,'currentColor')} Gerar escala
      </button>
    </div>
  </div>`;
  popup.onclick = e => { if (e.target === popup) popup.remove(); };

  // Radio button style toggle
  popup.querySelectorAll && setTimeout(() => {
    popup.querySelectorAll('input[name=autoModo]').forEach(r => {
      r.addEventListener('change', () => {
        popup.querySelectorAll('label').forEach(l => {
          const rb = l.querySelector('input[type=radio]');
          if (!rb) return;
          l.style.borderColor = rb.checked ? 'var(--purple)' : 'var(--border)';
          l.style.background  = rb.checked ? 'var(--purple-xlight)' : 'transparent';
        });
      });
    });
  }, 0);

  document.body.appendChild(popup);
}

function _rhGerarEscalaAuto(btn) {
  const modo  = btn.closest('.modal').querySelector('input[name=autoModo]:checked')?.value || 'vazio';
  const funcs = funcionarios.filter(f => f.active !== false);
  const dates = _rhWeekDates(_rhSemana);

  let rec = rhEscalas.find(e => e.semana === _rhSemana);
  if (!rec) {
    rec = { id: crypto.randomUUID(), semana: _rhSemana, turnos: {}, created_at: new Date().toISOString() };
    rhEscalas.push(rec);
  }

  const domAlerts = new Set(_rhGetDomingoAlerts().map(a => String(a.id)));
  const folgaMap  = new Map(); // dayIndex → Set<cargo> já com folga

  funcs.forEach(f => {
    const fid     = String(f.id);
    const timeKey = rhConfig.cargoParaTime?.[f.cargo] || Object.keys(rhConfig.times||{})[0] || '';
    const time    = rhConfig.times?.[timeKey] || { entrada: rhConfig.abertura, saida: rhConfig.fechamento };
    const turno   = { entrada: time.entrada, saida: time.saida };
    const folgaDays = _rhCalcularFolgas(fid, dates, domAlerts, folgaMap);

    folgaDays.forEach(di => {
      if (!folgaMap.has(di)) folgaMap.set(di, new Set());
      if (f.cargo) folgaMap.get(di).add(f.cargo);
    });

    if (!rec.turnos[f.id]) rec.turnos[f.id] = {};

    _RH_DAYS.forEach((dk, di) => {
      const dateIso = _rhIsoDate(dates[di]);
      if (_rhInPeriodo(f.id, dateIso)) return;
      if (modo === 'vazio' && rec.turnos[f.id][dk]) return;
      rec.turnos[f.id][dk] = folgaDays.has(di)
        ? { folga: true }
        : { folga: false, timeKey, entrada: turno.entrada, saida: turno.saida };
    });
  });

  saveRhEscalas();
  document.getElementById('rhAutoOverlay')?.remove();
  _renderRhEscala();

  // Verificar cobertura nos dias de pico
  const cp      = rhConfig.coberturaPico || {};
  const picos   = cp.diasPico || [5, 6];
  const minimos = cp.minimos  || {};
  const avisos  = [];
  picos.forEach(di => {
    const dk    = _RH_DAYS[di];
    const count = {};
    funcs.forEach(f => {
      const t = rec.turnos[f.id]?.[dk];
      if (t && !t.folga) count[f.cargo] = (count[f.cargo] || 0) + 1;
    });
    Object.entries(minimos).forEach(([cargo, min]) => {
      const atual = count[cargo] || 0;
      if (atual < min) {
        const cLabel = FUNC_CARGOS[cargo]?.label || cargo;
        avisos.push(`${_RH_DLBL[di]}: ${cLabel} (${atual}/${min})`);
      }
    });
  });

  toast(`Escala gerada para ${funcs.length} funcionário${funcs.length!==1?'s':''}`, 'ok');
  if (avisos.length) {
    setTimeout(() => toast(`Cobertura insuficiente — considere diaristas: ${avisos.join(' · ')}`, 'warn'), 600);
  }
}

function _rhCalcularFolgas(funcId, dates, domAlertsSet, folgaMap) {
  const numFolgas = rhConfig.folgasPorSemana || 1;
  const regras    = rhConfig.regrasEscala    || {};
  const diasPref  = regras.diasPreferenciaFolga ?? [0,1,2,3];
  const naoConc   = regras.naoCoincidirFolgas !== false;
  const garDom    = regras.garantirDomingo    !== false;

  const func = funcionarios.find(f => String(f.id) === String(funcId));
  const cargo = func?.cargo;
  const precisaDomingo = garDom && domAlertsSet.has(String(funcId));
  const folgaDays = new Set();

  // Ordem de candidatos: preferidos → não preferidos → domingo por último
  const sorted = [0,1,2,3,4,5,6].sort((a, b) => {
    if (a === 6 && b !== 6) return  1;
    if (b === 6 && a !== 6) return -1;
    const ap = diasPref.includes(a) ? 0 : 1;
    const bp = diasPref.includes(b) ? 0 : 1;
    return ap - bp;
  });

  for (const di of sorted) {
    if (folgaDays.size >= numFolgas) break;

    // Domingo: só atribuir como última opção OU se o func precisa do domingo do mês
    if (di === 6) {
      const nonSunFree = sorted.filter(d => d !== 6 && !folgaDays.has(d)).length;
      const needed     = numFolgas - folgaDays.size;
      if (!precisaDomingo && nonSunFree >= needed) continue;
    }

    // Restrição: mesma função não folga no mesmo dia
    if (naoConc && cargo && folgaMap.get(di)?.has(cargo)) {
      // Só pula se houver alternativa disponível
      const livres = sorted.filter(d => !folgaDays.has(d) && d !== di &&
        (!naoConc || !cargo || !folgaMap.get(d)?.has(cargo))).length;
      if (livres >= numFolgas - folgaDays.size) continue;
    }

    folgaDays.add(di);
  }

  // Fallback sem restrições se não atingiu o mínimo
  for (const di of sorted) {
    if (folgaDays.size >= numFolgas) break;
    if (!folgaDays.has(di)) folgaDays.add(di);
  }

  return folgaDays;
}

// ══════════════════════════════════════════════════════════════
// IMPRESSÃO / PDF
// ══════════════════════════════════════════════════════════════

function _rhImprimirEscala() {
  const dates  = _rhWeekDates(_rhSemana);
  const [y, w] = _rhSemana.split('-W');
  const rec    = rhEscalas.find(e => e.semana === _rhSemana) || null;
  const funcs  = funcionarios.filter(f => f.active !== false);

  const presMap = {};
  rhPresencas.forEach(p => { presMap[`${p.funcionarioId}::${p.data}`] = p; });

  const tableRows = funcs.map(f => {
    const cargo   = FUNC_CARGOS[f.cargo] || { label: f.cargo || '—' };
    const timeKey = rhConfig.cargoParaTime?.[f.cargo] || 'fechamento';
    const time    = rhConfig.times?.[timeKey];
    const intervStr = time?.intervalo ? `${time.intervalo}' int.` : '';

    const cells = _RH_DAYS.map((dk, di) => {
      const dateIso = _rhIsoDate(dates[di]);
      const isDom   = di === 6;

      if (_rhInPeriodo(f.id, dateIso)) {
        const p = _rhGetPeriodo(f.id, dateIso);
        return `<td style="text-align:center;font-size:10px;color:#7c3aed;background:#f3e8ff;padding:5px 3px">${p?.tipo==='ferias'?'Férias':'Licença'}</td>`;
      }
      const turn = rec?.turnos?.[f.id]?.[dk] || rec?.turnos?.[String(f.id)]?.[dk];
      const bg   = isDom ? '#fff1f2' : '';
      if (!turn) return `<td style="text-align:center;font-size:10px;color:#9ca3af;background:${bg};padding:5px 3px">—</td>`;
      if (turn.folga) return `<td style="text-align:center;font-size:10px;color:#6b7280;background:${bg||'#f9fafb'};padding:5px 3px">Folga</td>`;
      return `<td style="text-align:center;font-size:10px;background:${bg};padding:5px 3px">
        <strong>${turn.entrada||'?'}–${turn.saida||'?'}</strong>
        ${intervStr?`<br><span style="color:#9ca3af;font-size:9px">${intervStr}</span>`:''}
      </td>`;
    }).join('');

    return `<tr>
      <td style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;border-right:1px solid #e5e7eb">${f.nome}</td>
      <td style="padding:6px 10px;font-size:10px;color:#6b7280;white-space:nowrap;border-right:1px solid #e5e7eb">${cargo.label}</td>
      ${cells}
    </tr>`;
  }).join('');

  const legenda = Object.entries(rhConfig.times||{}).map(([,t]) =>
    `<span style="margin-right:16px"><strong>${t.label}:</strong> ${t.entrada}–${t.saida}${t.intervalo?` · ${t.intervalo}min intervalo`:''}</span>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Escala — Semana ${w}/${y}</title>
<style>
  @page { margin: 12mm 10mm; size: landscape; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  h1 { font-size: 15px; font-weight: 800; margin: 0 0 2px; color: #6b21d4; }
  .sub { font-size: 11px; color: #6b7280; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 10px; font-weight: 700; padding: 7px 5px;
       text-align: center; border: 1px solid #e5e7eb; color: #374151; }
  th.nome, th.cargo { text-align: left; }
  td { border: 1px solid #e5e7eb; vertical-align: middle; }
  tr:nth-child(even) td { background: #fafafa; }
  .dom th { background: #fff1f2; color: #dc2626; }
  .legenda { font-size: 10px; color: #6b7280; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
  .rodape { font-size: 9px; color: #9ca3af; margin-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<h1>Escala de Trabalho — Vai Ter Pizza</h1>
<p class="sub">Semana ${w}/${y} · ${_rhFmtDate(dates[0])} a ${_rhFmtDate(dates[6])} · ${funcs.length} funcionário${funcs.length!==1?'s':''}</p>
<table>
  <thead>
    <tr>
      <th class="nome" style="min-width:130px">FUNCIONÁRIO</th>
      <th class="cargo" style="min-width:90px">CARGO</th>
      ${_RH_DLBL.map((d,i)=>`<th class="${i===6?'dom':''}" style="min-width:85px">${d}<br><span style="font-weight:400">${_rhFmtDate(dates[i])}</span></th>`).join('')}
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="legenda"><strong>Times:</strong> ${legenda}</div>
<div class="rodape">Gerado em ${new Date().toLocaleString('pt-BR')} · VTP Compras</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1100,height=700');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ══════════════════════════════════════════════════════════════
// HELPER UI
// ══════════════════════════════════════════════════════════════

function _rhEmptyState(icon, title, sub) {
  return `
  <div style="text-align:center;padding:60px 24px;color:var(--muted)">
    ${lc(icon, 36, 'var(--border)')}
    <p style="margin:14px 0 4px;font-size:var(--text-md);font-weight:700;color:var(--text)">${title}</p>
    <p style="font-size:var(--text-sm)">${sub}</p>
  </div>`;
}

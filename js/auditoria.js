/**
 * VTP Compras — Vai Ter Pizza!
 * auditoria.js — Log de auditoria de ações do sistema
 */

let _audFiltros   = { user: 'todos', modulo: 'todos', busca: '', inicio: '', fim: '', periodo: '7d' };
let _audPagina    = 0;
let _audTargetEl  = null;
const _AUD_POR_PAG = 50;

function _audEl() {
  return _audTargetEl || document.getElementById('page-auditoria');
}

function renderAuditoria(targetEl) {
  _audTargetEl = targetEl || null;
  const el = _audEl();
  if (!el) return;
  el.innerHTML = _audShell();
  _audAplicarPeriodo(_audFiltros.periodo, false);
  _audRender();
}

// ── Shell HTML ────────────────────────────────────────────────
function _audShell() {
  const usuariosUnicos = _audUsuariosUnicos();
  const modulosUnicos  = _audModulosUnicos();

  return `
<div style="padding:${isMobile()?'16px':'24px 28px'};max-width:1280px;margin:0 auto">

  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px">
    <div>
      <h2 style="font-size:1.12rem;font-weight:700;color:var(--text);margin:0 0 3px">Log de Auditoria</h2>
      <p style="font-size:var(--text-sm);color:var(--muted);margin:0">Registro completo de ações realizadas por todos os usuários</p>
    </div>
    <button class="btn btn-ghost" onclick="_audExportar()" style="gap:6px;font-size:var(--text-sm)">
      ${lc('download',13,'currentColor')} Exportar CSV
    </button>
  </div>

  <!-- Filtros -->
  <div class="card" style="padding:16px 18px;margin-bottom:14px">
    <div style="display:grid;grid-template-columns:${isMobile()?'1fr 1fr':'1fr 1fr 160px 160px auto'};gap:12px;align-items:end;margin-bottom:12px">

      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Colaborador</label>
        <select class="inp" id="audFiltUser" onchange="_audFiltrar()" style="font-size:var(--text-sm)">
          <option value="todos">Todos os colaboradores</option>
          ${usuariosUnicos.map(u => `<option value="${u}" ${_audFiltros.user===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Módulo</label>
        <select class="inp" id="audFiltMod" onchange="_audFiltrar()" style="font-size:var(--text-sm)">
          <option value="todos">Todos os módulos</option>
          ${modulosUnicos.map(m => `<option value="${m}" ${_audFiltros.modulo===m?'selected':''}>${_audNomeMod(m)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Data início</label>
        <input type="date" class="inp" id="audFiltInicio" onchange="_audFiltrarData()" style="font-size:var(--text-sm)" value="${_audFiltros.inicio}">
      </div>

      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Data fim</label>
        <input type="date" class="inp" id="audFiltFim" onchange="_audFiltrarData()" style="font-size:var(--text-sm)" value="${_audFiltros.fim}">
      </div>

      <button class="btn btn-ghost" onclick="_audLimparFiltros()" style="height:36px;align-self:end;gap:5px;font-size:var(--text-sm);white-space:nowrap">
        ${lc('x',12,'currentColor')} Limpar
      </button>
    </div>

    <div style="display:flex;gap:10px;align-items:center">
      <div style="flex:1;position:relative">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;line-height:0">${lc('search',14,'var(--muted)')}</span>
        <input type="text" class="inp" id="audBusca" placeholder="Buscar por ação ou detalhe…" oninput="_audFiltrar()" style="padding-left:34px;font-size:var(--text-sm)" value="${_audFiltros.busca}">
      </div>
      <div style="display:flex;gap:3px">
        ${[['Hoje','1d'],['7 dias','7d'],['30 dias','30d'],['Tudo','all']].map(([l,v]) => {
          const ativo = _audFiltros.periodo === v && !_audFiltros.inicio && !_audFiltros.fim;
          return `<button class="btn ${ativo?'btn-primary':'btn-ghost'}" onclick="_audPeriodoRapido('${v}')" style="font-size:var(--text-xs);padding:4px 11px">${l}</button>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Stats -->
  <div id="audStats" style="display:grid;grid-template-columns:repeat(${isMobile()?2:4},1fr);gap:12px;margin-bottom:14px"></div>

  <!-- Tabela -->
  <div class="card" style="overflow:hidden">
    <div id="audTabela"></div>
    <div id="audPaginacao" style="border-top:1px solid var(--border)"></div>
  </div>

</div>`;
}

// ── Dados filtrados ───────────────────────────────────────────
function _audDadosFiltrados() {
  let data = [...auditLog].reverse(); // mais recente primeiro

  if (_audFiltros.user !== 'todos') {
    data = data.filter(e => e.user_name === _audFiltros.user);
  }
  if (_audFiltros.modulo !== 'todos') {
    data = data.filter(e => (e.modulo || '') === _audFiltros.modulo);
  }
  if (_audFiltros.inicio) {
    const ini = new Date(_audFiltros.inicio + 'T00:00:00');
    data = data.filter(e => new Date(e.created_at) >= ini);
  }
  if (_audFiltros.fim) {
    const fim = new Date(_audFiltros.fim + 'T23:59:59');
    data = data.filter(e => new Date(e.created_at) <= fim);
  }
  if (_audFiltros.busca.trim()) {
    const q = _audFiltros.busca.toLowerCase();
    data = data.filter(e =>
      (e.acao    || '').toLowerCase().includes(q) ||
      (e.detalhe || '').toLowerCase().includes(q)
    );
  }
  return data;
}

// ── Render principal ──────────────────────────────────────────
function _audRender() {
  const dados = _audDadosFiltrados();
  _audRenderStats(dados);
  _audRenderTabela(dados);
}

function _audRenderStats(dados) {
  const el = document.getElementById('audStats');
  if (!el) return;

  const hoje = new Date().toDateString();
  const acoesHoje = auditLog.filter(e => new Date(e.created_at).toDateString() === hoje).length;

  const usuariosHoje = new Set(
    auditLog.filter(e => new Date(e.created_at).toDateString() === hoje).map(e => e.user_name)
  ).size;

  // Módulo mais acessado no filtro atual
  const modCount = {};
  dados.forEach(e => { if (e.modulo) modCount[e.modulo] = (modCount[e.modulo] || 0) + 1; });
  const modTop = Object.entries(modCount).sort((a,b) => b[1]-a[1])[0];

  const stats = [
    { icon: 'list',           label: 'Registros filtrados', val: dados.length.toLocaleString('pt-BR'),      color: 'var(--purple)' },
    { icon: 'activity',       label: 'Ações hoje',          val: acoesHoje.toLocaleString('pt-BR'),         color: 'var(--green)' },
    { icon: 'users',          label: 'Usuários ativos hoje',val: usuariosHoje.toLocaleString('pt-BR'),      color: 'var(--brand-orange)' },
    { icon: 'layout-grid',    label: 'Módulo mais acessado',val: modTop ? _audNomeMod(modTop[0]) : '—',    color: 'var(--purple)' },
  ];

  el.innerHTML = stats.map(s => `
    <div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:var(--r8);background:${s.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${lc(s.icon, 16, s.color)}
      </div>
      <div>
        <div style="font-size:1.2rem;font-weight:800;color:var(--text);line-height:1">${s.val}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${s.label}</div>
      </div>
    </div>
  `).join('');
}

function _audRenderTabela(dados) {
  const el  = document.getElementById('audTabela');
  const pel = document.getElementById('audPaginacao');
  if (!el || !pel) return;

  const total  = dados.length;
  const pages  = Math.max(1, Math.ceil(total / _AUD_POR_PAG));
  if (_audPagina >= pages) _audPagina = 0;

  const slice = dados.slice(_audPagina * _AUD_POR_PAG, (_audPagina + 1) * _AUD_POR_PAG);

  if (total === 0) {
    el.innerHTML = `
      <div style="padding:56px 24px;text-align:center;color:var(--muted)">
        ${lc('search',28,'var(--border)')}
        <div style="font-size:var(--text-md);margin-top:12px">Nenhum registro encontrado para os filtros selecionados</div>
      </div>`;
    pel.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm)">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="padding:10px 16px;text-align:left;font-weight:700;font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Data / Hora</th>
            <th style="padding:10px 16px;text-align:left;font-weight:700;font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Colaborador</th>
            <th style="padding:10px 16px;text-align:left;font-weight:700;font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Módulo</th>
            <th style="padding:10px 16px;text-align:left;font-weight:700;font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Ação</th>
            <th style="padding:10px 16px;text-align:left;font-weight:700;font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Detalhe</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map((e, idx) => _audLinha(e, idx)).join('')}
        </tbody>
      </table>
    </div>`;

  // Paginação
  const ini = _audPagina * _AUD_POR_PAG + 1;
  const fim = Math.min((_audPagina + 1) * _AUD_POR_PAG, total);
  pel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px">
      <span style="font-size:var(--text-sm);color:var(--muted)">${ini}–${fim} de <strong style="color:var(--text)">${total.toLocaleString('pt-BR')}</strong> registros</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost" onclick="_audIrPagina(0)" ${_audPagina===0?'disabled':''} style="font-size:var(--text-xs);padding:4px 8px">
          ${lc('chevrons-left',13,'currentColor')}
        </button>
        <button class="btn btn-ghost" onclick="_audIrPagina(${_audPagina-1})" ${_audPagina===0?'disabled':''} style="font-size:var(--text-xs);padding:4px 8px">
          ${lc('chevron-left',13,'currentColor')}
        </button>
        <span style="padding:4px 12px;font-size:var(--text-sm);color:var(--text);display:flex;align-items:center">
          Pág. ${_audPagina+1} / ${pages}
        </span>
        <button class="btn btn-ghost" onclick="_audIrPagina(${_audPagina+1})" ${_audPagina>=pages-1?'disabled':''} style="font-size:var(--text-xs);padding:4px 8px">
          ${lc('chevron-right',13,'currentColor')}
        </button>
        <button class="btn btn-ghost" onclick="_audIrPagina(${pages-1})" ${_audPagina>=pages-1?'disabled':''} style="font-size:var(--text-xs);padding:4px 8px">
          ${lc('chevrons-right',13,'currentColor')}
        </button>
      </div>
    </div>`;
}

function _audLinha(e, idx) {
  const bg    = idx % 2 === 0 ? 'transparent' : 'var(--surface)';
  const dt    = fmtDT(e.created_at);
  const badge = _audRoleBadge(e.user_role);
  const mod   = e.modulo ? `<span style="display:inline-block;padding:2px 7px;border-radius:4px;background:var(--purple-xlight);color:var(--purple);font-size:var(--text-xs);font-weight:600;white-space:nowrap">${_audNomeMod(e.modulo)}</span>` : '<span style="color:var(--muted)">—</span>';
  const det   = e.detalhe ? `<span style="color:var(--muted);font-size:var(--text-sm)">${_audEscapar(e.detalhe)}</span>` : '';

  return `
    <tr style="background:${bg};border-bottom:1px solid var(--border)">
      <td style="padding:9px 16px;white-space:nowrap;color:var(--muted);font-size:var(--text-sm);font-variant-numeric:tabular-nums">${dt}</td>
      <td style="padding:9px 16px;white-space:nowrap">
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:26px;height:26px;border-radius:50%;background:var(--purple-xlight);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:800;color:var(--purple);flex-shrink:0">${(e.user_name||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600;color:var(--text);font-size:var(--text-sm);line-height:1.2">${_audEscapar(e.user_name || 'Sistema')}</div>
            ${badge}
          </div>
        </div>
      </td>
      <td style="padding:9px 16px">${mod}</td>
      <td style="padding:9px 16px;font-weight:500;color:var(--text)">${_audEscapar(e.acao || '—')}</td>
      <td style="padding:9px 16px;max-width:320px">${det}</td>
    </tr>`;
}

// ── Helpers de exibição ───────────────────────────────────────
function _audRoleBadge(role) {
  const map = {
    gerente:     { l:'Gerente',     c:'var(--purple)',       bg:'var(--purple-xlight)' },
    supervisor:  { l:'Supervisor',  c:'#D97706',             bg:'#FEF3C7' },
    comprador:   { l:'Comprador',   c:'var(--green)',        bg:'var(--green-light)' },
    funcionario: { l:'Funcionário', c:'#3B82F6',             bg:'#EFF6FF' },
  };
  const r = map[role];
  if (!r) return '';
  return `<span style="font-size:var(--text-2xs);font-weight:700;color:${r.c};background:${r.bg};padding:1px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em">${r.l}</span>`;
}

function _audNomeMod(mod) {
  const map = {
    dashboard:'Dashboard', estoque:'Estoque', preproducao:'Pré-produção',
    desperdicio:'Desperdício', compras:'Compras', cadastros:'Cadastros',
    previsao:'Previsão', configuracoes:'Configurações', relatorios:'Relatórios',
    usuarios:'Usuários', checklist:'Checklist', manutencao:'Manutenção',
    inventario:'Inventário', alertas:'Alertas', rh:'RH', auditoria:'Auditoria',
  };
  return map[mod] || mod;
}

function _audEscapar(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _audUsuariosUnicos() {
  return [...new Set(auditLog.map(e => e.user_name || 'Sistema'))].sort();
}

function _audModulosUnicos() {
  return [...new Set(auditLog.map(e => e.modulo).filter(Boolean))].sort();
}

// ── Ações de filtro ───────────────────────────────────────────
function _audFiltrar() {
  const u  = document.getElementById('audFiltUser');
  const m  = document.getElementById('audFiltMod');
  const b  = document.getElementById('audBusca');
  if (u) _audFiltros.user   = u.value;
  if (m) _audFiltros.modulo = m.value;
  if (b) _audFiltros.busca  = b.value;
  _audPagina = 0;
  _audRender();
}

function _audFiltrarData() {
  const i = document.getElementById('audFiltInicio');
  const f = document.getElementById('audFiltFim');
  if (i) _audFiltros.inicio = i.value;
  if (f) _audFiltros.fim    = f.value;
  // Datas manuais desvinculam o período rápido
  if (_audFiltros.inicio || _audFiltros.fim) _audFiltros.periodo = '';
  _audFiltrar();
}

function _audPeriodoRapido(v) {
  _audFiltros.periodo = v;
  _audFiltros.inicio  = '';
  _audFiltros.fim     = '';
  const ini = document.getElementById('audFiltInicio');
  const fim = document.getElementById('audFiltFim');
  if (ini) ini.value = '';
  if (fim) fim.value = '';
  _audAplicarPeriodo(v, true);
}

function _audAplicarPeriodo(v, rerender) {
  const hoje = new Date();
  const pad  = n => String(n).padStart(2,'0');
  const iso  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (v === '1d') {
    _audFiltros.inicio = iso(hoje);
    _audFiltros.fim    = iso(hoje);
  } else if (v === '7d') {
    const ini = new Date(hoje); ini.setDate(hoje.getDate()-6);
    _audFiltros.inicio = iso(ini);
    _audFiltros.fim    = iso(hoje);
  } else if (v === '30d') {
    const ini = new Date(hoje); ini.setDate(hoje.getDate()-29);
    _audFiltros.inicio = iso(ini);
    _audFiltros.fim    = iso(hoje);
  } else {
    _audFiltros.inicio = '';
    _audFiltros.fim    = '';
  }
  const ini = document.getElementById('audFiltInicio');
  const fim = document.getElementById('audFiltFim');
  if (ini) ini.value = _audFiltros.inicio;
  if (fim) fim.value = _audFiltros.fim;
  _audPagina = 0;
  if (rerender) {
    renderAuditoria(_audTargetEl);
  } else {
    _audRender();
  }
}

function _audLimparFiltros() {
  _audFiltros = { user:'todos', modulo:'todos', busca:'', inicio:'', fim:'', periodo:'7d' };
  _audPagina  = 0;
  renderAuditoria(_audTargetEl);
}

function _audIrPagina(p) {
  _audPagina = p;
  _audRenderTabela(_audDadosFiltrados());
  (_audEl() || document.scrollingElement)?.scrollIntoView?.({ behavior:'smooth', block:'start' });
}

// ── Exportar CSV ──────────────────────────────────────────────
function _audExportar() {
  const dados = _audDadosFiltrados();
  if (dados.length === 0) { toast('Nenhum registro para exportar', 'warn'); return; }

  const header = ['Data/Hora','Usuário','Perfil','Módulo','Ação','Detalhe'];
  const linhas = dados.map(e => [
    fmtDT(e.created_at),
    e.user_name || 'Sistema',
    e.user_role || '',
    _audNomeMod(e.modulo || ''),
    e.acao || '',
    (e.detalhe || '').replace(/"/g,'""'),
  ].map(v => `"${v}"`).join(','));

  const csv  = [header.join(','), ...linhas].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `auditoria_vtp_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${dados.length} registros exportados`, 'ok');
}

/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Módulo de Contagem de Estoque (reformulado)
 * Objetivo: comparar estoque físico vs digital, detectar divergências
 */

let _estFiltro      = { search: '', cat: '', status: 'all' };
let _contagem       = {}; // { itemId: qtyFisico }
let _contagemAtiva  = false;
let _estTab         = 'contagem'; // 'contagem' | 'movimentacoes'
let _modoContagem   = 'semanal';  // 'diaria' | 'semanal'

// Categorias prioritárias para contagem diária

// Storage de movimentações
const _getMov    = () => db._get('vtp_movimentacoes', []);
const _saveMov   = m  => db._set('vtp_movimentacoes', m);
const _getHistContagens  = () => db._get('vtp_hist_contagens', []);
const _saveHistContagens = h  => db._set('vtp_hist_contagens', h);

// Retorna mapa itemId → {fisico, date} da contagem mais recente
function _ultimaContagemPorItem() {
  const hist   = _getHistContagens();
  if (!hist.length) return {};
  const sorted = [...hist].sort((a,b) => new Date(b.date) - new Date(a.date));
  const mapa   = {};
  for (const c of sorted) {
    for (const it of (c.itens || [])) {
      if (it.fisico !== null && !(it.id in mapa)) {
        mapa[it.id] = { fisico: it.fisico, diverg: it.diverg ?? null, date: c.date, user: c.user };
      }
    }
  }
  return mapa;
}

// Tipos de movimentação
const MOV_TIPOS = {
  entrada_compra:   { label: 'Entrada — Compra',         icon: 'arrow-down-circle', cor: 'var(--green)', bg: 'var(--green-light)' },
  entrada_ajuste:   { label: 'Entrada — Ajuste manual',  icon: 'plus-circle',       cor: 'var(--green)', bg: 'var(--green-light)' },
  saida_venda:      { label: 'Saída — Venda (auto)',      icon: 'shopping-bag',      cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_producao:   { label: 'Saída — Produção interna', icon: 'chef-hat',          cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_ajuste:     { label: 'Saída — Ajuste manual',    icon: 'minus-circle',      cor: 'var(--red)',   bg: 'var(--red-light)'   },
  saida_perda:      { label: 'Saída — Perda/Desperdício',icon: 'trash-2',           cor: 'var(--red)',   bg: 'var(--red-light)'   },
  importacao_cw:    { label: 'Importação Cardápio Web',  icon: 'upload',            cor: 'var(--green)', bg: 'var(--green-light)' },
};

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL + TABS
// ══════════════════════════════════════════════════════════════
function renderEstoque() {
  _atualizarEstTabs();
  if (_estTab === 'movimentacoes') {
    _renderMovimentacoes();
  } else {
    _renderContagemTab();
  }
  updatePrepBadge();
}

function setEstTab(tab) {
  _estTab = tab;
  _atualizarEstTabs();
  if (tab === 'movimentacoes') {
    document.getElementById('estPanelContagem').style.display = 'none';
    document.getElementById('estPanelMovimentacoes').style.display = '';
    _renderMovimentacoes();
  } else {
    document.getElementById('estPanelContagem').style.display = '';
    document.getElementById('estPanelMovimentacoes').style.display = 'none';
    _renderContagemTab();
  }
}

function _atualizarEstTabs() {
  ['contagem','movimentacoes'].forEach(t => {
    document.getElementById(`estTab-${t}`)?.classList.toggle('active', _estTab === t);
  });
  const btnImport = document.getElementById('estBtnImport');
  if (btnImport) btnImport.style.display = _estTab === 'contagem' ? 'flex' : 'none';
}

function setModoContagem(modo) {
  _modoContagem = modo;
  _estFiltro.cat = '';
  _estFiltro.status = 'all';
  _renderContagemTab();
}

function _renderContagemTab() {
  const modoEl = document.getElementById('estModoContagem');
  if (modoEl) {
    const u          = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const role       = u?.role || '';
    const perms      = typeof getContagemPerms === 'function' ? getContagemPerms() : { diaria: ['gerente','supervisor','comprador','funcionario'], semanal: ['gerente','supervisor','comprador'] };
    const podeDiaria = perms.diaria.includes(role);
    const podeSemanal= perms.semanal.includes(role);

    // Ajusta modo ativo se o atual não é permitido
    if (_modoContagem === 'diaria'  && !podeDiaria  && podeSemanal) _modoContagem = 'semanal';
    if (_modoContagem === 'semanal' && !podeSemanal && podeDiaria)  _modoContagem = 'diaria';

    if (!podeDiaria && !podeSemanal) {
      modoEl.innerHTML = `<div style="padding:12px 14px;border-radius:var(--r8);background:var(--surface2);font-size:var(--text-sm);color:var(--muted);display:flex;align-items:center;gap:8px">
        ${lc('lock',14,'currentColor')} Seu perfil não tem permissão para realizar contagens. Solicite ao gerente.
      </div>`;
      return;
    }

    modoEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:3px">
        ${podeDiaria ? `<button onclick="setModoContagem('diaria')"
          style="padding:6px 14px;border-radius:var(--r8);border:none;cursor:pointer;font-size:var(--text-sm);font-weight:700;font-family:Inter,sans-serif;transition:all .15s;
            background:${_modoContagem==='diaria'?'var(--orange-dark)':'transparent'};
            color:${_modoContagem==='diaria'?'#fff':'var(--muted)'}">
          ${lc('zap',12,_modoContagem==='diaria'?'#fff':'currentColor')} Contagem Diária
        </button>` : ''}
        ${podeSemanal ? `<button onclick="setModoContagem('semanal')"
          style="padding:6px 14px;border-radius:var(--r8);border:none;cursor:pointer;font-size:var(--text-sm);font-weight:700;font-family:Inter,sans-serif;transition:all .15s;
            background:${_modoContagem==='semanal'?'var(--purple)':'transparent'};
            color:${_modoContagem==='semanal'?'#fff':'var(--muted)'}">
          ${lc('clipboard-list',12,_modoContagem==='semanal'?'#fff':'currentColor')} Contagem Semanal
        </button>` : ''}
      </div>
      ${_modoContagem==='diaria'
        ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:6px;display:flex;align-items:center;gap:5px">
            ${lc('info',10,'currentColor')} Apenas insumos marcados para contagem diária no cadastro + críticos — configure em Cadastros → Insumos
           </div>`
        : `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:6px;display:flex;align-items:center;gap:5px">
            ${lc('info',10,'currentColor')} Contagem completa de todos os insumos — use para fechar a lista de compras da semana
           </div>`}`;
  }

  const thFis   = document.getElementById('estThFisico');
  const thDiv   = document.getElementById('estThDiverg');
  if (thFis)   thFis.textContent   = _contagemAtiva ? 'Físico'       : 'Últ. Contagem';
  if (thDiv)   thDiv.style.display = _contagemAtiva ? ''             : 'none';

  const todosInsumos = items.filter(i => !i.isProd);
  const insumos = _modoContagem === 'diaria'
    ? todosInsumos.filter(i => i.contagemDiaria)
    : todosInsumos;

  const cats = [...new Set(insumos.map(i => i.cat))].sort();
  const catEl = document.getElementById('estCatFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }
  _renderEstKpis(insumos);
  _renderFiltrosBtns();
  _renderEstoqueTabela(insumos);
}

// ── KPIs ──────────────────────────────────────────────────────
function _renderEstKpis(insumos) {
  const el = document.getElementById('estKpis');
  if (!el) return;

  const crit = insumos.filter(i => gst(i) === 'crit').length;
  const warn = insumos.filter(i => gst(i) === 'warn').length;
  const ok   = insumos.filter(i => gst(i) === 'ok').length;

  // Divergências na contagem ativa
  const diverg = _contagemAtiva
    ? insumos.filter(i => {
        const fis = _contagem[i.id];
        return fis !== undefined && Math.abs(fis - i.qty) > 0.001;
      }).length
    : null;

  el.innerHTML = `
    ${_kpi(crit, 'Críticos',    'var(--red)',    'crit', 'alert-circle')}
    ${_kpi(warn, 'Baixo',       'var(--yellow)', 'warn', 'alert-triangle')}
    ${_kpi(ok,   'OK',          'var(--green)',  'ok',   'check-circle')}
    ${diverg !== null ? _kpi(diverg, 'Divergências', 'var(--orange-dark)', 'diverg', 'git-branch') : ''}`;
}

function _kpi(val, label, cor, filtro, icon) {
  const active = _estFiltro.status === filtro;
  return `
    <div class="kpi" onclick="setEstFiltro('${filtro}')"
      style="cursor:pointer;border-color:${active ? cor : 'var(--border)'};background:${active ? cor+'11' : 'var(--surface)'}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc(icon, 16, active ? cor : 'var(--muted)')}
        <div class="kpi-v" style="color:${cor};font-size:1.4rem">${val}</div>
      </div>
      <div class="kpi-l">${label}</div>
    </div>`;
}

// ── Filtros ───────────────────────────────────────────────────
function _renderFiltrosBtns() {
  const el = document.getElementById('estFiltrosBtns');
  if (!el) return;
  const st = _estFiltro.status;
  const btns = [
    { id:'all',    label:'Todos',           icon:'package'        },
    { id:'crit',   label:'Críticos',        icon:'alert-circle'   },
    { id:'warn',   label:'Baixo',           icon:'alert-triangle' },
    { id:'ok',     label:'OK',              icon:'check-circle'   },
    { id:'need',   label:'Com necessidade', icon:'arrow-up'       },
    ..._contagemAtiva ? [{ id:'diverg', label:'Divergências', icon:'git-branch' }] : [],
    ..._contagemAtiva ? [{ id:'contado', label:'Contados', icon:'check-square' }] : [],
  ];
  el.innerHTML = btns.map(b =>
    `<button class="filter-btn ${st===b.id?'active':''}" onclick="setEstFiltro('${b.id}')">
      ${lc(b.icon, 12, 'currentColor')} ${b.label}
    </button>`
  ).join('');
}

// ── Tabela ────────────────────────────────────────────────────
function _renderEstoqueTabela(insumos) {
  const q   = _estFiltro.search.toLowerCase();
  const cat = _estFiltro.cat;
  const st  = _estFiltro.status;

  let filt = insumos.filter(i => {
    if (cat && i.cat !== cat) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    if (st === 'crit')   return gst(i) === 'crit';
    if (st === 'warn')   return gst(i) === 'warn';
    if (st === 'ok')     return gst(i) === 'ok';
    if (st === 'need')   return gneed(i) > 0;
    if (st === 'diverg') {
      const fis = _contagem[i.id];
      return fis !== undefined && Math.abs(fis - i.qty) > 0.001;
    }
    if (st === 'contado') return _contagem[i.id] !== undefined;
    return true;
  }).sort((a,b) => {
    const order = { crit:0, warn:1, ok:2 };
    return (order[gst(a)]||2) - (order[gst(b)]||2) || a.name.localeCompare(b.name);
  });

  const byCat = {};
  filt.forEach(i => { if (!byCat[i.cat]) byCat[i.cat]=[]; byCat[i.cat].push(i); });

  const tbody = document.getElementById('estTableBody');
  if (!tbody) return;

  if (!filt.length) {
    tbody.innerHTML = `
      <tr><td colspan="9" style="text-align:center;padding:40px">
        <div class="empty-icon">${lc('package',24,'var(--muted)')}</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">Nenhum item encontrado</div>
      </td></tr>`;
    return;
  }

  const stColors  = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
  const stLabels  = { crit:'CRÍTICO', warn:'BAIXO', ok:'OK' };
  const rowBg     = { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };
  const ultimaMapa = _ultimaContagemPorItem();

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => {
    const catRow = `
      <tr>
        <td colspan="9" style="padding:8px 16px 5px;background:var(--surface2);border-top:2px solid var(--border);border-bottom:1px solid var(--border)">
          <span style="font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">${cat}</span>
        </td>
      </tr>`;

    const itemRows = catItems.map(i => {
      const s         = gst(i);
      const pct       = i.ideal > 0 ? Math.min(100, Math.round(i.qty / i.ideal * 100)) : 0;
      const fisBg     = rowBg[s] || 'var(--surface)';
      const fisCont   = _contagem[i.id];
      const temFis    = fisCont !== undefined;
      const diverg    = temFis && Math.abs(fisCont - i.qty) > 0.001;
      const divergPct = temFis && i.qty > 0 ? ((fisCont - i.qty) / i.qty * 100) : 0;
      const rowBgFinal= diverg ? '#FFF3CD' : fisBg;
      const ultima        = ultimaMapa[i.id] || null;
      const divRegist     = ultima && ultima.diverg !== null && Math.abs(ultima.diverg) > 0.001;
      const divRegistSinal= divRegist ? (ultima.diverg > 0 ? '+' : '') + fmt(ultima.diverg) + ' ' + i.unit : null;
      // Se há divergência registrada e não há contagem ativa, sinaliza a linha
      const rowBgEfetivo  = (!_contagemAtiva && divRegist) ? 'var(--orange-light)' : rowBgFinal;
      const leftBorder    = (!_contagemAtiva && divRegist) ? '3px solid var(--orange-dark)' : diverg ? '3px solid var(--orange-dark)' : '3px solid transparent';

      return `
        <tr id="est-row-${i.id}" style="background:${rowBgEfetivo};border-bottom:1px solid var(--border);border-left:${leftBorder}">
          <!-- Nome -->
          <td style="padding:10px 14px;min-width:180px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:var(--text-sm);font-weight:600;color:var(--text)">${i.name}</span>
              ${divRegist && !_contagemAtiva ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:20px;background:var(--orange-dark);color:#fff;font-size:var(--text-2xs);font-weight:800;white-space:nowrap">
                ${lc('alert-triangle',8,'#fff')} ${divRegistSinal}
              </span>` : ''}
            </div>
            ${i.code ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace;margin-top:1px">#${i.code}</div>` : ''}
          </td>

          <!-- Un -->
          <td class="c" style="font-size:var(--text-sm);color:var(--muted);width:48px">${i.unit}</td>

          <!-- Digital (readonly) -->
          <td class="c" style="width:88px">
            <div style="font-size:var(--text-md);font-weight:700;font-family:monospace;color:var(--text)">${fmt(i.qty)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">digital</div>
          </td>

          <!-- Última Contagem / Físico editável -->
          <td class="c" style="width:110px">
            ${_contagemAtiva ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
                ${ultima ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">${fmt(ultima.fisico)} <span style="opacity:.7">${i.unit}</span></div>` : ''}
                <input type="number" value="${temFis ? fisCont : ''}" min="0" step="0.001"
                  placeholder="${ultima ? fmt(ultima.fisico) : '0'}"
                  style="width:76px;padding:5px 7px;border:1.5px solid ${diverg?'var(--orange-dark)':'var(--border)'};
                  border-radius:var(--r6);font-size:var(--text-sm);font-family:monospace;text-align:center;
                  background:${diverg?'#FFFBEB':'var(--surface)'}"
                  oninput="setFisico(${i.id}, this.value)">
              </div>
            ` : ultima ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:1px">
                <div style="font-size:var(--text-md);font-weight:700;font-family:monospace;color:var(--text2)">${fmt(ultima.fisico)}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted)">${fmtD(ultima.date)}</div>
              </div>
            ` : `<div style="font-size:var(--text-xs);color:var(--muted);font-style:italic">—</div>`}
          </td>

          <!-- Divergência (só durante contagem ativa) -->
          <td class="c" style="width:100px;${_contagemAtiva?'':'display:none'}">
            ${temFis ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:1px">
                <div style="font-size:var(--text-sm);font-weight:700;font-family:monospace;
                  color:${diverg?'var(--orange-dark)':'var(--green)'}">
                  ${diverg ? `${fisCont > i.qty ? '+' : ''}${fmt(fisCont - i.qty)}` : '✓'}
                </div>
                ${diverg ? `<div style="font-size:var(--text-2xs);color:var(--orange-dark)">${divergPct > 0 ? '+' : ''}${divergPct.toFixed(1)}%</div>` : ''}
              </div>
            ` : '<div style="font-size:var(--text-xs);color:var(--border2)">—</div>'}
          </td>

          <!-- Mín -->
          <td class="c" style="font-size:var(--text-sm);color:var(--muted);width:60px">${fmt(i.min)}</td>

          <!-- Ideal -->
          <td class="c" style="font-size:var(--text-sm);color:var(--muted);width:60px">${fmt(i.ideal)}</td>

          <!-- Barra -->
          <td style="width:120px;padding:8px 12px">
            <div style="display:flex;align-items:center;gap:7px">
              <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${stColors[s]};border-radius:3px"></div>
              </div>
              <span style="font-size:var(--text-2xs);color:${stColors[s]};font-weight:700;min-width:32px;text-align:right">${pct}%</span>
            </div>
          </td>

          <!-- Status -->
          <td class="c" style="width:80px">
            <span class="chip chip-${s==='crit'?'red':s==='warn'?'yellow':'green'}">
              ${lc(s==='crit'?'alert-circle':s==='warn'?'alert-triangle':'check-circle', 10, 'currentColor')}
              ${stLabels[s]}
            </span>
          </td>
        </tr>`;
    }).join('');

    return catRow + itemRows;
  }).join('');

  // Badge sidebar
  const badge = document.getElementById('badge-estoque');
  const critCount = insumos.filter(i => gst(i) === 'crit').length;
  if (badge) { badge.textContent = critCount||''; badge.style.display = critCount > 0 ? 'inline-flex' : 'none'; }

  // Atualiza painel de contagem
  _renderPainelContagem();
}

// ── Painel lateral de contagem ────────────────────────────────
function _renderPainelContagem() {
  const el = document.getElementById('estPainelContagem');
  if (!el) return;

  const insumos  = items.filter(i => !i.isProd);
  const contados = Object.keys(_contagem).length;
  const divergs  = insumos.filter(i => {
    const f = _contagem[i.id];
    return f !== undefined && Math.abs(f - i.qty) > 0.001;
  });

  if (!_contagemAtiva) {
    const hist        = _getHistContagens();
    const histRecente = [...hist].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
    const ultimaData  = histRecente[0] ? fmtD(histRecente[0].date) : null;

    el.innerHTML = `
      <div style="padding:16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          ${lc('clipboard-list',14,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:800">Contagem de Estoque</span>
        </div>
        ${ultimaData
          ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:14px;display:flex;align-items:center;gap:5px">
              ${lc('calendar',9,'currentColor')} Última: <strong style="color:var(--text)">${ultimaData}</strong>
             </div>`
          : `<div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:14px">Nenhuma contagem registrada ainda</div>`}
        <button onclick="iniciarContagemEstoque()"
          style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);
          font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:${hist.length?'16px':'0'}">
          ${lc('play-circle',15,'#fff')} Iniciar contagem
        </button>
        ${hist.length ? `
          <div>
            <div style="font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px">Histórico</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${histRecente.map(c => {
                const nd  = c.itens?.filter(x => Math.abs(x.diverg||0) > 0.001).length ?? c.divergs ?? 0;
                const dt  = fmtDT(c.date);
                return `<div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
                  <div style="padding:8px 10px;background:var(--surface2);display:flex;align-items:flex-start;justify-content:space-between;gap:6px">
                    <div style="min-width:0">
                      <div style="font-size:var(--text-xs);font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dt}</div>
                      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lc('user',8,'currentColor')} ${c.user}</div>
                    </div>
                    <button onclick="abrirDetalheContagem('${c.id}')" title="Ver detalhes"
                      style="background:none;border:none;cursor:pointer;padding:2px;flex-shrink:0;color:var(--purple)">
                      ${lc('external-link',12,'currentColor')}
                    </button>
                  </div>
                  <div style="padding:6px 10px;display:flex;gap:10px">
                    <div style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:4px">
                      ${lc('package',9,'currentColor')} <strong style="color:var(--text)">${c.total}</strong> itens
                    </div>
                    <div style="font-size:var(--text-xs);display:flex;align-items:center;gap:4px;color:${nd>0?'var(--orange-dark)':'var(--green)'}">
                      ${lc(nd>0?'alert-triangle':'check-circle',9,'currentColor')}
                      <strong>${nd}</strong> diverg.
                    </div>
                  </div>
                </div>`;
              }).join('')}
              ${hist.length > 5 ? `<div style="font-size:var(--text-2xs);color:var(--muted);text-align:center;padding:4px">
                +${hist.length-5} contagem${hist.length-5>1?'ns':''} anteriores
              </div>` : ''}
            </div>
          </div>
        ` : ''}
      </div>`;
  } else {
    el.innerHTML = `
      <div style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:var(--text-sm);font-weight:800;color:var(--purple)">${lc('clipboard-list',13,'var(--purple)')} Contagem ativa</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px">${contados}/${insumos.length} itens contados</div>
          </div>
          <button onclick="cancelarContagemEstoque()"
            style="background:none;border:1px solid var(--red);border-radius:var(--r6);padding:3px 8px;
            font-size:var(--text-2xs);color:var(--red);cursor:pointer">${lc('x',10,'currentColor')} Cancelar</button>
        </div>

        <!-- Progresso -->
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:12px">
          <div style="height:100%;width:${insumos.length > 0 ? Math.round(contados/insumos.length*100) : 0}%;background:var(--purple);border-radius:3px;transition:width .3s"></div>
        </div>

        <!-- Resumo divergências -->
        ${divergs.length > 0 ? `
          <div style="background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);padding:10px;margin-bottom:12px">
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);margin-bottom:6px">
              ${lc('alert-triangle',12,'var(--orange-dark)')} ${divergs.length} divergência(s)
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto">
              ${divergs.slice(0,6).map(i => {
                const f = _contagem[i.id];
                const d = f - i.qty;
                return `<div style="display:flex;justify-content:space-between;font-size:var(--text-xs)">
                  <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">${i.name}</span>
                  <span style="font-family:monospace;font-weight:700;color:${d>0?'var(--green)':'var(--red)'};flex-shrink:0">
                    ${d>0?'+':''}${fmt(d)} ${i.unit}
                  </span>
                </div>`;
              }).join('')}
              ${divergs.length > 6 ? `<div style="font-size:var(--text-2xs);color:var(--muted)">+${divergs.length-6} mais...</div>` : ''}
            </div>
          </div>
        ` : contados > 0 ? `
          <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:8px;margin-bottom:12px;font-size:var(--text-xs);color:var(--green);font-weight:600;text-align:center">
            ${lc('check-circle',12,'currentColor')} Sem divergências até agora!
          </div>
        ` : ''}

        <button onclick="concluirContagemEstoque()"
          style="width:100%;padding:10px;background:var(--green);color:#fff;border:none;border-radius:var(--r8);
          font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:6px">
          ${lc('check-circle',15,'#fff')} Concluir contagem
        </button>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-align:center">O digital não será alterado</div>
      </div>`;
  }
}

// ── Contagem física ───────────────────────────────────────────
function setFisico(itemId, val) {
  const v = parseFloat(val);
  if (val === '' || val === null) {
    delete _contagem[itemId];
  } else if (!isNaN(v) && v >= 0) {
    _contagem[itemId] = parseFloat(v.toFixed(3));
  }
  // Atualiza a linha inline
  const insumos = items.filter(i => !i.isProd);
  _renderEstKpis(insumos);
  _renderPainelContagem();
}

function iniciarContagemEstoque() {
  _contagem = {};
  _contagemAtiva = true;
  renderEstoque();
  toast('Contagem iniciada! Digite as quantidades físicas.', 'ok');
}

function cancelarContagemEstoque() {
  vtpConfirm({
    title: 'Cancelar contagem',
    message: 'Os dados não serão salvos.',
    confirmLabel: 'Cancelar contagem',
    onConfirm: () => {
      _contagem = {};
      _contagemAtiva = false;
      renderEstoque();
    }
  });
}

function concluirContagemEstoque() {
  const u        = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const insumos  = items.filter(i => !i.isProd);
  const contados = Object.keys(_contagem).length;

  if (contados === 0) {
    toast('Nenhum item contado. Digite as quantidades físicas antes de concluir.', 'err');
    return;
  }

  // Monta snapshot da contagem
  const snapshot = insumos.map(i => ({
    id:       i.id,
    name:     i.name,
    unit:     i.unit,
    cat:      i.cat,
    digital:  i.qty,
    fisico:   _contagem[i.id] ?? null,
    diverg:   _contagem[i.id] !== undefined ? parseFloat((_contagem[i.id] - i.qty).toFixed(3)) : null,
    min:      i.min,
    ideal:    i.ideal,
  })).filter(x => x.fisico !== null);

  const hist = _getHistContagens();
  hist.push({
    id:        `CNT-${String(hist.length+1).padStart(4,'0')}`,
    date:      new Date().toISOString(),
    user:      u?.name || 'Sistema',
    total:     contados,
    divergs:   snapshot.filter(x => Math.abs(x.diverg) > 0.001).length,
    itens:     snapshot,
  });
  _saveHistContagens(hist);

  _contagem = {};
  _contagemAtiva = false;
  renderEstoque();
  toast(`Contagem concluída! ${snapshot.filter(x=>Math.abs(x.diverg)>0.001).length} divergências registradas.`, 'ok');
}

// ── Histórico de contagens ────────────────────────────────────
function verHistoricoContagens() {
  const hist = _getHistContagens();
  const popup = document.createElement('div');
  popup.id = 'popupHistContagem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:760px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div>
          <div style="font-size:1rem;font-weight:800">${lc('clock',16,'var(--purple)')} Histórico de Contagens</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${hist.length} contagem(ns) registrada(s)</div>
        </div>
        <button onclick="document.getElementById('popupHistContagem').remove()"
          style="background:none;border:none;cursor:pointer;padding:6px">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:12px">
        ${hist.length === 0 ? `<div class="empty" style="padding:40px">Nenhuma contagem registrada.</div>` :
          [...hist].reverse().map(c => {
            const divItems = c.itens.filter(x => Math.abs(x.diverg) > 0.001);
            return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface2);flex-wrap:wrap;gap:8px">
                <div>
                  <div style="font-size:var(--text-md);font-weight:800">${c.id}</div>
                  <div style="font-size:var(--text-xs);color:var(--muted)">${fmtDT(c.date)} · por <strong>${c.user}</strong></div>
                </div>
                <div style="display:flex;gap:10px;align-items:center">
                  <div style="text-align:center;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
                    <div style="font-size:var(--text-md);font-weight:800;color:var(--purple)">${c.total}</div>
                    <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Contados</div>
                  </div>
                  <div style="text-align:center;padding:4px 10px;background:${divItems.length>0?'var(--yellow-light)':'var(--green-light)'};border:1px solid ${divItems.length>0?'var(--yellow)':'var(--green)'};border-radius:var(--r6)">
                    <div style="font-size:var(--text-md);font-weight:800;color:${divItems.length>0?'var(--orange-dark)':'var(--green)'}">${divItems.length}</div>
                    <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Divergências</div>
                  </div>
                  <button onclick="abrirDetalheContagem('${c.id}')"
                    style="padding:5px 12px;border:1.5px solid var(--purple);border-radius:var(--r6);
                    background:var(--surface);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer">
                    ${lc('search',12,'currentColor')} Detalhar
                  </button>
                </div>
              </div>
              ${divItems.length > 0 ? `
                <div style="padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px">
                  ${divItems.slice(0,6).map(x => `
                    <span style="font-size:var(--text-xs);padding:2px 7px;border-radius:20px;
                      background:${x.diverg<0?'var(--red-light)':'var(--green-light)'};
                      color:${x.diverg<0?'var(--red)':'var(--green)'};border:1px solid ${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.name}: ${x.diverg>0?'+':''}${fmt(x.diverg)}
                    </span>`).join('')}
                  ${divItems.length > 6 ? `<span style="font-size:var(--text-2xs);color:var(--muted)">+${divItems.length-6} mais</span>` : ''}
                </div>` : ''}
            </div>`;
          }).join('')}
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
}

function abrirDetalheContagem(id) {
  const hist = _getHistContagens();
  const c = hist.find(x => x.id === id);
  if (!c) return;

  const popup2 = document.createElement('div');
  popup2.id = 'popupDetalheContagem';
  popup2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';

  const divItems = c.itens.filter(x => Math.abs(x.diverg) > 0.001);
  const okItems  = c.itens.filter(x => Math.abs(x.diverg||0) <= 0.001);

  popup2.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:680px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div>
          <div style="font-size:var(--text-base);font-weight:800">${c.id} — Detalhe</div>
          <div style="font-size:var(--text-xs);color:var(--muted)">${fmtDT(c.date)} · ${c.user}</div>
        </div>
        <button onclick="document.getElementById('popupDetalheContagem').remove()"
          style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px 22px">
        ${divItems.length > 0 ? `
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--orange-dark);margin-bottom:8px">
            ${lc('alert-triangle',12,'var(--orange-dark)')} Divergências (${divItems.length})
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--surface2)">
                <th style="padding:7px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Item</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Digital</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Físico</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Diferença</th>
                <th style="padding:7px 12px;text-align:center;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Var %</th>
              </tr></thead>
              <tbody>
                ${divItems.map((x,idx) => {
                  const pctDiv = x.digital > 0 ? ((x.diverg/x.digital)*100).toFixed(1) : '—';
                  return `<tr style="border-top:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:7px 12px">
                      <div style="font-size:var(--text-sm);font-weight:600">${x.name}</div>
                      <div style="font-size:var(--text-2xs);color:var(--muted)">${x.cat}</div>
                    </td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm)">${fmt(x.digital)} ${x.unit}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm)">${fmt(x.fisico)} ${x.unit}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:var(--text-sm);font-weight:700;color:${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.diverg>0?'+':''}${fmt(x.diverg)}
                    </td>
                    <td style="padding:7px 12px;text-align:center;font-size:var(--text-sm);font-weight:600;color:${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.diverg>0?'+':''}${pctDiv}%
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `
          <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:12px;text-align:center;margin-bottom:16px;font-size:var(--text-sm);font-weight:600;color:var(--green)">
            ${lc('check-circle',14,'currentColor')} Nenhuma divergência nesta contagem!
          </div>`}

        ${okItems.length > 0 ? `
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:8px">
            ${lc('check-circle',12,'var(--green)')} OK (${okItems.length})
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${okItems.map(x => `
              <span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:20px;background:var(--green-light);color:var(--green);border:1px solid var(--green)">
                ${x.name}: ${fmt(x.fisico)} ${x.unit}
              </span>`).join('')}
          </div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(popup2);
  popup2.addEventListener('click', e => { if(e.target===popup2) popup2.remove(); });
}

// ── Filtros ───────────────────────────────────────────────────
function setEstFiltro(status) {
  _estFiltro.status = _estFiltro.status === status ? 'all' : status;
  _renderFiltrosBtns();
  _renderEstKpis(items.filter(i => !i.isProd));
  _renderEstoqueTabela(items.filter(i => !i.isProd));
}

function setEstSearch(val) {
  _estFiltro.search = val;
  _renderEstoqueTabela(items.filter(i => !i.isProd));
}

function setEstCat(val) {
  _estFiltro.cat = val;
  _renderEstoqueTabela(items.filter(i => !i.isProd));
}

// ── CSV Import (mantém lógica, atualiza digital) ──────────────
function openImportModal() {
  document.getElementById('ovImport').classList.add('open');
}

function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) parseCSV(file);
  document.getElementById('dropzone')?.classList.remove('drag');
}

function handleFile(inp) { if (inp.files[0]) parseCSV(inp.files[0]); }

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let text = e.target.result.replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast('CSV inválido', 'err'); return; }

    const sep  = lines[0].includes(';') ? ';' : ',';
    const norm = s => s.trim().replace(/"/g,'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const header = lines[0].split(sep).map(norm);
    const col    = (...keys) => header.findIndex(h => keys.some(k => h.includes(norm(k))));

    const nameIdx = col('insumo','nome','produto');
    const codeIdx = col('cod. interno','codigo interno','cod interno','code');
    const qtyIdx  = col('estoque atual','atual','qty');
    const minIdx  = col('estoque minimo','minimo','min');
    const costIdx = col('preco de custo','custo','price');

    if (nameIdx === -1 && codeIdx === -1) {
      toast('CSV não reconhecido — verifique se é o relatório do Cardápio Web', 'err');
      return;
    }

    const parseMoney = v => parseFloat((v||'').replace(/[R$\s]/g,'').replace(',','.')) || 0;
    const parseNum   = v => parseFloat((v||'').replace(',','.'));

    importData = [];
    const naoEncontrados = [];

    lines.slice(1).forEach(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/"/g,''));
      const name = nameIdx >= 0 ? cols[nameIdx]||'' : '';
      const code = codeIdx >= 0 ? cols[codeIdx]||'' : '';
      const qty  = qtyIdx  >= 0 ? parseNum(cols[qtyIdx])  : NaN;
      const min  = minIdx  >= 0 ? parseNum(cols[minIdx])  : NaN;
      const cost = costIdx >= 0 ? parseMoney(cols[costIdx]): 0;

      if (!name && !code) return;
      if (isNaN(qty)) return;

      const item = items.find(i =>
        (code && i.code && i.code.toString() === code.toString()) ||
        (name && i.name.toLowerCase().trim() === name.toLowerCase().trim())
      );

      if (item) {
        importData.push({
          id:item.id, name:item.name,
          oldQty:item.qty, newQty:parseFloat(qty.toFixed(3)),
          oldMin:item.min, newMin:!isNaN(min)?parseFloat(min.toFixed(3)):item.min,
          oldCost:item.cost, newCost:cost > 0 ? cost : item.cost,
        });
      } else if (name) {
        naoEncontrados.push(name);
      }
    });

    const prev = document.getElementById('importPreview');
    if (!prev) return;

    if (!importData.length) {
      prev.innerHTML = `
        <div style="background:var(--red-light);border:1px solid #FCA5A5;border-radius:var(--r8);padding:12px;font-size:var(--text-sm);color:var(--red)">
          ${lc('alert-circle',14,'var(--red)')} Nenhum item encontrado. Verifique os códigos internos em Cadastros.
        </div>
        ${naoEncontrados.length ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px">${naoEncontrados.length} no CSV: ${naoEncontrados.slice(0,5).join(', ')}...</div>` : ''}`;
      return;
    }

    prev.innerHTML = `
      <div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px;margin-bottom:10px;font-size:var(--text-sm);color:var(--green);font-weight:600">
        ${lc('check-circle',13,'currentColor')} ${importData.length} itens reconhecidos — <strong>apenas a quantidade</strong> será atualizada
      </div>
      <div style="background:var(--surface2);border-radius:var(--r6);padding:7px 10px;margin-bottom:10px;font-size:var(--text-xs);color:var(--muted)">
        ${lc('info',12,'currentColor')} Nome, estoque mínimo, ideal e custo permanecem conforme configurado no VTP App.
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${importData.map(d => {
          const diff = d.newQty - d.oldQty;
          const diffColor = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--muted)';
          const diffStr  = diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
          return `
          <div style="padding:7px 11px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
            <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:2px">${d.name}</div>
            <div style="display:flex;gap:12px;font-family:monospace;font-size:var(--text-xs);color:var(--muted)">
              <span>Qtd: <strong>${d.oldQty}</strong> → <strong style="color:var(--purple)">${d.newQty}</strong></span>
              <span style="color:${diffColor};font-weight:600">${diffStr}</span>
            </div>
          </div>`;}).join('')}
      </div>
      ${naoEncontrados.length ? `
        <div style="font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-radius:var(--r6);padding:7px 10px;margin-bottom:10px">
          Não encontrados (${naoEncontrados.length}): ${naoEncontrados.slice(0,8).join(', ')}${naoEncontrados.length>8?'...':''}
        </div>` : ''}
      <button class="btn btn-primary" style="width:100%" onclick="confirmImport()">
        ${lc('check',14,'#fff')} Confirmar — atualizar digital
      </button>`;
  };
  reader.readAsText(file, 'UTF-8');
}

function confirmImport() {
  // Registra movimentações antes de alterar os itens
  registrarImportacaoCW(importData);

  // Regra: importação do Cardápio Web APENAS atualiza a quantidade (estoque digital).
  // Nome, estoque mínimo, estoque ideal e custo são sempre os definidos no VTP App — nunca sobrescritos.
  importData.forEach(d => {
    const item = items.find(i => i.id === d.id);
    if (!item) return;
    item.qty = d.newQty;
    // item.min, item.cost e item.name NÃO são alterados pela importação
  });
  saveI();
  closeModal('ovImport');
  toast(`${importData.length} itens atualizados (apenas quantidade)!`, 'ok');
  renderEstoque();
  renderDashboard();
  importData = [];
}

// ── Compatibilidade ───────────────────────────────────────────
function saveStock()           {}  // não usado no novo módulo
function addCarrinho(itemId)   { toast('Use o módulo Compras para o carrinho.', 'info'); }
function gerarListaCompras()   { goModule('compras'); }
function goToCompras()         { goModule('compras'); }
function iniciarCompras()      { goModule('compras'); }
function updateEstSelCount()   {}
function selectEstByStatus()   {}
function toggleEstAll()        {}

// ══════════════════════════════════════════════════════════════
// MÓDULO MOVIMENTAÇÕES
// ══════════════════════════════════════════════════════════════

// Gera dados simulados realistas na primeira vez
function _garantirMovSimuladas() {
  let movs = _getMov();
  if (movs.length > 0) return;

  const now   = new Date();
  const insumos = items.filter(i => !i.isProd).slice(0, 20);
  const nomes = insumos.map(i => ({ id:i.id, name:i.name, unit:i.unit, cat:i.cat }));
  const sim   = [];
  let id = 1;

  // Simula 4 semanas de movimentações
  for (let semana = 3; semana >= 0; semana--) {
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - semana * 7);

    // Importação do CW (vendas semanais) — saídas automáticas
    const cwDate = new Date(baseDate);
    cwDate.setDate(cwDate.getDate() - 1);
    nomes.forEach(ins => {
      const qtd = parseFloat((Math.random() * 15 + 2).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'saida_venda',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: -1,
        data: cwDate.toISOString(),
        origem: 'importacao_cw',
        descricao: `Saída automática CW — semana ${4-semana}`,
        usuario: 'Sistema (CW)',
        lote: `CW-SEM-${4-semana}-${semana+1}`,
      });
    });

    // Entradas de compra
    const compraDate = new Date(baseDate);
    compraDate.setDate(compraDate.getDate() + 1);
    nomes.slice(0, 8).forEach(ins => {
      if (Math.random() > 0.5) return;
      const qtd = parseFloat((Math.random() * 20 + 5).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'entrada_compra',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: 1,
        data: compraDate.toISOString(),
        origem: 'manual',
        descricao: 'Entrada de compra registrada',
        usuario: 'Yuri Pappas',
        lote: `LC${String(100 + semana * 3).padStart(4,'0')}`,
      });
    });

    // Saídas de produção interna
    const prodDate = new Date(baseDate);
    prodDate.setDate(prodDate.getDate() + 2);
    nomes.slice(0, 5).forEach(ins => {
      if (Math.random() > 0.4) return;
      const qtd = parseFloat((Math.random() * 5 + 0.5).toFixed(3));
      sim.push({
        id: id++,
        tipo: 'saida_producao',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: qtd,
        sinal: -1,
        data: prodDate.toISOString(),
        origem: 'manual',
        descricao: 'Retirada para pré-produção',
        usuario: 'Yuri Pappas',
        lote: null,
      });
    });

    // Ajuste esporádico
    if (semana === 1) {
      const ins = nomes[Math.floor(Math.random() * nomes.length)];
      sim.push({
        id: id++,
        tipo: 'ajuste_manual',
        itemId: ins.id,
        itemName: ins.name,
        itemUnit: ins.unit,
        itemCat: ins.cat,
        qty: 2.5,
        sinal: -1,
        data: baseDate.toISOString(),
        origem: 'manual',
        descricao: 'Ajuste de estoque — divergência contagem',
        usuario: 'Yuri Pappas',
        lote: null,
      });
    }
  }

  _saveMov(sim.sort((a,b) => new Date(b.data) - new Date(a.data)));
}

// Registra uma movimentação manualmente
function registrarMovimentacao(tipo, itemId, qty, descricao, lote) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const movs = _getMov();
  const nova  = {
    id:        Math.max(0, ...movs.map(m => m.id)) + 1,
    tipo,
    itemId:    item.id,
    itemName:  item.name,
    itemUnit:  item.unit,
    itemCat:   item.cat,
    qty:       Math.abs(qty),
    sinal:     tipo.startsWith('entrada') ? 1 : -1,
    data:      new Date().toISOString(),
    origem:    'manual',
    descricao: descricao || '',
    usuario:   u?.name || 'Sistema',
    lote:      lote || null,
  };
  movs.unshift(nova);
  _saveMov(movs);
  try { logAudit('movimentacao', tipo + ' — ' + item.name + ' ' + Math.abs(qty) + ' ' + item.unit, 'estoque'); } catch(e) {}
  return nova;
}

// Registra movimentações em lote ao importar CSV do CW
function registrarImportacaoCW(importData) {
  const movs = _getMov();
  const u    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const lote = `CW-${new Date().toISOString().slice(0,10)}`;
  const maxId = Math.max(0, ...movs.map(m => m.id));

  importData.forEach((d, idx) => {
    const item = items.find(i => i.id === d.id);
    if (!item) return;
    const diff = d.newQty - d.oldQty;
    if (Math.abs(diff) < 0.001) return;
    movs.unshift({
      id:       maxId + idx + 1,
      tipo:     diff > 0 ? 'entrada_ajuste' : 'saida_ajuste',
      itemId:   item.id,
      itemName: item.name,
      itemUnit: item.unit,
      itemCat:  item.cat,
      qty:      Math.abs(parseFloat(diff.toFixed(3))),
      sinal:    diff > 0 ? 1 : -1,
      data:     new Date().toISOString(),
      origem:   'importacao_cw',
      descricao:`Atualização via importação CSV do Cardápio Web`,
      usuario:  u?.name || 'Sistema',
      lote,
    });
  });
  _saveMov(movs);
}

// ── Render da aba de Movimentações ───────────────────────────
let _movFiltro = { search:'', tipo:'', itemId:'', de:'', ate:'', periodo:'semana' };

function _renderMovimentacoes() {
  _garantirMovSimuladas();
  const el = document.getElementById('estPanelMovimentacoes');
  if (!el) return;

  const f    = _movFiltro;
  let movs   = _getMov();
  const now  = new Date();

  // Filtro de período rápido
  if (f.periodo !== 'todos') {
    const dias = { dia:1, semana:7, quinzena:15, mes:30 }[f.periodo] || 7;
    const limit = new Date(now); limit.setDate(limit.getDate() - dias);
    movs = movs.filter(m => new Date(m.data) >= limit);
  }
  if (f.de)     movs = movs.filter(m => m.data.slice(0,10) >= f.de);
  if (f.ate)    movs = movs.filter(m => m.data.slice(0,10) <= f.ate);
  if (f.tipo)   movs = movs.filter(m => m.tipo === f.tipo);
  if (f.search) movs = movs.filter(m => m.itemName.toLowerCase().includes(f.search.toLowerCase()));

  // KPIs resumo do período filtrado
  const totalEntradas = movs.filter(m=>m.sinal>0).reduce((s,m)=>s+m.qty,0);
  const totalSaidas   = movs.filter(m=>m.sinal<0).reduce((s,m)=>s+m.qty,0);
  const vendas        = movs.filter(m=>m.tipo==='saida_venda').reduce((s,m)=>s+m.qty,0);
  const producao      = movs.filter(m=>m.tipo==='saida_producao').reduce((s,m)=>s+m.qty,0);

  // Top insumos com mais saída no período
  const saidasPorItem = {};
  movs.filter(m=>m.sinal<0).forEach(m=>{
    if (!saidasPorItem[m.itemName]) saidasPorItem[m.itemName] = { qty:0, unit:m.itemUnit };
    saidasPorItem[m.itemName].qty += m.qty;
  });
  const topSaidas = Object.entries(saidasPorItem).sort((a,b)=>b[1].qty-a[1].qty).slice(0,5);

  el.innerHTML = `
    <div style="max-width:100%">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:1rem;font-weight:800;margin-bottom:2px">Movimentações de Estoque</h2>
          <div style="font-size:var(--text-xs);color:var(--muted)">Entradas, saídas automáticas (CW) e manuais</div>
        </div>
        <button onclick="abrirModalMovManual()"
          style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r8);
          border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer">
          ${lc('plus',13,'#fff')} Registrar movimento
        </button>
      </div>

      <!-- Período rápido -->
      <div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <span style="font-size:var(--text-xs);color:var(--muted);margin-right:4px">Período:</span>
        ${['dia','semana','quinzena','mes','todos'].map(p => {
          const labels = {dia:'Hoje',semana:'7 dias',quinzena:'15 dias',mes:'30 dias',todos:'Tudo'};
          const active = f.periodo === p;
          return `<button onclick="_movSetPeriodo('${p}')"
            style="padding:5px 11px;border-radius:20px;font-size:var(--text-xs);font-weight:600;cursor:pointer;
            border:1.5px solid ${active?'var(--purple)':'var(--border)'};
            background:${active?'var(--purple)':'var(--surface)'};
            color:${active?'#fff':'var(--muted)'}">
            ${labels[p]}
          </button>`;
        }).join('')}
        <div style="width:1px;height:18px;background:var(--border);margin:0 4px"></div>
        <input type="date" value="${f.de}" onchange="_movFiltro.de=this.value;_movFiltro.periodo='todos';_renderMovimentacoes()"
          style="padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);color:var(--muted)">
        <span style="font-size:var(--text-xs);color:var(--muted)">até</span>
        <input type="date" value="${f.ate}" onchange="_movFiltro.ate=this.value;_movFiltro.periodo='todos';_renderMovimentacoes()"
          style="padding:4px 7px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs);color:var(--muted)">
      </div>

      <!-- KPIs do período -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px">
        <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('arrow-down-circle',12,'var(--green)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--green)">Entradas</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--green)">${movs.filter(m=>m.sinal>0).length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">no período</div>
        </div>
        <div style="background:var(--red-light);border:1.5px solid var(--red)22;border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('shopping-bag',12,'var(--red)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--red)">Vendas (auto)</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${movs.filter(m=>m.tipo==='saida_venda').length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">débito automático CW</div>
        </div>
        <div style="background:var(--red-light);border:1.5px solid var(--red)22;border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('chef-hat',12,'var(--red)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--red)">Produção</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--red)">${movs.filter(m=>m.tipo==='saida_producao').length} mov.</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">retiradas internas</div>
        </div>
        <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r10);padding:11px 14px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('activity',12,'var(--purple)')}<span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--purple)">Total movs.</span></div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">${movs.length}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">no período selecionado</div>
        </div>
      </div>

      <!-- Grid: tabela + sidebar com top consumo -->
      <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1fr 240px'};gap:16px;align-items:flex-start">

        <!-- Tabela de movimentações -->
        <div>
          <!-- Filtros da tabela -->
          <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
            <input class="inp" style="flex:1;min-width:160px;max-width:240px;padding:6px 10px;font-size:var(--text-sm)"
              placeholder="Buscar insumo..." value="${f.search}"
              oninput="_movFiltro.search=this.value;_renderMovimentacoes()">
            <select class="inp" style="max-width:200px;padding:6px 8px;font-size:var(--text-sm)"
              onchange="_movFiltro.tipo=this.value;_renderMovimentacoes()">
              <option value="">Todos os tipos</option>
              ${Object.entries(MOV_TIPOS).map(([k,v]) =>
                `<option value="${k}" ${f.tipo===k?'selected':''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>

          <div class="card" style="overflow:hidden">
            ${movs.length === 0 ? `
              <div class="empty" style="padding:40px">
                ${lc('activity',24,'var(--muted)')}
                <div style="margin-top:8px;font-size:var(--text-sm)">Nenhuma movimentação encontrada</div>
              </div>
            ` : `
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;min-width:580px">
                <thead><tr style="background:var(--surface2)">
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700;white-space:nowrap">Data/Hora</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Insumo</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Tipo</th>
                  <th style="padding:8px 12px;text-align:right;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Qtd</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Descrição</th>
                  <th style="padding:8px 12px;text-align:left;font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;font-weight:700">Usuário</th>
                </tr></thead>
                <tbody>
                  ${movs.slice(0,80).map((m,idx) => {
                    const t     = MOV_TIPOS[m.tipo] || MOV_TIPOS['entrada_ajuste'];
                    const isEnt = m.sinal > 0;
                    const sinal = isEnt ? '+' : '−';
                    const cor   = isEnt ? 'var(--green)' : 'var(--red)';
                    const rowBg = idx%2===0 ? 'var(--surface)' : 'var(--surface2)';
                    return `<tr style="border-top:1px solid var(--border);background:${rowBg};border-left:3px solid ${cor}">
                      <td style="padding:7px 12px;white-space:nowrap">
                        <div style="font-size:var(--text-sm);font-weight:600">${new Date(m.data).toLocaleDateString('pt-BR')}</div>
                        <div style="font-size:var(--text-2xs);color:var(--muted)">${new Date(m.data).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                      </td>
                      <td style="padding:7px 12px">
                        <div style="font-size:var(--text-sm);font-weight:600">${m.itemName}</div>
                        <div style="font-size:var(--text-2xs);color:var(--muted)">${m.itemCat}</div>
                      </td>
                      <td style="padding:7px 12px">
                        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:20px;font-size:var(--text-2xs);font-weight:600;
                          background:${t.bg};color:${t.cor};white-space:nowrap">
                          ${lc(t.icon,10,t.cor)} ${t.label}
                        </span>
                        ${m.lote ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${m.lote}</div>` : ''}
                      </td>
                      <td style="padding:7px 12px;text-align:right;white-space:nowrap">
                        <span style="font-size:var(--text-sm);font-weight:800;font-family:monospace;color:${cor}">${sinal}${fmt(m.qty)} ${m.itemUnit}</span>
                      </td>
                      <td style="padding:7px 12px;font-size:var(--text-xs);color:var(--muted);max-width:200px">
                        ${m.descricao || '—'}
                      </td>
                      <td style="padding:7px 12px;font-size:var(--text-xs);color:var(--muted);white-space:nowrap">
                        ${m.usuario}
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            ${movs.length > 80 ? `<div style="padding:8px 14px;font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-top:1px solid var(--border)">Mostrando 80 de ${movs.length} movimentações. Use filtros para refinar.</div>` : ''}`}
          </div>
        </div>

        <!-- Sidebar: resumo por insumo -->
        <div style="position:sticky;top:20px;display:flex;flex-direction:column;gap:12px">
          <div class="card" style="overflow:hidden">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)">
              <div style="font-size:var(--text-sm);font-weight:700">${lc('trending-down',13,'var(--orange-dark)')} Top consumo</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">mais saídas no período</div>
            </div>
            ${topSaidas.length === 0 ? `<div style="padding:14px;font-size:var(--text-xs);color:var(--muted);text-align:center">Sem dados</div>` :
              topSaidas.map(([nome,d],idx) => `
                <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid var(--border)">
                  <div style="width:18px;height:18px;border-radius:50%;background:${idx===0?'var(--orange-dark)':'var(--surface2)'};
                    color:${idx===0?'#fff':'var(--muted)'};font-size:var(--text-2xs);font-weight:800;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0">${idx+1}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:var(--text-xs);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
                    <div style="font-size:var(--text-2xs);color:var(--orange-dark);font-family:monospace;font-weight:700">−${fmt(d.qty)} ${d.unit}</div>
                  </div>
                </div>`).join('')}
          </div>

          <div class="card" style="overflow:hidden">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)">
              <div style="font-size:var(--text-sm);font-weight:700">${lc('upload',13,'var(--purple)')} Importações CW</div>
            </div>
            ${(() => {
              const cwMovs = _getMov().filter(m=>m.origem==='importacao_cw');
              const lotes  = [...new Set(cwMovs.map(m=>m.lote).filter(Boolean))];
              if (!lotes.length) return `<div style="padding:14px;font-size:var(--text-xs);color:var(--muted);text-align:center">Nenhuma importação</div>`;
              return lotes.slice(0,5).map(lote => {
                const ltMovs = cwMovs.filter(m=>m.lote===lote);
                const data   = ltMovs[0]?.data;
                return `<div style="padding:7px 12px;border-bottom:1px solid var(--border)">
                  <div style="font-size:var(--text-xs);font-weight:600">${lote}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${data?new Date(data).toLocaleDateString('pt-BR'):''} · ${ltMovs.length} insumos</div>
                </div>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>
    </div>`;
}

function _movSetPeriodo(p) {
  _movFiltro.periodo = p;
  _movFiltro.de = '';
  _movFiltro.ate = '';
  _renderMovimentacoes();
}

// ── Modal de movimentação manual ──────────────────────────────
function abrirModalMovManual() {
  document.getElementById('popupMovManual')?.remove();
  const insumos = items.filter(i => !i.isProd).sort((a,b)=>a.name.localeCompare(b.name));
  const popup = document.createElement('div');
  popup.id = 'popupMovManual';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div style="font-size:var(--text-md);font-weight:800">${lc('activity',15,'var(--purple)')} Registrar Movimentação</div>
        <button onclick="document.getElementById('popupMovManual').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Tipo de movimentação *</label>
          <select id="movTipo" class="inp" onchange="atualizarLabelMov()">
            ${Object.entries(MOV_TIPOS).map(([k,v]) =>
              `<option value="${k}">${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Insumo *</label>
          <select id="movItemId" class="inp">
            <option value="">Selecionar insumo...</option>
            ${insumos.map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('')}
          </select>
        </div>
        <div class="f2" style="gap:10px;display:grid;grid-template-columns:1fr 1fr">
          <div class="field" style="margin:0">
            <label id="movQtdLabel">Quantidade *</label>
            <input type="number" id="movQtd" class="inp" min="0.001" step="0.001" placeholder="0,000">
          </div>
          <div class="field" style="margin:0">
            <label>Lote / Referência</label>
            <input type="text" id="movLote" class="inp" placeholder="Ex: LC0012, NF-456...">
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>Descrição / Motivo</label>
          <input type="text" id="movDesc" class="inp" placeholder="Ex: Retirada para preparo de massas">
        </div>
        <div id="movPreview" style="background:var(--surface2);border-radius:var(--r8);padding:10px 12px;font-size:var(--text-sm);color:var(--muted);min-height:36px"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border)">
        <button class="btn btn-outline" onclick="document.getElementById('popupMovManual').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarMovManual()">Registrar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
  atualizarLabelMov();
}

function atualizarLabelMov() {
  const tipo  = document.getElementById('movTipo')?.value;
  const t     = MOV_TIPOS[tipo];
  const label = document.getElementById('movQtdLabel');
  const prev  = document.getElementById('movPreview');
  if (label && t) {
    label.textContent = `Quantidade (${t.sinal||'?'}) *`;
  }
  if (prev && t) {
    prev.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:20px;background:${t.bg};color:${t.cor};font-size:var(--text-xs);font-weight:600">${lc(t.icon,11,t.cor)} ${t.label}</span>`;
  }
}

function salvarMovManual() {
  const tipo   = document.getElementById('movTipo')?.value;
  const itemId = parseInt(document.getElementById('movItemId')?.value);
  const qty    = parseFloat(document.getElementById('movQtd')?.value);
  const desc   = document.getElementById('movDesc')?.value.trim();
  const lote   = document.getElementById('movLote')?.value.trim();

  if (!tipo)       { toast('Selecione o tipo', 'err'); return; }
  if (!itemId)     { toast('Selecione o insumo', 'err'); return; }
  if (!qty||qty<=0){ toast('Informe a quantidade', 'err'); return; }

  registrarMovimentacao(tipo, itemId, qty, desc, lote||null);
  document.getElementById('popupMovManual')?.remove();
  _renderMovimentacoes();
  toast('Movimentação registrada!');
}

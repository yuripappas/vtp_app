/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Módulo de Contagem de Estoque (reformulado)
 * Objetivo: comparar estoque físico vs digital, detectar divergências
 */

let _estFiltro   = { search: '', cat: '', status: 'all' };
let _contagem    = {}; // { itemId: qtyFisico } — contagem em andamento
let _contagemAtiva = false;

// Histórico de contagens salvo no localStorage
const _getHistContagens = () => JSON.parse(localStorage.getItem('vtp_hist_contagens') || '[]');
const _saveHistContagens = h => localStorage.setItem('vtp_hist_contagens', JSON.stringify(h));

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderEstoque() {
  const insumos = items.filter(i => !i.isProd);
  const cats    = [...new Set(insumos.map(i => i.cat))].sort();

  const catEl = document.getElementById('estCatFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }

  _renderEstKpis(insumos);
  _renderFiltrosBtns();
  _renderEstoqueTabela(insumos);
  updatePrepBadge();
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
        <div style="font-size:.82rem;color:var(--muted)">Nenhum item encontrado</div>
      </td></tr>`;
    return;
  }

  const stColors = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
  const stLabels = { crit:'CRÍTICO', warn:'BAIXO', ok:'OK' };
  const rowBg    = { crit:'#FFF1F1', warn:'#FFFBEB', ok:'var(--surface)' };

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => {
    const catRow = `
      <tr>
        <td colspan="9" style="padding:8px 16px 5px;background:var(--surface2);border-top:2px solid var(--border);border-bottom:1px solid var(--border)">
          <span style="font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">${cat}</span>
        </td>
      </tr>`;

    const itemRows = catItems.map(i => {
      const s       = gst(i);
      const pct     = i.ideal > 0 ? Math.min(100, Math.round(i.qty / i.ideal * 100)) : 0;
      const fisBg   = rowBg[s] || 'var(--surface)';
      const fisCont = _contagem[i.id]; // qty física digitada
      const temFis  = fisCont !== undefined;
      const diverg  = temFis && Math.abs(fisCont - i.qty) > 0.001;
      const divergPct = temFis && i.qty > 0 ? ((fisCont - i.qty) / i.qty * 100) : 0;
      const rowBgFinal = diverg ? '#FFF3CD' : fisBg;

      return `
        <tr id="est-row-${i.id}" style="background:${rowBgFinal};border-bottom:1px solid var(--border)">
          <!-- Nome -->
          <td style="padding:10px 14px;min-width:180px">
            <div style="font-size:.82rem;font-weight:600;color:var(--text)">${i.name}</div>
            ${i.code ? `<div style="font-size:.6rem;color:var(--muted);font-family:monospace">#${i.code}</div>` : ''}
          </td>

          <!-- Un -->
          <td class="c" style="font-size:.75rem;color:var(--muted);width:48px">${i.unit}</td>

          <!-- Digital (readonly) -->
          <td class="c" style="width:88px">
            <div style="font-size:.86rem;font-weight:700;font-family:monospace;color:var(--text)">${fmt(i.qty)}</div>
            <div style="font-size:.58rem;color:var(--muted)">digital</div>
          </td>

          <!-- Físico (editável durante contagem) -->
          <td class="c" style="width:100px">
            ${_contagemAtiva ? `
              <input type="number" value="${temFis ? fisCont : ''}" min="0" step="0.001"
                placeholder="${fmt(i.qty)}"
                style="width:76px;padding:5px 7px;border:1.5px solid ${diverg?'var(--orange-dark)':'var(--border)'};
                border-radius:var(--r6);font-size:.8rem;font-family:monospace;text-align:center;
                background:${diverg?'#FFFBEB':'var(--surface)'}"
                oninput="setFisico(${i.id}, this.value)">
            ` : `
              <div style="font-size:.78rem;color:var(--muted);font-style:italic">—</div>
            `}
          </td>

          <!-- Divergência -->
          <td class="c" style="width:100px">
            ${temFis ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:1px">
                <div style="font-size:.82rem;font-weight:700;font-family:monospace;
                  color:${diverg?'var(--orange-dark)':'var(--green)'}">
                  ${diverg ? `${fisCont > i.qty ? '+' : ''}${fmt(fisCont - i.qty)}` : '✓'}
                </div>
                ${diverg ? `<div style="font-size:.58rem;color:var(--orange-dark)">${divergPct > 0 ? '+' : ''}${divergPct.toFixed(1)}%</div>` : ''}
              </div>
            ` : '<div style="font-size:.7rem;color:var(--border2)">—</div>'}
          </td>

          <!-- Mín -->
          <td class="c" style="font-size:.74rem;color:var(--muted);width:60px">${fmt(i.min)}</td>

          <!-- Ideal -->
          <td class="c" style="font-size:.74rem;color:var(--muted);width:60px">${fmt(i.ideal)}</td>

          <!-- Barra -->
          <td style="width:120px;padding:8px 12px">
            <div style="display:flex;align-items:center;gap:7px">
              <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${stColors[s]};border-radius:3px"></div>
              </div>
              <span style="font-size:.64rem;color:${stColors[s]};font-weight:700;min-width:32px;text-align:right">${pct}%</span>
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
    const hist = _getHistContagens();
    el.innerHTML = `
      <div style="padding:16px">
        <div style="font-size:.84rem;font-weight:800;margin-bottom:4px">${lc('clipboard-list',14,'var(--purple)')} Contagem de Estoque</div>
        <div style="font-size:.7rem;color:var(--muted);margin-bottom:16px">Compare o físico com o digital</div>
        <button onclick="iniciarContagem()"
          style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);
          font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
          ${lc('play-circle',15,'#fff')} Iniciar contagem
        </button>
        ${hist.length ? `
          <button onclick="verHistoricoContagens()"
            style="width:100%;margin-top:8px;padding:8px;background:none;border:1.5px solid var(--border);
            border-radius:var(--r8);font-size:.76rem;font-weight:600;color:var(--muted);cursor:pointer;
            display:flex;align-items:center;justify-content:center;gap:6px">
            ${lc('clock',13,'currentColor')} Histórico (${hist.length})
          </button>` : ''}
      </div>`;
  } else {
    el.innerHTML = `
      <div style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:.82rem;font-weight:800;color:var(--purple)">${lc('clipboard-list',13,'var(--purple)')} Contagem ativa</div>
            <div style="font-size:.64rem;color:var(--muted);margin-top:1px">${contados}/${insumos.length} itens contados</div>
          </div>
          <button onclick="cancelarContagem()"
            style="background:none;border:1px solid var(--red);border-radius:var(--r6);padding:3px 8px;
            font-size:.64rem;color:var(--red);cursor:pointer">${lc('x',10,'currentColor')} Cancelar</button>
        </div>

        <!-- Progresso -->
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:12px">
          <div style="height:100%;width:${insumos.length > 0 ? Math.round(contados/insumos.length*100) : 0}%;background:var(--purple);border-radius:3px;transition:width .3s"></div>
        </div>

        <!-- Resumo divergências -->
        ${divergs.length > 0 ? `
          <div style="background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);padding:10px;margin-bottom:12px">
            <div style="font-size:.72rem;font-weight:700;color:var(--orange-dark);margin-bottom:6px">
              ${lc('alert-triangle',12,'var(--orange-dark)')} ${divergs.length} divergência(s)
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto">
              ${divergs.slice(0,6).map(i => {
                const f = _contagem[i.id];
                const d = f - i.qty;
                return `<div style="display:flex;justify-content:space-between;font-size:.68rem">
                  <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">${i.name}</span>
                  <span style="font-family:monospace;font-weight:700;color:${d>0?'var(--green)':'var(--red)'};flex-shrink:0">
                    ${d>0?'+':''}${fmt(d)} ${i.unit}
                  </span>
                </div>`;
              }).join('')}
              ${divergs.length > 6 ? `<div style="font-size:.62rem;color:var(--muted)">+${divergs.length-6} mais...</div>` : ''}
            </div>
          </div>
        ` : contados > 0 ? `
          <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:8px;margin-bottom:12px;font-size:.72rem;color:var(--green);font-weight:600;text-align:center">
            ${lc('check-circle',12,'currentColor')} Sem divergências até agora!
          </div>
        ` : ''}

        <button onclick="concluirContagem()"
          style="width:100%;padding:10px;background:var(--green);color:#fff;border:none;border-radius:var(--r8);
          font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:6px">
          ${lc('check-circle',15,'#fff')} Concluir contagem
        </button>
        <div style="font-size:.62rem;color:var(--muted);text-align:center">O digital não será alterado</div>
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

function iniciarContagem() {
  _contagem = {};
  _contagemAtiva = true;
  renderEstoque();
  toast('Contagem iniciada! Digite as quantidades físicas.', 'ok');
}

function cancelarContagem() {
  if (!confirm('Cancelar a contagem? Os dados não serão salvos.')) return;
  _contagem = {};
  _contagemAtiva = false;
  renderEstoque();
}

function concluirContagem() {
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
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px">${hist.length} contagem(ns) registrada(s)</div>
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
                  <div style="font-size:.88rem;font-weight:800">${c.id}</div>
                  <div style="font-size:.68rem;color:var(--muted)">${fmtDT(c.date)} · por <strong>${c.user}</strong></div>
                </div>
                <div style="display:flex;gap:10px;align-items:center">
                  <div style="text-align:center;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
                    <div style="font-size:.86rem;font-weight:800;color:var(--purple)">${c.total}</div>
                    <div style="font-size:.56rem;color:var(--muted);text-transform:uppercase">Contados</div>
                  </div>
                  <div style="text-align:center;padding:4px 10px;background:${divItems.length>0?'var(--yellow-light)':'var(--green-light)'};border:1px solid ${divItems.length>0?'var(--yellow)':'var(--green)'};border-radius:var(--r6)">
                    <div style="font-size:.86rem;font-weight:800;color:${divItems.length>0?'var(--orange-dark)':'var(--green)'}">${divItems.length}</div>
                    <div style="font-size:.56rem;color:var(--muted);text-transform:uppercase">Divergências</div>
                  </div>
                  <button onclick="abrirDetalheContagem('${c.id}')"
                    style="padding:5px 12px;border:1.5px solid var(--purple);border-radius:var(--r6);
                    background:var(--surface);color:var(--purple);font-size:.72rem;font-weight:600;cursor:pointer">
                    ${lc('search',12,'currentColor')} Detalhar
                  </button>
                </div>
              </div>
              ${divItems.length > 0 ? `
                <div style="padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px">
                  ${divItems.slice(0,6).map(x => `
                    <span style="font-size:.66rem;padding:2px 7px;border-radius:20px;
                      background:${x.diverg<0?'var(--red-light)':'var(--green-light)'};
                      color:${x.diverg<0?'var(--red)':'var(--green)'};border:1px solid ${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.name}: ${x.diverg>0?'+':''}${fmt(x.diverg)}
                    </span>`).join('')}
                  ${divItems.length > 6 ? `<span style="font-size:.62rem;color:var(--muted)">+${divItems.length-6} mais</span>` : ''}
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
          <div style="font-size:.96rem;font-weight:800">${c.id} — Detalhe</div>
          <div style="font-size:.72rem;color:var(--muted)">${fmtDT(c.date)} · ${c.user}</div>
        </div>
        <button onclick="document.getElementById('popupDetalheContagem').remove()"
          style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px 22px">
        ${divItems.length > 0 ? `
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--orange-dark);margin-bottom:8px">
            ${lc('alert-triangle',12,'var(--orange-dark)')} Divergências (${divItems.length})
          </div>
          <div style="border:1px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:16px">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:var(--surface2)">
                <th style="padding:7px 12px;text-align:left;font-size:.64rem;color:var(--muted);text-transform:uppercase">Item</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase">Digital</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase">Físico</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase">Diferença</th>
                <th style="padding:7px 12px;text-align:center;font-size:.64rem;color:var(--muted);text-transform:uppercase">Var %</th>
              </tr></thead>
              <tbody>
                ${divItems.map((x,idx) => {
                  const pctDiv = x.digital > 0 ? ((x.diverg/x.digital)*100).toFixed(1) : '—';
                  return `<tr style="border-top:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
                    <td style="padding:7px 12px">
                      <div style="font-size:.78rem;font-weight:600">${x.name}</div>
                      <div style="font-size:.62rem;color:var(--muted)">${x.cat}</div>
                    </td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:.78rem">${fmt(x.digital)} ${x.unit}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:.78rem">${fmt(x.fisico)} ${x.unit}</td>
                    <td style="padding:7px 12px;text-align:center;font-family:monospace;font-size:.82rem;font-weight:700;color:${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.diverg>0?'+':''}${fmt(x.diverg)}
                    </td>
                    <td style="padding:7px 12px;text-align:center;font-size:.76rem;font-weight:600;color:${x.diverg<0?'var(--red)':'var(--green)'}">
                      ${x.diverg>0?'+':''}${pctDiv}%
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : `
          <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r8);padding:12px;text-align:center;margin-bottom:16px;font-size:.8rem;font-weight:600;color:var(--green)">
            ${lc('check-circle',14,'currentColor')} Nenhuma divergência nesta contagem!
          </div>`}

        ${okItems.length > 0 ? `
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--green);margin-bottom:8px">
            ${lc('check-circle',12,'var(--green)')} OK (${okItems.length})
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${okItems.map(x => `
              <span style="font-size:.64rem;padding:2px 7px;border-radius:20px;background:var(--green-light);color:var(--green);border:1px solid var(--green)">
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
        <div style="background:var(--red-light);border:1px solid #FCA5A5;border-radius:var(--r8);padding:12px;font-size:.78rem;color:var(--red)">
          ${lc('alert-circle',14,'var(--red)')} Nenhum item encontrado. Verifique os códigos internos em Cadastros.
        </div>
        ${naoEncontrados.length ? `<div style="font-size:.7rem;color:var(--muted);margin-top:8px">${naoEncontrados.length} no CSV: ${naoEncontrados.slice(0,5).join(', ')}...</div>` : ''}`;
      return;
    }

    prev.innerHTML = `
      <div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:10px;margin-bottom:10px;font-size:.76rem;color:var(--green);font-weight:600">
        ${lc('check-circle',13,'currentColor')} ${importData.length} itens reconhecidos — estoque digital será atualizado
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
        ${importData.map(d => `
          <div style="padding:7px 11px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
            <div style="font-size:.76rem;font-weight:600;margin-bottom:2px">${d.name}</div>
            <div style="display:flex;gap:12px;font-family:monospace;font-size:.7rem;color:var(--muted)">
              <span>Digital: <strong>${d.oldQty}</strong> → <strong style="color:var(--purple)">${d.newQty}</strong></span>
              ${Math.abs(d.newMin - d.oldMin) > 0.001 ? `<span>Mín: ${d.oldMin}→${d.newMin}</span>` : ''}
              ${d.newCost !== d.oldCost && d.newCost > 0 ? `<span style="color:var(--green)">Custo: R$${d.newCost}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
      ${naoEncontrados.length ? `
        <div style="font-size:.68rem;color:var(--muted);background:var(--surface2);border-radius:var(--r6);padding:7px 10px;margin-bottom:10px">
          Não encontrados (${naoEncontrados.length}): ${naoEncontrados.slice(0,8).join(', ')}${naoEncontrados.length>8?'...':''}
        </div>` : ''}
      <button class="btn btn-primary" style="width:100%" onclick="confirmImport()">
        ${lc('check',14,'#fff')} Confirmar — atualizar digital
      </button>`;
  };
  reader.readAsText(file, 'UTF-8');
}

function confirmImport() {
  importData.forEach(d => {
    const item = items.find(i => i.id === d.id);
    if (!item) return;
    item.qty  = d.newQty;
    if (d.newMin !== undefined) item.min  = d.newMin;
    if (d.newCost > 0)          item.cost = d.newCost;
  });
  saveI();
  closeModal('ovImport');
  toast(`${importData.length} itens atualizados (digital)!`, 'ok');
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

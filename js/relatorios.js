/**
 * VTP Compras — Vai Ter Pizza!
 * relatorios.js — Módulo de Relatórios & BI
 */

// ══════════════════════════════════════════════════════════════
// ESTADO
// ══════════════════════════════════════════════════════════════

if (!window._relPer) window._relPer = { tipo: '30d', de: '', ate: '' };
if (!window._relTab) window._relTab = 'visao';

// ══════════════════════════════════════════════════════════════
// HELPERS DE PERÍODO
// ══════════════════════════════════════════════════════════════

function _relGetPer() {
  const { tipo, de, ate } = window._relPer;
  const now  = new Date();
  const padF = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const ago  = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

  if (tipo === 'hoje')   return { de: padF(now),    ate: padF(now),                           label: 'Hoje' };
  if (tipo === '7d')     return { de: padF(ago(6)),  ate: padF(now),                           label: 'Últimos 7 dias' };
  if (tipo === '30d')    return { de: padF(ago(29)), ate: padF(now),                           label: 'Últimos 30 dias' };
  if (tipo === '90d')    return { de: padF(ago(89)), ate: padF(now),                           label: 'Últimos 90 dias' };
  if (tipo === 'mes')    { const d = new Date(now.getFullYear(), now.getMonth(), 1);
                           return { de: padF(d), ate: padF(now), label: 'Este mês' }; }
  if (tipo === 'mesant') { const d1 = new Date(now.getFullYear(), now.getMonth()-1, 1);
                           const d2 = new Date(now.getFullYear(), now.getMonth(), 0);
                           return { de: padF(d1), ate: padF(d2), label: 'Mês anterior' }; }
  if (tipo === 'custom') return { de: de||padF(now), ate: ate||padF(now), label: `${_fmtDrel(de)} até ${_fmtDrel(ate)}` };
  return { de: '2020-01-01', ate: '2099-12-31', label: 'Todo o período' };
}

function _fmtDrel(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function _relIn(dateStr) {
  if (!dateStr) return false;
  const d = dateStr.slice(0,10);
  const p = _relGetPer();
  return d >= p.de && d <= p.ate;
}

function _relFiltrar(arr, field) {
  return arr.filter(x => _relIn(x[field] || ''));
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE UI
// ══════════════════════════════════════════════════════════════

function _relKpiCard(icon, label, val, cor, bg, sub) {
  return `<div style="background:${bg};border:1.5px solid ${cor}33;border-radius:var(--r10);padding:14px 16px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      ${lc(icon,12,cor)}
      <span style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${cor}">${label}</span>
    </div>
    <div style="font-size:1.15rem;font-weight:800;color:${cor};font-family:monospace;line-height:1">${val}</div>
    ${sub?`<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;line-height:1.4">${sub}</div>`:''}
  </div>`;
}

function _relKpiGrid(cards) {
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:24px">${cards.join('')}</div>`;
}

function _relSecao(titulo, corpo, opts={}) {
  return `<div class="card" style="margin-bottom:16px${opts.noMb?';margin-bottom:0':''}">
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div class="card-title" style="font-size:var(--text-sm)">${titulo}</div>
      ${opts.right||''}
    </div>
    <div style="padding:4px 20px 16px">${corpo}</div>
  </div>`;
}

function _relVazio(msg) {
  return `<div style="text-align:center;padding:32px 20px;color:var(--muted)">
    ${lc('inbox',28,'var(--border)')}
    <div style="margin-top:8px;font-size:var(--text-sm);font-weight:600">${msg}</div>
  </div>`;
}

function _relBar(label, val, maxVal, cor, fmtFn) {
  const pct = maxVal > 0 ? Math.min(100, Math.round(val/maxVal*100)) : 0;
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <div style="font-size:var(--text-xs);color:var(--text2);width:120px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${label}</div>
    <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
      <div data-pf style="height:100%;width:${pct}%;background:${cor};border-radius:4px"></div>
    </div>
    <div style="font-size:var(--text-xs);font-family:monospace;font-weight:700;color:var(--text);width:80px;text-align:right;flex-shrink:0">${fmtFn(val)}</div>
  </div>`;
}

function _relBars(dados, cor, fmtFn) {
  if (!dados.length) return _relVazio('Sem dados no período');
  const max = Math.max(...dados.map(d => d[1]));
  return dados.map(([label, val]) => _relBar(label, val, max, cor, fmtFn)).join('');
}

function _relInsightBox(icon, cor, bg, txt) {
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${bg};border-left:3px solid ${cor};border-radius:0 var(--r8) var(--r8) 0;margin-bottom:6px">
    <span style="flex-shrink:0;margin-top:1px">${lc(icon,14,cor)}</span>
    <span style="font-size:var(--text-sm);color:var(--text);line-height:1.5">${txt}</span>
  </div>`;
}

function _relTabela(headers, rows, vazio) {
  if (!rows.length) return _relVazio(vazio||'Sem dados');
  return `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm)">
      <thead><tr>${headers.map(h=>`<th style="text-align:left;padding:7px 10px;border-bottom:2px solid var(--border);color:var(--text2);font-weight:700;font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r,i)=>`<tr style="background:${i%2===0?'transparent':'var(--surface2)'}40">${r.map(c=>`<td style="padding:7px 10px;border-bottom:1px solid var(--border)22;color:var(--text)">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function _relStatusBadge(status) {
  const map = {
    pendente:    ['var(--yellow)',     'var(--yellow-light)',  'Pendente'],
    concluida:   ['var(--green)',      'var(--green-light)',   'Concluída'],
    concluido:   ['var(--green)',      'var(--green-light)',   'Concluído'],
    cancelada:   ['var(--red)',        'var(--red-light)',     'Cancelada'],
    em_andamento:['var(--purple)',     'var(--purple-xlight)', 'Em andamento'],
    atrasado:    ['var(--red)',        'var(--red-light)',     'Atrasado'],
  };
  const [cor, bg, label] = map[status] || ['var(--muted)', 'var(--surface2)', status];
  return `<span style="font-size:var(--text-xs);font-weight:700;padding:2px 8px;border-radius:10px;background:${bg};color:${cor}">${label}</span>`;
}

// ══════════════════════════════════════════════════════════════
// MAPA DE COMPRAS — HELPERS
// ══════════════════════════════════════════════════════════════

function _relMapaInitSemana() {
  const today = new Date();
  const dow = today.getDay() || 7;
  const mon = new Date(today); mon.setDate(today.getDate() - dow + 1);
  window._relMapaLun = mon.toISOString().slice(0,10);
}

function _relComprasNavMapa(delta) {
  if (!window._relMapaLun) _relMapaInitSemana();
  const d = new Date(window._relMapaLun + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  window._relMapaLun = d.toISOString().slice(0,10);
  renderRelatorios();
}

function _relCalcPayDate(cot) {
  if (!cot?.dataEntrega) return null;
  const d = new Date(cot.dataEntrega + 'T00:00:00');
  if (cot.formaPagamento === 'boleto' && cot.boletoDias > 0) {
    d.setDate(d.getDate() + cot.boletoDias);
  } else if (cot.formaPagamento === 'parcelado') {
    d.setDate(d.getDate() + 30);
  }
  return d.toISOString().slice(0,10);
}

function _relMapaComprasSemana() {
  if (!window._relMapaLun) _relMapaInitSemana();

  const lun  = new Date(window._relMapaLun + 'T00:00:00');
  const DLBL = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(lun); d.setDate(lun.getDate() + i);
    return d.toISOString().slice(0,10);
  });
  const today = new Date().toISOString().slice(0,10);

  const fmtShort = iso => {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const weekLabel = `${fmtShort(days[0])} – ${fmtShort(days[6])}`;

  const ev = {};
  days.forEach(d => { ev[d] = { entregas: [], pagamentos: [] }; });

  const STATUS_COM_COTA = ['cotacao','cotacao_encerrada','aguard_aprovacao','aprovada','ordem_criada','recebimento','concluida'];
  listas.filter(l => STATUS_COM_COTA.includes(l.status)).forEach(lista => {
    lista.itens?.forEach(item => {
      if (!item.fornecedorId) return;
      const cot = item.cotacoes?.find(c => c.supId === item.fornecedorId);
      if (!cot) return;
      const sup    = suppliers.find(s => s.id === item.fornecedorId);
      const sNome  = sup?.name || '—';
      const valor  = (item.precoUnitFinal || cot.precoUnit || 0) * (item.qtdComprada || item.qtdSugerida || 0);

      if (cot.dataEntrega && ev[cot.dataEntrega]) {
        ev[cot.dataEntrega].entregas.push({ nome: item.nome, valor, sNome, codigo: lista.codigo });
      }
      const payDate = _relCalcPayDate(cot);
      if (payDate && ev[payDate]) {
        ev[payDate].pagamentos.push({ nome: item.nome, valor, sNome, forma: cot.formaPagamento, codigo: lista.codigo });
      }
    });
  });

  const totEntSem = days.reduce((s,d) => s + ev[d].entregas.reduce((ss,e)=>ss+e.valor,0), 0);
  const totPagSem = days.reduce((s,d) => s + ev[d].pagamentos.reduce((ss,p)=>ss+p.valor,0), 0);

  const dayCell = (iso, idx) => {
    const d     = new Date(iso + 'T00:00:00');
    const dd    = d.getDate();
    const isTod = iso === today;
    const isDom = idx === 6;
    const ents  = ev[iso].entregas;
    const pags  = ev[iso].pagamentos;
    const totE  = ents.reduce((s,e)=>s+e.valor,0);
    const totP  = pags.reduce((s,p)=>s+p.valor,0);
    const empty = !ents.length && !pags.length;

    const groupBySupNome = arr => {
      const m = {};
      arr.forEach(x => { m[x.sNome] = (m[x.sNome]||0) + x.valor; });
      return Object.entries(m).sort((a,b)=>b[1]-a[1]);
    };

    let h = `<div style="min-height:130px;border-right:${idx<6?'1px solid var(--border)':'none'};padding:8px 7px;background:${isDom?'rgba(220,38,38,.02)':isTod?'rgba(107,33,212,.03)':''}">`;

    h += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">
      <span style="font-size:var(--text-2xs);font-weight:700;color:${isDom?'var(--red)':'var(--muted)'};text-transform:uppercase">${DLBL[idx]}</span>
      <span style="font-size:var(--text-md);font-weight:${isTod?'900':'600'};color:${isTod?'var(--purple)':isDom?'var(--red)':'var(--text)'};
        ${isTod?'background:var(--purple-xlight);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:var(--text-sm);':''}">${dd}</span>
      ${isTod?`<span style="font-size:var(--text-2xs);background:var(--purple);color:#fff;border-radius:3px;padding:1px 4px;font-weight:700">HOJE</span>`:''}
    </div>`;

    if (empty) {
      h += `<div style="text-align:center;padding:10px 0;color:var(--border);font-size:var(--text-xs)">—</div>`;
    } else {
      if (ents.length) {
        const grp = groupBySupNome(ents);
        h += `<div style="margin-bottom:5px">
          <div style="display:flex;align-items:center;gap:3px;font-size:var(--text-2xs);font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px">
            ${lc('truck',9,'currentColor')} Entregas
          </div>
          ${grp.slice(0,3).map(([sn]) => `<div style="font-size:var(--text-2xs);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sn}">${sn}</div>`).join('')}
          ${grp.length > 3 ? `<div style="font-size:var(--text-2xs);color:var(--muted)">+${grp.length-3} mais</div>` : ''}
          <div style="font-size:var(--text-xs);font-weight:800;color:var(--green);font-family:monospace;margin-top:3px">R$${fmt(totE)}</div>
        </div>`;
      }
      if (pags.length) {
        const grp = groupBySupNome(pags);
        h += `<div style="${ents.length?'border-top:1px dashed var(--border);padding-top:5px;margin-top:2px':''}">
          <div style="display:flex;align-items:center;gap:3px;font-size:var(--text-2xs);font-weight:700;color:var(--orange-dark);text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px">
            ${lc('credit-card',9,'currentColor')} Pagamentos
          </div>
          ${grp.slice(0,3).map(([sn]) => `<div style="font-size:var(--text-2xs);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sn}">${sn}</div>`).join('')}
          ${grp.length > 3 ? `<div style="font-size:var(--text-2xs);color:var(--muted)">+${grp.length-3} mais</div>` : ''}
          <div style="font-size:var(--text-xs);font-weight:800;color:var(--orange-dark);font-family:monospace;margin-top:3px">R$${fmt(totP)}</div>
        </div>`;
      }
    }

    h += `</div>`;
    return h;
  };

  return `<div class="card" style="margin-bottom:20px">
    <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div class="card-title">${lc('calendar',13,'var(--purple)')} Mapa de Entregas e Pagamentos</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${totEntSem > 0 ? `<span style="font-size:var(--text-xs);font-weight:700;color:var(--green);display:flex;align-items:center;gap:4px">${lc('truck',11,'currentColor')} R$${fmt(totEntSem)}</span>` : ''}
        ${totPagSem > 0 ? `<span style="font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);display:flex;align-items:center;gap:4px">${lc('credit-card',11,'currentColor')} R$${fmt(totPagSem)}</span>` : ''}
        <div style="width:1px;height:14px;background:var(--border)"></div>
        <button onclick="_relComprasNavMapa(-1)" class="btn btn-ghost" style="padding:4px 8px">${lc('chevron-left',13,'currentColor')}</button>
        <span style="font-size:var(--text-xs);font-weight:600;min-width:110px;text-align:center">${weekLabel}</span>
        <button onclick="_relComprasNavMapa(1)" class="btn btn-ghost" style="padding:4px 8px">${lc('chevron-right',13,'currentColor')}</button>
        <button onclick="window._relMapaLun=null;renderRelatorios()" class="btn btn-ghost" style="padding:4px 10px;font-size:var(--text-xs);color:var(--purple)">Semana atual</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid var(--border)">
      ${days.map((iso, i) => dayCell(iso, i)).join('')}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// CONTROLE DE PERÍODO
// ══════════════════════════════════════════════════════════════

function _relPeriodoBar() {
  const tipos = [
    { id:'hoje',   label:'Hoje'      },
    { id:'7d',     label:'7 dias'    },
    { id:'30d',    label:'30 dias'   },
    { id:'90d',    label:'90 dias'   },
    { id:'mes',    label:'Este mês'  },
    { id:'mesant', label:'Mês ant.'  },
    { id:'custom', label:'Período'   },
  ];
  const per = window._relPer;
  const isCustom = per.tipo === 'custom';

  return `<div class="rel-no-print" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 24px;border-bottom:1.5px solid var(--border);background:var(--surface);position:sticky;top:0;z-index:10">
    <span style="font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Período:</span>
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      ${tipos.map(t => {
        const active = per.tipo === t.id;
        return `<button onclick="_relSetPeriodo('${t.id}')" style="padding:4px 10px;border-radius:var(--r8);border:1.5px solid ${active?'var(--purple)':'var(--border)'};background:${active?'var(--purple)':'var(--surface)'};color:${active?'#fff':'var(--text2)'};font-size:var(--text-xs);font-weight:${active?'700':'500'};cursor:pointer;font-family:Inter,sans-serif">${t.label}</button>`;
      }).join('')}
    </div>
    ${isCustom ? `
      <div style="display:flex;align-items:center;gap:6px">
        <input type="date" value="${per.de}" onchange="_relCustomDate('de',this.value)" class="inp" style="padding:4px 8px;font-size:var(--text-xs);width:140px">
        <span style="font-size:var(--text-xs);color:var(--text2)">até</span>
        <input type="date" value="${per.ate}" onchange="_relCustomDate('ate',this.value)" class="inp" style="padding:4px 8px;font-size:var(--text-xs);width:140px">
      </div>` : ''}
    <div style="flex:1;text-align:right">
      <button onclick="_relImprimir()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:var(--r8);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:var(--text-sm);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
        ${lc('printer',14,'currentColor')} Imprimir / PDF
      </button>
    </div>
  </div>`;
}

function _relSetPeriodo(tipo) {
  window._relPer.tipo = tipo;
  renderRelatorios();
}

function _relCustomDate(campo, val) {
  window._relPer[campo] = val;
  if (window._relPer.de && window._relPer.ate) renderRelatorios();
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════

function renderRelatorios() {
  const el = document.getElementById('page-relatorios');
  if (!el) return;

  const per = _relGetPer();

  const tabs = [
    { id:'visao',       label:'Visão Geral',      icon:'layout-dashboard' },
    { id:'compras',     label:'Compras',           icon:'shopping-bag'     },
    { id:'estoque',     label:'Estoque',           icon:'package'          },
    { id:'desperdicio', label:'Desperdício',        icon:'trash-2'          },
    { id:'producao',    label:'Produção',           icon:'chef-hat'         },
    { id:'manutencao',  label:'Manutenção',         icon:'wrench'           },
    { id:'operacional', label:'Operacional',        icon:'activity'         },
    { id:'precos',      label:'Variação de Preços', icon:'trending-up'      },
    { id:'auditoria',   label:'Auditoria',          icon:'shield-check'     },
  ];

  el.innerHTML = `
    <div class="rel-print-header" style="display:none;padding:16px 24px 0;border-bottom:2px solid #000;margin-bottom:16px">
      <div style="font-size:1.1rem;font-weight:800">Vai Ter Pizza! — Relatório</div>
      <div style="font-size:var(--text-sm);color:#666">${tabs.find(t=>t.id===window._relTab)?.label || ''} · ${per.label}</div>
    </div>
    ${_relPeriodoBar()}
    <div class="rel-no-print" style="display:flex;border-bottom:1.5px solid var(--border);background:var(--surface);overflow-x:auto">
      ${tabs.map(t => {
        const active = window._relTab === t.id;
        return `<button onclick="window._relTab='${t.id}';renderRelatorios()"
          style="display:flex;align-items:center;gap:5px;padding:10px 14px;border:none;border-bottom:2.5px solid ${active?'var(--purple)':'transparent'};
          background:none;color:${active?'var(--purple)':'var(--muted)'};font-size:var(--text-sm);font-weight:${active?'700':'500'};
          cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap;flex-shrink:0">
          ${lc(t.icon,12,'currentColor')} ${t.label}
        </button>`;
      }).join('')}
    </div>
    <div id="relConteudo" style="padding:20px 24px 32px"></div>`;

  const tabEl = document.getElementById('relConteudo');
  if (!tabEl) return;

  if      (window._relTab === 'visao')       _relVisaoGeral(tabEl, per);
  else if (window._relTab === 'compras')     _relCompras(tabEl, per);
  else if (window._relTab === 'estoque')     _relEstoque(tabEl, per);
  else if (window._relTab === 'desperdicio') _relDesperdicio(tabEl, per);
  else if (window._relTab === 'producao')    _relProducao(tabEl, per);
  else if (window._relTab === 'operacional') _relOperacional(tabEl, per);
  else if (window._relTab === 'manutencao')  _relManutencao(tabEl, per);
  else if (window._relTab === 'precos')      _relPrecos(tabEl, per);
  else if (window._relTab === 'auditoria')   _relAuditoria(tabEl, per);
}

// ══════════════════════════════════════════════════════════════
// TAB: VISÃO GERAL
// ══════════════════════════════════════════════════════════════

function _relVisaoGeral(el, per) {
  const despFilt   = _relFiltrar(typeof desperdicios !== 'undefined' ? desperdicios : [], 'date');
  const listasConc = _relFiltrar(listas.filter(l => l.status === 'concluida'), 'dataConclusao');
  const ordsFilt   = _relFiltrar(ordens.filter(o => !o.archived), 'date');
  const criticos   = items.filter(i => !i.isProd && gst(i) === 'crit');
  const emAlerta   = items.filter(i => !i.isProd && gst(i) === 'warn');

  const totalCompras = listasConc.reduce((s,l) => s + (l.valorFinal||0), 0);
  const totalEcon    = listasConc.reduce((s,l) => s + Math.max(0,(l.valorEstimado||0)-(l.valorFinal||0)), 0);
  const totalDesp    = despFilt.reduce((s,d) => s + (d.custo||0), 0);
  const totalOrdens  = ordsFilt.length;
  const pctEcon      = totalCompras > 0 ? Math.round(totalEcon/totalCompras*100) : 0;

  const ckSessoes   = typeof _getCkSessoes === 'function' ? _getCkSessoes() : [];
  const ckFilt      = _relFiltrar(ckSessoes, 'data');
  const ckConc      = ckFilt.filter(s => s.status === 'concluida').length;
  const ckPct       = ckFilt.length > 0 ? Math.round(ckConc/ckFilt.length*100) : null;

  // ── Cruzamento: compras vs desperdício por insumo
  const dNomes = {};
  despFilt.forEach(d => { dNomes[d.nome] = (dNomes[d.nome]||0) + (d.custo||0); });
  const dNomesOrdenado = Object.entries(dNomes).sort((a,b) => b[1]-a[1]).slice(0,3);

  // ── Gastos por categoria
  const gastoCat = {};
  listasConc.forEach(l => l.itens?.forEach(i => {
    if (i.precoUnitFinal && i.qtdComprada != null) {
      const cat = i.categoria || 'Sem categoria';
      gastoCat[cat] = (gastoCat[cat]||0) + (i.precoUnitFinal * i.qtdComprada);
    }
  }));
  const gastoCatArr = Object.entries(gastoCat).sort((a,b)=>b[1]-a[1]);

  // ── Insights automáticos
  const insights = [];
  if (criticos.length > 0) insights.push(['alert-circle','var(--red)','var(--red-light)',
    `${criticos.length} insumo(s) em nível crítico — considere incluir na próxima lista de compras`]);
  if (totalDesp > 0 && totalCompras > 0) {
    const pctDesp = Math.round(totalDesp/totalCompras*100);
    if (pctDesp > 5) insights.push(['trending-up','var(--orange-dark)','var(--orange-light)',
      `Desperdício representa ${pctDesp}% do valor comprado no período (R$${fmt(totalDesp)} vs R$${fmt(totalCompras)})`]);
  }
  if (totalEcon > 100) insights.push(['trending-down','var(--green)','var(--green-light)',
    `Economia de R$${fmt(totalEcon)} (${pctEcon}%) nas cotações — abaixo da estimativa inicial`]);
  if (dNomesOrdenado.length > 0) insights.push(['trash-2','var(--yellow)','var(--yellow-light)',
    `Top desperdício: ${dNomesOrdenado.map(([n,v])=>`${n} (R$${fmt(v)})`).join(', ')}`]);
  const ordPend = ordens.filter(o=>!o.archived&&o.status==='pendente');
  if (ordPend.length > 3) insights.push(['clock','var(--purple)','var(--purple-xlight)',
    `${ordPend.length} ordens de produção pendentes no pré-preparo`]);

  el.innerHTML = `
    ${_relKpiGrid([
      _relKpiCard('shopping-bag','Compras no período', `R$${fmt(totalCompras)}`, 'var(--purple)','var(--purple-xlight)', `${listasConc.length} lista(s) concluída(s)`),
      _relKpiCard('trending-down','Economia gerada', `R$${fmt(totalEcon)}`, 'var(--green)','var(--green-light)', `${pctEcon}% abaixo da estimativa`),
      _relKpiCard('trash-2','Custo de desperdício', `R$${fmt(totalDesp)}`, 'var(--red)','var(--red-light)', `${despFilt.length} registro(s)`),
      _relKpiCard('alert-circle','Insumos críticos', criticos.length, 'var(--red)','var(--red-light)', `${emAlerta.length} em alerta`),
      _relKpiCard('chef-hat','Ordens de produção', totalOrdens, 'var(--orange-dark)','var(--orange-light)', `${ordsFilt.filter(o=>o.status==='pendente').length} pendente(s)`),
      ckPct !== null
        ? _relKpiCard('check-square','Compliance checklist', `${ckPct}%`, 'var(--green)','var(--green-light)', `${ckConc}/${ckFilt.length} sessões`)
        : _relKpiCard('check-square','Compliance checklist', '—', 'var(--muted)','var(--surface2)', 'Sem dados no período'),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('zap',13,'var(--purple)')} Insights Automáticos`,
        insights.length > 0
          ? insights.map(([ic,cor,bg,txt]) => _relInsightBox(ic,cor,bg,txt)).join('')
          : _relVazio('Tudo dentro do esperado no período'), {noMb:true})}
      ${_relSecao(`${lc('tag',13,'var(--purple)')} Gastos por Categoria`,
        gastoCatArr.length > 0
          ? _relBars(gastoCatArr,'var(--purple)',v=>`R$${fmt(v)}`)
          : _relVazio('Sem compras concluídas no período'), {noMb:true})}
    </div>

    ${_relSecao(`${lc('bar-chart-2',13,'var(--purple)')} Resumo Financeiro do Período`,
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:8px 0">
        <div style="text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:var(--purple);font-family:monospace">R$${fmt(totalCompras)}</div>
          <div style="font-size:var(--text-xs);color:var(--text2);margin-top:2px">Total comprado</div>
        </div>
        <div style="text-align:center;border-left:1.5px solid var(--border);border-right:1.5px solid var(--border)">
          <div style="font-size:1.4rem;font-weight:800;color:var(--red);font-family:monospace">R$${fmt(totalDesp)}</div>
          <div style="font-size:var(--text-xs);color:var(--text2);margin-top:2px">Desperdiçado</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:var(--green);font-family:monospace">R$${fmt(totalEcon)}</div>
          <div style="font-size:var(--text-xs);color:var(--text2);margin-top:2px">Economia em cotações</div>
        </div>
      </div>`)}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: COMPRAS
// ══════════════════════════════════════════════════════════════

function _relCompras(el, per) {
  const listasConc = _relFiltrar(listas.filter(l => l.status === 'concluida'), 'dataConclusao');
  const todasListas = _relFiltrar(listas, 'dataCriacao');

  const totalGasto   = listasConc.reduce((s,l) => s + (l.valorFinal||0), 0);
  const totalEstim   = listasConc.reduce((s,l) => s + (l.valorEstimado||0), 0);
  const economia     = Math.max(0, totalEstim - totalGasto);
  const pctEcon      = totalEstim > 0 ? Math.round(economia/totalEstim*100) : 0;
  const ticketMedio  = listasConc.length > 0 ? totalGasto/listasConc.length : 0;

  // Gastos por categoria
  const catMap = {};
  listasConc.forEach(l => l.itens?.forEach(i => {
    if (i.qtdComprada != null && i.precoUnitFinal) {
      const cat = i.categoria || 'Sem categoria';
      catMap[cat] = (catMap[cat]||0) + i.precoUnitFinal*i.qtdComprada;
    }
  }));

  // Ranking fornecedores
  const supMap = {};
  listasConc.forEach(l => l.itens?.forEach(i => {
    if (i.qtdComprada != null && i.precoUnitFinal && i.fornecedorId) {
      const sup = suppliers.find(s => s.id === i.fornecedorId);
      const nome = sup?.name || `Forn. #${i.fornecedorId}`;
      supMap[nome] = (supMap[nome]||0) + i.precoUnitFinal*i.qtdComprada;
    }
  }));

  // Itens mais caros no período
  const itensMapa = {};
  listasConc.forEach(l => l.itens?.forEach(i => {
    if (i.qtdComprada != null && i.precoUnitFinal) {
      const key = i.nome;
      if (!itensMapa[key] || i.precoUnitFinal > itensMapa[key].preco)
        itensMapa[key] = { preco: i.precoUnitFinal, unit: i.unidade, nome: i.nome, cat: i.categoria||'' };
    }
  }));

  // Taxa de aprovação
  let totItens = 0, aprov = 0;
  todasListas.forEach(l => l.itens?.forEach(i => {
    if (i.aprovado !== null && i.aprovado !== undefined) {
      totItens++;
      if (i.aprovado) aprov++;
    }
  }));
  const taxaAprov = totItens > 0 ? Math.round(aprov/totItens*100) : null;

  // Tempo médio de ciclo
  const ciclos = listasConc.filter(l => l.dataCriacao && l.dataConclusao).map(l => {
    const dias = Math.round((new Date(l.dataConclusao) - new Date(l.dataCriacao)) / 86400000);
    return dias;
  });
  const tempoMedio = ciclos.length > 0 ? Math.round(ciclos.reduce((s,v)=>s+v,0)/ciclos.length) : null;

  // Cruzamento: compras vs desperdício
  const despFilt = _relFiltrar(typeof desperdicios !== 'undefined' ? desperdicios : [], 'date');
  const dMap = {};
  despFilt.forEach(d => { dMap[d.nome] = (dMap[d.nome]||0)+(d.custo||0); });
  const crossDesp = Object.entries(itensMapa)
    .filter(([nome]) => dMap[nome])
    .map(([nome, info]) => ({ nome, valorComprado: info.preco, custo: dMap[nome] }))
    .sort((a,b) => b.custo-a.custo).slice(0,5);

  const catArr = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const supArr = Object.entries(supMap).sort((a,b)=>b[1]-a[1]);

  el.innerHTML = `
    ${_relMapaComprasSemana()}
    ${_relKpiGrid([
      _relKpiCard('shopping-bag','Total comprado',`R$${fmt(totalGasto)}`,'var(--purple)','var(--purple-xlight)',`${listasConc.length} lista(s) no período`),
      _relKpiCard('trending-down','Economia gerada',`R$${fmt(economia)}`,'var(--green)','var(--green-light)',`${pctEcon}% abaixo da estimativa`),
      _relKpiCard('receipt','Ticket médio / lista',`R$${fmt(ticketMedio)}`,'var(--orange-dark)','var(--orange-light)',`Estimativa: R$${fmt(totalEstim>0?totalEstim/listasConc.length:0)}`),
      taxaAprov !== null
        ? _relKpiCard('check-circle','Taxa de aprovação',`${taxaAprov}%`,'var(--green)','var(--green-light)',`${aprov}/${totItens} itens aprovados`)
        : _relKpiCard('check-circle','Taxa de aprovação','—','var(--muted)','var(--surface2)','Sem dados'),
      tempoMedio !== null
        ? _relKpiCard('clock','Ciclo médio (dias)',`${tempoMedio}d`,'var(--yellow)','var(--yellow-light)','Da criação ao recebimento')
        : _relKpiCard('clock','Ciclo médio','—','var(--muted)','var(--surface2)','Sem listas concluídas'),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('tag',13,'var(--purple)')} Gastos por Categoria`,
        catArr.length ? _relBars(catArr,'var(--purple)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados no período'), {noMb:true})}
      ${_relSecao(`${lc('users',13,'var(--orange-dark)')} Ranking de Fornecedores`,
        supArr.length ? _relBars(supArr,'var(--orange-dark)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados no período'), {noMb:true})}
    </div>

    ${crossDesp.length > 0 ? _relSecao(
      `${lc('alert-triangle',13,'var(--red)')} Cruzamento: Insumos Comprados × Desperdiçados`,
      _relTabela(
        ['Insumo','Custo desperdiçado no período','Última compra unitária'],
        crossDesp.map(x => [x.nome, `<strong style="color:var(--red)">R$${fmt(x.custo)}</strong>`, `R$${fmt(x.valorComprado)}`]),
        'Nenhum cruzamento encontrado'
      )
    ) : ''}

    ${_relSecao(`${lc('list',13,'var(--purple)')} Listas do Período`,
      _relTabela(
        ['Código','Data criação','Data conclusão','Estimativa','Total final','Economia','Status'],
        listasConc.map(l => [
          `<span style="font-family:monospace;font-size:var(--text-xs)">${l.codigo}</span>`,
          _fmtDrel(l.dataCriacao?.slice(0,10)),
          _fmtDrel(l.dataConclusao?.slice(0,10)),
          `R$${fmt(l.valorEstimado||0)}`,
          `<strong>R$${fmt(l.valorFinal||0)}</strong>`,
          `<span style="color:var(--green)">R$${fmt(Math.max(0,(l.valorEstimado||0)-(l.valorFinal||0)))}</span>`,
          _relStatusBadge('concluida'),
        ]),
        'Nenhuma lista concluída no período'
      ))}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: ESTOQUE
// ══════════════════════════════════════════════════════════════

function _relEstoque(el, per) {
  const insAtivos = items.filter(i => !i.isProd);
  const criticos  = insAtivos.filter(i => gst(i) === 'crit');
  const alerta    = insAtivos.filter(i => gst(i) === 'warn');
  const ok        = insAtivos.filter(i => gst(i) === 'ok');
  const valorTotal = insAtivos.reduce((s,i) => s+(i.qty*i.cost),0);
  const valorCrit  = criticos.reduce((s,i) => s+(gneed(i)*i.cost),0);

  // Valor por categoria
  const catVal = {};
  insAtivos.forEach(i => {
    catVal[i.cat||'Sem cat'] = (catVal[i.cat||'Sem cat']||0) + i.qty*i.cost;
  });

  // Cobertura média (dias estimados) — qty/min como proxy
  const comMin = insAtivos.filter(i => i.min > 0);
  const cobMedia = comMin.length > 0
    ? Math.round(comMin.reduce((s,i) => s + i.qty/i.min, 0) / comMin.length * 100) / 100
    : null;

  const itensOrdenados = [...insAtivos].sort((a,b) => (b.qty*b.cost)-(a.qty*a.cost));
  const catArr = Object.entries(catVal).sort((a,b)=>b[1]-a[1]);

  // Cruzamento: críticos não comprados recentemente
  const listasRecentes = listas.filter(l => l.status === 'concluida')
    .sort((a,b) => (b.dataConclusao||'').localeCompare(a.dataConclusao||'')).slice(0,5);
  const nomesCrit = new Set(criticos.map(i => i.name.toLowerCase()));
  const nomesCritComprados = new Set();
  listasRecentes.forEach(l => l.itens?.forEach(i => {
    if (nomesCrit.has(i.nome?.toLowerCase())) nomesCritComprados.add(i.nome?.toLowerCase());
  }));
  const critNaoComprados = criticos.filter(i => !nomesCritComprados.has(i.name.toLowerCase()));

  el.innerHTML = `
    ${_relKpiGrid([
      _relKpiCard('dollar-sign','Valor total do estoque',`R$${fmt(valorTotal)}`,'var(--purple)','var(--purple-xlight)',`${insAtivos.length} insumos ativos`),
      _relKpiCard('alert-circle','Críticos',criticos.length,'var(--red)','var(--red-light)',`Reposição: R$${fmt(valorCrit)}`),
      _relKpiCard('alert-triangle','Em alerta',alerta.length,'var(--yellow)','var(--yellow-light)','Abaixo do ideal'),
      _relKpiCard('check-circle','OK',ok.length,'var(--green)','var(--green-light)','Dentro do ideal'),
      cobMedia !== null
        ? _relKpiCard('layers','Cobertura média',`${cobMedia}×`,'var(--orange-dark)','var(--orange-light)','qty ÷ estoque mínimo')
        : _relKpiCard('layers','Cobertura','—','var(--muted)','var(--surface2)','Sem mínimos configurados'),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('tag',13,'var(--purple)')} Valor por Categoria`,
        catArr.length ? _relBars(catArr,'var(--purple)',v=>`R$${fmt(v)}`) : _relVazio('Sem categorias'), {noMb:true})}

      ${critNaoComprados.length > 0
        ? _relSecao(`${lc('alert-circle',13,'var(--red)')} Críticos Não Comprados Recentemente`,
          critNaoComprados.map(i =>
            _relInsightBox('alert-circle','var(--red)','var(--red-light)',
              `<strong>${i.name}</strong> — ${fmt(i.qty)} ${i.unit} atual · mínimo ${fmt(i.min)} ${i.unit} · Repor ≈ R$${fmt(gneed(i)*i.cost)}`)
          ).join(''), {noMb:true})
        : _relSecao(`${lc('check-circle',13,'var(--green)')} Cobertura de Críticos`,
          _relInsightBox('check-circle','var(--green)','var(--green-light)','Todos os insumos críticos foram incluídos em compras recentes'), {noMb:true})}
    </div>

    ${_relSecao(`${lc('package',13,'var(--purple)')} Todos os Insumos — Situação Atual`,
      _relTabela(
        ['Insumo','Categoria','Qtd. atual','Mínimo','Ideal','% do ideal','Valor (R$)','Status'],
        itensOrdenados.map(i => {
          const pct = i.ideal > 0 ? Math.round(i.qty/i.ideal*100) : 0;
          const s = gst(i);
          const scor = s==='crit'?'var(--red)':s==='warn'?'var(--yellow)':'var(--green)';
          return [
            `<strong>${i.name}</strong>`,
            i.cat||'—',
            `<span style="font-family:monospace">${fmt(i.qty)} ${i.unit}</span>`,
            `${fmt(i.min)} ${i.unit}`,
            `${fmt(i.ideal)} ${i.unit}`,
            `<span style="font-weight:700;color:${scor}">${pct}%</span>`,
            `R$${fmt(i.qty*i.cost)}`,
            `<span style="font-weight:700;font-size:var(--text-xs);padding:2px 7px;border-radius:8px;background:${s==='crit'?'var(--red-light)':s==='warn'?'var(--yellow-light)':'var(--green-light)'};color:${scor}">${s==='crit'?'CRÍTICO':s==='warn'?'ALERTA':'OK'}</span>`,
          ];
        }),
        'Nenhum insumo cadastrado'
      ))}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: DESPERDÍCIO
// ══════════════════════════════════════════════════════════════

function _relDesperdicio(el, per) {
  const all  = typeof desperdicios !== 'undefined' ? desperdicios : [];
  const filt = _relFiltrar(all, 'date');

  const totalCusto = filt.reduce((s,d) => s+(d.custo||0), 0);
  const totalQty   = filt.reduce((s,d) => s+(d.qty||0), 0);
  const dias = Math.max(1, Math.round((new Date(per.ate) - new Date(per.de)) / 86400000) + 1);
  const mediaDiaria = totalCusto / dias;

  // Por tipo
  const tipoMap = {};
  filt.forEach(d => { tipoMap[d.tipo||'outro'] = (tipoMap[d.tipo||'outro']||0)+(d.custo||0); });
  const tipoLabels = {};
  (typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO : []).forEach(t => { tipoLabels[t.id] = t.label; });
  const tipoArr = Object.entries(tipoMap)
    .map(([id,v]) => [tipoLabels[id]||id, v]).sort((a,b)=>b[1]-a[1]);

  // Por responsável
  const respMap = {};
  filt.forEach(d => { const r = d.resp||'Não informado'; respMap[r]=(respMap[r]||0)+(d.custo||0); });
  const respArr = Object.entries(respMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Por insumo
  const insMap = {};
  filt.forEach(d => { insMap[d.nome]=(insMap[d.nome]||0)+(d.custo||0); });
  const insArr = Object.entries(insMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Tendência semanal (últimas 8 semanas)
  const semMap = {};
  filt.forEach(d => {
    if (!d.date) return;
    const dt = new Date(d.date);
    const seg = new Date(dt); seg.setDate(dt.getDate() - dt.getDay() + 1);
    const key = `${seg.getDate().toString().padStart(2,'0')}/${(seg.getMonth()+1).toString().padStart(2,'0')}`;
    semMap[key] = (semMap[key]||0)+(d.custo||0);
  });
  const semArr = Object.entries(semMap).sort((a,b)=>a[0].localeCompare(b[0])).slice(-8);

  // Cruzamento: desperdício vs compras
  const listasConc = _relFiltrar(listas.filter(l=>l.status==='concluida'),'dataConclusao');
  const compraMap = {};
  listasConc.forEach(l => l.itens?.forEach(i => {
    if (i.qtdComprada && i.precoUnitFinal) {
      compraMap[i.nome] = (compraMap[i.nome]||0)+i.precoUnitFinal*i.qtdComprada;
    }
  }));
  const cross = Object.entries(insMap)
    .filter(([nome]) => compraMap[nome])
    .map(([nome,despVal]) => ({
      nome,
      despVal,
      compVal: compraMap[nome],
      pct: Math.round(despVal/compraMap[nome]*100),
    }))
    .filter(x => x.pct > 0)
    .sort((a,b)=>b.pct-a.pct).slice(0,5);

  el.innerHTML = `
    ${_relKpiGrid([
      _relKpiCard('dollar-sign','Custo total',`R$${fmt(totalCusto)}`,'var(--red)','var(--red-light)',`${filt.length} registro(s)`),
      _relKpiCard('package','Quantidade total',`${fmt(totalQty)}`,'var(--orange-dark)','var(--orange-light)','Unidades variadas (kg/un)'),
      _relKpiCard('calendar','Média diária',`R$${fmt(mediaDiaria)}`,'var(--yellow)','var(--yellow-light)',`Base: ${dias} dias`),
      _relKpiCard('user','Responsável top',respArr[0]?.[0]||'—','var(--purple)','var(--purple-xlight)',respArr[0]?`R$${fmt(respArr[0][1])}`:' '),
      _relKpiCard('tag','Tipo top',tipoArr[0]?.[0]||'—','var(--red)','var(--red-light)',tipoArr[0]?`R$${fmt(tipoArr[0][1])}`:' '),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('tag',13,'var(--red)')} Por Tipo`,
        tipoArr.length ? _relBars(tipoArr,'var(--red)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados'), {noMb:true})}
      ${_relSecao(`${lc('user',13,'var(--orange-dark)')} Por Responsável`,
        respArr.length ? _relBars(respArr,'var(--orange-dark)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados'), {noMb:true})}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('package',13,'var(--yellow)')} Top Insumos Desperdiçados`,
        insArr.length ? _relBars(insArr,'var(--yellow)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados'), {noMb:true})}
      ${_relSecao(`${lc('bar-chart-2',13,'var(--purple)')} Tendência Semanal`,
        semArr.length ? _relBars(semArr,'var(--purple)',v=>`R$${fmt(v)}`) : _relVazio('Sem dados'), {noMb:true})}
    </div>

    ${cross.length > 0 ? _relSecao(
      `${lc('alert-triangle',13,'var(--red)')} Cruzamento: % Desperdiçado vs Comprado`,
      `<div style="font-size:var(--text-xs);color:var(--text2);margin-bottom:12px">Quanto do valor comprado foi desperdiçado no período</div>` +
      _relTabela(
        ['Insumo','Comprado (R$)','Desperdiçado (R$)','% desperdício'],
        cross.map(x => [
          `<strong>${x.nome}</strong>`,
          `R$${fmt(x.compVal)}`,
          `<span style="color:var(--red)">R$${fmt(x.despVal)}</span>`,
          `<strong style="color:${x.pct>20?'var(--red)':x.pct>10?'var(--orange-dark)':'var(--yellow)'}">${x.pct}%</strong>`,
        ]),
        'Nenhum cruzamento'
      )
    ) : ''}

    ${_relSecao(`${lc('list',13,'var(--red)')} Registros do Período`,
      _relTabela(
        ['Data','Insumo','Tipo','Qtd.','Custo','Responsável'],
        filt.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(d => [
          _fmtDrel(d.date),
          d.nome||'—',
          tipoLabels[d.tipo||'']||d.tipo||'—',
          `${fmt(d.qty)} ${d.unidade||''}`,
          `R$${fmt(d.custo||0)}`,
          d.resp||'—',
        ]),
        'Nenhum registro no período'
      ))}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: PRODUÇÃO
// ══════════════════════════════════════════════════════════════

function _relProducao(el, per) {
  const todas  = _relFiltrar(ordens.filter(o => !o.archived), 'date');
  const pend   = todas.filter(o => o.status === 'pendente');
  const conc   = todas.filter(o => o.status === 'concluido' || o.status === 'concluída');
  const canc   = todas.filter(o => o.status === 'cancelada' || o.status === 'cancelado');

  const volTotal = conc.reduce((s,o) => s+(o.qtyReal||o.qty||0), 0);

  // Por preparado
  const prepMap = {};
  todas.forEach(o => {
    const item = items.find(i => i.id === o.itemId);
    const nome = item?.name || `Prep. #${o.itemId}`;
    prepMap[nome] = (prepMap[nome]||0)+(o.qty||0);
  });
  const prepArr = Object.entries(prepMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Por responsável
  const respMap = {};
  todas.forEach(o => { const r=o.resp||'Não informado'; respMap[r]=(respMap[r]||0)+1; });
  const respArr = Object.entries(respMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  // Tempo médio de conclusão
  const tempos = conc.filter(o=>o.date && o.finishedAt).map(o =>
    Math.round((new Date(o.finishedAt) - new Date(o.date)) / 3600000)
  );
  const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((s,v)=>s+v,0)/tempos.length) : null;

  // Cruzamento com desperdício
  const despFilt  = _relFiltrar(typeof desperdicios !== 'undefined' ? desperdicios : [], 'date');
  const despProd  = despFilt.filter(d => d.origem === 'producao' || d.prodId);

  el.innerHTML = `
    ${_relKpiGrid([
      _relKpiCard('chef-hat','Total de ordens',todas.length,'var(--purple)','var(--purple-xlight)',`No período`),
      _relKpiCard('check-circle','Concluídas',conc.length,'var(--green)','var(--green-light)',`${todas.length>0?Math.round(conc.length/todas.length*100):0}% do total`),
      _relKpiCard('clock','Pendentes',pend.length,'var(--yellow)','var(--yellow-light)','Aguardando execução'),
      _relKpiCard('x-circle','Canceladas',canc.length,'var(--red)','var(--red-light)',''),
      _relKpiCard('package','Volume produzido',`${fmt(volTotal)}`,'var(--orange-dark)','var(--orange-light)','kg/un (concluídas)'),
      tempoMedio !== null
        ? _relKpiCard('timer','Tempo médio',`${tempoMedio}h`,'var(--purple)','var(--purple-xlight)','Ordens concluídas com hora')
        : _relKpiCard('timer','Tempo médio','—','var(--muted)','var(--surface2)','Sem dados de hora'),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('chef-hat',13,'var(--purple)')} Volume por Preparado`,
        prepArr.length ? _relBars(prepArr,'var(--purple)',v=>`${fmt(v)}`) : _relVazio('Sem ordens no período'), {noMb:true})}
      ${_relSecao(`${lc('user',13,'var(--orange-dark)')} Ordens por Responsável`,
        respArr.length ? _relBars(respArr,'var(--orange-dark)',v=>`${v}`) : _relVazio('Sem dados'), {noMb:true})}
    </div>

    ${despProd.length > 0 ? _relSecao(
      `${lc('trash-2',13,'var(--red)')} Desperdício Originado da Produção`,
      _relTabela(
        ['Data','Insumo/Produto','Tipo','Qtd.','Custo','Responsável'],
        despProd.map(d => [_fmtDrel(d.date), d.nome||'—', d.tipo||'—', `${fmt(d.qty)} ${d.unidade||''}`, `R$${fmt(d.custo||0)}`, d.resp||'—']),
        'Nenhum desperdício de produção'
      )
    ) : ''}

    ${_relSecao(`${lc('list',13,'var(--purple)')} Ordens do Período`,
      _relTabela(
        ['Data','Preparado','Qtd. planejada','Qtd. real','Turno','Responsável','Status'],
        todas.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(o => {
          const item = items.find(i => i.id === o.itemId);
          return [
            _fmtDrel(o.date),
            item?.name||`#${o.itemId}`,
            `${fmt(o.qty)}`,
            o.qtyReal != null ? `${fmt(o.qtyReal)}` : '—',
            o.turno||'—',
            o.resp||'—',
            _relStatusBadge(o.status),
          ];
        }),
        'Nenhuma ordem no período'
      ))}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: OPERACIONAL (Checklist + RH + Manutenção)
// ══════════════════════════════════════════════════════════════

function _relOperacional(el, per) {
  // ── Checklist
  const sessoes    = typeof _getCkSessoes === 'function' ? _getCkSessoes() : [];
  const ckFilt     = _relFiltrar(sessoes, 'data');
  const ckConc     = ckFilt.filter(s => s.status === 'concluida');
  const ckPend     = ckFilt.filter(s => s.status !== 'concluida');
  const ckPct      = ckFilt.length > 0 ? Math.round(ckConc.length/ckFilt.length*100) : null;

  // Por responsável (checklist)
  const ckRespMap = {};
  ckFilt.forEach(s => { const r=s.responsavel||'Não atrib.'; ckRespMap[r]=(ckRespMap[r]||{conc:0,tot:0}); ckRespMap[r].tot++; if(s.status==='concluida')ckRespMap[r].conc++; });
  const ckRespArr = Object.entries(ckRespMap).map(([r,v])=>[r,v.conc,v.tot]).sort((a,b)=>b[2]-a[2]).slice(0,8);

  // ── RH
  const presFilt  = _relFiltrar(rhPresencas, 'data');
  const presConc  = presFilt.filter(p => p.status === 'presente');
  const presAus   = presFilt.filter(p => p.status === 'ausente' || p.status === 'falta');
  const heTotal   = _relFiltrar(rhHorasExtras, 'data').reduce((s,h)=>s+(h.horas||0),0);

  const funcPresMap = {};
  presFilt.forEach(p => {
    const func = funcionarios.find(f=>f.id===p.funcId);
    const nome = func?.nome||`#${p.funcId}`;
    funcPresMap[nome]=(funcPresMap[nome]||{pres:0,aus:0});
    if(p.status==='presente')funcPresMap[nome].pres++;
    else funcPresMap[nome].aus++;
  });
  const funcPresArr = Object.entries(funcPresMap)
    .map(([n,v])=>[n,v.pres,v.aus,v.pres+v.aus])
    .sort((a,b)=>b[3]-a[3]).slice(0,8);

  // ── Manutenção
  const mLog   = typeof manutLog !== 'undefined' ? _relFiltrar(manutLog, 'dataAbertura') : [];
  const mConc  = mLog.filter(m => m.status === 'concluido');
  const mPend  = mLog.filter(m => m.status !== 'concluido');
  const equips = typeof manutEquip !== 'undefined' ? manutEquip : [];
  const equipsAtras = Array.isArray(equips) ? equips.filter(e=>e.status==='atrasado').length : 0;
  const custoManut = mConc.reduce((s,m)=>s+(m.custo||0),0);

  // Equipamentos com mais ocorrências
  const equipMap = {};
  mLog.forEach(m => {
    const eq = (Array.isArray(equips)?equips:[]).find(e=>e.id===m.equipId);
    const nome = eq?.nome||m.equipId||'Desconhecido';
    equipMap[nome]=(equipMap[nome]||0)+1;
  });
  const equipArr = Object.entries(equipMap).sort((a,b)=>b[1]-a[1]).slice(0,6);

  el.innerHTML = `
    <div style="font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Checklist</div>
    ${_relKpiGrid([
      ckPct !== null
        ? _relKpiCard('check-square','Taxa de conclusão',`${ckPct}%`,'var(--green)','var(--green-light)',`${ckConc.length}/${ckFilt.length} sessões`)
        : _relKpiCard('check-square','Sessões','Sem dados','var(--muted)','var(--surface2)','Nenhuma sessão no período'),
      _relKpiCard('check-circle','Concluídas',ckConc.length,'var(--green)','var(--green-light)',''),
      _relKpiCard('clock','Pendentes/atrasadas',ckPend.length,'var(--yellow)','var(--yellow-light)',''),
    ])}
    ${ckRespArr.length > 0 ? _relSecao(`${lc('user',13,'var(--green)')} Compliance por Responsável`,
      _relTabela(
        ['Responsável','Concluídas','Total','Taxa'],
        ckRespArr.map(([r,c,t])=>[r,c,t,`<strong style="color:${c/t>0.8?'var(--green)':'var(--yellow)'}">${Math.round(c/t*100)}%</strong>`]),
        'Sem dados'
      )
    ) : ''}

    <div style="font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:20px 0 10px">RH — Presença</div>
    ${_relKpiGrid([
      _relKpiCard('user-check','Presenças',presConc.length,'var(--green)','var(--green-light)',`${presFilt.length} registros`),
      _relKpiCard('user-x','Faltas/Ausências',presAus.length,'var(--red)','var(--red-light)',presFilt.length>0?`${Math.round(presAus.length/presFilt.length*100)}% do total`:''),
      _relKpiCard('clock','Horas extras',`${fmt(heTotal)}h`,'var(--orange-dark)','var(--orange-light)','Acumuladas no período'),
    ])}
    ${funcPresArr.length > 0 ? _relSecao(`${lc('users',13,'var(--purple)')} Presença por Funcionário`,
      _relTabela(
        ['Funcionário','Presenças','Faltas','Taxa presença'],
        funcPresArr.map(([n,pr,au,tot])=>[n,pr,au,`<strong style="color:${pr/tot>0.9?'var(--green)':'var(--red)'}">${Math.round(pr/tot*100)}%</strong>`]),
        'Sem registros'
      )
    ) : ''}

    <div style="font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin:20px 0 10px">Manutenção</div>
    ${_relKpiGrid([
      _relKpiCard('wrench','Ocorrências',mLog.length,'var(--purple)','var(--purple-xlight)','No período'),
      _relKpiCard('check-circle','Concluídas',mConc.length,'var(--green)','var(--green-light)',`${mLog.length>0?Math.round(mConc.length/mLog.length*100):0}%`),
      _relKpiCard('alert-triangle','Atrasadas',equipsAtras,'var(--red)','var(--red-light)','Preventivas atrasadas'),
      _relKpiCard('dollar-sign','Custo manutenção',`R$${fmt(custoManut)}`,'var(--orange-dark)','var(--orange-light)','Concluídas com custo'),
    ])}
    ${equipArr.length > 0 ? _relSecao(`${lc('wrench',13,'var(--orange-dark)')} Equipamentos com Mais Ocorrências`,
      _relBars(equipArr,'var(--orange-dark)',v=>`${v} oc.`)
    ) : ''}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: VARIAÇÃO DE PREÇOS (migrada do modules.js)
// ══════════════════════════════════════════════════════════════

function _relPrecos(el, per) {
  if (!window._relPrecosItemId)   window._relPrecosItemId   = null;
  if (!window._relPrecosPeriodo)  window._relPrecosPeriodo  = '12';

  const itemsComHistorico = [...new Map(
    priceHistory.map(p => [p.itemId, { id: p.itemId, name: p.itemName, cat: p.cat }])
  ).values()].sort((a,b) => a.cat?.localeCompare(b.cat||'')||0 || a.name?.localeCompare(b.name||'')||0);

  const itemSel  = window._relPrecosItemId;
  const meses    = parseInt(window._relPrecosPeriodo) || 12;
  const corte    = new Date(); corte.setMonth(corte.getMonth() - meses);
  const corteStr = corte.toISOString().slice(0,10);

  const pontos = itemSel
    ? priceHistory.filter(p => p.itemId === itemSel && p.data >= corteStr)
        .sort((a,b) => a.data.localeCompare(b.data))
    : [];

  const precoMin = pontos.length ? Math.min(...pontos.map(p=>p.preco)) : 0;
  const precoMax = pontos.length ? Math.max(...pontos.map(p=>p.preco)) : 0;
  const precoMed = pontos.length ? pontos.reduce((s,p)=>s+p.preco,0)/pontos.length : 0;
  const var_pct  = precoMin > 0 ? Math.round((precoMax-precoMin)/precoMin*100) : 0;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      <div style="flex:1;min-width:200px">
        <div style="font-size:var(--text-2xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Insumo</div>
        <select class="inp" style="width:100%" onchange="window._relPrecosItemId=this.value?parseInt(this.value):null;renderRelatorios()">
          <option value="">Selecionar insumo...</option>
          ${itemsComHistorico.map(i=>`<option value="${i.id}" ${itemSel===i.id?'selected':''}>${i.name} · ${i.cat||''}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:var(--text-2xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Janela</div>
        <div style="display:flex;gap:5px">
          ${['3','6','12','99'].map(p => {
            const label = p==='99'?'Tudo':`${p}m`;
            const active = window._relPrecosPeriodo === p;
            return `<button onclick="window._relPrecosPeriodo='${p}';renderRelatorios()"
              style="padding:5px 12px;border-radius:var(--r8);border:1.5px solid ${active?'var(--purple)':'var(--border)'};
              background:${active?'var(--purple)':'var(--surface)'};color:${active?'#fff':'var(--muted)'};
              font-size:var(--text-xs);font-weight:600;cursor:pointer">${label}</button>`;
          }).join('')}
        </div>
      </div>
    </div>

    ${!itemSel ? `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
        ${lc('trending-up',32,'var(--border)')}
        <div style="margin-top:12px;font-size:var(--text-md);font-weight:600">Selecione um insumo para ver a variação de preço</div>
      </div>` :
    pontos.length === 0 ? `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
        ${lc('inbox',32,'var(--border)')}
        <div style="margin-top:12px;font-size:var(--text-md);font-weight:600">Nenhuma compra registrada neste período</div>
      </div>` : `
    ${_relKpiGrid([
      _relKpiCard('trending-down','Menor preço',`R$${fmt(precoMin)}/un`,'var(--green)','var(--green-light)',`${pontos.find(p=>p.preco===precoMin)?.supName||'—'}`),
      _relKpiCard('trending-up','Maior preço',`R$${fmt(precoMax)}/un`,'var(--red)','var(--red-light)',`${pontos.find(p=>p.preco===precoMax)?.supName||'—'}`),
      _relKpiCard('minus','Preço médio',`R$${fmt(precoMed)}/un`,'var(--purple)','var(--purple-xlight)','No período selecionado'),
      _relKpiCard('bar-chart-2','Variação',`${var_pct}%`,'var(--orange-dark)','var(--orange-light)','Entre menor e maior'),
    ])}
    ${_relSecao('Histórico de Preços',
      _relTabela(
        ['Data','Fornecedor','Preço unit.','Lista','Variação'],
        pontos.map((p,i) => {
          const prev = pontos[i-1];
          const diff = prev ? ((p.preco-prev.preco)/prev.preco*100) : null;
          const dcor = diff===null?'var(--muted)':diff>0?'var(--red)':'var(--green)';
          return [
            _fmtDrel(p.data),
            p.supName||'—',
            `<strong style="font-family:monospace">R$${fmt(p.preco)}</strong>`,
            `<span style="font-family:monospace;font-size:var(--text-xs)">${p.listaCodigo||'—'}</span>`,
            diff===null?'—':`<span style="color:${dcor};font-weight:700">${diff>0?'+':''}${diff.toFixed(1)}%</span>`,
          ];
        }),
        'Sem histórico'
      )
    )}`}`;
}

// ══════════════════════════════════════════════════════════════
// IMPRESSÃO
// ══════════════════════════════════════════════════════════════

function _relImprimir() {
  if (!document.getElementById('relPrintStyle')) {
    const s = document.createElement('style');
    s.id = 'relPrintStyle';
    s.textContent = `
      @page { size: A4 portrait; margin: 14mm 12mm 12mm; }
      @media print {
        /* ── Ocultar chrome da aplicação ── */
        #sidebar, #sbToggle, #topbar, .rel-no-print, select, input[type="date"] { display: none !important; }
        button { display: none !important; }

        /* ── Cabeçalho de impressão ── */
        .rel-print-header {
          display: flex !important;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
          margin-bottom: 16px;
        }

        /* ── Reset de layout ── */
        body, html { background: #fff !important; }
        #app { display: block !important; }
        #main { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        #page-relatorios { padding: 0 !important; overflow: visible !important; }
        #relConteudo { padding: 0 !important; }

        /* ── Monochrome: override todos os estilos inline ── */
        * {
          background-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
          color: #111 !important;
          border-color: #bbb !important;
        }

        /* ── Estrutura: bordas no lugar de fundos coloridos ── */
        .card {
          border: 1.5px solid #aaa !important;
          margin-bottom: 10px !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .card-header {
          border-bottom: 1px solid #bbb !important;
          padding: 7px 14px !important;
        }
        .card-title { font-size: 9pt !important; font-weight: 700 !important; }

        /* ── Grid de KPIs: compacto, 4 por linha ── */
        div[style*="grid-template-columns"] {
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 6px !important;
          margin-bottom: 10px !important;
        }
        div[style*="grid-template-columns"] > div {
          border: 1px solid #999 !important;
          padding: 6px 9px !important;
        }
        div[style*="grid-template-columns"] svg { display: none !important; }

        /* ── Barras: fill em cinza escuro ── */
        [data-pf] { background: #555 !important; }
        div[style*="background:var(--border)"][style*="border-radius:4px"] { background: #e0e0e0 !important; }

        /* ── Tabelas: linhas e colunas definidas ── */
        table { border-collapse: collapse !important; width: 100% !important; }
        thead th {
          background: #ebebeb !important;
          border: 1px solid #aaa !important;
          padding: 4px 8px !important;
          font-size: 7pt !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: .3px !important;
          color: #333 !important;
        }
        tbody td {
          border: 1px solid #d0d0d0 !important;
          padding: 4px 8px !important;
          font-size: 8pt !important;
        }
        tbody tr:nth-child(even) td { background: #f7f7f7 !important; }

        /* ── Insight boxes: borda lateral ── */
        div[style*="border-left:3px"] {
          border: 1px solid #bbb !important;
          border-left: 3px solid #555 !important;
          padding: 5px 10px !important;
          margin-bottom: 5px !important;
        }

        /* ── Badges: monocromáticos ── */
        span[style*="border-radius:10px"] {
          border: 1px solid #888 !important;
          padding: 1px 5px !important;
          font-size: 7pt !important;
        }

        /* ── Quebras de página ── */
        .card-header, h2, h3 { break-after: avoid; }
        tr { break-inside: avoid; }
        .card + .card { break-before: auto; }
      }
    `;
    document.head.appendChild(s);
  }
  const per  = _relGetPer();
  const tabs = { visao:'Visão Geral', compras:'Compras', estoque:'Estoque', desperdicio:'Desperdício', producao:'Produção', manutencao:'Manutenção', operacional:'Operacional', precos:'Variação de Preços', auditoria:'Auditoria' };
  const h = document.querySelector('.rel-print-header');
  if (h) {
    h.innerHTML = `
      <div>
        <div style="font-size:13pt;font-weight:800;letter-spacing:-.3px">Vai Ter Pizza! — Relatório</div>
        <div style="font-size:8pt;margin-top:2px;color:#444">${tabs[window._relTab] || window._relTab}</div>
      </div>
      <div style="text-align:right;font-size:7.5pt;color:#555">
        <div><strong>Período:</strong> ${per.label}</div>
        <div>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;
    h.style.display = 'flex';
  }
  window.print();
  setTimeout(() => { if (h) h.style.display = 'none'; }, 600);
}

// ══════════════════════════════════════════════════════════════
// TAB: MANUTENÇÃO
// ══════════════════════════════════════════════════════════════

function _relManutencao(el, per) {
  const itens  = typeof manutItens !== 'undefined' ? manutItens : [];
  const equips = typeof manutEquip !== 'undefined' ? manutEquip : [];
  const log    = typeof manutLog   !== 'undefined' ? manutLog   : [];
  const calcSt = typeof _manutCalcStatus === 'function' ? _manutCalcStatus : () => 'pendente';

  if (!itens.length && !log.length) {
    el.innerHTML = _relVazio('Nenhum dado de manutenção registrado');
    return;
  }

  const logFilt = _relFiltrar(log, 'dataExecucao');

  const preventivas = itens.filter(i => i.tipo === 'preventiva');
  const corretivas  = itens.filter(i => i.tipo === 'corretiva');
  const certs       = itens.filter(i => i.tipo === 'certificacao');

  const prevAtras  = preventivas.filter(i => calcSt(i) === 'atrasado').length;
  const prevPend   = preventivas.filter(i => calcSt(i) === 'pendente').length;
  const prevEmDia  = preventivas.filter(i => calcSt(i) === 'em_dia').length;
  const corrAbert  = corretivas.filter(i => i.statusCorretiva !== 'resolvida').length;
  const certVenc   = certs.filter(i => calcSt(i) === 'atrasado').length;
  const custoLog   = logFilt.reduce((s,l) => s + (l.valor||0), 0);

  const logPrev = logFilt.filter(l => l.tipo === 'preventiva');
  const logCorr = logFilt.filter(l => l.tipo === 'corretiva');
  const logCert = logFilt.filter(l => l.tipo === 'certificacao');

  const equipMap = {};
  logFilt.forEach(l => {
    if (!l.equipamentoId) return;
    const eq = equips.find(e => e.id === l.equipamentoId);
    equipMap[eq?.nome || l.equipamentoId.slice(0,8)] = (equipMap[eq?.nome || l.equipamentoId.slice(0,8)]||0) + 1;
  });
  const equipArr = Object.entries(equipMap).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const respCustoMap = {};
  logFilt.forEach(l => {
    if (!l.valor) return;
    const r = l.responsavel || 'Não informado';
    respCustoMap[r] = (respCustoMap[r]||0) + l.valor;
  });
  const respCustoArr = Object.entries(respCustoMap).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const hoje90str = (() => { const d = new Date(); d.setDate(d.getDate()+90); return d.toISOString().slice(0,10); })();
  const todayStr  = new Date().toISOString().slice(0,10);
  const certsVenc = certs
    .filter(i => i.vencimento && i.vencimento >= todayStr && i.vencimento <= hoje90str)
    .sort((a,b) => a.vencimento.localeCompare(b.vencimento));
  const certsVencidas = certs.filter(i => i.vencimento && i.vencimento < todayStr);

  el.innerHTML = `
    ${_relKpiGrid([
      _relKpiCard('wrench','Itens de manutenção', itens.length, 'var(--purple)','var(--purple-xlight)',
        `${preventivas.length} prev · ${corretivas.length} corr · ${certs.length} cert`),
      _relKpiCard('alert-triangle','Preventivas atrasadas', prevAtras, 'var(--red)','var(--red-light)',
        `${prevPend} pendentes · ${prevEmDia} em dia`),
      _relKpiCard('tool','Corretivas abertas', corrAbert,
        corrAbert > 0 ? 'var(--orange-dark)' : 'var(--green)',
        corrAbert > 0 ? 'var(--orange-light)' : 'var(--green-light)',
        `${corretivas.filter(i=>i.statusCorretiva==='resolvida').length} resolvidas`),
      _relKpiCard('file-text','Licenças vencidas', certVenc + certsVencidas.length,
        certVenc + certsVencidas.length > 0 ? 'var(--red)' : 'var(--green)',
        certVenc + certsVencidas.length > 0 ? 'var(--red-light)' : 'var(--green-light)',
        `${certsVenc.length} vencem em 90 dias`),
      _relKpiCard('dollar-sign','Custo no período', `R$${fmt(custoLog)}`, 'var(--purple)','var(--purple-xlight)',
        `${logFilt.length} execução(ões)`),
    ])}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      ${_relSecao(`${lc('pie-chart',13,'var(--purple)')} Execuções por Tipo — ${per.label}`,
        logFilt.length
          ? _relBars([['Preventivas',logPrev.length],['Corretivas',logCorr.length],['Certificações',logCert.length]], 'var(--purple)', v=>`${v}`)
          : _relVazio('Sem execuções no período'), {noMb:true})}

      ${equipArr.length
        ? _relSecao(`${lc('cpu',13,'var(--orange-dark)')} Equipamentos com Mais Ocorrências`,
          _relBars(equipArr,'var(--orange-dark)',v=>`${v} oc.`), {noMb:true})
        : _relSecao(`${lc('cpu',13,'var(--muted)')} Equipamentos`,
          _relVazio('Sem ocorrências vinculadas no período'), {noMb:true})}
    </div>

    ${respCustoArr.length ? _relSecao(
      `${lc('dollar-sign',13,'var(--red)')} Custo por Responsável`,
      _relBars(respCustoArr,'var(--red)',v=>`R$${fmt(v)}`)
    ) : ''}

    ${certsVenc.length || certsVencidas.length ? _relSecao(
      `${lc('alert-circle',13,'var(--yellow)')} Licenças e Alvarás — Situação`,
      `${certsVencidas.length ? _relInsightBox('alert-circle','var(--red)','var(--red-light)',
        `${certsVencidas.length} licença(s) já vencida(s): ${certsVencidas.map(i=>i.nome).join(', ')}`) : ''}
      ${certsVenc.length ? _relTabela(
        ['Nome','Vencimento','Dias restantes','Responsável'],
        certsVenc.map(i => {
          const diff = Math.round((new Date(i.vencimento+'T00:00:00') - new Date()) / 86400000);
          const cor  = diff <= 7 ? 'var(--red)' : diff <= 30 ? 'var(--orange-dark)' : 'var(--yellow)';
          return [
            `<strong>${i.nome}</strong>`,
            _fmtDrel(i.vencimento),
            `<span style="font-weight:700;color:${cor}">${diff}d</span>`,
            i.responsavel||'—',
          ];
        }),
        'Nenhuma a vencer'
      ) : ''}`
    ) : ''}

    ${_relSecao(`${lc('list',13,'var(--purple)')} Histórico de Execuções — ${per.label}`,
      _relTabela(
        ['Data','Tipo','Item','Equipamento','Responsável','Custo'],
        logFilt.sort((a,b)=>(b.dataExecucao||'').localeCompare(a.dataExecucao||'')).slice(0,200).map(l => {
          const eq       = equips.find(e => e.id === l.equipamentoId);
          const tipoCor  = l.tipo==='corretiva' ? 'var(--red)' : l.tipo==='certificacao' ? 'var(--purple)' : 'var(--green)';
          const tipoLbl  = l.tipo==='corretiva' ? 'Corretiva' : l.tipo==='certificacao' ? 'Cert.' : 'Preventiva';
          return [
            _fmtDrel(l.dataExecucao),
            `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:8px;background:${tipoCor}22;color:${tipoCor}">${tipoLbl}</span>`,
            l.nome||'—',
            eq?.nome||'—',
            l.responsavel||'—',
            l.valor ? `R$${fmt(l.valor)}` : '—',
          ];
        }),
        'Nenhuma execução registrada no período'
      ))}`;
}

// ══════════════════════════════════════════════════════════════
// TAB: AUDITORIA — delega ao módulo auditoria.js
// ══════════════════════════════════════════════════════════════

function _relAuditoria(el, per) {
  if (typeof renderAuditoria === 'function') {
    renderAuditoria(el);
    return;
  }
  // Fallback se auditoria.js não estiver carregado
  el.innerHTML = `<div style="text-align:center;padding:56px 24px;color:var(--muted)">
    ${lc('shield-check',44,'var(--border)')}
    <div style="font-size:var(--text-md);font-weight:700;margin-top:14px">Módulo de auditoria não carregado</div>
  </div>`;
}

// ── Versão legada preservada (não usada quando auditoria.js está presente) ──
function _relAuditoriaLegacy(el, per) {
  const ACAO_LABEL = {
    login:                  'Login',
    logout:                 'Logout',
    lista_criada:           'Lista criada',
    lista_etapa:            'Etapa de compra',
    recebimento_item:       'Item recebido',
    movimentacao:           'Movimentação',
    desperdicio_registrado: 'Desperdício',
    insumo_salvo:           'Insumo salvo',
    fornecedor_salvo:       'Fornecedor salvo',
    checklist_concluido:    'Checklist concluído',
  };
  const MOD_LABEL = { sistema:'Sistema', compras:'Compras', estoque:'Estoque', desperdicio:'Desperdício', cadastros:'Cadastros', checklist:'Checklist', configuracoes:'Configurações', producao:'Produção' };
  const ROLE_LABEL = { gerente:'Gerente', supervisor:'Supervisor', comprador:'Comprador', funcionario:'Funcionário' };
  const fmtDH = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };

  const log = typeof auditLog !== 'undefined' ? auditLog : [];

  if (!log.length) {
    el.innerHTML = `<div style="text-align:center;padding:56px 24px">
      ${lc('shield-check',44,'var(--border)')}
      <div style="font-size:var(--text-md);font-weight:700;margin-top:14px;color:var(--text2)">Auditoria ainda sem registros</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-top:5px;max-width:320px;margin-left:auto;margin-right:auto">
        Todas as ações realizadas a partir de agora serão registradas automaticamente.
      </div>
    </div>`;
    return;
  }

  const filtPer  = _relFiltrar(log, 'created_at');
  const filtUser = window._relAudUser || '';
  const filtMod  = window._relAudMod  || '';
  const filtAcao = window._relAudAcao || '';

  let filtered = filtPer;
  if (filtUser) filtered = filtered.filter(e => e.user_name === filtUser);
  if (filtMod)  filtered = filtered.filter(e => e.modulo    === filtMod);
  if (filtAcao) filtered = filtered.filter(e => e.acao      === filtAcao);
  filtered = [...filtered].sort((a,b) => b.created_at.localeCompare(a.created_at));

  const totalAcoes = filtered.length;
  const logins     = filtered.filter(e => e.acao === 'login').length;
  const uniqUsers  = new Set(filtered.map(e => e.user_id)).size;
  const uniqDias   = new Set(filtered.map(e => e.created_at.slice(0,10))).size;

  const byUser = {};
  filtered.forEach(e => { byUser[e.user_name] = (byUser[e.user_name]||0) + 1; });
  const byUserArr = Object.entries(byUser).sort((a,b) => b[1]-a[1]);

  const byMod = {};
  filtered.forEach(e => { if (e.modulo) byMod[MOD_LABEL[e.modulo]||e.modulo] = (byMod[MOD_LABEL[e.modulo]||e.modulo]||0) + 1; });
  const byModArr = Object.entries(byMod).sort((a,b) => b[1]-a[1]);

  const allUsers = [...new Set(log.map(e => e.user_name))].sort();
  const allMods  = [...new Set(log.map(e => e.modulo).filter(Boolean))].sort();
  const allAcoes = [...new Set(log.map(e => e.acao).filter(Boolean))].sort();

  const activeFilter = filtUser || filtMod || filtAcao;
  const filtersBar = `<div class="rel-no-print" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
    <select onchange="window._relAudUser=this.value;renderRelatorios()" class="inp" style="font-size:var(--text-sm);padding:5px 10px;height:32px;min-width:150px;width:auto">
      <option value="">Todos os usuários</option>
      ${allUsers.map(u=>`<option value="${u}" ${u===filtUser?'selected':''}>${u}</option>`).join('')}
    </select>
    <select onchange="window._relAudMod=this.value;renderRelatorios()" class="inp" style="font-size:var(--text-sm);padding:5px 10px;height:32px;min-width:130px;width:auto">
      <option value="">Todos os módulos</option>
      ${allMods.map(m=>`<option value="${m}" ${m===filtMod?'selected':''}>${MOD_LABEL[m]||m}</option>`).join('')}
    </select>
    <select onchange="window._relAudAcao=this.value;renderRelatorios()" class="inp" style="font-size:var(--text-sm);padding:5px 10px;height:32px;min-width:140px;width:auto">
      <option value="">Todas as ações</option>
      ${allAcoes.map(a=>`<option value="${a}" ${a===filtAcao?'selected':''}>${ACAO_LABEL[a]||a}</option>`).join('')}
    </select>
    ${activeFilter ? `<button onclick="window._relAudUser='';window._relAudMod='';window._relAudAcao='';renderRelatorios()"
      style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:var(--r8);border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:var(--text-xs);cursor:pointer">
      ${lc('x',11,'currentColor')} Limpar filtros
    </button>` : ''}
    <span style="font-size:var(--text-xs);color:var(--muted);margin-left:4px">${filtered.length} registros</span>
  </div>`;

  const logTable = _relTabela(
    ['Data / Hora','Usuário','Perfil','Módulo','Ação','Detalhe'],
    filtered.slice(0,300).map(e => [
      `<span style="font-family:monospace;font-size:var(--text-xs);white-space:nowrap">${fmtDH(e.created_at)}</span>`,
      `<strong style="font-size:var(--text-sm)">${e.user_name||'—'}</strong>`,
      `<span style="font-size:var(--text-xs);color:var(--text2)">${ROLE_LABEL[e.user_role]||e.user_role||'—'}</span>`,
      `<span style="font-size:var(--text-xs)">${MOD_LABEL[e.modulo]||e.modulo||'—'}</span>`,
      `<span style="font-size:var(--text-xs);font-weight:600;color:${e.acao==='login'?'var(--green)':e.acao==='logout'?'var(--muted)':e.acao==='desperdicio_registrado'?'var(--red)':'var(--purple)'}">${ACAO_LABEL[e.acao]||e.acao}</span>`,
      `<span style="font-size:var(--text-xs);color:var(--text2)">${e.detalhe||'—'}</span>`,
    ]),
    'Nenhum registro no período selecionado'
  );

  el.innerHTML =
    _relKpiGrid([
      _relKpiCard('activity',   'Ações no período',  totalAcoes,           'var(--purple)',     'var(--purple-xlight)', 'Total de eventos'),
      _relKpiCard('log-in',     'Logins',            logins,               'var(--green)',      'var(--green-light)',   'Acessos ao sistema'),
      _relKpiCard('users',      'Usuários ativos',   uniqUsers,            'var(--orange-dark)','var(--orange-light)',  'Com atividade'),
      _relKpiCard('calendar',   'Dias com atividade',uniqDias,             'var(--purple)',     'var(--purple-xlight)', 'Dias distintos'),
    ]) +
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      ${_relSecao('Ações por usuário',   byUserArr.length ? _relBars(byUserArr,'var(--purple)',    v=>v+' ações') : _relVazio('Sem dados'))}
      ${_relSecao('Ações por módulo',    byModArr.length  ? _relBars(byModArr, 'var(--orange-dark)',v=>v+' ações') : _relVazio('Sem dados'))}
    </div>` +
    _relSecao(
      `Log de atividades${filtered.length>300?' (exibindo 300 mais recentes)':''}`,
      filtersBar + logTable
    );
}

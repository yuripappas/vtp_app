/**
 * VTP Compras — Vai Ter Pizza!
 * cmv.js — Módulo CMV: tudo que mexe no CMV e na lucratividade.
 *
 * Abas no topo:
 *   • CMV do ciclo       — painel do ciclo (estoque-cmv.js): CMV real × teórico,
 *                          GAP, top 5 consumidos, linha do tempo, variação de custo.
 *   • CMV projetado      — vendas × fichas por categoria e produto (vendas-ui.js).
 *   • Consumo de insumos — real (contagem) × digital (vendas + saídas) por item,
 *                          com alerta de inconformidade e detalhe de preço/consumo.
 *   • Precificação       — preço por canal (vendas-ui.js).
 *
 * As abas que vieram do Vendas desenham em #vendasTabContent; para não haver
 * id duplicado, o conteúdo do módulo Vendas é limpo ao abrir o CMV (e vice-versa).
 */

const _CMV_ABAS = [
  { id: 'ciclo',     icon: 'bar-chart-2', label: 'CMV do ciclo'       },
  { id: 'projetado', icon: 'trending-up', label: 'CMV projetado'      },
  { id: 'consumo',   icon: 'package',     label: 'Consumo de insumos' },
  { id: 'precos',    icon: 'tag',         label: 'Precificação'       },
];
let _cmvAba = 'ciclo';
window._vtpGetTab_cmv = () => _cmvAba;
window._vtpSetTab_cmv = v => { if (_CMV_ABAS.some(a => a.id === v)) _cmvAba = v; };

function renderCMVModulo() {
  const el = document.getElementById('cmvContent');
  if (!el) return;
  const vc = document.getElementById('vendasContent'); if (vc) vc.innerHTML = '';
  if (!_CMV_ABAS.some(a => a.id === _cmvAba)) _cmvAba = 'ciclo';
  _setPageTitle('CMV');
  el.innerHTML = `<div style="padding:20px 24px">
    <div style="display:flex;gap:2px;border-bottom:1.5px solid var(--border);margin-bottom:20px;overflow-x:auto">
      ${_CMV_ABAS.map(a => { const on = _cmvAba === a.id; return `<button onclick="_cmvSetAba('${a.id}')"
        style="display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border:none;background:none;cursor:pointer;font-family:inherit;white-space:nowrap;
        font-size:var(--text-md);font-weight:${on ? 700 : 500};color:${on ? 'var(--purple)' : 'var(--text2)'};
        border-bottom:2.5px solid ${on ? 'var(--purple)' : 'transparent'};margin-bottom:-1.5px">${lc(a.icon, 15, 'currentColor')} ${a.label}</button>`; }).join('')}
    </div>
    <div id="cmvAbaBody"></div></div>`;
  const body = document.getElementById('cmvAbaBody');
  if (_cmvAba === 'ciclo') estRenderAbaCMV();
  else if (_cmvAba === 'consumo') cmvRenderConsumo();
  else {
    body.innerHTML = '<div id="vendasTabContent"></div>';
    if (_cmvAba === 'projetado') renderVendasCMV(); else renderVendasPrecos();
  }
}

function _cmvSetAba(id) {
  _cmvAba = id;
  if (typeof _vtpPushRoute === 'function') _vtpPushRoute('cmv');
  renderCMVModulo();
}

// ══════════════════════════════════════════════════════════════
// CONSUMO DE INSUMOS — real × digital por ciclo
// ══════════════════════════════════════════════════════════════
//   Digital = o que o sistema sabe que saiu: vendas (débito automático pela
//             ficha) + saídas registradas (perdas, cortesias…).
//   Real    = o que a contagem mostra que saiu: inicial + compras + produção − final.
//   Diferença = real − digital → ficha errada, porção acima, perda não lançada.
// Itens sem débito automático (ex.: Mussarela em Barra, que vira Mussarela
// Triturada na produção) só têm consumo real: não entram em alerta.

let _csCicloId = null;
let _csFil = { tipo: '', cat: '', q: '', alertas: false, soCmv: true, sort: 'impacto' };
let _csDados = null;

const _csAlertaPct = () => { const v = Number(getConfig().cmvAlertaPct); return v > 0 ? v : 5; };
function _csSetAlerta(v) {
  const cfg = getConfig(); cfg.cmvAlertaPct = parseFloat(String(v).replace(',', '.')) || 5;
  db._set('vtp_config', cfg); _csRender();
}

async function cmvRenderConsumo(forcar = false) {
  const el = document.getElementById('cmvAbaBody');
  if (!el) return;
  el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted)">${lc('refresh-cw', 16, 'currentColor')} Calculando o consumo…</div>`;
  try {
    if (!_ctgDados || forcar) await _ctgCarregar();
    const ciclos = _ctgDados.ciclos;
    if (!ciclos.length) {
      el.innerHTML = `<div class="card" style="padding:40px;text-align:center">
        <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:6px">Nenhum ciclo ainda</div>
        <div style="font-size:var(--text-md);color:var(--text2);max-width:560px;margin:0 auto 16px;line-height:1.5">O consumo real vem das contagens. Faça a contagem de abertura do primeiro ciclo na aba Contagem do Estoque.</div>
        <button class="btn btn-primary" onclick="_estCpAba='contagens';goModule('estoque')">Ir para Contagem</button></div>`;
      return;
    }
    if (!_csCicloId || !ciclos.some(c => c.id === _csCicloId)) _csCicloId = (ciclos.find(c => c.status === 'aberto') || ciclos[0]).id;
    const ciclo = ciclos.find(c => c.id === _csCicloId);
    if (!_cmvCache[ciclo.id] || forcar || ciclo.status === 'aberto') _cmvCache[ciclo.id] = await estCalcularCMV(ciclo, _ctgDados.contagens);
    _csDados = _cmvCache[ciclo.id];
  } catch (e) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui calcular o consumo: ${_estEsc(e.message)}
      <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cmvRenderConsumo(true)">Tentar de novo</button></div>`;
    return;
  }
  if (!document.getElementById('cmvAbaBody') || _cmvAba !== 'consumo') return;
  _csRender();
}

function _csLinhas() {
  const r = _csDados, f = _csFil, lim = _csAlertaPct();
  const q = f.q.trim().toLowerCase();
  return r.itens
    .filter(x => !f.soCmv || x.noCmv)
    .filter(x => !f.tipo || (f.tipo === 'preparado' ? items.find(i => i.id === x.id)?.isProd : !items.find(i => i.id === x.id)?.isProd))
    .filter(x => !f.cat || (x.cat || 'Outros') === f.cat)
    .filter(x => !q || x.nome.toLowerCase().includes(q))
    .filter(x => x.digital > 0.0005 || (x.real !== null && Math.abs(x.real) > 0.0005))
    .map(x => {
      const pct = x.real !== null && x.digital > 0.0005 ? (x.real - x.digital) / x.digital * 100 : null;
      const alerta = x.debAuto && pct !== null && Math.abs(pct) > lim;
      return { ...x, pct, alerta };
    })
    .filter(x => !f.alertas || x.alerta)
    .sort((a, b) => {
      if (f.sort === 'nome') return a.nome.localeCompare(b.nome);
      if (f.sort === 'consumo') return (b.real ?? b.digital) * b.custo - (a.real ?? a.digital) * a.custo;
      // impacto: valor da diferença (ciclo fechado) ou consumo digital (em aberto)
      return r.temFim ? Math.abs(b.difV || 0) - Math.abs(a.difV || 0) : b.digitalV - a.digitalV;
    });
}

function _csRender() {
  const el = document.getElementById('cmvAbaBody');
  if (!el || !_csDados) return;
  const r = _csDados, f = _csFil, lim = _csAlertaPct();
  const ciclos = _ctgDados.ciclos;
  const linhas = _csLinhas();
  const todas = r.itens.filter(x => !f.soCmv || x.noCmv);
  const nAlertas = _csDados.temFim ? todas.filter(x => {
    const p = x.real !== null && x.digital > 0.0005 ? (x.real - x.digital) / x.digital * 100 : null;
    return x.debAuto && p !== null && Math.abs(p) > lim;
  }).length : 0;
  const cats = [...new Set(todas.map(x => x.cat || 'Outros'))].sort();
  const soma = k => linhas.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const kpi = (t, v, sub, cor = 'var(--text)') => `<div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:14px 18px">
    <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${t}</div>
    <div style="font-size:var(--text-2xl);font-weight:800;color:${cor};margin-top:4px">${v}</div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${sub}</div></div>`;
  const chip = (on, onclick, txt, cor = 'var(--purple)', bg = 'var(--purple-xlight)') => `<button onclick="${onclick}" style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;
    border:1.5px solid ${on ? cor : 'var(--border)'};background:${on ? bg : 'var(--card-bg)'};color:${on ? cor : 'var(--text2)'}">${txt}</button>`;
  const th = (t, sort, al = 'right') => `<th ${sort ? `onclick="_csFil.sort='${sort}';_csRender()"` : ''} style="padding:10px 12px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:${f.sort === sort ? 'var(--purple)' : 'var(--muted)'};white-space:nowrap;${sort ? 'cursor:pointer' : ''}">${t}</th>`;
  const fmtPct = p => p === null ? '—' : `${p > 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const periodo = `${new Date(r.inicio).toLocaleDateString('pt-BR')} → ${r.fim ? new Date(r.fim).toLocaleDateString('pt-BR') : 'agora'}`;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_csCicloId=this.value;cmvRenderConsumo()">
        ${ciclos.map(c => `<option value="${c.id}"${c.id === _csCicloId ? ' selected' : ''}>${c.status === 'aberto' ? 'Ciclo atual (tempo real)' : 'Ciclo fechado'} · ${new Date(c.inicio).toLocaleDateString('pt-BR')} → ${c.fim ? new Date(c.fim).toLocaleDateString('pt-BR') : 'agora'}</option>`).join('')}
      </select>
      <span style="font-size:var(--text-sm);color:var(--muted)">${periodo}</span>
      <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);text-transform:none;letter-spacing:0;font-weight:500">Alerta acima de
        <input class="inp" type="number" min="1" step="1" value="${lim}" style="width:64px;text-align:right" onchange="_csSetAlerta(this.value)">%</label>
      <button class="btn btn-ghost btn-sm" onclick="cmvRenderConsumo(true)" title="Recalcular">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    ${!r.temFim ? `<div style="display:flex;gap:8px;padding:10px 14px;border-radius:var(--r8);background:var(--info-bg);color:var(--info-fg);font-size:var(--text-sm);line-height:1.5;margin-bottom:14px">${lc('info', 14, 'currentColor')}
      <div>Ciclo em aberto: mostrando o consumo <strong>digital</strong> em tempo real (vendas + saídas). O consumo <strong>real</strong> e as inconformidades aparecem quando o ciclo for concluído com a contagem de fechamento.</div></div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">
      ${kpi('Consumo digital', _estR(soma('digitalV')), 'vendas pela ficha + saídas, a custo')}
      ${kpi('Consumo real', r.temFim ? _estR(soma('realV')) : '—', r.temFim ? 'inicial + entradas − final, a custo' : 'aguardando fechamento')}
      ${kpi('Diferença', r.temFim ? _estR(soma('difV')) : '—', 'real − digital', r.temFim && Math.abs(soma('difV')) > 0.005 ? 'var(--danger-fg)' : 'var(--text)')}
      ${kpi('Itens em alerta', r.temFim ? nAlertas : '—', `diferença acima de ${lim}%`, nAlertas ? 'var(--danger-fg)' : 'var(--text)')}
    </div>
    <div class="card" style="margin:0">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1.5px solid var(--border)">
        <input class="inp" id="csBusca" placeholder="Buscar insumo…" value="${_estEsc(f.q)}" style="flex:1;min-width:180px;max-width:280px"
          oninput="_csFil.q=this.value;clearTimeout(window._csQT);window._csQT=setTimeout(()=>{_csRender();const b=document.getElementById('csBusca');b.focus();b.setSelectionRange(b.value.length,b.value.length)},200)">
        <select class="inp" style="width:auto" onchange="_csFil.cat=this.value;_csRender()">
          <option value="">Todas as categorias</option>${cats.map(c => `<option value="${_estEsc(c)}"${f.cat === c ? ' selected' : ''}>${_estEsc(c)}</option>`).join('')}
        </select>
        ${chip(!f.tipo, `_csFil.tipo='';_csRender()`, 'Todos')}
        ${chip(f.tipo === 'insumo', `_csFil.tipo='insumo';_csRender()`, 'Insumos')}
        ${chip(f.tipo === 'preparado', `_csFil.tipo='preparado';_csRender()`, 'Processados')}
        ${r.temFim ? chip(f.alertas, `_csFil.alertas=!_csFil.alertas;_csRender()`, `${lc('alert-triangle', 12, 'currentColor')} Só alertas (${nAlertas})`, 'var(--danger-fg)', 'var(--danger-bg)') : ''}
        <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);text-transform:none;letter-spacing:0;font-weight:500;cursor:pointer">
          <input type="checkbox" ${f.soCmv ? 'checked' : ''} onchange="_csFil.soCmv=this.checked;_csRender()" style="accent-color:var(--purple)"> Só o que entra no CMV</label>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>
          ${th('Item', 'nome', 'left')}${th('Digital')}${th('Real')}${th('Diferença')}${th('Dif. %')}${th('Valor da dif.', 'impacto')}${th('Custo un.')}${th('Consumo R$', 'consumo')}
        </tr></thead>
        <tbody>${linhas.length ? linhas.map(x => {
          const u = _estEsc(x.unid || '');
          const it = items.find(i => i.id === x.id);
          return `<tr onclick="cmvDetalheInsumo(${x.id})" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
            <td style="padding:10px 12px">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-weight:600">${_estEsc(x.nome)}</span>
                ${it?.isProd ? '<span class="badge b-purple" style="font-size:var(--text-2xs)">Processado</span>' : ''}
                ${x.alerta ? `<span class="badge b-red" style="font-size:var(--text-2xs)">${lc('alert-triangle', 10, 'currentColor')} Alerta</span>` : ''}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(x.cat || '')}${x.debAuto ? '' : ' · sem débito automático (consumo só pela contagem)'}</div></td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap">${_estQ(x.digital)} ${u}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap">${x.real !== null ? `${_estQ(x.real)} ${u}` : '<span style="color:var(--muted)">—</span>'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;font-weight:700;color:${x.dif > 0.0005 ? 'var(--danger-fg)' : x.dif < -0.0005 ? 'var(--warning-fg)' : 'var(--text2)'}">${x.dif !== null ? `${x.dif > 0 ? '+' : ''}${_estQ(x.dif)} ${u}` : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:${x.alerta ? 'var(--danger-fg)' : 'var(--text2)'};font-weight:${x.alerta ? 700 : 400}">${fmtPct(x.pct)}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap">${x.difV !== null ? _estR(x.difV) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;color:var(--text2)">${x.custo ? _estR(x.custo) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;white-space:nowrap;font-weight:700">${_estR((x.real ?? x.digital) * x.custo)}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted)">Nenhum item com esses filtros</td></tr>`}</tbody>
      </table></div>
      <div style="padding:10px 16px;border-top:1.5px solid var(--border);font-size:var(--text-xs);color:var(--muted);line-height:1.5">
        Diferença positiva = saiu mais do que as vendas e saídas explicam (ficha pesando menos que o real, porção acima, perda não lançada). Negativa = sobrou. Clique no item para ver a variação de preço e de consumo.</div>
    </div>`;
}

// ── Detalhe do item: variação de preço (compras) e de consumo (ciclos) ──

async function cmvDetalheInsumo(itemId) {
  const it = items.find(i => i.id === itemId);
  if (!it) return;
  const u = _estEsc(it.unit || 'un');
  const umAno = new Date(); umAno.setFullYear(umAno.getFullYear() - 1);
  const compras = (typeof priceHistory !== 'undefined' ? priceHistory : [])
    .filter(p => p.itemId === itemId && p.precoUnit > 0 && p.data && new Date(p.data) >= umAno)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const precos = compras.map(p => Number(p.precoUnit));
  const media = precos.length ? precos.reduce((s, v) => s + v, 0) / precos.length : null;
  const varAno = precos.length > 1 ? (precos[precos.length - 1] - precos[0]) / precos[0] * 100 : null;
  const fmtPct = p => p === null ? '—' : `${p > 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const kpi = (t, v, cor = 'var(--text)') => `<div class="fm-box"><div style="font-size:var(--text-xs);color:var(--fg-muted)">${t}</div><div style="font-size:var(--text-lg);font-weight:800;color:${cor}">${v}</div></div>`;

  _estModal('ovCmvItem', _estEsc(it.name), `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
      ${kpi('Custo atual', it.cost ? `${_estR(it.cost)}/${u}` : '—')}
      ${kpi('Menor preço (12 meses)', precos.length ? _estR(Math.min(...precos)) : '—', 'var(--success-fg)')}
      ${kpi('Maior preço (12 meses)', precos.length ? _estR(Math.max(...precos)) : '—', 'var(--danger-fg)')}
      ${kpi('Preço médio', media !== null ? _estR(media) : '—')}
      ${kpi('Variação no período', fmtPct(varAno), varAno > 0 ? 'var(--danger-fg)' : varAno < 0 ? 'var(--success-fg)' : 'var(--text)')}
    </div>
    <div>
      <div style="font-size:var(--text-md);font-weight:700;margin-bottom:6px">Variação de preço · compras dos últimos 12 meses</div>
      ${compras.length ? `<div style="height:200px"><canvas id="cmvItemPreco"></canvas></div>` : `<div class="fm-box" style="font-size:var(--text-sm);color:var(--fg-muted)">Nenhuma compra registrada com preço nos últimos 12 meses.</div>`}
    </div>
    <div>
      <div style="font-size:var(--text-md);font-weight:700;margin-bottom:6px">Variação de consumo · ciclos</div>
      <div id="cmvItemConsumo" class="fm-box" style="font-size:var(--text-sm);color:var(--fg-muted)">${lc('refresh-cw', 13, 'currentColor')} Calculando…</div>
    </div>
    ${compras.length ? `<div class="fm-lista">
      <div class="fm-lista-h"><span>Compras</span><span>Preço</span></div>
      ${[...compras].reverse().slice(0, 12).map(p => `<div class="fm-lista-l"><span style="flex:1">${typeof cpDataBr === 'function' ? cpDataBr(String(p.data).slice(0, 10)) : p.data} · ${_estEsc(p.fornecedorNome || '—')}</span><strong>${_estR(p.precoUnit)}/${u}</strong></div>`).join('')}
    </div>` : ''}`,
    `document.getElementById('ovCmvItem').remove()`, 'Fechar', 760, `${_estEsc(it.cat || '')} · ${it.isProd ? 'Processado' : 'Insumo'}`);
  const cancelar = document.querySelector('#ovCmvItem .fm-foot .btn-outline'); if (cancelar) cancelar.style.display = 'none';

  if (compras.length) _cmvChart('cmvItemPreco', {
    type: 'line',
    data: { labels: compras.map(p => new Date(String(p.data).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      datasets: [{ label: `R$/${it.unit || 'un'}`, data: precos, borderColor: _cmvCor('--chart-1', '#6B21D4'), backgroundColor: _cmvCor('--chart-1', '#6B21D4'), tension: .25, pointRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => _estR(c.parsed.y) } } },
      scales: { y: { ticks: { callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } } } },
  });

  // Consumo por ciclo: real × digital (últimos 8 ciclos)
  try {
    if (!_ctgDados) await _ctgCarregar();
    const ciclos = [..._ctgDados.ciclos].sort((a, b) => _estMs(a.inicio) - _estMs(b.inicio)).slice(-8);
    const pts = [];
    for (const ci of ciclos) {
      const r = _cmvCache[ci.id] && ci.status !== 'aberto' ? _cmvCache[ci.id] : (_cmvCache[ci.id] = await estCalcularCMV(ci, _ctgDados.contagens));
      const x = r.itens.find(i => i.id === itemId);
      pts.push({ label: new Date(ci.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + (ci.status === 'aberto' ? ' (atual)' : ''), real: x?.real ?? null, digital: x?.digital ?? 0 });
    }
    const box = document.getElementById('cmvItemConsumo');
    if (!box) return;
    if (!pts.length) { box.textContent = 'Nenhum ciclo ainda.'; return; }
    box.outerHTML = `<div style="height:200px"><canvas id="cmvItemCons"></canvas></div>`;
    _cmvChart('cmvItemCons', {
      type: 'bar',
      data: { labels: pts.map(p => p.label), datasets: [
        { label: `Real (${it.unit || 'un'})`, data: pts.map(p => p.real), backgroundColor: _cmvCor('--chart-3', '#F5A800'), borderRadius: 3 },
        { label: `Digital (${it.unit || 'un'})`, data: pts.map(p => +p.digital.toFixed(3)), backgroundColor: _cmvCor('--chart-1', '#6B21D4'), borderRadius: 3 },
      ] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } } },
    });
  } catch (e) {
    const box = document.getElementById('cmvItemConsumo');
    if (box) box.textContent = 'Não consegui calcular o consumo: ' + e.message;
  }
}

/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-cmv.js — CMV real e GAP por ciclo (módulo CMV › aba "CMV do ciclo")
 *
 *   CMV real     = estoque inicial + compras − estoque final      (R$)
 *   CMV teórico  = vendas do período × fichas técnicas (débito automático)
 *   Perdas       = baixas registradas no período
 *   GAP          = CMV real − CMV teórico − perdas   → o que ninguém explicou
 *
 * Só entram as categorias marcadas como "Entra no CMV" (escritório, higiene e
 * descartáveis ficam fora — ver estCatsForaCMV).
 *
 * Estoque inicial: contagem de abertura (1º ciclo) ou o fechamento do ciclo
 * anterior (contagens de ciclo aprovadas com data = início do ciclo).
 * Estoque final: contagens de fechamento do ciclo, aprovadas.
 * Valores pelo custo congelado na contagem (custo_unit do item contado) e,
 * nas compras, pelo custo da nota.
 * Faturamento: soma de cw_pedidos.total (mesma fonte do Dashboard e do Vendas).
 */

let _cmvCicloId = null;
let _cmvCache = {};   // cicloId → resultado

async function _cmvFaturamento(inicioISO, fimISO) {
  const PAGE = 1000; let total = 0, pedidos = 0;
  for (let from = 0; ; from += PAGE) {
    let q = _estSb().from('cw_pedidos').select('total, status').gt('cw_created_at', inicioISO).order('id').range(from, from + PAGE - 1);
    if (fimISO) q = q.lte('cw_created_at', fimISO);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const p of (data || [])) {
      if (p.status === 'canceling' || p.status === 'canceled') continue;
      total += Number(p.total) || 0; pedidos++;
    }
    if (!data || data.length < PAGE) break;
  }
  return { total, pedidos };
}

async function _cmvItensDasContagens(ids) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(...await _estSelectTodos(() => _estSb().from('est_contagem_itens')
      .select('item_id, item_nome, unidade, categoria, contado, custo_unit, debito_auto').in('contagem_id', ids.slice(i, i + 200)).not('contado', 'is', null).is('removido_em', null)));
  }
  return out;
}

async function estCalcularCMV(ciclo, contagens) {
  const fora = estCatsForaCMV();
  const noCmv = cat => estCatNoCMV(cat, fora);
  const inicio = ciclo.inicio;
  const ate = ciclo.fim || null;
  const concl = contagens.filter(c => c.status === 'aplicada' && c.tipo_id === 'cmv');
  // Abertura: contagens de ciclo aprovadas no instante de início do ciclo
  const abertura = concl.filter(c => Math.abs(_estMs(c.data_ref) - _estMs(inicio)) < 1000);
  const fechamento = concl.filter(c => c.ciclo_id === ciclo.id && c.fecha_ciclo);
  const fimReal = ate || (fechamento.length ? fechamento.map(c => c.data_ref).sort((a, b) => _estMs(b) - _estMs(a))[0] : null);
  const fimConsulta = fimReal || new Date().toISOString();

  const [itensIni, itensFim, movs, debitos, fat] = await Promise.all([
    _cmvItensDasContagens(abertura.map(c => c.id)),
    _cmvItensDasContagens(fechamento.map(c => c.id)),
    estBuscarMovimentacoes({ desde: inicio, ate: fimConsulta }),
    estBuscarDebitos(inicio, fimConsulta),
    _cmvFaturamento(inicio, fimConsulta),
  ]);

  // Por item: quantidades e valores
  const porItem = new Map();
  const reg = (id, nome, cat, unid) => {
    if (!porItem.has(id)) {
      const it = items.find(i => i.id === id);
      porItem.set(id, { id, nome: nome || it?.name || '—', cat: cat ?? it?.cat, unid: unid || it?.unit || '',
        debAuto: false, ini: 0, iniV: 0, fim: 0, fimV: 0, compras: 0, comprasV: 0, producao: 0,
        vendas: 0, vendasV: 0, perdas: 0, perdasV: 0, custo: it?.cost || 0 });
    }
    return porItem.get(id);
  };
  for (const x of itensIni) { const r = reg(x.item_id, x.item_nome, x.categoria, x.unidade); r.ini += +x.contado; r.iniV += x.contado * (x.custo_unit || 0); }
  for (const x of itensFim) { const r = reg(x.item_id, x.item_nome, x.categoria, x.unidade); r.fim += +x.contado; r.fimV += x.contado * (x.custo_unit || 0); }
  for (const m of movs) {
    if (_estMs(m.data_mov) <= _estMs(inicio)) continue;
    const r = reg(m.item_id, m.item_nome, m.categoria, m.unidade);
    const v = (Number(m.qtd) || 0) * (Number(m.custo_unit) || 0);
    if (m.tipo === 'recebimento' || m.tipo === 'compra_avulsa') { r.compras += +m.qtd; r.comprasV += v; }
    else if (m.tipo === 'producao') { r.producao += +m.qtd; }
    else if (m.tipo === 'baixa') { r.perdas += +m.qtd; r.perdasV += v; }
  }
  for (const p of debitos) {
    for (const [id, q] of Object.entries(p.itens)) {
      const r = reg(Number(id));
      r.vendas += q; r.vendasV += q * r.custo; r.debAuto = true;
    }
  }

  const lista = [...porItem.values()].filter(r => noCmv(r.cat));
  const soma = k => lista.reduce((s, r) => s + (r[k] || 0), 0);
  const ei = soma('iniV'), compras = soma('comprasV'), ef = soma('fimV');
  const teorico = soma('vendasV'), perdas = soma('perdasV');
  const temIni = abertura.length > 0, temFim = fechamento.length > 0;
  const real = temIni && temFim ? ei + compras - ef : null;
  const gap = real !== null ? real - teorico - perdas : null;

  // Itens com débito automático: consumo real × teórico (só quando há EI e EF)
  const divergencias = temIni && temFim ? lista.filter(r => r.debAuto).map(r => {
    const consumo = r.ini + r.compras + r.producao - r.fim;
    const dif = consumo - r.vendas - r.perdas;
    return { ...r, consumo, dif, difV: dif * r.custo };
  }).filter(r => Math.abs(r.dif) > 0.0005).sort((a, b) => Math.abs(b.difV) - Math.abs(a.difV)) : [];

  // Top consumo real (R$) — todos os itens do CMV
  const consumoTop = temIni && temFim ? lista.map(r => ({ ...r, consumoV: r.iniV + r.comprasV - r.fimV }))
    .filter(r => r.consumoV > 0.005).sort((a, b) => b.consumoV - a.consumoV).slice(0, 10) : [];

  // Todos os itens com movimento: consumo real (contagem) × digital (vendas + saídas)
  const itens = [...porItem.values()].map(r => {
    const real = temIni && temFim ? r.ini + r.compras + r.producao - r.fim : null;
    const digital = r.vendas + r.perdas;
    return { ...r, noCmv: noCmv(r.cat), real, realV: real !== null ? real * r.custo : null, digital, digitalV: digital * r.custo,
      dif: real !== null ? real - digital : null, difV: real !== null ? (real - digital) * r.custo : null };
  });

  return {
    ciclo, inicio, fim: fimReal, aberto: !fimReal, temIni, temFim, aberturaCount: abertura.length, itens,
    ei, compras, ef, real, teorico, perdas, gap, fat: fat.total, pedidos: fat.pedidos,
    divergencias, consumoTop, custos: _cmvVariacaoCustos(inicio, fimReal), geradoEm: new Date().toISOString(),
  };
}

// ── Render ─────────────────────────────────────────────────────

async function estRenderAbaCMV(forcar = false) {
  const el = document.getElementById('cmvAbaBody');
  if (!el) return;
  try {
    if (!_ctgDados || forcar) await _ctgCarregar();
  } catch (e) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar os ciclos: ${_estEsc(e.message)}</div>`;
    return;
  }
  const ciclos = _ctgDados.ciclos;
  if (!ciclos.length) {
    el.innerHTML = `<div class="card" style="padding:40px;text-align:center">
      <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:6px">Nenhum ciclo ainda</div>
      <div style="font-size:var(--text-md);color:var(--text2);max-width:560px;margin:0 auto 16px;line-height:1.5">
        O CMV real precisa de duas contagens: a de abertura (estoque inicial) e a de fechamento (estoque final). Comece pela contagem de abertura na aba Contagem.</div>
      <button class="btn btn-primary" onclick="_estCpAba='contagens';goModule('estoque')">Ir para Contagem</button></div>`;
    return;
  }
  if (!_cmvCicloId || !ciclos.some(c => c.id === _cmvCicloId)) _cmvCicloId = ciclos[0].id;
  const ciclo = ciclos.find(c => c.id === _cmvCicloId);

  if (!_cmvCache[ciclo.id] || forcar || ciclo.status === 'aberto') {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">
      ${lc('refresh-cw', 16, 'currentColor')} Calculando o CMV do ciclo…</div>`;
    try { _cmvCache[ciclo.id] = await estCalcularCMV(ciclo, _ctgDados.contagens); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui calcular o CMV: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="estRenderAbaCMV(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cmvAbaBody')) return;
  _cmvRender(_cmvCache[ciclo.id]);
}

function _cmvRender(r) {
  const el = document.getElementById('cmvAbaBody');
  const ciclos = _ctgDados.ciclos;
  const pct = (v, base) => base > 0 && v !== null ? (v / base * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
  const meta = (typeof _vdMetaCMV !== 'undefined' ? _vdMetaCMV : 30);
  const card = (titulo, valor, sub, cor = 'var(--text)', destaque = false) => `
    <div style="background:${destaque ? 'var(--purple-xlight)' : 'var(--card-bg)'};border:1.5px solid ${destaque ? 'var(--purple)' : 'var(--card-border)'};border-radius:var(--r12);padding:14px 18px">
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${titulo}</div>
      <div style="font-size:var(--text-2xl);font-weight:800;color:${cor};margin-top:4px">${valor}</div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px;line-height:1.4">${sub}</div>
    </div>`;
  const nd = '<span style="color:var(--muted)">—</span>';
  const cmvPct = r.real !== null && r.fat > 0 ? r.real / r.fat * 100 : null;
  const teoPct = r.fat > 0 ? r.teorico / r.fat * 100 : null;

  const periodo = `${new Date(r.inicio).toLocaleDateString('pt-BR')} → ${r.fim ? new Date(r.fim).toLocaleDateString('pt-BR') : 'em aberto'}`;
  let aviso = '';
  if (!r.temIni) aviso = 'A contagem de abertura deste ciclo ainda não foi aprovada — sem estoque inicial, não dá pra calcular o CMV real.';
  else if (!r.temFim) aviso = 'Ciclo em aberto — CMV real, estoque final e GAP só aparecem depois da contagem de fechamento aprovada. Por enquanto: estoque inicial, compras, faturamento, CMV teórico e perdas.';

  const th = (t, a = 'right') => `<th style="padding:9px 12px;text-align:${a};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${t}</th>`;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_cmvCicloId=this.value;estRenderAbaCMV()">
        ${ciclos.map(c => `<option value="${c.id}"${c.id === _cmvCicloId ? ' selected' : ''}>Ciclo ${new Date(c.inicio).toLocaleDateString('pt-BR')} → ${c.fim ? new Date(c.fim).toLocaleDateString('pt-BR') : 'em aberto'}</option>`).join('')}
      </select>
      <span style="font-size:var(--text-sm);color:var(--muted)">${r.pedidos} pedidos · só categorias que entram no CMV</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="estRenderAbaCMV(true)" title="Recalcular">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    ${aviso ? `<div style="display:flex;gap:8px;padding:10px 14px;border-radius:var(--r8);background:var(--warning-bg);color:var(--warning-fg);font-size:var(--text-sm);line-height:1.5;margin-bottom:14px">${lc('info', 14, 'currentColor')}<div>${aviso}</div></div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:12px">
      ${card('CMV real %', cmvPct !== null ? pct(r.real, r.fat) : nd, `meta ${meta}% · teórico ${teoPct !== null ? pct(r.teorico, r.fat) : '—'}`, cmvPct === null ? 'var(--text)' : cmvPct > meta ? 'var(--danger-fg)' : 'var(--success-fg)', true)}
      ${card('Faturamento do ciclo', _estR(r.fat), `cw_pedidos · ${periodo}`)}
      ${card('CMV real', r.real !== null ? _estR(r.real) : nd, 'estoque inicial + compras − estoque final')}
      ${card('CMV teórico', _estR(r.teorico), 'vendas × fichas técnicas')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:12px">
      ${card('Estoque inicial', r.temIni ? _estR(r.ei) : nd, r.temIni ? `${r.aberturaCount} local(is) contado(s)` : 'contagem de abertura pendente')}
      ${card('Compras', _estR(r.compras), 'recebimentos no ciclo')}
      ${card('Estoque final', r.temFim ? _estR(r.ef) : nd, r.temFim ? 'contagem de fechamento' : 'aguardando fechamento')}
      ${card('Perdas registradas', _estR(r.perdas), `${pct(r.perdas, r.fat)} do faturamento · baixas`, 'var(--danger-fg)')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:18px">
      ${card('GAP não explicado', r.gap !== null ? _estR(r.gap) : nd, 'CMV real − teórico − perdas', r.gap === null ? 'var(--text)' : Math.abs(r.gap) > 0.005 ? 'var(--danger-fg)' : 'var(--success-fg)', true)}
      ${card('GAP %', r.gap !== null ? pct(r.gap, r.fat) : nd, 'do faturamento — ficha errada, porcionamento ou perda não registrada')}
    </div>

    ${r.divergencias.length ? `<div class="card" style="margin-bottom:16px">
      <div style="padding:14px 16px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-lg);font-weight:800">Onde está o GAP</div>
        <div style="font-size:var(--text-sm);color:var(--text2);margin-top:2px">Itens com débito automático: o que saiu de verdade (inicial + entradas − final) contra o que as vendas e as baixas explicam.</div>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>${th('Item', 'left')}${th('Consumo real')}${th('Vendas (ficha)')}${th('Baixas')}${th('Diferença')}${th('Valor')}</tr></thead>
        <tbody>${r.divergencias.slice(0, 30).map(x => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:9px 12px">${_estEsc(x.nome)}<div style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(x.cat || '')}</div></td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estQ(x.consumo)} ${_estEsc(x.unid)}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estQ(x.vendas)} ${_estEsc(x.unid)}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estQ(x.perdas)} ${_estEsc(x.unid)}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap;font-weight:700;color:${x.dif > 0 ? 'var(--danger-fg)' : 'var(--warning-fg)'}">${x.dif > 0 ? '+' : '−'}${_estQ(Math.abs(x.dif))} ${_estEsc(x.unid)}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estR(x.difV)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div style="padding:10px 16px;font-size:var(--text-xs);color:var(--muted);border-top:1.5px solid var(--border)">Diferença positiva = saiu mais do que as vendas explicam (ficha pesando menos que o real, porção acima, perda não registrada). Negativa = sobrou (ficha pesando mais que o real).</div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px;margin-bottom:14px">
      <div class="card" style="margin:0;padding:16px 18px">
        <div style="font-size:var(--text-lg);font-weight:800">Top 5 itens consumidos</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin:2px 0 10px">${r.temFim ? 'Consumo real do ciclo (contagem), em R$' : 'Consumo digital até agora (vendas + saídas), em R$'}</div>
        <div style="height:220px"><canvas id="cmvTopChart"></canvas></div>
      </div>
      <div class="card" style="margin:0;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div><div style="font-size:var(--text-lg);font-weight:800">Linha do tempo do CMV</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Real por ciclo fechado · projetado por semana (vendas × fichas)</div></div>
          <select class="inp" style="width:auto;font-size:var(--text-sm)" onchange="_cmvLtMeses=+this.value;_cmvDesenharLinhaTempo()">
            ${[1, 3, 6, 12].map(m => `<option value="${m}"${m === _cmvLtMeses ? ' selected' : ''}>Últimos ${m} ${m === 1 ? 'mês' : 'meses'}</option>`).join('')}
          </select>
        </div>
        <div style="height:220px;margin-top:10px"><canvas id="cmvLinhaChart"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px">
      ${_cmvTabelaCustos('Maiores aumentos de custo no ciclo', r.custos.aumentos, 'var(--danger-fg)')}
      ${_cmvTabelaCustos('Maiores reduções de custo no ciclo', r.custos.reducoes, 'var(--success-fg)')}
    </div>`;
  _cmvDesenharTop(r);
  _cmvDesenharLinhaTempo();
}

// ── Painéis do ciclo ──────────────────────────────────────────

let _cmvLtMeses = 3;
let _cmvCharts = {};

// Custo de cada item no início do ciclo × no fim (ou agora), pelas compras
// registradas (histórico de preços). Só itens que entram no CMV.
function _cmvVariacaoCustos(inicioISO, fimISO) {
  const fora = estCatsForaCMV();
  const ph = typeof priceHistory !== 'undefined' ? priceHistory : [];
  const ini = (inicioISO || '').slice(0, 10), fim = (fimISO || new Date().toISOString()).slice(0, 10);
  const porItem = {};
  for (const p of ph) { if (p.itemId != null && p.precoUnit > 0 && p.data) (porItem[p.itemId] ||= []).push(p); }
  const linhas = [];
  for (const [id, ps] of Object.entries(porItem)) {
    const it = items.find(i => i.id === Number(id));
    if (!it || !estItemNoCMV(it, fora)) continue;
    ps.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const antes = [...ps].reverse().find(p => String(p.data).slice(0, 10) < ini);
    const depois = [...ps].reverse().find(p => String(p.data).slice(0, 10) <= fim && String(p.data).slice(0, 10) >= ini);
    if (!antes || !depois) continue;
    const de = Number(antes.precoUnit), para = Number(depois.precoUnit);
    if (!(de > 0) || Math.abs(para - de) < 0.005) continue;
    linhas.push({ id: it.id, nome: it.name, de, para, pct: (para - de) / de * 100 });
  }
  return {
    aumentos: linhas.filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 5),
    reducoes: linhas.filter(x => x.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 5),
  };
}

function _cmvTabelaCustos(titulo, lista, cor) {
  const th = (t, a = 'right') => `<th style="padding:9px 12px;text-align:${a};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap">${t}</th>`;
  return `<div class="card" style="margin:0">
    <div style="padding:14px 16px;font-size:var(--text-lg);font-weight:800">${titulo}</div>
    <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
      <thead><tr style="border-top:1px solid var(--border)">${th('Produto', 'left')}${th('Custo anterior')}${th('Custo atual')}${th('Variação')}</tr></thead>
      <tbody>${lista.length ? lista.map(x => `<tr style="border-top:1px solid var(--border);cursor:pointer" onclick="cmvDetalheInsumo(${x.id})">
        <td style="padding:10px 12px;font-weight:600">${_estEsc(x.nome)}</td>
        <td style="padding:10px 12px;text-align:right;color:var(--text2)">${_estR(x.de)}</td>
        <td style="padding:10px 12px;text-align:right">${_estR(x.para)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:${cor}">${x.pct > 0 ? '+' : ''}${x.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td></tr>`).join('')
        : `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--muted);border-top:1px solid var(--border)">Sem compras com preço diferente no ciclo</td></tr>`}</tbody>
    </table></div>`;
}

function _cmvChart(id, cfg) {
  if (typeof Chart === 'undefined') return;
  const cv = document.getElementById(id);
  if (!cv) return;
  _cmvCharts[id]?.destroy();
  _cmvCharts[id] = new Chart(cv, cfg);
}
const _cmvCor = (v, def) => getComputedStyle(document.body).getPropertyValue(v).trim() || def;

function _cmvDesenharTop(r) {
  const val = x => r.temFim ? (x.realV || 0) : x.digitalV;
  const top = r.itens.filter(x => x.noCmv && val(x) > 0.005).sort((a, b) => val(b) - val(a)).slice(0, 5);
  if (!top.length) {
    const cv = document.getElementById('cmvTopChart');
    if (cv) cv.parentElement.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:var(--text-sm)">Nenhum consumo no ciclo ainda</div>`;
    return;
  }
  _cmvChart('cmvTopChart', {
    type: 'bar',
    data: { labels: top.map(x => x.nome), datasets: [{ data: top.map(x => +val(x).toFixed(2)), backgroundColor: _cmvCor('--chart-1', '#6B21D4'), borderRadius: 4 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => _estR(c.parsed.x) } } },
      scales: { x: { ticks: { callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } },
  });
}

// Linha do tempo: CMV real (ciclos fechados) × projetado por semana
async function _cmvDesenharLinhaTempo() {
  if (!document.getElementById('cmvLinhaChart')) return;
  const fim = new Date();
  const ini = new Date(); ini.setMonth(ini.getMonth() - _cmvLtMeses); ini.setHours(0, 0, 0, 0);
  // semanas começando na segunda
  const seg = d => { const x = new Date(d); const w = x.getDay(); x.setDate(x.getDate() - (w === 0 ? 6 : w - 1)); x.setHours(0, 0, 0, 0); return x; };
  const semanas = [];
  for (let d = seg(ini); d <= fim; d = new Date(d.getTime() + 7 * 864e5)) semanas.push(d);
  let linhas = [];
  try { linhas = await vendasCarregarPeriodo(semanas[0].toISOString(), fim.toISOString()); } catch (e) { console.warn('[cmv] linha do tempo:', e.message); }
  const proj = semanas.map((s, i) => {
    const prox = semanas[i + 1] || new Date(fim.getTime() + 1);
    const ls = linhas.filter(l => _estMs(l.ts) >= s.getTime() && _estMs(l.ts) < prox.getTime());
    const c = vendasPorCategoria(ls);
    let rec = 0, cus = 0; Object.values(c).forEach(x => { rec += x.receita; cus += x.custo; });
    return rec > 0 ? +(cus / rec * 100).toFixed(1) : null;
  });
  // Real: cada ciclo fechado cai na semana em que fechou
  const real = semanas.map(() => null);
  for (const ci of (_ctgDados?.ciclos || []).filter(c => c.status === 'fechado' && c.fim && _estMs(c.fim) >= semanas[0].getTime())) {
    try {
      const r = _cmvCache[ci.id] || (_cmvCache[ci.id] = await estCalcularCMV(ci, _ctgDados.contagens));
      if (r.real === null || !(r.fat > 0)) continue;
      const k = semanas.findIndex((s, i) => _estMs(ci.fim) >= s.getTime() && (!semanas[i + 1] || _estMs(ci.fim) < semanas[i + 1].getTime()));
      if (k >= 0) real[k] = +(r.real / r.fat * 100).toFixed(1);
    } catch (e) { console.warn('[cmv] ciclo', ci.id, e.message); }
  }
  const meta = typeof _vdMetaCMV !== 'undefined' ? _vdMetaCMV : 30;
  _cmvChart('cmvLinhaChart', {
    type: 'line',
    data: {
      labels: semanas.map(s => s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      datasets: [
        { label: 'CMV real (ciclo)', data: real, borderColor: _cmvCor('--chart-3', '#F5A800'), backgroundColor: _cmvCor('--chart-3', '#F5A800'), spanGaps: true, pointRadius: 5, tension: .25 },
        { label: 'CMV projetado (semana)', data: proj, borderColor: _cmvCor('--chart-1', '#6B21D4'), backgroundColor: _cmvCor('--chart-1', '#6B21D4'), spanGaps: true, pointRadius: 2, tension: .25 },
        { label: `Meta ${meta}%`, data: semanas.map(() => meta), borderColor: _cmvCor('--muted', '#999'), borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
      ],
    },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => c.parsed.y === null ? '' : `${c.dataset.label}: ${c.parsed.y.toLocaleString('pt-BR')}%` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } } },
  });
}

/**
 * VTP Compras — Vai Ter Pizza!
 * cp-linha.js — Linha de item com embalagem (apresentação) e totais da nota.
 * Usada na Nova compra (aba Compras) e na Conferência (aba Recebimento).
 *
 * Linha: { item_id, ap: {nome, fator} | null, n, modo: 'unit'|'total', vUnit, vTotal, impNota }
 *   n      = quantidade na embalagem escolhida (2 caixas)
 *   vUnit  = R$ por embalagem (por caixa); vTotal = R$ da linha
 *   qtd    = n × fator, na unidade do insumo (50 kg)
 *
 * Totais da nota (Simples Nacional: ICMS comum já está no preço, não soma):
 *   IPI + ICMS ST + seguro + outras − desconto → rateados no custo dos itens
 *   (pelo valor de cada linha; do XML vem o valor exato de cada item).
 *   Frete NÃO entra no custo do insumo — só no total da compra.
 */

const CP_EXTRAS = [
  { k: 'ipi',      label: 'IPI' },
  { k: 'icms_st',  label: 'ICMS ST', dica: 'ICMS substituição tributária (campo "Valor do ICMS Substituição")' },
  { k: 'seguro',   label: 'Seguro' },
  { k: 'outras',   label: 'Outras desp.', dica: 'Outras despesas acessórias' },
  { k: 'desconto', label: 'Desconto', menos: true },
  { k: 'frete',    label: 'Frete', foraCusto: true },
];
// Celular: campos da linha em 2 colunas (insumo ocupa a linha toda)
if (!document.getElementById('cpLinhaCss')) {
  const st = document.createElement('style'); st.id = 'cpLinhaCss';
  st.textContent = '@media (max-width:640px){.cp-linha{grid-template-columns:1fr 1fr !important}.cp-linha>.field:first-child:nth-last-child(5){grid-column:1/-1}.cp-linha>.cp-emb{grid-column:1/-1}}';
  document.head.appendChild(st);
}
const cpExtrasVazio = () => ({ ipi: 0, icms_st: 0, seguro: 0, outras: 0, desconto: 0, frete: 0 });

// Aceita "4,2", "4.2" e "1.234,56"
const cpNum = v => { let t = String(v ?? '').trim(); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isNaN(n) ? null : n; };
const cpFmtNum = v => v === null || v === undefined || v === '' ? '' : String(Math.round(Number(v) * 10000) / 10000).replace('.', ',');
const _cpR2 = v => Math.round((Number(v) || 0) * 100) / 100;

// Opções de embalagem do insumo: unidade base + apresentações (+ a atual, se não estiver mais no cadastro)
function cpApOpcoes(item, atual) {
  const ops = [{ nome: null, fator: 1 }];
  for (const a of estApresentacoes(item)) ops.push({ nome: a.nome, fator: Number(a.qtd), padrao: !!a.padrao });
  if (atual?.fator > 0 && !ops.some(o => o.nome === atual.nome && Math.abs(o.fator - atual.fator) < 1e-6)) ops.push({ nome: atual.nome, fator: Number(atual.fator) });
  return ops;
}
// Embalagem inicial de uma linha: sempre a medida base (kg, L, un), exceto o insumo marcado
// "só se compra fechado" (bisnaga, lata, fardo…), que já vem na apresentação padrão ★
const cpApFechada = item => { if (!item?.soEmbalagem) return null; const aps = estApresentacoes(item); const p = aps.find(a => a.padrao) || aps[0]; return p ? { nome: p.nome, fator: Number(p.qtd) } : null; };
const cpApPadrao = item => cpApFechada(item);
// Embalagem que corresponde a um fator (ex.: 1 UN da nota = 1,7 kg → "Lata 1,7 kg")
function cpApDoFator(item, fator, unidNota) {
  if (!(fator > 0) || Math.abs(fator - 1) < 1e-6) return null;
  const a = estApresentacoes(item).find(x => Math.abs(Number(x.qtd) - fator) < 1e-6);
  return a ? { nome: a.nome, fator: Number(a.qtd) } : { nome: `${unidNota || 'Emb.'} ${_estQ(fator)} ${item?.unit || ''}`.trim(), fator };
}

// Quantidade, total e custo da linha (sem o rateio)
function cpLinhaCalc(l) {
  const f = l.ap?.fator > 0 ? Number(l.ap.fator) : 1;
  const n = Number(l.n) || 0;
  const qtd = n * f;
  const total = l.modo === 'total' ? (Number(l.vTotal) || 0) : n * (Number(l.vUnit) || 0);
  return { f, n, qtd, total, precoAp: n > 0 ? total / n : (Number(l.vUnit) || 0), precoBase: qtd > 0 ? total / qtd : 0 };
}

// Rateio dos acréscimos da nota nas linhas válidas → Map(linha → acréscimo em R$)
function cpRatear(linhas, ex) {
  const val = linhas.filter(l => l.item_id && cpLinhaCalc(l).qtd > 0);
  const extras = (+ex.ipi || 0) + (+ex.icms_st || 0) + (+ex.seguro || 0) + (+ex.outras || 0) - (+ex.desconto || 0);
  const res = new Map();
  // Linhas do XML trazem o valor exato do item; o que sobrar vai, pelo valor, para as demais
  const temImp = l => l.impNota !== null && l.impNota !== undefined;
  const comImp = val.filter(temImp), semImp = val.filter(l => !temImp(l));
  const resto = extras - comImp.reduce((s, l) => s + (Number(l.impNota) || 0), 0);
  const usarXml = comImp.length && (semImp.length || Math.abs(resto) < 0.05);
  const alvo = usarXml ? semImp : val;
  const sobra = usarXml ? resto : extras;
  const base = alvo.reduce((s, l) => s + cpLinhaCalc(l).total, 0);
  for (const l of val) res.set(l, usarXml && temImp(l) ? Number(l.impNota) || 0 : base > 0 ? sobra * cpLinhaCalc(l).total / base : 0);
  return res;
}

// Resumo da compra: itens, acréscimos, frete, total (= o que a nota cobra)
function cpResumoNota(linhas, ex) {
  const val = linhas.filter(l => l.item_id && cpLinhaCalc(l).qtd > 0);
  const itens = val.reduce((s, l) => s + cpLinhaCalc(l).total, 0);
  const extras = (+ex.ipi || 0) + (+ex.icms_st || 0) + (+ex.seguro || 0) + (+ex.outras || 0) - (+ex.desconto || 0);
  return { itens: _cpR2(itens), extras: _cpR2(extras), frete: _cpR2(ex.frete), total: _cpR2(itens + extras + (+ex.frete || 0)) };
}

// Texto da conversão: "= 144 un · custo R$ 4,36/un · +R$ 3,20 de impostos rateados"
function cpConvTexto(l, acr = 0) {
  const it = items.find(i => i.id === l.item_id);
  if (!it) return '';
  const c = cpLinhaCalc(l), u = it.unit || 'un';
  if (!(c.qtd > 0)) return l.ap ? `1 ${_estEsc(l.ap.nome)} = ${_estQ(l.ap.fator)} ${_estEsc(u)}` : '';
  const partes = [`= <strong>${_estQ(c.qtd)} ${_estEsc(u)}</strong>`];
  if (c.total > 0) partes.push(`custo ${_estR((c.total + acr) / c.qtd)}/${_estEsc(u)}${Math.abs(acr) >= 0.005 ? ' com impostos' : ''}`);
  if (Math.abs(acr) >= 0.005) partes.push(`${acr > 0 ? '+' : '−'}${_estR(Math.abs(acr))} rateio da nota`);
  return partes.join(' · ');
}

// Campos da linha: [Insumo] · Embalagem · Qtd · Valor unitário · Total (os dois valores sempre
// visíveis e ligados: digita um, o outro é calculado). ns = prefixo dos handlers (ex.: '_cpNC').
function cpLinhaCamposHtml(l, idx, ns, { comItem = true } = {}) {
  const it = items.find(i => i.id === l.item_id);
  const ops = it ? cpApOpcoes(it, l.ap) : [{ nome: null, fator: 1 }];
  const sel = ops.findIndex(o => (o.nome || null) === (l.ap?.nome || null) && Math.abs(o.fator - (l.ap?.fator || 1)) < 1e-6);
  const u = it?.unit || 'un';
  const unid = l.ap ? l.ap.nome : u;
  const c = cpLinhaCalc(l);
  const vu = l.modo === 'total' ? (c.n > 0 ? c.total / c.n : null) : l.vUnit;
  const vt = l.modo === 'total' ? l.vTotal : (c.n > 0 && l.vUnit != null ? c.total : null);
  const lab = t => `<label style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t}</label>`;
  const din = (campo, val, ph, extra = '') => `<div style="position:relative"><span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--muted);pointer-events:none">R$</span>
    <input class="inp" id="${ns}${campo}${idx}" type="text" inputmode="decimal" value="${val == null || val === '' ? '' : cpFmtNum(Math.round(val * 100) / 100)}" placeholder="${ph}"
      style="text-align:right;font-weight:700;padding-left:30px;${extra}" oninput="${ns}Linha(${idx},'${campo}',this.value)"></div>`;
  return `<div class="cp-linha" style="display:grid;grid-template-columns:${comItem ? 'minmax(180px,1.6fr) ' : ''}minmax(150px,1.2fr) minmax(80px,.6fr) minmax(110px,.8fr) minmax(110px,.8fr);gap:10px;align-items:end">
    ${comItem ? `<div class="field" style="margin:0">${lab(`Insumo ${l.sugestao ? '<span style="color:var(--warning-fg);text-transform:none;letter-spacing:0">· sugestão, confira</span>' : l.memoria ? '<span style="color:var(--success-fg);text-transform:none;letter-spacing:0">· reconhecido</span>' : ''}`)}
      ${cpComboHtml(`cb${ns}${idx}`, { tipo: 'insumo', valor: l.item_id, ao: `${ns}Linha(${idx},'item',%v)` })}</div>` : ''}
    <div class="field cp-emb" style="margin:0">${lab('Embalagem')}
      <select class="inp" ${it ? '' : 'disabled'} onchange="${ns}Linha(${idx},'ap',this.value)">${ops.map((o, k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${o.nome ? (/\d/.test(o.nome) ? _estEsc(o.nome) : `${_estEsc(o.nome)} (${_estQ(o.fator)} ${_estEsc(u)})`) : `${_estEsc(u)} (unidade base)`}</option>`).join('')}</select></div>
    <div class="field" style="margin:0">${lab(`Qtd <span style="text-transform:none;letter-spacing:0;font-weight:500">(${_estEsc(unid)})</span>`)}
      <input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(l.n)}" style="text-align:right;font-weight:700" oninput="${ns}Linha(${idx},'n',this.value)"></div>
    <div class="field" style="margin:0"><label style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="R$ por ${_estEsc(unid)}">Valor unitário</label>${din('vu', vu, '0,00')}</div>
    <div class="field" style="margin:0">${lab('Total')}${din('vt', vt, '0,00')}</div>
  </div>
  <div id="${ns}Conv${idx}" style="font-size:var(--text-xs);color:var(--text2);margin-top:6px;min-height:14px"></div>`;
}

// Mantém unitário e total coerentes na tela sem redesenhar (o campo que a pessoa digita não é tocado)
function cpLinhaSincronizar(l, idx, ns, campoAtivo) {
  const c = cpLinhaCalc(l);
  const set = (campo, val) => { const el = document.getElementById(ns + campo + idx); if (el && campo !== campoAtivo) el.value = val == null || !isFinite(val) ? '' : cpFmtNum(Math.round(val * 100) / 100); };
  if (l.modo === 'total') set('vu', c.n > 0 ? c.total / c.n : null);
  else set('vt', c.n > 0 && l.vUnit != null ? c.total : null);
}

// Aplica uma mudança na linha. Devolve true quando precisa redesenhar a linha inteira.
function cpLinhaSet(l, campo, v) {
  if (campo === 'item') {
    l.item_id = +v || null; l.sugestao = false; l.memoria = false;
    const it = items.find(i => i.id === l.item_id);
    if (it && l.desc_nota) {   // linha da nota: a embalagem sai da unidade da nota (1 UN = Lata 1,7 kg)
      const f = cpFatorUnidadeNota(it, l.unid_nota);
      l.fator = f > 0 ? f : 1; l.ap = cpApDoFator(it, l.fator, l.unid_nota);
    } else if (it) l.ap = cpApPadrao(it);
    if (it && l.modo === 'unit' && !(l.vUnit > 0) && it.cost) l.vUnit = _estRound(it.cost * (l.ap?.fator || 1));
    return true;
  }
  if (campo === 'ap') {
    const it = items.find(i => i.id === l.item_id);
    const o = cpApOpcoes(it, l.ap)[+v] || { nome: null, fator: 1 };
    const antes = cpLinhaCalc(l);
    l.ap = o.nome ? { nome: o.nome, fator: o.fator } : null;
    // Mantém a quantidade real (kg) e o preço por kg; muda só a forma de ver
    if (antes.qtd > 0) l.n = _estRound(antes.qtd / o.fator);
    if (l.modo === 'unit' && antes.precoBase > 0) l.vUnit = Math.round(antes.precoBase * o.fator * 10000) / 10000;
    return true;
  }
  if (campo === 'modo') {
    const c = cpLinhaCalc(l);
    if (v === 'total' && l.modo !== 'total') l.vTotal = _cpR2(c.total) || null;
    if (v === 'unit' && l.modo !== 'unit') l.vUnit = c.n > 0 ? Math.round(c.total / c.n * 10000) / 10000 : l.vUnit;
    l.modo = v;
    return true;
  }
  if (campo === 'n') l.n = cpNum(v);
  if (campo === 'vu') { l.modo = 'unit'; l.vUnit = cpNum(v); }
  if (campo === 'vt') { l.modo = 'total'; l.vTotal = cpNum(v); }
  if (campo === 'v') { if (l.modo === 'total') l.vTotal = cpNum(v); else l.vUnit = cpNum(v); }
  return false;
}

// Bloco "Totais da nota" (impostos, frete, desconto) + conferência com o valor total da nota
function cpTotaisNotaHtml(ex, totalNota, ns, aberto = false) {
  return `<details class="cp-totais" ${aberto ? 'open' : ''} style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 14px;margin-top:12px;background:var(--card-bg)">
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:700">Impostos, frete e desconto da nota <span style="font-weight:400;color:var(--muted)">· rodapé "Cálculo do imposto"</span></summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px 12px;margin-top:10px;align-items:end">
      ${CP_EXTRAS.map(e => `<div class="field" style="margin:0"><label style="text-transform:none;letter-spacing:0;white-space:nowrap" ${e.dica ? `title="${e.dica}"` : ''}>${e.menos ? '− ' : ''}${e.label}</label>
        <input class="inp" type="text" inputmode="decimal" value="${ex[e.k] ? cpFmtNum(ex[e.k]) : ''}" placeholder="0,00" style="text-align:right" oninput="${ns}Extra('${e.k}',this.value)"></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-top:10px">
      <div style="font-size:var(--text-xs);color:var(--muted);line-height:1.5;flex:1;min-width:240px">O ICMS comum (Simples Nacional) já está no preço: não some. IPI, ICMS ST, seguro, outras despesas e desconto entram no custo dos itens (rateio). O frete entra só no total da compra.</div>
      <div class="field" style="margin:0;width:180px"><label style="text-transform:none;letter-spacing:0;font-weight:800;color:var(--text);white-space:nowrap">Valor total da nota</label>
        <input class="inp" type="text" inputmode="decimal" value="${totalNota ? cpFmtNum(totalNota) : ''}" placeholder="para conferir" style="text-align:right;font-weight:700" oninput="${ns}Extra('totalNota',this.value)"></div>
    </div>
  </details>`;
}

// Linha de totais (rodapé): itens + acréscimos + frete = total; compara com a nota
function cpTotaisResumoHtml(r, totalNota) {
  const dif = totalNota ? _cpR2(r.total - totalNota) : 0;
  return `<div style="display:flex;justify-content:flex-end;gap:18px;flex-wrap:wrap;font-size:var(--text-sm);color:var(--text2)">
      <span>Itens <strong style="color:var(--text)">${_estR(r.itens)}</strong></span>
      ${Math.abs(r.extras) >= 0.005 ? `<span>Impostos/desc. <strong style="color:var(--text)">${r.extras > 0 ? '+' : '−'}${_estR(Math.abs(r.extras))}</strong></span>` : ''}
      ${r.frete ? `<span>Frete <strong style="color:var(--text)">+${_estR(r.frete)}</strong></span>` : ''}
      <span style="font-size:var(--text-md)">Total <strong style="color:var(--text)">${_estR(r.total)}</strong></span>
    </div>
    ${totalNota ? `<div style="text-align:right;font-size:var(--text-xs);margin-top:4px;font-weight:700;color:${Math.abs(dif) < 0.05 ? 'var(--success-fg)' : 'var(--danger-fg)'}">
      ${Math.abs(dif) < 0.05 ? `✓ bate com o total da nota (${_estR(totalNota)})` : `Diferença de ${_estR(Math.abs(dif))} para o total da nota (${_estR(totalNota)}): ${dif > 0 ? 'lançado a mais' : 'falta lançar'}`}</div>` : ''}`;
}

// Linhas salvas em cp_compra_itens a partir das linhas da tela
function cpLinhasParaSalvar(linhas, ex, compraId, user) {
  const rat = cpRatear(linhas, ex);
  return [...rat.keys()].map(l => {
    const it = items.find(i => i.id === l.item_id);
    const c = cpLinhaCalc(l), acr = _cpR2(rat.get(l));
    return { compra_id: compraId, item_id: it.id, item_nome: it.name, unidade: it.unit || null, categoria: it.cat || null,
      qtd: _estRound(c.qtd), total: _cpR2(c.total), acrescimo: acr,
      preco_unit: c.qtd > 0 ? Math.round((c.total + acr) / c.qtd * 10000) / 10000 : 0,
      apresentacao: l.ap || null, fator: l.ap?.fator || 1,
      desc_nota: l.desc_nota || null, cod_nota: l.cod_nota || null, qtd_nota: l.qtd_nota ?? null, unid_nota: l.unid_nota || null, criado_por: user };
  });
}

// ══════════════════════════════════════════════════════════════
// CAMPO DE BUSCA (estilo Pinch): clica → abre busca + lista.
// tipo 'insumo' (só escolhe) ou 'fornecedor' (pode cadastrar na hora e,
// com avulso:true, usar um nome só nesta compra: mercado, presencial…).
// ao = JS executado ao escolher; %v vira o valor (id, ou "avulso:Nome").
// ══════════════════════════════════════════════════════════════

const _cpCb = {};
const _cpCbNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function _cpCbOpcoes(cfg) {
  if (cfg.tipo === 'categoria') {
    const usadas = {}; items.forEach(i => { if (i.active !== false && !i.isProd) usadas[i.cat] = (usadas[i.cat] || 0) + 1; });
    const cats = (typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : []).filter(c => !/^PREPARADOS?$/i.test(c));
    return cats.map(c => ({ v: c, label: c, tag: `${usadas[c] || 0} insumo${usadas[c] === 1 ? '' : 's'}` }));
  }
  if (cfg.tipo === 'insumo') return items.filter(i => i.active !== false && !i.isProd)
    .map(i => ({ v: i.id, label: i.name, sub: i.cat || '', tag: i.unit === 'un' ? 'unidade' : (i.unit || '') }));
  return (typeof suppliers !== 'undefined' ? suppliers : []).filter(s => s.active !== false).map(s => {
    const n = items.filter(i => i.active !== false && !i.isProd && _clDoFornecedor(i, s.id)).length;
    return { v: s.id, label: s.name, sub: s.seller || '', tag: `${n} insumo${n === 1 ? '' : 's'}` };
  });
}

function _cpCbLabel(cfg) {
  const v = cfg.valor;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && v.startsWith('avulso:')) return v.slice(7) + ' (sem cadastro)';
  return _cpCbOpcoes(cfg).find(o => o.v === v)?.label || (cfg.tipo === 'categoria' ? String(v) : '');
}

function cpComboHtml(id, { tipo = 'insumo', valor = null, ao = '', avulso = false, placeholder } = {}) {
  _cpCb[id] = { tipo, valor, ao, avulso, ix: 0, q: '' };
  const lab = _cpCbLabel(_cpCb[id]);
  return `<div class="cp-cb" id="${id}" style="position:relative">
    <button type="button" class="inp" onclick="cpComboAbrir('${id}')" style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;cursor:pointer;font-family:inherit">
      <span id="${id}Lab" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${lab ? 'font-weight:600;color:var(--text)' : 'color:var(--muted)'}">${lab ? _estEsc(lab) : (placeholder || (tipo === 'insumo' ? 'Selecionar insumo…' : 'Selecionar fornecedor…'))}</span>
      ${lc('search', 15, 'var(--muted)')}</button>
  </div>`;
}

// A lista abre solta no <body> (position:fixed) para não ser cortada pelo modal
function cpComboAbrir(id) {
  document.querySelectorAll('.cp-cb-pop').forEach(p => p.remove());
  const cb = document.getElementById(id); if (!cb) return;
  const cfg = _cpCb[id]; cfg.q = ''; cfg.ix = 0;
  const r = cb.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'cp-cb-pop'; pop.id = id + 'Pop'; pop.dataset.dono = id;
  const larg = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - larg - 8));
  const embaixo = window.innerHeight - r.bottom, alto = 360;
  const posV = embaixo >= alto || embaixo >= r.top ? `top:${r.bottom + 4}px` : `bottom:${window.innerHeight - r.top + 4}px`;
  const maxH = Math.max(160, Math.min(300, (embaixo >= alto || embaixo >= r.top ? embaixo : r.top) - 70));
  pop.style.cssText = `position:fixed;left:${left}px;${posV};width:${larg}px;z-index:10050;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--r10);box-shadow:0 12px 30px rgba(0,0,0,.2);overflow:hidden`;
  pop.innerHTML = `<div style="position:relative;border-bottom:1px solid var(--border)">
      <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);line-height:0;pointer-events:none">${lc('search', 15, 'var(--muted)')}</span>
      <input id="${id}Q" autocomplete="off" placeholder="Digite para buscar…" style="width:100%;border:none;outline:none;padding:12px 12px 12px 36px;font-size:var(--text-md);font-family:inherit;background:transparent;color:var(--text)"
        oninput="_cpCb['${id}'].q=this.value;_cpCb['${id}'].ix=0;_cpCbFiltrar('${id}')" onkeydown="_cpCbTecla(event,'${id}')">
    </div>
    <div id="${id}Lista" style="max-height:${maxH}px;overflow-y:auto;padding:4px"></div>`;
  document.body.appendChild(pop);
  document.getElementById(id + 'Q').focus();
  _cpCbFiltrar(id);
}
function _cpCbFechar(id) { document.getElementById(id + 'Pop')?.remove(); }
// Clique fora, rolagem da tela de trás ou redimensionar fecham a lista
document.addEventListener('mousedown', e => {
  document.querySelectorAll('.cp-cb-pop').forEach(p => {
    const dono = document.getElementById(p.dataset.dono);
    if (!p.contains(e.target) && !(dono && dono.contains(e.target))) p.remove();
  });
});
document.addEventListener('scroll', e => { if (!e.target.closest?.('.cp-cb-pop')) document.querySelectorAll('.cp-cb-pop').forEach(p => p.remove()); }, true);
window.addEventListener('resize', () => document.querySelectorAll('.cp-cb-pop').forEach(p => p.remove()));

function _cpCbLista(id) {
  const cfg = _cpCb[id], q = _cpCbNorm(cfg.q);
  const ops = _cpCbOpcoes(cfg).filter(o => !q || _cpCbNorm(o.label).includes(q) || _cpCbNorm(o.sub).includes(q))
    .sort((a, b) => (q ? (_cpCbNorm(a.label).startsWith(q) ? 0 : 1) - (_cpCbNorm(b.label).startsWith(q) ? 0 : 1) : 0) || a.label.localeCompare(b.label)).slice(0, 100);
  const acoes = [];
  if (cfg.tipo === 'fornecedor' && q && !ops.some(o => _cpCbNorm(o.label) === q)) {
    acoes.push({ acao: 'novo', label: `Cadastrar fornecedor "${cfg.q.trim()}"`, icon: 'plus' });
    if (cfg.avulso) acoes.push({ acao: 'avulso', label: `Usar "${cfg.q.trim()}" só nesta compra`, sub: 'mercado, compra presencial', icon: 'shopping-cart' });
  }
  return [...ops, ...acoes];
}

function _cpCbFiltrar(id) {
  const el = document.getElementById(id + 'Lista'); if (!el) return;
  const cfg = _cpCb[id], lista = _cpCbLista(id);
  cfg.ix = Math.min(cfg.ix, Math.max(0, lista.length - 1));
  el.innerHTML = lista.length ? lista.map((o, k) => `<div class="cp-cb-op" data-k="${k}" onmousedown="event.preventDefault();_cpCbEscolher('${id}',${k})" onmouseenter="_cpCbMarcar('${id}',${k})"
      style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:var(--r8);cursor:pointer;${k === cfg.ix ? 'background:var(--purple-xlight)' : ''}${o.acao ? ';color:var(--purple);font-weight:700' : ''}">
      <span style="display:flex;align-items:center;gap:6px;min-width:0">${o.acao ? lc(o.icon, 14, 'currentColor') : ''}<span style="min-width:0">
        <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${o.v === cfg.valor ? 'font-weight:800' : 'font-weight:600'}">${_estEsc(o.label)}</span>
        ${o.sub && !o.acao ? `<span style="display:block;font-size:var(--text-2xs);color:var(--muted)">${_estEsc(o.sub)}</span>` : o.sub ? `<span style="display:block;font-size:var(--text-2xs);color:var(--muted);font-weight:400">${_estEsc(o.sub)}</span>` : ''}</span></span>
      ${o.tag ? `<span class="badge b-gray" style="font-size:var(--text-2xs);white-space:nowrap">${_estEsc(o.tag)}</span>` : ''}</div>`).join('')
    : `<div style="padding:12px;color:var(--muted);font-size:var(--text-sm)">${cfg.tipo === 'insumo' ? 'Nenhum insumo encontrado' : cfg.tipo === 'categoria' ? 'Nenhuma categoria encontrada. Cadastre em Configurações.' : 'Digite o nome para buscar ou cadastrar'}</div>`;
}

function _cpCbMarcar(id, k) {
  _cpCb[id].ix = k;
  document.querySelectorAll(`#${id}Lista .cp-cb-op`).forEach(el => { el.style.background = +el.dataset.k === k ? 'var(--purple-xlight)' : ''; });
}

function _cpCbTecla(ev, id) {
  const cfg = _cpCb[id], n = _cpCbLista(id).length;
  const mover = k => { _cpCbMarcar(id, k); document.querySelector(`#${id}Lista .cp-cb-op[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest' }); };
  if (ev.key === 'ArrowDown') { ev.preventDefault(); mover(Math.min(cfg.ix + 1, n - 1)); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); mover(Math.max(cfg.ix - 1, 0)); }
  else if (ev.key === 'Enter') { ev.preventDefault(); if (n) _cpCbEscolher(id, cfg.ix); }
  else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); _cpCbFechar(id); }
}

function _cpCbEscolher(id, k) {
  const cfg = _cpCb[id], o = _cpCbLista(id)[k];
  if (!o) return;
  _cpCbFechar(id);
  if (o.acao === 'novo') return cpFornecedorRapido(cfg.q.trim(), id);
  cpComboSet(id, o.acao === 'avulso' ? 'avulso:' + cfg.q.trim() : o.v);
}

// Define o valor, atualiza o rótulo e roda o "ao"
function cpComboSet(id, valor) {
  const cfg = _cpCb[id]; if (!cfg) return;
  cfg.valor = valor;
  const lab = document.getElementById(id + 'Lab');
  if (lab) { const t = _cpCbLabel(cfg); lab.textContent = t; lab.style.color = 'var(--text)'; lab.style.fontWeight = '600'; }
  if (cfg.ao) (new Function(cfg.ao.replace(/%v/g, JSON.stringify(valor))))();
}
const cpComboValor = id => _cpCb[id]?.valor ?? null;

// Cadastro rápido de fornecedor (o completo fica em Configurações › Fornecedores)
function cpFornecedorRapido(nome, comboId) {
  _estModal('ovFornRap', 'Novo fornecedor', `
    ${_estCampo('Nome *', `<input class="inp" id="frNome" value="${_estEsc(nome)}">`)}
    <div class="f2">
      ${_estCampo('Vendedor', `<input class="inp" id="frSeller" placeholder="opcional">`)}
      ${_estCampo('Telefone / WhatsApp', `<input class="inp" id="frPhone" inputmode="tel" placeholder="(82) 99999-9999">`)}
    </div>
    ${_estCampo('CNPJ', `<input class="inp" id="frCnpj" inputmode="numeric" placeholder="opcional">`)}
    <div style="font-size:var(--text-xs);color:var(--muted)">Prazo de entrega, pedido mínimo e insumos dá para completar depois em Configurações › Fornecedores.</div>`,
    `_cpFornRapSalvar('${comboId}')`, 'Cadastrar', 500);
  setTimeout(() => document.getElementById('frNome')?.focus(), 50);
}

function _cpFornRapSalvar(comboId) {
  const name = document.getElementById('frNome').value.trim();
  if (!name) return toast('Informe o nome', 'err');
  if (suppliers.some(s => s.active !== false && _cpCbNorm(s.name) === _cpCbNorm(name))) return toast('Já existe um fornecedor com esse nome', 'err');
  const nid = nextSid++;
  suppliers.push({ id: nid, name, seller: document.getElementById('frSeller').value.trim(), phone: document.getElementById('frPhone').value.trim(),
    cnpj: cpSoDigitos(document.getElementById('frCnpj').value), email: '', cats: '', diasPedido: [], categoria: [], confianca: 'backup', formaEntrega: 'entrega' });
  if (typeof saveS === 'function') saveS();
  try { logAudit('fornecedor_salvo', name, 'compras'); } catch (e) {}
  document.getElementById('ovFornRap')?.remove();
  toast(`Fornecedor "${name}" cadastrado`, 'ok');
  cpComboSet(comboId, nid);
}

// ══════════════════════════════════════════════════════════════
// PAGAMENTO NEGOCIADO (cotação, recebimento, nova compra)
// pag = { forma, condicao: 'avista'|'prazo'|'parcelado', n, intervalo, dias, primeiro,
//         parcelas: [{ venc: 'AAAA-MM-DD', valor }], manual }
// As parcelas saem da condição e do total; editar uma data/valor marca "manual".
// No recebimento a nota manda: duplicatas do XML viram as parcelas.
// ══════════════════════════════════════════════════════════════

const CP_FORMAS = [['pix', 'Pix'], ['boleto', 'Boleto'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ['dinheiro', 'Dinheiro'], ['transferencia', 'Transferência']];
const CP_CONDICOES = [['avista', 'À vista'], ['prazo', 'A prazo (1x)'], ['parcelado', 'Parcelado']];
const _cpHojeIso = () => cpIso(new Date());
const _cpSomaDias = (iso, d) => { const x = new Date((iso || _cpHojeIso()) + 'T12:00:00'); x.setDate(x.getDate() + (Number(d) || 0)); return cpIso(x); };
const _cpSomaMes = (iso, m) => { const x = new Date(iso + 'T12:00:00'); const dia = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + m); x.setDate(Math.min(dia, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return cpIso(x); };

function cpPagNovo(base = {}) {
  return { forma: 'boleto', condicao: 'prazo', n: 3, intervalo: 30, dias: 21, primeiro: null, parcelas: [], manual: false, ...base };
}

// Gera as parcelas pela condição (intervalo de 30 dias = mesmo dia nos meses seguintes)
function cpPagGerar(pag, total) {
  const n = pag.condicao === 'parcelado' ? Math.max(2, Math.min(24, parseInt(pag.n) || 2)) : 1;
  if (!pag.primeiro) pag.primeiro = pag.condicao === 'prazo' ? _cpSomaDias(_cpHojeIso(), pag.dias || 21) : _cpHojeIso();
  const cent = Math.round((Number(total) || 0) * 100), parte = Math.floor(cent / n);
  pag.parcelas = Array.from({ length: n }, (_, k) => ({
    venc: k === 0 ? pag.primeiro : (Number(pag.intervalo) === 30 ? _cpSomaMes(pag.primeiro, k) : _cpSomaDias(pag.primeiro, k * (Number(pag.intervalo) || 30))),
    valor: (k === n - 1 ? cent - parte * (n - 1) : parte) / 100,
  }));
  pag.manual = false;
  return pag;
}

const cpPagSoma = pag => Math.round((pag?.parcelas || []).reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100;
const cpPagFormaLabel = f => CP_FORMAS.find(x => x[0] === f)?.[1] || f || '—';

// "Boleto · 3x · 12/11, 12/12 e 12/01/2027"
function cpPagTexto(pag) {
  if (!pag?.parcelas?.length) return '';
  const ps = pag.parcelas, d = iso => cpDataBr(iso);
  const cond = pag.condicao === 'avista' ? 'à vista' : ps.length === 1 ? 'a prazo' : `${ps.length}x`;
  const datas = ps.length === 1 ? d(ps[0].venc) : ps.slice(0, -1).map(p => d(p.venc).slice(0, 5)).join(', ') + ' e ' + d(ps[ps.length - 1].venc);
  return `${cpPagFormaLabel(pag.forma)} · ${cond} · ${datas}`;
}

// Bloco editável (ns = prefixo do handler: ns + 'Pag'(campo, valor, k))
function cpPagHtml(pag, total, ns, { editavel = true, aviso = '' } = {}) {
  if (!editavel) {
    if (!pag?.parcelas?.length) return `<div style="font-size:var(--text-sm);color:var(--muted)">Pagamento não informado</div>`;
    return `<div style="font-size:var(--text-sm)"><strong>${_estEsc(cpPagFormaLabel(pag.forma))}</strong> · ${_estEsc(CP_CONDICOES.find(c => c[0] === pag.condicao)?.[1] || '')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${pag.parcelas.map((p, k) => `<span class="badge b-gray" style="font-size:var(--text-xs)">${k + 1}/${pag.parcelas.length} · ${cpDataBr(p.venc)} · ${_estR(p.valor)}</span>`).join('')}</div></div>`;
  }
  const sel = (campo, ops, v) => `<select class="inp" onchange="${ns}Pag('${campo}',this.value)">${ops.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const f = (rot, html, w = 160) => `<div class="field" style="margin:0;width:${w}px"><label>${rot}</label>${html}</div>`;
  const soma = cpPagSoma(pag), dif = Math.round((soma - (Number(total) || 0)) * 100) / 100;
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      ${f('Forma', sel('forma', CP_FORMAS, pag.forma))}
      ${f('Condição', sel('condicao', CP_CONDICOES, pag.condicao), 150)}
      ${pag.condicao === 'prazo' ? f('Prazo (dias)', `<input class="inp" type="number" min="0" value="${pag.dias ?? ''}" onchange="${ns}Pag('dias',this.value)">`, 110) : ''}
      ${pag.condicao === 'parcelado' ? f('Parcelas', `<input class="inp" type="number" min="2" max="24" value="${pag.n ?? 2}" onchange="${ns}Pag('n',this.value)">`, 90) + f('A cada (dias)', `<input class="inp" type="number" min="1" value="${pag.intervalo ?? 30}" onchange="${ns}Pag('intervalo',this.value)">`, 110) : ''}
      ${f(pag.condicao === 'avista' ? 'Pagamento em' : '1º vencimento', `<input class="inp" type="date" value="${pag.primeiro || ''}" onchange="${ns}Pag('primeiro',this.value)">`, 160)}
    </div>
    <div style="margin-top:10px;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${pag.parcelas.map((p, k) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;${k ? 'border-top:1px solid var(--border)' : ''}">
        <span style="width:44px;font-size:var(--text-sm);font-weight:700;color:var(--text2)">${k + 1}/${pag.parcelas.length}</span>
        <input class="inp" type="date" value="${p.venc}" style="width:160px" onchange="${ns}Pag('venc',this.value,${k})">
        <span style="font-size:var(--text-xs);color:var(--muted)">R$</span>
        <input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(p.valor)}" style="width:120px;text-align:right;font-weight:700" onchange="${ns}Pag('valor',this.value,${k})">
      </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:var(--text-xs)">
      <span style="color:${Math.abs(dif) < 0.01 ? 'var(--success-fg)' : 'var(--danger-fg)'};font-weight:700">${Math.abs(dif) < 0.01 ? `✓ parcelas somam ${_estR(soma)}` : `Parcelas somam ${_estR(soma)}: ${dif > 0 ? 'sobram' : 'faltam'} ${_estR(Math.abs(dif))} para o total ${_estR(total)}`}</span>
      ${pag.manual ? `<button class="btn btn-ghost btn-xs" onclick="${ns}Pag('recalcular')">${lc('refresh-cw', 11, 'currentColor')} Recalcular parcelas</button>` : ''}
    </div>
    ${aviso ? `<div style="margin-top:6px;font-size:var(--text-xs);color:var(--orange-dark);font-weight:600">${aviso}</div>` : ''}`;
}

// Aplica a mudança e regera as parcelas quando for o caso
function cpPagSet(pag, total, campo, v, k) {
  if (campo === 'venc') { pag.parcelas[k].venc = v; pag.manual = true; if (k === 0) pag.primeiro = v; return; }
  if (campo === 'valor') { pag.parcelas[k].valor = cpNum(v) || 0; pag.manual = true; return; }
  if (campo === 'recalcular') return cpPagGerar(pag, total);
  if (campo === 'condicao') { pag.condicao = v; pag.primeiro = null; if (v === 'avista' && ['boleto'].includes(pag.forma)) pag.forma = 'pix'; }
  else if (campo === 'dias') { pag.dias = parseInt(v) || 0; pag.primeiro = _cpSomaDias(_cpHojeIso(), pag.dias); }
  else if (['n', 'intervalo'].includes(campo)) pag[campo] = parseInt(v) || 0;
  else pag[campo] = v;
  if (campo !== 'forma') cpPagGerar(pag, total);
}

// Total mudou (preço/frete): só regera se ninguém editou as parcelas à mão
function cpPagTotal(pag, total) { if (pag && !pag.manual) cpPagGerar(pag, total); }

// Parcelas da compra confirmada → linhas de conta a pagar
async function cpGravarParcelas(compra, pag, user) {
  if (!pag?.parcelas?.length) return;
  const paga = pag.condicao === 'avista' && ['pix', 'dinheiro', 'debito'].includes(pag.forma);
  await cpInsert('cp_compra_parcelas', pag.parcelas.map((p, k) => ({
    compra_id: compra.id, numero: k + 1, total_parcelas: pag.parcelas.length, vencimento: p.venc, valor: Math.round((Number(p.valor) || 0) * 100) / 100,
    forma: pag.forma, fornecedor_id: compra.fornecedor_id || null, fornecedor_nome: compra.fornecedor_nome || null, numero_nota: compra.numero_nota || null,
    status: paga ? 'paga' : 'aberta', pago_em: paga ? new Date().toISOString() : null, pago_por: paga ? user : null, criado_por: user,
  })));
}

// Duplicatas da NF-e (<cobr><dup>) + forma (<detPag><tPag>) → pagamento
function cpPagDaNota(nota) {
  const dups = nota?.duplicatas || [];
  if (!dups.length && !nota?.forma) return null;
  const forma = nota.forma || 'boleto';
  const parcelas = dups.length ? dups.map(d => ({ venc: d.venc, valor: d.valor })) : [];
  return { ...cpPagNovo(), forma, condicao: parcelas.length > 1 ? 'parcelado' : parcelas.length === 1 && parcelas[0].venc > _cpHojeIso() ? 'prazo' : 'avista',
    n: parcelas.length || 1, primeiro: parcelas[0]?.venc || _cpHojeIso(), parcelas, manual: !!parcelas.length, daNota: true };
}

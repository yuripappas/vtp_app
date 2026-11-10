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
  { k: 'icms_st',  label: 'ICMS ST (substituição)' },
  { k: 'seguro',   label: 'Seguro' },
  { k: 'outras',   label: 'Outras despesas' },
  { k: 'desconto', label: 'Desconto', menos: true },
  { k: 'frete',    label: 'Frete', foraCusto: true },
];
// Celular: campos da linha em 2 colunas (insumo ocupa a linha toda)
if (!document.getElementById('cpLinhaCss')) {
  const st = document.createElement('style'); st.id = 'cpLinhaCss';
  st.textContent = '@media (max-width:640px){.cp-linha{grid-template-columns:1fr 1fr !important}.cp-linha>.field:first-child:nth-last-child(4){grid-column:1/-1}}';
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
const cpApPadrao = item => { const p = estApresentacoes(item).find(a => a.padrao); return p ? { nome: p.nome, fator: Number(p.qtd) } : null; };
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

// Texto da conversão: "= 50 kg · R$ 16,00/kg · R$ 400,00/Caixa 25 kg · +R$ 3,20 de impostos"
function cpConvTexto(l, acr = 0) {
  const it = items.find(i => i.id === l.item_id);
  if (!it) return '';
  const c = cpLinhaCalc(l), u = it.unit || 'un';
  if (!(c.qtd > 0)) return l.ap ? `1 ${_estEsc(l.ap.nome)} = ${_estQ(l.ap.fator)} ${_estEsc(u)}` : '';
  const custo = c.qtd > 0 ? (c.total + acr) / c.qtd : 0;
  const partes = [`= <strong>${_estQ(c.qtd)} ${_estEsc(u)}</strong>`];
  if (c.total > 0) {
    partes.push(`${_estR(custo)}/${_estEsc(u)}${Math.abs(acr) >= 0.005 ? ' com impostos' : ''}`);
    if (l.ap) partes.push(`${_estR(c.total / c.n + acr / c.n)}/${_estEsc(l.ap.nome)}`);
    if (l.modo === 'total' && !l.ap) partes.push(`total ${_estR(c.total)}`);
    else if (l.modo === 'unit') partes.push(`total ${_estR(c.total)}`);
  }
  if (Math.abs(acr) >= 0.005) partes.push(`${acr > 0 ? '+' : '−'}${_estR(Math.abs(acr))} rateio da nota`);
  return partes.join(' · ');
}

// Campos da linha. ns = prefixo dos handlers (ex.: '_cpNC' → _cpNCLinha(idx, campo, valor))
function cpLinhaCamposHtml(l, idx, ns, { comItem = true } = {}) {
  const it = items.find(i => i.id === l.item_id);
  const ops = it ? cpApOpcoes(it, l.ap) : [{ nome: null, fator: 1 }];
  const sel = ops.findIndex(o => (o.nome || null) === (l.ap?.nome || null) && Math.abs(o.fator - (l.ap?.fator || 1)) < 1e-6);
  const u = it?.unit || 'un';
  const unid = l.ap ? l.ap.nome : u;
  const seg = (m, t) => `<button type="button" onclick="${ns}Linha(${idx},'modo','${m}')" style="padding:2px 9px;border-radius:99px;font-size:var(--text-2xs);font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid ${l.modo === m ? 'var(--purple)' : 'var(--border)'};background:${l.modo === m ? 'var(--purple-xlight)' : 'transparent'};color:${l.modo === m ? 'var(--purple)' : 'var(--text2)'}">${t}</button>`;
  return `<div class="cp-linha" style="display:grid;grid-template-columns:${comItem ? 'minmax(200px,2fr) ' : ''}minmax(150px,1.3fr) minmax(90px,.7fr) minmax(150px,1.1fr);gap:8px;align-items:end">
    ${comItem ? `<div class="field" style="margin:0"><label>Insumo ${l.sugestao ? '<span style="color:var(--warning-fg);text-transform:none;letter-spacing:0">· sugestão, confira</span>' : l.memoria ? '<span style="color:var(--success-fg);text-transform:none;letter-spacing:0">· reconhecido</span>' : ''}</label>
      <select class="inp" onchange="${ns}Linha(${idx},'item',this.value)">${_estOptsItens(i => !i.isProd, l.item_id)}</select></div>` : ''}
    <div class="field" style="margin:0"><label>Embalagem</label>
      <select class="inp" ${it ? '' : 'disabled'} onchange="${ns}Linha(${idx},'ap',this.value)">${ops.map((o, k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${o.nome ? `${_estEsc(o.nome)} (${_estQ(o.fator)} ${_estEsc(u)})` : `${_estEsc(u)} (unidade base)`}</option>`).join('')}</select></div>
    <div class="field" style="margin:0"><label>Qtd <span style="text-transform:none;letter-spacing:0">(${_estEsc(unid)})</span></label>
      <input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(l.n)}" style="text-align:right;font-weight:700" oninput="${ns}Linha(${idx},'n',this.value)"></div>
    <div class="field" style="margin:0"><label style="display:flex;justify-content:space-between;align-items:center;gap:4px">Valor ${seg('unit', 'Unitário')}${seg('total', 'Total')}</label>
      <div style="display:flex;align-items:center;gap:4px"><span style="font-size:var(--text-xs);color:var(--muted)">R$</span>
      <input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(l.modo === 'total' ? l.vTotal : l.vUnit)}" style="text-align:right;font-weight:700" placeholder="${l.modo === 'total' ? 'total da linha' : 'por ' + _estEsc(unid)}" oninput="${ns}Linha(${idx},'v',this.value)"></div></div>
  </div>
  <div id="${ns}Conv${idx}" style="font-size:var(--text-xs);color:var(--text2);margin-top:6px;min-height:14px"></div>`;
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
  if (campo === 'v') { if (l.modo === 'total') l.vTotal = cpNum(v); else l.vUnit = cpNum(v); }
  return false;
}

// Bloco "Totais da nota" (impostos, frete, desconto) + conferência com o valor total da nota
function cpTotaisNotaHtml(ex, totalNota, ns, aberto = false) {
  return `<details class="cp-totais" ${aberto ? 'open' : ''} style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 14px;margin-top:12px;background:var(--card-bg)">
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:700">Impostos, frete e desconto da nota <span style="font-weight:400;color:var(--muted)">· rodapé "Cálculo do imposto"</span></summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px 12px;margin-top:10px">
      ${CP_EXTRAS.map(e => `<div class="field" style="margin:0"><label style="text-transform:none;letter-spacing:0">${e.label}${e.foraCusto ? ' <span style="color:var(--muted)">· fora do custo</span>' : ''}</label>
        <input class="inp" type="text" inputmode="decimal" value="${ex[e.k] ? cpFmtNum(ex[e.k]) : ''}" placeholder="0,00" style="text-align:right" oninput="${ns}Extra('${e.k}',this.value)"></div>`).join('')}
      <div class="field" style="margin:0"><label style="text-transform:none;letter-spacing:0;font-weight:800;color:var(--text)">Valor total da nota</label>
        <input class="inp" type="text" inputmode="decimal" value="${totalNota ? cpFmtNum(totalNota) : ''}" placeholder="para conferir" style="text-align:right;font-weight:700" oninput="${ns}Extra('totalNota',this.value)"></div>
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px;line-height:1.5">O ICMS comum (Simples Nacional) já está no preço de cada produto: não some. IPI, ICMS ST, seguro, outras despesas e desconto são rateados no custo dos itens. O frete entra só no total da compra.</div>
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

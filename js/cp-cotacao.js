/**
 * VTP Compras — Vai Ter Pizza!
 * cp-cotacao.js — Aba "Cotação" (lotes)
 *
 * O comprador monta lotes com itens de listas APROVADAS (cada item só pode
 * estar em um lote por vez) e organiza como quiser: só Laticínios, Hortifrúti,
 * geral…
 *
 * Inteligência:
 *  • item com fornecedor exclusivo já vem atribuído a ele, com o último preço
 *    pago a esse fornecedor (o comprador só confirma ou corrige);
 *  • demais itens: matriz produto × fornecedor (os vinculados ao insumo
 *    entram como colunas), última compra, selo "Melhor preço", botão
 *    "Selecionar os melhores preços", total por fornecedor × pedido mínimo.
 *
 * Fim do lote: resumo por fornecedor com "Copiar mensagem" (envio manual) e
 * "Concluir lote", que gera um pedido por fornecedor na aba Recebimento.
 */

let _ctDados = null;   // { lotes, nItens }
let _ctAtual = null;   // lote aberto: { lote, itens, precos: Map 'loteItem|forn' → row, forns:[ids], vista }

const _ctForn = id => cpFornecedor(id);
const _ctNomeForn = id => _ctForn(id)?.name || `Fornecedor ${id}`;
const _ctMin = id => { const s = _ctForn(id); return s && s.pedidoMinimo > 0 && (s.pedidoMinTipo || 'valor') === 'valor' ? Number(s.pedidoMinimo) : 0; };

// Último preço pago a um fornecedor por um item (histórico de preços)
function _ctUltimoPrecoForn(itemId, fornId) {
  let ult = null;
  for (const p of (typeof priceHistory !== 'undefined' ? priceHistory : [])) {
    if (p.itemId !== itemId || p.fornecedorId !== fornId || !(p.precoUnit > 0)) continue;
    if (!ult || _estMs(p.data) >= _estMs(ult.data)) ult = p;
  }
  return ult;
}

// ── Aba: lista de lotes ────────────────────────────────────────

async function cpRenderAbaCotacao(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  if (!_ctDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando cotações…</div>`;
    try {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString();
      const lotes = await cpSelect('cp_lotes', q => q.select('*').is('excluido_em', null).or(`status.eq.aberto,created_at.gte.${desde}`).order('created_at', { ascending: false }));
      const ids = lotes.map(l => l.id);
      const itens = ids.length ? await cpSelect('cp_lote_itens', q => q.select('lote_id, removido_em, fornecedor_id, preco, qtd').in('lote_id', ids)) : [];
      const resumo = {};
      itens.filter(i => !i.removido_em).forEach(i => {
        const r = resumo[i.lote_id] || (resumo[i.lote_id] = { n: 0, decididos: 0, valor: 0, forns: new Set() });
        r.n++; if (i.fornecedor_id) { r.decididos++; r.valor += (Number(i.qtd) || 0) * (Number(i.preco) || 0); r.forns.add(i.fornecedor_id); }
      });
      const pendentes = await _ctItensDisponiveis();
      _ctDados = { lotes, resumo, pendentes: pendentes.length };
    } catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar as cotações: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaCotacao(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cpAbaBody')) return;
  const { lotes, resumo, pendentes } = _ctDados;
  const card = l => {
    const r = resumo[l.id] || { n: 0, decididos: 0, valor: 0, forns: new Set() };
    const st = { aberto: ['Em cotação', 'b-purple'], concluido: ['Pedidos gerados', 'b-green'], cancelado: ['Cancelado', 'b-gray'] }[l.status];
    return `<div onclick="cpAbrirLote('${l.id}')" style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:14px 16px;cursor:pointer"
        onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--card-border)'">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px">
        <div style="font-size:var(--text-md);font-weight:800">${_estEsc(l.nome)}</div><span class="badge ${st[1]}">${st[0]}</span></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:var(--text-sm);color:var(--text2)">
        <span>${r.n} ${r.n === 1 ? 'item' : 'itens'}</span><span>${r.decididos}/${r.n} com fornecedor</span><span>${r.forns.size} fornecedor(es)</span>
        <strong style="margin-left:auto;color:var(--text)">${_estR(r.valor)}</strong></div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:6px">${_estEsc(l.criado_por)} · ${_estDH(l.created_at)}${l.concluido_por ? ` · concluído por ${_estEsc(l.concluido_por)}` : ''}</div>
    </div>`;
  };
  const abertos = lotes.filter(l => l.status === 'aberto'), outros = lotes.filter(l => l.status !== 'aberto');
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <button class="btn btn-primary" onclick="cpNovoLote()" ${pendentes ? '' : 'disabled title="Nenhum item aprovado esperando cotação"'}>${lc('plus', 14, '#fff')} Novo lote</button>
      <span style="font-size:var(--text-sm);color:${pendentes ? 'var(--purple)' : 'var(--muted)'};font-weight:${pendentes ? 700 : 400}">${pendentes ? `${pendentes} item(ns) de listas aprovadas esperando cotação` : 'Nenhum item aprovado esperando cotação — aprove uma lista na aba Lista de compra'}</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="cpRenderAbaCotacao(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    <div style="font-size:var(--text-sm);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Em cotação</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;margin-bottom:20px">
      ${abertos.length ? abertos.map(card).join('') : `<div style="padding:24px;color:var(--muted);font-size:var(--text-sm)">Nenhum lote aberto.</div>`}</div>
    ${outros.length ? `<div style="font-size:var(--text-sm);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Últimos 30 dias</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${outros.map(card).join('')}</div>` : ''}`;
}

// Itens de listas aprovadas (semana atual e arquivadas recentes) ainda sem lote
async function _ctItensDisponiveis() {
  const desde = cpSemana(-4).de;
  const listas = await cpSelect('cp_listas', q => q.select('id, nome, status, semana_inicio').is('excluido_em', null).in('status', ['aprovada', 'arquivada']).gte('semana_inicio', desde));
  if (!listas.length) return [];
  const itens = await cpSelect('cp_lista_itens', q => q.select('*').in('lista_id', listas.map(l => l.id)).is('lote_id', null).is('removido_em', null));
  const porId = Object.fromEntries(listas.map(l => [l.id, l]));
  return itens.filter(i => (Number(i.qtd_aprovada ?? i.qtd_solicitada) || 0) > 0).map(i => ({ ...i, lista: porId[i.lista_id] }));
}

// ── Novo lote ──────────────────────────────────────────────────

async function cpNovoLote() {
  let disp;
  try { disp = await _ctItensDisponiveis(); } catch (e) { return toast(e.message, 'err'); }
  if (!disp.length) return toast('Nenhum item aprovado esperando cotação', 'err');
  const porLista = {};
  disp.forEach(i => { (porLista[i.lista_id] ||= []).push(i); });
  window._ctDisp = disp;
  _estModal('ovCtNovo', 'Novo lote de cotação', `
    ${_estCampo('Nome do lote *', `<input class="inp" id="ctnNome" placeholder="ex: Laticínios semana 13/10, Hortifrúti, Geral">`)}
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:8px">Escolha os itens. Cada item só pode estar em um lote por vez; o que ficar de fora continua disponível para outro lote.</div>
    ${Object.entries(porLista).map(([lid, its]) => { const l = its[0].lista; return `
      <div style="border:1.5px solid var(--border);border-radius:var(--r8);margin-bottom:10px;overflow:hidden">
        <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--surface2);cursor:pointer;text-transform:none;letter-spacing:0;font-size:var(--text-sm);font-weight:700;color:var(--text)">
          <input type="checkbox" onchange="document.querySelectorAll('.ctnIt[data-l=\\'${lid}\\']').forEach(c=>c.checked=this.checked)" style="accent-color:var(--purple)">
          ${_estEsc(l.nome)} <span style="font-weight:400;color:var(--muted)">· ${its.length} itens${l.status === 'arquivada' ? ' · semana anterior' : ''}</span></label>
        ${its.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.item_nome.localeCompare(b.item_nome)).map(i => `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--border);cursor:pointer;text-transform:none;letter-spacing:0;font-size:var(--text-sm);font-weight:500;color:var(--text)">
            <input type="checkbox" class="ctnIt" data-l="${lid}" value="${i.id}" style="accent-color:var(--purple)">
            <span style="flex:1">${_estEsc(i.item_nome)} <span style="color:var(--muted)">· ${_estEsc(i.categoria || '')}</span></span>
            <span style="white-space:nowrap">${_estQ(i.qtd_aprovada ?? i.qtd_solicitada)} ${_estEsc(i.unidade || '')}</span></label>`).join('')}
      </div>`; }).join('')}`, '_ctCriarLote()', 'Criar lote', 640);
}

async function _ctCriarLote() {
  const nome = document.getElementById('ctnNome').value.trim();
  const ids = [...document.querySelectorAll('.ctnIt:checked')].map(c => c.value);
  if (!nome) return toast('Dê um nome para o lote', 'err');
  if (!ids.length) return toast('Escolha pelo menos um item', 'err');
  const escolhidos = window._ctDisp.filter(i => ids.includes(i.id));
  _estSalvarComBotao('ovCtNovo', async () => {
    const user = estUsuario();
    const [lote] = await cpInsert('cp_lotes', { nome, criado_por: user });
    const linhas = await cpInsert('cp_lote_itens', escolhidos.map(i => {
      const it = items.find(x => x.id === i.item_id);
      const exc = it?.supIdExclusivo || null;
      const ult = exc ? (_ctUltimoPrecoForn(i.item_id, exc)?.precoUnit ?? it?.cost ?? null) : null;
      return { lote_id: lote.id, lista_item_id: i.id, item_id: i.item_id, item_nome: i.item_nome, unidade: i.unidade,
        qtd: Number(i.qtd_aprovada ?? i.qtd_solicitada), fornecedor_id: exc, preco: ult, criado_por: user };
    }));
    for (const i of escolhidos) await cpUpdate('cp_lista_itens', i.id, { lote_id: lote.id });
    // exclusivos: preço do fornecedor exclusivo já preenchido na matriz
    const precos = linhas.filter(l => l.fornecedor_id && l.preco !== null).map(l => ({ lote_item_id: l.id, fornecedor_id: l.fornecedor_id, preco: l.preco, obs: 'exclusivo · último preço', criado_por: user }));
    if (precos.length) await cpInsert('cp_lote_precos', precos);
    window._ctNovoId = lote.id;
  }).then(() => { if (window._ctNovoId) { cpAbrirLote(window._ctNovoId); window._ctNovoId = null; } _ctDados = null; });
}

// ══════════════════════════════════════════════════════════════
// LOTE: planilha (matriz) e resumo por fornecedor
// ══════════════════════════════════════════════════════════════

async function cpAbrirLote(id) {
  let lote, itens, precos;
  try {
    [lote] = await cpSelect('cp_lotes', q => q.select('*').eq('id', id));
    itens = (await cpSelect('cp_lote_itens', q => q.select('*').eq('lote_id', id))).filter(i => !i.removido_em);
    precos = itens.length ? await cpSelect('cp_lote_precos', q => q.select('*').in('lote_item_id', itens.map(i => i.id))) : [];
  } catch (e) { return toast('Não consegui abrir o lote: ' + e.message, 'err'); }
  const mapa = new Map(precos.map(p => [p.lote_item_id + '|' + p.fornecedor_id, p]));
  // Colunas: fornecedores vinculados aos insumos + quem já tem preço/escolha
  const forns = new Set();
  for (const i of itens) {
    const it = items.find(x => x.id === i.item_id);
    (it?.supIds?.length ? it.supIds : it?.supId ? [it.supId] : []).forEach(f => forns.add(f));
    if (it?.supIdExclusivo) forns.add(it.supIdExclusivo);
    if (i.fornecedor_id) forns.add(i.fornecedor_id);
  }
  precos.forEach(p => forns.add(p.fornecedor_id));
  // Se a planilha já foi montada à mão (adicionar/remover fornecedor), vale a lista salva
  let lista = Array.isArray(lote.fornecedores) && lote.fornecedores.length ? [...lote.fornecedores] : [...forns];
  itens.forEach(i => { if (i.fornecedor_id && !lista.includes(i.fornecedor_id)) lista.push(i.fornecedor_id); });
  _ctAtual = { lote, itens, precos: mapa, forns: lista.filter(f => _ctForn(f)).sort((a, b) => _ctNomeForn(a).localeCompare(_ctNomeForn(b))), vista: 'planilha' };

  document.getElementById('ovCtLote')?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'ovCtLote';
  ov.innerHTML = `<div class="modal" style="width:1240px;max-width:calc(100vw - 20px);height:calc(100vh - 28px);display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
    <div id="ctHead" style="padding:16px 22px;border-bottom:1px solid var(--border)"></div>
    <div id="ctBody" style="flex:1;overflow:auto;padding:14px 22px"></div>
    <div id="ctFoot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--border)"></div>
  </div>`;
  document.body.appendChild(ov);
  _ctRender();
}

function _ctFechar() {
  document.getElementById('ovCtLote')?.remove();
  _ctAtual = null;
  if (_cpAba === 'cotacao') cpRenderAbaCotacao(true);
}

const _ctEditavel = () => _ctAtual?.lote.status === 'aberto';
const _ctPreco = (li, f) => { const p = _ctAtual.precos.get(li.id + '|' + f); return p && p.preco !== null ? Number(p.preco) : null; };

const _ctFrete = f => Number(_ctAtual?.lote.fretes?.[f]) || 0;

// Por fornecedor: total dos itens escolhidos (total), entrega e total com entrega
function _ctTotais() {
  const t = {};
  for (const li of _ctAtual.itens) {
    if (!li.fornecedor_id) continue;
    const v = (Number(li.qtd) || 0) * (Number(li.preco) || 0);
    const r = t[li.fornecedor_id] || (t[li.fornecedor_id] = { total: 0, itens: [] });
    r.total += v; r.itens.push(li);
  }
  for (const [f, r] of Object.entries(t)) { r.frete = _ctFrete(f); r.comFrete = r.total + r.frete; }
  return t;
}

async function _ctSalvarColunas() {
  _ctAtual.lote = await cpUpdate('cp_lotes', _ctAtual.lote.id, { fornecedores: _ctAtual.forns });
}
async function _ctAddForn(f) {
  if (!f || _ctAtual.forns.includes(f)) return;
  _ctAtual.forns.push(f);
  _ctAtual.forns.sort((a, b) => _ctNomeForn(a).localeCompare(_ctNomeForn(b)));
  try { await _ctSalvarColunas(); } catch (e) { toast(e.message, 'err'); }
  _ctRender();
}
function _ctRemoverForn(f) {
  const escolhidos = _ctAtual.itens.filter(li => li.fornecedor_id === f);
  vtpConfirm({
    title: `Tirar ${_ctNomeForn(f)} da planilha?`,
    message: escolhidos.length ? `${escolhidos.length} item(ns) estavam com este fornecedor e ficam sem fornecedor escolhido.` : 'Os preços digitados ficam guardados se ele voltar.',
    confirmLabel: 'Tirar da planilha',
    onConfirm: async () => {
      try {
        for (const li of escolhidos) Object.assign(li, await cpUpdate('cp_lote_itens', li.id, { fornecedor_id: null, preco: null }));
        _ctAtual.forns = _ctAtual.forns.filter(x => x !== f);
        await _ctSalvarColunas();
        _ctRender();
      } catch (e) { toast(e.message, 'err'); }
    },
  });
}
async function _ctSetFrete(f, v) {
  const fretes = { ...(_ctAtual.lote.fretes || {}) };
  const n = parseFloat(String(v).replace(',', '.'));
  if (n > 0) fretes[f] = Math.round(n * 100) / 100; else delete fretes[f];
  try { _ctAtual.lote = await cpUpdate('cp_lotes', _ctAtual.lote.id, { fretes }); _ctRender(); }
  catch (e) { toast('Não salvou a entrega: ' + e.message, 'err'); }
}

function _ctRender() {
  const a = _ctAtual;
  if (!a) return;
  const decididos = a.itens.filter(i => i.fornecedor_id).length;
  const totais = _ctTotais();
  const valor = Object.values(totais).reduce((s, x) => s + x.comFrete, 0);
  const aba = (id, t) => `<button onclick="_ctAtual.vista='${id}';_ctRender()" style="padding:8px 14px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:var(--text-md);font-weight:${a.vista === id ? 700 : 500};color:${a.vista === id ? 'var(--purple)' : 'var(--text2)'};border-bottom:2.5px solid ${a.vista === id ? 'var(--purple)' : 'transparent'}">${t}</button>`;
  document.getElementById('ctHead').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">Lote de cotação${_ctEditavel() ? '' : a.lote.status === 'concluido' ? ' · pedidos gerados' : ' · cancelado'}</div>
        <div style="font-size:var(--text-xl);font-weight:800">${_estEsc(a.lote.nome)}</div>
      </div>
      <div style="display:flex;gap:16px;align-items:center">
        <div style="text-align:right"><div style="font-size:var(--text-xs);color:var(--muted)">${decididos}/${a.itens.length} com fornecedor</div><div style="font-size:var(--text-xl);font-weight:800">${_estR(valor)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="_ctFechar()">${lc('x', 16, 'currentColor')}</button>
      </div>
    </div>
    <div style="display:flex;gap:2px;margin-top:8px;margin-bottom:-17px">${aba('planilha', 'Planilha de cotação')}${aba('resumo', `Resumo por fornecedor (${Object.keys(totais).length})`)}</div>`;
  if (a.vista === 'planilha') _ctRenderPlanilha(totais); else _ctRenderResumo(totais);

  document.getElementById('ctFoot').innerHTML = _ctEditavel() ? `
    <button class="btn btn-ghost" style="margin-right:auto;color:var(--danger-fg)" onclick="_ctCancelarLote()">Cancelar lote</button>
    ${a.vista === 'planilha' ? `<button class="btn btn-outline" onclick="_ctAtual.vista='resumo';_ctRender()">Ver resumo por fornecedor →</button>` : `<button class="btn btn-outline" onclick="_ctAtual.vista='planilha';_ctRender()">← Voltar à planilha</button>`}
    <button class="btn btn-primary" onclick="_ctConcluir()">${lc('check', 14, '#fff')} Concluir lote e gerar pedidos</button>`
    : `<span style="margin-right:auto;font-size:var(--text-sm);color:var(--muted);align-self:center">${a.lote.status === 'concluido' ? `Pedidos gerados por ${_estEsc(a.lote.concluido_por || '')} em ${_estDH(a.lote.concluido_em)} — acompanhe na aba Recebimento.` : 'Lote cancelado.'}</span>
       <button class="btn btn-primary" onclick="_ctFechar()">Fechar</button>`;
}

function _ctRenderPlanilha(totais) {
  const a = _ctAtual, ed = _ctEditavel();
  const outros = (typeof suppliers !== 'undefined' ? suppliers : []).filter(s => s.active !== false && !a.forns.includes(s.id)).sort((x, y) => x.name.localeCompare(y.name));
  const head = a.forns.map(f => {
    const s = _ctForn(f);
    return `<th style="padding:10px 8px;min-width:150px;vertical-align:bottom;border-left:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px">
        <span style="width:30px;height:30px;border-radius:50%;background:var(--purple-xlight);color:var(--purple);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:800">${_estEsc(s.name.split(/\s+/).map(w => w[0]).slice(0, 2).join(''))}</span>
        ${ed ? `<button class="btn btn-ghost btn-xs" title="Copiar pedido de cotação para ${_estEsc(s.name)}" onclick="_ctCopiar(_ctMsgCotacao(${f}))">${lc('copy', 12, 'currentColor')}</button>
          <button class="btn btn-ghost btn-xs" title="Tirar ${_estEsc(s.name)} da planilha" style="color:var(--danger-fg)" onclick="_ctRemoverForn(${f})">${lc('x', 12, 'currentColor')}</button>` : ''}
      </div>
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--text);margin-top:4px;text-transform:none;letter-spacing:0">${_estEsc(s.name)}</div>
      ${s.seller ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0">${_estEsc(s.seller)}</div>` : ''}
    </th>`;
  }).join('');
  const linhas = a.itens.sort((x, y) => x.item_nome.localeCompare(y.item_nome)).map(li => {
    const it = items.find(x => x.id === li.item_id);
    const exc = it?.supIdExclusivo || null;
    const ult = estUltimoPreco(li.item_id);
    const precos = a.forns.map(f => _ctPreco(li, f)).filter(v => v !== null);
    const melhor = precos.length ? Math.min(...precos) : null;
    const cells = a.forns.map(f => {
      const p = _ctPreco(li, f);
      const sel = li.fornecedor_id === f;
      const bloqueado = exc && exc !== f;
      return `<td style="padding:8px;border-left:1px solid var(--border);text-align:center;background:${sel ? 'var(--purple-xlight)' : bloqueado ? 'var(--surface2)' : ''}">
        ${bloqueado ? `<span style="font-size:var(--text-2xs);color:var(--muted)">exclusivo de outro</span>` : `
        <div style="display:flex;align-items:center;gap:6px;justify-content:center">
          <input type="radio" name="ct${li.id}" ${sel ? 'checked' : ''} ${ed && p !== null ? '' : 'disabled'} onchange="_ctEscolher('${li.id}', ${f})" style="accent-color:var(--purple);width:16px;height:16px" title="Escolher este fornecedor">
          <input class="inp" type="number" min="0" step="0.01" value="${p ?? ''}" placeholder="R$" ${ed ? '' : 'disabled'}
            style="width:88px;text-align:right;font-weight:${sel ? 800 : 600};padding:6px 8px" onchange="_ctSetPreco('${li.id}', ${f}, this.value)">
        </div>
        ${p !== null && melhor !== null && p === melhor && precos.length > 1 ? `<div style="margin-top:4px"><span class="badge b-purple" style="font-size:var(--text-2xs)">★ Melhor preço</span></div>` : ''}
        ${exc === f ? `<div style="margin-top:4px;font-size:var(--text-2xs);color:var(--orange-dark);font-weight:700">exclusivo</div>` : ''}`}
      </td>`;
    }).join('');
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:8px 10px;position:sticky;left:0;background:var(--card-bg);z-index:1;min-width:220px">
        <div style="font-weight:700">${_estEsc(li.item_nome)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${_estQ(li.qtd)} ${_estEsc(li.unidade || '')} ${_clEmb(it, li.qtd)}</div>
        ${ed ? `<button class="btn btn-ghost btn-xs" style="color:var(--muted);padding:2px 0" onclick="_ctRemoverItem('${li.id}')">tirar do lote</button>` : ''}
      </td>
      <td style="padding:8px 10px;white-space:nowrap;font-size:var(--text-sm)">${ult ? `${_estR(ult.precoUnit)}<div style="font-size:var(--text-xs);color:var(--muted)">${cpDataBr(ult.data)} · ${_estEsc(ult.fornecedorNome || '')}</div>` : '<span style="color:var(--muted)">—</span>'}</td>
      ${cells}
    </tr>`;
  }).join('');
  const foot = a.forns.map(f => {
    const t = totais[f]?.total || 0, min = _ctMin(f), fr = _ctFrete(f);
    const abaixo = min > 0 && t > 0 && t < min;
    return `<td style="padding:8px;border-left:1px solid var(--border)">
      <label style="display:block;font-size:var(--text-2xs);font-weight:700;color:var(--text2);margin-bottom:3px;text-transform:none;letter-spacing:0">Entrega (R$)</label>
      <input class="inp" type="number" min="0" step="0.01" value="${fr || ''}" placeholder="0,00" ${ed ? '' : 'disabled'} style="width:100%;text-align:right;padding:6px 8px;margin-bottom:6px" onchange="_ctSetFrete(${f}, this.value)">
      <div style="border-radius:var(--r8);padding:8px 10px;background:${t > 0 ? (abaixo ? 'var(--danger-bg)' : 'var(--success-bg)') : 'var(--surface2)'};color:${t > 0 ? (abaixo ? 'var(--danger-fg)' : 'var(--success-fg)') : 'var(--muted)'}">
        <div style="font-size:var(--text-2xs);font-weight:700">Itens selecionados</div><div style="font-size:var(--text-md);font-weight:800">${_estR(t)}</div>
        ${t > 0 && fr ? `<div style="font-size:var(--text-2xs);font-weight:700;margin-top:2px">com entrega ${_estR(t + fr)}</div>` : ''}</div>
      ${min ? `<div style="border-radius:var(--r8);padding:6px 10px;margin-top:4px;background:var(--warning-bg);color:var(--warning-fg)"><div style="font-size:var(--text-2xs);font-weight:700">Pedido mínimo</div><div style="font-size:var(--text-sm);font-weight:800">${_estR(min)}</div></div>` : ''}
    </td>`;
  }).join('');

  document.getElementById('ctBody').innerHTML = `
    ${ed ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0 12px">
      <button class="btn btn-outline btn-sm" onclick="_ctMelhores()">${lc('star', 13, 'currentColor')} Selecionar os melhores preços</button>
      ${outros.length ? `<select class="inp" style="width:auto;font-size:var(--text-sm);font-weight:600;color:var(--purple);border-color:var(--purple)" onchange="_ctAddForn(+this.value)">
        <option value="">+ Adicionar fornecedor</option>${outros.map(s => `<option value="${s.id}">${_estEsc(s.name)}</option>`).join('')}</select>` : ''}
      <span style="font-size:var(--text-xs);color:var(--muted)">Preço por unidade do insumo (kg, un…). Marque o círculo do fornecedor escolhido. Para tirar um fornecedor, use o × no topo da coluna.</span>
    </div>` : ''}
    ${a.forns.length ? `<div style="overflow:auto;border:1.5px solid var(--border);border-radius:var(--r8)">
      <table style="border-collapse:collapse;font-size:var(--text-md);width:100%">
        <thead style="background:var(--surface2)"><tr>
          <th style="padding:10px;text-align:left;position:sticky;left:0;background:var(--surface2);z-index:2;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase">Produto</th>
          <th style="padding:10px;text-align:left;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;white-space:nowrap">Última compra</th>${head}</tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr style="border-top:1.5px solid var(--border)"><td style="padding:10px;position:sticky;left:0;background:var(--card-bg);font-weight:700">Totais selecionados</td><td></td>${foot}</tr></tfoot>
      </table></div>` : `<div style="padding:30px;text-align:center;color:var(--muted)">Nenhum fornecedor vinculado a esses insumos. Adicione um fornecedor à planilha.</div>`}`;
}

function _ctRenderResumo(totais) {
  const a = _ctAtual;
  const semForn = a.itens.filter(i => !i.fornecedor_id);
  document.getElementById('ctBody').innerHTML = `
    ${semForn.length ? `<div style="padding:10px 14px;border-radius:var(--r8);background:var(--warning-bg);color:var(--warning-fg);font-size:var(--text-sm);margin:6px 0 14px">
      ${semForn.length} item(ns) sem fornecedor escolhido: ${semForn.map(i => _estEsc(i.item_nome)).join(', ')}. Ao concluir, eles voltam a ficar disponíveis para outro lote.</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px;margin-top:6px">
      ${Object.entries(totais).map(([f, r]) => {
        const s = _ctForn(+f), min = _ctMin(+f), abaixo = min > 0 && r.total < min;
        return `<div style="border:1.5px solid ${abaixo ? 'var(--danger-fg)' : 'var(--border)'};border-radius:var(--r12);overflow:hidden;background:var(--card-bg)">
          <div style="padding:12px 14px;background:var(--surface2);display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div><div style="font-size:var(--text-md);font-weight:800">${_estEsc(s?.name || '')}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">${[s?.seller, s?.phone].filter(Boolean).map(_estEsc).join(' · ') || 'sem contato cadastrado'}</div></div>
            <div style="text-align:right"><div style="font-size:var(--text-lg);font-weight:800">${_estR(r.comFrete)}</div>
              ${r.frete ? `<div style="font-size:var(--text-xs);color:var(--muted)">itens ${_estR(r.total)} + entrega ${_estR(r.frete)}</div>` : ''}
              ${min ? `<div style="font-size:var(--text-xs);font-weight:700;color:${abaixo ? 'var(--danger-fg)' : 'var(--success-fg)'}">${abaixo ? `abaixo do mínimo de ${_estR(min)}` : `mínimo ${_estR(min)} ok`}</div>` : ''}</div>
          </div>
          ${r.itens.map(li => { const it = items.find(x => x.id === li.item_id); return `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 14px;border-top:1px solid var(--border);font-size:var(--text-sm)">
            <span>${_estEsc(li.item_nome)}<div style="font-size:var(--text-xs);color:var(--muted)">${_estQ(li.qtd)} ${_estEsc(li.unidade || '')} ${_clEmb(it, li.qtd)} × ${_estR(li.preco)}</div></span>
            <strong style="white-space:nowrap">${_estR(li.qtd * li.preco)}</strong></div>`; }).join('')}
          ${r.frete ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 14px;border-top:1px solid var(--border);font-size:var(--text-sm)"><span>Entrega</span><strong>${_estR(r.frete)}</strong></div>` : ''}
          <div style="padding:10px 14px;border-top:1px solid var(--border)">
            <button class="btn btn-outline btn-sm" style="width:100%" onclick="_ctCopiar(_ctMsgPedido(${f}))">${lc('copy', 13, 'currentColor')} Copiar mensagem do pedido</button></div>
        </div>`;
      }).join('') || `<div style="padding:30px;color:var(--muted)">Nenhum fornecedor escolhido ainda. Volte à planilha e marque os preços.</div>`}
    </div>`;
}

// ── Ações da planilha ──
async function _ctSetPreco(liId, f, v) {
  const preco = v === '' ? null : parseFloat(v);
  const k = liId + '|' + f;
  const atual = _ctAtual.precos.get(k);
  try {
    let row;
    if (atual) row = await cpUpdate('cp_lote_precos', atual.id, { preco });
    else [row] = await cpInsert('cp_lote_precos', { lote_item_id: liId, fornecedor_id: f, preco, criado_por: estUsuario() });
    _ctAtual.precos.set(k, row);
    const li = _ctAtual.itens.find(i => i.id === liId);
    // Mudou o preço do fornecedor escolhido: acompanha
    if (li.fornecedor_id === f) {
      const atualizado = await cpUpdate('cp_lote_itens', liId, preco === null ? { fornecedor_id: null, preco: null } : { preco });
      Object.assign(li, atualizado);
    } else if (!li.fornecedor_id && preco !== null && _ctAtual.forns.filter(x => _ctPreco(li, x) !== null).length === 1) {
      // primeiro preço do item: já escolhe esse fornecedor
      Object.assign(li, await cpUpdate('cp_lote_itens', liId, { fornecedor_id: f, preco }));
    }
    _ctRender();
  } catch (e) { toast('Não salvou o preço: ' + e.message, 'err'); }
}

async function _ctEscolher(liId, f) {
  const li = _ctAtual.itens.find(i => i.id === liId);
  const p = _ctPreco(li, f);
  if (p === null) return toast('Digite o preço antes de escolher', 'err');
  try { Object.assign(li, await cpUpdate('cp_lote_itens', liId, { fornecedor_id: f, preco: p })); _ctRender(); }
  catch (e) { toast(e.message, 'err'); }
}

async function _ctMelhores() {
  let n = 0;
  try {
    for (const li of _ctAtual.itens) {
      const it = items.find(x => x.id === li.item_id);
      const cand = _ctAtual.forns.filter(f => !(it?.supIdExclusivo && it.supIdExclusivo !== f)).map(f => ({ f, p: _ctPreco(li, f) })).filter(x => x.p !== null);
      if (!cand.length) continue;
      const m = cand.sort((a, b) => a.p - b.p)[0];
      if (li.fornecedor_id === m.f && Number(li.preco) === m.p) continue;
      Object.assign(li, await cpUpdate('cp_lote_itens', li.id, { fornecedor_id: m.f, preco: m.p })); n++;
    }
    toast(n ? `${n} item(ns) foram para o melhor preço` : 'Já estava tudo no melhor preço', 'ok');
    _ctRender();
  } catch (e) { toast(e.message, 'err'); }
}

async function _ctRemoverItem(liId) {
  const li = _ctAtual.itens.find(i => i.id === liId);
  try {
    await cpUpdate('cp_lote_itens', liId, { removido_em: new Date().toISOString() });
    await cpUpdate('cp_lista_itens', li.lista_item_id, { lote_id: null });
    _ctAtual.itens = _ctAtual.itens.filter(i => i.id !== liId);
    toast(`${li.item_nome} saiu do lote e voltou a ficar disponível`, 'ok');
    _ctRender();
  } catch (e) { toast(e.message, 'err'); }
}

// ── Mensagens (copiar e colar no WhatsApp) ──
function _ctLinhaMsg(li, comPreco) {
  const it = items.find(x => x.id === li.item_id);
  const emb = it?.qtdEmb > 0 && it?.unidCompra ? ` (${_estQ(li.qtd / it.qtdEmb)} ${it.unidCompra})` : '';
  return `• ${li.item_nome} — ${_estQ(li.qtd)} ${li.unidade || ''}${emb}${comPreco && li.preco ? ` · ${_estR(li.preco)}/${li.unidade || 'un'}` : ''}`;
}
function _ctSaudacao(s) { return `Olá${s?.seller ? ', ' + s.seller.charAt(0) + s.seller.slice(1).toLowerCase() : ''}! Aqui é da Vai Ter Pizza.`; }

function _ctMsgCotacao(f) {
  const s = _ctForn(f);
  const its = _ctAtual.itens.filter(li => { const it = items.find(x => x.id === li.item_id); return !(it?.supIdExclusivo && it.supIdExclusivo !== f); });
  return `${_ctSaudacao(s)}\nPode me passar o preço destes itens?\n\n${its.map(li => _ctLinhaMsg(li, false)).join('\n')}\n\nObrigado!`;
}

function _ctMsgPedido(f) {
  const s = _ctForn(f);
  const its = _ctAtual.itens.filter(li => li.fornecedor_id === f);
  const fr = _ctFrete(f);
  const total = its.reduce((t, li) => t + li.qtd * li.preco, 0) + fr;
  return `${_ctSaudacao(s)}\nSegue nosso pedido:\n\n${its.map(li => _ctLinhaMsg(li, true)).join('\n')}\n\n${fr ? `Entrega: ${_estR(fr)}\n` : ''}Total estimado: ${_estR(total)}\nPode confirmar o pedido e a previsão de entrega? Obrigado!`;
}

async function _ctCopiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada — cole no WhatsApp do fornecedor', 'ok'); }
  catch {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast('Mensagem copiada', 'ok'); } catch { toast('Não consegui copiar automaticamente', 'err'); }
    t.remove();
  }
}

// ── Concluir / cancelar ──
function _ctConcluir() {
  const a = _ctAtual;
  const totais = _ctTotais();
  if (!Object.keys(totais).length) return toast('Escolha o fornecedor de pelo menos um item', 'err');
  const semForn = a.itens.filter(i => !i.fornecedor_id);
  const abaixo = Object.entries(totais).filter(([f, r]) => _ctMin(+f) > 0 && r.total < _ctMin(+f)).map(([f]) => _ctNomeForn(+f));
  vtpConfirm({
    title: 'Concluir lote e gerar pedidos?',
    message: `${Object.keys(totais).length} pedido(s) vão para a aba Recebimento, um por fornecedor, como Rascunho.`
      + (semForn.length ? `\n${semForn.length} item(ns) sem fornecedor voltam a ficar disponíveis para outro lote.` : '')
      + (abaixo.length ? `\nAtenção: abaixo do pedido mínimo — ${abaixo.join(', ')}.` : ''),
    confirmLabel: 'Gerar pedidos', danger: false,
    onConfirm: async () => {
      try {
        const user = estUsuario();
        for (const [f, r] of Object.entries(totais)) {
          const s = _ctForn(+f);
          const [ped] = await cpInsert('cp_pedidos', {
            lote_id: a.lote.id, fornecedor_id: +f, fornecedor_nome: s?.name || _ctNomeForn(+f),
            mensagem: _ctMsgPedido(+f), total_previsto: Math.round(r.comFrete * 100) / 100, frete: r.frete || 0,
            previsao_entrega: s?.prazoEntregaDias > 0 ? cpIso(new Date(Date.now() + s.prazoEntregaDias * 864e5)) : null,
            criado_por: user,
          });
          await cpInsert('cp_pedido_itens', r.itens.map(li => ({
            pedido_id: ped.id, lote_item_id: li.id, item_id: li.item_id, item_nome: li.item_nome, unidade: li.unidade,
            qtd_pedida: li.qtd, preco_combinado: li.preco, criado_por: user,
          })));
        }
        for (const li of semForn) {
          await cpUpdate('cp_lote_itens', li.id, { removido_em: new Date().toISOString() });
          await cpUpdate('cp_lista_itens', li.lista_item_id, { lote_id: null });
        }
        _ctAtual.lote = await cpUpdate('cp_lotes', a.lote.id, { status: 'concluido', concluido_por: user, concluido_em: new Date().toISOString() });
        _ctAtual.itens = _ctAtual.itens.filter(i => i.fornecedor_id);
        toast(`${Object.keys(totais).length} pedido(s) gerados — acompanhe na aba Recebimento`, 'ok');
        _ctRender();
      } catch (e) { toast('Não consegui gerar os pedidos: ' + e.message, 'err'); }
    },
  });
}

function _ctCancelarLote() {
  vtpConfirm({
    title: 'Cancelar este lote?', message: 'Os itens voltam a ficar disponíveis para outro lote. Os preços digitados ficam no histórico.', confirmLabel: 'Cancelar lote',
    onConfirm: async () => {
      try {
        for (const li of _ctAtual.itens) {
          await cpUpdate('cp_lote_itens', li.id, { removido_em: new Date().toISOString() });
          await cpUpdate('cp_lista_itens', li.lista_item_id, { lote_id: null });
        }
        await cpUpdate('cp_lotes', _ctAtual.lote.id, { status: 'cancelado' });
        toast('Lote cancelado', 'ok');
        _ctFechar();
      } catch (e) { toast(e.message, 'err'); }
    },
  });
}

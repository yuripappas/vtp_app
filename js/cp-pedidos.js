/**
 * VTP Compras — Vai Ter Pizza!
 * cp-pedidos.js — Aba "Cotação": um pedido por fornecedor (substitui Lista + Lote)
 *
 * Quadro: Rascunho (montagem / devolvido) → Aguardando aprovação → Aprovado · enviar.
 * Montar: escolhe o fornecedor; a tela lista os insumos dele com estoque, mín/ideal,
 *   sugerido (desconta o que já está em outro pedido aberto do ciclo) e o campo
 *   comprar na embalagem escolhida (unidade base ou apresentação), com a conversão.
 *   Insumos de outros fornecedores aparecem à parte, com "Habilitar" (vincula para sempre).
 * Aprovar: gerente/supervisor ajusta quantidades, aprova ou devolve com comentário.
 * Aprovado: resumo para o fornecedor (copiar / WhatsApp) e "Marquei como enviado",
 *   que manda o pedido para o Recebimento (Pedido solicitado). O preço que vale é o
 *   da nota, conferido no recebimento; aqui o valor é só estimativa.
 */

let _pdDados = null;   // { pedidos, porPedido, ciclo: [{pedido, itens}] }
let _pdAtual = null;   // editor aberto

const PD_ETAPAS = ['montagem', 'devolvido', 'aprovacao', 'aprovado'];
const PD_STATUS = {
  montagem:  { label: 'Rascunho',  cls: 'b-gray'   },
  devolvido: { label: 'Devolvido', cls: 'b-orange' },
  aprovacao: { label: 'Aguardando', cls: 'b-purple' },
  aprovado:  { label: 'Aprovado',  cls: 'b-green'  },
};

// Preço estimado (R$ por unidade do insumo): último pago a este fornecedor → último de qualquer um → custo atual
function _pdPrecoEst(item, forn) {
  return Number(_ctUltimoPrecoForn(item.id, forn)?.precoUnit) || Number(estUltimoPreco(item.id)?.precoUnit) || Number(item.cost) || 0;
}
const _pdAp = pi => pi?.apresentacao && Number(pi.apresentacao.fator) > 0 ? { nome: pi.apresentacao.nome, fator: Number(pi.apresentacao.fator) } : null;

async function _pdCarregar() {
  const ciclo = cpSemana(0);
  const pedidos = await cpSelect('cp_pedidos', q => q.select('*').is('excluido_em', null)
    .or(`status.in.(${PD_ETAPAS.join(',')}),and(status.eq.solicitado,created_at.gte.${ciclo.de})`).order('created_at', { ascending: false }));
  const ids = pedidos.map(p => p.id);
  const itens = ids.length ? (await cpSelect('cp_pedido_itens', q => q.select('*').in('pedido_id', ids))).filter(i => !i.removido_em) : [];
  const porPedido = new Map();
  itens.forEach(i => { if (!porPedido.has(i.pedido_id)) porPedido.set(i.pedido_id, []); porPedido.get(i.pedido_id).push(i); });
  _pdDados = { pedidos, porPedido };
}

// Quanto de cada insumo já está em pedidos abertos do ciclo (exceto o pedido informado)
function _pdEmOutros(itemId, excetoId) {
  const out = [];
  for (const p of (_pdDados?.pedidos || [])) {
    if (p.id === excetoId) continue;
    const i = (_pdDados.porPedido.get(p.id) || []).find(x => x.item_id === itemId);
    if (i) out.push({ forn: p.fornecedor_nome, qtd: Number(i.qtd_pedida) || 0, status: p.status });
  }
  return out;
}

const _pdTotal = its => its.reduce((s, i) => s + (Number(i.qtd_pedida) || 0) * (Number(i.preco_combinado) || 0), 0);

// ── Aba (quadro) ───────────────────────────────────────────────

async function cpRenderAbaPedidos(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  if (!_pdDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando pedidos…</div>`;
    try { await _pdCarregar(); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar os pedidos: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaPedidos(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cpAbaBody') || _cpAba !== 'cotacao') return;   // trocou de aba enquanto carregava
  const { pedidos, porPedido } = _pdDados;
  const col = sts => pedidos.filter(p => sts.includes(p.status));
  const card = p => {
    const its = porPedido.get(p.id) || [];
    const st = PD_STATUS[p.status];
    const quem = p.status === 'aprovado' ? `aprovado por ${p.aprovado_por || '—'}` : p.status === 'aprovacao' ? `enviado por ${p.enviado_aprovacao_por || p.criado_por}` : `por ${p.criado_por}`;
    const resumo = p.status === 'aprovado' ? `<div style="font-size:var(--text-xs);color:var(--text2);line-height:1.5;padding:8px 10px;border-radius:var(--r8);background:var(--surface2)">
        ${its.slice(0, 4).map(i => `• ${_estEsc(i.item_nome)} — ${_estEsc(estQtdApresentacao(i.qtd_pedida, i.unidade, _pdAp(i)))}`).join('<br>')}${its.length > 4 ? `<br><span style="color:var(--muted)">+ ${its.length - 4} item(ns)</span>` : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">
        <button class="btn btn-outline btn-xs" onclick="_pdCopiar('${p.id}')">${lc('copy', 12, 'currentColor')} Copiar</button>
        <button class="btn btn-outline btn-xs" onclick="_pdWhatsApp('${p.id}')">${lc('message-circle', 12, 'currentColor')} WhatsApp</button>
        <button class="btn btn-primary btn-xs" onclick="_pdMarcarEnviado('${p.id}')">${lc('send', 12, '#fff')} Marquei como enviado</button>
      </div>` : '';
    return `<div onclick="cpAbrirPedido('${p.id}')" style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r10);padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:8px"
        onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--card-border)'">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-size:var(--text-md);font-weight:700;line-height:1.3">${_estEsc(p.fornecedor_nome)}</div>
        <span class="badge ${st.cls}" style="font-size:var(--text-2xs);white-space:nowrap">${st.label}</span>
      </div>
      ${p.status === 'devolvido' && p.comentario_aprovacao ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);line-height:1.4">"${_estEsc(p.comentario_aprovacao)}"</div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:var(--text-sm)">
        <span style="color:var(--text2)">${its.length} ${its.length === 1 ? 'item' : 'itens'}</span>
        <strong title="Estimado pelo último preço">${_estR(_pdTotal(its))}</strong>
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(quem)} · ${_estDH(p.updated_at || p.created_at)}</div>
      ${resumo}
    </div>`;
  };
  const coluna = (titulo, icon, ls, vazio) => `<div style="background:var(--surface2);border-radius:var(--r12);padding:12px;min-height:200px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:700;color:var(--text2)">${lc(icon, 14, 'currentColor')} ${titulo}
      <span class="badge b-gray" style="margin-left:auto">${ls.length}</span></div>
    ${ls.length ? ls.map(card).join('') : `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--muted);text-align:center;padding:16px">${vazio}</div>`}
  </div>`;
  const ciclo = cpSemana(0);
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <button class="btn btn-primary" onclick="cpNovoPedido()">${lc('plus', 15, '#fff')} Novo pedido</button>
      <span style="font-size:var(--text-sm);color:var(--muted)">Ciclo de compras: ${cpDataBr(ciclo.de)} a ${cpDataBr(ciclo.ate)} · um pedido por fornecedor</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="cpRenderAbaPedidos(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
      ${coluna('Rascunho', 'edit-3', col(['montagem', 'devolvido']), 'Clique em Novo pedido e escolha o fornecedor')}
      ${coluna('Aguardando aprovação', 'clock', col(['aprovacao']), 'Nenhum pedido esperando o supervisor')}
      ${coluna('Aprovado · enviar ao fornecedor', 'check-circle', col(['aprovado']), 'Depois de enviar, o pedido vai para o Recebimento')}
    </div>`;
}

// ── Novo pedido: escolhe o fornecedor ──────────────────────────

function cpNovoPedido() {
  const forns = (typeof suppliers !== 'undefined' ? suppliers : []).filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const nItens = f => items.filter(i => i.active !== false && !i.isProd && _clDoFornecedor(i, f.id)).length;
  _estModal('ovPdNovo', 'Novo pedido', `
    ${_estCampo('Fornecedor *', `<select class="inp" id="pdForn"><option value="">— Selecionar —</option>
      ${forns.map(s => `<option value="${s.id}">${_estEsc(s.name)} · ${nItens(s)} insumo(s)</option>`).join('')}</select>`)}
    <div style="font-size:var(--text-xs);color:var(--muted);line-height:1.5">A tela abre com os insumos deste fornecedor e a sugestão pelo estoque. Insumos de outros fornecedores aparecem no fim, para habilitar se precisar.</div>`,
    '_pdCriar()', 'Montar pedido', 520);
}

function _pdCriar() {
  const f = +document.getElementById('pdForn').value;
  if (!f) return toast('Escolha o fornecedor', 'err');
  document.getElementById('ovPdNovo')?.remove();
  const aberto = (_pdDados?.pedidos || []).find(p => p.fornecedor_id === f && ['montagem', 'devolvido'].includes(p.status));
  if (aberto) { toast('Já existe um rascunho para este fornecedor: abri ele', 'info'); return cpAbrirPedido(aberto.id); }
  _pdAbrirEditor({ pedido: null, forn: f, modo: 'editar' });
}

function cpAbrirPedido(id) {
  const p = _pdDados?.pedidos.find(x => x.id === id);
  if (!p) return;
  const modo = ['montagem', 'devolvido'].includes(p.status) ? 'editar'
    : p.status === 'aprovacao' && _clPodeAprovar() ? 'aprovar' : 'ver';
  _pdAbrirEditor({ pedido: p, forn: p.fornecedor_id, modo });
}

// ══════════════════════════════════════════════════════════════
// EDITOR (tela cheia): montar · aprovar · ver
// ══════════════════════════════════════════════════════════════

async function _pdAbrirEditor({ pedido, forn, modo }) {
  document.getElementById('ovPdEd')?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'ovPdEd';
  ov.innerHTML = `<div class="modal" style="width:1120px;max-width:calc(100vw - 24px);height:calc(100vh - 32px);display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
    <div id="pdHead" style="padding:18px 22px;border-bottom:1px solid var(--border)"></div>
    <div id="pdBody" style="flex:1;overflow-y:auto;padding:14px 22px"><div style="padding:60px;text-align:center;color:var(--muted)">${lc('refresh-cw', 16, 'currentColor')} Calculando a sugestão pelo estoque…</div></div>
    <div id="pdFoot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--border)"></div>
  </div>`;
  document.body.appendChild(ov);

  let saldos = null;
  try { saldos = await estSaldos(); } catch (e) { console.warn('[pedido] saldo:', e.message); }
  const doBanco = pedido ? (_pdDados?.porPedido.get(pedido.id) || []) : [];
  const linhas = new Map();
  for (const it of items.filter(i => i.active !== false && !i.isProd)) {
    const saldo = saldos?.porItem.get(it.id)?.total ?? (Number(it.qty) || 0);
    const outros = _pdEmOutros(it.id, pedido?.id);
    const jaPedido = outros.reduce((s, o) => s + o.qtd, 0);
    const sugerida = Math.max(0, _estRound(_clSugestao(it, saldo) - jaPedido));
    linhas.set(it.id, { item: it, saldo, outros, sugerida, habil: _clDoFornecedor(it, forn), marcado: false,
      ap: cpApPadrao(it), n: null, nAprov: null, preco: _pdPrecoEst(it, forn), rowId: null });
  }
  for (const r of doBanco) {
    const it = items.find(i => i.id === r.item_id) || { id: r.item_id, name: r.item_nome, unit: r.unidade, cat: r.categoria };
    const base = linhas.get(r.item_id) || { item: it, saldo: 0, outros: [], sugerida: 0, habil: true, preco: Number(r.preco_combinado) || 0 };
    const ap = _pdAp(r), f = ap?.fator || 1;
    const n = _estRound((Number(r.qtd_pedida) || 0) / f);
    linhas.set(r.item_id, { ...base, marcado: true, ap, n, nAprov: n, rowId: r.id, preco: Number(r.preco_combinado) || base.preco });
  }
  // Pedido novo: já vem marcado o que o estoque sugere, na embalagem padrão (arredondado para cima)
  if (!pedido) for (const l of linhas.values()) if (l.habil && l.sugerida > 0) { l.marcado = true; l.n = _pdSugN(l); }
  _pdAtual = { pedido, forn, modo, linhas, q: '', filtro: pedido ? 'na_lista' : 'sugestao', cat: '', verOutros: false };
  _pdRender();
}

const _pdF = l => l.ap?.fator > 0 ? l.ap.fator : 1;
const _pdQtd = (l, aprov = false) => (Number(aprov ? l.nAprov : l.n) || 0) * _pdF(l);
const _pdSugN = l => l.sugerida > 0 ? (l.ap ? Math.ceil(l.sugerida / _pdF(l) - 1e-9) : _estRound(l.sugerida)) : null;
const _pdUn = l => l.ap ? l.ap.nome : (l.item.unit || 'un');

function _pdRender() {
  const a = _pdAtual;
  if (!a) return;
  const p = a.pedido, s = cpFornecedor(a.forn);
  const marcadas = [...a.linhas.values()].filter(x => x.marcado);
  const valor = marcadas.reduce((t, x) => t + _pdQtd(x, a.modo === 'aprovar') * x.preco, 0);
  const tituloModo = { editar: p?.status === 'devolvido' ? 'Corrigir pedido devolvido' : 'Montar pedido', aprovar: 'Aprovar pedido', ver: 'Pedido' }[a.modo];
  document.getElementById('pdHead').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">${tituloModo}${p ? ` · ${PD_STATUS[p.status]?.label || p.status}` : ''}</div>
        <div style="font-size:var(--text-xl);font-weight:800">${_estEsc(s?.name || p?.fornecedor_nome || 'Fornecedor')}</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:2px">${s?.seller ? _estEsc(s.seller) + ' · ' : ''}${s?.pedidoMinimo > 0 ? `pedido mínimo ${_estR(s.pedidoMinimo)} · ` : ''}${p ? `criado por ${_estEsc(p.criado_por)} em ${_estDH(p.created_at)}` : 'novo'}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center">
        <div style="text-align:right"><div style="font-size:var(--text-xs);color:var(--muted)">${marcadas.length} ${marcadas.length === 1 ? 'item' : 'itens'} · estimado</div><div id="pdTotal" style="font-size:var(--text-xl);font-weight:800">${_estR(valor)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="_pdFechar()">${lc('x', 16, 'currentColor')}</button>
      </div>
    </div>
    ${p?.status === 'devolvido' && p.comentario_aprovacao ? `<div style="margin-top:10px;padding:9px 12px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm)">
      Devolvido por ${_estEsc(p.aprovado_por || '')}: "${_estEsc(p.comentario_aprovacao)}"</div>` : ''}`;

  const q = a.q.toLowerCase();
  const todas = [...a.linhas.values()];
  const busca = x => !q || x.item.name.toLowerCase().includes(q) || (x.item.cat || '').toLowerCase().includes(q);
  let doForn, outros = [];
  if (a.modo === 'editar') {
    let base = todas.filter(x => x.habil || x.marcado);
    if (a.cat) base = base.filter(x => (x.item.cat || 'Outros') === a.cat);
    a.contas = Object.fromEntries(Object.keys(_CL_FILTROS).map(f => [f, base.filter(x => _CL_FILTROS[f].teste(x)).length]));
    doForn = base.filter(x => _CL_FILTROS[a.filtro].teste(x)).filter(busca);
    outros = todas.filter(x => !x.habil && !x.marcado && (!a.cat || (x.item.cat || 'Outros') === a.cat)).filter(busca);
  } else doForn = todas.filter(x => x.marcado).filter(busca);

  const th = (t, al = 'right') => `<th style="padding:8px 10px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${t}</th>`;
  const tabela = (ls, fora = false) => {
    const porCat = {};
    ls.forEach(x => { (porCat[x.item.cat || 'Outros'] ||= []).push(x); });
    return Object.keys(porCat).sort().map(cat => `
      <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px">${_estEsc(cat)}</div>
      <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
          <thead style="background:var(--surface2)"><tr>${a.modo === 'editar' && !fora ? '<th></th>' : ''}${th('Insumo', 'left')}${th('Estoque')}${th('Mín / ideal')}${th('Sugerido')}${fora ? th('') : th(a.modo === 'aprovar' ? 'Aprovar' : 'Comprar', 'left') + th('Estimado')}</tr></thead>
          <tbody>${porCat[cat].sort((x, y) => x.item.name.localeCompare(y.item.name)).map(x => _pdLinhaHtml(x, fora)).join('')}</tbody>
        </table></div>`).join('');
  };
  const catsLista = [...new Set(todas.filter(x => x.habil || x.marcado).map(x => x.item.cat || 'Outros'))].sort();
  document.getElementById('pdBody').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <input class="inp" id="pdBusca" placeholder="Buscar insumo…" value="${_estEsc(a.q)}" style="max-width:320px;font-size:var(--text-md)"
        oninput="_pdAtual.q=this.value;clearTimeout(window._pdQT);window._pdQT=setTimeout(()=>{_pdRender();const b=document.getElementById('pdBusca');b.focus();b.setSelectionRange(b.value.length,b.value.length)},200)">
      ${a.modo === 'editar' && catsLista.length > 1 ? `<select class="inp" style="width:auto;font-size:var(--text-sm)" onchange="_pdAtual.cat=this.value;_pdRender()">
        <option value="">Todas as categorias</option>${catsLista.map(c => `<option value="${_estEsc(c)}"${c === a.cat ? ' selected' : ''}>${_estEsc(c)}</option>`).join('')}</select>` : ''}
      ${a.modo === 'aprovar' ? `<span style="font-size:var(--text-sm);color:var(--text2)">Ajuste as quantidades se precisar. Zero corta o item.</span>` : ''}
    </div>
    ${a.modo === 'editar' ? `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      ${Object.entries(_CL_FILTROS).map(([id, f]) => { const on = a.filtro === id; return `<button onclick="_pdAtual.filtro='${id}';_pdRender()" title="${f.dica}"
        style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
        border:1.5px solid ${on ? f.cor : 'var(--border)'};background:${on ? f.bg : 'var(--card-bg)'};color:${on ? f.cor : 'var(--text2)'}">${id === 'na_lista' ? 'No pedido' : f.label} <span style="opacity:.75">${a.contas[id]}</span></button>`; }).join('')}
    </div>` : ''}
    ${doForn.length ? tabela(doForn) : `<div style="padding:30px;text-align:center;color:var(--muted)">${a.modo === 'editar' ? `Nenhum insumo deste fornecedor em "${_CL_FILTROS[a.filtro].label}". Experimente "Todos".` : 'Nenhum item'}</div>`}
    ${a.modo === 'editar' && outros.length ? `<div style="margin-top:18px;border-top:1.5px dashed var(--border);padding-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="_pdAtual.verOutros=!_pdAtual.verOutros;_pdRender()">${lc(a.verOutros ? 'chevron-down' : 'chevron-right', 14, 'currentColor')} Outros insumos (não habilitados para este fornecedor) · ${outros.length}</button>
      ${a.verOutros ? `<div style="opacity:.85">${tabela(outros, true)}</div>` : ''}</div>` : ''}`;

  const f = document.getElementById('pdFoot');
  if (a.modo === 'editar') {
    f.innerHTML = `${p ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger-fg)" onclick="_pdExcluir()">Excluir pedido</button>` : '<span style="margin-right:auto"></span>'}
      <button class="btn btn-outline" onclick="_pdSalvar(false)">Salvar rascunho</button>
      <button class="btn btn-primary" onclick="_pdSalvar(true)">${lc('send', 14, '#fff')} Enviar para aprovação</button>`;
  } else if (a.modo === 'aprovar') {
    f.innerHTML = `<input class="inp" id="pdComentario" placeholder="Comentário (obrigatório para devolver)" style="margin-right:auto;max-width:420px">
      <button class="btn btn-outline" style="color:var(--orange-dark)" onclick="_pdDevolver()">${lc('corner-up-left', 14, 'currentColor')} Devolver</button>
      <button class="btn btn-primary" onclick="_pdAprovar()">${lc('check', 14, '#fff')} Aprovar pedido</button>`;
  } else if (p?.status === 'aprovado') {
    f.innerHTML = `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger-fg)" onclick="_pdExcluir()">Excluir pedido</button>
      <button class="btn btn-outline" onclick="_pdCopiar('${p.id}')">${lc('copy', 14, 'currentColor')} Copiar resumo</button>
      <button class="btn btn-outline" onclick="_pdWhatsApp('${p.id}')">${lc('message-circle', 14, 'currentColor')} WhatsApp</button>
      <button class="btn btn-primary" onclick="_pdMarcarEnviado('${p.id}')">${lc('send', 14, '#fff')} Marquei como enviado</button>`;
  } else {
    const aguard = p?.status === 'aprovacao';
    f.innerHTML = `<span style="margin-right:auto;font-size:var(--text-sm);color:var(--muted);align-self:center">${aguard ? 'Aguardando aprovação de gerente ou supervisor.' : ''}</span>
      ${aguard && p.criado_por === estUsuario() ? `<button class="btn btn-outline" onclick="_pdRetirar()">Retirar para editar</button>` : ''}
      <button class="btn btn-primary" onclick="_pdFechar()">Fechar</button>`;
  }
}

function _pdLinhaHtml(x, fora) {
  const a = _pdAtual, it = x.item, id = it.id, u = it.unit || 'un';
  const corSaldo = it.min > 0 && x.saldo < it.min ? 'var(--danger-fg)' : 'var(--text)';
  const ops = cpApOpcoes(it, x.ap);
  const sel = ops.findIndex(o => (o.nome || null) === (x.ap?.nome || null) && Math.abs(o.fator - _pdF(x)) < 1e-6);
  const sugN = _pdSugN(x);
  const sug = x.sugerida > 0 ? `${x.ap ? `${sugN} ${_estEsc(x.ap.nome)}` : `${_estQ(x.sugerida)} ${_estEsc(u)}`}${x.ap ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-weight:400">(${_estQ(sugN * _pdF(x))} ${_estEsc(u)})</div>` : ''}` : '—';
  const outros = x.outros.length ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);font-weight:600">${lc('alert-triangle', 11, 'currentColor')} Em pedido p/ ${x.outros.map(o => `${_estEsc(o.forn)} (${_estQ(o.qtd)} ${_estEsc(u)})`).join(', ')} neste ciclo</div>` : '';
  const ultimo = estUltimoPreco(id);
  const nome = `<td style="padding:8px 10px"><div style="font-weight:600;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${_estEsc(it.name)}${_clSituacao(x)}${x.marcado && !x.habil ? '<span class="badge b-gray" style="font-size:var(--text-2xs)">outro fornecedor</span>' : ''}</div>
    ${outros}${ultimo ? `<div style="font-size:var(--text-xs);color:var(--muted)">últ. compra ${_estR(ultimo.precoUnit)}/${_estEsc(u)} · ${_estEsc(ultimo.fornecedorNome || '')}</div>` : ''}</td>`;
  const cols = `<td style="padding:8px 10px;text-align:right;white-space:nowrap;color:${corSaldo}">${_estQ(x.saldo)} ${_estEsc(u)}</td>
    <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${it.min ? _estQ(it.min) : '—'} / ${it.ideal ? _estQ(it.ideal) : '—'}</td>`;
  if (fora) return `<tr style="border-top:1px solid var(--border)">${nome}${cols}
    <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:var(--muted)">${sug}</td>
    <td style="padding:8px 10px;text-align:right"><button class="btn btn-outline btn-xs" onclick="_pdHabilitar(${id})">${lc('plus', 12, 'currentColor')} Habilitar</button></td></tr>`;
  const editavel = a.modo === 'editar' ? x.marcado : a.modo === 'aprovar';
  const campoN = a.modo === 'aprovar' ? 'nAprov' : 'n';
  const nVal = x[campoN];
  const mudou = a.modo === 'aprovar' && Math.abs((x.nAprov ?? 0) - (x.n ?? 0)) > 0.0005;
  const comprar = editavel ? `<div style="display:flex;align-items:center;gap:6px">
      ${mudou ? `<span style="font-size:var(--text-xs);color:var(--muted);text-decoration:line-through">${_estQ(x.n)}</span>` : ''}
      <input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(nVal)}" style="width:80px;text-align:right;font-weight:700;${mudou ? 'border-color:var(--purple)' : ''}" oninput="_pdSetN(${id}, this.value)">
      <select class="inp" style="width:auto;max-width:190px;font-size:var(--text-sm)" onchange="_pdSetAp(${id}, this.value)">${ops.map((o, k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${o.nome ? `${_estEsc(o.nome)}` : _estEsc(u)}</option>`).join('')}</select></div>
    <div id="pdConv${id}" style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${_pdConv(x)}</div>`
    : `<div style="font-weight:700">${x.marcado ? _estEsc(estQtdApresentacao(_pdQtd(x), u, x.ap)) : '—'}</div>`;
  return `<tr style="border-top:1px solid var(--border);${a.modo === 'editar' && !x.marcado ? 'opacity:.6' : ''}">
    ${a.modo === 'editar' ? `<td style="padding:8px 10px;width:28px"><input type="checkbox" ${x.marcado ? 'checked' : ''} onchange="_pdToggle(${id}, this.checked)" style="accent-color:var(--purple);width:16px;height:16px"></td>` : ''}
    ${nome}${cols}
    <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:${x.sugerida > 0 ? 'var(--purple)' : 'var(--muted)'};font-weight:600">${x.sugerida > 0 && editavel ? `<span style="cursor:pointer;text-decoration:underline dotted" title="Usar o sugerido" onclick="_pdUsarSug(${id})">${sug}</span>` : sug}</td>
    <td style="padding:8px 10px;min-width:230px">${comprar}</td>
    <td id="pdEst${id}" style="padding:8px 10px;text-align:right;white-space:nowrap">${_estR(_pdQtd(x, a.modo === 'aprovar') * x.preco)}<div style="font-size:var(--text-2xs);color:var(--muted)">${x.preco ? `${_estR(x.preco * _pdF(x))}/${_estEsc(_pdUn(x))}` : 'sem preço'}</div></td>
  </tr>`;
}

function _pdConv(x) {
  const q = _pdQtd(x, _pdAtual.modo === 'aprovar');
  if (_pdAtual.modo === 'aprovar' && !(q > 0)) return '<span style="color:var(--danger-fg)">cortado</span>';
  return x.ap && q > 0 ? `= ${_estQ(q)} ${_estEsc(x.item.unit || '')}` : '';
}

function _pdAtualizarValores(id) {
  const a = _pdAtual, x = a.linhas.get(id), ap = a.modo === 'aprovar';
  const cel = document.getElementById('pdEst' + id);
  if (cel) cel.innerHTML = `${_estR(_pdQtd(x, ap) * x.preco)}<div style="font-size:var(--text-2xs);color:var(--muted)">${x.preco ? `${_estR(x.preco * _pdF(x))}/${_estEsc(_pdUn(x))}` : 'sem preço'}</div>`;
  const c = document.getElementById('pdConv' + id); if (c) c.innerHTML = _pdConv(x);
  const t = document.getElementById('pdTotal');
  if (t) t.textContent = _estR([...a.linhas.values()].filter(l => l.marcado).reduce((s, l) => s + _pdQtd(l, ap) * l.preco, 0));
}

function _pdSetN(id, v) {
  const x = _pdAtual.linhas.get(id);
  x[_pdAtual.modo === 'aprovar' ? 'nAprov' : 'n'] = cpNum(v);
  _pdAtualizarValores(id);
}
function _pdSetAp(id, v) {
  const x = _pdAtual.linhas.get(id);
  const o = cpApOpcoes(x.item, x.ap)[+v] || { nome: null, fator: 1 };
  const campo = _pdAtual.modo === 'aprovar' ? 'nAprov' : 'n';
  const q = _pdQtd(x, campo === 'nAprov');
  const qOrig = _pdQtd(x);
  x.ap = o.nome ? { nome: o.nome, fator: o.fator } : null;
  // Mantém a quantidade real; arredonda para cima quando muda para embalagem
  const conv = qq => qq > 0 ? (x.ap ? Math.ceil(qq / o.fator - 1e-9) : _estRound(qq)) : x[campo];
  if (campo === 'nAprov') { x.nAprov = conv(q); x.n = x.n != null ? _estRound(qOrig / o.fator) : x.n; }
  else x.n = conv(q);
  _pdRender();
}
function _pdUsarSug(id) {
  const x = _pdAtual.linhas.get(id);
  x[_pdAtual.modo === 'aprovar' ? 'nAprov' : 'n'] = _pdSugN(x);
  _pdRender();
}
function _pdToggle(id, on) {
  const x = _pdAtual.linhas.get(id);
  x.marcado = on;
  if (on && !(x.n > 0)) x.n = _pdSugN(x) || 1;
  _pdRender();
}

// Habilitar: vincula o insumo ao fornecedor para sempre e já marca no pedido
function _pdHabilitar(id) {
  const a = _pdAtual, x = a.linhas.get(id), it = x.item;
  const s = cpFornecedor(a.forn);
  const ex = it.supIdExclusivo && it.supIdExclusivo !== a.forn ? cpFornecedor(it.supIdExclusivo)?.name : null;
  vtpConfirm({
    title: `Habilitar ${it.name} para ${s?.name || 'este fornecedor'}?`,
    message: `O insumo passa a aparecer nos pedidos deste fornecedor.${ex ? ` Hoje ele é exclusivo de ${ex}: deixa de ser exclusivo.` : ''}`,
    confirmLabel: 'Habilitar', danger: false,
    onConfirm: () => {
      const ids = [...new Set([...(it.supIds?.length ? it.supIds : it.supId ? [it.supId] : []), a.forn])];
      it.supIds = ids;
      if (ex) it.supIdExclusivo = null;
      if (typeof saveI === 'function') saveI();
      x.habil = true; x.marcado = true;
      if (!(x.n > 0)) x.n = _pdSugN(x) || 1;
      x.preco = _pdPrecoEst(it, a.forn) || x.preco;
      toast(`${it.name} habilitado para ${s?.name || 'o fornecedor'}`, 'ok');
      _pdRender();
    },
  });
}

function _pdFechar() {
  document.getElementById('ovPdEd')?.remove();
  _pdAtual = null;
  if (_cpAba === 'cotacao') cpRenderAbaPedidos(true);
}

// ── Salvar / enviar / aprovar ──

async function _pdSalvarItens(pedido, campoN) {
  const a = _pdAtual, user = estUsuario();
  const novos = [];
  for (const x of a.linhas.values()) {
    const qtd = _estRound(_pdQtd(x, campoN === 'nAprov'));
    const campos = { qtd_pedida: qtd, apresentacao: x.ap || null, preco_combinado: x.preco || null };
    if (x.marcado && qtd > 0 && x.rowId) await cpUpdate('cp_pedido_itens', x.rowId, { ...campos, removido_em: null });
    else if (x.marcado && qtd > 0) novos.push({ pedido_id: pedido.id, item_id: x.item.id, item_nome: x.item.name, unidade: x.item.unit || null, ...campos, criado_por: user });
    else if (x.rowId) await cpUpdate('cp_pedido_itens', x.rowId, { removido_em: new Date().toISOString() });
  }
  if (novos.length) await cpInsert('cp_pedido_itens', novos);
  const total = [...a.linhas.values()].filter(x => x.marcado).reduce((s, x) => s + _pdQtd(x, campoN === 'nAprov') * x.preco, 0);
  return Math.round(total * 100) / 100;
}

async function _pdSalvar(enviar) {
  const a = _pdAtual;
  const marcadas = [...a.linhas.values()].filter(x => x.marcado);
  if (enviar && !marcadas.length) return toast('Marque pelo menos um item', 'err');
  if (marcadas.some(x => !(x.n > 0))) return toast('Todo item marcado precisa de quantidade', 'err');
  try {
    const user = estUsuario();
    let p = a.pedido;
    if (!p) {
      const s = cpFornecedor(a.forn);
      [p] = await cpInsert('cp_pedidos', { fornecedor_id: a.forn, fornecedor_nome: s?.name || `Fornecedor ${a.forn}`, status: 'montagem', criado_por: user });
    }
    const total = await _pdSalvarItens(p, 'n');
    await cpUpdate('cp_pedidos', p.id, enviar
      ? { total_previsto: total, status: 'aprovacao', enviado_aprovacao_por: user, enviado_aprovacao_em: new Date().toISOString() }
      : { total_previsto: total });
    toast(enviar ? 'Pedido enviado para aprovação' : 'Rascunho salvo', 'ok');
    _pdFechar();
  } catch (e) { toast('Não consegui salvar: ' + e.message, 'err'); }
}

function _pdRetirar() {
  cpUpdate('cp_pedidos', _pdAtual.pedido.id, { status: 'montagem' })
    .then(p => { _pdAtual.pedido = p; _pdAtual.modo = 'editar'; _pdRender(); })
    .catch(e => toast(e.message, 'err'));
}

function _pdExcluir() {
  vtpConfirm({
    title: 'Excluir este pedido?', message: 'Ele sai do quadro, mas fica no histórico com o seu nome.', confirmLabel: 'Excluir',
    onConfirm: () => cpUpdate('cp_pedidos', _pdAtual.pedido.id, { excluido_em: new Date().toISOString(), excluido_por: estUsuario() })
      .then(() => { toast('Pedido excluído', 'ok'); _pdFechar(); }).catch(e => toast(e.message, 'err')),
  });
}

async function _pdAprovar() {
  if (!_clPodeAprovar()) return toast('Só gerente ou supervisor aprova', 'err');
  const a = _pdAtual;
  const comentario = document.getElementById('pdComentario')?.value.trim() || null;
  if (![...a.linhas.values()].some(x => x.marcado && x.nAprov > 0)) return toast('Todos os itens foram cortados: devolva o pedido em vez de aprovar', 'err');
  try {
    const total = await _pdSalvarItens(a.pedido, 'nAprov');
    await cpUpdate('cp_pedidos', a.pedido.id, { status: 'aprovado', total_previsto: total, aprovado_por: estUsuario(), aprovado_em: new Date().toISOString(), comentario_aprovacao: comentario });
    toast('Pedido aprovado: agora é enviar ao fornecedor', 'ok');
    _pdFechar();
  } catch (e) { toast('Não consegui aprovar: ' + e.message, 'err'); }
}

async function _pdDevolver() {
  if (!_clPodeAprovar()) return toast('Só gerente ou supervisor devolve', 'err');
  const comentario = document.getElementById('pdComentario')?.value.trim();
  if (!comentario) return toast('Escreva o que precisa mudar antes de devolver', 'err');
  try {
    const total = await _pdSalvarItens(_pdAtual.pedido, 'nAprov');
    await cpUpdate('cp_pedidos', _pdAtual.pedido.id, { status: 'devolvido', total_previsto: total, aprovado_por: estUsuario(), comentario_aprovacao: comentario });
    toast('Pedido devolvido ao comprador', 'ok');
    _pdFechar();
  } catch (e) { toast('Não consegui devolver: ' + e.message, 'err'); }
}

// ── Resumo para o fornecedor / envio ──

function _pdMensagem(p) {
  const s = cpFornecedor(p.fornecedor_id);
  const its = _pdDados?.porPedido.get(p.id) || [];
  return `${_ctSaudacao(s)}\nSegue nosso pedido:\n\n${its.map(i => `• ${i.item_nome} — ${estQtdApresentacao(i.qtd_pedida, i.unidade, _pdAp(i))}`).join('\n')}\n\nPode confirmar o pedido, os valores e a previsão de entrega? Obrigado!`;
}
const _pdPed = id => _pdDados?.pedidos.find(x => x.id === id);
function _pdCopiar(id) { const p = _pdPed(id); if (p) _ctCopiar(_pdMensagem(p)); }
function _pdWhatsApp(id) {
  const p = _pdPed(id); if (!p) return;
  const s = cpFornecedor(p.fornecedor_id);
  let tel = cpSoDigitos(s?.phone || s?.whatsapp || '');
  if (tel && tel.length <= 11) tel = '55' + tel;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(_pdMensagem(p))}`;
  if (!tel) toast('Fornecedor sem telefone no cadastro: escolha o contato no WhatsApp', 'info');
  window.open(url, '_blank', 'noopener');
}

function _pdMarcarEnviado(id) {
  const p = _pdPed(id); if (!p) return;
  const s = cpFornecedor(p.fornecedor_id);
  vtpConfirm({
    title: 'Pedido enviado ao fornecedor?', message: `${p.fornecedor_nome} · vai para a aba Recebimento como "Pedido solicitado".`,
    confirmLabel: 'Sim, enviei', danger: false,
    onConfirm: async () => {
      try {
        await cpUpdate('cp_pedidos', id, { status: 'solicitado', solicitado_por: estUsuario(), solicitado_em: new Date().toISOString(), mensagem: _pdMensagem(p),
          previsao_entrega: s?.prazoEntregaDias > 0 ? cpIso(new Date(Date.now() + s.prazoEntregaDias * 864e5)) : null });
        toast('Pedido solicitado: acompanhe no Recebimento', 'ok');
        document.getElementById('ovPdEd')?.remove(); _pdAtual = null;
        _rcDados = null;
        cpRenderAbaPedidos(true);
      } catch (e) { toast(e.message, 'err'); }
    },
  });
}

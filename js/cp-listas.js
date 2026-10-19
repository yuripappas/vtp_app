/**
 * VTP Compras — Vai Ter Pizza!
 * cp-listas.js — Aba "Lista de compra"
 *
 * O comprador monta listas (ex.: Laticínios, Higiene e Limpeza) a partir do
 * estoque: a sugestão é ideal − saldo, arredondada para a embalagem de compra.
 * Gerente ou supervisor aprova (podendo mudar quantidades ou cortar itens) ou
 * devolve com comentário. Várias listas por semana; as aprovadas são
 * arquivadas quando a semana de compras (segunda a domingo) vira.
 *
 * Kanban: Rascunho (inclui devolvidas) → Aguardando aprovação → Aprovadas.
 * Processados não entram (são produção interna).
 */

let _clDados = null;   // { listas, itens: Map listaId → [linhas] }
let _clAtual = null;   // editor aberto

const _clPodeAprovar = () => ['gerente', 'supervisor'].includes((typeof getCurrentUser === 'function' ? getCurrentUser() : null)?.role);
const _clAtivo = l => !l.removido_em;

async function _clCarregar() {
  const semAtual = cpSemana(0).de;
  let listas = await cpSelect('cp_listas', q => q.select('*').is('excluido_em', null).neq('status', 'arquivada').order('created_at', { ascending: false }));
  // Virou a semana: aprovadas de semanas anteriores vão para o arquivo
  const velhas = listas.filter(l => l.status === 'aprovada' && l.semana_inicio < semAtual);
  for (const l of velhas) {
    try { await cpUpdate('cp_listas', l.id, { status: 'arquivada', arquivada_em: new Date().toISOString() }); } catch (e) { console.warn('[listas] arquivar:', e.message); }
  }
  listas = listas.filter(l => !velhas.includes(l));
  const ids = listas.map(l => l.id);
  const itens = ids.length ? await cpSelect('cp_lista_itens', q => q.select('*').in('lista_id', ids)) : [];
  const porLista = new Map();
  itens.filter(_clAtivo).forEach(i => { if (!porLista.has(i.lista_id)) porLista.set(i.lista_id, []); porLista.get(i.lista_id).push(i); });
  _clDados = { listas, porLista, arquivadasAgora: velhas.length };
  return _clDados;
}

const _clValor = (linhas, campo = 'qtd_solicitada') => linhas.reduce((s, i) => {
  const q = campo === 'qtd_aprovada' ? (i.qtd_aprovada ?? i.qtd_solicitada) : i.qtd_solicitada;
  return s + (Number(q) || 0) * (items.find(x => x.id === i.item_id)?.cost || 0);
}, 0);

// ── Aba ────────────────────────────────────────────────────────

async function cpRenderAbaListas(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  if (!_clDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando listas…</div>`;
    try { await _clCarregar(); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar as listas: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaListas(true)">Tentar de novo</button></div>`;
      return;
    }
    if (_clDados.arquivadasAgora) toast(`${_clDados.arquivadasAgora} lista(s) aprovada(s) da semana passada foram para o arquivo`, 'ok');
  }
  if (!document.getElementById('cpAbaBody')) return;
  const { listas, porLista } = _clDados;
  const col = sts => listas.filter(l => sts.includes(l.status));
  const STATUS = {
    rascunho:   { label: 'Rascunho',   cls: 'b-gray'   },
    devolvida:  { label: 'Devolvida',  cls: 'b-orange' },
    aguardando: { label: 'Aguardando', cls: 'b-purple' },
    aprovada:   { label: 'Aprovada',   cls: 'b-green'  },
  };
  const card = l => {
    const linhas = porLista.get(l.id) || [];
    const valor = _clValor(linhas, l.status === 'aprovada' ? 'qtd_aprovada' : 'qtd_solicitada');
    const st = STATUS[l.status];
    const quem = l.status === 'aprovada' ? `aprovada por ${l.aprovado_por}` : l.status === 'aguardando' ? `enviada por ${l.enviado_por || l.criado_por}` : `por ${l.criado_por}`;
    const cotados = linhas.filter(i => i.lote_id).length;
    return `<div onclick="cpAbrirLista('${l.id}')" style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r10);padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:6px"
        onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--card-border)'">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-size:var(--text-md);font-weight:700;line-height:1.3">${_estEsc(l.nome)}</div>
        <span class="badge ${st.cls}" style="font-size:var(--text-2xs);white-space:nowrap">${st.label}</span>
      </div>
      ${l.status === 'devolvida' && l.comentario_aprovacao ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);line-height:1.4">"${_estEsc(l.comentario_aprovacao)}"</div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:var(--text-sm)">
        <span style="color:var(--text2)">${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}${l.status === 'aprovada' && linhas.length ? ` · ${cotados}/${linhas.length} em cotação` : ''}</span>
        <strong>${_estR(valor)}</strong>
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted)">semana de ${cpDataBr(l.semana_inicio)} · ${_estEsc(quem)}</div>
    </div>`;
  };
  const coluna = (titulo, icon, ls, vazio) => `<div style="background:var(--surface2);border-radius:var(--r12);padding:12px;min-height:180px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:700;color:var(--text2)">${lc(icon, 14, 'currentColor')} ${titulo}
      <span class="badge b-gray" style="margin-left:auto">${ls.length}</span></div>
    ${ls.length ? ls.map(card).join('') : `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--muted);text-align:center;padding:16px">${vazio}</div>`}
  </div>`;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <button class="btn btn-primary" onclick="cpNovaLista()">${lc('plus', 14, '#fff')} Nova lista</button>
      <span style="font-size:var(--text-sm);color:var(--muted)">Semana de compras: ${cpDataBr(cpSemana(0).de)} a ${cpDataBr(cpSemana(0).ate)}</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="cpListasArquivadas()">${lc('archive', 13, 'currentColor')} Arquivadas</button>
        <button class="btn btn-ghost btn-sm" onclick="cpRenderAbaListas(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(240px,1fr));gap:12px;overflow-x:auto">
      ${coluna('Rascunho', 'edit-3', col(['rascunho', 'devolvida']), 'Clique em Nova lista para começar')}
      ${coluna('Aguardando aprovação', 'clock', col(['aguardando']), 'Nenhuma lista esperando o gerente')}
      ${coluna('Aprovadas', 'check-circle', col(['aprovada']), 'As aprovadas vão para a Cotação')}
    </div>`;
}

// ── Nova lista ─────────────────────────────────────────────────

function cpNovaLista() {
  const cats = [...new Set(items.filter(i => i.active !== false && !i.isProd).map(i => i.cat || 'Outros'))].sort();
  _estModal('ovClNova', 'Nova lista de compra', `
    ${_estCampo('Nome da lista *', `<input class="inp" id="clnNome" placeholder="ex: Laticínios, Higiene e Limpeza, Geral">`)}
    <div class="field"><label>Categorias <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional — deixe vazio para ver todas)</span></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${cats.map(c => `<label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1.5px solid var(--border);border-radius:99px;font-size:var(--text-xs);font-weight:600;cursor:pointer;text-transform:none;letter-spacing:0;color:var(--text2)">
        <input type="checkbox" class="clnCat" value="${_estEsc(c)}" style="accent-color:var(--purple)" onchange="const n=document.getElementById('clnNome');if(!n.dataset.mexeu){const s=[...document.querySelectorAll('.clnCat:checked')].map(x=>x.value);n.value=s.length===1?s[0].charAt(0)+s[0].slice(1).toLowerCase():''}">${_estEsc(c)}</label>`).join('')}</div></div>
    <div style="font-size:var(--text-xs);color:var(--muted)">A lista abre com a sugestão do estoque: o que está abaixo do ideal, arredondado para a embalagem de compra. Você marca o que vai comprar e ajusta.</div>`,
    '_clCriar()', 'Montar lista', 620);
  document.getElementById('clnNome').oninput = e => { e.target.dataset.mexeu = '1'; };
}

function _clCriar() {
  const nome = document.getElementById('clnNome').value.trim();
  if (!nome) return toast('Dê um nome para a lista', 'err');
  const cats = [...document.querySelectorAll('.clnCat:checked')].map(x => x.value);
  document.getElementById('ovClNova')?.remove();
  _clAbrirEditor({ lista: null, nome, cats, modo: 'editar' });
}

function cpAbrirLista(id) {
  const l = _clDados?.listas.find(x => x.id === id);
  if (!l) return;
  const modo = ['rascunho', 'devolvida'].includes(l.status) ? 'editar'
    : l.status === 'aguardando' && _clPodeAprovar() ? 'aprovar' : 'ver';
  _clAbrirEditor({ lista: l, nome: l.nome, cats: l.cats || [], modo });
}

// ══════════════════════════════════════════════════════════════
// EDITOR (tela cheia): montar · aprovar · ver
// ══════════════════════════════════════════════════════════════

// Sugestão de compra: ideal − saldo (ou mínimo, se não houver ideal), em embalagens
function _clSugestao(item, saldo) {
  const alvo = item.ideal > 0 ? item.ideal : item.min > 0 ? item.min : 0;
  let falta = alvo - Math.max(saldo, 0);
  if (!(falta > 0.0005)) return 0;
  if (item.qtdEmb > 0) falta = Math.ceil(falta / item.qtdEmb - 0.0001) * item.qtdEmb;
  return _estRound(falta);
}
const _clEmb = (item, q) => item?.qtdEmb > 0 && item?.unidCompra && q > 0 ? `= ${_estQ(q / item.qtdEmb)} ${_estEsc(item.unidCompra)}` : '';

async function _clAbrirEditor({ lista, nome, cats, modo }) {
  document.getElementById('ovClEd')?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'ovClEd';
  ov.innerHTML = `<div class="modal" style="width:1080px;max-width:calc(100vw - 24px);height:calc(100vh - 32px);display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
    <div id="clHead" style="padding:18px 22px;border-bottom:1px solid var(--border)"></div>
    <div id="clBody" style="flex:1;overflow-y:auto;padding:14px 22px"><div style="padding:60px;text-align:center;color:var(--muted)">${lc('refresh-cw', 16, 'currentColor')} Calculando a sugestão pelo estoque…</div></div>
    <div id="clFoot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--border)"></div>
  </div>`;
  document.body.appendChild(ov);

  let saldos = null;
  try { saldos = await estSaldos(); } catch (e) { console.warn('[listas] saldo:', e.message); }
  const doBanco = lista ? (_clDados?.porLista.get(lista.id) || []) : [];
  const linhas = new Map();
  const candidatos = items.filter(i => i.active !== false && !i.isProd && (!cats.length || cats.includes(i.cat || 'Outros')));
  for (const it of candidatos) {
    const saldo = saldos?.porItem.get(it.id)?.total ?? (Number(it.qty) || 0);
    linhas.set(it.id, { item: it, saldo, sugerida: _clSugestao(it, saldo), marcado: false, qtd: null, obs: '', rowId: null, qtdAprov: null });
  }
  for (const r of doBanco) {
    const it = items.find(i => i.id === r.item_id) || { id: r.item_id, name: r.item_nome, unit: r.unidade, cat: r.categoria };
    const base = linhas.get(r.item_id) || { item: it, saldo: Number(r.saldo_ref) || 0, sugerida: Number(r.qtd_sugerida) || 0 };
    linhas.set(r.item_id, { ...base, marcado: true, qtd: Number(r.qtd_solicitada), obs: r.obs || '', rowId: r.id,
      qtdAprov: r.qtd_aprovada !== null ? Number(r.qtd_aprovada) : Number(r.qtd_solicitada), loteId: r.lote_id });
  }
  // Lista nova: já vem marcado o que o estoque sugere
  if (!lista) for (const l of linhas.values()) if (l.sugerida > 0) { l.marcado = true; l.qtd = l.sugerida; }
  _clAtual = { lista, nome, cats, modo, linhas, q: '', filtro: lista ? 'na_lista' : 'sugestao', forn: '', cat: '' };
  _clRender();
}

function _clRender() {
  const a = _clAtual;
  if (!a) return;
  const l = a.lista;
  const marcadas = [...a.linhas.values()].filter(x => x.marcado);
  const valor = marcadas.reduce((s, x) => s + (Number(a.modo === 'editar' ? x.qtd : x.qtdAprov) || 0) * (x.item.cost || 0), 0);
  const tituloModo = { editar: l?.status === 'devolvida' ? 'Corrigir lista devolvida' : 'Montar lista', aprovar: 'Aprovar lista', ver: 'Lista' }[a.modo];

  document.getElementById('clHead').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700">${tituloModo}</div>
        ${a.modo === 'editar' ? `<input class="inp" value="${_estEsc(a.nome)}" oninput="_clAtual.nome=this.value" style="font-size:var(--text-xl);font-weight:800;border:none;padding:2px 0;background:transparent;width:420px;max-width:70vw">`
          : `<div style="font-size:var(--text-xl);font-weight:800">${_estEsc(a.nome)}</div>`}
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:2px">${a.cats.length ? _estEsc(a.cats.join(', ')) : 'Todas as categorias'}${l ? ` · semana de ${cpDataBr(l.semana_inicio)} · criada por ${_estEsc(l.criado_por)}` : ''}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center">
        <div style="text-align:right"><div style="font-size:var(--text-xs);color:var(--muted)">${marcadas.length} ${marcadas.length === 1 ? 'item' : 'itens'} · estimado</div><div id="clTotal" style="font-size:var(--text-xl);font-weight:800">${_estR(valor)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="_clFechar()">${lc('x', 16, 'currentColor')}</button>
      </div>
    </div>
    ${l?.status === 'devolvida' && l.comentario_aprovacao ? `<div style="margin-top:10px;padding:9px 12px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm)">
      Devolvida por ${_estEsc(l.aprovado_por || '')}: "${_estEsc(l.comentario_aprovacao)}"</div>` : ''}`;

  // Corpo — filtros de necessidade (só ao montar)
  const q = a.q.toLowerCase();
  const todas = [...a.linhas.values()];
  let base = todas;
  if (a.modo === 'editar') {
    if (a.forn) base = base.filter(x => _clDoFornecedor(x.item, +a.forn));
    if (a.cat) base = base.filter(x => (x.item.cat || 'Outros') === a.cat);
  }
  const conta = f => base.filter(x => _CL_FILTROS[f].teste(x)).length;
  let vis = a.modo !== 'editar' ? todas.filter(x => x.marcado) : base.filter(x => _CL_FILTROS[a.filtro].teste(x));
  if (q) vis = vis.filter(x => x.item.name.toLowerCase().includes(q) || (x.item.cat || '').toLowerCase().includes(q));
  window._clVisiveis = vis.map(x => x.item.id);
  const porCat = {};
  vis.forEach(x => { (porCat[x.item.cat || 'Outros'] ||= []).push(x); });
  const th = (t, al = 'right') => `<th style="padding:8px 10px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${t}</th>`;
  const linhaHtml = x => {
    const it = x.item, id = it.id, u = _estEsc(it.unit || '');
    const corSaldo = it.min > 0 && x.saldo < it.min ? 'var(--danger-fg)' : 'var(--text)';
    const ultimo = estUltimoPreco(id);
    let qtdCel;
    if (a.modo === 'editar') {
      qtdCel = `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
        <input class="inp" type="number" min="0" step="${it.qtdEmb > 0 ? it.qtdEmb : 0.001}" value="${x.qtd ?? ''}" placeholder="${x.sugerida || ''}" ${x.marcado ? '' : 'disabled'}
          style="width:100px;text-align:right;font-weight:700" oninput="_clSetQtd(${id}, this.value)"><span style="width:28px;font-size:var(--text-xs);color:var(--muted)">${u}</span></div>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-align:right" id="clEmb${id}">${_clEmb(it, x.qtd)}</div>`;
    } else if (a.modo === 'aprovar') {
      const mudou = Math.abs((x.qtdAprov ?? 0) - (x.qtd ?? 0)) > 0.0005;
      qtdCel = `<div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
        <span style="font-size:var(--text-xs);color:var(--muted);${mudou ? 'text-decoration:line-through' : ''}">${_estQ(x.qtd)}</span>
        <input class="inp" type="number" min="0" step="${it.qtdEmb > 0 ? it.qtdEmb : 0.001}" value="${x.qtdAprov ?? ''}" style="width:100px;text-align:right;font-weight:700;${mudou ? 'border-color:var(--purple)' : ''}" oninput="_clSetAprov(${id}, this.value)">
        <span style="width:28px;font-size:var(--text-xs);color:var(--muted)">${u}</span></div>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-align:right">${(x.qtdAprov ?? 0) === 0 ? '<span style="color:var(--danger-fg)">cortado</span>' : _clEmb(it, x.qtdAprov)}</div>`;
    } else {
      const ap = l?.status === 'aprovada' || l?.status === 'arquivada';
      const q2 = ap ? x.qtdAprov : x.qtd;
      qtdCel = `<div style="text-align:right;font-weight:700">${_estQ(q2)} ${u}</div>
        ${ap && Math.abs((x.qtdAprov ?? 0) - (x.qtd ?? 0)) > 0.0005 ? `<div style="font-size:var(--text-2xs);color:var(--muted);text-align:right">pedido ${_estQ(x.qtd)} ${u}</div>` : ''}
        ${x.loteId ? `<div style="font-size:var(--text-2xs);color:var(--purple);text-align:right">em cotação</div>` : ''}`;
    }
    return `<tr style="border-top:1px solid var(--border);${a.modo === 'editar' && !x.marcado ? 'opacity:.6' : ''}">
      ${a.modo === 'editar' ? `<td style="padding:8px 10px;width:28px"><input type="checkbox" ${x.marcado ? 'checked' : ''} onchange="_clToggle(${id}, this.checked)" style="accent-color:var(--purple);width:16px;height:16px"></td>` : ''}
      <td style="padding:8px 10px"><div style="font-weight:600;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${_estEsc(it.name)}${_clSituacao(x)}</div>
        ${ultimo ? `<div style="font-size:var(--text-xs);color:var(--muted)">últ. compra ${_estR(ultimo.precoUnit)} · ${_estEsc(ultimo.fornecedorNome || '')}</div>` : ''}</td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:${corSaldo}">${_estQ(x.saldo)} ${u}</td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${it.min ? _estQ(it.min) : '—'} / ${it.ideal ? _estQ(it.ideal) : '—'}</td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:${x.sugerida > 0 ? 'var(--purple)' : 'var(--muted)'};font-weight:600">${x.sugerida > 0 ? _estQ(x.sugerida) + ' ' + u : '—'}</td>
      <td style="padding:8px 10px;min-width:170px">${qtdCel}</td>
      <td id="clEst${id}" style="padding:8px 10px;text-align:right;white-space:nowrap">${_estR((Number(a.modo === 'editar' ? x.qtd : x.qtdAprov) || 0) * (it.cost || 0))}</td>
    </tr>`;
  };
  document.getElementById('clBody').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <input class="inp" id="clBusca" placeholder="Buscar item…" value="${_estEsc(a.q)}" style="max-width:320px;font-size:var(--text-md)"
        oninput="_clAtual.q=this.value;clearTimeout(window._clQT);window._clQT=setTimeout(()=>{_clRender();const b=document.getElementById('clBusca');b.focus();b.setSelectionRange(b.value.length,b.value.length)},200)">
      ${a.modo === 'editar' ? (() => {
        const fornIds = [...new Set(todas.flatMap(x => _clFornsDoItem(x.item)))].filter(f => cpFornecedor(f)).sort((f1, f2) => cpFornecedor(f1).name.localeCompare(cpFornecedor(f2).name));
        const catsLista = [...new Set(todas.map(x => x.item.cat || 'Outros'))].sort();
        return `${fornIds.length ? `<select class="inp" style="width:auto;font-size:var(--text-sm)" onchange="_clAtual.forn=this.value;_clRender()">
          <option value="">Todos os fornecedores</option>${fornIds.map(f => `<option value="${f}"${String(f) === a.forn ? ' selected' : ''}>${_estEsc(cpFornecedor(f).name)}</option>`).join('')}</select>` : ''}
        ${catsLista.length > 1 ? `<select class="inp" style="width:auto;font-size:var(--text-sm)" onchange="_clAtual.cat=this.value;_clRender()">
          <option value="">Todas as categorias</option>${catsLista.map(c => `<option value="${_estEsc(c)}"${c === a.cat ? ' selected' : ''}>${_estEsc(c)}</option>`).join('')}</select>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          ${Object.entries(_CL_FILTROS).map(([id, f]) => { const on = a.filtro === id; return `<button onclick="_clAtual.filtro='${id}';_clRender()" title="${f.dica}"
            style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
            border:1.5px solid ${on ? f.cor : 'var(--border)'};background:${on ? f.bg : 'var(--card-bg)'};color:${on ? f.cor : 'var(--text2)'}">${f.label} <span style="opacity:.75">${conta(id)}</span></button>`; }).join('')}
          <span style="margin-left:auto;display:flex;gap:6px">
            <button class="btn btn-outline btn-xs" onclick="_clMarcarVisiveis(true)" title="Marca os itens da tela com a quantidade sugerida">${lc('check-square', 12, 'currentColor')} Marcar visíveis</button>
            <button class="btn btn-ghost btn-xs" onclick="_clMarcarVisiveis(false)">Desmarcar visíveis</button>
          </span>`;
      })() : ''}
      ${a.modo === 'aprovar' ? `<span style="font-size:var(--text-sm);color:var(--text2)">Ajuste as quantidades se precisar. Zero corta o item.</span>` : ''}
    </div>
    ${Object.keys(porCat).sort().map(cat => `
      <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px">${_estEsc(cat)}</div>
      <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
          <thead style="background:var(--surface2)"><tr>${a.modo === 'editar' ? '<th></th>' : ''}${th('Item', 'left')}${th('Saldo')}${th('Mín / ideal')}${th('Sugerido')}${th(a.modo === 'aprovar' ? 'Aprovar' : 'Comprar')}${th('Estimado')}</tr></thead>
          <tbody>${porCat[cat].sort((p, q2) => p.item.name.localeCompare(q2.item.name)).map(linhaHtml).join('')}</tbody>
        </table></div>`).join('')}
    ${!vis.length ? `<div style="padding:40px;text-align:center;color:var(--muted)">${a.modo === 'editar' ? `Nenhum item em "${_CL_FILTROS[a.filtro].label}" com esses filtros. Experimente "Todos".` : 'Nenhum item'}</div>` : ''}`;

  // Rodapé
  const f = document.getElementById('clFoot');
  if (a.modo === 'editar') {
    f.innerHTML = `${l ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--danger-fg)" onclick="_clExcluir()">Excluir lista</button>` : '<span style="margin-right:auto"></span>'}
      <button class="btn btn-outline" onclick="_clSalvar(false)">Salvar rascunho</button>
      <button class="btn btn-primary" onclick="_clSalvar(true)">${lc('send', 14, '#fff')} Enviar para aprovação</button>`;
  } else if (a.modo === 'aprovar') {
    f.innerHTML = `<input class="inp" id="clComentario" placeholder="Comentário (obrigatório para devolver)" style="margin-right:auto;max-width:420px">
      <button class="btn btn-outline" style="color:var(--orange-dark)" onclick="_clDevolver()">${lc('corner-up-left', 14, 'currentColor')} Devolver</button>
      <button class="btn btn-primary" onclick="_clAprovar()">${lc('check', 14, '#fff')} Aprovar lista</button>`;
  } else {
    const aguard = l?.status === 'aguardando';
    f.innerHTML = `<span style="margin-right:auto;font-size:var(--text-sm);color:var(--muted);align-self:center">${aguard ? 'Aguardando aprovação de gerente ou supervisor.' : l?.aprovado_por ? `Aprovada por ${_estEsc(l.aprovado_por)} em ${_estDH(l.aprovado_em)}${l.comentario_aprovacao ? ` · "${_estEsc(l.comentario_aprovacao)}"` : ''}` : ''}</span>
      ${aguard && l.criado_por === estUsuario() ? `<button class="btn btn-outline" onclick="_clRetirar()">Retirar para editar</button>` : ''}
      <button class="btn btn-primary" onclick="_clFechar()">Fechar</button>`;
  }
}

// Filtros de necessidade de estoque (chips do editor)
const _clZerado = x => x.saldo <= 0.0005;
const _clAbaixoMin = x => x.item.min > 0 && x.saldo < x.item.min;
const _CL_FILTROS = {
  sugestao: { label: 'Precisa comprar', dica: 'Abaixo do ideal (tem sugestão de compra)', cor: 'var(--purple)', bg: 'var(--purple-xlight)', teste: x => x.sugerida > 0 },
  zerado:   { label: 'Zerados',        dica: 'Saldo zero ou negativo', cor: 'var(--danger-fg)', bg: 'var(--danger-bg)', teste: _clZerado },
  minimo:   { label: 'Abaixo do mínimo', dica: 'Saldo menor que o estoque mínimo', cor: 'var(--orange-dark)', bg: 'var(--orange-light)', teste: _clAbaixoMin },
  na_lista: { label: 'Na lista',       dica: 'Itens já marcados nesta lista', cor: 'var(--success-fg)', bg: 'var(--success-bg)', teste: x => x.marcado },
  todos:    { label: 'Todos',          dica: 'Todos os insumos, para escolher à mão', cor: 'var(--text)', bg: 'var(--surface2)', teste: () => true },
};
function _clSituacao(x) {
  if (_clZerado(x)) return `<span class="badge b-red" style="font-size:var(--text-2xs)">Zerado</span>`;
  if (_clAbaixoMin(x)) return `<span class="badge b-orange" style="font-size:var(--text-2xs)">Abaixo do mínimo</span>`;
  return '';
}
const _clFornsDoItem = it => [...new Set([...(it.supIds || []), it.supId, it.supIdExclusivo].filter(Boolean))];
const _clDoFornecedor = (it, f) => it.supIdExclusivo ? it.supIdExclusivo === f : _clFornsDoItem(it).includes(f);

function _clMarcarVisiveis(on) {
  let n = 0;
  for (const id of (window._clVisiveis || [])) {
    const x = _clAtual.linhas.get(id);
    if (!x || x.marcado === on) continue;
    x.marcado = on; n++;
    if (on && !(x.qtd > 0)) x.qtd = x.sugerida > 0 ? x.sugerida : (x.item.qtdEmb > 0 ? x.item.qtdEmb : 1);
  }
  toast(on ? `${n} item(ns) marcados` : `${n} item(ns) desmarcados`, 'ok');
  _clRender();
}

function _clFechar() {
  document.getElementById('ovClEd')?.remove();
  _clAtual = null;
  if (_cpAba === 'listas') cpRenderAbaListas(true);
}

function _clToggle(id, on) {
  const x = _clAtual.linhas.get(id);
  x.marcado = on;
  if (on && !(x.qtd > 0)) x.qtd = x.sugerida > 0 ? x.sugerida : (x.item.qtdEmb > 0 ? x.item.qtdEmb : 1);
  _clRender();
}
// Atualiza o estimado da linha e o total do topo sem redesenhar (mantém o foco)
function _clAtualizarValores(id) {
  const a = _clAtual, x = a.linhas.get(id);
  const q = Number(a.modo === 'editar' ? x.qtd : x.qtdAprov) || 0;
  const cel = document.getElementById('clEst' + id); if (cel) cel.textContent = _estR(q * (x.item.cost || 0));
  const total = [...a.linhas.values()].filter(l => l.marcado)
    .reduce((s, l) => s + (Number(a.modo === 'editar' ? l.qtd : l.qtdAprov) || 0) * (l.item.cost || 0), 0);
  const t = document.getElementById('clTotal'); if (t) t.textContent = _estR(total);
}
function _clSetQtd(id, v) {
  const x = _clAtual.linhas.get(id);
  x.qtd = v === '' ? null : parseFloat(v);
  const e = document.getElementById('clEmb' + id); if (e) e.innerHTML = _clEmb(x.item, x.qtd);
  _clAtualizarValores(id);
}
function _clSetAprov(id, v) {
  _clAtual.linhas.get(id).qtdAprov = v === '' ? 0 : parseFloat(v);
  _clAtualizarValores(id);
}

// ── Salvar / enviar ──
async function _clSalvar(enviar) {
  const a = _clAtual;
  const marcadas = [...a.linhas.values()].filter(x => x.marcado);
  if (!a.nome.trim()) return toast('Dê um nome para a lista', 'err');
  if (enviar && !marcadas.length) return toast('Marque pelo menos um item', 'err');
  if (marcadas.some(x => !(x.qtd > 0))) return toast('Todo item marcado precisa de quantidade', 'err');
  try {
    const user = estUsuario();
    let lista = a.lista;
    if (!lista) {
      [lista] = await cpInsert('cp_listas', { nome: a.nome.trim(), semana_inicio: cpSemana(0).de, status: 'rascunho', cats: a.cats.length ? a.cats : null, criado_por: user });
    } else if (lista.nome !== a.nome.trim()) {
      lista = await cpUpdate('cp_listas', lista.id, { nome: a.nome.trim() });
    }
    const novos = [];
    for (const x of a.linhas.values()) {
      const campos = { qtd_solicitada: _estRound(x.qtd || 0), saldo_ref: _estRound(x.saldo), qtd_sugerida: x.sugerida, minimo: x.item.min || 0, ideal: x.item.ideal || 0 };
      if (x.marcado && x.rowId) await cpUpdate('cp_lista_itens', x.rowId, { ...campos, qtd_aprovada: null, removido_em: null });
      else if (x.marcado) novos.push({ lista_id: lista.id, item_id: x.item.id, item_nome: x.item.name, unidade: x.item.unit || null, categoria: x.item.cat || null, ...campos, criado_por: user });
      else if (x.rowId) await cpUpdate('cp_lista_itens', x.rowId, { removido_em: new Date().toISOString() });
    }
    if (novos.length) await cpInsert('cp_lista_itens', novos);
    if (enviar) await cpUpdate('cp_listas', lista.id, { status: 'aguardando', enviado_por: user, enviado_em: new Date().toISOString() });
    toast(enviar ? 'Lista enviada para aprovação' : 'Rascunho salvo', 'ok');
    _clFechar();
  } catch (e) { toast('Não consegui salvar: ' + e.message, 'err'); }
}

function _clRetirar() {
  cpUpdate('cp_listas', _clAtual.lista.id, { status: 'rascunho' })
    .then(l => { _clAtual.lista = l; _clAtual.modo = 'editar'; _clRender(); })
    .catch(e => toast(e.message, 'err'));
}

function _clExcluir() {
  vtpConfirm({
    title: 'Excluir esta lista?', message: 'Ela sai do quadro, mas fica no histórico com o seu nome.', confirmLabel: 'Excluir',
    onConfirm: () => cpUpdate('cp_listas', _clAtual.lista.id, { excluido_em: new Date().toISOString(), excluido_por: estUsuario() })
      .then(() => { toast('Lista excluída', 'ok'); _clFechar(); }).catch(e => toast(e.message, 'err')),
  });
}

// ── Aprovar / devolver ──
async function _clAprovar() {
  if (!_clPodeAprovar()) return toast('Só gerente ou supervisor aprova', 'err');
  const a = _clAtual;
  const comentario = document.getElementById('clComentario')?.value.trim() || null;
  const marcadas = [...a.linhas.values()].filter(x => x.marcado);
  if (!marcadas.some(x => x.qtdAprov > 0)) return toast('Todos os itens foram cortados — devolva a lista em vez de aprovar', 'err');
  try {
    for (const x of marcadas) {
      const q = _estRound(x.qtdAprov || 0);
      await cpUpdate('cp_lista_itens', x.rowId, q > 0 ? { qtd_aprovada: q } : { qtd_aprovada: 0, removido_em: new Date().toISOString() });
    }
    await cpUpdate('cp_listas', a.lista.id, { status: 'aprovada', aprovado_por: estUsuario(), aprovado_em: new Date().toISOString(), comentario_aprovacao: comentario });
    toast('Lista aprovada — já pode ir para a Cotação', 'ok');
    _clFechar();
  } catch (e) { toast('Não consegui aprovar: ' + e.message, 'err'); }
}

async function _clDevolver() {
  if (!_clPodeAprovar()) return toast('Só gerente ou supervisor devolve', 'err');
  const comentario = document.getElementById('clComentario')?.value.trim();
  if (!comentario) return toast('Escreva o que precisa mudar antes de devolver', 'err');
  try {
    // O que o aprovador ajustou volta como quantidade da lista (zero tira o item)
    for (const x of [..._clAtual.linhas.values()].filter(l => l.marcado && l.rowId)) {
      const q = _estRound(x.qtdAprov ?? x.qtd ?? 0);
      if (Math.abs(q - (x.qtd || 0)) <= 0.0005) continue;
      await cpUpdate('cp_lista_itens', x.rowId, q > 0 ? { qtd_solicitada: q, qtd_aprovada: null } : { removido_em: new Date().toISOString() });
    }
    await cpUpdate('cp_listas', _clAtual.lista.id, { status: 'devolvida', aprovado_por: estUsuario(), comentario_aprovacao: comentario });
    toast('Lista devolvida ao comprador', 'ok');
    _clFechar();
  } catch (e) { toast('Não consegui devolver: ' + e.message, 'err'); }
}

// ── Arquivadas ──
async function cpListasArquivadas() {
  let ls = [];
  try { ls = await cpSelect('cp_listas', q => q.select('*').is('excluido_em', null).eq('status', 'arquivada').order('semana_inicio', { ascending: false })); }
  catch (e) { return toast(e.message, 'err'); }
  _estModal('ovClArq', 'Listas arquivadas', ls.length ? ls.map(l => `
    <div onclick="document.getElementById('ovClArq').remove();_clAbrirArquivada('${l.id}')" style="display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid var(--border);cursor:pointer;font-size:var(--text-sm)">
      <span><strong>${_estEsc(l.nome)}</strong> · semana de ${cpDataBr(l.semana_inicio)}</span>
      <span style="color:var(--muted)">aprovada por ${_estEsc(l.aprovado_por || '—')}</span></div>`).join('')
    : '<div style="color:var(--muted)">Nenhuma lista arquivada ainda.</div>', `document.getElementById('ovClArq').remove()`, 'Fechar', 600);
}

async function _clAbrirArquivada(id) {
  try {
    const [l] = await cpSelect('cp_listas', q => q.select('*').eq('id', id));
    const itens = await cpSelect('cp_lista_itens', q => q.select('*').eq('lista_id', id));
    _clDados = _clDados || { listas: [], porLista: new Map() };
    _clDados.porLista.set(id, itens.filter(_clAtivo));
    _clAbrirEditor({ lista: l, nome: l.nome, cats: l.cats || [], modo: 'ver' });
  } catch (e) { toast(e.message, 'err'); }
}

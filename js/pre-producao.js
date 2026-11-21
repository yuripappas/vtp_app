/**
 * VTP Compras — Vai Ter Pizza!
 * pre-producao.js — Módulo Pré-produção (abas: Previsão do dia · Ordens · Agenda · Etiquetas)
 *
 * Ordens (aba principal):
 *  • Em cima, "O que precisa produzir": processados abaixo do ideal (saldo real
 *    do estoque), com sugerido = ideal − estoque − o que já está em ordem aberta.
 *    Marca vários e cria uma ordem só.
 *  • Embaixo, o quadro do dia: A fazer → Em produção → Concluídas.
 *  • Ordem tem vários itens; cada item é PREPARAR (receita: consome os insumos
 *    da ficha e dá entrada no processado) ou PORCIONAR (só registra as porções,
 *    não mexe no estoque). Ex.: Mussarela em Barra → Preparar Mussarela
 *    Triturada → Porcionar Mussarela Triturada.
 *  • Ao criar, gera a requisição de insumos para a Cozinha Produção
 *    (js/estoque-req.js) — o estoque entrega por transferência.
 *  • Concluir item (com o login de quem fez): insumos usados (vêm da ficha,
 *    editáveis) + quanto rendeu. Movimentações: 'consumo_producao' dos insumos
 *    (saem da Cozinha Produção) e 'producao' do processado.
 * Agenda: a semana, com preparo e porcionamento separados.
 *
 * Dados: pp_ordens / pp_ordem_itens (migration 20261115120000). As ordens
 * antigas (vtp_ordens) ficam só para os Relatórios.
 */

const PP_STATUS = {
  a_fazer:     { label: 'A fazer',     cls: 'b-gray'   },
  em_producao: { label: 'Em produção', cls: 'b-yellow' },
  concluida:   { label: 'Concluída',   cls: 'b-green'  },
  cancelada:   { label: 'Cancelada',   cls: 'b-gray'   },
};
const PP_TIPOS = {
  preparar:  { label: 'Preparar',  icon: 'chef-hat', desc: 'Receita: usa os insumos da ficha e dá entrada no processado' },
  porcionar: { label: 'Porcionar', icon: 'scale',    desc: 'Separa em porções; não mexe no estoque' },
};
const PP_TOL_RENDIMENTO = 5;   // ± % aceitável contra a ficha

function ppPodeCriar() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return false;
  if (u.role === 'gerente') return true;
  const atual = (typeof users !== 'undefined' && users.find(x => x.id === u.id)) || u;
  return (typeof getUserPerms === 'function' ? getUserPerms(atual) : []).includes('Pré-produção: Criar ordens');
}

const _ppEsc = s => _estEsc(s);
const _ppHoje = () => cpIso(new Date());
const _ppDataBr = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '';
const _ppTipoPill = (t, curto) => `<span class="pp-tipo ${t}" title="${PP_TIPOS[t]?.label || t}"${curto ? ' style="padding:3px 4px"' : ''}>${lc(PP_TIPOS[t]?.icon || 'chef-hat', curto ? 11 : 10, 'currentColor')}${curto ? '' : ' ' + (PP_TIPOS[t]?.label || t)}</span>`;

// Insumos da ficha para produzir `qtd` (na unidade do processado) — 1 nível,
// mesma conta do CMV: peso_g/1000 × qtd / rendimento_kg.
function ppNecessidadeFicha(itemId, qtd) {
  const it = items.find(i => i.id === itemId);
  const ft = it?.isProd ? it.fichaTecnica : null;
  if (!ft?.ingredientes?.length || !(qtd > 0)) return [];
  const rend = Number(ft.rendimento_kg) || 1;
  const acc = new Map();
  for (const ing of ft.ingredientes) {
    if (ing.item_id == null || !(ing.peso_g > 0)) continue;
    acc.set(ing.item_id, (acc.get(ing.item_id) || 0) + ing.peso_g / 1000 * qtd / rend);
  }
  return [...acc].map(([id, q]) => {
    const ins = items.find(i => i.id === id);
    return { item_id: id, nome: ins?.name || `Item ${id}`, unidade: ins?.unit || '', qtd: _estRound(q) };
  });
}
const ppTemFicha = it => !!(it?.isProd && it.fichaTecnica?.ingredientes?.length);

// ── Dados ──────────────────────────────────────────────────────

let _ppDados = null;    // { ordens, itens: Map ordemId → [itens], reqs: Map ordemId → req }
let _ppSaldos = null;
let _ppSel = new Set();
let _ppVerTodos = false;
let _ppMais = false;
const PP_LINHAS_PRECISA = 8;

async function _ppBuscar(montar) {
  const ordens = await cpSelect('pp_ordens', montar);
  const ids = ordens.map(o => o.id);
  const [linhas, reqs] = ids.length ? await Promise.all([
    cpSelect('pp_ordem_itens', q => q.select('*').in('ordem_id', ids).order('ordem_pos')),
    cpSelect('est_requisicoes', q => q.select('id, numero, status, ordem_id, destino').in('ordem_id', ids)),
  ]) : [[], []];
  const itens = new Map(ordens.map(o => [o.id, []]));
  linhas.forEach(l => itens.get(l.ordem_id)?.push(l));
  const reqMap = new Map();
  reqs.filter(r => r.status !== 'cancelada').forEach(r => reqMap.set(r.ordem_id, r));
  return { ordens, itens, reqs: reqMap };
}

// Abertas + as dos últimos 7 dias
function _ppCarregar() {
  const desde = cpIso(new Date(Date.now() - 7 * 864e5));
  return _ppBuscar(q => q.select('*').or(`status.in.(a_fazer,em_producao),data.gte.${desde}`)
    .order('data', { ascending: true }).order('numero', { ascending: true }));
}

// ══════════════════════════════════════════════════════════════
// ABA ORDENS
// ══════════════════════════════════════════════════════════════

async function renderPreproducao() {
  const page = document.getElementById('page-preproducao');
  if (!page) return;
  if (!document.getElementById('ppBody')) page.innerHTML = `<div id="ppBody" style="padding:20px 24px"></div>`;
  const el = document.getElementById('ppBody');
  if (!_ppDados) el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--muted)">Carregando ordens…</div>`;
  try {
    const [d, s] = await Promise.all([_ppCarregar(), estSaldos().catch(() => null)]);
    _ppDados = d; _ppSaldos = s;
  } catch (e) {
    el.innerHTML = `<div style="padding:24px;color:var(--danger-fg)">Não consegui carregar as ordens: ${_ppEsc(e.message)}</div>`;
    return;
  }
  if (!document.getElementById('page-preproducao')?.classList.contains('active')) return;
  _ppRender();
}

function _ppRender() {
  const el = document.getElementById('ppBody');
  if (!el || !_ppDados) return;
  const podeCriar = ppPodeCriar();
  const abertas = _ppDados.ordens.filter(o => o.status === 'a_fazer' || o.status === 'em_producao');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div>
        <div style="font-size:var(--text-xl);font-weight:800">Ordens de produção</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="renderPreproducao()" title="Atualizar">${lc('refresh-cw', 13, 'currentColor')}</button>
        <button class="btn btn-outline btn-sm" ${abertas.length ? '' : 'disabled'} onclick="ppImprimir(${_ppJs(abertas.map(o => o.id))})">${lc('printer', 13, 'currentColor')} Imprimir abertas</button>
        ${podeCriar ? `<button class="btn btn-primary btn-sm" onclick="ppNovaOrdem()">${lc('plus', 13, '#fff')} Nova ordem</button>` : ''}
      </div>
    </div>
    ${_ppQuadroHtml()}
    ${_ppPrecisaHtml(podeCriar)}`;
}

const _ppJs = v => _ppEsc(JSON.stringify(v));

// ── O que precisa produzir ─────────────────────────────────────

function _ppEmOrdem() {
  const m = new Map();
  for (const o of _ppDados.ordens) {
    if (o.status !== 'a_fazer' && o.status !== 'em_producao') continue;
    for (const l of _ppDados.itens.get(o.id) || []) if (l.tipo === 'preparar' && l.status === 'pendente') m.set(l.item_id, (m.get(l.item_id) || 0) + Number(l.qtd_plan));
  }
  return m;
}

function _ppLinhasPrecisa() {
  const emOrdem = _ppEmOrdem();
  return items.filter(i => i.isProd && i.active !== false).map(it => {
    const r = _ppSaldos?.porItem.get(it.id);
    const saldo = r ? r.total : (Number(it.qty) || 0);
    const min = Number(it.min) || 0, ideal = Number(it.ideal) || 0;
    const em = emOrdem.get(it.id) || 0;
    // Saldo negativo (venda baixada antes da contagem) conta como zero na sugestão
    const sug = Math.max(0, _estRound(ideal - Math.max(0, saldo) - em));
    const st = saldo <= 0.0005 ? { id: 0, label: 'Zerado', cls: 'b-red' }
      : min > 0 && saldo < min ? { id: 1, label: 'Abaixo do mínimo', cls: 'b-yellow' }
      : ideal > 0 && saldo < ideal ? { id: 2, label: 'Abaixo do ideal', cls: 'b-gray' }
      : { id: 3, label: 'OK', cls: 'b-green' };
    return { it, saldo, min, ideal, em, sug, st, pct: ideal > 0 ? saldo / ideal : 1 };
  }).sort((a, b) => a.st.id - b.st.id || a.pct - b.pct || a.it.name.localeCompare(b.it.name));
}

function _ppPrecisaHtml(podeCriar) {
  const todas = _ppLinhasPrecisa();
  const faltando = todas.filter(r => r.st.id < 3);
  const base = _ppVerTodos ? todas : faltando;
  const lista = _ppMais ? base : base.slice(0, PP_LINHAS_PRECISA);
  _ppSel = new Set([..._ppSel].filter(id => lista.some(r => r.it.id === id)));
  const u = r => _ppEsc(r.it.unit || '');
  return `<div class="card" style="margin-top:18px;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:var(--text-md);font-weight:800">O que precisa produzir</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${faltando.length ? `${faltando.length} processado${faltando.length > 1 ? 's' : ''} abaixo do ideal` : 'Todos os processados no ideal'} · estoque real (contagem + movimentações)</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);cursor:pointer"><input type="checkbox" ${_ppVerTodos ? 'checked' : ''} onchange="_ppVerTodos=this.checked;_ppRender()"> Ver todos</label>
        ${podeCriar ? `<button class="btn btn-primary btn-sm" id="ppCriarSel" ${_ppSel.size ? '' : 'disabled'} onclick="_ppCriarDaSelecao()">${lc('plus', 13, '#fff')} Criar ordem${_ppSel.size ? ` (${_ppSel.size})` : ''}</button>` : ''}
      </div>
    </div>
    ${lista.length ? `<div style="overflow-x:auto"><table class="tbl" style="width:100%;font-size:var(--text-sm)">
      <thead><tr>${podeCriar ? '<th style="width:34px"></th>' : ''}<th style="text-align:left">Processado</th><th>Situação</th><th style="text-align:right">Estoque</th><th style="text-align:right">Mín.</th><th style="text-align:right">Ideal</th><th style="text-align:right">Em ordem</th><th style="text-align:right">Sugerido</th></tr></thead>
      <tbody>${lista.map(r => `<tr ${podeCriar ? `style="cursor:pointer" onclick="if(event.target.tagName!=='INPUT')this.querySelector('input').click()"` : ''}>
        ${podeCriar ? `<td><input type="checkbox" ${_ppSel.has(r.it.id) ? 'checked' : ''} onchange="_ppToggleSel(${r.it.id},this.checked)"></td>` : ''}
        <td style="font-weight:700">${_ppEsc(r.it.name)}${ppTemFicha(r.it) ? '' : ` <span style="font-size:var(--text-2xs);color:var(--warning-fg);font-weight:600">sem ficha</span>`}</td>
        <td style="text-align:center"><span class="badge ${r.st.cls}">${r.st.label}</span></td>
        <td style="text-align:right;font-weight:700">${_estQ(r.saldo)} ${u(r)}</td>
        <td style="text-align:right;color:var(--muted)">${r.min ? _estQ(r.min) : '—'}</td>
        <td style="text-align:right;color:var(--muted)">${r.ideal ? _estQ(r.ideal) : '—'}</td>
        <td style="text-align:right;color:${r.em ? 'var(--purple)' : 'var(--muted)'}">${r.em ? '+' + _estQ(r.em) : '—'}</td>
        <td style="text-align:right;font-weight:800;color:${r.sug ? 'var(--text)' : 'var(--muted)'}">${r.sug ? _estQ(r.sug) + ' ' + u(r) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div style="padding:20px;text-align:center;color:var(--muted);font-size:var(--text-sm)">Nada para produzir agora.</div>`}
    ${base.length > PP_LINHAS_PRECISA ? `<button class="btn btn-ghost btn-sm" style="width:100%;border-radius:0;border-top:1px solid var(--border);color:var(--purple)" onclick="_ppMais=!_ppMais;_ppRender()">${_ppMais ? 'Mostrar menos' : `Mostrar mais ${base.length - PP_LINHAS_PRECISA}`}</button>` : ''}
  </div>`;
}

function _ppToggleSel(id, on) {
  on ? _ppSel.add(id) : _ppSel.delete(id);
  const b = document.getElementById('ppCriarSel');
  if (b) { b.disabled = !_ppSel.size; b.innerHTML = `${lc('plus', 13, '#fff')} Criar ordem${_ppSel.size ? ` (${_ppSel.size})` : ''}`; }
}

function _ppCriarDaSelecao() {
  const linhas = _ppLinhasPrecisa().filter(r => _ppSel.has(r.it.id));
  ppNovaOrdem({ linhas: linhas.map(r => ({ tipo: 'preparar', item_id: r.it.id, qtd: r.sug || '' })) });
}

// ── Quadro do dia ──────────────────────────────────────────────

function _ppQuadroHtml() {
  const ordens = _ppDados.ordens;
  const col = (id, titulo, lista, vazio) => `<div class="pp-col">
    <div class="pp-col-h"><span>${titulo}</span><span class="badge b-gray">${lista.length}</span></div>
    ${lista.length ? lista.map(_ppCardHtml).join('') : `<div style="padding:18px 8px;text-align:center;color:var(--muted);font-size:var(--text-sm)">${vazio}</div>`}
  </div>`;
  const concl = ordens.filter(o => o.status === 'concluida').sort((a, b) => String(b.concluido_em || '').localeCompare(String(a.concluido_em || ''))).slice(0, 12);
  return `<div style="display:flex;gap:12px;align-items:center;font-size:var(--text-xs);color:var(--muted);margin-bottom:8px">
      <span style="display:inline-flex;align-items:center;gap:5px">${_ppTipoPill('preparar', true)} Preparar</span>
      <span style="display:inline-flex;align-items:center;gap:5px">${_ppTipoPill('porcionar', true)} Porcionar</span></div>
    <div class="pp-quadro">
    ${col('a_fazer', 'A fazer', ordens.filter(o => o.status === 'a_fazer'), 'Nenhuma ordem esperando')}
    ${col('em_producao', 'Em produção', ordens.filter(o => o.status === 'em_producao'), 'Nada em produção')}
    ${col('concluida', 'Concluídas · 7 dias', concl, 'Nenhuma concluída')}
  </div>`;
}

function _ppReqChip(o) {
  const r = _ppDados.reqs.get(o.id);
  if (!r) return '';
  const st = REQ_STATUS[r.status] || REQ_STATUS.pendente;
  return `<span class="badge ${st.cls}" title="Requisição de insumos">${lc('clipboard', 10, 'currentColor')} Req. #${r.numero} · ${st.label}</span>`;
}

function _ppCardHtml(o) {
  const linhas = _ppDados.itens.get(o.id) || [];
  const feitos = linhas.filter(l => l.status !== 'pendente').length;
  const atrasada = o.status !== 'concluida' && o.data < _ppHoje();
  return `<div class="pp-card" onclick="ppAbrirOrdem('${o.id}')">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:8px">
      <span style="font-weight:800;font-size:var(--text-md)">Ordem #${o.numero}</span>
      <span style="font-size:var(--text-xs);color:${atrasada ? 'var(--danger-fg)' : 'var(--muted)'};font-weight:${atrasada ? 700 : 500}">${o.data === _ppHoje() ? 'hoje' : _ppDataBr(o.data)}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px">
      ${linhas.map(l => `<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:7px;font-size:var(--text-sm);line-height:1.3;${l.status === 'cancelado' ? 'opacity:.5;text-decoration:line-through' : ''}">
        ${_ppTipoPill(l.tipo, true)}
        <span style="min-width:0;font-weight:600;overflow-wrap:anywhere">${_ppEsc(l.item_nome)}${l.status === 'concluido' ? ' ' + lc('check-circle', 12, 'var(--success-fg)') : ''}</span>
        <span style="white-space:nowrap;color:var(--text2)">${_estQ(l.status === 'concluido' && l.qtd_real != null ? l.qtd_real : l.qtd_plan)} ${_ppEsc(l.unidade || '')}</span></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap">
      <div style="display:flex;gap:4px;flex-wrap:wrap">${_ppReqChip(o)}${o.status === 'em_producao' ? `<span class="badge b-purple">${feitos}/${linhas.length} itens</span>` : ''}</div>
      <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
        ${o.status === 'a_fazer' ? `<button class="btn btn-ghost btn-sm" title="Imprimir" onclick="ppImprimir(${_ppJs([o.id])})">${lc('printer', 13, 'currentColor')}</button>
          <button class="btn btn-primary btn-sm" onclick="ppIniciar('${o.id}')">Iniciar</button>` : ''}
        ${o.status === 'em_producao' ? `<button class="btn btn-primary btn-sm" onclick="ppAbrirOrdem('${o.id}')">Concluir itens</button>` : ''}
      </div>
    </div>
  </div>`;
}

// ── Modal genérico ─────────────────────────────────────────────

function _ppModal(id, titulo, corpo, rodape, largura = 640, sub = '') {
  document.getElementById(id)?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = id;
  ov.innerHTML = `<div class="modal fm-modal" style="width:${largura}px" onclick="event.stopPropagation()">
    <div class="fm-head">
      <div style="min-width:0"><div class="fm-title">${titulo}</div>${sub ? `<div class="fm-sub">${sub}</div>` : ''}</div>
      <button class="fm-close" title="Fechar" onclick="this.closest('.overlay').remove()">${lc('x', 18, 'currentColor')}</button>
    </div>
    <div id="${id}-body" class="fm-body">${corpo}</div>
    <div class="fm-foot">${rodape}</div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  return ov;
}

// ══════════════════════════════════════════════════════════════
// NOVA ORDEM
// ══════════════════════════════════════════════════════════════

let _ppNova = null;

function ppNovaOrdem({ linhas = [], data = null } = {}) {
  if (!ppPodeCriar()) return toast('Seu perfil não cria ordens de produção', 'err');
  let k = 1;
  _ppNova = {
    data: data || _ppHoje(), obs: '', requisitar: true,
    linhas: (linhas.length ? linhas : [{ tipo: 'preparar', item_id: null, qtd: '' }]).map(l => ({ k: k++, tipo: l.tipo || 'preparar', item_id: l.item_id || null, qtd: l.qtd === '' || l.qtd == null ? '' : String(l.qtd).replace('.', ','), peso: '' })),
  };
  _ppNova.prox = k;
  _ppModal('ovPpNova', 'Nova ordem de produção', `
    <div class="f2">
      ${_estCampo('Data *', `<input class="inp" type="date" id="ppNovaData" value="${_ppNova.data}" onchange="_ppNova.data=this.value">`)}
      ${_estCampo('Observação', `<input class="inp" id="ppNovaObs" placeholder="ex: priorizar a mussarela" oninput="_ppNova.obs=this.value">`)}
    </div>
    <div style="font-size:var(--text-sm);font-weight:700;margin:2px 0 6px">Itens da ordem</div>
    <div id="ppNovaLinhas" style="display:flex;flex-direction:column;gap:8px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn btn-ghost btn-sm" style="color:var(--purple)" onclick="_ppNovaAdd('preparar')">${lc('plus', 13, 'currentColor')} Preparar</button>
      <button type="button" class="btn btn-ghost btn-sm" style="color:var(--purple)" onclick="_ppNovaAdd('porcionar')">${lc('plus', 13, 'currentColor')} Porcionar</button>
    </div>
    <div id="ppNovaResumo"></div>`,
    `<button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Cancelar</button>
     <button class="btn btn-primary" id="ovPpNova-salvar" onclick="_ppNovaSalvar()">Criar ordem</button>`,
    760, 'Preparar = receita (usa insumos e dá entrada no processado) · Porcionar = separa em porções');
  _ppNovaRender();
}

function _ppNovaRender() {
  const el = document.getElementById('ppNovaLinhas'); if (!el || !_ppNova) return;
  el.innerHTML = _ppNova.linhas.map(l => {
    const it = items.find(i => i.id === l.item_id);
    const porc = l.tipo === 'porcionar';
    const pesoPadrao = Number(it?.medPorcao) || 0;
    const qtdN = _estNumBr(l.qtd, it?.unit), pesoN = _estNumBr(l.peso, it?.unit) || pesoPadrao;
    const porcoes = porc && qtdN > 0 && pesoN > 0 ? Math.floor(qtdN / pesoN + 1e-9) : null;
    return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:10px;display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;grid-template-columns:130px 1fr 130px 32px;gap:8px;align-items:center">
        <select class="inp" onchange="_ppNovaSet(${l.k},'tipo',this.value)">${Object.entries(PP_TIPOS).map(([id, t]) => `<option value="${id}"${l.tipo === id ? ' selected' : ''}>${t.label}</option>`).join('')}</select>
        ${cpComboHtml('ppNovaIt' + l.k, { tipo: porc ? 'item' : 'processado', valor: l.item_id, ao: `_ppNovaSet(${l.k},'item_id',%v)` })}
        <div style="position:relative"><input class="inp" inputmode="decimal" placeholder="Qtd" value="${_ppEsc(l.qtd)}" oninput="_ppNovaSet(${l.k},'qtd',this.value,true)" style="padding-right:34px">
          <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--muted)">${_ppEsc(it?.unit || '')}</span></div>
        <button type="button" class="btn btn-ghost btn-sm" title="Remover" onclick="_ppNovaDel(${l.k})" style="padding:6px">${lc('x', 14, 'var(--muted)')}</button>
      </div>
      ${porc ? `<div style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);color:var(--text2);flex-wrap:wrap">
        Porção de <input class="inp" inputmode="decimal" style="width:90px;padding:5px 8px" placeholder="${pesoPadrao ? _estFmtInp(pesoPadrao) : '0,000'}" value="${_ppEsc(l.peso)}" oninput="_ppNovaSet(${l.k},'peso',this.value,true)"> ${_ppEsc(it?.unit || '')}
        <span id="ppNovaPorc${l.k}" style="font-weight:700">${porcoes != null ? `≈ ${porcoes} porções` : ''}</span></div>`
      : it && !ppTemFicha(it) ? `<div style="font-size:var(--text-xs);color:var(--warning-fg)">${lc('alert-triangle', 12, 'currentColor')} Sem ficha técnica: não pede insumos nem dá baixa deles ao concluir. Cadastre a ficha em Cadastros › Processados.</div>` : ''}
    </div>`;
  }).join('');
  _ppNovaResumo();
}

function _ppNovaSet(k, campo, v, leve) {
  const l = _ppNova?.linhas.find(x => x.k === k); if (!l) return;
  l[campo] = v;
  if (campo === 'tipo' && v === 'preparar') { const it = items.find(i => i.id === l.item_id); if (it && !it.isProd) l.item_id = null; }
  if (!leve) return _ppNovaRender();
  if (campo === 'qtd' || campo === 'peso') {
    const it = items.find(i => i.id === l.item_id);
    const q = _estNumBr(l.qtd, it?.unit), p = _estNumBr(l.peso, it?.unit) || Number(it?.medPorcao) || 0;
    const span = document.getElementById('ppNovaPorc' + k);
    if (span) span.textContent = q > 0 && p > 0 ? `≈ ${Math.floor(q / p + 1e-9)} porções` : '';
    _ppNovaResumo();
  }
}
function _ppNovaAdd(tipo) { _ppNova.linhas.push({ k: _ppNova.prox++, tipo, item_id: null, qtd: '', peso: '' }); _ppNovaRender(); }
function _ppNovaDel(k) { _ppNova.linhas = _ppNova.linhas.filter(l => l.k !== k); if (!_ppNova.linhas.length) _ppNovaAdd('preparar'); else _ppNovaRender(); }

// Insumos que a ordem vai pedir ao estoque (soma dos itens Preparar com ficha)
function _ppNovaInsumos() {
  const acc = new Map();
  for (const l of _ppNova.linhas) {
    if (l.tipo !== 'preparar' || !l.item_id) continue;
    const it = items.find(i => i.id === l.item_id);
    for (const n of ppNecessidadeFicha(l.item_id, _estNumBr(l.qtd, it?.unit))) {
      const a = acc.get(n.item_id) || { ...n, qtd: 0 };
      a.qtd = _estRound(a.qtd + n.qtd); acc.set(n.item_id, a);
    }
  }
  return [...acc.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

function _ppNovaResumo() {
  const el = document.getElementById('ppNovaResumo'); if (!el) return;
  const ins = _ppNovaInsumos();
  if (!ins.length) { el.innerHTML = ''; return; }
  const saldoCentral = id => {
    const r = _ppSaldos?.porItem.get(id); if (!r) return null;
    return Object.entries(r.porLocal).filter(([l]) => l !== REQ_LOCAL_PRODUCAO).reduce((s, [, v]) => s + (v.saldo || 0), 0);
  };
  el.innerHTML = `<div style="border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden;margin-top:4px">
    <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface2);font-size:var(--text-sm);font-weight:700;cursor:pointer">
      <input type="checkbox" ${_ppNova.requisitar ? 'checked' : ''} onchange="_ppNova.requisitar=this.checked">
      Pedir estes insumos ao estoque (requisição para ${_ppEsc(estLocalLabel(REQ_LOCAL_PRODUCAO))})</label>
    <table class="tbl" style="width:100%;font-size:var(--text-sm)"><thead><tr><th style="text-align:left">Insumo (pela ficha)</th><th style="text-align:right">Precisa</th><th style="text-align:right">No estoque</th></tr></thead>
      <tbody>${ins.map(n => { const s = saldoCentral(n.item_id); return `<tr><td>${_ppEsc(n.nome)}</td><td style="text-align:right;font-weight:700">${_estQ(n.qtd)} ${_ppEsc(n.unidade)}</td>
        <td style="text-align:right;color:${s != null && s < n.qtd ? 'var(--danger-fg)' : 'var(--muted)'}">${s != null ? _estQ(s) + ' ' + _ppEsc(n.unidade) : '—'}</td></tr>`; }).join('')}</tbody></table>
  </div>`;
}

async function _ppNovaSalvar() {
  const n = _ppNova; if (!n) return;
  const linhas = n.linhas.filter(l => l.item_id).map(l => {
    const it = items.find(i => i.id === l.item_id);
    const qtd = _estNumBr(l.qtd, it?.unit);
    const peso = l.tipo === 'porcionar' ? (_estNumBr(l.peso, it?.unit) || Number(it?.medPorcao) || null) : null;
    return { l, it, qtd, peso };
  });
  if (!n.data) return toast('Informe a data', 'err');
  if (!linhas.length) return toast('Escolha pelo menos um item', 'err');
  if (linhas.some(x => !(x.qtd > 0))) return toast('Informe a quantidade de cada item', 'err');
  if (linhas.some(x => x.l.tipo === 'preparar' && !x.it?.isProd)) return toast('Preparar é só para processados', 'err');
  const btn = document.getElementById('ovPpNova-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
  try {
    const user = estUsuario();
    const [ordem] = await cpInsert('pp_ordens', { data: n.data, obs: n.obs.trim() || null, criado_por: user });
    await cpInsert('pp_ordem_itens', linhas.map((x, i) => ({
      ordem_id: ordem.id, item_id: x.it.id, item_nome: x.it.name, unidade: x.it.unit || null, tipo: x.l.tipo,
      qtd_plan: _estRound(x.qtd), peso_porcao: x.peso ? _estRound(x.peso) : null,
      porcoes: x.peso ? Math.floor(x.qtd / x.peso + 1e-9) : null, ordem_pos: i, criado_por: user,
    })));
    let req = null;
    const ins = _ppNovaInsumos();
    if (n.requisitar && ins.length) {
      try { req = await estCriarRequisicao({ origem: 'ordem', ordemId: ordem.id, destino: REQ_LOCAL_PRODUCAO, obs: `Ordem #${ordem.numero}`, itens: ins.map(x => ({ item_id: x.item_id, qtd: x.qtd })) }); }
      catch (e) { toast('Ordem criada, mas a requisição não foi enviada: ' + e.message, 'err'); }
    }
    document.getElementById('ovPpNova')?.remove();
    _ppSel.clear();
    toast(`Ordem #${ordem.numero} criada${req ? ` · requisição #${req.numero} enviada ao estoque` : ''}`, 'ok');
    _ppRefrescar();
  } catch (e) {
    toast('Não consegui criar a ordem: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Criar ordem'; }
  }
}

// Recarrega a aba que estiver aberta (Ordens ou Agenda)
function _ppRefrescar() {
  if (document.getElementById('page-preproducao')?.classList.contains('active')) renderPreproducao();
  else if (document.getElementById('page-ppagenda')?.classList.contains('active')) renderPpAgenda();
}

// ══════════════════════════════════════════════════════════════
// DETALHE DA ORDEM · INICIAR · CONCLUIR · CANCELAR
// ══════════════════════════════════════════════════════════════

const _ppAchar = id => _ppDados?.ordens.find(o => o.id === id) || _ppAgDados?.ordens.find(o => o.id === id);
const _ppItensDe = id => _ppDados?.itens.get(id) || _ppAgDados?.itens.get(id) || [];
const _ppReqDe = id => _ppDados?.reqs.get(id) || _ppAgDados?.reqs.get(id) || null;

function ppAbrirOrdem(id) {
  const o = _ppAchar(id); if (!o) return;
  const linhas = _ppItensDe(id);
  const st = PP_STATUS[o.status];
  const req = _ppReqDe(id);
  const podeExec = o.status === 'a_fazer' || o.status === 'em_producao';
  const nadaFeito = !linhas.some(l => l.status === 'concluido');
  const linhaHtml = l => {
    const rend = l.rendimento_pct != null ? Number(l.rendimento_pct) : null;
    const fora = rend != null && Math.abs(rend - 100) > PP_TOL_RENDIMENTO;
    return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;${l.status === 'cancelado' ? 'opacity:.55' : ''}">
      ${_ppTipoPill(l.tipo)}
      <div style="flex:1;min-width:160px">
        <div style="font-weight:700">${_ppEsc(l.item_nome)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">Planejado ${_estQ(l.qtd_plan)} ${_ppEsc(l.unidade || '')}${l.tipo === 'porcionar' && l.peso_porcao ? ` · porção ${_estQ(l.peso_porcao)} ${_ppEsc(l.unidade || '')}` : ''}${l.tipo === 'porcionar' && l.porcoes ? ` · ${l.porcoes} porções` : ''}</div>
        ${l.status === 'concluido' ? `<div style="font-size:var(--text-xs);color:var(--text2);margin-top:2px">${lc('check-circle', 11, 'var(--success-fg)')} ${l.tipo === 'porcionar' ? `${l.porcoes ?? '—'} porções de ${_estQ(l.peso_porcao)} ${_ppEsc(l.unidade || '')}` : `Produzido ${_estQ(l.qtd_real)} ${_ppEsc(l.unidade || '')}`}${rend != null ? ` · <b style="color:${fora ? 'var(--warning-fg)' : 'var(--success-fg)'}">rendimento ${rend.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b>` : ''} · ${_ppEsc(l.concluido_por || '')} ${_reqQuando(l.concluido_em)}</div>` : ''}
        ${l.obs ? `<div style="font-size:var(--text-xs);color:var(--muted)">${_ppEsc(l.obs)}</div>` : ''}
      </div>
      ${l.status === 'pendente' && podeExec ? `<button class="btn btn-primary btn-sm" onclick="ppConcluirItem('${l.id}')">Concluir</button>` : `<span class="badge ${l.status === 'concluido' ? 'b-green' : 'b-gray'}">${l.status === 'concluido' ? 'Feito' : l.status === 'cancelado' ? 'Cancelado' : 'Pendente'}</span>`}
    </div>`;
  };
  _ppModal('ovPpOrdem', `Ordem #${o.numero} <span class="badge ${st.cls}" style="margin-left:6px;vertical-align:middle">${st.label}</span>`, `
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:var(--text-sm);color:var(--text2)">
      <span>${lc('calendar', 13, 'var(--muted)')} ${_ppDataBr(o.data)}</span>
      <span>${lc('user', 13, 'var(--muted)')} Criada por ${_ppEsc(o.criado_por || '—')}</span>
      ${o.iniciado_por ? `<span>${lc('play', 13, 'var(--muted)')} Iniciada por ${_ppEsc(o.iniciado_por)} · ${_reqQuando(o.iniciado_em)}</span>` : ''}
    </div>
    ${req ? `<div class="fm-box" style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:var(--text-sm)">
      <span>${lc('clipboard', 14, 'var(--purple)')} Requisição de insumos <b>#${req.numero}</b> para ${_ppEsc(estLocalLabel(req.destino))}</span>
      <span class="badge ${(REQ_STATUS[req.status] || REQ_STATUS.pendente).cls}">${(REQ_STATUS[req.status] || REQ_STATUS.pendente).label}</span></div>` : ''}
    ${o.obs ? `<div style="font-size:var(--text-sm);background:var(--surface2);border-radius:var(--r8);padding:8px 10px">${_ppEsc(o.obs)}</div>` : ''}
    ${o.cancelado_motivo ? `<div style="font-size:var(--text-sm);color:var(--muted)">Cancelada: ${_ppEsc(o.cancelado_motivo)}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:8px">${linhas.map(linhaHtml).join('')}</div>`,
    `${podeExec && nadaFeito && ppPodeCriar() ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--muted)" onclick="_ppCancelarUI('${o.id}')">Cancelar ordem</button>` : ''}
     <button class="btn btn-outline" onclick="ppImprimir(${_ppJs([o.id])})">${lc('printer', 14, 'currentColor')} Imprimir</button>
     ${o.status === 'a_fazer' ? `<button class="btn btn-primary" onclick="ppIniciar('${o.id}')">Iniciar produção</button>` : `<button class="btn btn-primary" onclick="this.closest('.overlay').remove()">Fechar</button>`}`,
    680);
}

async function ppIniciar(id) {
  try {
    await cpUpdate('pp_ordens', id, { status: 'em_producao', iniciado_por: estUsuario(), iniciado_em: new Date().toISOString() });
    document.getElementById('ovPpOrdem')?.remove();
    toast('Produção iniciada', 'ok');
    _ppRefrescar();
  } catch (e) { toast('Não consegui iniciar: ' + e.message, 'err'); }
}

function _ppCancelarUI(id) {
  _estModal('ovPpCancel', 'Cancelar ordem', _estCampo('Motivo', `<input class="inp" id="ppMotivo" placeholder="ex: criada em duplicidade">`)
    + _estDica('A requisição de insumos desta ordem, se ainda não foi entregue, também é cancelada.'),
    `_ppCancelarSalvar('${id}')`, 'Cancelar ordem', 460);
  setTimeout(() => document.getElementById('ppMotivo')?.focus(), 50);
}
async function _ppCancelarSalvar(id) {
  const motivo = document.getElementById('ppMotivo')?.value.trim() || null;
  try {
    await cpUpdate('pp_ordens', id, { status: 'cancelada', cancelado_motivo: motivo });
    for (const l of _ppItensDe(id).filter(x => x.status === 'pendente')) await cpUpdate('pp_ordem_itens', l.id, { status: 'cancelado' });
    const req = _ppReqDe(id);
    if (req && req.status === 'pendente') await estCancelarRequisicao(req.id, 'Ordem cancelada' + (motivo ? ': ' + motivo : ''));
    document.getElementById('ovPpCancel')?.remove();
    document.getElementById('ovPpOrdem')?.remove();
    toast('Ordem cancelada', 'ok');
    _ppRefrescar();
  } catch (e) { toast('Não consegui cancelar: ' + e.message, 'err'); }
}

// ── Concluir item ──────────────────────────────────────────────

let _ppConc = null;

function _ppLocalConsumo(ins) {
  const locais = estLocaisReaisDoItem(ins);
  return locais.includes(REQ_LOCAL_PRODUCAO) ? REQ_LOCAL_PRODUCAO : estLocalSaida(ins);
}

function ppConcluirItem(linhaId) {
  let l = null, o = null;
  for (const src of [_ppDados, _ppAgDados]) {
    if (!src) continue;
    for (const [oid, ls] of src.itens) { const x = ls.find(y => y.id === linhaId); if (x) { l = x; o = src.ordens.find(z => z.id === oid); break; } }
    if (l) break;
  }
  if (!l || !o) return;
  const it = items.find(i => i.id === l.item_id);
  const ficha = l.tipo === 'preparar' ? ppNecessidadeFicha(l.item_id, Number(l.qtd_plan)) : [];
  _ppConc = { l, o, it, ficha };
  const u = _ppEsc(l.unidade || '');
  let corpo;
  if (l.tipo === 'porcionar') {
    const peso = Number(l.peso_porcao) || Number(it?.medPorcao) || 0;
    corpo = `
      <div class="fm-box"><div style="font-weight:700">${_ppEsc(l.item_nome)}</div><div style="font-size:var(--text-xs);color:var(--fg-muted)">Porcionar · planejado ${_estQ(l.qtd_plan)} ${u}</div></div>
      <div class="f2">
        ${_estCampo(`Quantidade porcionada (${u}) *`, `<input class="inp" id="ppcQtd" inputmode="decimal" value="${_estFmtInp(l.qtd_plan)}" oninput="_ppConcPorcoes()">`)}
        ${_estCampo(`Peso da porção (${u}) *`, `<input class="inp" id="ppcPeso" inputmode="decimal" value="${peso ? _estFmtInp(peso) : ''}" oninput="_ppConcPorcoes()">`)}
      </div>
      ${_estCampo('Porções *', `<input class="inp" id="ppcPorcoes" inputmode="numeric" value="">`, '', 'Calculado pelo peso; corrija se contou diferente.')}
      ${_estCampo('Observação', `<input class="inp" id="ppcObs" placeholder="opcional">`)}`;
  } else {
    corpo = `
      <div class="fm-box"><div style="font-weight:700">${_ppEsc(l.item_nome)}</div><div style="font-size:var(--text-xs);color:var(--fg-muted)">Preparar · planejado ${_estQ(l.qtd_plan)} ${u}${it?.fichaTecnica?.rendimento_kg ? ` · a ficha rende ${_estQ(it.fichaTecnica.rendimento_kg)} ${u} por receita` : ''}</div></div>
      ${ficha.length ? `<div style="font-size:var(--text-sm);font-weight:700">Insumos usados</div>
        <table class="tbl" style="width:100%;font-size:var(--text-sm)"><thead><tr><th style="text-align:left">Insumo</th><th style="text-align:right">Pela ficha</th><th style="text-align:right;width:140px">Usado</th></tr></thead>
        <tbody>${ficha.map((n, k) => `<tr><td>${_ppEsc(n.nome)}<div style="font-size:var(--text-2xs);color:var(--muted)">sai de ${_ppEsc(estLocalLabel(_ppLocalConsumo(items.find(i => i.id === n.item_id) || {})))}</div></td>
          <td style="text-align:right;color:var(--muted)">${_estQ(n.qtd)} ${_ppEsc(n.unidade)}</td>
          <td style="text-align:right"><div style="position:relative"><input class="inp" id="ppcUso${k}" inputmode="decimal" value="${_estFmtInp(n.qtd)}" oninput="_ppConcRend()" style="text-align:right;padding-right:30px">
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:var(--text-2xs);color:var(--muted)">${_ppEsc(n.unidade)}</span></div></td></tr>`).join('')}</tbody></table>`
      : `<div style="font-size:var(--text-sm);color:var(--warning-fg)">${lc('alert-triangle', 13, 'currentColor')} Sem ficha técnica: só a entrada do processado vai para o estoque.</div>`}
      <div class="f2">
        ${_estCampo(`Quanto rendeu (${u}) *`, `<input class="inp" id="ppcReal" inputmode="decimal" value="" placeholder="${_estFmtInp(l.qtd_plan)}" oninput="_ppConcRend()" style="font-size:1rem;font-weight:700">`)}
        <div id="ppcRend" style="align-self:end;padding-bottom:10px"></div>
      </div>
      ${_estCampo('Observação', `<input class="inp" id="ppcObs" placeholder="ex: carne com muita gordura">`)}
      ${_estDica(`Ao confirmar: os insumos usados saem do estoque da cozinha e ${_ppEsc(l.item_nome)} entra em ${_ppEsc(estLocalLabel(it ? estLocalEntrada(it) : ''))}.`)}`;
  }
  _estModal('ovPpConc', `Concluir · ${_ppEsc(l.item_nome)}`, corpo, '_ppConcSalvar()', 'Confirmar', 600, `Ordem #${o.numero} · registrado no nome de ${_ppEsc(estUsuario())}`);
  if (l.tipo === 'porcionar') _ppConcPorcoes(); else _ppConcRend();
  setTimeout(() => document.getElementById(l.tipo === 'porcionar' ? 'ppcQtd' : 'ppcReal')?.focus(), 60);
}

function _ppConcPorcoes() {
  const u = _ppConc?.l.unidade;
  const q = _estNumBr(document.getElementById('ppcQtd')?.value, u), p = _estNumBr(document.getElementById('ppcPeso')?.value, u);
  const el = document.getElementById('ppcPorcoes');
  if (el) el.value = q > 0 && p > 0 ? Math.floor(q / p + 1e-9) : '';
}

// Rendimento esperado = planejado × (usado ÷ ficha), pelo peso total dos insumos
function _ppRendimento() {
  const c = _ppConc; if (!c) return null;
  const real = _estNumBr(document.getElementById('ppcReal')?.value, c.l.unidade);
  const usados = c.ficha.map((n, k) => _estNumBr(document.getElementById('ppcUso' + k)?.value, n.unidade));
  const somaF = c.ficha.reduce((s, n) => s + n.qtd, 0), somaU = usados.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const esperado = somaF > 0 ? Number(c.l.qtd_plan) * somaU / somaF : Number(c.l.qtd_plan);
  return { real, usados, esperado, pct: real > 0 && esperado > 0 ? real / esperado * 100 : null };
}

function _ppConcRend() {
  const el = document.getElementById('ppcRend'); if (!el) return;
  const r = _ppRendimento();
  if (!r || r.pct == null) { el.innerHTML = r ? `<span style="font-size:var(--text-sm);color:var(--muted)">Esperado: ${_estQ(_estRound(r.esperado))} ${_ppEsc(_ppConc.l.unidade || '')}</span>` : ''; return; }
  const fora = Math.abs(r.pct - 100) > PP_TOL_RENDIMENTO;
  el.innerHTML = `<div style="font-size:var(--text-sm);color:var(--muted)">Esperado ${_estQ(_estRound(r.esperado))} ${_ppEsc(_ppConc.l.unidade || '')}</div>
    <div style="font-size:var(--text-lg);font-weight:800;color:${fora ? 'var(--warning-fg)' : 'var(--success-fg)'}">${r.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da ficha</div>`;
}

async function _ppConcSalvar() {
  const c = _ppConc; if (!c) return;
  const { l, o, it } = c;
  const agora = new Date().toISOString(), user = estUsuario();
  const btn = document.getElementById('ovPpConc-salvar');
  let campos, movs = [];
  if (l.tipo === 'porcionar') {
    const q = _estNumBr(document.getElementById('ppcQtd').value, l.unidade), p = _estNumBr(document.getElementById('ppcPeso').value, l.unidade);
    const porcoes = parseInt(document.getElementById('ppcPorcoes').value, 10);
    if (!(q > 0) || !(p > 0) || !(porcoes > 0)) return toast('Informe quantidade, peso da porção e porções', 'err');
    campos = { qtd_real: _estRound(q), peso_porcao: _estRound(p), porcoes };
  } else {
    const r = _ppRendimento();
    if (!(r.real > 0)) return toast('Informe quanto rendeu', 'err');
    if (r.usados.some(v => isNaN(v) || v < 0)) return toast('Confira as quantidades usadas', 'err');
    if (!it) return toast('Processado não encontrado no cadastro', 'err');
    const consumo = c.ficha.map((n, k) => ({ item_id: n.item_id, nome: n.nome, unidade: n.unidade, qtd_ficha: n.qtd, qtd: _estRound(r.usados[k]) }));
    campos = { qtd_real: _estRound(r.real), consumo, rendimento_pct: r.pct != null ? Math.round(r.pct * 100) / 100 : null };
    const motivo = `Ordem #${o.numero} · ${l.item_nome}`;
    consumo.filter(x => x.qtd > 0).forEach(x => {
      const ins = items.find(i => i.id === x.item_id);
      if (ins) movs.push(_estMovRow(ins, { tipo: 'consumo_producao', sinal: -1, qtd: x.qtd, local_origem: _ppLocalConsumo(ins) || EST_SEM_LOCAL,
        motivo, data_mov: agora, ref_tipo: 'ordem_producao', ref_id: l.id }));
    });
    movs.push(_estMovRow(it, { tipo: 'producao', sinal: 1, qtd: _estRound(r.real), local_destino: estLocalEntrada(it) || EST_SEM_LOCAL,
      motivo, data_mov: agora, ref_tipo: 'ordem_producao', ref_id: l.id }));
  }
  campos.obs = document.getElementById('ppcObs')?.value.trim() || null;
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    if (movs.length) await estInserirMovs(movs);
    await cpUpdate('pp_ordem_itens', l.id, { ...campos, status: 'concluido', concluido_por: user, concluido_em: agora });
    const resto = _ppItensDe(o.id).filter(x => x.id !== l.id && x.status === 'pendente').length;
    if (!resto) await cpUpdate('pp_ordens', o.id, { status: 'concluida', concluido_em: agora, ...(o.iniciado_em ? {} : { iniciado_por: user, iniciado_em: agora }) });
    else if (o.status === 'a_fazer') await cpUpdate('pp_ordens', o.id, { status: 'em_producao', iniciado_por: user, iniciado_em: agora });
    document.getElementById('ovPpConc')?.remove();
    document.getElementById('ovPpOrdem')?.remove();
    const pct = campos.rendimento_pct;
    toast(l.tipo === 'porcionar' ? `${campos.porcoes} porções registradas` : `Produção registrada no estoque${pct != null ? ` · rendimento ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : ''}`, 'ok');
    if (!resto) toast(`Ordem #${o.numero} concluída`, 'ok');
    if (typeof _estMovDados !== 'undefined') _estMovDados = null;
    _ppRefrescar();
    if (resto) setTimeout(() => _ppAchar(o.id) && ppAbrirOrdem(o.id), 600);
  } catch (e) {
    toast('Não consegui registrar: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
  }
}

// ══════════════════════════════════════════════════════════════
// IMPRESSÃO (A4, para a porta da pré-produção)
// ══════════════════════════════════════════════════════════════

function ppImprimir(ids) {
  const ordens = ids.map(_ppAchar).filter(Boolean);
  if (!ordens.length) return toast('Nenhuma ordem para imprimir', 'err');
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return toast('Libere pop-ups para imprimir', 'err');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const q = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const bloco = l => {
    const u = esc(l.unidade || '');
    if (l.tipo === 'porcionar') return `<div class="item"><div class="ih"><span class="tp por">PORCIONAR</span><b>${esc(l.item_nome)}</b><span class="qt">${q(l.qtd_plan)} ${u}</span></div>
      <div class="campos"><span>Porção de: <i>${l.peso_porcao ? q(l.peso_porcao) + ' ' + u : '________'}</i></span><span>Porções: <i class="linha"></i></span><span>Feito por: <i class="linha"></i></span></div></div>`;
    const ficha = ppNecessidadeFicha(l.item_id, Number(l.qtd_plan));
    const it = items.find(i => i.id === l.item_id);
    return `<div class="item"><div class="ih"><span class="tp pre">PREPARAR</span><b>${esc(l.item_nome)}</b><span class="qt">${q(l.qtd_plan)} ${u}</span></div>
      ${ficha.length ? `<table><thead><tr><th>Insumo</th><th class="r">Pela ficha</th><th class="r">Usado</th></tr></thead>
        <tbody>${ficha.map(n => `<tr><td>${esc(n.nome)}</td><td class="r">${q(n.qtd)} ${esc(n.unidade)}</td><td class="box"></td></tr>`).join('')}</tbody></table>`
        : '<div class="sem">Sem ficha técnica cadastrada</div>'}
      ${it?.ficha ? `<div class="modo"><b>Modo de preparo:</b> ${esc(it.ficha).slice(0, 600)}</div>` : ''}
      <div class="campos"><span>Rendeu: <i class="linha"></i> ${u}</span><span>Feito por: <i class="linha"></i></span></div></div>`;
  };
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ordens de produção</title><style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:14px;font-size:12px}
    .ordem{break-after:page;page-break-after:always} .ordem:last-child{break-after:auto;page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #111;padding-bottom:6px;margin-bottom:10px}
    .marca{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#555} h1{font-size:22px;margin:2px 0}
    .meta{text-align:right;font-size:11px;line-height:1.5}
    .item{border:1.5px solid #111;border-radius:6px;padding:8px 10px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
    .ih{display:flex;align-items:center;gap:8px;font-size:15px;margin-bottom:6px} .qt{margin-left:auto;font-size:16px;font-weight:800}
    .tp{font-size:10px;font-weight:800;padding:2px 6px;border:1.5px solid #111;border-radius:4px} .tp.por{border-style:dashed}
    table{width:100%;border-collapse:collapse;margin:4px 0} th{font-size:10px;text-transform:uppercase;color:#444;border-bottom:1.5px solid #111;text-align:left;padding:3px}
    td{border-bottom:1px solid #999;padding:4px 3px;height:24px} .r{text-align:right;width:28mm} td.box{width:32mm;border:1px solid #777}
    .campos{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:12px} .linha{display:inline-block;width:38mm;border-bottom:1px solid #111;height:14px}
    .sem{color:#666;font-style:italic;margin:4px 0} .modo{font-size:11px;color:#333;margin-top:6px;white-space:pre-wrap}
    .obs{border:1px dashed #777;padding:6px 8px;margin-bottom:10px} .ass{margin-top:16px;display:flex;gap:30px;font-size:12px}
    @page{size:A4;margin:10mm} @media print{body{padding:0}}
  </style></head><body>
    ${ordens.map(o => `<div class="ordem">
      <header><div><div class="marca">Vai Ter Pizza! · Pré-produção</div><h1>Ordem de produção #${o.numero}</h1></div>
        <div class="meta">${esc(_ppDataBr(o.data))}<br>Criada por ${esc(o.criado_por || '—')}${_ppReqDe(o.id) ? `<br>Requisição #${_ppReqDe(o.id).numero}` : ''}</div></header>
      ${o.obs ? `<div class="obs">${esc(o.obs)}</div>` : ''}
      ${_ppItensDe(o.id).filter(l => l.status !== 'cancelado').map(bloco).join('')}
      <div class="ass"><span>Conferido por: <i class="linha"></i></span><span>Lançado no app em: <i class="linha"></i></span></div>
    </div>`).join('')}
    <script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
// ABA AGENDA — a semana, preparo × porcionamento
// ══════════════════════════════════════════════════════════════

let _ppAgOffset = 0;
let _ppAgDados = null;

async function renderPpAgenda() {
  const page = document.getElementById('page-ppagenda');
  if (!page) return;
  const sem = cpSemana(_ppAgOffset);
  if (!document.getElementById('ppAgBody')) page.innerHTML = `<div id="ppAgBody" style="padding:20px 24px"></div>`;
  const el = document.getElementById('ppAgBody');
  el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--muted)">Carregando agenda…</div>`;
  try {
    _ppAgDados = await _ppBuscar(q => q.select('*').gte('data', sem.de).lte('data', sem.ate).neq('status', 'cancelada').order('numero'));
  } catch (e) { el.innerHTML = `<div style="padding:24px;color:var(--danger-fg)">Não consegui carregar a agenda: ${_ppEsc(e.message)}</div>`; return; }
  if (!document.getElementById('page-ppagenda')?.classList.contains('active') || cpSemana(_ppAgOffset).de !== sem.de) return;
  _ppAgRender(sem);
}

function _ppAgRender(sem) {
  const el = document.getElementById('ppAgBody'); if (!el) return;
  const hoje = _ppHoje(), podeCriar = ppPodeCriar();
  const dias = [...Array(7)].map((_, k) => { const d = new Date(sem.de + 'T12:00:00'); d.setDate(d.getDate() + k); return cpIso(d); });
  const porDia = new Map(dias.map(d => [d, []]));
  for (const o of _ppAgDados.ordens) for (const l of _ppAgDados.itens.get(o.id) || []) if (l.status !== 'cancelado') porDia.get(o.data)?.push({ o, l });
  const todos = [...porDia.values()].flat();
  const prep = todos.filter(x => x.l.tipo === 'preparar'), porc = todos.filter(x => x.l.tipo === 'porcionar');
  const somaPorUn = lista => { const m = {}; lista.forEach(x => { const u = x.l.unidade || 'un'; m[u] = (m[u] || 0) + Number(x.l.status === 'concluido' && x.l.qtd_real != null ? x.l.qtd_real : x.l.qtd_plan); }); return Object.entries(m).map(([u, v]) => `${_estQ(_estRound(v))} ${u}`).join(' + ') || '—'; };
  const totPorcoes = porc.reduce((s, x) => s + (Number(x.l.porcoes) || 0), 0);
  const rotSem = `${new Date(sem.de + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${new Date(sem.ate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const evt = ({ o, l }) => `<div onclick="ppAbrirOrdem('${o.id}')" style="cursor:pointer;border-radius:var(--r8);padding:6px 7px;margin-bottom:5px;background:${l.tipo === 'preparar' ? 'var(--orange-bg)' : 'var(--info-bg)'};${l.status === 'concluido' ? 'opacity:.7' : ''}">
      <div style="display:flex;align-items:center;gap:4px;font-size:var(--text-2xs);font-weight:800;color:${l.tipo === 'preparar' ? 'var(--orange-fg)' : 'var(--info-fg)'};text-transform:uppercase">
        ${lc(PP_TIPOS[l.tipo].icon, 10, 'currentColor')} ${PP_TIPOS[l.tipo].label}${l.status === 'concluido' ? ' ✓' : ''}<span style="margin-left:auto;font-weight:600;color:var(--muted)">#${o.numero}</span></div>
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--text);line-height:1.25;margin-top:2px">${_ppEsc(l.item_nome)}</div>
      <div style="font-size:var(--text-2xs);color:var(--text2)">${l.tipo === 'porcionar' && l.porcoes ? `${l.porcoes} porções · ` : ''}${_estQ(l.status === 'concluido' && l.qtd_real != null ? l.qtd_real : l.qtd_plan)} ${_ppEsc(l.unidade || '')}${l.status === 'concluido' && l.concluido_por ? ` · ${_ppEsc(l.concluido_por.split(' ')[0])}` : ''}</div>
    </div>`;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div style="font-size:var(--text-xl);font-weight:800">Agenda de produção</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">Semana de ${rotSem}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-outline btn-sm" onclick="_ppAgOffset--;renderPpAgenda()">${lc('chevron-left', 14, 'currentColor')}</button>
        <button class="btn btn-outline btn-sm" ${_ppAgOffset === 0 ? 'disabled' : ''} onclick="_ppAgOffset=0;renderPpAgenda()">Esta semana</button>
        <button class="btn btn-outline btn-sm" onclick="_ppAgOffset++;renderPpAgenda()">${lc('chevron-right', 14, 'currentColor')}</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:10px">${_ppTipoPill('preparar')}<span style="font-size:var(--text-sm)"><b>${prep.length}</b> ite${prep.length === 1 ? 'm' : 'ns'} · ${somaPorUn(prep)}</span></div>
      <div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:10px">${_ppTipoPill('porcionar')}<span style="font-size:var(--text-sm)"><b>${porc.length}</b> ite${porc.length === 1 ? 'm' : 'ns'}${totPorcoes ? ` · ${totPorcoes} porções` : ''}</span></div>
    </div>
    <div class="pp-agenda">${dias.map(d => {
      const lista = porDia.get(d).sort((a, b) => (a.l.tipo === b.l.tipo ? 0 : a.l.tipo === 'preparar' ? -1 : 1));
      const dt = new Date(d + 'T12:00:00');
      return `<div class="pp-dia${d === hoje ? ' hoje' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div><div style="font-size:var(--text-2xs);font-weight:800;text-transform:uppercase;color:${d === hoje ? 'var(--purple)' : 'var(--muted)'}">${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
            <div style="font-size:var(--text-lg);font-weight:800;color:${d === hoje ? 'var(--purple)' : 'var(--text)'}">${dt.getDate()}</div></div>
          ${podeCriar && d >= hoje ? `<button class="btn btn-ghost btn-sm" title="Nova ordem neste dia" style="padding:4px" onclick="ppNovaOrdem({data:'${d}'})">${lc('plus', 14, 'var(--purple)')}</button>` : ''}
        </div>
        ${lista.length ? lista.map(evt).join('') : `<div style="font-size:var(--text-xs);color:var(--muted);padding:6px 0">—</div>`}
      </div>`;
    }).join('')}</div>`;
}

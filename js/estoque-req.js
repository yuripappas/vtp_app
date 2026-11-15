/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-req.js — Requisição de insumos (Estoque › Requisições)
 *
 * Estoque trancado: quem usa pede, quem controla o estoque entrega.
 *  • Nasce na Pré-produção (ordem de produção → destino Cozinha Produção) ou
 *    avulsa (ex.: Cozinha Finalização pedindo o da mise en place).
 *  • Atender = TRANSFERÊNCIA do local onde o item é guardado para o local de
 *    destino (só entre os locais do cadastro do item — nada de local novo).
 *    est_movimentacoes tipo 'transferencia', ref_tipo 'requisicao',
 *    ref_id = est_requisicao_itens.id. A sobra fica no destino até a contagem.
 *  • Só quem tem "Estoque: Atender requisições" (Configurações › Usuários ›
 *    Perfis; padrão: Gestor) entrega ou cancela.
 *
 * Dados: est_requisicoes / est_requisicao_itens (migration 20261115120000).
 */

const REQ_LOCAL_PRODUCAO   = 'cozinha_prod';   // processados (ordem de produção)
const REQ_LOCAL_FINALIZACAO = 'cozinha_fin';   // mise en place

const REQ_STATUS = {
  pendente:  { label: 'Pendente',  cls: 'b-yellow' },
  entregue:  { label: 'Entregue',  cls: 'b-green'  },
  cancelada: { label: 'Cancelada', cls: 'b-gray'   },
};

function estPodeAtenderReq() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return false;
  if (u.role === 'gerente') return true;
  const atual = (typeof users !== 'undefined' && users.find(x => x.id === u.id)) || u;
  return (typeof getUserPerms === 'function' ? getUserPerms(atual) : []).includes('Estoque: Atender requisições');
}

// ── Dados ──────────────────────────────────────────────────────

let _reqDados = null;           // { reqs, itens: Map reqId → [linhas] }
let _reqFil = 'pendente';

async function estReqCarregar() {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const reqs = await cpSelect('est_requisicoes', q => q.select('*')
    .or(`status.eq.pendente,created_at.gte.${desde}`).order('created_at', { ascending: false }));
  const linhas = reqs.length ? await cpSelect('est_requisicao_itens', q => q.select('*').in('requisicao_id', reqs.map(r => r.id)).order('item_nome')) : [];
  const itens = new Map(reqs.map(r => [r.id, []]));
  linhas.forEach(l => itens.get(l.requisicao_id)?.push(l));
  _reqDados = { reqs, itens };
  _reqAtualizarBadge();
  return _reqDados;
}

const estReqPendentes = () => (_reqDados?.reqs || []).filter(r => r.status === 'pendente').length;

function _reqAtualizarBadge() {
  const b = document.getElementById('estReqBadge');
  if (!b) return;
  const n = estReqPendentes();
  b.textContent = n; b.style.display = n ? '' : 'none';
}

/**
 * Cria a requisição. itens = [{ item_id, qtd }] (qtd na unidade do item).
 * Usada pela Pré-produção (origem 'ordem') e pelo botão Nova requisição.
 */
async function estCriarRequisicao({ origem = 'avulsa', ordemId = null, destino, obs = '', itens = [] }) {
  const user = estUsuario();
  const linhas = itens.filter(l => l.item_id && l.qtd > 0);
  if (!linhas.length) throw new Error('Requisição sem itens');
  const [req] = await cpInsert('est_requisicoes', { origem, ordem_id: ordemId, destino, obs: obs || null, criado_por: user });
  await cpInsert('est_requisicao_itens', linhas.map(l => {
    const it = items.find(i => i.id === l.item_id);
    return { requisicao_id: req.id, item_id: l.item_id, item_nome: it?.name || l.nome || '—', unidade: it?.unit || null,
      qtd_pedida: _estRound(l.qtd), local_destino: destino, criado_por: user };
  }));
  _reqDados = null;
  return req;
}

async function estCancelarRequisicao(id, motivo) {
  await cpUpdate('est_requisicoes', id, { status: 'cancelada', cancelado_motivo: motivo || null });
  _reqDados = null;
}

// Origem padrão para entregar: onde o item é guardado (≠ destino)
function _reqOrigemPadrao(item, destino) {
  const locais = estLocaisReaisDoItem(item).filter(l => l !== destino);
  const ent = estLocalEntrada(item);
  return locais.includes(ent) ? ent : (locais[0] || null);
}

// ══════════════════════════════════════════════════════════════
// ABA REQUISIÇÕES
// ══════════════════════════════════════════════════════════════

async function estRenderAbaReq(forcar = false) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  if (!_reqDados || forcar) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted)">Carregando requisições…</div>`;
    try { await estReqCarregar(); }
    catch (e) { el.innerHTML = `<div style="padding:24px;color:var(--danger-fg)">Não consegui carregar as requisições: ${_estEsc(e.message)}</div>`; return; }
    if (!document.getElementById('estAbaBody') || _estCpAba !== 'requisicoes') return;
  }
  _reqRender();
}

function _reqRender() {
  const el = document.getElementById('estAbaBody');
  if (!el || !_reqDados) return;
  const pode = estPodeAtenderReq();
  const todas = _reqDados.reqs;
  const conta = st => todas.filter(r => r.status === st).length;
  const lista = todas.filter(r => !_reqFil || r.status === _reqFil);
  const chip = (id, label) => {
    const on = _reqFil === id;
    return `<button onclick="_reqFil='${id}';_reqRender()" class="badge ${on ? 'b-purple' : 'b-gray'}" style="cursor:pointer;border:none;padding:6px 12px;font-size:var(--text-sm);font-weight:${on ? 800 : 600}">${label}</button>`;
  };
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px">
      <div style="max-width:620px">
        <div style="font-size:var(--text-sm);color:var(--text2);line-height:1.5">Pedidos de insumos para a cozinha. Quem atende <b>transfere</b> do local onde o item é guardado para o local de destino. O que sobrar fica lá até a contagem.</div>
        ${pode ? '' : `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${lc('lock', 12, 'currentColor')} Só quem tem a permissão <b>Atender requisições</b> entrega os insumos.</div>`}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="estRenderAbaReq(true)" title="Atualizar">${lc('refresh-cw', 13, 'currentColor')}</button>
        <button class="btn btn-primary btn-sm" onclick="estNovaRequisicao()">${lc('plus', 13, '#fff')} Nova requisição</button>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${chip('pendente', `Pendentes (${conta('pendente')})`)}${chip('entregue', `Entregues (${conta('entregue')})`)}${chip('cancelada', `Canceladas (${conta('cancelada')})`)}${chip('', 'Todas · 30 dias')}
    </div>
    ${lista.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${lista.map(r => _reqCardHtml(r, pode)).join('')}</div>`
      : `<div style="padding:48px 20px;text-align:center;color:var(--muted)">${lc('clipboard-list', 26, 'var(--muted)')}<div style="margin-top:8px;font-size:var(--text-md)">${_reqFil === 'pendente' ? 'Nenhuma requisição esperando entrega' : 'Nenhuma requisição aqui'}</div></div>`}`;
}

const _reqQuando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

function _reqCardHtml(r, pode) {
  const linhas = _reqDados.itens.get(r.id) || [];
  const st = REQ_STATUS[r.status] || REQ_STATUS.pendente;
  const ordem = r.origem === 'ordem' ? `Ordem de produção` : 'Avulsa';
  return `<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="min-width:0">
        <div style="font-size:var(--text-md);font-weight:800">Requisição #${r.numero} <span class="badge ${st.cls}" style="margin-left:4px">${st.label}</span></div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${ordem} · ${_estEsc(r.criado_por || '—')} · ${_reqQuando(r.created_at)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:700;color:var(--text2)">${lc('map-pin', 13, 'var(--purple)')} Para: ${_estEsc(estLocalLabel(r.destino))}</div>
    <div style="border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:4px">
      ${linhas.map(l => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:var(--text-sm)">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_estEsc(l.item_nome)}</span>
        <span style="white-space:nowrap;font-weight:700">${r.status === 'entregue' && l.qtd_entregue != null && Number(l.qtd_entregue) !== Number(l.qtd_pedida)
          ? `<span style="color:var(--muted);text-decoration:line-through;font-weight:500">${_estQ(l.qtd_pedida)}</span> ${_estQ(l.qtd_entregue)}` : _estQ(r.status === 'entregue' ? (l.qtd_entregue ?? l.qtd_pedida) : l.qtd_pedida)} ${_estEsc(l.unidade || '')}</span></div>`).join('')}
    </div>
    ${r.obs ? `<div style="font-size:var(--text-xs);color:var(--text2);background:var(--surface2);border-radius:var(--r8);padding:6px 8px">${_estEsc(r.obs)}</div>` : ''}
    ${r.status === 'entregue' ? `<div style="font-size:var(--text-xs);color:var(--success-fg)">${lc('check-circle', 12, 'currentColor')} Entregue por ${_estEsc(r.atendido_por || '—')} · ${_reqQuando(r.atendido_em)}</div>` : ''}
    ${r.status === 'cancelada' ? `<div style="font-size:var(--text-xs);color:var(--muted)">Cancelada${r.cancelado_motivo ? ': ' + _estEsc(r.cancelado_motivo) : ''}</div>` : ''}
    ${r.status === 'pendente' && pode ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:2px">
      <button class="btn btn-ghost btn-sm" style="color:var(--muted)" onclick="_reqCancelarUI('${r.id}')">Cancelar</button>
      <button class="btn btn-primary btn-sm" onclick="estAtenderRequisicao('${r.id}')">${lc('repeat', 13, '#fff')} Entregar</button></div>` : ''}
  </div>`;
}

function _reqCancelarUI(id) {
  _estModal('ovReqCancel', 'Cancelar requisição', _estCampo('Motivo', `<input class="inp" id="rqMotivo" placeholder="ex: pedido em duplicidade">`),
    `_reqCancelarSalvar('${id}')`, 'Cancelar requisição', 460);
  setTimeout(() => document.getElementById('rqMotivo')?.focus(), 50);
}
async function _reqCancelarSalvar(id) {
  try {
    await estCancelarRequisicao(id, document.getElementById('rqMotivo').value.trim());
    document.getElementById('ovReqCancel')?.remove();
    toast('Requisição cancelada', 'ok');
    estRenderAbaReq(true);
  } catch (e) { toast('Não consegui cancelar: ' + e.message, 'err'); }
}

// ── Entregar (atender) ─────────────────────────────────────────

async function estAtenderRequisicao(id) {
  if (!estPodeAtenderReq()) return toast('Seu perfil não atende requisições', 'err');
  const r = _reqDados?.reqs.find(x => x.id === id);
  if (!r) return;
  const linhas = _reqDados.itens.get(id) || [];
  let saldos = null;
  try { saldos = await estSaldos(); } catch (e) { /* entrega sem mostrar saldo */ }
  const saldoEm = (itemId, l) => saldos?.porItem.get(itemId)?.porLocal[l]?.saldo;
  const linhaHtml = (l, k) => {
    const item = items.find(i => i.id === l.item_id);
    const locais = item ? estLocaisReaisDoItem(item) : [];
    const destOk = locais.includes(r.destino);
    const de = item ? _reqOrigemPadrao(item, r.destino) : null;
    const opts = (lista, sel) => lista.map(x => {
      const s = saldoEm(l.item_id, x);
      return `<option value="${x}"${x === sel ? ' selected' : ''}>${_estEsc(estLocalLabel(x))}${s != null ? ` · ${_estQ(s)} ${_estEsc(l.unidade || '')}` : ''}</option>`;
    }).join('');
    // Destino fora do cadastro do item: não inventa local — registra sem transferência
    const para = destOk ? r.destino : '';
    const optsPara = `<option value=""${para ? '' : ' selected'}>Não transferir (só registrar)</option>` + opts(locais, para);
    return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:10px 12px;display:flex;flex-direction:column;gap:8px" data-k="${k}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <div style="font-weight:700;font-size:var(--text-md)">${_estEsc(l.item_nome)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);white-space:nowrap">pedido: <b style="color:var(--text)">${_estQ(l.qtd_pedida)} ${_estEsc(l.unidade || '')}</b></div>
      </div>
      <div style="display:grid;grid-template-columns:110px 1fr 1fr;gap:8px;align-items:end">
        ${_estCampo(`Entregar (${_estEsc(l.unidade || 'un')})`, `<input class="inp" id="rqQ${k}" inputmode="decimal" value="${_estFmtInp(l.qtd_pedida)}">`, 'margin:0')}
        ${_estCampo('De', de ? `<select class="inp" id="rqDe${k}">${opts(locais.filter(x => x !== r.destino), de)}</select>`
          : `<div class="inp" style="color:var(--muted)">—</div><input type="hidden" id="rqDe${k}" value="">`, 'margin:0')}
        ${_estCampo('Para', `<select class="inp" id="rqPara${k}">${optsPara}</select>`, 'margin:0')}
      </div>
      ${!destOk ? `<div style="font-size:var(--text-xs);color:var(--warning-fg)">${lc('alert-triangle', 12, 'currentColor')} ${_estEsc(estLocalLabel(r.destino))} não está nos locais do cadastro deste item: a entrega fica registrada sem transferência. Para transferir, inclua ${_estEsc(estLocalLabel(r.destino))} nos locais do item em Configurações › Insumos.</div>`
        : !de ? `<div style="font-size:var(--text-xs);color:var(--warning-fg)">${lc('alert-triangle', 12, 'currentColor')} O item só está cadastrado em ${_estEsc(estLocalLabel(r.destino))}: a entrega fica registrada sem transferência.</div>` : ''}
    </div>`;
  };
  _estModal('ovReqAtender', `Entregar requisição #${r.numero}`, `
    <div class="fm-box" style="display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div><div style="font-size:var(--text-md);font-weight:700">Para: ${_estEsc(estLocalLabel(r.destino))}</div>
        <div style="font-size:var(--text-xs);color:var(--fg-muted)">Pedido por ${_estEsc(r.criado_por || '—')} · ${_reqQuando(r.created_at)}</div></div>
      ${lc('repeat', 18, 'var(--purple)')}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">${linhas.map(linhaHtml).join('')}</div>
    ${_estDica('Entregue menos se faltar no estoque; 0 = não entregue. A transferência sai no seu nome, com data e hora de agora.')}`,
    `_reqSalvarEntrega('${id}')`, 'Confirmar entrega', 640, r.obs ? _estEsc(r.obs) : '');
}

async function _reqSalvarEntrega(id) {
  const r = _reqDados?.reqs.find(x => x.id === id);
  const linhas = _reqDados?.itens.get(id) || [];
  if (!r) return;
  const plano = linhas.map((l, k) => {
    const item = items.find(i => i.id === l.item_id);
    return { l, item, qtd: _estNumBr(document.getElementById('rqQ' + k)?.value, l.unidade),
      de: document.getElementById('rqDe' + k)?.value || null, para: document.getElementById('rqPara' + k)?.value || null };
  });
  if (plano.some(p => !(p.qtd >= 0) || isNaN(p.qtd))) return toast('Confira as quantidades', 'err');
  if (!plano.some(p => p.qtd > 0)) return toast('Nada para entregar. Para desistir, cancele a requisição.', 'err');
  const btn = document.getElementById('ovReqAtender-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const agora = new Date().toISOString();
    const movs = plano.filter(p => p.qtd > 0 && p.item && p.de && p.para && p.de !== p.para).map(p => _estMovRow(p.item, {
      tipo: 'transferencia', sinal: 0, qtd: _estRound(p.qtd), local_origem: p.de, local_destino: p.para,
      motivo: `Requisição #${r.numero}`, data_mov: agora, ref_tipo: 'requisicao', ref_id: p.l.id,
    }));
    if (movs.length) await estInserirMovs(movs);
    for (const p of plano) await cpUpdate('est_requisicao_itens', p.l.id, { qtd_entregue: _estRound(p.qtd), local_origem: p.de, local_destino: p.para });
    await cpUpdate('est_requisicoes', id, { status: 'entregue', atendido_por: estUsuario(), atendido_em: agora });
    document.getElementById('ovReqAtender')?.remove();
    toast(`Requisição #${r.numero} entregue${movs.length ? ` · ${movs.length} transferência${movs.length > 1 ? 's' : ''}` : ''}`, 'ok');
    _estMovDados = null;
    estRenderAbaReq(true);
  } catch (e) {
    toast('Não consegui registrar a entrega: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar entrega'; }
  }
}

// ── Nova requisição (avulsa) ───────────────────────────────────

let _reqNova = null;

function estNovaRequisicao({ destino = REQ_LOCAL_FINALIZACAO, aoSalvar = null } = {}) {
  _reqNova = { destino, linhas: [{ k: 1, item_id: null, qtd: '' }], prox: 2, aoSalvar };
  const locais = estLocaisEstoque();
  // Destinos comuns primeiro (Cozinha Produção e Finalização), depois os demais locais do estoque
  const ordem = [REQ_LOCAL_PRODUCAO, REQ_LOCAL_FINALIZACAO];
  const lista = [...locais].sort((a, b) => ((ordem.indexOf(a.id) + 1) || 99) - ((ordem.indexOf(b.id) + 1) || 99));
  _estModal('ovReqNova', 'Nova requisição', `
    ${_estCampo('Para onde vai *', `<select class="inp" id="rqDestino" onchange="_reqNova.destino=this.value">${lista.map(l =>
      `<option value="${l.id}"${l.id === destino ? ' selected' : ''}>${_estEsc(l.label)}</option>`).join('')}</select>`, '', 'Cozinha Produção: para fazer processados · Cozinha Finalização: para montar a mise en place.')}
    <div style="font-size:var(--text-sm);font-weight:700;margin:4px 0 6px">Itens</div>
    <div id="rqNovaLinhas" style="display:flex;flex-direction:column;gap:8px"></div>
    <button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start;color:var(--purple)" onclick="_reqNovaAdd()">${lc('plus', 13, 'currentColor')} Adicionar item</button>
    ${_estCampo('Observação', `<input class="inp" id="rqObs" placeholder="ex: reposição do turno da noite">`)}`,
    '_reqNovaSalvar()', 'Enviar requisição', 620, 'O pedido vai para o Estoque; quem tem a permissão entrega.');
  _reqNovaRender();
}

function _reqNovaRender() {
  const el = document.getElementById('rqNovaLinhas'); if (!el || !_reqNova) return;
  el.innerHTML = _reqNova.linhas.map(l => {
    const it = items.find(i => i.id === l.item_id);
    return `<div style="display:grid;grid-template-columns:1fr 130px 32px;gap:8px;align-items:center">
      ${cpComboHtml('rqIt' + l.k, { tipo: 'item', valor: l.item_id, ao: `_reqNovaSet(${l.k},'item_id',%v)` })}
      <div style="position:relative"><input class="inp" inputmode="decimal" placeholder="Qtd" value="${_estEsc(l.qtd)}" oninput="_reqNovaSet(${l.k},'qtd',this.value,true)" style="padding-right:34px">
        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:var(--text-xs);color:var(--muted)">${_estEsc(it?.unit || '')}</span></div>
      <button type="button" class="btn btn-ghost btn-sm" title="Remover" onclick="_reqNovaDel(${l.k})" style="padding:6px">${lc('x', 14, 'var(--muted)')}</button>
    </div>`;
  }).join('');
}
function _reqNovaSet(k, campo, v, semRender) {
  const l = _reqNova?.linhas.find(x => x.k === k); if (!l) return;
  l[campo] = v;
  if (!semRender) _reqNovaRender();
}
function _reqNovaAdd() { _reqNova.linhas.push({ k: _reqNova.prox++, item_id: null, qtd: '' }); _reqNovaRender(); }
function _reqNovaDel(k) { _reqNova.linhas = _reqNova.linhas.filter(l => l.k !== k); if (!_reqNova.linhas.length) _reqNovaAdd(); else _reqNovaRender(); }

async function _reqNovaSalvar() {
  const n = _reqNova; if (!n) return;
  const itens = n.linhas.filter(l => l.item_id).map(l => {
    const it = items.find(i => i.id === l.item_id);
    return { item_id: l.item_id, qtd: _estNumBr(l.qtd, it?.unit) };
  });
  if (!itens.length) return toast('Escolha pelo menos um item', 'err');
  if (itens.some(l => !(l.qtd > 0))) return toast('Informe a quantidade de cada item', 'err');
  const btn = document.getElementById('ovReqNova-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const req = await estCriarRequisicao({ origem: 'avulsa', destino: document.getElementById('rqDestino').value, obs: document.getElementById('rqObs').value.trim(), itens });
    document.getElementById('ovReqNova')?.remove();
    toast(`Requisição #${req.numero} enviada ao estoque`, 'ok');
    if (typeof n.aoSalvar === 'function') n.aoSalvar(req);
    else if (typeof _estCpAba !== 'undefined' && _estCpAba === 'requisicoes' && document.getElementById('estAbaBody')) { _reqFil = 'pendente'; estRenderAbaReq(true); }
  } catch (e) {
    toast('Não consegui enviar: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar requisição'; }
  }
}

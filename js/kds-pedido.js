/**
 * VTP Compras — Vai Ter Pizza!
 * kds-pedido.js — KDS Pedido (atendente) e Desempenho (gestor)
 *
 * KDS Pedido: todos os pedidos do turno em 3 colunas — Cozinha (aguardando,
 * em preparação, finalização), Prontos e Em rota (entrega, retirada,
 * concluído, cancelado). Daqui se reordena a fila da cozinha (a mesma ordem
 * que o pizzaiolo vê) e o gestor lança pedido interno (sócios, marketing,
 * cortesia…): vai só para a cozinha, nunca para o CW nem para vendas; a baixa
 * de estoque sai quando cada pizza fica pronta, com o motivo escolhido.
 *
 * Capacidade: a partir dos tempos reais do turno (montagem por tipo,
 * forno + finalização), dos pizzaiolos com jornada aberta e dos 2 fornos
 * (salgada e doce, 60 pizzas/h cada), estima em quanto tempo sai uma pizza
 * pedida agora — e avisa quando passa do tempo de preparo configurado, para
 * a equipe aumentar o tempo no CW/iFood/99 (a API do CW não deixa mudar).
 *
 * Desempenho: produção, tempos e erros por pessoa e por sabor.
 */

const KDS_FORNO_POR_HORA = 60;     // cada forno (salgada e doce)
const KDS_PADRAO_MONT_SEG = 240;   // sem histórico no turno ainda
const KDS_PADRAO_FIN_SEG  = 600;   // forno + finalização

// Dados extras de cada tela, buscados junto com a recarga do KDS
async function _kdsCarregarExtra(sb) {
  if (_kds.tela === 'pedido') {
    const turno = _kdsInicioTurno().toISOString();
    const [jor, hoje] = await Promise.all([
      sb.from('kds_jornadas').select('operador_id,posto').is('fim', null).eq('posto', 'pizzaiolo')
        .gte('inicio', new Date(Date.now() - 14 * 3600e3).toISOString()),
      sb.from('kds_pizzas').select('tipo,iniciado_em,montagem_fim_em,finalizado_em').gte('montagem_fim_em', turno).limit(1000),
    ]);
    _kds.pizzaiolosAtivos = new Set((jor.data || []).map(j => j.operador_id)).size;
    _kds.hoje = hoje.data || [];
  }
}

// ── Pedidos do turno com status e coluna ───────────────────────

function _kdsPedidosTurno() {
  const ini = _kdsInicioTurno().getTime();
  const porCw = new Map([..._kds.pedidos.values()].filter(p => p.cw_pedido_id).map(p => [p.cw_pedido_id, p]));
  const out = [];
  for (const cw of _kds.cw.values()) {
    const ped = porCw.get(cw.id) || null;
    const ativo = KDS_CW_ATIVOS.includes(cw.status);
    if (!ativo && new Date(cw.cw_created_at).getTime() < ini) continue;
    const pizzas = ped ? _kdsPizzasDoPedido(ped.id) : [];
    out.push({ ped, cw, pizzas, st: _kdsStatusPedido(cw, ped, pizzas) });
  }
  for (const ped of _kds.pedidos.values()) {
    if (ped.origem !== 'interno') continue;
    const cw = _kdsCwDe(ped);
    const pizzas = _kdsPizzasDoPedido(ped.id);
    out.push({ ped, cw, pizzas, st: _kdsStatusPedido(cw, ped, pizzas) });
  }
  return out;
}

function _kdsBebidas(cw) {
  const out = [];
  for (const it of cw.items || []) {
    if (it.status === 'canceled') continue;
    const subs = it.items?.length ? it.items.filter(s => s.status !== 'canceled') : [it];
    for (const sub of subs) {
      const r = typeof _vInterpretarItem === 'function' ? _vInterpretarItem(sub) : { pizzas: [], bebidas: [] };
      const q = (it.quantity || 1) * (sub !== it ? (sub.quantity || 1) : 1);
      (r.bebidas || []).forEach(b => out.push({ nome: b.nome, qtd: (b.qtd || 1) * q }));
      if (!r.pizzas?.length && !(r.bebidas || []).length) out.push({ nome: sub.name, qtd: q });
    }
  }
  return out;
}

function _kdsMinutos(o) {
  const fim = ['concluido', 'cancelado'].includes(o.st)
    ? (o.cw.status_timestamps?.[o.cw.status] || o.ped?.concluido_em || o.ped?.cancelado_em) : null;
  const de = o.st === 'agendado' || o.ped?.origem === 'interno' ? (o.ped?.entra_fila_em || o.cw.cw_created_at) : o.cw.cw_created_at;
  return { de, fim };
}

function _kdsHtmlPedidoTela() {
  const cfg = _kdsCfg();
  const q = (_kds.busca || '').trim().toLowerCase();
  const todos = _kdsPedidosTurno().filter(o => !q
    || String(o.cw.display_id ?? '').toLowerCase().includes(q.replace('#', ''))
    || String(o.cw.customer_name || '').toLowerCase().includes(q));
  const col = { cozinha: [], prontos: [], rota: [] };
  todos.forEach(o => col[KDS_ST[o.st].col].push(o));
  col.cozinha.sort((a, b) => (a.st === 'agendado') - (b.st === 'agendado') || (a.ped?.prioridade ?? 9e12) - (b.ped?.prioridade ?? 9e12));
  col.prontos.sort((a, b) => new Date(a.cw.cw_created_at) - new Date(b.cw.cw_created_at));
  const ordemRota = ['entrega', 'retirada', 'concluido', 'cancelado'];
  col.rota.sort((a, b) => ordemRota.indexOf(a.st) - ordemRota.indexOf(b.st) || new Date(b.cw.cw_created_at) - new Date(a.cw.cw_created_at));
  _kds.colunaPed = _kds.colunaPed || 'cozinha';

  const coluna = (id, titulo, lista) => `
    <section class="kds-pcol${_kds.colunaPed === id ? ' on' : ''}">
      <h3>${titulo} <span>${lista.length}</span></h3>
      <div class="kds-pcol-lista">${lista.length ? lista.map(_kdsHtmlCardPed).join('') : '<div class="kds-ficha-vazia">Nenhum pedido.</div>'}</div>
    </section>`;

  return `<div class="kds kds-pedido">
    ${_kdsHtmlTop('KDS Pedido')}
    <div class="kds-pbar">
      <div class="kds-pbar-busca">
        <input class="kds-input" placeholder="Buscar por cliente ou pedido" value="${_kdsEsc(_kds.busca || '')}" oninput="_kds.busca=this.value;_kdsRefazerColunas()">
        ${_kdsGestor() ? `<button class="kds-btn kds-btn-roxo" onclick="_kdsNovoInterno()">Novo pedido</button>` : ''}
      </div>
      <div class="kds-ptempos">
        <div><span>Preparo</span><b>${cfg.metaPreparo} min</b></div>
        <div><span>Entrega</span><b>${cfg.metaEntrega} min</b></div>
        <div><span>Total</span><b>${cfg.metaPreparo + cfg.metaEntrega} min</b></div>
      </div>
    </div>
    ${_kdsHtmlCapacidade()}
    <div class="kds-ptabs">
      ${[['cozinha', 'Cozinha', col.cozinha], ['prontos', 'Prontos', col.prontos], ['rota', 'Em rota', col.rota]].map(([id, t, l]) =>
        `<button class="${_kds.colunaPed === id ? 'on' : ''}" onclick="_kds.colunaPed='${id}';_kdsRender()">${t} <span>${l.length}</span></button>`).join('')}
    </div>
    <div class="kds-pcols" id="kdsPcols">
      ${!_kds.carregou ? '<div class="kds-vazio" style="grid-column:1/-1">Carregando pedidos…</div>'
        : coluna('cozinha', 'Cozinha', col.cozinha) + coluna('prontos', 'Prontos', col.prontos) + coluna('rota', 'Em rota', col.rota)}
    </div>
  </div>`;
}

// Busca: redesenha só as colunas, sem perder o foco do campo
function _kdsRefazerColunas() {
  const box = document.getElementById('kdsPcols');
  if (!box) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _kdsHtmlPedidoTela();
  box.innerHTML = tmp.querySelector('#kdsPcols').innerHTML;
  document.querySelectorAll('.kds-ptabs button span').forEach((s, i) => { s.textContent = tmp.querySelectorAll('.kds-ptabs button span')[i]?.textContent || ''; });
  _kdsTick();
}

function _kdsHtmlCardPed(o) {
  const { cw, ped, st } = o;
  const cfg = _kdsCfg();
  const { de, fim } = _kdsMinutos(o);
  const limite = (KDS_ST[st].col === 'cozinha' ? cfg.metaPreparo : cfg.metaPreparo + cfg.metaEntrega);
  const beb = cw.interno ? [] : _kdsBebidas(cw);
  const tempo = st === 'agendado'
    ? `<span class="kds-pc-tempo">${new Date(ped.entra_fila_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>`
    : fim ? `<span class="kds-pc-tempo">${Math.max(0, Math.round(_kdsSeg(de, fim) / 60))} min</span>`
    : `<span class="kds-pc-tempo" data-kds-desde="${de}" data-kds-fmt="pmin" data-kds-limite="${limite}"><span></span></span>`;
  const total = cw.total != null ? `<span class="kds-pc-valor">${Number(cw.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>` : '';
  const nPz = o.pizzas.filter(z => z.status !== 'cancelada').length;
  return `
    <button class="kds-pc" style="--st:${KDS_ST[st].cor}" onclick="_kdsAbrirModal({tipo:'ped-det',ref:'${ped ? ped.id : 'cw-' + cw.id}'})">
      <span class="kds-pc-ico">${_kdsIcoTipo(cw)}</span>
      <span class="kds-pc-info">
        <span class="kds-pc-l1"><b>#${_kdsEsc(cw.display_id)}</b> <span>${_kdsEsc(cw.customer_name || 'Cliente')}</span></span>
        <span class="kds-pc-l2">${_kdsHtmlCanal(cw)}${total}</span>
        <span class="kds-pc-l3">${nPz ? `<span class="kds-pc-pz">${KDS_SVG.pizza.replace(/width="20" height="20"/, 'width="14" height="14"')} ${nPz}</span>` : ''}
          ${beb.length ? `<span class="kds-pc-beb">${KDS_SVG.copo} ${beb.reduce((s, b) => s + b.qtd, 0)} bebida${beb.reduce((s, b) => s + b.qtd, 0) > 1 ? 's' : ''}</span>` : ''}
          ${_kds.novos.has(cw.id) ? `<span class="kds-novo kds-novo-claro">Novo ${KDS_SVG.estrela}</span>` : ''}</span>
      </span>
      <span class="kds-pc-dir">${tempo}${_kdsBadgeSt(st)}</span>
    </button>`;
}

// ── Capacidade ─────────────────────────────────────────────────

function _kdsCapacidade() {
  const cat = z => z.tipo === 'doce' ? 'doce' : 'salgada';
  const med = (arr, pad) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : pad;
  const hoje = _kds.hoje || [];
  const tMont = {}, tFin = {};
  for (const c of ['salgada', 'doce']) {
    const h = hoje.filter(z => cat(z) === c);
    // ignora tempos absurdos (pizza esquecida aberta)
    tMont[c] = med(h.map(z => _kdsSeg(z.iniciado_em, z.montagem_fim_em)).filter(s => s > 20 && s < 1800), KDS_PADRAO_MONT_SEG);
    tFin[c]  = med(h.filter(z => z.finalizado_em).map(z => _kdsSeg(z.montagem_fim_em, z.finalizado_em)).filter(s => s > 30 && s < 3600), KDS_PADRAO_FIN_SEG);
  }
  const vivas = [..._kds.pizzas.values()].filter(z => {
    const cw = _kdsCwDe(_kds.pedidos.get(z.pedido_id));
    return cw && !_kdsCancelado(cw) && KDS_CW_ATIVOS.includes(cw.status)
      && new Date(_kds.pedidos.get(z.pedido_id).entra_fila_em).getTime() <= Date.now();
  });
  const montar = vivas.filter(z => ['aguardando', 'em_preparo'].includes(z.status));
  const noForno = vivas.filter(z => ['aguardando', 'em_preparo', 'finalizacao'].includes(z.status));
  const pizzaiolos = Math.max(1, _kds.pizzaiolosAtivos || 0);
  const filaMontSeg = montar.reduce((s, z) => s + tMont[cat(z)], 0) / pizzaiolos;
  const fornoSeg = Math.max(...['salgada', 'doce'].map(c => noForno.filter(z => cat(z) === c).length)) * 3600 / KDS_FORNO_POR_HORA;
  const umaSeg = (tMont.salgada + tFin.salgada);
  const previsao = Math.round((Math.max(filaMontSeg, fornoSeg) + umaSeg) / 60);
  const ritmo = hoje.filter(z => _kdsSeg(z.montagem_fim_em) <= 3600).length;
  return { previsao, fila: montar.length, forno: noForno.length - montar.length, ritmo, pizzaiolos: _kds.pizzaiolosAtivos || 0, tMont, tFin };
}

function _kdsHtmlCapacidade() {
  if (!_kds.carregou) return '';
  const c = _kdsCapacidade();
  const meta = _kdsCfg().metaPreparo;
  const nivel = c.previsao > meta ? 'alto' : c.previsao > meta * .8 ? 'medio' : 'ok';
  const sugestao = Math.ceil(c.previsao / 5) * 5;
  const msg = nivel === 'alto' ? `Cozinha acima do tempo de preparo — aumente para <b>${sugestao} min</b> no CW, iFood e 99`
    : nivel === 'medio' ? 'Perto do limite do tempo de preparo — fique de olho'
    : 'Dentro do tempo de preparo';
  return `<section class="kds-cap kds-cap-${nivel}">
    <div class="kds-cap-prev"><span>Pizza pedida agora sai em</span><b>~${c.previsao} min</b></div>
    <div class="kds-cap-kpis">
      <div><span>Para montar</span><b>${c.fila}</b></div>
      <div><span>Forno/finalização</span><b>${c.forno}</b></div>
      <div><span>Ritmo (1h)</span><b>${c.ritmo}/h</b></div>
      <div><span>Pizzaiolos</span><b>${c.pizzaiolos}</b></div>
    </div>
    <div class="kds-cap-msg">${msg}</div>
  </section>`;
}

// ── Detalhe do pedido ──────────────────────────────────────────

function _kdsAcharPedido(ref) {
  return _kdsPedidosTurno().find(o => (o.ped && o.ped.id === ref) || (!o.ped && 'cw-' + o.cw.id === ref));
}

KDS_MODAIS['ped-det'] = (m) => {
  const o = _kdsAcharPedido(m.ref);
  if (!o) return '';
  const { cw, ped, st } = o;
  const pizzas = o.pizzas.filter(z => z.status !== 'cancelada' || z.destino);
  const nome = id => _kds.operadores.find(x => x.id === id)?.nome?.split(' ')[0] || '';
  const stPz = z => z.status === 'cancelada'
      ? ({ refeita: 'Refeita', reaproveitada: 'Reaproveitada em outro pedido', desperdicio: 'Desperdício' }[z.destino] || 'Cancelada')
    : z.status === 'aguardando' ? 'Aguardando'
    : z.status === 'em_preparo' ? `Em preparo · ${nome(z.iniciado_por)}`
    : z.status === 'finalizacao' ? `Finalização · montada por ${nome(z.iniciado_por)}`
    : `Pronta${z.finalizado_por ? ' · ' + nome(z.finalizado_por) : ''}`;
  const beb = cw.interno ? [] : _kdsBebidas(cw);
  const naFila = KDS_ST[st].col === 'cozinha' && ped;
  const ag = cw.order_timing === 'scheduled' && cw.schedule?.scheduled_date_time_start;
  const hora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<div class="kds-dlg">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <div class="kds-det-head">
      <span class="kds-pc-ico">${_kdsIcoTipo(cw)}</span>
      <div><h3>#${_kdsEsc(cw.display_id)} <span>${_kdsEsc(cw.customer_name || 'Cliente')}</span></h3>
        <div class="kds-det-sub">${_kdsBadgeSt(st)} ${_kdsHtmlCanal(cw)} <span>${cw.total != null ? Number(cw.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' · ' : ''}${hora(cw.cw_created_at)}</span></div></div>
    </div>
    ${ag ? `<div class="kds-det-aviso">Agendado para <b>${hora(ag)}</b> — entra na fila às <b>${hora(ped?.entra_fila_em || ag)}</b></div>` : ''}
    ${cw.interno ? `<div class="kds-det-aviso">Pedido interno · ${_kdsEsc(_kdsMotivoLabel(ped.motivo))}${ped.criado_por ? ' · lançado por ' + _kdsEsc(ped.criado_por) : ''}. Não vai para o CW nem para vendas; sai do estoque quando cada pizza fica pronta.</div>` : ''}
    <label class="kds-dlg-lbl">Pizzas</label>
    ${pizzas.length ? pizzas.map(z => `<div class="kds-det-pz${z.status === 'cancelada' ? ' off' : ''}">
        <b>${_kdsPad(z.seq)}</b><span>${z.tamanho === 'grande' ? 'Grande' : 'Pequena'} · ${_kdsEsc(_kdsSabores(z).map(s => s.nome + (s.inteira ? ' (inteira)' : '')).join(' + '))}</span><em>${_kdsEsc(stPz(z))}</em></div>`).join('')
      : '<div class="kds-ficha-vazia" style="padding:8px 0">Sem pizza neste pedido.</div>'}
    ${beb.length ? `<label class="kds-dlg-lbl">Bebidas e outros itens</label>${beb.map(b => `<div class="kds-det-pz"><b>${b.qtd}×</b><span>${_kdsEsc(b.nome)}</span></div>`).join('')}` : ''}
    ${(cw.observation || '').trim() ? `<div class="kds-obs" style="margin-top:12px">${_kdsEsc(cw.observation)}</div>` : ''}
    ${naFila ? `<label class="kds-dlg-lbl">Ordem na fila da cozinha</label>
      <div class="kds-det-acoes">
        <button class="kds-btn kds-btn-roxo" onclick="_kdsMoverFila('${ped.id}','topo')">Passar para o topo</button>
        <button class="kds-btn kds-btn-claro" onclick="_kdsMoverFila('${ped.id}','sobe')">${KDS_SVG.seta} Subir</button>
        <button class="kds-btn kds-btn-claro" onclick="_kdsMoverFila('${ped.id}','desce')">${KDS_SVG.seta.replace('m6 15 6-6 6 6', 'm6 9 6 6 6-6')} Descer</button>
      </div>` : ''}
    ${cw.interno && st === 'pronto' ? `<button class="kds-btn kds-btn-sim kds-btn-bloco" style="margin-top:16px" onclick="_kdsInternoAcao('${ped.id}','concluir')">Marcar como entregue</button>` : ''}
    ${cw.interno && _kdsGestor() && !['concluido', 'cancelado'].includes(st) ? `<button class="kds-btn-refazer" onclick="_kdsInternoAcao('${ped.id}','cancelar')">Cancelar pedido interno</button>` : ''}
  </div>`;
};

async function _kdsMoverFila(pedId, dir) {
  const fila = _kdsPedidosTurno().filter(o => o.ped && ['aguardando', 'em_preparo', 'finalizacao'].includes(o.st))
    .map(o => o.ped).sort((a, b) => a.prioridade - b.prioridade);
  const i = fila.findIndex(p => p.id === pedId);
  if (i < 0) return;
  let nova;
  if (dir === 'topo') { if (i === 0) return _kdsAviso('Já é o primeiro da fila'); nova = fila[0].prioridade - 60; }
  else if (dir === 'sobe') { if (i === 0) return _kdsAviso('Já é o primeiro da fila'); nova = i > 1 ? (fila[i - 2].prioridade + fila[i - 1].prioridade) / 2 : fila[0].prioridade - 60; }
  else { if (i === fila.length - 1) return _kdsAviso('Já é o último da fila'); nova = i < fila.length - 2 ? (fila[i + 1].prioridade + fila[i + 2].prioridade) / 2 : fila[i + 1].prioridade + 60; }
  const { error } = await _kdsDb().rpc('kds_prioridade', { p_pedido: pedId, p_prioridade: nova });
  if (error) return _kdsAviso('Não foi possível mudar a ordem', 'err');
  _kds.pedidos.get(pedId).prioridade = nova;
  _kdsRender(); _kdsRefazerModal();
  _kdsAviso('Ordem da fila atualizada — o pizzaiolo já vê a nova ordem');
}

async function _kdsInternoAcao(pedId, acao) {
  if (acao === 'cancelar' && !confirm('Cancelar este pedido interno? As pizzas que ainda não começaram saem da fila.')) return;
  const { data, error } = await _kdsDb().rpc(acao === 'cancelar' ? 'kds_interno_cancelar' : 'kds_interno_concluir', { p_pedido: pedId });
  if (error || !data) return _kdsAviso('Não foi possível atualizar o pedido', 'err');
  _kdsFecharModal(); _kdsAviso(acao === 'cancelar' ? 'Pedido interno cancelado' : 'Pedido interno entregue');
  _kdsCarregar();
}

// ── Novo pedido interno (gestor) ───────────────────────────────

function _kdsSaboresAtivos() {
  return (typeof opcoes !== 'undefined' ? opcoes : []).filter(o => o.active !== false)
    .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nome.localeCompare(b.nome, 'pt'));
}

function _kdsNovoInterno() {
  if (!_kdsGestor()) return _kdsAviso('Só gestores lançam pedido interno', 'err');
  _kdsAbrirModal({ tipo: 'ped-novo', motivo: 'marketing', descricao: '', obs: '', pizzas: [{ tamanho: 'grande', s1: '', s2: '' }] });
}

// guarda o que já foi digitado antes de redesenhar o modal
function _kdsLerNovo() {
  const m = _kds.modal;
  const v = id => document.getElementById(id)?.value ?? '';
  m.motivo = v('kdsNiMotivo'); m.descricao = v('kdsNiDesc'); m.obs = v('kdsNiObs');
  m.pizzas.forEach((p, i) => { p.tamanho = v(`kdsNiT${i}`) || p.tamanho; p.s1 = v(`kdsNiA${i}`); p.s2 = v(`kdsNiB${i}`); });
}
function _kdsNovoPizza(i) { _kdsLerNovo(); if (i == null) _kds.modal.pizzas.push({ tamanho: 'grande', s1: '', s2: '' }); else _kds.modal.pizzas.splice(i, 1); _kdsRefazerModal(); }

KDS_MODAIS['ped-novo'] = (m) => {
  const sab = _kdsSaboresAtivos();
  const opts = sel => `<option value="">Sabor</option>` + ['salgada', 'doce'].map(c => {
    const l = sab.filter(o => (o.categoria || 'salgada') === c);
    return l.length ? `<optgroup label="${c === 'doce' ? 'Doces' : 'Salgadas'}">${l.map(o => `<option value="${o.id}"${String(sel) === String(o.id) ? ' selected' : ''}>${_kdsEsc(o.nome)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const tipos = typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO : [];
  return `<div class="kds-dlg" style="max-width:620px">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <h3 class="kds-dlg-tit">Novo pedido interno</h3>
    <p class="kds-dlg-nota" style="text-align:left;margin-top:0">Vai só para a cozinha — não entra no CW, nas vendas nem no ticket médio. Sai do estoque com o motivo escolhido quando cada pizza fica pronta.</p>
    <div class="kds-form">
      <div class="kds-form-2">
        <label>Motivo<select class="kds-input" id="kdsNiMotivo">${tipos.map(t => `<option value="${t.id}"${m.motivo === t.id ? ' selected' : ''}>${_kdsEsc(t.label)}</option>`).join('')}</select></label>
        <label>Para quem / descrição<input class="kds-input" id="kdsNiDesc" value="${_kdsEsc(m.descricao)}" placeholder="Ex.: sócios, influenciadora…"></label>
      </div>
      <label>Pizzas</label>
      ${m.pizzas.map((p, i) => `<div class="kds-ni-pz">
        <select class="kds-input" id="kdsNiT${i}" onchange="_kdsLerNovo();_kdsRefazerModal()">
          <option value="grande"${p.tamanho === 'grande' ? ' selected' : ''}>Grande</option>
          <option value="pequena"${p.tamanho === 'pequena' ? ' selected' : ''}>Pequena</option></select>
        <select class="kds-input" id="kdsNiA${i}">${opts(p.s1)}</select>
        ${p.tamanho === 'grande' ? `<select class="kds-input" id="kdsNiB${i}"><option value="">Inteira (mesmo sabor)</option>${opts(p.s2).replace('<option value="">Sabor</option>', '')}</select>` : '<span></span>'}
        <button class="kds-ni-x" onclick="_kdsNovoPizza(${i})" ${m.pizzas.length === 1 ? 'disabled' : ''} title="Remover">${KDS_SVG.x}</button>
      </div>`).join('')}
      <button class="kds-link-btn" onclick="_kdsNovoPizza()">+ Adicionar pizza</button>
      <label>Observação para a cozinha<input class="kds-input" id="kdsNiObs" value="${_kdsEsc(m.obs)}" placeholder="opcional"></label>
      <button class="kds-btn kds-btn-roxo kds-btn-bloco" id="kdsSim" onclick="_kdsSalvarInterno()">Enviar para a cozinha</button>
    </div>
  </div>`;
};

async function _kdsSalvarInterno() {
  _kdsLerNovo();
  const m = _kds.modal;
  const opc = id => opcoes.find(o => String(o.id) === String(id));
  const pizzas = [];
  for (const p of m.pizzas) {
    const a = opc(p.s1);
    if (!a) return _kdsAviso('Escolha o sabor de todas as pizzas', 'err');
    const b = p.tamanho === 'grande' ? (opc(p.s2) || a) : null;
    const meias = [a, b].filter(Boolean).map(o => ({ opcao_id: o.id, nome: o.nome }));
    const cats = new Set([a, b].filter(Boolean).map(o => o.categoria || 'salgada'));
    pizzas.push({ seq: pizzas.length + 1, tamanho: p.tamanho, meias, tipo: cats.size > 1 ? 'mista' : [...cats][0], observacao: null });
  }
  if (!m.motivo) return _kdsAviso('Escolha o motivo', 'err');
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const { error } = await _kdsDb().rpc('kds_pedido_interno', {
    p_motivo: m.motivo, p_descricao: m.descricao, p_observacao: m.obs, p_criado_por: getCurrentUser()?.name || null, p_pizzas: pizzas,
  });
  if (error) { if (btn) btn.disabled = false; return _kdsAviso(error.message, 'err'); }
  _kdsFecharModal(); _kdsAviso('Pedido interno enviado para a cozinha');
  _kdsCarregar();
}

// ── Desempenho (gestor) ────────────────────────────────────────

function _kdsPeriodo() {
  const p = _kds.periodo || 'hoje';
  const ini = _kdsInicioTurno();
  if (p === 'ontem') { const a = new Date(ini); a.setDate(a.getDate() - 1); return [a, ini]; }
  if (p === '7d') { const a = new Date(ini); a.setDate(a.getDate() - 6); return [a, new Date(Date.now() + 3600e3)]; }
  if (p === '30d') { const a = new Date(ini); a.setDate(a.getDate() - 29); return [a, new Date(Date.now() + 3600e3)]; }
  return [ini, new Date(Date.now() + 3600e3)];
}

async function _kdsCarregarDesempenho() {
  const [de, ate] = _kdsPeriodo();
  _kds.desemp = null; _kdsRender();
  const { data, error } = await _kdsDb().from('kds_pizzas')
    .select('meias,tipo,status,destino,iniciado_em,iniciado_por,montagem_fim_em,finalizado_em,finalizado_por,descartado_por,refeita_de')
    .gte('iniciado_em', de.toISOString()).lt('iniciado_em', ate.toISOString()).limit(5000);
  if (error) { _kdsAviso('Não foi possível carregar o desempenho', 'err'); return; }
  const { data: ops } = await _kdsDb().from('kds_operadores').select('id,nome');
  _kds.operadores = ops || _kds.operadores;
  _kds.desemp = data || [];
  if (_kds.tela === 'desempenho') _kdsRender();
}

function _kdsHtmlDesempenho() {
  if (_kds.desemp === undefined) { _kdsCarregarDesempenho(); }
  const d = _kds.desemp;
  const per = _kds.periodo || 'hoje';
  const filtros = `<div class="kds-hist-tabs kds-desemp-per">${[['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias']].map(([v, t]) =>
    `<button class="${per === v ? 'on' : ''}" onclick="_kds.periodo='${v}';_kdsCarregarDesempenho()">${t}</button>`).join('')}</div>`;
  if (!d) return `<div class="kds">${_kdsHtmlTop('Desempenho')}${filtros}<div class="kds-vazio">Carregando…</div></div>`;

  const nome = id => _kds.operadores.find(o => o.id === id)?.nome || '—';
  const mmss = s => s ? _kdsMmSs(s).replace(/^0/, '') : '—';
  const med = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const montSeg = z => { const s = _kdsSeg(z.iniciado_em, z.montagem_fim_em); return s > 20 && s < 1800 ? s : null; };
  const finSeg = z => { const s = _kdsSeg(z.montagem_fim_em, z.finalizado_em); return s > 30 && s < 3600 ? s : null; };

  const montadas = d.filter(z => z.montagem_fim_em);
  const pessoas = new Map();
  const P = id => pessoas.get(id) || (pessoas.set(id, { id, mont: [], fin: [], refeitas: 0, desp: 0 }), pessoas.get(id));
  for (const z of montadas) { if (z.iniciado_por) { const s = montSeg(z); P(z.iniciado_por).mont.push(s); } }
  for (const z of d.filter(z => z.finalizado_em && z.finalizado_por)) P(z.finalizado_por).fin.push(finSeg(z));
  for (const z of d.filter(z => z.destino === 'refeita' && z.iniciado_por)) P(z.iniciado_por).refeitas++;
  for (const z of d.filter(z => z.destino === 'desperdicio' && z.descartado_por)) P(z.descartado_por).desp++;

  const sabores = new Map();
  for (const z of montadas) {
    const s = montSeg(z);
    const nomes = [...new Set((z.meias || []).map(m => m.nome))];
    for (const n of nomes) { const x = sabores.get(n) || { n, qtd: 0, mont: [], fin: [] }; x.qtd++; if (s) x.mont.push(s); const f = finSeg(z); if (f) x.fin.push(f); sabores.set(n, x); }
  }

  const total = montadas.length;
  const refeitas = d.filter(z => z.destino === 'refeita').length;
  const desp = d.filter(z => z.destino === 'desperdicio').length;
  const reap = d.filter(z => z.destino === 'reaproveitada').length;
  const ciclo = med(d.filter(z => z.finalizado_em).map(z => _kdsSeg(z.iniciado_em, z.finalizado_em)).filter(s => s > 60 && s < 7200));

  const linhasP = [...pessoas.values()].sort((a, b) => b.mont.length - a.mont.length || b.fin.length - a.fin.length).map(p => {
    const m = p.mont.filter(Boolean), f = p.fin.filter(Boolean);
    const taxa = p.mont.length ? Math.round(p.refeitas / p.mont.length * 100) : 0;
    return `<tr><td><b>${_kdsEsc(nome(p.id))}</b></td><td>${p.mont.length}</td><td>${mmss(med(m))}</td>
      <td class="${p.refeitas ? 'kds-td-alerta' : ''}">${p.refeitas}${p.mont.length ? ` <small>(${taxa}%)</small>` : ''}</td>
      <td>${p.fin.length}</td><td>${mmss(med(f))}</td><td>${p.desp}</td></tr>`;
  }).join('');
  const linhasS = [...sabores.values()].sort((a, b) => b.qtd - a.qtd).map(s =>
    `<tr><td><b>${_kdsEsc(s.n)}</b></td><td>${s.qtd}</td><td>${mmss(med(s.mont))}</td><td>${mmss(med(s.fin))}</td></tr>`).join('');

  return `<div class="kds kds-desemp">
    ${_kdsHtmlTop('Desempenho')}
    ${filtros}
    <div class="kds-desemp-kpis">
      <div><span>Pizzas montadas</span><b>${total}</b></div>
      <div><span>Ciclo médio (início → pronta)</span><b>${mmss(ciclo)}</b></div>
      <div><span>Refeitas (erro de montagem)</span><b>${refeitas}</b></div>
      <div><span>Desperdício</span><b>${desp}</b></div>
      <div><span>Reaproveitadas</span><b>${reap}</b></div>
    </div>
    <section class="kds-desemp-box">
      <h3>Por pessoa</h3>
      <div class="kds-tabela-wrap"><table class="kds-tabela">
        <thead><tr><th>Pessoa</th><th>Montou</th><th>Tempo médio montagem</th><th>Refeitas</th><th>Finalizou</th><th>Forno + finalização</th><th>Desperdício</th></tr></thead>
        <tbody>${linhasP || '<tr><td colspan="7" class="kds-ficha-vazia">Sem produção no período.</td></tr>'}</tbody>
      </table></div>
    </section>
    <section class="kds-desemp-box">
      <h3>Por sabor</h3>
      <div class="kds-tabela-wrap"><table class="kds-tabela">
        <thead><tr><th>Sabor</th><th>Pizzas</th><th>Montagem</th><th>Forno + finalização</th></tr></thead>
        <tbody>${linhasS || '<tr><td colspan="4" class="kds-ficha-vazia">Sem produção no período.</td></tr>'}</tbody>
      </table></div>
    </section>
  </div>`;
}

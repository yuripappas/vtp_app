/**
 * VTP Compras — Vai Ter Pizza!
 * kds-finalizacao.js — KDS Finalização (no mockup, "KDS Despacho")
 *
 * A pizza que o pizzaiolo mandou pro forno aparece aqui para finalizar
 * (orégano, Nutella…), cortar e embalar. Cada pedido mostra todas as pizzas:
 *   Pendente (ainda na fila) · Em preparo · Finalizar · Pronto
 * Quando a última pizza fica pronta, o pedido é marcado como Pronto no CW
 * (kds_finalizar → cw-status "prepared") e vai para o histórico.
 *
 * Refazer: a pizza vira descarte (erro de montagem de quem montou, baixa
 * "Montagem incorreta" no estoque) e uma igual volta para a fila do pizzaiolo.
 * Pedido cancelado com pizza já feita: reaproveitar numa pizza igual de outro
 * pedido ou registrar desperdício (baixa no estoque com o tipo escolhido).
 */

function _kdsFiltro() { return _kds.filtro || (_kds.filtro = { numero: '', sabores: [] }); }

// Pedidos na finalização: começaram e ainda têm pizza por fazer — ou foram
// cancelados com pizza feita sem destino.
function _kdsFilaFinalizacao() {
  const f = _kdsFiltro();
  const fila = [];
  for (const ped of _kds.pedidos.values()) {
    const cw = _kdsCwDe(ped);
    if (!cw) continue;
    const pizzas = _kdsPizzasDoPedido(ped.id).filter(z => z.status !== 'cancelada');
    const cancelado = _kdsCancelado(cw);
    if (cancelado) {
      if (!pizzas.some(z => ['finalizacao', 'pronto', 'em_preparo'].includes(z.status) && !z.destino)) continue;
    } else {
      if (!KDS_CW_ATIVOS.includes(cw.status)) continue;
      if (!pizzas.some(z => z.status !== 'aguardando')) continue;
      if (!pizzas.some(z => ['aguardando', 'em_preparo', 'finalizacao'].includes(z.status))) continue;
    }
    if (f.numero && !String(cw.display_id ?? '').includes(f.numero.replace(/\D/g, '') || f.numero)) continue;
    if (f.sabores.length && !pizzas.some(z => (z.meias || []).some(m => f.sabores.includes(m.nome)))) continue;
    fila.push({ ped, cw, pizzas: cancelado ? pizzas.filter(z => z.status !== 'aguardando') : pizzas, cancelado });
  }
  return fila.sort((a, b) => (b.cancelado - a.cancelado) || (a.ped.prioridade - b.ped.prioridade));
}

// Pedidos do turno que já passaram pela finalização
function _kdsHistorico() {
  const ini = _kdsInicioTurno().getTime();
  const out = [];
  for (const ped of _kds.pedidos.values()) {
    const cw = _kdsCwDe(ped);
    if (!cw || new Date(cw.cw_created_at).getTime() < ini) continue;
    const pizzas = _kdsPizzasDoPedido(ped.id);
    const st = _kdsStatusPedido(cw, ped, pizzas);
    if (['aguardando', 'agendado', 'em_preparo', 'finalizacao'].includes(st)) continue;
    if (st === 'cancelado' && !pizzas.some(z => z.iniciado_em)) continue;   // nem entrou na cozinha
    out.push({ ped, cw, st });
  }
  const ordem = Object.keys(KDS_ST);
  return _kds.histOrdem === 'status'
    ? out.sort((a, b) => ordem.indexOf(a.st) - ordem.indexOf(b.st) || (Number(b.cw.display_id) || 0) - (Number(a.cw.display_id) || 0))
    : out.sort((a, b) => String(b.cw.display_id).localeCompare(String(a.cw.display_id), 'pt', { numeric: true }));
}

function _kdsSaboresNaFila() {
  const set = new Set();
  for (const z of _kds.pizzas.values()) {
    if (['em_preparo', 'finalizacao'].includes(z.status)) (z.meias || []).forEach(m => set.add(m.nome));
  }
  _kdsFiltro().sabores.forEach(n => set.add(n));
  return [...set].sort((a, b) => a.localeCompare(b, 'pt'));
}

function _kdsHtmlFinalizacao() {
  const fila = _kdsFilaFinalizacao();
  const vivas = [..._kds.pizzas.values()].filter(z => {
    const cw = _kdsCwDe(_kds.pedidos.get(z.pedido_id));
    return cw && !_kdsCancelado(cw) && KDS_CW_ATIVOS.includes(cw.status);
  });
  const contadores = `<div class="kds-top-counts">
      <div class="kds-count kds-count-ag"><b>${vivas.filter(z => z.status === 'finalizacao').length}</b><span>Pendentes</span></div>
      <div class="kds-count kds-count-in"><b>${vivas.filter(z => z.status === 'em_preparo').length}</b><span>Iniciadas</span></div>
    </div>`;
  const f = _kdsFiltro();
  const filtrando = f.numero || f.sabores.length;
  const sabores = _kdsSaboresNaFila();

  const lista = !_kds.carregou ? '<div class="kds-vazio">Carregando pedidos…</div>'
    : fila.length ? fila.map(_kdsHtmlPedidoFin).join('')
    : `<div class="kds-vazio">${KDS_SVG.pizza.replace(/width="20" height="20"/, 'width="48" height="48"')}<b>${filtrando ? 'Nenhum pedido com esse filtro' : 'Nada para finalizar'}</b>${filtrando ? '' : 'As pizzas aparecem aqui quando o pizzaiolo termina a montagem.'}</div>`;

  return `<div class="kds kds-finalizacao">
    ${_kdsHtmlTop('KDS Finalização', contadores)}
    <div class="kds-fin-wrap">
      <div class="kds-fin-main">
        <div class="kds-fin-bar">
          <button class="kds-fin-filtro" onclick="_kdsAbrirModal({tipo:'fin-filtro'})">${KDS_SVG.filtro}<span>Filtrar pedido${filtrando ? ` <b>(${(f.numero ? 1 : 0) + f.sabores.length})</b>` : ''}</span></button>
          <button class="kds-fin-limpar" ${filtrando ? '' : 'disabled'} onclick="_kdsLimparFiltro()">${KDS_SVG.borracha}<span>Limpar filtro</span></button>
          <button class="kds-fin-hist-btn" onclick="_kdsAbrirModal({tipo:'fin-historico'})">Histórico</button>
        </div>
        ${sabores.length ? `<div class="kds-fin-sabores">${sabores.map(n => `<button class="kds-sabor-chip${f.sabores.includes(n) ? ' on' : ''}" onclick="_kdsAlternarSabor(this.dataset.n)" data-n="${_kdsEsc(n)}">${_kdsEsc(n)}</button>`).join('')}</div>` : ''}
        <main class="kds-lista">${lista}</main>
      </div>
      <aside class="kds-fin-hist">${_kdsHtmlHistorico()}</aside>
    </div>
  </div>`;
}

function _kdsHtmlHistorico() {
  const hist = _kdsHistorico();
  return `<h3>Histórico de pedidos</h3>
    <div class="kds-hist-tabs">
      <button class="${_kds.histOrdem !== 'status' ? 'on' : ''}" onclick="_kds.histOrdem='numero';_kdsRender();_kdsRefazerModal()">Nº Pedido</button>
      <button class="${_kds.histOrdem === 'status' ? 'on' : ''}" onclick="_kds.histOrdem='status';_kdsRender();_kdsRefazerModal()">Status</button>
    </div>
    <div class="kds-hist-lista">${hist.length ? hist.map(h => `
      <div class="kds-hist-ln"><b>#${_kdsEsc(h.cw.display_id)}</b>${_kdsBadgeSt(h.st)}</div>`).join('')
      : '<div class="kds-ficha-vazia">Nenhum pedido finalizado neste turno.</div>'}</div>`;
}

function _kdsHtmlPedidoFin({ ped, cw, pizzas, cancelado }) {
  const obs = [(cw.observation || '').trim(), ...pizzas.filter(z => z.observacao).map(z => pizzas.length > 1 ? `${_kdsPad(z.seq)} · ${z.observacao}` : z.observacao)]
    .filter(Boolean);
  return `
    <article class="kds-ped${cancelado ? ' kds-ped-cancel' : ''}">
      <div class="kds-ped-head">
        <div class="kds-ped-l1">
          <span class="kds-ped-tipo">${_kdsIcoTipo(cw)}</span>
          <span class="kds-ped-num">#${_kdsEsc(cw.display_id)}</span>
          ${cancelado ? '<span class="kds-ped-cancel-tag">Cancelado</span>' : ''}
          ${_kdsHtmlCanal(cw)}
        </div>
        <div class="kds-ped-l2">
          <span class="kds-ped-cli">${KDS_SVG.user}<span>${_kdsEsc(cw.customer_name || 'Cliente')}</span>
            ${_kds.novos.has(cw.id) ? `<span class="kds-novo">Novo ${KDS_SVG.estrela}</span>` : ''}</span>
          <span class="kds-ped-tempo" data-kds-desde="${ped.entra_fila_em}" data-kds-fmt="min"><i></i><span></span></span>
        </div>
      </div>
      ${cancelado ? '<div class="kds-ped-cancel-msg">Pedido cancelado — reaproveite as pizzas prontas em outro pedido ou registre o desperdício.</div>' : ''}
      <div class="kds-ped-body">
        ${pizzas.map(z => _kdsHtmlPizzaFin(z, cancelado)).join('')}
        ${obs.length ? `<div class="kds-obs">${obs.map(_kdsEsc).join('<br>')}</div>` : ''}
      </div>
    </article>`;
}

function _kdsHtmlPizzaFin(z, cancelado) {
  let cls = `kds-pz kds-pz-fin-${z.status}`, ico, st, tempo = '';
  if (cancelado && ['finalizacao', 'pronto'].includes(z.status)) {
    cls += ' kds-pz-destino'; ico = KDS_SVG.seta.replace('m6 15 6-6 6 6', 'M5 12h14M13 6l6 6-6 6'); st = 'Dar destino';
  } else if (z.status === 'finalizacao') {
    ico = KDS_SVG.check; st = 'Finalizar';
    tempo = `<span class="kds-pz-tempo" data-kds-desde="${z.montagem_fim_em}"></span>`;
  } else if (z.status === 'pronto') {
    cls += ' kds-pz-feita'; ico = KDS_SVG.check; st = 'Pronto';
  } else if (z.status === 'em_preparo') {
    ico = KDS_SVG.relogio; st = 'Em preparo';
    tempo = `<span class="kds-pz-tempo" data-kds-desde="${z.iniciado_em}"></span>`;
  } else {
    ico = KDS_SVG.play; st = 'Pendente';
  }
  const nome = (z.tamanho === 'grande' ? 'Pizza Grande' : 'Pizza Pequena') + (z.refeita_de ? ' <span class="kds-tag-refazer">Refeita</span>' : '');
  const chips = _kdsSabores(z).map(m => `<span class="kds-chip">${_kdsEsc(m.nome)}${m.inteira ? '<span class="kds-chip-inteira">inteira</span>' : ''}</span>`).join('');
  const fin = ['finalizacao', 'em_preparo'].includes(z.status) && !cancelado ? _kdsIngredFinalizacao(z) : [];
  return `
    <button class="${cls}" onclick="_kdsTocarPizzaFin('${z.id}')">
      <span class="kds-pz-num">${_kdsPad(z.seq)}</span>
      <span class="kds-pz-info"><span class="kds-pz-nome" style="display:block">${nome}</span><span class="kds-pz-sabores">${chips}</span>
        ${fin.length ? `<span class="kds-pz-fin-ing">Finalizar com: <b>${fin.map(_kdsEsc).join(' · ')}</b></span>` : ''}</span>
      <span class="kds-pz-acao"><span class="kds-pz-ico">${ico}</span>${tempo}<span class="kds-pz-st">${st}</span></span>
    </button>`;
}

// ── Filtro ─────────────────────────────────────────────────────

function _kdsLimparFiltro() { _kds.filtro = { numero: '', sabores: [] }; _kdsRender(); }

function _kdsAlternarSabor(nome) {
  const f = _kdsFiltro();
  f.sabores = f.sabores.includes(nome) ? f.sabores.filter(n => n !== nome) : [...f.sabores, nome];
  _kdsRender();
  if (_kds.modal?.tipo === 'fin-filtro') _kdsRefazerModal();
}

KDS_MODAIS['fin-filtro'] = () => {
  const f = _kdsFiltro();
  const sabores = _kdsSaboresNaFila();
  return `<div class="kds-dlg kds-dlg-filtro">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <h3 class="kds-dlg-tit">Filtrar pedido</h3>
    <label class="kds-dlg-lbl">Por pedido</label>
    <input class="kds-input" id="kdsFiltroNum" inputmode="numeric" placeholder="Digitar número" value="${_kdsEsc(f.numero)}"
      onkeydown="if(event.key==='Enter')_kdsAplicarFiltro()">
    <label class="kds-dlg-lbl">Por sabor</label>
    <div class="kds-sabores-grid">${sabores.length ? sabores.map(n => `<button class="kds-sabor-chip${f.sabores.includes(n) ? ' on' : ''}" data-n="${_kdsEsc(n)}" onclick="_kdsFiltro().numero=document.getElementById('kdsFiltroNum').value.trim();_kdsAlternarSabor(this.dataset.n)">${_kdsEsc(n)}</button>`).join('')
      : '<span class="kds-ficha-vazia">Nenhuma pizza em preparo ou finalização.</span>'}</div>
    <button class="kds-btn kds-btn-sim kds-btn-bloco" style="margin-top:22px" onclick="_kdsAplicarFiltro()">${KDS_SVG.check.replace(/width="30" height="30"/, 'width="20" height="20"')} Confirmar</button>
  </div>`;
};

function _kdsAplicarFiltro() {
  _kdsFiltro().numero = document.getElementById('kdsFiltroNum')?.value.trim() || '';
  _kdsFecharModal(); _kdsRender();
}

KDS_MODAIS['fin-historico'] = () => `<div class="kds-dlg kds-fin-hist kds-fin-hist-modal">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    ${_kdsHtmlHistorico()}
  </div>`;

// ── Ações ──────────────────────────────────────────────────────

function _kdsTocarPizzaFin(id) {
  const z = _kds.pizzas.get(id);
  if (!z) return;
  const cw = _kdsCwDe(_kds.pedidos.get(z.pedido_id));
  if (_kdsCancelado(cw) && ['finalizacao', 'pronto'].includes(z.status)) return _kdsAbrirModal({ tipo: 'fin-destino', pizzaId: id });
  if (z.status === 'finalizacao') return _kdsAbrirModal({ tipo: 'fin-ok', pizzaId: id });
  if (z.status === 'pronto') return _kdsAbrirModal({ tipo: 'fin-refazer', pizzaId: id });
  if (z.status === 'em_preparo') return _kdsAviso('Esta pizza ainda está na montagem');
  _kdsAviso('Esta pizza ainda não foi iniciada pelo pizzaiolo');
}

KDS_MODAIS['fin-ok'] = (m, z, cw) => z && cw ? `<div class="kds-dlg kds-dlg-sm">
    <div class="kds-dlg-ico" style="background:var(--kds-final)">${KDS_SVG.check.replace(/width="30" height="30"/, 'width="58" height="58"')}</div>
    <p class="kds-dlg-txt">Confirma finalização do item <b>${_kdsPad(z.seq)}</b> do pedido nº <b>${_kdsEsc(cw.display_id)}</b>?</p>
    <div class="kds-dlg-btns">
      <button class="kds-btn kds-btn-nao" onclick="_kdsFecharModal()">Não</button>
      <button class="kds-btn kds-btn-sim" id="kdsSim" onclick="_kdsFinalizarPizza('${z.id}')">Sim</button>
    </div>
    <button class="kds-btn-refazer" onclick="_kdsAbrirModal({tipo:'fin-refazer',pizzaId:'${z.id}'})">Refazer pedido</button>
  </div>` : '';

KDS_MODAIS['fin-refazer'] = (m, z, cw) => z && cw ? `<div class="kds-dlg kds-dlg-sm">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <div class="kds-dlg-ico" style="background:var(--kds-vermelho)">${KDS_SVG.x.replace(/width="18" height="18"/, 'width="48" height="48"')}</div>
    <p class="kds-dlg-txt">Refazer o item <b>${_kdsPad(z.seq)}</b> do pedido nº <b>${_kdsEsc(cw.display_id)}</b>?</p>
    <p class="kds-dlg-nota">Uma pizza igual volta para o início da fila do pizzaiolo. Esta conta como erro de montagem e sai do estoque como "Montagem incorreta".</p>
    <input class="kds-input" id="kdsRefMotivo" placeholder="O que aconteceu? (opcional)" style="margin-bottom:16px">
    <div class="kds-dlg-btns">
      <button class="kds-btn kds-btn-nao" onclick="${z.status === 'finalizacao' ? `_kdsAbrirModal({tipo:'fin-ok',pizzaId:'${z.id}'})` : '_kdsFecharModal()'}">Voltar</button>
      <button class="kds-btn kds-btn-verm" id="kdsSim" onclick="_kdsRefazer('${z.id}')">Refazer</button>
    </div>
  </div>` : '';

// Pizzas aguardando em outros pedidos ativos com o mesmo tamanho e sabores
function _kdsCompativeis(z) {
  const ass = p => (p.meias || []).map(m => String(m.opcao_id ?? m.nome).toLowerCase()).sort().join('|');
  const alvo = ass(z);
  return [..._kds.pizzas.values()].filter(x => {
    if (x.id === z.id || x.status !== 'aguardando' || x.tamanho !== z.tamanho || ass(x) !== alvo) return false;
    const ped = _kds.pedidos.get(x.pedido_id);
    const cw = _kdsCwDe(ped);
    return cw && !_kdsCancelado(cw) && KDS_CW_ATIVOS.includes(cw.status);
  }).sort((a, b) => _kds.pedidos.get(a.pedido_id).prioridade - _kds.pedidos.get(b.pedido_id).prioridade);
}

KDS_MODAIS['fin-destino'] = (m, z, cw) => {
  if (!z || !cw) return '';
  const comp = _kdsCompativeis(z);
  const tipos = typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO : [];
  return `<div class="kds-dlg">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <h3 class="kds-dlg-tit">Pizza ${_kdsPad(z.seq)} do pedido cancelado #${_kdsEsc(cw.display_id)}</h3>
    <p class="kds-dlg-nota" style="text-align:left">${_kdsEsc(_kdsSabores(z).map(s => s.nome).join(' + '))} · ${z.tamanho === 'grande' ? 'Grande' : 'Pequena'}</p>
    <label class="kds-dlg-lbl">Reaproveitar em outro pedido</label>
    ${comp.length ? `<div class="kds-reap">${comp.map(x => {
      const c2 = _kdsCwDe(_kds.pedidos.get(x.pedido_id));
      return `<button class="kds-reap-ln" onclick="_kdsReaproveitar('${z.id}','${x.id}')"><b>#${_kdsEsc(c2.display_id)}</b><span>${_kdsEsc(c2.customer_name || '')} · item ${_kdsPad(x.seq)}</span><em>Usar aqui</em></button>`;
    }).join('')}</div>`
      : '<div class="kds-ficha-vazia" style="padding:10px 0">Nenhum pedido aguardando uma pizza igual agora.</div>'}
    <label class="kds-dlg-lbl">Ou registrar desperdício</label>
    <div class="kds-form-2">
      <select class="kds-input" id="kdsDescTipo"><option value="" selected disabled>Tipo de saída</option>${tipos.map(t => `<option value="${t.id}">${_kdsEsc(t.label)}</option>`).join('')}</select>
      <input class="kds-input" id="kdsDescObs" placeholder="Observação (opcional)">
    </div>
    <button class="kds-btn kds-btn-verm kds-btn-bloco" id="kdsSim" style="margin-top:12px" onclick="_kdsDescartar('${z.id}')">Registrar desperdício</button>
  </div>`;
};

async function _kdsFinalizarPizza(id) {
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const s = _kds.sessao;
  const { data, error } = await _kdsDb().rpc('kds_finalizar', { p_pizza: id, p_operador: s.operador_id, p_jornada: s.jornada_id });
  _kdsFecharModal();
  if (error || !data?.ok) { _kdsAviso('Esta pizza não está mais na finalização', 'err'); _kdsCarregar(); return; }
  const z = _kds.pizzas.get(id);
  if (z) Object.assign(z, { status: 'pronto', finalizado_em: new Date().toISOString(), finalizado_por: s.operador_id });
  _kdsRender();
  await _kdsPosPronto(data, z);
  _kdsCarregar();
}

// Depois que uma pizza fica pronta (finalizada ou reaproveitada)
async function _kdsPosPronto(r, z) {
  if (r.origem === 'interno' && z) {
    const ped = _kds.pedidos.get(z.pedido_id);
    await _kdsBaixaEstoque(z, ped?.motivo || 'outro', `Pedido interno #${ped?.numero || ''}${ped?.descricao ? ' · ' + ped.descricao : ''}`);
    if (r.pedido_pronto) _kdsAviso(`Pedido interno #${ped?.numero || ''} pronto`);
  } else if (r.pedido_pronto && r.cw_pedido_id) {
    await _kdsCwPronto(r.cw_pedido_id);
  }
}

async function _kdsRefazer(id) {
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const motivo = document.getElementById('kdsRefMotivo')?.value.trim() || null;
  const z = _kds.pizzas.get(id) ? { ..._kds.pizzas.get(id) } : null;
  const { data, error } = await _kdsDb().rpc('kds_refazer', { p_pizza: id, p_operador: _kds.sessao.operador_id, p_motivo: motivo });
  _kdsFecharModal();
  if (error || !data) { _kdsAviso('Não foi possível refazer esta pizza', 'err'); _kdsCarregar(); return; }
  _kdsAviso('Pizza enviada de volta para o pizzaiolo');
  // interno que já estava pronto já saiu do estoque quando ficou pronto
  const ped = z && _kds.pedidos.get(z.pedido_id);
  if (z && !(ped?.origem === 'interno' && z.status === 'pronto')) {
    await _kdsBaixaEstoque(z, 'montagem', `KDS · refazer pedido #${ped?.numero || ''}${motivo ? ' · ' + motivo : ''}`);
  }
  _kdsCarregar();
}

async function _kdsDescartar(id) {
  const tipo = document.getElementById('kdsDescTipo')?.value;
  if (!tipo) return _kdsAviso('Escolha o tipo de saída', 'err');
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const obs = document.getElementById('kdsDescObs')?.value.trim() || '';
  const z = _kds.pizzas.get(id) ? { ..._kds.pizzas.get(id) } : null;
  const { data, error } = await _kdsDb().rpc('kds_descartar', { p_pizza: id, p_operador: _kds.sessao.operador_id, p_motivo: [_kdsMotivoLabel(tipo), obs].filter(Boolean).join(' · ') });
  _kdsFecharModal();
  if (error || !data) { _kdsAviso('Não foi possível registrar o desperdício', 'err'); _kdsCarregar(); return; }
  _kdsAviso('Desperdício registrado');
  const ped = z && _kds.pedidos.get(z.pedido_id);
  if (z && !(ped?.origem === 'interno' && z.status === 'pronto')) {
    await _kdsBaixaEstoque(z, tipo, `KDS · pedido cancelado #${ped?.numero || ''}${obs ? ' · ' + obs : ''}`);
  }
  _kdsCarregar();
}

async function _kdsReaproveitar(origem, destino) {
  const { data, error } = await _kdsDb().rpc('kds_reaproveitar', { p_origem: origem, p_destino: destino, p_operador: _kds.sessao.operador_id });
  _kdsFecharModal();
  if (error || !data?.ok) {
    _kdsAviso(data?.motivo === 'destino' ? 'Essa pizza já foi iniciada — escolha outro pedido' : 'Não foi possível reaproveitar esta pizza', 'err');
    _kdsCarregar(); return;
  }
  const z = _kds.pizzas.get(destino);
  const cw = z && _kdsCwDe(_kds.pedidos.get(z.pedido_id));
  _kdsAviso(`Pizza reaproveitada no pedido #${cw?.display_id || ''}`);
  if (z && _kds.pizzas.get(origem)?.status === 'pronto') await _kdsPosPronto(data, z);
  _kdsCarregar();
}

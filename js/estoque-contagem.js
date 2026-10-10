/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-contagem.js — Contagem por ciclos (aba Contagem)
 *
 * Ciclo: vai de uma contagem completa até a próxima. A contagem de
 * fechamento de um ciclo é a de abertura do seguinte. O dia previsto vem do
 * tipo de contagem (ex.: segunda), mas dá pra fechar em qualquer dia.
 *
 * Cada "Nova contagem" cria um card por local (kanban):
 *   Pendente → Em andamento (alguém contando) → Em revisão (terminou; mostra
 *   esperado × contado) → Concluída (gerente ou supervisor aprova).
 *
 * Aprovar = a quantidade contada vira a base do saldo daquele item naquele
 * local (estoque-saldo.js). A diferença também é lançada como "Ajuste
 * contagem" nas Movimentações, só para registro (com a data da contagem, o
 * motor não soma de novo).
 *
 * A contagem é "às cegas": quem conta não vê o esperado. Ele aparece na
 * revisão, em dois blocos:
 *   • Divergências — itens com débito automático (saem na venda): diferença
 *     é o que ninguém explicou → ficha técnica ou porcionamento.
 *   • Consumo do ciclo — itens sem débito automático (ex.: Mussarela em
 *     Barra): a diferença é o consumo normal da produção.
 */

let _ctgDados = null;      // { ciclos, contagens, progresso }
let _ctgFilTipo = '';

const _CTG_STATUS = [
  { id: 'pendente',  label: 'Pendentes',     icon: 'inbox'       },
  { id: 'andamento', label: 'Em andamento',  icon: 'play-circle' },
  { id: 'revisao',   label: 'Em revisão',    icon: 'eye'         },
  { id: 'concluida', label: 'Concluídas',    icon: 'check-circle'},
];

const _ctgPodeAprovar = () => {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return ['gerente', 'supervisor'].includes(u?.role);
};
const _ctgTipo = id => TIPOS_CONTAGEM.find(t => t.id === id) || { id, label: id, fechaCiclo: false };

// ── Dados ──────────────────────────────────────────────────────

async function _ctgCarregar() {
  const sb = _estSb();
  const [ciclos, contagens] = await Promise.all([
    _estSelectTodos(() => sb.from('est_ciclos').select('*').order('inicio', { ascending: false })),
    _estSelectTodos(() => sb.from('est_contagens').select('*').is('excluido_em', null).order('data_ref', { ascending: false })),
  ]);
  // Progresso (contados / total) das contagens que não estão concluídas há tempo
  const ativas = contagens.filter(c => c.status !== 'cancelada').map(c => c.id);
  const progresso = {};
  for (let i = 0; i < ativas.length; i += 200) {
    const itens = await _estSelectTodos(() => sb.from('est_contagem_itens').select('contagem_id, contado').in('contagem_id', ativas.slice(i, i + 200)));
    itens.forEach(x => {
      const p = progresso[x.contagem_id] || (progresso[x.contagem_id] = { total: 0, contados: 0 });
      p.total++; if (x.contado !== null) p.contados++;
    });
  }
  _ctgDados = { ciclos, contagens, progresso };
  return _ctgDados;
}

const _ctgCicloAberto = () => _ctgDados?.ciclos.find(c => c.status === 'aberto') || null;

// Itens que entram num card: os guardados naquele local, dentro do escopo do tipo
function _ctgItensDoLocal(tipo, localId) {
  return items.filter(i => {
    if (i.active === false) return false;
    if (!estLocaisDoItem(i).includes(localId)) return false;
    if (tipo.fechaCiclo || tipo.escopo === 'todos') return true;
    if (tipo.escopo === 'categorias') return (tipo.cats || []).includes(i.cat);
    if (tipo.escopo === 'itens') return (tipo.itemIds || []).includes(i.id);
    return true;
  });
}

// Locais que recebem card: os de estoque (+ "Sem local", se houver item sem local)
function _ctgLocaisDoTipo(tipo) {
  const ids = estLocaisEstoque().map(l => l.id);
  ids.push(EST_SEM_LOCAL);
  return ids.filter(l => _ctgItensDoLocal(tipo, l).length > 0);
}

// ── Render da aba ─────────────────────────────────────────────

async function estRenderAbaContagem(forcar = false) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  if (!_ctgDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">
      ${lc('refresh-cw', 16, 'currentColor')} Carregando contagens…</div>`;
    try { await _ctgCarregar(); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:var(--text-md)">Não consegui carregar as contagens: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="estRenderAbaContagem(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('estAbaBody')) return;
  _ctgRenderConteudo();
}

function _ctgRenderConteudo() {
  const el = document.getElementById('estAbaBody');
  if (!el || !_ctgDados) return;
  const ciclo = _ctgCicloAberto();
  const todas = _ctgDados.contagens.filter(c => c.status !== 'cancelada' && (!_ctgFilTipo || c.tipo_id === _ctgFilTipo));
  // Concluídas: só as do ciclo atual (ou dos últimos 7 dias se não houver ciclo) — o resto vai pro histórico
  const desdeConcl = ciclo ? _estMs(ciclo.inicio) : Date.now() - 7 * 864e5;
  const col = st => todas.filter(c => c.status === st && (st !== 'concluida' || _estMs(c.data_ref) >= desdeConcl - 1000));

  const card = c => {
    const t = _ctgTipo(c.tipo_id);
    const p = _ctgDados.progresso[c.id] || { total: 0, contados: 0 };
    const pct = p.total ? Math.round(p.contados / p.total * 100) : 0;
    return `<div onclick="estAbrirContagem('${c.id}')" style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r10);padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:6px"
        onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--card-border)'">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="font-size:var(--text-md);font-weight:700;line-height:1.3">${_estEsc(estLocalLabel(c.local_id))}</div>
        ${t.fechaCiclo || c.fecha_ciclo ? `<span class="badge b-purple" style="font-size:var(--text-2xs);white-space:nowrap">Ciclo</span>` : `<span class="badge b-gray" style="font-size:var(--text-2xs);white-space:nowrap">${_estEsc(t.label)}</span>`}
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(c.nome)} · ${_estDH(c.data_ref)}</div>
      <div style="height:5px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct === 100 ? 'var(--success-fg)' : 'var(--purple)'}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--text2)">
        <span>${p.contados}/${p.total} itens</span>
        <span>${_estEsc(c.status === 'concluida' ? (c.aprovado_por || '') : (c.iniciado_por || c.criado_por || ''))}</span>
      </div>
    </div>`;
  };

  // Painel do ciclo atual
  const locaisCiclo = _ctgLocaisDoTipo(TIPOS_CONTAGEM.find(t => t.fechaCiclo) || { fechaCiclo: true });
  let painelCiclo;
  if (!ciclo) {
    painelCiclo = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <div style="font-size:var(--text-lg);font-weight:800">Nenhum ciclo aberto</div>
        <div style="font-size:var(--text-sm);color:var(--text2);margin-top:4px;line-height:1.5">Faça uma contagem completa (tipo que fecha o ciclo). Quando ela for aprovada, vira a contagem de abertura e o débito automático das vendas passa a valer a partir dela.</div>
      </div>
      <button class="btn btn-primary" onclick="estNovaContagem()">${lc('plus', 14, '#fff')} Contagem de abertura</button>
    </div>`;
  } else {
    const doCiclo = _ctgDados.contagens.filter(c => c.ciclo_id === ciclo.id && c.status !== 'cancelada');
    const abertura = doCiclo.filter(c => !c.fecha_ciclo);
    const fecho    = doCiclo.filter(c => c.fecha_ciclo);
    // Abertura = cards do ciclo que não são de fechamento e que fecham ciclo pelo tipo
    // (só existe no primeiro ciclo; nos seguintes a abertura é o fechamento anterior)
    const cardsAbertura = abertura.filter(c => _ctgTipo(c.tipo_id).fechaCiclo);
    const aberturaOk = cardsAbertura.every(c => c.status === 'concluida');
    const referencia = aberturaOk ? fecho : cardsAbertura;
    const statusLocal = l => {
      const c = referencia.find(x => x.local_id === l);
      return c ? c.status : null;
    };
    const prontos = locaisCiclo.filter(l => statusLocal(l) === 'concluida').length;
    const podeFechar = aberturaOk && locaisCiclo.length > 0 && prontos === locaisCiclo.length;
    const dias = Math.floor((Date.now() - _estMs(ciclo.inicio)) / 864e5);
    const tipoCiclo = TIPOS_CONTAGEM.find(t => t.fechaCiclo);
    painelCiclo = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <div style="font-size:var(--text-lg);font-weight:800">Ciclo atual</div>
          <div style="font-size:var(--text-sm);color:var(--text2);margin-top:2px">Iniciado em ${new Date(ciclo.inicio).toLocaleDateString('pt-BR')} · há ${dias} dia(s)${tipoCiclo?.freq === 'semanal' ? ` · fechamento previsto: ${['domingo','segunda','terça','quarta','quinta','sexta','sábado'][tipoCiclo.dia ?? 1]}` : ''}</div>
        </div>
        ${aberturaOk ? '' : `<span class="badge b-orange">Contagem de abertura em andamento</span>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${locaisCiclo.map(l => {
          const st = statusLocal(l);
          const cor = st === 'concluida' ? 'var(--success-fg)' : st ? 'var(--purple)' : 'var(--muted)';
          const txt = st === 'concluida' ? 'contado' : st === 'revisao' ? 'em revisão' : st === 'andamento' ? 'contando' : st === 'pendente' ? 'pendente' : 'falta contar';
          return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;border:1.5px solid var(--border);font-size:var(--text-sm)">
            <span style="width:8px;height:8px;border-radius:50%;background:${cor}"></span>${_estEsc(estLocalLabel(l))}
            <span style="color:${cor};font-size:var(--text-xs)">${txt}</span></span>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-size:var(--text-sm);color:${podeFechar ? 'var(--success-fg)' : 'var(--orange-dark)'}">
          ${!aberturaOk ? `Abertura: ${prontos} de ${locaisCiclo.length} locais aprovados. Depois de aprovada, o débito automático das vendas começa a valer.`
            : podeFechar ? 'Todos os locais contados e aprovados — pode fechar o ciclo.'
            : `Fechamento: faltam ${locaisCiclo.length - prontos} de ${locaisCiclo.length} locais para fechar o ciclo.`}
        </div>
        <button class="btn ${podeFechar ? 'btn-primary' : 'btn-outline'}" ${podeFechar && _ctgPodeAprovar() ? '' : 'disabled'} onclick="estFecharCiclo('${ciclo.id}')"
          title="${_ctgPodeAprovar() ? '' : 'Só gerente ou supervisor fecha o ciclo'}">${lc('lock', 14, 'currentColor')} Fechar ciclo</button>
      </div>`;
  }

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <button class="btn btn-primary" onclick="estNovaContagem()">${lc('plus', 14, '#fff')} Nova contagem</button>
      <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_ctgFilTipo=this.value;_ctgRenderConteudo()">
        <option value="">Todos os tipos</option>
        ${TIPOS_CONTAGEM.map(t => `<option value="${t.id}"${_ctgFilTipo === t.id ? ' selected' : ''}>${_estEsc(t.label)}</option>`).join('')}
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="estHistoricoContagens()">${lc('clock', 13, 'currentColor')} Histórico</button>
        <button class="btn btn-ghost btn-sm" onclick="estRenderAbaContagem(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,minmax(200px,1fr));gap:12px;margin-bottom:18px;overflow-x:auto">
      ${_CTG_STATUS.map(s => {
        const cs = col(s.id);
        return `<div style="background:var(--surface2);border-radius:var(--r12);padding:12px;min-height:150px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:700;color:var(--text2)">
            ${lc(s.icon, 14, 'currentColor')} ${s.label} <span class="badge b-gray" style="margin-left:auto">${cs.length}</span></div>
          ${cs.length ? cs.map(card).join('') : `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--muted);text-align:center;padding:16px">Nada aqui</div>`}
        </div>`;
      }).join('')}
    </div>

    <div class="card" style="padding:18px 20px;margin-bottom:0">${painelCiclo}</div>`;
}

// ── Nova contagem ─────────────────────────────────────────────

function estNovaContagem() {
  const tipos = TIPOS_CONTAGEM;
  const ciclo = _ctgCicloAberto();
  const padrao = ciclo ? (tipos.find(t => !t.fechaCiclo) || tipos[0]) : tipos.find(t => t.fechaCiclo);
  _estModal('ovCtgNova', 'Nova contagem', `
    ${_estCampo('Tipo de contagem *', `<select class="inp" id="cnTipo" onchange="_ctgNovaPrevia()">${tipos.map(t => `<option value="${t.id}"${t.id === padrao?.id ? ' selected' : ''}>${_estEsc(t.label)}${t.fechaCiclo ? ' — fecha o ciclo' : ''}</option>`).join('')}</select>`)}
    <div class="f2">
      ${_estCampo('Nome *', `<input class="inp" id="cnNome" placeholder="ex: Contagem semanal">`)}
      ${_estCampo('Data e hora da contagem *', `<input class="inp" type="datetime-local" id="cnData" value="${_estAgora()}">`)}
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin:-6px 0 10px">O momento em que o estoque foi contado — mesmo que o lançamento seja depois. É a partir dele que as vendas voltam a descontar.</div>
    ${_estCampo('Observações', `<input class="inp" id="cnObs" placeholder="opcional">`)}
    <div id="cnPrevia"></div>`, '_ctgCriar()', 'Criar contagem');
  _ctgNovaPrevia();
}

function _ctgNovaPrevia() {
  const tipo = _ctgTipo(document.getElementById('cnTipo')?.value);
  const nome = document.getElementById('cnNome');
  if (nome && !nome.dataset.editado) nome.value = tipo.label;
  if (nome) nome.oninput = () => { nome.dataset.editado = '1'; };
  const ciclo = _ctgCicloAberto();
  const locais = _ctgLocaisDoTipo(tipo);
  const el = document.getElementById('cnPrevia');
  if (!el) return;
  const aviso = tipo.fechaCiclo
    ? (ciclo ? `Esta contagem <strong>fecha o ciclo atual</strong> (aberto em ${new Date(ciclo.inicio).toLocaleDateString('pt-BR')}) e abre o próximo.`
             : `Esta será a <strong>contagem de abertura</strong> do primeiro ciclo.`)
    : `Só acerta o saldo dos itens contados. Não fecha ciclo.`;
  el.innerHTML = `
    <div style="padding:10px 14px;border-radius:var(--r8);background:var(--purple-xlight);font-size:var(--text-sm);line-height:1.5;margin-bottom:10px">${aviso}</div>
    <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:6px">${locais.length} card(s) serão criados — um por local:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${locais.map(l => `<span class="badge b-gray">${_estEsc(estLocalLabel(l))} · ${_ctgItensDoLocal(tipo, l).length} itens</span>`).join('') || '<span style="color:var(--danger-fg);font-size:var(--text-sm)">Nenhum item nesse tipo de contagem. Confira os locais dos itens e o escopo do tipo.</span>'}</div>
    ${locais.includes(EST_SEM_LOCAL) ? `<div style="margin-top:10px;padding:10px 14px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm);line-height:1.5">
      ${_ctgItensDoLocal(tipo, EST_SEM_LOCAL).length} item(ns) ainda sem local vão para um card "Sem local". Vale definir os locais antes (cadastro do item ou Configurações › Estoque › Distribuir por categoria) — assim cada pessoa conta um ambiente.</div>` : ''}`;
}

async function _ctgCriar() {
  const tipo = _ctgTipo(document.getElementById('cnTipo').value);
  const nome = document.getElementById('cnNome').value.trim();
  const dataRef = _estLerData('cnData');
  const obs = document.getElementById('cnObs').value.trim() || null;
  if (!nome) return toast('Informe o nome', 'err');
  const locais = _ctgLocaisDoTipo(tipo);
  if (!locais.length) return toast('Nenhum item para contar nesse tipo', 'err');
  const ciclo = _ctgCicloAberto();
  if (tipo.fechaCiclo && ciclo && _estMs(dataRef) <= _estMs(ciclo.inicio)) return toast('A data precisa ser depois do início do ciclo atual', 'err');
  // Contagem parcial antes da abertura aprovada apagaria o saldo antigo dos
  // outros locais do item (ele passaria a "ter contagem" só em um local)
  const temAbertura = _ctgDados.contagens.some(x => x.status === 'concluida' && _ctgTipo(x.tipo_id).fechaCiclo);
  if (!tipo.fechaCiclo && !temAbertura) return toast('Faça e aprove primeiro a contagem de abertura (tipo que fecha o ciclo)', 'err');
  if (tipo.fechaCiclo && ciclo && _ctgDados.contagens.some(x => x.ciclo_id === ciclo.id && _ctgTipo(x.tipo_id).fechaCiclo && ['pendente', 'andamento', 'revisao'].includes(x.status)))
    return toast('Já existe uma contagem de ciclo em andamento — conclua ou cancele antes', 'err');

  _estSalvarComBotao('ovCtgNova', async () => {
    const sb = _estSb();
    const user = estUsuario();
    let cicloId = ciclo?.id || null;
    let fechaCiclo = false;
    if (tipo.fechaCiclo) {
      if (!ciclo) {
        // Primeira contagem completa: abre o primeiro ciclo nela
        const { data, error } = await sb.from('est_ciclos').insert({ inicio: dataRef, criado_por: user }).select().single();
        if (error) throw new Error(error.message);
        cicloId = data.id;
      } else {
        fechaCiclo = true;
      }
    }
    const lote = crypto.randomUUID();
    const { data: cards, error } = await sb.from('est_contagens').insert(locais.map(l => ({
      ciclo_id: cicloId, lote, tipo_id: tipo.id, nome, local_id: l, data_ref: dataRef,
      fecha_ciclo: fechaCiclo, obs, criado_por: user,
    }))).select();
    if (error) throw new Error(error.message);
    const linhas = [];
    for (const c of cards) {
      for (const it of _ctgItensDoLocal(tipo, c.local_id)) {
        linhas.push({ contagem_id: c.id, item_id: it.id, item_nome: it.name, item_tipo: estTipoItem(it),
          unidade: it.unit || null, categoria: it.cat || null, custo_unit: it.cost || 0 });
      }
    }
    for (let i = 0; i < linhas.length; i += 500) {
      const { error: e2 } = await sb.from('est_contagem_itens').insert(linhas.slice(i, i + 500));
      if (e2) throw new Error(e2.message);
    }
    toast(`${cards.length} card(s) de contagem criados`, 'ok');
    _ctgDados = null;
  }).then(() => estRenderAbaContagem(true));
}

// ── Fechar ciclo ──────────────────────────────────────────────

function estFecharCiclo(cicloId) {
  if (!_ctgPodeAprovar()) return toast('Só gerente ou supervisor fecha o ciclo', 'err');
  const ciclo = _ctgDados.ciclos.find(c => c.id === cicloId);
  const fecho = _ctgDados.contagens.filter(c => c.ciclo_id === cicloId && c.fecha_ciclo && c.status === 'concluida');
  const fim = fecho.map(c => c.data_ref).sort((a, b) => _estMs(b) - _estMs(a))[0];
  vtpConfirm({
    title: 'Fechar o ciclo?',
    message: `Ciclo de ${new Date(ciclo.inicio).toLocaleDateString('pt-BR')} até ${new Date(fim).toLocaleDateString('pt-BR')}. A contagem de fechamento vira a abertura do próximo ciclo, que começa automaticamente.`,
    confirmLabel: 'Fechar ciclo', danger: false,
    onConfirm: async () => {
      try {
        const sb = _estSb(), user = estUsuario();
        let r = await sb.from('est_ciclos').update({ status: 'fechado', fim, fechado_por: user, atualizado_por: user }).eq('id', cicloId);
        if (r.error) throw new Error(r.error.message);
        r = await sb.from('est_ciclos').insert({ inicio: fim, criado_por: user }).select().single();
        if (r.error) throw new Error(r.error.message);
        toast('Ciclo fechado. O próximo já está aberto.', 'ok');
        estRenderAbaContagem(true);
      } catch (e) { toast('Não consegui fechar o ciclo: ' + e.message, 'err'); }
    },
  });
}

// ══════════════════════════════════════════════════════════════
// TELA DA CONTAGEM (contar → revisão → aprovação)
// ══════════════════════════════════════════════════════════════

let _ctgAtual = null; // { c, itens, salvando:Set }

async function estAbrirContagem(id) {
  const c = _ctgDados?.contagens.find(x => x.id === id);
  if (!c) return;
  const { data: itens, error } = await _estSb().from('est_contagem_itens').select('*').eq('contagem_id', id);
  if (error) return toast('Não consegui abrir a contagem: ' + error.message, 'err');
  _ctgAtual = { c, itens: itens.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.item_nome.localeCompare(b.item_nome)), q: '' };
  document.getElementById('ovCtg')?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'ovCtg';
  ov.innerHTML = `<div class="modal" style="width:980px;max-width:calc(100vw - 24px);height:calc(100vh - 32px);display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
    <div id="ovCtgHead" style="padding:18px 22px;border-bottom:1px solid var(--border)"></div>
    <div id="ovCtgBody" style="flex:1;overflow-y:auto;padding:16px 22px"></div>
    <div id="ovCtgFoot" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--border)"></div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) _ctgFechar(); };
  document.body.appendChild(ov);
  _ctgRenderTela();
}

function _ctgFechar() {
  document.getElementById('ovCtg')?.remove();
  _ctgAtual = null;
  estRenderAbaContagem(true);
}

function _ctgRenderTela() {
  if (!_ctgAtual) return;
  const { c, itens } = _ctgAtual;
  const t = _ctgTipo(c.tipo_id);
  const contados = itens.filter(i => i.contado !== null).length;
  const stLabel = { pendente: 'Pendente', andamento: 'Em andamento', revisao: 'Em revisão', concluida: 'Concluída' }[c.status];
  document.getElementById('ovCtgHead').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <div style="font-size:var(--text-xl);font-weight:800">${_estEsc(estLocalLabel(c.local_id))}</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:2px">${_estEsc(c.nome)}${c.nome !== t.label ? ' · ' + _estEsc(t.label) : ''} · contado em ${_estDH(c.data_ref)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge ${c.status === 'concluida' ? 'b-green' : c.status === 'revisao' ? 'b-purple' : 'b-gray'}">${stLabel}</span>
        <span style="font-size:var(--text-sm);color:var(--text2)">${contados}/${itens.length} contados</span>
        <button class="btn btn-ghost btn-sm" onclick="_ctgFechar()">${lc('x', 16, 'currentColor')}</button>
      </div>
    </div>`;
  if (c.status === 'pendente' || c.status === 'andamento') _ctgRenderContar();
  else _ctgRenderRevisao();
}

// ── Contar (às cegas) ──
function _ctgRenderContar() {
  const { c, itens } = _ctgAtual;
  const q = (_ctgAtual.q || '').toLowerCase();
  const lista = itens.filter(i => !q || i.item_nome.toLowerCase().includes(q) || (i.categoria || '').toLowerCase().includes(q));
  const porCat = {};
  lista.forEach(i => { (porCat[i.categoria || 'Outros'] ||= []).push(i); });
  document.getElementById('ovCtgBody').innerHTML = `
    <input class="inp" placeholder="Buscar item…" value="${_estEsc(_ctgAtual.q || '')}" style="max-width:340px;margin-bottom:14px;font-size:var(--text-md)"
      oninput="_ctgAtual.q=this.value;clearTimeout(window._ctgQT);window._ctgQT=setTimeout(()=>{_ctgRenderContar();const b=document.querySelector('#ovCtgBody input');if(b){b.focus();b.setSelectionRange(b.value.length,b.value.length)}},200)">
    ${Object.keys(porCat).sort().map(cat => `
      <div style="font-size:var(--text-xs);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px">${_estEsc(cat)}</div>
      ${porCat[cat].map(i => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1.5px solid ${i.contado !== null ? 'var(--success-bg)' : 'var(--border)'};border-radius:var(--r8);margin-bottom:6px;background:${i.contado !== null ? 'color-mix(in srgb, var(--success-bg) 40%, transparent)' : 'var(--card-bg)'}">
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--text-md);font-weight:600">${_estEsc(i.item_nome)}</div>
            ${i.item_tipo === 'preparado' ? `<span class="badge b-orange" style="font-size:var(--text-2xs)">Processado</span>` : ''}
          </div>
          <input class="inp" type="number" inputmode="decimal" min="0" step="0.001" value="${i.contado ?? ''}" placeholder="—"
            style="width:120px;text-align:right;font-size:var(--text-lg);font-weight:700"
            onchange="_ctgSalvarItem('${i.id}', this.value)" onkeydown="if(event.key==='Enter'){const ins=[...document.querySelectorAll('#ovCtgBody input[type=number]')];ins[ins.indexOf(this)+1]?.focus()}">
          <span style="width:44px;font-size:var(--text-sm);color:var(--muted)">${_estEsc(i.unidade || '')}</span>
        </div>`).join('')}`).join('')}
    ${!lista.length ? `<div style="padding:30px;text-align:center;color:var(--muted)">Nenhum item</div>` : ''}`;
  const faltam = itens.filter(i => i.contado === null).length;
  document.getElementById('ovCtgFoot').innerHTML = `
    <div style="margin-right:auto;font-size:var(--text-sm);color:var(--muted);align-self:center">Cada número é salvo na hora. Quem conta não vê o esperado — ele aparece na revisão.</div>
    <button class="btn btn-outline" onclick="estCancelarContagem()" style="color:var(--danger-fg)">Cancelar contagem</button>
    <button class="btn btn-primary" onclick="_ctgEnviarRevisao()">${lc('send', 14, '#fff')} Enviar para revisão${faltam ? ` (${faltam} sem contar)` : ''}</button>`;
}

async function _ctgSalvarItem(itemRowId, valor) {
  const v = valor === '' ? null : parseFloat(String(valor).replace(',', '.'));
  if (v !== null && (isNaN(v) || v < 0)) return toast('Quantidade inválida', 'err');
  const row = _ctgAtual.itens.find(i => i.id === itemRowId);
  const sb = _estSb();
  const { error } = await sb.from('est_contagem_itens').update({ contado: v, atualizado_por: estUsuario() }).eq('id', itemRowId);
  if (error) return toast('Não salvou: ' + error.message, 'err');
  row.contado = v;
  // Primeira digitação: card vai para "Em andamento"
  if (_ctgAtual.c.status === 'pendente') {
    const { error: e2 } = await sb.from('est_contagens').update({ status: 'andamento', iniciado_por: estUsuario(), atualizado_por: estUsuario() }).eq('id', _ctgAtual.c.id);
    if (!e2) { _ctgAtual.c.status = 'andamento'; _ctgAtual.c.iniciado_por = estUsuario(); _ctgRenderTela(); return; }
  }
  // Atualiza só o contador do cabeçalho/rodapé sem perder o foco
  const head = document.querySelector('#ovCtgHead span[style*="text-sm"]');
  if (head) head.textContent = `${_ctgAtual.itens.filter(i => i.contado !== null).length}/${_ctgAtual.itens.length} contados`;
}

// Congela o esperado (saldo no momento da contagem) e manda para revisão
async function _ctgEnviarRevisao() {
  const { c, itens } = _ctgAtual;
  const faltam = itens.filter(i => i.contado === null).length;
  const seguir = async () => {
    try {
      toast('Calculando o esperado…', 'info');
      const saldos = await estCalcularSaldos({ ate: c.data_ref });
      const sb = _estSb();
      for (const i of itens) {
        const r = saldos.porItem.get(i.item_id);
        const esperado = r ? (r.porLocal[c.local_id]?.saldo ?? 0) : 0;
        const debAuto = estDebitoAutoMapa().has(i.item_id);
        const { error } = await sb.from('est_contagem_itens').update({ esperado: _estRound(esperado), debito_auto: debAuto, atualizado_por: estUsuario() }).eq('id', i.id);
        if (error) throw new Error(error.message);
        i.esperado = _estRound(esperado); i.debito_auto = debAuto;
      }
      const { error } = await sb.from('est_contagens').update({ status: 'revisao', atualizado_por: estUsuario() }).eq('id', c.id);
      if (error) throw new Error(error.message);
      c.status = 'revisao';
      _ctgRenderTela();
    } catch (e) { toast('Não consegui enviar para revisão: ' + e.message, 'err'); }
  };
  if (faltam) {
    vtpConfirm({ title: `${faltam} item(ns) sem contar`, message: 'Itens sem número não mudam o saldo — ficam como estão. Enviar mesmo assim?', confirmLabel: 'Enviar', danger: false, onConfirm: seguir });
  } else seguir();
}

// ── Revisão ──
function _ctgRenderRevisao() {
  const { c, itens } = _ctgAtual;
  const tol = (parseFloat(getConfig().toleranciaDiverg ?? 10) || 10) / 100;
  const contados = itens.filter(i => i.contado !== null);
  const linha = i => {
    const esp = Number(i.esperado) || 0, cont = Number(i.contado) || 0, dif = cont - esp;
    const valor = dif * (Number(i.custo_unit) || 0);
    const pct = esp ? Math.abs(dif) / Math.abs(esp) : (Math.abs(dif) > 0.0005 ? 1 : 0);
    return { i, esp, cont, dif, valor, pct };
  };
  const ls = contados.map(linha);
  const div    = ls.filter(x => x.i.debito_auto && Math.abs(x.dif) > 0.0005).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const consumo= ls.filter(x => !x.i.debito_auto && Math.abs(x.dif) > 0.0005).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const iguais = ls.filter(x => Math.abs(x.dif) <= 0.0005);
  const naoContados = itens.filter(i => i.contado === null);
  const soma = arr => arr.reduce((s, x) => s + x.valor, 0);

  const tabela = (arr, modo) => `<div style="overflow-x:auto;border:1.5px solid var(--border);border-radius:var(--r8)">
    <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
      <thead style="background:var(--surface2)"><tr>${['Item', 'Esperado', 'Contado', modo === 'consumo' ? 'Consumo' : 'Diferença', 'Valor'].map((h, k) =>
        `<th style="padding:9px 12px;text-align:${k ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}</tr></thead>
      <tbody>${arr.map(x => {
        const fora = modo === 'div' && x.pct > tol;
        const corDif = modo === 'consumo' ? 'var(--text)' : fora ? 'var(--danger-fg)' : 'var(--warning-fg)';
        const difTxt = modo === 'consumo' ? `${_estQ(-x.dif)}` : `${x.dif > 0 ? '+' : '−'}${_estQ(Math.abs(x.dif))}`;
        return `<tr style="border-top:1px solid var(--border)">
          <td style="padding:9px 12px">${_estEsc(x.i.item_nome)}${x.i.item_tipo === 'preparado' ? ' <span class="badge b-orange" style="font-size:var(--text-2xs)">Processado</span>' : ''}
            ${modo === 'div' ? `<div style="font-size:var(--text-xs);color:${fora ? 'var(--danger-fg)' : 'var(--muted)'}">${Math.round(x.pct * 100)}% ${fora ? '· fora da tolerância' : '· dentro da tolerância'}</div>` : ''}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estQ(x.esp)} ${_estEsc(x.i.unidade || '')}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap;font-weight:700">${_estQ(x.cont)} ${_estEsc(x.i.unidade || '')}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap;color:${corDif};font-weight:700">${difTxt}</td>
          <td style="padding:9px 12px;text-align:right;white-space:nowrap">${_estR(modo === 'consumo' ? -x.valor : x.valor)}</td></tr>`;
      }).join('')}</tbody></table></div>`;

  const bloco = (titulo, desc, arr, modo, cor) => arr.length ? `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">
        <div style="font-size:var(--text-lg);font-weight:800;color:${cor}">${titulo} <span style="font-size:var(--text-sm);color:var(--muted);font-weight:600">(${arr.length})</span></div>
        <div style="font-size:var(--text-md);font-weight:700">${_estR(modo === 'consumo' ? -soma(arr) : soma(arr))}</div>
      </div>
      <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:8px">${desc}</div>
      ${tabela(arr, modo)}
    </div>` : '';

  document.getElementById('ovCtgBody').innerHTML = `
    ${c.status === 'concluida' ? `<div style="padding:10px 14px;border-radius:var(--r8);background:var(--success-bg);color:var(--success-fg);font-size:var(--text-sm);margin-bottom:16px">
      Aprovada por <strong>${_estEsc(c.aprovado_por || '—')}</strong> em ${_estDH(c.aprovado_em)}. Os números contados viraram o saldo deste local.</div>` : ''}
    ${bloco('Divergências', 'Itens com débito automático (saem na venda pela ficha). A diferença é o que ninguém explicou — confira ficha técnica, porcionamento ou baixa não registrada.', div, 'div', 'var(--danger-fg)')}
    ${bloco('Consumo do ciclo', 'Itens sem débito automático (ex.: insumo cru que vira processado). A diferença é o consumo normal da produção, não erro.', consumo, 'consumo', 'var(--text)')}
    ${iguais.length ? `<details style="margin-bottom:16px"><summary style="cursor:pointer;font-size:var(--text-md);font-weight:700;color:var(--success-fg)">Sem diferença (${iguais.length})</summary>
      <div style="margin-top:8px">${tabela(iguais, 'div')}</div></details>` : ''}
    ${naoContados.length ? `<details><summary style="cursor:pointer;font-size:var(--text-md);font-weight:700;color:var(--muted)">Não contados (${naoContados.length}) — saldo continua como está</summary>
      <div style="margin-top:8px;font-size:var(--text-sm);color:var(--text2)">${naoContados.map(i => _estEsc(i.item_nome)).join(' · ')}</div></details>` : ''}
    ${!contados.length ? `<div style="padding:30px;text-align:center;color:var(--muted)">Nenhum item contado.</div>` : ''}`;

  const pode = _ctgPodeAprovar();
  document.getElementById('ovCtgFoot').innerHTML = c.status === 'concluida' ? `
    <button class="btn btn-primary" onclick="_ctgFechar()">Fechar</button>` : `
    <div style="margin-right:auto;font-size:var(--text-sm);color:var(--muted);align-self:center">${pode ? 'Ao aprovar, os números contados viram o saldo deste local.' : 'Aguardando aprovação de gerente ou supervisor.'}</div>
    <button class="btn btn-outline" onclick="_ctgVoltarContagem()">${lc('arrow-left', 14, 'currentColor')} Voltar para contagem</button>
    <button class="btn btn-primary" ${pode ? '' : 'disabled'} onclick="_ctgAprovar()">${lc('check', 14, '#fff')} Aprovar</button>`;
}

async function _ctgVoltarContagem() {
  const { error } = await _estSb().from('est_contagens').update({ status: 'andamento', atualizado_por: estUsuario() }).eq('id', _ctgAtual.c.id);
  if (error) return toast(error.message, 'err');
  _ctgAtual.c.status = 'andamento';
  _ctgRenderTela();
}

async function _ctgAprovar() {
  if (!_ctgPodeAprovar()) return toast('Só gerente ou supervisor aprova', 'err');
  const { c, itens } = _ctgAtual;
  try {
    const user = estUsuario();
    // Ajustes (só registro): data = momento da contagem, então o motor não soma de novo
    const ajustes = itens.filter(i => i.contado !== null && Math.abs(Number(i.contado) - Number(i.esperado || 0)) > 0.0005).map(i => {
      const item = items.find(x => x.id === i.item_id);
      const dif = Number(i.contado) - Number(i.esperado || 0);
      return {
        tipo: 'ajuste_contagem', item_id: i.item_id, item_nome: i.item_nome, item_tipo: i.item_tipo,
        unidade: i.unidade, categoria: i.categoria, qtd: _estRound(Math.abs(dif)), sinal: dif > 0 ? 1 : -1,
        local_origem: dif < 0 ? c.local_id : null, local_destino: dif > 0 ? c.local_id : null,
        custo_unit: i.custo_unit || item?.cost || 0, motivo: `${c.nome} · ${estLocalLabel(c.local_id)}`,
        ref_tipo: 'contagem', ref_id: c.id, data_mov: c.data_ref, criado_por: user,
      };
    });
    if (ajustes.length) await estInserirMovs(ajustes); // ponte: item.qty passa a refletir o contado
    const { error } = await _estSb().from('est_contagens').update({ status: 'concluida', aprovado_por: user, aprovado_em: new Date().toISOString(), atualizado_por: user }).eq('id', c.id);
    if (error) throw new Error(error.message);
    c.status = 'concluida'; c.aprovado_por = user; c.aprovado_em = new Date().toISOString();
    estInvalidarSaldos();
    toast('Contagem aprovada — saldo atualizado', 'ok');
    _ctgRenderTela();
  } catch (e) { toast('Não consegui aprovar: ' + e.message, 'err'); }
}

function estCancelarContagem() {
  const c = _ctgAtual?.c;
  if (!c) return;
  vtpConfirm({
    title: 'Cancelar esta contagem?', message: `${estLocalLabel(c.local_id)} · ${c.nome}. Os números digitados ficam no histórico, mas não mudam o saldo.`,
    confirmLabel: 'Cancelar contagem',
    onConfirm: async () => {
      const { error } = await _estSb().from('est_contagens').update({ status: 'cancelada', atualizado_por: estUsuario() }).eq('id', c.id);
      if (error) return toast(error.message, 'err');
      toast('Contagem cancelada');
      _ctgFechar();
    },
  });
}

// ── Histórico ──
function estHistoricoContagens() {
  const ciclos = _ctgDados?.ciclos || [];
  const cs = (_ctgDados?.contagens || []).filter(c => c.status === 'concluida' || c.status === 'cancelada');
  const porCiclo = ciclos.map(ci => ({ ci, cs: cs.filter(c => c.ciclo_id === ci.id) }));
  const soltas = cs.filter(c => !c.ciclo_id);
  const linha = c => `<div onclick="document.getElementById('ovCtgHist').remove();estAbrirContagem('${c.id}')" style="display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-top:1px solid var(--border);cursor:pointer;font-size:var(--text-sm)">
    <span><strong>${_estEsc(estLocalLabel(c.local_id))}</strong> · ${_estEsc(c.nome)}</span>
    <span style="color:var(--muted);white-space:nowrap">${_estDH(c.data_ref)} · ${c.status === 'cancelada' ? 'cancelada' : 'aprov. ' + _estEsc(c.aprovado_por || '')}</span></div>`;
  _estModal('ovCtgHist', 'Histórico de contagens', `
    ${porCiclo.map(({ ci, cs }) => `<div style="margin-bottom:14px;border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      <div style="padding:10px 12px;background:var(--surface2);font-size:var(--text-sm);font-weight:700;display:flex;justify-content:space-between">
        <span>Ciclo ${new Date(ci.inicio).toLocaleDateString('pt-BR')} → ${ci.fim ? new Date(ci.fim).toLocaleDateString('pt-BR') : 'aberto'}</span>
        <span style="color:var(--muted);font-weight:500">${ci.status === 'fechado' ? 'fechado por ' + _estEsc(ci.fechado_por || '') : 'em andamento'}</span></div>
      ${cs.map(linha).join('') || '<div style="padding:10px 12px;font-size:var(--text-sm);color:var(--muted)">Sem contagens concluídas</div>'}</div>`).join('')}
    ${soltas.length ? `<div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden"><div style="padding:10px 12px;background:var(--surface2);font-size:var(--text-sm);font-weight:700">Fora de ciclo</div>${soltas.map(linha).join('')}</div>` : ''}
    ${!ciclos.length && !soltas.length ? '<div style="color:var(--muted)">Nenhuma contagem concluída ainda.</div>' : ''}`,
    `document.getElementById('ovCtgHist').remove()`, 'Fechar', 640);
}

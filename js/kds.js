/**
 * VTP Compras — Vai Ter Pizza!
 * kds.js — KDS (Kitchen Display) · Fase 1: KDS Pizzaiolo
 *
 * O CW controla o PEDIDO; o KDS controla cada PIZZA (ver migration
 * 20261028120000_kds_base.sql). Fluxo do pizzaiolo:
 *   Aguardando → (▶ + confirma) Em preparo → (Finalizar montagem) Finalização
 * Quem confirmar primeiro fica com a pizza, e cada pizzaiolo monta uma por
 * vez — as duas regras são garantidas no banco (kds_iniciar).
 *
 * As pizzas de cada pedido saem do mesmo motor do CMV (vendas.js →
 * _vInterpretarItem): pizza grande = 2 meias, pequena = 1 meia; bebida e
 * combo não aparecem na cozinha. O primeiro tablet que vê o pedido grava as
 * pizzas (kds_gerar_pizzas, idempotente).
 *
 * Cada tablet guarda no localStorage a tela escolhida e quem está logado
 * (nome + PIN → jornada). Atualiza por realtime (kds_pizzas, kds_pedidos,
 * cw_pedidos), com uma recarga a cada 20 s de rede de segurança.
 */

// Status do CW em que o pedido ainda está na cozinha (aceite automático:
// waiting_confirmation dura segundos, mas já entra na fila).
const KDS_CW_ATIVOS = ['waiting_confirmation', 'pending_payment', 'pending_online_payment', 'confirmed', 'scheduled_confirmed'];
const KDS_JANELA_H  = 14; // pedidos criados nas últimas X horas (um turno com folga)

// Foto de cada sabor (assets/sabores/*.webp) pelo id da Opção cadastrada.
// Sabor sem foto mostra um disco com o nome.
const KDS_FOTOS = {
  1: 'mussarela', 2: 'milho', 3: 'marguerita', 4: 'mista', 5: 'calabresa', 6: 'frango-caipira',
  7: 'lombinho', 8: 'americana', 9: 'catupirella', 10: 'frango-com-requeijao', 11: '4-queijos',
  12: 'lombinho-com-requeijao', 13: 'portuguesa', 14: 'frango-bacon', 15: 'carne-de-sol-na-nata',
  16: 'file-gorgonzola', 17: 'nordestina', 19: 'file-ao-alho', 21: 'costelinha-bbq', 24: 'cartola',
  25: 'ninho-com-nutella', 26: 'romeu-e-julieta', 27: 'brigadeiro-chocolate', 29: 'nutella',
  30: 'banana-nevada', 32: 'cheesecake-morango',
};

// Ícones cheios, como no mockup (os do icons.js são de traço)
const KDS_SVG = {
  home:    '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2.6 1.8 11.4a1 1 0 0 0 1.3 1.5L4 12.1V21a1 1 0 0 0 1 1h5v-6h4v6h5a1 1 0 0 0 1-1v-8.9l.9.8a1 1 0 0 0 1.3-1.5Z"/></svg>',
  gear:    '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
  user:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="7.5" r="4.5"/><path d="M3 21c0-4.4 4-7 9-7s9 2.6 9 7Z"/></svg>',
  capacete:'<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12.5 4C7 4 2.5 8 2.5 13.2V17a1 1 0 0 0 1 1H15c3.6 0 6.5-2.6 6.5-6 0-4.5-4-8-9-8Zm-2 6.5h9.2c.2.5.3 1 .3 1.5a2 2 0 0 1-2 2h-7.5a1.7 1.7 0 0 1 0-3.5Z"/></svg>',
  correndo:'<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="14.5" cy="3.8" r="2.1"/><path d="m10.4 7.2 3.6-.7c.7-.1 1.3.2 1.6.8l1.2 2.4 2.4.8a1 1 0 0 1-.6 1.9l-2.8-.9a1 1 0 0 1-.6-.5l-.6-1.2-1.3 3.4 2.4 2.1c.2.2.3.4.3.7l.4 4.6a1 1 0 0 1-2 .2l-.4-4.2-2.6-2.2-1.5 3.5a1 1 0 0 1-.7.6l-4.1 1a1 1 0 0 1-.5-1.9l3.6-.9 2.6-6.2-1.6.3-1.5 2.4a1 1 0 0 1-1.7-1l1.8-2.8c.2-.3.5-.5.7-.5Z"/></svg>',
  mesa:    '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 6h18v3H3zM5 9h2v11H5zm12 0h2v11h-2z"/></svg>',
  play:    '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6.5V12l4 4"/></svg>',
  check:   '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  pizza:   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F5A800" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21 3.2 6.6a14 14 0 0 1 17.6 0Z"/><path d="M4.7 9a11 11 0 0 1 14.6 0"/><circle cx="10" cy="11.5" r="1.2" fill="#F5A800"/><circle cx="13.5" cy="14.5" r="1.1" fill="#F5A800"/></svg>',
  cronometro:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F5A800" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M10 2.5h4M18.5 6l1.5-1.5"/></svg>',
  chapeu:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F5A800" stroke-width="1.8" stroke-linejoin="round"><path d="M7 14.5v5h10v-5M7 14.5A4.5 4.5 0 1 1 8.5 6a4.5 4.5 0 0 1 7 0 4.5 4.5 0 1 1 1.5 8.5Z"/></svg>',
  x:       '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  estrela: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.5 1.3 6.6L12 17l-5.9 3.4 1.3-6.6-4.9-4.5 6.6-.8Z"/></svg>',
};

let _kdsSb = null;
function _kdsDb() { return _kdsSb || (_kdsSb = window._vtpSb || supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY)); }

const _kds = {
  tela: null,          // 'pizzaiolo' (Finalização e Pedido nas próximas fases)
  sessao: null,        // { operador_id, nome, jornada_id }
  operadores: [],
  cw: new Map(),       // cw_pedidos.id → pedido
  pedidos: new Map(),  // kds_pedidos.id → pedido do KDS
  pizzas: new Map(),   // kds_pizzas.id → pizza
  novos: new Set(),    // cw_pedidos.id de cliente no 1º pedido
  perf: null,          // { feitas, mediaSeg, totalSeg }
  modal: null,         // { tipo, pizzaId, meia, ... }
  carregou: false, carregando: false, recarregar: false,
  canal: null, tick: null, poll: null, debounce: null,
  pin: '', busca: '',
};

// ── Utilidades ─────────────────────────────────────────────────

function _kdsLs(chave, valor) {
  try {
    if (valor === undefined) return JSON.parse(localStorage.getItem(chave) || 'null');
    if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, JSON.stringify(valor));
  } catch (_) { return null; }
}
function _kdsEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _kdsCfg() { return { metaPreparo: 20, metaEntrega: 40, ...((typeof getConfig === 'function' && getConfig().kds) || {}) }; }
function _kdsGestor() { return ['gerente', 'supervisor'].includes(getCurrentUser()?.role); }
function _kdsDispositivo() {
  let id = _kdsLs('vtp_kds_dispositivo');
  if (!id) { id = 'tab-' + Math.random().toString(36).slice(2, 8); _kdsLs('vtp_kds_dispositivo', id); }
  return id;
}
function _kdsPad(n) { return String(n).padStart(2, '0'); }
function _kdsMmSs(seg) {
  seg = Math.max(0, Math.floor(seg));
  const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
  return h ? `${h}:${_kdsPad(m)}:${_kdsPad(s)}` : `${_kdsPad(m)}:${_kdsPad(s)}`;
}
function _kdsSeg(de, ate) { return de ? ((ate ? new Date(ate) : new Date()) - new Date(de)) / 1000 : 0; }
// Início do turno de hoje: a loja vira a meia-noite, então "hoje" começa às 6h.
function _kdsInicioTurno() {
  const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(6, 0, 0, 0); return d;
}
function _kdsNomeSabor(nome) {
  return String(nome || '').replace(/^\s*1\/2\s*/i, '').split('|')[0].trim()
    .replace(/^./, c => c.toUpperCase());
}
function _kdsFrase(s) { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }
function _kdsAviso(msg, tipo = 'ok') { typeof toast === 'function' ? toast(msg, tipo) : alert(msg); }

// ── Pedido CW → pizzas ─────────────────────────────────────────

function _kdsMontarPizza(pz, obs) {
  const meias = [];
  for (const [key, n] of Object.entries(pz.meias || {})) {
    const opc = typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(key) : null;
    for (let i = 0; i < n; i++) meias.push({ opcao_id: opc?.id ?? null, nome: _kdsNomeSabor(opc?.nome || key), categoria: opc?.categoria || null });
  }
  const max = pz.tamanho === 'grande' ? 2 : 1;
  const usadas = meias.slice(0, max);
  if (pz.tamanho === 'grande' && usadas.length === 1) usadas.push({ ...usadas[0] }); // inteira de 1 sabor
  const cats = new Set(usadas.map(m => m.categoria).filter(Boolean));
  return {
    tamanho: pz.tamanho,
    meias: usadas.map(({ opcao_id, nome }) => ({ opcao_id, nome })),
    tipo: cats.size > 1 ? 'mista' : ([...cats][0] || null),
    observacao: obs || null,
  };
}

function _kdsExtrairPizzas(p) {
  if (typeof _vInterpretarItem !== 'function') return [];
  const out = [];
  for (const it of (p.items || [])) {
    if (it.status === 'canceled') continue;
    const subs = it.items?.length ? it.items.filter(s => s.status !== 'canceled') : [it];
    for (const sub of subs) {
      const { pizzas } = _vInterpretarItem(sub);
      if (!pizzas.length) continue;
      const obs = [it.observation, sub !== it ? sub.observation : null].map(s => (s || '').trim()).filter(Boolean).join(' · ');
      const qtd = (it.quantity || 1) * (sub !== it ? (sub.quantity || 1) : 1);
      for (let k = 0; k < qtd; k++) for (const pz of pizzas) out.push(_kdsMontarPizza(pz, obs));
    }
  }
  return out.map((pz, i) => ({ seq: i + 1, ...pz }));
}

// Agendado entra na fila a tempo de ficar pronto (e chegar) no horário.
function _kdsEntraFila(p) {
  const criado = new Date(p.cw_created_at);
  const ini = p.order_timing === 'scheduled' && p.schedule?.scheduled_date_time_start;
  if (!ini) return criado;
  const cfg = _kdsCfg();
  const antes = (cfg.metaPreparo + (p.order_type === 'delivery' ? cfg.metaEntrega : 0)) * 60e3;
  return new Date(Math.max(criado.getTime(), new Date(ini).getTime() - antes));
}

// ── Carga e realtime ───────────────────────────────────────────

async function _kdsCarregar() {
  if (_kds.carregando) { _kds.recarregar = true; return; }
  _kds.carregando = true;
  try {
    const sb = _kdsDb();
    const desde = new Date(Date.now() - KDS_JANELA_H * 3600e3).toISOString();
    const campos = 'id,display_id,status,order_type,order_timing,sales_channel,external_display_id,customer_id,customer_name,items,observation,schedule,cw_created_at';
    const [cwRes, opsRes] = await Promise.all([
      sb.from('cw_pedidos').select(campos).or(`cw_created_at.gte.${desde},status.in.(confirmed,scheduled_confirmed)`).order('cw_created_at').limit(400),
      sb.from('kds_operadores').select('id,nome,funcao,diarista,ativo').order('nome'),
    ]);
    if (cwRes.error) throw cwRes.error;
    const cw = cwRes.data || [];
    _kds.operadores = opsRes.data || [];
    _kds.cw = new Map(cw.map(p => [p.id, p]));

    const lerPedidos = async () => {
      const ids = cw.map(p => p.id);
      const { data, error } = ids.length ? await sb.from('kds_pedidos').select('*').in('cw_pedido_id', ids) : { data: [] };
      if (error) throw error;
      return data || [];
    };
    let peds = await lerPedidos();

    // Pedido ativo que ainda não entrou na cozinha → grava as pizzas
    const jaTem = new Set(peds.map(x => x.cw_pedido_id));
    let gerou = false;
    for (const p of cw) {
      if (jaTem.has(p.id) || !KDS_CW_ATIVOS.includes(p.status)) continue;
      const pizzas = _kdsExtrairPizzas(p);
      if (!pizzas.length) continue;
      const { error } = await sb.rpc('kds_gerar_pizzas', {
        p_cw_pedido_id: p.id, p_numero: String(p.display_id ?? ''), p_entra_fila_em: _kdsEntraFila(p).toISOString(), p_pizzas: pizzas,
      });
      if (error) console.warn('[kds] gerar pizzas', p.id, error.message); else gerou = true;
    }
    if (gerou) peds = await lerPedidos();
    _kds.pedidos = new Map(peds.map(x => [x.id, x]));

    const pedIds = peds.map(x => x.id);
    const { data: pzs, error: e3 } = pedIds.length ? await sb.from('kds_pizzas').select('*').in('pedido_id', pedIds) : { data: [] };
    if (e3) throw e3;
    _kds.pizzas = new Map((pzs || []).map(z => [z.id, z]));

    // "Novo ★": cliente sem pedido anterior a este
    const clientes = [...new Set(cw.filter(p => p.customer_id).map(p => p.customer_id))];
    if (clientes.length) {
      const { data: crm } = await sb.from('crm_clientes').select('id,primeiro_pedido').in('id', clientes);
      const prim = new Map((crm || []).map(c => [c.id, c.primeiro_pedido]));
      _kds.novos = new Set(cw.filter(p => {
        if (!p.customer_id) return false;
        const pp = prim.get(p.customer_id);
        return !pp || new Date(pp).getTime() >= new Date(p.cw_created_at).getTime() - 60e3;
      }).map(p => p.id));
    }

    if (_kds.sessao) {
      const { data: minhas } = await sb.from('kds_pizzas').select('iniciado_em,montagem_fim_em')
        .eq('iniciado_por', _kds.sessao.operador_id).gte('iniciado_em', _kdsInicioTurno().toISOString())
        .not('montagem_fim_em', 'is', null);
      const durs = (minhas || []).map(z => _kdsSeg(z.iniciado_em, z.montagem_fim_em));
      const total = durs.reduce((s, d) => s + d, 0);
      _kds.perf = { feitas: durs.length, mediaSeg: durs.length ? total / durs.length : 0, totalSeg: total };
    }
    _kds.carregou = true;
  } catch (e) {
    console.warn('[kds] carregar', e);
    if (!_kds.carregou) _kdsAviso('Não foi possível carregar os pedidos do KDS', 'err');
  } finally {
    _kds.carregando = false;
    if (_kdsAtivo()) _kdsRender();
    if (_kds.recarregar) { _kds.recarregar = false; _kdsCarregar(); }
  }
}

function _kdsAtivo() { return document.getElementById('page-kds')?.classList.contains('active'); }

function _kdsAgendarRecarga() {
  clearTimeout(_kds.debounce);
  _kds.debounce = setTimeout(() => { if (_kdsAtivo()) _kdsCarregar(); }, 400);
}

function _kdsLigar() {
  if (!_kds.canal) {
    const sb = _kdsDb();
    _kds.canal = sb.channel('kds-cozinha');
    for (const t of ['kds_pizzas', 'kds_pedidos', 'cw_pedidos']) {
      _kds.canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, _kdsAgendarRecarga);
    }
    _kds.canal.subscribe();
  }
  if (!_kds.poll) _kds.poll = setInterval(() => { if (_kdsAtivo()) _kdsCarregar(); }, 20000);
  if (!_kds.tick) _kds.tick = setInterval(_kdsTick, 1000);
}

// Atualiza só os cronômetros, sem redesenhar a tela
function _kdsTick() {
  if (!_kdsAtivo()) return;
  const meta = _kdsCfg().metaPreparo * 60;
  document.querySelectorAll('#page-kds [data-kds-desde]').forEach(el => {
    const seg = _kdsSeg(el.dataset.kdsDesde);
    if (el.dataset.kdsFmt === 'min') {
      el.querySelector('span').textContent = `${Math.max(0, Math.floor(seg / 60))} min`;
      el.classList.toggle('atraso', seg > meta);
    } else {
      el.textContent = _kdsMmSs(seg);
    }
  });
}

// ── Seleção: o que aparece pro pizzaiolo ───────────────────────

function _kdsPizzasDoPedido(pedidoId) {
  return [..._kds.pizzas.values()].filter(z => z.pedido_id === pedidoId).sort((a, b) => a.seq - b.seq);
}

function _kdsFilaPizzaiolo() {
  const agora = Date.now();
  const ocultos = new Set(_kdsLs('vtp_kds_cancel_ocultos') || []);
  const fila = [];
  for (const ped of _kds.pedidos.values()) {
    const cw = _kds.cw.get(ped.cw_pedido_id);
    if (!cw || new Date(ped.entra_fila_em).getTime() > agora) continue;
    const cancelado = ['canceled', 'canceling'].includes(cw.status);
    if (!cancelado && !KDS_CW_ATIVOS.includes(cw.status)) continue;    // já saiu da cozinha no CW
    if (cancelado && ocultos.has(ped.id)) continue;
    const pizzas = _kdsPizzasDoPedido(ped.id);
    if (!pizzas.some(z => z.status === 'aguardando' || z.status === 'em_preparo')) continue;
    fila.push({ ped, cw, pizzas, cancelado });
  }
  return fila.sort((a, b) => a.ped.prioridade - b.ped.prioridade);
}

// ── Render ─────────────────────────────────────────────────────

function renderKds() {
  _kds.tela    = _kdsLs('vtp_kds_tela');
  _kds.sessao  = _kdsLs('vtp_kds_sessao');
  _kdsLigar();
  _kdsRender();
  _kdsCarregar();
}

// A lista e o modal têm containers separados: a recarga (realtime / 20 s)
// redesenha a lista, mas não mexe num modal com formulário (PIN, diarista,
// configuração) — senão apagaria o que a pessoa está digitando.
function _kdsRender() {
  const el = document.getElementById('page-kds');
  if (!el) return;
  if (!document.getElementById('kdsMain')) el.innerHTML = '<div id="kdsMain"></div><div id="kdsModal"></div>';
  let html;
  if (!_kds.tela) html = _kdsHtmlTelas();
  else if (!_kds.sessao) html = _kdsHtmlLogin();
  else html = _kdsHtmlPizzaiolo();
  document.getElementById('kdsMain').innerHTML = html;
  _kdsConferirModal();
  _kdsTick();
}

// Depois de uma recarga: o modal de pizza continua aberto enquanto a pizza
// estiver no mesmo estado; se mudou (outro pizzaiolo iniciou, pedido saiu da
// cozinha), fecha e avisa.
function _kdsConferirModal() {
  const m = _kds.modal;
  if (!m?.pizzaId) { if (!m) _kdsRefazerModal(); return; }
  const z = _kds.pizzas.get(m.pizzaId);
  const meu = z?.iniciado_por === _kds.sessao?.operador_id;
  const valido = m.tipo === 'iniciar' ? z?.status === 'aguardando' : z?.status === 'em_preparo' && meu;
  if (valido) return;
  _kdsFecharModal();
  if (m.tipo === 'iniciar' && z?.status === 'em_preparo') {
    _kdsAviso(`${_kds.operadores.find(o => o.id === z.iniciado_por)?.nome || 'Outro pizzaiolo'} iniciou esta pizza primeiro`, 'err');
  }
}

function _kdsHtmlTop(titulo, contadores = '') {
  return `
    <header class="kds-top">
      <button class="kds-ico-btn" onclick="_kdsHome()" title="Início">${KDS_SVG.home}</button>
      <div class="kds-top-title">${titulo}</div>
      ${contadores}
      <button class="kds-ico-btn" onclick="_kdsMenu(this)" title="Opções">${KDS_SVG.gear}</button>
    </header>`;
}

function _kdsHtmlTelas() {
  return `<div class="kds">
    ${_kdsHtmlTop('KDS')}
    <p style="text-align:center;color:var(--kds-lilas);margin:6px 0 18px">Qual tela este aparelho vai mostrar?</p>
    <div class="kds-telas">
      <button class="kds-tela" onclick="_kdsEscolherTela('pizzaiolo')"><b>KDS Pizzaiolo</b><span>Fila de pizzas para montar, ficha técnica e performance de cada pizzaiolo.</span></button>
      <button class="kds-tela" disabled><em>Em breve</em><b>KDS Finalização</b><span>Pizzas saindo do forno: cortar, embalar e liberar o pedido.</span></button>
      <button class="kds-tela" disabled><em>Em breve</em><b>KDS Pedido</b><span>Fila completa, reordenação, pedidos internos e capacidade.</span></button>
    </div>
  </div>`;
}

function _kdsHtmlLogin() {
  const q = _kdsFrase(_kds.busca).toLowerCase();
  const ops = _kds.operadores.filter(o => o.ativo && o.funcao !== 'finalizacao' && (!q || o.nome.toLowerCase().includes(q)));
  const lista = !_kds.carregou ? '<div class="kds-vazio">Carregando…</div>'
    : ops.length ? ops.map(o => `
        <button class="kds-op" onclick="_kdsAbrirPin('${o.id}')">
          <span class="kds-op-av">${_kdsEsc(o.nome.trim().charAt(0).toUpperCase())}</span>
          <span>${_kdsEsc(o.nome)}${o.diarista ? '<small>Diarista</small>' : ''}</span>
        </button>`).join('')
    : `<div class="kds-vazio" style="grid-column:1/-1;padding:24px">${q ? 'Ninguém com esse nome.' : 'Nenhum pizzaiolo cadastrado ainda.'}</div>`;
  return `<div class="kds">
    ${_kdsHtmlTop('KDS Pizzaiolo')}
    <div class="kds-login-card">
      <h2>Quem está no posto?</h2>
      <p>Toque no seu nome e digite seu PIN.</p>
      <input class="kds-input" placeholder="Buscar pelo nome" value="${_kdsEsc(_kds.busca)}" oninput="_kds.busca=this.value;_kdsRefazerLista()">
      <div class="kds-ops" id="kdsOps">${lista}</div>
      <button class="kds-link" onclick="_kdsAbrirDiarista()">Sou diarista — primeiro acesso</button>
    </div>
  </div>`;
}

function _kdsRefazerLista() {
  const box = document.getElementById('kdsOps');
  if (!box) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _kdsHtmlLogin();
  box.innerHTML = tmp.querySelector('#kdsOps').innerHTML;
}

function _kdsHtmlPizzaiolo() {
  const fila = _kdsFilaPizzaiolo();
  const ativas = fila.filter(f => !f.cancelado).flatMap(f => f.pizzas);
  const nAg = ativas.filter(z => z.status === 'aguardando').length;
  const nIn = [..._kds.pizzas.values()].filter(z => z.status === 'em_preparo').length;
  const perf = _kds.perf || { feitas: 0, mediaSeg: 0, totalSeg: 0 };
  const contadores = `<div class="kds-top-counts">
      <div class="kds-count kds-count-ag"><b>${nAg}</b><span>Aguardando</span></div>
      <div class="kds-count kds-count-in"><b>${nIn}</b><span>Iniciadas</span></div>
    </div>`;

  const lista = !_kds.carregou ? '<div class="kds-vazio">Carregando pedidos…</div>'
    : fila.length ? fila.map(_kdsHtmlPedido).join('')
    : `<div class="kds-vazio">${KDS_SVG.pizza.replace(/width="20" height="20"/, 'width="48" height="48"')}<b>Nenhuma pizza na fila</b>Os pedidos novos aparecem aqui sozinhos.</div>`;

  return `<div class="kds kds-pizzaiolo">
    ${_kdsHtmlTop('KDS Pizzaiolo', contadores)}
    <section class="kds-perf">
      <div><div class="kds-perf-nome">${_kdsEsc(_kds.sessao.nome)}</div><div class="kds-perf-sub">Performance</div></div>
      <div class="kds-perf-kpis">
        <div class="kds-kpi"><span>Pizzas feitas</span><b>${KDS_SVG.pizza} ${perf.feitas}</b></div>
        <div class="kds-kpi"><span>Tempo médio</span><b>${KDS_SVG.cronometro} ${perf.feitas ? _kdsMmSs(perf.mediaSeg).replace(/^0/, '') : '—'}</b></div>
        <div class="kds-kpi"><span>Tempo montagem</span><b>${KDS_SVG.chapeu} ${_kdsMmSs(perf.totalSeg)}</b></div>
      </div>
    </section>
    <main class="kds-lista">${lista}</main>
  </div>`;
}

function _kdsHtmlCanal(cw) {
  const cod = _kdsEsc(cw.external_display_id || '');
  if (cw.sales_channel === 'ifood')  return `<span class="kds-canal">Ifood ${cod}</span>`;
  if (cw.sales_channel === 'food99') return `<span class="kds-canal kds-canal-99food"><em>99food</em> ${cod}</span>`;
  if (/keeta/i.test(cw.sales_channel || '')) return `<span class="kds-canal kds-canal-keeta">Keeta ${cod}</span>`;
  return '';
}

function _kdsHtmlPedido({ ped, cw, pizzas, cancelado }) {
  const tipo = cw.order_type === 'delivery' ? KDS_SVG.capacete : cw.order_type === 'takeout' ? KDS_SVG.correndo : KDS_SVG.mesa;
  const obs = [(cw.observation || '').trim(), ...pizzas.filter(z => z.observacao).map(z => pizzas.length > 1 ? `${_kdsPad(z.seq)} · ${z.observacao}` : z.observacao)]
    .filter(Boolean);
  return `
    <article class="kds-ped${cancelado ? ' kds-ped-cancel' : ''}">
      <div class="kds-ped-head">
        <div class="kds-ped-l1">
          <span class="kds-ped-tipo">${tipo}</span>
          <span class="kds-ped-num">#${_kdsEsc(cw.display_id)}</span>
          ${cancelado ? '<span class="kds-ped-cancel-tag">Cancelado</span>' : ''}
          ${_kdsHtmlCanal(cw)}
        </div>
        <div class="kds-ped-l2">
          <span class="kds-ped-cli">${KDS_SVG.user}<span>${_kdsEsc(cw.customer_name || 'Cliente')}</span>
            ${_kds.novos.has(cw.id) ? `<span class="kds-novo">Novo ${KDS_SVG.estrela}</span>` : ''}</span>
          <span class="kds-ped-tempo" data-kds-desde="${ped.entra_fila_em}" data-kds-fmt="min"><i></i><span></span></span>
        </div>
        ${cancelado ? `<button class="kds-ped-fechar" onclick="_kdsOcultarCancelado('${ped.id}')" title="Fechar">${KDS_SVG.x}</button>` : ''}
      </div>
      ${cancelado ? '<div class="kds-ped-cancel-msg">Pedido cancelado — não monte as pizzas que faltam.</div>' : ''}
      <div class="kds-ped-body">
        ${pizzas.map(z => _kdsHtmlPizza(z, cw, cancelado)).join('')}
        ${obs.length ? `<div class="kds-obs">${obs.map(_kdsEsc).join('<br>')}</div>` : ''}
      </div>
    </article>`;
}

function _kdsSabores(z) {
  const m = z.meias || [];
  if (m.length === 2 && m[0].nome === m[1].nome) return [{ ...m[0], inteira: true }];
  return m;
}

function _kdsHtmlPizza(z, cw, cancelado) {
  const meu = z.iniciado_por && z.iniciado_por === _kds.sessao?.operador_id;
  const feita = ['finalizacao', 'pronto'].includes(z.status);
  let cls = `kds-pz kds-pz-${z.status}`, ico, tempo, st;
  if (feita) {
    cls += ' kds-pz-feita'; ico = KDS_SVG.check;
    tempo = `<span class="kds-pz-tempo">${_kdsMmSs(_kdsSeg(z.iniciado_em, z.montagem_fim_em))}</span>`;
    st = 'Finalização';
  } else if (z.status === 'em_preparo') {
    if (!meu) cls += ' kds-pz-outro';
    ico = KDS_SVG.relogio;
    tempo = `<span class="kds-pz-tempo" data-kds-desde="${z.iniciado_em}"></span>`;
    const quem = _kds.operadores.find(o => o.id === z.iniciado_por)?.nome?.split(' ')[0];
    st = meu || !quem ? 'Em preparo' : `Em preparo<br>${_kdsEsc(quem)}`;
  } else {
    ico = KDS_SVG.play; tempo = '<span class="kds-pz-tempo">00:00</span>'; st = 'Aguardando';
    if (cancelado) cls += ' kds-pz-bloq';
  }
  const nome = z.tamanho === 'grande' ? 'Pizza Grande' : 'Pizza Pequena';
  const chips = _kdsSabores(z).map(m => `<span class="kds-chip">${_kdsEsc(m.nome)}${m.inteira ? '<span class="kds-chip-inteira">inteira</span>' : ''}</span>`).join('');
  return `
    <button class="${cls}" onclick="_kdsTocarPizza('${z.id}')">
      <span class="kds-pz-num">${_kdsPad(z.seq)}</span>
      <span class="kds-pz-info"><span class="kds-pz-nome" style="display:block">${nome}</span><span class="kds-pz-sabores">${chips}</span></span>
      <span class="kds-pz-acao"><span class="kds-pz-ico">${ico}</span>${tempo}<span class="kds-pz-st">${st}</span></span>
    </button>`;
}

// ── Modais ─────────────────────────────────────────────────────

function _kdsAbrirModal(m) { _kds.modal = m; _kdsRefazerModal(); }
function _kdsFecharModal() { _kds.modal = null; _kds.pin = ''; _kdsRefazerModal(); }
function _kdsRefazerModal() {
  const box = document.getElementById('kdsModal');
  if (box) box.innerHTML = _kdsHtmlModal();
  _kdsTick();
}

function _kdsHtmlModal() {
  const m = _kds.modal;
  if (!m) return '';
  const fundo = conteudo => `<div class="kds-ov" onclick="if(event.target===this)_kdsFecharModal()">${conteudo}</div>`;
  const z = m.pizzaId ? _kds.pizzas.get(m.pizzaId) : null;
  const cw = z ? _kds.cw.get(_kds.pedidos.get(z.pedido_id)?.cw_pedido_id) : null;

  if ((m.tipo === 'iniciar' || m.tipo === 'finalizar') && z && cw) {
    const txt = m.tipo === 'iniciar' ? 'Confirma o início da preparação' : 'Confirma a finalização do preparo';
    return fundo(`<div class="kds-dlg kds-dlg-sm">
      <div class="kds-dlg-ico kds-bg-preparo">${KDS_SVG.relogio.replace(/width="30" height="30"/, 'width="58" height="58"')}</div>
      <p class="kds-dlg-txt">${txt} do item <b>${_kdsPad(z.seq)}</b> do pedido nº <b>${_kdsEsc(cw.display_id)}</b>?</p>
      <div class="kds-dlg-btns">
        <button class="kds-btn kds-btn-nao" onclick="${m.tipo === 'iniciar' ? '_kdsFecharModal()' : `_kdsAbrirModal({tipo:'montagem',pizzaId:'${z.id}'})`}">Não</button>
        <button class="kds-btn kds-btn-sim" id="kdsSim" onclick="${m.tipo === 'iniciar' ? '_kdsIniciar' : '_kdsFinalizarMontagem'}('${z.id}')">Sim</button>
      </div>
    </div>`);
  }
  if (m.tipo === 'montagem' && z && cw) return fundo(_kdsHtmlMontagem(z, cw));
  if (m.tipo === 'ficha' && z) return fundo(_kdsHtmlFicha(z, m.meia));
  if (m.tipo === 'pin')       return fundo(_kdsHtmlPin(m));
  if (m.tipo === 'diarista')  return fundo(_kdsHtmlDiarista());
  if (m.tipo === 'config')    return fundo(_kdsHtmlConfig(m));
  return '';
}

function _kdsFotoMeia(meia, lado) {
  const arq = meia?.opcao_id != null ? KDS_FOTOS[meia.opcao_id] : null;
  const img = arq ? `<img src="assets/sabores/${arq}.webp" alt="${_kdsEsc(meia.nome)}">`
                  : `<span class="kds-foto-vazia">${_kdsEsc(meia?.nome || '')}</span>`;
  return `<button class="kds-foto-meia kds-foto-${lado}" onclick="_kdsAbrirModal({tipo:'ficha',pizzaId:_kds.modal.pizzaId,meia:${lado === 'dir' ? 1 : 0}})">${img}</button>`;
}

function _kdsHtmlMontagem(z, cw) {
  const total = _kdsPizzasDoPedido(z.pedido_id).length;
  const meias = z.meias || [];
  const meio = meias.length === 2 && meias[0].nome !== meias[1].nome;
  const abas = meio ? meias : meias.slice(0, 1);
  const obs = [z.observacao, (cw.observation || '').trim()].filter(Boolean);
  return `<div class="kds-dlg">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()" title="Voltar para a lista">${KDS_SVG.x}</button>
    <div class="kds-mont-head"><h3>${z.tamanho === 'grande' ? 'Pizza Grande' : 'Pizza Pequena'}</h3><span>#${_kdsEsc(cw.display_id)} <small>${z.seq}/${total}</small></span></div>
    <div class="kds-mont-tabs${abas.length === 1 ? ' um' : ''}">
      ${abas.map((mm, i) => `<button class="kds-mont-tab" onclick="_kdsAbrirModal({tipo:'ficha',pizzaId:'${z.id}',meia:${i}})">${_kdsEsc(mm.nome)}${!meio && z.tamanho === 'grande' ? ' · inteira' : ''}</button>`).join('')}
    </div>
    <div class="kds-foto${meio ? ' meio' : ''}">
      ${meio ? _kdsFotoMeia(meias[0], 'esq') + _kdsFotoMeia(meias[1], 'dir') : _kdsFotoMeia(meias[0], 'esq').replace('kds-foto-esq', 'kds-foto-inteira')}
    </div>
    <p class="kds-foto-dica">Toque no sabor para ver a ficha técnica</p>
    ${obs.length ? `<div class="kds-mont-obs"><span>Observação</span><b>${obs.map(_kdsEsc).join('<br>')}</b></div>` : ''}
    <button class="kds-btn-montagem" onclick="_kdsAbrirModal({tipo:'finalizar',pizzaId:'${z.id}'})">${KDS_SVG.check} Finalizar montagem</button>
    <div class="kds-mont-timer" data-kds-desde="${z.iniciado_em}"></div>
    <button class="kds-mont-devolver" onclick="_kdsDevolver('${z.id}')">Iniciei por engano — devolver para a fila</button>
  </div>`;
}

// Quantidade da ficha na unidade da cozinha: kg → g, L → ml ("45g", "01g")
function _kdsQtd(r, ins) {
  const v = Number(r.peso_g) || 0;
  const u = String(ins?.unit || '').toLowerCase();
  const num = n => { const k = Math.round(n * 10) / 10; return Number.isInteger(k) ? (k < 10 ? _kdsPad(k) : String(k)) : String(k).replace('.', ','); };
  if (u === 'kg') return num(v * 1000) + 'g';
  if (u === 'l')  return num(v * 1000) + 'ml';
  if (u === 'g' || u === 'ml') return num(v) + u;
  return num(v) + ' ' + (u || 'un');
}

function _kdsHtmlFicha(z, idx) {
  const meia = (z.meias || [])[idx || 0];
  const opc = meia?.opcao_id != null && typeof opcoes !== 'undefined' ? opcoes.find(o => o.id === meia.opcao_id) : null;
  const ings = opc?.fichaTecnica?.ingredientes?.filter(r => r.item_id) || [];
  const linhas = ings.map((r, i) => {
    const ins = typeof items !== 'undefined' ? items.find(x => x.id === r.item_id) : null;
    const fin = typeof fichaEtapaIngrediente === 'function' && fichaEtapaIngrediente(r) === 'finalizacao';
    return `<div class="kds-ficha-ln${fin ? ' fin' : ''}"><b>${_kdsPad(i + 1)}</b><span>${_kdsQtd(r, ins)} - ${_kdsEsc(_kdsFrase(ins?.name || 'Insumo'))}</span></div>`;
  }).join('');
  return `<div class="kds-dlg">
    <div class="kds-ficha-head">
      <h4>Ficha técnica</h4>
      <span class="kds-ficha-porcao">1/2 porção</span>
      <span class="kds-ficha-leg"><span><i style="background:var(--kds-preparo)"></i>Montagem</span><span><i style="background:var(--kds-laranja)"></i>Finalização</span></span>
    </div>
    <div class="kds-ficha-nome">${_kdsEsc(meia?.nome || '')}</div>
    <div class="kds-ficha-lista">${linhas || '<div class="kds-ficha-vazia">Ficha técnica não cadastrada para este sabor.</div>'}</div>
    <div style="text-align:center;margin-top:22px"><button class="kds-btn kds-btn-nao" style="min-width:60%" onclick="_kdsAbrirModal({tipo:'montagem',pizzaId:'${z.id}'})">Voltar</button></div>
  </div>`;
}

// ── Ações do pizzaiolo ─────────────────────────────────────────

function _kdsTocarPizza(id) {
  const z = _kds.pizzas.get(id);
  if (!z) return;
  const ped = _kds.pedidos.get(z.pedido_id);
  const cw = _kds.cw.get(ped?.cw_pedido_id);
  if (z.status === 'aguardando') {
    if (['canceled', 'canceling'].includes(cw?.status)) { _kdsAviso('Pedido cancelado — não monte esta pizza', 'err'); return; }
    const minha = [..._kds.pizzas.values()].find(x => x.status === 'em_preparo' && x.iniciado_por === _kds.sessao?.operador_id);
    if (minha) { _kdsAviso('Finalize a pizza que você está montando antes de iniciar outra', 'err'); _kdsAbrirModal({ tipo: 'montagem', pizzaId: minha.id }); return; }
    _kdsAbrirModal({ tipo: 'iniciar', pizzaId: id });
  } else if (z.status === 'em_preparo') {
    if (z.iniciado_por === _kds.sessao?.operador_id) _kdsAbrirModal({ tipo: 'montagem', pizzaId: id });
    else _kdsAviso(`Essa pizza já está com ${_kds.operadores.find(o => o.id === z.iniciado_por)?.nome || 'outro pizzaiolo'}`, 'err');
  }
}

async function _kdsIniciar(id) {
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const s = _kds.sessao;
  const { data, error } = await _kdsDb().rpc('kds_iniciar', { p_pizza: id, p_operador: s.operador_id, p_jornada: s.jornada_id });
  if (error || !data?.ok) {
    const msg = error ? 'Não foi possível iniciar — verifique a internet'
      : data.motivo === 'ocupada' ? `${data.por} iniciou esta pizza primeiro`
      : data.motivo === 'ja_montando' ? 'Finalize a pizza que você está montando antes de iniciar outra'
      : 'Esta pizza não está mais aguardando';
    _kdsFecharModal(); _kdsAviso(msg, 'err'); _kdsCarregar(); return;
  }
  const z = _kds.pizzas.get(id);
  Object.assign(z, { status: 'em_preparo', iniciado_por: s.operador_id, iniciado_em: new Date().toISOString() });
  _kdsAbrirModal({ tipo: 'montagem', pizzaId: id });
  _kdsRender();

  // Agendado no CW sai de "agendado" e vai para "em preparo" junto com a 1ª pizza
  const cw = _kds.cw.get(_kds.pedidos.get(z.pedido_id)?.cw_pedido_id);
  if (cw?.status === 'scheduled_confirmed') {
    _kdsDb().functions.invoke('cw-status', { body: { order_id: cw.id, acao: 'start_preparation' } })
      .then(({ data: r }) => { if (r && !r.ok) console.warn('[kds] CW start_preparation', r); })
      .catch(e => console.warn('[kds] CW start_preparation', e));
  }
}

async function _kdsFinalizarMontagem(id) {
  const btn = document.getElementById('kdsSim'); if (btn) btn.disabled = true;
  const { data, error } = await _kdsDb().rpc('kds_finalizar_montagem', { p_pizza: id, p_operador: _kds.sessao.operador_id });
  _kdsFecharModal();
  if (error || !data) { _kdsAviso('Não foi possível finalizar — tente de novo', 'err'); _kdsCarregar(); return; }
  _kdsAviso('Pizza no forno — enviada para a finalização');
  _kdsCarregar();
}

async function _kdsDevolver(id) {
  const { data, error } = await _kdsDb().rpc('kds_devolver_fila', { p_pizza: id, p_operador: _kds.sessao.operador_id });
  _kdsFecharModal();
  if (error || !data) _kdsAviso('Não foi possível devolver a pizza', 'err');
  _kdsCarregar();
}

function _kdsOcultarCancelado(pedidoId) {
  const ocultos = _kdsLs('vtp_kds_cancel_ocultos') || [];
  ocultos.push(pedidoId);
  _kdsLs('vtp_kds_cancel_ocultos', ocultos.slice(-200));
  _kdsRender();
}

// ── Tela, sessão e menu ────────────────────────────────────────

function _kdsEscolherTela(t) { _kds.tela = t; _kdsLs('vtp_kds_tela', t); _kdsRender(); _kdsCarregar(); }

function _kdsHome() {
  if (document.body.classList.contains('kds-full')) { _kdsTelaCheia(false); return; }
  goModule('dashboard');
}

function _kdsTelaCheia(ligar) {
  document.body.classList.toggle('kds-full', ligar);
  try {
    if (ligar && !document.fullscreenElement) document.documentElement.requestFullscreen?.();
    if (!ligar && document.fullscreenElement) document.exitFullscreen?.();
  } catch (_) {}
}

function _kdsMenu(btn) {
  document.querySelector('.kds-menu')?.remove();
  const r = btn.getBoundingClientRect();
  const full = document.body.classList.contains('kds-full');
  const itens = [
    _kds.sessao && ['Trocar de usuário (encerrar jornada)', '_kdsSair()'],
    [full ? 'Sair da tela cheia' : 'Tela cheia', `_kdsTelaCheia(${!full})`],
    _kds.tela && ['Trocar a tela deste aparelho', '_kdsEscolherTela(null)'],
    _kdsGestor() && ['Configurar KDS (pizzaiolos e tempos)', "_kdsAbrirModal({tipo:'config',aba:'operadores'})"],
  ].filter(Boolean);
  const menu = document.createElement('div');
  menu.className = 'kds-menu';
  menu.innerHTML = itens.map(([t, fn]) => `<button onclick="document.querySelector('.kds-menu')?.remove();${fn}">${t}</button>`).join('');
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function fora(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', fora); }
  }), 0);
}

async function _kdsSair() {
  const s = _kds.sessao;
  if (s?.jornada_id) await _kdsDb().rpc('kds_sair', { p_jornada: s.jornada_id });
  _kds.sessao = null; _kds.perf = null; _kdsLs('vtp_kds_sessao', null);
  _kdsRender();
}

// ── PIN e diarista ─────────────────────────────────────────────

function _kdsAbrirPin(operadorId) { _kds.pin = ''; _kdsAbrirModal({ tipo: 'pin', operadorId, erro: '' }); }

function _kdsHtmlPin(m) {
  const op = _kds.operadores.find(o => o.id === m.operadorId);
  return `<div class="kds-dlg kds-dlg-sm">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <p class="kds-dlg-txt" style="margin:8px 0 0">Olá, <b>${_kdsEsc(op?.nome || '')}</b><br>Digite seu PIN</p>
    <div class="kds-pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < _kds.pin.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="kds-pin-pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button onclick="_kdsPinTecla('${n}')">${n}</button>`).join('')}
      <button onclick="_kdsPinTecla('apagar')">⌫</button><button onclick="_kdsPinTecla('0')">0</button><button onclick="_kdsFecharModal()" style="font-size:1rem">Sair</button>
    </div>
    <div class="kds-pin-erro">${_kdsEsc(m.erro || '')}</div>
  </div>`;
}

async function _kdsPinTecla(t) {
  const m = _kds.modal;
  if (!m || m.tipo !== 'pin' || m.enviando) return;
  if (t === 'apagar') _kds.pin = _kds.pin.slice(0, -1);
  else if (_kds.pin.length < 4) _kds.pin += t;
  m.erro = '';
  _kdsRefazerModal();
  if (_kds.pin.length < 4) return;
  m.enviando = true;
  const ok = await _kdsEntrar(m.operadorId, _kds.pin);
  m.enviando = false;
  if (!ok) { _kds.pin = ''; m.erro = 'PIN incorreto'; _kdsRefazerModal(); }
}

async function _kdsEntrar(operadorId, pin) {
  const { data, error } = await _kdsDb().rpc('kds_entrar', { p_operador: operadorId, p_pin: pin, p_posto: 'pizzaiolo', p_dispositivo: _kdsDispositivo() });
  if (error || !data) return false;
  const op = _kds.operadores.find(o => o.id === operadorId);
  _kds.sessao = { operador_id: operadorId, nome: op?.nome || 'Pizzaiolo', jornada_id: data };
  _kdsLs('vtp_kds_sessao', _kds.sessao);
  _kds.pin = ''; _kds.modal = null; _kds.busca = '';
  _kdsRender(); _kdsCarregar();
  return true;
}

function _kdsAbrirDiarista() { _kdsAbrirModal({ tipo: 'diarista' }); }

function _kdsHtmlDiarista() {
  return `<div class="kds-dlg">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    <h3 style="margin:0 40px 6px 0;font-size:1.3rem">Primeiro acesso — diarista</h3>
    <p style="color:var(--kds-lilas);margin:0 0 16px">Crie seu acesso para hoje. A sua produção fica registrada no seu nome.</p>
    <div class="kds-form">
      <label>Seu nome<input class="kds-input" id="kdsDiaNome" autocomplete="off" placeholder="Nome e sobrenome"></label>
      <label>Crie um PIN de 4 números<input class="kds-input" id="kdsDiaPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label>
      <button class="kds-btn kds-btn-sim kds-btn-bloco" id="kdsDiaBtn" onclick="_kdsSalvarDiarista()">Criar acesso e entrar</button>
    </div>
  </div>`;
}

async function _kdsSalvarDiarista() {
  const nome = document.getElementById('kdsDiaNome')?.value.trim();
  const pin  = document.getElementById('kdsDiaPin')?.value.trim();
  if (!nome) { _kdsAviso('Informe seu nome', 'err'); return; }
  if (!/^\d{4}$/.test(pin || '')) { _kdsAviso('O PIN deve ter 4 números', 'err'); return; }
  const btn = document.getElementById('kdsDiaBtn'); if (btn) btn.disabled = true;
  const { data: id, error } = await _kdsDb().rpc('kds_operador_salvar', {
    p_id: null, p_nome: nome, p_funcao: 'pizzaiolo', p_diarista: true, p_pin: pin, p_ativo: true, p_criado_por: 'tablet ' + _kdsDispositivo(),
  });
  if (error) { if (btn) btn.disabled = false; _kdsAviso(error.message, 'err'); return; }
  _kds.operadores.push({ id, nome, funcao: 'pizzaiolo', diarista: true, ativo: true });
  if (!(await _kdsEntrar(id, pin))) _kdsAviso('Acesso criado, mas não foi possível entrar — tente pelo seu nome', 'err');
}

// ── Configuração (gestor): pizzaiolos e tempos ─────────────────

function _kdsHtmlConfig(m) {
  const abas = `<div class="kds-cfg-tabs">
    <button class="${m.aba === 'operadores' ? 'on' : ''}" onclick="_kdsAbrirModal({tipo:'config',aba:'operadores'})">Pizzaiolos e finalização</button>
    <button class="${m.aba === 'tempos' ? 'on' : ''}" onclick="_kdsAbrirModal({tipo:'config',aba:'tempos'})">Tempos</button>
  </div>`;
  let corpo;
  if (m.aba === 'tempos') {
    const c = _kdsCfg();
    corpo = `<div class="kds-form">
      <div class="kds-form-2">
        <label>Tempo de preparo (min)<input class="kds-input" id="kdsCfgPrep" type="number" min="1" value="${c.metaPreparo}"></label>
        <label>Tempo de entrega (min)<input class="kds-input" id="kdsCfgEnt" type="number" min="0" value="${c.metaEntrega}"></label>
      </div>
      <p style="color:var(--kds-lilas);font-size:.85rem;margin:0">O pedido fica com o alerta 🔴 quando passa do tempo de preparo. Os agendados entram na fila com preparo + entrega de antecedência. Ajuste aqui sempre que mudar o tempo no CW/iFood/99.</p>
      <button class="kds-btn kds-btn-roxo kds-btn-bloco" onclick="_kdsSalvarTempos()">Salvar tempos</button>
    </div>`;
  } else if (m.editando !== undefined) {
    const o = m.editando ? _kds.operadores.find(x => x.id === m.editando) : null;
    corpo = `<div class="kds-form">
      <label>Nome<input class="kds-input" id="kdsOpNome" value="${_kdsEsc(o?.nome || '')}"></label>
      <div class="kds-form-2">
        <label>Função<select class="kds-input" id="kdsOpFuncao">
          ${[['pizzaiolo', 'Pizzaiolo'], ['finalizacao', 'Finalização'], ['ambos', 'Pizzaiolo e finalização']].map(([v, t]) => `<option value="${v}"${(o?.funcao || 'pizzaiolo') === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select></label>
        <label>${o ? 'Novo PIN (vazio = manter)' : 'PIN (4 números)'}<input class="kds-input" id="kdsOpPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label>
      </div>
      <label class="kds-check"><input type="checkbox" id="kdsOpDiarista"${o?.diarista ? ' checked' : ''}> Diarista</label>
      ${o ? `<label class="kds-check"><input type="checkbox" id="kdsOpAtivo"${o.ativo ? ' checked' : ''}> Ativo (aparece no login dos tablets)</label>` : ''}
      <div class="kds-dlg-btns" style="justify-content:flex-end">
        <button class="kds-btn kds-btn-nao" onclick="_kdsAbrirModal({tipo:'config',aba:'operadores'})">Cancelar</button>
        <button class="kds-btn kds-btn-roxo" onclick="_kdsSalvarOperador(${o ? `'${o.id}'` : 'null'})">Salvar</button>
      </div>
    </div>`;
  } else {
    const funcao = { pizzaiolo: 'Pizzaiolo', finalizacao: 'Finalização', ambos: 'Pizzaiolo e finalização' };
    corpo = `<button class="kds-btn kds-btn-roxo" onclick="_kdsAbrirModal({tipo:'config',aba:'operadores',editando:null})">+ Novo</button>
      <div style="margin-top:8px">${_kds.operadores.map(o => `
        <div class="kds-cfg-ln${o.ativo ? '' : ' off'}">
          <div><b>${_kdsEsc(o.nome)}</b><small>${funcao[o.funcao] || o.funcao}${o.diarista ? ' · Diarista' : ''}${o.ativo ? '' : ' · Inativo'}</small></div>
          <button class="kds-btn kds-btn-nao" style="min-width:0;padding:8px 14px" onclick="_kdsAbrirModal({tipo:'config',aba:'operadores',editando:'${o.id}'})">Editar</button>
        </div>`).join('') || '<div class="kds-ficha-vazia">Nenhum cadastrado.</div>'}</div>`;
  }
  return `<div class="kds-dlg" style="max-width:560px">
    <button class="kds-dlg-x" onclick="_kdsFecharModal()">${KDS_SVG.x}</button>
    ${abas}${corpo}
  </div>`;
}

async function _kdsSalvarOperador(id) {
  const nome = document.getElementById('kdsOpNome')?.value.trim();
  const pin  = document.getElementById('kdsOpPin')?.value.trim() || null;
  if (!nome) { _kdsAviso('Informe o nome', 'err'); return; }
  if (pin && !/^\d{4}$/.test(pin)) { _kdsAviso('O PIN deve ter 4 números', 'err'); return; }
  if (!id && !pin) { _kdsAviso('Informe o PIN', 'err'); return; }
  const { error } = await _kdsDb().rpc('kds_operador_salvar', {
    p_id: id, p_nome: nome, p_funcao: document.getElementById('kdsOpFuncao').value,
    p_diarista: document.getElementById('kdsOpDiarista').checked, p_pin: pin,
    p_ativo: id ? document.getElementById('kdsOpAtivo').checked : true, p_criado_por: getCurrentUser()?.name || null,
  });
  if (error) { _kdsAviso(error.message, 'err'); return; }
  _kdsAviso('Salvo');
  const { data } = await _kdsDb().from('kds_operadores').select('id,nome,funcao,diarista,ativo').order('nome');
  _kds.operadores = data || _kds.operadores;
  _kdsAbrirModal({ tipo: 'config', aba: 'operadores' });
  if (!_kds.sessao) _kdsRender();
}

function _kdsSalvarTempos() {
  const metaPreparo = parseInt(document.getElementById('kdsCfgPrep').value, 10);
  const metaEntrega = parseInt(document.getElementById('kdsCfgEnt').value, 10);
  if (!(metaPreparo > 0) || !(metaEntrega >= 0)) { _kdsAviso('Informe tempos válidos', 'err'); return; }
  const cfg = getConfig();
  cfg.kds = { ...(cfg.kds || {}), metaPreparo, metaEntrega };
  db._set('vtp_config', cfg);
  _kdsAviso('Tempos salvos');
  _kdsFecharModal(); _kdsRender();
}

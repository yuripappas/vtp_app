/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-mov.js — Movimentações do estoque (aba Movimentações)
 *
 * Tipos (selo na lista):
 *   Venda (auto)      — calculada dos pedidos do CW pelas fichas, 1 linha por pedido
 *   Recebimento       — entrada automática ao concluir o recebimento da compra
 *   Produção          — entrada de processado lançada pela produção
 *   Entrada manual    — entrada sem compra
 *   Transferência     — sai de um local e entra em outro (sem valor financeiro)
 *   Baixa             — saída sem venda, com o tipo (cortesia, acidente…)
 *   Ajuste contagem   — diferença aplicada quando a contagem é aprovada
 *
 * Qualquer pessoa com acesso ao módulo pode lançar, editar e excluir. Quem
 * fez o quê fica no est_log (gravado pelo banco). Excluir nunca apaga: marca
 * excluido_em/excluido_por e a linha some das contas.
 *
 * Ponte com o legado: toda movimentação que muda o total do item também
 * ajusta item.qty (o saldo antigo, ainda lido por Dashboard, Compras e
 * Alertas), e toda baixa também é espelhada em `desperdicios`, que os
 * Relatórios ainda leem. Quando esses módulos passarem a ler daqui, a ponte sai.
 */

const EST_MOV_TIPOS = {
  venda:           { label: 'Venda',           icon: 'shopping-bag',      cor: 'var(--success-fg)', bg: 'var(--success-bg)' },
  recebimento:     { label: 'Recebimento',     icon: 'truck',             cor: 'var(--info-fg)',    bg: 'var(--info-bg)'    },
  producao:        { label: 'Produção',        icon: 'chef-hat',          cor: 'var(--orange-fg)',  bg: 'var(--orange-bg)'  },
  entrada_manual:  { label: 'Entrada manual',  icon: 'plus-circle',       cor: 'var(--info-fg)',    bg: 'var(--info-bg)'    },
  transferencia:   { label: 'Transferência',   icon: 'repeat',            cor: 'var(--text2)',      bg: 'var(--surface2)'   },
  baixa:           { label: 'Baixa',           icon: 'minus-circle',      cor: 'var(--danger-fg)',  bg: 'var(--danger-bg)'  },
  ajuste_contagem: { label: 'Ajuste contagem', icon: 'clipboard-check',   cor: 'var(--warning-fg)', bg: 'var(--warning-bg)' },
};

// ══════════════════════════════════════════════════════════════
// DADOS
// ══════════════════════════════════════════════════════════════

function estUsuario() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return u?.name || 'Sistema';
}

const _estRound = n => Math.round((Number(n) || 0) * 10000) / 10000;

// Linha base de est_movimentacoes para um item
function _estMovRow(item, campos) {
  return {
    item_id: item.id, item_nome: item.name, item_tipo: estTipoItem(item),
    unidade: item.unit || null, categoria: item.cat || null,
    custo_unit: item.cost || 0, criado_por: estUsuario(),
    data_mov: new Date().toISOString(),
    ...campos,
  };
}

// Quanto a movimentação mexe no TOTAL do item (transferência não mexe)
const _estDeltaTotal = m => m.tipo === 'transferencia' ? 0 : (Number(m.sinal) || 0) * (Number(m.qtd) || 0);

// Ponte com o saldo antigo (item.qty) — ver cabeçalho
function estAplicarLegado(movs, fator = 1) {
  let mudou = false;
  for (const m of movs) {
    const d = _estDeltaTotal(m) * fator;
    if (!d) continue;
    const item = items.find(i => i.id === m.item_id);
    if (!item) continue;
    item.qty = Math.max(0, parseFloat(((Number(item.qty) || 0) + d).toFixed(3)));
    mudou = true;
  }
  if (mudou && typeof saveI === 'function') saveI();
}

async function estInserirMovs(rows, { aplicarLegado = true } = {}) {
  if (!rows.length) return [];
  const { data, error } = await _estSb().from('est_movimentacoes').insert(rows).select();
  if (error) throw new Error(error.message);
  if (aplicarLegado) estAplicarLegado(data);
  estInvalidarSaldos();
  return data;
}

async function estEditarMov(antes, campos) {
  const { data, error } = await _estSb().from('est_movimentacoes')
    .update({ ...campos, atualizado_por: estUsuario() }).eq('id', antes.id).select().single();
  if (error) throw new Error(error.message);
  estAplicarLegado([antes], -1);
  estAplicarLegado([data]);
  // Mantém o espelho da baixa (Relatórios) igual ao que foi editado
  if (data.tipo === 'baixa' && data.grupo_id && !data.produto_nome && typeof desperdicios !== 'undefined') {
    const d = desperdicios.find(x => x.movGrupoId === data.grupo_id);
    if (d) {
      Object.assign(d, { qty: Number(data.qtd), tipo: data.tipo_baixa, custo: Number(data.qtd) * (Number(data.custo_unit) || 0),
        date: data.data_mov.slice(0, 10), obs: data.motivo || '' });
      if (typeof saveD === 'function') saveD();
    }
  }
  estInvalidarSaldos();
  return data;
}

async function estExcluirMovs(movs) {
  if (!movs.length) return;
  const { error } = await _estSb().from('est_movimentacoes')
    .update({ excluido_em: new Date().toISOString(), excluido_por: estUsuario() })
    .in('id', movs.map(m => m.id));
  if (error) throw new Error(error.message);
  estAplicarLegado(movs, -1);
  _estDesespelharBaixas(movs);
  estInvalidarSaldos();
}

// ── Espelho das baixas em `desperdicios` (Relatórios ainda leem de lá) ──
function _estEspelharBaixa({ grupoId, origem, itemId, nome, unidade, qtd, tipo, custo, data, obs }) {
  if (typeof desperdicios === 'undefined') return;
  desperdicios.push({
    id: Math.max(0, ...desperdicios.map(x => x.id || 0)) + 1,
    itemId: itemId || null, prodId: null, origem, nome, unidade, qty: qtd, tipo, custo,
    date: (data || new Date().toISOString()).slice(0, 10), resp: estUsuario(), obs: obs || '',
    createdAt: new Date().toISOString(), movGrupoId: grupoId,
  });
  if (typeof saveD === 'function') saveD();
}

function _estDesespelharBaixas(movs) {
  if (typeof desperdicios === 'undefined') return;
  const grupos  = new Set(movs.filter(m => m.tipo === 'baixa').map(m => m.grupo_id || m.id));
  const legados = new Set(movs.filter(m => m.ref_tipo === 'desperdicio_legado').map(m => String(m.ref_id)));
  const antes = desperdicios.length;
  desperdicios = desperdicios.filter(d => !grupos.has(d.movGrupoId) && !legados.has(String(d.id)));
  if (desperdicios.length !== antes && typeof saveD === 'function') saveD();
}

// ── APIs usadas por outros módulos ─────────────────────────────

// Compras › concluir recebimento. item.qty já é somado por concluirLista,
// então aqui não aplica a ponte de novo.
async function estRegistrarRecebimentos(lista, linhas) {
  const rows = [];
  for (const l of linhas) {
    const item = items.find(i => i.id === l.itemId);
    if (!item || !(l.qtd > 0)) continue;
    rows.push(_estMovRow(item, {
      tipo: 'recebimento', sinal: 1, qtd: _estRound(l.qtd),
      local_destino: estLocalEntrada(item) || EST_SEM_LOCAL,
      custo_unit: l.custoUnit || item.cost || 0,
      motivo: [lista.codigo, l.fornecedor].filter(Boolean).join(' · '),
      ref_tipo: 'lista_compras', ref_id: `${lista.codigo || lista.id}:${l.linhaId}`,
      data_mov: l.data ? new Date(l.data + 'T12:00:00').toISOString() : new Date().toISOString(),
    }));
  }
  try {
    await estInserirMovs(rows, { aplicarLegado: false });
  } catch (e) {
    console.error('[estoque] recebimento não registrado:', e);
    if (typeof toast === 'function') toast('Recebimento concluído, mas não consegui registrar as movimentações de estoque: ' + e.message, 'err');
  }
}

// Pré-produção › confirmar produção
async function estRegistrarProducao(item, qtd, { obs = '', refId = null } = {}) {
  if (!item || !(qtd > 0)) return;
  try {
    await estInserirMovs([_estMovRow(item, {
      tipo: 'producao', sinal: 1, qtd: _estRound(qtd),
      local_destino: estLocalEntrada(item) || EST_SEM_LOCAL, motivo: obs || null,
      ref_tipo: refId ? 'ordem_producao' : null, ref_id: refId ? String(refId) : null,
    })]);
  } catch (e) {
    console.error('[estoque] produção não registrada:', e);
    if (typeof toast === 'function') toast('Produção salva, mas não consegui registrar a entrada no estoque: ' + e.message, 'err');
  }
}

// Baixa de 1 item (Etiquetagem › descarte e popup de Baixa)
async function estRegistrarBaixaItem(item, qtd, tipoBaixa, { local = null, obs = '', data = null, refTipo = null, refId = null } = {}) {
  const grupoId = crypto.randomUUID();
  const rows = await estInserirMovs([_estMovRow(item, {
    tipo: 'baixa', sinal: -1, qtd: _estRound(qtd), tipo_baixa: tipoBaixa,
    local_origem: local || estLocalSaida(item) || EST_SEM_LOCAL, motivo: obs || null,
    grupo_id: grupoId, data_mov: data || new Date().toISOString(),
    ref_tipo: refTipo, ref_id: refId ? String(refId) : null,
  })]);
  _estEspelharBaixa({ grupoId, origem: estTipoItem(item), itemId: item.id, nome: item.name, unidade: item.unit,
    qtd, tipo: tipoBaixa, custo: (item.cost || 0) * qtd, data, obs });
  return rows;
}

// ── Produto pronto → insumos/processados (mesma regra do débito automático) ──
// base = produtosPizza (massa+embalagem), sabores = opções; grande leva 2
// meias (sabores iguais = pizza inteira), pequena leva 1.
function estExpandirProduto({ baseId = null, saborIds = [], produtoId = null, qtd = 1 }) {
  const acc = {};
  if (produtoId) {
    const p = produtos.find(x => x.id === produtoId);
    if (p?.fichaTecnica) _estAcumFicha(p.fichaTecnica, qtd, acc);
  } else {
    const base = produtosPizza.find(b => b.id === baseId);
    if (base) _estAcumFicha(base.fichaTecnica, qtd, acc);
    for (const sid of saborIds) {
      const o = opcoes.find(x => x.id === sid);
      if (o) _estAcumFicha(o.fichaTecnica, qtd, acc);
    }
  }
  return Object.entries(acc)
    .map(([id, q]) => ({ item: items.find(i => i.id === Number(id)), qtd: q }))
    .filter(x => x.item);
}

// ── Migração do histórico de Desperdício (uma vez; idempotente) ──
let _estMigracaoFeita = false;
async function estMigrarDesperdicioLegado() {
  if (_estMigracaoFeita || typeof desperdicios === 'undefined') return 0;
  _estMigracaoFeita = true;
  const legados = desperdicios.filter(d => !d.movGrupoId);
  if (!legados.length) return 0;
  const { data: ja, error } = await _estSb().from('est_movimentacoes')
    .select('ref_id').eq('ref_tipo', 'desperdicio_legado');
  if (error) { _estMigracaoFeita = false; throw new Error(error.message); }
  const feitos = new Set((ja || []).map(r => String(r.ref_id)));

  const rows = [];
  for (const d of legados) {
    if (feitos.has(String(d.id))) continue;
    const quando = d.createdAt || (d.date ? d.date + 'T12:00:00-03:00' : new Date().toISOString());
    const comum = {
      tipo: 'baixa', sinal: -1, tipo_baixa: d.tipo || 'outro', motivo: d.obs || null,
      data_mov: new Date(quando).toISOString(), criado_por: d.resp || 'Migração',
      ref_tipo: 'desperdicio_legado', ref_id: String(d.id),
    };
    let partes = [];
    if (d.itemId) {
      const item = items.find(i => i.id === d.itemId);
      if (item) partes = [{ item, qtd: d.qty, custo: d.qty ? (d.custo || 0) / d.qty : item.cost }];
    } else if (d.origem === 'produto') {
      partes = _estExpandirDesperdicioProduto(d).map(x => ({ ...x, custo: x.item.cost }));
    }
    const grupoId = partes.length > 1 ? crypto.randomUUID() : null;
    for (const p of partes) {
      if (!(p.qtd > 0)) continue;
      rows.push(_estMovRow(p.item, {
        ...comum, qtd: _estRound(p.qtd), custo_unit: p.custo || 0,
        local_origem: estLocalSaida(p.item) || EST_SEM_LOCAL,
        grupo_id: grupoId, produto_nome: d.origem === 'produto' ? d.nome : null,
      }));
    }
  }
  if (!rows.length) return 0;
  // item.qty já foi baixado na época pelo módulo antigo
  await estInserirMovs(rows, { aplicarLegado: false });
  return new Set(rows.map(r => r.ref_id)).size;
}

// Desperdício antigo de pizza guardava o tipo (PIZZA_TIPOS) e os sabores do
// cadastro velho — resolve para base + opções atuais pelo nome.
function _estExpandirDesperdicioProduto(d) {
  if (d.prodId) return estExpandirProduto({ produtoId: d.prodId, qtd: d.qty || 1 });
  const t = typeof PIZZA_TIPOS !== 'undefined' ? PIZZA_TIPOS.find(x => x.id === d.tipoId) : null;
  if (!t) return [];
  const tam  = t.grande ? 'grande' : 'pequena';
  const base = produtosPizza.find(b => b.tamanho === tam && (!t.id.endsWith('_doc') || b.categoria === 'doce'))
            || produtosPizza.find(b => new RegExp(tam, 'i').test(b.nome));
  const resolver = sabId => {
    const s = (typeof sabores !== 'undefined' ? sabores : []).find(x => x.id === sabId);
    if (!s || typeof _cwRank !== 'function') return null;
    const c = _cwRank(s.name.replace(/^1\/2\s+/i, ''), opcoes, 'nome', 1)[0];
    return c && c.s >= 0.6 ? c.x.id : null;
  };
  const s1 = resolver(d.sab1Id), s2 = t.grande ? resolver(d.sab2Id) : null;
  const saborIds = t.grande ? [s1, s2 ?? s1].filter(Boolean) : [s1].filter(Boolean);
  return estExpandirProduto({ baseId: base?.id, saborIds, qtd: d.qty || 1 });
}

// ══════════════════════════════════════════════════════════════
// ABA MOVIMENTAÇÕES
// ══════════════════════════════════════════════════════════════

let _estMovFil = { tipo: '', tipoBaixa: '', local: '', q: '', excluidas: false };
let _estMovAbertos = new Set();
let _estMovDados = null;   // { chave, movs, debitos, nums }
let _estMovLimite = 150;

async function estRenderAbaMov(forcar = false) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  if (!_per('estmov').de) _perSetPresetSilencioso('estmov', 'semana');
  const { inicioISO, fimISO } = _perRange('estmov');
  const chave = inicioISO + '|' + fimISO + '|' + _estMovFil.excluidas;

  if (!_estMovDados || _estMovDados.chave !== chave || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">
      ${lc('refresh-cw', 16, 'currentColor')} Carregando movimentações…</div>`;
    try {
      const migrados = await estMigrarDesperdicioLegado().catch(e => { console.warn('[estoque] migração desperdício:', e); return 0; });
      if (migrados) toast(`${migrados} registro(s) do antigo Desperdício agora estão nas Movimentações como Baixa`, 'ok');
      const [movs, debitos] = await Promise.all([
        estBuscarMovimentacoes({ desde: inicioISO, ate: fimISO, incluirExcluidas: _estMovFil.excluidas }),
        estBuscarDebitos(inicioISO, fimISO),
      ]);
      const nums = await _estNumerosPedidos(debitos.map(d => d.pedidoId));
      _estMovDados = { chave, movs, debitos, nums };
    } catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:var(--text-md)">
        Não consegui carregar as movimentações: ${_estEsc(e.message)}<br>
        <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="estRenderAbaMov(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('estAbaBody')) return;
  _estRenderMovConteudo();
}

function _perSetPresetSilencioso(ns, id) {
  const s = _per(ns);
  const p = _perPresets().find(x => x.id === id); if (!p) return;
  s.modo = id; s.de = p.de; s.ate = p.ate;
}

async function _estNumerosPedidos(ids) {
  const nums = {};
  const lista = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < lista.length; i += 300) {
    const { data } = await _estSb().from('cw_pedidos').select('id, display_id').in('id', lista.slice(i, i + 300));
    (data || []).forEach(p => { nums[p.id] = p.display_id; });
  }
  return nums;
}

// Entradas da lista: vendas (1 por pedido), grupos (baixa de produto) e movs soltas
function _estMovEntradas() {
  const { movs, debitos, nums } = _estMovDados;
  const f = _estMovFil;
  const q = f.q.trim().toLowerCase();
  const casaItem = nome => !q || (nome || '').toLowerCase().includes(q);
  const out = [];

  if (!f.tipo || f.tipo === 'venda') {
    for (const p of debitos) {
      let itens = Object.entries(p.itens).map(([id, qtd]) => {
        const item = items.find(i => i.id === Number(id));
        return item ? { item, qtd, local: estLocalSaida(item), valor: qtd * (item.cost || 0) } : null;
      }).filter(Boolean);
      if (f.local) itens = itens.filter(x => x.local === f.local);
      if (!itens.length) continue;
      if (q && !itens.some(x => casaItem(x.item.name)) && !p.produtos.some(casaItem)) continue;
      out.push({ kind: 'venda', id: 'p' + p.pedidoId, ts: p.ts, p, num: nums[p.pedidoId], itens,
                 valor: itens.reduce((s, x) => s + x.valor, 0) });
    }
  }

  const grupos = new Map();
  for (const m of movs) {
    if (f.tipo && f.tipo !== 'venda' && m.tipo !== f.tipo) continue;
    if (f.tipo === 'venda') continue;
    if (f.tipoBaixa && m.tipo_baixa !== f.tipoBaixa) continue;
    if (f.local && m.local_origem !== f.local && m.local_destino !== f.local) continue;
    if (!casaItem(m.item_nome) && !casaItem(m.produto_nome)) continue;
    const g = m.grupo_id && m.produto_nome ? m.grupo_id : null;
    if (g) {
      if (!grupos.has(g)) { const e = { kind: 'grupo', id: 'g' + g, ts: m.data_mov, movs: [] }; grupos.set(g, e); out.push(e); }
      grupos.get(g).movs.push(m);
    } else {
      out.push({ kind: 'mov', id: 'm' + m.id, ts: m.data_mov, m });
    }
  }
  out.sort((a, b) => _estMs(b.ts) - _estMs(a.ts));
  return out;
}

const _estDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function _estSelo(tipo, extra = '') {
  const t = EST_MOV_TIPOS[tipo] || { label: tipo, cor: 'var(--text2)', bg: 'var(--surface2)', icon: 'circle' };
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:var(--text-xs);font-weight:700;white-space:nowrap;background:${t.bg};color:${t.cor}">
    ${lc(t.icon, 12, 'currentColor')} ${t.label}${extra}</span>`;
}

const _estTipoBaixaLabel = id => (typeof TIPOS_DESPERDICIO !== 'undefined' ? TIPOS_DESPERDICIO.find(t => t.id === id)?.label : null) || id || '';

function _estQtdSinal(m) {
  if (m.tipo === 'transferencia') return `${_estQ(m.qtd)} ${_estEsc(m.unidade || '')}`;
  const s = m.sinal > 0 ? '+' : '−';
  return `<span style="color:${m.sinal > 0 ? 'var(--success-fg)' : 'var(--danger-fg)'};font-weight:700">${s}${_estQ(m.qtd)}</span> ${_estEsc(m.unidade || '')}`;
}

function _estLocalMov(m) {
  if (m.tipo === 'transferencia') return `${_estEsc(estLocalLabel(m.local_origem))} → ${_estEsc(estLocalLabel(m.local_destino))}`;
  const l = m.sinal > 0 ? m.local_destino : m.local_origem;
  return l === EST_SEM_LOCAL ? '<span style="color:var(--muted)">sem local</span>' : _estEsc(estLocalLabel(l));
}

function _estRenderMovConteudo() {
  const el = document.getElementById('estAbaBody');
  if (!el || !_estMovDados) return;
  const f = _estMovFil;
  const entradas = _estMovEntradas();
  const visiveis = entradas.slice(0, _estMovLimite);

  // KPIs do período (sobre o que está filtrado)
  let vEnt = 0, vBaixa = 0, vVenda = 0, nPed = 0, nTransf = 0;
  for (const e of entradas) {
    if (e.kind === 'venda') { vVenda += e.valor; nPed++; continue; }
    for (const m of (e.kind === 'grupo' ? e.movs : [e.m])) {
      if (m.excluido_em) continue;
      const v = (Number(m.qtd) || 0) * (Number(m.custo_unit) || 0);
      if (['recebimento', 'producao', 'entrada_manual'].includes(m.tipo)) vEnt += v;
      else if (m.tipo === 'baixa') vBaixa += v;
      else if (m.tipo === 'transferencia') nTransf++;
    }
  }
  const kpi = (titulo, valor, sub, cor = 'var(--text)') => `
    <div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:14px 18px">
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${titulo}</div>
      <div style="font-size:var(--text-2xl);font-weight:800;color:${cor};margin-top:4px">${valor}</div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${sub}</div>
    </div>`;

  const locais = estLocaisEstoque();
  const th = (txt, align = 'left') => `<th style="text-align:${align};padding:11px 12px;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${txt}</th>`;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      ${_perRenderBar('estmov', 'estRenderAbaMov')}
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="estAbrirEntrada()">${lc('plus-circle', 14, 'currentColor')} Entrada</button>
        <button class="btn btn-outline btn-sm" onclick="estAbrirProducao()">${lc('chef-hat', 14, 'currentColor')} Produção</button>
        <button class="btn btn-outline btn-sm" onclick="estAbrirTransferencia()">${lc('repeat', 14, 'currentColor')} Transferência</button>
        <button class="btn btn-primary btn-sm" onclick="estAbrirBaixa()">${lc('minus-circle', 14, '#fff')} Baixa</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
      ${kpi('Entradas', _estR(vEnt), 'compras, produção e manuais', 'var(--info-fg)')}
      ${kpi('Vendas (débito automático)', _estR(vVenda), `${nPed} pedido(s) · a custo`, 'var(--success-fg)')}
      ${kpi('Baixas', _estR(vBaixa), 'saídas sem venda, a custo', 'var(--danger-fg)')}
      ${kpi('Transferências', nTransf, 'entre locais, sem valor')}
    </div>

    <div class="card" style="margin-bottom:0">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1.5px solid var(--border)">
        <input class="inp" id="estMovBusca" placeholder="Buscar item ou produto…" value="${_estEsc(f.q)}" style="flex:1;min-width:200px;max-width:320px;font-size:var(--text-md)"
          oninput="_estMovFil.q=this.value;clearTimeout(window._estMovQT);window._estMovQT=setTimeout(()=>{window._estMovFoco=true;_estRenderMovConteudo()},200)">
        <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_estMovFil.tipo=this.value;_estMovFil.tipoBaixa='';_estRenderMovConteudo()">
          <option value="">Todos os tipos</option>
          ${Object.entries(EST_MOV_TIPOS).map(([id, t]) => `<option value="${id}"${f.tipo === id ? ' selected' : ''}>${t.label}</option>`).join('')}
        </select>
        ${f.tipo === 'baixa' ? `<select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_estMovFil.tipoBaixa=this.value;_estRenderMovConteudo()">
          <option value="">Todos os tipos de baixa</option>
          ${TIPOS_DESPERDICIO.map(t => `<option value="${t.id}"${f.tipoBaixa === t.id ? ' selected' : ''}>${_estEsc(t.label)}</option>`).join('')}
        </select>` : ''}
        <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_estMovFil.local=this.value;_estRenderMovConteudo()">
          <option value="">Todos os locais</option>
          ${locais.map(l => `<option value="${l.id}"${f.local === l.id ? ' selected' : ''}>${_estEsc(l.label)}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);cursor:pointer;white-space:nowrap">
          <input type="checkbox" ${f.excluidas ? 'checked' : ''} onchange="_estMovFil.excluidas=this.checked;estRenderAbaMov()" style="accent-color:var(--purple)"> Mostrar excluídas
        </label>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="estRenderAbaMov(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
          <thead style="background:var(--surface2)"><tr>
            ${th('Tipo')}${th('Item')}${th('Local')}${th('Qtd', 'right')}${th('Custo un.', 'right')}${th('Valor', 'right')}${th('Data')}${th('Descrição')}${th('Usuário')}${th('', 'right')}
          </tr></thead>
          <tbody>${visiveis.length ? visiveis.map(_estMovLinhaHtml).join('') : `<tr><td colspan="10" style="padding:44px;text-align:center;color:var(--muted)">Nenhuma movimentação no período com esses filtros</td></tr>`}</tbody>
        </table>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1.5px solid var(--border);font-size:var(--text-xs);color:var(--muted)">
        ${visiveis.length} de ${entradas.length} registro(s)
        ${entradas.length > visiveis.length ? `<button class="btn btn-ghost btn-xs" onclick="_estMovLimite+=150;_estRenderMovConteudo()">Mostrar mais</button>` : ''}
      </div>
    </div>`;

  if (window._estMovFoco) {
    window._estMovFoco = false;
    const b = document.getElementById('estMovBusca');
    if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  }
}

function _estMovToggle(id) {
  _estMovAbertos.has(id) ? _estMovAbertos.delete(id) : _estMovAbertos.add(id);
  _estRenderMovConteudo();
}

function _estMovLinhaHtml(e) {
  const td = (html, extra = '') => `<td style="padding:11px 12px;${extra}">${html}</td>`;
  const aberto = _estMovAbertos.has(e.id);
  const chev = `<span style="display:inline-flex;transition:transform .15s;transform:rotate(${aberto ? 90 : 0}deg)">${lc('chevron-right', 13, 'var(--muted)')}</span>`;
  const sub = (cells) => `<tr style="background:var(--surface2)">${cells}</tr>`;

  if (e.kind === 'venda') {
    const p = e.p;
    const produtos = p.produtos.slice(0, 2).join(', ') + (p.produtos.length > 2 ? ` +${p.produtos.length - 2}` : '');
    let html = `<tr onclick="_estMovToggle('${e.id}')" style="border-top:1px solid var(--border);cursor:pointer">
      ${td(_estSelo('venda'))}
      ${td(`<div style="display:flex;align-items:center;gap:6px">${chev}<strong>Pedido ${e.num ? '#' + e.num : ''}</strong></div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-left:19px">${_estEsc(produtos)}</div>`)}
      ${td((() => { const ls = [...new Set(e.itens.map(x => x.local))]; return ls.length === 1 ? _estEsc(estLocalLabel(ls[0])) : `<span style="color:var(--muted)">${ls.length} locais</span>`; })(), 'font-size:var(--text-sm)')}
      ${td(`${e.itens.length} item(ns)`, 'text-align:right;white-space:nowrap')}
      ${td('—', 'text-align:right;color:var(--muted)')}
      ${td(_estR(e.valor), 'text-align:right;white-space:nowrap')}
      ${td(_estDH(e.ts), 'white-space:nowrap;font-size:var(--text-sm)')}
      ${td(`Venda de produto${p.canal ? ' · ' + _estEsc(p.canal) : ''}`, 'font-size:var(--text-sm);color:var(--text2)')}
      ${td('<span style="color:var(--muted)">Automático</span>', 'font-size:var(--text-sm)')}
      ${td('')}
    </tr>`;
    if (aberto) html += e.itens.sort((a, b) => b.valor - a.valor).map(x => sub(
      td('') + td(`<span style="margin-left:19px">${_estEsc(x.item.name)}</span>${x.item.isProd ? ' <span class="badge b-orange" style="font-size:var(--text-2xs)">Processado</span>' : ''}`, 'font-size:var(--text-sm)')
      + td(_estEsc(estLocalLabel(x.local)), 'font-size:var(--text-sm);color:var(--text2)')
      + td(`<span style="color:var(--danger-fg);font-weight:700">−${_estQ(x.qtd)}</span> ${_estEsc(x.item.unit)}`, 'text-align:right;white-space:nowrap;font-size:var(--text-sm)')
      + td(x.item.cost ? _estR(x.item.cost) : '—', 'text-align:right;font-size:var(--text-sm)')
      + td(_estR(x.valor), 'text-align:right;font-size:var(--text-sm)')
      + td('') + td('') + td('') + td(''))).join('');
    return html;
  }

  if (e.kind === 'grupo') {
    const ms = e.movs, m0 = ms[0];
    const excl = ms.every(m => m.excluido_em);
    const valor = ms.reduce((s, m) => s + (Number(m.qtd) || 0) * (Number(m.custo_unit) || 0), 0);
    let html = `<tr onclick="_estMovToggle('${e.id}')" style="border-top:1px solid var(--border);cursor:pointer;${excl ? 'opacity:.55;text-decoration:line-through' : ''}">
      ${td(_estSelo(m0.tipo))}
      ${td(`<div style="display:flex;align-items:center;gap:6px">${chev}<strong>${_estEsc(m0.produto_nome)}</strong></div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-left:19px">Produto · ${ms.length} insumo(s)/processado(s)</div>`)}
      ${td(_estLocalMov(m0), 'font-size:var(--text-sm)')}
      ${td(`${ms.length} item(ns)`, 'text-align:right;white-space:nowrap')}
      ${td('—', 'text-align:right;color:var(--muted)')}
      ${td(_estR(valor), 'text-align:right;white-space:nowrap')}
      ${td(_estDH(m0.data_mov), 'white-space:nowrap;font-size:var(--text-sm)')}
      ${td(_estDescMov(m0), 'font-size:var(--text-sm);color:var(--text2)')}
      ${td(_estUsuarioMov(m0), 'font-size:var(--text-sm)')}
      ${td(excl ? '' : _estAcoesHtml(`'${m0.grupo_id}'`, true), 'text-align:right;white-space:nowrap')}
    </tr>`;
    if (aberto) html += ms.map(m => sub(
      td('') + td(`<span style="margin-left:19px">${_estEsc(m.item_nome)}</span>`, 'font-size:var(--text-sm)')
      + td(_estLocalMov(m), 'font-size:var(--text-sm);color:var(--text2)')
      + td(_estQtdSinal(m), 'text-align:right;white-space:nowrap;font-size:var(--text-sm)')
      + td(m.custo_unit ? _estR(m.custo_unit) : '—', 'text-align:right;font-size:var(--text-sm)')
      + td(_estR((Number(m.qtd) || 0) * (Number(m.custo_unit) || 0)), 'text-align:right;font-size:var(--text-sm)')
      + td('') + td('') + td('') + td(''))).join('');
    return html;
  }

  const m = e.m;
  const excl = !!m.excluido_em;
  const valor = m.tipo === 'transferencia' ? null : (Number(m.qtd) || 0) * (Number(m.custo_unit) || 0);
  return `<tr style="border-top:1px solid var(--border);${excl ? 'opacity:.55' : ''}">
    ${td(_estSelo(m.tipo))}
    ${td(`<span style="font-weight:600;${excl ? 'text-decoration:line-through' : ''}">${_estEsc(m.item_nome)}</span>
          ${m.item_tipo === 'preparado' ? ' <span class="badge b-orange" style="font-size:var(--text-2xs)">Processado</span>' : ''}`)}
    ${td(_estLocalMov(m), 'font-size:var(--text-sm)')}
    ${td(_estQtdSinal(m), 'text-align:right;white-space:nowrap')}
    ${td(m.custo_unit ? _estR(m.custo_unit) : '—', 'text-align:right;white-space:nowrap')}
    ${td(valor === null ? '<span style="color:var(--muted)">—</span>' : _estR(valor), 'text-align:right;white-space:nowrap')}
    ${td(_estDH(m.data_mov), 'white-space:nowrap;font-size:var(--text-sm)')}
    ${td(_estDescMov(m), 'font-size:var(--text-sm);color:var(--text2);max-width:280px')}
    ${td(_estUsuarioMov(m), 'font-size:var(--text-sm)')}
    ${td(excl ? `<span style="font-size:var(--text-xs);color:var(--danger-fg)">excluída por ${_estEsc(m.excluido_por || '')}</span>` : _estAcoesHtml(`'${m.id}'`, false), 'text-align:right;white-space:nowrap')}
  </tr>`;
}

function _estDescMov(m) {
  const partes = [];
  if (m.tipo === 'baixa' && m.tipo_baixa) partes.push(`<strong>${_estEsc(_estTipoBaixaLabel(m.tipo_baixa))}</strong>`);
  if (m.motivo) partes.push(_estEsc(m.motivo));
  if (m.ref_tipo === 'desperdicio_legado') partes.push('<span style="color:var(--muted)">(do antigo Desperdício)</span>');
  return partes.join(' · ') || '<span style="color:var(--muted)">—</span>';
}

function _estUsuarioMov(m) {
  const editado = m.atualizado_por && m.updated_at && _estMs(m.updated_at) - _estMs(m.created_at) > 2000;
  return `${_estEsc(m.criado_por || '—')}${editado ? `<div style="font-size:var(--text-2xs);color:var(--muted)">editado por ${_estEsc(m.atualizado_por)}</div>` : ''}`;
}

function _estAcoesHtml(idJs, grupo) {
  const b = (icon, title, fn, cor = 'var(--muted)') => `<button onclick="event.stopPropagation();${fn}" title="${title}"
    style="background:none;border:none;cursor:pointer;padding:5px;border-radius:6px;line-height:0;color:${cor}">${lc(icon, 14, 'currentColor')}</button>`;
  return (grupo ? '' : b('edit-2', 'Editar', `estEditarMovModal(${idJs})`))
    + b('clock', 'Histórico', `estHistoricoMov(${idJs}, ${grupo})`)
    + b('trash-2', 'Excluir', `estExcluirMovConfirmar(${idJs}, ${grupo})`, 'var(--danger-fg)');
}

// ══════════════════════════════════════════════════════════════
// POPUPS
// ══════════════════════════════════════════════════════════════

function _estModal(id, titulo, corpo, salvarFn, salvarLabel = 'Salvar', largura = 560) {
  document.getElementById(id)?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = id;
  ov.innerHTML = `<div class="modal" style="width:${largura}px;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);display:flex;flex-direction:column;padding:0" onclick="event.stopPropagation()">
    <div style="padding:20px 24px 0;font-size:var(--text-lg);font-weight:800">${titulo}</div>
    <div id="${id}-body" style="padding:16px 24px;overflow-y:auto;flex:1">${corpo}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 24px;border-top:1px solid var(--border)">
      <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Cancelar</button>
      <button class="btn btn-primary" id="${id}-salvar" onclick="${salvarFn}">${salvarLabel}</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  return ov;
}

function _estAgora() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const _estLerData = id => { const v = document.getElementById(id)?.value; return v ? new Date(v).toISOString() : new Date().toISOString(); };

// <select> de item agrupado por categoria
function _estOptsItens(filtro, selId) {
  const porCat = {};
  items.filter(i => i.active !== false && filtro(i)).forEach(i => { (porCat[i.cat || 'Outros'] ||= []).push(i); });
  return `<option value="">Selecionar…</option>` + Object.keys(porCat).sort().map(c =>
    `<optgroup label="${_estEsc(c)}">${porCat[c].sort((a, b) => a.name.localeCompare(b.name)).map(i =>
      `<option value="${i.id}"${i.id === selId ? ' selected' : ''}>${_estEsc(i.name)} (${_estEsc(i.unit)})</option>`).join('')}</optgroup>`).join('');
}

function _estOptsLocais(sel, incluirSem = false) {
  return estLocaisEstoque().map(l => `<option value="${l.id}"${l.id === sel ? ' selected' : ''}>${_estEsc(l.label)}</option>`).join('')
    + (incluirSem ? `<option value="${EST_SEM_LOCAL}"${sel === EST_SEM_LOCAL ? ' selected' : ''}>Sem local</option>` : '');
}

const _estCampo = (label, html, extra = '') => `<div class="field" style="${extra}"><label>${label}</label>${html}</div>`;

async function _estSalvarComBotao(id, fn) {
  const btn = document.getElementById(id + '-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    await fn();
    document.getElementById(id)?.remove();
    _estMovDados = null;
    if (_estCpAba === 'movimentacoes') estRenderAbaMov(true);
    else if (_estCpAba === 'estoque') estRenderAbaEstoque(true);
  } catch (e) {
    toast('Não consegui salvar: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

function _estItemDoSelect(selId) {
  const id = parseInt(document.getElementById(selId)?.value);
  return items.find(i => i.id === id) || null;
}

// Ao trocar o item, sugere o local de entrada/saída dele
function _estSugerirLocal(selItem, selLocal, campo) {
  const item = _estItemDoSelect(selItem);
  const loc = document.getElementById(selLocal);
  if (!item || !loc) return;
  const l = campo === 'saida' ? estLocalSaida(item) : estLocalEntrada(item);
  if ([...loc.options].some(o => o.value === l)) loc.value = l;
  const un = document.getElementById(selItem + '-un');
  if (un) un.textContent = item.unit || '';
}

// ── Entrada manual ──
function estAbrirEntrada() {
  _estModal('ovEstEntrada', 'Entrada manual', `
    <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:12px">Entrada sem compra (ex.: doação, devolução, ajuste). Compras entram sozinhas ao concluir o recebimento.</div>
    ${_estCampo('Item *', `<select class="inp" id="eeItem" onchange="_estSugerirLocal('eeItem','eeLocal','entrada');const it=_estItemDoSelect('eeItem');if(it)document.getElementById('eeCusto').value=it.cost||''">${_estOptsItens(() => true)}</select>`)}
    <div class="f2">
      ${_estCampo('Local *', `<select class="inp" id="eeLocal">${_estOptsLocais('', true)}</select>`)}
      ${_estCampo('Quantidade * <span id="eeItem-un" style="text-transform:none"></span>', `<input class="inp" type="number" id="eeQtd" min="0" step="0.001">`)}
    </div>
    <div class="f2">
      ${_estCampo('Custo unitário (R$)', `<input class="inp" type="number" id="eeCusto" min="0" step="0.01">`)}
      ${_estCampo('Data e hora', `<input class="inp" type="datetime-local" id="eeData" value="${_estAgora()}">`)}
    </div>
    ${_estCampo('Motivo', `<input class="inp" id="eeMotivo" placeholder="ex: devolução do fornecedor">`)}`,
    '_estSalvarEntrada()', 'Registrar entrada');
}
function _estSalvarEntrada() {
  const item = _estItemDoSelect('eeItem');
  const qtd  = parseFloat(document.getElementById('eeQtd').value);
  if (!item) return toast('Selecione o item', 'err');
  if (!(qtd > 0)) return toast('Informe a quantidade', 'err');
  _estSalvarComBotao('ovEstEntrada', () => estInserirMovs([_estMovRow(item, {
    tipo: 'entrada_manual', sinal: 1, qtd: _estRound(qtd),
    local_destino: document.getElementById('eeLocal').value || EST_SEM_LOCAL,
    custo_unit: parseFloat(document.getElementById('eeCusto').value) || item.cost || 0,
    motivo: document.getElementById('eeMotivo').value.trim() || null,
    data_mov: _estLerData('eeData'),
  })]).then(() => toast('Entrada registrada', 'ok')));
}

// ── Produção ──
function estAbrirProducao() {
  _estModal('ovEstProd', 'Produção de processado', `
    <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:12px">Entrada do que a produção fez (ex.: 4 kg de Mussarela Triturada). Os insumos crus usados saem na contagem.</div>
    ${_estCampo('Processado *', `<select class="inp" id="epItem" onchange="_estSugerirLocal('epItem','epLocal','entrada')">${_estOptsItens(i => i.isProd)}</select>`)}
    <div class="f2">
      ${_estCampo('Local *', `<select class="inp" id="epLocal">${_estOptsLocais('', true)}</select>`)}
      ${_estCampo('Quantidade produzida * <span id="epItem-un" style="text-transform:none"></span>', `<input class="inp" type="number" id="epQtd" min="0" step="0.001">`)}
    </div>
    ${_estCampo('Data e hora', `<input class="inp" type="datetime-local" id="epData" value="${_estAgora()}">`)}
    ${_estCampo('Observação', `<input class="inp" id="epObs" placeholder="opcional">`)}`,
    '_estSalvarProducao()', 'Registrar produção');
}
function _estSalvarProducao() {
  const item = _estItemDoSelect('epItem');
  const qtd  = parseFloat(document.getElementById('epQtd').value);
  if (!item) return toast('Selecione o processado', 'err');
  if (!(qtd > 0)) return toast('Informe a quantidade', 'err');
  _estSalvarComBotao('ovEstProd', () => estInserirMovs([_estMovRow(item, {
    tipo: 'producao', sinal: 1, qtd: _estRound(qtd),
    local_destino: document.getElementById('epLocal').value || EST_SEM_LOCAL,
    motivo: document.getElementById('epObs').value.trim() || null,
    data_mov: _estLerData('epData'),
  })]).then(() => toast('Produção registrada', 'ok')));
}

// ── Transferência ──
function estAbrirTransferencia() {
  _estModal('ovEstTransf', 'Transferência entre locais', `
    <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:12px">Ex.: a gráfica entregou 500 caixas na loja. Sai de um local e entra no outro numa operação só — sem compra e sem valor financeiro.</div>
    ${_estCampo('Item *', `<select class="inp" id="etItem" onchange="_estSugerirLocal('etItem','etDe','entrada');_estSugerirLocal('etItem','etPara','saida')">${_estOptsItens(() => true)}</select>`)}
    <div class="f2">
      ${_estCampo('De *', `<select class="inp" id="etDe">${_estOptsLocais('')}</select>`)}
      ${_estCampo('Para *', `<select class="inp" id="etPara">${_estOptsLocais('')}</select>`)}
    </div>
    <div class="f2">
      ${_estCampo('Quantidade * <span id="etItem-un" style="text-transform:none"></span>', `<input class="inp" type="number" id="etQtd" min="0" step="0.001">`)}
      ${_estCampo('Data e hora', `<input class="inp" type="datetime-local" id="etData" value="${_estAgora()}">`)}
    </div>
    ${_estCampo('Motivo', `<input class="inp" id="etMotivo" placeholder="ex: reposição quinzenal">`)}`,
    '_estSalvarTransf()', 'Transferir');
}
function _estSalvarTransf() {
  const item = _estItemDoSelect('etItem');
  const qtd  = parseFloat(document.getElementById('etQtd').value);
  const de = document.getElementById('etDe').value, para = document.getElementById('etPara').value;
  if (!item) return toast('Selecione o item', 'err');
  if (!(qtd > 0)) return toast('Informe a quantidade', 'err');
  if (!de || !para || de === para) return toast('Escolha locais de origem e destino diferentes', 'err');
  _estSalvarComBotao('ovEstTransf', () => estInserirMovs([_estMovRow(item, {
    tipo: 'transferencia', sinal: 0, qtd: _estRound(qtd), local_origem: de, local_destino: para,
    motivo: document.getElementById('etMotivo').value.trim() || null, data_mov: _estLerData('etData'),
  })]).then(() => {
    // Item passa a ficar guardado também no destino (aparece na contagem dele)
    if (!(item.locais || []).includes(para)) { item.locais = [...new Set([...(item.locais || []), para])]; saveI(); }
    toast('Transferência registrada', 'ok');
  }));
}

// ── Baixa ──
let _estBx = { origem: 'insumo' };

function estAbrirBaixa(origem = 'insumo') {
  _estBx = { origem };
  _estModal('ovEstBaixa', 'Registrar baixa', '', '_estSalvarBaixa()', 'Registrar baixa', 600);
  _estBaixaRender();
}

function _estBaixaSet(campo, v) {
  // guarda o que já foi digitado antes de redesenhar
  ['ebQtd', 'ebMotivo', 'ebData', 'ebTipo'].forEach(id => { const el = document.getElementById(id); if (el) _estBx[id] = el.value; });
  _estBx[campo] = v;
  _estBaixaRender();
}

function _estBaixaRender() {
  const body = document.getElementById('ovEstBaixa-body');
  if (!body) return;
  const b = _estBx;
  const pill = (id, txt, desc) => `<button type="button" onclick="_estBaixaSet('origem','${id}')"
    style="flex:1;padding:10px;border-radius:var(--r8);cursor:pointer;font-family:inherit;text-align:left;
    border:1.5px solid ${b.origem === id ? 'var(--purple)' : 'var(--border)'};background:${b.origem === id ? 'var(--purple-xlight)' : 'var(--surface)'}">
    <div style="font-size:var(--text-sm);font-weight:700;color:${b.origem === id ? 'var(--purple)' : 'var(--text)'}">${txt}</div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${desc}</div></button>`;

  let alvo = '';
  if (b.origem === 'produto') {
    const bases = produtosPizza.filter(x => x.active !== false);
    const base  = bases.find(x => x.id === b.baseId);
    const sabs  = opcoes.filter(o => o.active !== false && (!base || !o.categoria || o.categoria === base.categoria))
                        .sort((x, y) => x.nome.localeCompare(y.nome));
    const optSab = sel => `<option value="">Selecionar…</option>` + sabs.map(o => `<option value="${o.id}"${o.id === sel ? ' selected' : ''}>${_estEsc(o.nome)}</option>`).join('');
    const avulsos = produtos.filter(p => p.active !== false && p.fichaTecnica?.ingredientes?.length);
    alvo = `
      ${_estCampo('Produto *', `<select class="inp" onchange="const v=this.value;_estBx.baseId=v.startsWith('b')?+v.slice(1):null;_estBx.produtoId=v.startsWith('p')?+v.slice(1):null;_estBaixaSet('_','')">
        <option value="">Selecionar…</option>
        <optgroup label="Pizza">${bases.map(x => `<option value="b${x.id}"${b.baseId === x.id ? ' selected' : ''}>${_estEsc(x.nome)}</option>`).join('')}</optgroup>
        ${avulsos.length ? `<optgroup label="Outros produtos">${avulsos.map(p => `<option value="p${p.id}"${b.produtoId === p.id ? ' selected' : ''}>${_estEsc(p.name)}</option>`).join('')}</optgroup>` : ''}
      </select>`)}
      ${base ? (base.tamanho === 'grande' ? `<div class="f2">
          ${_estCampo('1ª metade *', `<select class="inp" onchange="_estBaixaSet('s1',+this.value||null)">${optSab(b.s1)}</select>`)}
          ${_estCampo('2ª metade', `<select class="inp" onchange="_estBaixaSet('s2',+this.value||null)">${optSab(b.s2)}</select>`, '')}
        </div><div style="font-size:var(--text-xs);color:var(--muted);margin:-6px 0 10px">Deixe a 2ª metade vazia se a pizza era inteira de um sabor só.</div>`
        : _estCampo('Sabor *', `<select class="inp" onchange="_estBaixaSet('s1',+this.value||null)">${optSab(b.s1)}</select>`)) : ''}`;
  } else {
    const filtro = b.origem === 'preparado' ? (i => i.isProd) : (i => !i.isProd);
    alvo = `<div class="f2">
      ${_estCampo(b.origem === 'preparado' ? 'Processado *' : 'Insumo *', `<select class="inp" id="ebItem" onchange="_estBx.itemId=+this.value||null;_estSugerirLocal('ebItem','ebLocal','saida')">${_estOptsItens(filtro, b.itemId)}</select>`)}
      ${_estCampo('Local *', `<select class="inp" id="ebLocal">${_estOptsLocais(b.itemId ? estLocalSaida(items.find(i => i.id === b.itemId)) : '', true)}</select>`)}
    </div>`;
  }

  // Prévia do que vai sair (produto)
  let previa = '';
  if (b.origem === 'produto') {
    const partes = _estBaixaPartes(parseFloat(b.ebQtd) || 1);
    if (partes.length) {
      const total = partes.reduce((s, x) => s + x.qtd * (x.item.cost || 0), 0);
      previa = `<div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:12px">
        <div style="padding:8px 12px;background:var(--surface2);font-size:var(--text-xs);font-weight:700;color:var(--text2);display:flex;justify-content:space-between">
          <span>Vai sair do estoque (${partes.length} itens)</span><span>Custo ${_estR(total)}</span></div>
        <div style="max-height:180px;overflow-y:auto">${partes.sort((x, y) => y.qtd * (y.item.cost || 0) - x.qtd * (x.item.cost || 0)).map(x => `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 12px;border-top:1px solid var(--border);font-size:var(--text-sm)">
            <span>${_estEsc(x.item.name)}</span><span style="color:var(--danger-fg);white-space:nowrap">−${_estQ(x.qtd)} ${_estEsc(x.item.unit)}</span></div>`).join('')}</div>
      </div>`;
    }
  }

  body.innerHTML = `
    <div class="field"><label>O que saiu</label>
      <div style="display:flex;gap:8px">
        ${pill('insumo', 'Insumo', 'comprado ou in natura')}
        ${pill('preparado', 'Processado', 'feito pela produção')}
        ${pill('produto', 'Produto', 'pizza pronta — baixa tudo pela ficha')}
      </div></div>
    ${alvo}
    <div class="f2">
      ${_estCampo(b.origem === 'produto' ? 'Quantidade (unidades) *' : 'Quantidade *', `<input class="inp" type="number" id="ebQtd" min="0" step="${b.origem === 'produto' ? 1 : 0.001}" value="${b.ebQtd ?? (b.origem === 'produto' ? 1 : '')}"
        ${b.origem === 'produto' ? `oninput="clearTimeout(window._ebT);window._ebT=setTimeout(()=>_estBaixaSet('_',''),300)"` : ''}>`)}
      ${_estCampo('Tipo de baixa *', `<select class="inp" id="ebTipo">${TIPOS_DESPERDICIO.map(t => `<option value="${t.id}"${b.ebTipo === t.id ? ' selected' : ''}>${_estEsc(t.label)}</option>`).join('')}</select>`)}
    </div>
    ${previa}
    <div class="f2">
      ${_estCampo('Data e hora', `<input class="inp" type="datetime-local" id="ebData" value="${b.ebData || _estAgora()}">`)}
      ${_estCampo('O que aconteceu', `<input class="inp" id="ebMotivo" value="${_estEsc(b.ebMotivo || '')}" placeholder="opcional">`)}
    </div>`;
  if (b.origem !== 'produto' && b.itemId) _estSugerirLocal('ebItem', 'ebLocal', 'saida');
}

function _estBaixaPartes(qtd) {
  const b = _estBx;
  if (b.produtoId) return estExpandirProduto({ produtoId: b.produtoId, qtd });
  const base = produtosPizza.find(x => x.id === b.baseId);
  if (!base || !b.s1) return [];
  const saborIds = base.tamanho === 'grande' ? [b.s1, b.s2 || b.s1] : [b.s1];
  return estExpandirProduto({ baseId: base.id, saborIds, qtd });
}

function _estSalvarBaixa() {
  const b = _estBx;
  const qtd   = parseFloat(document.getElementById('ebQtd').value);
  const tipo  = document.getElementById('ebTipo').value;
  const obs   = document.getElementById('ebMotivo').value.trim();
  const data  = _estLerData('ebData');
  if (!(qtd > 0)) return toast('Informe a quantidade', 'err');
  if (!tipo) return toast('Escolha o tipo de baixa', 'err');

  if (b.origem !== 'produto') {
    const item = _estItemDoSelect('ebItem');
    if (!item) return toast('Selecione o item', 'err');
    const local = document.getElementById('ebLocal').value || EST_SEM_LOCAL;
    return _estSalvarComBotao('ovEstBaixa', () => estRegistrarBaixaItem(item, qtd, tipo, { local, obs, data })
      .then(() => toast('Baixa registrada', 'ok')));
  }

  const partes = _estBaixaPartes(qtd);
  if (!partes.length) return toast('Escolha o produto e o sabor', 'err');
  const base = produtosPizza.find(x => x.id === b.baseId);
  const nome = b.produtoId ? produtos.find(p => p.id === b.produtoId)?.name
    : `${base.nome} · ${[b.s1, base.tamanho === 'grande' ? (b.s2 || b.s1) : null].filter(Boolean)
        .map(id => opcoes.find(o => o.id === id)?.nome).filter((v, i, a) => a.indexOf(v) === i).join(' + ')}`;
  const produtoNome = (qtd > 1 ? `${qtd}× ` : '') + nome;
  const grupoId = crypto.randomUUID();
  const rows = partes.map(x => _estMovRow(x.item, {
    tipo: 'baixa', sinal: -1, qtd: _estRound(x.qtd), tipo_baixa: tipo,
    local_origem: estLocalSaida(x.item) || EST_SEM_LOCAL, motivo: obs || null,
    grupo_id: grupoId, produto_nome: produtoNome, data_mov: data,
  }));
  const custo = partes.reduce((s, x) => s + x.qtd * (x.item.cost || 0), 0);
  _estSalvarComBotao('ovEstBaixa', () => estInserirMovs(rows).then(() => {
    _estEspelharBaixa({ grupoId, origem: 'produto', itemId: null, nome: produtoNome, unidade: 'un', qtd, tipo, custo, data, obs });
    toast('Baixa registrada', 'ok');
  }));
}

// ── Editar / excluir / histórico ──
function _estAcharMov(id) { return _estMovDados?.movs.find(m => m.id === id); }

function estEditarMovModal(id) {
  const m = _estAcharMov(id);
  if (!m) return;
  const dt = new Date(m.data_mov); dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  const loc = m.sinal > 0 ? 'local_destino' : 'local_origem';
  _estModal('ovEstEdit', `Editar ${EST_MOV_TIPOS[m.tipo]?.label.toLowerCase() || 'movimentação'}`, `
    <div style="font-size:var(--text-md);font-weight:700;margin-bottom:12px">${_estEsc(m.item_nome)}</div>
    <div class="f2">
      ${_estCampo(`Quantidade (${_estEsc(m.unidade || '')})`, `<input class="inp" type="number" id="emQtd" value="${m.qtd}" min="0" step="0.001">`)}
      ${_estCampo('Data e hora', `<input class="inp" type="datetime-local" id="emData" value="${dt.toISOString().slice(0, 16)}">`)}
    </div>
    ${m.tipo === 'transferencia' ? `<div class="f2">
        ${_estCampo('De', `<select class="inp" id="emDe">${_estOptsLocais(m.local_origem)}</select>`)}
        ${_estCampo('Para', `<select class="inp" id="emPara">${_estOptsLocais(m.local_destino)}</select>`)}</div>`
      : _estCampo('Local', `<select class="inp" id="emLocal">${_estOptsLocais(m[loc], true)}</select>`)}
    ${m.tipo === 'baixa' ? _estCampo('Tipo de baixa', `<select class="inp" id="emTipo">${TIPOS_DESPERDICIO.map(t => `<option value="${t.id}"${m.tipo_baixa === t.id ? ' selected' : ''}>${_estEsc(t.label)}</option>`).join('')}</select>`) : ''}
    ${_estCampo('Motivo', `<input class="inp" id="emMotivo" value="${_estEsc(m.motivo || '')}">`)}
    <div style="font-size:var(--text-xs);color:var(--muted)">A alteração fica registrada no histórico com o seu nome.</div>`,
    `_estSalvarEdicao('${id}')`);
}
function _estSalvarEdicao(id) {
  const m = _estAcharMov(id);
  const qtd = parseFloat(document.getElementById('emQtd').value);
  if (!(qtd > 0)) return toast('Informe a quantidade', 'err');
  const campos = { qtd: _estRound(qtd), data_mov: _estLerData('emData'), motivo: document.getElementById('emMotivo').value.trim() || null };
  if (m.tipo === 'transferencia') {
    campos.local_origem = document.getElementById('emDe').value; campos.local_destino = document.getElementById('emPara').value;
    if (campos.local_origem === campos.local_destino) return toast('Origem e destino precisam ser diferentes', 'err');
  } else {
    campos[m.sinal > 0 ? 'local_destino' : 'local_origem'] = document.getElementById('emLocal').value;
  }
  if (m.tipo === 'baixa') campos.tipo_baixa = document.getElementById('emTipo').value;
  _estSalvarComBotao('ovEstEdit', () => estEditarMov(m, campos).then(() => toast('Movimentação atualizada', 'ok')));
}

function _estMovsDoAlvo(idOuGrupo, grupo) {
  const movs = _estMovDados?.movs || [];
  return grupo ? movs.filter(m => m.grupo_id === idOuGrupo && !m.excluido_em) : movs.filter(m => m.id === idOuGrupo);
}

function estExcluirMovConfirmar(idOuGrupo, grupo) {
  const alvo = _estMovsDoAlvo(idOuGrupo, grupo);
  if (!alvo.length) return;
  const nome = grupo ? alvo[0].produto_nome : alvo[0].item_nome;
  vtpConfirm({
    title: 'Excluir movimentação?',
    message: `${EST_MOV_TIPOS[alvo[0].tipo]?.label || ''} de ${nome}${grupo ? ` (${alvo.length} itens)` : ''}. Ela sai das contas do estoque, mas continua no histórico com o seu nome.`,
    confirmLabel: 'Excluir',
    onConfirm: () => estExcluirMovs(alvo)
      .then(() => { toast('Movimentação excluída', 'ok'); _estMovDados = null; estRenderAbaMov(true); })
      .catch(e => toast('Não consegui excluir: ' + e.message, 'err')),
  });
}

async function estHistoricoMov(idOuGrupo, grupo) {
  const alvo = _estMovsDoAlvo(idOuGrupo, grupo).concat(grupo ? (_estMovDados?.movs || []).filter(m => m.grupo_id === idOuGrupo && m.excluido_em) : []);
  if (!alvo.length) return;
  const ids = [...new Set(alvo.map(m => m.id))];
  const { data, error } = await _estSb().from('est_log').select('*').in('registro_id', ids).order('em', { ascending: true });
  if (error) return toast('Não consegui carregar o histórico: ' + error.message, 'err');
  const nomeItem = Object.fromEntries(alvo.map(m => [m.id, m.item_nome]));
  const ACAO = { inseriu: 'lançou', editou: 'editou', excluiu: 'excluiu', restaurou: 'restaurou' };
  const CAMPOS = { qtd: 'quantidade', data_mov: 'data', motivo: 'motivo', tipo_baixa: 'tipo de baixa', local_origem: 'origem', local_destino: 'destino' };
  const fmtV = (k, v) => k === 'data_mov' ? _estDH(v) : k.startsWith('local_') ? estLocalLabel(v) : k === 'tipo_baixa' ? _estTipoBaixaLabel(v) : (v ?? '—');
  const linhas = (data || []).map(l => {
    let det = '';
    if (l.acao === 'editou' && l.antes && l.depois) {
      det = Object.keys(CAMPOS).filter(k => String(l.antes[k] ?? '') !== String(l.depois[k] ?? ''))
        .map(k => `${CAMPOS[k]}: ${_estEsc(fmtV(k, l.antes[k]))} → <strong>${_estEsc(fmtV(k, l.depois[k]))}</strong>`).join('<br>');
    }
    return `<div style="padding:10px 0;border-top:1px solid var(--border);font-size:var(--text-sm)">
      <div><strong>${_estEsc(l.usuario || '—')}</strong> ${ACAO[l.acao] || l.acao}${grupo ? ` · ${_estEsc(nomeItem[l.registro_id] || '')}` : ''}
        <span style="color:var(--muted)"> · ${new Date(l.em).toLocaleString('pt-BR')}</span></div>
      ${det ? `<div style="color:var(--text2);margin-top:4px;line-height:1.5">${det}</div>` : ''}</div>`;
  }).join('');
  _estModal('ovEstHist', 'Histórico da movimentação', linhas || '<div style="color:var(--muted)">Sem registros.</div>', `document.getElementById('ovEstHist').remove()`, 'Fechar', 520);
}

/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-saldo.js — Motor de saldo do estoque por ciclos
 *
 * Um saldo só por item e local:
 *
 *   saldo = última contagem aprovada daquele local
 *         + entradas (recebimento, produção, entrada manual, transferência recebida)
 *         − baixas − transferências enviadas
 *         − vendas automáticas (débito automático, calculado dos pedidos do CW)
 *
 * tudo DEPOIS da data da contagem. A contagem sempre sobrescreve: quando uma
 * nova é aprovada, ela vira a base e o que veio antes deixa de contar.
 *
 * Item que ainda não teve nenhuma contagem no módulo novo usa o saldo antigo
 * (item.qty) como saldo, sem débito de venda — não dá pra saber desde quando
 * descontar. Ele aparece marcado como "sem contagem" até a primeira contagem
 * de ciclo. Toda movimentação nova também ajusta item.qty (ver
 * estAplicarLegado em estoque-mov.js), então para esses itens as
 * movimentações NÃO são somadas de novo aqui — já estão dentro do item.qty.
 *
 * Dados: tabelas est_* no Supabase (ver migration 20261010120000) + cw_pedidos.
 */

// ── Acesso às tabelas ──────────────────────────────────────────

// Datas vêm em formatos diferentes (Postgres em UTC, CW com fuso) — compara
// sempre em milissegundos, nunca como texto.
const _estMs = s => (s ? Date.parse(s) : 0) || 0;

function _estSb() {
  const sb = window._vtpSb;
  if (!sb) throw new Error('Sem conexão com o servidor');
  return sb;
}

async function _estSelectTodos(montarQuery) {
  const PAGE = 1000, out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await montarQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Última contagem aprovada de cada (item, local).
// → Map "itemId|localId" → { qtd, data, contagemId }
async function estBuscarBasesContagem(ateISO = null) {
  const linhas = await _estSelectTodos(() => {
    let q = _estSb()
      .from('est_contagem_itens')
      .select('item_id, contado, contagem:est_contagens!inner(id, local_id, data_ref, status, excluido_em)')
      .eq('contagem.status', 'concluida')
      .is('contagem.excluido_em', null)
      .not('contado', 'is', null);
    if (ateISO) q = q.lte('contagem.data_ref', ateISO);
    return q;
  });
  const bases = new Map();
  for (const l of linhas) {
    const k = l.item_id + '|' + l.contagem.local_id;
    const atual = bases.get(k);
    if (!atual || _estMs(l.contagem.data_ref) > _estMs(atual.data)) {
      bases.set(k, { qtd: Number(l.contado), data: l.contagem.data_ref, contagemId: l.contagem.id });
    }
  }
  return bases;
}

async function estBuscarMovimentacoes({ desde = null, ate = null, incluirExcluidas = false } = {}) {
  return _estSelectTodos(() => {
    let q = _estSb().from('est_movimentacoes').select('*').order('data_mov', { ascending: false });
    if (desde) q = q.gte('data_mov', desde);
    if (ate)   q = q.lte('data_mov', ate);
    if (!incluirExcluidas) q = q.is('excluido_em', null);
    return q;
  });
}

// ── Débito automático por pedido ───────────────────────────────
// Diferente do CMV (vendasInsumosConsumidos), aqui NÃO desce para dentro do
// preparado: a pizza baixa a Mussarela Triturada, não a Mussarela em Barra.
// peso_g das fichas de produto/opção já está na unidade do item referenciado.

function _estAcumFicha(ficha, mult, acc) {
  for (const ing of (ficha?.ingredientes || [])) {
    const q = (ing.peso_g || 0) * mult;
    if (ing.item_id == null || !(q > 0)) continue;
    acc[ing.item_id] = (acc[ing.item_id] || 0) + q;
  }
}

function _estAcumBebida(nome, qtd, acc) {
  if (typeof _cwPoolBebidas !== 'function' || typeof _cwRank !== 'function') return;
  const c = _cwRank(nome, _cwPoolBebidas(), 'nome', 1)[0];
  if (!c || c.s < 0.6) return;
  if (c.x.tipo === 'insumo') {
    acc[c.x.id] = (acc[c.x.id] || 0) + qtd;
  } else {
    const prod = produtos.find(p => p.id === c.x.id);
    if (prod?.fichaTecnica) _estAcumFicha(prod.fichaTecnica, qtd, acc);
  }
}

// Linhas de venda (vendas.js) → um registro por pedido com o que ele debitou.
// → [{ pedidoId, ts, canal, produtos:[nome…], itens:{ itemId: qtd } }]
function estDebitosPorPedido(linhas) {
  const porPedido = new Map();
  for (const l of linhas) {
    let p = porPedido.get(l.pedidoId);
    if (!p) { p = { pedidoId: l.pedidoId, ts: l.ts, canal: l.canal, produtos: [], itens: {} }; porPedido.set(l.pedidoId, p); }
    p.produtos.push(l.qtd > 1 ? `${l.qtd}× ${l.nome}` : l.nome);
    for (const pz of (l.pizzas || [])) {
      const base = produtosPizza.find(b => new RegExp(pz.tamanho, 'i').test(b.nome));
      if (base) _estAcumFicha(base.fichaTecnica, 1, p.itens);
      for (const [k, meias] of Object.entries(pz.meias || {})) {
        const opc = vendasOpcaoDeSabor(k);
        if (opc) _estAcumFicha(opc.fichaTecnica, meias, p.itens);
      }
    }
    for (const b of (l.bebidas || [])) _estAcumBebida(b.nome, b.qtd || 1, p.itens);
  }
  return [...porPedido.values()].sort((a, b) => _estMs(b.ts) - _estMs(a.ts));
}

async function estBuscarDebitos(desdeISO, ateISO = null) {
  if (!desdeISO || typeof _vFetchPeriodo !== 'function') return [];
  const linhas = await _vFetchPeriodo(desdeISO, ateISO);
  return estDebitosPorPedido(linhas);
}

// ── Entra no CMV? ──────────────────────────────────────────────
// Regra de negócio: o CMV só conta o que influencia a venda direta
// (insumos e processados). Escritório, higiene e descartáveis são contados
// no estoque, mas entram como outra categoria de despesa. Configurável por
// categoria em Configurações › Personalização › Estoque.
const EST_CATS_FORA_CMV_PADRAO = ['MATERIAL DE ESCRITÓRIO', 'HIGIENE E LIMPEZA', 'DESCARTÁVEIS'];
function estCatsForaCMV() {
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  return new Set(Array.isArray(cfg.catsForaCMV) ? cfg.catsForaCMV : EST_CATS_FORA_CMV_PADRAO);
}
const estCatNoCMV  = (cat, fora = estCatsForaCMV()) => !fora.has(cat || 'Outros');
const estItemNoCMV = (item, fora) => estCatNoCMV(item?.cat, fora);

// ── Locais do item ─────────────────────────────────────────────

const EST_SEM_LOCAL = '_sem_local';

function estLocaisDoItem(item) {
  const l = [...new Set([item.localEntrada, item.localSaida, ...(item.locais || [])].filter(Boolean))];
  return l.length ? l : [EST_SEM_LOCAL];
}
const estLocalSaida   = item => item.localSaida   || item.localEntrada || estLocaisDoItem(item)[0];
const estLocalEntrada = item => item.localEntrada || item.localSaida   || estLocaisDoItem(item)[0];
const estTipoItem     = item => item.isProd ? 'preparado' : 'insumo';

// ── Cálculo ────────────────────────────────────────────────────
// Quanto cada movimentação mexe em cada local: [[localId, delta], …]
function estEfeitoMov(m) {
  const q = Number(m.qtd) || 0;
  if (m.tipo === 'transferencia') return [[m.local_origem, -q], [m.local_destino, q]];
  if (m.sinal > 0) return [[m.local_destino || m.local_origem, q]];
  if (m.sinal < 0) return [[m.local_origem || m.local_destino, -q]];
  return [];
}

const _EST_GRUPO_MOV = {
  recebimento: 'entradas', producao: 'entradas', entrada_manual: 'entradas',
  baixa: 'baixas', ajuste_contagem: 'ajustes', transferencia: 'transferencias',
};

/**
 * Calcula o saldo de todos os itens ativos (agora, ou no momento `ate`).
 * → { porItem: Map itemId → resumo, debitos:[pedidos], geradoEm }
 *   resumo = { item, total, porLocal: { localId: { saldo, base, baseData, entradas,
 *              vendas, baixas, transferencias, ajustes } }, semContagem, baseMaisAntiga }
 */
async function estCalcularSaldos({ ate = null } = {}) {
  // `ate`: saldo naquele momento (ex.: hora em que o estoque foi contado),
  // ignorando contagens, movimentações e vendas posteriores.
  const [bases, movs] = await Promise.all([estBuscarBasesContagem(ate), estBuscarMovimentacoes({ ate })]);
  const ativos = items.filter(i => i.active !== false);

  // Débitos de venda: só a partir da contagem mais antiga entre as bases
  const datasBase = [...bases.values()].map(b => b.data).sort((a, b) => _estMs(a) - _estMs(b));
  const debitos = datasBase.length ? await estBuscarDebitos(new Date(_estMs(datasBase[0])).toISOString(), ate) : [];

  const porItem = new Map();
  for (const item of ativos) {
    const locais = estLocaisDoItem(item);
    const temContagem = locais.some(l => bases.has(item.id + '|' + l));
    const porLocal = {};
    for (const l of locais) {
      const b = bases.get(item.id + '|' + l);
      porLocal[l] = {
        saldo: 0, base: b ? b.qtd : 0, baseData: b ? b.data : null,
        entradas: 0, vendas: 0, baixas: 0, transferencias: 0, ajustes: 0,
      };
    }
    if (!temContagem) {
      // Sem contagem ainda: saldo antigo (importação CW) no local de saída
      const l = estLocalSaida(item);
      porLocal[l].base = Number(item.qty) || 0;
    }
    porItem.set(item.id, { item, porLocal, semContagem: !temContagem, total: 0 });
  }

  // Movimentações depois da base de cada local
  for (const m of movs) {
    const r = porItem.get(m.item_id);
    if (!r || r.semContagem) continue; // já refletida no item.qty
    for (const [loc, delta] of estEfeitoMov(m)) {
      if (!loc) continue;
      const pl = r.porLocal[loc] || (r.porLocal[loc] = { saldo: 0, base: 0, baseData: null, entradas: 0, vendas: 0, baixas: 0, transferencias: 0, ajustes: 0 });
      if (pl.baseData && _estMs(m.data_mov) <= _estMs(pl.baseData)) continue;
      const g = _EST_GRUPO_MOV[m.tipo] || 'ajustes';
      pl[g] += delta;
    }
  }

  // Vendas automáticas: debitam o local de saída, depois da base dele
  for (const ped of debitos) {
    for (const [idStr, qtd] of Object.entries(ped.itens)) {
      const r = porItem.get(Number(idStr));
      if (!r || r.semContagem) continue;
      const pl = r.porLocal[estLocalSaida(r.item)];
      if (!pl || !pl.baseData || _estMs(ped.ts) <= _estMs(pl.baseData)) continue;
      pl.vendas -= qtd;
    }
  }

  for (const r of porItem.values()) {
    let total = 0;
    for (const pl of Object.values(r.porLocal)) {
      pl.saldo = pl.base + pl.entradas + pl.vendas + pl.baixas + pl.transferencias + pl.ajustes;
      total += pl.saldo;
    }
    r.total = total;
  }
  return { porItem, debitos, geradoEm: new Date().toISOString() };
}

// Cache simples: a aba Estoque e as próximas (Contagem, Movimentações) leem daqui
let _estSaldosCache = null;
let _estSaldosPromise = null;
async function estSaldos(forcar = false) {
  if (_estSaldosCache && !forcar) return _estSaldosCache;
  if (_estSaldosPromise && !forcar) return _estSaldosPromise;
  _estSaldosPromise = estCalcularSaldos()
    .then(r => { _estSaldosCache = r; return r; })
    .finally(() => { _estSaldosPromise = null; });
  return _estSaldosPromise;
}
function estInvalidarSaldos() { _estSaldosCache = null; }

// Último preço pago (histórico de compras)
function estUltimoPreco(itemId) {
  let ult = null;
  for (const p of (typeof priceHistory !== 'undefined' ? priceHistory : [])) {
    if (p.itemId !== itemId || !(p.precoUnit > 0)) continue;
    if (!ult || _estMs(p.data) >= _estMs(ult.data)) ult = p;
  }
  return ult;
}

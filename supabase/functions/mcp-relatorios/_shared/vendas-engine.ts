// mcp-relatorios/_shared/vendas-engine.ts
//
// Port fiel (não reimplementação) do motor de interpretação de pedidos do
// Cardápio Web e do motor de custo, hoje acoplados a globals de browser em:
//   - js/vendas.js     (_vInterpretarPedido, _vInterpretarItem, _vCategoria,
//                        contarPizzasPedido, vendasOpcaoDeSabor,
//                        vendasCustoOpcao/Base/Linha, vendasPorCanal)
//   - js/cadastros.js  (_cwNorm, _cwSaborKey, _cwRank/_cwSim/_cwTokens/_cwLev,
//                        _calcCustoFicha, _cwPoolBebidas, regexes _RE_*)
//   - js/cw-api.js     (CW_CANAL_MAP, _cwMapCanal)
//
// MANUTENÇÃO: se a lógica de negócio mudar nesses arquivos (novo layout de
// combo, novo sinônimo de sabor, etc.), este arquivo precisa ser atualizado
// manualmente — não há importação/compartilhamento automático, porque os
// arquivos originais são scripts de browser não-modulares. Ver plano em
// /Users/yurioliveira/.claude/plans/witty-painting-gadget.md.

// ── Tipos mínimos (só o que este motor usa) ─────────────────────

export interface CwOption {
  name?: string;
  option_group_id?: string | number;
  option_group_name?: string;
  quantity?: number;
  unit_price?: number;
  status?: string;
}

export interface CwItem {
  name?: string;
  quantity?: number;
  total_price?: number;
  unit_price?: number;
  status?: string;
  options?: CwOption[];
  items?: CwItem[]; // sub-itens de combo aninhado
}

export interface CwPedido {
  id: number | string;
  items: CwItem[] | null;
  sales_channel: string | null;
  total: number;
  cw_created_at: string;
  status: string;
}

export interface FichaIngrediente { item_id: number; peso_g: number }
export interface FichaTecnica { ingredientes: FichaIngrediente[]; rendimento_kg?: number }

export interface CatalogItem {
  id: number; name: string; unit: string; cost: number; isProd?: boolean;
  fichaTecnica?: FichaTecnica;
  // js/data.js:10-25 — campos de estoque (só usados pelas tools de estoque,
  // irrelevantes pro motor de vendas/CMV acima).
  cat?: string; qty?: number; min?: number; ideal?: number; active?: boolean;
}
export interface Opcao {
  id: number; nome: string; categoria: 'doce' | 'salgada';
  fichaTecnica: FichaTecnica; active?: boolean;
}
export interface ProdutoPizza {
  id: number; nome: string; tamanho: 'grande' | 'pequena';
  categoria: 'doce' | 'salgada'; fichaTecnica: FichaTecnica; active?: boolean;
}
export interface Produto {
  id: number; name: string; fichaTecnica?: FichaTecnica; cost?: number; active?: boolean;
}
export interface CwMapa { sabores?: Record<string, { opcaoId: number }>; bebidas?: Record<string, unknown> }

export interface Catalogo {
  items: CatalogItem[];
  opcoes: Opcao[];
  produtos: Produto[];
  produtosPizza: ProdutoPizza[];
  cwMapa: CwMapa;
}

export interface Pizza { tamanho: 'grande' | 'pequena'; meias: Record<string, number> }
export interface Bebida { nome: string; qtd: number }
export interface LinhaVenda {
  pedidoId: number | string; ts: string; canal: string; categoria: string;
  nome: string; qtd: number; receita: number; pizzas: Pizza[]; bebidas: Bebida[];
}

// ── js/cw-api.js:38-49 — mapeamento de canal ────────────────────

export const CW_CANAL_MAP: Record<string, string> = {
  ifood:               'ifood',
  food99:              '99food',
  catalog:             'site',
  store_front_catalog: 'site',
  portal:              'site',
  whatsapp_extension:  'site',
};

export function cwMapCanal(salesChannel: string | null): string {
  return (salesChannel && CW_CANAL_MAP[salesChannel]) || salesChannel || 'outro';
}

export const CANAL_LABEL: Record<string, string> = {
  ifood: 'iFood', '99food': '99Food', site: 'Site/Balcão', outro: 'Outro',
};

// ── js/cadastros.js:1789-1859 — normalização + similaridade ────

export function cwNorm(s: string | undefined | null): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

export function cwSaborKey(nome: string | undefined | null): string {
  return cwNorm(nome)
    .replace(/^1\/2\s+/, '')
    .replace(/\s*\|\s*pizza.*$/, '')
    .replace(/^pizza\s+(de\s+)?/, '')
    .trim();
}

const CW_SINONIMOS: Record<string, string> = { catupiry: 'catupiry', cremoso: 'catupiry', requeijao: 'catupiry', creme: 'catupiry' };
const CW_STOP = new Set(['de','e','com','ao','a','o','da','do','na','no','ou','em','1','2','meia','inteira','pizza','sabor','antartica','antarctica']);
function cwCanonTok(t: string) { return CW_SINONIMOS[t] || t; }
function cwTokens(s: string): string[] {
  return cwSaborKey(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t && !CW_STOP.has(t)).map(cwCanonTok);
}
function cwLev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function cwSim(a: string, b: string): number {
  const A = cwTokens(a), B = cwTokens(b);
  if (!A.length || !B.length) return 0;
  const sA = new Set(A), sB = new Set(B);
  let inter = 0; for (const t of sA) if (sB.has(t)) inter++;
  const jaccard = inter / (sA.size + sB.size - inter);
  let score = jaccard;
  let queryContida = A.length > 0; for (const t of sA) if (!sB.has(t)) { queryContida = false; break; }
  if (queryContida && [...sA].some(t => t.length >= 3)) score = Math.max(score, Math.min(0.92, jaccard + 0.35));
  const c1 = cwSaborKey(a).replace(/[^a-z0-9]/g, ''), c2 = cwSaborKey(b).replace(/[^a-z0-9]/g, '');
  if (c1 && c2) score = Math.max(score, (1 - cwLev(c1, c2) / Math.max(c1.length, c2.length)) * 0.9);
  return score;
}
// Sempre casado pelo campo "nome" nesta base de código (é como
// _cwRank(..., 'nome', ...) é chamado em todo o app) — simplificado aqui
// em vez de repetir o parâmetro campoNome genérico do original.
function cwRank<T extends { nome: string }>(nome: string, pool: T[], n = 3, minScore = 0.34) {
  return pool.map(x => ({ x, s: cwSim(nome, x.nome) }))
    .filter(r => r.s >= minScore).sort((a, b) => b.s - a.s).slice(0, n);
}

// ── js/cadastros.js:1856-1860 — regras de estrutura ─────────────

const RE_SLOT      = /pizza\s+(grande|pequena).*pizza\s+(salgada|doce)/i;
const RE_SIZE_OPT  = /^pizza\s+(grande|pequena)\b/i;
const RE_BEBIDA    = /bebida/i;

// ── js/cadastros.js:698-704 — custo de ficha técnica ────────────

export function calcCustoFicha(fichaTecnica: FichaTecnica | undefined, items: CatalogItem[]): number {
  if (!fichaTecnica?.ingredientes?.length) return 0;
  return fichaTecnica.ingredientes.reduce((sum, r) => {
    const ins = items.find(i => i.id === r.item_id);
    return sum + (ins ? (r.peso_g || 0) * ins.cost : 0);
  }, 0);
}

// ── js/cadastros.js:1975-1979 — pool de bebidas pra matching ────

function cwPoolBebidas(cat: Catalogo) {
  return [
    ...cat.produtos.filter(p => p.active !== false).map(p => ({ tipo: 'produto' as const, id: p.id, nome: p.name })),
    ...cat.items.filter(i => i.active !== false && i.isProd !== true).map(i => ({ tipo: 'insumo' as const, id: i.id, nome: i.name })),
  ];
}

// ── js/vendas.js:30-51 — helpers estruturais ────────────────────

function vTam(str: string | undefined): 'grande' | 'pequena' { return /grande/i.test(str || '') ? 'grande' : 'pequena'; }
function vUnidadesInteira(tamanho: 'grande' | 'pequena') { return tamanho === 'grande' ? 2 : 1; }
function vAddMeia(meias: Record<string, number>, nome: string | undefined, q: number | undefined) {
  const k = cwSaborKey(nome);
  if (!k || /^(grande|pequena)\b/.test(k) || /pedaco/.test(k)) return;
  meias[k] = (meias[k] || 0) + (q || 1);
}

function makeVendasOpcaoDeSabor(cat: Catalogo) {
  return function vendasOpcaoDeSabor(saborKey: string): Opcao | null {
    const override = cat.cwMapa?.sabores?.[saborKey];
    if (override) {
      const o = cat.opcoes.find(x => x.id === override.opcaoId);
      if (o) return o;
    }
    const c = cwRank(saborKey, cat.opcoes, 1)[0];
    return c && c.s >= 0.6 ? c.x : null;
  };
}

// ── js/vendas.js:54-217 — interpretação de 1 item ───────────────

function vInterpretarItem(it: CwItem, vSaborCadastrado: (nome: string) => boolean): { pizzas: Pizza[]; bebidas: Bebida[] } {
  const opts = it.options || [];
  const porGrupo: Record<string, Pizza> = {};
  const bebidas: Bebida[] = [];
  const soltas: CwOption[] = [];
  const inteiras: Pizza[] = [];
  const sizeOpt = opts.find(o => RE_SIZE_OPT.test(o.name || ''));

  for (const o of opts) {
    const g = o.option_group_name || '';
    if (RE_SLOT.test(g)) {
      const gid = String(o.option_group_id ?? g);
      if (!porGrupo[gid]) porGrupo[gid] = { tamanho: vTam(g), meias: {} };
      vAddMeia(porGrupo[gid].meias, o.name, o.quantity);
    } else if (RE_BEBIDA.test(g)) {
      bebidas.push({ nome: o.name || '', qtd: o.quantity || 1 });
    } else if (RE_SIZE_OPT.test(o.name || '')) {
      /* tratado abaixo via sizeOpt */
    } else if (/\|\s*pizza/i.test(o.name || '')) {
      const tamanho = vTam(o.name);
      const ehMetade = /^\s*1\/2\b/.test(o.name || '');
      if (ehMetade) {
        const gid = 'opc-' + String(o.option_group_id ?? o.name);
        if (!porGrupo[gid]) porGrupo[gid] = { tamanho, meias: {} };
        vAddMeia(porGrupo[gid].meias, o.name, o.quantity);
      } else {
        const key = cwSaborKey(o.name);
        if (key) for (let i = 0; i < (o.quantity || 1); i++) inteiras.push({ tamanho, meias: { [key]: vUnidadesInteira(tamanho) } });
      }
    } else if (!g) {
      if (vSaborCadastrado(o.name || '')) soltas.push(o);
      else bebidas.push({ nome: o.name || '', qtd: o.quantity || 1 });
    }
  }

  let pizzas: Pizza[] = Object.values(porGrupo).filter(p => Object.keys(p.meias).length > 0);
  for (const pz of pizzas) {
    const chaves = Object.keys(pz.meias);
    if (chaves.length === 1) pz.meias[chaves[0]] = vUnidadesInteira(pz.tamanho);
  }
  pizzas.push(...inteiras);

  if (!pizzas.length && sizeOpt) {
    const meias: Record<string, number> = {};
    (it.name || '').split('|')[0].split('+').forEach(p => vAddMeia(meias, p, 1));
    const tamanho = vTam(sizeOpt.name);
    const chaves = Object.keys(meias);
    if (chaves.length === 1) meias[chaves[0]] = vUnidadesInteira(tamanho);
    if (chaves.length) pizzas = [{ tamanho, meias }];
  }

  if (!pizzas.length && !opts.length) {
    const parteTam = ((it.name || '').split('|')[1] || '').trim();
    if (RE_SIZE_OPT.test(parteTam)) {
      const meias: Record<string, number> = {};
      (it.name || '').split('|')[0].split('+').forEach(p => vAddMeia(meias, p, 1));
      const tamanho = vTam(parteTam);
      const chaves = Object.keys(meias);
      if (chaves.length === 1) meias[chaves[0]] = vUnidadesInteira(tamanho);
      if (chaves.length) pizzas = [{ tamanho, meias }];
    }
  }

  if (soltas.length) {
    const nomeItem = it.name || '';
    const temAmbos = /grande/i.test(nomeItem) && /pequena/i.test(nomeItem);
    const tamMetade  = temAmbos ? 'grande' : vTam(nomeItem);
    const tamInteira = temAmbos ? 'pequena' : vTam(nomeItem);

    const metades = soltas.filter(o => /^\s*1\/2\b/.test(o.name || ''))
      .sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
    const inteiras2 = soltas.filter(o => !/^\s*1\/2\b/.test(o.name || ''));

    for (const o of inteiras2) {
      for (let i = 0; i < (o.quantity || 1); i++) {
        pizzas.push({ tamanho: tamInteira, meias: { [cwSaborKey(o.name)]: vUnidadesInteira(tamInteira) } });
      }
    }

    let pendentes: Pizza[] = [];
    for (const o of metades) {
      let n = o.quantity || 1;
      while (n > 0 && pendentes.length) {
        const p = pendentes.shift()!;
        vAddMeia(p.meias, o.name, 1);
        n--;
      }
      while (n > 0) {
        const p: Pizza = { tamanho: tamMetade, meias: {} };
        vAddMeia(p.meias, o.name, 1);
        pizzas.push(p);
        pendentes.push(p);
        n--;
      }
    }

    while (pendentes.length >= 2) {
      const a = pendentes.shift()!;
      const b = pendentes.shift()!;
      for (const [k, v] of Object.entries(b.meias)) a.meias[k] = (a.meias[k] || 0) + v;
      pizzas = pizzas.filter(p => p !== b);
    }
  }

  if (!pizzas.length && !opts.length && !sizeOpt
      && !/combo|promo|pizza\s+(grande|pequena)/i.test(it.name || '')
      && !/\|\s*pizza/i.test(it.name || '')) {
    if (vSaborCadastrado(it.name || '')) {
      const tamanho = vTam(it.name || '');
      pizzas = [{ tamanho, meias: { [cwSaborKey(it.name)]: vUnidadesInteira(tamanho) } }];
    } else {
      bebidas.push({ nome: it.name || '', qtd: it.quantity || 1 });
    }
  }

  return { pizzas, bebidas };
}

// ── js/vendas.js:219-256 — categoria da linha ───────────────────

const VENDAS_CATEGORIAS = ['Promo do Dia', 'Vai Ter Combo', 'Monte seu Sabor', 'Pizza Salgada', 'Pizza Doce', 'Bebidas'];

function vCategoria(it: CwItem, vendasOpcaoDeSabor: (k: string) => Opcao | null): string {
  const n = cwNorm(it.name);
  if (/combo/.test(n)) return 'Vai Ter Combo';
  if (/promo/.test(n) || /dia da pizza/.test(n)) return 'Promo do Dia';
  const temSlot = (it.options || []).some(o => RE_SLOT.test(o.option_group_name || ''));
  if (temSlot || RE_SLOT.test(it.name || '')) return 'Monte seu Sabor';
  const optPizza = (it.options || []).find(o => RE_SIZE_OPT.test(o.name || '') || /\|\s*pizza/i.test(o.name || ''));
  if (!(/\|\s*pizza/.test(n) || optPizza)) {
    if (!(it.options || []).length) {
      const opc = vendasOpcaoDeSabor(cwSaborKey(it.name));
      if (opc) return opc.categoria === 'doce' ? 'Pizza Doce' : 'Pizza Salgada';
    }
    return 'Bebidas';
  }
  if (optPizza) {
    const opc = vendasOpcaoDeSabor(cwSaborKey(optPizza.name));
    if (opc) return opc.categoria === 'doce' ? 'Pizza Doce' : 'Pizza Salgada';
  }
  const ehDoce = /doce/.test(n) || /doce/i.test(optPizza?.option_group_name || '') || /doce/i.test(optPizza?.name || '');
  return ehDoce ? 'Pizza Doce' : 'Pizza Salgada';
}

// ── js/vendas.js:261-338 — interpretação de 1 pedido ────────────

export function interpretarPedido(p: CwPedido, cat: Catalogo): LinhaVenda[] {
  const vendasOpcaoDeSabor = makeVendasOpcaoDeSabor(cat);
  const vSaborCadastrado = (nome: string) => {
    const key = cwSaborKey(nome);
    if (!key) return false;
    return !!vendasOpcaoDeSabor(key);
  };

  const linhas: LinhaVenda[] = [];
  const ts = p.cw_created_at;
  const canal = cwMapCanal(p.sales_channel);

  const marcadorPromo = (p.items || []).find(it => /cupom:?\s*fretegratis/.test(cwNorm(it.name)));

  for (const it of (p.items || [])) {
    if (it.status === 'canceled') continue;
    if (it === marcadorPromo) continue;

    let pizzas: Pizza[], bebidas: Bebida[];
    if (it.items && it.items.length) {
      pizzas = []; bebidas = [];
      for (const sub of it.items) {
        if (sub.status === 'canceled') continue;
        const r = vInterpretarItem(sub, vSaborCadastrado);
        pizzas.push(...r.pizzas);
        bebidas.push(...r.bebidas);
      }
    } else {
      ({ pizzas, bebidas } = vInterpretarItem(it, vSaborCadastrado));
    }

    if (!pizzas.length && !bebidas.length) continue;

    let categoria = marcadorPromo ? 'Promo do Dia' : vCategoria(it, vendasOpcaoDeSabor);
    if ((categoria === 'Pizza Salgada' || categoria === 'Pizza Doce')
        && pizzas.some(pz => Object.keys(pz.meias).length > 1)) {
      categoria = 'Monte seu Sabor';
    }

    linhas.push({
      pedidoId: p.id, ts, canal, categoria,
      nome: marcadorPromo ? (marcadorPromo.name || '') : (it.name || ''),
      qtd: it.quantity || 1,
      receita: it.total_price ?? it.unit_price ?? 0,
      pizzas, bebidas,
    });
  }

  const somaBruta = linhas.reduce((s, l) => s + l.receita, 0);
  if (somaBruta > 0 && typeof p.total === 'number') {
    const fator = p.total / somaBruta;
    for (const l of linhas) l.receita *= fator;
  }

  return linhas;
}

// ── js/vendas.js:340-356 — contagem de pizzas de 1 pedido ───────

export function contarPizzasPedido(p: CwPedido, cat: Catalogo): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  for (const l of interpretarPedido(p, cat)) {
    for (const pz of l.pizzas) {
      if (pz.tamanho === 'grande') grande++; else pequena++;
    }
  }
  return { grande, pequena };
}

// ── js/vendas.js:417-446 — custo de 1 linha de venda ─────────────

export function custoLinha(linha: LinhaVenda, cat: Catalogo): number {
  const vendasOpcaoDeSabor = makeVendasOpcaoDeSabor(cat);
  const custoOpcao = (saborKey: string) => {
    const opc = vendasOpcaoDeSabor(saborKey);
    return opc ? calcCustoFicha(opc.fichaTecnica, cat.items) : 0;
  };
  const custoBase = (tamanho: string) => {
    const base = cat.produtosPizza.find(p => new RegExp(tamanho, 'i').test(p.nome));
    return base ? calcCustoFicha(base.fichaTecnica, cat.items) : 0;
  };

  let custo = 0;
  for (const pz of linha.pizzas) {
    custo += custoBase(pz.tamanho);
    for (const [k, meias] of Object.entries(pz.meias)) custo += custoOpcao(k) * meias;
  }
  for (const b of linha.bebidas) {
    const pool = cwPoolBebidas(cat);
    const c = cwRank(b.nome, pool, 1)[0];
    if (c && c.s >= 0.6) {
      const alvo = c.x.tipo === 'produto'
        ? cat.produtos.find(p => p.id === c.x.id)
        : cat.items.find(i => i.id === c.x.id);
      const cUn = alvo && 'fichaTecnica' in alvo && alvo.fichaTecnica
        ? calcCustoFicha(alvo.fichaTecnica, cat.items)
        : (alvo?.cost || 0);
      custo += cUn * (b.qtd || 1);
    }
  }
  return custo;
}

// ── js/vendas.js:620-630 — receita/custo por canal ──────────────

export function vendasPorCanal(linhas: LinhaVenda[], cat: Catalogo) {
  const acc: Record<string, { canal: string; vendas: number; receita: number; custo: number }> = {};
  for (const l of linhas) {
    const c = l.canal || 'outro';
    if (!acc[c]) acc[c] = { canal: c, vendas: 0, receita: 0, custo: 0 };
    acc[c].vendas += l.qtd;
    acc[c].receita += l.receita;
    acc[c].custo += custoLinha(l, cat);
  }
  return acc;
}

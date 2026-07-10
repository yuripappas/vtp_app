/**
 * VTP Compras — Vai Ter Pizza!
 * vendas.js — Interpretador de pedidos do Cardápio Web (motor de Vendas)
 *
 * Lê cw_pedidos e normaliza cada pedido em LINHAS DE VENDA (o container que
 * gera receita) e seus COMPONENTES (o que debita custo):
 *
 *   linha   = { pedidoId, ts, canal, categoria, nome, qtd, receita, pizzas, bebidas }
 *   pizzas  = [{ tamanho:'grande'|'pequena', meias:{ saborKey: nº de meias } }]
 *   bebidas = [{ nome, qtd }]
 *
 * Regras (validadas nos pedidos reais — ver planejamento):
 *   • Cada pizza = um option_group_id distinto. O mesmo nome de grupo pode
 *     repetir num combo (2 grandes) — é o id que separa as pizzas.
 *   • O tamanho vem do nome do grupo ("Pizza Grande/Pequena ... | ...").
 *   • quantity da opção = nº de meias porções. Pizza inteira de 1 sabor = 2
 *     meias (mesma opção x2); meio a meio = 1 + 1.
 *   • Layout B ("Sabor | Pizza Tradicional" + opção "Pizza Grande/Pequena"):
 *     sabor no nome do item, tamanho na opção.
 *   • Bebida: grupo com "bebida", opção solta sem grupo, ou item avulso.
 *   • Receita = preço do item NO PEDIDO (varia por canal — CW/iFood/99Food).
 *     Combos têm o preço no container; pizzas internas vêm a 0.
 *
 * A associação saborKey → Opção e bebida → Produto/insumo (pra custo) usa a
 * similaridade de cadastros.js (_cwRank), reaproveitada — não duplicada.
 */

// ── Interpretação estrutural ───────────────────────────────────

function _vTam(str) { return /grande/i.test(str) ? 'grande' : 'pequena'; }

function _vAddMeia(meias, nome, q) {
  const k = _cwSaborKey(nome);
  if (!k || /^(grande|pequena)\b/.test(k) || /pedaco/.test(k)) return;
  meias[k] = (meias[k] || 0) + (q || 1);
}

// Interpreta 1 item de pedido → { pizzas:[...], bebidas:[...] }
function _vInterpretarItem(it) {
  const opts    = it.options || [];
  const porGrupo = {}; // option_group_id → { tamanho, meias }
  const bebidas  = [];
  const sizeOpt  = opts.find(o => _RE_SIZE_OPT.test(o.name || ''));

  for (const o of opts) {
    const g = o.option_group_name || '';
    if (_RE_SLOT.test(g)) {
      const gid = o.option_group_id ?? g;              // id separa pizzas iguais no combo
      if (!porGrupo[gid]) porGrupo[gid] = { tamanho: _vTam(g), meias: {} };
      _vAddMeia(porGrupo[gid].meias, o.name, o.quantity);
    } else if (_RE_BEBIDA.test(g)) {
      bebidas.push({ nome: o.name, qtd: o.quantity || 1 });
    } else if (_RE_SIZE_OPT.test(o.name || '')) {
      /* opção de tamanho (layout B) — tratada abaixo */
    } else if (/\|\s*pizza/i.test(o.name || '')) {
      const gid = 'opc-' + (o.option_group_id ?? o.name);
      if (!porGrupo[gid]) porGrupo[gid] = { tamanho: 'pequena', meias: {} };
      _vAddMeia(porGrupo[gid].meias, o.name, o.quantity);
    } else if (!g) {
      bebidas.push({ nome: o.name, qtd: o.quantity || 1 });
    }
  }

  let pizzas = Object.values(porGrupo).filter(p => Object.keys(p.meias).length);

  // Layout B: sabor no nome do item, tamanho na opção de tamanho
  if (!pizzas.length && sizeOpt) {
    const meias = {};
    (it.name || '').split('|')[0].split('+').forEach(p => _vAddMeia(meias, p, 1));
    if (Object.keys(meias).length) pizzas = [{ tamanho: _vTam(sizeOpt.name), meias }];
  }

  // Item avulso de revenda (bebida) — sem opções e não é pizza/combo
  if (!opts.length && !sizeOpt
      && !/combo|promo|pizza\s+(grande|pequena)/i.test(it.name || '')
      && !/\|\s*pizza/i.test(it.name || '')) {
    bebidas.push({ nome: it.name, qtd: it.quantity || 1 });
  }

  return { pizzas, bebidas };
}

// Categoria (espelha o catálogo do CW, derivada da estrutura do item)
function _vCategoria(it) {
  const n = _cwNorm(it.name);
  if (/combo/.test(n)) return 'Vai Ter Combo';
  if (/promo/.test(n)) return 'Promo do Dia';
  const temSlot = (it.options || []).some(o => _RE_SLOT.test(o.option_group_name || ''));
  if (temSlot || _RE_SLOT.test(it.name)) return 'Monte seu Sabor';
  const ehDoce = /doce/.test(n);
  if (/\|\s*pizza/.test(n) || (it.options || []).some(o => _RE_SIZE_OPT.test(o.name || '')))
    return ehDoce ? 'Pizza Doce' : 'Pizza Salgada';
  return 'Bebidas';
}

const VENDAS_CATEGORIAS = ['Promo do Dia', 'Vai Ter Combo', 'Monte seu Sabor', 'Pizza Salgada', 'Pizza Doce', 'Bebidas'];

// Interpreta 1 pedido → array de linhas de venda
function _vInterpretarPedido(p) {
  const linhas = [];
  const ts    = p.cw_created_at;
  const canal = typeof _cwMapCanal === 'function' ? _cwMapCanal(p.sales_channel) : p.sales_channel;
  for (const it of (p.items || [])) {
    if (it.status === 'canceled') continue;
    const { pizzas, bebidas } = _vInterpretarItem(it);
    if (!pizzas.length && !bebidas.length) continue;
    linhas.push({
      pedidoId:  p.id,
      ts, canal,
      categoria: _vCategoria(it),
      nome:      it.name,
      qtd:       it.quantity || 1,
      receita:   it.total_price ?? it.unit_price ?? 0, // preço pago no canal
      pizzas, bebidas,
    });
  }
  return linhas;
}

// ── Carga + cache ──────────────────────────────────────────────

let _vLinhas = null;   // cache da sessão
let _vPeriodoDias = 90;

async function vendasCarregar(dias = 90, forcar = false) {
  if (_vLinhas && !forcar && dias === _vPeriodoDias) return _vLinhas;
  _vPeriodoDias = dias;
  const sb = _cwGetSbClient();
  const inicio = new Date(Date.now() - dias * 864e5).toISOString();

  // PostgREST devolve no máximo 1000 linhas por request — pagina com range()
  const PAGE = 1000;
  const linhas = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('cw_pedidos')
      .select('id, items, sales_channel, total, cw_created_at, status')
      .gte('cw_created_at', inicio)
      .order('cw_created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const p of (data || [])) {
      if (p.status === 'canceling' || p.status === 'canceled') continue;
      for (const l of _vInterpretarPedido(p)) linhas.push(l);
    }
    if (!data || data.length < PAGE) break;
  }
  _vLinhas = linhas;
  return linhas;
}

// ── Resolução de custo (saborKey → Opção; bebida → Produto/insumo) ──

// Reusa a similaridade do cadastros; devolve a Opção mais provável.
function vendasOpcaoDeSabor(saborKey) {
  if (typeof _cwRank !== 'function') return null;
  const c = _cwRank(saborKey, opcoes, 'nome', 1)[0];
  return c && c.s >= 0.6 ? c.x : null;
}
function vendasCustoOpcao(saborKey) {
  const opc = vendasOpcaoDeSabor(saborKey);
  return opc ? _calcCustoFicha(opc.fichaTecnica) : 0;
}
function vendasCustoBase(tamanho) {
  const base = produtosPizza.find(p => new RegExp(tamanho, 'i').test(p.nome));
  return base ? _calcCustoFicha(base.fichaTecnica) : 0;
}

// Custo total de uma linha de venda (soma das fichas dos componentes)
function vendasCustoLinha(linha) {
  let custo = 0;
  for (const pz of linha.pizzas) {
    custo += vendasCustoBase(pz.tamanho);
    for (const [k, meias] of Object.entries(pz.meias)) custo += vendasCustoOpcao(k) * meias;
  }
  for (const b of linha.bebidas) {
    if (typeof _cwPoolBebidas === 'function') {
      const c = _cwRank(b.nome, _cwPoolBebidas(), 'nome', 1)[0];
      if (c && c.s >= 0.6) {
        const alvo = c.x.tipo === 'produto'
          ? produtos.find(p => p.id === c.x.id)
          : items.find(i => i.id === c.x.id);
        const cUn = alvo?.fichaTecnica ? _calcCustoFicha(alvo.fichaTecnica) : (alvo?.cost || 0);
        custo += cUn * (b.qtd || 1);
      }
    }
  }
  return custo;
}

// ── Agregações (insumo pro módulo de Previsão/CMV) ─────────────

// Meias porções por tamanho, por opção (sabor) e por categoria.
function vendasAgregarMeias(linhas) {
  const porTamanho  = { grande: 0, pequena: 0 };
  const porOpcao    = {}; // saborKey → { grande, pequena, total }
  const porCategoria= {}; // categoria → total de meias
  for (const l of linhas) {
    for (const pz of l.pizzas) {
      for (const [k, meias] of Object.entries(pz.meias)) {
        porTamanho[pz.tamanho] += meias;
        porOpcao[k] = porOpcao[k] || { grande: 0, pequena: 0, total: 0 };
        porOpcao[k][pz.tamanho] += meias;
        porOpcao[k].total += meias;
        porCategoria[l.categoria] = (porCategoria[l.categoria] || 0) + meias;
      }
    }
  }
  return { porTamanho, porOpcao, porCategoria };
}

// Vendas + receita por categoria (para a aba Categorias)
function vendasPorCategoria(linhas) {
  const cat = {};
  for (const c of VENDAS_CATEGORIAS) cat[c] = { vendas: 0, receita: 0, custo: 0 };
  for (const l of linhas) {
    const c = cat[l.categoria] || (cat[l.categoria] = { vendas: 0, receita: 0, custo: 0 });
    c.vendas += l.qtd;
    c.receita += l.receita;
    c.custo  += vendasCustoLinha(l);
  }
  return cat;
}

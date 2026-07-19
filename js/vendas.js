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

// Opção "solta" (sem option_group_name) é ambígua — combos costumam listar
// metades de pizza lado a lado com bebidas de verdade, ambas sem grupo. Só
// decide que é bebida se o nome não corresponder a nenhum sabor cadastrado.
function _vSaborCadastrado(nome) {
  if (typeof vendasOpcaoDeSabor !== 'function') return false;
  const key = _cwSaborKey(nome);
  if (!key) return false;
  return !!vendasOpcaoDeSabor(key);
}

// Interpreta 1 item de pedido → { pizzas:[...], bebidas:[...] }
function _vInterpretarItem(it) {
  const opts    = it.options || [];
  const porGrupo = {}; // option_group_id → { tamanho, meias }
  const bebidas  = [];
  const soltas   = []; // opções sem grupo que resolveram como sabor de pizza
  const inteiras = []; // pizzas inteiras próprias (ver comentário abaixo)
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
      // Tamanho vem do próprio nome da opção ("Sabor | Pizza Grande/Pequena").
      // "1/2 X | Pizza Y" é METADE de uma pizza compartilhada (agrupa pelo
      // option_group_id, como sempre) — mas sabor SEM "1/2" é uma pizza
      // INTEIRA própria. "Dia da Pizza" deixa escolher 2 pizzas inteiras na
      // mesma compra, ambas com o MESMO option_group_id — agrupar por gid
      // juntaria as duas numa só (contando 1 pizza em vez de 2).
      const tamanho  = _vTam(o.name);
      const ehMetade = /^\s*1\/2\b/.test(o.name || '');
      if (ehMetade) {
        const gid = 'opc-' + (o.option_group_id ?? o.name);
        if (!porGrupo[gid]) porGrupo[gid] = { tamanho, meias: {} };
        _vAddMeia(porGrupo[gid].meias, o.name, o.quantity);
      } else {
        const key = _cwSaborKey(o.name);
        if (key) inteiras.push({ tamanho, meias: { [key]: 2 * (o.quantity || 1) } });
      }
    } else if (!g) {
      if (_vSaborCadastrado(o.name)) soltas.push(o);
      else bebidas.push({ nome: o.name, qtd: o.quantity || 1 });
    }
  }

  let pizzas = Object.values(porGrupo).filter(p => Object.keys(p.meias).length);
  pizzas.push(...inteiras);

  // Layout B: sabor no nome do item, tamanho na opção de tamanho
  if (!pizzas.length && sizeOpt) {
    const meias = {};
    (it.name || '').split('|')[0].split('+').forEach(p => _vAddMeia(meias, p, 1));
    if (Object.keys(meias).length) pizzas = [{ tamanho: _vTam(sizeOpt.name), meias }];
  }

  // Layout C: tudo embutido no nome do item ("Sabor1 + Sabor2 | Pizza Grande"),
  // sem nenhuma opção — variante de combo que o CW manda com options:[].
  if (!pizzas.length && !opts.length) {
    const parteTam = ((it.name || '').split('|')[1] || '').trim();
    if (_RE_SIZE_OPT.test(parteTam)) {
      const meias = {};
      (it.name || '').split('|')[0].split('+').forEach(p => _vAddMeia(meias, p, 1));
      if (Object.keys(meias).length) pizzas = [{ tamanho: _vTam(parteTam), meias }];
    }
  }

  // Opções soltas de combo (sem option_group_id pra parear as metades) —
  // agrupa 2 a 2 na ordem em que vieram (metades de uma mesma pizza costumam
  // vir adjacentes); sabor "inteiro" (sem "1/2") vira 1 pizza com 2 meias.
  // Tamanho aproximado pelo nome do item — combos com tamanhos mistos podem
  // classificar o tamanho errado, mas o sabor/custo do recheio fica correto.
  if (soltas.length) {
    const tamanho = _vTam(it.name || '');
    let buffer = null;
    for (const o of soltas) {
      const ehMetade = /^\s*1\/2\b/.test(o.name || '');
      if (!ehMetade) {
        pizzas.push({ tamanho, meias: { [_cwSaborKey(o.name)]: 2 } });
        continue;
      }
      if (!buffer) { buffer = { tamanho, meias: {} }; pizzas.push(buffer); }
      _vAddMeia(buffer.meias, o.name, o.quantity);
      if (Object.keys(buffer.meias).length >= 2) buffer = null; // pizza fechou, próxima metade abre outra
    }
  }

  // Item avulso — sem opções e sem marcação estrutural de pizza/combo no
  // nome. Raro, mas existe pizza de sabor único sem "|" nem opção nenhuma
  // (ex.: "Pizza Nutella", preço 0, aninhada em outro item) — antes de
  // assumir bebida de revenda, tenta casar o nome com um sabor cadastrado.
  if (!pizzas.length && !opts.length && !sizeOpt
      && !/combo|promo|pizza\s+(grande|pequena)/i.test(it.name || '')
      && !/\|\s*pizza/i.test(it.name || '')) {
    if (_vSaborCadastrado(it.name)) {
      pizzas = [{ tamanho: _vTam(it.name || ''), meias: { [_cwSaborKey(it.name)]: 2 } }];
    } else {
      bebidas.push({ nome: it.name, qtd: it.quantity || 1 });
    }
  }

  return { pizzas, bebidas };
}

// Categoria (espelha o catálogo do CW, derivada da estrutura do item)
function _vCategoria(it) {
  const n = _cwNorm(it.name);
  if (/combo/.test(n)) return 'Vai Ter Combo';
  // "Dia da Pizza" é um item de Promo do Dia no catálogo do CW, mas não tem
  // a palavra "promo" no nome (o pedido sincronizado não traz categoria
  // nenhuma do catálogo — só dá pra inferir pelo nome/estrutura do item).
  // Também evita cair em Pizza Doce/Salgada por engano: esse item deixa
  // escolher 1 sabor doce E 1 salgado na mesma pizza (mista), então nenhuma
  // das duas categorias representaria a venda corretamente.
  if (/promo/.test(n) || /dia da pizza/.test(n)) return 'Promo do Dia';
  const temSlot = (it.options || []).some(o => _RE_SLOT.test(o.option_group_name || ''));
  if (temSlot || _RE_SLOT.test(it.name)) return 'Monte seu Sabor';
  // Pizza de sabor único pode vir com o tamanho só na opção de tamanho
  // (layout B, sizeOpt) OU com "Sabor | Pizza Tamanho" embutido na própria
  // opção (mesmo padrão que _vInterpretarItem já reconhece como sabor) —
  // sem checar a opção, esses itens caíam por padrão em "Bebidas".
  const optPizza = (it.options || []).find(o => _RE_SIZE_OPT.test(o.name || '') || /\|\s*pizza/i.test(o.name || ''));
  if (!(/\|\s*pizza/.test(n) || optPizza)) {
    // Sem nenhuma marcação estrutural (raro: item sem opções nem "|" no
    // nome) — último recurso: o próprio nome bate com um sabor cadastrado?
    if (!(it.options || []).length) {
      const opc = typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(_cwSaborKey(it.name)) : null;
      if (opc) return opc.categoria === 'doce' ? 'Pizza Doce' : 'Pizza Salgada';
    }
    return 'Bebidas';
  }
  // O sabor realmente escolhido (via Opção cadastrada) decide doce/salgada —
  // não o texto do grupo. Promos como "Dia da Pizza" usam um grupo único
  // "Salgada e Doce" pros dois tipos juntos, então checar "doce" no texto do
  // grupo classifica errado qualquer sabor salgado vendido por ali.
  if (optPizza) {
    const opc = typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(_cwSaborKey(optPizza.name)) : null;
    if (opc) return opc.categoria === 'doce' ? 'Pizza Doce' : 'Pizza Salgada';
  }
  const ehDoce = /doce/.test(n) || /doce/i.test(optPizza?.option_group_name || '') || /doce/i.test(optPizza?.name || '');
  return ehDoce ? 'Pizza Doce' : 'Pizza Salgada';
}

const VENDAS_CATEGORIAS = ['Promo do Dia', 'Vai Ter Combo', 'Monte seu Sabor', 'Pizza Salgada', 'Pizza Doce', 'Bebidas'];

// Interpreta 1 pedido → array de linhas de venda
function _vInterpretarPedido(p) {
  const linhas = [];
  const ts    = p.cw_created_at;
  const canal = typeof _cwMapCanal === 'function' ? _cwMapCanal(p.sales_channel) : p.sales_channel;
  for (const it of (p.items || [])) {
    if (it.status === 'canceled') continue;

    // Alguns combos vêm com os sub-itens ANINHADOS dentro do próprio item
    // (it.items — cada um já com options completas), em vez de tudo solto em
    // it.options. Sem isso, o container ("Combo Duo") não tinha ficha pra
    // extrair e ficava sem pizza/bebida nenhuma (linha descartada por inteiro)
    // — o combo inteiro sumia do CMV. Processa cada sub-item com o motor
    // normal e junta tudo numa linha só, categorizada pelo container (que
    // carrega o nome "Combo X" e o preço total real da venda).
    let pizzas, bebidas;
    if (it.items && it.items.length) {
      pizzas = []; bebidas = [];
      for (const sub of it.items) {
        if (sub.status === 'canceled') continue;
        const r = _vInterpretarItem(sub);
        pizzas.push(...r.pizzas);
        bebidas.push(...r.bebidas);
      }
    } else {
      ({ pizzas, bebidas } = _vInterpretarItem(it));
    }

    if (!pizzas.length && !bebidas.length) continue;
    linhas.push({
      pedidoId:  p.id,
      ts, canal,
      categoria: _vCategoria(it),
      nome:      it.name,
      qtd:       it.quantity || 1,
      receita:   it.total_price ?? it.unit_price ?? 0, // preço de tabela do item (ajustado abaixo)
      pizzas, bebidas,
    });
  }

  // O preço de tabela por item não reflete desconto aplicado no fechamento
  // do pedido (cupom, "pague 1 leve 2", frete grátis promocional...) — só
  // o total do PEDIDO (p.total, o mesmo valor que bate com o Cardápio Web
  // no Dashboard → Performance) é o valor real vendido. Reaplica esse total
  // proporcionalmente entre as linhas, senão a receita do CMV fica sempre
  // maior que a venda real de verdade.
  const somaBruta = linhas.reduce((s, l) => s + l.receita, 0);
  if (somaBruta > 0 && typeof p.total === 'number') {
    const fator = p.total / somaBruta;
    for (const l of linhas) l.receita *= fator;
  }

  return linhas;
}

// ── Carga + cache ──────────────────────────────────────────────

let _vLinhas = null;   // cache do CMV (janela por dias)
let _vPeriodoDias = 90;
const _vCache = {};    // cache por chave de período (Insumos usa range custom)

// Busca + interpreta pedidos entre [inicioISO, fimISO]. Pagina (PostgREST
// corta em 1000/request). Não cacheia — quem cacheia é o chamador.
async function _vFetchPeriodo(inicioISO, fimISO) {
  const sb = _cwGetSbClient();
  const PAGE = 1000;
  const linhas = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('cw_pedidos')
      .select('id, items, sales_channel, total, cw_created_at, status')
      .gte('cw_created_at', inicioISO)
      .order('cw_created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (fimISO) q = q.lte('cw_created_at', fimISO);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const p of (data || [])) {
      if (p.status === 'canceling' || p.status === 'canceled') continue;
      for (const l of _vInterpretarPedido(p)) linhas.push(l);
    }
    if (!data || data.length < PAGE) break;
  }
  return linhas;
}

async function vendasCarregar(dias = 90, forcar = false) {
  if (_vLinhas && !forcar && dias === _vPeriodoDias) return _vLinhas;
  _vPeriodoDias = dias;
  const inicio = new Date(Date.now() - dias * 864e5).toISOString();
  _vLinhas = await _vFetchPeriodo(inicio, null);
  return _vLinhas;
}

// Carga por período explícito (usada pela aba Insumos). Cacheia por chave.
async function vendasCarregarPeriodo(inicioISO, fimISO, forcar = false) {
  const chave = inicioISO + '|' + (fimISO || '');
  if (_vCache[chave] && !forcar) return _vCache[chave];
  _vCache[chave] = await _vFetchPeriodo(inicioISO, fimISO);
  return _vCache[chave];
}

// ── Resolução de custo (saborKey → Opção; bebida → Produto/insumo) ──

// Devolve a Opção mais provável para um sabor. Prioridade: override manual
// (vtp_cw_mapa.sabores), senão a melhor por similaridade (_cwRank ≥ 0.6).
function vendasOpcaoDeSabor(saborKey) {
  if (typeof _cwMapa === 'object' && _cwMapa?.sabores?.[saborKey]) {
    const o = opcoes.find(x => x.id === _cwMapa.sabores[saborKey].opcaoId);
    if (o) return o;
  }
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

// Meias por dia da semana (0=Dom … 6=Sáb) — insumo pra Previsão dimensionar
// o porcionamento por dia. Também devolve nº de dias distintos observados
// por dia-da-semana, pra calcular a média por dia.
function vendasMeiasPorDiaSemana(linhas) {
  const dow = Array.from({ length: 7 }, () => ({ grande: 0, pequena: 0, total: 0, datas: new Set() }));
  for (const l of linhas) {
    const d = new Date(l.ts);
    const wd = d.getDay();
    const dia = (l.ts || '').slice(0, 10);
    for (const pz of l.pizzas) {
      const n = Object.values(pz.meias).reduce((a, b) => a + b, 0);
      dow[wd][pz.tamanho] += n;
      dow[wd].total += n;
      if (dia) dow[wd].datas.add(dia);
    }
  }
  return dow.map(x => ({ grande: x.grande, pequena: x.pequena, total: x.total, dias: x.datas.size }));
}

// ── Consumo de INSUMOS (aba Insumos) ───────────────────────────
// Expande a ficha técnica de cada pizza vendida (base + opções) em
// quantidades de insumo, na unidade nativa de cada um. A quantidade da
// ficha (peso_g no modo produto/opção) já está na unidade do insumo.
function _vExpandeFicha(ficha, mult, tamanho, acc) {
  for (const ing of (ficha?.ingredientes || [])) {
    const ins = items.find(i => i.id === ing.item_id);
    if (!ins) continue;
    if (!acc[ins.id]) acc[ins.id] = { id: ins.id, nome: ins.name, unidade: ins.unit, cat: ins.cat, custoUn: ins.cost || 0, grande: 0, pequena: 0 };
    acc[ins.id][tamanho] += (ing.peso_g || 0) * mult;
  }
}

// Consumo de insumos das PIZZAS vendidas (base + coberturas), separado por
// tamanho. Só entram insumos que aparecem em alguma ficha técnica.
function vendasInsumosConsumidos(linhas) {
  const acc = {};
  for (const l of linhas) {
    for (const pz of l.pizzas) {
      const base = produtosPizza.find(p => new RegExp(pz.tamanho, 'i').test(p.nome));
      if (base) _vExpandeFicha(base.fichaTecnica, 1, pz.tamanho, acc);
      for (const [k, meias] of Object.entries(pz.meias)) {
        const opc = vendasOpcaoDeSabor(k);
        if (opc) _vExpandeFicha(opc.fichaTecnica, meias, pz.tamanho, acc);
      }
    }
  }
  const arr = Object.values(acc).map(x => {
    const total = x.grande + x.pequena;
    return { ...x, total, custo: total * x.custoUn };
  });
  const custoTotal = arr.reduce((s, x) => s + x.custo, 0);
  arr.forEach(x => x.pct = custoTotal > 0 ? x.custo / custoTotal * 100 : 0);
  arr.sort((a, b) => b.custo - a.custo);
  return { insumos: arr, custoTotal };
}

// ── Curva ABC de sabores (aba Produtos) ────────────────────────
// metrica: 'qtd' (meias vendidas) ou 'receita' (rateada). Na receita, o
// valor da linha é distribuído entre as meias da linha (combo/meio a meio
// dividem proporcionalmente) — aproximação honesta, sinalizada na UI.
function vendasABCsabores(linhas, metrica = 'qtd') {
  // Agrupa pela Opção resolvida (assim "milho" e "milho verde", que a
  // similaridade manda pra mesma Opção, viram uma linha só). Sem Opção,
  // agrupa pela própria chave do sabor.
  const acc = {}; // grupo → { nome, valor, grande, pequena }
  for (const l of linhas) {
    const totMeias = l.pizzas.reduce((s, pz) => s + Object.values(pz.meias).reduce((a, b) => a + b, 0), 0);
    for (const pz of l.pizzas) {
      for (const [k, meias] of Object.entries(pz.meias)) {
        const opc = vendasOpcaoDeSabor(k);
        const g   = opc ? 'opc' + opc.id : 'k:' + k;
        if (!acc[g]) acc[g] = { nome: opc ? opc.nome : _cwTitulo(k), valor: 0, grande: 0, pequena: 0 };
        acc[g].valor += metrica === 'receita'
          ? (totMeias > 0 ? l.receita * (meias / totMeias) : 0)
          : meias;
        acc[g][pz.tamanho] += meias;
      }
    }
  }
  const arr = Object.values(acc).sort((a, b) => b.valor - a.valor);
  const total = arr.reduce((s, x) => s + x.valor, 0);
  let cum = 0;
  arr.forEach(x => {
    cum += x.valor;
    x.pct = total > 0 ? x.valor / total * 100 : 0;
    x.cumPct = total > 0 ? cum / total * 100 : 0;
    x.classe = x.cumPct <= 80 ? 'A' : x.cumPct <= 95 ? 'B' : 'C';
  });
  return { itens: arr, total };
}

// Receita + custo por canal (aba Canais). A comissão é aplicada na UI
// (cadastro editável), pra ver a margem líquida por canal.
function vendasPorCanal(linhas) {
  const acc = {};
  for (const l of linhas) {
    const c = l.canal || 'outro';
    if (!acc[c]) acc[c] = { canal: c, vendas: 0, receita: 0, custo: 0 };
    acc[c].vendas += l.qtd;
    acc[c].receita += l.receita;
    acc[c].custo  += vendasCustoLinha(l);
  }
  return acc;
}

// Comportamento de compra: vendas por hora do dia, dia da semana e canal.
function vendasComportamento(linhas) {
  const porHora = Array(24).fill(0);
  const porDia = Array(7).fill(0);
  const porCanal = {};
  for (const l of linhas) {
    const d = new Date(l.ts);
    porHora[d.getHours()] += l.qtd;
    porDia[d.getDay()] += l.qtd;
    porCanal[l.canal] = (porCanal[l.canal] || 0) + l.qtd;
  }
  return { porHora, porDia, porCanal };
}

// Vendas + receita por categoria (para a aba Categorias)
function vendasPorCategoria(linhas) {
  const cat = {};
  for (const c of VENDAS_CATEGORIAS) cat[c] = { vendas: 0, receita: 0, custo: 0, meiasG: 0, meiasP: 0 };
  for (const l of linhas) {
    const c = cat[l.categoria] || (cat[l.categoria] = { vendas: 0, receita: 0, custo: 0, meiasG: 0, meiasP: 0 });
    c.vendas += l.qtd;
    c.receita += l.receita;
    c.custo  += vendasCustoLinha(l);
    for (const pz of l.pizzas) {
      const n = Object.values(pz.meias).reduce((a, b) => a + b, 0);
      if (pz.tamanho === 'grande') c.meiasG += n; else c.meiasP += n;
    }
  }
  return cat;
}

// Produtos (sabores/bebidas) que aparecem em cada categoria, com nº de vendas.
// Sabor vem com a divisão por tamanho (grande/pequena) — pizza grande sempre
// leva 2 opções (meio a meio) e pizza pequena 1 opção (sabor único) — e a
// categoria soma quantas pizzas grandes/pequenas ela tem, pro custo da base
// (massa, caixa, embalagem) aparecer separado do custo do recheio.
function vendasProdutosPorCategoria(linhas) {
  const cat = {};
  const g = c => cat[c] || (cat[c] = { sabores: {}, bebidas: {}, pizzasGrande: 0, pizzasPequena: 0 });
  for (const l of linhas) {
    const c = g(l.categoria);
    for (const pz of l.pizzas) {
      if (pz.tamanho === 'grande') c.pizzasGrande++; else c.pizzasPequena++;
      for (const [k, m] of Object.entries(pz.meias)) {
        const s = c.sabores[k] || (c.sabores[k] = { grande: 0, pequena: 0, total: 0 });
        s[pz.tamanho] += m;
        s.total += m;
      }
    }
    for (const b of l.bebidas) c.bebidas[_cwNorm(b.nome)] = (c.bebidas[_cwNorm(b.nome)] || 0) + (b.qtd || 1);
  }
  return cat;
}

// Sabores e bebidas vendidos que NÃO resolvem numa ficha (pendências)
function vendasPendencias(linhas) {
  const sab = {}, beb = {};
  for (const l of linhas) {
    for (const pz of l.pizzas) for (const [k, m] of Object.entries(pz.meias)) sab[k] = (sab[k] || 0) + m;
    for (const b of l.bebidas) beb[_cwNorm(b.nome)] = (beb[_cwNorm(b.nome)] || 0) + (b.qtd || 1);
  }
  const sabPend = Object.entries(sab).filter(([k]) => !vendasOpcaoDeSabor(k))
    .map(([k, n]) => ({ nome: k, vendas: n })).sort((a, b) => b.vendas - a.vendas);
  const bebPend = Object.entries(beb).filter(([n]) => {
    const c = _cwRank(n, _cwPoolBebidas(), 'nome', 1)[0];
    return !(c && c.s >= 0.6);
  }).map(([n, q]) => ({ nome: n, vendas: q })).sort((a, b) => b.vendas - a.vendas);
  return { sabPend, bebPend };
}

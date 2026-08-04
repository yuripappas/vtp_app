/**
 * VTP Compras — Previsão: camada de dados reais (cw_pedidos)
 *
 * Busca e agrega pedidos reais do Cardápio Web (via Supabase) pra
 * alimentar a Previsão — substitui o histórico digitado à mão
 * (vtp_hist_api). Reaproveita o motor de interpretação de pedidos já
 * usado pelo CMV (js/vendas.js: _vInterpretarPedido, vendasOpcaoDeSabor)
 * e o cálculo de tempo real de entrega (js/cw-api.js: _cwCalcTempos),
 * então pizza/sabor/tempo nunca divergem entre os módulos.
 *
 * Nenhuma função aqui toca o DOM — só busca e agrega dados. Quem decide
 * o que excluir da média (dias atípicos) e aplica os fatores do dia
 * (chuva/feriado/evento) é o previsao.js.
 */

// ══════════════════════════════════════════════════════════════
// BUSCA (Supabase)
// ══════════════════════════════════════════════════════════════

// Mesma paginação de _vFetchPeriodo/_getPedidosCW (PostgREST corta em
// 1000/request). Traz os campos extras que a Previsão precisa e o CMV não
// busca: order_type (delivery?) e status_timestamps (tempo real de
// entrega).
async function _prevFetchPeriodo(inicioISO, fimISO) {
  const sb = _cwGetSbClient();
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('cw_pedidos')
      .select('id, items, sales_channel, total, cw_created_at, status, order_type, status_timestamps')
      .gte('cw_created_at', inicioISO)
      .order('cw_created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (fimISO) q = q.lte('cw_created_at', fimISO);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out.filter(p => p.status !== 'canceling' && p.status !== 'canceled');
}

// Classifica 1 pizza (tamanho+meias) em salgada/doce pela Opção do
// primeiro sabor — regra do negócio: pizza nunca mistura doce e salgado
// no mesmo meio a meio (confirmada em js/vendas.js).
function _prevCategoriaPizza(pz) {
  const chave = Object.keys(pz.meias || {})[0];
  const opc = chave && typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(chave) : null;
  return opc?.categoria === 'doce' ? 'doce' : 'salgada';
}

// Data local (YYYY-MM-DD) de um timestamp — cw_created_at vem em UTC, e
// fazer .slice(0,10) direto na string pega a data UTC, não a local. Pra
// pedidos de fim de noite (ex.: 23h de terça em UTC-3 = já é quarta em
// UTC) isso jogava o pedido pro dia seguinte, misturando dias da semana
// na mesma lista. new Date().getDay()/.getDate() já convertem pro fuso
// local do navegador, então usamos eles pra montar a data também.
function _prevDataLocal(isoString) {
  const d = new Date(isoString);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Agrega 1 pedido cru no formato interno da Previsão: pizzas por
// tamanho×categoria, meias por sabor (mix + insumos), hora do pedido,
// se é delivery, tempo real de entrega (se já foi entregue).
function _prevAgregarPedido(p) {
  const linhas = _vInterpretarPedido(p);
  const hora = new Date(p.cw_created_at).getHours();
  const isDelivery = p.order_type === 'delivery';
  const tEntrega = isDelivery ? _cwCalcTempos(p.status_timestamps, p.order_type).tempoEntrega : null;

  const pizzas = { grSal: 0, pqSal: 0, grDoc: 0, pqDoc: 0 };
  const meiasPorSabor = {};

  for (const l of linhas) {
    for (const pz of l.pizzas) {
      const cat   = _prevCategoriaPizza(pz);
      const chave = (pz.tamanho === 'grande' ? 'gr' : 'pq') + (cat === 'doce' ? 'Doc' : 'Sal');
      pizzas[chave]++;
      for (const [k, meias] of Object.entries(pz.meias)) {
        meiasPorSabor[k] = meiasPorSabor[k] || { grande: 0, pequena: 0 };
        meiasPorSabor[k][pz.tamanho] += meias;
      }
    }
  }
  return { hora, isDelivery, tEntrega, pizzas, meiasPorSabor };
}

// Busca crua dos pedidos da janela de lookback (uma vez só) — quem chama
// decide como bucketizar. Separado de prevCarregarSemanas pra permitir
// reaproveitar o mesmo fetch pra vários dias da semana de uma vez (visão
// de período: uma semana inteira tem até 7 dias-da-semana diferentes, e
// sem isso cada um exigiria sua própria ida ao Supabase).
async function _prevFetchLookback(nSemanas) {
  const dias   = nSemanas * 7 + 7; // margem de 1 semana pra garantir n ocorrências
  const inicio = new Date(Date.now() - dias * 864e5).toISOString();
  return _prevFetchPeriodo(inicio, null);
}

// Bucketiza pedidos crus (já buscados) por DATA, filtrando só as
// ocorrências de `diaSemana` (0=Dom…6=Sáb). Devolve array ordenado do mais
// antigo pro mais recente, limitado às últimas `nSemanas` ocorrências.
function _prevBucketizarPorDiaSemana(pedidos, diaSemana, nSemanas) {
  const porData = {};
  for (const p of pedidos) {
    const dataLocal = new Date(p.cw_created_at);
    if (dataLocal.getDay() !== diaSemana) continue;
    const dataISO = _prevDataLocal(p.cw_created_at);
    if (!porData[dataISO]) {
      porData[dataISO] = {
        data: dataISO,
        pedidos: 0,
        pedidosDelivery: 0,
        pizzas: { grSal: 0, pqSal: 0, grDoc: 0, pqDoc: 0 },
        meiasPorSabor: {},
        pedidosPorHora: {},
        temposEntrega: [],
      };
    }
    const dia = porData[dataISO];
    const agg = _prevAgregarPedido(p);
    dia.pedidos++;
    if (agg.isDelivery) dia.pedidosDelivery++;
    dia.pedidosPorHora[agg.hora] = (dia.pedidosPorHora[agg.hora] || 0) + 1;
    if (agg.tEntrega != null) dia.temposEntrega.push(agg.tEntrega);
    for (const k of Object.keys(dia.pizzas)) dia.pizzas[k] += agg.pizzas[k];
    for (const [k, m] of Object.entries(agg.meiasPorSabor)) {
      dia.meiasPorSabor[k] = dia.meiasPorSabor[k] || { grande: 0, pequena: 0 };
      dia.meiasPorSabor[k].grande  += m.grande;
      dia.meiasPorSabor[k].pequena += m.pequena;
    }
  }
  return Object.values(porData)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-nSemanas);
}

// Carrega e agrega, por DATA, todas as ocorrências de `diaSemana`
// (0=Dom…6=Sáb) dentro da janela de `nSemanas`. Devolve array ordenado do
// mais antigo pro mais recente — pronto pra ponderar por recência.
async function prevCarregarSemanas(diaSemana, nSemanas = 8) {
  const pedidos = await _prevFetchLookback(nSemanas);
  return _prevBucketizarPorDiaSemana(pedidos, diaSemana, nSemanas);
}

// Visão de período: busca os pedidos UMA vez e bucketiza pra cada dia da
// semana presente em `diasSemana` (array de 0-6, sem repetir). Devolve
// { [diaSemana]: validosArray } — uma "base" por dia da semana envolvido.
async function prevCarregarSemanasMultiplas(diasSemana, nSemanas = 8) {
  const pedidos = await _prevFetchLookback(nSemanas);
  const resultado = {};
  for (const ds of diasSemana) resultado[ds] = _prevBucketizarPorDiaSemana(pedidos, ds, nSemanas);
  return resultado;
}

// ══════════════════════════════════════════════════════════════
// MATEMÁTICA — ponderação por recência (tendência de crescimento)
// ══════════════════════════════════════════════════════════════

// Peso linear crescente (mais antigo=1 … mais recente=n). Operação nova
// ainda em crescimento: dá mais voz às semanas recentes sem descartar de
// vez as mais antigas (diferente de olhar só a última semana).
function prevMediaPonderada(validos, getNum) {
  let somaPeso = 0, soma = 0;
  validos.forEach((d, i) => {
    const peso = i + 1;
    somaPeso += peso;
    soma += (getNum(d) || 0) * peso;
  });
  return somaPeso > 0 ? soma / somaPeso : 0;
}

// Tendência: compara a média ponderada da metade mais recente vs. a
// metade mais antiga da janela — só pra exibir "+X%" na Seção 1.
function prevTendencia(validos) {
  if (validos.length < 4) return null;
  const meio = Math.floor(validos.length / 2);
  const antiga  = validos.slice(0, meio);
  const recente = validos.slice(meio);
  const mAntiga  = antiga.reduce((s, d) => s + d.pedidos, 0) / antiga.length;
  const mRecente = recente.reduce((s, d) => s + d.pedidos, 0) / recente.length;
  if (!mAntiga) return null;
  return Math.round((mRecente - mAntiga) / mAntiga * 100);
}

function prevPctDeliveryPonderado(validos) {
  let somaPeso = 0, somaDel = 0, somaPed = 0;
  validos.forEach((d, i) => {
    const peso = i + 1;
    somaPeso += peso;
    somaDel += (d.pedidosDelivery || 0) * peso;
    somaPed += (d.pedidos || 0) * peso;
  });
  return somaPed > 0 ? somaDel / somaPed : 0;
}

// Participação percentual de cada sabor sobre o total de meias históricas
// (ponderado por recência, por tamanho — soma ~1 dentro de cada tamanho).
// Baseline "hoje" antes de fatores/promoções. Devolve SHARE (%), não
// volume absoluto: previsao.js distribui esse % em cima do total FINAL de
// pizzas (masGrFin/masPqFin, já com margem/sobra/ajuste manual aplicados)
// — assim a soma das meias por sabor sempre bate com a massa/embalagem,
// em vez de vir de um cálculo paralelo que podia divergir.
function prevShareSabores(validos) {
  const chaves = new Set();
  validos.forEach(d => Object.keys(d.meiasPorSabor).forEach(k => chaves.add(k)));
  const mediaPorSabor = {};
  let totalGrande = 0, totalPequena = 0;
  chaves.forEach(k => {
    const g = prevMediaPonderada(validos, d => d.meiasPorSabor[k]?.grande  || 0);
    const p = prevMediaPonderada(validos, d => d.meiasPorSabor[k]?.pequena || 0);
    mediaPorSabor[k] = { grande: g, pequena: p };
    totalGrande += g; totalPequena += p;
  });
  const shares = {};
  chaves.forEach(k => {
    shares[k] = {
      grande:  totalGrande  > 0 ? mediaPorSabor[k].grande  / totalGrande  : 0,
      pequena: totalPequena > 0 ? mediaPorSabor[k].pequena / totalPequena : 0,
    };
  });
  return shares;
}

// Desloca a participação de 1+ sabores promovidos (boostPct%, ex:
// Calabresa +50%) e renormaliza TODOS os shares daquele tamanho pra somar
// 1 de novo — a promoção muda o MIX, não o volume total do dia (volume
// total já tem seu próprio ajuste via fator "Evento", em previsao.js).
function prevAplicarPromocoes(shares, promocoes) {
  if (!promocoes?.length) return shares;
  const ajustado = {};
  for (const [k, v] of Object.entries(shares)) ajustado[k] = { ...v };

  for (const tam of ['grande', 'pequena']) {
    for (const promo of promocoes) {
      const mult = 1 + (promo.boostPct || 0) / 100;
      for (const k of Object.keys(ajustado)) {
        const opc = typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(k) : null;
        if (opc?.id === promo.opcaoId) ajustado[k][tam] *= mult;
      }
    }
    const soma = Object.values(ajustado).reduce((s, v) => s + v[tam], 0);
    if (soma > 0) for (const k of Object.keys(ajustado)) ajustado[k][tam] /= soma;
  }
  return ajustado;
}

// Curva horária real (substitui _CURVA_HORARIA fixa) — média ponderada de
// pedidos por hora, normalizada em %.
function prevCurvaHoraria(validos, horas = [17, 18, 19, 20, 21, 22, 23]) {
  const medias = {};
  let soma = 0;
  horas.forEach(h => {
    const m = prevMediaPonderada(validos, d => d.pedidosPorHora[h] || 0);
    medias[h] = m;
    soma += m;
  });
  const pct = {};
  horas.forEach(h => { pct[h] = soma > 0 ? medias[h] / soma : 1 / horas.length; });
  return { medias, pct, soma };
}

// Divide a produção de massa em 2 janelas (17h–20h / 20h–23h) a partir da
// curva horária real e da projeção de pizzas de hoje.
function prevProjecaoPorJanela(pizzasHojeGr, pizzasHojePq, curvaPct) {
  let pctJanela1 = 0;
  for (let h = 17; h < 20; h++) pctJanela1 += curvaPct[h] || 0;
  pctJanela1 = Math.min(1, Math.max(0, pctJanela1));
  const j1Gr = Math.round(pizzasHojeGr * pctJanela1);
  const j1Pq = Math.round(pizzasHojePq * pctJanela1);
  return {
    pctJanela1,
    pctJanela2: 1 - pctJanela1,
    janela1: { grande: j1Gr, pequena: j1Pq },
    janela2: { grande: pizzasHojeGr - j1Gr, pequena: pizzasHojePq - j1Pq },
  };
}

// Tempo médio real de entrega (referência informativa ao lado do
// parâmetro configurável de capacidade do motoboy).
function prevTempoEntregaMedio(validos) {
  const todos = validos.flatMap(d => d.temposEntrega);
  if (!todos.length) return null;
  return Math.round(todos.reduce((a, b) => a + b, 0) / todos.length);
}

// ══════════════════════════════════════════════════════════════
// MASSA — kg a produzir + insumos da própria receita da massa
// ══════════════════════════════════════════════════════════════

// Acha o ingrediente "massa" dentro da ficha técnica base de um tamanho —
// o único ingrediente isProd com nome contendo "massa" (molho e embalagem
// são itens comuns, não preparados). Detectar por nome em vez de fixar um
// ID: se o cadastro trocar de item, a Previsão acompanha sozinha.
function prevItemMassa(produtoPizza) {
  const ing = produtoPizza?.fichaTecnica?.ingredientes?.find(g => {
    const it = items.find(i => i.id === g.item_id);
    return it?.isProd && /massa/i.test(it.name);
  });
  if (!ing) return null;
  const it = items.find(i => i.id === ing.item_id);
  return { itemId: it.id, nome: it.name, pesoPorPizzaKg: ing.peso_g, ficha: it.fichaTecnica };
}

// Peso de massa (kg) por pizza grande/pequena, direto da ficha técnica —
// usado pra calcular o kg de cada lote individualmente (prevPlanoMassa dá
// só o total do dia).
function prevPesoMassaPorPizza() {
  const baseGr = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /grande/i.test(p.nome));
  const basePq = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /pequena/i.test(p.nome));
  const infoGr = prevItemMassa(baseGr);
  const infoPq = prevItemMassa(basePq);
  return {
    grande: infoGr?.pesoPorPizzaKg || 0,
    pequena: infoPq?.pesoPorPizzaKg || 0,
    nome: infoGr?.nome || infoPq?.nome || 'Massa',
  };
}

// kg de massa a produzir hoje (grande/pequena, já com margem embutida em
// pizzasHojeTotais) + expansão da receita própria da massa (farinha, sal,
// fermento, orégano...) na proporção do rendimento_kg cadastrado —
// mesma mecânica de "fração do lote" que o CMV usa pra preparados
// (js/vendas.js:_vExpandeItem), aplicada só a este item.
function prevPlanoMassa(pizzasHojeTotais) {
  const baseGr = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /grande/i.test(p.nome));
  const basePq = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /pequena/i.test(p.nome));
  const infoGr = prevItemMassa(baseGr);
  const infoPq = prevItemMassa(basePq);
  const acc = {};
  const semFicha = new Set();

  function expandeMassa(info, nPizzas, rotulo) {
    if (!info || !(nPizzas > 0)) return 0;
    const kg = info.pesoPorPizzaKg * nPizzas;
    const rend = info.ficha?.rendimento_kg;
    if (!(rend > 0) || !info.ficha?.ingredientes?.length) {
      semFicha.add(`${info.nome} (${rotulo})`);
      return kg;
    }
    const fracao = kg / rend;
    for (const ing of info.ficha.ingredientes) {
      const it = items.find(i => i.id === ing.item_id);
      if (!it) continue;
      const qtd = (ing.peso_g || 0) / 1000 * fracao;
      if (!acc[it.id]) acc[it.id] = { id: it.id, nome: it.name, unidade: it.unit, qtd: 0 };
      acc[it.id].qtd += qtd;
    }
    return kg;
  }

  const kgMassaGr = expandeMassa(infoGr, pizzasHojeTotais.grande, 'grande');
  const kgMassaPq = expandeMassa(infoPq, pizzasHojeTotais.pequena, 'pequena');

  return {
    itemIdGr: infoGr?.itemId ?? null,
    itemIdPq: infoPq?.itemId ?? null,
    kgMassaGr, kgMassaPq, kgMassaTotal: kgMassaGr + kgMassaPq,
    ingredientes: Object.values(acc).sort((a, b) => b.qtd - a.qtd),
    semFicha: Array.from(semFicha),
  };
}

// ══════════════════════════════════════════════════════════════
// INSUMOS PROJETADOS (item 3 — porcionamento pra pré-produção)
// ══════════════════════════════════════════════════════════════

// Projeta o consumo de insumos/preparados do dia a partir de contagens JÁ
// PROJETADAS (não de vendas reais, e já com margem de segurança embutida
// em pizzasHojeTotais/meiasPorSaborHoje — não aplica margem de novo aqui).
//
// Diferente de vendasInsumosConsumidos (js/vendas.js), que cascateia todo
// preparado (isProd) até o insumo cru pra dar custo de CMV, aqui a
// expansão PÁRA no primeiro nível: quem vai executar essa lista é o time
// de pré-produção, que quer saber "quanto Frango Desfiado deixar pronto",
// não "quanto frango cru comprar". Cada ingrediente listado direto na
// ficha técnica (base da pizza + sabor) é creditado como está, sem
// recursão — a ficha técnica (js/cadastros.js) já guarda peso_g na
// unidade nativa do item referenciado nesse nível (modo "flat"), sem
// conversão. A massa (ver prevPlanoMassa) é excluída daqui — ela já tem
// card próprio.
function prevInsumosProjetados(meiasPorSaborHoje, pizzasHojeTotais, idsExcluir) {
  const acc = {};
  const semFicha = new Set();
  const pular = idsExcluir || new Set();

  function credita(itemId, qtd) {
    if (!(qtd > 0) || pular.has(itemId)) return;
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    if (!acc[it.id]) acc[it.id] = { id: it.id, nome: it.name, unidade: it.unit, cat: it.cat || '', isProd: !!it.isProd, qtd: 0 };
    acc[it.id].qtd += qtd;
  }

  function expandeFicha(ficha, multQtd, nomeFonte) {
    if (!ficha?.ingredientes?.length) { semFicha.add(nomeFonte); return; }
    for (const ing of ficha.ingredientes) credita(ing.item_id, (ing.peso_g || 0) * multQtd);
  }

  const baseGr = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /grande/i.test(p.nome));
  const basePq = (typeof produtosPizza !== 'undefined' ? produtosPizza : []).find(p => /pequena/i.test(p.nome));
  if (pizzasHojeTotais.grande > 0) {
    if (baseGr) expandeFicha(baseGr.fichaTecnica, pizzasHojeTotais.grande, baseGr.nome);
    else semFicha.add('Base da pizza grande');
  }
  if (pizzasHojeTotais.pequena > 0) {
    if (basePq) expandeFicha(basePq.fichaTecnica, pizzasHojeTotais.pequena, basePq.nome);
    else semFicha.add('Base da pizza pequena');
  }

  for (const [saborKey, m] of Object.entries(meiasPorSaborHoje)) {
    const totalMeias = (m.grande || 0) + (m.pequena || 0);
    if (!(totalMeias > 0)) continue;
    const opc = typeof vendasOpcaoDeSabor === 'function' ? vendasOpcaoDeSabor(saborKey) : null;
    if (!opc) { semFicha.add(typeof _cwTitulo === 'function' ? _cwTitulo(saborKey) : saborKey); continue; }
    expandeFicha(opc.fichaTecnica, totalMeias, opc.nome);
  }

  const insumos = Object.values(acc).sort((a, b) => b.qtd - a.qtd);
  return { insumos, semFicha: Array.from(semFicha) };
}

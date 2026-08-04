/**
 * VTP Compras — Módulo de Previsão de Demanda v3
 * Dirigido por dados reais de cw_pedidos (js/previsao-dados.js) — sem
 * histórico manual. O usuário só edita "fatores do dia" (chuva, feriado,
 * evento, promoção) e pode ajustar pontualmente qualquer número final.
 */

// ══════════════════════════════════════════════════════════════
// CONFIG PADRÃO
// ══════════════════════════════════════════════════════════════
const CFG_PREV_DEFAULT = {
  // Histórico / tendência
  semanasHistorico:     8,    // nº de ocorrências do dia da semana consideradas
  // Massas
  margemSeguranca:      10,   // %
  limiteBatidaDividida: 40,   // pizzas até as 20h → acima disso, divide em 2 lotes
  kgFarinhaBatida:      10,   // kg por lote (referência p/ cálculo de fermento)
  // Fermento
  fermentoBasePorKg:    10,   // g/kg a temp de referência
  tempReferencia:       22,   // °C
  // Motoboys
  tempoMedioEntregaMin: 12.5, // minutos por entrega (10–15min informado pelo usuário)
  entregasPorMotoboyDia:20,   // referência/sanity check
  valorHoraNormal:      20,   // R$/h — dia normal (garantido)
  valorHoraDomFer:      25,   // R$/h — domingo/feriado (garantido)
  valorCorridaMedio:    9.5,  // R$ — média por entrega (radar de 5km, R$7 a R$11)
  horarioAbertura:      17,   // hora que a operação abre
  horarioFechamento:    23,   // hora que a operação fecha
  // WhatsApp
  waGrupo:              '',
};

let cfgPrev       = db._get('vtp_cfg_prev3', null) || { ...CFG_PREV_DEFAULT };
let exclusoesPrev = db._get('vtp_prev_exclusoes', {});   // { 'YYYY-MM-DD': motivo }
let planejamentos = db._get('vtp_planejamentos', []);

// Fatores do dia e ajustes manuais agora são salvos POR DATA — antes eram
// só da sessão (perdiam ao trocar de dia ou fechar o app). Cada chave é
// uma data 'YYYY-MM-DD'.
let _fatoresPorData = db._get('vtp_prev_fatores', {});
let _ajustesPorData = db._get('vtp_prev_ajustes', {});

const saveCfgPrev        = () => db._set('vtp_cfg_prev3',      cfgPrev);
const saveExclusoes      = () => db._set('vtp_prev_exclusoes', exclusoesPrev);
const savePlanej         = () => db._set('vtp_planejamentos',  planejamentos);
const saveFatoresPorData = () => db._set('vtp_prev_fatores',   _fatoresPorData);
const saveAjustesPorData = () => db._set('vtp_prev_ajustes',   _ajustesPorData);

const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

// Curva horária FIXA legada — não é mais usada pelo cálculo da Previsão
// (substituída pela curva real em previsao-dados.js), mas js/dashboard.js
// (aba Performance) ainda lê essa constante pro rótulo de "Pico" e pra
// coluna "Estimativa". Mantida só por compatibilidade.
const _CURVA_HORARIA = [
  { h:17, pct:0.05 }, { h:18, pct:0.15 }, { h:19, pct:0.25 },
  { h:20, pct:0.25 }, { h:21, pct:0.18 }, { h:22, pct:0.09 }, { h:23, pct:0.03 },
];

// Estado reativo
let _dataRef    = _prevHojeISO(); // data sendo visualizada (YYYY-MM-DD)
let _periodoFim = null;           // null = visão de 1 dia; senão, fim do período (YYYY-MM-DD)
// _fatores/_ajustes são REFERÊNCIAS aos objetos de _fatoresPorData[_dataRef]/
// _ajustesPorData[_dataRef] — mutar `_fatores.chuva = true` já mexe direto
// no objeto persistido; só falta chamar saveFatoresPorData() depois. São
// trocados (não recriados) toda vez que _dataRef muda, via
// _prevCarregarFatoresAjustes().
let _fatores    = _prevFatoresDefault();
let _ajustes    = _prevAjustesDefault();
let _resultado  = null;
let _sobraOntem = { gr: 0, pq: 0 };
let _dadosSemana = [];   // cru, todas as ocorrências buscadas (antes de excluir outliers)
let _base        = null; // agregados ponderados calculados uma vez por carga
let _carregando  = false;

function _prevHojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Data local (calendário, não UTC) 1 dia antes/depois de `dataISO` —
// meio-dia como âncora evita qualquer problema de fuso na virada.
function _prevDiaAnterior(dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _prevDiaSeguinte(dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _prevFatoresDefault() {
  return { chuva: false, feriado: false, evento: false, temperatura: 28, obs: '', promocoes: [] };
}
function _prevAjustesDefault() {
  return { pedidos: null, grandesFinal: null, pequenasFinal: null, motoboys: null };
}

// Aponta _fatores/_ajustes pros objetos persistidos da data em questão,
// criando com os defaults se ainda não existirem pra essa data.
function _prevCarregarFatoresAjustes(dataISO) {
  if (!_fatoresPorData[dataISO]) _fatoresPorData[dataISO] = _prevFatoresDefault();
  if (!_ajustesPorData[dataISO]) _ajustesPorData[dataISO] = _prevAjustesDefault();
  _fatores = _fatoresPorData[dataISO];
  _ajustes = _ajustesPorData[dataISO];
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

// Ponto de entrada único (chamado pelo roteador e por qualquer ação que
// precise recarregar) — lê o período selecionado na barra (_perRenderBar,
// reaproveitada de js/vendas-ui.js) e despacha pra visão de 1 dia ou de
// período conforme o intervalo escolhido.
async function renderPrevisao() {
  const per = _perRange('previsao');
  // _prevDataLocal (js/previsao-dados.js) usa getters locais do Date, não
  // .toISOString().slice(0,10) — o "ate" do período é 23:59:59 local, que
  // em UTC-3 vira o dia SEGUINTE em UTC; fatiar a string direto faria
  // qualquer seleção de 1 dia só (ex. "Hoje") virar um período de 2 dias.
  const inicioISO = _prevDataLocal(per.inicioISO);
  const fimISO    = _prevDataLocal(per.fimISO);
  _dataRef    = inicioISO;
  _periodoFim = fimISO !== inicioISO ? fimISO : null;

  if (_periodoFim) await _prevRenderPeriodo(inicioISO, _periodoFim);
  else             await _prevRenderDiaUnico(_dataRef);
}

// Visão de 1 dia — era o corpo antigo de renderPrevisao(), agora ancorado
// em `_dataRef` em vez de `new Date()` fixo.
async function _prevRenderDiaUnico(dataISO) {
  const diaSem = new Date(dataISO + 'T12:00:00').getDay();

  const ontemStr = _prevDiaAnterior(dataISO);
  const planejOntem = planejamentos.find(p => p.data === ontemStr);
  _sobraOntem = { gr: planejOntem?.sobraGr || 0, pq: planejOntem?.sobraPq || 0 };

  _prevCarregarFatoresAjustes(dataISO);

  const content = document.getElementById('previsaoContent');
  if (!content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:60px 20px;color:var(--muted)">
      ${lc('refresh-cw',22,'var(--purple)')}
      <div style="margin-top:10px;font-size:var(--text-sm)">Carregando dados reais da operação...</div>
    </div>`;

  _carregando = true;
  try {
    _dadosSemana = await prevCarregarSemanas(diaSem, cfgPrev.semanasHistorico);
  } catch (e) {
    console.error('Previsão: erro ao carregar cw_pedidos', e);
    _dadosSemana = [];
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        ${lc('alert-triangle',22,'var(--red)')}
        <div style="margin-top:10px;font-size:var(--text-sm)">Não foi possível carregar os pedidos (${e.message || 'erro desconhecido'}).</div>
        <button class="btn btn-outline" style="margin-top:12px" onclick="renderPrevisao()">Tentar de novo</button>
      </div>`;
    _carregando = false;
    return;
  }
  _carregando = false;
  _base = _prevCalcularBase();

  _montarLayout(new Date(dataISO + 'T12:00:00'), diaSem);
  recalcularPrevisao();
}

// Presença da chave, não truthiness do valor — o motivo pode ficar vazio
// ('') sem que isso signifique "não excluído".
function _prevExcluido(data) {
  return Object.prototype.hasOwnProperty.call(exclusoesPrev, data);
}

function _prevValidos() {
  return _dadosSemana.filter(d => !_prevExcluido(d.data));
}

// Agregados ponderados a partir de uma lista `validos` explícita — puro,
// sem depender de _dadosSemana/exclusoesPrev globais. Usado tanto pela
// visão de 1 dia (_prevCalcularBase, abaixo) quanto pela visão de período
// (uma base por dia da semana envolvido).
function _prevMontarBase(validos) {
  return {
    validos,
    mediaPedidos: prevMediaPonderada(validos, d => d.pedidos),
    mediaPizzas: {
      grSal: prevMediaPonderada(validos, d => d.pizzas.grSal),
      pqSal: prevMediaPonderada(validos, d => d.pizzas.pqSal),
      grDoc: prevMediaPonderada(validos, d => d.pizzas.grDoc),
      pqDoc: prevMediaPonderada(validos, d => d.pizzas.pqDoc),
    },
    shareSabores: prevShareSabores(validos),
    curva: prevCurvaHoraria(validos),
    pctDelivery: prevPctDeliveryPonderado(validos),
    tempoEntregaMedio: prevTempoEntregaMedio(validos),
    tendencia: prevTendencia(validos),
  };
}

function _prevCalcularBase() {
  return _prevMontarBase(_prevValidos());
}

// ══════════════════════════════════════════════════════════════
// VISÃO DE PERÍODO (vários dias) — total agregado + lista dia a dia
// ══════════════════════════════════════════════════════════════
async function _prevRenderPeriodo(inicioISO, fimISO) {
  const content = document.getElementById('previsaoContent');
  if (!content) return;
  content.innerHTML = `
    <div style="margin-bottom:14px">${_perRenderBar('previsao', 'renderPrevisao')}</div>
    <div style="text-align:center;padding:60px 20px;color:var(--muted)">
      ${lc('refresh-cw',22,'var(--purple)')}
      <div style="margin-top:10px;font-size:var(--text-sm)">Calculando o período...</div>
    </div>`;

  const datas = [];
  for (let d = new Date(inicioISO + 'T12:00:00'); d <= new Date(fimISO + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    datas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const diasSemanaUnicos = [...new Set(datas.map(iso => new Date(iso + 'T12:00:00').getDay()))];

  let resultados;
  try {
    const validosPorDiaSemana = await prevCarregarSemanasMultiplas(diasSemanaUnicos, cfgPrev.semanasHistorico);
    const basesPorDiaSemana = {};
    for (const ds of diasSemanaUnicos) {
      const validos = validosPorDiaSemana[ds].filter(d => !_prevExcluido(d.data));
      basesPorDiaSemana[ds] = _prevMontarBase(validos);
    }
    resultados = datas.map(dataISO => {
      const diaSemana = new Date(dataISO + 'T12:00:00').getDay();
      const fatores = _fatoresPorData[dataISO] || _prevFatoresDefault();
      const ajustes = _ajustesPorData[dataISO]  || _prevAjustesDefault();
      const diaAnteriorISO = _prevDiaAnterior(dataISO);
      const planejAnt = planejamentos.find(p => p.data === diaAnteriorISO);
      const sobra = { gr: planejAnt?.sobraGr || 0, pq: planejAnt?.sobraPq || 0 };
      return _prevCalcularDia(dataISO, diaSemana, basesPorDiaSemana[diaSemana], fatores, ajustes, sobra);
    });
  } catch (e) {
    console.error('Previsão: erro ao carregar período', e);
    content.innerHTML = `
      <div style="margin-bottom:14px">${_perRenderBar('previsao', 'renderPrevisao')}</div>
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        ${lc('alert-triangle',22,'var(--red)')}
        <div style="margin-top:10px;font-size:var(--text-sm)">Não foi possível carregar o período (${e.message || 'erro desconhecido'}).</div>
        <button class="btn btn-outline" style="margin-top:12px" onclick="renderPrevisao()">Tentar de novo</button>
      </div>`;
    return;
  }

  _montarLayoutPeriodo(inicioISO, fimISO, resultados);
}

function _prevAgregarResultados(validos) {
  const soma = sel => validos.reduce((s, r) => s + sel(r), 0);
  const insumosAgg = {};
  validos.forEach(r => {
    r.insumosProj.insumos.forEach(i => {
      if (!insumosAgg[i.id]) insumosAgg[i.id] = { ...i, qtd: 0 };
      insumosAgg[i.id].qtd += i.qtd;
    });
  });
  return {
    totalPedidos:     soma(r => r.pedidos),
    totalPizzas:      soma(r => r.totPz),
    totalKgMassa:     soma(r => r.planoMassa.kgMassaTotal),
    totalMotoboyDias: soma(r => r.motTotalDia),
    custoGarantido:   soma(r => r.custoGarantido),
    custoCorrida:     soma(r => r.custoCorrida),
    insumos: Object.values(insumosAgg).sort((a, b) => b.qtd - a.qtd),
  };
}

function _montarLayoutPeriodo(inicioISO, fimISO, resultados) {
  const validos = resultados.filter(r => !r.semDados);
  const agregado = _prevAgregarResultados(validos);
  const fmtData = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  document.getElementById('previsaoContent').innerHTML = `
    <div style="margin-bottom:14px">${_perRenderBar('previsao', 'renderPrevisao')}</div>

    <div style="background:linear-gradient(135deg,#6B21D4,#9333EA);border-radius:var(--r12);padding:20px 22px;color:#fff;margin-bottom:16px">
      <div style="font-size:var(--text-xs);opacity:.7;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">Previsão de período · dados reais da operação</div>
      <div style="font-size:1.5rem;font-weight:800">${fmtData(inicioISO)} a ${fmtData(fimISO)}</div>
      <div style="font-size:var(--text-sm);opacity:.85;margin-top:4px">${resultados.length} dias · ${validos.length} com histórico suficiente</div>
    </div>

    ${validos.length === 0
      ? `<div class="card" style="padding:24px;text-align:center;color:var(--muted)">${lc('alert-triangle',18,'var(--muted)')} Nenhum dos dias do período tem histórico real ainda.</div>`
      : `${_renderAgregadoPeriodo(agregado)}${_renderListaDias(resultados, fmtData)}`}
  `;
}

function _renderAgregadoPeriodo(ag) {
  const topInsumos = ag.insumos.filter(i => i.qtd > 0.001).slice(0, 8);
  return `
    <div class="card" style="margin-bottom:16px">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800">${lc('layers',16,'var(--purple)')} Total do período</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Soma de todos os dias — pra decisão de compra</div>
      </div>
      <div style="padding:16px 18px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
          <div style="background:var(--surface2);border-radius:var(--r10);padding:12px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${ag.totalPedidos}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Pedidos</div>
          </div>
          <div style="background:var(--surface2);border-radius:var(--r10);padding:12px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${ag.totalPizzas}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Pizzas</div>
          </div>
          <div style="background:var(--purple-xlight);border-radius:var(--r10);padding:12px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${fmt(ag.totalKgMassa)}kg</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Massa</div>
          </div>
          <div style="background:var(--surface2);border-radius:var(--r10);padding:12px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:var(--text2)">${ag.totalMotoboyDias}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Motoboy-dias</div>
          </div>
          <div style="background:var(--surface2);border-radius:var(--r10);padding:12px;text-align:center">
            <div style="font-size:1.2rem;font-weight:800;color:var(--text2)">R$${fmt(ag.custoGarantido)}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Custo motoboy (garantido)</div>
          </div>
        </div>
        ${topInsumos.length ? `
        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">Principais insumos do período</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${topInsumos.map(i => `
            <div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:8px 12px;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:var(--text-sm)">${i.nome}</span>
              <span style="font-size:var(--text-sm);font-weight:800;color:var(--purple)">${_prevFmtQtd(i.qtd, i.unidade)}</span>
            </div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;
}

function _renderListaDias(resultados, fmtData) {
  return `
    <div class="card">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800">${lc('calendar',16,'var(--purple)')} Dia a dia</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Clique num dia pra ver o detalhe completo</div>
      </div>
      <div style="display:flex;flex-direction:column">
        ${resultados.map(r => r.semDados ? `
          <div style="padding:12px 18px;border-bottom:1px solid var(--border);color:var(--muted);font-size:var(--text-sm);display:flex;justify-content:space-between;align-items:center">
            <span>${DIAS[r.diaSemana]}, ${fmtData(r.dataISO)}</span>
            <span style="font-size:var(--text-xs)">${lc('alert-triangle',12,'var(--muted)')} sem histórico</span>
          </div>` : `
          <div onclick="_prevAbrirDia('${r.dataISO}')" style="cursor:pointer;padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:background .15s"
            onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
            <div style="min-width:110px">
              <div style="font-size:var(--text-sm);font-weight:700">${DIAS[r.diaSemana]}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">${fmtData(r.dataISO)}</div>
            </div>
            <div style="text-align:center;min-width:70px">
              <div style="font-size:1rem;font-weight:800;color:var(--purple)">${r.pedidos}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">pedidos</div>
            </div>
            <div style="text-align:center;min-width:70px">
              <div style="font-size:1rem;font-weight:800;color:var(--purple)">${r.totPz}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">pizzas</div>
            </div>
            <div style="text-align:center;min-width:70px">
              <div style="font-size:1rem;font-weight:800;color:var(--purple)">${fmt(r.planoMassa.kgMassaTotal)}kg</div>
              <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">massa</div>
            </div>
            <div style="text-align:center;min-width:70px">
              <div style="font-size:1rem;font-weight:800;color:var(--text2)">${r.motTotalDia}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">motoboys</div>
            </div>
            ${(r.fatores.promocoes||[]).length ? `<span class="chip chip-purple" style="font-size:var(--text-2xs)">${r.fatores.promocoes.length} promoção${r.fatores.promocoes.length>1?'ões':''}</span>` : ''}
            <span style="margin-left:auto;color:var(--muted)">${lc('chevron-right',16,'currentColor')}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// Abre o detalhe de 1 dia específico a partir da lista de período — muda
// a seleção do componente de período pra esse dia só e recarrega.
function _prevAbrirDia(dataISO) {
  const s = _per('previsao');
  const d = new Date(dataISO + 'T12:00:00');
  s.de = _perIni(d);
  s.ate = _perFim(d);
  s.modo = 'custom';
  s.aberto = false;
  renderPrevisao();
}

function _montarLayout(hoje, diaSem) {
  document.getElementById('previsaoContent').innerHTML = `
    <div style="margin-bottom:14px">${_perRenderBar('previsao', 'renderPrevisao')}</div>

    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">

      <!-- ═══════ COLUNA PRINCIPAL ═══════ -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">

        <div id="secao1Wrap">${_renderSecao1(hoje, diaSem)}</div>
        ${_renderSecao2()}
        ${_renderSecao3()}
        ${_renderSecao35()}
        ${_renderSecao4()}
        ${_renderRodape()}

      </div>

      <!-- ═══════ PAINEL LATERAL ═══════ -->
      <div style="width:${isMobile()?'100%':'300px'};flex-shrink:0;display:flex;flex-direction:column;gap:12px">
        <div id="painelFatoresWrap">${_renderPainelFatores()}</div>
        <div id="painelHistWrap">${_renderPainelHistorico()}</div>
        ${_renderPainelAcoes()}
      </div>
    </div>

    <!-- Modal Configurações -->
    <div class="overlay" id="ovCfgPrev2" onclick="if(event.target===this)closeModal('ovCfgPrev2')">
      ${_renderModalCfg()}
    </div>

    <!-- Modal Planejamento Salvo -->
    <div class="overlay" id="ovPlanejSalvo" onclick="if(event.target===this)closeModal('ovPlanejSalvo')">
      <div class="mbox" style="max-width:600px" id="planejSalvoBox"></div>
    </div>

    <!-- Modal Histórico real -->
    <div class="overlay" id="ovHistorico" onclick="if(event.target===this)closeModal('ovHistorico')">
      <div class="mbox" style="max-width:680px" id="historicoBox"></div>
    </div>`;
}

// ── Seção 1: Contexto do dia ──────────────────────────────────
function _renderSecao1(hoje, diaSem) {
  const n     = _dadosSemana.length;
  const media = _base.mediaPedidos;
  const tend  = _base.tendencia;
  const hojeISO   = _prevHojeISO();
  const amanhaISO = _prevDiaSeguinte(hojeISO);
  const rotuloDia = _dataRef === hojeISO ? 'Planejamento de hoje'
    : _dataRef === amanhaISO ? 'Planejamento de amanhã' : 'Planejamento do dia';
  return `
    <div style="background:linear-gradient(135deg,#6B21D4,#9333EA);border-radius:var(--r12);padding:20px 22px;color:#fff">
      <div style="font-size:var(--text-xs);opacity:.7;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">
        ${rotuloDia} · dados reais da operação
      </div>
      <div style="font-size:1.5rem;font-weight:800;margin-bottom:4px">
        ${DIAS[diaSem]}, ${hoje.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:10px">
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800">${n}</div>
          <div style="font-size:var(--text-2xs);opacity:.8;text-transform:uppercase">${DIAS[diaSem]}s encontradas</div>
        </div>
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800">${n ? Math.round(media) : '—'}</div>
          <div style="font-size:var(--text-2xs);opacity:.8;text-transform:uppercase">Pedidos (ponderado)</div>
        </div>
        ${tend !== null ? `
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:${tend>=0?'#B9F6CA':'#FFCDD2'}">${tend>0?'+':''}${tend}%</div>
          <div style="font-size:var(--text-2xs);opacity:.8;text-transform:uppercase">Tendência recente</div>
        </div>` : ''}
        <div style="margin-left:auto;display:flex;gap:8px">
          ${n ? `<button onclick="_abrirHistoricoReal()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 12px;border-radius:var(--r8);font-size:var(--text-xs);cursor:pointer;font-weight:600">
                Ver histórico real
               </button>` : ''}
          <button onclick="renderPrevisao()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 12px;border-radius:var(--r8);font-size:var(--text-xs);cursor:pointer;font-weight:600">
            ${lc('refresh-cw',13,'#fff')} Sincronizar agora
          </button>
        </div>
      </div>
      ${!n ? `
        <div style="margin-top:12px;background:rgba(255,200,50,.2);border:1px solid rgba(255,200,50,.4);border-radius:var(--r8);padding:8px 12px;font-size:var(--text-xs);opacity:.9">
          ${lc('alert-triangle',13,'#FFD700')} Nenhum pedido de ${DIAS[diaSem]} encontrado em cw_pedidos ainda. A previsão aparece automaticamente assim que houver histórico real.
        </div>` : n < cfgPrev.semanasHistorico ? `
        <div style="margin-top:12px;background:rgba(255,200,50,.15);border:1px solid rgba(255,200,50,.4);border-radius:var(--r8);padding:8px 12px;font-size:var(--text-xs);opacity:.9">
          ${lc('alert-triangle',13,'#FFD700')} Só ${n} de ${cfgPrev.semanasHistorico} ${DIAS[diaSem]}s desejadas — operação ainda recente. Usando o que existe.
        </div>` : ''}
    </div>`;
}

// ── Seção 2: Previsão de pedidos e pizzas ─────────────────────
function _renderSecao2() {
  return `
    <div class="card" id="secao2">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--text-md);font-weight:800">${lc('trending-up',16,'var(--purple)')} Previsão de pedidos e pizzas</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Baseada no histórico real · ajuste os fatores ao lado</div>
        </div>
      </div>
      <div style="padding:16px 18px" id="resultado2">
        <div style="color:var(--muted);font-size:var(--text-sm);text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Seção 3: Massas e lotes ────────────────────────────────────
function _renderSecao3() {
  return `
    <div class="card" id="secao3">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800">${lc('chef-hat',16,'var(--purple)')} Plano de massas e lotes de produção</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Quanto boleiar/abrir e em quantos lotes bater hoje</div>
      </div>
      <div style="padding:16px 18px" id="resultado3">
        <div style="color:var(--muted);font-size:var(--text-sm);text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Seção 3.5: Insumos porcionados ─────────────────────────────
function _renderSecao35() {
  return `
    <div class="card" id="secao35">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800">${lc('package',16,'var(--purple)')} Insumos e preparados para pré-produção</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Quanto deixar porcionado/pronto pra praça da montagem</div>
      </div>
      <div style="padding:16px 18px" id="resultado35">
        <div style="color:var(--muted);font-size:var(--text-sm);text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Seção 4: Motoboys ─────────────────────────────────────────
function _renderSecao4() {
  return `
    <div class="card" id="secao4">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-md);font-weight:800">${lc('truck',16,'var(--purple)')} Previsão de motoboys</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">Escala em 2 turnos cobrindo o pico + simulação de custo</div>
      </div>
      <div style="padding:16px 18px" id="resultado4">
        <div style="color:var(--muted);font-size:var(--text-sm);text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Rodapé de ações ───────────────────────────────────────────
function _renderRodape() {
  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap" id="rodapePrev">
      <button onclick="confirmarPlanejamento()"
        style="flex:1;padding:13px;background:var(--purple);color:#fff;border:none;border-radius:var(--r10);font-size:var(--text-md);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        ${lc('check-circle',16,'#fff')} Confirmar planejamento
      </button>
      <button onclick="enviarWATime()"
        style="padding:13px 18px;background:#25D366;color:#fff;border:none;border-radius:var(--r10);font-size:var(--text-md);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        ${lc('message-circle',16,'#fff')} Enviar WA
      </button>
    </div>`;
}

// ── Painel lateral: fatores ───────────────────────────────────
function _renderPainelFatores() {
  const btnStyle = (ativo, cor='var(--purple)') =>
    `padding:6px 14px;border-radius:20px;font-size:var(--text-sm);font-weight:700;border:1.5px solid ${ativo ? cor : 'var(--border)'};background:${ativo ? cor : 'var(--surface)'};color:${ativo ? '#fff' : 'var(--muted)'};cursor:pointer;transition:all .2s`;
  const ehHoje = _dataRef === _prevHojeISO();

  return `
    <div class="card">
      <div style="padding:13px 15px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-sm);font-weight:800">${lc('zap',14,'var(--purple)')} Fatores do dia</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${ehHoje ? 'Ajustam a previsão em cima dos dados reais' : `Salvos pra ${new Date(_dataRef+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — não afetam outros dias`}</div>
      </div>
      <div style="padding:13px 15px;display:flex;flex-direction:column;gap:13px">

        <!-- Temperatura -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="font-size:var(--text-sm);font-weight:600">${lc('thermometer',14,'var(--purple)')} Temperatura da cozinha</div>
            <div style="display:flex;align-items:center;gap:5px">
              <input type="number" id="fTemp" value="${_fatores.temperatura}" min="15" max="45"
                style="width:52px;padding:4px 6px;border:1.5px solid var(--purple);border-radius:var(--r6);font-size:var(--text-md);font-weight:700;text-align:center;color:var(--purple)"
                oninput="_fatores.temperatura=+this.value;saveFatoresPorData();recalcularPrevisao()">
              <span style="font-size:var(--text-sm);color:var(--muted)">°C</span>
            </div>
          </div>
          <div id="tempHint" style="font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-radius:var(--r6);padding:4px 8px"></div>
        </div>

        <!-- Chuva -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600">${lc('cloud-rain',14,'var(--purple)')} Vai chover?</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">Aumenta delivery (~+20%)</div>
          </div>
          <button id="btnChuva" onclick="toggleFatorPrev('chuva')" style="${btnStyle(_fatores.chuva)}">
            ${_fatores.chuva ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Feriado -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600">${lc('star',14,'var(--purple)')} Feriado / data especial?</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">Aumenta movimento (~+35%)</div>
          </div>
          <button id="btnFeriado" onclick="toggleFatorPrev('feriado')" style="${btnStyle(_fatores.feriado)}">
            ${_fatores.feriado ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Evento -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600">${lc('zap',14,'var(--purple)')} Evento geral?</div>
            <div style="font-size:var(--text-xs);color:var(--muted)">Show, jogo, data comemorativa (~+20% em tudo)</div>
          </div>
          <button id="btnEvento" onclick="toggleFatorPrev('evento')" style="${btnStyle(_fatores.evento)}">
            ${_fatores.evento ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Observação -->
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:4px">${lc('edit-2',13,'var(--muted)')} Observação</div>
          <input class="inp" id="fObs" value="${_fatores.obs}"
            placeholder="ex: Copa do Mundo, Dia das Mães..."
            style="font-size:var(--text-sm);padding:6px 9px"
            oninput="_fatores.obs=this.value;saveFatoresPorData()">
        </div>

        <!-- Promoção de sabor -->
        <div style="border-top:1.5px solid var(--border);padding-top:13px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:var(--text-sm);font-weight:600">${lc('tag',14,'var(--purple)')} Promoção de sabor</div>
            <button onclick="_prevAbrirBuscaSabor()" style="background:none;border:none;color:var(--purple);cursor:pointer;font-size:var(--text-xs);font-weight:700">+ Adicionar</button>
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:8px">Sobe a participação de 1 ou mais sabores específicos na projeção (não afeta o total geral)</div>
          ${_prevSaborBuscaAberto ? `
            <div class="ft-ac-wrap" style="margin-bottom:10px">
              <input class="inp" id="prevSaborInput" placeholder="Buscar sabor..." style="font-size:var(--text-sm)"
                oninput="_prevBuscarSabor(this.value)" onfocus="_prevBuscarSabor(this.value)"
                onblur="setTimeout(()=>_prevFecharBuscaSabor(),150)">
              <div class="ft-ac-list" id="prevSaborDrop" style="display:none"></div>
            </div>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(_fatores.promocoes||[]).length === 0 && !_prevSaborBuscaAberto
              ? `<div style="font-size:var(--text-xs);color:var(--muted)">Nenhuma promoção ${ehHoje ? 'hoje' : 'nesse dia'}</div>`
              : (_fatores.promocoes||[]).map(p => `
                <span class="chip chip-purple" style="display:inline-flex;align-items:center;gap:5px">
                  ${p.nome}
                  <input type="number" value="${p.boostPct}" onchange="_prevAjustarPromocao(${p.opcaoId},+this.value)"
                    style="width:34px;border:none;background:transparent;font-weight:700;color:inherit;text-align:right;padding:0">%
                  <button onclick="_prevRemoverPromocao(${p.opcaoId})" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 2px;font-weight:800;line-height:1">✕</button>
                </span>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

let _prevSaborBuscaAberto = false;

function _prevAbrirBuscaSabor() {
  _prevSaborBuscaAberto = true;
  _prevAtualizarPainelFatores();
  setTimeout(() => document.getElementById('prevSaborInput')?.focus(), 30);
}
function _prevFecharBuscaSabor() {
  _prevSaborBuscaAberto = false;
  _prevAtualizarPainelFatores();
}
function _prevAtualizarPainelFatores() {
  const el = document.getElementById('painelFatoresWrap');
  if (el) el.innerHTML = _renderPainelFatores();
}

// Busca de sabor por nome — mesmo padrão de _cwSearchAlvo('sabor')
// (js/cadastros.js), buscando direto no array `opcoes`.
function _prevBuscarSabor(query) {
  const drop = document.getElementById('prevSaborDrop');
  if (!drop) return;
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(query);
  const jaPromovidos = new Set((_fatores.promocoes||[]).map(p => p.opcaoId));
  const pool = (typeof opcoes !== 'undefined' ? opcoes : []).filter(o => o.active !== false && !jaPromovidos.has(o.id));
  const matches = q ? pool.filter(o => norm(o.nome).includes(q)).slice(0, 8) : pool.slice(0, 8);
  if (!matches.length) {
    drop.innerHTML = `<div class="ft-ac-item" style="cursor:default;color:var(--muted)">Nenhum sabor encontrado</div>`;
  } else {
    drop.innerHTML = matches.map(o => `
      <div class="ft-ac-item" onmousedown="event.preventDefault();_prevAdicionarPromocao(${o.id},'${(o.nome||'').replace(/'/g,"\\'")}')">
        <span>${o.nome}</span><span class="ft-ac-cat">${o.categoria || ''}</span>
      </div>`).join('');
  }
  drop.style.display = 'block';
}

function _prevAdicionarPromocao(opcaoId, nome) {
  if (!_fatores.promocoes) _fatores.promocoes = [];
  if (_fatores.promocoes.some(p => p.opcaoId === opcaoId)) { toast('Esse sabor já tem promoção ativa', 'info'); return; }
  _fatores.promocoes.push({ opcaoId, nome, boostPct: 30 });
  saveFatoresPorData();
  _prevSaborBuscaAberto = false;
  _prevAtualizarPainelFatores();
  recalcularPrevisao();
}
function _prevRemoverPromocao(opcaoId) {
  _fatores.promocoes = (_fatores.promocoes || []).filter(p => p.opcaoId !== opcaoId);
  saveFatoresPorData();
  _prevAtualizarPainelFatores();
  recalcularPrevisao();
}
function _prevAjustarPromocao(opcaoId, boostPct) {
  const p = (_fatores.promocoes || []).find(x => x.opcaoId === opcaoId);
  if (!p) return;
  p.boostPct = boostPct;
  saveFatoresPorData();
  recalcularPrevisao();
}

// ── Painel lateral: histórico (resumo) ─────────────────────────
function _renderPainelHistorico() {
  const validos   = _base.validos;
  const excluidos = _dadosSemana.length - validos.length;
  const ultimos   = [..._dadosSemana].sort((a,b) => b.data.localeCompare(a.data)).slice(0, 8);
  return `
    <div class="card">
      <div style="padding:13px 15px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:var(--text-sm);font-weight:800">${lc('activity',14,'var(--purple)')} Últimos registros reais</div>
        <span style="font-size:var(--text-xs);color:var(--muted)">${_dadosSemana.length} reg.${excluidos ? ' · '+excluidos+' excluído'+(excluidos>1?'s':'') : ''}</span>
      </div>
      <div style="max-height:260px;overflow-y:auto">
        ${ultimos.length === 0
          ? `<div style="padding:16px;text-align:center;font-size:var(--text-sm);color:var(--muted)">Nenhum pedido real ainda</div>`
          : ultimos.map(h => {
              const excluido = _prevExcluido(h.data);
              const media    = _base.mediaPedidos;
              const desvio   = media ? Math.round((h.pedidos - media) / media * 100) : null;
              const outlier  = desvio !== null && Math.abs(desvio) >= 25;
              const corDesvio = desvio > 0 ? 'var(--green)' : 'var(--red)';
              return `
            <div onclick="_abrirHistoricoReal()" style="cursor:pointer;display:flex;align-items:flex-start;justify-content:space-between;padding:7px 15px;border-bottom:1px solid var(--border);${excluido?'opacity:.45':''}${outlier&&!excluido?';background:var(--yellow-light)':''}">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                  <span style="font-size:var(--text-sm);font-weight:600">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span>
                  ${excluido ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 5px;border-radius:8px;background:var(--surface2);color:var(--muted)">${lc('minus-circle',8,'currentColor')} Excluído</span>` : ''}
                </div>
                ${excluido && exclusoesPrev[h.data] ? `<div style="font-size:var(--text-2xs);color:var(--muted);font-style:italic;margin-top:1px">${exclusoesPrev[h.data]}</div>` : ''}
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:8px">
                <div style="font-size:var(--text-md);font-weight:800;color:${excluido?'var(--muted)':'var(--purple)'}">${h.pedidos}</div>
                ${desvio !== null && !excluido ? `<div style="font-size:var(--text-2xs);font-weight:700;color:${corDesvio}">${desvio>0?'+':''}${desvio}%</div>` : ''}
              </div>
            </div>`;
            }).join('')}
      </div>
      <div style="padding:10px 15px;border-top:1px solid var(--border)">
        <button onclick="_abrirHistoricoReal()" style="width:100%;padding:7px;background:none;border:1.5px dashed var(--border);border-radius:var(--r8);font-size:var(--text-sm);color:var(--muted);cursor:pointer">
          ${lc('list',13,'var(--muted)')} Ver todos / excluir dia atípico
        </button>
      </div>
    </div>`;
}

// ── Painel lateral: ações ─────────────────────────────────────
function _renderPainelAcoes() {
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button onclick="abrirCfgPrev2()"
        style="width:100%;padding:9px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);font-size:var(--text-sm);font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
        ${lc('settings',14,'var(--muted)')} Parâmetros e configurações
      </button>
      ${planejamentos.length > 0 ? `
        <button onclick="verHistoricoPlanej()"
          style="width:100%;padding:9px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);font-size:var(--text-sm);font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
          ${lc('clipboard-list',14,'var(--muted)')} Ver planejamentos anteriores
        </button>` : ''}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// CÁLCULO PRINCIPAL (reativo — usa _base já carregado, sem refetch)
// ══════════════════════════════════════════════════════════════
// Função pura: calcula o resultado completo de 1 dia a partir de uma
// `base` (agregados ponderados daquele dia da semana) e dos fatores/
// ajustes ESPECÍFICOS daquele dia — sem tocar DOM, sem depender de
// `_dataRef`/`_fatores`/`_ajustes` globais. Usada pela visão de 1 dia
// (recalcularPrevisao, abaixo, que passa os globais) e pela visão de
// período (uma chamada por dia do intervalo, cada uma com sua própria
// base/fatores/ajustes — dias diferentes podem cair em dias da semana
// diferentes, com histórico e fatores próprios).
function _prevCalcularDia(dataISO, diaSemana, base, fatores, ajustes, sobraOntem) {
  const b = base;
  const temp  = fatores.temperatura;
  const coefF = Math.pow(2, (cfgPrev.tempReferencia - temp) / 5);
  const ferAj = +(cfgPrev.fermentoBasePorKg * coefF).toFixed(1);

  if (!b.validos.length) {
    return { dataISO, diaSemana, semDados: true, ferAj, temp, fatores: { ...fatores } };
  }

  // ── Coeficiente dos fatores do dia ──
  let coef = 1;
  if (fatores.chuva)   coef *= 1.20;
  if (fatores.feriado) coef *= 1.35;
  if (fatores.evento)  coef *= 1.20;

  // ── Pedidos ──
  const pedidosCalc = Math.ceil(b.mediaPedidos * coef);
  const pedidos     = ajustes.pedidos ?? pedidosCalc;
  // Fator final: incorpora tanto o coeficiente dos fatores do dia quanto um
  // eventual ajuste manual do nº de pedidos — aplicado em cascata a pizzas
  // e delivery, pra tudo na tela continuar coerente entre si.
  const fatorFinal = b.mediaPedidos > 0 ? pedidos / b.mediaPedidos : coef;

  // ── Pizzas (mix real, não mais percentuais fixos) ──
  const grSal = Math.round(b.mediaPizzas.grSal * fatorFinal);
  const pqSal = Math.round(b.mediaPizzas.pqSal * fatorFinal);
  const grDoc = Math.round(b.mediaPizzas.grDoc * fatorFinal);
  const pqDoc = Math.round(b.mediaPizzas.pqDoc * fatorFinal);
  const totGr = grSal + grDoc;
  const totPq = pqSal + pqDoc;
  const totPz = totGr + totPq;

  // ── Massas (margem + sobra de ontem + ajuste manual) ──
  // A margem é aplicada UMA vez, aqui, no nº de pizzas a produzir — é a
  // ÚNICA fonte de verdade pro resto do cálculo (kg de massa, sabores/
  // insumos, embalagem). Nada mais aplica margem separadamente.
  const marg       = cfgPrev.margemSeguranca / 100;
  const masGrBruto = Math.ceil(totGr * (1 + marg));
  const masPqBruto = Math.ceil(totPq * (1 + marg));
  const masGrFin   = ajustes.grandesFinal  ?? Math.max(0, masGrBruto - sobraOntem.gr);
  const masPqFin   = ajustes.pequenasFinal ?? Math.max(0, masPqBruto - sobraOntem.pq);

  // ── Sabores: participação histórica (%) + promoções, distribuída no
  // total FINAL de pizzas já margeado/ajustado — garante que a soma das
  // meias por sabor sempre bate com masGrFin/masPqFin, qualquer que seja
  // a origem do ajuste (pedidos, massa direta, promoção). ──
  const shares = prevAplicarPromocoes(b.shareSabores, fatores.promocoes);
  const totalMeiasGr = masGrFin * 2; // 2 meias por pizza grande
  const totalMeiasPq = masPqFin * 1; // 1 meia por pizza pequena
  const meiasPorSaborHoje = {};
  for (const [k, share] of Object.entries(shares)) {
    meiasPorSaborHoje[k] = { grande: share.grande * totalMeiasGr, pequena: share.pequena * totalMeiasPq };
  }

  // ── Janelas horárias reais → lotes de produção ──
  const janelas      = prevProjecaoPorJanela(masGrFin, masPqFin, b.curva.pct);
  const pizzasAte20h = janelas.janela1.grande + janelas.janela1.pequena;
  const dividir       = pizzasAte20h > cfgPrev.limiteBatidaDividida;

  const lotes = dividir
    ? [
        { num: 1, label: 'Lote 1 — sai primeiro', grande: janelas.janela1.grande, pequena: janelas.janela1.pequena },
        { num: 2, label: 'Lote 2 — sai depois',    grande: janelas.janela2.grande, pequena: janelas.janela2.pequena },
      ]
    : [ { num: 1, label: 'Lote único', grande: masGrFin, pequena: masPqFin } ];

  // ── Plano de massas: kg a produzir (não mais só contagem de bolas) ──
  const pesoMassa  = prevPesoMassaPorPizza();
  const planoMassa = prevPlanoMassa({ grande: masGrFin, pequena: masPqFin });
  const farinhaTotal = planoMassa.ingredientes.find(i => /farinha/i.test(i.nome))?.qtd || 0;
  lotes.forEach(l => {
    l.kgMassa = +(l.grande * pesoMassa.grande + l.pequena * pesoMassa.pequena).toFixed(2);
    const pctLote = planoMassa.kgMassaTotal > 0 ? l.kgMassa / planoMassa.kgMassaTotal : 0;
    l.kgFar = +(farinhaTotal * pctLote).toFixed(2);
    l.fermG = +(l.kgFar * ferAj).toFixed(0);
  });

  // ── Insumos projetados (item 3) — exclui a massa, que já tem card próprio ──
  const idsExcluirMassa = new Set([planoMassa.itemIdGr, planoMassa.itemIdPq].filter(Boolean));
  const insumosProj = prevInsumosProjetados(meiasPorSaborHoje, { grande: masGrFin, pequena: masPqFin }, idsExcluirMassa);

  // ── Motoboys ──
  const pedDel = Math.ceil(pedidos * b.pctDelivery);
  const capacidadeHora = 60 / cfgPrev.tempoMedioEntregaMin;
  const motoboysHora = {};
  // Em dias de pouco movimento, várias horas empatam no mesmo nº necessário
  // — entre empates, prefere a hora mais central da operação (pico "de
  // verdade"), não a primeira hora que bateu o empate.
  const meioOperacao = (cfgPrev.horarioAbertura + cfgPrev.horarioFechamento) / 2;
  let picoH = cfgPrev.horarioAbertura, picoVal = -1;
  Object.keys(b.curva.pct).forEach(hStr => {
    const h = +hStr;
    const pedHora = Math.ceil(pedDel * b.curva.pct[hStr]);
    const nec = Math.ceil(pedHora / capacidadeHora);
    motoboysHora[h] = nec;
    if (nec > picoVal || (nec === picoVal && Math.abs(h - meioOperacao) < Math.abs(picoH - meioOperacao))) {
      picoVal = nec; picoH = h;
    }
  });
  const motTotalDia = ajustes.motoboys ?? picoVal;
  const janelaTotal  = Math.max(1, cfgPrev.horarioFechamento - cfgPrev.horarioAbertura);

  // Com 0 ou 1 motoboy no pico não faz sentido dividir em 2 turnos — cobre
  // o dia inteiro com 1 turno só. Turnos sempre dentro da janela de
  // operação (nunca antes de abrir nem depois de fechar).
  let nAbertura, nFechamento, horasAbertura, horasFechamento;
  if (motTotalDia <= 1) {
    nAbertura = motTotalDia; nFechamento = 0;
    horasAbertura = janelaTotal; horasFechamento = 0;
  } else {
    nAbertura   = Math.ceil(motTotalDia / 2);
    nFechamento = motTotalDia - nAbertura;
    horasAbertura   = Math.min(janelaTotal, Math.max(4, picoH - cfgPrev.horarioAbertura + 1));
    horasFechamento = Math.min(janelaTotal, Math.max(4, cfgPrev.horarioFechamento - picoH + 1));
  }

  const ehDomFer   = diaSemana === 0 || fatores.feriado;
  const valorHora  = ehDomFer ? cfgPrev.valorHoraDomFer : cfgPrev.valorHoraNormal;
  const custoGarantido = Math.round(nAbertura * horasAbertura * valorHora + nFechamento * horasFechamento * valorHora);
  const custoCorrida   = Math.round(pedDel * cfgPrev.valorCorridaMedio);

  return {
    dataISO, diaSemana, semDados: false,
    pedidos, pedidosCalc, media: b.mediaPedidos, coef, fatorFinal,
    grSal, pqSal, grDoc, pqDoc, totGr, totPq, totPz,
    masGrFin, masPqFin, masGrBruto, masPqBruto, lotes, dividir, pizzasAte20h,
    planoMassa, insumosProj,
    pedDel, motoboysHora, picoH, motTotalDia, nAbertura, nFechamento,
    motFinal: motTotalDia, // alias legado — js/dashboard.js (widget "Previsão do dia") ainda lê esse nome
    horasAbertura, horasFechamento, valorHora, custoGarantido, custoCorrida,
    tempoEntregaMedio: b.tempoEntregaMedio,
    ferAj, temp,
    fatores: { ...fatores },
  };
}

// Visão de 1 dia — usa os globais _dataRef/_fatores/_ajustes/_sobraOntem e
// dispara a re-renderização das seções reativas.
function recalcularPrevisao() {
  if (_carregando || !_base) return;
  const diaSemana = new Date(_dataRef + 'T12:00:00').getDay();
  _resultado = _prevCalcularDia(_dataRef, diaSemana, _base, _fatores, _ajustes, _sobraOntem);

  const hintEl = document.getElementById('tempHint');
  if (hintEl) {
    const diff = +(_resultado.ferAj - cfgPrev.fermentoBasePorKg).toFixed(1);
    hintEl.innerHTML = `Base: <strong>${cfgPrev.fermentoBasePorKg}g/kg</strong> → A ${_resultado.temp}°C: <strong style="color:var(--purple)">${_resultado.ferAj}g/kg</strong> <span>(${diff > 0 ? '+' : ''}${diff}g — ${_resultado.temp > cfgPrev.tempReferencia ? 'mais quente, menos fermento' : 'mais frio, mais fermento'})</span>`;
  }

  if (_resultado.semDados) {
    ['resultado2','resultado3','resultado35','resultado4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:var(--text-sm)">${lc('alert-triangle',16,'var(--muted)')} Sem histórico real ainda para ${DIAS[diaSemana]}s</div>`;
    });
    return;
  }

  _renderResultado2(_resultado);
  _renderResultado3(_resultado);
  _renderResultado35(_resultado);
  _renderResultado4(_resultado);
}

// ── Resultado: pedidos e pizzas ──────────────────────────────
function _renderResultado2(r) {
  const el = document.getElementById('resultado2');
  if (!el) return;
  const coefAtivos = [];
  if (_fatores.chuva)   coefAtivos.push(`Chuva +20%`);
  if (_fatores.feriado) coefAtivos.push(`Feriado +35%`);
  if (_fatores.evento)  coefAtivos.push(`Evento +20%`);

  el.innerHTML = `
    <!-- Pedidos -->
    <div style="margin-bottom:18px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Pedidos previstos</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r12);padding:16px 22px;text-align:center">
          <div style="font-size:2.4rem;font-weight:800;color:var(--purple);line-height:1">${r.pedidos}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px;text-transform:uppercase">pedidos</div>
        </div>
        <div style="flex:1">
          <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:5px">
            Base ponderada (${cfgPrev.semanasHistorico} semanas, recentes pesam mais): <strong>${Math.round(r.media)}</strong>
            ${r.coef !== 1 ? ` × <span style="color:var(--purple);font-weight:700">${r.coef.toFixed(2)}</span> = <strong style="color:var(--purple)">${r.pedidosCalc}</strong>` : ''}
          </div>
          ${coefAtivos.length ? `
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${coefAtivos.map(f => `<span style="padding:2px 8px;border-radius:10px;font-size:var(--text-xs);font-weight:600;background:var(--purple-xlight);color:var(--purple)">${f}</span>`).join('')}
            </div>` : `<div style="font-size:var(--text-xs);color:var(--muted)">Sem ajuste de fatores</div>`}
          <div style="margin-top:8px">
            <label style="font-size:var(--text-xs);color:var(--muted)">Ajustar manualmente:</label>
            <input type="number" value="${r.pedidos}" min="1"
              style="margin-left:6px;width:64px;padding:3px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);font-weight:700;text-align:center"
              onchange="_ajustes.pedidos=+this.value;saveAjustesPorData();recalcularPrevisao()">
            ${_ajustes.pedidos !== null ? `<button onclick="_ajustes.pedidos=null;saveAjustesPorData();recalcularPrevisao()" style="margin-left:5px;font-size:var(--text-xs);color:var(--purple);background:none;border:none;cursor:pointer">Resetar</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Pizzas -->
    <div style="border-top:1.5px solid var(--border);padding-top:16px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Distribuição de pizzas (mix real)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${_kpiPizza('Grandes Salgadas', r.grSal, '#6B21D4')}
        ${_kpiPizza('Pequenas Salgadas', r.pqSal, '#6B21D4')}
        ${_kpiPizza('Grandes Doces', r.grDoc, '#D97706')}
        ${_kpiPizza('Pequenas Doces', r.pqDoc, '#D97706')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${_kpiPizzaTotal('Total Grandes', r.totGr, 'var(--purple)')}
        ${_kpiPizzaTotal('Total Pequenas', r.totPq, 'var(--purple)')}
        ${_kpiPizzaTotal('Total Geral', r.totPz, 'var(--green)')}
      </div>
    </div>`;
}

function _kpiPizza(label, val, cor) {
  return `<div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 12px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:var(--text-xs);color:var(--text2)">${label}</span>
    <span style="font-size:1.1rem;font-weight:800;color:${cor}">${val}</span>
  </div>`;
}

function _kpiPizzaTotal(label, val, cor) {
  return `<div style="background:var(--surface2);border-radius:var(--r8);padding:10px;text-align:center">
    <div style="font-size:1.3rem;font-weight:800;color:${cor}">${val}</div>
    <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:2px">${label}</div>
  </div>`;
}

// ── Resultado: massas e lotes ────────────────────────────────
function _renderResultado3(r) {
  const el = document.getElementById('resultado3');
  if (!el) return;
  el.innerHTML = `
    ${(_sobraOntem.gr > 0 || _sobraOntem.pq > 0) ? `
    <div style="margin-bottom:14px;padding:9px 12px;background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);font-size:var(--text-sm);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${lc('package',13,'var(--green)')} <strong>Sobra de ontem:</strong> ${_sobraOntem.gr > 0 ? _sobraOntem.gr+' grandes' : ''} ${_sobraOntem.pq > 0 ? _sobraOntem.pq+' pequenas' : ''} — já descontado da produção de hoje.
      <button onclick="_sobraOntem={gr:0,pq:0};recalcularPrevisao()" style="margin-left:auto;font-size:var(--text-xs);color:var(--muted);background:none;border:none;cursor:pointer">Ignorar</button>
    </div>` : ''}
    <!-- Massa: kg é a informação principal -->
    <div style="margin-bottom:18px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Massa a produzir hoje (com ${cfgPrev.margemSeguranca}% de margem)</div>
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r12);padding:16px 22px;text-align:center;margin-bottom:12px">
        <div style="font-size:2.4rem;font-weight:800;color:var(--purple);line-height:1">${fmt(r.planoMassa.kgMassaTotal)}kg</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px;text-transform:uppercase">${r.planoMassa.kgMassaGr.toFixed(2)}kg grande + ${r.planoMassa.kgMassaPq.toFixed(2)}kg pequena</div>
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:8px">Quantidade de massas a boleiar</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${_kpiMassa('Massas grandes', r.masGrFin, r.totGr, 'var(--purple)', 'grandesFinal')}
        ${_kpiMassa('Massas pequenas', r.masPqFin, r.totPq, '#D97706', 'pequenasFinal')}
      </div>
    </div>

    <!-- Lotes -->
    <div style="border-top:1.5px solid var(--border);padding-top:16px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">
        ${r.dividir
          ? `Produção dividida em 2 lotes — projeção até as 20h (${r.pizzasAte20h}) passou de ${cfgPrev.limiteBatidaDividida} pizzas`
          : `Produção em lote único — projeção até as 20h (${r.pizzasAte20h}) dentro do limite de ${cfgPrev.limiteBatidaDividida}`}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${r.lotes.map(l => `
          <div style="border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
            <div style="display:flex;align-items:center;gap:0;background:var(--surface2)">
              <div style="width:40px;height:40px;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-size:var(--text-sm);font-weight:800;flex-shrink:0">${l.num}</div>
              <div style="flex:1;padding:0 12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--purple);padding:8px 0">${l.label}</div>
                <div style="text-align:center;background:var(--purple-xlight);border-radius:var(--r6);padding:6px 10px;margin:6px 0">
                  <div style="font-size:var(--text-2xs);color:var(--purple);text-transform:uppercase">Massa</div>
                  <div style="font-size:1rem;font-weight:800;color:var(--purple)">${l.kgMassa}kg</div>
                </div>
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Grandes</div>
                  <div style="font-size:1rem;font-weight:800;color:var(--purple)">${l.grande}</div>
                </div>
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Pequenas</div>
                  <div style="font-size:1rem;font-weight:800;color:#D97706">${l.pequena}</div>
                </div>
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase">Farinha</div>
                  <div style="font-size:1rem;font-weight:800">${l.kgFar}kg</div>
                </div>
                <div style="text-align:center;background:var(--yellow-light);border-radius:var(--r6);padding:6px 10px;margin:6px 0">
                  <div style="font-size:var(--text-2xs);color:#92400e;text-transform:uppercase">Fermento</div>
                  <div style="font-size:1rem;font-weight:800;color:#92400e">${l.fermG}g</div>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;background:var(--surface2);border-radius:var(--r8);padding:9px 12px;font-size:var(--text-xs);color:var(--muted)">
        ${lc('thermometer',13,'var(--muted)')} ${r.temp}°C → ${r.ferAj}g de fermento fresco por kg de farinha (ajustado pela temperatura). Tempo de fermentação de cada lote: ver ficha técnica da cozinha.
      </div>
    </div>

    <!-- Insumos da própria receita da massa (farinha, sal, fermento...) -->
    ${r.planoMassa.ingredientes.length ? `
    <div style="border-top:1.5px solid var(--border);padding-top:16px;margin-top:16px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">
        ${lc('beaker',13,'var(--muted)')} Insumos pra bater a massa (ficha técnica)
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${r.planoMassa.ingredientes.map(i => `
          <div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:8px 12px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:var(--text-sm)">${i.nome}</span>
            <span style="font-size:var(--text-sm);font-weight:800;color:var(--text2)">${_prevFmtQtd(i.qtd, i.unidade)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
    ${r.planoMassa.semFicha.length ? `
    <div style="margin-top:10px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r8);padding:9px 12px;font-size:var(--text-xs);color:#92400e">
      ${lc('alert-triangle',13,'#92400e')} Sem ficha técnica cadastrada: ${r.planoMassa.semFicha.join(', ')}
    </div>` : ''}

    <div style="margin-top:14px;border-top:1.5px solid var(--border);padding-top:12px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:var(--text-xs);color:var(--muted)">${lc('moon',12,'currentColor')} Ao final do dia, registre a sobra pra calibrar amanhã</div>
      <button onclick="_abrirFechamentoDia()" style="padding:6px 12px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r8);font-size:var(--text-sm);font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:5px">
        ${lc('clipboard-check',13,'currentColor')} Fechar dia
      </button>
    </div>`;
}

function _kpiMassa(label, valFin, valBase, cor, campo) {
  return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 14px">
    <div style="font-size:var(--text-xs);color:var(--text2);margin-bottom:6px">${label}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:1.8rem;font-weight:800;color:${cor}">${valFin}</div>
      <div style="text-align:right">
        <div style="font-size:var(--text-2xs);color:var(--muted)">base: ${valBase}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">+${cfgPrev.margemSeguranca}%</div>
      </div>
    </div>
    <div style="margin-top:6px;display:flex;align-items:center;gap:5px">
      <span style="font-size:var(--text-xs);color:var(--muted)">Ajustar:</span>
      <input type="number" value="${valFin}" min="0"
        style="width:58px;padding:2px 5px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);font-weight:700;text-align:center"
        onchange="_ajustes.${campo}=+this.value;saveAjustesPorData();recalcularPrevisao()">
      ${_ajustes[campo] !== null ? `<button onclick="_ajustes.${campo}=null;saveAjustesPorData();recalcularPrevisao()" style="font-size:var(--text-2xs);color:var(--purple);background:none;border:none;cursor:pointer">reset</button>` : ''}
    </div>
  </div>`;
}

function _abrirFechamentoDia() {
  const planj = planejamentos.find(p => p.data === _dataRef);
  const popup = document.createElement('div');
  popup.id = 'popupFechamento';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r12);padding:22px;min-width:340px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">${lc('clipboard-check',16,'var(--purple)')} Fechamento do dia</div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:16px">Só a sobra de massa — as vendas já vêm automaticamente do Cardápio Web.</div>
      ${planj ? `
      <div style="background:var(--purple-xlight);border-radius:var(--r8);padding:10px 12px;font-size:var(--text-sm);margin-bottom:14px">
        <strong>Planejado nesse dia:</strong> ${planj.massas?.grandesFinal||'—'} grandes · ${planj.massas?.pequenasFinal||'—'} pequenas
      </div>` : ''}
      <div class="f2">
        <div class="field"><label>Sobra de massa grande</label><input class="inp" type="number" id="fcSobraGr" placeholder="ex: 5" min="0" value="${planj?.sobraGr||''}"></div>
        <div class="field"><label>Sobra de massa pequena</label><input class="inp" type="number" id="fcSobraPq" placeholder="ex: 2" min="0" value="${planj?.sobraPq||''}"></div>
      </div>
      <div class="field"><label>Observação (opcional)</label><input class="inp" id="fcObs" placeholder="ex: Forno parou às 21h..." value="${planj?.obsReal||''}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-outline" onclick="document.getElementById('popupFechamento').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_salvarFechamentoDia()">Salvar fechamento</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function _salvarFechamentoDia() {
  const sobraGr = parseInt(document.getElementById('fcSobraGr')?.value) || 0;
  const sobraPq = parseInt(document.getElementById('fcSobraPq')?.value) || 0;
  const obsReal = document.getElementById('fcObs')?.value.trim() || '';

  let p = planejamentos.find(x => x.data === _dataRef);
  if (!p) {
    p = { id: 'prev_' + _dataRef, data: _dataRef, diaSemana: new Date(_dataRef + 'T12:00:00').getDay() };
    planejamentos.push(p);
  }
  Object.assign(p, { sobraGr, sobraPq, obsReal, fechadoEm: new Date().toISOString() });
  savePlanej();
  document.getElementById('popupFechamento')?.remove();
  toast('Fechamento registrado! Sobra carregada automaticamente pro dia seguinte.', 'ok');
}

// ── Resultado: insumos projetados ────────────────────────────
function _renderResultado35(r) {
  const el = document.getElementById('resultado35');
  if (!el) return;
  const { insumos, semFicha } = r.insumosProj;
  const relevantes = insumos.filter(i => i.qtd > 0.001);

  // Agrupa pela mesma categoria de Cadastros → Insumos (CATEGORIAS_INSUMO),
  // na mesma ordem cadastrada lá — preparados entram na categoria real do
  // item (ex: um preparado de proteína cai em "Proteínas"), não numa
  // categoria "Preparados" à parte.
  const ordem = typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : [];
  const porCategoria = {};
  relevantes.forEach(i => {
    const cat = i.cat || 'Sem categoria';
    (porCategoria[cat] = porCategoria[cat] || []).push(i);
  });
  const categorias = Object.keys(porCategoria).sort((a, b) => {
    const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  el.innerHTML = `
    ${relevantes.length === 0
      ? `<div style="text-align:center;padding:20px;color:var(--muted);font-size:var(--text-sm)">${lc('info',15,'var(--muted)')} Nenhum insumo projetado — verifique se os sabores mais vendidos têm ficha técnica cadastrada.</div>`
      : categorias.map(cat => `
          <div style="margin-bottom:16px">
            <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">${cat}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              ${porCategoria[cat].map(i => `
                <div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <div style="display:flex;align-items:center;gap:6px;min-width:0">
                    <span style="font-size:var(--text-sm);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.nome}</span>
                    ${i.isProd ? `<span style="flex-shrink:0;font-size:var(--text-2xs);font-weight:700;padding:1px 6px;border-radius:8px;background:var(--purple-xlight);color:var(--purple)">preparado</span>` : ''}
                  </div>
                  <span style="flex-shrink:0;font-size:1rem;font-weight:800;color:var(--purple)">${_prevFmtQtd(i.qtd, i.unidade)}</span>
                </div>`).join('')}
            </div>
          </div>`).join('')}
    ${semFicha.length ? `
      <div style="margin-top:12px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--r8);padding:9px 12px;font-size:var(--text-xs);color:#92400e">
        ${lc('alert-triangle',13,'#92400e')} Sem ficha técnica cadastrada, não entra no cálculo: ${semFicha.join(', ')}
      </div>` : ''}
    <div style="margin-top:12px;font-size:var(--text-xs);color:var(--muted)">
      ${lc('info',13,'var(--muted)')} Inclui margem de ${cfgPrev.margemSeguranca}% (mesma da produção de massas). A massa em si está no card acima. Fichas técnicas em Cadastros → Produtos/Opções.
    </div>`;
}

function _prevFmtQtd(qtd, unidade) {
  const u = (unidade || 'un').toLowerCase();
  if (u === 'kg' || u === 'l') return fmt(qtd) + u;
  return Math.ceil(qtd) + ' ' + (unidade || 'un');
}

// ── Resultado: motoboys ──────────────────────────────────────
function _renderResultado4(r) {
  const el = document.getElementById('resultado4');
  if (!el) return;

  const horas = Object.keys(r.motoboysHora).map(Number).sort((a,b) => a-b);
  const maxNec = Math.max(...horas.map(h => r.motoboysHora[h]), 1);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div style="background:var(--surface2);border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:var(--purple)">${r.pedDel}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:3px">Pedidos delivery</div>
      </div>
      <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:var(--purple)">${r.motTotalDia}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:3px">Motoboys no pico (${r.picoH}h)</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.4rem;font-weight:800;color:var(--text2)">${r.tempoEntregaMedio != null ? r.tempoEntregaMedio+' min' : '—'}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:3px">Entrega real média</div>
      </div>
    </div>

    <!-- Ajuste total do dia -->
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:13px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:var(--text-xs);color:var(--muted)">Total recomendado pro dia</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${r.motTotalDia} motoboy${r.motTotalDia > 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:var(--text-xs);color:var(--muted)">Ajustar:</span>
        <input type="number" value="${r.motTotalDia}" min="0"
          style="width:52px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-md);font-weight:700;text-align:center"
          onchange="_ajustes.motoboys=+this.value;saveAjustesPorData();recalcularPrevisao()">
        ${_ajustes.motoboys !== null ? `<button onclick="_ajustes.motoboys=null;saveAjustesPorData();recalcularPrevisao()" style="font-size:var(--text-xs);color:var(--purple);background:none;border:none;cursor:pointer">reset</button>` : ''}
      </div>
    </div>

    <!-- Escala em 2 turnos -->
    <div style="margin-bottom:16px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">
        ${lc('bike',12,'var(--orange-dark)')} Escala sugerida — cobre o pico
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 14px">
          <div style="font-size:var(--text-xs);color:var(--muted)">${r.nFechamento > 0 ? `Turno abertura (${cfgPrev.horarioAbertura}h → ~${cfgPrev.horarioAbertura+r.horasAbertura}h)` : `Dia inteiro (${cfgPrev.horarioAbertura}h → ${cfgPrev.horarioFechamento}h)`}</div>
          <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${r.nAbertura} motoboy${r.nAbertura!==1?'s':''}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${r.nAbertura > 0 ? r.horasAbertura+'h contratadas cada' : '—'}</div>
        </div>
        <div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 14px${r.nFechamento === 0 ? ';opacity:.5' : ''}">
          <div style="font-size:var(--text-xs);color:var(--muted)">${r.nFechamento > 0 ? `Turno fechamento (~${cfgPrev.horarioFechamento-r.horasFechamento}h → ${cfgPrev.horarioFechamento}h)` : 'Turno fechamento'}</div>
          <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${r.nFechamento} motoboy${r.nFechamento!==1?'s':''}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${r.nFechamento > 0 ? r.horasFechamento+'h contratadas cada' : 'não precisa nesse dia'}</div>
        </div>
      </div>
    </div>

    <!-- Simulação de custo -->
    <div style="margin-bottom:16px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px">
        ${lc('dollar-sign',12,'var(--green)')} Simulação de custo do dia
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--surface2);border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:var(--text2)">R$ ${fmt(r.custoGarantido)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:2px">Garantido (R$${r.valorHora}/h${r.diaSemana===0||r.fatores.feriado?' · dom/feriado':''})</div>
        </div>
        <div style="background:var(--surface2);border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:var(--text2)">R$ ${fmt(r.custoCorrida)}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;margin-top:2px">Por corrida (R$${cfgPrev.valorCorridaMedio}/entrega)</div>
        </div>
      </div>
      <div style="margin-top:8px;font-size:var(--text-xs);color:var(--muted)">
        ${r.custoGarantido <= r.custoCorrida
          ? `${lc('info',12,'currentColor')} Garantido sai mais barato hoje (R$${fmt(r.custoCorrida-r.custoGarantido)} de diferença) — mas se não bater o garantido, a plataforma cobra por corrida mesmo assim.`
          : `${lc('info',12,'currentColor')} Por corrida sai mais barato hoje (R$${fmt(r.custoGarantido-r.custoCorrida)} de diferença) — só compensa fixo se quiser garantir presença.`}
      </div>
    </div>

    <!-- Curva horária real -->
    <div style="border-top:1.5px solid var(--border);padding-top:14px">
      <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">
        ${lc('bar-chart-2',12,'var(--purple)')} Motoboys necessários por hora (curva real)
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${horas.map(h => {
          const nec = r.motoboysHora[h];
          const barPct = maxNec > 0 ? Math.round(nec / maxNec * 100) : 0;
          const isPico = h === r.picoH;
          return `<div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:var(--text-xs);font-weight:700;color:var(--muted);min-width:46px">${h}h–${h+1}h</span>
            <div style="flex:1;height:20px;background:var(--surface2);border-radius:4px;overflow:hidden;position:relative">
              <div style="height:100%;width:${barPct}%;background:${isPico?'var(--purple)':'var(--purple-light)'};border-radius:4px;transition:width .4s"></div>
            </div>
            <span style="font-size:var(--text-sm);font-weight:800;color:${isPico?'var(--purple)':'var(--text2)'};min-width:28px;text-align:right">${nec}</span>
            ${isPico ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple);background:var(--purple-xlight);padding:1px 5px;border-radius:5px">PICO</span>` : '<span style="min-width:36px"></span>'}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// FATORES
// ══════════════════════════════════════════════════════════════
function toggleFatorPrev(fator) {
  _fatores[fator] = !_fatores[fator];
  saveFatoresPorData();
  const btn = document.getElementById('btn' + fator.charAt(0).toUpperCase() + fator.slice(1));
  if (btn) {
    btn.textContent      = _fatores[fator] ? 'Sim' : 'Não';
    btn.style.background = _fatores[fator] ? 'var(--purple)' : 'var(--surface)';
    btn.style.borderColor= _fatores[fator] ? 'var(--purple)' : 'var(--border)';
    btn.style.color      = _fatores[fator] ? '#fff' : 'var(--muted)';
  }
  recalcularPrevisao();
}

// ══════════════════════════════════════════════════════════════
// CONFIRMAR PLANEJAMENTO
// ══════════════════════════════════════════════════════════════
function confirmarPlanejamento() {
  if (!_resultado) { toast('Calcule a previsão primeiro', 'err'); return; }
  const r    = _resultado;
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : { name: 'Sistema' };

  const reg = {
    id:           'prev_' + _dataRef,
    data:         _dataRef,
    diaSemana:    r.diaSemana,
    criadoPor:    user?.name || 'Sistema',
    criadoEm:     new Date().toISOString(),
    historico:    { diasAnalisados: _dadosSemana.length, mediaPonderada: Math.round(r.media), fonte: 'cw_pedidos' },
    fatores:      r.fatores,
    coeficienteAplicado: r.coef,
    previsaoPedidos:  r.pedidos,
    previsaoPizzas:   { grSal: r.grSal, pqSal: r.pqSal, grDoc: r.grDoc, pqDoc: r.pqDoc, totGr: r.totGr, totPq: r.totPq, total: r.totPz },
    massas:           { grandesFinal: r.masGrFin, pequenasFinal: r.masPqFin, margemPct: cfgPrev.margemSeguranca, kgTotal: r.planoMassa.kgMassaTotal },
    lotes:            r.lotes,
    insumos:          r.insumosProj.insumos.filter(i => i.qtd > 0.001),
    motoboys:         { pedidosDelivery: r.pedDel, total: r.motTotalDia, abertura: r.nAbertura, fechamento: r.nFechamento, custoGarantido: r.custoGarantido, custoCorrida: r.custoCorrida },
    ajustesManualAplicados: Object.values(_ajustes).some(v => v !== null),
    sobraGr: 0,
    sobraPq: 0,
    obsReal: '',
    fechadoEm: null,
    confirmado:       true,
  };

  planejamentos = planejamentos.filter(p => p.data !== reg.data);
  planejamentos.push(reg);
  savePlanej();

  _mostrarPlanejSalvo(reg);
  toast('Planejamento confirmado e salvo!', 'ok');
}

function _mostrarPlanejSalvo(reg) {
  window._prevWaMsg = _montaMsgWA(reg);
  const box = document.getElementById('planejSalvoBox');
  if (!box) return;
  box.innerHTML = `
    <div class="mh">
      <div class="mt">${lc('check-circle',16,'var(--green)')} Planejamento confirmado!</div>
      <button class="mc" onclick="closeModal('ovPlanejSalvo')">${lc('x',13,'currentColor')}</button>
    </div>
    <div class="mb">
      <div style="font-size:var(--text-sm);color:var(--muted)">Envie o resumo do dia para o time pelo WhatsApp.</div>
    </div>
    <div class="mf">
      <button class="btn btn-outline" onclick="closeModal('ovPlanejSalvo')">Fechar</button>
      <button class="btn btn-wa" onclick="navigator.clipboard.writeText(window._prevWaMsg).then(()=>toast('Copiado!','ok'))">
        ${lc('copy',14,'#fff')} Copiar mensagem
      </button>
      <button class="btn btn-wa" onclick="window.open('https://wa.me/?text='+encodeURIComponent(window._prevWaMsg),'_blank')">
        ${lc('message-circle',14,'#fff')} Abrir WA
      </button>
    </div>`;
  document.getElementById('ovPlanejSalvo').classList.add('open');
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP
// ══════════════════════════════════════════════════════════════
function _montaMsgWA(r) {
  const data = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const fatoresLinha = [
    `Chuva: ${r.fatores.chuva   ? 'Sim' : 'Não'}`,
    `Feriado: ${r.fatores.feriado ? 'Sim' : 'Não'}`,
    `Evento: ${r.fatores.evento  ? 'Sim' : 'Não'}`,
    `Temperatura: ${r.fatores.temperatura}°C`,
  ].join('\n');
  const lotesLinha = r.lotes.map(l =>
    `  ${l.label}: ${fmt(l.kgMassa)}kg de massa (${l.grande} grandes + ${l.pequena} pequenas) | ${l.kgFar}kg farinha | ${l.fermG}g fermento`
  ).join('\n');
  const insumosLinha = (r.insumos || []).slice(0, 10).map(i =>
    `  ${i.nome}: ${_prevFmtQtd(i.qtd, i.unidade)}`
  ).join('\n');
  const promoLinha = (r.fatores.promocoes || []).length
    ? '\n🏷️ Promoções: ' + r.fatores.promocoes.map(p => `${p.nome} +${p.boostPct}%`).join(', ')
    : '';

  return `🍕 PLANEJAMENTO DO DIA — ${data.toUpperCase()}

📊 Previsão de pedidos: ${r.previsaoPedidos}

🫓 Produção recomendada:
  Massa total: ${fmt(r.massas.kgTotal)}kg
  Massas grandes: ${r.massas.grandesFinal} · Massas pequenas: ${r.massas.pequenasFinal}

⚙️ Lotes de produção (${r.lotes.length}):
${lotesLinha}

📦 Insumos pra pré-produção:
${insumosLinha || '  —'}

🏍️ Motoboys:
  Turno abertura: ${r.motoboys.abertura}
  Turno fechamento: ${r.motoboys.fechamento}
  Total: ${r.motoboys.total}
  Custo estimado: garantido R$${fmt(r.motoboys.custoGarantido)} · por corrida R$${fmt(r.motoboys.custoCorrida)}

⚡ Fatores considerados:
${fatoresLinha}${promoLinha}${r.fatores.obs ? '\n📝 Obs: ' + r.fatores.obs : ''}

_Gerado pelo VTP Compras_`;
}

function enviarWATime() {
  if (!_resultado) { toast('Calcule a previsão primeiro', 'err'); return; }
  const reg = {
    data: _dataRef,
    fatores: _resultado.fatores,
    previsaoPedidos: _resultado.pedidos,
    massas: { grandesFinal: _resultado.masGrFin, pequenasFinal: _resultado.masPqFin, kgTotal: _resultado.planoMassa.kgMassaTotal },
    lotes: _resultado.lotes,
    insumos: _resultado.insumosProj.insumos.filter(i => i.qtd > 0.001),
    motoboys: { abertura: _resultado.nAbertura, fechamento: _resultado.nFechamento, total: _resultado.motTotalDia, custoGarantido: _resultado.custoGarantido, custoCorrida: _resultado.custoCorrida },
  };
  const msg = _montaMsgWA(reg);
  if (cfgPrev.waGrupo) {
    window.open('https://wa.me/' + cfgPrev.waGrupo.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg), '_blank');
  } else {
    navigator.clipboard.writeText(msg).then(() => toast('Mensagem copiada! Configure o WA do grupo nos parâmetros.', 'info'));
  }
}

// ══════════════════════════════════════════════════════════════
// HISTÓRICO REAL (excluir outlier, sem digitar número nenhum)
// ══════════════════════════════════════════════════════════════
function _abrirHistoricoReal() {
  const diaSem = new Date(_dataRef + 'T12:00:00').getDay();
  const box = document.getElementById('historicoBox');
  if (!box) return;
  const lista = [..._dadosSemana].sort((a,b) => b.data.localeCompare(a.data));
  box.innerHTML = `
    <div class="mh">
      <div class="mt">${lc('activity',15,'var(--purple)')} Histórico real de ${DIAS[diaSem]}s</div>
      <button class="mc" onclick="closeModal('ovHistorico')">${lc("x",13,"currentColor")}</button>
    </div>
    <div class="mb">
      <div style="margin-bottom:12px;font-size:var(--text-sm);color:var(--muted)">
        ${lista.length} registros encontrados em cw_pedidos. Marque como excluído um dia atípico (ex: forno quebrou, sistema fora do ar) pra não distorcer a média.
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto">
        ${lista.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--muted)">Nenhum pedido real ainda</div>`
          : lista.map(h => {
              const excluido = _prevExcluido(h.data);
              return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r8);${excluido?'opacity:.55':''}">
              <div>
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                  <span style="font-size:var(--text-sm);font-weight:700">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</span>
                  ${excluido ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:1px 5px;border-radius:8px;background:var(--surface2);color:var(--muted)">Excluído</span>` : ''}
                </div>
                <div style="font-size:var(--text-xs);color:var(--muted)">${h.pizzas.grSal+h.pizzas.pqSal+h.pizzas.grDoc+h.pizzas.pqDoc} pizzas · delivery: ${h.pedidosDelivery}</div>
                ${excluido ? `<input class="inp" style="margin-top:5px;font-size:var(--text-xs);padding:4px 8px" placeholder="motivo (opcional)" value="${exclusoesPrev[h.data] || ''}" onchange="_salvarMotivoExclusao('${h.data}',this.value)">` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">${h.pedidos} <span style="font-size:var(--text-xs);font-weight:400;color:var(--muted)">pedidos</span></div>
                <button onclick="_toggleExclusaoDia('${h.data}')" style="padding:5px 10px;background:${excluido?'var(--surface2)':'var(--red-light)'};border:1.5px solid ${excluido?'var(--border)':'var(--red)'};border-radius:var(--r6);font-size:var(--text-xs);font-weight:600;color:${excluido?'var(--text2)':'var(--red)'};cursor:pointer">
                  ${excluido ? 'Reincluir' : 'Excluir'}
                </button>
              </div>
            </div>`;
            }).join('')}
      </div>
    </div>
    <div class="mf"><button class="btn btn-outline" onclick="closeModal('ovHistorico')">Fechar</button></div>`;
  document.getElementById('ovHistorico').classList.add('open');
}

function _toggleExclusaoDia(data) {
  if (data in exclusoesPrev) delete exclusoesPrev[data];
  else exclusoesPrev[data] = '';
  saveExclusoes();
  _base = _prevCalcularBase();

  // Atualiza só os pedaços afetados — sem reconstruir o layout inteiro,
  // senão o modal de histórico (que faz parte desse HTML) fecharia no meio
  // do usuário marcando vários dias em sequência.
  const dataAtual = new Date(_dataRef + 'T12:00:00');
  const s1 = document.getElementById('secao1Wrap');
  if (s1) s1.innerHTML = _renderSecao1(dataAtual, dataAtual.getDay());
  const ph = document.getElementById('painelHistWrap');
  if (ph) ph.innerHTML = _renderPainelHistorico();
  recalcularPrevisao();
  _abrirHistoricoReal();
}

function _salvarMotivoExclusao(data, motivo) {
  exclusoesPrev[data] = motivo.trim();
  saveExclusoes();
}

function verHistoricoPlanej() {
  if (!planejamentos.length) { toast('Nenhum planejamento salvo ainda', 'info'); return; }
  const ult = planejamentos.sort((a,b) => b.data.localeCompare(a.data)).slice(0,1)[0];
  _mostrarPlanejSalvo(ult);
}

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════════════════════════
function _renderModalCfg() {
  const c = cfgPrev;
  return `
    <div class="mbox" style="max-width:580px;max-height:90vh;overflow-y:auto">
      <div class="mh"><div class="mt">${lc('settings',15,'var(--purple)')} Parâmetros de previsão</div><button class="mc" onclick="closeModal('ovCfgPrev2')">${lc("x",13,"currentColor")}</button></div>
      <div class="mb" style="display:flex;flex-direction:column;gap:0">

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:4px 0 10px">${lc("hash",13,"currentColor")} Histórico</div>
        <div class="field">
          <label>Semanas de histórico a considerar</label>
          <input class="inp" type="number" id="cSemanas" value="${c.semanasHistorico}" min="2" max="26">
          <span style="font-size:var(--text-xs);color:var(--muted)">semanas mais recentes pesam mais na média</span>
        </div>

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">${lc("layers",14,"currentColor")} Massas e lotes</div>
        <div class="f2">
          <div class="field"><label>Margem de segurança (%)</label><input class="inp" type="number" id="cMargem" value="${c.margemSeguranca}" min="0" max="50"></div>
          <div class="field"><label>Limite p/ dividir em 2 lotes (pizzas até 20h)</label><input class="inp" type="number" id="cLimite" value="${c.limiteBatidaDividida}" min="1"></div>
        </div>
        <div class="field"><label>Kg farinha por lote cheio (referência)</label><input class="inp" type="number" id="cKgFar" value="${c.kgFarinhaBatida}" step="0.5" min="1"></div>

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">${lc("beaker",14,"currentColor")} Fermento</div>
        <div class="f2">
          <div class="field"><label>Fermento base (g/kg de farinha)</label><input class="inp" type="number" id="cFermBase" value="${c.fermentoBasePorKg}" step="0.5" min="1"><span style="font-size:var(--text-xs);color:var(--muted)">na temp. de referência</span></div>
          <div class="field"><label>Temperatura de referência (°C)</label><input class="inp" type="number" id="cTempRef" value="${c.tempReferencia}" min="10" max="40"></div>
        </div>

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">${lc("truck",14,"currentColor")} Motoboys</div>
        <div class="f2">
          <div class="field"><label>Tempo médio por entrega (min)</label><input class="inp" type="number" id="cTempoEnt" value="${c.tempoMedioEntregaMin}" step="0.5" min="1"></div>
          <div class="field"><label>Entregas/motoboy/dia (referência)</label><input class="inp" type="number" id="cEntDia" value="${c.entregasPorMotoboyDia}" min="1"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Horário de abertura</label><input class="inp" type="number" id="cHorAbre" value="${c.horarioAbertura}" min="0" max="23"></div>
          <div class="field"><label>Horário de fechamento</label><input class="inp" type="number" id="cHorFecha" value="${c.horarioFechamento}" min="1" max="23"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Valor hora garantido — normal (R$)</label><input class="inp" type="number" id="cValHoraN" value="${c.valorHoraNormal}" step="0.5" min="0"></div>
          <div class="field"><label>Valor hora garantido — dom/feriado (R$)</label><input class="inp" type="number" id="cValHoraF" value="${c.valorHoraDomFer}" step="0.5" min="0"></div>
        </div>
        <div class="field"><label>Valor médio por corrida (R$)</label><input class="inp" type="number" id="cValCorrida" value="${c.valorCorridaMedio}" step="0.1" min="0"></div>

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">${lc("message-circle",14,"currentColor")} WhatsApp do time</div>
        <div class="field">
          <label>Número do grupo WA (com DDI)</label>
          <input class="inp" id="cWaGrupo" value="${c.waGrupo||''}" placeholder="5511999887766">
          <span style="font-size:var(--text-xs);color:var(--muted)">ex: 5582999887766 · sem espaços</span>
        </div>
      </div>
      <div class="mf">
        <button class="btn btn-outline" onclick="closeModal('ovCfgPrev2')">Cancelar</button>
        <button class="btn btn-outline btn-sm" onclick="_resetCfgPrev()" style="color:var(--red);border-color:var(--red)">Restaurar padrão</button>
        <button class="btn btn-primary" onclick="_salvarCfgPrev()">${lc('save',14,'#fff')} Salvar</button>
      </div>
    </div>`;
}

function abrirCfgPrev2() { document.getElementById('ovCfgPrev2').classList.add('open'); }

function _salvarCfgPrev() {
  cfgPrev = {
    semanasHistorico:      +document.getElementById('cSemanas').value    || 8,
    margemSeguranca:       +document.getElementById('cMargem').value     || 10,
    limiteBatidaDividida:  +document.getElementById('cLimite').value     || 40,
    kgFarinhaBatida:       +document.getElementById('cKgFar').value      || 10,
    fermentoBasePorKg:     +document.getElementById('cFermBase').value   || 10,
    tempReferencia:        +document.getElementById('cTempRef').value    || 22,
    tempoMedioEntregaMin:  +document.getElementById('cTempoEnt').value   || 12.5,
    entregasPorMotoboyDia: +document.getElementById('cEntDia').value     || 20,
    horarioAbertura:       +document.getElementById('cHorAbre').value    || 17,
    horarioFechamento:     +document.getElementById('cHorFecha').value   || 23,
    valorHoraNormal:       +document.getElementById('cValHoraN').value   || 20,
    valorHoraDomFer:       +document.getElementById('cValHoraF').value   || 25,
    valorCorridaMedio:     +document.getElementById('cValCorrida').value || 9.5,
    waGrupo:               document.getElementById('cWaGrupo').value.trim(),
  };
  saveCfgPrev();
  closeModal('ovCfgPrev2');
  toast('Configurações salvas!', 'ok');
  renderPrevisao();
}

function _resetCfgPrev() {
  vtpConfirm({
    title: 'Restaurar parâmetros',
    message: 'As configurações personalizadas serão substituídas pelos valores padrão.',
    confirmLabel: 'Restaurar',
    onConfirm: () => {
      cfgPrev = { ...CFG_PREV_DEFAULT };
      saveCfgPrev();
      closeModal('ovCfgPrev2');
      toast('Parâmetros restaurados!');
      renderPrevisao();
    }
  });
}

/**
 * VTP Compras — Módulo de Previsão de Demanda v2
 * Protótipo com localStorage. Pronto para migrar para Supabase + API Cardápio Web.
 */

// ══════════════════════════════════════════════════════════════
// CONFIG PADRÃO
// ══════════════════════════════════════════════════════════════
const CFG_PREV_DEFAULT = {
  // Distribuição de pizzas por pedido
  distGrSalgada:      1.04,
  distPqSalgada:      0.06,
  distGrDoce:         0.07,
  distPqDoce:         0.34,
  // Massas
  margemSeguranca:    10,   // %
  capGrandesBatida:   30,   // unidades por batida
  capPequenasBatida:  60,
  horarioPico:        19,   // hora
  tempoMinAntes:      60,   // minutos antes de usar
  // Fermento
  fermentoBasePorKg:  10,   // g/kg a temp de referência
  tempReferencia:     22,   // °C
  kgFarinhaBatida:    10,   // kg por batida
  // Motoboys
  pctDelivery:        65,   // % dos pedidos
  entregasPorHora:    4,    // por motoboy
  janelaPicoHoras:    2,
  motoristasFixos:    2,
  margemMoto:         10,   // %
  // API
  tokenCardapioWeb:   '',
  diasHistorico:      90,
};

let cfgPrev = JSON.parse(localStorage.getItem('vtp_cfg_prev2') || 'null') || { ...CFG_PREV_DEFAULT };
let historicoAPI = JSON.parse(localStorage.getItem('vtp_hist_api') || '[]');
let planejamentos = JSON.parse(localStorage.getItem('vtp_planejamentos') || '[]');

const saveCfgPrev    = () => localStorage.setItem('vtp_cfg_prev2',      JSON.stringify(cfgPrev));
const saveHistorico  = () => localStorage.setItem('vtp_hist_api',       JSON.stringify(historicoAPI));
const savePlanej     = () => localStorage.setItem('vtp_planejamentos',  JSON.stringify(planejamentos));

const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

// Estado reativo
let _fatores = { chuva: false, feriado: false, evento: false, temperatura: 28, obs: '' };
let _ajustes = { pedidos: null, grandesFinal: null, pequenasFinal: null, motoboys: null };
let _resultado = null;

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderPrevisao() {
  const hoje      = new Date();
  const diaSem    = hoje.getDay();
  const hist      = _getHistoricoDia(diaSem);
  const mediaHist = hist.length ? Math.round(hist.reduce((s,h) => s + h.pedidos, 0) / hist.length) : null;

  document.getElementById('previsaoContent').innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">

      <!-- ═══════ COLUNA PRINCIPAL ═══════ -->
      <div style="flex:1;min-width:320px;display:flex;flex-direction:column;gap:16px">

        ${_renderSecao1(hoje, diaSem, hist, mediaHist)}
        ${_renderSecao2(mediaHist)}
        ${_renderSecao3()}
        ${_renderSecao4()}
        ${_renderRodape()}

      </div>

      <!-- ═══════ PAINEL LATERAL ═══════ -->
      <div style="width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:12px">
        ${_renderPainelFatores()}
        ${_renderPainelHistorico(hist, diaSem)}
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

    <!-- Modal Histórico -->
    <div class="overlay" id="ovHistorico" onclick="if(event.target===this)closeModal('ovHistorico')">
      <div class="mbox" style="max-width:680px" id="historicoBox"></div>
    </div>`;

  recalcularPrevisao();
}

// ── Seção 1: Contexto do dia ──────────────────────────────────
function _renderSecao1(hoje, diaSem, hist, media) {
  const temHistorico = hist.length > 0;
  return `
    <div style="background:linear-gradient(135deg,#6B21D4,#9333EA);border-radius:var(--r12);padding:20px 22px;color:#fff">
      <div style="font-size:.65rem;opacity:.7;text-transform:uppercase;letter-spacing:.9px;margin-bottom:6px">
        Planejamento de hoje
      </div>
      <div style="font-size:1.5rem;font-weight:800;margin-bottom:4px">
        ${DIAS[diaSem]}, ${hoje.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:10px">
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800">${hist.length}</div>
          <div style="font-size:.62rem;opacity:.8;text-transform:uppercase">${DIAS[diaSem]}s analisadas</div>
        </div>
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800">${media ?? '—'}</div>
          <div style="font-size:.62rem;opacity:.8;text-transform:uppercase">Pedidos médios</div>
        </div>
        <div style="background:rgba(255,255,255,.15);border-radius:var(--r8);padding:8px 14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800">${cfgPrev.diasHistorico}</div>
          <div style="font-size:.62rem;opacity:.8;text-transform:uppercase">Dias de histórico</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${temHistorico
            ? `<button onclick="abrirModalHistorico()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 12px;border-radius:var(--r8);font-size:.72rem;cursor:pointer;font-weight:600">
                Ver histórico
               </button>`
            : ''}
          <button onclick="importarDadosManual()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 12px;border-radius:var(--r8);font-size:.72rem;cursor:pointer;font-weight:600">
            ${lc('upload',13,'#fff')} Importar dados
          </button>
        </div>
      </div>
      ${!temHistorico ? `
        <div style="margin-top:12px;background:rgba(255,200,50,.2);border:1px solid rgba(255,200,50,.4);border-radius:var(--r8);padding:8px 12px;font-size:.72rem;opacity:.9">
          ${lc('alert-triangle',13,'#FFD700')} Sem histórico. Use "Importar dados" para registrar pedidos manualmente ou conecte a API do Cardápio Web nas configurações.
        </div>` : ''}
    </div>`;
}

// ── Seção 2: Previsão de pedidos e pizzas ─────────────────────
function _renderSecao2(mediaHist) {
  return `
    <div class="card" id="secao2">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:.88rem;font-weight:800">${lc('trending-up',16,'var(--purple)')} Previsão de pedidos e pizzas</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:2px">Baseada no histórico · ajuste os fatores ao lado</div>
        </div>
      </div>
      <div style="padding:16px 18px" id="resultado2">
        <div style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px">
          Calculando...
        </div>
      </div>
    </div>`;
}

// ── Seção 3: Massas e batidas ─────────────────────────────────
function _renderSecao3() {
  return `
    <div class="card" id="secao3">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:.88rem;font-weight:800">${lc('chef-hat',16,'var(--purple)')} Plano de massas e batidas</div>
        <div style="font-size:.68rem;color:var(--muted);margin-top:2px">Sugestão operacional · você pode ajustar antes de confirmar</div>
      </div>
      <div style="padding:16px 18px" id="resultado3">
        <div style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Seção 4: Motoboys ─────────────────────────────────────────
function _renderSecao4() {
  return `
    <div class="card" id="secao4">
      <div style="padding:16px 18px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:.88rem;font-weight:800">${lc('truck',16,'var(--purple)')} Previsão de motoboys</div>
        <div style="font-size:.68rem;color:var(--muted);margin-top:2px">Fixos + diaristas conforme demanda de delivery</div>
      </div>
      <div style="padding:16px 18px" id="resultado4">
        <div style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px">Calculando...</div>
      </div>
    </div>`;
}

// ── Rodapé de ações ───────────────────────────────────────────
function _renderRodape() {
  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap" id="rodapePrev">
      <button onclick="confirmarPlanejamento()"
        style="flex:1;padding:13px;background:var(--purple);color:#fff;border:none;border-radius:var(--r10);font-size:.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        ${lc('check-circle',16,'#fff')} Confirmar planejamento
      </button>
      <button onclick="enviarWATime()"
        style="padding:13px 18px;background:#25D366;color:#fff;border:none;border-radius:var(--r10);font-size:.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
        ${lc('message-circle',16,'#fff')} Enviar WA
      </button>
    </div>`;
}

// ── Painel lateral: fatores ───────────────────────────────────
function _renderPainelFatores() {
  const btnStyle = (ativo, cor='var(--purple)') =>
    `padding:6px 14px;border-radius:20px;font-size:.75rem;font-weight:700;border:1.5px solid ${ativo ? cor : 'var(--border)'};background:${ativo ? cor : 'var(--surface)'};color:${ativo ? '#fff' : 'var(--muted)'};cursor:pointer;transition:all .2s`;

  return `
    <div class="card">
      <div style="padding:13px 15px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:.82rem;font-weight:800">${lc('zap',14,'var(--purple)')} Fatores do dia</div>
        <div style="font-size:.66rem;color:var(--muted)">Ajustam a previsão automaticamente</div>
      </div>
      <div style="padding:13px 15px;display:flex;flex-direction:column;gap:13px">

        <!-- Temperatura -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <div style="font-size:.78rem;font-weight:600">${lc('thermometer',14,'var(--purple)')} Temperatura da cozinha</div>
            <div style="display:flex;align-items:center;gap:5px">
              <input type="number" id="fTemp" value="${_fatores.temperatura}" min="15" max="45"
                style="width:52px;padding:4px 6px;border:1.5px solid var(--purple);border-radius:var(--r6);font-size:.86rem;font-weight:700;text-align:center;color:var(--purple)"
                oninput="_fatores.temperatura=+this.value;recalcularPrevisao()">
              <span style="font-size:.74rem;color:var(--muted)">°C</span>
            </div>
          </div>
          <div id="tempHint" style="font-size:.67rem;color:var(--muted);background:var(--surface2);border-radius:var(--r6);padding:4px 8px"></div>
        </div>

        <!-- Chuva -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.78rem;font-weight:600">${lc('cloud-rain',14,'var(--purple)')} Vai chover hoje?</div>
            <div style="font-size:.65rem;color:var(--muted)">Aumenta delivery (~+${Math.round((1.20-1)*100)}%)</div>
          </div>
          <button id="btnChuva" onclick="toggleFatorPrev('chuva')" style="${btnStyle(_fatores.chuva)}">
            ${_fatores.chuva ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Feriado -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.78rem;font-weight:600">${lc('star',14,'var(--purple)')} Feriado / data especial?</div>
            <div style="font-size:.65rem;color:var(--muted)">Aumenta movimento (~+35%)</div>
          </div>
          <button id="btnFeriado" onclick="toggleFatorPrev('feriado')" style="${btnStyle(_fatores.feriado)}">
            ${_fatores.feriado ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Evento -->
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:.78rem;font-weight:600">${lc('zap',14,'var(--purple)')} Evento próximo?</div>
            <div style="font-size:.65rem;color:var(--muted)">Show, jogo, evento local (~+20%)</div>
          </div>
          <button id="btnEvento" onclick="toggleFatorPrev('evento')" style="${btnStyle(_fatores.evento)}">
            ${_fatores.evento ? 'Sim' : 'Não'}
          </button>
        </div>

        <!-- Observação -->
        <div>
          <div style="font-size:.75rem;font-weight:600;margin-bottom:4px">${lc('edit-2',13,'var(--muted)')} Observação</div>
          <input class="inp" id="fObs" value="${_fatores.obs}"
            placeholder="ex: Copa do Mundo, Dia das Mães..."
            style="font-size:.76rem;padding:6px 9px"
            oninput="_fatores.obs=this.value">
        </div>
      </div>
    </div>`;
}

// ── Painel lateral: histórico ─────────────────────────────────
function _renderPainelHistorico(hist, diaSem) {
  return `
    <div class="card">
      <div style="padding:13px 15px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:.82rem;font-weight:800">${lc('activity',14,'var(--purple)')} Histórico — ${DIAS[diaSem]}s</div>
        <span style="font-size:.66rem;color:var(--muted)">${hist.length} reg.</span>
      </div>
      <div style="max-height:220px;overflow-y:auto">
        ${hist.length === 0
          ? `<div style="padding:16px;text-align:center;font-size:.76rem;color:var(--muted)">Nenhum dado ainda</div>`
          : hist.slice(0, 8).map(h => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 15px;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:.75rem;font-weight:600">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
                ${h.obs ? `<div style="font-size:.62rem;color:var(--muted);font-style:italic">${h.obs}</div>` : ''}
              </div>
              <div style="text-align:right">
                <div style="font-size:.9rem;font-weight:800;color:var(--purple)">${h.pedidos}</div>
                <div style="font-size:.6rem;color:var(--muted)">pedidos</div>
              </div>
            </div>`).join('')}
      </div>
      <div style="padding:10px 15px;border-top:1px solid var(--border)">
        <button onclick="abrirImportarPedidos()" style="width:100%;padding:7px;background:none;border:1.5px dashed var(--border);border-radius:var(--r8);font-size:.74rem;color:var(--muted);cursor:pointer">
          ${lc('plus',13,'var(--muted)')} Adicionar pedidos manualmente
        </button>
      </div>
    </div>`;
}

// ── Painel lateral: ações ─────────────────────────────────────
function _renderPainelAcoes() {
  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button onclick="abrirCfgPrev2()"
        style="width:100%;padding:9px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);font-size:.76rem;font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
        ${lc('settings',14,'var(--muted)')} Parâmetros e configurações
      </button>
      ${planejamentos.length > 0 ? `
        <button onclick="verHistoricoPlanej()"
          style="width:100%;padding:9px;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r8);font-size:.76rem;font-weight:600;color:var(--text2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px">
          ${lc('clipboard-list',14,'var(--muted)')} Ver planejamentos anteriores
        </button>` : ''}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// CÁLCULO PRINCIPAL
// ══════════════════════════════════════════════════════════════
function recalcularPrevisao() {
  const diaSem = new Date().getDay();
  const hist   = _getHistoricoDia(diaSem);
  const media  = hist.length ? hist.reduce((s,h) => s + h.pedidos, 0) / hist.length : null;

  // Hint temperatura
  const temp = _fatores.temperatura;
  const coefF = Math.pow(2, (cfgPrev.tempReferencia - temp) / 5);
  const ferAj = +(cfgPrev.fermentoBasePorKg * coefF).toFixed(1);
  const hintEl = document.getElementById('tempHint');
  if (hintEl) {
    const diff = +(ferAj - cfgPrev.fermentoBasePorKg).toFixed(1);
    hintEl.innerHTML = `Base: <strong>${cfgPrev.fermentoBasePorKg}g/kg</strong> → A ${temp}°C: <strong style="color:var(--purple)">${ferAj}g/kg</strong> <span>(${diff > 0 ? '+' : ''}${diff}g — ${temp > cfgPrev.tempReferencia ? 'mais quente, menos fermento' : 'mais frio, mais fermento'})</span>`;
  }

  if (!media) {
    ['resultado2','resultado3','resultado4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:.8rem">${lc('alert-triangle',16,'var(--muted)')} Sem histórico — adicione dados para ver a previsão</div>`;
    });
    return;
  }

  // ── Coeficiente ──
  let coef = 1;
  if (_fatores.chuva)   coef *= 1.20;
  if (_fatores.feriado) coef *= 1.35;
  if (_fatores.evento)  coef *= 1.20;

  // ── Pedidos ──
  const pedidosCalc = Math.ceil(media * coef);
  const pedidos     = _ajustes.pedidos ?? pedidosCalc;

  // ── Pizzas ──
  const grSal = Math.ceil(pedidos * cfgPrev.distGrSalgada);
  const pqSal = Math.ceil(pedidos * cfgPrev.distPqSalgada);
  const grDoc = Math.ceil(pedidos * cfgPrev.distGrDoce);
  const pqDoc = Math.ceil(pedidos * cfgPrev.distPqDoce);
  const totGr = grSal + grDoc;
  const totPq = pqSal + pqDoc;
  const totPz = totGr + totPq;

  // ── Massas ──
  const marg     = cfgPrev.margemSeguranca / 100;
  const masGrBase = totGr;
  const masPqBase = totPq;
  const masGrFin  = _ajustes.grandesFinal  ?? Math.ceil(masGrBase * (1 + marg));
  const masPqFin  = _ajustes.pequenasFinal ?? Math.ceil(masPqBase * (1 + marg));

  // ── Batidas ──
  const batGr  = Math.ceil(masGrFin / cfgPrev.capGrandesBatida);
  const batPq  = Math.ceil(masPqFin / cfgPrev.capPequenasBatida);
  const totBat = Math.max(batGr, batPq, 1);
  const horPico = cfgPrev.horarioPico;
  const minAntes = cfgPrev.tempoMinAntes / 60;

  const batidas = Array.from({ length: totBat }, (_, i) => {
    const horario  = Math.round(horPico - minAntes - (totBat - 1 - i));
    const grBol    = Math.ceil(masGrFin / totBat);
    const pqBol    = i === 0 ? Math.ceil(masPqFin / totBat) : Math.floor(masPqFin / totBat);
    const kgFar    = cfgPrev.kgFarinhaBatida;
    const fermG    = +(kgFar * ferAj).toFixed(0);
    return { num: i + 1, horario: `${horario}h`, grBol, pqBol, kgFar, fermG };
  });

  // ── Motoboys ──
  const pedDel   = Math.ceil(pedidos * cfgPrev.pctDelivery / 100);
  const naPico   = Math.ceil(pedDel * 0.60);
  const motNec   = Math.ceil(naPico / (cfgPrev.entregasPorHora * cfgPrev.janelaPicoHoras) * (1 + cfgPrev.margemMoto / 100));
  const motFix   = cfgPrev.motoristasFixos;
  const diaristas = Math.max(0, (_ajustes.motoboys ?? motNec) - motFix);
  const motFinal  = _ajustes.motoboys ?? motNec;

  // Salva resultado global
  _resultado = { pedidos, pedidosCalc, media, coef, grSal, pqSal, grDoc, pqDoc, totGr, totPq, totPz, masGrFin, masPqFin, batidas, totBat, pedDel, motNec, motFix, diaristas, motFinal, ferAj, temp };

  _renderResultado2(pedidos, pedidosCalc, media, coef, grSal, pqSal, grDoc, pqDoc, totGr, totPq, totPz);
  _renderResultado3(masGrFin, masPqFin, masGrBase, masPqBase, batidas, totBat, ferAj, temp);
  _renderResultado4(pedDel, motNec, motFix, diaristas, motFinal);
}

// ── Resultado: pedidos e pizzas ──────────────────────────────
function _renderResultado2(pedidos, pedidosCalc, media, coef, grSal, pqSal, grDoc, pqDoc, totGr, totPq, totPz) {
  const el = document.getElementById('resultado2');
  if (!el) return;
  const coefAtivos = [];
  if (_fatores.chuva)   coefAtivos.push(`Chuva +20%`);
  if (_fatores.feriado) coefAtivos.push(`Feriado +35%`);
  if (_fatores.evento)  coefAtivos.push(`Evento +20%`);

  el.innerHTML = `
    <!-- Pedidos -->
    <div style="margin-bottom:18px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Pedidos previstos</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r12);padding:16px 22px;text-align:center">
          <div style="font-size:2.4rem;font-weight:800;color:var(--purple);line-height:1">${pedidos}</div>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px;text-transform:uppercase">pedidos</div>
        </div>
        <div style="flex:1">
          <div style="font-size:.78rem;color:var(--text2);margin-bottom:5px">
            Média histórica: <strong>${Math.round(media)}</strong>
            ${coef !== 1 ? ` × <span style="color:var(--purple);font-weight:700">${coef.toFixed(2)}</span> = <strong style="color:var(--purple)">${pedidosCalc}</strong>` : ''}
          </div>
          ${coefAtivos.length ? `
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${coefAtivos.map(f => `<span style="padding:2px 8px;border-radius:10px;font-size:.65rem;font-weight:600;background:var(--purple-xlight);color:var(--purple)">${f}</span>`).join('')}
            </div>` : `<div style="font-size:.72rem;color:var(--muted)">Sem ajuste de fatores</div>`}
          <div style="margin-top:8px">
            <label style="font-size:.7rem;color:var(--muted)">Ajustar manualmente:</label>
            <input type="number" value="${pedidos}" min="1"
              style="margin-left:6px;width:64px;padding:3px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.82rem;font-weight:700;text-align:center"
              onchange="_ajustes.pedidos=+this.value;recalcularPrevisao()">
            ${_ajustes.pedidos ? `<button onclick="_ajustes.pedidos=null;recalcularPrevisao()" style="margin-left:5px;font-size:.65rem;color:var(--purple);background:none;border:none;cursor:pointer">Resetar</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Pizzas -->
    <div style="border-top:1.5px solid var(--border);padding-top:16px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Distribuição de pizzas</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        ${_kpiPizza('Grandes Salgadas', grSal, '#6B21D4')}
        ${_kpiPizza('Pequenas Salgadas', pqSal, '#6B21D4')}
        ${_kpiPizza('Grandes Doces', grDoc, '#D97706')}
        ${_kpiPizza('Pequenas Doces', pqDoc, '#D97706')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${_kpiPizzaTotal('Total Grandes', totGr, 'var(--purple)')}
        ${_kpiPizzaTotal('Total Pequenas', totPq, 'var(--purple)')}
        ${_kpiPizzaTotal('Total Geral', totPz, 'var(--green)')}
      </div>
    </div>`;
}

function _kpiPizza(label, val, cor) {
  return `<div style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 12px;display:flex;align-items:center;justify-content:space-between">
    <span style="font-size:.72rem;color:var(--text2)">${label}</span>
    <span style="font-size:1.1rem;font-weight:800;color:${cor}">${val}</span>
  </div>`;
}

function _kpiPizzaTotal(label, val, cor) {
  return `<div style="background:var(--surface2);border-radius:var(--r8);padding:10px;text-align:center">
    <div style="font-size:1.3rem;font-weight:800;color:${cor}">${val}</div>
    <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;margin-top:2px">${label}</div>
  </div>`;
}

// ── Resultado: massas e batidas ──────────────────────────────
function _renderResultado3(masGrFin, masPqFin, masGrBase, masPqBase, batidas, totBat, ferAj, temp) {
  const el = document.getElementById('resultado3');
  if (!el) return;
  el.innerHTML = `
    <!-- Massas -->
    <div style="margin-bottom:18px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">Massas recomendadas (com ${cfgPrev.margemSeguranca}% de margem)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        ${_kpiMassa('Massas grandes', masGrFin, masGrBase, 'var(--purple)', 'grandesFinal')}
        ${_kpiMassa('Massas pequenas', masPqFin, masPqBase, '#D97706', 'pequenasFinal')}
      </div>
      <div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--r8);padding:9px 12px;font-size:.72rem;color:#166534;display:flex;align-items:center;gap:8px">
        ${lc('info',14,'#166534')} Margem de ${cfgPrev.margemSeguranca}% incluída. Total recomendado: <strong>${masGrFin + masPqFin} massas</strong>
      </div>
    </div>

    <!-- Batidas -->
    <div style="border-top:1.5px solid var(--border);padding-top:16px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:10px">
        Plano de batidas — ${totBat} batida${totBat > 1 ? 's' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${batidas.map(b => `
          <div style="border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
            <div style="display:flex;align-items:center;gap:0;background:var(--surface2)">
              <div style="width:40px;height:40px;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800;flex-shrink:0">${b.num}</div>
              <div style="flex:1;padding:0 12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Grandes</div>
                  <div style="font-size:1rem;font-weight:800;color:var(--purple)">${b.grBol}</div>
                </div>
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Pequenas</div>
                  <div style="font-size:1rem;font-weight:800;color:#D97706">${b.pqBol}</div>
                </div>
                <div style="text-align:center;padding:8px 0">
                  <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Farinha</div>
                  <div style="font-size:1rem;font-weight:800">${b.kgFar}kg</div>
                </div>
                <div style="text-align:center;padding:8px 0;background:var(--yellow-light);border-radius:var(--r6);padding:6px 10px;margin:6px 0">
                  <div style="font-size:.62rem;color:#92400e;text-transform:uppercase">Fermento</div>
                  <div style="font-size:1rem;font-weight:800;color:#92400e">${b.fermG}g</div>
                </div>
                <div style="text-align:center;padding:8px 0;background:var(--purple-xlight);border-radius:var(--r6);padding:6px 12px;margin:6px 0">
                  <div style="font-size:.62rem;color:var(--purple);text-transform:uppercase">Horário</div>
                  <div style="font-size:1rem;font-weight:800;color:var(--purple)">${b.horario}</div>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div style="margin-top:10px;background:var(--surface2);border-radius:var(--r8);padding:9px 12px;font-size:.7rem;color:var(--muted)">
        ${lc('thermometer',13,'var(--muted)')} ${temp}°C → ${ferAj}g de fermento fresco por kg de farinha (ajustado pela temperatura)
      </div>
    </div>`;
}

function _kpiMassa(label, valFin, valBase, cor, campo) {
  return `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 14px">
    <div style="font-size:.72rem;color:var(--text2);margin-bottom:6px">${label}</div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:1.8rem;font-weight:800;color:${cor}">${valFin}</div>
      <div style="text-align:right">
        <div style="font-size:.62rem;color:var(--muted)">base: ${valBase}</div>
        <div style="font-size:.62rem;color:var(--muted)">+${cfgPrev.margemSeguranca}%</div>
      </div>
    </div>
    <div style="margin-top:6px;display:flex;align-items:center;gap:5px">
      <span style="font-size:.65rem;color:var(--muted)">Ajustar:</span>
      <input type="number" value="${valFin}" min="1"
        style="width:58px;padding:2px 5px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.8rem;font-weight:700;text-align:center"
        onchange="_ajustes.${campo}=+this.value;recalcularPrevisao()">
      ${_ajustes[campo] ? `<button onclick="_ajustes.${campo}=null;recalcularPrevisao()" style="font-size:.62rem;color:var(--purple);background:none;border:none;cursor:pointer">reset</button>` : ''}
    </div>
  </div>`;
}

// ── Resultado: motoboys ──────────────────────────────────────
function _renderResultado4(pedDel, motNec, motFix, diaristas, motFinal) {
  const el = document.getElementById('resultado4');
  if (!el) return;

  const justificativa = diaristas > 0
    ? `Demanda de ${pedDel} pedidos delivery exige ${motNec} motoboys. Os ${motFix} fixos não são suficientes — chamar ${diaristas} diarista${diaristas > 1 ? 's' : ''}.`
    : `Os ${motFix} motoboys fixos são suficientes para os ${pedDel} pedidos delivery previstos.`;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div style="background:var(--surface2);border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:var(--purple)">${pedDel}</div>
        <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;margin-top:3px">Pedidos delivery</div>
      </div>
      <div style="background:var(--green-light);border:1.5px solid var(--green);border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:var(--green)">${motFix}</div>
        <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;margin-top:3px">Fixos disponíveis</div>
      </div>
      <div style="background:${diaristas > 0 ? 'var(--yellow-light)' : 'var(--surface2)'};border:1.5px solid ${diaristas > 0 ? 'var(--yellow)' : 'var(--border)'};border-radius:var(--r10);padding:14px;text-align:center">
        <div style="font-size:1.8rem;font-weight:800;color:${diaristas > 0 ? '#92400e' : 'var(--muted)'}">${diaristas}</div>
        <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase;margin-top:3px">Diaristas</div>
      </div>
    </div>

    <!-- Total recomendado -->
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:13px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:.7rem;color:var(--muted)">Total recomendado</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--purple)">${motFinal} motoboy${motFinal > 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:.72rem;color:var(--muted)">Ajustar:</span>
        <input type="number" value="${motFinal}" min="0"
          style="width:52px;padding:4px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.88rem;font-weight:700;text-align:center"
          onchange="_ajustes.motoboys=+this.value;recalcularPrevisao()">
        ${_ajustes.motoboys !== null ? `<button onclick="_ajustes.motoboys=null;recalcularPrevisao()" style="font-size:.65rem;color:var(--purple);background:none;border:none;cursor:pointer">reset</button>` : ''}
      </div>
    </div>

    <div style="background:var(--surface2);border-radius:var(--r8);padding:9px 12px;font-size:.73rem;color:var(--text2)">
      ${lc('info',13,'var(--muted)')} ${justificativa}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// FATORES
// ══════════════════════════════════════════════════════════════
function toggleFatorPrev(fator) {
  _fatores[fator] = !_fatores[fator];
  const btn = document.getElementById('btn' + fator.charAt(0).toUpperCase() + fator.slice(1));
  if (btn) {
    btn.textContent    = _fatores[fator] ? 'Sim' : 'Não';
    btn.style.background    = _fatores[fator] ? 'var(--purple)' : 'var(--surface)';
    btn.style.borderColor   = _fatores[fator] ? 'var(--purple)' : 'var(--border)';
    btn.style.color         = _fatores[fator] ? '#fff' : 'var(--muted)';
  }
  recalcularPrevisao();
}

// ══════════════════════════════════════════════════════════════
// CONFIRMAR PLANEJAMENTO
// ══════════════════════════════════════════════════════════════
function confirmarPlanejamento() {
  if (!_resultado) { toast('Calcule a previsão primeiro', 'err'); return; }
  const r    = _resultado;
  const hoje = new Date();
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : { name: 'Sistema' };

  const reg = {
    id:           'prev_' + hoje.toISOString().slice(0,10),
    data:         hoje.toISOString().slice(0,10),
    diaSemana:    hoje.getDay(),
    criadoPor:    user?.name || 'Sistema',
    criadoEm:     hoje.toISOString(),
    historico:    { diasAnalisados: _getHistoricoDia(hoje.getDay()).length, mediaHistorica: Math.round(r.media), fonte: 'manual' },
    fatores:      { ..._fatores },
    coeficienteAplicado: r.coef,
    previsaoPedidos:  r.pedidos,
    previsaoPizzas:   { grSal: r.grSal, pqSal: r.pqSal, grDoc: r.grDoc, pqDoc: r.pqDoc, totGr: r.totGr, totPq: r.totPq, total: r.totPz },
    massas:           { grandesFinal: r.masGrFin, pequenasFinal: r.masPqFin, margemPct: cfgPrev.margemSeguranca },
    batidas:          r.batidas,
    motoboys:         { pedidosDelivery: r.pedDel, necessarios: r.motNec, fixos: r.motFix, diaristas: r.diaristas, total: r.motFinal },
    ajustesManualAplicados: Object.values(_ajustes).some(v => v !== null),
    confirmado:       true,
  };

  // Remove planejamento do mesmo dia se existir
  planejamentos = planejamentos.filter(p => p.data !== reg.data);
  planejamentos.push(reg);
  savePlanej();

  _mostrarPlanejSalvo(reg);
  toast('✅ Planejamento confirmado e salvo!');
}

function _mostrarPlanejSalvo(reg) {
  const r = reg;
  const waMsg = _montaMsgWA(r);
  const box = document.getElementById('planejSalvoBox');
  if (!box) return;
  box.innerHTML = `
    <div class="mh">
      <div class="mt">${lc('check-circle',16,'var(--green)')} Planejamento de ${new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</div>
      <button class="mc" onclick="closeModal('ovPlanejSalvo')">✕</button>
    </div>
    <div class="mb" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div style="background:var(--purple-xlight);border-radius:var(--r8);padding:12px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--purple)">${r.previsaoPedidos}</div>
          <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Pedidos</div>
        </div>
        <div style="background:var(--surface2);border-radius:var(--r8);padding:12px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800">${r.previsaoPizzas.totGr} + ${r.previsaoPizzas.totPq}</div>
          <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Gr + Pq pizzas</div>
        </div>
        <div style="background:${r.motoboys.diaristas > 0 ? 'var(--yellow-light)' : 'var(--green-light)'};border-radius:var(--r8);padding:12px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${r.motoboys.diaristas > 0 ? '#92400e' : 'var(--green)'}">${r.motoboys.total}</div>
          <div style="font-size:.62rem;color:var(--muted);text-transform:uppercase">Motoboys</div>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r8);padding:12px;font-size:.78rem;line-height:1.7">
        <strong>Batidas:</strong> ${r.batidas.length} batida${r.batidas.length > 1 ? 's' : ''} —
        ${r.batidas.map(b => `${b.horario} (${b.grBol}gr + ${b.pqBol}pq, ${b.fermG}g ferm)`).join(' · ')}
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--r8);padding:12px;background:var(--surface2)">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:8px">Mensagem WhatsApp</div>
        <pre style="font-size:.72rem;white-space:pre-wrap;font-family:monospace;margin:0;color:var(--text)">${waMsg}</pre>
      </div>
    </div>
    <div class="mf">
      <button class="btn btn-outline" onclick="closeModal('ovPlanejSalvo')">Fechar</button>
      <button class="btn btn-wa" onclick="navigator.clipboard.writeText(${JSON.stringify(waMsg)}).then(()=>toast('Copiado!'))">
        ${lc('copy',14,'#fff')} Copiar mensagem
      </button>
      <button class="btn btn-wa" onclick="window.open('https://wa.me/?text='+encodeURIComponent(${JSON.stringify(waMsg)}),'_blank')">
        ${lc('message-circle',14,'#fff')} Abrir WA
      </button>
    </div>`;
  document.getElementById('ovPlanejSalvo').classList.add('open');
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP
// ══════════════════════════════════════════════════════════════
function _montaMsgWA(r) {
  const data  = new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const fatoresLinha = [
    `Chuva: ${r.fatores.chuva   ? 'Sim' : 'Não'}`,
    `Feriado: ${r.fatores.feriado ? 'Sim' : 'Não'}`,
    `Evento: ${r.fatores.evento  ? 'Sim' : 'Não'}`,
    `Temperatura: ${r.fatores.temperatura}°C`,
  ].join('\n');
  const batidasLinha = r.batidas.map(b =>
    `  Batida ${b.num} — ${b.horario}: ${b.grBol} grandes + ${b.pqBol} pequenas | ${b.kgFar}kg farinha | ${b.fermG}g fermento`
  ).join('\n');

  return `🍕 PLANEJAMENTO DO DIA — ${data.toUpperCase()}

📊 Previsão de pedidos: ${r.previsaoPedidos}

🍕 Produção recomendada:
  Massas grandes: ${r.massas.grandesFinal}
  Massas pequenas: ${r.massas.pequenasFinal}
  Total: ${r.massas.grandesFinal + r.massas.pequenasFinal} massas

🍞 Batidas de massa:
  Total de batidas: ${r.batidas.length}
${batidasLinha}

🛵 Motoboys:
  Fixos: ${r.motoboys.fixos}
  Diaristas: ${r.motoboys.diaristas}
  Total escalado: ${r.motoboys.total}

⚡ Fatores considerados:
${fatoresLinha}
${r.fatores.obs ? `\n📝 Obs: ${r.fatores.obs}` : ''}

_Gerado pelo VTP Compras_`;
}

function enviarWATime() {
  if (!_resultado) { toast('Calcule a previsão primeiro', 'err'); return; }
  const hoje = new Date();
  const reg = {
    data: hoje.toISOString().slice(0,10),
    fatores: { ..._fatores },
    previsaoPedidos: _resultado.pedidos,
    massas: { grandesFinal: _resultado.masGrFin, pequenasFinal: _resultado.masPqFin },
    batidas: _resultado.batidas,
    motoboys: { fixos: _resultado.motFix, diaristas: _resultado.diaristas, total: _resultado.motFinal },
  };
  const msg = _montaMsgWA(reg);
  const wa  = cfgPrev.tokenCardapioWeb; // usa campo de WA
  if (cfgPrev.waGrupo) {
    window.open('https://wa.me/' + cfgPrev.waGrupo.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg), '_blank');
  } else {
    navigator.clipboard.writeText(msg).then(() => toast('📋 Mensagem copiada! Configure o WA do grupo nos parâmetros.', 'info'));
  }
}

// ══════════════════════════════════════════════════════════════
// HISTÓRICO E IMPORTAÇÃO
// ══════════════════════════════════════════════════════════════
function _getHistoricoDia(diaSem) {
  return historicoAPI
    .filter(h => new Date(h.data + 'T12:00:00').getDay() === diaSem)
    .sort((a,b) => b.data.localeCompare(a.data))
    .slice(0, Math.ceil(cfgPrev.diasHistorico / 7));
}

function abrirImportarPedidos() {
  const hoje = new Date().toISOString().slice(0,10);
  const popup = document.createElement('div');
  popup.id = 'popupImport';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center';
  popup.innerHTML = `
    <div style="background:white;border-radius:var(--r12);padding:22px;min-width:340px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:.9rem;font-weight:700;margin-bottom:14px">Adicionar registro de pedidos</div>
      <div class="field"><label>Data</label><input class="inp" type="date" id="impData" value="${hoje}"></div>
      <div class="field"><label>Total de pedidos nesse dia</label><input class="inp" type="number" id="impPedidos" placeholder="ex: 42" min="0"></div>
      <div class="field"><label>Observação (opcional)</label><input class="inp" id="impObs" placeholder="ex: Choveu, feriado, evento..."></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-outline" onclick="document.getElementById('popupImport').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_salvarRegistroPedidos()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function _salvarRegistroPedidos() {
  const data    = document.getElementById('impData')?.value;
  const pedidos = parseInt(document.getElementById('impPedidos')?.value);
  const obs     = document.getElementById('impObs')?.value.trim() || '';
  if (!data || isNaN(pedidos) || pedidos < 0) { toast('Preencha data e pedidos', 'err'); return; }
  historicoAPI = historicoAPI.filter(h => h.data !== data);
  historicoAPI.push({ data, pedidos, obs });
  saveHistorico();
  document.getElementById('popupImport')?.remove();
  toast('✅ Registro salvo!');
  renderPrevisao();
}

function importarDadosManual() { abrirImportarPedidos(); }

function abrirModalHistorico() {
  const diaSem = new Date().getDay();
  const hist   = _getHistoricoDia(diaSem);
  const box    = document.getElementById('historicoBox');
  if (!box) return;
  box.innerHTML = `
    <div class="mh">
      <div class="mt">${lc('activity',15,'var(--purple)')} Histórico de ${DIAS[diaSem]}s</div>
      <button class="mc" onclick="closeModal('ovHistorico')">✕</button>
    </div>
    <div class="mb">
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.78rem;color:var(--muted)">${hist.length} registros encontrados</span>
        <button onclick="abrirImportarPedidos()" class="btn btn-outline btn-sm">${lc('plus',13,'var(--purple)')} Adicionar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:380px;overflow-y:auto">
        ${hist.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--muted)">Nenhum dado ainda</div>`
          : hist.map(h => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r8)">
              <div>
                <div style="font-size:.8rem;font-weight:700">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'})}</div>
                ${h.obs ? `<div style="font-size:.68rem;color:var(--muted);font-style:italic">${h.obs}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="font-size:1.1rem;font-weight:800;color:var(--purple)">${h.pedidos} <span style="font-size:.68rem;font-weight:400;color:var(--muted)">pedidos</span></div>
                <button onclick="_removerHistorico('${h.data}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem">${lc('trash',14,'var(--muted)')}</button>
              </div>
            </div>`).join('')}
      </div>
    </div>
    <div class="mf"><button class="btn btn-outline" onclick="closeModal('ovHistorico')">Fechar</button></div>`;
  document.getElementById('ovHistorico').classList.add('open');
}

function _removerHistorico(data) {
  historicoAPI = historicoAPI.filter(h => h.data !== data);
  saveHistorico();
  abrirModalHistorico();
  recalcularPrevisao();
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
      <div class="mh"><div class="mt">${lc('settings',15,'var(--purple)')} Parâmetros de previsão</div><button class="mc" onclick="closeModal('ovCfgPrev2')">✕</button></div>
      <div class="mb" style="display:flex;flex-direction:column;gap:0">

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:4px 0 10px">🍕 Distribuição de pizzas por pedido</div>
        <div class="f2">
          <div class="field"><label>Grandes salgadas/pedido</label><input class="inp" type="number" id="cDistGrSal" value="${c.distGrSalgada}" step="0.01" min="0"><span style="font-size:.65rem;color:var(--muted)">padrão: 1.04</span></div>
          <div class="field"><label>Pequenas salgadas/pedido</label><input class="inp" type="number" id="cDistPqSal" value="${c.distPqSalgada}" step="0.01" min="0"><span style="font-size:.65rem;color:var(--muted)">padrão: 0.06</span></div>
        </div>
        <div class="f2">
          <div class="field"><label>Grandes doces/pedido</label><input class="inp" type="number" id="cDistGrDoc" value="${c.distGrDoce}" step="0.01" min="0"><span style="font-size:.65rem;color:var(--muted)">padrão: 0.07</span></div>
          <div class="field"><label>Pequenas doces/pedido</label><input class="inp" type="number" id="cDistPqDoc" value="${c.distPqDoce}" step="0.01" min="0"><span style="font-size:.65rem;color:var(--muted)">padrão: 0.34</span></div>
        </div>

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">🍞 Massas e batidas</div>
        <div class="f2">
          <div class="field"><label>Margem de segurança (%)</label><input class="inp" type="number" id="cMargem" value="${c.margemSeguranca}" min="0" max="50"></div>
          <div class="field"><label>Capacidade grandes/batida</label><input class="inp" type="number" id="cCapGr" value="${c.capGrandesBatida}" min="1"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Capacidade pequenas/batida</label><input class="inp" type="number" id="cCapPq" value="${c.capPequenasBatida}" min="1"></div>
          <div class="field"><label>Kg farinha por batida</label><input class="inp" type="number" id="cKgFar" value="${c.kgFarinhaBatida}" step="0.5" min="1"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Horário de pico (hora)</label><input class="inp" type="number" id="cHorPico" value="${c.horarioPico}" min="12" max="23"></div>
          <div class="field"><label>Tempo mínimo antes de usar (min)</label><input class="inp" type="number" id="cTempoMin" value="${c.tempoMinAntes}" min="0"></div>
        </div>

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">🧪 Fermento</div>
        <div class="f2">
          <div class="field"><label>Fermento base (g/kg de farinha)</label><input class="inp" type="number" id="cFermBase" value="${c.fermentoBasePorKg}" step="0.5" min="1"><span style="font-size:.65rem;color:var(--muted)">na temp. de referência</span></div>
          <div class="field"><label>Temperatura de referência (°C)</label><input class="inp" type="number" id="cTempRef" value="${c.tempReferencia}" min="10" max="40"></div>
        </div>

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">🛵 Motoboys</div>
        <div class="f2">
          <div class="field"><label>% pedidos delivery</label><input class="inp" type="number" id="cPctDel" value="${c.pctDelivery}" min="0" max="100"></div>
          <div class="field"><label>Entregas/motoboy/hora</label><input class="inp" type="number" id="cEntHora" value="${c.entregasPorHora}" min="1"></div>
        </div>
        <div class="f2">
          <div class="field"><label>Janela de pico (horas)</label><input class="inp" type="number" id="cJanela" value="${c.janelaPicoHoras}" min="1" max="6"></div>
          <div class="field"><label>Motoboys fixos</label><input class="inp" type="number" id="cMotFix" value="${c.motoristasFixos}" min="0"></div>
        </div>
        <div class="field">
          <label>Margem de segurança motoboys (%)</label>
          <input class="inp" type="number" id="cMargemMoto" value="${c.margemMoto}" min="0" max="50">
        </div>

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">💬 WhatsApp do time</div>
        <div class="field">
          <label>Número do grupo WA (com DDI)</label>
          <input class="inp" id="cWaGrupo" value="${c.waGrupo||''}" placeholder="5511999887766">
          <span style="font-size:.65rem;color:var(--muted)">ex: 5582999887766 · sem espaços</span>
        </div>

        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding:14px 0 10px">🔢 Histórico</div>
        <div class="field">
          <label>Dias de histórico a considerar</label>
          <input class="inp" type="number" id="cDiasHist" value="${c.diasHistorico}" min="7" max="365">
          <span style="font-size:.65rem;color:var(--muted)">ex: 90 = últimos 90 dias</span>
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
    distGrSalgada:      +document.getElementById('cDistGrSal').value  || 1.04,
    distPqSalgada:      +document.getElementById('cDistPqSal').value  || 0.06,
    distGrDoce:         +document.getElementById('cDistGrDoc').value  || 0.07,
    distPqDoce:         +document.getElementById('cDistPqDoc').value  || 0.34,
    margemSeguranca:    +document.getElementById('cMargem').value     || 10,
    capGrandesBatida:   +document.getElementById('cCapGr').value      || 30,
    capPequenasBatida:  +document.getElementById('cCapPq').value      || 60,
    kgFarinhaBatida:    +document.getElementById('cKgFar').value      || 10,
    horarioPico:        +document.getElementById('cHorPico').value    || 19,
    tempoMinAntes:      +document.getElementById('cTempoMin').value   || 60,
    fermentoBasePorKg:  +document.getElementById('cFermBase').value   || 10,
    tempReferencia:     +document.getElementById('cTempRef').value    || 22,
    pctDelivery:        +document.getElementById('cPctDel').value     || 65,
    entregasPorHora:    +document.getElementById('cEntHora').value    || 4,
    janelaPicoHoras:    +document.getElementById('cJanela').value     || 2,
    motoristasFixos:    +document.getElementById('cMotFix').value     || 2,
    margemMoto:         +document.getElementById('cMargemMoto').value || 10,
    waGrupo:            document.getElementById('cWaGrupo').value.trim(),
    diasHistorico:      +document.getElementById('cDiasHist').value   || 90,
  };
  saveCfgPrev();
  closeModal('ovCfgPrev2');
  toast('✅ Configurações salvas!');
  recalcularPrevisao();
}

function _resetCfgPrev() {
  if (!confirm('Restaurar todos os parâmetros para o padrão?')) return;
  cfgPrev = { ...CFG_PREV_DEFAULT };
  saveCfgPrev();
  closeModal('ovCfgPrev2');
  toast('Parâmetros restaurados!');
  renderPrevisao();
}

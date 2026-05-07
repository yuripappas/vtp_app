/**
 * VTP Compras — Vai Ter Pizza!
 * previsao.js — Módulo de Previsão de Demanda + Plano de Produção
 */

// ══════════════════════════════════════════════════════════════
// DADOS
// ══════════════════════════════════════════════════════════════
let historicoVendas = JSON.parse(localStorage.getItem('vtp_historico') || '[]');
let previsoesSalvas = JSON.parse(localStorage.getItem('vtp_previsoes') || '[]');
let configPrevisao  = JSON.parse(localStorage.getItem('vtp_cfg_prev')  || 'null') || {
  // Receita base
  farinhaKgPorBatida:     5,      // kg de farinha por batida padrão
  fermentoPorKgBase:      10,     // g de fermento fresco por kg de farinha (temp referência)
  tempReferencia:         22,     // °C de referência da receita
  // Bolas de massa
  gramsBolaPequena:       220,    // g de farinha por bola pequena
  gramsBalaGrande:        350,    // g de farinha por bola grande
  // Motoboys
  entregasPorMotoboy:     8,      // pedidos delivery por motoboy no turno
  pctDeliveryNormal:      60,     // % dos pedidos que são delivery em dia normal
  pctDeliveryComChuva:    80,     // % dos pedidos que são delivery com chuva
  // Fatores de ajuste
  coefFeriado:            1.35,
  coefEvento:             1.20,
  // WhatsApp do grupo
  waGrupo:                '',
};

const saveCfg       = () => localStorage.setItem('vtp_cfg_prev',  JSON.stringify(configPrevisao));
const saveHistorico = () => localStorage.setItem('vtp_historico', JSON.stringify(historicoVendas));
const savePrevisoes = () => localStorage.setItem('vtp_previsoes', JSON.stringify(previsoesSalvas));

const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// Coeficiente de fermento pela temperatura (relativo à temp de referência)
// Fermento fresco: +5°C ≈ dobra atividade → menos fermento necessário
// A fórmula: fator = 2^((tempRef - tempAtual) / 5)
function coefFermento(tempAtual) {
  const ref = configPrevisao.tempReferencia;
  return Math.pow(2, (ref - tempAtual) / 5);
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderPrevisao() {
  const hoje      = new Date();
  const diaSemana = hoje.getDay();
  const historico = historicoVendas.filter(h => new Date(h.data).getDay() === diaSemana)
                                   .sort((a,b) => b.data.localeCompare(a.data))
                                   .slice(0, 8);
  const media = _calcMediaHistorico(historico);

  document.getElementById('previsaoContent').innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">

      <!-- ═══ COLUNA ESQUERDA: Planejamento ═══ -->
      <div style="flex:1;min-width:300px;display:flex;flex-direction:column;gap:16px">

        <!-- Card: Dia -->
        <div style="background:linear-gradient(135deg,var(--purple),#9333EA);border-radius:var(--r12);padding:20px;color:#fff">
          <div style="font-size:.65rem;opacity:.75;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Planejamento de hoje</div>
          <div style="font-size:1.3rem;font-weight:800">${DIAS[diaSemana]}, ${hoje.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</div>
          <div style="font-size:.75rem;opacity:.8;margin-top:4px">
            ${historico.length > 0
              ? `Baseado nos últimos ${historico.length} ${DIAS[diaSemana]}s registrados`
              : 'Nenhum histórico ainda — registre as vendas para gerar previsões'}
          </div>
        </div>

        <!-- Card: Fatores do dia -->
        <div class="card">
          <div style="padding:14px 16px;border-bottom:1.5px solid var(--border)">
            <div style="font-size:.84rem;font-weight:700">⚡ Fatores do dia</div>
            <div style="font-size:.68rem;color:var(--muted)">Informe o que vai influenciar o movimento</div>
          </div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:14px">

            <!-- Temperatura da cozinha -->
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div>
                  <div style="font-size:.82rem;font-weight:600">🌡️ Temperatura da cozinha</div>
                  <div style="font-size:.67rem;color:var(--muted)">Afeta o cálculo do fermento</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <input type="number" id="fatorTemp" value="28" min="15" max="45"
                    style="width:60px;padding:5px 8px;border:1.5px solid var(--purple);border-radius:var(--r6);font-size:.88rem;font-weight:700;text-align:center;font-family:monospace;color:var(--purple)"
                    oninput="recalcular()">
                  <span style="font-size:.8rem;color:var(--muted)">°C</span>
                </div>
              </div>
              <div id="tempIndicador" style="font-size:.7rem;color:var(--muted);padding:5px 8px;background:var(--surface2);border-radius:var(--r6)"></div>
            </div>

            <!-- Chuva -->
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:.82rem;font-weight:600">🌧️ Vai chover hoje?</div>
                <div style="font-size:.67rem;color:var(--muted)">Chuva aumenta delivery (~+${Math.round((configPrevisao.pctDeliveryComChuva - configPrevisao.pctDeliveryNormal))}% mais entregas)</div>
              </div>
              <button id="btnChuva" onclick="toggleFator('chuva')"
                style="padding:6px 16px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s">
                Não
              </button>
            </div>

            <!-- Feriado -->
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:.82rem;font-weight:600">🎉 Feriado / data especial?</div>
                <div style="font-size:.67rem;color:var(--muted)">Aumenta o movimento (~+${Math.round((configPrevisao.coefFeriado-1)*100)}%)</div>
              </div>
              <button id="btnFeriado" onclick="toggleFator('feriado')"
                style="padding:6px 16px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s">
                Não
              </button>
            </div>

            <!-- Evento -->
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-size:.82rem;font-weight:600">🏟️ Evento próximo?</div>
                <div style="font-size:.67rem;color:var(--muted)">Show, jogo, evento local (~+${Math.round((configPrevisao.coefEvento-1)*100)}%)</div>
              </div>
              <button id="btnEvento" onclick="toggleFator('evento')"
                style="padding:6px 16px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s">
                Não
              </button>
            </div>

            <!-- Obs -->
            <div>
              <label style="font-size:.75rem;font-weight:600;color:var(--text2);display:block;margin-bottom:4px">📝 Observação</label>
              <input class="inp" id="fatorObs" placeholder="ex: Copa do Mundo, calor extremo, show sertanejo..."
                style="font-size:.77rem;padding:7px 10px">
            </div>
          </div>
        </div>

        <!-- Card: Resultado -->
        <div id="cardResultado">
          ${historico.length === 0
            ? `<div class="card" style="padding:32px;text-align:center">
                <div style="font-size:2.5rem;margin-bottom:12px">📊</div>
                <div style="font-size:.88rem;font-weight:700;margin-bottom:6px">Sem histórico ainda</div>
                <div style="font-size:.74rem;color:var(--muted)">Registre as vendas no painel ao lado para gerar previsões automáticas</div>
               </div>`
            : '<div id="resultadoInner"></div>'}
        </div>

        <!-- Ações -->
        <div id="acoesPrevisao" style="display:${historico.length>0?'flex':'none'};gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="salvarPrevisaoHoje()" style="flex:1;padding:12px;font-size:.84rem">
            💾 Salvar previsão
          </button>
          <button class="btn btn-wa" onclick="enviarWATime()" style="flex:1;padding:12px;font-size:.84rem">
            💬 Enviar para o time
          </button>
        </div>

      </div>

      <!-- ═══ COLUNA DIREITA: Histórico + Registro ═══ -->
      <div style="width:320px;flex-shrink:0;display:flex;flex-direction:column;gap:16px">

        <!-- Registrar vendas de hoje -->
        <div class="card">
          <div style="padding:14px 16px;border-bottom:1.5px solid var(--border)">
            <div style="font-size:.84rem;font-weight:700">📥 Registrar vendas de hoje</div>
            <div style="font-size:.68rem;color:var(--muted)">${DIAS[diaSemana]}, ${hoje.toLocaleDateString('pt-BR')} · Para calibrar previsões futuras</div>
          </div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="f2">
              <div class="field">
                <label>🍕 Pizzas pequenas</label>
                <input class="inp" type="number" id="regPequena" placeholder="0" min="0">
              </div>
              <div class="field">
                <label>🍕 Pizzas grandes</label>
                <input class="inp" type="number" id="regGrande" placeholder="0" min="0">
              </div>
            </div>
            <div class="f2">
              <div class="field">
                <label>🛵 Pedidos delivery</label>
                <input class="inp" type="number" id="regDelivery" placeholder="0" min="0">
              </div>
              <div class="field">
                <label>🏠 Pedidos balcão</label>
                <input class="inp" type="number" id="regBalcao" placeholder="0" min="0">
              </div>
            </div>
            <div class="field">
              <label>🌡️ Temperatura média do dia</label>
              <input class="inp" type="number" id="regTemp" placeholder="28" min="10" max="45">
            </div>
            <div class="field">
              <label>📝 Obs (chuva, feriado, evento...)</label>
              <input class="inp" id="regObs" placeholder="ex: Choveu à tarde, feriado...">
            </div>
            <button class="btn btn-primary" onclick="registrarVendas()" style="width:100%">
              ✅ Registrar
            </button>
          </div>
        </div>

        <!-- Histórico recente -->
        <div class="card">
          <div style="padding:14px 16px;border-bottom:1.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:.84rem;font-weight:700">📈 Histórico — ${DIAS[diaSemana]}s</div>
            <span style="font-size:.68rem;color:var(--muted)">${historico.length} registros</span>
          </div>
          <div style="padding:8px 0;max-height:320px;overflow-y:auto">
            ${historico.length === 0
              ? `<div style="padding:20px;text-align:center;font-size:.78rem;color:var(--muted)">Nenhum registro ainda</div>`
              : historico.map(h => `
                <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
                  <div style="flex:1">
                    <div style="font-size:.78rem;font-weight:600">${new Date(h.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
                    <div style="font-size:.67rem;color:var(--muted)">${h.pequena}pq · ${h.grande}gr · ${h.delivery}🛵 · ${h.temp||'—'}°C</div>
                    ${h.obs?`<div style="font-size:.63rem;color:var(--muted);font-style:italic">${h.obs}</div>`:''}
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:.88rem;font-weight:800;color:var(--purple)">${h.pequena+h.grande}</div>
                    <div style="font-size:.6rem;color:var(--muted)">pizzas</div>
                  </div>
                  <button onclick="removerHistorico('${h.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.75rem;padding:2px 5px">✕</button>
                </div>`).join('')}
          </div>
        </div>

        <!-- Link para configurações -->
        <button class="btn btn-outline btn-sm" onclick="abrirCfgPrevisao()" style="width:100%">
          ⚙️ Configurar receita e parâmetros
        </button>

      </div>
    </div>`;

  // Atualiza estado dos botões toggle
  _fatores = { chuva: false, feriado: false, evento: false };

  if (historico.length > 0) recalcular();
  _atualizarTempIndicador();
}

// ══════════════════════════════════════════════════════════════
// FATORES
// ══════════════════════════════════════════════════════════════
let _fatores = { chuva: false, feriado: false, evento: false };

function toggleFator(fator) {
  _fatores[fator] = !_fatores[fator];
  const btn   = document.getElementById('btn' + fator.charAt(0).toUpperCase() + fator.slice(1));
  const ativo = _fatores[fator];
  if (btn) {
    btn.textContent   = ativo ? 'Sim' : 'Não';
    btn.style.background   = ativo ? 'var(--purple)' : 'var(--surface)';
    btn.style.borderColor  = ativo ? 'var(--purple)' : 'var(--border)';
    btn.style.color        = ativo ? '#fff'           : 'var(--muted)';
  }
  recalcular();
}

function _atualizarTempIndicador() {
  const el   = document.getElementById('tempIndicador');
  const temp = parseFloat(document.getElementById('fatorTemp')?.value) || 28;
  if (!el) return;
  const coef  = coefFermento(temp);
  const base  = configPrevisao.fermentoPorKgBase;
  const ajust = +(base * coef).toFixed(1);
  const diff  = ajust - base;
  const sinal = diff > 0 ? '+' : '';
  el.innerHTML = `Receita base: <strong>${base}g/kg</strong> → Hoje a ${temp}°C: <strong style="color:var(--purple)">${ajust}g/kg</strong> <span style="color:var(--muted)">(${sinal}${diff.toFixed(1)}g/kg ${temp > configPrevisao.tempReferencia ? '— mais quente, menos fermento' : '— mais frio, mais fermento'})</span>`;
}

// ══════════════════════════════════════════════════════════════
// CÁLCULO PRINCIPAL
// ══════════════════════════════════════════════════════════════
function recalcular() {
  _atualizarTempIndicador();

  const diaSemana = new Date().getDay();
  const historico = historicoVendas.filter(h => new Date(h.data).getDay() === diaSemana)
                                   .sort((a,b) => b.data.localeCompare(a.data))
                                   .slice(0, 8);
  if (!historico.length) return;

  const media = _calcMediaHistorico(historico);
  const temp  = parseFloat(document.getElementById('fatorTemp')?.value) || 28;

  // Aplica fatores
  let coef = 1;
  if (_fatores.feriado) coef *= configPrevisao.coefFeriado;
  if (_fatores.evento)  coef *= configPrevisao.coefEvento;
  // Chuva não muda total de pizzas, muda split delivery/balcão

  const prevPequena = Math.ceil(media.pequena * coef);
  const prevGrande  = Math.ceil(media.grande  * coef);
  const prevTotal   = prevPequena + prevGrande;

  // Motoboys
  const pctDelivery = _fatores.chuva ? configPrevisao.pctDeliveryComChuva : configPrevisao.pctDeliveryNormal;
  const prevDelivery = Math.round(prevTotal * pctDelivery / 100);
  const motoboys    = Math.ceil(prevDelivery / configPrevisao.entregasPorMotoboy);

  // Massas e batidas
  const gramasPequena = configPrevisao.gramsBolaPequena;
  const gramasGrande  = configPrevisao.gramsBalaGrande;
  const totalFarinha  = (prevPequena * gramasPequena + prevGrande * gramasGrande) / 1000; // kg
  const kgPorBatida   = configPrevisao.farinhaKgPorBatida;
  const numBatidas    = Math.ceil(totalFarinha / kgPorBatida);
  const kgUltimaBatida = totalFarinha - (numBatidas - 1) * kgPorBatida;

  // Fermento por batida
  const coefFerm = coefFermento(temp);
  const gFermPorKgAjust = +(configPrevisao.fermentoPorKgBase * coefFerm).toFixed(1);

  // Batidas com horários (pico = 19h, cada batida 1h antes da anterior)
  const horasPico = 19;
  const batidas   = Array.from({length: numBatidas}, (_, i) => {
    const kg        = i === numBatidas - 1 ? +kgUltimaBatida.toFixed(2) : kgPorBatida;
    const gFerm     = +(kg * gFermPorKgAjust).toFixed(0);
    const horario   = horasPico - numBatidas + i; // escalonadas
    const bolasP    = i < numBatidas - 1
      ? Math.floor(prevPequena / numBatidas)
      : prevPequena - Math.floor(prevPequena / numBatidas) * (numBatidas - 1);
    const bolasG    = i < numBatidas - 1
      ? Math.floor(prevGrande / numBatidas)
      : prevGrande - Math.floor(prevGrande / numBatidas) * (numBatidas - 1);
    return { num: i+1, kg, gFerm, horario, bolasP, bolasG };
  });

  // Renderiza resultado
  document.getElementById('cardResultado').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px" id="resultadoInner">

      <!-- KPIs de previsão -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:14px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:var(--purple);line-height:1">${prevPequena}</div>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px">Pizzas pq.</div>
        </div>
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r10);padding:14px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:var(--purple);line-height:1">${prevGrande}</div>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px">Pizzas gr.</div>
        </div>
        <div style="background:${motoboys>2?'var(--red-light)':'var(--green-light)'};border:1.5px solid ${motoboys>2?'var(--red)':'var(--green)'};border-radius:var(--r10);padding:14px;text-align:center">
          <div style="font-size:2rem;font-weight:800;color:${motoboys>2?'var(--red)':'var(--green)'};line-height:1">${motoboys}</div>
          <div style="font-size:.65rem;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px">Motoboys</div>
        </div>
      </div>

      <!-- Info delivery -->
      <div style="background:var(--surface2);border-radius:var(--r8);padding:10px 12px;font-size:.73rem;color:var(--text2);display:flex;justify-content:space-between">
        <span>🛵 Delivery: ~${prevDelivery} pedidos (${pctDelivery}%${_fatores.chuva?' — chuva':' — sem chuva'})</span>
        <span style="color:var(--muted)">${prevTotal} pizzas total</span>
      </div>

      <!-- Plano de batidas -->
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
        <div style="padding:12px 14px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:.8rem;font-weight:700">🍞 Plano de batidas de massa</div>
          <div style="font-size:.7rem;color:var(--muted)">${numBatidas} batida${numBatidas>1?'s':''} · ${totalFarinha.toFixed(1)}kg de farinha total</div>
        </div>
        ${batidas.map(b => `
          <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--purple);color:#fff;font-size:.75rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${b.num}</div>
            <div style="flex:1;min-width:120px">
              <div style="font-size:.8rem;font-weight:700">${b.bolasP} pequenas + ${b.bolasG} grandes</div>
              <div style="font-size:.68rem;color:var(--muted)">${b.kg}kg de farinha</div>
            </div>
            <div style="text-align:center;padding:6px 12px;background:var(--yellow-light);border-radius:var(--r8)">
              <div style="font-size:.65rem;color:var(--muted)">Fermento</div>
              <div style="font-size:.92rem;font-weight:800;color:#92400e">${b.gFerm}g</div>
            </div>
            <div style="text-align:center;padding:6px 12px;background:var(--surface2);border-radius:var(--r8)">
              <div style="font-size:.65rem;color:var(--muted)">Fazer às</div>
              <div style="font-size:.92rem;font-weight:800;color:var(--text)">${b.horario}h</div>
            </div>
          </div>`).join('')}
        <div style="padding:10px 14px;background:var(--purple-xlight);font-size:.72rem;color:var(--purple)">
          🌡️ ${temp}°C na cozinha → ${gFermPorKgAjust}g fermento/kg
          ${temp > configPrevisao.tempReferencia
            ? ' (mais quente — fermento reduzido para não crescer rápido demais)'
            : ' (mais frio — fermento aumentado para garantir crescimento)'}
        </div>
      </div>

      ${coef !== 1 ? `
        <div style="background:var(--yellow-light);border:1.5px solid var(--yellow);border-radius:var(--r8);padding:10px 12px;font-size:.73rem;color:#92400e">
          ⚡ Ajuste aplicado: ×${coef.toFixed(2)} (${[_fatores.feriado?'Feriado':'',_fatores.evento?'Evento':''].filter(Boolean).join(', ')})
        </div>` : ''}

    </div>`;

  // Salva estado para envio WA
  window._previsaoAtual = { prevPequena, prevGrande, prevTotal, prevDelivery, motoboys, batidas, temp, gFermPorKgAjust, numBatidas, totalFarinha };
}

function _calcMediaHistorico(historico) {
  if (!historico.length) return { pequena: 0, grande: 0, delivery: 0 };
  return {
    pequena:  Math.round(historico.reduce((s,h) => s + (h.pequena||0), 0) / historico.length),
    grande:   Math.round(historico.reduce((s,h) => s + (h.grande||0),  0) / historico.length),
    delivery: Math.round(historico.reduce((s,h) => s + (h.delivery||0),0) / historico.length),
  };
}

// ══════════════════════════════════════════════════════════════
// REGISTRO DE VENDAS
// ══════════════════════════════════════════════════════════════
function registrarVendas() {
  const pequena  = parseInt(document.getElementById('regPequena')?.value)  || 0;
  const grande   = parseInt(document.getElementById('regGrande')?.value)   || 0;
  const delivery = parseInt(document.getElementById('regDelivery')?.value) || 0;
  const balcao   = parseInt(document.getElementById('regBalcao')?.value)   || 0;
  const temp     = parseFloat(document.getElementById('regTemp')?.value)   || null;
  const obs      = document.getElementById('regObs')?.value.trim() || '';

  if (!pequena && !grande) { toast('Informe ao menos a quantidade de pizzas', 'err'); return; }

  const hoje = new Date().toISOString().slice(0, 10);
  // Remove registro do mesmo dia se existir
  historicoVendas = historicoVendas.filter(h => h.data !== hoje);
  historicoVendas.push({
    id:       hoje + '_' + Date.now(),
    data:     hoje,
    pequena, grande, delivery, balcao, temp, obs,
  });
  saveHistorico();
  toast('✅ Vendas registradas!');
  renderPrevisao();
}

function removerHistorico(id) {
  historicoVendas = historicoVendas.filter(h => h.id !== id);
  saveHistorico();
  renderPrevisao();
}

// ══════════════════════════════════════════════════════════════
// SALVAR PREVISÃO + ENVIO WHATSAPP
// ══════════════════════════════════════════════════════════════
function salvarPrevisaoHoje() {
  if (!window._previsaoAtual) { toast('Calcule a previsão primeiro', 'err'); return; }
  const p = window._previsaoAtual;
  const hoje = new Date().toISOString().slice(0, 10);
  previsoesSalvas = previsoesSalvas.filter(x => x.data !== hoje);
  previsoesSalvas.push({ data: hoje, ...p, fatores: { ..._fatores }, obs: document.getElementById('fatorObs')?.value || '' });
  savePrevisoes();
  toast('✅ Previsão salva!');
}

function enviarWATime() {
  if (!window._previsaoAtual) { toast('Calcule a previsão primeiro', 'err'); return; }
  const p    = window._previsaoAtual;
  const hoje = new Date();
  const obs  = document.getElementById('fatorObs')?.value || '';
  const fatoresAtivos = [
    _fatores.chuva    ? '🌧️ Chuva (mais delivery)' : '',
    _fatores.feriado  ? '🎉 Feriado/data especial' : '',
    _fatores.evento   ? '🏟️ Evento próximo'        : '',
  ].filter(Boolean).join('\n');

  const batidasTexto = p.batidas.map(b =>
    `• Batida ${b.num} — ${b.horario}h: ${b.bolasP}pq + ${b.bolasG}gr | ${b.kg}kg farinha | *${b.gFerm}g fermento*`
  ).join('\n');

  const msg = `🍕 *PLANO DE PRODUÇÃO — ${DIAS[hoje.getDay()].toUpperCase()}, ${hoje.toLocaleDateString('pt-BR')}*

📊 *Previsão de vendas:*
• Pizzas pequenas: *${p.prevPequena}*
• Pizzas grandes: *${p.prevGrande}*
• Total: *${p.prevTotal} pizzas*
• Delivery: ~${p.prevDelivery} pedidos

🛵 *Motoboys necessários: ${p.motoboys}*

🍞 *Batidas de massa (${p.numBatidas} batida${p.numBatidas>1?'s':''} · ${p.totalFarinha.toFixed(1)}kg total):*
${batidasTexto}

🌡️ Temp. cozinha: ${p.temp}°C → fermento ajustado para *${p.gFermPorKgAjust}g/kg*
${fatoresAtivos ? '\n⚡ *Fatores:*\n' + fatoresAtivos : ''}
${obs ? '\n📝 ' + obs : ''}

_Gerado pelo VTP Compras_`;

  const wa = configPrevisao.waGrupo;
  if (wa) {
    window.open('https://wa.me/' + wa.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg), '_blank');
  } else {
    navigator.clipboard.writeText(msg).then(() => toast('📋 Mensagem copiada! Configure o WA do grupo nas configurações.', 'info'));
  }
}

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ══════════════════════════════════════════════════════════════
function abrirCfgPrevisao() {
  const c = configPrevisao;
  document.getElementById('ovCfgPrevisao').classList.add('open');
  document.getElementById('cfgFarinhaKg').value    = c.farinhaKgPorBatida;
  document.getElementById('cfgFermentoPorKg').value= c.fermentoPorKgBase;
  document.getElementById('cfgTempRef').value       = c.tempReferencia;
  document.getElementById('cfgGramasPequena').value = c.gramsBolaPequena;
  document.getElementById('cfgGramasGrande').value  = c.gramsBalaGrande;
  document.getElementById('cfgEntregasMoto').value  = c.entregasPorMotoboy;
  document.getElementById('cfgPctDelivery').value   = c.pctDeliveryNormal;
  document.getElementById('cfgPctChuva').value      = c.pctDeliveryComChuva;
  document.getElementById('cfgCoefFeriado').value   = c.coefFeriado;
  document.getElementById('cfgCoefEvento').value    = c.coefEvento;
  document.getElementById('cfgWaGrupo').value       = c.waGrupo || '';
}

function salvarCfgPrevisao() {
  configPrevisao = {
    farinhaKgPorBatida:   parseFloat(document.getElementById('cfgFarinhaKg').value)     || 5,
    fermentoPorKgBase:    parseFloat(document.getElementById('cfgFermentoPorKg').value) || 10,
    tempReferencia:       parseFloat(document.getElementById('cfgTempRef').value)        || 22,
    gramsBolaPequena:     parseFloat(document.getElementById('cfgGramasPequena').value)  || 220,
    gramsBalaGrande:      parseFloat(document.getElementById('cfgGramasGrande').value)   || 350,
    entregasPorMotoboy:   parseFloat(document.getElementById('cfgEntregasMoto').value)   || 8,
    pctDeliveryNormal:    parseFloat(document.getElementById('cfgPctDelivery').value)    || 60,
    pctDeliveryComChuva:  parseFloat(document.getElementById('cfgPctChuva').value)       || 80,
    coefFeriado:          parseFloat(document.getElementById('cfgCoefFeriado').value)    || 1.35,
    coefEvento:           parseFloat(document.getElementById('cfgCoefEvento').value)     || 1.20,
    waGrupo:              document.getElementById('cfgWaGrupo').value.trim(),
  };
  saveCfg();
  closeModal('ovCfgPrevisao');
  toast('✅ Configurações salvas!');
  recalcular();
}

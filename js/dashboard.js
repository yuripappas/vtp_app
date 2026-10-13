let _perfInterval = null;
let _perfCountdown = 60;

// ── Entrada ──────────────────────────────────────────────────────────────────

function renderDashboard() {
  const now  = new Date();
  const h    = now.getHours();
  const cfg  = db._get('vtp_config', {});
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const nome = user?.name || cfg.responsavel || 'Gestor';

  const lojaAberta = h >= 17 && h <= 23;
  const dotCor     = lojaAberta ? 'var(--success-fg)' : 'var(--danger-fg)';

  const el = document.getElementById('page-dashboard');
  el.innerHTML = `
    <div style="padding:14px ${isMobile()?'16px':'24px'} 12px;border-bottom:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:1rem;font-weight:700;color:var(--text)">
          ${h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}, ${nome}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px;text-transform:capitalize">
          ${now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);font-weight:700;color:var(--purple);background:var(--surface2);border-radius:var(--r8);padding:7px 14px">
        ${lc('activity',12,'currentColor')} Performance
        <span title="${lojaAberta ? 'Loja aberta' : 'Loja fechada'}" style="width:7px;height:7px;border-radius:50%;background:${dotCor};display:inline-block;flex-shrink:0;box-shadow:0 0 0 2px ${dotCor}33"></span>
      </div>
    </div>
    <div id="dashContent" style="overflow-y:auto;overflow-x:hidden;padding:${isMobile()?'16px 16px 32px':'20px 24px 40px'};height:calc(100vh - 110px)"></div>
  `;

  _updateSidebarBadges();
  if (_perfInterval) { clearInterval(_perfInterval); _perfInterval = null; }
  _renderDashPerf();
}

// ── MODO PERFORMANCE ─────────────────────────────────────────────────────────
// Pedidos reais vêm da API do Cardápio Web (ver js/cw-api.js → _getPedidosCW()).

let _perfLoading = false;
let _perfError    = null;
let _perfPedidos  = [];

// Filtro de período: mesmo componente compartilhado (_per*, js/vendas-ui.js)
// usado em todo o módulo Vendas (Hoje/Ontem/.../meses + calendário duplo) —
// namespace 'perf' próprio, não interfere no período das outras páginas.
function _dashRefreshPerf() { _perfCountdown = 60; _renderDashPerf(); }

// Clientes novos x recorrentes no período: "recorrente" é quem já tem pedido
// registrado ANTES do início do período (por customer_id, ou telefone quando
// o pedido não tem customer_id). Pedido sem customer_id NEM telefone conta
// sempre como "novo" — decisão do Yuri: sem dado nenhum não dá pra confirmar
// que já é da base cadastrada, e a pergunta que esse card responde é
// justamente "estou vendendo pra minha base cadastrada?" (2026-09-05).
async function _dashClientesNovosRecorrentes(pedidos, range) {
  const idsUnicos   = [...new Set(pedidos.filter(p => p.customerId).map(p => p.customerId))];
  const fonesUnicos = [...new Set(pedidos.filter(p => !p.customerId && p.customerPhone).map(p => p.customerPhone))];

  const sb = _cwGetSbClient();
  const idsRecorrentes = new Set();
  const fonesRecorrentes = new Set();

  if (idsUnicos.length) {
    const { data } = await sb.from('cw_pedidos').select('customer_id')
      .lt('cw_created_at', range.inicioISO).in('customer_id', idsUnicos);
    (data || []).forEach(r => idsRecorrentes.add(r.customer_id));
  }
  if (fonesUnicos.length) {
    const { data } = await sb.from('cw_pedidos').select('customer_phone')
      .lt('cw_created_at', range.inicioISO).in('customer_phone', fonesUnicos);
    (data || []).forEach(r => fonesRecorrentes.add(r.customer_phone));
  }

  const porCliente = {};
  for (const p of pedidos) {
    const chave = p.customerId ? 'id:' + p.customerId
                : p.customerPhone ? 'tel:' + p.customerPhone
                : 'anon:' + p.id;
    const recorrente = p.customerId ? idsRecorrentes.has(p.customerId)
                      : p.customerPhone ? fonesRecorrentes.has(p.customerPhone)
                      : false;
    if (!porCliente[chave]) porCliente[chave] = { recorrente, receita: 0 };
    porCliente[chave].receita += p.valor;
  }

  const todos = Object.values(porCliente);
  const novos = todos.filter(c => !c.recorrente);
  const recorrentes = todos.filter(c => c.recorrente);
  return {
    total: todos.length,
    novos:       { qtd: novos.length,       receita: novos.reduce((s, c) => s + c.receita, 0) },
    recorrentes: { qtd: recorrentes.length, receita: recorrentes.reduce((s, c) => s + c.receita, 0) },
  };
}

function _dashPedAtrasado(p) {
  if (p.status === 'em_preparo' && p.mAtrs > 25) return { msg: `Preparo há ${p.mAtrs}min — meta 20min` };
  if (p.status === 'pronto'     && p.mAtrs > 35) return { msg: `Pronto há ${p.mAtrs}min — aguardando coleta` };
  if (p.status === 'em_rota'   && p.mAtrs > 55) return { msg: `Saiu há ${p.mAtrs}min — entrega estimada 35min` };
  return null;
}

async function _renderDashPerf() {
  const el = document.getElementById('dashContent');
  if (!el) return;

  if (!_perfPedidos.length && !_perfLoading) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        ${lc('refresh-cw',24,'currentColor')}
        <div style="margin-top:10px;font-size:var(--text-sm)">Carregando pedidos…</div>
      </div>`;
  }

  _perfLoading = true;
  const range = _perRange('perf');
  let custoTotal = 0;
  let clientesInfo = { total: 0, novos: { qtd: 0, receita: 0 }, recorrentes: { qtd: 0, receita: 0 } };
  try {
    _perfPedidos = await _getPedidosCW(new Date(range.inicioISO), new Date(range.fimISO));
    _perfError = null;
  } catch (e) {
    _perfError = e;
  }
  if (!_perfError) {
    // CMV e Clientes são cálculos extras — se falharem, não derruba a página
    // inteira, só o card correspondente mostra "—".
    try {
      const linhasCMV = await vendasCarregarPeriodo(range.inicioISO, range.fimISO);
      const cat = vendasPorCategoria(linhasCMV);
      custoTotal = Object.values(cat).reduce((s, c) => s + c.custo, 0);
    } catch (e) { console.warn('[dashboard] falha ao calcular CMV:', e?.message); }
    try {
      clientesInfo = await _dashClientesNovosRecorrentes(_perfPedidos, range);
    } catch (e) { console.warn('[dashboard] falha ao calcular clientes novos/recorrentes:', e?.message); }
  }
  _perfLoading = false;

  if (_perfError) {
    const msg = _perfError.code === 'SUPABASE_ERROR'
      ? `Erro ao consultar o banco: ${_perfError.message}`
      : 'Não foi possível carregar os pedidos.';
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        ${lc('alert-triangle',28,'var(--red)')}
        <div style="font-size:var(--text-md);font-weight:700;margin-top:14px;color:var(--red)">Erro ao carregar pedidos</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:6px">${msg}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:16px" onclick="_dashRefreshPerf()">${lc('refresh-cw',12,'currentColor')} Tentar novamente</button>
      </div>`;
    if (_perfInterval) clearInterval(_perfInterval);
    _perfInterval = setInterval(() => {
      _perfCountdown--;
      if (_perfCountdown <= 0) { _perfCountdown = 60; _renderDashPerf(); }
    }, 1000);
    return;
  }

  const pedidos = _perfPedidos;
  const now     = new Date();

  const total     = pedidos.length;
  const fat       = pedidos.reduce((s,p) => s+p.valor, 0);
  const ticket    = total ? fat/total : 0;
  const pizzasGrande  = pedidos.reduce((s,p) => s+(p.pizzasGrande||0), 0);
  const pizzasPequena = pedidos.reduce((s,p) => s+(p.pizzasPequena||0), 0);
  const pizzas        = pizzasGrande + pizzasPequena;
  const fmtPz = n => (n % 1 === 0) ? String(n) : fmt(n);

  const statusCount = {
    aguardando: pedidos.filter(p=>p.status==='aguardando').length,
    em_preparo: pedidos.filter(p=>p.status==='em_preparo').length,
    pronto:     pedidos.filter(p=>p.status==='pronto').length,
    em_rota:    pedidos.filter(p=>p.status==='em_rota').length,
    entregue:   pedidos.filter(p=>p.status==='entregue').length,
  };

  const canaisData = [...new Set(pedidos.map(p=>p.canal))].map(c => {
    const n   = pedidos.filter(p=>p.canal===c).length;
    const fat = pedidos.filter(p=>p.canal===c).reduce((s,p)=>s+p.valor,0);
    return { c, n, fat, ticket: n ? fat/n : 0 };
  }).sort((a,b)=>b.n-a.n);

  const _media = (arr, key) => {
    const vals = arr.map(p=>p[key]).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length) : null;
  };
  const tmPreparo  = _media(pedidos, 'tempoPreparo');
  const tmEntrega  = _media(pedidos, 'tempoEntrega');

  const CANAL_LABEL = { ifood:'iFood', '99food':'99Food', site:'Site' };
  const CANAL_COR   = { ifood:'var(--red)', '99food':'#F97316', site:'var(--purple)' };
  const canalLabel  = c => CANAL_LABEL[c] || (c.charAt(0).toUpperCase()+c.slice(1));
  const canalCor    = c => CANAL_COR[c] || 'var(--muted)';
  const STATUS_INFO = {
    aguardando: { l:'Aguardando', c:'var(--purple)', bg:'var(--surface)',     ic:'clock',         badgeC:'var(--warning-fg)', badgeBg:'var(--yellow-light)' },
    em_preparo: { l:'Em preparo', c:'var(--purple)', bg:'var(--surface)',     ic:'chef-hat',      badgeC:'var(--orange-dark)', badgeBg:'var(--orange-light)' },
    pronto:     { l:'Pronto',     c:'var(--purple)', bg:'var(--surface)',     ic:'check-circle',  badgeC:'var(--purple)', badgeBg:'var(--purple-xlight)' },
    em_rota:    { l:'Em rota',    c:'var(--purple)', bg:'var(--surface)',     ic:'truck',         badgeC:'var(--purple)', badgeBg:'var(--purple-xlight)' },
    entregue:   { l:'Entregues',  c:'var(--green)',  bg:'var(--green-light)', ic:'check-circle',  badgeC:'var(--green)', badgeBg:'var(--green-light)' },
  };

  // Horário de pico: maior pct na curva fixa de distribuição (ver previsao.js)
  const picoH    = _CURVA_HORARIA.reduce((p,c) => c.pct > p.pct ? c : p).h;
  // Total previsto do dia (vem da Previsão, quando calculada) — usado só na coluna "Estimativa"
  const totalDia = _resultado?.pedDel || 0;

  // Status bar + filtro de período (componente compartilhado _per*)
  const statusBarHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      ${_perRenderBar('perf', '_renderDashPerf')}
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>
          atualiza em <strong id="perfCdwn" style="color:var(--text)">${_perfCountdown}s</strong>
        </span>
        <button class="btn btn-ghost btn-xs" onclick="_dashRefreshPerf()" style="padding:3px 8px">${lc('refresh-cw',10,'currentColor')} Agora</button>
      </div>
    </div>`;

  // KPIs
  const cmvPct = fat > 0 ? custoTotal / fat * 100 : 0;
  const corCmv = fat <= 0 ? 'var(--muted)' : cmvPct > 30 ? 'var(--red)' : 'var(--green)';
  const pctRecorrente = clientesInfo.total > 0 ? clientesInfo.recorrentes.qtd / clientesInfo.total * 100 : 0;

  const kpiHtml = `
    <div style="display:grid;grid-template-columns:repeat(${isMobile()?2:3},1fr);gap:10px;margin-bottom:14px">
      <div style="background:var(--brand-purple);border-radius:var(--r14);padding:16px 18px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-10px;top:-10px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.08)"></div>
        <div style="margin-bottom:6px">${lc('dollar-sign',14,'rgba(255,255,255,.7)')}</div>
        <div style="font-size:1.5rem;font-weight:900;color:#fff;line-height:1;letter-spacing:-.02em">R$${fmt(fat)}</div>
        <div style="font-size:var(--text-2xs);color:rgba(255,255,255,.65);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Faturamento</div>
      </div>
      <div style="background:var(--brand-orange);border-radius:var(--r14);padding:16px 18px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-10px;top:-10px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.1)"></div>
        <div style="margin-bottom:6px">${lc('shopping-bag',14,'rgba(26,10,46,.5)')}</div>
        <div style="font-size:1.5rem;font-weight:900;color:#1A0A2E;line-height:1;letter-spacing:-.02em">${total}</div>
        <div style="font-size:var(--text-2xs);color:rgba(26,10,46,.6);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Pedidos</div>
      </div>
      <div style="background:var(--purple-xlight);border:1.5px solid var(--border);border-radius:var(--r14);padding:16px 18px">
        <div style="margin-bottom:6px">${lc('tag',14,'var(--purple)')}</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--purple);line-height:1;letter-spacing:-.02em">R$${fmt(ticket)}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Ticket médio</div>
      </div>
      <div style="background:var(--orange-light);border:1.5px solid var(--border);border-radius:var(--r14);padding:16px 18px">
        <div style="margin-bottom:6px">${lc('pizza',14,'var(--orange-dark)')}</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--orange-dark);line-height:1;letter-spacing:-.02em">${fmtPz(pizzas)}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Pizzas vendidas</div>
        <div style="font-size:var(--text-2xs);color:var(--orange-dark);margin-top:3px;font-weight:600">${fmtPz(pizzasGrande)} grandes · ${fmtPz(pizzasPequena)} pequenas</div>
      </div>
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r14);padding:16px 18px">
        <div style="margin-bottom:6px">${lc('bar-chart-2',14,corCmv)}</div>
        <div style="font-size:1.5rem;font-weight:900;color:${corCmv};line-height:1;letter-spacing:-.02em">${fat>0?fmt(cmvPct)+'%':'—'}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">CMV</div>
        <div style="font-size:var(--text-2xs);color:${corCmv};margin-top:3px;font-weight:600">${fat>0?'R$'+fmt(custoTotal)+' de custo':'sem dados no período'}</div>
      </div>
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r14);padding:16px 18px">
        <div style="margin-bottom:6px">${lc('user-check',14,'var(--green)')}</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--green);line-height:1;letter-spacing:-.02em">${clientesInfo.total>0?fmt(pctRecorrente)+'%':'—'}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Clientes recorrentes</div>
        <div style="font-size:var(--text-2xs);color:var(--green);margin-top:3px;font-weight:600">${clientesInfo.total>0?`${clientesInfo.novos.qtd} novos (R$${fmt(clientesInfo.novos.receita)}) · ${clientesInfo.recorrentes.qtd} recor. (R$${fmt(clientesInfo.recorrentes.receita)})`:'sem dados no período'}</div>
      </div>
    </div>`;

  // Pipeline
  const pipelineHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden;margin-bottom:14px">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        ${lc('git-merge',13,'var(--purple)')}
        <span style="font-size:var(--text-sm);font-weight:700">Pipeline de pedidos</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${isMobile()?3:5},1fr);border-top:1px solid var(--border)">
        ${Object.entries(STATUS_INFO).map(([k,info],i,arr) => `
          <div style="text-align:center;padding:16px 8px;background:${info.bg};border-right:${i<arr.length-1?'1px solid var(--border)':'none'}">
            ${lc(info.ic, 18, info.c)}
            <div style="font-size:1.8rem;font-weight:900;color:${info.c};margin-top:4px;line-height:1">${statusCount[k]}</div>
            <div style="font-size:var(--text-2xs);color:${info.c === 'var(--green)' ? 'var(--green)' : 'var(--muted)'};margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${info.l}</div>
          </div>`).join('')}
      </div>
    </div>`;

  // ── Tabela pedidos por hora
  const isHoje = _per('perf').modo === 'hoje';
  const tabelaHoraHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('clock',13,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:700">Pedidos por hora</span>
          ${!isHoje ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-weight:500">soma de pedidos/pizzas e média de tempos no período</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:var(--warning-fg);background:var(--yellow-light);padding:2px 8px;border-radius:4px">${lc('zap',9,'currentColor')} Pico: ${picoH}h</span>
          ${isHoje ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:var(--purple);background:var(--purple-xlight);padding:2px 8px;border-radius:4px">${lc('radio',9,'currentColor')} Agora: ${now.getHours()}h</span>` : ''}
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-xs)">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:9px 16px;text-align:left;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Hora</th>
              ${(_resultado && isHoje) ? `<th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Estimativa</th>` : ''}
              <th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Pedidos</th>
              <th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Pizzas</th>
              <th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Preparo</th>
              <th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Entrega</th>
              <th style="padding:9px 16px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            ${_CURVA_HORARIA.map(({h, pct}) => {
              const est        = Math.round(totalDia * pct);
              const pedHora    = pedidos.filter(p => p.hora === h);
              const realizados = pedHora.length;
              const pzHora     = pedHora.reduce((s,p)=>s+(p.pizzas||0),0);
              const isPico     = h === picoH;
              const isNow      = isHoje && h === now.getHours();
              const isFuture   = isHoje && h > now.getHours();

              const tPrep = _media(pedHora, 'tempoPreparo');
              const tEnt  = _media(pedHora, 'tempoEntrega');
              const tTot  = _media(pedHora, 'tempoTotal');

              const rowBg = isPico ? 'var(--yellow-light)' : isNow ? 'var(--purple-xlight)' : isFuture ? 'var(--surface2)' : 'var(--surface)';
              const leftBorder = isPico ? '3px solid #EAB308' : isNow ? '3px solid var(--purple)' : '3px solid transparent';
              const textCol = isFuture ? 'var(--muted)' : 'var(--text)';

              const tempoCell = (v, unit='min') => v !== null
                ? `<span style="font-size:var(--text-sm);font-weight:700;color:${v>40?'var(--red)':v>30?'var(--orange-dark)':'var(--green)'}">${v}${unit}</span>`
                : `<span style="color:var(--muted)">—</span>`;

              return `
                <tr style="border-top:1px solid var(--border);background:${rowBg};border-left:${leftBorder}">
                  <td style="padding:10px 16px">
                    <div style="display:flex;align-items:center;gap:6px">
                      ${isPico ? lc('zap',11,'var(--yellow)') : isNow ? lc('radio',11,'var(--purple)') : ''}
                      <span style="font-size:var(--text-sm);font-weight:${isPico||isNow?'800':'600'};color:${isPico?'var(--warning-fg)':isNow?'var(--purple)':textCol}">${h}:00</span>
                      ${isPico ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--warning-fg);background:rgba(234,179,8,.2);padding:1px 5px;border-radius:3px">PICO</span>` : ''}
                      ${isNow  ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple);background:rgba(107,33,212,.1);padding:1px 5px;border-radius:3px">AGORA</span>` : ''}
                    </div>
                  </td>
                  ${(_resultado && isHoje) ? `<td style="padding:10px 12px;text-align:center">
                    <span style="font-size:var(--text-sm);font-weight:600;color:${textCol}">${est}</span>
                  </td>` : ''}
                  <td style="padding:10px 12px;text-align:center">
                    ${isFuture
                      ? `<span style="color:var(--muted)">—</span>`
                      : `<div style="display:inline-flex;align-items:center;gap:5px">
                          <span style="font-size:var(--text-sm);font-weight:800;color:${realizados>=est?'var(--green)':isNow?'var(--purple)':'var(--text)'}">${realizados}</span>
                          <div style="width:28px;height:3px;background:var(--border);border-radius:2px;overflow:hidden">
                            <div style="height:100%;width:${est?Math.min(Math.round(realizados/est*100),100):0}%;background:${realizados>=est?'var(--green)':'var(--purple)'};border-radius:2px"></div>
                          </div>
                        </div>`}
                  </td>
                  <td style="padding:10px 12px;text-align:center">
                    ${isFuture
                      ? `<span style="color:var(--muted)">—</span>`
                      : `<span style="font-size:var(--text-sm);font-weight:700;color:${textCol}">${fmtPz(pzHora)}</span>`}
                  </td>
                  <td style="padding:10px 12px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tPrep)}</td>
                  <td style="padding:10px 12px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tEnt)}</td>
                  <td style="padding:10px 16px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tTot)}</td>
                </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border);background:var(--surface2)">
              <td style="padding:9px 16px;font-size:var(--text-sm);font-weight:800">${isHoje ? 'Total do dia' : 'Total do período'}</td>
              ${(_resultado && isHoje) ? `<td></td>` : ''}
              <td style="padding:9px 12px;text-align:center;font-size:var(--text-sm);font-weight:800">${total}</td>
              <td style="padding:9px 12px;text-align:center;font-size:var(--text-sm);font-weight:800;color:var(--orange-dark)">${fmtPz(pizzas)}</td>
              <td colspan="2"></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;

  // Lateral: canais + tempos
  const lateralHtml = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
        <div style="padding:13px 18px;border-bottom:1px solid var(--border);font-size:var(--text-sm);font-weight:700">Canais</div>
        <div>
          ${canaisData.map(c => {
            const pct = total ? Math.round(c.n/total*100) : 0;
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border)">
                <div style="width:8px;height:8px;border-radius:50%;background:${canalCor(c.c)};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-size:var(--text-sm);font-weight:600">${canalLabel(c.c)}</span>
                    <span style="font-size:var(--text-2xs);color:var(--muted)">${pct}% · R$${fmt(c.fat)}</span>
                  </div>
                  <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${canalCor(c.c)};border-radius:2px"></div>
                  </div>
                </div>
                <div style="display:flex;gap:12px;flex-shrink:0">
                  <div style="text-align:right;min-width:38px">
                    <div style="font-size:var(--text-sm);font-weight:800">${c.n}</div>
                    <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">ped.</div>
                  </div>
                  <div style="text-align:right;min-width:56px">
                    <div style="font-size:var(--text-sm);font-weight:800;color:${canalCor(c.c)}">R$${fmt(c.ticket)}</div>
                    <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">méd.</div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
        <div style="padding:13px 18px;border-bottom:1px solid var(--border);font-size:var(--text-sm);font-weight:700">Tempos médios</div>
        <div style="padding:4px 0">
          ${tmPreparo && tmEntrega ? `
            ${[['chef-hat','Preparo',tmPreparo,'var(--orange-dark)'],['truck','Entrega',tmEntrega,'var(--purple)'],['zap','Total',tmPreparo+tmEntrega,'var(--green)']].map(([ic,l,v,c]) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 18px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:7px;font-size:var(--text-sm);color:var(--text2)">${lc(ic,11,c)} ${l}</div>
                <div style="font-size:var(--text-md);font-weight:800;color:${c}">${v}min</div>
              </div>`).join('')}` : `
            <div style="text-align:center;padding:18px;font-size:var(--text-xs);color:var(--muted)">Aguardando primeiras entregas</div>`}
        </div>
      </div>
    </div>`;

  // Pedidos em aberto (excluindo concluídos)
  const ativos   = pedidos.filter(p => p.status !== 'entregue');
  const nAtrasados = ativos.filter(p => _dashPedAtrasado(p)).length;

  const recentesHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden;margin-top:14px">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        ${lc('list',13,'var(--purple)')}
        <span style="font-size:var(--text-sm);font-weight:700">Pedidos em aberto</span>
        ${ativos.length ? `<span class="badge b-purple">${ativos.length}</span>` : ''}
        ${nAtrasados ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;background:var(--red-light);color:var(--red);font-size:var(--text-2xs);font-weight:800">
          ${lc('alert-circle',10,'currentColor')} ${nAtrasados} atrasado${nAtrasados>1?'s':''}
        </span>` : ''}
      </div>
      ${!ativos.length ? `
        <div style="text-align:center;padding:28px;color:var(--muted)">
          ${lc('check-circle',18,'var(--green)')}<div style="font-size:var(--text-sm);margin-top:8px;color:var(--green);font-weight:600">Sem pedidos em aberto</div>
        </div>` : `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-xs)">
          <thead>
            <tr style="background:var(--surface2)">
              ${['Nº','Canal','Tipo','Status','Valor','Tempo'].map((h2,i)=>`
                <th style="padding:8px ${i>=4?'18':'10'}px;text-align:${i>=4?'right':'left'};font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">${h2}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${ativos.map(p => {
              const si      = STATUS_INFO[p.status];
              const atraso  = _dashPedAtrasado(p);
              const tempo   = p.mAtrs < 60 ? `${p.mAtrs}min` : `${Math.floor(p.mAtrs/60)}h${String(p.mAtrs%60).padStart(2,'0')}m`;
              const rowBg   = atraso ? 'rgba(220,38,38,.04)' : '';
              const leftBrd = atraso ? '3px solid var(--red)' : '3px solid transparent';
              return `
                <tr style="border-top:1px solid var(--border);background:${rowBg};border-left:${leftBrd}"
                  onmouseover="this.style.background='${atraso?'rgba(220,38,38,.08)':'var(--purple-xlight)'}'"
                  onmouseout="this.style.background='${rowBg}'">
                  <td style="padding:9px 10px;font-weight:800;color:${atraso?'var(--red)':'var(--purple)'}">${p.num}</td>
                  <td style="padding:9px 10px"><span style="padding:2px 7px;border-radius:4px;background:var(--surface2);font-size:var(--text-2xs);font-weight:700">${canalLabel(p.canal)}</span></td>
                  <td style="padding:9px 10px;color:var(--muted);font-size:var(--text-xs)">
                    <div style="display:flex;align-items:center;gap:4px">${p.tipo==='entrega'?lc('truck',10,'currentColor'):lc('store',10,'currentColor')} ${p.tipo==='entrega'?'Entrega':'Retirada'}</div>
                  </td>
                  <td style="padding:9px 10px">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                      <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;background:${si.badgeBg};color:${si.badgeC};font-size:var(--text-xs);font-weight:700;white-space:nowrap">
                        ${lc(si.ic,10,si.badgeC)} ${si.l}
                      </span>
                      ${atraso ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:20px;background:var(--red-light);color:var(--red);font-size:var(--text-2xs);font-weight:800">
                        ${lc('alert-circle',9,'currentColor')} ATRASADO
                      </span>` : ''}
                    </div>
                    ${atraso ? `<div style="font-size:var(--text-2xs);color:var(--red);margin-top:2px;font-weight:600">${atraso.msg}</div>` : ''}
                  </td>
                  <td style="padding:9px 18px 9px 10px;text-align:right;font-weight:800">R$${fmt(p.valor)}</td>
                  <td style="padding:9px 18px 9px 10px;text-align:right;font-size:var(--text-xs);font-weight:${atraso?'800':'400'};color:${atraso?'var(--red)':'var(--muted)'}">${tempo}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;

  el.innerHTML = `
    ${statusBarHtml}
    ${kpiHtml}
    ${pipelineHtml}
    <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1.5fr 1fr'};gap:14px">
      ${tabelaHoraHtml}
      ${lateralHtml}
    </div>
    ${recentesHtml}
  `;

  if (_perfInterval) clearInterval(_perfInterval);
  _perfInterval = setInterval(() => {
    _perfCountdown--;
    const el2 = document.getElementById('perfCdwn');
    if (el2) el2.textContent = `${_perfCountdown}s`;
    if (_perfCountdown <= 0) { _perfCountdown = 60; _renderDashPerf(); }
  }, 1000);
}

// ── Sidebar badges ────────────────────────────────────────────────────────────

function _updateSidebarBadges() {
  const insumos  = items.filter(i => !i.isProd);
  const crit     = insumos.filter(i => gst(i) === 'crit').length;
  const prodCrit = items.filter(i => i.isProd && gst(i) === 'crit').length;

  const bEst = document.getElementById('badge-estoque');
  if (bEst) { bEst.textContent = crit||''; bEst.style.display = crit?'inline-flex':'none'; }
  const bPre = document.getElementById('prepBadge');
  if (bPre) { bPre.textContent = prodCrit||''; bPre.style.display = prodCrit?'inline-flex':'none'; }
}

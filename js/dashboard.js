let _dashTab = 'rotina';
let _perfInterval = null;
let _perfCountdown = 60;

// ── Entrada ──────────────────────────────────────────────────────────────────

function renderDashboard() {
  const now  = new Date();
  const h    = now.getHours();
  const cfg  = db._get('vtp_config', {});
  const nome = cfg.responsavel || 'Gestor';

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
      <div style="display:flex;gap:3px;background:var(--surface2);border-radius:var(--r8);padding:3px">
        <button id="dashTabRotina" onclick="setDashTab('rotina')"
          style="font-size:var(--text-sm);padding:6px 16px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s">
          ${lc('layout-dashboard',12,'currentColor')} Rotina
        </button>
        <button id="dashTabPerf" onclick="setDashTab('performance')"
          style="font-size:var(--text-sm);padding:6px 16px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s">
          ${lc('activity',12,'currentColor')} Performance
          <span style="width:7px;height:7px;border-radius:50%;background:${dotCor};display:inline-block;flex-shrink:0;box-shadow:0 0 0 2px ${dotCor}33"></span>
        </button>
      </div>
    </div>
    <div id="dashContent" style="overflow-y:auto;overflow-x:hidden;padding:${isMobile()?'16px 16px 32px':'20px 24px 40px'};height:calc(100vh - 110px)"></div>
  `;

  _updateSidebarBadges();
  setDashTab(_dashTab);
}

function setDashTab(tab) {
  _dashTab = tab;
  if (_perfInterval) { clearInterval(_perfInterval); _perfInterval = null; }

  const btnR = document.getElementById('dashTabRotina');
  const btnP = document.getElementById('dashTabPerf');
  if (!btnR || !btnP) return;

  const on  = 'background:var(--bg);color:var(--purple);font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.1)';
  const off = 'background:transparent;color:var(--text2);font-weight:500;box-shadow:none';
  const base = 'font-size:var(--text-sm);padding:6px 16px;border-radius:6px;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s;';
  btnR.style.cssText = base + (tab === 'rotina' ? on : off);
  btnP.style.cssText = base + (tab === 'performance' ? on : off);

  _renderDashTabContent();
}

function _renderDashTabContent() {
  if (_dashTab === 'rotina') _renderDashRotina();
  else _renderDashPerf();
}

// ── Mock de simulação ─────────────────────────────────────────────────────────

function _dashMockRotina() {
  return {
    criticos: [
      { name: 'Farinha de Trigo Especial', qty: 8,   min: 40,   unit: 'kg' },
      { name: 'Molho de Tomate',           qty: 2,   min: 15,   unit: 'un' },
    ],
    baixos: [
      { name: 'Queijo Muçarela',  qty: 3.5, min: 10,   unit: 'kg' },
      { name: 'Azeitona Fatiada', qty: 400, min: 2000, unit: 'g'  },
      { name: 'Pepperoni',        qty: 1.2, min: 5,    unit: 'kg' },
    ],
    listasAtivas: [
      { codigo: 'Compra semanal #14', status: 'cotacao', etapa: 2, _itens: 18, _sups: 3 },
    ],
    cicloHistorico: [
      { id: 'LC0013', data: '2026-05-11', itens: 22, total: 2840, economia: 180 },
      { id: 'LC0012', data: '2026-05-04', itens: 19, total: 3120, economia: 210 },
      { id: 'LC0011', data: '2026-04-27', itens: 24, total: 2960, economia: 140 },
    ],
    ckSessoes: [
      { nome: 'Abertura Cozinha', status: 'concluida',    itens: 12, feitos: 12 },
      { nome: 'Limpeza Geral',    status: 'concluida',    itens: 8,  feitos: 8  },
      { nome: 'Pré-produção',     status: 'em_andamento', itens: 10, feitos: 6  },
      { nome: 'Fechamento',       status: 'pendente',     itens: 7,  feitos: 0  },
    ],
    previsao: { totPz: 47, pedDel: 31, motFinal: 3, masGrFin: 8.4, masPqFin: 2.1 },
    manutAtrasadas: [{ nome: 'Forno elétrico — limpeza profunda', dias: 3 }],
    desperdicios: [
      { item: 'Massa de pizza',   tipo: 'Excesso produção',      qty: 1.2, unit: 'kg', custo: 14.40, data: '2026-05-17' },
      { item: 'Queijo Muçarela',  tipo: 'Validade vencida',      qty: 0.8, unit: 'kg', custo: 28.00, data: '2026-05-16' },
      { item: 'Molho de tomate',  tipo: 'Desperdício no processo', qty: 0.5, unit: 'kg', custo: 6.50, data: '2026-05-15' },
    ],
  };
}

// ── MODO ROTINA ──────────────────────────────────────────────────────────────

function _renderDashRotina() {
  const el = document.getElementById('dashContent');
  if (!el) return;

  const hoje = new Date().toISOString().slice(0,10);

  const insumos    = items.filter(i => !i.isProd);
  const criticos   = insumos.filter(i => gst(i) === 'crit');
  const baixos     = insumos.filter(i => gst(i) === 'warn');
  const listasAtiv = listas.filter(l => l.status !== 'concluida').map(l => ({
    codigo: l.codigo || l.nome || 'Lista',
    status: l.status,
    etapa:  l.etapa || 1,
    _itens: Array.isArray(l.itens) ? l.itens.length : (l.itens || 0),
    _sups:  (() => {
      if (!Array.isArray(l.itens)) return 0;
      const ids = new Set();
      l.itens.forEach(i => (i.cotacoes||[]).forEach(c => c.supId && ids.add(c.supId)));
      return ids.size;
    })(),
  }));

  const historico = cycleHistory.slice(-3).reverse().map(c => ({
    id:      c.id || c.codigo || 'Compra',
    data:    c.data || c.date || c.created_at || '',
    itens:   c.itens || c.items || 0,
    total:   c.total || 0,
    economia:c.economia || 0,
  }));

  const ckSessoes = (typeof _getCkSessoes === 'function')
    ? (() => {
        const s = _getCkSessoes().filter(s => s.data === hoje);
        const tmpls = typeof _getCkTemplates === 'function' ? _getCkTemplates() : [];
        return s.map(s => {
          const t = tmpls.find(t => t.id === s.templateId);
          const its = s.items || [];
          return { nome: t?.nome || s.nome || 'Checklist', status: s.status, itens: its.length, feitos: its.filter(i=>i.ok).length };
        });
      })()
    : [];

  const prevData  = _resultado || { totPz:0, pedDel:0, motFinal:0, masGrFin:0, masPqFin:0 };
  const manutAtr  = (typeof manutItens !== 'undefined' && typeof _manutCalcStatus === 'function')
    ? manutItens.filter(i => _manutCalcStatus(i) === 'atrasado').map(i => ({ nome: i.nome||i.descricao||'Item' }))
    : [];
  const despData  = (typeof desperdicios !== 'undefined' && desperdicios.length)
    ? [...desperdicios].sort((a,b)=>new Date(b.data||b.created_at)-new Date(a.data||a.created_at)).slice(0,3).map(d => {
        const it = items.find(i => i.id == d.itemId);
        return { item: it?.name||d.itemNome||'Insumo', tipo: d.tipo||'', qty: d.qty||0, unit: it?.unit||'', custo: it ? (d.qty||0)*(it.cost||0) : 0, data: d.data||d.created_at?.slice(0,10)||'' };
      })
    : [];

  const nCrit   = criticos.length;
  const nBaixo  = baixos.length;
  const nListas = listasAtiv.length;
  const nCkAb   = ckSessoes.filter(s => s.status !== 'concluida').length;
  const nManut  = manutAtr.length;
  const tudoOk  = !nCrit && !nBaixo && !nListas && !nCkAb && !nManut;

  // ── Ações do dia
  const ACOES = tudoOk ? [] : [
    nCrit  && { n:nCrit,  label:`insumo${nCrit>1?'s':''} crítico${nCrit>1?'s':''}`,     bg:'var(--red-light)',    fg:'var(--red)',        ic:'alert-circle',    mod:'estoque'    },
    nBaixo && { n:nBaixo, label:`abaixo do mínimo`,                                       bg:'var(--yellow-light)', fg:'var(--warning-fg)', ic:'trending-down',   mod:'estoque'    },
    nListas&& { n:nListas,label:`lista${nListas>1?'s':''} ativa${nListas>1?'s':''}`,     bg:'var(--purple-xlight)',fg:'var(--purple)',     ic:'shopping-cart',   mod:'compras'    },
    nCkAb  && { n:nCkAb,  label:`checklist${nCkAb>1?'s':''} em aberto`,                  bg:'var(--orange-light)', fg:'var(--orange-dark)',ic:'clipboard-check', mod:'checklist'  },
    nManut && { n:nManut, label:`manutenção${nManut>1?'ões':''} atrasada${nManut>1?'s':''}`, bg:'var(--red-light)', fg:'var(--danger-fg)',  ic:'tool',            mod:'manutencao' },
  ].filter(Boolean);

  const acoesHtml = tudoOk
    ? `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--green-light);border:1.5px solid var(--success-border);border-radius:var(--r10);margin-bottom:16px">
        ${lc('check-circle',14,'var(--green)')}
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--green)">Tudo em dia — nenhuma ação necessária</span>
      </div>`
    : `<div class="dash-actions" style="display:grid;grid-template-columns:repeat(${isMobile()?Math.min(ACOES.length,2):ACOES.length},1fr);gap:10px;margin-bottom:16px">
        ${ACOES.map(a => `
          <div onclick="goModule('${a.mod}')" class="action-card" style="background:${a.bg}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div style="width:30px;height:30px;background:rgba(255,255,255,.55);border-radius:var(--r8);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${lc(a.ic,14,a.fg)}
              </div>
              <div style="font-size:1.7rem;font-weight:900;color:${a.fg};line-height:1;flex-shrink:0">${a.n}</div>
            </div>
            <div style="font-size:var(--text-xs);font-weight:700;color:${a.fg};margin-top:8px;line-height:1.3">${a.label}</div>
          </div>`).join('')}
      </div>`;

  // ── Ciclo de compras
  const _ETAPAS = [
    'montagem','cotacao','aguard_aprov_pre','aguard_aprovacao','aprovada','ordem_criada','recebimento'
  ];
  const _ETAPA_LABEL = {
    montagem:'Montagem', cotacao:'Cotação', aguard_aprov_pre:'Pré-aprov.',
    aguard_aprovacao:'Aprovação', aprovada:'Aprovada', ordem_criada:'OC', recebimento:'Entrega',
  };

  const cicloHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('shopping-cart',13,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:700">Ciclo de compras</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="goModule('compras')">${lc('arrow-right',10,'currentColor')} Abrir</button>
      </div>
      <div style="padding:14px 18px">
        ${!listasAtiv.length && !historico.length ? `
          <div style="text-align:center;padding:20px 0;color:var(--fg-subtle)">
            ${lc('shopping-cart',24,'var(--border)')}
            <div style="font-size:var(--text-sm);margin-top:8px;font-weight:600">Nenhuma lista ativa</div>
            <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-top:4px">Inicie uma nova lista em Compras</div>
            <button class="btn btn-primary btn-xs" style="margin-top:12px" onclick="goModule('compras')">${lc('plus',11,'#fff')} Nova lista</button>
          </div>` : ''}
        ${listasAtiv.slice(0,2).map(l => {
          const stepIdx = Math.max(0, _ETAPAS.indexOf(l.status));
          const pct = Math.round((stepIdx+1)/_ETAPAS.length*100);
          return `
            <div style="padding:11px 14px;background:var(--surface2);border-radius:var(--r10);margin-bottom:10px;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--text)">${l.codigo}</div>
                <span class="badge b-purple" style="font-size:var(--text-2xs)">${_ETAPA_LABEL[l.status]||l.status}</span>
              </div>
              <div style="display:flex;gap:2px;margin-bottom:6px">
                ${_ETAPAS.map((e,i) => `<div style="flex:1;height:4px;border-radius:3px;background:${i<=stepIdx?'var(--purple)':'var(--border)'}"></div>`).join('')}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:var(--text-xs);color:var(--muted)">${l._itens} itens · ${l._sups} fornecedor${l._sups!==1?'es':''}</div>
                <div style="font-size:var(--text-xs);font-weight:700;color:var(--purple)">${pct}%</div>
              </div>
            </div>`;
        }).join('')}
        ${historico.length ? `
          <div style="padding-top:10px;border-top:1px solid var(--border)">
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Histórico</div>
            ${historico.map(c => `
              <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
                <div style="width:26px;height:26px;background:var(--purple-xlight);border-radius:var(--r8);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  ${lc('check-circle',10,'var(--purple)')}
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:var(--text-sm);font-weight:600">${c.id}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${fmtD(c.data)} · ${c.itens} itens</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                  <div style="font-size:var(--text-sm);font-weight:800;color:var(--purple)">R$${fmt(c.total)}</div>
                  ${c.economia?`<div style="font-size:var(--text-2xs);color:var(--green)">-R$${fmt(c.economia)}</div>`:''}
                </div>
              </div>`).join('')}
          </div>` : ''}
      </div>
    </div>`;

  // ── Checklist hoje
  const ckConc = ckSessoes.filter(s=>s.status==='concluida').length;
  const ckAnd  = ckSessoes.filter(s=>s.status==='em_andamento').length;
  const ckPend = ckSessoes.filter(s=>s.status==='pendente').length;
  const ckTot  = ckSessoes.length;
  const ckPct  = ckTot ? Math.round(ckConc/ckTot*100) : 0;
  const circum = Math.round(2*Math.PI*20);

  const CK_ST = {
    concluida:    { c:'var(--green)',       ic:'check-circle' },
    em_andamento: { c:'var(--orange-dark)', ic:'clock'        },
    pendente:     { c:'var(--muted)',       ic:'circle'       },
  };

  const ckHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('clipboard-check',13,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:700">Checklist hoje</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="goModule('checklist')">${lc('arrow-right',10,'currentColor')} Abrir</button>
      </div>
      <div style="padding:14px 18px;max-height:300px;overflow-y:auto">
        ${!ckTot ? `
          <div style="text-align:center;padding:20px 0">
            ${lc('clipboard-check',24,'var(--border-strong)')}
            <div style="font-size:var(--text-sm);margin-top:8px;font-weight:600;color:var(--fg-muted)">Nenhuma sessão hoje</div>
            <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-top:4px">Atribua checklists em Checklist</div>
          </div>
        ` : `
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
            <div style="position:relative;width:48px;height:48px;flex-shrink:0">
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" stroke-width="4"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="${ckPct===100?'var(--green)':'var(--purple)'}" stroke-width="4"
                  stroke-dasharray="${circum}" stroke-dashoffset="${Math.round(circum*(1-ckPct/100))}"
                  stroke-linecap="round" transform="rotate(-90 24 24)"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:800;color:${ckPct===100?'var(--green)':'var(--purple)'}">${ckPct}%</div>
            </div>
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:700">${ckConc} de ${ckTot} concluídas</div>
              <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap">
                ${ckAnd ? `<span style="font-size:var(--text-2xs);color:var(--orange-dark);font-weight:600;display:flex;align-items:center;gap:3px">${lc('clock',9,'currentColor')} ${ckAnd} em andamento</span>` : ''}
                ${ckPend? `<span style="font-size:var(--text-2xs);color:var(--muted);font-weight:600;display:flex;align-items:center;gap:3px">${lc('circle',9,'currentColor')} ${ckPend} pendente${ckPend>1?'s':''}</span>` : ''}
              </div>
            </div>
          </div>
          ${ckSessoes.map(s => {
            const si  = CK_ST[s.status] || CK_ST.pendente;
            const pct2 = s.itens ? Math.round(s.feitos/s.itens*100) : 0;
            return `
              <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid var(--border)">
                <div style="width:22px;height:22px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  ${lc(si.ic,10,si.c)}
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:var(--text-xs);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.nome}</div>
                  <div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden">
                    <div style="height:100%;width:${pct2}%;background:${si.c};border-radius:2px"></div>
                  </div>
                </div>
                <div style="font-size:var(--text-2xs);color:var(--muted);flex-shrink:0">${s.feitos}/${s.itens}</div>
              </div>`;
          }).join('')}
        `}
      </div>
    </div>`;

  // ── Previsão do dia
  const prevHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden;margin-top:12px">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('bar-chart-2',13,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:700">Previsão do dia</span>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="goModule('previsao')">${lc('arrow-right',10,'currentColor')} Abrir</button>
      </div>
      <div style="padding:14px 18px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${[
            ['pizza',  'var(--purple)',     'var(--purple-xlight)', prevData.totPz||0,  'Pizzas prev.'    ],
            ['truck',  'var(--orange-dark)','var(--orange-light)',  prevData.pedDel||0, 'Delivery'        ],
            ['users',  'var(--green)',      'var(--green-light)',   prevData.motFinal||0,'Motoboys'       ],
            ['layers', 'var(--text2)',      'var(--surface2)',      fmt((prevData.masGrFin||0)+(prevData.masPqFin||0)), 'Massa (kg)'],
          ].map(([ic,c,bg,v,l]) => `
            <div style="padding:10px 12px;background:${bg};border-radius:var(--r10);display:flex;align-items:center;gap:8px">
              ${lc(ic,12,c)}
              <div>
                <div style="font-size:1.1rem;font-weight:800;color:${c};line-height:1">${v}</div>
                <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px">${l}</div>
              </div>
            </div>`).join('')}
        </div>
        ${!_resultado?`<div style="margin-top:8px;font-size:var(--text-xs);color:var(--muted);text-align:center;display:flex;align-items:center;justify-content:center;gap:4px">${lc('info',10,'currentColor')} Simulação — calcule em Previsão para valores reais</div>`:''}
      </div>
    </div>`;

  // ── Alertas de estoque
  const alertItens = [...criticos.map(i=>({...i,_st:'crit'})), ...baixos.slice(0,5).map(i=>({...i,_st:'warn'}))];
  const alertasHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('alert-triangle',13,'var(--red)')}
          <span style="font-size:var(--text-sm);font-weight:700">Alertas de estoque</span>
          ${alertItens.length?`<span class="badge b-red">${alertItens.length}</span>`:''}
        </div>
        <button class="btn btn-ghost btn-xs" onclick="goModule('estoque')">${lc('arrow-right',10,'currentColor')} Ver todos</button>
      </div>
      <div style="max-height:260px;overflow-y:auto">
        ${alertItens.length ? alertItens.slice(0,8).map(i => {
          const isCrit = i._st === 'crit';
          const pct    = i.min ? Math.min(Math.round(i.qty/i.min*100), 100) : 10;
          const col    = isCrit ? 'var(--red)' : 'var(--yellow)';
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--border)">
              <div style="width:30px;height:30px;background:${isCrit?'var(--red-light)':'var(--yellow-light)'};border-radius:var(--r8);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${lc(isCrit?'alert-circle':'alert-triangle',12,col)}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${i.name}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                  <div style="width:80px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0">
                    <div style="height:100%;width:${pct}%;background:${col};border-radius:2px"></div>
                  </div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${fmt(i.qty)} / ${fmt(i.min)} ${i.unit}</div>
                </div>
              </div>
              <span class="badge ${isCrit?'b-red':'b-yellow'}" style="flex-shrink:0">${isCrit?'CRÍTICO':'BAIXO'}</span>
            </div>`;
        }).join('') : `
          <div style="text-align:center;padding:24px;color:var(--green)">
            ${lc('check-circle',20,'currentColor')}
            <div style="font-size:var(--text-sm);margin-top:8px;font-weight:600">Estoque em dia</div>
          </div>`}
      </div>
    </div>`;

  // ── Desperdício
  const despTotal = despData.reduce((s,d)=>s+(d.custo||0),0);
  const despHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('trash-2',13,'var(--orange-dark)')}
          <span style="font-size:var(--text-sm);font-weight:700">Desperdício recente</span>
          ${despTotal?`<span style="font-size:var(--text-xs);font-weight:800;color:var(--red)">-R$${fmt(despTotal)}</span>`:''}
        </div>
        <button class="btn btn-ghost btn-xs" onclick="goModule('desperdicio')">${lc('arrow-right',10,'currentColor')} Ver</button>
      </div>
      <div>
        ${despData.length ? despData.map(d => `
          <div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid var(--border)">
            <div style="width:30px;height:30px;background:var(--orange-light);border-radius:var(--r8);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              ${lc('trash-2',11,'var(--orange-dark)')}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.item}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${d.tipo} · ${fmtD(d.data)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:var(--text-xs);font-weight:700;color:var(--red)">-R$${fmt(d.custo)}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">${fmt(d.qty)} ${d.unit}</div>
            </div>
          </div>`) .join('') : `
          <div style="text-align:center;padding:24px;color:var(--green)">
            ${lc('check-circle',20,'currentColor')}
            <div style="font-size:var(--text-sm);margin-top:8px;font-weight:600">Sem desperdício recente</div>
          </div>`}
      </div>
    </div>`;

  el.innerHTML = `
    ${acoesHtml}
    <div style="display:grid;grid-template-columns:${isMobile()?'1fr':'1.2fr 1fr'};gap:14px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:14px">
        ${cicloHtml}
        ${alertasHtml}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${ckHtml}
        ${prevHtml}
        ${despHtml}
      </div>
    </div>
  `;
}

// ── MODO PERFORMANCE ─────────────────────────────────────────────────────────

function _getPedidosCW() {
  const now   = new Date();
  const nowH  = now.getHours();
  const nowM  = now.getMinutes();
  const seed  = now.getFullYear()*10000 + (now.getMonth()+1)*100 + now.getDate();
  const rng   = (n,min=0,max=1) => { const x=Math.sin(seed+n)*10000; return min+Math.floor((x-Math.floor(x))*(max-min+1)); };

  const totalDia = rng(0, 38, 62);
  const CANAIS   = ['ifood','99food','site'];
  const pedidos  = [];
  let pid = 1;

  _CURVA_HORARIA.forEach(({h, pct}) => {
    const qtd = Math.round(totalDia * pct);
    if (h > nowH || (h === nowH && nowM < 5)) return;
    for (let j = 0; j < qtd; j++) {
      const min2  = rng(pid*3+1, 0, 59);
      const ts    = new Date(now); ts.setHours(h, min2, 0, 0);
      const mAtrs = Math.max(0, Math.round((now-ts)/60000));
      const canal = CANAIS[rng(pid*3+2, 0, 2)];
      const tipo  = rng(pid*3+3, 0, 9) < 8 ? 'entrega' : 'retirada';
      const valor = 35 + rng(pid*3+4, 0, 55) + rng(pid*3+5, 0, 9)*0.9;
      let status;
      if      (mAtrs < 8)  status = 'aguardando';
      else if (mAtrs < 20) status = 'em_preparo';
      else if (mAtrs < 30) status = 'pronto';
      else if (mAtrs < 45 && tipo === 'entrega') status = 'em_rota';
      else    status = 'entregue';
      pedidos.push({ id:pid, num:`P-${String(pid).padStart(3,'0')}`, canal, tipo, status, valor:+valor.toFixed(2), ts, hora:h, mAtrs, tempoPreparo:12+rng(pid*3+6,0,8), tempoEntrega:tipo==='entrega'?18+rng(pid*3+7,0,14):0 });
      pid++;
    }
  });

  // Fora do horário: simula dados do dia anterior para demonstração
  if (!pedidos.length) {
    _CURVA_HORARIA.forEach(({h, pct}) => {
      const qtd = Math.round(rng(99,38,55) * pct);
      for (let j = 0; j < qtd; j++) {
        const canal = CANAIS[rng(pid*3+2,0,2)];
        const tipo  = rng(pid*3+3,0,9) < 8 ? 'entrega' : 'retirada';
        const valor = 35 + rng(pid*3+4,0,55) + rng(pid*3+5,0,9)*0.9;
        const ts    = new Date(now); ts.setDate(ts.getDate()-1); ts.setHours(h, rng(pid*3+1,0,59), 0, 0);
        pedidos.push({ id:pid, num:`P-${String(pid).padStart(3,'0')}`, canal, tipo, status:'entregue', valor:+valor.toFixed(2), ts, hora:h, mAtrs:999, tempoPreparo:14+rng(pid*3+6,0,8), tempoEntrega:tipo==='entrega'?20+rng(pid*3+7,0,12):0 });
        pid++;
      }
    });
  }

  return pedidos.sort((a,b) => b.ts - a.ts);
}

function _dashRefreshPerf() { _perfCountdown = 60; _renderDashPerf(); }

function _dashPedAtrasado(p) {
  if (p.status === 'em_preparo' && p.mAtrs > 25) return { msg: `Preparo há ${p.mAtrs}min — meta 20min` };
  if (p.status === 'pronto'     && p.mAtrs > 35) return { msg: `Pronto há ${p.mAtrs}min — aguardando coleta` };
  if (p.status === 'em_rota'   && p.mAtrs > 55) return { msg: `Saiu há ${p.mAtrs}min — entrega estimada 35min` };
  return null;
}

function _renderDashPerf() {
  const el = document.getElementById('dashContent');
  if (!el) return;

  const pedidos   = _getPedidosCW();
  const now       = new Date();
  const nowH      = now.getHours();
  const operando  = nowH >= 17 && nowH <= 23;
  const simulado  = !operando;

  const total     = pedidos.length;
  const fat       = pedidos.reduce((s,p) => s+p.valor, 0);
  const ticket    = total ? fat/total : 0;
  const pizzaEst  = Math.round(total * 1.5);

  const statusCount = {
    aguardando: pedidos.filter(p=>p.status==='aguardando').length,
    em_preparo: pedidos.filter(p=>p.status==='em_preparo').length,
    pronto:     pedidos.filter(p=>p.status==='pronto').length,
    em_rota:    pedidos.filter(p=>p.status==='em_rota').length,
    entregue:   pedidos.filter(p=>p.status==='entregue').length,
  };

  const canaisData = ['ifood','99food','site'].map(c => ({
    c, n: pedidos.filter(p=>p.canal===c).length,
    fat: pedidos.filter(p=>p.canal===c).reduce((s,p)=>s+p.valor,0),
  })).sort((a,b)=>b.n-a.n);

  const entregues  = pedidos.filter(p => p.status==='entregue' && p.tempoEntrega>0);
  const tmPreparo  = entregues.length ? Math.round(entregues.reduce((s,p)=>s+p.tempoPreparo,0)/entregues.length) : null;
  const tmEntrega  = entregues.length ? Math.round(entregues.reduce((s,p)=>s+p.tempoEntrega,0)/entregues.length) : null;

  const CANAL_LABEL = { ifood:'iFood', '99food':'99Food', site:'Site' };
  const CANAL_COR   = { ifood:'var(--red)', '99food':'#F97316', site:'var(--purple)' };
  const STATUS_INFO = {
    aguardando: { l:'Aguardando', c:'var(--purple)', bg:'var(--surface)',     ic:'clock',         badgeC:'var(--warning-fg)', badgeBg:'var(--yellow-light)' },
    em_preparo: { l:'Em preparo', c:'var(--purple)', bg:'var(--surface)',     ic:'chef-hat',      badgeC:'var(--orange-dark)', badgeBg:'var(--orange-light)' },
    pronto:     { l:'Pronto',     c:'var(--purple)', bg:'var(--surface)',     ic:'check-circle',  badgeC:'var(--purple)', badgeBg:'var(--purple-xlight)' },
    em_rota:    { l:'Em rota',    c:'var(--purple)', bg:'var(--surface)',     ic:'truck',         badgeC:'var(--purple)', badgeBg:'var(--purple-xlight)' },
    entregue:   { l:'Entregues',  c:'var(--green)',  bg:'var(--green-light)', ic:'check-circle',  badgeC:'var(--green)', badgeBg:'var(--green-light)' },
  };

  // Horário de pico: maior pct na curva
  const picoH = _CURVA_HORARIA.reduce((p,c) => c.pct > p.pct ? c : p).h;
  // Total estimado do dia (mesmo seed)
  const seed2    = now.getFullYear()*10000 + (now.getMonth()+1)*100 + now.getDate();
  const rng2     = (n,min=0,max=1) => { const x=Math.sin(seed2+n)*10000; return min+Math.floor((x-Math.floor(x))*(max-min+1)); };
  const totalDia = rng2(0, 38, 62) || rng2(99, 38, 55);

  // Status bar
  const statusBarHtml = `
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:14px">
      <span style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px">
        <span style="width:6px;height:6px;border-radius:50%;background:${simulado?'var(--muted)':operando?'var(--green)':'var(--muted)'};display:inline-block;flex-shrink:0"></span>
        ${simulado?'Simulação':'API CW'} · atualiza em <strong id="perfCdwn" style="color:var(--text)">${_perfCountdown}s</strong>
      </span>
      <button class="btn btn-ghost btn-xs" onclick="_dashRefreshPerf()" style="padding:3px 8px">${lc('refresh-cw',10,'currentColor')} Agora</button>
    </div>`;

  // KPIs
  const kpiHtml = `
    <div style="display:grid;grid-template-columns:repeat(${isMobile()?2:4},1fr);gap:10px;margin-bottom:14px">
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
        <div style="font-size:1.5rem;font-weight:900;color:var(--orange-dark);line-height:1;letter-spacing:-.02em">${pizzaEst}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Pizzas est.</div>
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
  const tabelaHoraHtml = `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r16);overflow:hidden">
      <div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          ${lc('clock',13,'var(--purple)')}
          <span style="font-size:var(--text-sm);font-weight:700">Pedidos por hora</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:var(--warning-fg);background:var(--yellow-light);padding:2px 8px;border-radius:4px">${lc('zap',9,'currentColor')} Pico: ${picoH}h</span>
          ${!simulado?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);font-weight:600;color:var(--purple);background:var(--purple-xlight);padding:2px 8px;border-radius:4px">${lc('radio',9,'currentColor')} Agora: ${nowH}h</span>`:''}
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-xs)">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:9px 16px;text-align:left;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Hora</th>
              ${_resultado ? `<th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Estimativa</th>` : ''}
              <th style="padding:9px 12px;text-align:center;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap">Pedidos</th>
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
              const isPico     = h === picoH;
              const isNow      = !simulado && h === nowH;
              const isFuture   = !simulado && h > nowH;
              const isPast     = simulado || h < nowH;

              const entH = pedHora.filter(p => p.status==='entregue' && p.tempoEntrega>0);
              const tPrep  = entH.length ? Math.round(entH.reduce((s,p)=>s+p.tempoPreparo,0)/entH.length) : null;
              const tEnt   = entH.length ? Math.round(entH.reduce((s,p)=>s+p.tempoEntrega,0)/entH.length) : null;
              const tTot   = tPrep && tEnt ? tPrep+tEnt : null;

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
                  ${_resultado ? `<td style="padding:10px 12px;text-align:center">
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
                  <td style="padding:10px 12px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tPrep)}</td>
                  <td style="padding:10px 12px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tEnt)}</td>
                  <td style="padding:10px 16px;text-align:center">${isFuture?`<span style="color:var(--muted)">—</span>`:tempoCell(tTot)}</td>
                </tr>`;
            }).join('')}
          </tbody>
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
                <div style="width:8px;height:8px;border-radius:50%;background:${CANAL_COR[c.c]};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-size:var(--text-sm);font-weight:600">${CANAL_LABEL[c.c]}</span>
                    <span style="font-size:var(--text-2xs);color:var(--muted)">${pct}%</span>
                  </div>
                  <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${CANAL_COR[c.c]};border-radius:2px"></div>
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0;min-width:70px">
                  <div style="font-size:var(--text-sm);font-weight:700">${c.n} ped.</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">R$${fmt(c.fat)}</div>
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
  const ativos   = pedidos.filter(p => p.status !== 'entregue' && p.mAtrs < 999);
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
          ${simulado
            ? `${lc('moon',18,'currentColor')}<div style="font-size:var(--text-sm);margin-top:8px">Loja fechada — sem pedidos ativos</div>`
            : `${lc('check-circle',18,'var(--green)')}<div style="font-size:var(--text-sm);margin-top:8px;color:var(--green);font-weight:600">Sem pedidos em aberto</div>`}
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
                  <td style="padding:9px 10px"><span style="padding:2px 7px;border-radius:4px;background:var(--surface2);font-size:var(--text-2xs);font-weight:700">${CANAL_LABEL[p.canal]}</span></td>
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

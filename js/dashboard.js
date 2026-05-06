/**
 * VTP Compras — Vai Ter Pizza!
 * dashboard.js — Renderização do módulo Dashboard
 */

function renderDashboard() {
  const now = new Date();
  const h   = now.getHours();

  const cfg  = JSON.parse(localStorage.getItem('vtp_config') || '{}');
  const nome = cfg.responsavel || 'Yuri';
  document.getElementById('dashGreeting').textContent =
    `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${nome}! 👋`;
  document.getElementById('dashDate').textContent =
    now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const insumos   = items.filter(i => !i.isProd);
  const crit      = insumos.filter(i => gst(i) === 'crit').length;
  const totalNeed = insumos.reduce((s, i) => s + gneed(i) * i.cost, 0);
  const respCount = Object.keys(responses).length;
  const totalDisp = cycle?.dispatches?.length || 0;

  // KPI cards
  document.getElementById('kpiGrid').innerHTML = `
    <div class="kpi-card" onclick="goModule('estoque')">
      <div class="kpi-icon" style="background:var(--red-light)">🚨</div>
      <div class="kpi-val" style="color:var(--red)">${crit}</div>
      <div class="kpi-label">Insumos críticos</div>
    </div>
    <div class="kpi-card" onclick="goModule('preproducao')">
      <div class="kpi-icon" style="background:var(--red-light)">🍳</div>
      <div class="kpi-val" style="color:var(--red)">${items.filter(i => i.isProd && gst(i) === 'crit').length}</div>
      <div class="kpi-label">Prep. críticos</div>
    </div>
    <div class="kpi-card" onclick="goModule('compras')">
      <div class="kpi-icon" style="background:var(--orange-light)">💰</div>
      <div class="kpi-val" style="color:var(--orange-dark);font-size:1.1rem">R$${fmt(totalNeed)}</div>
      <div class="kpi-label">Estimativa compras</div>
    </div>
    <div class="kpi-card" onclick="goModule('compras')">
      <div class="kpi-icon" style="background:var(--purple-light)">📋</div>
      <div class="kpi-val">${respCount}/${totalDisp}</div>
      <div class="kpi-label">Cotações respondidas</div>
    </div>`;

  // Alertas de estoque
  const alerts = insumos
    .filter(i => gst(i) !== 'ok')
    .sort((a, b) => ({ crit: 0, warn: 1 }[gst(a)] - { crit: 0, warn: 1 }[gst(b)]));

  document.getElementById('dashAlerts').innerHTML = alerts.length
    ? alerts.slice(0, 5).map(i => `
        <div style="display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--border)">
          <div style="width:7px;height:7px;border-radius:50%;background:${gst(i) === 'crit' ? 'var(--red)' : 'var(--yellow)'};flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-size:.81rem;font-weight:600">${i.name}</div>
            <div style="font-size:.67rem;color:var(--muted)">${i.qty} ${i.unit} · mín: ${i.min}</div>
          </div>
          <span class="badge ${gst(i) === 'crit' ? 'b-red' : 'b-yellow'}">${gst(i) === 'crit' ? 'CRÍTICO' : 'BAIXO'}</span>
        </div>`).join('')
    : `<div class="empty" style="padding:20px"><div class="empty-icon">✅</div>Estoque em dia!</div>`;

  // Histórico recente
  document.getElementById('dashHistorico').innerHTML = cycleHistory.length
    ? cycleHistory.slice(-4).reverse().map(c => `
        <div class="hist-row" onclick="goModule('relatorios')">
          <div style="flex:1">
            <div style="font-size:.81rem;font-weight:600">${c.id}</div>
            <div style="font-size:.67rem;color:var(--muted)">${fmtD(c.date)} · ${c.items} itens · ${c.sups} fornecedores</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.81rem;font-weight:700;color:var(--purple)">R$${fmt(c.total)}</div>
            <div style="font-size:.65rem;color:var(--green)">-R$${fmt(c.economia)}</div>
          </div>
        </div>`).join('')
    : `<div class="empty" style="padding:20px"><div class="empty-icon">📋</div>Nenhum ciclo finalizado ainda.</div>`;

  // Ranking de fornecedores
  const mockRanking = suppliers.length
    ? suppliers.map((s, i) => ({ name: s.name, score: 92 - i * 8, n: i + 5 }))
    : [
        { name: 'Up Distribuidora',  score: 92, n: 8 },
        { name: 'Frios & Cia',       score: 87, n: 6 },
        { name: 'Laticínios Norte',  score: 78, n: 5 },
      ];

  document.getElementById('dashRanking').innerHTML = mockRanking.slice(0, 4).map((s, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border)">
      <div style="width:22px;height:22px;border-radius:50%;background:${i === 0 ? '#FEF3C7' : 'var(--purple-light)'};color:${i === 0 ? '#D97706' : 'var(--purple)'};font-size:.67rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
      <div style="flex:1">
        <div style="font-size:.81rem;font-weight:600">${s.name}</div>
        <div style="font-size:.67rem;color:var(--muted)">${s.n} cotações</div>
      </div>
      <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${s.score}%;background:var(--purple);border-radius:2px"></div>
      </div>
      <div style="font-size:.72rem;font-weight:700;color:var(--purple);width:24px">${s.score}</div>
    </div>`).join('');

  // Gráfico de custo por categoria
  const cats    = [...new Set(insumos.map(i => i.cat))];
  const catData = cats
    .map(c => ({ cat: c, val: insumos.filter(i => i.cat === c).reduce((s, i) => s + gneed(i) * i.cost, 0) }))
    .filter(c => c.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);
  const mx = catData[0]?.val || 1;

  document.getElementById('dashChart').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:9px">
      ${catData.map(c => `
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:.71rem;color:var(--text2);width:100px;text-align:right;flex-shrink:0">${c.cat}</div>
          <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${Math.round(c.val / mx * 100)}%;background:linear-gradient(90deg,var(--purple),var(--lilac));border-radius:4px"></div>
          </div>
          <div style="font-size:.69rem;color:var(--muted);width:56px">R$${fmt(c.val)}</div>
        </div>`).join('')}
    </div>`;

  // ── Badges na sidebar ──
  // Estoque: críticos de insumos
  const badgeEst = document.getElementById('badge-estoque');
  if (badgeEst) { badgeEst.textContent = crit > 0 ? crit : ''; badgeEst.style.display = crit > 0 ? 'inline-flex' : 'none'; }

  // Pré-produção: críticos de preparados
  const prodCrit = items.filter(i => i.isProd && gst(i) === 'crit').length;
  const badgePre = document.getElementById('prepBadge');
  if (badgePre) { badgePre.textContent = prodCrit > 0 ? prodCrit : ''; badgePre.style.display = prodCrit > 0 ? 'inline-flex' : 'none'; }
}

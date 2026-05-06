/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Módulo de Estoque (decisão de compra + carrinho)
 */

// ── Filtros ──
let _estFiltro = { search: '', cat: '', status: 'all' };

function renderEstoque() {
  const insumos = items.filter(i => !i.isProd);
  const cats    = [...new Set(insumos.map(i => i.cat))].sort();

  // Popula categoria
  const catEl = document.getElementById('estCatFil');
  if (catEl) {
    const cur = catEl.value;
    catEl.innerHTML = '<option value="">Todas categorias</option>' +
      cats.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  }

  _renderEstoqueTabela(insumos);
  _renderCarrinhoSumario();
  _renderEstKpis(insumos);
  updatePrepBadge();
}

function _renderEstKpis(insumos) {
  const crit  = insumos.filter(i => gst(i) === 'crit').length;
  const warn  = insumos.filter(i => gst(i) === 'warn').length;
  const ok    = insumos.filter(i => gst(i) === 'ok').length;
  const total = insumos.reduce((s,i) => s + gneed(i)*i.cost, 0);

  const el = document.getElementById('estKpis');
  if (!el) return;
  el.innerHTML = `
    <div class="kpi" onclick="setEstFiltro('crit')" style="cursor:pointer">
      <div class="kpi-v" style="color:var(--red)">${crit}</div>
      <div class="kpi-l">Críticos</div>
    </div>
    <div class="kpi" onclick="setEstFiltro('warn')" style="cursor:pointer">
      <div class="kpi-v" style="color:var(--yellow)">${warn}</div>
      <div class="kpi-l">Baixo</div>
    </div>
    <div class="kpi" onclick="setEstFiltro('ok')" style="cursor:pointer">
      <div class="kpi-v" style="color:var(--green)">${ok}</div>
      <div class="kpi-l">OK</div>
    </div>
`;
}

function _renderEstoqueTabela(insumos) {
  const q    = _estFiltro.search.toLowerCase();
  const cat  = _estFiltro.cat;
  const st   = _estFiltro.status;

  let filt = insumos.filter(i => {
    if (cat && i.cat !== cat) return false;
    if (q && !i.name.toLowerCase().includes(q)) return false;
    if (st === 'crit') return gst(i) === 'crit';
    if (st === 'warn') return gst(i) === 'warn';
    if (st === 'ok')   return gst(i) === 'ok';
    if (st === 'need') return gneed(i) > 0;
    return true;
  }).sort((a,b) => {
    const order = {crit:0, warn:1, ok:2};
    return (order[gst(a)]||2) - (order[gst(b)]||2) || a.name.localeCompare(b.name);
  });

  // Agrupar por categoria
  const byCat = {};
  filt.forEach(i => {
    if (!byCat[i.cat]) byCat[i.cat] = [];
    byCat[i.cat].push(i);
  });

  const tbody = document.getElementById('estTableBody');
  if (!tbody) return;

  if (!filt.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">Nenhum item encontrado</td></tr>`;
    return;
  }

  const stColors = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
  const stLabels = { crit:'CRÍTICO', warn:'BAIXO', ok:'OK' };
  // Ajuste 3: cor de fundo da linha por status quando filtro = todos
  const rowBg = {
    crit: 'background:#FFF1F1',
    warn: 'background:#FFFBEB',
    ok:   'background:var(--surface)',
  };

  tbody.innerHTML = Object.entries(byCat).map(([cat, catItems]) => {
    // Ajuste 1: cabeçalho de categoria com visual destacado
    return `<tr>
      <td colspan="8" style="padding:10px 16px 6px;background:var(--surface2);border-top:2px solid var(--border);border-bottom:1px solid var(--border)">
        <span style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--purple)">${cat}</span>
      </td>
    </tr>` + catItems.map((i, rowIdx) => {
      const st     = gst(i);
      const need   = gneed(i);
      const pct    = i.ideal > 0 ? Math.min(100, Math.round(i.qty / i.ideal * 100)) : 0;
      const inCart = _carrinho.find(c => c.itemId === i.id);
      // Ajuste 3: fundo colorido por status
      const bg = rowBg[st] || 'background:var(--surface)';
      // Ajuste 1: linhas alternadas dentro da categoria ficam ligeiramente diferentes
      const altBg = rowIdx % 2 === 0 ? bg : bg.replace('background:', 'background:') ;

      return `<tr id="est-row-${i.id}" style="${bg};border-bottom:1px solid var(--border)">
        <td style="padding:10px 14px">
          <div style="font-size:.83rem;font-weight:600">${i.name}</div>
          ${i.brands?.length ? `<div style="font-size:.65rem;color:var(--muted)">${i.brands.slice(0,2).join(' · ')}</div>` : ''}
          ${i.code ? `<div style="font-size:.6rem;color:var(--muted)">#${i.code}</div>` : ''}
        </td>
        <td class="c" style="font-size:.78rem">${i.unit}</td>
        <td class="c">
          <input type="number" value="${i.qty}" min="0" step="0.001"
            style="width:70px;padding:5px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:.78rem;font-family:monospace;text-align:center"
            onchange="onQty(${i.id}, this)" oninput="onQty(${i.id}, this)">
        </td>
        <td class="c" style="font-size:.75rem;color:var(--muted)">${i.min}</td>
        <td class="c" style="font-size:.75rem;color:var(--muted)">${i.ideal}</td>
        <td class="c">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:60px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${stColors[st]};border-radius:3px;transition:width .3s"></div>
            </div>
            <span style="font-size:.65rem;color:${stColors[st]};font-weight:700;min-width:44px">${pct}%</span>
          </div>
        </td>
        <td class="c">
          <span style="padding:3px 8px;border-radius:10px;font-size:.65rem;font-weight:700;background:${stColors[st]}22;color:${stColors[st]}">${stLabels[st]}</span>
        </td>
        <td class="c" style="min-width:160px">
          <div style="display:flex;align-items:center;gap:6px;justify-content:center">
            ${inCart ? `
              <div style="display:flex;align-items:center;gap:4px;background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:4px 8px">
                <button onclick="ajustarCarrinho(${i.id}, -1)" style="width:22px;height:22px;border-radius:50%;border:none;background:var(--purple);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">−</button>
                <input type="number" value="${inCart.qty}" min="0.001" step="0.001"
                  style="width:58px;border:none;background:transparent;font-size:.84rem;font-weight:800;text-align:center;color:var(--purple);font-family:monospace"
                  onchange="setCarrinhoQty(${i.id}, this.value)">
                <span style="font-size:.68rem;color:var(--purple);font-weight:600">${i.unit}</span>
                <button onclick="ajustarCarrinho(${i.id}, 1)" style="width:22px;height:22px;border-radius:50%;border:none;background:var(--purple);color:#fff;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">+</button>
                <button onclick="removerCarrinho(${i.id})" style="width:22px;height:22px;border-radius:50%;border:none;background:var(--red-light);color:var(--red);font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
              </div>
            ` : `
              <div style="display:flex;align-items:center;gap:8px">
                <div style="text-align:right">
                  <div style="font-size:1rem;font-weight:800;color:var(--purple);font-family:monospace;line-height:1">${fmt(need > 0 ? need : gneed(i) || 0)}</div>
                  <div style="font-size:.62rem;color:var(--muted);font-weight:500">${i.unit} sugerido</div>
                </div>
                <button onclick="addCarrinho(${i.id})"
                  title="Adicionar ao carrinho"
                  style="width:32px;height:32px;border-radius:50%;border:none;background:var(--purple);color:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(107,33,212,.3)">+</button>
              </div>
            `}
          </div>
        </td>
      </tr>`;
    }).join('');
  }).join('');

  // Badge sidebar
  const badge = document.getElementById('badge-estoque');
  const crit  = insumos.filter(i => gst(i) === 'crit').length;
  if (badge) { badge.textContent = crit || ''; badge.style.display = crit > 0 ? 'inline-flex' : 'none'; }
}

// ── Filtros ──
function setEstFiltro(status) {
  _estFiltro.status = _estFiltro.status === status ? 'all' : status;
  renderEstoque();
}

function setEstSearch(val) { _estFiltro.search = val; _renderEstoqueTabela(items.filter(i=>!i.isProd)); }
function setEstCat(val)    { _estFiltro.cat    = val; _renderEstoqueTabela(items.filter(i=>!i.isProd)); }

// ── Edição inline ──
function onQty(id, inp) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const v = parseFloat(inp.value);
  if (isNaN(v) || v < 0) return;
  item.qty = parseFloat(v.toFixed(3));
  changedIds.add(id);
  document.getElementById('saveStockBtn')?.classList.toggle('visible', changedIds.size > 0);
  // Atualiza barra de progresso inline
  const row = document.getElementById(`est-row-${id}`);
  if (row) {
    const st    = gst(item);
    const pct   = item.ideal > 0 ? Math.min(100, Math.round(item.qty / item.ideal * 100)) : 0;
    const stColors = { crit:'var(--red)', warn:'var(--yellow)', ok:'var(--green)' };
    const barEl = row.querySelector('[style*="height:100%"]');
    const pctEl = row.querySelector('[style*="65rem;color:"]');
    const badgeEl = row.querySelector('[style*="65rem;font-weight:700"]');
    if (barEl) { barEl.style.width = pct + '%'; barEl.style.background = stColors[st]; }
    if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.color = stColors[st]; }
    if (badgeEl) { badgeEl.textContent = {crit:'CRÍTICO',warn:'BAIXO',ok:'OK'}[st]; badgeEl.style.color = stColors[st]; }
  }
}

function saveStock() {
  saveI();
  changedIds.clear();
  document.getElementById('saveStockBtn')?.classList.remove('visible');
  toast('✅ Estoque salvo!');
  renderDashboard();
}

// ── CARRINHO ──
function addCarrinho(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;
  const need = gneed(item);
  if (_carrinho.find(c => c.itemId === itemId)) return;
  _carrinho.push({ itemId, qty: parseFloat(need.toFixed(3)), qtdSugerida: need, origem: 'estoque' });
  saveCarrinho();
  _renderEstoqueTabela(items.filter(i => !i.isProd));
  _renderCarrinhoSumario();
}

function removerCarrinho(itemId) {
  _carrinho = _carrinho.filter(c => c.itemId !== itemId);
  saveCarrinho();
  _renderEstoqueTabela(items.filter(i => !i.isProd));
  _renderCarrinhoSumario();
}

function ajustarCarrinho(itemId, delta) {
  const ci   = _carrinho.find(c => c.itemId === itemId);
  const item = items.find(i => i.id === itemId);
  if (!ci || !item) return;
  ci.qty = Math.max(0.001, parseFloat((ci.qty + delta).toFixed(3)));
  saveCarrinho();
  _renderEstoqueTabela(items.filter(i => !i.isProd));
  _renderCarrinhoSumario();
}

function setCarrinhoQty(itemId, val) {
  const ci = _carrinho.find(c => c.itemId === itemId);
  if (!ci) return;
  const v = parseFloat(val);
  if (!isNaN(v) && v > 0) { ci.qty = parseFloat(v.toFixed(3)); saveCarrinho(); }
  _renderCarrinhoSumario();
}

function limparCarrinho() {
  if (!_carrinho.length) return;
  if (!confirm('Limpar o carrinho?')) return;
  _carrinho = [];
  saveCarrinho();
  renderEstoque();
}

function _renderCarrinhoSumario() {
  const el = document.getElementById('carrinhoSumario');
  if (!el) return;

  if (!_carrinho.length) {
    el.innerHTML = `<div style="font-size:.8rem;color:var(--muted);text-align:center;padding:16px">Carrinho vazio.<br>Adicione itens acima.</div>`;
    return;
  }

  const total = _carrinho.reduce((s, ci) => {
    const item = items.find(i => i.id === ci.itemId);
    return s + ci.qty * (item?.cost || 0);
  }, 0);

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;margin-bottom:10px">
      ${_carrinho.map(ci => {
        const item = items.find(i => i.id === ci.itemId);
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r6)">
          <div style="flex:1;font-size:.76rem;font-weight:600">${item?.name || '?'}</div>
          <div style="font-size:.72rem;font-family:monospace;color:var(--purple)">${fmt(ci.qty)} ${item?.unit}</div>
          <button onclick="removerCarrinho(${ci.itemId})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:2px 4px">✕</button>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1.5px solid var(--border);margin-bottom:8px">
      <span style="font-size:.75rem;font-weight:600;color:var(--text2)">${_carrinho.length} itens</span>
      <span style="font-size:.88rem;font-weight:800;color:var(--purple)">R$ ${fmt(total)}</span>
    </div>
    <button onclick="gerarListaCompras()" style="width:100%;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:var(--r8);font-size:.82rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
      📋 Gerar Lista de Compras
    </button>
    <button onclick="limparCarrinho()" style="width:100%;padding:7px;background:none;color:var(--muted);border:1px solid var(--border);border-radius:var(--r8);font-size:.72rem;cursor:pointer;margin-top:6px">
      🗑 Limpar carrinho
    </button>`;
}

function gerarListaCompras() {
  if (!_carrinho.length) { toast('Carrinho vazio', 'err'); return; }
  const lista = novaLista(_carrinho);
  _carrinho   = [];
  saveCarrinho();
  toast(`✅ Lista ${lista.codigo} criada!`);
  renderEstoque();
  goModule('compras');
}

// ── CSV Import ──
function openImportModal() {
  document.getElementById('ovImport').classList.add('open');
}

function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) parseCSV(file);
}

function handleFile(inp) { if (inp.files[0]) parseCSV(inp.files[0]); }

function parseCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast('CSV inválido', 'err'); return; }

    const header = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const codeIdx = header.findIndex(h => h.includes('código') || h.includes('codigo') || h === 'code');
    const qtyIdx  = header.findIndex(h => h.includes('quant') || h.includes('atual') || h === 'qty');
    const nameIdx = header.findIndex(h => h.includes('nome') || h.includes('produto') || h === 'name');

    if (codeIdx === -1 && nameIdx === -1) { toast('CSV sem coluna de código ou nome', 'err'); return; }

    importData = [];
    lines.slice(1).forEach(line => {
      const cols = line.split(';').map(c => c.trim().replace(/"/g, ''));
      const code = codeIdx >= 0 ? cols[codeIdx] : '';
      const name = nameIdx >= 0 ? cols[nameIdx] : '';
      const qty  = qtyIdx  >= 0 ? parseFloat(cols[qtyIdx]?.replace(',', '.')) : NaN;
      const item = items.find(i => (code && i.code === code) || (name && i.name.toLowerCase() === name.toLowerCase()));
      if (item && !isNaN(qty)) {
        importData.push({ id: item.id, name: item.name, oldQty: item.qty, newQty: parseFloat(qty.toFixed(3)) });
      }
    });

    const prev = document.getElementById('importPreview');
    if (!prev) return;
    if (!importData.length) { prev.innerHTML = '<div style="color:var(--red)">Nenhum item correspondente encontrado.</div>'; return; }
    prev.innerHTML = `
      <div style="font-size:.75rem;font-weight:600;margin-bottom:8px">${importData.length} itens encontrados:</div>
      <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
        ${importData.map(d => `
          <div style="display:flex;justify-content:space-between;padding:5px 8px;background:var(--surface);border-radius:var(--r6);font-size:.73rem">
            <span>${d.name}</span>
            <span style="font-family:monospace">${d.oldQty} → <strong style="color:var(--purple)">${d.newQty}</strong></span>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" style="margin-top:12px;width:100%" onclick="confirmImport()">✅ Confirmar importação</button>`;
  };
  reader.readAsText(file, 'latin1');
}

function confirmImport() {
  importData.forEach(d => {
    const item = items.find(i => i.id === d.id);
    if (item) item.qty = d.newQty;
  });
  saveI();
  closeModal('ovImport');
  toast(`✅ ${importData.length} itens atualizados!`);
  renderEstoque();
  renderDashboard();
  importData = [];
}

// ── Compat. legado ──
function goToCompras()   { if (_carrinho.length) gerarListaCompras(); else goModule('compras'); }
function iniciarCompras(){ goModule('compras'); }
function updateEstSelCount() {}
function selectEstByStatus() {}
function toggleEstAll()  {}

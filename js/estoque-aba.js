/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-aba.js — Página do Estoque com abas no topo (Estoque · Contagem)
 *
 * Teste do padrão "filhos saem do sidebar e viram abas no topo da página mãe".
 * Aba Estoque: saldo por item e local, calculado por js/estoque-saldo.js.
 * A aba Contagem ainda mostra o fluxo antigo até a etapa 4 dos ciclos.
 */

const _EST_ABAS = [
  { id: 'estoque',   icon: 'package',        label: 'Estoque'  },
  { id: 'contagens', icon: 'clipboard-list', label: 'Contagem' },
];

let _estFil = { local: '', q: '', cat: '', tipo: '', abaixo: false, zerados: false, sort: 'nome', dir: 1 };

function _estTopTabsHtml() {
  return `<div style="display:flex;gap:2px;border-bottom:1.5px solid var(--border);margin-bottom:20px">
    ${_EST_ABAS.map(a => {
      const on = _estCpAba === a.id;
      return `<button onclick="_estSetAba('${a.id}')"
        style="display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border:none;background:none;cursor:pointer;font-family:inherit;
        font-size:var(--text-md);font-weight:${on ? 700 : 500};color:${on ? 'var(--purple)' : 'var(--text2)'};
        border-bottom:2.5px solid ${on ? 'var(--purple)' : 'transparent'};margin-bottom:-1.5px">
        ${lc(a.icon, 15, 'currentColor')} ${a.label}</button>`;
    }).join('')}
  </div>`;
}

function _estSetAba(aba) {
  _estCpAba = aba;
  _renderCpEstoque();
}

// ── Formatação ─────────────────────────────────────────────────
const _estQ = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const _estR = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _estData = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const _estEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Aba Estoque ────────────────────────────────────────────────

async function estRenderAbaEstoque(forcar = false) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  if (!_estSaldosCache || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">
      ${lc('refresh-cw', 16, 'currentColor')} Calculando saldos…</div>`;
  }
  let dados;
  try {
    dados = await estSaldos(forcar);
  } catch (e) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:var(--text-md)">
      Não consegui calcular o estoque: ${_estEsc(e.message)}<br>
      <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="estRenderAbaEstoque(true)">Tentar de novo</button></div>`;
    return;
  }
  if (!document.getElementById('estAbaBody')) return; // usuário saiu da aba
  _estRenderAbaEstoqueConteudo(dados);
}

// Saldo da linha conforme o local filtrado
function _estLinhaSaldo(r, local) {
  if (!local) return r.total;
  return r.porLocal[local]?.saldo ?? 0;
}

function _estStatus(r, saldo, local) {
  if (saldo < -0.0005) return { id: 'negativo', label: 'Negativo',         cls: 'b-red' };
  if (Math.abs(saldo) <= 0.0005) return { id: 'zerado', label: 'Zerado',   cls: 'b-gray' };
  if (!local && r.item.min > 0 && saldo < r.item.min) return { id: 'abaixo', label: 'Abaixo do mínimo', cls: 'b-orange' };
  return { id: 'ok', label: 'OK', cls: 'b-green' };
}

function _estRenderAbaEstoqueConteudo(dados) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  const f = _estFil;
  const locais = estLocaisEstoque();
  if (f.local && !locais.some(l => l.id === f.local)) f.local = '';
  const debAuto = estDebitoAutoMapa();

  const todas = [...dados.porItem.values()];
  // ── Cards (sempre sobre o estoque inteiro, não sobre o filtro) ──
  const valorItem = r => Math.max(r.total, 0) * (r.item.cost || 0);
  const valorTotal = todas.reduce((s, r) => s + valorItem(r), 0);
  const nIns  = todas.filter(r => !r.item.isProd).length;
  const nPrep = todas.filter(r => r.item.isProd).length;
  const nSemContagem = todas.filter(r => r.semContagem).length;
  const porCat = {};
  todas.forEach(r => { const c = r.item.cat || 'Outros'; porCat[c] = (porCat[c] || 0) + valorItem(r); });
  const topCats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ── Filtro ──
  const q = f.q.trim().toLowerCase();
  let linhas = todas
    .filter(r => !f.local || estLocaisDoItem(r.item).includes(f.local))
    .filter(r => !q || r.item.name.toLowerCase().includes(q) || (r.item.cat || '').toLowerCase().includes(q))
    .filter(r => !f.cat || (r.item.cat || 'Outros') === f.cat)
    .filter(r => !f.tipo || estTipoItem(r.item) === f.tipo)
    .map(r => { const saldo = _estLinhaSaldo(r, f.local); return { r, saldo, st: _estStatus(r, saldo, f.local) }; })
    .filter(x => !f.abaixo  || x.st.id === 'abaixo' || x.st.id === 'negativo')
    .filter(x => !f.zerados || x.st.id === 'zerado');

  const chave = {
    nome:   x => x.r.item.name.toLowerCase(),
    cat:    x => (x.r.item.cat || '').toLowerCase(),
    custo:  x => x.r.item.cost || 0,
    min:    x => x.r.item.min || 0,
    saldo:  x => x.saldo,
    valor:  x => Math.max(x.saldo, 0) * (x.r.item.cost || 0),
    status: x => ({ negativo: 0, zerado: 1, abaixo: 2, ok: 3 })[x.st.id],
  }[f.sort] || (x => x.r.item.name.toLowerCase());
  linhas.sort((a, b) => { const A = chave(a), B = chave(b); return (A < B ? -1 : A > B ? 1 : 0) * f.dir; });

  const nAbaixo  = todas.filter(r => _estStatus(r, r.total, '').id === 'abaixo' || r.total < -0.0005).length;
  const nZerados = todas.filter(r => _estStatus(r, r.total, '').id === 'zerado').length;
  const cats = [...new Set(todas.map(r => r.item.cat || 'Outros'))].sort();

  const card = (titulo, icone, corpo) => `
    <div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:18px 20px;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${titulo}</span>
        <span style="width:32px;height:32px;border-radius:var(--r8);background:var(--purple-xlight);display:flex;align-items:center;justify-content:center">${lc(icone, 16, 'var(--purple)')}</span>
      </div>${corpo}</div>`;

  const chip = (on, onclick, txt, cor = 'var(--purple)', bg = 'var(--purple-xlight)') => `<button onclick="${onclick}"
    style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;
    border:1.5px solid ${on ? cor : 'var(--border)'};background:${on ? bg : 'var(--card-bg)'};color:${on ? cor : 'var(--text2)'}">${txt}</button>`;

  const th = (id, txt, align = 'left') => {
    const on = f.sort === id;
    return `<th onclick="_estOrdenar('${id}')" style="text-align:${align};padding:11px 14px;font-size:var(--text-xs);font-weight:700;color:${on ? 'var(--purple)' : 'var(--muted)'};text-transform:uppercase;letter-spacing:.04em;cursor:pointer;white-space:nowrap;user-select:none">
      ${txt}${on ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:18px">
      ${card('Valor total em estoque', 'dollar-sign', `
        <div style="font-size:var(--text-3xl);font-weight:800;color:var(--text);letter-spacing:-.5px">${_estR(valorTotal)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">Saldo × custo de referência de cada item</div>`)}
      ${card('Itens por tipo', 'layers', `
        <div style="display:flex;gap:22px;align-items:baseline">
          <div><span style="font-size:var(--text-2xl);font-weight:800">${nIns}</span> <span style="font-size:var(--text-sm);color:var(--text2)">insumos</span></div>
          <div><span style="font-size:var(--text-2xl);font-weight:800">${nPrep}</span> <span style="font-size:var(--text-sm);color:var(--text2)">processados</span></div>
        </div>
        ${nSemContagem ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:6px">${nSemContagem} ainda sem contagem de ciclo — mostrando o saldo antigo</div>` : ''}`)}
      ${card('Top categorias', 'bar-chart-2', topCats.length ? topCats.map(([c, v]) => `
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:var(--text-sm);padding:2px 0">
          <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_estEsc(c)}</span>
          <strong style="white-space:nowrap">${_estR(v)}</strong></div>`).join('') : `<div style="color:var(--muted);font-size:var(--text-sm)">Sem valor em estoque</div>`)}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      ${chip(!f.local, `_estFil.local='';_estRerender()`, 'Todos os locais')}
      ${locais.map(l => chip(f.local === l.id, `_estFil.local='${l.id}';_estRerender()`, _estEsc(l.label))).join('')}
      <button class="btn btn-ghost btn-sm" style="color:var(--muted)" onclick="goModule('configuracoes');setCfgTab('estoque')">${lc('settings', 13, 'currentColor')} Locais</button>
    </div>

    <div class="card" style="margin-bottom:0">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 16px;border-bottom:1.5px solid var(--border)">
        <div style="font-size:var(--text-lg);font-weight:800;margin-right:8px">Produtos em estoque</div>
        <input class="inp" placeholder="Buscar produto…" value="${_estEsc(f.q)}" style="flex:1;min-width:200px;max-width:340px;font-size:var(--text-md)"
          oninput="_estFil.q=this.value;clearTimeout(window._estQT);window._estQT=setTimeout(_estRerender,180)" id="estBusca">
        <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_estFil.cat=this.value;_estRerender()">
          <option value="">Todas as categorias</option>
          ${cats.map(c => `<option value="${_estEsc(c)}"${f.cat === c ? ' selected' : ''}>${_estEsc(c)}</option>`).join('')}
        </select>
        <select class="inp" style="width:auto;font-size:var(--text-md)" onchange="_estFil.tipo=this.value;_estRerender()">
          <option value="">Insumos e processados</option>
          <option value="insumo"${f.tipo === 'insumo' ? ' selected' : ''}>Só insumos</option>
          <option value="preparado"${f.tipo === 'preparado' ? ' selected' : ''}>Só processados</option>
        </select>
        ${chip(f.abaixo,  `_estFil.abaixo=!_estFil.abaixo;_estFil.zerados=false;_estRerender()`, `${lc('alert-triangle', 13, 'currentColor')} Abaixo do mínimo (${nAbaixo})`, 'var(--orange-dark)', 'var(--orange-light)')}
        ${chip(f.zerados, `_estFil.zerados=!_estFil.zerados;_estFil.abaixo=false;_estRerender()`, `Zerados (${nZerados})`, 'var(--text)', 'var(--surface2)')}
        <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="estRenderAbaEstoque(true)" title="Recalcular com os dados mais recentes">
          ${lc('refresh-cw', 13, 'currentColor')} Atualizar</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
          <thead style="background:var(--surface2)"><tr>
            ${th('nome', 'Produto')}${th('cat', 'Categoria')}
            ${th('custo', 'Custo', 'right')}<th style="text-align:right;padding:11px 14px;font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">Últ. compra</th>
            ${th('min', 'Mínimo', 'right')}${th('saldo', f.local ? 'Saldo no local' : 'Estoque atual', 'right')}
            ${th('valor', 'Valor', 'right')}${th('status', 'Status')}
          </tr></thead>
          <tbody>
            ${linhas.length ? linhas.map(({ r, saldo, st }) => {
              const it = r.item;
              const ult = estUltimoPreco(it.id);
              const sub = r.semContagem ? `<span style="color:var(--orange-dark)">sem contagem</span>`
                        : (() => { const d = Object.values(r.porLocal).map(p => p.baseData).filter(Boolean).sort((a, b) => _estMs(a) - _estMs(b)).pop(); return d ? `contado ${_estData(d)}` : ''; })();
              return `<tr onclick="estAbrirDetalheItem(${it.id})" style="border-top:1px solid var(--border);cursor:pointer"
                  onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                <td style="padding:12px 14px">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-weight:600">${_estEsc(it.name)}</span>
                    ${it.isProd ? `<span class="badge b-orange" style="font-size:var(--text-2xs)">Processado</span>` : ''}
                    ${debAuto.has(it.id) ? `<span title="Débito automático pela ficha técnica" style="line-height:0">${lc('zap', 12, 'var(--green)')}</span>` : ''}
                  </div>
                  ${!f.local && estLocaisDoItem(it)[0] === EST_SEM_LOCAL ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:2px">sem local definido</div>` : ''}
                </td>
                <td style="padding:12px 14px;color:var(--text2);font-size:var(--text-sm)">${_estEsc(it.cat || '—')}</td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap">${it.cost ? _estR(it.cost) : '—'}</td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap;color:var(--text2)">${ult ? _estR(ult.precoUnit) : '—'}</td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap;color:var(--text2)">${it.min ? `${_estQ(it.min)} ${_estEsc(it.unit)}` : '—'}</td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap">
                  <div style="font-weight:700;color:${saldo < -0.0005 ? 'var(--red)' : 'var(--text)'}">${_estQ(saldo)} ${_estEsc(it.unit)}</div>
                  <div style="font-size:var(--text-xs);color:var(--muted)">${sub}</div></td>
                <td style="padding:12px 14px;text-align:right;white-space:nowrap">${_estR(Math.max(saldo, 0) * (it.cost || 0))}</td>
                <td style="padding:12px 14px"><span class="badge ${st.cls}">${st.label}</span></td>
              </tr>`;
            }).join('') : `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted)">Nenhum item com esses filtros</td></tr>`}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 16px;border-top:1.5px solid var(--border);font-size:var(--text-xs);color:var(--muted)">
        ${linhas.length} de ${todas.length} itens · calculado às ${new Date(dados.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>`;

  // Mantém o foco da busca depois do re-render
  if (document.activeElement?.id !== 'estBusca' && window._estBuscaFocada) {
    const b = document.getElementById('estBusca');
    if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
  }
}

function _estRerender() {
  window._estBuscaFocada = document.activeElement?.id === 'estBusca';
  if (_estSaldosCache) _estRenderAbaEstoqueConteudo(_estSaldosCache);
}

function _estOrdenar(col) {
  if (_estFil.sort === col) _estFil.dir *= -1;
  else { _estFil.sort = col; _estFil.dir = ['saldo', 'valor', 'custo', 'min'].includes(col) ? -1 : 1; }
  _estRerender();
}

// ── Detalhe do item: de onde vem o saldo ───────────────────────

function estAbrirDetalheItem(itemId) {
  const r = _estSaldosCache?.porItem.get(itemId);
  if (!r) return;
  const it = r.item;
  const u  = _estEsc(it.unit);
  const origens = estDebitoAutoMapa().get(it.id) || [];
  const sinal = n => n > 0.0005 ? `+${_estQ(n)}` : n < -0.0005 ? `−${_estQ(-n)}` : '—';
  const cor   = n => n > 0.0005 ? 'var(--green)' : n < -0.0005 ? 'var(--red)' : 'var(--muted)';

  const linhasLocal = Object.entries(r.porLocal).map(([loc, p]) => `
    <tr style="border-top:1px solid var(--border)">
      <td style="padding:10px 12px;font-weight:600">${loc === EST_SEM_LOCAL ? '<span style="color:var(--orange-dark)">Sem local</span>' : _estEsc(estLocalLabel(loc))}</td>
      <td style="padding:10px 12px;text-align:right;white-space:nowrap">${_estQ(p.base)}
        <div style="font-size:var(--text-2xs);color:var(--muted)">${p.baseData ? 'contagem ' + _estData(p.baseData) : r.semContagem && p.base ? 'saldo antigo' : 'sem contagem'}</div></td>
      <td style="padding:10px 12px;text-align:right;color:${cor(p.entradas)}">${sinal(p.entradas)}</td>
      <td style="padding:10px 12px;text-align:right;color:${cor(p.vendas)}">${sinal(p.vendas)}</td>
      <td style="padding:10px 12px;text-align:right;color:${cor(p.baixas)}">${sinal(p.baixas)}</td>
      <td style="padding:10px 12px;text-align:right;color:${cor(p.transferencias)}">${sinal(p.transferencias)}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:800;white-space:nowrap">${_estQ(p.saldo)} ${u}</td>
    </tr>`).join('');

  document.getElementById('ovEstItem')?.remove();
  const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'ovEstItem';
  ov.innerHTML = `<div class="modal" style="width:820px;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow-y:auto;padding:24px 26px" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px">
      <div>
        <div style="font-size:var(--text-xl);font-weight:800">${_estEsc(it.name)}</div>
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:2px">${_estEsc(it.cat || '')} · ${it.isProd ? 'Processado' : 'Insumo'} · custo ${it.cost ? _estR(it.cost) + '/' + u : '—'}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:var(--text-xs);color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">Estoque atual</div>
        <div style="font-size:var(--text-2xl);font-weight:800;color:${r.total < -0.0005 ? 'var(--red)' : 'var(--text)'}">${_estQ(r.total)} ${u}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;align-items:flex-start;padding:10px 14px;border-radius:var(--r8);background:${origens.length ? 'var(--green-light)' : 'var(--surface2)'};font-size:var(--text-sm);line-height:1.5;margin-bottom:14px">
      <span style="line-height:0;margin-top:2px">${lc('zap', 14, origens.length ? 'var(--green)' : 'var(--muted)')}</span>
      <div>${origens.length
        ? `<strong style="color:var(--green)">Débito automático</strong> — sai do saldo na venda de ${_estEsc(origens.slice(0, 6).join(', '))}${origens.length > 6 ? ` e mais ${origens.length - 6}` : ''}.`
        : `<strong>Sem débito automático</strong> — não está na ficha de nenhum produto vendido. Sai do saldo só na contagem ou por baixa.`}</div>
    </div>

    ${r.semContagem ? `<div style="display:flex;gap:8px;padding:10px 14px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm);line-height:1.5;margin-bottom:14px">
      ${lc('info', 14, 'currentColor')}<div>Este item ainda não passou por uma contagem de ciclo. O saldo mostrado é o antigo (importado do Cardápio Web), sem descontar vendas. A partir da primeira contagem, ele passa a ser calculado aqui.</div>
    </div>` : ''}

    <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2);margin-bottom:8px">De onde vem o saldo</div>
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>
          ${['Local', 'Base', 'Entradas', 'Vendas', 'Baixas', 'Transf.', 'Saldo'].map((h, i) =>
            `<th style="padding:9px 12px;text-align:${i ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${linhasLocal}</tbody>
      </table>
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px;line-height:1.5">
      Saldo = última contagem do local + entradas (compras, produção, manuais) − vendas automáticas − baixas ± transferências, tudo depois da contagem.
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
      <button class="btn btn-outline" onclick="${it.isProd ? `openEditPreparo(${it.id})` : `openEditItem(${it.id})`};document.getElementById('ovEstItem')?.remove()">${lc('edit-2', 13, 'currentColor')} Editar cadastro</button>
      <button class="btn btn-primary" onclick="this.closest('.overlay').remove()">Fechar</button>
    </div>
  </div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

/**
 * VTP Compras — Vai Ter Pizza!
 * cp-compras.js — Aba "Compras": visão geral do período, status do ciclo,
 * nova compra (Dados gerais → Itens → Revisão) e importação de nota fiscal
 * (XML da NF-e lido aqui; foto/PDF lido pela IA na função ler-nota).
 *
 * Toda compra salva entra no estoque na hora (movimentação Recebimento no
 * local de entrada de cada insumo) e atualiza o custo de referência do item.
 */

let _cpPer = cpSemana(0);           // { de, ate } em AAAA-MM-DD
let _cpComprasDados = null;
const CP_ORIGEM = {
  manual: { label: 'Manual',     cls: 'b-gray'   },
  xml:    { label: 'NF-e (XML)', cls: 'b-purple' },
  ia:     { label: 'Nota (IA)',  cls: 'b-purple' },
  pedido: { label: 'Pedido',     cls: 'b-green'  },
};

// ══════════════════════════════════════════════════════════════
// VISÃO GERAL
// ══════════════════════════════════════════════════════════════

async function cpRenderAbaCompras(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  const chave = _cpPer.de + '|' + _cpPer.ate;
  if (!_cpComprasDados || _cpComprasDados.chave !== chave || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando compras…</div>`;
    try {
      const [compras, listas, pedidos] = await Promise.all([
        cpSelect('cp_compras', q => q.select('*').is('excluido_em', null).gte('data_compra', _cpPer.de).lte('data_compra', _cpPer.ate).order('data_compra', { ascending: false })),
        cpSelect('cp_listas', q => q.select('id, status, semana_inicio').is('excluido_em', null).gte('semana_inicio', _cpPer.de).lte('semana_inicio', _cpPer.ate)),
        cpSelect('cp_pedidos', q => q.select('id, status, total_previsto, created_at').is('excluido_em', null).gte('created_at', _cpPer.de).lte('created_at', _cpPer.ate + 'T23:59:59')),
      ]);
      const ids = compras.map(c => c.id);
      const itens = ids.length ? await cpSelect('cp_compra_itens', q => q.select('compra_id').in('compra_id', ids)) : [];
      const nItens = {}; itens.forEach(i => { nItens[i.compra_id] = (nItens[i.compra_id] || 0) + 1; });
      _cpComprasDados = { chave, compras, listas, pedidos, nItens };
    } catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar as compras: ${_estEsc(e.message)}
        <div style="font-size:var(--text-sm);color:var(--muted);margin-top:6px">Se for a primeira vez, confira se a migração do módulo de compras foi rodada no Supabase.</div>
        <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaCompras(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cpAbaBody')) return;
  _cpRenderComprasConteudo();
}

function _cpMudarSemana(delta) {
  const seg = new Date(_cpPer.de + 'T12:00:00'); seg.setDate(seg.getDate() + delta * 7);
  const dom = new Date(seg); dom.setDate(dom.getDate() + 6);
  _cpPer = { de: cpIso(seg), ate: cpIso(dom) };
  cpRenderAbaCompras();
}

function _cpRenderComprasConteudo() {
  const el = document.getElementById('cpAbaBody');
  const { compras, listas, pedidos, nItens } = _cpComprasDados;
  const total = compras.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const ehSemanaAtual = _cpPer.de === cpSemana(0).de && _cpPer.ate === cpSemana(0).ate;
  const kpi = (t, v, sub) => `<div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:16px 18px">
    <div style="font-size:var(--text-sm);font-weight:700;color:var(--text2)">${t}</div>
    <div style="font-size:var(--text-2xl);font-weight:800;margin-top:4px">${v}</div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${sub}</div></div>`;

  // Status do ciclo (semana): listas → pedidos → recebidos
  const nL = st => listas.filter(l => l.status === st).length;
  const nP = st => pedidos.filter(p => st.includes(p.status)).length;
  const avulsas = compras.filter(c => c.origem !== 'pedido').length;
  const etapa = (icon, titulo, valor, sub) => `<div style="flex:1;min-width:150px;padding:12px 14px;border-radius:var(--r8);background:var(--surface2)">
    <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">${lc(icon, 13, 'currentColor')} ${titulo}</div>
    <div style="font-size:var(--text-xl);font-weight:800;margin-top:4px">${valor}</div>
    <div style="font-size:var(--text-xs);color:var(--muted)">${sub}</div></div>`;
  const seta = `<div style="display:flex;align-items:center;color:var(--muted)">${lc('chevron-right', 16, 'currentColor')}</div>`;

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:6px;border:1.5px solid var(--border);border-radius:var(--r8);padding:4px 6px;background:var(--card-bg)">
        <button class="btn btn-ghost btn-xs" onclick="_cpMudarSemana(-1)" title="Semana anterior">${lc('chevron-left', 14, 'currentColor')}</button>
        <input type="date" class="inp" value="${_cpPer.de}" style="width:auto;border:none;padding:4px" onchange="_cpPer.de=this.value;cpRenderAbaCompras()">
        <span style="color:var(--muted)">até</span>
        <input type="date" class="inp" value="${_cpPer.ate}" style="width:auto;border:none;padding:4px" onchange="_cpPer.ate=this.value;cpRenderAbaCompras()">
        <button class="btn btn-ghost btn-xs" onclick="_cpMudarSemana(1)" title="Próxima semana">${lc('chevron-right', 14, 'currentColor')}</button>
      </div>
      ${ehSemanaAtual ? `<span class="badge b-purple">Semana atual</span>` : `<button class="btn btn-ghost btn-sm" onclick="_cpPer=cpSemana(0);cpRenderAbaCompras()">Voltar para a semana atual</button>`}
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="cpImportarNota()">${lc('upload', 14, 'currentColor')} Importar nota (XML, foto ou PDF)</button>
        <button class="btn btn-primary btn-sm" onclick="cpNovaCompra()">${lc('plus', 14, '#fff')} Nova compra</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px">
      ${kpi('Total no período', _estR(total), `${cpDataBr(_cpPer.de)} a ${cpDataBr(_cpPer.ate)}`)}
      ${kpi('Compras registradas', compras.length, `${avulsas} avulsa(s) · ${compras.length - avulsas} de pedido`)}
      ${kpi('Ticket médio', _estR(compras.length ? total / compras.length : 0), 'por compra')}
    </div>

    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:10px">Status do ciclo de compras</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:stretch">
        ${etapa('clipboard-list', 'Listas', `${nL('aprovada') + nL('arquivada')}/${listas.length}`, `aprovadas · ${nL('aguardando')} aguardando`)}${seta}
        ${etapa('tag', 'Cotação', nP(['rascunho']), 'pedidos em rascunho')}${seta}
        ${etapa('send', 'Pedido solicitado', nP(['solicitado', 'parcial']), 'aguardando entrega')}${seta}
        ${etapa('check-circle', 'Recebidos', nP(['recebido']), `${_estR(compras.filter(c => c.origem === 'pedido').reduce((s, c) => s + (+c.total || 0), 0))}`)}
      </div>
    </div>

    <div class="card" style="margin-bottom:0">
      <div style="padding:14px 16px;border-bottom:1.5px solid var(--border);font-size:var(--text-lg);font-weight:800">Últimas compras</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>${['Data', 'Fornecedor', 'Nota', 'Origem', 'Itens', 'Total', ''].map((h, i) =>
          `<th style="padding:11px 14px;text-align:${i >= 4 ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}</tr></thead>
        <tbody>${compras.length ? compras.map(c => `<tr onclick="cpVerCompra('${c.id}')" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <td style="padding:11px 14px;white-space:nowrap">${cpDataBr(c.data_compra)}</td>
          <td style="padding:11px 14px;font-weight:600">${_estEsc(c.fornecedor_nome || '—')}</td>
          <td style="padding:11px 14px;color:var(--text2)">${_estEsc(c.numero_nota || '—')}${c.anexo_path ? ` ${lc('paperclip', 12, 'var(--muted)')}` : ''}</td>
          <td style="padding:11px 14px"><span class="badge ${CP_ORIGEM[c.origem]?.cls || 'b-gray'}">${CP_ORIGEM[c.origem]?.label || c.origem}</span></td>
          <td style="padding:11px 14px;text-align:right">${nItens[c.id] || 0}</td>
          <td style="padding:11px 14px;text-align:right;font-weight:700;white-space:nowrap">${_estR(c.total)}</td>
          <td style="padding:11px 14px;text-align:right">${lc('chevron-right', 14, 'var(--muted)')}</td></tr>`).join('')
          : `<tr><td colspan="7" style="padding:44px;text-align:center;color:var(--muted)">Nenhuma compra no período</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

// ── Detalhe / excluir ──────────────────────────────────────────

async function cpVerCompra(id) {
  const c = _cpComprasDados?.compras.find(x => x.id === id);
  if (!c) return;
  let itens = [];
  try { itens = await cpSelect('cp_compra_itens', q => q.select('*').eq('compra_id', id)); }
  catch (e) { return toast('Não consegui abrir a compra: ' + e.message, 'err'); }
  const url = cpUrlAnexo(c.anexo_path);
  _estModal('ovCpVer', 'Detalhes da compra', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 18px;font-size:var(--text-sm);margin-bottom:14px">
      <div><div style="color:var(--muted)">Data</div><strong>${cpDataBr(c.data_compra)}</strong></div>
      <div><div style="color:var(--muted)">Fornecedor</div><strong>${_estEsc(c.fornecedor_nome || '—')}</strong>${c.fornecedor_doc ? `<div style="color:var(--muted);font-size:var(--text-xs)">${_estEsc(c.fornecedor_doc)}</div>` : ''}</div>
      <div><div style="color:var(--muted)">Nota</div><strong>${_estEsc(c.numero_nota || '—')}</strong></div>
      <div><div style="color:var(--muted)">Origem</div><span class="badge ${CP_ORIGEM[c.origem]?.cls || 'b-gray'}">${CP_ORIGEM[c.origem]?.label || c.origem}</span></div>
      <div><div style="color:var(--muted)">Lançada por</div><strong>${_estEsc(c.criado_por)}</strong></div>
      ${url ? `<div><div style="color:var(--muted)">Anexo</div><a href="${url}" target="_blank" rel="noopener" style="color:var(--purple);font-weight:700">${lc('paperclip', 12, 'currentColor')} Abrir nota</a></div>` : ''}
    </div>
    ${c.obs ? `<div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:12px">${_estEsc(c.obs)}</div>` : ''}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${itens.map(i => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-top:1px solid var(--border);font-size:var(--text-sm)">
        <div><strong>${_estEsc(i.item_nome)}</strong><div style="color:var(--muted);font-size:var(--text-xs)">${_estQ(i.qtd)} ${_estEsc(i.unidade || '')} × ${_estR(i.preco_unit)}${i.desc_nota ? ` · na nota: ${_estEsc(i.desc_nota)}` : ''}</div></div>
        <strong style="white-space:nowrap">${_estR(i.total)}</strong></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:12px;background:var(--surface2);font-weight:800"><span>Total da compra</span><span>${_estR(c.total)}</span></div>
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:10px">Os itens entraram no estoque como Recebimento no dia da compra.</div>`,
    `cpExcluirCompra('${c.id}')`, 'Excluir compra', 620);
  const btn = document.getElementById('ovCpVer-salvar');
  if (btn) { btn.className = 'btn btn-outline'; btn.style.color = 'var(--danger-fg)'; }
}

function cpExcluirCompra(id) {
  const c = _cpComprasDados?.compras.find(x => x.id === id);
  vtpConfirm({
    title: 'Excluir esta compra?',
    message: `${c?.fornecedor_nome || ''} · ${_estR(c?.total)}. A entrada no estoque também é desfeita. Fica no histórico com o seu nome.`,
    confirmLabel: 'Excluir',
    onConfirm: async () => {
      try {
        const itens = await cpSelect('cp_compra_itens', q => q.select('id').eq('compra_id', id));
        const ids = itens.map(i => i.id);
        if (ids.length) {
          const movs = await cpSelect('est_movimentacoes', q => q.select('*').eq('ref_tipo', 'compra').in('ref_id', ids).is('excluido_em', null));
          await estExcluirMovs(movs);
        }
        await cpUpdate('cp_compras', id, { excluido_em: new Date().toISOString(), excluido_por: estUsuario() });
        _cpDesfazerPrecos(id);
        document.getElementById('ovCpVer')?.remove();
        toast('Compra excluída', 'ok');
        cpRenderAbaCompras(true);
      } catch (e) { toast('Não consegui excluir: ' + e.message, 'err'); }
    },
  });
}

// ══════════════════════════════════════════════════════════════
// NOVA COMPRA (Dados gerais → Itens → Revisão)
// ══════════════════════════════════════════════════════════════

let _cpNC = null;

function _cpNCVazio() {
  return { passo: 1, data: cpIso(new Date()), fornecedorId: null, fornecedorNome: '', fornecedorDoc: '', numero: '', chave: null,
           obs: '', origem: 'manual', arquivo: null, totalNota: null, itens: [] };
}

function cpNovaCompra(dados = null) {
  _cpNC = dados || _cpNCVazio();
  if (!_cpNC.itens.length) _cpNC.itens.push(_cpLinhaVazia());
  _estModal('ovCpNC', 'Nova compra', '', '_cpNCAvancar()', 'Próximo', 860);
  _cpNCRender();
}

const _cpLinhaVazia = () => ({ key: crypto.randomUUID(), item_id: null, qtd: null, preco_unit: null, total: null, fator: 1,
  desc_nota: null, cod_nota: null, qtd_nota: null, unid_nota: null, valor_nota: null, sugestao: false, memoria: false });

function _cpNCRender() {
  const body = document.getElementById('ovCpNC-body');
  if (!body || !_cpNC) return;
  const n = _cpNC;
  const passos = ['Dados gerais', 'Itens', 'Revisão'];
  const barra = `<div style="display:flex;gap:6px;margin-bottom:18px">${passos.map((p, i) => {
    const k = i + 1, on = n.passo === k, feito = n.passo > k;
    return `<div style="flex:1;display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:3px solid ${on || feito ? 'var(--purple)' : 'var(--border)'}">
      <span style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:800;background:${on || feito ? 'var(--purple)' : 'var(--surface2)'};color:${on || feito ? '#fff' : 'var(--muted)'}">${feito ? '✓' : k}</span>
      <span style="font-size:var(--text-sm);font-weight:${on ? 700 : 500};color:${on ? 'var(--text)' : 'var(--muted)'}">${p}</span></div>`;
  }).join('')}</div>`;
  body.innerHTML = barra + (n.passo === 1 ? _cpNCPasso1() : n.passo === 2 ? _cpNCPasso2() : _cpNCPasso3());

  const salvar = document.getElementById('ovCpNC-salvar');
  if (salvar) salvar.textContent = n.passo === 3 ? 'Salvar compra e dar entrada no estoque' : 'Próximo';
  const foot = salvar?.parentElement;
  if (foot && !document.getElementById('ovCpNC-voltar')) {
    const b = document.createElement('button');
    b.id = 'ovCpNC-voltar'; b.className = 'btn btn-ghost'; b.style.marginRight = 'auto'; b.textContent = '← Voltar';
    b.onclick = () => { _cpNCLer(); if (_cpNC.passo > 1) { _cpNC.passo--; _cpNCRender(); } };
    foot.insertBefore(b, foot.firstChild);
  }
  const voltar = document.getElementById('ovCpNC-voltar');
  if (voltar) voltar.style.visibility = n.passo > 1 ? 'visible' : 'hidden';
}

function _cpNCPasso1() {
  const n = _cpNC;
  const forns = (typeof suppliers !== 'undefined' ? suppliers : []).filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  return `
    ${n.origem !== 'manual' ? `<div style="display:flex;gap:8px;padding:10px 14px;border-radius:var(--r8);background:var(--purple-xlight);font-size:var(--text-sm);margin-bottom:14px">
      ${lc('file-text', 14, 'var(--purple)')}<div>Dados lidos da nota (${n.origem === 'xml' ? 'XML da NF-e' : 'IA'}). Confira antes de seguir.</div></div>` : ''}
    <div class="f2">
      ${_estCampo('Data da compra *', `<input class="inp" type="date" id="ncData" value="${n.data}">`)}
      ${_estCampo('Número da nota', `<input class="inp" id="ncNumero" value="${_estEsc(n.numero)}" placeholder="nº da nota ou cupom">`)}
    </div>
    <div class="f2">
      ${_estCampo('Fornecedor', `<select class="inp" id="ncForn" onchange="document.getElementById('ncFornOutroBox').style.display=this.value==='outro'?'':'none'">
        <option value="">— Selecionar —</option>
        ${forns.map(s => `<option value="${s.id}"${s.id === n.fornecedorId ? ' selected' : ''}>${_estEsc(s.name)}</option>`).join('')}
        <option value="outro"${!n.fornecedorId && n.fornecedorNome ? ' selected' : ''}>Outro (compra presencial, mercado…)</option>
      </select>`)}
      <div id="ncFornOutroBox" style="${!n.fornecedorId && n.fornecedorNome ? '' : 'display:none'}">
        ${_estCampo('Nome do local / fornecedor', `<input class="inp" id="ncFornNome" value="${_estEsc(!n.fornecedorId ? n.fornecedorNome : '')}" placeholder="ex: Assaí Atacadista">`)}
      </div>
    </div>
    ${n.fornecedorDoc ? `<div style="font-size:var(--text-xs);color:var(--muted);margin:-6px 0 10px">CNPJ da nota: ${_estEsc(n.fornecedorDoc)}</div>` : ''}
    ${_estCampo('Observações', `<textarea class="inp" id="ncObs" rows="2" placeholder="opcional">${_estEsc(n.obs)}</textarea>`)}
    ${_estCampo('Anexar nota (opcional)', `<input class="inp" type="file" id="ncArquivo" accept=".xml,.pdf,image/*" onchange="_cpNC.arquivo=this.files[0]||null">
      ${n.arquivo ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${lc('paperclip', 11, 'currentColor')} ${_estEsc(n.arquivo.name)} vai junto com a compra</div>` : ''}`)}`;
}

function _cpItemOpts(sel) {
  return _estOptsItens(i => true, sel);
}

function _cpNCPasso2() {
  const n = _cpNC;
  const temNota = n.itens.some(l => l.desc_nota);
  const soma = n.itens.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const linhas = n.itens.map((l, idx) => {
    const item = items.find(i => i.id === l.item_id);
    const un = item?.unit || '';
    return `<div style="border:1.5px solid ${l.item_id ? 'var(--border)' : 'var(--warning-bg)'};border-radius:var(--r8);padding:10px 12px;margin-bottom:8px;background:var(--card-bg)">
      ${l.desc_nota ? `<div style="display:flex;justify-content:space-between;gap:10px;font-size:var(--text-xs);color:var(--text2);margin-bottom:8px">
        <span>Na nota: <strong>${_estEsc(l.desc_nota)}</strong>${l.cod_nota ? ` · cód. ${_estEsc(l.cod_nota)}` : ''}</span>
        <span style="white-space:nowrap">${_estQ(l.qtd_nota)} ${_estEsc(l.unid_nota || '')} · ${_estR(l.valor_nota)}</span></div>` : ''}
      <div style="display:grid;grid-template-columns:minmax(220px,2.2fr) ${l.desc_nota ? 'minmax(130px,1fr) ' : ''}minmax(100px,.9fr) minmax(110px,1fr) minmax(110px,1fr) 32px;gap:8px;align-items:end">
        <div class="field" style="margin:0"><label>Insumo ${l.sugestao ? '<span style="color:var(--warning-fg);text-transform:none;letter-spacing:0">· sugestão, confira</span>' : l.memoria ? '<span style="color:var(--success-fg);text-transform:none;letter-spacing:0">· reconhecido</span>' : ''}</label>
          <select class="inp" onchange="_cpNCSetItem(${idx}, +this.value||null)">${_cpItemOpts(l.item_id)}</select></div>
        ${l.desc_nota ? `<div class="field" style="margin:0"><label style="text-transform:none;letter-spacing:0">1 ${_estEsc(l.unid_nota || 'un')} da nota =</label>
          <div style="display:flex;align-items:center;gap:4px"><input class="inp" type="number" min="0" step="0.001" value="${l.fator}" oninput="_cpNCSetFator(${idx}, this.value)"><span style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(un)}</span></div></div>` : ''}
        <div class="field" style="margin:0"><label>Qtd ${un ? `(${_estEsc(un)})` : ''}</label>
          <input class="inp" type="number" min="0" step="0.001" id="ncQ${idx}" value="${l.qtd ?? ''}" oninput="_cpNCSetCampo(${idx}, 'qtd', this.value)"></div>
        <div class="field" style="margin:0"><label>Preço / ${_estEsc(un || 'un')}</label>
          <input class="inp" type="number" min="0" step="0.01" id="ncP${idx}" value="${l.preco_unit ?? ''}" oninput="_cpNCSetCampo(${idx}, 'preco_unit', this.value)"></div>
        <div class="field" style="margin:0"><label>Total</label>
          <input class="inp" type="number" min="0" step="0.01" id="ncT${idx}" value="${l.total ?? ''}" oninput="_cpNCSetCampo(${idx}, 'total', this.value)"></div>
        <button class="btn btn-ghost btn-xs" title="Remover" onclick="_cpNC.itens.splice(${idx},1);_cpNCRender()" style="color:var(--danger-fg)">${lc('trash-2', 14, 'currentColor')}</button>
      </div></div>`;
  }).join('');
  return `
    ${temNota ? `<div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:10px;line-height:1.5">Ligue cada produto da nota a um insumo e confira a conversão (ex.: 1 CX = 12 UN). A VTP lembra dessa ligação para as próximas notas deste fornecedor.</div>` : ''}
    ${linhas}
    <button class="btn btn-outline btn-sm" onclick="_cpNC.itens.push(_cpLinhaVazia());_cpNCRender()">${lc('plus', 13, 'currentColor')} Adicionar item</button>
    <div style="display:flex;justify-content:flex-end;gap:18px;margin-top:12px;font-size:var(--text-md)">
      ${n.totalNota !== null ? `<span style="color:var(--muted)">Total da nota: <strong style="color:var(--text)">${_estR(n.totalNota)}</strong></span>` : ''}
      <span>Soma dos itens: <strong id="ncSoma">${_estR(soma)}</strong></span>
    </div>`;
}

function _cpNCSetItem(idx, itemId) {
  const l = _cpNC.itens[idx];
  l.item_id = itemId; l.sugestao = false; l.memoria = false;
  const item = items.find(i => i.id === itemId);
  if (item && l.desc_nota && l.fator === 1 && item.qtdEmb > 0 && l.unid_nota && _cwNorm(l.unid_nota) !== _cwNorm(item.unit)) l.fator = item.qtdEmb;
  _cpNCRecalcNota(l);
  if (item && !l.desc_nota && l.preco_unit === null && item.cost) { l.preco_unit = item.cost; if (l.qtd) l.total = _estRound(l.qtd * l.preco_unit); }
  _cpNCRender();
}

function _cpNCSetFator(idx, v) {
  const l = _cpNC.itens[idx];
  l.fator = parseFloat(v) || 1;
  _cpNCRecalcNota(l);
  ['Q', 'P'].forEach(k => { const el = document.getElementById('nc' + k + idx); if (el) el.value = k === 'Q' ? (l.qtd ?? '') : (l.preco_unit ?? ''); });
}

// Linha vinda de nota: qtd = qtd da nota × fator; preço = valor ÷ qtd
function _cpNCRecalcNota(l) {
  if (!l.desc_nota) return;
  if (l.qtd_nota > 0) l.qtd = _estRound(l.qtd_nota * (l.fator || 1));
  if (l.valor_nota !== null) l.total = Math.round(l.valor_nota * 100) / 100;
  if (l.qtd > 0 && l.total !== null) l.preco_unit = Math.round(l.total / l.qtd * 10000) / 10000;
}

function _cpNCSetCampo(idx, campo, v) {
  const l = _cpNC.itens[idx];
  l[campo] = v === '' ? null : parseFloat(v);
  if (campo === 'total' && l.qtd > 0 && l.total !== null) l.preco_unit = Math.round(l.total / l.qtd * 10000) / 10000;
  else if (l.qtd !== null && l.preco_unit !== null) l.total = Math.round(l.qtd * l.preco_unit * 100) / 100;
  const set = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = val ?? ''; };
  set('ncP' + idx, l.preco_unit); set('ncT' + idx, l.total);
  const soma = document.getElementById('ncSoma');
  if (soma) soma.textContent = _estR(_cpNC.itens.reduce((s, x) => s + (Number(x.total) || 0), 0));
}

function _cpNCPasso3() {
  const n = _cpNC;
  const validos = n.itens.filter(l => l.item_id && l.qtd > 0);
  const soma = validos.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const dif = n.totalNota !== null ? soma - n.totalNota : 0;
  const forn = n.fornecedorId ? cpFornecedor(n.fornecedorId)?.name : n.fornecedorNome;
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px 18px;font-size:var(--text-sm);margin-bottom:14px">
      <div><div style="color:var(--muted)">Data</div><strong>${cpDataBr(n.data)}</strong></div>
      <div><div style="color:var(--muted)">Fornecedor</div><strong>${_estEsc(forn || '—')}</strong></div>
      <div><div style="color:var(--muted)">Nota</div><strong>${_estEsc(n.numero || '—')}</strong></div>
      <div><div style="color:var(--muted)">Total</div><strong style="font-size:var(--text-lg)">${_estR(soma)}</strong></div>
    </div>
    ${Math.abs(dif) > 0.05 ? `<div style="padding:10px 14px;border-radius:var(--r8);background:var(--warning-bg);color:var(--warning-fg);font-size:var(--text-sm);margin-bottom:12px">
      A soma dos itens (${_estR(soma)}) está ${dif > 0 ? 'acima' : 'abaixo'} do total da nota (${_estR(n.totalNota)}) em ${_estR(Math.abs(dif))}. Pode ser desconto, frete ou item que ficou de fora.</div>` : ''}
    <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:6px">Vai entrar no estoque (${validos.length} itens)</div>
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${validos.map(l => { const it = items.find(i => i.id === l.item_id); const loc = estLocalEntrada(it); return `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-top:1px solid var(--border);font-size:var(--text-sm)">
          <div><strong>${_estEsc(it?.name)}</strong><div style="font-size:var(--text-xs);color:var(--muted)">entrada em ${_estEsc(estLocalLabel(loc))} · custo passa a ${_estR(l.preco_unit)}/${_estEsc(it?.unit || '')}</div></div>
          <div style="text-align:right;white-space:nowrap"><span style="color:var(--success-fg);font-weight:700">+${_estQ(l.qtd)} ${_estEsc(it?.unit || '')}</span><div style="font-size:var(--text-xs);color:var(--muted)">${_estR(l.total)}</div></div></div>`; }).join('')}
    </div>
    ${n.itens.length > validos.length ? `<div style="font-size:var(--text-xs);color:var(--warning-fg);margin-top:8px">${n.itens.length - validos.length} linha(s) sem insumo ou sem quantidade ficam de fora.</div>` : ''}`;
}

function _cpNCLer() {
  const n = _cpNC;
  if (n.passo === 1) {
    n.data = document.getElementById('ncData')?.value || n.data;
    n.numero = document.getElementById('ncNumero')?.value.trim() || '';
    n.obs = document.getElementById('ncObs')?.value.trim() || '';
    const f = document.getElementById('ncForn')?.value || '';
    if (f === 'outro') { n.fornecedorId = null; n.fornecedorNome = document.getElementById('ncFornNome')?.value.trim() || ''; }
    else if (f) { n.fornecedorId = +f; n.fornecedorNome = cpFornecedor(+f)?.name || ''; }
    else { n.fornecedorId = null; n.fornecedorNome = ''; }
  }
}

function _cpNCAvancar() {
  _cpNCLer();
  const n = _cpNC;
  if (n.passo === 1) {
    if (!n.data) return toast('Informe a data', 'err');
    if (!n.fornecedorId && !n.fornecedorNome) return toast('Escolha o fornecedor ou digite onde comprou', 'err');
    n.passo = 2; return _cpNCRender();
  }
  if (n.passo === 2) {
    if (!n.itens.some(l => l.item_id && l.qtd > 0)) return toast('Adicione pelo menos um item com insumo e quantidade', 'err');
    n.passo = 3; return _cpNCRender();
  }
  _cpNCSalvar();
}

async function _cpNCSalvar() {
  const n = _cpNC;
  const validos = n.itens.filter(l => l.item_id && l.qtd > 0);
  const btn = document.getElementById('ovCpNC-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    if (n.chave) {
      const { data: dup } = await _cpSb().from('cp_compras').select('id, data_compra').eq('chave_nfe', n.chave).is('excluido_em', null).limit(1);
      if (dup?.length) throw new Error(`esta nota já foi lançada em ${cpDataBr(dup[0].data_compra)}`);
    }
    const user = estUsuario();
    const anexoPath = n.arquivo ? await cpUploadAnexo(n.arquivo) : null;
    const total = Math.round(validos.reduce((s, l) => s + (Number(l.total) || 0), 0) * 100) / 100;
    const [compra] = await cpInsert('cp_compras', {
      data_compra: n.data, fornecedor_id: n.fornecedorId, fornecedor_nome: n.fornecedorNome || null,
      fornecedor_doc: n.fornecedorDoc || null, numero_nota: n.numero || null, chave_nfe: n.chave || null,
      origem: n.origem, total, obs: n.obs || null, anexo_path: anexoPath, criado_por: user,
    });
    const linhas = await cpInsert('cp_compra_itens', validos.map(l => {
      const it = items.find(i => i.id === l.item_id);
      return { compra_id: compra.id, item_id: it.id, item_nome: it.name, unidade: it.unit || null, categoria: it.cat || null,
        qtd: _estRound(l.qtd), preco_unit: l.preco_unit || 0, total: l.total || 0,
        desc_nota: l.desc_nota, cod_nota: l.cod_nota, qtd_nota: l.qtd_nota, unid_nota: l.unid_nota, fator: l.fator || 1, criado_por: user };
    }));
    await cpDarEntradaEstoque(compra, linhas);
    await _cpSalvarMemoriaNota(n, validos);
    _cpGuardarCnpjFornecedor(n);
    document.getElementById('ovCpNC')?.remove();
    _cpNC = null;
    toast(`Compra salva · ${linhas.length} item(ns) entraram no estoque`, 'ok');
    if (_cpAba === 'compras') cpRenderAbaCompras(true);
  } catch (e) {
    toast('Não consegui salvar a compra: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar compra e dar entrada no estoque'; }
  }
}

// Entrada no estoque + custo de referência + histórico de preços.
// Usada também pelo Recebimento (pedido conferido).
async function cpDarEntradaEstoque(compra, linhas) {
  const forn = compra.fornecedor_nome || '';
  const dataMov = new Date(compra.data_compra + 'T12:00:00').toISOString();
  await estInserirMovs(linhas.map(l => {
    const it = items.find(i => i.id === l.item_id);
    return _estMovRow(it || { id: l.item_id, name: l.item_nome, unit: l.unidade, cat: l.categoria }, {
      tipo: 'recebimento', sinal: 1, qtd: l.qtd, custo_unit: l.preco_unit,
      local_destino: (it && estLocalEntrada(it)) || EST_SEM_LOCAL,
      motivo: [forn, compra.numero_nota ? 'NF ' + compra.numero_nota : null].filter(Boolean).join(' · ') || null,
      ref_tipo: 'compra', ref_id: l.id, data_mov: dataMov,
    });
  }));
  let mudou = false;
  for (const l of linhas) {
    const it = items.find(i => i.id === l.item_id);
    if (!it || !(l.preco_unit > 0)) continue;
    it.cost = Number(l.preco_unit); mudou = true;
    if (typeof priceHistory !== 'undefined') priceHistory.push({
      itemId: it.id, itemName: it.name, cat: it.cat, unidade: it.unit, marca: '',
      fornecedorId: compra.fornecedor_id || null, fornecedorNome: forn || '—', tipoCompra: compra.origem === 'pedido' ? 'fornecedor' : 'avulsa',
      precoUnit: Number(l.preco_unit), precoEstimado: 0, data: compra.data_compra, listaId: compra.id,
    });
  }
  if (mudou) { if (typeof savePriceHistory === 'function') savePriceHistory(); if (typeof saveI === 'function') saveI(); }
}

// Compra excluída: tira os preços dela do histórico e volta o custo de
// referência de cada item para o último preço que sobrou
function _cpDesfazerPrecos(compraId) {
  if (typeof priceHistory === 'undefined') return;
  const afetados = new Set(priceHistory.filter(p => p.listaId === compraId).map(p => p.itemId));
  if (!afetados.size) return;
  priceHistory.splice(0, priceHistory.length, ...priceHistory.filter(p => p.listaId !== compraId));
  for (const itemId of afetados) {
    const it = items.find(i => i.id === itemId);
    const ult = estUltimoPreco(itemId);
    if (it && ult) it.cost = ult.precoUnit;
  }
  if (typeof savePriceHistory === 'function') savePriceHistory();
  if (typeof saveI === 'function') saveI();
}

// Lembra "produto da nota → insumo" para este fornecedor
async function _cpSalvarMemoriaNota(n, linhas) {
  const doForn = cpChaveForn(n.fornecedorDoc, n.fornecedorId, n.fornecedorNome);
  const rows = linhas.filter(l => l.desc_nota).map(l => ({
    fornecedor_doc: doForn, cod_produto: cpChaveProduto(l.cod_nota, l.desc_nota), desc_produto: l.desc_nota,
    item_id: l.item_id, fator: l.fator || 1, criado_por: estUsuario(), atualizado_por: estUsuario(),
  }));
  if (!rows.length) return;
  const { error } = await _cpSb().from('cp_nf_mapa').upsert(rows, { onConflict: 'fornecedor_doc,cod_produto' });
  if (error) console.warn('[compras] memória da nota não salva:', error.message);
}

function _cpGuardarCnpjFornecedor(n) {
  const s = n.fornecedorId ? cpFornecedor(n.fornecedorId) : null;
  const d = cpSoDigitos(n.fornecedorDoc);
  if (s && d && !cpSoDigitos(s.cnpj)) { s.cnpj = d; if (typeof saveS === 'function') saveS(); }
}

// ══════════════════════════════════════════════════════════════
// IMPORTAR NOTA (XML da NF-e, ou foto/PDF lido pela IA)
// ══════════════════════════════════════════════════════════════

function cpImportarNota() {
  _estModal('ovCpImp', 'Importar nota fiscal', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 14px;border:1.5px dashed var(--border);border-radius:var(--r12);cursor:pointer;text-align:center;text-transform:none;letter-spacing:0">
        ${lc('file-code', 26, 'var(--purple)')}<strong style="font-size:var(--text-md);color:var(--text)">XML da NF-e</strong>
        <span style="font-size:var(--text-xs);color:var(--muted);font-weight:400">Arquivo .xml que o fornecedor manda. Leitura exata.</span>
        <input type="file" accept=".xml,text/xml,application/xml" style="display:none" onchange="_cpImportarArquivo(this.files[0])"></label>
      <label style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 14px;border:1.5px dashed var(--border);border-radius:var(--r12);cursor:pointer;text-align:center;text-transform:none;letter-spacing:0">
        ${lc('camera', 26, 'var(--purple)')}<strong style="font-size:var(--text-md);color:var(--text)">Foto ou PDF</strong>
        <span style="font-size:var(--text-xs);color:var(--muted);font-weight:400">DANFE, cupom ou recibo. A IA lê os itens.</span>
        <input type="file" accept="image/*,.pdf,application/pdf" capture="environment" style="display:none" onchange="_cpImportarArquivo(this.files[0])"></label>
    </div>
    <div id="cpImpStatus" style="margin-top:14px;font-size:var(--text-sm);color:var(--muted);text-align:center">A VTP tenta reconhecer o fornecedor e os insumos sozinha. Você confere tudo antes de salvar.</div>`,
    `document.getElementById('ovCpImp').remove()`, 'Cancelar', 560);
  const salvar = document.getElementById('ovCpImp-salvar');
  if (salvar) salvar.style.display = 'none';
}

async function _cpImportarArquivo(file) {
  if (!file) return;
  const st = document.getElementById('cpImpStatus');
  const msg = (t, cor = 'var(--muted)') => { if (st) st.innerHTML = `<span style="color:${cor}">${t}</span>`; };
  try {
    let nota, origem;
    const ehXml = /\.xml$/i.test(file.name) || /xml/.test(file.type);
    if (ehXml) {
      msg(`${lc('refresh-cw', 13, 'currentColor')} Lendo o XML…`);
      nota = cpParseNFe(await file.text()); origem = 'xml';
    } else {
      if (file.size > 15 * 1024 * 1024) throw new Error('arquivo maior que 15 MB');
      msg(`${lc('refresh-cw', 13, 'currentColor')} A IA está lendo a nota… (leva alguns segundos)`);
      const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/ler-nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
        body: JSON.stringify({ arquivo: await cpLerBase64(file), media_type: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg') }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `erro ${res.status}`);
      nota = j.nota; origem = 'ia';
      if (!nota?.legivel) throw new Error(nota?.motivo || 'a IA não conseguiu ler esta imagem');
    }
    if (!nota.itens?.length) throw new Error('não encontrei itens nesta nota');
    msg(`${lc('refresh-cw', 13, 'currentColor')} Reconhecendo fornecedor e insumos…`);
    const dados = await _cpMontarCompraDaNota(nota, origem);
    dados.arquivo = file;
    document.getElementById('ovCpImp')?.remove();
    cpNovaCompra(dados);
  } catch (e) {
    msg(`Não consegui importar: ${_estEsc(e.message)}`, 'var(--danger-fg)');
  }
}

// NF-e (XML) → mesmo formato que a IA devolve
function cpParseNFe(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML inválido');
  const t = (pai, tag) => pai?.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() || null;
  const n = v => v === null || v === undefined || v === '' ? null : parseFloat(v);
  const inf = doc.getElementsByTagNameNS('*', 'infNFe')[0];
  if (!inf) throw new Error('este XML não é de uma NF-e');
  const emit = inf.getElementsByTagNameNS('*', 'emit')[0];
  const ide = inf.getElementsByTagNameNS('*', 'ide')[0];
  const tot = inf.getElementsByTagNameNS('*', 'ICMSTot')[0];
  const chave = (inf.getAttribute('Id') || '').replace(/\D/g, '') || null;
  const itens = [...inf.getElementsByTagNameNS('*', 'det')].map(det => {
    const p = det.getElementsByTagNameNS('*', 'prod')[0];
    const vProd = n(t(p, 'vProd')) || 0, vDesc = n(t(p, 'vDesc')) || 0;
    return { descricao: t(p, 'xProd') || '', codigo: t(p, 'cProd'), quantidade: n(t(p, 'qCom')), unidade: t(p, 'uCom'),
             valor_unitario: n(t(p, 'vUnCom')), valor_total: Math.round((vProd - vDesc) * 100) / 100 };
  });
  return {
    legivel: true, fornecedor_nome: t(emit, 'xNome'), fornecedor_doc: t(emit, 'CNPJ') || t(emit, 'CPF'),
    numero_nota: t(ide, 'nNF'), chave_nfe: chave && chave.length === 44 ? chave : null,
    data_emissao: (t(ide, 'dhEmi') || t(ide, 'dEmi') || '').slice(0, 10) || null,
    valor_total: n(t(tot, 'vNF')), itens,
  };
}

// Nota lida → rascunho da Nova compra, com fornecedor e insumos casados
async function _cpMontarCompraDaNota(nota, origem) {
  const f = cpAcharFornecedor(nota.fornecedor_nome, nota.fornecedor_doc);
  const dados = {
    ..._cpNCVazio(), passo: 1, origem,
    data: /^\d{4}-\d{2}-\d{2}$/.test(nota.data_emissao || '') ? nota.data_emissao : cpIso(new Date()),
    fornecedorId: f?.s.id || null, fornecedorNome: f?.s.name || nota.fornecedor_nome || '',
    fornecedorDoc: cpSoDigitos(nota.fornecedor_doc), numero: nota.numero_nota || '',
    chave: nota.chave_nfe || null, totalNota: nota.valor_total ?? null,
  };
  // Memória do fornecedor (pelo CNPJ e pelo id do cadastro)
  const chaves = [...new Set([cpSoDigitos(nota.fornecedor_doc), f?.s.id ? 'forn:' + f.s.id : null].filter(Boolean))];
  let memoria = [];
  if (chaves.length) {
    const { data } = await _cpSb().from('cp_nf_mapa').select('*').in('fornecedor_doc', chaves);
    memoria = data || [];
  }
  const pool = items.filter(i => i.active !== false).map(i => ({ id: i.id, nome: i.name }));
  dados.itens = nota.itens.map(it => {
    const l = { ..._cpLinhaVazia(), desc_nota: it.descricao, cod_nota: it.codigo || null, qtd_nota: it.quantidade,
                unid_nota: it.unidade, valor_nota: it.valor_total ?? (it.quantidade && it.valor_unitario ? it.quantidade * it.valor_unitario : null) };
    const lembrado = memoria.find(m => m.cod_produto === cpChaveProduto(it.codigo, it.descricao));
    if (lembrado && items.some(i => i.id === lembrado.item_id)) {
      l.item_id = lembrado.item_id; l.fator = Number(lembrado.fator) || 1; l.memoria = true;
    } else if (typeof _cwSim === 'function') {
      // Nas notas o nome costuma vir mais longo que o do insumo ("REQUEIJAO
      // CREMOSO BALDE 1,5KG" × "REQUEIJÃO") — compara nos dois sentidos
      const c = pool.map(x => ({ x, s: Math.max(_cwSim(it.descricao, x.nome), _cwSim(x.nome, it.descricao)) }))
        .filter(r => r.s >= 0.45).sort((a, b) => b.s - a.s)[0];
      if (c) {
        l.item_id = c.x.id; l.sugestao = true;
        const item = items.find(i => i.id === c.x.id);
        if (item?.qtdEmb > 0 && it.unidade && _cwNorm(it.unidade) !== _cwNorm(item.unit)) l.fator = item.qtdEmb;
      }
    }
    _cpNCRecalcNota(l);
    return l;
  });
  return dados;
}

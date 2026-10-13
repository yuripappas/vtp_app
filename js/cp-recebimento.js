/**
 * VTP Compras — Vai Ter Pizza!
 * cp-recebimento.js — Aba "Recebimento": um pedido por fornecedor
 *
 * Status:  Rascunho (gerado pela cotação) → Pedido solicitado (o comprador
 *          mandou a mensagem e marcou, com quem e quando) → Recebido parcial
 *          → Recebido · ou Cancelado (com motivo).
 * Destaques: rascunho parado há mais de 2 h, entrega atrasada (pela
 *          previsão de entrega do fornecedor).
 * Conferência: quantidade pedida × recebida, preço combinado × cobrado,
 *          fotos e nota fiscal (XML ou foto lida pela IA preenche os valores).
 *          Confirmar = gera a Compra (origem "pedido") e dá entrada no estoque.
 */

let _rcDados = null;
let _rcFiltro = 'abertos';
let _rcAtual = null;

const RC_STATUS = {
  rascunho:   { label: 'Rascunho',          cls: 'b-gray',   icon: 'edit-3'       },
  solicitado: { label: 'Pedido solicitado', cls: 'b-purple', icon: 'send'         },
  parcial:    { label: 'Recebido parcial',  cls: 'b-orange', icon: 'package'      },
  recebido:   { label: 'Recebido',          cls: 'b-green',  icon: 'check-circle' },
  cancelado:  { label: 'Cancelado',         cls: 'b-red',    icon: 'x-circle'     },
};
const _RC_FILTROS = {
  abertos:    { label: 'Em aberto',  sts: ['rascunho', 'solicitado', 'parcial'] },
  rascunho:   { label: 'Rascunho',   sts: ['rascunho'] },
  solicitado: { label: 'Solicitados', sts: ['solicitado', 'parcial'] },
  recebido:   { label: 'Recebidos',  sts: ['recebido'] },
  cancelado:  { label: 'Cancelados', sts: ['cancelado'] },
};

const _rcAtivo = i => !i.removido_em;
const _rcHoje = () => cpIso(new Date());

async function cpRenderAbaRecebimento(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  if (!_rcDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando pedidos…</div>`;
    try {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString();
      const pedidos = await cpSelect('cp_pedidos', q => q.select('*').is('excluido_em', null)
        .or(`status.in.(rascunho,solicitado,parcial),updated_at.gte.${desde}`).order('created_at', { ascending: false }));
      const ids = pedidos.map(p => p.id);
      const itens = ids.length ? (await cpSelect('cp_pedido_itens', q => q.select('*').in('pedido_id', ids))).filter(_rcAtivo) : [];
      const porPedido = new Map();
      itens.forEach(i => { if (!porPedido.has(i.pedido_id)) porPedido.set(i.pedido_id, []); porPedido.get(i.pedido_id).push(i); });
      _rcDados = { pedidos, porPedido };
    } catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar os pedidos: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaRecebimento(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cpAbaBody')) return;
  _rcRenderLista();
}

function _rcAlerta(p) {
  if (p.status === 'rascunho') {
    const h = (Date.now() - _estMs(p.created_at)) / 36e5;
    if (h >= 2) return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);white-space:nowrap">${lc('alert-triangle', 11, 'currentColor')} não enviado há ${h >= 48 ? Math.floor(h / 24) + ' dias' : Math.floor(h) + ' h'}</span>`;
  }
  if (['solicitado', 'parcial'].includes(p.status) && p.previsao_entrega && p.previsao_entrega < _rcHoje()) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--text-xs);font-weight:700;color:var(--danger-fg);white-space:nowrap">${lc('clock', 11, 'currentColor')} entrega atrasada</span>`;
  }
  return '';
}

function _rcRenderLista() {
  const el = document.getElementById('cpAbaBody');
  const { pedidos, porPedido } = _rcDados;
  const cont = f => pedidos.filter(p => _RC_FILTROS[f].sts.includes(p.status)).length;
  const lista = pedidos.filter(p => _RC_FILTROS[_rcFiltro].sts.includes(p.status));
  const btn = (icon, txt, fn, extra = '') => `<button class="btn btn-outline btn-xs" onclick="event.stopPropagation();${fn}" ${extra}>${lc(icon, 12, 'currentColor')} ${txt}</button>`;
  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      ${Object.entries(_RC_FILTROS).map(([id, f]) => { const on = _rcFiltro === id; return `<button onclick="_rcFiltro='${id}';_rcRenderLista()"
        style="padding:7px 14px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${f.label} <span style="opacity:.7">${cont(id)}</span></button>`; }).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="cpRenderAbaRecebimento(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    <div class="card" style="margin-bottom:0">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>${['Fornecedor', 'Status', 'Previsão', 'Itens', 'Total', 'Ações'].map((h, i) =>
          `<th style="padding:11px 14px;text-align:${[3, 4].includes(i) ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}</tr></thead>
        <tbody>${lista.length ? lista.map(p => {
          const its = porPedido.get(p.id) || [];
          const st = RC_STATUS[p.status];
          const aberto = ['rascunho', 'solicitado', 'parcial'].includes(p.status);
          return `<tr style="border-top:1px solid var(--border);${p.status === 'solicitado' ? 'background:color-mix(in srgb, var(--info-bg) 35%, transparent)' : ''}">
            <td style="padding:12px 14px"><div style="font-weight:700">${_estEsc(p.fornecedor_nome)}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">gerado ${_estDH(p.created_at)} por ${_estEsc(p.criado_por)}</div></td>
            <td style="padding:12px 14px"><span class="badge ${st.cls}" style="font-size:var(--text-xs);padding:4px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${lc(st.icon, 11, 'currentColor')} ${st.label}</span>
              ${p.solicitado_em ? `<div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">enviado ${_estDH(p.solicitado_em)} por ${_estEsc(p.solicitado_por || '')}</div>` : ''}
              ${p.status === 'cancelado' && p.cancelado_motivo ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:3px">"${_estEsc(p.cancelado_motivo)}"</div>` : ''}
              <div>${_rcAlerta(p)}</div></td>
            <td style="padding:12px 14px;white-space:nowrap">${p.previsao_entrega ? cpDataBr(p.previsao_entrega) : '<span style="color:var(--muted)">—</span>'}</td>
            <td style="padding:12px 14px;text-align:right">${its.length}</td>
            <td style="padding:12px 14px;text-align:right;font-weight:700;white-space:nowrap">${_estR(p.total_previsto)}</td>
            <td style="padding:12px 14px"><div style="display:flex;gap:6px;flex-wrap:wrap">
              ${aberto ? btn('copy', 'Copiar mensagem', `_rcCopiarMsg('${p.id}')`) : ''}
              ${p.status === 'rascunho' ? `<button class="btn btn-primary btn-xs" onclick="_rcMarcarEnviado('${p.id}')">${lc('send', 12, '#fff')} Marquei como enviado</button>` : ''}
              ${aberto ? btn('clipboard-check', 'Conferir', `cpConferirPedido('${p.id}')`) : btn('eye', 'Ver', `cpConferirPedido('${p.id}')`)}
              ${['rascunho', 'solicitado'].includes(p.status) ? btn('edit-2', 'Ajustar', `_rcAjustar('${p.id}')`) : ''}
              ${btn('printer', 'Imprimir', `_rcImprimir('${p.id}')`)}
              ${aberto ? btn('x', 'Cancelar', `_rcCancelar('${p.id}')`, 'style="color:var(--danger-fg)"') : ''}
            </div></td></tr>`;
        }).join('') : `<tr><td colspan="6" style="padding:44px;text-align:center;color:var(--muted)">${_rcFiltro === 'abertos' ? 'Nenhum pedido em aberto. Os pedidos chegam aqui quando um lote de cotação é concluído.' : 'Nada aqui'}</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

const _rcPedido = id => _rcDados?.pedidos.find(p => p.id === id);

// Mensagem do pedido a partir dos itens atuais (reflete ajustes)
function _rcMensagem(p, its) {
  const s = cpFornecedor(p.fornecedor_id);
  const linhas = its.map(i => {
    const it = items.find(x => x.id === i.item_id);
    const emb = it?.qtdEmb > 0 && it?.unidCompra ? ` (${_estQ(i.qtd_pedida / it.qtdEmb)} ${it.unidCompra})` : '';
    return `• ${i.item_nome} — ${_estQ(i.qtd_pedida)} ${i.unidade || ''}${emb}${i.preco_combinado ? ` · ${_estR(i.preco_combinado)}/${i.unidade || 'un'}` : ''}`;
  });
  const total = its.reduce((t, i) => t + (Number(i.qtd_pedida) || 0) * (Number(i.preco_combinado) || 0), 0);
  return `Olá${s?.seller ? ', ' + s.seller.charAt(0) + s.seller.slice(1).toLowerCase() : ''}! Aqui é da Vai Ter Pizza.\nSegue nosso pedido:\n\n${linhas.join('\n')}\n\nTotal estimado: ${_estR(total)}\nPode confirmar o pedido e a previsão de entrega? Obrigado!`;
}

function _rcCopiarMsg(id) {
  const p = _rcPedido(id);
  _ctCopiar(_rcMensagem(p, _rcDados.porPedido.get(id) || []));
  if (p.status === 'rascunho') setTimeout(() => toast('Depois de mandar no WhatsApp, clique em "Marquei como enviado"', 'info'), 1600);
}

async function _rcMarcarEnviado(id) {
  try {
    await cpUpdate('cp_pedidos', id, { status: 'solicitado', solicitado_por: estUsuario(), solicitado_em: new Date().toISOString() });
    toast('Pedido marcado como solicitado ao fornecedor', 'ok');
    cpRenderAbaRecebimento(true);
  } catch (e) { toast(e.message, 'err'); }
}

// ── Ajustar (antes de receber) ──
function _rcAjustar(id) {
  const p = _rcPedido(id);
  const its = _rcDados.porPedido.get(id) || [];
  window._rcAj = { p, its: its.map(i => ({ ...i })) };
  _estModal('ovRcAj', `Ajustar pedido · ${_estEsc(p.fornecedor_nome)}`, `
    <div class="f2">${_estCampo('Previsão de entrega', `<input class="inp" type="date" id="rcajPrev" value="${p.previsao_entrega || ''}">`)}<div></div></div>
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${window._rcAj.its.map((i, k) => `<div style="display:grid;grid-template-columns:1fr 120px 120px 32px;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--border)">
        <span style="font-weight:600">${_estEsc(i.item_nome)}</span>
        <input class="inp" type="number" min="0" step="0.001" value="${i.qtd_pedida}" oninput="window._rcAj.its[${k}].qtd_pedida=parseFloat(this.value)||0" title="Quantidade (${_estEsc(i.unidade || '')})">
        <input class="inp" type="number" min="0" step="0.01" value="${i.preco_combinado ?? ''}" oninput="window._rcAj.its[${k}].preco_combinado=parseFloat(this.value)||0" title="Preço combinado">
        <button class="btn btn-ghost btn-xs" style="color:var(--danger-fg)" title="Tirar do pedido" onclick="window._rcAj.its[${k}].tirar=!window._rcAj.its[${k}].tirar;this.closest('div').style.opacity=window._rcAj.its[${k}].tirar?.4:1">${lc('trash-2', 14, 'currentColor')}</button>
      </div>`).join('')}
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px">Quantidade na unidade do insumo e preço por unidade. Se o pedido já foi enviado, mande a mensagem nova para o fornecedor.</div>`,
    `_rcSalvarAjuste()`, 'Salvar ajuste', 640);
}

async function _rcSalvarAjuste() {
  const { p, its } = window._rcAj;
  const ficam = its.filter(i => !i.tirar && i.qtd_pedida > 0);
  if (!ficam.length) return toast('O pedido ficaria vazio — cancele o pedido em vez disso', 'err');
  _estSalvarComBotao('ovRcAj', async () => {
    for (const i of its) {
      if (i.tirar || !(i.qtd_pedida > 0)) await cpUpdate('cp_pedido_itens', i.id, { removido_em: new Date().toISOString() });
      else await cpUpdate('cp_pedido_itens', i.id, { qtd_pedida: _estRound(i.qtd_pedida), preco_combinado: i.preco_combinado || null });
    }
    const total = ficam.reduce((t, i) => t + i.qtd_pedida * (i.preco_combinado || 0), 0);
    await cpUpdate('cp_pedidos', p.id, { total_previsto: Math.round(total * 100) / 100, previsao_entrega: document.getElementById('rcajPrev').value || null, mensagem: _rcMensagem(p, ficam) });
    toast('Pedido ajustado', 'ok');
  }).then(() => cpRenderAbaRecebimento(true));
}

// ── Cancelar ──
function _rcCancelar(id) {
  const p = _rcPedido(id);
  _estModal('ovRcCanc', `Cancelar pedido · ${_estEsc(p.fornecedor_nome)}`, `
    ${_estCampo('Motivo *', `<input class="inp" id="rcCancMotivo" placeholder="ex: fornecedor sem estoque, comprado em outro lugar">`)}
    <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);cursor:pointer;text-transform:none;letter-spacing:0;color:var(--text);font-weight:500">
      <input type="checkbox" id="rcCancDevolver" checked style="accent-color:var(--purple)"> Devolver os itens para uma nova cotação</label>
    ${p.status === 'parcial' ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px">O que já foi recebido continua no estoque; só o restante é cancelado.</div>` : ''}`,
    `_rcConfirmarCancelamento('${id}')`, 'Cancelar pedido', 520);
}

async function _rcConfirmarCancelamento(id) {
  const motivo = document.getElementById('rcCancMotivo').value.trim();
  if (!motivo) return toast('Informe o motivo', 'err');
  const devolver = document.getElementById('rcCancDevolver').checked;
  _estSalvarComBotao('ovRcCanc', async () => {
    if (devolver) {
      const its = _rcDados.porPedido.get(id) || [];
      const lotes = its.map(i => i.lote_item_id).filter(Boolean);
      if (lotes.length) {
        const lis = await cpSelect('cp_lote_itens', q => q.select('id, lista_item_id').in('id', lotes));
        for (const li of lis) if (li.lista_item_id) await cpUpdate('cp_lista_itens', li.lista_item_id, { lote_id: null });
      }
    }
    await cpUpdate('cp_pedidos', id, { status: 'cancelado', cancelado_por: estUsuario(), cancelado_em: new Date().toISOString(), cancelado_motivo: motivo });
    toast(devolver ? 'Pedido cancelado — itens voltaram para a Cotação' : 'Pedido cancelado', 'ok');
  }).then(() => cpRenderAbaRecebimento(true));
}

// ── Imprimir ──
function _rcImprimir(id) {
  const p = _rcPedido(id);
  const its = _rcDados.porPedido.get(id) || [];
  const s = cpFornecedor(p.fornecedor_id);
  const w = window.open('', '_blank', 'width=760,height=900');
  if (!w) return toast('Libere pop-ups para imprimir', 'err');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${_estEsc(p.fornecedor_nome)}</title>
    <style>body{font-family:Arial,sans-serif;padding:28px;color:#111}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}.r{text-align:right}.chk{width:60px}.m{color:#666;font-size:12px}</style></head><body>
    <h1>Pedido de compra — Vai Ter Pizza!</h1>
    <div class="m">Fornecedor: <b>${_estEsc(p.fornecedor_nome)}</b>${s?.seller ? ` · ${_estEsc(s.seller)}` : ''}${s?.phone ? ` · ${_estEsc(s.phone)}` : ''}</div>
    <div class="m">Gerado em ${_estDH(p.created_at)}${p.previsao_entrega ? ` · previsão de entrega ${cpDataBr(p.previsao_entrega)}` : ''} · status: ${RC_STATUS[p.status].label}</div>
    <table><thead><tr><th>Item</th><th class="r">Qtd pedida</th><th class="r">Preço combinado</th><th class="r">Subtotal</th><th class="chk">Recebido</th></tr></thead><tbody>
    ${its.map(i => `<tr><td>${_estEsc(i.item_nome)}</td><td class="r">${_estQ(i.qtd_pedida)} ${_estEsc(i.unidade || '')}</td><td class="r">${i.preco_combinado ? _estR(i.preco_combinado) : '—'}</td><td class="r">${_estR((i.qtd_pedida || 0) * (i.preco_combinado || 0))}</td><td></td></tr>`).join('')}
    </tbody><tfoot><tr><th colspan="3" class="r">Total estimado</th><th class="r">${_estR(p.total_previsto)}</th><th></th></tr></tfoot></table>
    <p class="m" style="margin-top:28px">Conferido por: ______________________ &nbsp; Data: ___/___/______</p>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
// CONFERÊNCIA
// ══════════════════════════════════════════════════════════════

function cpConferirPedido(id) {
  const p = _rcPedido(id);
  const its = (_rcDados.porPedido.get(id) || []).map(i => {
    const falta = Math.max(0, (Number(i.qtd_pedida) || 0) - (Number(i.qtd_recebida) || 0));
    return { ...i, receber: falta, precoFinal: i.preco_final ?? i.preco_combinado ?? items.find(x => x.id === i.item_id)?.cost ?? 0, falta };
  });
  _rcAtual = { p, its, fotos: [], nota: null, notaArquivo: null, numero: '', chave: null, doc: '', data: _rcHoje() };
  const aberto = ['rascunho', 'solicitado', 'parcial'].includes(p.status);
  _estModal('ovRcConf', `${aberto ? 'Conferência' : 'Pedido'} · ${_estEsc(p.fornecedor_nome)}`, '', aberto ? '_rcConfirmar()' : `document.getElementById('ovRcConf').remove()`, aberto ? 'Confirmar recebimento e dar entrada no estoque' : 'Fechar', 980);
  _rcRenderConf();
}

function _rcRenderConf() {
  const a = _rcAtual, p = a.p;
  const aberto = ['rascunho', 'solicitado', 'parcial'].includes(p.status);
  const body = document.getElementById('ovRcConf-body');
  const total = a.its.reduce((t, i) => t + (Number(i.receber) || 0) * (Number(i.precoFinal) || 0), 0);
  body.innerHTML = `
    ${aberto ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      ${_estCampo('Data do recebimento', `<input class="inp" type="date" value="${a.data}" onchange="_rcAtual.data=this.value">`, 'margin:0')}
      ${_estCampo('Nº da nota', `<input class="inp" value="${_estEsc(a.numero)}" oninput="_rcAtual.numero=this.value" placeholder="opcional">`, 'margin:0')}
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('file-text', 13, 'currentColor')} ${a.notaArquivo ? 'Nota anexada ✓' : 'Anexar nota (XML, foto ou PDF)'}
        <input type="file" accept=".xml,.pdf,image/*" style="display:none" onchange="_rcAnexarNota(this.files[0])"></label>
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('camera', 13, 'currentColor')} Fotos do recebimento${a.fotos.length ? ` (${a.fotos.length})` : ''}
        <input type="file" accept="image/*" multiple capture="environment" style="display:none" onchange="_rcAtual.fotos.push(...this.files);_rcRenderConf()"></label>
      <span id="rcNotaStatus" style="font-size:var(--text-xs);color:var(--muted)"></span>
    </div>` : ''}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>${['Produto', 'Pedido', 'Já recebido', aberto ? 'Recebido agora' : '', 'Preço combinado', aberto ? 'Preço cobrado' : 'Preço final', 'Subtotal'].filter(Boolean).map((h, k) =>
          `<th style="padding:9px 10px;text-align:${k ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${a.its.map((i, k) => {
          const u = _estEsc(i.unidade || '');
          const difPreco = i.preco_combinado && Math.abs(Number(i.precoFinal) - Number(i.preco_combinado)) > 0.005;
          const difQtd = aberto && Math.abs(Number(i.receber) - i.falta) > 0.0005;
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:9px 10px;font-weight:600">${_estEsc(i.item_nome)}${i.notaDesc ? `<div style="font-size:var(--text-xs);color:var(--muted);font-weight:400">na nota: ${_estEsc(i.notaDesc)}</div>` : ''}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap">${_estQ(i.qtd_pedida)} ${u}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${_estQ(i.qtd_recebida)} ${u}</td>
            ${aberto ? `<td style="padding:9px 10px;text-align:right"><input class="inp" type="number" min="0" step="0.001" value="${i.receber}" style="width:100px;text-align:right;font-weight:700;${difQtd ? 'border-color:var(--orange-dark)' : ''}" oninput="_rcAtual.its[${k}].receber=parseFloat(this.value)||0;_rcTotal()">
              ${difQtd ? `<div style="font-size:var(--text-2xs);color:var(--orange-dark)">${i.receber < i.falta ? 'faltou ' + _estQ(i.falta - i.receber) : 'veio a mais'}</div>` : ''}</td>` : ''}
            <td style="padding:9px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${i.preco_combinado ? _estR(i.preco_combinado) : '—'}</td>
            <td style="padding:9px 10px;text-align:right">${aberto ? `<input class="inp" type="number" min="0" step="0.01" value="${i.precoFinal ?? ''}" style="width:100px;text-align:right;${difPreco ? 'border-color:var(--danger-fg)' : ''}" oninput="_rcAtual.its[${k}].precoFinal=parseFloat(this.value)||0;_rcTotal()">
              ${difPreco ? `<div style="font-size:var(--text-2xs);color:var(--danger-fg)">diferente do combinado</div>` : ''}` : `${i.preco_final ? _estR(i.preco_final) : '—'}`}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap" id="rcSub${k}">${_estR((aberto ? i.receber : i.qtd_recebida) * (aberto ? i.precoFinal : (i.preco_final || 0)))}</td></tr>`;
        }).join('')}</tbody>
        ${aberto ? `<tfoot><tr style="border-top:1.5px solid var(--border)"><td colspan="6" style="padding:10px;text-align:right;font-weight:700">Total desta entrega</td><td style="padding:10px;text-align:right;font-weight:800" id="rcTotal">${_estR(total)}</td></tr></tfoot>` : ''}
      </table></div>
    ${aberto ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px;line-height:1.5">Se veio só uma parte, confirme o que chegou: o pedido fica como "Recebido parcial" e o restante continua em aberto. O preço cobrado vira o custo do item.${a.nota ? ' Valores preenchidos pela nota — confira.' : ''}</div>` : ''}`;
}

function _rcTotal() {
  const a = _rcAtual;
  a.its.forEach((i, k) => { const el = document.getElementById('rcSub' + k); if (el) el.textContent = _estR((i.receber || 0) * (i.precoFinal || 0)); });
  const el = document.getElementById('rcTotal');
  if (el) el.textContent = _estR(a.its.reduce((t, i) => t + (i.receber || 0) * (i.precoFinal || 0), 0));
}

// Nota anexada: preenche quantidades e preços dos itens que casarem
async function _rcAnexarNota(file) {
  if (!file) return;
  const st = document.getElementById('rcNotaStatus');
  const msg = t => { if (st) st.innerHTML = t; };
  try {
    let nota, origem;
    if (/\.xml$/i.test(file.name) || /xml/.test(file.type)) { nota = cpParseNFe(await file.text()); origem = 'xml'; }
    else {
      msg(`${lc('refresh-cw', 12, 'currentColor')} a IA está lendo a nota…`);
      const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/ler-nota`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
        body: JSON.stringify({ arquivo: await cpLerBase64(file), media_type: file.type || 'image/jpeg' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'erro ' + res.status);
      nota = j.nota; origem = 'ia';
      if (!nota?.legivel) throw new Error(nota?.motivo || 'nota ilegível');
    }
    const dados = await _cpMontarCompraDaNota(nota, origem);
    const a = _rcAtual;
    let casados = 0;
    for (const l of dados.itens) {
      const alvo = a.its.find(i => i.item_id === l.item_id && !i.notaDesc);
      if (!alvo || !(l.qtd > 0)) continue;
      alvo.receber = l.qtd; alvo.precoFinal = l.preco_unit; alvo.notaDesc = l.desc_nota; alvo.notaLinha = l; casados++;
    }
    Object.assign(a, { nota: dados, notaArquivo: file, numero: dados.numero || a.numero, chave: dados.chave, doc: dados.fornecedorDoc, data: dados.data || a.data });
    _rcRenderConf();
    const s2 = document.getElementById('rcNotaStatus');
    if (s2) s2.innerHTML = `<span style="color:var(--success-fg)">${casados} de ${a.its.length} itens preenchidos pela nota</span>`;
  } catch (e) { msg(`<span style="color:var(--danger-fg)">Não consegui ler a nota: ${_estEsc(e.message)}</span>`); }
}

async function _rcConfirmar() {
  const a = _rcAtual, p = a.p;
  const recebidos = a.its.filter(i => i.receber > 0);
  if (!recebidos.length) return toast('Nada recebido — informe as quantidades que chegaram', 'err');
  const btn = document.getElementById('ovRcConf-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    if (a.chave) {
      const { data: dup } = await _cpSb().from('cp_compras').select('id, data_compra').eq('chave_nfe', a.chave).is('excluido_em', null).limit(1);
      if (dup?.length) throw new Error(`esta nota já foi lançada em ${cpDataBr(dup[0].data_compra)}`);
    }
    const user = estUsuario();
    const anexo = a.notaArquivo ? await cpUploadAnexo(a.notaArquivo) : null;
    const fotos = [];
    for (const f of a.fotos) fotos.push(await cpUploadAnexo(f, 'recebimentos'));
    const total = Math.round(recebidos.reduce((t, i) => t + i.receber * (i.precoFinal || 0), 0) * 100) / 100;
    const [compra] = await cpInsert('cp_compras', {
      data_compra: a.data, fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, fornecedor_doc: a.doc || null,
      numero_nota: a.numero || null, chave_nfe: a.chave || null, origem: 'pedido', pedido_id: p.id, total,
      anexo_path: anexo, fotos: fotos.length ? fotos : null, criado_por: user,
    });
    const linhas = await cpInsert('cp_compra_itens', recebidos.map(i => {
      const it = items.find(x => x.id === i.item_id);
      const l = i.notaLinha;
      return { compra_id: compra.id, item_id: i.item_id, item_nome: i.item_nome, unidade: i.unidade, categoria: it?.cat || null,
        qtd: _estRound(i.receber), preco_unit: i.precoFinal || 0, total: Math.round(i.receber * (i.precoFinal || 0) * 100) / 100,
        desc_nota: l?.desc_nota || null, cod_nota: l?.cod_nota || null, qtd_nota: l?.qtd_nota ?? null, unid_nota: l?.unid_nota || null, fator: l?.fator || 1, criado_por: user };
    }));
    await cpDarEntradaEstoque(compra, linhas);
    if (a.nota) await _cpSalvarMemoriaNota({ fornecedorDoc: a.doc, fornecedorId: p.fornecedor_id, fornecedorNome: p.fornecedor_nome },
      recebidos.filter(i => i.notaLinha).map(i => ({ ...i.notaLinha, item_id: i.item_id })));
    for (const i of recebidos) await cpUpdate('cp_pedido_itens', i.id, { qtd_recebida: _estRound((Number(i.qtd_recebida) || 0) + i.receber), preco_final: i.precoFinal || null });
    const completo = a.its.every(i => (Number(i.qtd_recebida) || 0) + (i.receber || 0) >= Number(i.qtd_pedida) - 0.0005);
    await cpUpdate('cp_pedidos', p.id, { status: completo ? 'recebido' : 'parcial', recebido_por: user, recebido_em: new Date().toISOString(),
      solicitado_em: p.solicitado_em || new Date().toISOString(), solicitado_por: p.solicitado_por || user });
    document.getElementById('ovRcConf')?.remove();
    _rcAtual = null;
    toast(`${completo ? 'Pedido recebido' : 'Recebimento parcial registrado'} · ${linhas.length} item(ns) entraram no estoque`, 'ok');
    _cpComprasDados = null;
    cpRenderAbaRecebimento(true);
  } catch (e) {
    toast('Não consegui confirmar: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar recebimento e dar entrada no estoque'; }
  }
}

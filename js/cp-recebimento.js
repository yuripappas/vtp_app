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
let _rcAtual = null;

const RC_STATUS = {
  rascunho:   { label: 'Rascunho',          cls: 'b-gray',   icon: 'edit-3'       },
  solicitado: { label: 'Pedido solicitado', cls: 'b-purple', icon: 'send'         },
  parcial:    { label: 'Recebido parcial',  cls: 'b-orange', icon: 'package'      },
  recebido:   { label: 'Recebido',          cls: 'b-green',  icon: 'check-circle' },
  cancelado:  { label: 'Cancelado',         cls: 'b-red',    icon: 'x-circle'     },
};

const _rcAtivo = i => !i.removido_em;
const _rcHoje = () => cpIso(new Date());

const _rcAberto = p => ['rascunho', 'solicitado', 'parcial'].includes(p.status);
const _rcDataFech = p => (p.status === 'cancelado' ? p.cancelado_em : p.recebido_em) || p.updated_at || p.created_at;
function _rcRecarregar() { cpRenderAbaRecebimento(true); }

async function cpRenderAbaRecebimento(forcar = false) {
  const el = document.getElementById('cpAbaBody');
  if (!el) return;
  if (!_per('cprec').de) _perSetPresetSilencioso('cprec', 'ciclo');
  if (!_rcDados || forcar) {
    el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">${lc('refresh-cw', 16, 'currentColor')} Carregando pedidos…</div>`;
    try {
      // Em aberto sempre aparecem; recebidos e cancelados pela data em que foram fechados, dentro do período
      const r = _perRange('cprec');
      const ini = _estMs(r.inicioISO), fim = _estMs(r.fimISO);
      const pedidos = (await cpSelect('cp_pedidos', q => q.select('*').is('excluido_em', null)
        .or(`status.in.(rascunho,solicitado,parcial),and(updated_at.gte.${r.inicioISO},created_at.lte.${r.fimISO})`).order('created_at', { ascending: false })))
        .filter(p => _rcAberto(p) || (t => t >= ini && t <= fim)(_estMs(_rcDataFech(p))));
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
  // Lista única: em aberto primeiro (rascunho → solicitado → parcial), depois recebidos e cancelados
  const ordem = { rascunho: 0, solicitado: 1, parcial: 2, recebido: 3, cancelado: 4 };
  const lista = [...pedidos].sort((x, y) => (ordem[x.status] - ordem[y.status]) || (_estMs(y.created_at) - _estMs(x.created_at)));
  const btn = (icon, txt, fn, extra = '') => `<button class="btn btn-outline btn-xs" onclick="event.stopPropagation();${fn}" ${extra}>${lc(icon, 12, 'currentColor')} ${txt}</button>`;
  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      ${_perRenderBar('cprec', '_rcRecarregar')}
      <span style="font-size:var(--text-sm);color:var(--text2)">${pedidos.filter(_rcAberto).length} em aberto (sempre aparecem) · ${pedidos.filter(p => !_rcAberto(p)).length} recebido(s) ou cancelado(s) no período</span>
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
          const fundo = p.status === 'solicitado' ? 'background:color-mix(in srgb, var(--info-bg) 35%, transparent)'
            : p.status === 'recebido' ? 'background:color-mix(in srgb, var(--success-bg) 45%, transparent)'
            : p.status === 'cancelado' ? 'opacity:.6' : '';
          return `<tr style="border-top:1px solid var(--border);${fundo}">
            <td style="padding:12px 14px"><div style="font-weight:700">${_estEsc(p.fornecedor_nome)}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">gerado ${_estDH(p.created_at)} por ${_estEsc(p.criado_por)}</div></td>
            <td style="padding:12px 14px"><span class="badge ${st.cls}" style="font-size:var(--text-xs);padding:4px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${lc(st.icon, 11, 'currentColor')} ${st.label}</span>
              ${p.solicitado_em ? `<div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">enviado ${_estDH(p.solicitado_em)} por ${_estEsc(p.solicitado_por || '')}</div>` : ''}
              ${p.recebido_em ? `<div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">recebido ${_estDH(p.recebido_em)}${p.recebido_por ? ' por ' + _estEsc(p.recebido_por) : ''}</div>` : ''}
              ${p.status === 'cancelado' && p.cancelado_motivo ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:3px">"${_estEsc(p.cancelado_motivo)}"</div>` : ''}
              <div>${_rcAlerta(p)}</div></td>
            <td style="padding:12px 14px;white-space:nowrap">${p.previsao_entrega ? cpDataBr(p.previsao_entrega) : '<span style="color:var(--muted)">—</span>'}</td>
            <td style="padding:12px 14px;text-align:right">${its.length}</td>
            <td style="padding:12px 14px;text-align:right;font-weight:700;white-space:nowrap">${_estR(p.total_previsto)}</td>
            <td style="padding:12px 14px"><div style="display:flex;gap:6px;flex-wrap:wrap">
              ${aberto ? btn('copy', 'Copiar mensagem', `_rcCopiarMsg('${p.id}')`) : ''}
              ${p.status === 'rascunho' ? `<button class="btn btn-primary btn-xs" onclick="_rcMarcarEnviado('${p.id}')">${lc('send', 12, '#fff')} Marquei como enviado</button>` : ''}
              ${aberto ? btn('clipboard-check', 'Conferir', `cpConferirPedido('${p.id}')`) : btn('eye', 'Ver', `cpConferirPedido('${p.id}')`)}
              ${btn('printer', 'Imprimir', `_rcImprimir('${p.id}')`)}
              ${aberto ? btn('x', 'Cancelar', `_rcCancelar('${p.id}')`, 'style="color:var(--danger-fg)"') : ''}
            </div></td></tr>`;
        }).join('') : `<tr><td colspan="6" style="padding:44px;text-align:center;color:var(--muted)">Nenhum pedido em aberto nem recebido no período. Os pedidos chegam aqui quando um lote de cotação é concluído.</td></tr>`}</tbody>
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
  const fr = Number(p.frete) || 0;
  const total = its.reduce((t, i) => t + (Number(i.qtd_pedida) || 0) * (Number(i.preco_combinado) || 0), 0) + fr;
  return `Olá${s?.seller ? ', ' + s.seller.charAt(0) + s.seller.slice(1).toLowerCase() : ''}! Aqui é da Vai Ter Pizza.\nSegue nosso pedido:\n\n${linhas.join('\n')}\n\n${fr ? `Entrega: ${_estR(fr)}\n` : ''}Total estimado: ${_estR(total)}\nPode confirmar o pedido e a previsão de entrega? Obrigado!`;
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
  const primeira = its.every(i => !(Number(i.qtd_recebida) > 0));
  _rcAtual = { p, its, fotos: [], nota: null, notaArquivo: null, numero: '', chave: null, doc: '', data: _rcHoje(), frete: primeira ? (Number(p.frete) || 0) : 0 };
  const aberto = ['rascunho', 'solicitado', 'parcial'].includes(p.status);
  _estModal('ovRcConf', `${aberto ? 'Conferência' : 'Pedido'} · ${_estEsc(p.fornecedor_nome)}`, '', aberto ? '_rcConfirmar()' : `document.getElementById('ovRcConf').remove()`, aberto ? 'Confirmar recebimento e dar entrada no estoque' : 'Fechar', 980);
  _rcRenderConf();
}

function _rcRenderConf() {
  const a = _rcAtual, p = a.p;
  const aberto = ['rascunho', 'solicitado', 'parcial'].includes(p.status);
  const body = document.getElementById('ovRcConf-body');
  const th = (t, sub = '', al = 'right') => `<th style="padding:9px 10px;text-align:${al};font-size:var(--text-xs);font-weight:700;color:var(--muted);white-space:nowrap;vertical-align:bottom">${t}${sub ? `<div style="font-weight:500;font-size:var(--text-2xs)">${sub}</div>` : ''}</th>`;
  const num = (k, campo, val, w = 100, extra = '') => `<input class="inp" type="text" inputmode="decimal" value="${val == null || val === '' ? '' : String(val).replace('.', ',')}" style="width:${w}px;text-align:right;font-weight:700;${extra}" oninput="_rcSet(${k},'${campo}',this.value)">`;
  body.innerHTML = `
    ${aberto ? `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
      ${_estCampo('Data do recebimento', `<input class="inp" type="date" value="${a.data}" onchange="_rcAtual.data=this.value">`)}
      ${_estCampo('Nº da nota', `<input class="inp" value="${_estEsc(a.numero)}" oninput="_rcAtual.numero=this.value" placeholder="opcional">`)}
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('file-text', 13, 'currentColor')} ${a.notaArquivo ? 'Nota anexada ✓' : 'Anexar nota (XML, foto ou PDF)'}
        <input type="file" accept=".xml,.pdf,image/*" style="display:none" onchange="_rcAnexarNota(this.files[0])"></label>
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('camera', 13, 'currentColor')} Fotos do recebimento${a.fotos.length ? ` (${a.fotos.length})` : ''}
        <input type="file" accept="image/*" multiple capture="environment" style="display:none" onchange="_rcAtual.fotos.push(...this.files);_rcRenderConf()"></label>
      <span id="rcNotaStatus" style="font-size:var(--text-xs);color:var(--muted)"></span>
    </div>` : ''}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>
          ${th('Produto', '', 'left')}${th('Pedido', 'quantidade')}${th('Já recebido', 'quantidade')}
          ${aberto ? th('Recebido agora', 'quantidade') : ''}
          ${th('Preço combinado', 'R$ por unidade')}${th(aberto ? 'Preço cobrado' : 'Preço final', 'R$ por unidade')}${th('Total', 'R$ = qtd × preço')}
        </tr></thead>
        <tbody>${a.its.map((i, k) => {
          const u = _estEsc(i.unidade || 'un');
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:9px 10px;font-weight:600">${_estEsc(i.item_nome)}${i.notaDesc ? `<div style="font-size:var(--text-xs);color:var(--muted);font-weight:400">na nota: ${_estEsc(i.notaDesc)}</div>` : ''}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap">${_estQ(i.qtd_pedida)} ${u}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${_estQ(i.qtd_recebida)} ${u}</td>
            ${aberto ? `<td style="padding:9px 10px;text-align:right;white-space:nowrap">${num(k, 'receber', i.receber)} <span style="font-size:var(--text-xs);color:var(--muted)">${u}</span>
              <div id="rcDifQ${k}" style="font-size:var(--text-2xs);color:var(--orange-dark)"></div></td>` : ''}
            <td style="padding:9px 10px;text-align:right;white-space:nowrap;color:var(--text2)">${i.preco_combinado ? `${_estR(i.preco_combinado)}/${u}` : '—'}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap">${aberto ? `R$ ${num(k, 'precoFinal', i.precoFinal, 90)} <span style="font-size:var(--text-xs);color:var(--muted)">/${u}</span>
              <div id="rcDifP${k}" style="font-size:var(--text-2xs);color:var(--danger-fg)"></div>` : `${i.preco_final ? `${_estR(i.preco_final)}/${u}` : '—'}`}</td>
            <td style="padding:9px 10px;text-align:right;white-space:nowrap;font-weight:700" id="rcSub${k}">${_estR((aberto ? i.receber : i.qtd_recebida) * (aberto ? i.precoFinal : (i.preco_final || 0)))}</td></tr>`;
        }).join('')}</tbody>
        ${aberto ? `<tfoot>
          <tr style="border-top:1.5px solid var(--border)"><td colspan="6" style="padding:8px 10px;text-align:right;color:var(--text2)">Itens</td><td style="padding:8px 10px;text-align:right" id="rcItens"></td></tr>
          <tr><td colspan="6" style="padding:6px 10px;text-align:right;color:var(--text2)">Entrega (R$)</td><td style="padding:6px 10px;text-align:right">
            <input class="inp" type="text" inputmode="decimal" value="${a.frete ? String(a.frete).replace('.', ',') : ''}" placeholder="0,00" style="width:100px;text-align:right" oninput="_rcAtual.frete=_rcNum(this.value);_rcTotal()"></td></tr>
          <tr><td colspan="6" style="padding:10px;text-align:right;font-weight:700">Total desta entrega</td><td style="padding:10px;text-align:right;font-weight:800" id="rcTotal"></td></tr>
        </tfoot>` : ''}
      </table></div>
    ${aberto ? _estDica(`Quantidade na unidade do insumo, preço em R$ por unidade (kg, un…) e total em reais. Se veio só uma parte, confirme o que chegou: o pedido fica como "Recebido parcial" e o restante continua em aberto. O preço cobrado vira o custo do item; a entrega entra no total da compra.${a.nota ? ' Valores preenchidos pela nota — confira.' : ''}`) : ''}`;
  if (aberto) _rcTotal();
}

// Aceita "4,2", "4.2" e "1.234,56"
const _rcNum = v => { let t = String(v ?? '').trim(); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isNaN(n) ? 0 : n; };
function _rcSet(k, campo, v) { _rcAtual.its[k][campo] = _rcNum(v); _rcTotal(); }

// Recalcula na hora: total da linha (qtd × preço), avisos e totais
function _rcTotal() {
  const a = _rcAtual;
  let itens = 0;
  a.its.forEach((i, k) => {
    const sub = (i.receber || 0) * (i.precoFinal || 0); itens += sub;
    const el = document.getElementById('rcSub' + k); if (el) el.textContent = _estR(sub);
    const dq = document.getElementById('rcDifQ' + k);
    if (dq) dq.textContent = Math.abs((i.receber || 0) - i.falta) > 0.0005 ? ((i.receber || 0) < i.falta ? `faltou ${_estQ(i.falta - (i.receber || 0))}` : 'veio a mais') : '';
    const dp = document.getElementById('rcDifP' + k);
    if (dp) dp.textContent = i.preco_combinado && Math.abs((i.precoFinal || 0) - Number(i.preco_combinado)) > 0.005 ? 'diferente do combinado' : '';
  });
  const ei = document.getElementById('rcItens'); if (ei) ei.textContent = _estR(itens);
  const el = document.getElementById('rcTotal'); if (el) el.textContent = _estR(itens + (a.frete || 0));
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
    const frete = Math.round((a.frete || 0) * 100) / 100;
    const total = Math.round((recebidos.reduce((t, i) => t + i.receber * (i.precoFinal || 0), 0) + frete) * 100) / 100;
    const [compra] = await cpInsert('cp_compras', {
      data_compra: a.data, fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, fornecedor_doc: a.doc || null,
      numero_nota: a.numero || null, chave_nfe: a.chave || null, origem: 'pedido', pedido_id: p.id, total, frete,
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

/**
 * VTP Compras — Vai Ter Pizza!
 * cp-recebimento.js — Aba "Recebimento": um pedido por fornecedor
 *
 * Chegam aqui os pedidos enviados na aba Cotação (Pedido solicitado).
 * Status: Pedido solicitado → Recebido (com ou sem divergência) · ou Cancelado.
 *         ("Recebido parcial" só existe no histórico antigo.)
 * Conferência: embalagem, quantidade e valor de cada item como veio na nota,
 *         impostos/frete; divergência só sinaliza, a baixa é geral.
 *         Confirmar = gera a Compra (origem "pedido") e dá entrada no estoque.
 */

let _rcDados = null;
let _rcAtual = null;

const RC_STATUS = {
  rascunho:   { label: 'Rascunho',          cls: 'b-gray',   icon: 'edit-3'       },
  solicitado: { label: 'Pedido solicitado', cls: 'b-purple', icon: 'send'         },
  parcial:    { label: 'Recebido parcial',  cls: 'b-orange', icon: 'package'      },
  recebido:   { label: 'Recebido',          cls: 'b-green',  icon: 'check-circle' },
  aprovado:   { label: 'Aprovado · a enviar', cls: 'b-gray', icon: 'check'        },
  cancelado:  { label: 'Cancelado',         cls: 'b-red',    icon: 'x-circle'     },
};

const _rcAtivo = i => !i.removido_em;
const _rcHoje = () => cpIso(new Date());

const _rcAberto = p => ['solicitado', 'parcial'].includes(p.status);
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
      const pedidos = (await cpSelect('cp_pedidos', q => q.select('*').is('excluido_em', null).in('status', ['solicitado', 'parcial', 'recebido', 'cancelado'])
        .or(`status.in.(solicitado,parcial),and(updated_at.gte.${r.inicioISO},created_at.lte.${r.fimISO})`).order('created_at', { ascending: false })))
        .filter(p => _rcAberto(p) || (t => t >= ini && t <= fim)(_estMs(_rcDataFech(p))));
      const ids = pedidos.map(p => p.id);
      const itens = ids.length ? (await cpSelect('cp_pedido_itens', q => q.select('*').in('pedido_id', ids))).filter(_rcAtivo) : [];
      const porPedido = new Map();
      itens.forEach(i => { if (!porPedido.has(i.pedido_id)) porPedido.set(i.pedido_id, []); porPedido.get(i.pedido_id).push(i); });
      // Compras avulsas (lançadas direto na aba Compras) também são recebimentos
      const avulsas = await cpSelect('cp_compras', q => q.select('*').is('excluido_em', null).neq('origem', 'pedido')
        .gte('created_at', r.inicioISO).lte('created_at', r.fimISO));
      const nAvulsa = new Map();
      if (avulsas.length) (await cpSelect('cp_compra_itens', q => q.select('compra_id').in('compra_id', avulsas.map(c => c.id))))
        .forEach(i => nAvulsa.set(i.compra_id, (nAvulsa.get(i.compra_id) || 0) + 1));
      _rcDados = { pedidos, porPedido, avulsas, nAvulsa };
    } catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">Não consegui carregar os pedidos: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="cpRenderAbaRecebimento(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('cpAbaBody') || _cpAba !== 'recebimento') return;   // trocou de aba enquanto carregava
  _rcRenderLista();
}

function _rcAlerta(p) {
  if (p.status === 'recebido' && Array.isArray(p.divergencias) && p.divergencias.length) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);white-space:nowrap">${lc('alert-triangle', 11, 'currentColor')} com divergência (${p.divergencias.length})</span>`;
  }
  if (['solicitado', 'parcial'].includes(p.status) && p.previsao_entrega && p.previsao_entrega < _rcHoje()) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--text-xs);font-weight:700;color:var(--danger-fg);white-space:nowrap">${lc('clock', 11, 'currentColor')} entrega atrasada</span>`;
  }
  return '';
}

function _rcRenderLista() {
  const el = document.getElementById('cpAbaBody');
  const { pedidos, porPedido, avulsas = [], nAvulsa = new Map() } = _rcDados;
  // Lista única: em aberto primeiro (rascunho → solicitado → parcial), depois recebidos e cancelados
  // Em aberto primeiro; depois recebidos, compras avulsas e cancelados, do mais recente para o mais antigo
  const lista = [...pedidos.map(p => ({ k: 'p', p, t: _estMs(_rcAberto(p) ? p.created_at : _rcDataFech(p)) })),
                 ...avulsas.map(c => ({ k: 'c', c, t: _estMs(c.created_at) }))]
    .sort((x, y) => ((x.k === 'p' && _rcAberto(x.p) ? 0 : 1) - (y.k === 'p' && _rcAberto(y.p) ? 0 : 1)) || (y.t - x.t));
  const btn = (icon, txt, fn, extra = '') => `<button class="btn btn-outline btn-xs" onclick="event.stopPropagation();${fn}" ${extra}>${lc(icon, 12, 'currentColor')} ${txt}</button>`;
  el.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      ${_perRenderBar('cprec', '_rcRecarregar')}
      <span style="font-size:var(--text-sm);color:var(--text2)">${pedidos.filter(_rcAberto).length} em aberto (sempre aparecem) · ${pedidos.filter(p => !_rcAberto(p)).length} pedido(s) recebido(s) ou cancelado(s) · ${avulsas.length} compra(s) avulsa(s) no período</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="cpRenderAbaRecebimento(true)" title="Recarregar">${lc('refresh-cw', 13, 'currentColor')}</button>
    </div>
    <div class="card" style="margin-bottom:0">
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
        <thead style="background:var(--surface2)"><tr>${['Fornecedor', 'Status', 'Previsão', 'Itens', 'Total', 'Ações'].map((h, i) =>
          `<th style="padding:11px 14px;text-align:${[3, 4].includes(i) ? 'right' : 'left'};font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${h}</th>`).join('')}</tr></thead>
        <tbody>${lista.length ? lista.map(({ k, p, c }) => {
          if (k === 'c') return `<tr style="border-top:1px solid var(--border);background:color-mix(in srgb, var(--info-bg) 25%, transparent)">
            <td style="padding:12px 14px"><div style="font-weight:700">${_estEsc(c.fornecedor_nome || '—')}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">nota de ${cpDataBr(c.data_compra)}${c.numero_nota ? ' · NF ' + _estEsc(c.numero_nota) : ''}</div></td>
            <td style="padding:12px 14px"><span class="badge" style="background:var(--info-bg);color:var(--info-fg);font-size:var(--text-xs);padding:4px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${lc('shopping-cart', 11, 'currentColor')} Compra avulsa</span>
              <div style="font-size:var(--text-xs);color:var(--text2);margin-top:3px">registrada ${_estDH(c.created_at)}${c.criado_por ? ' por ' + _estEsc(c.criado_por) : ''}</div></td>
            <td style="padding:12px 14px;color:var(--muted)">—</td>
            <td style="padding:12px 14px;text-align:right">${nAvulsa.get(c.id) || 0}</td>
            <td style="padding:12px 14px;text-align:right;font-weight:700;white-space:nowrap">${_estR(c.total)}</td>
            <td style="padding:12px 14px">${btn('eye', 'Ver', `_rcVerCompra('${c.id}')`)}</td></tr>`;
          const its = porPedido.get(p.id) || [];
          const st = RC_STATUS[p.status];
          const aberto = _rcAberto(p);
          const fundo = p.status === 'solicitado' ? 'background:color-mix(in srgb, var(--info-bg) 35%, transparent)'
            : p.status === 'recebido' ? 'background:color-mix(in srgb, var(--success-bg) 45%, transparent)'
            : p.status === 'cancelado' ? 'opacity:.6' : '';
          return `<tr style="border-top:1px solid var(--border);${fundo}">
            <td style="padding:12px 14px"><div style="font-weight:700">${_estEsc(p.fornecedor_nome)}</div>
              <div style="font-size:var(--text-xs);color:var(--muted)">montado ${_estDH(p.created_at)} por ${_estEsc(p.criado_por)}${p.aprovado_por ? ` · aprovado por ${_estEsc(p.aprovado_por)}` : ''}</div></td>
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
              ${aberto ? `<button class="btn btn-primary btn-xs" onclick="event.stopPropagation();cpConferirPedido('${p.id}')">${lc('clipboard-check', 12, '#fff')} Conferir</button>` : btn('eye', 'Ver', `cpConferirPedido('${p.id}')`)}
              ${btn('printer', 'Imprimir', `_rcImprimir('${p.id}')`)}
              ${aberto ? btn('x', 'Cancelar', `_rcCancelar('${p.id}')`, 'style="color:var(--danger-fg)"') : ''}
            </div></td></tr>`;
        }).join('') : `<tr><td colspan="6" style="padding:44px;text-align:center;color:var(--muted)">Nenhum pedido em aberto nem recebido no período. Os pedidos chegam aqui quando são enviados ao fornecedor na aba Cotação.</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

function _rcVerCompra(id) {
  const c = _rcDados?.avulsas?.find(x => x.id === id);
  if (!c) return;
  if (!_cpComprasDados?.compras?.some(x => x.id === id)) _cpComprasDados = { chave: null, compras: [...(_cpComprasDados?.compras || []), c] };
  cpVerCompra(id);
}

const _rcPedido = id => _rcDados?.pedidos.find(p => p.id === id);

// Mensagem do pedido a partir dos itens atuais (reflete ajustes)
function _rcMensagem(p, its) {
  const s = cpFornecedor(p.fornecedor_id);
  const linhas = its.map(i => {
    const ap = i.apresentacao && Number(i.apresentacao.fator) > 0 ? i.apresentacao : null;
    return `• ${i.item_nome} — ${estQtdApresentacao(i.qtd_pedida, i.unidade, ap)}${i.preco_combinado ? ` · ${_estR(i.preco_combinado * (ap?.fator || 1))}/${ap?.nome || i.unidade || 'un'}` : ''}`;
  });
  const fr = Number(p.frete) || 0;
  const total = its.reduce((t, i) => t + (Number(i.qtd_pedida) || 0) * (Number(i.preco_combinado) || 0), 0) + fr;
  return `Olá${s?.seller ? ', ' + s.seller.charAt(0) + s.seller.slice(1).toLowerCase() : ''}! Aqui é da Vai Ter Pizza.\nSegue nosso pedido:\n\n${linhas.join('\n')}\n\n${fr ? `Entrega: ${_estR(fr)}\n` : ''}Total estimado: ${_estR(total)}\nPode confirmar o pedido e a previsão de entrega? Obrigado!`;
}

function _rcCopiarMsg(id) {
  const p = _rcPedido(id);
  _ctCopiar(_rcMensagem(p, _rcDados.porPedido.get(id) || []));
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
    ${p.status === 'parcial' ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px">O que já foi recebido continua no estoque; só o restante é cancelado.</div>` : ''}`,
    `_rcConfirmarCancelamento('${id}')`, 'Cancelar pedido', 520);
}

async function _rcConfirmarCancelamento(id) {
  const motivo = document.getElementById('rcCancMotivo').value.trim();
  if (!motivo) return toast('Informe o motivo', 'err');
  _estSalvarComBotao('ovRcCanc', async () => {
    await cpUpdate('cp_pedidos', id, { status: 'cancelado', cancelado_por: estUsuario(), cancelado_em: new Date().toISOString(), cancelado_motivo: motivo });
    toast('Pedido cancelado', 'ok');
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
    ${its.map(i => `<tr><td>${_estEsc(i.item_nome)}</td><td class="r">${_estEsc(estQtdApresentacao(i.qtd_pedida, i.unidade, i.apresentacao))}</td><td class="r">${i.preco_combinado ? _estR(i.preco_combinado) : '—'}</td><td class="r">${_estR((i.qtd_pedida || 0) * (i.preco_combinado || 0))}</td><td></td></tr>`).join('')}
    </tbody><tfoot><tr><th colspan="3" class="r">Total estimado</th><th class="r">${_estR(p.total_previsto)}</th><th></th></tr></tfoot></table>
    <p class="m" style="margin-top:28px">Conferido por: ______________________ &nbsp; Data: ___/___/______</p>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

// ══════════════════════════════════════════════════════════════
// CONFERÊNCIA — cada item na embalagem em que veio (Caixa, Lata… ou kg),
// valor unitário ou total, impostos/frete da nota. Se algo não bater com o
// pedido, sinaliza, mas a baixa é geral: o pedido fecha. Para completar,
// faz-se outro pedido.
// ══════════════════════════════════════════════════════════════

const _rcEhAberto = p => ['solicitado', 'parcial'].includes(p.status);

function cpConferirPedido(id) {
  const p = _rcPedido(id);
  const its = _rcDados.porPedido.get(id) || [];
  const aberto = _rcEhAberto(p);
  if (!aberto) return _rcVerFechado(p, its);
  const linhas = its.map(pi => {
    const item = items.find(x => x.id === pi.item_id);
    const falta = Math.max(0, (Number(pi.qtd_pedida) || 0) - (Number(pi.qtd_recebida) || 0));
    const ap = pi.apresentacao && Number(pi.apresentacao.fator) > 0 ? { nome: pi.apresentacao.nome, fator: Number(pi.apresentacao.fator) } : null;
    const f = ap?.fator || 1;
    const precoBase = Number(pi.preco_combinado) || Number(item?.cost) || 0;
    return { ..._cpLinhaVazia(), pi, falta, item_id: pi.item_id, ap, n: _estRound(falta / f), modo: 'unit', vUnit: precoBase ? Math.round(precoBase * f * 10000) / 10000 : null };
  });
  const primeira = its.every(i => !(Number(i.qtd_recebida) > 0));
  _rcAtual = { p, linhas, fotos: [], nota: null, notaArquivo: null, numero: '', chave: null, doc: '', data: _rcHoje(),
               extras: { ...cpExtrasVazio(), frete: primeira ? (Number(p.frete) || 0) : 0 }, totalNota: null };
  _estModal('ovRcConf', `Conferência · ${_estEsc(p.fornecedor_nome)}`, '', '_rcConfirmar()', 'Dar baixa e entrada no estoque', 980);
  _rcRenderConf();
}

function _rcLinhaHtml(l, k) {
  const it = items.find(i => i.id === l.item_id);
  const u = it?.unit || l.pi?.unidade || 'un';
  const ped = l.pi ? `Pedido: <strong>${_estEsc(estQtdApresentacao(l.falta, u, l.pi.apresentacao))}</strong>${Number(l.pi.preco_combinado) ? ` · ${l.pi.preco_cotado != null ? 'cotado' : 'estimado'} ${_estR(l.pi.preco_combinado)}/${_estEsc(u)}` : ''}` : '<span style="color:var(--orange-dark);font-weight:700">Fora do pedido</span>';
  return `<div id="rcL${k}" style="border:1.5px solid var(--border);border-radius:var(--r8);padding:10px 12px;margin-bottom:8px;background:var(--card-bg)">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <div><strong style="font-size:var(--text-md)">${_estEsc(it?.name || l.pi?.item_nome || 'Item da nota')}</strong>
        ${l.desc_nota ? `<div style="font-size:var(--text-xs);color:var(--muted)">na nota: ${_estEsc(l.desc_nota)} · ${_estQ(l.qtd_nota)} ${_estEsc(l.unid_nota || '')} · ${_estR(l.valor_nota)}</div>` : ''}</div>
      <div style="font-size:var(--text-xs);color:var(--text2);text-align:right">${ped}
        ${!l.pi ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger-fg)" onclick="_rcAtual.linhas.splice(${k},1);_rcRenderConf()">${lc('trash-2', 12, 'currentColor')}</button>` : ''}</div>
    </div>
    <div>${cpLinhaCamposHtml(l, k, '_rc', { comItem: !l.pi })}</div>
    <div id="_rcDiv${k}" style="font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);margin-top:2px"></div>
  </div>`;
}

function _rcRenderConf() {
  const a = _rcAtual;
  const body = document.getElementById('ovRcConf-body');
  if (!body) return;
  body.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      ${_estCampo('Data da nota', `<input class="inp" type="date" value="${a.data}" onchange="_rcAtual.data=this.value">`)}
      ${_estCampo('Nº da nota', `<input class="inp" value="${_estEsc(a.numero)}" oninput="_rcAtual.numero=this.value" placeholder="opcional">`)}
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('file-text', 13, 'currentColor')} ${a.notaArquivo ? 'Nota anexada ✓' : 'Anexar nota (XML, foto ou PDF)'}
        <input type="file" accept=".xml,.pdf,image/*" style="display:none" onchange="_rcAnexarNota(this.files[0])"></label>
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('camera', 13, 'currentColor')} Fotos do recebimento${a.fotos.length ? ` (${a.fotos.length})` : ''}
        <input type="file" accept="image/*" multiple capture="environment" style="display:none" onchange="_rcAtual.fotos.push(...this.files);_rcRenderConf()"></label>
      <span id="rcNotaStatus" style="font-size:var(--text-xs);color:var(--muted)"></span>
    </div>
    ${a.linhas.map(_rcLinhaHtml).join('')}
    <button class="btn btn-ghost btn-sm" onclick="_rcAtual.linhas.push({..._cpLinhaVazia(), pi: null});_rcRenderConf()">${lc('plus', 13, 'currentColor')} Item que veio fora do pedido</button>
    ${cpTotaisNotaHtml(a.extras, a.totalNota, '_rc', CP_EXTRAS.some(e => a.extras[e.k]) || !!a.nota)}
    <div id="rcResumo" style="margin-top:12px"></div>
    <div id="rcDivResumo" style="margin-top:10px"></div>`;
  _rcAtualizar();
}

// Divergências da linha com o pedido (quantidade e custo por unidade)
function _rcDivergencias(l, acr) {
  if (!l.pi) return [];
  const c = cpLinhaCalc(l), u = l.pi.unidade || '';
  const out = [];
  if (Math.abs(c.qtd - l.falta) > 0.0005) out.push({ item: l.pi.item_nome, tipo: 'qtd', pedido: _estRound(l.falta), recebido: _estRound(c.qtd), unidade: u,
    txt: c.qtd <= 0.0005 ? 'não veio' : c.qtd < l.falta ? `veio ${_estQ(l.falta - c.qtd)} ${u} a menos` : `veio ${_estQ(c.qtd - l.falta)} ${u} a mais` });
  const est = Number(l.pi.preco_combinado) || 0;
  if (est > 0 && c.qtd > 0) {
    const custo = (c.total + acr) / c.qtd;
    if (Math.abs(custo - est) / est > 0.02) out.push({ item: l.pi.item_nome, tipo: 'preco', pedido: est, recebido: Math.round(custo * 10000) / 10000, unidade: u,
      txt: `custo ${_estR(custo)}/${u} (${custo > est ? '+' : '−'}${Math.round(Math.abs(custo - est) / est * 100)}% do ${l.pi.preco_cotado != null ? 'cotado' : 'estimado'})` });
  }
  return out;
}

function _rcAtualizar() {
  const a = _rcAtual;
  const rat = cpRatear(a.linhas, a.extras);
  const todas = [];
  a.linhas.forEach((l, k) => {
    const acr = rat.get(l) || 0;
    const el = document.getElementById('_rcConv' + k); if (el) el.innerHTML = cpConvTexto(l, acr);
    const dv = _rcDivergencias(l, acr); todas.push(...dv);
    const d = document.getElementById('_rcDiv' + k); if (d) d.innerHTML = dv.map(x => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">${lc('alert-triangle', 11, 'currentColor')} ${_estEsc(x.txt)}</span>`).join('');
    const box = document.getElementById('rcL' + k); if (box) box.style.borderColor = dv.length ? 'var(--orange)' : 'var(--border)';
  });
  const r = document.getElementById('rcResumo');
  if (r) r.innerHTML = cpTotaisResumoHtml(cpResumoNota(a.linhas, a.extras), a.totalNota);
  const dr = document.getElementById('rcDivResumo');
  if (dr) dr.innerHTML = todas.length ? `<div style="padding:9px 12px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm)">
      <strong>${todas.length} divergência(s) com o pedido.</strong> A baixa é geral: o pedido fecha como "Recebido com divergência". Se faltou algo, faça outro pedido para completar.</div>` : '';
  a.divs = todas;
}

function _rcLinha(k, campo, v) {
  const l = _rcAtual.linhas[k];
  if (cpLinhaSet(l, campo, v)) {
    const box = document.getElementById('rcL' + k);
    if (box) box.outerHTML = _rcLinhaHtml(l, k);
  }
  else cpLinhaSincronizar(l, k, '_rc', campo);
  _rcAtualizar();
}

function _rcExtra(k, v) {
  if (k === 'totalNota') _rcAtual.totalNota = cpNum(v);
  else _rcAtual.extras[k] = cpNum(v) || 0;
  _rcAtualizar();
}

// Nota anexada: preenche as linhas dos itens que casarem; o resto entra como "fora do pedido"
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
    const campos = ['ap', 'n', 'modo', 'vTotal', 'vUnit', 'impNota', 'desc_nota', 'cod_nota', 'qtd_nota', 'unid_nota', 'valor_nota', 'fator', 'memoria', 'sugestao'];
    for (const l of dados.itens) {
      const alvo = l.item_id && a.linhas.find(x => x.pi && x.item_id === l.item_id && !x.desc_nota);
      if (alvo) { campos.forEach(c => { alvo[c] = l[c]; }); casados++; }
      else a.linhas.push({ ...l, pi: null });
    }
    // Item do pedido que não está na nota: não veio
    for (const x of a.linhas) if (x.pi && !x.desc_nota) x.n = 0;
    Object.assign(a, { nota: dados, notaArquivo: file, numero: dados.numero || a.numero, chave: dados.chave, doc: dados.fornecedorDoc,
                       data: dados.data || a.data, totalNota: dados.totalNota ?? a.totalNota,
                       extras: { ...dados.extras, frete: dados.extras?.frete || a.extras.frete } });
    _rcRenderConf();
    const s2 = document.getElementById('rcNotaStatus');
    if (s2) s2.innerHTML = `<span style="color:var(--success-fg)">${casados} de ${a.linhas.filter(x => x.pi).length} itens do pedido preenchidos pela nota</span>`;
  } catch (e) { msg(`<span style="color:var(--danger-fg)">Não consegui ler a nota: ${_estEsc(e.message)}</span>`); }
}

async function _rcConfirmar() {
  const a = _rcAtual, p = a.p;
  _rcAtualizar();
  const rat = cpRatear(a.linhas, a.extras);
  if (!rat.size) return toast('Nada recebido: informe as quantidades que chegaram', 'err');
  if (a.linhas.some(l => !l.pi && !l.item_id && cpLinhaCalc(l).n > 0)) return toast('Ligue os itens fora do pedido a um insumo (ou remova a linha)', 'err');
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
    const ex = a.extras, r = cpResumoNota(a.linhas, ex);
    const [compra] = await cpInsert('cp_compras', {
      data_compra: a.data, fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, fornecedor_doc: a.doc || null,
      numero_nota: a.numero || null, chave_nfe: a.chave || null, origem: 'pedido', pedido_id: p.id, total: r.total,
      frete: _cpR2(ex.frete), ipi: _cpR2(ex.ipi), icms_st: _cpR2(ex.icms_st), seguro: _cpR2(ex.seguro), outras: _cpR2(ex.outras), desconto: _cpR2(ex.desconto),
      anexo_path: anexo, fotos: fotos.length ? fotos : null, criado_por: user,
    });
    const validas = [...rat.keys()];
    const linhas = await cpInsert('cp_compra_itens', cpLinhasParaSalvar(a.linhas, ex, compra.id, user));
    await cpDarEntradaEstoque(compra, linhas);
    const comNota = linhas.filter(l => l.desc_nota);
    if (comNota.length) await _cpSalvarMemoriaNota({ fornecedorDoc: a.doc, fornecedorId: p.fornecedor_id, fornecedorNome: p.fornecedor_nome }, comNota);
    // Atualiza o recebido de cada item do pedido (quem não veio fica com o que já tinha)
    for (const l of a.linhas.filter(x => x.pi)) {
      const k = validas.indexOf(l);
      const q = k >= 0 ? cpLinhaCalc(l).qtd : 0;
      await cpUpdate('cp_pedido_itens', l.pi.id, { qtd_recebida: _estRound((Number(l.pi.qtd_recebida) || 0) + q), preco_final: k >= 0 ? linhas[k].preco_unit : null });
    }
    const divs = (a.divs || []).map(({ txt, ...d }) => d);
    await cpUpdate('cp_pedidos', p.id, { status: 'recebido', recebido_por: user, recebido_em: new Date().toISOString(), divergencias: divs.length ? divs : null,
      solicitado_em: p.solicitado_em || new Date().toISOString(), solicitado_por: p.solicitado_por || user });
    document.getElementById('ovRcConf')?.remove();
    _rcAtual = null;
    toast(`Pedido recebido${divs.length ? ' com divergência' : ''} · ${linhas.length} item(ns) entraram no estoque`, 'ok');
    _cpComprasDados = null;
    cpRenderAbaRecebimento(true);
  } catch (e) {
    toast('Não consegui confirmar: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Dar baixa e entrada no estoque'; }
  }
}

// Pedido já fechado: o que foi pedido × o que veio
function _rcVerFechado(p, its) {
  const divs = Array.isArray(p.divergencias) ? p.divergencias : [];
  _estModal('ovRcConf', `Pedido · ${_estEsc(p.fornecedor_nome)}`, `
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:10px">${RC_STATUS[p.status]?.label || p.status}${p.recebido_em ? ` em ${_estDH(p.recebido_em)}${p.recebido_por ? ' por ' + _estEsc(p.recebido_por) : ''}` : ''}</div>
    ${divs.length ? `<div style="padding:9px 12px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm);margin-bottom:10px">
      <strong>Divergências:</strong> ${divs.map(d => `${_estEsc(d.item)}: ${d.tipo === 'qtd' ? `pedido ${_estQ(d.pedido)} ${_estEsc(d.unidade || '')}, veio ${_estQ(d.recebido)}` : `estimado ${_estR(d.pedido)}, custou ${_estR(d.recebido)}`}`).join(' · ')}</div>` : ''}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${its.map(i => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-top:1px solid var(--border);font-size:var(--text-sm)">
        <div><strong>${_estEsc(i.item_nome)}</strong><div style="font-size:var(--text-xs);color:var(--muted)">pedido ${_estEsc(estQtdApresentacao(i.qtd_pedida, i.unidade, i.apresentacao))}${i.preco_combinado ? ` · ${i.preco_cotado != null ? 'cotado' : 'estimado'} ${_estR(i.preco_combinado)}/${_estEsc(i.unidade || 'un')}` : ''}</div></div>
        <div style="text-align:right;white-space:nowrap">${_estQ(i.qtd_recebida)} ${_estEsc(i.unidade || '')}<div style="font-size:var(--text-xs);color:var(--muted)">${i.preco_final ? _estR(i.preco_final) + '/' + _estEsc(i.unidade || 'un') : '—'}</div></div></div>`).join('')}
    </div>`, `document.getElementById('ovRcConf').remove()`, 'Fechar', 680);
}

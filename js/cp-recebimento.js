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
  parcial:    { label: 'Aguardando reenvio', cls: 'b-orange', icon: 'package'     },
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
  if (p.status === 'parcial') {
    const its = (_rcDados?.porPedido.get(p.id) || []).filter(i => i.conferencia?.status === 'aguardando');
    const desde = p.aguardando_desde || p.recebido_em;
    const dias = desde ? Math.floor((Date.now() - _estMs(desde)) / 864e5) : 0;
    const atrasado = dias >= RC_REENVIO_DIAS;
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:var(--text-xs);font-weight:700;color:${atrasado ? 'var(--danger-fg)' : 'var(--orange-dark)'};white-space:nowrap">${lc(atrasado ? 'clock' : 'package', 11, 'currentColor')} ${atrasado ? 'reenvio atrasado · ' : ''}falta ${its.length || '?'} item(ns)${desde ? ` · desde ${cpDataBr(desde)}` : ''}</span>`;
  }
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
          return `<tr onclick="cpConferirPedido('${p.id}')" style="border-top:1px solid var(--border);cursor:pointer;${fundo}">
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
            <td style="padding:12px 14px">${aberto ? `<button class="btn btn-primary btn-xs" onclick="event.stopPropagation();cpConferirPedido('${p.id}')">${lc('clipboard-check', 12, '#fff')} Conferir</button>` : btn('eye', 'Ver', `cpConferirPedido('${p.id}')`)}</td></tr>`;
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
// CONFERÊNCIA ITEM A ITEM
//  Cada item: Pendente → ✓ Confere, ou Com problema (aparece sozinho quando quantidade
//  ou preço não batem com o pedido). Problema = o que houve + o que fazer:
//   • Aceitar assim  — entra como veio; motivo obrigatório
//   • Devolver       — só entra o que ficou; valor devolvido é abatido do pagamento
//   • Pedir de novo  — entra o que chegou; o que faltou vai para um pedido novo em Rascunho
//   • Cancelar item  — não veio e não precisa mais
//  "Dar baixa" só libera sem itens pendentes nem problemas sem decisão.
// ══════════════════════════════════════════════════════════════

const _rcEhAberto = p => ['solicitado', 'parcial'].includes(p.status);
const RC_TIPOS = [['qtd', 'Quantidade diferente'], ['preco', 'Preço diferente'], ['errado', 'Produto errado / outra marca'], ['avariado', 'Avariado / vencido'], ['nao_veio', 'Não veio']];
const RC_ACOES = { aceitar: 'Aceitar assim', devolver: 'Devolver', aguardar: 'Aguardar reenvio', pedir: 'Pedir de novo', cancelar: 'Cancelar item', abater: 'Não vem: abater do pagamento' };
const RC_REENVIO_DIAS = 3;   // depois disso o pedido aguardando reenvio fica vermelho

function cpConferirPedido(id) {
  const p = _rcPedido(id);
  let its = _rcDados.porPedido.get(id) || [];
  const aberto = _rcEhAberto(p);
  if (!aberto) return _rcVerFechado(p, its);
  // Reenvio: só os itens que estão aguardando, presos à mesma nota
  const reenvio = p.status === 'parcial' && its.some(i => i.conferencia?.status === 'aguardando');
  if (reenvio) its = its.filter(i => i.conferencia?.status === 'aguardando');
  const linhas = its.map(pi => {
    const item = items.find(x => x.id === pi.item_id);
    const falta = reenvio ? Number(pi.conferencia.qtd_aguardando) || 0 : Math.max(0, (Number(pi.qtd_pedida) || 0) - (Number(pi.qtd_recebida) || 0));
    const ap = pi.apresentacao && Number(pi.apresentacao.fator) > 0 ? { nome: pi.apresentacao.nome, fator: Number(pi.apresentacao.fator) } : null;
    const f = ap?.fator || 1;
    const precoBase = (reenvio && Number(pi.preco_final)) || Number(pi.preco_combinado) || Number(item?.cost) || 0;
    return { ..._cpLinhaVazia(), pi, falta, item_id: pi.item_id, ap, n: _estRound(falta / f), modo: 'unit', vUnit: precoBase ? Math.round(precoBase * f * 10000) / 10000 : null,
      conf: 'pendente', prob: null };
  });
  const primeira = its.every(i => !(Number(i.qtd_recebida) > 0));
  _rcAtual = { p, linhas, reenvio, fotos: [], nota: null, notaArquivo: null, numero: '', chave: null, doc: '', data: _rcHoje(), filtro: 'todos',
               extras: { ...cpExtrasVazio(), frete: primeira ? (Number(p.frete) || 0) : 0 }, totalNota: null,
               pag: p.pagamento ? { ...JSON.parse(JSON.stringify(p.pagamento)), parcelas: [], primeiro: null, manual: false } : null,
               pagCombinado: p.pagamento ? JSON.parse(JSON.stringify(p.pagamento)) : null };
  if (_rcAtual.pag) _rcAtual.pag.primeiro = cpPagPrimeiro(_rcAtual.pag, _rcAtual.data);
  _estModal('ovRcConf', `${reenvio ? 'Reenvio' : 'Conferência'} · ${_estEsc(p.fornecedor_nome)}`, '', '_rcConfirmar()', 'Dar baixa e entrada no estoque', 1000);
  _rcRodapeDiscreto(p, true);
  _rcRenderConf();
  if (reenvio) _rcCarregarCompraOriginal();
}

const _rcUn = l => items.find(i => i.id === l.item_id)?.unit || l.pi?.unidade || 'un';
const _rcF = l => l.ap?.fator > 0 ? l.ap.fator : 1;
const _rcNomeItem = l => items.find(i => i.id === l.item_id)?.name || l.pi?.item_nome || 'Item da nota';

// Linha como ela entra de fato (devolução tira a parte devolvida; cancelado não entra)
function _rcEfetiva(l) {
  const a = l.prob?.acao;
  if (l.conf === 'problema' && (a === 'cancelar' || a === 'abater')) return { ...l, n: 0 };
  if (l.conf === 'problema' && a === 'devolver') {
    const n = Number(l.n) || 0, dev = Math.min(n, Number(l.prob.devN) || 0), frac = n > 0 ? (n - dev) / n : 0;
    return { ...l, n: _estRound(n - dev), vTotal: l.modo === 'total' && l.vTotal != null ? Math.round(l.vTotal * frac * 100) / 100 : l.vTotal };
  }
  return l;
}
const _rcDevolvidoLinha = l => { const c0 = cpLinhaCalc(l), c1 = cpLinhaCalc(_rcEfetiva(l)); return Math.round((c0.total - c1.total) * 100) / 100; };

function _rcLinhaHtml(l, k) {
  const a = _rcAtual, u = _rcUn(l), nome = _rcNomeItem(l), c = cpLinhaCalc(l);
  const oculto = a.filtro !== 'todos' && !(a.filtro === 'pendente' && l.conf === 'pendente') && !(a.filtro === 'problema' && l.conf === 'problema') && !(a.filtro === 'ok' && l.conf === 'ok');
  const ped = l.pi ? `Pedido: <strong>${_estEsc(estQtdApresentacao(l.falta, u, l.pi.apresentacao))}</strong>${Number(l.pi.preco_combinado) ? ` · ${l.pi.preco_cotado != null ? 'cotado' : 'estimado'} ${_estR(l.pi.preco_combinado)}/${_estEsc(u)}` : ''}` : '<span style="color:var(--orange-dark);font-weight:700">Fora do pedido</span>';
  const ic = { pendente: lc('circle', 18, 'var(--muted)'), ok: lc('check-circle', 18, 'var(--success-fg)'), problema: lc('alert-triangle', 18, 'var(--orange-dark)') }[l.conf];
  const borda = { pendente: 'var(--border)', ok: 'var(--success-fg)', problema: 'var(--orange)' }[l.conf];
  // Conferido: card recolhido
  if (l.conf === 'ok') return `<div id="rcL${k}" style="${oculto ? 'display:none;' : ''}border:1.5px solid ${borda};border-radius:var(--r8);padding:9px 12px;margin-bottom:8px;background:color-mix(in srgb, var(--success-bg) 35%, var(--card-bg));display:${oculto ? 'none' : 'flex'};align-items:center;gap:10px">
      ${ic}<div style="flex:1;min-width:0"><strong>${_estEsc(nome)}</strong> <span style="font-size:var(--text-sm);color:var(--text2)">· ${_estEsc(estQtdApresentacao(c.qtd, u, l.ap))} · ${_estR(c.total)}</span></div>
      <button class="btn btn-ghost btn-xs" onclick="_rcConf(${k},'pendente')">${lc('edit-3', 12, 'currentColor')} Editar</button></div>`;
  return `<div id="rcL${k}" style="${oculto ? 'display:none;' : ''}border:1.5px solid ${borda};border-radius:var(--r8);padding:10px 12px;margin-bottom:8px;background:var(--card-bg)">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;align-items:flex-start">
      <div style="display:flex;gap:8px;align-items:flex-start">${ic}<div><strong style="font-size:var(--text-md)">${_estEsc(nome)}</strong>
        ${l.desc_nota ? `<div style="font-size:var(--text-xs);color:var(--muted)">na nota: ${_estEsc(l.desc_nota)} · ${_estQ(l.qtd_nota)} ${_estEsc(l.unid_nota || '')} · ${_estR(l.valor_nota)}</div>` : ''}
        <div style="font-size:var(--text-xs);color:var(--text2)">${ped}</div></div></div>
      <div style="display:flex;gap:6px;align-items:center">
        ${l.conf !== 'problema' ? `<button class="btn btn-outline btn-sm" style="color:var(--orange-dark)" onclick="_rcConf(${k},'problema')">${lc('alert-triangle', 13, 'currentColor')} Problema</button>
          <button class="btn btn-primary btn-sm" id="rcOk${k}" onclick="_rcConf(${k},'ok')">${lc('check', 14, '#fff')} Confere</button>`
          : `<button class="btn btn-ghost btn-xs" onclick="_rcConf(${k},'pendente')">Desfazer</button>`}
        ${!l.pi ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger-fg)" title="Remover linha" onclick="_rcAtual.linhas.splice(${k},1);_rcRenderConf()">${lc('trash-2', 12, 'currentColor')}</button>` : ''}
      </div>
    </div>
    <div>${cpLinhaCamposHtml(l, k, '_rc', { comItem: !l.pi })}</div>
    <div id="_rcDiv${k}" style="font-size:var(--text-xs);font-weight:700;color:var(--orange-dark);margin-top:2px"></div>
    ${l.conf === 'problema' ? _rcProbHtml(l, k) : ''}
  </div>`;
}

function _rcProbHtml(l, k) {
  const pr = l.prob || {}, un = l.ap ? l.ap.nome : _rcUn(l);
  const chip = (on, txt, fn, cor = 'var(--purple)') => `<button type="button" onclick="${fn}" style="padding:5px 11px;border-radius:99px;font-size:var(--text-xs);font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid ${on ? cor : 'var(--border)'};background:${on ? 'var(--card-bg)' : 'transparent'};color:${on ? cor : 'var(--text2)'}">${on ? '● ' : ''}${txt}</button>`;
  const veio = Number(l.n) > 0;
  const acoes = !l.pi ? ['aceitar', 'devolver']
    : _rcAtual.reenvio ? (veio ? ['aceitar', 'aguardar'] : ['aguardar', 'abater', 'pedir'])
    : (veio ? ['aceitar', 'devolver', 'aguardar', 'pedir'] : ['aguardar', 'pedir', 'cancelar']);
  const num = (campo, val) => `<input class="inp" type="text" inputmode="decimal" value="${cpFmtNum(val)}" style="width:90px;text-align:right;font-weight:700" oninput="_rcProb(${k},'${campo}',this.value)">`;
  return `<div style="margin-top:10px;padding:10px 12px;border-radius:var(--r8);background:var(--orange-light)">
    <div style="font-size:var(--text-xs);font-weight:800;color:var(--orange-dark);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">O que houve</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${RC_TIPOS.map(([t, txt]) => chip(pr.tipo === t, txt, `_rcProb(${k},'tipo','${t}')`, 'var(--orange-dark)')).join('')}</div>
    <div style="font-size:var(--text-xs);font-weight:800;color:var(--orange-dark);text-transform:uppercase;letter-spacing:.04em;margin:10px 0 6px">O que fazer</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${acoes.map(ac => chip(pr.acao === ac, RC_ACOES[ac], `_rcProb(${k},'acao','${ac}')`)).join('')}</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
      ${pr.acao === 'devolver' ? `<div class="field" style="margin:0"><label>Devolver quanto (${_estEsc(un)})</label>${num('devN', pr.devN)}</div>
        <label style="display:flex;gap:6px;align-items:center;font-size:var(--text-sm);cursor:pointer;text-transform:none;letter-spacing:0;color:var(--text);font-weight:500;padding-bottom:8px">
          <input type="checkbox" ${pr.repor ? 'checked' : ''} onchange="_rcProb(${k},'repor',this.checked)" style="accent-color:var(--purple)"> Pedir de novo o que foi devolvido</label>` : ''}
      ${pr.acao === 'pedir' ? `<div class="field" style="margin:0"><label>Pedir de novo quanto (${_estEsc(un)})</label>${num('repN', pr.repN)}</div>` : ''}
      ${pr.acao === 'aguardar' ? `<div class="field" style="margin:0"><label>Aguardando quanto (${_estEsc(un)})</label>${num('aguN', pr.aguN)}</div>` : ''}
      <div class="field" style="margin:0;flex:1;min-width:220px"><label>Observação${pr.acao === 'aceitar' ? ' * (motivo)' : ''}</label>
        <input class="inp" value="${_estEsc(pr.obs || '')}" placeholder="${pr.acao === 'aceitar' ? 'ex.: preço subiu na semana, marca trocada aceitável' : 'ex.: veio amassado, motorista avisou'}" oninput="_rcProb(${k},'obs',this.value,true)"></div>
    </div>
    ${pr.acao === 'aguardar' ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);font-weight:700;margin-top:6px">Vem na mesma nota: o pagamento não muda e o pedido fica "Aguardando reenvio".</div>` : ''}
    ${pr.acao === 'abater' ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);font-weight:700;margin-top:6px">${_estR(_rcValorFalta(l))} saem das parcelas em aberto desta nota.</div>` : ''}
    ${pr.acao === 'devolver' ? `<div id="rcDevV${k}" style="font-size:var(--text-xs);color:var(--orange-dark);font-weight:700;margin-top:6px">Valor devolvido: ${_estR(_rcDevolvidoLinha(l))} · abatido do pagamento</div>` : ''}
  </div>`;
}

// Tipo do problema a partir do que foi digitado
function _rcTipoAuto(l, dv) {
  if (!l.pi) return 'errado';
  if (dv.some(d => d.tipo === 'qtd' && d.recebido <= 0.0005)) return 'nao_veio';
  if (dv.some(d => d.tipo === 'qtd')) return 'qtd';
  if (dv.some(d => d.tipo === 'preco')) return 'preco';
  return null;
}

function _rcConf(k, estado) {
  const l = _rcAtual.linhas[k];
  if (estado === 'ok') {
    const dv = _rcDivergencias(l, cpRatear(_rcAtual.linhas.map(_rcEfetiva), _rcAtual.extras).get(_rcEfetiva(l)) || 0);
    if (!l.pi && !l.item_id) return toast('Escolha o insumo antes de conferir', 'err');
    if (dv.length) { toast('Esta linha não bate com o pedido: escolha o que fazer', 'info'); estado = 'problema'; }
  }
  l.conf = estado;
  if (estado === 'problema' && !l.prob) {
    const dv = _rcDivergencias(l, 0), c = cpLinhaCalc(l);
    const f = _rcF(l), faltaN = l.pi ? Math.max(0, _estRound((l.falta - c.qtd) / f)) : 0;
    l.prob = { tipo: _rcTipoAuto(l, dv), acao: null, devN: Number(l.n) || 0, repN: faltaN || null, aguN: faltaN || null, repor: false, obs: '' };
  }
  if (estado === 'pendente') l.prob = null;
  _rcRedesenharLinha(k);
  _rcAtualizar();
}

function _rcProb(k, campo, v, semRedesenho) {
  const l = _rcAtual.linhas[k];
  if (['devN', 'repN', 'aguN'].includes(campo)) l.prob[campo] = cpNum(v);
  else l.prob[campo] = v;
  if (campo === 'acao' && v === 'pedir' && !(l.prob.repN > 0)) l.prob.repN = Math.max(0, _estRound((l.falta - cpLinhaCalc(l).qtd) / _rcF(l))) || null;
  if (campo === 'acao' && v === 'aguardar' && !(l.prob.aguN > 0)) l.prob.aguN = Math.max(0, _estRound((l.falta - cpLinhaCalc(l).qtd) / _rcF(l))) || null;
  if (!semRedesenho && !['devN', 'repN', 'aguN'].includes(campo)) _rcRedesenharLinha(k);
  if (campo === 'devN') { const el = document.getElementById('rcDevV' + k); if (el) el.textContent = `Valor devolvido: ${_estR(_rcDevolvidoLinha(l))} · abatido do pagamento`; }
  _rcAtualizar();
}

function _rcRedesenharLinha(k) {
  const box = document.getElementById('rcL' + k);
  if (box) box.outerHTML = _rcLinhaHtml(_rcAtual.linhas[k], k);
}

function _rcRenderConf() {
  const a = _rcAtual;
  const body = document.getElementById('ovRcConf-body');
  if (!body) return;
  body.innerHTML = a.reenvio ? `
    <div style="padding:10px 12px;border-radius:var(--r8);background:var(--purple-xlight);font-size:var(--text-sm);margin-bottom:12px;line-height:1.5">
      ${lc('package', 14, 'var(--purple)')} <strong>Reenvio da mesma nota.</strong> Confira só o que estava faltando. A nota e o pagamento já foram registrados no primeiro recebimento${a.compraOrig ? ` (nota ${_estEsc(a.compraOrig.numero_nota || '—')} de ${cpDataBr(a.compraOrig.data_compra)})` : ''}.</div>
    <div id="rcProg" style="position:sticky;top:-16px;z-index:5;background:var(--card-bg);padding:8px 0;margin-bottom:6px;border-bottom:1px solid var(--border)"></div>
    ${a.linhas.map(_rcLinhaHtml).join('')}
    <div id="rcResumo" style="margin-top:12px"></div>` : `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      ${_estCampo('Data da nota', `<input class="inp" type="date" value="${a.data}" onchange="_rcAtual.data=this.value">`)}
      ${_estCampo('Nº da nota', `<input class="inp" value="${_estEsc(a.numero)}" oninput="_rcAtual.numero=this.value" placeholder="opcional">`)}
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('file-text', 13, 'currentColor')} ${a.notaArquivo ? 'Nota anexada ✓' : 'Anexar nota (XML, foto ou PDF)'}
        <input type="file" accept=".xml,.pdf,image/*" style="display:none" onchange="_rcAnexarNota(this.files[0])"></label>
      <label class="btn btn-outline btn-sm" style="cursor:pointer;margin-bottom:2px">${lc('camera', 13, 'currentColor')} Fotos do recebimento${a.fotos.length ? ` (${a.fotos.length})` : ''}
        <input type="file" accept="image/*" multiple capture="environment" style="display:none" onchange="_rcAtual.fotos.push(...this.files);_rcRenderConf()"></label>
      <span id="rcNotaStatus" style="font-size:var(--text-xs);color:var(--muted)"></span>
    </div>
    <div id="rcProg" style="position:sticky;top:-16px;z-index:5;background:var(--card-bg);padding:8px 0;margin-bottom:6px;border-bottom:1px solid var(--border)"></div>
    ${a.linhas.map(_rcLinhaHtml).join('')}
    <button class="btn btn-ghost btn-sm" onclick="_rcAtual.linhas.push({..._cpLinhaVazia(), pi: null, conf: 'pendente', prob: null});_rcRenderConf()">${lc('plus', 13, 'currentColor')} Item que veio fora do pedido</button>
    ${a.reenvio ? '' : cpTotaisNotaHtml(a.extras, a.totalNota, '_rc', CP_EXTRAS.some(e => a.extras[e.k]) || !!a.nota)}
    <div id="rcResumo" style="margin-top:12px"></div>
    ${a.reenvio ? '' : `<div style="margin-top:14px;border:1.5px solid var(--border);border-radius:var(--r8);padding:12px 14px;background:var(--card-bg)">
      <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:8px">Pagamento <span style="font-weight:400;color:var(--muted)">· vem o combinado na cotação; com XML, valem as duplicatas da nota; devolução é abatida</span></div><div id="rcPag"></div></div>`}`;
  _rcAtualizar();
}

function _rcFiltro(f) { _rcAtual.filtro = f; _rcRenderConf(); }

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

// Preço por embalagem da linha (o digitado; senão o do pedido)
const _rcPrecoAp = l => { const c = cpLinhaCalc(l); return c.n > 0 && c.total > 0 ? c.total / c.n : (Number(l.pi?.preco_final) || Number(l.pi?.preco_combinado) || 0) * _rcF(l); };
// Valor do que falta (para abater quando não vem)
const _rcValorFalta = l => Math.round((l.falta / _rcF(l)) * _rcPrecoAp(l) * 100) / 100;

// Totais: nota = o que chegou + o que vem no reenvio (está na mesma nota); a pagar = nota − devolvido
function _rcTotais() {
  const a = _rcAtual;
  const chegou = cpResumoNota(a.linhas, a.extras);
  const sum = f => Math.round(a.linhas.reduce((t, l) => t + (l.conf === 'problema' ? f(l) : 0), 0) * 100) / 100;
  const devolvido = sum(l => l.prob?.acao === 'devolver' ? _rcDevolvidoLinha(l) : 0);
  const aguardando = sum(l => l.prob?.acao === 'aguardar' ? (Number(l.prob.aguN) || 0) * _rcPrecoAp(l) : 0);
  const abatido = sum(l => l.prob?.acao === 'abater' ? _rcValorFalta(l) : 0);
  const nota = { ...chegou, itens: Math.round((chegou.itens + aguardando) * 100) / 100, total: Math.round((chegou.total + aguardando) * 100) / 100 };
  return { nota, chegou, devolvido, aguardando, abatido, aPagar: Math.round((nota.total - devolvido) * 100) / 100 };
}

function _rcRenderPag(total) {
  const a = _rcAtual, el = document.getElementById('rcPag'); if (!el) return;
  const c = a.pagCombinado, nComb = c ? (c.condicao === 'parcelado' ? Number(c.n) || 2 : 1) : 0;
  const aviso = a.pag?.daNota && c && (c.forma !== a.pag.forma || nComb !== a.pag.parcelas.length) ? `Na cotação foi combinado: ${_estEsc(cpPagCondTexto(c))}. A nota veio diferente.` : '';
  el.innerHTML = cpPagHtml(a.pag, total, '_rc', { aviso });
}
function _rcPag(campo, v, k) {
  const tot = _rcTotais().aPagar;
  cpPagSet(_rcAtual.pag, tot, campo, v, k);
  _rcRenderPag(tot);
}

// Parcelas da nota (duplicatas) com a devolução abatida proporcionalmente
function _rcAjustarPagNota(pag, aPagar) {
  if (!pag.parcelasNota) pag.parcelasNota = pag.parcelas.map(p => ({ ...p }));
  const soma = pag.parcelasNota.reduce((s, p) => s + (+p.valor || 0), 0);
  if (!(soma > 0)) return;
  const fator = aPagar / soma;
  let acc = 0;
  pag.parcelas = pag.parcelasNota.map((p, k, arr) => {
    const v = k === arr.length - 1 ? Math.round((aPagar - acc) * 100) / 100 : Math.round(p.valor * fator * 100) / 100;
    acc += v; return { ...p, valor: v };
  });
}

function _rcAtualizar() {
  const a = _rcAtual;
  const ef = a.linhas.map(_rcEfetiva);
  const rat = cpRatear(ef, a.extras);
  const divs = [];
  a.linhas.forEach((l, k) => {
    const acr = rat.get(ef[k]) || 0;
    const el = document.getElementById('_rcConv' + k); if (el) el.innerHTML = cpConvTexto(l, acr);
    const dv = _rcDivergencias(l, acr); divs.push(...dv);
    const d = document.getElementById('_rcDiv' + k); if (d) d.innerHTML = dv.map(x => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">${lc('alert-triangle', 11, 'currentColor')} ${_estEsc(x.txt)}</span>`).join('');
    const ok = document.getElementById('rcOk' + k); if (ok) ok.title = dv.length ? 'Não bate com o pedido: vai abrir o problema' : '';
  });
  a.divs = divs;
  const t = _rcTotais();
  const r = document.getElementById('rcResumo');
  if (r) r.innerHTML = a.reenvio
    ? `<div style="text-align:right;font-size:var(--text-sm);color:var(--text2)">Itens deste reenvio <strong style="color:var(--text)">${_estR(t.chegou.itens)}</strong>${t.abatido ? ` · <span style="color:var(--orange-dark);font-weight:700">abatido do pagamento −${_estR(t.abatido)}</span>` : ''}${a.compraOrig ? ` · nota ${_estEsc(a.compraOrig.numero_nota || '—')} de ${cpDataBr(a.compraOrig.data_compra)}` : ''}</div>`
    : cpTotaisResumoHtml(t.nota, a.totalNota)
      + (t.aguardando ? `<div style="text-align:right;font-size:var(--text-sm);margin-top:4px;color:var(--orange-dark);font-weight:700">Inclui ${_estR(t.aguardando)} aguardando reenvio (mesma nota)</div>` : '')
      + (t.devolvido ? `<div style="text-align:right;font-size:var(--text-sm);margin-top:4px;color:var(--orange-dark);font-weight:700">Devolvido ao fornecedor −${_estR(t.devolvido)} · a pagar ${_estR(t.aPagar)}</div>` : '');
  if (!a.reenvio) {
    if (!a.pag) a.pag = cpPagGerar(cpPagNovo(), t.aPagar);
    else if (a.pag.daNota) _rcAjustarPagNota(a.pag, t.aPagar);
    else cpPagTotal(a.pag, t.aPagar);
    _rcRenderPag(t.aPagar);
  }
  // Progresso
  const reais = a.linhas.filter(l => l.pi || l.item_id);
  const n = s => reais.filter(l => l.conf === s).length;
  const semDecisao = reais.filter(l => l.conf === 'problema' && !_rcProbOk(l)).length;
  const pg = document.getElementById('rcProg');
  const chip = (id, txt, qt) => `<button onclick="_rcFiltro('${id}')" style="padding:4px 11px;border-radius:99px;font-size:var(--text-xs);font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid ${a.filtro === id ? 'var(--purple)' : 'var(--border)'};background:${a.filtro === id ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${a.filtro === id ? 'var(--purple)' : 'var(--text2)'}">${txt} ${qt}</button>`;
  if (pg) pg.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <strong style="font-size:var(--text-md)">${n('ok') + n('problema') - semDecisao} de ${reais.length} conferidos</strong>
      ${n('problema') ? `<span style="font-size:var(--text-sm);color:var(--orange-dark);font-weight:700">${lc('alert-triangle', 12, 'currentColor')} ${n('problema')} com problema${semDecisao ? ` (${semDecisao} sem decisão)` : ''}</span>` : ''}
      <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${chip('todos', 'Todos', reais.length)}${chip('pendente', 'Pendentes', n('pendente'))}${chip('problema', 'Com problema', n('problema'))}${chip('ok', 'Ok', n('ok'))}</span></div>`;
  const btn = document.getElementById('ovRcConf-salvar');
  if (btn && !btn.dataset.salvando) { const pronto = reais.length && !n('pendente') && !semDecisao; btn.disabled = !pronto; btn.title = pronto ? '' : 'Confira todos os itens e decida o que fazer com os problemas'; }
}

// Problema decidido? (ação escolhida + dados obrigatórios)
function _rcProbOk(l) {
  const p = l.prob; if (!p?.acao || !p.tipo) return false;
  if (p.acao === 'aceitar' && !(p.obs || '').trim()) return false;
  if (p.acao === 'devolver' && !(p.devN > 0)) return false;
  if (p.acao === 'pedir' && !(p.repN > 0)) return false;
  if (p.acao === 'aguardar' && !(p.aguN > 0)) return false;
  return true;
}

function _rcLinha(k, campo, v) {
  const l = _rcAtual.linhas[k];
  // Mudou a quantidade numa linha com total digitado/da nota: mantém o preço por embalagem
  if (campo === 'n' && l.modo === 'total') { const c = cpLinhaCalc(l); if (c.n > 0 && c.total > 0) { l.vUnit = Math.round(c.total / c.n * 10000) / 10000; l.modo = 'unit'; } }
  if (cpLinhaSet(l, campo, v)) _rcRedesenharLinha(k);
  else cpLinhaSincronizar(l, k, '_rc', campo);
  // Mexeu num item já conferido e agora não bate: vira problema
  if (l.conf === 'ok' && _rcDivergencias(l, 0).length) { l.conf = 'pendente'; _rcConf(k, 'problema'); return; }
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
      if (alvo) { campos.forEach(c => { alvo[c] = l[c]; }); alvo.conf = 'pendente'; alvo.prob = null; casados++; }
      else a.linhas.push({ ...l, pi: null, conf: 'pendente', prob: null });
    }
    // Item do pedido que não está na nota: não veio
    for (const x of a.linhas) if (x.pi && !x.desc_nota) { x.n = 0; x.conf = 'pendente'; x.prob = null; }
    Object.assign(a, { nota: dados, notaArquivo: file, numero: dados.numero || a.numero, chave: dados.chave, doc: dados.fornecedorDoc,
                       data: dados.data || a.data, totalNota: dados.totalNota ?? a.totalNota,
                       extras: { ...dados.extras, frete: dados.extras?.frete || a.extras.frete },
                       ...(dados.pagamento ? { pag: dados.pagamento } : {}) });
    _rcRenderConf();
    const s2 = document.getElementById('rcNotaStatus');
    if (s2) s2.innerHTML = `<span style="color:var(--success-fg)">${casados} de ${a.linhas.filter(x => x.pi).length} itens do pedido preenchidos pela nota</span>`;
  } catch (e) { msg(`<span style="color:var(--danger-fg)">Não consegui ler a nota: ${_estEsc(e.message)}</span>`); }
}

// Resumo antes de dar baixa
function _rcConfirmar() {
  const a = _rcAtual;
  _rcAtualizar();
  const reais = a.linhas.filter(l => l.pi || l.item_id);
  if (a.linhas.some(l => !l.pi && !l.item_id && cpLinhaCalc(l).n > 0)) return toast('Ligue os itens fora do pedido a um insumo (ou remova a linha)', 'err');
  const pend = reais.filter(l => l.conf === 'pendente').length;
  if (pend) return toast(`Faltam ${pend} item(ns) para conferir`, 'err');
  const sem = reais.filter(l => l.conf === 'problema' && !_rcProbOk(l));
  if (sem.length) return toast(`Decida o que fazer com ${sem.length} item(ns) com problema (aceitar exige motivo)`, 'err');
  const ef = a.linhas.map(_rcEfetiva);
  const entram = ef.filter(l => l.item_id && cpLinhaCalc(l).qtd > 0).length;
  const t = _rcTotais();
  const dev = reais.filter(l => l.prob?.acao === 'devolver').length;
  const rep = reais.filter(l => l.prob?.acao === 'pedir' || (l.prob?.acao === 'devolver' && l.prob.repor)).length;
  const acc = reais.filter(l => l.prob?.acao === 'aceitar').length;
  const canc = reais.filter(l => l.prob?.acao === 'cancelar').length;
  const agu = reais.filter(l => l.prob?.acao === 'aguardar').length;
  const abat = reais.filter(l => l.prob?.acao === 'abater').length;
  vtpConfirm({
    title: 'Dar baixa no recebimento?',
    message: [`${entram} item(ns) entram no estoque`, acc && `${acc} aceito(s) com divergência`, dev && `${dev} devolução(ões) · ${_estR(t.devolvido)} abatidos do pagamento`,
      rep && `${rep} item(ns) num pedido novo em Rascunho`, canc && `${canc} cancelado(s)`,
      agu && `${agu} item(ns) aguardando reenvio na mesma nota (pedido continua aberto)`, abat && `${abat} não vem · ${_estR(t.abatido)} abatidos das parcelas`,
      !a.reenvio && `A pagar: ${_estR(t.aPagar)}`].filter(Boolean).join('\n'),
    confirmLabel: 'Dar baixa', danger: false,
    onConfirm: () => (a.reenvio ? _rcGravarReenvio() : _rcGravar()),
  });
}

async function _rcGravar() {
  const a = _rcAtual, p = a.p;
  const btn = document.getElementById('ovRcConf-salvar');
  if (btn) { btn.dataset.salvando = '1'; btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    if (a.chave) {
      const { data: dup } = await _cpSb().from('cp_compras').select('id, data_compra').eq('chave_nfe', a.chave).is('excluido_em', null).limit(1);
      if (dup?.length) throw new Error(`esta nota já foi lançada em ${cpDataBr(dup[0].data_compra)}`);
    }
    const user = estUsuario();
    const anexo = a.notaArquivo ? await cpUploadAnexo(a.notaArquivo) : null;
    const fotos = [];
    for (const f of a.fotos) fotos.push(await cpUploadAnexo(f, 'recebimentos'));
    const ex = a.extras, t = _rcTotais();
    const ef = a.linhas.map(_rcEfetiva);
    const devolucoes = a.linhas.filter(l => l.conf === 'problema' && l.prob?.acao === 'devolver').map(l => ({
      item_id: l.item_id, item_nome: _rcNomeItem(l), qtd: _estRound(cpLinhaCalc(l).qtd - cpLinhaCalc(_rcEfetiva(l)).qtd), unidade: _rcUn(l),
      valor: _rcDevolvidoLinha(l), tipo: l.prob.tipo, obs: l.prob.obs || null }));
    const [compra] = await cpInsert('cp_compras', {
      data_compra: a.data, fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, fornecedor_doc: a.doc || null,
      numero_nota: a.numero || null, chave_nfe: a.chave || null, origem: 'pedido', pedido_id: p.id, total: t.aPagar,
      frete: _cpR2(ex.frete), ipi: _cpR2(ex.ipi), icms_st: _cpR2(ex.icms_st), seguro: _cpR2(ex.seguro), outras: _cpR2(ex.outras), desconto: _cpR2(ex.desconto),
      devolvido: t.devolvido, devolucoes: devolucoes.length ? devolucoes : null,
      anexo_path: anexo, fotos: fotos.length ? fotos : null, criado_por: user, pagamento: a.pag || null,
    });
    const rat = cpRatear(ef, ex);
    const validas = [...rat.keys()];
    const linhas = validas.length ? await cpInsert('cp_compra_itens', cpLinhasParaSalvar(ef, ex, compra.id, user)) : [];
    await cpGravarParcelas(compra, a.pag, user);
    if (linhas.length) await cpDarEntradaEstoque(compra, linhas);
    const comNota = linhas.filter(l => l.desc_nota);
    if (comNota.length) await _cpSalvarMemoriaNota({ fornecedorDoc: a.doc, fornecedorId: p.fornecedor_id, fornecedorNome: p.fornecedor_nome }, comNota);
    // Itens do pedido: recebido + resultado da conferência
    const repor = [];
    const divergencias = [];
    for (let k = 0; k < a.linhas.length; k++) {
      const l = a.linhas[k], e = ef[k], i = validas.indexOf(e);
      const qRec = i >= 0 ? cpLinhaCalc(e).qtd : 0, f = _rcF(l), pr = l.prob;
      const status = l.conf === 'ok' ? 'ok' : { aceitar: 'aceito', devolver: 'devolvido', pedir: 'repedido', cancelar: 'cancelado', aguardar: 'aguardando' }[pr?.acao];
      const qAgu = pr?.acao === 'aguardar' ? _estRound((Number(pr.aguN) || 0) * f) : 0;
      const qRep = pr?.acao === 'pedir' ? _estRound((Number(pr.repN) || 0) * f) : pr?.acao === 'devolver' && pr.repor ? _estRound(cpLinhaCalc(l).qtd - qRec) : 0;
      if (qRep > 0 && l.item_id) repor.push({ l, qtd: qRep });
      if (l.conf === 'problema') divergencias.push({ item: _rcNomeItem(l), tipo: pr.tipo, acao: pr.acao, obs: pr.obs || null,
        pedido: l.pi ? _estRound(l.falta) : 0, recebido: _estRound(cpLinhaCalc(l).qtd), unidade: _rcUn(l), devolvido: pr.acao === 'devolver' ? _rcDevolvidoLinha(l) : 0, repedido: qRep });
      if (!l.pi) continue;
      await cpUpdate('cp_pedido_itens', l.pi.id, { qtd_recebida: _estRound((Number(l.pi.qtd_recebida) || 0) + qRec), preco_final: i >= 0 ? linhas[i].preco_unit : null,
        conferencia: { status, tipo: pr?.tipo || null, obs: pr?.obs || null, qtd_recebida: _estRound(qRec), qtd_devolvida: pr?.acao === 'devolver' ? _estRound(cpLinhaCalc(l).qtd - qRec) : 0,
          valor_devolvido: pr?.acao === 'devolver' ? _rcDevolvidoLinha(l) : 0, qtd_repedida: qRep, qtd_aguardando: qAgu } });
    }
    // Pedido novo em Rascunho com o que precisa repor
    let novo = null;
    if (repor.length) {
      [novo] = await cpInsert('cp_pedidos', { fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, status: 'montagem', criado_por: user,
        comentario_aprovacao: `Reposição do recebimento de ${cpDataBr(a.data)}` });
      await cpInsert('cp_pedido_itens', repor.map(({ l, qtd }) => {
        const it = items.find(x => x.id === l.item_id);
        const pc = Number(l.pi?.preco_combinado) || Number(it?.cost) || null;
        return { pedido_id: novo.id, item_id: l.item_id, item_nome: it?.name || l.pi?.item_nome, unidade: it?.unit || l.pi?.unidade || null, qtd_pedida: qtd,
          apresentacao: l.pi?.apresentacao || l.ap || null, preco_combinado: pc, preco_referencia: Number(l.pi?.preco_referencia) || pc, criado_por: user };
      }));
    }
    const aguardando = a.linhas.some(l => l.pi && l.conf === 'problema' && l.prob?.acao === 'aguardar');
    await cpUpdate('cp_pedidos', p.id, { status: aguardando ? 'parcial' : 'recebido', aguardando_desde: aguardando ? new Date().toISOString() : null,
      recebido_por: user, recebido_em: new Date().toISOString(), divergencias: divergencias.length ? divergencias : null,
      solicitado_em: p.solicitado_em || new Date().toISOString(), solicitado_por: p.solicitado_por || user });
    document.getElementById('ovRcConf')?.remove();
    _rcAtual = null;
    toast(`${aguardando ? 'Recebido em parte · aguardando reenvio' : 'Pedido recebido'} · ${linhas.length} item(ns) no estoque${t.devolvido ? ` · ${_estR(t.devolvido)} devolvidos` : ''}${novo ? ' · pedido de reposição em Rascunho na Cotação' : ''}`, 'ok');
    _cpComprasDados = null; _pdDados = null;
    cpRenderAbaRecebimento(true);
  } catch (e) {
    toast('Não consegui confirmar: ' + e.message, 'err');
    if (btn) { delete btn.dataset.salvando; btn.disabled = false; btn.textContent = 'Dar baixa e entrada no estoque'; }
  }
}

// Pedido já fechado: o que foi pedido × o que veio e o que se decidiu
function _rcVerFechado(p, its) {
  const divs = Array.isArray(p.divergencias) ? p.divergencias : [];
  const conf = c => c ? ({ ok: '✓ conferido', aceito: 'aceito com divergência', devolvido: 'devolvido', repedido: 'pedido de novo', cancelado: 'cancelado' }[c.status] || '') : '';
  _estModal('ovRcConf', `Pedido · ${_estEsc(p.fornecedor_nome)}`, `
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:10px">${RC_STATUS[p.status]?.label || p.status}${p.recebido_em ? ` em ${_estDH(p.recebido_em)}${p.recebido_por ? ' por ' + _estEsc(p.recebido_por) : ''}` : ''}</div>
    ${divs.length ? `<div style="padding:9px 12px;border-radius:var(--r8);background:var(--orange-light);color:var(--orange-dark);font-size:var(--text-sm);margin-bottom:10px;line-height:1.6">
      <strong>Ocorrências:</strong><br>${divs.map(d => d.acao ? `• ${_estEsc(d.item)}: ${_estEsc((RC_TIPOS.find(x => x[0] === d.tipo) || [])[1] || d.tipo || '')} → ${_estEsc(RC_ACOES[d.acao] || d.acao)}${d.devolvido ? ` (${_estR(d.devolvido)})` : ''}${d.obs ? ` · "${_estEsc(d.obs)}"` : ''}`
        : `• ${_estEsc(d.item)}: ${d.tipo === 'qtd' ? `pedido ${_estQ(d.pedido)} ${_estEsc(d.unidade || '')}, veio ${_estQ(d.recebido)}` : `estimado ${_estR(d.pedido)}, custou ${_estR(d.recebido)}`}`).join('<br>')}</div>` : ''}
    <div style="border:1.5px solid var(--border);border-radius:var(--r8);overflow:hidden">
      ${its.map(i => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-top:1px solid var(--border);font-size:var(--text-sm)">
        <div><strong>${_estEsc(i.item_nome)}</strong> ${i.conferencia ? `<span class="badge ${i.conferencia.status === 'ok' ? 'b-green' : 'b-orange'}" style="font-size:var(--text-2xs)">${conf(i.conferencia)}</span>` : ''}
          <div style="font-size:var(--text-xs);color:var(--muted)">pedido ${_estEsc(estQtdApresentacao(i.qtd_pedida, i.unidade, i.apresentacao))}${i.preco_combinado ? ` · ${i.preco_cotado != null ? 'cotado' : 'estimado'} ${_estR(i.preco_combinado)}/${_estEsc(i.unidade || 'un')}` : ''}</div></div>
        <div style="text-align:right;white-space:nowrap">${_estQ(i.qtd_recebida)} ${_estEsc(i.unidade || '')}<div style="font-size:var(--text-xs);color:var(--muted)">${i.preco_final ? _estR(i.preco_final) + '/' + _estEsc(i.unidade || 'un') : '—'}</div></div></div>`).join('')}
    </div>`, `document.getElementById('ovRcConf').remove()`, 'Fechar', 680);
  _rcRodapeDiscreto(p, false);
}

// Ações secundárias no rodapé fixo do modal (à esquerda, discretas)
function _rcRodapeDiscreto(p, aberto) {
  const foot = document.querySelector('#ovRcConf .fm-foot'); if (!foot) return;
  const box = document.createElement('div');
  box.style.cssText = 'margin-right:auto;display:flex;gap:4px';
  box.innerHTML = `<button class="btn btn-ghost btn-sm" style="color:var(--text2)" onclick="_rcImprimir('${p.id}')">${lc('printer', 14, 'currentColor')} Imprimir</button>
    ${aberto ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger-fg)" onclick="document.getElementById('ovRcConf').remove();_rcCancelar('${p.id}')">${lc('x', 14, 'currentColor')} Cancelar pedido</button>` : ''}`;
  foot.insertBefore(box, foot.firstChild);
  const c = foot.querySelector('.btn-outline');
  if (c) { if (aberto) c.textContent = 'Fechar'; else c.remove(); }   // não confundir com "Cancelar pedido"
}

// ══════════════════════════════════════════════════════════════
// REENVIO (mesma nota): só os itens aguardando; entram na compra original,
// sem nota nova nem pagamento novo. Se não vier: abater das parcelas em aberto
// ou pedir de novo. O pedido fecha quando nada mais fica aguardando.
// ══════════════════════════════════════════════════════════════

async function _rcCarregarCompraOriginal() {
  const a = _rcAtual;
  try {
    const rows = await cpSelect('cp_compras', q => q.select('*').eq('pedido_id', a.p.id).is('excluido_em', null).order('created_at', { ascending: true }));
    a.compraOrig = rows[0] || null;
    if (_rcAtual === a) _rcRenderConf();
  } catch (e) { console.warn('[reenvio] compra original:', e.message); }
}

async function _rcGravarReenvio() {
  const a = _rcAtual, p = a.p;
  const btn = document.getElementById('ovRcConf-salvar');
  if (btn) { btn.dataset.salvando = '1'; btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const user = estUsuario(), t = _rcTotais();
    let compra = a.compraOrig;
    if (!compra) {   // pedido antigo sem a compra ligada: registra uma compra para o reenvio
      [compra] = await cpInsert('cp_compras', { data_compra: _rcHoje(), fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, origem: 'pedido',
        pedido_id: p.id, total: t.chegou.total, criado_por: user, obs: 'Reenvio' });
    }
    const ef = a.linhas.map(_rcEfetiva);
    const rat = cpRatear(ef, cpExtrasVazio());
    const validas = [...rat.keys()];
    const linhas = validas.length ? await cpInsert('cp_compra_itens', cpLinhasParaSalvar(ef, cpExtrasVazio(), compra.id, user)) : [];
    if (linhas.length) await cpDarEntradaEstoque(compra, linhas);
    // Não vem: sai do total da nota e das parcelas em aberto (das últimas para as primeiras)
    if (t.abatido > 0 && a.compraOrig) {
      await cpUpdate('cp_compras', compra.id, { total: Math.round(((+compra.total || 0) - t.abatido) * 100) / 100, devolvido: Math.round(((+compra.devolvido || 0) + t.abatido) * 100) / 100 });
      const parc = await cpSelect('cp_compra_parcelas', q => q.select('*').eq('compra_id', compra.id).eq('status', 'aberta').order('vencimento', { ascending: false }));
      let resta = t.abatido;
      for (const pc of parc) {
        if (resta <= 0.004) break;
        const tira = Math.min(resta, Number(pc.valor) || 0);
        const novo = Math.round(((Number(pc.valor) || 0) - tira) * 100) / 100;
        await cpUpdate('cp_compra_parcelas', pc.id, novo > 0.004 ? { valor: novo } : { valor: 0, status: 'cancelada' });
        resta = Math.round((resta - tira) * 100) / 100;
      }
    }
    const repor = [], divergencias = Array.isArray(p.divergencias) ? [...p.divergencias] : [];
    let aindaAguarda = false;
    for (let k = 0; k < a.linhas.length; k++) {
      const l = a.linhas[k], e = ef[k], i = validas.indexOf(e), pr = l.prob, f = _rcF(l);
      const qRec = i >= 0 ? cpLinhaCalc(e).qtd : 0;
      const acao = l.conf === 'ok' ? 'ok' : pr?.acao;
      const qAgu = acao === 'aguardar' ? _estRound((Number(pr.aguN) || 0) * f) : 0;
      if (qAgu > 0) aindaAguarda = true;
      const qRep = acao === 'pedir' ? _estRound((Number(pr.repN) || 0) * f) : 0;
      if (qRep > 0) repor.push({ l, qtd: qRep });
      if (l.conf === 'problema') divergencias.push({ item: _rcNomeItem(l), tipo: pr.tipo, acao: pr.acao, obs: pr.obs || null, reenvio: true,
        pedido: _estRound(l.falta), recebido: _estRound(cpLinhaCalc(l).qtd), unidade: _rcUn(l), devolvido: acao === 'abater' ? _rcValorFalta(l) : 0, repedido: qRep });
      const ant = l.pi.conferencia || {};
      await cpUpdate('cp_pedido_itens', l.pi.id, { qtd_recebida: _estRound((Number(l.pi.qtd_recebida) || 0) + qRec), ...(i >= 0 ? { preco_final: linhas[i].preco_unit } : {}),
        conferencia: { ...ant, status: { ok: 'ok', aceitar: 'aceito', aguardar: 'aguardando', abater: 'cancelado', pedir: 'repedido' }[acao] || ant.status,
          qtd_aguardando: qAgu, reenvio_em: new Date().toISOString(), qtd_reenvio: _estRound(qRec), obs_reenvio: pr?.obs || null,
          ...(acao === 'abater' ? { valor_abatido: _rcValorFalta(l) } : {}), ...(qRep ? { qtd_repedida: qRep } : {}) } });
    }
    if (repor.length) {
      const [novo] = await cpInsert('cp_pedidos', { fornecedor_id: p.fornecedor_id, fornecedor_nome: p.fornecedor_nome, status: 'montagem', criado_por: user,
        comentario_aprovacao: `Reposição do reenvio de ${cpDataBr(_rcHoje())}` });
      await cpInsert('cp_pedido_itens', repor.map(({ l, qtd }) => ({ pedido_id: novo.id, item_id: l.item_id, item_nome: _rcNomeItem(l), unidade: _rcUn(l), qtd_pedida: qtd,
        apresentacao: l.pi?.apresentacao || l.ap || null, preco_combinado: Number(l.pi?.preco_combinado) || null, preco_referencia: Number(l.pi?.preco_referencia) || null, criado_por: user })));
    }
    // Itens que já estavam fechados no pedido continuam fechados; aguardando decide o status
    const outrosAguardando = (_rcDados.porPedido.get(p.id) || []).some(i => i.conferencia?.status === 'aguardando' && !a.linhas.some(l => l.pi?.id === i.id));
    const fica = aindaAguarda || outrosAguardando;
    await cpUpdate('cp_pedidos', p.id, { status: fica ? 'parcial' : 'recebido', divergencias: divergencias.length ? divergencias : null,
      ...(fica ? {} : { aguardando_desde: null }), recebido_por: user, recebido_em: new Date().toISOString() });
    document.getElementById('ovRcConf')?.remove();
    _rcAtual = null;
    toast(`Reenvio conferido · ${linhas.length} item(ns) no estoque${t.abatido ? ` · ${_estR(t.abatido)} abatidos` : ''}${fica ? ' · ainda aguardando' : ' · pedido recebido'}`, 'ok');
    _cpComprasDados = null; _pdDados = null;
    cpRenderAbaRecebimento(true);
  } catch (e) {
    toast('Não consegui confirmar o reenvio: ' + e.message, 'err');
    if (btn) { delete btn.dataset.salvando; btn.disabled = false; btn.textContent = 'Dar baixa e entrada no estoque'; }
  }
}

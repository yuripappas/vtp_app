/**
 * VTP Compras — Vai Ter Pizza!
 * atendimento.js — Módulo Omnichannel (inbox WhatsApp)
 *
 * Lê/escreve direto nas tabelas atd_* via Supabase (não passa pelo kv_store —
 * são tabelas relacionais de verdade, com Realtime). Envio de mensagem passa
 * pela Edge Function enviar-mensagem (ela fala com a Evolution API).
 */

let _atdSbClient = null;
function _atdGetSbClient() {
  if (!_atdSbClient) _atdSbClient = supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY);
  return _atdSbClient;
}

const _atdState = {
  conversas: [],
  conversaAtivaId: null,
  mensagens: [],
  canal: null,
  realtimeChannel: null,
};

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderOmnichannel() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div class="atd-layout" style="display:flex;height:calc(100vh - 64px);background:var(--bg-elevated);border-radius:var(--r16);overflow:hidden;border:1px solid var(--border)">

      <!-- COLUNA A — lista de conversas -->
      <div class="atd-sidebar" style="width:280px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface2)">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:var(--text-base);font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px;margin-bottom:10px">
            ${lc('message-circle', 18, 'var(--purple)')} Atendimento
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:10px;font-size:var(--text-xs)" onclick="_atdAbrirBuscaPedido()">
            ${lc('search', 13, '#fff')} Buscar pedido / cliente
          </button>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="atd-filtro active" data-filtro="todas" onclick="_atdAplicarFiltro('todas')">Todas</button>
            <button class="atd-filtro" data-filtro="minhas" onclick="_atdAplicarFiltro('minhas')">Minhas</button>
            <button class="atd-filtro" data-filtro="sem_atendente" onclick="_atdAplicarFiltro('sem_atendente')">Sem atendente</button>
          </div>
        </div>
        <div id="atdListaConversas" style="flex:1;overflow-y:auto"></div>
      </div>

      <!-- COLUNA B — conversa ativa -->
      <div class="atd-chat" style="flex:1;display:flex;flex-direction:column;min-width:0">
        <div id="atdChatVazio" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--fg-subtle)">
          ${lc('message-circle', 40, 'var(--fg-subtle)')}
          <div style="font-size:var(--text-sm)">Selecione uma conversa</div>
        </div>
        <div id="atdChatAtivo" style="display:none;flex:1;flex-direction:column;min-height:0"></div>
      </div>

      <!-- COLUNA C — painel do contato -->
      <div class="atd-panel" id="atdPainelContato" style="width:300px;flex-shrink:0;border-left:1px solid var(--border);overflow-y:auto;display:none"></div>
    </div>

    <style>
      .atd-filtro {
        border:1px solid var(--border); background:var(--bg-elevated); color:var(--fg-muted);
        font-size:var(--text-xs); font-weight:600; padding:4px 10px; border-radius:999px; cursor:pointer;
      }
      .atd-filtro.active { background:var(--purple); color:#fff; border-color:var(--purple); }
      .conv-item { display:flex; gap:10px; padding:12px 16px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; }
      .conv-item:hover { background:var(--bg-hover); }
      .conv-item.active { background:var(--purple-xlight); border-left:3px solid var(--purple); }
      .msg-bubble { padding:9px 13px; border-radius:var(--r12); max-width:75%; word-break:break-word; font-size:var(--text-sm); line-height:1.5; }
      .msg-bubble.cliente { background:var(--surface2); align-self:flex-start; border-radius:2px var(--r12) var(--r12) var(--r12); }
      .msg-bubble.atendente { background:var(--purple); color:#fff; align-self:flex-end; border-radius:var(--r12) 2px var(--r12) var(--r12); }
      .msg-bubble.interna { background:var(--warning-bg); border:1px dashed var(--warning-border); align-self:stretch; font-size:var(--text-xs); }

      @media (max-width: 900px) {
        .atd-panel { display:none !important; }
      }
      @media (max-width: 640px) {
        .atd-layout { flex-direction:column; height:auto; min-height:calc(100vh - 64px); }
        .atd-sidebar { width:100%; max-height:200px; }
        .atd-chat { min-height:400px; }
      }
    </style>
  `;

  _atdCarregarConversas();
  _atdAssinarRealtime();
}

// ══════════════════════════════════════════════════════════════
// LISTA DE CONVERSAS
// ══════════════════════════════════════════════════════════════

async function _atdCarregarConversas() {
  const sb = _atdGetSbClient();
  const { data, error } = await sb
    .from('atd_conversas')
    .select('id, status, atendente_id, pedido_data, atualizado_em, atd_contatos(nome, telefone, avatar_url)')
    .eq('status', 'aberta')
    .order('atualizado_em', { ascending: false });

  if (error) { console.error('[atendimento] erro ao carregar conversas', error); return; }
  _atdState.conversas = data || [];
  _atdRenderLista();
}

function _atdAplicarFiltro(filtro) {
  document.querySelectorAll('.atd-filtro').forEach(b => b.classList.toggle('active', b.dataset.filtro === filtro));
  _atdState.filtroAtivo = filtro;
  _atdRenderLista();
}

function _atdRenderLista() {
  const user = getCurrentUser();
  const filtro = _atdState.filtroAtivo || 'todas';
  let lista = _atdState.conversas;
  if (filtro === 'minhas')         lista = lista.filter(c => c.atendente_id === user?.id);
  else if (filtro === 'sem_atendente') lista = lista.filter(c => !c.atendente_id);

  const el = document.getElementById('atdListaConversas');
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--fg-subtle);font-size:var(--text-sm)">Nenhuma conversa aqui.</div>`;
    return;
  }

  el.innerHTML = lista.map(c => {
    const nome = c.atd_contatos?.nome || c.atd_contatos?.telefone || 'Sem nome';
    const inicial = nome.charAt(0).toUpperCase();
    const ativa = c.id === _atdState.conversaAtivaId;
    return `
      <div class="conv-item ${ativa ? 'active' : ''}" onclick="_atdAbrirConversa('${c.id}')">
        <span style="width:38px;height:38px;border-radius:50%;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${inicial}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:6px">
            <div style="font-weight:700;font-size:var(--text-sm);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
          </div>
          <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-top:2px">
            ${c.atendente_id ? lc('user-check', 11, 'var(--green)') + ' atribuída' : 'sem atendente'}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// CONVERSA ATIVA
// ══════════════════════════════════════════════════════════════

async function _atdAbrirConversa(conversaId) {
  _atdState.conversaAtivaId = conversaId;
  _atdRenderLista();

  document.getElementById('atdChatVazio').style.display = 'none';
  document.getElementById('atdChatAtivo').style.display  = 'flex';
  document.getElementById('atdPainelContato').style.display = 'block';

  const sb = _atdGetSbClient();
  const { data: conversa } = await sb
    .from('atd_conversas')
    .select('*, atd_contatos(*)')
    .eq('id', conversaId)
    .single();

  const { data: mensagens } = await sb
    .from('atd_mensagens')
    .select('*')
    .eq('conversa_id', conversaId)
    .order('enviado_em', { ascending: true });

  _atdState.mensagens = mensagens || [];
  _atdRenderChat(conversa);
  _atdRenderPainel(conversa);
}

function _atdRenderChat(conversa) {
  const nome = conversa.atd_contatos?.nome || conversa.atd_contatos?.telefone || 'Sem nome';
  const bubbles = _atdState.mensagens.map(m => {
    const classe = m.visibilidade === 'interna' ? 'interna' : (m.origem === 'cliente' ? 'cliente' : 'atendente');
    const texto = m.conteudo?.texto ?? '[mensagem não suportada]';
    const hora = new Date(m.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="msg-bubble ${classe}">${texto}<div style="font-size:10px;opacity:.7;margin-top:3px">${hora}</div></div>`;
  }).join('');

  document.getElementById('atdChatAtivo').innerHTML = `
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-weight:700;color:var(--text)">${nome}</div>
      <button class="btn btn-ghost" style="font-size:var(--text-xs)" onclick="_atdConcluirConversa('${conversa.id}')">
        ${lc('check', 14, 'var(--green)')} Concluir
      </button>
    </div>
    <div id="atdMensagensWrap" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px">
      ${bubbles || '<div style="color:var(--fg-subtle);font-size:var(--text-sm);text-align:center;margin-top:40px">Sem mensagens ainda.</div>'}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end">
      <textarea id="atdCampoTexto" class="inp" rows="2" placeholder="Digite sua resposta..."
        style="flex:1;resize:none" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_atdEnviarMensagem('${conversa.id}')}"></textarea>
      <button class="btn btn-primary" onclick="_atdEnviarMensagem('${conversa.id}')">
        ${lc('send', 15, '#fff')}
      </button>
    </div>
  `;

  const wrap = document.getElementById('atdMensagensWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function _atdRenderPainel(conversa) {
  const c = conversa.atd_contatos || {};
  const nome = c.nome || c.telefone || 'Sem nome';
  const pedido = conversa.pedido_data;

  document.getElementById('atdPainelContato').innerHTML = `
    <div style="padding:18px 16px;border-bottom:1px solid var(--border);text-align:center">
      <span style="width:56px;height:56px;border-radius:50%;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;margin:0 auto 8px">${nome.charAt(0).toUpperCase()}</span>
      <div style="font-weight:800;color:var(--text)">${nome}</div>
      <div style="font-size:var(--text-xs);color:var(--fg-subtle);display:flex;align-items:center;justify-content:center;gap:4px;margin-top:2px">
        ${lc('phone', 11, 'currentColor')} ${c.telefone || '—'}
      </div>
      ${c.total_pedidos ? `<div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-top:4px">${lc('package', 11, 'currentColor')} ${c.total_pedidos} pedido(s)</div>` : ''}
    </div>
    ${pedido ? `
      <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Pedido vinculado</div>
        <div style="font-size:var(--text-sm);color:var(--text)">#${pedido.display_id ?? '—'} · ${pedido.status ?? ''}</div>
        ${pedido.total ? `<div style="font-size:var(--text-sm);color:var(--fg-muted)">R$ ${Number(pedido.total).toFixed(2)}</div>` : ''}
        ${pedido.delivery_address ? `
          <button class="btn btn-ghost" style="margin-top:8px;width:100%;font-size:var(--text-xs)" onclick="_atdAbrirEndereco(${JSON.stringify(pedido.delivery_address).replace(/"/g, '&quot;')})">
            ${lc('map-pin', 13, 'var(--purple)')} Ver endereço de entrega
          </button>` : ''}
      </div>` : ''}
  `;
}

function _atdAbrirEndereco(addr) {
  if (addr.latitude && addr.longitude) {
    window.open(`https://maps.google.com/?q=${addr.latitude},${addr.longitude}`, '_blank');
  } else {
    const partes = [addr.street, addr.number, addr.neighborhood, addr.city, addr.state].filter(Boolean).join(', ');
    window.open(`https://maps.google.com/?q=${encodeURIComponent(partes)}`, '_blank');
  }
}

// ══════════════════════════════════════════════════════════════
// ENVIAR / CONCLUIR
// ══════════════════════════════════════════════════════════════

async function _atdEnviarMensagem(conversaId) {
  const campo = document.getElementById('atdCampoTexto');
  const texto = campo?.value.trim();
  if (!texto) return;

  const user = getCurrentUser();
  campo.value = '';
  campo.disabled = true;

  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/enviar-mensagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ conversa_id: conversaId, texto, atendente_id: user?.id ?? null }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'falha ao enviar');
    await _atdAbrirConversa(conversaId);
  } catch (e) {
    toast('Erro ao enviar mensagem: ' + e.message, 'err');
  } finally {
    campo.disabled = false;
    campo.focus();
  }
}

async function _atdConcluirConversa(conversaId) {
  const user = getCurrentUser();
  const sb = _atdGetSbClient();
  const { error } = await sb.from('atd_conversas').update({
    status: 'concluida',
    concluida_em: new Date().toISOString(),
    concluida_por_id: user?.id ?? null,
  }).eq('id', conversaId);

  if (error) { toast('Erro ao concluir conversa', 'err'); return; }
  toast('Conversa concluída!', 'ok');
  _atdState.conversaAtivaId = null;
  document.getElementById('atdChatVazio').style.display = 'flex';
  document.getElementById('atdChatAtivo').style.display  = 'none';
  document.getElementById('atdPainelContato').style.display = 'none';
  _atdCarregarConversas();
}

// ══════════════════════════════════════════════════════════════
// REALTIME — atualiza lista/chat sem precisar recarregar
// ══════════════════════════════════════════════════════════════

function _atdAssinarRealtime() {
  const sb = _atdGetSbClient();
  if (_atdState.realtimeChannel) sb.removeChannel(_atdState.realtimeChannel);

  _atdState.realtimeChannel = sb.channel('atd-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'atd_mensagens' }, payload => {
      if (payload.new?.conversa_id === _atdState.conversaAtivaId) {
        _atdAbrirConversa(_atdState.conversaAtivaId);
      }
      _atdCarregarConversas();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'atd_conversas' }, () => {
      _atdCarregarConversas();
    })
    .subscribe();
}

// ══════════════════════════════════════════════════════════════
// BUSCAR PEDIDO / CLIENTE — F04-B
// Abre (ou cria) a conversa de WhatsApp já vinculada a um pedido do
// CardápioWeb. Caso de uso principal: motoboy não acha o endereço.
// ══════════════════════════════════════════════════════════════

const ATD_STATUS_LABELS = {
  aguardando:  'Aguardando',
  em_preparo:  'Em preparo',
  pronto:      'Pronto',
  em_rota:     'Em rota',
  entregue:    'Entregue',
};
const ATD_CANAL_LABELS = { ifood: 'iFood', '99food': '99Food', site: 'Site' };

function _atdAbrirBuscaPedido() {
  document.getElementById('popupAtdBuscaPedido')?.remove();
  _atdState.pedidosDia = [];
  _atdState.pedidosFiltroStatus = 'todos';

  const popup = document.createElement('div');
  popup.id = 'popupAtdBuscaPedido';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:480px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0;flex-shrink:0">
        <div style="font-size:var(--text-md);font-weight:800">${lc('search', 15, 'var(--purple)')} Pedidos de hoje</div>
        <button onclick="document.getElementById('popupAtdBuscaPedido').remove()" style="background:none;border:none;cursor:pointer;padding:4px">${lc('x', 18, 'var(--muted)')}</button>
      </div>
      <div style="padding:14px 20px 10px;flex-shrink:0">
        <input id="atdBuscaInput" class="inp" placeholder="Filtrar por nome ou número do pedido..." autocomplete="off" oninput="_atdRenderPedidos()">
        <div id="atdFiltrosStatus" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          ${['todos', 'aguardando', 'em_preparo', 'pronto', 'em_rota', 'entregue'].map(s => `
            <button class="atd-filtro ${s === 'todos' ? 'active' : ''}" data-status="${s}" onclick="_atdFiltrarPedidosPorStatus('${s}')">
              ${s === 'todos' ? 'Todos' : ATD_STATUS_LABELS[s]}
            </button>`).join('')}
        </div>
      </div>
      <div id="atdBuscaResultados" style="flex:1;overflow-y:auto;padding:4px 12px 16px"></div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });

  document.getElementById('atdBuscaResultados').innerHTML = `<div style="padding:24px;text-align:center;color:var(--fg-subtle);font-size:var(--text-sm)">Carregando pedidos de hoje...</div>`;
  _atdCarregarPedidosDoDia();
}

function _atdFiltrarPedidosPorStatus(status) {
  _atdState.pedidosFiltroStatus = status;
  document.querySelectorAll('#atdFiltrosStatus .atd-filtro').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  _atdRenderPedidos();
}

async function _atdCarregarPedidosDoDia() {
  const sb = _atdGetSbClient();
  const inicioHoje = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const { data, error } = await sb
    .from('cw_pedidos')
    .select('id, display_id, customer_name, customer_phone, delivery_address, status, sales_channel, total, order_type, cw_created_at')
    .gte('cw_created_at', inicioHoje)
    .order('cw_created_at', { ascending: false });

  const resEl = document.getElementById('atdBuscaResultados');
  if (error) { if (resEl) resEl.innerHTML = `<div style="padding:16px;color:var(--red);font-size:var(--text-sm)">Erro ao carregar pedidos</div>`; return; }

  _atdState.pedidosDia = (data || []).filter(p => p.status !== 'canceling' && p.status !== 'canceled');
  _atdRenderPedidos();
}

function _atdRenderPedidos() {
  const resEl = document.getElementById('atdBuscaResultados');
  if (!resEl) return;

  const termo = (document.getElementById('atdBuscaInput')?.value || '').trim().toLowerCase();
  const numeroLimpo = termo.replace(/^#/, '');
  const filtroStatus = _atdState.pedidosFiltroStatus || 'todos';

  let lista = _atdState.pedidosDia.map(p => ({ ...p, _statusMapeado: CW_STATUS_MAP[p.status] || 'aguardando' }));

  if (filtroStatus !== 'todos') lista = lista.filter(p => p._statusMapeado === filtroStatus);
  if (termo) {
    lista = lista.filter(p =>
      (p.customer_name || '').toLowerCase().includes(termo) ||
      String(p.display_id ?? '').includes(numeroLimpo)
    );
  }

  if (!lista.length) {
    resEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--fg-subtle);font-size:var(--text-sm)">Nenhum pedido encontrado.</div>`;
    return;
  }

  resEl.innerHTML = lista.map(p => {
    const canal = ATD_CANAL_LABELS[_cwMapCanal(p.sales_channel)] || 'Site';
    return `
    <div class="conv-item" style="border-radius:var(--r8);border-bottom:none;margin-bottom:4px" onclick='_atdAbrirConversaDePedido(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
      <span style="width:34px;height:34px;border-radius:50%;background:var(--purple-xlight);color:var(--purple);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:var(--text-xs)">#${p.display_id ?? '—'}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="font-weight:700;font-size:var(--text-sm);color:var(--text)">${p.customer_name || 'Sem nome vinculado'}</div>
          ${p.customer_phone ? lc('phone', 12, 'var(--green)') : ''}
        </div>
        <div style="font-size:var(--text-xs);color:var(--fg-subtle)">
          ${ATD_STATUS_LABELS[p._statusMapeado]} · ${canal} ${p.total ? '· R$ ' + Number(p.total).toFixed(2) : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function _atdAbrirConversaDePedido(pedido) {
  if (!pedido.customer_phone) {
    toast('Esse pedido não tem telefone de cliente vinculado.', 'err');
    return;
  }

  const sb = _atdGetSbClient();

  // 1. Upsert contato pelo telefone do pedido
  const { data: contato, error: contatoErr } = await sb
    .from('atd_contatos')
    .upsert({ telefone: pedido.customer_phone, nome: pedido.customer_name || null, canal_origem: 'whatsapp' }, { onConflict: 'telefone' })
    .select('id')
    .single();
  if (contatoErr || !contato) { toast('Erro ao vincular contato', 'err'); return; }

  // 2. Busca conversa aberta existente desse contato, ou cria uma nova já com o pedido
  const { data: canal } = await sb.from('atd_canais').select('id').eq('tipo', 'whatsapp').eq('ativo', true).limit(1).single();
  const pedidoSnapshot = {
    display_id: pedido.display_id, status: pedido.status, total: pedido.total,
    order_type: pedido.order_type, delivery_address: pedido.delivery_address,
  };

  const { data: conversaExistente } = await sb
    .from('atd_conversas')
    .select('id')
    .eq('contato_id', contato.id)
    .eq('canal_tipo', 'whatsapp')
    .eq('status', 'aberta')
    .limit(1)
    .maybeSingle();

  let conversaId = conversaExistente?.id;
  if (conversaId) {
    await sb.from('atd_conversas').update({ pedido_id: String(pedido.id), pedido_data: pedidoSnapshot }).eq('id', conversaId);
  } else {
    const { data: novaConversa, error: convErr } = await sb
      .from('atd_conversas')
      .insert({
        contato_id: contato.id, canal_id: canal?.id ?? null, canal_tipo: 'whatsapp', status: 'aberta',
        pedido_id: String(pedido.id), pedido_data: pedidoSnapshot,
      })
      .select('id')
      .single();
    if (convErr || !novaConversa) { toast('Erro ao criar conversa', 'err'); return; }
    conversaId = novaConversa.id;
  }

  document.getElementById('popupAtdBuscaPedido')?.remove();
  await _atdCarregarConversas();
  await _atdAbrirConversa(conversaId);
  toast('Conversa vinculada ao pedido #' + (pedido.display_id ?? pedido.id), 'ok');
}

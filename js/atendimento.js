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

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
  modoNotaInterna: false,
  respostasRapidas: [],
  todasTags: [],
  tagsConversaAtual: [],
  corrigirAtivoPorConversa: {},
  viewMode: 'ativos',        // 'ativos' | 'concluidos' | 'busca'
  filtroAtivo: 'chat',       // 'chat' | 'avaliacoes'
  buscaRapidaTermo: '',
  perfisCache: {},           // { [id]: nome } — nomes dos atendentes p/ label interno
};

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

// Página ativa do módulo omnichannel (controlada pelo submenu lateral)
let _atdPaginaAtiva = 'inbox';

function renderOmnichannel() {
  // Injeta os estilos uma única vez
  if (!document.getElementById('atd-styles')) {
    const s = document.createElement('style');
    s.id = 'atd-styles';
    s.textContent = `
      .atd-canal-tab {
        border:1px solid var(--border); background:var(--bg-elevated); color:var(--fg-muted);
        font-size:var(--text-xs); font-weight:700; padding:5px 12px; border-radius:999px; cursor:pointer;
        display:flex; align-items:center; gap:5px;
      }
      .atd-canal-tab.active { background:var(--purple); color:#fff; border-color:var(--purple); }
      .atd-canal-tab .atd-tab-badge {
        background:rgba(255,255,255,.25); color:#fff; font-size:10px; font-weight:800;
        min-width:17px; height:17px; border-radius:999px; display:flex; align-items:center; justify-content:center; padding:0 4px;
      }
      .atd-canal-tab:not(.active) .atd-tab-badge { background:#E1306C; color:#fff; }
      .conv-item { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s; position:relative; border-left:3px solid transparent; }
      .conv-item:hover { background:var(--bg-hover); }
      .conv-item.active { background:#ede8ff; border-left-color:var(--purple); }
      .conv-item.active .conv-nome { color:var(--purple) !important; font-weight:800 !important; }
      .conv-item[data-canal="whatsapp"] { --canal-cor: #25D366; }
      .conv-item[data-canal="instagram"] { --canal-cor: #E1306C; }
      .conv-item:not(.active) { border-left-color: var(--canal-cor, transparent); }
      .conv-avatar { width:40px; height:40px; border-radius:50%; flex-shrink:0; object-fit:cover; }
      .conv-avatar-inicial { width:40px; height:40px; border-radius:50%; background:var(--purple); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; }
      .conv-nao-lidas { background:#E1306C; color:#fff; font-size:10px; font-weight:800; min-width:18px; height:18px; border-radius:999px; display:flex; align-items:center; justify-content:center; padding:0 4px; flex-shrink:0; }
      .msg-bubble { padding:9px 13px; border-radius:var(--r12); max-width:75%; word-break:break-word; font-size:var(--text-sm); line-height:1.5; }
      .msg-bubble.cliente { background:var(--surface2); align-self:flex-start; border-radius:2px var(--r12) var(--r12) var(--r12); }
      .msg-bubble.atendente { background:var(--purple); color:#fff; align-self:flex-end; border-radius:var(--r12) 2px var(--r12) var(--r12); }
      .msg-bubble.interna { background:var(--warning-bg); border:1px dashed var(--warning-border); align-self:stretch; font-size:var(--text-xs); }
      .atd-skeleton-page { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:340px; color:var(--fg-subtle); text-align:center; }
      .atd-skeleton-page h3 { font-size:var(--text-base); font-weight:700; color:var(--text); margin:0; }
      .atd-skeleton-page p { font-size:var(--text-sm); color:var(--fg-muted); margin:0; max-width:380px; line-height:1.6; }
      @media (max-width:900px) { .atd-panel { display:none !important; } }
      @media (max-width:640px) {
        .atd-layout { flex-direction:column; height:auto; min-height:calc(100vh - 64px); }
        .atd-sidebar { width:100%; max-height:200px; }
        .atd-chat { min-height:400px; }
      }
    `;
    document.head.appendChild(s);
  }

  // Marca o sub-item correto no painel lateral e renderiza a página
  _setSubPanelActive(_atdPaginaAtiva);

  const page = document.getElementById('page-omnichannel');
  page.innerHTML = '';

  switch (_atdPaginaAtiva) {
    case 'inbox':         _atdRenderInbox(); break;
    case 'respostas':     _atdRenderRespostas(); break;
    case 'estatisticas':  _atdRenderEstatisticas(); break;
    case 'integracoes':   _atdRenderIntegracoes(); break;
    case 'configuracoes': _atdRenderConfiguracoes(); break;
    default:              _atdRenderInbox();
  }
}

function _atdRenderInbox() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div class="atd-layout" style="display:flex;height:calc(100vh - 120px);background:var(--bg-elevated);border-radius:var(--r16);overflow:hidden;border:1px solid var(--border)">

      <!-- COLUNA A — lista de conversas -->
      <div class="atd-sidebar" style="width:300px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface2)">
        <div style="padding:12px 14px;border-bottom:1px solid var(--border)">

          <!-- Tabs Chat / Avaliações -->
          <div id="atdCanalTabs" style="display:flex;gap:6px;margin-bottom:10px">
            <button class="atd-canal-tab active" data-canal="chat" onclick="_atdAplicarFiltro('chat')" style="flex:1;justify-content:center">
              Chat <span class="atd-tab-badge" id="atdBadgeChat" style="display:none"></span>
            </button>
            <button class="atd-canal-tab" data-canal="avaliacoes" onclick="_atdAplicarFiltro('avaliacoes')" style="flex:1;justify-content:center">
              Avaliações <span class="atd-tab-badge" id="atdBadgeAvaliacoes" style="display:none"></span>
            </button>
          </div>

          <!-- Busca rápida de conversas -->
          <div style="position:relative;margin-bottom:8px">
            <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none">
              ${lc('search', 13, 'var(--fg-subtle)')}
            </span>
            <input id="atdBuscaRapida" type="text" placeholder="Buscar conversas..."
              style="width:100%;padding:7px 10px 7px 30px;border:1px solid var(--border);border-radius:var(--r8);font-size:var(--text-xs);background:var(--bg);color:var(--text);outline:none;box-sizing:border-box"
              oninput="_atdBuscaRapidaFiltrar(this.value)" />
            <button id="atdBuscaAvancadaBtn" onclick="_atdAbrirBuscaAvancada()"
              style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:2px;display:flex;align-items:center;color:var(--fg-subtle)"
              title="Busca avançada">
              ${lc('sliders', 13, 'var(--fg-subtle)')}
            </button>
          </div>

          <!-- Ativos / Concluídos / Buscar pedidos -->
          <div style="display:flex;gap:5px">
            <button id="atdTabAtivos" class="atd-canal-tab active" onclick="_atdSetViewMode('ativos')"
              style="flex:1;justify-content:center;font-size:10px;padding:4px 8px">Ativos</button>
            <button id="atdTabConcluidos" class="atd-canal-tab" onclick="_atdSetViewMode('concluidos')"
              style="flex:1;justify-content:center;font-size:10px;padding:4px 8px">Concluídos</button>
            <button class="btn btn-warm" onclick="_atdAbrirBuscaPedido()"
              style="font-size:10px;padding:4px 8px;white-space:nowrap">
              ${lc('package', 12, 'var(--text)')} Pedidos
            </button>
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
  `;

  _atdCarregarConversas();
  _atdAssinarRealtime();
  _atdCarregarRespostasRapidas();
  _atdCarregarTodasTags();
}

async function _atdCarregarRespostasRapidas() {
  const sb = _atdGetSbClient();
  const { data } = await sb.from('atd_respostas_rapidas').select('*').eq('ativo', true).order('atalho');
  _atdState.respostasRapidas = data || [];
}

async function _atdCarregarTodasTags() {
  const sb = _atdGetSbClient();
  const { data } = await sb.from('atd_tags').select('*').eq('ativo', true).order('categoria, nome');
  _atdState.todasTags = data || [];
}

// ══════════════════════════════════════════════════════════════
// LISTA DE CONVERSAS
// ══════════════════════════════════════════════════════════════

async function _atdCarregarConversas() {
  const sb = _atdGetSbClient();
  const viewMode = _atdState.viewMode || 'ativos';
  const statusFiltro = viewMode === 'concluidos'
    ? ['concluida', 'expirada']
    : ['aberta', 'em_atendimento', 'aguardando_cliente'];

  const { data, error } = await sb
    .from('atd_conversas')
    .select('id, status, atendente_id, canal_tipo, pedido_data, atualizado_em, mensagens_nao_lidas, ultima_mensagem, ultima_msg_atendente_em, ultima_msg_cliente_em, concluida_em, atd_contatos(nome, telefone, instagram_id, avatar_url)')
    .in('status', statusFiltro)
    .order('atualizado_em', { ascending: false })
    .limit(viewMode === 'concluidos' ? 200 : 500);

  if (error) { console.error('[atendimento] erro ao carregar conversas', error); return; }
  _atdState.conversas = data || [];
  _atdRenderLista();
}

function _atdSetViewMode(mode) {
  _atdState.viewMode = mode;
  _atdState.buscaRapidaTermo = '';
  const inp = document.getElementById('atdBuscaRapida');
  if (inp) inp.value = '';
  document.getElementById('atdTabAtivos')?.classList.toggle('active', mode === 'ativos');
  document.getElementById('atdTabConcluidos')?.classList.toggle('active', mode === 'concluidos');
  // Limpa conversa ativa ao entrar em histórico
  if (mode === 'concluidos') {
    _atdState.conversaAtivaId = null;
    const vazio = document.getElementById('atdChatVazio');
    const ativo = document.getElementById('atdChatAtivo');
    const painel = document.getElementById('atdPainelContato');
    if (vazio) vazio.style.display = 'flex';
    if (ativo) ativo.style.display = 'none';
    if (painel) painel.style.display = 'none';
  }
  _atdCarregarConversas();
}

function _atdBuscaRapidaFiltrar(termo) {
  _atdState.buscaRapidaTermo = (termo || '').toLowerCase().trim();
  _atdRenderLista();
}

function _atdAbrirBuscaAvancada() {
  const overlay = document.createElement('div');
  overlay.id = 'atdBuscaAvancadaOverlay';
  overlay.className = 'overlay';
  overlay.style.cssText = 'z-index:9000';
  overlay.innerHTML = `
    <div class="mbox" style="width:420px;max-width:95vw" onclick="event.stopPropagation()">
      <div style="font-weight:800;font-size:var(--text-base);margin-bottom:16px;display:flex;align-items:center;gap:8px">
        ${lc('search', 16, 'var(--purple)')} Busca avançada
      </div>
      <div class="field" style="margin-bottom:12px">
        <label style="font-size:var(--text-xs);font-weight:600;color:var(--fg-subtle);margin-bottom:4px;display:block">Nome ou telefone</label>
        <input id="atdBuscaNome" class="inp" type="text" placeholder="Camila Oliveira ou 11999..." style="font-size:var(--text-sm)">
      </div>
      <div class="f2" style="gap:10px;margin-bottom:12px">
        <div class="field">
          <label style="font-size:var(--text-xs);font-weight:600;color:var(--fg-subtle);margin-bottom:4px;display:block">Data início</label>
          <input id="atdBuscaDataInicio" class="inp" type="date" style="font-size:var(--text-sm)">
        </div>
        <div class="field">
          <label style="font-size:var(--text-xs);font-weight:600;color:var(--fg-subtle);margin-bottom:4px;display:block">Data fim</label>
          <input id="atdBuscaDataFim" class="inp" type="date" style="font-size:var(--text-sm)">
        </div>
      </div>
      <div class="field" style="margin-bottom:16px">
        <label style="font-size:var(--text-xs);font-weight:600;color:var(--fg-subtle);margin-bottom:4px;display:block">Número do pedido</label>
        <input id="atdBuscaPedidoNum" class="inp" type="text" placeholder="Ex: 1042" style="font-size:var(--text-sm)">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('atdBuscaAvancadaOverlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_atdExecutarBuscaAvancada()">
          ${lc('search', 13, '#fff')} Buscar
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

async function _atdExecutarBuscaAvancada() {
  const nome   = document.getElementById('atdBuscaNome')?.value.trim() || '';
  const di     = document.getElementById('atdBuscaDataInicio')?.value || '';
  const df     = document.getElementById('atdBuscaDataFim')?.value || '';
  const pedido = document.getElementById('atdBuscaPedidoNum')?.value.trim() || '';
  document.getElementById('atdBuscaAvancadaOverlay')?.remove();

  const sb = _atdGetSbClient();
  let q = sb
    .from('atd_conversas')
    .select('id, status, atendente_id, canal_tipo, pedido_data, atualizado_em, mensagens_nao_lidas, ultima_mensagem, ultima_msg_atendente_em, ultima_msg_cliente_em, concluida_em, atd_contatos(nome, telefone, instagram_id, avatar_url)')
    .order('atualizado_em', { ascending: false })
    .limit(300);

  if (di) q = q.gte('atualizado_em', di);
  if (df) q = q.lte('atualizado_em', df + 'T23:59:59');
  if (pedido) q = q.contains('pedido_data', { display_id: pedido });

  const { data, error } = await q;
  if (error) { toast('Erro na busca', 'err'); return; }

  let resultado = data || [];
  if (nome) {
    const t = nome.toLowerCase();
    resultado = resultado.filter(c => {
      const ct = c.atd_contatos || {};
      return (ct.nome || '').toLowerCase().includes(t) || (ct.telefone || '').includes(t);
    });
  }

  _atdState.conversas = resultado;
  _atdState.viewMode = 'busca';
  document.getElementById('atdTabAtivos')?.classList.remove('active');
  document.getElementById('atdTabConcluidos')?.classList.remove('active');
  _atdRenderLista();
}

function _atdAplicarFiltro(filtro) {
  document.querySelectorAll('#atdCanalTabs .atd-canal-tab').forEach(b => b.classList.toggle('active', b.dataset.canal === filtro));
  _atdState.filtroAtivo = filtro;
  _atdRenderLista();
}

function _atdAplicarSubFiltro(sub) {
  _atdState.subFiltroAtivo = sub;
  _atdRenderLista();
}

function _atdTocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.setValueAtTime(640, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.35);
  } catch { /* sem som se browser bloquear */ }
}

const _ATD_CANAIS_CHAT = ['whatsapp', 'instagram'];
const _ATD_CANAIS_AVAL = ['ifood', '99food'];

function _atdRenderLista() {
  const filtro  = _atdState.filtroAtivo || 'chat';
  const canais  = filtro === 'avaliacoes' ? _ATD_CANAIS_AVAL : _ATD_CANAIS_CHAT;
  const termo   = _atdState.buscaRapidaTermo || '';
  const viewMode = _atdState.viewMode || 'ativos';

  let lista = _atdState.conversas.filter(c => canais.includes(c.canal_tipo));

  // Busca rápida por nome/telefone
  if (termo) {
    lista = lista.filter(c => {
      const ct = c.atd_contatos || {};
      return (ct.nome || '').toLowerCase().includes(termo) || (ct.telefone || '').includes(termo);
    });
  }

  // Garante que a conversa atualmente aberta nunca some da lista
  const ativaId = _atdState.conversaAtivaId;
  if (ativaId && viewMode === 'ativos' && !lista.find(c => c.id === ativaId)) {
    const convAtiva = _atdState.conversas.find(c => c.id === ativaId);
    if (convAtiva) lista = [convAtiva, ...lista];
  }

  // Atualiza badges de não-lidas nas abas
  const totalChat = _atdState.conversas.filter(c => _ATD_CANAIS_CHAT.includes(c.canal_tipo)).reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
  const totalAval = _atdState.conversas.filter(c => _ATD_CANAIS_AVAL.includes(c.canal_tipo)).reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
  const badgeChat = document.getElementById('atdBadgeChat');
  const badgeAval = document.getElementById('atdBadgeAvaliacoes');
  if (badgeChat) { badgeChat.textContent = totalChat || ''; badgeChat.style.display = totalChat ? 'flex' : 'none'; }
  if (badgeAval) { badgeAval.textContent = totalAval || ''; badgeAval.style.display = totalAval ? 'flex' : 'none'; }

  const el = document.getElementById('atdListaConversas');
  if (!el) return;

  if (!lista.length) {
    const msg = viewMode === 'concluidos' ? 'Nenhuma conversa concluída.' : viewMode === 'busca' ? 'Nenhum resultado encontrado.' : 'Nenhuma conversa ativa.';
    el.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--fg-subtle);font-size:var(--text-sm)">${lc('inbox', 28, 'var(--border)')}<br><br>${msg}</div>`;
    return;
  }

  const agora = Date.now();

  const STATUS_CONV = {
    aberta:             { label: 'Nova',        cor: 'var(--purple)',      bg: 'var(--purple-xlight)' },
    em_atendimento:     { label: 'Atendendo',   cor: 'var(--green)',       bg: 'var(--success-bg)'    },
    aguardando_cliente: { label: 'Aguardando',  cor: 'var(--warning-fg)',  bg: 'var(--warning-bg)'    },
    concluida:          { label: 'Concluída',   cor: 'var(--fg-subtle)',   bg: 'var(--surface2)'      },
    expirada:           { label: 'Expirada',    cor: 'var(--danger)',      bg: 'var(--danger-bg)'     },
  };

  el.innerHTML = lista.map(c => {
    const contato = c.atd_contatos || {};
    const nome = contato.nome || contato.telefone || (contato.instagram_id ? '@' + contato.instagram_id : 'Sem nome');
    const inicial = nome.charAt(0).toUpperCase();
    const ativa = c.id === _atdState.conversaAtivaId;
    const naoLidas = c.mensagens_nao_lidas || 0;
    const isConcluida = c.status === 'concluida' || c.status === 'expirada';

    const avatar = contato.avatar_url
      ? `<img class="conv-avatar" src="${contato.avatar_url}" alt="${inicial}" style="${isConcluida ? 'opacity:.55' : ''}" onerror="this.outerHTML='<div class=conv-avatar-inicial style=\\'${isConcluida ? 'opacity:.55' : ''}\\'>  ${inicial}</div>'">`
      : `<div class="conv-avatar-inicial" style="${isConcluida ? 'opacity:.55;background:var(--surface3)' : ''}">${inicial}</div>`;

    const st = STATUS_CONV[c.status] || STATUS_CONV.aberta;
    const statusBadge = `<span style="font-size:9px;font-weight:700;color:${st.cor};background:${st.bg};padding:1px 6px;border-radius:999px;white-space:nowrap;flex-shrink:0">${st.label}</span>`;

    // Timer de espera (só em conversas ativas)
    let timerHtml = '';
    if (!isConcluida) {
      const refTs = c.status === 'aguardando_cliente'
        ? c.ultima_msg_atendente_em
        : c.ultima_msg_cliente_em;
      if (refTs) {
        const diffMin = Math.floor((agora - new Date(refTs).getTime()) / 60000);
        if (diffMin >= 1) {
          const cor = diffMin >= 60 ? 'var(--danger)' : diffMin >= 15 ? 'var(--warning-fg)' : 'var(--fg-subtle)';
          const label = diffMin < 60 ? `${diffMin}min` : `${Math.floor(diffMin/60)}h${diffMin%60 ? String(diffMin%60).padStart(2,'0')+'m' : ''}`;
          timerHtml = `<span style="font-size:9px;color:${cor};font-weight:600;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:2px">${lc('clock', 9, cor)} ${label}</span>`;
        }
      }
    }

    // Preview da última mensagem
    const previewTexto = c.ultima_mensagem?.texto || '';
    const previewOrigem = c.ultima_mensagem?.origem;
    const previewPrefix = previewOrigem === 'atendente'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--fg-subtle)"><polyline points="20 6 9 17 4 12"/></svg>`
      : '';

    // Data/hora relativa
    const ts = c.atualizado_em ? new Date(c.atualizado_em) : null;
    let dataHtml = '';
    if (ts) {
      const diffH = (agora - ts.getTime()) / 3600000;
      const dataLabel = diffH < 24
        ? ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      dataHtml = `<span style="font-size:10px;color:var(--fg-subtle);flex-shrink:0;white-space:nowrap">${dataLabel}</span>`;
    }

    // Pedido vinculado (se tiver)
    const pedidoHtml = c.pedido_data?.display_id
      ? `<span style="font-size:9px;color:var(--fg-subtle);background:var(--surface3);padding:1px 5px;border-radius:4px;flex-shrink:0">#${c.pedido_data.display_id}</span>`
      : '';

    return `
      <div class="conv-item ${ativa ? 'active' : ''}" onclick="_atdAbrirConversa('${c.id}')">
        <!-- Avatar com ícone do canal -->
        <div style="position:relative;flex-shrink:0">
          ${avatar}
          <span style="position:absolute;bottom:-1px;right:-1px;width:15px;height:15px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center">
            ${_atdIconeCanal(c.canal_tipo, 12)}
          </span>
        </div>

        <!-- Conteúdo principal -->
        <div style="flex:1;min-width:0">
          <!-- Linha 1: Nome (destaque) + data + não-lidas -->
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:2px">
            <div style="font-weight:800;font-size:var(--text-sm);color:${isConcluida ? 'var(--fg-subtle)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
              ${dataHtml}
              ${naoLidas ? `<span class="conv-nao-lidas">${naoLidas}</span>` : ''}
            </div>
          </div>
          <!-- Linha 2: Preview da mensagem -->
          <div style="font-size:var(--text-xs);color:var(--fg-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:3px;margin-bottom:4px">
            ${previewPrefix}${previewTexto || '<em style="opacity:.6">Sem mensagens</em>'}
          </div>
          <!-- Linha 3: Status + timer + pedido -->
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            ${statusBadge}
            ${timerHtml}
            ${pedidoHtml}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// CONVERSA ATIVA
// ══════════════════════════════════════════════════════════════

async function _atdAbrirConversa(conversaId) {
  // Garante que o inbox está renderizado (pode ter sido navegado para outra seção)
  if (!document.getElementById('atdChatVazio')) {
    _atdPaginaAtiva = 'inbox';
    renderOmnichannel();
    await new Promise(r => setTimeout(r, 50));
  }

  _atdState.conversaAtivaId = conversaId;

  // Zera não-lidas localmente e no banco
  const conv = _atdState.conversas.find(c => c.id === conversaId);
  if (conv && conv.mensagens_nao_lidas > 0) {
    conv.mensagens_nao_lidas = 0;
    _atdGetSbClient().from('atd_conversas').update({ mensagens_nao_lidas: 0 }).eq('id', conversaId).then(() => {});
  }
  _atdRenderLista();
  const totalNaoLidas = _atdState.conversas.reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
  document.title = totalNaoLidas > 0 ? `(${totalNaoLidas}) VTP Atendimento` : 'VTP Atendimento';

  const chatVazio = document.getElementById('atdChatVazio');
  const chatAtivo = document.getElementById('atdChatAtivo');
  const painelContato = document.getElementById('atdPainelContato');
  if (!chatVazio || !chatAtivo) { console.error('[atd] elementos do chat não encontrados'); return; }

  chatVazio.style.display = 'none';
  chatAtivo.style.display  = 'flex';
  if (painelContato) painelContato.style.display = 'block';

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

  const { data: tagsConversa } = await sb
    .from('atd_conversa_tags')
    .select('tag_id')
    .eq('conversa_id', conversaId);

  // Busca nomes dos atendentes que participaram (para label interno nas bolhas)
  // Monta cache de nomes usando o usuário local (auth via sessionStorage)
  const userAtual = getCurrentUser();
  if (userAtual?.id) {
    _atdState.perfisCache = { [userAtual.id]: userAtual.name || userAtual.nome || 'Você' };
  }

  _atdState.mensagens = mensagens || [];
  _atdState.tagsConversaAtual = (tagsConversa || []).map(t => t.tag_id);
  _atdRenderChat(conversa);
  _atdRenderPainel(conversa);
}

function _atdRenderChat(conversa) {
  const nome = conversa.atd_contatos?.nome || conversa.atd_contatos?.telefone || 'Sem nome';
  const bubbles = _atdState.mensagens.map(m => {
    const classe = m.visibilidade === 'interna' ? 'interna' : (m.origem === 'cliente' ? 'cliente' : 'atendente');
    const hora = new Date(m.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const prefixo = classe === 'interna' ? `${lc('lock', 11, 'var(--warning-fg)')} ` : '';

    let conteudoHtml;
    if (m.tipo === 'localizacao' && m.conteudo?.latitude != null) {
      const lat = m.conteudo.latitude;
      const lng = m.conteudo.longitude;
      const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
      conteudoHtml = `
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            ${lc('map-pin', 14, classe === 'cliente' ? 'var(--text)' : '#fff')}
            <span style="font-weight:700">Localização</span>
          </div>
          <img src="https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=240x140&markers=${lat},${lng}&key=AIzaSyD-stub"
               onerror="this.outerHTML='<div style=\'background:var(--border);border-radius:8px;width:240px;height:80px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--fg-subtle)\'>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>'"
               style="width:240px;height:140px;border-radius:8px;object-fit:cover;display:block;margin-bottom:8px">
          <div style="display:flex;gap:6px">
            <a href="${mapsUrl}" target="_blank" style="flex:1;text-align:center;padding:5px 8px;background:rgba(0,0,0,.12);border-radius:6px;font-size:11px;font-weight:700;color:inherit;text-decoration:none">
              ${lc('external-link', 11, 'currentColor')} Abrir Maps
            </a>
            <button onclick="_atdEncaminharLocalizacao(${lat},${lng})" style="flex:1;padding:5px 8px;background:rgba(0,0,0,.12);border:none;border-radius:6px;font-size:11px;font-weight:700;color:inherit;cursor:pointer">
              ${lc('send', 11, 'currentColor')} Encaminhar
            </button>
          </div>
        </div>`;
    } else if (m.tipo === 'imagem' && m.conteudo?.url) {
      const legenda = m.conteudo.texto ? `<div style="margin-top:6px;font-size:var(--text-xs);opacity:.85">${m.conteudo.texto}</div>` : '';
      conteudoHtml = `
        <a href="${m.conteudo.url}" target="_blank" style="display:block">
          <img src="${m.conteudo.url}"
               alt="Imagem"
               style="max-width:240px;max-height:300px;border-radius:8px;display:block;object-fit:cover"
               onerror="this.outerHTML='<div style=\'padding:8px;font-size:13px\'>📷 Imagem (não disponível)</div>'">
        </a>${legenda}`;
    } else if (m.tipo === 'imagem') {
      conteudoHtml = `📷 Imagem${m.conteudo?.texto ? ': ' + m.conteudo.texto : ''}`;
    } else if (m.tipo === 'audio' && m.conteudo?.url) {
      conteudoHtml = `<audio controls style="max-width:240px;margin:2px 0"><source src="${m.conteudo.url}">🎤 Áudio</audio>`;
    } else if (m.tipo === 'audio') {
      conteudoHtml = `🎤 Áudio`;
    } else if (m.tipo === 'video' && m.conteudo?.url) {
      const legenda = m.conteudo.texto ? `<div style="margin-top:6px;font-size:var(--text-xs);opacity:.85">${m.conteudo.texto}</div>` : '';
      conteudoHtml = `
        <video controls style="max-width:240px;border-radius:8px;display:block"
               onerror="this.outerHTML='<div style=\'padding:8px;font-size:13px\'>🎥 Vídeo (não disponível)</div>'">
          <source src="${m.conteudo.url}">🎥 Vídeo
        </video>${legenda}`;
    } else if (m.tipo === 'video') {
      conteudoHtml = `🎥 Vídeo${m.conteudo?.texto ? ': ' + m.conteudo.texto : ''}`;
    } else if (m.tipo === 'documento' && m.conteudo?.url) {
      const nome = m.conteudo.nome || 'Documento';
      conteudoHtml = `<a href="${m.conteudo.url}" target="_blank" style="display:flex;align-items:center;gap:6px;color:inherit;text-decoration:none">${lc('file', 14, 'currentColor')} ${nome}</a>`;
    } else if (m.tipo === 'documento') {
      conteudoHtml = `📄 Documento`;
    } else if (m.tipo === 'sticker' && m.conteudo?.url) {
      conteudoHtml = `<img src="${m.conteudo.url}" alt="Sticker" style="max-width:120px;max-height:120px;display:block" onerror="this.outerHTML='😊 Sticker'">`;
    } else if (m.tipo === 'sticker') {
      conteudoHtml = `😊 Sticker`;
    } else {
      conteudoHtml = `${prefixo}${m.conteudo?.texto ?? ''}`;
    }

    // Label interno do remetente (visível só no app, acima da bolha)
    const nomeAtendente = (m.origem === 'atendente' && m.atendente_id)
      ? (_atdState.perfisCache?.[m.atendente_id] || 'Atendente')
      : null;
    const labelAtendente = nomeAtendente
      ? `<div style="text-align:right;font-size:9px;font-weight:700;color:var(--fg-subtle);margin-bottom:2px;padding-right:2px">${nomeAtendente}</div>`
      : '';

    return `${labelAtendente}<div class="msg-bubble ${classe}">${conteudoHtml}<div style="font-size:10px;opacity:.7;margin-top:4px">${hora}</div></div>`;
  }).join('');

  _atdState.modoNotaInterna = false;
  const corrigirAtivo = !!_atdState.corrigirAtivoPorConversa[conversa.id];

  document.getElementById('atdChatAtivo').innerHTML = `
    <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="font-weight:700;font-size:var(--text-base);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
      <button class="btn btn-primary" style="font-size:var(--text-xs);background:var(--green);border-color:var(--green);flex-shrink:0" onclick="_atdConcluirConversa('${conversa.id}')">
        ${lc('check-circle', 14, '#fff')} Concluir conversa
      </button>
    </div>
    <div id="atdMensagensWrap" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px">
      ${bubbles || '<div style="color:var(--fg-subtle);font-size:var(--text-sm);text-align:center;margin-top:40px">Sem mensagens ainda.</div>'}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);position:relative">
      <div id="atdRespostasRapidasDropdown" style="display:none;position:absolute;bottom:100%;left:16px;right:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);box-shadow:0 -4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;margin-bottom:6px;z-index:10"></div>
      <input type="file" id="atdInputArquivo" style="display:none" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        onchange="_atdUploadArquivo('${conversa.id}', this)">
      <div style="display:flex;gap:8px;align-items:flex-end">
        <button id="atdBtnNotaInterna" class="btn btn-ghost" title="Nota interna (só a equipe vê)" style="font-size:var(--text-xs);flex-shrink:0" onclick="_atdToggleNotaInterna('${conversa.id}')">
          ${lc('lock', 14, 'var(--fg-muted)')}
        </button>
        <button class="btn btn-ghost" title="Enviar arquivo/imagem" style="font-size:var(--text-xs);flex-shrink:0" onclick="document.getElementById('atdInputArquivo').click()">
          ${lc('paperclip', 14, 'var(--fg-muted)')}
        </button>
        <button id="atdBtnGerarResposta" class="btn btn-ghost" title="Gerar resposta ideal com IA" style="font-size:var(--text-xs);flex-shrink:0" onclick="_atdGerarResposta('${conversa.id}')">
          ${lc('zap', 14, 'var(--purple)')}
        </button>
        <button id="atdBtnCorrecaoAuto" class="btn btn-ghost" title="${corrigirAtivo ? 'Correção automática ATIVADA — sua mensagem é corrigida ao enviar. Clique para desativar' : 'Correção automática DESATIVADA — clique para ativar'}"
          style="font-size:var(--text-xs);flex-shrink:0;${corrigirAtivo ? 'background:var(--purple);' : ''}" onclick="_atdToggleModoCorrecao('${conversa.id}')">
          ${lc('pencil', 14, corrigirAtivo ? '#fff' : 'var(--fg-muted)')}
        </button>
        <textarea id="atdCampoTexto" class="inp" rows="2" placeholder="Digite sua resposta... (/ pra respostas rápidas)"
          style="flex:1;resize:none" oninput="_atdCampoOnInput()"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_atdEnviarMensagem('${conversa.id}')}"></textarea>
        <button class="btn btn-primary" onclick="_atdEnviarMensagem('${conversa.id}')">
          ${lc('send', 15, '#fff')}
        </button>
      </div>
    </div>
  `;

  const wrap = document.getElementById('atdMensagensWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function _atdToggleNotaInterna(conversaId) {
  _atdState.modoNotaInterna = !_atdState.modoNotaInterna;
  const btn = document.getElementById('atdBtnNotaInterna');
  const campo = document.getElementById('atdCampoTexto');
  if (_atdState.modoNotaInterna) {
    btn.classList.add('active-nota');
    btn.style.background = 'var(--warning-bg)';
    campo.placeholder = 'Nota interna — não vai pro cliente...';
    campo.style.background = 'var(--warning-bg)';
  } else {
    btn.classList.remove('active-nota');
    btn.style.background = '';
    campo.placeholder = 'Digite sua resposta... (/ pra respostas rápidas)';
    campo.style.background = '';
  }
  campo.focus();
}

function _atdCampoOnInput() {
  const campo = document.getElementById('atdCampoTexto');
  const dropdown = document.getElementById('atdRespostasRapidasDropdown');
  if (!campo || !dropdown) return;
  const valor = campo.value;

  if (!valor.startsWith('/')) { dropdown.style.display = 'none'; return; }

  const termo = valor.slice(1).toLowerCase();
  const opcoes = _atdState.respostasRapidas.filter(r => r.atalho.toLowerCase().includes(termo));

  if (!opcoes.length) { dropdown.style.display = 'none'; return; }

  dropdown.style.display = 'block';
  dropdown.innerHTML = opcoes.map(r => `
    <div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseenter="this.style.background='var(--bg-hover)'" onmouseleave="this.style.background=''"
      onclick="_atdInserirRespostaRapida(${JSON.stringify(r.conteudo).replace(/"/g, '&quot;')})">
      <div style="font-weight:700;font-size:var(--text-xs);color:var(--purple)">${r.atalho}</div>
      <div style="font-size:var(--text-xs);color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.titulo}</div>
    </div>`).join('');
}

function _atdToggleModoCorrecao(conversaId) {
  const ativo = !_atdState.corrigirAtivoPorConversa[conversaId];
  _atdState.corrigirAtivoPorConversa[conversaId] = ativo;

  const btn = document.getElementById('atdBtnCorrecaoAuto');
  if (btn) {
    btn.style.background = ativo ? 'var(--purple)' : '';
    btn.title = ativo ? 'Correção automática ATIVADA — sua mensagem é corrigida ao enviar. Clique para desativar' : 'Correção automática DESATIVADA — clique para ativar';
    btn.innerHTML = lc('pencil', 14, ativo ? '#fff' : 'var(--fg-muted)');
  }
}

async function _atdGerarResposta(conversaId) {
  const campo = document.getElementById('atdCampoTexto');
  const btn = document.getElementById('atdBtnGerarResposta');
  if (!campo || !btn) return;

  btn.disabled = true;
  const iconeOriginal = btn.innerHTML;
  btn.innerHTML = lc('hourglass', 14, 'var(--purple)');

  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/gerar-resposta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ conversa_id: conversaId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'falha ao gerar resposta');
    campo.value = json.resposta;
    campo.focus();
  } catch (e) {
    if (typeof toast === 'function') toast('Não foi possível gerar a resposta: ' + e.message, 'err');
    else console.error('[atendimento] gerar-resposta:', e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = iconeOriginal;
  }
}

function _atdInserirRespostaRapida(conteudo) {
  const campo = document.getElementById('atdCampoTexto');
  campo.value = conteudo;
  document.getElementById('atdRespostasRapidasDropdown').style.display = 'none';
  campo.focus();
}

async function _atdRenderPainel(conversa) {
  const c = conversa.atd_contatos || {};
  const nome = c.nome || c.telefone || 'Sem nome';
  const pedido = conversa.pedido_data;
  const painel = document.getElementById('atdPainelContato');

  // Cabeçalho e pedido vinculado imediatos (sem esperar histórico)
  const avatarHtml = c.avatar_url
    ? `<img src="${c.avatar_url}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin:0 auto 8px;display:block">`
    : `<span style="width:56px;height:56px;border-radius:50%;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;margin:0 auto 8px">${nome.charAt(0).toUpperCase()}</span>`;

  const pedidoVinculadoHtml = pedido ? `
    <div style="padding:12px 14px;border-bottom:1px solid var(--border)">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:6px">Pedido vinculado</div>
      <div style="font-size:var(--text-sm);color:var(--text);font-weight:700">#${pedido.display_id ?? '—'}</div>
      <div style="font-size:var(--text-xs);color:var(--fg-muted)">${pedido.status ?? ''}</div>
      ${pedido.total ? `<div style="font-size:var(--text-sm);color:var(--text);font-weight:700;margin-top:2px">R$ ${Number(pedido.total).toFixed(2)}</div>` : ''}
      ${pedido.delivery_address ? `
        <button class="btn btn-ghost" style="margin-top:8px;width:100%;font-size:var(--text-xs)" onclick="_atdAbrirEndereco(${JSON.stringify(pedido.delivery_address).replace(/"/g, '&quot;')})">
          ${lc('map-pin', 13, 'var(--purple)')} Ver endereço de entrega
        </button>` : ''}
    </div>` : '';

  painel.innerHTML = `
    <div style="padding:18px 14px;border-bottom:1px solid var(--border);text-align:center">
      ${avatarHtml}
      <div style="font-weight:800;color:var(--text);font-size:var(--text-sm)">${nome}</div>
      <div style="font-size:var(--text-xs);color:var(--fg-subtle);display:flex;align-items:center;justify-content:center;gap:4px;margin-top:3px">
        ${lc('phone', 11, 'currentColor')} ${c.telefone || '—'}
      </div>
    </div>
    ${pedidoVinculadoHtml}
    <div id="atdHistoricoCliente" style="padding:12px 14px">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">
        ${lc('package', 12, 'currentColor')} Histórico no CardápioWeb
      </div>
      <div style="color:var(--fg-subtle);font-size:var(--text-xs)">Carregando...</div>
    </div>
  `;

  // Carrega histórico do cliente assincronamente
  if (c.telefone) {
    _atdCarregarHistoricoCliente(c.telefone);
  } else {
    document.getElementById('atdHistoricoCliente').innerHTML = `
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">
        ${lc('package', 12, 'currentColor')} Histórico no CardápioWeb
      </div>
      <div style="color:var(--fg-subtle);font-size:var(--text-xs)">Sem telefone cadastrado</div>
    `;
  }
}

async function _atdCarregarHistoricoCliente(telefone) {
  const sb = _atdGetSbClient();
  // Normaliza: remove DDI 55 e não-dígitos para comparar
  const digitos = String(telefone).replace(/\D/g, '');
  const semDdi = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`;

  const { data: pedidos } = await sb
    .from('cw_pedidos')
    .select('id, display_id, status, total, items, cw_created_at, customer_name')
    .or(`customer_phone.eq.${semDdi},customer_phone.eq.${comDdi}`)
    .order('cw_created_at', { ascending: false })
    .limit(20);

  const el = document.getElementById('atdHistoricoCliente');
  if (!el) return;

  if (!pedidos || pedidos.length === 0) {
    el.innerHTML = `
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">
        ${lc('package', 12, 'currentColor')} Histórico no CardápioWeb
      </div>
      <div style="color:var(--fg-subtle);font-size:var(--text-xs)">Nenhum pedido encontrado</div>`;
    return;
  }

  const total = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const ticketMedio = total / pedidos.length;

  const linhas = pedidos.slice(0, 8).map(p => {
    const data = p.cw_created_at ? new Date(p.cw_created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '—';
    const valor = p.total ? `R$ ${Number(p.total).toFixed(2)}` : '—';
    const statusCor = { 'CONCLUDED': 'var(--green)', 'CANCELLED': 'var(--danger)', 'PLACED': 'var(--warning-fg)' }[p.status] || 'var(--fg-subtle)';
    const itensResumo = Array.isArray(p.items) && p.items.length > 0
      ? p.items.slice(0, 2).map(i => i.name || i.item?.name || '').filter(Boolean).join(', ') + (p.items.length > 2 ? ` +${p.items.length - 2}` : '')
      : '';
    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text)">#${p.display_id || p.id?.slice(0,6)}</span>
          <span style="font-size:var(--text-xs);font-weight:700;color:var(--text)">${valor}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1px">
          <span style="font-size:10px;color:${statusCor};font-weight:600">${p.status || '—'}</span>
          <span style="font-size:10px;color:var(--fg-subtle)">${data}</span>
        </div>
        ${itensResumo ? `<div style="font-size:10px;color:var(--fg-subtle);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${itensResumo}</div>` : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">
      ${lc('package', 12, 'currentColor')} Histórico no CardápioWeb
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;text-align:center">
      <div style="background:var(--bg-subtle);border-radius:var(--r8);padding:8px 4px">
        <div style="font-size:15px;font-weight:800;color:var(--purple)">${pedidos.length}</div>
        <div style="font-size:9px;color:var(--fg-subtle);font-weight:700;text-transform:uppercase">Pedidos</div>
      </div>
      <div style="background:var(--bg-subtle);border-radius:var(--r8);padding:8px 4px">
        <div style="font-size:13px;font-weight:800;color:var(--text)">R$${ticketMedio.toFixed(0)}</div>
        <div style="font-size:9px;color:var(--fg-subtle);font-weight:700;text-transform:uppercase">Ticket médio</div>
      </div>
      <div style="background:var(--bg-subtle);border-radius:var(--r8);padding:8px 4px">
        <div style="font-size:13px;font-weight:800;color:var(--text)">R$${total.toFixed(0)}</div>
        <div style="font-size:9px;color:var(--fg-subtle);font-weight:700;text-transform:uppercase">Total gasto</div>
      </div>
    </div>
    <div>${linhas}</div>
    ${pedidos.length > 8 ? `<div style="font-size:10px;color:var(--fg-subtle);text-align:center;padding-top:6px">+${pedidos.length - 8} pedidos anteriores</div>` : ''}
  `;
}

async function _atdToggleTag(conversaId, tagId) {
  const sb = _atdGetSbClient();
  const jaTemTag = _atdState.tagsConversaAtual.includes(tagId);

  if (jaTemTag) {
    const { error } = await sb.from('atd_conversa_tags').delete().eq('conversa_id', conversaId).eq('tag_id', tagId);
    if (error) { toast('Erro ao remover tag', 'err'); return; }
    _atdState.tagsConversaAtual = _atdState.tagsConversaAtual.filter(id => id !== tagId);
  } else {
    const user = getCurrentUser();
    const { error } = await sb.from('atd_conversa_tags').insert({
      conversa_id: conversaId,
      tag_id: tagId,
      origem: 'manual',
      atendente_id: user?.id ?? null,
      confirmada: true,
    });
    if (error) { toast('Erro ao adicionar tag', 'err'); return; }
    _atdState.tagsConversaAtual.push(tagId);
  }

  const chip = document.querySelector(`.atd-tag-chip[data-tag-id="${tagId}"]`);
  if (chip) {
    const tag = _atdState.todasTags.find(t => t.id === tagId);
    const cor = tag?.cor || 'var(--purple)';
    const ativa = _atdState.tagsConversaAtual.includes(tagId);
    chip.style.background = ativa ? cor : 'transparent';
    chip.style.color = ativa ? '#fff' : cor;
  }
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
  let texto = campo?.value.trim();
  if (!texto) return;

  const user = getCurrentUser();
  const visibilidade = _atdState.modoNotaInterna ? 'interna' : 'publica';
  campo.value = '';
  campo.disabled = true;
  document.getElementById('atdRespostasRapidasDropdown')?.style && (document.getElementById('atdRespostasRapidasDropdown').style.display = 'none');

  if (visibilidade === 'publica' && _atdState.corrigirAtivoPorConversa[conversaId]) {
    try {
      const resCorrecao = await fetch(`${VTP_SUPABASE_URL}/functions/v1/corrigir-mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
        body: JSON.stringify({ texto }),
      });
      const jsonCorrecao = await resCorrecao.json();
      if (resCorrecao.ok && jsonCorrecao.corrigido) texto = jsonCorrecao.corrigido;
    } catch (e) {
      console.warn('[atendimento] correção automática falhou, enviando texto original:', e);
    }
  }

  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/enviar-mensagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ conversa_id: conversaId, texto, atendente_id: user?.id ?? null, visibilidade }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'falha ao enviar');
    // Atualiza state local imediatamente (evita desaparecer do filtro)
    const convLocal = _atdState.conversas.find(c => c.id === conversaId);
    if (convLocal && visibilidade === 'publica') {
      convLocal.ultima_mensagem = { texto, origem: 'atendente' };
      if (user?.id) convLocal.atendente_id = user.id;
    }
    _atdRenderLista();
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

function _atdToggleStatusMenu(conversaId) {
  const menu = document.getElementById('atdStatusMenu');
  if (!menu) return;
  const visible = menu.style.display !== 'none';
  menu.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const fechar = (e) => { if (!menu.contains(e.target)) { menu.style.display = 'none'; document.removeEventListener('click', fechar); } };
    setTimeout(() => document.addEventListener('click', fechar), 0);
  }
}

async function _atdMudarStatus(conversaId, novoStatus) {
  const menu = document.getElementById('atdStatusMenu');
  if (menu) menu.style.display = 'none';
  const sb = _atdGetSbClient();
  const { error } = await sb.from('atd_conversas').update({ status: novoStatus }).eq('id', conversaId);
  if (error) { toast('Erro ao mudar status', 'err'); return; }
  const conv = _atdState.conversas.find(c => c.id === conversaId);
  if (conv) conv.status = novoStatus;
  const LABELS = { aberta: 'Nova', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando cliente' };
  toast(`Status: ${LABELS[novoStatus] || novoStatus}`, 'ok');
  _atdRenderLista();
  if (conv) _atdRenderChat(conv);
}

// ══════════════════════════════════════════════════════════════
// UPLOAD DE ARQUIVO
// ══════════════════════════════════════════════════════════════

async function _atdUploadArquivo(conversaId, input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';

  const user = getCurrentUser();
  const sb = _atdGetSbClient();

  // Detecta tipo
  let tipo = 'documento';
  if (file.type.startsWith('image/')) tipo = 'imagem';
  else if (file.type.startsWith('audio/')) tipo = 'audio';
  else if (file.type.startsWith('video/')) tipo = 'video';

  // Feedback visual
  toast(`Enviando ${file.name}…`, 'info');

  // Upload para Supabase Storage
  const ext = file.name.split('.').pop();
  const path = `conversas/${conversaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await sb.storage.from('atd-midias').upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) { toast('Erro no upload: ' + upErr.message, 'err'); return; }

  // URL pública assinada (1 semana)
  const { data: signedData } = await sb.storage.from('atd-midias').createSignedUrl(path, 604800);
  const url = signedData?.signedUrl;
  if (!url) { toast('Erro ao gerar URL do arquivo', 'err'); return; }

  // Envia via edge function
  const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/enviar-mensagem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
    body: JSON.stringify({ conversa_id: conversaId, tipo, url, nome_arquivo: file.name, atendente_id: user?.id ?? null, visibilidade: 'publica' }),
  });
  const json = await res.json();
  if (!res.ok) { toast('Erro ao enviar arquivo: ' + (json.error || ''), 'err'); return; }

  toast(`${tipo === 'imagem' ? 'Imagem' : tipo === 'audio' ? 'Áudio' : tipo === 'video' ? 'Vídeo' : 'Arquivo'} enviado!`, 'ok');
  await _atdAbrirConversa(conversaId);
}

// ══════════════════════════════════════════════════════════════
// TRANSFERÊNCIA ENTRE ATENDENTES
// ══════════════════════════════════════════════════════════════

async function _atdAbrirTransferencia(conversaId) {
  const sb = _atdGetSbClient();
  const user = getCurrentUser();

  // Busca atendentes disponíveis (profiles com role gerente/atendente)
  const { data: perfis } = await sb
    .from('profiles')
    .select('id, nome, role')
    .in('role', ['gerente', 'atendente', 'supervisor'])
    .order('nome');

  const lista = (perfis || []).filter(p => p.id !== user?.id);

  // Cria modal
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'atdModalTransferencia';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;width:90%">
      <div class="mbox">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-weight:700;font-size:var(--text-base)">${lc('users', 16, 'var(--purple)')} Transferir conversa</div>
          <button class="btn btn-ghost" onclick="document.getElementById('atdModalTransferencia').remove()">${lc('x', 16, 'var(--fg-muted)')}</button>
        </div>
        ${lista.length === 0
          ? `<div style="color:var(--fg-subtle);font-size:var(--text-sm);text-align:center;padding:24px 0">Nenhum outro atendente disponível.</div>`
          : `<div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto">
              ${lista.map(p => `
                <button onclick="_atdConfirmarTransferencia('${conversaId}','${p.id}','${(p.nome || '').replace(/'/g, "\\'")}')"
                  style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r8);background:var(--surface);cursor:pointer;text-align:left;width:100%">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--purple-xlight);color:var(--purple);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:var(--text-sm)">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                  <div>
                    <div style="font-weight:600;font-size:var(--text-sm);color:var(--text)">${p.nome || 'Sem nome'}</div>
                    <div style="font-size:var(--text-xs);color:var(--fg-subtle);text-transform:capitalize">${p.role || ''}</div>
                  </div>
                </button>`).join('')}
            </div>`}
      </div>
    </div>`;

  document.body.appendChild(overlay);
}

async function _atdConfirmarTransferencia(conversaId, atendenteId, atendenteNome) {
  document.getElementById('atdModalTransferencia')?.remove();
  const sb = _atdGetSbClient();
  const user = getCurrentUser();

  const { error } = await sb.from('atd_conversas')
    .update({ atendente_id: atendenteId, status: 'em_atendimento' })
    .eq('id', conversaId);

  if (error) { toast('Erro ao transferir', 'err'); return; }

  // Nota interna registrando a transferência
  await sb.from('atd_mensagens').insert({
    conversa_id:  conversaId,
    origem:       'atendente',
    atendente_id: user?.id ?? null,
    visibilidade: 'interna',
    tipo:         'texto',
    conteudo:     { texto: `🔄 Conversa transferida para ${atendenteNome}.` },
  });

  toast(`Transferido para ${atendenteNome}`, 'ok');
  _atdState.conversaAtivaId = null;
  document.getElementById('atdChatVazio').style.display = 'flex';
  document.getElementById('atdChatAtivo').style.display  = 'none';
  const painel = document.getElementById('atdPainelContato');
  if (painel) painel.style.display = 'none';
  await _atdCarregarConversas();
}

// ══════════════════════════════════════════════════════════════
// REALTIME — atualiza lista/chat sem precisar recarregar
// ══════════════════════════════════════════════════════════════

function _atdAssinarRealtime() {
  const sb = _atdGetSbClient();
  if (_atdState.realtimeChannel) sb.removeChannel(_atdState.realtimeChannel);

  _atdState.realtimeChannel = sb.channel('atd-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atd_mensagens' }, payload => {
      const msg = payload.new;
      const convId = msg?.conversa_id;

      // Incrementa badge + som + título da aba
      if (msg?.origem === 'cliente' && convId && convId !== _atdState.conversaAtivaId) {
        const conv = _atdState.conversas.find(c => c.id === convId);
        if (conv) {
          conv.mensagens_nao_lidas = (conv.mensagens_nao_lidas || 0) + 1;
          if (msg.conteudo?.texto) conv.ultima_mensagem = { texto: msg.conteudo.texto, origem: 'cliente' };
          _atdRenderLista();
          _atdTocarSom();
          const totalNaoLidas = _atdState.conversas.reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
          if (totalNaoLidas > 0) document.title = `(${totalNaoLidas}) VTP Atendimento`;
        }
      }

      // Se a conversa está aberta, recarrega o chat
      if (convId === _atdState.conversaAtivaId) {
        _atdAbrirConversa(_atdState.conversaAtivaId);
      }

      // Recarrega lista completa para pegar novas conversas que ainda não estão no estado
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

// ══════════════════════════════════════════════════════════════
// INTEGRAÇÕES DE CANAIS
// ══════════════════════════════════════════════════════════════

function _atdIconeCanal(tipo, size = 20) {
  const s = size;
  const r = Math.round(s * 0.22);
  return `<img src="/assets/icons/${tipo}.png" width="${s}" height="${s}" style="border-radius:${r}px;display:block;object-fit:cover" alt="${tipo}" onerror="this.style.display='none'">`;
}

const ATD_CANAIS_DEFINICAO = [
  { tipo: 'whatsapp', nome: 'WhatsApp', cor: '#25D366', disponivel: true },
  { tipo: 'instagram', nome: 'Instagram', cor: '#E1306C', disponivel: true },
  { tipo: 'ifood', nome: 'iFood', cor: '#EA1D2C', disponivel: false },
  { tipo: '99food', nome: '99Food', cor: '#FFC700', disponivel: false },
  { tipo: 'google', nome: 'Google Meu Negócio', cor: '#4285F4', disponivel: false },
];

function _atdRenderRespostas() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div class="card" style="max-width:760px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc('zap', 18, 'var(--purple)')}
        <h2 style="font-size:var(--text-base);font-weight:800;color:var(--text);margin:0">Respostas</h2>
      </div>
      <p style="font-size:var(--text-sm);color:var(--fg-muted);margin:0 0 20px">
        Configure respostas rápidas e o tom de voz da IA para o atendimento.
      </p>
      <div style="display:flex;gap:6px;margin-bottom:20px">
        <button class="atd-canal-tab active" data-resp="padrao" onclick="_atdRespostasAba('padrao')">Padrão (/)</button>
        <button class="atd-canal-tab" data-resp="ia" onclick="_atdRespostasAba('ia')">IA — Tom de voz</button>
      </div>
      <div id="atdRespostasConteudo"></div>
    </div>`;
  _atdRespostasAba('padrao');
}

function _atdRespostasAba(aba) {
  document.querySelectorAll('[data-resp]').forEach(b => b.classList.toggle('active', b.dataset.resp === aba));
  const el = document.getElementById('atdRespostasConteudo');
  if (aba === 'padrao') {
    _atdRespostasPadraoRender();
  } else {
    _atdIARender();
  }
}

// ══════════════════════════════════════════════════════════════
// RESPOSTAS / IA — base de conhecimento + preview
// ══════════════════════════════════════════════════════════════

const _ATD_IA_SECOES = [
  { id: 'tom_voz',          icon: 'message-circle', label: 'Tom de voz',         desc: 'Personalidade, estilo e regras de linguagem da marca.' },
  { id: 'gestao_crise',     icon: 'alert-triangle', label: 'Gestão de crise',    desc: 'Protocolos para atrasos, reclamações e situações críticas.' },
  { id: 'compensacoes',     icon: 'gift',           label: 'Compensações',       desc: 'Cupons, reenvios e o que pode ser ofertado sem escalar.' },
  { id: 'slas',             icon: 'clock',          label: 'SLAs',               desc: 'Tempos de resposta prometidos e limites de espera.' },
  { id: 'info_loja',        icon: 'map-pin',        label: 'Info da loja',       desc: 'Horários, endereço, área de entrega, redes sociais.' },
  { id: 'politicas_gerais', icon: 'file-text',      label: 'Políticas gerais',   desc: 'Regras de cancelamento, troca, pagamento e outros.' },
];

async function _atdIARender() {
  const el = document.getElementById('atdRespostasConteudo');
  el.innerHTML = `<div style="color:var(--fg-subtle);font-size:var(--text-sm);padding:16px 0">Carregando...</div>`;

  const sb = _atdGetSbClient();
  const { data, error } = await sb.from('atd_base_conhecimento').select('*').eq('ativo', true);
  if (error) { el.innerHTML = `<div style="color:var(--danger)">Erro ao carregar base de conhecimento.</div>`; return; }

  const porSecao = {};
  (data || []).forEach(r => { porSecao[r.secao] = r; });

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;min-height:400px">
      <!-- sidebar de seções -->
      <div style="display:flex;flex-direction:column;gap:4px">
        ${_ATD_IA_SECOES.map((s, i) => `
          <button class="atd-ia-sec-btn${i === 0 ? ' active' : ''}" data-sec="${s.id}"
            onclick="_atdIASecaoClick('${s.id}')"
            style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;border-radius:var(--r6);cursor:pointer;text-align:left;font-size:var(--text-xs);font-weight:600;background:${i === 0 ? 'var(--purple-xlight)' : 'transparent'};color:${i === 0 ? 'var(--purple)' : 'var(--text)'}">
            ${lc(s.icon, 13, 'currentColor')} ${s.label}
          </button>`).join('')}
        <div style="border-top:1px solid var(--border);margin:8px 0"></div>
        <div style="padding:8px 10px;font-size:var(--text-xs);color:var(--fg-subtle);line-height:1.5">
          ${lc('zap', 11, 'var(--purple)')} A IA usa todas as seções ativas para gerar respostas no chat.
        </div>
      </div>
      <!-- editor -->
      <div id="atdIAEditor"></div>
    </div>`;

  _atdIASecaoRender(_ATD_IA_SECOES[0].id, porSecao);
}

function _atdIASecaoClick(secId) {
  document.querySelectorAll('.atd-ia-sec-btn').forEach(b => {
    const active = b.dataset.sec === secId;
    b.style.background = active ? 'var(--purple-xlight)' : 'transparent';
    b.style.color = active ? 'var(--purple)' : 'var(--text)';
  });
  // Busca dados atuais do DOM (o editor já tem o state)
  const sb = _atdGetSbClient();
  sb.from('atd_base_conhecimento').select('*').eq('ativo', true).then(({ data }) => {
    const porSecao = {};
    (data || []).forEach(r => { porSecao[r.secao] = r; });
    _atdIASecaoRender(secId, porSecao);
  });
}

function _atdIASecaoRender(secId, porSecao) {
  const secInfo = _ATD_IA_SECOES.find(s => s.id === secId);
  const reg = porSecao[secId];
  const el = document.getElementById('atdIAEditor');
  if (!el) return;

  el.innerHTML = `
    <div>
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          ${lc(secInfo.icon, 16, 'var(--purple)')}
          <span style="font-weight:700;font-size:var(--text-base);color:var(--text)">${secInfo.label}</span>
          ${reg ? `<span style="font-size:10px;color:var(--green);background:var(--success-bg);padding:1px 6px;border-radius:4px">Configurado</span>` : `<span style="font-size:10px;color:var(--fg-subtle);background:var(--bg-subtle);padding:1px 6px;border-radius:4px">Vazio</span>`}
        </div>
        <div style="font-size:var(--text-xs);color:var(--fg-muted)">${secInfo.desc}</div>
      </div>
      <div class="field" style="margin-bottom:8px">
        <label style="font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:block;margin-bottom:4px">CONTEÚDO</label>
        <textarea id="atdIAConteudo" class="inp" rows="10" placeholder="Descreva as regras, tom e informações para esta seção..."
          style="font-family:monospace;font-size:var(--text-xs);line-height:1.6;resize:vertical">${reg?.conteudo || ''}</textarea>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="_atdIAPreview('${secId}')">
          ${lc('play', 12, 'var(--purple)')} Testar IA
        </button>
        <button class="btn btn-primary btn-sm" onclick="_atdIASalvar('${secId}','${reg?.id || ''}')">
          ${lc('save', 12, '#fff')} Salvar seção
        </button>
      </div>
      <div id="atdIAPreviewBox" style="display:none;margin-top:16px;border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
        <div style="padding:8px 12px;background:var(--bg-subtle);border-bottom:1px solid var(--border);font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:flex;align-items:center;gap:6px">
          ${lc('zap', 11, 'var(--purple)')} Preview da IA
        </div>
        <div style="padding:12px;display:flex;gap:8px;align-items:flex-end">
          <input id="atdIAMsgTeste" class="inp" style="flex:1;font-size:var(--text-xs)" placeholder="Minha pizza chegou fria..."
            onkeydown="if(event.key==='Enter'){_atdIATestar('${secId}')}">
          <button class="btn btn-primary btn-sm" onclick="_atdIATestar('${secId}')">
            ${lc('send', 12, '#fff')}
          </button>
        </div>
        <div id="atdIARespostaBox" style="display:none;padding:12px;border-top:1px solid var(--border)">
          <div style="font-size:var(--text-xs);color:var(--fg-muted);margin-bottom:6px">Resposta gerada:</div>
          <div id="atdIAResposta" style="font-size:var(--text-sm);color:var(--text);line-height:1.6;white-space:pre-wrap;background:var(--success-bg);padding:10px 12px;border-radius:var(--r6)"></div>
          <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="document.getElementById('atdIARespostaBox').style.display='none'">
            Fechar
          </button>
        </div>
      </div>
    </div>`;
}

async function _atdIASalvar(secId, id) {
  const conteudo = document.getElementById('atdIAConteudo')?.value.trim();
  if (!conteudo) { toast('Conteúdo não pode estar vazio', 'err'); return; }

  const secInfo = _ATD_IA_SECOES.find(s => s.id === secId);
  const sb = _atdGetSbClient();
  let error;

  if (id) {
    ({ error } = await sb.from('atd_base_conhecimento').update({ conteudo, atualizado_em: new Date().toISOString() }).eq('id', id));
  } else {
    ({ error } = await sb.from('atd_base_conhecimento').insert({ secao: secId, titulo: secInfo.label, conteudo }));
  }

  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }
  toast(`${secInfo.label} salvo!`, 'ok');
  _atdIARender();
}

function _atdIAPreview(secId) {
  const box = document.getElementById('atdIAPreviewBox');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') document.getElementById('atdIAMsgTeste')?.focus();
}

async function _atdIATestar(secId) {
  const msg = document.getElementById('atdIAMsgTeste')?.value.trim();
  if (!msg) return;

  const conteudoAtual = document.getElementById('atdIAConteudo')?.value.trim() || '';
  const respostaBox = document.getElementById('atdIARespostaBox');
  const respostaEl = document.getElementById('atdIAResposta');

  respostaBox.style.display = 'block';
  respostaEl.textContent = 'Gerando resposta...';

  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/gerar-resposta-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ mensagem: msg, tom_voz: conteudoAtual, secao: secId }),
    });

    if (!res.ok) {
      // Fallback: usa a função principal se a preview não existir
      respostaEl.textContent = '(Salve a seção e teste via chat — o preview dedicado será adicionado em breve)';
      return;
    }

    const json = await res.json();
    respostaEl.textContent = json.resposta || 'Sem resposta gerada.';
  } catch {
    respostaEl.textContent = '(Salve a seção e teste via chat — o preview usa a função de produção)';
  }
}

async function _atdRespostasPadraoRender() {
  const el = document.getElementById('atdRespostasConteudo');
  el.innerHTML = `<div style="color:var(--fg-subtle);font-size:var(--text-sm);padding:16px 0">Carregando...</div>`;

  const sb = _atdGetSbClient();
  const { data, error } = await sb.from('atd_respostas_rapidas').select('*').order('atalho');
  if (error) { el.innerHTML = `<div style="color:var(--danger)">Erro ao carregar respostas.</div>`; return; }

  const lista = data || [];

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:var(--text-sm);color:var(--fg-muted)">${lista.length} resposta${lista.length !== 1 ? 's' : ''} cadastrada${lista.length !== 1 ? 's' : ''}</div>
      <button class="btn btn-primary btn-sm" onclick="_atdRespostaAbrirModal(null)">
        ${lc('plus', 14, '#fff')} Nova resposta
      </button>
    </div>

    ${lista.length === 0 ? `
      <div style="text-align:center;padding:40px 0;color:var(--fg-subtle)">
        ${lc('zap', 32, 'var(--fg-subtle)')}
        <div style="margin-top:8px;font-size:var(--text-sm)">Nenhuma resposta cadastrada ainda.</div>
        <div style="font-size:var(--text-xs);margin-top:4px">Crie respostas rápidas que os atendentes acionam com <code>/atalho</code> no chat.</div>
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${lista.map(r => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--r8);background:var(--surface)${r.ativo ? '' : ';opacity:.5'}">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <code style="font-size:var(--text-xs);font-weight:700;color:var(--purple);background:var(--purple-xlight);padding:2px 7px;border-radius:4px">/${r.atalho}</code>
                <span style="font-weight:600;font-size:var(--text-sm);color:var(--text)">${r.titulo}</span>
                ${!r.ativo ? `<span style="font-size:10px;color:var(--fg-subtle);background:var(--bg-subtle);padding:1px 6px;border-radius:4px">Inativo</span>` : ''}
                ${r.canal_tipo && r.canal_tipo !== 'todos' ? `<span style="font-size:10px;color:var(--fg-subtle);background:var(--bg-subtle);padding:1px 6px;border-radius:4px">${r.canal_tipo}</span>` : ''}
              </div>
              <div style="font-size:var(--text-xs);color:var(--fg-muted);white-space:pre-wrap;line-height:1.5">${r.conteudo}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0">
              <button class="btn btn-ghost" style="padding:4px 6px" title="Editar" onclick="_atdRespostaAbrirModal(${JSON.stringify(JSON.stringify(r))})">
                ${lc('edit-2', 14, 'var(--fg-muted)')}
              </button>
              <button class="btn btn-ghost" style="padding:4px 6px" title="${r.ativo ? 'Desativar' : 'Ativar'}" onclick="_atdRespostaToggleAtivo('${r.id}', ${!r.ativo})">
                ${lc(r.ativo ? 'eye-off' : 'eye', 14, 'var(--fg-muted)')}
              </button>
              <button class="btn btn-ghost" style="padding:4px 6px" title="Excluir" onclick="_atdRespostaExcluir('${r.id}')">
                ${lc('trash-2', 14, 'var(--danger)')}
              </button>
            </div>
          </div>`).join('')}
      </div>`}`;
}

function _atdRespostaAbrirModal(jsonStr) {
  const r = jsonStr ? JSON.parse(jsonStr) : null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'atdModalResposta';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;width:90%">
      <div class="mbox">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div style="font-weight:700;font-size:var(--text-base)">${lc('zap', 16, 'var(--purple)')} ${r ? 'Editar resposta' : 'Nova resposta rápida'}</div>
          <button class="btn btn-ghost" onclick="document.getElementById('atdModalResposta').remove()">${lc('x', 16, 'var(--fg-muted)')}</button>
        </div>
        <div class="field" style="margin-bottom:12px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:block;margin-bottom:4px">ATALHO <span style="color:var(--fg-subtle);font-weight:400">(sem a barra — ex: horario)</span></label>
          <div style="display:flex;align-items:center;gap:0">
            <span style="padding:0 8px;height:36px;display:flex;align-items:center;background:var(--bg-subtle);border:1px solid var(--border);border-right:none;border-radius:var(--r6) 0 0 var(--r6);font-size:var(--text-sm);color:var(--fg-muted);font-weight:700">/</span>
            <input id="rrAtalho" class="inp" style="border-radius:0 var(--r6) var(--r6) 0;flex:1" placeholder="horario" value="${r?.atalho || ''}" oninput="this.value=this.value.replace(/[^a-z0-9_]/g,'')">
          </div>
        </div>
        <div class="field" style="margin-bottom:12px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:block;margin-bottom:4px">TÍTULO <span style="color:var(--fg-subtle);font-weight:400">(aparece no dropdown)</span></label>
          <input id="rrTitulo" class="inp" placeholder="Horário de funcionamento" value="${r?.titulo || ''}">
        </div>
        <div class="field" style="margin-bottom:12px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:block;margin-bottom:4px">CONTEÚDO DA RESPOSTA</label>
          <textarea id="rrConteudo" class="inp" rows="4" placeholder="Olá! Nosso horário de atendimento é...">${r?.conteudo || ''}</textarea>
        </div>
        <div class="field" style="margin-bottom:20px">
          <label style="font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:block;margin-bottom:4px">CANAL</label>
          <select id="rrCanal" class="inp">
            <option value="todos" ${(!r?.canal_tipo || r.canal_tipo === 'todos') ? 'selected' : ''}>Todos os canais</option>
            <option value="whatsapp" ${r?.canal_tipo === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
            <option value="instagram" ${r?.canal_tipo === 'instagram' ? 'selected' : ''}>Instagram</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="document.getElementById('atdModalResposta').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="_atdRespostaSalvar('${r?.id || ''}')">
            ${lc('save', 14, '#fff')} Salvar
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('rrAtalho').focus();
}

async function _atdRespostaSalvar(id) {
  const atalho   = document.getElementById('rrAtalho')?.value.trim();
  const titulo   = document.getElementById('rrTitulo')?.value.trim();
  const conteudo = document.getElementById('rrConteudo')?.value.trim();
  const canal    = document.getElementById('rrCanal')?.value || 'todos';

  if (!atalho || !titulo || !conteudo) { toast('Preencha atalho, título e conteúdo', 'err'); return; }

  const sb = _atdGetSbClient();
  let error;

  if (id) {
    ({ error } = await sb.from('atd_respostas_rapidas').update({ atalho, titulo, conteudo, canal_tipo: canal }).eq('id', id));
  } else {
    ({ error } = await sb.from('atd_respostas_rapidas').insert({ atalho, titulo, conteudo, canal_tipo: canal }));
  }

  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }

  document.getElementById('atdModalResposta')?.remove();
  toast(id ? 'Resposta atualizada!' : 'Resposta criada!', 'ok');

  // Recarrega cache de respostas rápidas
  const { data } = await sb.from('atd_respostas_rapidas').select('*').eq('ativo', true).order('atalho');
  _atdState.respostasRapidas = data || [];

  _atdRespostasPadraoRender();
}

async function _atdRespostaToggleAtivo(id, ativo) {
  const sb = _atdGetSbClient();
  const { error } = await sb.from('atd_respostas_rapidas').update({ ativo }).eq('id', id);
  if (error) { toast('Erro ao atualizar', 'err'); return; }
  const { data } = await sb.from('atd_respostas_rapidas').select('*').eq('ativo', true).order('atalho');
  _atdState.respostasRapidas = data || [];
  _atdRespostasPadraoRender();
}

async function _atdRespostaExcluir(id) {
  if (!confirm('Excluir esta resposta rápida?')) return;
  const sb = _atdGetSbClient();
  const { error } = await sb.from('atd_respostas_rapidas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir', 'err'); return; }
  toast('Resposta excluída', 'ok');
  const { data } = await sb.from('atd_respostas_rapidas').select('*').eq('ativo', true).order('atalho');
  _atdState.respostasRapidas = data || [];
  _atdRespostasPadraoRender();
}

function _atdRenderEstatisticas() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div style="max-width:900px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        ${lc('bar-chart-2', 18, 'var(--purple)')}
        <h2 style="font-size:var(--text-base);font-weight:800;color:var(--text);margin:0">Estatísticas</h2>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:20px">
        <button class="atd-canal-tab active" data-est="reputacao" onclick="_atdEstatAba('reputacao')">Reputação</button>
        <button class="atd-canal-tab" data-est="sentimento" onclick="_atdEstatAba('sentimento')">Sentimento</button>
        <button class="atd-canal-tab" data-est="performance" onclick="_atdEstatAba('performance')">Performance</button>
      </div>
      <div id="atdEstatConteudo"></div>
    </div>`;
  _atdEstatAba('reputacao');
}

function _atdEstatAba(aba) {
  document.querySelectorAll('[data-est]').forEach(b => b.classList.toggle('active', b.dataset.est === aba));
  const el = document.getElementById('atdEstatConteudo');
  const skeletons = {
    reputacao:   [lc('star', 36, 'var(--fg-subtle)'),   'Reputação',   'Avaliações em tempo real do Google, iFood e 99Food com alertas de novas avaliações negativas.'],
    sentimento:  [lc('tag', 36, 'var(--fg-subtle)'),    'Sentimento',  'Tags mais usadas na análise semântica das conversas, com tendência e exemplos representativos.'],
    performance: [lc('award', 36, 'var(--fg-subtle)'),  'Performance', 'Tempo de primeira resposta, agilidade, nota de qualidade por IA (0–100) e score geral por atendente.'],
  };
  const [icon, titulo, descricao] = skeletons[aba];
  el.innerHTML = `<div class="atd-skeleton-page">${icon}<h3>${titulo}</h3><p>${descricao} Em construção.</p></div>`;
}

function _atdRenderConfiguracoes() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div style="max-width:760px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        ${lc('settings', 18, 'var(--purple)')}
        <h2 style="font-size:var(--text-base);font-weight:800;color:var(--text);margin:0">Configurações</h2>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:20px">
        <button class="atd-canal-tab active" data-cfg="tags" onclick="_atdCfgAba('tags')">Tags</button>
        <button class="atd-canal-tab" data-cfg="geral" onclick="_atdCfgAba('geral')">Geral</button>
      </div>
      <div id="atdCfgConteudo"></div>
    </div>`;
  _atdCfgAba('tags');
}

function _atdCfgAba(aba) {
  document.querySelectorAll('[data-cfg]').forEach(b => b.classList.toggle('active', b.dataset.cfg === aba));
  const el = document.getElementById('atdCfgConteudo');
  if (aba === 'tags') {
    el.innerHTML = `<div class="atd-skeleton-page">${lc('tag', 36, 'var(--fg-subtle)')}<h3>Tags</h3><p>Cadastro de tags e regras de auto-tag por IA ao encerrar conversas. Em construção.</p></div>`;
  } else {
    el.innerHTML = `<div class="atd-skeleton-page">${lc('sliders', 36, 'var(--fg-subtle)')}<h3>Configurações Gerais</h3><p>Horário de atendimento, tempo de inatividade para encerramento automático e nome do assistente. Em construção.</p></div>`;
  }
}

async function _atdRenderIntegracoes() {
  const wrap = document.getElementById('page-omnichannel');
  wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--fg-subtle)">Carregando...</div>`;

  const sb = _atdGetSbClient();
  const { data: canais } = await sb.from('atd_canais').select('*');
  _atdState.canais = canais || [];

  const cards = ATD_CANAIS_DEFINICAO.map((def) => {
    const registro = _atdState.canais.find((c) => c.tipo === def.tipo);
    const conectado = !!registro?.ativo;

    let statusHtml, acaoHtml, detalheHtml = '';

    if (!def.disponivel) {
      statusHtml = `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--fg-subtle);background:var(--bg-subtle);padding:2px 8px;border-radius:999px">Em breve</span>`;
      acaoHtml = `<button class="btn btn-ghost" disabled style="opacity:.5;cursor:not-allowed;font-size:var(--text-xs)">Indisponível</button>`;
    } else if (conectado) {
      statusHtml = `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--green);background:var(--success-bg);padding:2px 8px;border-radius:999px">${lc('check', 10, 'currentColor')} Conectado</span>`;
      if (def.tipo === 'whatsapp') {
        acaoHtml = `<button class="btn btn-ghost" style="font-size:var(--text-xs)" onclick="_atdAbrirQRWhatsApp()">Reconectar / Trocar número</button>`;
      } else {
        acaoHtml = `<button class="btn btn-ghost" style="font-size:var(--text-xs)" onclick="_atdAbrirDetalheCanal('${def.tipo}')">Gerenciar</button>`;
      }
    } else {
      statusHtml = `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--fg-subtle);background:var(--bg-subtle);padding:2px 8px;border-radius:999px">Não conectado</span>`;
      if (def.tipo === 'whatsapp') {
        acaoHtml = `<button class="btn btn-primary" style="font-size:var(--text-xs)" onclick="_atdAbrirQRWhatsApp()">${lc('smartphone', 13, '#fff')} Conectar via QR Code</button>`;
      } else if (def.tipo === 'instagram') {
        acaoHtml = `<button class="btn btn-primary" style="font-size:var(--text-xs)" onclick="_atdAbrirGuiaInstagram()">${lc('link', 13, '#fff')} Conectar</button>`;
      } else {
        acaoHtml = `<button class="btn btn-primary" style="font-size:var(--text-xs)" disabled>Conectar</button>`;
      }
    }

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r12);padding:16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="width:38px;height:38px;border-radius:var(--r8);background:${def.cor}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${_atdIconeCanal(def.tipo, 22)}
          </span>
          <div style="flex:1">
            <div style="font-weight:700;color:var(--text);font-size:var(--text-sm)">${def.nome}</div>
            ${statusHtml}
          </div>
        </div>
        ${detalheHtml}
        <div style="display:flex;justify-content:flex-end">${acaoHtml}</div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="margin-bottom:14px;color:var(--fg-muted);font-size:var(--text-sm)">
      Conecte os canais de atendimento. Mensagens de qualquer canal conectado aparecem juntas no Inbox.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:14px">
      ${cards}
    </div>
  `;
}

function _atdAbrirDetalheCanal(tipo) {
  if (tipo === 'instagram') _atdAbrirGuiaInstagram();
}

async function _atdAbrirQRWhatsApp() {
  const modal = document.createElement('div');
  modal.id = 'popupAtdQRWhatsApp';
  modal.style = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:var(--r16);width:100%;max-width:420px;padding:28px;text-align:center">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-weight:800;font-size:var(--text-lg);color:var(--text);display:flex;align-items:center;gap:8px">
          ${_atdIconeCanal('whatsapp', 20)} Conectar WhatsApp
        </div>
        <button class="btn btn-ghost" onclick="_atdFecharQRWhatsApp()">${lc('x', 16, 'currentColor')}</button>
      </div>
      <div id="atdQRStatus" style="color:var(--fg-muted);font-size:var(--text-sm);margin-bottom:16px">Verificando conexão...</div>
      <div id="atdQRImagem" style="min-height:200px;display:flex;align-items:center;justify-content:center"></div>
      <div id="atdQRAcoes" style="margin-top:20px;display:flex;flex-direction:column;gap:8px"></div>
    </div>`;
  document.body.appendChild(modal);
  await _atdQRVerificarStatus();
}

function _atdFecharQRWhatsApp() {
  clearInterval(window._atdQRPollInterval);
  document.getElementById('popupAtdQRWhatsApp')?.remove();
}

async function _atdQRVerificarStatus() {
  const BASE = typeof VTP_SUPABASE_URL !== 'undefined'
    ? VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1')
    : '';
  const statusDiv = document.getElementById('atdQRStatus');
  const imagemDiv = document.getElementById('atdQRImagem');
  const acoesDiv  = document.getElementById('atdQRAcoes');
  if (!statusDiv) return;

  try {
    const r = await fetch(`${BASE}/wpp-connect?action=status`, { headers: { Authorization: `Bearer ${VTP_SUPABASE_KEY}` } });
    const { state } = await r.json();

    if (state === 'open') {
      statusDiv.innerHTML = `<span style="color:var(--green);font-weight:700">${lc('check-circle', 16, 'var(--green)')} WhatsApp conectado!</span>`;
      imagemDiv.innerHTML = `<div style="font-size:48px">✅</div>`;
      acoesDiv.innerHTML = `
        <button class="btn btn-ghost" style="color:var(--danger);font-size:var(--text-xs)" onclick="_atdQRDesconectar()">
          ${lc('log-out', 13, 'currentColor')} Desconectar / Trocar número
        </button>
        <button class="btn btn-primary" onclick="_atdFecharQRWhatsApp()">Fechar</button>`;
      clearInterval(window._atdQRPollInterval);
    } else {
      statusDiv.textContent = 'Escaneie o QR Code com o WhatsApp do número que deseja conectar:';
      await _atdQRCarregar();
      clearInterval(window._atdQRPollInterval);
      window._atdQRPollInterval = setInterval(async () => {
        const r2 = await fetch(`${BASE}/wpp-connect?action=status`, { headers: { Authorization: `Bearer ${VTP_SUPABASE_KEY}` } });
        const { state: s2 } = await r2.json();
        if (s2 === 'open') {
          clearInterval(window._atdQRPollInterval);
          await _atdQRVerificarStatus();
          await _atdRenderIntegracoes();
        }
      }, 4000);
    }
  } catch (e) {
    statusDiv.textContent = 'Erro ao verificar conexão. Tente novamente.';
  }
}

async function _atdQRCarregar() {
  const BASE = typeof VTP_SUPABASE_URL !== 'undefined'
    ? VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1')
    : '';
  const imagemDiv = document.getElementById('atdQRImagem');
  const acoesDiv  = document.getElementById('atdQRAcoes');
  if (!imagemDiv) return;

  imagemDiv.innerHTML = `<div style="color:var(--fg-subtle);font-size:var(--text-sm)">Gerando QR Code...</div>`;
  try {
    const r = await fetch(`${BASE}/wpp-connect?action=qr`, { headers: { Authorization: `Bearer ${VTP_SUPABASE_KEY}` } });
    const { base64 } = await r.json();
    if (base64) {
      imagemDiv.innerHTML = `<img src="${base64}" style="width:220px;height:220px;border-radius:var(--r8);border:4px solid var(--border)" alt="QR Code WhatsApp">`;
      acoesDiv.innerHTML = `<button class="btn btn-ghost" style="font-size:var(--text-xs)" onclick="_atdQRCarregar()">${lc('refresh-cw', 13, 'currentColor')} Atualizar QR</button>`;
    } else {
      imagemDiv.innerHTML = `<div style="color:var(--fg-subtle);font-size:var(--text-sm)">Não foi possível gerar o QR Code. A instância pode já estar conectada.</div>`;
    }
  } catch {
    imagemDiv.innerHTML = `<div style="color:var(--danger);font-size:var(--text-sm)">Erro ao gerar QR Code.</div>`;
  }
}

async function _atdEncaminharLocalizacao(lat, lng) {
  const sb = _atdGetSbClient();
  const BASE = VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

  // Busca contatos com telefone cadastrado
  const { data: contatos } = await sb
    .from('atd_contatos')
    .select('id, nome, telefone')
    .not('telefone', 'is', null)
    .order('nome', { ascending: true })
    .limit(100);

  const modal = document.createElement('div');
  modal.id = 'popupEncaminharLoc';
  modal.style = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:var(--r16);width:100%;max-width:400px;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-weight:800;font-size:var(--text-base);display:flex;align-items:center;gap:8px">
          ${lc('send', 16, 'var(--purple)')} Encaminhar localização
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('popupEncaminharLoc').remove()">${lc('x',15,'currentColor')}</button>
      </div>

      <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-bottom:10px">Buscar na lista de contatos:</div>
      <input id="encLocBusca" class="inp" placeholder="Nome ou número..." oninput="_atdEncLocFiltrar()" autocomplete="off" style="margin-bottom:8px">
      <div id="encLocLista" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r8);margin-bottom:14px">
        ${(contatos || []).map(c => `
          <div class="enc-loc-item" data-tel="${c.telefone}" data-nome="${c.nome || c.telefone}"
               style="padding:9px 12px;cursor:pointer;font-size:var(--text-sm);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"
               onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"
               onclick="_atdEncLocSelecionar('${c.telefone}','${(c.nome || c.telefone).replace(/'/g,"\\'")}')">
            <span>${c.nome || c.telefone}</span>
            <span style="color:var(--fg-subtle);font-size:11px">${c.telefone}</span>
          </div>`).join('') || '<div style="padding:12px;color:var(--fg-subtle);font-size:var(--text-sm);text-align:center">Nenhum contato com telefone cadastrado</div>'}
      </div>

      <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-bottom:6px">Ou digite o número manualmente:</div>
      <input id="encLocNumero" class="inp" placeholder="Ex: 82999999999" type="tel" style="margin-bottom:14px" oninput="document.getElementById('encLocNomeSelecionado').value=''">
      <input id="encLocNomeSelecionado" type="hidden" value="">

      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="_atdEncLocEnviar(${lat},${lng})">
        ${lc('send', 13, '#fff')} Encaminhar
      </button>
      <div id="encLocStatus" style="margin-top:10px;font-size:var(--text-xs);text-align:center;color:var(--fg-subtle)"></div>
    </div>`;
  document.body.appendChild(modal);
}

function _atdEncLocFiltrar() {
  const q = document.getElementById('encLocBusca')?.value.toLowerCase() || '';
  document.querySelectorAll('.enc-loc-item').forEach(el => {
    const match = (el.dataset.nome + el.dataset.tel).toLowerCase().includes(q);
    el.style.display = match ? '' : 'none';
  });
}

function _atdEncLocSelecionar(tel, nome) {
  const input = document.getElementById('encLocNumero');
  if (input) { input.value = tel; input.focus(); }
  const nomeInput = document.getElementById('encLocNomeSelecionado');
  if (nomeInput) nomeInput.value = nome || tel;
}

async function _atdEncLocEnviar(lat, lng) {
  const numero = document.getElementById('encLocNumero')?.value.trim();
  const statusDiv = document.getElementById('encLocStatus');
  if (!numero) { if (statusDiv) statusDiv.textContent = 'Digite ou selecione um número.'; return; }

  const BASE = VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');
  if (statusDiv) statusDiv.textContent = 'Enviando...';

  try {
    const r = await fetch(`${BASE}/wpp-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ action: 'forward-location', number: numero, latitude: lat, longitude: lng }),
    });
    const d = await r.json();
    if (r.ok && d.ok !== false) {
      if (statusDiv) statusDiv.innerHTML = `<span style="color:var(--green)">✓ Localização enviada!</span>`;
      // Registra nota interna na conversa para o atendente saber que foi enviado
      const convId = _atdState.conversaAtivaId;
      if (convId) {
        const nomeLabel = document.getElementById('encLocNomeSelecionado')?.value?.trim() || numero;
        await fetch(`${BASE}/enviar-mensagem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
          body: JSON.stringify({
            conversa_id: convId,
            texto: `📍 Localização encaminhada para ${nomeLabel} (${numero})`,
            atendente_id: _atdState.user?.id ?? null,
            visibilidade: 'interna',
          }),
        });
      }
      setTimeout(() => document.getElementById('popupEncaminharLoc')?.remove(), 1500);
    } else {
      if (statusDiv) statusDiv.innerHTML = `<span style="color:var(--danger)">Erro: ${d.detalhe?.message || 'falha ao enviar'}</span>`;
    }
  } catch (e) {
    if (statusDiv) statusDiv.innerHTML = `<span style="color:var(--danger)">Erro de conexão.</span>`;
  }
}

async function _atdQRDesconectar() {
  const BASE = typeof VTP_SUPABASE_URL !== 'undefined'
    ? VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1')
    : '';
  const acoesDiv = document.getElementById('atdQRAcoes');
  if (acoesDiv) acoesDiv.innerHTML = `<div style="color:var(--fg-muted);font-size:var(--text-sm)">Desconectando...</div>`;
  await fetch(`${BASE}/wpp-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` }, body: JSON.stringify({ action: 'disconnect' }) });
  await _atdQRVerificarStatus();
}

function _atdAbrirGuiaInstagram() {
  const registro = _atdState.canais?.find((c) => c.tipo === 'instagram');
  const pageIdAtual = registro?.config?.page_id || '';
  const igIdAtual = registro?.config?.ig_business_account_id || '';

  const modal = document.createElement('div');
  modal.id = 'popupAtdGuiaInstagram';
  modal.style = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:var(--r16);max-width:560px;width:100%;max-height:85vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-weight:800;font-size:var(--text-lg);color:var(--text);display:flex;align-items:center;gap:8px">
          ${lc('camera', 18, '#E1306C')} Conectar Instagram
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('popupAtdGuiaInstagram').remove()">${lc('x', 16, 'currentColor')}</button>
      </div>

      <div style="font-size:var(--text-sm);color:var(--fg-muted);margin-bottom:16px">
        A integração usa a API oficial da Meta (Instagram Messaging API). Antes de configurar aqui, você precisa preparar o lado da Meta — isso só pode ser feito por você, com login na sua conta:
      </div>

      <ol style="font-size:var(--text-sm);color:var(--text);line-height:1.7;padding-left:20px;margin-bottom:18px">
        <li>Crie um app em <strong>developers.facebook.com</strong> (tipo "Business").</li>
        <li>No app, adicione o produto <strong>"Instagram"</strong> (Instagram API with Instagram Login ou via Página do Facebook).</li>
        <li>Vincule a <strong>Página do Facebook</strong> da pizzaria à conta <strong>Instagram Business/Creator</strong> (precisa estar como profissional, não pessoal).</li>
        <li>Gere um <strong>Page Access Token</strong> com as permissões <code>instagram_basic</code> e <code>instagram_manage_messages</code>.</li>
        <li>Anote o <strong>Page ID</strong> e o <strong>Instagram Business Account ID</strong> (aparecem no Graph API Explorer).</li>
      </ol>

      <div style="background:var(--warning-bg);border:1px dashed var(--warning-border);border-radius:var(--r8);padding:10px 12px;font-size:var(--text-xs);color:var(--text);margin-bottom:18px">
        ${lc('shield', 13, 'currentColor')} O Access Token e o App Secret são credenciais sensíveis — nunca cole eles no chat. Quando tiver em mãos, eu te passo o comando exato pra salvar como secret no Supabase (igual fizemos com a chave da Anthropic).
      </div>

      <div style="font-weight:700;font-size:var(--text-sm);color:var(--text);margin-bottom:8px">Quando tiver os IDs (não-sensíveis), preencha aqui:</div>
      <label style="font-size:var(--text-xs);color:var(--fg-muted)">Page ID (Facebook)</label>
      <input id="atdInstaPageId" class="inp" style="margin-bottom:10px" placeholder="Ex: 123456789012345" value="${pageIdAtual}">
      <label style="font-size:var(--text-xs);color:var(--fg-muted)">Instagram Business Account ID</label>
      <input id="atdInstaIgId" class="inp" style="margin-bottom:16px" placeholder="Ex: 178414..." value="${igIdAtual}">

      <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="_atdSalvarConfigInstagram()">
        ${lc('save', 14, '#fff')} Salvar e continuar
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function _atdSalvarConfigInstagram() {
  const pageId = document.getElementById('atdInstaPageId').value.trim();
  const igId = document.getElementById('atdInstaIgId').value.trim();
  if (!pageId || !igId) { toast('Preencha os dois campos', 'err'); return; }

  const sb = _atdGetSbClient();
  const registro = _atdState.canais?.find((c) => c.tipo === 'instagram');

  const payload = {
    tipo: 'instagram',
    nome: 'Instagram VTP',
    config: { page_id: pageId, ig_business_account_id: igId, status: 'aguardando_token' },
    ativo: false, // só fica true depois que o Access Token estiver configurado e o webhook validado
  };

  const { error } = registro
    ? await sb.from('atd_canais').update(payload).eq('id', registro.id)
    : await sb.from('atd_canais').insert(payload);

  if (error) { toast('Erro ao salvar configuração', 'err'); return; }

  document.getElementById('popupAtdGuiaInstagram')?.remove();
  toast('IDs salvos! Agora me avise quando tiver o Access Token pra eu te guiar no próximo passo.', 'ok');
  await _atdRenderIntegracoes();
}

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
  filtrosAvancados: {        // filtros persistentes da busca avançada
    canais: [],              // [] = todos | ['whatsapp'] | ['instagram'] | ambos
    de: '',
    ate: '',
    statusResposta: '',      // '' | 'nao_respondidas' | 'respondidas'
    avaliacao: 0,            // 0 = todas | 1..5 = estrelas mínimas
    ocultarEmojiStory: true, // F4: ocultar reações emoji de story por padrão
  },
  selecionadas: new Set(),   // F3: IDs de conversas selecionadas para ação em lote
  botGlobalAtivo: !!localStorage.getItem('atd_bot_global'), // F1: bot global persiste na sessão
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
      .atd-resp-tab {
        border:none; background:transparent; color:var(--fg-muted);
        font-size:var(--text-sm); font-weight:600; padding:7px 14px 9px; border-radius:0; cursor:pointer;
        display:inline-flex; align-items:center; gap:5px;
        border-bottom:2px solid transparent; margin-bottom:-1px; transition:color .15s,border-color .15s;
      }
      .atd-resp-tab:hover { color:var(--text); }
      .atd-resp-tab-active { color:var(--purple) !important; border-bottom-color:var(--purple) !important; }
      .atd-resp-tabs { border-bottom:1px solid var(--border); margin-bottom:20px; }
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
      /* F3: hover mostra checkbox, selected destaca item */
      .conv-item:hover .conv-cb-wrap { opacity:1 !important; }
      .conv-item:hover .conv-avatar-img { opacity:0 !important; pointer-events:none !important; }
      .conv-item:hover .conv-canal-badge { opacity:0 !important; }
      .conv-item.conv-selected { background:var(--purple-xlight) !important; }
      .conv-item.conv-selected .conv-canal-badge { opacity:0 !important; }
      /* Quando há seleção ativa, TODOS os checkboxes ficam visíveis */
      .atd-lista-selecionando .conv-cb-wrap { opacity:1 !important; }
      .atd-lista-selecionando .conv-avatar-img { opacity:0 !important; pointer-events:none !important; }
      .atd-lista-selecionando .conv-canal-badge { opacity:0 !important; }
      .msg-bubble { padding:9px 13px; border-radius:var(--r12); max-width:75%; word-break:break-word; font-size:var(--text-sm); line-height:1.5; }
      .msg-bubble.cliente { background:var(--surface2); align-self:flex-start; border-radius:2px var(--r12) var(--r12) var(--r12); }
      .msg-bubble.atendente { background:var(--purple); color:#fff; align-self:flex-end; border-radius:var(--r12) 2px var(--r12) var(--r12); }
      .msg-bubble.interna { background:var(--warning-bg); border:1px dashed var(--warning-border); align-self:stretch; font-size:var(--text-xs); }
      .chat-date-sep { align-self:center; background:var(--surface2); color:var(--fg-subtle); font-size:var(--text-xs); font-weight:600; padding:3px 10px; border-radius:var(--r12); margin:4px 0; pointer-events:none; user-select:none; }
      .atd-skeleton-page { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:340px; color:var(--fg-subtle); text-align:center; }
      .atd-skeleton-page h3 { font-size:var(--text-base); font-weight:700; color:var(--text); margin:0; }
      .atd-skeleton-page p { font-size:var(--text-sm); color:var(--fg-muted); margin:0; max-width:380px; line-height:1.6; }
      /* F2: animações de alerta humano — 3 níveis de urgência */
      @keyframes atd-pulse-yellow {
        0%,100% { box-shadow:0 0 0 0 rgba(245,168,0,.5); }
        50%      { box-shadow:0 0 0 7px rgba(245,168,0,0); }
      }
      @keyframes atd-pulse-red {
        0%,100% { box-shadow:0 0 0 0 rgba(220,38,38,.6); }
        50%      { box-shadow:0 0 0 9px rgba(220,38,38,0); }
      }
      @keyframes atd-shake {
        0%,100% { transform:translateX(0); }
        20%      { transform:translateX(-3px); }
        40%      { transform:translateX(3px); }
        60%      { transform:translateX(-3px); }
        80%      { transform:translateX(3px); }
      }
      .atd-alerta-1 { border-left:3px solid var(--yellow) !important; animation:atd-pulse-yellow 2s infinite; }
      .atd-alerta-2 { border-left:3px solid var(--red) !important; background:var(--red-light) !important; animation:atd-pulse-red 1s infinite; }
      .atd-alerta-3 { border-left:3px solid var(--red) !important; background:#fecaca !important; animation:atd-pulse-red .6s infinite, atd-shake 1.2s infinite; }
      /* F1: bot ativo — ícone ⚡ na lista */
      .atd-bot-badge { display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:700;color:var(--green);background:#dcfce7;padding:1px 5px;border-radius:999px;flex-shrink:0; }
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

          <!-- F1: Toggle Bot Global -->
          <div id="atdBotGlobalBar" onclick="_atdToggleBotGlobal()"
            style="cursor:pointer;border-radius:var(--r8);padding:8px 10px;margin-bottom:10px;display:flex;align-items:center;gap:8px;transition:background .2s;border:1.5px solid;
              ${_atdState.botGlobalAtivo
                ? 'background:#dcfce7;border-color:#86efac;'
                : 'background:var(--surface3);border-color:var(--border);'}">
            <div style="width:36px;height:20px;border-radius:999px;position:relative;flex-shrink:0;transition:background .2s;
              background:${_atdState.botGlobalAtivo ? 'var(--green)' : 'var(--border)'}">
              <div style="position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s;
                left:${_atdState.botGlobalAtivo ? '18px' : '2px'}"></div>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-xs);font-weight:800;color:${_atdState.botGlobalAtivo ? '#166534' : 'var(--text)'}">
                ${_atdState.botGlobalAtivo ? '⚡ Bot ativo — respondendo automaticamente' : '🤖 Modo automático (bot)'}
              </div>
              <div style="font-size:10px;color:${_atdState.botGlobalAtivo ? '#15803d' : 'var(--fg-subtle)'}">
                ${_atdState.botGlobalAtivo ? 'Você será alertado se precisar intervir' : 'Clique para ativar respostas automáticas'}
              </div>
            </div>
          </div>

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

        <!-- F3: Barra de seleção em massa (aparece quando há itens selecionados) -->
        <div id="atdBulkBar" style="display:none;padding:8px 12px;background:var(--purple);color:#fff;align-items:center;gap:8px;font-size:var(--text-xs)">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0">
            <input type="checkbox" id="atdCheckAll" onchange="_atdToggleSelecionarTodos(this.checked)"
              style="accent-color:#fff;width:15px;height:15px;cursor:pointer">
            <span id="atdBulkCount" style="font-weight:700"></span>
          </label>
          <div style="flex:1"></div>
          <button onclick="_atdConcluirSelecionadas()" class="btn btn-xs"
            style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);font-size:10px;padding:4px 10px;white-space:nowrap">
            ${lc('check-circle', 11, '#fff')} Concluir
          </button>
          <button onclick="_atdLimparSelecao()" style="background:none;border:none;cursor:pointer;padding:2px;color:rgba(255,255,255,.7)">
            ${lc('x', 14, 'currentColor')}
          </button>
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
  _atdIniciarTimerAlerta();
}

// Atualiza o nível visual do alerta F2 a cada 60s (nível muda com o tempo)
let _atdAlertaTimerId = null;
function _atdIniciarTimerAlerta() {
  if (_atdAlertaTimerId) clearInterval(_atdAlertaTimerId);
  _atdAlertaTimerId = setInterval(() => {
    const temAlerta = _atdState.conversas.some(c => c.precisa_humano);
    if (temAlerta) _atdRenderLista();
  }, 60000);
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
    .select('id, status, atendente_id, canal_tipo, pedido_data, atualizado_em, mensagens_nao_lidas, ultima_mensagem, ultima_msg_atendente_em, ultima_msg_cliente_em, concluida_em, bot_ativo, precisa_humano, humano_solicitado_em, atd_contatos(nome, telefone, instagram_id, avatar_url, ig_followers, ig_following, ig_posts)')
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
  if (document.getElementById('atdBuscaAvancadaOverlay')) {
    document.getElementById('atdBuscaAvancadaOverlay').remove();
    return;
  }
  const f = _atdState.filtrosAvancados;
  const chkWpp = f.canais.includes('whatsapp') ? 'checked' : '';
  const chkIg  = f.canais.includes('instagram') ? 'checked' : '';
  const selSt  = (v) => f.statusResposta === v ? 'selected' : '';
  const starHtml = (n) => [1,2,3,4,5].map(i =>
    `<span onclick="_atdFiltroEstrela(${n===i?0:i})" style="cursor:pointer;font-size:22px;color:${i<=(f.avaliacao||0)?'#F5A800':'var(--border)'}">★</span>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.id = 'atdBuscaAvancadaOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.25)';
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()" style="position:absolute;top:0;right:0;bottom:0;width:320px;background:var(--bg);border-left:1px solid var(--border);display:flex;flex-direction:column;box-shadow:-4px 0 20px rgba(0,0,0,.12)">
      <div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:800;font-size:var(--text-sm);display:flex;align-items:center;gap:8px">
          ${lc('sliders', 15, 'var(--purple)')} Filtrar conversas
        </div>
        <button onclick="document.getElementById('atdBuscaAvancadaOverlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--fg-muted)">
          ${lc('x', 16, 'currentColor')}
        </button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:18px">

        <!-- Canal -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Canal</div>
          <div style="display:flex;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
              <input type="checkbox" id="atdFiltroWpp" ${chkWpp} style="accent-color:#25D366">
              <span style="font-weight:600;color:#25D366">WhatsApp</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
              <input type="checkbox" id="atdFiltroIg" ${chkIg} style="accent-color:#E1306C">
              <span style="font-weight:600;color:#E1306C">Instagram</span>
            </label>
          </div>
        </div>

        <!-- Período -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Período</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="font-size:10px;color:var(--fg-muted);display:block;margin-bottom:3px">De</label>
              <input id="atdBuscaDataInicio" class="inp" type="date" value="${f.de}" style="font-size:var(--text-xs)">
            </div>
            <div>
              <label style="font-size:10px;color:var(--fg-muted);display:block;margin-bottom:3px">Até</label>
              <input id="atdBuscaDataFim" class="inp" type="date" value="${f.ate}" style="font-size:var(--text-xs)">
            </div>
          </div>
        </div>

        <!-- Status de resposta -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Status de resposta</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);cursor:pointer;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
              <input type="radio" name="atdStatusResp" value="" ${selSt('')} onchange="_atdState.filtrosAvancados.statusResposta=this.value" style="accent-color:var(--purple)">
              Todas as conversas
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);cursor:pointer;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
              <input type="radio" name="atdStatusResp" value="nao_respondidas" ${selSt('nao_respondidas')} onchange="_atdState.filtrosAvancados.statusResposta=this.value" style="accent-color:var(--purple)">
              <span>Não respondidas <span style="font-size:10px;color:var(--fg-subtle)">(cliente esperando equipe)</span></span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);cursor:pointer;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
              <input type="radio" name="atdStatusResp" value="respondidas" ${selSt('respondidas')} onchange="_atdState.filtrosAvancados.statusResposta=this.value" style="accent-color:var(--purple)">
              <span>Respondidas <span style="font-size:10px;color:var(--fg-subtle)">(equipe respondeu por último)</span></span>
            </label>
          </div>
        </div>

        <!-- Avaliação -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:6px">Avaliação mínima</div>
          <div style="display:flex;align-items:center;gap:4px">
            ${starHtml(f.avaliacao||0)}
            ${f.avaliacao ? `<span style="font-size:10px;color:var(--fg-subtle);margin-left:6px">${f.avaliacao}★ ou mais</span>` : '<span style="font-size:10px;color:var(--fg-subtle);margin-left:6px">Todas</span>'}
          </div>
          <div style="font-size:10px;color:var(--fg-subtle);margin-top:4px">Clique numa estrela para filtrar · clique novamente para remover</div>
        </div>

        <!-- F4: Toggle emoji stories -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Instagram</div>
          <label style="display:flex;align-items:center;gap:10px;font-size:var(--text-sm);cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r8)">
            <input type="checkbox" id="atdFiltroEmojiStory" ${_atdState.filtrosAvancados.ocultarEmojiStory !== false ? 'checked' : ''}
              onchange="_atdState.filtrosAvancados.ocultarEmojiStory=this.checked"
              style="accent-color:var(--purple);width:16px;height:16px;cursor:pointer">
            <div>
              <div style="font-weight:600">Ocultar reações de story (emojis)</div>
              <div style="font-size:10px;color:var(--fg-subtle);margin-top:1px">Esconde comentários com apenas emojis (ex: "🔥", "❤️")</div>
            </div>
          </label>
        </div>

        <!-- Busca por nome / pedido -->
        <div style="margin-bottom:18px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Nome ou telefone</div>
          <input id="atdBuscaNome" class="inp" type="text" placeholder="Camila Oliveira ou 11999..." style="font-size:var(--text-sm)">
        </div>
        <div style="margin-bottom:8px">
          <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Número do pedido</div>
          <input id="atdBuscaPedidoNum" class="inp" type="text" placeholder="Ex: 1042" style="font-size:var(--text-sm)">
        </div>

      </div>
      <div style="padding:14px 18px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1" onclick="_atdLimparFiltrosAvancados()">Limpar</button>
        <button class="btn btn-primary" style="flex:1" onclick="_atdExecutarBuscaAvancada()">
          ${lc('search', 13, '#fff')} Aplicar
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function _atdFiltroEstrela(n) {
  _atdState.filtrosAvancados.avaliacao = n;
  // Re-render apenas as estrelas no drawer aberto
  const drawer = document.getElementById('atdBuscaAvancadaOverlay');
  if (drawer) { _atdAbrirBuscaAvancada(); _atdAbrirBuscaAvancada(); } // fecha e reabre para atualizar
}

function _atdLimparFiltrosAvancados() {
  _atdState.filtrosAvancados = { canais: [], de: '', ate: '', statusResposta: '', avaliacao: 0, ocultarEmojiStory: true };
  document.getElementById('atdBuscaAvancadaOverlay')?.remove();
  _atdState.viewMode = 'ativos';
  _atdCarregarConversas();
  _atdAtualizarBotaoFiltro();
}

function _atdAtualizarBotaoFiltro() {
  const btn = document.getElementById('atdBuscaAvancadaBtn');
  if (!btn) return;
  const f = _atdState.filtrosAvancados;
  const count = (f.canais.length > 0 ? 1 : 0) + (f.de || f.ate ? 1 : 0) + (f.statusResposta ? 1 : 0) + (f.avaliacao > 0 ? 1 : 0);
  if (count > 0) {
    btn.style.color = 'var(--purple)';
    btn.title = `${count} filtro(s) ativo(s)`;
    btn.innerHTML = lc('sliders', 13, 'var(--purple)') + `<span style="background:var(--purple);color:#fff;font-size:9px;border-radius:999px;padding:0 4px;min-width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;margin-left:2px">${count}</span>`;
  } else {
    btn.style.color = '';
    btn.title = 'Busca avançada';
    btn.innerHTML = lc('sliders', 13, 'var(--fg-subtle)');
  }
}

async function _atdExecutarBuscaAvancada() {
  const nome   = document.getElementById('atdBuscaNome')?.value.trim() || '';
  const di     = document.getElementById('atdBuscaDataInicio')?.value || '';
  const df     = document.getElementById('atdBuscaDataFim')?.value || '';
  const pedido = document.getElementById('atdBuscaPedidoNum')?.value.trim() || '';
  const wpp        = document.getElementById('atdFiltroWpp')?.checked || false;
  const ig         = document.getElementById('atdFiltroIg')?.checked || false;
  const statusResp = _atdState.filtrosAvancados.statusResposta || '';
  const avaliacao  = _atdState.filtrosAvancados.avaliacao || 0;

  // Persiste os filtros no estado
  _atdState.filtrosAvancados = {
    canais: [...(wpp ? ['whatsapp'] : []), ...(ig ? ['instagram'] : [])],
    de: di, ate: df, statusResposta: statusResp, avaliacao,
  };

  document.getElementById('atdBuscaAvancadaOverlay')?.remove();
  _atdAtualizarBotaoFiltro();

  const sb = _atdGetSbClient();
  let q = sb
    .from('atd_conversas')
    .select('id, status, atendente_id, canal_tipo, pedido_data, atualizado_em, mensagens_nao_lidas, ultima_mensagem, ultima_msg_atendente_em, ultima_msg_cliente_em, concluida_em, atd_contatos(nome, telefone, instagram_id, avatar_url, ig_followers, ig_following, ig_posts)')
    .order('atualizado_em', { ascending: false })
    .limit(300);

  if (di) q = q.gte('atualizado_em', di);
  if (df) q = q.lte('atualizado_em', df + 'T23:59:59');
  if (pedido) q = q.contains('pedido_data', { display_id: pedido });
  if (wpp && !ig) q = q.eq('canal_tipo', 'whatsapp');
  if (ig && !wpp) q = q.eq('canal_tipo', 'instagram');
  // respondidas/não respondidas: filtra pela origem da última mensagem
  if (statusResp === 'nao_respondidas') q = q.filter('ultima_mensagem->>origem', 'eq', 'cliente');
  if (statusResp === 'respondidas')     q = q.filter('ultima_mensagem->>origem', 'eq', 'atendente');
  // avaliação mínima (coluna avaliacao INT na atd_conversas, 1-5)
  if (avaliacao > 0) q = q.gte('avaliacao', avaliacao);

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

// ── F3: Seleção em massa ──────────────────────────────────────────────────────

function _atdConvHoverIn(el) {
  // Nada a fazer — CSS :hover cuida do visual
}
function _atdConvHoverOut(el) {
  // Nada a fazer — CSS :hover cuida do visual
}

function _atdToggleSelecionar(id, checked) {
  if (checked) {
    _atdState.selecionadas.add(id);
  } else {
    _atdState.selecionadas.delete(id);
  }
  _atdAtualizarBulkBar();
  _atdRenderLista();
}

function _atdToggleSelecionarTodos(checked) {
  const filtro  = _atdState.filtroAtivo || 'chat';
  const canais  = filtro === 'avaliacoes' ? _ATD_CANAIS_AVAL : _ATD_CANAIS_CHAT;
  const visíveis = _atdState.conversas.filter(c => canais.includes(c.canal_tipo));
  if (checked) {
    visíveis.forEach(c => _atdState.selecionadas.add(c.id));
  } else {
    _atdState.selecionadas.clear();
  }
  _atdAtualizarBulkBar();
  _atdRenderLista();
}

function _atdLimparSelecao() {
  _atdState.selecionadas.clear();
  _atdAtualizarBulkBar();
  _atdRenderLista();
}

function _atdAtualizarBulkBar() {
  const bar = document.getElementById('atdBulkBar');
  const count = document.getElementById('atdBulkCount');
  const chkAll = document.getElementById('atdCheckAll');
  if (!bar) return;
  const n = _atdState.selecionadas.size;
  if (n > 0) {
    bar.style.display = 'flex';
    if (count) count.textContent = `${n} selecionada${n > 1 ? 's' : ''}`;
    // Atualiza estado do "marcar todos"
    const filtro = _atdState.filtroAtivo || 'chat';
    const canais = filtro === 'avaliacoes' ? _ATD_CANAIS_AVAL : _ATD_CANAIS_CHAT;
    const total = _atdState.conversas.filter(c => canais.includes(c.canal_tipo)).length;
    if (chkAll) chkAll.indeterminate = n > 0 && n < total;
    if (chkAll) chkAll.checked = n === total;
  } else {
    bar.style.display = 'none';
  }
}

async function _atdConcluirSelecionadas() {
  const ids = [..._atdState.selecionadas];
  if (!ids.length) return;
  const confirmou = confirm(`Concluir ${ids.length} conversa${ids.length > 1 ? 's' : ''}? Esta ação não pode ser desfeita.`);
  if (!confirmou) return;
  const sb = _atdGetSbClient();
  const { error } = await sb
    .from('atd_conversas')
    .update({ status: 'concluida', concluida_em: new Date().toISOString() })
    .in('id', ids);
  if (error) { toast('Erro ao concluir conversas', 'err'); return; }
  toast(`${ids.length} conversa${ids.length > 1 ? 's concluídas' : ' concluída'} ✓`, 'ok');
  // Se a conversa ativa estava entre as selecionadas, limpa o chat
  if (_atdState.conversaAtivaId && _atdState.selecionadas.has(_atdState.conversaAtivaId)) {
    _atdState.conversaAtivaId = null;
    const vazio = document.getElementById('atdChatVazio');
    const ativo = document.getElementById('atdChatAtivo');
    const painel = document.getElementById('atdPainelContato');
    if (vazio) vazio.style.display = 'flex';
    if (ativo) ativo.style.display = 'none';
    if (painel) painel.style.display = 'none';
  }
  _atdState.selecionadas.clear();
  _atdAtualizarBulkBar();
  await _atdCarregarConversas();
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

  // F3: classe no container ativa modo seleção visível em todos os itens
  el.classList.toggle('atd-lista-selecionando', _atdState.selecionadas.size > 0);

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
    const selecionada = _atdState.selecionadas.has(c.id);
    const naoLidas = c.mensagens_nao_lidas || 0;
    const isConcluida = c.status === 'concluida' || c.status === 'expirada';

    // F3: wrapper do avatar — ao hover mostra checkbox, ao selecionar substitui avatar
    const avatarImg = contato.avatar_url
      ? `<img class="conv-avatar" src="${contato.avatar_url}" alt="${inicial}" style="${isConcluida ? 'opacity:.55' : ''}" onerror="this.outerHTML='<div class=conv-avatar-inicial style=\\'${isConcluida ? 'opacity:.55' : ''}\\'>  ${inicial}</div>'">`
      : `<div class="conv-avatar-inicial" style="${isConcluida ? 'opacity:.55;background:var(--surface3)' : ''}">${inicial}</div>`;
    const avatar = `
      <div class="conv-avatar-wrap" style="position:relative;flex-shrink:0;width:40px;height:40px">
        <div class="conv-avatar-img" style="transition:opacity .15s;${selecionada ? 'opacity:0;pointer-events:none' : ''}">${avatarImg}</div>
        <div class="conv-cb-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:${selecionada ? '1' : '0'};transition:opacity .15s">
          <input type="checkbox" ${selecionada ? 'checked' : ''} onclick="event.stopPropagation();_atdToggleSelecionar('${c.id}',this.checked)"
            style="width:20px;height:20px;accent-color:var(--purple);cursor:pointer;border-radius:4px">
        </div>
      </div>`;

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

    // Preview da última mensagem — F4: story_comment emoji-only não aparece como preview
    const ultiMsg = c.ultima_mensagem || {};
    const previewOrigem = ultiMsg.origem;
    const previewTexto = (() => {
      const tipo = ultiMsg.tipo;
      if (tipo === 'story_mention') return '📸 Mencionou no story';
      if (tipo === 'story_comment') {
        // F4: oculta reações emoji — mostra preview neutro se filtrado
        if (ultiMsg.filtrado && _atdState.filtrosAvancados.ocultarEmojiStory !== false) return '💬 Comentou no story';
        return '💬 Comentou no story';
      }
      if (tipo === 'imagem')        return '📷 Imagem';
      if (tipo === 'video')         return '🎥 Vídeo';
      if (tipo === 'audio')         return '🎤 Áudio';
      if (tipo === 'documento')     return '📄 Documento';
      if (tipo === 'sticker')       return '😊 Sticker';
      if (tipo === 'localizacao')   return '📍 Localização';
      const texto = ultiMsg.texto || '';
      if (!texto && ultiMsg.story_reply) return '↩ Respondeu ao story';
      return texto;
    })();
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

    // Badge influenciador Instagram (>5000 seguidores)
    const isInfluencer = c.canal_tipo === 'instagram' && (contato.ig_followers || 0) >= 5000;
    const influencerBadge = isInfluencer
      ? `<span style="font-size:9px;font-weight:700;color:#E1306C;background:#fde8f0;padding:1px 6px;border-radius:999px;flex-shrink:0;display:flex;align-items:center;gap:2px">${lc('star', 9, '#E1306C')} Influencer</span>`
      : '';

    const botBadge = ''; // bot é global — não tem badge por conversa

    // F2: nível de urgência baseado no tempo desde que precisa_humano foi ativado
    let alertaClass = '';
    let alertaTimerHtml = '';
    if (c.precisa_humano && c.humano_solicitado_em) {
      const minAguard = Math.floor((agora - new Date(c.humano_solicitado_em).getTime()) / 60000);
      alertaClass = minAguard >= 5 ? 'atd-alerta-3' : minAguard >= 2 ? 'atd-alerta-2' : 'atd-alerta-1';
      const alertaCor = minAguard >= 2 ? 'var(--red)' : 'var(--yellow)';
      const alertaLabel = minAguard < 60 ? `${minAguard}min` : `${Math.floor(minAguard/60)}h${minAguard%60?String(minAguard%60).padStart(2,'0')+'m':''}`;
      alertaTimerHtml = `<span style="font-size:9px;color:${alertaCor};font-weight:800;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:2px;animation:atd-pulse-${minAguard>=2?'red':'yellow'} 1.5s infinite">
        ${lc('alert-circle', 9, alertaCor)} ${alertaLabel} sem resposta
      </span>`;
    }

    return `
      <div class="conv-item ${ativa ? 'active' : ''} ${selecionada ? 'conv-selected' : ''} ${alertaClass}" data-canal="${c.canal_tipo || ''}"
        onclick="_atdState.selecionadas.size>0?_atdToggleSelecionar('${c.id}',!_atdState.selecionadas.has('${c.id}')):_atdAbrirConversa('${c.id}')"
        onmouseenter="_atdConvHoverIn(this)" onmouseleave="_atdConvHoverOut(this)">
        <!-- Avatar com checkbox hover (F3) -->
        <div style="position:relative;flex-shrink:0">
          ${avatar}
          <span class="conv-canal-badge" style="position:absolute;bottom:-1px;right:-1px;width:15px;height:15px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;transition:opacity .15s">
            ${_atdIconeCanal(c.canal_tipo, 12)}
          </span>
        </div>

        <!-- Conteúdo principal -->
        <div style="flex:1;min-width:0">
          <!-- Linha 1: Nome (destaque) + data + não-lidas -->
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:2px">
            <div class="conv-nome" style="font-weight:800;font-size:var(--text-sm);color:${isConcluida ? 'var(--fg-subtle)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
              ${dataHtml}
              ${naoLidas ? `<span class="conv-nao-lidas">${naoLidas}</span>` : ''}
            </div>
          </div>
          <!-- Linha 2: Preview da mensagem -->
          <div style="font-size:var(--text-xs);color:var(--fg-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:3px;margin-bottom:4px">
            ${previewPrefix}${previewTexto || '<em style="opacity:.6">Sem mensagens</em>'}
          </div>
          <!-- Linha 3: Status + timer + pedido + influencer + bot + alerta -->
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            ${statusBadge}
            ${alertaTimerHtml || timerHtml}
            ${pedidoHtml}
            ${influencerBadge}
            ${botBadge}
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

function _atdLabelData(date) {
  const hoje = new Date();
  const d = new Date(date);
  const diffDias = Math.floor((new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) -
                               new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diffDias === 0) return 'Hoje';
  if (diffDias === 1) return 'Ontem';
  if (diffDias < 7) return d.toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace(/^\w/, c => c.toUpperCase()).replace('-feira', '-feira');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _atdRenderChat(conversa) {
  const nome = conversa.atd_contatos?.nome || conversa.atd_contatos?.telefone || 'Sem nome';
  let ultimaData = null;
  const bubbles = _atdState.mensagens.filter(m => {
    // F4: oculta story_comments que são só emojis (filtrado = true)
    if (m.tipo === 'story_comment' && m.conteudo?.filtrado) return false;
    return true;
  }).map(m => {
    const classe = m.visibilidade === 'interna' ? 'interna' : (m.origem === 'cliente' ? 'cliente' : 'atendente');
    const hora = new Date(m.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const prefixo = classe === 'interna' ? `${lc('lock', 11, 'var(--warning-fg)')} ` : '';

    const diaMsg = new Date(m.enviado_em).toDateString();
    const sepData = diaMsg !== ultimaData
      ? `<div class="chat-date-sep">${_atdLabelData(m.enviado_em)}</div>`
      : '';
    ultimaData = diaMsg;

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
          <div style="width:240px;height:80px;background:var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--fg-subtle);margin-bottom:8px">
            📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
          </div>
          <div style="display:flex;gap:6px">
            <a href="${mapsUrl}" target="_blank" style="flex:1;text-align:center;padding:5px 8px;background:rgba(0,0,0,.12);border-radius:6px;font-size:11px;font-weight:700;color:inherit;text-decoration:none">
              ${lc('external-link', 11, 'currentColor')} Abrir Maps
            </a>
            <button onclick="_atdEncaminharLocalizacao(${lat},${lng})" style="flex:1;padding:5px 8px;background:rgba(0,0,0,.12);border:none;border-radius:6px;font-size:11px;font-weight:700;color:inherit;cursor:pointer">
              ${lc('send', 11, 'currentColor')} Encaminhar
            </button>
          </div>
        </div>`;
    } else if (m.tipo === 'imagem' && m.conteudo?.expirado) {
      conteudoHtml = `<div style="padding:10px 14px;font-size:12px;opacity:.6;display:flex;align-items:center;gap:6px">${lc('image-off',13,'currentColor')} Imagem expirada</div>`;
    } else if (m.tipo === 'audio' && m.conteudo?.expirado) {
      conteudoHtml = `<div style="padding:10px 14px;font-size:12px;opacity:.6;display:flex;align-items:center;gap:6px">${lc('mic-off',13,'currentColor')} Áudio expirado</div>`;
    } else if (m.tipo === 'video' && m.conteudo?.expirado) {
      conteudoHtml = `<div style="padding:10px 14px;font-size:12px;opacity:.6;display:flex;align-items:center;gap:6px">${lc('video-off',13,'currentColor')} Vídeo expirado</div>`;
    } else if (m.tipo === 'documento' && m.conteudo?.expirado) {
      conteudoHtml = `<div style="padding:10px 14px;font-size:12px;opacity:.6;display:flex;align-items:center;gap:6px">${lc('file-x',13,'currentColor')} Documento expirado</div>`;
    } else if (m.tipo === 'imagem' && m.conteudo?.url) {
      const legenda = m.conteudo.texto
        ? `<div style="padding:4px 10px 2px;font-size:var(--text-xs);opacity:.9">${m.conteudo.texto}</div>` : '';
      conteudoHtml = `__MEDIA_BUBBLE__
        <a href="${m.conteudo.url}" target="_blank" style="display:block">
          <img src="${m.conteudo.url}" alt="Imagem"
            style="width:260px;max-width:100%;height:auto;display:block;border-radius:inherit"
            onload="(function(el){var w=document.getElementById('atdMensagensWrap');if(w)w.scrollTop=w.scrollHeight;})(this)"
            onerror="this.closest('a').outerHTML='<div style=\\'padding:10px 12px;font-size:13px\\'>📷 Imagem não disponível</div>'">
        </a>${legenda}`;
    } else if (m.tipo === 'imagem') {
      conteudoHtml = `📷 Imagem${m.conteudo?.texto ? ': ' + m.conteudo.texto : ''}`;
    } else if (m.tipo === 'audio' && m.conteudo?.url) {
      conteudoHtml = `__MEDIA_BUBBLE__
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;min-width:220px">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('mic', 16, classe === 'cliente' ? 'var(--purple)' : '#fff')}
          </div>
          <div style="flex:1;min-width:0">
            <audio controls style="width:100%;height:32px;outline:none" preload="metadata">
              <source src="${m.conteudo.url}">
            </audio>
          </div>
        </div>`;
    } else if (m.tipo === 'audio') {
      conteudoHtml = `🎤 Áudio`;
    } else if (m.tipo === 'video' && m.conteudo?.url) {
      const legenda = m.conteudo.texto
        ? `<div style="padding:4px 10px 2px;font-size:var(--text-xs);opacity:.9">${m.conteudo.texto}</div>` : '';
      conteudoHtml = `__MEDIA_BUBBLE__
        <video controls preload="metadata"
          style="width:260px;height:200px;display:block;border-radius:inherit;background:#000"
          onloadedmetadata="(function(v){v.style.height='auto';})(this)"
          onerror="this.outerHTML='<div style=\\'padding:10px 12px;font-size:13px\\'>🎥 Vídeo não disponível</div>'">
          <source src="${m.conteudo.url}" onerror="this.parentElement.outerHTML='<div style=\\'padding:10px 12px;font-size:13px\\'>🎥 Vídeo não disponível</div>'">
        </video>${legenda}`;
    } else if (m.tipo === 'video') {
      conteudoHtml = `🎥 Vídeo${m.conteudo?.texto ? ': ' + m.conteudo.texto : ''}`;
    } else if (m.tipo === 'documento' && m.conteudo?.url) {
      const nomeArq = m.conteudo.nome || 'Documento';
      const ext = nomeArq.split('.').pop().toUpperCase();
      conteudoHtml = `__MEDIA_BUBBLE__
        <a href="${m.conteudo.url}" target="_blank" download style="display:flex;align-items:center;gap:12px;padding:12px 14px;text-decoration:none;color:inherit">
          <div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:800">
            ${ext}
          </div>
          <div style="min-width:0">
            <div style="font-weight:600;font-size:var(--text-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${nomeArq}</div>
            <div style="font-size:10px;opacity:.7;margin-top:2px">Toque para baixar</div>
          </div>
          ${lc('download', 14, 'currentColor')}
        </a>`;
    } else if (m.tipo === 'documento') {
      conteudoHtml = `📄 Documento`;
    } else if (m.tipo === 'sticker' && m.conteudo?.url) {
      conteudoHtml = `__NO_BUBBLE__<img src="${m.conteudo.url}" alt="Sticker" style="max-width:140px;max-height:140px;display:block" onerror="this.outerHTML='😊 Sticker'">`;
    } else if (m.tipo === 'sticker') {
      conteudoHtml = `😊 Sticker`;
    } else if (m.tipo === 'story_mention') {
      // Cliente mencionou o perfil da empresa em um story dele
      const storyUrl = m.conteudo?.story_url;
      conteudoHtml = `
        <div style="display:flex;align-items:center;gap:8px;padding:2px 0 6px">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('at-sign', 14, '#fff')}
          </div>
          <div>
            <div style="font-weight:700;font-size:var(--text-xs)">Mencionou no story</div>
            <div style="font-size:10px;opacity:.7">Este contato citou o seu perfil em um story</div>
          </div>
        </div>
        ${storyUrl ? `<a href="${storyUrl}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:${classe==='cliente'?'var(--purple)':'rgba(255,255,255,.8)'};text-decoration:none;padding-top:4px;border-top:1px solid rgba(255,255,255,.15)">
          ${lc('external-link', 11, 'currentColor')} Ver story
        </a>` : ''}`;
    } else if (m.tipo === 'story_comment') {
      // Cliente comentou em um story/post da empresa
      const isStory   = m.conteudo?.media_type === 'STORY' || m.conteudo?.is_story;
      const mediaUrl  = m.conteudo?.media_url;
      const mediaThumb = m.conteudo?.media_thumb;
      const texto     = m.conteudo?.texto ?? '';
      const tipoLabel = isStory ? 'Comentou no seu story' : (m.conteudo?.media_type === 'REELS' ? 'Comentou no seu Reels' : 'Comentou no seu post');
      const linkColor = classe === 'cliente' ? 'var(--purple)' : 'rgba(255,255,255,.8)';
      const thumbHtml = mediaThumb
        ? `<a href="${mediaUrl || mediaThumb}" target="_blank" rel="noopener" style="display:block;margin-bottom:6px;border-radius:8px;overflow:hidden;max-width:180px">
            <img src="${mediaThumb}" alt="Story" style="width:100%;display:block;border-radius:8px" onerror="this.parentElement.style.display='none'">
          </a>`
        : '';
      conteudoHtml = `
        ${thumbHtml}
        <div style="display:flex;align-items:center;gap:8px;${thumbHtml ? '' : 'padding:2px 0 6px'}">
          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${isStory ? lc('image', 12, '#fff') : lc('grid', 12, '#fff')}
          </div>
          <div>
            <div style="font-weight:700;font-size:var(--text-xs)">${tipoLabel}</div>
            ${mediaUrl ? `<a href="${mediaUrl}" target="_blank" rel="noopener" style="font-size:10px;color:${linkColor};opacity:.8;text-decoration:none">Ver publicação ↗</a>`
                       : `<div style="font-size:10px;opacity:.6">Publicação não disponível</div>`}
          </div>
        </div>
        ${texto ? `<div style="font-size:var(--text-sm);padding-top:6px;border-top:1px solid rgba(255,255,255,.15);margin-top:4px">"${texto}"</div>` : ''}`;
    } else {
      // Texto comum — pode ter contexto de story_reply
      const storyReply = m.conteudo?.story_reply;
      const previewUrl = storyReply?.story_preview_url || storyReply?.story_url;
      const storyCtxHtml = storyReply
        ? (() => {
            const isVid = previewUrl && (previewUrl.endsWith('.mp4') || previewUrl.includes('video'));
            const mediaEl = previewUrl
              ? (isVid
                  ? `<video src="${previewUrl}" style="width:100%;max-width:180px;border-radius:6px;max-height:140px;display:block;margin-bottom:4px;background:#000" muted playsinline preload="auto" controls></video>`
                  : `<img src="${previewUrl}" alt="Story" style="width:100%;max-width:160px;display:block;border-radius:6px;margin-bottom:4px" onerror="this.style.display='none'">`)
              : '';
            const link = (storyReply.story_url || previewUrl)
              ? `<a href="${storyReply.story_url || previewUrl}" target="_blank" rel="noopener" style="font-size:10px;opacity:.7;color:inherit">Ver story ↗</a>`
              : '<span style="font-size:10px;opacity:.6">Story não disponível</span>';
            return `<div style="border-left:3px solid rgba(255,255,255,.4);padding:6px 8px;margin-bottom:6px;border-radius:0 6px 6px 0;background:rgba(0,0,0,.12)">
              <div style="display:flex;align-items:center;gap:4px;font-size:10px;font-weight:700;opacity:.8;margin-bottom:4px">
                ${lc('image', 10, 'currentColor')} Respondeu ao seu story
              </div>
              ${mediaEl}${link}
            </div>`;
          })()
        : '';
      conteudoHtml = `${storyCtxHtml}${prefixo}${m.conteudo?.texto ?? ''}`;
    }

    // Label interno do remetente (visível só no app, acima da bolha)
    const nomeAtendente = (m.origem === 'atendente' && m.atendente_id)
      ? (_atdState.perfisCache?.[m.atendente_id] || 'Atendente')
      : null;
    const labelAtendente = nomeAtendente
      ? `<div style="text-align:right;font-size:9px;font-weight:700;color:var(--fg-subtle);margin-bottom:2px;padding-right:2px">${nomeAtendente}</div>`
      : '';

    // Mídia: bolha sem padding interno (a mídia ocupa todo o espaço)
    if (conteudoHtml.startsWith('__NO_BUBBLE__')) {
      return `${sepData}${labelAtendente}${conteudoHtml.slice(13)}`;
    }
    if (conteudoHtml.startsWith('__MEDIA_BUBBLE__')) {
      const inner = conteudoHtml.slice(16);
      return `${sepData}${labelAtendente}<div class="msg-bubble ${classe}" style="padding:0">${inner}<div style="font-size:10px;opacity:.7;margin-top:4px;padding:0 10px 6px">${hora}</div></div>`;
    }
    // Check de status (só para mensagens do atendente)
    const statusCheck = (() => {
      if (classe !== 'atendente') return '';
      const s = m.status || 'sent';
      if (s === 'read')      return `<span title="Lida" style="display:inline-flex;margin-left:3px;vertical-align:middle">${_atdDoubleCheck('#93c5fd')}</span>`;
      if (s === 'delivered') return `<span title="Entregue" style="display:inline-flex;margin-left:3px;vertical-align:middle">${_atdDoubleCheck('rgba(255,255,255,.5)')}</span>`;
      return `<span title="Enviada" style="display:inline-flex;margin-left:3px;vertical-align:middle">${_atdSingleCheck('rgba(255,255,255,.5)')}</span>`;
    })();
    return `${sepData}${labelAtendente}<div class="msg-bubble ${classe}">${conteudoHtml}<div style="font-size:10px;opacity:.7;margin-top:4px;display:flex;align-items:center;justify-content:flex-end;gap:2px">${hora}${statusCheck}</div></div>`;
  }).join('');

  _atdState.modoNotaInterna = false;
  const corrigirAtivo = !!_atdState.corrigirAtivoPorConversa[conversa.id];
  const isIg = conversa.canal_tipo === 'instagram';
  const ct = conversa.atd_contatos || {};
  const igFollowers = ct.ig_followers;
  const isInfluencer = isIg && (igFollowers || 0) >= 5000;
  const igUsername = ct.instagram_handle || ct.instagram_id;

  // Stats Instagram
  const igStatsHtml = isIg && igFollowers != null ? `
    <div style="display:flex;gap:14px;font-size:11px;color:var(--fg-subtle);margin-top:2px">
      ${ct.ig_posts     != null ? `<span><strong style="color:var(--text);font-weight:600">${_atdFmtNum(ct.ig_posts)}</strong> publicações</span>` : ''}
      ${ct.ig_followers != null ? `<span><strong style="color:var(--text);font-weight:600">${_atdFmtNum(ct.ig_followers)}</strong> seguidores</span>` : ''}
      ${ct.ig_following != null ? `<span><strong style="color:var(--text);font-weight:600">${_atdFmtNum(ct.ig_following)}</strong> seguindo</span>` : ''}
    </div>` : '';

  // Canal row
  const igLogoSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" stroke="#E1306C" stroke-width="2"/><circle cx="12" cy="12" r="4.5" stroke="#E1306C" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="#E1306C"/></svg>`;
  const wppLogoSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.413A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.95 7.95 0 01-4.073-1.117l-.292-.174-3.018.857.872-2.944-.19-.302A7.95 7.95 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>`;
  const canalHtml = isIg
    ? `<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--fg-subtle);margin-top:4px">${igLogoSvg}<span>Via Instagram${ct.nome ? '' : ''}</span></div>`
    : `<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--fg-subtle);margin-top:4px">${wppLogoSvg}<span>Via WhatsApp</span></div>`;

  // Nome — rosa clicável no Instagram
  const nomeHtml = isIg && igUsername
    ? `<a href="https://instagram.com/${igUsername}" target="_blank" rel="noopener"
        style="font-weight:700;font-size:15px;color:#E1306C;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</a>`
    : `<span style="font-weight:700;font-size:15px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</span>`;

  // Badge influencer
  const influencerBadge = isInfluencer
    ? `<span title="Influenciador (${_atdFmtNum(igFollowers)} seguidores)" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;color:#E1306C;background:#fde8f0;padding:2px 7px;border-radius:999px;flex-shrink:0">${lc('star', 9, '#E1306C')} Influencer</span>`
    : '';

  // Botão de tags com contagem
  const tagsConv = _atdState.tagsConversaAtual || [];
  const tagsAtivas = _atdState.todasTags.filter(t => tagsConv.includes(t.id));
  const tagBtnColor = tagsAtivas.length > 0 ? 'var(--purple)' : 'var(--fg-subtle)';
  const tagCountBadge = tagsAtivas.length > 0
    ? `<span style="background:var(--purple);color:#fff;font-size:9px;font-weight:700;border-radius:999px;padding:0 5px;min-width:16px;text-align:center;line-height:16px">${tagsAtivas.length}</span>`
    : '';
  const tagBtnHtml = `
    <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
      ${tagsAtivas.map(t => `<span style="background:${t.cor||'var(--purple)'};color:#fff;font-size:9px;font-weight:600;padding:2px 8px;border-radius:999px;cursor:pointer;white-space:nowrap" title="Remover tag" onclick="_atdToggleTag('${conversa.id}','${t.id}')">${t.nome}</span>`).join('')}
      <button onclick="_atdAbrirTagPickerHeader('${conversa.id}')" title="Tags" class="btn btn-ghost btn-xs" style="padding:3px 6px;display:flex;align-items:center;gap:3px;color:${tagBtnColor}">
        ${lc('tag', 13, tagBtnColor)}${tagCountBadge}
      </button>
    </div>`;

  const isPrecisaHumano = !!conversa.precisa_humano;

  // F2: banner de alerta — aparece acima das mensagens quando precisa_humano
  const alertaBannerHtml = isPrecisaHumano ? `
    <div id="atdAlertaHumano" style="background:#fef3c7;border-bottom:1px solid #fcd34d;padding:8px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0">
      <span style="font-size:16px">🚨</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-xs);font-weight:800;color:#92400e">Intervenção humana necessária</div>
        <div style="font-size:10px;color:#b45309">A IA identificou que este cliente precisa de atenção especial</div>
      </div>
      <button onclick="_atdAssumirConversa('${conversa.id}')" class="btn btn-sm" style="background:#d97706;color:#fff;border-color:#d97706;white-space:nowrap;flex-shrink:0">
        ${lc('user-check', 12, '#fff')} Assumir
      </button>
    </div>` : '';

  document.getElementById('atdChatAtivo').innerHTML = `
    <!-- HEADER -->
    <div style="padding:10px 16px 8px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
            ${nomeHtml}
            ${influencerBadge}
          </div>
          ${igStatsHtml}
          ${canalHtml}
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding-top:2px;flex-shrink:0">
          <div id="atdHeaderTags">${tagBtnHtml}</div>
        </div>
      </div>
    </div>
    ${alertaBannerHtml}
    <!-- MENSAGENS -->
    <div id="atdMensagensWrap" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px">
      ${bubbles || '<div style="color:var(--fg-subtle);font-size:var(--text-sm);text-align:center;margin-top:40px">Sem mensagens ainda.</div>'}
    </div>
    <!-- TOOLBAR compacta: textarea em cima, ícones + ações embaixo -->
    <div style="padding:10px 14px 12px;border-top:1px solid var(--border);position:relative">
      <div id="atdRespostasRapidasDropdown" style="display:none;position:absolute;bottom:100%;left:14px;right:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);box-shadow:0 -4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;margin-bottom:4px;z-index:10"></div>
      <input type="file" id="atdInputArquivo" style="display:none" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        onchange="_atdUploadArquivo('${conversa.id}', this)">
      <textarea id="atdCampoTexto" class="inp" rows="2" placeholder="Digite sua resposta... (/ pra respostas rápidas)"
        style="width:100%;resize:none;box-sizing:border-box;margin-bottom:7px" oninput="_atdCampoOnInput()"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_atdEnviarMensagem('${conversa.id}')}"></textarea>
      <div style="display:flex;align-items:center;gap:4px">
        <div style="display:flex;gap:2px;flex:1">
          <button id="atdBtnNotaInterna" class="btn btn-ghost btn-xs" title="Nota interna (só a equipe vê)" onclick="_atdToggleNotaInterna('${conversa.id}')" style="padding:4px 7px">
            ${lc('lock', 13, 'var(--fg-muted)')}
          </button>
          <button class="btn btn-ghost btn-xs" title="Enviar arquivo/imagem" onclick="document.getElementById('atdInputArquivo').click()" style="padding:4px 7px">
            ${lc('paperclip', 13, 'var(--fg-muted)')}
          </button>
          <button id="atdBtnGerarResposta" class="btn btn-ghost btn-xs" title="Gerar resposta ideal com IA" onclick="_atdGerarResposta('${conversa.id}')" style="padding:4px 7px">
            ${lc('zap', 13, 'var(--purple)')}
          </button>
          <button id="atdBtnCorrecaoAuto" class="btn btn-ghost btn-xs" title="${corrigirAtivo ? 'Correção automática ATIVADA — clique para desativar' : 'Correção automática DESATIVADA — clique para ativar'}"
            style="padding:4px 7px;${corrigirAtivo ? 'background:var(--purple);' : ''}" onclick="_atdToggleModoCorrecao('${conversa.id}')">
            ${lc('pencil', 13, corrigirAtivo ? '#fff' : 'var(--fg-muted)')}
          </button>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="_atdEnviarMensagem('${conversa.id}')">
            ${lc('send', 13, '#fff')} Enviar
          </button>
          <button class="btn btn-sm" style="background:var(--green);color:#fff;border-color:var(--green);white-space:nowrap" onclick="_atdConcluirConversa('${conversa.id}')">
            ${lc('check-circle', 13, '#fff')} Concluir
          </button>
        </div>
      </div>
    </div>
  `;

  const wrap = document.getElementById('atdMensagensWrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function _atdSingleCheck(color) {
  return `<svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L5 9L13 1" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function _atdDoubleCheck(color) {
  return `<svg width="18" height="10" viewBox="0 0 18 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5L5 9L13 1" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5L9 9L17 1" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _atdFmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function _atdTagsHeaderHtml(conversaId) {
  const marcadas = _atdState.todasTags.filter(t => _atdState.tagsConversaAtual.includes(t.id));
  const chips = marcadas.map(t =>
    `<span style="background:${t.cor||'var(--purple)'};color:#fff;font-size:10px;font-weight:600;padding:2px 9px;border-radius:999px;cursor:pointer;line-height:18px"
      title="Clique para remover tag" onclick="_atdToggleTag('${conversaId}','${t.id}')">${t.nome}</span>`
  ).join('');
  const btnAdd = `<button onclick="_atdAbrirTagPickerHeader('${conversaId}')"
    style="background:none;border:1px dashed var(--border);border-radius:999px;padding:1px 8px;font-size:10px;color:var(--fg-subtle);cursor:pointer;display:flex;align-items:center;gap:3px;line-height:18px">
    ${lc('plus', 9, 'currentColor')} tag
  </button>`;
  return chips + btnAdd;
}

function _atdRenderTagsHeader(conversaId) {
  const el = document.getElementById('atdHeaderTags');
  if (el) el.innerHTML = _atdTagsHeaderHtml(conversaId);
}

function _atdAbrirTagPickerHeader(conversaId) {
  const el = document.getElementById('atdHeaderTags');
  if (!el || !_atdState.todasTags.length) return;

  const existeDropdown = document.getElementById('atdTagPickerDropdown');
  if (existeDropdown) { existeDropdown.remove(); return; }

  const dropdown = document.createElement('div');
  dropdown.id = 'atdTagPickerDropdown';
  dropdown.style.cssText = `position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px;z-index:200;display:flex;flex-wrap:wrap;gap:4px;max-width:260px`;

  dropdown.innerHTML = _atdState.todasTags.map(t => {
    const ativa = _atdState.tagsConversaAtual.includes(t.id);
    return `<span style="background:${ativa ? (t.cor||'var(--purple)') : 'transparent'};color:${ativa ? '#fff' : (t.cor||'var(--purple)')};border:1px solid ${t.cor||'var(--purple)'};font-size:10px;font-weight:600;padding:2px 9px;border-radius:999px;cursor:pointer;line-height:18px"
      onclick="_atdToggleTag('${conversaId}','${t.id}');document.getElementById('atdTagPickerDropdown')?.remove()">${t.nome}</span>`;
  }).join('');

  const rect = el.getBoundingClientRect();
  const chat = document.getElementById('atdChatAtivo');
  const chatRect = chat.getBoundingClientRect();
  dropdown.style.top = (rect.bottom - chatRect.top + 4) + 'px';
  dropdown.style.left = (rect.left - chatRect.left) + 'px';
  chat.style.position = 'relative';
  chat.appendChild(dropdown);

  const fechar = (e) => { if (!dropdown.contains(e.target)) { dropdown.remove(); document.removeEventListener('click', fechar); } };
  setTimeout(() => document.addEventListener('click', fechar), 10);
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
  _atdRenderTagsHeader(conversaId);
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

// ── F1: Toggle bot GLOBAL ─────────────────────────────────────────────────────
function _atdToggleBotGlobal() {
  _atdState.botGlobalAtivo = !_atdState.botGlobalAtivo;
  // Persiste na sessão do browser
  if (_atdState.botGlobalAtivo) {
    localStorage.setItem('atd_bot_global', '1');
    toast('⚡ Bot ativado — todas as mensagens serão respondidas automaticamente', 'ok');
  } else {
    localStorage.removeItem('atd_bot_global');
    toast('Bot desativado — modo manual', 'info');
  }
  // Re-render a sidebar para atualizar o toggle visual
  _atdRenderInbox();
}

// ── F2: Assumir conversa (limpa alerta humano) ────────────────────────────────
async function _atdAssumirConversa(conversaId) {
  const sb = _atdGetSbClient();
  const user = getCurrentUser();
  await sb.from('atd_conversas').update({
    precisa_humano: false,
    humano_solicitado_em: null,
    atendente_id: user?.id ?? null,
    status: 'em_atendimento',
  }).eq('id', conversaId);
  const conv = _atdState.conversas.find(c => c.id === conversaId);
  if (conv) { conv.precisa_humano = false; conv.status = 'em_atendimento'; }
  toast('Você assumiu esta conversa', 'ok');
  _atdRenderLista();
  const { data: conversaAtual } = await sb.from('atd_conversas').select('*, atd_contatos(*)').eq('id', conversaId).single();
  if (conversaAtual) _atdRenderChat(conversaAtual);
}

// ── F2: Som de alerta humano (diferente do som de mensagem normal) ────────────
function _atdTocarSomAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Três beeps rápidos — padrão de urgência
    [0, 0.18, 0.36].forEach(offset => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(880, ctx.currentTime + offset);
      g.gain.setValueAtTime(0.3, ctx.currentTime + offset);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.14);
      o.start(ctx.currentTime + offset);
      o.stop(ctx.currentTime + offset + 0.14);
    });
  } catch { /* sem som se browser bloquear */ }
}

// ── F1+F2: Auto-resposta do bot quando chega mensagem ────────────────────────
async function _atdBotAutoResponder(conversaId) {
  const sb = _atdGetSbClient();
  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/gerar-resposta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ conversa_id: conversaId }),
    });
    if (!res.ok) return;
    const json = await res.json();

    if (json.needs_human) {
      // Bot detectou situação que precisa de humano — aciona alerta F2
      await sb.from('atd_conversas').update({
        precisa_humano: true,
        humano_solicitado_em: new Date().toISOString(),
      }).eq('id', conversaId);
      const conv = _atdState.conversas.find(c => c.id === conversaId);
      if (conv) { conv.precisa_humano = true; conv.humano_solicitado_em = new Date().toISOString(); }
      _atdTocarSomAlerta();
      _atdRenderLista();
      // Se conversa está aberta, atualiza o banner
      if (_atdState.conversaAtivaId === conversaId) _atdAbrirConversa(conversaId);
      return;
    }

    if (json.resposta) {
      // Envia resposta automática
      const user = getCurrentUser();
      await fetch(`${VTP_SUPABASE_URL}/functions/v1/enviar-mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
        body: JSON.stringify({ conversa_id: conversaId, texto: json.resposta, atendente_id: user?.id ?? null, visibilidade: 'publica' }),
      });
    }
  } catch (e) {
    console.warn('[atd-bot] falha ao auto-responder:', e);
  }
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

      console.log('[atd-rt] nova msg tipo:', msg?.tipo, '| convId:', convId, '| ativaId:', _atdState.conversaAtivaId, '| match:', convId === _atdState.conversaAtivaId);

      // Incrementa badge + som + título da aba (apenas se não for a conversa aberta)
      if (msg?.origem === 'cliente' && convId && convId !== _atdState.conversaAtivaId) {
        const conv = _atdState.conversas.find(c => c.id === convId);
        if (conv) {
          conv.mensagens_nao_lidas = (conv.mensagens_nao_lidas || 0) + 1;
          if (msg.conteudo?.texto) conv.ultima_mensagem = { texto: msg.conteudo.texto, origem: 'cliente' };

          // F1: bot global ativo — auto-responde sem interação do atendente
          if (_atdState.botGlobalAtivo && !conv.precisa_humano) {
            _atdBotAutoResponder(convId);
          } else {
            // F2: se já precisa_humano, toca som de alerta urgente; senão, som normal
            if (conv.precisa_humano) _atdTocarSomAlerta(); else _atdTocarSom();
          }

          _atdRenderLista();
          const totalNaoLidas = _atdState.conversas.reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
          if (totalNaoLidas > 0) document.title = `(${totalNaoLidas}) VTP Atendimento`;
        }
      }

      // Se a conversa está aberta, recarrega o chat
      if (convId === _atdState.conversaAtivaId) {
        _atdAbrirConversa(_atdState.conversaAtivaId);
      }

      // Recarrega lista + verifica se é uma nova conversa do mesmo contato que está aberto
      _atdCarregarConversas().then(() => {
        // Se a msg veio de uma conversa diferente mas o contato é o mesmo que está aberto,
        // abre automaticamente a nova conversa
        if (convId && convId !== _atdState.conversaAtivaId) {
          const convAtiva = _atdState.conversas.find(c => c.id === _atdState.conversaAtivaId);
          const convNova  = _atdState.conversas.find(c => c.id === convId);
          if (convAtiva && convNova &&
              convAtiva.atd_contatos?.telefone === convNova.atd_contatos?.telefone) {
            console.log('[atd-rt] mesma pessoa, nova conversa — abrindo:', convId);
            _atdAbrirConversa(convId);
          }
        }
      });
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

// ══════════════════════════════════════════════════════════════
// RESPOSTAS — módulo completo (Rápidas + Regras da IA)
// ══════════════════════════════════════════════════════════════

function _atdRenderRespostas() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div style="max-width:960px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
        ${lc('zap', 18, 'var(--purple)')}
        <div>
          <h2 style="font-size:var(--text-lg);font-weight:800;color:var(--text);margin:0;line-height:1.2">Respostas</h2>
          <div style="font-size:var(--text-xs);color:var(--fg-muted)">Atalhos rápidos e regras do assistente de IA</div>
        </div>
      </div>
      <div class="atd-resp-tabs" style="display:flex;gap:0">
        <button class="atd-resp-tab atd-resp-tab-active" data-resp="padrao" onclick="_atdRespostasAba('padrao')">
          ${lc('zap', 13, 'currentColor')} Respostas rápidas
        </button>
        <button class="atd-resp-tab" data-resp="ia" onclick="_atdRespostasAba('ia')">
          ${lc('cpu', 13, 'currentColor')} Regras da IA
        </button>
      </div>
      <div id="atdRespostasConteudo"></div>
    </div>`;
  _atdRespostasAba('padrao');
}

function _atdRespostasAba(aba) {
  document.querySelectorAll('[data-resp]').forEach(b => {
    const active = b.dataset.resp === aba;
    b.classList.toggle('atd-resp-tab-active', active);
  });
  if (aba === 'padrao') _atdRespostasPadraoRender();
  else _atdIARender();
}

// ── Questionários estruturados por seção ───────────────────────
const _ATD_IA_SECOES = [
  { id: 'tom_voz',          icon: 'smile',          label: 'Personalidade',   desc: 'Como o assistente fala e se comporta com os clientes.' },
  { id: 'gestao_crise',     icon: 'alert-triangle', label: 'Reclamações',     desc: 'Protocolos para atrasos, reclamações e clientes insatisfeitos.' },
  { id: 'compensacoes',     icon: 'gift',           label: 'Compensações',    desc: 'O que a IA pode oferecer sem precisar de aprovação humana.' },
  { id: 'slas',             icon: 'clock',          label: 'Tempos',          desc: 'Prazos de entrega e horários de funcionamento.' },
  { id: 'info_loja',        icon: 'map-pin',        label: 'Info da loja',    desc: 'Endereço, cardápio, área de entrega e contatos.' },
  { id: 'politicas_gerais', icon: 'file-text',      label: 'Políticas',       desc: 'Cancelamento, pagamento, troca e regras gerais.' },
];

const _ATD_IA_QUESTIONARIOS = {
  tom_voz: [
    { id: 'intro',             tipo: 'input',    label: 'Como o assistente se apresenta?',             placeholder: 'Olá! Sou a Pizzinha, da Vai Ter Pizza! 🍕' },
    { id: 'tom',               tipo: 'radio',    label: 'Tom da marca',                                opcoes: ['Caloroso e descontraído', 'Formal e profissional', 'Divertido e jovem'] },
    { id: 'emojis',            tipo: 'radio',    label: 'Uso de emojis',                               opcoes: ['Sim, com moderação', 'Sim, à vontade', 'Não usar'] },
    { id: 'emojis_principais', tipo: 'input',    label: 'Emojis preferidos da marca (opcional)',       placeholder: '🍕 ❤️ ✅' },
    { id: 'nunca_dizer',       tipo: 'textarea', label: 'Frases que NUNCA devem aparecer',             placeholder: 'Prezado(a), Lamentamos o ocorrido, Conforme solicitado...' },
    { id: 'encerramento',      tipo: 'input',    label: 'Frase de encerramento padrão',                placeholder: 'Qualquer dúvida é só chamar! 🍕' },
  ],
  gestao_crise: [
    { id: 'responsavel',       tipo: 'input',    label: 'Quem resolve reclamações graves?',            placeholder: 'Gerente Paulo — (11) 99999-9999' },
    { id: 'oferta_atraso',     tipo: 'radio',    label: 'O que oferecer em caso de atraso?',           opcoes: ['Só pedir desculpas', 'Desconto na próxima compra', 'Cupom imediato', 'Reenvio gratuito'] },
    { id: 'valor_cupom_crise', tipo: 'input',    label: 'Valor do cupom em caso de crise (R$)',        placeholder: '15,00' },
    { id: 'escalar_quando',    tipo: 'checkbox', label: 'Quando transferir para atendente humano?',    opcoes: ['Reclamação grave', 'Pedido de reembolso', 'Cliente irritado', 'Menção a avaliação/nota', 'Pedido perdido'] },
    { id: 'msg_atraso',        tipo: 'textarea', label: 'Mensagem padrão para atraso',                placeholder: 'Olá! Identificamos um atraso no seu pedido. Pedimos desculpas pelo inconveniente...' },
  ],
  compensacoes: [
    { id: 'pode_desconto',     tipo: 'radio',    label: 'Pode oferecer desconto sem autorização?',     opcoes: ['Sim', 'Não'] },
    { id: 'valor_max_cupom',   tipo: 'input',    label: 'Valor máximo de cupom automático (R$)',       placeholder: '20,00' },
    { id: 'autoriza_acima',    tipo: 'input',    label: 'Quem autoriza valores acima do limite?',      placeholder: 'Gerente — WhatsApp (11) 99999-9999' },
    { id: 'reenvio',           tipo: 'radio',    label: 'Política de reenvio de pedido',               opcoes: ['Sempre que solicitado', 'Nunca sem aprovação', 'Só com foto do problema'] },
    { id: 'validade_cupom',    tipo: 'input',    label: 'Validade dos cupons (dias)',                  placeholder: '30' },
  ],
  slas: [
    { id: 'tempo_entrega',     tipo: 'input',    label: 'Tempo prometido de entrega (minutos)',        placeholder: '45' },
    { id: 'tempo_alerta',      tipo: 'input',    label: 'Avisar cliente após quantos min de atraso?',  placeholder: '20' },
    { id: 'horario_seg_sex',   tipo: 'input',    label: 'Horário de funcionamento — Seg a Sex',        placeholder: '18h às 23h' },
    { id: 'horario_sab_dom',   tipo: 'input',    label: 'Horário de funcionamento — Sáb e Dom',        placeholder: '17h às 00h' },
    { id: 'fora_horario',      tipo: 'radio',    label: 'Fora do horário, o assistente deve:',         opcoes: ['Informar horário e encerrar', 'Capturar pedido para depois', 'Redirecionar para app de delivery'] },
  ],
  info_loja: [
    { id: 'nome',              tipo: 'input',    label: 'Nome da pizzaria',                            placeholder: 'Vai Ter Pizza!' },
    { id: 'endereco',          tipo: 'input',    label: 'Endereço completo',                           placeholder: 'Rua das Pizzas, 123 — Bairro, Cidade/SP' },
    { id: 'telefone',          tipo: 'input',    label: 'Telefone para contato',                       placeholder: '(11) 99999-9999' },
    { id: 'bairros',           tipo: 'textarea', label: 'Área de entrega (bairros ou raio em km)',     placeholder: 'Centro, Vila Mariana, Moema...' },
    { id: 'cardapio_link',     tipo: 'input',    label: 'Link do cardápio',                            placeholder: 'https://cardapio.vaiterPizza.com.br' },
    { id: 'instagram',         tipo: 'input',    label: 'Instagram',                                   placeholder: '@vaiterPizza' },
  ],
  politicas_gerais: [
    { id: 'cancelamento',      tipo: 'radio',    label: 'Aceita cancelamento após o preparo iniciar?', opcoes: ['Sim, sempre', 'Não, nunca', 'Depende do caso'] },
    { id: 'cancel_regra',      tipo: 'input',    label: 'Regra de cancelamento (detalhe)',             placeholder: 'Cancela se o motoboy ainda não saiu' },
    { id: 'pagamentos',        tipo: 'checkbox', label: 'Formas de pagamento aceitas',                 opcoes: ['Pix', 'Cartão crédito', 'Cartão débito', 'Dinheiro', 'Vale Refeição/Alimentação'] },
    { id: 'taxa_entrega',      tipo: 'radio',    label: 'Taxa de entrega',                             opcoes: ['Grátis', 'Valor fixo', 'Varia por bairro'] },
    { id: 'taxa_valor',        tipo: 'input',    label: 'Valor da taxa (se fixo, em R$)',              placeholder: '5,00' },
    { id: 'troca',             tipo: 'radio',    label: 'Aceita devolução / troca?',                   opcoes: ['Sim', 'Não', 'Só com foto do problema'] },
  ],
};

// Gera texto legível para a IA a partir das respostas do questionário
function _atdGerarConteudoIA(secId, dados) {
  if (!dados || Object.keys(dados).length === 0) return '';
  const linhas = [];
  const q = _ATD_IA_QUESTIONARIOS[secId] || [];
  q.forEach(campo => {
    const val = dados[campo.id];
    if (!val || (Array.isArray(val) && val.length === 0)) return;
    const v = Array.isArray(val) ? val.join(', ') : val;
    linhas.push(`${campo.label}: ${v}`);
  });
  return linhas.join('\n');
}

// Render campo do questionário
function _atdIACampoHTML(campo, valor) {
  const v = valor ?? '';
  if (campo.tipo === 'input') {
    return `<input id="iaq_${campo.id}" class="inp" style="font-size:var(--text-sm)" placeholder="${campo.placeholder || ''}" value="${String(v).replace(/"/g, '&quot;')}">`;
  }
  if (campo.tipo === 'textarea') {
    return `<textarea id="iaq_${campo.id}" class="inp" rows="3" style="font-size:var(--text-sm);resize:vertical" placeholder="${campo.placeholder || ''}">${v}</textarea>`;
  }
  if (campo.tipo === 'radio') {
    return `<div style="display:flex;flex-wrap:wrap;gap:6px">
      ${(campo.opcoes || []).map(op => `
        <label style="display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--r6);cursor:pointer;font-size:var(--text-xs);background:var(--surface);user-select:none"
          onclick="document.querySelectorAll('[name=iaq_${campo.id}]').forEach(r=>{r.closest('label').style.borderColor='var(--border)';r.closest('label').style.background='var(--surface)';r.closest('label').style.color='var(--text)'}); this.style.borderColor='var(--purple)'; this.style.background='var(--purple-xlight)'; this.style.color='var(--purple)';"
          style="${v === op ? 'border-color:var(--purple);background:var(--purple-xlight);color:var(--purple)' : 'color:var(--text)'}">
          <input type="radio" name="iaq_${campo.id}" value="${op}" ${v === op ? 'checked' : ''} style="display:none"> ${op}
        </label>`).join('')}
    </div>`;
  }
  if (campo.tipo === 'checkbox') {
    const selecionados = Array.isArray(v) ? v : (v ? v.split(', ') : []);
    return `<div style="display:flex;flex-wrap:wrap;gap:6px">
      ${(campo.opcoes || []).map(op => {
        const checked = selecionados.includes(op);
        return `<label style="display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--r6);cursor:pointer;font-size:var(--text-xs);background:var(--surface);user-select:none;${checked ? 'border-color:var(--purple);background:var(--purple-xlight);color:var(--purple)' : 'color:var(--text)'}"
          onclick="this.querySelector('input').checked=!this.querySelector('input').checked; this.style.borderColor=this.querySelector('input').checked?'var(--purple)':'var(--border)'; this.style.background=this.querySelector('input').checked?'var(--purple-xlight)':'var(--surface)'; this.style.color=this.querySelector('input').checked?'var(--purple)':'var(--text)';">
          <input type="checkbox" name="iaq_${campo.id}" value="${op}" ${checked ? 'checked' : ''} style="display:none"> ${op}
        </label>`;
      }).join('')}
    </div>`;
  }
  return '';
}

// Lê valores do formulário de questionário
function _atdIALerFormulario(secId) {
  const dados = {};
  const q = _ATD_IA_QUESTIONARIOS[secId] || [];
  q.forEach(campo => {
    if (campo.tipo === 'input' || campo.tipo === 'textarea') {
      dados[campo.id] = document.getElementById(`iaq_${campo.id}`)?.value.trim() || '';
    } else if (campo.tipo === 'radio') {
      const checked = document.querySelector(`[name="iaq_${campo.id}"]:checked`);
      dados[campo.id] = checked?.value || '';
    } else if (campo.tipo === 'checkbox') {
      const all = document.querySelectorAll(`[name="iaq_${campo.id}"]:checked`);
      dados[campo.id] = Array.from(all).map(c => c.value);
    }
  });
  return dados;
}

let _atdIAPorSecao = {};

async function _atdIARender() {
  const el = document.getElementById('atdRespostasConteudo');
  el.innerHTML = `<div style="color:var(--fg-subtle);font-size:var(--text-sm);padding:16px 0">Carregando...</div>`;

  const sb = _atdGetSbClient();
  const { data, error } = await sb.from('atd_base_conhecimento').select('*').eq('ativo', true);
  if (error) { el.innerHTML = `<div style="color:var(--danger)">Erro ao carregar.</div>`; return; }

  _atdIAPorSecao = {};
  (data || []).forEach(r => { _atdIAPorSecao[r.secao] = r; });

  const preenchidas = _ATD_IA_SECOES.filter(s => _atdIAPorSecao[s.id]?.conteudo).length;
  const total = _ATD_IA_SECOES.length;
  const pct = Math.round((preenchidas / total) * 100);

  el.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <!-- barra de progresso no topo do card -->
      <div style="padding:16px 20px 12px;border-bottom:1px solid var(--border);background:var(--bg-elevated)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:var(--text-xs);color:var(--fg-muted);font-weight:600">${preenchidas} de ${total} seções configuradas</span>
          <span style="font-size:var(--text-xs);font-weight:700;color:${pct === 100 ? 'var(--green)' : 'var(--purple)'}">
            ${pct === 100 ? lc('check-circle', 11, 'var(--green)') + ' Completo' : `${pct}%`}
          </span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct === 100 ? 'var(--green)' : 'var(--purple)'};border-radius:3px;transition:width .4s"></div>
        </div>
      </div>
      <!-- grid: nav lateral + editor -->
      <div style="display:grid;grid-template-columns:200px 1fr;min-height:500px">
        <!-- sidebar -->
        <div style="background:var(--bg-elevated);border-right:1px solid var(--border);padding:12px 8px;display:flex;flex-direction:column;gap:2px">
          ${_ATD_IA_SECOES.map((s, i) => {
            const ok = !!_atdIAPorSecao[s.id]?.conteudo;
            return `<button data-ia-sec="${s.id}" onclick="_atdIASecaoClick('${s.id}')"
              style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:none;border-radius:var(--r6);cursor:pointer;text-align:left;width:100%;transition:background .15s;background:${i === 0 ? 'var(--purple-xlight)' : 'transparent'};color:${i === 0 ? 'var(--purple)' : 'var(--text)'}">
              <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${ok ? 'var(--green)' : 'var(--border)'};border:1.5px solid ${ok ? 'var(--green)' : 'var(--fg-subtle)'}"></span>
              <span style="font-size:var(--text-xs);font-weight:600">${s.label}</span>
            </button>`;
          }).join('')}
          <div style="margin-top:auto;padding:10px 8px 4px;border-top:1px solid var(--border);margin-left:-8px;margin-right:-8px;padding-left:16px">
            <div style="font-size:10px;color:var(--fg-subtle);line-height:1.5;display:flex;gap:4px;align-items:flex-start">
              ${lc('zap', 9, 'var(--purple)')}
              <span>A IA usa todas as seções para responder no chat.</span>
            </div>
          </div>
        </div>
        <!-- editor -->
        <div id="atdIAEditor" style="padding:24px;overflow-y:auto"></div>
      </div>
    </div>`;

  _atdIASecaoRender(_ATD_IA_SECOES[0].id);
}

function _atdIASecaoClick(secId) {
  document.querySelectorAll('[data-ia-sec]').forEach(b => {
    const active = b.dataset.iaSec === secId;
    b.style.background = active ? 'var(--purple-xlight)' : 'transparent';
    b.style.color      = active ? 'var(--purple)' : 'var(--text)';
  });
  _atdIASecaoRender(secId);
}

function _atdIASecaoRender(secId) {
  const secInfo = _ATD_IA_SECOES.find(s => s.id === secId);
  const reg = _atdIAPorSecao[secId];
  const dados = reg?.dados || {};
  const el = document.getElementById('atdIAEditor');
  if (!el) return;

  const campos = _ATD_IA_QUESTIONARIOS[secId] || [];
  const ok = !!reg?.conteudo;

  el.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
        ${lc(secInfo.icon, 16, 'var(--purple)')}
        <span style="font-weight:800;font-size:var(--text-base);color:var(--text)">${secInfo.label}</span>
        <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:4px;${ok ? 'color:var(--green);background:var(--success-bg)' : 'color:var(--fg-subtle);background:var(--bg-subtle)'}">
          ${ok ? '✓ Configurado' : 'Não preenchido'}
        </span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--fg-muted);margin-bottom:20px">${secInfo.desc}</div>

      <div style="display:flex;flex-direction:column;gap:14px">
        ${campos.map(campo => `
          <div>
            <label style="display:block;font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${campo.label}</label>
            ${_atdIACampoHTML(campo, dados[campo.id])}
          </div>`).join('')}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost btn-sm" onclick="_atdIATestarSecao('${secId}')">
          ${lc('play', 12, 'var(--purple)')} Testar IA com esta seção
        </button>
        <button class="btn btn-primary btn-sm" onclick="_atdIASalvar('${secId}','${reg?.id || ''}')">
          ${lc('save', 12, '#fff')} Salvar
        </button>
      </div>

      <div id="atdIAPreviewBox" style="display:none;margin-top:16px;border:1px solid var(--border);border-radius:var(--r8);overflow:hidden">
        <div style="padding:8px 12px;background:var(--bg-subtle);border-bottom:1px solid var(--border);font-size:var(--text-xs);font-weight:700;color:var(--fg-muted);display:flex;align-items:center;gap:6px">
          ${lc('zap', 11, 'var(--purple)')} Testar resposta da IA
        </div>
        <div style="padding:12px;display:flex;gap:8px;align-items:flex-end">
          <input id="atdIAMsgTeste" class="inp" style="flex:1;font-size:var(--text-xs)" placeholder="Minha pizza chegou fria..."
            onkeydown="if(event.key==='Enter'){_atdIAChamarPreview('${secId}')}">
          <button class="btn btn-primary btn-sm" onclick="_atdIAChamarPreview('${secId}')">
            ${lc('send', 12, '#fff')}
          </button>
        </div>
        <div id="atdIARespostaBox" style="display:none;padding:12px;border-top:1px solid var(--border)">
          <div style="font-size:var(--text-xs);color:var(--fg-muted);margin-bottom:6px">Resposta gerada:</div>
          <div id="atdIAResposta" style="font-size:var(--text-sm);color:var(--text);line-height:1.6;white-space:pre-wrap;background:var(--success-bg);padding:10px 12px;border-radius:var(--r6)"></div>
        </div>
      </div>
    </div>`;
}

async function _atdIASalvar(secId, id) {
  const dados    = _atdIALerFormulario(secId);
  const conteudo = _atdGerarConteudoIA(secId, dados);
  if (!conteudo) { toast('Preencha pelo menos um campo antes de salvar', 'warn'); return; }

  const secInfo = _ATD_IA_SECOES.find(s => s.id === secId);
  const sb = _atdGetSbClient();
  let error;

  if (id) {
    ({ error } = await sb.from('atd_base_conhecimento').update({ conteudo, dados, atualizado_em: new Date().toISOString() }).eq('id', id));
  } else {
    ({ error } = await sb.from('atd_base_conhecimento').insert({ secao: secId, titulo: secInfo.label, conteudo, dados }));
  }

  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }
  toast(`${secInfo.label} salvo!`, 'ok');
  await _atdIARender();
  _atdIASecaoClick(secId);
}

function _atdIATestarSecao(secId) {
  const box = document.getElementById('atdIAPreviewBox');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if (box.style.display === 'block') document.getElementById('atdIAMsgTeste')?.focus();
}

async function _atdIAChamarPreview(secId) {
  const msg = document.getElementById('atdIAMsgTeste')?.value.trim();
  if (!msg) return;
  const respostaBox = document.getElementById('atdIARespostaBox');
  const respostaEl  = document.getElementById('atdIAResposta');
  respostaBox.style.display = 'block';
  respostaEl.textContent = 'Gerando resposta...';
  try {
    const res = await fetch(`${VTP_SUPABASE_URL}/functions/v1/gerar-resposta-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ mensagem: msg, secao: secId }),
    });
    const json = res.ok ? await res.json() : null;
    respostaEl.textContent = json?.resposta || '(Salve a seção e use o chat para testar — preview ainda não configurado)';
  } catch {
    respostaEl.textContent = '(Salve a seção e use o chat para testar)';
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
    <div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--radius-lg);overflow:hidden">

      <!-- cabeçalho -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:var(--text-sm);font-weight:700;color:var(--text)">${lista.length} resposta${lista.length !== 1 ? 's' : ''} rápida${lista.length !== 1 ? 's' : ''}</div>
          <div style="font-size:var(--text-xs);color:var(--fg-muted);margin-top:1px">Ativadas com <code style="background:var(--purple-xlight);color:var(--purple);padding:0 4px;border-radius:3px">/atalho</code> no campo de mensagem</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="_atdRespostaAbrirModal(null)">
          ${lc('plus', 14, '#fff')} Nova resposta
        </button>
      </div>

    ${lista.length === 0 ? `
      <div style="text-align:center;padding:48px 20px;color:var(--fg-subtle)">
        ${lc('zap', 36, 'var(--border)')}
        <div style="margin-top:12px;font-size:var(--text-sm);font-weight:600;color:var(--fg-muted)">Nenhuma resposta criada ainda</div>
        <div style="font-size:var(--text-xs);margin-top:4px;color:var(--fg-subtle)">Ex: <code style="background:var(--purple-xlight);color:var(--purple);padding:0 4px;border-radius:3px">/horario</code> → "Funcionamos de terça a dom, das 18h às 23h30!"</div>
        <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="_atdRespostaAbrirModal(null)">
          ${lc('plus', 13, '#fff')} Criar primeira resposta
        </button>
      </div>` : `
      <div>
        ${lista.map(r => `
          <div style="display:grid;grid-template-columns:140px 1fr auto;align-items:center;gap:16px;padding:12px 20px;border-bottom:1px solid var(--border);${r.ativo ? '' : 'opacity:.45;'}">
            <div>
              <code style="font-size:var(--text-xs);font-weight:700;color:var(--purple);background:var(--purple-xlight);padding:2px 8px;border-radius:4px">/${r.atalho}</code>
              ${r.canal_tipo && r.canal_tipo !== 'todos' ? `<div style="font-size:9px;color:var(--fg-subtle);margin-top:3px;text-transform:uppercase;letter-spacing:.4px">${r.canal_tipo}</div>` : ''}
            </div>
            <div style="min-width:0">
              <div style="font-weight:600;font-size:var(--text-sm);color:var(--text);margin-bottom:2px">${r.titulo}${!r.ativo ? `<span style="font-size:10px;color:var(--fg-subtle);font-weight:400;margin-left:6px">inativo</span>` : ''}</div>
              <div style="font-size:var(--text-xs);color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.conteudo}</div>
            </div>
            <div style="display:flex;gap:2px;flex-shrink:0">
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
      </div>`}
    </div>`;
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

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
  corrigirAtivoPorConversa: {}, // { [conversaId]: boolean } — desativado por padrão (economiza tokens)
};

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderOmnichannel() {
  document.getElementById('page-omnichannel').innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button id="atdTabInbox" class="atd-tab active" onclick="_atdMudarAba('inbox')">
        ${lc('message-circle', 15, 'currentColor')} Inbox
      </button>
      <button id="atdTabIntegracoes" class="atd-tab" onclick="_atdMudarAba('integracoes')">
        ${lc('link', 15, 'currentColor')} Integrações de Canais
      </button>
    </div>

    <div id="atdAbaInbox"></div>
    <div id="atdAbaIntegracoes" style="display:none"></div>

    <style>
      .atd-tab {
        display:flex; align-items:center; gap:6px; padding:8px 14px; border-radius:var(--r8); border:1px solid var(--border);
        background:var(--bg-elevated); color:var(--fg-muted); font-size:var(--text-sm); font-weight:700; cursor:pointer;
      }
      .atd-tab.active { background:var(--purple); color:#fff; border-color:var(--purple); }

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

  _atdRenderInbox();
}

function _atdMudarAba(aba) {
  const inbox = document.getElementById('atdAbaInbox');
  const integ = document.getElementById('atdAbaIntegracoes');
  document.getElementById('atdTabInbox').classList.toggle('active', aba === 'inbox');
  document.getElementById('atdTabIntegracoes').classList.toggle('active', aba === 'integracoes');
  inbox.style.display = aba === 'inbox' ? 'block' : 'none';
  integ.style.display = aba === 'integracoes' ? 'block' : 'none';

  if (aba === 'integracoes' && !integ.dataset.carregado) {
    integ.dataset.carregado = '1';
    _atdRenderIntegracoes();
  }
}

function _atdRenderInbox() {
  document.getElementById('atdAbaInbox').innerHTML = `
    <div class="atd-layout" style="display:flex;height:calc(100vh - 120px);background:var(--bg-elevated);border-radius:var(--r16);overflow:hidden;border:1px solid var(--border)">

      <!-- COLUNA A — lista de conversas -->
      <div class="atd-sidebar" style="width:280px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface2)">
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:var(--text-base);font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px;margin-bottom:10px">
            ${lc('message-circle', 18, 'var(--purple)')} Atendimento
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:10px;font-size:var(--text-xs)" onclick="_atdAbrirBuscaPedido()">
            ${lc('search', 13, '#fff')} Buscar pedido / cliente
          </button>
          <div id="atdCanalTabs" style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="atd-canal-tab active" data-canal="chat" onclick="_atdAplicarFiltro('chat')">
              Chat <span class="atd-tab-badge" id="atdBadgeChat">0</span>
            </button>
            <button class="atd-canal-tab" data-canal="avaliacoes" onclick="_atdAplicarFiltro('avaliacoes')">
              Avaliações <span class="atd-tab-badge" id="atdBadgeAvaliacoes">0</span>
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
  const { data, error } = await sb
    .from('atd_conversas')
    .select('id, status, atendente_id, canal_tipo, pedido_data, atualizado_em, mensagens_nao_lidas, ultima_mensagem, atd_contatos(nome, telefone, instagram_id, avatar_url)')
    .eq('status', 'aberta')
    .order('atualizado_em', { ascending: false });

  if (error) { console.error('[atendimento] erro ao carregar conversas', error); return; }
  _atdState.conversas = data || [];
  _atdRenderLista();
}

function _atdAplicarFiltro(filtro) {
  document.querySelectorAll('.atd-canal-tab').forEach(b => b.classList.toggle('active', b.dataset.canal === filtro));
  _atdState.filtroAtivo = filtro;
  _atdRenderLista();
}

const _ATD_CANAIS_CHAT = ['whatsapp', 'instagram'];
const _ATD_CANAIS_AVAL = ['ifood', '99food'];

function _atdRenderLista() {
  const filtro = _atdState.filtroAtivo || 'chat';
  const canais = filtro === 'avaliacoes' ? _ATD_CANAIS_AVAL : _ATD_CANAIS_CHAT;
  const lista = _atdState.conversas.filter(c => canais.includes(c.canal_tipo));

  // Atualiza badges das abas
  const totalChat = _atdState.conversas.filter(c => _ATD_CANAIS_CHAT.includes(c.canal_tipo)).reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
  const totalAval = _atdState.conversas.filter(c => _ATD_CANAIS_AVAL.includes(c.canal_tipo)).reduce((s, c) => s + (c.mensagens_nao_lidas || 0), 0);
  const badgeChat = document.getElementById('atdBadgeChat');
  const badgeAval = document.getElementById('atdBadgeAvaliacoes');
  if (badgeChat) { badgeChat.textContent = totalChat || ''; badgeChat.style.display = totalChat ? 'flex' : 'none'; }
  if (badgeAval) { badgeAval.textContent = totalAval || ''; badgeAval.style.display = totalAval ? 'flex' : 'none'; }

  const el = document.getElementById('atdListaConversas');
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--fg-subtle);font-size:var(--text-sm)">Nenhuma conversa aqui.</div>`;
    return;
  }

  const CANAL_COR = { whatsapp: '#25D366', instagram: '#E1306C', ifood: '#EA1D2C', '99food': '#FFC700' };

  el.innerHTML = lista.map(c => {
    const contato = c.atd_contatos || {};
    const nome = contato.nome || contato.telefone || (contato.instagram_id ? '@' + contato.instagram_id : 'Sem nome');
    const inicial = nome.charAt(0).toUpperCase();
    const ativa = c.id === _atdState.conversaAtivaId;
    const naoLidas = c.mensagens_nao_lidas || 0;
    const cor = CANAL_COR[c.canal_tipo] || 'transparent';

    const avatar = contato.avatar_url
      ? `<img class="conv-avatar" src="${contato.avatar_url}" alt="${inicial}" onerror="this.outerHTML='<div class=conv-avatar-inicial>${inicial}</div>'">`
      : `<div class="conv-avatar-inicial">${inicial}</div>`;

    const canalIcone = c.canal_tipo
      ? `<span style="display:flex;align-items:center;gap:3px">${_atdIconeCanal(c.canal_tipo, 13)}<span style="color:var(--fg-subtle);font-size:10px;font-weight:600;text-transform:capitalize">${c.canal_tipo}</span></span>`
      : '';

    return `
      <div class="conv-item ${ativa ? 'active' : ''}" data-canal="${c.canal_tipo || ''}" onclick="_atdAbrirConversa('${c.id}')">
        <div style="position:relative;flex-shrink:0">
          ${avatar}
          <span style="position:absolute;bottom:-1px;right:-1px;width:16px;height:16px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff">
            ${_atdIconeCanal(c.canal_tipo, 13)}
          </span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
            <div class="conv-nome" style="font-weight:700;font-size:var(--text-sm);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            ${naoLidas ? `<span class="conv-nao-lidas">${naoLidas}</span>` : ''}
          </div>
          <div style="font-size:var(--text-xs);color:var(--fg-subtle);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${c.ultima_mensagem?.origem === 'atendente' ? `<span style="color:var(--fg-subtle)">${lc('check', 10, 'var(--fg-subtle)')} </span>` : ''}${c.ultima_mensagem?.texto || (c.atendente_id ? 'atribuída' : 'sem atendente')}
          </div>
          <div style="font-size:10px;color:var(--fg-subtle);margin-top:2px;display:flex;align-items:center;gap:5px">
            ${canalIcone}
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

  // Zera não-lidas localmente e no banco
  const conv = _atdState.conversas.find(c => c.id === conversaId);
  if (conv && conv.mensagens_nao_lidas > 0) {
    conv.mensagens_nao_lidas = 0;
    _atdGetSbClient().from('atd_conversas').update({ mensagens_nao_lidas: 0 }).eq('id', conversaId).then(() => {});
  }
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

  const { data: tagsConversa } = await sb
    .from('atd_conversa_tags')
    .select('tag_id')
    .eq('conversa_id', conversaId);

  _atdState.mensagens = mensagens || [];
  _atdState.tagsConversaAtual = (tagsConversa || []).map(t => t.tag_id);
  _atdRenderChat(conversa);
  _atdRenderPainel(conversa);
}

function _atdRenderChat(conversa) {
  const nome = conversa.atd_contatos?.nome || conversa.atd_contatos?.telefone || 'Sem nome';
  const bubbles = _atdState.mensagens.map(m => {
    const classe = m.visibilidade === 'interna' ? 'interna' : (m.origem === 'cliente' ? 'cliente' : 'atendente');
    const texto = m.conteudo?.texto ?? '[mensagem não suportada]';
    const hora = new Date(m.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const prefixo = classe === 'interna' ? `${lc('lock', 11, 'var(--warning-fg)')} ` : '';
    return `<div class="msg-bubble ${classe}">${prefixo}${texto}<div style="font-size:10px;opacity:.7;margin-top:3px">${hora}</div></div>`;
  }).join('');

  _atdState.modoNotaInterna = false;
  const corrigirAtivo = !!_atdState.corrigirAtivoPorConversa[conversa.id];

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
    <div style="padding:12px 16px;border-top:1px solid var(--border);position:relative">
      <div id="atdRespostasRapidasDropdown" style="display:none;position:absolute;bottom:100%;left:16px;right:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r8);box-shadow:0 -4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;margin-bottom:6px;z-index:10"></div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <button id="atdBtnNotaInterna" class="btn btn-ghost" title="Nota interna (só a equipe vê)" style="font-size:var(--text-xs);flex-shrink:0" onclick="_atdToggleNotaInterna('${conversa.id}')">
          ${lc('lock', 14, 'var(--fg-muted)')}
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

function _atdRenderPainel(conversa) {
  const c = conversa.atd_contatos || {};
  const nome = c.nome || c.telefone || 'Sem nome';
  const pedido = conversa.pedido_data;
  const tagsAtuais = new Set(_atdState.tagsConversaAtual);

  const chipsTags = _atdState.todasTags.map(tag => {
    const ativa = tagsAtuais.has(tag.id);
    const cor = tag.cor || 'var(--purple)';
    return `<span class="atd-tag-chip" data-tag-id="${tag.id}" onclick="_atdToggleTag('${conversa.id}', '${tag.id}')"
        style="cursor:pointer;display:inline-block;padding:3px 9px;border-radius:999px;font-size:var(--text-2xs);font-weight:700;margin:0 4px 6px 0;border:1px solid ${cor};
        ${ativa ? `background:${cor};color:#fff` : `background:transparent;color:${cor}`}">${tag.nome}</span>`;
  }).join('');

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
    <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:8px">Tags</div>
      <div>${chipsTags || `<span style="font-size:var(--text-xs);color:var(--fg-subtle)">Nenhuma tag cadastrada</span>`}</div>
    </div>
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
    // Atualiza preview local imediatamente
    const convLocal = _atdState.conversas.find(c => c.id === conversaId);
    if (convLocal && visibilidade === 'publica') convLocal.ultima_mensagem = { texto, origem: 'atendente' };
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

      // Incrementa badge localmente sem esperar trigger+realtime do banco
      if (msg?.origem === 'cliente' && convId && convId !== _atdState.conversaAtivaId) {
        const conv = _atdState.conversas.find(c => c.id === convId);
        if (conv) {
          conv.mensagens_nao_lidas = (conv.mensagens_nao_lidas || 0) + 1;
          _atdRenderLista();
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

async function _atdRenderIntegracoes() {
  const wrap = document.getElementById('atdAbaIntegracoes');
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
    const r = await fetch(`${BASE}/wpp-connect?action=status`, { headers: { apikey: VTP_SUPABASE_KEY } });
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
        const r2 = await fetch(`${BASE}/wpp-connect?action=status`, { headers: { apikey: VTP_SUPABASE_KEY } });
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
    const r = await fetch(`${BASE}/wpp-connect?action=qr`, { headers: { apikey: VTP_SUPABASE_KEY } });
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

async function _atdQRDesconectar() {
  const BASE = typeof VTP_SUPABASE_URL !== 'undefined'
    ? VTP_SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1')
    : '';
  const acoesDiv = document.getElementById('atdQRAcoes');
  if (acoesDiv) acoesDiv.innerHTML = `<div style="color:var(--fg-muted);font-size:var(--text-sm)">Desconectando...</div>`;
  await fetch(`${BASE}/wpp-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: VTP_SUPABASE_KEY }, body: JSON.stringify({ action: 'disconnect' }) });
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

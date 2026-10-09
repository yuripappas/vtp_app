/**
 * VTP Compras — Vai Ter Pizza!
 * marketing.js — Módulo Marketing: Rede de Criadores/Afiliados (Gestão)
 * Criadores · Cupons · Aprovação de Conteúdo · Auditoria de Marca ·
 * Menções · Pagamentos · Ranking & Desafios
 */

let _mktPaginaAtiva = 'criadores';
window._vtpGetTab_marketing = () => _mktPaginaAtiva;
window._vtpSetTab_marketing = (v) => { _mktPaginaAtiva = v; };

let _mktSbClient = null;
function _mktGetSbClient() {
  if (!_mktSbClient) _mktSbClient = supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY);
  return _mktSbClient;
}

// Cache leve em memória — evita refetch da lista de criadores toda vez que
// um dropdown precisa dela (cupons, conteúdo, compliance, menções, desafios).
// Invalidado manualmente após qualquer escrita em mkt_creators.
const _mktCache = { creators: null };

function _mktStaffNome() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return u?.name || 'Equipe';
}

async function _mktGetCreators(force = false) {
  if (_mktCache.creators !== null && !force) return _mktCache.creators;
  const { data, error } = await _mktGetSbClient().from('mkt_creators').select('*').order('nome');
  if (error) { toast('Erro ao carregar criadores: ' + error.message, 'err'); return []; }
  _mktCache.creators = data || [];
  return _mktCache.creators;
}

function _mktStatusChip(status) {
  const map = {
    em_aprovacao: ['chip-yellow', 'Em aprovação'],
    ativo:        ['chip-green',  'Ativo'],
    pausado:      ['chip-yellow', 'Pausado'],
    encerrado:    ['chip-red',    'Encerrado'],
    reprovado:    ['chip-red',    'Reprovado'],
  };
  const [cls, label] = map[status] || ['', status];
  return `<span class="chip ${cls}">${label}</span>`;
}

// ── Modal genérico (mesmo padrão de _ppVerFicha em js/modules.js) ──
function _mktModal(title, bodyHtml, footHtml, width = 560) {
  document.getElementById('_mktModal')?.remove();
  const popup = document.createElement('div');
  popup.id = '_mktModal';
  popup.className = 'overlay open';
  popup.innerHTML = `
    <div class="modal" style="width:${width}px;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="font-size:var(--text-md);font-weight:700">${title}</div>
        <button onclick="this.closest('.overlay').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted)">${lc('x', 16, 'currentColor')}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px">${bodyHtml}</div>
      ${footHtml ? `<div style="padding:12px 20px;border-top:1px solid var(--border);flex-shrink:0;display:flex;justify-content:flex-end;gap:8px">${footHtml}</div>` : ''}
    </div>`;
  popup.onclick = e => { if (e.target === popup) popup.remove(); };
  document.body.appendChild(popup);
}
function _mktCloseModal() { document.getElementById('_mktModal')?.remove(); }

function _mktKpi(val, label, cor, icon) {
  return `
    <div class="kpi" style="border-color:${cor}33">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        ${lc(icon, 16, cor)}
        <div class="kpi-v" style="color:${cor};font-size:1.4rem">${val}</div>
      </div>
      <div class="kpi-l">${label}</div>
    </div>`;
}

function _mktHeader(title, actionsHtml) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <h2 style="font-size:1.1rem;font-weight:800;margin:0">${title}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${actionsHtml || ''}</div>
    </div>`;
}

function _mktEmpty(msg) {
  return `<div style="padding:40px;text-align:center;color:var(--muted)">
    <div class="empty-icon">${lc('inbox', 24, 'var(--muted)')}</div>
    <div style="font-size:var(--text-sm);margin-top:8px">${msg}</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════

function renderMarketing() {
  _setSubPanelActive(_mktPaginaAtiva);
  const item = (typeof _MKT_SUBMENU_ITEMS !== 'undefined' && _MKT_SUBMENU_ITEMS.find(i => i.id === _mktPaginaAtiva)) || { label: 'Marketing' };
  _setPageTitle(item.label);

  const page = document.getElementById('page-marketing');
  page.style.padding = '20px 24px';
  page.innerHTML = `<div id="mktBody">${_mktEmpty('Carregando...')}</div>`;

  switch (_mktPaginaAtiva) {
    case 'criadores':  _mktRenderCriadores();  break;
    case 'cupons':     _mktRenderCupons();     break;
    case 'conteudo':   _mktRenderConteudo();   break;
    case 'compliance': _mktRenderCompliance(); break;
    case 'mencoes':    _mktRenderMencoes();    break;
    case 'pagamentos': _mktRenderPagamentos(); break;
    case 'resgates':   _mktRenderResgates();   break;
    case 'ranking':    _mktRenderRanking();    break;
    default:           _mktRenderCriadores();
  }
}

function _mktBody(html) {
  const el = document.getElementById('mktBody');
  if (el) el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// 1. CRIADORES
// ══════════════════════════════════════════════════════════════

let _mktCriadoresFiltro = 'all';

async function _mktRenderCriadores() {
  const sb = _mktGetSbClient();
  const [{ data: creators, error: e1 }, { data: perf, error: e2 }] = await Promise.all([
    sb.from('mkt_creators').select('*').order('criado_em', { ascending: false }),
    sb.from('mkt_creator_performance').select('*'),
  ]);
  if (e1) { _mktBody(_mktEmpty('Erro ao carregar criadores: ' + e1.message)); return; }
  _mktCache.creators = creators || [];
  const perfMap = new Map((perf || []).map(p => [p.creator_id, p]));

  const emAprovacao = creators.filter(c => c.status === 'em_aprovacao').length;
  const ativos      = creators.filter(c => c.status === 'ativo').length;
  const outros      = creators.length - emAprovacao - ativos;

  const filtrados = creators.filter(c => _mktCriadoresFiltro === 'all' || c.status === _mktCriadoresFiltro);

  _mktBody(`
    ${_mktHeader('Criadores', `<button class="btn btn-primary btn-sm" onclick="_mktNovoCriadorModal()">${lc('plus', 12, '#fff')} Cadastrar criador</button>`)}
    <div class="kpi-row" style="margin-bottom:16px">
      ${_mktKpi(emAprovacao, 'Em aprovação', 'var(--yellow)', 'clock')}
      ${_mktKpi(ativos, 'Ativos', 'var(--green)', 'check-circle')}
      ${_mktKpi(outros, 'Pausados/Encerrados', 'var(--muted)', 'users')}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${['all', 'em_aprovacao', 'ativo', 'pausado', 'encerrado', 'reprovado'].map(f => `
        <button class="filter-btn ${_mktCriadoresFiltro === f ? 'active' : ''}" onclick="_mktCriadoresFiltro='${f}';_mktRenderCriadores()">
          ${f === 'all' ? 'Todos' : ({ em_aprovacao: 'Em aprovação', ativo: 'Ativos', pausado: 'Pausados', encerrado: 'Encerrados', reprovado: 'Reprovados' })[f]}
        </button>`).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${filtrados.length ? filtrados.map(c => _mktCriadorCard(c, perfMap.get(c.id))).join('') : _mktEmpty('Nenhum criador nesse filtro')}
    </div>
  `);
}

function _mktCriadorCard(c, perf) {
  const pontos = perf?.total_pontos || 0;
  const aPagar = perf?.comissao_a_pagar || 0;
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700">${c.nome}</span>
          ${_mktStatusChip(c.status)}
          ${c.nivel === 'embaixador' ? '<span class="chip" style="background:var(--orange-light);color:var(--orange-dark)">★ Embaixador</span>' : ''}
          ${c.origem === 'cadastro_manual' ? '<span class="chip">Manual</span>' : ''}
          ${c.status === 'ativo' ? (c.kit_boas_vindas_enviado
            ? '<span class="chip chip-green">Kit enviado</span>'
            : `<button class="chip" style="cursor:pointer;border:1px dashed var(--border-strong)" onclick="_mktMarcarKitEnviado('${c.id}')">${lc('gift', 10, 'currentColor')} Marcar kit enviado</button>`) : ''}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">
          ${c.telefone || '—'} ${c.instagram_handle ? '· @' + c.instagram_handle.replace(/^@/, '') : ''} ${c.nicho ? '· ' + c.nicho : ''}
        </div>
      </div>
      <div style="text-align:center;min-width:70px">
        <div style="font-weight:800;color:var(--purple)">${perf?.pedidos_validos ?? 0}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">pedidos</div>
      </div>
      <div style="text-align:center;min-width:90px">
        <div style="font-weight:800;color:var(--green)">R$ ${fmt(aPagar)}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">a pagar</div>
      </div>
      <div style="text-align:center;min-width:70px">
        <div style="font-weight:800;color:var(--orange)">${pontos}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">pontos</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        ${c.status === 'em_aprovacao' ? `
          <button class="btn btn-primary btn-sm" onclick="_mktAprovarCriadorModal('${c.id}')">${lc('check-circle', 12, '#fff')} Aprovar</button>
          <button class="btn btn-red btn-sm" onclick="_mktReprovarCriador('${c.id}')">Reprovar</button>
        ` : c.status === 'ativo' ? `
          <button class="btn btn-outline btn-sm" onclick="_mktEditarCriadorModal('${c.id}')">Editar</button>
          ${c.nivel !== 'embaixador' ? `<button class="btn btn-outline btn-sm" onclick="_mktPromoverEmbaixador('${c.id}')">★ Promover</button>` : `<button class="btn btn-outline btn-sm" onclick="_mktCampanhasEmbaixadorModal('${c.id}')">Campanhas</button>`}
          <button class="btn btn-outline btn-sm" onclick="_mktPausarCriador('${c.id}')">Pausar</button>
        ` : c.status === 'pausado' ? `
          <button class="btn btn-outline btn-sm" onclick="_mktEditarCriadorModal('${c.id}')">Editar</button>
          <button class="btn btn-primary btn-sm" onclick="_mktReativarCriador('${c.id}')">Reativar</button>
        ` : `
          <button class="btn btn-outline btn-sm" onclick="_mktEditarCriadorModal('${c.id}')">Editar</button>
        `}
      </div>
    </div>`;
}

async function _mktMarcarKitEnviado(id) {
  const { error } = await _mktGetSbClient().from('mkt_creators').update({ kit_boas_vindas_enviado: true, kit_boas_vindas_enviado_em: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Kit marcado como enviado!', 'ok');
  await _mktGetCreators(true);
  _mktRenderCriadores();
}

function _mktPromoverEmbaixador(id) {
  const c = _mktCache.creators.find(x => x.id === id);
  if (!c) return;
  vtpConfirm({
    title: 'Promover a embaixador',
    message: `${c.nome} vira embaixador da marca — participa de campanhas oficiais com cachê diferenciado e exclusividade no segmento.`,
    confirmLabel: 'Promover',
    danger: false,
    onConfirm: async () => {
      const { error } = await _mktGetSbClient().from('mkt_creators').update({
        nivel: 'embaixador', promovido_embaixador_em: new Date().toISOString(), promovido_embaixador_por: _mktStaffNome(),
      }).eq('id', id);
      if (error) { toast('Erro: ' + error.message, 'err'); return; }
      toast(`${c.nome} agora é embaixador!`, 'ok');
      if (c.telefone) _mktNotificarCriador(c.telefone, `Parabéns, ${c.nome.split(' ')[0]}! Você foi promovido a Embaixador da marca Vai Ter Pizza 🌟 Agora você participa das nossas campanhas oficiais com cachê diferenciado.`);
      await _mktGetCreators(true);
      _mktRenderCriadores();
    }
  });
}

async function _mktCampanhasEmbaixadorModal(id) {
  const c = _mktCache.creators.find(x => x.id === id);
  const { data: campanhas } = await _mktGetSbClient().from('mkt_creator_campanhas_embaixador').select('*').eq('creator_id', id).order('criado_em', { ascending: false });
  const statusMap = { planejada: '', em_andamento: 'chip-yellow', concluida: 'chip-green', cancelada: 'chip-red' };
  _mktModal(`Campanhas de embaixador — ${c?.nome || ''}`, `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${(campanhas || []).length ? campanhas.map(cp => `
        <div style="border:1px solid var(--border);border-radius:var(--r8);padding:10px 12px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong>${cp.titulo}</strong><span class="chip ${statusMap[cp.status]}">${cp.status.replace('_', ' ')}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px">${cp.periodo_inicio ? fmtD(cp.periodo_inicio) + ' — ' + fmtD(cp.periodo_fim) : ''} ${cp.cache_valor ? '· Cachê R$ ' + fmt(cp.cache_valor) : ''}</div>
          ${cp.descricao ? `<div style="font-size:var(--text-xs);margin-top:4px">${cp.descricao}</div>` : ''}
        </div>`).join('') : _mktEmpty('Nenhuma campanha registrada ainda')}
    </div>
    <div class="field"><label>Nova campanha — título</label><input class="inp" id="mktCampTitulo" placeholder="ex: Campanha Dia da Pizza"></div>
    <div class="field"><label>Descrição</label><textarea class="inp" id="mktCampDesc" rows="2"></textarea></div>
    <div class="sc-row" style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>Início</label><input class="inp" type="date" id="mktCampInicio"></div>
      <div class="field" style="flex:1"><label>Fim</label><input class="inp" type="date" id="mktCampFim"></div>
    </div>
    <div class="field"><label>Cachê (R$)</label><input class="inp" type="number" step="0.01" id="mktCampCache" placeholder="ex: 300"></div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Fechar</button>
    <button class="btn btn-primary" onclick="_mktSalvarCampanhaEmbaixador('${id}')">Criar campanha</button>
  `, 560);
}

async function _mktSalvarCampanhaEmbaixador(creatorId) {
  const titulo = document.getElementById('mktCampTitulo').value.trim();
  if (!titulo) { toast('Informe o título da campanha', 'err'); return; }
  const row = {
    creator_id: creatorId,
    titulo,
    descricao: document.getElementById('mktCampDesc').value.trim() || null,
    periodo_inicio: document.getElementById('mktCampInicio').value || null,
    periodo_fim: document.getElementById('mktCampFim').value || null,
    cache_valor: parseFloat(document.getElementById('mktCampCache').value) || null,
    criado_por: _mktStaffNome(),
  };
  const { error } = await _mktGetSbClient().from('mkt_creator_campanhas_embaixador').insert(row);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Campanha criada!', 'ok');
  _mktCampanhasEmbaixadorModal(creatorId);
}

function _mktRemuneracaoFields(c = {}) {
  return `
    <div class="field">
      <label>Tipo de remuneração</label>
      <select class="inp" id="mktCTipoRem">
        ${['comissao', 'fee_fixo', 'hibrido', 'permuta'].map(v => `<option value="${v}" ${c.tipo_remuneracao === v ? 'selected' : ''}>${{ comissao: 'Comissão por venda', fee_fixo: 'Fee fixo mensal', hibrido: 'Híbrido (fee + comissão)', permuta: 'Permuta' }[v]}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label>Comissão (%)</label>
        <input class="inp" type="number" step="0.01" id="mktCComissaoPct" value="${c.comissao_percentual ?? ''}" placeholder="ex: 10">
      </div>
      <div class="field" style="flex:1">
        <label>Fee fixo mensal (R$)</label>
        <input class="inp" type="number" step="0.01" id="mktCFeeFixo" value="${c.fee_fixo_mensal ?? ''}" placeholder="opcional">
      </div>
    </div>`;
}

function _mktAprovarCriadorModal(id) {
  const c = _mktCache.creators.find(x => x.id === id);
  if (!c) return;
  _mktModal(`Aprovar ${c.nome}`, `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;font-size:var(--text-sm);margin-bottom:14px">
      <strong>${c.nome}</strong> · ${c.telefone || '—'} · ${c.instagram_handle ? '@' + c.instagram_handle : '—'}<br>
      ${c.seguidores_instagram ? fmt(c.seguidores_instagram).replace(',00','') + ' seguidores IG · ' : ''}${c.nicho || ''}
    </div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:10px">Defina a condição comercial antes de aprovar — o cupom pode ser criado logo em seguida.</div>
    ${_mktRemuneracaoFields(c)}
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktAprovarCriador('${id}')">Aprovar criador</button>
  `);
}

async function _mktAprovarCriador(id) {
  const tipo_remuneracao   = document.getElementById('mktCTipoRem').value;
  const comissao_percentual = parseFloat(document.getElementById('mktCComissaoPct').value) || null;
  const fee_fixo_mensal     = parseFloat(document.getElementById('mktCFeeFixo').value) || null;
  const { data: creator, error } = await _mktGetSbClient().from('mkt_creators').update({
    status: 'ativo', tipo_remuneracao, comissao_percentual, fee_fixo_mensal,
    aprovado_por: _mktStaffNome(), aprovado_em: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) { toast('Erro ao aprovar: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Criador aprovado! Vamos criar o cupom dele.', 'ok');
  await _mktGetCreators(true);
  if (creator?.telefone) {
    _mktNotificarCriador(creator.telefone,
      `Parabéns, ${creator.nome.split(' ')[0]}! Seu cadastro na rede de criadores Vai Ter Pizza foi aprovado 🎉 Acesse seu painel: ${location.origin}/painel-criador.html`);
  }
  _mktNovoCupomModal(id);
}

function _mktReprovarCriador(id) {
  vtpConfirm({
    title: 'Reprovar criador',
    message: 'O cadastro será marcado como reprovado. Isso não apaga os dados.',
    confirmLabel: 'Reprovar',
    onConfirm: async () => {
      const { error } = await _mktGetSbClient().from('mkt_creators').update({ status: 'reprovado', aprovado_por: _mktStaffNome(), aprovado_em: new Date().toISOString() }).eq('id', id);
      if (error) { toast('Erro: ' + error.message, 'err'); return; }
      toast('Criador reprovado', 'ok');
      _mktRenderCriadores();
    }
  });
}

async function _mktPausarCriador(id) {
  const { error } = await _mktGetSbClient().from('mkt_creators').update({ status: 'pausado' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Criador pausado', 'ok');
  await _mktGetCreators(true);
  _mktRenderCriadores();
}

async function _mktReativarCriador(id) {
  const { error } = await _mktGetSbClient().from('mkt_creators').update({ status: 'ativo' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Criador reativado', 'ok');
  await _mktGetCreators(true);
  _mktRenderCriadores();
}

function _mktNovoCriadorModal() {
  _mktModal('Cadastrar criador', `
    <div class="field"><label>Nome</label><input class="inp" id="mktCNome" placeholder="Nome do criador"></div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>WhatsApp</label><input class="inp" id="mktCTelefone" placeholder="82999999999"></div>
      <div class="field" style="flex:1"><label>Instagram</label><input class="inp" id="mktCInstagram" placeholder="@usuario"></div>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>TikTok</label><input class="inp" id="mktCTiktok" placeholder="@usuario"></div>
      <div class="field" style="flex:1"><label>Nicho</label><input class="inp" id="mktCNicho" placeholder="ex: comida, humor local"></div>
    </div>
    ${_mktRemuneracaoFields({})}
    <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);margin-top:6px">
      <input type="checkbox" id="mktCGuideline" style="width:16px;height:16px"> Guideline aceito (assinatura/contrato à parte)
    </label>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarNovoCriador()">Cadastrar</button>
  `);
}

async function _mktSalvarNovoCriador() {
  const nome = document.getElementById('mktCNome').value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const row = {
    nome,
    telefone: document.getElementById('mktCTelefone').value.trim() || null,
    instagram_handle: document.getElementById('mktCInstagram').value.trim().replace(/^@/, '') || null,
    tiktok_handle: document.getElementById('mktCTiktok').value.trim().replace(/^@/, '') || null,
    nicho: document.getElementById('mktCNicho').value.trim() || null,
    tipo_remuneracao: document.getElementById('mktCTipoRem').value,
    comissao_percentual: parseFloat(document.getElementById('mktCComissaoPct').value) || null,
    fee_fixo_mensal: parseFloat(document.getElementById('mktCFeeFixo').value) || null,
    guideline_aceito: document.getElementById('mktCGuideline').checked,
    guideline_aceito_em: document.getElementById('mktCGuideline').checked ? new Date().toISOString() : null,
    origem: 'cadastro_manual',
    status: 'ativo',
    aprovado_por: _mktStaffNome(),
    aprovado_em: new Date().toISOString(),
  };
  const { error } = await _mktGetSbClient().from('mkt_creators').insert(row);
  if (error) { toast('Erro ao cadastrar: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Criador cadastrado!', 'ok');
  await _mktGetCreators(true);
  _mktRenderCriadores();
}

function _mktEditarCriadorModal(id) {
  const c = _mktCache.creators.find(x => x.id === id);
  if (!c) return;
  _mktModal(`Editar ${c.nome}`, `
    <div class="field"><label>Nome</label><input class="inp" id="mktCNome" value="${c.nome}"></div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>WhatsApp</label><input class="inp" id="mktCTelefone" value="${c.telefone || ''}"></div>
      <div class="field" style="flex:1"><label>Instagram</label><input class="inp" id="mktCInstagram" value="${c.instagram_handle || ''}"></div>
    </div>
    ${_mktRemuneracaoFields(c)}
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarEdicaoCriador('${id}')">Salvar</button>
  `);
}

async function _mktSalvarEdicaoCriador(id) {
  const row = {
    nome: document.getElementById('mktCNome').value.trim(),
    telefone: document.getElementById('mktCTelefone').value.trim() || null,
    instagram_handle: document.getElementById('mktCInstagram').value.trim().replace(/^@/, '') || null,
    tipo_remuneracao: document.getElementById('mktCTipoRem').value,
    comissao_percentual: parseFloat(document.getElementById('mktCComissaoPct').value) || null,
    fee_fixo_mensal: parseFloat(document.getElementById('mktCFeeFixo').value) || null,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await _mktGetSbClient().from('mkt_creators').update(row).eq('id', id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Criador atualizado', 'ok');
  await _mktGetCreators(true);
  _mktRenderCriadores();
}

// ══════════════════════════════════════════════════════════════
// 2. CUPONS (+ registrar venda manual — fallback do risco de conciliação com o CW)
// ══════════════════════════════════════════════════════════════

async function _mktRenderCupons() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const { data: cupons, error } = await sb.from('mkt_creator_coupons').select('*').order('criado_em', { ascending: false });
  if (error) { _mktBody(_mktEmpty('Erro: ' + error.message)); return; }
  const cMap = new Map(creators.map(c => [c.id, c]));

  _mktBody(`
    ${_mktHeader('Cupons', `
      <button class="btn btn-outline btn-sm" onclick="_mktRegistrarVendaManualModal()">${lc('plus', 12, 'currentColor')} Registrar venda manual</button>
      <button class="btn btn-outline btn-sm" onclick="_mktNovoCupomModal(undefined, 'uso_pessoal')">${lc('tag', 12, 'currentColor')} Cupom pessoal (clube)</button>
      <button class="btn btn-primary btn-sm" onclick="_mktNovoCupomModal()">${lc('plus', 12, '#fff')} Novo cupom</button>
    `)}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${cupons.length ? cupons.map(cp => _mktCupomCard(cp, cMap.get(cp.creator_id))).join('') : _mktEmpty('Nenhum cupom cadastrado ainda')}
    </div>
  `);
}

function _mktCupomCard(cp, creator) {
  const regras = cp.tipo === 'uso_pessoal' ? ['uso do próprio criador'] : [
    cp.valor_minimo_pedido ? `mín. R$ ${fmt(cp.valor_minimo_pedido)}` : null,
    cp.apenas_cliente_novo ? 'só cliente novo' : null,
    `limite ${cp.limite_usos_por_cliente || 1}/cliente`,
    cp.limite_usos_total ? `máx ${cp.limite_usos_total} usos` : null,
  ];
  const descontoTxt = cp.desconto_tipo === 'percentual' ? `${cp.desconto_valor}% off` : `R$ ${fmt(cp.desconto_valor)} off`;
  const regrasTxt = [descontoTxt, ...regras].filter(Boolean).join(' · ');
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:800;font-family:monospace;color:var(--purple)">${cp.codigo}</span>
          <span class="chip ${cp.ativo ? 'chip-green' : 'chip-red'}">${cp.ativo ? 'Ativo' : 'Inativo'}</span>
          ${cp.tipo === 'uso_pessoal' ? '<span class="chip" style="background:var(--orange-light);color:var(--orange-dark)">Preço de clube</span>' : ''}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${creator?.nome || '—'} · ${regrasTxt}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${cp.ativo
          ? `<button class="btn btn-outline btn-sm" onclick="_mktDesativarCupom('${cp.id}')">Desativar</button>`
          : `<button class="btn btn-outline btn-sm" onclick="_mktReativarCupom('${cp.id}')">Reativar</button>`}
      </div>
    </div>`;
}

const MKT_DESCONTO_CLUBE_PCT = 15; // preço de clube — percentual fixo pra todos (decisão fechada, fácil de ajustar aqui)

function _mktNovoCupomModal(preSelectCreatorId, tipoInicial) {
  const creators = _mktCache.creators.filter(c => c.status === 'ativo');
  const tipo = tipoInicial || 'indicacao';
  _mktModal(tipo === 'uso_pessoal' ? 'Novo cupom pessoal (clube)' : 'Novo cupom', `
    <div class="field">
      <label>Criador</label>
      <select class="inp" id="mktCpCreator">
        ${creators.map(c => `<option value="${c.id}" ${c.id === preSelectCreatorId ? 'selected' : ''}>${c.nome}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Tipo de cupom</label>
      <select class="inp" id="mktCpTipoCupom" onchange="_mktToggleTipoCupom()">
        <option value="indicacao" ${tipo === 'indicacao' ? 'selected' : ''}>Indicação (cliente usa, gera comissão)</option>
        <option value="uso_pessoal" ${tipo === 'uso_pessoal' ? 'selected' : ''}>Preço de clube (uso do próprio criador)</option>
      </select>
    </div>
    <div class="field"><label>Código do cupom</label><input class="inp" id="mktCpCodigo" style="text-transform:uppercase" placeholder="ex: MARIA10" value="${genToken().slice(0, 8)}"></div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label>Tipo de desconto</label>
        <select class="inp" id="mktCpTipo"><option value="percentual" ${tipo === 'uso_pessoal' ? 'selected' : ''}>Percentual</option><option value="valor_fixo">Valor fixo</option></select>
      </div>
      <div class="field" style="flex:1"><label>Valor</label><input class="inp" type="number" step="0.01" id="mktCpValor" placeholder="ex: 10" value="${tipo === 'uso_pessoal' ? MKT_DESCONTO_CLUBE_PCT : ''}"></div>
    </div>
    <div id="mktCpRegrasIndicacao" style="display:${tipo === 'uso_pessoal' ? 'none' : 'block'}">
      <div style="display:flex;gap:10px">
        <div class="field" style="flex:1"><label>Pedido mínimo (R$)</label><input class="inp" type="number" step="0.01" id="mktCpMinimo" placeholder="opcional"></div>
        <div class="field" style="flex:1"><label>Limite de usos por cliente</label><input class="inp" type="number" id="mktCpLimiteCliente" value="1"></div>
      </div>
      <div class="field"><label>Limite total de usos (opcional)</label><input class="inp" type="number" id="mktCpLimiteTotal" placeholder="deixe em branco = ilimitado"></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);margin-top:6px">
        <input type="checkbox" id="mktCpClienteNovo" style="width:16px;height:16px"> Apenas cliente novo (evita comissionar cliente recorrente)
      </label>
    </div>
    <div id="mktCpAvisoPessoal" style="display:${tipo === 'uso_pessoal' ? 'block' : 'none'};font-size:var(--text-xs);color:var(--muted);background:var(--surface2);border-radius:var(--r8);padding:10px 12px;margin-top:4px">
      Cupom de uso pessoal: sem limite de cliente, não gera comissão, é o único tipo que o próprio criador pode usar em si mesmo.
    </div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarNovoCupom()">Criar cupom</button>
  `);
}

function _mktToggleTipoCupom() {
  const pessoal = document.getElementById('mktCpTipoCupom').value === 'uso_pessoal';
  document.getElementById('mktCpRegrasIndicacao').style.display = pessoal ? 'none' : 'block';
  document.getElementById('mktCpAvisoPessoal').style.display = pessoal ? 'block' : 'none';
  const valorEl = document.getElementById('mktCpValor');
  if (pessoal && !valorEl.value) valorEl.value = MKT_DESCONTO_CLUBE_PCT;
}

async function _mktSalvarNovoCupom() {
  const codigo = document.getElementById('mktCpCodigo').value.trim().toUpperCase();
  const desconto_valor = parseFloat(document.getElementById('mktCpValor').value);
  const tipoCupom = document.getElementById('mktCpTipoCupom').value;
  if (!codigo) { toast('Informe o código do cupom', 'err'); return; }
  if (!desconto_valor) { toast('Informe o valor do desconto', 'err'); return; }
  const row = {
    creator_id: document.getElementById('mktCpCreator').value,
    codigo,
    tipo: tipoCupom,
    desconto_tipo: document.getElementById('mktCpTipo').value,
    desconto_valor,
    valor_minimo_pedido: tipoCupom === 'uso_pessoal' ? null : parseFloat(document.getElementById('mktCpMinimo').value) || null,
    limite_usos_por_cliente: tipoCupom === 'uso_pessoal' ? null : parseInt(document.getElementById('mktCpLimiteCliente').value) || 1,
    limite_usos_total: tipoCupom === 'uso_pessoal' ? null : parseInt(document.getElementById('mktCpLimiteTotal').value) || null,
    apenas_cliente_novo: tipoCupom === 'uso_pessoal' ? false : document.getElementById('mktCpClienteNovo').checked,
  };
  const { error } = await _mktGetSbClient().from('mkt_creator_coupons').insert(row);
  if (error) { toast('Erro ao criar cupom: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Cupom criado!', 'ok');
  _mktRenderCupons();
}

function _mktDesativarCupom(id) {
  vtpConfirm({
    title: 'Desativar cupom',
    message: 'O cupom para de funcionar imediatamente. Isso não afeta comissões já registradas.',
    confirmLabel: 'Desativar',
    onConfirm: async () => {
      const { error } = await _mktGetSbClient().from('mkt_creator_coupons').update({ ativo: false, desativado_em: new Date().toISOString() }).eq('id', id);
      if (error) { toast('Erro: ' + error.message, 'err'); return; }
      toast('Cupom desativado', 'ok');
      _mktRenderCupons();
    }
  });
}

async function _mktReativarCupom(id) {
  const { error } = await _mktGetSbClient().from('mkt_creator_coupons').update({ ativo: true, motivo_desativacao: null, desativado_em: null }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Cupom reativado', 'ok');
  _mktRenderCupons();
}

// ── Registrar venda manual — fallback caso a API do CW não exponha o cupom usado ──
async function _mktRegistrarVendaManualModal() {
  const { data: cupons } = await _mktGetSbClient().from('mkt_creator_coupons').select('*, mkt_creators(nome)').eq('ativo', true);
  _mktModal('Registrar venda manual', `
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:12px">
      Use isso quando o Cardápio Web não permitir identificar automaticamente qual cupom foi usado no pedido.
    </div>
    <div class="field">
      <label>Cupom usado</label>
      <select class="inp" id="mktRvCupom">
        ${(cupons || []).map(cp => `<option value="${cp.id}">${cp.codigo} — ${cp.mkt_creators?.nome || '—'}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>ID do pedido (Cardápio Web)</label><input class="inp" id="mktRvPedidoId" placeholder="ex: 215365234"></div>
      <div class="field" style="flex:1"><label>Valor bruto do pedido (R$)</label><input class="inp" type="number" step="0.01" id="mktRvValor"></div>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>Telefone do cliente</label><input class="inp" id="mktRvTelefone" placeholder="82999999999"></div>
      <div class="field" style="flex:1"><label>Data do pedido</label><input class="inp" type="date" id="mktRvData" value="${new Date().toISOString().slice(0, 10)}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);margin-top:6px">
      <input type="checkbox" id="mktRvClienteNovo" style="width:16px;height:16px" checked> Cliente novo (primeira compra)
    </label>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarVendaManual()">Registrar</button>
  `);
}

async function _mktSalvarVendaManual() {
  const sb = _mktGetSbClient();
  const coupon_id = document.getElementById('mktRvCupom').value;
  const pedido_id = document.getElementById('mktRvPedidoId').value.trim();
  const valor     = parseFloat(document.getElementById('mktRvValor').value);
  const telefone  = document.getElementById('mktRvTelefone').value.trim() || null;
  const clienteNovo = document.getElementById('mktRvClienteNovo').checked;
  const dataPedido  = document.getElementById('mktRvData').value;
  if (!coupon_id) { toast('Selecione um cupom', 'err'); return; }
  if (!pedido_id) { toast('Informe o ID do pedido', 'err'); return; }
  if (!valor) { toast('Informe o valor do pedido', 'err'); return; }

  const { data: cupom, error: cErr } = await sb.from('mkt_creator_coupons').select('*').eq('id', coupon_id).single();
  if (cErr || !cupom) { toast('Cupom não encontrado', 'err'); return; }

  // Valida regras do cupom antes de gravar
  let comissao_valida = true, motivo_invalidacao = null;
  if (cupom.valor_minimo_pedido && valor < cupom.valor_minimo_pedido) {
    comissao_valida = false; motivo_invalidacao = 'Abaixo do pedido mínimo do cupom';
  } else if (cupom.apenas_cliente_novo && !clienteNovo) {
    comissao_valida = false; motivo_invalidacao = 'Cupom exclusivo para cliente novo';
  } else if (telefone) {
    const { count } = await sb.from('mkt_creator_redemptions').select('id', { count: 'exact', head: true })
      .eq('coupon_id', coupon_id).eq('cliente_telefone', telefone).eq('comissao_valida', true);
    if ((count || 0) >= (cupom.limite_usos_por_cliente || 1)) {
      comissao_valida = false; motivo_invalidacao = 'Limite de usos por cliente já atingido';
    }
  }

  const creator = _mktCache.creators.find(c => c.id === cupom.creator_id);
  let comissao_calculada = 0;
  if (creator?.tipo_remuneracao === 'valor_fixo' || creator?.comissao_valor_fixo) {
    comissao_calculada = creator.comissao_valor_fixo || 0;
  } else {
    comissao_calculada = valor * ((creator?.comissao_percentual || 0) / 100);
  }

  const row = {
    creator_id: cupom.creator_id,
    coupon_id,
    pedido_id,
    pedido_valor_bruto: valor,
    base_comissionavel: valor, // comissão sobre valor bruto (decisão fechada)
    cliente_telefone: telefone,
    cliente_e_novo: clienteNovo,
    comissao_calculada: parseFloat(comissao_calculada.toFixed(2)),
    comissao_valida,
    motivo_invalidacao,
    origem: 'manual',
    registrado_por: _mktStaffNome(),
    pedido_criado_em: new Date(dataPedido).toISOString(),
  };
  const { error } = await sb.from('mkt_creator_redemptions').insert(row);
  if (error) {
    toast(error.code === '23505' ? 'Esse pedido já foi registrado antes' : 'Erro ao registrar: ' + error.message, 'err');
    return;
  }
  _mktCloseModal();
  toast(comissao_valida ? 'Venda registrada!' : `Venda registrada, mas inválida: ${motivo_invalidacao}`, comissao_valida ? 'ok' : 'warn');
  _mktRenderCupons();
}

// ══════════════════════════════════════════════════════════════
// 3. APROVAÇÃO DE CONTEÚDO
// Abas de filtro com contagem sempre visível + revisão em modal lado a lado
// (preview à esquerda, checklist/decisão + observações com timestamp à
// direita) — padrão visto na CreatorAds, adaptado sem IA pro nosso volume.
// ══════════════════════════════════════════════════════════════

let _mktContentFiltro = 'pendente';

async function _mktRenderConteudo() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const { data: itens, error } = await sb.from('mkt_creator_content').select('*').order('criado_em', { ascending: false }).limit(150);
  if (error) { _mktBody(_mktEmpty('Erro: ' + error.message)); return; }
  window._mktContentCache = itens;

  const isAprovado = i => i.aprovacao_status === 'aprovado' || i.aprovacao_status === 'aprovado_com_ajuste';
  const counts = {
    pendente:  itens.filter(i => i.aprovacao_status === 'pendente').length,
    aprovado:  itens.filter(isAprovado).length,
    reprovado: itens.filter(i => i.aprovacao_status === 'reprovado').length,
    todos:     itens.length,
  };
  const filtrados = itens.filter(i => {
    if (_mktContentFiltro === 'todos') return true;
    if (_mktContentFiltro === 'aprovado') return isAprovado(i);
    return i.aprovacao_status === _mktContentFiltro;
  });

  _mktBody(`
    ${_mktHeader('Aprovação de Conteúdo')}
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      ${[['pendente', 'Pendentes'], ['aprovado', 'Aprovados'], ['reprovado', 'Reprovados'], ['todos', 'Todos']].map(([id, label]) => `
        <button class="filter-btn ${_mktContentFiltro === id ? 'active' : ''}" onclick="_mktContentFiltro='${id}';_mktRenderConteudo()">
          ${label} <span style="opacity:.65;margin-left:3px">${counts[id]}</span>
        </button>`).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${filtrados.length ? filtrados.map(i => _mktContentCard(i, cMap.get(i.creator_id))).join('') : _mktEmpty('Nenhum conteúdo nesse filtro')}
    </div>
  `);
}

function _mktContentCard(item, creator) {
  const statusMap = { pendente: 'chip-yellow', aprovado: 'chip-green', aprovado_com_ajuste: 'chip-green', reprovado: 'chip-red' };
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${item.print_url ? `<img src="${item.print_url}" style="width:44px;height:44px;object-fit:cover;border-radius:var(--r8);flex-shrink:0">` : ''}
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700">${creator?.nome || '—'}</span>
          <span class="chip">${item.tipo}</span>
          <span class="chip ${statusMap[item.aprovacao_status]}">${item.aprovacao_status.replace(/_/g, ' ')}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:460px">${(item.roteiro_texto || '').replace(/</g, '&lt;')}</div>
      </div>
      <span style="font-size:var(--text-2xs);color:var(--muted)">${fmtDT(item.criado_em)}</span>
      <button class="btn btn-outline btn-sm" onclick="_mktAbrirRevisaoConteudo('${item.id}')">Revisar</button>
    </div>`;
}

async function _mktAbrirRevisaoConteudo(id) {
  const item = (window._mktContentCache || []).find(c => c.id === id);
  if (!item) return;
  const creator = _mktCache.creators.find(c => c.id === item.creator_id);
  const { data: notas } = await _mktGetSbClient().from('mkt_creator_content_notas').select('*').eq('content_id', id).order('criado_em', { ascending: true });

  const statusMap = { pendente: 'chip-yellow', aprovado: 'chip-green', aprovado_com_ajuste: 'chip-green', reprovado: 'chip-red' };
  const previewHtml = item.print_url
    ? `<img src="${item.print_url}" style="width:100%;border-radius:var(--r8);border:1px solid var(--border)">`
    : `<div style="background:var(--surface2);border:1px dashed var(--border);border-radius:var(--r8);padding:36px 16px;text-align:center;color:var(--muted)">
         ${lc(item.tipo === 'reels' || item.tipo === 'video_tiktok' ? 'video' : 'image', 28, 'var(--muted)')}
         <div style="font-size:var(--text-xs);margin-top:8px">Sem prévia visual ainda${item.link_publicado ? '' : ' — roteiro aguardando publicação'}</div>
       </div>`;

  _mktModal(`Revisar conteúdo — ${creator?.nome || ''}`, `
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        ${previewHtml}
        ${item.link_publicado ? `<a href="${item.link_publicado}" target="_blank" style="display:block;margin-top:8px;font-size:var(--text-xs);color:var(--purple)">Ver publicação →</a>` : ''}
      </div>
      <div style="flex:1;min-width:260px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="chip">${item.tipo}</span>
          <span class="chip ${statusMap[item.aprovacao_status]}">${item.aprovacao_status.replace(/_/g, ' ')}</span>
        </div>
        <div style="font-size:var(--text-sm);white-space:pre-wrap;background:var(--surface2);border-radius:var(--r8);padding:10px 12px;margin-bottom:14px">${(item.roteiro_texto || '—').replace(/</g, '&lt;')}</div>

        ${item.aprovacao_status === 'pendente' ? `
        <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="_mktDecidirConteudo('${id}','aprovado')">${lc('check-circle', 12, '#fff')} Aprovar</button>
          <button class="btn btn-outline btn-sm" onclick="_mktDecidirConteudo('${id}','aprovado_com_ajuste')">Aprovar c/ ajuste</button>
          <button class="btn btn-red btn-sm" onclick="_mktDecidirConteudo('${id}','reprovado')">Reprovar</button>
        </div>` : ''}

        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:6px">Observações</div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;margin-bottom:10px">
          ${(notas || []).length ? notas.map(n => `
            <div style="background:var(--surface2);border-radius:var(--r8);padding:8px 10px;font-size:var(--text-xs)">
              <div style="display:flex;justify-content:space-between;gap:8px;color:var(--muted);margin-bottom:2px">
                <strong style="color:var(--text)">${n.autor || 'Sistema'}</strong><span style="flex-shrink:0">${fmtDT(n.criado_em)}</span>
              </div>
              ${n.texto.replace(/</g, '&lt;')}
            </div>`).join('') : `<div style="color:var(--muted);font-size:var(--text-xs)">Nenhuma observação ainda</div>`}
        </div>
        <div style="display:flex;gap:6px">
          <input class="inp" id="mktNovaNota" placeholder="${item.aprovacao_status === 'pendente' ? 'Motivo da reprovação ou observação...' : 'Adicionar observação...'}" style="flex:1">
          <button class="btn btn-outline btn-sm" onclick="_mktAdicionarNota('${id}')">Enviar</button>
        </div>
      </div>
    </div>
  `, `<button class="btn btn-outline" onclick="_mktCloseModal()">Fechar</button>`, 720);
}

async function _mktDecidirConteudo(id, status) {
  const notaEl = document.getElementById('mktNovaNota');
  const notaTexto = notaEl?.value?.trim() || '';
  if (status === 'reprovado' && !notaTexto) {
    toast('Escreva o motivo da reprovação no campo de observação antes.', 'err');
    return;
  }
  const sb = _mktGetSbClient();
  const item = (window._mktContentCache || []).find(c => c.id === id);
  const creator = item ? _mktCache.creators.find(c => c.id === item.creator_id) : null;
  const staff = _mktStaffNome();

  const upd = { aprovacao_status: status, aprovado_por: staff, aprovado_em: new Date().toISOString() };
  if (status === 'reprovado') upd.motivo_reprovacao = notaTexto;
  const { error } = await sb.from('mkt_creator_content').update(upd).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }

  const labelMap = { aprovado: 'aprovou', aprovado_com_ajuste: 'aprovou com ajuste', reprovado: 'reprovou' };
  await sb.from('mkt_creator_content_notas').insert({
    content_id: id, autor: staff,
    texto: `${staff} ${labelMap[status]} este conteúdo.${notaTexto ? ' ' + notaTexto : ''}`,
  });

  toast('Conteúdo atualizado', 'ok');
  _mktCloseModal();
  _mktRenderConteudo();

  if (creator?.telefone) {
    const msgMap = {
      aprovado: 'Boa notícia! Seu conteúdo foi aprovado ✅ Pode publicar marcando @vaiterpizza.',
      aprovado_com_ajuste: `Seu conteúdo foi aprovado com um ajuste: ${notaTexto || 'confira o painel'}.`,
      reprovado: `Seu conteúdo precisou de revisão: ${notaTexto}. Dá uma olhada no seu painel e reenvia quando ajustar 🙏`,
    };
    _mktNotificarCriador(creator.telefone, msgMap[status]);
  }
}

async function _mktAdicionarNota(id) {
  const el = document.getElementById('mktNovaNota');
  const texto = el?.value?.trim();
  if (!texto) return;
  await _mktGetSbClient().from('mkt_creator_content_notas').insert({ content_id: id, autor: _mktStaffNome(), texto });
  _mktAbrirRevisaoConteudo(id);
}

// Notificação best-effort via WhatsApp — nunca bloqueia o fluxo da Gestão se falhar.
async function _mktNotificarCriador(telefone, texto) {
  try {
    await fetch(`${VTP_SUPABASE_URL}/functions/v1/mkt-notificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: VTP_SUPABASE_KEY, Authorization: `Bearer ${VTP_SUPABASE_KEY}` },
      body: JSON.stringify({ telefone, texto }),
    });
  } catch (_e) { /* best-effort */ }
}

// ══════════════════════════════════════════════════════════════
// 4. AUDITORIA DE MARCA (brand compliance) — cadência quinzenal
// ══════════════════════════════════════════════════════════════

async function _mktRenderCompliance() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const { data: audits, error } = await sb.from('mkt_creator_brand_compliance').select('*').order('revisado_em', { ascending: false }).limit(60);
  if (error) { _mktBody(_mktEmpty('Erro: ' + error.message)); return; }

  _mktBody(`
    ${_mktHeader('Auditoria de Marca', `<button class="btn btn-primary btn-sm" onclick="_mktNovaAuditoriaModal()">${lc('plus', 12, '#fff')} Nova auditoria</button>`)}
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:14px">Cadência recomendada: quinzenal por criador ativo.</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${audits.length ? audits.map(a => _mktAuditCard(a, cMap.get(a.creator_id))).join('') : _mktEmpty('Nenhuma auditoria registrada ainda')}
    </div>
  `);
}

function _mktAuditCard(a, creator) {
  const notaCor = a.nota_aderencia >= 4 ? 'var(--green)' : a.nota_aderencia === 3 ? 'var(--yellow)' : 'var(--red)';
  const acaoChip = a.acao_recomendada && a.acao_recomendada !== 'nenhuma'
    ? `<span class="chip chip-red">${a.acao_recomendada.replace(/_/g, ' ')}</span>` : '';
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="text-align:center;min-width:44px">
        <div style="font-size:1.2rem;font-weight:800;color:${notaCor}">${a.nota_aderencia ?? '—'}</div>
        <div style="font-size:var(--text-2xs);color:var(--muted)">nota</div>
      </div>
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700">${creator?.nome || '—'}</span>${acaoChip}
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${fmtDT(a.revisado_em)} · ${a.revisado_por || '—'}${a.observacoes ? ' · ' + a.observacoes : ''}</div>
      </div>
    </div>`;
}

function _mktNovaAuditoriaModal() {
  const creators = _mktCache.creators.filter(c => c.status === 'ativo');
  _mktModal('Nova auditoria de marca', `
    <div class="field">
      <label>Criador</label>
      <select class="inp" id="mktAuCreator">${creators.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}</select>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin:10px 0">
      ${[
        ['mktAuMarca', 'Mencionou a marca corretamente'],
        ['mktAuPreco', 'Seguiu o guideline de preço'],
        ['mktAuTom', 'Seguiu o guideline de tom (sem promessa indevida)'],
        ['mktAuCupomVisivel', 'Cupom visível no conteúdo'],
      ].map(([id, label]) => `<label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm)"><input type="checkbox" id="${id}" checked style="width:16px;height:16px"> ${label}</label>`).join('')}
      <label style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm)"><input type="checkbox" id="mktAuConcorrente" style="width:16px;height:16px"> Mencionou concorrente</label>
    </div>
    <div class="field">
      <label>Nota de aderência (1-5)</label>
      <select class="inp" id="mktAuNota"><option value="5">5 — excelente</option><option value="4">4 — bom</option><option value="3" selected>3 — regular</option><option value="2">2 — abaixo</option><option value="1">1 — crítico</option></select>
    </div>
    <div class="field">
      <label>Ação recomendada</label>
      <select class="inp" id="mktAuAcao">
        <option value="nenhuma">Nenhuma</option>
        <option value="alerta_informal">Alerta informal</option>
        <option value="advertencia_formal">Advertência formal</option>
        <option value="suspender_cupom">Suspender cupom</option>
        <option value="encerrar_parceria">Encerrar parceria</option>
      </select>
    </div>
    <div class="field"><label>Observações</label><textarea class="inp" id="mktAuObs" rows="2"></textarea></div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarAuditoria()">Registrar auditoria</button>
  `);
}

async function _mktSalvarAuditoria() {
  const row = {
    creator_id: document.getElementById('mktAuCreator').value,
    mencionou_marca_corretamente: document.getElementById('mktAuMarca').checked,
    seguiu_guideline_preco: document.getElementById('mktAuPreco').checked,
    seguiu_guideline_tom: document.getElementById('mktAuTom').checked,
    cupom_visivel_no_conteudo: document.getElementById('mktAuCupomVisivel').checked,
    mencionou_concorrente: document.getElementById('mktAuConcorrente').checked,
    nota_aderencia: parseInt(document.getElementById('mktAuNota').value),
    acao_recomendada: document.getElementById('mktAuAcao').value,
    observacoes: document.getElementById('mktAuObs').value.trim() || null,
    revisado_por: _mktStaffNome(),
  };
  const { error } = await _mktGetSbClient().from('mkt_creator_brand_compliance').insert(row);
  if (error) { toast('Erro ao registrar: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Auditoria registrada!' + (row.nota_aderencia >= 4 ? ' Pontos bônus concedidos.' : ''), 'ok');
  _mktRenderCompliance();
}

// ══════════════════════════════════════════════════════════════
// 5. MENÇÕES
// ══════════════════════════════════════════════════════════════

async function _mktRenderMencoes() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const { data: mencoes, error } = await sb.from('mkt_creator_mentions').select('*').order('capturado_em', { ascending: false }).limit(100);
  if (error) { _mktBody(_mktEmpty('Erro: ' + error.message)); return; }

  const naoIdentificadas = mencoes.filter(m => !m.creator_id);
  const vinculadas = mencoes.filter(m => m.creator_id);

  _mktBody(`
    ${_mktHeader('Menções', `<button class="btn btn-outline btn-sm" onclick="_mktNovaMencaoManualModal()">${lc('plus', 12, 'currentColor')} Registrar menção manual (TikTok)</button>`)}
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Não identificadas — handle não bateu com nenhum criador</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
      ${naoIdentificadas.length ? naoIdentificadas.map(m => _mktMencaoCard(m, null)).join('') : _mktEmpty('Nenhuma menção pendente de identificação')}
    </div>
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Recentes vinculadas</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${vinculadas.length ? vinculadas.slice(0, 30).map(m => _mktMencaoCard(m, cMap.get(m.creator_id))).join('') : _mktEmpty('Nenhuma menção vinculada ainda — o job de sincronização do Instagram popula isso automaticamente')}
    </div>
  `);
}

function _mktMencaoCard(m, creator) {
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="chip">${m.plataforma}</span>
      <div style="flex:1;min-width:160px">
        <div style="font-weight:700">@${m.autor_handle}${creator ? ' → ' + creator.nome : ''}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${m.tipo_mencao} · ${fmtDT(m.capturado_em)}${m.link_conteudo ? ` · <a href="${m.link_conteudo}" target="_blank" style="color:var(--purple)">ver conteúdo</a>` : ''}</div>
      </div>
      ${!creator ? `<button class="btn btn-outline btn-sm" onclick="_mktVincularMencaoModal('${m.id}','${m.autor_handle}')">Vincular a criador</button>` : ''}
    </div>`;
}

function _mktVincularMencaoModal(mentionId, handle) {
  const creators = _mktCache.creators.filter(c => c.status === 'ativo');
  _mktModal(`Vincular @${handle}`, `
    <div class="field">
      <label>Criador</label>
      <select class="inp" id="mktMenCreator">${creators.map(c => `<option value="${c.id}">${c.nome}${c.instagram_handle ? ' (@' + c.instagram_handle + ')' : ''}</option>`).join('')}</select>
    </div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktConfirmarVinculoMencao('${mentionId}')">Vincular</button>
  `);
}

async function _mktConfirmarVinculoMencao(mentionId) {
  const creator_id = document.getElementById('mktMenCreator').value;
  const { error } = await _mktGetSbClient().from('mkt_creator_mentions').update({ creator_id }).eq('id', mentionId);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Menção vinculada', 'ok');
  _mktRenderMencoes();
}

function _mktNovaMencaoManualModal() {
  const creators = _mktCache.creators.filter(c => c.status === 'ativo');
  _mktModal('Registrar menção manual', `
    <div class="field">
      <label>Criador</label>
      <select class="inp" id="mktMmCreator">${creators.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label>Plataforma</label>
        <select class="inp" id="mktMmPlataforma"><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select>
      </div>
      <div class="field" style="flex:1">
        <label>Tipo</label>
        <select class="inp" id="mktMmTipo"><option value="post">Post</option><option value="story">Story</option><option value="reels">Reels</option><option value="comentario">Comentário</option></select>
      </div>
    </div>
    <div class="field"><label>Link do conteúdo</label><input class="inp" id="mktMmLink" placeholder="https://..."></div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarMencaoManual()">Registrar</button>
  `);
}

async function _mktSalvarMencaoManual() {
  const creator_id = document.getElementById('mktMmCreator').value;
  const creator = _mktCache.creators.find(c => c.id === creator_id);
  const row = {
    creator_id,
    plataforma: document.getElementById('mktMmPlataforma').value,
    tipo_mencao: document.getElementById('mktMmTipo').value,
    autor_handle: creator?.instagram_handle || creator?.tiktok_handle || creator?.nome || 'manual',
    link_conteudo: document.getElementById('mktMmLink').value.trim() || null,
  };
  const { error } = await _mktGetSbClient().from('mkt_creator_mentions').insert(row);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Menção registrada', 'ok');
  _mktRenderMencoes();
}

// ══════════════════════════════════════════════════════════════
// 6. PAGAMENTOS
// ══════════════════════════════════════════════════════════════

async function _mktRenderPagamentos() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const [{ data: pendentes, error: e1 }, { data: payouts, error: e2 }] = await Promise.all([
    sb.from('mkt_creator_redemptions').select('*').eq('comissao_valida', true).eq('status_pagamento', 'pendente'),
    sb.from('mkt_creator_payouts').select('*').order('criado_em', { ascending: false }).limit(30),
  ]);
  if (e1) { _mktBody(_mktEmpty('Erro: ' + e1.message)); return; }

  const porCriador = new Map();
  (pendentes || []).forEach(r => {
    if (!porCriador.has(r.creator_id)) porCriador.set(r.creator_id, []);
    porCriador.get(r.creator_id).push(r);
  });

  _mktBody(`
    ${_mktHeader('Pagamentos')}
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Comissão pendente por criador</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
      ${porCriador.size ? [...porCriador.entries()].map(([cid, rs]) => _mktPagamentoPendenteCard(cid, cMap.get(cid), rs)).join('') : _mktEmpty('Nenhuma comissão pendente de fechamento')}
    </div>
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Histórico de pagamentos</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${(payouts || []).length ? payouts.map(p => _mktPayoutCard(p, cMap.get(p.creator_id))).join('') : _mktEmpty('Nenhum pagamento fechado ainda')}
    </div>
  `);
}

function _mktPagamentoPendenteCard(creatorId, creator, redemptions) {
  const total = redemptions.reduce((s, r) => s + Number(r.comissao_calculada), 0);
  window[`_mktPend_${creatorId}`] = redemptions;
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px">
        <div style="font-weight:700">${creator?.nome || '—'}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${redemptions.length} pedido(s)</div>
      </div>
      <div style="font-size:1.1rem;font-weight:800;color:var(--green)">R$ ${fmt(total)}</div>
      <button class="btn btn-primary btn-sm" onclick="_mktFecharPagamentoModal('${creatorId}')">Fechar pagamento</button>
    </div>`;
}

function _mktFecharPagamentoModal(creatorId) {
  const redemptions = window[`_mktPend_${creatorId}`] || [];
  const total = redemptions.reduce((s, r) => s + Number(r.comissao_calculada), 0);
  const creator = _mktCache.creators.find(c => c.id === creatorId);
  const datas = redemptions.map(r => r.pedido_criado_em).sort();
  _mktModal(`Fechar pagamento — ${creator?.nome || ''}`, `
    <div style="background:var(--purple-xlight);border:1.5px solid var(--purple-light);border-radius:var(--r8);padding:10px 14px;font-size:var(--text-sm);margin-bottom:14px">
      ${redemptions.length} pedido(s) · <strong>R$ ${fmt(total)}</strong>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>Período início</label><input class="inp" type="date" id="mktPgIni" value="${(datas[0] || new Date().toISOString()).slice(0, 10)}"></div>
      <div class="field" style="flex:1"><label>Período fim</label><input class="inp" type="date" id="mktPgFim" value="${(datas[datas.length - 1] || new Date().toISOString()).slice(0, 10)}"></div>
    </div>
    <div class="field">
      <label>Forma de pagamento</label>
      <select class="inp" id="mktPgForma"><option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="permuta">Permuta</option></select>
    </div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktConfirmarFechamento('${creatorId}')">Fechar pagamento (pendente)</button>
  `);
}

async function _mktConfirmarFechamento(creatorId) {
  const sb = _mktGetSbClient();
  const redemptions = window[`_mktPend_${creatorId}`] || [];
  const total = redemptions.reduce((s, r) => s + Number(r.comissao_calculada), 0);
  const payout = {
    creator_id: creatorId,
    periodo_inicio: document.getElementById('mktPgIni').value,
    periodo_fim: document.getElementById('mktPgFim').value,
    valor_total: parseFloat(total.toFixed(2)),
    qtd_pedidos: redemptions.length,
    forma_pagamento: document.getElementById('mktPgForma').value,
    status: 'aprovado',
  };
  const { data: novoPayout, error } = await sb.from('mkt_creator_payouts').insert(payout).select().single();
  if (error) { toast('Erro ao fechar pagamento: ' + error.message, 'err'); return; }

  const items = redemptions.map(r => ({ payout_id: novoPayout.id, redemption_id: r.id }));
  await sb.from('mkt_creator_payout_items').insert(items);
  await sb.from('mkt_creator_redemptions').update({ status_pagamento: 'aprovado' }).in('id', redemptions.map(r => r.id));

  _mktCloseModal();
  toast('Pagamento fechado! Marque como pago quando o PIX/transferência sair.', 'ok');
  _mktRenderPagamentos();
}

function _mktPayoutCard(p, creator) {
  const statusMap = { pendente: 'chip-yellow', aprovado: 'chip-yellow', pago: 'chip-green', cancelado: 'chip-red' };
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700">${creator?.nome || '—'}</span>
          <span class="chip ${statusMap[p.status]}">${p.status}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${fmtD(p.periodo_inicio)} — ${fmtD(p.periodo_fim)} · ${p.qtd_pedidos} pedido(s) · ${p.forma_pagamento || '—'}</div>
      </div>
      <div style="font-weight:800;color:var(--purple)">R$ ${fmt(p.valor_total)}</div>
      ${p.status !== 'pago' ? `<button class="btn btn-primary btn-sm" onclick="_mktMarcarPago('${p.id}')">Marcar como pago</button>` : ''}
    </div>`;
}

async function _mktMarcarPago(payoutId) {
  const sb = _mktGetSbClient();
  const { data: payout, error } = await sb.from('mkt_creator_payouts').update({ status: 'pago', pago_em: new Date().toISOString(), pago_por: _mktStaffNome() }).eq('id', payoutId).select().single();
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  const { data: items } = await sb.from('mkt_creator_payout_items').select('redemption_id').eq('payout_id', payoutId);
  if (items?.length) {
    await sb.from('mkt_creator_redemptions').update({ status_pagamento: 'pago' }).in('id', items.map(i => i.redemption_id));
  }
  toast('Pagamento marcado como pago', 'ok');
  _mktRenderPagamentos();

  const creator = _mktCache.creators.find(c => c.id === payout.creator_id);
  if (creator?.telefone) {
    _mktNotificarCriador(creator.telefone,
      `Seu pagamento de R$ ${fmt(payout.valor_total)} referente ao período ${fmtD(payout.periodo_inicio)}–${fmtD(payout.periodo_fim)} foi confirmado 💰`);
  }
}

// ══════════════════════════════════════════════════════════════
// 6.5 RESGATES — pontos trocados por PIX ou produto (1 ponto = R$1)
// ══════════════════════════════════════════════════════════════

async function _mktRenderResgates() {
  const sb = _mktGetSbClient();
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const { data: resgates, error } = await sb.from('mkt_creator_resgates').select('*').order('solicitado_em', { ascending: false }).limit(150);
  if (error) { _mktBody(_mktEmpty('Erro: ' + error.message)); return; }

  const pendentes = resgates.filter(r => r.status === 'solicitado');
  const outros = resgates.filter(r => r.status !== 'solicitado');

  _mktBody(`
    ${_mktHeader('Resgates', '')}
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:14px">1 ponto = R$1 · resgate em PIX ou produto</div>
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Aguardando aprovação</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
      ${pendentes.length ? pendentes.map(r => _mktResgateCard(r, cMap.get(r.creator_id))).join('') : _mktEmpty('Nenhum resgate pendente')}
    </div>
    <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Histórico</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${outros.length ? outros.map(r => _mktResgateCard(r, cMap.get(r.creator_id))).join('') : _mktEmpty('Sem histórico ainda')}
    </div>
  `);
}

function _mktResgateCard(r, creator) {
  const statusMap = { solicitado: 'chip-yellow', aprovado: 'chip-yellow', pago: 'chip-green', recusado: 'chip-red' };
  const detalhe = r.tipo === 'pix' ? `PIX · R$ ${fmt(r.valor_pix)}` : `Produto: ${r.produto_descricao || '—'}`;
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700">${creator?.nome || '—'}</span>
          <span class="chip ${statusMap[r.status]}">${r.status}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${r.pontos_utilizados} pontos · ${detalhe} · ${fmtDT(r.solicitado_em)}</div>
      </div>
      ${r.status === 'solicitado' ? `
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="_mktProcessarResgate('${r.id}','aprovado')">Aprovar</button>
          <button class="btn btn-red btn-sm" onclick="_mktRecusarResgateModal('${r.id}')">Recusar</button>
        </div>` : r.status === 'aprovado' ? `
        <button class="btn btn-primary btn-sm" onclick="_mktProcessarResgate('${r.id}','pago')">Marcar pago</button>` : ''}
    </div>`;
}

async function _mktProcessarResgate(id, status) {
  const sb = _mktGetSbClient();
  const { data: resgate, error } = await sb.from('mkt_creator_resgates').update({
    status, processado_em: new Date().toISOString(), processado_por: _mktStaffNome(),
  }).eq('id', id).select().single();
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast(status === 'pago' ? 'Resgate marcado como pago!' : 'Resgate aprovado!', 'ok');
  _mktRenderResgates();

  const creator = _mktCache.creators.find(c => c.id === resgate.creator_id);
  if (creator?.telefone && status === 'pago') {
    const msg = resgate.tipo === 'pix'
      ? `Seu resgate de ${resgate.pontos_utilizados} pontos (R$ ${fmt(resgate.valor_pix)}) foi pago via PIX! 💰`
      : `Seu resgate de ${resgate.pontos_utilizados} pontos por "${resgate.produto_descricao}" foi confirmado! 🎁`;
    _mktNotificarCriador(creator.telefone, msg);
  }
}

function _mktRecusarResgateModal(id) {
  _mktModal('Recusar resgate', `
    <div class="field"><label>Motivo</label><textarea class="inp" id="mktResgateMotivo" rows="3" placeholder="explique o motivo pro criador"></textarea></div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-red" onclick="_mktConfirmarRecusaResgate('${id}')">Recusar</button>
  `);
}

async function _mktConfirmarRecusaResgate(id) {
  const motivo = document.getElementById('mktResgateMotivo').value.trim();
  const sb = _mktGetSbClient();
  const { data: resgate, error } = await sb.from('mkt_creator_resgates').update({
    status: 'recusado', observacoes: motivo, processado_em: new Date().toISOString(), processado_por: _mktStaffNome(),
  }).eq('id', id).select().single();
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  _mktCloseModal();
  toast('Resgate recusado', 'ok');
  _mktRenderResgates();
  const creator = _mktCache.creators.find(c => c.id === resgate.creator_id);
  if (creator?.telefone) {
    _mktNotificarCriador(creator.telefone, `Seu pedido de resgate de ${resgate.pontos_utilizados} pontos não foi aprovado: ${motivo || 'fale com a equipe'}.`);
  }
}

// ══════════════════════════════════════════════════════════════
// 7. RANKING & DESAFIOS
// ══════════════════════════════════════════════════════════════

async function _mktRenderRanking() {
  const sb = _mktGetSbClient();
  const [{ data: perf, error: e1 }, { data: challenges, error: e2 }] = await Promise.all([
    sb.from('mkt_creator_performance').select('*').order('total_pontos', { ascending: false }),
    sb.from('mkt_creator_challenges').select('*').order('status').order('periodo_fim', { ascending: false }),
  ]);
  if (e1) { _mktBody(_mktEmpty('Erro: ' + e1.message)); return; }
  window._mktChallenges = challenges || [];

  _mktBody(`
    ${_mktHeader('Ranking')}
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:28px">
      ${(perf || []).filter(p => p.status === 'ativo').map((p, i) => `
        <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:10px 16px;display:flex;align-items:center;gap:14px">
          <div style="font-weight:800;color:${i === 0 ? 'var(--orange)' : 'var(--muted)'};min-width:24px;text-align:center">${i + 1}º</div>
          <div style="flex:1;font-weight:700">${p.nome}</div>
          <div style="text-align:center;min-width:70px"><div style="font-weight:800">${p.pedidos_validos}</div><div style="font-size:var(--text-2xs);color:var(--muted)">pedidos</div></div>
          <div style="text-align:center;min-width:70px"><div style="font-weight:800;color:var(--orange)">${p.total_pontos}</div><div style="font-size:var(--text-2xs);color:var(--muted)">pontos</div></div>
        </div>`).join('') || _mktEmpty('Nenhum criador ativo ainda')}
    </div>

    ${_mktHeader('Desafios', `<button class="btn btn-primary btn-sm" onclick="_mktNovoDesafioModal()">${lc('plus', 12, '#fff')} Novo desafio</button>`)}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${(challenges || []).length ? challenges.map(c => _mktDesafioCard(c)).join('') : _mktEmpty('Nenhum desafio criado ainda')}
    </div>
  `);
}

function _mktDesafioCard(c) {
  const statusMap = { ativo: 'chip-green', encerrado: 'chip', cancelado: 'chip-red' };
  const premioTxt = c.premio_tipo === 'nenhum' ? '' : ` · prêmio: ${c.premio_descricao || c.premio_tipo}${c.premio_valor ? ' (R$ ' + fmt(c.premio_valor) + ')' : ''}`;
  return `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <span style="font-weight:700">${c.titulo}</span>
        <span class="chip ${statusMap[c.status]}">${c.status}</span>
        <span style="font-size:var(--text-2xs);color:var(--muted);margin-left:auto">${fmtD(c.periodo_inicio)} — ${fmtD(c.periodo_fim)}</span>
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:8px">${c.descricao || ''} · ${c.pontos_recompensa} pontos${premioTxt}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="_mktVerParticipantesDesafio('${c.id}')">Ver participantes</button>
        ${c.tipo_criterio !== 'manual' ? `<button class="btn btn-outline btn-sm" onclick="_mktRecalcularDesafio('${c.id}')">Recalcular progresso</button>` : ''}
        ${c.status === 'ativo' ? `<button class="btn btn-outline btn-sm" onclick="_mktEncerrarDesafio('${c.id}')">Encerrar</button>` : ''}
      </div>
    </div>`;
}

function _mktNovoDesafioModal() {
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  _mktModal('Novo desafio', `
    <div class="field"><label>Título</label><input class="inp" id="mktDsTitulo" placeholder="ex: Bata 20 pedidos em 2 semanas"></div>
    <div class="field"><label>Descrição</label><textarea class="inp" id="mktDsDesc" rows="2"></textarea></div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label>Critério</label>
        <select class="inp" id="mktDsCriterio" onchange="document.getElementById('mktDsMetaWrap').style.display=this.value==='manual'?'none':'block'">
          <option value="pedidos_periodo">Nº de pedidos no período</option>
          <option value="conteudo_postado">Nº de conteúdos aprovados no período</option>
          <option value="manual">Manual (gestão marca)</option>
        </select>
      </div>
      <div class="field" style="flex:1" id="mktDsMetaWrap"><label>Meta</label><input class="inp" type="number" id="mktDsMeta" placeholder="ex: 20"></div>
    </div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>Início</label><input class="inp" type="date" id="mktDsInicio" value="${hoje}"></div>
      <div class="field" style="flex:1"><label>Fim</label><input class="inp" type="date" id="mktDsFim" value="${em30}"></div>
    </div>
    <div class="field"><label>Pontos de recompensa</label><input class="inp" type="number" id="mktDsPontos" value="100"></div>
    <div style="display:flex;gap:10px">
      <div class="field" style="flex:1">
        <label>Tipo de prêmio</label>
        <select class="inp" id="mktDsPremioTipo"><option value="nenhum">Nenhum (só pontos)</option><option value="pix">PIX</option><option value="permuta">Permuta</option><option value="bonus">Bônus</option></select>
      </div>
      <div class="field" style="flex:1"><label>Valor do prêmio (R$)</label><input class="inp" type="number" step="0.01" id="mktDsPremioValor" placeholder="opcional"></div>
    </div>
    <div class="field"><label>Descrição do prêmio</label><input class="inp" id="mktDsPremioDesc" placeholder="ex: R$50 no PIX, pizza grátis..."></div>
  `, `
    <button class="btn btn-outline" onclick="_mktCloseModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="_mktSalvarDesafio()">Criar desafio</button>
  `);
}

async function _mktSalvarDesafio() {
  const sb = _mktGetSbClient();
  const titulo = document.getElementById('mktDsTitulo').value.trim();
  if (!titulo) { toast('Informe o título', 'err'); return; }
  const challenge = {
    titulo,
    descricao: document.getElementById('mktDsDesc').value.trim() || null,
    tipo_criterio: document.getElementById('mktDsCriterio').value,
    meta_valor: parseFloat(document.getElementById('mktDsMeta').value) || null,
    periodo_inicio: document.getElementById('mktDsInicio').value,
    periodo_fim: document.getElementById('mktDsFim').value,
    pontos_recompensa: parseInt(document.getElementById('mktDsPontos').value) || 0,
    premio_tipo: document.getElementById('mktDsPremioTipo').value,
    premio_valor: parseFloat(document.getElementById('mktDsPremioValor').value) || null,
    premio_descricao: document.getElementById('mktDsPremioDesc').value.trim() || null,
    criado_por: _mktStaffNome(),
  };
  const { data: novo, error } = await sb.from('mkt_creator_challenges').insert(challenge).select().single();
  if (error) { toast('Erro ao criar desafio: ' + error.message, 'err'); return; }

  // Inscreve todos os criadores ativos automaticamente
  const creators = await _mktGetCreators();
  const ativos = creators.filter(c => c.status === 'ativo');
  if (ativos.length) {
    await sb.from('mkt_creator_challenge_progress').insert(
      ativos.map(c => ({ creator_id: c.id, challenge_id: novo.id }))
    );
  }
  _mktCloseModal();
  toast('Desafio criado! Todos os criadores ativos já foram inscritos.', 'ok');
  _mktRenderRanking();
}

async function _mktEncerrarDesafio(id) {
  const { error } = await _mktGetSbClient().from('mkt_creator_challenges').update({ status: 'encerrado' }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Desafio encerrado', 'ok');
  _mktRenderRanking();
}

// Progresso automático: conta redemptions válidas ou conteúdos aprovados no
// período do desafio e atualiza cada participante — marca concluído se bateu a meta.
async function _mktRecalcularDesafio(challengeId) {
  const sb = _mktGetSbClient();
  const challenge = (window._mktChallenges || []).find(c => c.id === challengeId);
  if (!challenge) return;
  const { data: progresso } = await sb.from('mkt_creator_challenge_progress').select('*').eq('challenge_id', challengeId);
  if (!progresso?.length) { toast('Nenhum participante inscrito', 'warn'); return; }

  for (const p of progresso) {
    if (p.status === 'concluido') continue;
    let valor = 0;
    if (challenge.tipo_criterio === 'pedidos_periodo') {
      const { count } = await sb.from('mkt_creator_redemptions').select('id', { count: 'exact', head: true })
        .eq('creator_id', p.creator_id).eq('comissao_valida', true)
        .gte('pedido_criado_em', challenge.periodo_inicio).lte('pedido_criado_em', challenge.periodo_fim + 'T23:59:59');
      valor = count || 0;
    } else if (challenge.tipo_criterio === 'conteudo_postado') {
      const { count } = await sb.from('mkt_creator_content').select('id', { count: 'exact', head: true })
        .eq('creator_id', p.creator_id).in('aprovacao_status', ['aprovado', 'aprovado_com_ajuste'])
        .gte('publicado_em', challenge.periodo_inicio).lte('publicado_em', challenge.periodo_fim + 'T23:59:59');
      valor = count || 0;
    } else continue;

    const bateuMeta = challenge.meta_valor && valor >= challenge.meta_valor;
    await sb.from('mkt_creator_challenge_progress').update({
      progresso_atual: valor,
      status: bateuMeta ? 'concluido' : 'em_andamento',
      concluido_em: bateuMeta ? new Date().toISOString() : null,
    }).eq('id', p.id);
  }
  toast('Progresso recalculado!', 'ok');
  _mktVerParticipantesDesafio(challengeId);
}

async function _mktVerParticipantesDesafio(challengeId) {
  const sb = _mktGetSbClient();
  const challenge = (window._mktChallenges || []).find(c => c.id === challengeId);
  const creators = await _mktGetCreators();
  const cMap = new Map(creators.map(c => [c.id, c]));
  const { data: progresso, error } = await sb.from('mkt_creator_challenge_progress').select('*').eq('challenge_id', challengeId);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }

  _mktModal(`Participantes — ${challenge?.titulo || ''}`, `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${(progresso || []).map(p => {
        const creator = cMap.get(p.creator_id);
        const statusChip = { em_andamento: 'chip-yellow', concluido: 'chip-green', expirado: 'chip-red' }[p.status];
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r8)">
            <div style="flex:1">
              <div style="font-weight:600">${creator?.nome || '—'}</div>
              <div style="font-size:var(--text-2xs);color:var(--muted)">progresso: ${p.progresso_atual || 0}${challenge?.meta_valor ? ' / ' + challenge.meta_valor : ''}</div>
            </div>
            <span class="chip ${statusChip}">${p.status.replace('_', ' ')}</span>
            ${p.status !== 'concluido' && challenge?.tipo_criterio === 'manual' ? `<button class="btn btn-primary btn-sm" onclick="_mktMarcarDesafioConcluido('${p.id}','${challengeId}')">Marcar concluído</button>` : ''}
            ${p.status === 'concluido' && challenge?.premio_tipo !== 'nenhum' && !p.premio_entregue ? `<button class="btn btn-outline btn-sm" onclick="_mktMarcarPremioEntregue('${p.id}','${challengeId}')">Marcar prêmio entregue</button>` : ''}
            ${p.premio_entregue ? `<span class="chip chip-green">Prêmio entregue</span>` : ''}
          </div>`;
      }).join('') || _mktEmpty('Nenhum participante')}
    </div>
  `, `<button class="btn btn-outline" onclick="_mktCloseModal()">Fechar</button>`);
}

async function _mktMarcarDesafioConcluido(progressId, challengeId) {
  const { error } = await _mktGetSbClient().from('mkt_creator_challenge_progress').update({
    status: 'concluido', concluido_em: new Date().toISOString(), marcado_manualmente_por: _mktStaffNome(),
  }).eq('id', progressId);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Desafio marcado como concluído! Pontos concedidos.', 'ok');
  _mktVerParticipantesDesafio(challengeId);
}

async function _mktMarcarPremioEntregue(progressId, challengeId) {
  const { error } = await _mktGetSbClient().from('mkt_creator_challenge_progress').update({
    premio_entregue: true, premio_entregue_em: new Date().toISOString(),
  }).eq('id', progressId);
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  toast('Prêmio marcado como entregue', 'ok');
  _mktVerParticipantesDesafio(challengeId);
}

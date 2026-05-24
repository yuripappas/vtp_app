/**
 * VTP — Vai Ter Pizza!
 * checklist.js — Módulo de Checklist Operacional
 */

// ══════════════════════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════════════════════
const _getCkTemplates  = () => db._get('vtp_ck_templates', null) || _ckTemplatesDefault();
const _saveCkTemplates = t  => db._set('vtp_ck_templates', t);
const _getCkSessoes    = () => db._get('vtp_ck_sessoes', []);
const _saveCkSessoes   = s  => db._set('vtp_ck_sessoes', s);

let _ckTab = 'meu'; // 'meu' | 'equipe' | 'templates'

// ══════════════════════════════════════════════════════════════
// TEMPLATES PADRÃO
// ══════════════════════════════════════════════════════════════
function _ckTemplatesDefault() {
  return [
    {
      id: 1,
      nome: 'Pizzaiolo — Abertura',
      funcao: 'pizzaiolo',
      turno: 'abertura',
      cor: 'var(--red)', bg: 'var(--red-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Verificar temperatura do forno principal',            horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Conferir estoque de massas abertas',                  horario:'17:00', obrigatorio:true  },
        { id:3, texto:'Organizar bancada de trabalho e utensílios',          horario:'17:00', obrigatorio:true  },
        { id:4, texto:'Verificar nível de gás',                              horario:'17:00', obrigatorio:true  },
        { id:5, texto:'Conferir estoque de insumos (queijo, calabresa, etc)',horario:'17:15', obrigatorio:true  },
        { id:6, texto:'Ligar e testar equipamentos (forno, divisora)',       horario:'17:15', obrigatorio:true  },
        { id:7, texto:'Verificar limpeza dos carrinhos de massa',            horario:'17:20', obrigatorio:false },
      ]
    },
    {
      id: 2,
      nome: 'Pizzaiolo — Fechamento',
      funcao: 'pizzaiolo',
      turno: 'fechamento',
      cor: 'var(--red)', bg: 'var(--red-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Desligar fornos e equipamentos',                      horario:'23:30', obrigatorio:true  },
        { id:2, texto:'Limpar e organizar bancada de trabalho',              horario:'23:30', obrigatorio:true  },
        { id:3, texto:'Guardar insumos sobressalentes na câmara fria',       horario:'23:30', obrigatorio:true  },
        { id:4, texto:'Registrar sobra de massas (quantidade)',              horario:'23:45', obrigatorio:true  },
        { id:5, texto:'Higienizar utensílios e formas',                      horario:'23:45', obrigatorio:true  },
        { id:6, texto:'Verificar se câmara fria está fechada',               horario:'00:00', obrigatorio:true  },
      ]
    },
    {
      id: 3,
      nome: 'Pré-Produção — Diário',
      funcao: 'preproducao',
      turno: 'producao',
      cor: 'var(--purple)', bg: 'var(--purple-xlight)',
      ativo: true,
      itens: [
        { id:1, texto:'Verificar ordens de produção do dia',                 horario:'14:00', obrigatorio:true  },
        { id:2, texto:'Separar e pesar insumos para preparo',                horario:'14:15', obrigatorio:true  },
        { id:3, texto:'Preparar frango (cozinhar e desfiar)',                horario:'14:30', obrigatorio:false },
        { id:4, texto:'Preparar carne de sol',                               horario:'15:00', obrigatorio:false },
        { id:5, texto:'Preparar brigadeiros e cremes',                       horario:'15:30', obrigatorio:false },
        { id:6, texto:'Etiquetar e armazenar preparados com data',           horario:'16:30', obrigatorio:true  },
        { id:7, texto:'Registrar quantidades produzidas',                    horario:'16:45', obrigatorio:true  },
        { id:8, texto:'Higienizar área de produção',                         horario:'17:00', obrigatorio:true  },
      ]
    },
    {
      id: 4,
      nome: 'Atendimento — Abertura',
      funcao: 'atendimento',
      turno: 'abertura',
      cor: 'var(--green)', bg: 'var(--green-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Ligar sistema de pedidos (cardápio web)',             horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Verificar impressora de pedidos',                     horario:'17:00', obrigatorio:true  },
        { id:3, texto:'Conferir troco do caixa',                             horario:'17:00', obrigatorio:true  },
        { id:4, texto:'Atualizar cardápio / pausar itens em falta',         horario:'17:10', obrigatorio:true  },
        { id:5, texto:'Verificar funcionamento do delivery (iFood, CW)',    horario:'17:15', obrigatorio:true  },
        { id:6, texto:'Checar disponibilidade dos motoboys',                horario:'17:15', obrigatorio:true  },
      ]
    },
    {
      id: 5,
      nome: 'Atendimento — Fechamento',
      funcao: 'atendimento',
      turno: 'fechamento',
      cor: 'var(--green)', bg: 'var(--green-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Pausar todos os canais de venda',                    horario:'23:00', obrigatorio:true  },
        { id:2, texto:'Fechar caixa e conferir valores',                    horario:'23:15', obrigatorio:true  },
        { id:3, texto:'Registrar total de pedidos e faturamento do dia',    horario:'23:30', obrigatorio:true  },
        { id:4, texto:'Enviar relatório diário para gerência',              horario:'23:45', obrigatorio:false },
        { id:5, texto:'Desligar sistema e equipamentos de atendimento',     horario:'00:00', obrigatorio:true  },
      ]
    },
    {
      id: 6,
      nome: 'Auxiliar de Cozinha — Turno',
      funcao: 'auxiliar',
      turno: 'turno',
      cor: 'var(--yellow)', bg: 'var(--yellow-light)',
      ativo: true,
      itens: [
        { id:1, texto:'Higienizar bancadas e equipamentos',                 horario:'17:00', obrigatorio:true  },
        { id:2, texto:'Repor material de limpeza',                          horario:'17:00', obrigatorio:false },
        { id:3, texto:'Lavar e organizar louças e utensílios',              horario:'Contínuo', obrigatorio:true },
        { id:4, texto:'Manter área de descarte organizada',                 horario:'Contínuo', obrigatorio:true },
        { id:5, texto:'Apoiar pré-produção conforme demanda',               horario:'Contínuo', obrigatorio:false},
        { id:6, texto:'Limpeza geral ao final do turno',                   horario:'23:30', obrigatorio:true  },
      ]
    },
    {
      id: 7,
      nome: 'Compras e Estoque — Diário',
      funcao: 'compras',
      turno: 'diario',
      cor: 'var(--chart-2)', bg: '#EFF6FF',
      ativo: true,
      itens: [
        { id:1, texto:'Conferir estoque e atualizar sistema',               horario:'09:00', obrigatorio:true  },
        { id:2, texto:'Verificar itens críticos e gerar lista de compras',  horario:'09:30', obrigatorio:true  },
        { id:3, texto:'Contatar fornecedores para pedidos urgentes',        horario:'10:00', obrigatorio:false },
        { id:4, texto:'Receber e conferir entregas do dia',                 horario:'Conforme chegada', obrigatorio:true },
        { id:5, texto:'Registrar entradas no sistema',                      horario:'Conforme chegada', obrigatorio:true },
        { id:6, texto:'Organizar estoque por validade (PVPS)',              horario:'Conforme chegada', obrigatorio:true },
      ]
    },
  ];
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════
function renderChecklist() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isGestor = u?.role === 'gerente' || u?.role === 'supervisor';
  _ckAutoAssign();

  const el = document.getElementById('checklistContent');
  if (!el) return;

  // Tabs
  el.innerHTML = `
    <div class="tab-bar" style="position:sticky;top:0;z-index:10;justify-content:space-between">
      <div style="display:flex">
        <button onclick="setCkTab('meu')"       id="ckTab-meu"       class="tab-btn ${_ckTab==='meu'?'active':''}">
          ${lc('check-square',13,'currentColor')} Meu Checklist
        </button>
        ${isGestor ? `
        <button onclick="setCkTab('equipe')"    id="ckTab-equipe"    class="tab-btn ${_ckTab==='equipe'?'active':''}">
          ${lc('users',13,'currentColor')} Equipe
          <span id="ckBadgeEquipe" class="sb-badge" style="display:none"></span>
        </button>
        <button onclick="setCkTab('templates')" id="ckTab-templates" class="tab-btn ${_ckTab==='templates'?'active':''}">
          ${lc('layout',13,'currentColor')} Templates
        </button>
        <button onclick="setCkTab('dashboard')" id="ckTab-dashboard" class="tab-btn ${_ckTab==='dashboard'?'active':''}">
          ${lc('bar-chart-2',13,'currentColor')} Ranking
        </button>` : ''}
      </div>
      <div style="padding:8px 0;flex-shrink:0">
        ${isGestor ? `
          <button onclick="abrirModalNovaInstancia()" class="btn btn-primary btn-sm" style="gap:6px">
            ${lc('plus',13,'currentColor')} Atribuir checklist
          </button>` : ''}
      </div>
    </div>
    <div id="ckPanelContent" style="padding:20px 24px"></div>`;

  _renderCkTab();
  _atualizarBadgeEquipe();
}

function setCkTab(tab) {
  _ckTab = tab;
  renderChecklist();
}

function _renderCkTab() {
  if (_ckTab === 'meu')            _renderCkMeu();
  else if (_ckTab === 'equipe')    _renderCkEquipe();
  else if (_ckTab === 'templates') _renderCkTemplates();
  else if (_ckTab === 'dashboard') _renderCkDashboard();
}

// ══════════════════════════════════════════════════════════════
// ABA: MEU CHECKLIST
// ══════════════════════════════════════════════════════════════
function _renderCkMeu() {
  const u        = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const el       = document.getElementById('ckPanelContent');
  const hoje     = new Date().toISOString().slice(0,10);
  const sessoes  = _getCkSessoes().filter(s => s.userId === u?.id && s.data === hoje);
  const all      = _getCkSessoes();
  // Instâncias atribuídas a este usuário hoje
  const instancias = all.filter(s => s.userId === u?.id && s.data === hoje);

  const now   = new Date();
  const hora  = now.getHours();
  const saud  = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  el.innerHTML = `
    <div style="max-width:680px;margin:0 auto">
      <!-- Saudação mobile-friendly -->
      <div style="text-align:center;padding:16px 0 20px">
        <div style="font-size:1.4rem;font-weight:800;margin-bottom:4px">${saud}, ${u?.name?.split(' ')[0] || 'você'}!</div>
        <div style="font-size:var(--text-sm);color:var(--muted)">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>

      ${instancias.length === 0 ? (() => {
        const historico = _getCkSessoes()
          .filter(s => s.userId === u?.id && s.data !== hoje && s.status === 'concluido')
          .sort((a, b) => (b.concluidoEm || b.data) > (a.concluidoEm || a.data) ? 1 : -1)
          .slice(0, 3);
        return `
        <div style="text-align:center;padding:36px 20px 24px;background:var(--surface2);border-radius:var(--r12);border:1.5px dashed var(--border)">
          ${lc('check-square',32,'var(--muted)')}
          <div style="font-size:var(--text-md);font-weight:700;margin-top:12px;margin-bottom:4px">Nenhum checklist para hoje</div>
          <div style="font-size:var(--text-sm);color:var(--muted)">Aguarde seu supervisor atribuir as tarefas do dia</div>
        </div>
        ${historico.length > 0 ? `
        <div style="margin-top:20px">
          <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
            ${lc('history',12,'var(--muted)')} Últimos concluídos
          </div>
          ${historico.map(s => {
            const t = _getCkTemplates().find(x => x.id === s.templateId);
            if (!t) return '';
            const total = t.itens.length;
            const feitos = Object.keys(s.respostas||{}).length;
            const pct = total > 0 ? Math.round(feitos/total*100) : 0;
            const cor = t.cor || 'var(--purple)';
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border-radius:var(--r8);border:1px solid var(--border);margin-bottom:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.nome}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${s.data ? new Date(s.data+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}) : ''}</div>
              </div>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                ${lc('check-circle',13,'var(--green)')}
                <span style="font-size:var(--text-xs);font-weight:700;color:var(--green)">${pct}%</span>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}`;
      })() : instancias.map(inst => _cardInstanciaFuncionario(inst)).join('')}
    </div>`;
}

function _cardInstanciaFuncionario(inst) {
  const tmpl  = _getCkTemplates().find(t => t.id === inst.templateId);
  if (!tmpl) return '';
  const total    = tmpl.itens.length;
  const feitos   = Object.keys(inst.respostas||{}).length;
  const pct      = total > 0 ? Math.round(feitos/total*100) : 0;
  const concluido= pct === 100 || !!inst.concluidoEm;
  const cor      = concluido ? 'var(--green)' : (tmpl.cor || 'var(--purple)');

  return `
  <div style="margin-bottom:16px;border-radius:var(--r12);overflow:hidden;border:1.5px solid ${cor}">
    <!-- Header sólido colorido -->
    <div style="padding:16px;background:${cor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:1.05rem;font-weight:800;color:#fff;line-height:1.3">${tmpl.nome}</div>
          <div style="font-size:var(--text-xs);color:rgba(255,255,255,.82);margin-top:4px">
            ${inst.data ? new Date(inst.data+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}) : ''}
          </div>
        </div>
        ${concluido ? `
          <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.25);color:#fff;
            padding:6px 13px;border-radius:20px;font-size:var(--text-sm);font-weight:700;white-space:nowrap;flex-shrink:0">
            ${lc('check-circle',14,'#fff')} Concluído
          </div>
        ` : `
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.7rem;font-weight:800;color:#fff;line-height:1">${pct}%</div>
            <div style="font-size:var(--text-xs);color:rgba(255,255,255,.75)">${feitos}/${total} itens</div>
          </div>
        `}
      </div>
      <div style="height:5px;background:rgba(255,255,255,.25);border-radius:3px;overflow:hidden;margin-top:12px">
        <div style="height:100%;width:${pct}%;background:#fff;border-radius:3px;transition:width .4s"></div>
      </div>
      ${!concluido ? `
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button onclick="event.stopPropagation();_ckAbrirModoGuiado('${inst.id}')"
          style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;
            border-radius:var(--radius-pill);border:1.5px solid rgba(255,255,255,.5);
            background:rgba(255,255,255,.15);color:#fff;font-size:var(--text-xs);
            font-weight:700;cursor:pointer;font-family:var(--font-sans);
            backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)">
          ${lc('play', 12, 'currentColor')} Modo Guiado
        </button>
      </div>` : ''}
    </div>

    <!-- Itens -->
    <div style="background:var(--surface)">
      ${(() => {
        if (!window._ckInstrucoes) window._ckInstrucoes = {};
        return tmpl.itens.map(item => {
          const tipo     = item.tipo || 'check';
          const resp     = (inst.respostas||{})[item.id];
          const feito    = !!resp;
          const hasInstr = !!(item.instrucoes || item.videoUrl);
          if (hasInstr) window._ckInstrucoes[item.id] = { instrucoes: item.instrucoes||'', videoUrl: item.videoUrl||'' };
          const itemCor  = tmpl.cor || 'var(--purple)';
          return `
          <div style="border-bottom:1px solid var(--border);background:${feito ? 'var(--green-light)' : 'var(--surface)'}">
            <div style="display:flex;align-items:center;min-height:${tipo==='check'?58:46}px;padding:10px 14px;gap:14px;${tipo==='check'?'cursor:pointer':''}"
              ${tipo==='check' ? `onclick="marcarItemCkClick('${inst.id}',${item.id})"` : ''}>
              <div style="width:26px;height:26px;min-width:26px;border-radius:7px;
                border:2.5px solid ${feito ? 'var(--green)' : itemCor};
                background:${feito ? 'var(--green)' : 'var(--surface)'};
                display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0">
                ${feito ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-md);font-weight:${feito ? '500' : '600'};color:${feito ? 'var(--muted)' : 'var(--text)'};
                  text-decoration:${feito ? 'line-through' : 'none'};line-height:1.4">${item.texto}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">
                  ${(() => {
                    if (!item.horario) return '';
                    let atrasado = false;
                    if (!feito) {
                      const [hh, mm] = item.horario.split(':').map(Number);
                      const ref = new Date(inst.data + 'T' + item.horario + ':00');
                      atrasado = !isNaN(ref) && new Date() > ref;
                    }
                    return atrasado
                      ? `<span style="font-size:var(--text-xs);color:var(--red);display:flex;align-items:center;gap:3px;font-weight:700">${lc('alert-circle',10,'var(--red)')} ${item.horario} atrasado</span>`
                      : `<span style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:3px">${lc('clock',10,'currentColor')} ${item.horario}</span>`;
                  })()}
                  ${item.obrigatorio ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--red)">obrigatório</span>` : ''}
                  ${item.exigeEvidencia ? `<span style="font-size:var(--text-2xs);font-weight:600;color:var(--orange-dark);display:flex;align-items:center;gap:3px">${lc('camera',10,'currentColor')} evidência</span>` : ''}
                  ${tipo !== 'check' ? `<span style="font-size:var(--text-2xs);font-weight:700;color:var(--purple)">${tipo==='numero'?'123 Número':'Aa Texto'}</span>` : ''}
                </div>
              </div>
              ${hasInstr && tipo === 'check' ? `
              <button onclick="event.stopPropagation();_ckAbrirInstrucoes(${item.id})"
                style="width:36px;height:36px;min-width:36px;border-radius:50%;background:rgba(0,0,0,.06);
                border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
                ${lc('info',17,'var(--purple)')}
              </button>` : ''}
            </div>
            ${tipo !== 'check' ? `
            <div style="padding:0 14px 12px 54px;display:flex;gap:8px;align-items:center">
              <input id="ck-val-${inst.id}-${item.id}" type="${tipo==='numero'?'number':'text'}"
                value="${resp?.valor||''}"
                placeholder="${tipo==='numero'?'Valor numérico...':'Descreva o resultado...'}"
                style="flex:1;padding:7px 10px;border:1.5px solid ${feito?'var(--green)':'var(--border)'};border-radius:var(--r6);font-size:var(--text-sm);font-family:Inter,sans-serif" step="any">
              <button onclick="event.stopPropagation();_ckSalvarValorItem('${inst.id}',${item.id})"
                style="padding:7px 14px;border:none;border-radius:var(--r6);background:${feito?'var(--green)':'var(--purple)'};color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;flex-shrink:0;white-space:nowrap">
                ${feito?lc('check',12,'currentColor'):'Salvar'}
              </button>
            </div>` : ''}
            ${item.exigeEvidencia && feito ? `
            <div style="padding:6px 14px 12px 54px;display:flex;gap:8px;flex-wrap:wrap">
              <button onclick="_ckCapturaFoto('${inst.id}',${item.id})"
                style="display:flex;align-items:center;gap:6px;padding:9px 16px;border:1.5px solid var(--border);
                border-radius:var(--r8);background:var(--surface);color:var(--text);font-size:var(--text-sm);
                font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
                ${lc('camera',15,'currentColor')} Tirar foto
              </button>
              <button onclick="_ckGravarVideo('${inst.id}',${item.id})"
                style="display:flex;align-items:center;gap:6px;padding:9px 16px;border:1.5px solid var(--border);
                border-radius:var(--r8);background:var(--surface);color:var(--text);font-size:var(--text-sm);
                font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
                ${lc('video',15,'currentColor')} Vídeo
              </button>
            </div>` : ''}
          </div>`;
        }).join('');
      })()}
    </div>

    ${concluido ? `
    <div style="padding:12px 16px;background:var(--green-light);border-top:1px solid var(--green)">
      <div style="font-size:var(--text-sm);font-weight:700;color:var(--green);text-align:center;
        display:flex;align-items:center;justify-content:center;gap:6px">
        ${lc('check-circle',14,'var(--green)')} Checklist assinado às ${inst.concluidoEm ? new Date(inst.concluidoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'}
      </div>
    </div>` : ''}
  </div>`;
}

function _ckCapturaFoto(instId, itemId) {
  toast('Disponível após migração para banco de dados', 'warn');
}

function _ckGravarVideo(instId, itemId) {
  toast('Disponível após migração para banco de dados', 'warn');
}

function marcarItemCkClick(instId, itemId) {
  const sessoes = _getCkSessoes();
  const inst    = sessoes.find(s => s.id === instId);
  if (!inst) return;
  const _itmTipo = _getCkTemplates().find(t => t.id === inst.templateId)?.itens.find(i => i.id === itemId);
  if (_itmTipo?.tipo && _itmTipo.tipo !== 'check') return;
  if (!inst.respostas) inst.respostas = {};
  const novoEstado = !inst.respostas[itemId];
  if (novoEstado) {
    inst.respostas[itemId] = { feito:true, hora: new Date().toISOString() };
  } else {
    delete inst.respostas[itemId];
  }
  // Verificar se concluiu tudo
  const tmpl = _getCkTemplates().find(t => t.id === inst.templateId);
  if (tmpl) {
    const obrigs = tmpl.itens.filter(i => i.obrigatorio);
    const todosObrigs = obrigs.every(i => inst.respostas[i.id]);
    const todosTudo   = tmpl.itens.every(i => inst.respostas[i.id]);
    const podeConc    = obrigs.length > 0 ? todosObrigs : todosTudo;
    if (podeConc && !inst.concluidoEm) {
      inst.concluidoEm  = new Date().toISOString();
      inst.status       = 'concluido';
      toast('Checklist concluído!', 'ok');
      _saveCkSessoes(sessoes);
      try { logAudit('checklist_concluido', (tmpl.nome || 'Checklist') + ' — sessão #' + inst.id, 'checklist'); } catch(e) {}
    } else if (!podeConc) {
      inst.status = 'em_andamento';
      delete inst.concluidoEm;
      _saveCkSessoes(sessoes);
    } else {
      _saveCkSessoes(sessoes);
    }
  } else {
    _saveCkSessoes(sessoes);
  }
  _renderCkMeu();
  _atualizarBadgeEquipe();
}

function marcarItemCk(instId, itemId, checked) {
  marcarItemCkClick(instId, itemId);
}

function _ckSalvarValorItem(instId, itemId, valorOverride) {
  let valor;
  if (valorOverride !== undefined) {
    valor = String(valorOverride).trim();
  } else {
    const input = document.getElementById(`ck-val-${instId}-${itemId}`);
    valor = input?.value?.trim();
  }
  if (!valor) { toast('Informe um valor', 'err'); return; }
  const sessoes = _getCkSessoes();
  const inst    = sessoes.find(s => s.id === instId);
  if (!inst) return;
  if (!inst.respostas) inst.respostas = {};
  inst.respostas[itemId] = { feito: true, valor, hora: new Date().toISOString() };
  const tmpl = _getCkTemplates().find(t => t.id === inst.templateId);
  if (tmpl) {
    const obrigs   = tmpl.itens.filter(i => i.obrigatorio);
    const todosOb  = obrigs.every(i => inst.respostas[i.id]);
    const podeConc = obrigs.length > 0 ? todosOb : tmpl.itens.every(i => inst.respostas[i.id]);
    if (podeConc && !inst.concluidoEm) {
      inst.concluidoEm = new Date().toISOString();
      inst.status = 'concluido';
      toast('Checklist concluído!', 'ok');
      try { logAudit('checklist_concluido', (tmpl.nome||'Checklist') + ' — sessão #' + inst.id, 'checklist'); } catch(e) {}
    } else if (!podeConc) {
      inst.status = 'em_andamento';
      delete inst.concluidoEm;
    }
  }
  _saveCkSessoes(sessoes);
  _renderCkMeu();
  _atualizarBadgeEquipe();
}

// ══════════════════════════════════════════════════════════════
// ABA: EQUIPE (GESTOR)
// ══════════════════════════════════════════════════════════════
function _renderCkEquipe() {
  const el   = document.getElementById('ckPanelContent');
  const hoje = new Date().toISOString().slice(0,10);
  const sessoes = _getCkSessoes();

  // Filtros
  if (!window._ckEquipeFiltro) window._ckEquipeFiltro = { data: hoje, userId: '' };
  const f    = window._ckEquipeFiltro;
  const sFs  = sessoes.filter(s => s.data === f.data && (f.userId ? s.userId === parseInt(f.userId) : true));

  // Funcs com sessões hoje
  const usersComSessao = [...new Set(sFs.map(s => s.userId))];
  const funcUsers = users.filter(u => u.active !== false);

  // KPIs
  const total     = sFs.length;
  const concluidos= sFs.filter(s => s.status === 'concluido').length;
  const pendentes = sFs.filter(s => s.status === 'pendente').length;
  const andamento = sFs.filter(s => s.status === 'em_andamento').length;

  el.innerHTML = `
    <div>
      <!-- Filtros -->
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:3px;font-weight:600">Data</div>
          <input type="date" value="${f.data}" class="inp" style="max-width:160px"
            onchange="window._ckEquipeFiltro.data=this.value;_renderCkEquipe()">
        </div>
        <div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:3px;font-weight:600">Funcionário</div>
          <select class="inp" style="max-width:200px" onchange="window._ckEquipeFiltro.userId=this.value;_renderCkEquipe()">
            <option value="">Todos</option>
            ${funcUsers.map(u => `<option value="${u.id}" ${f.userId==u.id?'selected':''}>${u.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- KPIs do dia -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px">
        ${[
          { label:'Total', val:total, cor:'var(--purple)', bg:'var(--purple-xlight)' },
          { label:'Concluídos', val:concluidos, cor:'var(--green)', bg:'var(--green-light)' },
          { label:'Em andamento', val:andamento, cor:'var(--yellow)', bg:'var(--yellow-light)' },
          { label:'Pendentes', val:pendentes, cor:'var(--red)', bg:'var(--red-light)' },
        ].map(k => `
          <div style="background:${k.bg};border:1.5px solid ${k.cor}22;border-radius:var(--r10);padding:11px 14px;text-align:center">
            <div style="font-size:1.4rem;font-weight:800;color:${k.cor}">${k.val}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${k.label}</div>
          </div>`).join('')}
      </div>

      <!-- Grid de funcionários -->
      <div style="display:flex;flex-direction:column;gap:12px">
        ${funcUsers.filter(u => f.userId ? u.id === parseInt(f.userId) : true).map(u => {
          const uSessoes = sFs.filter(s => s.userId === u.id);
          const uConc    = uSessoes.filter(s => s.status === 'concluido').length;
          const uPend    = uSessoes.filter(s => s.status === 'pendente').length;
          return `
          <div class="card" style="overflow:hidden">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--purple);color:#fff;font-size:var(--text-md);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${u.name.charAt(0).toUpperCase()}
              </div>
              <div style="flex:1">
                <div style="font-size:var(--text-md);font-weight:700">${u.name}</div>
                <div style="font-size:var(--text-xs);color:var(--muted)">${u.funcao||u.role} · ${uSessoes.length} checklist(s) hoje</div>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                ${uConc > 0 ? `<span style="background:var(--green-light);color:var(--green);border:1px solid var(--green);border-radius:20px;padding:2px 8px;font-size:var(--text-xs);font-weight:700">${uConc} concluído(s)</span>` : ''}
                ${uPend > 0 ? `<span style="background:var(--red-light);color:var(--red);border:1px solid var(--red);border-radius:20px;padding:2px 8px;font-size:var(--text-xs);font-weight:700">${uPend} pendente(s)</span>` : ''}
                <button onclick="abrirModalNovaInstanciaUser(${u.id})"
                  style="padding:4px 10px;border:1.5px solid var(--purple);border-radius:var(--r6);background:var(--surface);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer">
                  + Atribuir
                </button>
              </div>
            </div>
            ${uSessoes.length === 0 ? `
              <div style="padding:12px 16px;font-size:var(--text-sm);color:var(--muted);font-style:italic">Nenhum checklist atribuído hoje</div>
            ` : uSessoes.map(s => {
              const tmpl = _getCkTemplates().find(t => t.id === s.templateId);
              if (!tmpl) return '';
              const total = tmpl.itens.length;
              const feitos = Object.keys(s.respostas||{}).length;
              const pct = total > 0 ? Math.round(feitos/total*100) : 0;
              const stColors = { concluido:'var(--green)', em_andamento:'var(--yellow)', pendente:'var(--red)' };
              const stLabels = { concluido:'Concluído', em_andamento:'Em andamento', pendente:'Pendente' };
              return `
              <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <div style="width:6px;height:6px;border-radius:50%;background:${stColors[s.status]||'var(--muted)'};flex-shrink:0"></div>
                <div style="flex:1">
                  <div style="font-size:var(--text-sm);font-weight:600">${tmpl.nome}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">${feitos}/${total} itens · ${s.turno||''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:60px;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${stColors[s.status]||'var(--muted)'};border-radius:3px"></div>
                  </div>
                  <span style="font-size:var(--text-xs);font-weight:700;color:${stColors[s.status]}">${pct}%</span>
                  <button onclick="verDetalheInstancia('${s.id}')"
                    style="padding:3px 8px;border:1px solid var(--border);border-radius:var(--r6);background:var(--surface);font-size:var(--text-xs);color:var(--muted);cursor:pointer">
                    Ver
                  </button>
                </div>
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function _atualizarBadgeEquipe() {
  const hoje    = new Date().toISOString().slice(0,10);
  const pend    = _getCkSessoes().filter(s => s.data === hoje && s.status === 'pendente').length;
  const badge   = document.getElementById('ckBadgeEquipe');
  if (badge) { badge.textContent = pend > 0 ? pend : ''; badge.style.display = pend > 0 ? 'inline' : 'none'; }
  const sbBadge = document.getElementById('badge-checklist');
  if (sbBadge) { sbBadge.style.display = pend > 0 ? 'block' : 'none'; }
}

// ══════════════════════════════════════════════════════════════
// ABA: TEMPLATES
// ══════════════════════════════════════════════════════════════
function _renderCkTemplates() {
  const el    = document.getElementById('ckPanelContent');
  const tmpls = _getCkTemplates();

  el.innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:2px">Templates de Checklist</h3>
          <div style="font-size:var(--text-xs);color:var(--muted)">Crie e edite os checklists por função e turno</div>
        </div>
        <button onclick="abrirModalNovoTemplate()"
          style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;border-radius:var(--r8);background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer">
          ${lc('plus',13,'#fff')} Novo template
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${tmpls.map(t => `
          <div class="card" style="overflow:hidden;border:1.5px solid ${t.cor||'var(--border)'}22;cursor:pointer" onclick="abrirModalEditarTemplate(${t.id})">
            <div style="padding:14px 16px;background:${t.bg||'var(--surface2)'};border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font-size:var(--text-md);font-weight:800;color:${t.cor||'var(--text)'}">${t.nome}</div>
                </div>
                <span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;
                  background:${t.ativo?'var(--green-light)':'var(--surface)'};
                  color:${t.ativo?'var(--green)':'var(--muted)'};
                  border:1px solid ${t.ativo?'var(--green)':'var(--border)'}">
                  ${t.ativo?'Ativo':'Inativo'}
                </span>
              </div>
            </div>
            <div style="padding:10px 16px">
              <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:7px">${t.itens.length} itens · ${t.itens.filter(i=>i.obrigatorio).length} obrigatórios</div>
              <div style="display:flex;flex-direction:column;gap:4px">
                ${t.itens.slice(0,3).map(i => `
                  <div style="display:flex;align-items:center;gap:7px;font-size:var(--text-xs);color:var(--muted)">
                    <div style="width:5px;height:5px;border-radius:50%;background:${t.cor||'var(--border)'};flex-shrink:0"></div>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.texto}</span>
                  </div>`).join('')}
                ${t.itens.length > 3 ? `<div style="font-size:var(--text-xs);color:var(--muted)">+${t.itens.length-3} mais...</div>` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// RECORRÊNCIA — auto-assign diário
// ══════════════════════════════════════════════════════════════

function _ckAutoAssign() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u || (u.role !== 'gerente' && u.role !== 'supervisor')) return;
  const hoje      = new Date().toISOString().slice(0, 10);
  const diaSemana = new Date().getDay();
  const sessoes   = _getCkSessoes();
  const tmpls     = _getCkTemplates().filter(t => t.ativo && t.recorrencia?.ativa);
  let criados = 0;
  tmpls.forEach(tmpl => {
    if (!(tmpl.recorrencia.dias||[]).includes(diaSemana)) return;
    const turno   = tmpl.recorrencia.turno || 'diario';
    (tmpl.recorrencia.usuarios||[]).forEach(uid => {
      if (!sessoes.some(s => s.templateId === tmpl.id && s.userId === uid && s.data === hoje)) {
        sessoes.push({
          id:          'ck-auto-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
          templateId:  tmpl.id,
          userId:      uid,
          data:        hoje,
          turno,
          status:      'pendente',
          criadoPor:   'Sistema (automático)',
          criadoEm:    new Date().toISOString(),
          respostas:   {},
          concluidoEm: null,
        });
        criados++;
      }
    });
  });
  if (criados > 0) { _saveCkSessoes(sessoes); toast(`${criados} checklist(s) atribuído(s) automaticamente`); }
}

function _ckChipStyle(cb) {
  const label = cb.closest('label');
  if (!label) return;
  if (cb.checked) {
    label.style.border = '1.5px solid var(--purple)';
    label.style.background = 'var(--purple-xlight)';
    label.style.color = 'var(--purple)';
  } else {
    label.style.border = '1.5px solid var(--border)';
    label.style.background = 'var(--surface)';
    label.style.color = 'var(--muted)';
  }
}

// ══════════════════════════════════════════════════════════════
// MODAIS
// ══════════════════════════════════════════════════════════════

// Modal: Atribuir checklist a usuário
function abrirModalNovaInstancia() { _modalAtribuir(null); }
function abrirModalNovaInstanciaUser(userId) { _modalAtribuir(userId); }

function _modalAtribuir(preUserId) {
  document.getElementById('popupCkAtribuir')?.remove();
  const tmpls = _getCkTemplates().filter(t => t.ativo);
  const hoje  = new Date().toISOString().slice(0,10);

  const popup = document.createElement('div');
  popup.id = 'popupCkAtribuir';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div style="font-size:var(--text-md);font-weight:800">${lc('user-check',15,'var(--purple)')} Atribuir Checklist</div>
        <button onclick="document.getElementById('popupCkAtribuir').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0">
          <label>Funcionário *</label>
          <select id="ckAtribUser" class="inp">
            <option value="">Selecionar funcionário...</option>
            ${users.filter(u=>u.active!==false).map(u => `<option value="${u.id}" ${preUserId==u.id?'selected':''}>${u.name} (${u.role})</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0">
          <label>Template *</label>
          <select id="ckAtribTmpl" class="inp">
            <option value="">Selecionar template...</option>
            ${tmpls.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}
          </select>
        </div>
        <div class="f2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field" style="margin:0">
            <label>Data</label>
            <input type="date" id="ckAtribData" class="inp" value="${hoje}">
          </div>
          <div class="field" style="margin:0">
            <label>Turno</label>
            <select id="ckAtribTurno" class="inp">
              ${(typeof checklistTurnos !== 'undefined' ? checklistTurnos : [{id:'abertura',label:'Abertura'},{id:'producao',label:'Produção'},{id:'operacao',label:'Operação'},{id:'fechamento',label:'Fechamento'},{id:'diario',label:'Diário'}]).map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border)">
        <button class="btn btn-outline" onclick="document.getElementById('popupCkAtribuir').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAtribuicaoCk()">Atribuir</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function salvarAtribuicaoCk() {
  const userId   = parseInt(document.getElementById('ckAtribUser')?.value);
  const tmplId   = parseInt(document.getElementById('ckAtribTmpl')?.value);
  const data     = document.getElementById('ckAtribData')?.value;
  const turno    = document.getElementById('ckAtribTurno')?.value;
  const u        = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  if (!userId) { toast('Selecione um funcionário','err'); return; }
  if (!tmplId) { toast('Selecione um template','err'); return; }
  if (!data)   { toast('Informe a data','err'); return; }

  const sessoes = _getCkSessoes();
  const novaId  = 'ck-' + Date.now();
  sessoes.push({
    id:          novaId,
    templateId:  tmplId,
    userId,
    data,
    turno,
    status:      'pendente',
    criadoPor:   u?.name||'Sistema',
    criadoEm:    new Date().toISOString(),
    respostas:   {},
    concluidoEm: null,
  });
  _saveCkSessoes(sessoes);
  document.getElementById('popupCkAtribuir')?.remove();
  renderChecklist();
  toast('Checklist atribuído!');
}

// Modal: Ver detalhe de uma instância
function verDetalheInstancia(instId) {
  const inst  = _getCkSessoes().find(s => s.id === instId);
  if (!inst) return;
  const tmpl  = _getCkTemplates().find(t => t.id === inst.templateId);
  if (!tmpl) return;
  const user  = users.find(u => u.id === inst.userId);
  const total = tmpl.itens.length;
  const feitos= Object.keys(inst.respostas||{}).length;
  const cu    = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const isGestor = cu?.role === 'gerente' || cu?.role === 'supervisor';
  if (!window._ckAvalEstrelas) window._ckAvalEstrelas = {};
  window._ckAvalEstrelas[instId] = inst.avaliacao?.estrelas || 0;

  const popup = document.createElement('div');
  popup.id = 'popupCkDetalhe';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.25);margin:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--border);background:${tmpl.bg||'var(--surface2)'};border-radius:var(--r14) var(--r14) 0 0">
        <div>
          <div style="font-size:var(--text-md);font-weight:800;color:${tmpl.cor||'var(--text)'}">${tmpl.nome}</div>
          <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${user?.name||'?'} · ${inst.data}</div>
        </div>
        <button onclick="document.getElementById('popupCkDetalhe').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:6px">
        ${tmpl.itens.map(item => {
          const resp = (inst.respostas||{})[item.id];
          const feito = !!resp;
          return `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:var(--r8);background:${feito?'var(--green-light)':'var(--surface2)'}">
            <div style="width:20px;height:20px;border-radius:5px;border:2px solid ${feito?'var(--green)':'var(--border)'};background:${feito?'var(--green)':'var(--surface)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
              ${feito?`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`:''}
            </div>
            <div style="flex:1">
              <div style="font-size:var(--text-sm);font-weight:500;color:${feito?'var(--muted)':'var(--text)'};text-decoration:${feito?'line-through':'none'}">${item.texto}</div>
              <div style="display:flex;gap:8px;margin-top:2px;flex-wrap:wrap">
                ${item.horario?`<span style="font-size:var(--text-2xs);color:var(--muted)">${item.horario}</span>`:''}
                ${feito && resp.hora ? `<span style="font-size:var(--text-2xs);color:var(--green)">✓ ${new Date(resp.hora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
              </div>
              ${resp?.valor ? `<div style="font-size:var(--text-xs);color:var(--purple);margin-top:4px;font-weight:600">${lc('edit-3',10,'currentColor')} ${String(resp.valor).replace(/</g,'&lt;')}</div>` : ''}
              ${resp?.evidencia ? `<div style="font-size:var(--text-xs);color:var(--orange-dark);margin-top:4px;display:flex;align-items:flex-start;gap:4px">${lc('camera',10,'currentColor')} <span>${resp.evidencia.replace(/</g,'&lt;')}</span></div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${isGestor ? `
      <div style="padding:14px 20px;border-top:1px solid var(--border)">
        <div style="font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px">
          ${lc('star',13,'var(--yellow)')} Avaliação de qualidade
          ${inst.avaliacao ? `<span style="font-size:var(--text-xs);color:var(--green);font-weight:500">— já avaliado</span>` : ''}
        </div>
        <div style="display:flex;gap:3px;margin-bottom:8px">
          ${[1,2,3,4,5].map(n => `
            <span onclick="_ckSelecionarEstrela(${n},'${instId}')" id="ckStar-${instId}-${n}"
              style="font-size:1.6rem;cursor:pointer;line-height:1;color:${(inst.avaliacao?.estrelas||0)>=n?'var(--yellow)':'var(--border)'}">★</span>
          `).join('')}
        </div>
        <textarea id="ckAvalFeedback-${instId}" class="inp"
          style="width:100%;resize:vertical;min-height:58px;font-size:var(--text-sm);font-family:Inter,sans-serif;box-sizing:border-box;margin-bottom:8px"
          placeholder="Feedback para o funcionário (opcional)...">${inst.avaliacao?.feedback||''}</textarea>
        <button onclick="avaliarInstanciaCk('${instId}')"
          style="padding:6px 16px;border:none;border-radius:var(--r8);background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer">
          ${inst.avaliacao ? 'Atualizar avaliação' : 'Salvar avaliação'}
        </button>
      </div>` : ''}
      <div style="padding:12px 20px;border-top:1px solid var(--border);background:var(--surface2);border-radius:0 0 var(--r14) var(--r14);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:var(--text-sm);color:var(--muted)">${feitos}/${total} itens concluídos</div>
        ${inst.concluidoEm ? `<div style="font-size:var(--text-xs);font-weight:700;color:var(--green)">${lc('check-circle',12,'currentColor')} Finalizado às ${new Date(inst.concluidoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

// Modal: Editar template
function abrirModalNovoTemplate()      { _modalTemplate(null); }
function abrirModalEditarTemplate(id)  { _modalTemplate(id); }

function _modalTemplate(id) {
  const tmpls = _getCkTemplates();
  const tmpl  = id ? tmpls.find(t=>t.id===id) : null;

  const popup = document.createElement('div');
  popup.id = 'popupCkTemplate';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto';

  const cores = [
    {cor:'var(--red)',       bg:'var(--red-light)',      label:'Vermelho'},
    {cor:'var(--purple)',    bg:'var(--purple-xlight)',  label:'Roxo'},
    {cor:'var(--green)',     bg:'var(--green-light)',    label:'Verde'},
    {cor:'var(--yellow)',    bg:'var(--yellow-light)',   label:'Laranja'},
    {cor:'var(--chart-2)',   bg:'#EFF6FF',               label:'Azul'},
  ];

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:580px;box-shadow:0 20px 60px rgba(0,0,0,.3);margin:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0">
        <div style="font-size:var(--text-md);font-weight:800">${id ? 'Editar' : 'Novo'} Template</div>
        <button onclick="document.getElementById('popupCkTemplate').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="f2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field" style="margin:0">
            <label>Nome do checklist *</label>
            <input type="text" id="tmplNome" class="inp" value="${tmpl?.nome||''}" placeholder="Ex: Pizzaiolo — Abertura">
          </div>
          <div class="field" style="margin:0">
            <label>Cor</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:4px">
              ${cores.map(c => `
                <button onclick="document.getElementById('tmplCorSel').value='${c.cor}';document.getElementById('tmplBgSel').value='${c.bg}';document.querySelectorAll('.ck-cor-btn').forEach(b=>b.style.outline='none');this.style.outline='2px solid var(--purple)'"
                  class="ck-cor-btn"
                  style="width:24px;height:24px;border-radius:50%;border:none;background:${c.cor};cursor:pointer;${tmpl?.cor===c.cor?'outline:2px solid var(--purple)':''}">
                </button>`).join('')}
              <input type="hidden" id="tmplCorSel" value="${tmpl?.cor||'var(--red)'}">
              <input type="hidden" id="tmplBgSel" value="${tmpl?.bg||'var(--red-light)'}">
            </div>
          </div>
        </div>

        <!-- Recorrência -->
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:12px 14px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:0">
            <input type="checkbox" id="tmplRecAtiva" ${tmpl?.recorrencia?.ativa?'checked':''}
              onchange="document.getElementById('tmplRecCfg').style.display=this.checked?'flex':'none'"
              style="accent-color:var(--purple);width:15px;height:15px">
            <span style="font-size:var(--text-sm);font-weight:700">Atribuição automática por recorrência</span>
          </label>
          <div id="tmplRecCfg" style="display:${tmpl?.recorrencia?.ativa?'flex':'none'};flex-direction:column;gap:10px;margin-top:10px">
            <div>
              <div style="font-size:var(--text-xs);font-weight:700;color:var(--muted);margin-bottom:6px">Dias da semana</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${[{n:0,l:'Dom'},{n:1,l:'Seg'},{n:2,l:'Ter'},{n:3,l:'Qua'},{n:4,l:'Qui'},{n:5,l:'Sex'},{n:6,l:'Sáb'}].map(d => {
                  const sel = (tmpl?.recorrencia?.dias||[]).includes(d.n);
                  return `<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;cursor:pointer;font-size:var(--text-xs);font-weight:600;transition:all .15s;border:1.5px solid ${sel?'var(--purple)':'var(--border)'};background:${sel?'var(--purple-xlight)':'var(--surface)'};color:${sel?'var(--purple)':'var(--muted)'}">
                    <input type="checkbox" value="${d.n}" class="tmpl-rec-dia" ${sel?'checked':''}
                      style="display:none" onchange="_ckChipStyle(this)"> ${d.l}
                  </label>`;
                }).join('')}
              </div>
            </div>
            <div class="f2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="field" style="margin:0">
                <label>Turno padrão</label>
                <select id="tmplRecTurno" class="inp">
                  ${(typeof checklistTurnos !== 'undefined' ? checklistTurnos : [{id:'abertura',label:'Abertura'},{id:'producao',label:'Produção'},{id:'operacao',label:'Operação'},{id:'fechamento',label:'Fechamento'},{id:'diario',label:'Diário'}]).map(t=>`<option value="${t.id}" ${(tmpl?.recorrencia?.turno||'diario')===t.id?'selected':''}>${t.label}</option>`).join('')}
                </select>
              </div>
              <div class="field" style="margin:0">
                <label>Funcionários</label>
                <div style="max-height:90px;overflow-y:auto;border:1.5px solid var(--border);border-radius:var(--r6);padding:6px;background:var(--surface)">
                  ${users.filter(u=>u.active!==false).map(u => `
                  <label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:var(--text-xs)">
                    <input type="checkbox" value="${u.id}" class="tmpl-rec-user" ${(tmpl?.recorrencia?.usuarios||[]).includes(u.id)?'checked':''} style="accent-color:var(--purple)">
                    ${u.name}
                  </label>`).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Itens -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <label style="font-size:var(--text-sm);font-weight:600;color:var(--text2)">Itens do checklist</label>
            <button onclick="adicionarItemTemplate()" style="padding:4px 10px;border:1.5px solid var(--purple);border-radius:var(--r6);background:var(--surface);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer">+ Item</button>
          </div>
          <div id="tmplItens" style="display:flex;flex-direction:column;gap:6px">
            ${(tmpl?.itens||[{id:1,texto:'',horario:'',obrigatorio:false}]).map((item,idx) => _rowItemTemplate(item,idx)).join('')}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;padding:14px 20px;border-top:1px solid var(--border)">
        <div>
          ${id ? `<button onclick="excluirTemplate(${id})" style="padding:7px 12px;border:1.5px solid var(--red);border-radius:var(--r8);background:var(--red-light);color:var(--red);font-size:var(--text-sm);font-weight:600;cursor:pointer">Excluir</button>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="document.getElementById('popupCkTemplate').remove()">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarTemplate(${id||'null'})">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

let _tmplItemCounter = 100;

function _rowItemTemplate(item, idx) {
  const hasExtra = !!(item.instrucoes || item.videoUrl || item.exigeEvidencia);
  return `
  <div id="tmplItem-${item.id}" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r8);padding:8px 10px">
    <div style="display:flex;align-items:center;gap:7px">
      <input type="text" placeholder="Descreva a tarefa..." value="${item.texto||''}"
        data-item-id="${item.id}" data-field="texto"
        style="flex:1;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm)">
      <select data-item-id="${item.id}" data-field="tipo"
        style="width:94px;padding:5px 6px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs)">
        <option value="check" ${(item.tipo||'check')==='check'?'selected':''}>✓ Verificar</option>
        <option value="numero" ${item.tipo==='numero'?'selected':''}>123 Número</option>
        <option value="texto" ${item.tipo==='texto'?'selected':''}>Aa Texto</option>
      </select>
      <input type="text" placeholder="Horário" value="${item.horario||''}"
        data-item-id="${item.id}" data-field="horario"
        style="width:70px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs)">
      <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-xs);white-space:nowrap;cursor:pointer">
        <input type="checkbox" ${item.obrigatorio?'checked':''} data-item-id="${item.id}" data-field="obrigatorio" style="accent-color:var(--red)"> Obrig.
      </label>
      <button onclick="removerItemTemplate(${item.id})"
        style="background:none;border:none;color:var(--muted);cursor:pointer;padding:2px;flex-shrink:0">${lc('x',14,'currentColor')}</button>
    </div>
    <button onclick="_toggleItemExtra(${item.id})"
      style="display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;
      padding:4px 2px 0;font-size:var(--text-xs);font-weight:600;font-family:Inter,sans-serif;
      color:${hasExtra?'var(--purple)':'var(--muted)'}">
      <span id="tmplItemExtraArrow-${item.id}">${hasExtra ? lc('chevron-up',12,'currentColor') : lc('chevron-down',12,'currentColor')}</span>
      ${hasExtra ? 'Instruções / evidência configuradas' : '+ Adicionar instruções ou evidência'}
    </button>
    <div id="tmplItemExtra-${item.id}" style="display:${hasExtra?'flex':'none'};flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--border);margin-top:6px">
      <textarea data-item-id="${item.id}" data-field="instrucoes"
        placeholder="Instruções detalhadas para o funcionário (opcional)..."
        style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-sm);resize:vertical;min-height:52px;font-family:Inter,sans-serif;box-sizing:border-box">${item.instrucoes||''}</textarea>
      <input type="text" data-item-id="${item.id}" data-field="videoUrl"
        placeholder="URL do vídeo de instrução (YouTube, Vimeo...)"
        value="${item.videoUrl||''}"
        style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--r6);font-size:var(--text-xs)">
      <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);cursor:pointer">
        <input type="checkbox" ${item.exigeEvidencia?'checked':''} data-item-id="${item.id}" data-field="exigeEvidencia" style="accent-color:var(--orange-dark)">
        Exige evidência ao concluir (foto ou descrição)
      </label>
    </div>
  </div>`;
}

function adicionarItemTemplate() {
  const wrap = document.getElementById('tmplItens');
  if (!wrap) return;
  _tmplItemCounter++;
  const novoItem = { id: _tmplItemCounter, texto:'', horario:'', obrigatorio:false };
  const div = document.createElement('div');
  div.innerHTML = _rowItemTemplate(novoItem, wrap.children.length);
  wrap.appendChild(div.firstElementChild);
}

function removerItemTemplate(itemId) {
  document.getElementById(`tmplItem-${itemId}`)?.remove();
}

function _coletarItensTemplate() {
  const wrap = document.getElementById('tmplItens');
  if (!wrap) return [];
  return [...wrap.querySelectorAll('[data-field="texto"]')].map(input => {
    const id = parseInt(input.dataset.itemId);
    const horEl  = wrap.querySelector(`[data-item-id="${id}"][data-field="horario"]`);
    const obrEl  = wrap.querySelector(`[data-item-id="${id}"][data-field="obrigatorio"]`);
    const instEl = wrap.querySelector(`[data-item-id="${id}"][data-field="instrucoes"]`);
    const vidEl  = wrap.querySelector(`[data-item-id="${id}"][data-field="videoUrl"]`);
    const evEl   = wrap.querySelector(`[data-item-id="${id}"][data-field="exigeEvidencia"]`);
    const tipoEl = wrap.querySelector(`[data-item-id="${id}"][data-field="tipo"]`);
    return {
      id,
      texto:          input.value.trim(),
      tipo:           tipoEl?.value||'check',
      horario:        horEl?.value.trim()||'',
      obrigatorio:    obrEl?.checked||false,
      instrucoes:     instEl?.value.trim()||'',
      videoUrl:       vidEl?.value.trim()||'',
      exigeEvidencia: evEl?.checked||false,
    };
  }).filter(i => i.texto);
}

function salvarTemplate(id) {
  const nome   = document.getElementById('tmplNome')?.value.trim();
  if (!nome) { toast('Informe o nome','err'); return; }
  const itens = _coletarItensTemplate();
  if (!itens.length) { toast('Adicione ao menos 1 item','err'); return; }

  const tmpls  = _getCkTemplates();
  const data   = {
    nome,
    cor:   document.getElementById('tmplCorSel')?.value||'var(--purple)',
    bg:    document.getElementById('tmplBgSel')?.value||'var(--purple-xlight)',
    ativo: true,
    itens,
    recorrencia: {
      ativa:    document.getElementById('tmplRecAtiva')?.checked||false,
      dias:     [...(document.querySelectorAll('.tmpl-rec-dia:checked')||[])].map(el=>parseInt(el.value)),
      usuarios: [...(document.querySelectorAll('.tmpl-rec-user:checked')||[])].map(el=>parseInt(el.value)),
      turno:    document.getElementById('tmplRecTurno')?.value||'diario',
    },
  };

  if (id && id !== 'null') {
    const idx = tmpls.findIndex(t=>t.id===id);
    if (idx>=0) tmpls[idx] = { ...tmpls[idx], ...data };
    toast('Template atualizado!');
  } else {
    tmpls.push({ id: Math.max(0,...tmpls.map(t=>t.id)) + 1, ...data });
    toast('Template criado!');
  }
  _saveCkTemplates(tmpls);
  document.getElementById('popupCkTemplate')?.remove();
  renderChecklist();
}

function excluirTemplate(id) {
  vtpConfirm({
    title: 'Excluir template',
    message: 'As sessões existentes não serão afetadas.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      const tmpls = _getCkTemplates().filter(t=>t.id!==id);
      _saveCkTemplates(tmpls);
      document.getElementById('popupCkTemplate')?.remove();
      renderChecklist();
      toast('Template excluído.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// INSTRUÇÕES / EVIDÊNCIA / AVALIAÇÃO
// ══════════════════════════════════════════════════════════════

function _toggleItemExtra(id) {
  const el     = document.getElementById(`tmplItemExtra-${id}`);
  const arrow  = document.getElementById(`tmplItemExtraArrow-${id}`);
  const btn    = arrow?.parentElement;
  if (!el) return;
  const aberto = el.style.display === 'none';
  el.style.display = aberto ? 'flex' : 'none';
  if (arrow) arrow.innerHTML = aberto ? lc('chevron-up',12,'currentColor') : lc('chevron-down',12,'currentColor');
  if (btn)   btn.childNodes[1].textContent = aberto ? ' Instruções / evidência configuradas' : ' + Adicionar instruções ou evidência';
}

function _ckAbrirInstrucoes(itemId) {
  const data = (window._ckInstrucoes||{})[itemId];
  if (!data) return;
  document.getElementById('popupCkInstr')?.remove();

  let embedUrl = '';
  if (data.videoUrl) {
    const yt = data.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    embedUrl = yt ? `https://www.youtube.com/embed/${yt[1]}` : '';
  }

  const popup = document.createElement('div');
  popup.id = 'popupCkInstr';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:88vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1.5px solid var(--border);background:var(--purple-xlight);border-radius:var(--r14) var(--r14) 0 0;position:sticky;top:0;z-index:1">
        <div style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:7px">${lc('book-open',15,'var(--purple)')} Instruções</div>
        <button onclick="document.getElementById('popupCkInstr').remove()" style="background:none;border:none;cursor:pointer">${lc('x',18,'var(--muted)')}</button>
      </div>
      <div style="padding:18px">
        ${data.instrucoes ? `<p style="font-size:var(--text-md);line-height:1.65;color:var(--text);white-space:pre-wrap;margin:0 ${embedUrl?'0 14px':'0'}">${data.instrucoes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>` : ''}
        ${embedUrl ? `
        <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:var(--r8);overflow:hidden;margin-top:${data.instrucoes?'14px':'0'}">
          <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>
        </div>` : (data.videoUrl ? `<a href="${data.videoUrl}" target="_blank" rel="noopener" style="font-size:var(--text-sm);color:var(--purple);word-break:break-all">${lc('external-link',12,'currentColor')} ${data.videoUrl}</a>` : '')}
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function registrarEvidenciaCk(instId, itemId, texto) {
  const sessoes = _getCkSessoes();
  const inst    = sessoes.find(s => s.id === instId);
  if (!inst) return;
  if (!inst.respostas) inst.respostas = {};
  if (!inst.respostas[itemId]) inst.respostas[itemId] = {};
  inst.respostas[itemId].evidencia = texto;
  _saveCkSessoes(sessoes);
}

function _ckSelecionarEstrela(n, instId) {
  if (!window._ckAvalEstrelas) window._ckAvalEstrelas = {};
  window._ckAvalEstrelas[instId] = n;
  for (let i = 1; i <= 5; i++) {
    const star = document.getElementById(`ckStar-${instId}-${i}`);
    if (star) star.style.color = i <= n ? 'var(--yellow)' : 'var(--border)';
  }
}

function avaliarInstanciaCk(instId) {
  const estrelas = window._ckAvalEstrelas?.[instId] || 0;
  const feedback = document.getElementById(`ckAvalFeedback-${instId}`)?.value.trim() || '';
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!estrelas) { toast('Selecione uma nota de 1 a 5', 'err'); return; }
  const sessoes = _getCkSessoes();
  const inst    = sessoes.find(s => s.id === instId);
  if (!inst) return;
  inst.avaliacao = {
    estrelas,
    feedback,
    avaliadorId:   u?.id,
    avaliadorNome: u?.name,
    avaliadoEm:    new Date().toISOString(),
  };
  _saveCkSessoes(sessoes);
  document.getElementById('popupCkDetalhe')?.remove();
  toast('Avaliação salva!', 'ok');
  renderChecklist();
}

// ══════════════════════════════════════════════════════════════
// ABA: DASHBOARD
// ══════════════════════════════════════════════════════════════

function _renderCkDashboard() {
  const el = document.getElementById('ckPanelContent');
  if (!window._ckDashPer) window._ckDashPer = 'mes';
  const per = window._ckDashPer;

  const hoje    = new Date();
  const sessoes = _getCkSessoes();

  let dInicio;
  if (per === 'semana')     { dInicio = new Date(hoje); dInicio.setDate(hoje.getDate() - 7); }
  else if (per === 'mes')   { dInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1); }
  else                      { dInicio = new Date(hoje); dInicio.setDate(hoje.getDate() - 30); }
  const dStr = dInicio.toISOString().slice(0,10);

  const sf     = sessoes.filter(s => s.data >= dStr);
  const total  = sf.length;
  const conc   = sf.filter(s => s.status === 'concluido').length;
  const aval   = sf.filter(s => s.avaliacao);
  const mediaGeral = aval.length ? (aval.reduce((a,s) => a + s.avaliacao.estrelas, 0) / aval.length) : null;
  const pctGeral   = total > 0 ? Math.round(conc / total * 100) : 0;

  const funcUsers = users.filter(u => u.active !== false);
  const stats = funcUsers.map(u => {
    const us  = sf.filter(s => s.userId === u.id);
    const uc  = us.filter(s => s.status === 'concluido').length;
    const ua  = us.filter(s => s.avaliacao);
    const um  = ua.length ? (ua.reduce((a,s) => a + s.avaliacao.estrelas, 0) / ua.length) : null;
    const pct = us.length > 0 ? Math.round(uc / us.length * 100) : 0;
    return { u, total: us.length, conc: uc, pct, media: um, score: pct * 0.6 + (um||0) * 8 };
  }).filter(s => s.total > 0).sort((a,b) => b.score - a.score);


  const pctCor = pctGeral >= 80 ? 'var(--green)' : pctGeral >= 50 ? 'var(--yellow)' : 'var(--red)';
  const pctBg  = pctGeral >= 80 ? 'var(--green-light)' : pctGeral >= 50 ? 'var(--yellow-light)' : 'var(--red-light)';

  el.innerHTML = `
    <div>
      <!-- Período -->
      <div style="display:flex;gap:6px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:600;color:var(--muted)">Período:</span>
        ${[{k:'semana',l:'Últimos 7 dias'},{k:'mes',l:'Este mês'},{k:'30dias',l:'Últimos 30 dias'}].map(p => `
          <button onclick="window._ckDashPer='${p.k}';_renderCkDashboard()"
            style="padding:5px 12px;border-radius:20px;border:1.5px solid ${per===p.k?'var(--purple)':'var(--border)'};
            background:${per===p.k?'var(--purple)':'var(--surface)'};color:${per===p.k?'#fff':'var(--muted)'};
            font-size:var(--text-xs);font-weight:${per===p.k?'700':'500'};cursor:pointer">${p.l}</button>
        `).join('')}
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:24px">
        <div style="background:var(--purple-xlight);border:1.5px solid var(--purple)33;border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="margin-bottom:4px">${lc('clipboard-list',18,'var(--purple)')}</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--purple)">${total}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px">Checklists</div>
        </div>
        <div style="background:var(--green-light);border:1.5px solid var(--green)33;border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="margin-bottom:4px">${lc('check-circle',18,'var(--green)')}</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--green)">${conc}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px">Concluídos</div>
        </div>
        <div style="background:${pctBg};border:1.5px solid ${pctCor}33;border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="margin-bottom:4px">${lc('trending-up',18,pctCor)}</div>
          <div style="font-size:1.3rem;font-weight:800;color:${pctCor}">${pctGeral}%</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px">Taxa conclusão</div>
        </div>
        <div style="background:var(--yellow-light);border:1.5px solid var(--yellow)33;border-radius:var(--r10);padding:12px 14px;text-align:center">
          <div style="margin-bottom:4px">${lc('star',18,'var(--yellow)')}</div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--yellow)">${mediaGeral ? mediaGeral.toFixed(1) : '—'}</div>
          <div style="font-size:var(--text-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-top:2px">Nota média</div>
        </div>
      </div>

      <!-- Ranking -->
      <div style="margin-bottom:12px">
        <h3 style="font-size:var(--text-md);font-weight:800;margin-bottom:2px">Ranking da Equipe</h3>
        <div style="font-size:var(--text-xs);color:var(--muted)">Pontuação = 60% conclusão + 40% qualidade</div>
      </div>

      ${stats.length === 0 ? `
        <div style="text-align:center;padding:32px;background:var(--surface2);border-radius:var(--r12);border:1.5px dashed var(--border)">
          ${lc('bar-chart-2',28,'var(--muted)')}
          <div style="font-size:var(--text-sm);color:var(--muted);margin-top:10px">Nenhum dado no período selecionado</div>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${stats.map((s, idx) => {
            const posColors = ['var(--yellow)','#94A3B8','var(--orange-dark)'];
            const posColor  = idx < 3 ? posColors[idx] : 'var(--muted)';
            const stars     = s.media !== null ? Math.round(s.media) : 0;
            return `
            <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="font-size:1rem;font-weight:800;color:${posColor};width:22px;text-align:center;flex-shrink:0">${idx+1}</div>
              <div style="width:36px;height:36px;border-radius:50%;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                ${s.u.name.charAt(0).toUpperCase()}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:var(--text-sm);font-weight:700">${s.u.name}</div>
                <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${s.u.funcao||s.u.role||''} · ${s.total} checklist(s)</div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:var(--accent)">${Math.round(s.score)}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">pts</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:${s.pct>=80?'var(--green)':s.pct>=50?'var(--yellow)':'var(--red)'}">${s.pct}%</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">conclusão</div>
                </div>
                <div style="text-align:center">
                  <div style="font-size:var(--text-md);font-weight:800;color:var(--yellow)">${s.media !== null ? s.media.toFixed(1) : '—'}</div>
                  <div style="font-size:var(--text-2xs);color:var(--muted)">qualidade</div>
                </div>
                <div style="display:flex;gap:1px">
                  ${[1,2,3,4,5].map(n => `<span style="font-size:var(--text-xs);color:${n<=stars?'var(--yellow)':'var(--border)'}">★</span>`).join('')}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODO GUIADO
// ══════════════════════════════════════════════════════════════

let _ckGuiadoInstId = null;
let _ckGuiadoIdx    = 0;

function _ckAbrirModoGuiado(instId) {
  _ckGuiadoInstId = instId;
  // Começa no primeiro item ainda não feito
  const inst  = _getCkSessoes().find(s => s.id === instId);
  const tmpl  = inst ? _getCkTemplates().find(t => t.id === inst.templateId) : null;
  if (!inst || !tmpl) return;
  const primeiroIdx = tmpl.itens.findIndex(i => !(inst.respostas||{})[i.id]);
  _ckGuiadoIdx = primeiroIdx >= 0 ? primeiroIdx : 0;
  _ckRenderGuiado();
}

function _ckRenderGuiado() {
  const inst  = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
  const tmpl  = inst ? _getCkTemplates().find(t => t.id === inst.templateId) : null;
  if (!inst || !tmpl) return;

  const item  = tmpl.itens[_ckGuiadoIdx];
  if (!item) { _ckGuiadoMostrarConclusao(); return; }

  const total = tmpl.itens.length;
  const pct   = Math.round((_ckGuiadoIdx / total) * 100);
  const cor   = tmpl.cor || 'var(--accent)';

  // Instrução com vídeo
  let instrHtml = '';
  if (item.instrucoes || item.videoUrl) {
    let embedUrl = '';
    if (item.videoUrl) {
      const yt = item.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
      embedUrl = yt ? `https://www.youtube.com/embed/${yt[1]}` : '';
    }
    instrHtml = `
      <div style="background:var(--info-bg);border:1px solid var(--info-border);
        border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-top:var(--space-3)">
        ${item.instrucoes ? `
          <div style="display:flex;gap:var(--space-2);align-items:flex-start;margin-bottom:${embedUrl||item.videoUrl?'var(--space-3)':'0'}">
            ${lc('book-open',14,'var(--info-fg)')}
            <span style="font-size:var(--text-sm);color:var(--fg-muted);line-height:var(--leading-relaxed)">${item.instrucoes.replace(/</g,'&lt;')}</span>
          </div>` : ''}
        ${embedUrl ? `
          <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:var(--radius-sm);overflow:hidden">
            <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>
          </div>` : (item.videoUrl ? `
          <a href="${item.videoUrl}" target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:6px;font-size:var(--text-xs);color:var(--accent)">
            ${lc('external-link',12,'currentColor')} Ver instrução em vídeo
          </a>` : '')}
      </div>`;
  }

  document.getElementById('ckGuiadoOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id        = 'ckGuiadoOverlay';
  overlay.className = 'ck-guided-overlay';

  overlay.innerHTML = `
    <div class="ck-guided-card">

      <div class="ck-guided-progress-bar">
        <div class="ck-guided-progress-fill" style="width:${pct}%;background:${cor}"></div>
      </div>

      <div class="ck-guided-header">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)">
          <div style="min-width:0">
            <div style="font-size:var(--text-xs);font-weight:700;color:${cor};
              text-transform:uppercase;letter-spacing:var(--tracking-caps);
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${tmpl.nome}
            </div>
            <div style="font-size:var(--text-2xs);color:var(--fg-subtle);margin-top:2px">
              Item ${_ckGuiadoIdx + 1} de ${total}
            </div>
          </div>
          <button onclick="_ckFecharGuiado()"
            style="width:32px;height:32px;min-width:32px;border-radius:50%;border:none;
              background:var(--bg-subtle);cursor:pointer;display:flex;
              align-items:center;justify-content:center;flex-shrink:0">
            ${lc('x', 15, 'var(--fg-muted)')}
          </button>
        </div>
      </div>

      <div class="ck-guided-body">
        <div id="ckGuiadoItemBody" class="ck-item-entrando">
          <div style="font-size:var(--text-xl);font-weight:800;line-height:1.3;
            color:var(--fg);margin-bottom:var(--space-3)">
            ${item.texto}
          </div>
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
            ${item.horario ? `
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--text-xs);
                color:var(--fg-subtle);background:var(--bg-subtle);padding:3px 8px;
                border-radius:var(--radius-pill)">
                ${lc('clock',11,'currentColor')} ${item.horario}
              </span>` : ''}
            ${item.obrigatorio ? `
              <span style="font-size:var(--text-xs);font-weight:700;color:var(--danger-fg);
                background:var(--danger-bg);padding:3px 8px;border-radius:var(--radius-pill)">
                obrigatório
              </span>` : ''}
          </div>
          ${instrHtml}
        </div>
      </div>

      ${item.tipo && item.tipo !== 'check' ? `
      <div style="padding:0 var(--space-4) var(--space-3)">
        <input id="ck-guided-val-${item.id}" type="${item.tipo==='numero'?'number':'text'}"
          value="${(inst.respostas||{})[item.id]?.valor||''}"
          placeholder="${item.tipo==='numero'?'Informe o valor numérico...':'Descreva o resultado...'}"
          style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:var(--r8);
          font-size:var(--text-md);font-family:Inter,sans-serif;box-sizing:border-box" step="any">
      </div>` : ''}
      <div class="ck-guided-actions">
        <button class="ck-guided-btn-feito" onclick="_ckGuiadoMarcarFeito()">
          ${item.tipo && item.tipo !== 'check' ? lc('save', 18, 'currentColor') : lc('check', 20, 'currentColor')}
          ${item.tipo && item.tipo !== 'check' ? 'Salvar e avançar' : 'Feito'}
        </button>
        ${!item.obrigatorio ? `
          <button class="ck-guided-btn-pular" onclick="_ckGuiadoPular()">
            Pular este item
          </button>` : ''}
      </div>

    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _ckFecharGuiado(); });
}

function _ckGuiadoMarcarFeito() {
  const inst = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
  const tmpl = inst ? _getCkTemplates().find(t => t.id === inst.templateId) : null;
  if (!inst || !tmpl) return;
  const item = tmpl.itens[_ckGuiadoIdx];
  if (!item) return;

  const tipo = item.tipo || 'check';
  if (tipo !== 'check') {
    const input = document.getElementById(`ck-guided-val-${item.id}`);
    const valor = input?.value?.trim();
    if (!valor) { toast('Informe um valor', 'err'); return; }
    _ckSalvarValorItem(_ckGuiadoInstId, item.id, valor);
    const instUpd = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
    const obrigs  = tmpl.itens.filter(i => i.obrigatorio);
    const podeConc= obrigs.length > 0 ? obrigs.every(i => (instUpd?.respostas||{})[i.id]) : tmpl.itens.every(i => (instUpd?.respostas||{})[i.id]);
    if (podeConc) { _ckGuiadoMostrarConclusao(); } else { _ckGuiadoAvancar(); }
    return;
  }

  // Marca o item usando a função existente
  marcarItemCkClick(_ckGuiadoInstId, item.id);

  // Verifica se concluiu tudo após marcar
  const instAtualizada = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
  const todosFeitos = tmpl.itens.every(i => (instAtualizada?.respostas||{})[i.id]);

  if (todosFeitos) {
    _ckGuiadoMostrarConclusao();
  } else {
    _ckGuiadoAvancar();
  }
}

function _ckGuiadoPular() {
  _ckGuiadoAvancar();
}

function _ckGuiadoAvancar() {
  const inst = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
  const tmpl = inst ? _getCkTemplates().find(t => t.id === inst.templateId) : null;
  if (!inst || !tmpl) return;

  // Encontra o próximo item não feito a partir do atual
  const respostas = inst.respostas || {};
  let proximo = -1;
  for (let i = _ckGuiadoIdx + 1; i < tmpl.itens.length; i++) {
    if (!respostas[tmpl.itens[i].id]) { proximo = i; break; }
  }
  // Se não tem próximo pendente à frente, procura do início
  if (proximo === -1) {
    for (let i = 0; i < _ckGuiadoIdx; i++) {
      if (!respostas[tmpl.itens[i].id]) { proximo = i; break; }
    }
  }

  if (proximo === -1) {
    // Todos feitos
    _ckGuiadoMostrarConclusao();
    return;
  }

  _ckGuiadoIdx = proximo;

  // Anima saída do item atual, depois renderiza próximo
  const body = document.getElementById('ckGuiadoItemBody');
  if (body) {
    body.classList.remove('ck-item-entrando');
    body.classList.add('ck-item-saindo');
    setTimeout(() => _ckRenderGuiado(), 140);
  } else {
    _ckRenderGuiado();
  }
}

function _ckGuiadoMostrarConclusao() {
  const overlay = document.getElementById('ckGuiadoOverlay');
  const card    = overlay?.querySelector('.ck-guided-card');
  if (!card) return;

  const inst = _getCkSessoes().find(s => s.id === _ckGuiadoInstId);
  const tmpl = inst ? _getCkTemplates().find(t => t.id === inst.templateId) : null;
  const nome = tmpl?.nome || 'Checklist';
  const total = tmpl ? tmpl.itens.length : 0;
  const feitos = Object.keys(inst?.respostas || {}).length;

  card.innerHTML = `
    <div class="state-complete" style="border-radius:var(--radius-2xl);margin:0;min-height:280px;
      justify-content:center;display:flex;flex-direction:column;align-items:center">
      <div class="state-complete-icon">
        ${lc('check-circle', 26, '#fff')}
      </div>
      <div class="state-complete-title">Checklist concluído!</div>
      <div class="state-complete-sub">${nome}</div>
      <div style="margin-top:var(--space-3);font-size:var(--text-sm);
        opacity:.75;position:relative">
        ${feitos} de ${total} itens realizados
      </div>
      <button onclick="_ckFecharGuiado()"
        style="margin-top:var(--space-6);padding:10px 28px;border-radius:var(--radius-pill);
          border:2px solid rgba(255,255,255,.5);background:transparent;
          color:#fff;font-size:var(--text-sm);font-weight:700;
          cursor:pointer;font-family:var(--font-sans);position:relative">
        Fechar
      </button>
    </div>`;
}

function _ckFecharGuiado() {
  document.getElementById('ckGuiadoOverlay')?.remove();
  _ckGuiadoInstId = null;
  _ckGuiadoIdx    = 0;
  _renderCkMeu();
}

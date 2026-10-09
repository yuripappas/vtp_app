/**
 * VTP Manutenção — Preventivas · Certificações · Corretivas
 */

let _manutTab            = 'visao_geral';
window._vtpGetTab_manutencao = () => _manutTab;
window._vtpSetTab_manutencao = (v) => { _manutTab = v; };
let _manutFiltro         = 'todos';
let _manutCorrFiltro     = 'abertas';
let _manutEquipFiltro    = null;
let _manutAgendaAberto   = false;

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════


const MANUT_CRIT = {
  baixa:  { label:'Baixa',   color:'var(--success-fg)',  bg:'var(--success-bg)'  },
  media:  { label:'Média',   color:'var(--warning-fg)',  bg:'var(--warning-bg)'  },
  alta:   { label:'Alta',    color:'var(--orange-fg)',   bg:'var(--orange-bg)'   },
  critica:{ label:'Crítica', color:'var(--danger-fg)',   bg:'var(--danger-bg)'   },
};

const MANUT_FREQ_LABELS = {
  diaria:'Diária', semanal:'Semanal', quinzenal:'Quinzenal', mensal:'Mensal',
  trimestral:'Trimestral', semestral:'Semestral', anual:'Anual', personalizada:'Personalizada',
};
const MANUT_FREQ_DIAS = { diaria:1, semanal:7, quinzenal:15, mensal:30, trimestral:90, semestral:180, anual:365 };

// ══════════════════════════════════════════════════════════════
// DADOS & PERSISTÊNCIA
// ══════════════════════════════════════════════════════════════

let manutItens = db._get('vtp_manut_itens', null);
let manutEquip = db._get('vtp_manut_equip', null);
let manutLog   = db._get('vtp_manut_log',   []);
const _saveManutI = () => db._set('vtp_manut_itens', manutItens);
const _saveManutE = () => db._set('vtp_manut_equip', manutEquip);
const _saveManutL = () => db._set('vtp_manut_log',   manutLog);

// ── Seed de equipamentos ──────────────────────────────────────
if (!manutEquip) {
  manutEquip = [
    // Produção Quente
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Forno de Lastro 1',       grupo:'producao_quente', categoria:'equipamento',  marca:'Prática',        modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Forno de Lastro 2',       grupo:'producao_quente', categoria:'equipamento',  marca:'Prática',        modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    // Refrigeração e Conservação
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Freezer Horizontal',      grupo:'refrigeracao',    categoria:'refrigeracao', marca:'Metalfrio',      modelo:'', numeroSerie:'', localizacao:'Estoque', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Geladeira 2 Portas',      grupo:'refrigeracao',    categoria:'refrigeracao', marca:'Esmaltec',       modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'media',   observacoes:'' },
    // Climatização e Exaustão
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Coifa Industrial',        grupo:'climatizacao',    categoria:'limpeza',      marca:'',               modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Ar-condicionado Salão',   grupo:'climatizacao',    categoria:'refrigeracao', marca:'Springer Midea', modelo:'', numeroSerie:'', localizacao:'Salão',   dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'media',   observacoes:'' },
    // Preparação e Processamento
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Abre Pizza',              grupo:'preparacao',      categoria:'equipamento',  marca:'',               modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Masseira',                grupo:'preparacao',      categoria:'equipamento',  marca:'Gastromaq',      modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    // Infraestrutura e Instalações
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Instalação Elétrica',     grupo:'infraestrutura',  categoria:'eletrica',     marca:'',               modelo:'', numeroSerie:'', localizacao:'Geral',   dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'critica', observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Instalação Hidráulica',   grupo:'infraestrutura',  categoria:'hidraulica',   marca:'',               modelo:'', numeroSerie:'', localizacao:'Geral',   dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'media',   observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Caixa de Gordura',        grupo:'infraestrutura',  categoria:'hidraulica',   marca:'',               modelo:'', numeroSerie:'', localizacao:'Cozinha', dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'alta',    observacoes:'' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Extintores',              grupo:'infraestrutura',  categoria:'estrutura',    marca:'',               modelo:'', numeroSerie:'', localizacao:'Geral',   dataCompra:'', garantiaAte:'', status:'ok',      criticidade:'critica', observacoes:'' },
  ];
  _saveManutE();
}

// ── Seed de itens de manutenção ──────────────────────────────
if (!manutItens) {
  const _eid = n => manutEquip.find(e => e.nome === n)?.id || null;
  manutItens = [
    // Produção Quente
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Limpeza Forno 1',               tipo:'preventiva',   categoria:'limpeza',      criticidade:'alta',    frequencia:'semanal',    diasCustom:null, ultimaExecucao:'2026-05-08', proximaExecucao:'2026-05-15', equipamentoId:_eid('Forno de Lastro 1'),    fornecedorId:null, responsavel:'', observacoes:'Remover resíduos com raspador', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Limpeza Forno 2',               tipo:'preventiva',   categoria:'limpeza',      criticidade:'alta',    frequencia:'semanal',    diasCustom:null, ultimaExecucao:'2026-05-01', proximaExecucao:'2026-05-08', equipamentoId:_eid('Forno de Lastro 2'),    fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Revisão técnica Forno 1',       tipo:'preventiva',   categoria:'equipamento',  criticidade:'alta',    frequencia:'semestral',  diasCustom:null, ultimaExecucao:'2025-11-01', proximaExecucao:'2026-05-01', equipamentoId:_eid('Forno de Lastro 1'),    fornecedorId:null, responsavel:'', observacoes:'Técnico especializado', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Climatização
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Limpeza da coifa',              tipo:'preventiva',   categoria:'limpeza',      criticidade:'alta',    frequencia:'mensal',     diasCustom:null, ultimaExecucao:'2026-04-01', proximaExecucao:'2026-05-01', equipamentoId:_eid('Coifa Industrial'),     fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Manutenção ar-condicionado',    tipo:'preventiva',   categoria:'refrigeracao', criticidade:'media',   frequencia:'semestral',  diasCustom:null, ultimaExecucao:'2025-12-01', proximaExecucao:'2026-06-01', equipamentoId:_eid('Ar-condicionado Salão'), fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Refrigeração
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Manutenção preventiva freezer', tipo:'preventiva',   categoria:'refrigeracao', criticidade:'alta',    frequencia:'anual',      diasCustom:null, ultimaExecucao:'2025-04-01', proximaExecucao:'2026-04-01', equipamentoId:_eid('Freezer Horizontal'),   fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Preparação
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Limpeza do abre pizza',         tipo:'preventiva',   categoria:'limpeza',      criticidade:'alta',    frequencia:'semanal',    diasCustom:null, ultimaExecucao:null,         proximaExecucao:null,         equipamentoId:_eid('Abre Pizza'),           fornecedorId:null, responsavel:'', observacoes:'Nunca registrado — verificar urgente', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Lubrificação da masseira',      tipo:'preventiva',   categoria:'equipamento',  criticidade:'media',   frequencia:'mensal',     diasCustom:null, ultimaExecucao:'2026-04-20', proximaExecucao:'2026-05-20', equipamentoId:_eid('Masseira'),             fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Infraestrutura
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Limpeza da caixa de gordura',   tipo:'preventiva',   categoria:'hidraulica',   criticidade:'alta',    frequencia:'mensal',     diasCustom:null, ultimaExecucao:'2026-04-16', proximaExecucao:'2026-05-16', equipamentoId:_eid('Caixa de Gordura'),     fornecedorId:null, responsavel:'', observacoes:'Empresa especializada', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Revisão elétrica geral',        tipo:'preventiva',   categoria:'eletrica',     criticidade:'critica', frequencia:'anual',      diasCustom:null, ultimaExecucao:'2025-04-01', proximaExecucao:'2026-04-01', equipamentoId:_eid('Instalação Elétrica'),  fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Revisão hidráulica',            tipo:'preventiva',   categoria:'hidraulica',   criticidade:'media',   frequencia:'anual',      diasCustom:null, ultimaExecucao:'2026-02-01', proximaExecucao:'2027-02-01', equipamentoId:_eid('Instalação Hidráulica'), fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Pragas
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Dedetização',                  tipo:'preventiva',   categoria:'pragas',       criticidade:'alta',    frequencia:'trimestral', diasCustom:null, ultimaExecucao:'2026-01-20', proximaExecucao:'2026-04-20', equipamentoId:null,                         fornecedorId:null, responsavel:'', observacoes:'Empresa especializada', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:null },
    // Certificações
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Licença Sanitária',            tipo:'certificacao', categoria:'documento',    criticidade:'critica', frequencia:'anual',      diasCustom:null, ultimaExecucao:null, proximaExecucao:null, equipamentoId:null, fornecedorId:null, responsavel:'', observacoes:'Renovar na Vigilância Sanitária', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:'2026-05-20' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Alvará de Funcionamento',      tipo:'certificacao', categoria:'documento',    criticidade:'critica', frequencia:'anual',      diasCustom:null, ultimaExecucao:null, proximaExecucao:null, equipamentoId:null, fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:'2026-07-31' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Cert. Corpo de Bombeiros',     tipo:'certificacao', categoria:'documento',    criticidade:'critica', frequencia:'anual',      diasCustom:null, ultimaExecucao:null, proximaExecucao:null, equipamentoId:null, fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:'2026-09-01' },
    { id:crypto.randomUUID(), created_at:new Date().toISOString(), nome:'Certificado de Extintores',    tipo:'certificacao', categoria:'documento',    criticidade:'critica', frequencia:'anual',      diasCustom:null, ultimaExecucao:null, proximaExecucao:null, equipamentoId:_eid('Extintores'),           fornecedorId:null, responsavel:'', observacoes:'', statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', vencimento:'2026-08-15' },
  ];
  _saveManutI();
}

// ── Migrações ─────────────────────────────────────────────────
(function _migrarManut() {
  const OLD_GRUPOS = ['equipamento','predial','seguranca','higiene'];
  let saveI = false, saveE = false;

  manutItens.forEach(i => {
    if (i.tipo === 'documento' || i.isDocumento) { i.tipo = 'certificacao'; saveI = true; }
    if (i.tipo === 'corretiva' && i.statusCorretiva === undefined) {
      i.statusCorretiva = i.ultimaExecucao ? 'resolvida' : 'aberta';
      saveI = true;
    }
  });

  manutEquip.forEach(e => {
    const grupoAtual = e.grupo || '';
    if (!grupoAtual || OLD_GRUPOS.includes(grupoAtual)) {
      const cat  = e.categoria || '';
      const nome = (e.nome || '').toLowerCase();
      const isClimat = nome.includes('coifa') || nome.includes('exhaust') || nome.includes('ar-cond') || nome.includes('ar cond') || nome.includes('ventilad') || nome.includes('climatiz');
      if (grupoAtual === 'predial' || grupoAtual === 'seguranca' || ['eletrica','hidraulica','estrutura'].includes(cat)) {
        e.grupo = 'infraestrutura';
      } else if (grupoAtual === 'higiene' || cat === 'pragas') {
        e.grupo = 'utensilios';
      } else if (isClimat) {
        e.grupo = 'climatizacao';
      } else if (cat === 'refrigeracao' || nome.includes('freezer') || nome.includes('gelad') || nome.includes('câmara')) {
        e.grupo = 'refrigeracao';
      } else if (nome.includes('forno') || nome.includes('chapa') || nome.includes('fritadeira') || nome.includes('fogão')) {
        e.grupo = 'producao_quente';
      } else if (nome.includes('masseira') || nome.includes('abre pizza') || nome.includes('cilindro') || nome.includes('processador') || nome.includes('batedeira') || nome.includes('fatiador')) {
        e.grupo = 'preparacao';
      } else {
        e.grupo = 'preparacao';
      }
      saveE = true;
    }
  });

  if (saveI) _saveManutI();
  if (saveE) _saveManutE();
})();

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

const _isCert      = i => i.tipo === 'certificacao' || i.tipo === 'documento' || i.isDocumento;
const _isPreventiva= i => i.tipo === 'preventiva';
const _isCorretiva = i => i.tipo === 'corretiva';

function _manutProxima(ultimaExecucao, frequencia, diasCustom) {
  if (!ultimaExecucao) return null;
  const d = new Date(ultimaExecucao + 'T00:00:00');
  d.setDate(d.getDate() + (MANUT_FREQ_DIAS[frequencia] ?? (diasCustom || 30)));
  return d.toISOString().slice(0, 10);
}

function _manutCalcStatus(item) {
  if (_isCorretiva(item)) return item.statusCorretiva === 'resolvida' ? 'em_dia' : 'atrasado';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const ref  = _isCert(item) ? item.vencimento : item.proximaExecucao;
  if (!ref) {
    // Já foi executada mas sem próxima agendada → fora da lista ativa
    if (_isPreventiva(item) && item.ultimaExecucao) return 'em_dia';
    return 'pendente';
  }
  const diff = Math.round((new Date(ref + 'T00:00:00') - hoje) / 86400000);
  return diff < 0 ? 'atrasado' : diff <= 7 ? 'pendente' : 'em_dia';
}

function _manutUrgenciaInfo(item) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const ref = _isCert(item) ? item.vencimento : item.proximaExecucao;
  if (!ref) return { color:'var(--muted)', icon:'calendar', texto: _isCert(item) ? 'Vencimento não definido' : 'Nunca executado', diff: null };
  const diff = Math.round((new Date(ref + 'T00:00:00') - hoje) / 86400000);
  const prefixo = _isCert(item) ? 'Vence' : 'Próxima';
  if (diff < 0)   return { color:'var(--red)',         icon:'alert-circle',   texto:`Atrasado ${Math.abs(diff)}d`,                      diff };
  if (diff === 0) return { color:'var(--red)',         icon:'alert-circle',   texto:'Hoje!',                                             diff };
  if (diff <= 7)  return { color:'var(--orange-dark)', icon:'alert-triangle', texto:`${prefixo} em ${diff}d · ${fmtD(ref)}`,             diff };
  if (diff <= 30) return { color:'var(--yellow)',      icon:'clock',          texto:`${prefixo} em ${diff}d · ${fmtD(ref)}`,             diff };
  return              { color:'var(--muted)',         icon:'calendar',       texto:`${prefixo}: ${fmtD(ref)}`,                          diff };
}

function _manutSortScore(item) {
  const s = _manutCalcStatus(item);
  const c = { critica:0, alta:1, media:2, baixa:3 }[item.criticidade] ?? 2;
  return ({ atrasado:0, pendente:100, em_dia:300 }[s] ?? 400) + c;
}

function _ultimaManutEquip(equipId) {
  const logs = manutLog.filter(l => l.equipamentoId === equipId)
    .sort((a, b) => new Date(b.dataExecucao) - new Date(a.dataExecucao));
  if (logs.length) return { fonte:'log', nome: logs[0].nome, data: logs[0].dataExecucao };
  const items = manutItens.filter(i => i.equipamentoId === equipId && i.ultimaExecucao)
    .sort((a, b) => new Date(b.ultimaExecucao) - new Date(a.ultimaExecucao));
  if (items.length) return { fonte:'item', nome: items[0].nome, data: items[0].ultimaExecucao };
  return null;
}

function _proximaPreventiva(equipId) {
  return manutItens
    .filter(i => i.equipamentoId === equipId && _isPreventiva(i) && i.proximaExecucao)
    .sort((a, b) => new Date(a.proximaExecucao) - new Date(b.proximaExecucao))[0] || null;
}

function _statusEquip(equipId) {
  const itens = manutItens.filter(i => i.equipamentoId === equipId);
  if (!itens.length) return 'ok';
  const statuses = itens.map(_manutCalcStatus);
  if (statuses.includes('atrasado')) return 'atrasado';
  if (statuses.includes('pendente')) return 'pendente';
  return 'ok';
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function verificarAlertasManutencao() {
  if (typeof criarAlerta !== 'function') return;
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  manutItens.forEach(item => {
    if (_isPreventiva(item)) {
      const st = _manutCalcStatus(item);
      if (st === 'atrasado') {
        const equip = manutEquip.find(e => e.id === item.equipamentoId);
        const nomeEquip = equip ? equip.nome : (item.equipamentoNome || 'equipamento');
        criarAlerta({
          tipo: 'manutencao_atrasada',
          titulo: `Manutenção atrasada: ${item.nome}`,
          mensagem: `Preventiva "${item.nome}" do ${nomeEquip} está em atraso.`,
          modulo: 'manutencao',
          destino_roles: ['gerente', 'supervisor'],
          referencia_id: item.id,
          acao_label: 'Ver Manutenção',
          acao_modulo: 'manutencao',
        });
      }
    }
    if (_isCert(item) && item.vencimento) {
      const venc = new Date(item.vencimento); venc.setHours(0,0,0,0);
      const diasRestantes = Math.round((venc - hoje) / 86400000);
      if (diasRestantes >= 0 && diasRestantes <= 30) {
        criarAlerta({
          tipo: 'manutencao_cert_vencendo',
          titulo: `Certificação vencendo: ${item.nome}`,
          mensagem: `"${item.nome}" vence em ${diasRestantes === 0 ? 'hoje' : diasRestantes + ' dia' + (diasRestantes !== 1 ? 's' : '')}.`,
          modulo: 'manutencao',
          destino_roles: ['gerente', 'supervisor'],
          referencia_id: item.id,
          acao_label: 'Ver Certificações',
          acao_modulo: 'manutencao',
        });
      } else if (diasRestantes < 0) {
        criarAlerta({
          tipo: 'manutencao_cert_vencendo',
          titulo: `Certificação vencida: ${item.nome}`,
          mensagem: `"${item.nome}" venceu há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) !== 1 ? 's' : ''}.`,
          modulo: 'manutencao',
          destino_roles: ['gerente', 'supervisor'],
          referencia_id: item.id,
          acao_label: 'Ver Certificações',
          acao_modulo: 'manutencao',
        });
      }
    }
  });
}

function renderManutencao() {
  const el = document.getElementById('page-manutencao');
  if (!el) return;

  verificarAlertasManutencao();

  const nPrevAtras  = manutItens.filter(i => _isPreventiva(i) && _manutCalcStatus(i) === 'atrasado').length;
  const nPrevPend   = manutItens.filter(i => _isPreventiva(i) && _manutCalcStatus(i) === 'pendente').length;
  const nCertAlerta = manutItens.filter(i => _isCert(i) && _manutCalcStatus(i) !== 'em_dia').length;
  const nCorrAberta = manutItens.filter(i => _isCorretiva(i) && i.statusCorretiva !== 'resolvida').length;

  const nInvRuim = (_getManutInv()).filter(i => i.qualidade === 'ruim' || i.qualidade === 'substituir').length;

  const tabs = [
    { id:'visao_geral',   label:'Visão Geral',   icon:'layout-dashboard', badge:0                      },
    { id:'preventivas',   label:'Preventivas',   icon:'repeat',           badge:nPrevAtras + nPrevPend  },
    { id:'certificacoes', label:'Licenças e Alvarás', icon:'file-badge',   badge:nCertAlerta             },
    { id:'corretivas',    label:'Corretivas',    icon:'alert-triangle',   badge:nCorrAberta             },
    { id:'inventario',    label:'Inventário',    icon:'package-check',    badge:nInvRuim                },
    { id:'historico',     label:'Histórico',     icon:'clock',            badge:0                      },
  ];

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding:0 24px;background:var(--surface);flex-wrap:wrap">
      <div style="display:flex;gap:0;overflow-x:auto">
        ${tabs.map(t => {
          const active = _manutTab === t.id;
          return `<button onclick="_manutSetTab('${t.id}')"
            style="display:flex;align-items:center;gap:6px;padding:13px 14px;border:none;border-bottom:2.5px solid ${active?'var(--purple)':'transparent'};
            background:none;color:${active?'var(--purple)':'var(--muted)'};font-size:var(--text-sm);font-weight:${active?'700':'500'};
            cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">
            ${lc(t.icon,13,'currentColor')} ${t.label}
            ${t.badge > 0 ? `<span style="padding:1px 6px;border-radius:10px;background:${t.id==='corretivas'?'var(--red)':active?'var(--purple)':'var(--orange-dark)'};color:#fff;font-size:var(--text-2xs);font-weight:800">${t.badge}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
      <div id="manutHeaderAcao" style="padding:8px 0"></div>
    </div>
    <div id="manutContent" style="padding:24px;max-width:1100px"></div>`;

  _manutRenderConteudo();
}

function _manutSetTab(tab) {
  _manutTab         = tab;
  _manutFiltro      = 'todos';
  _manutEquipFiltro = null;
  if (tab !== 'preventivas') _manutAgendaAberto = false;
  renderManutencao();
}

function _manutRenderConteudo() {
  if      (_manutTab === 'visao_geral')   _manutRenderVisaoGeral();
  else if (_manutTab === 'preventivas')   _manutRenderPreventivas();
  else if (_manutTab === 'certificacoes') _manutRenderCertificacoes();
  else if (_manutTab === 'corretivas')    _manutRenderCorretivas();
  else if (_manutTab === 'inventario')    _manutRenderInventario();
  else if (_manutTab === 'historico')     _manutRenderHistorico();
}

// ══════════════════════════════════════════════════════════════
// ABA 1 — VISÃO GERAL
// ══════════════════════════════════════════════════════════════

function _manutRenderVisaoGeral() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');

  if (header) header.innerHTML = `
    <button onclick="manutAbrirModalEquip(null)"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--r8);
      border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:var(--text-sm);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
      ${lc('plus',13,'currentColor')} Equipamento
    </button>`;

  const nPrevAtras  = manutItens.filter(i => _isPreventiva(i) && _manutCalcStatus(i) === 'atrasado').length;
  const nPrevPend   = manutItens.filter(i => _isPreventiva(i) && _manutCalcStatus(i) === 'pendente').length;
  const nCertAlerta = manutItens.filter(i => _isCert(i) && _manutCalcStatus(i) !== 'em_dia').length;
  const nCorrAberta = manutItens.filter(i => _isCorretiva(i) && i.statusCorretiva !== 'resolvida').length;

  const _gastoMes = () => {
    const corte = new Date(); corte.setDate(corte.getDate() - 30); corte.setHours(0,0,0,0);
    return manutLog.filter(l => l.valor && new Date(l.dataExecucao+'T00:00:00') >= corte)
      .reduce((s, l) => s + (l.valor || 0), 0);
  };
  const gastoMes = _gastoMes();

  const kpiStrip = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:24px">
      ${_kpiCard(String(nPrevAtras), 'Atrasadas', 'alert-circle', 'var(--red)', 'var(--red-light)', nPrevAtras > 0)}
      ${_kpiCard(String(nPrevPend),  'Esta semana', 'alert-triangle', 'var(--orange-dark)', 'var(--orange-light)', nPrevPend > 0)}
      ${_kpiCard(String(nCertAlerta),'Licenças a vencer', 'file-badge', 'var(--yellow)', 'var(--yellow-light)', nCertAlerta > 0)}
      ${_kpiCard(String(nCorrAberta),'Corretivas abertas', 'tool', 'var(--purple)', 'var(--purple-xlight)', nCorrAberta > 0)}
      ${_kpiCard('R$ ' + fmt(gastoMes), 'Gasto (30 dias)', 'receipt', 'var(--green)', 'var(--green-light)', gastoMes > 0)}
    </div>`;

  // Grupos de equipamentos
  const gruposAtivos = Object.entries(manutGrupos).filter(([k]) =>
    manutEquip.some(e => (e.grupo || 'preparacao') === k)
  );

  const secoes = gruposAtivos.map(([grupoKey, grupo]) => {
    const equips = manutEquip.filter(e => (e.grupo || 'preparacao') === grupoKey)
      .sort((a, b) => {
        const sa = _statusEquip(a.id), sb = _statusEquip(b.id);
        const order = { atrasado:0, pendente:1, ok:2 };
        return (order[sa]??2) - (order[sb]??2);
      });

    const cards = equips.map(e => _cardEquipVisao(e)).join('');

    return `
      <div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="width:30px;height:30px;border-radius:var(--r8);background:${grupo.bg};display:flex;align-items:center;justify-content:center">
            ${lc(grupo.icon, 15, grupo.color)}
          </div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:800">${grupo.label}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted)">${equips.length} item${equips.length!==1?'s':''}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${cards}
        </div>
      </div>`;
  }).join('');

  // Certificações rápidas
  const certs = manutItens.filter(_isCert).sort((a, b) => _manutSortScore(a) - _manutSortScore(b));
  const certStrip = certs.length ? `
    <div style="margin-top:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="width:30px;height:30px;border-radius:var(--r8);background:var(--surface2);display:flex;align-items:center;justify-content:center">
          ${lc('file-badge', 15, 'var(--muted)')}
        </div>
        <div>
          <div style="font-size:var(--text-sm);font-weight:800">Licenças e Alvarás</div>
          <div style="font-size:var(--text-2xs);color:var(--muted)">${certs.length} licença${certs.length!==1?'s':''} / alvará${certs.length!==1?'s':''}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${certs.map(c => _rowCertResumida(c)).join('')}
      </div>
    </div>` : '';

  content.innerHTML = kpiStrip + secoes + certStrip;
}

function _kpiCard(valor, label, icon, color, bg, ativo) {
  return `<div style="padding:12px 14px;border:1.5px solid ${ativo?color:'var(--border)'};border-radius:var(--r10);background:${ativo?bg:'var(--surface)'}">
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
      ${lc(icon, 14, ativo ? color : 'var(--muted)')}
      <span style="font-size:1.2rem;font-weight:800;color:${ativo?color:'var(--muted)'}">${valor}</span>
    </div>
    <div style="font-size:var(--text-2xs);color:${ativo?color:'var(--muted)'}; font-weight:${ativo?'700':'500'}">${label}</div>
  </div>`;
}

function _cardEquipVisao(e) {
  const status = _statusEquip(e.id);
  const cat    = manutCats[e.categoria] || manutCats.outros;
  const ultima = _ultimaManutEquip(e.id);
  const proxima= _proximaPreventiva(e.id);
  const urgInfo= proxima ? _manutUrgenciaInfo(proxima) : null;

  const statusColor = status === 'atrasado' ? 'var(--red)' : status === 'pendente' ? 'var(--orange-dark)' : 'var(--green)';
  const statusLabel = status === 'atrasado' ? 'Atrasado' : status === 'pendente' ? 'A vencer' : 'OK';
  const borderColor = status === 'atrasado' ? 'var(--red)' : status === 'pendente' ? 'var(--yellow)' : 'var(--border)';

  return `
  <div onclick="manutVerEquipamento('${e.id}')"
    style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px solid ${borderColor};
    border-radius:var(--r8);background:var(--surface);cursor:pointer;transition:background .12s"
    onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='var(--surface)'">
    <div style="width:36px;height:36px;border-radius:var(--r8);background:${cat.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
      ${lc(cat.icon, 16, cat.color)}
    </div>
    <div style="flex:1;min-width:0">
      <div style="font-size:var(--text-sm);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.nome}</div>
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${[e.marca, e.localizacao].filter(Boolean).map(t => `<span>${t}</span>`).join('<span style="opacity:.4">·</span>')}
        ${ultima ? `<span style="color:var(--text2)">${lc('calendar',8,'var(--muted)')} ${fmtD(ultima.data)}</span>` : `<span style="color:var(--red);font-weight:600">${lc('alert-circle',9,'currentColor')} Sem registros</span>`}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
      ${urgInfo ? `<span style="font-size:var(--text-xs);color:${urgInfo.color};display:flex;align-items:center;gap:3px;font-weight:600;white-space:nowrap">${lc(urgInfo.icon,10,'currentColor')} ${urgInfo.texto}</span>` : `<span style="font-size:var(--text-xs);color:var(--muted)">Sem preventiva</span>`}
      <span style="padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-size:var(--text-2xs);font-weight:800;border:1px solid ${statusColor};white-space:nowrap">${statusLabel}</span>
    </div>
  </div>`;
}

function _rowCertResumida(c) {
  const urgInfo = _manutUrgenciaInfo(c);
  const crit    = MANUT_CRIT[c.criticidade] || MANUT_CRIT.media;
  return `
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid ${urgInfo.color === 'var(--muted)' ? 'var(--border)' : urgInfo.color};border-radius:var(--r8);background:var(--surface)">
    ${lc('file-text', 14, urgInfo.color)}
    <div style="flex:1">
      <div style="font-size:var(--text-sm);font-weight:700">${c.nome}</div>
      ${c.vencimento ? `<div style="font-size:var(--text-2xs);color:${urgInfo.color};font-weight:600;margin-top:1px">${urgInfo.texto}</div>` : ''}
    </div>
    <span style="padding:2px 8px;border-radius:10px;background:${crit.bg};color:${crit.color};font-size:var(--text-2xs);font-weight:700;flex-shrink:0">${crit.label}</span>
    <button onclick="event.stopPropagation();manutAbrirModalLicenca('${c.id}')"
      style="padding:4px 8px;border-radius:var(--r6);border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer">
      ${lc('edit-2', 11, 'currentColor')}
    </button>
  </div>`;
}

function manutVerEquipamento(equipId) {
  const e    = manutEquip.find(x => x.id === equipId);
  if (!e) return;
  const grupo = manutGrupos[e.grupo || 'preparacao'];
  const cat   = manutCats[e.categoria] || manutCats.outros;
  const logs  = manutLog.filter(l => l.equipamentoId === equipId)
    .sort((a,b) => new Date(b.dataExecucao) - new Date(a.dataExecucao));
  const itens = manutItens.filter(i => i.equipamentoId === equipId);

  document.getElementById('popupEquipDetalhe')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupEquipDetalhe';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
      <!-- Header -->
      <div style="padding:18px 20px 14px;border-bottom:1.5px solid var(--border);background:${cat.bg}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:44px;height:44px;border-radius:var(--r10);background:var(--surface);display:flex;align-items:center;justify-content:center">
              ${lc(cat.icon, 22, cat.color)}
            </div>
            <div>
              <div style="font-size:var(--text-base);font-weight:800">${e.nome}</div>
              <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${[e.marca, e.modelo, e.localizacao].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <button onclick="document.getElementById('popupEquipDetalhe').remove()"
            style="background:none;border:none;cursor:pointer;padding:4px;color:var(--muted)">
            ${lc('x', 18, 'currentColor')}
          </button>
        </div>
        ${e.observacoes ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:8px;font-style:italic">${e.observacoes}</div>` : ''}
      </div>

      <div style="padding:16px 20px;max-height:65vh;overflow-y:auto">

        <!-- Manutenções vinculadas -->
        ${itens.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Manutenções programadas</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${itens.map(i => {
              const urgInfo = _manutUrgenciaInfo(i);
              const tipoBadge = _isCert(i) ? 'Certif.' : _isCorretiva(i) ? 'Corretiva' : 'Preventiva';
              const tipoCor   = _isCert(i) ? 'var(--muted)' : _isCorretiva(i) ? 'var(--red)' : 'var(--purple)';
              return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface2)">
                <div style="flex:1">
                  <div style="font-size:var(--text-sm);font-weight:600">${i.nome}</div>
                  <div style="font-size:var(--text-2xs);color:${urgInfo.color};margin-top:1px">${urgInfo.texto}</div>
                </div>
                <span style="font-size:var(--text-2xs);padding:1px 6px;border-radius:8px;background:${tipoCor}22;color:${tipoCor};border:1px solid ${tipoCor};white-space:nowrap">${tipoBadge}</span>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Histórico -->
        <div>
          <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">
            Histórico de execuções ${logs.length ? `(${logs.length})` : ''}
          </div>
          ${logs.length ? `
          <div style="display:flex;flex-direction:column;gap:4px">
            ${logs.slice(0,10).map(l => `
              <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--r8)">
                <div style="width:7px;height:7px;border-radius:50%;background:var(--green);margin-top:5px;flex-shrink:0"></div>
                <div style="flex:1">
                  <div style="font-size:var(--text-sm);font-weight:600">${l.nome}</div>
                  ${l.descricao ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px">${l.descricao}</div>` : ''}
                  <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px;display:flex;gap:8px">
                    <span>${lc('calendar',8,'var(--muted)')} ${fmtD(l.dataExecucao)}</span>
                    ${l.responsavel ? `<span>${lc('user',8,'var(--muted)')} ${l.responsavel}</span>` : ''}
                    ${l.valor ? `<span style="color:var(--purple);font-weight:700">R$ ${fmt(l.valor)}</span>` : ''}
                  </div>
                </div>
              </div>`).join('')}
          </div>` : `
          <div style="text-align:center;padding:24px 0;color:var(--muted)">
            ${lc('clock',24,'var(--border)')}
            <div style="font-size:var(--text-sm);margin-top:8px">Nenhuma execução registrada ainda</div>
          </div>`}
        </div>
      </div>

      <div style="padding:14px 20px;border-top:1.5px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="manutAbrirModalEquip('${e.id}');document.getElementById('popupEquipDetalhe').remove()">
          ${lc('edit-2',13,'currentColor')} Editar
        </button>
        <button class="btn btn-primary" onclick="manutAbrirRegistrar(null,'${e.id}');document.getElementById('popupEquipDetalhe').remove()">
          ${lc('check-circle',13,'#fff')} Registrar manutenção
        </button>
      </div>
    </div>`;

  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

// ══════════════════════════════════════════════════════════════
// ABA 2 — PREVENTIVAS
// ══════════════════════════════════════════════════════════════

function _manutRenderPreventivas() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');
  if (header) header.innerHTML = `
    <button onclick="manutAbrirModalItem(null,'preventiva')"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--r8);
      border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
      ${lc('plus',13,'#fff')} Nova preventiva
    </button>`;

  let itens = manutItens.filter(_isPreventiva);
  if (_manutEquipFiltro) itens = itens.filter(i => i.equipamentoId === _manutEquipFiltro);

  const ativas    = itens.filter(i => { const s = _manutCalcStatus(i); return s === 'atrasado' || s === 'pendente'; })
    .sort((a, b) => _manutSortScore(a) - _manutSortScore(b));
  const agendadas = itens.filter(i => _manutCalcStatus(i) === 'em_dia')
    .sort((a, b) => {
      const da = a.proximaExecucao || '9999'; const db = b.proximaExecucao || '9999';
      return da.localeCompare(db);
    });

  const equipFiltroNome = _manutEquipFiltro ? manutEquip.find(e => e.id === _manutEquipFiltro)?.nome : null;

  content.innerHTML = `
    ${equipFiltroNome ? `
    <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:var(--r8);background:var(--purple-xlight);border:1.5px solid var(--purple-light);margin-bottom:12px;font-size:var(--text-sm);font-weight:600;color:var(--purple)">
      ${lc('filter',11,'currentColor')} ${equipFiltroNome}
      <button onclick="_manutEquipFiltro=null;_manutRenderPreventivas()" style="background:none;border:none;cursor:pointer;color:var(--purple);padding:0;margin-left:4px">${lc('x',11,'currentColor')}</button>
    </div>` : ''}

    ${ativas.length
      ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">${ativas.map(_manutCardItem).join('')}</div>`
      : `<div style="display:flex;align-items:center;gap:10px;padding:18px 20px;border:1.5px solid var(--green);border-radius:var(--r10);background:var(--green-light);margin-bottom:20px">
          ${lc('check-circle',18,'var(--green)')}
          <div>
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--green)">Tudo em dia</div>
            <div style="font-size:var(--text-xs);color:var(--green);opacity:.8">Nenhuma preventiva atrasada ou próxima do prazo</div>
          </div>
        </div>`
    }

    <!-- Agendadas -->
    <div style="border-top:1.5px solid var(--border);padding-top:12px">
      <button onclick="_manutAgendaAberto=!_manutAgendaAberto;_manutRenderPreventivas()"
        style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;cursor:pointer;padding:0;margin-bottom:${_manutAgendaAberto?'12':'0'}px">
        <span style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">
          Agendadas
        </span>
        <span style="padding:1px 7px;border-radius:8px;background:var(--surface2);color:var(--muted);font-size:var(--text-2xs);font-weight:700">${agendadas.length}</span>
        <span style="margin-left:auto;color:var(--muted)">${lc(_manutAgendaAberto?'chevron-up':'chevron-down',14,'currentColor')}</span>
      </button>

      ${_manutAgendaAberto ? (agendadas.length
        ? `<div style="display:flex;flex-direction:column;gap:5px">${agendadas.map(_manutCardAgendada).join('')}</div>`
        : `<div style="padding:16px 0;text-align:center;color:var(--muted);font-size:var(--text-sm)">Nenhuma preventiva agendada</div>`
      ) : ''}
    </div>`;
}

function _manutCardAgendada(item) {
  const equip   = item.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  const sup     = item.fornecedorId && typeof suppliers !== 'undefined' ? suppliers.find(s => s.id === item.fornecedorId) : null;
  const cat     = manutCats[item.categoria] || manutCats.outros;
  const urgInfo = _manutUrgenciaInfo(item);
  const semData = !item.proximaExecucao;

  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border:1.5px solid var(--border);
    border-radius:var(--r8);background:var(--surface)">
    <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:8px;background:${cat.bg};color:${cat.color};font-size:var(--text-2xs);font-weight:600;white-space:nowrap;flex-shrink:0">${lc(cat.icon,9,'currentColor')} ${cat.label}</span>
    <div style="flex:1;min-width:0">
      <span style="font-size:var(--text-sm);font-weight:600">${item.nome}</span>
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;display:flex;gap:8px;flex-wrap:wrap">
        ${equip ? `<span>${lc('cpu',8,'var(--muted)')} ${equip.nome}</span>` : ''}
        ${sup   ? `<span>${lc('building-2',8,'var(--muted)')} ${sup.name}</span>` : ''}
      </div>
    </div>
    <span style="font-size:var(--text-xs);font-weight:600;color:${semData?'var(--muted)':urgInfo.color};white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:3px">
      ${semData ? `${lc('minus-circle',10,'var(--muted)')} Sem reagendamento` : `${lc('calendar',10,'currentColor')} ${urgInfo.texto}`}
    </span>
    <div style="display:flex;gap:4px;flex-shrink:0">
      <button onclick="manutAbrirRegistrar('${item.id}')" style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--purple);font-size:var(--text-xs);font-weight:600;cursor:pointer;font-family:Inter,sans-serif;white-space:nowrap">${lc('check-circle',11,'currentColor')} Registrar</button>
      <button onclick="manutAbrirModalItem('${item.id}')" style="padding:4px 7px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer">${lc('edit-2',11,'currentColor')}</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ABA 3 — CERTIFICAÇÕES
// ══════════════════════════════════════════════════════════════

function _manutRenderCertificacoes() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');
  if (header) header.innerHTML = `
    <button onclick="manutAbrirModalLicenca(null)"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--r8);
      border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
      ${lc('plus',13,'#fff')} Nova licença / alvará
    </button>`;

  const certs = [...manutItens.filter(_isCert)]
    .sort((a,b) => _manutSortScore(a) - _manutSortScore(b));

  if (!certs.length) {
    content.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--muted)">${lc('file-badge',36,'var(--border)')}<div style="margin-top:12px;font-size:var(--text-md)">Nenhuma licença ou alvará cadastrado</div><div style="font-size:var(--text-sm);margin-top:6px">Cadastre alvarás, licenças sanitárias, certificados e documentos regulatórios</div></div>`;
    return;
  }

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${certs.map(c => _cardCertificacao(c)).join('')}
    </div>`;
}

function _cardCertificacao(c) {
  const urgInfo = _manutUrgenciaInfo(c);
  const crit    = MANUT_CRIT[c.criticidade] || MANUT_CRIT.media;
  const hoje    = new Date(); hoje.setHours(0,0,0,0);
  const status  = _manutCalcStatus(c);

  // Barra de validade
  const validadeBar = (() => {
    if (!c.vencimento || !c.ultimaExecucao) return '';
    const inicio = new Date(c.ultimaExecucao + 'T00:00:00');
    const fim    = new Date(c.vencimento     + 'T00:00:00');
    const total  = fim - inicio;
    const usado  = hoje - inicio;
    if (total <= 0) return '';
    const pct = Math.max(0, Math.min(100, Math.round(usado / total * 100)));
    const barColor = status === 'atrasado' ? 'var(--red)' : status === 'pendente' ? 'var(--orange-dark)' : 'var(--green)';
    return `
      <div style="margin:10px 0 6px">
        <div style="display:flex;justify-content:space-between;font-size:var(--text-2xs);color:var(--muted);margin-bottom:3px">
          <span>Emitido: ${fmtD(c.ultimaExecucao)}</span>
          <span>Vence: ${fmtD(c.vencimento)}</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .3s"></div>
        </div>
      </div>`;
  })();

  const borderColor = status === 'atrasado' ? 'var(--red)' : status === 'pendente' ? 'var(--yellow)' : 'var(--border)';

  return `
  <div style="border:1.5px solid ${borderColor};border-radius:var(--r12);background:var(--surface);overflow:hidden">
    <div style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:38px;height:38px;border-radius:var(--r8);background:${urgInfo.color === 'var(--muted)' ? 'var(--surface2)' : urgInfo.color + '22'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc('file-text', 18, urgInfo.color)}
          </div>
          <div>
            <div style="font-size:var(--text-md);font-weight:700">${c.nome}</div>
            <div style="font-size:var(--text-2xs);color:${urgInfo.color};font-weight:600;display:flex;align-items:center;gap:4px;margin-top:2px">
              ${lc(urgInfo.icon, 10, 'currentColor')} ${urgInfo.texto}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="padding:2px 8px;border-radius:10px;background:${crit.bg};color:${crit.color};font-size:var(--text-2xs);font-weight:700">${crit.label}</span>
        </div>
      </div>
      ${validadeBar}
      ${c.observacoes ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:4px;font-style:italic">${lc('info',9,'var(--muted)')} ${c.observacoes}</div>` : ''}
    </div>
    <div style="padding:8px 16px;border-top:1px solid var(--border);background:var(--surface2);display:flex;align-items:center;justify-content:flex-end;gap:6px">
      <button onclick="manutAbrirModalLicenca('${c.id}')"
        style="padding:4px 10px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:var(--text-xs);font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px">
        ${lc('edit-2',11,'currentColor')} Editar
      </button>
      <button onclick="manutAbrirRenovarCert('${c.id}')"
        style="padding:4px 12px;border-radius:var(--r6);border:none;background:var(--purple);color:#fff;font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px">
        ${lc('refresh-cw',11,'#fff')} Renovar
      </button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODAL: NOVA / EDITAR LICENÇA & ALVARÁ (certificação simplificada)
// ══════════════════════════════════════════════════════════════

function manutAbrirModalLicenca(itemId) {
  const item = itemId ? manutItens.find(i => i.id === itemId) : null;
  document.getElementById('popupManutLicenca')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupManutLicenca';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:8px">
          ${lc('file-badge',15,'var(--purple)')} ${item ? 'Editar licença / alvará' : 'Nova licença / alvará'}
        </div>
        <button onclick="document.getElementById('popupManutLicenca').remove()" style="background:none;border:none;cursor:pointer">${lc('x',16,'var(--muted)')}</button>
      </div>
      <div class="field"><label>Nome do documento *</label>
        <input type="text" id="mlcNome" class="inp" value="${item?.nome||''}" placeholder="Ex: Licença Sanitária, Alvará de Funcionamento">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Data de vencimento *</label>
          <input type="date" id="mlcVenc" class="inp" value="${item?.vencimento||''}">
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Valor (R$)</label>
          <input type="number" id="mlcValor" class="inp" placeholder="0,00" min="0" step="0.01">
        </div>
      </div>
      <div class="field"><label>Responsável por renovar</label>
        <input type="text" id="mlcResp" class="inp" value="${item?.responsavel||''}" placeholder="Nome">
      </div>
      <div class="field"><label>Observações</label>
        <input type="text" id="mlcObs" class="inp" value="${item?.observacoes||''}" placeholder="Órgão emissor, processo, etc.">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutLicenca').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutSalvarLicenca('${itemId||''}')">
          ${lc('check',13,'#fff')} ${item ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function manutSalvarLicenca(itemId) {
  const nome = document.getElementById('mlcNome')?.value.trim();
  const venc = document.getElementById('mlcVenc')?.value;
  if (!nome) { toast('Informe o nome do documento', 'err'); return; }
  if (!venc) { toast('Informe a data de vencimento', 'err'); return; }
  const data = {
    nome, tipo:'certificacao', isDocumento:true,
    categoria:      'documento',
    criticidade:    'critica',
    frequencia:     'anual',
    diasCustom:     null,
    ultimaExecucao: null,
    proximaExecucao:null,
    vencimento:     venc,
    equipamentoId:  null,
    fornecedorId:   null,
    responsavel:    document.getElementById('mlcResp')?.value.trim() || '',
    observacoes:    document.getElementById('mlcObs')?.value.trim()  || '',
    statusCorretiva:null,
    dataResolucao:  null,
    descricaoResolucao:'',
    resolvidoPor:   '',
    updated_at:     new Date().toISOString(),
  };
  if (itemId) {
    const idx = manutItens.findIndex(i => i.id === itemId);
    if (idx >= 0) manutItens[idx] = { ...manutItens[idx], ...data };
    toast('Licença atualizada!');
  } else {
    manutItens.push({ id:crypto.randomUUID(), created_at:new Date().toISOString(), ...data });
    toast('Licença adicionada!');
  }
  const valor = parseFloat(document.getElementById('mlcValor')?.value);
  if (!isNaN(valor) && valor > 0) {
    const log = {
      id:crypto.randomUUID(), created_at:new Date().toISOString(),
      itemId: itemId || manutItens[manutItens.length-1]?.id || null,
      equipamentoId:null, nome:`Emissão/cadastro: ${nome}`, tipo:'certificacao',
      categoria:'documento', fornecedorId:null,
      responsavel:document.getElementById('mlcResp')?.value.trim()||'',
      dataExecucao:new Date().toISOString().slice(0,10), horaExecucao:'',
      valor, descricao:'', fotoUrl:'', proximaRecomendada:venc,
    };
    manutLog.push(log);
    _saveManutL();
  }
  _saveManutI();
  document.getElementById('popupManutLicenca')?.remove();
  _manutTab = 'certificacoes';
  renderManutencao();
}

// ── MODAL: Renovar licença / alvará ──────────────────────────

function manutAbrirRenovarCert(itemId) {
  const item = manutItens.find(i => i.id === itemId);
  if (!item) return;
  document.getElementById('popupManutRenov')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupManutRenov';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  const hoje = new Date().toISOString().slice(0,10);
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:var(--text-md);font-weight:800;display:flex;align-items:center;gap:8px">
          ${lc('refresh-cw',15,'var(--purple)')} Renovar licença
        </div>
        <button onclick="document.getElementById('popupManutRenov').remove()" style="background:none;border:none;cursor:pointer">${lc('x',16,'var(--muted)')}</button>
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:16px">${item.nome}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Data de renovação *</label>
          <input type="date" id="mrvRenovData" class="inp" value="${hoje}">
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Novo vencimento *</label>
          <input type="date" id="mrvRenovVenc" class="inp" value="">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Valor pago (R$)</label>
          <input type="number" id="mrvRenovValor" class="inp" placeholder="0,00" min="0" step="0.01">
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Responsável</label>
          <input type="text" id="mrvRenovResp" class="inp" value="${item.responsavel||''}" placeholder="Nome">
        </div>
      </div>
      <div class="field"><label>Observações</label>
        <input type="text" id="mrvRenovObs" class="inp" placeholder="Número do processo, protocolo, etc.">
      </div>
      <div style="margin-bottom:14px">
        <button onclick="toast('Upload de arquivos disponível em breve','warn')"
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r8);
          border:1.5px dashed var(--border);background:var(--surface2);color:var(--muted);font-size:var(--text-sm);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
          ${lc('paperclip',13,'currentColor')} Anexar comprovante (em breve)
        </button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutRenov').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutConfirmarRenovacao('${itemId}')">
          ${lc('refresh-cw',13,'#fff')} Confirmar renovação
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function manutConfirmarRenovacao(itemId) {
  const dataRenov = document.getElementById('mrvRenovData')?.value;
  const novoVenc  = document.getElementById('mrvRenovVenc')?.value;
  if (!dataRenov) { toast('Informe a data de renovação', 'err'); return; }
  if (!novoVenc)  { toast('Informe o novo vencimento',   'err'); return; }
  const item = manutItens.find(i => i.id === itemId);
  if (!item) return;
  item.vencimento     = novoVenc;
  item.ultimaExecucao = dataRenov;
  item.responsavel    = document.getElementById('mrvRenovResp')?.value.trim() || item.responsavel;
  item.updated_at     = new Date().toISOString();
  const log = {
    id:crypto.randomUUID(), created_at:new Date().toISOString(),
    itemId, equipamentoId:null,
    nome:`Renovação: ${item.nome}`, tipo:'certificacao', categoria:'documento',
    fornecedorId:null,
    responsavel:item.responsavel,
    dataExecucao:dataRenov, horaExecucao:'',
    valor:parseFloat(document.getElementById('mrvRenovValor')?.value)||null,
    descricao:document.getElementById('mrvRenovObs')?.value.trim()||'',
    fotoUrl:'', proximaRecomendada:novoVenc,
  };
  manutLog.push(log);
  _saveManutL();
  _saveManutI();
  document.getElementById('popupManutRenov')?.remove();
  renderManutencao();
  toast('Licença renovada com sucesso!', 'ok');
}

// ══════════════════════════════════════════════════════════════
// ABA 4 — CORRETIVAS
// ══════════════════════════════════════════════════════════════

function _manutRenderCorretivas() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');
  if (header) header.innerHTML = `
    <button onclick="manutAbrirModalCorretiva(null)"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--r8);
      border:none;background:var(--red);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
      ${lc('alert-triangle',13,'#fff')} Registrar problema
    </button>`;

  const abertas   = manutItens.filter(i => _isCorretiva(i) && i.statusCorretiva !== 'resolvida');
  const resolvidas= manutItens.filter(i => _isCorretiva(i) && i.statusCorretiva === 'resolvida')
    .sort((a,b) => new Date(b.dataResolucao||b.created_at) - new Date(a.dataResolucao||a.created_at));

  const tabs = [
    { id:'abertas',    label:'Abertas',    n: abertas.length    },
    { id:'resolvidas', label:'Resolvidas', n: resolvidas.length },
  ];

  content.innerHTML = `
    <div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:16px">
      ${tabs.map(t => {
        const active = _manutCorrFiltro === t.id;
        return `<button onclick="_manutCorrFiltro='${t.id}';_manutRenderCorretivas()"
          style="display:flex;align-items:center;gap:5px;padding:9px 14px;border:none;border-bottom:2.5px solid ${active?'var(--purple)':'transparent'};
          background:none;color:${active?'var(--purple)':'var(--muted)'};font-size:var(--text-sm);font-weight:${active?'700':'500'};cursor:pointer;font-family:Inter,sans-serif">
          ${t.label} <span style="padding:0 6px;border-radius:8px;background:${active?'var(--purple)':'var(--surface2)'};color:${active?'#fff':'var(--muted)'};font-size:var(--text-2xs);font-weight:700">${t.n}</span>
        </button>`;
      }).join('')}
    </div>

    ${_manutCorrFiltro === 'abertas' ? (
      abertas.length ? `<div style="display:flex;flex-direction:column;gap:8px">${abertas.map(_cardCorretiva).join('')}</div>`
      : `<div style="text-align:center;padding:60px 0;color:var(--muted)">${lc('check-circle',36,'var(--green)')}<div style="margin-top:12px;font-size:var(--text-md);color:var(--green);font-weight:700">Nenhum problema em aberto</div></div>`
    ) : (
      resolvidas.length ? `<div style="display:flex;flex-direction:column;gap:6px">${resolvidas.map(_cardCorrResolv).join('')}</div>`
      : `<div style="text-align:center;padding:48px 0;color:var(--muted)">${lc('clock',36,'var(--border)')}<div style="margin-top:12px;font-size:var(--text-md)">Sem histórico de corretivas resolvidas</div></div>`
    )}`;
}

function _cardCorretiva(item) {
  const equip = item.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  const sup   = item.fornecedorId && typeof suppliers !== 'undefined' ? suppliers.find(s => s.id === item.fornecedorId) : null;
  const crit  = MANUT_CRIT[item.criticidade] || MANUT_CRIT.media;
  const dias  = Math.round((Date.now() - new Date(item.created_at)) / 86400000);

  return `
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid var(--red);
    border-radius:var(--r8);background:var(--surface);overflow:hidden">
    <div style="width:4px;align-self:stretch;border-radius:2px;background:${crit.color};flex-shrink:0"></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:var(--text-sm);font-weight:700">${item.nome}</span>
        <span style="padding:1px 7px;border-radius:8px;background:${crit.bg};color:${crit.color};font-size:var(--text-2xs);font-weight:700;white-space:nowrap">${crit.label}</span>
        <span style="font-size:var(--text-2xs);color:var(--red);display:inline-flex;align-items:center;gap:3px">${lc('clock',9,'currentColor')} ${dias}d aberto</span>
      </div>
      <div style="margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${equip ? `<span style="font-size:var(--text-2xs);color:var(--text2);display:inline-flex;align-items:center;gap:3px">${lc('cpu',9,'var(--muted)')} ${equip.nome}${equip.localizacao?' · '+equip.localizacao:''}</span>` : ''}
        ${sup ? `<span style="font-size:var(--text-2xs);color:var(--text2);display:inline-flex;align-items:center;gap:3px">${lc('building-2',9,'var(--muted)')} ${sup.name}</span>` : ''}
        ${item.observacoes ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-style:italic">${item.observacoes}</span>` : ''}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
      <button onclick="manutResolverCorretiva('${item.id}')"
        style="padding:5px 11px;border-radius:var(--r8);border:none;background:var(--green);color:#fff;
        font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
        ${lc('check-circle',12,'#fff')} Resolver
      </button>
      <button onclick="manutAbrirModalCorretiva('${item.id}')"
        style="padding:5px 7px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer">
        ${lc('edit-2',12,'currentColor')}
      </button>
      <button onclick="manutDeletarItem('${item.id}')"
        style="padding:5px 7px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--red);cursor:pointer">
        ${lc('trash-2',12,'currentColor')}
      </button>
    </div>
  </div>`;
}

function _cardCorrResolv(item) {
  const equip = item.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  return `
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--r8);background:var(--surface)">
    <div style="width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0"></div>
    <div style="flex:1">
      <div style="font-size:var(--text-sm);font-weight:600">${item.nome}</div>
      ${item.descricaoResolucao ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:1px">${item.descricaoResolucao}</div>` : ''}
      <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
        ${item.dataResolucao ? `<span>${lc('calendar',8,'var(--muted)')} Resolvido em ${fmtD(item.dataResolucao)}</span>` : ''}
        ${item.resolvidoPor ? `<span>${lc('user',8,'var(--muted)')} ${item.resolvidoPor}</span>` : ''}
        ${equip ? `<span>${lc('cpu',8,'var(--muted)')} ${equip.nome}</span>` : ''}
      </div>
    </div>
    <button onclick="manutDeletarItem('${item.id}')" style="padding:4px;background:none;border:none;cursor:pointer;color:var(--muted)">${lc('trash-2',11,'currentColor')}</button>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// ABA 5 — HISTÓRICO
// ══════════════════════════════════════════════════════════════

function _manutRenderHistorico() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');
  if (header) header.innerHTML = `
    <button onclick="manutAbrirRegistrar(null,null)"
      style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--r8);
      border:none;background:var(--purple);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif">
      ${lc('plus',13,'#fff')} Registrar execução
    </button>`;

  if (!manutLog.length) {
    content.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--muted)">${lc('clock',36,'var(--border)')}<div style="margin-top:12px;font-size:var(--text-md)">Nenhum registro ainda</div></div>`;
    return;
  }

  const logs = [...manutLog].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  content.innerHTML = `
    <div class="card" style="overflow:hidden;padding:0">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 14px;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left">Data</th>
            <th style="padding:10px 14px;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left">Manutenção</th>
            <th style="padding:10px 14px;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left">Equipamento</th>
            <th style="padding:10px 14px;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left">Resp. / Fornecedor</th>
            <th style="padding:10px 12px;font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map((l, idx) => {
            const sup   = l.fornecedorId && typeof suppliers !== 'undefined' ? suppliers.find(s => s.id === l.fornecedorId) : null;
            const equip = l.equipamentoId ? manutEquip.find(e => e.id === l.equipamentoId) : null;
            const cat   = manutCats[l.categoria] || manutCats.outros;
            return `<tr style="border-top:1px solid var(--border);background:${idx%2===0?'var(--surface)':'var(--surface2)'}">
              <td style="padding:9px 14px;font-size:var(--text-sm);white-space:nowrap">${fmtD(l.dataExecucao)}</td>
              <td style="padding:9px 14px">
                <div style="font-size:var(--text-sm);font-weight:600">${l.nome}</div>
                ${l.descricao ? `<div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px">${l.descricao.length>60?l.descricao.slice(0,60)+'…':l.descricao}</div>` : ''}
                <span style="display:inline-flex;align-items:center;gap:3px;margin-top:2px;padding:1px 6px;border-radius:8px;background:${cat.bg};color:${cat.color};font-size:var(--text-2xs);font-weight:600">
                  ${lc(cat.icon,8,'currentColor')} ${cat.label}
                </span>
              </td>
              <td style="padding:9px 14px;font-size:var(--text-sm);color:var(--text2)">${equip ? equip.nome : '—'}</td>
              <td style="padding:9px 14px;font-size:var(--text-sm);color:var(--text2)">${sup ? sup.name : (l.responsavel || '—')}</td>
              <td style="padding:9px 12px;font-size:var(--text-sm);font-weight:700;font-family:monospace;color:var(--purple);text-align:right">${l.valor ? 'R$ '+fmt(l.valor) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// CARD ITEM — usado na aba Preventivas
// ══════════════════════════════════════════════════════════════

function _manutCardItem(item) {
  const status  = _manutCalcStatus(item);
  const crit    = MANUT_CRIT[item.criticidade]   || MANUT_CRIT.media;
  const cat     = manutCats[item.categoria]     || manutCats.outros;
  const urgInfo = _manutUrgenciaInfo(item);
  const equip   = item.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  const sup     = item.fornecedorId && typeof suppliers !== 'undefined' ? suppliers.find(s => s.id === item.fornecedorId) : null;
  const borderColor = status === 'atrasado' ? 'var(--red)' : status === 'pendente' ? 'var(--yellow)' : 'var(--border)';

  return `<div style="display:flex;align-items:center;border:1.5px solid ${borderColor};border-radius:var(--r8);background:var(--surface);overflow:hidden">
    <div style="width:4px;flex-shrink:0;align-self:stretch;background:${crit.color}"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;flex:1;min-width:0;flex-wrap:wrap">
      <div style="font-size:var(--text-sm);font-weight:700;min-width:160px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.nome}</div>
      <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:8px;background:${cat.bg};color:${cat.color};font-size:var(--text-2xs);font-weight:600;white-space:nowrap;flex-shrink:0">${lc(cat.icon,9,'currentColor')} ${cat.label}</span>
      <span style="padding:2px 7px;border-radius:8px;background:${crit.bg};color:${crit.color};font-size:var(--text-2xs);font-weight:700;white-space:nowrap;flex-shrink:0">${crit.label}</span>
      <span style="font-size:var(--text-2xs);color:var(--muted);white-space:nowrap;flex-shrink:0">${MANUT_FREQ_LABELS[item.frequencia] || item.frequencia}</span>
      <span style="font-size:var(--text-xs);font-weight:600;color:${urgInfo.color};display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0">${lc(urgInfo.icon,11,'currentColor')} ${urgInfo.texto}</span>
      ${equip ? `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0">${lc('cpu',9,'var(--muted)')} ${equip.nome}</span>` : ''}
      ${sup ? `<span style="font-size:var(--text-2xs);padding:2px 7px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0">${lc('building-2',9,'var(--muted)')} ${sup.name}</span>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:4px;padding:9px 12px;flex-shrink:0;border-left:1px solid var(--border)">
      <button onclick="manutAbrirRegistrar('${item.id}')" style="padding:5px 11px;border-radius:var(--r8);border:none;background:var(--purple);color:#fff;font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
        ${lc('check-circle',12,'#fff')} Registrar
      </button>
      <button onclick="manutAbrirModalItem('${item.id}')" style="padding:5px 7px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);cursor:pointer">${lc('edit-2',12,'currentColor')}</button>
      <button onclick="manutDeletarItem('${item.id}')" style="padding:5px 7px;border-radius:var(--r6);border:1.5px solid var(--border);background:var(--surface);color:var(--red);cursor:pointer">${lc('trash-2',12,'currentColor')}</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODAL: NOVO / EDITAR ITEM (preventiva ou certificação)
// ══════════════════════════════════════════════════════════════

function manutAbrirModalItem(itemId, tipoDefault) {
  const item   = itemId ? manutItens.find(i => i.id === itemId) : null;
  const tipoInicial = item?.tipo || tipoDefault || 'preventiva';
  const isCert = _isCert({ tipo: tipoInicial });

  document.getElementById('popupManutItem')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupManutItem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';

  const catOpts  = Object.entries(manutCats).map(([k,v]) => `<option value="${k}" ${item?.categoria===k?'selected':''}>${v.label}</option>`).join('');
  const freqOpts = Object.entries(MANUT_FREQ_LABELS).map(([k,v]) => `<option value="${k}" ${item?.frequencia===k?'selected':''}>${v}</option>`).join('');
  const equipPreSel = item?.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  const supOpts  = `<option value="">Nenhum / Interno</option>` +
    (typeof suppliers !== 'undefined' ? suppliers.filter(s => s.categoria === 'manutencao' || s.categoria === 'servicos').map(s =>
      `<option value="${s.id}" ${item?.fornecedorId===s.id?'selected':''}>${s.name}</option>`) : []).join('');

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:16px">
        ${lc('clipboard-list',15,'var(--purple)')} ${item ? 'Editar item' : 'Novo item'}
      </div>
      <div class="field"><label>Nome *</label>
        <input type="text" id="mniNome" class="inp" value="${item?.nome||''}" placeholder="Ex: Limpeza do forno">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Tipo</label>
          <select id="mniTipo" class="inp" onchange="_manutToggleTipoModal()">
            <option value="preventiva"  ${tipoInicial==='preventiva' ?'selected':''}>Preventiva</option>
            <option value="certificacao"${tipoInicial==='certificacao'||tipoInicial==='documento'?'selected':''}>Certificação / Alvará</option>
          </select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Categoria</label>
          <select id="mniCat" class="inp">${catOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Criticidade</label>
          <select id="mniCrit" class="inp">
            ${Object.entries(MANUT_CRIT).map(([k,v]) => `<option value="${k}" ${item?.criticidade===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Equipamento</label>
          <div style="position:relative">
            <input type="text" id="mniEquipSearch" class="inp" autocomplete="off"
              value="${equipPreSel ? equipPreSel.nome : ''}"
              placeholder="Buscar equipamento..."
              oninput="_mniEquipFiltrar()" onfocus="_mniEquipFiltrar()">
            <input type="hidden" id="mniEquip" value="${item?.equipamentoId||''}">
            <div id="mniEquipList" style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1.5px solid var(--purple);border-top:none;border-radius:0 0 var(--r8) var(--r8);max-height:160px;overflow-y:auto;z-index:20;display:none;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>
          </div>
        </div>
      </div>
      <div id="mniFreqWrap" style="display:${isCert?'none':'grid'};grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Frequência</label>
          <select id="mniFreq" class="inp" onchange="_manutToggleCustomDias()">${freqOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Última execução</label>
          <input type="date" id="mniUltimaExec" class="inp" value="${item?.ultimaExecucao||''}">
        </div>
      </div>
      <div id="mniDiasCustomWrap" style="display:none">
        <div class="field"><label>Repetir a cada (dias)</label>
          <input type="number" id="mniDiasCustom" class="inp" value="${item?.diasCustom||''}" min="1">
        </div>
      </div>
      <div id="mniVencWrap" style="display:${isCert?'block':'none'}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field" style="margin:0 0 12px">
            <label>Data de emissão</label>
            <input type="date" id="mniEmissao" class="inp" value="${item?.ultimaExecucao||''}">
          </div>
          <div class="field" style="margin:0 0 12px">
            <label>Data de vencimento *</label>
            <input type="date" id="mniVencimento" class="inp" value="${item?.vencimento||''}">
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Fornecedor / Empresa</label>
          <select id="mniForn" class="inp">${supOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Responsável interno</label>
          <input type="text" id="mniResp" class="inp" value="${item?.responsavel||''}" placeholder="Nome">
        </div>
      </div>
      <div class="field"><label>Observações</label>
        <input type="text" id="mniObs" class="inp" value="${item?.observacoes||''}" placeholder="Notas adicionais">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutItem').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutSalvarItem('${itemId||''}')">
          ${lc('check',13,'#fff')} ${item ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
  _manutToggleTipoModal();
}

function _manutToggleTipoModal() {
  const tipo     = document.getElementById('mniTipo')?.value;
  const isCert   = tipo === 'certificacao' || tipo === 'documento';
  const freqWrap = document.getElementById('mniFreqWrap');
  const vencWrap = document.getElementById('mniVencWrap');
  if (freqWrap) freqWrap.style.display = isCert ? 'none' : 'grid';
  if (vencWrap) vencWrap.style.display = isCert ? 'block' : 'none';
}

function _manutToggleCustomDias() {
  const freq = document.getElementById('mniFreq')?.value;
  const wrap = document.getElementById('mniDiasCustomWrap');
  if (wrap) wrap.style.display = freq === 'personalizada' ? 'block' : 'none';
}

function _mniEquipFiltrar() {
  const busca = (document.getElementById('mniEquipSearch')?.value || '').toLowerCase();
  const list  = document.getElementById('mniEquipList');
  if (!list) return;
  const equips = busca
    ? manutEquip.filter(e => e.nome.toLowerCase().includes(busca) || (e.localizacao||'').toLowerCase().includes(busca))
    : manutEquip;
  if (!equips.length) { list.style.display = 'none'; return; }
  list.style.display = 'block';
  list.innerHTML = [{ id:'', nome:'Nenhum', localizacao:'' }, ...equips].map(e => `
    <div onclick="_mniEquipSelecionar('${e.id}','${e.nome.replace(/'/g,'\\\'')}')"
      style="padding:8px 12px;cursor:pointer;font-size:var(--text-sm);border-top:1px solid var(--border)"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-weight:${e.id?'600':'400'};color:${e.id?'var(--text)':'var(--muted)'}">${e.nome}</div>
      ${e.localizacao ? `<div style="font-size:var(--text-2xs);color:var(--muted)">${e.localizacao}</div>` : ''}
    </div>`).join('');
}

function _mniEquipSelecionar(id, nome) {
  const inp  = document.getElementById('mniEquipSearch');
  const hid  = document.getElementById('mniEquip');
  const list = document.getElementById('mniEquipList');
  if (inp)  inp.value  = id ? nome : '';
  if (hid)  hid.value  = id;
  if (list) list.style.display = 'none';
}

function manutSalvarItem(itemId) {
  const nome = document.getElementById('mniNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const tipo    = document.getElementById('mniTipo')?.value || 'preventiva';
  const isCert  = tipo === 'certificacao' || tipo === 'documento';
  const ultima  = isCert
    ? (document.getElementById('mniEmissao')?.value || null)
    : (document.getElementById('mniUltimaExec')?.value || null);
  const freq    = document.getElementById('mniFreq')?.value || 'mensal';
  const custom  = parseInt(document.getElementById('mniDiasCustom')?.value) || null;
  const proxima = isCert ? null : _manutProxima(ultima, freq, custom);
  const supVal  = document.getElementById('mniForn')?.value;
  const equipVal= document.getElementById('mniEquip')?.value;

  const data = {
    nome, tipo,
    isDocumento:    isCert,
    categoria:      document.getElementById('mniCat')?.value   || 'outros',
    criticidade:    document.getElementById('mniCrit')?.value  || 'media',
    frequencia:     freq,
    diasCustom:     custom,
    ultimaExecucao: ultima || null,
    proximaExecucao:isCert ? null : proxima,
    vencimento:     isCert ? (document.getElementById('mniVencimento')?.value || null) : null,
    fornecedorId:   supVal  ? parseInt(supVal)  : null,
    equipamentoId:  equipVal ? equipVal          : null,
    responsavel:    document.getElementById('mniResp')?.value.trim() || '',
    observacoes:    document.getElementById('mniObs')?.value.trim()  || '',
    updated_at:     new Date().toISOString(),
  };

  if (itemId) {
    const idx = manutItens.findIndex(i => i.id === itemId);
    if (idx >= 0) manutItens[idx] = { ...manutItens[idx], ...data };
    toast('Item atualizado!');
  } else {
    manutItens.push({ id:crypto.randomUUID(), created_at:new Date().toISOString(), statusCorretiva:null, dataResolucao:null, descricaoResolucao:'', resolvidoPor:'', ...data });
    toast('Item adicionado!');
  }
  _saveManutI();
  document.getElementById('popupManutItem')?.remove();
  renderManutencao();
}

function manutDeletarItem(itemId) {
  const item = manutItens.find(i => i.id === itemId);
  if (!item) return;
  vtpConfirm({
    title: `Excluir "${item.nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      manutItens = manutItens.filter(i => i.id !== itemId);
      _saveManutI();
      renderManutencao();
      toast('Item excluído.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// MODAL: NOVA CORRETIVA
// ══════════════════════════════════════════════════════════════

function manutAbrirModalCorretiva(itemId) {
  const item = itemId ? manutItens.find(i => i.id === itemId) : null;
  document.getElementById('popupManutCorr')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupManutCorr';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';

  const locais = [...new Set(manutEquip.map(e => e.localizacao).filter(Boolean))].sort();
  const localOpts = `<option value="">Todos os locais</option>` + locais.map(l =>
    `<option value="${l}">${l}</option>`).join('');

  const equipPreSel = item?.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;

  const supOpts = `<option value="">Nenhum / Interno</option>` +
    (typeof suppliers !== 'undefined' ? suppliers.filter(s => s.categoria === 'manutencao' || s.categoria === 'servicos').map(s =>
      `<option value="${s.id}" ${item?.fornecedorId===s.id?'selected':''}>${s.name}</option>`) : []).join('');

  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px">
        ${lc('alert-triangle',15,'var(--red)')} Registrar problema
      </div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:16px">Algo quebrou ou precisa de atenção imediata</div>
      <div class="field"><label>Descrição do problema *</label>
        <input type="text" id="mcrNome" class="inp" value="${item?.nome||''}" placeholder="Ex: Forno não aquece corretamente">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Filtrar por área / local</label>
          <select id="mcrLocal" class="inp" onchange="_mcrFiltrarEquip()">${localOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Criticidade</label>
          <select id="mcrCrit" class="inp">
            ${Object.entries(MANUT_CRIT).map(([k,v]) => `<option value="${k}" ${(item?.criticidade||'alta')===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field" style="margin:0 0 12px">
        <label>Equipamento / Área afetada</label>
        <div style="position:relative">
          <input type="text" id="mcrEquipSearch" class="inp" autocomplete="off"
            value="${equipPreSel ? equipPreSel.nome : ''}"
            placeholder="Buscar equipamento..."
            oninput="_mcrFiltrarEquip()" onfocus="_mcrFiltrarEquip()">
          <input type="hidden" id="mcrEquip" value="${item?.equipamentoId||''}">
          <div id="mcrEquipList" style="position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1.5px solid var(--purple);border-top:none;border-radius:0 0 var(--r8) var(--r8);max-height:160px;overflow-y:auto;z-index:20;display:none;box-shadow:0 8px 24px rgba(0,0,0,.12)"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Fornecedor de serviço</label>
          <select id="mcrForn" class="inp">${supOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Observações / contexto</label>
          <input type="text" id="mcrObs" class="inp" value="${item?.observacoes||''}" placeholder="Quando percebeu, frequência…">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutCorr').remove()">Cancelar</button>
        <button style="padding:8px 18px;border-radius:var(--r8);border:none;background:var(--red);color:#fff;font-size:var(--text-sm);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px" onclick="manutSalvarCorretiva('${itemId||''}')">
          ${lc('alert-triangle',13,'#fff')} ${item ? 'Salvar' : 'Registrar problema'}
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _mcrFiltrarEquip() {
  const local  = document.getElementById('mcrLocal')?.value || '';
  const busca  = (document.getElementById('mcrEquipSearch')?.value || '').toLowerCase();
  const list   = document.getElementById('mcrEquipList');
  if (!list) return;

  let equips = manutEquip;
  if (local) equips = equips.filter(e => e.localizacao === local);
  if (busca) equips = equips.filter(e => e.nome.toLowerCase().includes(busca));

  if (!equips.length) { list.style.display = 'none'; return; }
  list.style.display = 'block';
  list.innerHTML = equips.map(e => `
    <div onclick="_mcrSelecionarEquip('${e.id}','${e.nome.replace(/'/g,'\\\'')}')"
      style="padding:8px 12px;cursor:pointer;font-size:var(--text-sm);border-top:1px solid var(--border)"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${e.nome}</div>
      ${e.localizacao ? `<div style="font-size:var(--text-2xs);color:var(--muted)">${e.localizacao}</div>` : ''}
    </div>`).join('');
}

function _mcrSelecionarEquip(id, nome) {
  const inp = document.getElementById('mcrEquipSearch');
  const hid = document.getElementById('mcrEquip');
  const list = document.getElementById('mcrEquipList');
  if (inp) inp.value = nome;
  if (hid) hid.value = id;
  if (list) list.style.display = 'none';
}

function manutSalvarCorretiva(itemId) {
  const nome = document.getElementById('mcrNome')?.value.trim();
  if (!nome) { toast('Descreva o problema', 'err'); return; }
  const equipVal = document.getElementById('mcrEquip')?.value;
  const fornVal  = document.getElementById('mcrForn')?.value;
  const data = {
    nome,
    tipo:           'corretiva',
    isDocumento:    false,
    categoria:      'equipamento',
    criticidade:    document.getElementById('mcrCrit')?.value || 'alta',
    frequencia:     'personalizada',
    diasCustom:     null,
    ultimaExecucao: null,
    proximaExecucao:null,
    vencimento:     null,
    equipamentoId:  equipVal || null,
    fornecedorId:   fornVal ? parseInt(fornVal) : null,
    responsavel:    '',
    observacoes:    document.getElementById('mcrObs')?.value.trim() || '',
    statusCorretiva:'aberta',
    dataResolucao:  null,
    descricaoResolucao: '',
    resolvidoPor:   '',
    updated_at:     new Date().toISOString(),
  };
  if (itemId) {
    const idx = manutItens.findIndex(i => i.id === itemId);
    if (idx >= 0) manutItens[idx] = { ...manutItens[idx], ...data };
    toast('Problema atualizado!');
  } else {
    manutItens.push({ id:crypto.randomUUID(), created_at:new Date().toISOString(), ...data });
    toast('Problema registrado!', 'warn');
  }
  _saveManutI();
  document.getElementById('popupManutCorr')?.remove();
  _manutTab = 'corretivas';
  renderManutencao();
}

// ══════════════════════════════════════════════════════════════
// MODAL: RESOLVER CORRETIVA
// ══════════════════════════════════════════════════════════════

function manutResolverCorretiva(itemId) {
  const item = manutItens.find(i => i.id === itemId);
  if (!item) return;
  document.getElementById('popupManutResolv')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupManutResolv';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  const hoje = new Date().toISOString().slice(0,10);
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px">
        ${lc('check-circle',15,'var(--green)')} Marcar como resolvido
      </div>
      <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:14px">${item.nome}</div>
      <div class="field"><label>Data de resolução *</label>
        <input type="date" id="mrvData" class="inp" value="${hoje}">
      </div>
      <div class="field"><label>O que foi feito *</label>
        <input type="text" id="mrvDesc" class="inp" placeholder="Descreva a solução aplicada">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px">
          <label>Resolvido por</label>
          <input type="text" id="mrvResp" class="inp" placeholder="Nome">
        </div>
        <div class="field" style="margin:0 0 12px">
          <label>Valor gasto (R$)</label>
          <input type="number" id="mrvValor" class="inp" placeholder="0,00" min="0" step="0.01">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutResolv').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutSalvarResolucao('${itemId}')">${lc('check',13,'#fff')} Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
}

function manutSalvarResolucao(itemId) {
  const data = document.getElementById('mrvData')?.value;
  const desc = document.getElementById('mrvDesc')?.value.trim();
  if (!data || !desc) { toast('Preencha data e descrição', 'err'); return; }
  const item = manutItens.find(i => i.id === itemId);
  if (!item) return;
  item.statusCorretiva   = 'resolvida';
  item.dataResolucao     = data;
  item.descricaoResolucao= desc;
  item.resolvidoPor      = document.getElementById('mrvResp')?.value.trim() || '';
  item.ultimaExecucao    = data;
  item.updated_at        = new Date().toISOString();
  const log = {
    id:crypto.randomUUID(), created_at:new Date().toISOString(),
    itemId, equipamentoId:item.equipamentoId||null,
    nome:`Correção: ${item.nome}`, tipo:'corretiva', categoria:item.categoria||'outros',
    fornecedorId:null, responsavel:item.resolvidoPor, dataExecucao:data,
    valor:parseFloat(document.getElementById('mrvValor')?.value)||null,
    descricao:desc, fotoUrl:'', proximaRecomendada:null,
  };
  manutLog.push(log);
  _saveManutL();
  _saveManutI();
  document.getElementById('popupManutResolv')?.remove();
  renderManutencao();
  toast('Problema resolvido e registrado!', 'ok');
}

// ══════════════════════════════════════════════════════════════
// MODAL: EQUIPAMENTO (cadastro — também acessível de Configurações)
// ══════════════════════════════════════════════════════════════

function manutAbrirModalEquip(equipId) {
  if (typeof invAbrirModalItem === 'function') invAbrirModalItem(equipId);
}

function manutSalvarEquip(equipId) {
  const nome = document.getElementById('mneNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const data = {
    nome,
    grupo:       document.getElementById('mneGrupo')?.value    || 'preparacao',
    categoria:   document.getElementById('mneCat')?.value      || 'equipamento',
    status:      'ok',
    marca:       document.getElementById('mneMarca')?.value.trim()  || '',
    modelo:      document.getElementById('mneModelo')?.value.trim() || '',
    localizacao: document.getElementById('mneLoc')?.value.trim()    || '',
    criticidade: document.getElementById('mneCrit')?.value     || 'media',
    garantiaAte: document.getElementById('mneGarantia')?.value || '',
    numeroSerie: document.getElementById('mneSerie')?.value.trim()  || '',
    observacoes: document.getElementById('mneObs')?.value.trim()    || '',
    updated_at:  new Date().toISOString(),
  };
  if (equipId) {
    const idx = manutEquip.findIndex(e => e.id === equipId);
    if (idx >= 0) manutEquip[idx] = { ...manutEquip[idx], ...data };
    toast('Equipamento atualizado!');
  } else {
    manutEquip.push({ id:crypto.randomUUID(), created_at:new Date().toISOString(), dataCompra:'', ...data });
    toast('Equipamento adicionado!');
  }
  _saveManutE();
  document.getElementById('popupManutEquip')?.remove();
  if (window._cfgCadActiveTab === 'equipamentos' && typeof _cfgRenderEquipList === 'function') {
    _cfgRenderEquipList();
  } else {
    renderManutencao();
  }
}

function manutDeletarEquip(equipId) {
  const eq = manutEquip.find(e => e.id === equipId);
  if (!eq) return;
  vtpConfirm({
    title: `Excluir "${eq.nome}"`,
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      manutEquip = manutEquip.filter(e => e.id !== equipId);
      _saveManutE();
      document.getElementById('popupManutEquip')?.remove();
      if (window._cfgCadActiveTab === 'equipamentos' && typeof _cfgRenderEquipList === 'function') {
        _cfgRenderEquipList();
      } else {
        renderManutencao();
      }
      toast('Equipamento excluído.');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// MODAL: REGISTRAR EXECUÇÃO (preventiva / certificação)
// ══════════════════════════════════════════════════════════════

function manutAbrirRegistrar(itemId, equipPreFiltro) {
  const item = itemId ? manutItens.find(i => i.id === itemId) : null;
  document.getElementById('popupManutReg')?.remove();

  // Modal simplificado para preventiva já cadastrada
  if (item && _isPreventiva(item)) {
    _manutAbrirRegistrarSimples(item);
    return;
  }

  // Modal completo para entrada manual no Histórico ou de equip sem item vinculado
  const hoje    = new Date().toISOString().slice(0,10);
  const agora   = new Date().toTimeString().slice(0,5);
  const proximaAuto = item && !_isCert(item) ? _manutProxima(hoje, item.frequencia, item.diasCustom) : '';
  const supOpts = `<option value="">Nenhum / Interno</option>` +
    (typeof suppliers !== 'undefined' ? suppliers.filter(s => s.categoria === 'manutencao' || s.categoria === 'servicos').map(s =>
      `<option value="${s.id}" ${item?.fornecedorId===s.id?'selected':''}>${s.name}</option>`) : []).join('');
  const equipOpts = `<option value="">Nenhum</option>` + manutEquip.map(e =>
    `<option value="${e.id}" ${(item?.equipamentoId||equipPreFiltro)===e.id?'selected':''}>${e.nome}</option>`).join('');

  const popup = document.createElement('div');
  popup.id = 'popupManutReg';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:24px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.22)">
      <div style="font-size:var(--text-md);font-weight:800;margin-bottom:4px">${lc('check-circle',15,'var(--green)')} Registrar execução</div>
      ${item ? `<div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:14px">${item.nome}</div>` : '<div style="margin-bottom:14px"></div>'}
      ${!item ? `<div class="field"><label>Manutenção realizada *</label>
        <input type="text" id="mrgNome" class="inp" placeholder="O que foi feito">
      </div>` : `<input type="hidden" id="mrgNome" value="${item.nome}">`}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px"><label>Data *</label>
          <input type="date" id="mrgData" class="inp" value="${hoje}">
        </div>
        <div class="field" style="margin:0 0 12px"><label>Horário</label>
          <input type="time" id="mrgHora" class="inp" value="${agora}">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px"><label>Fornecedor / Empresa</label>
          <select id="mrgForn" class="inp">${supOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px"><label>Responsável interno</label>
          <input type="text" id="mrgResp" class="inp" value="${item?.responsavel||''}" placeholder="Nome">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="field" style="margin:0 0 12px"><label>Equipamento</label>
          <select id="mrgEquip" class="inp">${equipOpts}</select>
        </div>
        <div class="field" style="margin:0 0 12px"><label>Valor (R$)</label>
          <input type="number" id="mrgValor" class="inp" placeholder="0,00" min="0" step="0.01">
        </div>
      </div>
      <div class="field"><label>Descrição do serviço</label>
        <input type="text" id="mrgDesc" class="inp" placeholder="O que foi feito / observações">
      </div>
      <div class="field"><label>${_isCert(item||{tipo:'preventiva'}) ? 'Novo vencimento' : 'Próxima execução recomendada'}</label>
        <input type="date" id="mrgProxima" class="inp" value="${proximaAuto}">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutReg').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutSalvarRegistro('${itemId||''}',false)">
          ${lc('check-circle',13,'#fff')} Confirmar
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
}

function _manutAbrirRegistrarSimples(item) {
  const hoje        = new Date().toISOString().slice(0,10);
  const proximaAuto = _manutProxima(hoje, item.frequencia, item.diasCustom);
  const equip       = item.equipamentoId ? manutEquip.find(e => e.id === item.equipamentoId) : null;
  const sup         = item.fornecedorId && typeof suppliers !== 'undefined' ? suppliers.find(s => s.id === item.fornecedorId) : null;
  const cat         = manutCats[item.categoria] || manutCats.outros;

  const popup = document.createElement('div');
  popup.id = 'popupManutReg';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r16);padding:0;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.22);overflow:hidden">

      <!-- Header -->
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border)">
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:36px;height:36px;border-radius:var(--r8);background:${cat.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${lc(cat.icon,16,cat.color)}
          </div>
          <div style="min-width:0">
            <div style="font-size:var(--text-md);font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.nome}</div>
            <div style="font-size:var(--text-2xs);color:var(--muted);margin-top:1px;display:flex;gap:8px;flex-wrap:wrap">
              ${equip ? `<span>${lc('cpu',9,'var(--muted)')} ${equip.nome}${equip.localizacao?' · '+equip.localizacao:''}</span>` : ''}
              ${sup   ? `<span>${lc('building-2',9,'var(--muted)')} ${sup.name}</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field" style="margin:0">
            <label>Valor gasto (R$)</label>
            <input type="number" id="mrgValor" class="inp" placeholder="0,00" min="0" step="0.01" autofocus>
          </div>
          <div class="field" style="margin:0">
            <label>Próxima execução</label>
            <input type="date" id="mrgProxima" class="inp" value="${proximaAuto||''}">
          </div>
        </div>
        <div class="field" style="margin:0">
          <label>Observações (opcional)</label>
          <input type="text" id="mrgDesc" class="inp" placeholder="O que foi feito, intercorrências…">
        </div>
        <div style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px">
          ${lc('info',10,'var(--muted)')}
          Data registrada automaticamente como hoje · Para alterar outros dados, use Editar
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 20px;border-top:1.5px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('popupManutReg').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="manutSalvarRegistro('${item.id}',true)">
          ${lc('check-circle',13,'#fff')} Registrar
        </button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  popup.addEventListener('click', e => { if(e.target===popup) popup.remove(); });
  setTimeout(() => document.getElementById('mrgValor')?.focus(), 80);
}

function manutSalvarRegistro(itemId, simples) {
  const item  = itemId ? manutItens.find(i => i.id === itemId) : null;
  const hoje  = new Date().toISOString().slice(0,10);
  const agora = new Date().toTimeString().slice(0,5);

  let nome, data, horaExecucao, supId, equipId, responsavel;

  if (simples && item) {
    // Modal simplificado — tudo vem do item já cadastrado
    nome         = item.nome;
    data         = hoje;
    horaExecucao = agora;
    supId        = item.fornecedorId || null;
    equipId      = item.equipamentoId || null;
    responsavel  = item.responsavel || '';
  } else {
    // Modal completo
    nome = document.getElementById('mrgNome')?.value.trim();
    data = document.getElementById('mrgData')?.value;
    if (!nome) { toast('Informe o que foi feito', 'err'); return; }
    if (!data) { toast('Informe a data', 'err'); return; }
    supId        = parseInt(document.getElementById('mrgForn')?.value)  || null;
    equipId      = document.getElementById('mrgEquip')?.value            || null;
    responsavel  = document.getElementById('mrgResp')?.value.trim()     || '';
    horaExecucao = document.getElementById('mrgHora')?.value             || '';
  }

  const proxima = document.getElementById('mrgProxima')?.value || null;

  const log = {
    id:crypto.randomUUID(), created_at:new Date().toISOString(),
    itemId: itemId || null, equipamentoId: equipId || null,
    nome, tipo:item?.tipo||'preventiva', categoria:item?.categoria||'outros',
    fornecedorId:supId, responsavel,
    dataExecucao:data, horaExecucao,
    valor:parseFloat(document.getElementById('mrgValor')?.value)||null,
    descricao:document.getElementById('mrgDesc')?.value.trim()||'',
    fotoUrl:'', proximaRecomendada:proxima,
  };
  manutLog.push(log);
  _saveManutL();

  if (item) {
    item.ultimaExecucao = data;
    if (_isCert(item)) {
      if (proxima) item.vencimento = proxima;
    } else {
      // proxima explicitamente null = sem reagendamento (sai da lista ativa)
      item.proximaExecucao = proxima || null;
    }
    item.updated_at = new Date().toISOString();
    _saveManutI();
  }

  document.getElementById('popupManutReg')?.remove();
  renderManutencao();

  if (simples) {
    const msg = proxima
      ? `Registrado! Próxima agendada para ${fmtD(proxima)}`
      : 'Registrado! Item movido para Agendadas sem data de retorno';
    toast(msg, 'ok');
  } else {
    toast('Execução registrada!', 'ok');
  }
}

// ══════════════════════════════════════════════════════════════
// ABA INVENTÁRIO
// ══════════════════════════════════════════════════════════════

const _getManutInv  = () => db._get('vtp_manut_inv', null) || _invSeedDefault();
const _saveManutInv = d  => db._set('vtp_manut_inv', d);

function _invSeedDefault() {
  const seed = [
    // Equipamentos principais — puxados automaticamente de manutEquip
    ...( manutEquip || [] ).map(e => ({
      id: 'eq_' + e.id, nome: e.nome, grupo: e.grupo || 'equipamentos',
      quantidade: 1, quantidadeEsperada: 1, qualidade: 'bom', obs: '', tipo: 'equipamento',
    })),
    // Utensílios e pequenos itens
    { id: crypto.randomUUID(), nome:'Formas de pizza grandes',  grupo:'utensilios', quantidade:0, quantidadeEsperada:20, qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Formas de pizza pequenas', grupo:'utensilios', quantidade:0, quantidadeEsperada:20, qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Pás de pizzaiolo',         grupo:'utensilios', quantidade:0, quantidadeEsperada:4,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Cortadores de pizza',      grupo:'utensilios', quantidade:0, quantidadeEsperada:6,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Panelas grandes',          grupo:'utensilios', quantidade:0, quantidadeEsperada:8,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Tablets de atendimento',   grupo:'tecnologia',  quantidade:0, quantidadeEsperada:2,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Cabos USB / carregadores', grupo:'tecnologia',  quantidade:0, quantidadeEsperada:5,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Rádios / comunicação',     grupo:'tecnologia',  quantidade:0, quantidadeEsperada:2,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Uniformes',                grupo:'operacional', quantidade:0, quantidadeEsperada:10, qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Aventais',                 grupo:'operacional', quantidade:0, quantidadeEsperada:8,  qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Luvas de proteção',        grupo:'operacional', quantidade:0, quantidadeEsperada:10, qualidade:'bom', obs:'', tipo:'utensilio' },
    { id: crypto.randomUUID(), nome:'Extintores (verificados)',  grupo:'seguranca',  quantidade:0, quantidadeEsperada:3,  qualidade:'bom', obs:'', tipo:'utensilio' },
  ];
  _saveManutInv(seed);
  return seed;
}

const _INV_QUAL = {
  bom:        { label:'Bom',          color:'var(--green)',       bg:'var(--green-light)'   },
  regular:    { label:'Regular',      color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  ruim:       { label:'Ruim',         color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  substituir: { label:'Substituir',   color:'var(--red)',         bg:'var(--red-light)'     },
};

const _INV_GRUPOS = {
  equipamentos: 'Equipamentos Principais',
  refrigeracao: 'Refrigeração',
  climatizacao: 'Climatização',
  preparacao:   'Preparação',
  tecnologia:   'Tecnologia',
  utensilios:   'Utensílios',
  operacional:  'Operacional',
  seguranca:    'Segurança',
};

function _manutRenderInventario() {
  const content = document.getElementById('manutContent');
  const header  = document.getElementById('manutHeaderAcao');
  const inv     = _getManutInv();
  const hoje    = new Date().toLocaleDateString('pt-BR');

  if (header) header.innerHTML = `
    <span style="font-size:var(--text-xs);color:var(--muted);display:flex;align-items:center;gap:5px">
      ${lc('info',12,'var(--muted)')} Atualizado via módulo Inventário · Última contagem: ${db._get('vtp_inv_data','')||'nunca'}
    </span>`;

  // KPIs
  const totalItens = inv.length;
  const nBom       = inv.filter(i => i.qualidade === 'bom').length;
  const nRuim      = inv.filter(i => i.qualidade === 'ruim' || i.qualidade === 'regular').length;
  const nSubst     = inv.filter(i => i.qualidade === 'substituir').length;
  const nDiverg    = inv.filter(i => i.quantidade !== i.quantidadeEsperada).length;

  // Agrupa por grupo
  const grupos = [...new Set(inv.map(i => i.grupo))];

  content.innerHTML = `
    <!-- KPIs -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div class="kpi"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('package',15,'var(--muted)')}<div class="kpi-v">${totalItens}</div></div><div class="kpi-l">Total de itens</div></div>
      <div class="kpi" style="border-color:var(--green)"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('check-circle',15,'var(--green)')}<div class="kpi-v" style="color:var(--green)">${nBom}</div></div><div class="kpi-l">Em bom estado</div></div>
      <div class="kpi" style="border-color:var(--yellow)"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('alert-triangle',15,'var(--yellow)')}<div class="kpi-v" style="color:var(--yellow)">${nRuim}</div></div><div class="kpi-l">Regular / Ruim</div></div>
      <div class="kpi" style="border-color:var(--red)"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('trash-2',15,'var(--red)')}<div class="kpi-v" style="color:var(--red)">${nSubst}</div></div><div class="kpi-l">Substituir</div></div>
      ${nDiverg ? `<div class="kpi" style="border-color:var(--orange-dark)"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${lc('alert-circle',15,'var(--orange-dark)')}<div class="kpi-v" style="color:var(--orange-dark)">${nDiverg}</div></div><div class="kpi-l">Divergência qtd</div></div>` : ''}
    </div>

    <!-- Tabela por grupo -->
    ${grupos.map(g => {
      const itens = inv.filter(i => i.grupo === g);
      return `
        <div style="margin-bottom:20px">
          <div style="font-size:var(--text-sm);font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px">
            ${lc('layers',12,'currentColor')} ${_INV_GRUPOS[g] || g}
          </div>
          <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r10);overflow:hidden">
            <div style="display:grid;grid-template-columns:1fr 80px 80px 110px 120px;padding:8px 14px;background:var(--surface2);font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);gap:8px">
              <span>Item</span><span style="text-align:center">Esperado</span><span style="text-align:center">Contado</span><span style="text-align:center">Qualidade</span><span></span>
            </div>
            ${itens.map((item) => {
              const q   = _INV_QUAL[item.qualidade] || _INV_QUAL.bom;
              const div = item.quantidade !== item.quantidadeEsperada;
              const precisa = item.qualidade === 'ruim' || item.qualidade === 'substituir';
              return `<div style="display:grid;grid-template-columns:1fr 80px 80px 110px 120px;padding:10px 14px;border-top:1px solid var(--border);align-items:center;gap:8px;background:${item.qualidade==='substituir'?'#fff5f5':item.qualidade==='ruim'?'#fffbeb':'var(--surface)'}">
                <div>
                  <div style="font-size:var(--text-sm);font-weight:600">${item.nome}</div>
                  ${item.obs ? `<div style="font-size:var(--text-xs);color:var(--muted)">${item.obs}</div>` : ''}
                </div>
                <div style="text-align:center;font-size:var(--text-sm);color:var(--muted)">${item.quantidadeEsperada}</div>
                <div style="text-align:center;font-size:var(--text-sm);font-weight:700;font-family:monospace;color:${div?'var(--orange-dark)':'var(--text)'}">${item.quantidade}</div>
                <div style="text-align:center">
                  <span style="padding:3px 8px;border-radius:8px;font-size:var(--text-xs);font-weight:700;color:${q.color};background:${q.bg};white-space:nowrap">${q.label}</span>
                </div>
                <div style="text-align:center">
                  ${precisa ? `<button onclick="manutAbrirModalCorretiva(null)"
                    style="padding:4px 10px;border-radius:var(--r6);border:none;background:var(--red);color:#fff;font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
                    ${lc('alert-triangle',10,'#fff')} Corretiva
                  </button>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('')}`;
}

function _invUpdateQtd(id, val) {
  const inv = _getManutInv();
  const item = inv.find(i => i.id === id);
  if (item) { item.quantidade = val; _saveManutInv(inv); }
}

function _invUpdateQual(id, qual) {
  const inv = _getManutInv();
  const item = inv.find(i => i.id === id);
  if (item) { item.qualidade = qual; _saveManutInv(inv); renderManutencao(); }
}

function _invSalvarContagem() {
  db._set('vtp_inv_data', new Date().toLocaleDateString('pt-BR'));
  toast(`${lc('check-circle',14,'var(--green)')} Contagem de inventário salva!`);
  renderManutencao();
}

function _invAdicionarItem() {
  document.getElementById('popupInvItem')?.remove();
  const popup = document.createElement('div');
  popup.id = 'popupInvItem';
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px';
  popup.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r14);padding:0;width:100%;max-width:420px;box-shadow:0 16px 60px rgba(0,0,0,.25);overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:var(--text-md);font-weight:800">Novo item de inventário</div>
        <button onclick="document.getElementById('popupInvItem').remove()" style="background:none;border:none;cursor:pointer">${lc('x',16,'var(--muted)')}</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div class="field" style="margin:0"><label>Nome do item *</label><input class="inp" id="invNome" placeholder="Ex: Facas de cozinha"></div>
        <div class="f2" style="margin:0">
          <div class="field" style="margin:0">
            <label>Grupo</label>
            <select class="inp" id="invGrupo">
              ${Object.entries(_INV_GRUPOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin:0"><label>Qtd esperada</label><input type="number" class="inp" id="invQtdEsp" value="1" min="0"></div>
        </div>
        <div class="field" style="margin:0"><label>Observação</label><input class="inp" id="invObs" placeholder="Localização, marca, etc."></div>
      </div>
      <div style="padding:14px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1.5px solid var(--border)">
        <button class="btn btn-outline" onclick="document.getElementById('popupInvItem').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="_invConfirmarAdicionar()">Adicionar</button>
      </div>
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => document.getElementById('invNome')?.focus(), 80);
}

function _invConfirmarAdicionar() {
  const nome = document.getElementById('invNome')?.value.trim();
  if (!nome) { toast('Informe o nome', 'err'); return; }
  const inv = _getManutInv();
  inv.push({
    id: crypto.randomUUID(), nome,
    grupo:               document.getElementById('invGrupo')?.value || 'utensilios',
    quantidade:          0,
    quantidadeEsperada:  parseInt(document.getElementById('invQtdEsp')?.value) || 1,
    qualidade:           'bom',
    obs:                 document.getElementById('invObs')?.value.trim() || '',
    tipo:                'utensilio',
  });
  _saveManutInv(inv);
  document.getElementById('popupInvItem')?.remove();
  renderManutencao();
  toast(`${lc('check-circle',14,'var(--green)')} "${nome}" adicionado ao inventário!`);
}

function _invRemoverItem(id) {
  const inv = _getManutInv().filter(i => i.id !== id);
  _saveManutInv(inv);
  renderManutencao();
}

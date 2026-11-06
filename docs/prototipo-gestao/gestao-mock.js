/**
 * Protótipo do módulo Gestão v2 — backend SIMULADO, em memória.
 * Carregado só na cópia de teste (nunca no app real). Reproduz as regras
 * que as funções gestao_* do banco vão aplicar, com as mesmas mensagens.
 * Recarregar a página volta aos dados fictícios.
 */
(function () {
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(new Date());
  const dia = n => { const d = new Date(hoje() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const agora = () => new Date().toISOString();

  const ativos = (typeof users !== 'undefined' ? users : []).filter(u => u.active !== false);
  const U = i => String((ativos[i % Math.max(ativos.length, 1)] || { id: i + 1 }).id);

  const D = { subareas: [], atividades: [], exec: [], links: [], processos: [], recursos: [], rotinas: [], balancos: [], avals: [] };

  // ── Sub-áreas pré-cadastradas ──
  const sub = {};
  [
    ['adm', ['Pessoas', 'Financeiro', 'Estratégico', 'Governança']],
    ['ope', ['Estoque', 'Compras', 'Cozinha', 'Atendimento', 'Logística', 'Gerência', 'Patrimônio']],
    ['pro', ['Produtização']],
    ['mkt', ['Marketing e Vendas']],
  ].forEach(([area, nomes], ia) => nomes.forEach((nome, i) => {
    const s = { id: uid(), area, nome, ordem: ia * 10 + i, ativo: true };
    D.subareas.push(s); sub[nome] = s.id;
  }));

  // ── Atividades fictícias ──
  // (sub-área, descritivo, status, resp, exec[], prazo em dias, prioridade, obs, subtarefas [desc, status, resp, prazo])
  let pos = 0;
  const nova = (subNome, descritivo, status, resp, exec, prazo, prio, obs, filhas = []) => {
    const a = { id: uid(), subarea_id: sub[subNome], parent_id: null, descritivo, status,
      resp_final_id: resp == null ? null : U(resp), prazo: prazo == null ? null : dia(prazo), prioridade: prio,
      observacao: obs || '', posicao: (pos += 1000), concluido_em: status === 'concluido' ? agora() : null,
      arquivado: false, criado_em: agora() };
    D.atividades.push(a);
    exec.forEach(i => D.exec.push({ atividade_id: a.id, usuario_id: U(i) }));
    filhas.forEach(([d, st, r, p]) => D.atividades.push({ id: uid(), subarea_id: a.subarea_id, parent_id: a.id, descritivo: d, status: st,
      resp_final_id: r == null ? null : U(r), prazo: p == null ? null : dia(p), prioridade: prio, observacao: '',
      posicao: (pos += 1000), concluido_em: st === 'concluido' ? agora() : null, arquivado: false, criado_em: agora() }));
  };

  nova('Pessoas', 'Treinamento de integração para novos colaboradores', 'em_andamento', 0, [1, 2], 6, 2, 'Usar o roteiro da Cozinha como base', [
    ['Escrever o roteiro do 1º dia', 'concluido', 1, -2],
    ['Gravar vídeo de boas-vindas', 'em_andamento', 2, 3],
    ['Montar checklist de acompanhamento da 1ª semana', 'a_fazer', 1, 6],
    ['Aplicar com a próxima contratação', 'a_fazer', 0, 14],
  ]);
  nova('Pessoas', 'Recrutamento de 2 motoboys para o fim de semana', 'a_fazer', 1, [], 3, 1, '');
  nova('Pessoas', 'Quadro de responsabilidades por função', 'a_fazer', null, [], null, 3, '');
  nova('Financeiro', 'Gestão do fluxo de caixa diário', 'concluido', 0, [3], -5, 2, 'Planilha no Drive / Financeiro');
  nova('Financeiro', 'Conciliação de contas a receber (iFood e cartões)', 'em_andamento', 3, [0], -1, 1, 'Divergência de R$ 412 no iFood de outubro', [
    ['Conferir repasses do iFood de outubro', 'concluido', 3, -3],
    ['Conferir maquininhas', 'em_andamento', 3, -1],
  ]);
  nova('Financeiro', 'Fechar a DRE de outubro', 'a_fazer', 0, [3], 4, 2, '');
  nova('Estratégico', 'Definição do orçamento anual 2027', 'a_fazer', 0, [], 25, 3, '', [
    ['Levantar o realizado de 2026', 'a_fazer', 3, 10],
    ['Projetar receitas por mês', 'a_fazer', 0, 18],
  ]);
  nova('Estratégico', 'Metas trimestrais do 1º tri 2027', 'a_fazer', null, [], null, 3, '');
  nova('Governança', 'Renovar alvará de funcionamento', 'a_fazer', 0, [], 2, 1, 'Vence no fim do mês');
  nova('Estoque', 'Contagem de estoque antes das 17h, todos os dias', 'concluido', 2, [4, 5], -8, 1, '');
  nova('Estoque', 'Organizar a câmara fria por validade (PVPS)', 'em_andamento', 2, [4], 1, 2, '');
  nova('Compras', 'Cotação semanal com 3 fornecedores de laticínios', 'a_fazer', 5, [], -2, 2, 'Fornecedor atual subiu 8%');
  nova('Cozinha', 'Fichas técnicas das pizzas doces', 'em_andamento', 4, [2, 5], 9, 2, '', [
    ['Chocolate com morango', 'concluido', 4, -4],
    ['Romeu e Julieta', 'concluido', 4, -1],
    ['Banana com canela', 'a_fazer', 5, 5],
  ]);
  nova('Cozinha', 'Mise en place das praças padronizada', 'a_fazer', 4, [], 12, 3, '');
  nova('Atendimento', 'Roteiro de atendimento no WhatsApp', 'a_fazer', 1, [6], 7, 2, '');
  nova('Atendimento', 'Gestão de crises no atendimento (reclamações)', 'a_fazer', null, [], null, 3, '');
  nova('Logística', 'Reduzir tempo médio de entrega para 40 min', 'em_andamento', 1, [6, 7], 20, 1, 'Hoje em 46 min', [
    ['Mapear bairros com mais atraso', 'concluido', 1, -6],
    ['Testar despacho em rotas agrupadas', 'em_andamento', 6, 2],
    ['Revisar raio de entrega', 'a_fazer', 1, 8],
  ]);
  nova('Gerência', 'Reunião Nota 10 (semanal)', 'a_fazer', 0, [1, 2, 3], 1, 2, '', [
    ['Definir pauta fixa da reunião', 'a_fazer', 0, 0],
    ['Montar painel de indicadores da semana', 'a_fazer', 3, 1],
    ['Registrar combinados no Plano de Ação', 'a_fazer', 0, null],
  ]);
  nova('Produtização', 'Rotina de precificação com margem por item', 'a_fazer', 0, [4], 15, 2, '');
  nova('Produtização', 'Análise do cardápio (matriz BCG)', 'concluido', 0, [], -10, 3, '');
  nova('Marketing e Vendas', 'Calendário de posts do Instagram de dezembro', 'em_andamento', 7, [], 5, 2, '');
  nova('Marketing e Vendas', 'Campanha de reativação de clientes inativos', 'a_fazer', 7, [0], -3, 1, 'Base RFV: 1.240 inativos');
  nova('Marketing e Vendas', 'Responder avaliações do Google Meu Negócio', 'concluido', 7, [], -1, 3, '');

  // ── Processos fictícios: [sub-área, nome, status, dono, recursos (p = pasta, v = vídeo)] ──
  const EX = 'https://example.com/';
  const proc = (subNome, nome, status, dono, recs = '') => {
    const p = { id: uid(), subarea_id: sub[subNome], nome, descricao: '', status, responsavel_id: dono == null ? null : U(dono),
      revisado_em: status === 'implantado' ? dia(-40) : null, ordem: D.processos.length, arquivado: false };
    D.processos.push(p);
    [...recs].forEach((t, i) => D.recursos.push({ id: uid(), processo_id: p.id, tipo: t === 'p' ? 'pasta' : 'video',
      titulo: t === 'p' ? 'Pasta do processo' : 'Vídeo de treinamento', url: EX + (t === 'p' ? 'pasta' : 'video'), ordem: i }));
    return p;
  };
  proc('Pessoas', 'Recrutamento e seleção', 'a_construir', 0);
  proc('Pessoas', 'Processo de integração', 'em_construcao', 1, 'p');
  proc('Pessoas', 'Treinamento introdutório', 'a_construir', 1);
  proc('Pessoas', 'Quadro de responsabilidades', 'a_construir', null);
  proc('Financeiro', 'Gestão do fluxo de caixa', 'implantado', 0, 'pv');
  proc('Financeiro', 'Gestão da DRE', 'implantado', 0, 'pv');
  proc('Financeiro', 'Programação de pagamentos', 'implantado', 3, 'p');
  proc('Financeiro', 'Conciliação de contas a receber', 'em_revisao', 3, 'p');
  proc('Estratégico', 'Orçamento anual', 'a_construir', 0);
  proc('Estratégico', 'Definição de valores', 'a_construir', 0);
  proc('Estratégico', 'Metas trimestrais', 'a_construir', null);
  proc('Governança', 'Calendário de obrigações e licenças', 'em_construcao', 0, 'p');
  proc('Estoque', 'Contagem de estoque', 'implantado', 2, 'pv');
  proc('Estoque', 'Estocagem e PVPS', 'implantado', 2, 'p');
  proc('Estoque', 'Processo de recebimento', 'implantado', 2, 'pv');
  proc('Compras', 'Rotina de compras', 'implantado', 5, 'p');
  proc('Compras', 'Cotação de fornecedores', 'em_construcao', 5);
  proc('Cozinha', 'Receituário', 'a_construir', 4);
  const ft = proc('Cozinha', 'Fichas técnicas', 'implantado', 4, 'pv');
  proc('Cozinha', 'Planilha de produção', 'a_construir', 4);
  proc('Cozinha', 'Mise en place das praças', 'em_construcao', 4, 'v');
  proc('Atendimento', 'Atendimento via WhatsApp', 'em_construcao', 1, 'p');
  proc('Atendimento', 'Atendimento via iFood', 'a_construir', 1);
  proc('Atendimento', 'Gestão de crises', 'a_construir', null);
  const ent = proc('Logística', 'Operação de entrega', 'em_revisao', 1, 'pv');
  proc('Logística', 'Escala de entregadores', 'implantado', 1, 'p');
  proc('Gerência', 'Reunião Nota 10 (semanal)', 'a_construir', 0);
  proc('Gerência', 'Checklists de turno', 'implantado', 0, 'p');
  proc('Produtização', 'Rotina de precificação', 'a_construir', 0);
  proc('Produtização', 'Gestão de cardápio', 'em_construcao', 0, 'p');
  proc('Produtização', 'Análise matriz BCG', 'implantado', 0, 'p');
  proc('Marketing e Vendas', 'Gestão do Instagram', 'em_construcao', 7, 'pv');
  proc('Marketing e Vendas', 'Gestão do tráfego pago', 'a_construir', 7);
  proc('Marketing e Vendas', 'Google Meu Negócio', 'implantado', 7, 'p');
  proc('Marketing e Vendas', 'Marketing de fidelização', 'a_construir', 7);
  // Atividades do Plano ligadas a processos
  const liga = (desc, p) => { const a = D.atividades.find(x => x.descritivo.startsWith(desc)); if (a) a.processo_id = p.id; };
  liga('Fichas técnicas', ft); liga('Reduzir tempo', ent);

  // ── Rotinas-chave (exemplo; no app real o time cadastra) ──
  const procPor = nome => D.processos.find(p => p.nome === nome)?.id || null;
  const ROT = {
    'Pessoas': [['Escala da semana publicada até sexta'], ['Integração de novos seguindo o roteiro', 'Processo de integração'], ['Faltas e atrasos registrados']],
    'Financeiro': [['Fluxo de caixa atualizado todo dia', 'Gestão do fluxo de caixa'], ['Conciliação de recebíveis semanal', 'Conciliação de contas a receber'], ['Contas pagas sem juros ou multa', 'Programação de pagamentos'], ['DRE fechada até o dia 10', 'Gestão da DRE']],
    'Estratégico': [['Reunião mensal de resultados feita'], ['Plano de Ação revisado toda semana']],
    'Governança': [['Alvarás e licenças em dia', 'Calendário de obrigações e licenças'], ['Obrigações fiscais entregues no prazo']],
    'Estoque': [['Contagem de estoque todo dia antes das 17h', 'Contagem de estoque'], ['Recebimento conferido com nota', 'Processo de recebimento'], ['Câmara fria organizada por validade', 'Estocagem e PVPS']],
    'Compras': [['Compras feitas pela lista do sistema', 'Rotina de compras'], ['Cotação com 3 fornecedores nos itens A', 'Cotação de fornecedores']],
    'Cozinha': [['Checklist de abertura e fechamento completo'], ['Montagem seguindo a ficha técnica', 'Fichas técnicas'], ['Mise en place pronta até 17h', 'Mise en place das praças']],
    'Atendimento': [['Mensagens respondidas em até 5 min', 'Atendimento via WhatsApp'], ['Reclamações registradas e respondidas']],
    'Logística': [['Tempo médio de entrega dentro da meta', 'Operação de entrega'], ['Entregadores escalados por turno', 'Escala de entregadores']],
    'Gerência': [['Reunião Nota 10 feita toda semana', 'Reunião Nota 10 (semanal)'], ['Checklists de turno conferidos', 'Checklists de turno']],
    'Patrimônio': [['Preventiva do forno e da masseira em dia'], ['Limpeza da coifa no prazo'], ['Inventário de utensílios feito, com perdas registradas']],
    'Produtização': [['Margem por item revisada no mês', 'Rotina de precificação'], ['Lançamento só com ficha e teste', 'Gestão de cardápio']],
    'Marketing e Vendas': [['Calendário de posts cumprido', 'Gestão do Instagram'], ['Avaliações do Google respondidas', 'Google Meu Negócio'], ['Campanha de reativação disparada']],
  };
  Object.entries(ROT).forEach(([sn, l]) => l.forEach(([titulo, proc], i) => D.rotinas.push({ id: uid(), subarea_id: sub[sn], titulo, descricao: '',
    processo_id: proc ? procPor(proc) : null, ordem: D.rotinas.length, ativo: true })));

  // ── Balanços: fevereiro a outubro fechados (gestão melhorando), mês atual em avaliação ──
  let semente = 7;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  const fraca = { 'Governança': -.18, 'Marketing e Vendas': -.12, 'Compras': -.1, 'Estoque': .08, 'Financeiro': .06 };
  const OBS = ['Ficou sem responsável na semana de folga', 'Fizemos só 2 das 4 semanas', 'Não seguiu o padrão da ficha', 'Esquecemos no feriado',
    'Faltou gente na escala', 'Atrasou por falta de informação do contador'];
  const mesAtual = hoje().slice(0, 7) + '-01';
  const mesDe = n => { const [a, m] = mesAtual.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const subNome = id => D.subareas.find(x => x.id === id)?.nome;
  for (let k = -9; k <= 0; k++) {
    const b = { id: uid(), mes: mesDe(k), status: k < 0 ? 'fechado' : 'rascunho', observacao: '',
      fechado_em: k < 0 ? new Date(mesDe(k + 1) + 'T15:00:00').toISOString() : null, fechado_por: k < 0 ? U(0) : null };
    D.balancos.push(b);
    D.rotinas.forEach((r, i) => {
      if (k === 0 && i % 3 === 0) return;          // mês atual: parte ainda sem resposta
      const pSim = Math.min(.97, .5 + (k + 9) * .05 + (fraca[subNome(r.subarea_id)] || 0));
      const x = rnd();
      const resposta = x < pSim ? 'sim' : 'nao';
      D.avals.push({ balanco_id: b.id, rotina_id: r.id, resposta, observacao: resposta === 'nao' ? OBS[Math.floor(rnd() * OBS.length)] : '',
        rotina_titulo: r.titulo, subarea_id: r.subarea_id });
    });
  }
  // Atividades que nasceram do balanço do mês passado
  const balAnt = D.balancos.find(b => b.mes === mesDe(-1));
  D.avals.filter(v => v.balanco_id === balAnt.id && v.resposta === 'nao').slice(0, 3).forEach((v, i) => {
    nova(subNome(v.subarea_id), `Corrigir rotina: ${v.rotina_titulo}`, ['concluido', 'em_andamento', 'a_fazer'][i], i, [], [-2, 3, 8][i], 2, v.observacao);
    const a = D.atividades[D.atividades.length - 1];
    a.rotina_origem_id = v.rotina_id; a.balanco_origem_id = balAnt.id;
  });

  // ── Entregas (links) já registradas em algumas atividades ──
  const lk = (desc, tipo, titulo) => { const a = D.atividades.find(x => x.descritivo.startsWith(desc)); if (a) D.links.push({ id: uid(), atividade_id: a.id, tipo, titulo, url: EX + tipo, ordem: D.links.length }); };
  lk('Análise do cardápio', 'pasta', 'Planilha da matriz BCG');
  lk('Gestão do fluxo de caixa', 'pasta', 'Pasta do fluxo de caixa');
  lk('Escrever o roteiro do 1º dia', 'pasta', 'Roteiro do 1º dia');
  lk('Chocolate com morango', 'video', 'Vídeo da montagem');
  lk('Responder avaliações', 'link', 'Perfil no Google');

  // ── Regras (as mesmas que a função gestao_atividade_salvar vai aplicar) ──
  const ST = ['a_fazer', 'em_andamento', 'concluido'];
  const usuarioValido = id => id == null || ativos.some(u => String(u.id) === String(id));
  const filhasDe = id => D.atividades.filter(x => x.parent_id === id && !x.arquivado);

  window.GES_MOCK = {
    async carregar() { return JSON.parse(JSON.stringify(D)); },

    async atividadeSalvar(id, d) {
      let a = id ? D.atividades.find(x => x.id === id) : null;
      if (id && (!a || a.arquivado)) throw new Error('Atividade não encontrada');
      if (!id) {
        let pai = null;
        if (d.parent_id) {
          pai = D.atividades.find(x => x.id === d.parent_id && !x.arquivado);
          if (!pai) throw new Error('Atividade não encontrada');
          if (pai.parent_id) throw new Error('Subtarefa não pode ter subtarefa');
        }
        a = { id: uid(), subarea_id: pai ? pai.subarea_id : null, parent_id: pai ? pai.id : null, descritivo: '', status: 'a_fazer',
          resp_final_id: null, prazo: null, prioridade: pai ? pai.prioridade : 3, observacao: '', posicao: (pos += 1000),
          concluido_em: null, arquivado: false, criado_em: agora() };
      }
      const novo = { ...a };
      if (!id && d.processo_id) { if (!D.processos.some(x => x.id === d.processo_id && !x.arquivado)) throw new Error('Processo não encontrado'); novo.processo_id = d.processo_id; }
      if (!id && d.rotina_origem_id) { if (!D.rotinas.some(x => x.id === d.rotina_origem_id)) throw new Error('Rotina não encontrada'); novo.rotina_origem_id = d.rotina_origem_id; novo.balanco_origem_id = d.balanco_origem_id || null; }
      ['descritivo', 'subarea_id', 'status', 'resp_final_id', 'prazo', 'prioridade', 'observacao'].forEach(k => { if (k in d) novo[k] = d[k]; });
      if (novo.parent_id) novo.subarea_id = a.subarea_id;   // subtarefa segue a sub-área da mãe
      novo.descritivo = String(novo.descritivo || '').trim();
      if (!novo.descritivo) throw new Error('Descreva a atividade');
      if (!D.subareas.some(s => s.id === novo.subarea_id && s.ativo)) throw new Error('Escolha a sub-área');
      if (!ST.includes(novo.status)) throw new Error('Status inválido');
      if (![1, 2, 3].includes(Number(novo.prioridade))) throw new Error('Prioridade inválida');
      if (!usuarioValido(novo.resp_final_id)) throw new Error('Responsável inválido');
      if (d.exec && !d.exec.every(usuarioValido)) throw new Error('Responsável de execução inválido');
      novo.prioridade = Number(novo.prioridade);
      novo.concluido_em = novo.status === 'concluido' ? (a.concluido_em || agora()) : null;

      if (id) Object.assign(a, novo); else D.atividades.push(novo);
      // Mudou a sub-área da mãe → subtarefas acompanham
      if (!novo.parent_id && 'subarea_id' in d) filhasDe(novo.id).forEach(f => { f.subarea_id = novo.subarea_id; });
      if (d.exec) {
        D.exec = D.exec.filter(x => x.atividade_id !== novo.id);
        [...new Set(d.exec.map(String))].forEach(u => D.exec.push({ atividade_id: novo.id, usuario_id: u }));
      }
      return novo.id;
    },

    async processoSalvar(id, d) {
      let p = id ? D.processos.find(x => x.id === id && !x.arquivado) : null;
      if (id && !p) throw new Error('Processo não encontrado');
      const novo = { ...(p || { id: uid(), descricao: '', status: 'a_construir', responsavel_id: null, revisado_em: null, ordem: D.processos.length, arquivado: false }) };
      ['nome', 'subarea_id', 'descricao', 'status', 'responsavel_id', 'revisado_em'].forEach(k => { if (k in d) novo[k] = d[k]; });
      novo.nome = String(novo.nome || '').trim();
      if (!novo.nome) throw new Error('Dê um nome ao processo');
      if (!D.subareas.some(s => s.id === novo.subarea_id && s.ativo)) throw new Error('Escolha a sub-área');
      if (!['a_construir', 'em_construcao', 'implantado', 'em_revisao'].includes(novo.status)) throw new Error('Status inválido');
      if (!usuarioValido(novo.responsavel_id)) throw new Error('Responsável inválido');
      if (d.recursos) {
        d.recursos.forEach(r => {
          if (!/^https?:\/\/\S+$/i.test(r.url || '')) throw new Error(`Link inválido${r.titulo ? ` em "${r.titulo}"` : ''}: use um endereço que comece com https://`);
          if (!['pasta', 'video', 'link'].includes(r.tipo)) throw new Error('Tipo de link inválido');
        });
      }
      if (p) Object.assign(p, novo); else D.processos.push(novo);
      if (d.recursos) {
        D.recursos = D.recursos.filter(r => r.processo_id !== novo.id);
        d.recursos.forEach((r, i) => D.recursos.push({ id: uid(), processo_id: novo.id, tipo: r.tipo, titulo: r.titulo || '', url: r.url.trim(), ordem: i }));
      }
      return novo.id;
    },

    async rotinaSalvar(id, d) {
      let r = id ? D.rotinas.find(x => x.id === id) : null;
      if (id && !r) throw new Error('Rotina não encontrada');
      const novo = { ...(r || { id: uid(), descricao: '', processo_id: null, ordem: D.rotinas.length, ativo: true }) };
      ['subarea_id', 'titulo', 'descricao', 'processo_id', 'ativo'].forEach(k => { if (k in d) novo[k] = d[k]; });
      novo.titulo = String(novo.titulo || '').trim();
      if (!novo.titulo) throw new Error('Descreva a rotina');
      if (!D.subareas.some(s => s.id === novo.subarea_id)) throw new Error('Escolha a sub-área');
      if (novo.processo_id && !D.processos.some(p => p.id === novo.processo_id)) throw new Error('Processo não encontrado');
      if (r) Object.assign(r, novo); else D.rotinas.push(novo);
      return novo.id;
    },

    async balancoAbrir(mes) {
      const m = String(mes).slice(0, 7) + '-01';
      if (m > mesAtual) throw new Error('Não dá para abrir balanço de mês futuro');
      const b = D.balancos.find(x => x.mes === m);
      if (b) return b.id;
      if (!D.rotinas.some(r => r.ativo)) throw new Error('Cadastre ao menos uma rotina antes de começar');
      const novo = { id: uid(), mes: m, status: 'rascunho', observacao: '', fechado_em: null, fechado_por: null };
      D.balancos.push(novo);
      return novo.id;
    },

    async balancoResponder(bid, rid, resposta, obs) {
      const b = D.balancos.find(x => x.id === bid);
      if (!b) throw new Error('Balanço não encontrado');
      if (b.status === 'fechado') throw new Error('Balanço fechado não pode ser alterado');
      const r = D.rotinas.find(x => x.id === rid);
      if (!r) throw new Error('Rotina não encontrada');
      if (resposta != null && !['sim', 'nao'].includes(resposta)) throw new Error('Resposta inválida');
      D.avals = D.avals.filter(v => !(v.balanco_id === bid && v.rotina_id === rid));
      if (resposta) D.avals.push({ balanco_id: bid, rotina_id: rid, resposta, observacao: resposta === 'nao' ? String(obs || '').trim() : '',
        rotina_titulo: r.titulo, subarea_id: r.subarea_id });
    },

    async balancoFechar(bid) {
      const b = D.balancos.find(x => x.id === bid);
      if (!b) throw new Error('Balanço não encontrado');
      if (b.status === 'fechado') throw new Error('Balanço já está fechado');
      const av = D.avals.filter(v => v.balanco_id === bid);
      const faltam = D.rotinas.filter(r => r.ativo && !av.some(v => v.rotina_id === r.id)).length;
      if (faltam) throw new Error(`Faltam ${faltam} rotina${faltam === 1 ? '' : 's'} sem resposta`);
      const semObs = av.filter(v => v.resposta === 'nao' && !v.observacao).length;
      if (semObs) throw new Error(`Escreva o que aconteceu em ${semObs} resposta${semObs === 1 ? '' : 's'} "Não"`);
      av.forEach(v => { const r = D.rotinas.find(x => x.id === v.rotina_id); if (r) { v.rotina_titulo = r.titulo; v.subarea_id = r.subarea_id; } });
      b.status = 'fechado'; b.fechado_em = agora(); b.fechado_por = String(getCurrentUser?.()?.id ?? '');
    },

    async atividadeLinks(id, lista) {
      const a = D.atividades.find(x => x.id === id && !x.arquivado);
      if (!a) throw new Error('Atividade não encontrada');
      (lista || []).forEach(l => {
        if (!/^https?:\/\/\S+$/i.test(l.url || '')) throw new Error('Link inválido: use um endereço que comece com https://');
        if (!['pasta', 'video', 'link'].includes(l.tipo)) throw new Error('Tipo de link inválido');
      });
      D.links = D.links.filter(l => l.atividade_id !== id);
      (lista || []).forEach((l, i) => D.links.push({ id: uid(), atividade_id: id, tipo: l.tipo, titulo: String(l.titulo || '').trim(), url: l.url.trim(), ordem: i }));
    },

    async processoArquivar(id) {
      const p = D.processos.find(x => x.id === id && !x.arquivado);
      if (!p) throw new Error('Processo não encontrado');
      p.arquivado = true;
    },

    async atividadeArquivar(id) {
      const a = D.atividades.find(x => x.id === id && !x.arquivado);
      if (!a) throw new Error('Atividade não encontrada');
      a.arquivado = true;
      filhasDe(id).forEach(f => { f.arquivado = true; });
    },
  };
})();

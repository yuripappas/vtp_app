/**
 * VTP Compras — Vai Ter Pizza!
 * data.js — Estado global, dados e persistência
 */

// ══════════════════════════════════════════════════════════════
// ITENS DE ESTOQUE
// ══════════════════════════════════════════════════════════════
let items = db._get('vtp_items', null) || [
  { id:1,  name:'Mussarela em Barra',     cat:'Laticínios',       unit:'kg', qty:4,    min:20,  ideal:55,  cost:33.92, supId:null, brands:['Polenghi','Scala','Tirolez'], code:'169713', isProd:false },
  { id:2,  name:'Farinha de Trigo',        cat:'Massas',           unit:'kg', qty:18,   min:20,  ideal:85,  cost:4.43,  supId:null, brands:['Anaconda','Venturelli'],       code:'167714', isProd:false },
  { id:3,  name:'Calabresa',               cat:'Carnes e Frios',   unit:'kg', qty:6,    min:8,   ideal:15,  cost:24.80, supId:null, brands:['Sadia','Seara'],               code:'157637', isProd:false },
  { id:4,  name:'Pepperoni',               cat:'Carnes e Frios',   unit:'kg', qty:2,    min:5,   ideal:10,  cost:48,    supId:null, brands:['Sadia'],                        code:'157640', isProd:false },
  { id:5,  name:'Requeijão',               cat:'Laticínios',       unit:'kg', qty:9,    min:7.5, ideal:16,  cost:48,    supId:null, brands:[],                              code:'157631', isProd:false },
  { id:6,  name:'Caixa Pizza Grande',      cat:'Embalagens',       unit:'un', qty:40,   min:400, ideal:482, cost:3.30,  supId:null, brands:[],                              code:'159735', isProd:false },
  { id:7,  name:'Molho de Tomate',         cat:'Molhos',           unit:'kg', qty:12,   min:2,   ideal:24,  cost:8.39,  supId:null, brands:['Oderich','Fugini'],            code:'157677', isProd:false },
  { id:8,  name:'Cream Cheese',            cat:'Laticínios',       unit:'kg', qty:3.9,  min:5,   ideal:12,  cost:35,    supId:null, brands:[],                              code:'157636', isProd:false },
  { id:9,  name:'Bacon em Cubos',          cat:'Carnes e Frios',   unit:'kg', qty:2,    min:3,   ideal:12,  cost:32.61, supId:null, brands:['Sadia','Seara'],               code:'157640', isProd:false },
  { id:10, name:'Caixa Pizza Pequena',     cat:'Embalagens',       unit:'un', qty:40,   min:400, ideal:393, cost:2.60,  supId:null, brands:[],                              code:'160000', isProd:false },
  { id:11, name:'Frango Desfiado',         cat:'Produção Interna', unit:'kg', qty:8,    min:1,   ideal:18,  cost:57.01, supId:null, brands:[],                              code:'157638', isProd:true,  medPorcao:0.090 },
  { id:12, name:'Carne de Sol Desfiada',   cat:'Produção Interna', unit:'kg', qty:12,   min:2,   ideal:20,  cost:70,    supId:null, brands:[],                              code:'157645', isProd:true,  medPorcao:0.080 },
  { id:13, name:'Mussarela Triturada',     cat:'Produção Interna', unit:'kg', qty:16.8, min:3,   ideal:30,  cost:34,    supId:null, brands:[],                              code:'157629', isProd:true,  medPorcao:0.090 },
  { id:14, name:'Brigadeiro de Chocolate', cat:'Produção Interna', unit:'kg', qty:16.9, min:0.5, ideal:20,  cost:24.58, supId:null, brands:[],                              code:'163291', isProd:true,  medPorcao:0.175 },
  { id:15, name:'Creme de Gorgonzola',     cat:'Produção Interna', unit:'kg', qty:8.4,  min:0.3, ideal:12,  cost:61.83, supId:null, brands:[],                              code:'157633', isProd:true,  medPorcao:0.080 },
  { id:16, name:'Costela Bovina Desfiada', cat:'Produção Interna', unit:'kg', qty:7.1,  min:3,   ideal:15,  cost:75.81, supId:null, brands:[],                              code:'157646', isProd:true,  medPorcao:0.075 },
];

let suppliers    = db._get('vtp_suppliers', []);
let users        = db._get('vtp_users', null) || [
  { id:1, name:'Yuri Pappas',   email:'gerente@vaiterpizza.com',      role:'gerente',     active:true },
  { id:2, name:'Ana Silva',     email:'supervisor@vaiterpizza.com',   role:'supervisor',  active:true },
  { id:3, name:'Carlos Lima',   email:'comprador@vaiterpizza.com',    role:'comprador',   active:true },
  { id:4, name:'João Pizzaiolo',email:'joao@vaiterpizza.com',         role:'funcionario', active:true, funcao:'pizzaiolo' },
  { id:5, name:'Maria Atend.',  email:'maria@vaiterpizza.com',        role:'funcionario', active:true, funcao:'atendimento' },
];
let ordens       = db._get('vtp_ordens', []);

// ══════════════════════════════════════════════════════════════
// LISTAS DE COMPRAS (substitui "ciclos")
// ══════════════════════════════════════════════════════════════

// Migração v3 — fluxo de 6 etapas: descarta listas do fluxo antigo
if (db._get('vtp_v', '') !== '3.0') {
  db._remove('vtp_listas');
  db._set('vtp_v', '3.0');
}

let listas       = db._get('vtp_listas',        []);
let cycleHistory = db._get('vtp_cycle_history', []);
let priceHistory = db._get('vtp_price_history', []);
let responses    = {};   // cotações respondidas por fornecedor (em memória)
let cycle        = null; // ciclo ativo atual (legado)

// Memória de condições por fornecedor
let fornMemoria = db._get('vtp_forn_memoria', {});
const saveFornMemoria = () => db._set('vtp_forn_memoria', fornMemoria);
function atualizarMemoriaForn(supId, cot) {
  if (!cot || !supId) return;
  fornMemoria[supId] = {
    formaPagamento:  cot.formaPagamento  || '',
    boletoDias:      cot.boletoDias      || null,
    parceladoVezes:  cot.parceladoVezes  || null,
    parceladoFreq:   cot.parceladoFreq   || '',
    obs:             cot.obs             || '',
  };
  saveFornMemoria();
}
function getMemoriaForn(supId) { return fornMemoria[supId] || null; }

// Contadores
let nextIid  = Math.max(...items.map(i => i.id), 0) + 1;
let nextSid  = Math.max(...(suppliers.length ? suppliers.map(s => s.id) : [0]), 0) + 1;
let nextUid  = Math.max(...users.map(u => u.id), 0) + 1;
let nextLid  = Math.max(...(listas.length ? listas.map(l => l.id) : [0]), 0) + 1;

// ── Estado de UI ──
let changedIds    = new Set();
let editItemId    = null;
let editSupId     = null;
let editUserId    = null;
let importData    = [];
let sidebarOpen   = false;
let _carrinho     = db._get('vtp_carrinho', []); // [{itemId, qty}]

// ══════════════════════════════════════════════════════════════
// PERSISTÊNCIA
// ══════════════════════════════════════════════════════════════
const saveI            = () => db._set('vtp_items',         items);
const saveS            = () => db._set('vtp_suppliers',     suppliers);
const saveU            = () => db._set('vtp_users',         users);
const saveO            = () => db._set('vtp_ordens',        ordens);
const saveListas       = () => db._set('vtp_listas',        listas);
const savePriceHistory = () => db._set('vtp_price_history', priceHistory);
const saveCarrinho     = () => db._set('vtp_carrinho',      _carrinho);

let prestadores = db._get('vtp_prestadores', []);
const savePrest = () => db._set('vtp_prestadores', prestadores);

// Terceirizados operacionais (motoboy, pizzaiolo diarista, aux. cozinha, etc.)
let terceirizados = db._get('vtp_terceirizados', []);
const saveTerceir = () => db._set('vtp_terceirizados', terceirizados);

const _TERCEIR_FUNCOES_DEFAULT = {
  motoboy:       { label:'Motoboy / Entregador', icon:'bike',          color:'var(--orange-dark)', bg:'var(--orange-light)'   },
  pizzaiolo:     { label:'Pizzaiolo',             icon:'chef-hat',      color:'var(--red)',         bg:'var(--red-light)'      },
  aux_cozinha:   { label:'Aux. de Cozinha',       icon:'utensils',      color:'var(--yellow)',      bg:'var(--yellow-light)'   },
  atendimento:   { label:'Atendimento',           icon:'headphones',    color:'var(--green)',       bg:'var(--green-light)'    },
  limpeza:       { label:'Limpeza / Diarista',    icon:'sparkles',      color:'var(--purple)',      bg:'var(--purple-xlight)' },
  caixa:         { label:'Caixa',                 icon:'dollar-sign',   color:'var(--green)',       bg:'var(--green-light)'    },
  seguranca:     { label:'Segurança',             icon:'shield',        color:'var(--muted)',       bg:'var(--surface2)'       },
  outros:        { label:'Outros',                icon:'user',          color:'var(--muted)',       bg:'var(--surface2)'       },
};
let TERCEIR_FUNCOES = db._get('vtp_emp_terceir', null) || {..._TERCEIR_FUNCOES_DEFAULT};
const saveTerceirFuncoes = () => db._set('vtp_emp_terceir', TERCEIR_FUNCOES);

// Funcionários internos (para módulos de RH)
let funcionarios = db._get('vtp_funcionarios', []);
const saveFuncs  = () => db._set('vtp_funcionarios', funcionarios);

const _FUNC_CARGOS_DEFAULT = {
  gerente:       { label:'Gerente',              icon:'crown',         color:'var(--purple)',      bg:'var(--purple-xlight)' },
  supervisor:    { label:'Supervisor',           icon:'key',           color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  pizzaiolo:     { label:'Pizzaiolo',            icon:'chef-hat',      color:'var(--red)',         bg:'var(--red-light)'     },
  aux_cozinha:   { label:'Aux. de Cozinha',      icon:'utensils',      color:'var(--yellow)',      bg:'var(--yellow-light)'  },
  atendimento:   { label:'Atendimento',          icon:'headphones',    color:'var(--green)',       bg:'var(--green-light)'   },
  entregador:    { label:'Entregador',           icon:'bike',          color:'var(--orange-dark)', bg:'var(--orange-light)'  },
  caixa:         { label:'Caixa',                icon:'dollar-sign',   color:'var(--green)',       bg:'var(--green-light)'   },
  limpeza:       { label:'Limpeza',              icon:'sparkles',      color:'var(--purple)',      bg:'var(--purple-xlight)' },
};
let FUNC_CARGOS = db._get('vtp_emp_cargos', null) || {..._FUNC_CARGOS_DEFAULT};
const saveFuncCargos = () => db._set('vtp_emp_cargos', FUNC_CARGOS);

// ── Tipos configuráveis de Desperdício ──────────────────────────
const _TIPOS_DESPERDICIO_DEFAULT = [
  { id:'preproducao', label:'Erro de pré-produção', color:'var(--red)',        bg:'var(--red-light)',    icon:'chef-hat' },
  { id:'montagem',    label:'Montagem incorreta',   color:'var(--orange-dark)',bg:'var(--orange-light)', icon:'tag' },
  { id:'entrega',     label:'Erro de entrega',      color:'var(--yellow)',     bg:'var(--yellow-light)', icon:'truck' },
  { id:'validade',    label:'Vencimento/validade',  color:'#7C3AED',           bg:'#EDE9FE',             icon:'calendar' },
  { id:'acidente',    label:'Acidente/queda',       color:'var(--muted)',      bg:'var(--surface2)',      icon:'alert-triangle' },
  { id:'alimentacao', label:'Alimentação',           color:'var(--green)',      bg:'var(--green-light)',   icon:'user' },
  { id:'cortesia',    label:'Cortesias',             color:'var(--purple)',     bg:'var(--purple-light)',  icon:'star' },
  { id:'marketing',   label:'Marketing',             color:'#0EA5E9',           bg:'#E0F2FE',             icon:'trending-up' },
  { id:'outro',       label:'Outro',                 color:'var(--text2)',      bg:'var(--surface2)',      icon:'package' },
];
let TIPOS_DESPERDICIO = db._get('vtp_emp_tipos_desp', null) || [..._TIPOS_DESPERDICIO_DEFAULT];
const saveTiposDesperdicio = () => db._set('vtp_emp_tipos_desp', TIPOS_DESPERDICIO);

// ── Categorias de Insumo configuráveis ─────────────────────────
let CATEGORIAS_INSUMO = db._get('vtp_emp_cat_insumo', null) || [
  // Mesmos nomes usados nos itens e importados do Cardápio Web
  'Laticínios','Carnes e Frios','Massas','Molhos','Embalagens',
  'Bebidas','Hortifruti','Higiene/Limpeza','Descartáveis','Outros',
];
const saveCategoriasInsumo = () => db._set('vtp_emp_cat_insumo', CATEGORIAS_INSUMO);

// ── Tipos de Ausência RH configuráveis ─────────────────────────
let TIPOS_AUSENCIA = db._get('vtp_emp_ausencias', null) || [
  { id:'ferias',              label:'Férias'                          },
  { id:'licenca_medica',      label:'Licença Médica'                  },
  { id:'licenca_maternidade', label:'Lic. Maternidade / Paternidade'  },
  { id:'afastamento_inss',    label:'Afastamento INSS'                },
  { id:'nao_remunerada',      label:'Licença não remunerada'          },
  { id:'suspensao',           label:'Suspensão disciplinar'           },
];
const saveTiposAusencia = () => db._set('vtp_emp_ausencias', TIPOS_AUSENCIA);

// ── RH ────────────────────────────────────────────────────────
let rhEscalas     = db._get('vtp_rh_escalas',     []);
let rhPresencas   = db._get('vtp_rh_presencas',   []);
let rhHorasExtras = db._get('vtp_rh_horasextras', []);
let rhMateriais   = db._get('vtp_rh_materiais',   []);
let rhPeriodos    = db._get('vtp_rh_periodos',    []);
let rhConfig      = db._get('vtp_rh_config',      null) || {
  abertura: '17:00',
  fechamento: '23:30',
  abreNoDomingo: true,
  folgasPorSemana: 1,
  times: {
    abertura:       { label: 'Time Abertura',    entrada: '17:00', saida: '20:30', intervalo: 20 },
    fechamento:     { label: 'Time Fechamento',  entrada: '19:30', saida: '23:30', intervalo: 30 },
    administrativo: { label: 'Administrativo',   entrada: '08:00', saida: '17:00', intervalo: 60 },
  },
  cargoParaTime: {
    gerente:     'administrativo',
    supervisor:  'abertura',
    pizzaiolo:   'abertura',
    aux_cozinha: 'abertura',
    atendimento: 'fechamento',
    entregador:  'fechamento',
    caixa:       'fechamento',
    limpeza:     'fechamento',
  },
};
// Migração: garante campos novos em configs salvas no formato antigo
if (!rhConfig.times) rhConfig.times = {
  abertura:       { label: 'Time Abertura',    entrada: '17:00', saida: '20:30', intervalo: 20 },
  fechamento:     { label: 'Time Fechamento',  entrada: '19:30', saida: '23:30', intervalo: 30 },
  administrativo: { label: 'Administrativo',   entrada: '08:00', saida: '17:00', intervalo: 60 },
};
if (!rhConfig.cargoParaTime) rhConfig.cargoParaTime = {
  gerente:'administrativo', supervisor:'abertura', pizzaiolo:'abertura',
  aux_cozinha:'abertura', atendimento:'fechamento', entregador:'fechamento',
  caixa:'fechamento', limpeza:'fechamento',
};
if (rhConfig.abreNoDomingo === undefined) rhConfig.abreNoDomingo = true;
if (!rhConfig.regrasEscala) rhConfig.regrasEscala = {
  diasPreferenciaFolga: [0,1,2,3],
  naoCoincidirFolgas:   true,
  garantirDomingo:      true,
};
if (!rhConfig.coberturaPico) rhConfig.coberturaPico = {
  diasPico: [5, 6],
  minimos:  { pizzaiolo: 2, aux_cozinha: 2, atendimento: 2 },
};
if (!rhConfig.especialidadesDiarista) rhConfig.especialidadesDiarista = [
  'Pizzaiolo','Auxiliar de cozinha','Atendimento','Entregador','Limpeza','Caixa',
];

const saveRhEscalas     = () => db._set('vtp_rh_escalas',     rhEscalas);
const saveRhPresencas   = () => db._set('vtp_rh_presencas',   rhPresencas);
const saveRhHorasExtras = () => db._set('vtp_rh_horasextras', rhHorasExtras);
const saveRhMateriais   = () => db._set('vtp_rh_materiais',   rhMateriais);
const saveRhPeriodos    = () => db._set('vtp_rh_periodos',    rhPeriodos);
const saveRhConfig      = () => db._set('vtp_rh_config',      rhConfig);

// Banco de diaristas / freelancers
let rhDiaristas = db._get('vtp_rh_diaristas', []);
const saveRhDiaristas = () => db._set('vtp_rh_diaristas', rhDiaristas);

// Avaliações semanais do supervisor por funcionário
let rhAvaliacoes = db._get('vtp_rh_avaliacoes', []);
const saveRhAvaliacoes = () => db._set('vtp_rh_avaliacoes', rhAvaliacoes);

const _RH_AVAL_TOPICOS = [
  { id:'pontualidade',  label:'Pontualidade'         },
  { id:'qualidade',     label:'Qualidade do trabalho' },
  { id:'agilidade',     label:'Agilidade'            },
  { id:'organizacao',   label:'Organização'          },
  { id:'comunicacao',   label:'Comunicação'          },
  { id:'comportamento', label:'Comportamento'        },
];

// Compatibilidade com código legado
const saveC  = saveListas;
const saveR  = () => {};
const saveAp = () => {};
const saveCH = () => {};

// ══════════════════════════════════════════════════════════════
// PIZZAS & SABORES (Desperdício)
// ══════════════════════════════════════════════════════════════
const PIZZA_TIPOS = [
  { id:'pq_sal', label:'Pizza Pequena Salgada', basePrice:34.90, grande:false },
  { id:'gr_sal', label:'Pizza Grande Salgada',  basePrice:50.90, grande:true  },
  { id:'pq_doc', label:'Pizza Pequena Doce',    basePrice:34.90, grande:false },
  { id:'gr_doc', label:'Pizza Grande Doce',     basePrice:49.90, grande:true  },
];

let sabores = db._get('vtp_sabores', null) || [
  { id:1,  tipo:'pq_sal', name:'Mussarela',                    acr:0.00,  active:true },
  { id:2,  tipo:'pq_sal', name:'Milho Verde',                  acr:0.00,  active:true },
  { id:3,  tipo:'pq_sal', name:'Marguerita',                   acr:1.00,  active:true },
  { id:4,  tipo:'pq_sal', name:'Queijo e Presunto',            acr:1.00,  active:true },
  { id:5,  tipo:'pq_sal', name:'Calabresa',                    acr:1.00,  active:true },
  { id:6,  tipo:'pq_sal', name:'Frango Caipira',               acr:5.00,  active:true },
  { id:7,  tipo:'pq_sal', name:'Lombinho',                     acr:5.00,  active:true },
  { id:8,  tipo:'pq_sal', name:'Americana',                    acr:6.00,  active:true },
  { id:9,  tipo:'pq_sal', name:'Catupirella',                  acr:7.00,  active:true },
  { id:10, tipo:'pq_sal', name:'Frango Catupiry',              acr:7.00,  active:true },
  { id:11, tipo:'pq_sal', name:'Quatro Queijos',               acr:7.00,  active:true },
  { id:12, tipo:'pq_sal', name:'Lombinho Cremoso',             acr:7.00,  active:true },
  { id:13, tipo:'pq_sal', name:'Portuguesa',                   acr:8.00,  active:true },
  { id:14, tipo:'pq_sal', name:'Frango com Bacon',             acr:8.00,  active:true },
  { id:15, tipo:'pq_sal', name:'Carne de Sol na Nata',         acr:14.00, active:true },
  { id:16, tipo:'pq_sal', name:'Filé ao Gorgonzola',          acr:14.00, active:true },
  { id:17, tipo:'pq_sal', name:'Carne de Sol Nordestina',      acr:15.00, active:true },
  { id:18, tipo:'pq_sal', name:'Filé, Cream Cheese e Barbecue de Goiabada', acr:15.00, active:true },
  { id:19, tipo:'pq_sal', name:'Filé ao Alho',                acr:17.00, active:true },
  { id:20, tipo:'pq_sal', name:'Costela Queijuda',             acr:19.00, active:true },
  { id:21, tipo:'pq_sal', name:'Costela, Cream Cheese e Barbecue de Goiabada', acr:20.00, active:true },
  { id:22, tipo:'gr_sal', name:'1/2 Mussarela',               acr:0.00,  active:true },
  { id:23, tipo:'gr_sal', name:'1/2 Milho Verde',             acr:0.00,  active:true },
  { id:24, tipo:'gr_sal', name:'1/2 Marguerita',              acr:0.00,  active:true },
  { id:25, tipo:'gr_sal', name:'1/2 Queijo e Presunto',       acr:0.00,  active:true },
  { id:26, tipo:'gr_sal', name:'1/2 Calabresa',               acr:0.00,  active:true },
  { id:27, tipo:'gr_sal', name:'1/2 Lombinho',                acr:3.50,  active:true },
  { id:28, tipo:'gr_sal', name:'1/2 Frango Caipira',          acr:4.00,  active:true },
  { id:29, tipo:'gr_sal', name:'1/2 Americana',               acr:4.00,  active:true },
  { id:30, tipo:'gr_sal', name:'1/2 Portuguesa',              acr:6.50,  active:true },
  { id:31, tipo:'gr_sal', name:'1/2 Frango com Bacon',        acr:6.50,  active:true },
  { id:32, tipo:'gr_sal', name:'1/2 Lombinho Cremoso',        acr:7.00,  active:true },
  { id:33, tipo:'gr_sal', name:'1/2 Frango Catupiry',         acr:7.50,  active:true },
  { id:34, tipo:'gr_sal', name:'1/2 Catupirella',             acr:7.50,  active:true },
  { id:35, tipo:'gr_sal', name:'1/2 Quatro Queijos',          acr:8.00,  active:true },
  { id:36, tipo:'gr_sal', name:'1/2 Carne de Sol na Nata',    acr:8.50,  active:true },
  { id:37, tipo:'gr_sal', name:'1/2 Filé ao Gorgonzola',     acr:8.50,  active:true },
  { id:38, tipo:'gr_sal', name:'1/2 Filé, Cream Cheese e Barbecue', acr:9.00, active:true },
  { id:39, tipo:'gr_sal', name:'1/2 Filé ao Alho',            acr:9.50,  active:true },
  { id:40, tipo:'gr_sal', name:'1/2 Costela, Cream Cheese e Barbecue', acr:12.50, active:true },
  { id:41, tipo:'gr_sal', name:'1/2 Carne de Sol Nordestina', acr:13.00, active:true },
  { id:42, tipo:'gr_sal', name:'1/2 Costela Queijuda',        acr:13.00, active:true },
  { id:43, tipo:'pq_doc', name:'Cartola',                     acr:0.00,  active:true },
  { id:44, tipo:'pq_doc', name:'Leite Ninho com Nutella',     acr:0.00,  active:true },
  { id:45, tipo:'pq_doc', name:'Romeu e Julieta',             acr:0.00,  active:true },
  { id:46, tipo:'pq_doc', name:'Brigadeiro',                  acr:0.00,  active:true },
  { id:47, tipo:'pq_doc', name:"M&M's",                      acr:4.00,  active:true },
  { id:48, tipo:'pq_doc', name:'Nutella',                     acr:4.00,  active:true },
  { id:49, tipo:'pq_doc', name:'Banana Nevada',               acr:4.00,  active:true },
  { id:50, tipo:'pq_doc', name:'Sonho de Valsa',              acr:4.00,  active:true },
  { id:51, tipo:'pq_doc', name:'Cheesecake de Morango',       acr:9.00,  active:true },
  { id:52, tipo:'gr_doc', name:'1/2 Cartola',                 acr:0.00,  active:true },
  { id:53, tipo:'gr_doc', name:'1/2 Romeu e Julieta',         acr:0.50,  active:true },
  { id:54, tipo:'gr_doc', name:'1/2 Brigadeiro',              acr:0.50,  active:true },
  { id:55, tipo:'gr_doc', name:'1/2 Leite Ninho com Nutella', acr:0.50,  active:true },
  { id:56, tipo:'gr_doc', name:"1/2 M&M's",                  acr:2.50,  active:true },
  { id:57, tipo:'gr_doc', name:'1/2 Banana Nevada',           acr:2.50,  active:true },
  { id:58, tipo:'gr_doc', name:'1/2 Sonho de Valsa',          acr:5.00,  active:true },
  { id:59, tipo:'gr_doc', name:'1/2 Nutella',                 acr:5.50,  active:true },
  { id:60, tipo:'gr_doc', name:'1/2 Cheesecake de Morango',   acr:8.00,  active:true },
];
let nextSabId = Math.max(...sabores.map(s => s.id), 0) + 1;

let produtos  = db._get('vtp_produtos', []);
let nextPid   = Math.max(...(produtos.length ? produtos.map(p => p.id) : [0]), 0) + 1;
const saveP   = () => db._set('vtp_produtos', produtos);
const saveSab = () => db._set('vtp_sabores',  sabores);

// ══════════════════════════════════════════════════════════════
// PERMISSÕES
// ══════════════════════════════════════════════════════════════
let PERMS = {
  gerente: {
    label: 'Gestor', icon: 'crown', color: '#6B21D4', bg: '#EDE9FE', mutavel: false,
    perms: [
      'Ver Dashboard',
      'Estoque','Estoque: Contagem Diária','Estoque: Contagem Semanal','Estoque: Movimentações',
      'Pré-produção','Desperdício',
      'Compras','Aprovação de compras',
      'Fornecedores','Relatórios',
      'Checklist Meu','Checklist',
      'Manutenção','RH','Performance',
      'Gerenciar usuários','Configurações',
      'Etiquetagem','Etiquetagem: Produção','Etiquetagem: Cadastros',
    ]
  },
  supervisor: {
    label: 'Supervisor', icon: 'key', color: '#D97706', bg: '#FEF3C7', mutavel: true,
    perms: [
      'Ver Dashboard',
      'Estoque','Estoque: Contagem Diária','Estoque: Contagem Semanal','Estoque: Movimentações',
      'Pré-produção','Desperdício',
      'Compras','Aprovação de compras',
      'Fornecedores','Relatórios',
      'Checklist Meu','Checklist',
      'Manutenção','RH','Performance',
      'Etiquetagem','Etiquetagem: Produção','Etiquetagem: Cadastros',
    ]
  },
  comprador: {
    label: 'Comprador', icon: 'shopping-cart', color: '#16A34A', bg: '#DCFCE7', mutavel: true,
    perms: [
      'Ver Dashboard',
      'Estoque','Estoque: Contagem Diária','Estoque: Contagem Semanal','Estoque: Movimentações',
      'Pré-produção',
      'Compras',
      'Fornecedores',
      'Checklist Meu','Checklist',
      'Etiquetagem','Etiquetagem: Produção',
    ]
  },
  funcionario: {
    label: 'Funcionário', icon: 'user', color: '#3B82F6', bg: '#EFF6FF', mutavel: true,
    perms: ['Checklist Meu','Etiquetagem']
  },
};
(function() {
  const s = db._get('vtp_perms', null);
  if (!s) return;
  Object.keys(s).forEach(k => {
    if (PERMS[k]) {
      if (s[k].perms) PERMS[k].perms = s[k].perms;
      if (PERMS[k].mutavel !== false && s[k].label) PERMS[k].label = s[k].label;
    } else if (s[k]?.label && s[k]?.perms) {
      PERMS[k] = {
        label:   s[k].label,
        icon:    s[k].icon  || 'user',
        color:   s[k].color || 'var(--muted)',
        bg:      s[k].bg    || 'var(--surface2)',
        mutavel: true,
        perms:   s[k].perms,
      };
    }
  });
})();
const savePerms = () => db._set('vtp_perms',
  Object.fromEntries(Object.entries(PERMS).map(([k, v]) => [k, {
    label: v.label, icon: v.icon, color: v.color, bg: v.bg, mutavel: v.mutavel, perms: v.perms,
  }]))
);

// Retorna permissões do usuário: usa override individual se existir, senão as do perfil
function getUserPerms(user) {
  if (user?.perms && Array.isArray(user.perms)) return user.perms;
  return PERMS[user?.role]?.perms || [];
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE LISTA
// ══════════════════════════════════════════════════════════════
function novaLista(itemsCarrinho) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const id   = nextLid++;
  const lista = {
    id,
    codigo:        'LC' + String(id).padStart(4, '0'),
    dataCriacao:   new Date().toISOString(),
    criadoPor:     user?.name || 'Sistema',
    etapa:         1, // 1=Lista, 2=AprovPré, 3=Cotação, 4=AprovFinal, 5=OC, 6=Recebimento
    tipo:          'insumos',  // insumos|embalagens|limpeza|descart|uniformes|marketing|manutencao|equip|servicos|outros
    status:        'montagem', // montagem|cotacao|cotacao_encerrada|aguard_aprovacao|aprovada|reprovada|ordem_criada|recebimento|concluida
    valorEstimado: 0,
    valorAprovado: 0,
    valorFinal:    0,
    prazoCotacao:  null,
    observacoes:   '',
    dataConclusao: null,
    itens:         itemsCarrinho.map((ci, idx) => {
      const item = items.find(i => i.id === ci.itemId);
      return {
        id:                  idx + 1,
        itemId:              ci.itemId,
        nome:                item?.name || ci.nome || '',
        categoria:           item?.cat  || ci.cat  || '',
        unidade:             item?.unit || ci.unit || 'un',
        qtdSugerida:         ci.qtdSugerida || 0,
        qtdSelecionada:      ci.qty,
        qtdAprovada:         null,
        qtdComprada:         null,
        qtdRecebida:         null,
        estoqueAtual:        item?.qty || 0,
        estoqueMinimo:       item?.min || 0,
        estoqueIdeal:        item?.ideal || 0,
        origem:              ci.origem || 'estoque',
        tipoCompra:          'fornecedor', // fornecedor|supermercado
        fornecedorId:        item?.supId || null,
        localCompra:         '',
        diaCompra:           '',
        responsavelCompra:   '',
        precoUnitEstimado:   item?.cost || 0,
        precoUnitFinal:      null,
        valorTotal:          0,
        statusItem:          'pendente',
        observacoes:         ci.obs || '',
        aprovado:            null,
        comentarioAprovador: '',
        conferido:           false,
        divergencia:         false,
        comentarioConferencia: '',
      };
    }),
    cotacoes:      [],
    ordens:        [],
  };
  // Calcula estimativa inicial
  lista.valorEstimado = lista.itens.reduce((s, i) => s + i.qtdSelecionada * i.precoUnitEstimado, 0);
  listas.push(lista);
  saveListas();
  return lista;
}

function getLista(id) {
  return listas.find(l => l.id === id) || null;
}

function getListaAtiva() {
  return listas.filter(l => l.status !== 'concluida').sort((a,b) => b.id - a.id)[0] || null;
}

const TIPOS_LISTA = {
  insumos:    { label: 'Insumos de Produção',    icon: 'package',         color: 'var(--purple)',     bg: 'var(--purple-xlight)' },
  embalagens: { label: 'Embalagens',             icon: 'box',             color: 'var(--orange-dark)',bg: 'var(--orange-light)'  },
  limpeza:    { label: 'Limpeza e Higiene',       icon: 'sparkles',        color: 'var(--green)',      bg: 'var(--green-light)'   },
  descart:    { label: 'Descartáveis / Copa',     icon: 'coffee',          color: 'var(--muted)',      bg: 'var(--surface2)'      },
  uniformes:  { label: 'Uniformes e EPI',         icon: 'shirt',           color: 'var(--muted)',      bg: 'var(--surface2)'      },
  marketing:  { label: 'Marketing e Gráfico',     icon: 'printer',         color: 'var(--purple)',     bg: 'var(--purple-xlight)' },
  manutencao: { label: 'Manutenção e Serviços',   icon: 'wrench',          color: 'var(--red)',        bg: 'var(--red-light)'     },
  equip:      { label: 'Equipamentos',            icon: 'monitor-check',   color: 'var(--yellow)',     bg: 'var(--yellow-light)'  },
  servicos:   { label: 'Serviços Terceirizados',  icon: 'briefcase',       color: 'var(--muted)',      bg: 'var(--surface2)'      },
  outros:     { label: 'Outros',                  icon: 'more-horizontal', color: 'var(--muted)',      bg: 'var(--surface2)'      },
};
(function() {
  const s = db._get('vtp_tipos_lista', null);
  if (s) Object.keys(TIPOS_LISTA).forEach(k => { if (s[k]) Object.assign(TIPOS_LISTA[k], s[k]); });
})();
const saveTiposLista = () => db._set('vtp_tipos_lista', TIPOS_LISTA);

// ══════════════════════════════════════════════════════════════
// INVENTÁRIO — Localizações e Categorias de ativo
// ══════════════════════════════════════════════════════════════

let inventarioLocs = db._get('vtp_inv_locs', null) || [
  { id:'cozinha_fin',  label:'Cozinha Finalização' },
  { id:'cozinha_prod', label:'Cozinha Produção'    },
  { id:'escritorio',   label:'Escritório'           },
  { id:'atendimento',  label:'Atendimento'          },
  { id:'delivery',     label:'Delivery'             },
  { id:'estoque_coz',  label:'Estoque Cozinha'      },
  { id:'corredor',     label:'Corredor'             },
  { id:'quintal',      label:'Quintal'              },
];
const saveInventarioLocs = () => db._set('vtp_inv_locs', inventarioLocs);

let inventarioCats = db._get('vtp_inv_cats', null) || {
  equipamento: { label:'Equipamento', icon:'settings',   color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
  estrutura:   { label:'Estrutura',   icon:'building-2', color:'var(--yellow)',      bg:'var(--yellow-light)',  _builtin:true },
  mobiliario:  { label:'Mobiliário',  icon:'layers',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  eletronico:  { label:'Eletrônico',  icon:'monitor',    color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  utensilio:   { label:'Utensílio',   icon:'utensils',   color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
};
const saveInventarioCats = () => db._set('vtp_inv_cats', inventarioCats);

// ══════════════════════════════════════════════════════════════
// MANUTENÇÃO — Categorias e Grupos/Setores
// ══════════════════════════════════════════════════════════════

let manutCats = db._get('vtp_manut_cats_cfg', null) || {
  limpeza:      { label:'Limpeza',      icon:'sparkles',        color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
  eletrica:     { label:'Elétrica',     icon:'zap',             color:'var(--yellow)',      bg:'var(--yellow-light)',  _builtin:true },
  hidraulica:   { label:'Hidráulica',   icon:'droplets',        color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  refrigeracao: { label:'Refrigeração', icon:'thermometer',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  equipamento:  { label:'Equipamento',  icon:'wrench',          color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
  pragas:       { label:'Pragas',       icon:'shield',          color:'var(--red)',         bg:'var(--red-light)',     _builtin:true },
  documento:    { label:'Doc / Alvará', icon:'file-text',       color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
  estrutura:    { label:'Estrutura',    icon:'hammer',          color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
  outros:       { label:'Outros',       icon:'more-horizontal', color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
};
const saveManutCats = () => db._set('vtp_manut_cats_cfg', manutCats);

let manutGrupos = db._get('vtp_manut_grupos', null) || {
  producao_quente: { label:'Produção Quente',            icon:'flame',       color:'var(--red)',         bg:'var(--red-light)',     _builtin:true },
  refrigeracao:    { label:'Refrigeração e Conservação', icon:'thermometer', color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  climatizacao:    { label:'Climatização e Exaustão',    icon:'wind',        color:'var(--muted)',       bg:'var(--surface2)',      _builtin:true },
  preparacao:      { label:'Preparação e Processamento', icon:'settings',    color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
  utensilios:      { label:'Utensílios Operacionais',    icon:'utensils',    color:'var(--green)',       bg:'var(--green-light)',   _builtin:true },
  infraestrutura:  { label:'Infraestrutura / Instalações', icon:'building-2', color:'var(--yellow)',    bg:'var(--yellow-light)',  _builtin:true },
  tecnologia:      { label:'Tecnologia e Atendimento',   icon:'monitor',     color:'var(--purple)',      bg:'var(--purple-xlight)', _builtin:true },
  delivery:        { label:'Delivery e Logística',       icon:'truck',       color:'var(--orange-dark)', bg:'var(--orange-light)',  _builtin:true },
};
const saveManutGrupos = () => db._set('vtp_manut_grupos', manutGrupos);

// ══════════════════════════════════════════════════════════════
// CHECKLIST — Turnos
// ══════════════════════════════════════════════════════════════

let checklistTurnos = db._get('vtp_ck_turnos', null) || [
  { id:'abertura',   label:'Abertura'   },
  { id:'producao',   label:'Produção'   },
  { id:'operacao',   label:'Operação'   },
  { id:'fechamento', label:'Fechamento' },
  { id:'diario',     label:'Diário'     },
  { id:'turno',      label:'Turno'      },
];
const saveChecklistTurnos = () => db._set('vtp_ck_turnos', checklistTurnos);

// ══════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════
let auditLog = db._get('vtp_auditlog', []);
const saveAuditLog = () => db._set('vtp_auditlog', auditLog);

function logAudit(acao, detalhe, modulo) {
  try {
    const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    auditLog.push({
      id: crypto.randomUUID(),
      user_id:   u ? u.id   : null,
      user_name: u ? u.name : 'Sistema',
      user_role: u ? u.role : '',
      acao:    acao    || '',
      modulo:  modulo  || '',
      detalhe: detalhe || '',
      created_at: new Date().toISOString(),
    });
    if (auditLog.length > 3000) auditLog = auditLog.slice(-3000);
    saveAuditLog();
  } catch(e) {}
}

const STATUS_ETAPA = {
  montagem:              { label: 'Em montagem',           color: 'var(--muted)',        bg: 'var(--surface2)'      },
  aguard_aprov_pre:      { label: 'Aguard. pré-aprovação', color: 'var(--yellow)',       bg: 'var(--yellow-light)'  },
  aprov_pre_reprovada:   { label: 'Pré-aprov. reprovada',  color: 'var(--red)',          bg: 'var(--red-light)'     },
  cotacao:               { label: 'Em cotação',            color: 'var(--purple)',       bg: 'var(--purple-xlight)' },
  cotacao_encerrada:     { label: 'Cotação encerrada',     color: 'var(--orange-dark)',  bg: 'var(--orange-light)'  },
  aguard_aprov_final:    { label: 'Aguard. aprov. final',  color: 'var(--yellow)',       bg: 'var(--yellow-light)'  },
  aprov_final_reprovada: { label: 'Aprov. final reprovada',color: 'var(--red)',          bg: 'var(--red-light)'     },
  ordem_criada:          { label: 'Ordem de compra',       color: 'var(--purple)',       bg: 'var(--purple-xlight)' },
  recebimento:           { label: 'Em recebimento',        color: 'var(--yellow)',       bg: 'var(--yellow-light)'  },
  concluida:             { label: 'Concluída',             color: 'var(--green)',        bg: 'var(--green-light)'   },
};

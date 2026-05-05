/**
 * VTP Compras — Vai Ter Pizza!
 * data.js — Estado global, dados iniciais e persistência (localStorage)
 */

// ══════════════════════════════════════════════════════════════
// DADOS INICIAIS
// ══════════════════════════════════════════════════════════════

let items = JSON.parse(localStorage.getItem('vtp_items') || 'null') || [
  { id:1,  name:'Mussarela em Barra',       cat:'Laticínios',         unit:'kg', qty:4,    min:20,  ideal:55,  cost:33.92, supId:null, brands:['Polenghi','Scala','Tirolez'], code:'169713', isProd:false },
  { id:2,  name:'Farinha de Trigo',          cat:'Massas',             unit:'kg', qty:18,   min:20,  ideal:85,  cost:4.43,  supId:null, brands:['Anaconda','Venturelli'],       code:'167714', isProd:false },
  { id:3,  name:'Calabresa',                 cat:'Carnes e Frios',     unit:'kg', qty:6,    min:8,   ideal:15,  cost:24.80, supId:null, brands:['Sadia','Seara'],               code:'157637', isProd:false },
  { id:4,  name:'Pepperoni',                 cat:'Carnes e Frios',     unit:'kg', qty:2,    min:5,   ideal:10,  cost:48,    supId:null, brands:['Sadia'],                        code:'157640', isProd:false },
  { id:5,  name:'Requeijão',                 cat:'Laticínios',         unit:'kg', qty:9,    min:7.5, ideal:16,  cost:48,    supId:null, brands:[],                              code:'157631', isProd:false },
  { id:6,  name:'Caixa Pizza Grande',        cat:'Embalagens',         unit:'un', qty:40,   min:400, ideal:482, cost:3.30,  supId:null, brands:[],                              code:'159735', isProd:false },
  { id:7,  name:'Molho de Tomate',           cat:'Molhos',             unit:'kg', qty:12,   min:2,   ideal:24,  cost:8.39,  supId:null, brands:['Oderich','Fugini'],            code:'157677', isProd:false },
  { id:8,  name:'Cream Cheese',              cat:'Laticínios',         unit:'kg', qty:3.9,  min:5,   ideal:12,  cost:35,    supId:null, brands:[],                              code:'157636', isProd:false },
  { id:9,  name:'Bacon em Cubos',            cat:'Carnes e Frios',     unit:'kg', qty:2,    min:3,   ideal:12,  cost:32.61, supId:null, brands:['Sadia','Seara'],               code:'157640', isProd:false },
  { id:10, name:'Caixa Pizza Pequena',       cat:'Embalagens',         unit:'un', qty:40,   min:400, ideal:393, cost:2.60,  supId:null, brands:[],                              code:'160000', isProd:false },
  { id:11, name:'Frango Desfiado',           cat:'Produção Interna',   unit:'kg', qty:8,    min:1,   ideal:18,  cost:57.01, supId:null, brands:[],                              code:'157638', isProd:true,  medPorcao:0.090 },
  { id:12, name:'Carne de Sol Desfiada',     cat:'Produção Interna',   unit:'kg', qty:12,   min:2,   ideal:20,  cost:70,    supId:null, brands:[],                              code:'157645', isProd:true,  medPorcao:0.080 },
  { id:13, name:'Mussarela Triturada',       cat:'Produção Interna',   unit:'kg', qty:16.8, min:3,   ideal:30,  cost:34,    supId:null, brands:[],                              code:'157629', isProd:true,  medPorcao:0.090 },
  { id:14, name:'Brigadeiro de Chocolate',   cat:'Produção Interna',   unit:'kg', qty:16.9, min:0.5, ideal:20,  cost:24.58, supId:null, brands:[],                              code:'163291', isProd:true,  medPorcao:0.175 },
  { id:15, name:'Creme de Gorgonzola',       cat:'Produção Interna',   unit:'kg', qty:8.4,  min:0.3, ideal:12,  cost:61.83, supId:null, brands:[],                              code:'157633', isProd:true,  medPorcao:0.080 },
  { id:16, name:'Costela Bovina Desfiada',   cat:'Produção Interna',   unit:'kg', qty:7.1,  min:3,   ideal:15,  cost:75.81, supId:null, brands:[],                              code:'157646', isProd:true,  medPorcao:0.075 },
];

let suppliers = JSON.parse(localStorage.getItem('vtp_suppliers') || '[]');

let users = JSON.parse(localStorage.getItem('vtp_users') || 'null') || [
  { id:1, name:'Yuri Pappas', email:'gerente@vaiterpizza.com',    role:'gerente',    active:true },
  { id:2, name:'Ana Silva',   email:'supervisor@vaiterpizza.com', role:'supervisor', active:true },
  { id:3, name:'Carlos Lima', email:'comprador@vaiterpizza.com',  role:'comprador',  active:true },
];

let ordens       = JSON.parse(localStorage.getItem('vtp_ordens')         || '[]');
let cycle        = JSON.parse(localStorage.getItem('vtp_cycle')          || 'null');
let responses    = JSON.parse(localStorage.getItem('vtp_responses')      || '{}');
let approvals    = JSON.parse(localStorage.getItem('vtp_approvals')      || '{}');
let cycleHistory = JSON.parse(localStorage.getItem('vtp_cycle_history')  || '[]');

// ── Contadores de ID ──
let nextIid = Math.max(...items.map(i => i.id), 0) + 1;
let nextSid = Math.max(...(suppliers.length ? suppliers.map(s => s.id) : [0]), 0) + 1;
let nextUid = Math.max(...users.map(u => u.id), 0) + 1;

// ── Estado de UI ──
let changedIds     = new Set();
let editItemId     = null;
let editSupId      = null;
let editUserId     = null;
let importData     = [];
let sazonalPctAtual = 0;
let currentTab3    = 'compare';
let sidebarOpen    = false;

// ══════════════════════════════════════════════════════════════
// PERSISTÊNCIA
// ══════════════════════════════════════════════════════════════

const saveI  = () => localStorage.setItem('vtp_items',         JSON.stringify(items));
const saveS  = () => localStorage.setItem('vtp_suppliers',     JSON.stringify(suppliers));
const saveU  = () => localStorage.setItem('vtp_users',         JSON.stringify(users));
const saveO  = () => localStorage.setItem('vtp_ordens',        JSON.stringify(ordens));
const saveC  = () => localStorage.setItem('vtp_cycle',         JSON.stringify(cycle));
const saveR  = () => localStorage.setItem('vtp_responses',     JSON.stringify(responses));
const saveAp = () => localStorage.setItem('vtp_approvals',     JSON.stringify(approvals));
const saveCH = () => localStorage.setItem('vtp_cycle_history', JSON.stringify(cycleHistory));

// ══════════════════════════════════════════════════════════════
// PERMISSÕES
// ══════════════════════════════════════════════════════════════

const PERMS = {
  gerente: {
    label: '👑 Gerente', color: '#6B21D4', bg: '#EDE9FE',
    perms: ['Ver Dashboard','Estoque','Pré-produção','Compras','Aprovação de compras','Fornecedores','Relatórios','Gerenciar usuários','Configurações']
  },
  supervisor: {
    label: '🔑 Supervisor', color: '#D97706', bg: '#FEF3C7',
    perms: ['Ver Dashboard','Estoque','Pré-produção','Compras','Aprovação de compras','Fornecedores','Relatórios','Configurações']
  },
  comprador: {
    label: '🛒 Comprador', color: '#16A34A', bg: '#DCFCE7',
    perms: ['Ver Dashboard','Estoque','Pré-produção','Compras','Fornecedores']
  },
};

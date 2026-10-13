/**
 * VTP Compras — Vai Ter Pizza!
 * cp-base.js — Módulo de Compras (novo): abas no topo, dados e utilitários
 *
 * Abas: Compras (visão geral) · Lista de compra · Cotação · Recebimento
 *       · Histórico (fluxo antigo, só consulta até a troca completa)
 *
 * Fluxo: Lista de compra (aprovada) → Cotação (lotes) → Recebimento (1 pedido
 * por fornecedor) → conferido = Compra + entrada no estoque.
 * Compra avulsa / nota importada vai direto para Compras + estoque.
 *
 * Dados: tabelas cp_* no Supabase (migration 20261013120000). Fornecedores
 * continuam em vtp_suppliers. Entrada no estoque = est_movimentacoes
 * 'recebimento' (ref_tipo 'compra', ref_id = cp_compra_itens.id).
 */

const CP_ABAS = [
  { id: 'compras',     icon: 'shopping-bag',   label: 'Compras'        },
  { id: 'listas',      icon: 'clipboard-list', label: 'Lista de compra' },
  { id: 'cotacao',     icon: 'tag',            label: 'Cotação' },
  { id: 'recebimento', icon: 'truck',          label: 'Recebimento',    breve: true },
  { id: 'antigo',      icon: 'archive',        label: 'Histórico (antigo)' },
];

let _cpAba = 'compras';
window._vtpGetTab_compras = () => _cpAba;
window._vtpSetTab_compras = v => { if (CP_ABAS.some(a => a.id === v)) _cpAba = v; };

function cpTabsHtml() {
  return `<div style="display:flex;gap:2px;border-bottom:1.5px solid var(--border);padding:0 24px;background:var(--bg);flex-wrap:wrap;align-items:flex-end">
    ${CP_ABAS.map(a => {
      const on = _cpAba === a.id;
      return `<button onclick="cpSetAba('${a.id}')"
        style="display:inline-flex;align-items:center;gap:7px;padding:12px 16px 10px;border:none;background:none;cursor:pointer;font-family:inherit;
        font-size:var(--text-md);font-weight:${on ? 700 : 500};color:${on ? 'var(--purple)' : a.breve ? 'var(--muted)' : 'var(--text2)'};
        border-bottom:2.5px solid ${on ? 'var(--purple)' : 'transparent'};margin-bottom:-1.5px">
        ${lc(a.icon, 15, 'currentColor')} ${a.label}${a.breve ? ' <span class="badge b-gray" style="font-size:var(--text-2xs)">em breve</span>' : ''}</button>`;
    }).join('')}
    <button class="btn btn-ghost btn-sm" style="margin-left:auto;margin-bottom:6px;color:var(--muted)" onclick="goModule('configuracoes');setCfgTab('fornecedores')">${lc('truck', 13, 'currentColor')} Fornecedores</button>
  </div>`;
}

function cpSetAba(aba) {
  _cpAba = aba;
  // Histórico: abre sem o filtro da semana atual, para ver todas as listas antigas
  if (aba === 'antigo') { _cpListaAberta = null; window._lcDe = ''; window._lcAte = ''; }
  renderComprasLayout();
}

// Chamado por renderComprasLayout (compras.js) quando a aba não é o fluxo antigo
function cpRenderAba() {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;
  const aba = CP_ABAS.find(a => a.id === _cpAba) || CP_ABAS[0];
  if (aba.breve) {
    el.innerHTML = `<div style="padding:60px 24px;text-align:center;color:var(--muted);font-size:var(--text-md)">
      ${lc(aba.icon, 28, 'var(--muted)')}<div style="font-size:var(--text-lg);font-weight:800;color:var(--text);margin:10px 0 4px">${aba.label}</div>
      Esta aba chega nas próximas entregas do módulo novo. Enquanto isso, o fluxo de listas continua em <strong>Histórico (antigo)</strong>.</div>`;
    return;
  }
  el.innerHTML = `<div style="padding:20px 24px" id="cpAbaBody"></div>`;
  if (aba.id === 'compras') cpRenderAbaCompras();
  else if (aba.id === 'listas') cpRenderAbaListas();
  else if (aba.id === 'cotacao') cpRenderAbaCotacao();
}

// ── Dados ──────────────────────────────────────────────────────

const _cpSb = () => _estSb();

async function cpSelect(tabela, montar) {
  return _estSelectTodos(() => montar(_cpSb().from(tabela)));
}

async function cpInsert(tabela, rows) {
  const lista = Array.isArray(rows) ? rows : [rows];
  if (!lista.length) return [];
  const { data, error } = await _cpSb().from(tabela).insert(lista).select();
  if (error) throw new Error(error.message);
  return data;
}

async function cpUpdate(tabela, id, campos) {
  const { data, error } = await _cpSb().from(tabela).update({ ...campos, atualizado_por: estUsuario() }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Período: semana de compras (segunda a domingo) ─────────────

function cpSegunda(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay();                 // 0 = domingo
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}
const cpIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function cpSemana(offset = 0) {
  const seg = cpSegunda(); seg.setDate(seg.getDate() + offset * 7);
  const dom = new Date(seg); dom.setDate(dom.getDate() + 6);
  return { de: cpIso(seg), ate: cpIso(dom) };
}
const cpDataBr = iso => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—';

// ── Fornecedores ───────────────────────────────────────────────

const cpFornecedor = id => (typeof suppliers !== 'undefined' ? suppliers : []).find(s => s.id === id) || null;
const cpSoDigitos = s => String(s || '').replace(/\D/g, '');

// Acha o fornecedor de uma nota: pelo CNPJ salvo no cadastro, senão pelo nome
function cpAcharFornecedor(nome, doc) {
  const d = cpSoDigitos(doc);
  const lista = (typeof suppliers !== 'undefined' ? suppliers : []).filter(s => s.active !== false);
  if (d) { const s = lista.find(x => cpSoDigitos(x.cnpj) === d); if (s) return { s, certo: true }; }
  if (nome && typeof _cwRank === 'function') {
    const c = _cwRank(nome, lista, 'name', 1, 0.5)[0];
    if (c) return { s: c.x, certo: false };
  }
  return null;
}

// Chave do fornecedor para a memória nota → insumo
const cpChaveForn = (doc, fornId, nome) => cpSoDigitos(doc) || (fornId ? 'forn:' + fornId : 'nome:' + (typeof _cwNorm === 'function' ? _cwNorm(nome) : String(nome || '').toLowerCase()));
const cpChaveProduto = (cod, desc) => (cod && String(cod).trim()) || ('desc:' + (typeof _cwNorm === 'function' ? _cwNorm(desc) : String(desc || '').toLowerCase()));

// ── Anexos (bucket cp-anexos) ──────────────────────────────────

async function cpUploadAnexo(file, pasta = 'notas') {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const agora = new Date();
  const path = `${pasta}/${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
  const { error } = await _cpSb().storage.from('cp-anexos').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
const cpUrlAnexo = path => path ? _cpSb().storage.from('cp-anexos').getPublicUrl(path).data.publicUrl : null;

function cpLerBase64(file) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]+,/, ''));
    r.onerror = () => falha(new Error('não consegui ler o arquivo'));
    r.readAsDataURL(file);
  });
}

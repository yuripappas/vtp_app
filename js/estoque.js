/**
 * VTP Compras — Vai Ter Pizza!
 * estoque.js — Entrada da página do Estoque (abas no topo) e débito automático.
 *
 * Abas: estoque-aba.js (Estoque) · estoque-contagem.js (Contagem por ciclos)
 * · estoque-mov.js (Movimentações) · estoque-cmv.js (CMV do ciclo).
 */

let _estCpAba = 'estoque';   // 'estoque' | 'contagens' | 'movimentacoes' (o CMV do ciclo foi para o módulo CMV)
window._vtpGetTab_estoque = () => _estCpAba;
window._vtpSetTab_estoque = (v) => { _estCpAba = v; };

// ── Débito automático (calculado, não configurado) ─────────────
// Um item tem débito automático quando aparece DIRETO na ficha técnica de
// algo que é vendido: base da pizza (massa+embalagem), opção/sabor, produto
// avulso, ou é ele próprio vendido (bebida mapeada como insumo no CW).
// Não desce para dentro do preparado: a pizza baixa a Mussarela Triturada,
// não a Mussarela em Barra — a barra sai do saldo só na contagem.
// Devolve Map itemId → [nomes do que o consome], pra explicar no cadastro.
function estDebitoAutoMapa() {
  const mapa = new Map();
  const add = (itemId, origem) => {
    if (itemId == null) return;
    if (!mapa.has(itemId)) mapa.set(itemId, []);
    const l = mapa.get(itemId);
    if (!l.includes(origem)) l.push(origem);
  };
  const ativo = x => x && x.active !== false;
  (typeof produtosPizza !== 'undefined' ? produtosPizza : []).filter(ativo)
    .forEach(p => (p.fichaTecnica?.ingredientes || []).forEach(i => add(i.item_id, p.nome)));
  (typeof opcoes !== 'undefined' ? opcoes : []).filter(ativo)
    .forEach(o => (o.fichaTecnica?.ingredientes || []).forEach(i => add(i.item_id, o.nome)));
  (typeof produtos !== 'undefined' ? produtos : []).filter(ativo)
    .forEach(p => (p.fichaTecnica?.ingredientes || []).forEach(i => add(i.item_id, p.name)));
  const bebidas = (typeof _cwMapa !== 'undefined' && _cwMapa?.bebidas) || {};
  Object.values(bebidas).forEach(b => { if (b?.tipo === 'insumo') add(b.id, 'Venda direta'); });
  return mapa;
}

function _renderCpEstoque() {
  const el = document.getElementById('cpSectionContent');
  if (!el) return;
  _setPageTitle('Estoque');
  if (!['estoque', 'contagens', 'movimentacoes'].includes(_estCpAba)) _estCpAba = 'estoque';
  el.innerHTML = `<div style="padding:20px 24px">${_estTopTabsHtml()}<div id="estAbaBody"></div></div>`;
  // Contador de contagens em andamento na aba Contagem
  if (typeof _ctgDados !== 'undefined' && !_ctgDados && _estCpAba !== 'contagens') _ctgCarregar().catch(() => {});
  if (_estCpAba === 'movimentacoes') estRenderAbaMov();
  else if (_estCpAba === 'contagens') estRenderAbaContagem();
  else estRenderAbaEstoque();
}

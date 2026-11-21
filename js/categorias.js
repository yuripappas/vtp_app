/**
 * VTP — Vai Ter Pizza!
 * categorias.js — Motor único das categorias de insumo e processado
 *
 * Uma só lista (CATEGORIAS_INSUMO, kv vtp_emp_cat_insumo) usada por todo o app:
 * cadastro de insumo e processado, estoque, contagem, CMV, compras, etiquetagem,
 * vendas/insumos, previsão. Toda tela que cria, renomeia ou exclui categoria
 * passa por aqui, e a mudança vai para todos os lugares onde o nome aparece:
 *   • itens (item.cat) e a lista de categorias
 *   • categorias fora do CMV (vtp_config.catsForaCMV)
 *   • categorias visíveis na etiquetagem (vtp_etiq_categorias)
 *   • histórico de preços (vtp_price_history) e etiquetas impressas (vtp_etiquetas)
 *   • tabelas: est_movimentacoes, est_contagem_itens, cp_compra_itens, cp_lista_itens
 * Grafia padrão: MAIÚSCULAS (como as que já existem).
 */

const catNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Lista oficial (sem a antiga categoria-tipo "PREPARADOS")
function catLista() {
  return (typeof CATEGORIAS_INSUMO !== 'undefined' ? CATEGORIAS_INSUMO : []).filter(c => !/^PREPARADOS?$/i.test(c));
}
// Grafia cadastrada para um nome digitado (ignora maiúscula/acento); null se não existe
const catEncontrar = nome => catLista().find(c => catNorm(c) === catNorm(nome)) || null;
const catQtdItens = nome => (typeof items !== 'undefined' ? items : []).filter(i => i.active !== false && i.cat === nome).length;

function _catSalvarLista() {
  CATEGORIAS_INSUMO.sort((a, b) => a.localeCompare(b));
  if (typeof saveCategoriasInsumo === 'function') saveCategoriasInsumo();
}

function catAdicionar(nome) {
  const v = String(nome || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  if (!v) throw new Error('Informe o nome da categoria');
  const ex = catEncontrar(v);
  if (ex) throw new Error(`A categoria "${ex}" já existe`);
  CATEGORIAS_INSUMO.push(v);
  _catSalvarLista();
  return v;
}

// Troca o nome em todo lugar. Se a nova já existe, junta as duas (move os itens).
async function catRenomear(antiga, nova) {
  const alvoDigitado = String(nova || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  if (!alvoDigitado) throw new Error('Informe o novo nome');
  const existente = catLista().find(c => c !== antiga && catNorm(c) === catNorm(alvoDigitado));
  const alvo = existente || alvoDigitado;
  if (alvo === antiga) return { alvo, itens: 0, juntou: false };

  // Itens
  let n = 0;
  (typeof items !== 'undefined' ? items : []).forEach(i => { if (i.cat === antiga) { i.cat = alvo; n++; } });
  if (n && typeof saveI === 'function') saveI();
  // Lista
  const idx = CATEGORIAS_INSUMO.indexOf(antiga);
  if (idx >= 0) { if (existente) CATEGORIAS_INSUMO.splice(idx, 1); else CATEGORIAS_INSUMO[idx] = alvo; }
  else if (!existente) CATEGORIAS_INSUMO.push(alvo);
  _catSalvarLista();
  _catPropagar(antiga, alvo);
  await _catAtualizarTabelas(antiga, alvo);
  return { alvo, itens: n, juntou: !!existente };
}

// Exclui. Se tiver itens, precisa dizer para qual categoria eles vão.
async function catExcluir(nome, moverPara = null) {
  const n = catQtdItens(nome) + (typeof items !== 'undefined' ? items.filter(i => i.active === false && i.cat === nome).length : 0);
  if (n && !moverPara) throw new Error(`"${nome}" tem ${n} item(ns). Escolha para qual categoria eles vão.`);
  if (n) return catRenomear(nome, moverPara);
  const idx = CATEGORIAS_INSUMO.indexOf(nome);
  if (idx >= 0) CATEGORIAS_INSUMO.splice(idx, 1);
  _catSalvarLista();
  _catPropagar(nome, null);
  return { alvo: null, itens: 0 };
}

// Configurações e históricos guardados no kv_store
function _catPropagar(antiga, nova) {
  const troca = c => c === antiga ? nova : c;
  // Fora do CMV
  if (typeof getConfig === 'function') {
    const cfg = getConfig();
    if (Array.isArray(cfg.catsForaCMV) && cfg.catsForaCMV.includes(antiga)) {
      cfg.catsForaCMV = [...new Set(cfg.catsForaCMV.map(troca).filter(Boolean))];
      db._set('vtp_config', cfg);
      if (typeof estInvalidarSaldos === 'function') estInvalidarSaldos();
    }
  }
  // Etiquetagem: categorias visíveis
  const etq = db._get('vtp_etiq_categorias', null);
  if (Array.isArray(etq) && etq.includes(antiga)) db._set('vtp_etiq_categorias', [...new Set(etq.map(troca).filter(Boolean))]);
  if (!nova) return;
  // Histórico de preços e etiquetas impressas
  if (typeof priceHistory !== 'undefined' && priceHistory.some(p => p.cat === antiga)) {
    priceHistory.forEach(p => { if (p.cat === antiga) p.cat = nova; });
    if (typeof savePriceHistory === 'function') savePriceHistory();
  }
  const etqs = db._get('vtp_etiquetas', null);
  if (Array.isArray(etqs) && etqs.some(e => e.item_cat === antiga)) {
    etqs.forEach(e => { if (e.item_cat === antiga) e.item_cat = nova; });
    db._set('vtp_etiquetas', etqs);
    if (typeof _etiquetas !== 'undefined') etqs.forEach((e, k) => { if (_etiquetas[k]?.id === e.id) _etiquetas[k].item_cat = e.item_cat; });
  }
}

// Tabelas com a categoria gravada em cada linha
async function _catAtualizarTabelas(antiga, nova) {
  if (typeof _estSb !== 'function') return;
  for (const t of ['est_movimentacoes', 'est_contagem_itens', 'cp_compra_itens', 'cp_lista_itens']) {
    const { error } = await _estSb().from(t).update({ categoria: nova }).eq('categoria', antiga);
    if (error) console.warn(`[categorias] ${t}:`, error.message);
  }
}

// Na carga: tira das configurações nomes que não existem mais na lista
(function _catLimparConfigs() {
  try {
    const validas = new Set(catLista());
    const etq = db._get('vtp_etiq_categorias', null);
    if (Array.isArray(etq)) {
      const ok = etq.filter(c => validas.has(c));
      if (ok.length !== etq.length) db._set('vtp_etiq_categorias', ok);
    }
  } catch (e) { console.warn('[categorias] limpeza:', e.message); }
})();

// Tela de exclusão (Configurações e Empresa usam a mesma)
function catExcluirUI(nome, depois) {
  if (!nome) return;
  const n = catQtdItens(nome) + (typeof items !== 'undefined' ? items.filter(i => i.active === false && i.cat === nome).length : 0);
  if (!n) return vtpConfirm({
    title: `Excluir a categoria "${nome}"?`, message: 'Nenhum item usa esta categoria.', confirmLabel: 'Excluir',
    onConfirm: () => catExcluir(nome).then(() => { toast(`Categoria "${nome}" excluída`, 'ok'); depois?.(); }).catch(e => toast(e.message, 'err')),
  });
  const outras = catLista().filter(c => c !== nome);
  _estModal('ovCatExcluir', `Excluir "${_estEsc(nome)}"`, `
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:12px">${n} item(ns) estão nesta categoria. Para onde eles vão? O histórico (estoque, contagens, compras, etiquetas) vai junto.</div>
    ${_estCampo('Mover itens para *', `<select class="inp" id="catExcluirDestino"><option value="">— Selecionar —</option>${outras.map(c => `<option>${_estEsc(c)}</option>`).join('')}</select>`)}`,
    `_catExcluirConfirmar(${JSON.stringify(nome).replace(/"/g, '&quot;')})`, 'Mover e excluir', 480);
  window._catExcluirDepois = depois;
}
function _catExcluirConfirmar(nome) {
  const destino = document.getElementById('catExcluirDestino')?.value;
  if (!destino) return toast('Escolha a categoria de destino', 'err');
  catExcluir(nome, destino).then(r => {
    document.getElementById('ovCatExcluir')?.remove();
    toast(`"${nome}" excluída · ${r.itens} item(ns) foram para "${r.alvo}"`, 'ok');
    window._catExcluirDepois?.();
  }).catch(e => toast(e.message, 'err'));
}

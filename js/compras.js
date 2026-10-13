/**
 * VTP Compras — Vai Ter Pizza!
 * compras.js — Entrada do módulo Compras e da página do Estoque.
 *
 * As duas usam o mesmo container (page-compras). Compras: abas no topo
 * (cp-base.js e cp-*.js). Estoque: estoque-aba.js e estoque-*.js.
 */

let _cpSection = 'compras';  // 'compras' | 'estoque' (definido por goModule)

function renderComprasModule() {
  _cpSection = 'compras';
  renderComprasLayout();
}

function renderComprasLayout() {
  const tabs = document.getElementById('cpTopTabs');
  const modoCompras = _cpSection !== 'estoque';
  if (tabs) { tabs.style.display = modoCompras ? '' : 'none'; if (modoCompras) tabs.innerHTML = cpTabsHtml(); }
  if (modoCompras) { _setPageTitle('Compras'); cpRenderAba(); return; }
  _renderCpEstoque();
}

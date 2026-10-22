/**
 * VTP Compras — Vai Ter Pizza!
 * marketing.js — Módulo Marketing: roteamento das abas e helpers de tela
 * As telas de Relacionamento ficam em crm-clientes.js.
 */

let _mktPaginaAtiva = 'rel-clientes';
window._vtpGetTab_marketing = () => _mktPaginaAtiva;
window._vtpSetTab_marketing = (v) => { _mktPaginaAtiva = v; };

let _mktSbClient = null;
function _mktGetSbClient() {
  if (!_mktSbClient) _mktSbClient = supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY);
  return _mktSbClient;
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
    case 'rel-base':     _crmRenderBase();     break;
    default:             _crmRenderClientes();
  }
}

function _mktBody(html) {
  const el = document.getElementById('mktBody');
  if (el) el.innerHTML = html;
}

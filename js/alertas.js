/**
 * VTP Compras — Vai Ter Pizza!
 * alertas.js — Central de notificações do sistema
 */

let alertas = db._get('vtp_alertas', []);
const saveAlertas = () => db._set('vtp_alertas', alertas);

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — chamada pelos outros módulos ao disparar eventos
// ══════════════════════════════════════════════════════════════

function criarAlerta({ tipo, titulo, mensagem, modulo, destino_roles, referencia_id = null, acao_label = null, acao_modulo = null }) {
  alertas.unshift({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tipo,
    titulo,
    mensagem,
    modulo,
    destino_roles,
    referencia_id,
    acao_label,
    acao_modulo,
    lida: false,
  });
  saveAlertas();
  atualizarBadgeAlertas();
}

function atualizarBadgeAlertas() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;
  const count = alertas.filter(a => !a.lida && a.destino_roles.includes(u.role)).length;
  document.querySelectorAll('#badge-alertas, #badge-alertas-m').forEach(badge => {
    if (count > 0) {
      badge.style.display = '';
      badge.textContent = count > 9 ? '9+' : String(count);
    } else {
      badge.style.display = 'none';
    }
  });
}

// ══════════════════════════════════════════════════════════════
// DROPDOWN DE NOTIFICAÇÕES — atalho rápido a partir do header
// ══════════════════════════════════════════════════════════════

function toggleNotifDropdown(anchorEl) {
  const existing = document.getElementById('notifDropdownPopup');
  if (existing) { existing.remove(); return; }

  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;

  const meus     = alertas.filter(a => a.destino_roles.includes(u.role));
  const recentes = meus.slice(0, 6);

  const rect  = anchorEl?.getBoundingClientRect() || { right: window.innerWidth - 20, bottom: 60 };
  const cardW = 340;
  const left  = Math.min(Math.max(8, rect.right - cardW), window.innerWidth - cardW - 12);
  const top   = rect.bottom + 10;

  const wrap = document.createElement('div');
  wrap.id = 'notifDropdownPopup';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:700';
  wrap.innerHTML = `
    <div style="position:fixed;top:${top}px;left:${left}px;width:${cardW}px;max-height:420px;
      display:flex;flex-direction:column;background:var(--surface);border:1.5px solid var(--border);
      border-radius:var(--radius-xl);box-shadow:0 16px 48px rgba(0,0,0,.16);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:800;font-size:var(--text-sm)">Notificações</div>
      <div style="overflow-y:auto;min-height:0;padding:8px;display:flex;flex-direction:column;gap:6px">
        ${recentes.length === 0
          ? `<div style="padding:24px 12px;text-align:center;color:var(--muted);font-size:var(--text-sm)">Nenhuma notificação</div>`
          : recentes.map(a => `<div style="flex-shrink:0">${_cardAlerta(a)}</div>`).join('')}
      </div>
      <button onclick="document.getElementById('notifDropdownPopup')?.remove();goModule('alertas')"
        style="padding:11px;border:none;border-top:1px solid var(--border);background:var(--bg-subtle);
        color:var(--purple);font-weight:700;font-size:var(--text-xs);cursor:pointer;font-family:Inter,sans-serif">
        Ver todos
      </button>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
}

// ══════════════════════════════════════════════════════════════
// RENDER PRINCIPAL
// ══════════════════════════════════════════════════════════════

function renderAlertas() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;

  const meus      = alertas.filter(a => a.destino_roles.includes(u.role));
  const naoLidos  = meus.filter(a => !a.lida).length;
  const temLidos  = meus.some(a => a.lida);

  const el = document.getElementById('page-alertas');
  if (!el) return;

  el.innerHTML = `
    <div style="padding:20px 24px;max-width:800px">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="font-size:var(--text-base);font-weight:800;margin-bottom:3px;display:flex;align-items:center;gap:8px">
            ${lc('bell', 14, 'var(--purple)')} Alertas
            ${naoLidos > 0 ? `<span style="padding:2px 9px;border-radius:10px;background:var(--purple);color:#fff;font-size:var(--text-2xs);font-weight:700">${naoLidos} novo${naoLidos > 1 ? 's' : ''}</span>` : ''}
          </h3>
          <div style="font-size:var(--text-xs);color:var(--muted)">Notificações de movimentações e eventos do sistema</div>
        </div>
        ${meus.length > 0 ? `
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${naoLidos > 0 ? `<button onclick="marcarTodosLidos()"
            style="display:flex;align-items:center;gap:5px;padding:6px 13px;border-radius:var(--r8);border:1.5px solid var(--border);background:var(--surface);color:var(--text2);font-size:var(--text-sm);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
            ${lc('check-check', 12, 'currentColor')} Marcar todos como lidos
          </button>` : ''}
          ${temLidos ? `<button onclick="limparAlertasLidos()"
            style="display:flex;align-items:center;gap:5px;padding:6px 13px;border-radius:var(--r8);border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:var(--text-sm);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
            ${lc('trash-2', 12, 'currentColor')} Limpar lidos
          </button>` : ''}
        </div>` : ''}
      </div>

      ${meus.length === 0 ? `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:14px">
          <div style="width:64px;height:64px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center">
            ${lc('bell-off', 28, 'var(--muted)')}
          </div>
          <div style="text-align:center">
            <div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">Nenhum alerta</div>
            <div style="font-size:var(--text-sm);color:var(--muted)">Você receberá notificações aqui conforme as movimentações do sistema</div>
          </div>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${meus.map(a => _cardAlerta(a)).join('')}
        </div>
      `}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// CARD DE ALERTA
// ══════════════════════════════════════════════════════════════

const _ALERTA_ICONS = {
  compras:     'shopping-bag',
  estoque:     'package',
  checklist:   'check-square',
  desperdicio: 'trash-2',
  manutencao:  'tool',
  preproducao: 'layers',
  inventario:  'package',
};

const _ALERTA_CORES = {
  compras_pre_aprovacao:    'var(--purple)',
  compras_aprov_final:      'var(--purple)',
  compras_devolvida_revisao:'var(--yellow)',
  compras_devolvida_cotacao:'var(--yellow)',
  compras_aprovada:         'var(--green)',
  compras_oc_confirmada:    'var(--green)',
  compras_recebimento:      'var(--green)',
  estoque_critico:          'var(--red)',
  estoque_baixo:            'var(--yellow)',
  estoque_divergencia:      'var(--orange-dark)',
  checklist_atraso:         'var(--orange-dark)',
  desperdicio_alto:         'var(--orange-dark)',
  manutencao_atrasada:      'var(--red)',
  manutencao_hoje:          'var(--yellow)',
  manutencao_cert_vencendo: 'var(--orange-dark)',
  preproducao_atrasada:     'var(--orange-dark)',
  inventario_item_ruim:     'var(--red)',
  inventario_reposicao:     'var(--orange-dark)',
};

function _cardAlerta(a) {
  const cor    = _ALERTA_CORES[a.tipo] || 'var(--purple)';
  const icon   = _ALERTA_ICONS[a.modulo] || 'bell';
  const bg     = a.lida ? 'var(--surface)' : 'var(--purple-xlight)';
  const border = a.lida ? 'var(--border)'  : cor;
  const ts     = _fmtAlertaTime(a.created_at);

  return `
  <div style="display:flex;border:1.5px solid ${border};border-radius:var(--r10);background:${bg};overflow:hidden">
    <div style="width:4px;background:${cor};flex-shrink:0"></div>
    <div style="flex:1;padding:12px 14px">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${cor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
            ${lc(icon, 14, cor)}
          </div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:${a.lida ? '600' : '800'};color:${a.lida ? 'var(--text2)' : 'var(--text)'}">${a.titulo}</div>
            <div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px;line-height:1.4">${a.mensagem}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="font-size:var(--text-2xs);color:var(--muted);white-space:nowrap">${ts}</span>
          ${!a.lida ? `<div style="width:7px;height:7px;border-radius:50%;background:${cor};flex-shrink:0"></div>` : ''}
        </div>
      </div>

      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end;align-items:center">
        ${a.acao_modulo ? `
        <button onclick="irParaAlerta('${a.id}','${a.acao_modulo}')"
          style="padding:4px 13px;border-radius:var(--r6);border:1.5px solid ${cor};background:transparent;color:${cor};
          font-size:var(--text-xs);font-weight:700;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px">
          ${lc('arrow-right', 10, 'currentColor')} ${a.acao_label || 'Ver'}
        </button>` : ''}
        ${!a.lida ? `
        <button onclick="marcarLido('${a.id}')"
          style="padding:4px 10px;border-radius:var(--r6);border:1px solid var(--border);background:var(--surface);
          color:var(--muted);font-size:var(--text-xs);font-weight:600;cursor:pointer;font-family:Inter,sans-serif">
          Marcar como lido
        </button>` : ''}
        <button onclick="removerAlerta('${a.id}')"
          style="padding:4px 8px;border-radius:var(--r6);border:1px solid var(--border);background:var(--surface);
          color:var(--muted);cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center">
          ${lc('x', 11, 'currentColor')}
        </button>
      </div>

    </div>
  </div>`;
}

function _fmtAlertaTime(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ══════════════════════════════════════════════════════════════
// AÇÕES
// ══════════════════════════════════════════════════════════════

function marcarLido(id) {
  const a = alertas.find(x => x.id === id);
  if (a) { a.lida = true; a.updated_at = new Date().toISOString(); saveAlertas(); }
  atualizarBadgeAlertas();
  renderAlertas();
}

function marcarTodosLidos() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;
  alertas
    .filter(a => !a.lida && a.destino_roles.includes(u.role))
    .forEach(a => { a.lida = true; a.updated_at = new Date().toISOString(); });
  saveAlertas();
  atualizarBadgeAlertas();
  renderAlertas();
}

function limparAlertasLidos() {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!u) return;
  alertas = alertas.filter(a => !a.lida || !a.destino_roles.includes(u.role));
  saveAlertas();
  atualizarBadgeAlertas();
  renderAlertas();
  toast('Alertas lidos removidos');
}

function removerAlerta(id) {
  alertas = alertas.filter(a => a.id !== id);
  saveAlertas();
  atualizarBadgeAlertas();
  renderAlertas();
}

function irParaAlerta(id, modulo) {
  marcarLido(id);
  if (typeof goModule === 'function') goModule(modulo);
}

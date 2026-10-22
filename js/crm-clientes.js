/**
 * VTP Compras — Vai Ter Pizza!
 * crm-clientes.js — Marketing › Relacionamento › Contatos
 * Clientes (lista com filtros e parâmetros RFV) · Base de clientes (análise)
 *
 * Os dados vêm de crm_clientes, espelho do cadastro do Cardápio Web mantido pela
 * Edge Function crm-sync (uma passada por dia). Pedidos, ticket, última compra e
 * RFV são calculados no banco por crm_recalcular() a partir de cw_pedidos.
 */

// Cache da base inteira (~12 mil linhas): a lista e a análise filtram em memória.
const _crmCache = { clientes: null, rfv: null, sync: null, carregadoEm: 0 };

const _CRM_COLUNAS = 'id,nome,email,telefone,data_nascimento,genero,cw_criado_em,pontos,cashback,cashback_expira_em,aceita_whatsapp,ativo,qtd_pedidos,total_gasto,ticket_medio,primeiro_pedido,ultimo_pedido,canal_cadastro,rfv_r,rfv_f,rfv_v,rfv_grupo';

// Grupos RFV na ordem e com os nomes do Cardápio Web.
const _CRM_RFV = {
  campeoes:         { label: 'Campeões',            chip: 'chip-green',  cor: '#2E9E6B' },
  fieis:            { label: 'Fiéis',               chip: 'chip-green',  cor: '#56B98A' },
  em_potencial:     { label: 'Em potencial',        chip: 'chip-purple', cor: '#7FCBA5' },
  novos:            { label: 'Novos',               chip: 'chip-purple', cor: '#A6DCC0' },
  promissores:      { label: 'Promissores',         chip: 'chip-purple', cor: '#BFE6D1' },
  precisam_atencao: { label: 'Precisam de atenção', chip: 'chip-yellow', cor: '#F2D27A' },
  quase_dormentes:  { label: 'Quase dormentes',     chip: 'chip-yellow', cor: '#F6DFA6' },
  em_risco:         { label: 'Em risco',            chip: 'chip-orange', cor: '#F2A7A7' },
  nao_posso_perder: { label: 'Não posso perder',    chip: 'chip-orange', cor: '#F7C7C7' },
  hibernando:       { label: 'Hibernando',          chip: 'chip-red',    cor: '#EE9191' },
  perdidos:         { label: 'Perdidos',            chip: 'chip-red',    cor: '#E06B6B' },
};

const _CRM_CANAL = { catalog: 'Site', store_front_catalog: 'Site', portal: 'Portal', whatsapp_extension: 'Chatbot', ifood: 'iFood', food99: '99Food' };
const _CRM_GENERO = { female: 'Feminino', male: 'Masculino', 'non-binary': 'Não binário', other: 'Outro' };

// ── Carga ────────────────────────────────────────────────────────────────

async function _crmCarregar(force = false) {
  if (_crmCache.clientes && !force && Date.now() - _crmCache.carregadoEm < 5 * 60e3) return _crmCache.clientes;
  const sb = _mktGetSbClient();
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('crm_clientes').select(_CRM_COLUNAS).order('id').range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) break;
  }
  const [{ data: rfv }, { data: sync }] = await Promise.all([
    sb.from('crm_rfv_config').select('*').eq('id', 1).maybeSingle(),
    sb.from('crm_sync_estado').select('chave,dados,atualizado_em').in('chave', ['clientes', 'historico']),
  ]);
  _crmCache.clientes = linhas;
  _crmCache.rfv = rfv;
  _crmCache.sync = Object.fromEntries((sync || []).map(s => [s.chave, s.dados]));
  _crmCache.carregadoEm = Date.now();
  return linhas;
}

// ── Formatação ───────────────────────────────────────────────────────────

function _crmTel(t) {
  if (!t) return '';
  const d = t.replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return '+' + t;
}

// Dias de calendário (ontem à noite = 1 dia, como no Cardápio Web), não blocos de 24 h.
function _crmDias(iso) {
  if (!iso) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(iso); dia.setHours(0, 0, 0, 0);
  return Math.round((hoje - dia) / 864e5);
}

function _crmRelativo(iso) {
  const d = _crmDias(iso);
  if (d === null) return '';
  if (d < 1) return 'hoje';
  if (d === 1) return 'um dia';
  if (d < 30) return `${d} dias`;
  const m = Math.floor(d / 30.4);
  if (m < 12) return m === 1 ? 'um mês' : `${m} meses`;
  const a = Math.floor(m / 12);
  return a === 1 ? 'um ano' : `${a} anos`;
}

function _crmDataRel(iso) {
  if (!iso) return '<span style="color:var(--muted)">—</span>';
  return `${fmtD(iso)} <span style="color:var(--muted)">(${_crmRelativo(iso)})</span>`;
}

function _crmNasc(d) {
  if (!d) return '<span class="chip chip-gray">Não informada</span>';
  const [a, m, dd] = d.split('-');
  return `${dd}/${m}/${a}`;
}

function _crmChipRfv(g) {
  const r = _CRM_RFV[g];
  return r ? `<span class="chip ${r.chip}">${r.label}</span>` : '<span style="color:var(--muted)">—</span>';
}

function _crmNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }

function _crmEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function _crmInfoSync() {
  const c = _crmCache.sync?.clientes;
  const h = _crmCache.sync?.historico;
  const partes = [];
  if (c?.rodando) partes.push(`Importando clientes do Cardápio Web: página ${c.pagina || 1} de ${c.total_paginas || '…'}`);
  else if (c?.concluido_em) partes.push(`Cadastro sincronizado com o Cardápio Web em ${fmtDT(c.concluido_em)}`);
  if (h && !h.concluido && h.janelas) partes.push('Completando o histórico de pedidos dos últimos 12 meses — os números ainda vão mudar');
  return partes.length ? `<div style="font-size:var(--text-xs);color:var(--muted);margin:-8px 0 14px">${partes.join(' · ')}</div>` : '';
}

// ══════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════

const _crmLista = { busca: '', filtros: [], pagina: 1, porPagina: 10, ordem: 'qtd_pedidos', desc: true };

// Propriedades do "+ Filtro" (mesmas do Cardápio Web).
const _CRM_FILTROS = {
  qtd_pedidos:     { label: 'Total de pedidos',        tipo: 'num' },
  total_gasto:     { label: 'Total gasto em pedidos',  tipo: 'num' },
  ticket_medio:    { label: 'Ticket médio',            tipo: 'num' },
  cw_criado_em:    { label: 'Data do cadastro',        tipo: 'data' },
  primeiro_pedido: { label: 'Data do primeiro pedido', tipo: 'data' },
  ultimo_pedido:   { label: 'Data do último pedido',   tipo: 'data' },
  aniversario:     { label: 'Próximo aniversário',     tipo: 'aniv' },
  rfv_grupo:       { label: 'Classificação RFV',       tipo: 'lista', opcoes: () => Object.entries(_CRM_RFV).map(([k, v]) => [k, v.label]) },
  genero:          { label: 'Gênero',                  tipo: 'lista', opcoes: () => [...Object.entries(_CRM_GENERO), ['_null', 'Não informado']] },
  cashback:        { label: 'Valor de cashback',       tipo: 'num' },
  cashback_expira_em: { label: 'Vencimento do cashback', tipo: 'data' },
  canal_cadastro:  { label: 'Canal de cadastro do cliente', tipo: 'lista', opcoes: () => [['catalog', 'Site'], ['ifood', 'iFood'], ['food99', '99Food'], ['portal', 'Portal'], ['whatsapp_extension', 'Chatbot'], ['_null', 'Sem pedido']] },
  email:           { label: 'E-mail do cliente',       tipo: 'tem' },
  bloqueado:       { label: 'Cliente bloqueado',       tipo: 'simnao' },
  aceita_whatsapp: { label: 'Aceita disparos via WhatsApp', tipo: 'simnao' },
};

function _crmDiasAteAniversario(nasc) {
  if (!nasc) return null;
  const [, m, d] = nasc.split('-').map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  let prox = new Date(hoje.getFullYear(), m - 1, d);
  if (prox < hoje) prox = new Date(hoje.getFullYear() + 1, m - 1, d);
  return Math.round((prox - hoje) / 864e5);
}

function _crmPassaFiltro(c, f) {
  switch (f.campo) {
    case 'aniversario': { const d = _crmDiasAteAniversario(c.data_nascimento); return d !== null && d <= f.valor; }
    case 'email':       return f.valor ? !!c.email : !c.email;
    case 'bloqueado':   return f.valor ? !c.ativo : c.ativo;
    case 'aceita_whatsapp': return !!c.aceita_whatsapp === f.valor;
  }
  const def = _CRM_FILTROS[f.campo];
  const v = c[f.campo];
  if (def.tipo === 'lista') return f.valor.includes(v ?? '_null');
  if (def.tipo === 'num') {
    const n = Number(v || 0);
    return (f.min === '' || n >= Number(f.min)) && (f.max === '' || n <= Number(f.max));
  }
  if (def.tipo === 'data') {
    if (!v) return false;
    const dia = String(v).slice(0, 10);
    return (!f.de || dia >= f.de) && (!f.ate || dia <= f.ate);
  }
  return true;
}

function _crmDescreverFiltro(f) {
  const def = _CRM_FILTROS[f.campo];
  if (def.tipo === 'aniv')   return `Aniversário nos próximos ${f.valor} dias`;
  if (def.tipo === 'tem')    return f.valor ? 'Com e-mail' : 'Sem e-mail';
  if (def.tipo === 'simnao') return `${def.label}: ${f.valor ? 'sim' : 'não'}`;
  if (def.tipo === 'lista') {
    const nomes = Object.fromEntries(def.opcoes());
    return `${def.label}: ${f.valor.map(x => nomes[x] || x).join(', ')}`;
  }
  const money = ['total_gasto', 'ticket_medio', 'cashback'].includes(f.campo);
  const v = x => money ? 'R$ ' + fmt(x) : x;
  if (def.tipo === 'num') {
    if (f.min !== '' && f.max !== '') return `${def.label} entre ${v(f.min)} e ${v(f.max)}`;
    return f.min !== '' ? `${def.label} ≥ ${v(f.min)}` : `${def.label} ≤ ${v(f.max)}`;
  }
  if (f.de && f.ate) return `${def.label} de ${fmtD(f.de + 'T12:00')} a ${fmtD(f.ate + 'T12:00')}`;
  return f.de ? `${def.label} desde ${fmtD(f.de + 'T12:00')}` : `${def.label} até ${fmtD(f.ate + 'T12:00')}`;
}

function _crmFiltrados() {
  const busca = _crmLista.busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, '');
  const temBloqueio = _crmLista.filtros.some(f => f.campo === 'bloqueado');
  return (_crmCache.clientes || []).filter(c => {
    if (!temBloqueio && !c.ativo) return false;
    if (busca && !((c.nome || '').toLowerCase().includes(busca) || (digitos.length >= 4 && (c.telefone || '').includes(digitos)))) return false;
    return _crmLista.filtros.every(f => _crmPassaFiltro(c, f));
  });
}

async function _crmRenderClientes() {
  try { await _crmCarregar(); }
  catch (e) { _mktBody(_mktEmpty('Erro ao carregar clientes: ' + e.message)); return; }

  if (!_crmCache.clientes.length) {
    _mktBody(`${_mktHeader('Clientes')}${_crmInfoSync()}${_mktEmpty('A base de clientes ainda está sendo importada do Cardápio Web. Volte em alguns minutos.')}`);
    return;
  }

  _mktBody(`
    ${_mktHeader('Clientes', `
      <button class="btn btn-outline btn-sm" onclick="_crmModalRfv()">${lc('sliders', 12)} Parâmetros RFV</button>
      <button class="btn btn-outline btn-sm" onclick="_crmExportar()">${lc('download', 12)} Exportar</button>`)}
    ${_crmInfoSync()}
    <div class="card" style="padding:12px 14px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div style="position:relative;flex:0 1 280px;min-width:200px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none">${lc('search', 14, 'var(--muted)')}</span>
        <input class="inp" id="crmBusca" placeholder="Pesquise por nome ou telefone" style="padding-left:32px" value="${_crmEsc(_crmLista.busca)}"
          oninput="_crmLista.busca=this.value;_crmLista.pagina=1;_crmDesenharTabela()">
      </div>
      <div style="position:relative">
        <button class="btn btn-outline btn-sm" onclick="_crmMenuFiltro(this)">${lc('plus', 12)} Filtro</button>
      </div>
      <div id="crmChips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
    </div>
    <div id="crmTabela"></div>
  `);
  _crmDesenharTabela();
}

function _crmDesenharTabela() {
  const chips = document.getElementById('crmChips');
  if (chips) chips.innerHTML = _crmLista.filtros.map((f, i) => `
    <span class="chip chip-purple" style="display:inline-flex;align-items:center;gap:6px">
      ${_crmEsc(_crmDescreverFiltro(f))}
      <button onclick="_crmLista.filtros.splice(${i},1);_crmLista.pagina=1;_crmDesenharTabela()" style="background:none;border:none;cursor:pointer;padding:0;line-height:0">${lc('x', 12, 'currentColor')}</button>
    </span>`).join('');

  const lista = _crmFiltrados();
  const { ordem, desc } = _crmLista;
  lista.sort((a, b) => {
    const va = a[ordem] ?? '', vb = b[ordem] ?? '';
    const r = typeof va === 'number' || typeof vb === 'number' ? Number(va || 0) - Number(vb || 0) : String(va).localeCompare(String(vb), 'pt-BR');
    return desc ? -r : r;
  });

  const total = lista.length;
  const paginas = Math.max(1, Math.ceil(total / _crmLista.porPagina));
  _crmLista.pagina = Math.min(_crmLista.pagina, paginas);
  const ini = (_crmLista.pagina - 1) * _crmLista.porPagina;
  const pagina = lista.slice(ini, ini + _crmLista.porPagina);

  const th = (campo, label, cls = '') => {
    const ativo = ordem === campo;
    return `<th class="${cls}" style="cursor:pointer;user-select:none" onclick="_crmOrdenar('${campo}')">${label}${ativo ? ' ' + (desc ? '↓' : '↑') : ''}</th>`;
  };

  const el = document.getElementById('crmTabela');
  if (!el) return;
  el.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead><tr>
          ${th('nome', 'Cliente')}
          ${th('qtd_pedidos', 'Total de pedidos', 'r')}
          ${th('ticket_medio', 'Ticket médio', 'r')}
          ${th('ultimo_pedido', 'Último pedido')}
          ${th('cw_criado_em', 'Cliente desde')}
          ${th('rfv_grupo', 'Classificação RFV')}
          ${th('cashback', 'Total de cashback', 'r')}
          ${th('data_nascimento', 'Data de nascimento')}
        </tr></thead>
        <tbody>
          ${pagina.length ? pagina.map(c => `
            <tr style="cursor:pointer" onclick="_crmAbrirCliente(${c.id})">
              <td style="min-width:200px"><div class="iname">${_crmEsc(c.nome || 'Sem nome')}</div><div class="isub" style="white-space:nowrap">${_crmTel(c.telefone)}</div></td>
              <td class="r">${_crmNum(c.qtd_pedidos)}</td>
              <td class="r" style="white-space:nowrap">R$ ${fmt(c.ticket_medio)}</td>
              <td style="white-space:nowrap">${_crmDataRel(c.ultimo_pedido)}</td>
              <td style="white-space:nowrap">${_crmDataRel(c.cw_criado_em)}</td>
              <td style="white-space:nowrap">${_crmChipRfv(c.rfv_grupo)}</td>
              <td class="r" style="white-space:nowrap">R$ ${fmt(c.cashback)}</td>
              <td style="white-space:nowrap">${_crmNasc(c.data_nascimento)}</td>
            </tr>`).join('')
            : `<tr><td colspan="8" style="padding:28px;text-align:center;color:var(--muted)">Nenhum cliente com esses filtros</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:10px;font-size:var(--text-xs);color:var(--muted);flex-wrap:wrap">
      <span>Registros por página
        <select class="inp" style="width:auto;display:inline-block;padding:3px 6px;margin-left:4px" onchange="_crmLista.porPagina=+this.value;_crmLista.pagina=1;_crmDesenharTabela()">
          ${[10, 25, 50, 100].map(n => `<option ${n === _crmLista.porPagina ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </span>
      <span>${total ? `${ini + 1}–${Math.min(ini + _crmLista.porPagina, total)} de ${_crmNum(total)}` : '0 de 0'}</span>
      <button class="btn btn-ghost btn-sm" ${_crmLista.pagina <= 1 ? 'disabled' : ''} onclick="_crmLista.pagina--;_crmDesenharTabela()">${lc('chevron-left', 14)}</button>
      <button class="btn btn-ghost btn-sm" ${_crmLista.pagina >= paginas ? 'disabled' : ''} onclick="_crmLista.pagina++;_crmDesenharTabela()">${lc('chevron-right', 14)}</button>
    </div>`;
}

function _crmOrdenar(campo) {
  if (_crmLista.ordem === campo) _crmLista.desc = !_crmLista.desc;
  else { _crmLista.ordem = campo; _crmLista.desc = !['nome', 'rfv_grupo'].includes(campo); }
  _crmDesenharTabela();
}

// ── Filtros ──────────────────────────────────────────────────────────────

function _crmMenuFiltro(btn) {
  document.getElementById('crmMenuFiltro')?.remove();
  const menu = document.createElement('div');
  menu.id = 'crmMenuFiltro';
  menu.style.cssText = 'position:absolute;top:100%;left:0;margin-top:4px;z-index:50;background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);box-shadow:var(--shadow-md);padding:6px;min-width:260px;max-height:420px;overflow-y:auto';
  menu.innerHTML = Object.entries(_CRM_FILTROS).map(([k, f]) =>
    `<button class="btn btn-ghost btn-sm" style="display:block;width:100%;text-align:left;padding:8px 10px" onclick="document.getElementById('crmMenuFiltro')?.remove();_crmModalFiltro('${k}')">${f.label}</button>`).join('');
  btn.parentElement.appendChild(menu);
  setTimeout(() => document.addEventListener('click', function fechar(e) {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', fechar); }
  }), 0);
}

function _crmModalFiltro(campo) {
  const def = _CRM_FILTROS[campo];
  let corpo = '';
  if (def.tipo === 'num') {
    corpo = `<div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>No mínimo</label><input class="inp" id="crmFMin" type="number" step="any" min="0"></div>
      <div class="field" style="flex:1"><label>No máximo</label><input class="inp" id="crmFMax" type="number" step="any" min="0"></div></div>`;
  } else if (def.tipo === 'data') {
    corpo = `<div style="display:flex;gap:10px">
      <div class="field" style="flex:1"><label>De</label><input class="inp" id="crmFDe" type="date"></div>
      <div class="field" style="flex:1"><label>Até</label><input class="inp" id="crmFAte" type="date"></div></div>`;
  } else if (def.tipo === 'aniv') {
    corpo = `<div class="field"><label>Faz aniversário nos próximos (dias)</label><input class="inp" id="crmFAniv" type="number" min="0" value="7"></div>`;
  } else if (def.tipo === 'lista') {
    corpo = `<div style="display:flex;flex-direction:column;gap:6px">${def.opcoes().map(([k, l]) =>
      `<label style="display:flex;gap:8px;align-items:center;font-size:var(--text-sm)"><input type="checkbox" class="crmFOpc" value="${k}"> ${l}</label>`).join('')}</div>`;
  } else {
    const [sim, nao] = def.tipo === 'tem' ? ['Tem e-mail', 'Não tem e-mail'] : ['Sim', 'Não'];
    corpo = `<div style="display:flex;gap:16px">
      <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="crmFSN" value="1" checked> ${sim}</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="crmFSN" value="0"> ${nao}</label></div>`;
  }
  _mktModal(def.label, corpo,
    `<button class="btn btn-outline btn-sm" onclick="_mktCloseModal()">Cancelar</button>
     <button class="btn btn-primary btn-sm" onclick="_crmAplicarFiltro('${campo}')">Aplicar</button>`, 420);
}

function _crmAplicarFiltro(campo) {
  const def = _CRM_FILTROS[campo];
  const $ = id => document.getElementById(id);
  let f = { campo };
  if (def.tipo === 'num') {
    f.min = $('crmFMin').value; f.max = $('crmFMax').value;
    if (f.min === '' && f.max === '') { toast('Informe um mínimo ou um máximo', 'err'); return; }
  } else if (def.tipo === 'data') {
    f.de = $('crmFDe').value; f.ate = $('crmFAte').value;
    if (!f.de && !f.ate) { toast('Informe ao menos uma data', 'err'); return; }
  } else if (def.tipo === 'aniv') {
    f.valor = Math.max(0, Number($('crmFAniv').value || 0));
  } else if (def.tipo === 'lista') {
    f.valor = [...document.querySelectorAll('.crmFOpc:checked')].map(x => x.value);
    if (!f.valor.length) { toast('Escolha ao menos uma opção', 'err'); return; }
  } else {
    f.valor = document.querySelector('input[name="crmFSN"]:checked').value === '1';
  }
  _crmLista.filtros = _crmLista.filtros.filter(x => x.campo !== campo).concat(f);
  _crmLista.pagina = 1;
  _mktCloseModal();
  _crmDesenharTabela();
}

function _crmExportar() {
  const lista = _crmFiltrados();
  if (typeof XLSX === 'undefined') { toast('Exportação indisponível (biblioteca não carregou)', 'err'); return; }
  const linhas = lista.map(c => ({
    'Cliente': c.nome, 'Telefone': _crmTel(c.telefone), 'E-mail': c.email || '',
    'Total de pedidos': c.qtd_pedidos, 'Total gasto': Number(c.total_gasto), 'Ticket médio': Number(c.ticket_medio),
    'Primeiro pedido': c.primeiro_pedido ? fmtD(c.primeiro_pedido) : '', 'Último pedido': c.ultimo_pedido ? fmtD(c.ultimo_pedido) : '',
    'Cliente desde': c.cw_criado_em ? fmtD(c.cw_criado_em) : '', 'Classificação RFV': _CRM_RFV[c.rfv_grupo]?.label || '',
    'R': c.rfv_r, 'F': c.rfv_f, 'V': c.rfv_v, 'Cashback': Number(c.cashback),
    'Data de nascimento': c.data_nascimento ? _crmNasc(c.data_nascimento) : '', 'Gênero': _CRM_GENERO[c.genero] || '',
    'Canal de cadastro': _CRM_CANAL[c.canal_cadastro] || '', 'Aceita WhatsApp': c.aceita_whatsapp ? 'Sim' : 'Não',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Clientes');
  XLSX.writeFile(wb, `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ── Ficha do cliente ─────────────────────────────────────────────────────

async function _crmAbrirCliente(id) {
  const c = (_crmCache.clientes || []).find(x => x.id === id);
  if (!c) return;
  const kpi = (v, l) => `<div style="flex:1;min-width:110px;background:var(--bg-subtle);border-radius:var(--radius-md);padding:10px 12px">
    <div style="font-weight:800;font-size:1.05rem">${v}</div><div class="kpi-l">${l}</div></div>`;
  const linha = (l, v) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:var(--text-sm)"><span style="color:var(--muted)">${l}</span><span style="text-align:right">${v}</span></div>`;

  _mktModal(_crmEsc(c.nome || 'Cliente'), `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${_crmChipRfv(c.rfv_grupo)}
      ${c.rfv_r ? `<span class="chip chip-gray">R ${c.rfv_r} · F ${c.rfv_f} · V ${c.rfv_v}</span>` : ''}
      ${c.ativo ? '' : '<span class="chip chip-red">Bloqueado no Cardápio Web</span>'}
      <span style="font-size:var(--text-sm);color:var(--muted)">${_crmTel(c.telefone)}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${kpi(_crmNum(c.qtd_pedidos), 'Pedidos')}
      ${kpi('R$ ' + fmt(c.total_gasto), 'Gasto total')}
      ${kpi('R$ ' + fmt(c.ticket_medio), 'Ticket médio')}
      ${kpi(c.ultimo_pedido ? _crmRelativo(c.ultimo_pedido) : '—', 'Desde o último pedido')}
    </div>
    <div style="font-weight:700;margin-bottom:4px">Cadastro</div>
    ${linha('E-mail', _crmEsc(c.email) || '—')}
    ${linha('Data de nascimento', c.data_nascimento ? _crmNasc(c.data_nascimento) : '—')}
    ${linha('Gênero', _CRM_GENERO[c.genero] || '—')}
    ${linha('Cliente desde', c.cw_criado_em ? fmtD(c.cw_criado_em) : '—')}
    ${linha('Canal do 1º pedido', _CRM_CANAL[c.canal_cadastro] || '—')}
    <div style="font-weight:700;margin:14px 0 4px">Comunicação e fidelidade</div>
    ${linha('Aceita disparos via WhatsApp', c.aceita_whatsapp ? '<span class="chip chip-green">Sim</span>' : '<span class="chip chip-red">Não</span>')}
    ${linha('Cashback', 'R$ ' + fmt(c.cashback) + (c.cashback_expira_em ? ` <span style="color:var(--muted)">(vence ${_crmNasc(c.cashback_expira_em)})</span>` : ''))}
    ${linha('Pontos', _crmNum(c.pontos))}
    <div style="font-weight:700;margin:14px 0 6px">Histórico de pedidos</div>
    <div id="crmHistCliente">${_mktEmpty('Carregando pedidos...')}</div>
  `, '', 640);

  const { data, error } = await _mktGetSbClient().from('cw_pedidos')
    .select('id,display_id,cw_created_at,sales_channel,total,status')
    .eq('customer_id', id).order('cw_created_at', { ascending: false }).limit(50);
  const el = document.getElementById('crmHistCliente');
  if (!el) return;
  if (error) { el.innerHTML = _mktEmpty('Erro ao carregar pedidos: ' + error.message); return; }
  el.innerHTML = data.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Data</th><th>Pedido</th><th>Canal</th><th class="r">Total</th><th>Status</th></tr></thead>
      <tbody>${data.map(p => `<tr>
        <td>${fmtDT(p.cw_created_at)}</td><td>#${p.display_id ?? p.id}</td>
        <td>${_CRM_CANAL[p.sales_channel] || p.sales_channel || '—'}</td>
        <td class="r">R$ ${fmt(p.total)}</td>
        <td>${['canceled', 'canceling'].includes(p.status) ? '<span class="chip chip-red">Cancelado</span>' : '<span class="chip chip-gray">Concluído</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`
    : _mktEmpty('Nenhum pedido deste cliente nos últimos 12 meses');
}

// ── Parâmetros RFV ───────────────────────────────────────────────────────

function _crmModalRfv() {
  const cfg = _crmCache.rfv || { recencia: [10, 20, 30, 40], frequencia: [12, 9, 5, 2], valor: [100, 80, 50, 30] };
  const cores = { 5: 'chip-green', 4: 'chip-green', 3: 'chip-yellow', 2: 'chip-red', 1: 'chip-red' };
  const nota = n => `<span class="chip ${cores[n]}" style="width:26px;justify-content:center;flex-shrink:0">${n}</span>`;
  const inp = (id, v, step = 1) => `<input class="inp" id="${id}" type="number" min="0" step="${step}" value="${v}" style="width:84px;padding:5px 8px" oninput="_crmRfvFaixas()">`;
  const col = (titulo, desc, linhas) => `
    <div style="flex:1;min-width:220px">
      <div style="font-weight:700">${titulo}</div>
      <div style="font-size:var(--text-xs);color:var(--muted);margin:2px 0 12px;min-height:32px">${desc}</div>
      ${linhas.map(([n, html]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:var(--text-xs)">${nota(n)}${html}</div>`).join('')}
    </div>`;

  _mktModal('Editar parâmetros RFV', `
    <div style="font-size:var(--text-sm);color:var(--muted);margin-bottom:16px;line-height:1.5">
      Cada cliente recebe uma nota de 1 a 5 em Recência (dias desde o último pedido), Frequência (quantidade de pedidos)
      e Valor (ticket médio). O grupo sai da matriz Recência × média de Frequência e Valor, com os mesmos 11 grupos do Cardápio Web.
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      ${col('Recência', 'Tempo desde o último pedido do cliente.', [
        [5, `Até ${inp('crmR1', cfg.recencia[0])} dias`],
        [4, `<span id="crmR4t"></span> ${inp('crmR2', cfg.recencia[1])} dias`],
        [3, `<span id="crmR3t"></span> ${inp('crmR3', cfg.recencia[2])} dias`],
        [2, `<span id="crmR2t"></span> ${inp('crmR4', cfg.recencia[3])} dias`],
        [1, `<span id="crmR1t"></span>`],
      ])}
      ${col('Frequência', 'Quantidade de pedidos do cliente.', [
        [5, `A partir de ${inp('crmF1', cfg.frequencia[0])} pedidos`],
        [4, `De ${inp('crmF2', cfg.frequencia[1])} <span id="crmF4t"></span>`],
        [3, `De ${inp('crmF3', cfg.frequencia[2])} <span id="crmF3t"></span>`],
        [2, `De ${inp('crmF4', cfg.frequencia[3])} <span id="crmF2t"></span>`],
        [1, `<span id="crmF1t"></span>`],
      ])}
      ${col('Valor monetário', 'Ticket médio do cliente.', [
        [5, `A partir de R$ ${inp('crmV1', cfg.valor[0], '0.01')}`],
        [4, `De R$ ${inp('crmV2', cfg.valor[1], '0.01')} <span id="crmV4t"></span>`],
        [3, `De R$ ${inp('crmV3', cfg.valor[2], '0.01')} <span id="crmV3t"></span>`],
        [2, `De R$ ${inp('crmV4', cfg.valor[3], '0.01')} <span id="crmV2t"></span>`],
        [1, `<span id="crmV1t"></span>`],
      ])}
    </div>`,
    `<button class="btn btn-outline btn-sm" onclick="_mktCloseModal()">Cancelar</button>
     <button class="btn btn-primary btn-sm" id="crmRfvSalvar" onclick="_crmSalvarRfv()">Salvar e recalcular</button>`, 860);
  _crmRfvFaixas();
}

function _crmRfvValores() {
  const v = id => Number(document.getElementById(id)?.value || 0);
  return {
    recencia:   [v('crmR1'), v('crmR2'), v('crmR3'), v('crmR4')],
    frequencia: [v('crmF1'), v('crmF2'), v('crmF3'), v('crmF4')],
    valor:      [v('crmV1'), v('crmV2'), v('crmV3'), v('crmV4')],
  };
}

// Atualiza os textos derivados ("De 11 a", "a 11 pedidos" …) conforme os limites digitados.
function _crmRfvFaixas() {
  const { recencia: r, frequencia: f, valor: v } = _crmRfvValores();
  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set('crmR4t', `De ${r[0] + 1} a`); set('crmR3t', `De ${r[1] + 1} a`); set('crmR2t', `De ${r[2] + 1} a`);
  set('crmR1t', `Acima de ${r[3]} dias`);
  set('crmF4t', `a ${f[0] - 1} pedidos`); set('crmF3t', `a ${f[1] - 1} pedidos`); set('crmF2t', `a ${f[2] - 1} pedidos`);
  set('crmF1t', `Até ${f[3] - 1} pedido${f[3] - 1 === 1 ? '' : 's'}`);
  set('crmV4t', `a R$ ${fmt(v[0] - 0.01)}`); set('crmV3t', `a R$ ${fmt(v[1] - 0.01)}`); set('crmV2t', `a R$ ${fmt(v[2] - 0.01)}`);
  set('crmV1t', `Ticket médio até R$ ${fmt(v[3] - 0.01)}`);
}

async function _crmSalvarRfv() {
  const cfg = _crmRfvValores();
  const crescente = a => a.every((x, i) => i === 0 || x < a[i - 1]);
  if (!crescente(cfg.frequencia) || !crescente(cfg.valor) || !cfg.recencia.every((x, i) => i === 0 || x > cfg.recencia[i - 1])) {
    toast('As faixas precisam ser sequenciais, sem sobrepor', 'err'); return;
  }
  const btn = document.getElementById('crmRfvSalvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Recalculando...'; }
  const sb = _mktGetSbClient();
  const { error } = await sb.from('crm_rfv_config').update({ ...cfg, atualizado_em: new Date().toISOString() }).eq('id', 1);
  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar e recalcular'; } return; }
  const { error: e2 } = await sb.rpc('crm_recalcular');
  if (e2) toast('Parâmetros salvos, mas o recálculo falhou: ' + e2.message, 'err');
  else toast('Parâmetros salvos e base reclassificada');
  _mktCloseModal();
  await _crmCarregar(true);
  renderMarketing();
}

// ══════════════════════════════════════════════════════════════
// BASE DE CLIENTES (análise)
// ══════════════════════════════════════════════════════════════

let _crmBaseGrupo = '';
const _crmCharts = {};

function _crmChart(id, cfg) {
  if (typeof Chart === 'undefined') return;
  const cv = document.getElementById(id);
  if (!cv) return;
  _crmCharts[id]?.destroy();
  _crmCharts[id] = new Chart(cv, cfg);
}

function _crmCard(titulo, sub, corpo, extraStyle = '') {
  return `<div class="card" style="padding:16px;${extraStyle}">
    <div style="font-weight:700">${titulo}</div>
    ${sub ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${sub}</div>` : ''}
    <div style="margin-top:12px">${corpo}</div></div>`;
}

function _crmKpiGrande(label, valor) {
  return `<div class="card" style="padding:16px;flex:1;min-width:180px">
    <div style="font-size:var(--text-sm);font-weight:600">${label}</div>
    <div style="font-size:1.9rem;font-weight:800;color:var(--green);margin-top:6px">${valor}</div></div>`;
}

function _crmTabelaGrupos(linhas, total) {
  return `<div class="tbl-wrap"><table><thead><tr><th>Grupo de clientes</th><th class="r">Qtd de clientes</th></tr></thead>
    <tbody>${linhas.map(([l, n, cor]) => `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cor};margin-right:8px"></span>${l}</td>
      <td class="r">${_crmNum(n)} <span style="color:var(--muted)">(${total ? (n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0}%)</span></td></tr>`).join('')}</tbody></table></div>`;
}

const _CRM_PALETA = ['#6CB4EE', '#F4A261', '#A78BFA', '#5FD3C4', '#7B83EB', '#F2727F', '#9CA3AF'];

async function _crmRenderBase() {
  try { await _crmCarregar(); }
  catch (e) { _mktBody(_mktEmpty('Erro ao carregar clientes: ' + e.message)); return; }

  const todos = (_crmCache.clientes || []).filter(c => c.ativo);
  if (!todos.length) {
    _mktBody(`${_mktHeader('Base de clientes')}${_crmInfoSync()}${_mktEmpty('A base de clientes ainda está sendo importada do Cardápio Web.')}`);
    return;
  }
  const base = _crmBaseGrupo ? todos.filter(c => c.rfv_grupo === _crmBaseGrupo) : todos;
  const total = base.length;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diasDesde = iso => (hoje - new Date(iso)) / 864e5;

  // Novos clientes (cadastro)
  const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const novosSemana = base.filter(c => c.cw_criado_em && new Date(c.cw_criado_em) >= inicioSemana).length;
  const novosMes = base.filter(c => c.cw_criado_em && new Date(c.cw_criado_em) >= inicioMes).length;
  const meses = Array.from({ length: 6 }, (_, i) => new Date(hoje.getFullYear(), hoje.getMonth() - 6 + i, 1));
  const novosPorMes = meses.map(m => base.filter(c => {
    if (!c.cw_criado_em) return false;
    const d = new Date(c.cw_criado_em);
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  }).length);

  // Recorrência por última compra
  const faixasRec = [
    ['Nunca compraram', c => !c.ultimo_pedido],
    ['Última compra nos últimos 30 dias', c => c.ultimo_pedido && diasDesde(c.ultimo_pedido) <= 30],
    ['Última compra de 30 a 60 dias', c => c.ultimo_pedido && diasDesde(c.ultimo_pedido) > 30 && diasDesde(c.ultimo_pedido) <= 60],
    ['Última compra de 60 a 90 dias', c => c.ultimo_pedido && diasDesde(c.ultimo_pedido) > 60 && diasDesde(c.ultimo_pedido) <= 90],
    ['Última compra de 90 a 180 dias', c => c.ultimo_pedido && diasDesde(c.ultimo_pedido) > 90 && diasDesde(c.ultimo_pedido) <= 180],
    ['Última compra há mais de 180 dias', c => c.ultimo_pedido && diasDesde(c.ultimo_pedido) > 180],
  ].map(([l, fn], i) => [l, base.filter(fn).length, _CRM_PALETA[i]]);

  // Notas R, F, V
  const cfg = _crmCache.rfv || { recencia: [10, 20, 30, 40], frequencia: [12, 9, 5, 2], valor: [100, 80, 50, 30] };
  const contNota = campo => [5, 4, 3, 2, 1].map(n => base.filter(c => c[campo] === n).length);
  const r = cfg.recencia, f = cfg.frequencia, v = cfg.valor;
  const rotR = [`5 (até ${r[0]} dias)`, `4 (${r[0] + 1} a ${r[1]} dias)`, `3 (${r[1] + 1} a ${r[2]} dias)`, `2 (${r[2] + 1} a ${r[3]} dias)`, `1 (+ ${r[3]} dias)`];
  const rotF = [`5 (${f[0]}+ pedidos)`, `4 (${f[1]} a ${f[0] - 1})`, `3 (${f[2]} a ${f[1] - 1})`, `2 (${f[3]} a ${f[2] - 1})`, `1 (até ${f[3] - 1})`];
  const rotV = [`5 (R$ ${v[0]}+)`, `4 (R$ ${v[1]} a ${v[0]})`, `3 (R$ ${v[2]} a ${v[1]})`, `2 (R$ ${v[3]} a ${v[2]})`, `1 (até R$ ${v[3]})`];

  // Contato e consentimento
  const comTel = base.filter(c => c.telefone).length;
  const comEmail = base.filter(c => c.email).length;
  const aceita = base.filter(c => c.aceita_whatsapp).length;
  const bloqueados = (_crmCache.clientes || []).filter(c => !c.ativo && (!_crmBaseGrupo || c.rfv_grupo === _crmBaseGrupo)).length;

  // Canal e gênero
  const contar = (lista, chave) => { const m = new Map(); lista.forEach(c => { const k = chave(c); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const canais = contar(base, c => _CRM_CANAL[c.canal_cadastro] || 'Sem pedido').map(([l, n], i) => [l, n, _CRM_PALETA[i % _CRM_PALETA.length]]);
  const generos = contar(base, c => _CRM_GENERO[c.genero] || 'Não informado').map(([l, n], i) => [l, n, _CRM_PALETA[(i + 3) % _CRM_PALETA.length]]);

  // Aniversários
  const comNasc = base.filter(c => c.data_nascimento);
  const mesAtual = hoje.getMonth() + 1;
  const anivMes = comNasc.filter(c => Number(c.data_nascimento.slice(5, 7)) === mesAtual).length;
  const anivSemana = comNasc.filter(c => _crmDiasAteAniversario(c.data_nascimento) <= 6 - hoje.getDay()).length;
  const anivProxSemana = comNasc.filter(c => { const d = _crmDiasAteAniversario(c.data_nascimento); return d > 6 - hoje.getDay() && d <= 13 - hoje.getDay(); }).length;
  const anivPorMes = Array.from({ length: 12 }, (_, i) => comNasc.filter(c => Number(c.data_nascimento.slice(5, 7)) === i + 1).length);
  const idade = n => { const [a, m, d] = n.split('-').map(Number); let i = hoje.getFullYear() - a; if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) i--; return i; };
  const faixasIdade = [['0-20', 0, 20], ['21-30', 21, 30], ['31-40', 31, 40], ['41-50', 41, 50], ['51-60', 51, 60], ['61-70', 61, 70], ['71+', 71, 200]];
  const porIdade = faixasIdade.map(([, a, b]) => comNasc.filter(c => { const i = idade(c.data_nascimento); return i >= a && i <= b; }).length);

  const grade2 = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-bottom:14px';
  const grade4 = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:14px';
  const canvas = (id, h = 220) => `<div style="position:relative;height:${h}px"><canvas id="${id}"></canvas></div>`;

  _mktBody(`
    ${_mktHeader('Base de clientes', `
      <select class="inp" style="width:auto" onchange="_crmBaseGrupo=this.value;_crmRenderBase()">
        <option value="">Todos os clientes</option>
        ${Object.entries(_CRM_RFV).map(([k, x]) => `<option value="${k}" ${k === _crmBaseGrupo ? 'selected' : ''}>${x.label}</option>`).join('')}
      </select>`)}
    ${_crmInfoSync()}
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      ${_crmKpiGrande('Total de clientes', _crmNum(total))}
      ${_crmKpiGrande('Novos clientes na semana', _crmNum(novosSemana))}
      ${_crmKpiGrande('Novos clientes no mês', _crmNum(novosMes))}
    </div>
    <div style="margin-bottom:14px">${_crmCard('Novos clientes nos últimos 6 meses', 'Clientes que se cadastraram, mesmo sem ter feito pedido', canvas('crmChNovos'))}</div>
    <div style="margin-bottom:14px">${_crmCard('Recorrência dos clientes', 'Clientes agrupados pela data da última compra',
      `<div style="${grade2};margin:0;align-items:center">${canvas('crmChRec', 240)}${_crmTabelaGrupos(faixasRec, total)}</div>`)}</div>
    <div style="margin-bottom:14px">${_crmCard('Classificação RFV', 'Distribuição da base na matriz Recência × média de Frequência e Ticket médio', _crmMatrizRfv(base))}</div>
    <div style="${grade2.replace('300px', '260px')}">
      ${_crmCard('Recência', 'Tempo desde a última compra', canvas('crmChR', 200))}
      ${_crmCard('Frequência', 'Quantidade de pedidos do cliente', canvas('crmChF', 200))}
      ${_crmCard('Ticket médio', 'Ticket médio do cliente', canvas('crmChV', 200))}
    </div>
    <div style="${grade4}">
      ${_crmCard('Telefone cadastrado', '', canvas('crmChTel', 170))}
      ${_crmCard('E-mail cadastrado', '', canvas('crmChEmail', 170))}
      ${_crmCard('Aceita disparo via WhatsApp', '', canvas('crmChWpp', 170))}
      ${_crmCard('Clientes bloqueados', 'Saíram da listagem do Cardápio Web', canvas('crmChBloq', 170))}
    </div>
    <div style="${grade2}">
      ${_crmCard('Canal de cadastro', 'Canal do primeiro pedido do cliente', `${canvas('crmChCanal', 200)}<div style="margin-top:10px">${_crmTabelaGrupos(canais, total)}</div>`)}
      ${_crmCard('Gênero', 'Gênero informado no cadastro', `${canvas('crmChGen', 200)}<div style="margin-top:10px">${_crmTabelaGrupos(generos, total)}</div>`)}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      ${_crmKpiGrande('Aniversariantes do mês', _crmNum(anivMes))}
      ${_crmKpiGrande('Aniversariantes da semana', _crmNum(anivSemana))}
      ${_crmKpiGrande('Aniversariantes da próxima semana', _crmNum(anivProxSemana))}
    </div>
    <div style="margin-bottom:14px">${_crmCard('Aniversariantes por mês', '', canvas('crmChAniv'))}</div>
    <div style="${grade2}">
      ${_crmCard('Faixa etária', 'Clientes com data de nascimento', canvas('crmChIdade'))}
      ${_crmCard('Data de aniversário cadastrada', '', canvas('crmChNasc'))}
    </div>
    <div id="crmTempoEntre" style="margin-bottom:14px">${_crmCard('Tempo entre pedidos', 'Calculado sobre toda a base', _mktEmpty('Calculando...'))}</div>
  `);

  const barras = (id, labels, dados, horizontal = false, cores) => _crmChart(id, {
    type: 'bar',
    data: { labels, datasets: [{ data: dados, backgroundColor: cores || '#86BDEB', borderRadius: 4 }] },
    options: { indexAxis: horizontal ? 'y' : 'x', maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { [horizontal ? 'y' : 'x']: { ticks: { autoSkip: false, font: { size: 11 } }, grid: { display: false } } } },
  });
  const rosca = (id, linhas) => _crmChart(id, {
    type: 'doughnut',
    data: { labels: linhas.map(x => x[0]), datasets: [{ data: linhas.map(x => x[1]), backgroundColor: linhas.map(x => x[2]), borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: '55%', plugins: { legend: { display: false } } },
  });
  const notas = ['#86E3B9', '#B4EDD0', '#FCECB3', '#F8C9C9', '#F4A3A3'];

  barras('crmChNovos', meses.map(m => m.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })), novosPorMes);
  rosca('crmChRec', faixasRec);
  barras('crmChR', rotR, contNota('rfv_r'), true, notas);
  barras('crmChF', rotF, contNota('rfv_f'), true, notas);
  barras('crmChV', rotV, contNota('rfv_v'), true, notas);
  barras('crmChTel', ['Com telefone', 'Sem telefone'], [comTel, total - comTel]);
  barras('crmChEmail', ['Com e-mail', 'Sem e-mail'], [comEmail, total - comEmail]);
  barras('crmChWpp', ['Sim', 'Não'], [aceita, total - aceita]);
  barras('crmChBloq', ['Bloqueados', 'Desbloqueados'], [bloqueados, total]);
  rosca('crmChCanal', canais);
  rosca('crmChGen', generos);
  barras('crmChAniv', ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'], anivPorMes);
  barras('crmChIdade', faixasIdade.map(x => x[0]), porIdade);
  barras('crmChNasc', ['Com data de aniversário', 'Sem data de aniversário'], [comNasc.length, total - comNasc.length]);

  _crmDesenharTempoEntre();
}

// Matriz 5 × 5 (Recência × faixa da média F/V). Células do mesmo grupo se fundem
// visualmente; o rótulo fica na célula de cima à esquerda de cada grupo.
function _crmMatrizRfv(base) {
  const faixasFV = [4.5, 3.5, 2.5, 1.5, 1];  // valor representativo de cada linha (de cima para baixo)
  const grupoDe = (r, fv) => {
    if (r === 1) return fv > 4 ? 'nao_posso_perder' : fv > 2 ? 'em_risco' : 'perdidos';
    if (r === 2) return fv > 2 ? 'em_risco' : fv > 1 ? 'hibernando' : 'perdidos';
    if (r === 3) return fv > 3 ? 'fieis' : fv > 2 ? 'precisam_atencao' : 'quase_dormentes';
    if (r === 4) return fv > 3 ? 'fieis' : fv > 1 ? 'em_potencial' : 'promissores';
    return fv > 4 ? 'campeoes' : fv > 3 ? 'fieis' : fv > 1 ? 'em_potencial' : 'novos';
  };
  const cont = {};
  base.forEach(c => { if (c.rfv_grupo) cont[c.rfv_grupo] = (cont[c.rfv_grupo] || 0) + 1; });
  const total = base.length;
  const rotulado = new Set();
  const celulas = [];
  faixasFV.forEach((fv, li) => {
    for (let r = 1; r <= 5; r++) {
      const g = grupoDe(r, fv);
      const borda = (rr, ll) => {
        if (rr < 1 || rr > 5 || ll < 0 || ll > 4) return '1px solid var(--surface)';
        return grupoDe(rr, faixasFV[ll]) === g ? '0' : '1px solid var(--surface)';
      };
      const rotulo = !rotulado.has(g);
      rotulado.add(g);
      const n = cont[g] || 0;
      celulas.push(`<div style="background:${_CRM_RFV[g].cor};padding:8px 10px;min-height:58px;border-top:${borda(r, li - 1)};border-left:${borda(r - 1, li)};cursor:pointer"
          onclick="_crmLista.filtros=[{campo:'rfv_grupo',valor:['${g}']}];_crmLista.pagina=1;_mktPaginaAtiva='rel-clientes';renderMarketing()" title="Ver ${_CRM_RFV[g].label} na lista">
        ${rotulo ? `<div style="font-weight:700;font-size:var(--text-sm);color:#1f2937">${_CRM_RFV[g].label}</div>
          <div style="font-size:var(--text-xs);color:#374151">${_crmNum(n)} (${total ? (n / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 0}%)</div>` : ''}
      </div>`);
    }
  });
  return `<div style="display:flex;gap:8px">
      <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:var(--text-2xs);color:var(--muted);text-align:center">Frequência e ticket médio (média)</div>
      <div style="flex:1">
        <div style="display:grid;grid-template-columns:repeat(5,1fr);border-radius:var(--radius-md);overflow:hidden">${celulas.join('')}</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);font-size:var(--text-2xs);color:var(--muted);text-align:center;margin-top:4px">${[1, 2, 3, 4, 5].map(x => `<span>${x}</span>`).join('')}</div>
        <div style="text-align:center;font-size:var(--text-2xs);color:var(--muted)">Recência</div>
      </div>
    </div>`;
}

let _crmTempoPagina = 1;
async function _crmDesenharTempoEntre() {
  const el = document.getElementById('crmTempoEntre');
  const { data, error } = await _mktGetSbClient().rpc('crm_tempo_entre_pedidos');
  if (!el) return;
  if (error) { el.innerHTML = _crmCard('Tempo entre pedidos', '', _mktEmpty('Erro ao calcular: ' + error.message)); return; }
  if (!data?.length) { el.innerHTML = _crmCard('Tempo entre pedidos', '', _mktEmpty('Ainda não há clientes com mais de um pedido')); return; }

  const somaPond = data.reduce((s, x) => s + Number(x.media) * Number(x.clientes), 0);
  const qtd = data.reduce((s, x) => s + Number(x.clientes), 0);
  const geral = qtd ? somaPond / qtd : 0;
  const primeiros = data.slice(0, 10);
  const porPag = 10;
  const paginas = Math.ceil(data.length / porPag);
  _crmTempoPagina = Math.min(_crmTempoPagina, paginas);
  const linhas = data.slice((_crmTempoPagina - 1) * porPag, _crmTempoPagina * porPag);

  el.innerHTML = _crmCard('Tempo entre pedidos', 'Tempo entre um pedido e o seguinte, por ciclo de compra', `
    <div style="font-size:1.9rem;font-weight:800">${geral.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</div>
    <div style="font-size:var(--text-xs);color:var(--muted);margin-bottom:10px">Média geral de dias entre pedidos</div>
    <div style="position:relative;height:220px;margin-bottom:14px"><canvas id="crmChTempo"></canvas></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Ciclo</th><th class="r">Média</th><th class="r">Mediana</th><th class="r">Mínimo</th><th class="r">Máximo</th><th class="r">Total de clientes</th></tr></thead>
      <tbody>${linhas.map(x => `<tr><td>${x.ciclo}º - ${x.ciclo + 1}º pedido</td>
        <td class="r">${Number(x.media).toLocaleString('pt-BR')} dias</td><td class="r">${Number(x.mediana).toLocaleString('pt-BR')} dias</td>
        <td class="r">${x.minimo} dias</td><td class="r">${x.maximo} dias</td><td class="r">${_crmNum(x.clientes)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:8px;font-size:var(--text-xs);color:var(--muted)">
      <span>${(_crmTempoPagina - 1) * porPag + 1}–${Math.min(_crmTempoPagina * porPag, data.length)} de ${data.length}</span>
      <button class="btn btn-ghost btn-sm" ${_crmTempoPagina <= 1 ? 'disabled' : ''} onclick="_crmTempoPagina--;_crmDesenharTempoEntre()">${lc('chevron-left', 14)}</button>
      <button class="btn btn-ghost btn-sm" ${_crmTempoPagina >= paginas ? 'disabled' : ''} onclick="_crmTempoPagina++;_crmDesenharTempoEntre()">${lc('chevron-right', 14)}</button>
    </div>`);

  _crmChart('crmChTempo', {
    type: 'line',
    data: {
      labels: primeiros.map(x => `${x.ciclo}º - ${x.ciclo + 1}º`),
      datasets: [
        { label: 'Média de dias entre pedidos', data: primeiros.map(x => Number(x.media)), borderColor: '#6CB4EE', backgroundColor: '#6CB4EE', tension: .35 },
        { label: 'Mediana de dias entre pedidos', data: primeiros.map(x => Number(x.mediana)), borderColor: '#F4A261', backgroundColor: '#F4A261', tension: .35 },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } },
  });
}

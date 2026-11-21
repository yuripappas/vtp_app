/**
 * VTP Compras — Vai Ter Pizza!
 * modules.js — Fornecedores, Usuários
 */

// Pré-produção: js/pre-producao.js (módulo próprio desde 15/11/2026)

// ══════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════

// Helper: descrição resumida das condições comerciais de um fornecedor
function _supCondicoesLabel(s) {
  const pgtos = Array.isArray(s.formasPagamento) ? s.formasPagamento : [];
  const prazo = s.prazoPagamento != null && s.prazoPagamento !== '' ? parseInt(s.prazoPagamento) : null;
  const taxa  = s.taxaEntrega || {};
  const parts = [];
  if (pgtos.length) parts.push(pgtos.map(p => p.toUpperCase()).join(' · '));
  if (prazo === 0) parts.push('À vista');
  else if (prazo > 0) parts.push(`${prazo}d p/ pagar`);
  if (taxa.tipo === 'fixo' && taxa.valor > 0)     parts.push(`Frete R$ ${fmt(taxa.valor)}`);
  else if (taxa.tipo === 'variavel')               parts.push('Frete variável');
  else if (taxa.tipo === 'gratis' || !taxa.tipo)   parts.push('Frete grátis');
  return parts.join(' · ');
}

function renderFornecedores() {
  const el = document.getElementById('supGrid');
  if (!suppliers.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-icon" style="font-size:0">${lc("building-2",13,"var(--muted)")}</div><div style="font-size:var(--text-md);font-weight:700;margin-bottom:4px">Nenhum fornecedor</div><div>Cadastre seu primeiro fornecedor!</div></div>`;
    return;
  }
  el.innerHTML = suppliers.map(s => {
    const si   = items.filter(i => { const ids=i.supIds?.length?i.supIds:(i.supId?[i.supId]:[]); return ids.includes(s.id); });
    const cond = _supCondicoesLabel(s);
    const pgtos = Array.isArray(s.formasPagamento) ? s.formasPagamento : [];
    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r12);padding:16px;cursor:pointer;transition:border-color .15s" onclick="openEditSup(${s.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:var(--text-md);font-weight:700">${s.name}</div>
          ${s.seller ? `<div style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">${lc("user",14,"currentColor")} ${s.seller}</div>` : ''}
        </div>
        <button class="btn btn-outline btn-xs" onclick="event.stopPropagation();openEditSup(${s.id})">${lc("edit-2",13,"currentColor")}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:10px">
        ${s.phone ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("phone",13,"var(--muted)")} ${s.phone}</div>` : ''}
        ${s.email ? `<div style="font-size:var(--text-sm);color:var(--text2)">${lc("mail",14,"currentColor")} ${s.email}</div>` : ''}
        ${s.cats  ? `<div style="font-size:var(--text-xs);color:var(--muted)">${s.cats}</div>` : ''}
      </div>
      ${cond ? `
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
          ${pgtos.map(p => `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--green-light);color:var(--green);border:1px solid var(--green)">${p.toUpperCase()}</span>`).join('')}
          ${s.prazoPagamento != null && s.prazoPagamento !== '' ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--purple-xlight);color:var(--purple);border:1px solid var(--purple-light)">${parseInt(s.prazoPagamento)===0?'À vista':parseInt(s.prazoPagamento)+'d p/ pagar'}</span>` : ''}
          ${(s.taxaEntrega?.tipo==='fixo'&&s.taxaEntrega?.valor>0) ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--yellow-light);color:var(--orange-dark);border:1px solid #FCD34D">Frete R$ ${fmt(s.taxaEntrega.valor)}</span>` : s.taxaEntrega?.tipo==='variavel' ? `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--yellow-light);color:var(--orange-dark);border:1px solid #FCD34D">Frete variável</span>` : `<span style="font-size:var(--text-2xs);font-weight:700;padding:2px 7px;border-radius:20px;background:var(--green-light);color:var(--green);border:1px solid var(--green)">Frete grátis</span>`}
        </div>` : ''}
      ${si.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${si.map(i => `<span class="badge b-purple" style="font-size:var(--text-2xs)">${i.name}</span>`).join('')}</div>`
        : '<div style="font-size:var(--text-xs);color:var(--muted)">Sem insumos vinculados</div>'}
    </div>`;
  }).join('');
}

function toggleTaxaEntrega() {
  const tipo = document.getElementById('sfTaxaEntregaTipo')?.value;
  const fixo = document.getElementById('sfTaxaEntregaFixo');
  const varr = document.getElementById('sfTaxaEntregaVar');
  if (fixo) fixo.style.display = tipo === 'fixo'     ? '' : 'none';
  if (varr) varr.style.display = tipo === 'variavel' ? '' : 'none';
}

function _supLoadPagamento(s) {
  // Formas de pagamento
  ['pix','especie','boleto','cartao','cheque','crediario'].forEach(k => {
    const el = document.getElementById(`sfPgto_${k}`);
    if (el) el.checked = Array.isArray(s?.formasPagamento) && s.formasPagamento.includes(k);
  });
  // Prazo
  const prazoEl = document.getElementById('sfPrazoPagamento');
  if (prazoEl) prazoEl.value = s?.prazoPagamento ?? '';
  // Taxa entrega
  const taxa = s?.taxaEntrega || {};
  const tipoEl = document.getElementById('sfTaxaEntregaTipo');
  if (tipoEl) tipoEl.value = taxa.tipo || 'gratis';
  const valEl = document.getElementById('sfTaxaEntregaValor');
  if (valEl) valEl.value = taxa.valor > 0 ? taxa.valor : '';
  const obsEl = document.getElementById('sfTaxaEntregaObs');
  if (obsEl) obsEl.value = taxa.obs || '';
  toggleTaxaEntrega();
}

// Limpa/popula todos os campos do formulário de fornecedor
function _supResetForm(s) {
  // Campos de texto simples
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  setText('sfName',          s?.name   || '');
  setText('sfSeller',        s?.seller || '');
  setText('sfPhone',         s?.phone  || '');
  setText('sfEmail',         s?.email  || '');
  setText('sfPedidoMin',     s?.pedidoMin     ?? '');
  setText('sfPrazoEntrega',  s?.prazoEntrega  ?? '');
  setText('sfAntecedencia',  s?.antecedencia  ?? '');
  setText('sfHorarioLimite', s?.horarioLimite ?? '');
  setText('sfAviso',         s?.aviso         ?? '');

  // Selects
  const setSelect = (id, val, def) => { const el = document.getElementById(id); if (el) el.value = val || def || ''; };
  setSelect('sfFormaEntrega',  s?.formaEntrega, 'entrega');
  setSelect('sfPedidoMinTipo', s?.pedidoMinTipo, '');
  setSelect('sfConfianca',     s?.confianca, 'backup');

  // Checkboxes de dias da semana
  ['seg','ter','qua','qui','sex','sab'].forEach(d => {
    const el = document.getElementById(`sfDia_${d}`);
    if (el) el.checked = Array.isArray(s?.diasPedido) ? s.diasPedido.includes(d) : false;
  });

  // Checkboxes de categoria da empresa (sfCat_*)
  ['alimentos','suprimentos','bebidas'].forEach(c => {
    const el = document.getElementById(`sfCat_${c}`);
    if (el) el.checked = Array.isArray(s?.catEmpresa) ? s.catEmpresa.includes(c) : false;
  });

  // Condições comerciais (pagamento + taxa entrega)
  _supLoadPagamento(s);
}

function openSupModal() {
  editSupId = null;
  document.getElementById('supModalTitle').textContent = 'Novo Fornecedor';
  document.getElementById('eSupId').value = '';
  document.getElementById('delSupBtn').style.display = 'none';
  document.getElementById('supNotasSection').style.display = 'none';
  const srch = document.getElementById('sfItemSearch'); if(srch) srch.value = '';
  _supResetForm(null);          // limpa todos os campos sem exceção
  renderSupCbx([], true);       // true = reset limpo, sem preservar DOM anterior
  renderCatTags([]);
  document.getElementById('ovSup').classList.add('open');
  setTimeout(() => document.getElementById('sfName').focus(), 80);
}

function openEditSup(id) {
  const s = suppliers.find(x => x.id === id);
  if (!s) return;
  editSupId = id;
  document.getElementById('supModalTitle').innerHTML = `${lc("edit-2",13,"currentColor")} ${s.name}`;
  document.getElementById('eSupId').value = id;
  document.getElementById('delSupBtn').style.display = 'inline-flex';
  const srch = document.getElementById('sfItemSearch'); if(srch) srch.value = '';
  _supResetForm(s);             // popula todos os campos com os dados deste fornecedor
  // Insumos vinculados — passa true para reset limpo
  const vinculados = items.filter(i => { const ids=i.supIds?.length?i.supIds:(i.supId?[i.supId]:[]); return ids.includes(id); }).map(i => i.id);
  renderSupCbx(vinculados, true);
  // Categorias salvas
  const cats = Array.isArray(s.cats) ? s.cats : (s.cats ? s.cats.split(',').map(c => c.trim()).filter(Boolean) : []);
  renderCatTags(cats);
  // Notas/avaliações
  const notasSec = document.getElementById('supNotasSection');
  if (notasSec) notasSec.style.display = (s.notas?.length) ? '' : 'none';
  document.getElementById('ovSup').classList.add('open');
}

function renderSupCbx(linked, resetOrQuery) {
  // resetOrQuery = true → reset limpo (não preserva DOM anterior)
  //              = string → query de busca
  //              = undefined → preserva checkeds existentes (comportamento legado para filterSupItems)
  const isReset = resetOrQuery === true;
  const q       = typeof resetOrQuery === 'string' ? resetOrQuery : undefined;

  // Só preserva estado do DOM quando NÃO for reset explícito
  const existingChecked = isReset
    ? []
    : [...(document.querySelectorAll('#sfItems input:checked') || [])].map(c => parseInt(c.value));
  const allLinked = [...new Set([...linked, ...existingChecked])];

  const query = (q !== undefined ? q : (document.getElementById('sfItemSearch')?.value || '')).toLowerCase().trim();

  const insumos = [...items]
    .filter(i => !i.isProd)
    .filter(i => !query || i.name.toLowerCase().includes(query) || i.cat.toLowerCase().includes(query))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  // Agrupa por categoria
  const byCat = {};
  insumos.forEach(i => { if (!byCat[i.cat]) byCat[i.cat] = []; byCat[i.cat].push(i); });

  const el = document.getElementById('sfItems');
  if (!insumos.length) {
    el.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted);font-size:var(--text-sm)">Nenhum insumo encontrado</div>`;
    return;
  }

  el.innerHTML = Object.entries(byCat).map(([cat, catItems]) => `
    <div style="margin-bottom:8px">
      <div style="font-size:var(--text-2xs);font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:4px 8px 4px 0;margin-bottom:3px">${cat}</div>
      ${catItems.map(i => {
        const isChecked = allLinked.includes(i.id);
        return `<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:var(--r6);cursor:pointer;font-size:var(--text-sm);border:1.5px solid ${isChecked ? 'var(--purple-light)' : 'var(--border)'};background:${isChecked ? 'var(--purple-xlight)' : 'var(--surface)'};margin-bottom:3px;transition:all .1s" onmouseover="this.style.borderColor='var(--purple-light)'" onmouseout="if(!this.querySelector('input').checked)this.style.borderColor='var(--border)'">
          <input type="checkbox" value="${i.id}" ${isChecked ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--purple);flex-shrink:0"
            onchange="this.closest('label').style.borderColor=this.checked?'var(--purple-light)':'var(--border)';this.closest('label').style.background=this.checked?'var(--purple-xlight)':'var(--surface)'">
          <span style="flex:1">${query ? i.name.replace(new RegExp(query,'gi'), m => `<mark style="background:var(--yellow-light);border-radius:2px;padding:0 1px">${m}</mark>`) : i.name}</span>
          ${i.code ? `<span style="font-size:var(--text-2xs);color:var(--muted);font-family:monospace">#${i.code}</span>` : ''}
        </label>`;
      }).join('')}
    </div>`).join('');
}

function filterSupItems() {
  const linked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));
  renderSupCbx(linked);
}


// Categorias pré-definidas para fornecedores
// Categorias de fornecedor derivadas dos itens reais (dinâmico, atualiza com CW)
function _getSupCats() {
  const fromItems = [...new Set((typeof items !== 'undefined' ? items : []).map(i => i.cat).filter(Boolean))].sort();
  // Garante "Outros" sempre ao final
  if (!fromItems.includes('Outros')) fromItems.push('Outros');
  return fromItems;
}

function renderCatTags(selected) {
  const wrap = document.getElementById('sfCatsWrap');
  if (!wrap) return;
  wrap.innerHTML = _getSupCats().map(cat => {
    const active = selected.includes(cat);
    return `<span class="sup-cat-tag${active ? ' active' : ''}" data-cat="${cat}"
      style="padding:3px 10px;border-radius:20px;font-size:var(--text-xs);font-weight:600;cursor:pointer;border:1.5px solid ${active ? 'var(--purple)' : 'var(--border)'};background:${active ? 'var(--purple)' : 'var(--surface)'};color:${active ? '#fff' : 'var(--text2)'};transition:all .15s;user-select:none"
      onclick="toggleCatTag(this)">${cat}</span>`;
  }).join('');
}

function toggleCatTag(el) {
  el.classList.toggle('active');
  const isActive = el.classList.contains('active');
  el.style.background   = isActive ? 'var(--purple)' : 'var(--surface)';
  el.style.borderColor  = isActive ? 'var(--purple)' : 'var(--border)';
  el.style.color        = isActive ? '#fff' : 'var(--text2)';
}

// Badge críticos na sidebar (estoque + pré-produção)
function updatePrepBadge() {
  const prepCrit = items.filter(i => i.isProd && gst(i) === 'crit').length;
  const badge = document.getElementById('prepBadge');
  if (badge) { badge.textContent = prepCrit > 0 ? prepCrit : ''; badge.style.display = prepCrit > 0 ? 'inline-flex' : 'none'; }

  const estCrit = items.filter(i => !i.isProd && gst(i) === 'crit').length;
  const badgeEst = document.getElementById('badge-estoque');
  if (badgeEst) { badgeEst.textContent = estCrit > 0 ? estCrit : ''; badgeEst.style.display = estCrit > 0 ? 'inline-flex' : 'none'; }
}

function saveSup() {
  const name = document.getElementById('sfName').value.trim();
  if (!name) { toast('Informe o nome', 'err'); return; }
  const checked = [...document.querySelectorAll('#sfItems input:checked')].map(c => parseInt(c.value));

  // Proteção: se está editando e havia insumos vinculados mas agora nenhum está marcado → confirma
  if (editSupId && checked.length === 0) {
    const vinculadosAntes = items.filter(i => {
      const ids = i.supIds?.length ? i.supIds : (i.supId ? [i.supId] : []);
      return ids.includes(editSupId);
    });
    if (vinculadosAntes.length > 0) {
      const nomes = vinculadosAntes.slice(0,3).map(i => i.name).join(', ');
      const mais  = vinculadosAntes.length > 3 ? ` e mais ${vinculadosAntes.length - 3}` : '';
      vtpConfirm({
        title: 'Nenhum insumo selecionado',
        message: `Este fornecedor está vinculado a ${vinculadosAntes.length} insumo(s): ${nomes}${mais}.\n\nSalvar assim vai remover todos os vínculos. Tem certeza?`,
        confirmLabel: 'Salvar sem insumos',
        onConfirm: () => _salvarSupConfirmado(checked, name),
      });
      return;
    }
  }
  _salvarSupConfirmado(checked, name);
}

function _salvarSupConfirmado(checked, name) {
  const selectedCats = [...document.querySelectorAll('.sup-cat-tag.active')].map(t => t.dataset.cat);
  // Formas de pagamento (checkboxes múltiplos)
  const formasPagamento = ['pix','especie','boleto','cartao','cheque','crediario']
    .filter(k => document.getElementById(`sfPgto_${k}`)?.checked);
  // Taxa de entrega
  const taxaTipo  = document.getElementById('sfTaxaEntregaTipo')?.value || 'gratis';
  const taxaValor = parseFloat(document.getElementById('sfTaxaEntregaValor')?.value) || 0;
  const taxaObs   = document.getElementById('sfTaxaEntregaObs')?.value.trim() || '';
  const taxaEntrega = { tipo: taxaTipo, valor: taxaValor, obs: taxaObs };

  const data = {
    name,
    seller:          document.getElementById('sfSeller').value.trim(),
    phone:           document.getElementById('sfPhone').value.trim(),
    email:           document.getElementById('sfEmail').value.trim(),
    cats:            selectedCats.join(', '),
    formaEntrega:    document.getElementById('sfFormaEntrega')?.value || 'entrega',
    formasPagamento,
    prazoPagamento:  document.getElementById('sfPrazoPagamento')?.value !== ''
                       ? parseInt(document.getElementById('sfPrazoPagamento')?.value) || 0
                       : null,
    taxaEntrega,
  };
  if (editSupId) {
    const idx = suppliers.findIndex(s => s.id === editSupId);
    if (idx >= 0) suppliers[idx] = { ...suppliers[idx], ...data };
    items.forEach(i => { if(i.supIds) i.supIds=i.supIds.filter(x=>x!==editSupId); if(i.supId===editSupId) i.supId=i.supIds?.[0]??null; });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = editSupId; });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" atualizado!`);
  } else {
    const nid = nextSid++;
    suppliers.push({ id: nid, ...data });
    checked.forEach(iid => { const it = items.find(i => i.id === iid); if (it) it.supId = nid; });
    toast(`${lc("check-circle",14,"var(--green)")} "${name}" cadastrado!`);
  }
  saveS(); saveI();
  closeModal('ovSup');
  renderFornecedores();
  renderDashboard();
}

function deleteSup() {
  const s = suppliers.find(x => x.id === editSupId);
  if (!s) return;
  vtpConfirm({
    title: `Excluir "${s.name}"`,
    message: 'O fornecedor será removido de todos os insumos vinculados.',
    confirmLabel: 'Excluir',
    onConfirm: () => {
      suppliers = suppliers.filter(x => x.id !== editSupId);
      items.forEach(i => { if(i.supIds) i.supIds=i.supIds.filter(x=>x!==editSupId); if(i.supId===editSupId) i.supId=i.supIds?.[0]??null; });
      saveS(); saveI();
      closeModal('ovSup');
      renderFornecedores();
      renderDashboard();
      toast(`${lc("trash-2",14,"currentColor")} "${s.name}" excluído.`);
    }
  });
}

// renderRelatorios() → ver js/relatorios.js


function renderUsuarios() {
  // Usa a versão nas configurações (aba Usuários)
  if (typeof setCfgTab === 'function') { setCfgTab('usuarios'); return; }
}

function openUserModal() {
  if (typeof _cfgAbrirModalUsuario === 'function') _cfgAbrirModalUsuario(null);
}

function openEditUser(id) {
  if (typeof _cfgAbrirModalUsuario === 'function') _cfgAbrirModalUsuario(id);
}

function saveUser()         { /* delegado ao modal unificado */ }
function deleteUser()       { /* delegado ao modal unificado */ }
function renderPermPreview(){ /* substituído pelo modal unificado */ }

// renderOmnichannel() agora vive em js/atendimento.js

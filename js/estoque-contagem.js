/**
 * VTP Compras — Vai Ter Pizza!
 * estoque-contagem.js — Aba Contagem (modelo do Pinch)
 *
 * Dois tipos de contagem (tipo_id):
 *   • 'cmv'    — rodada do ciclo semanal. Só itens das categorias que entram
 *                no CMV. Nome automático: "Ciclo dd/mm/aaaa" (data da contagem).
 *                Uma rodada por ciclo; os cards revisados só entram no saldo
 *                quando o ciclo é fechado ("Fechar ciclo"), que também abre o
 *                próximo ciclo nessa data. A primeira rodada abre o 1º ciclo.
 *   • 'outras' — categorias fora do CMV (limpeza, escritório, descartáveis…).
 *                Não mexe no ciclo: entra no saldo ao concluir a revisão.
 *
 * Cada "Nova contagem" cria um card por local escolhido (kanban):
 *   Pendente → Em andamento (Iniciar) → Em revisão (todos conferidos) →
 *   Concluída (revisão concluída por gerente ou supervisor) → Aplicada.
 *
 * Contar: cada item é contado por embalagem (unidade de compra do cadastro)
 * + avulso e "Conferido". Quem conta vê a última contagem do item, nunca o
 * saldo esperado. O esperado é congelado na hora de aplicar e a diferença
 * vira "Ajuste contagem" nas Movimentações (só registro: tem a data da
 * contagem, o motor de saldo não soma de novo).
 *
 * A ordem de contagem (arrastar) fica salva no cadastro do item, por local
 * (item.ordemContagem[localId]).
 */

let _ctgDados  = null;   // { ciclos, contagens, progresso, cats }
let _ctgFilCat = '';
let _ctgAtual  = null;   // tela aberta: { c, itens, ultimas, q, cat, az, abertos, rasc, grupo, ordemRev, editRev }
let _ctgNova   = null;   // rascunho do modal Nova contagem

const _CTG_COLUNAS = [
  { id: 'pendente',  label: 'Pendentes'     },
  { id: 'andamento', label: 'Em andamento'  },
  { id: 'revisao',   label: 'Em revisão'    },
  { id: 'concluida', label: 'Concluídas'    },
];
const _CTG_ATIVAS = ['pendente', 'andamento', 'revisao', 'concluida'];

const _ctgPodeAprovar = () => {
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return ['gerente', 'supervisor'].includes(u?.role);
};
const _ctgEhCmv = c => c?.tipo_id === 'cmv';
const _ctgDataLonga = iso => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const _ctgDataBr = iso => new Date(iso).toLocaleDateString('pt-BR');
const _ctgTitulo = c => `${c.nome} — ${estLocalLabel(c.local_id)}`;

// ── Dados ─────────────────────────────────────────────────────

async function _ctgCarregar() {
  const sb = _estSb();
  const [ciclos, contagens] = await Promise.all([
    _estSelectTodos(() => sb.from('est_ciclos').select('*').order('inicio', { ascending: false })),
    _estSelectTodos(() => sb.from('est_contagens').select('*').is('excluido_em', null).order('data_ref', { ascending: false })),
  ]);
  const ativas = contagens.filter(c => c.status !== 'cancelada').map(c => c.id);
  const progresso = {}, cats = {};
  for (let i = 0; i < ativas.length; i += 200) {
    const itens = await _estSelectTodos(() => sb.from('est_contagem_itens').select('contagem_id, contado, categoria')
      .in('contagem_id', ativas.slice(i, i + 200)).is('removido_em', null));
    itens.forEach(x => {
      const p = progresso[x.contagem_id] || (progresso[x.contagem_id] = { total: 0, contados: 0 });
      p.total++; if (x.contado !== null) p.contados++;
      (cats[x.contagem_id] || (cats[x.contagem_id] = new Set())).add(x.categoria || 'Outros');
    });
  }
  _ctgDados = { ciclos, contagens, progresso, cats };
  _ctgAtualizarBadge();
  return _ctgDados;
}

// Ciclo aberto que já tem a contagem de abertura aplicada. Um ciclo aberto
// sem nenhuma contagem aplicada (resto do modelo antigo) não conta: é
// reaproveitado quando a primeira rodada for aplicada.
function _ctgCicloAtual() {
  const ab = _ctgDados?.ciclos.find(c => c.status === 'aberto');
  if (!ab) return null;
  const temAbertura = _ctgDados.contagens.some(c => c.status === 'aplicada' && _ctgEhCmv(c) && Math.abs(_estMs(c.data_ref) - _estMs(ab.inicio)) < 1000);
  return temAbertura ? ab : null;
}
const _ctgCicloAbertoBruto = () => _ctgDados?.ciclos.find(c => c.status === 'aberto') || null;

// Rodada de CMV ainda não aplicada do ciclo atual (ou a de abertura, sem ciclo)
function _ctgRodadaCmv() {
  const ciclo = _ctgCicloAtual();
  return (_ctgDados?.contagens || []).filter(c => _ctgEhCmv(c) && _CTG_ATIVAS.includes(c.status) && (c.ciclo_id || null) === (ciclo?.id || null));
}

// Escopo de itens de um tipo de contagem
function _ctgEscopo(tipo, cats) {
  const fora = estCatsForaCMV();
  if (tipo === 'cmv') return i => estItemNoCMV(i, fora);
  const set = new Set(cats || []);
  return i => set.has(i.cat || 'Outros');
}
function _ctgItensDoLocal(escopo, localId) {
  return items.filter(i => i.active !== false && estLocaisDoItem(i).includes(localId) && escopo(i));
}
function _ctgLocaisCom(escopo) {
  return [...estLocaisEstoque().map(l => l.id), EST_SEM_LOCAL].filter(l => _ctgItensDoLocal(escopo, l).length > 0);
}

function _ctgIsoDia(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
// Contagem registrada ao meio-dia do dia escolhido: antes da loja abrir e
// depois das vendas da madrugada do dia anterior.
const _ctgDataRef = dia => new Date(dia + 'T12:00:00').toISOString();
const _ctgNomeCmv = dia => 'Ciclo ' + dia.split('-').reverse().join('/');
function _ctgSegundaPadrao() {
  // Segunda-feira mais próxima: de terça a quinta, a que passou; de sexta a
  // domingo, a que vem (a rodada costuma ser criada na véspera).
  const hoje = new Date(); const dow = hoje.getDay();
  const seg = new Date(hoje); seg.setDate(hoje.getDate() + (dow === 0 ? 1 : dow >= 5 ? 8 - dow : 1 - dow));
  const ciclo = _ctgCicloAtual();
  if (ciclo && _ctgIsoDia(seg) <= _ctgIsoDia(ciclo.inicio)) seg.setDate(seg.getDate() + 7);
  return _ctgIsoDia(seg);
}

function _ctgAtualizarBadge() {
  const n = (_ctgDados?.contagens || []).filter(c => c.status === 'andamento').length;
  const el = document.getElementById('estCtgBadge');
  if (el) { el.textContent = n; el.style.display = n ? '' : 'none'; }
}
function estCtgQtdAndamento() { return (_ctgDados?.contagens || []).filter(c => c.status === 'andamento').length; }

// ── Render da aba ─────────────────────────────────────────────

async function estRenderAbaContagem(forcar = false) {
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  if (!_ctgDados || forcar) {
    if (!_ctgAtual) el.innerHTML = `<div style="padding:60px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:var(--text-md)">
      ${lc('refresh-cw', 16, 'currentColor')} Carregando contagens…</div>`;
    try { await _ctgCarregar(); }
    catch (e) {
      el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:var(--text-md)">Não consegui carregar as contagens: ${_estEsc(e.message)}
        <br><button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="estRenderAbaContagem(true)">Tentar de novo</button></div>`;
      return;
    }
  }
  if (!document.getElementById('estAbaBody') || _estCpAba !== 'contagens') return;
  if (_ctgAtual) _ctgRenderTela();
  else _ctgRenderConteudo();
}

const _ctgPill = (cls, icon, txt) => `<span class="badge ${cls}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:var(--text-xs)">${lc(icon, 11, 'currentColor')} ${txt}</span>`;

function _ctgStatusPill(c) {
  if (c.status === 'pendente')  return _ctgPill('b-gray', 'clock', 'Pendente');
  if (c.status === 'andamento') return _ctgPill('b-yellow', 'play', 'Em andamento');
  if (c.status === 'revisao')   return _ctgPill('b-purple', 'clipboard-list', 'Aguardando revisão');
  if (c.status === 'concluida') return _ctgPill('b-purple', 'check', 'Revisada');
  if (c.status === 'aplicada')  return _ctgPill('b-green', 'check-circle', 'Aplicada');
  return _ctgPill('b-gray', 'x', 'Cancelada');
}

function _ctgRenderConteudo() {
  const el = document.getElementById('estAbaBody');
  if (!el || !_ctgDados) return;
  const tabs = el.previousElementSibling; if (tabs) tabs.style.display = '';
  const ciclo = _ctgCicloAtual();
  const passaFiltro = c => !_ctgFilCat || _ctgDados.cats[c.id]?.has(_ctgFilCat);
  const todas = _ctgDados.contagens.filter(c => c.status !== 'cancelada' && passaFiltro(c));
  // Concluídas: as do ciclo atual (inclui a abertura) — o resto vai pro Histórico
  const desde = ciclo ? _estMs(ciclo.inicio) - 1000 : Date.now() - 7 * 864e5;
  const col = st => todas.filter(c => st === 'concluida'
    ? (c.status === 'concluida' || (c.status === 'aplicada' && _estMs(c.data_ref) >= desde))
    : c.status === st);

  const card = c => {
    let extra = '', botao;
    if (c.status === 'pendente') botao = `<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="estIniciarContagem('${c.id}')">${lc('play', 14, '#fff')} Iniciar</button>`;
    else if (c.status === 'andamento') botao = `<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="estAbrirContagem('${c.id}')">Continuar</button>`;
    else if (c.status === 'revisao') {
      extra = `<div style="font-size:var(--text-sm);color:var(--text2)">Ainda não aplicada ao estoque.</div>`;
      botao = `<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="estAbrirContagem('${c.id}')">Revisar</button>`;
    } else {
      extra = c.status === 'aplicada'
        ? `<div style="font-size:var(--text-sm);color:var(--text2)">Fechado em ${_ctgDataBr(c.aprovado_em || c.data_ref)}</div>`
        : `<div style="font-size:var(--text-sm);color:var(--text2)">Entra no estoque ao fechar o ciclo.</div>`;
      botao = `<button class="btn btn-outline" style="width:100%;justify-content:center" onclick="estAbrirContagem('${c.id}')">Ver detalhes</button>`;
    }
    return `<div style="background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--r12);padding:14px;display:flex;flex-direction:column;gap:10px;align-items:flex-start">
      <div style="display:flex;gap:6px;align-items:flex-start;font-size:var(--text-md);font-weight:700;line-height:1.3;width:100%">
        <span style="flex-shrink:0;margin-top:1px">${lc('map-pin', 15, 'var(--muted)')}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_estEsc(_ctgTitulo(c))}</span>
      </div>
      ${_ctgStatusPill(c)}
      ${extra}
      ${botao}
    </div>`;
  };

  const cats = [...new Set(Object.values(_ctgDados.cats).flatMap(s => [...s]))].sort();

  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <button class="btn btn-primary" onclick="estNovaContagem()">${lc('plus', 14, '#fff')} Nova contagem</button>
      <button class="btn btn-outline" style="color:var(--danger-fg)" onclick="estExcluirRodada()">${lc('trash-2', 14, 'currentColor')} Excluir rodada de contagem</button>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <select class="inp" style="width:auto;max-width:220px;font-size:var(--text-md)" onchange="_ctgFilCat=this.value;_ctgRenderConteudo()">
          <option value="">Todas as categorias</option>
          ${cats.map(c => `<option value="${_estEsc(c)}"${_ctgFilCat === c ? ' selected' : ''}>${_estEsc(c)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" onclick="estHistoricoContagens()">${lc('filter', 14, 'currentColor')} Histórico</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:12px;margin-bottom:18px;overflow-x:auto;padding-bottom:4px">
      ${_CTG_COLUNAS.map(s => {
        const cs = col(s.id);
        return `<div style="min-width:220px">
          <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-md);font-weight:800;margin:0 0 10px 4px">
            ${s.label} <span class="badge b-purple">${cs.length}</span></div>
          <div style="background:var(--surface2);border-radius:var(--r12);padding:10px;display:flex;flex-direction:column;gap:10px;max-height:560px;overflow-y:auto;min-height:150px">
            ${cs.length ? cs.map(card).join('') : `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:var(--text-sm);color:var(--muted);text-align:center;padding:24px 10px">
              ${lc('clipboard-list', 26, 'var(--muted)')} Nada ${s.id === 'revisao' ? 'em revisão' : s.id === 'andamento' ? 'em andamento' : s.id === 'pendente' ? 'pendente' : 'concluído'}</div>`}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card" style="padding:18px 20px;margin-bottom:0">${_ctgPainelCiclo()}</div>`;
}

function _ctgPainelCiclo() {
  const ciclo = _ctgCicloAtual();
  const rodada = _ctgRodadaCmv();
  const locais = _ctgLocaisCom(_ctgEscopo('cmv'));
  const stLocal = l => rodada.find(c => c.local_id === l)?.status || null;
  const prontos = locais.filter(l => stLocal(l) === 'concluida').length;
  const podeFechar = locais.length > 0 && prontos === locais.length && rodada.every(c => c.status === 'concluida');
  const chips = locais.map(l => {
    const st = stLocal(l);
    const cor = st === 'concluida' ? 'var(--success-fg)' : st ? 'var(--purple)' : 'var(--muted)';
    const txt = { concluida: 'revisado', revisao: 'em revisão', andamento: 'contando', pendente: 'pendente' }[st] || 'falta contar';
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;border:1.5px solid var(--border);font-size:var(--text-sm)">
      <span style="width:8px;height:8px;border-radius:50%;background:${cor}"></span>${_estEsc(estLocalLabel(l))}
      <span style="color:${cor};font-size:var(--text-xs)">${txt}</span></span>`;
  }).join('');
  const nomeRodada = rodada[0]?.nome;
  const pode = _ctgPodeAprovar();
  const msg = !rodada.length ? (ciclo ? 'Nenhuma contagem de CMV neste ciclo ainda. Use “Nova contagem” acima para começar.' : 'Use “Nova contagem” acima para criar a contagem de abertura.')
    : podeFechar ? `Todos os locais revisados — pode ${ciclo ? 'fechar o ciclo' : 'abrir o ciclo'}.`
    : `Faltam ${locais.length - prontos} de ${locais.length} locais para ${ciclo ? 'fechar o ciclo' : 'abrir o ciclo'}.`;
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <div style="font-size:var(--text-xl);font-weight:800">${ciclo ? 'Ciclo atual' : 'Nenhum ciclo aberto'}</div>
        <div style="font-size:var(--text-sm);color:var(--text2);margin-top:2px">${ciclo
          ? `Iniciado em ${_ctgDataLonga(ciclo.inicio)}`
          : 'A primeira contagem de CMV, quando aplicada, abre o primeiro ciclo.'}</div>
      </div>
      ${nomeRodada ? `<span class="badge b-purple">${_estEsc(nomeRodada)}</span>` : `<span class="badge b-gray">Sem contagens</span>`}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${chips || '<span style="font-size:var(--text-sm);color:var(--muted)">Nenhum item de CMV com local definido.</span>'}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-size:var(--text-sm);color:${podeFechar ? 'var(--success-fg)' : 'var(--text2)'}">${msg}</div>
      <button class="btn ${podeFechar ? 'btn-primary' : 'btn-outline'}" ${podeFechar && pode ? '' : 'disabled'} onclick="estFecharCiclo()"
        title="${pode ? '' : 'Só gerente ou supervisor fecha o ciclo'}">${ciclo ? 'Fechar ciclo' : 'Abrir ciclo'}</button>
    </div>`;
}

// ── Nova contagem ─────────────────────────────────────────────

function estNovaContagem() {
  if (!_ctgDados) return;
  const fora = estCatsForaCMV();
  const catsFora = [...new Set(items.filter(i => i.active !== false && !estItemNoCMV(i, fora)).map(i => i.cat || 'Outros'))].sort();
  _ctgNova = { tipo: 'cmv', locais: null, cats: new Set(catsFora), catsFora, dia: null, nome: '', obs: '' };
  _estModal('ovCtgNova', 'Nova contagem', `<div id="cnTipos"></div><div id="cnCorpo"></div>`, '_ctgCriar()', 'Criar', 600);
  _ctgNovaRender();
}

function _ctgNovaSet(campo, valor) {
  if (campo === 'tipo') { _ctgNova.tipo = valor; _ctgNova.locais = null; _ctgNova.dia = null; }
  else _ctgNova[campo] = valor;
  _ctgNovaRender();
}

function _ctgNovaToggle(conj, valor) {
  const s = _ctgNova[conj];
  s.has(valor) ? s.delete(valor) : s.add(valor);
  if (conj === 'cats') _ctgNova.locais = null;
  _ctgNovaRender();
}

function _ctgNovaInfo() {
  const n = _ctgNova;
  if (n.tipo === 'cmv') {
    const rodada = _ctgRodadaCmv();
    const jaTem = new Set(rodada.map(c => c.local_id));
    const locais = _ctgLocaisCom(_ctgEscopo('cmv')).filter(l => !jaTem.has(l));
    const dia = rodada.length ? _ctgIsoDia(rodada[0].data_ref) : (n.dia || _ctgSegundaPadrao());
    return { escopo: _ctgEscopo('cmv'), locais, rodada, dia, nome: _ctgNomeCmv(dia) };
  }
  const escopo = _ctgEscopo('outras', [...n.cats]);
  return { escopo, locais: _ctgLocaisCom(escopo), rodada: [], dia: n.dia || _ctgIsoDia(new Date()), nome: n.nome };
}

function _ctgNovaRender() {
  const n = _ctgNova;
  const info = _ctgNovaInfo();
  if (!n.locais) n.locais = new Set(info.locais);
  for (const l of [...n.locais]) if (!info.locais.includes(l)) n.locais.delete(l);
  const opcao = (id, icon, titulo, sub) => {
    const on = n.tipo === id;
    return `<button type="button" onclick="_ctgNovaSet('tipo','${id}')" style="text-align:left;padding:14px;border-radius:var(--r10);cursor:pointer;font-family:inherit;
      border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'}">
      <div style="display:flex;align-items:center;gap:8px;font-size:var(--text-md);font-weight:800;color:${on ? 'var(--purple)' : 'var(--text)'}">${lc(icon, 16, 'currentColor')} ${titulo}</div>
      <div style="font-size:var(--text-xs);color:var(--text2);margin-top:4px;line-height:1.4">${sub}</div></button>`;
  };
  document.getElementById('cnTipos').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px">
    ${opcao('cmv', 'refresh-cw', 'Contagem de CMV', 'Ciclo semanal. Itens das categorias que entram no CMV.')}
    ${opcao('outras', 'package', 'Outras categorias', 'Limpeza, escritório, descartáveis… Só atualiza o estoque.')}
  </div>`;

  const check = (on, onclick, txt, sub = '') => `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:var(--text-md);cursor:pointer;text-transform:none">
    <input type="checkbox" ${on ? 'checked' : ''} onchange="${onclick}" style="accent-color:var(--purple);width:16px;height:16px">
    <span>${txt}</span>${sub ? `<span style="font-size:var(--text-xs);color:var(--muted)">${sub}</span>` : ''}</label>`;
  const blocoLocais = info.locais.length ? `
    <div style="background:var(--surface2);border-radius:var(--r10);padding:12px 14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-md);font-weight:700">${lc('map-pin', 15, 'currentColor')} Locais que receberão card de contagem:</div>
        <button type="button" class="btn btn-ghost btn-xs" onclick="_ctgNova.locais=new Set(${n.locais.size === info.locais.length ? '[]' : JSON.stringify(info.locais).replace(/"/g, '&quot;')});_ctgNovaRender()">${n.locais.size === info.locais.length ? 'Desmarcar todos' : 'Marcar todos'}</button>
      </div>
      ${info.locais.map(l => check(n.locais.has(l), `_ctgNovaToggle('locais','${l}')`, _estEsc(estLocalLabel(l)), `${_ctgItensDoLocal(info.escopo, l).length} itens`)).join('')}
    </div>` : `<div style="padding:12px 14px;border-radius:var(--r10);background:var(--surface2);font-size:var(--text-sm);color:var(--text2);margin-bottom:14px">${
      n.tipo === 'cmv' && info.rodada.length ? 'Todos os locais já têm card nesta rodada.' : 'Nenhum local com itens para contar. Confira os locais no cadastro dos itens.'}</div>`;

  let corpo;
  if (n.tipo === 'cmv') {
    corpo = `
      ${info.rodada.length ? `<div style="padding:10px 14px;border-radius:var(--r10);background:var(--purple-xlight);font-size:var(--text-sm);line-height:1.5;margin-bottom:14px">
        Rodada aberta: <strong>${_estEsc(info.rodada[0].nome)}</strong>. Os cards novos entram nela, com a mesma data.</div>` : ''}
      ${blocoLocais}
      ${_estCampo('Data da contagem *', `<input class="inp" type="date" id="cnDia" value="${info.dia}" ${info.rodada.length ? 'disabled' : ''} onchange="_ctgNovaSet('dia', this.value)">`)}
      <div style="font-size:var(--text-xs);color:var(--muted);margin:-6px 0 12px;line-height:1.5">Os cards serão nomeados “${_estEsc(info.nome)} — local”. Ao fechar o ciclo, ele fecha nesta data e o próximo começa nela.</div>
      ${_estCampo('Observações', `<textarea class="inp" id="cnObs" rows="2" placeholder="Notas sobre esta contagem…" oninput="_ctgNova.obs=this.value">${_estEsc(n.obs)}</textarea>`)}`;
  } else {
    corpo = `
      <div style="background:var(--surface2);border-radius:var(--r10);padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:6px;font-size:var(--text-md);font-weight:700;margin-bottom:4px">${lc('tag', 15, 'currentColor')} Categorias</div>
        ${n.catsFora.length ? n.catsFora.map(c => check(n.cats.has(c), `_ctgNovaToggle('cats','${_estEsc(c).replace(/'/g, "\\'")}')`, _estEsc(c))).join('')
          : '<div style="font-size:var(--text-sm);color:var(--muted)">Nenhuma categoria fora do CMV. Marque em Configurações › Estoque.</div>'}
      </div>
      ${blocoLocais}
      ${_estCampo('Nome da contagem *', `<input class="inp" id="cnNome" placeholder="Ex: Limpeza e escritório" value="${_estEsc(n.nome)}" oninput="_ctgNova.nome=this.value">`)}
      <div style="font-size:var(--text-xs);color:var(--muted);margin:-6px 0 12px">Cada card recebe o nome com o local (ex.: “nome — local”).</div>
      ${_estCampo('Data da contagem *', `<input class="inp" type="date" id="cnDia" value="${info.dia}" onchange="_ctgNova.dia=this.value">`)}
      ${_estCampo('Observações', `<textarea class="inp" id="cnObs" rows="2" placeholder="Notas sobre esta contagem…" oninput="_ctgNova.obs=this.value">${_estEsc(n.obs)}</textarea>`)}`;
  }
  document.getElementById('cnCorpo').innerHTML = corpo;
  const btn = document.getElementById('ovCtgNova-salvar');
  const qtd = n.locais.size;
  if (btn) { btn.textContent = qtd ? `Criar ${qtd} contage${qtd > 1 ? 'ns' : 'm'}` : 'Criar'; btn.disabled = !qtd; }
}

async function _ctgCriar() {
  const n = _ctgNova;
  const info = _ctgNovaInfo();
  const locais = info.locais.filter(l => n.locais.has(l));
  if (!locais.length) return toast('Escolha pelo menos um local', 'err');
  const dia = document.getElementById('cnDia')?.value || info.dia;
  if (!dia) return toast('Informe a data da contagem', 'err');
  const nome = n.tipo === 'cmv' ? _ctgNomeCmv(dia) : (n.nome || '').trim();
  if (!nome) return toast('Informe o nome da contagem', 'err');
  if (n.tipo === 'outras' && !n.cats.size) return toast('Escolha pelo menos uma categoria', 'err');
  const ciclo = _ctgCicloAtual();
  if (n.tipo === 'cmv' && !info.rodada.length && ciclo && dia <= _ctgIsoDia(ciclo.inicio))
    return toast(`A data precisa ser depois do início do ciclo atual (${_ctgDataBr(ciclo.inicio)})`, 'err');

  _estSalvarComBotao('ovCtgNova', async () => {
    const sb = _estSb();
    const user = estUsuario();
    const r0 = info.rodada[0];
    const base = n.tipo === 'cmv'
      ? { tipo_id: 'cmv', nome, data_ref: r0?.data_ref || _ctgDataRef(dia), lote: r0?.lote || crypto.randomUUID(),
          ciclo_id: ciclo?.id || null, fecha_ciclo: !!ciclo, categorias: null }
      : { tipo_id: 'outras', nome, data_ref: _ctgDataRef(dia), lote: crypto.randomUUID(),
          ciclo_id: ciclo?.id || null, fecha_ciclo: false, categorias: [...n.cats] };
    const { data: cards, error } = await sb.from('est_contagens')
      .insert(locais.map(l => ({ ...base, local_id: l, obs: n.obs.trim() || null, criado_por: user }))).select();
    if (error) throw new Error(error.message);
    const linhas = [];
    for (const c of cards) {
      for (const it of _ctgItensDoLocal(info.escopo, c.local_id)) linhas.push(_ctgLinhaItem(c.id, it));
    }
    for (let i = 0; i < linhas.length; i += 500) {
      const { error: e2 } = await sb.from('est_contagem_itens').insert(linhas.slice(i, i + 500));
      if (e2) throw new Error(e2.message);
    }
    toast(`${cards.length} contage${cards.length > 1 ? 'ns criadas' : 'm criada'}`, 'ok');
    _ctgDados = null;
  }).then(() => estRenderAbaContagem(true));
}

const _ctgLinhaItem = (contagemId, it, extra = {}) => ({
  contagem_id: contagemId, item_id: it.id, item_nome: it.name, item_tipo: estTipoItem(it),
  unidade: it.unit || null, categoria: it.cat || null, custo_unit: it.cost || 0, ...extra,
});

// ── Excluir rodada ────────────────────────────────────────────

function estExcluirRodada() {
  if (!_ctgPodeAprovar()) return toast('Só gerente ou supervisor exclui uma rodada', 'err');
  const porLote = {};
  _ctgDados.contagens.filter(c => ['pendente', 'andamento', 'revisao', 'concluida'].includes(c.status))
    .forEach(c => { (porLote[c.lote || c.id] ||= []).push(c); });
  const lotes = Object.entries(porLote);
  if (!lotes.length) return toast('Nenhuma rodada em aberto para excluir', 'info');
  _estModal('ovCtgExcluir', 'Excluir rodada de contagem', `
    <div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:12px;line-height:1.5">Apaga todos os cards da rodada que ainda não foram aplicados ao estoque. Fica registrado no log.</div>
    ${lotes.map(([lote, cs], i) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1.5px solid var(--border);border-radius:var(--r8);margin-bottom:8px;cursor:pointer;text-transform:none">
      <input type="radio" name="ctgLote" value="${lote}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--danger-fg);margin-top:3px">
      <div><div style="font-size:var(--text-md);font-weight:700">${_estEsc(cs[0].nome)}</div>
        <div style="font-size:var(--text-xs);color:var(--muted)">${cs.length} card(s) · ${_ctgDataBr(cs[0].data_ref)} · ${_ctgEhCmv(cs[0]) ? 'CMV' : 'Outras categorias'}</div></div></label>`).join('')}`,
    '_ctgExcluirRodadaConfirmar()', 'Excluir rodada', 520);
  const b = document.getElementById('ovCtgExcluir-salvar'); if (b) b.className = 'btn btn-red';
}

function _ctgExcluirRodadaConfirmar() {
  const lote = document.querySelector('input[name="ctgLote"]:checked')?.value;
  if (!lote) return;
  const cs = _ctgDados.contagens.filter(c => (c.lote || c.id) === lote && c.status !== 'aplicada');
  vtpConfirm({
    title: `Excluir "${cs[0]?.nome}"?`, message: `${cs.length} card(s) serão apagados. Os números já digitados ficam só no log.`,
    confirmLabel: 'Excluir',
    onConfirm: async () => {
      const user = estUsuario();
      const { error } = await _estSb().from('est_contagens').update({ excluido_em: new Date().toISOString(), excluido_por: user, atualizado_por: user }).in('id', cs.map(c => c.id));
      if (error) return toast(error.message, 'err');
      document.getElementById('ovCtgExcluir')?.remove();
      toast('Rodada excluída');
      estRenderAbaContagem(true);
    },
  });
}

// ── Aplicar ao estoque / fechar ciclo ─────────────────────────

// Congela o esperado no momento da contagem, lança os ajustes (registro) e
// marca a contagem como aplicada — a partir daí ela é a base do saldo.
async function _ctgAplicar(cards) {
  const sb = _estSb(), user = estUsuario(), agora = new Date().toISOString();
  const deb = estDebitoAutoMapa();
  const porData = {};
  cards.forEach(c => { (porData[c.data_ref] ||= []).push(c); });
  for (const [dataRef, cs] of Object.entries(porData)) {
    const saldos = await estCalcularSaldos({ ate: dataRef });
    for (const c of cs) {
      const itens = await _estSelectTodos(() => sb.from('est_contagem_itens').select('*').eq('contagem_id', c.id).is('removido_em', null));
      const atualizadas = [], ajustes = [];
      for (const i of itens) {
        const r = saldos.porItem.get(i.item_id);
        const esperado = _estRound(r ? (r.porLocal[c.local_id]?.saldo ?? 0) : 0);
        atualizadas.push({ ...i, esperado, debito_auto: deb.has(i.item_id), atualizado_por: user });
        if (i.contado === null) continue;
        const dif = Number(i.contado) - esperado;
        if (Math.abs(dif) <= 0.0005) continue;
        const item = items.find(x => x.id === i.item_id);
        ajustes.push({
          tipo: 'ajuste_contagem', item_id: i.item_id, item_nome: i.item_nome, item_tipo: i.item_tipo,
          unidade: i.unidade, categoria: i.categoria, qtd: _estRound(Math.abs(dif)), sinal: dif > 0 ? 1 : -1,
          local_origem: dif < 0 ? c.local_id : null, local_destino: dif > 0 ? c.local_id : null,
          custo_unit: i.custo_unit || item?.cost || 0, motivo: _ctgTitulo(c),
          ref_tipo: 'contagem', ref_id: c.id, data_mov: c.data_ref, criado_por: user,
        });
      }
      for (let k = 0; k < atualizadas.length; k += 300) {
        const { error } = await sb.from('est_contagem_itens').upsert(atualizadas.slice(k, k + 300));
        if (error) throw new Error(error.message);
      }
      if (ajustes.length) await estInserirMovs(ajustes); // ponte: item.qty passa a refletir o contado
      const upd = { status: 'aplicada', atualizado_por: user };
      if (!c.aprovado_por) { upd.aprovado_por = user; upd.aprovado_em = agora; }
      const { error } = await sb.from('est_contagens').update(upd).eq('id', c.id);
      if (error) throw new Error(error.message);
    }
  }
  estInvalidarSaldos();
}

function estFecharCiclo() {
  if (!_ctgPodeAprovar()) return toast('Só gerente ou supervisor fecha o ciclo', 'err');
  const ciclo = _ctgCicloAtual();
  const rodada = _ctgRodadaCmv();
  if (!rodada.length || rodada.some(c => c.status !== 'concluida')) return toast('Conclua a revisão de todos os locais antes', 'err');
  const dataRef = rodada[0].data_ref;
  vtpConfirm({
    title: ciclo ? 'Fechar o ciclo?' : 'Abrir o primeiro ciclo?',
    message: ciclo
      ? `As contagens de ${rodada.length} local(is) entram no estoque. O ciclo de ${_ctgDataBr(ciclo.inicio)} fecha em ${_ctgDataBr(dataRef)} e o próximo começa nesta data.`
      : `As contagens de ${rodada.length} local(is) entram no estoque e o primeiro ciclo começa em ${_ctgDataBr(dataRef)}.`,
    confirmLabel: ciclo ? 'Fechar ciclo' : 'Abrir ciclo', danger: false,
    onConfirm: async () => {
      try {
        toast('Aplicando as contagens…', 'info');
        await _ctgAplicar(rodada);
        const sb = _estSb(), user = estUsuario();
        if (ciclo) {
          let r = await sb.from('est_ciclos').update({ status: 'fechado', fim: dataRef, fechado_por: user, atualizado_por: user }).eq('id', ciclo.id);
          if (r.error) throw new Error(r.error.message);
          r = await sb.from('est_ciclos').insert({ inicio: dataRef, criado_por: user });
          if (r.error) throw new Error(r.error.message);
        } else {
          const velho = _ctgCicloAbertoBruto();
          const r = velho
            ? await sb.from('est_ciclos').update({ inicio: dataRef, atualizado_por: user }).eq('id', velho.id)
            : await sb.from('est_ciclos').insert({ inicio: dataRef, criado_por: user });
          if (r.error) throw new Error(r.error.message);
        }
        toast(ciclo ? 'Ciclo fechado. O próximo já está aberto.' : 'Primeiro ciclo aberto.', 'ok');
        if (typeof _cmvCache !== 'undefined') _cmvCache = {};
        estRenderAbaContagem(true);
      } catch (e) { toast('Não consegui fechar o ciclo: ' + e.message, 'err'); estRenderAbaContagem(true); }
    },
  });
}

// ══════════════════════════════════════════════════════════════
// TELA DA CONTAGEM (contar → revisão → detalhes)
// ══════════════════════════════════════════════════════════════

async function estIniciarContagem(id) {
  const c = _ctgDados?.contagens.find(x => x.id === id);
  if (!c) return;
  const user = estUsuario();
  const { error } = await _estSb().from('est_contagens').update({ status: 'andamento', iniciado_por: user, atualizado_por: user }).eq('id', id);
  if (error) return toast('Não consegui iniciar: ' + error.message, 'err');
  c.status = 'andamento'; c.iniciado_por = user;
  _ctgAtualizarBadge();
  estAbrirContagem(id);
}

async function estAbrirContagem(id) {
  const c = _ctgDados?.contagens.find(x => x.id === id);
  if (!c) return;
  const sb = _estSb();
  const { data: itens, error } = await sb.from('est_contagem_itens').select('*').eq('contagem_id', id).is('removido_em', null);
  if (error) return toast('Não consegui abrir a contagem: ' + error.message, 'err');
  // Última contagem aplicada de cada item neste local
  const ultimas = new Map();
  const ids = itens.map(i => i.item_id);
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await _estSelectTodos(() => sb.from('est_contagem_itens')
      .select('item_id, contado, pacotes, contagem:est_contagens!inner(id, local_id, data_ref, status, excluido_em)')
      .eq('contagem.local_id', c.local_id).eq('contagem.status', 'aplicada').is('contagem.excluido_em', null)
      .is('removido_em', null).not('contado', 'is', null).in('item_id', ids.slice(i, i + 200)));
    rows.filter(r => r.contagem.id !== id).forEach(r => {
      const a = ultimas.get(r.item_id);
      if (!a || _estMs(r.contagem.data_ref) > _estMs(a.data)) ultimas.set(r.item_id, { contado: Number(r.contado), pacotes: r.pacotes, data: r.contagem.data_ref });
    });
  }
  _ctgAtual = { c, itens, ultimas, q: '', cat: '', az: false, abertos: new Set(), rasc: {}, grupo: 'todos', ordemRev: 'seq', editRev: null };
  if (c.status === 'andamento' || c.status === 'pendente') {
    const prox = _ctgOrdenados().find(i => i.contado === null);
    if (prox) _ctgAtual.abertos.add(prox.id);
  }
  window.scrollTo(0, 0);
  _ctgRenderTela();
}

function _ctgVoltar() {
  _ctgAtual = null;
  _renderCpEstoque(); // recria as abas do topo
  estRenderAbaContagem(true);
}

function _ctgRenderTela() {
  if (!_ctgAtual) return;
  const el = document.getElementById('estAbaBody');
  if (!el) return;
  const tabs = el.previousElementSibling; if (tabs) tabs.style.display = 'none';
  const st = _ctgAtual.c.status;
  if (st === 'pendente' || st === 'andamento') _ctgRenderContar(el);
  else if (st === 'revisao') _ctgRenderRevisao(el);
  else _ctgRenderDetalhe(el);
}

// ── Ordem e embalagens ──

const _ctgItem = row => items.find(i => i.id === row.item_id);
const _ctgUn = row => row.unidade || _ctgItem(row)?.unit || 'un';
const _ctgOrdemDe = row => _ctgItem(row)?.ordemContagem?.[_ctgAtual.c.local_id];
function _ctgOrdenados(az = false) {
  const lista = [..._ctgAtual.itens];
  if (az) return lista.sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  return lista.sort((a, b) => {
    const oa = _ctgOrdemDe(a), ob = _ctgOrdemDe(b);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    if (oa != null && ob == null) return -1;
    if (oa == null && ob != null) return 1;
    return (a.categoria || '').localeCompare(b.categoria || '') || a.item_nome.localeCompare(b.item_nome);
  });
}

// Embalagem de compra do cadastro (ex.: CX com 12 kg). Sem embalagem → só avulso.
function _ctgEmb(row) {
  const it = _ctgItem(row);
  const fator = Number(row.pacotes?.fator) || (it?.unidCompra && Number(it.qtdEmb) > 1 ? Number(it.qtdEmb) : 0);
  const nome = row.pacotes?.embNome || it?.unidCompra || 'Embalagem';
  return fator > 1 ? { fator, nome } : null;
}
function _ctgRasc(row) {
  const r = _ctgAtual.rasc;
  if (!r[row.id]) {
    const p = row.pacotes || {};
    r[row.id] = row.contado === null ? { emb: '', avulso: '' }
      : { emb: p.emb ?? '', avulso: p.avulso ?? (p.emb == null ? Number(row.contado) : '') };
  }
  return r[row.id];
}
const _ctgNum = v => (v === '' || v == null) ? null : Number(String(v).replace(',', '.'));
function _ctgTotalRasc(row) {
  const r = _ctgRasc(row), e = _ctgEmb(row);
  const emb = _ctgNum(r.emb), av = _ctgNum(r.avulso);
  if (emb === null && av === null) return null;
  return _estRound((e ? (emb || 0) * e.fator : 0) + (av || 0));
}
function _ctgDescPacotes(p, contado, unid, row) {
  const e = row ? _ctgEmb(row) : null;
  const partes = [];
  if (p && p.emb) partes.push(`${_estQ(p.emb)}× ${_estEsc(p.embNome || e?.nome || 'Emb.')} (${_estQ(p.fator)} ${_estEsc(unid)})`);
  if (p && p.avulso) partes.push(`${_estQ(p.avulso)}× Avulso`);
  if (!partes.length) partes.push(`${_estQ(contado)}× Avulso`);
  return `${partes.join(' + ')} · ${_estQ(contado)} ${_estEsc(unid || '')}`;
}

// ── Contar ──

function _ctgRenderContar(el) {
  const A = _ctgAtual, c = A.c;
  const conferidos = A.itens.filter(i => i.contado !== null).length, total = A.itens.length;
  const pronto = total > 0 && conferidos === total;
  const q = A.q.trim().toLowerCase();
  const lista = _ctgOrdenados(A.az).filter(i => (!q || i.item_nome.toLowerCase().includes(q)) && (!A.cat || (i.categoria || 'Outros') === A.cat));
  const cats = [...new Set(A.itens.map(i => i.categoria || 'Outros'))].sort();
  const pct = total ? Math.round(conferidos / total * 100) : 0;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn btn-ghost" onclick="_ctgVoltar()">${lc('arrow-left', 16, 'currentColor')} Voltar</button>
      <button class="btn btn-primary" ${pronto ? '' : 'disabled'} onclick="_ctgEnviarRevisao()">${lc('check-circle', 15, '#fff')} Enviar para revisão${pronto ? '' : ` (${conferidos}/${total})`}</button>
    </div>
    ${_ctgCabecalho(c, conferidos, total, pct, `<div style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--text2);margin-top:12px">${lc('grip-vertical', 14, 'currentColor')} Arraste os itens para reordenar a sequência de contagem</div>`)}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:18px 0 12px">
      <div class="field" style="flex:1;min-width:200px;margin:0"><label style="text-transform:none">Buscar</label>
        <input class="inp" id="ctgBusca" placeholder="Buscar produto…" value="${_estEsc(A.q)}" oninput="_ctgAtual.q=this.value;clearTimeout(window._ctgQT);window._ctgQT=setTimeout(()=>{_ctgRenderTela();const b=document.getElementById('ctgBusca');if(b){b.focus();b.setSelectionRange(b.value.length,b.value.length)}},200)"></div>
      <div class="field" style="margin:0"><label style="text-transform:none">Categoria</label>
        <select class="inp" style="width:auto" onchange="_ctgAtual.cat=this.value;_ctgRenderTela()">
          <option value="">Todas as categorias</option>${cats.map(x => `<option value="${_estEsc(x)}"${A.cat === x ? ' selected' : ''}>${_estEsc(x)}</option>`).join('')}</select></div>
      <button class="btn ${A.az ? 'btn-primary' : 'btn-outline'}" onclick="_ctgAtual.az=!_ctgAtual.az;_ctgRenderTela()">${lc('arrow-down-a-z', 15, 'currentColor')} Ordenar A-Z</button>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-outline" onclick="estAdicionarProdutoContagem()">${lc('plus', 14, 'currentColor')} Adicionar produto</button>
    </div>
    <div id="ctgLista" style="display:flex;flex-direction:column;gap:10px">
      ${lista.map(r => _ctgLinhaContar(r, !A.az)).join('') || `<div style="padding:30px;text-align:center;color:var(--muted)">Nenhum item</div>`}
    </div>`;
}

function _ctgCabecalho(c, conferidos, total, pct, extra = '') {
  const stLabel = { pendente: _ctgPill('b-gray', 'clock', 'Pendente'), andamento: _ctgPill('b-yellow', 'play', 'Em andamento'),
    revisao: _ctgPill('b-purple', 'clipboard-list', 'Em revisão'), concluida: _ctgPill('b-purple', 'check', 'Revisada'),
    aplicada: _ctgPill('b-green', 'check-circle', 'Aplicada') }[c.status] || '';
  return `<div class="card" style="padding:22px 24px;margin:0">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><div style="font-size:var(--text-2xl);font-weight:800;line-height:1.2">${_estEsc(_ctgTitulo(c))}</div>
        <div style="font-size:var(--text-md);color:var(--text2);margin-top:2px">${_estEsc(estLocalLabel(c.local_id))} · ${_ctgDataBr(c.data_ref)}${_ctgEhCmv(c) ? '' : ' · Outras categorias'}</div></div>
      ${stLabel}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:var(--text-md);margin:18px 0 8px"><span>Progresso</span><span style="font-weight:700">${conferidos} de ${total} conferidos</span></div>
    <div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct === 100 ? 'var(--success-fg)' : 'var(--purple)'}"></div></div>
    ${extra}
  </div>`;
}

function _ctgLinhaContar(r, arrastavel) {
  const A = _ctgAtual;
  const aberto = A.abertos.has(r.id);
  const conf = r.contado !== null;
  const u = _estEsc(_ctgUn(r));
  const ult = A.ultimas.get(r.item_id);
  const e = _ctgEmb(r);
  const rasc = _ctgRasc(r);
  const tot = _ctgTotalRasc(r);
  const linhaQtd = (campo, rotulo, fator) => `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0">
      <div style="flex:1;min-width:140px;font-size:var(--text-md)">${rotulo}</div>
      <button class="btn btn-outline btn-sm" style="width:38px;height:38px;padding:0;justify-content:center;border-radius:50%" onclick="_ctgPasso('${r.id}','${campo}',-1)">${lc('minus', 14, 'currentColor')}</button>
      <input class="inp" id="ctgIn-${r.id}-${campo}" type="number" inputmode="decimal" min="0" step="any" value="${rasc[campo]}" placeholder="—"
        style="width:130px;text-align:right;font-size:var(--text-lg);font-weight:700" oninput="_ctgDigitar('${r.id}','${campo}',this.value)"
        onkeydown="if(event.key==='Enter')_ctgConferir('${r.id}')">
      <button class="btn btn-outline btn-sm" style="width:38px;height:38px;padding:0;justify-content:center;border-radius:50%" onclick="_ctgPasso('${r.id}','${campo}',1)">${lc('plus', 14, 'currentColor')}</button>
      <div id="ctgEq-${r.id}-${campo}" style="width:110px;text-align:right;font-size:var(--text-sm);color:var(--text2)">${_ctgNum(rasc[campo]) !== null ? `= ${_estQ(_ctgNum(rasc[campo]) * fator)} ${u}` : ''}</div>
    </div>`;
  return `<div data-row="${r.id}" ${arrastavel ? `draggable="true" ondragstart="_ctgDragIni(event,'${r.id}')" ondragover="_ctgDragSobre(event)" ondrop="_ctgDragSoltar(event,'${r.id}')" ondragend="this.style.opacity=''"` : ''}
      style="border:1.5px solid ${conf ? 'var(--success-fg)' : 'var(--card-border)'};border-radius:var(--r12);background:${conf ? 'var(--success-bg)' : 'var(--card-bg)'};overflow:hidden">
    <div onclick="_ctgAlternar('${r.id}')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer">
      ${arrastavel ? `<span style="cursor:grab;line-height:0" title="Arraste para reordenar" onclick="event.stopPropagation()">${lc('grip-vertical', 18, 'var(--muted)')}</span>` : ''}
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:var(--text-md);font-weight:700">${_estEsc(r.item_nome)}</span>
        <span class="badge b-gray">${_estEsc(r.categoria || 'Outros')}</span>
        ${conf ? _ctgPill('b-green', 'check', 'Conferido') : ''}
        ${r.adicionado ? `<span class="badge b-purple">Adicionado</span>` : ''}
      </div>
      <span style="font-size:var(--text-md);white-space:nowrap">${conf ? `<strong>${_estQ(r.contado)}</strong> <span style="color:var(--muted)">${u}</span>` : `<em style="color:var(--muted)">não contado</em>`}</span>
      ${lc(aberto ? 'chevron-up' : 'chevron-down', 16, 'var(--muted)')}
    </div>
    ${aberto ? `<div style="border-top:1px solid var(--border);padding:12px 16px;background:var(--card-bg)">
      ${ult ? `<div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:6px"><strong>Última contagem:</strong> ${_ctgDescPacotes(ult.pacotes, ult.contado, _ctgUn(r), r)} <span style="color:var(--muted)">(${_ctgDataBr(ult.data)})</span></div>` : ''}
      ${e ? linhaQtd('emb', `${_estEsc(e.nome)} (${_estQ(e.fator)} ${u})`, e.fator) : ''}
      ${linhaQtd('avulso', `Avulso (${u})`, 1)}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px">
        <div style="font-size:var(--text-sm);color:var(--text2)"><span id="ctgTot-${r.id}">${tot !== null ? `<strong>Total: ${_estQ(tot)} ${u}</strong>` : 'Digite a quantidade (0 se não houver) para conferir'}</span></div>
        <button class="btn btn-primary btn-sm" onclick="_ctgConferir('${r.id}')">${lc('check', 13, '#fff')} ${conf ? 'Atualizar' : 'Conferir'}</button>
      </div>
    </div>` : ''}
  </div>`;
}

function _ctgAlternar(rowId) {
  const s = _ctgAtual.abertos;
  s.has(rowId) ? s.delete(rowId) : s.add(rowId);
  _ctgRenderTela();
}

function _ctgDigitar(rowId, campo, valor) {
  const row = _ctgAtual.itens.find(i => i.id === rowId);
  _ctgRasc(row)[campo] = valor;
  _ctgAtualizarTotais(row);
}
function _ctgPasso(rowId, campo, delta) {
  const row = _ctgAtual.itens.find(i => i.id === rowId);
  const r = _ctgRasc(row);
  r[campo] = String(Math.max(0, (_ctgNum(r[campo]) || 0) + delta));
  const inp = document.getElementById(`ctgIn-${rowId}-${campo}`); if (inp) inp.value = r[campo];
  _ctgAtualizarTotais(row);
}
function _ctgAtualizarTotais(row) {
  const r = _ctgRasc(row), e = _ctgEmb(row), u = _estEsc(_ctgUn(row));
  for (const [campo, fator] of [['emb', e?.fator || 0], ['avulso', 1]]) {
    const eq = document.getElementById(`ctgEq-${row.id}-${campo}`);
    const v = _ctgNum(r[campo]);
    if (eq) eq.textContent = v !== null ? `= ${_estQ(v * fator)} ${_ctgUn(row)}` : '';
  }
  const tot = _ctgTotalRasc(row);
  const t = document.getElementById(`ctgTot-${row.id}`);
  if (t) t.innerHTML = tot !== null ? `<strong>Total: ${_estQ(tot)} ${u}</strong>` : 'Digite a quantidade (0 se não houver) para conferir';
}

async function _ctgSalvarContado(row) {
  const r = _ctgRasc(row), e = _ctgEmb(row);
  const emb = _ctgNum(r.emb), av = _ctgNum(r.avulso);
  if (emb === null && av === null) { toast('Digite a quantidade (0 se não houver)', 'err'); return false; }
  if ((emb !== null && (isNaN(emb) || emb < 0)) || (av !== null && (isNaN(av) || av < 0))) { toast('Quantidade inválida', 'err'); return false; }
  const total = _ctgTotalRasc(row);
  const pacotes = { emb: e ? emb : null, avulso: av, fator: e?.fator || null, embNome: e?.nome || null };
  const { error } = await _estSb().from('est_contagem_itens').update({ contado: total, pacotes, atualizado_por: estUsuario() }).eq('id', row.id);
  if (error) { toast('Não salvou: ' + error.message, 'err'); return false; }
  row.contado = total; row.pacotes = pacotes;
  const p = _ctgDados?.progresso[_ctgAtual.c.id];
  if (p) p.contados = _ctgAtual.itens.filter(i => i.contado !== null).length;
  return true;
}

async function _ctgConferir(rowId) {
  const A = _ctgAtual;
  const row = A.itens.find(i => i.id === rowId);
  if (!row || !(await _ctgSalvarContado(row))) return;
  if (A.c.status === 'pendente') {
    const user = estUsuario();
    const { error } = await _estSb().from('est_contagens').update({ status: 'andamento', iniciado_por: user, atualizado_por: user }).eq('id', A.c.id);
    if (!error) { A.c.status = 'andamento'; A.c.iniciado_por = user; }
  }
  // Fecha este e abre o próximo não conferido (na ordem visível)
  A.abertos.delete(rowId);
  const lista = _ctgOrdenados(A.az);
  const idx = lista.findIndex(i => i.id === rowId);
  const prox = [...lista.slice(idx + 1), ...lista.slice(0, idx)].find(i => i.contado === null);
  if (prox) A.abertos.add(prox.id);
  _ctgRenderTela();
  if (prox) setTimeout(() => {
    const b = document.querySelector(`[data-row="${prox.id}"]`);
    b?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.getElementById(`ctgIn-${prox.id}-${_ctgEmb(prox) ? 'emb' : 'avulso'}`)?.focus({ preventScroll: true });
  }, 50);
}

// Arrastar: a nova sequência vale para o local e fica no cadastro do item
function _ctgDragIni(ev, rowId) { ev.dataTransfer.setData('text/plain', rowId); ev.dataTransfer.effectAllowed = 'move'; ev.currentTarget.style.opacity = '.4'; }
function _ctgDragSobre(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
function _ctgDragSoltar(ev, alvoId) {
  ev.preventDefault();
  const origemId = ev.dataTransfer.getData('text/plain');
  if (!origemId || origemId === alvoId) return;
  const seq = _ctgOrdenados(false);
  const de = seq.findIndex(i => i.id === origemId);
  const [mov] = seq.splice(de, 1);
  const para = seq.findIndex(i => i.id === alvoId);
  const rect = ev.currentTarget.getBoundingClientRect();
  seq.splice(ev.clientY > rect.top + rect.height / 2 ? para + 1 : para, 0, mov);
  const local = _ctgAtual.c.local_id;
  seq.forEach((r, n) => {
    const it = _ctgItem(r);
    if (it) it.ordemContagem = { ...(it.ordemContagem || {}), [local]: n };
  });
  if (typeof saveI === 'function') saveI();
  _ctgRenderTela();
}

async function _ctgEnviarRevisao() {
  const A = _ctgAtual;
  if (A.itens.some(i => i.contado === null)) return toast('Confira todos os itens antes (0 se não houver)', 'err');
  const { error } = await _estSb().from('est_contagens').update({ status: 'revisao', atualizado_por: estUsuario() }).eq('id', A.c.id);
  if (error) return toast('Não consegui enviar: ' + error.message, 'err');
  A.c.status = 'revisao';
  _ctgAtualizarBadge();
  toast('Enviada para revisão', 'ok');
  _ctgVoltar();
}

// ── Adicionar produto ──

function estAdicionarProdutoContagem() {
  _estModal('ovCtgAdd', 'Adicionar produto à contagem', `
    <div style="font-size:var(--text-sm);color:var(--text2);line-height:1.5;margin:-6px 0 12px">Use para incluir um produto que apareceu no local inesperadamente, ou um processado (molho, recheio etc.) armazenado aqui.</div>
    <input class="inp" id="ctgAddBusca" placeholder="Buscar produto…" oninput="_ctgAddLista()" style="margin-bottom:10px">
    <div id="ctgAddLista"></div>`, `document.getElementById('ovCtgAdd').remove()`, 'Fechar', 560);
  const cancelar = document.querySelector('#ovCtgAdd .btn-outline'); if (cancelar) cancelar.style.display = 'none';
  _ctgAddLista();
  setTimeout(() => document.getElementById('ctgAddBusca')?.focus(), 50);
}

function _ctgAddLista() {
  const el = document.getElementById('ctgAddLista');
  if (!el || !_ctgAtual) return;
  const c = _ctgAtual.c;
  const escopo = _ctgEscopo(c.tipo_id, c.categorias);
  const q = (document.getElementById('ctgAddBusca')?.value || '').trim().toLowerCase();
  const naContagem = new Set(_ctgAtual.itens.map(i => i.item_id));
  const lista = items.filter(i => i.active !== false && escopo(i) && (!q || i.name.toLowerCase().includes(q)))
    .sort((a, b) => (naContagem.has(b.id) - naContagem.has(a.id)) || a.name.localeCompare(b.name)).slice(0, 60);
  el.innerHTML = lista.map(i => {
    const tem = naContagem.has(i.id);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0"><div style="font-size:var(--text-md);font-weight:600">${_estEsc(i.name)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:3px"><span class="badge ${i.isProd ? 'b-purple' : 'b-gray'}">${i.isProd ? 'Processado' : 'Insumo'}</span>
          <span style="font-size:var(--text-xs);color:var(--muted)">${_estEsc(i.cat || 'Outros')}</span></div></div>
      ${tem ? `<button class="btn btn-red btn-sm" onclick="_ctgAddAlternar(${i.id}, false)">${lc('minus', 13, '#fff')} Remover</button>`
            : `<button class="btn btn-primary btn-sm" onclick="_ctgAddAlternar(${i.id}, true)">${lc('plus', 13, '#fff')} Adicionar</button>`}
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--muted)">Nenhum produto encontrado</div>';
}

async function _ctgAddAlternar(itemId, adicionar) {
  const A = _ctgAtual, sb = _estSb(), user = estUsuario();
  const it = items.find(i => i.id === itemId);
  if (!it) return;
  if (adicionar) {
    // Pode já existir uma linha removida antes (UNIQUE contagem+item)
    const { data: velha } = await sb.from('est_contagem_itens').select('*').eq('contagem_id', A.c.id).eq('item_id', itemId).maybeSingle();
    const r = velha
      ? await sb.from('est_contagem_itens').update({ removido_em: null, removido_por: null, atualizado_por: user }).eq('id', velha.id).select().single()
      : await sb.from('est_contagem_itens').insert(_ctgLinhaItem(A.c.id, it, { adicionado: true })).select().single();
    if (r.error) return toast('Não consegui adicionar: ' + r.error.message, 'err');
    A.itens.push(r.data);
    A.abertos.add(r.data.id);
  } else {
    const row = A.itens.find(i => i.item_id === itemId);
    if (!row) return;
    const { error } = await sb.from('est_contagem_itens').update({ removido_em: new Date().toISOString(), removido_por: user, atualizado_por: user }).eq('id', row.id);
    if (error) return toast('Não consegui remover: ' + error.message, 'err');
    A.itens = A.itens.filter(i => i.id !== row.id);
  }
  const p = _ctgDados?.progresso[A.c.id];
  if (p) { p.total = A.itens.length; p.contados = A.itens.filter(i => i.contado !== null).length; }
  _ctgAddLista();
  _ctgRenderTela();
}

// ── Revisão ──

function _ctgRenderRevisao(el) {
  const A = _ctgAtual, c = A.c;
  const cmv = _ctgEhCmv(c);
  const naoConf = A.itens.filter(i => i.contado === null).length;
  const totalQtd = A.itens.reduce((s, i) => s + (Number(i.contado) || 0), 0);
  const kpi = (t, v) => `<div style="border:1.5px solid var(--border);border-radius:var(--r10);padding:12px 16px">
    <div style="font-size:var(--text-sm);color:var(--text2)">${t}</div><div style="font-size:var(--text-2xl);font-weight:800;margin-top:2px">${v}</div></div>`;
  const chip = (on, onclick, txt) => `<button onclick="${onclick}" style="padding:8px 16px;border-radius:99px;font-size:var(--text-sm);font-weight:600;font-family:inherit;cursor:pointer;
    border:1.5px solid ${on ? 'var(--purple)' : 'var(--border)'};background:${on ? 'var(--purple-xlight)' : 'var(--card-bg)'};color:${on ? 'var(--purple)' : 'var(--text2)'}">${txt}</button>`;
  const ordenados = _ctgOrdenados(A.ordemRev === 'az');
  const linha = r => {
    const ed = A.editRev === r.id;
    const e = _ctgEmb(r), rasc = _ctgRasc(r), u = _estEsc(_ctgUn(r));
    const campo = (k, rot) => `<label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);text-transform:none">${rot}
      <input class="inp" id="ctgIn-${r.id}-${k}" type="number" inputmode="decimal" min="0" step="any" value="${rasc[k]}" style="width:110px;text-align:right" oninput="_ctgDigitar('${r.id}','${k}',this.value)"></label>`;
    return `<tr onclick="_ctgAtual.editRev=${ed ? 'null' : `'${r.id}'`};_ctgRenderTela()" style="border-top:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:12px 14px;font-weight:600">${_estEsc(r.item_nome)}${r.adicionado ? ' <span class="badge b-purple">Adicionado</span>' : ''}</td>
        <td style="padding:12px 14px;color:var(--text2);font-size:var(--text-sm)">${_estEsc(r.categoria || 'Outros')}</td>
        <td style="padding:12px 14px;text-align:right;font-weight:700">${r.contado !== null ? _estQ(r.contado) : '—'}</td>
        <td style="padding:12px 14px;color:var(--text2)">${u}</td>
        <td style="padding:12px 14px;text-align:center">${r.contado !== null ? lc('check-circle', 18, 'var(--success-fg)') : lc('clock', 18, 'var(--muted)')}</td>
      </tr>
      ${ed ? `<tr><td colspan="5" style="padding:12px 14px;background:var(--surface2)">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap" onclick="event.stopPropagation()">
          ${e ? campo('emb', `${_estEsc(e.nome)} (${_estQ(e.fator)} ${u})`) : ''}${campo('avulso', `Avulso (${u})`)}
          <span id="ctgTot-${r.id}" style="font-size:var(--text-sm)"></span>
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="_ctgCorrigirRevisao('${r.id}')">${lc('check', 13, '#fff')} Salvar</button>
        </div></td></tr>` : ''}`;
  };
  const tabela = rows => `<table style="width:100%;border-collapse:collapse;font-size:var(--text-md)">
    <thead><tr style="color:var(--text2);font-size:var(--text-sm)">
      <th style="text-align:left;padding:10px 14px;font-weight:600">Produto</th><th style="text-align:left;padding:10px 14px;font-weight:600">Categoria</th>
      <th style="text-align:right;padding:10px 14px;font-weight:600">Contado</th><th style="text-align:left;padding:10px 14px;font-weight:600">Unidade</th>
      <th style="text-align:center;padding:10px 14px;font-weight:600">Conferido</th></tr></thead>
    <tbody>${rows.map(linha).join('')}</tbody></table>`;
  let corpo;
  if (A.grupo === 'cat') {
    const porCat = {};
    ordenados.forEach(r => { (porCat[r.categoria || 'Outros'] ||= []).push(r); });
    corpo = Object.keys(porCat).sort().map(k => `<div style="font-size:var(--text-sm);font-weight:800;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;padding:14px 14px 2px">${_estEsc(k)}</div>${tabela(porCat[k])}`).join('');
  } else corpo = tabela(ordenados);
  const pode = _ctgPodeAprovar();
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <button class="btn btn-ghost" onclick="_ctgVoltar()">${lc('arrow-left', 16, 'currentColor')} Voltar</button>
      <span class="badge b-purple" style="padding:6px 14px;font-size:var(--text-sm)">Em revisão · ${_estEsc(estLocalLabel(c.local_id))}</span>
    </div>
    <div class="card" style="padding:22px 24px;margin:0 0 18px">
      <div style="font-size:var(--text-2xl);font-weight:800;line-height:1.2">${_estEsc(_ctgTitulo(c))}</div>
      <div style="font-size:var(--text-md);color:var(--text2);margin-top:4px;line-height:1.5">Clique em um item para corrigir a quantidade pelas apresentações. As correções são salvas na hora e ${cmv ? 'só entram no estoque quando o ciclo for fechado' : 'entram no estoque quando a revisão for concluída'}.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px">
        ${kpi('Itens', A.itens.length)}${kpi('Contados', A.itens.length - naoConf)}${kpi('Não conferidos', naoConf)}${kpi('Quantidade total', _estQ(totalQtd))}
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div><div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:6px">Agrupar</div>
        <div style="display:flex;gap:6px">${chip(A.grupo === 'cat', `_ctgAtual.grupo='cat';_ctgRenderTela()`, 'Por categoria')}${chip(A.grupo !== 'cat', `_ctgAtual.grupo='todos';_ctgRenderTela()`, 'Todos os itens')}</div></div>
      <div><div style="font-size:var(--text-sm);color:var(--text2);margin-bottom:6px">Ordenar</div>
        <div style="display:flex;gap:6px">${chip(A.ordemRev !== 'az', `_ctgAtual.ordemRev='seq';_ctgRenderTela()`, 'Sequência de contagem')}${chip(A.ordemRev === 'az', `_ctgAtual.ordemRev='az';_ctgRenderTela()`, 'A-Z')}</div></div>
    </div>
    <div class="card" style="padding:6px 8px;margin:0 0 14px;overflow-x:auto">${corpo}</div>
    <div class="card" style="padding:14px 18px;margin:0;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
      <button class="btn btn-outline" onclick="_ctgVoltarEdicao()">${lc('rotate-ccw', 14, 'currentColor')} Voltar para edição</button>
      <button class="btn btn-primary" ${pode && !naoConf ? '' : 'disabled'} title="${pode ? '' : 'Só gerente ou supervisor conclui a revisão'}" onclick="_ctgConcluirRevisao()">${lc('check-circle', 14, '#fff')} Concluir revisão</button>
    </div>`;
  if (A.editRev) { const row = A.itens.find(i => i.id === A.editRev); if (row) _ctgAtualizarTotais(row); }
}

async function _ctgCorrigirRevisao(rowId) {
  const row = _ctgAtual.itens.find(i => i.id === rowId);
  if (!row || !(await _ctgSalvarContado(row))) return;
  _ctgAtual.editRev = null;
  toast('Quantidade corrigida', 'ok');
  _ctgRenderTela();
}

async function _ctgVoltarEdicao() {
  const { error } = await _estSb().from('est_contagens').update({ status: 'andamento', atualizado_por: estUsuario() }).eq('id', _ctgAtual.c.id);
  if (error) return toast(error.message, 'err');
  _ctgAtual.c.status = 'andamento';
  _ctgAtualizarBadge();
  _ctgRenderTela();
}

async function _ctgConcluirRevisao() {
  if (!_ctgPodeAprovar()) return toast('Só gerente ou supervisor conclui a revisão', 'err');
  const c = _ctgAtual.c, user = estUsuario();
  try {
    if (_ctgEhCmv(c)) {
      const { error } = await _estSb().from('est_contagens').update({ status: 'concluida', aprovado_por: user, aprovado_em: new Date().toISOString(), atualizado_por: user }).eq('id', c.id);
      if (error) throw new Error(error.message);
      toast('Revisão concluída — entra no estoque quando o ciclo for fechado', 'ok');
    } else {
      toast('Aplicando ao estoque…', 'info');
      await _ctgAplicar([c]);
      toast('Revisão concluída — estoque atualizado', 'ok');
    }
    _ctgVoltar();
  } catch (e) { toast('Não consegui concluir: ' + e.message, 'err'); }
}

// ── Detalhes (concluída / aplicada) ──

function _ctgRenderDetalhe(el) {
  const A = _ctgAtual, c = A.c;
  const q = A.q.trim().toLowerCase();
  const lista = _ctgOrdenados(false).filter(i => (!q || i.item_nome.toLowerCase().includes(q)) && (!A.cat || (i.categoria || 'Outros') === A.cat));
  const cats = [...new Set(A.itens.map(i => i.categoria || 'Outros'))].sort();
  const conf = A.itens.filter(i => i.contado !== null).length;
  el.innerHTML = `
    <div style="margin-bottom:16px"><button class="btn btn-ghost" onclick="_ctgVoltar()">${lc('arrow-left', 16, 'currentColor')} Voltar</button></div>
    ${_ctgCabecalho(c, conf, A.itens.length, A.itens.length ? Math.round(conf / A.itens.length * 100) : 0,
      `<div style="font-size:var(--text-sm);color:var(--text2);margin-top:12px">${c.status === 'aplicada'
        ? `Aplicada ao estoque em ${_ctgDataBr(c.aprovado_em || c.data_ref)}${c.aprovado_por ? ' · ' + _estEsc(c.aprovado_por) : ''}`
        : `Revisada${c.aprovado_por ? ' por ' + _estEsc(c.aprovado_por) : ''} — entra no estoque quando o ciclo for fechado`}</div>`)}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:18px 0 12px">
      <div class="field" style="flex:1;min-width:200px;margin:0"><label style="text-transform:none">Buscar</label>
        <input class="inp" id="ctgBusca" placeholder="Buscar produto…" value="${_estEsc(A.q)}" oninput="_ctgAtual.q=this.value;clearTimeout(window._ctgQT);window._ctgQT=setTimeout(()=>{_ctgRenderTela();const b=document.getElementById('ctgBusca');if(b){b.focus();b.setSelectionRange(b.value.length,b.value.length)}},200)"></div>
      <div class="field" style="margin:0"><label style="text-transform:none">Categoria</label>
        <select class="inp" style="width:auto" onchange="_ctgAtual.cat=this.value;_ctgRenderTela()">
          <option value="">Todas as categorias</option>${cats.map(x => `<option value="${_estEsc(x)}"${A.cat === x ? ' selected' : ''}>${_estEsc(x)}</option>`).join('')}</select></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${lista.map(r => {
        const aberto = A.abertos.has(r.id);
        return `<div style="border:1.5px solid var(--success-fg);border-radius:var(--r12);background:var(--success-bg);overflow:hidden">
          <div onclick="_ctgAlternar('${r.id}')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer">
            <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:var(--text-md);font-weight:700">${_estEsc(r.item_nome)}</span>
              <span class="badge b-gray">${_estEsc(r.categoria || 'Outros')}</span>
              ${r.contado !== null ? _ctgPill('b-green', 'check', 'Conferido') : ''}
            </div>
            <span style="white-space:nowrap"><strong>${r.contado !== null ? _estQ(r.contado) : '—'}</strong> <span style="color:var(--muted)">${_estEsc(_ctgUn(r))}</span></span>
            ${lc(aberto ? 'chevron-up' : 'chevron-down', 16, 'var(--muted)')}
          </div>
          ${aberto ? `<div style="border-top:1px solid var(--border);padding:12px 16px;background:var(--card-bg);font-size:var(--text-sm);color:var(--text2)">
            ${r.contado !== null ? `<strong>Contado:</strong> ${_ctgDescPacotes(r.pacotes, r.contado, _ctgUn(r), r)}` : 'Não contado'}
            ${c.status === 'aplicada' && r.esperado !== null ? `<div style="margin-top:4px">Saldo no sistema na hora da contagem: ${_estQ(r.esperado)} ${_estEsc(_ctgUn(r))}</div>` : ''}
          </div>` : ''}
        </div>`;
      }).join('') || `<div style="padding:30px;text-align:center;color:var(--muted)">Nenhum item</div>`}
    </div>`;
}

// ── Histórico ──

function estHistoricoContagens() {
  _estModal('ovCtgHist', 'Histórico de contagens', `
    <div style="font-size:var(--text-sm);color:var(--text2);margin:-8px 0 12px">Visualize e compare contagens anteriores</div>
    <input class="inp" id="ctgHistBusca" placeholder="Buscar contagem…" oninput="_ctgHistLista()" style="margin-bottom:12px">
    <div id="ctgHistLista"></div>`, `document.getElementById('ovCtgHist').remove()`, 'Fechar', 640);
  const cancelar = document.querySelector('#ovCtgHist .btn-outline'); if (cancelar) cancelar.style.display = 'none';
  _ctgHistLista();
}

function _ctgHistLista() {
  const el = document.getElementById('ctgHistLista');
  if (!el) return;
  const q = (document.getElementById('ctgHistBusca')?.value || '').trim().toLowerCase();
  const lista = (_ctgDados?.contagens || []).filter(c => c.status === 'aplicada' || c.status === 'concluida')
    .filter(c => !q || _ctgTitulo(c).toLowerCase().includes(q))
    .sort((a, b) => _estMs(b.aprovado_em || b.data_ref) - _estMs(a.aprovado_em || a.data_ref));
  el.innerHTML = lista.map(c => {
    const quando = new Date(c.aprovado_em || c.data_ref);
    return `<div onclick="document.getElementById('ovCtgHist').remove();estAbrirContagem('${c.id}')" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border:1.5px solid var(--border);border-radius:var(--r10);margin-bottom:10px;cursor:pointer"
        onmouseover="this.style.borderColor='var(--purple)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:var(--text-md);font-weight:700">${_estEsc(_ctgTitulo(c))}</span>
          <span class="badge b-purple">${_estEsc(estLocalLabel(c.local_id))}</span></div>
        <div style="font-size:var(--text-sm);color:var(--text2);margin-top:3px">${c.status === 'aplicada' ? 'Concluída' : 'Revisada'} em ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      ${lc('arrow-right', 18, 'var(--muted)')}
    </div>`;
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--muted)">Nenhuma contagem concluída ainda.</div>';
}

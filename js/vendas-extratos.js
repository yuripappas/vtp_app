// ══════════════════════════════════════════════════════════════
// EXTRATOS OFICIAIS DAS PLATAFORMAS (iFood, 99Food)
// Lê a planilha que o portal de cada canal fornece e guarda por ciclo
// (semana seg–dom) em vd_repasses.extrato:
//   { periodos: { 'ini|fim': { fonte, ini, fim, pagamento, total, arquivo, arquivo_path,
//       importado_em, importado_por, linhas: [{ g, d, v, n, info }], pedidos: { 'nº@dia': { v, ts, cancelado } } } } }
// g = grupo do extrato (VX_GRUPOS). info = linha que não mexe no repasse
// (ex.: promoção da loja, que o iFood já desconta do valor pago pelo cliente).
// O arquivo do iFood é mensal e é apurado por semana (cortando na virada do mês),
// por isso um ciclo pode ter mais de um período.
// ══════════════════════════════════════════════════════════════

const VX_GRUPOS = [['vendas', 'Vendas'], ['promo', 'Promoções'], ['comissao', 'Comissão e pagamento'], ['logistica', 'Logística'],
  ['servicos', 'Serviços'], ['ajustes', 'Cancelamentos e ajustes']];

let _vcCiclo = null;   // segunda-feira (ISO) do ciclo aberto no Por canal dos marketplaces

const _vxNum = v => {
  if (v == null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  const t = String(v).replace('%', '').trim();
  return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0;
};
const _vxData = v => {
  if (v instanceof Date) return v;
  const s = String(v || '');
  const br = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (br) return new Date(+br[3], br[2] - 1, +br[1], +(br[4] || 0), +(br[5] || 0));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d : null;
};
const _vxExt = s => String(s ?? '').trim().replace(/^0+(?=\d)/, '');
// O nº do pedido na plataforma se repete (na 99 reinicia todo dia): a chave é nº + dia do pedido
const _vxChave = (ext, ts) => { const d = _vxData(ts); return ext && d ? `${_vxExt(ext)}@${cpIso(d)}` : ''; };
const _vxDdMm = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function _vxNovoPer(fonte, ini, fim) {
  const per = { fonte, ini, fim, pagamento: null, total: 0, linhas: [], pedidos: {} };
  Object.defineProperty(per, '_ped', { value: new Map() });   // pedidos por linha, só pra contar
  return per;
}
function _vxAcc(per, g, d, v, info = false, ext = '') {
  if (Math.abs(v) < 0.005) return;
  const k = g + '|' + d + '|' + info;
  let l = per.linhas.find(x => x._k === k);
  if (!l) { per.linhas.push(l = { g, d, v: 0, n: 0, info }); Object.defineProperty(l, '_k', { value: k }); per._ped.set(k, new Set()); }
  l.v += v;
  const set = per._ped.get(k); if (ext) set.add(ext); l.n = set.size;
}
function _vxPed(per, ext, v, ts, cancelado = false) {
  const k = _vxChave(ext, ts);
  if (!k) return;
  const p = per.pedidos[k] || (per.pedidos[k] = { v: 0, ts: ts ? new Date(ts).toISOString() : null });
  p.v += v;
  if (cancelado) p.cancelado = true;
}
function _vxFechar(per) {
  per.total = _r2(per.total);
  per.linhas.forEach(l => { l.v = _r2(l.v); });
  Object.values(per.pedidos).forEach(p => { p.v = _r2(p.v); });
  return per;
}

// ── 99Food: "Detalhes da fatura" (1 linha por pedido) ──
const _VX_99_COLS = [
  ['vendas', 'Preço total dos itens sem as ofertas', 'Itens (preço cheio)'],
  ['vendas', 'Taxa de pedido mínimo', 'Taxa de pedido mínimo'],
  ['vendas', 'Taxa de entrega da loja', 'Taxa de entrega (entrega própria)'],
  ['vendas', 'Gorjeta', 'Gorjeta'],
  ['promo', 'Investimento da loja em itens em oferta', 'Ofertas pagas pela loja'],
  ['promo', 'Contribuição 99 Food em itens em oferta', 'Ofertas pagas pela 99'],
  ['logistica', 'Investimento da loja em custos logísticos de ofertas', 'Frete grátis pago pela loja'],
  ['logistica', 'Contribuição 99 Food em custos logísticos de ofertas', 'Frete grátis pago pela 99'],
  ['logistica', 'Investimento da loja em custos de entrega', 'Desconto de entrega (novos clientes) pago pela loja'],
  ['logistica', 'Contribuição 99 Food em custos de entrega', 'Desconto de entrega pago pela 99'],
  ['logistica', 'Custos Logísticos', 'Entrega feita pela 99'],
  ['logistica', 'Taxa do Entrega', 'Taxa do Entrega'],
  ['comissao', 'Custos com comissão e distribuição', 'Comissão'],
  ['comissao', 'Recompensa de comissão (da 99 Food) para a loja', 'Recompensa de comissão'],
  ['comissao', 'Taxa de processamento de pagamento', 'Processamento de pagamento'],
  ['servicos', 'Mensalidade', 'Mensalidade'],
  ['servicos', 'Despesas com anúncio', 'Anúncios'],
  ['ajustes', 'Reembolso (reembolso parcial/perda de pedido)', 'Reembolso parcial / perda de pedido'],
  ['ajustes', 'Compensação de contestação', 'Contestações'],
  ['ajustes', 'Valor da dedução/reembolso', 'Deduções'],
  ['ajustes', 'Dinheiro coletado do cliente ou do entregador', 'Recebido direto (dinheiro)'],
  ['ajustes', 'Vale-refeição cobrado direto do cliente pela loja', 'Vale-refeição recebido direto'],
  ['ajustes', 'Valor de adiantamento da plataforma para oferta de Marketing de itens', 'Adiantamento de marketing'],
];

function _vx99(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hi = rows.findIndex(r => r.includes('Data de cobrança') && r.includes('Valor da cobrança'));   // a 1ª linha é só o agrupamento
  if (hi < 0) return [];
  const h = rows[hi].map(x => String(x).trim());
  const col = n => h.indexOf(n);
  const pers = {};
  for (const r of rows.slice(hi + 1)) {
    const cob = _vxData(r[col('Data de cobrança')]);
    if (!cob) continue;
    const seg = cpSegunda(cob), dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const per = pers[cpIso(seg)] || (pers[cpIso(seg)] = _vxNovoPer('99food', cpIso(seg), cpIso(dom)));
    const total = _vxNum(r[col('Valor da cobrança')]);
    per.total += total;
    const pag = _vxData(r[col('Data de pagamento planejada')]);
    if (pag) per.pagamento = cpIso(pag);
    const ext = _vxExt(r[col('Nº de retirada')]), ts = _vxData(r[col('Data do pedido')]);
    if (/reembolso/i.test(r[col('Tipo de documento')])) {
      _vxAcc(per, 'ajustes', 'Pedidos reembolsados ao cliente', total, false, _vxChave(ext, ts));
      _vxPed(per, ext, total, ts, true);
      continue;
    }
    let soma = 0;
    for (const [g, nome, d] of _VX_99_COLS) {
      const i = col(nome); if (i < 0) continue;
      const v = _vxNum(r[i]); soma += v;
      _vxAcc(per, g, d, v, false, _vxChave(ext, ts));
    }
    if (Math.abs(total - soma) > 0.009) _vxAcc(per, 'ajustes', 'Outros ajustes', total - soma, false, _vxChave(ext, ts));
    _vxPed(per, ext, total, ts);
  }
  return Object.values(pers).map(_vxFechar);
}

// ── iFood: "Relatório de Conciliação" (1 linha por lançamento) ──
function _vxIfoodGrupo(d) {
  if (/entrada financeira/i.test(d)) return ['vendas', 'Pago pelos clientes'];
  if (/taxa de servi/i.test(d)) return ['vendas', 'Taxa de serviço cobrada do cliente (fica com o iFood)'];
  if (/custeada pelo ifood/i.test(d)) return ['promo', 'Promoções pagas pelo iFood'];
  if (/custeada pela loja no delivery/i.test(d)) return ['logistica', 'Entrega grátis paga pela loja'];
  if (/custeada pela loja/i.test(d)) return ['promo', 'Promoções pagas pela loja'];
  if (/comiss/i.test(d)) return ['comissao', d.replace(/^Comissão do iFood/i, 'Comissão')];
  if (/transa|parcelad|pagamento/i.test(d)) return ['comissao', d];
  if (/entrega/i.test(d)) return ['logistica', d];
  if (/an[uú]ncio/i.test(d)) return ['servicos', 'Anúncios'];
  if (/mensalidade|plano/i.test(d)) return ['servicos', d];
  return ['ajustes', d.charAt(0).toUpperCase() + d.slice(1)];
}

function _vxIfood(rows) {
  const pers = {};
  for (const r of rows) {
    const ini = String(r.data_apuracao_inicio || '').slice(0, 10), fim = String(r.data_apuracao_fim || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) continue;
    const k = ini + '|' + fim;
    const per = pers[k] || (pers[k] = _vxNovoPer('ifood', ini, fim));
    const v = _vxNum(r.valor);
    const info = String(r.impacto_no_repasse || '').trim().toUpperCase() !== 'SIM';
    if (!info) per.total += v;
    if (r.data_repasse_esperada) per.pagamento = String(r.data_repasse_esperada).slice(0, 10);
    const ext = _vxExt(r.pedido_associado_ifood_curto), ts = r.data_criacao_pedido_associado || null;
    const d = String(r.descricao_lancamento || r.tipo_lancamento || '').trim();
    if (/cancel/i.test(String(r.fato_gerador || ''))) {
      _vxAcc(per, 'ajustes', info ? 'Promoções estornadas de pedidos cancelados' : 'Pedidos cancelados', v, info, _vxChave(ext, ts));
      if (!info) _vxPed(per, ext, v, ts, true);
      continue;
    }
    const [g, desc] = _vxIfoodGrupo(d);
    _vxAcc(per, g, desc, v, info, _vxChave(ext, ts));
    if (!info) _vxPed(per, ext, v, ts);
  }
  return Object.values(pers).map(_vxFechar);
}

// Reconhece o arquivo e devolve { canal, periodos }
function _vxLer(wb) {
  if (wb.Sheets['Detalhes da fatura']) return { canal: '99food', periodos: _vx99(wb.Sheets['Detalhes da fatura']) };
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
    if (rows.length && 'impacto_no_repasse' in rows[0] && 'data_apuracao_inicio' in rows[0]) return { canal: 'ifood', periodos: _vxIfood(rows) };
  }
  return null;
}

async function vxCarregarRepasse(canal, semanaIni) {
  const { data, error } = await _estSb().from('vd_repasses').select('*').eq('canal', canal).eq('semana_inicio', semanaIni).is('excluido_em', null).limit(1);
  if (error) throw new Error(error.message);
  return data[0] || null;
}

async function vxImportarExtrato(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') return toast('Leitor de planilhas não carregou. Recarregue a página.', 'err');
  try {
    toast('Lendo o extrato…', 'info');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const lido = _vxLer(wb);
    if (!lido || !lido.periodos.length) return toast('Não reconheci esse arquivo. Use o "Relatório de Conciliação" do iFood ou o "Detalhes da fatura" da 99.', 'err');
    const { canal } = lido, cfg = vcCanalCfg(canal);
    const path = await cpUploadAnexo(file, 'repasses');
    const porCiclo = {};
    for (const p of lido.periodos) {
      p.arquivo = file.name; p.arquivo_path = path; p.importado_em = new Date().toISOString(); p.importado_por = estUsuario();
      (porCiclo[cpIso(cpSegunda(new Date(p.ini + 'T12:00:00')))] ||= []).push(p);
    }
    const ciclos = Object.keys(porCiclo).sort();
    for (const seg of ciclos) {
      const row = await vxCarregarRepasse(canal, seg);
      const extrato = row?.extrato?.periodos ? row.extrato : { periodos: {} };
      porCiclo[seg].forEach(p => { extrato.periodos[p.ini + '|' + p.fim] = p; });
      const total = _r2(Object.values(extrato.periodos).reduce((s, p) => s + p.total, 0));
      const campos = { extrato, arquivo_path: path };
      // sem antecipação, o que cai na conta é o próprio total do extrato
      if (row?.valor_pago == null && !_n(cfg.antecipacaoPct)) campos.valor_pago = total;
      if (row) await cpUpdate('vd_repasses', row.id, campos);
      else {
        const ini = new Date(seg + 'T12:00:00'), fim = new Date(ini), rep = new Date(ini);
        fim.setDate(ini.getDate() + 6); rep.setDate(ini.getDate() + 6 + (cfg.repasseDias ?? 3));
        await cpInsert('vd_repasses', { canal, semana_inicio: seg, semana_fim: cpIso(fim), data_repasse: cpIso(rep), criado_por: estUsuario(), ...campos });
      }
    }
    const br = iso => iso.split('-').reverse().slice(0, 2).join('/');
    toast(`Extrato ${cfg.nome} importado: ${ciclos.length} ciclo(s), de ${br(ciclos[0])} a ${br(ciclos[ciclos.length - 1])}`, 'ok');
    _vcCanalSel = canal;
    if (!ciclos.includes(_vcCiclo)) {
      const fechados = ciclos.filter(s => s < cpIso(cpSegunda()));
      _vcCiclo = (fechados.length ? fechados : ciclos).slice(-1)[0];
    }
    renderVendasPorCanal();
  } catch (e) { toast('Não importou: ' + e.message, 'err'); }
}

// Junta os períodos do ciclo num extrato só
function vxConsolidar(extrato) {
  const pers = Object.values(extrato?.periodos || {}).sort((a, b) => a.ini < b.ini ? -1 : 1);
  if (!pers.length) return null;
  const linhas = [], pedidos = {};
  let total = 0;
  for (const p of pers) {
    total += p.total;
    for (const l of p.linhas) {
      let x = linhas.find(y => y.g === l.g && y.d === l.d && !!y.info === !!l.info);
      if (!x) linhas.push(x = { ...l, v: 0, n: 0 });
      x.v += l.v; x.n += l.n;
    }
    for (const [k, v] of Object.entries(p.pedidos)) {
      const x = pedidos[k] || (pedidos[k] = { v: 0, ts: v.ts });
      x.v += v.v; if (v.cancelado) x.cancelado = true;
    }
  }
  return { periodos: pers, linhas, pedidos, total: _r2(total) };
}

// ── UI (usada no Vendas › Por canal) ──

function vxCicloRange(iso) {
  const ini = new Date(iso + 'T00:00:00'), fim = new Date(ini);
  fim.setDate(ini.getDate() + 6); fim.setHours(23, 59, 59, 999);
  return { ini, fim, inicioISO: ini.toISOString(), fimISO: fim.toISOString() };
}

function vxCicloSelect(fn) {
  const atual = cpSegunda();
  if (!_vcCiclo) { const s = new Date(atual); s.setDate(s.getDate() - 7); _vcCiclo = cpIso(s); }
  const ops = [];
  for (let i = 0; i < 26; i++) {
    const d = new Date(atual); d.setDate(d.getDate() - 7 * i);
    const f = new Date(d); f.setDate(d.getDate() + 6);
    ops.push([cpIso(d), `Ciclo ${_vxDdMm(d)} a ${_vxDdMm(f)}${i === 0 ? ' · em andamento' : ''}`]);
  }
  if (!ops.some(o => o[0] === _vcCiclo)) { const r = vxCicloRange(_vcCiclo); ops.push([_vcCiclo, `Ciclo ${_vxDdMm(r.ini)} a ${_vxDdMm(r.fim)}`]); }
  return `<select class="inp" style="width:auto;font-size:var(--text-sm);font-weight:600" onchange="_vcCiclo=this.value;_vcPedLimite=100;${fn}()">
    ${ops.map(([v, t]) => `<option value="${v}"${v === _vcCiclo ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
}

function vxBotaoAnexar(temExtrato) {
  return `<label class="btn btn-${temExtrato ? 'outline' : 'primary'} btn-xs" style="cursor:pointer">${lc('upload', 12, 'currentColor')} ${temExtrato ? 'Substituir extrato' : 'Anexar extrato'}
    <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="vxImportarExtrato(this.files[0]);this.value=''"></label>`;
}

function vxAvisoSemExtrato(c) {
  const ajuda = c.modelo === 'ifood' ? 'Portal do Parceiro › Financeiro › Relatório de Conciliação (.xlsx)' : 'Portal 99Food › Financeiro › Faturas › Detalhes da fatura (.xlsx)';
  return `<label style="display:flex;align-items:center;gap:12px;padding:14px 16px;border:1.5px dashed var(--border);border-radius:var(--r12);margin-bottom:14px;cursor:pointer;background:var(--surface2)">
    ${lc('file-spreadsheet', 22, 'var(--purple)')}
    <div style="flex:1"><div style="font-weight:700">Anexe o extrato do ${_vcEsc(c.nome)} deste ciclo</div>
      <div style="font-size:var(--text-sm);color:var(--muted)">${ajuda}. Enquanto não anexar, os valores abaixo são estimados pelas taxas configuradas.</div></div>
    <span class="btn btn-primary btn-sm">${lc('upload', 13, 'currentColor')} Anexar</span>
    <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="vxImportarExtrato(this.files[0]);this.value=''"></label>`;
}

// Blocos do extrato oficial + antecipação/valor que caiu na conta
function vxHtmlOficial(cons, c, row) {
  const blocos = VX_GRUPOS.map(([g, titulo]) => {
    const ls = cons.linhas.filter(l => l.g === g && Math.abs(l.v) >= 0.005)
      .sort((a, b) => (a.info - b.info) || (Math.abs(b.v) - Math.abs(a.v)));
    if (!ls.length) return '';
    const total = ls.filter(l => !l.info).reduce((s, l) => s + l.v, 0);
    return _vcBloco(titulo, ls.map(l => [_vcEsc(l.d), l.v,
      l.info ? 'já descontado do valor pago pelos clientes' : (l.n ? `${l.n} pedido${l.n > 1 ? 's' : ''}` : ''), l.info ? 'info' : '']), total);
  }).join('');
  const pago = row?.valor_pago != null ? Number(row.valor_pago) : null;
  const antPct = _n(c.antecipacaoPct);
  const antecipacao = antPct ? (pago != null ? pago - cons.total : -cons.total * antPct / 100) : 0;
  const pagamento = [...new Set(cons.periodos.map(p => p.pagamento).filter(Boolean))].map(_vcBr).join(', ');
  return blocos + `
    <div style="display:flex;justify-content:space-between;gap:10px;padding:12px 0 0;border-top:1.5px solid var(--text);font-weight:800;font-size:var(--text-lg)">
      <span>Total do ciclo</span><span>${_vcR(cons.total)}</span></div>
    <div style="font-size:var(--text-xs);color:var(--muted)">valor oficial do ${_vcEsc(c.nome)}${pagamento ? ` · pagamento previsto ${pagamento}` : ''}</div>
    ${antPct ? `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0 0;font-size:var(--text-sm)">
      <span style="color:var(--text2)">Antecipação ${pago != null ? '(real)' : `(estimada ${antPct.toLocaleString('pt-BR')}%)`}</span>
      <span style="color:var(--danger-fg)">${_vcR(antecipacao)}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0 0;font-weight:700">
      <span>Caiu na conta</span>
      <input class="inp" type="text" inputmode="decimal" placeholder="${antPct ? 'informe' : _vcR(cons.total)}" value="${pago != null ? String(pago).replace('.', ',') : ''}"
        style="width:130px;text-align:right;font-weight:700" onchange="vxSalvarPago(this.value)"></div>`;
}

async function vxSalvarPago(valor) {
  const t = String(valor || '').trim();
  const v = t === '' ? null : parseFloat(t.replace(/R\$\s*/, '').includes(',') ? t.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.') : t.replace(/R\$\s*/, ''));
  if (v !== null && isNaN(v)) return toast('Valor inválido', 'err');
  try {
    const row = await vxCarregarRepasse(_vcCanalSel, _vcCiclo);
    if (!row) return toast('Anexe o extrato do ciclo primeiro', 'err');
    await cpUpdate('vd_repasses', row.id, { valor_pago: v });
    toast('Valor recebido salvo', 'ok');
    renderVendasPorCanal();
  } catch (e) { toast('Não salvou: ' + e.message, 'err'); }
}

// Conferência: regras do app × extrato, no total e pedido a pedido
function vxConferencia(cons, peds, s) {
  const calc = _r2(s.repasse - s.fixos.anuncios - s.fixos.mensalidade);
  const dif = cons.total - calc;
  const porExt = new Map(peds.filter(p => p.numExterno).map(p => [_vxChave(p.numExterno, p.ts), p]));
  const diverg = [], soExtrato = [], cancelados = [];
  let conferidos = 0;
  for (const [ext, o] of Object.entries(cons.pedidos)) {
    const p = porExt.get(ext);
    if (!p) { (o.cancelado || Math.abs(o.v) < 0.01 ? cancelados : soExtrato).push({ ext, o }); continue; }
    porExt.delete(ext);
    if (Math.abs(o.v - p.repasse) > 0.05) diverg.push({ ext, o, p, d: o.v - p.repasse }); else conferidos++;
  }
  const soApp = [...porExt.values()];
  diverg.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const linha = (t, v, cor = '') => `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:var(--text-sm)"><span style="color:var(--text2)">${t}</span><span style="font-weight:700;white-space:nowrap;${cor}">${v}</span></div>`;
  const lista = (titulo, itens, fmt) => itens.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:var(--text-sm);font-weight:700">${titulo} (${itens.length})</summary>
    <div style="max-height:220px;overflow:auto;margin-top:6px">${itens.slice(0, 60).map(fmt).join('')}</div></details>` : '';
  const dt = ts => ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="card" style="margin:0;padding:18px 20px">
    <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:6px">Conferência</div>
    ${linha('Calculado pelas regras do app', _vcR(calc))}
    ${linha('Oficial do extrato', _vcR(cons.total))}
    ${linha('Diferença', _vcR(dif), `color:${Math.abs(dif) > 1 ? 'var(--danger-fg)' : 'var(--success-fg)'}`)}
    <div style="border-top:1px solid var(--border);margin:8px 0 4px"></div>
    ${linha('Pedidos que batem', conferidos, 'color:var(--success-fg)')}
    ${linha('Com diferença acima de R$ 0,05', diverg.length, diverg.length ? 'color:var(--warning-fg)' : '')}
    ${linha('Só no extrato', soExtrato.length, soExtrato.length ? 'color:var(--danger-fg)' : '')}
    ${linha('Só no app (não estão no extrato)', soApp.length, soApp.length ? 'color:var(--danger-fg)' : '')}
    ${linha('Cancelados / reembolsados na plataforma', cancelados.length)}
    ${lista('Com diferença', diverg, x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border);font-size:var(--text-xs)">
      <span>#${x.p.num} · ${_vcEsc(x.ext.split('@')[0])} <span style="color:var(--muted)">${dt(x.p.ts)}</span></span>
      <span style="white-space:nowrap">app ${_vcR(x.p.repasse)} · extrato ${_vcR(x.o.v)} · <b style="color:${x.d < 0 ? 'var(--danger-fg)' : 'var(--success-fg)'}">${_vcR(x.d)}</b></span></div>`)}
    ${lista('Só no extrato', soExtrato, x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border);font-size:var(--text-xs)">
      <span>${_vcEsc(x.ext.split('@')[0])} <span style="color:var(--muted)">${dt(x.o.ts)}</span></span><span>${_vcR(x.o.v)}</span></div>`)}
    ${lista('Só no app', soApp, p => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border);font-size:var(--text-xs)">
      <span>#${p.num} · ${_vcEsc(p.numExterno || 'sem nº')} <span style="color:var(--muted)">${dt(p.ts)}</span></span><span>${_vcR(p.repasse)}</span></div>`)}
    ${lista('Cancelados / reembolsados', cancelados, x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid var(--border);font-size:var(--text-xs)">
      <span>${_vcEsc(x.ext.split('@')[0])} <span style="color:var(--muted)">${dt(x.o.ts)}</span></span><span>${_vcR(x.o.v)}</span></div>`)}
  </div>`;
}

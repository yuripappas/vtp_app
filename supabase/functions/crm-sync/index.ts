// VTP Compras — crm-sync
// Edge Function disparada por cron a cada minuto (migration 20261022120000).
// Alimenta Marketing › Relacionamento › Contatos com duas rotinas, uma por rodada:
//
//  1. Passada diária de clientes (a partir das 4h de Maceió): percorre
//     GET /merchant/customers (50 por página) e grava em crm_clientes.
//     Quem não aparece na passada fica ativo = false (o CW só lista clientes
//     ativos e não bloqueados). No fim, recalcula o RFV.
//  2. Backfill do histórico (uma vez): lista GET /orders/history dos últimos
//     12 meses (limite da API) e busca o detalhe de cada pedido que ainda não
//     está em cw_pedidos com cliente — o histórico só traz o resumo, e é do
//     detalhe que saem cliente, total e itens.
//
// Limites da API do CW: 300 req / 3 min no geral (dividido com o cw-sync) e
// 5 req / min no /orders/history. Cada rodada fica em ~45 requisições.
//
// ?forcar=clientes reinicia a passada de clientes na hora;
// ?forcar=historico refaz a listagem do histórico.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CW_API_BASE, montarLinha, normalizarTelefone } from '../_shared/cw-pedido.ts';

const PAGINAS_POR_RODADA  = 40;
const DETALHES_POR_RODADA = 45;
const PARALELO            = 5;
const HORA_PASSADA_DIARIA = 4;   // hora de Maceió a partir da qual a passada do dia começa
// A partir daqui o cw-sync já grava o cliente de cada pedido (migration 20260626060000).
const CORTE_HISTORICO = '2026-06-28T00:00:00-03:00';

// deno-lint-ignore no-explicit-any
type Sb = any;

function agoraMaceio() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return { data: `${g('year')}-${g('month')}-${g('day')}`, hora: Number(g('hour')) };
}

function dataMaceio(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(new Date(iso));
}

async function lerEstado(sb: Sb, chave: string) {
  const { data } = await sb.from('crm_sync_estado').select('dados').eq('chave', chave).maybeSingle();
  return (data?.dados || {}) as Record<string, any>;
}

async function gravarEstado(sb: Sb, chave: string, dados: Record<string, any>) {
  await sb.from('crm_sync_estado').upsert({ chave, dados, atualizado_em: new Date().toISOString() });
}

// ── 1. Passada de clientes ──────────────────────────────────────────────

function linhaCliente(c: any, visto: string) {
  return {
    id:                 c.id,
    nome:               c.name ?? null,
    email:              c.email ?? null,
    telefone:           normalizarTelefone({ phone: c.phone_number, ddi: c.ddi }),
    data_nascimento:    c.birth_date ?? null,
    genero:             c.gender ?? null,
    cw_criado_em:       c.created_at ?? null,
    pontos:             c.loyalty_points ?? 0,
    pontos_expiram_em:  c.loyalty_points_expires_at ?? null,
    cashback:           c.cashback_balance ?? 0,
    cashback_expira_em: c.cashback_expires_at ?? null,
    aceita_whatsapp:    c.notifications_enabled ?? true,
    ativo:              true,
    visto_em:           visto,
  };
}

async function rodadaClientes(sb: Sb, token: string, est: Record<string, any>) {
  let pagina: number = est.pagina || 1;
  let total: number | null = est.total_paginas ?? null;
  let limite = false, gravados = 0;
  const visto = est.iniciado_em;

  for (let feitas = 0; feitas < PAGINAS_POR_RODADA && !limite && (total === null || pagina <= total);) {
    const lote = Array.from({ length: PARALELO }, (_, i) => pagina + i).filter(p => total === null || p <= total);
    const respostas = await Promise.all(lote.map(async p => {
      const r = await fetch(`${CW_API_BASE}/merchant/customers?page=${p}&per_page=50`, { headers: { 'X-API-KEY': token, 'Accept': 'application/json' } });
      if (r.status === 429) return { p, limite: true } as const;
      if (!r.ok) throw new Error(`CW /merchant/customers p${p} HTTP ${r.status}`);
      return { p, corpo: await r.json() } as const;
    }));
    // Avança só até a primeira página que não veio, para não pular nenhuma.
    for (const resp of respostas) {
      if ('limite' in resp) { limite = true; break; }
      total = resp.corpo.pagination?.total_pages ?? total;
      const linhas = (resp.corpo.customers || []).map((c: any) => linhaCliente(c, visto));
      if (linhas.length) {
        const { error } = await sb.from('crm_clientes').upsert(linhas, { onConflict: 'id' });
        if (error) throw new Error('upsert crm_clientes: ' + error.message);
        gravados += linhas.length;
      }
      pagina = resp.p + 1;
      feitas++;
    }
  }

  const terminou = total !== null && pagina > total;
  if (terminou) {
    await sb.from('crm_clientes').update({ ativo: false }).lt('visto_em', visto);
    await sb.rpc('crm_recalcular');
    await gravarEstado(sb, 'clientes', { rodando: false, iniciado_em: visto, concluido_em: new Date().toISOString(), total_paginas: total });
  } else {
    await gravarEstado(sb, 'clientes', { ...est, rodando: true, pagina, total_paginas: total });
  }
  return { rotina: 'clientes', pagina, total_paginas: total, gravados, limite, terminou };
}

// ── 2. Backfill do histórico ────────────────────────────────────────────

function janelasHistorico() {
  // O CW não aceita início com mais de 1 ano nem janela maior que 6 meses.
  const janelas: Array<{ inicio: string; fim: string }> = [];
  let ini = new Date(Date.now() - 360 * 864e5);
  const corte = new Date(CORTE_HISTORICO);
  while (ini < corte) {
    const fim = new Date(Math.min(ini.getTime() + 175 * 864e5, corte.getTime()));
    janelas.push({ inicio: ini.toISOString(), fim: fim.toISOString() });
    ini = fim;
  }
  return janelas;
}

async function listarUmaPaginaHistorico(sb: Sb, token: string, est: Record<string, any>) {
  const j = est.janelas[est.janela];
  const qs = new URLSearchParams({ start_date: j.inicio, end_date: j.fim, page: String(est.pagina), per_page: '100' });
  const r = await fetch(`${CW_API_BASE}/orders/history?${qs}`, { headers: { 'X-API-KEY': token, 'Accept': 'application/json' } });
  if (r.status === 429) return { limite: true };
  if (!r.ok) throw new Error(`CW /orders/history HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const corpo = await r.json();
  const pedidos: Array<{ id: number; created_at: string }> = corpo.orders || [];

  // Entra na fila só o que ainda não tem cliente lido do detalhe.
  const ids = pedidos.map(p => p.id);
  const { data: prontos } = ids.length
    ? await sb.from('cw_pedidos').select('id').in('id', ids).or('customer_id.not.is.null,cliente_verificado_em.not.is.null')
    : { data: [] as any[] };
  const jaTem = new Set((prontos || []).map((x: any) => x.id));
  const fila = pedidos.filter(p => !jaTem.has(p.id)).map(p => ({ id: p.id, criado_em: p.created_at }));
  if (fila.length) await sb.from('crm_backfill_fila').upsert(fila, { onConflict: 'id' });

  const totalPaginas = corpo.pagination?.total_pages ?? 1;
  if (est.pagina < totalPaginas) est.pagina++;
  else { est.janela++; est.pagina = 1; }
  est.listagem_concluida = est.janela >= est.janelas.length;
  est.enfileirados = (est.enfileirados || 0) + fila.length;
  return { limite: false, enfileirados: fila.length };
}

async function buscarDetalhes(sb: Sb, token: string) {
  const { data: fila } = await sb.from('crm_backfill_fila').select('id').order('criado_em', { ascending: false }).limit(DETALHES_POR_RODADA);
  const ids = (fila || []).map((x: any) => x.id as number);
  if (!ids.length) return { gravados: 0, limite: false, vazia: true };

  const { data: existentes } = await sb.from('cw_pedidos').select('id, status_timestamps').in('id', ids);
  const existentesMap = new Map((existentes || []).map((r: any) => [r.id, r]));

  let limite = false;
  const linhas: any[] = [];
  const resolvidos: number[] = [];
  for (let i = 0; i < ids.length && !limite; i += PARALELO) {
    await Promise.all(ids.slice(i, i + PARALELO).map(async (id: number) => {
      const r = await fetch(`${CW_API_BASE}/orders/${id}`, { headers: { 'X-API-KEY': token, 'Accept': 'application/json' } });
      if (r.status === 429) { limite = true; return; }
      if (r.status === 404) { resolvidos.push(id); return; }
      if (!r.ok) return;   // fica na fila para a próxima rodada
      linhas.push(montarLinha(await r.json(), existentesMap.get(id), false));
      resolvidos.push(id);
    }));
  }

  if (linhas.length) {
    const { error } = await sb.from('cw_pedidos').upsert(linhas, { onConflict: 'id' });
    if (error) throw new Error('upsert cw_pedidos: ' + error.message);
  }
  if (resolvidos.length) await sb.from('crm_backfill_fila').delete().in('id', resolvidos);
  return { gravados: linhas.length, limite, vazia: false };
}

async function rodadaHistorico(sb: Sb, token: string, est: Record<string, any>) {
  if (est.concluido) return { rotina: 'historico', concluido: true };

  let listagem: any = null;
  if (!est.listagem_concluida) listagem = await listarUmaPaginaHistorico(sb, token, est);
  const detalhes = await buscarDetalhes(sb, token);

  if (est.listagem_concluida && detalhes.vazia) {
    est.concluido = true;
    est.concluido_em = new Date().toISOString();
    await sb.rpc('crm_recalcular');
  }
  await gravarEstado(sb, 'historico', est);
  return { rotina: 'historico', janela: est.janela, pagina: est.pagina, listagem, detalhes, concluido: !!est.concluido };
}

// ── Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const { data: cfgRow } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  const token = cfgRow?.value?.codLoja as string | undefined;
  if (!token) return json({ error: 'Token CW não configurado (vtp_config.codLoja)' }, 400);

  const forcar = new URL(req.url).searchParams.get('forcar');

  // Trava simples: o cron dispara a cada minuto e uma rodada não deve encavalar na outra.
  const trava = await lerEstado(sb, 'trava');
  if (!forcar && trava.ate && new Date(trava.ate) > new Date()) return json({ ocupado: true });
  await gravarEstado(sb, 'trava', { ate: new Date(Date.now() + 55_000).toISOString() });

  try {
    const cli = await lerEstado(sb, 'clientes');
    const { data: hoje, hora } = agoraMaceio();
    const passadaDeHoje = cli.concluido_em && dataMaceio(cli.concluido_em) >= hoje;
    if (forcar === 'clientes' || (!cli.rodando && !passadaDeHoje && hora >= HORA_PASSADA_DIARIA) || (!cli.concluido_em && !cli.rodando)) {
      Object.assign(cli, { rodando: true, pagina: 1, total_paginas: null, iniciado_em: new Date().toISOString() });
    }
    if (cli.rodando) return json(await rodadaClientes(sb, token, cli));

    let hist = await lerEstado(sb, 'historico');
    if (forcar === 'historico' || !hist.janelas) {
      hist = { janelas: janelasHistorico(), janela: 0, pagina: 1, listagem_concluida: false, concluido: false, enfileirados: 0, iniciado_em: new Date().toISOString() };
    }
    return json(await rodadaHistorico(sb, token, hist));
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  } finally {
    await gravarEstado(sb, 'trava', {});
  }
});

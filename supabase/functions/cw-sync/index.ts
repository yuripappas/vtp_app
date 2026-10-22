// VTP Compras — cw-sync
// Edge Function disparada por cron (pg_cron, ver migration 20260625221000).
// Busca pedidos abertos/recentes na API do Cardápio Web e persiste em
// cw_pedidos, registrando o timestamp de cada transição de status — isso é
// o que permite calcular tempo de preparo/entrega reais (a API do CW só dá
// o status atual, não o histórico).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CW_API_BASE, camposFinanceiros, montarLinha } from '../_shared/cw-pedido.ts';

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Token do CW vem da mesma config que o Portal usa (Configurações → Integrações)
  const { data: cfgRow, error: cfgErr } = await sb.from('kv_store').select('value').eq('key', 'vtp_config').single();
  if (cfgErr || !cfgRow?.value?.codLoja) {
    return new Response(JSON.stringify({ error: 'Token CW não configurado (vtp_config.codLoja)' }), { status: 400 });
  }
  const CW_TOKEN = cfgRow.value.codLoja as string;

  // Backfill: ?backfill=N lê o detalhe de até N pedidos antigos que ainda não
  // têm os campos financeiros (só atualiza esses campos e o status).
  const url = new URL(req.url);
  const lote = Number(url.searchParams.get('backfill') || 0);
  if (lote > 0) {
    const desde = url.searchParams.get('desde') || new Date(Date.now() - 120 * 864e5).toISOString();
    const { data: faltam } = await sb.from('cw_pedidos').select('id').is('financeiro_em', null)
      .gte('cw_created_at', desde).order('cw_created_at', { ascending: false }).limit(Math.min(lote, 300));
    let ok = 0, falhas = 0, limite = false;
    // Devagar (5 por vez) e para no primeiro 429: o limite da API é por minuto
    // e o sync normal (a cada 2 min) também precisa dele.
    for (let i = 0; i < (faltam || []).length && !limite; i += 5) {
      await Promise.all((faltam || []).slice(i, i + 5).map(async (r: any) => {
        try {
          const d = await fetch(`${CW_API_BASE}/orders/${r.id}`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
          if (d.status === 429) { limite = true; return; }
          if (d.status === 404) { await sb.from('cw_pedidos').update({ financeiro_em: new Date().toISOString() }).eq('id', r.id); falhas++; return; }
          if (!d.ok) { falhas++; return; }
          const det = await d.json();
          const { error } = await sb.from('cw_pedidos').update({ ...camposFinanceiros(det), status: det.status }).eq('id', r.id);
          if (error) falhas++; else ok++;
        } catch (_e) { falhas++; }
      }));
    }
    const { count } = await sb.from('cw_pedidos').select('id', { count: 'exact', head: true }).is('financeiro_em', null).gte('cw_created_at', desde);
    return new Response(JSON.stringify({ backfill: ok, falhas, limite, restantes: count }), { headers: { 'Content-Type': 'application/json' } });
  }

  const ordersRes = await fetch(`${CW_API_BASE}/orders`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
  if (!ordersRes.ok) {
    return new Response(JSON.stringify({ error: `CW API /orders HTTP ${ordersRes.status}` }), { status: 502 });
  }
  const summaries: Array<{ id: number; status: string; updated_at: string }> = await ordersRes.json();

  const ids = summaries.map(s => s.id);
  const { data: existentes } = ids.length
    ? await sb.from('cw_pedidos').select('id, status, status_timestamps, cw_updated_at').in('id', ids)
    : { data: [] as any[] };
  const existentesMap = new Map((existentes || []).map(r => [r.id, r]));

  // Sincroniza TODOS os pedidos retornados pela API (a API já retorna só os
  // recentes/ativos, volume pequeno). Remover o filtro por cw_updated_at evita
  // perder pedidos quando o sync ficou parado por algum período.
  const pendentes = summaries;

  let processados = 0, erros = 0;

  // Busca os detalhes em paralelo (rate limit geral da API CW é 400 req/min,
  // bem acima do volume tratado por ciclo de 2min) e grava em lote.
  const linhas = (await Promise.all(pendentes.map(async (s) => {
    try {
      const detRes = await fetch(`${CW_API_BASE}/orders/${s.id}`, { headers: { 'X-API-KEY': CW_TOKEN, 'Accept': 'application/json' } });
      if (!detRes.ok) { erros++; return null; }
      const det = await detRes.json();

      return montarLinha(det, existentesMap.get(s.id));
    } catch (_e) { erros++; return null; }
  }))).filter((l): l is NonNullable<typeof l> => l !== null);

  if (linhas.length) {
    const { error: upsertErr } = await sb.from('cw_pedidos').upsert(linhas, { onConflict: 'id' });
    if (upsertErr) { erros += linhas.length; } else { processados = linhas.length; }
  }

  return new Response(JSON.stringify({ total: summaries.length, processados, erros }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

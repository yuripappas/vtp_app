// Busca cw_pedidos num range, paginando (PostgREST corta em 1000/request) —
// mesmo padrão de js/vendas.js:366-386 (_vFetchPeriodo), mesmo filtro de
// status cancelado.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { CwPedido } from './vendas-engine.ts';

export async function buscarPedidosPeriodo(sb: SupabaseClient, inicioISO: string, fimISO: string): Promise<CwPedido[]> {
  const PAGE = 1000;
  const pedidos: CwPedido[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('cw_pedidos')
      .select('id, items, sales_channel, total, cw_created_at, status')
      .gte('cw_created_at', inicioISO)
      .lte('cw_created_at', fimISO)
      .order('cw_created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao buscar cw_pedidos: ${error.message}`);
    for (const p of (data || []) as CwPedido[]) {
      if (p.status === 'canceling' || p.status === 'canceled') continue;
      pedidos.push(p);
    }
    if (!data || data.length < PAGE) break;
  }
  return pedidos;
}

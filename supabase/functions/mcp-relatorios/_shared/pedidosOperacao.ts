// Fetch enxuto pras tools operacionais (tempos, atraso, bairro, recorrência)
// — mesmo padrão de paginação de pedidos.ts, mas sem o campo `items` (JSONB
// grande, não usado por nenhuma dessas tools) e com as colunas extras que
// elas precisam (status_timestamps, customer_phone, delivery_address).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { StatusTimestamps } from './tempos.ts';

export interface PedidoOperacao {
  id: number | string;
  display_id: number | null;
  status: string;
  order_type: string | null;
  sales_channel: string | null;
  total: number;
  cw_created_at: string;
  status_timestamps: StatusTimestamps | null;
  customer_phone: string | null;
  delivery_address: { neighborhood?: string; city?: string } | null;
}

export async function buscarPedidosOperacaoPeriodo(sb: SupabaseClient, inicioISO: string, fimISO: string): Promise<PedidoOperacao[]> {
  const PAGE = 1000;
  const pedidos: PedidoOperacao[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('cw_pedidos')
      .select('id, display_id, status, order_type, sales_channel, total, cw_created_at, status_timestamps, customer_phone, delivery_address')
      .gte('cw_created_at', inicioISO)
      .lte('cw_created_at', fimISO)
      .order('cw_created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao buscar cw_pedidos: ${error.message}`);
    for (const p of (data || []) as PedidoOperacao[]) {
      if (p.status === 'canceling' || p.status === 'canceled') continue;
      pedidos.push(p);
    }
    if (!data || data.length < PAGE) break;
  }
  return pedidos;
}

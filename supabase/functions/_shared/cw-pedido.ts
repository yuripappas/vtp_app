// Montagem da linha de cw_pedidos a partir do detalhe do pedido no CW
// (GET /orders/{id}). Compartilhado entre cw-sync (pedidos ao vivo) e
// crm-sync (backfill do histórico de 12 meses), para que os dois gravem
// exatamente os mesmos campos.

export const CW_API_BASE = 'https://integracao.cardapioweb.com/api/partner/v1';

// Contagem de pizzas grandes/pequenas — motor simplificado que cobre os layouts
// reais do CW (validados nos pedidos de produção). Grava em pizzas_grande /
// pizzas_pequena para que o Dashboard possa exibir o número mesmo quando
// vendas.js não estiver disponível no navegador (ex.: browser cache antigo).
// O motor completo (js/vendas.js → contarPizzasPedido) é mais preciso para o
// CMV (usa o cadastro de sabores), mas para a CONTAGEM de pizzas este motor
// cobre >99% dos casos — os dois devem convergir na maioria dos pedidos.

const RE_SLOT     = /pizza\s+(grande|pequena).*pizza\s+(salgada|doce)/i;
const RE_SIZE_OPT = /^pizza\s+(grande|pequena)\b/i;

interface CwOption { name?: string; quantity?: number; option_group_name?: string; option_group_id?: number | string; }
interface CwItem   { name?: string; items?: CwItem[]; options?: CwOption[]; status?: string; }

function contarPizzasItem(it: CwItem): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  const opts = it.options || [];
  const grupos = new Set<string | number>();

  for (const o of opts) {
    const g = o.option_group_name || '';
    // Layout A: group name contém "pizza grande/pequena ... pizza salgada/doce"
    if (RE_SLOT.test(g)) {
      const gid = o.option_group_id ?? g;
      if (!grupos.has(gid)) {
        grupos.add(gid);
        if (/grande/i.test(g)) grande++; else pequena++;
      }
    }
    // Layout "| Pizza Grande/Pequena" no nome da opção (grátis do combo)
    else if (/\|\s*pizza\s+(grande|pequena)/i.test(o.name || '')) {
      if (/grande/i.test(o.name || '')) grande++; else pequena++;
    }
    // Layout B: opção chama "Pizza Grande/Pequena" (seletor de tamanho)
    else if (RE_SIZE_OPT.test(o.name || '')) {
      if (/grande/i.test(o.name || '')) grande++; else pequena++;
    }
  }

  // Layout C: tudo no nome do item ("Sabor | Pizza Grande"), sem opções
  if (grande + pequena === 0 && !opts.length) {
    const m = (it.name || '').match(/\|\s*pizza\s+(grande|pequena)/i);
    if (m) { if (/grande/i.test(m[1])) grande++; else pequena++; }
  }

  return { grande, pequena };
}

export function contarPizzas(items: CwItem[] | undefined): { grande: number; pequena: number } {
  let grande = 0, pequena = 0;
  for (const it of (items || [])) {
    if (it.status === 'canceled') continue;
    // Sub-itens aninhados (combos)
    if (it.items && it.items.length) {
      const sub = contarPizzas(it.items);
      grande += sub.grande; pequena += sub.pequena;
    } else {
      const own = contarPizzasItem(it);
      grande += own.grande; pequena += own.pequena;
    }
  }
  return { grande, pequena };
}

// ── Cliente e endereço (para o módulo de omnichannel) ──────────────────────

interface CwCustomer { id?: number; name?: string; phone?: string; ddi?: string; }

export function normalizarTelefone(c: CwCustomer | null | undefined): string | null {
  if (!c?.phone) return null;
  const digitos = (((c.ddi || '') + c.phone)).replace(/\D/g, '');
  return digitos || null;
}

// Campos financeiros do pedido (taxas, descontos com quem pagou, pagamentos)
export function camposFinanceiros(det: any) {
  return {
    delivery_fee:        det.delivery_fee ?? null,
    driver_fee:          det.driver_fee ?? null,
    service_fee:         det.service_fee ?? null,
    additional_fee:      det.additional_fee ?? null,
    delivered_by:        det.delivered_by ?? null,
    discounts:           det.discounts ?? [],
    payments:            det.payments ?? [],
    external_display_id: det.external_display_id ?? null,
    financeiro_em:       new Date().toISOString(),
  };
}


// carimbarStatus: o sync ao vivo registra o instante em que viu cada status
// (base do tempo de preparo/entrega). No backfill histórico isso seria falso —
// o pedido já está encerrado há meses —, então ele não carimba.
export function montarLinha(det: any, existente: any, carimbarStatus = true) {
  const statusTs = { ...(existente?.status_timestamps || {}) };
  if (carimbarStatus && !statusTs[det.status]) statusTs[det.status] = new Date().toISOString();

  const pizzas = contarPizzas(det.items);

  return {
    id:                det.id,
    display_id:        det.display_id,
    merchant_id:       det.merchant_id,
    status:            det.status,
    order_type:        det.order_type,
    order_timing:      det.order_timing,
    sales_channel:     det.sales_channel,
    total:             det.total || 0,
    items:             det.items || [],
    pizzas_grande:     pizzas.grande,
    pizzas_pequena:    pizzas.pequena,
    status_timestamps: statusTs,
    cw_created_at:     det.created_at,
    cw_updated_at:     det.updated_at,
    synced_at:         new Date().toISOString(),
    customer_id:       det.customer?.id ?? null,
    customer_name:     det.customer?.name ?? null,
    customer_phone:    normalizarTelefone(det.customer),
    delivery_address:  det.delivery_address ?? null,
    // Cupom usado no pedido (atribuição de campanhas) — a API do CW ainda não
    // teve esse campo confirmado; tentamos os formatos mais prováveis e
    // gravamos null se nenhum existir (não impede o resto do sync).
    coupon_code:       det.coupon_code ?? det.coupon?.code ?? det.discount?.code ?? null,
    ...camposFinanceiros(det),
      cliente_verificado_em: new Date().toISOString(),
  };
}

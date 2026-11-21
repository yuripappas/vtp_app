-- Compras simplificado (Lista + Cotação viram "Cotação": um pedido por fornecedor)
--  • cp_pedidos ganha as etapas de montagem: montagem → aprovacao (→ devolvido)
--    → aprovado → solicitado → recebido. 'rascunho' antigo (gerado pelo lote,
--    ainda não enviado) vira 'aprovado'. 'parcial' fica só para o histórico.
--  • Conferência com divergência fecha o pedido e guarda o que não bateu.
--  • Totais da nota (Simples Nacional): IPI, ICMS ST, seguro, outras despesas e
--    desconto entram no custo do insumo (rateio); o frete NÃO entra no custo,
--    só no total da compra (para bater com a nota / o que vai ser pago).

ALTER TABLE cp_pedidos DROP CONSTRAINT IF EXISTS cp_pedidos_status_check;
ALTER TABLE cp_pedidos ADD CONSTRAINT cp_pedidos_status_check
  CHECK (status IN ('montagem','aprovacao','devolvido','aprovado','rascunho','solicitado','parcial','recebido','cancelado'));

ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS enviado_aprovacao_por TEXT;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS enviado_aprovacao_em  TIMESTAMPTZ;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS aprovado_por          TEXT;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS aprovado_em           TIMESTAMPTZ;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS comentario_aprovacao  TEXT;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS divergencias          JSONB;   -- [{item, tipo:'qtd'|'preco', pedido, recebido}]

UPDATE cp_pedidos SET status = 'aprovado', atualizado_por = 'Sistema (compras simplificado)'
 WHERE status = 'rascunho' AND excluido_em IS NULL;

ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS ipi      NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS icms_st  NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS seguro   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS outras   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS desconto NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Linha da compra: total = valor do produto na nota; acrescimo = parte rateada de
-- IPI + ST + seguro + outras − desconto; preco_unit = (total + acrescimo) / qtd.
ALTER TABLE cp_compra_itens ADD COLUMN IF NOT EXISTS apresentacao JSONB;
ALTER TABLE cp_compra_itens ADD COLUMN IF NOT EXISTS acrescimo NUMERIC(14,2) NOT NULL DEFAULT 0;

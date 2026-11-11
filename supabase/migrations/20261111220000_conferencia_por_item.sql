-- Conferência item a item no recebimento:
--  • cp_pedido_itens.conferencia: { status: ok|aceito|devolvido|repedido|cancelado, tipo, obs,
--      qtd_recebida, qtd_devolvida, valor_devolvido, qtd_repedida }
--  • cp_compras.devolvido / devolucoes: valor devolvido ao fornecedor (abatido do pagamento) e itens
ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS conferencia JSONB;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS devolvido  NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS devolucoes JSONB;

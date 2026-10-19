-- Cotação: fornecedores escolhidos para a planilha (colunas) e valor de
-- entrega de cada um ({"<fornecedor_id>": valor}). O frete vai para o pedido
-- e, na conferência, para a compra (fora do custo dos itens).
ALTER TABLE cp_lotes   ADD COLUMN IF NOT EXISTS fornecedores INTEGER[];
ALTER TABLE cp_lotes   ADD COLUMN IF NOT EXISTS fretes JSONB;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS frete NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS frete NUMERIC(14,2) NOT NULL DEFAULT 0;

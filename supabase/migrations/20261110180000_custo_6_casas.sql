-- Custo unitário com 6 casas: itens controlados na unidade base (folha, grampo,
-- saco…) custam frações de centavo; com 4 casas o arredondamento mudava o valor
-- da compra (ex.: 50.000 grampos a 0,000768 = R$ 38,40, com 4 casas virava R$ 40,00).
-- Aplicada em 2026-11-10 junto com a correção de dados "embalagem → unidade base"
-- (itens 90, 100, 101, 110, 112, 113, 114, 116, 120, 123, 138, 141 convertidos por
-- inteiro; compras em embalagem dos itens 94, 108, 111, 134, 136, 144). Backup local.
ALTER TABLE est_movimentacoes  ALTER COLUMN custo_unit      TYPE NUMERIC(14,6);
ALTER TABLE est_contagem_itens ALTER COLUMN custo_unit      TYPE NUMERIC(14,6);
ALTER TABLE cp_compra_itens    ALTER COLUMN preco_unit      TYPE NUMERIC(14,6);
ALTER TABLE cp_pedido_itens    ALTER COLUMN preco_combinado TYPE NUMERIC(14,6);
ALTER TABLE cp_pedido_itens    ALTER COLUMN preco_final     TYPE NUMERIC(14,6);

-- Renegociação do prazo de entrega no Recebimento: [{de, para, motivo, por, em}]
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS previsao_historico JSONB;

-- Apresentação de compra escolhida pelo comprador (ex.: { "nome": "Caixa 50 kg", "fator": 50 }).
-- Quantidades e preços continuam na unidade do insumo (kg, L, un); a apresentação
-- só diz em que embalagem pedir e como mostrar ("2 Caixa 50 kg (100 kg)").
ALTER TABLE cp_lote_itens   ADD COLUMN IF NOT EXISTS apresentacao JSONB;
ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS apresentacao JSONB;

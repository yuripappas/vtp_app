-- Cotação em 4 etapas: Rascunho → Em cotação → Aguardando aprovação → Aprovado · enviar
--  • 'cotacao': pedido enviado ao fornecedor pedindo preços; o comprador lança o
--    preço cotado de cada item (e o que o fornecedor não tem).
--  • 'devolvido': o supervisor devolveu para renegociar (fica na coluna Em cotação).
--  • 'aprovacao': uma só aprovação, no final, com valores reais.
-- Cada item guarda o preço de referência (último pago) e o cotado; preco_combinado
-- passa a ser o valor aprovado (o recebimento compara a nota com ele).
ALTER TABLE cp_pedidos DROP CONSTRAINT IF EXISTS cp_pedidos_status_check;
ALTER TABLE cp_pedidos ADD CONSTRAINT cp_pedidos_status_check
  CHECK (status IN ('montagem','cotacao','aprovacao','devolvido','aprovado','rascunho','solicitado','parcial','recebido','cancelado'));

ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS cotacao_enviada_por TEXT;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS cotacao_enviada_em  TIMESTAMPTZ;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS cotado_por          TEXT;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS cotado_em           TIMESTAMPTZ;
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS condicao_pagamento  TEXT;

ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS preco_referencia NUMERIC(14,6);
ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS preco_cotado     NUMERIC(14,6);
ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS indisponivel     BOOLEAN NOT NULL DEFAULT false;

-- Referência = o que estava estimado até agora
UPDATE cp_pedido_itens SET preco_referencia = preco_combinado WHERE preco_referencia IS NULL;

-- Pedidos no quadro antigo ainda sem preço cotado vão para "Em cotação"
UPDATE cp_pedidos SET status = 'cotacao', cotacao_enviada_em = COALESCE(aprovado_em, enviado_aprovacao_em, updated_at),
       cotacao_enviada_por = COALESCE(enviado_aprovacao_por, criado_por), atualizado_por = 'Sistema (cotação em 4 etapas)'
 WHERE excluido_em IS NULL AND status IN ('aprovacao', 'aprovado');

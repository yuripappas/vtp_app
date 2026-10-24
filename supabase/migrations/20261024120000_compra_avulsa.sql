-- Compra avulsa x recebimento de pedido
--  • Novo tipo 'compra_avulsa': entrada de uma compra lançada direto na aba Compras
--    (manual, XML ou nota lida pela IA). 'recebimento' fica só para o pedido da
--    cotação conferido no Recebimento.
--  • A entrada passa a ter o horário real em que foi registrada (antes era 12:00
--    do dia da nota). Corrige as que já existiam.
ALTER TABLE est_movimentacoes DROP CONSTRAINT IF EXISTS est_movimentacoes_tipo_check;
ALTER TABLE est_movimentacoes ADD CONSTRAINT est_movimentacoes_tipo_check
  CHECK (tipo IN ('recebimento','compra_avulsa','transferencia','entrada_manual','producao','baixa','ajuste_contagem'));

UPDATE est_movimentacoes m
   SET tipo = CASE WHEN c.origem = 'pedido' THEN 'recebimento' ELSE 'compra_avulsa' END,
       data_mov = m.created_at,
       atualizado_por = 'Sistema (horário real do registro)'
  FROM cp_compra_itens i JOIN cp_compras c ON c.id = i.compra_id
 WHERE m.ref_tipo = 'compra' AND m.ref_id = i.id::text;

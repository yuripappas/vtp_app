-- Itens de lista / lote / pedido podem ser tirados (desmarcados na lista,
-- cortados na aprovação, removidos do lote ou do pedido) sem DELETE:
-- a linha fica, com removido_em, e some das telas e das contas.
ALTER TABLE cp_lista_itens  ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ;
ALTER TABLE cp_lote_itens   ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ;
ALTER TABLE cp_pedido_itens ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ;

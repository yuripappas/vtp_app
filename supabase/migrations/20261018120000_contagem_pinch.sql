-- Contagem no modelo do Pinch
--  • tipo_id passa a ser 'cmv' (rodada do ciclo semanal) ou 'outras'
--    (categorias fora do CMV, só atualiza o saldo). categorias = escopo da 'outras'.
--  • Novo status 'aplicada': a contagem entrou no saldo. Na de CMV isso
--    acontece ao fechar o ciclo; 'concluida' = revisada, esperando o fechamento.
--  • pacotes: como o item foi contado ({"emb": 2, "avulso": 1.5, "fator": 12}).
--  • adicionado / removido_em: produto incluído ou tirado do card na hora da contagem.
ALTER TABLE est_contagens ADD COLUMN IF NOT EXISTS categorias TEXT[];
ALTER TABLE est_contagens DROP CONSTRAINT IF EXISTS est_contagens_status_check;
ALTER TABLE est_contagens ADD CONSTRAINT est_contagens_status_check
  CHECK (status IN ('pendente','andamento','revisao','concluida','aplicada','cancelada'));

ALTER TABLE est_contagem_itens ADD COLUMN IF NOT EXISTS pacotes JSONB;
ALTER TABLE est_contagem_itens ADD COLUMN IF NOT EXISTS adicionado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE est_contagem_itens ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ;
ALTER TABLE est_contagem_itens ADD COLUMN IF NOT EXISTS removido_por TEXT;

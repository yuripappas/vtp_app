-- F1: modo bot automático por conversa
-- F2: flag de intervenção humana necessária

ALTER TABLE atd_conversas
  ADD COLUMN IF NOT EXISTS bot_ativo          BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS precisa_humano     BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS humano_solicitado_em TIMESTAMPTZ;

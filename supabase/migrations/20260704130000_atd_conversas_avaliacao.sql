-- Adiciona campo de avaliação (1-5 estrelas) em atd_conversas
-- Preenchido pelo cliente ao encerrar a conversa (futuro módulo de avaliação)
-- Usado pelo filtro avançado do inbox

ALTER TABLE atd_conversas
  ADD COLUMN IF NOT EXISTS avaliacao SMALLINT CHECK (avaliacao BETWEEN 1 AND 5);

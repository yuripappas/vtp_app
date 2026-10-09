-- Adiciona campos de estatísticas Instagram em atd_contatos
-- Usados para exibir publicações/seguidores/seguindo no header do chat
-- e para o badge de influenciador (ig_followers >= 5000)

ALTER TABLE atd_contatos
  ADD COLUMN IF NOT EXISTS ig_followers  INTEGER,
  ADD COLUMN IF NOT EXISTS ig_following  INTEGER,
  ADD COLUMN IF NOT EXISTS ig_posts      INTEGER;

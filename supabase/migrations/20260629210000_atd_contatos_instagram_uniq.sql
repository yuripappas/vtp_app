-- Índice único em instagram_id, no mesmo padrão do telefone (necessário pro
-- upsert com ON CONFLICT no webhook do Instagram).
CREATE UNIQUE INDEX atd_contatos_instagram_id_uniq ON atd_contatos (instagram_id);

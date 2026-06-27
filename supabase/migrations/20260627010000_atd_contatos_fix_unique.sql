-- Corrige índice único de atd_contatos.telefone: estava parcial (WHERE telefone
-- IS NOT NULL), o que impede o Postgres de casar com "ON CONFLICT (telefone)"
-- usado pelo upsert do webhook-whatsapp. UNIQUE simples já permite múltiplos
-- NULL (Postgres não considera NULL = NULL), então não precisa de WHERE.

DROP INDEX IF EXISTS atd_contatos_telefone_uniq;
CREATE UNIQUE INDEX atd_contatos_telefone_uniq ON atd_contatos (telefone);

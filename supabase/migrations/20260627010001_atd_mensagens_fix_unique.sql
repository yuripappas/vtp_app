-- Mesmo problema do índice de atd_contatos: índice parcial não casa com
-- "ON CONFLICT (external_id)" usado pelo upsert do webhook-whatsapp.

DROP INDEX IF EXISTS atd_mensagens_external_id_uniq;
CREATE UNIQUE INDEX atd_mensagens_external_id_uniq ON atd_mensagens (external_id);

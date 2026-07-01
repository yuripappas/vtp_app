-- Contador de mensagens não lidas por conversa
ALTER TABLE atd_conversas ADD COLUMN IF NOT EXISTS mensagens_nao_lidas INTEGER NOT NULL DEFAULT 0;

-- Trigger: incrementa ao inserir mensagem do cliente
CREATE OR REPLACE FUNCTION atd_incrementar_nao_lidas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origem = 'cliente' AND NEW.visibilidade = 'publica' THEN
    UPDATE atd_conversas
    SET mensagens_nao_lidas = mensagens_nao_lidas + 1
    WHERE id = NEW.conversa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atd_nao_lidas ON atd_mensagens;
CREATE TRIGGER trg_atd_nao_lidas
  AFTER INSERT ON atd_mensagens
  FOR EACH ROW EXECUTE FUNCTION atd_incrementar_nao_lidas();

-- Corrige trigger: remover condição de visibilidade (webhook-whatsapp não seta o campo)
CREATE OR REPLACE FUNCTION atd_incrementar_nao_lidas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origem = 'cliente' THEN
    UPDATE atd_conversas
    SET mensagens_nao_lidas = mensagens_nao_lidas + 1
    WHERE id = NEW.conversa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

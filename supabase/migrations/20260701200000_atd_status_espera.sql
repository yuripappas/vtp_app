-- Expande status da conversa e adiciona timestamps de espera

-- 1. Remove o CHECK antigo e adiciona os novos valores
ALTER TABLE atd_conversas DROP CONSTRAINT IF EXISTS atd_conversas_status_check;
ALTER TABLE atd_conversas
  ADD CONSTRAINT atd_conversas_status_check
  CHECK (status IN ('aberta','em_atendimento','aguardando_cliente','concluida','expirada'));

-- 2. Campos de timestamp para calcular timers
ALTER TABLE atd_conversas
  ADD COLUMN IF NOT EXISTS ultima_msg_atendente_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_msg_cliente_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS primeira_resposta_em    TIMESTAMPTZ;

-- 3. Atualiza o trigger existente para registrar timestamps por origem
CREATE OR REPLACE FUNCTION atd_incrementar_nao_lidas()
RETURNS TRIGGER AS $$
DECLARE
  v_texto TEXT;
  v_preview TEXT;
BEGIN
  v_texto   := COALESCE(NEW.conteudo->>'texto', '');
  v_preview := CASE NEW.tipo
    WHEN 'imagem'      THEN '📷 Imagem'
    WHEN 'audio'       THEN '🎤 Áudio'
    WHEN 'video'       THEN '🎥 Vídeo'
    WHEN 'documento'   THEN '📄 Documento'
    WHEN 'localizacao' THEN '📍 Localização'
    WHEN 'sticker'     THEN '😊 Sticker'
    ELSE LEFT(v_texto, 80)
  END;

  -- Atualiza preview e timestamp geral
  UPDATE atd_conversas
  SET
    ultima_mensagem = jsonb_build_object(
      'texto',      v_preview,
      'origem',     NEW.origem,
      'enviado_em', NEW.enviado_em
    ),
    atualizado_em = COALESCE(NEW.enviado_em, NOW())
  WHERE id = NEW.conversa_id;

  -- Por origem: incrementa não-lidas do cliente e atualiza timestamps
  IF NEW.origem = 'cliente' THEN
    UPDATE atd_conversas
    SET
      mensagens_nao_lidas    = mensagens_nao_lidas + 1,
      ultima_msg_cliente_em  = COALESCE(NEW.enviado_em, NOW()),
      status = CASE
        WHEN status = 'aguardando_cliente' THEN 'em_atendimento'
        ELSE status
      END
    WHERE id = NEW.conversa_id;

  ELSIF NEW.origem = 'atendente' AND NEW.visibilidade = 'publica' THEN
    UPDATE atd_conversas
    SET
      ultima_msg_atendente_em = COALESCE(NEW.enviado_em, NOW()),
      primeira_resposta_em    = COALESCE(primeira_resposta_em, NEW.enviado_em, NOW()),
      status = CASE
        WHEN status IN ('aberta','em_atendimento') THEN 'aguardando_cliente'
        ELSE status
      END
    WHERE id = NEW.conversa_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

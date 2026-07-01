-- Guarda preview da última mensagem direto na conversa (evita query extra)
ALTER TABLE atd_conversas ADD COLUMN IF NOT EXISTS ultima_mensagem JSONB;

-- Atualiza trigger para também gravar preview da última mensagem
CREATE OR REPLACE FUNCTION atd_incrementar_nao_lidas()
RETURNS TRIGGER AS $$
DECLARE
  v_texto TEXT;
  v_preview TEXT;
BEGIN
  -- Extrai texto para preview
  v_texto  := COALESCE(NEW.conteudo->>'texto', '');
  v_preview := CASE NEW.tipo
    WHEN 'imagem'      THEN '📷 Imagem'
    WHEN 'audio'       THEN '🎤 Áudio'
    WHEN 'video'       THEN '🎥 Vídeo'
    WHEN 'documento'   THEN '📄 Documento'
    WHEN 'localizacao' THEN '📍 Localização'
    WHEN 'sticker'     THEN '😊 Sticker'
    ELSE LEFT(v_texto, 80)
  END;

  -- Atualiza preview e timestamp na conversa
  UPDATE atd_conversas
  SET
    ultima_mensagem = jsonb_build_object(
      'texto',   v_preview,
      'origem',  NEW.origem,
      'enviado_em', NEW.enviado_em
    ),
    atualizado_em = COALESCE(NEW.enviado_em, NOW())
  WHERE id = NEW.conversa_id;

  -- Incrementa não lidas apenas para mensagens do cliente
  IF NEW.origem = 'cliente' THEN
    UPDATE atd_conversas
    SET mensagens_nao_lidas = mensagens_nao_lidas + 1
    WHERE id = NEW.conversa_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

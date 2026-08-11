-- Função atômica para obter ou criar conversa no atendimento.
-- Evita race condition quando múltiplos webhooks chegam simultaneamente
-- para o mesmo contato (ex: burst de mensagens após reconexão do WhatsApp).
--
-- Lógica:
--   1. Busca conversa aberta existente (com FOR UPDATE para serializar)
--   2. Se não há aberta, reabre a mais recente com mensagens
--   3. Se não há nenhuma, cria conversa nova
--
-- Retorna o UUID da conversa.

CREATE OR REPLACE FUNCTION atd_obter_ou_criar_conversa(
  p_contato_id   UUID,
  p_canal_id     UUID,
  p_canal_tipo   TEXT
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Tenta encontrar conversa aberta já existente (lock para serializar concorrência)
  SELECT id INTO v_id
  FROM atd_conversas
  WHERE contato_id = p_contato_id
    AND canal_tipo = p_canal_tipo
    AND status IN ('aberta', 'em_atendimento', 'aguardando_cliente')
  ORDER BY atualizado_em DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Tenta reabrir a conversa mais recente que tem mensagens
  SELECT id INTO v_id
  FROM atd_conversas
  WHERE contato_id = p_contato_id
    AND canal_tipo = p_canal_tipo
    AND ultima_mensagem IS NOT NULL
  ORDER BY atualizado_em DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NOT NULL THEN
    UPDATE atd_conversas
    SET status = 'aberta', atendente_id = NULL, precisa_humano = FALSE
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Cria conversa nova
  INSERT INTO atd_conversas (contato_id, canal_id, canal_tipo, status)
  VALUES (p_contato_id, p_canal_id, p_canal_tipo, 'aberta')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

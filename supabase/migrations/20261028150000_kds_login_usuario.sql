-- ══════════════════════════════════════════════════════════════
-- KDS — quem opera é o usuário logado na plataforma
-- ══════════════════════════════════════════════════════════════
-- Regra: só entra no KDS quem tem login no app. Sai o login próprio do KDS
-- (nome + PIN, diarista) e o operador passa a ser o usuário do app — o
-- kds_operadores vira só o espelho dele (id do usuário + nome atual), para as
-- pizzas e jornadas continuarem apontando para uma linha do banco.

ALTER TABLE kds_operadores ADD COLUMN IF NOT EXISTS usuario_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS kds_operadores_usuario_idx ON kds_operadores (usuario_id);

DROP FUNCTION IF EXISTS kds_entrar(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS kds_operador_salvar(UUID, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT);
DROP TABLE IF EXISTS kds_operador_pin;
ALTER TABLE kds_operadores DROP COLUMN IF EXISTS diarista;

-- Abre a jornada do usuário neste posto (fecha a anterior, se houver).
-- Retorna { operador_id, jornada_id }.
CREATE OR REPLACE FUNCTION kds_entrar_usuario(p_usuario_id TEXT, p_nome TEXT, p_posto TEXT, p_dispositivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_op UUID; v_jornada UUID;
BEGIN
  IF coalesce(trim(p_usuario_id), '') = '' THEN RAISE EXCEPTION 'Usuário não informado'; END IF;

  INSERT INTO kds_operadores (usuario_id, nome, criado_por)
  VALUES (p_usuario_id, coalesce(nullif(trim(p_nome), ''), 'Usuário'), 'app')
  ON CONFLICT (usuario_id) DO UPDATE
    SET nome = coalesce(nullif(trim(EXCLUDED.nome), ''), kds_operadores.nome), ativo = true, updated_at = NOW()
  RETURNING id INTO v_op;

  UPDATE kds_jornadas SET fim = NOW() WHERE operador_id = v_op AND fim IS NULL;
  INSERT INTO kds_jornadas (operador_id, posto, dispositivo) VALUES (v_op, p_posto, p_dispositivo)
  RETURNING id INTO v_jornada;
  RETURN jsonb_build_object('operador_id', v_op, 'jornada_id', v_jornada);
END $$;

REVOKE ALL ON FUNCTION kds_entrar_usuario(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kds_entrar_usuario(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

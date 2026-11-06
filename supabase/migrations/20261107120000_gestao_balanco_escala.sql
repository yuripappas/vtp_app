-- ══════════════════════════════════════════════════════════════
-- Gestão › Balanço: escala Concluído · Parcial · Não realizado · N/A
-- ══════════════════════════════════════════════════════════════
-- Substitui o Sim/Não. Nota da rotina: Concluído 100, Parcial 50,
-- Não realizado 0; N/A fica fora da conta (calculado na tela).
-- Parcial, Não realizado e N/A exigem observação para fechar o balanço.
-- O critério de cada rotina (o que conta como Concluído) fica em
-- gestao_rotinas.descricao e vai para a foto da resposta, como o título.
-- Ainda não há balanço gravado em produção, então não há o que converter;
-- por segurança, 'sim' vira 'concluido'.

ALTER TABLE gestao_balanco_aval DROP CONSTRAINT IF EXISTS gestao_balanco_aval_resposta_check;
UPDATE gestao_balanco_aval SET resposta = 'concluido' WHERE resposta = 'sim';
ALTER TABLE gestao_balanco_aval
  ADD CONSTRAINT gestao_balanco_aval_resposta_check CHECK (resposta IN ('concluido','parcial','nao','na'));
ALTER TABLE gestao_balanco_aval ADD COLUMN IF NOT EXISTS rotina_criterio TEXT NOT NULL DEFAULT '';

-- resposta: 'concluido' | 'parcial' | 'nao' | 'na' | null (limpa)
CREATE OR REPLACE FUNCTION gestao_balanco_responder(
  p_usuario_id TEXT, p_balanco_id UUID, p_rotina_id UUID, p_resposta TEXT, p_observacao TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    TEXT := gestao_exigir_usuario(p_usuario_id);
  v_status TEXT;
  r        gestao_rotinas%ROWTYPE;
BEGIN
  SELECT status INTO v_status FROM gestao_balancos WHERE id = p_balanco_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Balanço não encontrado'; END IF;
  IF v_status = 'fechado' THEN RAISE EXCEPTION 'Balanço fechado não pode ser alterado'; END IF;
  SELECT * INTO r FROM gestao_rotinas WHERE id = p_rotina_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rotina não encontrada'; END IF;
  IF p_resposta IS NOT NULL AND p_resposta NOT IN ('concluido','parcial','nao','na') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;

  IF p_resposta IS NULL THEN
    DELETE FROM gestao_balanco_aval WHERE balanco_id = p_balanco_id AND rotina_id = p_rotina_id;
    RETURN;
  END IF;

  INSERT INTO gestao_balanco_aval (balanco_id, rotina_id, resposta, observacao, rotina_titulo, rotina_criterio, subarea_id, respondido_por, respondido_em)
  VALUES (p_balanco_id, p_rotina_id, p_resposta,
          CASE WHEN p_resposta = 'concluido' THEN '' ELSE coalesce(trim(p_observacao), '') END,
          r.titulo, r.descricao, r.subarea_id, v_uid, NOW())
  ON CONFLICT (balanco_id, rotina_id) DO UPDATE
     SET resposta = EXCLUDED.resposta, observacao = EXCLUDED.observacao, rotina_titulo = EXCLUDED.rotina_titulo,
         rotina_criterio = EXCLUDED.rotina_criterio, subarea_id = EXCLUDED.subarea_id,
         respondido_por = EXCLUDED.respondido_por, respondido_em = EXCLUDED.respondido_em;
END $$;

CREATE OR REPLACE FUNCTION gestao_balanco_fechar(p_usuario_id TEXT, p_balanco_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    TEXT := gestao_exigir_usuario(p_usuario_id);
  v_status TEXT;
  v_n      INTEGER;
BEGIN
  SELECT status INTO v_status FROM gestao_balancos WHERE id = p_balanco_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Balanço não encontrado'; END IF;
  IF v_status = 'fechado' THEN RAISE EXCEPTION 'Balanço já está fechado'; END IF;

  SELECT count(*) INTO v_n FROM gestao_rotinas r
   WHERE r.ativo AND NOT EXISTS (SELECT 1 FROM gestao_balanco_aval v WHERE v.balanco_id = p_balanco_id AND v.rotina_id = r.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Faltam % rotina% sem resposta', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END; END IF;

  SELECT count(*) INTO v_n FROM gestao_balanco_aval
   WHERE balanco_id = p_balanco_id AND resposta <> 'concluido' AND trim(observacao) = '';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Escreva a observação em % resposta% Parcial, Não realizado ou N/A', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END;
  END IF;

  -- Foto final do nome, do critério e da sub-área de cada rotina
  UPDATE gestao_balanco_aval v SET rotina_titulo = r.titulo, rotina_criterio = r.descricao, subarea_id = r.subarea_id
    FROM gestao_rotinas r WHERE v.balanco_id = p_balanco_id AND r.id = v.rotina_id;

  UPDATE gestao_balancos SET status = 'fechado', fechado_por = v_uid, fechado_em = NOW() WHERE id = p_balanco_id;
END $$;

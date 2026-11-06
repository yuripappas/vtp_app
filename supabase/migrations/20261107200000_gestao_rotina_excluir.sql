-- Gestão › Raio X: excluir uma rotina de vez. Diferente de desativar (olho),
-- que tira a rotina dos próximos meses mas mantém o histórico, excluir apaga
-- a rotina e TODAS as respostas dela, inclusive em meses já fechados — as
-- notas desses meses são recalculadas sem ela. Atividades que nasceram dela
-- continuam no Plano, só perdem a ligação com a rotina.
CREATE OR REPLACE FUNCTION gestao_rotina_excluir(p_usuario_id TEXT, p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM gestao_exigir_usuario(p_usuario_id);
  PERFORM 1 FROM gestao_rotinas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rotina não encontrada'; END IF;
  DELETE FROM gestao_balanco_aval WHERE rotina_id = p_id;
  UPDATE gestao_atividades SET rotina_origem_id = NULL WHERE rotina_origem_id = p_id;
  DELETE FROM gestao_rotinas WHERE id = p_id;
END $$;

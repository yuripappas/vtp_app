-- ══════════════════════════════════════════════════════════════
-- Testes do módulo Gestão v2 (funções gestao_*)
-- ══════════════════════════════════════════════════════════════
-- Não grava nada: tudo roda dentro de uma transação que termina com um erro
-- proposital "TESTES_OK: ..." (= tudo passou). Qualquer outro erro = falha.
--
-- Com a migration já aplicada:
--   supabase db query --linked -f scripts/gestao-testes.sql
-- Antes de aplicar (migration + testes na mesma transação, nada fica):
--   (echo 'BEGIN;'; cat supabase/migrations/20261106120000_gestao_v2.sql scripts/gestao-testes.sql) > /tmp/g.sql
--   supabase db query --linked -f /tmp/g.sql
-- Usa dois usuários ativos já cadastrados em vtp_users (só leitura).

BEGIN;

CREATE FUNCTION pg_temp.erro(p_sql TEXT, p_trecho TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU (esperava erro "%"): %', p_trecho, p_sql;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
  IF position(p_trecho IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FALHOU (esperava "%", veio "%"): %', p_trecho, SQLERRM, p_sql;
  END IF;
END $$;

CREATE FUNCTION pg_temp.ok(p_cond BOOLEAN, p_msg TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
END $$;

DO $$
DECLARE
  u1 TEXT; u2 TEXT;
  s_pes UUID; s_fin UUID; s_est UUID;
  a1 UUID; a2 UUID; f1 UUID; f2 UUID; pr UUID; pr2 UUID; r1 UUID; r2 UUID; b UUID; b2 UUID; x UUID;
  v_txt TEXT; n INT := 0;
  mes_atual DATE := date_trunc('month', gestao_hoje())::date;
BEGIN
  SELECT min(u->>'id'), max(u->>'id') INTO u1, u2
    FROM kv_store k, jsonb_array_elements(k.value) u
   WHERE k.key = 'vtp_users' AND coalesce(u->>'active', 'true') <> 'false';
  PERFORM pg_temp.ok(u1 IS NOT NULL, 'precisa de ao menos um usuário ativo em vtp_users');

  -- ── Sub-áreas ──
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_subareas) = 12, '12 sub-áreas pré-cadastradas');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_subareas WHERE area = 'ope') = 6, 'OPE tem 6 sub-áreas');
  SELECT id INTO s_pes FROM gestao_subareas WHERE nome = 'Pessoas';
  SELECT id INTO s_fin FROM gestao_subareas WHERE nome = 'Financeiro';
  SELECT id INTO s_est FROM gestao_subareas WHERE nome = 'Estoque';
  n := n + 3;

  -- ── Segurança ──
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename LIKE 'gestao\_%' AND cmd <> 'SELECT'), 'nenhuma policy de escrita');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
    WHERE s.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'gestao\_%' AND NOT c.relrowsecurity), 'RLS ligado em todas');
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'gestao_usuario_valido(text)', 'execute'), 'auxiliar fechado para anon');
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'gestao_links_validar(jsonb)', 'execute'), 'auxiliar de links fechado para anon');
  PERFORM pg_temp.ok(has_function_privilege('anon', 'gestao_atividade_salvar(text,uuid,jsonb)', 'execute'), 'RPC aberta para anon');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar('nao-existe-xyz', null, %L)$q$,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_pes)), 'Usuário inválido ou inativo');
  PERFORM pg_temp.erro($q$SELECT gestao_atividade_salvar('', null, '{}')$q$, 'Usuário inválido ou inativo');
  n := n + 7;

  -- ── Atividade: validações ──
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', '  ', 'subarea_id', s_pes)), 'Descreva a atividade');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x')), 'Escolha a sub-área');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', 'lixo')), 'Escolha a sub-área');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_pes, 'status', 'bloqueado')), 'Status inválido');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_pes, 'prioridade', 4)), 'Prioridade inválida');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_pes, 'resp_final_id', 'nao-existe-xyz')), 'Responsável inválido');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_pes, 'exec', jsonb_build_array(u1, 'nao-existe-xyz'))), 'Responsável de execução inválido');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, gen_random_uuid(), '{}')$q$, u1), 'Atividade não encontrada');
  n := n + 8;

  -- ── Atividade: criar e editar ──
  a1 := gestao_atividade_salvar(u1, null, jsonb_build_object('descritivo', '  Contratar pizzaiolo  ', 'subarea_id', s_pes));
  PERFORM pg_temp.ok((SELECT descritivo = 'Contratar pizzaiolo' AND status = 'a_fazer' AND prioridade = 3 AND criado_por = u1
    AND concluido_em IS NULL AND NOT arquivado FROM gestao_atividades WHERE id = a1), 'padrões da criação');
  PERFORM gestao_atividade_salvar(u1, a1, jsonb_build_object('prioridade', '1', 'prazo', '2026-12-01', 'resp_final_id', u2, 'observacao', 'urgente'));
  PERFORM pg_temp.ok((SELECT prioridade = 1 AND prazo = '2026-12-01' AND resp_final_id = u2 AND observacao = 'urgente'
    AND descritivo = 'Contratar pizzaiolo' FROM gestao_atividades WHERE id = a1), 'edição parcial mantém o resto');
  PERFORM gestao_atividade_salvar(u1, a1, jsonb_build_object('prazo', '', 'resp_final_id', ''));
  PERFORM pg_temp.ok((SELECT prazo IS NULL AND resp_final_id IS NULL FROM gestao_atividades WHERE id = a1), 'vazio limpa prazo e responsável');
  PERFORM gestao_atividade_salvar(u1, a1, '{"status":"concluido"}');
  PERFORM pg_temp.ok((SELECT concluido_em IS NOT NULL FROM gestao_atividades WHERE id = a1), 'concluir marca concluido_em');
  PERFORM gestao_atividade_salvar(u1, a1, '{"status":"em_andamento"}');
  PERFORM pg_temp.ok((SELECT concluido_em IS NULL FROM gestao_atividades WHERE id = a1), 'reabrir limpa concluido_em');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_atividade_hist WHERE atividade_id = a1 AND campo = 'status') = 2, 'histórico de status');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_atividade_hist WHERE atividade_id = a1 AND campo = 'criada') = 1, 'histórico de criação');
  a2 := gestao_atividade_salvar(u1, null, jsonb_build_object('descritivo', 'Outra', 'subarea_id', s_fin));
  PERFORM pg_temp.ok((SELECT posicao FROM gestao_atividades WHERE id = a2) > (SELECT posicao FROM gestao_atividades WHERE id = a1), 'nova vai para o fim');
  n := n + 8;

  -- ── Subtarefas e Resp. Execução ──
  PERFORM gestao_atividade_salvar(u1, a1, '{"prioridade":2}');
  f1 := gestao_atividade_salvar(u1, null, jsonb_build_object('parent_id', a1, 'descritivo', 'Anunciar vaga', 'subarea_id', s_est));
  PERFORM pg_temp.ok((SELECT subarea_id = s_pes AND prioridade = 2 AND parent_id = a1 FROM gestao_atividades WHERE id = f1),
    'subtarefa herda sub-área e prioridade da mãe');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('parent_id', f1, 'descritivo', 'neta')), 'Subtarefa não pode ter subtarefa');
  PERFORM gestao_atividade_salvar(u1, f1, jsonb_build_object('subarea_id', s_est));
  PERFORM pg_temp.ok((SELECT subarea_id = s_pes FROM gestao_atividades WHERE id = f1), 'subtarefa não troca de sub-área sozinha');
  PERFORM gestao_atividade_salvar(u1, a1, jsonb_build_object('subarea_id', s_fin));
  PERFORM pg_temp.ok((SELECT subarea_id = s_fin FROM gestao_atividades WHERE id = f1), 'subtarefa acompanha a mãe');
  PERFORM gestao_atividade_salvar(u1, f1, jsonb_build_object('exec', jsonb_build_array(u1, u2, u1)));
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_atividade_exec WHERE atividade_id = f1) = CASE WHEN u1 = u2 THEN 1 ELSE 2 END,
    'exec múltiplo na subtarefa, sem duplicar');
  PERFORM gestao_atividade_salvar(u1, f1, '{"exec":[]}');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM gestao_atividade_exec WHERE atividade_id = f1), 'exec [] limpa');
  PERFORM gestao_atividade_salvar(u1, f1, jsonb_build_object('exec', jsonb_build_array(u2)));
  PERFORM gestao_atividade_salvar(u1, f1, '{"status":"concluido"}');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM gestao_atividade_exec WHERE atividade_id = f1), 'salvar sem exec mantém exec');
  n := n + 7;

  -- ── Links de entrega ──
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_links(%L, %L, '[{"tipo":"link","titulo":"x","url":"javascript:alert(1)"}]')$q$, u1, a1), 'Link inválido em "x"');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_links(%L, %L, '[{"tipo":"link","url":"ftp://a.com"}]')$q$, u1, a1), 'Link inválido: use');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_links(%L, %L, '[{"tipo":"pdf","url":"https://a.com"}]')$q$, u1, a1), 'Tipo de link inválido');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_links(%L, gen_random_uuid(), '[]')$q$, u1), 'Atividade não encontrada');
  PERFORM gestao_atividade_links(u1, f1, '[{"tipo":"pasta","titulo":" Roteiro ","url":" https://drive.google.com/x "},{"tipo":"video","url":"https://youtu.be/y"}]');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_atividade_links WHERE atividade_id = f1) = 2, 'links salvos na subtarefa');
  PERFORM pg_temp.ok((SELECT titulo = 'Roteiro' AND url = 'https://drive.google.com/x' AND ordem = 0
    FROM gestao_atividade_links WHERE atividade_id = f1 AND tipo = 'pasta'), 'link limpo e na ordem');
  PERFORM gestao_atividade_links(u1, f1, '[{"tipo":"link","url":"https://a.com"}]');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_atividade_links WHERE atividade_id = f1) = 1, 'lista substitui a anterior');
  PERFORM gestao_atividade_links(u1, f1, null);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM gestao_atividade_links WHERE atividade_id = f1), 'null limpa os links');
  n := n + 8;

  -- ── Processos ──
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_salvar(%L, null, %L)$q$, u1, jsonb_build_object('subarea_id', s_est)), 'Dê um nome ao processo');
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_salvar(%L, null, %L)$q$, u1, jsonb_build_object('nome', 'x')), 'Escolha a sub-área');
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('nome', 'x', 'subarea_id', s_est, 'status', 'pronto')), 'Status inválido');
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('nome', 'x', 'subarea_id', s_est, 'recursos', '[{"tipo":"pasta","titulo":"POP","url":"www.a.com"}]'::jsonb)), 'Link inválido em "POP"');
  pr := gestao_processo_salvar(u1, null, jsonb_build_object('nome', 'Contagem semanal', 'subarea_id', s_est,
    'recursos', '[{"tipo":"pasta","titulo":"POP","url":"https://drive.google.com/p"},{"tipo":"video","titulo":"Vídeo","url":"https://youtu.be/v"}]'::jsonb));
  PERFORM pg_temp.ok((SELECT status = 'a_construir' FROM gestao_processos WHERE id = pr), 'processo nasce A construir');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_processo_rec WHERE processo_id = pr) = 2, 'recursos salvos');
  PERFORM gestao_processo_salvar(u1, pr, jsonb_build_object('status', 'implantado', 'responsavel_id', u2, 'revisado_em', '2026-11-01'));
  PERFORM pg_temp.ok((SELECT status = 'implantado' AND responsavel_id = u2 AND revisado_em = '2026-11-01' AND nome = 'Contagem semanal'
    FROM gestao_processos WHERE id = pr), 'edição parcial do processo');
  PERFORM pg_temp.ok((SELECT count(*) FROM gestao_processo_rec WHERE processo_id = pr) = 2, 'salvar sem recursos mantém os recursos');
  x := gestao_atividade_salvar(u1, null, jsonb_build_object('descritivo', 'Gravar vídeo do processo', 'subarea_id', s_est, 'processo_id', pr));
  PERFORM pg_temp.ok((SELECT processo_id = pr FROM gestao_atividades WHERE id = x), 'atividade ligada ao processo');
  pr2 := gestao_processo_salvar(u1, null, jsonb_build_object('nome', 'Descarte', 'subarea_id', s_est));
  PERFORM gestao_processo_arquivar(u1, pr2);
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_arquivar(%L, %L)$q$, u1, pr2), 'Processo não encontrado');
  PERFORM pg_temp.erro(format($q$SELECT gestao_processo_salvar(%L, %L, '{"nome":"y"}')$q$, u1, pr2), 'Processo não encontrado');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('descritivo', 'x', 'subarea_id', s_est, 'processo_id', pr2)), 'Processo não encontrado');
  n := n + 13;

  -- ── Rotinas ──
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_abrir(%L, %L)$q$, u1, mes_atual), 'Cadastre ao menos uma rotina');
  PERFORM pg_temp.erro(format($q$SELECT gestao_rotina_salvar(%L, null, %L)$q$, u1, jsonb_build_object('subarea_id', s_est)), 'Descreva a rotina');
  PERFORM pg_temp.erro(format($q$SELECT gestao_rotina_salvar(%L, null, %L)$q$, u1, jsonb_build_object('titulo', 'x')), 'Escolha a sub-área');
  r1 := gestao_rotina_salvar(u1, null, jsonb_build_object('subarea_id', s_est, 'titulo', 'Contagem feita antes das 17h', 'processo_id', pr));
  r2 := gestao_rotina_salvar(u1, null, jsonb_build_object('subarea_id', s_fin, 'titulo', 'Conciliação semanal'));
  x  := gestao_rotina_salvar(u1, null, jsonb_build_object('subarea_id', s_fin, 'titulo', 'Rotina desativada'));
  PERFORM gestao_rotina_salvar(u1, x, '{"ativo":false}');
  PERFORM pg_temp.ok((SELECT NOT ativo AND titulo = 'Rotina desativada' FROM gestao_rotinas WHERE id = x), 'desativar rotina');
  n := n + 4;

  -- ── Balanço ──
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_abrir(%L, %L)$q$, u1, (mes_atual + interval '1 month')::date), 'mês futuro');
  b := gestao_balanco_abrir(u1, (mes_atual + 14));
  PERFORM pg_temp.ok((SELECT mes = mes_atual AND status = 'rascunho' FROM gestao_balancos WHERE id = b), 'mês normalizado para o dia 1');
  PERFORM pg_temp.ok(gestao_balanco_abrir(u1, mes_atual) = b, 'abrir é idempotente');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_responder(%L, %L, %L, 'na')$q$, u1, b, r1), 'Resposta inválida');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_responder(%L, %L, gen_random_uuid(), 'sim')$q$, u1, b), 'Rotina não encontrada');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_responder(%L, gen_random_uuid(), %L, 'sim')$q$, u1, r1), 'Balanço não encontrado');
  PERFORM gestao_balanco_responder(u1, b, r1, 'nao', null);
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_fechar(%L, %L)$q$, u1, b), 'Faltam 1 rotina sem resposta');
  PERFORM gestao_balanco_responder(u1, b, r2, 'sim', 'ignorada');
  PERFORM pg_temp.ok((SELECT observacao = '' FROM gestao_balanco_aval WHERE balanco_id = b AND rotina_id = r2), 'Sim não guarda observação');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_fechar(%L, %L)$q$, u1, b), 'Escreva o que aconteceu em 1 resposta "Não"');
  PERFORM gestao_balanco_responder(u1, b, r2, null);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM gestao_balanco_aval WHERE balanco_id = b AND rotina_id = r2), 'null limpa a resposta');
  PERFORM gestao_balanco_responder(u1, b, r2, 'sim');
  PERFORM gestao_balanco_responder(u1, b, r1, 'nao', '  Contagem saiu às 18h  ');
  PERFORM pg_temp.ok((SELECT observacao = 'Contagem saiu às 18h' AND rotina_titulo = 'Contagem feita antes das 17h' AND subarea_id = s_est
    AND respondido_por = u1 FROM gestao_balanco_aval WHERE balanco_id = b AND rotina_id = r1), 'Não com observação e foto da rotina');
  -- atividade criada a partir do "Não"
  x := gestao_atividade_salvar(u1, null, jsonb_build_object('descritivo', 'Corrigir: contagem', 'subarea_id', s_est,
    'rotina_origem_id', r1, 'balanco_origem_id', b));
  PERFORM pg_temp.ok((SELECT rotina_origem_id = r1 AND balanco_origem_id = b FROM gestao_atividades WHERE id = x), 'atividade nasce do balanço');
  PERFORM gestao_rotina_salvar(u1, r1, '{"titulo":"Contagem antes das 17h (renomeada)"}');
  PERFORM gestao_balanco_fechar(u1, b);
  PERFORM pg_temp.ok((SELECT status = 'fechado' AND fechado_por = u1 AND fechado_em IS NOT NULL FROM gestao_balancos WHERE id = b), 'balanço fechado');
  PERFORM pg_temp.ok((SELECT rotina_titulo = 'Contagem antes das 17h (renomeada)' FROM gestao_balanco_aval WHERE balanco_id = b AND rotina_id = r1),
    'fechar tira a foto final da rotina');
  PERFORM gestao_rotina_salvar(u1, r1, '{"titulo":"Renomeada depois"}');
  PERFORM pg_temp.ok((SELECT rotina_titulo = 'Contagem antes das 17h (renomeada)' FROM gestao_balanco_aval WHERE balanco_id = b AND rotina_id = r1),
    'histórico não muda depois de fechado');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_responder(%L, %L, %L, 'sim')$q$, u1, b, r1), 'Balanço fechado não pode ser alterado');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_responder(%L, %L, %L, null)$q$, u1, b, r1), 'Balanço fechado não pode ser alterado');
  PERFORM pg_temp.erro(format($q$SELECT gestao_balanco_fechar(%L, %L)$q$, u1, b), 'Balanço já está fechado');
  b2 := gestao_balanco_abrir(u1, (mes_atual - interval '1 month')::date);
  PERFORM pg_temp.ok(b2 <> b, 'mês anterior é outro balanço');
  n := n + 22;

  -- ── Arquivar ──
  PERFORM gestao_atividade_arquivar(u1, a1);
  PERFORM pg_temp.ok((SELECT bool_and(arquivado) FROM gestao_atividades WHERE id IN (a1, f1)), 'arquivar leva as subtarefas');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, %L, '{"status":"concluido"}')$q$, u1, f1), 'Atividade não encontrada');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_arquivar(%L, %L)$q$, u1, a1), 'Atividade não encontrada');
  PERFORM pg_temp.erro(format($q$SELECT gestao_atividade_salvar(%L, null, %L)$q$, u1,
    jsonb_build_object('parent_id', a1, 'descritivo', 'filha de arquivada')), 'Atividade não encontrada');
  n := n + 4;

  RAISE EXCEPTION 'TESTES_OK: % verificações passaram (nada foi gravado)', n;
END $$;

ROLLBACK;

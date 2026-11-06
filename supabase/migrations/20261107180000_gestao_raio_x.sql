-- Gestão: a aba "Balanço" passou a se chamar "Raio X". Só as mensagens que
-- aparecem para o usuário mudam; tabelas e funções seguem com o nome balanco.
-- Reescreve as mensagens nas funções que já existem (sem mudar a lógica).
DO $$
DECLARE f TEXT; v_def TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'gestao_atividade_salvar(text,uuid,jsonb)',
    'gestao_balanco_abrir(text,date)',
    'gestao_balanco_responder(text,uuid,uuid,text,text)',
    'gestao_balanco_fechar(text,uuid)'] LOOP
    v_def := pg_get_functiondef(f::regprocedure);
    v_def := replace(v_def, '''Balanço não encontrado''',                 '''Raio X não encontrado''');
    v_def := replace(v_def, '''Balanço fechado não pode ser alterado''',  '''Raio X fechado não pode ser alterado''');
    v_def := replace(v_def, '''Balanço já está fechado''',                '''Raio X já está fechado''');
    v_def := replace(v_def, '''Não dá para abrir balanço de mês futuro''', '''Não dá para abrir Raio X de mês futuro''');
    EXECUTE v_def;
  END LOOP;
END $$;

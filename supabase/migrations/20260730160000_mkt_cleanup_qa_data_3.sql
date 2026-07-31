-- Limpeza dos dados de QA usados para validar o fluxo de revisão de conteúdo
-- (filtro com contagem + modal lado a lado + thread de observações).
DELETE FROM mkt_creator_content_notas WHERE content_id IN (SELECT id FROM mkt_creator_content WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Revisao Teste'));
DELETE FROM mkt_creator_content       WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Revisao Teste');
DELETE FROM mkt_creators              WHERE nome = 'QA Revisao Teste';

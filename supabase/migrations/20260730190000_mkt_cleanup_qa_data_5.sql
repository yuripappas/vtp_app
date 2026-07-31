-- Limpeza dos dados de QA usados para validar kit de boas-vindas, embaixador,
-- campanhas, cupom pessoal (preço de clube) e resgate de pontos.
DELETE FROM mkt_creator_resgates             WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Clube Teste');
DELETE FROM mkt_creator_campanhas_embaixador WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Clube Teste');
DELETE FROM mkt_creator_points               WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Clube Teste');
DELETE FROM mkt_creator_coupons              WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Clube Teste');
DELETE FROM mkt_creator_sessions             WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'QA Clube Teste');
DELETE FROM mkt_creator_otp_codes            WHERE telefone = '82944443333';
DELETE FROM mkt_creators                     WHERE nome = 'QA Clube Teste';

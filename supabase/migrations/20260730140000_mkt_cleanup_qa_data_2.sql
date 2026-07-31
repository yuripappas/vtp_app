-- Limpeza dos dados de QA usados para validar seja-criador.html e
-- painel-criador.html (captação pública + login OTP + envio de conteúdo).
DELETE FROM mkt_creator_sessions   WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome IN ('QA Landing Teste', 'QA Portal Teste'));
DELETE FROM mkt_creator_content    WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome IN ('QA Landing Teste', 'QA Portal Teste'));
DELETE FROM mkt_creator_otp_codes  WHERE telefone IN ('82977776666', '82966665555');
DELETE FROM mkt_creators           WHERE nome IN ('QA Landing Teste', 'QA Portal Teste');

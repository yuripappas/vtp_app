-- Limpeza dos dados de QA usados para validar o módulo Marketing em produção
-- (cadastro de teste, cupom de teste, venda manual de teste e o pontos gerados
-- pela trigger). Ordem respeita as FKs.
DELETE FROM mkt_creator_points   WHERE creator_id IN (SELECT id FROM mkt_creators WHERE nome = 'Teste Criador QA');
DELETE FROM mkt_creator_redemptions WHERE pedido_id = 'TESTE-QA-001';
DELETE FROM mkt_creator_coupons  WHERE codigo = '4R3F75P3';
DELETE FROM mkt_creators         WHERE nome = 'Teste Criador QA';

-- Nota: o arquivo teste.png enviado ao bucket mkt-midias durante a validação
-- não pôde ser removido aqui — Supabase bloqueia DELETE direto em storage.objects
-- mesmo via migration ("Use the Storage API instead"), e não há policy de DELETE
-- pública nesse bucket (só INSERT/SELECT, decisão deliberada). É um PNG de 4 bytes
-- sem dado sensível — fica como resíduo inofensivo, removível manualmente pelo
-- dashboard do Supabase se quiser.

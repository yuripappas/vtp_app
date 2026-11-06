-- Gestão: a permissão única 'Gestão' vira uma por aba
-- ('Gestão: Plano de Ação', 'Gestão: Raio X', 'Gestão: Processos').
-- Feito aqui, e não no carregamento do app, porque a lista de usuários do
-- navegador pode estar desatualizada no início (foi por isso que a migração
-- de 05/11 não chegou aos gestores com permissões individuais).
--  • Perfis de acesso (vtp_perms) que tinham 'Gestão' ganham as três abas.
--  • Usuários com permissões individuais: quem tinha 'Gestão' ou é Gestor
--    ganha as três (era a regra de 05/11: Gestor tem acesso à Gestão).
-- Idempotente.
DO $$
DECLARE abas JSONB := '["Gestão: Plano de Ação","Gestão: Raio X","Gestão: Processos"]';
BEGIN
  UPDATE kv_store k SET updated_at = NOW(), value = (
    SELECT jsonb_object_agg(p.key,
      CASE WHEN jsonb_typeof(p.value->'perms') = 'array' AND (p.value->'perms') ? 'Gestão'
           THEN jsonb_set(p.value, '{perms}', ((p.value->'perms') - 'Gestão') ||
                (SELECT coalesce(jsonb_agg(a), '[]') FROM jsonb_array_elements_text(abas) a WHERE NOT (p.value->'perms') ? a))
           ELSE p.value END)
    FROM jsonb_each(k.value) p)
  WHERE k.key = 'vtp_perms' AND jsonb_typeof(k.value) = 'object';

  UPDATE kv_store k SET updated_at = NOW(), value = (
    SELECT jsonb_agg(
      CASE WHEN jsonb_typeof(u->'perms') = 'array' AND ((u->'perms') ? 'Gestão' OR u->>'role' = 'gerente')
           THEN jsonb_set(u, '{perms}', ((u->'perms') - 'Gestão') ||
                (SELECT coalesce(jsonb_agg(a), '[]') FROM jsonb_array_elements_text(abas) a WHERE NOT (u->'perms') ? a))
           ELSE u END ORDER BY n)
    FROM jsonb_array_elements(k.value) WITH ORDINALITY AS t(u, n))
  WHERE k.key = 'vtp_users' AND jsonb_typeof(k.value) = 'array';
END $$;

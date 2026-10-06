-- Segredos internos usados só pra autenticar chamadas do pg_cron às Edge
-- Functions que não podem exigir JWT do Supabase (pg_cron não manda um).
-- O valor do segredo é inserido à parte (fora de migration, fora do git) —
-- este arquivo só cria a estrutura. RLS habilitado sem policies: só
-- service_role (Edge Functions) e o role que roda o pg_cron enxergam isto.
create table if not exists atd_cron_tokens (
  job_name  text primary key,
  secret    text not null,
  criado_em timestamptz not null default now()
);

alter table atd_cron_tokens enable row level security;
-- Sem policies de propósito — bloqueado para anon/authenticated.

comment on table atd_cron_tokens is
  'Segredos compartilhados entre pg_cron e Edge Functions próprias (ex: ig-token-refresh). Valores inseridos manualmente via SQL, nunca versionados.';

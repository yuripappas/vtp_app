-- Tabela de tokens OAuth de integrações (Instagram, e futuramente outras).
-- Diferente de atd_canais (que tem RLS aberto pro app ler/escrever config não
-- sensível), esta tabela NÃO tem nenhuma policy — com RLS habilitado e zero
-- policies, anon/authenticated não enxergam nada; só o service_role (usado
-- pelas Edge Functions) consegue ler/escrever, porque service_role sempre
-- bypassa RLS. Guardamos o access_token aqui em vez de só no secret
-- INSTAGRAM_USER_ACCESS_TOKEN pra permitir rotação automática via function
-- agendada (ig-token-refresh) sem precisar de Management API / token de conta.
create table if not exists atd_tokens_oauth (
  provider      text primary key,
  access_token  text not null,
  token_type    text default 'bearer',
  expires_at    timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table atd_tokens_oauth enable row level security;
-- Sem policies de propósito — bloqueado para anon/authenticated.

comment on table atd_tokens_oauth is
  'Tokens OAuth de integrações externas, acessível só via service_role (Edge Functions). Renovado automaticamente pela function ig-token-refresh (ver cron em 20261006120100_ig_token_refresh_cron.sql).';

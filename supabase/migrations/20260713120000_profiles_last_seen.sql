-- Tabela de presença dos atendentes no módulo Omnichannel
-- Usa o sistema de usuários VTP (vtp_users), não Supabase Auth

CREATE TABLE IF NOT EXISTS atd_presenca (
  user_id   TEXT PRIMARY KEY,   -- id do usuário VTP
  nome      TEXT NOT NULL,
  role      TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sem RLS — dados de presença são públicos para todos os atendentes
ALTER TABLE atd_presenca DISABLE ROW LEVEL SECURITY;

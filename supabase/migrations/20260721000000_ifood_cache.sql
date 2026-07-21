-- Cache de tokens e configurações do iFood
-- Evita chamar o endpoint de auth a cada request (token expira em 6h)

CREATE TABLE IF NOT EXISTS ifood_cache (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  expires_at TIMESTAMPTZ
);

-- Apenas a service_role pode ler/escrever (Edge Functions usam service_role)
ALTER TABLE ifood_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full" ON ifood_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

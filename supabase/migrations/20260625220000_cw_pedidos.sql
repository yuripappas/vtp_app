-- VTP Compras — Histórico de pedidos do Cardápio Web
-- Persistido por uma Edge Function (cw-sync) rodando via pg_cron, para permitir:
--  - histórico além das 8h que a API do CW permite consultar via polling
--  - cálculo real de tempo de preparo/entrega (timestamps de cada transição de status)
--  - filtro por data no dashboard de performance

CREATE TABLE IF NOT EXISTS cw_pedidos (
  id               BIGINT PRIMARY KEY,        -- id do pedido no Cardápio Web
  display_id       INTEGER,
  merchant_id      INTEGER,
  status           TEXT NOT NULL,             -- status atual (bruto, da API CW)
  order_type       TEXT,                      -- delivery | takeout | onsite | closed_table
  order_timing     TEXT,                      -- immediate | scheduled
  sales_channel    TEXT,                      -- ifood | food99 | catalog | portal | ...
  total            NUMERIC NOT NULL DEFAULT 0,
  pizzas_grande    NUMERIC NOT NULL DEFAULT 0,
  pizzas_pequena   NUMERIC NOT NULL DEFAULT 0,
  items            JSONB,                     -- itens completos do pedido (cruzamento futuro com insumos)
  status_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "confirmed": "2026-...", "ready": "...", ... }
  cw_created_at    TIMESTAMPTZ NOT NULL,       -- created_at vindo da API CW
  cw_updated_at    TIMESTAMPTZ NOT NULL,       -- updated_at vindo da API CW (usado p/ detectar mudanças)
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() -- última vez que o cw-sync gravou esta linha
);

CREATE INDEX IF NOT EXISTS cw_pedidos_created_idx ON cw_pedidos (cw_created_at DESC);
CREATE INDEX IF NOT EXISTS cw_pedidos_status_idx  ON cw_pedidos (status);

-- RLS: leitura liberada para o dashboard (via anon key).
-- Escrita só pela Edge Function (service_role bypassa RLS) — sem política de
-- INSERT/UPDATE para anon, então o frontend nunca consegue alterar os dados.
ALTER TABLE cw_pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_cw_pedidos" ON cw_pedidos FOR SELECT USING (true);

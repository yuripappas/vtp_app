-- VTP Compras — Supabase schema
-- Armazenamento key-value: substitui localStorage com dados compartilhados
-- Cada "chave" = uma entidade da plataforma (vtp_items, vtp_users, etc.)

CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para queries por updated_at (sync incremental futuro)
CREATE INDEX IF NOT EXISTS kv_store_updated_at_idx ON kv_store (updated_at DESC);

-- RLS: todos os usuários autenticados (via anon key) podem ler e escrever
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read"  ON kv_store FOR SELECT USING (true);
CREATE POLICY "anon_write" ON kv_store FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON kv_store FOR UPDATE USING (true);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_kv_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kv_store_updated_at
  BEFORE UPDATE ON kv_store
  FOR EACH ROW EXECUTE FUNCTION update_kv_timestamp();

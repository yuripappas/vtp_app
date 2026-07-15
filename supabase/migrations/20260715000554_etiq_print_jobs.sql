-- Fila de impressão da Etiquetagem: qualquer navegador grava o job aqui,
-- e o agente ligado na Zebra ZD220 (print-agent/) escuta via Realtime e imprime.
-- RLS aberta pra anon — mesmo padrão já usado em kv_store e nas tabelas atd_*
-- (app single-tenant, sem Supabase Auth real ainda).

CREATE TABLE etiq_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zpl TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'imprimindo' | 'impresso' | 'erro'
  erro_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  printed_at TIMESTAMPTZ
);

ALTER TABLE etiq_print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_etiq_print_jobs"   ON etiq_print_jobs FOR SELECT USING (true);
CREATE POLICY "anon_write_etiq_print_jobs"  ON etiq_print_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_etiq_print_jobs" ON etiq_print_jobs FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE etiq_print_jobs;

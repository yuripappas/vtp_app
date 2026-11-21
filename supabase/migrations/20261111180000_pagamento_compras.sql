-- Pagamento negociado: forma + condição + parcelas.
--  • cp_pedidos.pagamento: o combinado na cotação { forma, condicao, n, intervalo, dias, primeiro, parcelas:[{venc, valor}] }
--  • cp_compras.pagamento: o que valeu no recebimento / compra (nota manda: duplicatas do XML)
--  • cp_compra_parcelas: uma linha por parcela da compra confirmada (conta a pagar),
--    base para o futuro módulo financeiro / fluxo de caixa.
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS pagamento JSONB;
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS pagamento JSONB;

CREATE TABLE IF NOT EXISTS cp_compra_parcelas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id       UUID NOT NULL REFERENCES cp_compras(id) ON DELETE RESTRICT,
  numero          INTEGER NOT NULL,
  total_parcelas  INTEGER NOT NULL,
  vencimento      DATE NOT NULL,
  valor           NUMERIC(14,2) NOT NULL,
  forma           TEXT,
  fornecedor_id   INTEGER,
  fornecedor_nome TEXT,
  numero_nota     TEXT,
  status          TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  pago_em         TIMESTAMPTZ,
  pago_por        TEXT,
  criado_por      TEXT,
  atualizado_por  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_compra_parcelas_venc_idx ON cp_compra_parcelas (vencimento);
CREATE INDEX IF NOT EXISTS cp_compra_parcelas_compra_idx ON cp_compra_parcelas (compra_id);

DROP TRIGGER IF EXISTS cp_compra_parcelas_touch ON cp_compra_parcelas;
CREATE TRIGGER cp_compra_parcelas_touch BEFORE UPDATE ON cp_compra_parcelas FOR EACH ROW EXECUTE FUNCTION est_touch_updated_at();
DROP TRIGGER IF EXISTS cp_compra_parcelas_log ON cp_compra_parcelas;
CREATE TRIGGER cp_compra_parcelas_log AFTER INSERT OR UPDATE ON cp_compra_parcelas FOR EACH ROW EXECUTE FUNCTION est_registrar_log();
DROP TRIGGER IF EXISTS cp_compra_parcelas_nodelete ON cp_compra_parcelas;
CREATE TRIGGER cp_compra_parcelas_nodelete BEFORE DELETE ON cp_compra_parcelas FOR EACH ROW EXECUTE FUNCTION est_bloquear_delete();
ALTER TABLE cp_compra_parcelas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_cp_compra_parcelas" ON cp_compra_parcelas;
CREATE POLICY "anon_read_cp_compra_parcelas" ON cp_compra_parcelas FOR SELECT USING (true);
DROP POLICY IF EXISTS "anon_insert_cp_compra_parcelas" ON cp_compra_parcelas;
CREATE POLICY "anon_insert_cp_compra_parcelas" ON cp_compra_parcelas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cp_compra_parcelas" ON cp_compra_parcelas;
CREATE POLICY "anon_update_cp_compra_parcelas" ON cp_compra_parcelas FOR UPDATE USING (true);

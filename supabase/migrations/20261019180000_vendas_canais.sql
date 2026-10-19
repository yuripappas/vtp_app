-- Vendas por canal: valores do pedido que o Cardápio Web manda e não eram
-- guardados (taxas, descontos com quem pagou, formas de pagamento) e os
-- repasses semanais dos marketplaces (estimado × pago no extrato oficial).
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS delivery_fee        NUMERIC(14,2);
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS driver_fee          NUMERIC(14,2);
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS service_fee         NUMERIC(14,2);
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS additional_fee      NUMERIC(14,2);
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS delivered_by        TEXT;
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS discounts           JSONB;
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS payments            JSONB;
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS external_display_id TEXT;
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS financeiro_em       TIMESTAMPTZ; -- quando esses campos foram lidos

-- Um repasse = uma semana (seg–dom) de um canal, pago numa data (ex.: quarta seguinte)
CREATE TABLE IF NOT EXISTS vd_repasses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal           TEXT NOT NULL,
  semana_inicio   DATE NOT NULL,
  semana_fim      DATE NOT NULL,
  data_repasse    DATE NOT NULL,
  valor_estimado  NUMERIC(14,2),
  valor_pago      NUMERIC(14,2),
  extrato         JSONB,          -- linhas lidas do extrato oficial (quando importado)
  arquivo_path    TEXT,
  obs             TEXT,
  criado_por      TEXT NOT NULL,
  atualizado_por  TEXT,
  excluido_em     TIMESTAMPTZ,
  excluido_por    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS vd_repasses_semana ON vd_repasses (canal, semana_inicio) WHERE excluido_em IS NULL;

DO $$
DECLARE t TEXT := 'vd_repasses';
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
  EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION est_touch_updated_at()', t, t);
  EXECUTE format('DROP TRIGGER IF EXISTS %I_log ON %I', t, t);
  EXECUTE format('CREATE TRIGGER %I_log AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION est_registrar_log()', t, t);
  EXECUTE format('DROP TRIGGER IF EXISTS %I_nodelete ON %I', t, t);
  EXECUTE format('CREATE TRIGGER %I_nodelete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION est_bloquear_delete()', t, t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_read_%s" ON %I', t, t);
  EXECUTE format('CREATE POLICY "anon_read_%s" ON %I FOR SELECT USING (true)', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I', t, t);
  EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT WITH CHECK (true)', t, t);
  EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I', t, t);
  EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE USING (true)', t, t);
END $$;

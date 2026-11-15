-- Pré-produção (módulo próprio) + requisição de insumos (estoque trancado)
--
--  • pp_ordens / pp_ordem_itens: ordem de produção com vários itens. Cada item é
--    'preparar' (receita: consome insumos pela ficha e dá entrada no processado)
--    ou 'porcionar' (só registra porções; não mexe no estoque).
--    Status da ordem: a_fazer → em_producao → concluida (ou cancelada).
--  • est_requisicoes / est_requisicao_itens: pedido de insumos ao estoque.
--    Nasce da ordem (destino Cozinha Produção) ou avulsa (ex.: Cozinha
--    Finalização para a mise en place). Quem atende (permissão
--    "Estoque: Atender requisições") faz a TRANSFERÊNCIA do local de guarda para
--    o local de destino — est_movimentacoes tipo 'transferencia',
--    ref_tipo 'requisicao', ref_id = est_requisicao_itens.id.
--  • Novo tipo de movimentação 'consumo_producao': insumo usado na ordem
--    (sai do local da cozinha), ref_tipo 'ordem_producao'.

ALTER TABLE est_movimentacoes DROP CONSTRAINT IF EXISTS est_movimentacoes_tipo_check;
ALTER TABLE est_movimentacoes ADD CONSTRAINT est_movimentacoes_tipo_check
  CHECK (tipo IN ('recebimento','compra_avulsa','transferencia','entrada_manual','producao','baixa','ajuste_contagem','consumo_producao'));

CREATE TABLE IF NOT EXISTS pp_ordens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           BIGINT GENERATED ALWAYS AS IDENTITY,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer','em_producao','concluida','cancelada')),
  obs              TEXT,
  iniciado_em      TIMESTAMPTZ,
  iniciado_por     TEXT,
  concluido_em     TIMESTAMPTZ,
  cancelado_motivo TEXT,
  criado_por       TEXT,
  atualizado_por   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pp_ordens_data_idx ON pp_ordens (data DESC);

CREATE TABLE IF NOT EXISTS pp_ordem_itens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id        UUID NOT NULL REFERENCES pp_ordens(id) ON DELETE RESTRICT,
  item_id         INTEGER NOT NULL,
  item_nome       TEXT NOT NULL,
  unidade         TEXT,
  tipo            TEXT NOT NULL DEFAULT 'preparar' CHECK (tipo IN ('preparar','porcionar')),
  qtd_plan        NUMERIC(14,4) NOT NULL,
  qtd_real        NUMERIC(14,4),
  peso_porcao     NUMERIC(14,4),
  porcoes         INTEGER,
  rendimento_pct  NUMERIC(8,2),
  consumo         JSONB,          -- [{item_id, nome, unidade, qtd_ficha, qtd}]
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluido','cancelado')),
  obs             TEXT,
  concluido_em    TIMESTAMPTZ,
  concluido_por   TEXT,
  ordem_pos       INTEGER NOT NULL DEFAULT 0,
  criado_por      TEXT,
  atualizado_por  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pp_ordem_itens_ordem_idx ON pp_ordem_itens (ordem_id);

CREATE TABLE IF NOT EXISTS est_requisicoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           BIGINT GENERATED ALWAYS AS IDENTITY,
  origem           TEXT NOT NULL DEFAULT 'avulsa' CHECK (origem IN ('ordem','avulsa')),
  ordem_id         UUID REFERENCES pp_ordens(id) ON DELETE RESTRICT,
  destino          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','entregue','cancelada')),
  obs              TEXT,
  atendido_em      TIMESTAMPTZ,
  atendido_por     TEXT,
  cancelado_motivo TEXT,
  criado_por       TEXT,
  atualizado_por   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS est_requisicoes_status_idx ON est_requisicoes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS est_requisicoes_ordem_idx ON est_requisicoes (ordem_id);

CREATE TABLE IF NOT EXISTS est_requisicao_itens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id   UUID NOT NULL REFERENCES est_requisicoes(id) ON DELETE RESTRICT,
  item_id         INTEGER NOT NULL,
  item_nome       TEXT NOT NULL,
  unidade         TEXT,
  qtd_pedida      NUMERIC(14,4) NOT NULL,
  qtd_entregue    NUMERIC(14,4),
  local_origem    TEXT,
  local_destino   TEXT,
  criado_por      TEXT,
  atualizado_por  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS est_requisicao_itens_req_idx ON est_requisicao_itens (requisicao_id);

-- Triggers (updated_at, log, sem delete) e RLS — mesmo modelo das tabelas cp_*
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pp_ordens','pp_ordem_itens','est_requisicoes','est_requisicao_itens'] LOOP
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
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Módulo de Compras (novo) — compras, listas, cotação, pedidos
-- ══════════════════════════════════════════════════════════════
-- Mesmo padrão do estoque (20261010120000_estoque_ciclos.sql):
--  • fora do kv_store, uma linha por registro
--  • sem DELETE (policy ausente + trigger) — "excluir" = excluido_em/por
--  • log automático em est_log (reaproveita est_registrar_log)
-- Fornecedores continuam no kv_store (vtp_suppliers, id inteiro).
-- A entrada no estoque é uma est_movimentacoes tipo 'recebimento'
-- (ref_tipo 'compra', ref_id = cp_compra_itens.id).

-- ── Compras (notas / compras avulsas / recebimentos confirmados) ──
CREATE TABLE IF NOT EXISTS cp_compras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_compra     DATE NOT NULL,
  fornecedor_id   INTEGER,
  fornecedor_nome TEXT,
  fornecedor_doc  TEXT,                 -- CNPJ/CPF do emitente (NF-e)
  numero_nota     TEXT,
  chave_nfe       TEXT,                 -- 44 dígitos, evita importar a mesma nota 2x
  origem          TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','xml','ia','pedido')),
  pedido_id       UUID,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  obs             TEXT,
  anexo_path      TEXT,                 -- arquivo no bucket cp-anexos
  criado_por      TEXT NOT NULL,
  atualizado_por  TEXT,
  excluido_em     TIMESTAMPTZ,
  excluido_por    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_compras_data_idx ON cp_compras (data_compra DESC);
CREATE INDEX IF NOT EXISTS cp_compras_forn_idx ON cp_compras (fornecedor_id);
CREATE UNIQUE INDEX IF NOT EXISTS cp_compras_chave_uniq ON cp_compras (chave_nfe)
  WHERE chave_nfe IS NOT NULL AND excluido_em IS NULL;

CREATE TABLE IF NOT EXISTS cp_compra_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id      UUID NOT NULL REFERENCES cp_compras(id) ON DELETE RESTRICT,
  item_id        INTEGER NOT NULL,
  item_nome      TEXT NOT NULL,
  unidade        TEXT,
  categoria      TEXT,
  qtd            NUMERIC(14,4) NOT NULL CHECK (qtd > 0),   -- na unidade do insumo
  preco_unit     NUMERIC(14,4) NOT NULL DEFAULT 0,         -- por unidade do insumo
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  desc_nota      TEXT,                                     -- como veio na nota
  cod_nota       TEXT,
  qtd_nota       NUMERIC(14,4),
  unid_nota      TEXT,
  fator          NUMERIC(14,4) NOT NULL DEFAULT 1,         -- 1 unid. da nota = fator unid. do insumo
  criado_por     TEXT,
  atualizado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_compra_itens_compra_idx ON cp_compra_itens (compra_id);
CREATE INDEX IF NOT EXISTS cp_compra_itens_item_idx   ON cp_compra_itens (item_id);

-- Memória "produto da nota → insumo" por fornecedor (da 2ª vez já casa sozinho)
CREATE TABLE IF NOT EXISTS cp_nf_mapa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_doc TEXT NOT NULL,          -- CNPJ, ou 'forn:<id>' / 'nome:<texto>' sem CNPJ
  cod_produto    TEXT NOT NULL,          -- código do produto na nota, ou a descrição normalizada
  desc_produto   TEXT,
  item_id        INTEGER NOT NULL,
  fator          NUMERIC(14,4) NOT NULL DEFAULT 1,
  criado_por     TEXT,
  atualizado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fornecedor_doc, cod_produto)
);

-- ── Listas de compra ──
CREATE TABLE IF NOT EXISTS cp_listas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 TEXT NOT NULL,
  semana_inicio        DATE NOT NULL,      -- segunda-feira da semana de compras
  status               TEXT NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','aguardando','aprovada','devolvida','arquivada')),
  cats                 TEXT[],
  obs                  TEXT,
  criado_por           TEXT NOT NULL,
  enviado_por          TEXT,
  enviado_em           TIMESTAMPTZ,
  aprovado_por         TEXT,
  aprovado_em          TIMESTAMPTZ,
  comentario_aprovacao TEXT,
  arquivada_em         TIMESTAMPTZ,
  atualizado_por       TEXT,
  excluido_em          TIMESTAMPTZ,
  excluido_por         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_listas_semana_idx ON cp_listas (semana_inicio DESC);

CREATE TABLE IF NOT EXISTS cp_lista_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id       UUID NOT NULL REFERENCES cp_listas(id) ON DELETE RESTRICT,
  item_id        INTEGER NOT NULL,
  item_nome      TEXT NOT NULL,
  unidade        TEXT,
  categoria      TEXT,
  saldo_ref      NUMERIC(14,4),
  minimo         NUMERIC(14,4),
  ideal          NUMERIC(14,4),
  qtd_sugerida   NUMERIC(14,4),
  qtd_solicitada NUMERIC(14,4) NOT NULL CHECK (qtd_solicitada > 0),
  qtd_aprovada   NUMERIC(14,4),
  obs            TEXT,
  lote_id        UUID,                     -- lote de cotação em que está (1 por vez)
  criado_por     TEXT,
  atualizado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lista_id, item_id)
);
CREATE INDEX IF NOT EXISTS cp_lista_itens_lista_idx ON cp_lista_itens (lista_id);
CREATE INDEX IF NOT EXISTS cp_lista_itens_lote_idx  ON cp_lista_itens (lote_id);

-- ── Cotação (lotes) ──
CREATE TABLE IF NOT EXISTS cp_lotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','concluido','cancelado')),
  criado_por     TEXT NOT NULL,
  concluido_por  TEXT,
  concluido_em   TIMESTAMPTZ,
  atualizado_por TEXT,
  excluido_em    TIMESTAMPTZ,
  excluido_por   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cp_lote_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id        UUID NOT NULL REFERENCES cp_lotes(id) ON DELETE RESTRICT,
  lista_item_id  UUID NOT NULL REFERENCES cp_lista_itens(id) ON DELETE RESTRICT,
  item_id        INTEGER NOT NULL,
  item_nome      TEXT NOT NULL,
  unidade        TEXT,
  qtd            NUMERIC(14,4) NOT NULL CHECK (qtd > 0),
  fornecedor_id  INTEGER,                  -- escolhido na decisão
  preco          NUMERIC(14,4),            -- escolhido na decisão
  criado_por     TEXT,
  atualizado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_lote_itens_lote_idx ON cp_lote_itens (lote_id);

CREATE TABLE IF NOT EXISTS cp_lote_precos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_item_id   UUID NOT NULL REFERENCES cp_lote_itens(id) ON DELETE RESTRICT,
  fornecedor_id  INTEGER NOT NULL,
  preco          NUMERIC(14,4),            -- null = fornecedor não tem / não respondeu
  obs            TEXT,
  criado_por     TEXT,
  atualizado_por TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lote_item_id, fornecedor_id)
);

-- ── Pedidos por fornecedor (aba Recebimento) ──
CREATE TABLE IF NOT EXISTS cp_pedidos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id          UUID REFERENCES cp_lotes(id) ON DELETE RESTRICT,
  fornecedor_id    INTEGER,
  fornecedor_nome  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','solicitado','parcial','recebido','cancelado')),
  mensagem         TEXT,
  total_previsto   NUMERIC(14,2) NOT NULL DEFAULT 0,
  previsao_entrega DATE,
  solicitado_por   TEXT,
  solicitado_em    TIMESTAMPTZ,
  recebido_por     TEXT,
  recebido_em      TIMESTAMPTZ,
  cancelado_por    TEXT,
  cancelado_em     TIMESTAMPTZ,
  cancelado_motivo TEXT,
  criado_por       TEXT NOT NULL,
  atualizado_por   TEXT,
  excluido_em      TIMESTAMPTZ,
  excluido_por     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_pedidos_status_idx ON cp_pedidos (status);

CREATE TABLE IF NOT EXISTS cp_pedido_itens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       UUID NOT NULL REFERENCES cp_pedidos(id) ON DELETE RESTRICT,
  lote_item_id    UUID,
  item_id         INTEGER NOT NULL,
  item_nome       TEXT NOT NULL,
  unidade         TEXT,
  qtd_pedida      NUMERIC(14,4) NOT NULL CHECK (qtd_pedida > 0),
  preco_combinado NUMERIC(14,4),
  qtd_recebida    NUMERIC(14,4) NOT NULL DEFAULT 0,  -- acumulado das entregas
  preco_final     NUMERIC(14,4),
  obs             TEXT,
  criado_por      TEXT,
  atualizado_por  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cp_pedido_itens_pedido_idx ON cp_pedido_itens (pedido_id);

-- ── Triggers (touch, log, sem delete) e RLS ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cp_compras','cp_compra_itens','cp_nf_mapa','cp_listas','cp_lista_itens',
                           'cp_lotes','cp_lote_itens','cp_lote_precos','cp_pedidos','cp_pedido_itens'] LOOP
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
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ── Arquivos: notas fiscais (XML/PDF/foto) e fotos de recebimento ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cp-anexos', 'cp-anexos', true, 15728640, -- 15 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf','text/xml','application/xml'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cp_anexos_insert" ON storage.objects;
CREATE POLICY "cp_anexos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cp-anexos');
DROP POLICY IF EXISTS "cp_anexos_select" ON storage.objects;
CREATE POLICY "cp_anexos_select" ON storage.objects FOR SELECT USING (bucket_id = 'cp-anexos');

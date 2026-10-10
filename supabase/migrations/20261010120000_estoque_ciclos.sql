-- ══════════════════════════════════════════════════════════════
-- Estoque por ciclos — ciclos, contagens, movimentações e log
-- ══════════════════════════════════════════════════════════════
-- Fica FORA do kv_store de propósito: o kv_store grava a entidade inteira
-- de uma vez (um array JSON por chave), então um seed ou um save com dado
-- velho sobrescreve o histórico todo. Aqui cada linha é independente.
--
-- Regras de segurança:
--  • Nada é apagado de verdade. Não existe policy de DELETE para o app
--    (anon) e um trigger bloqueia DELETE mesmo com service role. "Excluir"
--    é marcar excluido_em/excluido_por.
--  • Todo INSERT/UPDATE é registrado em est_log pelo próprio banco
--    (trigger), com a linha antes e depois — não depende do app lembrar.
--  • As vendas automáticas (débito automático) NÃO são gravadas aqui:
--    são calculadas na hora a partir de cw_pedidos + fichas técnicas.

-- ── Ciclos ────────────────────────────────────────────────────
-- Vai de uma contagem completa até a próxima. A contagem de fechamento
-- de um ciclo é a de abertura do seguinte.
CREATE TABLE IF NOT EXISTS est_ciclos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio        TIMESTAMPTZ NOT NULL,
  fim           TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  obs           TEXT,
  criado_por    TEXT NOT NULL,
  fechado_por   TEXT,
  atualizado_por TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No máximo um ciclo aberto por vez
CREATE UNIQUE INDEX IF NOT EXISTS est_ciclos_um_aberto ON est_ciclos ((status)) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS est_ciclos_inicio_idx ON est_ciclos (inicio DESC);

-- ── Contagens (um card do kanban = uma contagem de um local) ──
CREATE TABLE IF NOT EXISTS est_contagens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id      UUID REFERENCES est_ciclos(id) ON DELETE RESTRICT,
  lote          UUID,                 -- agrupa os cards criados juntos ("Nova contagem")
  tipo_id       TEXT NOT NULL,        -- id do tipo de contagem (Configurações › Estoque)
  nome          TEXT NOT NULL,
  local_id      TEXT NOT NULL,        -- id do local (vtp_inv_locs)
  data_ref      TIMESTAMPTZ NOT NULL, -- momento em que o estoque foi contado
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','andamento','revisao','concluida','cancelada')),
  fecha_ciclo   BOOLEAN NOT NULL DEFAULT FALSE,
  obs           TEXT,
  criado_por    TEXT NOT NULL,
  iniciado_por  TEXT,
  aprovado_por  TEXT,
  aprovado_em   TIMESTAMPTZ,
  atualizado_por TEXT,
  excluido_em   TIMESTAMPTZ,
  excluido_por  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS est_contagens_ciclo_idx  ON est_contagens (ciclo_id);
CREATE INDEX IF NOT EXISTS est_contagens_status_idx ON est_contagens (status);
CREATE INDEX IF NOT EXISTS est_contagens_data_idx   ON est_contagens (data_ref DESC);

-- ── Itens contados ────────────────────────────────────────────
-- esperado = saldo calculado no momento da contagem (congelado aqui pra
-- a revisão e o histórico não mudarem se o cadastro mudar depois).
CREATE TABLE IF NOT EXISTS est_contagem_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id   UUID NOT NULL REFERENCES est_contagens(id) ON DELETE RESTRICT,
  item_id       INTEGER NOT NULL,
  item_nome     TEXT NOT NULL,
  item_tipo     TEXT NOT NULL CHECK (item_tipo IN ('insumo','preparado','produto')),
  unidade       TEXT,
  categoria     TEXT,
  debito_auto   BOOLEAN NOT NULL DEFAULT FALSE,
  esperado      NUMERIC(14,4),
  contado       NUMERIC(14,4),
  custo_unit    NUMERIC(14,4),
  obs           TEXT,
  atualizado_por TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contagem_id, item_id)
);
CREATE INDEX IF NOT EXISTS est_contagem_itens_item_idx ON est_contagem_itens (item_id);

-- ── Movimentações manuais e de sistema ────────────────────────
-- tipo:
--   recebimento      entrada de compra (automática na conferência)
--   transferencia    sai de local_origem e entra em local_destino (sem valor financeiro)
--   entrada_manual   entrada sem compra
--   producao         entrada de preparado lançada pela produção/etiquetagem
--   baixa            saída sem venda (tipo_baixa diz qual: cortesia, acidente…)
--   ajuste_contagem  diferença aplicada quando a contagem é aprovada
-- qtd é sempre positiva; o sinal vem do tipo (e de qual local é origem/destino).
CREATE TABLE IF NOT EXISTS est_movimentacoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          TEXT NOT NULL CHECK (tipo IN ('recebimento','transferencia','entrada_manual','producao','baixa','ajuste_contagem')),
  item_id       INTEGER NOT NULL,
  item_nome     TEXT NOT NULL,
  item_tipo     TEXT NOT NULL CHECK (item_tipo IN ('insumo','preparado','produto')),
  unidade       TEXT,
  categoria     TEXT,
  local_origem  TEXT,                 -- saídas e transferências
  local_destino TEXT,                 -- entradas e transferências
  qtd           NUMERIC(14,4) NOT NULL CHECK (qtd > 0),
  sinal         SMALLINT NOT NULL CHECK (sinal IN (-1, 0, 1)), -- 0 = transferência
  custo_unit    NUMERIC(14,4),
  tipo_baixa    TEXT,                 -- id do tipo de baixa (só tipo = baixa)
  motivo        TEXT,
  -- baixa de produto pronto (ex.: pizza meio a meio) vira N linhas de
  -- insumo/preparado com o mesmo grupo_id e o nome do produto
  grupo_id      UUID,
  produto_nome  TEXT,
  ref_tipo      TEXT,                 -- 'lista_compras' | 'contagem' | 'etiqueta' | 'desperdicio_legado'
  ref_id        TEXT,
  data_mov      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por    TEXT NOT NULL,
  atualizado_por TEXT,
  excluido_em   TIMESTAMPTZ,
  excluido_por  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tipo <> 'transferencia' OR (local_origem IS NOT NULL AND local_destino IS NOT NULL AND local_origem <> local_destino)),
  CHECK (tipo <> 'baixa' OR tipo_baixa IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS est_mov_data_idx  ON est_movimentacoes (data_mov DESC);
CREATE INDEX IF NOT EXISTS est_mov_item_idx  ON est_movimentacoes (item_id, data_mov DESC);
CREATE INDEX IF NOT EXISTS est_mov_tipo_idx  ON est_movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS est_mov_grupo_idx ON est_movimentacoes (grupo_id) WHERE grupo_id IS NOT NULL;
-- Evita importar o mesmo desperdício antigo / recebimento duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS est_mov_ref_uniq ON est_movimentacoes (ref_tipo, ref_id, item_id, tipo)
  WHERE ref_tipo IS NOT NULL AND ref_id IS NOT NULL AND excluido_em IS NULL;

-- ── Log de alterações (gravado só pelo trigger) ───────────────
CREATE TABLE IF NOT EXISTS est_log (
  id            BIGSERIAL PRIMARY KEY,
  tabela        TEXT NOT NULL,
  registro_id   UUID NOT NULL,
  acao          TEXT NOT NULL CHECK (acao IN ('inseriu','editou','excluiu','restaurou')),
  usuario       TEXT,
  antes         JSONB,
  depois        JSONB,
  em            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS est_log_registro_idx ON est_log (registro_id, em DESC);
CREATE INDEX IF NOT EXISTS est_log_em_idx       ON est_log (em DESC);

-- ── Triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION est_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION est_registrar_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao    TEXT;
  v_usuario TEXT;
  v_novo    JSONB := to_jsonb(NEW);
  v_velho   JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao    := 'inseriu';
    v_usuario := v_novo->>'criado_por';
  ELSE
    v_velho := to_jsonb(OLD);
    IF (v_velho->>'excluido_em') IS NULL AND (v_novo->>'excluido_em') IS NOT NULL THEN
      v_acao    := 'excluiu';
      v_usuario := v_novo->>'excluido_por';
    ELSIF (v_velho->>'excluido_em') IS NOT NULL AND (v_novo->>'excluido_em') IS NULL THEN
      v_acao    := 'restaurou';
      v_usuario := v_novo->>'atualizado_por';
    ELSE
      v_acao    := 'editou';
      v_usuario := COALESCE(v_novo->>'atualizado_por', v_novo->>'criado_por');
    END IF;
    -- Não loga UPDATE que não mudou nada além do updated_at
    IF (v_velho - 'updated_at') = (v_novo - 'updated_at') THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO est_log (tabela, registro_id, acao, usuario, antes, depois)
  VALUES (TG_TABLE_NAME, (v_novo->>'id')::uuid, v_acao, v_usuario, v_velho, v_novo);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION est_bloquear_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registros de estoque não podem ser apagados (%). Marque como excluído.', TG_TABLE_NAME;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['est_ciclos','est_contagens','est_contagem_itens','est_movimentacoes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION est_touch_updated_at()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_log ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_log AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION est_registrar_log()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_nodelete ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_nodelete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION est_bloquear_delete()', t, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS est_log_nodelete ON est_log;
CREATE TRIGGER est_log_nodelete BEFORE DELETE OR UPDATE ON est_log
  FOR EACH ROW EXECUTE FUNCTION est_bloquear_delete();

-- ── RLS ───────────────────────────────────────────────────────
-- Mesmo modelo do resto do app (anon key), mas SEM policy de DELETE.
-- est_log: só leitura para o app; escrita só pelo trigger (SECURITY DEFINER).
ALTER TABLE est_ciclos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE est_contagens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE est_contagem_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE est_movimentacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE est_log            ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['est_ciclos','est_contagens','est_contagem_itens','est_movimentacoes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_read_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_read_%s" ON %I FOR SELECT USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE USING (true)', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "anon_read_est_log" ON est_log;
CREATE POLICY "anon_read_est_log" ON est_log FOR SELECT USING (true);

-- Realtime: kanban e movimentações atualizam ao vivo entre aparelhos
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['est_ciclos','est_contagens','est_contagem_itens','est_movimentacoes'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

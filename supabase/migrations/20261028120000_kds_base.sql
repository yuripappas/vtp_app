-- ══════════════════════════════════════════════════════════════
-- KDS (Kitchen Display) — Fase 1: base + KDS Pizzaiolo
-- ══════════════════════════════════════════════════════════════
-- O CW controla o PEDIDO; o KDS controla cada PIZZA. Por isso:
--  • kds_pedidos  — 1 por pedido que entrou na cozinha (CW ou interno, Fase 3),
--                   guarda só o que é do KDS (ordem da fila, entrada na fila).
--                   Dados do pedido (cliente, canal, itens) seguem em cw_pedidos.
--  • kds_pizzas   — 1 por pizza (grande = 2 meias, pequena = 1 meia), com o
--                   horário e o responsável de cada etapa. É a base da
--                   performance por pessoa e da capacidade (Fase 4/5).
--  • kds_operadores / kds_jornadas — quem está em cada tablet (nome + PIN).
--
-- As pizzas são extraídas do pedido no navegador, pelo mesmo motor do CMV
-- (vendas.js → _vInterpretarItem), e gravadas via kds_gerar_pizzas() — que é
-- idempotente, então vários tablets abertos não duplicam nada.
--
-- Escrita só pelas funções abaixo (SECURITY DEFINER): as tabelas têm leitura
-- liberada para anon, como o resto do app, mas nenhuma policy de escrita —
-- o tablet não consegue pular etapa nem roubar a pizza de outro pizzaiolo.

-- ── Campos do pedido que o KDS usa e o cw-sync ainda não gravava ──
ALTER TABLE cw_pedidos
  ADD COLUMN IF NOT EXISTS estimated_time      INTEGER, -- previsão de entrega (min desde a criação)
  ADD COLUMN IF NOT EXISTS observation         TEXT,    -- observação geral do pedido
  ADD COLUMN IF NOT EXISTS schedule            JSONB,   -- { scheduled_date_time_start, ..._end } (agendados)
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ── Operadores (pizzaiolos, finalização) ──────────────────────
CREATE TABLE IF NOT EXISTS kds_operadores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  funcao      TEXT NOT NULL DEFAULT 'pizzaiolo' CHECK (funcao IN ('pizzaiolo','finalizacao','ambos')),
  diarista    BOOLEAN NOT NULL DEFAULT false,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_por  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PIN fora da tabela de operadores: sem policy nenhuma, nem leitura —
-- só as funções SECURITY DEFINER enxergam o hash.
CREATE TABLE IF NOT EXISTS kds_operador_pin (
  operador_id UUID PRIMARY KEY REFERENCES kds_operadores(id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kds_jornadas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID NOT NULL REFERENCES kds_operadores(id),
  posto       TEXT NOT NULL CHECK (posto IN ('pizzaiolo','finalizacao','pedido')),
  inicio      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fim         TIMESTAMPTZ,
  dispositivo TEXT
);
CREATE INDEX IF NOT EXISTS kds_jornadas_operador_idx ON kds_jornadas (operador_id, inicio DESC);

-- ── Pedidos na cozinha ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kds_pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cw_pedido_id   BIGINT UNIQUE,                 -- null nos pedidos internos (Fase 3)
  origem         TEXT NOT NULL DEFAULT 'cw' CHECK (origem IN ('cw','interno')),
  numero         TEXT,                          -- display_id (#47)
  entra_fila_em  TIMESTAMPTZ NOT NULL,          -- agendados entram antes do horário
  prioridade     DOUBLE PRECISION NOT NULL,     -- ordem da fila (menor = antes); reordenação na Fase 3
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kds_pedidos_fila_idx ON kds_pedidos (entra_fila_em DESC);

-- ── Pizzas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kds_pizzas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID NOT NULL REFERENCES kds_pedidos(id) ON DELETE CASCADE,
  seq              SMALLINT NOT NULL,           -- 01, 02… dentro do pedido
  tamanho          TEXT NOT NULL CHECK (tamanho IN ('grande','pequena')),
  meias            JSONB NOT NULL,              -- [{ opcao_id, nome }] — 2 na grande, 1 na pequena
  tipo             TEXT,                        -- salgada | doce | mista
  observacao       TEXT,                        -- observação do item no CW
  status           TEXT NOT NULL DEFAULT 'aguardando'
                     CHECK (status IN ('aguardando','em_preparo','finalizacao','pronto','cancelada')),
  iniciado_em      TIMESTAMPTZ,
  iniciado_por     UUID REFERENCES kds_operadores(id),
  jornada_id       UUID REFERENCES kds_jornadas(id),
  montagem_fim_em  TIMESTAMPTZ,                 -- foi pro forno → Finalização
  finalizado_em    TIMESTAMPTZ,                 -- cortada e embalada (Fase 2)
  finalizado_por   UUID REFERENCES kds_operadores(id),
  refeita_de       UUID REFERENCES kds_pizzas(id), -- "Refazer" (Fase 2) = pizza nova
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pedido_id, seq)
);
CREATE INDEX IF NOT EXISTS kds_pizzas_status_idx   ON kds_pizzas (status);
CREATE INDEX IF NOT EXISTS kds_pizzas_operador_idx ON kds_pizzas (iniciado_por, iniciado_em DESC);
-- Uma pizza por vez por pizzaiolo — garantido pelo banco, não só pela tela.
CREATE UNIQUE INDEX IF NOT EXISTS kds_pizzas_uma_por_vez
  ON kds_pizzas (iniciado_por) WHERE status = 'em_preparo';

-- ── RLS: leitura liberada, escrita só pelas funções ───────────
ALTER TABLE kds_operadores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_operador_pin ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_jornadas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_pizzas       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['kds_operadores','kds_jornadas','kds_pedidos','kds_pizzas'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_read_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_read_%s" ON %I FOR SELECT USING (true)', t, t);
  END LOOP;
END $$;
REVOKE ALL ON kds_operador_pin FROM anon, authenticated;

-- ── Operadores: cadastro e login por PIN ──────────────────────

-- Cria (p_id null) ou edita um operador. PIN obrigatório na criação; na
-- edição, null mantém o atual. Usado pelo gestor e pelo "Sou diarista" do tablet.
CREATE OR REPLACE FUNCTION kds_operador_salvar(
  p_id UUID, p_nome TEXT, p_funcao TEXT, p_diarista BOOLEAN,
  p_pin TEXT, p_ativo BOOLEAN DEFAULT true, p_criado_por TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id UUID := p_id;
BEGIN
  IF coalesce(trim(p_nome), '') = '' THEN RAISE EXCEPTION 'Informe o nome'; END IF;
  IF p_pin IS NOT NULL AND p_pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'O PIN deve ter 4 números'; END IF;

  IF v_id IS NULL THEN
    IF p_pin IS NULL THEN RAISE EXCEPTION 'Informe o PIN'; END IF;
    INSERT INTO kds_operadores (nome, funcao, diarista, ativo, criado_por)
    VALUES (trim(p_nome), coalesce(p_funcao, 'pizzaiolo'), coalesce(p_diarista, false), coalesce(p_ativo, true), p_criado_por)
    RETURNING id INTO v_id;
  ELSE
    UPDATE kds_operadores
       SET nome = trim(p_nome), funcao = coalesce(p_funcao, funcao), diarista = coalesce(p_diarista, diarista),
           ativo = coalesce(p_ativo, ativo), updated_at = NOW()
     WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operador não encontrado'; END IF;
  END IF;

  IF p_pin IS NOT NULL THEN
    INSERT INTO kds_operador_pin (operador_id, pin_hash) VALUES (v_id, crypt(p_pin, gen_salt('bf')))
    ON CONFLICT (operador_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash;
  END IF;
  RETURN v_id;
END $$;

-- Confere o PIN e abre a jornada no posto (fecha uma jornada que tenha
-- ficado aberta em outro tablet). Devolve o id da jornada.
CREATE OR REPLACE FUNCTION kds_entrar(p_operador UUID, p_pin TEXT, p_posto TEXT, p_dispositivo TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash TEXT; v_jornada UUID;
BEGIN
  SELECT p.pin_hash INTO v_hash
    FROM kds_operador_pin p JOIN kds_operadores o ON o.id = p.operador_id
   WHERE p.operador_id = p_operador AND o.ativo;
  IF v_hash IS NULL OR v_hash <> crypt(coalesce(p_pin, ''), v_hash) THEN
    RAISE EXCEPTION 'PIN incorreto';
  END IF;

  UPDATE kds_jornadas SET fim = NOW() WHERE operador_id = p_operador AND fim IS NULL;
  INSERT INTO kds_jornadas (operador_id, posto, dispositivo) VALUES (p_operador, p_posto, p_dispositivo)
  RETURNING id INTO v_jornada;
  RETURN v_jornada;
END $$;

CREATE OR REPLACE FUNCTION kds_sair(p_jornada UUID) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE kds_jornadas SET fim = NOW() WHERE id = p_jornada AND fim IS NULL;
$$;

-- ── Pizzas ────────────────────────────────────────────────────

-- Registra o pedido na cozinha e suas pizzas (só na primeira vez).
-- p_pizzas: [{ seq, tamanho, meias:[{opcao_id,nome}], tipo, observacao }]
CREATE OR REPLACE FUNCTION kds_gerar_pizzas(
  p_cw_pedido_id BIGINT, p_numero TEXT, p_entra_fila_em TIMESTAMPTZ, p_pizzas JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pedido UUID; pz JSONB;
BEGIN
  INSERT INTO kds_pedidos (cw_pedido_id, origem, numero, entra_fila_em, prioridade)
  VALUES (p_cw_pedido_id, 'cw', p_numero, p_entra_fila_em, extract(epoch FROM p_entra_fila_em))
  ON CONFLICT (cw_pedido_id) DO NOTHING;

  SELECT id INTO v_pedido FROM kds_pedidos WHERE cw_pedido_id = p_cw_pedido_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM kds_pizzas WHERE pedido_id = v_pedido) THEN
    FOR pz IN SELECT * FROM jsonb_array_elements(coalesce(p_pizzas, '[]'::jsonb)) LOOP
      INSERT INTO kds_pizzas (pedido_id, seq, tamanho, meias, tipo, observacao)
      VALUES (v_pedido, (pz->>'seq')::SMALLINT, pz->>'tamanho', pz->'meias', pz->>'tipo', nullif(pz->>'observacao', ''));
    END LOOP;
  END IF;
  RETURN v_pedido;
END $$;

-- Inicia a montagem. Quem confirmar primeiro fica com a pizza.
-- Devolve { ok, motivo: 'ocupada' | 'ja_montando' | 'indisponivel', por }.
CREATE OR REPLACE FUNCTION kds_iniciar(p_pizza UUID, p_operador UUID, p_jornada UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT; v_por TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM kds_pizzas WHERE iniciado_por = p_operador AND status = 'em_preparo' AND id <> p_pizza) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_montando');
  END IF;

  UPDATE kds_pizzas
     SET status = 'em_preparo', iniciado_em = NOW(), iniciado_por = p_operador, jornada_id = p_jornada, updated_at = NOW()
   WHERE id = p_pizza AND status = 'aguardando';
  IF FOUND THEN RETURN jsonb_build_object('ok', true); END IF;

  SELECT z.status, o.nome INTO v_status, v_por
    FROM kds_pizzas z LEFT JOIN kds_operadores o ON o.id = z.iniciado_por WHERE z.id = p_pizza;
  IF v_status = 'em_preparo' AND v_por IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ocupada', 'por', v_por);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'indisponivel', 'status', v_status);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'motivo', 'ja_montando');
END $$;

-- Montagem concluída → pizza vai pro forno (status Finalização).
CREATE OR REPLACE FUNCTION kds_finalizar_montagem(p_pizza UUID, p_operador UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE kds_pizzas SET status = 'finalizacao', montagem_fim_em = NOW(), updated_at = NOW()
   WHERE id = p_pizza AND status = 'em_preparo' AND iniciado_por = p_operador;
  RETURN FOUND;
END $$;

-- Iniciou por engano → devolve pra fila, como se nunca tivesse começado.
CREATE OR REPLACE FUNCTION kds_devolver_fila(p_pizza UUID, p_operador UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE kds_pizzas SET status = 'aguardando', iniciado_em = NULL, iniciado_por = NULL, jornada_id = NULL, updated_at = NOW()
   WHERE id = p_pizza AND status = 'em_preparo' AND iniciado_por = p_operador;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION
  kds_operador_salvar(UUID, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT),
  kds_entrar(UUID, TEXT, TEXT, TEXT),
  kds_sair(UUID),
  kds_gerar_pizzas(BIGINT, TEXT, TIMESTAMPTZ, JSONB),
  kds_iniciar(UUID, UUID, UUID),
  kds_finalizar_montagem(UUID, UUID),
  kds_devolver_fila(UUID, UUID)
TO anon, authenticated;

-- ── Realtime: os tablets reagem na hora a pizza iniciada / pedido novo ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['kds_pizzas','kds_pedidos','cw_pedidos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ── cw-sync a cada minuto no horário da loja ──────────────────
-- O webhook do CW (Edge Function cw-webhook) traz pedido novo e mudança de
-- status na hora; o sync por minuto fica de rede de segurança caso algum
-- webhook se perca. Mesma janela de 20261026130000 (17h–00h59 de Maceió).
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'cw-sync-job'),
                      schedule := '* 20-23,0-3 * * *');

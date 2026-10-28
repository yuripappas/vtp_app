-- ══════════════════════════════════════════════════════════════
-- KDS — Finalização e Pedido (Fases 2 e 3)
-- ══════════════════════════════════════════════════════════════
-- Finalização: a pizza que saiu do forno é cortada, embalada e fica Pronta.
--   Quando a última pizza do pedido fica pronta, o tablet marca o pedido como
--   "prepared" (Pronto) no CW. Refazer = a pizza vira descarte e nasce uma
--   nova no início da fila (erro de montagem de quem montou). Pedido cancelado
--   com pizza já feita: reaproveitar numa pizza igual de outro pedido, ou
--   registrar desperdício.
-- Pedido: reordenar a fila (prioridade) e pedidos internos (sócios,
--   marketing, cortesia…) — só no KDS, nunca vão para o CW nem para vendas;
--   a baixa de estoque é lançada pelo app quando cada pizza fica pronta.

-- ── Pedido ────────────────────────────────────────────────────
ALTER TABLE kds_pedidos
  ADD COLUMN IF NOT EXISTS motivo        TEXT,         -- interno: tipo de saída (TIPOS_DESPERDICIO)
  ADD COLUMN IF NOT EXISTS descricao     TEXT,         -- interno: para quem / do que se trata
  ADD COLUMN IF NOT EXISTS observacao    TEXT,
  ADD COLUMN IF NOT EXISTS criado_por    TEXT,
  ADD COLUMN IF NOT EXISTS cancelado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluido_em  TIMESTAMPTZ;

CREATE SEQUENCE IF NOT EXISTS kds_interno_seq;

-- ── Pizza: o que aconteceu com a pizza que não foi entregue ───
ALTER TABLE kds_pizzas
  ADD COLUMN IF NOT EXISTS destino           TEXT CHECK (destino IN ('refeita','reaproveitada','desperdicio')),
  ADD COLUMN IF NOT EXISTS motivo_descarte   TEXT,
  ADD COLUMN IF NOT EXISTS descartado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS descartado_por    UUID REFERENCES kds_operadores(id),
  ADD COLUMN IF NOT EXISTS reaproveitada_em  UUID REFERENCES kds_pizzas(id),  -- pizza que recebeu esta
  ADD COLUMN IF NOT EXISTS reaproveitada_de  UUID REFERENCES kds_pizzas(id),  -- pizza que veio de outro pedido
  ADD COLUMN IF NOT EXISTS finalizado_jornada UUID REFERENCES kds_jornadas(id);
CREATE INDEX IF NOT EXISTS kds_pizzas_finalizado_idx ON kds_pizzas (finalizado_por, finalizado_em DESC);
CREATE INDEX IF NOT EXISTS kds_pizzas_montagem_idx   ON kds_pizzas (montagem_fim_em DESC);

-- Sabores de uma pizza, em ordem — duas pizzas com a mesma assinatura e o
-- mesmo tamanho são iguais (dá pra reaproveitar uma no lugar da outra).
CREATE OR REPLACE FUNCTION kds_assinatura(p_meias JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(lower(coalesce(m->>'opcao_id', m->>'nome')), '|' ORDER BY lower(coalesce(m->>'opcao_id', m->>'nome')))
    FROM jsonb_array_elements(coalesce(p_meias, '[]'::jsonb)) m;
$$;

-- Pedido sem nenhuma pizza a fazer = pronto
CREATE OR REPLACE FUNCTION kds_pedido_pronto(p_pedido UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM kds_pizzas WHERE pedido_id = p_pedido AND status = 'pronto')
     AND NOT EXISTS (SELECT 1 FROM kds_pizzas WHERE pedido_id = p_pedido AND status IN ('aguardando','em_preparo','finalizacao'));
$$;

-- ── Finalização ───────────────────────────────────────────────

-- Cortada e embalada → Pronto. Devolve { ok, pedido_pronto, cw_pedido_id, origem }.
CREATE OR REPLACE FUNCTION kds_finalizar(p_pizza UUID, p_operador UUID, p_jornada UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ped UUID;
BEGIN
  UPDATE kds_pizzas
     SET status = 'pronto', finalizado_em = NOW(), finalizado_por = p_operador, finalizado_jornada = p_jornada, updated_at = NOW()
   WHERE id = p_pizza AND status = 'finalizacao'
  RETURNING pedido_id INTO v_ped;
  IF v_ped IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN (SELECT jsonb_build_object('ok', true, 'pedido_pronto', kds_pedido_pronto(v_ped), 'cw_pedido_id', p.cw_pedido_id, 'origem', p.origem)
            FROM kds_pedidos p WHERE p.id = v_ped);
END $$;

-- Refazer: a pizza vira descarte (erro de montagem) e nasce uma igual
-- aguardando no mesmo pedido. Devolve o id da pizza nova.
CREATE OR REPLACE FUNCTION kds_refazer(p_pizza UUID, p_operador UUID, p_motivo TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE z kds_pizzas; v_nova UUID;
BEGIN
  SELECT * INTO z FROM kds_pizzas WHERE id = p_pizza FOR UPDATE;
  IF z.id IS NULL OR z.status NOT IN ('finalizacao','pronto') THEN RETURN NULL; END IF;

  UPDATE kds_pizzas
     SET status = 'cancelada', destino = 'refeita', motivo_descarte = nullif(trim(p_motivo), ''),
         descartado_em = NOW(), descartado_por = p_operador, updated_at = NOW()
   WHERE id = p_pizza;

  INSERT INTO kds_pizzas (pedido_id, seq, tamanho, meias, tipo, observacao, refeita_de)
  VALUES (z.pedido_id, (SELECT max(seq) + 1 FROM kds_pizzas WHERE pedido_id = z.pedido_id),
          z.tamanho, z.meias, z.tipo, z.observacao, z.id)
  RETURNING id INTO v_nova;
  RETURN v_nova;
END $$;

-- Pizza feita de pedido cancelado que não teve destino → desperdício.
CREATE OR REPLACE FUNCTION kds_descartar(p_pizza UUID, p_operador UUID, p_motivo TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE kds_pizzas
     SET status = 'cancelada', destino = 'desperdicio', motivo_descarte = nullif(trim(p_motivo), ''),
         descartado_em = NOW(), descartado_por = p_operador, updated_at = NOW()
   WHERE id = p_pizza AND status IN ('finalizacao','pronto') AND destino IS NULL;
  RETURN FOUND;
END $$;

-- Pizza feita de pedido cancelado vai para uma pizza IGUAL (mesmo tamanho e
-- sabores) que ainda está aguardando em outro pedido — que pula direto para
-- o estado da que foi reaproveitada. Devolve { ok, motivo, pedido_pronto, cw_pedido_id, origem }.
CREATE OR REPLACE FUNCTION kds_reaproveitar(p_origem UUID, p_destino UUID, p_operador UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o kds_pizzas; d kds_pizzas;
BEGIN
  SELECT * INTO o FROM kds_pizzas WHERE id = p_origem FOR UPDATE;
  SELECT * INTO d FROM kds_pizzas WHERE id = p_destino FOR UPDATE;
  IF o.id IS NULL OR o.status NOT IN ('finalizacao','pronto') OR o.destino IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'origem');
  END IF;
  IF d.id IS NULL OR d.status <> 'aguardando' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'destino'); END IF;
  IF o.tamanho <> d.tamanho OR kds_assinatura(o.meias) <> kds_assinatura(d.meias) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'incompativel');
  END IF;

  UPDATE kds_pizzas
     SET status = o.status, iniciado_em = o.iniciado_em, iniciado_por = o.iniciado_por, jornada_id = o.jornada_id,
         montagem_fim_em = o.montagem_fim_em, finalizado_em = o.finalizado_em, finalizado_por = o.finalizado_por,
         finalizado_jornada = o.finalizado_jornada, reaproveitada_de = o.id, updated_at = NOW()
   WHERE id = d.id;
  UPDATE kds_pizzas
     SET status = 'cancelada', destino = 'reaproveitada', reaproveitada_em = d.id,
         descartado_em = NOW(), descartado_por = p_operador, updated_at = NOW()
   WHERE id = o.id;

  RETURN (SELECT jsonb_build_object('ok', true, 'pedido_pronto', kds_pedido_pronto(p.id), 'cw_pedido_id', p.cw_pedido_id, 'origem', p.origem)
            FROM kds_pedidos p WHERE p.id = d.pedido_id);
END $$;

-- ── Pedido: fila e internos ───────────────────────────────────

CREATE OR REPLACE FUNCTION kds_prioridade(p_pedido UUID, p_prioridade DOUBLE PRECISION) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE kds_pedidos SET prioridade = p_prioridade WHERE id = p_pedido;
$$;

-- p_pizzas: [{ seq, tamanho, meias:[{opcao_id,nome}], tipo, observacao }]
CREATE OR REPLACE FUNCTION kds_pedido_interno(
  p_motivo TEXT, p_descricao TEXT, p_observacao TEXT, p_criado_por TEXT, p_pizzas JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ped UUID; pz JSONB;
BEGIN
  IF coalesce(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  IF jsonb_array_length(coalesce(p_pizzas, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Adicione pelo menos uma pizza'; END IF;

  INSERT INTO kds_pedidos (origem, numero, entra_fila_em, prioridade, motivo, descricao, observacao, criado_por)
  VALUES ('interno', 'I' || nextval('kds_interno_seq'), NOW(), extract(epoch FROM NOW()),
          trim(p_motivo), nullif(trim(p_descricao), ''), nullif(trim(p_observacao), ''), p_criado_por)
  RETURNING id INTO v_ped;

  FOR pz IN SELECT * FROM jsonb_array_elements(p_pizzas) LOOP
    INSERT INTO kds_pizzas (pedido_id, seq, tamanho, meias, tipo, observacao)
    VALUES (v_ped, (pz->>'seq')::SMALLINT, pz->>'tamanho', pz->'meias', pz->>'tipo', nullif(pz->>'observacao', ''));
  END LOOP;
  RETURN v_ped;
END $$;

-- Cancela um interno: o que ainda não começou sai da fila; o que já foi
-- feito fica para a Finalização dar destino (reaproveitar ou desperdício).
CREATE OR REPLACE FUNCTION kds_interno_cancelar(p_pedido UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE kds_pedidos SET cancelado_em = NOW() WHERE id = p_pedido AND origem = 'interno' AND cancelado_em IS NULL AND concluido_em IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE kds_pizzas SET status = 'cancelada', updated_at = NOW() WHERE pedido_id = p_pedido AND status = 'aguardando';
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION kds_interno_concluir(p_pedido UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE kds_pedidos SET concluido_em = NOW()
   WHERE id = p_pedido AND origem = 'interno' AND cancelado_em IS NULL AND concluido_em IS NULL AND kds_pedido_pronto(p_pedido);
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION
  kds_finalizar(UUID, UUID, UUID), kds_refazer(UUID, UUID, TEXT), kds_descartar(UUID, UUID, TEXT),
  kds_reaproveitar(UUID, UUID, UUID), kds_prioridade(UUID, DOUBLE PRECISION),
  kds_pedido_interno(TEXT, TEXT, TEXT, TEXT, JSONB), kds_interno_cancelar(UUID), kds_interno_concluir(UUID)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  kds_finalizar(UUID, UUID, UUID), kds_refazer(UUID, UUID, TEXT), kds_descartar(UUID, UUID, TEXT),
  kds_reaproveitar(UUID, UUID, UUID), kds_prioridade(UUID, DOUBLE PRECISION),
  kds_pedido_interno(TEXT, TEXT, TEXT, TEXT, JSONB), kds_interno_cancelar(UUID), kds_interno_concluir(UUID)
TO anon, authenticated;

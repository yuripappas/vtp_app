-- ══════════════════════════════════════════════════════════════
-- Módulo Gestão v2 — Plano de Ação · Balanço · Processos
-- ══════════════════════════════════════════════════════════════
-- Áreas fixas (ADM, OPE, PRO, MKT) e sub-áreas pré-cadastradas abaixo.
--  • Plano de Ação: atividades com uma subtarefa de um nível, Resp. Final
--    (1 pessoa), Resp. Execução (várias, também na subtarefa) e links de entrega.
--  • Processos: quadro por sub-área, com status e links (pasta, vídeo, link).
--  • Balanço: rotinas cadastradas no app por sub-área; todo mês cada rotina
--    recebe Sim ou Não ("Não" exige observação para fechar). Fechado = imutável.
--    As notas (% de Sim por sub-área → média por área → média da gestão) são
--    calculadas na tela a partir de gestao_balanco_aval.
--
-- Como o resto do app: leitura liberada para anon, nenhuma policy de escrita.
-- Toda escrita passa pelas funções gestao_* (SECURITY DEFINER), que recebem
-- p_usuario_id (vtp_users.id, TEXT) e conferem se o usuário está ativo.
-- Sem empresa_id. Datas no fuso America/Maceio.

-- ── Sub-áreas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestao_subareas (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area   TEXT NOT NULL CHECK (area IN ('adm','ope','pro','mkt')),
  nome   TEXT NOT NULL,
  ordem  SMALLINT NOT NULL DEFAULT 0,
  ativo  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (area, nome)
);

INSERT INTO gestao_subareas (area, nome, ordem) VALUES
  ('adm', 'Pessoas', 0), ('adm', 'Financeiro', 1), ('adm', 'Estratégico', 2), ('adm', 'Governança', 3),
  ('ope', 'Estoque', 10), ('ope', 'Compras', 11), ('ope', 'Cozinha', 12), ('ope', 'Atendimento', 13),
  ('ope', 'Logística', 14), ('ope', 'Gerência', 15),
  ('pro', 'Produtização', 20),
  ('mkt', 'Marketing e Vendas', 30)
ON CONFLICT (area, nome) DO NOTHING;

-- ── Processos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestao_processos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subarea_id     UUID NOT NULL REFERENCES gestao_subareas(id),
  nome           TEXT NOT NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'a_construir'
                   CHECK (status IN ('a_construir','em_construcao','implantado','em_revisao')),
  responsavel_id TEXT,                        -- vtp_users.id
  revisado_em    DATE,
  ordem          INTEGER NOT NULL DEFAULT 0,
  arquivado      BOOLEAN NOT NULL DEFAULT false,
  criado_por     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gestao_processos_subarea_idx ON gestao_processos (subarea_id);

CREATE TABLE IF NOT EXISTS gestao_processo_rec (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES gestao_processos(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('pasta','video','link')),
  titulo      TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL CHECK (url ~* '^https?://\S+$'),
  ordem       SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gestao_processo_rec_proc_idx ON gestao_processo_rec (processo_id);

-- ── Rotinas e Balanço ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestao_rotinas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subarea_id  UUID NOT NULL REFERENCES gestao_subareas(id),
  titulo      TEXT NOT NULL,
  descricao   TEXT NOT NULL DEFAULT '',
  processo_id UUID REFERENCES gestao_processos(id),
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_por  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gestao_rotinas_subarea_idx ON gestao_rotinas (subarea_id);

CREATE TABLE IF NOT EXISTS gestao_balancos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes         DATE NOT NULL UNIQUE CHECK (mes = date_trunc('month', mes)::date), -- sempre dia 1
  status      TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','fechado')),
  observacao  TEXT NOT NULL DEFAULT '',
  aberto_por  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fechado_por TEXT,
  fechado_em  TIMESTAMPTZ
);

-- Sem linha = rotina ainda sem resposta. rotina_titulo e subarea_id são a
-- foto do momento (atualizada ao fechar), para o histórico não mudar se a
-- rotina for renomeada ou trocar de sub-área depois.
CREATE TABLE IF NOT EXISTS gestao_balanco_aval (
  balanco_id     UUID NOT NULL REFERENCES gestao_balancos(id) ON DELETE CASCADE,
  rotina_id      UUID NOT NULL REFERENCES gestao_rotinas(id),
  resposta       TEXT NOT NULL CHECK (resposta IN ('sim','nao')),
  observacao     TEXT NOT NULL DEFAULT '',
  rotina_titulo  TEXT NOT NULL,
  subarea_id     UUID NOT NULL REFERENCES gestao_subareas(id),
  respondido_por TEXT,
  respondido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (balanco_id, rotina_id)
);
CREATE INDEX IF NOT EXISTS gestao_balanco_aval_rotina_idx ON gestao_balanco_aval (rotina_id);

-- ── Plano de Ação ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestao_atividades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subarea_id        UUID NOT NULL REFERENCES gestao_subareas(id),
  parent_id         UUID REFERENCES gestao_atividades(id),   -- subtarefa (um nível só)
  descritivo        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer','em_andamento','concluido')),
  resp_final_id     TEXT,                                    -- vtp_users.id
  prazo             DATE,
  prioridade        SMALLINT NOT NULL DEFAULT 3 CHECK (prioridade BETWEEN 1 AND 3),
  observacao        TEXT NOT NULL DEFAULT '',
  posicao           DOUBLE PRECISION NOT NULL DEFAULT 0,
  processo_id       UUID REFERENCES gestao_processos(id),    -- "Criar atividade para este processo"
  rotina_origem_id  UUID REFERENCES gestao_rotinas(id),      -- nasceu de um "Não" no balanço
  balanco_origem_id UUID REFERENCES gestao_balancos(id),
  concluido_em      TIMESTAMPTZ,
  arquivado         BOOLEAN NOT NULL DEFAULT false,
  criado_por        TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por    TEXT,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gestao_atividades_parent_idx   ON gestao_atividades (parent_id);
CREATE INDEX IF NOT EXISTS gestao_atividades_processo_idx ON gestao_atividades (processo_id) WHERE processo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestao_atividades_balanco_idx  ON gestao_atividades (balanco_origem_id) WHERE balanco_origem_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS gestao_atividade_exec (
  atividade_id UUID NOT NULL REFERENCES gestao_atividades(id) ON DELETE CASCADE,
  usuario_id   TEXT NOT NULL,                                -- vtp_users.id
  PRIMARY KEY (atividade_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS gestao_atividade_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES gestao_atividades(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('pasta','video','link')),
  titulo       TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL CHECK (url ~* '^https?://\S+$'),
  ordem        SMALLINT NOT NULL DEFAULT 0,
  criado_por   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gestao_atividade_links_atv_idx ON gestao_atividade_links (atividade_id);

-- Quem mudou o quê (status, responsável, prazo, prioridade, texto, sub-área)
CREATE TABLE IF NOT EXISTS gestao_atividade_hist (
  id           BIGSERIAL PRIMARY KEY,
  atividade_id UUID NOT NULL REFERENCES gestao_atividades(id) ON DELETE CASCADE,
  usuario_id   TEXT,
  campo        TEXT NOT NULL,
  de           TEXT,
  para         TEXT,
  em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gestao_atividade_hist_atv_idx ON gestao_atividade_hist (atividade_id, em DESC);

-- ── RLS: leitura liberada, escrita só pelas funções ───────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestao_subareas','gestao_processos','gestao_processo_rec','gestao_rotinas',
    'gestao_balancos','gestao_balanco_aval','gestao_atividades','gestao_atividade_exec',
    'gestao_atividade_links','gestao_atividade_hist'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_read_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "anon_read_%s" ON %I FOR SELECT USING (true)', t, t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Auxiliares internos (sem acesso para anon)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gestao_hoje() RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (NOW() AT TIME ZONE 'America/Maceio')::date
$$;

-- Usuário existe e está ativo no vtp_users (kv_store)
CREATE OR REPLACE FUNCTION gestao_usuario_valido(p_usuario_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(trim(p_usuario_id), '') <> '' AND EXISTS (
    SELECT 1 FROM kv_store k, jsonb_array_elements(CASE WHEN jsonb_typeof(k.value) = 'array' THEN k.value ELSE '[]'::jsonb END) u
     WHERE k.key = 'vtp_users'
       AND u->>'id' = trim(p_usuario_id)
       AND coalesce(u->>'active', 'true') <> 'false')
$$;

-- Devolve o id limpo de quem está gravando, ou para tudo
CREATE OR REPLACE FUNCTION gestao_exigir_usuario(p_usuario_id TEXT) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT gestao_usuario_valido(p_usuario_id) THEN RAISE EXCEPTION 'Usuário inválido ou inativo'; END IF;
  RETURN trim(p_usuario_id);
END $$;

-- Texto vazio → null (campos opcionais vindos da tela)
CREATE OR REPLACE FUNCTION gestao_txt(p JSONB, k TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(trim(p->>k), '')
$$;

CREATE OR REPLACE FUNCTION gestao_uuid(p JSONB, k TEXT, p_msg TEXT) RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT := nullif(trim(p->>k), '');
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION '%', p_msg; END IF;
  RETURN v::uuid;
END $$;

-- Valida uma lista [{ tipo, titulo, url }] de links (atividade ou processo)
CREATE OR REPLACE FUNCTION gestao_links_validar(p_links JSONB) RETURNS VOID
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE l JSONB; v_tit TEXT;
BEGIN
  IF p_links IS NULL OR jsonb_typeof(p_links) = 'null' THEN RETURN; END IF;
  IF jsonb_typeof(p_links) <> 'array' THEN RAISE EXCEPTION 'Lista de links inválida'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    v_tit := nullif(trim(l->>'titulo'), '');
    IF coalesce(trim(l->>'url'), '') !~* '^https?://\S+$' THEN
      RAISE EXCEPTION 'Link inválido%: use um endereço que comece com https://',
        CASE WHEN v_tit IS NULL THEN '' ELSE ' em "' || v_tit || '"' END;
    END IF;
    IF coalesce(l->>'tipo', '') NOT IN ('pasta','video','link') THEN RAISE EXCEPTION 'Tipo de link inválido'; END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION gestao_usuario_valido(TEXT)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gestao_exigir_usuario(TEXT)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gestao_txt(JSONB, TEXT)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gestao_uuid(JSONB, TEXT, TEXT)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION gestao_links_validar(JSONB)       FROM PUBLIC, anon, authenticated;

-- ══════════════════════════════════════════════════════════════
-- Plano de Ação
-- ══════════════════════════════════════════════════════════════

-- Cria (p_id null) ou edita uma atividade/subtarefa. p_dados é parcial: só
-- as chaves presentes mudam. Chaves: descritivo, subarea_id, parent_id
-- (criação), status, resp_final_id, prazo, prioridade, observacao,
-- exec [ids] (substitui), processo_id / rotina_origem_id / balanco_origem_id (criação).
CREATE OR REPLACE FUNCTION gestao_atividade_salvar(p_usuario_id TEXT, p_id UUID, p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
  d     JSONB := coalesce(p_dados, '{}'::jsonb);
  a     gestao_atividades%ROWTYPE;
  v_old gestao_atividades%ROWTYPE;
  pai   gestao_atividades%ROWTYPE;
  v_pai UUID;
  v_tmp TEXT;
  u     TEXT;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO a FROM gestao_atividades WHERE id = p_id AND NOT arquivado FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Atividade não encontrada'; END IF;
    v_old := a;
  ELSE
    a.id := gen_random_uuid();
    a.status := 'a_fazer'; a.prioridade := 3; a.observacao := ''; a.arquivado := false;
    a.criado_por := v_uid; a.criado_em := NOW();
    a.posicao := coalesce((SELECT max(posicao) FROM gestao_atividades), 0) + 1000;

    v_pai := gestao_uuid(d, 'parent_id', 'Atividade não encontrada');
    IF v_pai IS NOT NULL THEN
      SELECT * INTO pai FROM gestao_atividades WHERE id = v_pai AND NOT arquivado;
      IF NOT FOUND THEN RAISE EXCEPTION 'Atividade não encontrada'; END IF;
      IF pai.parent_id IS NOT NULL THEN RAISE EXCEPTION 'Subtarefa não pode ter subtarefa'; END IF;
      a.parent_id := pai.id; a.subarea_id := pai.subarea_id; a.prioridade := pai.prioridade;
    END IF;

    a.processo_id := gestao_uuid(d, 'processo_id', 'Processo não encontrado');
    IF a.processo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gestao_processos WHERE id = a.processo_id AND NOT arquivado) THEN
      RAISE EXCEPTION 'Processo não encontrado';
    END IF;
    a.rotina_origem_id := gestao_uuid(d, 'rotina_origem_id', 'Rotina não encontrada');
    IF a.rotina_origem_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM gestao_rotinas WHERE id = a.rotina_origem_id) THEN RAISE EXCEPTION 'Rotina não encontrada'; END IF;
      a.balanco_origem_id := gestao_uuid(d, 'balanco_origem_id', 'Balanço não encontrado');
      IF a.balanco_origem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gestao_balancos WHERE id = a.balanco_origem_id) THEN
        RAISE EXCEPTION 'Balanço não encontrado';
      END IF;
    END IF;
  END IF;

  IF d ? 'descritivo' THEN a.descritivo := trim(coalesce(d->>'descritivo', '')); END IF;
  IF d ? 'subarea_id' AND a.parent_id IS NULL THEN a.subarea_id := gestao_uuid(d, 'subarea_id', 'Escolha a sub-área'); END IF;
  IF d ? 'status' THEN a.status := d->>'status'; END IF;
  IF d ? 'resp_final_id' THEN a.resp_final_id := gestao_txt(d, 'resp_final_id'); END IF;
  IF d ? 'prazo' THEN
    v_tmp := gestao_txt(d, 'prazo');
    IF v_tmp IS NOT NULL AND v_tmp !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'Prazo inválido'; END IF;
    a.prazo := v_tmp::date;
  END IF;
  IF d ? 'prioridade' THEN
    IF coalesce(d->>'prioridade', '') !~ '^[123]$' THEN RAISE EXCEPTION 'Prioridade inválida'; END IF;
    a.prioridade := (d->>'prioridade')::smallint;
  END IF;
  IF d ? 'observacao' THEN a.observacao := coalesce(d->>'observacao', ''); END IF;

  IF coalesce(a.descritivo, '') = '' THEN RAISE EXCEPTION 'Descreva a atividade'; END IF;
  IF NOT EXISTS (SELECT 1 FROM gestao_subareas WHERE id = a.subarea_id AND ativo) THEN RAISE EXCEPTION 'Escolha a sub-área'; END IF;
  IF a.status IS NULL OR a.status NOT IN ('a_fazer','em_andamento','concluido') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  IF a.resp_final_id IS NOT NULL AND NOT gestao_usuario_valido(a.resp_final_id) THEN RAISE EXCEPTION 'Responsável inválido'; END IF;

  IF d ? 'exec' THEN
    IF jsonb_typeof(d->'exec') <> 'array' THEN RAISE EXCEPTION 'Responsável de execução inválido'; END IF;
    FOR u IN SELECT trim(x) FROM jsonb_array_elements_text(d->'exec') x LOOP
      IF NOT gestao_usuario_valido(u) THEN RAISE EXCEPTION 'Responsável de execução inválido'; END IF;
    END LOOP;
  END IF;

  a.concluido_em := CASE WHEN a.status = 'concluido' THEN coalesce(a.concluido_em, NOW()) END;
  a.atualizado_por := v_uid; a.atualizado_em := NOW();

  IF p_id IS NULL THEN
    INSERT INTO gestao_atividades VALUES (a.*);
    INSERT INTO gestao_atividade_hist (atividade_id, usuario_id, campo, para) VALUES (a.id, v_uid, 'criada', a.descritivo);
  ELSE
    UPDATE gestao_atividades
       SET subarea_id = a.subarea_id, descritivo = a.descritivo, status = a.status, resp_final_id = a.resp_final_id,
           prazo = a.prazo, prioridade = a.prioridade, observacao = a.observacao, concluido_em = a.concluido_em,
           atualizado_por = a.atualizado_por, atualizado_em = a.atualizado_em
     WHERE id = a.id;
    INSERT INTO gestao_atividade_hist (atividade_id, usuario_id, campo, de, para)
    SELECT a.id, v_uid, c, de, para FROM (VALUES
      ('status',        v_old.status,              a.status),
      ('resp_final_id', v_old.resp_final_id,       a.resp_final_id),
      ('prazo',         v_old.prazo::text,         a.prazo::text),
      ('prioridade',    v_old.prioridade::text,    a.prioridade::text),
      ('descritivo',    v_old.descritivo,          a.descritivo),
      ('subarea_id',    v_old.subarea_id::text,    a.subarea_id::text)
    ) x(c, de, para) WHERE de IS DISTINCT FROM para;
    -- Sub-área da mãe mudou → subtarefas acompanham
    IF a.parent_id IS NULL AND a.subarea_id IS DISTINCT FROM v_old.subarea_id THEN
      UPDATE gestao_atividades SET subarea_id = a.subarea_id WHERE parent_id = a.id;
    END IF;
  END IF;

  IF d ? 'exec' THEN
    DELETE FROM gestao_atividade_exec WHERE atividade_id = a.id;
    INSERT INTO gestao_atividade_exec (atividade_id, usuario_id)
    SELECT DISTINCT a.id, trim(x) FROM jsonb_array_elements_text(d->'exec') x;
  END IF;

  RETURN a.id;
END $$;

-- Arquiva a atividade e as subtarefas dela
CREATE OR REPLACE FUNCTION gestao_atividade_arquivar(p_usuario_id TEXT, p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
BEGIN
  UPDATE gestao_atividades SET arquivado = true, atualizado_por = v_uid, atualizado_em = NOW()
   WHERE id = p_id AND NOT arquivado;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atividade não encontrada'; END IF;
  UPDATE gestao_atividades SET arquivado = true, atualizado_por = v_uid, atualizado_em = NOW()
   WHERE parent_id = p_id AND NOT arquivado;
  INSERT INTO gestao_atividade_hist (atividade_id, usuario_id, campo) VALUES (p_id, v_uid, 'arquivada');
END $$;

-- Substitui a lista inteira de links de entrega: [{ tipo, titulo, url }]
CREATE OR REPLACE FUNCTION gestao_atividade_links(p_usuario_id TEXT, p_id UUID, p_links JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
BEGIN
  PERFORM 1 FROM gestao_atividades WHERE id = p_id AND NOT arquivado FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atividade não encontrada'; END IF;
  PERFORM gestao_links_validar(p_links);
  DELETE FROM gestao_atividade_links WHERE atividade_id = p_id;
  INSERT INTO gestao_atividade_links (atividade_id, tipo, titulo, url, ordem, criado_por)
  SELECT p_id, l->>'tipo', coalesce(trim(l->>'titulo'), ''), trim(l->>'url'), (n - 1)::smallint, v_uid
    FROM jsonb_array_elements(coalesce(nullif(p_links, 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS t(l, n);
END $$;

-- ══════════════════════════════════════════════════════════════
-- Processos
-- ══════════════════════════════════════════════════════════════

-- Cria/edita um processo. Chaves: nome, subarea_id, descricao, status,
-- responsavel_id, revisado_em, recursos [{ tipo, titulo, url }] (substitui).
CREATE OR REPLACE FUNCTION gestao_processo_salvar(p_usuario_id TEXT, p_id UUID, p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
  d     JSONB := coalesce(p_dados, '{}'::jsonb);
  p     gestao_processos%ROWTYPE;
  v_tmp TEXT;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO p FROM gestao_processos WHERE id = p_id AND NOT arquivado FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
  ELSE
    p.id := gen_random_uuid(); p.descricao := ''; p.status := 'a_construir'; p.arquivado := false;
    p.ordem := coalesce((SELECT max(ordem) FROM gestao_processos), 0) + 1;
    p.criado_por := v_uid; p.criado_em := NOW();
  END IF;

  IF d ? 'nome' THEN p.nome := trim(coalesce(d->>'nome', '')); END IF;
  IF d ? 'subarea_id' THEN p.subarea_id := gestao_uuid(d, 'subarea_id', 'Escolha a sub-área'); END IF;
  IF d ? 'descricao' THEN p.descricao := coalesce(d->>'descricao', ''); END IF;
  IF d ? 'status' THEN p.status := d->>'status'; END IF;
  IF d ? 'responsavel_id' THEN p.responsavel_id := gestao_txt(d, 'responsavel_id'); END IF;
  IF d ? 'revisado_em' THEN
    v_tmp := gestao_txt(d, 'revisado_em');
    IF v_tmp IS NOT NULL AND v_tmp !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'Data de revisão inválida'; END IF;
    p.revisado_em := v_tmp::date;
  END IF;

  IF coalesce(p.nome, '') = '' THEN RAISE EXCEPTION 'Dê um nome ao processo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM gestao_subareas WHERE id = p.subarea_id AND ativo) THEN RAISE EXCEPTION 'Escolha a sub-área'; END IF;
  IF p.status IS NULL OR p.status NOT IN ('a_construir','em_construcao','implantado','em_revisao') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  IF p.responsavel_id IS NOT NULL AND NOT gestao_usuario_valido(p.responsavel_id) THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
  IF d ? 'recursos' THEN PERFORM gestao_links_validar(d->'recursos'); END IF;

  p.atualizado_em := NOW();
  IF p_id IS NULL THEN
    INSERT INTO gestao_processos VALUES (p.*);
  ELSE
    UPDATE gestao_processos
       SET nome = p.nome, subarea_id = p.subarea_id, descricao = p.descricao, status = p.status,
           responsavel_id = p.responsavel_id, revisado_em = p.revisado_em, atualizado_em = p.atualizado_em
     WHERE id = p.id;
  END IF;

  IF d ? 'recursos' THEN
    DELETE FROM gestao_processo_rec WHERE processo_id = p.id;
    INSERT INTO gestao_processo_rec (processo_id, tipo, titulo, url, ordem)
    SELECT p.id, r->>'tipo', coalesce(trim(r->>'titulo'), ''), trim(r->>'url'), (n - 1)::smallint
      FROM jsonb_array_elements(coalesce(nullif(d->'recursos', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY AS t(r, n);
  END IF;
  RETURN p.id;
END $$;

CREATE OR REPLACE FUNCTION gestao_processo_arquivar(p_usuario_id TEXT, p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM gestao_exigir_usuario(p_usuario_id);
  UPDATE gestao_processos SET arquivado = true, atualizado_em = NOW() WHERE id = p_id AND NOT arquivado;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Rotinas e Balanço
-- ══════════════════════════════════════════════════════════════

-- Cria/edita uma rotina. Chaves: subarea_id, titulo, descricao, processo_id, ativo.
CREATE OR REPLACE FUNCTION gestao_rotina_salvar(p_usuario_id TEXT, p_id UUID, p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
  d     JSONB := coalesce(p_dados, '{}'::jsonb);
  r     gestao_rotinas%ROWTYPE;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO r FROM gestao_rotinas WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rotina não encontrada'; END IF;
  ELSE
    r.id := gen_random_uuid(); r.descricao := ''; r.ativo := true;
    r.ordem := coalesce((SELECT max(ordem) FROM gestao_rotinas), 0) + 1;
    r.criado_por := v_uid; r.criado_em := NOW();
  END IF;

  IF d ? 'subarea_id' THEN r.subarea_id := gestao_uuid(d, 'subarea_id', 'Escolha a sub-área'); END IF;
  IF d ? 'titulo' THEN r.titulo := trim(coalesce(d->>'titulo', '')); END IF;
  IF d ? 'descricao' THEN r.descricao := coalesce(d->>'descricao', ''); END IF;
  IF d ? 'processo_id' THEN r.processo_id := gestao_uuid(d, 'processo_id', 'Processo não encontrado'); END IF;
  IF d ? 'ativo' THEN
    IF jsonb_typeof(d->'ativo') <> 'boolean' THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
    r.ativo := (d->>'ativo')::boolean;
  END IF;

  IF coalesce(r.titulo, '') = '' THEN RAISE EXCEPTION 'Descreva a rotina'; END IF;
  IF NOT EXISTS (SELECT 1 FROM gestao_subareas WHERE id = r.subarea_id) THEN RAISE EXCEPTION 'Escolha a sub-área'; END IF;
  IF r.processo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gestao_processos WHERE id = r.processo_id) THEN
    RAISE EXCEPTION 'Processo não encontrado';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO gestao_rotinas VALUES (r.*);
  ELSE
    UPDATE gestao_rotinas
       SET subarea_id = r.subarea_id, titulo = r.titulo, descricao = r.descricao, processo_id = r.processo_id, ativo = r.ativo
     WHERE id = r.id;
  END IF;
  RETURN r.id;
END $$;

-- Abre o balanço do mês (idempotente: se já existe, devolve o mesmo id)
CREATE OR REPLACE FUNCTION gestao_balanco_abrir(p_usuario_id TEXT, p_mes DATE) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT := gestao_exigir_usuario(p_usuario_id);
  v_mes DATE := date_trunc('month', p_mes)::date;
  v_id  UUID;
BEGIN
  IF v_mes IS NULL THEN RAISE EXCEPTION 'Informe o mês'; END IF;
  IF v_mes > date_trunc('month', gestao_hoje())::date THEN RAISE EXCEPTION 'Não dá para abrir balanço de mês futuro'; END IF;
  SELECT id INTO v_id FROM gestao_balancos WHERE mes = v_mes;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM gestao_rotinas WHERE ativo) THEN RAISE EXCEPTION 'Cadastre ao menos uma rotina antes de começar'; END IF;

  INSERT INTO gestao_balancos (mes, aberto_por) VALUES (v_mes, v_uid)
  ON CONFLICT (mes) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM gestao_balancos WHERE mes = v_mes; END IF;
  RETURN v_id;
END $$;

-- Responde uma rotina no balanço: 'sim' | 'nao' | null (limpa a resposta).
-- A observação só é guardada no "Não"; é obrigatória na hora de fechar.
CREATE OR REPLACE FUNCTION gestao_balanco_responder(
  p_usuario_id TEXT, p_balanco_id UUID, p_rotina_id UUID, p_resposta TEXT, p_observacao TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    TEXT := gestao_exigir_usuario(p_usuario_id);
  v_status TEXT;
  r        gestao_rotinas%ROWTYPE;
BEGIN
  SELECT status INTO v_status FROM gestao_balancos WHERE id = p_balanco_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Balanço não encontrado'; END IF;
  IF v_status = 'fechado' THEN RAISE EXCEPTION 'Balanço fechado não pode ser alterado'; END IF;
  SELECT * INTO r FROM gestao_rotinas WHERE id = p_rotina_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rotina não encontrada'; END IF;
  IF p_resposta IS NOT NULL AND p_resposta NOT IN ('sim','nao') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;

  IF p_resposta IS NULL THEN
    DELETE FROM gestao_balanco_aval WHERE balanco_id = p_balanco_id AND rotina_id = p_rotina_id;
    RETURN;
  END IF;

  INSERT INTO gestao_balanco_aval (balanco_id, rotina_id, resposta, observacao, rotina_titulo, subarea_id, respondido_por, respondido_em)
  VALUES (p_balanco_id, p_rotina_id, p_resposta,
          CASE WHEN p_resposta = 'nao' THEN coalesce(trim(p_observacao), '') ELSE '' END,
          r.titulo, r.subarea_id, v_uid, NOW())
  ON CONFLICT (balanco_id, rotina_id) DO UPDATE
     SET resposta = EXCLUDED.resposta, observacao = EXCLUDED.observacao, rotina_titulo = EXCLUDED.rotina_titulo,
         subarea_id = EXCLUDED.subarea_id, respondido_por = EXCLUDED.respondido_por, respondido_em = EXCLUDED.respondido_em;
END $$;

-- Fecha o balanço: todas as rotinas ativas respondidas e todo "Não" com observação.
CREATE OR REPLACE FUNCTION gestao_balanco_fechar(p_usuario_id TEXT, p_balanco_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    TEXT := gestao_exigir_usuario(p_usuario_id);
  v_status TEXT;
  v_n      INTEGER;
BEGIN
  SELECT status INTO v_status FROM gestao_balancos WHERE id = p_balanco_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Balanço não encontrado'; END IF;
  IF v_status = 'fechado' THEN RAISE EXCEPTION 'Balanço já está fechado'; END IF;

  SELECT count(*) INTO v_n FROM gestao_rotinas r
   WHERE r.ativo AND NOT EXISTS (SELECT 1 FROM gestao_balanco_aval v WHERE v.balanco_id = p_balanco_id AND v.rotina_id = r.id);
  IF v_n > 0 THEN RAISE EXCEPTION 'Faltam % rotina% sem resposta', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END; END IF;

  SELECT count(*) INTO v_n FROM gestao_balanco_aval
   WHERE balanco_id = p_balanco_id AND resposta = 'nao' AND trim(observacao) = '';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Escreva o que aconteceu em % resposta% "Não"', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END;
  END IF;

  -- Foto final do nome e da sub-área de cada rotina
  UPDATE gestao_balanco_aval v SET rotina_titulo = r.titulo, subarea_id = r.subarea_id
    FROM gestao_rotinas r WHERE v.balanco_id = p_balanco_id AND r.id = v.rotina_id;

  UPDATE gestao_balancos SET status = 'fechado', fechado_por = v_uid, fechado_em = NOW() WHERE id = p_balanco_id;
END $$;

-- VTP Atendimento — Módulo Omnichannel
-- Schema inicial. Segue o padrão atual do app (single-tenant, sem Supabase
-- Auth real ainda): atendente_id é INTEGER e referencia o id de vtp_users
-- (kv_store), não uma tabela profiles — essa não existe hoje. RLS fica aberta
-- para anon, igual ao restante do app (kv_store, cw_pedidos).

-- =====================================================
-- CANAIS DE COMUNICAÇÃO
-- =====================================================
CREATE TABLE atd_canais (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('whatsapp','instagram','ifood','google','voip')),
  nome        TEXT NOT NULL,                  -- ex: "WhatsApp VTP"
  config      JSONB NOT NULL DEFAULT '{}',    -- credenciais, instance_name, etc.
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- CONTATOS (clientes unificados entre canais)
-- =====================================================
CREATE TABLE atd_contatos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT,
  telefone            TEXT,                   -- normalizado: ddi+numero, só dígitos (5582...)
  instagram_id        TEXT,
  instagram_username  TEXT,
  avatar_url          TEXT,
  email               TEXT,
  canal_origem        TEXT,                   -- canal do primeiro contato
  total_pedidos       INT DEFAULT 0,          -- sincronizado via cw_pedidos
  ticket_medio        NUMERIC(10,2),
  ultima_compra_em    TIMESTAMPTZ,
  classificacao       TEXT,                   -- 'fiel'|'novo'|'em_risco'|'perdido'
  criado_em           TIMESTAMPTZ DEFAULT now(),
  atualizado_em       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX atd_contatos_telefone_uniq ON atd_contatos (telefone) WHERE telefone IS NOT NULL;

-- =====================================================
-- CONVERSAS
-- =====================================================
CREATE TABLE atd_conversas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id        UUID REFERENCES atd_contatos(id),
  canal_id          UUID REFERENCES atd_canais(id),
  canal_tipo        TEXT NOT NULL,            -- snapshot do tipo para queries rápidas
  status            TEXT DEFAULT 'aberta' CHECK (status IN ('aberta','concluida','expirada')),
  atendente_id      INTEGER,                 -- vtp_users.id — quem está com a conversa agora
  aberta_por_id     INTEGER,                 -- vtp_users.id — quem recebeu primeiro
  concluida_por_id  INTEGER,
  pedido_id         TEXT,                    -- cw_pedidos.id (não display_id) como texto, se vinculado
  pedido_data       JSONB,                   -- snapshot do pedido no momento em que a conversa foi aberta/vinculada
  sla_prazo         TIMESTAMPTZ,
  sla_violado       BOOLEAN DEFAULT false,
  piloto_ativo      BOOLEAN DEFAULT false,
  criado_em         TIMESTAMPTZ DEFAULT now(),
  atualizado_em     TIMESTAMPTZ DEFAULT now(),
  concluida_em      TIMESTAMPTZ
);

-- =====================================================
-- MENSAGENS
-- =====================================================
CREATE TABLE atd_mensagens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id         UUID NOT NULL REFERENCES atd_conversas(id),
  origem              TEXT NOT NULL CHECK (origem IN ('cliente','atendente','bot','sistema')),
  atendente_id        INTEGER,               -- vtp_users.id — null se for do cliente/bot
  visibilidade        TEXT DEFAULT 'publica' CHECK (visibilidade IN ('publica','interna')),
  tipo                TEXT DEFAULT 'texto' CHECK (tipo IN (
    'texto','imagem','audio','video','documento',
    'localizacao','sticker','contato','template'
  )),
  conteudo            JSONB NOT NULL,        -- { texto, url, latitude, longitude, nome, etc. }
  conteudo_original   TEXT,                  -- o que o atendente digitou antes da IA corrigir
  conteudo_enviado    TEXT,                  -- o que o cliente recebeu
  foi_corrigida_ia     BOOLEAN DEFAULT false,
  external_id         TEXT,                  -- ID da mensagem no WhatsApp/Instagram
  enviado_em          TIMESTAMPTZ DEFAULT now(),
  lido_em             TIMESTAMPTZ,
  entregue_em         TIMESTAMPTZ
);

CREATE UNIQUE INDEX atd_mensagens_external_id_uniq ON atd_mensagens (external_id) WHERE external_id IS NOT NULL;

-- =====================================================
-- TAGS
-- =====================================================
CREATE TABLE atd_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  categoria       TEXT NOT NULL,             -- 'Serviço'|'Entrega'|'Produto'|'Preço'|'Reputação'|'Resolução'
  sentimento      TEXT CHECK (sentimento IN ('positivo','negativo','neutro')),
  cor             TEXT,                      -- hex para exibição
  peso_reputacao  INT DEFAULT 5,             -- 1-10: impacto na reputação da marca
  ativo           BOOLEAN DEFAULT true
);

CREATE TABLE atd_conversa_tags (
  conversa_id     UUID REFERENCES atd_conversas(id),
  tag_id          UUID REFERENCES atd_tags(id),
  origem          TEXT CHECK (origem IN ('ia','manual')),
  atendente_id    INTEGER,                   -- vtp_users.id
  justificativa   TEXT,                      -- por que a IA aplicou esta tag
  confirmada      BOOLEAN DEFAULT false,     -- gerente validou ou corrigiu
  aplicada_em     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (conversa_id, tag_id)
);

-- =====================================================
-- ALERTAS DE ATENDIMENTO
-- =====================================================
CREATE TABLE atd_alertas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id   UUID REFERENCES atd_conversas(id),
  tipo          TEXT NOT NULL CHECK (tipo IN (
    'demora_resposta','cliente_ignorado','risco_reputacao',
    'risco_juridico','qualidade_produto','piloto_precisa_humano',
    'sla_violado','atendente_idle','fila_critica'
  )),
  severidade    TEXT CHECK (severidade IN ('baixa','media','alta','critica')),
  titulo        TEXT NOT NULL,
  mensagem      TEXT NOT NULL,
  sugestao      TEXT,                        -- o que a IA sugere fazer
  origem        TEXT CHECK (origem IN ('regra','ia')),
  lido_por_id   INTEGER,                     -- vtp_users.id
  lido_em       TIMESTAMPTZ,
  resolvido     BOOLEAN DEFAULT false,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- HISTÓRICO DE ATENDENTES POR CONVERSA
-- =====================================================
CREATE TABLE atd_conversa_historico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id   UUID REFERENCES atd_conversas(id),
  atendente_id  INTEGER,                     -- vtp_users.id
  acao          TEXT CHECK (acao IN ('assumiu','transferiu','concluiu','observou','escalou')),
  nota          TEXT,
  em            TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SESSÕES DOS ATENDENTES (presença online)
-- =====================================================
CREATE TABLE atd_sessoes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id                INTEGER,         -- vtp_users.id
  entrou_em                 TIMESTAMPTZ DEFAULT now(),
  saiu_em                   TIMESTAMPTZ,
  conversas_atendidas       INT DEFAULT 0,
  mensagens_enviadas        INT DEFAULT 0,
  tempo_medio_resposta_seg  INT
);

-- =====================================================
-- BASE DE CONHECIMENTO (configuração da IA)
-- =====================================================
CREATE TABLE atd_base_conhecimento (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secao           TEXT NOT NULL CHECK (secao IN (
    'tom_voz','gestao_crise','compensacoes',
    'slas','gatilhos_insight','piloto_limites',
    'info_loja','politicas_gerais'
  )),
  titulo          TEXT NOT NULL,
  conteudo        TEXT NOT NULL,
  ativo           BOOLEAN DEFAULT true,
  atualizado_em   TIMESTAMPTZ DEFAULT now(),
  atualizado_por  INTEGER                    -- vtp_users.id
);

-- =====================================================
-- RESPOSTAS RÁPIDAS
-- =====================================================
CREATE TABLE atd_respostas_rapidas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atalho      TEXT NOT NULL,                 -- ex: "/horario", "/cardapio"
  titulo      TEXT NOT NULL,
  conteudo    TEXT NOT NULL,
  canal_tipo  TEXT DEFAULT 'todos',           -- 'todos'|'whatsapp'|'instagram'
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ÍNDICES CRÍTICOS
-- =====================================================
CREATE INDEX idx_conversas_status        ON atd_conversas(status);
CREATE INDEX idx_conversas_atendente     ON atd_conversas(atendente_id) WHERE status = 'aberta';
CREATE INDEX idx_mensagens_conversa      ON atd_mensagens(conversa_id, enviado_em DESC);
CREATE INDEX idx_alertas_nao_lidos       ON atd_alertas(resolvido) WHERE resolvido = false;
CREATE INDEX idx_contatos_telefone       ON atd_contatos(telefone);

-- =====================================================
-- RLS — aberta para anon, igual ao padrão atual do app (kv_store, cw_pedidos).
-- Escrita também liberada porque o app não tem Supabase Auth real ainda —
-- revisar quando a fundação de auth/RLS por usuário for migrada.
-- =====================================================
ALTER TABLE atd_canais             ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_contatos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_conversas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_mensagens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_conversa_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_alertas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_conversa_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_sessoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_base_conhecimento  ENABLE ROW LEVEL SECURITY;
ALTER TABLE atd_respostas_rapidas  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'atd_canais','atd_contatos','atd_conversas','atd_mensagens','atd_tags',
    'atd_conversa_tags','atd_alertas','atd_conversa_historico','atd_sessoes',
    'atd_base_conhecimento','atd_respostas_rapidas'
  ] LOOP
    EXECUTE format('CREATE POLICY "anon_read_%1$s" ON %1$s FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_write_%1$s" ON %1$s FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anon_update_%1$s" ON %1$s FOR UPDATE USING (true)', t);
  END LOOP;
END $$;

-- VTP Marketing — Módulo de Criadores/Afiliados
-- Adaptado do schema recebido pronto (vtp_creators_schema.sql), removendo
-- empresa_id / FKs pra profiles (esse app é single-tenant e não tem Supabase
-- Auth real — mesmo padrão documentado em 20260627000000_atendimento_schema.sql).
-- Campos que seriam FK pra um usuário da equipe (aprovado_por, revisado_por,
-- pago_por, etc.) viram TEXT com o nome do funcionário, igual a ordens.resp
-- em js/modules.js. RLS aberta para anon, igual ao restante do app.

-- =====================================================
-- 1. CREATORS — cadastro do criador
-- =====================================================
CREATE TABLE mkt_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  nome text NOT NULL,
  telefone text,                          -- WhatsApp — contato + login OTP no portal
  instagram_handle text,
  tiktok_handle text,

  seguidores_instagram int,               -- snapshot no cadastro (não é live)
  seguidores_tiktok int,
  nicho text,                             -- ex: 'comida', 'lifestyle', 'humor local'

  -- comercial
  tipo_remuneracao text NOT NULL DEFAULT 'comissao'
    CHECK (tipo_remuneracao IN ('comissao', 'fee_fixo', 'hibrido', 'permuta')),
  comissao_percentual numeric(5,2),        -- ex: 10.00 = 10%
  comissao_valor_fixo numeric(10,2),       -- alternativa: R$ fixo por pedido
  fee_fixo_mensal numeric(10,2),           -- se hibrido/fee_fixo

  -- fiscal/pagamento
  documento text,                          -- CPF ou CNPJ
  chave_pix text,
  emite_nota_fiscal boolean DEFAULT false,

  -- guideline aceito no onboarding (captação pública ou cadastro manual)
  guideline_aceito boolean DEFAULT false,
  guideline_aceito_em timestamptz,
  guideline_versao text,

  status text NOT NULL DEFAULT 'em_aprovacao'
    CHECK (status IN ('em_aprovacao', 'ativo', 'pausado', 'encerrado', 'reprovado')),

  origem text NOT NULL DEFAULT 'captacao_publica'
    CHECK (origem IN ('captacao_publica', 'cadastro_manual')),
  aprovado_por text,                       -- nome do staff que aprovou o cadastro
  aprovado_em timestamptz,

  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX mkt_creators_telefone_uniq ON mkt_creators(telefone) WHERE telefone IS NOT NULL;
CREATE INDEX idx_mkt_creators_status ON mkt_creators(status);


-- =====================================================
-- 2. CREATOR_COUPONS — cupons vinculados a cada criador
-- =====================================================
CREATE TABLE mkt_creator_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  codigo text NOT NULL UNIQUE,             -- ex: 'MARIA10'
  ativo boolean DEFAULT true,

  desconto_tipo text NOT NULL DEFAULT 'percentual'
    CHECK (desconto_tipo IN ('percentual', 'valor_fixo')),
  desconto_valor numeric(10,2) NOT NULL,
  valor_minimo_pedido numeric(10,2),
  apenas_cliente_novo boolean DEFAULT false,   -- evita pagar comissão em cliente recorrente já seu
  limite_usos_total int,                       -- null = ilimitado
  limite_usos_por_cliente int DEFAULT 1,       -- trava por telefone (decisão fechada)

  valido_de date,
  valido_ate date,

  motivo_desativacao text,                     -- ex: vazamento/fraude
  desativado_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_coupons_creator ON mkt_creator_coupons(creator_id);
CREATE INDEX idx_mkt_coupons_codigo  ON mkt_creator_coupons(codigo) WHERE ativo = true;


-- =====================================================
-- 3. CREATOR_REDEMPTIONS — pedidos que usaram um cupom de criador
--    origem='automatica': conciliado contra cw_pedidos.coupon_code
--    origem='manual': staff vinculou na mão (fallback se o CW não expuser cupom)
-- =====================================================
CREATE TABLE mkt_creator_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),
  coupon_id uuid NOT NULL REFERENCES mkt_creator_coupons(id),

  pedido_id text NOT NULL,                 -- cw_pedidos.id
  pedido_valor_bruto numeric(10,2) NOT NULL,
  pedido_valor_desconto numeric(10,2) NOT NULL DEFAULT 0,

  -- comissão sobre valor bruto do pedido (decisão fechada)
  base_comissionavel numeric(10,2) NOT NULL,

  cliente_telefone text,                    -- trava de uso único por telefone
  cliente_e_novo boolean,

  comissao_calculada numeric(10,2) NOT NULL,
  comissao_valida boolean DEFAULT true,     -- false se violou regra (ex: cliente repetido em cupom "só novo")
  motivo_invalidacao text,

  origem text NOT NULL DEFAULT 'automatica' CHECK (origem IN ('automatica', 'manual')),
  registrado_por text,                      -- nome do staff, quando origem = 'manual'

  status_pagamento text NOT NULL DEFAULT 'pendente'
    CHECK (status_pagamento IN ('pendente', 'aprovado', 'pago', 'estornado')),

  pedido_criado_em timestamptz NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_redemptions_creator    ON mkt_creator_redemptions(creator_id, pedido_criado_em);
CREATE INDEX idx_mkt_redemptions_coupon     ON mkt_creator_redemptions(coupon_id);
CREATE INDEX idx_mkt_redemptions_pagamento  ON mkt_creator_redemptions(status_pagamento);
CREATE UNIQUE INDEX idx_mkt_redemptions_pedido_unico ON mkt_creator_redemptions(pedido_id);


-- =====================================================
-- 4. CREATOR_CONTENT — aprovação prévia + registro do que foi ao ar
-- =====================================================
CREATE TABLE mkt_creator_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  tipo text NOT NULL CHECK (tipo IN ('post', 'story', 'reels', 'video_tiktok', 'outro')),
  link_publicado text,
  print_url text,                          -- screenshot enviado pelo criador (bucket mkt-midias)

  roteiro_texto text,                      -- enviado ANTES de publicar
  aprovacao_status text NOT NULL DEFAULT 'pendente'
    CHECK (aprovacao_status IN ('pendente', 'aprovado', 'reprovado', 'aprovado_com_ajuste')),
  aprovado_por text,                       -- qualquer staff com a permissão (decisão fechada)
  aprovado_em timestamptz,
  motivo_reprovacao text,

  publicado_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_content_creator    ON mkt_creator_content(creator_id);
CREATE INDEX idx_mkt_content_aprovacao  ON mkt_creator_content(aprovacao_status);


-- =====================================================
-- 5. CREATOR_BRAND_COMPLIANCE — auditoria de aderência à marca (cadência quinzenal)
-- =====================================================
CREATE TABLE mkt_creator_brand_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),
  content_id uuid REFERENCES mkt_creator_content(id),  -- null se auditoria geral

  revisado_por text,
  revisado_em timestamptz NOT NULL DEFAULT now(),

  mencionou_marca_corretamente boolean,
  seguiu_guideline_preco boolean,
  seguiu_guideline_tom boolean,
  mencionou_concorrente boolean DEFAULT false,
  cupom_visivel_no_conteudo boolean,

  nota_aderencia int CHECK (nota_aderencia BETWEEN 1 AND 5),
  observacoes text,

  acao_recomendada text
    CHECK (acao_recomendada IN ('nenhuma', 'alerta_informal', 'advertencia_formal', 'suspender_cupom', 'encerrar_parceria')),

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_compliance_creator ON mkt_creator_brand_compliance(creator_id, revisado_em);


-- =====================================================
-- 6. CREATOR_PAYOUTS — ciclo de pagamento
-- =====================================================
CREATE TABLE mkt_creator_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,

  valor_total numeric(10,2) NOT NULL,
  qtd_pedidos int NOT NULL,

  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'pago', 'cancelado')),

  forma_pagamento text CHECK (forma_pagamento IN ('pix', 'transferencia', 'permuta')),
  comprovante_url text,
  nota_fiscal_url text,

  pago_em timestamptz,
  pago_por text,

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_payouts_creator ON mkt_creator_payouts(creator_id, periodo_inicio);
CREATE INDEX idx_mkt_payouts_status  ON mkt_creator_payouts(status);


-- =====================================================
-- 7. CREATOR_PAYOUT_ITEMS — vínculo N:N entre payout e as redemptions pagas
-- =====================================================
CREATE TABLE mkt_creator_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES mkt_creator_payouts(id),
  redemption_id uuid NOT NULL REFERENCES mkt_creator_redemptions(id),

  UNIQUE(redemption_id)
);

CREATE INDEX idx_mkt_payout_items_payout ON mkt_creator_payout_items(payout_id);


-- =====================================================
-- 8. CREATOR_MENTIONS — marcações captadas via Instagram Graph API (polling)
-- =====================================================
CREATE TABLE mkt_creator_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES mkt_creators(id),   -- null até vincular (handle não bateu)

  plataforma text NOT NULL DEFAULT 'instagram'
    CHECK (plataforma IN ('instagram', 'tiktok', 'facebook')),
  tipo_mencao text NOT NULL CHECK (tipo_mencao IN ('post', 'story', 'comentario', 'reels')),

  instagram_media_id text,
  autor_handle text NOT NULL,
  link_conteudo text,

  capturado_em timestamptz NOT NULL DEFAULT now(),
  publicado_em timestamptz,

  vinculado_content_id uuid REFERENCES mkt_creator_content(id),

  UNIQUE(plataforma, instagram_media_id)
);

CREATE INDEX idx_mkt_mentions_creator ON mkt_creator_mentions(creator_id);
CREATE INDEX idx_mkt_mentions_handle  ON mkt_creator_mentions(autor_handle) WHERE creator_id IS NULL;


-- =====================================================
-- 9. CREATOR_CONTENT_METRICS — alcance/engajamento via print manual
-- =====================================================
CREATE TABLE mkt_creator_content_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  mention_id uuid REFERENCES mkt_creator_mentions(id),
  content_id uuid REFERENCES mkt_creator_content(id),

  alcance int,
  impressoes int,
  curtidas int,
  comentarios int,
  compartilhamentos int,
  respostas_story int,
  cliques_link int,

  print_url text NOT NULL,               -- obrigatório — é a prova (bucket mkt-midias)
  enviado_pelo_creator boolean DEFAULT true,

  registrado_por text,
  registrado_em timestamptz NOT NULL DEFAULT now(),

  observacoes text
);

CREATE INDEX idx_mkt_content_metrics_creator ON mkt_creator_content_metrics(creator_id, registrado_em);
CREATE INDEX idx_mkt_content_metrics_mention ON mkt_creator_content_metrics(mention_id);


-- =====================================================
-- 10. CREATOR_POINTS — ledger append-only de pontos (ranking = SUM por criador)
--     origem_id aponta pra redemption/compliance/challenge_progress que gerou
--     o ponto; o índice único evita contar o mesmo evento duas vezes.
-- =====================================================
CREATE TABLE mkt_creator_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  origem_tipo text NOT NULL CHECK (origem_tipo IN ('venda', 'compliance', 'desafio')),
  origem_id uuid,

  pontos int NOT NULL,
  descricao text,

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_points_creator ON mkt_creator_points(creator_id);
CREATE UNIQUE INDEX idx_mkt_points_origem_unico ON mkt_creator_points(origem_tipo, origem_id) WHERE origem_id IS NOT NULL;


-- =====================================================
-- 11. CREATOR_CHALLENGES — desafios criados pela gestão
-- =====================================================
CREATE TABLE mkt_creator_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  titulo text NOT NULL,
  descricao text,

  -- 'pedidos_periodo'/'conteudo_postado' calculam progresso automaticamente
  -- contra mkt_creator_redemptions/mkt_creator_content; 'manual' é marcado
  -- na mão pela gestão (critério híbrido — decisão fechada)
  tipo_criterio text NOT NULL CHECK (tipo_criterio IN ('pedidos_periodo', 'conteudo_postado', 'manual')),
  meta_valor numeric(10,2),

  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,

  pontos_recompensa int NOT NULL DEFAULT 0,
  premio_tipo text NOT NULL DEFAULT 'nenhum' CHECK (premio_tipo IN ('pix', 'permuta', 'bonus', 'nenhum')),
  premio_descricao text,
  premio_valor numeric(10,2),

  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado', 'cancelado')),

  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_challenges_status ON mkt_creator_challenges(status, periodo_fim);


-- =====================================================
-- 12. CREATOR_CHALLENGE_PROGRESS — progresso de cada criador em cada desafio
-- =====================================================
CREATE TABLE mkt_creator_challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),
  challenge_id uuid NOT NULL REFERENCES mkt_creator_challenges(id),

  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'expirado')),
  progresso_atual numeric(10,2) DEFAULT 0,

  concluido_em timestamptz,
  marcado_manualmente_por text,

  premio_entregue boolean DEFAULT false,
  premio_entregue_em timestamptz,

  criado_em timestamptz NOT NULL DEFAULT now(),

  UNIQUE(creator_id, challenge_id)
);

CREATE INDEX idx_mkt_challenge_progress_challenge ON mkt_creator_challenge_progress(challenge_id);


-- =====================================================
-- 13. CREATOR_OTP_CODES — códigos de acesso via WhatsApp (login do portal)
-- =====================================================
CREATE TABLE mkt_creator_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  codigo text NOT NULL,
  expira_em timestamptz NOT NULL,
  usado boolean DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_otp_telefone ON mkt_creator_otp_codes(telefone, criado_em DESC);


-- =====================================================
-- 14. CREATOR_SESSIONS — sessão do portal do criador (após validar o OTP)
-- =====================================================
CREATE TABLE mkt_creator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),
  token text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_sessions_creator ON mkt_creator_sessions(creator_id);


-- =====================================================
-- VIEW DE APOIO: performance consolidada por criador (Gestão + Portal)
-- =====================================================
CREATE VIEW mkt_creator_performance AS
SELECT
  c.id as creator_id,
  c.nome,
  c.status,
  count(r.id) filter (where r.comissao_valida) as pedidos_validos,
  count(r.id) filter (where not r.comissao_valida) as pedidos_invalidados,
  coalesce(sum(r.base_comissionavel) filter (where r.comissao_valida), 0) as faturamento_gerado,
  coalesce(sum(r.comissao_calculada) filter (where r.comissao_valida), 0) as comissao_total,
  coalesce(sum(r.comissao_calculada) filter (where r.comissao_valida and r.status_pagamento = 'pendente'), 0) as comissao_a_pagar,
  (select avg(nota_aderencia) from mkt_creator_brand_compliance bc where bc.creator_id = c.id) as media_aderencia_marca,
  (select count(*) from mkt_creator_brand_compliance bc where bc.creator_id = c.id and bc.acao_recomendada in ('advertencia_formal', 'suspender_cupom', 'encerrar_parceria')) as flags_criticas,
  (select count(*) from mkt_creator_mentions m where m.creator_id = c.id) as total_mencoes,
  (select sum(cm.alcance) from mkt_creator_content_metrics cm where cm.creator_id = c.id) as alcance_total,
  (select sum(cm.curtidas + cm.comentarios + cm.compartilhamentos) from mkt_creator_content_metrics cm where cm.creator_id = c.id) as engajamento_total,
  (select coalesce(sum(p.pontos), 0) from mkt_creator_points p where p.creator_id = c.id) as total_pontos
from mkt_creators c
left join mkt_creator_redemptions r on r.creator_id = c.id
group by c.id, c.nome, c.status;


-- =====================================================
-- TRIGGERS DE PONTUAÇÃO
-- Centraliza a regra de pontos aqui (não no JS) porque redemptions/compliance/
-- challenge_progress podem ser escritos por telas diferentes (Gestão, conciliação
-- automática, portal do criador) — um único lugar de verdade evita duplicar a
-- fórmula em vários arquivos e ficar dessincronizado.
-- =====================================================

-- 1 ponto por R$1 de comissão gerada (decisão fechada). Se a redemption for
-- invalidada depois (estorno/fraude), remove os pontos já concedidos por ela.
CREATE OR REPLACE FUNCTION _mkt_pontuar_venda() RETURNS trigger AS $$
BEGIN
  IF NEW.comissao_valida THEN
    INSERT INTO mkt_creator_points (creator_id, origem_tipo, origem_id, pontos, descricao)
    VALUES (NEW.creator_id, 'venda', NEW.id, floor(NEW.comissao_calculada)::int,
            'Pedido ' || NEW.pedido_id)
    ON CONFLICT (origem_tipo, origem_id) WHERE origem_id IS NOT NULL DO UPDATE
      SET pontos = floor(NEW.comissao_calculada)::int;
  ELSE
    DELETE FROM mkt_creator_points WHERE origem_tipo = 'venda' AND origem_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mkt_pontuar_venda
  AFTER INSERT OR UPDATE OF comissao_valida, comissao_calculada ON mkt_creator_redemptions
  FOR EACH ROW EXECUTE FUNCTION _mkt_pontuar_venda();

-- Só bonifica nota alta (4-5), não penaliza nota baixa (decisão fechada).
CREATE OR REPLACE FUNCTION _mkt_pontuar_compliance() RETURNS trigger AS $$
BEGIN
  IF NEW.nota_aderencia >= 4 THEN
    INSERT INTO mkt_creator_points (creator_id, origem_tipo, origem_id, pontos, descricao)
    VALUES (NEW.creator_id, 'compliance', NEW.id, NEW.nota_aderencia * 10,
            'Auditoria de marca — nota ' || NEW.nota_aderencia)
    ON CONFLICT (origem_tipo, origem_id) WHERE origem_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mkt_pontuar_compliance
  AFTER INSERT ON mkt_creator_brand_compliance
  FOR EACH ROW EXECUTE FUNCTION _mkt_pontuar_compliance();

-- Pontos + prêmio configurável ao concluir um desafio (decisão fechada).
CREATE OR REPLACE FUNCTION _mkt_pontuar_desafio() RETURNS trigger AS $$
DECLARE pts int;
BEGIN
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    SELECT pontos_recompensa INTO pts FROM mkt_creator_challenges WHERE id = NEW.challenge_id;
    INSERT INTO mkt_creator_points (creator_id, origem_tipo, origem_id, pontos, descricao)
    VALUES (NEW.creator_id, 'desafio', NEW.id, coalesce(pts, 0),
            'Desafio concluído')
    ON CONFLICT (origem_tipo, origem_id) WHERE origem_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mkt_pontuar_desafio
  AFTER UPDATE OF status ON mkt_creator_challenge_progress
  FOR EACH ROW EXECUTE FUNCTION _mkt_pontuar_desafio();


-- =====================================================
-- STORAGE — prints de Insights e anexos de conteúdo
-- Sem "TO authenticated" (como em atd-midias): este app não abre sessão real
-- de Supabase Auth em lugar nenhum, então uma policy authenticated-only nunca
-- seria satisfeita por um upload feito com a anon key — igual ao restante do app.
-- =====================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mkt-midias',
  'mkt-midias',
  true,
  20971520, -- 20 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mkt_midias_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'mkt-midias');

CREATE POLICY "mkt_midias_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'mkt-midias');


-- =====================================================
-- cw_pedidos: coluna de cupom, se a API do CW expuser (ver cw-sync/index.ts)
-- =====================================================
ALTER TABLE cw_pedidos ADD COLUMN IF NOT EXISTS coupon_code text;
CREATE INDEX IF NOT EXISTS idx_cw_pedidos_coupon ON cw_pedidos(coupon_code) WHERE coupon_code IS NOT NULL;


-- =====================================================
-- RLS — aberta para anon, igual ao padrão atual do app (atd_*, cw_pedidos).
-- =====================================================
ALTER TABLE mkt_creators                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_coupons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_redemptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_content           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_brand_compliance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_payouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_payout_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_mentions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_content_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_points            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_challenges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_otp_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_sessions          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mkt_creators','mkt_creator_coupons','mkt_creator_redemptions','mkt_creator_content',
    'mkt_creator_brand_compliance','mkt_creator_payouts','mkt_creator_payout_items',
    'mkt_creator_mentions','mkt_creator_content_metrics','mkt_creator_points',
    'mkt_creator_challenges','mkt_creator_challenge_progress',
    'mkt_creator_otp_codes','mkt_creator_sessions'
  ] LOOP
    EXECUTE format('CREATE POLICY "anon_read_%1$s" ON %1$s FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_write_%1$s" ON %1$s FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anon_update_%1$s" ON %1$s FOR UPDATE USING (true)', t);
  END LOOP;
END $$;

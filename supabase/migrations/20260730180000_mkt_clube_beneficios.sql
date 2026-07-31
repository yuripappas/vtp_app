-- VTP Marketing — benefícios do Clube de Criadores (kit de boas-vindas,
-- resgate de pontos, cupom de uso pessoal com preço de clube, nível embaixador)

-- =====================================================
-- 1. Kit de boas-vindas + nível (criador/embaixador)
-- =====================================================
ALTER TABLE mkt_creators
  ADD COLUMN kit_boas_vindas_enviado boolean NOT NULL DEFAULT false,
  ADD COLUMN kit_boas_vindas_enviado_em timestamptz,
  ADD COLUMN nivel text NOT NULL DEFAULT 'criador' CHECK (nivel IN ('criador', 'embaixador')),
  ADD COLUMN promovido_embaixador_em timestamptz,
  ADD COLUMN promovido_embaixador_por text;

-- =====================================================
-- 2. Cupom de uso pessoal (preço de clube) — mesmo mecanismo do cupom de
--    indicação, mas marcado como pessoal: não gera comissão e é o único
--    tipo que o próprio criador pode usar em si mesmo.
-- =====================================================
ALTER TABLE mkt_creator_coupons
  ADD COLUMN tipo text NOT NULL DEFAULT 'indicacao' CHECK (tipo IN ('indicacao', 'uso_pessoal'));

-- =====================================================
-- 3. CREATOR_RESGATES — resgate de pontos em PIX ou produto
--    (1 ponto = R$1, decisão fechada — valor_pix é só pontos_utilizados)
-- =====================================================
CREATE TABLE mkt_creator_resgates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  pontos_utilizados int NOT NULL CHECK (pontos_utilizados > 0),
  tipo text NOT NULL CHECK (tipo IN ('pix', 'produto')),
  valor_pix numeric(10,2),              -- = pontos_utilizados (1 ponto = R$1)
  produto_descricao text,               -- preenchido quando tipo = 'produto'

  status text NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'aprovado', 'pago', 'recusado')),
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  processado_por text,
  observacoes text
);

CREATE INDEX idx_mkt_resgates_creator ON mkt_creator_resgates(creator_id, solicitado_em);
CREATE INDEX idx_mkt_resgates_status ON mkt_creator_resgates(status);

-- =====================================================
-- 4. CREATOR_CAMPANHAS_EMBAIXADOR — campanhas oficiais periódicas com cachê
-- =====================================================
CREATE TABLE mkt_creator_campanhas_embaixador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES mkt_creators(id),

  titulo text NOT NULL,
  descricao text,
  cache_valor numeric(10,2),
  periodo_inicio date,
  periodo_fim date,

  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_campanhas_creator ON mkt_creator_campanhas_embaixador(creator_id);

-- =====================================================
-- View: adiciona pontos já resgatados (saldo disponível = total_pontos -
-- pontos_resgatados, calculado no frontend, igual ao resto do app)
-- =====================================================
CREATE OR REPLACE VIEW mkt_creator_performance AS
select
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
  (select coalesce(sum(p.pontos), 0) from mkt_creator_points p where p.creator_id = c.id) as total_pontos,
  (select coalesce(sum(rg.pontos_utilizados), 0) from mkt_creator_resgates rg where rg.creator_id = c.id and rg.status != 'recusado') as pontos_resgatados
from mkt_creators c
left join mkt_creator_redemptions r on r.creator_id = c.id
group by c.id, c.nome, c.status;

-- =====================================================
-- RLS — mesmo padrão anon-aberto do resto do módulo
-- =====================================================
ALTER TABLE mkt_creator_resgates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mkt_creator_campanhas_embaixador ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mkt_creator_resgates', 'mkt_creator_campanhas_embaixador'] LOOP
    EXECUTE format('CREATE POLICY "anon_read_%1$s" ON %1$s FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "anon_write_%1$s" ON %1$s FOR INSERT WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "anon_update_%1$s" ON %1$s FOR UPDATE USING (true)', t);
  END LOOP;
END $$;

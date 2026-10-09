-- VTP Marketing — thread de observações por item de conteúdo (com timestamp),
-- inspirado no padrão de revisão da CreatorAds: em vez de um único campo
-- motivo_reprovacao, cada aprovação/reprovação/observação manual vira uma
-- entrada no histórico, dando contexto de quem disse o quê e quando.
CREATE TABLE mkt_creator_content_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES mkt_creator_content(id),

  autor text,                -- nome do staff, ou null se anotação automática do sistema
  texto text NOT NULL,

  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_content_notas_content ON mkt_creator_content_notas(content_id, criado_em);

ALTER TABLE mkt_creator_content_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_mkt_creator_content_notas"   ON mkt_creator_content_notas FOR SELECT USING (true);
CREATE POLICY "anon_write_mkt_creator_content_notas"  ON mkt_creator_content_notas FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_mkt_creator_content_notas" ON mkt_creator_content_notas FOR UPDATE USING (true);

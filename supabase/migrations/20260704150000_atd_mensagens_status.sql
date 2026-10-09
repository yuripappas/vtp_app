-- Status de entrega/leitura das mensagens do atendente
-- sent = enviado ao servidor | delivered = entregue no dispositivo | read = lido pelo cliente
ALTER TABLE atd_mensagens
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sent','delivered','read'));

-- Índice para atualizar status rapidamente por external_id
CREATE INDEX IF NOT EXISTS idx_atd_mensagens_external_id ON atd_mensagens (external_id) WHERE external_id IS NOT NULL;

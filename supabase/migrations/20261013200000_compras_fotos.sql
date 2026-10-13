-- Fotos do recebimento (caminhos no bucket cp-anexos) guardadas na compra
-- gerada pela conferência; a nota fiscal continua em anexo_path.
ALTER TABLE cp_compras ADD COLUMN IF NOT EXISTS fotos TEXT[];

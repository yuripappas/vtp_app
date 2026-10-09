-- Adiciona coluna dados (JSONB) à base de conhecimento
-- Permite salvar as respostas do questionário estruturado
-- sem perder a retrocompatibilidade com conteudo (TEXT) usado pela IA

ALTER TABLE atd_base_conhecimento
  ADD COLUMN IF NOT EXISTS dados JSONB;

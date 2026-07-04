-- Adiciona coluna instagram_handle em atd_contatos
-- Armazena o @username do contato Instagram (ex: "joaosilva" sem @)
-- Preenchido pelo webhook-instagram via Business Discovery API

ALTER TABLE atd_contatos
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

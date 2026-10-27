-- Permite upload de arquivos no bucket atd-midias por usuários autenticados.
-- Sem esta policy, o INSERT falha com "row-level security policy" mesmo com bucket público.

CREATE POLICY atd_midias_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'atd-midias');

-- Bucket para mídias enviadas pelos atendentes (imagens, áudios, vídeos, documentos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'atd-midias',
  'atd-midias',
  true,
  52428800, -- 50 MB
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm',
    'video/mp4','video/webm','video/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Política: atendentes autenticados podem fazer upload
CREATE POLICY "atd_midias_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atd-midias');

-- Política: leitura pública (URLs assinadas funcionam mesmo sem policy pública, mas deixamos SELECT aberto)
CREATE POLICY "atd_midias_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'atd-midias');

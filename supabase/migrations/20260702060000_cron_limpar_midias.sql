-- Agenda limpeza diária de mídias antigas (> 7 dias) às 03:00 BRT / 06:00 UTC
-- Requer extensões pg_cron e pg_net habilitadas no projeto Supabase

SELECT cron.schedule(
  'limpar-midias-diario',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wdfecydgdzwwxxrncdqx.supabase.co/functions/v1/limpar-midias',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZmVjeWRnZHp3d3h4cm5jZHF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU4MDA5NSwiZXhwIjoyMDk1MTU2MDk1fQ.5_ACmqAmpZeEtNnQOlyH3_aAG74HxBjtE7dR2ycKZME"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

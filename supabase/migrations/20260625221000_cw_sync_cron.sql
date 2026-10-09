-- VTP Compras — agenda a Edge Function cw-sync para rodar 24/7 via pg_cron,
-- independente de alguém estar com o app aberto no navegador.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'cw-sync-job',
  '*/2 * * * *', -- a cada 2 minutos
  $$
  SELECT net.http_post(
    url     := 'https://wdfecydgdzwwxxrncdqx.supabase.co/functions/v1/cw-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZmVjeWRnZHp3d3h4cm5jZHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODAwOTUsImV4cCI6MjA5NTE1NjA5NX0.sVVljppHf0g7zU-kCuvGxxw67wqAFlVVGRpqjgUBaEA',
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Recria o cron cw-sync-job com timeout maior no pg_net (30s) — o padrão de
-- 5s causava falso "timeout" no log mesmo quando a função terminava com sucesso
-- (Edge Function processando todos os pedidos do ciclo levava ~3-5s).

DO $$
BEGIN
  PERFORM cron.unschedule('cw-sync-job');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job já não existia (foi removido manualmente antes desta migration)
END $$;

SELECT cron.schedule(
  'cw-sync-job',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wdfecydgdzwwxxrncdqx.supabase.co/functions/v1/cw-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZmVjeWRnZHp3d3h4cm5jZHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODAwOTUsImV4cCI6MjA5NTE1NjA5NX0.sVVljppHf0g7zU-kCuvGxxw67wqAFlVVGRpqjgUBaEA',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

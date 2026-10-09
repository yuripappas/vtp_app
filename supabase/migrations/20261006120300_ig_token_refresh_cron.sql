-- Agenda renovação diária do Instagram User Access Token às 04:00 BRT / 07:00 UTC.
-- A function ig-token-refresh só renova de fato quando faltar menos de 50 dos
-- 60 dias de validade — rodar todo dia é barato e garante que o token nunca
-- fica perto de vencer, mesmo que uma execução falhe ou seja pulada.
--
-- O header x-cron-secret é lido da tabela atd_cron_tokens em tempo de
-- execução (nunca fica em texto neste arquivo) — ver 20261006120200.
SELECT cron.schedule(
  'ig-token-refresh-diario',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wdfecydgdzwwxxrncdqx.supabase.co/functions/v1/ig-token-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT secret FROM atd_cron_tokens WHERE job_name = 'ig-token-refresh')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- A loja (e portanto o Cardápio Web) só opera das 17h às 23h de Maceió.
-- Fora disso os syncs rodavam à toa o dia inteiro (cw-sync a cada 2 min,
-- crm-sync a cada minuto, crm_recalcular a cada 30 min), gastando CPU e
-- Disk IO do banco. pg_cron roda em GMT; Maceió = GMT-3, sem horário de verão.
--
-- Janela de pedidos: 17h00–00h59 de Maceió (20h–03h59 GMT) — a hora a mais
-- depois do fechamento pega os pedidos que finalizam após as 23h. As rodadas
-- de 00h/00h30 do crm_recalcular também viram o dia (recência do RFV).
--
-- crm-sync: só precisa da passada diária de clientes, que começa às 4h de
-- Maceió (HORA_PASSADA_DIARIA na Edge Function) e leva ~6 min → 4h00–4h59
-- (7h GMT). Ao terminar, a própria passada chama crm_recalcular().
--
-- Se abrir outra marca/turno, é só ampliar os horários aqui.

select cron.alter_job((select jobid from cron.job where jobname = 'cw-sync-job'),
                      schedule := '*/2 20-23,0-3 * * *');

select cron.alter_job((select jobid from cron.job where jobname = 'crm-recalcular-job'),
                      schedule := '*/30 20-23,0-3 * * *');

select cron.alter_job((select jobid from cron.job where jobname = 'crm-sync-job'),
                      schedule := '* 7 * * *');

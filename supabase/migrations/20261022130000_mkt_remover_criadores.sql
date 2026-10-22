-- Remove a Rede de Criadores do módulo Marketing (descontinuada em 2026-10-22).
-- Criada em 20260730120000_mkt_creators_schema.sql e migrations seguintes.
-- O código (marketing.js, seja-criador.html, painel-criador.html, mkt-notificar,
-- mkt-otp-enviar, mkt-otp-verificar e as menções no webhook-instagram) saiu junto.

drop view if exists mkt_creator_performance;

drop table if exists
  mkt_creator_brand_compliance,
  mkt_creator_campanhas_embaixador,
  mkt_creator_challenge_progress,
  mkt_creator_challenges,
  mkt_creator_content_metrics,
  mkt_creator_content_notas,
  mkt_creator_content,
  mkt_creator_coupons,
  mkt_creator_mentions,
  mkt_creator_otp_codes,
  mkt_creator_payout_items,
  mkt_creator_payouts,
  mkt_creator_points,
  mkt_creator_redemptions,
  mkt_creator_resgates,
  mkt_creator_sessions,
  mkt_creators
cascade;

drop function if exists _mkt_pontuar_compliance() cascade;
drop function if exists _mkt_pontuar_desafio() cascade;
drop function if exists _mkt_pontuar_venda() cascade;

drop policy if exists mkt_midias_insert on storage.objects;
drop policy if exists mkt_midias_select on storage.objects;
-- O bucket mkt-midias é esvaziado e removido pela API de Storage (o Supabase
-- não permite apagar arquivos de storage.objects direto por SQL).

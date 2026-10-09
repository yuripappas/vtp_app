-- Reset operacional — 2026-06-01
-- Apaga dados operacionais mantendo usuários, cadastros, config e templates.
DELETE FROM kv_store WHERE key IN (
  -- Compras
  'vtp_ordens',
  'vtp_listas',
  'vtp_carrinho',
  'vtp_forn_memoria',
  'vtp_cycle_history',
  'vtp_price_history',
  -- Estoque
  'vtp_movimentacoes',
  'vtp_hist_contagens',
  'vtp_contagensInv',
  -- Checklist (sessões preenchidas — templates são mantidos)
  'vtp_ck_sessoes',
  -- Manutenção (chamados — configs são mantidas)
  'vtp_manut_itens',
  'vtp_manut_sessoes',
  -- Etiquetagem (etiquetas emitidas)
  'vtp_etiquetas',
  'vtp_etiq_pontos',
  -- Outros registros operacionais
  'vtp_desperdicios',
  'vtp_auditlog',
  'vtp_alertas'
);

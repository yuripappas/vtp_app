-- Habilita Supabase Realtime nas tabelas que a inbox do atendimento escuta
-- ao vivo (lista de conversas e novas mensagens).

ALTER PUBLICATION supabase_realtime ADD TABLE atd_conversas;
ALTER PUBLICATION supabase_realtime ADD TABLE atd_mensagens;

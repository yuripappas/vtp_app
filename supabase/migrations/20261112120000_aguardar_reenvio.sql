-- Aguardar reenvio: o fornecedor manda o que faltou na mesma nota.
--  • cp_pedidos.status 'parcial' passa a significar "Aguardando reenvio"
--  • aguardando_desde: quando começou a espera (alerta de atraso após 3 dias)
--  • cp_pedido_itens.conferencia.status 'aguardando' + qtd_aguardando
ALTER TABLE cp_pedidos ADD COLUMN IF NOT EXISTS aguardando_desde TIMESTAMPTZ;

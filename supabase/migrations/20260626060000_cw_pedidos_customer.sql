-- Adiciona dados do cliente e endereço de entrega ao histórico de pedidos do
-- CW — necessário para o módulo de omnichannel abrir a conversa direto a
-- partir do pedido (caso de uso: motoboy não encontrou o endereço).
--
-- Campos confirmados na doc oficial da API CW (GET /orders/{id}):
--   customer: { id, name, phone, ddi } | null  — null em pedidos via portal/whatsapp_extension
--   delivery_address: { street, number, address_block, neighborhood, complement,
--                        reference, postal_code, city, state, latitude, longitude } | null
--                      — null em pedidos que não são delivery

ALTER TABLE cw_pedidos
  ADD COLUMN IF NOT EXISTS customer_id      BIGINT,
  ADD COLUMN IF NOT EXISTS customer_name    TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone   TEXT,  -- ddi+phone concatenados, só dígitos (ex: 5582996891417)
  ADD COLUMN IF NOT EXISTS delivery_address JSONB; -- objeto completo da API, ver acima

CREATE INDEX IF NOT EXISTS cw_pedidos_customer_phone_idx ON cw_pedidos (customer_phone);

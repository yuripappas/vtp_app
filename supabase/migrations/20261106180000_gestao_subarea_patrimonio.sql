-- Gestão: sub-área Patrimônio em Operação (equipamentos, utensílios,
-- estrutura: manutenção preventiva/corretiva e inventário). Fica depois de Gerência.
INSERT INTO gestao_subareas (area, nome, ordem) VALUES ('ope', 'Patrimônio', 16)
ON CONFLICT (area, nome) DO NOTHING;

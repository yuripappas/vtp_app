-- Gestão › ADM › Governança: relação com prestadores externos que cuidam da
-- parte legal da empresa (contador, advogado). Pessoas fica só com a equipe.
-- Todos nascem "A construir". Idempotente.
INSERT INTO gestao_processos (subarea_id, nome, status, ordem)
SELECT s.id, x.nome, 'a_construir', x.ordem
  FROM (VALUES
    ('Fechamento Contábil Mensal com o Contador',          401),
    ('Impostos e Guias (Apuração e Pagamento)',            402),
    ('Obrigações Acessórias e Certidões',                  403),
    ('Folha, Encargos e eSocial com o Contador',           404),
    ('Gestão de Contratos (Fornecedores, Aluguel e Apps)', 405),
    ('Acompanhamento Jurídico (Processos e Notificações)', 406),
    ('Societário (Contrato Social e Acordo de Sócios)',    407),
    ('Distribuição de Lucros e Pró-labore',                408)
  ) AS x(nome, ordem)
  JOIN gestao_subareas s ON s.area = 'adm' AND s.nome = 'Governança'
 WHERE NOT EXISTS (SELECT 1 FROM gestao_processos p WHERE p.subarea_id = s.id AND p.nome = x.nome AND NOT p.arquivado);

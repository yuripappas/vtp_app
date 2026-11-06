-- Gestão: Gerência passa a ser a última sub-área de Operação e o quadro de
-- Processos começa com a lista da loja, reorganizada pela lógica de cada
-- sub-área (no Pinch, "Gestão do CMV" misturava estoque, compras e finanças).
-- Todos nascem "A construir". Idempotente: não duplica se rodar de novo.

UPDATE gestao_subareas SET ordem = 15 WHERE area = 'ope' AND nome = 'Patrimônio';
UPDATE gestao_subareas SET ordem = 16 WHERE area = 'ope' AND nome = 'Gerência';

INSERT INTO gestao_processos (subarea_id, nome, status, ordem)
SELECT s.id, x.nome, 'a_construir', x.ordem
  FROM (VALUES
    -- ADM › Pessoas
    ('adm', 'Pessoas',     'Recrutamento e Seleção',                                   101),
    ('adm', 'Pessoas',     'Processo de Integração',                                   102),
    ('adm', 'Pessoas',     'Treinamento Introdutório',                                 103),
    ('adm', 'Pessoas',     'Quadro de Responsabilidades',                              104),
    -- ADM › Financeiro
    ('adm', 'Financeiro',  'Gestão do Fluxo de Caixa',                                 201),
    ('adm', 'Financeiro',  'Gestão do Saldo de Caixa',                                 202),
    ('adm', 'Financeiro',  'Gestão da DRE',                                            203),
    ('adm', 'Financeiro',  'Apuração e Análise do CMV',                                204),
    ('adm', 'Financeiro',  'Redução do CMV',                                           205),
    ('adm', 'Financeiro',  'Entrada de Nota de Compra',                                206),
    ('adm', 'Financeiro',  'Programação de Pagamentos',                                207),
    ('adm', 'Financeiro',  'Contas a Pagar - Não Insumos',                             208),
    ('adm', 'Financeiro',  'Conciliação - Contas a Pagar',                             209),
    ('adm', 'Financeiro',  'Contas a Receber',                                         210),
    ('adm', 'Financeiro',  'Conciliação - Contas a Receber',                           211),
    -- ADM › Estratégico (VTO na ordem em que se constrói, orçamento no fim)
    ('adm', 'Estratégico', 'VTO - Definição de Valores',                               301),
    ('adm', 'Estratégico', 'VTO - Definição de Cenário Futuro, Propósito e Diferencial', 302),
    ('adm', 'Estratégico', 'VTO - Elaboração do Plano de 1 Ano',                       303),
    ('adm', 'Estratégico', 'VTO - Elaboração das Metas Trimestrais (Rocks)',           304),
    ('adm', 'Estratégico', 'Definição do Orçamento Anual',                             305),
    -- OPE › Estoque
    ('ope', 'Estoque',     'Organização do Estoque',                                   401),
    ('ope', 'Estoque',     'Estocagem',                                                402),
    ('ope', 'Estoque',     'Contagem de Estoque',                                      403),
    -- OPE › Compras
    ('ope', 'Compras',     'Especificação de Produtos',                                501),
    ('ope', 'Compras',     'Rotinas de Compras',                                       502),
    ('ope', 'Compras',     'Processo de Recebimento',                                  503),
    -- OPE › Cozinha
    ('ope', 'Cozinha',     'Receituário',                                              601),
    ('ope', 'Cozinha',     'Construção das Fichas Técnicas',                           602),
    ('ope', 'Cozinha',     'Planilha de Produção',                                     603),
    ('ope', 'Cozinha',     'Mise en Place das Praças',                                 604),
    ('ope', 'Cozinha',     'Ficha de Finalização',                                     605),
    -- OPE › Atendimento (salão e canais de pedido)
    ('ope', 'Atendimento', 'Treinamento de Garçom',                                    701),
    ('ope', 'Atendimento', 'Gestão de Crises no Atendimento',                          702),
    ('ope', 'Atendimento', 'Atendimento via WhatsApp',                                 703),
    ('ope', 'Atendimento', 'Atendimento via iFood',                                    704),
    ('ope', 'Atendimento', 'Atendimento via Cardápio Digital',                         705),
    -- OPE › Logística (entrega)
    ('ope', 'Logística',   'Noções Básicas de Delivery',                               801),
    ('ope', 'Logística',   'Operação Eficiente',                                       802),
    ('ope', 'Logística',   'Gestão de Crises no Delivery',                             803),
    -- OPE › Patrimônio (inventário, preventivas, licenças)
    ('ope', 'Patrimônio',  'Inventário de Equipamentos e Utensílios',                  901),
    ('ope', 'Patrimônio',  'Manutenção Preventiva de Equipamentos',                    902),
    ('ope', 'Patrimônio',  'Manutenção Corretiva (Chamados)',                          903),
    ('ope', 'Patrimônio',  'Limpeza de Coifa e Exaustão',                              904),
    ('ope', 'Patrimônio',  'Manutenção Predial (Elétrica, Hidráulica e Gás)',          905),
    ('ope', 'Patrimônio',  'Recarga de Extintores',                                    906),
    ('ope', 'Patrimônio',  'Dedetização e Limpeza da Caixa d''Água',                   907),
    ('ope', 'Patrimônio',  'Licenças e Alvarás (Funcionamento, Sanitária e Bombeiros)', 908),
    -- OPE › Gerência
    ('ope', 'Gerência',    'Reunião Nota 10 (Semanal)',                                1001),
    ('ope', 'Gerência',    'Treinamentos',                                             1002),
    -- PRO › Produtização
    ('pro', 'Produtização', 'Gestão de Cardápio',                                      1101),
    ('pro', 'Produtização', 'Cardápio para Delivery',                                  1102),
    ('pro', 'Produtização', 'Rotina de Precificação',                                  1103),
    ('pro', 'Produtização', 'Análise Matriz BCG',                                      1104),
    -- MKT › Marketing e Vendas
    ('mkt', 'Marketing e Vendas', 'Gestão do Instagram',                               1201),
    ('mkt', 'Marketing e Vendas', 'Gestão do Tráfego Pago',                            1202),
    ('mkt', 'Marketing e Vendas', 'Gestão do Google Meu Negócio',                      1203),
    ('mkt', 'Marketing e Vendas', 'Marketing de Fidelização',                          1204)
  ) AS x(area, sub, nome, ordem)
  JOIN gestao_subareas s ON s.area = x.area AND s.nome = x.sub
 WHERE NOT EXISTS (SELECT 1 FROM gestao_processos p WHERE p.subarea_id = s.id AND p.nome = x.nome AND NOT p.arquivado);

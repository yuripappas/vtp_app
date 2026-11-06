-- Gestão › Balanço: rotinas-chave iniciais (o "raio-x" mensal de cada
-- sub-área). Título = pergunta do mês; descricao = critério do que conta como
-- Concluído. Tudo editável depois em Balanço › Rotinas. Metas (5 min, 4,7,
-- 40 min, 2%…) são o ponto de partida — ajustar no app. Idempotente.

INSERT INTO gestao_rotinas (subarea_id, titulo, descricao, ordem)
SELECT s.id, x.titulo, x.criterio, x.ordem
  FROM (VALUES
    -- ── ADM › Pessoas ──
    ('adm','Pessoas', 101, 'A escala do mês foi publicada até o dia 25 do mês anterior e cumprida sem turno descoberto?',
      'Concluído: publicada no prazo e nenhum turno descoberto. Parcial: publicada com atraso ou 1 turno descoberto.'),
    ('adm','Pessoas', 102, 'Quem entrou no mês passou pela integração e pelo treinamento introdutório?',
      'Concluído: todos os admitidos do mês. N/A se ninguém entrou.'),
    ('adm','Pessoas', 103, 'Foi feito feedback individual com toda a equipe?',
      'Concluído: 100% da equipe com feedback registrado. Parcial: parte da equipe.'),
    ('adm','Pessoas', 104, 'Ponto, faltas e atrasos foram conferidos e tratados antes do fechamento da folha?',
      'Concluído: conferido antes de enviar a folha, com as ocorrências tratadas (conversa, advertência ou abono).'),
    ('adm','Pessoas', 105, 'Há candidatos triados para as funções críticas (pizzaiolo, entregador, atendimento)?',
      'Concluído: pelo menos 2 candidatos triados por função. Parcial: só para parte das funções.'),

    -- ── ADM › Financeiro ──
    ('adm','Financeiro', 201, 'O fluxo de caixa foi atualizado toda semana?',
      'Concluído: 4 de 4 semanas. Parcial: 2 ou 3 semanas.'),
    ('adm','Financeiro', 202, 'A conciliação bancária do mês fechou (contas a pagar e a receber batem com o extrato)?',
      'Concluído: todas as contas conciliadas, sem diferença em aberto.'),
    ('adm','Financeiro', 203, 'Os repasses do iFood e das outras plataformas foram conferidos contra o extrato?',
      'Concluído: todas as semanas conferidas e as diferenças contestadas.'),
    ('adm','Financeiro', 204, 'A DRE do mês foi fechada até o dia 10 do mês seguinte, com o CMV apurado e comparado à meta?',
      'Concluído: DRE fechada no prazo, CMV apurado e desvio explicado.'),
    ('adm','Financeiro', 205, 'Nenhuma conta foi paga com atraso ou juros?',
      'Concluído: zero contas com atraso ou juros. Parcial: 1 ocorrência.'),
    ('adm','Financeiro', 206, 'Todas as notas de compra do mês foram lançadas?',
      'Concluído: 100% das notas lançadas até o fechamento do mês.'),

    -- ── ADM › Estratégico ──
    ('adm','Estratégico', 301, 'A reunião mensal de resultado (RN10 mensal) foi feita com os números do mês?',
      'Concluído: reunião feita com DRE, CMV e indicadores do mês, e decisões registradas.'),
    ('adm','Estratégico', 302, 'O status dos Rocks do trimestre foi revisado no mês?',
      'Concluído: todos os Rocks com status atualizado (no trilho / fora do trilho).'),
    ('adm','Estratégico', 303, 'O orçado foi comparado com o realizado, e os desvios grandes ganharam ação?',
      'Concluído: comparação feita e cada desvio acima de 10% com uma atividade no Plano.'),
    ('adm','Estratégico', 304, 'As atividades atrasadas do Plano de Ação ganharam novo prazo ou novo responsável?',
      'Concluído: nenhuma atividade atrasada sem novo prazo, responsável ou justificativa.'),
    ('adm','Estratégico', 305, 'No fim do trimestre, os Rocks do próximo trimestre foram definidos?',
      'Concluído: Rocks definidos com dono e prazo. N/A nos meses que não fecham trimestre.'),

    -- ── ADM › Governança ──
    ('adm','Governança', 401, 'Os impostos e guias do mês foram pagos no vencimento?',
      'Concluído: todas as guias pagas no prazo.'),
    ('adm','Governança', 402, 'Os documentos foram enviados ao contador no prazo (notas, folha, extratos)?',
      'Concluído: tudo enviado na data combinada com o contador.'),
    ('adm','Governança', 403, 'As certidões negativas estão sem pendência?',
      'Concluído: certidões federal, estadual, municipal, FGTS e trabalhista válidas e sem pendência.'),
    ('adm','Governança', 404, 'Os contratos que vencem nos próximos 60 dias foram identificados e tratados?',
      'Concluído: cada contrato a vencer com decisão (renovar, renegociar ou encerrar).'),
    ('adm','Governança', 405, 'Pró-labore e distribuição de lucros seguiram a regra combinada?',
      'Concluído: valores e datas conforme o acordo entre os sócios.'),
    ('adm','Governança', 406, 'As pendências jurídicas foram acompanhadas com o advogado?',
      'Concluído: todas com status atualizado no mês. N/A se não houver nenhuma.'),

    -- ── OPE › Estoque ──
    ('ope','Estoque', 501, 'As contagens previstas foram feitas antes das 17h?',
      'Concluído: 100% dos dias previstos. Parcial: 80% ou mais.'),
    ('ope','Estoque', 502, 'A diferença entre o estoque do sistema e o físico ficou dentro do limite?',
      'Concluído: diferença de até 2% do valor do estoque. Parcial: até 4%.'),
    ('ope','Estoque', 503, 'Na conferência, nenhum produto estava vencido ou sem etiqueta, e o PVPS foi respeitado?',
      'Concluído: zero produtos vencidos ou sem etiqueta encontrados no mês.'),
    ('ope','Estoque', 504, 'Perdas e descartes foram todos registrados?',
      'Concluído: todo descarte registrado no app com motivo.'),
    ('ope','Estoque', 505, 'Nenhum insumo faltou durante a operação?',
      'Concluído: zero rupturas. Parcial: 1 ruptura sem impacto em pedido.'),

    -- ── OPE › Compras ──
    ('ope','Compras', 601, 'As compras saíram da lista e do estoque mínimo, sem compra de emergência?',
      'Concluído: zero compras de emergência. Parcial: 1 ou 2.'),
    ('ope','Compras', 602, 'Os itens mais importantes (curva A) foram cotados com pelo menos 2 fornecedores?',
      'Concluído: todos os itens da curva A com cotação no mês.'),
    ('ope','Compras', 603, 'Todo recebimento foi conferido (quantidade, peso, validade, temperatura)?',
      'Concluído: 100% dos recebimentos conferidos e registrados.'),
    ('ope','Compras', 604, 'Os aumentos de preço acima do limite foram avisados e tratados?',
      'Concluído: cada aumento acima de 5% com ação (renegociação, troca de fornecedor ou repasse no preço). N/A se não houve aumento.'),

    -- ── OPE › Cozinha ──
    ('ope','Cozinha', 701, 'Os checklists de abertura e fechamento foram feitos em todos os dias de operação?',
      'Concluído: 100% dos dias. Parcial: 90% ou mais.'),
    ('ope','Cozinha', 702, 'A produção estava pronta às 17h, seguindo a planilha, sem faltar preparo?',
      'Concluído: todos os dias com a mise en place completa às 17h.'),
    ('ope','Cozinha', 703, 'A auditoria de ficha técnica (pesagem de uma amostra de pizzas) ficou dentro do padrão?',
      'Concluído: auditoria feita e todas as pizzas pesadas dentro da tolerância da ficha.'),
    ('ope','Cozinha', 704, 'O tempo de montagem medido no KDS ficou dentro da meta?',
      'Concluído: média do mês dentro da meta definida para a montagem.'),
    ('ope','Cozinha', 705, 'A temperatura de freezers e geladeiras foi registrada todos os dias?',
      'Concluído: 100% dos dias registrados e nenhuma leitura fora da faixa sem ação.'),

    -- ── OPE › Atendimento ──
    ('ope','Atendimento', 801, 'O WhatsApp teve a primeira resposta dentro da meta?',
      'Concluído: tempo médio de primeira resposta de até 5 min no horário de operação.'),
    ('ope','Atendimento', 802, 'A avaliação no iFood ficou acima da meta?',
      'Concluído: nota do mês de 4,7 ou mais.'),
    ('ope','Atendimento', 803, 'Toda reclamação foi respondida e resolvida em até 24h?',
      'Concluído: 100% das reclamações do mês resolvidas em até 24h.'),
    ('ope','Atendimento', 804, 'Cardápio, preços e itens pausados estavam iguais em todos os canais?',
      'Concluído: conferência semanal feita e nenhuma divergência encontrada entre iFood, WhatsApp e cardápio digital.'),
    ('ope','Atendimento', 805, 'O atendimento no salão seguiu o padrão?',
      'Concluído: verificação feita no mês (observação ou cliente oculto) sem desvio do padrão.'),

    -- ── OPE › Logística ──
    ('ope','Logística', 901, 'O tempo médio de entrega ficou dentro da meta?',
      'Concluído: média do mês de até 40 min.'),
    ('ope','Logística', 902, 'A porcentagem de pedidos atrasados ficou abaixo do limite?',
      'Concluído: até 5% dos pedidos entregues depois do horário previsto.'),
    ('ope','Logística', 903, 'A escala de entregadores cobriu todos os dias de pico?',
      'Concluído: nenhum dia de pico com falta de entregador.'),
    ('ope','Logística', 904, 'As ocorrências de entrega ficaram abaixo do limite e foram tratadas?',
      'Concluído: pedido errado, extravio ou pizza danificada em até 1% dos pedidos, todos tratados com o cliente.'),
    ('ope','Logística', 905, 'O custo logístico ficou dentro da meta?',
      'Concluído: custo logístico de até 9% do faturamento.'),

    -- ── OPE › Patrimônio ──
    ('ope','Patrimônio', 1001, 'As preventivas do mês foram feitas conforme o calendário (forno, masseira, refrigeração)?',
      'Concluído: 100% das preventivas previstas no mês. Parcial: parte delas.'),
    ('ope','Patrimônio', 1002, 'Os chamados de manutenção foram resolvidos no prazo, sem equipamento parado na operação?',
      'Concluído: nenhum chamado vencido e nenhum equipamento parado durante a operação.'),
    ('ope','Patrimônio', 1003, 'Coifa, extintores, dedetização e caixa d''água estão dentro da validade?',
      'Concluído: todos os quatro dentro da validade.'),
    ('ope','Patrimônio', 1004, 'Licenças e alvarás estão válidos, e os que vencem em 60 dias já estão em renovação?',
      'Concluído: alvará, vigilância sanitária e bombeiros válidos ou com renovação iniciada.'),
    ('ope','Patrimônio', 1005, 'O inventário de utensílios foi feito, com as perdas registradas?',
      'Concluído: inventário feito e diferenças registradas. N/A nos meses em que não está previsto.'),

    -- ── OPE › Gerência ──
    ('ope','Gerência', 1101, 'A Reunião Nota 10 foi feita todas as semanas?',
      'Concluído: 4 de 4 semanas. Parcial: 2 ou 3 semanas.'),
    ('ope','Gerência', 1102, 'O gerente conferiu os checklists de turno todos os dias?',
      'Concluído: 100% dos dias de operação conferidos.'),
    ('ope','Gerência', 1103, 'Os treinamentos previstos para o mês foram feitos?',
      'Concluído: todos os treinamentos do calendário do mês. N/A se não havia treinamento previsto.'),
    ('ope','Gerência', 1104, 'Os números do mês foram apresentados para a equipe?',
      'Concluído: vendas, CMV, tempo de entrega e avaliações apresentados.'),

    -- ── PRO › Produtização ──
    ('pro','Produtização', 1201, 'A margem dos itens mais vendidos (curva A) foi revisada no mês?',
      'Concluído: margem de todos os itens da curva A recalculada com o custo atual.'),
    ('pro','Produtização', 1202, 'Quando um insumo importante subiu, o preço do item foi revisto?',
      'Concluído: cada alta relevante de insumo com decisão de preço. N/A se não houve alta.'),
    ('pro','Produtização', 1203, 'Todo item novo ou alterado entrou no cardápio com ficha técnica, foto e teste?',
      'Concluído: todos os lançamentos do mês com ficha, foto e teste. N/A se não houve lançamento.'),
    ('pro','Produtização', 1204, 'O cardápio do delivery foi revisado (fotos, descrições, itens sem venda)?',
      'Concluído: revisão feita e itens sem venda tratados (melhorar, retirar ou manter com motivo).'),

    -- ── MKT › Marketing e Vendas ──
    ('mkt','Marketing e Vendas', 1301, 'O calendário de posts foi cumprido?',
      'Concluído: 100% dos posts planejados publicados. Parcial: 70% ou mais.'),
    ('mkt','Marketing e Vendas', 1302, 'O tráfego pago foi acompanhado toda semana, com custo por pedido dentro da meta?',
      'Concluído: 4 de 4 semanas acompanhadas e custo por pedido dentro da meta.'),
    ('mkt','Marketing e Vendas', 1303, 'As avaliações do Google foram respondidas em até 48h?',
      'Concluído: 100% das avaliações do mês respondidas em até 48h.'),
    ('mkt','Marketing e Vendas', 1304, 'A campanha de reativação ou fidelização foi disparada para a base?',
      'Concluído: pelo menos uma campanha disparada no mês (Repediu) com resultado medido.'),
    ('mkt','Marketing e Vendas', 1305, 'O resultado das ações do mês foi medido?',
      'Concluído: clientes novos, clientes que voltaram e retorno de cada ação registrados.')
  ) AS x(area, sub, ordem, titulo, criterio)
  JOIN gestao_subareas s ON s.area = x.area AND s.nome = x.sub
 WHERE NOT EXISTS (SELECT 1 FROM gestao_rotinas r WHERE r.subarea_id = s.id AND r.titulo = x.titulo);

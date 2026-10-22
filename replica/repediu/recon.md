# Recon map: Repediu — CRM e marketing de retenção para delivery (web)

Scope: o ciclo de retenção: base de clientes unificada (a partir dos pedidos) → perfil e RFV →
segmentos → campanhas e automações no WhatsApp (API oficial da Meta) → atribuição de
conversão e relatórios de recompra. Ficam fora a IA "Repeteco", voz, RCS, SMS, o módulo
Marketplace e a rede de parceiros (ver "Out of scope" e a matriz).
For: uso interno da Vai Ter Pizza! (Maceió), como módulo do sistema VTP (HTML/JS + Supabase),
substituindo a assinatura da Repediu. Canal principal: WhatsApp Cloud API (WABA própria, já
conectada no módulo Atendimento).
Date: 2026-10-22

> Regras seguidas: **só fontes públicas.** Os termos da Repediu (cláusula 7.2/7.3,
> https://repediu.com.br/termos/) proíbem copiar ou reproduzir textos, layouts e bases de dados
> da plataforma e limitam o conteúdo a "fins internos relacionados à utilização regular dos
> Serviços". Por isso o painel logado (app.repediu.com.br) **não foi navegado**. As telas abaixo
> são **inferidas** de páginas de funcionalidade, da página de preços e da documentação pública
> da API. Nenhum JS do app foi lido e nenhum endpoint privado foi registrado. Nenhum screenshot
> foi salvo. A central de ajuda (ajuda.repediu.com.br) foi bloqueada no navegador e não foi lida.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | site / home | https://repediu.com.br/ | ciclo Dados → CRM → Automação → Marketing → IA; +7.000 restaurantes; integra CardápioWeb |
| 2 | planos e preços | https://repediu.com.br/planos-e-precos/ | o que é cobrado à parte: segmentos (10/50/∞), campanhas ativas (3/30/∞), sessões de WhatsApp (1/5/∞), créditos de IA, créditos de comunicação; preço por faixa de contatos; R$ 187,94 a R$ 296,65/mês (12x) |
| 3 | termos | https://repediu.com.br/termos/ | cláusula 7 (propriedade intelectual), motivo do recon só público |
| 4 | módulo de automações | https://repediu.com.br/funcionalidades/modulo-de-automacoes/ | gatilho → condição → canal; builder visual; 32 modelos; exemplos de gatilhos |
| 5 | módulo de marketing | https://repediu.com.br/funcionalidades/modulo-de-marketing/ | públicos (novos, ativos, em risco, perdidos, fiéis), jornadas por tipo de cliente |
| 6 | CRM e segmentação | https://repediu.com.br/funcionalidades/crm-e-segmentacao/ | filtros cruzados (canal, valor, frequência, localização), segmentos que se atualizam sozinhos |
| 7 | matriz RFV | https://repediu.com.br/funcionalidades/matriz-rfv/ | faixas de R, F e V configuráveis pelo restaurante |
| 8 | perfil do cliente | https://repediu.com.br/funcionalidades/perfil-do-cliente/ | campos do perfil: favoritos, canal, ticket, gasto, frequência, última compra, bairro |
| 9 | atribuição de conversão | https://repediu.com.br/funcionalidades/atribuicao-de-conversao/ | janela de atribuição em dias, **por grupo RFV** |
| 10 | IA conversacional | https://repediu.com.br/ia-conversacional/ | campanha em "6 etapas", rascunho criado a partir de um pedido em texto |
| 11 | documentação da API | https://docs.repediu.com.br/llms.txt | **a melhor fonte**: entidades, campos e definições de métricas |
| 12 | OpenAPI | https://docs.repediu.com.br/openapi.yaml | schemas Customer, CrmCustomerItem, Campaign, CampaignStats, Conversion, Rating, Coupon |
| 13 | casos de uso da API | https://docs.repediu.com.br/casos-de-uso/clientes-e-recompra | fórmulas: taxa de recompra, frequência, LTV médio, ativos (90 d), macro-segmentos RFV |
| 14 | casos de uso: recuperação | https://docs.repediu.com.br/casos-de-uso/recuperacao-e-recorrencia | receita recuperada + receita recorrente = receita via CRM |
| 15 | central de ajuda | https://ajuda.repediu.com.br/pt-BR/ | **não lida** (navegação recusada); vale uma segunda passada |
| 16 | VTP (este repo) | `cw_pedidos`, `supabase/functions/enviar-mensagem`, `webhook-whatsapp`, `js/atendimento.js` | o que já existe e será reaproveitado |

## Core loop

Cada pedido atualiza o perfil do cliente e o reclassifica na matriz RFV. O gestor dispara (ou
deixa uma automação disparar) uma mensagem de WhatsApp com cupom para um segmento, e a
plataforma prova quanto voltou: a venda feita dentro da janela de atribuição conta como conversão
da campanha.

## Screens

Todas inferidas de material público. "states" lista os estados que o clone precisa ter.

| ID | screen | route / how to reach | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Visão geral (resultados do CRM) | menu › CRM › Visão geral | provar o retorno | cards: receita gerada, conversões, clientes recuperados, receita recuperada vs recorrente, mensagens enviadas, ticket médio; seletor de período; distribuição RFV | vazio (sem pedidos), carregando, preenchido |
| S02 | Clientes (base unificada) | menu › Clientes | ver e filtrar a base | busca (nome/telefone), filtros (RFV, canal, bairro, última compra, gasto), tabela (nome, nº pedidos, gasto, ticket, última compra, status RFV, opt-in), exportar | vazio, carregando, filtrado sem resultado |
| S03 | Perfil do cliente (360) | clique em S02, ou a partir de uma conversa do Atendimento | entender 1 cliente | cabeçalho (nome, telefone, bairro, aniversário, badge RFV), KPIs (pedidos, gasto total, ticket, intervalo médio, melhor dia da semana), produtos favoritos, canal preferido, linha do tempo (pedidos, mensagens de campanha, conversões, avaliações, cupons), opt-in/opt-out | cliente de 1 pedido, sem telefone, opt-out |
| S04 | Matriz RFV | menu › Clientes › RFV | ver a base por grupo | grade de 11 grupos RFV com contagem e %, macro-segmentos (campeões, fiéis, promissores, em risco, perdidos), atalho "criar campanha para este grupo" | carregando, preenchido |
| S05 | Configurar RFV | S04 › Configurar | ajustar ao ciclo da pizzaria | faixas de recência (dias), frequência (nº de compras), valor (R$), pré-visualização de quantos clientes caem em cada grupo | padrão, editado sem salvar, erro de faixa sobreposta |
| S06 | Segmentos | menu › Segmentos | listar públicos salvos | lista (nome, regra resumida, nº de clientes, atualizado em), segmentos fixos do RFV, botão novo | vazio, preenchido |
| S07 | Construtor de segmento | S06 › Novo | criar público | grupos de condição E/OU (RFV, dias sem comprar, nº de pedidos, gasto, ticket, canal, bairro, produto comprado, dia da semana, aniversário no mês, opt-in), contador ao vivo de alcance | sem condição, alcance zero, salvando |
| S08 | Campanhas | menu › Campanhas | acompanhar campanhas | lista com status (rascunho, agendada, enviando, concluída, pausada), canal, segmento, enviadas, conversões, receita, taxa de conversão | vazio, preenchido |
| S09 | Nova campanha (assistente de 6 etapas) | S08 › Nova | criar e agendar | 1 objetivo/nome, 2 segmento(s) + alcance com opt-in, 3 oferta (cupom do CW, validade), 4 mensagem (template aprovado + variáveis + pré-visualização do WhatsApp), 5 canal e horário (agora ou agendado), 6 revisão (custo estimado = alcance × custo por mensagem) | etapa incompleta, template pendente de aprovação, alcance zero, custo alto |
| S10 | Detalhe da campanha | clique em S08 | medir | funil (enviadas → entregues → lidas → respondidas/clicadas → convertidas), erros, opt-outs, custo total, receita atribuída, ROI, gráfico por dia, lista de conversões | enviando (ao vivo), concluída, com erros |
| S11 | Templates do WhatsApp | menu › Campanhas › Templates | gerir mensagens aprovadas | lista (nome, categoria marketing/utilidade, idioma, status Meta: pendente/aprovado/rejeitado), editor (corpo com {{1}}, cabeçalho com imagem, botões) | pendente, rejeitado com motivo |
| S12 | Automações | menu › Automações | listar fluxos ativos | lista (nome, gatilho, ativo/pausado, execuções, conversões), galeria de modelos | vazio, preenchido |
| S13 | Editor de automação | S12 › Nova / modelo | montar fluxo | gatilho → condições → esperas → ações (enviar template, notificar gerente, aplicar tag), pré-visualização do caminho, publicar | rascunho, publicado, erro de configuração |
| S14 | Análise de clientes | menu › Relatórios › Clientes | retenção | curva de retenção (coortes), taxa de recompra, tempo entre compras, LTV médio, clientes ativos (90 d), recuperados, melhores bairros, evolução RFV | carregando, preenchido |
| S15 | Análise de vendas e catálogo | menu › Relatórios › Vendas | contexto de compra | evolução da receita, itens por venda, canais de venda, valor médio, categorias, venda cruzada | — (parte já existe no módulo Vendas do VTP) |
| S16 | Cupons | menu › Relatórios › Cupons | desempenho de cupom | vendas com cupom (código, valor, cliente), uso por campanha | vazio, preenchido |
| S17 | Avaliações | menu › Avaliações | ver e reagir a notas | lista de avaliações ligadas a pedido e cliente, filtro por nota, resposta | vazio, preenchido |
| S18 | Configurações do CRM | menu › Configurações › CRM | regras gerais | janela de atribuição por grupo RFV (dias), limite de mensagens por cliente por semana, palavra de opt-out, custo por mensagem, conta WhatsApp conectada | — |

## Flows

```
F01 Gestor reativa clientes que sumiram (o fluxo pago)
    S04 (grupo "em risco") -> S09 etapas 1..6 -> agendar -> S10
    happy path clicks: ~9 (Repediu diz "campanha em 6 etapas")
    edge: segmento sem opt-in; template ainda pendente na Meta; cliente já recebeu campanha
          esta semana (limite de frequência); número inválido; envio cai fora do horário
          comercial; cupom expira antes do fim da janela de atribuição

F02 Cliente recebe a campanha e responde
    WhatsApp -> webhook-whatsapp -> conversa abre no Atendimento (já existe) com o contexto da campanha
    edge: responde "SAIR"/"PARAR" -> opt-out imediato; responde fora da janela de 24 h

F03 Cliente compra depois da mensagem (conversão)
    cw-sync grava o pedido -> casa pelo telefone -> pedido dentro da janela do grupo RFV -> Conversão
    edge: comprou pelo iFood (telefone mascarado/ausente: não casa); usou o cupom sem ter recebido
          a mensagem; comprou 2 vezes na janela (só a 1ª conta?); recebeu 2 campanhas (qual leva?)

F04 Gestor configura o RFV da pizzaria
    S04 -> S05 -> ajustar faixas -> ver prévia -> salvar -> S04 reclassificada
    happy path clicks: ~5

F05 Gestor cria um segmento próprio
    S06 -> S07 -> adicionar condições -> ver alcance -> salvar
    edge: alcance zero; condição que depende de produto que mudou de nome no cardápio

F06 Automação "cliente inativo" a partir de modelo
    S12 -> modelo "Reativar inativos" -> S13 -> ajustar dias e template -> publicar
    gatilho diário (pg_cron): cliente passou de N dias sem pedido -> ainda sem pedido? -> envia template
    edge: cliente comprou entre o gatilho e o envio; cliente em opt-out; já está numa campanha

F07 Automação "boas-vindas" e "aniversário"
    1º pedido -> espera X dias -> envia template de 2ª compra com cupom
    aniversário no dia -> envia template
    edge: data de nascimento ausente (CW não traz; precisa coletar)

F08 Avaliação ruim -> gerente avisado
    nota ≤ 2 (iFood reviews, já existe ifood-reviews) -> alerta no VTP / WhatsApp interno
    edge: avaliação sem cliente identificável

F09 Atendente vê o perfil durante a conversa
    Atendimento (conversa) -> painel lateral com S03 resumido (RFV, último pedido, ticket)
    happy path clicks: 0 (abre junto)

F10 Gestor mede o resultado do mês
    S01 -> período -> S10 da melhor campanha -> S14
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| KPI card | valor, valor com variação %, moeda | carregando | S01, S10, S14 |
| Badge RFV | 5 macro + 11 grupos, cor por grupo | — | S02, S03, S04, Atendimento |
| Tabela de clientes | com filtro, ordenação, paginação, exportar | vazia, filtrada vazia | S02, S16, S17 |
| Grade RFV | grade de 11 células, clicável | carregando | S04, S05 |
| Construtor de regras | condição, grupo E/OU, operador, valor | inválido | S05, S07, S13 |
| Contador de alcance | total / com opt-in / custo estimado | calculando | S07, S09 |
| Assistente em etapas | 6 passos com progresso | etapa completa/incompleta | S09 |
| Prévia de mensagem do WhatsApp | balão com cabeçalho, corpo, botões | com variáveis preenchidas | S09, S11 |
| Funil | horizontal por etapa | ao vivo | S10 |
| Editor de fluxo | nós gatilho / condição / espera / ação, linhas ligando | rascunho, publicado | S13 |
| Linha do tempo do cliente | pedido, mensagem, conversão, avaliação | — | S03 |
| Seletor de período | hoje / 7 / 30 / 90 dias / intervalo | — | S01, S10, S14 |
| Gráfico de linha / barras / coortes | — | vazio | S01, S10, S14 |
| Chip de status | rascunho, agendada, enviando, concluída, pausada, erro | — | S08, S11, S12 |

O VTP já tem chips, modais, tabelas e cards no design system (`design-system.html`). Os itens
novos de verdade são: grade RFV, construtor de regras, assistente em etapas, prévia de WhatsApp,
funil e editor de fluxo.

## Inferred data model

Campos da Repediu vêm do OpenAPI público (fonte 12). Aqui eles já estão traduzidos para o VTP.

```
Cliente          id, telefone (e164, chave de unificação), nome, email, data_nascimento, bairro,
                 cidade, cw_customer_ids[], criado_em, atualizado_em
                 evidence: Customer (identifier, externalIds, contacts, birthDate, addresses);
                           cw_pedidos.customer_phone/customer_id                        confidence: high

ClientePerfil    cliente_id, primeira_compra, ultima_compra, qtd_pedidos, gasto_total, ticket_medio,
(derivado)       dias_medios_entre_compras, melhor_dia_semana (0=dom), produtos_favoritos[],
                 canal_preferido, rfv_r, rfv_f, rfv_v, rfv_grupo (11), rfv_macro (5), recalculado_em
                 evidence: CrmCustomerItem (firstPurchaseAt…bestWeekday, rfvStatus);
                           CrmCustomerDetail.orderHistory (favoriteProducts, purchaseChannel)  confidence: high

Consentimento    cliente_id, canal (whatsapp|email), status (opt_in|opt_out), origem, em, revogado_em
                 evidence: CustomerConsent (purpose, channel, status, source, grantedAt, revokedAt)
                                                                                              confidence: high

RfvConfig        faixas_recencia[], faixas_frequencia[], faixas_valor[], mapa_grupos (score → grupo)
                 evidence: página Matriz RFV; "até 11 variações" de rfvStatus             confidence: medium

Segmento         id, nome, tipo (rfv_fixo|personalizado), regras (jsonb), qtd_cache, atualizado_em
                 evidence: Campaign.audienceSegments (segmentId, name); planos limitam nº de segmentos
                                                                                              confidence: high

Template         id, nome_meta, categoria (marketing|utility), idioma, corpo, variaveis[], cabecalho,
                 botoes, status_meta (pending|approved|rejected), motivo_rejeicao
                 evidence: WhatsApp Cloud API (não é dado da Repediu)                      confidence: high

Campanha         id, nome, canal, status, segmento_ids[], template_id, cupom_codigo, agendada_para,
                 inicio, fim, custo_por_envio, criado_por
                 evidence: CampaignItem (campaignId, name, channel, status, startDate, endDate,
                           audienceSegments, costPerSend)                                  confidence: high

CampanhaEnvio    id, campanha_id, cliente_id, telefone, wamid, status (pending|sent|delivered|read|
                 failed), erro, enviado_em, entregue_em, lido_em, respondido_em, custo
                 evidence: CampaignStats (sent, delivered, read, error, pending, opened, clicked,
                           unsubscribed, totalCost); webhook statuses da Meta              confidence: high

Conversao        id, pedido_id (cw_pedidos.id), cliente_id, campanha_id?, envio_id?, canal, valor,
                 convertido_em, dias_desde_mensagem, rfv_no_momento, is_reativacao
                 evidence: ConversionItem (todos esses campos) + meta.attributionWindow       confidence: high

JanelaAtribuicao grupo_rfv (champion|loyal|promising|risk|lost), dias
                 evidence: meta.attributionWindow; página Atribuição                       confidence: high

Automacao        id, nome, gatilho (tipo + params), passos (jsonb: condição/espera/ação), ativa,
                 modelo_origem
                 evidence: página Automações (gatilho → condição → canal, esperas)          confidence: medium

AutomacaoExecucao id, automacao_id, cliente_id, passo_atual, proximo_em, status, log
                 evidence: inferido ("cliente comprou desde o gatilho?")                     confidence: guess

Avaliacao        id, pedido_id, cliente_id, nota, comentario, data, origem (ifood|google|pesquisa)
                 evidence: Rating (ratingId, saleId, customerId, stars, review, ratingDate,
                           integrationId); VTP já tem ifood-reviews                       confidence: high

Pedido           = cw_pedidos (já existe: id, total, sales_channel, items, customer_*, coupon_code,
                 delivery_address, cw_created_at)                                          confidence: high
```

Relationships: Cliente 1-n Pedido (por telefone), Cliente 1-1 ClientePerfil, Cliente 1-n
Consentimento, Campanha n-n Segmento, Campanha 1-n CampanhaEnvio, Cliente 1-n CampanhaEnvio,
Pedido 0-1 Conversao, Conversao 0-1 Campanha/CampanhaEnvio, Automacao 1-n AutomacaoExecucao,
Pedido 0-1 Avaliacao. Ligação com o Atendimento: `atd_contatos.telefone` = `Cliente.telefone`.

Definições de métrica (fonte 13/14, para os números do VTP baterem com o conceito):
- taxa de recompra = clientes com `qtd_pedidos > 1` ÷ total da base
- LTV médio = soma do gasto ÷ **total** de clientes (incluindo quem comprou uma vez)
- clientes ativos = última compra nos últimos 90 dias (ajustável)
- frequência = pedidos do período ÷ clientes únicos ÷ meses (ou semanas)
- receita via CRM = receita recuperada (conversões com reativação) + receita recorrente (de clientes que já eram ativos)
- taxa de conversão da campanha = conversões ÷ mensagens enviadas × 100

## Feature matrix

See `features.csv`. Must: 21, should: 15, could: 9, skip: 8.

## Out of scope (cannot or should not be cloned)

- **A marca, os textos, o layout e o nome "Repeteco"** (protegidos pelos termos, cláusula 7).
- **As 120+ integrações e a rede de parceiros/agências/embaixadores.** O VTP só precisa do
  CardápioWeb (já sincronizado em `cw_pedidos`) e do iFood (reviews, já existe).
- **Tracker de carrinho abandonado e pixel nos cardápios**: o cardápio é do CardápioWeb, não temos
  como colocar script lá. Só se o CW expuser esse evento na API dele.
- **Voz, RCS e SMS**: precisam de outros provedores e contratos. O foco é WhatsApp oficial.
- **"Unificação de base com IA" e inferência de gênero**: o VTP unifica por telefone, o que é
  determinístico e suficiente para uma loja.
- **Créditos de comunicação / revenda de mensagens**: no VTP o custo é a cobrança direta da Meta
  na WABA própria.
- **Multi-loja / redes / franquias**: uma loja só.
- **Clientes do iFood sem telefone**: o iFood mascara o contato; esses pedidos ficam fora da base
  acionável (entram só nas métricas de venda).

## Size

Screens 18, flows 10, entities 14 (13 novas + `cw_pedidos`).

Hard parts:
1. **Templates e regras da Meta para campanhas**: mensagem de marketing fora da janela de 24 h só
   com template aprovado (categoria marketing, cobrado por mensagem). Também é preciso respeitar o
   limite de envio diário do número (tier), a qualidade do número e os opt-outs. A
   `enviar-mensagem` atual só manda texto livre: falta enviar template, criar e sincronizar
   templates pela API de gestão e gravar os status por envio no `webhook-whatsapp`.
2. **Disparo em massa confiável**: fila no Postgres e worker por pg_cron/Edge Function com lotes,
   retry, idempotência (sem envio duplicado) e pausa quando a Meta limita.
3. **Atribuição correta**: casar pedido com cliente pelo telefone (normalizado), aplicar a janela
   do grupo RFV, decidir qual campanha leva a conversão e marcar reativação. Pedidos do iFood sem
   telefone ficam de fora.
4. **LGPD e acesso**: a tabela `cw_pedidos` está com leitura liberada para `anon` e já guarda
   telefone e endereço de cliente. O CRM concentra dados pessoais, então leitura só para usuário
   logado com perfil de gestor, opt-out obrigatório e registro de consentimento.
5. **Editor visual de automações**: o should mais caro. Uma versão em formulário (gatilho →
   espera → condição → template) cobre os modelos principais sem um editor de nós.

Size: **L** (um trimestre) para tudo que é must + should. **M** (algumas semanas) para o núcleo:
base unificada + perfil + RFV configurável + segmentos + campanha com template + funil + atribuição
(F01–F05, F09, F10).

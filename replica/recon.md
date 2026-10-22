# Recon map: Moovery — Painel do Lojista (web)

Scope: painel do estabelecimento — solicitar entrega → expedição em tempo real → acompanhar
motoboy até a entrega → financeiro (saldo/taxas) → indicadores. App do entregador fica fora
do recon (mas o clone vai precisar de um, ver "Out of scope").
For: uso interno da Vai Ter Pizza! (Maceió), como módulo do sistema VTP (HTML/JS + Supabase).
Date: 2026-10-12

> Regras seguidas: só a conta do próprio usuário, navegação manual em ritmo humano, apenas
> leitura (nenhuma entrega criada/cancelada, nenhuma configuração salva). Não foi lido JS,
> nem endpoints privados. Nenhum dado pessoal de cliente/entregador foi copiado para cá.
> Screenshots NÃO foram salvos em `replica/screens/` porque continham nomes, telefones e
> foto de entregadores — só foram usados para leitura de layout durante a sessão.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | site institucional | https://moovery.app/ | posicionamento: "cuidamos do seu delivery"; sede em João Pessoa; sem preços públicos |
| 2 | login do Hub | https://hub.moovery.app/login | e-mail+senha, "manter conectado", "esqueci senha", login sem senha (OTP) |
| 3 | conta do usuário | https://moovery.app/painel/* | painel legado (PHP + iframes `v2/*_view.php`) — fonte principal |
| 4 | app do entregador | Google Play `app.moovery` | listagem retorna 404 hoje |
| 5 | help center / termos / pricing | — | não existem publicamente |

## Core loop

O lojista cadastra (ou recebe via integração CardápioWeb/iFood) um pedido pronto para sair,
a plataforma aloca um motoboy, agrupa pedidos em rotas, e o lojista acompanha cada etapa
cronometrada até a entrega — pagando uma taxa por km, debitada de um saldo pré-pago.

## Screens

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Login | hub `/login` | autenticar o estabelecimento | form e-mail/senha, manter conectado, OTP, esqueci senha | default |
| S02 | App shell | todas | navegação | topbar roxa com **saldo** (vermelho se negativo), logout, sidebar com grupos (Solicitar, Financeiro, Relatórios), botão flutuante **Suporte** (chat), bolha **iFood** com contador | mobile (sidebar colapsada) |
| S03 | Dashboard | `/painel/` (iframe `v2/dashboard_empresa_view`) | KPIs do período | atalhos Hoje/Ontem/7/30 dias + datas, tag "Logística Moovery", cards Entregas / Motoboys / Valor entregas / Total c/ garantido, gráfico **Evolução diária**, **Mapa de calor**, tabela **Desempenho diário** (data, qtd, motoboys, motoboys agendados, v. garantido, v. entrega, total), tabela **Tempo médio por distância** (faixas de 1 km: qtd, preparo, saída, rota, total), **Ranking de motoboys** (entregas, tempo médio, valor, garantido, vagas x/y/z), drawer de motoboy (Resumo/Tempos/Entregas/Rotas), modal "Histórico da entrega iFood", "Comparativo de custos" | filled, loading |
| S04 | Expedição | `/painel/expedicao` | central operacional ao vivo | toggle **APOIO Fechado/Aberto**, busca nº pedido, abas Expedição / Retornando / Mapa, chips de métricas (maior tempo, prontas, prontas c/ moto, em rota, entregues), colunas **Coleta / Caminho / Solicitando**, cards de rota (foto+nome do motoboy, status com cronômetro, nºs dos pedidos agrupados, forma pgto + cliente + tempo + bairro, CHAT, QTD, ID da rota), lista **Em preparação**, botão **Solicitar iFood**, botões lista/+ | filled, loading (spinners em "solicitando") |
| S05 | Expedição › Retornando | `#retornando` | motoboys voltando à loja | card do motoboy + pedidos entregues + **Confirmar retorno** | filled |
| S06 | Expedição › Mapa | `#mapa` | ver tudo no mapa | Google Maps (ou "mapa cinza"), pin da loja, pins numerados por pedido coloridos por status, foto do motoboy, legenda com contagem por status | filled |
| S07 | Solicitar agora | `/painel/solicitar` | cadastrar entrega + acompanhar o dia | banners (saldo insuficiente, novidades, feriado/tarifa dinâmica), aviso **Dinâmica ativada: +R$ x por entrega**, form (comanda*, endereço* autocomplete + favoritar, complemento, pago em* ONLINE/DINHEIRO+30%/CRÉDITO+30%/DÉBITO+30%, nome do cliente, frágil), lista de entregas do dia em cards (ver abaixo), seção "Rotas concluídas" (auto-finaliza após 1 h) | filled, saldo negativo |
| S08 | Card de entrega | dentro de S07 | detalhe e ações de 1 entrega | nº comanda, motoboy+telefone, Visualizar rota, Chat, rota/ID, horários (cadastro, solicitação, entregue), cliente, endereço, complemento, instrução, integração (CARDAPIOWEB / ifood-v2), pagamento, total, receber, troco, valor entrega, frágil, **timeline de 7 tempos** (preparo, corrida aceita, chegada à loja, coletado, em rota, espera no destino, total), badge de status, ações (Cancelar, Pronto para retirada, Link de rastreio, Recadastrar, Finalizar entrega, Avaliar entrega) | todos os status abaixo |
| S09 | Agendar entrega | `/painel/agendar_entrega` | entrega futura | forma pgto, data*, hora*, comanda*, endereço*, complemento, nome, celular; lista "corridas recentes" | empty |
| S10 | Entrega avulsa | `/painel/entrega_avulsa/cadastrar` | ponto A→B qualquer (ex.: buscar insumo) | retirada (endereço, instruções, remetente, tel, compl.), destino (idem), comanda, frágil, **distância e valor calculados** antes de cadastrar | empty |
| S11 | Extrato financeiro | `/painel/extrato_financeiro` | saldo pré-pago | adicionar créditos (Cartão/Boleto/PIX, mínimo R$100), cobranças em aberto, **Saldo / Entregas em andamento / Saldo disponível**, filtros (período, tipo, descrição), exportar, tabela (id, descrição, data, tipo, valor, subtotal acumulado) | filled, negativo |
| S12 | Taxas de entrega | `/painel/taxa_entrega` | tabela de preço | filtro por veículo (bike/moto/carro), tabela km → taxa (1 km R$7 … 20 km R$26, +R$1/km) | filled |
| S13 | Recargas | `/painel/recargas` | histórico de recargas | (vazio na conta) | empty |
| S14 | Entregas (histórico) | `/painel/entregas` | buscar entregas finalizadas/canceladas | filtros (datas, entregador, status, id/rota/comanda), exportar, tabela (id, motoboy, integração, endereço, cliente, comanda, data, distância, pagamento, pronto, confirma, chegada, saída, rota, espera, total, cancelamento), paginação | empty-before-filter |
| S15 | Entregadores fixos | `/painel/entregadores_fixos_old` | escala de motoboys fixos por turno | seletor de data (passado + ~7 dias futuros), período (Todo o dia/Almoço/Jantar), tabela (id vaga, entregador, ganhos, corridas, data, início, fim, chegou, atraso, status EM ABERTO/CONFIRMADO) | filled, vaga em aberto |
| S16 | Crescimento | `/painel/empresa_crescimento` | visão de 6 meses | datas + "últimos 6 meses", KPIs (finalizadas, taxa total, % cancelamento, motoboys), gráfico evolução (criadas/finalizadas/canceladas), snapshot do mês, comparativo mensal com variação %, gráfico taxa, **motivos de cancelamento**, tempos médios (preparo/coleta/total) + gráficos, histórico detalhado | filled, loading |
| S17 | Relatório integradas | `/painel/relatorio_empresa` | quantas entregas vieram por integração | datas, exportar, tabela data/integrado/não integrado | empty |
| S18 | Configurações | `configuracoes_empresa.php` (iframe v2) | regras da loja | veículos permitidos (moto/bike/carro), **URL webhook**, nº de **maquinetas**, dias máx. de agendamento, **integração iFood: solicitar entregador iFood automaticamente** + tempo (min após pronto) | filled |
| S19 | Novidades | `/painel/novidades` | changelog | lista de atualizações | empty |
| S20 | Modal "Dados do gestor" | aparece sozinho | coletar contato do gestor | nome, WhatsApp, e-mail | — |
| S21 | Indique e ganhe | `autologin_site.php` | programa de indicação (outro site) | não explorado | — |

## Status da entrega (máquina de estados observada)

```
AGENDADA → EM PREPARACAO → (Pronto para retirada) → AGUARDANDO ALOCACAO / SOLICITANDO
  → MOTOBOY A CAMINHO (corrida aceita) → MOTOBOY CHEGOU NA COLETA → COLETADO
  → MOTOBOY EM ROTA → MOTOBOY CHEGOU DESTINO → ENTREGUE → (RETORNANDO → retorno confirmado)
  ↘ CANCELADA (com motivo)           ↘ "Atraso ou ocorrência" (flag)
Rotas concluídas são finalizadas automaticamente após 1 h.
```

## Flows

```
F01 Pedido do CardápioWeb vira entrega (integração)
    pedido entra sozinho em S07/S04 como EM PREPARACAO → lojista clica "Pronto para retirada"
    → sistema aloca motoboy (agrupa em rota) → acompanha em S04 → ENTREGUE
    happy path clicks: 1
    edge: sem motoboy disponível (fica SOLICITANDO; pede apoio iFood), pedido cancelado no CW,
          endereço sem lat/lng, cliente não atende (espera no destino), pagamento na entrega com troco

F02 Cadastrar entrega manual
    S07: comanda → endereço (autocomplete) → pago em → [cliente] → Cadastrar
    happy path clicks: ~5
    edge: saldo insuficiente, endereço fora da área, tarifa dinâmica ativa

F03 Agendar entrega          S09 → data/hora → dados → Agendar   (limite de N dias, S18)
F04 Entrega avulsa A→B       S10 → retirada → destino → vê distância/valor → Cadastrar
F05 Acompanhar a operação    S04 colunas / S06 mapa / chat com motoboy / link de rastreio p/ cliente
F06 Fechar a entrega         ENTREGUE automático pelo motoboy OU "Finalizar entrega" manual;
                             avaliar entrega; "Recadastrar" (cria de novo a partir de uma antiga)
F07 Retorno do motoboy       S05 → Confirmar retorno (importante p/ dinheiro/maquineta)
F08 Pedir apoio iFood        botão Solicitar iFood ou automático após X min sem motoboy (S18)
F09 Recarregar saldo         S11 → valor ≥ 100 → PIX/cartão/boleto → crédito no extrato
F10 Escala de fixos          S15 → data/turno → ver vagas, quem confirmou, atraso, ganhos
F11 Analisar desempenho      S03 (semana) / S16 (6 meses) / S14 (busca e exportação)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Topbar com saldo | positivo / negativo (vermelho) | — | todas |
| Sidebar | itens + grupos expansíveis | ativo, colapsada (mobile) | todas |
| Banner de alerta | erro (saldo), promo (novidades), dinâmica (verde), feriado | dispensável | S07 |
| Toggle Aberto/Fechado | — | on/off | S04, S07 |
| Atalho de período | Hoje/Ontem/7/30 + date range | ativo | S03, S16, S11, S14 |
| KPI card | com ícone colorido, com subtítulo | loading | S03, S16 |
| Card de rota (expedição) | coleta / caminho / solicitando / em preparação / retornando | cronômetro, foto motoboy | S04, S05 |
| Card de entrega | por status | ações contextuais | S07 |
| Timeline de tempos | 7 etapas em min | parcial / completa | S07, S14 |
| Badge de status | 10 status + cores | — | S04, S06, S07 |
| Mapa com pins | pin loja, pin pedido numerado, foto motoboy | legenda com contagem | S06 |
| Autocomplete de endereço | + favoritar | — | S07, S09, S10 |
| Segmented "pago em" | Online / Dinheiro / Crédito / Débito (+30%) | — | S07, S09 |
| Tabela com filtro + exportar | paginação | vazia "preencha e filtre" | S11, S14, S15, S17 |
| Ranking | por entregas / por tempo | — | S03 |
| Drawer de motoboy | Resumo/Tempos/Entregas/Rotas | loading | S03 |
| Chat flutuante | suporte / motoboy | badge | todas |
| Modal | form | — | S20 |

## Inferred data model

```
Estabelecimento  id, nome, endereço+lat/lng, saldo, veiculos_permitidos[], webhook_url,
                 maquinetas, dias_max_agendamento, apoio_aberto(bool),
                 ifood_auto(bool), ifood_auto_min, gestor{nome,whatsapp,email}
                 evidence: S02, S04, S18, S20                                  confidence: high

Entrega          id, rota_id, estabelecimento_id, comanda, origem (manual|cardapioweb|ifood|avulsa),
                 cliente_nome, cliente_tel, endereco, complemento, instrucao, lat, lng,
                 distancia_km, pagamento (online|dinheiro|credito|debito), total, a_receber, troco,
                 taxa_entrega, taxa_dinamica, fragil, status, agendada_para,
                 ts_cadastro, ts_pronto, ts_solicitacao, ts_aceite, ts_chegada_loja, ts_coleta,
                 ts_em_rota, ts_chegada_destino, ts_entregue, ts_cancelada, motivo_cancelamento,
                 avaliacao, tracking_token
                 evidence: S07/S08, S14 colunas                                confidence: high

Rota             id, motoboy_id, estabelecimento_id, entregas (1-n), status, ts_saida, ts_retorno,
                 retorno_confirmado
                 evidence: "QTD:2 <rota>" no card, "Confirmar retorno"         confidence: high

Motoboy          id, nome, telefone, foto, veiculo (moto|bike|carro), posicao (lat,lng,ts)
                 evidence: S04, S06, S03 ranking                              confidence: high

Vaga (turno fixo) id, estabelecimento_id, motoboy_id|null, data, inicio, fim, periodo,
                 chegou_em, atraso_min, status (em_aberto|confirmado), ganhos, corridas,
                 valor_garantido
                 evidence: S15, "garantido" no S03                             confidence: high

TabelaTaxa       veiculo, km, valor   (+ adicional dinâmico por período)    evidence: S12  confidence: high
Transacao        id, estabelecimento_id, tipo (credito|debito), valor, descricao, entrega_id?, ts,
                 subtotal  ("saldo disponível" = saldo − entregas em andamento)
                 evidence: S11                                                 confidence: high
EnderecoFavorito estabelecimento_id, endereço, lat/lng                         evidence: S07  confidence: guess
Mensagem (chat)  entrega_id/rota_id, autor, texto, ts                          evidence: S08  confidence: guess
```

Relationships: Estabelecimento 1-n Entrega, Rota 1-n Entrega, Motoboy 1-n Rota, Estabelecimento
1-n Vaga, Motoboy 1-n Vaga, Estabelecimento 1-n Transacao, Entrega 0-1 Transacao (débito da taxa).

## Feature matrix

See `features.csv`. Must: 20, should: 15, could: 9, skip: 5.

## Out of scope (cannot or should not be cloned)

- **A rede de entregadores da Moovery** e a operação logística deles (recrutamento, garantido,
  supervisão). O clone só funciona com **motoboys próprios/fixos da VTP** (vocês já têm 7–8
  fixos por noite na escala) ou com uma API pública de terceiros.
- **Saldo pré-pago / recarga via Mercado Pago**: faz sentido na Moovery porque ela cobra o
  lojista. Na operação própria vira **acerto com o motoboy** (diária + por entrega), não recarga.
- **Apoio iFood (rede iFood)**: só via API oficial do iFood (Entrega Fácil/Logística), com conta
  e contrato próprios — fica como "could".
- **App do entregador**: não foi analisado; o clone vai precisar de um (PWA simples).
- Marca, logos, cores roxo/laranja da Moovery, textos e banners.

## Size

Screens 21, flows 11, entities 9. Hard parts: (1) app do motoboy com GPS ao vivo e mudança de
status (realtime), (2) roteirização/agrupamento de pedidos em rotas e alocação, (3) geocodificação +
distância por rua (Google Maps/Mapbox, custo por chamada). Integração CardápioWeb já existe no
VTP (`cw_pedidos` com `delivery_address` + lat/lng, e a API CW tem dispatch/driver). Size: **L**
(um trimestre) para tudo; **M** (algumas semanas) para o núcleo F01+F05+F06+F07+F10.

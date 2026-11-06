# Módulo Gestão — v2 (áreas e sub-áreas)

Redesenho de 06/11/2026. Substitui a v1 (etiquetas → metas → ações, kanban, nota 1–5).
A migration da v1 **nunca foi aplicada**, então não há dado para migrar: o schema é reescrito.

Fica da v1: entrada no menu, permissão "Gestão" em Configurações → Usuários, rota `#gestao/<aba>`,
escrita via RPC `SECURITY DEFINER` com `p_usuario_id`, leitura anon, sem `empresa_id`, fuso `America/Maceio`.

---

## 1. A espinha: áreas e sub-áreas

Tudo no módulo (atividade, rotina do balanço, processo) pertence a **uma sub-área**. A área vem dela.

| Área | Sigla | Cor | Sub-áreas |
|---|---|---|---|
| Administrativo | **ADM** | laranja | Pessoas · Financeiro · Estratégico · Governança |
| Operação | **OPE** | verde | Estoque · Compras · Cozinha · Atendimento · Logística · Patrimônio · Gerência |
| Produto | **PRO** | azul | Produtização |
| Marketing | **MKT** | roxo | Marketing e Vendas |

- As 4 áreas são fixas (código). As cores saem de tokens (`--area-adm`, `--area-ope`, `--area-pro`, `--area-mkt`).
- Sub-áreas vêm pré-cadastradas; podem ser renomeadas, reordenadas ou desativadas (nunca apagadas se tiverem uso).
- Na tela a área aparece como **selo com a sigla na cor**; a sub-área, pelo nome por extenso.

---

## 2. Aba Plano de Ação

**Objetivo:** gestor de atividades da gestão — quem é o responsável, em que pé está, até quando.

### Colunas da lista
| Coluna | Regra |
|---|---|
| Área | selo da sigla (derivado da sub-área) |
| Sub-área | obrigatória |
| Descritivo | obrigatório, texto curto; detalhes vão em Observação |
| Status | A fazer · Em andamento · Concluído (sem "Bloqueado" — decidido em 06/11) |
| Resp. Final | **um** usuário — quem responde pelo resultado |
| Resp. Execução | **vários** usuários — quem põe a mão |
| Prazo | data; fica vermelho se atrasado, âmbar se vence em ≤ 2 dias |
| Prioridade | P1 (urgente) · P2 · P3 |
| Observação | texto livre, edição inline |

### Subtarefas
- Um nível só (subtarefa não tem subtarefa).
- Cada uma tem descritivo, status, **um** responsável e prazo.
- Na linha mãe aparece o progresso **"2/4"** (no lugar de "4 subtarefas").
- Ao concluir a última subtarefa, o app pergunta se conclui a mãe (não faz sozinho).

### Usabilidade (onde dá para ir além do Pinch)
- **Edição inline em tudo**: status, responsáveis, prazo, prioridade e observação mudam na própria linha, sem abrir modal.
- **Adição rápida**: linha "+ Nova atividade" no topo; digita o descritivo, Enter salva. A sub-área do filtro ativo já vem preenchida.
- **Agrupamento** por área → sub-área, com grupos recolhíveis e contagem por grupo.
- **Barra de progresso** no topo (total · a fazer · concluído) respeitando os filtros.
- Concluídos escondidos por padrão (chave "Mostrar concluídos").
- Ordenação por clique no cabeçalho (status, prazo, prioridade).
- **Mobile:** a tabela vira card (descritivo + selo + status + prazo + avatares); toque abre o detalhe.

### Filtros (simples)
- **Status** (multi) · **Pessoa** (casa Resp. Final *ou* Execução) · **Área/Sub-área**.
- Atalho **"Minhas"** = atividades em que eu sou Resp. Final ou Execução.
- Filtros ficam salvos por usuário no `localStorage`.

---

## 3. Aba Balanço

**Objetivo:** medir, todo mês, se as rotinas-chave de cada sub-área estão rodando — e acompanhar a evolução no ano.

### Rotinas-chave
- Cada sub-área tem suas **rotinas-chave**, cadastradas pelo time **no próprio app** (sem lista pré-carregada),
  organizadas pelos tópicos das sub-áreas.
- O processo da rotina já existe (aba Processos). No balanço só se pergunta: **foi feita do jeito correto no período?**

### Avaliação: Sim / Não
| Resposta | Regra |
|---|---|
| **Sim** | Feita do jeito correto no período |
| **Não** | Não feita ou fora do padrão: **observação obrigatória** + botão **"Criar atividade"** no Plano (já com a sub-área e o vínculo com a rotina) |
| N/A | Não se aplicou no mês; sai da conta |

### Cálculo
- **Sub-área** = % de "Sim" entre as rotinas avaliadas (0–100).
- **Área** = média das sub-áreas · **Gestão** = média das 4 áreas (cada área pesa igual).
- Faixas: **≥ 85 Saudável** (verde) · **70–84 Atenção** (âmbar) · **< 70 Crítico** (vermelho).

### Fechamento (decidido no protótipo)
- Só fecha com **todas** as rotinas ativas respondidas (N/A serve para o que não se aplicou) e todo "Não" com observação.
- Enquanto está em avaliação, a nota aparece como **parcial**.
- Atividade criada a partir de um "Não" guarda `rotina_origem_id` + `balanco_origem_id`; o mês seguinte lista essas atividades com o status.
- Com Sim/Não, sub-área com 2 rotinas só pode dar 0, 50 ou 100: o ideal é **4 ou mais rotinas por sub-área**.

### Ciclo do mês
Rascunho → avaliação conjunta → **Fechar** (imutável). O fechamento guarda o texto da rotina e das âncoras da época.

### Visualizações
- **Mês:** nota da Gestão + 4 cartões de área (nota, faixa, variação vs mês anterior); abre a lista de sub-áreas e rotinas.
- **Ano (mapa de calor):** linhas = sub-áreas agrupadas por área; colunas = jan…dez; célula colorida pela faixa.
  Mostra evolução (ficou verde?) e manutenção (continua verde?) num relance.
- **Linha do ano:** nota da Gestão e de cada área mês a mês.
- **Índice de manutenção:** "meses saudáveis no ano" por sub-área (ex.: 8/10).

> Futuro: rotinas que o app já mede (contagem de estoque, checklists, etiquetagem, KDS) podem sugerir o nível sozinhas.

---

## 4. Aba Processos

**Objetivo:** a vitrine dos processos da loja — o que existe, em que pé está, e onde está o material para quem vai executar.

- Quadro: **área** (faixa colorida) → **sub-áreas** em colunas → **cards de processo**.
- Card: nome do processo + status + ícones dos recursos que ele tem (doc, vídeo, imagem).
- Status: **A construir · Em construção · Implantado · Em revisão**.
- Detalhe do processo: descrição, dono (responsável), data da última revisão e **recursos**:
  por enquanto só **links** (pasta do Drive, vídeo), com título. Upload de arquivo fica para depois.
- Card "A construir" tem o atalho **"Criar atividade"** → atividade no Plano vinculada ao processo.
- Mobile: abas por área e sub-áreas em acordeão.

---

## 5. Ligações entre as abas (opcionais, sem obrigar)
- Atividade ↔ **processo** (ex.: "Escrever o processo de recebimento").
- Atividade ↔ **rotina do balanço** (nasceu de um "Não"); o balanço do mês seguinte mostra se ela foi concluída.

---

## 6. Schema (esboço)

```
gestao_subareas        id, area ('adm'|'ope'|'pro'|'mkt'), nome, ordem, ativo
gestao_atividades      id, subarea_id, parent_id (subtarefa), descritivo, status, resp_final_id,
                       prazo, prioridade (1–3), observacao, posicao, processo_id, rotina_origem_id,
                       concluido_em, arquivado, criado_por, criado_em, atualizado_em
gestao_atividade_exec  atividade_id, usuario_id                      -- Resp. Execução (vários; vale para subtarefa)
gestao_atividade_links id, atividade_id, tipo ('pasta'|'video'|'link'), titulo, url, ordem -- entregas
gestao_atividade_hist  atividade_id, usuario_id, campo, de, para, em -- quem mudou o quê
gestao_processos       id, subarea_id, nome, descricao, status, responsavel_id, revisado_em, ordem
gestao_processo_rec    id, processo_id, tipo, titulo, url, ordem
gestao_rotinas         id, subarea_id, titulo, descricao, processo_id, ordem, ativo
gestao_balancos        id, mes (dia 1), status ('rascunho'|'fechado'), observacao, fechado_por, fechado_em
gestao_balanco_aval    balanco_id, rotina_id, resposta ('sim'|'nao'; sem linha = pendente), observacao,
                       snapshot: rotina_titulo, subarea_id
```
- Regras no banco: subtarefa só um nível; "Não" exige observação; balanço fechado imutável.
- Views: `vw_gestao_balanco_subarea` (nota 0–100 por mês) alimenta mês, mapa de calor e linha do ano.

---

## 7. Ordem de construção
1. Schema + RPCs + testes SQL, sub-áreas pré-cadastradas — `supabase/migrations/20261106120000_gestao_v2.sql` + `scripts/gestao-testes.sql` (84 verificações).
2. **Plano de Ação** (lista, inline, subtarefas, filtros, mobile).
3. **Processos** (quadro, detalhe, recursos).
4. **Balanço** (cadastro de rotinas por sub-área, avaliação Sim/Não do mês, fechamento).
5. Visões do ano (mapa de calor, linha, manutenção) e as ligações entre abas.

Cada fase: protótipo navegável com dados fictícios primeiro, banco depois.

---

## Ajustes de 06/11 (após o protótipo)
- **Plano:** lista única (sem agrupar por área), selo da área no início da linha; sem barra de "concluído" (só contagens).
  Cabeçalho clicável ordena (clicar de novo inverte); Status = status → prazo → prioridade. P1/P2/P3 com cores próprias.
  Resp. Execução múltiplo também na subtarefa. **Links de entrega** (pasta, vídeo, link) em atividade e subtarefa.
- **Balanço:** só **Sim / Não** (sem N/A); sem link de processo na rotina; visão do ano sem gráfico de linha (o mapa resolve).
- **Processos:** cards de tamanho fixo, áreas lado a lado com rolagem horizontal; botão de link no próprio card.

## Ajustes de 07/11 — escala do Balanço e rotinas iniciais
- Resposta passa a ser **Concluído · Parcial · Não realizado · N/A** (substitui Sim/Não).
  Nota: Concluído 100, Parcial 50, Não realizado 0; N/A fica fora da conta.
  Parcial, Não realizado e N/A exigem observação para fechar; Parcial e Não realizado oferecem "Criar atividade no Plano".
- Regra das perguntas: o Balanço pergunta se a rotina **rodou no mês**; se o processo existe é a aba Processos.
- Cada rotina tem pergunta (título) e **critério de Concluído** (descrição), editáveis em Balanço › Rotinas;
  o critério aparece embaixo da pergunta e vai para a foto da resposta ao fechar.
- 64 rotinas iniciais cadastradas (migration `20261107130000_gestao_rotinas_iniciais.sql`), 4 a 6 por sub-área.
- **07/11:** a aba "Balanço" passou a se chamar **Raio X** (só os textos; rota `#gestao/balanco`, tabelas e funções seguem com o nome balanco).
- **07/11:** Rotinas do Raio X sem ligação com processo. Olho = desativar (sai dos próximos meses, histórico fica); lixeira = excluir de vez (`gestao_rotina_excluir`: apaga a rotina e todas as respostas, inclusive meses fechados; atividades ficam, sem a ligação).

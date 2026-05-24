# VTP Compras — Vai Ter Pizza!

Sistema de gestão operacional completo para pizzaria. Stack: **HTML + CSS + JavaScript puro**, sem framework, sem bundler, sem build step. Persiste dados via `localStorage`. Roda diretamente no navegador (Chrome recomendado), sem servidor obrigatório.

---

## Estrutura de Arquivos

```
/
├── index.html              Entrada única da SPA — layout + todas as divs de página
├── design-system.html      Referência visual: marca, cores, tipografia, componentes
├── serve.py                Servidor local simples para desenvolvimento
│
├── assets/
│   ├── VTP_LOGO_ROXA.svg       Logo roxo (uso primário sobre fundos claros)
│   ├── VTP_LOGO_BRANCA.svg     Logo branco (sobre fundos escuros/pretos)
│   ├── VTP_LOGO_LARANJA.svg    Logo laranja (sobre fundo roxo)
│   ├── VTP_LOGO_CREME.svg      Logo creme (sobre roxo médio)
│   ├── VTP_LOGO_PRETA.svg      Logo preto (sobre fundo branco)
│   ├── VTP_LOGO_LILAS.svg      Logo lilás (sobre fundo lavanda)
│   ├── VTP_LOGO_AMARELA.svg    Logo amarelo (sobre fundo amarelo escuro)
│   └── VTP_LOGO_LILASCLARO.svg Logo lilás claro
│
├── css/
│   ├── tokens.css          Tokens de design — 7 camadas (ver seção Design System)
│   └── style.css           Componentes e utilitários
│
└── js/
    ├── icons.js            Biblioteca SVG Lucide via lc('nome', tamanho, cor)
    ├── data.js             Estado global, dados mock, localStorage, logAudit, PERMS
    ├── utils.js            goModule(), toast(), formatters, calcScore(), calcEconomia()
    ├── login.js            Autenticação, sessão, getCurrentUser(), canAccess()
    ├── dashboard.js        renderDashboard()
    ├── estoque.js          renderEstoque() — contagem diária/semanal + movimentações
    ├── compras.js          renderComprasModule() — fluxo de 6 etapas
    ├── checklist.js        renderChecklist()
    ├── desperdicio.js      renderDesperdicio()
    ├── previsao.js         renderPrevisao()
    ├── modules.js          renderPreproducao(), renderRelatorios(), renderFornecedores()
    ├── cadastros.js        renderCadastros()
    ├── configuracoes.js    renderConfiguracoes()
    ├── manutencao.js       renderManutencao()
    ├── inventario.js       renderInventario() — ativos, utensílios, contagem mensal
    ├── rh.js               renderRh() — escala, presença, hora extra, materiais
    ├── alertas.js          renderAlertas()
    └── empresa.js          renderEmpresa()
```

---

## Como Usar

```bash
# Opção 1 — abrir direto (sem servidor)
Abra index.html no Chrome

# Opção 2 — servidor local (evita restrições de CORS para assets SVG)
python3 serve.py
# Acesse http://localhost:5500
```

> Para resetar todos os dados: `localStorage.clear(); location.reload()` no console do navegador.

---

## Usuários Padrão

| Nome | E-mail | Senha | Perfil |
|---|---|---|---|
| Yuri Pappas | gerente@vaiterpizza.com | gerente123 | Gerente |
| Ana Silva | supervisor@vaiterpizza.com | supervisor123 | Supervisor |
| Carlos Lima | comprador@vaiterpizza.com | comprador123 | Comprador |
| João Pizzaiolo | joao@vaiterpizza.com | funcionario123 | Funcionário |
| Maria Atend. | maria@vaiterpizza.com | funcionario123 | Funcionário |

---

## Perfis e Permissões

| Módulo | Gerente | Supervisor | Comprador | Funcionário |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ | — |
| Estoque | ✓ | ✓ | ✓ | — |
| Pré-produção | ✓ | ✓ | ✓ | — |
| Desperdício | ✓ | ✓ | — | — |
| Compras | ✓ | ✓ | ✓ | — |
| Aprovação de compras | ✓ | ✓ | — | — |
| Checklist | ✓ | ✓ | ✓ | ✓ |
| Relatórios | ✓ | ✓ | — | — |
| Manutenção | ✓ | ✓ | — | — |
| Inventário | ✓ | ✓ | — | — |
| RH | ✓ | ✓ | — | — |
| Alertas | ✓ | ✓ | ✓ | — |
| Configurações | ✓ | — | — | — |

> Funcionários fazem login e são redirecionados diretamente para o Checklist.

> Gerentes e Supervisores têm auto-aprovação nas etapas de pré-aprovação e aprovação final do módulo Compras — sem picker intermediário.

---

## Módulos

### Dashboard
KPIs de estoque crítico, histórico recente de compras, ranking de fornecedores, distribuição de custo por categoria e economia gerada. Slot visual para CMV preparado para integração futura.

### Estoque
Dois modos de contagem:
- **Contagem Diária** — exibe apenas insumos marcados com `contagemDiaria: true` no cadastro
- **Contagem Semanal** — todos os insumos, usado para fechar a lista de compras da semana

Status por item: `crit` (< 40% do mínimo), `warn` (abaixo do mínimo ou ideal), `ok`.
Movimentações com 7 tipos: compra, ajuste, venda, produção, perda, importação CW, outros.
Importação via CSV do CardápioWeb. Histórico de contagens com divergências detalhadas.

### Compras — 6 Etapas
1. **Lista/Carrinho** — insumos sugeridos pelo estoque ou adição manual, suporte a embalagens (kg ↔ caixas)
2. **Pré-aprovação** — revisão item a item antes da cotação
   - Se o usuário logado é Gerente ou Supervisor: avança automaticamente, sem picker
   - Se não tem permissão: lista aguarda aprovação; tela de espera mostra progresso, nome do aprovador e status por item
3. **Cotação** — envio por WhatsApp, preenchimento de preços, marcação "em falta", histórico de preço por fornecedor
4. **Aprovação final** — aprova/reprova itens com ação obrigatória para reprovados; mesma lógica de auto-aprovação para gerentes/supervisores
5. **OC (Ordem de Compra)** — por fornecedor, status: `nao_enviada → enviada → confirmada`
6. **Recebimento** — conferência individual por item; responsável preenchido automaticamente pelo usuário logado

Stepper no topo: etapas concluídas em verde com ícone check, etapa atual em roxo, futuras em cinza.

### Checklist
Templates por função/turno (7 pré-configurados). Sessões diárias atribuídas com horário e responsável do turno. Acompanhamento em tempo real pelo gestor. Itens com obrigatoriedade configurável.

### Desperdício
9 categorias. Cálculo de impacto financeiro pelo custo do insumo. Filtros por data, tipo e responsável. Geração de recibo/comanda.

### Pré-produção
Ordens de produção interna com status e rastreio. Vinculado a itens com `isProd: true` no estoque.

### Previsão de Demanda
Análise histórica por dia da semana. Fatores de ajuste (chuva, feriado, evento). Cálculo de massa e fermento com temperatura. Dimensionamento de equipe e entregadores.

### Relatórios
5 abas: Visão Geral, Compras, Desperdício, Produção, Estoque. KPIs, gráficos de barras SVG inline e insights automáticos.

### Cadastros
- **Insumos** — com unidade de embalagem, marcação `contagemDiaria`, marca principal
- **Fornecedores** — com categoria (manutencao, servicos, insumos, etc.)
- **Pré-preparo** — fichas de produção interna
- **Produtos/Cardápio** e **Sabores**

### Manutenção
Abas: Visão Geral · Checklist preventivo · Equipamentos · Histórico de registros.
- Status: `em_dia | pendente | atrasado | agendado | concluido`
- Criticidade: `baixa | media | alta | critica`
- Frequências: diária, semanal, quinzenal, mensal, trimestral, semestral, anual, personalizada
- Fornecedores de serviço/manutenção puxados diretamente do cadastro (categoria `manutencao` ou `servicos`)
- Fotos via URL (upload real planejado para V2 com backend)

### Inventário
Gestão de ativos e utensílios. Contagem mensal com modo guiado (item a item) ou modo lista.
- Responsável da contagem preenchido automaticamente pelo usuário logado
- Localizações customizáveis (estoque, cozinha, salão, etc.)

### RH
Escala de turnos por semana, registro de presença, horas extras, materiais/EPI entregues e indicadores por funcionário.

### Alertas
Central de notificações do sistema. Gerado automaticamente por ações em Compras, Estoque, Manutenção e Checklist.

### Configurações
Dados da empresa, categorias de insumo (editáveis inline), tipos de desperdício, funções de RH, gestão de usuários. Acesso exclusivo do Gerente.

---

## Design System

O design system é dividido em dois arquivos CSS e documentado visualmente em `design-system.html`.

### Arquitetura de Tokens — `css/tokens.css`

7 camadas em ordem crescente de especificidade:

| Camada | Prefixo | Exemplo |
|---|---|---|
| 1. Primitivos | `--p-*` | `--p-purple-600: #7C3AED` |
| 2. Marca | `--brand-*` | `--brand-purple: #6B21D4` |
| 3. Semânticos | `--bg`, `--text`, `--border` | `--bg: #FAF7FF` |
| 4. Feedback | `--success-*`, `--warning-*`, `--danger-*` | `--warning-bg-bold: #D97706` |
| 5. Ação | `--action-*`, `--action-warm-*` | `--action-bg: var(--brand-purple)` |
| 6. Componente | `--card-*`, `--nav-*`, `--modal-*` | `--nav-item-indicator: var(--brand-orange)` |
| 7. Chart | `--chart-*` | `--chart-1: var(--brand-purple)` |

### Paleta da Marca

| Token | Valor | Uso |
|---|---|---|
| `--brand-purple` | `#6B21D4` | Cor primária, ações principais, sidebar |
| `--brand-orange` | `#F5A800` | Cor secundária, indicador de nav ativo, ações comerciais |
| `--brand-lilac` | `#A855F7` | Destaque suave, badges |
| `--brand-lilac-light` | `#DDD6FE` | Fundos de destaque |
| `--brand-yellow` | `#F0B429` | Identidade de marca, alertas positivos |
| `--brand-cream` | `#F5EDD8` | Cards warm, superfícies de destaque |

### Identidade Visual — Aplicação do Logo

| Logo | Fundo recomendado |
|---|---|
| ROXA | Laranja, Amarelo, Creme |
| LARANJA | Roxo escuro |
| CREME | Roxo médio |
| PRETA | Branco, superfícies claras |
| LILAS | Lavanda, lilás claro |
| BRANCA | Preto, fundos muito escuros |

### Regras de Ouro para Desenvolvimento

```
NUNCA usar emojis em elementos de UI
NUNCA usar ícones de outras bibliotecas além de Lucide
NUNCA usar id sequencial numérico em entidades novas — usar crypto.randomUUID()
NUNCA duplicar dados que o CardápioWeb já gerencia
NUNCA criar comentários explicando O QUE o código faz
```

### Ícones

```js
lc('nome-icone', tamanho, cor)
// Exemplos:
lc('check-circle', 16, 'var(--green)')
lc('alert-triangle', 14, 'var(--orange-dark)')
lc('user', 18, 'currentColor')
```

Retorna SVG string inline. Se o nome não existir em `LC_ICONS`, retorna SVG vazio silenciosamente.
A biblioteca contém 138 ícones Lucide mapeados. Para adicionar novos: incluir a entrada em `LC_ICONS` dentro de `js/icons.js`.

### Componentes CSS disponíveis em `style.css`

```
.btn .btn-primary .btn-ghost .btn-outline .btn-warm .btn-red .btn-xs .btn-sm
.card .card-warm
.badge .chip
.inp .field .f2
.overlay .modal .mbox
.metric .kpi-v .kpi-val
.sb-item .sb-icon .sb-label
.state-complete .state-complete-icon .state-complete-title .state-complete-sub
```

### Paleta de Status (badges e indicadores)

```
Verde   → var(--green)  / var(--green-light)    concluído, em dia, ok
Amarelo → var(--yellow) / var(--yellow-light)   pendente, atenção
Vermelho→ var(--red)    / var(--red-light)       atrasado, crítico, erro
Roxo    → var(--purple) / var(--purple-xlight)  ativo, principal, aguardando
Laranja → var(--orange-dark)/var(--orange-light) alerta intermediário
Cinza   → var(--muted)  / var(--surface2)        inativo, sem dados
```

---

## Como Adicionar um Novo Módulo

### 1. Registrar em `utils.js`
```js
// Em modInfo:
nomemodulo: { title: 'Nome', sub: 'Subtítulo' },

// Em goModule():
else if (mod === 'nomemodulo') renderNomeModulo();
```

### 2. Sidebar em `index.html`
```html
<button class="sb-item" id="nav-nomemodulo" onclick="goModule('nomemodulo')">
  <span class="sb-icon"><!-- SVG Lucide inline --></span>
  <span class="sb-label">Nome</span>
</button>
```

### 3. Div da página em `index.html`
```html
<div id="page-nomemodulo" class="page"></div>
```

### 4. Criar `js/nomemodulo.js`
```js
function renderNomeModulo() {
  const el = document.getElementById('page-nomemodulo');
  el.innerHTML = `...`;
}
```

### 5. Permissões em `data.js`
Adicionar a string do módulo nos arrays `perms` dos perfis com acesso.

### 6. Script em `index.html`
```html
<script src="js/nomemodulo.js"></script>
```

---

## Audit Log

Todas as ações relevantes do sistema são registradas automaticamente via `logAudit()`:

```js
logAudit('acao_codigo', 'Detalhe legível', 'nome_modulo');
```

Cada entrada grava: `user_id`, `user_name`, `user_role`, `acao`, `modulo`, `detalhe`, `created_at`.
Limite: 3.000 entradas (FIFO). Chave: `vtp_auditlog`.

Módulos que já registram: `login`, `logout`, `compras`, `estoque`, `desperdício`, `checklist`, `cadastros`.

---

## Dados e Persistência — localStorage

| Chave | Conteúdo |
|---|---|
| `vtp_items` | Insumos de estoque |
| `vtp_suppliers` | Fornecedores |
| `vtp_users` | Usuários e perfis |
| `vtp_session` | Sessão do usuário logado |
| `vtp_config` | Configurações da empresa |
| `vtp_listas` | Listas de compras (fluxo 6 etapas) |
| `vtp_cycle_history` | Histórico de compras concluídas |
| `vtp_price_history` | Histórico de preços por fornecedor/insumo |
| `vtp_forn_memoria` | Memória de fornecedores por insumo |
| `vtp_movimentacoes` | Movimentações de estoque |
| `vtp_hist_contagens` | Histórico de contagens físicas |
| `vtp_ordens` | Ordens de pré-produção |
| `vtp_desperdicios` | Registros de desperdício |
| `vtp_ck_templates` | Templates de checklist |
| `vtp_ck_sessoes` | Sessões de checklist atribuídas |
| `vtp_ck_turnos` | Turnos de checklist |
| `vtp_manut_itens` | Itens de manutenção preventiva |
| `vtp_manut_equip` | Equipamentos cadastrados |
| `vtp_manut_log` | Registros de manutenção executada |
| `vtp_manut_grupos` | Grupos/categorias de manutenção |
| `vtp_inv_data` | Itens do inventário de ativos |
| `vtp_inv_locs` | Localizações do inventário |
| `vtp_contagens_inv` | Histórico de contagens do inventário |
| `vtp_rh_escalas` | Escalas de turno |
| `vtp_rh_presencas` | Registros de presença |
| `vtp_rh_horasextras` | Horas extras |
| `vtp_rh_materiais` | Materiais/EPI entregues |
| `vtp_rh_config` | Configurações do módulo RH |
| `vtp_funcionarios` | Cadastro de funcionários |
| `vtp_alertas` | Alertas do sistema |
| `vtp_auditlog` | Log de auditoria de ações |
| `vtp_sabores` | Sabores do cardápio |
| `vtp_produtos` | Produtos cadastrados |
| `vtp_planejamentos` | Planejamentos de previsão de demanda |
| `vtp_emp_cargos` | Cargos/funções da empresa |
| `vtp_emp_ausencias` | Ausências registradas |
| `vtp_emp_cat_insumo` | Categorias de insumo customizadas |

---

## Convenções de Código

### Estrutura de objetos persistidos
```js
{
  id: crypto.randomUUID(),         // UUID — preparado para banco de dados
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  // ... campos do objeto
}
```
Exceção: entidades legacy (`items`, `suppliers`, `users`) usam `id` numérico incremental.

### Padrão de persistência
```js
let minhaEntidade = JSON.parse(localStorage.getItem('vtp_minhaentidade') || '[]');
const saveMinha = () => localStorage.setItem('vtp_minhaentidade', JSON.stringify(minhaEntidade));
```

### Toast de feedback
```js
toast('mensagem', 'ok')    // verde
toast('mensagem', 'err')   // vermelho
toast('mensagem', 'warn')  // amarelo
```

---

## Integração CardápioWeb (planejada)

| Recurso CW | Como usar na VTP |
|---|---|
| Pedidos (API REST) | Performance Operacional — KPIs de tempo, status em tempo real |
| Catálogo | Vincular produtos a fichas técnicas; importar cardápio |
| Loja | Status aberta/fechada no Dashboard |
| Webhook | Atualização em tempo real sem polling |

A integração é **somente leitura**. A VTP nunca cria/edita pedidos ou estoque via API CW — são camadas independentes.

---

## Roadmap

```
FASE 0  Backend + Auth + Deploy (Supabase + Vercel)
FASE 1  MVP Completo
  1.1   Estoque: alerta de ruptura iminente na Contagem Diária
  1.2   Checklist: campo responsável do turno por sessão
  1.3   Desperdício: vincular ao turno/responsável ativo
  1.4   Dashboard: slot visual para CMV (popular na Fase 2)
  1.5   Compras: histórico de preço por fornecedor/item
  1.6   NOVO: Performance Operacional (dados mockados)
FASE 2  Inteligência Financeira
  2.1   NOVO: Custo e CMV (ficha técnica, CMV semanal/mensal, alerta de desvio)
  2.2   Dashboard: integrar CMV real
  2.3   Previsão: projeção de custo financeiro por demanda prevista
FASE 3  Governança de Equipe
  3.1   Comunicados Internos (aviso + confirmação de leitura)
  3.2   Checklist: auto-atribuição pela escala do turno
FASE 4  Qualidade e Compliance
  4.1   NOVO: Auditoria Operacional (pontuação, histórico, plano de ação)
  4.2   Manutenção V2 (upload de fotos real, Docs & Compliance)
FASE 5  Escala e Expansão
  5.1   Integração real API CardápioWeb
  5.2   PWA / App mobile
  5.3   Multi-unidade + Dashboard de franqueador
```

---

*VTP Compras — Vai Ter Pizza! © 2026*

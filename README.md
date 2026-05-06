# 🍕 VTP Compras — Vai Ter Pizza!

Sistema web de gestão de compras, estoque e pré-produção para a rede **Vai Ter Pizza!**

🔗 **Acesso:** [yuripappas.github.io/vtp-compras](https://yuripappas.github.io/vtp-compras/)

---

## 📁 Estrutura

```
vtp-compras/
├── index.html
├── assets/
│   ├── logo-bg.jpg
│   └── logo-transparent.png
├── css/style.css
└── js/
    ├── data.js         # Estado global e persistência
    ├── utils.js        # Navegação e utilitários
    ├── login.js        # Autenticação e permissões
    ├── dashboard.js    # Dashboard principal
    ├── estoque.js      # Módulo Estoque
    ├── compras.js      # Módulo Compras (ciclo completo)
    ├── modules.js      # Pré-produção, Relatórios, Usuários, PDF
    ├── cadastros.js    # Insumos, Fornecedores, Pré-preparo
    ├── configuracoes.js
    └── desperdicio.js  # Controle de Desperdício
```

---

## 🔐 Login

| E-mail | Senha | Perfil |
|--------|-------|--------|
| gerente@vaiterpizza.com | gerente123 | Gerente |
| supervisor@vaiterpizza.com | supervisor123 | Supervisor |
| comprador@vaiterpizza.com | comprador123 | Comprador |

## Permissões por perfil

| Módulo | Gerente | Supervisor | Comprador |
|--------|:-------:|:----------:|:---------:|
| Dashboard | ✅ | ✅ | ✅ |
| Estoque | ✅ | ✅ | ✅ |
| Pré-produção | ✅ | ✅ | ✅ |
| Desperdício | ✅ | ✅ | ❌ |
| Compras | ✅ | ✅ | ✅ |
| Cadastros | ✅ | ✅ | ❌ |
| Relatórios | ✅ | ✅ | ❌ |
| Usuários | ✅ | ❌ | ❌ |
| Configurações | ✅ | ❌ | ❌ |

---

## 📦 Módulos

### Estoque
- Filtros por busca, categoria e status
- Barra de seleção: Selecionar tudo / Só críticos / Só baixos / Com necessidade / Desmarcar tudo
- Checkboxes por linha — selecionados vão direto para Compras (Step 1)
- Importação CSV do Cardápio Web — sync por código de produto

### Pré-produção
- Badge vermelho na sidebar com número de itens críticos
- Filtro de período + Zerar ciclo (arquiva ordens concluídas)
- Finalizar ordem com quantidade realizada (mostra variação ▲/▼)
- KPI de rendimento geral e por item
- Exportação PDF com logo

### Desperdício (Gerente e Supervisor)
- 6 categorias: Erro pré-produção · Montagem incorreta · Erro de entrega · Vencimento · Acidente · Outro
- Débito automático do estoque ao registrar
- KPIs de custo, gráfico por categoria, ranking de insumos

### Compras — 4 steps

**Dashboard fixo no topo (sempre visível)**
- KPIs do ciclo: itens, fornecedores, responderam, pendentes, aprovados
- Timer countdown do prazo
- Status individual por fornecedor
- Botões rápidos para inserir cotação de pendentes

**Step 1 — Requisição**
- Mostra somente os itens selecionados no Estoque
- Filtros: busca, categoria, status

**Step 2 — Cotação**
- Exibe somente fornecedores com insumos vinculados aos itens selecionados
- Compra Presencial com checklist interativo
- Mensagem WhatsApp pronta (fornecedor responde por WA e comprador insere manualmente)
- Botão "Inserir cotação" para resposta por telefone/e-mail

**Step 3 — Mapa**
- Comparativo por fornecedor com score
- Inserção manual de cotação por qualquer via (telefone, e-mail etc.)
- Preço unitário, total por item e total geral

**Step 4 — OC**
- Agrupada por fornecedor com totais
- Envio da OC por WhatsApp

### Cadastros
- **Fornecedores:** categorias pré-definidas como tags + busca em tempo real de insumos
- **Pré-preparo:** código Cardápio Web para sync via CSV
- **Insumos:** código, categoria, marcas, custo, mínimo, ideal

---

## 💾 Tecnologia

- HTML5 · CSS3 · JavaScript puro (sem frameworks)
- `localStorage` para dados · `sessionStorage` para sessão
- Hospedagem: GitHub Pages

## 🔄 Fluxo recomendado

```
Estoque → importar CSV → selecionar itens → Gerar Lista
Compras → confirmar itens → selecionar fornecedores → enviar/inserir cotações → aprovar → OC
Pré-produção → criar ordens → finalizar com qtd real → zerar ciclo
Desperdício → registrar perdas → monitorar KPIs
```

## 📝 Versões

| Versão | Descrição |
|--------|-----------|
| v1.0 | Estoque, Compras básico, Cadastros |
| v2.0 | Ciclo completo de cotação com WhatsApp |
| v3.0 | Login, Pré-produção, Relatórios, PDF |
| v3.1 | Logo VTP, Compra Presencial |
| v3.2 | Filtros Compras, Qtd. realizada, Desperdício |
| v3.3 | Busca fornecedores, Badge críticos, Código Pré-preparo |
| v3.4 | Dashboard fixo Compras, cotação manual, seleção Estoque |

---
*Vai Ter Pizza! · 2025–2026*

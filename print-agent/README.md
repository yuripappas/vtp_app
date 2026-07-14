# VTP Print Agent — validação Zebra ZD220 via MacBook

Bridge local que recebe ZPL do app VTP (rodando em `http://localhost:5500`) e
manda para a Zebra ZD220 conectada por USB no Mac, via fila **raw** do CUPS.

Essa é uma etapa de **validação** — prova que o ZPL gerado e o layout 60×60mm
funcionam de verdade na impressora física. Quando o app migrar para um tablet
Android com OTG confirmado, a impressão passa a ser feita direto do navegador
via WebUSB, e esse agente deixa de ser necessário.

## 1. Configurar a fila raw no macOS

A Zebra ZD220 fala ZPL nativamente. Se o macOS usar um driver genérico de
impressora, ele tenta *interpretar* o ZPL como se fosse texto normal e a
etiqueta sai ilegível. É preciso criar uma fila **raw**, que só repassa os
bytes sem processar:

1. Conecte a ZD220 no Mac via USB e ligue a impressora.
2. Ajustes do Sistema → Impressoras e Scanners → **Adicionar Impressora...**
3. Selecione a Zebra ZD220 na lista.
4. No campo **Usar** (Use), NÃO escolha um driver "Zebra" específico — escolha
   **Generic** ou **Select Software... → Generic PostScript Printer** (a opção
   exata varia por versão do macOS, mas o objetivo é uma fila que não tenta
   converter o ZPL).
5. Confirme a adição.

## 2. Descobrir o nome da fila

```bash
lpstat -p -d
```

Isso lista as filas configuradas e qual é a padrão. Anote o nome exato (ex:
`Zebra_ZD220` ou `ZD220_`).

## 3. Rodar o agente

```bash
cd print-agent
PRINTER_NAME="NomeDaFila" node agent.js
```

Se tudo certo, aparece:

```
[print-agent] Rodando em http://localhost:9123 — imprimindo na fila "NomeDaFila"
```

## 4. Rodar o app localmente e testar

Num outro terminal, na raiz do projeto:

```bash
python3 serve.py
```

Abra `http://localhost:5500` no navegador, vá em **Etiquetagem → Imprimir**,
complete o wizard normalmente. Se o agente estiver rodando, a etiqueta sai
direto na Zebra e aparece um toast de confirmação; a janela de impressão do
navegador também abre (pode fechar sem imprimir, ou usar como conferência).

Se o agente **não** estiver rodando, nada muda — o fluxo atual (impressão via
navegador) continua funcionando normalmente. Isso é intencional: em produção
(deploy no Vercel, sem Mac/impressora conectados), essa tentativa de bridge
falha em silêncio.

## Endpoints

- `POST /print` — body `{ "zpl": "^XA...^XZ" }` → imprime.
- `GET /status` — health check simples `{ ok: true, printer: "..." }`.

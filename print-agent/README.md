# VTP Print Agent — validação Zebra ZD220 via MacBook

Bridge local que recebe ZPL do app VTP (rodando local em `http://localhost:5500`
**ou** direto do site em produção, `https://app.vaiterpizza.com`) e manda para
a Zebra ZD220 conectada por USB no Mac, via fila **raw** do CUPS.

Essa é uma etapa de **validação** — prova que o ZPL gerado e o layout 60×60mm
funcionam de verdade na impressora física. Quando o app migrar para um tablet
Android com OTG confirmado, a impressão passa a ser feita direto do navegador
via WebUSB, e esse agente deixa de ser necessário.

O agente roda em **HTTPS** (certificado autoassinado, gerado sozinho no
primeiro uso, salvo em `print-agent/certs/` — não versionado). Isso é
necessário porque o site em produção é https e navegadores bloqueiam uma
página https chamando um endereço http ("mixed content"); rodando o bridge
em https esse bloqueio não existe.

## 1. Configurar a fila raw no macOS

A Zebra ZD220 fala ZPL nativamente. Se o macOS usar um driver que tenta
converter/rasterizar o conteúdo, a etiqueta sai ilegível. É preciso uma fila
**raw**, que só repassa os bytes sem processar:

1. Conecte a ZD220 no Mac via USB e ligue a impressora.
2. Ajustes do Sistema → Impressoras e Scanners → **Adicionar Impressora...**
3. Selecione a Zebra ZD220 na lista (aparece como `Zebra Technologies ZTC
   ZD220-203dpi ZPL`, USB).
4. No campo **Usar**, escolha **"Zebra ZPL Label Printer"** — esse driver já
   vem com o macOS especificamente pra repassar ZPL cru, sem tentar
   converter pra PostScript. Não precisa de "Generic PostScript Printer".
5. Clique em **Adicionar**.

## 2. Descobrir o nome da fila

```bash
lpstat -p -d
```

Lista as filas configuradas. Anote o nome exato da Zebra (ex:
`Zebra_Technologies_ZTC_ZD220_203dpi_ZPL`).

## 3. Rodar o agente

```bash
cd print-agent
PRINTER_NAME="NomeDaFila" node agent.js
```

Se tudo certo, aparece:

```
[print-agent] Rodando em https://localhost:9123 — imprimindo na fila "NomeDaFila"
[print-agent] Na primeira vez, abra https://localhost:9123/status direto no navegador e aceite o aviso de certificado.
```

## 4. Aceitar o certificado (passo único por navegador)

Como o certificado é autoassinado, o navegador nunca confiou nele antes — é
preciso aceitar manualmente **uma vez**, senão o app não consegue nem tentar
chamar o bridge:

1. Abra `https://localhost:9123/status` direto numa aba do navegador.
2. Vai aparecer um aviso de "conexão não seguraʺ / "sua conexão não é
   particular". Clique em **Avançado** (ou "Detalhes") → **"Ir para
   localhost (não seguro)"** / "Aceitar o risco e continuar".
3. Deve aparecer um JSON tipo `{"ok":true,"printer":"..."}` — pronto, esse
   navegador já confia no certificado enquanto o agente estiver com o mesmo
   certificado (ou seja, até apagar a pasta `certs/`).

Repita esse passo em cada navegador/perfil diferente que for usar (Chrome,
Safari, uma aba anônima etc. contam como "diferentes" pra esse fim).

## 5. Testar

**Local:** rode `python3 serve.py` na raiz do projeto e abra
`http://localhost:5500`.

**Produção:** abra `https://app.vaiterpizza.com` normalmente.

Em qualquer um dos dois, faça login e vá em **Etiquetagem → Imprimir**,
complete o wizard. Se o agente estiver rodando (e o certificado já aceito), a
etiqueta sai direto na Zebra e aparece um toast de confirmação; a janela de
impressão do navegador também abre (pode fechar sem imprimir, ou usar como
conferência).

Se o agente **não** estiver rodando, nada muda — o fluxo atual (impressão via
navegador) continua funcionando normalmente. Isso é intencional: em qualquer
dispositivo sem esse Mac/impressora conectados, a tentativa de bridge falha
em silêncio.

## Endpoints

- `POST /print` — body `{ "zpl": "^XA...^XZ" }` → imprime.
- `GET /status` — health check simples `{ ok: true, printer: "..." }`.

## Variáveis de ambiente

- `PRINTER_NAME` (obrigatória) — nome exato da fila CUPS.
- `PORT` (opcional, padrão `9123`).
- `EXTRA_ORIGIN` (opcional) — origens extras liberadas no CORS, separadas por
  vírgula (ex: uma URL de preview do Vercel).

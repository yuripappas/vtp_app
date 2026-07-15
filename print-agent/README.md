# VTP Print Agent — Zebra ZD220 via fila de impressão

Agente Node que escuta a **fila de impressão** (tabela `etiq_print_jobs` no
Supabase, via Realtime) e manda cada ZPL pra uma Zebra ZD220 conectada por
USB, via fila **raw** do CUPS.

Qualquer navegador — local ou em `https://app.vaiterpizza.com`, de qualquer
lugar — grava o pedido de impressão direto no Supabase. O agente só precisa
estar rodando na máquina fisicamente ligada à impressora; não depende de
rede local, IP fixo nem `localhost`.

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
   converter pra PostScript.
5. Clique em **Adicionar**.
6. **Calibre a mídia**: com a impressora ligada e a etiqueta carregada,
   segure o botão **Feed** até a luz piscar duas vezes e solte — ela alimenta
   algumas etiquetas sozinha durante a calibração. Refaça sempre que trocar
   o rolo de etiqueta.

## 2. Descobrir o nome da fila

```bash
lpstat -p -d
```

Anote o nome exato da Zebra (ex: `Zebra_Technologies_ZTC_ZD220_203dpi_ZPL`).

## 3. Instalar e rodar

```bash
cd print-agent
npm install
PRINTER_NAME="NomeDaFila" node agent.js
```

Se tudo certo, aparece:

```
[print-agent] Iniciando — imprimindo na fila "NomeDaFila"
[print-agent] Aguardando novos jobs...
```

Deixe rodando — qualquer etiqueta impressa pelo app (local ou em produção)
aparece na fila e é impressa automaticamente.

## Variáveis de ambiente

- `PRINTER_NAME` (obrigatória) — nome exato da fila CUPS.
- `SUPABASE_URL` / `SUPABASE_KEY` (opcionais) — por padrão usa as mesmas
  credenciais públicas (anon key) já usadas pelo frontend em `js/config.js`.

## Como funciona

1. Alguém completa o wizard de Etiquetagem em qualquer navegador → um
   registro é gravado em `etiq_print_jobs` (status `pendente`).
2. Ao iniciar, o agente processa qualquer job que já esteja `pendente`
   (catch-up — cobre jobs criados enquanto ele estava desligado).
3. Depois disso, escuta novos jobs em tempo real via Supabase Realtime.
4. Pra cada job: reivindica atomicamente (evita imprimir duplicado se dois
   agentes estiverem rodando por engano), imprime via `lp -d <fila> -o raw`,
   e atualiza o status pra `impresso` ou `erro`.

# VTP Print Agent — Zebra ZD220 via fila de impressão

Agente Node que escuta a **fila de impressão** (tabela `etiq_print_jobs` no
Supabase, via Realtime) e manda cada ZPL pra uma Zebra ZD220 conectada por
USB, via fila **raw** do CUPS.

Qualquer navegador — local ou em `https://app.vaiterpizza.com`, de qualquer
lugar — grava o pedido de impressão direto no Supabase. O agente só precisa
estar rodando na máquina fisicamente ligada à impressora; não depende de
rede local, IP fixo nem `localhost`.

## Produção: Raspberry Pi 3B

O ponto de impressão fixo da cozinha roda num Raspberry Pi 3B (Raspberry Pi
OS Lite, 64-bit), com Node.js 22+ (o SDK do Supabase exige WebSocket nativo,
só disponível a partir do Node 22 — o Node 20 causa o erro `Node.js detected
but native WebSocket not found`).

### Setup do zero

1. Grave o cartão com o **Raspberry Pi Imager**, usando as opções avançadas
   (⚙️) pra já configurar hostname, usuário/senha e **habilitar SSH** —
   evita precisar de monitor.
2. Depois de conectado por SSH:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs cups
   sudo usermod -aG lpadmin $USER
   ```
3. Conecte a Zebra via USB e confirme que apareceu:
   ```bash
   lsusb | grep -i zebra
   ```
4. Ache o URI e crie a fila raw (ferramentas do CUPS ficam em `/usr/sbin`,
   pode não estar no `PATH` da sessão SSH — use o caminho completo se
   precisar):
   ```bash
   export PATH=$PATH:/usr/sbin
   lpinfo -v | grep -i zebra
   sudo lpadmin -p Zebra_ZD220 -E -v "usb://Zebra%20Technologies/ZTC%20ZD220-203dpi%20ZPL?serial=XXXX" -m raw
   sudo lpadmin -d Zebra_ZD220
   ```
   (o aviso "Raw queues are deprecated" pode ser ignorado — ainda funciona.)
5. Calibre a mídia segurando o botão **Feed** da impressora até a luz
   piscar duas vezes.
6. Copie `agent.js`, `package.json` e `package-lock.json` pro Raspberry
   (`scp`) e rode `npm install` lá.
7. Crie o serviço systemd — ver `vtp-print-agent.service` abaixo — pra ele
   iniciar sozinho no boot e reiniciar sozinho se cair.
8. **Só depois de tudo testado e funcionando**, ative o Overlay Filesystem
   (sistema de arquivos somente-leitura) — assim dá pra desligar na tomada
   a qualquer momento sem risco de corromper o cartão SD:
   ```bash
   sudo raspi-config nonint do_overlayfs 0
   sudo reboot
   ```
   Depois disso, qualquer mudança no sistema precisa desativar o overlay
   temporariamente (`sudo raspi-config nonint do_overlayfs 1`, mexe, reativa
   com `0` de novo) — por isso só ativa por último.

### Serviço systemd (`/etc/systemd/system/vtp-print-agent.service`)

```ini
[Unit]
Description=VTP Print Agent - Zebra ZD220
After=network-online.target cups.service
Wants=network-online.target

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/home/SEU_USUARIO/print-agent
Environment=PRINTER_NAME=Zebra_ZD220
ExecStart=/usr/bin/node /home/SEU_USUARIO/print-agent/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vtp-print-agent
sudo systemctl status vtp-print-agent   # confirma "active (running)"
```

### Wi-Fi só pega 2.4GHz

O Pi 3B (o original, não B+) só enxerga redes **2.4GHz** — se o roteador
separar SSID por banda (ex: `NOME` vs `NOME-5G`), conecte na de 2.4GHz. Se
o país do Wi-Fi não estiver configurado, o rádio fica bloqueado
(`rfkill`) — resolve com `sudo raspi-config` → Localisation Options → WLAN
Country. Na loja, usando Ethernet cabeado, nada disso é necessário — conecta
sozinho via DHCP.

### Gerenciar remotamente (sem monitor)

```bash
ssh usuario@IP_DO_RASPBERRY
sudo shutdown -h now   # desligar com segurança antes de tirar da tomada
                        # (desnecessário com overlay ativo — aí pode tirar direto)
```

## 1. Configurar a fila raw no macOS (validação/desenvolvimento)

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

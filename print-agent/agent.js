/**
 * VTP — Print Agent (fase de validação)
 *
 * Servidor HTTP local, sem dependências externas, que recebe ZPL do
 * app VTP (rodando em http://localhost:5500) e manda pra uma Zebra
 * ZD220 conectada via USB, usando a fila "raw" do CUPS (já vem no macOS).
 *
 * Uso:
 *   PRINTER_NAME="NomeDaFila" node agent.js
 *
 * Ver README.md para como criar a fila raw no macOS e descobrir o nome.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const PORT = parseInt(process.env.PORT || '9123', 10);
const PRINTER_NAME = process.env.PRINTER_NAME || '';
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

if (!PRINTER_NAME) {
  console.error('[print-agent] Defina PRINTER_NAME com o nome da fila CUPS. Ex: PRINTER_NAME="Zebra_ZD220" node agent.js');
  console.error('[print-agent] Rode `lpstat -p -d` para listar as filas configuradas no macOS.');
  process.exit(1);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function imprimirZPL(zpl, cb) {
  const tmpFile = path.join(os.tmpdir(), `vtp_etq_${Date.now()}.zpl`);
  fs.writeFile(tmpFile, zpl, err => {
    if (err) return cb(err);
    execFile('lp', ['-d', PRINTER_NAME, '-o', 'raw', tmpFile], (err2, stdout, stderr) => {
      fs.unlink(tmpFile, () => {});
      if (err2) return cb(new Error(stderr || err2.message));
      cb(null, stdout);
    });
  });
}

const server = http.createServer((req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, printer: PRINTER_NAME }));
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
      }
      if (!payload.zpl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Campo "zpl" ausente' }));
      }
      imprimirZPL(payload.zpl, (err) => {
        if (err) {
          console.error('[print-agent] Erro ao imprimir:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        console.log('[print-agent] Etiqueta(s) enviada(s) para', PRINTER_NAME);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Rota não encontrada' }));
});

server.listen(PORT, () => {
  console.log(`[print-agent] Rodando em http://localhost:${PORT} — imprimindo na fila "${PRINTER_NAME}"`);
});

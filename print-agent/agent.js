/**
 * VTP — Print Agent (fase de validação)
 *
 * Servidor HTTPS local, sem dependências externas, que recebe ZPL do
 * app VTP (local em http://localhost:5500 OU o site em produção,
 * https://app.vaiterpizza.com) e manda pra uma Zebra ZD220 conectada
 * via USB, usando a fila "raw" do CUPS (já vem no macOS).
 *
 * Roda em HTTPS (certificado autoassinado, gerado sozinho no primeiro
 * uso) porque um site https não pode chamar um endereço http — e
 * porque o Chrome exige handshake de "Private Network Access" para
 * páginas públicas acessarem localhost, que também tratamos aqui.
 *
 * Uso:
 *   PRINTER_NAME="NomeDaFila" node agent.js
 *
 * Ver README.md para como criar a fila raw no macOS, descobrir o nome,
 * e o passo único de aceitar o certificado no navegador.
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const PORT = parseInt(process.env.PORT || '9123', 10);
const PRINTER_NAME = process.env.PRINTER_NAME || '';
const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'localhost-key.pem');
const CERT_PATH = path.join(CERT_DIR, 'localhost-cert.pem');

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://app.vaiterpizza.com',
  ...(process.env.EXTRA_ORIGIN ? process.env.EXTRA_ORIGIN.split(',').map(s => s.trim()) : []),
]);

if (!PRINTER_NAME) {
  console.error('[print-agent] Defina PRINTER_NAME com o nome da fila CUPS. Ex: PRINTER_NAME="Zebra_ZD220" node agent.js');
  console.error('[print-agent] Rode `lpstat -p -d` para listar as filas configuradas no macOS.');
  process.exit(1);
}

// ── Certificado autoassinado (gerado uma vez, reaproveitado depois) ──

function garantirCertificado() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) return;
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log('[print-agent] Gerando certificado autoassinado para localhost...');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', KEY_PATH, '-out', CERT_PATH,
      '-days', '825', '-nodes',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ], { stdio: 'ignore' });
  } catch (e) {
    console.error('[print-agent] Não consegui gerar o certificado com openssl:', e.message);
    console.error('[print-agent] Confirme que o `openssl` está instalado e tente de novo.');
    process.exit(1);
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome exige isso quando uma origem pública (ex: app.vaiterpizza.com)
  // tenta acessar um endereço local (localhost) — sem isso o preflight falha.
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
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

garantirCertificado();

const server = https.createServer({
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
}, (req, res) => {
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
  console.log(`[print-agent] Rodando em https://localhost:${PORT} — imprimindo na fila "${PRINTER_NAME}"`);
  console.log(`[print-agent] Na primeira vez, abra https://localhost:${PORT}/status direto no navegador e aceite o aviso de certificado.`);
});

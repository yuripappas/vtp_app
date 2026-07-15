/**
 * VTP — Print Agent
 *
 * Escuta a fila de impressão (tabela etiq_print_jobs no Supabase, via
 * Realtime) e manda cada ZPL pra uma Zebra ZD220 conectada via USB, usando
 * a fila "raw" do CUPS (já vem no macOS). Roda na máquina fisicamente
 * ligada à impressora — qualquer navegador em qualquer lugar grava o job
 * direto no Supabase; não depende de rede local nem de localhost.
 *
 * Uso:
 *   PRINTER_NAME="NomeDaFila" node agent.js
 *
 * Ver README.md para como criar a fila raw no macOS e descobrir o nome.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const PRINTER_NAME = process.env.PRINTER_NAME || '';
// Mesmas credenciais públicas (anon key) usadas pelo frontend em js/config.js.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wdfecydgdzwwxxrncdqx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZmVjeWRnZHp3d3h4cm5jZHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODAwOTUsImV4cCI6MjA5NTE1NjA5NX0.sVVljppHf0g7zU-kCuvGxxw67wqAFlVVGRpqjgUBaEA';

if (!PRINTER_NAME) {
  console.error('[print-agent] Defina PRINTER_NAME com o nome da fila CUPS. Ex: PRINTER_NAME="Zebra_ZD220" node agent.js');
  console.error('[print-agent] Rode `lpstat -p -d` para listar as filas configuradas no macOS.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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

async function processarJob(job) {
  // Reivindica o job atomicamente — só segue se ESTE agente conseguiu
  // mudar o status de 'pendente' pra 'imprimindo' (evita imprimir em
  // duplicidade se, por engano, dois agentes estiverem rodando juntos).
  const { data, error: claimErr } = await sb
    .from('etiq_print_jobs')
    .update({ status: 'imprimindo' })
    .eq('id', job.id)
    .eq('status', 'pendente')
    .select();

  if (claimErr) {
    console.error('[print-agent] Erro ao reivindicar job', job.id, claimErr.message);
    return;
  }
  if (!data || data.length === 0) {
    return; // outro agente já pegou esse job
  }

  imprimirZPL(job.zpl, async (err) => {
    if (err) {
      console.error('[print-agent] Erro ao imprimir job', job.id, err.message);
      await sb.from('etiq_print_jobs')
        .update({ status: 'erro', erro_msg: err.message })
        .eq('id', job.id);
      return;
    }
    console.log('[print-agent] Job', job.id, 'impresso em', PRINTER_NAME);
    await sb.from('etiq_print_jobs')
      .update({ status: 'impresso', printed_at: new Date().toISOString() })
      .eq('id', job.id);
  });
}

async function processarPendentes() {
  const { data, error } = await sb
    .from('etiq_print_jobs')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[print-agent] Erro ao buscar jobs pendentes:', error.message);
    return;
  }
  for (const job of (data || [])) {
    await processarJob(job);
  }
}

function assinarRealtime() {
  sb.channel('etiq-print-agent')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'etiq_print_jobs' }, payload => {
      processarJob(payload.new);
    })
    .subscribe();
}

async function main() {
  console.log(`[print-agent] Iniciando — imprimindo na fila "${PRINTER_NAME}"`);
  await processarPendentes(); // catch-up: jobs criados enquanto o agente estava offline
  assinarRealtime();
  console.log('[print-agent] Aguardando novos jobs...');
}

main();

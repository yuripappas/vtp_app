/**
 * VTP Compras — Sync de Estoque do CardápioWeb
 *
 * Fluxo:
 *  1. Login no portal CW com usuário do robô
 *  2. Navega para Estoque > Insumos > Exportar
 *  3. Aguarda notificação com link do arquivo
 *  4. Baixa o Excel e parseia
 *  5. Atualiza vtp_items no Supabase por Cód. interno (ou nome)
 *  6. Itens da categoria PREPARADOS recebem isProd: true
 */

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const CW_EMAIL    = process.env.CW_EMAIL;
const CW_PASSWORD = process.env.CW_PASSWORD;
const DOWNLOAD_PATH = path.join('/tmp', 'cw_stock.xlsx');

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function getDownloadUrl(page) {
  // Aguarda a notificação do relatório gerado e captura a URL de download
  console.log('[sync] Clicando em Exportar...');
  await page.click('button:has-text("Exportar")');

  console.log('[sync] Aguardando notificação do arquivo gerado (até 60s)...');

  // Intercepta a resposta da API de notificações para capturar o link do arquivo
  let downloadUrl = null;
  const timeout = Date.now() + 60000;

  while (!downloadUrl && Date.now() < timeout) {
    await page.waitForTimeout(3000);

    // Lê as notificações via API do portal
    try {
      const notifResponse = await page.evaluate(async () => {
        const r = await fetch('/notifications?limit=5', { credentials: 'include' });
        return r.ok ? r.json() : null;
      });

      if (notifResponse) {
        const notifs = Array.isArray(notifResponse)
          ? notifResponse
          : (notifResponse.data || notifResponse.notifications || []);

        for (const n of notifs) {
          const text = JSON.stringify(n).toLowerCase();
          if (text.includes('estoque_insumos') || text.includes('relatorio_estoque')) {
            // Extrai URL do objeto de notificação
            const urlMatch = JSON.stringify(n).match(/https:\/\/storage\.googleapis\.com\/[^"]+\.xlsx/);
            if (urlMatch) {
              downloadUrl = urlMatch[0];
              break;
            }
            // Tenta link direto
            if (n.link || n.url || n.download_url) {
              downloadUrl = n.link || n.url || n.download_url;
              break;
            }
          }
        }
      }
    } catch (e) {
      // Continua tentando
    }

    // Alternativa: captura qualquer link de download na página de notificações
    if (!downloadUrl) {
      try {
        await page.click('[data-testid="notifications-btn"], .notifications-btn, button[aria-label*="otifica"]').catch(() => {});
        await page.waitForTimeout(1000);
        const link = await page.$$eval('a[href*="relatorio_estoque_insumos"]', els =>
          els.length ? els[0].href : null
        ).catch(() => null);
        if (link) downloadUrl = link;
      } catch (e) {
        // Continua
      }
    }
  }

  return downloadUrl;
}

async function syncStock() {
  console.log('[sync] Iniciando sincronização de estoque CW → VTP');
  console.log(`[sync] ${new Date().toISOString()}`);

  if (!SUPABASE_URL || !SUPABASE_KEY || !CW_EMAIL || !CW_PASSWORD) {
    throw new Error('Variáveis de ambiente ausentes. Verifique os GitHub Secrets.');
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Busca itens atuais do VTP no Supabase
  console.log('[sync] Buscando vtp_items do Supabase...');
  const { data: kvRow, error: kvErr } = await sb
    .from('kv_store')
    .select('value')
    .eq('key', 'vtp_items')
    .single();

  if (kvErr) throw new Error(`Erro ao ler vtp_items: ${kvErr.message}`);
  const items = kvRow?.value || [];
  console.log(`[sync] ${items.length} itens carregados do VTP`);

  // 2. Automação de browser
  console.log('[sync] Abrindo browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('[sync] Fazendo login no CW...');
    await page.goto('https://portal.cardapioweb.com/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"], input[name="email"]', CW_EMAIL);
    await page.fill('input[type="password"], input[name="password"]', CW_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    console.log('[sync] Login OK');

    // Navega para estoque
    console.log('[sync] Navegando para Estoque > Insumos...');
    await page.goto('https://portal.cardapioweb.com/estoque/meu_estoque/insumos', {
      waitUntil: 'networkidle'
    });

    // Obtém URL do arquivo exportado
    const downloadUrl = await getDownloadUrl(page);

    if (!downloadUrl) {
      throw new Error('Não foi possível obter a URL do arquivo exportado. Verifique o fluxo de notificações do CW.');
    }

    console.log(`[sync] Download URL: ${downloadUrl}`);
    await downloadFile(downloadUrl, DOWNLOAD_PATH);
    console.log(`[sync] Arquivo baixado em ${DOWNLOAD_PATH}`);

  } finally {
    await browser.close();
  }

  // 3. Parseia o Excel
  console.log('[sync] Parseando Excel...');
  const workbook = XLSX.readFile(DOWNLOAD_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log(`[sync] ${rows.length} insumos no arquivo CW`);

  // 4. Aplica atualizações nos itens VTP
  let updated = 0;
  const notFound = [];

  for (const row of rows) {
    const cwCode = row['Cód. interno'] !== undefined ? String(row['Cód. interno']).trim() : '';
    const cwName = String(row['Insumo'] || '').trim();
    const cwCat  = String(row['Categoria'] || '').toUpperCase().trim();
    const qty    = parseNumber(row['Estoque atual']);
    const min    = parseNumber(row['Estoque mínimo']);
    const cost   = parseNumber(row['Preço de custo']);
    const isProd = cwCat === 'PREPARADOS';

    // Match por código CW ou nome
    const item = items.find(i =>
      (cwCode && i.code && String(i.code).trim() === cwCode) ||
      (cwName && i.name && i.name.toLowerCase().trim() === cwName.toLowerCase().trim())
    );

    if (item) {
      if (qty !== null)  item.qty  = qty;
      if (min !== null)  item.min  = min;
      if (cost !== null && cost > 0) item.cost = cost;
      item.isProd = isProd;
      // Garante que o code CW fica salvo para próximos syncs
      if (cwCode && !item.code) item.code = cwCode;
      updated++;
    } else {
      notFound.push(`${cwCode} — ${cwName}`);
    }
  }

  console.log(`[sync] ${updated} itens atualizados`);
  if (notFound.length > 0) {
    console.log(`[sync] ${notFound.length} itens do CW não encontrados no VTP:`);
    notFound.forEach(n => console.log(`  - ${n}`));
  }

  // 5. Salva no Supabase
  console.log('[sync] Salvando no Supabase...');
  const { error: saveErr } = await sb
    .from('kv_store')
    .upsert(
      { key: 'vtp_items', value: items, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (saveErr) throw new Error(`Erro ao salvar: ${saveErr.message}`);

  console.log('[sync] ✅ Sincronização concluída com sucesso!');
  console.log(`[sync] Resumo: ${updated} atualizados | ${notFound.length} não encontrados no VTP`);
}

syncStock().catch(err => {
  console.error('[sync] ❌ Erro fatal:', err.message);
  process.exit(1);
});

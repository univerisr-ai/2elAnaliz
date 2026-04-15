import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeFile } from './analyze.mjs';
import { buildLatestSummary, loadPipelineMessages, writeLatestSummary } from './dashboard_summary.mjs';

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Lütfen bir input.json dosyası belirtin!');
    process.exit(1);
  }

  const inPath = path.resolve(inputFile);
  console.log(`[local-index] Dosya analiz ediliyor: ${inPath}`);
  const rawInput = JSON.parse(await fs.readFile(inPath, 'utf8'));

  // 1. Analiz
  const report = await analyzeFile(inPath);
  const pipelineMessages = await loadPipelineMessages(inPath);
  pipelineMessages.push(
    {
      service: '2elAnaliz',
      status: 'ANALIZ_EDILDI',
      message: `2elAnaliz output.json dosyasini analiz etti (aday sayisi: ${report.candidateCount}).`,
      timestamp: new Date().toISOString(),
    },
    {
      service: '2elAnaliz',
      status: 'WEBSITE_GONDERILDI',
      message: 'Analiz sonucu sanitize edilerek Vercel dashboard icin latest-summary.json olarak hazirlandi.',
      timestamp: new Date().toISOString(),
    },
  );

  const summary = buildLatestSummary({
    report,
    pipelineMessages,
    rawInput,
    inputPath: inPath,
    env: process.env,
  });

  console.log(`[local-index] Fırsatlar bulundu: ${report.topCandidates?.length || 0} adet.`);
  console.log(`[local-index] Servis mesaji sayisi: ${pipelineMessages.length}`);

  // 2. Sanitize edilmis dashboard cikisini yaz
  const outPath = await writeLatestSummary(summary, path.join(process.cwd(), 'docs'));
  console.log(`[local-index] Dashboard ozeti hazirlandi! Sonuc: ${outPath}`);
}

main().catch(err => {
  console.error('[local-index] Kritik hata:', err);
  process.exit(1);
});

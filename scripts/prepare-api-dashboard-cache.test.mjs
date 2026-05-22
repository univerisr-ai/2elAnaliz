import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prepare-api-dashboard-cache-'));

try {
  const inputPath = path.join(tempRoot, 'output.json');
  const summaryPath = path.join(tempRoot, 'latest-summary.json');
  const apiDataDir = path.join(tempRoot, 'api-data');
  const cpuInputPath = path.join(tempRoot, 'cpu-output.json');
  const cpuSummaryPath = path.join(tempRoot, 'cpu-latest-summary.json');
  const cpuApiDataDir = path.join(tempRoot, 'cpu-api-data');

  await fs.writeFile(
    inputPath,
    JSON.stringify({
      listings: [
        {
          id: 'technopat-1',
          title: 'RTX 4060 Technopat ilani',
          model: 'RTX 4060',
          price: 15000,
          url: 'https://www.technopat.net/sosyal/konu/satilik-rtx-4060.123456/',
          source: 'Technopat',
          sourceType: 'forum',
        },
        {
          id: 'techolay-1',
          title: 'RX 6700 XT Techolay ilani',
          model: 'RX 6700 XT',
          price: 14000,
          url: 'https://techolay.net/sosyal/konu/satilik-rx-6700-xt.123456/',
          source: 'Techolay',
          sourceType: 'forum',
        },
      ],
    }),
    'utf8',
  );

  await fs.writeFile(
    summaryPath,
    JSON.stringify({
      analysisCompleted: true,
      generatedAt: '2026-05-19T00:00:00.000Z',
      listingCount: 2,
      recognizedModelCount: 2,
      candidateCount: 2,
      topCandidates: [],
      pipelineMessages: [],
      runMeta: {},
    }),
    'utf8',
  );

  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/prepare-api-dashboard-cache.mjs'),
      inputPath,
      '--summary',
      summaryPath,
      '--api-data-dir',
      apiDataDir,
    ],
    { cwd: repoRoot, stdio: 'pipe' },
  );

  const catalog = JSON.parse(await fs.readFile(path.join(apiDataDir, 'catalog-cache.json'), 'utf8'));

  assert.equal(catalog[0].sourceType, 'forum');
  assert.equal(catalog[0].source, 'Technopat');
  assert.equal(catalog[1].sourceType, 'forum');
  assert.equal(catalog[1].source, 'Techolay');

  await fs.writeFile(
    cpuInputPath,
    JSON.stringify({
      productType: 'cpu',
      productLabel: 'Islemci',
      sourceCategoryUrl: 'https://www.sahibinden.com/islemci-masaustu',
      allListings: [
        {
          id: 'cpu-good-1',
          title: 'AMD Ryzen 5 5600X temiz islemci',
          price: 3150,
          url: 'https://www.sahibinden.com/ilan/cpu-good-1/detay',
          source: 'Sahibinden',
          sourceType: 'sahibinden',
          imageUrl: 'https://example.com/ryzen-5600x.jpg',
        },
        {
          id: 'cpu-noise-1',
          title: 'Ryzen 5 3600X bos kutu',
          price: 300,
          url: 'https://www.sahibinden.com/ilan/cpu-noise-1/detay',
          source: 'Sahibinden',
          sourceType: 'sahibinden',
        },
      ],
      runMeta: {
        productType: 'cpu',
        productLabel: 'Islemci',
      },
    }),
    'utf8',
  );

  await fs.writeFile(
    cpuSummaryPath,
    JSON.stringify({
      analysisCompleted: true,
      generatedAt: '2026-05-19T01:00:00.000Z',
      listingCount: 2,
      recognizedModelCount: 1,
      candidateCount: 1,
      topCandidates: [],
      pipelineMessages: [],
      runMeta: { productType: 'cpu' },
    }),
    'utf8',
  );

  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/prepare-api-dashboard-cache.mjs'),
      cpuInputPath,
      '--summary',
      cpuSummaryPath,
      '--api-data-dir',
      cpuApiDataDir,
    ],
    { cwd: repoRoot, stdio: 'pipe' },
  );

  const cpuCatalog = JSON.parse(await fs.readFile(path.join(cpuApiDataDir, 'catalog-cache.json'), 'utf8'));
  assert.equal(cpuCatalog.length, 1);
  assert.equal(cpuCatalog[0].productType, 'cpu');
  assert.equal(cpuCatalog[0].brand, 'AMD');
  assert.equal(cpuCatalog[0].model, 'Ryzen 5 5600X');
  assert.equal(cpuCatalog[0].title, 'AMD Ryzen 5 5600X temiz islemci');
  assert.ok(!cpuCatalog.some((listing) => String(listing.title).includes('bos kutu')));
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

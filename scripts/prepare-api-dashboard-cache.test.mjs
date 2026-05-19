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
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

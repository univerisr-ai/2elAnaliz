import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-scraper-outputs-'));

try {
  const sourceRoot = path.join(tempRoot, 'sources');
  const gpuDir = path.join(sourceRoot, 'sahibinden-gpu');
  const cpuDir = path.join(sourceRoot, 'sahibinden-cpu');
  const outputPath = path.join(tempRoot, 'output.json');
  const pipelinePath = path.join(tempRoot, 'pipeline.json');

  await fs.mkdir(gpuDir, { recursive: true });
  await fs.mkdir(cpuDir, { recursive: true });

  await fs.writeFile(
    path.join(gpuDir, 'output.json'),
    JSON.stringify({
      productType: 'gpu',
      totalClean: 1,
      allListings: [
        {
          id: 'shared-1',
          title: 'RTX 4060 GPU ilani',
          model: 'RTX 4060',
          price: 15000,
          url: 'https://www.sahibinden.com/ilan/shared-1/detay',
        },
      ],
      runMeta: { productType: 'gpu', listingCount: 1, source: 'sahibinden-gpu' },
    }),
    'utf8',
  );
  await fs.writeFile(path.join(gpuDir, 'metadata.json'), JSON.stringify({ source_repository: 'demiralpdev/ahibinden-ekran-karti' }), 'utf8');

  await fs.writeFile(
    path.join(cpuDir, 'output.json'),
    JSON.stringify({
      productType: 'cpu',
      productLabel: 'Islemci',
      sourceCategoryUrl: 'https://www.sahibinden.com/islemci-masaustu',
      totalClean: 1,
      allListings: [
        {
          id: 'shared-1',
          title: 'Ryzen 5 5600X CPU ilani',
          price: 3200,
          url: 'https://www.sahibinden.com/ilan/shared-1/detay',
        },
      ],
      runMeta: { productType: 'cpu', listingCount: 1, source: 'sahibinden-cpu' },
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(cpuDir, 'metadata.json'),
    JSON.stringify({ source_repository: 'demiralpdev/ahibinden-ekran-karti', product_type: 'cpu' }),
    'utf8',
  );

  execFileSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/merge-scraper-outputs.mjs'), sourceRoot, outputPath, pipelinePath],
    {
      cwd: repoRoot,
      env: { ...process.env, SAHIBINDEN_MIN_LISTINGS: '1', SAHIBINDEN_CPU_MIN_LISTINGS: '1' },
      stdio: 'pipe',
    },
  );

  const merged = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  assert.equal(merged.totalClean, 2);
  assert.deepEqual(
    merged.allListings.map((listing) => listing.productType).sort(),
    ['cpu', 'gpu'],
  );
  assert.equal(merged.runMeta.sources.some((source) => source.productType === 'cpu'), true);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

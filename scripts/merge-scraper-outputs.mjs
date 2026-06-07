import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, readJson, writeJson } from '../src/utils.mjs';

function pickListings(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];

  for (const key of ['allListings', 'ilanlar', 'listings', 'items', 'results', 'data']) {
    if (Array.isArray(root[key])) return root[key];
  }

  return [];
}

function normalizeUrl(url = '') {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return String(url || '').trim().replace(/\/$/, '');
  }
}

function sourceFromListing(listing) {
  const explicitText = [listing?.sourceLabel, listing?.source, listing?.sourceType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (explicitText.includes('sahibinden') || explicitText.includes('ahibinden') || explicitText.includes('shbdn.com')) {
    return 'sahibinden';
  }

  if (explicitText.includes('letgo')) return 'letgo';
  if (explicitText.includes('dolap')) return 'dolap';
  if (explicitText.includes('donanimhaber')) return 'donanimhaber';
  if (explicitText.includes('facebook') || explicitText.includes('fb.com')) return 'facebook';
  if (explicitText.includes('technopat') || explicitText.includes('techolay') || explicitText.includes('forum')) return 'forum';

  const explicit = String(listing?.sourceType || listing?.source || '').trim().toLowerCase();
  if (explicit === 'technopat' || explicit === 'techolay') return 'forum';
  if (explicit && explicit !== 'pecid') return explicit;

  const url = String(listing?.url || '').toLowerCase();
  if (url.includes('letgo')) return 'letgo';
  if (url.includes('dolap')) return 'dolap';
  if (url.includes('donanimhaber')) return 'donanimhaber';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('technopat.net') || url.includes('techolay.net')) return 'forum';
  if (url.includes('sahibinden') || url.includes('shbdn.com')) return 'sahibinden';
  return 'external';
}

function normalizeProductType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (/(^|[^a-z])(?:cpu|islemci|işlemci|processor|processors)(?:$|[^a-z])/.test(normalized)) return 'cpu';
  if (/(^|[^a-z])(?:gpu|ekran\s*karti|ekran\s*kartı|graphics?\s*card)(?:$|[^a-z])/.test(normalized)) return 'gpu';
  return '';
}

function productTypeFromOutput(output, metadata, listings, dir) {
  const runMeta = output?.runMeta && typeof output.runMeta === 'object' ? output.runMeta : {};
  const sourceText = [
    output?.productType,
    output?.product_type,
    output?.product,
    output?.productLabel,
    output?.sourceCategoryUrl,
    output?.categoryUrl,
    runMeta.productType,
    runMeta.product_type,
    runMeta.productLabel,
    runMeta.categoryUrl,
    metadata?.product_type,
    metadata?.productType,
    metadata?.category_url,
    metadata?.categoryUrl,
    path.basename(dir),
    listings.find(Boolean)?.productType,
    listings.find(Boolean)?.product_type,
    listings.find(Boolean)?.sourceCategoryUrl,
    listings.find(Boolean)?.url,
  ];

  for (const value of sourceText) {
    const productType = normalizeProductType(value);
    if (productType) return productType;
  }

  return 'gpu';
}

function sourceFromOutput(output, metadata, listings, dir) {
  const runMeta = output?.runMeta && typeof output.runMeta === 'object' ? output.runMeta : {};
  const sourceText = [
    runMeta.source,
    metadata?.source,
    metadata?.source_repository,
    metadata?.sourceRepository,
    path.basename(dir),
    listings.find(Boolean)?.sourceType,
    listings.find(Boolean)?.source,
    listings.find(Boolean)?.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (sourceText.includes('sahibinden') || sourceText.includes('ahibinden') || sourceText.includes('shbdn.com')) {
    return 'sahibinden';
  }

  if (sourceText.includes('letgo')) return 'letgo';
  if (sourceText.includes('dolap')) return 'dolap';
  if (sourceText.includes('donanimhaber')) return 'donanimhaber';
  if (sourceText.includes('facebook') || sourceText.includes('fb.com')) return 'facebook';
  if (sourceText.includes('technopat') || sourceText.includes('techolay') || sourceText.includes('forum')) {
    return 'forum';
  }

  return sourceFromListing(listings.find(Boolean) || {});
}

function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minListingsForSource(sourceType) {
  if (sourceType === 'sahibinden') {
    return toPositiveInt(process.env.SAHIBINDEN_MIN_LISTINGS, 200);
  }

  if (sourceType === 'dolap') {
    return toPositiveInt(process.env.DOLAP_MIN_LISTINGS, 0);
  }

  return 0;
}

function minListingsForSourceProduct(sourceType, productType) {
  if (sourceType === 'sahibinden' && productType === 'cpu') {
    return toPositiveInt(process.env.SAHIBINDEN_CPU_MIN_LISTINGS, 200);
  }

  return minListingsForSource(sourceType);
}

function sourceProductKey(productType, sourceType) {
  return `${String(productType || '').toLowerCase()}:${String(sourceType || '').toLowerCase()}`;
}

function protectedBaselineKeys() {
  const configured = String(process.env.PRESERVE_MISSING_SOURCE_PRODUCTS || 'cpu:sahibinden')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured);
}

function baselinePathCandidates() {
  return [
    process.env.CATALOG_BASELINE_FILE,
    './scripts/baselines/catalog-cache.json',
    './apps/api/src/data/catalog-cache.json',
  ]
    .filter(Boolean)
    .map((candidate) => path.resolve(candidate));
}

function productTypeFromListing(listing) {
  return normalizeProductType(listing?.productType || listing?.product_type || listing?.sourceCategoryUrl || listing?.url) || 'gpu';
}

function dedupeKey(listing) {
  const source = sourceFromListing(listing);
  const productType = productTypeFromListing(listing);
  const sourceId = String(listing?.sourceListingId || listing?.id || '').trim();
  if (sourceId) return `${productType}:${source}:id:${sourceId}`;

  const normalizedUrl = normalizeUrl(listing?.url);
  if (normalizedUrl) return `${productType}:${source}:url:${normalizedUrl}`;

  return `${productType}:${source}:fallback:${String(listing?.title || '').trim().toLowerCase()}|${listing?.price || ''}|${listing?.location || ''}`;
}

async function listSourceDirs(sourceRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sourceRoot, entry.name));
}

async function readBaselineListings() {
  for (const baselinePath of baselinePathCandidates()) {
    const baseline = await readJson(baselinePath, null);
    const listings = pickListings(baseline);
    if (listings.length > 0) {
      console.log(`[merge] baseline catalog loaded: ${baselinePath}, listings=${listings.length}`);
      return { listings, path: baselinePath };
    }
  }

  return { listings: [], path: '' };
}

function statusRank(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'SCRAPE_COMPLETED') return 3;
  if (value === 'SCRAPE_PARTIAL') return 3;
  if (value === 'SCRAPE_EMPTY') return 2;
  if (value === 'SCRAPE_FAILED') return 1;
  return 0;
}

function combinedStatus(statuses) {
  const sorted = [...statuses].sort((a, b) => statusRank(b) - statusRank(a));
  return sorted[0] || 'SCRAPE_EMPTY';
}

async function main() {
  const [sourceRootArg, outputArg, pipelineArg] = process.argv.slice(2);
  const sourceRoot = path.resolve(sourceRootArg || './data/sources');
  const outputPath = path.resolve(outputArg || './data/inbox/output.json');
  const pipelinePath = path.resolve(pipelineArg || './data/inbox/pipeline-messages.json');

  const sourceDirs = await listSourceDirs(sourceRoot);
  const mergedListings = [];
  const seen = new Set();
  const sourceMetas = [];
  const pipelineMessages = [];
  let totalRaw = 0;

  for (const dir of sourceDirs) {
    const output = await readJson(path.join(dir, 'output.json'), null);
    if (!output) continue;

    const metadata = await readJson(path.join(dir, 'metadata.json'), {});
    const listings = pickListings(output);
    const runMeta = output.runMeta && typeof output.runMeta === 'object' ? output.runMeta : {};
    const sourceType = sourceFromOutput(output, metadata, listings, dir);
    const productType = productTypeFromOutput(output, metadata, listings, dir);
    const listingCount = Number(runMeta.listingCount ?? output.totalClean ?? listings.length) || 0;
    const minListings = minListingsForSourceProduct(sourceType, productType);

    if (minListings > 0 && listingCount < minListings) {
      const sourceName = metadata.source_repository || runMeta.source || path.basename(dir);
      const message = `${sourceName} kaynagi atlandi: ${listingCount} ilan, minimum ${minListings}.`;
      console.warn(`[merge] ${message}`);
      pipelineMessages.push({
        service: '2elAnaliz',
        status: 'KAYNAK_MINIMUM_ILAN_ESIGI',
        message,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    totalRaw += Number(output.totalRaw ?? listings.length) || 0;

    for (const listing of listings) {
      const enrichedListing = {
        ...listing,
        productType: normalizeProductType(listing?.productType || listing?.product_type) || productType,
      };
      const key = dedupeKey(enrichedListing);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      mergedListings.push(enrichedListing);
    }

    sourceMetas.push({
      source: runMeta.source || metadata.source_repository || path.basename(dir),
      productType,
      sourceRepository: metadata.source_repository || '',
      scraperRunId: metadata.scraper_run_id || '',
      scraperRunUrl: metadata.scraper_run_url || '',
      artifactName: metadata.artifact_name || '',
      scrapeStatus: runMeta.scrapeStatus || 'SCRAPE_COMPLETED',
      listingCount: Number(runMeta.listingCount ?? output.totalClean ?? listings.length) || 0,
      startedAt: runMeta.startedAt || '',
      finishedAt: runMeta.finishedAt || output.timestamp || '',
    });

    const messages = await readJson(path.join(dir, 'pipeline-messages.json'), []);
    if (Array.isArray(messages)) {
      pipelineMessages.push(...messages);
    }
  }

  const { listings: baselineListings, path: baselinePath } = await readBaselineListings();
  const currentSourceProducts = new Set(
    mergedListings.map((listing) => sourceProductKey(productTypeFromListing(listing), sourceFromListing(listing))),
  );
  const baselineKeepKeys = protectedBaselineKeys();
  const restoredCounts = new Map();

  for (const listing of baselineListings) {
    const productType = productTypeFromListing(listing);
    const sourceType = sourceFromListing(listing);
    const key = sourceProductKey(productType, sourceType);

    if (!baselineKeepKeys.has(key) || currentSourceProducts.has(key)) {
      continue;
    }

    const enrichedListing = {
      ...listing,
      productType,
    };
    const dedupe = dedupeKey(enrichedListing);
    if (!dedupe || seen.has(dedupe)) continue;
    seen.add(dedupe);
    mergedListings.push(enrichedListing);
    restoredCounts.set(key, (restoredCounts.get(key) || 0) + 1);
  }

  for (const [key, count] of restoredCounts) {
    const [productType, sourceType] = key.split(':', 2);
    const message = `${key} kaynagi yeni artifact'te yoktu; son saglikli cache'ten ${count} ilan korundu.`;
    console.warn(`[merge] ${message}`);
    sourceMetas.push({
      source: `${sourceType}-baseline-cache`,
      productType,
      sourceRepository: '',
      scraperRunId: '',
      scraperRunUrl: '',
      artifactName: baselinePath,
      scrapeStatus: 'SCRAPE_FALLBACK_BASELINE',
      listingCount: count,
      startedAt: '',
      finishedAt: '',
    });
    pipelineMessages.push({
      service: '2elAnaliz',
      status: 'KAYNAK_CACHE_KORUNDU',
      message,
      timestamp: new Date().toISOString(),
    });
  }

  if (sourceMetas.length === 0) {
    throw new Error(`No scraper output.json files found under ${sourceRoot}`);
  }

  const now = new Date().toISOString();
  const statuses = sourceMetas.map((meta) => meta.scrapeStatus);
  const productTypes = Array.from(new Set(mergedListings.map((listing) => productTypeFromListing(listing)))).sort();
  const mergedOutput = {
    timestamp: now,
    productTypes,
    totalRaw,
    totalClean: mergedListings.length,
    allListings: mergedListings,
    runMeta: {
      source: 'multi',
      scrapeStatus: combinedStatus(statuses),
      listingCount: mergedListings.length,
      rawListingCount: totalRaw,
      sourceCount: sourceMetas.length,
      sources: sourceMetas,
      startedAt: sourceMetas.map((meta) => meta.startedAt).filter(Boolean).sort()[0] || '',
      finishedAt: now,
      pipelineMessage: `${sourceMetas.length} scraper kaynagi birlestirildi: ${mergedListings.length} tekil ilan.`,
    },
  };

  pipelineMessages.push({
    service: '2elAnaliz',
    status: 'KAYNAKLAR_BIRLESTIRILDI',
    message: `${sourceMetas.length} scraper kaynagi birlestirildi: ${mergedListings.length} tekil ilan.`,
    timestamp: now,
  });

  await ensureDir(path.dirname(outputPath));
  await ensureDir(path.dirname(pipelinePath));
  await writeJson(outputPath, mergedOutput);
  await writeJson(pipelinePath, pipelineMessages);

  console.log(
    `[merge] ${sourceMetas.length} source(s), raw=${totalRaw}, merged=${mergedListings.length}, output=${outputPath}`,
  );
}

main().catch((error) => {
  console.error('[merge] Failed:', error);
  process.exit(1);
});

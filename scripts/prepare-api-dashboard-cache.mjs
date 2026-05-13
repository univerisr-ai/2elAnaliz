import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, parsePriceTl, readJson, writeJson } from '../src/utils.mjs';

const DEFAULT_INPUT = './data/inbox/output.json';
const DEFAULT_SUMMARY = './docs/latest-summary.json';
const DEFAULT_API_DATA_DIR = './apps/api/src/data';

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    summary: DEFAULT_SUMMARY,
    apiDataDir: DEFAULT_API_DATA_DIR,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) {
    options.input = args.shift();
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];

    if (arg === '--summary' && value) {
      options.summary = value;
      i += 1;
    } else if (arg === '--api-data-dir' && value) {
      options.apiDataDir = value;
      i += 1;
    }
  }

  return options;
}

function toStr(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function firstField(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] != null && obj[key] !== '') return obj[key];
  }
  return '';
}

function pickListings(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];

  for (const key of ['allListings', 'ilanlar', 'listings', 'items', 'results', 'data']) {
    if (Array.isArray(root[key])) return root[key];
  }

  return [];
}

function detectBrand(text) {
  const upper = String(text || '').toUpperCase();

  if (upper.includes('RTX') || upper.includes('GTX') || upper.includes('QUADRO') || upper.includes('TITAN')) {
    return 'NVIDIA';
  }

  if (upper.includes('RADEON') || upper.includes(' RX ') || upper.startsWith('RX ') || upper.includes('VEGA')) {
    return 'AMD';
  }

  if (upper.includes('ARC') || upper.includes('A770') || upper.includes('A750') || upper.includes('A580')) {
    return 'Intel';
  }

  return 'Bilinmiyor';
}

function normalizeModel(title) {
  const upper = String(title || '').toUpperCase();
  const patterns = [
    /\bQUADRO RTX(?:\s+[A-Z0-9-]+)?\b/,
    /\bRTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bGTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bRX\s+\d{3,4}\s*(?:XT|XTX)?\b/,
    /\bARC\s+[A-Z]?\d{3,4}\b/,
    /\bTITAN(?:\s+[A-Z0-9-]+)?\b/,
  ];

  for (const pattern of patterns) {
    const match = upper.match(pattern);
    if (match?.[0]) return match[0].replace(/\s+/g, ' ').trim();
  }

  return String(title || '').trim();
}

function normalizeLocation(location) {
  return String(location || '')
    .trim()
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 / $2')
    .replace(/\s+/g, ' ');
}

function detectSource(url) {
  const value = String(url || '').toLowerCase();

  if (value.includes('letgo')) {
    return { source: 'Letgo', sourceType: 'letgo' };
  }

  if (value.includes('sahibinden') || value.includes('shbdn.com')) {
    return { source: 'Sahibinden', sourceType: 'sahibinden' };
  }

  return { source: 'Harici', sourceType: 'external' };
}

function extractListingId(url = '') {
  let match = String(url).match(/-(\d{6,})(?:\/detay)?(?:[/?#]|$)/i);
  if (match) return match[1] || '';

  match = String(url).match(/\/(\d{6,})(?:\/detay)?(?:[/?#]|$)/i);
  if (match) return match[1] || '';

  match = String(url).match(/[?&](?:id|ilan_id|listingId)=(\d{6,})/i);
  return match ? match[1] || '' : '';
}

function normalizeListingUrl(url = '') {
  try {
    const normalized = new URL(url);
    normalized.search = '';
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  } catch {
    return String(url || '').trim().replace(/\/$/, '');
  }
}

function toListingId(modelKey, price, index) {
  const safeKey = String(modelKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${safeKey || 'gpu'}-${price || 0}-${index + 1}`;
}

function mapRawCatalogListing(raw, index) {
  const title = toStr(firstField(raw, ['baslik', 'title', 'ilan_baslik', 'ad', 'name']), 'Baslik bulunamadi');
  const url = toStr(firstField(raw, ['url', 'link', 'ilan_url', 'href']));
  const model = normalizeModel(title);
  const price = parsePriceTl(firstField(raw, ['fiyat', 'price', 'fiyat_str', 'amount', 'priceTl']));
  const source = detectSource(url);
  const id =
    toStr(firstField(raw, ['ilan_id', 'id', 'ilan_no', 'listingId', 'uid'])) ||
    extractListingId(url) ||
    toListingId(model || title, price, index);

  return {
    id,
    title,
    model,
    brand: detectBrand(`${model} ${title}`),
    price,
    priceText: toStr(firstField(raw, ['fiyat_str', 'priceText', 'rawPrice'])) || `${price.toLocaleString('tr-TR')} TL`,
    url: url || '#',
    imageUrl: toStr(firstField(raw, ['resim', 'imageUrl', 'image', 'img', 'thumbnail'])) || null,
    location: normalizeLocation(firstField(raw, ['konum', 'location', 'city'])) || 'Konum yok',
    segment: toStr(firstField(raw, ['segment', 'priceSegment']), 'Arsiv'),
    listedAtLabel: toStr(firstField(raw, ['tarih', 'listedAtLabel', 'date']), 'Tarih yok'),
    source: source.source,
    sourceType: source.sourceType,
  };
}

function enrichSummaryWithListingImages(summary, rawListings) {
  const imageByUrl = new Map();
  const imageById = new Map();

  for (const listing of rawListings) {
    const imageUrl = toStr(firstField(listing, ['resim', 'imageUrl', 'image', 'img', 'thumbnail']));
    if (!imageUrl) continue;

    const url = toStr(firstField(listing, ['url', 'link', 'ilan_url', 'href']));
    const normalizedUrl = normalizeListingUrl(url);
    if (normalizedUrl) imageByUrl.set(normalizedUrl, imageUrl);

    const listingId = toStr(firstField(listing, ['ilan_id', 'id', 'ilan_no', 'listingId', 'uid'])) || extractListingId(url);
    if (listingId) imageById.set(listingId, imageUrl);
  }

  return {
    ...summary,
    topCandidates: Array.isArray(summary?.topCandidates)
      ? summary.topCandidates.map((candidate) => ({
          ...candidate,
          imageUrl:
            toStr(candidate?.imageUrl) ||
            imageByUrl.get(normalizeListingUrl(candidate?.url)) ||
            imageById.get(extractListingId(candidate?.url)) ||
            null,
        }))
      : [],
  };
}

function buildSeedSource(generatedAt, catalogListings) {
  return [
    'import type { CatalogListing } from "../services/dashboard-types.js";',
    '',
    '// Generated from the latest scraper output with public marketplace source and listing links.',
    '// Private workflow and run metadata must not be added to this seed.',
    `export const CATALOG_GENERATED_AT = ${JSON.stringify(generatedAt)};`,
    '',
    `export const CATALOG_SEED: readonly CatalogListing[] = ${JSON.stringify(catalogListings, null, 2)};`,
    '',
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const summaryPath = path.resolve(options.summary);
  const apiDataDir = path.resolve(options.apiDataDir);

  const rawInput = await readJson(inputPath, null);
  if (!rawInput) {
    throw new Error(`[api-cache] Input okunamadi: ${inputPath}`);
  }

  const rawListings = pickListings(rawInput);
  const catalogListings = rawListings
    .map((listing, index) => mapRawCatalogListing(listing, index))
    .filter((listing) => listing.title && listing.price > 0);

  const summaryInput = await readJson(summaryPath, null);
  const generatedAt =
    toStr(summaryInput?.generatedAt) ||
    toStr(rawInput?.timestamp) ||
    toStr(rawInput?.runMeta?.finishedAt) ||
    new Date().toISOString();
  const summary = enrichSummaryWithListingImages(
    {
      ...summaryInput,
      analysisCompleted: summaryInput?.analysisCompleted !== false,
      generatedAt,
      listingCount: catalogListings.length || toNum(summaryInput?.listingCount),
      recognizedModelCount: toNum(summaryInput?.recognizedModelCount),
      candidateCount: toNum(summaryInput?.candidateCount),
      pipelineMessages: Array.isArray(summaryInput?.pipelineMessages) ? summaryInput.pipelineMessages : [],
      runMeta: {
        ...(summaryInput?.runMeta && typeof summaryInput.runMeta === 'object' ? summaryInput.runMeta : {}),
        listingCountFromScraper:
          toNum(summaryInput?.runMeta?.listingCountFromScraper, NaN) ||
          toNum(rawInput?.totalClean, NaN) ||
          catalogListings.length,
      },
    },
    rawListings,
  );

  const snapshot = {
    summary,
    fetchedAt: generatedAt,
    source: summary.runMeta?.scraperRunId ? 'github_artifact' : 'local_file',
  };
  const refreshLog = [
    {
      syncedAt: snapshot.fetchedAt,
      source: snapshot.source,
      candidateCount: summary.candidateCount,
      listingCount: summary.listingCount,
      analyzerRunId: summary.runMeta?.analyzerRunId || null,
      message: summary.runMeta?.pipelineMessage || 'Dashboard verisi yenilendi.',
    },
  ];

  await ensureDir(apiDataDir);
  await writeJson(path.join(apiDataDir, 'catalog-cache.json'), catalogListings);
  await writeJson(path.join(apiDataDir, 'dashboard-summary-cache.json'), snapshot);
  await writeJson(path.join(apiDataDir, 'dashboard-refresh-log.json'), refreshLog);
  await fs.writeFile(path.join(apiDataDir, 'catalog-seed.ts'), buildSeedSource(generatedAt, catalogListings), 'utf8');

  console.log(
    `[api-cache] API katalog cache hazirlandi: ${catalogListings.length} ilan, generatedAt=${generatedAt}`,
  );
}

main().catch((error) => {
  console.error('[api-cache] Kritik hata:', error);
  process.exit(1);
});

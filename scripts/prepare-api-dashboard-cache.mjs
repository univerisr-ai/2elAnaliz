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

function imageUrlFromUnknown(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = imageUrlFromUnknown(item);
      if (imageUrl) return imageUrl;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    for (const key of ['url', 'src', 'imageUrl', 'image_url', 'thumbnailUrl', 'thumbnail', 'photoUrl', 'photo']) {
      const imageUrl = imageUrlFromUnknown(value[key]);
      if (imageUrl) return imageUrl;
    }
  }

  return '';
}

function pickImageUrl(listing) {
  for (const key of [
    'resim',
    'imageUrl',
    'image',
    'img',
    'thumbnail',
    'thumbnailUrl',
    'photo',
    'photoUrl',
    'image_url',
    'coverImageUrl',
    'cover_image_url',
    'images',
    'imageUrls',
    'photos',
  ]) {
    const imageUrl = imageUrlFromUnknown(listing?.[key]);
    if (imageUrl) return imageUrl;
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
  const upper = normalizeGpuText(text);
  const model = normalizeGpuText(normalizeModel(upper));

  if (/^(?:RTX|GTX|GTS|GT|GEFORCE|NVS)\b/.test(model) || upper.includes('QUADRO') || upper.includes('TITAN')) {
    return 'NVIDIA';
  }

  if (
    /^(?:RX|R[579]|RADEON HD)\b/.test(model) ||
    model.includes('VEGA') ||
    upper.includes('RADEON') ||
    upper.includes('VEGA') ||
    /\b(?:A?X?RX|RX)\s*-?\s*\d{3,4}\b/.test(upper) ||
    (/\b(?:AMD|ATI|SAPPHIRE|POWERCOLOR|POWER\s*COLOR|XFX)\b/.test(upper) &&
      /\b(?:4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(?:XTX|XT|GRE)?\b/.test(upper))
  ) {
    return 'AMD';
  }

  if (upper.includes('ARC') || upper.includes('A770') || upper.includes('A750') || upper.includes('A580')) {
    return 'Intel';
  }

  return 'Bilinmiyor';
}

function normalizeProductType(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return '';

  if (/(^|[^a-z])(?:cpu|islemci|işlemci|processor|processors)(?:$|[^a-z])/.test(normalized)) {
    return 'cpu';
  }

  if (/(^|[^a-z])(?:gpu|ekran\s*karti|ekran\s*kartı|graphics?\s*card)(?:$|[^a-z])/.test(normalized)) {
    return 'gpu';
  }

  return '';
}

function inferProductTypeFromFields(fields, fallback = 'gpu') {
  for (const field of fields) {
    const productType = normalizeProductType(field);
    if (productType) return productType;
  }

  return fallback;
}

function inferRootProductType(root) {
  return inferProductTypeFromFields(
    [
      root?.productType,
      root?.product_type,
      root?.product,
      root?.productLabel,
      root?.sourceCategoryUrl,
      root?.categoryUrl,
      root?.runMeta?.productType,
      root?.runMeta?.product_type,
      root?.runMeta?.productLabel,
      root?.runMeta?.categoryUrl,
    ],
    'gpu',
  );
}

function inferListingProductType(raw, fallback = 'gpu') {
  return inferProductTypeFromFields(
    [
      raw?.productType,
      raw?.product_type,
      raw?.product,
      raw?.productLabel,
      raw?.category,
      raw?.categoryName,
      raw?.categoryUrl,
      raw?.sourceCategoryUrl,
      raw?.url,
    ],
    fallback,
  );
}

function detectCpuBrand(text) {
  const upper = normalizeGpuText(text);
  if (/\b(?:AMD|RYZEN|THREADRIPPER|ATHLON|EPYC)\b/.test(upper)) return 'AMD';
  if (/\b(?:INTEL|CORE\s+ULTRA|CORE\s+I[3579]|I[3579]\s*-?\s*\d|XEON|PENTIUM|CELERON)\b/.test(upper)) return 'Intel';
  return 'Bilinmiyor';
}

function normalizeCpuModel(title) {
  const upper = normalizeGpuText(title);

  const ryzenMatch = upper.match(/\b(?:AMD\s+)?RYZEN\s*([3579])\s*-?\s*(\d{4,5})(X3D|XT|X|G|GE|F)?\b/);
  if (ryzenMatch?.[1] && ryzenMatch[2]) {
    return ['Ryzen', ryzenMatch[1], `${ryzenMatch[2]}${ryzenMatch[3] ?? ''}`].join(' ');
  }

  const threadripperMatch = upper.match(/\b(?:AMD\s+)?(?:RYZEN\s+)?THREADRIPPER\s*(PRO\s*)?(\d{4,5})(WX|X)?\b/);
  if (threadripperMatch?.[2]) {
    return ['Threadripper', threadripperMatch[1] ? 'Pro' : '', `${threadripperMatch[2]}${threadripperMatch[3] ?? ''}`]
      .filter(Boolean)
      .join(' ');
  }

  const coreUltraMatch = upper.match(/\b(?:INTEL\s+)?CORE\s+ULTRA\s+([3579])\s*-?\s*(\d{3}[A-Z0-9]*)\b/);
  if (coreUltraMatch?.[1] && coreUltraMatch[2]) {
    return `Intel Core Ultra ${coreUltraMatch[1]} ${coreUltraMatch[2]}`;
  }

  const coreMatch = upper.match(/\b(?:INTEL\s+)?(?:CORE\s+)?I([3579])\s*-?\s*(\d{3,5})([A-Z]{0,3})\b/);
  if (coreMatch?.[1] && coreMatch[2]) {
    return `Intel Core i${coreMatch[1]}-${coreMatch[2]}${coreMatch[3] ?? ''}`;
  }

  const xeonMatch = upper.match(/\b(?:INTEL\s+)?XEON\s+([A-Z]?\d{3,5}[A-Z0-9-]*)\b/);
  if (xeonMatch?.[1]) {
    return `Intel Xeon ${xeonMatch[1]}`;
  }

  return String(title || '').trim();
}

function normalizeListingModel(title, productType) {
  return productType === 'cpu' ? normalizeCpuModel(title) : normalizeModel(title);
}

function detectListingBrand(text, productType) {
  return productType === 'cpu' ? detectCpuBrand(text) : detectBrand(text);
}

function normalizeGpuText(value) {
  return String(value || '')
    .replace(/[_/]+/g, ' ')
    .replace(/[İı]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeModel(title) {
  const upper = normalizeGpuText(title);
  const patterns = [
    /\bQUADRO RTX(?:\s+[A-Z0-9-]+)?\b/,
    /\bRTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bGTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bGT\s+\d{3,4}\b/,
    /\bG\s*-?\s*210\b/,
    /\bGEFORCE\s*210\b/,
    /\b[89]\d{3}\s*GT\b/,
    /\b(?:RADEON\s+)?(?:A?X?RX|RX)\s*-?\s*\d{3,4}\s*(?:XTX|XT|GRE)?\b/,
    /\b(?:AMD\s+)?(?:RADEON\s+)?(?:RX\s+)?VEGA\s*\d{2}\b/,
    /\bR[579]\s*-?\s*\d{3}\b/,
    /\b(?:RADEON\s+)?(?:HD|R)\s*-?\s*\d{4}\b/,
    /\bNVS\s*-?\s*\d{3,4}\b/,
    /\bARC\s+[A-Z]?\d{3,4}\b/,
    /\bTITAN(?:\s+[A-Z0-9-]+)?\b/,
  ];

  for (const pattern of patterns) {
    const match = upper.match(pattern);
    if (match?.[0]) {
      return match[0]
        .replace(/\b(?:RADEON\s+)?A?X?RX\b/i, 'RX')
        .replace(/\bG\s*-?\s*210\b/i, 'GT 210')
        .replace(/\bGEFORCE\s*210\b/i, 'GT 210')
        .replace(/\b([89]\d{3})\s*GT\b/i, 'GeForce $1 GT')
        .replace(/\b(?:AMD\s+)?(?:RADEON\s+)?(?:RX\s+)?VEGA\s*(\d{2})\b/i, 'RX Vega $1')
        .replace(/\b(?:RADEON\s+)?(?:HD|R)\s*-?\s*(\d{4})\b/i, 'Radeon HD $1')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  if (/\b(?:AMD|ATI|RADEON|SAPPHIRE|POWERCOLOR|POWER\s*COLOR|XFX)\b/.test(upper)) {
    const bareAmdMatch = upper.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)?\b/);
    if (bareAmdMatch?.[1]) {
      return ['RX', bareAmdMatch[1], bareAmdMatch[2] || ''].filter(Boolean).join(' ');
    }
  }

  const bareAmdWithModifierMatch = upper.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)\b/);
  if (bareAmdWithModifierMatch?.[1]) {
    return ['RX', bareAmdWithModifierMatch[1], bareAmdWithModifierMatch[2] || ''].filter(Boolean).join(' ');
  }

  const bareNvidiaMatch = upper.match(
    /\b(10(?:30|50|60|70|80)|16(?:30|50|60)|20(?:60|70|80)|30(?:50|60|70|80|90)|40(?:50|60|70|80|90)|50(?:60|70|80|90))\s*(TI\s*SUPER|TI|SUPER)?\b/,
  );
  if (bareNvidiaMatch?.[1]) {
    const prefix = Number.parseInt(bareNvidiaMatch[1], 10) >= 2060 ? 'RTX' : 'GTX';
    return [prefix, bareNvidiaMatch[1], bareNvidiaMatch[2] || ''].filter(Boolean).join(' ');
  }

  return String(title || '').trim();
}

function normalizeLocation(location) {
  return String(location || '')
    .trim()
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, '$1 / $2')
    .replace(/\s+/g, ' ');
}

function normalizeSourceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['sahibinden', 'letgo', 'dolap', 'donanimhaber', 'facebook', 'forum', 'pecid'].includes(normalized)) return normalized;
  return '';
}

function detectSource(url, explicitSourceType = '', explicitSource = '') {
  const sourceType = normalizeSourceType(explicitSourceType);
  if (sourceType === 'dolap') return { source: 'Dolap', sourceType: 'dolap' };
  if (sourceType === 'donanimhaber') return { source: 'Donanim Haber', sourceType: 'donanimhaber' };
  if (sourceType === 'facebook') return { source: 'Facebook', sourceType: 'facebook' };
  if (sourceType === 'forum') {
    const sourceText = String(explicitSource || '').trim();
    if (/technopat/i.test(sourceText)) return { source: 'Technopat', sourceType: 'forum' };
    if (/techolay/i.test(sourceText)) return { source: 'Techolay', sourceType: 'forum' };
    const value = String(url || '').toLowerCase();
    if (value.includes('technopat.net')) return { source: 'Technopat', sourceType: 'forum' };
    if (value.includes('techolay.net')) return { source: 'Techolay', sourceType: 'forum' };
    return { source: 'Forum', sourceType: 'forum' };
  }
  if (sourceType === 'letgo') return { source: 'Letgo', sourceType: 'letgo' };
  if (sourceType === 'sahibinden') return { source: 'Sahibinden', sourceType: 'sahibinden' };

  const sourceText = String(explicitSource || '').trim();
  if (/dolap/i.test(sourceText)) return { source: 'Dolap', sourceType: 'dolap' };
  if (/donanim\s*haber/i.test(sourceText)) return { source: 'Donanim Haber', sourceType: 'donanimhaber' };
  if (/facebook/i.test(sourceText)) return { source: 'Facebook', sourceType: 'facebook' };
  if (/technopat/i.test(sourceText)) return { source: 'Technopat', sourceType: 'forum' };
  if (/techolay/i.test(sourceText)) return { source: 'Techolay', sourceType: 'forum' };
  if (/letgo/i.test(sourceText)) return { source: 'Letgo', sourceType: 'letgo' };
  if (/sahibinden/i.test(sourceText)) return { source: 'Sahibinden', sourceType: 'sahibinden' };

  const value = String(url || '').toLowerCase();

  if (value.includes('letgo')) {
    return { source: 'Letgo', sourceType: 'letgo' };
  }

  if (value.includes('dolap')) {
    return { source: 'Dolap', sourceType: 'dolap' };
  }

  if (value.includes('donanimhaber')) {
    return { source: 'Donanim Haber', sourceType: 'donanimhaber' };
  }

  if (value.includes('facebook.com') || value.includes('fb.com')) {
    return { source: 'Facebook', sourceType: 'facebook' };
  }

  if (value.includes('technopat.net')) {
    return { source: 'Technopat', sourceType: 'forum' };
  }

  if (value.includes('techolay.net')) {
    return { source: 'Techolay', sourceType: 'forum' };
  }

  if (value.includes('sahibinden') || value.includes('shbdn.com')) {
    return { source: 'Sahibinden', sourceType: 'sahibinden' };
  }

  return { source: 'Harici', sourceType: 'external' };
}

function isCatalogNoiseListing(listing) {
  const text = `${listing?.title || ''} ${listing?.model || ''}`
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');

  if (listing?.productType === 'cpu') {
    return [
      /bo[şs]\s*kutu/,
      /sadece\s+kutu/,
      /(?:işlemci|islemci|cpu)\s*fan[ıi]/,
      /\b(?:fan|stok\s*fan|wraith|cooler|so[ğg]utucu|heatsink)\b/,
      /\b(?:anakart|motherboard|ram|bellek|set|bundle|kombin)\b/,
      /pin\s*(?:k[ıi]r[ıi]k|e[ğg]ik|yamuk|b[üu]k[üu]k)/,
      /ar[ıi]zal[ıi]|ariza|tamir|tamirlik|bozuk|hasarl[ıi]|sorunlu|çalışmıyor|calismiyor/,
      /\b(?:laptop|notebook)\b/,
    ].some((pattern) => pattern.test(text));
  }

  return [
    /bo[şs]\s*kutu/,
    /gpu\s*holder/,
    /destek\s*aparat[ıi]/,
    /ekran\s*kart[ıi]\s*destek/,
    /sadece\s+(?:kutu|fan|blok|backplate|so[ğg]utucu)/,
  ].some((pattern) => pattern.test(text));
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

function mapRawCatalogListing(raw, index, fallbackProductType = 'gpu') {
  const title = toStr(firstField(raw, ['baslik', 'title', 'ilan_baslik', 'ad', 'name']), 'Baslik bulunamadi');
  const url = toStr(firstField(raw, ['url', 'link', 'ilan_url', 'href']));
  const productType = inferListingProductType(raw, fallbackProductType);
  const explicitModel = toStr(firstField(raw, ['modelName', 'model', 'modelKey', 'gpuModel']));
  const model = normalizeListingModel(explicitModel || title, productType);
  const price = parsePriceTl(firstField(raw, ['fiyat', 'price', 'fiyat_str', 'amount', 'priceTl']));
  const source = detectSource(url, raw?.sourceType, raw?.source);
  const id =
    toStr(firstField(raw, ['ilan_id', 'id', 'ilan_no', 'listingId', 'uid'])) ||
    extractListingId(url) ||
    toListingId(model || title, price, index);

  return {
    id,
    title,
    model,
    brand: detectListingBrand(`${model} ${title}`, productType),
    price,
    priceText: toStr(firstField(raw, ['fiyat_str', 'priceText', 'rawPrice'])) || `${price.toLocaleString('tr-TR')} TL`,
    url: url || '#',
    imageUrl: pickImageUrl(raw) || null,
    location: normalizeLocation(firstField(raw, ['konum', 'location', 'city'])) || 'Konum yok',
    segment: toStr(firstField(raw, ['segment', 'priceSegment']), 'Arsiv'),
    listedAtLabel: toStr(firstField(raw, ['tarih', 'listedAtLabel', 'date']), 'Tarih yok'),
    source: source.source,
    sourceType: source.sourceType,
    productType,
  };
}

function enrichSummaryWithListingImages(summary, rawListings) {
  const imageByUrl = new Map();
  const imageById = new Map();

  for (const listing of rawListings) {
    const imageUrl = pickImageUrl(listing);
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
  const catalogJsonLiteral = JSON.stringify(JSON.stringify(catalogListings));

  return [
    'import type { CatalogListing } from "../services/dashboard-types.js";',
    '',
    '// Generated from the latest scraper output with public marketplace source and listing links.',
    '// Private workflow and run metadata must not be added to this seed.',
    `export const CATALOG_GENERATED_AT = ${JSON.stringify(generatedAt)};`,
    '',
    `const CATALOG_SEED_JSON = ${catalogJsonLiteral};`,
    'export const CATALOG_SEED = JSON.parse(CATALOG_SEED_JSON) as readonly CatalogListing[];',
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
  const productType = inferRootProductType(rawInput);
  const catalogListings = rawListings
    .map((listing, index) => mapRawCatalogListing(listing, index, productType))
    .filter((listing) => listing.title && listing.price > 0 && !isCatalogNoiseListing(listing));

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

import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from './config.mjs';
import { extractModelKey, getMarketReference } from './market.mjs';
import { generateFinalExpertSummary } from './ai.mjs';
import { clamp, median, parsePriceTl, percentile } from './utils.mjs';

function firstField(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return '';
}

function pickListings(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];

  const candidates = ['allListings', 'ilanlar', 'listings', 'items', 'results', 'data'];
  for (const k of candidates) {
    if (Array.isArray(root[k])) return root[k];
  }
  return [];
}

function normalizeRuleText(value) {
  return String(value || '')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıIİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSuspiciousListingTitle(title) {
  const text = normalizeRuleText(title);
  if (!text) return true;

  return [
    /\b(arizali|bozuk|sorunlu|tamir|tamirlik|defolu|calismiyor|broken|repair|artefakt)\b|\bgoruntu\s*yok\b/,
    /\b(yedek parca|parca niyetine|mining rig|sadece takas)\b/,
    /\b(12vhpwr|riser|backplate|braket|kablo|guc kaynagi|power supply|psu|adapter|donusturucu)\b/,
    /\b(?:ekran karti\s*)?kutusu\b|\bbos\s*kutu\b|\bgpu\s*yok\b|\bkart\s*yok\b/,
    /\bsadece\s+(?:kutu|fan|blok|backplate|sogutucu)\b|\bfan\s*(?:cercevesi|cerceve|seti|lari|lari)\b|\bsu\s*blogu\b|\bwater\s*block\b/,
  ].some((pattern) => pattern.test(text));
}

export function isModernCandidateModel(modelKey) {
  const model = normalizeRuleText(modelKey);
  return (
    /\brtx\s*(?:20|30|40|50)\d{2}\b/.test(model) ||
    /\brx\s*(?:6|7|9)\d{3}\b/.test(model) ||
    /\barc\s*[ab]\d{3}\b/.test(model)
  );
}

export function isUnrealisticCandidatePrice(price, fairPrice) {
  if (!(price > 0) || !(fairPrice > 0)) return true;
  return price < Math.max(1000, fairPrice * 0.08);
}

function normalizeListing(raw, idx) {
  const title = String(firstField(raw, ['baslik', 'title', 'ilan_baslik', 'ad', 'name'])).trim();
  const url = String(firstField(raw, ['link', 'url', 'ilan_url', 'href'])).trim();
  const explicitModel = String(firstField(raw, ['modelName', 'model', 'modelKey', 'gpuModel'])).trim();

  const rawPrice = firstField(raw, ['fiyat', 'price', 'fiyat_str', 'amount', 'priceTl']);
  const price = parsePriceTl(rawPrice);

  const id =
    String(firstField(raw, ['id', 'ilan_no', 'listingId', 'uid']) || `row-${idx + 1}`).trim() || `row-${idx + 1}`;

  const suspicious = isSuspiciousListingTitle(title);

  return {
    id,
    title,
    url,
    price,
    rawPrice,
    explicitModel,
    suspicious,
  };
}

function calculateVolatility(prices) {
  if (prices.length < 4) return 0.15;
  const med = median(prices);
  if (!(med > 0)) return 0.15;
  const q1 = percentile(prices, 25);
  const q3 = percentile(prices, 75);
  return clamp((q3 - q1) / med, 0.04, 0.60);
}

export async function analyzeFile(inputPath) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw);

  const listingsRaw = pickListings(parsed);
  const normalized = listingsRaw
    .map((x, i) => normalizeListing(x, i))
    .filter((x) => x.title && x.price > 0);

  const byModel = new Map();
  for (const listing of normalized) {
    const modelKey = extractModelKey(listing.explicitModel || listing.title);
    if (!modelKey) continue;
    if (!byModel.has(modelKey)) byModel.set(modelKey, []);
    byModel.get(modelKey).push({ ...listing, modelKey });
  }

  const aiBudgetRef = { remaining: CONFIG.maxAiModelLookups };
  const webBudgetRef = { remaining: CONFIG.maxWebModelLookups };
  const modelRefs = [];
  const candidates = [];

  for (const [modelKey, modelListings] of byModel.entries()) {
    const prices = modelListings.map((x) => x.price).filter((x) => x > 0);
    const market = await getMarketReference(modelKey, prices, aiBudgetRef, webBudgetRef);
    if (!(market.fairPrice > 0)) continue;

    const volatility = calculateVolatility(prices);
    const dynamicMinDiscount = clamp(CONFIG.minDiscountRatio + volatility * 0.12, CONFIG.minDiscountRatio, 0.25);

    modelRefs.push({
      modelKey,
      listingCount: modelListings.length,
      fairPrice: market.fairPrice,
      confidence: market.confidence,
      dynamicMinDiscount,
      localMedian: market.localMedian,
      webPrice: market.webRef?.fairPrice || 0,
      aiPrice: market.aiRef?.fairPrice || 0,
    });

    for (const row of modelListings) {
      const discountRatio = (market.fairPrice - row.price) / market.fairPrice;
      const score = discountRatio * 100 + market.confidence * 20 - (row.suspicious ? 30 : 0);
      const isBuyable =
        discountRatio >= dynamicMinDiscount &&
        !row.suspicious &&
        isModernCandidateModel(modelKey) &&
        !isUnrealisticCandidatePrice(row.price, market.fairPrice);

      if (!isBuyable) continue;

      candidates.push({
        modelKey,
        title: row.title,
        price: row.price,
        fairPrice: market.fairPrice,
        discountRatio,
        score,
        confidence: market.confidence,
        url: row.url,
        analysisNote: `%${(discountRatio * 100).toFixed(1)} piyasa avantaji, guven %${Math.round(
          market.confidence * 100,
        )}`,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.discountRatio - a.discountRatio || a.price - b.price);

  const top = candidates.slice(0, CONFIG.maxResults);
  const expertSummary = await generateFinalExpertSummary(top);

  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: path.basename(inputPath),
    listingCount: normalized.length,
    recognizedModelCount: byModel.size,
    candidateCount: candidates.length,
    expertSummary,
    config: {
      minDiscountRatio: CONFIG.minDiscountRatio,
      maxResults: CONFIG.maxResults,
      aiProvider: CONFIG.aiProvider,
    },
    modelReferences: modelRefs.sort((a, b) => b.listingCount - a.listingCount),
    topCandidates: top,
  };

  return report;
}

export function renderTelegramSummary(report) {
  const lines = [];
  lines.push('✨ *YAPAY ZEKA (AI) FIRSAT ANALİZİ*');
  lines.push(`Toplam ilan: ${report.listingCount}`);
  lines.push(`Model bulunan: ${report.recognizedModelCount}`);
  lines.push(`Alınabilir aday: ${report.candidateCount}`);
  lines.push('');
  lines.push('En iyi adaylar:');

  if (!report.topCandidates.length) {
    lines.push('- Uygun aday bulunamadi.');
  } else {
    report.topCandidates.slice(0, 15).forEach((x, i) => {
      const discountPct = (x.discountRatio * 100).toFixed(1);
      lines.push(
        `${i + 1}) ${x.modelKey} | ${x.price} TL | piyasa ~${x.fairPrice} TL | indirim %${discountPct}`,
      );
      if (x.url) lines.push(`   ${x.url}`);
    });
  }

  if (report.expertSummary) {
    lines.push('');
    lines.push('🤖 PC Uzmanı (Yapay Zeka) Yorumu:');
    lines.push(report.expertSummary);
  }

  return lines.join('\n');
}

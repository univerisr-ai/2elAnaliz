import axios from 'axios';
import { fetchAiPriceReference } from './ai.mjs';
import { median, parsePriceTl } from './utils.mjs';

const cache = new Map();

const MODEL_PATTERNS = [
  /(rtx\s?\d{3,4}(?:\s?(?:ti|super))?)/i,
  /(gtx\s?\d{3,4}(?:\s?ti)?)/i,
  /(rx\s?\d{3,4}(?:\s?(?:xt|xtx))?)/i,
  /(arc\s?[a-z]\d{3})/i,
  /(quadro\s?[a-z0-9]+)/i,
];

function canonicalizeModelKey(key) {
  return String(key || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/^(RTX|GTX|RX)(\d)/, '$1 $2')
    .replace(/(\d)(TI|SUPER|XT|XTX)\b/g, '$1 $2')
    .trim();
}

function normalizeSpaces(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractModelKey(title) {
  const t = normalizeSpaces(title).toLowerCase();
  for (const pattern of MODEL_PATTERNS) {
    const m = t.match(pattern);
    if (m && m[1]) {
      return canonicalizeModelKey(m[1]);
    }
  }
  return '';
}

function extractTlValues(text) {
  const values = [];
  const source = String(text || '').toLowerCase();

  const withCurrency = source.matchAll(/(\d{1,3}(?:[.,\s]\d{3})+|\d{4,6})\s*(?:tl|₺|lira)/gi);
  for (const m of withCurrency) {
    const n = parsePriceTl(m[1]);
    if (n >= 1000 && n <= 300000) values.push(n);
  }

  return values;
}

async function fetchDuckDuckGoReference(modelKey) {
  const q = `${modelKey} ikinci el ekran karti fiyat tl`;
  try {
    const { data } = await axios.get('https://duckduckgo.com/html/', {
      timeout: 35000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
      params: { q },
    });

    const plain = String(data || '').replace(/<[^>]*>/g, ' ');
    const values = extractTlValues(plain);
    if (values.length < 3) {
      return null;
    }

    return {
      source: 'web',
      fairPrice: Math.round(median(values)),
      sampleCount: values.length,
      confidence: Math.min(0.75, 0.45 + values.length * 0.02),
    };
  } catch {
    return null;
  }
}

async function fetchJinaSearchReference(modelKey) {
  const q = encodeURIComponent(`${modelKey} ikinci el ekran karti fiyat tl`);
  const url = `https://r.jina.ai/http://duckduckgo.com/?q=${q}`;

  try {
    const { data } = await axios.get(url, {
      timeout: 35000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
    });

    const values = extractTlValues(String(data || ''));
    if (values.length < 2) return null;

    return {
      source: 'web-jina',
      fairPrice: Math.round(median(values)),
      sampleCount: values.length,
      confidence: Math.min(0.68, 0.38 + values.length * 0.03),
    };
  } catch {
    return null;
  }
}

export async function getMarketReference(modelKey, localPrices, aiBudgetRef, webBudgetRef) {
  const key = `${modelKey}|${localPrices.length}`;
  if (cache.has(key)) return cache.get(key);

  const localMedian = localPrices.length ? Math.round(median(localPrices)) : 0;
  let webRef = null;

  if (webBudgetRef.remaining > 0 && localPrices.length >= 5) {
    webBudgetRef.remaining -= 1;
    webRef = await fetchDuckDuckGoReference(modelKey);
    if (!webRef) {
      webRef = await fetchJinaSearchReference(modelKey);
    }
  }

  let aiRef = null;
  if (aiBudgetRef.remaining > 0) {
    aiBudgetRef.remaining -= 1;
    aiRef = await fetchAiPriceReference(modelKey, localMedian);
  }

  const weighted = [];
  if (webRef?.fairPrice) weighted.push({ price: webRef.fairPrice, weight: 0.55 });
  if (aiRef?.fairPrice) weighted.push({ price: aiRef.fairPrice, weight: 0.30 });
  if (localMedian > 0) weighted.push({ price: localMedian, weight: weighted.length ? 0.15 : 1.0 });

  let fairPrice = 0;
  let confidence = 0.3;

  if (weighted.length > 0) {
    const totalWeight = weighted.reduce((s, x) => s + x.weight, 0);
    fairPrice = Math.round(weighted.reduce((s, x) => s + x.price * x.weight, 0) / totalWeight);
    confidence = Math.min(
      0.9,
      (webRef?.confidence || 0) * 0.6 + (aiRef?.confidence || 0) * 0.3 + (localMedian > 0 ? 0.25 : 0),
    );
  }

  const out = {
    modelKey,
    fairPrice,
    confidence,
    webRef,
    aiRef,
    localMedian,
  };

  cache.set(key, out);
  return out;
}

import type { BuyabilityInsight, CatalogListing, GpuListing } from "../types/listing";
import { getCanonicalGpuModel, getModelCategoryLabel, getModelCategoryKey } from "./catalog-taxonomy";

interface BuyabilityStats {
  readonly prices: readonly number[];
  readonly medianPrice: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly referencePrice: number | null;
  readonly referenceCount: number;
}

export type BuyabilityIndex = ReadonlyMap<string, BuyabilityStats>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function getModelKeyFromLabel(label: string): string {
  return `model:${label.toLocaleLowerCase("tr-TR")}`;
}

function stripVramLabel(label: string): string {
  return label.replace(/\s+\d+\s*GB\b/gi, "").replace(/\s+/g, " ").trim();
}

function getReferenceLabels(listing: Pick<CatalogListing, "model" | "title" | "productType">): string[] {
  const canonical = getModelCategoryLabel(listing as CatalogListing) || listing.model || listing.title;
  const base = stripVramLabel(canonical);
  return Array.from(new Set([canonical, base].filter(Boolean)));
}

function normalizeGpuText(value: string): string {
  return value
    .replace(/[_/]+/g, " ")
    .replace(/[İı]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getRiskFlags(listing: Pick<CatalogListing, "title" | "model">): string[] {
  const text = `${listing.title} ${listing.model}`.toLocaleLowerCase("tr-TR");
  const checks: ReadonlyArray<readonly [RegExp, string]> = [
    [/bo[şs]\s*kutu|gpu\s*yok|kart\s*yok/, "Gerçek kart yerine kutu veya eksik ürün olabilir."],
    [/sadece\s+(blok|kutu|fan|so[ğg]utucu)|su\s*blo[ğg]u|backplate|braket/, "Aksesuar veya parça ilanı olabilir."],
    [
      /yedek\s*par[çc]a|par[çc]a\s*niyetine|ar[ıi]zal[ıi]|ariza|tamir|tamirlik|bozuk|hasarl[ıi]|sorunlu|çalışmıyor|calismiyor|g[öo]r[üu]nt[üu]\s*(?:yok|vermiyor)|ekran\s*gelmiyor|artefakt|artifact|[çc]izgi|fan\s*k[ıi]r[ıi]k/,
      "Arızalı veya tamirlik ürün sinyali var.",
    ],
    [/riser|mining|kaz[ıi]m/, "Yoğun kullanım veya mining geçmişi olabilir."],
  ];

  return checks.filter(([pattern]) => pattern.test(text)).map(([, message]) => message);
}

function getLegacyLowPriorityReason(listing: Pick<CatalogListing, "title" | "model" | "productType">): string | null {
  if (listing.productType === "cpu") {
    return null;
  }

  const text = normalizeGpuText(`${listing.title} ${listing.model}`);

  if (/\b(?:ATI\s+)?(?:RADEON\s+)?HD\s*-?\s*\d{4}\b/.test(text) || /\bVOODOO\b/.test(text)) {
    return "Cok eski Radeon HD/retro kart ana akistan kaldirildi.";
  }

  if (/\b(?:GEFORCE\s*)?[89]\d{3}\s*GT\b/.test(text) || /\b(?:GTS|GT)\s*-?\s*\d{3,4}\b/.test(text)) {
    return "Cok eski GeForce GT/GTS modeli ana akistan kaldirildi.";
  }

  if (/\bR[579]\s*-?\s*\d{3}\b/.test(text) || /\b(?:RX\s*)?VEGA\s*\d{2}\b/.test(text)) {
    return "Eski Radeon R/Vega modeli ana akistan kaldirildi.";
  }

  if (/\bRX\s*-?\s*(?:4\d{2}|5\d{2})\b/.test(text)) {
    return "RX 400/500 serisi ana akista dusuk oncelikli kabul edildi.";
  }

  if (/\bGTX\s*-?\s*(?:[4-9]\d{2}|10(?:30|50|60|70|80))\b/.test(text)) {
    return "Cok eski GTX modeli ana akistan kaldirildi.";
  }

  return null;
}

function getAmbiguousModelReason(listing: Pick<CatalogListing, "title" | "model" | "productType">): string | null {
  if (listing.productType === "cpu") {
    return null;
  }

  if (getCanonicalGpuModel(listing)) {
    return null;
  }

  const text = normalizeGpuText(`${listing.title} ${listing.model}`);
  if (/\b(EKRAN\s*KARTI|GPU|OYUNCU\s*BILGISAYARI|OYUN\s*BILGISAYARI)\b/.test(text)) {
    return "Model net secilemedigi icin ana akista gosterilmiyor.";
  }

  return null;
}

function getSuspiciousLowPriceReason(
  listing: Pick<CatalogListing, "price" | "title" | "model">,
  referencePrice: number | null,
  medianPrice: number | null,
): string | null {
  if (listing.price <= 0) {
    return "Fiyat okunamadigi icin ilan gizlendi.";
  }

  if (listing.price <= 100) {
    return "Fiyat 1 TL/placeholder gibi gorunuyor.";
  }

  if (referencePrice && listing.price < Math.max(750, referencePrice * 0.08)) {
    return "Fiyat sifir referansa gore gercek disi dusuk gorunuyor.";
  }

  if (medianPrice && listing.price < Math.max(750, medianPrice * 0.12)) {
    return "Fiyat benzer ilanlara gore gercek disi dusuk gorunuyor.";
  }

  return null;
}

function isIndexableMarketPrice(listing: CatalogListing): boolean {
  return (
    listing.price >= 750 &&
    getRiskFlags(listing).length === 0 &&
    !getLegacyLowPriorityReason(listing) &&
    !getAmbiguousModelReason(listing)
  );
}

export function getModelPriorityScore(listing: Pick<CatalogListing, "title" | "model" | "productType">): number {
  if (listing.productType === "cpu") {
    const text = normalizeGpuText(`${getModelCategoryLabel(listing as CatalogListing)} ${listing.title} ${listing.model}`);

    if (/\bRYZEN\s+[79]\s+(?:9|8|7)\d{3}/.test(text)) return 44;
    if (/\bRYZEN\s+5\s+(?:9|8|7)\d{3}/.test(text)) return 40;
    if (/\bCORE\s+ULTRA\s+[79]\b/.test(text)) return 43;
    if (/\bCORE\s+I9-\d{5}/.test(text)) return 41;
    if (/\bCORE\s+I7-\d{5}/.test(text)) return 39;
    if (/\bCORE\s+I5-\d{5}/.test(text)) return 35;
    if (/\bTHREADRIPPER\b/.test(text)) return 42;
    if (/\bRYZEN\s+[3579]\s+5\d{3}/.test(text)) return 28;
    if (/\bXEON\b/.test(text)) return 18;
    if (/\b(?:ATHLON|PENTIUM|CELERON|AMD\s+A(?:4|6|8|10|12)-)\b/.test(text)) return 8;

    return 14;
  }

  const text = normalizeGpuText(`${getCanonicalGpuModel(listing)} ${listing.title} ${listing.model}`);

  if (/\bRTX\s*-?\s*50\d{2}/.test(text)) return 45;
  if (/\bRX\s*-?\s*90\d{2}/.test(text)) return 44;
  if (/\bRTX\s*-?\s*40\d{2}/.test(text)) return 40;
  if (/\bRX\s*-?\s*7\d{3}/.test(text)) return 39;
  if (/\bRTX\s*-?\s*30\d{2}/.test(text)) return 34;
  if (/\bRX\s*-?\s*6\d{3}/.test(text)) return 33;
  if (/\bRTX\s*-?\s*20\d{2}/.test(text)) return 26;
  if (/\bRX\s*-?\s*5[5-9]\d{2}/.test(text)) return 22;
  if (/\bGTX\s*-?\s*16\d{2}/.test(text)) return 20;
  if (/\b(?:INTEL\s*)?ARC\s*B\d{3}\b/.test(text)) return 24;
  if (/\b(?:INTEL\s*)?ARC\s*A\d{3}\b/.test(text)) return 18;
  if (/\b(QUADRO|TESLA|FIREPRO|NVS)\b/.test(text)) return 8;

  return 12;
}

export function getCatalogRankingScore(
  listing: Pick<CatalogListing, "title" | "model"> & { readonly segment?: string },
  insight: Pick<BuyabilityInsight, "score">,
): number {
  // Arşiv ilanlar hiçbir zaman aktif ilanların önüne geçmez; kendi aralarında skorla dizilir.
  const archivePenalty = /^ar[sş][iı]v$/i.test(listing.segment?.trim() ?? "") ? -1_000_000 : 0;
  return archivePenalty + insight.score * 10 + getModelPriorityScore(listing);
}

export function buildBuyabilityIndex(
  listings: readonly CatalogListing[],
  referenceListings: readonly Pick<GpuListing, "model" | "title" | "fairPrice">[] = [],
): BuyabilityIndex {
  const grouped = new Map<string, { label: string; prices: number[] }>();
  const references = new Map<string, number[]>();

  referenceListings.forEach((listing) => {
    if (!Number.isFinite(listing.fairPrice) || listing.fairPrice <= 0) {
      return;
    }

    getReferenceLabels(listing).forEach((label) => {
      const key = getModelKeyFromLabel(label);
      const prices = references.get(key) ?? [];
      prices.push(listing.fairPrice);
      references.set(key, prices);
    });
  });

  listings.forEach((listing) => {
    if (!isIndexableMarketPrice(listing)) {
      return;
    }

    const key = getModelCategoryKey(listing);
    const group = grouped.get(key) ?? { label: getModelCategoryLabel(listing), prices: [] };
    group.prices.push(listing.price);
    grouped.set(key, group);
  });

  const index = new Map<string, BuyabilityStats>();
  grouped.forEach(({ label, prices }, key) => {
    const exactReferences = references.get(key) ?? [];
    const baseReferences = references.get(getModelKeyFromLabel(stripVramLabel(label))) ?? [];
    const referencePrices = Array.from(new Set([...exactReferences, ...baseReferences]));

    index.set(key, {
      prices,
      medianPrice: median(prices),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      referencePrice: median(referencePrices),
      referenceCount: referencePrices.length,
    });
  });

  return index;
}

function getTone(score: number): BuyabilityInsight["tone"] {
  if (score >= 88) return "excellent";
  if (score >= 74) return "good";
  if (score >= 58) return "watch";
  return "expensive";
}

function getLabel(score: number): string {
  if (score >= 88) return "Çok alınabilir";
  if (score >= 74) return "Alınabilir";
  if (score >= 58) return "Takip edilebilir";
  return "Pahalı";
}

export function getBuyabilityInsight(
  listing: CatalogListing,
  listings: readonly CatalogListing[],
  index: BuyabilityIndex = buildBuyabilityIndex(listings),
): BuyabilityInsight {
  const modelKey = getModelCategoryKey(listing);
  const modelName = getModelCategoryLabel(listing) || listing.model || "Model belirsiz";
  const stats = index.get(modelKey);
  const prices = stats?.prices ?? [];
  const medianPrice = stats?.medianPrice ?? null;
  const minPrice = stats?.minPrice ?? null;
  const maxPrice = stats?.maxPrice ?? null;
  const referencePrice = stats?.referencePrice ?? null;
  const riskFlags = getRiskFlags(listing);

  if (riskFlags.length > 0) {
    return {
      score: 24,
      label: "İnceleme dışı",
      tone: "expensive",
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: Boolean(referencePrice),
      priceDeltaPercent: null,
      rankText: "Aksesuar veya arızalı ilan olabilir",
      reason: riskFlags[0] ?? "Başlık gerçek ekran kartı yerine kutu, blok, parça veya arızalı ürün sinyali taşıyor.",
      riskFlags,
    };
  }

  const legacyReason = getLegacyLowPriorityReason(listing);
  if (legacyReason) {
    return {
      score: 42,
      label: "İnceleme dışı",
      tone: "expensive",
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: Boolean(referencePrice),
      priceDeltaPercent: null,
      rankText: "Eski model",
      reason: legacyReason,
      riskFlags: [legacyReason],
    };
  }

  const ambiguousReason = getAmbiguousModelReason(listing);
  if (ambiguousReason) {
    return {
      score: 44,
      label: "İnceleme dışı",
      tone: "expensive",
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: Boolean(referencePrice),
      priceDeltaPercent: null,
      rankText: "Model belirsiz",
      reason: ambiguousReason,
      riskFlags: [ambiguousReason],
    };
  }

  const suspiciousLowPriceReason = getSuspiciousLowPriceReason(listing, referencePrice, medianPrice);
  if (suspiciousLowPriceReason) {
    return {
      score: 28,
      label: "İnceleme dışı",
      tone: "expensive",
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: Boolean(referencePrice),
      priceDeltaPercent: null,
      rankText: "Fiyat dogrulanamadi",
      reason: suspiciousLowPriceReason,
      riskFlags: [suspiciousLowPriceReason],
    };
  }

  if (referencePrice && listing.price > 0) {
    const priceDeltaPercent = Math.round(((referencePrice - listing.price) / referencePrice) * 100);
    const score = Math.round(clamp(110 - (listing.price / referencePrice) * 42, 18, 98));
    const tone = getTone(score);
    const label = getLabel(score);
    const relationText =
      priceDeltaPercent > 0
        ? `sıfır referansından %${priceDeltaPercent} daha düşük`
        : priceDeltaPercent < 0
          ? `sıfır referansından %${Math.abs(priceDeltaPercent)} daha yüksek`
          : "sıfır referansına yakın";

    return {
      score,
      label,
      tone,
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: true,
      priceDeltaPercent,
      rankText: `Sıfır referans: ${referencePrice.toLocaleString("tr-TR")} TL`,
      reason: `${modelName} için ilan fiyatı ${relationText}.`,
    };
  }

  if (!medianPrice || !minPrice || !maxPrice || listing.price <= 0) {
    return {
      score: 60,
      label: "Takip edilebilir",
      tone: "watch",
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: false,
      priceDeltaPercent: null,
      rankText: "Karşılaştırma için veri az",
      reason: "Bu model için sıfır referans fiyatı bulunamadı; karar destek seviyesi sınırlı.",
    };
  }

  const priceDeltaPercent = Math.round(((medianPrice - listing.price) / medianPrice) * 100);
  const cheaperCount = prices.filter((price) => price < listing.price).length;
  const rankText = `${cheaperCount + 1}. en düşük fiyat`;
  const spread = maxPrice - minPrice;
  const positionPenalty = spread > 0 ? ((listing.price - minPrice) / spread) * 42 : 16;
  const medianBonus = clamp(priceDeltaPercent * 1.25, -30, 28);
  const lowestBonus = listing.price <= minPrice * 1.03 ? 10 : 0;
  const score = Math.round(clamp(72 - positionPenalty + medianBonus + lowestBonus, 18, 98));
  const tone = getTone(score);
  const label = getLabel(score);
  const relationText =
    priceDeltaPercent > 0
      ? `model medyanından %${priceDeltaPercent} daha düşük`
      : priceDeltaPercent < 0
        ? `model medyanından %${Math.abs(priceDeltaPercent)} daha yüksek`
        : "model medyanına yakın";

  return {
    score,
    label,
    tone,
    modelName,
    comparableCount: prices.length,
    medianPrice,
    minPrice,
    maxPrice,
    referencePrice,
    isReferenceBased: false,
    priceDeltaPercent,
    rankText,
    reason: `${modelName} için sıfır referans yok; ${prices.length} ikinci el ilanla karşılaştırıldı, fiyat ${relationText}.`,
  };
}

export function isReferenceBuyableListing(
  listing: CatalogListing,
  listings: readonly CatalogListing[],
  index: BuyabilityIndex = buildBuyabilityIndex(listings),
): boolean {
  const insight = getBuyabilityInsight(listing, listings, index);
  return insight.isReferenceBased && insight.score >= 74;
}

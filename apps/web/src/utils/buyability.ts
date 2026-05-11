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

function getReferenceLabels(listing: Pick<CatalogListing, "model" | "title">): string[] {
  const canonical = getCanonicalGpuModel(listing) || listing.model || listing.title;
  const base = stripVramLabel(canonical);
  return Array.from(new Set([canonical, base].filter(Boolean)));
}

function isLikelyAccessoryOrFaulty(listing: Pick<CatalogListing, "title" | "model">): boolean {
  const text = `${listing.title} ${listing.model}`.toLocaleLowerCase("tr-TR");
  const patterns = [
    /bo[şs]\s*kutu/,
    /gpu\s*yok/,
    /kart\s*yok/,
    /sadece\s+(blok|kutu|fan|so[ğg]utucu)/,
    /su\s*blo[ğg]u/,
    /yedek\s*par[çc]a/,
    /ar[ıi]zal[ıi]/,
    /tamir/,
    /çalışmıyor/,
    /calismiyor/,
    /riser/,
    /backplate/,
  ];

  return patterns.some((pattern) => pattern.test(text));
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
    if (listing.price <= 0) {
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
  const modelName = getCanonicalGpuModel(listing) || listing.model || "Model belirsiz";
  const stats = index.get(modelKey);
  const prices = stats?.prices ?? [];
  const medianPrice = stats?.medianPrice ?? null;
  const minPrice = stats?.minPrice ?? null;
  const maxPrice = stats?.maxPrice ?? null;
  const referencePrice = stats?.referencePrice ?? null;

  if (isLikelyAccessoryOrFaulty(listing)) {
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
      reason: "Başlık gerçek ekran kartı yerine kutu, blok, parça veya arızalı ürün sinyali taşıyor.",
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

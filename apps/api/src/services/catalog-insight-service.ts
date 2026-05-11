import type { CatalogListing, DashboardListing } from "./dashboard-types.js";

export interface BuyabilityInsight {
  readonly score: number;
  readonly label: string;
  readonly tone: "excellent" | "good" | "watch" | "expensive";
  readonly modelName: string;
  readonly comparableCount: number;
  readonly medianPrice: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly referencePrice: number | null;
  readonly isReferenceBased: boolean;
  readonly priceDeltaPercent: number | null;
  readonly rankText: string;
  readonly reason: string;
  readonly riskFlags: readonly string[];
}

interface BuyabilityStats {
  readonly prices: readonly number[];
  readonly medianPrice: number | null;
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly referencePrice: number | null;
  readonly referenceCount: number;
}

export interface CatalogModelSummary {
  readonly slug: string;
  readonly key: string;
  readonly label: string;
  readonly family: string;
  readonly brand: CatalogListing["brand"];
  readonly listingCount: number;
  readonly buyableCount: number;
  readonly minPrice: number | null;
  readonly medianPrice: number | null;
  readonly maxPrice: number | null;
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
  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1];
    const right = sorted[middle];
    return left == null || right == null ? null : (left + right) / 2;
  }

  return sorted[middle] ?? null;
}

function cleanListingText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeModelModifier(value: string | undefined): string {
  const modifier = value?.replace(/\s+/g, " ").trim().toUpperCase();

  switch (modifier) {
    case "TI":
      return "Ti";
    case "TI SUPER":
      return "Ti SUPER";
    case "SUPER":
    case "XT":
    case "XTX":
    case "GRE":
      return modifier;
    default:
      return "";
  }
}

function getVramLabel(text: string): string {
  const match = text.match(/\b(2|3|4|6|8|10|11|12|16|20|24|32|48)\s*(?:GB|GDDR|G\b)/i);
  return match ? `${match[1]} GB` : "";
}

function formatGpuModel(prefix: string, model: string, modifier: string | undefined, vramLabel: string): string {
  return [prefix.toUpperCase(), model, normalizeModelModifier(modifier), vramLabel].filter(Boolean).join(" ");
}

export function getCanonicalGpuModel(listing: Pick<CatalogListing, "model" | "title">): string {
  const text = cleanListingText(`${listing.model} ${listing.title}`)
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const vramLabel = getVramLabel(text);

  const nvidiaMatch = text.match(/\b(RTX|GTX|GTS|GT)\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b/i);
  if (nvidiaMatch) {
    const [, prefix, model, modifier] = nvidiaMatch;
    if (prefix && model) {
      return formatGpuModel(prefix, model, modifier, vramLabel);
    }
  }

  const amdMatch = text.match(/\b(RX)\s*-?\s*(\d{3,4})\s*(XTX|XT|GRE)?\b/i);
  if (amdMatch) {
    const [, prefix, model, modifier] = amdMatch;
    if (prefix && model) {
      return formatGpuModel(prefix, model, modifier, vramLabel);
    }
  }

  const intelArcMatch = text.match(/\b(?:ARC\s*)?([AB])\s*-?\s*(\d{3})\b/i);
  if (intelArcMatch) {
    const [, prefix, model] = intelArcMatch;
    if (prefix && model) {
      return ["Intel Arc", `${prefix.toUpperCase()}${model}`, vramLabel].filter(Boolean).join(" ");
    }
  }

  return "";
}

export function getModelLabel(listing: Pick<CatalogListing, "model" | "title">): string {
  return getCanonicalGpuModel(listing) || cleanListingText(listing.model || listing.title) || "Model belirsiz";
}

export function getModelKeyFromLabel(label: string): string {
  return `model:${label.toLocaleLowerCase("tr-TR")}`;
}

export function getModelKey(listing: Pick<CatalogListing, "model" | "title">): string {
  return getModelKeyFromLabel(getModelLabel(listing));
}

function stripVramLabel(label: string): string {
  return label.replace(/\s+\d+\s*GB\b/gi, "").replace(/\s+/g, " ").trim();
}

function getReferenceLabels(listing: Pick<DashboardListing, "model" | "title">): string[] {
  const canonical = getCanonicalGpuModel({
    model: listing.model,
    title: listing.title,
  }) || listing.model || listing.title;
  const base = stripVramLabel(canonical);
  return Array.from(new Set([canonical, base].filter(Boolean)));
}

export function slugifyModelLabel(label: string): string {
  return label
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getModelSlug(listing: Pick<CatalogListing, "model" | "title">): string {
  return slugifyModelLabel(getModelLabel(listing)) || "model-belirsiz";
}

export function getModelFamily(listing: Pick<CatalogListing, "model" | "title">): string {
  const canonicalModel = getCanonicalGpuModel(listing);
  const text = canonicalModel || `${listing.model} ${listing.title}`.toUpperCase();
  const rtxMatch = text.match(/\bRTX\s*-?\s*(\d{4})/);
  const gtxMatch = text.match(/\bGTX\s*-?\s*(\d{3,4})/);
  const rxMatch = text.match(/\bRX\s*-?\s*(\d{3,4})/);

  if (rtxMatch) {
    const model = rtxMatch[1];
    return model ? `RTX ${model.slice(0, 2)} Serisi` : "RTX Serisi";
  }

  if (gtxMatch) {
    const model = gtxMatch[1] ?? "";
    if (model.startsWith("16")) return "GTX 16 Serisi";
    if (model.startsWith("10")) return "GTX 10 Serisi";
    if (model.startsWith("9")) return "GTX 900 Serisi";
    if (model.startsWith("7")) return "GTX 700 Serisi";
    return "GTX Serisi";
  }

  if (rxMatch) {
    const model = rxMatch[1] ?? "";
    if (model.length === 4) return `RX ${model.charAt(0)}000 Serisi`;
    if (model.startsWith("5")) return "RX 500 Serisi";
    if (model.startsWith("4")) return "RX 400 Serisi";
    return "RX Serisi";
  }

  if (text.includes("ARC") || /\b[AB]\s*-?\s*\d{3}\b/.test(text)) {
    return "Intel Arc";
  }

  if (text.includes("QUADRO") || text.includes("TESLA") || text.includes("FIREPRO")) {
    return "Profesyonel GPU";
  }

  return "Diğer modeller";
}

function getRiskFlags(listing: Pick<CatalogListing, "title" | "model">): string[] {
  const text = `${listing.title} ${listing.model}`.toLocaleLowerCase("tr-TR");
  const checks: ReadonlyArray<readonly [RegExp, string]> = [
    [/bo[şs]\s*kutu|gpu\s*yok|kart\s*yok/, "Gerçek kart yerine kutu veya eksik ürün olabilir."],
    [/sadece\s+(blok|kutu|fan|so[ğg]utucu)|su\s*blo[ğg]u|backplate/, "Aksesuar veya parça ilanı olabilir."],
    [/yedek\s*par[çc]a|ar[ıi]zal[ıi]|tamir|çalışmıyor|calismiyor/, "Arızalı veya tamirlik ürün sinyali var."],
    [/riser|mining|kaz[ıi]m/, "Yoğun kullanım veya mining geçmişi olabilir."],
  ];

  return checks.filter(([pattern]) => pattern.test(text)).map(([, message]) => message);
}

export function buildBuyabilityIndex(
  listings: readonly CatalogListing[],
  referenceListings: readonly Pick<DashboardListing, "model" | "title" | "fairPrice">[] = [],
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

    const key = getModelKey(listing);
    const group = grouped.get(key) ?? { label: getModelLabel(listing), prices: [] };
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
  const modelKey = getModelKey(listing);
  const modelName = getModelLabel(listing);
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
      rankText: "Riskli veya parça ilanı olabilir",
      reason: riskFlags[0] ?? "Riskli veya parça ilanı olabilir.",
      riskFlags,
    };
  }

  if (referencePrice && listing.price > 0) {
    const priceDeltaPercent = Math.round(((referencePrice - listing.price) / referencePrice) * 100);
    const score = Math.round(clamp(110 - (listing.price / referencePrice) * 42, 18, 98));
    const relationText =
      priceDeltaPercent > 0
        ? `sıfır referansından %${priceDeltaPercent} daha düşük`
        : priceDeltaPercent < 0
          ? `sıfır referansından %${Math.abs(priceDeltaPercent)} daha yüksek`
          : "sıfır referansına yakın";

    return {
      score,
      label: getLabel(score),
      tone: getTone(score),
      modelName,
      comparableCount: prices.length,
      medianPrice,
      minPrice,
      maxPrice,
      referencePrice,
      isReferenceBased: true,
      priceDeltaPercent,
      rankText: `Sıfır referans: ${Math.round(referencePrice).toLocaleString("tr-TR")} TL`,
      reason: `${modelName} için ilan fiyatı ${relationText}.`,
      riskFlags,
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
      riskFlags,
    };
  }

  const priceDeltaPercent = Math.round(((medianPrice - listing.price) / medianPrice) * 100);
  const cheaperCount = prices.filter((price) => price < listing.price).length;
  const spread = maxPrice - minPrice;
  const positionPenalty = spread > 0 ? ((listing.price - minPrice) / spread) * 42 : 16;
  const medianBonus = clamp(priceDeltaPercent * 1.25, -30, 28);
  const lowestBonus = listing.price <= minPrice * 1.03 ? 10 : 0;
  const score = Math.round(clamp(72 - positionPenalty + medianBonus + lowestBonus, 18, 98));
  const relationText =
    priceDeltaPercent > 0
      ? `model medyanından %${priceDeltaPercent} daha düşük`
      : priceDeltaPercent < 0
        ? `model medyanından %${Math.abs(priceDeltaPercent)} daha yüksek`
        : "model medyanına yakın";

  return {
    score,
    label: getLabel(score),
    tone: getTone(score),
    modelName,
    comparableCount: prices.length,
    medianPrice,
    minPrice,
    maxPrice,
    referencePrice,
    isReferenceBased: false,
    priceDeltaPercent,
    rankText: `${cheaperCount + 1}. en düşük fiyat`,
    reason: `${modelName} için ${prices.length} ikinci el ilanla karşılaştırıldı, fiyat ${relationText}.`,
    riskFlags,
  };
}

export function buildCatalogModelSummaries(
  listings: readonly CatalogListing[],
  buyabilityIndex: BuyabilityIndex,
): CatalogModelSummary[] {
  const groups = new Map<string, { listings: CatalogListing[]; label: string; slug: string; family: string }>();

  listings.forEach((listing) => {
    const label = getModelLabel(listing);
    const slug = slugifyModelLabel(label) || "model-belirsiz";
    const key = getModelKeyFromLabel(label);
    const group = groups.get(key) ?? { listings: [], label, slug, family: getModelFamily(listing) };
    group.listings.push(listing);
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const prices = group.listings.map((listing) => listing.price).filter((price) => price > 0);
      const buyableCount = group.listings.filter((listing) => getBuyabilityInsight(listing, listings, buyabilityIndex).score >= 74).length;
      const primaryBrand = group.listings.find((listing) => listing.brand !== "Bilinmiyor")?.brand ?? group.listings[0]?.brand ?? "Bilinmiyor";

      return {
        slug: group.slug,
        key,
        label: group.label,
        family: group.family,
        brand: primaryBrand,
        listingCount: group.listings.length,
        buyableCount,
        minPrice: prices.length ? Math.min(...prices) : null,
        medianPrice: median(prices),
        maxPrice: prices.length ? Math.max(...prices) : null,
      };
    })
    .sort((a, b) => b.listingCount - a.listingCount || a.label.localeCompare(b.label, "tr"));
}

export function matchesModelSlug(listing: Pick<CatalogListing, "model" | "title">, slug: string): boolean {
  const label = getModelLabel(listing);
  return getModelSlug(listing) === slug || slugifyModelLabel(stripVramLabel(label)) === slug;
}

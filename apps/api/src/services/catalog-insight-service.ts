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
type ModelListing = Pick<CatalogListing, "model" | "title" | "productType">;

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

function normalizeGpuText(value: string): string {
  return value
    .replace(/[_/]+/g, " ")
    .replace(/[İı]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

function isCpuListing(listing: Pick<CatalogListing, "productType">): boolean {
  return listing.productType === "cpu";
}

export function getCanonicalGpuModel(listing: Pick<CatalogListing, "model" | "title">): string {
  const text = normalizeGpuText(cleanListingText(`${listing.model} ${listing.title}`));
  const vramLabel = getVramLabel(text);

  const nvidiaMatch = text.match(/\b(RTX|GTX|GTS|GT)\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b/i);
  if (nvidiaMatch) {
    const [, prefix, model, modifier] = nvidiaMatch;
    if (prefix && model) {
      return formatGpuModel(prefix, model, modifier, vramLabel);
    }
  }

  const geforceGMatch = text.match(/\bG\s*-?\s*(210)\b/i);
  if (geforceGMatch?.[1]) {
    return formatGpuModel("GT", geforceGMatch[1], undefined, vramLabel);
  }

  const geforceLowEndMatch = text.match(/\bGEFORCE\s*(210)\b/i);
  if (geforceLowEndMatch?.[1]) {
    return formatGpuModel("GT", geforceLowEndMatch[1], undefined, vramLabel);
  }

  const oldGeForceMatch = text.match(/\b([89]\d{3})\s*GT\b/i);
  if (oldGeForceMatch?.[1]) {
    return ["GeForce", oldGeForceMatch[1], "GT", vramLabel].filter(Boolean).join(" ");
  }

  const amdMatch = text.match(/\b(?:RADEON\s+)?(A?X?RX|RX)\s*-?\s*(\d{3,4})\s*(XTX|XT|GRE)?\b/i);
  if (amdMatch) {
    const [, , model, modifier] = amdMatch;
    if (model) {
      return formatGpuModel("RX", model, modifier, vramLabel);
    }
  }

  const vegaMatch = text.match(/\b(?:AMD\s+)?(?:RADEON\s+)?(?:RX\s+)?VEGA\s*(\d{2})\b/i);
  if (vegaMatch?.[1]) {
    return ["RX Vega", vegaMatch[1], vramLabel].filter(Boolean).join(" ");
  }

  const radeonRMatch = text.match(/\b(R[579])\s*-?\s*(\d{3})\b/i);
  if (radeonRMatch?.[1] && radeonRMatch[2]) {
    return [radeonRMatch[1].toUpperCase(), radeonRMatch[2], vramLabel].filter(Boolean).join(" ");
  }

  const radeonHdMatch = text.match(/\b(?:RADEON\s+)?(?:HD|R)\s*-?\s*(\d{4})\b/i);
  if (radeonHdMatch?.[1]) {
    return ["Radeon HD", radeonHdMatch[1], vramLabel].filter(Boolean).join(" ");
  }

  const hasAmdContext = /\b(AMD|ATI|RADEON|SAPPHIRE|POWERCOLOR|POWER\s*COLOR|XFX)\b/.test(text);
  const bareAmdMatch = hasAmdContext
    ? text.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)?\b/i)
    : null;
  if (bareAmdMatch) {
    const [, model, modifier] = bareAmdMatch;
    if (model) {
      return formatGpuModel("RX", model, modifier, vramLabel);
    }
  }

  const bareAmdWithModifierMatch = text.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)\b/i);
  if (bareAmdWithModifierMatch?.[1]) {
    return formatGpuModel("RX", bareAmdWithModifierMatch[1], bareAmdWithModifierMatch[2], vramLabel);
  }

  const bareNvidiaMatch = text.match(
    /\b(10(?:30|50|60|70|80)|16(?:30|50|60)|20(?:60|70|80)|30(?:50|60|70|80|90)|40(?:50|60|70|80|90)|50(?:60|70|80|90))\s*(TI\s*SUPER|TI|SUPER)?\b/i,
  );
  if (bareNvidiaMatch?.[1]) {
    const model = bareNvidiaMatch[1];
    const prefix = Number.parseInt(model, 10) >= 2060 ? "RTX" : "GTX";
    return formatGpuModel(prefix, model, bareNvidiaMatch[2], vramLabel);
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

export function getCanonicalCpuModel(listing: Pick<CatalogListing, "model" | "title">): string {
  const text = normalizeGpuText(cleanListingText(`${listing.model} ${listing.title}`));

  const ryzenMatch = text.match(/\b(?:AMD\s+)?RYZEN\s*([3579])\s*-?\s*(\d{4,5})(X3D|XT|X|G|GE|F)?\b/i);
  if (ryzenMatch?.[1] && ryzenMatch[2]) {
    return ["Ryzen", ryzenMatch[1], `${ryzenMatch[2]}${ryzenMatch[3] ?? ""}`].join(" ");
  }

  const ryzenShortMatch = text.match(
    /\b(?:AMD\s+)?R([3579])\s*-?\s*(\d{4,5})(X3D|XT|X|G|GE|F)?\b(?=.*\b(?:AM[45]|ISLEMCI|CPU|PROCESSOR)\b)/i,
  );
  if (ryzenShortMatch?.[1] && ryzenShortMatch[2]) {
    return ["Ryzen", ryzenShortMatch[1], `${ryzenShortMatch[2]}${ryzenShortMatch[3] ?? ""}`].join(" ");
  }

  const threadripperMatch = text.match(/\b(?:AMD\s+)?(?:RYZEN\s+)?THREADRIPPER\s*(PRO\s*)?(\d{4,5})(WX|X)?\b/i);
  if (threadripperMatch?.[2]) {
    return ["Threadripper", threadripperMatch[1] ? "Pro" : "", `${threadripperMatch[2]}${threadripperMatch[3] ?? ""}`]
      .filter(Boolean)
      .join(" ");
  }

  const coreUltraMatch = text.match(/\b(?:INTEL\s+)?CORE\s+ULTRA\s+([3579])\s*-?\s*(\d{3}[A-Z0-9]*)\b/i);
  if (coreUltraMatch?.[1] && coreUltraMatch[2]) {
    return `Intel Core Ultra ${coreUltraMatch[1]} ${coreUltraMatch[2]}`;
  }

  const coreMatch = text.match(/\b(?:INTEL\s+)?(?:CORE\s+)?I([3579])\s*-?\s*(\d{3,5})([A-Z]{0,3})\b/i);
  if (coreMatch?.[1] && coreMatch[2]) {
    return `Intel Core i${coreMatch[1]}-${coreMatch[2]}${coreMatch[3] ?? ""}`;
  }

  const xeonMatch = text.match(/\b(?:INTEL\s+)?XEON\s+([A-Z]?\d{3,5}[A-Z0-9-]*)\b/i);
  if (xeonMatch?.[1]) {
    return `Intel Xeon ${xeonMatch[1]}`;
  }

  const amdSeriesMatch = text.match(/\b(?:AMD\s+)?A(4|6|8|10|12)\s*-?\s*(\d{3,4})([A-Z]{0,2})\b/i);
  if (amdSeriesMatch?.[1] && amdSeriesMatch[2]) {
    return `AMD A${amdSeriesMatch[1]}-${amdSeriesMatch[2]}${amdSeriesMatch[3] ?? ""}`;
  }

  const athlonMatch = text.match(/\b(?:AMD\s+)?ATHLON\s+(?:X4\s+)?(\d{3,5}[A-Z0-9]*)\b/i);
  if (athlonMatch?.[1]) {
    return `AMD Athlon ${athlonMatch[1]}`;
  }

  const pentiumMatch = text.match(/\b(?:INTEL\s+)?PENTIUM\s+([A-Z]?\d{3,5}[A-Z0-9]*)\b/i);
  if (pentiumMatch?.[1]) {
    return `Intel Pentium ${pentiumMatch[1]}`;
  }

  const celeronMatch = text.match(/\b(?:INTEL\s+)?CELERON\s+([A-Z]?\d{3,5}[A-Z0-9]*)\b/i);
  if (celeronMatch?.[1]) {
    return `Intel Celeron ${celeronMatch[1]}`;
  }

  return "";
}

function getCanonicalModel(listing: ModelListing): string {
  return isCpuListing(listing) ? getCanonicalCpuModel(listing) : getCanonicalGpuModel(listing);
}

export function getModelLabel(listing: ModelListing): string {
  return getCanonicalModel(listing) || cleanListingText(listing.model || listing.title) || "Model belirsiz";
}

export function getModelKeyFromLabel(label: string): string {
  return `model:${label.toLocaleLowerCase("tr-TR")}`;
}

export function getModelKey(listing: ModelListing): string {
  return getModelKeyFromLabel(getModelLabel(listing));
}

function stripVramLabel(label: string): string {
  return label.replace(/\s+\d+\s*GB\b/gi, "").replace(/\s+/g, " ").trim();
}

function getReferenceLabels(listing: Pick<DashboardListing, "model" | "title" | "productType">): string[] {
  const canonical = getCanonicalModel({
    model: listing.model,
    title: listing.title,
    productType: listing.productType,
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

export function getModelSlug(listing: ModelListing): string {
  return slugifyModelLabel(getModelLabel(listing)) || "model-belirsiz";
}

export function getModelFamily(listing: ModelListing): string {
  if (isCpuListing(listing)) {
    const canonicalModel = getCanonicalCpuModel(listing);
    const text = normalizeGpuText(canonicalModel || `${listing.model} ${listing.title}`);
    const ryzenMatch = text.match(/\bRYZEN\s+([3579])\b/);
    const coreUltraMatch = text.match(/\bCORE\s+ULTRA\s+([3579])\b/);
    const coreMatch = text.match(/\bCORE\s+I([3579])\b/);

    if (ryzenMatch?.[1]) return `Ryzen ${ryzenMatch[1]} Serisi`;
    if (coreUltraMatch?.[1]) return `Intel Core Ultra ${coreUltraMatch[1]}`;
    if (coreMatch?.[1]) return `Intel Core i${coreMatch[1]}`;
    if (text.includes("THREADRIPPER")) return "AMD Threadripper";
    if (text.includes("XEON")) return "Intel Xeon";
    if (/\bAMD\s+A(?:4|6|8|10|12)-/.test(text)) return "AMD A Serisi";
    if (text.includes("ATHLON")) return "AMD Athlon";
    if (text.includes("PENTIUM")) return "Intel Pentium";
    if (text.includes("CELERON")) return "Intel Celeron";

    return "Diğer işlemciler";
  }

  const canonicalModel = getCanonicalGpuModel(listing);
  const text = normalizeGpuText(canonicalModel || `${listing.model} ${listing.title}`);
  const rtxMatch = text.match(/\bRTX\s*-?\s*(\d{4})/);
  const gtxMatch = text.match(/\bGTX\s*-?\s*(\d{3,4})/);
  const gtMatch = text.match(/\bGT\s*-?\s*(\d{3,4})/);
  const oldGeForceMatch = text.match(/\bGEFORCE\s+([89]\d{3})\s+GT\b/);
  const rxMatch = text.match(/\bRX\s*-?\s*(\d{3,4})/);
  const radeonRMatch = text.match(/\bR([579])\s*-?\s*(\d{3})/);
  const radeonHdMatch = text.match(/\bRADEON HD\s*-?\s*(\d{4})/);

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

  if (gtMatch) {
    const model = gtMatch[1] ?? "";
    if (model.startsWith("10")) return "GT 1000 Serisi";
    if (model.startsWith("7")) return "GT 700 Serisi";
    if (model.startsWith("6")) return "GT 600 Serisi";
    if (model.startsWith("4")) return "GT 400 Serisi";
    if (model.startsWith("2")) return "GT 200 Serisi";
    return "GeForce GT Serisi";
  }

  if (oldGeForceMatch) {
    const model = oldGeForceMatch[1] ?? "";
    if (model.startsWith("9")) return "GeForce 9000 Serisi";
    if (model.startsWith("8")) return "GeForce 8000 Serisi";
    return "GeForce GT Serisi";
  }

  if (rxMatch) {
    const model = rxMatch[1] ?? "";
    if (model.length === 4) return `RX ${model.charAt(0)}000 Serisi`;
    if (model.startsWith("5")) return "RX 500 Serisi";
    if (model.startsWith("4")) return "RX 400 Serisi";
    return "RX Serisi";
  }

  if (radeonRMatch) {
    return `R${radeonRMatch[1]} ${radeonRMatch[2]?.charAt(0) ?? ""}00 Serisi`;
  }

  if (radeonHdMatch) {
    return `Radeon HD ${radeonHdMatch[1]?.charAt(0) ?? ""}000 Serisi`;
  }

  if (text.includes("VEGA")) {
    return "Radeon Vega";
  }

  if (text.includes("ARC") || /\b[AB]\s*-?\s*\d{3}\b/.test(text)) {
    return "Intel Arc";
  }

  if (text.includes("QUADRO") || text.includes("TESLA") || text.includes("FIREPRO") || text.includes("NVS")) {
    return "Profesyonel GPU";
  }

  return "Diğer modeller";
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

function getLegacyLowPriorityReason(listing: ModelListing): string | null {
  if (isCpuListing(listing)) {
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

function getAmbiguousModelReason(listing: ModelListing): string | null {
  if (isCpuListing(listing)) {
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

export function getModelPriorityScore(listing: ModelListing): number {
  if (isCpuListing(listing)) {
    const text = normalizeGpuText(`${getCanonicalCpuModel(listing)} ${listing.title} ${listing.model}`);

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
  listing: ModelListing,
  insight: Pick<BuyabilityInsight, "score">,
): number {
  return insight.score * 10 + getModelPriorityScore(listing);
}

export function buildBuyabilityIndex(
  listings: readonly CatalogListing[],
  referenceListings: readonly Pick<DashboardListing, "model" | "title" | "fairPrice" | "productType">[] = [],
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

export function matchesModelSlug(listing: ModelListing, slug: string): boolean {
  const label = getModelLabel(listing);
  return getModelSlug(listing) === slug || slugifyModelLabel(stripVramLabel(label)) === slug;
}

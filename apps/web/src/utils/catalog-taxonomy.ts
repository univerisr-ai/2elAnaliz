import type { CatalogListing } from "../types/listing";
import { cleanPublicListingText } from "./display";

export const ALL_CATEGORY_KEY = "all";

export interface CatalogCategoryOption {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

export function getPriceCategoryKey(listing: CatalogListing): string {
  return `price:${listing.segment || "Fiyat belirsiz"}`;
}

export function getPriceCategoryLabel(listing: CatalogListing): string {
  return listing.segment || "Fiyat belirsiz";
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
  const text = cleanPublicListingText(`${listing.model} ${listing.title}`)
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const vramLabel = getVramLabel(text);

  const nvidiaMatch = text.match(/\b(RTX|GTX|GTS|GT)\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b/i);
  if (nvidiaMatch) {
    return formatGpuModel(nvidiaMatch[1], nvidiaMatch[2], nvidiaMatch[3], vramLabel);
  }

  const amdMatch = text.match(/\b(RX)\s*-?\s*(\d{3,4})\s*(XTX|XT|GRE)?\b/i);
  if (amdMatch) {
    return formatGpuModel(amdMatch[1], amdMatch[2], amdMatch[3], vramLabel);
  }

  const intelArcMatch = text.match(/\b(?:ARC\s*)?([AB])\s*-?\s*(\d{3})\b/i);
  if (intelArcMatch) {
    return ["Intel Arc", `${intelArcMatch[1].toUpperCase()}${intelArcMatch[2]}`, vramLabel].filter(Boolean).join(" ");
  }

  return "";
}

export function getModelCategoryLabel(listing: CatalogListing): string {
  return getCanonicalGpuModel(listing) || "Model belirsiz";
}

export function getModelCategoryKey(listing: CatalogListing): string {
  return `model:${getModelCategoryLabel(listing).toLocaleLowerCase("tr-TR")}`;
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
  return slugifyModelLabel(getCanonicalGpuModel(listing) || listing.model || listing.title) || "model-belirsiz";
}

export function getModelFamily(listing: Pick<CatalogListing, "model" | "title">): string {
  const canonicalModel = getCanonicalGpuModel(listing);
  const text = canonicalModel || `${listing.model} ${listing.title}`.toUpperCase();
  const rtxMatch = text.match(/\bRTX\s*-?\s*(\d{4})/);
  const gtxMatch = text.match(/\bGTX\s*-?\s*(\d{3,4})/);
  const rxMatch = text.match(/\bRX\s*-?\s*(\d{3,4})/);

  if (rtxMatch) {
    return `RTX ${rtxMatch[1].slice(0, 2)} Serisi`;
  }

  if (gtxMatch) {
    const model = gtxMatch[1];
    if (model.startsWith("16")) return "GTX 16 Serisi";
    if (model.startsWith("10")) return "GTX 10 Serisi";
    if (model.startsWith("9")) return "GTX 900 Serisi";
    if (model.startsWith("7")) return "GTX 700 Serisi";
    return "GTX Serisi";
  }

  if (rxMatch) {
    const model = rxMatch[1];
    if (model.length === 4) return `RX ${model[0]}000 Serisi`;
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

export function buildCategoryOptions(
  listings: readonly CatalogListing[],
  allLabel: string,
  keyFor: (listing: CatalogListing) => string,
  labelFor: (listing: CatalogListing) => string,
): CatalogCategoryOption[] {
  const counts = new Map<string, CatalogCategoryOption>();

  listings.forEach((listing) => {
    const key = keyFor(listing);
    const current = counts.get(key);

    counts.set(key, {
      key,
      label: current?.label ?? labelFor(listing),
      count: (current?.count ?? 0) + 1,
    });
  });

  return [{ key: ALL_CATEGORY_KEY, label: allLabel, count: listings.length }, ...Array.from(counts.values())];
}

import type { CatalogListing } from "../types/listing";
import { cleanPublicListingText } from "./display";

export const ALL_CATEGORY_KEY = "all";

export interface CatalogCategoryOption {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

type ModelLike = Pick<CatalogListing, "model" | "title"> & Partial<Pick<CatalogListing, "productType">>;

export function getPriceCategoryKey(listing: CatalogListing): string {
  return `price:${listing.segment || "Fiyat belirsiz"}`;
}

export function getPriceCategoryLabel(listing: CatalogListing): string {
  return listing.segment || "Fiyat belirsiz";
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

export function getCanonicalGpuModel(listing: ModelLike): string {
  if (listing.productType === "cpu") {
    return "";
  }

  const text = normalizeGpuText(cleanPublicListingText(`${listing.model} ${listing.title}`));
  const vramLabel = getVramLabel(text);

  const nvidiaMatch = text.match(/\b(RTX|GTX|GTS|GT)\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b/i);
  if (nvidiaMatch) {
    return formatGpuModel(nvidiaMatch[1], nvidiaMatch[2], nvidiaMatch[3], vramLabel);
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
    return formatGpuModel("RX", amdMatch[2], amdMatch[3], vramLabel);
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
    return formatGpuModel("RX", bareAmdMatch[1], bareAmdMatch[2], vramLabel);
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
    return ["Intel Arc", `${intelArcMatch[1].toUpperCase()}${intelArcMatch[2]}`, vramLabel].filter(Boolean).join(" ");
  }

  return "";
}

export function getCanonicalCpuModel(listing: Pick<CatalogListing, "model" | "title">): string {
  const text = normalizeGpuText(cleanPublicListingText(`${listing.model} ${listing.title}`));

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

export function getModelCategoryLabel(listing: CatalogListing): string {
  if (listing.productType === "cpu") {
    return getCanonicalCpuModel(listing) || cleanPublicListingText(listing.model || listing.title) || "Model belirsiz";
  }

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

export function getModelSlug(listing: ModelLike): string {
  const label =
    listing.productType === "cpu"
      ? getCanonicalCpuModel(listing) || listing.model || listing.title
      : getCanonicalGpuModel(listing) || listing.model || listing.title;
  return slugifyModelLabel(label) || "model-belirsiz";
}

export function getModelFamily(listing: ModelLike): string {
  if (listing.productType === "cpu") {
    const cpuText = normalizeGpuText(`${getCanonicalCpuModel(listing)} ${listing.model} ${listing.title}`);
    const ryzenMatch = cpuText.match(/\bRYZEN\s+([3579])\b/);
    if (ryzenMatch?.[1]) {
      return `Ryzen ${ryzenMatch[1]} Serisi`;
    }

    const coreUltraMatch = cpuText.match(/\bCORE\s+ULTRA\s+([3579])\b/);
    if (coreUltraMatch?.[1]) {
      return `Intel Core Ultra ${coreUltraMatch[1]}`;
    }

    const coreMatch = cpuText.match(/\bCORE\s+I([3579])\b/);
    if (coreMatch?.[1]) {
      return `Intel Core i${coreMatch[1]}`;
    }

    if (cpuText.includes("THREADRIPPER")) return "AMD Threadripper";
    if (cpuText.includes("XEON")) return "Intel Xeon";
    if (/\bAMD\s+A(?:4|6|8|10|12)-/.test(cpuText)) return "AMD A Serisi";
    if (cpuText.includes("ATHLON")) return "AMD Athlon";
    if (cpuText.includes("PENTIUM")) return "Intel Pentium";
    if (cpuText.includes("CELERON")) return "Intel Celeron";
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

  if (gtMatch) {
    const model = gtMatch[1];
    if (model.startsWith("10")) return "GT 1000 Serisi";
    if (model.startsWith("7")) return "GT 700 Serisi";
    if (model.startsWith("6")) return "GT 600 Serisi";
    if (model.startsWith("4")) return "GT 400 Serisi";
    if (model.startsWith("2")) return "GT 200 Serisi";
    return "GeForce GT Serisi";
  }

  if (oldGeForceMatch) {
    const model = oldGeForceMatch[1];
    if (model.startsWith("9")) return "GeForce 9000 Serisi";
    if (model.startsWith("8")) return "GeForce 8000 Serisi";
    return "GeForce GT Serisi";
  }

  if (rxMatch) {
    const model = rxMatch[1];
    if (model.length === 4) return `RX ${model[0]}000 Serisi`;
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

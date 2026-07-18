import fs from "node:fs/promises";
import path from "node:path";
import { CATALOG_IMAGE_FALLBACK } from "../data/catalog-image-fallback.js";
import { CATALOG_GENERATED_AT, CATALOG_SEED } from "../data/catalog-seed.js";
import type {
  DashboardBrand,
  CatalogListing,
  DashboardListing,
  DashboardRefreshLogEntry,
  DashboardSnapshot,
  DashboardSummary,
} from "./dashboard-types.js";

export type CatalogImageFallback = (typeof CATALOG_IMAGE_FALLBACK)[number];

const DATA_DIRS = Array.from(
  new Set([
    path.resolve(__dirname, "../data"),
    path.resolve(process.cwd(), "apps/api/dist/data"),
    path.resolve(process.cwd(), "apps/api/src/data"),
    path.resolve(process.cwd(), "src/data"),
  ]),
);
const WRITE_DATA_DIR = DATA_DIRS[0] ?? path.resolve(process.cwd(), "data");
const SNAPSHOT_FILE = "dashboard-summary-cache.json";
const REFRESH_LOG_FILE = "dashboard-refresh-log.json";
const CATALOG_FILE = "catalog-cache.json";

const emptyRunMeta = {
  inputFile: null,
  sourceRepository: null,
  scraperRunId: null,
  scraperRunUrl: null,
  scraperArtifactName: null,
  scrapeStatus: null,
  listingCountFromScraper: CATALOG_SEED.length,
  startedAt: null,
  finishedAt: null,
  pipelineMessage: "Katalog verisi hazır.",
  isFallback: false,
  analyzerRepository: null,
  analyzerRunId: null,
  analyzerRunUrl: null,
  deployedAt: null,
  deployTarget: "production",
  deployProjectName: null,
  dashboardVersion: "public-seed",
};

const SNAPSHOT_SEED: DashboardSnapshot = {
  fetchedAt: CATALOG_GENERATED_AT,
  source: "local_file",
  summary: {
    analysisCompleted: true,
    generatedAt: CATALOG_GENERATED_AT,
    listingCount: CATALOG_SEED.length,
    recognizedModelCount: new Set(CATALOG_SEED.map((listing) => listing.model).filter(Boolean)).size,
    candidateCount: CATALOG_SEED.length,
    topCandidates: [],
    expertSummary: "Katalog verisi public beta için hazır.",
    pipelineMessages: [],
    runMeta: emptyRunMeta,
  },
};

const EMBEDDED_JSON: Record<string, unknown> = {
  [SNAPSHOT_FILE]: SNAPSHOT_SEED,
  [REFRESH_LOG_FILE]: [],
  [CATALOG_FILE]: CATALOG_SEED,
};

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(WRITE_DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  for (const dataDir of DATA_DIRS) {
    try {
      const content = await fs.readFile(path.join(dataDir, fileName), "utf-8");
      return JSON.parse(content) as T;
    } catch {
      // Try the next packaged data location.
    }
  }

  if (Object.prototype.hasOwnProperty.call(EMBEDDED_JSON, fileName)) {
    return JSON.parse(JSON.stringify(EMBEDDED_JSON[fileName])) as T;
  }

  return fallback;
}

async function writeJsonFile(fileName: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(WRITE_DATA_DIR, fileName);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

function detectBrand(text: string): DashboardBrand {
  const upper = normalizeGpuText(text);
  const model = normalizeGpuText(normalizeModel(upper));

  if (/^(?:RTX|GTX|GTS|GT|GEFORCE|NVS)\b/.test(model) || upper.includes("QUADRO") || upper.includes("TITAN")) {
    return "NVIDIA";
  }

  if (
    /^(?:RX|R[579]|RADEON HD)\b/.test(model) ||
    model.includes("VEGA") ||
    upper.includes("RADEON") ||
    upper.includes("VEGA") ||
    /\b(?:A?X?RX|RX)\s*-?\s*\d{3,4}\b/.test(upper) ||
    (/\b(?:AMD|ATI|SAPPHIRE|POWERCOLOR|POWER\s*COLOR|XFX)\b/.test(upper) &&
      /\b(?:4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(?:XTX|XT|GRE)?\b/.test(upper))
  ) {
    return "AMD";
  }

  if (upper.includes("ARC") || upper.includes("A770") || upper.includes("A750") || upper.includes("A580")) {
    return "Intel";
  }

  return "Bilinmiyor";
}

function normalizeProductType(value: unknown): CatalogListing["productType"] | "" {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("tr-TR");
  if (!normalized) {
    return "";
  }

  if (/(^|[^a-z])(?:cpu|islemci|işlemci|processor|processors)(?:$|[^a-z])/.test(normalized)) {
    return "cpu";
  }

  if (/(^|[^a-z])(?:gpu|ekran\s*karti|ekran\s*kartı|graphics?\s*card)(?:$|[^a-z])/.test(normalized)) {
    return "gpu";
  }

  return "";
}

function inferProductType(listing: RawCatalogListingInput): CatalogListing["productType"] {
  const fields = [
    listing.productType,
    listing.product_type,
    listing.product,
    listing.productLabel,
    listing.category,
    listing.categoryName,
    listing.categoryUrl,
    listing.sourceCategoryUrl,
    listing.url,
  ];

  for (const field of fields) {
    const productType = normalizeProductType(field);
    if (productType) {
      return productType;
    }
  }

  return "gpu";
}

function detectCpuBrand(text: string): DashboardBrand {
  const upper = normalizeGpuText(text);

  if (/\b(?:AMD|RYZEN|THREADRIPPER|ATHLON|EPYC)\b/.test(upper)) {
    return "AMD";
  }

  if (/\b(?:INTEL|CORE\s+ULTRA|CORE\s+I[3579]|I[3579]\s*-?\s*\d|XEON|PENTIUM|CELERON)\b/.test(upper)) {
    return "Intel";
  }

  return "Bilinmiyor";
}

function normalizeCpuModel(title: string): string {
  const upper = normalizeGpuText(title);

  const ryzenMatch = upper.match(/\b(?:AMD\s+)?RYZEN\s*([3579])\s*-?\s*(\d{4,5})(X3D|XT|X|G|GE|F)?\b/);
  if (ryzenMatch?.[1] && ryzenMatch[2]) {
    return ["Ryzen", ryzenMatch[1], `${ryzenMatch[2]}${ryzenMatch[3] ?? ""}`].join(" ");
  }

  const threadripperMatch = upper.match(/\b(?:AMD\s+)?(?:RYZEN\s+)?THREADRIPPER\s*(PRO\s*)?(\d{4,5})(WX|X)?\b/);
  if (threadripperMatch?.[2]) {
    return ["Threadripper", threadripperMatch[1] ? "Pro" : "", `${threadripperMatch[2]}${threadripperMatch[3] ?? ""}`]
      .filter(Boolean)
      .join(" ");
  }

  const coreUltraMatch = upper.match(/\b(?:INTEL\s+)?CORE\s+ULTRA\s+([3579])\s*-?\s*(\d{3}[A-Z0-9]*)\b/);
  if (coreUltraMatch?.[1] && coreUltraMatch[2]) {
    return `Intel Core Ultra ${coreUltraMatch[1]} ${coreUltraMatch[2]}`;
  }

  const coreMatch = upper.match(/\b(?:INTEL\s+)?(?:CORE\s+)?I([3579])\s*-?\s*(\d{3,5})([A-Z]{0,3})\b/);
  if (coreMatch?.[1] && coreMatch[2]) {
    return `Intel Core i${coreMatch[1]}-${coreMatch[2]}${coreMatch[3] ?? ""}`;
  }

  const xeonMatch = upper.match(/\b(?:INTEL\s+)?XEON\s+([A-Z]?\d{3,5}[A-Z0-9-]*)\b/);
  if (xeonMatch?.[1]) {
    return `Intel Xeon ${xeonMatch[1]}`;
  }

  return title.trim();
}

function normalizeListingModel(title: string, productType: CatalogListing["productType"]): string {
  return productType === "cpu" ? normalizeCpuModel(title) : normalizeModel(title);
}

function detectListingBrand(text: string, productType: CatalogListing["productType"]): DashboardBrand {
  return productType === "cpu" ? detectCpuBrand(text) : detectBrand(text);
}

function normalizeGpuText(value: string): string {
  return value
    .replace(/[_/]+/g, " ")
    .replace(/[İı]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeModel(title: string): string {
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
      const normalized = match[0]
        .replace(/\b(?:RADEON\s+)?A?X?RX\b/i, "RX")
        .replace(/\bG\s*-?\s*210\b/i, "GT 210")
        .replace(/\bGEFORCE\s*210\b/i, "GT 210")
        .replace(/\b([89]\d{3})\s*GT\b/i, "GeForce $1 GT")
        .replace(/\b(?:AMD\s+)?(?:RADEON\s+)?(?:RX\s+)?VEGA\s*(\d{2})\b/i, "RX Vega $1")
        .replace(/\b(?:RADEON\s+)?(?:HD|R)\s*-?\s*(\d{4})\b/i, "Radeon HD $1")
        .replace(/\s+/g, " ")
        .trim();
      return normalized;
    }
  }

  if (/\b(?:AMD|ATI|RADEON|SAPPHIRE|POWERCOLOR|POWER\s*COLOR|XFX)\b/.test(upper)) {
    const bareAmdMatch = upper.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)?\b/);
    if (bareAmdMatch?.[1]) {
      return ["RX", bareAmdMatch[1], bareAmdMatch[2] || ""].filter(Boolean).join(" ");
    }
  }

  const bareAmdWithModifierMatch = upper.match(/\b(4[6-9]0|5[5-9]0|6[4-9]\d{2}|7[0-9]\d{2}|90[6-7]0)\s*(XTX|XT|GRE)\b/);
  if (bareAmdWithModifierMatch?.[1]) {
    return ["RX", bareAmdWithModifierMatch[1], bareAmdWithModifierMatch[2] || ""].filter(Boolean).join(" ");
  }

  const bareNvidiaMatch = upper.match(
    /\b(10(?:30|50|60|70|80)|16(?:30|50|60)|20(?:60|70|80)|30(?:50|60|70|80|90)|40(?:50|60|70|80|90)|50(?:60|70|80|90))\s*(TI\s*SUPER|TI|SUPER)?\b/,
  );
  if (bareNvidiaMatch?.[1]) {
    const prefix = Number.parseInt(bareNvidiaMatch[1], 10) >= 2060 ? "RTX" : "GTX";
    return [prefix, bareNvidiaMatch[1], bareNvidiaMatch[2] || ""].filter(Boolean).join(" ");
  }

  return title.trim();
}

function normalizeLocation(location: string): string {
  return location
    .trim()
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, "$1 / $2")
    .replace(/\s+/g, " ");
}

/*
 * Fiyattan segment etiketi üretir ("5.000-5.500 TL" formatı, scraper'larla aynı dil).
 * "Arsiv" yalnızca fiyatı olmayan kayıtlara kalır: segmentsiz kaynakların (Dolap,
 * Letgo, Donanım Haber) canlı ilanlarını arşiv sanma hatasının kalıcı çözümü.
 * İkizi: scripts/prepare-api-dashboard-cache.mjs içindeki deriveSegment.
 */
function segmentFromPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) {
    return "Arsiv";
  }
  const width =
    price < 1000 ? 250 : price < 10000 ? 500 : price < 20000 ? 1000 : price < 30000 ? 2500 : price < 50000 ? 5000 : 10000;
  const lo = Math.floor(price / width) * width;
  return `${lo.toLocaleString("tr-TR")}-${(lo + width).toLocaleString("tr-TR")} TL`;
}

function deriveSegment(rawSegment: string | undefined, price: number): string {
  const segment = rawSegment?.trim() ?? "";
  if (segment && !/^ar[sş][iı]v$/i.test(segment)) {
    return segment;
  }
  return segmentFromPrice(price);
}

function detectSource(url: string | undefined): "Sahibinden" | "Letgo" | "Dolap" | "Donanim Haber" | "Facebook" | "Technopat" | "Techolay" | "Harici" {
  const value = url?.toLowerCase() ?? "";

  if (value.includes("letgo")) {
    return "Letgo";
  }

  if (value.includes("dolap")) {
    return "Dolap";
  }

  if (value.includes("donanimhaber")) {
    return "Donanim Haber";
  }

  if (value.includes("facebook.com") || value.includes("fb.com")) {
    return "Facebook";
  }

  if (value.includes("technopat.net")) {
    return "Technopat";
  }

  if (value.includes("techolay.net")) {
    return "Techolay";
  }

  if (value.includes("sahibinden") || value.includes("shbdn.com")) {
    return "Sahibinden";
  }

  return "Harici";
}

function detectSourceType(
  url: string | undefined,
  source: CatalogListing["source"],
): CatalogListing["sourceType"] {
  const value = `${url ?? ""} ${source}`.toLowerCase();

  if (value.includes("letgo")) return "letgo";
  if (value.includes("dolap")) return "dolap";
  if (value.includes("donanimhaber") || value.includes("donanim haber")) return "donanimhaber";
  if (value.includes("facebook") || value.includes("fb.com")) return "facebook";
  if (value.includes("technopat") || value.includes("techolay") || value.includes("forum")) return "forum";
  if (value.includes("sahibinden") || value.includes("shbdn.com")) return "sahibinden";
  if (value.includes("pecid") || value.includes("gpu pusula")) return "pecid";
  return "external";
}

export function isCatalogNoiseListing(listing: Pick<CatalogListing, "title" | "model" | "productType">): boolean {
  const text = `${listing.title} ${listing.model}`
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");

  if (listing.productType === "cpu") {
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

function toListingId(modelKey: string, price: number, index: number): string {
  const safeKey = modelKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeKey || "gpu"}-${price || 0}-${index + 1}`;
}

function imageUrlFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = imageUrlFromUnknown(item);
      if (imageUrl) {
        return imageUrl;
      }
    }
    return "";
  }

  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["url", "src", "imageUrl", "image_url", "thumbnailUrl", "thumbnail", "photoUrl", "photo"]) {
      const imageUrl = imageUrlFromUnknown(candidate[key]);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  return "";
}

export function pickRawListingImageUrl(listing: Record<string, unknown>): string | null {
  for (const key of [
    "resim",
    "imageUrl",
    "image",
    "img",
    "thumbnail",
    "thumbnailUrl",
    "photo",
    "photoUrl",
    "image_url",
    "coverImageUrl",
    "cover_image_url",
    "images",
    "imageUrls",
    "photos",
  ]) {
    const imageUrl = imageUrlFromUnknown(listing[key]);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

interface RawCatalogListingInput {
  readonly [key: string]: unknown;
  readonly ilan_id?: string;
  readonly id?: string;
  readonly sourceListingId?: string;
  readonly baslik?: string;
  readonly title?: string;
  readonly model?: string;
  readonly modelName?: string;
  readonly modelKey?: string;
  readonly gpuModel?: string;
  readonly fiyat?: number;
  readonly price?: number;
  readonly fiyat_str?: string;
  readonly priceText?: string;
  readonly konum?: string;
  readonly location?: string;
  readonly tarih?: string;
  readonly listedAtLabel?: string;
  readonly listedAt?: string;
  readonly url?: string;
  readonly resim?: string | null;
  readonly imageUrl?: string | null;
  readonly segment?: string;
  readonly source?: string;
  readonly sourceType?: CatalogListing["sourceType"];
  readonly productType?: CatalogListing["productType"] | string;
  readonly product_type?: string;
  readonly product?: string;
  readonly productLabel?: string;
  readonly category?: string;
  readonly categoryName?: string;
  readonly categoryUrl?: string;
  readonly sourceCategoryUrl?: string;
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  return readJsonFile<DashboardSnapshot | null>(SNAPSHOT_FILE, null);
}

export async function saveDashboardSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  await writeJsonFile(SNAPSHOT_FILE, snapshot);
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  const snapshot = await getDashboardSnapshot();
  return snapshot?.summary ?? null;
}

export async function getDashboardLastUpdated(): Promise<string> {
  const snapshot = await getDashboardSnapshot();
  return snapshot?.summary.generatedAt ?? snapshot?.fetchedAt ?? "";
}

export async function getDashboardListings(): Promise<DashboardListing[]> {
  const summary = await getDashboardSummary();
  if (!summary) {
    return [];
  }

  return summary.topCandidates.map((candidate, index) => ({
    id: toListingId(candidate.modelKey || candidate.title, candidate.price, index),
    title: candidate.title,
    model: candidate.modelKey || candidate.title,
    brand: detectBrand(`${candidate.modelKey} ${candidate.title}`),
    price: candidate.price,
    fairPrice: candidate.fairPrice,
    discountPercent: Math.round(Math.max(0, candidate.discountRatio) * 1000) / 10,
    confidencePercent: Math.round(Math.max(0, candidate.confidence) * 1000) / 10,
    url: candidate.url,
    analysisNote: candidate.analysisNote,
    listedAt: summary.generatedAt ?? new Date().toISOString(),
    source: detectSource(candidate.url),
    productType: "gpu",
    imageUrl: candidate.imageUrl ?? null,
  }));
}

export async function getCatalogListings(): Promise<CatalogListing[]> {
  return readJsonFile<CatalogListing[]>(CATALOG_FILE, []);
}

export function getEmbeddedCatalogListings(): CatalogListing[] {
  return CATALOG_SEED.map((listing) => ({ ...listing }));
}

export function getCatalogImageFallbacks(): readonly CatalogImageFallback[] {
  return CATALOG_IMAGE_FALLBACK;
}

export async function saveCatalogListings(listings: readonly CatalogListing[]): Promise<void> {
  await writeJsonFile(CATALOG_FILE, listings);
}

export function mapRawCatalogListing(
  listing: RawCatalogListingInput,
  index: number,
): CatalogListing {
  const title = listing.baslik?.trim() || listing.title?.trim() || "Baslik bulunamadi";
  const productType = inferProductType(listing);
  const explicitModel =
    listing.modelName?.trim() ||
    listing.model?.trim() ||
    listing.modelKey?.trim() ||
    listing.gpuModel?.trim() ||
    "";
  const model = explicitModel ? normalizeListingModel(explicitModel, productType) : normalizeListingModel(title, productType);
  const price = Number.isFinite(listing.fiyat) ? Number(listing.fiyat) : Number.isFinite(listing.price) ? Number(listing.price) : 0;
  const detectedSource = detectSource(listing.url);
  const source =
    listing.source?.trim() ||
    (listing.sourceType === "dolap"
      ? "Dolap"
      : listing.sourceType === "facebook"
        ? "Facebook"
        : listing.sourceType === "forum" && detectedSource === "Harici"
          ? "Forum"
          : detectedSource);
  const sourceType = listing.sourceType ?? detectSourceType(listing.url, source as CatalogListing["source"]);

  return {
    id: listing.ilan_id?.trim() || listing.id?.trim() || listing.sourceListingId?.trim() || toListingId(model || title, price, index),
    title,
    model,
    brand: detectListingBrand(`${model} ${title}`, productType),
    price,
    priceText: listing.fiyat_str?.trim() || listing.priceText?.trim() || `${price.toLocaleString("tr-TR")} TL`,
    url: listing.url?.trim() || "#",
    imageUrl: pickRawListingImageUrl(listing) || null,
    location: normalizeLocation(listing.konum || listing.location || "Konum yok"),
    segment: deriveSegment(listing.segment, price),
    listedAtLabel: listing.tarih?.trim() || listing.listedAtLabel?.trim() || listing.listedAt?.trim() || "Tarih yok",
    source: source as CatalogListing["source"],
    sourceType,
    productType,
  };
}

export async function logDashboardRefresh(snapshot: DashboardSnapshot): Promise<void> {
  const logs = await readJsonFile<DashboardRefreshLogEntry[]>(REFRESH_LOG_FILE, []);

  logs.unshift({
    syncedAt: snapshot.fetchedAt,
    source: snapshot.source,
    candidateCount: snapshot.summary.candidateCount,
    listingCount: snapshot.summary.listingCount,
    analyzerRunId: snapshot.summary.runMeta.analyzerRunId,
    message: snapshot.summary.runMeta.pipelineMessage || "Dashboard verisi yenilendi.",
  });

  await writeJsonFile(REFRESH_LOG_FILE, logs.slice(0, 100));
}

export async function getDashboardRefreshLogs(): Promise<DashboardRefreshLogEntry[]> {
  return readJsonFile<DashboardRefreshLogEntry[]>(REFRESH_LOG_FILE, []);
}

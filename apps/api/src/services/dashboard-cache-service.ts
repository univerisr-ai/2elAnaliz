import fs from "node:fs/promises";
import path from "node:path";
import { CATALOG_GENERATED_AT, CATALOG_SEED } from "../data/catalog-seed.js";
import type {
  DashboardBrand,
  CatalogListing,
  DashboardListing,
  DashboardRefreshLogEntry,
  DashboardSnapshot,
  DashboardSummary,
} from "./dashboard-types.js";

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
  const upper = text.toUpperCase();

  if (upper.includes("RTX") || upper.includes("GTX") || upper.includes("QUADRO") || upper.includes("TITAN")) {
    return "NVIDIA";
  }

  if (upper.includes("RADEON") || upper.includes(" RX ") || upper.startsWith("RX ") || upper.includes("VEGA")) {
    return "AMD";
  }

  if (upper.includes("ARC") || upper.includes("A770") || upper.includes("A750") || upper.includes("A580")) {
    return "Intel";
  }

  return "Bilinmiyor";
}

function normalizeModel(title: string): string {
  const upper = title.toUpperCase();
  const patterns = [
    /\bQUADRO RTX(?:\s+[A-Z0-9-]+)?\b/,
    /\bRTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bGTX\s+\d{3,4}\s*(?:TI|SUPER)?\b/,
    /\bRX\s+\d{3,4}\s*(?:XT|XTX)?\b/,
    /\bARC\s+[A-Z]?\d{3,4}\b/,
    /\bTITAN(?:\s+[A-Z0-9-]+)?\b/,
  ];

  for (const pattern of patterns) {
    const match = upper.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }

  return title.trim();
}

function normalizeLocation(location: string): string {
  return location
    .trim()
    .replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, "$1 / $2")
    .replace(/\s+/g, " ");
}

function detectSource(url: string | undefined): "Sahibinden" | "Letgo" | "Harici" {
  const value = url?.toLowerCase() ?? "";

  if (value.includes("letgo")) {
    return "Letgo";
  }

  if (value.includes("sahibinden") || value.includes("shbdn.com")) {
    return "Sahibinden";
  }

  return "Harici";
}

function toListingId(modelKey: string, price: number, index: number): string {
  const safeKey = modelKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeKey || "gpu"}-${price || 0}-${index + 1}`;
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
    imageUrl: candidate.imageUrl ?? null,
  }));
}

export async function getCatalogListings(): Promise<CatalogListing[]> {
  return readJsonFile<CatalogListing[]>(CATALOG_FILE, []);
}

export async function saveCatalogListings(listings: readonly CatalogListing[]): Promise<void> {
  await writeJsonFile(CATALOG_FILE, listings);
}

export function mapRawCatalogListing(
  listing: {
    readonly ilan_id?: string;
    readonly baslik?: string;
    readonly fiyat?: number;
    readonly fiyat_str?: string;
    readonly konum?: string;
    readonly tarih?: string;
    readonly url?: string;
    readonly resim?: string | null;
    readonly segment?: string;
  },
  index: number,
): CatalogListing {
  const title = listing.baslik?.trim() || "Baslik bulunamadi";
  const model = normalizeModel(title);
  const price = Number.isFinite(listing.fiyat) ? Number(listing.fiyat) : 0;

  return {
    id: listing.ilan_id?.trim() || toListingId(model || title, price, index),
    title,
    model,
    brand: detectBrand(`${model} ${title}`),
    price,
    priceText: listing.fiyat_str?.trim() || `${price.toLocaleString("tr-TR")} TL`,
    url: listing.url?.trim() || "#",
    imageUrl: listing.resim?.trim() || null,
    location: normalizeLocation(listing.konum || "Konum yok"),
    segment: listing.segment?.trim() || "Arsiv",
    listedAtLabel: listing.tarih?.trim() || "Tarih yok",
    source: detectSource(listing.url),
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

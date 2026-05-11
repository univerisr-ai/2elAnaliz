/**
 * Data Servisi — Parse edilen GPU ilanlarını dosya bazlı saklar ve sunar.
 * Veritabanı gerekene kadar JSON dosya tabanlı basit depolama kullanılır.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedGpuListing, AnalysisSummary } from "./parser-service.js";

// Verilerin saklanacağı dosya yolları
const DATA_DIR = path.resolve(process.cwd(), "src/data");
const LISTINGS_FILE = path.join(DATA_DIR, "listings.json");
const SUMMARY_FILE = path.join(DATA_DIR, "summary.json");
const SYNC_LOG_FILE = path.join(DATA_DIR, "sync-log.json");

interface SyncLogEntry {
  readonly syncedAt: string;
  readonly newListings: number;
  readonly totalListings: number;
  readonly source: string;
}

interface StoredData {
  listings: ParsedGpuListing[];
  lastUpdated: string;
}

interface StoredSummary {
  summary: AnalysisSummary;
  lastUpdated: string;
}

/**
 * Data klasörünün var olduğunu garanti eder.
 */
async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * JSON dosyasını güvenli bir şekilde okur. Dosya yoksa fallback değeri döner.
 */
async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

/**
 * JSON dosyasına atomik yazma (önce temp dosyaya yaz, sonra rename et).
 */
async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

// ── Public API ──

/**
 * Mevcut tüm GPU ilanlarını getirir.
 */
export async function getAllListings(): Promise<ParsedGpuListing[]> {
  const data = await readJsonFile<StoredData>(LISTINGS_FILE, {
    listings: [],
    lastUpdated: "",
  });
  return data.listings;
}

/**
 * Son analiz özetini getirir.
 */
export async function getSummary(): Promise<AnalysisSummary | null> {
  const data = await readJsonFile<StoredSummary | null>(SUMMARY_FILE, null);
  return data?.summary ?? null;
}

/**
 * Son sync zamanını döner.
 */
export async function getLastSyncTime(): Promise<string> {
  const data = await readJsonFile<StoredData>(LISTINGS_FILE, {
    listings: [],
    lastUpdated: "",
  });
  return data.lastUpdated;
}

/**
 * Yeni GPU ilanlarını mevcut verilere ekler.
 * URL bazlı deduplication uygular — aynı ilan iki kez eklenmez.
 */
export async function saveListings(newListings: ParsedGpuListing[]): Promise<number> {
  const existing = await getAllListings();

  // URL bazlı deduplication
  const existingUrls = new Set(existing.map((l) => l.url));
  const uniqueNew = newListings.filter((l) => l.url && !existingUrls.has(l.url));

  if (uniqueNew.length === 0) {
    console.log("[DATA] ℹ️ Yeni benzersiz ilan yok, kayıt atlandı");
    return 0;
  }

  // Yeni ilanları başa ekle (en yeniler üstte)
  const merged = [...uniqueNew, ...existing];

  // Maksimum 5000 ilan tut (eski ilanları kes)
  const MAX_LISTINGS = 5000;
  const trimmed = merged.slice(0, MAX_LISTINGS);

  await writeJsonFile(LISTINGS_FILE, {
    listings: trimmed,
    lastUpdated: new Date().toISOString(),
  } satisfies StoredData);

  console.log(`[DATA] 💾 ${uniqueNew.length} yeni ilan kaydedildi (toplam: ${trimmed.length})`);
  return uniqueNew.length;
}

/**
 * Analiz özetini günceller.
 */
export async function saveSummary(summary: AnalysisSummary): Promise<void> {
  await writeJsonFile(SUMMARY_FILE, {
    summary,
    lastUpdated: new Date().toISOString(),
  } satisfies StoredSummary);
  console.log("[DATA] 📋 Analiz özeti güncellendi");
}

/**
 * Sync loguna yeni giriş ekler.
 */
export async function logSync(newCount: number, totalCount: number): Promise<void> {
  const logs = await readJsonFile<SyncLogEntry[]>(SYNC_LOG_FILE, []);

  logs.unshift({
    syncedAt: new Date().toISOString(),
    newListings: newCount,
    totalListings: totalCount,
    source: "Telegram",
  });

  // Son 100 log kaydını tut
  const trimmed = logs.slice(0, 100);
  await writeJsonFile(SYNC_LOG_FILE, trimmed);
}

/**
 * Sync loglarını getirir.
 */
export async function getSyncLogs(): Promise<SyncLogEntry[]> {
  return readJsonFile<SyncLogEntry[]>(SYNC_LOG_FILE, []);
}

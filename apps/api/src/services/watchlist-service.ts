import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSupabaseConfigured } from "../config/env.js";
import { isLocalDevUserId } from "./local-dev-auth-service.js";
import { getSupabaseAdmin } from "./supabase-service.js";

export interface WatchlistRecord {
  readonly userId: string;
  readonly listingId: string;
  readonly alertPrice: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface LocalWatchlistData {
  readonly records: WatchlistRecord[];
}

function getDefaultStorePath(): string {
  return path.resolve(process.cwd(), ".local-dev/watchlist.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function shouldFallbackToLocalStore(error: unknown): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "SUPABASE_NOT_CONFIGURED" ||
    message.includes("fetch failed") ||
    message.includes("getaddrinfo") ||
    message.includes("ENOTFOUND") ||
    message.includes("Failed to fetch") ||
    message.startsWith("[ENV]")
  );
}

async function supabaseOrLocal<T>(supabaseAction: () => Promise<T>, localAction: () => Promise<T>): Promise<T> {
  try {
    return await supabaseAction();
  } catch (error) {
    if (shouldFallbackToLocalStore(error)) {
      console.warn("[WATCHLIST] Supabase erisilemedi, yerel takip deposu kullaniliyor:", error);
      return localAction();
    }

    throw error;
  }
}

async function readLocalData(storePath = getDefaultStorePath()): Promise<LocalWatchlistData> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalWatchlistData>;
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [] };
    }
    throw error;
  }
}

async function writeLocalData(data: LocalWatchlistData, storePath = getDefaultStorePath()): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function mapWatchlistRow(row: Record<string, unknown>): WatchlistRecord {
  return {
    userId: String(row.user_id),
    listingId: String(row.listing_id),
    alertPrice: row.alert_price == null ? null : Number(row.alert_price),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function listLocalWatchlist(userId: string): Promise<WatchlistRecord[]> {
  const data = await readLocalData();
  return data.records
    .filter((record) => record.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((record) => clone(record));
}

async function upsertLocalWatchlist(userId: string, listingId: string, alertPrice: number | null): Promise<WatchlistRecord> {
  const data = await readLocalData();
  const existingIndex = data.records.findIndex((record) => record.userId === userId && record.listingId === listingId);
  const timestamp = nowIso();
  const existing = existingIndex >= 0 ? data.records[existingIndex] : null;
  const record: WatchlistRecord = {
    userId,
    listingId,
    alertPrice,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const records = [...data.records];
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.unshift(record);
  }

  await writeLocalData({ records });
  return clone(record);
}

async function deleteLocalWatchlist(userId: string, listingId: string): Promise<void> {
  const data = await readLocalData();
  await writeLocalData({
    records: data.records.filter((record) => !(record.userId === userId && record.listingId === listingId)),
  });
}

export async function listWatchlistForUser(userId: string): Promise<WatchlistRecord[]> {
  if (isLocalDevUserId(userId) || !isSupabaseConfigured()) {
    return listLocalWatchlist(userId);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("user_watchlist")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new Error(`WATCHLIST_FETCH_FAILED:${error.message}`);
      }

      return (data ?? []).map((row) => mapWatchlistRow(row as Record<string, unknown>));
    },
    () => listLocalWatchlist(userId),
  );
}

export async function upsertWatchlistItem(userId: string, listingId: string, alertPrice: number | null): Promise<WatchlistRecord> {
  if (isLocalDevUserId(userId) || !isSupabaseConfigured()) {
    return upsertLocalWatchlist(userId, listingId, alertPrice);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("user_watchlist")
        .upsert(
          {
            user_id: userId,
            listing_id: listingId,
            alert_price: alertPrice,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,listing_id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`WATCHLIST_UPSERT_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapWatchlistRow(data as Record<string, unknown>);
    },
    () => upsertLocalWatchlist(userId, listingId, alertPrice),
  );
}

export async function deleteWatchlistItem(userId: string, listingId: string): Promise<void> {
  if (isLocalDevUserId(userId) || !isSupabaseConfigured()) {
    await deleteLocalWatchlist(userId, listingId);
    return;
  }

  await supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { error } = await client.from("user_watchlist").delete().eq("user_id", userId).eq("listing_id", listingId);

      if (error) {
        throw new Error(`WATCHLIST_DELETE_FAILED:${error.message}`);
      }
    },
    () => deleteLocalWatchlist(userId, listingId),
  );
}

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "src/data");
const REMOVED_CATALOG_FILE = path.join(DATA_DIR, "catalog-removed-listings.json");

interface RemovedCatalogListing {
  readonly id: string;
  readonly removedAt: string;
}

interface RemovedCatalogStore {
  readonly listings: RemovedCatalogListing[];
}

function normalizeListingId(id: string): string {
  return id.trim().slice(0, 160);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<RemovedCatalogStore> {
  try {
    const content = await fs.readFile(REMOVED_CATALOG_FILE, "utf-8");
    const parsed = JSON.parse(content) as Partial<RemovedCatalogStore> | string[];

    if (Array.isArray(parsed)) {
      return {
        listings: parsed
          .map((id) => normalizeListingId(String(id)))
          .filter(Boolean)
          .map((id) => ({ id, removedAt: new Date(0).toISOString() })),
      };
    }

    return {
      listings: Array.isArray(parsed.listings)
        ? parsed.listings
            .map((listing) => ({
              id: normalizeListingId(String(listing.id ?? "")),
              removedAt: String(listing.removedAt ?? new Date().toISOString()),
            }))
            .filter((listing) => listing.id)
        : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("[CATALOG] Kaldirilan ilan listesi okunamadi:", error);
    }

    return { listings: [] };
  }
}

async function writeStore(store: RemovedCatalogStore): Promise<void> {
  await ensureDataDir();
  const tempPath = `${REMOVED_CATALOG_FILE}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, REMOVED_CATALOG_FILE);
}

export async function listRemovedCatalogListingIds(): Promise<Set<string>> {
  const store = await readStore();
  return new Set(store.listings.map((listing) => listing.id));
}

export async function removeCatalogListing(listingId: string): Promise<RemovedCatalogListing> {
  const id = normalizeListingId(listingId);
  if (!id) {
    throw new Error("INVALID_LISTING_ID");
  }

  const store = await readStore();
  const existing = store.listings.find((listing) => listing.id === id);
  if (existing) {
    return existing;
  }

  const removedListing = {
    id,
    removedAt: new Date().toISOString(),
  };

  await writeStore({
    listings: [removedListing, ...store.listings],
  });

  return removedListing;
}

export async function restoreRemovedCatalogListings(): Promise<number> {
  const store = await readStore();
  await writeStore({ listings: [] });
  return store.listings.length;
}

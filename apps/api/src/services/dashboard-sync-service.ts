import {
  fetchCatalogListingsFromConfiguredSource,
  fetchDashboardSummaryFromConfiguredSource,
} from "./dashboard-source-service.js";
import {
  getCatalogListings,
  getDashboardSnapshot,
  logDashboardRefresh,
  saveCatalogListings,
  saveDashboardSnapshot,
} from "./dashboard-cache-service.js";
import type { DashboardSnapshot } from "./dashboard-types.js";

export interface DashboardSyncResult {
  readonly newListings: number;
  readonly messagesProcessed: number;
  readonly filesProcessed: number;
  readonly source: string;
  readonly fetchedAt: string;
}

async function cacheSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  await saveDashboardSnapshot(snapshot);
  await logDashboardRefresh(snapshot);
}

async function cacheCatalogListings(snapshot: DashboardSnapshot): Promise<number> {
  const catalogListings = await fetchCatalogListingsFromConfiguredSource(snapshot.summary);
  if (catalogListings.length > 0) {
    await saveCatalogListings(catalogListings);
  }

  return catalogListings.length;
}

function isEmptySnapshot(snapshot: DashboardSnapshot | null): boolean {
  if (!snapshot) {
    return true;
  }

  return (
    snapshot.summary.candidateCount === 0 &&
    snapshot.summary.listingCount === 0 &&
    snapshot.summary.topCandidates.length === 0 &&
    snapshot.summary.runMeta.listingCountFromScraper === 0
  );
}

export async function ensureDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const cached = await getDashboardSnapshot();
  const cachedCatalog = await getCatalogListings();
  if (cached && !isEmptySnapshot(cached) && cachedCatalog.length > 0) {
    return cached;
  }

  try {
    const fresh = await fetchDashboardSummaryFromConfiguredSource();
    await cacheSnapshot(fresh);
    await cacheCatalogListings(fresh);
    return fresh;
  } catch {
    return cached ?? null;
  }
}

export async function refreshDashboardSnapshot(): Promise<DashboardSyncResult> {
  const snapshot = await fetchDashboardSummaryFromConfiguredSource();
  await cacheSnapshot(snapshot);
  const catalogCount = await cacheCatalogListings(snapshot);

  return {
    newListings: snapshot.summary.candidateCount,
    messagesProcessed: snapshot.summary.pipelineMessages.length,
    filesProcessed: catalogCount > 0 ? 1 : 0,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
  };
}

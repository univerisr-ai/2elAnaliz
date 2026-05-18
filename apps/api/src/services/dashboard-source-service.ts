import fs from "node:fs/promises";
import AdmZip from "adm-zip";
import { ENV, assertGitHubSourceConfigured } from "../config/env.js";
import type { CatalogListing, DashboardSnapshot, DashboardSummary } from "./dashboard-types.js";
import { isCatalogNoiseListing, mapRawCatalogListing, pickRawListingImageUrl } from "./dashboard-cache-service.js";

interface GitHubWorkflowRunsResponse {
  workflow_runs?: Array<{
    id: number;
    html_url?: string;
    event?: string;
    conclusion?: string | null;
    created_at?: string;
    updated_at?: string;
  }>;
}

interface GitHubArtifactsResponse {
  artifacts?: Array<{
    id: number;
    name: string;
    archive_download_url: string;
    created_at?: string;
  }>;
}

interface ScraperArtifactListing {
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
}

interface ScraperOutputPayload {
  readonly allListings?: readonly ScraperArtifactListing[];
}

function assertSummaryShape(value: unknown): asserts value is DashboardSummary {
  if (!value || typeof value !== "object") {
    throw new Error("[DASHBOARD] latest-summary.json formatı geçersiz.");
  }

  if (!Array.isArray((value as { topCandidates?: unknown }).topCandidates)) {
    throw new Error("[DASHBOARD] topCandidates beklenen formatta değil.");
  }
}

async function githubRequest<T>(endpoint: string): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ENV.GITHUB_PAT_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GPUPusula",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[GITHUB] API hatası (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

function extractListingId(url = ""): string {
  if (!url) {
    return "";
  }

  let match = url.match(/-(\d{6,})(?:\/detay)?(?:[/?#]|$)/i);
  if (match) return match[1] || "";

  match = url.match(/\/(\d{6,})(?:\/detay)?(?:[/?#]|$)/i);
  if (match) return match[1] || "";

  match = url.match(/[?&](?:id|ilan_id|listingId)=(\d{6,})/i);
  return match ? match[1] || "" : "";
}

function normalizeListingUrl(url = ""): string {
  try {
    const normalized = new URL(url);
    normalized.search = "";
    normalized.hash = "";
    return normalized.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

async function fetchLatestSuccessfulRun(): Promise<{
  runId: number;
  analyzerRunUrl: string | null;
  summary: DashboardSummary;
}> {
  const endpoint = `/repos/${ENV.ANALYZER_REPO_OWNER}/${ENV.ANALYZER_REPO_NAME}/actions/workflows/${ENV.ANALYZER_WORKFLOW_ID}/runs?status=success&per_page=10`;
  const response = await githubRequest<GitHubWorkflowRunsResponse>(endpoint);
  const runs = response.workflow_runs ?? [];

  if (runs.length === 0) {
    throw new Error("[GITHUB] Basarili analyzer workflow run bulunamadı.");
  }

  let fallback: {
    runId: number;
    analyzerRunUrl: string | null;
    summary: DashboardSummary;
  } | null = null;

  for (const run of runs) {
    if (!run?.id) {
      continue;
    }

    try {
      const zipBuffer = await downloadSummaryArtifact(run.id);
      const summary = await readSummaryFromZip(zipBuffer);
      const normalized = {
        runId: run.id,
        analyzerRunUrl: run.html_url ?? null,
        summary,
      };

      if (!fallback) {
        fallback = normalized;
      }

      const hasVisibleListings =
        summary.candidateCount > 0 ||
        summary.listingCount > 0 ||
        summary.topCandidates.length > 0 ||
        summary.runMeta.listingCountFromScraper > 0;

      const isPreferredEvent =
        run.event === "repository_dispatch" ||
        run.event === "schedule" ||
        Boolean(summary.runMeta.scraperRunId);

      if (hasVisibleListings && isPreferredEvent) {
        return normalized;
      }
    } catch (error) {
      console.warn(`[GITHUB] Run ${run.id} summary okunamadi:`, error);
    }
  }

  if (fallback) {
    return fallback;
  }

  throw new Error("[GITHUB] Okunabilir analyzer summary bulunamadı.");
}

function enrichSummary(summary: DashboardSummary, runId: number, analyzerRunUrl: string | null): DashboardSummary {
  return {
    ...summary,
    runMeta: {
      ...summary.runMeta,
      analyzerRunId: summary.runMeta.analyzerRunId || String(runId),
      analyzerRunUrl: summary.runMeta.analyzerRunUrl || analyzerRunUrl,
    },
  };
}

async function downloadSummaryArtifact(runId: number): Promise<Buffer> {
  return downloadArtifactBuffer({
    owner: ENV.ANALYZER_REPO_OWNER,
    repo: ENV.ANALYZER_REPO_NAME,
    runId,
    matcher: (item) => item.name.startsWith(ENV.ANALYZER_SUMMARY_ARTIFACT_PREFIX),
    notFoundMessage: "[GITHUB] Dashboard summary artifact bulunamadı.",
  });
}

async function downloadArtifactBuffer(options: {
  owner: string;
  repo: string;
  runId: number | string;
  matcher: (artifact: NonNullable<GitHubArtifactsResponse["artifacts"]>[number]) => boolean;
  notFoundMessage: string;
}): Promise<Buffer> {
  const endpoint = `/repos/${options.owner}/${options.repo}/actions/runs/${options.runId}/artifacts?per_page=100`;
  const response = await githubRequest<GitHubArtifactsResponse>(endpoint);
  const artifact = response.artifacts?.find(options.matcher);

  if (!artifact) {
    throw new Error(options.notFoundMessage);
  }

  const downloadResponse = await fetch(artifact.archive_download_url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ENV.GITHUB_PAT_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GPUPusula",
    },
    redirect: "follow",
  });

  if (!downloadResponse.ok) {
    const body = await downloadResponse.text();
    throw new Error(`[GITHUB] Artifact indirilemedi (${downloadResponse.status}): ${body}`);
  }

  return Buffer.from(await downloadResponse.arrayBuffer());
}

async function readSummaryFromZip(zipBuffer: Buffer): Promise<DashboardSummary> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const summaryEntry =
    entries.find((entry) => entry.entryName.endsWith("latest-summary.json")) ??
    entries.find((entry) => entry.entryName.toLowerCase().endsWith(".json"));

  if (!summaryEntry) {
    throw new Error("[DASHBOARD] Artifact içinde latest-summary.json bulunamadı.");
  }

  const parsed = JSON.parse(summaryEntry.getData().toString("utf-8")) as unknown;
  assertSummaryShape(parsed);
  return parsed;
}

function parseRepositorySlug(repository: string | null): { owner: string; repo: string } | null {
  const normalized = String(repository || "").trim();
  if (!normalized.includes("/")) {
    return null;
  }

  const [owner, repo] = normalized.split("/", 2).map((value) => value.trim());
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

async function readScraperListingsFromZip(zipBuffer: Buffer): Promise<readonly ScraperArtifactListing[]> {
  const zip = new AdmZip(zipBuffer);
  const outputEntry = zip.getEntries().find((entry) => entry.entryName.endsWith("output.json"));

  if (!outputEntry) {
    throw new Error("[SCRAPER] Artifact içinde output.json bulunamadı.");
  }

  const parsed = JSON.parse(outputEntry.getData().toString("utf-8")) as unknown;
  if (Array.isArray(parsed)) {
    return parsed as readonly ScraperArtifactListing[];
  }

  return (parsed as ScraperOutputPayload).allListings ?? [];
}

async function fetchScraperArtifactListings(summary: DashboardSummary): Promise<readonly ScraperArtifactListing[]> {
  const repository = parseRepositorySlug(summary.runMeta.sourceRepository);
  const runId = Number(summary.runMeta.scraperRunId || 0);
  const artifactName = String(summary.runMeta.scraperArtifactName || "").trim();

  if (!repository || !runId || !artifactName) {
    return [];
  }

  const zipBuffer = await downloadArtifactBuffer({
    owner: repository.owner,
    repo: repository.repo,
    runId,
    matcher: (item) => item.name === artifactName,
    notFoundMessage: "[SCRAPER] Scraper artifact bulunamadı.",
  });

  return readScraperListingsFromZip(zipBuffer);
}

function enrichSummaryWithImages(
  summary: DashboardSummary,
  scraperListings: readonly ScraperArtifactListing[],
): DashboardSummary {
  if (scraperListings.length === 0) {
    return summary;
  }

  const imageByUrl = new Map<string, string>();
  const imageById = new Map<string, string>();

  for (const listing of scraperListings) {
    const imageUrl = pickRawListingImageUrl(listing);
    if (!imageUrl) {
      continue;
    }

    const normalizedUrl = normalizeListingUrl(listing.url || "");
    if (normalizedUrl) {
      imageByUrl.set(normalizedUrl, imageUrl);
    }

    const listingId = listing.ilan_id?.trim() || extractListingId(listing.url || "");
    if (listingId) {
      imageById.set(listingId, imageUrl);
    }
  }

  return {
    ...summary,
    topCandidates: summary.topCandidates.map((candidate) => {
      const imageUrl =
        imageByUrl.get(normalizeListingUrl(candidate.url)) ||
        imageById.get(extractListingId(candidate.url)) ||
        candidate.imageUrl ||
        null;

      return {
        ...candidate,
        imageUrl,
      };
    }),
  };
}

async function fetchFromGitHubArtifact(): Promise<DashboardSnapshot> {
  assertGitHubSourceConfigured();

  const { runId, analyzerRunUrl, summary } = await fetchLatestSuccessfulRun();
  const scraperListings = await fetchScraperArtifactListings(summary).catch((error) => {
    console.warn("[SCRAPER] Scraper listings okunamadi:", error);
    return [] as readonly ScraperArtifactListing[];
  });
  const enrichedSummary = enrichSummaryWithImages(enrichSummary(summary, runId, analyzerRunUrl), scraperListings);

  return {
    summary: enrichedSummary,
    fetchedAt: new Date().toISOString(),
    source: "github_artifact",
  };
}

async function fetchFromLocalFile(): Promise<DashboardSnapshot> {
  assertGitHubSourceConfigured();
  const raw = await fs.readFile(ENV.ANALYZER_SUMMARY_FILE, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  assertSummaryShape(parsed);

  return {
    summary: parsed,
    fetchedAt: new Date().toISOString(),
    source: "local_file",
  };
}

export async function fetchDashboardSummaryFromConfiguredSource(): Promise<DashboardSnapshot> {
  if (ENV.DATA_SOURCE === "local_file") {
    return fetchFromLocalFile();
  }

  return fetchFromGitHubArtifact();
}

export async function fetchCatalogListingsFromConfiguredSource(summary: DashboardSummary): Promise<readonly CatalogListing[]> {
  if (ENV.DATA_SOURCE === "local_file") {
    return [];
  }

  const listings = await fetchScraperArtifactListings(summary);
  return listings
    .map((listing, index) => mapRawCatalogListing(listing, index))
    .filter((listing) => !isCatalogNoiseListing(listing));
}

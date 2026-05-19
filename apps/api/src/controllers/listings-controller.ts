/**
 * Listings Controller — GPU ilan API endpoint'leri.
 * Katman kuralı: Sadece HTTP request/response yönetimi, iş mantığı yok.
 */

import { Router, type Request, type Response } from "express";
import { assertSubmissionsConfigured, ENV } from "../config/env.js";
import {
  getCatalogImageFallbacks,
  getEmbeddedCatalogListings,
  getCatalogListings,
  getDashboardLastUpdated,
  getDashboardListings,
  getDashboardRefreshLogs,
  getDashboardSummary,
} from "../services/dashboard-cache-service.js";
import { ensureDashboardSnapshot, refreshDashboardSnapshot } from "../services/dashboard-sync-service.js";
import type {
  CatalogListing,
  DashboardListing,
  DashboardSummary,
  DashboardTopCandidate,
} from "../services/dashboard-types.js";
import {
  buildBuyabilityIndex,
  buildCatalogModelSummaries,
  getBuyabilityInsight,
  getCatalogRankingScore,
  getModelFamily,
  getModelSlug,
  matchesModelSlug,
  type BuyabilityIndex,
  type BuyabilityInsight,
} from "../services/catalog-insight-service.js";
import { buildImagePlaceholder, resolveImageProxy } from "../services/image-proxy-service.js";
import { requireAdminUser, requireAuthenticatedUser } from "../middleware/auth-middleware.js";
import { commentRateLimit } from "../middleware/rate-limit-middleware.js";
import { createListingComment, hideListingComment, listListingComments } from "../services/listing-comments-service.js";
import {
  getProfileById,
  getPublishedListingById,
  listSubmissionsForOwner,
  listPublicPublishedCatalogListings,
} from "../services/submission-repository.js";
import { getAuthenticatedSupabaseUser } from "../services/supabase-service.js";
import { authenticateLocalDevToken } from "../services/local-dev-auth-service.js";
import type { PublishedListingRecord } from "../services/submission-types.js";
import {
  listRemovedCatalogListingIds,
  removeCatalogListing,
  restoreRemovedCatalogListings,
} from "../services/catalog-removal-service.js";
import {
  deleteWatchlistItem,
  listWatchlistForUser,
  upsertWatchlistItem,
  type WatchlistRecord,
} from "../services/watchlist-service.js";

export const listingsRouter = Router();

type PublicDashboardListing = Omit<DashboardListing, "url" | "source" | "sourceType" | "isInternal">;
type PublicCatalogListing = Omit<CatalogListing, "url" | "source" | "sourceType" | "isInternal"> & {
  readonly modelSlug: string;
  readonly modelFamily: string;
  readonly buyability: BuyabilityInsight;
  readonly sourceLabel: string;
  readonly externalUrl: string | null;
  readonly isInternal: boolean;
};
type PublicDashboardTopCandidate = Omit<DashboardTopCandidate, "url">;
type PublicDashboardSummary = Omit<DashboardSummary, "topCandidates" | "pipelineMessages" | "runMeta"> & {
  readonly topCandidates: readonly PublicDashboardTopCandidate[];
};
type PublicPublishedListing = Omit<PublishedListingRecord, "sourceType" | "externalUrl" | "sourceLabel"> & {
  readonly sourceLabel: string;
  readonly externalUrl: string | null;
  readonly isInternal: boolean;
};

interface PublicCatalogContext {
  readonly allListings: readonly CatalogListing[];
  readonly buyabilityIndex: BuyabilityIndex;
}

interface PublicWatchlistItem {
  readonly listingId: string;
  readonly alertPrice: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isAlertTriggered: boolean;
  readonly listing: PublicCatalogListing | null;
}

const CATALOG_DEFAULT_PER_PAGE = 120;
const CATALOG_MAX_PER_PAGE = 5000;
const CATALOG_PUBLIC_MIN_BUYABILITY_SCORE = 50;
const MODEL_DEFAULT_PER_PAGE = 1000;
const MODEL_MAX_PER_PAGE = 1000;
const PUBLIC_LIST_CACHE_HEADER = "public, max-age=60, s-maxage=300, stale-while-revalidate=1800";

const PUBLIC_TEXT_REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/https?:\/\/[^\s)]+/gi, ""],
  [/\bgithub\b/gi, "iş akışı"],
  [/\b[a-z0-9][a-z0-9_.-]{1,}\/[a-z0-9][a-z0-9_.-]{1,}\b/gi, ""],
  [/github_artifact/gi, "server cache"],
  [/sahibinden/gi, "harici kaynak"],
  [/letgo/gi, "harici kaynak"],
  [/dolap/gi, "harici kaynak"],
  [/donanim\s*haber/gi, "harici kaynak"],
];

const BLOCKED_PUBLIC_LINK_HOST_PARTS = ["github.com", "githubusercontent.com", "vercel.app"];

function scrubPublicText(value: string): string {
  return PUBLIC_TEXT_REDACTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function scrubNullablePublicText(value: string | null): string | null {
  return value == null ? null : scrubPublicText(value);
}

function normalizePublicExternalUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith("#")) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_PUBLIC_LINK_HOST_PARTS.some((part) => hostname === part || hostname.endsWith(`.${part}`))) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getPublicSourceLabel(
  sourceType: CatalogListing["sourceType"] | PublishedListingRecord["sourceType"] | undefined,
  source: string | null | undefined,
): string {
  const normalizedSource = (source ?? "").trim();

  if (sourceType === "pecid" || /pecid/i.test(normalizedSource)) {
    return "GPU Pusula";
  }

  if (sourceType === "sahibinden" || /sahibinden/i.test(normalizedSource)) {
    return "Sahibinden";
  }

  if (sourceType === "letgo" || /letgo/i.test(normalizedSource)) {
    return "Letgo";
  }

  if (sourceType === "dolap" || /dolap/i.test(normalizedSource)) {
    return "Dolap";
  }

  if (sourceType === "donanimhaber" || /donanim\s*haber/i.test(normalizedSource)) {
    return "Donanim Haber";
  }

  if (normalizedSource && normalizedSource.toLowerCase() !== "harici") {
    return scrubPublicText(normalizedSource) || "Harici site";
  }

  return "Harici site";
}

function setPublicListCache(res: Response): void {
  res.setHeader("Cache-Control", PUBLIC_LIST_CACHE_HEADER);
}

function parseBoundedPositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(max, parsed);
}

function buildPublicImagePath(listingId: string, imageUrl: string | null | undefined): string | null {
  return imageUrl ? `/api/image/listing/${encodeURIComponent(listingId)}` : null;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.header("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function isLocalDevelopmentRequest(req: Request): boolean {
  const host = (req.hostname || "").trim().toLowerCase();
  return process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
}

async function assertAdminAccess(req: Request): Promise<void> {
  const providedKey = req.header("x-admin-key")?.trim();

  if (providedKey) {
    if (ENV.ADMIN_API_KEY && providedKey === ENV.ADMIN_API_KEY) {
      return;
    }
    throw new Error("FORBIDDEN");
  }

  const token = getBearerToken(req);
  if (!token) {
    throw new Error("FORBIDDEN");
  }

  if (isLocalDevelopmentRequest(req)) {
    const localProfile = await authenticateLocalDevToken(token);
    if (localProfile) {
      if (localProfile.role === "admin") {
        return;
      }
      throw new Error("FORBIDDEN");
    }
  }

  assertSubmissionsConfigured();
  const authUser = await getAuthenticatedSupabaseUser(token);
  const profile = await getProfileById(authUser.id);
  if (profile?.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
}

function sanitizeDashboardTopCandidate(candidate: DashboardTopCandidate): PublicDashboardTopCandidate {
  return {
    title: scrubPublicText(candidate.title),
    modelKey: scrubPublicText(candidate.modelKey),
    price: candidate.price,
    fairPrice: candidate.fairPrice,
    discountRatio: candidate.discountRatio,
    confidence: candidate.confidence,
    analysisNote: scrubPublicText(candidate.analysisNote),
    imageUrl: buildPublicImagePath(candidate.modelKey || candidate.title, candidate.imageUrl),
  };
}

function sanitizeDashboardSummary(summary: DashboardSummary | null): PublicDashboardSummary | null {
  if (!summary) {
    return null;
  }

  return {
    analysisCompleted: summary.analysisCompleted,
    generatedAt: summary.generatedAt,
    listingCount: summary.listingCount,
    recognizedModelCount: summary.recognizedModelCount,
    candidateCount: summary.candidateCount,
    topCandidates: summary.topCandidates.map(sanitizeDashboardTopCandidate),
    expertSummary: scrubPublicText(summary.expertSummary),
  };
}

function sanitizeDashboardListing(listing: DashboardListing): PublicDashboardListing {
  return {
    id: listing.id,
    title: scrubPublicText(listing.title),
    model: scrubPublicText(listing.model),
    brand: listing.brand,
    price: listing.price,
    fairPrice: listing.fairPrice,
    discountPercent: listing.discountPercent,
    confidencePercent: listing.confidencePercent,
    analysisNote: scrubPublicText(listing.analysisNote),
    listedAt: listing.listedAt,
    imageUrl: buildPublicImagePath(listing.id, listing.imageUrl),
  };
}

function sanitizeCatalogListing(listing: CatalogListing, context: PublicCatalogContext): PublicCatalogListing {
  const isInternal = Boolean(listing.isInternal || listing.sourceType === "pecid");

  return {
    id: listing.id,
    title: scrubPublicText(listing.title),
    model: scrubPublicText(listing.model),
    brand: listing.brand,
    price: listing.price,
    priceText: listing.priceText,
    imageUrl: buildPublicImagePath(listing.id, listing.imageUrl),
    location: scrubPublicText(listing.location),
    segment: scrubPublicText(listing.segment),
    listedAtLabel: scrubPublicText(listing.listedAtLabel),
    modelSlug: getModelSlug(listing),
    modelFamily: getModelFamily(listing),
    buyability: getBuyabilityInsight(listing, context.allListings, context.buyabilityIndex),
    sourceLabel: getPublicSourceLabel(listing.sourceType, listing.source),
    externalUrl: isInternal ? null : normalizePublicExternalUrl(listing.url),
    isInternal,
  };
}

function filterPublicCatalogListings(
  listings: readonly CatalogListing[],
  context: PublicCatalogContext,
): CatalogListing[] {
  return listings
    .map((listing) => ({
      listing,
      insight: getBuyabilityInsight(listing, context.allListings, context.buyabilityIndex),
    }))
    .filter((entry) => entry.insight.score >= CATALOG_PUBLIC_MIN_BUYABILITY_SCORE)
    .sort(
      (a, b) =>
        getCatalogRankingScore(b.listing, b.insight) - getCatalogRankingScore(a.listing, a.insight) ||
        b.insight.score - a.insight.score ||
        a.listing.price - b.listing.price,
    )
    .map((entry) => entry.listing);
}

function sanitizePublishedListing(listing: PublishedListingRecord): PublicPublishedListing {
  const isInternal = listing.sourceType === "pecid";

  return {
    id: listing.id,
    ownerId: listing.ownerId,
    title: scrubPublicText(listing.title),
    description: scrubPublicText(listing.description),
    brand: scrubNullablePublicText(listing.brand),
    model: scrubNullablePublicText(listing.model),
    category: scrubPublicText(listing.category),
    price: listing.price,
    currency: listing.currency,
    location: scrubNullablePublicText(listing.location),
    imageCoverUrl: buildPublicImagePath(listing.id, listing.imageCoverUrl),
    publishedAt: listing.publishedAt,
    status: listing.status,
    sourceLabel: getPublicSourceLabel(listing.sourceType, listing.sourceLabel),
    externalUrl: isInternal ? null : normalizePublicExternalUrl(listing.externalUrl),
    isInternal,
  };
}

function normalizeListingId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 160);
}

function normalizeCommentAuthor(value: unknown): string {
  const author = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (author || "Misafir").slice(0, 48);
}

function normalizeCommentBody(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 600) : "";
}

function normalizeAlertPrice(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

async function resolveListingImageSource(listingId: string): Promise<{ src: string; label: string } | null> {
  await ensureDashboardSnapshot();

  const [dashboardListings, catalogListings, publishedListings] = await Promise.all([
    getDashboardListings(),
    getCatalogListings(),
    listPublicPublishedCatalogListings().catch((error: unknown) => {
      console.warn("[API] Dahili ilan gorselleri okunamadi:", error);
      return [] as CatalogListing[];
    }),
  ]);

  const embeddedCatalogListings = getEmbeddedCatalogListings();
  const catalogListing = [...publishedListings, ...catalogListings, ...embeddedCatalogListings].find(
    (listing) => listing.id === listingId,
  );
  const dashboardListing = dashboardListings.find((listing) => listing.id === listingId);
  const imageFallback = getCatalogImageFallbacks().find((listing) => listing.id === listingId);
  const imageUrl = catalogListing?.imageUrl ?? dashboardListing?.imageUrl ?? imageFallback?.imageUrl ?? null;
  const label = catalogListing?.title ?? dashboardListing?.title ?? imageFallback?.title ?? "İlan görseli";

  return imageUrl ? { src: imageUrl, label } : null;
}

async function loadCombinedCatalogListings(): Promise<{
  listings: CatalogListing[];
  referenceListings: DashboardListing[];
  lastUpdated: string;
}> {
  await ensureDashboardSnapshot();
  let listings = await getCatalogListings();

  if (listings.length === 0) {
    await refreshDashboardSnapshot();
    listings = await getCatalogListings();
  }

  try {
    const internalListings = await listPublicPublishedCatalogListings();
    listings = [...internalListings, ...listings];
  } catch (internalError) {
    console.warn("[API] Dahili yayinlanmis ilanlar kataloga eklenemedi:", internalError);
  }

  const removedListingIds = await listRemovedCatalogListingIds();
  if (removedListingIds.size > 0) {
    listings = listings.filter((listing) => !removedListingIds.has(listing.id));
  }

  const [referenceListings, lastUpdated] = await Promise.all([getDashboardListings(), getDashboardLastUpdated()]);
  return { listings, referenceListings, lastUpdated };
}

function buildCatalogContext(listings: readonly CatalogListing[], referenceListings: readonly DashboardListing[]): PublicCatalogContext {
  return {
    allListings: listings,
    buyabilityIndex: buildBuyabilityIndex(listings, referenceListings),
  };
}

function sanitizeWatchlistItem(record: WatchlistRecord, listingMap: ReadonlyMap<string, CatalogListing>, context: PublicCatalogContext): PublicWatchlistItem {
  const listing = listingMap.get(record.listingId) ?? null;
  return {
    listingId: record.listingId,
    alertPrice: record.alertPrice,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isAlertTriggered: Boolean(listing && record.alertPrice && listing.price > 0 && listing.price <= record.alertPrice),
    listing: listing ? sanitizeCatalogListing(listing, context) : null,
  };
}

/**
 * GET /api/image/listing/:listingId
 * Public katalogda ham dis gorsel adresini acmadan ilan gorselini servis eder.
 */
listingsRouter.get("/image/listing/:listingId", async (req: Request, res: Response): Promise<void> => {
  try {
    const listingId = normalizeListingId(req.params.listingId);
    const source = listingId ? await resolveListingImageSource(listingId) : null;

    if (!source) {
      const placeholder = buildImagePlaceholder("İlan görseli");
      res.setHeader("Content-Type", placeholder.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.send(placeholder.data);
      return;
    }

    const resolved = await resolveImageProxy(source.src);
    if (!resolved) {
      const placeholder = buildImagePlaceholder(source.label);
      res.setHeader("Content-Type", placeholder.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.send(placeholder.data);
      return;
    }

    res.setHeader("Content-Type", resolved.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(resolved.data);
  } catch (err) {
    console.error("[API] ❌ /image/listing/:listingId hatası:", err);
    const placeholder = buildImagePlaceholder("İlan görseli");
    res.setHeader("Content-Type", placeholder.contentType);
    res.setHeader("Cache-Control", "public, max-age=600");
    res.send(placeholder.data);
  }
});

/**
 * GET /api/image
 * Harici ilan görsellerini cache'leyerek ve güvenli fallback vererek sunar.
 */
listingsRouter.get("/image", async (req: Request, res: Response): Promise<void> => {
  try {
    const src = typeof req.query.src === "string" ? req.query.src.trim() : "";
    const label = typeof req.query.label === "string" ? req.query.label.trim() : "İlan görseli";

    if (!src) {
      const placeholder = buildImagePlaceholder(label);
      res.setHeader("Content-Type", placeholder.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.send(placeholder.data);
      return;
    }

    const resolved = await resolveImageProxy(src);
    if (!resolved) {
      const placeholder = buildImagePlaceholder(label);
      res.setHeader("Content-Type", placeholder.contentType);
      res.setHeader("Cache-Control", "public, max-age=1800");
      res.send(placeholder.data);
      return;
    }

    res.setHeader("Content-Type", resolved.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(resolved.data);
  } catch (err) {
    console.error("[API] ❌ /image hatası:", err);
    const placeholder = buildImagePlaceholder("İlan görseli");
    res.setHeader("Content-Type", placeholder.contentType);
    res.setHeader("Cache-Control", "public, max-age=600");
    res.send(placeholder.data);
  }
});

/**
 * GET /api/listings
 * Tüm GPU ilanlarını döner. Opsiyonel filtreler query param ile alınır.
 */
listingsRouter.get("/listings", async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureDashboardSnapshot();
    let listings = await getDashboardListings();

    // Opsiyonel filtreleme (query params)
    const { brand, minPrice, maxPrice, search, limit } = req.query;

    if (typeof brand === "string" && brand !== "all") {
      listings = listings.filter((l) => l.brand.toLowerCase() === brand.toLowerCase());
    }

    if (typeof minPrice === "string") {
      const min = parseInt(minPrice, 10);
      if (!isNaN(min)) {
        listings = listings.filter((l) => l.price >= min);
      }
    }

    if (typeof maxPrice === "string") {
      const max = parseInt(maxPrice, 10);
      if (!isNaN(max)) {
        listings = listings.filter((l) => l.price <= max);
      }
    }

    if (typeof search === "string" && search.trim()) {
      const q = search.toLowerCase().trim();
      listings = listings.filter(
        (l) =>
          l.model.toLowerCase().includes(q) ||
          l.title.toLowerCase().includes(q) ||
          l.analysisNote.toLowerCase().includes(q),
      );
    }

    if (typeof limit === "string") {
      const lim = parseBoundedPositiveInteger(limit, CATALOG_DEFAULT_PER_PAGE, CATALOG_MAX_PER_PAGE);
      listings = listings.slice(0, lim);
    }

    const publicListings = listings.map(sanitizeDashboardListing);

    setPublicListCache(res);
    res.json({
      success: true,
      data: publicListings,
      meta: {
        total: publicListings.length,
        lastUpdated: await getDashboardLastUpdated(),
      },
    });
  } catch (err) {
    console.error("[API] ❌ /listings hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "LISTINGS_FETCH_FAILED",
        message: "İlanlar yüklenirken bir hata oluştu",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.get("/listings/:listingId/comments", async (req: Request, res: Response): Promise<void> => {
  try {
    const listingId = normalizeListingId(req.params.listingId);
    if (!listingId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_LISTING_ID",
          message: "Ilan kimligi gecersiz",
          statusCode: 400,
        },
      });
      return;
    }

    const comments = await listListingComments(listingId);
    res.json({
      success: true,
      data: comments,
      meta: {
        total: comments.length,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /listings/:listingId/comments hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "COMMENTS_FETCH_FAILED",
        message: "Yorumlar yuklenirken bir hata olustu",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.post("/listings/:listingId/comments", requireAuthenticatedUser, commentRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    const listingId = normalizeListingId(req.params.listingId);
    const actor = req.actor;
    const authorName = normalizeCommentAuthor(actor?.displayName || actor?.email?.split("@")[0] || "Üye");
    const body = normalizeCommentBody(req.body?.body);

    if (!listingId || body.length < 3) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_COMMENT",
          message: "Yorum icin ilan kimligi ve en az 3 karakter metin gerekli",
          statusCode: 400,
        },
      });
      return;
    }

    if (!actor?.id) {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Yorum yazmak icin oturum gerekli",
          statusCode: 403,
        },
      });
      return;
    }

    const comment = await createListingComment({ listingId, authorId: actor.id, authorName, body });
    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (err) {
    console.error("[API] ❌ POST /listings/:listingId/comments hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "COMMENT_CREATE_FAILED",
        message: "Yorum kaydedilemedi",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.delete(
  "/listings/:listingId/comments/:commentId",
  requireAdminUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const listingId = normalizeListingId(req.params.listingId);
      const commentId = normalizeListingId(req.params.commentId);
      if (!listingId || !commentId) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_COMMENT",
            message: "Yorum kimligi gecersiz",
            statusCode: 400,
          },
        });
        return;
      }

      const hidden = await hideListingComment({ listingId, commentId });
      if (!hidden) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Yorum bulunamadi",
            statusCode: 404,
          },
        });
        return;
      }

      res.json({ success: true, data: hidden });
    } catch (err) {
      console.error("[API] DELETE /listings/:listingId/comments/:commentId hatası:", err);
      res.status(500).json({
        success: false,
        error: {
          code: "COMMENT_HIDE_FAILED",
          message: "Yorum gizlenemedi",
          statusCode: 500,
        },
      });
    }
  },
);

listingsRouter.get("/me/watchlist", requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = req.actor;
    if (!actor?.id) {
      res.status(401).json({
        success: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "Takip listesi icin oturum gerekli",
          statusCode: 401,
        },
      });
      return;
    }

    const [catalog, records] = await Promise.all([loadCombinedCatalogListings(), listWatchlistForUser(actor.id)]);
    const context = buildCatalogContext(catalog.listings, catalog.referenceListings);
    const listingMap = new Map(catalog.listings.map((listing) => [listing.id, listing]));
    const items = records.map((record) => sanitizeWatchlistItem(record, listingMap, context));

    res.json({
      success: true,
      data: items,
      meta: {
        total: items.length,
        lastUpdated: catalog.lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /me/watchlist hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "WATCHLIST_FETCH_FAILED",
        message: "Takip listesi yuklenemedi",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.post("/me/watchlist", requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = req.actor;
    const listingId = normalizeListingId(req.body?.listingId);
    const alertPrice = normalizeAlertPrice(req.body?.alertPrice);

    if (!actor?.id || !listingId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_WATCHLIST_ITEM",
          message: "Takip icin gecerli ilan kimligi gerekli",
          statusCode: 400,
        },
      });
      return;
    }

    const catalog = await loadCombinedCatalogListings();
    const listing = catalog.listings.find((candidate) => candidate.id === listingId);
    if (!listing) {
      res.status(404).json({
        success: false,
        error: {
          code: "LISTING_NOT_FOUND",
          message: "Takibe alinacak ilan bulunamadi",
          statusCode: 404,
        },
      });
      return;
    }

    const record = await upsertWatchlistItem(actor.id, listingId, alertPrice);
    const context = buildCatalogContext(catalog.listings, catalog.referenceListings);
    res.status(201).json({
      success: true,
      data: sanitizeWatchlistItem(record, new Map([[listing.id, listing]]), context),
    });
  } catch (err) {
    console.error("[API] ❌ POST /me/watchlist hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "WATCHLIST_SAVE_FAILED",
        message: "Takip kaydedilemedi",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.delete("/me/watchlist/:listingId", requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = req.actor;
    const listingId = normalizeListingId(req.params.listingId);

    if (!actor?.id || !listingId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_WATCHLIST_ITEM",
          message: "Takip icin gecerli ilan kimligi gerekli",
          statusCode: 400,
        },
      });
      return;
    }

    await deleteWatchlistItem(actor.id, listingId);
    res.json({ success: true, data: { listingId } });
  } catch (err) {
    console.error("[API] ❌ DELETE /me/watchlist/:listingId hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "WATCHLIST_DELETE_FAILED",
        message: "Takip silinemedi",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.get("/me/notifications", requireAuthenticatedUser, async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = req.actor;
    if (!actor?.id) {
      res.status(401).json({
        success: false,
        error: {
          code: "AUTH_REQUIRED",
          message: "Bildirimler icin oturum gerekli",
          statusCode: 401,
        },
      });
      return;
    }

    const [catalog, watchlist, submissions] = await Promise.all([
      loadCombinedCatalogListings(),
      listWatchlistForUser(actor.id),
      listSubmissionsForOwner(actor.id),
    ]);
    const listingMap = new Map(catalog.listings.map((listing) => [listing.id, listing]));
    const notifications: Array<{
      id: string;
      title: string;
      detail: string;
      createdAt: string;
      kind: "published" | "comment" | "alert" | "review";
    }> = [];

    watchlist.forEach((item) => {
      const listing = listingMap.get(item.listingId);
      if (listing && item.alertPrice && listing.price > 0 && listing.price <= item.alertPrice) {
        notifications.push({
          id: `alert-${item.listingId}`,
          title: "Fiyat alarmı",
          detail: `${scrubPublicText(listing.title)} hedef fiyatına indi.`,
          createdAt: item.updatedAt,
          kind: "alert",
        });
      }
    });

    for (const bundle of submissions.slice(0, 12)) {
      const submission = bundle.submission;
      if (submission.status === "published") {
        notifications.push({
          id: `published-${submission.id}`,
          title: "İlan yayında",
          detail: scrubPublicText(submission.title),
          createdAt: submission.updatedAt,
          kind: "published",
        });
      } else if (submission.status === "rejected") {
        notifications.push({
          id: `rejected-${submission.id}`,
          title: "İlan reddedildi",
          detail: scrubPublicText(submission.rejectionNote || submission.title),
          createdAt: submission.updatedAt,
          kind: "review",
        });
      } else if (submission.status === "pending_review" || submission.status === "pending_analysis") {
        notifications.push({
          id: `review-${submission.id}`,
          title: "İnceleme sürüyor",
          detail: scrubPublicText(submission.title),
          createdAt: submission.updatedAt,
          kind: "review",
        });
      }

      if (submission.publishedListingId) {
        const comments = await listListingComments(submission.publishedListingId);
        comments.slice(-2).forEach((comment) => {
          notifications.push({
            id: `comment-${submission.id}-${comment.id}`,
            title: "Yeni yorum",
            detail: scrubPublicText(`${submission.title}: ${comment.body}`),
            createdAt: comment.createdAt,
            kind: "comment",
          });
        });
      }
    }

    const sorted = notifications
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    res.json({
      success: true,
      data: sorted,
      meta: {
        total: sorted.length,
        lastUpdated: catalog.lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /me/notifications hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "NOTIFICATIONS_FETCH_FAILED",
        message: "Bildirimler yuklenemedi",
        statusCode: 500,
      },
    });
  }
});

/**
 * DELETE /api/catalog/:listingId
 * Katalog ilanını kaynak veriyi bozmadan gizli listeye alır.
 */
listingsRouter.delete("/catalog/:listingId", async (req: Request, res: Response): Promise<void> => {
  try {
    await assertAdminAccess(req);
    const listingId = normalizeListingId(req.params.listingId);
    if (!listingId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_LISTING_ID",
          message: "Ilan kimligi gecersiz",
          statusCode: 400,
        },
      });
      return;
    }

    const removed = await removeCatalogListing(listingId);
    res.json({
      success: true,
      data: removed,
    });
  } catch (err) {
    if ((err as Error).message === "FORBIDDEN") {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Bu islem icin admin yetkisi gerekli",
          statusCode: 403,
        },
      });
      return;
    }

    console.error("[API] ❌ DELETE /catalog/:listingId hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "CATALOG_REMOVE_FAILED",
        message: "Ilan kaldirilamadi",
        statusCode: 500,
      },
    });
  }
});

/**
 * POST /api/catalog/removed/restore
 * Yerel gizli katalog listesini temizler.
 */
listingsRouter.post("/catalog/removed/restore", async (req: Request, res: Response): Promise<void> => {
  try {
    await assertAdminAccess(req);
    const restoredCount = await restoreRemovedCatalogListings();
    res.json({
      success: true,
      data: { restoredCount },
    });
  } catch (err) {
    if ((err as Error).message === "FORBIDDEN") {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Bu islem icin admin yetkisi gerekli",
          statusCode: 403,
        },
      });
      return;
    }

    console.error("[API] ❌ POST /catalog/removed/restore hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "CATALOG_RESTORE_FAILED",
        message: "Gizlenen ilanlar geri getirilemedi",
        statusCode: 500,
      },
    });
  }
});

/**
 * GET /api/catalog
 * Tam katalog akışını döner. Filtre, sıralama ve sayfalama destekler.
 */
listingsRouter.get("/catalog", async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await loadCombinedCatalogListings();
    let listings = catalog.listings;
    const context = buildCatalogContext(catalog.listings, catalog.referenceListings);

    const { brand, minPrice, maxPrice, search, sort, page, perPage } = req.query;

    if (typeof brand === "string" && brand !== "all") {
      listings = listings.filter((listing) => listing.brand.toLowerCase() === brand.toLowerCase());
    }

    if (typeof minPrice === "string") {
      const min = parseInt(minPrice, 10);
      if (!Number.isNaN(min)) {
        listings = listings.filter((listing) => listing.price >= min);
      }
    }

    if (typeof maxPrice === "string") {
      const max = parseInt(maxPrice, 10);
      if (!Number.isNaN(max)) {
        listings = listings.filter((listing) => listing.price <= max);
      }
    }

    if (typeof search === "string" && search.trim()) {
      const needle = search.trim().toLowerCase();
      listings = listings.filter((listing) =>
        `${listing.title} ${listing.model} ${listing.location} ${listing.segment}`.toLowerCase().includes(needle),
      );
    }

    listings = filterPublicCatalogListings(listings, context);

    switch (sort) {
      case "price_asc":
        listings = [...listings].sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        listings = [...listings].sort((a, b) => b.price - a.price);
        break;
      case "title_asc":
        listings = [...listings].sort((a, b) => a.title.localeCompare(b.title, "tr"));
        break;
      default:
        break;
    }

    const resolvedPage = parseBoundedPositiveInteger(page, 1, 100000);
    const resolvedPerPage = parseBoundedPositiveInteger(perPage, CATALOG_DEFAULT_PER_PAGE, CATALOG_MAX_PER_PAGE);
    const total = listings.length;
    const totalPages = Math.max(1, Math.ceil(total / resolvedPerPage));
    const pagedListings = listings.slice((resolvedPage - 1) * resolvedPerPage, resolvedPage * resolvedPerPage);
    const publicListings = pagedListings.map((listing) => sanitizeCatalogListing(listing, context));

    setPublicListCache(res);
    res.json({
      success: true,
      data: publicListings,
      meta: {
        total,
        page: resolvedPage,
        perPage: resolvedPerPage,
        totalPages,
        lastUpdated: catalog.lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /catalog hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "CATALOG_FETCH_FAILED",
        message: "Katalog yuklenirken bir hata olustu",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.get("/models", async (req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await loadCombinedCatalogListings();
    const context = buildCatalogContext(catalog.listings, catalog.referenceListings);
    const publicListings = filterPublicCatalogListings(catalog.listings, context);
    let models = buildCatalogModelSummaries(publicListings, context.buyabilityIndex).filter((model) => model.label !== "Model belirsiz");
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLocaleLowerCase("tr-TR") : "";
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit || "500"), 10) || 500));

    if (search) {
      models = models.filter((model) => `${model.label} ${model.family} ${model.brand}`.toLocaleLowerCase("tr-TR").includes(search));
    }

    setPublicListCache(res);
    res.json({
      success: true,
      data: models.slice(0, limit),
      meta: {
        total: models.length,
        lastUpdated: catalog.lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /models hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "MODELS_FETCH_FAILED",
        message: "Model listesi yuklenemedi",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.get("/models/:slug", async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug ?? "").trim().toLocaleLowerCase("tr-TR");
    const catalog = await loadCombinedCatalogListings();
    const context = buildCatalogContext(catalog.listings, catalog.referenceListings);
    const modelListings = filterPublicCatalogListings(
      catalog.listings.filter((listing) => matchesModelSlug(listing, slug)),
      context,
    );

    if (modelListings.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: "MODEL_NOT_FOUND",
          message: "Bu model icin ilan bulunamadi",
          statusCode: 404,
        },
      });
      return;
    }

    const model = buildCatalogModelSummaries(modelListings, context.buyabilityIndex)[0];
    const sort = String(req.query.sort || "buyable_desc");
    let sortedListings = [...modelListings];

    switch (sort) {
      case "price_asc":
        sortedListings = sortedListings.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        sortedListings = sortedListings.sort((a, b) => b.price - a.price);
        break;
      case "latest":
        break;
      case "buyable_desc":
      default:
        sortedListings = sortedListings.sort(
          (a, b) => {
            const insightA = getBuyabilityInsight(a, catalog.listings, context.buyabilityIndex);
            const insightB = getBuyabilityInsight(b, catalog.listings, context.buyabilityIndex);
            return (
              getCatalogRankingScore(b, insightB) - getCatalogRankingScore(a, insightA) ||
              insightB.score - insightA.score ||
              a.price - b.price
            );
          },
        );
        break;
    }

    const page = parseBoundedPositiveInteger(req.query.page, 1, 100000);
    const perPage = parseBoundedPositiveInteger(req.query.perPage, MODEL_DEFAULT_PER_PAGE, MODEL_MAX_PER_PAGE);
    const total = sortedListings.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const pagedListings = sortedListings.slice((page - 1) * perPage, page * perPage);

    setPublicListCache(res);
    res.json({
      success: true,
      data: {
        model,
        listings: pagedListings.map((listing) => sanitizeCatalogListing(listing, context)),
      },
      meta: {
        total,
        page,
        perPage,
        totalPages,
        lastUpdated: catalog.lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /models/:slug hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "MODEL_FETCH_FAILED",
        message: "Model detayi yuklenemedi",
        statusCode: 500,
      },
    });
  }
});

/**
 * GET /api/summary
 * Son analiz özetini döner.
 */
listingsRouter.get("/summary", async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureDashboardSnapshot();
    const summary = await getDashboardSummary();
    const lastUpdated = await getDashboardLastUpdated();

    setPublicListCache(res);
    res.json({
      success: true,
      data: sanitizeDashboardSummary(summary),
      meta: { lastUpdated },
    });
  } catch (err) {
    console.error("[API] ❌ /summary hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "SUMMARY_FETCH_FAILED",
        message: "Özet bilgisi yüklenirken bir hata oluştu",
        statusCode: 500,
      },
    });
  }
});

/**
 * GET /api/dashboard
 * Frontend için özet + liste + son güncelleme bilgisini tek çağrıda döner.
 */
listingsRouter.get("/dashboard", async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureDashboardSnapshot();
    const [summary, listings, lastUpdated] = await Promise.all([
      getDashboardSummary(),
      getDashboardListings(),
      getDashboardLastUpdated(),
    ]);

    const publicListings = listings.map(sanitizeDashboardListing);

    setPublicListCache(res);
    res.json({
      success: true,
      data: {
        summary: sanitizeDashboardSummary(summary),
        listings: publicListings,
      },
      meta: {
        total: publicListings.length,
        lastUpdated,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /dashboard hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "DASHBOARD_FETCH_FAILED",
        message: "Dashboard verisi yüklenirken bir hata oluştu",
        statusCode: 500,
      },
    });
  }
});

listingsRouter.get("/published-listings/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const listingId = String(req.params.id ?? "");
    const [listing, comments, catalog] = await Promise.all([
      getPublishedListingById(listingId),
      listListingComments(listingId),
      loadCombinedCatalogListings().catch((error: unknown) => {
        console.warn("[API] Published listing katalog baglami okunamadi:", error);
        return null;
      }),
    ]);

    if (!listing) {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Yayinlanmis ilan bulunamadi",
          statusCode: 404,
        },
      });
      return;
    }

    const catalogListing = catalog?.listings.find((candidate) => candidate.id === listing.id) ?? null;
    const context = catalog ? buildCatalogContext(catalog.listings, catalog.referenceListings) : null;
    const buyability =
      catalog && catalogListing && context
        ? getBuyabilityInsight(catalogListing, catalog.listings, context.buyabilityIndex)
        : null;

    res.json({
      success: true,
      data: {
        ...sanitizePublishedListing(listing),
        comments,
        buyability,
      },
      meta: {
        total: comments.length,
        lastUpdated: catalog?.lastUpdated ?? listing.publishedAt,
      },
    });
  } catch (err) {
    console.error("[API] ❌ /published-listings/:id hatasi:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "PUBLISHED_LISTING_FETCH_FAILED",
        message: "Yayinlanmis ilan yuklenemedi",
        statusCode: 500,
      },
    });
  }
});

/**
 * GET /api/sync-logs
 * Geçmiş sync loglarını döner.
 */
listingsRouter.get("/sync-logs", async (_req: Request, res: Response): Promise<void> => {
  try {
    const logs = await getDashboardRefreshLogs();
    setPublicListCache(res);
    res.json({
      success: true,
      data: logs.map((log) => ({
        syncedAt: log.syncedAt,
        candidateCount: log.candidateCount,
        listingCount: log.listingCount,
        message: "Katalog verisi yenilendi.",
      })),
    });
  } catch (err) {
    console.error("[API] ❌ /sync-logs hatası:", err);
    res.status(500).json({
      success: false,
      error: {
        code: "SYNC_LOGS_FAILED",
        message: "Sync logları yüklenirken bir hata oluştu",
        statusCode: 500,
      },
    });
  }
});

/**
 * POST /api/sync
 * Manuel veri yenileme tetikler.
 */
listingsRouter.post("/sync", async (req: Request, res: Response): Promise<void> => {
  try {
    await assertAdminAccess(req);
    console.log("[API] 🔄 Manuel dashboard sync tetiklendi");
    const result = await refreshDashboardSnapshot();

    res.json({
      success: true,
      data: result,
      message: `Dashboard yenilendi. ${result.newListings} analizli ilan cache'e alındı.`,
    });
  } catch (err) {
    console.error("[API] ❌ /sync hatası:", err);
    if (err instanceof Error && err.message === "FORBIDDEN") {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Bu endpoint icin yonetici anahtari gerekli",
          statusCode: 403,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: "SYNC_FAILED",
        message: "Sync işlemi sırasında bir hata oluştu",
        statusCode: 500,
      },
    });
  }
});

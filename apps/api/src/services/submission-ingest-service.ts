import { getCatalogListings, getDashboardListings, getEmbeddedCatalogListings } from "./dashboard-cache-service.js";
import type { CatalogListing, DashboardListing } from "./dashboard-types.js";
import { fetchWithSafeRedirects, readLimitedText } from "./network-security-service.js";
import type { CreateLinkSubmissionInput, SourceType } from "./submission-types.js";
import { detectBrand, detectModel, detectSourceTypeFromUrl, getAllowedIngestHosts, normalizeText, normalizeWhitespace, validateIngestUrlSecure } from "./submission-utils.js";

interface IngestedMetadata {
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  coverImageUrl: string | null;
  sourceType: SourceType;
}

function normalizeComparableUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${hostname}${pathname}`;
  } catch {
    return value.trim();
  }
}

function extractListingId(value: string): string | null {
  const normalized = value.trim();
  const detailMatch = normalized.match(/-(\d+)\/detay\/?$/i) ?? normalized.match(/\/(\d+)\/detay\/?$/i);
  if (detailMatch?.[1]) {
    return detailMatch[1];
  }

  const numericMatch = normalized.match(/\b(\d{8,})\b/);
  return numericMatch?.[1] ?? null;
}

function mapCatalogListing(listing: CatalogListing, sourceUrl: string): IngestedMetadata {
  return {
    title: listing.title,
    description: `${listing.model} · ${listing.location}`,
    brand: listing.brand,
    model: listing.model,
    category: "gpu",
    price: listing.price,
    currency: "TRY",
    location: listing.location,
    coverImageUrl: listing.imageUrl,
    sourceType: detectSourceTypeFromUrl(sourceUrl),
  };
}

function mapDashboardListing(listing: DashboardListing, sourceUrl: string): IngestedMetadata {
  return {
    title: listing.title,
    description: listing.analysisNote,
    brand: listing.brand,
    model: listing.model,
    category: "gpu",
    price: listing.price,
    currency: "TRY",
    location: null,
    coverImageUrl: listing.imageUrl ?? null,
    sourceType: detectSourceTypeFromUrl(sourceUrl),
  };
}

function getComparableModel(text: string): string {
  return normalizeText(detectModel(text) ?? text);
}

function isUsableImageUrl(value: string | null | undefined): value is string {
  return Boolean(value && value.trim() && !value.includes("no-image-camera"));
}

function pickRepresentativeImage(
  modelText: string,
  catalog: readonly CatalogListing[],
  dashboard: readonly DashboardListing[],
): string | null {
  const targetModel = getComparableModel(modelText);
  if (!targetModel) {
    return null;
  }

  const catalogMatch = catalog.find((listing) => {
    if (!isUsableImageUrl(listing.imageUrl)) {
      return false;
    }

    const listingModel = getComparableModel(`${listing.model} ${listing.title}`);
    return listingModel === targetModel;
  });

  if (isUsableImageUrl(catalogMatch?.imageUrl)) {
    return catalogMatch.imageUrl;
  }

  const dashboardMatch = dashboard.find((listing) => {
    if (!isUsableImageUrl(listing.imageUrl)) {
      return false;
    }

    const listingModel = getComparableModel(`${listing.model} ${listing.title}`);
    return listingModel === targetModel;
  });

  return isUsableImageUrl(dashboardMatch?.imageUrl) ? dashboardMatch.imageUrl : null;
}

function pickCatalogMatch(url: string, catalog: CatalogListing[], dashboard: DashboardListing[]): IngestedMetadata | null {
  const normalizedUrl = normalizeComparableUrl(url);
  const listingId = extractListingId(url);

  const directCatalog = catalog.find((listing) => normalizeComparableUrl(listing.url) === normalizedUrl);
  if (directCatalog) {
    return mapCatalogListing(directCatalog, url);
  }

  const directDashboard = dashboard.find((listing) => normalizeComparableUrl(listing.url) === normalizedUrl);
  if (directDashboard) {
    return mapDashboardListing(directDashboard, url);
  }

  if (!listingId) {
    return null;
  }

  const catalogById = catalog.find((listing) => listing.id === listingId || extractListingId(listing.url) === listingId);
  if (catalogById) {
    return mapCatalogListing(catalogById, url);
  }

  const dashboardById = dashboard.find((listing) => extractListingId(listing.url) === listingId);
  return dashboardById ? mapDashboardListing(dashboardById, url) : null;
}

function mergeWithEmbeddedCatalog(catalog: CatalogListing[]): CatalogListing[] {
  const seen = new Set(catalog.map((listing) => listing.id));
  const merged = [...catalog];

  for (const listing of getEmbeddedCatalogListings()) {
    if (seen.has(listing.id)) {
      continue;
    }

    seen.add(listing.id);
    merged.push(listing);
  }

  return merged;
}

function extractMetaTag(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return null;
}

function extractPrice(text: string): number {
  const match = text.replace(/\./g, "").match(/(\d{3,})/);
  return match?.[1] ? Number(match[1]) : 0;
}

function toDisplayTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+[a-z]*$/i.test(part) || /^[a-z]*\d+[a-z\d]*$/i.test(part)) {
        return part.toUpperCase();
      }

      if (part.length <= 3) {
        return part.toUpperCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bVe\b/g, "ve")
    .replace(/\bIle\b/g, "ile");
}

function stripMarketplacePrefix(slug: string): string {
  return slug
    .replace(/^ikinci-el-ve-sifir-alisveris-/i, "")
    .replace(/^bilgisayar-/i, "")
    .replace(/^masaustu-/i, "")
    .replace(/^oyun-konsolu-/i, "");
}

function buildFallbackMetadataFromUrl(url: string): Partial<IngestedMetadata> {
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const detailIndex = pathParts.findIndex((part) => part.toLowerCase() === "detay");
  const slugSource = detailIndex > 0 ? (pathParts[detailIndex - 1] ?? "") : (pathParts.at(-1) ?? "");
  const cleanSlug = stripMarketplacePrefix(slugSource.replace(/-\d+$/i, ""));

  const title = cleanSlug ? toDisplayTitle(cleanSlug) : "Harici ilan";
  const description = "Kaynak ilan sayfasi otomatik olarak okunamadi. Link taslak olarak kaydedildi; eksik bilgiler sonradan tamamlanabilir.";
  const brand = detectBrand(title);
  const model = detectModel(title);

  return {
    title,
    description,
    brand,
    model,
    coverImageUrl: null,
    price: 0,
  };
}

async function fetchPageMetadata(url: string): Promise<Partial<IngestedMetadata>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  const { response, finalUrl } = await fetchWithSafeRedirects(
    url,
    {
      signal: controller.signal,
      headers: {
        "user-agent": "GPUPusula-Link-Reader/1.0",
        accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.6,*/*;q=0.2",
      },
    },
    {
      allowedHosts: getAllowedIngestHosts(),
      requireAllowedHost: true,
      maxRedirects: 2,
    },
  ).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error("Link icerigi okunamadi");
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("Link icerigi okunamadi");
  }

  const html = await readLimitedText(response, 512 * 1024);
  const title =
    extractMetaTag(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<title>([^<]+)<\/title>/i,
    ]) ?? "Harici ilan";

  const description =
    extractMetaTag(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]) ?? "";

  const rawImage =
    extractMetaTag(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ]) ?? null;
  const image = rawImage ? new URL(rawImage, finalUrl).toString() : null;

  const priceText =
    extractMetaTag(html, [
      /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
    ]) ?? description;

  const brand = detectBrand(`${title} ${description}`);
  const model = detectModel(`${title} ${description}`);

  return {
    title,
    description,
    brand,
    model,
    coverImageUrl: image,
    price: extractPrice(priceText),
  };
}

export async function ingestSubmissionLink(
  url: string,
  options?: { allowDirectFetch?: boolean },
): Promise<Omit<CreateLinkSubmissionInput, "ownerId">> {
  const parsed = await validateIngestUrlSecure(url);
  const normalizedUrl = parsed.toString();

  const [runtimeCatalog, dashboard] = await Promise.all([getCatalogListings(), getDashboardListings()]);
  const catalog = mergeWithEmbeddedCatalog(runtimeCatalog);
  const catalogMatch = pickCatalogMatch(normalizedUrl, catalog, dashboard);
  if (catalogMatch) {
    return {
      ...catalogMatch,
      sourceUrl: normalizedUrl,
    };
  }

  let metadata: Partial<IngestedMetadata>;
  if (options?.allowDirectFetch) {
    try {
      metadata = await fetchPageMetadata(normalizedUrl);
    } catch {
      metadata = buildFallbackMetadataFromUrl(normalizedUrl);
    }
  } else {
    metadata = buildFallbackMetadataFromUrl(normalizedUrl);
  }

  const title = metadata.title ?? "Harici ilan";
  const description = metadata.description ?? "";

  return {
    sourceUrl: normalizedUrl,
    sourceType: detectSourceTypeFromUrl(normalizedUrl),
    title,
    description,
    brand: metadata.brand ?? detectBrand(`${title} ${description}`),
    model: metadata.model ?? detectModel(`${title} ${description}`),
    category: "gpu",
    price: metadata.price ?? 0,
    currency: "TRY",
    location: null,
    coverImageUrl: metadata.coverImageUrl ?? null,
  };
}

export async function resolveNativeSubmissionCoverImage(input: {
  readonly title: string;
  readonly model: string | null;
  readonly brand: string | null;
}): Promise<string | null> {
  const [runtimeCatalog, dashboard] = await Promise.all([getCatalogListings(), getDashboardListings()]);
  const catalog = mergeWithEmbeddedCatalog(runtimeCatalog);
  return pickRepresentativeImage(`${input.brand ?? ""} ${input.model ?? ""} ${input.title}`, catalog, dashboard);
}

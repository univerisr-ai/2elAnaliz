import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  Database,
  Flame,
  Gem,
  Info,
  Lock,
  Menu,
  Plus,
  Search,
  Star,
  TrendingDown,
  Trash2,
  X,
} from "lucide-react";
import type { CatalogFilterState, CatalogListing, CatalogSourceFilter, DashboardSummary, GpuListing, ProductType } from "./types/listing";
import { CATALOG_SORT_OPTIONS } from "./types/listing";
import { Header, type HeaderNotification } from "./components/Header";
import { CatalogFilterBar } from "./components/CatalogFilterBar";
import { CatalogGrid } from "./components/CatalogGrid";
import { Footer } from "./components/Footer";
import { ListingDetailPanel } from "./components/ListingDetailPanel";
import { Ticker } from "./components/Ticker";
import { Mascot } from "./components/Mascot";
import { defterTarget, flyTicketToPanel } from "./utils/ticket-morph";
import { initTilt3d } from "./utils/tilt-3d";
import { SubmissionPanel } from "./components/SubmissionPanel";
import { AdminReviewPanel } from "./components/AdminReviewPanel";
import {
  deleteAccountWatchlistItem,
  deleteCatalogListing,
  fetchAccountNotifications,
  fetchAccountWatchlist,
  fetchCatalog,
  fetchDashboard,
  fetchMe,
  restoreCatalogListings,
  saveAccountWatchlistItem,
} from "./services/api-service";
import { getCurrentSession, subscribeToAuthChanges } from "./services/supabase-auth";
import type { SubmissionProfile } from "./types/submission";
import {
  ALL_CATEGORY_KEY,
  buildCategoryOptions,
  getModelCategoryKey,
  getModelCategoryLabel,
  getModelFamily,
  getPriceCategoryKey,
  getPriceCategoryLabel,
  slugifyModelLabel,
} from "./utils/catalog-taxonomy";
import {
  buildBuyabilityIndex,
  getCatalogRankingScore,
  getBuyabilityInsight,
  type BuyabilityIndex,
} from "./utils/buyability";
import { getSourceLabel } from "./utils/source";
import "./components/ListingCard.css";
import "./App.css";

type PageView = "home" | "catalog" | "cpu" | "submit-link" | "submit-manual" | "signin" | "signup" | "admin" | "about";
type SubmitAuthIntent = "signin" | "signup";
type CatalogSpotlightFilter = "cheap" | "popular" | "expensive" | "buyable" | null;

interface CatalogWatchItem {
  readonly listing: CatalogListing;
  readonly savedAt: string;
  readonly alertPrice: number | null;
}

const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  search: "",
  brand: "all",
  source: "all",
  minPrice: 0,
  maxPrice: 100000,
  sortBy: CATALOG_SORT_OPTIONS.BUYABLE_DESC,
};

const CATALOG_FETCH_PAGE_SIZE = 5000;
const CATALOG_FETCH_CONCURRENCY = 3;
const CATALOG_PAGE_SIZE = 120;
const CATALOG_ENTRY_LOADING_MS = 800;
const SITE_URL_RAW = (import.meta.env.VITE_SITE_URL?.trim() || "https://www.gpupusula.shop").replace(/\/+$/g, "");
const SITE_URL = SITE_URL_RAW === "https://gpupusula.shop" ? "https://www.gpupusula.shop" : SITE_URL_RAW;
const DEFAULT_SEO_KEYWORDS =
  "ikinci el ekran kartı, 2 el ekran kartı, ikinci el GPU, ekran kartı fiyatları, RTX ikinci el, GTX ikinci el, RX ikinci el, GPU Pusula";
const SOURCE_CHIP_LABELS: Record<Exclude<CatalogSourceFilter, "all">, string> = {
  pecid: "GPU Pusula",
  sahibinden: "Sahibinden",
  letgo: "Letgo",
  dolap: "Dolap",
  donanimhaber: "Donanım Haber",
  external: "Harici",
};

const REMOVED_CATALOG_IDS_STORAGE_KEY = "gpupusula.removedCatalogListingIds";
const CATALOG_WATCHLIST_STORAGE_KEY = "gpupusula.catalogWatchlist";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }

  return `${date.toLocaleDateString("tr-TR")} ${date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("tr-TR");
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("tr-TR")} TL`;
}

function getSessionDisplayName(session: Session | null): string | null {
  const displayName = session?.user?.user_metadata?.display_name;
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }

  return session?.user?.email?.split("@")[0] ?? null;
}

function readRemovedCatalogIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REMOVED_CATALOG_IDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((value) => String(value)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeRemovedCatalogIds(ids: readonly string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(REMOVED_CATALOG_IDS_STORAGE_KEY, JSON.stringify(ids));
}

function readCatalogWatchItems(): CatalogWatchItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CATALOG_WATCHLIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item?.listing?.id)
      .map((item) => ({
        listing: item.listing as CatalogListing,
        savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
        alertPrice: Number.isFinite(Number(item.alertPrice)) && Number(item.alertPrice) > 0 ? Number(item.alertPrice) : null,
      }));
  } catch {
    return [];
  }
}

function writeCatalogWatchItems(items: readonly CatalogWatchItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CATALOG_WATCHLIST_STORAGE_KEY, JSON.stringify(items));
}

function mergeCatalogListingPages(current: readonly CatalogListing[], nextPage: readonly CatalogListing[]): CatalogListing[] {
  if (current.length === 0) {
    return [...nextPage];
  }

  const seenIds = new Set(current.map((listing) => listing.id));
  const additions = nextPage.filter((listing) => {
    if (seenIds.has(listing.id)) {
      return false;
    }

    seenIds.add(listing.id);
    return true;
  });

  return additions.length > 0 ? [...current, ...additions] : [...current];
}

function getSegmentSortValue(segment: string): number {
  const normalized = segment.replace(/\./g, "").replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function normalizeModelSearch(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

function compactModelSearch(value: string): string {
  return normalizeModelSearch(value).replace(/[^a-z0-9]/g, "");
}

function stripModelVramLabel(label: string): string {
  return label.replace(/\s+\d+\s*GB\b/gi, "").replace(/\s+/g, " ").trim();
}

function matchesModelSearch(label: string, query: string): boolean {
  const normalizedQuery = normalizeModelSearch(query);
  if (!normalizedQuery) {
    return true;
  }

  const normalizedLabel = normalizeModelSearch(label);
  return normalizedLabel.includes(normalizedQuery) || compactModelSearch(label).includes(compactModelSearch(query));
}

function parsePriceInput(value: string): number {
  const normalized = value.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getCatalogListingInsight(
  listing: CatalogListing,
  comparisonListings: readonly CatalogListing[],
  buyabilityIndex: BuyabilityIndex,
) {
  return listing.buyability ?? getBuyabilityInsight(listing, comparisonListings, buyabilityIndex);
}

function getCatalogSourceFilterKey(listing: CatalogListing): Exclude<CatalogSourceFilter, "all"> {
  if (listing.isInternal) {
    return "pecid";
  }

  const sourceNeedle = `${getSourceLabel(listing)} ${listing.externalUrl ?? ""}`.toLocaleLowerCase("tr-TR");
  if (sourceNeedle.includes("sahibinden")) {
    return "sahibinden";
  }

  if (sourceNeedle.includes("letgo")) {
    return "letgo";
  }

  if (sourceNeedle.includes("dolap")) {
    return "dolap";
  }

  if (sourceNeedle.includes("donanim haber") || sourceNeedle.includes("donanimhaber")) {
    return "donanimhaber";
  }

  if (sourceNeedle.includes("technopat") || sourceNeedle.includes("techolay") || sourceNeedle.includes("forum")) {
    return "external";
  }

  return "external";
}

function isCatalogReferenceBuyableListing(
  listing: CatalogListing,
  comparisonListings: readonly CatalogListing[],
  buyabilityIndex: BuyabilityIndex,
): boolean {
  const insight = getCatalogListingInsight(listing, comparisonListings, buyabilityIndex);
  // Referans fiyat yoksa (ör. CPU katalogu) yeterli karşılaştırma örneklemi de kabul edilir;
  // aksi halde "Popüler model" ve "Alınabilir" kartları o ürün tipinde hep boş kalıyordu.
  return insight.score >= 74 && (insight.isReferenceBased || insight.comparableCount >= 5);
}

function sortCatalogListings(
  listings: CatalogListing[],
  sortBy: CatalogFilterState["sortBy"],
  comparisonListings: readonly CatalogListing[],
  buyabilityIndex: BuyabilityIndex = buildBuyabilityIndex(comparisonListings),
): CatalogListing[] {
  const result = [...listings];

  switch (sortBy) {
    case CATALOG_SORT_OPTIONS.BUYABLE_DESC:
      return result.sort((a, b) => {
        const insightA = getCatalogListingInsight(a, comparisonListings, buyabilityIndex);
        const insightB = getCatalogListingInsight(b, comparisonListings, buyabilityIndex);
        return (
          getCatalogRankingScore(b, insightB) - getCatalogRankingScore(a, insightA) ||
          insightB.score - insightA.score ||
          a.price - b.price
        );
      });
    case CATALOG_SORT_OPTIONS.PRICE_ASC:
      return result.sort((a, b) => a.price - b.price);
    case CATALOG_SORT_OPTIONS.PRICE_DESC:
      return result.sort((a, b) => b.price - a.price);
    case CATALOG_SORT_OPTIONS.TITLE_ASC:
      return result.sort((a, b) => a.title.localeCompare(b.title, "tr"));
    case CATALOG_SORT_OPTIONS.LATEST:
    default:
      return result;
  }
}

function filterCatalogListings(
  listings: readonly CatalogListing[],
  filters: CatalogFilterState,
  activePriceCategory: string,
  activeModelCategories: readonly string[],
  buyabilityIndex?: BuyabilityIndex,
): CatalogListing[] {
  const query = filters.search.trim().toLowerCase();
  const hasMaxPriceFilter = filters.maxPrice > 0 && filters.maxPrice < DEFAULT_CATALOG_FILTERS.maxPrice;
  const resolvedBuyabilityIndex = buyabilityIndex ?? buildBuyabilityIndex(listings);

  const filtered = listings.filter((listing) => {
    if (getCatalogListingInsight(listing, listings, resolvedBuyabilityIndex).score < 50) {
      return false;
    }

    if (activePriceCategory !== ALL_CATEGORY_KEY && getPriceCategoryKey(listing) !== activePriceCategory) {
      return false;
    }

    if (activeModelCategories.length > 0 && !activeModelCategories.includes(getModelCategoryKey(listing))) {
      return false;
    }

    if (filters.brand !== "all" && listing.brand !== filters.brand) {
      return false;
    }

    if (filters.source !== "all" && getCatalogSourceFilterKey(listing) !== filters.source) {
      return false;
    }

    if (listing.price < filters.minPrice || (hasMaxPriceFilter && listing.price > filters.maxPrice)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${listing.title} ${listing.model} ${getModelFamily(listing)} ${listing.location} ${listing.segment}`
      .toLowerCase()
      .includes(query);
  });

  return sortCatalogListings(filtered, filters.sortBy, listings, resolvedBuyabilityIndex);
}

function applySpotlightFilter(
  listings: readonly CatalogListing[],
  spotlightFilter: CatalogSpotlightFilter,
  comparisonListings: readonly CatalogListing[],
  buyabilityIndex: BuyabilityIndex,
): CatalogListing[] {
  const result = [...listings];

  switch (spotlightFilter) {
    case "buyable":
      return result
        .filter((listing) => isCatalogReferenceBuyableListing(listing, comparisonListings, buyabilityIndex))
        .sort((a, b) => {
          const insightA = getCatalogListingInsight(a, comparisonListings, buyabilityIndex);
          const insightB = getCatalogListingInsight(b, comparisonListings, buyabilityIndex);
          return (
            getCatalogRankingScore(b, insightB) - getCatalogRankingScore(a, insightA) ||
            insightB.score - insightA.score ||
            a.price - b.price
          );
        });
    case "cheap":
      return result.sort((a, b) => a.price - b.price);
    case "expensive":
      return result.sort((a, b) => b.price - a.price);
    case "popular":
      return result
        .filter((listing) => isCatalogReferenceBuyableListing(listing, comparisonListings, buyabilityIndex))
        .sort((a, b) => {
          const insightA = getCatalogListingInsight(a, comparisonListings, buyabilityIndex);
          const insightB = getCatalogListingInsight(b, comparisonListings, buyabilityIndex);
          return (
            getCatalogRankingScore(b, insightB) - getCatalogRankingScore(a, insightA) ||
            insightB.score - insightA.score ||
            a.price - b.price
          );
        });
    default:
      return result;
  }
}

function CatalogLoadingScreen({
  listingCount,
  productType,
}: {
  readonly listingCount: number;
  readonly productType: ProductType;
}) {
  return (
    <section className="catalog-loader container" aria-live="polite" aria-label="Katalog yükleniyor">
      <Mascot size={130} mood="calm" />
      <div className="catalog-loader__copy">
        <strong>Defter hazırlanıyor</strong>
        <span className="mono">
          {listingCount > 0 ? `${listingCount.toLocaleString("tr-TR")} ${productType === "cpu" ? "işlemci" : "ekran kartı"} ilanı` : "İlanlar yükleniyor"}
        </span>
      </div>
    </section>
  );
}

function CatalogWatchPanel({
  items,
  onOpenListing,
  onRemoveItem,
  onSetPriceAlert,
}: {
  readonly items: readonly CatalogWatchItem[];
  readonly onOpenListing: (listing: CatalogListing) => void;
  readonly onRemoveItem: (listingId: string) => void;
  readonly onSetPriceAlert: (listing: CatalogListing) => void;
}) {
  const activeAlertCount = items.filter((item) => item.alertPrice).length;
  const triggeredAlertCount = items.filter((item) => item.alertPrice && item.listing.price <= item.alertPrice).length;

  return (
    <section className="catalog-watch" aria-label="Favori ve fiyat alarmı">
      <div className="catalog-watch__head">
        <div>
          <span>Takip listesi</span>
          <h3>Favoriler ve fiyat alarmları</h3>
        </div>
        <div className="catalog-watch__summary">
          <strong>{formatCount(items.length)}</strong>
          <span>takip</span>
          <strong>{formatCount(activeAlertCount)}</strong>
          <span>alarm</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="catalog-watch__empty">
          <Star size={16} />
          <span>İlan kartındaki yıldızla favoriye al, çanla fiyat alarmı kur.</span>
        </div>
      ) : (
        <div className="catalog-watch__list">
          {items.slice(0, 6).map((item) => {
            const isAlertTriggered = Boolean(item.alertPrice && item.listing.price <= item.alertPrice);

            return (
              <article className={`catalog-watch__item ${isAlertTriggered ? "is-triggered" : ""}`} key={item.listing.id}>
                <button type="button" className="catalog-watch__open" onClick={() => onOpenListing(item.listing)}>
                  <span>{item.listing.model || "Model belirsiz"}</span>
                  <strong>{item.listing.title}</strong>
                  <small>{item.listing.priceText || formatCurrency(item.listing.price)}</small>
                </button>
                <div className="catalog-watch__actions">
                  <button type="button" title="Fiyat alarmı" onClick={() => onSetPriceAlert(item.listing)}>
                    <BellRing size={14} />
                    {item.alertPrice ? formatCurrency(item.alertPrice) : "Alarm"}
                  </button>
                  <button type="button" title="Takipten kaldır" onClick={() => onRemoveItem(item.listing.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {triggeredAlertCount > 0 ? (
        <div className="catalog-watch__hit">
          <BellRing size={14} />
          {formatCount(triggeredAlertCount)} alarm hedef fiyatına ulaştı.
        </div>
      ) : null}
    </section>
  );
}

interface AppRouteState {
  readonly page: PageView;
  readonly modelSlug: string | null;
  readonly listingId: string | null;
}

function parseAppRoute(): AppRouteState {
  if (typeof window === "undefined") {
    return { page: "home", modelSlug: null, listingId: null };
  }

  const path = window.location.pathname.replace(/\/+$/g, "") || "/";
  if (path.startsWith("/model/")) {
    return { page: "catalog", modelSlug: decodeURIComponent(path.replace("/model/", "")), listingId: null };
  }

  if (path.startsWith("/ilan/")) {
    return { page: "catalog", modelSlug: null, listingId: decodeURIComponent(path.replace("/ilan/", "")) };
  }

  switch (path) {
    case "/marketplace":
      return { page: "catalog", modelSlug: null, listingId: null };
    case "/marketplace/cpu":
    case "/cpu":
    case "/islemci":
      return { page: "cpu", modelSlug: null, listingId: null };
    case "/sat":
    case "/ilan-ekle":
    case "/ilan-ekle/link":
      return { page: "submit-link", modelSlug: null, listingId: null };
    case "/ilan-ekle/manuel":
      return { page: "submit-manual", modelSlug: null, listingId: null };
    case "/giris":
      return { page: "signin", modelSlug: null, listingId: null };
    case "/kayit":
      return { page: "signup", modelSlug: null, listingId: null };
    case "/hakkimizda":
      return { page: "about", modelSlug: null, listingId: null };
    case "/yonetim":
      return { page: "admin", modelSlug: null, listingId: null };
    default:
      return { page: "home", modelSlug: null, listingId: null };
  }
}

function buildPagePath(page: PageView): string {
  switch (page) {
    case "catalog":
      return "/marketplace";
    case "cpu":
      return "/marketplace/cpu";
    case "submit-link":
      return "/ilan-ekle/link";
    case "submit-manual":
      return "/ilan-ekle/manuel";
    case "signin":
      return "/giris";
    case "signup":
      return "/kayit";
    case "admin":
      return "/yonetim";
    case "about":
      return "/hakkimizda";
    case "home":
    default:
      return "/";
  }
}

function setMetaContent(name: string, content: string) {
  if (typeof document === "undefined") {
    return;
  }

  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setMetaProperty(property: string, content: string) {
  if (typeof document === "undefined") {
    return;
  }

  let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setCanonicalHref(path: string) {
  if (typeof document === "undefined") {
    return;
  }

  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = `${SITE_URL}${path}`;
}

function setSeoJsonLd(title: string, description: string, canonicalPath: string) {
  if (typeof document === "undefined") {
    return;
  }

  let script = document.querySelector<HTMLScriptElement>("#site-jsonld");
  if (!script) {
    script = document.createElement("script");
    script.id = "site-jsonld";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: `${SITE_URL}${canonicalPath}`,
    inLanguage: "tr-TR",
    description,
    isPartOf: {
      "@type": "WebSite",
      name: "GPU Pusula",
      url: `${SITE_URL}/`,
    },
  });
}

export default function App() {
  const initialRoute = useMemo(() => {
    const route = parseAppRoute();
    // Girişte dogrudan Marketplace: kok adres deftere yonlendirilir.
    // "Ana Sayfa" menuden hala erisilebilir (yonlendirme yalnizca ilk aciliste).
    if (route.page === "home" && typeof window !== "undefined" && window.location.pathname === "/") {
      window.history.replaceState(null, "", "/marketplace");
      return { page: "catalog" as PageView, modelSlug: null, listingId: null };
    }
    return route;
  }, []);
  const [activePage, setActivePage] = useState<PageView>(initialRoute.page);
  const [routeModelSlug, setRouteModelSlug] = useState<string | null>(initialRoute.modelSlug);
  const [routeListingId, setRouteListingId] = useState<string | null>(initialRoute.listingId);
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);
  const [activePriceCategory, setActivePriceCategory] = useState(ALL_CATEGORY_KEY);
  const [selectedModelCategories, setSelectedModelCategories] = useState<string[]>([]);
  const [modelCategoryQuery, setModelCategoryQuery] = useState("");
  const [spotlightFilter, setSpotlightFilter] = useState<CatalogSpotlightFilter>(null);
  const [selectedListing, setSelectedListing] = useState<CatalogListing | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [featuredListings, setFeaturedListings] = useState<GpuListing[]>([]);
  const [catalogListings, setCatalogListings] = useState<CatalogListing[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [removedListingIds, setRemovedListingIds] = useState<string[]>(readRemovedCatalogIds);
  const [watchItems, setWatchItems] = useState<CatalogWatchItem[]>(readCatalogWatchItems);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("Bilinmiyor");
  const [catalogPage, setCatalogPage] = useState(1);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [navDirection, setNavDirection] = useState<"left" | "right">("right");
  const [isCatalogEntryLoading, setIsCatalogEntryLoading] = useState(false);
  const [accountSession, setAccountSession] = useState<Session | null>(null);
  const [accountProfile, setAccountProfile] = useState<SubmissionProfile | null>(null);
  const [submitAuthIntent, setSubmitAuthIntent] = useState<SubmitAuthIntent>("signin");
  const [accountNotifications, setAccountNotifications] = useState<HeaderNotification[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const activeCatalogProduct: ProductType = activePage === "cpu" ? "cpu" : "gpu";
  const isCpuCatalogPage = activeCatalogProduct === "cpu";

  const NAV_ORDER: readonly PageView[] = useMemo(
    () => ["home", "catalog", "cpu", "submit-link", "submit-manual", "signin", "signup", "admin", "about"],
    [],
  );

  const pushRoute = useCallback((route: AppRouteState, path: string) => {
    setActivePage((previousPage) => {
      const fromIndex = NAV_ORDER.indexOf(previousPage);
      const toIndex = NAV_ORDER.indexOf(route.page);
      if (fromIndex !== toIndex) {
        setNavDirection(toIndex > fromIndex ? "right" : "left");
      }
      return route.page;
    });
    setRouteModelSlug(route.modelSlug);
    setRouteListingId(route.listingId);

    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  const navigateToPage = useCallback((page: PageView) => {
    pushRoute({ page, modelSlug: null, listingId: null }, buildPagePath(page));
  }, [pushRoute]);

  const navigateToModelSlug = useCallback((slug: string) => {
    pushRoute({ page: "catalog", modelSlug: slug, listingId: null }, `/model/${encodeURIComponent(slug)}`);
  }, [pushRoute]);

  const navigateToListing = useCallback((listing: CatalogListing) => {
    if (listing.productType === "cpu") {
      setSelectedListing(listing);
      return;
    }

    pushRoute(
      { page: "catalog", modelSlug: null, listingId: listing.id },
      `/ilan/${encodeURIComponent(listing.id)}`,
    );
    setSelectedListing(listing);
  }, [pushRoute]);

  const loadAccountNotifications = useCallback(async (token: string) => {
    try {
      const notifications = await fetchAccountNotifications(token);
      setAccountNotifications(
        notifications.slice(0, 8).map((notification) => ({
          id: notification.id,
          title: notification.title,
          detail: notification.detail,
          timeLabel: formatDate(notification.createdAt),
          kind: notification.kind,
        })),
      );
    } catch (notificationError) {
      console.warn("Bildirimler yuklenemedi:", notificationError);
      setAccountNotifications([]);
    }
  }, []);

  const loadAccountWatchlist = useCallback(async (token: string) => {
    try {
      const remoteItems = await fetchAccountWatchlist(token);
      const nextItems = remoteItems
        .filter((item) => item.listing)
        .map((item) => ({
          listing: item.listing as CatalogListing,
          savedAt: item.createdAt,
          alertPrice: item.alertPrice,
        }));

      setWatchItems(nextItems);
      writeCatalogWatchItems(nextItems);
    } catch (watchlistError) {
      console.warn("Takip listesi yuklenemedi:", watchlistError);
    }
  }, []);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const dashboard = await fetchDashboard();
        setSummary(dashboard.summary);
        setFeaturedListings(dashboard.featuredListings);
        setLastUpdated(dashboard.lastUpdated ? formatDate(dashboard.lastUpdated) : "Bilinmiyor");
      } catch (loadError) {
        console.error("Dashboard metrikleri yüklenemedi:", loadError);
      } finally {
      }
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    let isMounted = true;

    getCurrentSession()
      .then((session) => {
        if (isMounted) {
          setAccountSession(session);
        }
      })
      .catch((sessionError) => {
        console.warn("Oturum bildirimi okunamadi:", sessionError);
      });

    const unsubscribe = subscribeToAuthChanges((session) => {
      setAccountSession(session);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      const route = parseAppRoute();
      setActivePage(route.page);
      setRouteModelSlug(route.modelSlug);
      setRouteListingId(route.listingId);
      if (!route.listingId) {
        setSelectedListing(null);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const token = accountSession?.access_token;
    if (!token) {
      setAccountProfile(null);
      setAccountNotifications([]);
      return;
    }

    void loadAccountNotifications(token);
    void loadAccountWatchlist(token);
    const refreshTimer = window.setInterval(() => {
      void loadAccountNotifications(token);
    }, 60000);

    return () => window.clearInterval(refreshTimer);
  }, [accountSession?.access_token, loadAccountNotifications, loadAccountWatchlist]);

  useEffect(() => {
    let isMounted = true;
    const token = accountSession?.access_token;

    if (!token) {
      setAccountProfile(null);
      return;
    }

    fetchMe(token)
      .then((data) => {
        if (isMounted) {
          setAccountProfile(data.profile);
        }
      })
      .catch((profileError) => {
        console.warn("Profil bilgisi okunamadi:", profileError);
        if (isMounted) {
          setAccountProfile(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountSession?.access_token]);

  useEffect(() => {
    if (activePage !== "catalog" && activePage !== "cpu") {
      setIsCatalogEntryLoading(false);
      setIsFilterDrawerOpen(false);
      return;
    }

    setIsCatalogEntryLoading(true);
    const timer = window.setTimeout(() => {
      setIsCatalogEntryLoading(false);
    }, CATALOG_ENTRY_LOADING_MS);

    return () => window.clearTimeout(timer);
  }, [activePage]);

  useEffect(() => {
    if (!isFilterDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFilterDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFilterDrawerOpen]);

  useEffect(() => {
    setCatalogFilters(DEFAULT_CATALOG_FILTERS);
    setActivePriceCategory(ALL_CATEGORY_KEY);
    setSelectedModelCategories([]);
    setModelCategoryQuery("");
    setSpotlightFilter(null);
    setSelectedListing(null);
    setCatalogListings([]);
    setCatalogTotal(0);
    setCatalogError(null);
  }, [activeCatalogProduct]);

  useEffect(() => {
    let isCancelled = false;

    async function loadCatalogData() {
      try {
        setIsCatalogLoading(true);
        setCatalogError(null);

        const firstPage = await fetchCatalog(DEFAULT_CATALOG_FILTERS, 1, CATALOG_FETCH_PAGE_SIZE, activeCatalogProduct);
        if (isCancelled) {
          return;
        }

        let mergedListings = mergeCatalogListingPages([], firstPage.listings);
        let totalPages = Math.max(1, firstPage.totalPages);

        setCatalogListings(mergedListings);
        setCatalogTotal(firstPage.total);
        setIsCatalogLoading(false);

        if (firstPage.lastUpdated) {
          setLastUpdated(formatDate(firstPage.lastUpdated));
        }

        for (let nextPage = 2; nextPage <= totalPages; nextPage += CATALOG_FETCH_CONCURRENCY) {
          const batchPages = Array.from(
            { length: Math.min(CATALOG_FETCH_CONCURRENCY, totalPages - nextPage + 1) },
            (_, index) => nextPage + index,
          );

          const batchResults = await Promise.all(
            batchPages.map((page) => fetchCatalog(DEFAULT_CATALOG_FILTERS, page, CATALOG_FETCH_PAGE_SIZE, activeCatalogProduct)),
          );
          if (isCancelled) {
            return;
          }

          for (const catalog of batchResults) {
            totalPages = Math.max(totalPages, catalog.totalPages);
            mergedListings = mergeCatalogListingPages(mergedListings, catalog.listings);
            setCatalogTotal(catalog.total);

            if (catalog.lastUpdated) {
              setLastUpdated(formatDate(catalog.lastUpdated));
            }
          }

          setCatalogListings(mergedListings);

          if (batchResults.some((catalog) => catalog.listings.length === 0)) {
            break;
          }
        }
      } catch (loadError) {
        if (isCancelled) {
          return;
        }

        console.error("Katalog yüklenemedi:", loadError);
        setCatalogError("Tam katalog yüklenemedi. API bağlantısını ve katalog cache verisini kontrol edin.");
      } finally {
        if (!isCancelled) {
          setIsCatalogLoading(false);
        }
      }
    }

    loadCatalogData();

    return () => {
      isCancelled = true;
    };
  }, [activeCatalogProduct]);

  useEffect(() => {
    initTilt3d();
  }, []);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogFilters, activePriceCategory, selectedModelCategories, spotlightFilter]);

  useEffect(() => {
    if (!isPortfolioOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPortfolioOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isPortfolioOpen]);

  const isAdminUser = accountProfile?.role === "admin";
  const removedListingIdSet = useMemo(
    () => new Set(isAdminUser ? removedListingIds : []),
    [isAdminUser, removedListingIds],
  );
  const activeCatalogListings = useMemo(
    () =>
      catalogListings.filter((listing) => {
        const productType = listing.productType === "cpu" ? "cpu" : "gpu";
        return productType === activeCatalogProduct && !removedListingIdSet.has(listing.id);
      }),
    [activeCatalogProduct, catalogListings, removedListingIdSet],
  );
  const latestListingById = useMemo(
    () => new Map(activeCatalogListings.map((listing) => [listing.id, listing])),
    [activeCatalogListings],
  );
  const activeWatchItems = useMemo(
    () =>
      watchItems
        .filter((item) => !removedListingIdSet.has(item.listing.id))
        .map((item) => ({
          ...item,
          listing: latestListingById.get(item.listing.id) ?? item.listing,
        })),
    [latestListingById, removedListingIdSet, watchItems],
  );
  const watchItemMap = useMemo(
    () => new Map(activeWatchItems.map((item) => [item.listing.id, item])),
    [activeWatchItems],
  );

  useEffect(() => {
    if (selectedListing && removedListingIdSet.has(selectedListing.id)) {
      setSelectedListing(null);
    }
  }, [removedListingIdSet, selectedListing]);

  const buyabilityIndex = useMemo(
    () => buildBuyabilityIndex(activeCatalogListings, activeCatalogProduct === "gpu" ? featuredListings : []),
    [activeCatalogListings, activeCatalogProduct, featuredListings],
  );

  const categoryBaseListings = useMemo(
    () =>
      filterCatalogListings(
        activeCatalogListings,
        catalogFilters,
        ALL_CATEGORY_KEY,
        [],
        buyabilityIndex,
      ),
    [activeCatalogListings, buyabilityIndex, catalogFilters],
  );

  const priceCategories = useMemo(() => {
    return buildCategoryOptions(categoryBaseListings, "Tümü", getPriceCategoryKey, getPriceCategoryLabel).sort(
      (categoryA, categoryB) => {
        if (categoryA.key === ALL_CATEGORY_KEY) return -1;
        if (categoryB.key === ALL_CATEGORY_KEY) return 1;
        return getSegmentSortValue(categoryA.label) - getSegmentSortValue(categoryB.label);
      },
    );
  }, [categoryBaseListings]);

  const modelCategories = useMemo(() => {
    return buildCategoryOptions(categoryBaseListings, "Tüm modeller", getModelCategoryKey, getModelCategoryLabel)
      .sort((categoryA, categoryB) => {
        if (categoryA.key === ALL_CATEGORY_KEY) return -1;
        if (categoryB.key === ALL_CATEGORY_KEY) return 1;
        if (categoryA.label === "Model belirsiz") return 1;
        if (categoryB.label === "Model belirsiz") return -1;
        return categoryB.count - categoryA.count || categoryA.label.localeCompare(categoryB.label, "tr");
      });
  }, [categoryBaseListings]);

  const visibleModelCategories = useMemo(() => {
    return modelCategories.filter(
      (category) => category.key === ALL_CATEGORY_KEY || matchesModelSearch(category.label, modelCategoryQuery),
    );
  }, [modelCategories, modelCategoryQuery]);

  useEffect(() => {
    if (!routeModelSlug || modelCategories.length <= 1) {
      return;
    }

    const matchedCategory = modelCategories.find(
      (category) =>
        category.key !== ALL_CATEGORY_KEY &&
        (slugifyModelLabel(category.label) === routeModelSlug || slugifyModelLabel(stripModelVramLabel(category.label)) === routeModelSlug),
    );
    if (matchedCategory) {
      setSelectedModelCategories([matchedCategory.key]);
      setModelCategoryQuery(matchedCategory.label);
      setSpotlightFilter(null);
      setActivePriceCategory(ALL_CATEGORY_KEY);
      return;
    }

    setModelCategoryQuery(routeModelSlug.replace(/-/g, " "));
  }, [modelCategories, routeModelSlug]);

  useEffect(() => {
    if (!routeListingId || activeCatalogListings.length === 0) {
      return;
    }

    const listing = activeCatalogListings.find((candidate) => candidate.id === routeListingId);
    if (listing) {
      setSelectedListing((current) => (current?.id === listing.id ? current : listing));
    }
  }, [activeCatalogListings, routeListingId]);

  useEffect(() => {
    if (activePriceCategory !== ALL_CATEGORY_KEY && !priceCategories.some((category) => category.key === activePriceCategory)) {
      setActivePriceCategory(ALL_CATEGORY_KEY);
    }

    const validModelKeys = new Set(modelCategories.map((category) => category.key));
    const nextSelectedModels = selectedModelCategories.filter((key) => validModelKeys.has(key));
    if (nextSelectedModels.length !== selectedModelCategories.length) {
      setSelectedModelCategories(nextSelectedModels);
    }
  }, [activePriceCategory, modelCategories, priceCategories, selectedModelCategories]);

  const baseFilteredCatalogListings = useMemo(
    () =>
      filterCatalogListings(
        activeCatalogListings,
        catalogFilters,
        activePriceCategory,
        selectedModelCategories,
        buyabilityIndex,
      ),
    [activeCatalogListings, activePriceCategory, buyabilityIndex, catalogFilters, selectedModelCategories],
  );

  const filteredCatalogListings = useMemo(
    () => applySpotlightFilter(baseFilteredCatalogListings, spotlightFilter, activeCatalogListings, buyabilityIndex),
    [activeCatalogListings, baseFilteredCatalogListings, buyabilityIndex, spotlightFilter],
  );

  const catalogTotalPages = Math.max(1, Math.ceil(filteredCatalogListings.length / CATALOG_PAGE_SIZE));
  const visibleCatalogListings = useMemo(() => {
    const startIndex = (catalogPage - 1) * CATALOG_PAGE_SIZE;
    return filteredCatalogListings.slice(startIndex, startIndex + CATALOG_PAGE_SIZE);
  }, [catalogPage, filteredCatalogListings]);

  useEffect(() => {
    if (catalogPage > catalogTotalPages) {
      setCatalogPage(catalogTotalPages);
    }
  }, [catalogPage, catalogTotalPages]);


  const catalogDisplayTotal = catalogTotal || activeCatalogListings.length || (isCpuCatalogPage ? 0 : featuredListings.length);
  const isCatalogScreenLoading = isCatalogLoading || isCatalogEntryLoading;
  const recognizedModelCount = summary?.recognizedModelCount ?? 0;
  const candidateCount = summary?.candidateCount ?? 0;
  const selectedModelCategoryOptions = modelCategories.filter((category) => selectedModelCategories.includes(category.key));
  const activeFilterCount = useMemo(() => {
    return [
      catalogFilters.search.trim(),
      catalogFilters.brand !== "all",
      catalogFilters.source !== "all",
      catalogFilters.minPrice > 0,
      catalogFilters.maxPrice > 0 && catalogFilters.maxPrice < 100000,
      catalogFilters.sortBy !== DEFAULT_CATALOG_FILTERS.sortBy,
      activePriceCategory !== ALL_CATEGORY_KEY,
      spotlightFilter,
      ...selectedModelCategories,
    ].filter(Boolean).length;
  }, [activePriceCategory, catalogFilters, selectedModelCategories, spotlightFilter]);
  const activeFilterChips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (catalogFilters.search.trim()) {
    activeFilterChips.push({
      key: "search",
      label: `Ara: ${catalogFilters.search.trim()}`,
      onRemove: () => setCatalogFilters((current) => ({ ...current, search: "" })),
    });
  }
  if (catalogFilters.brand !== "all") {
    activeFilterChips.push({
      key: "brand",
      label: catalogFilters.brand,
      onRemove: () => setCatalogFilters((current) => ({ ...current, brand: "all" })),
    });
  }
  if (catalogFilters.source !== "all") {
    activeFilterChips.push({
      key: "source",
      label: SOURCE_CHIP_LABELS[catalogFilters.source],
      onRemove: () => setCatalogFilters((current) => ({ ...current, source: "all" })),
    });
  }
  if (catalogFilters.minPrice > 0) {
    activeFilterChips.push({
      key: "min",
      label: `Min ${formatCurrency(catalogFilters.minPrice)}`,
      onRemove: () => setCatalogFilters((current) => ({ ...current, minPrice: 0 })),
    });
  }
  if (catalogFilters.maxPrice > 0 && catalogFilters.maxPrice < DEFAULT_CATALOG_FILTERS.maxPrice) {
    activeFilterChips.push({
      key: "max",
      label: `Maks ${formatCurrency(catalogFilters.maxPrice)}`,
      onRemove: () => setCatalogFilters((current) => ({ ...current, maxPrice: DEFAULT_CATALOG_FILTERS.maxPrice })),
    });
  }
  if (activePriceCategory !== ALL_CATEGORY_KEY) {
    activeFilterChips.push({
      key: "price-category",
      label: priceCategories.find((category) => category.key === activePriceCategory)?.label ?? "Fiyat aralığı",
      onRemove: () => setActivePriceCategory(ALL_CATEGORY_KEY),
    });
  }
  for (const category of selectedModelCategoryOptions) {
    activeFilterChips.push({
      key: `model-${category.key}`,
      label: category.label,
      onRemove: () => toggleModelCategory(category.key),
    });
  }
  if (spotlightFilter) {
    const spotlightLabels: Record<Exclude<CatalogSpotlightFilter, null>, string> = {
      cheap: "En ucuz",
      popular: "Popüler model",
      expensive: "Pahalı",
      buyable: "Alınabilir",
    };
    activeFilterChips.push({
      key: "spotlight",
      label: spotlightLabels[spotlightFilter],
      onRemove: () => setSpotlightFilter(null),
    });
  }

  const selectedListingInsight = selectedListing
    ? getCatalogListingInsight(selectedListing, activeCatalogListings, buyabilityIndex)
    : null;
  const activeModelSummary = useMemo(() => {
    const selectedModel = selectedModelCategoryOptions[0];
    if (!selectedModel) {
      return null;
    }

    const modelListings = activeCatalogListings.filter((listing) => selectedModelCategories.includes(getModelCategoryKey(listing)));
    const pricedListings = modelListings.filter((listing) => listing.price > 0).sort((a, b) => a.price - b.price);
    const middle = Math.floor(pricedListings.length / 2);
    const medianPrice =
      pricedListings.length === 0
        ? null
        : pricedListings.length % 2 === 0
          ? Math.round((pricedListings[middle - 1].price + pricedListings[middle].price) / 2)
          : pricedListings[middle].price;
    const buyableCount = modelListings.filter(
      (listing) => getCatalogListingInsight(listing, activeCatalogListings, buyabilityIndex).score >= 74,
    ).length;

    return {
      label: selectedModel.label,
      count: modelListings.length,
      buyableCount,
      minPrice: pricedListings[0]?.price ?? null,
      medianPrice,
      maxPrice: pricedListings[pricedListings.length - 1]?.price ?? null,
    };
  }, [activeCatalogListings, buyabilityIndex, selectedModelCategories, selectedModelCategoryOptions]);

  useEffect(() => {
    const firstSelectedModel = selectedModelCategoryOptions[0];
    let title = "İkinci El Ekran Kartı Fiyatları ve GPU İlanları | GPU Pusula";
    let description =
      "GPU Pusula ile ikinci el ekran kartı fiyatlarını, RTX, GTX, RX ve Intel Arc GPU ilanlarını alınabilirlik skoru ve güncel piyasa referansıyla karşılaştır.";
    let canonicalPath = buildPagePath(activePage);

    if (selectedListing) {
      title = `${selectedListing.model || selectedListing.title} ilan detayı | GPU Pusula`;
      description = `${selectedListing.title} için fiyat, alınabilirlik skoru, yorumlar ve risk sinyalleri.`;
      canonicalPath = `/ilan/${encodeURIComponent(selectedListing.id)}`;
    } else if (activePage === "catalog" && firstSelectedModel) {
      title = `${firstSelectedModel.label} ikinci el ekran kartı fiyatları | GPU Pusula`;
      description = `${firstSelectedModel.label} ilanlarını en ucuz, pahalı, popüler ve alınabilir seçeneklere göre incele.`;
      canonicalPath = `/model/${encodeURIComponent(slugifyModelLabel(firstSelectedModel.label))}`;
    } else if (activePage === "catalog") {
      title = "İkinci El Ekran Kartı İlanları ve Fiyatları | GPU Pusula";
      description =
        "Güncel ikinci el ekran kartı ilanlarını model, fiyat, konum ve alınabilirlik skoruyla filtrele. RTX, GTX, RX ve Intel Arc GPU seçeneklerini karşılaştır.";
    } else if (activePage === "cpu") {
      title = "İkinci El İşlemci İlanları ve CPU Fiyatları | GPU Pusula";
      description =
        "Güncel ikinci el işlemci ilanlarını Ryzen, Intel Core ve Xeon modellerine göre fiyat ve alınabilirlik skoru ile filtrele.";
    } else if (activePage === "submit-link") {
      title = "İlan linki gönder | GPU Pusula";
      description = "Ekran kartı ilan linkini gönder, analiz ve yayın incelemesini hesabından takip et.";
    } else if (activePage === "submit-manual") {
      title = "Manuel ekran kartı ilanı gönder | GPU Pusula";
      description = "Ekran kartı ilanını fotoğraf ve bilgilerle manuel gönder, inceleme durumunu hesabından takip et.";
    } else if (activePage === "signin") {
      title = "Giriş yap | GPU Pusula";
      description = "GPU Pusula hesabına giriş yap ve gönderdiğin ekran kartı ilanlarını takip et.";
    } else if (activePage === "signup") {
      title = "Kayıt ol | GPU Pusula";
      description = "GPU Pusula hesabı oluştur, ekran kartı ilanı gönder ve yayın sürecini takip et.";
    } else if (activePage === "about") {
      title = "GPU Pusula Nedir? İkinci El GPU Rehberi";
      description = "GPU Pusula ikinci el GPU ilanlarını model, fiyat, yorum ve risk sinyalleriyle okunabilir hale getirir.";
    }

    document.title = title;
    setMetaContent("description", description);
    setMetaContent("keywords", DEFAULT_SEO_KEYWORDS);
    setMetaContent("robots", "index, follow, max-image-preview:large");
    setMetaProperty("og:title", title);
    setMetaProperty("og:description", description);
    setMetaProperty("og:url", `${SITE_URL}${canonicalPath}`);
    setMetaProperty("og:type", selectedListing ? "product" : "website");
    setMetaProperty("og:site_name", "GPU Pusula");
    setMetaProperty("og:locale", "tr_TR");
    setMetaContent("twitter:card", "summary_large_image");
    setMetaContent("twitter:title", title);
    setMetaContent("twitter:description", description);
    setCanonicalHref(canonicalPath);
    setSeoJsonLd(title, description, canonicalPath);
  }, [activePage, selectedListing, selectedModelCategoryOptions]);
  const catalogHighlights = useMemo(() => {
    const pool = baseFilteredCatalogListings.length ? baseFilteredCatalogListings : categoryBaseListings;
    const listingsWithPrice = pool.filter((listing) => listing.price > 0);
    const cheapest = listingsWithPrice.reduce<CatalogListing | null>(
      (best, listing) => (!best || listing.price < best.price ? listing : best),
      null,
    );
    const expensive = listingsWithPrice.reduce<CatalogListing | null>(
      (best, listing) => (!best || listing.price > best.price ? listing : best),
      null,
    );
    const buyableListings = listingsWithPrice
      .filter((listing) => isCatalogReferenceBuyableListing(listing, activeCatalogListings, buyabilityIndex))
      .sort(
        (listingA, listingB) =>
          getCatalogListingInsight(listingB, activeCatalogListings, buyabilityIndex).score -
          getCatalogListingInsight(listingA, activeCatalogListings, buyabilityIndex).score,
      );
    const buyable = buyableListings.reduce<CatalogListing | null>((best, listing) => {
      if (!best) return listing;
      return getCatalogListingInsight(listing, activeCatalogListings, buyabilityIndex).score >
        getCatalogListingInsight(best, activeCatalogListings, buyabilityIndex).score
        ? listing
        : best;
    }, null);
    const popularModel =
      buildCategoryOptions(buyableListings, "Tüm modeller", getModelCategoryKey, getModelCategoryLabel)
        .filter((category) => category.key !== ALL_CATEGORY_KEY && category.label !== "Model belirsiz")
        .sort((categoryA, categoryB) => categoryB.count - categoryA.count || categoryA.label.localeCompare(categoryB.label, "tr"))[0] ??
      null;

    return { cheapest, expensive, buyable, buyableCount: buyableListings.length, popularModel };
  }, [activeCatalogListings, baseFilteredCatalogListings, buyabilityIndex, categoryBaseListings]);
  const modelIndexRows = useMemo(() => {
    return modelCategories
      .filter((category) => category.key !== ALL_CATEGORY_KEY && category.label !== "Model belirsiz")
      .slice(0, 9)
      .map((category) => {
        const prices = activeCatalogListings
          .filter((listing) => getModelCategoryKey(listing) === category.key && listing.price > 0)
          .map((listing) => listing.price)
          .sort((a, b) => a - b);
        const middle = Math.floor(prices.length / 2);
        const median =
          prices.length === 0
            ? null
            : prices.length % 2 === 0
              ? Math.round((prices[middle - 1] + prices[middle]) / 2)
              : prices[middle];

        return {
          key: category.key,
          label: category.label,
          count: category.count,
          median,
          min: prices[0] ?? null,
          max: prices[prices.length - 1] ?? null,
        };
      });
  }, [activeCatalogListings, modelCategories]);

  const topDeals = useMemo(
    () => [...featuredListings].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 5),
    [featuredListings],
  );

  const topBuyables = useMemo(() => {
    return activeCatalogListings
      .filter((listing) => listing.price > 0)
      .map((listing) => ({ listing, insight: getCatalogListingInsight(listing, activeCatalogListings, buyabilityIndex) }))
      .filter((entry) => entry.insight.isReferenceBased)
      .sort((a, b) => b.insight.score - a.insight.score || a.listing.price - b.listing.price)
      .slice(0, 5);
  }, [activeCatalogListings, buyabilityIndex]);

  const sessionDateLabel = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });

  const indexBlocks = [
    { label: "İlan", value: formatCount(catalogDisplayTotal), foot: "6 saatte bir yenilenir" },
    {
      label: "Model",
      value: recognizedModelCount ? formatCount(recognizedModelCount) : "—",
      foot: "4 kaynaktan eşlendi",
    },
    { label: "Alınabilir aday", value: candidateCount ? formatCount(candidateCount) : "—", foot: "Skor ≥ 75" },
  ];

  function resetCatalogView() {
    setCatalogFilters(DEFAULT_CATALOG_FILTERS);
    setActivePriceCategory(ALL_CATEGORY_KEY);
    setSelectedModelCategories([]);
    setModelCategoryQuery("");
    setSpotlightFilter(null);
  }

  function handleHeaderSearchChange(value: string) {
    setCatalogFilters((current) => ({ ...current, search: value }));
    if (value.trim()) {
      navigateToPage(activeCatalogProduct === "cpu" ? "cpu" : "catalog");
    }
  }

  function handleHeaderSearchSubmit() {
    navigateToPage(activeCatalogProduct === "cpu" ? "cpu" : "catalog");
  }

  function handleNotificationSelect() {
    setIsNotificationPanelOpen(false);
    setSubmitAuthIntent("signin");
    navigateToPage(accountSession ? "submit-link" : "signin");
  }

  function handleAuthNavigate(intent: SubmitAuthIntent) {
    setIsNotificationPanelOpen(false);
    setSubmitAuthIntent(intent);
    navigateToPage(intent);
  }

  function handleCatalogPageChange(nextPage: number) {
    const boundedPage = Math.min(Math.max(1, nextPage), catalogTotalPages);
    setCatalogPage(boundedPage);
    window.requestAnimationFrame(() => {
      document.getElementById("listing-feed")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function handleToggleNotifications() {
    setIsNotificationPanelOpen((current) => !current);
    if (accountSession?.access_token) {
      void loadAccountNotifications(accountSession.access_token);
    }
  }

  function handleAccountChanged() {
    void getCurrentSession()
      .then((session) => {
        setAccountSession(session);
        if (session?.access_token) {
          void loadAccountNotifications(session.access_token);
        } else {
          setAccountNotifications([]);
        }
      })
      .catch((sessionError) => {
        console.warn("Oturum yenilenemedi:", sessionError);
      });
  }

  function handleRequireCommentAuth() {
    setSelectedListing(null);
    setSubmitAuthIntent("signin");
    navigateToPage("signin");
  }

  async function handleRemoveListing(listing: CatalogListing) {
    if (!isAdminUser) {
      setCatalogNotice("İlan kaldırma yalnızca yönetici hesabına açık.");
      return;
    }

    const confirmed = window.confirm(`"${listing.title}" ilanını katalogdan kaldırmak istiyor musun?`);
    if (!confirmed) {
      return;
    }

    setRemovedListingIds((current) => {
      const next = Array.from(new Set([...current, listing.id]));
      writeRemovedCatalogIds(next);
      return next;
    });
    setWatchItems((current) => {
      const next = current.filter((item) => item.listing.id !== listing.id);
      writeCatalogWatchItems(next);
      return next;
    });
    setSelectedListing((current) => (current?.id === listing.id ? null : current));

    try {
      await deleteCatalogListing(listing.id, accountSession?.access_token ?? null);
      setCatalogNotice("İlan katalogdan kaldırıldı ve API gizli listesine kaydedildi.");
    } catch (removeError) {
      console.warn("Katalog ilani API uzerinden kaldirilamadi:", removeError);
      setCatalogNotice("İlan bu cihazda gizlendi. API kalıcı kaldırma yanıt vermedi.");
    }
  }

  async function handleToggleFavorite(listing: CatalogListing) {
    const isFavorite = watchItemMap.has(listing.id);
    const token = accountSession?.access_token ?? null;

    setWatchItems((current) => {
      const existing = current.find((item) => item.listing.id === listing.id);
      const next = existing
        ? current.filter((item) => item.listing.id !== listing.id)
        : [{ listing, savedAt: new Date().toISOString(), alertPrice: null }, ...current];
      writeCatalogWatchItems(next);
      return next;
    });

    setCatalogNotice(isFavorite ? "İlan takip listesinden kaldırıldı." : "İlan takip listesine eklendi.");

    if (!token) {
      return;
    }

    try {
      if (isFavorite) {
        await deleteAccountWatchlistItem(listing.id, token);
      } else {
        await saveAccountWatchlistItem(listing.id, null, token);
      }
      void loadAccountNotifications(token);
    } catch (watchlistError) {
      console.warn("Takip listesi sunucuya kaydedilemedi:", watchlistError);
      setCatalogNotice("Takip bu cihazda güncellendi; hesap kaydı şu an tamamlanamadı.");
    }
  }

  async function handleSetPriceAlert(listing: CatalogListing) {
    const currentTarget = watchItemMap.get(listing.id)?.alertPrice ?? Math.max(1, Math.round(listing.price * 0.9));
    const input = window.prompt(
      `${listing.title} için hedef fiyatı TL olarak yaz. Alarmı kaldırmak için 0 bırakabilirsin.`,
      String(currentTarget),
    );

    if (input === null) {
      return;
    }

    const nextAlertPrice = parsePriceInput(input);
    if (!Number.isFinite(nextAlertPrice) || nextAlertPrice < 0) {
      setCatalogNotice("Fiyat alarmı için geçerli bir TL tutarı yazman gerekiyor.");
      return;
    }

    setWatchItems((current) => {
      const existing = current.find((item) => item.listing.id === listing.id);
      const alertPrice = nextAlertPrice > 0 ? Math.round(nextAlertPrice) : null;
      const next = existing
        ? current.map((item) => (item.listing.id === listing.id ? { ...item, listing, alertPrice } : item))
        : [{ listing, savedAt: new Date().toISOString(), alertPrice }, ...current];
      writeCatalogWatchItems(next);
      return next;
    });

    setCatalogNotice(
      nextAlertPrice > 0
        ? `${formatCurrency(Math.round(nextAlertPrice))} hedefli fiyat alarmı kaydedildi.`
        : "Fiyat alarmı kaldırıldı; ilan takip listesinde kaldı.",
    );

    if (accountSession?.access_token) {
      try {
        await saveAccountWatchlistItem(listing.id, nextAlertPrice > 0 ? Math.round(nextAlertPrice) : null, accountSession.access_token);
        void loadAccountNotifications(accountSession.access_token);
      } catch (watchlistError) {
        console.warn("Fiyat alarmi sunucuya kaydedilemedi:", watchlistError);
        setCatalogNotice("Fiyat alarmı bu cihazda kaydedildi; hesap kaydı şu an tamamlanamadı.");
      }
    }
  }

  async function handleRemoveWatchItem(listingId: string) {
    setWatchItems((current) => {
      const next = current.filter((item) => item.listing.id !== listingId);
      writeCatalogWatchItems(next);
      return next;
    });
    setCatalogNotice("İlan takip listesinden kaldırıldı.");

    if (accountSession?.access_token) {
      try {
        await deleteAccountWatchlistItem(listingId, accountSession.access_token);
        void loadAccountNotifications(accountSession.access_token);
      } catch (watchlistError) {
        console.warn("Takip sunucudan kaldirilamadi:", watchlistError);
        setCatalogNotice("Takip bu cihazda kaldırıldı; hesap kaydı şu an güncellenemedi.");
      }
    }
  }

  async function restoreRemovedListings() {
    if (!isAdminUser) {
      setCatalogNotice("Geri alma işlemi yalnızca yönetici hesabına açık.");
      return;
    }

    writeRemovedCatalogIds([]);
    setRemovedListingIds([]);

    try {
      await restoreCatalogListings(accountSession?.access_token ?? null);
      setCatalogNotice("Kaldırılan ilanlar geri getirildi.");
    } catch (restoreError) {
      console.warn("Katalog gizli listesi API uzerinden temizlenemedi:", restoreError);
      setCatalogNotice("Bu cihazdaki gizlenen ilanlar geri getirildi.");
    }
  }

  function toggleModelCategory(categoryKey: string) {
    setSpotlightFilter((current) => (current === "popular" ? null : current));

    if (categoryKey === ALL_CATEGORY_KEY) {
      setSelectedModelCategories([]);
      navigateToPage(activeCatalogProduct === "cpu" ? "cpu" : "catalog");
      return;
    }

    const category = modelCategories.find((item) => item.key === categoryKey);
    const isSelected = selectedModelCategories.includes(categoryKey);
    setSelectedModelCategories((current) =>
      current.includes(categoryKey) ? current.filter((key) => key !== categoryKey) : [...current, categoryKey],
    );

    if (activeCatalogProduct === "gpu" && !isSelected && category && selectedModelCategories.length === 0) {
      navigateToModelSlug(slugifyModelLabel(category.label));
    } else {
      navigateToPage(activeCatalogProduct === "cpu" ? "cpu" : "catalog");
    }
  }

  function toggleSpotlightFilter(nextFilter: Exclude<CatalogSpotlightFilter, "popular" | null>) {
    setSpotlightFilter((current) => (current === nextFilter ? null : nextFilter));
  }

  function showPopularModelFilter() {
    const popularModel = catalogHighlights.popularModel;
    if (!popularModel) {
      return;
    }

    const isAlreadyActive = spotlightFilter === "popular" && selectedModelCategories.length === 1 && selectedModelCategories[0] === popularModel.key;
    if (isAlreadyActive) {
      setSpotlightFilter(null);
      setSelectedModelCategories([]);
      return;
    }

    setSelectedModelCategories([popularModel.key]);
    setSpotlightFilter("popular");
    if (activeCatalogProduct === "gpu") {
      navigateToModelSlug(slugifyModelLabel(popularModel.label));
    } else {
      navigateToPage("cpu");
    }
  }

  return (
    <>
      <Ticker
        items={featuredListings}
        onSelect={(item, element) => {
          const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
          const wantedModel = normalize(item.model);
          const match =
            catalogListings.find(
              (listing) => listing.price === item.price && normalize(listing.model) === wantedModel,
            ) ??
            catalogListings.find(
              (listing) => listing.price === item.price && normalize(listing.title).includes(wantedModel),
            );
          if (match) {
            flyTicketToPanel(
              element,
              {
                model: item.model,
                priceText: `${item.price.toLocaleString("tr-TR")} TL`,
                deltaText: `%-${item.discountPercent}`,
              },
              () => navigateToListing(match),
            );
          } else {
            flyTicketToPanel(
              element,
              {
                model: item.model,
                priceText: `${item.price.toLocaleString("tr-TR")} TL`,
                deltaText: `%-${item.discountPercent}`,
              },
              () => navigateToModelSlug(slugifyModelLabel(item.model)),
              defterTarget(),
            );
          }
        }}
      />
      <Header
        activePage={activePage}
        onNavigate={(page) => {
          setIsNotificationPanelOpen(false);
          navigateToPage(page);
        }}
        listingCount={catalogDisplayTotal}
        lastUpdated={lastUpdated}
        searchValue={catalogFilters.search}
        onSearchChange={handleHeaderSearchChange}
        onSearchSubmit={handleHeaderSearchSubmit}
        isSignedIn={Boolean(accountSession)}
        accountLabel={getSessionDisplayName(accountSession)}
        isAdmin={isAdminUser}
        onAuthNavigate={handleAuthNavigate}
        notifications={accountNotifications}
        isNotificationPanelOpen={isNotificationPanelOpen}
        onToggleNotifications={handleToggleNotifications}
        onNotificationSelect={handleNotificationSelect}
        onOpenPortfolio={() => setIsPortfolioOpen(true)}
        portfolioCount={activeWatchItems.length}
      />

      <main className={`app-main app-main--${navDirection}`}>
        {activePage === "home" && (
          <section className="page page--home" aria-labelledby="home-title">
            <section className="desk container">
              <header className="desk__head pastel-wash">
                <div>
                  <span className="micro-label desk__eyebrow">Piyasa özeti</span>
                  <h2 id="home-title">Açık seans — {sessionDateLabel}</h2>
                  <span className="desk__meta">Son senkron {lastUpdated} · 4 kaynak aktif</span>
                </div>
                <Mascot size={170} />
              </header>

              <div className="desk__index" aria-label="Piyasa endeksleri">
                {indexBlocks.map((block) => (
                  <article className="desk__index-block" key={block.label}>
                    <span className="micro-label">{block.label}</span>
                    <strong className="mono">{block.value}</strong>
                    <small className="micro-label">{block.foot}</small>
                  </article>
                ))}
              </div>

              <div className="desk__columns">
                <section className="desk__panel desk__panel--index" aria-label="Model endeksi">
                  <header className="desk__panel-head">
                    <span className="micro-label">Model Endeksi</span>
                    <button type="button" className="desk__panel-link" onClick={() => navigateToPage("catalog")}>
                      Marketplace →
                    </button>
                  </header>
                  <div className="desk__table-head micro-label" aria-hidden="true">
                    <span>Model</span>
                    <span>Medyan</span>
                    <span>İlan</span>
                    <span>Aralık</span>
                  </div>
                  {modelIndexRows.length === 0 ? (
                    <p className="desk__empty">Katalog yükleniyor…</p>
                  ) : (
                    modelIndexRows.map((row) => (
                      <button
                        type="button"
                        className="desk__table-row"
                        key={row.key}
                        onClick={() => navigateToModelSlug(slugifyModelLabel(row.label))}
                      >
                        <strong>{row.label}</strong>
                        <span className="mono">{row.median ? formatCurrency(row.median) : "—"}</span>
                        <span className="mono">{formatCount(row.count)}</span>
                        <span className="mono desk__range">
                          {row.min && row.max ? `${formatCount(row.min)} – ${formatCount(row.max)} TL` : "—"}
                        </span>
                      </button>
                    ))
                  )}
                </section>

                <div className="desk__side">
                  <section className="desk__panel" aria-label="En iyi fırsatlar">
                    <header className="desk__panel-head">
                      <span className="micro-label">Referans Altı · En İyi Fırsatlar</span>
                    </header>
                    {topDeals.length === 0 ? (
                      <p className="desk__empty">Veri bekleniyor.</p>
                    ) : (
                      topDeals.map((deal, index) => (
                        <button
                          type="button"
                          className="desk__mover"
                          key={deal.id}
                          onClick={() => navigateToModelSlug(slugifyModelLabel(deal.model))}
                        >
                          <span className="mono desk__mover-no">{String(index + 1).padStart(2, "0")}</span>
                          <strong>{deal.model}</strong>
                          <span className="mono desk__mover-delta">%-{deal.discountPercent}</span>
                        </button>
                      ))
                    )}
                  </section>

                  <section className="desk__panel" aria-label="En alınabilirler">
                    <header className="desk__panel-head">
                      <span className="micro-label">En Alınabilirler</span>
                    </header>
                    {topBuyables.length === 0 ? (
                      <p className="desk__empty">Veri bekleniyor.</p>
                    ) : (
                      topBuyables.map((entry) => (
                        <button
                          type="button"
                          className="desk__mover desk__mover--buyable"
                          key={entry.listing.id}
                          onClick={() => navigateToListing(entry.listing)}
                        >
                          <strong>{entry.listing.model || entry.listing.title}</strong>
                          <span className="mono">{formatCurrency(entry.listing.price)}</span>
                          <span
                            className="desk__score mono"
                            data-tier={entry.insight.score >= 75 ? "high" : entry.insight.score >= 45 ? "mid" : "low"}
                          >
                            {entry.insight.score}
                          </span>
                        </button>
                      ))
                    )}
                  </section>
                </div>
              </div>

              <div className="desk__protocol" aria-label="Nasıl çalışır">
                <article>
                  <span className="mono desk__protocol-no">01</span>
                  <strong>Tara</strong>
                  <p>Sahibinden, Letgo, Dolap ve DonanımHaber 6 saatte bir taranır; yeni ilanlar deftere işlenir.</p>
                </article>
                <article>
                  <span className="mono desk__protocol-no">02</span>
                  <strong>Eşle</strong>
                  <p>Her ilan; modelinin sıfır referansı, segment aralığı ve emsal ilanlarla eşlenir.</p>
                </article>
                <article>
                  <span className="mono desk__protocol-no">03</span>
                  <strong>Skorla</strong>
                  <p>0–100 alınabilirlik skoru kesilir; eşiği geçenler Fırsat Bandı'na düşer.</p>
                </article>
              </div>

              <div className="desk__cta">
                <div>
                  <span className="micro-label desk__cta-label">Defter Açık</span>
                  <strong>{formatCount(catalogDisplayTotal)} ilan defterde — seans sürüyor.</strong>
                </div>
                <button type="button" onClick={() => navigateToPage("catalog")}>
                  Marketplace'i aç
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          </section>
        )}

        {(activePage === "catalog" || activePage === "cpu") && (
          <section
            key={activeCatalogProduct}
            className={`page page--catalog ${isCpuCatalogPage ? "page--cpu-catalog" : ""}`}
            aria-labelledby="catalog-title"
          >
            <section className="catalog-page__intro container">
              <div>
                <span className="micro-label catalog-page__eyebrow">
                  {isCpuCatalogPage ? "İşlemci Defteri" : "Ekran Kartı Defteri"}
                </span>
                <h2 id="catalog-title">{isCpuCatalogPage ? "İkinci el işlemci ilanları" : "İkinci el ekran kartı ilanları"}</h2>
              </div>
              <div className="catalog-page__intro-meta">
                <span className="mono">
                  {formatCount(filteredCatalogListings.length)} / {formatCount(catalogDisplayTotal)} ilan
                </span>
                <button type="button" className="catalog-page__submit-button" onClick={() => navigateToPage("submit-link")}>
                  <Plus size={14} />
                  İlan ekle
                </button>
              </div>
            </section>

            {(catalogNotice || (isAdminUser && removedListingIds.length > 0)) && (
              <div className="catalog-page__notice container" role="status">
                <span>{catalogNotice || `${formatCount(removedListingIds.length)} ilan bu cihazda gizli.`}</span>
                {isAdminUser && removedListingIds.length > 0 ? (
                  <button type="button" onClick={restoreRemovedListings}>
                    Gizlenenleri geri getir
                  </button>
                ) : null}
              </div>
            )}

            {isCatalogScreenLoading ? (
              <CatalogLoadingScreen listingCount={catalogDisplayTotal} productType={activeCatalogProduct} />
            ) : (
            <section className="catalog-marketplace container">
              {isFilterDrawerOpen ? (
                <button
                  type="button"
                  className="catalog-filter-backdrop"
                  aria-label="Filtreleri kapat"
                  onClick={() => setIsFilterDrawerOpen(false)}
                />
              ) : null}

              <aside
                id="catalog-filter-drawer"
                className={`catalog-marketplace__sidebar ${isFilterDrawerOpen ? "is-open" : ""}`}
                aria-label="Katalog filtreleri"
              >
                <div className="catalog-filter-drawer__head">
                  <div>
                    <span>Filtreler</span>
                    <strong>Katalogu daralt</strong>
                  </div>
                  <button type="button" aria-label="Filtreleri kapat" onClick={() => setIsFilterDrawerOpen(false)}>
                    <X size={18} />
                  </button>
                </div>

                <CatalogFilterBar
                  filters={catalogFilters}
                  onFilterChange={setCatalogFilters}
                  onReset={resetCatalogView}
                  productType={activeCatalogProduct}
                />

                <section className="catalog-categories catalog-categories--stacked" aria-label="Katalog kategorileri">
                  <div className="catalog-categories__group">
                    <div className="catalog-categories__header">
                      <span>Model</span>
                      <strong>Model kategorileri</strong>
                      <small>Model adını yaz, eşleşen ilan grubunu seç.</small>
                    </div>
                    <label className="catalog-categories__model-search">
                      <Search size={15} />
                      <input
                        type="search"
                        value={modelCategoryQuery}
                        onChange={(event) => setModelCategoryQuery(event.target.value)}
                        placeholder={isCpuCatalogPage ? "Model ara: Ryzen 5 5600X" : "Model ara: GTX 960 8 GB"}
                        aria-label="Model kategorilerinde ara"
                      />
                    </label>
                    {selectedModelCategoryOptions.length > 0 ? (
                      <div className="catalog-categories__selected" aria-label="Seçili modeller">
                        {selectedModelCategoryOptions.map((category) => (
                          <button
                            key={category.key}
                            type="button"
                            onClick={() => toggleModelCategory(category.key)}
                            aria-label={`${category.label} model seçimini kaldır`}
                          >
                            {category.label}
                            <X size={13} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="catalog-categories__rail" aria-label="Model kategorileri">
                      {visibleModelCategories.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          aria-label={`${category.label}, ${formatCount(category.count)} ilan`}
                          aria-pressed={
                            category.key === ALL_CATEGORY_KEY
                              ? selectedModelCategories.length === 0
                              : selectedModelCategories.includes(category.key)
                          }
                          className={`catalog-categories__item ${
                            category.key === ALL_CATEGORY_KEY
                              ? selectedModelCategories.length === 0
                                ? "is-active"
                                : ""
                              : selectedModelCategories.includes(category.key)
                                ? "is-active"
                                : ""
                          }`}
                          onClick={() => toggleModelCategory(category.key)}
                        >
                          <span>{category.label}</span>
                          <strong>{formatCount(category.count)}</strong>
                        </button>
                      ))}
                      {visibleModelCategories.length === 1 && modelCategoryQuery.trim() ? (
                        <div className="catalog-categories__empty">Bu model adıyla kategori bulunamadı.</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="catalog-categories__group">
                    <div className="catalog-categories__header">
                      <span>Fiyat</span>
                      <strong>Fiyat aralıkları</strong>
                      <small>Seçili modelle birlikte fiyat aralığını daralt.</small>
                    </div>
                    <div className="catalog-categories__rail" aria-label="Fiyat kategorileri">
                      {priceCategories.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          aria-label={`${category.label}, ${formatCount(category.count)} ilan`}
                          className={`catalog-categories__item ${activePriceCategory === category.key ? "is-active" : ""}`}
                          onClick={() => setActivePriceCategory(category.key)}
                        >
                          <span>{category.label}</span>
                          <strong>{formatCount(category.count)}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <button type="button" className="catalog-marketplace__submit" onClick={() => navigateToPage("submit-link")}>
                  <Plus size={16} />
                  İlan ver
                </button>

                <div className="catalog-marketplace__trust">
                  <Lock size={18} />
                  <div>
                    <strong>Güvenli inceleme</strong>
                    <p>Gönderilen ilanlar yayınlanmadan önce kontrol akışına alınır.</p>
                  </div>
                </div>
              </aside>

              <section className="catalog-marketplace__content">
                <div className="catalog-mobile-toolbar" aria-label="Mobil katalog araçları">
                  <button
                    type="button"
                    className="catalog-mobile-filter-button"
                    aria-controls="catalog-filter-drawer"
                    aria-expanded={isFilterDrawerOpen}
                    onClick={() => setIsFilterDrawerOpen(true)}
                  >
                    <Menu size={18} />
                    <span>Filtreler</span>
                    {activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}
                  </button>
                  <span className="catalog-mobile-toolbar__page">
                    Sayfa {catalogPage.toLocaleString("tr-TR")} / {catalogTotalPages.toLocaleString("tr-TR")}
                  </span>
                </div>

                {activeFilterChips.length > 0 ? (
                  <div className="filter-chips" aria-label="Uygulanan filtreler">
                    <span className="micro-label">Filtreler</span>
                    {activeFilterChips.map((chip) => (
                      <button type="button" key={chip.key} onClick={chip.onRemove}>
                        {chip.label}
                        <X size={12} />
                      </button>
                    ))}
                  </div>
                ) : null}

                <section className="catalog-spotlight" aria-label="Hızlı ilan alanları">
                  <button
                    type="button"
                    className={`catalog-spotlight__item ${spotlightFilter === "cheap" ? "is-active" : ""}`}
                    disabled={!catalogHighlights.cheapest}
                    aria-pressed={spotlightFilter === "cheap"}
                    onClick={() => toggleSpotlightFilter("cheap")}
                  >
                    <TrendingDown size={18} />
                    <span>En ucuz</span>
                    <strong className="mono">
                      {catalogHighlights.cheapest ? formatCurrency(catalogHighlights.cheapest.price) : "Yok"}
                    </strong>
                  </button>

                  <button
                    type="button"
                    className={`catalog-spotlight__item ${spotlightFilter === "popular" ? "is-active" : ""}`}
                    disabled={!catalogHighlights.popularModel}
                    aria-pressed={spotlightFilter === "popular"}
                    onClick={showPopularModelFilter}
                  >
                    <Flame size={18} />
                    <span>Popüler model</span>
                    <strong>
                      {catalogHighlights.popularModel
                        ? `${catalogHighlights.popularModel.label} · ${formatCount(catalogHighlights.popularModel.count)} ilan`
                        : "Yok"}
                    </strong>
                  </button>

                  <button
                    type="button"
                    className={`catalog-spotlight__item ${spotlightFilter === "expensive" ? "is-active" : ""}`}
                    disabled={!catalogHighlights.expensive}
                    aria-pressed={spotlightFilter === "expensive"}
                    onClick={() => toggleSpotlightFilter("expensive")}
                  >
                    <Gem size={18} />
                    <span>Pahalı</span>
                    <strong className="mono">
                      {catalogHighlights.expensive ? formatCurrency(catalogHighlights.expensive.price) : "Yok"}
                    </strong>
                  </button>

                  <button
                    type="button"
                    className={`catalog-spotlight__item catalog-spotlight__item--buyable ${
                      spotlightFilter === "buyable" ? "is-active" : ""
                    }`}
                    disabled={catalogHighlights.buyableCount === 0}
                    aria-pressed={spotlightFilter === "buyable"}
                    onClick={() => toggleSpotlightFilter("buyable")}
                  >
                    <BadgeDollarSign size={18} />
                    <span>Alınabilir</span>
                    <strong>{catalogHighlights.buyableCount > 0 ? `${formatCount(catalogHighlights.buyableCount)} ilan` : "Yok"}</strong>
                  </button>
                </section>

                {activeModelSummary ? (
                  <section className="catalog-model-summary" aria-label="Seçili model özeti">
                    <div>
                      <span>Model sayfası</span>
                      <h3>{activeModelSummary.label}</h3>
                      <p>
                        Aynı model adıyla eşleşen ilanlar gösteriliyor. Birden fazla model seçersen bu alan ortak filtre gibi çalışır.
                      </p>
                    </div>
                    <dl>
                      <div>
                        <dt>İlan</dt>
                        <dd>{formatCount(activeModelSummary.count)}</dd>
                      </div>
                      <div>
                        <dt>Alınabilir</dt>
                        <dd>{formatCount(activeModelSummary.buyableCount)}</dd>
                      </div>
                      <div>
                        <dt>En ucuz</dt>
                        <dd>{activeModelSummary.minPrice ? formatCurrency(activeModelSummary.minPrice) : "Yok"}</dd>
                      </div>
                      <div>
                        <dt>Medyan</dt>
                        <dd>{activeModelSummary.medianPrice ? formatCurrency(activeModelSummary.medianPrice) : "Yok"}</dd>
                      </div>
                    </dl>
                  </section>
                ) : null}

                <section className="dashboard">
                  {isCatalogLoading && (
                    <section className="market-state market-state--loading">
                      <div>
                        <span className="market-state__eyebrow">Katalog</span>
                        <h3>İlanlar yükleniyor</h3>
                        <p>Tam katalog sayfa sayfa açılır; her ekranda {CATALOG_PAGE_SIZE} ilan gösterilir.</p>
                      </div>
                      <div className="market-state__skeleton" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </section>
                  )}

                  {!isCatalogLoading && catalogError && (
                    <section className="market-state market-state--error">
                      <div>
                        <span className="market-state__eyebrow">Bağlantı</span>
                        <h3>Katalog verisi şu an yanıt vermiyor</h3>
                        <p>{catalogError}</p>
                      </div>
                      <div className="market-state__advice">
                        <strong>Kontrol listesi</strong>
                        <ul>
                          <li>Servisin ayakta olduğunu doğrula</li>
                          <li>Web uygulamasının doğru API adresine bağlandığını kontrol et</li>
                          <li>Katalog verisinin güncel olduğunu doğrula</li>
                        </ul>
                      </div>
                    </section>
                  )}

                  {isCatalogLoading || catalogError ? (
                    <div className="dashboard__preview-strip" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                </section>

                {!isCatalogLoading && !catalogError && (
                  <CatalogGrid
                    listings={visibleCatalogListings}
                    total={filteredCatalogListings.length}
                    currentPage={catalogPage}
                    pageSize={CATALOG_PAGE_SIZE}
                    totalPages={catalogTotalPages}
                    onPageChange={handleCatalogPageChange}
                    onOpenListing={navigateToListing}
                    getListingInsight={(listing) => {
                      const insight = getCatalogListingInsight(listing, activeCatalogListings, buyabilityIndex);
                      return { score: insight.score, deltaPercent: insight.priceDeltaPercent == null ? null : -insight.priceDeltaPercent };
                    }}
                    onRemoveListing={handleRemoveListing}
                    canRemoveListing={isAdminUser}
                    isFavoriteListing={(listing) => watchItemMap.has(listing.id)}
                    getListingAlertTarget={(listing) => watchItemMap.get(listing.id)?.alertPrice ?? null}
                    onToggleFavorite={handleToggleFavorite}
                    onSetPriceAlert={handleSetPriceAlert}
                    title={isCpuCatalogPage ? "İşlemci ilanları" : "Ekran kartı ilanları"}
                    description={
                      isCpuCatalogPage
                        ? "İlanlar işlemci modeli, fiyat, konum ve kategori bilgisiyle listelenir."
                        : "İlanlar model, fiyat, konum ve kategori bilgisiyle listelenir."
                    }
                  />
                )}

                {(isCatalogLoading || catalogError) && (
                  <section className="listing-grid listing-grid--standby" id="listing-feed" aria-label="İlan akışı">
                    <div className="listing-grid__header">
                      <div>
                        <div className="listing-grid__eyebrow">
                          <span className="listing-grid__eyebrow-line" />
                          <span>Akış</span>
                        </div>
                        <h2 className="listing-grid__title">Katalog hazırlanıyor</h2>
                        <p className="listing-grid__description">
                          Veri geldiğinde ilanlar burada model, fiyat ve konum bilgisiyle açılır.
                        </p>
                      </div>
                    </div>

                    <div className="listing-grid__standby-grid">
                      <div />
                      <div />
                      <div />
                    </div>
                  </section>
                )}
              </section>
            </section>
            )}
          </section>
        )}

        {["submit-link", "submit-manual", "signin", "signup"].includes(activePage) && (
          <section className="page page--submit container" aria-labelledby="submit-title">
            <SubmissionPanel
              view={
                activePage === "submit-manual"
                  ? "manual"
                  : activePage === "signin"
                    ? "signin"
                    : activePage === "signup"
                      ? "signup"
                      : "link"
              }
              authIntent={submitAuthIntent}
              onBackToCatalog={() => navigateToPage("catalog")}
              onNavigateToSubmitMode={(mode) => navigateToPage(mode === "manual" ? "submit-manual" : "submit-link")}
              onAuthNavigate={handleAuthNavigate}
              onAccountChanged={handleAccountChanged}
            />
          </section>
        )}

        {activePage === "admin" && (
          <section className="page page--admin container" aria-labelledby="admin-title">
            <AdminReviewPanel
              token={accountSession?.access_token ?? null}
              isAdmin={isAdminUser}
              onBackToSubmit={() => navigateToPage("submit-link")}
              onQueueChanged={handleAccountChanged}
            />
          </section>
        )}

        {activePage === "about" && (
          <section className="page page--about container" aria-labelledby="about-title">
            <section className="about-panel">
              <div className="about-panel__intro">
                <span className="about-panel__eyebrow">Hakkında</span>
                <h2 id="about-title">GPU Pusula nasıl çalışır?</h2>
                <p>
                  GPU Pusula, ikinci el GPU ilanlarını model, fiyat ve konum üzerinden hızlı okumak için tasarlanmış
                  sade bir katalog deneyimidir.
                </p>
              </div>

              <div className="about-panel__grid">
                <article className="about-panel__card">
                  <div className="about-panel__icon">
                    <Database size={18} />
                  </div>
                  <h3>Katalog yapısı</h3>
                  <p>İlanlar model, fiyat aralığı ve konum gibi okunabilir alanlara ayrılarak listelenir.</p>
                </article>

                <article className="about-panel__card">
                  <div className="about-panel__icon">
                    <Lock size={18} />
                  </div>
                  <h3>Gizlilik yaklaşımı</h3>
                  <p>Gizli anahtarlar tarayıcıya çıkmaz. Veri akışı server-side katman üzerinden sağlanır.</p>
                </article>

                <article className="about-panel__card">
                  <div className="about-panel__icon">
                    <Info size={18} />
                  </div>
                  <h3>Kullanım amacı</h3>
                  <p>İlanlar bilgilendirme amaçlı gösterilir; fiyat, stok ve ilan durumu zaman içinde değişebilir.</p>
                </article>
              </div>

              <div className="about-panel__note">
                <span className="about-panel__note-label">Kısa özet</span>
                <strong>Gerçek ilanları kategori ve filtrelerle hızlı taratmak için okunur, profesyonel bir ekran kartı katalog arayüzü.</strong>
              </div>
            </section>
          </section>
        )}
      </main>

      {isPortfolioOpen ? (
        <>
          <button
            type="button"
            className="portfolio-backdrop"
            aria-label="Portföyü kapat"
            onClick={() => setIsPortfolioOpen(false)}
          />
          <aside className="portfolio-drawer" aria-label="Portföyüm">
            <header className="portfolio-drawer__head">
              <span className="micro-label">Portföyüm</span>
              <button type="button" aria-label="Kapat" onClick={() => setIsPortfolioOpen(false)}>
                <X size={16} />
              </button>
            </header>
            <CatalogWatchPanel
              items={activeWatchItems}
              onOpenListing={(listing) => {
                setIsPortfolioOpen(false);
                navigateToListing(listing);
              }}
              onRemoveItem={handleRemoveWatchItem}
              onSetPriceAlert={handleSetPriceAlert}
            />
          </aside>
        </>
      ) : null}

      {selectedListing && selectedListingInsight ? (
        <ListingDetailPanel
          listing={selectedListing}
          insight={selectedListingInsight}
          onClose={() => {
            setSelectedListing(null);
            if (routeListingId) {
              navigateToPage("catalog");
            }
          }}
          onRemove={handleRemoveListing}
          canRemoveListing={isAdminUser}
          commentToken={accountSession?.access_token ?? null}
          commentAuthorName={getSessionDisplayName(accountSession)}
          onRequireAuth={handleRequireCommentAuth}
          isFavorite={watchItemMap.has(selectedListing.id)}
          alertTargetPrice={watchItemMap.get(selectedListing.id)?.alertPrice ?? null}
          onToggleFavorite={handleToggleFavorite}
          onSetPriceAlert={handleSetPriceAlert}
        />
      ) : null}

      <Footer />
    </>
  );
}

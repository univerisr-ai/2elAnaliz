import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CatalogListing } from "../types/listing";
import { CatalogCard } from "./CatalogCard";
import { Mascot } from "./Mascot";
import { CountUp } from "./CountUp";
import "./CatalogCard.css";

interface CatalogGridProps {
  readonly isRewriting?: boolean;
  readonly listings: readonly CatalogListing[];
  readonly total: number;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
  readonly onOpenListing: (listing: CatalogListing) => void;
  readonly onRemoveListing: (listing: CatalogListing) => void;
  readonly canRemoveListing: boolean;
  readonly isFavoriteListing: (listing: CatalogListing) => boolean;
  readonly getListingAlertTarget: (listing: CatalogListing) => number | null;
  readonly onToggleFavorite: (listing: CatalogListing) => void;
  readonly onSetPriceAlert: (listing: CatalogListing) => void;
  readonly title?: string;
  readonly description?: string;
  readonly getListingInsight?: (listing: CatalogListing) => { score: number; deltaPercent: number | null } | null;
}

const LEDGER_COLUMNS = [
  { key: "no", label: "NO." },
  { key: "photo", label: "GÖRSEL" },
  { key: "source", label: "KAYNAK" },
  { key: "main", label: "İLAN" },
  { key: "where", label: "KONUM" },
  { key: "range", label: "ARALIK" },
  { key: "price", label: "FİYAT" },
  { key: "delta", label: "REF FARK" },
  { key: "score", label: "SKOR" },
  { key: "actions", label: "İŞLEM" },
] as const;

export function CatalogGrid({
  isRewriting = false,
  listings,
  total,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onOpenListing,
  onRemoveListing,
  canRemoveListing,
  isFavoriteListing,
  getListingAlertTarget,
  onToggleFavorite,
  onSetPriceAlert,
  title = "Ekran kartı ilanları",
  description = "İlanlar model, fiyat, konum ve kategori bilgisiyle listelenir.",
  getListingInsight,
}: CatalogGridProps) {
  const visiblePages = Array.from(
    new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages].filter((page) => page >= 1 && page <= totalPages)),
  ).sort((pageA, pageB) => pageA - pageB);

  return (
    <section className={`ledger ${canRemoveListing ? "ledger--can-remove" : ""}`} id="listing-feed" aria-label={title}>
      <p className="ledger__sr-only">{description}</p>

      <header className="ledger__topline">
        <span className="ledger__topline-label">
          Defter · <CountUp value={total} /> kayıt
        </span>
        <span className="ledger__topline-page">
          Sayfa {currentPage.toLocaleString("tr-TR")} / {Math.max(totalPages, 1).toLocaleString("tr-TR")}
        </span>
      </header>

      <div className={`ledger__table ${isRewriting ? "is-rewriting" : ""}`}>
        <div className="ledger__head" aria-hidden="true">
          {LEDGER_COLUMNS.map((column) => (
            <span key={column.key} className={`ledger__hcell ledger__hcell--${column.key}`}>
              {column.label}
            </span>
          ))}
        </div>

        {listings.length === 0 ? (
          <div className="ledger__empty">
            <Mascot size={120} mood="calm" />
            <h3 className="ledger__empty-title">Defterin bu sayfası bomboş</h3>
            <p className="ledger__empty-text">Üç Çip de bir şey bulamadı — filtreyi biraz gevşetmeyi deneyelim mi?</p>
          </div>
        ) : (
          listings.map((listing, index) => (
            <CatalogCard
              key={listing.id}
              listing={listing}
              folio={(currentPage - 1) * pageSize + index + 1}
              insight={getListingInsight ? getListingInsight(listing) : null}
              onOpenDetails={onOpenListing}
              onRemoveListing={onRemoveListing}
              canRemoveListing={canRemoveListing}
              isFavorite={isFavoriteListing(listing)}
              alertTargetPrice={getListingAlertTarget(listing)}
              onToggleFavorite={onToggleFavorite}
              onSetPriceAlert={onSetPriceAlert}
            />
          ))
        )}
      </div>

      {totalPages > 1 ? (
        <nav className="catalog-pagination" aria-label="Katalog sayfaları">
          <button
            type="button"
            className="catalog-pagination__btn catalog-pagination__btn--ghost"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={13} />
            ÖNCEKİ
          </button>

          <div className="catalog-pagination__pages">
            {visiblePages.map((page, index) => {
              const previousPage = visiblePages[index - 1];
              const hasGap = previousPage != null && page - previousPage > 1;

              return (
                <span className="catalog-pagination__page-wrap" key={page}>
                  {hasGap ? <span className="catalog-pagination__ellipsis">…</span> : null}
                  <button
                    type="button"
                    className={`catalog-pagination__page ${page === currentPage ? "is-active" : ""}`}
                    aria-current={page === currentPage ? "page" : undefined}
                    onClick={() => onPageChange(page)}
                  >
                    {page.toLocaleString("tr-TR")}
                  </button>
                </span>
              );
            })}
          </div>

          <button
            type="button"
            className="catalog-pagination__btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            SONRAKİ
            <ChevronRight size={13} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

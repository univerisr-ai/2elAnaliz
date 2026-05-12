import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import type { CatalogListing } from "../types/listing";
import { CatalogCard } from "./CatalogCard";
import "./CatalogCard.css";

interface CatalogGridProps {
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
}

export function CatalogGrid({
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
}: CatalogGridProps) {
  const firstListingNumber = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastListingNumber = listings.length === 0 ? 0 : Math.min(total, firstListingNumber + listings.length - 1);
  const visiblePages = Array.from(
    new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages].filter((page) => page >= 1 && page <= totalPages)),
  ).sort((pageA, pageB) => pageA - pageB);

  return (
    <section className="listing-grid" id="listing-feed" aria-label="Ürün kataloğu">
      <div className="listing-grid__header">
        <div>
          <div className="listing-grid__eyebrow">
            <span className="listing-grid__eyebrow-line" />
            <span>Sonuçlar</span>
          </div>
          <h2 className="listing-grid__title">Ekran kartı ilanları</h2>
          <p className="listing-grid__description">
            İlanlar model, fiyat, konum ve kategori bilgisiyle listelenir.
          </p>
        </div>
        <div className="listing-grid__header-side">
          <span className="listing-grid__count">
            {firstListingNumber.toLocaleString("tr-TR")}-{lastListingNumber.toLocaleString("tr-TR")} /{" "}
            {total.toLocaleString("tr-TR")} ilan
          </span>
          <span className="listing-grid__link-hint">
            Sayfa {currentPage.toLocaleString("tr-TR")} / {totalPages.toLocaleString("tr-TR")}
          </span>
        </div>
      </div>

      <div className="listing-grid__grid">
        {listings.length === 0 ? (
          <div className="listing-grid__empty">
            <div className="listing-grid__empty-icon">
              <SearchX size={28} />
            </div>
            <h3 className="listing-grid__empty-title">Bu filtrelerle ilan bulunamadı</h3>
            <p className="listing-grid__empty-text">Aramayı sadeleştir veya fiyat aralığını genişlet.</p>
          </div>
        ) : (
          listings.map((listing) => (
            <CatalogCard
              key={listing.id}
              listing={listing}
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
            <ChevronLeft size={15} />
            Önceki
          </button>

          <div className="catalog-pagination__pages">
            {visiblePages.map((page, index) => {
              const previousPage = visiblePages[index - 1];
              const hasGap = previousPage != null && page - previousPage > 1;

              return (
                <span className="catalog-pagination__page-wrap" key={page}>
                  {hasGap ? <span className="catalog-pagination__ellipsis">...</span> : null}
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
            Sonraki
            <ChevronRight size={15} />
          </button>
        </nav>
      ) : null}
    </section>
  );
}

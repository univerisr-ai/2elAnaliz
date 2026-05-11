import { ArrowDown, SearchX } from "lucide-react";
import type { CatalogListing } from "../types/listing";
import { CatalogCard } from "./CatalogCard";
import "./CatalogCard.css";

interface CatalogGridProps {
  readonly listings: readonly CatalogListing[];
  readonly total: number;
  readonly loadedCount: number;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
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
  loadedCount,
  hasMore,
  onLoadMore,
  onOpenListing,
  onRemoveListing,
  canRemoveListing,
  isFavoriteListing,
  getListingAlertTarget,
  onToggleFavorite,
  onSetPriceAlert,
}: CatalogGridProps) {
  return (
    <section className="listing-grid" aria-label="Ürün kataloğu">
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
            {loadedCount.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} ilan gösteriliyor
          </span>
          <span className="listing-grid__link-hint">Katalog akışı</span>
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

      {hasMore ? (
        <div className="catalog-pagination">
          <button type="button" className="catalog-pagination__btn" onClick={onLoadMore}>
            <ArrowDown size={15} />
            Daha fazla göster
          </button>
          <span className="catalog-pagination__info">
            Kalan {(total - loadedCount).toLocaleString("tr-TR")} ilan
          </span>
        </div>
      ) : null}
    </section>
  );
}

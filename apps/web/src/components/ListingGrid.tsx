import type { GpuListing } from "../types/listing";
import { ListingCard } from "./ListingCard";
import { ArrowRight, SearchX } from "lucide-react";

interface ListingGridProps {
  readonly listings: readonly GpuListing[];
  readonly title?: string;
  readonly description?: string;
}

export function ListingGrid({
  listings,
  title = "Seçilen İlanlar",
  description,
}: ListingGridProps) {
  return (
    <section className="listing-grid container" id="listing-feed" aria-label="Seçilen ilanlar">
      <div className="listing-grid__header">
        <div>
          <div className="listing-grid__eyebrow">
            <span className="listing-grid__eyebrow-line" />
            <span>Sonuçlar</span>
          </div>
          <h2 className="listing-grid__title">{title}</h2>
          {description ? <p className="listing-grid__description">{description}</p> : null}
        </div>
        <div className="listing-grid__header-side">
          <span className="listing-grid__count">{listings.length} sonuç gösteriliyor</span>
          <span className="listing-grid__link-hint">
            Fiyat, güven ve model tek görünümde
            <ArrowRight size={14} />
          </span>
        </div>
      </div>

      <div className="listing-grid__grid">
        {listings.length === 0 ? (
          <div className="listing-grid__empty">
            <div className="listing-grid__empty-icon">
              <SearchX size={28} />
            </div>
            <h3 className="listing-grid__empty-title">Bu filtre kombinasyonunda uygun ilan bulunamadı</h3>
            <p className="listing-grid__empty-text">
              Aramayı genişletmeyi, fiyat aralığını açmayı veya minimum güven eşiğini düşürmeyi deneyin.
            </p>
          </div>
        ) : (
          listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)
        )}
      </div>
    </section>
  );
}

import { memo, useMemo, useState } from "react";
import type { GpuListing } from "../types/listing";
import { formatPrice, formatRelativeTime } from "../utils/format";
import { Clock, ImageOff, ShieldCheck, BadgeDollarSign } from "lucide-react";
import { buildImageCandidateUrls } from "../utils/media";
import { getCanonicalGpuModel } from "../utils/catalog-taxonomy";
import { cleanPublicListingText } from "../utils/display";

interface ListingCardProps {
  readonly listing: GpuListing;
}

function getBrandBadgeClass(brand: string): string {
  switch (brand) {
    case "NVIDIA":
      return "listing-card__brand-badge--nvidia";
    case "AMD":
      return "listing-card__brand-badge--amd";
    case "Intel":
      return "listing-card__brand-badge--intel";
    default:
      return "";
  }
}

export const ListingCard = memo(function ListingCard({ listing }: ListingCardProps) {
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(listing.imageUrl, listing.model || listing.brand),
    [listing.brand, listing.imageUrl, listing.model],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const imageSrc = imageCandidates[imageIndex] ?? null;
  const publicTitle = cleanPublicListingText(listing.title);
  const publicModel = getCanonicalGpuModel(listing) || cleanPublicListingText(listing.model);

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <article className="listing-card" id={`listing-${listing.id}`}>
      <div className="listing-card__image-wrapper">
        {imageSrc ? (
          <img
            className="listing-card__image"
            src={imageSrc}
            alt={publicTitle}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        ) : (
          <div className="listing-card__image listing-card__image--placeholder">
            <div className="listing-card__placeholder-topline">
              <span className="listing-card__placeholder-brand">{listing.brand}</span>
            </div>

            <div className="listing-card__placeholder-empty">
              <ImageOff size={24} />
              <strong>{publicModel}</strong>
              <span>Bu ilanda görsel verisi gelmedi.</span>
            </div>
          </div>
        )}
        <div className="listing-card__image-overlay" />

        <div className="listing-card__badges">
          <span className={`listing-card__brand-badge ${getBrandBadgeClass(listing.brand)}`}>{listing.brand}</span>
          {listing.discountPercent >= 12 ? <span className="listing-card__deal-badge">-%{listing.discountPercent}</span> : null}
        </div>
      </div>

      <div className="listing-card__content">
        <div className="listing-card__heading">
          <h3 className="listing-card__model">{publicTitle}</h3>
          <span className="listing-card__kicker">{publicModel}</span>
        </div>

        <div className="listing-card__price-row">
          <div className="listing-card__price-stack">
            <span className="listing-card__price">{formatPrice(listing.price)}</span>
            <span className="listing-card__original-price">Piyasa: {formatPrice(listing.fairPrice)}</span>
          </div>
          <div className="listing-card__confidence-stack">
            <span className="listing-card__confidence-label">Güven</span>
            <strong className="listing-card__confidence">%{listing.confidencePercent}</strong>
          </div>
        </div>

        <div className="listing-card__signal-row">
          <span className="listing-card__signal-pill">
            <BadgeDollarSign size={12} />
            İndirim %{listing.discountPercent}
          </span>
          <span className="listing-card__signal-pill">
            <ShieldCheck size={12} />
            İnceleme kuyruğu
          </span>
        </div>

        <p className="listing-card__note">{listing.analysisNote}</p>

        <div className="listing-card__footer">
          <div className="listing-card__meta">
            <Clock size={12} />
            <span>{formatRelativeTime(listing.listedAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
});

import { useMemo, useState } from "react";
import type { CatalogListing } from "../types/listing";
import { formatPrice } from "../utils/format";
import { BellRing, CalendarDays, ExternalLink, ImageOff, MapPin, Search, Star, Store, Trash2 } from "lucide-react";
import { buildImageCandidateUrls } from "../utils/media";
import { getCanonicalGpuModel, getModelFamily } from "../utils/catalog-taxonomy";
import { cleanPublicListingText } from "../utils/display";
import { getExternalListingUrl, getSourceLabel } from "../utils/source";
import "./CatalogCard.css";

interface CatalogCardProps {
  readonly listing: CatalogListing;
  readonly onOpenDetails: (listing: CatalogListing) => void;
  readonly onRemoveListing: (listing: CatalogListing) => void;
  readonly canRemoveListing: boolean;
  readonly isFavorite: boolean;
  readonly alertTargetPrice: number | null;
  readonly onToggleFavorite: (listing: CatalogListing) => void;
  readonly onSetPriceAlert: (listing: CatalogListing) => void;
}

function getBrandClass(brand: string): string {
  switch (brand) {
    case "NVIDIA":
      return "catalog-card__brand--nvidia";
    case "AMD":
      return "catalog-card__brand--amd";
    case "Intel":
      return "catalog-card__brand--intel";
    default:
      return "";
  }
}

function getSourceTone(listing: CatalogListing, sourceLabel: string): "sahibinden" | "letgo" | "dolap" | "donanimhaber" | "facebook" | "pecid" | "external" {
  if (listing.isInternal) {
    return "pecid";
  }

  const sourceNeedle = `${sourceLabel} ${listing.externalUrl ?? ""}`.toLocaleLowerCase("tr-TR");
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

  if (sourceNeedle.includes("facebook") || sourceNeedle.includes("fb.com")) {
    return "facebook";
  }

  return "external";
}

export function CatalogCard({
  listing,
  onOpenDetails,
  onRemoveListing,
  canRemoveListing,
  isFavorite,
  alertTargetPrice,
  onToggleFavorite,
  onSetPriceAlert,
}: CatalogCardProps) {
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(listing.imageUrl, listing.model || listing.brand),
    [listing.brand, listing.imageUrl, listing.model],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex] ?? null;
  const showImage = Boolean(imageUrl);
  const modelFamily = getModelFamily(listing);
  const publicTitle = cleanPublicListingText(listing.title);
  const publicModel = getCanonicalGpuModel(listing) || cleanPublicListingText(listing.model);
  const sourceLabel = getSourceLabel(listing);
  const externalListingUrl = getExternalListingUrl(listing);
  const sourceTone = getSourceTone(listing, sourceLabel);

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <article
      className={`catalog-card catalog-card--source-${sourceTone}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(listing)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(listing);
        }
      }}
    >
      <div className="catalog-card__media">
        {showImage ? (
          <img
            className="catalog-card__image"
            src={imageUrl}
            alt={publicTitle}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        ) : (
          <div className="catalog-card__placeholder">
            <ImageOff size={30} />
            <span>Görsel yok</span>
          </div>
        )}

        <div className="catalog-card__badges">
          <span className="catalog-card__source-badge">{sourceLabel}</span>
          <span className={`catalog-card__brand ${getBrandClass(listing.brand)}`}>{listing.brand}</span>
        </div>

        <div className="catalog-card__quick-actions">
          <button
            type="button"
            className={`catalog-card__icon-action ${isFavorite ? "is-active" : ""}`}
            aria-label={isFavorite ? `${publicTitle} favorilerden kaldır` : `${publicTitle} favorilere ekle`}
            title={isFavorite ? "Favoriden kaldır" : "Favoriye ekle"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(listing);
            }}
          >
            <Star size={15} />
          </button>
          <button
            type="button"
            className={`catalog-card__icon-action ${alertTargetPrice ? "is-active" : ""}`}
            aria-label={`${publicTitle} için fiyat alarmı ayarla`}
            title={alertTargetPrice ? `Alarm: ${formatPrice(alertTargetPrice)}` : "Fiyat alarmı"}
            onClick={(event) => {
              event.stopPropagation();
              onSetPriceAlert(listing);
            }}
          >
            <BellRing size={15} />
          </button>
          {canRemoveListing ? (
            <button
              type="button"
              className="catalog-card__icon-action catalog-card__icon-action--danger"
              aria-label={`${publicTitle} ilanını kaldır`}
              title="İlanı kaldır"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveListing(listing);
              }}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="catalog-card__content">
        <p className="catalog-card__model">
          <span>{modelFamily}</span>
          <span aria-hidden="true">·</span>
          <strong>{publicModel}</strong>
        </p>
        <h3 className="catalog-card__title">{publicTitle}</h3>

        <div className="catalog-card__source">
          <span>
            <Store size={12} />
            {sourceLabel}
          </span>
          {externalListingUrl ? <ExternalLink size={12} aria-hidden="true" /> : null}
        </div>

        <div className="catalog-card__meta">
          <span>
            <MapPin size={13} />
            {listing.location}
          </span>
          <span>
            <CalendarDays size={13} />
            {listing.listedAtLabel}
          </span>
        </div>

        <div className="catalog-card__footer">
          <div className="catalog-card__price">
            <strong>{listing.priceText || formatPrice(listing.price)}</strong>
            <span>{listing.segment}</span>
          </div>

          <button
            type="button"
            className="catalog-card__cta"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(listing);
            }}
          >
            <span>İlanı incele</span>
            <Search size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

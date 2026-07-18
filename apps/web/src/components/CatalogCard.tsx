import { useMemo, useState } from "react";
import type { CatalogListing } from "../types/listing";
import { BellRing, Star, Trash2 } from "lucide-react";
import { buildImageCandidateUrls } from "../utils/media";
import { getCanonicalGpuModel, getModelFamily } from "../utils/catalog-taxonomy";
import { cleanPublicListingText } from "../utils/display";
import { getSourceLabel } from "../utils/source";
import { bellSwing, sparkBurst } from "../utils/micro-fx";
import { mascotCheer } from "./Mascot";
import "./CatalogCard.css";

function getSourceKey(label: string): string {
  const needle = label.toLocaleLowerCase("tr-TR");
  if (needle.includes("sahibinden")) return "sahibinden";
  if (needle.includes("letgo")) return "letgo";
  if (needle.includes("dolap")) return "dolap";
  if (needle.includes("donanım") || needle.includes("donanim")) return "donanimhaber";
  if (needle.includes("pusula")) return "pecid";
  return "external";
}

interface CatalogCardProps {
  readonly listing: CatalogListing;
  readonly onOpenDetails: (listing: CatalogListing) => void;
  readonly onRemoveListing: (listing: CatalogListing) => void;
  readonly canRemoveListing: boolean;
  readonly isFavorite: boolean;
  readonly alertTargetPrice: number | null;
  readonly onToggleFavorite: (listing: CatalogListing) => void;
  readonly onSetPriceAlert: (listing: CatalogListing) => void;
  readonly folio?: number;
  readonly insight?: { score: number; deltaPercent: number | null } | null;
}

interface SegmentRange {
  readonly min: number;
  readonly max: number;
}

function parseTrNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

/** "8.500-11.850 TL" → { min: 8500, max: 11850 }; unparsable → null. */
function parseSegmentRange(segment: string): SegmentRange | null {
  const match = segment.match(/(\d[\d.,]*)\s*[-–]\s*(\d[\d.,]*)/);
  if (!match) {
    return null;
  }

  const min = parseTrNumber(match[1]);
  const max = parseTrNumber(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min) {
    return null;
  }

  return { min, max };
}

function isArchiveSegment(segment: string): boolean {
  return /^ar[sş][iı]v$/i.test(segment.trim());
}

function getScoreTone(score: number): "good" | "mid" | "bad" {
  if (score >= 75) {
    return "good";
  }

  return score >= 45 ? "mid" : "bad";
}

function formatDeltaPercent(deltaPercent: number): string {
  const rounded = Math.round(deltaPercent);
  if (rounded > 0) {
    return `%+${rounded}`;
  }

  return rounded < 0 ? `%-${Math.abs(rounded)}` : "%0";
}

const DELTA_BAR_CAP = 40;
const DELTA_BAR_MAX_WIDTH = 28;

export function CatalogCard({
  listing,
  onOpenDetails,
  onRemoveListing,
  canRemoveListing,
  isFavorite,
  alertTargetPrice,
  onToggleFavorite,
  onSetPriceAlert,
  folio,
  insight,
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
  const sourceKey = getSourceKey(sourceLabel);

  const isArchive = isArchiveSegment(listing.segment);
  const range = isArchive ? null : parseSegmentRange(listing.segment);
  const rangePercent = range
    ? Math.min(100, Math.max(0, ((listing.price - range.min) / (range.max - range.min)) * 100))
    : 0;
  const rangeOutOfBounds = range != null && (listing.price < range.min || listing.price > range.max);

  const priceLabel = listing.priceText?.trim() || `${listing.price.toLocaleString("tr-TR")} TL`;

  const score = insight && !isArchive ? Math.min(100, Math.max(0, Math.round(insight.score))) : null;
  const scoreTone = score != null ? getScoreTone(score) : null;
  const filledSegments = score != null ? Math.min(10, Math.max(0, Math.round(score / 10))) : 0;

  const deltaPercent = insight && !isArchive ? insight.deltaPercent : null;
  const deltaBarWidth =
    deltaPercent != null
      ? Math.max(2, (Math.min(Math.abs(deltaPercent), DELTA_BAR_CAP) / DELTA_BAR_CAP) * DELTA_BAR_MAX_WIDTH)
      : 0;
  const deltaTone = deltaPercent == null ? null : deltaPercent < 0 ? "good" : deltaPercent > 0 ? "bad" : "flat";

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <article
      className={`ledger-row ${isArchive ? "ledger-row--archive" : ""}`}
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
      <span className="ledger-row__folio">{folio != null ? `No. ${folio.toLocaleString("tr-TR")}` : "—"}</span>

      <span className="ledger-row__photo tilt-3d">
        {showImage ? (
          <img
            className="ledger-row__image"
            src={imageUrl ?? undefined}
            alt={publicTitle}
            loading="lazy"
            decoding="async"
            onError={handleImageError}
          />
        ) : (
          <span className="ledger-row__plate" aria-label="Görsel yok">
            <span className="ledger-row__plate-name">{publicModel.toLocaleUpperCase("tr-TR")}</span>
            <span className="ledger-row__plate-caption">GÖRSEL YOK</span>
          </span>
        )}
      </span>

      <span className="ledger-row__source">
        <span className="ledger-row__source-pill" data-source={sourceKey}>{sourceLabel.toLocaleUpperCase("tr-TR")}</span>
        <span className="ledger-row__source-brand">{listing.brand.toLocaleUpperCase("tr-TR")}</span>
      </span>

      <span className="ledger-row__main">
        <span className="ledger-row__title">{publicTitle}</span>
        <span className="ledger-row__chips">
          {modelFamily ? <span className="ledger-row__chip">{modelFamily}</span> : null}
          {publicModel ? <span className="ledger-row__chip">{publicModel}</span> : null}
        </span>
      </span>

      <span className="ledger-row__where">
        <span className="ledger-row__location">{listing.location}</span>
        <span className="ledger-row__date">{listing.listedAtLabel}</span>
      </span>

      <span className="ledger-row__range">
        {range ? (
          <span
            className="ledger-row__range-widget"
            aria-label={`Segment aralığı ${range.min.toLocaleString("tr-TR")} – ${range.max.toLocaleString("tr-TR")} TL`}
          >
            <span className="ledger-row__range-bound">{range.min.toLocaleString("tr-TR")}</span>
            <span className="ledger-row__range-track">
              <span
                className={`ledger-row__range-dot ${rangeOutOfBounds ? "ledger-row__range-dot--edge" : ""}`}
                style={{ left: `${rangePercent}%` }}
              />
            </span>
            <span className="ledger-row__range-bound">{range.max.toLocaleString("tr-TR")}</span>
          </span>
        ) : (
          <span className="ledger-row__none">—</span>
        )}
      </span>

      <span className="ledger-row__price">
        <span className="ledger-row__price-value">{priceLabel}</span>
        {isArchive ? <span className="ledger-row__archive-chip">ARŞİV</span> : null}
      </span>

      <span className="ledger-row__delta">
        {deltaPercent != null && deltaTone != null ? (
          <>
            <span className="ledger-row__delta-track" aria-hidden="true">
              <span className="ledger-row__delta-axis" />
              <span
                className={`ledger-row__delta-bar ledger-row__delta-bar--${deltaTone}`}
                style={{ width: `${deltaBarWidth}px` }}
              />
            </span>
            <span className={`ledger-row__delta-value ledger-row__delta-value--${deltaTone}`}>
              {formatDeltaPercent(deltaPercent)}
            </span>
          </>
        ) : (
          <span className="ledger-row__none">—</span>
        )}
      </span>

      <span className="ledger-row__score">
        {score != null && scoreTone != null ? (
          <>
            <span className="ledger-row__score-line">
              <span className={`ledger-row__score-value ledger-row__score-value--${scoreTone}`}>{score}</span>
              <span className="ledger-row__score-cap">/100</span>
            </span>
            <span className="ledger-row__score-bar" aria-hidden="true">
              {Array.from({ length: 10 }, (_, segmentIndex) => (
                <span
                  key={segmentIndex}
                  className={`ledger-row__score-seg ${
                    segmentIndex < filledSegments ? `ledger-row__score-seg--${scoreTone}` : ""
                  }`}
                />
              ))}
            </span>
          </>
        ) : (
          <span className="ledger-row__none">—</span>
        )}
      </span>

      <span className="ledger-row__actions">
        <span className="ledger-row__actions-buttons">
          <button
            type="button"
            className={`ledger-row__icon-btn ${isFavorite ? "is-active" : ""}`}
            aria-label={isFavorite ? `${publicTitle} favorilerden kaldır` : `${publicTitle} favorilere ekle`}
            title={isFavorite ? "Favoriden kaldır" : "Favoriye ekle"}
            onClick={(event) => {
              event.stopPropagation();
              if (!isFavorite) {
                sparkBurst(event.currentTarget, "#F4D03F");
                mascotCheer();
              }
              onToggleFavorite(listing);
            }}
          >
            <Star size={14} />
          </button>
          <button
            type="button"
            className={`ledger-row__icon-btn ${alertTargetPrice != null ? "is-active" : ""}`}
            aria-label={`${publicTitle} için fiyat alarmı ayarla`}
            title={
              alertTargetPrice != null
                ? `Alarm: ≤ ${alertTargetPrice.toLocaleString("tr-TR")} TL`
                : "Fiyat alarmı kur"
            }
            onClick={(event) => {
              event.stopPropagation();
              bellSwing(event.currentTarget);
              onSetPriceAlert(listing);
            }}
          >
            <BellRing size={14} />
          </button>
          {canRemoveListing ? (
            <button
              type="button"
              className="ledger-row__icon-btn ledger-row__icon-btn--danger"
              aria-label={`${publicTitle} ilanını kaldır`}
              title="İlanı kaldır"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveListing(listing);
              }}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="ledger-row__inspect"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(listing);
            }}
          >
            İncele
          </button>
        </span>
        {alertTargetPrice != null ? (
          <span className="ledger-row__alert-target">≤ {alertTargetPrice.toLocaleString("tr-TR")} TL</span>
        ) : null}
      </span>
    </article>
  );
}

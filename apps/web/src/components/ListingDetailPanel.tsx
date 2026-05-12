import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { BuyabilityInsight, CatalogListing } from "../types/listing";
import type { ListingComment } from "../services/api-service";
import { createListingComment, fetchListingComments } from "../services/api-service";
import { formatPrice } from "../utils/format";
import { buildImageCandidateUrls } from "../utils/media";
import { cleanPublicListingText } from "../utils/display";
import { getCanonicalGpuModel, getModelFamily } from "../utils/catalog-taxonomy";
import { getExternalListingUrl, getSourceLabel } from "../utils/source";
import { BellRing, ExternalLink, ImageOff, MapPin, MessageCircle, Send, Star, Store, Trash2, X } from "lucide-react";
import "./ListingDetailPanel.css";

interface ListingDetailPanelProps {
  readonly listing: CatalogListing;
  readonly insight: BuyabilityInsight;
  readonly onClose: () => void;
  readonly onRemove: (listing: CatalogListing) => void;
  readonly canRemoveListing: boolean;
  readonly commentToken: string | null;
  readonly commentAuthorName: string | null;
  readonly onRequireAuth: () => void;
  readonly isFavorite: boolean;
  readonly alertTargetPrice: number | null;
  readonly onToggleFavorite: (listing: CatalogListing) => void;
  readonly onSetPriceAlert: (listing: CatalogListing) => void;
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Az önce";
  }

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ListingDetailPanel({
  listing,
  insight,
  onClose,
  onRemove,
  canRemoveListing,
  commentToken,
  commentAuthorName,
  onRequireAuth,
  isFavorite,
  alertTargetPrice,
  onToggleFavorite,
  onSetPriceAlert,
}: ListingDetailPanelProps) {
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(listing.imageUrl, listing.model || listing.brand),
    [listing.brand, listing.imageUrl, listing.model],
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const imageUrl = imageCandidates[imageIndex] ?? null;
  const publicTitle = cleanPublicListingText(listing.title);
  const publicModel = getCanonicalGpuModel(listing) || cleanPublicListingText(listing.model);
  const comparisonLabel = insight.isReferenceBased ? "Sıfır referans" : "Model medyanı";
  const comparisonPrice = insight.referencePrice ?? insight.medianPrice;
  const deltaLabel = insight.isReferenceBased ? "Sıfır farkı" : "Medyan farkı";
  const sourceLabel = getSourceLabel(listing);
  const externalListingUrl = getExternalListingUrl(listing);

  useEffect(() => {
    let isMounted = true;

    async function loadComments() {
      try {
        setIsCommentsLoading(true);
        setCommentMessage("");
        const nextComments = await fetchListingComments(listing.id);
        if (isMounted) {
          setComments(nextComments);
        }
      } catch {
        if (isMounted) {
          setCommentMessage("Yorumlar şu an yüklenemedi.");
        }
      } finally {
        if (isMounted) {
          setIsCommentsLoading(false);
        }
      }
    }

    loadComments();

    return () => {
      isMounted = false;
    };
  }, [listing.id]);

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = commentBody.trim();

    if (body.length < 3) {
      setCommentMessage("Yorum en az 3 karakter olmalı.");
      return;
    }

    if (!commentToken) {
      setCommentMessage("Yorum yazmak için giriş yapman gerekiyor.");
      return;
    }

    try {
      setIsCommentSubmitting(true);
      setCommentMessage("");
      const savedComment = await createListingComment(listing.id, { body }, commentToken);
      setComments((current) => [...current, savedComment]);
      setCommentBody("");
      setCommentMessage("Yorum eklendi.");
    } catch {
      setCommentMessage("Yorum kaydedilemedi.");
    } finally {
      setIsCommentSubmitting(false);
    }
  }

  return (
    <div className="listing-detail" role="dialog" aria-modal="true" aria-label="İlan detay ve alınabilirlik">
      <button type="button" className="listing-detail__backdrop" onClick={onClose} aria-label="Detayı kapat" />

      <article className="listing-detail__panel">
        <button type="button" className="listing-detail__close" onClick={onClose} aria-label="Detayı kapat">
          <X size={18} />
        </button>

        <div className="listing-detail__media">
          {imageUrl ? (
            <img src={imageUrl} alt={publicTitle} onError={handleImageError} />
          ) : (
            <div className="listing-detail__placeholder">
              <ImageOff size={28} />
              <span>Görsel yok</span>
            </div>
          )}
        </div>

        <div className="listing-detail__content">
          <div>
            <span className="listing-detail__eyebrow">{getModelFamily(listing)} · {publicModel}</span>
            <h3>{publicTitle}</h3>
            <p className="listing-detail__location">
              <MapPin size={14} />
              {listing.location || "Konum belirtilmemiş"}
            </p>
          </div>

          <section className="listing-detail__source" aria-label="İlan kaynağı">
            <div>
              <span>
                <Store size={14} />
                Kaynak
              </span>
              <strong>{sourceLabel}</strong>
            </div>
            {externalListingUrl ? (
              <a className="listing-detail__open" href={externalListingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} />
                İlanı aç
              </a>
            ) : (
              <span className="listing-detail__source-note">Site içi kayıt</span>
            )}
          </section>

          <section className={`listing-detail__score listing-detail__score--${insight.tone}`} aria-label="Alınabilirlik derecesi">
            <div>
              <span>Alınabilirlik</span>
              <strong>{insight.label}</strong>
              <p>{insight.reason}</p>
            </div>
            <div className="listing-detail__score-ring">
              <strong>{insight.score}</strong>
              <span>/100</span>
            </div>
          </section>

          <dl className="listing-detail__metrics">
            <div>
              <dt>İlan fiyatı</dt>
              <dd>{listing.priceText || formatPrice(listing.price)}</dd>
            </div>
            <div>
              <dt>{comparisonLabel}</dt>
              <dd>{comparisonPrice ? formatPrice(comparisonPrice) : "Yok"}</dd>
            </div>
            <div>
              <dt>En düşük</dt>
              <dd>{insight.minPrice ? formatPrice(insight.minPrice) : "Yok"}</dd>
            </div>
            <div>
              <dt>Karşılaştırma</dt>
              <dd>{insight.comparableCount} ilan</dd>
            </div>
          </dl>

          <div className="listing-detail__rank">
            <span>{insight.rankText}</span>
            <span>{insight.priceDeltaPercent == null ? "Fiyat dağılımı sınırlı" : `${deltaLabel}: %${insight.priceDeltaPercent}`}</span>
          </div>

          <section className="listing-detail__decision-notes" aria-label="Karar notları">
            <div>
              <strong>Kontrol et</strong>
              <p>Skor bilgilendirme amaçlıdır; satın almadan önce seri, test görüntüsü, fatura ve sıcaklık değerlerini ayrıca doğrula.</p>
            </div>
            {insight.riskFlags && insight.riskFlags.length > 0 ? (
              <ul>
                {insight.riskFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : (
              <ul>
                <li>Başlıkta bariz parça/arızalı ürün sinyali bulunmadı.</li>
                <li>Fiyat, aynı model veya sıfır referansına göre karşılaştırıldı.</li>
              </ul>
            )}
          </section>

          <div className="listing-detail__actions">
            <button type="button" className="listing-detail__secondary" onClick={onClose}>
              Kapat
            </button>
            <button
              type="button"
              className={`listing-detail__secondary ${isFavorite ? "is-active" : ""}`}
              onClick={() => onToggleFavorite(listing)}
            >
              <Star size={14} />
              {isFavorite ? "Takipte" : "Takibe al"}
            </button>
            <button
              type="button"
              className={`listing-detail__secondary ${alertTargetPrice ? "is-active" : ""}`}
              onClick={() => onSetPriceAlert(listing)}
            >
              <BellRing size={14} />
              {alertTargetPrice ? `Alarm ${formatPrice(alertTargetPrice)}` : "Fiyat alarmı"}
            </button>
            {canRemoveListing ? (
              <button type="button" className="listing-detail__danger" onClick={() => onRemove(listing)}>
                <Trash2 size={14} />
                İlanı kaldır
              </button>
            ) : null}
          </div>

          <section className="listing-detail__comments" aria-label="İlan yorumları">
            <div className="listing-detail__comments-head">
              <span>
                <MessageCircle size={14} />
                Yorumlar
              </span>
              <strong>{comments.length ? `${comments.length} yorum` : "İlk yorum"}</strong>
            </div>

            <div className="listing-detail__comment-list">
              {isCommentsLoading ? (
                <div className="listing-detail__comment-empty">Yorumlar yükleniyor.</div>
              ) : comments.length === 0 ? (
                <div className="listing-detail__comment-empty">Bu ilan için ilk yorumu sen yaz.</div>
              ) : (
                comments.map((comment) => (
                  <article className="listing-detail__comment" key={comment.id}>
                    <div>
                      <strong>{comment.authorName}</strong>
                      <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
                    </div>
                    <p>{comment.body}</p>
                  </article>
                ))
              )}
            </div>

            {commentToken ? (
              <form className="listing-detail__comment-form" onSubmit={handleCommentSubmit}>
                <div className="listing-detail__comment-author">
                  <span>Yazan</span>
                  <strong>{commentAuthorName || "Hesabın"}</strong>
                </div>
                <textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Bu ilan hakkında yorum yaz"
                  rows={3}
                  maxLength={600}
                />
                <button type="submit" disabled={isCommentSubmitting}>
                  <Send size={14} />
                  Gönder
                </button>
              </form>
            ) : (
              <div className="listing-detail__comment-auth">
                <span>Yorum yazmak için giriş veya kayıt gerekiyor.</span>
                <button type="button" onClick={onRequireAuth}>
                  Giriş yap
                </button>
              </div>
            )}

            {commentMessage ? <p className="listing-detail__comment-message">{commentMessage}</p> : null}
          </section>
        </div>
      </article>
    </div>
  );
}

import {useEffect, useMemo, useState, type CSSProperties, type FormEvent, useRef} from "react";
import type { BuyabilityInsight, CatalogListing } from "../types/listing";
import type { ListingComment } from "../services/api-service";
import { createListingComment, fetchListingComments } from "../services/api-service";
import { formatPrice } from "../utils/format";
import { buildImageCandidateUrls } from "../utils/media";
import { cleanPublicListingText } from "../utils/display";
import { getCanonicalGpuModel, getModelFamily } from "../utils/catalog-taxonomy";
import { getExternalListingUrl, getSourceLabel } from "../utils/source";
import { Star, Trash2, X } from "lucide-react";
import { lastSeenLabel, meaningfulText } from "../utils/listing-presentation";
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

type ScoreTier = "high" | "mid" | "low";

function getScoreTier(score: number): ScoreTier {
  if (score >= 75) {
    return "high";
  }
  return score >= 45 ? "mid" : "low";
}

function formatDeltaPercent(delta: number): string {
  return delta > 0 ? `%+${delta}` : `%${delta}`;
}

interface SegmentRange {
  readonly min: number;
  readonly max: number;
}

/** "8.500-9.000 TL" gibi segment metninden min–max aralığını çıkarır. */
function parseSegmentRange(segment: string): SegmentRange | null {
  const match = segment.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*[-–]\s*(\d{1,3}(?:\.\d{3})*|\d+)/);
  if (!match) {
    return null;
  }

  const min = Number(match[1].replace(/\./g, ""));
  const max = Number(match[2].replace(/\./g, ""));

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null;
  }

  return { min, max };
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

const DEFAULT_CHECK_ITEMS: readonly string[] = [
  "Başlıkta bariz parça/arızalı ürün sinyali bulunmadı.",
  "Fiyat, aynı model veya sıfır referansına göre karşılaştırıldı.",
];

const SCORE_SEGMENT_COUNT = 10;

/** Skor sayacı: 0'dan hedefe hızla tırmanır (ease-out), makbuz yazımıyla senkron başlar. */
function ScoreCounter({ target, delayMs = 900 }: { readonly target: number; readonly delayMs?: number }) {
  const [shown, setShown] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    setShown(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }

    const duration = 620;
    let start = 0;
    let timer = 0;

    function tick(now: number) {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * target));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    timer = window.setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, delayMs]);

  return <strong>{shown}</strong>;
}

function sourceKeyForLabel(label: string): string {
  const needle = label.toLocaleLowerCase("tr-TR");
  if (needle.includes("sahibinden")) return "sahibinden";
  if (needle.includes("letgo")) return "letgo";
  if (needle.includes("dolap")) return "dolap";
  if (needle.includes("donanım") || needle.includes("donanim")) return "donanimhaber";
  if (needle.includes("pusula")) return "pecid";
  return "external";
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
  const [checkedItems, setCheckedItems] = useState<ReadonlySet<number>>(new Set());
  const [alarmValue, setAlarmValue] = useState(alertTargetPrice ? String(alertTargetPrice) : "");

  const imageUrl = imageCandidates[imageIndex] ?? null;
  const publicTitle = cleanPublicListingText(listing.title);
  const publicModel = getCanonicalGpuModel(listing) || cleanPublicListingText(listing.model);
  const plateName = (publicModel || listing.brand).toUpperCase();
  const comparisonLabel = insight.isReferenceBased ? "Sıfır referans" : "Model medyanı";
  const comparisonPrice = insight.referencePrice ?? insight.medianPrice;
  const deltaLabel = insight.isReferenceBased ? "Referans farkı" : "Medyan farkı";
  const deltaBaseLabel = insight.isReferenceBased ? "Sıfır referansına göre fark" : "Model medyanına göre fark";
  const sourceLabel = getSourceLabel(listing);
  const externalListingUrl = getExternalListingUrl(listing);

  const tier = getScoreTier(insight.score);
  const filledSegments = Math.max(0, Math.min(SCORE_SEGMENT_COUNT, Math.round(insight.score / 10)));

  const delta = insight.priceDeltaPercent == null ? null : -insight.priceDeltaPercent;
  const deltaSide = delta == null ? null : delta > 0 ? "up" : "down";
  const deltaBarWidth = delta == null ? 0 : Math.min(Math.abs(delta), 40) / 40 * 50;

  const segmentRange = useMemo(() => parseSegmentRange(listing.segment), [listing.segment]);
  const rangePercent = segmentRange
    ? Math.min(98, Math.max(2, ((listing.price - segmentRange.min) / (segmentRange.max - segmentRange.min)) * 100))
    : null;

  const checkItems = insight.riskFlags && insight.riskFlags.length > 0 ? insight.riskFlags : DEFAULT_CHECK_ITEMS;

  useEffect(() => {
    setImageIndex(0);
    setCheckedItems(new Set());
    setAlarmValue(alertTargetPrice ? String(alertTargetPrice) : "");
    // Alarm girdisi yalnızca görsel bir varsayılandır; ilan değişince tazelenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

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

  function toggleCheckItem(index: number) {
    setCheckedItems((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
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

  function sectionStyle(order: number): CSSProperties {
    return { "--stagger": order } as CSSProperties;
  }

  const [isClosing, setIsClosing] = useState(false);
  function handleGracefulClose() {
    if (isClosing) {
      return;
    }
    setIsClosing(true);
    window.setTimeout(onClose, 280);
  }

  return (
    <div
      className={`listing-detail ${isClosing ? "listing-detail--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="İlan detay ve alınabilirlik"
    >
      <button type="button" className="listing-detail__backdrop" onClick={handleGracefulClose} aria-label="Detayı kapat" />

      <aside className="listing-detail__panel">
        <header className="listing-detail__topbar">
          <span className="listing-detail__topbar-title">EMİR FİŞİ</span>
          <button type="button" className="listing-detail__close" onClick={handleGracefulClose} aria-label="Detayı kapat">
            <X size={15} />
          </button>
        </header>

        <span className="listing-detail__print-edge" aria-hidden="true" />
        <div className="listing-detail__scroll">
          <div className="listing-detail__media listing-detail__section tilt-3d" style={sectionStyle(0)}>
            {imageUrl ? (
              <img src={imageUrl} alt={publicTitle} onLoad={(event) => event.currentTarget.classList.add("is-loaded")} onError={handleImageError} />
            ) : (
              <div className="listing-detail__plate" aria-label="Görsel yok">
                <span className="listing-detail__plate-name">{plateName}</span>
                <span className="listing-detail__plate-note">GÖRSEL YOK — KAYNAKTA GÖRÜNTÜLE</span>
              </div>
            )}
          </div>

          <div className="listing-detail__head listing-detail__section" style={sectionStyle(1)}>
            <span className="listing-detail__eyebrow">
              {getModelFamily(listing)} · {publicModel}
            </span>
            <h3 className="listing-detail__title">{publicTitle}</h3>
            <div className="listing-detail__meta">
              <span className="listing-detail__source-pill" data-source={sourceKeyForLabel(sourceLabel)}>{sourceLabel}</span>
              {meaningfulText(listing.brand) ? <span>{listing.brand}</span> : null}
              {meaningfulText(listing.location) ? <span>{listing.location}</span> : null}
              {meaningfulText(listing.listedAtLabel) ?? lastSeenLabel(listing.lastSeenAt) ? (
                <span>{meaningfulText(listing.listedAtLabel) ?? lastSeenLabel(listing.lastSeenAt)}</span>
              ) : null}
            </div>
          </div>

          <section
            className={`listing-detail__card listing-detail__score listing-detail__score--${tier} listing-detail__section`}
            style={sectionStyle(2)}
            aria-label="Alınabilirlik derecesi"
          >
            <div className="listing-detail__score-row">
              <span className="listing-detail__score-value">
                <ScoreCounter target={insight.score} key={listing.id} />
                <span>/100</span>
              </span>
              <span className="listing-detail__score-pill">{insight.label}</span>
            </div>
            <div className="listing-detail__score-track" role="img" aria-label={`Skor ${insight.score}/100`}>
              {Array.from({ length: SCORE_SEGMENT_COUNT }, (_, index) => (
                <span
                  key={index}
                  className={`listing-detail__seg ${index < filledSegments ? "is-filled" : ""}`}
                  style={{ "--seg": index } as CSSProperties}
                />
              ))}
            </div>
            <div className="listing-detail__micro">ALINABİLİRLİK SKORU</div>
            <p className="listing-detail__score-reason">{insight.reason}</p>
          </section>

          <section className="listing-detail__card listing-detail__ledger listing-detail__section" style={sectionStyle(3)} aria-label="Fiyat metrikleri">
            <div className="listing-detail__ledger-row">
              <span className="listing-detail__ledger-label">İLAN FİYATI</span>
              <span className="listing-detail__ledger-value listing-detail__ledger-value--strong">
                {listing.priceText || formatPrice(listing.price)}
              </span>
            </div>
            <div className="listing-detail__ledger-row">
              <span className="listing-detail__ledger-label">{comparisonLabel.toUpperCase()}</span>
              <span className="listing-detail__ledger-value">{comparisonPrice ? formatPrice(comparisonPrice) : "Yok"}</span>
            </div>
            <div className="listing-detail__ledger-row">
              <span className="listing-detail__ledger-label">{deltaLabel.toUpperCase()}</span>
              <span
                className={`listing-detail__ledger-value listing-detail__ledger-value--strong ${
                  deltaSide ? `listing-detail__ledger-value--${deltaSide}` : ""
                }`}
              >
                {delta == null ? "Yok" : formatDeltaPercent(delta)}
              </span>
            </div>
            <div className="listing-detail__ledger-row">
              <span className="listing-detail__ledger-label">EN DÜŞÜK</span>
              <span className="listing-detail__ledger-value">{insight.minPrice ? formatPrice(insight.minPrice) : "Yok"}</span>
            </div>
            <div className="listing-detail__ledger-row">
              <span className="listing-detail__ledger-label">KARŞILAŞTIRMA SETİ</span>
              <span className="listing-detail__ledger-value">{insight.comparableCount} ilan</span>
            </div>
            {!segmentRange ? <p className="listing-detail__ledger-note">{insight.rankText}</p> : null}
          </section>

          {segmentRange ? (
            <section
              className={`listing-detail__card listing-detail__range listing-detail__range--${tier} listing-detail__section`}
              style={sectionStyle(4)}
              aria-label="Fiyatın aralıktaki yeri"
            >
              <div className="listing-detail__micro listing-detail__micro--head">ARALIKTAKİ YERİ</div>
              <div className="listing-detail__range-track">
                <span className="listing-detail__range-dot" style={{ left: `${rangePercent}%` }} />
              </div>
              <div className="listing-detail__range-scale">
                <span>{formatPrice(segmentRange.min)}</span>
                <span>{formatPrice(segmentRange.max)}</span>
              </div>
              <p className="listing-detail__range-caption">{insight.rankText}</p>
              {delta != null ? (
                <>
                  <div className="listing-detail__diff">
                    <span className="listing-detail__diff-axis">
                      <span
                        className={`listing-detail__diff-bar listing-detail__diff-bar--${deltaSide}`}
                        style={{ width: `${deltaBarWidth}%` }}
                      />
                    </span>
                    <span className={`listing-detail__diff-value listing-detail__diff-value--${deltaSide}`}>
                      {formatDeltaPercent(delta)}
                    </span>
                  </div>
                  <div className="listing-detail__micro">{deltaBaseLabel.toUpperCase()}</div>
                </>
              ) : (
                <p className="listing-detail__range-caption">Fiyat dağılımı sınırlı</p>
              )}
            </section>
          ) : null}

          <section className="listing-detail__card listing-detail__checks listing-detail__section" style={sectionStyle(5)} aria-label="Karar notları">
            <div className="listing-detail__micro listing-detail__micro--head">KONTROL ET — ALMADAN ÖNCE</div>
            <p className="listing-detail__checks-intro">
              Skor bilgilendirme amaçlıdır; satın almadan önce seri, test görüntüsü, fatura ve sıcaklık değerlerini ayrıca doğrula.
            </p>
            <div className="listing-detail__check-list">
              {checkItems.map((item, index) => {
                const isChecked = checkedItems.has(index);
                return (
                  <button
                    type="button"
                    key={item}
                    className={`listing-detail__check ${isChecked ? "is-checked" : ""}`}
                    onClick={() => toggleCheckItem(index)}
                    aria-pressed={isChecked}
                  >
                    <span className="listing-detail__check-box" aria-hidden="true">
                      {isChecked ? (
                        <svg width="10" height="9" viewBox="0 0 10 9">
                          <path d="M1 4.5 L3.8 7.2 L9 1.5" stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="listing-detail__check-label">{item}</span>
                    {isChecked ? <span className="listing-detail__check-stamp">KONTROL EDİLDİ</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="listing-detail__card listing-detail__notes listing-detail__section" style={sectionStyle(6)} aria-label="İlan yorumları">
            <div className="listing-detail__notes-head">
              <span className="listing-detail__micro listing-detail__micro--head">SEANS NOTLARI</span>
              <span className="listing-detail__notes-count">{comments.length ? `${comments.length} NOT` : "İLK NOT"}</span>
            </div>

            <div className="listing-detail__note-list">
              {isCommentsLoading ? (
                <div className="listing-detail__note-empty">Yorumlar yükleniyor.</div>
              ) : comments.length === 0 ? (
                <div className="listing-detail__note-empty">Bu ilan için ilk notu sen yaz.</div>
              ) : (
                comments.map((comment) => (
                  <article className="listing-detail__note" key={comment.id}>
                    <div className="listing-detail__note-byline">
                      <strong>{comment.authorName}</strong>
                      <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
                    </div>
                    <p>{comment.body}</p>
                  </article>
                ))
              )}
            </div>

            {commentToken ? (
              <form className="listing-detail__note-form" onSubmit={handleCommentSubmit}>
                <div className="listing-detail__note-author">
                  NOT SAHİBİ · <strong>{commentAuthorName || "Hesabın"}</strong>
                </div>
                <div className="listing-detail__note-input-row">
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    placeholder="Not ekle…"
                    maxLength={600}
                    aria-label="Bu ilan hakkında not yaz"
                  />
                  <button type="submit" disabled={isCommentSubmitting}>
                    EKLE
                  </button>
                </div>
              </form>
            ) : (
              <div className="listing-detail__note-auth">
                <span>Not yazmak için giriş veya kayıt gerekiyor.</span>
                <button type="button" onClick={onRequireAuth}>
                  Giriş yap
                </button>
              </div>
            )}

            {commentMessage ? <p className="listing-detail__note-message">{commentMessage}</p> : null}
          </section>

          <section className="listing-detail__card listing-detail__alarm listing-detail__section" style={sectionStyle(7)} aria-label="Fiyat alarmı">
            <div className="listing-detail__micro listing-detail__micro--head">FİYAT ALARMI — LİMİT EMİR</div>
            <div className="listing-detail__alarm-row">
              <input
                type="text"
                inputMode="numeric"
                value={alarmValue}
                onChange={(event) => setAlarmValue(event.target.value)}
                placeholder="0"
                aria-label="Alarm fiyatı"
              />
              <span className="listing-detail__alarm-hint">TL ALTINA DÜŞERSE HABER VER</span>
              <button type="button" className="listing-detail__alarm-set" onClick={() => onSetPriceAlert(listing)}>
                ALARM KUR
              </button>
            </div>
            {alertTargetPrice ? (
              <div className="listing-detail__micro listing-detail__alarm-current">
                KURULU ALARM: {formatPrice(alertTargetPrice)}
              </div>
            ) : null}
          </section>
        </div>

        <footer className="listing-detail__footer">
          <button
            type="button"
            className={`listing-detail__favorite ${isFavorite ? "is-active" : ""}`}
            onClick={() => onToggleFavorite(listing)}
          >
            <Star size={14} />
            {isFavorite ? "TAKİPTE" : "FAVORİ"}
          </button>
          {canRemoveListing ? (
            <button
              type="button"
              className="listing-detail__remove"
              onClick={() => onRemove(listing)}
              title="İlanı kaldır"
              aria-label="İlanı kaldır"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          {externalListingUrl ? (
            <a className="listing-detail__open" href={externalListingUrl} target="_blank" rel="noopener noreferrer">
              İlanı kaynağında aç ↗
            </a>
          ) : (
            <span className="listing-detail__internal-note">SİTE İÇİ KAYIT</span>
          )}
        </footer>
      </aside>
    </div>
  );
}

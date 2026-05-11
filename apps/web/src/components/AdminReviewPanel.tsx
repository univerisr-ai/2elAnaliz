import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ImageOff,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  adminBlockSubmissionIngest,
  adminRequeueSubmissionIngest,
  approveSubmission,
  fetchIngestQueue,
  fetchReviewQueue,
  rejectSubmission,
  requestSubmissionChanges,
} from "../services/api-service";
import type { SubmissionBundle, SubmissionRecord } from "../types/submission";
import { buildImageCandidateUrls } from "../utils/media";
import "./AdminReviewPanel.css";

type AdminTab = "review" | "ingest";
type MessageTone = "neutral" | "success" | "error";

interface AdminReviewPanelProps {
  readonly token: string | null;
  readonly isAdmin: boolean;
  readonly onBackToSubmit: () => void;
  readonly onQueueChanged?: () => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatStatus(status: SubmissionRecord["status"]): string {
  const labels: Record<SubmissionRecord["status"], string> = {
    draft: "Taslak",
    pending_ingest: "Link işleniyor",
    ingest_failed: "Link okunamadı",
    pending_analysis: "Analiz bekliyor",
    analysis_ready: "Analiz hazır",
    pending_review: "İncelemede",
    published: "Yayında",
    rejected: "Reddedildi",
    archived: "Arşiv",
  };

  return labels[status] ?? status;
}

function formatVerdict(verdict: string): string {
  const labels: Record<string, string> = {
    good_price: "Alınabilir",
    market_ok: "Piyasa uygun",
    expensive: "Pahalı",
    too_cheap_review: "Kontrol gerekli",
    insufficient_data: "Veri az",
  };

  return labels[String(verdict)] ?? String(verdict);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(value: number, currency: string): string {
  return `${value.toLocaleString("tr-TR")} ${currency === "TRY" ? "TL" : currency}`;
}

function getBundleImage(bundle: SubmissionBundle): string | null {
  return bundle.images[0]?.publicUrl ?? bundle.submission.coverImageUrl;
}

function AdminSubmissionImage({ bundle }: { readonly bundle: SubmissionBundle }) {
  const [imageIndex, setImageIndex] = useState(0);
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(getBundleImage(bundle), bundle.submission.title),
    [bundle],
  );
  const imageUrl = imageCandidates[imageIndex] ?? null;

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <div className="admin-review__image">
      {imageUrl ? <img src={imageUrl} alt={bundle.submission.title} onError={handleImageError} /> : <ImageOff size={22} />}
    </div>
  );
}

export function AdminReviewPanel({ token, isAdmin, onBackToSubmit, onQueueChanged }: AdminReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("review");
  const [reviewQueue, setReviewQueue] = useState<SubmissionBundle[]>([]);
  const [ingestQueue, setIngestQueue] = useState<SubmissionBundle[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleQueue = activeTab === "review" ? reviewQueue : ingestQueue;

  const loadQueues = useCallback(async () => {
    if (!token || !isAdmin) {
      setReviewQueue([]);
      setIngestQueue([]);
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");
      const [nextReviewQueue, nextIngestQueue] = await Promise.all([fetchReviewQueue(token), fetchIngestQueue(token)]);
      setReviewQueue(nextReviewQueue);
      setIngestQueue(nextIngestQueue);
    } catch (error) {
      setMessage(getErrorMessage(error, "Yönetim kuyruğu yüklenemedi."));
      setMessageTone("error");
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  function setStatus(nextMessage: string, tone: MessageTone) {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  function getNote(id: string): string {
    return notesById[id]?.trim() || "";
  }

  function updateQueueItem(updated: SubmissionRecord) {
    setReviewQueue((current) => current.filter((bundle) => bundle.submission.id !== updated.id));
    setIngestQueue((current) =>
      current.map((bundle) => (bundle.submission.id === updated.id ? { ...bundle, submission: updated } : bundle)),
    );
  }

  async function handleApprove(bundle: SubmissionBundle) {
    if (!token) return;

    try {
      setBusyId(bundle.submission.id);
      await approveSubmission(bundle.submission.id, token);
      setReviewQueue((current) => current.filter((item) => item.submission.id !== bundle.submission.id));
      setStatus("İlan yayına alındı ve katalog akışına gönderildi.", "success");
      onQueueChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "İlan yayınlanamadı."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestChanges(bundle: SubmissionBundle) {
    if (!token) return;

    try {
      setBusyId(bundle.submission.id);
      const note = getNote(bundle.submission.id) || "Eksik bilgi veya görsel düzenlemesi gerekli.";
      const updated = await requestSubmissionChanges(bundle.submission.id, note, token);
      updateQueueItem(updated);
      setStatus("Düzenleme isteği kullanıcıya bırakıldı.", "success");
      onQueueChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "Düzenleme isteği gönderilemedi."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(bundle: SubmissionBundle) {
    if (!token) return;

    try {
      setBusyId(bundle.submission.id);
      const note = getNote(bundle.submission.id) || "İlan yayın standartlarına uygun değil.";
      const updated = await rejectSubmission(bundle.submission.id, note, token);
      updateQueueItem(updated);
      setStatus("İlan reddedildi.", "success");
      onQueueChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "İlan reddedilemedi."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequeue(bundle: SubmissionBundle) {
    if (!token) return;

    try {
      setBusyId(bundle.submission.id);
      await adminRequeueSubmissionIngest(bundle.submission.id, token);
      setStatus("Link tekrar işleme kuyruğuna alındı.", "success");
      await loadQueues();
    } catch (error) {
      setStatus(getErrorMessage(error, "Link tekrar kuyruğa alınamadı."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBlock(bundle: SubmissionBundle) {
    if (!token) return;

    try {
      setBusyId(bundle.submission.id);
      const note = getNote(bundle.submission.id) || "Kaynak link okunamadı veya güvenilir bulunmadı.";
      await adminBlockSubmissionIngest(bundle.submission.id, note, token);
      setStatus("Link bloklu olarak işaretlendi.", "success");
      await loadQueues();
    } catch (error) {
      setStatus(getErrorMessage(error, "Link bloklanamadı."), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-review" aria-label="Yönetim inceleme paneli">
      <div className="admin-review__head">
        <div>
          <span className="admin-review__eyebrow">
            <ShieldCheck size={14} />
            Yönetim
          </span>
          <h2>İlan onay kuyruğu</h2>
          <p>Yayın bekleyen ilanları, link okuma hatalarını ve analiz sonucunu tek ekrandan kontrol et.</p>
        </div>
        <button type="button" className="admin-review__refresh" onClick={loadQueues} disabled={!token || !isAdmin || isLoading}>
          <RefreshCw size={15} />
          Yenile
        </button>
      </div>

      {!token ? (
        <div className="admin-review__auth">
          <AlertTriangle size={22} />
          <div>
            <strong>Yönetim paneli için oturum gerekli.</strong>
            <p>Önce test hesabınla giriş yap, sonra bu panelde onay akışını kullan.</p>
          </div>
          <button type="button" onClick={onBackToSubmit}>
            Girişe git
          </button>
        </div>
      ) : !isAdmin ? (
        <div className="admin-review__auth">
          <AlertTriangle size={22} />
          <div>
            <strong>Bu panel yalnızca yönetici hesabına açık.</strong>
            <p>Normal kullanıcı oturumunda ilan ekleme ve yorum akışlarını test edebilirsin.</p>
          </div>
          <button type="button" onClick={onBackToSubmit}>
            İlan paneline git
          </button>
        </div>
      ) : (
        <>
          <div className="admin-review__tabs" role="tablist" aria-label="Yönetim kuyruğu">
            <button
              type="button"
              className={activeTab === "review" ? "is-active" : ""}
              aria-pressed={activeTab === "review"}
              onClick={() => setActiveTab("review")}
            >
              <CheckCircle2 size={15} />
              İnceleme
              <strong>{reviewQueue.length}</strong>
            </button>
            <button
              type="button"
              className={activeTab === "ingest" ? "is-active" : ""}
              aria-pressed={activeTab === "ingest"}
              onClick={() => setActiveTab("ingest")}
            >
              <Clock3 size={15} />
              Link kuyruğu
              <strong>{ingestQueue.length}</strong>
            </button>
          </div>

          {message ? <div className={`admin-review__message admin-review__message--${messageTone}`}>{message}</div> : null}

          {isLoading && visibleQueue.length === 0 ? <div className="admin-review__empty">Kuyruk yükleniyor.</div> : null}

          {!isLoading && visibleQueue.length === 0 ? (
            <div className="admin-review__empty">Bu kuyruk şu an temiz.</div>
          ) : null}

          <div className="admin-review__list">
            {visibleQueue.map((bundle) => {
              const submission = bundle.submission;
              const isBusy = busyId === submission.id;

              return (
                <article className="admin-review__item" key={submission.id}>
                  <AdminSubmissionImage bundle={bundle} />

                  <div className="admin-review__body">
                    <div className="admin-review__title-row">
                      <div>
                        <span>{submission.submissionType === "link" ? "Link kaydı" : "Manuel ilan"}</span>
                        <h3>{submission.title}</h3>
                      </div>
                      <strong>{formatStatus(submission.status)}</strong>
                    </div>

                    <div className="admin-review__meta">
                      <span>{formatPrice(submission.price, submission.currency)}</span>
                      <span>{submission.model || "Model bekliyor"}</span>
                      <span>{formatDate(submission.createdAt)}</span>
                      <span>{bundle.ownerProfile?.displayName || bundle.ownerProfile?.email || "Kullanıcı"}</span>
                    </div>

                    {bundle.analysis ? (
                      <section className="admin-review__analysis" aria-label="Analiz özeti">
                        <div>
                          <span>{formatVerdict(bundle.analysis.verdict)}</span>
                          <strong>{bundle.analysis.confidencePercent}% güven</strong>
                        </div>
                        <p>{bundle.analysis.summaryNote}</p>
                      </section>
                    ) : (
                      <section className="admin-review__analysis admin-review__analysis--muted">
                        <span>Analiz bekliyor</span>
                        <p>Model veya fiyat analizi tamamlanınca burada görünecek.</p>
                      </section>
                    )}

                    {activeTab === "ingest" && bundle.ingestJob ? (
                      <div className="admin-review__job">
                        <span>Durum: {bundle.ingestJob.status}</span>
                        <span>Deneme: {bundle.ingestJob.attemptCount}/{bundle.ingestJob.maxAttempts}</span>
                        {bundle.ingestJob.lastError ? <span>{bundle.ingestJob.lastError}</span> : null}
                      </div>
                    ) : null}

                    <label className="admin-review__note">
                      <span>Not</span>
                      <input
                        type="text"
                        value={notesById[submission.id] ?? ""}
                        onChange={(event) =>
                          setNotesById((current) => ({ ...current, [submission.id]: event.target.value }))
                        }
                        placeholder="Ret, düzenleme veya link bloklama notu"
                      />
                    </label>

                    <div className="admin-review__actions">
                      {activeTab === "review" ? (
                        <>
                          <button type="button" className="admin-review__approve" onClick={() => handleApprove(bundle)} disabled={isBusy}>
                            <CheckCircle2 size={14} />
                            Yayına al
                          </button>
                          <button type="button" onClick={() => handleRequestChanges(bundle)} disabled={isBusy}>
                            <RotateCcw size={14} />
                            Düzenleme iste
                          </button>
                          <button type="button" className="admin-review__danger" onClick={() => handleReject(bundle)} disabled={isBusy}>
                            <XCircle size={14} />
                            Reddet
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="admin-review__approve" onClick={() => handleRequeue(bundle)} disabled={isBusy}>
                            <RefreshCw size={14} />
                            Tekrar işle
                          </button>
                          <button type="button" className="admin-review__danger" onClick={() => handleBlock(bundle)} disabled={isBusy}>
                            <XCircle size={14} />
                            Blokla
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

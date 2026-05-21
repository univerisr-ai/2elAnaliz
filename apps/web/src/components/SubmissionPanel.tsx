import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  Link as LinkIcon,
  LogOut,
  Mail,
  MessageSquareText,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  createLinkSubmission,
  createNativeSubmission,
  deleteMySubmission,
  fetchMySubmissionComments,
  fetchMySubmissions,
  submitSubmissionForReview,
  uploadSubmissionImages,
  type ListingComment,
} from "../services/api-service";
import {
  getCurrentSession,
  isAuthAvailable,
  isOAuthProviderEnabled,
  isSupabaseBrowserConfigured,
  signInWithEmail,
  signInWithMagicLink,
  signInWithOAuthProvider,
  signOutUser,
  signUpWithEmail,
  subscribeToAuthChanges,
  type OAuthProvider,
} from "../services/supabase-auth";
import { GPU_BRAND } from "../types/listing";
import type { SubmissionBundle, SubmissionRecord } from "../types/submission";
import { buildImageCandidateUrls } from "../utils/media";
import "./SubmissionPanel.css";

type SubmitMode = "link" | "manual";
type AuthIntent = "signin" | "signup";
type SubmissionView = SubmitMode | AuthIntent;
type MessageTone = "neutral" | "success" | "error";

interface NativeFormState {
  title: string;
  description: string;
  brand: string;
  model: string;
  price: string;
  location: string;
  category: string;
  imageUrl: string;
}

interface SubmissionPreviewState {
  title: string;
  imageUrl: string | null;
  note: string;
  label: string;
}

interface SubmissionPanelProps {
  readonly view?: SubmissionView;
  readonly authIntent?: AuthIntent;
  readonly onBackToCatalog: () => void;
  readonly onNavigateToSubmitMode?: (mode: SubmitMode) => void;
  readonly onAuthNavigate?: (intent: AuthIntent) => void;
  readonly onAccountChanged?: () => void;
}

const INITIAL_NATIVE_FORM: NativeFormState = {
  title: "",
  description: "",
  brand: GPU_BRAND.NVIDIA,
  model: "",
  price: "",
  location: "",
  category: "gpu",
  imageUrl: "",
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getAuthErrorMessage(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback);
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "E-posta veya şifre hatalı.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "E-postadaki doğrulama linkine tıkladıktan sonra giriş yapabilirsin.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "Bu e-posta zaten kayıtlı. Giriş yapmayı veya e-posta linkini dene.";
  }

  if (normalizedMessage.includes("signup is disabled")) {
    return "Yeni kayıtlar Supabase tarafında kapalı görünüyor.";
  }

  if (normalizedMessage.includes("provider is not enabled") || normalizedMessage.includes("unsupported provider")) {
    return "Bu giriş seçeneği Supabase tarafında henüz açılmamış.";
  }

  return message;
}

const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
};

function formatSubmissionStatus(status: SubmissionRecord["status"]): string {
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

function formatAnalysisVerdict(verdict: string): string {
  const labels: Record<string, string> = {
    good_price: "Alınabilir",
    market_ok: "Piyasa uygun",
    expensive: "Pahalı",
    too_cheap_review: "Kontrol gerekli",
    insufficient_data: "Veri az",
  };

  return labels[String(verdict)] ?? String(verdict);
}

function formatSubmissionDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(value: number, currency: string): string {
  return `${value.toLocaleString("tr-TR")} ${currency === "TRY" ? "TL" : currency}`;
}

function canRemoveSubmission(status: SubmissionRecord["status"]): boolean {
  return status !== "published";
}

function getSubmissionImage(bundle: SubmissionBundle): string | null {
  return bundle.images[0]?.publicUrl ?? bundle.submission.coverImageUrl;
}

function SubmissionThumbnail({ bundle }: { readonly bundle: SubmissionBundle }) {
  const [imageIndex, setImageIndex] = useState(0);
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(getSubmissionImage(bundle), bundle.submission.title),
    [bundle],
  );
  const imageUrl = imageCandidates[imageIndex] ?? null;

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <div className="submission-panel__submission-media">
      {imageUrl ? <img src={imageUrl} alt={bundle.submission.title} onError={handleImageError} /> : <ImageOff size={20} />}
    </div>
  );
}

function SubmissionComments({
  bundle,
  comments,
  isLoading,
}: {
  readonly bundle: SubmissionBundle;
  readonly comments: readonly ListingComment[] | undefined;
  readonly isLoading: boolean;
}) {
  if (!bundle.submission.publishedListingId) {
    return <p className="submission-panel__comments-note">İlan yayına alınırsa gelen yorumlar burada görünecek.</p>;
  }

  if (isLoading) {
    return <p className="submission-panel__comments-note">Yorumlar yükleniyor.</p>;
  }

  if (!comments || comments.length === 0) {
    return <p className="submission-panel__comments-note">Bu ilana henüz yorum gelmedi.</p>;
  }

  return (
    <div className="submission-panel__comments-list">
      {comments.map((comment) => (
        <article key={comment.id} className="submission-panel__comment">
          <div>
            <strong>{comment.authorName}</strong>
            <span>{formatSubmissionDate(comment.createdAt)}</span>
          </div>
          <p>{comment.body}</p>
        </article>
      ))}
    </div>
  );
}

function MySubmissionsPanel({
  submissions,
  commentsBySubmissionId,
  expandedSubmissionId,
  isLoading,
  commentsLoadingId,
  onRefresh,
  onToggleComments,
  onRemoveSubmission,
}: {
  readonly submissions: readonly SubmissionBundle[];
  readonly commentsBySubmissionId: Readonly<Record<string, ListingComment[]>>;
  readonly expandedSubmissionId: string | null;
  readonly isLoading: boolean;
  readonly commentsLoadingId: string | null;
  readonly onRefresh: () => void;
  readonly onToggleComments: (bundle: SubmissionBundle) => void;
  readonly onRemoveSubmission: (bundle: SubmissionBundle) => void;
}) {
  return (
    <section className="submission-panel__account" aria-label="Gönderilen ilanlar">
      <div className="submission-panel__account-head">
        <div>
          <span className="submission-panel__eyebrow">Hesabım</span>
          <h3>Gönderilen ilanlar</h3>
          <p>Link ve manuel ilanlarının durumunu, analizini ve yayın sonrası yorumlarını buradan takip et.</p>
        </div>
        <button type="button" className="submission-panel__ghost-button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={14} />
          Yenile
        </button>
      </div>

      {isLoading && submissions.length === 0 ? (
        <div className="submission-panel__empty-state">İlanların yükleniyor.</div>
      ) : null}

      {!isLoading && submissions.length === 0 ? (
        <div className="submission-panel__empty-state">Henüz gönderilmiş ilan veya link yok.</div>
      ) : null}

      {submissions.length > 0 ? (
        <div className="submission-panel__submission-list">
          {submissions.map((bundle) => {
            const submission = bundle.submission;
            const isExpanded = expandedSubmissionId === submission.id;
            const comments = commentsBySubmissionId[submission.id];

            return (
              <article key={submission.id} className="submission-panel__submission-item">
                <SubmissionThumbnail bundle={bundle} />
                <div className="submission-panel__submission-body">
                  <div className="submission-panel__submission-title-row">
                    <div>
                      <span>{submission.submissionType === "link" ? "Link kaydı" : "Manuel ilan"}</span>
                      <h4>{submission.title}</h4>
                    </div>
                    <strong>{formatSubmissionStatus(submission.status)}</strong>
                  </div>

                  <div className="submission-panel__submission-meta">
                    <span>{formatPrice(submission.price, submission.currency)}</span>
                    <span>{submission.model || "Model bekliyor"}</span>
                    <span>{formatSubmissionDate(submission.createdAt)}</span>
                    {bundle.analysis ? <span>{formatAnalysisVerdict(bundle.analysis.verdict)}</span> : null}
                  </div>

                  <div className="submission-panel__submission-actions">
                    {submission.sourceUrl ? (
                      <a className="submission-panel__source-link" href={submission.sourceUrl} target="_blank" rel="noreferrer">
                        Gönderilen bağlantıyı aç
                      </a>
                    ) : null}

                    <button
                      type="button"
                      className="submission-panel__comments-toggle"
                      onClick={() => onToggleComments(bundle)}
                    >
                      <MessageSquareText size={14} />
                      {isExpanded ? "Yorumları kapat" : "Yorumları oku"}
                    </button>

                    {canRemoveSubmission(submission.status) ? (
                      <button
                        type="button"
                        className="submission-panel__remove-button"
                        onClick={() => onRemoveSubmission(bundle)}
                      >
                        <Trash2 size={14} />
                        İlanı kaldır
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <SubmissionComments
                      bundle={bundle}
                      comments={comments}
                      isLoading={commentsLoadingId === submission.id}
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SubmissionImagePreview({ preview }: { readonly preview: SubmissionPreviewState }) {
  const [imageIndex, setImageIndex] = useState(0);
  const imageCandidates = useMemo(
    () => buildImageCandidateUrls(preview.imageUrl, preview.title),
    [preview.imageUrl, preview.title],
  );
  const imageUrl = imageCandidates[imageIndex] ?? null;

  function handleImageError() {
    if (imageIndex < imageCandidates.length - 1) {
      setImageIndex((current) => current + 1);
    }
  }

  return (
    <section className="submission-panel__preview" aria-label="İlan görseli önizleme">
      <div className="submission-panel__preview-media">
        {imageUrl ? (
          <img src={imageUrl} alt={preview.title} onError={handleImageError} />
        ) : (
          <div className="submission-panel__preview-placeholder">
            <ImageOff size={24} />
          </div>
        )}
      </div>
      <div>
        <span>
          <Sparkles size={14} />
          {preview.label}
        </span>
        <strong>{preview.title}</strong>
        <p>{preview.note}</p>
      </div>
    </section>
  );
}

export function SubmissionPanel({
  view = "link",
  authIntent = "signin",
  onBackToCatalog,
  onNavigateToSubmitMode,
  onAuthNavigate,
  onAccountChanged,
}: SubmissionPanelProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [nativeForm, setNativeForm] = useState(INITIAL_NATIVE_FORM);
  const [nativeImageFiles, setNativeImageFiles] = useState<File[]>([]);
  const [nativeImageInputKey, setNativeImageInputKey] = useState(0);
  const [submittedPreview, setSubmittedPreview] = useState<SubmissionPreviewState | null>(null);
  const [mySubmissions, setMySubmissions] = useState<SubmissionBundle[]>([]);
  const [commentsBySubmissionId, setCommentsBySubmissionId] = useState<Record<string, ListingComment[]>>({});
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [isBusy, setIsBusy] = useState(false);
  const [isMySubmissionsLoading, setIsMySubmissionsLoading] = useState(false);
  const [commentsLoadingId, setCommentsLoadingId] = useState<string | null>(null);
  const isAuthConfigured = isAuthAvailable();
  const isOAuthConfigured = isSupabaseBrowserConfigured();
  const isGoogleOAuthReady = isOAuthConfigured && isOAuthProviderEnabled("google");
  const isAuthPage = view === "signin" || view === "signup";
  const activeAuthIntent: AuthIntent = view === "signup" ? "signup" : view === "signin" ? "signin" : authIntent;
  const activeSubmitMode: SubmitMode = view === "manual" ? "manual" : "link";

  const setStatus = useCallback((nextMessage: string, tone: MessageTone) => {
    setMessage(nextMessage);
    setMessageTone(tone);
  }, []);

  const loadMySubmissions = useCallback(async (token: string) => {
    setIsMySubmissionsLoading(true);
    try {
      const submissions = await fetchMySubmissions(token);
      setMySubmissions(submissions);
    } catch (error) {
      setStatus(getErrorMessage(error, "İlanların yüklenemedi."), "error");
    } finally {
      setIsMySubmissionsLoading(false);
    }
  }, [setStatus]);

  useEffect(() => {
    let isMounted = true;

    getCurrentSession()
      .then((currentSession) => {
        if (isMounted) {
          setSession(currentSession);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setMessage(getAuthErrorMessage(error, "Oturum okunamadı."));
          setMessageTone("error");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      });

    const unsubscribe = subscribeToAuthChanges((nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setMySubmissions([]);
      setCommentsBySubmissionId({});
      setExpandedSubmissionId(null);
      return;
    }

    void loadMySubmissions(token);
  }, [loadMySubmissions, session?.access_token]);

  async function handleSignInSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthConfigured) {
      setStatus("Supabase anahtarları eklenince oturum açma ve ilan gönderimi aktif olur.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setStatus("", "neutral");
      await signInWithEmail(signInEmail.trim(), signInPassword);
      const nextSession = await getCurrentSession();
      setSession(nextSession);
      setSignInPassword("");
      setStatus("Oturum hazır.", "success");
      onAccountChanged?.();
    } catch (error) {
      setStatus(getAuthErrorMessage(error, "Oturum işlemi tamamlanamadı."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthConfigured) {
      setStatus("Supabase anahtarları eklenince hesap açma ve ilan gönderimi aktif olur.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setStatus("", "neutral");
      const result = await signUpWithEmail(signUpEmail.trim(), signUpPassword, displayName.trim());
      if (result.requiresEmailConfirmation && !result.session) {
        setSignUpPassword("");
        setStatus("Kayıt oluşturuldu. E-postadaki doğrulama linkine tıklayınca giriş aktif olur.", "success");
        return;
      }

      if (!result.session) {
        await signInWithEmail(signUpEmail.trim(), signUpPassword);
      }

      const nextSession = await getCurrentSession();
      setSession(nextSession);
      setSignUpPassword("");
      setStatus("Oturum hazır.", "success");
      onAccountChanged?.();
    } catch (error) {
      setStatus(getAuthErrorMessage(error, "Hesap açılamadı."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMagicLinkSignIn() {
    const trimmedEmail = signInEmail.trim();
    if (!trimmedEmail) {
      setStatus("E-posta adresini yazınca giriş linki gönderebilirim.", "error");
      return;
    }

    if (!isOAuthConfigured) {
      setStatus("E-posta linki için canlı Supabase ayarı gerekiyor.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setStatus("", "neutral");
      await signInWithMagicLink(trimmedEmail);
      setStatus("Giriş linki e-postana gönderildi.", "success");
    } catch (error) {
      setStatus(getAuthErrorMessage(error, "Giriş linki gönderilemedi."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOAuthSignIn(provider: OAuthProvider) {
    if (!isOAuthProviderEnabled(provider)) {
      setStatus(`${OAUTH_PROVIDER_LABELS[provider]} girişi Supabase tarafında henüz açılmamış.`, "error");
      return;
    }

    if (!isOAuthConfigured) {
      setStatus("Google girişi için canlı Supabase ayarı gerekiyor.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setStatus(`${OAUTH_PROVIDER_LABELS[provider]} ekranına yönlendiriliyor.`, "neutral");
      await signInWithOAuthProvider(provider);
    } catch (error) {
      setStatus(getAuthErrorMessage(error, "Hızlı giriş başlatılamadı."), "error");
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      setIsBusy(true);
      await signOutUser();
      setSession(null);
      setMySubmissions([]);
      setCommentsBySubmissionId({});
      setExpandedSubmissionId(null);
      setStatus("Oturum kapatıldı.", "neutral");
      onAccountChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "Oturum kapatılamadı."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = session?.access_token;

    if (!token) {
      setStatus("İlan göndermek için oturum aç.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setSubmittedPreview(null);
      const submission = await createLinkSubmission(sourceUrl.trim(), token);
      setSourceUrl("");
      setSubmittedPreview({
        title: submission.title || "İlan",
        imageUrl: submission.coverImageUrl,
        label: "Link görseli",
        note: submission.coverImageUrl
          ? "Kapak görseli linkten otomatik alındı."
          : "Görsel kaynak kuyruğu tamamlanınca otomatik tamamlanacak.",
      });
      setStatus(`${submission.title || "İlan linki"} sıraya alındı.`, "success");
      const currentSession = await getCurrentSession();
      if (currentSession) {
        setSession(currentSession);
        await loadMySubmissions(currentSession.access_token);
        onAccountChanged?.();
      }
    } catch (error) {
      setStatus(getErrorMessage(error, "Link ile ilan eklenemedi."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleNativeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = session?.access_token;
    const price = Number(nativeForm.price);

    if (!token) {
      setStatus("İlan göndermek için oturum aç.", "error");
      return;
    }

    const hasUploadedImages = nativeImageFiles.length > 0;
    const coverImageUrl = nativeForm.imageUrl.trim();

    if (!nativeForm.title.trim() || !nativeForm.description.trim() || !Number.isFinite(price) || price <= 0) {
      setStatus("Başlık, açıklama ve geçerli fiyat zorunlu.", "error");
      return;
    }

    if (!hasUploadedImages) {
      setStatus("Manuel ilan için en az bir görsel dosyası zorunlu. Görsel linki yalnızca yedek bilgi olarak kalır.", "error");
      return;
    }

    try {
      setIsBusy(true);
      setSubmittedPreview(null);
      const submission = await createNativeSubmission(
        {
          title: nativeForm.title.trim(),
          description: nativeForm.description.trim(),
          brand: nativeForm.brand,
          model: nativeForm.model.trim(),
          category: nativeForm.category.trim() || "gpu",
          price,
          currency: "TRY",
          location: nativeForm.location.trim(),
          coverImageUrl: coverImageUrl || null,
        },
        token,
      );
      const uploadedImages = hasUploadedImages ? await uploadSubmissionImages(submission.id, nativeImageFiles, token) : [];
      const reviewResult = await submitSubmissionForReview(submission.id, token);
      const reviewedSubmission = reviewResult.submission ?? submission;
      const previewImageUrl = uploadedImages[0]?.publicUrl ?? reviewedSubmission.coverImageUrl ?? (coverImageUrl || null);
      setNativeForm(INITIAL_NATIVE_FORM);
      setNativeImageFiles([]);
      setNativeImageInputKey((current) => current + 1);
      setSubmittedPreview({
        title: reviewedSubmission.title,
        imageUrl: previewImageUrl,
        label: "İlan görseli",
        note: uploadedImages.length > 0 ? `${uploadedImages.length} görsel ilana bağlandı.` : "Eklediğin görsel ilana bağlandı.",
      });
      setStatus(`${submission.title} inceleme kuyruğuna alındı.`, "success");
      await loadMySubmissions(token);
      onAccountChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "Elle ilan oluşturulamadı."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshMySubmissions() {
    const token = session?.access_token;
    if (!token) {
      return;
    }

    await loadMySubmissions(token);
    onAccountChanged?.();
  }

  async function handleRemoveSubmission(bundle: SubmissionBundle) {
    const token = session?.access_token;
    if (!token) {
      setStatus("İlan kaldırmak için oturum aç.", "error");
      return;
    }

    if (!canRemoveSubmission(bundle.submission.status)) {
      setStatus("Yayındaki ilanı katalog ekranından kaldırabilirsin.", "error");
      return;
    }

    const confirmed = window.confirm(`"${bundle.submission.title}" kaydını kaldırmak istiyor musun?`);
    if (!confirmed) {
      return;
    }

    try {
      setIsBusy(true);
      await deleteMySubmission(bundle.submission.id, token);
      setMySubmissions((current) => current.filter((item) => item.submission.id !== bundle.submission.id));
      setCommentsBySubmissionId((current) => {
        const next = { ...current };
        delete next[bundle.submission.id];
        return next;
      });
      setExpandedSubmissionId((current) => (current === bundle.submission.id ? null : current));
      setStatus("İlan kaydı kaldırıldı.", "success");
      onAccountChanged?.();
    } catch (error) {
      setStatus(getErrorMessage(error, "İlan kaldırılamadı."), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleToggleComments(bundle: SubmissionBundle) {
    const submissionId = bundle.submission.id;
    if (expandedSubmissionId === submissionId) {
      setExpandedSubmissionId(null);
      return;
    }

    setExpandedSubmissionId(submissionId);
    if (commentsBySubmissionId[submissionId] || !session?.access_token) {
      return;
    }

    try {
      setCommentsLoadingId(submissionId);
      const comments = await fetchMySubmissionComments(submissionId, session.access_token);
      setCommentsBySubmissionId((current) => ({
        ...current,
        [submissionId]: comments,
      }));
    } catch (error) {
      setStatus(getErrorMessage(error, "Yorumlar yüklenemedi."), "error");
    } finally {
      setCommentsLoadingId(null);
    }
  }

  return (
    <section className="submission-panel">
      <div className="submission-panel__intro">
        <div>
          <span className="submission-panel__eyebrow">İlan Ekle</span>
          <h2 id="submit-title">Kendi ekran kartı ilanını gönder</h2>
          <p>
            {session
              ? "Gönderilen ilanlar yayınlanmadan önce inceleme kuyruğuna alınır."
              : "Sat bölümüne devam etmek için giriş yap veya kayıt ol."}
          </p>
        </div>
        <button type="button" className="submission-panel__back" onClick={onBackToCatalog}>
          <ArrowLeft size={15} />
          Kataloğa dön
        </button>
      </div>

      {!session && !isAuthPage ? (
        <p className="submission-panel__signed-out-note">İlan formu için üst menüden giriş yapabilir veya kayıt olabilirsin.</p>
      ) : null}

      {session ? (
        <section className="submission-panel__auth-strip" aria-label="Oturum">
          <div className="submission-panel__auth-head">
            <span className="submission-panel__icon">
              <UserRound size={18} />
            </span>
            <div>
              <strong>Oturum açık</strong>
              <p>{session.user.email}</p>
            </div>
          </div>
          <button type="button" className="submission-panel__ghost-button" disabled={isBusy} onClick={handleSignOut}>
            <LogOut size={14} />
            Çıkış yap
          </button>
        </section>
      ) : null}

      {!session && isAuthPage ? (
        <section className="submission-panel__auth-gateway submission-panel__auth-gateway--single" aria-label="Oturum">
          {activeAuthIntent === "signin" ? (
          <article className="submission-panel__auth-panel is-recommended">
            <div className="submission-panel__auth-panel-head">
              <span className="submission-panel__icon">
                <UserRound size={18} />
              </span>
              <div>
                <span className="submission-panel__eyebrow">Oturum</span>
                <h3>Giriş yap</h3>
                <p>{isSessionLoading ? "Oturum kontrol ediliyor." : "Kayıtlı hesabınla ilanlarını takip et."}</p>
              </div>
            </div>

            <form className="submission-panel__auth-form" onSubmit={handleSignInSubmit}>
              <div className="submission-panel__oauth-grid" aria-label="Giriş seçenekleri">
                <button
                  type="button"
                  className="submission-panel__oauth-button"
                  onClick={() => handleOAuthSignIn("google")}
                  disabled={isBusy || !isGoogleOAuthReady}
                  title={!isGoogleOAuthReady ? "Google provider Supabase'de açılınca aktif olur." : undefined}
                >
                  <span className="submission-panel__provider-mark" aria-hidden="true">
                    G
                  </span>
                  Google
                </button>
              </div>

              <div className="submission-panel__auth-divider">
                <span>E-posta ile</span>
              </div>

              <label>
                <span>E-posta</span>
                <input
                  type="email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  required
                  disabled={!isAuthConfigured}
                />
              </label>

              <button
                type="button"
                className="submission-panel__ghost-button submission-panel__magic-link-button"
                onClick={handleMagicLinkSignIn}
                disabled={isBusy || !isOAuthConfigured}
              >
                <Mail size={14} />
                E-posta linki gönder
              </button>

              <label>
                <span>Şifre</span>
                <input
                  type="password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!isAuthConfigured}
                />
              </label>

              <button type="submit" className="submission-panel__primary-button" disabled={isBusy || !isAuthConfigured}>
                Giriş yap
              </button>

              <button type="button" className="submission-panel__auth-switch" onClick={() => onAuthNavigate?.("signup")}>
                Yeni kullanıcı mısın? Hesap oluştur
              </button>
            </form>
          </article>
          ) : (
          <article className="submission-panel__auth-panel submission-panel__auth-panel--register is-recommended">
            <div className="submission-panel__auth-panel-head">
              <span className="submission-panel__icon">
                <Plus size={18} />
              </span>
              <div>
                <span className="submission-panel__eyebrow">Yeni hesap</span>
                <h3>Kayıt ol</h3>
                <p>Hesap oluştur, ilan eklemeye başla.</p>
              </div>
            </div>

            <form className="submission-panel__auth-form" onSubmit={handleSignUpSubmit}>
              <div className="submission-panel__oauth-grid" aria-label="Kayıt seçenekleri">
                <button
                  type="button"
                  className="submission-panel__oauth-button"
                  onClick={() => handleOAuthSignIn("google")}
                  disabled={isBusy || !isGoogleOAuthReady}
                  title={!isGoogleOAuthReady ? "Google provider Supabase'de açılınca aktif olur." : undefined}
                >
                  <span className="submission-panel__provider-mark" aria-hidden="true">
                    G
                  </span>
                  Google
                </button>
              </div>

              <div className="submission-panel__auth-divider">
                <span>E-posta ile</span>
              </div>

              <label>
                <span>Ad</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={!isAuthConfigured}
                />
              </label>

              <label>
                <span>E-posta</span>
                <input
                  type="email"
                  value={signUpEmail}
                  onChange={(event) => setSignUpEmail(event.target.value)}
                  required
                  disabled={!isAuthConfigured}
                />
              </label>

              <label>
                <span>Şifre</span>
                <input
                  type="password"
                  value={signUpPassword}
                  onChange={(event) => setSignUpPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!isAuthConfigured}
                />
              </label>

              <button type="submit" className="submission-panel__primary-button" disabled={isBusy || !isAuthConfigured}>
                Hesap aç
              </button>

              <button type="button" className="submission-panel__auth-switch" onClick={() => onAuthNavigate?.("signin")}>
                Zaten hesabın var mı? Giriş yap
              </button>
            </form>
          </article>
          )}
        </section>
      ) : null}

      {message ? (
        <div className={`submission-panel__message submission-panel__message--${messageTone}`}>
          {messageTone === "success" ? <CheckCircle2 size={16} /> : null}
          <span>{message}</span>
        </div>
      ) : null}

      {session && isAuthPage ? (
        <section className="submission-panel__choice-panel" aria-label="İlan ekleme seçenekleri">
          <div>
            <span className="submission-panel__eyebrow">Hazır</span>
            <h3>İlan ekleme türünü seç</h3>
            <p>Linkten hızlı kayıt açabilir veya fotoğraflı manuel ilan gönderebilirsin.</p>
          </div>
          <div className="submission-panel__choice-row">
            <button type="button" className="submission-panel__choice-button" onClick={() => onNavigateToSubmitMode?.("link")}>
              <LinkIcon size={16} />
              Link ile ekle
            </button>
            <button type="button" className="submission-panel__choice-button" onClick={() => onNavigateToSubmitMode?.("manual")}>
              <Plus size={16} />
              Manuel ilan ekle
            </button>
          </div>
        </section>
      ) : null}

      {session && !isAuthPage ? (
        <div className="submission-panel__workspace">
          <div className="submission-panel__form-shell submission-panel__form-shell--full">
            <div className="submission-panel__mode-switch submission-panel__mode-switch--wide" role="tablist" aria-label="İlan modu">
              <button
                type="button"
                className={activeSubmitMode === "link" ? "is-active" : ""}
                onClick={() => onNavigateToSubmitMode?.("link")}
              >
                Link
              </button>
              <button
                type="button"
                className={activeSubmitMode === "manual" ? "is-active" : ""}
                onClick={() => onNavigateToSubmitMode?.("manual")}
              >
                Manuel
              </button>
            </div>

          {activeSubmitMode === "link" ? (
            <form className="submission-panel__listing-form" onSubmit={handleLinkSubmit}>
              <label className="submission-panel__wide-field">
                <span>İlan linki</span>
                <input
                  type="url"
                  placeholder="İlan bağlantısını yapıştır"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  required
                />
              </label>
              <button type="submit" className="submission-panel__primary-button" disabled={isBusy || !session}>
                <LinkIcon size={15} />
                Linki gönder
              </button>
            </form>
          ) : (
            <form className="submission-panel__listing-form submission-panel__listing-form--manual" onSubmit={handleNativeSubmit}>
              <label className="submission-panel__wide-field">
                <span>Başlık</span>
                <input
                  value={nativeForm.title}
                  onChange={(event) => setNativeForm((current) => ({ ...current, title: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Marka</span>
                <select
                  value={nativeForm.brand}
                  onChange={(event) => setNativeForm((current) => ({ ...current, brand: event.target.value }))}
                >
                  <option value={GPU_BRAND.NVIDIA}>NVIDIA</option>
                  <option value={GPU_BRAND.AMD}>AMD</option>
                  <option value={GPU_BRAND.INTEL}>Intel</option>
                  <option value={GPU_BRAND.UNKNOWN}>Bilinmiyor</option>
                </select>
              </label>

              <label>
                <span>Model</span>
                <input
                  value={nativeForm.model}
                  onChange={(event) => setNativeForm((current) => ({ ...current, model: event.target.value }))}
                  placeholder="RTX 4070"
                />
              </label>

              <label>
                <span>Fiyat</span>
                <input
                  type="number"
                  min="1"
                  value={nativeForm.price}
                  onChange={(event) => setNativeForm((current) => ({ ...current, price: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Konum</span>
                <input
                  value={nativeForm.location}
                  onChange={(event) => setNativeForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="İstanbul"
                />
              </label>

              <label className="submission-panel__wide-field">
                <span>Fotoğraf yükle</span>
                <input
                  key={nativeImageInputKey}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => setNativeImageFiles(Array.from(event.target.files ?? []))}
                />
                <small className="submission-panel__field-hint">
                  {nativeImageFiles.length > 0
                    ? `${nativeImageFiles.length} görsel seçildi`
                    : "JPG, PNG veya WebP görsel seçmek zorunlu. Link yalnızca yedek bilgi olarak kullanılabilir."}
                </small>
              </label>

              <label className="submission-panel__wide-field">
                <span>Görsel linki opsiyonel</span>
                <input
                  type="url"
                  value={nativeForm.imageUrl}
                  onChange={(event) => setNativeForm((current) => ({ ...current, imageUrl: event.target.value }))}
                  placeholder="İlan fotoğrafının bağlantısını yapıştır"
                />
              </label>

              <label className="submission-panel__wide-field">
                <span>Açıklama</span>
                <textarea
                  value={nativeForm.description}
                  onChange={(event) => setNativeForm((current) => ({ ...current, description: event.target.value }))}
                  rows={5}
                  required
                />
              </label>

              <button type="submit" className="submission-panel__primary-button" disabled={isBusy || !session}>
                <Plus size={15} />
                İlanı gönder
              </button>
            </form>
          )}

          {submittedPreview ? (
            <SubmissionImagePreview
              key={`${submittedPreview.title}-${submittedPreview.imageUrl ?? "no-image"}`}
              preview={submittedPreview}
            />
          ) : null}
        </div>
      </div>
      ) : null}

      {session ? (
        <MySubmissionsPanel
          submissions={mySubmissions}
          commentsBySubmissionId={commentsBySubmissionId}
          expandedSubmissionId={expandedSubmissionId}
          isLoading={isMySubmissionsLoading}
          commentsLoadingId={commentsLoadingId}
          onRefresh={handleRefreshMySubmissions}
          onToggleComments={handleToggleComments}
          onRemoveSubmission={handleRemoveSubmission}
        />
      ) : null}
    </section>
  );
}

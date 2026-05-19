import { Router, type Request, type Response } from "express";
import multer, { type FileFilterCallback } from "multer";
import { ENV } from "../config/env.js";
import { requireAdminUser, requireAuthenticatedUser } from "../middleware/auth-middleware.js";
import { submissionRateLimit } from "../middleware/rate-limit-middleware.js";
import { ensureLocalDevAccount, signInLocalDevAccount, type LocalDevAuthResult } from "../services/local-dev-auth-service.js";
import { listListingComments } from "../services/listing-comments-service.js";
import { analyzeSubmission } from "../services/submission-analysis-service.js";
import { ingestSubmissionLink } from "../services/submission-ingest-service.js";
import { optionalManualSubmissionImageUrl, resolveSubmissionCommentListingId } from "../services/submission-policy-service.js";
import { wakeScraperQueueProcessor } from "../services/scraper-dispatch-service.js";
import {
  addSubmissionImages,
  approveSubmission,
  createExternalLinkIngestJob,
  createLinkSubmission,
  createNativeSubmission,
  deleteSubmission,
  findSubmissionBySourceUrl,
  getSubmissionForAdmin,
  getSubmissionForOwner,
  listIngestQueue,
  listReviewQueue,
  markExternalLinkIngestJobBlocked,
  listSubmissionsForOwner,
  requeueExternalLinkIngestJob,
  rejectSubmission,
  requestSubmissionChanges,
  saveSubmissionAnalysis,
  updateSubmissionForOwner,
  updateSubmissionStatus,
} from "../services/submission-repository.js";
import { uploadSubmissionImage } from "../services/submission-storage-service.js";
import { processPendingSubmissionAnalyses } from "../services/submission-worker-service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ENV.MAX_UPLOAD_IMAGE_MB * 1024 * 1024,
    files: ENV.MAX_UPLOAD_IMAGES,
  },
  fileFilter(_req: Request, file: Express.Multer.File, callback: FileFilterCallback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Yalniz jpg, png veya webp gorseller kabul edilir."));
      return;
    }

    callback(null, true);
  },
});

function handleError(response: Response, error: unknown, fallbackMessage: string): void {
  const message = error instanceof Error ? error.message : fallbackMessage;
  let statusCode = 500;

  if (message === "SUBMISSION_NOT_FOUND") {
    statusCode = 404;
  } else if (
    message.includes("Gecersiz link") ||
    message.toLowerCase().includes("gorsel") ||
    message.includes("izin verilmiyor") ||
    message.includes("Yerel veya ozel")
  ) {
    statusCode = 400;
  } else if (message === "FORBIDDEN") {
    statusCode = 403;
  } else if (message === "DEV_AUTH_INVALID_CREDENTIALS") {
    statusCode = 401;
  } else if (message.startsWith("DEV_AUTH_")) {
    statusCode = 400;
  }

  response.status(statusCode).json({
    success: false,
    error: {
      code: "SUBMISSION_ERROR",
      message: fallbackMessage === message ? message : message || fallbackMessage,
      statusCode,
    },
  });
}

function requireActor(request: Request): NonNullable<Request["actor"]> {
  if (!request.actor) {
    throw new Error("FORBIDDEN");
  }
  return request.actor;
}

function isLocalDevelopmentRequest(request: Request): boolean {
  const host = (request.hostname || "").trim().toLowerCase();
  return process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1");
}

function createLocalSessionPayload(result: LocalDevAuthResult) {
  const expiresAtSeconds = Math.floor(new Date(result.expiresAt).getTime() / 1000);
  const expiresIn = Math.max(0, expiresAtSeconds - Math.floor(Date.now() / 1000));

  return {
    access_token: result.token,
    refresh_token: "",
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: expiresAtSeconds,
    user: {
      id: result.profile.id,
      aud: "authenticated",
      role: "authenticated",
      email: result.profile.email,
      email_confirmed_at: result.profile.createdAt,
      phone: "",
      confirmed_at: result.profile.createdAt,
      last_sign_in_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {
        display_name: result.profile.displayName,
      },
      identities: [],
      created_at: result.profile.createdAt,
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
}

export const submissionsRouter = Router();

submissionsRouter.post("/auth/dev-register", async (request: Request, response: Response) => {
  if (!isLocalDevelopmentRequest(request)) {
    response.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Endpoint bulunamadı", statusCode: 404 },
    });
    return;
  }

  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const displayName = typeof request.body?.displayName === "string" ? request.body.displayName.trim() : "";

    if (!email || !password) {
      throw new Error("E-posta ve sifre zorunlu.");
    }

    if (password.length < 8) {
      throw new Error("Sifre en az 8 karakter olmali.");
    }

    const localAccount = await ensureLocalDevAccount({
      email,
      password,
      displayName: displayName || null,
    });

    response.status(localAccount.created ? 201 : 200).json({
      success: true,
      data: {
        profile: localAccount.profile,
        created: localAccount.created,
        emailConfirmed: true,
        session: createLocalSessionPayload(localAccount),
      },
      message: localAccount.created
        ? "Yerel gelistirme hesabi olusturuldu ve dogrulandi."
        : "Yerel gelistirme hesabi guncellendi ve dogrulandi.",
    });
  } catch (error) {
    handleError(response, error, "Yerel gelistirme hesabi hazirlanamadi.");
  }
});

submissionsRouter.post("/auth/dev-login", async (request: Request, response: Response) => {
  if (!isLocalDevelopmentRequest(request)) {
    response.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Endpoint bulunamadı", statusCode: 404 },
    });
    return;
  }

  try {
    const email = typeof request.body?.email === "string" ? request.body.email.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!email || !password) {
      throw new Error("E-posta ve sifre zorunlu.");
    }

    const localAccount = await signInLocalDevAccount({ email, password });
    response.json({
      success: true,
      data: {
        profile: localAccount.profile,
        session: createLocalSessionPayload(localAccount),
      },
      message: "Yerel gelistirme oturumu hazir.",
    });
  } catch (error) {
    handleError(response, error, "Yerel gelistirme oturumu acilamadi.");
  }
});

submissionsRouter.get("/dev/ingest-link", async (request: Request, response: Response) => {
  if (!isLocalDevelopmentRequest(request)) {
    response.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Endpoint bulunamadı", statusCode: 404 },
    });
    return;
  }

  try {
    const sourceUrl = typeof request.query?.url === "string" ? request.query.url.trim() : "";
    if (!sourceUrl) {
      throw new Error("Gecersiz link");
    }

    const ingested = await ingestSubmissionLink(sourceUrl, { allowDirectFetch: true });
    response.json({ success: true, data: ingested });
  } catch (error) {
    handleError(response, error, "Link ile ilan eklenemedi.");
  }
});

submissionsRouter.get("/me", requireAuthenticatedUser, async (request: Request, response: Response) => {
  response.json({
    success: true,
    data: {
      profile: request.actor,
      authConfigured: Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY),
    },
  });
});

submissionsRouter.get("/my-submissions", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissions = await listSubmissionsForOwner(actor.id);
    response.json({ success: true, data: submissions });
  } catch (error) {
    handleError(response, error, "Ilanlarin yuklenemedi.");
  }
});

submissionsRouter.get("/my-submissions/:id", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const submission = await getSubmissionForOwner(submissionId, actor.id);
    if (!submission) {
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ilan kaydi bulunamadi.", statusCode: 404 },
      });
      return;
    }

    response.json({ success: true, data: submission });
  } catch (error) {
    handleError(response, error, "Ilan sonucu yuklenemedi.");
  }
});

submissionsRouter.delete("/my-submissions/:id", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const bundle = await getSubmissionForOwner(submissionId, actor.id);
    if (!bundle) {
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ilan kaydi bulunamadi.", statusCode: 404 },
      });
      return;
    }

    if (bundle.submission.status === "published") {
      response.status(409).json({
        success: false,
        error: {
          code: "PUBLISHED_SUBMISSION",
          message: "Yayindaki ilan icin katalogdan kaldirma akisini kullan.",
          statusCode: 409,
        },
      });
      return;
    }

    await deleteSubmission(bundle.submission.id);
    response.json({
      success: true,
      data: {
        id: bundle.submission.id,
        status: "deleted",
      },
      message: "Ilan kaydi kaldirildi.",
    });
  } catch (error) {
    handleError(response, error, "Ilan kaydi kaldirilamadi.");
  }
});

submissionsRouter.get("/my-submissions/:id/comments", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const submission = await getSubmissionForOwner(submissionId, actor.id);
    if (!submission) {
      response.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Ilan kaydi bulunamadi.", statusCode: 404 },
      });
      return;
    }

    const listingId = resolveSubmissionCommentListingId(submission);
    const comments = listingId ? await listListingComments(listingId) : [];
    response.json({
      success: true,
      data: comments,
      meta: {
        total: comments.length,
      },
    });
  } catch (error) {
    handleError(response, error, "Ilan yorumlari yuklenemedi.");
  }
});

submissionsRouter.post("/submissions/link", requireAuthenticatedUser, submissionRateLimit, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const sourceUrl = typeof request.body?.sourceUrl === "string" ? request.body.sourceUrl.trim() : "";
    if (!sourceUrl) {
      throw new Error("Gecersiz link");
    }

    const duplicate = await findSubmissionBySourceUrl(sourceUrl);
    if (duplicate) {
      response.status(409).json({
        success: false,
        error: {
          code: "DUPLICATE_URL",
          message: "Ayni dis link daha once eklenmis.",
          statusCode: 409,
        },
      });
      return;
    }

    const ingested = await ingestSubmissionLink(sourceUrl, { allowDirectFetch: true });
    const submission = await createLinkSubmission({
      ownerId: actor.id,
      ...ingested,
    });

    try {
      const ingestSourceType = (submission.sourceType === "pecid" ? "external" : submission.sourceType) as "sahibinden" | "letgo" | "dolap" | "donanimhaber" | "facebook" | "external";
      await createExternalLinkIngestJob({
        submissionId: submission.id,
        sourceType: ingestSourceType,
        sourceUrl: submission.sourceUrl ?? sourceUrl,
      });
    } catch (queueError) {
      try {
        await deleteSubmission(submission.id);
      } catch (cleanupError) {
        console.warn("[SUBMISSION] Queue olusmadi ve taslak temizlenemedi:", cleanupError);
      }
      throw queueError;
    }

    let dispatchErrorMessage: string | null = null;
    try {
      await wakeScraperQueueProcessor();
    } catch (dispatchError) {
      dispatchErrorMessage = dispatchError instanceof Error ? dispatchError.message : "SCRAPER_DISPATCH_FAILED";
      console.warn("[SUBMISSION] Scraper queue uyandirilmadi:", dispatchErrorMessage);
    }

    response.status(201).json({
      success: true,
      data: submission,
      message: dispatchErrorMessage
        ? "Link kasaya alindi. Kaynak sayfa siraya girdi; isleme otomatik devam edecek."
        : "Link kasaya alindi. Kaynak sayfa siraya girdi; veri cekildiginde ilanin analiz asamasina gececek.",
    });
  } catch (error) {
    handleError(response, error, "Link ile ilan eklenemedi.");
  }
});

submissionsRouter.post("/submissions/native", requireAuthenticatedUser, submissionRateLimit, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
    const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
    const category = typeof request.body?.category === "string" && request.body.category.trim() ? request.body.category.trim() : "gpu";
    const currency = typeof request.body?.currency === "string" && request.body.currency.trim() ? request.body.currency.trim() : "TRY";
    const location = typeof request.body?.location === "string" && request.body.location.trim() ? request.body.location.trim() : null;
    const brand = typeof request.body?.brand === "string" && request.body.brand.trim() ? request.body.brand.trim() : null;
    const model = typeof request.body?.model === "string" && request.body.model.trim() ? request.body.model.trim() : null;
    const price = Number(request.body?.price ?? 0);
    const coverImageUrl = optionalManualSubmissionImageUrl(request.body?.coverImageUrl ?? request.body?.imageUrl);

    if (!title || !description || !Number.isFinite(price) || price <= 0) {
      throw new Error("Baslik, aciklama ve gecerli fiyat zorunlu.");
    }

    const submission = await createNativeSubmission({
      ownerId: actor.id,
      title,
      description,
      brand,
      model,
      category,
      price,
      currency,
      location,
      coverImageUrl,
    });

    response.status(201).json({
      success: true,
      data: submission,
      message: "Ilan taslagi olusturuldu. Kapak gorseli eklendi.",
    });
  } catch (error) {
    handleError(response, error, "Elle ilan olusturulamadi.");
  }
});

submissionsRouter.patch("/submissions/:id", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const submission = await updateSubmissionForOwner(submissionId, actor.id, request.body ?? {});
    response.json({ success: true, data: submission });
  } catch (error) {
    handleError(response, error, "Ilan taslagi guncellenemedi.");
  }
});

submissionsRouter.post(
  "/submissions/:id/images",
  requireAuthenticatedUser,
  upload.array("images", ENV.MAX_UPLOAD_IMAGES),
  async (request: Request, response: Response) => {
    try {
      const actor = requireActor(request);
      const submissionId = String(request.params.id ?? "");
      const existing = await getSubmissionForOwner(submissionId, actor.id);
      if (!existing) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }

      const files = (request.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        throw new Error("En az bir gorsel yuklenmeli.");
      }

      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file) {
          continue;
        }
        const uploadedFile = await uploadSubmissionImage(existing.submission.id, file);
        uploaded.push({
          submissionId: existing.submission.id,
          storagePath: uploadedFile.storagePath,
          publicUrl: uploadedFile.publicUrl,
          sortOrder: existing.images.length + index,
        });
      }

      const images = await addSubmissionImages(uploaded);
      response.status(201).json({ success: true, data: images });
    } catch (error) {
      handleError(response, error, "Gorseller yuklenemedi.");
    }
  },
);

submissionsRouter.post("/submissions/:id/submit", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const bundle = await getSubmissionForOwner(submissionId, actor.id);
    if (!bundle) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }

    if (bundle.submission.submissionType === "native" && bundle.images.length === 0) {
      throw new Error("Manuel ilan icin en az bir dosya gorseli zorunlu.");
    }

    await updateSubmissionStatus(bundle.submission.id, "pending_analysis");

    let analysis = null;
    try {
      const analysisInput = await getSubmissionForOwner(bundle.submission.id, actor.id);
      if (analysisInput) {
        const analyzed = await analyzeSubmission(analysisInput);
        analysis = await saveSubmissionAnalysis(bundle.submission.id, {
          submissionId: bundle.submission.id,
          ...analyzed,
          analyzedAt: new Date().toISOString(),
        });
        await updateSubmissionStatus(bundle.submission.id, "pending_review");
      }
    } catch (inlineError) {
      console.warn("[SUBMISSION] Inline analiz hata verdi, worker kuyruguna birakiliyor:", inlineError);
      await processPendingSubmissionAnalyses();
    }

    const updated = await getSubmissionForOwner(bundle.submission.id, actor.id);
    response.json({
      success: true,
      data: {
        submission: updated?.submission ?? bundle.submission,
        analysis: updated?.analysis ?? analysis,
        nextStep: "pending_review",
      },
      message: "Ilan analiz edilmek uzere inceleme kuyruguna alindi.",
    });
  } catch (error) {
    handleError(response, error, "Ilan analize gonderilemedi.");
  }
});

submissionsRouter.post("/submissions/:id/retry-ingest", requireAuthenticatedUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const bundle = await getSubmissionForOwner(submissionId, actor.id);
    if (!bundle) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }
    if (bundle.submission.submissionType !== "link") {
      throw new Error("Sadece link ilanlari yeniden sIraya alinabilir.");
    }

    await updateSubmissionStatus(bundle.submission.id, "pending_ingest", {
      rejection_note: null,
    });
    const job = await requeueExternalLinkIngestJob(bundle.submission.id, {
      resetAttempts: true,
    });

    let dispatchErrorMessage: string | null = null;
    try {
      await wakeScraperQueueProcessor();
    } catch (dispatchError) {
      dispatchErrorMessage = dispatchError instanceof Error ? dispatchError.message : "SCRAPER_DISPATCH_FAILED";
      console.warn("[SUBMISSION] Retry scraper queue uyandirilmadi:", dispatchErrorMessage);
    }

    const updated = await getSubmissionForOwner(bundle.submission.id, actor.id);
    response.json({
      success: true,
      data: {
        submission: updated?.submission ?? bundle.submission,
        ingestJob: updated?.ingestJob ?? job,
      },
      message: dispatchErrorMessage
        ? "Kaynak ilan yeniden siraya alindi. Isleme periyodik queue calismasi devam edecek."
        : "Kaynak ilan yeniden siraya alindi ve scraper uyandirildi.",
    });
  } catch (error) {
    handleError(response, error, "Kaynak link yeniden siraya alinamadi.");
  }
});

submissionsRouter.get("/admin/review-queue", requireAdminUser, async (_request: Request, response: Response) => {
  try {
    const queue = await listReviewQueue();
    response.json({ success: true, data: queue });
  } catch (error) {
    handleError(response, error, "Inceleme kuyrugu yuklenemedi.");
  }
});

submissionsRouter.get("/admin/ingest-queue", requireAdminUser, async (_request: Request, response: Response) => {
  try {
    const queue = await listIngestQueue();
    response.json({ success: true, data: queue });
  } catch (error) {
    handleError(response, error, "Kaynak kuyrugu yuklenemedi.");
  }
});

submissionsRouter.get("/admin/review-queue/:id", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const submissionId = String(request.params.id ?? "");
    const submission = await getSubmissionForAdmin(submissionId);
    if (!submission) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }

    response.json({ success: true, data: submission });
  } catch (error) {
    handleError(response, error, "Inceleme kaydi bulunamadi.");
  }
});

submissionsRouter.post("/admin/submissions/:id/approve", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const submissionId = String(request.params.id ?? "");
    const published = await approveSubmission(submissionId, actor.id);
    response.json({ success: true, data: published });
  } catch (error) {
    handleError(response, error, "Ilan yayinlanamadi.");
  }
});

submissionsRouter.post("/admin/submissions/:id/reject", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const note = typeof request.body?.note === "string" ? request.body.note.trim() : "Reddedildi";
    const submissionId = String(request.params.id ?? "");
    const submission = await rejectSubmission(submissionId, actor.id, note);
    response.json({ success: true, data: submission });
  } catch (error) {
    handleError(response, error, "Ilan reddedilemedi.");
  }
});

submissionsRouter.post("/admin/submissions/:id/request-changes", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const actor = requireActor(request);
    const note = typeof request.body?.note === "string" ? request.body.note.trim() : "Duzenleme istendi";
    const submissionId = String(request.params.id ?? "");
    const submission = await requestSubmissionChanges(submissionId, actor.id, note);
    response.json({ success: true, data: submission });
  } catch (error) {
    handleError(response, error, "Duzenleme talebi gonderilemedi.");
  }
});

submissionsRouter.post("/admin/submissions/:id/requeue-ingest", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const submissionId = String(request.params.id ?? "");
    const bundle = await getSubmissionForAdmin(submissionId);
    if (!bundle) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }
    if (bundle.submission.submissionType !== "link") {
      throw new Error("Sadece link ilanlari yeniden siraya alinabilir.");
    }

    await updateSubmissionStatus(bundle.submission.id, "pending_ingest", {
      rejection_note: null,
    });
    const job = await requeueExternalLinkIngestJob(bundle.submission.id, {
      resetAttempts: true,
    });

    let dispatchErrorMessage: string | null = null;
    try {
      await wakeScraperQueueProcessor();
    } catch (dispatchError) {
      dispatchErrorMessage = dispatchError instanceof Error ? dispatchError.message : "SCRAPER_DISPATCH_FAILED";
      console.warn("[SUBMISSION] Admin requeue scraper queue uyandirilmadi:", dispatchErrorMessage);
    }

    const updated = await getSubmissionForAdmin(bundle.submission.id);
    response.json({
      success: true,
      data: {
        submission: updated?.submission ?? bundle.submission,
        ingestJob: updated?.ingestJob ?? job,
      },
      message: dispatchErrorMessage
        ? "Kaynak ilan yeniden siraya alindi. Isleme periyodik queue calismasi devam edecek."
        : "Kaynak ilan yeniden siraya alindi ve scraper uyandirildi.",
    });
  } catch (error) {
    handleError(response, error, "Kaynak link yeniden siraya alinamadi.");
  }
});

submissionsRouter.post("/admin/submissions/:id/block-ingest", requireAdminUser, async (request: Request, response: Response) => {
  try {
    const submissionId = String(request.params.id ?? "");
    const note = typeof request.body?.note === "string" ? request.body.note.trim() : "Kaynak bloklu olarak isaretlendi.";
    const bundle = await getSubmissionForAdmin(submissionId);
    if (!bundle) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }
    if (bundle.submission.submissionType !== "link") {
      throw new Error("Sadece link ilanlari block durumuna alinabilir.");
    }

    const job = await markExternalLinkIngestJobBlocked(bundle.submission.id, note);
    const submission = await updateSubmissionStatus(bundle.submission.id, "ingest_failed", {
      rejection_note: note,
    });

    response.json({
      success: true,
      data: {
        submission,
        ingestJob: job,
      },
      message: "Kaynak link blocked olarak isaretlendi.",
    });
  } catch (error) {
    handleError(response, error, "Kaynak link blocked olarak isaretlenemedi.");
  }
});

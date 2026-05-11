import type { CatalogListing } from "./dashboard-types.js";
import { ENV, isSupabaseConfigured } from "../config/env.js";
import { isLocalDevUserId } from "./local-dev-auth-service.js";
import { getLocalSubmissionStore, isLocalPublishedListingId, isLocalSubmissionId } from "./local-submission-store.js";
import { getSupabaseAdmin, mapProfileRow } from "./supabase-service.js";
import type {
  CreateExternalLinkIngestJobInput,
  CreateLinkSubmissionInput,
  CreateNativeSubmissionInput,
  CreateSubmissionImageInput,
  ExternalLinkIngestJobRecord,
  PublishedListingRecord,
  SubmissionAnalysisRecord,
  SubmissionImage,
  SubmissionProfile,
  SubmissionRecord,
  SubmissionStatus,
  SubmissionWithAnalysis,
} from "./submission-types.js";
import { detectSourceLabel } from "./submission-utils.js";

function shouldFallbackToLocalStore(error: unknown): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "SUPABASE_NOT_CONFIGURED" ||
    message.includes("fetch failed") ||
    message.includes("getaddrinfo") ||
    message.includes("ENOTFOUND") ||
    message.includes("Failed to fetch") ||
    message.startsWith("[ENV]")
  );
}

async function supabaseOrLocal<T>(supabaseAction: () => Promise<T>, localAction: () => Promise<T>): Promise<T> {
  try {
    return await supabaseAction();
  } catch (error) {
    if (shouldFallbackToLocalStore(error)) {
      console.warn("[SUBMISSION] Supabase erisilemedi, yerel gelistirme deposu kullaniliyor:", error);
      return localAction();
    }

    throw error;
  }
}

function localStore() {
  return getLocalSubmissionStore();
}

function mapSubmission(row: Record<string, unknown>): SubmissionRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    submissionType: String(row.submission_type) as SubmissionRecord["submissionType"],
    sourceType: String(row.source_type) as SubmissionRecord["sourceType"],
    sourceUrl: row.source_url ? String(row.source_url) : null,
    status: String(row.status) as SubmissionStatus,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    brand: row.brand ? String(row.brand) : null,
    model: row.model ? String(row.model) : null,
    category: String(row.category ?? "tech"),
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "TRY"),
    location: row.location ? String(row.location) : null,
    coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : null,
    publishedListingId: row.published_listing_id ? String(row.published_listing_id) : null,
    rejectionNote: row.rejection_note ? String(row.rejection_note) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapSubmissionImage(row: Record<string, unknown>): SubmissionImage {
  return {
    id: String(row.id),
    submissionId: String(row.submission_id),
    storagePath: String(row.storage_path ?? ""),
    publicUrl: row.public_url ? String(row.public_url) : null,
    sortOrder: Number(row.sort_order ?? 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapIngestJob(row: Record<string, unknown>): ExternalLinkIngestJobRecord {
  return {
    id: String(row.id),
    submissionId: String(row.submission_id),
    sourceType: String(row.source_type) as ExternalLinkIngestJobRecord["sourceType"],
    sourceUrl: String(row.source_url ?? ""),
    status: String(row.status) as ExternalLinkIngestJobRecord["status"],
    attemptCount: Number(row.attempt_count ?? 0),
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : null,
    maxAttempts: Number(row.max_attempts ?? 3),
    lastError: row.last_error ? String(row.last_error) : null,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    lastTransitionAt: row.last_transition_at ? String(row.last_transition_at) : null,
    scrapedPayload:
      row.scraped_payload && typeof row.scraped_payload === "object"
        ? (row.scraped_payload as Record<string, unknown>)
        : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapSubmissionAnalysis(row: Record<string, unknown>): SubmissionAnalysisRecord {
  return {
    submissionId: String(row.submission_id),
    detectedModel: row.detected_model ? String(row.detected_model) : null,
    detectedBrand: row.detected_brand ? String(row.detected_brand) : null,
    fairPrice: row.fair_price == null ? null : Number(row.fair_price),
    marketLow: row.market_low == null ? null : Number(row.market_low),
    marketHigh: row.market_high == null ? null : Number(row.market_high),
    priceRatio: row.price_ratio == null ? null : Number(row.price_ratio),
    confidencePercent: Number(row.confidence_percent ?? 0),
    verdict: String(row.verdict) as SubmissionAnalysisRecord["verdict"],
    summaryNote: String(row.summary_note ?? ""),
    riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags.map((value) => String(value)) as SubmissionAnalysisRecord["riskFlags"] : [],
    analyzedAt: String(row.analyzed_at ?? new Date().toISOString()),
    analyzerVersion: String(row.analyzer_version ?? "submission-v1"),
  };
}

function mapPublishedListing(row: Record<string, unknown>): PublishedListingRecord {
  return {
    id: String(row.id),
    sourceType: String(row.source_type) as PublishedListingRecord["sourceType"],
    ownerId: row.owner_id ? String(row.owner_id) : null,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    brand: row.brand ? String(row.brand) : null,
    model: row.model ? String(row.model) : null,
    category: String(row.category ?? "tech"),
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "TRY"),
    location: row.location ? String(row.location) : null,
    imageCoverUrl: row.image_cover_url ? String(row.image_cover_url) : null,
    externalUrl: row.external_url ? String(row.external_url) : null,
    sourceLabel: String(row.source_label ?? detectSourceLabel(String(row.source_type) as PublishedListingRecord["sourceType"])),
    publishedAt: String(row.published_at ?? new Date().toISOString()),
    status: String(row.status ?? "published"),
  };
}

async function loadSubmissionBundle(submissionId: string): Promise<SubmissionWithAnalysis | null> {
  const client = getSupabaseAdmin();
  const [{ data: submissionRow }, { data: imageRows }, { data: analysisRow }, { data: ownerRows }, { data: ingestJobRow }] = await Promise.all([
    client.from("listing_submissions").select("*").eq("id", submissionId).maybeSingle(),
    client.from("listing_submission_images").select("*").eq("submission_id", submissionId).order("sort_order", { ascending: true }),
    client.from("listing_submission_analysis").select("*").eq("submission_id", submissionId).maybeSingle(),
    client
      .from("profiles")
      .select("*")
      .eq(
        "id",
        (
          await client.from("listing_submissions").select("owner_id").eq("id", submissionId).maybeSingle()
        ).data?.owner_id ?? "",
      ),
    client.from("external_link_ingest_jobs").select("*").eq("submission_id", submissionId).maybeSingle(),
  ]);

  if (!submissionRow) {
    return null;
  }

  return {
    submission: mapSubmission(submissionRow as Record<string, unknown>),
    images: (imageRows ?? []).map((row) => mapSubmissionImage(row as Record<string, unknown>)),
    analysis: analysisRow ? mapSubmissionAnalysis(analysisRow as Record<string, unknown>) : null,
    ownerProfile: ownerRows?.[0] ? mapProfileRow(ownerRows[0] as Record<string, unknown>) : null,
    ingestJob: ingestJobRow ? mapIngestJob(ingestJobRow as Record<string, unknown>) : null,
  };
}

export async function upsertProfile(input: {
  id: string;
  email: string;
  displayName: string | null;
}): Promise<SubmissionProfile> {
  if (isLocalDevUserId(input.id)) {
    return localStore().upsertProfile(input);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("profiles")
        .upsert(
          {
            id: input.id,
            email: input.email,
            display_name: input.displayName,
          },
          { onConflict: "id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`PROFILE_UPSERT_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapProfileRow(data as Record<string, unknown>);
    },
    () => localStore().upsertProfile(input),
  );
}

export async function getProfileById(id: string): Promise<SubmissionProfile | null> {
  if (isLocalDevUserId(id)) {
    return localStore().getProfileById(id);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) {
        throw new Error(`PROFILE_FETCH_FAILED:${error.message}`);
      }
      return data ? mapProfileRow(data as Record<string, unknown>) : null;
    },
    () => localStore().getProfileById(id),
  );
}

export async function findSubmissionBySourceUrl(sourceUrl: string): Promise<SubmissionRecord | null> {
  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client.from("listing_submissions").select("*").eq("source_url", sourceUrl).maybeSingle();
      if (error) {
        throw new Error(`SUBMISSION_LOOKUP_FAILED:${error.message}`);
      }
      return data ? mapSubmission(data as Record<string, unknown>) : null;
    },
    () => localStore().findSubmissionBySourceUrl(sourceUrl),
  );
}

export async function createLinkSubmission(input: CreateLinkSubmissionInput): Promise<SubmissionRecord> {
  if (isLocalDevUserId(input.ownerId)) {
    return localStore().createLinkSubmission(input);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .insert({
          owner_id: input.ownerId,
          submission_type: "link",
          source_type: input.sourceType,
          source_url: input.sourceUrl,
          status: "pending_ingest",
          title: input.title,
          description: input.description,
          brand: input.brand,
          model: input.model,
          category: input.category,
          price: input.price,
          currency: input.currency,
          location: input.location,
          cover_image_url: input.coverImageUrl,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`SUBMISSION_CREATE_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapSubmission(data as Record<string, unknown>);
    },
    () => localStore().createLinkSubmission(input),
  );
}

export async function createExternalLinkIngestJob(input: CreateExternalLinkIngestJobInput): Promise<ExternalLinkIngestJobRecord> {
  if (isLocalSubmissionId(input.submissionId)) {
    return localStore().createExternalLinkIngestJob(input);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("external_link_ingest_jobs")
        .insert({
          submission_id: input.submissionId,
          source_type: input.sourceType,
          source_url: input.sourceUrl,
          status: "queued",
          next_attempt_at: new Date().toISOString(),
          max_attempts: 3,
          last_transition_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`INGEST_JOB_CREATE_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapIngestJob(data as Record<string, unknown>);
    },
    () => localStore().createExternalLinkIngestJob(input),
  );
}

export async function listIngestQueue(): Promise<SubmissionWithAnalysis[]> {
  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("external_link_ingest_jobs")
        .select("submission_id")
        .in("status", ["queued", "processing", "failed", "blocked"])
        .order("updated_at", { ascending: true });

      if (error) {
        throw new Error(`INGEST_QUEUE_FETCH_FAILED:${error.message}`);
      }

      const submissionIds = Array.from(
        new Set((data ?? []).map((row) => String((row as Record<string, unknown>).submission_id ?? "")).filter(Boolean)),
      );

      const bundles = await Promise.all(submissionIds.map((submissionId) => loadSubmissionBundle(submissionId)));
      return bundles.filter(Boolean) as SubmissionWithAnalysis[];
    },
    () => localStore().listIngestQueue(),
  );
}

export async function requeueExternalLinkIngestJob(
  submissionId: string,
  options?: { resetAttempts?: boolean; clearCompletedAt?: boolean },
): Promise<ExternalLinkIngestJobRecord> {
  if (isLocalSubmissionId(submissionId)) {
    return localStore().requeueExternalLinkIngestJob(submissionId, options);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("external_link_ingest_jobs")
        .update({
          status: "queued",
          next_attempt_at: new Date().toISOString(),
          attempt_count: options?.resetAttempts ? 0 : undefined,
          last_error: null,
          claimed_at: null,
          completed_at: options?.clearCompletedAt === false ? undefined : null,
          last_transition_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`INGEST_JOB_REQUEUE_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapIngestJob(data as Record<string, unknown>);
    },
    () => localStore().requeueExternalLinkIngestJob(submissionId, options),
  );
}

export async function markExternalLinkIngestJobBlocked(
  submissionId: string,
  note: string | null,
): Promise<ExternalLinkIngestJobRecord> {
  if (isLocalSubmissionId(submissionId)) {
    return localStore().markExternalLinkIngestJobBlocked(submissionId, note);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("external_link_ingest_jobs")
        .update({
          status: "blocked",
          last_error: note,
          completed_at: new Date().toISOString(),
          last_transition_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`INGEST_JOB_BLOCK_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapIngestJob(data as Record<string, unknown>);
    },
    () => localStore().markExternalLinkIngestJobBlocked(submissionId, note),
  );
}

export async function createNativeSubmission(input: CreateNativeSubmissionInput): Promise<SubmissionRecord> {
  if (isLocalDevUserId(input.ownerId)) {
    return localStore().createNativeSubmission(input);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .insert({
          owner_id: input.ownerId,
          submission_type: "native",
          source_type: "pecid",
          status: "draft",
          title: input.title,
          description: input.description,
          brand: input.brand,
          model: input.model,
          category: input.category,
          price: input.price,
          currency: input.currency,
          location: input.location,
          cover_image_url: input.coverImageUrl,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`SUBMISSION_CREATE_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapSubmission(data as Record<string, unknown>);
    },
    () => localStore().createNativeSubmission(input),
  );
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  if (isLocalSubmissionId(submissionId)) {
    await localStore().deleteSubmission(submissionId);
    return;
  }

  await supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { error } = await client.from("listing_submissions").delete().eq("id", submissionId);
      if (error) {
        throw new Error(`SUBMISSION_DELETE_FAILED:${error.message}`);
      }
    },
    () => localStore().deleteSubmission(submissionId),
  );
}

export async function updateSubmissionForOwner(
  submissionId: string,
  ownerId: string,
  patch: Partial<Pick<SubmissionRecord, "title" | "description" | "brand" | "model" | "category" | "price" | "currency" | "location">>,
): Promise<SubmissionRecord> {
  if (isLocalSubmissionId(submissionId) || isLocalDevUserId(ownerId)) {
    return localStore().updateSubmissionForOwner(submissionId, ownerId, patch);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .update({
          title: patch.title,
          description: patch.description,
          brand: patch.brand,
          model: patch.model,
          category: patch.category,
          price: patch.price,
          currency: patch.currency,
          location: patch.location,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`SUBMISSION_UPDATE_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapSubmission(data as Record<string, unknown>);
    },
    () => localStore().updateSubmissionForOwner(submissionId, ownerId, patch),
  );
}

export async function listSubmissionsForOwner(ownerId: string): Promise<SubmissionWithAnalysis[]> {
  if (isLocalDevUserId(ownerId)) {
    return localStore().listSubmissionsForOwner(ownerId);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`SUBMISSIONS_FETCH_FAILED:${error.message}`);
      }

      const bundles = await Promise.all((data ?? []).map((row) => loadSubmissionBundle(String((row as Record<string, unknown>).id))));
      return bundles.filter(Boolean) as SubmissionWithAnalysis[];
    },
    () => localStore().listSubmissionsForOwner(ownerId),
  );
}

export async function getSubmissionForOwner(submissionId: string, ownerId: string): Promise<SubmissionWithAnalysis | null> {
  if (isLocalSubmissionId(submissionId) || isLocalDevUserId(ownerId)) {
    return localStore().getSubmissionForOwner(submissionId, ownerId);
  }

  return supabaseOrLocal(
    async () => {
      const bundle = await loadSubmissionBundle(submissionId);
      if (!bundle || bundle.submission.ownerId !== ownerId) {
        return null;
      }
      return bundle;
    },
    () => localStore().getSubmissionForOwner(submissionId, ownerId),
  );
}

export async function getSubmissionForAdmin(submissionId: string): Promise<SubmissionWithAnalysis | null> {
  if (isLocalSubmissionId(submissionId)) {
    return localStore().getSubmissionForAdmin(submissionId);
  }

  return supabaseOrLocal(
    () => loadSubmissionBundle(submissionId),
    () => localStore().getSubmissionForAdmin(submissionId),
  );
}

export async function addSubmissionImages(images: CreateSubmissionImageInput[]): Promise<SubmissionImage[]> {
  if (images.length === 0) {
    return [];
  }

  if (images.some((image) => isLocalSubmissionId(image.submissionId))) {
    return localStore().addSubmissionImages(images);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submission_images")
        .insert(
          images.map((image) => ({
            submission_id: image.submissionId,
            storage_path: image.storagePath,
            public_url: image.publicUrl,
            sort_order: image.sortOrder,
            width: image.width ?? null,
            height: image.height ?? null,
          })),
        )
        .select("*");

      if (error) {
        throw new Error(`SUBMISSION_IMAGES_FAILED:${error.message}`);
      }

      return (data ?? []).map((row) => mapSubmissionImage(row as Record<string, unknown>));
    },
    () => localStore().addSubmissionImages(images),
  );
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: SubmissionStatus,
  extraPatch?: Record<string, unknown>,
): Promise<SubmissionRecord> {
  if (isLocalSubmissionId(submissionId)) {
    return localStore().updateSubmissionStatus(submissionId, status, extraPatch);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...extraPatch,
        })
        .eq("id", submissionId)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`SUBMISSION_STATUS_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapSubmission(data as Record<string, unknown>);
    },
    () => localStore().updateSubmissionStatus(submissionId, status, extraPatch),
  );
}

export async function saveSubmissionAnalysis(
  submissionId: string,
  analysis: SubmissionAnalysisRecord,
): Promise<SubmissionAnalysisRecord> {
  if (isLocalSubmissionId(submissionId)) {
    return localStore().saveSubmissionAnalysis(submissionId, analysis);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submission_analysis")
        .upsert(
          {
            submission_id: submissionId,
            detected_model: analysis.detectedModel,
            detected_brand: analysis.detectedBrand,
            fair_price: analysis.fairPrice,
            market_low: analysis.marketLow,
            market_high: analysis.marketHigh,
            price_ratio: analysis.priceRatio,
            confidence_percent: analysis.confidencePercent,
            verdict: analysis.verdict,
            summary_note: analysis.summaryNote,
            risk_flags: analysis.riskFlags,
            analyzed_at: analysis.analyzedAt,
            analyzer_version: analysis.analyzerVersion,
          },
          { onConflict: "submission_id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`SUBMISSION_ANALYSIS_FAILED:${error?.message ?? "unknown"}`);
      }

      return mapSubmissionAnalysis(data as Record<string, unknown>);
    },
    () => localStore().saveSubmissionAnalysis(submissionId, analysis),
  );
}

export async function logModerationEvent(input: {
  submissionId: string;
  actorId: string;
  action: string;
  note?: string | null;
}): Promise<void> {
  if (isLocalSubmissionId(input.submissionId) || isLocalDevUserId(input.actorId)) {
    await localStore().logModerationEvent(input);
    return;
  }

  await supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { error } = await client.from("moderation_events").insert({
        submission_id: input.submissionId,
        actor_id: input.actorId,
        action: input.action,
        note: input.note ?? null,
      });

      if (error) {
        throw new Error(`MODERATION_LOG_FAILED:${error.message}`);
      }
    },
    () => localStore().logModerationEvent(input),
  );
}

export async function listPendingAnalysis(limit = 12): Promise<SubmissionWithAnalysis[]> {
  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .select("*")
        .eq("status", "pending_analysis")
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`PENDING_ANALYSIS_FETCH_FAILED:${error.message}`);
      }

      const bundles = await Promise.all((data ?? []).map((row) => loadSubmissionBundle(String((row as Record<string, unknown>).id))));
      return bundles.filter(Boolean) as SubmissionWithAnalysis[];
    },
    () => localStore().listPendingAnalysis(limit),
  );
}

export async function listReviewQueue(): Promise<SubmissionWithAnalysis[]> {
  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("listing_submissions")
        .select("*")
        .eq("status", "pending_review")
        .order("updated_at", { ascending: true });

      if (error) {
        throw new Error(`REVIEW_QUEUE_FAILED:${error.message}`);
      }

      const bundles = await Promise.all((data ?? []).map((row) => loadSubmissionBundle(String((row as Record<string, unknown>).id))));
      return bundles.filter(Boolean) as SubmissionWithAnalysis[];
    },
    () => localStore().listReviewQueue(),
  );
}

export async function approveSubmission(
  submissionId: string,
  actorId: string,
): Promise<PublishedListingRecord> {
  if (isLocalSubmissionId(submissionId) || isLocalDevUserId(actorId)) {
    return localStore().approveSubmission(submissionId, actorId);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const bundle = await loadSubmissionBundle(submissionId);
      if (!bundle) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }

      const publishedImage = bundle.images[0]?.publicUrl ?? bundle.submission.coverImageUrl ?? null;
      const { data, error } = await client
        .from("published_listings")
        .insert({
          source_type: bundle.submission.sourceType,
          owner_id: bundle.submission.ownerId,
          title: bundle.submission.title,
          description: bundle.submission.description,
          brand: bundle.submission.brand,
          model: bundle.submission.model,
          category: bundle.submission.category,
          price: bundle.submission.price,
          currency: bundle.submission.currency,
          location: bundle.submission.location,
          image_cover_url: publishedImage,
          external_url: bundle.submission.sourceType === "pecid" ? null : bundle.submission.sourceUrl,
          source_label: detectSourceLabel(bundle.submission.sourceType),
          status: "published",
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(`PUBLISH_FAILED:${error?.message ?? "unknown"}`);
      }

      await updateSubmissionStatus(bundle.submission.id, "published", {
        published_listing_id: (data as Record<string, unknown>).id,
        rejection_note: null,
      });
      await logModerationEvent({ submissionId, actorId, action: "approved" });

      return mapPublishedListing(data as Record<string, unknown>);
    },
    () => localStore().approveSubmission(submissionId, actorId),
  );
}

export async function rejectSubmission(submissionId: string, actorId: string, note: string): Promise<SubmissionRecord> {
  if (isLocalSubmissionId(submissionId) || isLocalDevUserId(actorId)) {
    return localStore().rejectSubmission(submissionId, actorId, note);
  }

  const submission = await updateSubmissionStatus(submissionId, "rejected", {
    rejection_note: note,
  });
  await logModerationEvent({ submissionId, actorId, action: "rejected", note });
  return submission;
}

export async function requestSubmissionChanges(submissionId: string, actorId: string, note: string): Promise<SubmissionRecord> {
  if (isLocalSubmissionId(submissionId) || isLocalDevUserId(actorId)) {
    return localStore().requestSubmissionChanges(submissionId, actorId, note);
  }

  const submission = await updateSubmissionStatus(submissionId, "draft", {
    rejection_note: note,
  });
  await logModerationEvent({ submissionId, actorId, action: "changes_requested", note });
  return submission;
}

export async function listPublicPublishedCatalogListings(): Promise<CatalogListing[]> {
  const toCatalogListing = (published: PublishedListingRecord): CatalogListing => ({
    id: published.id,
    title: published.title,
    model: published.model ?? published.title,
    brand: (published.brand ?? "Bilinmiyor") as CatalogListing["brand"],
    price: published.price,
    priceText: `${published.price.toLocaleString("tr-TR")} ${published.currency === "TRY" ? "TL" : published.currency}`,
    url: published.externalUrl ?? `#ilan/${published.id}`,
    imageUrl: published.imageCoverUrl,
    location: published.location ?? "PECID",
    segment: "PECID",
    listedAtLabel: new Date(published.publishedAt).toLocaleDateString("tr-TR"),
    source: published.sourceLabel as CatalogListing["source"],
    sourceType: published.sourceType,
    isInternal: published.sourceType === "pecid",
  });

  const localListings = await localStore().listPublicPublishedListings();

  if (!isSupabaseConfigured()) {
    return localListings.map(toCatalogListing);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("published_listings")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) {
        throw new Error(`PUBLISHED_LISTINGS_FAILED:${error.message}`);
      }

      const remoteListings = (data ?? []).map((row) => mapPublishedListing(row as Record<string, unknown>));
      return [...localListings, ...remoteListings].map(toCatalogListing);
    },
    async () => localListings.map(toCatalogListing),
  );
}

export async function createSubmissionImagePublicUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const client = getSupabaseAdmin();
  const { data } = client.storage.from(ENV.SUPABASE_STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

export async function getPublishedListingById(listingId: string): Promise<PublishedListingRecord | null> {
  if (isLocalPublishedListingId(listingId)) {
    return localStore().getPublishedListingById(listingId);
  }

  if (!isSupabaseConfigured()) {
    return localStore().getPublishedListingById(listingId);
  }

  return supabaseOrLocal(
    async () => {
      const client = getSupabaseAdmin();
      const { data, error } = await client
        .from("published_listings")
        .select("*")
        .eq("id", listingId)
        .eq("status", "published")
        .maybeSingle();

      if (error) {
        throw new Error(`PUBLISHED_LISTING_FETCH_FAILED:${error.message}`);
      }

      return data ? mapPublishedListing(data as Record<string, unknown>) : null;
    },
    () => localStore().getPublishedListingById(listingId),
  );
}

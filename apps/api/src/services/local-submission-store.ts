import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

const LOCAL_SUBMISSION_PREFIX = "dev-sub-";
const LOCAL_IMAGE_PREFIX = "dev-img-";
const LOCAL_INGEST_PREFIX = "dev-job-";
const LOCAL_PUBLISHED_PREFIX = "dev-pub-";

interface LocalModerationEvent {
  id: string;
  submissionId: string;
  actorId: string;
  action: string;
  note: string | null;
  createdAt: string;
}

interface LocalSubmissionData {
  profiles: SubmissionProfile[];
  submissions: SubmissionRecord[];
  images: SubmissionImage[];
  analyses: SubmissionAnalysisRecord[];
  ingestJobs: ExternalLinkIngestJobRecord[];
  publishedListings: PublishedListingRecord[];
  moderationEvents: LocalModerationEvent[];
}

function getDefaultStorePath(): string {
  return path.resolve(process.cwd(), ".local-dev/submissions.json");
}

function emptyData(): LocalSubmissionData {
  return {
    profiles: [],
    submissions: [],
    images: [],
    analyses: [],
    ingestJobs: [],
    publishedListings: [],
    moderationEvents: [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortNewestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function bundleFor(data: LocalSubmissionData, submissionId: string): SubmissionWithAnalysis | null {
  const submission = data.submissions.find((candidate) => candidate.id === submissionId);
  if (!submission) {
    return null;
  }

  return {
    submission: clone(submission),
    images: data.images
      .filter((image) => image.submissionId === submissionId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => clone(image)),
    analysis: clone(data.analyses.find((analysis) => analysis.submissionId === submissionId) ?? null),
    ownerProfile: clone(data.profiles.find((profile) => profile.id === submission.ownerId) ?? null),
    ingestJob: clone(data.ingestJobs.find((job) => job.submissionId === submissionId) ?? null),
  };
}

async function readData(storePath: string): Promise<LocalSubmissionData> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalSubmissionData>;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
      ingestJobs: Array.isArray(parsed.ingestJobs) ? parsed.ingestJobs : [],
      publishedListings: Array.isArray(parsed.publishedListings) ? parsed.publishedListings : [],
      moderationEvents: Array.isArray(parsed.moderationEvents) ? parsed.moderationEvents : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyData();
    }
    throw error;
  }
}

async function writeData(storePath: string, data: LocalSubmissionData): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function isLocalSubmissionId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LOCAL_SUBMISSION_PREFIX);
}

export function isLocalPublishedListingId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(LOCAL_PUBLISHED_PREFIX);
}

export function createLocalSubmissionStore(storePath = getDefaultStorePath()) {
  return {
    async upsertProfile(input: { id: string; email: string; displayName: string | null }): Promise<SubmissionProfile> {
      const data = await readData(storePath);
      const existingIndex = data.profiles.findIndex((profile) => profile.id === input.id);
      const existing = existingIndex >= 0 ? data.profiles[existingIndex] : null;
      const profile: SubmissionProfile = {
        id: input.id,
        email: input.email,
        displayName: input.displayName,
        role: existing?.role ?? "user",
        createdAt: existing?.createdAt ?? nowIso(),
      };

      if (existingIndex >= 0) {
        data.profiles[existingIndex] = profile;
      } else {
        data.profiles.push(profile);
      }
      await writeData(storePath, data);
      return clone(profile);
    },

    async getProfileById(id: string): Promise<SubmissionProfile | null> {
      const data = await readData(storePath);
      return clone(data.profiles.find((profile) => profile.id === id) ?? null);
    },

    async findSubmissionBySourceUrl(sourceUrl: string): Promise<SubmissionRecord | null> {
      const data = await readData(storePath);
      return clone(data.submissions.find((submission) => submission.sourceUrl === sourceUrl) ?? null);
    },

    async createLinkSubmission(input: CreateLinkSubmissionInput): Promise<SubmissionRecord> {
      const data = await readData(storePath);
      const createdAt = nowIso();
      const submission: SubmissionRecord = {
        id: `${LOCAL_SUBMISSION_PREFIX}${randomUUID()}`,
        ownerId: input.ownerId,
        submissionType: "link",
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        status: "pending_ingest",
        title: input.title,
        description: input.description,
        brand: input.brand,
        model: input.model,
        category: input.category,
        price: input.price,
        currency: input.currency,
        location: input.location,
        coverImageUrl: input.coverImageUrl,
        publishedListingId: null,
        rejectionNote: null,
        createdAt,
        updatedAt: createdAt,
      };

      data.submissions.push(submission);
      await writeData(storePath, data);
      return clone(submission);
    },

    async createExternalLinkIngestJob(input: CreateExternalLinkIngestJobInput): Promise<ExternalLinkIngestJobRecord> {
      const data = await readData(storePath);
      const createdAt = nowIso();
      const job: ExternalLinkIngestJobRecord = {
        id: `${LOCAL_INGEST_PREFIX}${randomUUID()}`,
        submissionId: input.submissionId,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        status: "queued",
        attemptCount: 0,
        nextAttemptAt: createdAt,
        maxAttempts: 3,
        lastError: null,
        claimedAt: null,
        completedAt: null,
        lastTransitionAt: createdAt,
        scrapedPayload: null,
        createdAt,
        updatedAt: createdAt,
      };

      data.ingestJobs.push(job);
      await writeData(storePath, data);
      return clone(job);
    },

    async listIngestQueue(): Promise<SubmissionWithAnalysis[]> {
      const data = await readData(storePath);
      return data.ingestJobs
        .filter((job) => ["queued", "processing", "failed", "blocked"].includes(job.status))
        .map((job) => bundleFor(data, job.submissionId))
        .filter((bundle): bundle is SubmissionWithAnalysis => Boolean(bundle));
    },

    async requeueExternalLinkIngestJob(
      submissionId: string,
      options?: { resetAttempts?: boolean; clearCompletedAt?: boolean },
    ): Promise<ExternalLinkIngestJobRecord> {
      const data = await readData(storePath);
      const index = data.ingestJobs.findIndex((job) => job.submissionId === submissionId);
      if (index < 0) {
        throw new Error("INGEST_JOB_NOT_FOUND");
      }

      const existing = data.ingestJobs[index];
      if (!existing) {
        throw new Error("INGEST_JOB_NOT_FOUND");
      }
      const updated: ExternalLinkIngestJobRecord = {
        ...existing,
        status: "queued",
        nextAttemptAt: nowIso(),
        attemptCount: options?.resetAttempts ? 0 : existing.attemptCount,
        lastError: null,
        claimedAt: null,
        completedAt: options?.clearCompletedAt === false ? existing.completedAt : null,
        lastTransitionAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.ingestJobs[index] = updated;
      await writeData(storePath, data);
      return clone(updated);
    },

    async markExternalLinkIngestJobBlocked(submissionId: string, note: string | null): Promise<ExternalLinkIngestJobRecord> {
      const data = await readData(storePath);
      const index = data.ingestJobs.findIndex((job) => job.submissionId === submissionId);
      if (index < 0) {
        throw new Error("INGEST_JOB_NOT_FOUND");
      }

      const existing = data.ingestJobs[index];
      if (!existing) {
        throw new Error("INGEST_JOB_NOT_FOUND");
      }
      const updated: ExternalLinkIngestJobRecord = {
        ...existing,
        status: "blocked",
        lastError: note,
        completedAt: nowIso(),
        lastTransitionAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.ingestJobs[index] = updated;
      await writeData(storePath, data);
      return clone(updated);
    },

    async createNativeSubmission(input: CreateNativeSubmissionInput): Promise<SubmissionRecord> {
      const data = await readData(storePath);
      const createdAt = nowIso();
      const submission: SubmissionRecord = {
        id: `${LOCAL_SUBMISSION_PREFIX}${randomUUID()}`,
        ownerId: input.ownerId,
        submissionType: "native",
        sourceType: "pecid",
        sourceUrl: null,
        status: "draft",
        title: input.title,
        description: input.description,
        brand: input.brand,
        model: input.model,
        category: input.category,
        price: input.price,
        currency: input.currency,
        location: input.location,
        coverImageUrl: input.coverImageUrl,
        publishedListingId: null,
        rejectionNote: null,
        createdAt,
        updatedAt: createdAt,
      };

      data.submissions.push(submission);
      await writeData(storePath, data);
      return clone(submission);
    },

    async deleteSubmission(submissionId: string): Promise<void> {
      const data = await readData(storePath);
      const existing = data.submissions.find((submission) => submission.id === submissionId);
      data.submissions = data.submissions.filter((submission) => submission.id !== submissionId);
      data.images = data.images.filter((image) => image.submissionId !== submissionId);
      data.analyses = data.analyses.filter((analysis) => analysis.submissionId !== submissionId);
      data.ingestJobs = data.ingestJobs.filter((job) => job.submissionId !== submissionId);
      if (existing?.publishedListingId) {
        data.publishedListings = data.publishedListings.filter((listing) => listing.id !== existing.publishedListingId);
      }
      await writeData(storePath, data);
    },

    async updateSubmissionForOwner(
      submissionId: string,
      ownerId: string,
      patch: Partial<Pick<SubmissionRecord, "title" | "description" | "brand" | "model" | "category" | "price" | "currency" | "location">>,
    ): Promise<SubmissionRecord> {
      const data = await readData(storePath);
      const index = data.submissions.findIndex((submission) => submission.id === submissionId && submission.ownerId === ownerId);
      if (index < 0) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }

      const existing = data.submissions[index];
      if (!existing) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }
      const updated: SubmissionRecord = {
        ...existing,
        title: patch.title ?? existing.title,
        description: patch.description ?? existing.description,
        brand: patch.brand ?? existing.brand,
        model: patch.model ?? existing.model,
        category: patch.category ?? existing.category,
        price: patch.price ?? existing.price,
        currency: patch.currency ?? existing.currency,
        location: patch.location ?? existing.location,
        updatedAt: nowIso(),
      };
      data.submissions[index] = updated;
      await writeData(storePath, data);
      return clone(updated);
    },

    async listSubmissionsForOwner(ownerId: string): Promise<SubmissionWithAnalysis[]> {
      const data = await readData(storePath);
      return sortNewestFirst(data.submissions.filter((submission) => submission.ownerId === ownerId))
        .map((submission) => bundleFor(data, submission.id))
        .filter((bundle): bundle is SubmissionWithAnalysis => Boolean(bundle));
    },

    async getSubmissionForOwner(submissionId: string, ownerId: string): Promise<SubmissionWithAnalysis | null> {
      const data = await readData(storePath);
      const bundle = bundleFor(data, submissionId);
      return bundle?.submission.ownerId === ownerId ? bundle : null;
    },

    async getSubmissionForAdmin(submissionId: string): Promise<SubmissionWithAnalysis | null> {
      const data = await readData(storePath);
      return bundleFor(data, submissionId);
    },

    async addSubmissionImages(images: CreateSubmissionImageInput[]): Promise<SubmissionImage[]> {
      const data = await readData(storePath);
      const created = images.map((image) => {
        const createdAt = nowIso();
        return {
          id: `${LOCAL_IMAGE_PREFIX}${randomUUID()}`,
          submissionId: image.submissionId,
          storagePath: image.storagePath,
          publicUrl: image.publicUrl,
          sortOrder: image.sortOrder,
          width: image.width ?? null,
          height: image.height ?? null,
          createdAt,
        } satisfies SubmissionImage;
      });

      data.images.push(...created);
      await writeData(storePath, data);
      return clone(created);
    },

    async updateSubmissionStatus(
      submissionId: string,
      status: SubmissionStatus,
      extraPatch?: Record<string, unknown>,
    ): Promise<SubmissionRecord> {
      const data = await readData(storePath);
      const index = data.submissions.findIndex((submission) => submission.id === submissionId);
      if (index < 0) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }

      const existing = data.submissions[index];
      if (!existing) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }
      const updated: SubmissionRecord = {
        ...existing,
        status,
        rejectionNote: typeof extraPatch?.rejection_note === "string" ? extraPatch.rejection_note : existing.rejectionNote,
        publishedListingId:
          typeof extraPatch?.published_listing_id === "string" ? extraPatch.published_listing_id : existing.publishedListingId,
        updatedAt: nowIso(),
      };
      if (extraPatch && "rejection_note" in extraPatch && extraPatch.rejection_note == null) {
        updated.rejectionNote = null;
      }
      data.submissions[index] = updated;
      await writeData(storePath, data);
      return clone(updated);
    },

    async saveSubmissionAnalysis(
      submissionId: string,
      analysis: SubmissionAnalysisRecord,
    ): Promise<SubmissionAnalysisRecord> {
      const data = await readData(storePath);
      const index = data.analyses.findIndex((candidate) => candidate.submissionId === submissionId);
      const saved = {
        ...analysis,
        submissionId,
      };

      if (index >= 0) {
        data.analyses[index] = saved;
      } else {
        data.analyses.push(saved);
      }
      await writeData(storePath, data);
      return clone(saved);
    },

    async logModerationEvent(input: { submissionId: string; actorId: string; action: string; note?: string | null }): Promise<void> {
      const data = await readData(storePath);
      data.moderationEvents.push({
        id: randomUUID(),
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: input.action,
        note: input.note ?? null,
        createdAt: nowIso(),
      });
      await writeData(storePath, data);
    },

    async listPendingAnalysis(limit = 12): Promise<SubmissionWithAnalysis[]> {
      const data = await readData(storePath);
      return data.submissions
        .filter((submission) => submission.status === "pending_analysis")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, limit)
        .map((submission) => bundleFor(data, submission.id))
        .filter((bundle): bundle is SubmissionWithAnalysis => Boolean(bundle));
    },

    async listReviewQueue(): Promise<SubmissionWithAnalysis[]> {
      const data = await readData(storePath);
      return data.submissions
        .filter((submission) => submission.status === "pending_review")
        .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        .map((submission) => bundleFor(data, submission.id))
        .filter((bundle): bundle is SubmissionWithAnalysis => Boolean(bundle));
    },

    async approveSubmission(submissionId: string, actorId: string): Promise<PublishedListingRecord> {
      const data = await readData(storePath);
      const bundle = bundleFor(data, submissionId);
      if (!bundle) {
        throw new Error("SUBMISSION_NOT_FOUND");
      }

      const publishedAt = nowIso();
      const published: PublishedListingRecord = {
        id: `${LOCAL_PUBLISHED_PREFIX}${randomUUID()}`,
        sourceType: bundle.submission.sourceType,
        ownerId: bundle.submission.ownerId,
        title: bundle.submission.title,
        description: bundle.submission.description,
        brand: bundle.submission.brand,
        model: bundle.submission.model,
        category: bundle.submission.category,
        price: bundle.submission.price,
        currency: bundle.submission.currency,
        location: bundle.submission.location,
        imageCoverUrl: bundle.images[0]?.publicUrl ?? bundle.submission.coverImageUrl,
        externalUrl: bundle.submission.sourceType === "pecid" ? null : bundle.submission.sourceUrl,
        sourceLabel: detectSourceLabel(bundle.submission.sourceType),
        publishedAt,
        status: "published",
      };

      data.publishedListings.push(published);
      const index = data.submissions.findIndex((submission) => submission.id === submissionId);
      const existing = index >= 0 ? data.submissions[index] : null;
      if (existing) {
        data.submissions[index] = {
          ...existing,
          status: "published",
          publishedListingId: published.id,
          rejectionNote: null,
          updatedAt: publishedAt,
        };
      }
      data.moderationEvents.push({
        id: randomUUID(),
        submissionId,
        actorId,
        action: "approved",
        note: null,
        createdAt: publishedAt,
      });
      await writeData(storePath, data);
      return clone(published);
    },

    async rejectSubmission(submissionId: string, actorId: string, note: string): Promise<SubmissionRecord> {
      await this.logModerationEvent({ submissionId, actorId, action: "rejected", note });
      return this.updateSubmissionStatus(submissionId, "rejected", { rejection_note: note });
    },

    async requestSubmissionChanges(submissionId: string, actorId: string, note: string): Promise<SubmissionRecord> {
      await this.logModerationEvent({ submissionId, actorId, action: "changes_requested", note });
      return this.updateSubmissionStatus(submissionId, "draft", { rejection_note: note });
    },

    async listPublicPublishedListings(): Promise<PublishedListingRecord[]> {
      const data = await readData(storePath);
      return data.publishedListings
        .filter((listing) => listing.status === "published")
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .map((listing) => clone(listing));
    },

    async getPublishedListingById(listingId: string): Promise<PublishedListingRecord | null> {
      const data = await readData(storePath);
      return clone(data.publishedListings.find((listing) => listing.id === listingId && listing.status === "published") ?? null);
    },
  };
}

const defaultLocalSubmissionStore = createLocalSubmissionStore();

export function getLocalSubmissionStore() {
  return defaultLocalSubmissionStore;
}

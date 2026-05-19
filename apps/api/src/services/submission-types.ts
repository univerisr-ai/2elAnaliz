export const SUBMISSION_STATUS = {
  DRAFT: "draft",
  PENDING_INGEST: "pending_ingest",
  INGEST_FAILED: "ingest_failed",
  PENDING_ANALYSIS: "pending_analysis",
  ANALYSIS_READY: "analysis_ready",
  PENDING_REVIEW: "pending_review",
  PUBLISHED: "published",
  REJECTED: "rejected",
  ARCHIVED: "archived",
} as const;

export type SubmissionStatus = typeof SUBMISSION_STATUS[keyof typeof SUBMISSION_STATUS];

export const SUBMISSION_TYPE = {
  LINK: "link",
  NATIVE: "native",
} as const;

export type SubmissionType = typeof SUBMISSION_TYPE[keyof typeof SUBMISSION_TYPE];

export const SOURCE_TYPE = {
  PECID: "pecid",
  SAHIBINDEN: "sahibinden",
  LETGO: "letgo",
  DOLAP: "dolap",
  DONANIMHABER: "donanimhaber",
  FACEBOOK: "facebook",
  EXTERNAL: "external",
} as const;

export type SourceType = typeof SOURCE_TYPE[keyof typeof SOURCE_TYPE];

export const EXTERNAL_LINK_INGEST_STATUS = {
  QUEUED: "queued",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
} as const;

export type ExternalLinkIngestStatus =
  typeof EXTERNAL_LINK_INGEST_STATUS[keyof typeof EXTERNAL_LINK_INGEST_STATUS];

export const ANALYSIS_VERDICT = {
  GOOD_PRICE: "good_price",
  MARKET_OK: "market_ok",
  EXPENSIVE: "expensive",
  TOO_CHEAP_REVIEW: "too_cheap_review",
  INSUFFICIENT_DATA: "insufficient_data",
} as const;

export type AnalysisVerdict = typeof ANALYSIS_VERDICT[keyof typeof ANALYSIS_VERDICT];

export type RiskFlag =
  | "low_confidence"
  | "broken_keywords"
  | "box_only"
  | "swap_only"
  | "no_images"
  | "duplicate_url"
  | "duplicate_listing";

export interface SubmissionProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  createdAt: string;
}

export interface SubmissionImage {
  id: string;
  submissionId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface ExternalLinkIngestJobRecord {
  id: string;
  submissionId: string;
  sourceType: Exclude<SourceType, "pecid">;
  sourceUrl: string;
  status: ExternalLinkIngestStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  maxAttempts: number;
  lastError: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  lastTransitionAt: string | null;
  scrapedPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionRecord {
  id: string;
  ownerId: string;
  submissionType: SubmissionType;
  sourceType: SourceType;
  sourceUrl: string | null;
  status: SubmissionStatus;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  coverImageUrl: string | null;
  publishedListingId: string | null;
  rejectionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionAnalysisRecord {
  submissionId: string;
  detectedModel: string | null;
  detectedBrand: string | null;
  fairPrice: number | null;
  marketLow: number | null;
  marketHigh: number | null;
  priceRatio: number | null;
  confidencePercent: number;
  verdict: AnalysisVerdict;
  summaryNote: string;
  riskFlags: RiskFlag[];
  analyzedAt: string;
  analyzerVersion: string;
}

export interface PublishedListingRecord {
  id: string;
  sourceType: SourceType;
  ownerId: string | null;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  imageCoverUrl: string | null;
  externalUrl: string | null;
  sourceLabel: string;
  publishedAt: string;
  status: string;
}

export interface SubmissionWithAnalysis {
  submission: SubmissionRecord;
  images: SubmissionImage[];
  analysis: SubmissionAnalysisRecord | null;
  ownerProfile: SubmissionProfile | null;
  ingestJob: ExternalLinkIngestJobRecord | null;
}

export interface SubmissionAnalysisResult {
  detectedModel: string | null;
  detectedBrand: string | null;
  fairPrice: number | null;
  marketLow: number | null;
  marketHigh: number | null;
  priceRatio: number | null;
  confidencePercent: number;
  verdict: AnalysisVerdict;
  summaryNote: string;
  riskFlags: RiskFlag[];
  analyzerVersion: string;
}

export interface CreateLinkSubmissionInput {
  ownerId: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  coverImageUrl: string | null;
}

export interface CreateNativeSubmissionInput {
  ownerId: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number;
  currency: string;
  location: string | null;
  coverImageUrl: string | null;
}

export interface CreateSubmissionImageInput {
  submissionId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
  width?: number | null;
  height?: number | null;
}

export interface CreateExternalLinkIngestJobInput {
  submissionId: string;
  sourceType: Exclude<SourceType, "pecid">;
  sourceUrl: string;
}

export interface AuthenticatedActor {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

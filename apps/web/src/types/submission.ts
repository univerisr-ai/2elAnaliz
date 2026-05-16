import type { BuyabilityInsight } from "./listing";

export type SubmissionStatus =
  | "draft"
  | "pending_ingest"
  | "ingest_failed"
  | "pending_analysis"
  | "analysis_ready"
  | "pending_review"
  | "published"
  | "rejected"
  | "archived";

export type ExternalLinkIngestStatus = "queued" | "processing" | "completed" | "failed" | "blocked";

export type SubmissionType = "link" | "native";
export type SourceType = "pecid" | "sahibinden" | "letgo" | "dolap" | "external";
export type AnalysisVerdict = "good_price" | "market_ok" | "expensive" | "too_cheap_review" | "insufficient_data";

export interface SubmissionProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

export interface SubmissionImage {
  id: string;
  submissionId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
  createdAt: string;
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

export interface SubmissionAnalysis {
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
  riskFlags: string[];
  analyzedAt: string;
  analyzerVersion: string;
}

export interface ExternalLinkIngestJob {
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

export interface SubmissionBundle {
  submission: SubmissionRecord;
  images: SubmissionImage[];
  analysis: SubmissionAnalysis | null;
  ownerProfile: SubmissionProfile | null;
  ingestJob: ExternalLinkIngestJob | null;
}

export interface PublishedListingDetail {
  id: string;
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
  publishedAt: string;
  status: string;
  sourceLabel?: string | null;
  externalUrl?: string | null;
  isInternal?: boolean;
  comments?: Array<{
    id: string;
    listingId: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  buyability?: BuyabilityInsight | null;
}

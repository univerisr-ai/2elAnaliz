import type { SubmissionWithAnalysis } from "./submission-types.js";
import { isPrivateHost } from "./submission-utils.js";

export function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Gecersiz gorsel linki");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Gorsel linki http/https olmali.");
  }

  if (isPrivateHost(parsed.hostname.toLowerCase())) {
    throw new Error("Yerel veya ozel ag gorselleri kabul edilmez.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export function requireManualSubmissionImageUrl(value: unknown): string {
  const imageUrl = normalizeImageUrl(value);
  if (!imageUrl) {
    throw new Error("Manuel ilan icin gorsel linki zorunlu.");
  }

  return imageUrl;
}

export function optionalManualSubmissionImageUrl(value: unknown): string | null {
  return normalizeImageUrl(value);
}

export function resolveSubmissionCommentListingId(bundle: SubmissionWithAnalysis | null): string | null {
  return bundle?.submission.publishedListingId ?? null;
}

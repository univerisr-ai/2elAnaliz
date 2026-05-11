import assert from "node:assert/strict";
import { requireManualSubmissionImageUrl, resolveSubmissionCommentListingId } from "./submission-policy-service.js";
import type { SubmissionWithAnalysis } from "./submission-types.js";

assert.equal(
  requireManualSubmissionImageUrl(" https://example.com/gpu.jpg "),
  "https://example.com/gpu.jpg",
);

assert.throws(
  () => requireManualSubmissionImageUrl(""),
  /Manuel ilan icin gorsel linki zorunlu/,
);

assert.throws(
  () => requireManualSubmissionImageUrl("file:///C:/gpu.jpg"),
  /Gorsel linki http\/https olmali/,
);

assert.throws(
  () => requireManualSubmissionImageUrl("http://localhost/gpu.jpg"),
  /Yerel veya ozel ag gorselleri kabul edilmez/,
);

const publishedBundle = {
  submission: {
    publishedListingId: "pub-123",
  },
} as SubmissionWithAnalysis;

const pendingBundle = {
  submission: {
    publishedListingId: null,
  },
} as SubmissionWithAnalysis;

assert.equal(resolveSubmissionCommentListingId(publishedBundle), "pub-123");
assert.equal(resolveSubmissionCommentListingId(pendingBundle), null);
assert.equal(resolveSubmissionCommentListingId(null), null);

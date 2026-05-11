import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalSubmissionStore } from "./local-submission-store.js";

async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "2el-local-submissions-"));

  try {
    const store = createLocalSubmissionStore(path.join(dir, "submissions.json"));
    const profile = await store.upsertProfile({
      id: "dev-user-test",
      email: "demir.test@example.com",
      displayName: "Demir Test",
    });

    const submission = await store.createNativeSubmission({
      ownerId: profile.id,
      title: "RTX 3060 Ti test ilanı",
      description: "Temiz, kutulu, test amaçlı ilan.",
      brand: "NVIDIA",
      model: "RTX 3060 Ti",
      category: "gpu",
      price: 8500,
      currency: "TRY",
      location: "İstanbul",
      coverImageUrl: "https://example.com/gpu.jpg",
    });

    await store.updateSubmissionStatus(submission.id, "pending_analysis");
    await store.saveSubmissionAnalysis(submission.id, {
      submissionId: submission.id,
      detectedModel: "RTX 3060 Ti",
      detectedBrand: "NVIDIA",
      fairPrice: 9000,
      marketLow: 7800,
      marketHigh: 11000,
      priceRatio: 0.94,
      confidencePercent: 86,
      verdict: "good_price",
      summaryNote: "Test ilanı alınabilir görünüyor.",
      riskFlags: [],
      analyzedAt: new Date().toISOString(),
      analyzerVersion: "test",
    });

    const bundle = await store.getSubmissionForOwner(submission.id, profile.id);
    assert.equal(bundle?.submission.status, "pending_analysis");
    assert.equal(bundle?.analysis?.verdict, "good_price");
    assert.equal(bundle?.ownerProfile?.email, "demir.test@example.com");

    const mine = await store.listSubmissionsForOwner(profile.id);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]?.submission.title, "RTX 3060 Ti test ilanı");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

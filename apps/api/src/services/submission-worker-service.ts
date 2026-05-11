import { saveSubmissionAnalysis, listPendingAnalysis, updateSubmissionStatus } from "./submission-repository.js";
import { analyzeSubmission } from "./submission-analysis-service.js";

let workerTimer: NodeJS.Timeout | null = null;
let processing = false;

export async function processPendingSubmissionAnalyses(): Promise<number> {
  if (processing) {
    return 0;
  }

  processing = true;

  try {
    const queue = await listPendingAnalysis(10);
    let processed = 0;

    for (const bundle of queue) {
      const analysis = await analyzeSubmission(bundle);
      await saveSubmissionAnalysis(bundle.submission.id, {
        submissionId: bundle.submission.id,
        ...analysis,
        analyzedAt: new Date().toISOString(),
      });
      await updateSubmissionStatus(bundle.submission.id, "pending_review");
      processed += 1;
    }

    return processed;
  } finally {
    processing = false;
  }
}

export function startSubmissionWorker(): void {
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    processPendingSubmissionAnalyses().catch((error) => {
      console.error("[SUBMISSION-WORKER] Analiz kuyruğu hatasi:", error);
    });
  }, 15_000);
}


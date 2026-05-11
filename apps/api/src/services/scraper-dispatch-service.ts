import { ENV } from "../config/env.js";

export async function wakeScraperQueueProcessor(): Promise<void> {
  if (!ENV.SCRAPER_DISPATCH_TOKEN) {
    console.warn("[SCRAPER-DISPATCH] Token tanimli degil, workflow uyandirilamadi.");
    return;
  }

  const endpoint = `https://api.github.com/repos/${ENV.SCRAPER_REPO_OWNER}/${ENV.SCRAPER_REPO_NAME}/actions/workflows/${ENV.SCRAPER_WORKFLOW_ID}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.SCRAPER_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: ENV.SCRAPER_WORKFLOW_REF,
      inputs: {
        process_queue_only: "true",
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`SCRAPER_DISPATCH_FAILED:${response.status}:${details}`);
  }
}

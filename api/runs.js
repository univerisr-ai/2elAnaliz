import { getDashboardConfig } from './_lib/config.js';
import { listWorkflowRuns } from './_lib/github.js';
import { errorJson, json } from './_lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const config = getDashboardConfig();
    if (!config.githubToken) {
      return json({
        ok: true,
        scraper: [],
        analyzer: [],
        warnings: ['GitHub token tanimli olmadigi icin run listesi okunamadi.'],
      });
    }

    const [scraperRuns, analyzerRuns] = await Promise.all([
      listWorkflowRuns(config, config.scraper, 12),
      listWorkflowRuns(config, config.analyzer, 12),
    ]);

    return json({
      ok: true,
      scraper: scraperRuns,
      analyzer: analyzerRuns,
      warnings: [],
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}

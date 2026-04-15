import { getDashboardConfig } from './_lib/config.js';
import { buildPipelineHealth, getActionsVariable, listWorkflowRuns } from './_lib/github.js';
import { errorJson, json } from './_lib/http.js';
import { readLatestSummary } from './_lib/summary.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const config = getDashboardConfig();
    const summary = await readLatestSummary();

    let paused = false;
    let latestScraperRun = null;
    let latestAnalyzerRun = null;
    let warnings = [];

    if (config.githubToken) {
      const [pauseVariable, scraperRuns, analyzerRuns] = await Promise.all([
        getActionsVariable(config, config.scraper, config.pauseVariable),
        listWorkflowRuns(config, config.scraper, 6),
        listWorkflowRuns(config, config.analyzer, 6),
      ]);

      paused = String(pauseVariable?.value || '').trim().toLowerCase() === 'true';
      latestScraperRun = scraperRuns[0] || null;
      latestAnalyzerRun = analyzerRuns[0] || null;

      const health = buildPipelineHealth({ paused, latestScraperRun, latestAnalyzerRun });

      return json({
        ok: true,
        summary,
        paused,
        latestRuns: {
          scraper: latestScraperRun,
          analyzer: latestAnalyzerRun,
        },
        pipelineHealth: health.state,
        banner: health.banner,
        deploy: {
          projectName: config.vercelProjectName || summary?.runMeta?.deployProjectName || null,
          deployedAt: summary?.runMeta?.deployedAt || summary?.generatedAt || null,
        },
        warnings,
      });
    }

    warnings = ['GitHub token tanimli olmadigi icin run durumu okunamadi.'];
    return json({
      ok: true,
      summary,
      paused,
      latestRuns: {
        scraper: latestScraperRun,
        analyzer: latestAnalyzerRun,
      },
      pipelineHealth: 'unknown',
      banner: {
        level: 'warning',
        text: warnings[0],
      },
      deploy: {
        projectName: config.vercelProjectName || summary?.runMeta?.deployProjectName || null,
        deployedAt: summary?.runMeta?.deployedAt || summary?.generatedAt || null,
      },
      warnings,
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}

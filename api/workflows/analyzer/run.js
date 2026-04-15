import { getDashboardConfig } from '../../_lib/config.js';
import { dispatchWorkflow } from '../../_lib/github.js';
import { errorJson, json } from '../../_lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST() {
  try {
    const config = getDashboardConfig();

    const result = await dispatchWorkflow(config, config.analyzer);

    return json({
      ok: true,
      result,
      message: 'Analyzer workflow dispatch tetiklendi.',
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}

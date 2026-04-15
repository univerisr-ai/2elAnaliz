import { getDashboardConfig } from '../../_lib/config.js';
import { dispatchWorkflow } from '../../_lib/github.js';
import { errorJson, json, readJsonBody } from '../../_lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  try {
    const config = getDashboardConfig();
    const body = await readJsonBody(request);

    const result = await dispatchWorkflow(config, config.scraper, {
      min_fiyat: body?.min_fiyat ?? '',
      max_fiyat: body?.max_fiyat ?? '',
      bypass_ai: body?.bypass_ai == null ? 'true' : String(Boolean(body.bypass_ai)),
    });

    return json({
      ok: true,
      result,
      message: 'Scraper workflow dispatch tetiklendi.',
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}

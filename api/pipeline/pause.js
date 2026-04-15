import { getDashboardConfig } from '../_lib/config.js';
import { upsertActionsVariable } from '../_lib/github.js';
import { errorJson, json, readJsonBody } from '../_lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  try {
    const config = getDashboardConfig();
    const body = await readJsonBody(request);
    const paused = body?.paused === true;

    const result = await upsertActionsVariable(
      config,
      config.scraper,
      config.pauseVariable,
      paused ? 'true' : 'false',
    );

    return json({
      ok: true,
      paused,
      result,
      message: paused ? 'Otomatik schedule duraklatildi.' : 'Otomatik schedule yeniden acildi.',
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}

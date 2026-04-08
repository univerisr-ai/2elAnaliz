import axios from 'axios';
import { CONFIG } from './config.mjs';
import { parsePriceTl } from './utils.mjs';

function findJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function fetchAiPriceReference(modelKey) {
  if (CONFIG.aiProvider !== 'openrouter' || !CONFIG.openRouterApiKey) {
    return null;
  }

  const prompt = [
    `GPU model: ${modelKey}`,
    'Task: Estimate current Turkey second-hand fair market price in TRY.',
    'Return strict JSON only with keys: fair_min, fair_max, confidence, note.',
    'Rules: confidence must be 0..1, fair_min/fair_max must be integers in TRY.',
  ].join('\n');

  try {
    const { data } = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: CONFIG.openRouterModel,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You are a pricing assistant. Return only JSON object without markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        timeout: 45000,
        headers: {
          Authorization: `Bearer ${CONFIG.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const raw = data?.choices?.[0]?.message?.content || '';
    const parsed = findJsonObject(raw);
    if (!parsed) return null;

    const fairMin = parsePriceTl(parsed.fair_min);
    const fairMax = parsePriceTl(parsed.fair_max);
    if (!(fairMin > 0) || !(fairMax > 0) || fairMax < fairMin) return null;

    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0.45;

    return {
      source: 'ai',
      fairMin,
      fairMax,
      fairPrice: Math.round((fairMin + fairMax) / 2),
      confidence,
      note: String(parsed.note || '').slice(0, 200),
    };
  } catch {
    return null;
  }
}

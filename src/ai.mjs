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

export async function fetchAiPriceReference(modelKey, localMedian = 0) {
  if (CONFIG.aiProvider !== 'openrouter' || !CONFIG.openRouterApiKey) {
    return null;
  }

  // Provide local context to the AI so it doesn't hallucinate wildly
  const localContext = localMedian > 0 
    ? `We currently see a local median price of ${localMedian} TRY on the market.`
    : `We have no local median price available.`;

  const prompt = [
    `GPU model: ${modelKey}`,
    `Context: ${localContext}`,
    'Task: Estimate the true Turkish second-hand fair market price in TRY.',
    'Consider factors like current mining deprecation, new GPU generation releases, and realistic seller markup.',
    'Return strict JSON only with keys: fair_min, fair_max, confidence, note.', 
    'Rules: confidence must be 0..1, fair_min/fair_max must be integers in TRY.',
    'Do not include markdown blocks like ```json, just output the raw JSON object.'
  ].join('\n');

  const modelsToTry = CONFIG.openRouterModels.slice(0, CONFIG.maxAiFallbackModels);
  const failReasons = [];

  for (const model of modelsToTry) {
    try {
      const { data } = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          temperature: 0.05,
          messages: [
            {
              role: 'system',
              content:
                'You are a pricing assistant focused on accuracy. Return only one JSON object without markdown.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          timeout: 55000,
          headers: {
            Authorization: `Bearer ${CONFIG.openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const raw = data?.choices?.[0]?.message?.content || '';
      const parsed = findJsonObject(raw);
      if (!parsed) continue;

      const fairMin = parsePriceTl(parsed.fair_min);
      const fairMax = parsePriceTl(parsed.fair_max);
      if (!(fairMin > 0) || !(fairMax > 0) || fairMax < fairMin) continue;

      const confidenceRaw = Number(parsed.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0.45;

      return {
        source: 'ai',
        aiModel: model,
        fairMin,
        fairMax,
        fairPrice: Math.round((fairMin + fairMax) / 2),
        confidence,
        note: String(parsed.note || '').slice(0, 200),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failReasons.push(`${model}: ${msg.slice(0, 180)}`);
      // try next model in chain
    }
  }

  if (failReasons.length) {
    console.warn(
      `[ai] All fallback models failed for ${modelKey}. ` +
        `Check OPENROUTER_MODELS. Reasons: ${failReasons.join(' | ')}`,
    );
  }

  return null;
}

export async function generateFinalExpertSummary(topCandidates) {
  if (CONFIG.aiProvider !== 'openrouter' || !CONFIG.openRouterApiKey || topCandidates.length === 0) {
    return null;
  }

  const listingsText = topCandidates.slice(0, 15).map((x, i) => 
    `ID: ${i+1} | TITLE: ${String(x.title).substring(0, 80)} | MODEL: ${x.modelKey} | PRICE: ${x.price} TRY | REFERENCE: ${x.fairPrice} TRY`
  ).join('\n');

  const prompt = [
    'Sen 2026 yılında Türkiye\'de ikinci el bilgisayar parçaları konusunda uzman bir analizcisin (PC Master).',
    'Aşağıdaki matematiksel olarak en karlı duran 15 GPU ekran kartı ilanını (başlık, piyasa değeri ve fiyatlarına göre) incele.',
    'Matematik bazen yanıltıcıdır: Başlıklarda gizli olabilecek arıza, "çalışmıyor", "yedek parça", "mining çıkması", veya şüpheli dolandırıcılık kokan ifadeleri cımbızla (semantic analiz yap).',
    'Görevin: Mantıken ve cidden alınabilecek en iyi 3 (veya daha az) ekran kartını seç.',
    'JSON formatı KULLANMA. Kullanıcı telgrafa gönderecek.',
    'Lütfen çok net, 3 maddelik kısa bir değerlendirme metni yaz.',
    'Format: (id numarasını gösterme, kartın net adını ve fiyatını yaz)',
    '1. [GPU Model / Başlık Kısaltması] - [Fiyat] TL',
    '   💡 [Seçim sebebin ve başlıktaki temizlik hissiyatı (Örn: Parametre ve başlık temiz duruyor)]',
    '',
    'Lütfen Türkçe yanıt ver.',
    'İlanlar:',
    listingsText
  ].join('\n');

  try {
    const { data } = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: CONFIG.openRouterModels[0], // Prefer the primary 480B model
        temperature: 0.25,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        timeout: 45000,
        headers: {
          Authorization: `Bearer ${CONFIG.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return (data?.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    console.warn('[ai] Expert summary generation failed:', err.message);
    return null;
  }
}


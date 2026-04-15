import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, readJson } from './utils.mjs';

function toStr(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNum(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildRunUrl(repository, runId, serverUrl = 'https://github.com') {
  const repo = toStr(repository);
  const id = toStr(runId);
  if (!repo || !id) return '';
  return `${serverUrl.replace(/\/+$/, '')}/${repo}/actions/runs/${id}`;
}

function sanitizePipelineMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => ({
      service: toStr(entry?.service, 'service'),
      status: toStr(entry?.status, 'UNKNOWN'),
      message: toStr(entry?.message),
      timestamp: toStr(entry?.timestamp),
    }))
    .filter((entry) => entry.message || entry.timestamp)
    .slice(-20);
}

function buildAnalysisNote(candidate) {
  const discount = Math.max(0, toNum(candidate?.discountRatio, 0) * 100);
  const confidence = Math.max(0, toNum(candidate?.confidence, 0) * 100);
  if (discount >= 20 && confidence >= 70) {
    return `Piyasanin belirgin altinda. Tahmini indirim %${discount.toFixed(1)}, guven %${confidence.toFixed(0)}.`;
  }
  if (discount >= 10) {
    return `Piyasa altinda gorunuyor. Tahmini indirim %${discount.toFixed(1)}, guven %${confidence.toFixed(0)}.`;
  }
  return `Yakindan kontrol edilmeli. Tahmini indirim %${discount.toFixed(1)}, guven %${confidence.toFixed(0)}.`;
}

function sanitizeTopCandidate(candidate) {
  return {
    title: toStr(candidate?.title, 'Isimsiz ilan'),
    url: toStr(candidate?.url),
    modelKey: toStr(candidate?.modelKey, 'GPU'),
    price: toNum(candidate?.price),
    fairPrice: toNum(candidate?.fairPrice),
    discountRatio: toNum(candidate?.discountRatio),
    confidence: toNum(candidate?.confidence),
    analysisNote: toStr(candidate?.analysisNote) || buildAnalysisNote(candidate),
  };
}

export async function loadPipelineMessages(inputPath) {
  const fallback = [
    {
      service: 'scraper',
      status: 'ANALIZ_EDILMEDI',
      message: 'Scraper ilanlari cekti; analiz 2elAnaliz servisine devredildi.',
      timestamp: new Date().toISOString(),
    },
  ];

  try {
    const pipelinePath = path.join(path.dirname(inputPath), 'pipeline-messages.json');
    const parsed = await readJson(pipelinePath, fallback);
    if (Array.isArray(parsed) && parsed.length) {
      return sanitizePipelineMessages(parsed);
    }
  } catch {
    // fallback below
  }

  return fallback;
}

export function buildLatestSummary({ report, pipelineMessages, rawInput, inputPath, env = process.env }) {
  const deployedAt = new Date().toISOString();
  const rawRunMeta = rawInput?.runMeta && typeof rawInput.runMeta === 'object' ? rawInput.runMeta : {};
  const sourceRepository =
    toStr(env.SCRAPER_SOURCE_REPOSITORY) ||
    toStr(rawRunMeta.repository) ||
    toStr(env.SCRAPER_REPOSITORY);
  const scraperRunId = toStr(env.SCRAPER_GITHUB_RUN_ID) || toStr(rawRunMeta.githubRunId);
  const analyzerRepository = toStr(env.GITHUB_REPOSITORY);
  const analyzerRunId = toStr(env.GITHUB_RUN_ID);
  const artifactName = toStr(env.SCRAPER_ARTIFACT_NAME) || toStr(rawRunMeta.artifactName);
  const scrapeStatus = toStr(env.SCRAPER_STATUS) || toStr(rawRunMeta.scrapeStatus) || 'SCRAPE_COMPLETED';
  const pipelineMessage =
    toStr(env.SCRAPER_PIPELINE_MESSAGE) ||
    toStr(rawRunMeta.pipelineMessage) ||
    'Analyzer, scraper tarafindan hazirlanan veriyi isledi.';

  return {
    analysisCompleted: true,
    generatedAt: toStr(report?.generatedAt, deployedAt),
    listingCount: toNum(report?.listingCount),
    recognizedModelCount: toNum(report?.recognizedModelCount),
    candidateCount: toNum(report?.candidateCount),
    topCandidates: Array.isArray(report?.topCandidates)
      ? report.topCandidates.slice(0, 40).map(sanitizeTopCandidate)
      : [],
    expertSummary: toStr(report?.expertSummary),
    pipelineMessages: sanitizePipelineMessages(pipelineMessages),
    runMeta: {
      inputFile: path.basename(inputPath),
      sourceRepository,
      scraperRunId,
      scraperRunUrl:
        toStr(env.SCRAPER_RUN_URL) ||
        buildRunUrl(sourceRepository, scraperRunId, toStr(env.GITHUB_SERVER_URL, 'https://github.com')),
      scraperArtifactName: artifactName,
      scrapeStatus,
      listingCountFromScraper:
        toNum(env.SCRAPER_LISTING_COUNT, NaN) ||
        toNum(rawRunMeta.listingCount, NaN) ||
        toNum(rawInput?.totalClean, toNum(report?.listingCount)),
      startedAt: toStr(env.SCRAPER_STARTED_AT) || toStr(rawRunMeta.startedAt),
      finishedAt: toStr(env.SCRAPER_FINISHED_AT) || toStr(rawRunMeta.finishedAt),
      pipelineMessage,
      isFallback:
        String(env.SCRAPER_IS_FALLBACK || '').trim().toLowerCase() === 'true' ||
        rawRunMeta.isFallback === true,
      analyzerRepository,
      analyzerRunId,
      analyzerRunUrl: buildRunUrl(
        analyzerRepository,
        analyzerRunId,
        toStr(env.GITHUB_SERVER_URL, 'https://github.com'),
      ),
      deployedAt,
      deployTarget: toStr(env.DEPLOY_TARGET, 'vercel'),
      deployProjectName: toStr(env.VERCEL_PROJECT_NAME),
      dashboardVersion: 'v1',
    },
  };
}

export async function writeLatestSummary(summary, docsDir) {
  await ensureDir(docsDir);
  const outputPath = path.join(docsDir, 'latest-summary.json');
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return outputPath;
}

import fs from 'node:fs/promises';

const EMPTY_SUMMARY = {
  analysisCompleted: false,
  generatedAt: null,
  listingCount: 0,
  recognizedModelCount: 0,
  candidateCount: 0,
  topCandidates: [],
  expertSummary: '',
  pipelineMessages: [],
  runMeta: {
    deployedAt: null,
    deployTarget: 'vercel',
    dashboardVersion: 'v1',
  },
};

export async function readLatestSummary() {
  try {
    const filePath = new URL('../../docs/latest-summary.json', import.meta.url);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : EMPTY_SUMMARY;
  } catch {
    return EMPTY_SUMMARY;
  }
}

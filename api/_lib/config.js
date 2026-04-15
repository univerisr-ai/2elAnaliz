function toStr(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function getDashboardConfig(env = process.env) {
  return {
    githubToken: toStr(env.GITHUB_FINE_GRAINED_TOKEN || env.GITHUB_TOKEN),
    vercelProjectName: toStr(env.VERCEL_PROJECT_NAME),
    scraper: {
      owner: toStr(env.SCRAPER_REPO_OWNER, 'univerisr-ai'),
      name: toStr(env.SCRAPER_REPO_NAME, 'yenitest'),
      workflowId: toStr(env.SCRAPER_WORKFLOW_ID, 'scraper.yml'),
      ref: toStr(env.SCRAPER_REPO_REF, 'main'),
    },
    analyzer: {
      owner: toStr(env.ANALYZER_REPO_OWNER, 'univerisr-ai'),
      name: toStr(env.ANALYZER_REPO_NAME, '2elAnaliz'),
      workflowId: toStr(env.ANALYZER_WORKFLOW_ID, 'analyze-telegram-gpu.yml'),
      ref: toStr(env.ANALYZER_REPO_REF, 'main'),
    },
    pauseVariable: toStr(env.PIPELINE_PAUSED_VARIABLE, 'PIPELINE_PAUSED'),
  };
}

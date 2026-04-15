function repoSlug(repo) {
  return `${repo.owner}/${repo.name}`;
}

function workflowPageUrl(repo) {
  return `https://github.com/${repoSlug(repo)}/actions/workflows/${repo.workflowId}`;
}

function runSummary(run) {
  return {
    id: run.id,
    runNumber: run.run_number,
    workflowId: run.workflow_id,
    name: run.name,
    displayTitle: run.display_title,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    branch: run.head_branch,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
    actor: run.actor?.login || null,
  };
}

async function requestGitHub(config, pathname, options = {}) {
  if (!config.githubToken) {
    const err = new Error('GITHUB_FINE_GRAINED_TOKEN is missing.');
    err.status = 500;
    throw err;
  }

  const response = await fetch(`https://api.github.com${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const raw = await response.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      })()
    : null;

  if (!response.ok) {
    const err = new Error(
      `GitHub API failed (${response.status}) for ${pathname}: ${
        typeof payload === 'string' ? payload.slice(0, 220) : JSON.stringify(payload).slice(0, 220)
      }`,
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

export async function listWorkflowRuns(config, repo, perPage = 10) {
  const payload = await requestGitHub(
    config,
    `/repos/${repo.owner}/${repo.name}/actions/workflows/${encodeURIComponent(repo.workflowId)}/runs?per_page=${perPage}`,
  );
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs.map(runSummary) : [];
}

export async function dispatchWorkflow(config, repo, inputs = {}) {
  const cleanInputs = Object.fromEntries(
    Object.entries(inputs).filter(([, value]) => value !== undefined && value !== null),
  );

  await requestGitHub(
    config,
    `/repos/${repo.owner}/${repo.name}/actions/workflows/${encodeURIComponent(repo.workflowId)}/dispatches`,
    {
      method: 'POST',
      body: {
        ref: repo.ref,
        inputs: cleanInputs,
      },
    },
  );

  return {
    ok: true,
    repo: repoSlug(repo),
    workflowId: repo.workflowId,
    workflowUrl: workflowPageUrl(repo),
  };
}

export async function getActionsVariable(config, repo, variableName) {
  try {
    return await requestGitHub(
      config,
      `/repos/${repo.owner}/${repo.name}/actions/variables/${encodeURIComponent(variableName)}`,
    );
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function upsertActionsVariable(config, repo, variableName, value) {
  try {
    await requestGitHub(
      config,
      `/repos/${repo.owner}/${repo.name}/actions/variables/${encodeURIComponent(variableName)}`,
      {
        method: 'PATCH',
        body: {
          name: variableName,
          value: String(value),
        },
      },
    );
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }

    await requestGitHub(config, `/repos/${repo.owner}/${repo.name}/actions/variables`, {
      method: 'POST',
      body: {
        name: variableName,
        value: String(value),
      },
    });
  }

  return {
    ok: true,
    repo: repoSlug(repo),
    variableName,
    value: String(value),
  };
}

export function buildPipelineHealth({ paused, latestScraperRun, latestAnalyzerRun }) {
  if (paused) {
    return {
      state: 'paused',
      banner: {
        level: 'info',
        text: 'Otomatik scraper schedule duraklatildi. Manuel rerun hala kullanilabilir.',
      },
    };
  }

  if (latestAnalyzerRun?.conclusion === 'failure') {
    return {
      state: 'degraded',
      banner: {
        level: 'error',
        text: 'Analyzer workflow son kosuda basarisiz oldu.',
        runUrl: latestAnalyzerRun.htmlUrl,
      },
    };
  }

  if (latestScraperRun?.conclusion === 'failure') {
    return {
      state: 'degraded',
      banner: {
        level: 'error',
        text: 'Scraper workflow son kosuda basarisiz oldu.',
        runUrl: latestScraperRun.htmlUrl,
      },
    };
  }

  if (
    latestAnalyzerRun?.status === 'queued' ||
    latestAnalyzerRun?.status === 'in_progress' ||
    latestScraperRun?.status === 'queued' ||
    latestScraperRun?.status === 'in_progress'
  ) {
    return {
      state: 'running',
      banner: {
        level: 'info',
        text: 'Pipeline su anda calisiyor.',
      },
    };
  }

  return {
    state: 'healthy',
    banner: null,
  };
}

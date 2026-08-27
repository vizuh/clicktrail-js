import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function parseJson(name) {
  try {
    return JSON.parse(process.env[name] ?? '');
  } catch {
    return null;
  }
}

function resultTime(result) {
  const raw = result.kind === 'check'
    ? result.started_at ?? result.run_started_at ?? result.created_at ?? result.completed_at ?? result.updated_at
    : result.created_at ?? result.updated_at;
  const time = Date.parse(raw ?? '');
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function latestResult(context, sha, checkPages, combinedStatus) {
  const normalizedSha = typeof sha === 'string' ? sha.toLowerCase() : '';
  const pages = Array.isArray(checkPages) ? checkPages : [checkPages];
  const checks = pages.flatMap((page) => page?.check_runs ?? [])
    .filter((run) => run?.name === context && typeof run?.head_sha === 'string' && run.head_sha.toLowerCase() === normalizedSha)
    .map((run) => ({ ...run, kind: 'check' }));
  const statuses = (combinedStatus?.statuses ?? [])
    .filter((status) => status?.context === context && typeof status?.sha === 'string' && status.sha.toLowerCase() === normalizedSha)
    .map((status) => ({ ...status, kind: 'status' }));
  return [...checks, ...statuses]
    .sort((left, right) => resultTime(left) - resultTime(right) || (left.id ?? 0) - (right.id ?? 0))
    .at(-1) ?? null;
}

export function verifyRemoteChecks(input) {
  const { sha, required, checkPages, combinedStatus } = input;
  if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) {
    return { ok: false, reason: 'release SHA is invalid' };
  }
  if (
    !Array.isArray(required) ||
    required.length === 0 ||
    required.some((context) => typeof context !== 'string' || context === '')
  ) {
    return { ok: false, reason: 'required status checks are missing' };
  }
  for (const context of required) {
    const result = latestResult(context, sha, checkPages, combinedStatus);
    const successful = result?.kind === 'check'
      ? result.status === 'completed' && result.conclusion === 'success'
      : result?.kind === 'status' && result.state === 'success';
    if (!successful) return { ok: false, reason: `required check is not currently successful: ${context}` };
  }
  return { ok: true };
}

function main() {
  const outcome = verifyRemoteChecks({
    sha: process.env.CLICKTRAIL_RELEASE_SHA,
    required: parseJson('CLICKTRAIL_REQUIRED_CHECKS'),
    checkPages: parseJson('CLICKTRAIL_CHECK_RUN_PAGES'),
    combinedStatus: parseJson('CLICKTRAIL_COMBINED_STATUS'),
  });
  if (!outcome.ok) {
    console.error(`refusing: ${outcome.reason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

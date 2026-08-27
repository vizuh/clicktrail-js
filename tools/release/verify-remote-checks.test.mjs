import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const verifier = join(root, 'tools/release/verify-remote-checks.mjs');
const sha = 'a'.repeat(40);

function run({ statuses, checkPages = [], required = ['ci/test'] }) {
  return spawnSync(process.execPath, [verifier], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLICKTRAIL_RELEASE_SHA: sha,
      CLICKTRAIL_REQUIRED_CHECKS: JSON.stringify(required),
      CLICKTRAIL_CHECK_RUN_PAGES: JSON.stringify(checkPages),
      CLICKTRAIL_COMBINED_STATUS: JSON.stringify(statuses),
    },
  });
}

test('accepts the latest successful status for each required context', () => {
  const result = run({
    statuses: {
      sha,
      state: 'success',
      statuses: [
        { id: 1, context: 'ci/test', sha, state: 'failure', created_at: '2026-08-27T10:00:00Z' },
        { id: 2, context: 'ci/test', sha, state: 'success', created_at: '2026-08-27T10:01:00Z' },
      ],
    },
  });
  assert.equal(result.status, 0, result.stderr);
});

test('accepts a current successful check-run without combined status success', () => {
  const result = run({
    statuses: { sha, state: 'failure', statuses: [] },
    checkPages: [{ check_runs: [{
      id: 1,
      name: 'ci/test',
      head_sha: sha,
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-08-27T10:01:00Z',
    }] }],
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects an older successful status followed by a failure', () => {
  const result = run({
    statuses: {
      sha,
      state: 'failure',
      statuses: [
        { id: 1, context: 'ci/test', sha, state: 'success', created_at: '2026-08-27T10:00:00Z' },
        { id: 2, context: 'ci/test', sha, state: 'failure', created_at: '2026-08-27T10:01:00Z' },
      ],
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /currently successful/);
});

test('rejects missing and pending required contexts', () => {
  const missing = run({
    statuses: { sha, state: 'success', statuses: [] },
  });
  assert.notEqual(missing.status, 0);

  const pending = run({
    statuses: { sha, state: 'pending', statuses: [
      { id: 1, context: 'ci/test', sha, state: 'pending', created_at: '2026-08-27T10:00:00Z' },
    ] },
  });
  assert.notEqual(pending.status, 0);
});

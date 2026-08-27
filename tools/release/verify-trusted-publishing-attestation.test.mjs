import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../..', import.meta.url));
const verifier = join(root, 'tools/release/verify-trusted-publishing-attestation.mjs');
const key = 'test-attestation-key';
const commitSha = 'a'.repeat(40);
const packages = [
  '@vizuh/clicktrail-core',
  '@vizuh/clicktrail-browser',
  '@vizuh/clicktrail',
  '@vizuh/clicktrail-astro',
  '@vizuh/clicktrail-nuxt',
];

function trustDocument() {
  return [{
    id: 'test-trust-id',
    type: 'github',
    claims: {
      repository: 'vizuh/clicktrail-js',
      workflow_ref: { file: 'publish.yml' },
      environment: 'npm',
    },
    permissions: ['createPackage'],
  }];
}

function signedAttestation(overrides = {}) {
  const issuedAt = new Date(Date.now() - 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const value = {
    format: 'clicktrail-trusted-publishing-v1',
    status: 'verified',
    repository: 'vizuh/clicktrail-js',
    workflow: 'publish.yml',
    environment: 'npm',
    publisher: 'atroci',
    source: 'npmjs.com',
    command: 'npm publish',
    provenance: true,
    verifiedBy: 'atroci',
    verificationMethod: 'npm trust list',
    packages,
    commitSha,
    releaseVersion: '0.1.0-rc.4',
    issuedAt,
    expiresAt,
    verifiedAt: issuedAt,
    configuration: {
      provider: 'github-actions',
      repository: 'vizuh/clicktrail-js',
      workflow: 'publish.yml',
      environment: 'npm',
      allowedAction: 'npm publish',
    },
    ...overrides,
  };
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function run(attestation, overrides = {}) {
  const trustDir = mkdtempSync(join(tmpdir(), 'clicktrail-trust-'));
  for (const [index] of packages.entries()) {
    writeFileSync(join(trustDir, `${index}.json`), JSON.stringify(trustDocument()));
  }
  const result = spawnSync(process.execPath, [verifier], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION: attestation,
      CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION_KEY: key,
      CLICKTRAIL_NPM_TRUST_DIRECTORY: trustDir,
      CLICKTRAIL_RELEASE_SHA: commitSha,
      CLICKTRAIL_RELEASE_VERSION: '0.1.0-rc.4',
      ...overrides,
    },
  });
  rmSync(trustDir, { recursive: true, force: true });
  return result;
}

test('accepts a signed, current, exact release attestation and npm trust evidence', () => {
  const result = run(signedAttestation());
  assert.equal(result.status, 0, result.stderr);
});

test('rejects tampered signed claims', () => {
  const [, signature] = signedAttestation().split('.');
  const tampered = Buffer.from(JSON.stringify({ status: 'verified' })).toString('base64url');
  const result = run(`${tampered}.${signature}`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /signature is invalid/);
});

test('rejects stale attestations', () => {
  const issuedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  const expiresAt = new Date(Date.now() - 19 * 60_000).toISOString();
  const result = run(signedAttestation({ issuedAt, expiresAt, verifiedAt: issuedAt }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale/);
});

test('rejects attestations bound to another release', () => {
  const result = run(signedAttestation({ commitSha: 'b'.repeat(40) }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /authorized release/);
});

test('rejects mismatched npm trust evidence', () => {
  const trustDir = mkdtempSync(join(tmpdir(), 'clicktrail-trust-bad-'));
  for (const [index] of packages.entries()) {
    writeFileSync(join(trustDir, `${index}.json`), JSON.stringify([{ type: 'github', claims: {} }]));
  }
  const result = spawnSync(process.execPath, [verifier], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION: signedAttestation(),
      CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION_KEY: key,
      CLICKTRAIL_NPM_TRUST_DIRECTORY: trustDir,
      CLICKTRAIL_RELEASE_SHA: commitSha,
      CLICKTRAIL_RELEASE_VERSION: '0.1.0-rc.4',
    },
  });
  rmSync(trustDir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trusted publisher does not match/);
});

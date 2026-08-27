import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const expectedPackages = [
  '@vizuh/clicktrail-core',
  '@vizuh/clicktrail-browser',
  '@vizuh/clicktrail',
  '@vizuh/clicktrail-astro',
  '@vizuh/clicktrail-nuxt',
];
const expectedRepository = 'vizuh/clicktrail-js';
const expectedWorkflow = 'publish.yml';
const expectedEnvironment = 'npm';
const expectedPublisher = 'atroci';
const expectedVersion = '0.1.0-rc.4';
const maxAttestationAgeMs = 15 * 60 * 1000;

function fail(message) {
  console.error(`refusing: ${message}`);
  process.exit(1);
}

function exactPackages(value) {
  return (
    Array.isArray(value) &&
    value.length === expectedPackages.length &&
    value.every((name) => typeof name === 'string') &&
    [...value].sort().join('\n') === expectedPackages.slice().sort().join('\n')
  );
}

function trustDocumentMatches(document) {
  if (!Array.isArray(document) || document.length !== 1) return false;
  const entry = document[0];
  const claims = entry?.claims ?? {};
  return (
    entry?.type === 'github' &&
    (entry?.repository ?? claims.repository) === expectedRepository &&
    (entry?.file ?? claims.workflow_ref?.file) === expectedWorkflow &&
    (entry?.environment ?? claims.environment) === expectedEnvironment &&
    Array.isArray(entry.permissions) &&
    entry.permissions.includes('createPackage')
  );
}

function verifyNpmTrustDocuments() {
  const directory = process.env.CLICKTRAIL_NPM_TRUST_DIRECTORY;
  if (!directory) fail('npm trust list evidence directory is missing');
  for (const [index, packageName] of expectedPackages.entries()) {
    let document;
    try {
      document = JSON.parse(readFileSync(join(directory, `${index}.json`), 'utf8'));
    } catch {
      fail(`npm trust list evidence is missing for ${packageName}`);
    }
    if (!trustDocumentMatches(document)) {
      fail(`npm trusted publisher does not match ${packageName}`);
    }
  }
}

function verifySignedAttestation() {
  const raw = process.env.CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION;
  const key = process.env.CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION_KEY;
  if (!raw || !key) fail('signed trusted-publishing attestation is missing');

  const parts = raw.split('.');
  if (parts.length !== 2 || parts.some((part) => part === '')) {
    fail('signed trusted-publishing attestation is invalid');
  }
  const [encodedPayload, encodedSignature] = parts;
  let signature;
  let attestation;
  try {
    signature = Buffer.from(encodedSignature, 'base64url');
    attestation = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    fail('signed trusted-publishing attestation is invalid');
  }
  const expectedSignature = createHmac('sha256', key).update(encodedPayload).digest();
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(signature, expectedSignature)
  ) {
    fail('trusted-publishing attestation signature is invalid');
  }

  const issuedAt = Date.parse(attestation?.issuedAt ?? '');
  const expiresAt = Date.parse(attestation?.expiresAt ?? '');
  const verifiedAt = Date.parse(attestation?.verifiedAt ?? '');
  const now = Date.now();
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(verifiedAt) ||
    issuedAt > now + 30_000 ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > maxAttestationAgeMs ||
    now - issuedAt > maxAttestationAgeMs ||
    verifiedAt < issuedAt ||
    verifiedAt > expiresAt
  ) {
    fail('trusted-publishing attestation is stale or outside its validity window');
  }

  const releaseSha = process.env.CLICKTRAIL_RELEASE_SHA;
  const releaseVersion = process.env.CLICKTRAIL_RELEASE_VERSION;
  if (!/^[0-9a-f]{40}$/i.test(releaseSha ?? '') || releaseVersion !== expectedVersion) {
    fail('release SHA or version binding is missing');
  }
  if (
    attestation?.format !== 'clicktrail-trusted-publishing-v1' ||
    attestation.status !== 'verified' ||
    attestation.repository !== expectedRepository ||
    attestation.workflow !== expectedWorkflow ||
    attestation.environment !== expectedEnvironment ||
    attestation.publisher !== expectedPublisher ||
    attestation.source !== 'npmjs.com' ||
    attestation.command !== 'npm publish' ||
    attestation.provenance !== true ||
    attestation.verifiedBy !== expectedPublisher ||
    attestation.commitSha !== releaseSha ||
    attestation.releaseVersion !== releaseVersion ||
    attestation.verificationMethod !== 'npm trust list' ||
    !exactPackages(attestation.packages) ||
    attestation.configuration?.provider !== 'github-actions' ||
    attestation.configuration?.repository !== expectedRepository ||
    attestation.configuration?.workflow !== expectedWorkflow ||
    attestation.configuration?.environment !== expectedEnvironment ||
    attestation.configuration?.allowedAction !== 'npm publish'
  ) {
    fail('trusted-publishing attestation does not cover the authorized release');
  }
}

verifyNpmTrustDocuments();
verifySignedAttestation();

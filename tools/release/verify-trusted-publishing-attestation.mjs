const expectedPackages = [
  '@vizuh/clicktrail-core',
  '@vizuh/clicktrail-browser',
  '@vizuh/clicktrail',
  '@vizuh/clicktrail-astro',
  '@vizuh/clicktrail-nuxt',
];

function fail(message) {
  console.error(`refusing: ${message}`);
  process.exit(1);
}

const raw = process.env.CLICKTRAIL_TRUSTED_PUBLISHING_ATTESTATION;
if (!raw) fail('trusted-publishing attestation is missing');

let attestation;
try {
  attestation = JSON.parse(raw);
} catch {
  fail('trusted-publishing attestation is invalid');
}

if (
  !attestation ||
  attestation.status !== 'verified' ||
  attestation.repository !== 'vizuh/clicktrail-js' ||
  attestation.workflow !== 'publish.yml' ||
  attestation.environment !== 'npm' ||
  attestation.publisher !== 'atroci' ||
  attestation.source !== 'npmjs.com' ||
  attestation.command !== 'npm publish' ||
  attestation.provenance !== true ||
  typeof attestation.verifiedAt !== 'string' ||
  attestation.verifiedAt === '' ||
  !Array.isArray(attestation.packages) ||
  attestation.packages.length !== expectedPackages.length ||
  [...attestation.packages].sort().join('\n') !== expectedPackages.slice().sort().join('\n')
) {
  fail('trusted-publishing attestation does not cover the authorized release');
}

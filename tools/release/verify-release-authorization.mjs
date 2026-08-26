import { readFile } from 'node:fs/promises';

const expectedRelease = process.env.CLICKTRAIL_RELEASE_VERSION;
if (!expectedRelease) throw new Error('CLICKTRAIL_RELEASE_VERSION is required.');
const path = new URL('../../docs/internal/RELEASE-AUTHORIZATION.json', import.meta.url);
const record = JSON.parse(await readFile(path, 'utf8'));
const expectedWave = [
  '@vizuh/clicktrail-core',
  '@vizuh/clicktrail-browser',
  '@vizuh/clicktrail',
  '@vizuh/clicktrail-astro',
  '@vizuh/clicktrail-nuxt',
];
const fail = (message) => { throw new Error(`release authorization: ${message}`); };
if (record.schemaVersion !== 1) fail('unsupported schemaVersion.');
if (record.release !== expectedRelease) fail(`release ${record.release} does not match ${expectedRelease}.`);
if (record.decisionStatus !== 'approved') fail('owner decision is not approved.');
if (record.copyrightHolder !== 'Vizuh OÜ') fail('copyrightHolder is not Vizuh OÜ.');
if (record.publisher !== 'npm user atroci on behalf of Vizuh OÜ') fail('publisher is not authorized npm user atroci.');
for (const field of ['copyrightHolder', 'publisher', 'approvedBy', 'approvedAt']) {
  if (typeof record[field] !== 'string' || record[field].trim() === '') fail(`${field} is missing.`);
}
if (!Array.isArray(record.evidence) || record.evidence.length === 0 || record.evidence.some((item) => typeof item !== 'string' || item.trim() === '')) {
  fail('at least one evidence reference is required.');
}
if (JSON.stringify(record.firstWave) !== JSON.stringify(expectedWave)) fail('firstWave does not match the controlled five-package scope.');
for (const gate of ['B1', 'B2', 'B3', 'B4', 'GOV-001']) {
  if (!['approved', 'resolved'].includes(record.attestations?.[gate])) fail(`${gate} is not approved or resolved.`);
}
console.log(`release authorization verified for ${expectedRelease}`);

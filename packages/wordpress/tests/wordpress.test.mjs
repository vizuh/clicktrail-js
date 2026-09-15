import test from 'node:test'; import assert from 'node:assert/strict'; import { buildWordPressHiddenFields, extractWordPressAttribution } from '../src/index.js';
test('extracts attribution from form fields', () => assert.deepEqual(extractWordPressAttribution({ gclid: 'g', tenantId: 'bad' }), { gclid: 'g' }));
test('builds hidden fields for a server-owned form mapping', () => assert.deepEqual(buildWordPressHiddenFields({ fbclid: 'f' }), [{ name: 'clicktrail_fbclid', value: 'f' }]));

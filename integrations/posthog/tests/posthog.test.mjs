import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostHogPlugin, enrichPostHogEvent, toConversionEvent } from '../src/index.js';
test('enriches events without mutating input', () => { const event = { event: 'Lead', properties: {} }; const out = enrichPostHogEvent(event, { gclid: 'abc' }); assert.equal(out.properties.clicktrail_gclid, 'abc'); assert.deepEqual(event.properties, {}); });
test('plugin enriches using an attribution provider', () => assert.equal(createPostHogPlugin({ getAttribution: () => ({ fbclid: 'x' }) }).processEvent({ properties: {} }).properties.clicktrail_fbclid, 'x'));
test('normalizes a conversion event', () => assert.deepEqual(toConversionEvent({ uuid: 'evt_1', event: 'Purchase', timestamp: '2026-01-01', properties: { clicktrail_gclid: 'abc', revenue: 4 } }), { eventId: 'evt_1', eventName: 'Purchase', occurredAt: '2026-01-01', value: 4, currency: undefined, attribution: { gclid: 'abc' } }));

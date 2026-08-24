/**
 * Consent law for /conversation: a denied gate stops emission AND wipes any
 * stored journey id; journey ids are consent-gated like every identity key;
 * the main SDK's consent-denial wipe list covers ct_journey_id too.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_STORAGE_KEYS,
  JOURNEY_ID_KEY,
} from '@vizuh/clicktrail-browser';
import { createConversationTracker } from '../src/conversation/tracker.js';
import { createJourneyStore } from '../src/conversation/journey-store.js';
import { fakeAdapter, fakeHost, uuidFromByte } from './conversation-helpers.js';

describe('conversation consent gating', () => {
  it('denied gate: no events emitted, no journey id minted or persisted', () => {
    const host = fakeHost();
    const adapter = fakeAdapter();
    let deniedWrites = 0;
    const guarded = fakeAdapter();
    const origSet = guarded.set.bind(guarded);
    guarded.set = (k, v) => {
      deniedWrites++;
      return origSet(k, v);
    };
    const tracker = createConversationTracker({
      clickTrail: host,
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: guarded,
      consentGate: () => false,
    });
    tracker.conversationStarted({ conversationId: 'cw-1' });
    tracker.qualifyLead({ conversationId: 'cw-1' });
    tracker.handoffToHuman({ conversationId: 'cw-1' });
    expect(host.events).toHaveLength(0);
    expect(deniedWrites).toBe(0);
    expect(tracker.getJourneyId()).toBe('');
  });

  it('denied gate wipes a previously stored journey id', () => {
    const adapter = fakeAdapter();
    adapter.set(JOURNEY_ID_KEY, uuidFromByte(0x42));
    const tracker = createConversationTracker({
      clickTrail: fakeHost(),
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: adapter,
      consentGate: () => false,
    });
    expect(tracker.getJourneyId()).toBe('');
    expect(adapter.map.has(JOURNEY_ID_KEY)).toBe(false);
  });

  it('consent flipping from allowed to denied stops emission and clears state', () => {
    const host = fakeHost();
    const adapter = fakeAdapter();
    let consent = true;
    const tracker = createConversationTracker({
      clickTrail: host,
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: adapter,
      consentGate: () => consent,
    });
    tracker.conversationStarted({ conversationId: 'cw-1' });
    expect(host.events).toHaveLength(1);
    consent = false;
    tracker.conversationStarted({ conversationId: 'cw-2' });
    expect(host.events).toHaveLength(1);
    expect(adapter.map.has(JOURNEY_ID_KEY)).toBe(false);
  });

  it('JOURNEY_ID_KEY is covered by the main SDK consent-wipe key list', () => {
    expect(ATTRIBUTION_STORAGE_KEYS).toContain(JOURNEY_ID_KEY);
  });

  it('journey store: load-or-create over one adapter, clear() removes', () => {
    const adapter = fakeAdapter();
    const bytes = [new Uint8Array(16).fill(0x01), new Uint8Array(16).fill(0x02)];
    let call = 0;
    const store = createJourneyStore({
      adapter,
      randomBytes: () => bytes[call++]!,
    });
    const first = store.current();
    expect(first).toBe(uuidFromByte(0x01));
    expect(store.current()).toBe(first); // stable read-back, no regeneration
    store.clear();
    expect(store.current()).toBe(uuidFromByte(0x02)); // regenerated after wipe
  });
});

/**
 * createConversationTracker: deterministic event builders. Injected
 * clock/randomBytes/storage; events carry journey_id, visitor_id,
 * session_id, conversation_id, actor, timestamp, and version stamps;
 * journey_id is stable across simulated sessions.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ATTR_MESSAGE_ID,
  ACTOR_TYPE_VALUE_AGENT,
  ACTOR_TYPE_VALUE_HUMAN,
  EVENT_CONVERSATION_STARTED,
  EVENT_HUMAN_HANDOFF,
  EVENT_LEAD_QUALIFIED,
} from '../src/conventions/incubating.js';
import {
  ATTR_SESSION_ID,
  ATTR_VISITOR_ID,
  CLASSIFIER_VERSION,
  SCHEMA_VERSION,
} from '../src/conventions/stable.js';
import { JOURNEY_ID_KEY } from '../src/browser/storage.js';
import { createConversationTracker } from '../src/conversation/tracker.js';
import { fakeAdapter, fakeHost, uuidFromByte } from './conversation-helpers.js';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import { dataLayerDestination } from '../src/browser/transport.js';

function makeTracker(host = fakeHost(), adapter = fakeAdapter(), time = ['2026-08-23T10:00:00.000Z']) {
  let tick = 0;
  return {
    adapter,
    host,
    tracker: createConversationTracker({
      clickTrail: host,
      clock: () => time[Math.min(tick++, time.length - 1)]!,
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: adapter,
    }),
  };
}

describe('createConversationTracker events', () => {
  it('conversation.started carries ids, actor, timestamp, and version stamps', () => {
    const { tracker, host } = makeTracker();
    tracker.conversationStarted({
      conversationId: 'cw-77',
      messageId: 'm-1',
      actorId: 'contact-9',
    });
    expect(host.events).toHaveLength(1);
    const e = host.events[0]!;
    expect(e.name).toBe(EVENT_CONVERSATION_STARTED);
    expect(e.data[ATTR_JOURNEY_ID]).toBe(uuidFromByte(0x42));
    expect(e.data[ATTR_VISITOR_ID]).toBe('v-1');
    expect(e.data[ATTR_SESSION_ID]).toBe('s-1');
    expect(e.data[ATTR_CONVERSATION_ID]).toBe('cw-77');
    expect(e.data[ATTR_MESSAGE_ID]).toBe('m-1');
    expect(e.data['actor']).toEqual({ type: ACTOR_TYPE_VALUE_HUMAN, id: 'contact-9' });
    expect(e.data['event_time']).toBe('2026-08-23T10:00:00.000Z');
  });

  it('lead.qualified and handoff.human emit the incubating names with actor overrides', () => {
    const { tracker, host } = makeTracker();
    tracker.qualifyLead({
      conversationId: 'cw-77',
      actorType: ACTOR_TYPE_VALUE_AGENT,
      actorId: 'qualifier-bot',
    });
    tracker.handoffToHuman({ conversationId: 'cw-77', actorType: 'system' });
    expect(host.events.map((e) => e.name)).toEqual([EVENT_LEAD_QUALIFIED, EVENT_HUMAN_HANDOFF]);
    expect(host.events[0]!.data['actor']).toEqual({
      type: ACTOR_TYPE_VALUE_AGENT,
      id: 'qualifier-bot',
    });
    expect(host.events[1]!.data['actor']).toEqual({ type: 'system' });
  });

  it('journey_id persists under ct_journey_id and survives a NEW session (simulated)', () => {
    const adapter = fakeAdapter();
    const first = fakeHost({ visitorId: 'v-1', sessionId: 'session-A', sessionNumber: '1' });
    const t1 = createConversationTracker({
      clickTrail: first,
      clock: () => '2026-08-23T10:00:00.000Z',
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: adapter,
    });
    t1.conversationStarted({ conversationId: 'cw-1' });
    const journeyFirst = first.events[0]!.data[ATTR_JOURNEY_ID];
    expect(adapter.map.get(JOURNEY_ID_KEY)).toBe(journeyFirst);

    // Simulated later session: different session id + number, same store.
    const later = fakeHost({ visitorId: 'v-1', sessionId: 'session-B', sessionNumber: '2' });
    const t2 = createConversationTracker({
      clickTrail: later,
      clock: () => '2026-08-24T10:00:00.000Z',
      randomBytes: () => new Uint8Array(16).fill(0x99),
      storage: adapter,
    });
    t2.conversationStarted({ conversationId: 'cw-2' });
    expect(later.events[0]!.data[ATTR_JOURNEY_ID]).toBe(journeyFirst);
    expect(later.events[0]!.data[ATTR_SESSION_ID]).toBe('session-B');
  });

  it('clearJourney() wipes the stored key; next emission mints a fresh id', () => {
    const { tracker, host, adapter } = makeTracker();
    tracker.conversationStarted({ conversationId: 'cw-1' });
    const firstId = host.events[0]!.data[ATTR_JOURNEY_ID];
    tracker.clearJourney();
    expect(adapter.map.has(JOURNEY_ID_KEY)).toBe(false);
    let call = 0;
    // fresh randomness for the regenerated id
    const t2 = createConversationTracker({
      clickTrail: host,
      randomBytes: () => new Uint8Array(16).fill(0x07 + call++),
      storage: adapter,
    });
    t2.conversationStarted({ conversationId: 'cw-2' });
    expect(host.events[1]!.data[ATTR_JOURNEY_ID]).not.toBe(firstId);
  });

  it('extra data merges into the bag without displacing core identity fields', () => {
    const { tracker, host } = makeTracker();
    tracker.conversationStarted({
      conversationId: 'cw-3',
      extra: { inbox_id: 'inbox-2', [ATTR_JOURNEY_ID]: 'hijack' },
    });
    const e = host.events[0]!;
    expect(e.data['inbox_id']).toBe('inbox-2');
    expect(e.data[ATTR_JOURNEY_ID]).toBe(uuidFromByte(0x42));
  });
});


describe('conversation tracker x real createClickTrail', () => {
  const BYTES = [new Uint8Array(16).fill(0x01), new Uint8Array(16).fill(0x02), new Uint8Array(16).fill(0x42)];
  let call = 0;

  function wiredInstance() {
    let tick = 0;
    const dl = dataLayerDestination();
    const ct = createClickTrail({
      destinations: [dl],
      now: () => '2026-08-23T11:00:00.000Z',
      storage: {
        primaryAdapter: fakeAdapter(),
        mirrorAdapter: fakeAdapter(),
        randomBytes: () => BYTES[Math.min(call++, BYTES.length - 1)]!,
        nowMs: () => 0,
      },
    });
    ct.start();
    const tracker = createConversationTracker({
      clickTrail: ct,
      clock: () => `2026-08-23T10:00:0${tick++}.000Z`,
      randomBytes: () => new Uint8Array(16).fill(0x42),
      storage: fakeAdapter(),
    });
    return { ct, dl, tracker };
  }

  it('events delivered through track() carry version stamps + full payload', () => {
    const { dl, tracker } = wiredInstance();
    tracker.conversationStarted({ conversationId: 'cw-int', actorId: 'c-1' });
    const e = dl.getArray()[0] as Record<string, unknown>;
    expect(e['event_name']).toBe(EVENT_CONVERSATION_STARTED);
    expect(e['schema_version']).toBe(SCHEMA_VERSION);
    expect(e['classifier_version']).toBe(CLASSIFIER_VERSION);
    expect(e[ATTR_JOURNEY_ID]).toBe(uuidFromByte(0x42));
    expect(e[ATTR_VISITOR_ID]).toBe(uuidFromByte(0x01));
    expect(e[ATTR_SESSION_ID]).toBe(uuidFromByte(0x02));
    expect(e['gclid']).toBe(''); // canonical payload carries no click IDs here
    expect((e['actor'] as { type: string }).type).toBe(ACTOR_TYPE_VALUE_HUMAN);
  });
});

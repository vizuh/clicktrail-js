/**
 * Journey-aware conversation tracking (`/conversation`).
 *
 * Emits stamped journey events (`conversation.started`, `lead.qualified`,
 * `handoff.human` — incubating names) through the host ClickTrail instance's
 * `track()` lane, so every event carries the canonical attribution payload
 * plus the schema_version/classifier_version stamps from core.
 *
 * PRIVACY LAW: message/chat CONTENT is never captured by default
 * (captureContent === false, metadata only). Enabling capture REQUIRES a
 * redact fn at construction time — the factory throws otherwise, so raw
 * content can never silently reach storage or transport.
 *
 * Determinism seams: clock, randomness, storage adapter, and consent gate
 * enter as injected dependencies. Defaults are lazy seams resolved only at
 * emission time (never at import), matching the /browser layer.
 */
import {
  ACTOR_TYPE_VALUE_HUMAN,
  ATTR_CONVERSATION_ID,
  ATTR_JOURNEY_ID,
  ATTR_MESSAGE_ID,
  EVENT_CONVERSATION_STARTED,
  EVENT_HUMAN_HANDOFF,
  EVENT_LEAD_QUALIFIED,
} from '../conventions/incubating.js';
import type { ActorType } from '../conventions/incubating.js';
import { ATTR_SESSION_ID, ATTR_VISITOR_ID } from '../conventions/stable.js';
import type { RandomBytesFn } from '../browser/identity.js';
import type { StorageAdapter } from '../browser/storage.js';
import { mirrorStorage } from '../browser/storage.js';
import type { AttributionPayload } from '../core/types.js';
import { createJourneyStore } from './journey-store.js';
import type { JourneyStore } from './journey-store.js';

/**
 * Minimal structural contract on the host ClickTrail instance. The full
 * ClickTrailInstance satisfies this; tests may inject a fake.
 */
export interface ConversationHost {
  track(eventName: string, data?: Record<string, unknown>): void;
  getData(): AttributionPayload;
  getSession(): { visitorId: string; sessionId: string; sessionNumber: string };
}

export interface ConversationTrackerConfig {
  /** Host ClickTrail instance events are emitted through. */
  clickTrail: ConversationHost;
  /** Injected clock returning millisecond ISO-8601 strings. */
  clock?: () => string;
  /**
   * Injected random-byte source for journey-id generation. Default:
   * crypto.getRandomValues (resolved lazily at first use, never at import).
   */
  randomBytes?: RandomBytesFn;
  /**
   * Journey persistence adapter. Default: localStorage-backed mirror with
   * no retention bound (journey ids are correlation keys, not payloads).
   */
  storage?: StorageAdapter;
  /**
   * Consent gate for JOURNEY STATE and emission. A denied gate drops every
   * event and wipes any stored journey id. Omit only when the host handles
   * consent elsewhere (the clickTrail instance's own gate still applies to
   * delivery).
   */
  consentGate?: () => boolean;
  /**
   * PRIVACY LAW (default FALSE): when false, any `content` passed to an
   * event is DROPPED — metadata only. When true, config.redact is REQUIRED;
   * construction throws without it and captured content always passes
   * through redact() before inclusion.
   */
  captureContent?: boolean;
  /** Required when captureContent is true. Applied before any storage/send. */
  redact?: (content: string) => string;
}

/** Actor stamp carried on every journey event ({ type, id? }). */
export interface JourneyActor {
  type: ActorType;
  id?: string;
}

export interface JourneyEventInput {
  /** Chatwoot-style conversation identifier. */
  conversationId: string;
  /** Optional message-level identifier. */
  messageId?: string;
  /** Actor type. Default: ACTOR_TYPE_VALUE_HUMAN. */
  actorType?: ActorType;
  /** Actor identifier (agent name, contact id, ...). */
  actorId?: string;
  /** Message/chat content. DROPPED unless captureContent was enabled. */
  content?: string;
  /** Extra caller data merged into the event bag before version stamps. */
  extra?: Record<string, unknown>;
}

export interface ConversationTracker {
  /** Emit `conversation.started` (incubating name). */
  conversationStarted(input: JourneyEventInput): void;
  /** Emit `lead.qualified` (incubating name). */
  qualifyLead(input: JourneyEventInput): void;
  /** Emit `handoff.human` (incubating name). */
  handoffToHuman(input: JourneyEventInput): void;
  /** Current durable journey id ('' while consent denied). */
  getJourneyId(): string;
  /** Wipe the stored journey id immediately (withdrawal support). */
  clearJourney(): void;
}

/** Injected-seam default: WebCrypto random bytes, resolved lazily. */
const defaultRandomBytes: RandomBytesFn = (byteLength) => {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto?.getRandomValues) {
    throw new Error(
      'clicktrail/conversation: no crypto.getRandomValues available; inject randomBytes.',
    );
  }
  return crypto.getRandomValues(new Uint8Array(byteLength));
};

export function createConversationTracker(
  config: ConversationTrackerConfig,
): ConversationTracker {
  const captureContent = config.captureContent ?? false;

  // PRIVACY LAW: fail closed at construction — never store raw content.
  if (captureContent && !config.redact) {
    throw new Error(
      'clicktrail/conversation: captureContent=true requires a redact fn. ' +
        'Raw conversation content is never stored or sent.',
    );
  }

  const redact = config.redact;
  const clickTrail = config.clickTrail;
  const consentGate = config.consentGate;
  const clock = config.clock;

  const allowed = (): boolean => !consentGate || consentGate();

  const journey: JourneyStore = createJourneyStore({
    adapter: config.storage ?? mirrorStorage(),
    randomBytes: config.randomBytes ?? defaultRandomBytes,
    allowed,
  });

  const buildActor = (input: JourneyEventInput): JourneyActor => {
    const actor: JourneyActor = { type: input.actorType ?? ACTOR_TYPE_VALUE_HUMAN };
    if (input.actorId !== undefined && input.actorId !== '') actor.id = input.actorId;
    return actor;
  };

  const emit = (eventName: string, input: JourneyEventInput): void => {
    if (!allowed()) {
      // Denied consent leaves NO journey state behind and emits nothing.
      journey.clear();
      return;
    }
    const snap = clickTrail.getSession();
    // Caller extra merges FIRST: journey/conversation/actor/timestamp keys
    // below always win, so hosts cannot clobber a stamped identity field.
    const data: Record<string, unknown> = { ...(input.extra ?? {}) };
    data[ATTR_JOURNEY_ID] = journey.current();
    data[ATTR_CONVERSATION_ID] = input.conversationId;
    data['actor'] = buildActor(input);
    if (snap.visitorId !== '') data[ATTR_VISITOR_ID] = snap.visitorId;
    if (snap.sessionId !== '') data[ATTR_SESSION_ID] = snap.sessionId;
    if (input.messageId !== undefined && input.messageId !== '') {
      data[ATTR_MESSAGE_ID] = input.messageId;
    }
    if (clock) data['event_time'] = clock();
    if (
      captureContent &&
      redact &&
      input.content !== undefined &&
      input.content !== ''
    ) {
      data['content'] = redact(input.content);
    }
    // Delivery goes through the host's track() lane: canonical payload +
    // host consent gate + schema/classifier stamps all apply there.
    clickTrail.track(eventName, data);
  };

  return {
    conversationStarted: (input) => emit(EVENT_CONVERSATION_STARTED, input),
    qualifyLead: (input) => emit(EVENT_LEAD_QUALIFIED, input),
    handoffToHuman: (input) => emit(EVENT_HUMAN_HANDOFF, input),
    getJourneyId: () => journey.current(),
    clearJourney: () => journey.clear(),
  };
}

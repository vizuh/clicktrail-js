/**
 * createClickTrail — browser SDK entry point.
 *
 * ZERO side effects until `.start()`: safe to import and construct in SSR.
 * All effects (clock, network, dataLayer) enter as injected dependencies or
 * are created inside start()-invoked destination lifecycle methods.
 */
import { DIAGNOSTIC_CODES, nullDiagnosticSink } from '../core/diagnostics.js';
import type { DiagnosticSink } from '../core/diagnostics.js';
import { emptyAttribution } from '../core/merge.js';
import type { ParsedTouch } from '../core/types.js';
import type { AttributionPayload } from '../core/types.js';
import { mergeAttributionTouch } from '../core/merge.js';
import { createIdentityStore } from './identity.js';
import type { IdentityStore, RandomBytesFn } from './identity.js';
import {
  loadAttributionPayload,
  saveAttributionPayload,
} from './payload-store.js';
import type { IdentitySnapshot } from './identity.js';
import {
  clearAttributionStorage,
  cookieStorage,
  mirrorStorage,
} from './storage.js';
import type {
  CookieAttributes,
  StorageAdapter,
} from './storage.js';
import type { Destination } from './transport.js';
import type { SessionSnapshot } from './global-adapter.js';
import { buildEventPayload, type ClickTrailEvent } from './serialize.js';

export type DiagnosticsLevel = 'silent' | 'warn';

export interface ClickTrailConfig {
  /** Event destinations. Started/flushed by the instance lifecycle. */
  destinations: readonly Destination[];
  /**
   * Consent gate, evaluated per capture attempt. When it returns false,
   * nothing is delivered and a consent diagnostic is reported once per gate
   * denial streak. Omit only when the host handles consent elsewhere.
   */
  consentGate?: () => boolean;
  /** Injected clock returning ISO-8601 strings; stamps `event_time`. */
  now?: () => string;
  /** Diagnostics level. Default 'silent' (nothing reported). */
  diagnosticsLevel?: DiagnosticsLevel;
  /** Where diagnostics go when level is 'warn'. Default: console.warn sink. */
  diagnosticSink?: DiagnosticSink;
  /**
   * First-party persistence. When present, start() hydrates the stored
   * payload, owns visitor/session identity, and persists every merge.
   * Nothing touches storage before start() (zero side effects).
   */
  storage?: ClickTrailStorageConfig;
}

export interface ClickTrailStorageConfig {
  /** Retention days; ties the localStorage mirror expiry to retention. */
  retentionDays?: number;
  /** Attributes injected into every attribution cookie write. */
  cookieAttrs?: CookieAttributes;
  /**
   * Adapter overrides (tests / custom stores). Defaults: first-party
   * cookie (`attribution`) + expiry-metadata localStorage mirror.
   */
  primaryAdapter?: StorageAdapter;
  mirrorAdapter?: StorageAdapter;
  /**
   * Injected random-byte source for UUID v4 identity generation
   * (crypto.getRandomValues by default). Never Math.random.
   */
  randomBytes?: RandomBytesFn;
  /** Injected wall clock (ms) for session rolls + mirror expiry. */
  nowMs?: () => number;
}

export interface ClickTrailInstance {
  /** Begin delivering events to destinations. Idempotent. */
  start(): void;
  /** Flush buffered events and stop delivering. Idempotent. */
  stop(): void;
  isStarted(): boolean;
  /** Track a named event with optional data. No-op before start(). */
  track(eventName: string, data?: Record<string, unknown>): void;
  /** Feed a parsed attribution signal into the stored payload. */
  mergeParsedTouch(touch: ParsedTouch): void;
  /** Full canonical flat payload (defensive copy). */
  getData(): AttributionPayload;
  /** One field by canonical flat key (`ft_source`, `gclid`, ...). */
  getField(key: string): string;
  /** Reset all stored attribution state. */
  clearData(): void;
  getSession(): SessionSnapshot;
}

const warnConsoleSink: DiagnosticSink = {
  report: (d) => console.warn(`[clicktrail:${d.code}] ${d.message}`),
};

function resolveSink(config: ClickTrailConfig): DiagnosticSink {
  if (config.diagnosticSink) return config.diagnosticSink;
  if ((config.diagnosticsLevel ?? 'silent') === 'warn') return warnConsoleSink;
  return nullDiagnosticSink;
}

/** Injected-seam default: WebCrypto random bytes. Only invoked post-start(). */
const defaultRandomBytes: RandomBytesFn = (byteLength) => {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto?.getRandomValues) {
    throw new Error(
      'clicktrail: no crypto.getRandomValues available; inject config.storage.randomBytes.',
    );
  }
  return crypto.getRandomValues(new Uint8Array(byteLength));
};

export function createClickTrail(config: ClickTrailConfig): ClickTrailInstance {
  const destinations = [...config.destinations];
  const now = config.now;
  const consentGate = config.consentGate;
  const sink = resolveSink(config);

  let started = false;
  let payload: AttributionPayload = emptyAttribution();
  let consentDeniedReported = false;

  // Storage wiring is lazy: nothing here runs until start().
  const storageCfg = config.storage;
  let adapters: { primary: StorageAdapter; mirror: StorageAdapter } | null = null;
  let identity: IdentityStore | null = null;

  const initStorage = (): void => {
    if (!storageCfg || adapters !== null) return;
    const nowMs = storageCfg.nowMs ?? (() => Date.now());
    const primary =
      storageCfg.primaryAdapter ??
      cookieStorage(
        storageCfg.cookieAttrs !== undefined
          ? { attrs: storageCfg.cookieAttrs }
          : {},
      );
    const mirror =
      storageCfg.mirrorAdapter ??
      mirrorStorage({
        ...(storageCfg.retentionDays !== undefined
          ? { retentionDays: storageCfg.retentionDays }
          : {}),
        nowMs,
      });
    adapters = { primary, mirror };
    identity = createIdentityStore({
      adapter: mirror,
      randomBytes: storageCfg.randomBytes ?? defaultRandomBytes,
      nowMs,
    });
  };

  const persistPayload = (): void => {
    if (!adapters) return;
    saveAttributionPayload(adapters.primary, payload);
    saveAttributionPayload(adapters.mirror, payload);
  };

  const snapshotFromIdentity = (snap: IdentitySnapshot): SessionSnapshot => ({
    visitorId: snap.visitorId,
    sessionId: snap.sessionId,
    sessionNumber: String(snap.sessionNumber),
  });

  const consentAllows = (): boolean => {
    if (!consentGate || consentGate()) {
      consentDeniedReported = false;
      return true;
    }
    if (!consentDeniedReported) {
      consentDeniedReported = true;
      sink.report({
        code: DIAGNOSTIC_CODES.CONSENT_DENIED_CAPTURE_ATTEMPTED,
        level: 'warn',
        message: 'Capture attempted while consent denied; event dropped.',
      });
      // Contract: consent denied clears ALL attribution storage — the
      // in-memory payload plus every cookie/mirror/identity key, including
      // legacy-named surfaces (portable prompt "Storage rules";
      // DATA-MODEL.md:122, :246).
      payload = emptyAttribution();
      if (adapters) {
        clearAttributionStorage(adapters.primary, adapters.mirror);
        identity?.clear();
      }
    }
    return false;
  };

  return {
    start() {
      if (started) return;
      started = true;
      for (const dest of destinations) dest.start?.();
      if (storageCfg) {
        initStorage();
        // Hydrate persisted attribution: server-readable cookie first,
        // expiry-metadata mirror as fallback for cached/dynamic pages.
        const stored = loadAttributionPayload(adapters!.primary);
        payload =
          Object.keys(stored).length > 0
            ? { ...emptyAttribution(), ...stored }
            : { ...emptyAttribution(), ...loadAttributionPayload(adapters!.mirror) };
        persistPayload();
      }
    },

    stop() {
      if (!started) return;
      for (const dest of destinations) void Promise.resolve(dest.flush?.());
      started = false;
    },

    isStarted: () => started,

    track(eventName, data) {
      if (!started) {
        sink.report({
          code: 'track_before_start',
          level: 'warn',
          message: `track('${eventName}') ignored: SDK not started.`,
        });
        return;
      }
      if (!consentAllows()) return;

      const eventData: Record<string, unknown> = {};
      if (now && data?.['event_time'] === undefined) eventData.event_time = now();
      Object.assign(eventData, data);
      const event: ClickTrailEvent = buildEventPayload(payload, eventName, eventData);
      for (const dest of destinations) dest.deliver(event);
    },

    mergeParsedTouch(touch) {
      payload = mergeAttributionTouch(payload, touch);
      // Zero side effects until start(): pre-start merges stay in memory
      // and are flushed to storage by the hydration step in start().
      if (started && adapters) persistPayload();
    },

    getData: () => ({ ...payload }),

    getField(key) {
      return payload[key] ?? '';
    },

    clearData() {
      payload = emptyAttribution();
      if (started && adapters) {
        clearAttributionStorage(adapters.primary, adapters.mirror);
        identity?.clear();
      }
    },

    getSession(): SessionSnapshot {
      // Identifiers are created only while consent allows (DATA-MODEL.md:246);
      // a denied gate yields an empty snapshot instead of regenerating.
      if (started && identity && (!consentGate || consentGate())) {
        return snapshotFromIdentity(identity.current());
      }
      return {
        visitorId: payload['visitor_id'] ?? '',
        sessionId: payload['session_id'] ?? '',
        sessionNumber: payload['session_number'] ?? '',
      };
    },
  };
}

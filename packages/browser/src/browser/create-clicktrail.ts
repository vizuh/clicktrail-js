/**
 * createClickTrail — browser SDK entry point.
 *
 * ZERO side effects until `.start()`: safe to import and construct in SSR.
 * All effects (clock, network, dataLayer) enter as injected dependencies or
 * are created inside start()-invoked destination lifecycle methods.
 */
import { DIAGNOSTIC_CODES, nullDiagnosticSink } from '@vizuh/clicktrail-core';
import type { DiagnosticSink } from '@vizuh/clicktrail-core';
import { emptyAttribution } from '@vizuh/clicktrail-core';
import type { ParsedTouch } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';
import { mergeAttributionTouch } from '@vizuh/clicktrail-core';
import { createIdentityStore } from './identity.js';
import type { IdentityStore, RandomBytesFn } from './identity.js';
import {
  loadAttributionPayload,
  saveAttributionPayload,
} from './payload-store.js';
import type { IdentitySnapshot } from './identity.js';
import {
  applyBrowserIdentifiers,
  collectBrowserIdsFromCookies,
  parseCookieMap,
} from './browser-ids.js';
import {
  clearAttributionStorage,
  cookieStorage,
  defaultCookieJar,
  mirrorStorage,
} from './storage.js';
import type {
  CookieAttributes,
  CookieJar,
  StorageAdapter,
} from './storage.js';
import type { Destination } from './transport.js';
import type { SessionSnapshot } from './global-adapter.js';
import { buildEventPayload, type ClickTrailEvent, type MarketingTrailContext } from './serialize.js';
import {
  createFormInjector,
  defaultFormDocument,
  defaultObserverFactory,
} from './form-injection.js';
import type {
  FormDomDocument,
  FormInjector,
  ObserverFactory,
} from './form-injection.js';
import {
  CONTINUATION_FIELDS,
  DEFAULT_TOKEN_PARAM as DEFAULT_TOKEN_PARAM_FALLBACK,
  consumeLandingToken,
  createLinkDecorator,
  defaultHmacSign,
  defaultHmacVerify,
  defaultLinkDocument,
  defaultLocationSeam,
  encodeContinuationToken,
} from './link-decoration.js';
import type {
  LinkDecorator,
  LinkDomDocument,
  LocationHistorySeam,
  SignFn,
  VerifyFn,
} from './link-decoration.js';
import { CANONICAL_KEY_SET } from './payload-store.js';

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
  /** Consent snapshot copied into each normalized marketing trail envelope. */
  consentState?: () => {
    analytics?: boolean;
    advertising?: boolean;
    marketing?: boolean;
  };
  /** Optional routing identifiers for the normalized envelope. */
  workspaceId?: string;
  siteId?: string;
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
  /**
   * Hidden-field form injection. Default: OFF (opt-in). All DOM effects
   * happen after start(); the observer lifecycle is tied to stop().
   */
  forms?: ClickTrailFormsConfig;
  /**
   * Cross-domain continuity (approved-domain link decoration + landing
   * token consumption). Default: OFF (opt-in). Requires `storage` when the
   * default WebCrypto signer is used so the signing key can persist.
   */
  crossDomain?: ClickTrailCrossDomainConfig;
}

export interface ClickTrailStorageConfig {
  /** localStorage mirror retention in whole days (1-400). Default: 90. */
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
  /**
   * Cookie jar read ONLY for consent-gated browser-ID collection
   * (_fbp/_ttp/li_gc/_ga* cookies; RULING A part b, runtime findings
   * 2026-08-23). Default: document.cookie via defaultCookieJar().
   */
  browserIdCookieJar?: CookieJar;
}

export type ClickTrailFormsConfig =
  | {
      /** Canonical payload keys to inject. Default: DEFAULT_FORM_FIELDS summary set. */
      fields?: readonly string[];
      /** Overwrite existing NON-EMPTY hidden inputs. Default: false (preserve). */
      overwrite?: boolean;
      /** Injectable document root (tests / non-DOM hosts). Default: document wrapper. */
      doc?: FormDomDocument;
      /** Observer factory for late-added forms; null disables watching. Default: MutationObserver. */
      observer?: ObserverFactory | null;
    }
  | false;

export type ClickTrailCrossDomainConfig = {
  /** Approved target domains, exact-suffix matched (example.com, shop.example.com). */
  domains: readonly string[];
  /** Continuation-token URL parameter. Default: 'ct_token'. */
  tokenParam?: string;
  /** Skip anchors whose URL already carries the token. Default: true. */
  skipSignedUrls?: boolean;
  /**
   * Injected signer for continuation tokens. Default: WebCrypto HMAC-SHA256
   * with a per-installation random key persisted in the storage adapters
   * (requires config.storage to be present for persistence).
   */
  sign?: SignFn;
  /** Injected verifier matching `sign`. Default: WebCrypto HMAC-SHA256 verify. */
  verify?: VerifyFn;
  /** Injectable location/history seam. Default: globalThis wrapper. */
  location?: LocationHistorySeam;
  /** Injectable document root for anchor decoration (tests / SSR). */
  doc?: LinkDomDocument;
  /** Observer factory for late-added links; null disables watching. */
  observer?: ObserverFactory | null;
} | false;

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
  /**
   * Merge a previously stored canonical payload (legacy import / migration).
   * Only canonical keys with non-empty string values are adopted; incoming
   * values win on conflicts. Persists post-start, in-memory pre-start.
   */
  hydrateStoredPayload(payload: AttributionPayload): void;
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
  if (destinations.some((destination) => !destination || typeof destination.clear !== 'function')) {
    throw new TypeError('clicktrail: every destination must implement clear() for consent-safe withdrawal.');
  }
  const now = config.now;
  const consentGate = config.consentGate;
  const sink = resolveSink(config);
  let eventSequence = 0;

  const clearDestinationQueues = (): void => {
    for (const dest of destinations) dest.clear();
  };

  let started = false;
  let payload: AttributionPayload = emptyAttribution();
  let consentDeniedReported = false;
  const consentIsGranted = (): boolean => !consentGate || consentGate();

  // Storage wiring is lazy: nothing here runs until start().
  const storageCfg = config.storage;
  let adapters: { primary: StorageAdapter; mirror: StorageAdapter } | null = null;
  let identity: IdentityStore | null = null;
  let formInjector: FormInjector | null = null;
  let linkDecorator: LinkDecorator | null = null;

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
    if (!adapters || !consentIsGranted()) return;
    saveAttributionPayload(adapters.primary, payload);
    if (!consentAllows()) return;
    saveAttributionPayload(adapters.mirror, payload);
  };

  /**
   * RULING A part b (runtime findings 2026-08-23): cookie-derived browser
   * IDs (_fbp/_fbc/_ttp/li_gc/_ga*) are collected ONLY here, behind the
   * consent gate — a denied gate means NO cookie read at all. Merged
   * top-level with the newest-non-empty-wins law (plugin
   * mergeTopLevelIdentifiers) and persisted like any other payload change.
   */
  const mergeCookieBrowserIds = (): void => {
    if (consentGate && !consentGate()) return;
    let ids: Record<string, string>;
    try {
      const jar = storageCfg?.browserIdCookieJar ?? defaultCookieJar();
      ids = collectBrowserIdsFromCookies(parseCookieMap(jar.read()));
    } catch {
      return; // Deterministic no-op: cookie reads must never break capture.
    }
    const merged = applyBrowserIdentifiers(payload, ids);
    if (merged !== payload) {
      payload = merged;
      if (started && adapters) persistPayload();
    }
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
      clearDestinationQueues();
    }
    return false;
  };

  const generateEventId = (): string => {
    const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (crypto?.randomUUID) return `evt_${crypto.randomUUID()}`;
    eventSequence += 1;
    return `evt_${Date.now().toString(36)}_${eventSequence}`;
  };

  const isLeadEvent = (eventName: string): boolean =>
    ['lead', 'lead.submitted', 'lead_submitted', 'form_submission'].includes(eventName);

  /**
   * Cross-domain wiring (work-queue #5): landing-token consumption + outbound
   * link decoration. Resolves all default seams lazily here so nothing runs
   * before start(). Consumption is async fire-and-forget; a rejected promise
   * is swallowed deterministically (consumption never throws).
 */
  function wireCrossDomain(instance: ClickTrailInstance): void {
    const crossCfg = config.crossDomain;
    if (!crossCfg) return;
    if ((!crossCfg.sign || !crossCfg.verify) && !storageCfg) {
      throw new Error(
        'clicktrail: crossDomain default sign/verify requires config.storage; ' +
          'inject both sign and verify for externally provisioned keys.',
      );
    }
    const nowMs = storageCfg?.nowMs ?? (() => Date.now());
    const randomBytes = storageCfg?.randomBytes ?? defaultRandomBytes;
    const adapterList =
      adapters !== null ? [adapters.primary, adapters.mirror] : [];
    const sign = crossCfg.sign ?? defaultHmacSign(adapterList, randomBytes);
    const verify = crossCfg.verify ?? defaultHmacVerify(adapterList);
    const seam = crossCfg.location ?? defaultLocationSeam();
    const nowIso = () =>
      config.now ? config.now() : new Date(nowMs()).toISOString();

    // Landing consumption first: strip + merge before decorating outbound
    // links with a token that would carry pre-continuity state.
    if (seam) {
      void consumeLandingToken({
        seam,
        tokenParam: crossCfg.tokenParam ?? DEFAULT_TOKEN_PARAM_FALLBACK,
        verify,
        nowMs,
        nowIso,
        consentAllowed: () => !consentGate || consentGate(),
        mergeTouch: (touch) => instance.mergeParsedTouch(touch),
      }).catch(() => {
        // Deterministic no-op on unexpected failure; never breaks start().
      });
    }

    const doc = crossCfg.doc ?? defaultLinkDocument() ?? undefined;
    linkDecorator = createLinkDecorator({
      domains: crossCfg.domains,
      tokenParam: crossCfg.tokenParam,
      skipSignedUrls: crossCfg.skipSignedUrls,
      doc,
      observer: crossCfg.observer,
      consentAllowed: () => !consentGate || consentGate(),
      getBaseUrl: () => seam?.href() ?? '',
      getToken: async () => {
        // Consent-denied gates yield empty snapshots -> empty token -> no
        // decoration (identity exists only while consent allows).
        const snap = instance.getSession();
        if (!snap.visitorId && !snap.sessionId) return '';
        const attribution: Record<string, string> = {};
        for (const key of CONTINUATION_FIELDS) {
          const value = payload[key];
          if (value) attribution[key] = value;
        }
        try {
          return await encodeContinuationToken({
            visitorId: snap.visitorId,
            sessionId: snap.sessionId,
            attribution,
            nowMs: nowMs(),
            sign,
          });
        } catch {
          return ''; // oversized/failed token: deterministic skip
        }
      },
    });
    linkDecorator.start();
  }

  const instance: ClickTrailInstance = {
    start() {
      if (started) return;
      started = true;
      try {
        for (const dest of destinations) dest.start?.();
        if (storageCfg) {
          initStorage();
          if (consentAllows()) {
            // Hydrate persisted attribution: server-readable cookie first,
            // expiry-metadata mirror as fallback for cached/dynamic pages.
            const stored = consentIsGranted()
              ? loadAttributionPayload(adapters!.primary)
              : {};
            const fallback = consentIsGranted()
              ? loadAttributionPayload(adapters!.mirror)
              : {};
            if (consentAllows()) {
              payload = Object.keys(stored).length > 0
                ? { ...emptyAttribution(), ...stored }
                : { ...emptyAttribution(), ...fallback };
              if (consentAllows()) persistPayload();
            }
            if (!consentIsGranted()) {
              payload = emptyAttribution();
              clearAttributionStorage(adapters!.primary, adapters!.mirror);
              identity?.clear();
            }
          } else {
            payload = emptyAttribution();
            clearAttributionStorage(adapters!.primary, adapters!.mirror);
            identity?.clear();
          }
        }
        if (!consentAllows()) {
          payload = emptyAttribution();
          clearDestinationQueues();
        } else {
          // Consent-gated cookie-derived browser IDs (RULING A part b).
          mergeCookieBrowserIds();
          if (adapters && consentAllows()) persistPayload();
        }
        if (config.forms) {
          const { fields, overwrite, observer } = config.forms;
          formInjector = createFormInjector({
            fields,
            overwrite,
            observer,
            consentAllowed: () => !consentGate || consentGate(),
            getPayload: () => payload,
            getIdentity: () => instance.getSession(),
            doc: config.forms.doc ?? defaultFormDocument() ?? undefined,
          });
          formInjector.start();
        }
        if (config.crossDomain) {
          wireCrossDomain(instance);
        }
      } catch (error) {
        formInjector?.stop();
        formInjector = null;
        linkDecorator?.stop();
        linkDecorator = null;
        started = false;
        throw error;
      }
    },

    stop() {
      if (!started) return;
      if (consentAllows()) {
        for (const dest of destinations) {
          try {
            void Promise.resolve(dest.flush?.()).catch(() => {
              try {
                sink.report({
                  code: 'destination_flush_failed',
                  level: 'warn',
                  message: `Destination '${dest.name}' failed to flush during stop().`,
                });
              } catch {
                // Host diagnostics are best effort and must not break cleanup.
              }
            });
          } catch {
            try {
              sink.report({
                code: 'destination_flush_failed',
                level: 'warn',
                message: `Destination '${dest.name}' failed to flush during stop().`,
              });
            } catch {
              // Host diagnostics are best effort and must not break cleanup.
            }
          }
        }
      }
      formInjector?.stop();
      formInjector = null;
      linkDecorator?.stop();
      linkDecorator = null;
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
      eventData.event_id = eventData.event_id || generateEventId();
      if (isLeadEvent(eventName) && !eventData.lead_id) {
        eventData.lead_id = `lead_${String(eventData.event_id).replace(/^evt_/, '')}`;
      }
      const envelopeContext: MarketingTrailContext = { identity: instance.getSession() };
      if (config.workspaceId !== undefined) envelopeContext.workspaceId = config.workspaceId;
      if (config.siteId !== undefined) envelopeContext.siteId = config.siteId;
      const consentState = config.consentState?.();
      if (consentState !== undefined) envelopeContext.consent = consentState;
      const event: ClickTrailEvent = buildEventPayload(payload, eventName, eventData, envelopeContext);
      for (const dest of destinations) dest.deliver(event);
    },

    mergeParsedTouch(touch) {
      if (!consentAllows()) return;
      // Capture path: refresh cookie-derived browser IDs first so a fresh
      // _fbp/_ga* value lands top-level on the same write (RULING A part b).
      mergeCookieBrowserIds();
      payload = mergeAttributionTouch(payload, touch);
      // Zero side effects until start(): pre-start merges stay in memory
      // and are flushed to storage by the hydration step in start().
      if (started && adapters) persistPayload();
    },

    hydrateStoredPayload(incoming) {
      if (!consentAllows()) return;
      // Migration path (WP swap / legacy imports): adopt canonical non-empty
      // keys only. Unknown keys are dropped here rather than at the store so
      // hydration works identically with or without storage adapters.
      for (const key of Object.keys(incoming)) {
        const value = incoming[key];
        if (CANONICAL_KEY_SET.has(key) && typeof value === 'string' && value !== '') {
          payload[key] = value;
        }
      }
      if (started && adapters) persistPayload();
    },

    getData: () => ({ ...payload }),

    getField(key) {
      return payload[key] ?? '';
    },

    clearData() {
      payload = emptyAttribution();
      clearDestinationQueues();
      if (started && adapters) {
        clearAttributionStorage(adapters.primary, adapters.mirror);
        identity?.clear();
      }
    },

    getSession(): SessionSnapshot {
      // Identifiers are created only while consent allows (DATA-MODEL.md:246);
      // a denied gate yields an empty snapshot instead of regenerating.
      if (consentGate && !consentGate()) {
        return { visitorId: '', sessionId: '', sessionNumber: '' };
      }
      if (started && identity) {
        return snapshotFromIdentity(identity.current());
      }
      return {
        visitorId: payload['visitor_id'] ?? '',
        sessionId: payload['session_id'] ?? '',
        sessionNumber: payload['session_number'] ?? '',
      };
    },
  };
  return instance;
}

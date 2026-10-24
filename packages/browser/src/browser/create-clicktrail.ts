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
import type { ParseAttributionInput, ParseResult, ParsedTouch } from '@vizuh/clicktrail-core';
import type { AttributionPayload } from '@vizuh/clicktrail-core';
import {
  isIgnoredReferrerHost,
  mergeAttributionTouch,
  parseAttributionUrl,
  referrerHostOf,
} from '@vizuh/clicktrail-core';
import { createIdentityStore } from './identity.js';
import type { IdentitySeedFn, IdentityStore, RandomBytesFn } from './identity.js';
import {
  loadAttributionPayload,
  saveAttributionPayload,
} from './payload-store.js';
import type { IdentitySnapshot } from './identity.js';
import {
  applyBrowserIdentifiers,
  collectBrowserIdsFromCookies,
  gaSessionCookieNames,
  parseCookieMap,
} from './browser-ids.js';
import type { CookieDuplicatePolicy } from './browser-ids.js';
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
   * Also store the machine channel code (`paid_search`, `organic_search`,
   * …) as `ft_channel_code` / `lt_channel_code` next to the `ft_channel` /
   * `lt_channel` labels, for CRMs and warehouses that need a stable value.
   * Default: OFF (the WordPress plugin stores labels only).
   */
  channelCodes?: boolean;
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
   * GA4 measurement ID(s) (`'G-ABC123'`) that own `ga_session_id` /
   * `ga_session_number`. When set, only `_ga_ABC123` is read; other
   * properties' `_ga_*` cookies on the domain are ignored. When unset, the
   * first usable `_ga_*` cookie wins and `ga_session_property_unpinned` is
   * reported (once per instance) if several are present. Invalid IDs throw.
   */
  ga4MeasurementId?: string | readonly string[];
  /**
   * Visitor/session identity options (requires `storage`). Default: mint
   * fresh IDs, 30-minute idle timeout, no maximum session length.
   */
  identity?: ClickTrailIdentityConfig;
  /**
   * Which value browser-ID collection uses when `_ga`, `_ga_<property>`,
   * `_fbp`, … appear more than once in `document.cookie` (one cookie per
   * domain or path). Default `'first'`: browsers list longer paths, then
   * older cookies, first, and gtag takes the first `_ga` whose `GA1.<n>`
   * domain level matches its cookie domain. `'last'` is the plugin
   * getCookieMap behaviour. Differing duplicates of `_ga`, `_ga_<property>`,
   * `_fbp` or `_fbc` report `browser_id_cookie_duplicate` once per instance.
   * Invalid values throw.
   */
  browserIdCookieDuplicates?: CookieDuplicatePolicy;
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
  /**
   * Referrer hosts that never form a touch, e.g. payment and hosted-checkout
   * returns. Applied by `captureLanding()`; a host or any subdomain of it
   * matches. Default: none. Pass `PAYMENT_REFERRER_HOSTS` from
   * `@vizuh/clicktrail-core` for the WordPress plugin's default list. This
   * does not change GA4: add the same hosts to GA4's unwanted referrals.
   */
  ignoredReferrerHosts?: readonly string[];
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

export interface ClickTrailIdentityConfig {
  /**
   * Host first-party identity to adopt instead of minting fresh IDs
   * (migration). Called lazily on the first identity read after start(),
   * at most once per instance, only while consent allows and only when
   * ClickTrail storage holds no identity; never replaces an existing one.
   * Invalid values are rejected whole (`identity_seed_rejected`).
   */
  seed?: IdentitySeedFn;
  /** Inactivity timeout in ms (positive integer). Default: 30 minutes. */
  sessionIdleMs?: number;
  /** Maximum session length in ms from session start (positive integer). Default: none. */
  sessionMaxMs?: number;
  /**
   * Fixed visitor lifetime in ms from the visitor's creation (positive
   * integer); activity does not extend it. Once reached, the next
   * non-passive read mints a new visitor and session, and passive reads
   * return no visitor. `ct_session` then stores `visitor_created_at`
   * (from `seed().visitorCreatedAt` for a seeded visitor). Keep
   * `storage.retentionDays` long enough to hold an idle visitor that long.
   * Default: none (the visitor lives while its storage does).
   */
  visitorMaxAgeMs?: number;
  /**
   * Count every delivered `track()` as session activity (same as calling
   * `touchSession()` first), so `sessionIdleMs` measures inactivity.
   * Set false when the host decides what counts as activity and calls
   * `touchSession()` itself. Default: true.
   */
  activityOnTrack?: boolean;
}

export interface GetSessionOptions {
  /**
   * Read the stored identity without creating, rolling or touching it. The
   * session fields are empty when no session is stored or it has expired;
   * every field is empty once `visitorMaxAgeMs` is reached. Consults
   * `identity.seed` like the default read, adopting (and storing) a seeded
   * visitor and session only when both are still valid; it never mints IDs.
   * Default: false.
   */
  passive?: boolean;
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
  /**
   * Parse a landing (URL + referrer) with `config.ignoredReferrerHosts`,
   * merge the touch when one forms, and return the parse result. Reports
   * `ignored_referrer_host` when an ignored referrer was blanked.
   */
  captureLanding(input: Omit<ParseAttributionInput, 'ignoredReferrerHosts'>): ParseResult;
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
  /**
   * Current visitor/session identity. By default creates the session when
   * none is stored or the stored one expired; `{ passive: true }` only reads.
   * Empty while consent is denied.
   */
  getSession(options?: GetSessionOptions): SessionSnapshot;
  /**
   * Record session activity now (e.g. a visible pointerdown/keydown or a
   * route change): load-or-roll the session, then restart its inactivity
   * window. Consent-gated; no-op returning the pre-start snapshot before
   * start(). Returns the resulting snapshot.
   */
  touchSession(): SessionSnapshot;
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

function assertPositiveMs(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError(`clicktrail: identity.${name} must be a positive integer of milliseconds.`);
  }
}

export function createClickTrail(config: ClickTrailConfig): ClickTrailInstance {
  const destinations = [...config.destinations];
  if (destinations.some((destination) => !destination || typeof destination.clear !== 'function')) {
    throw new TypeError('clicktrail: every destination must implement clear() for consent-safe withdrawal.');
  }
  const now = config.now;
  const consentGate = config.consentGate;
  const mergeOptions = { channelCodes: config.channelCodes === true };
  const sink = resolveSink(config);
  // Snapshot + validate once: invalid options throw here, never inside capture.
  const ga4MeasurementId =
    config.ga4MeasurementId === undefined || typeof config.ga4MeasurementId === 'string'
      ? config.ga4MeasurementId
      : Object.freeze([...config.ga4MeasurementId]);
  if (ga4MeasurementId !== undefined) gaSessionCookieNames(ga4MeasurementId);
  const browserIdCookieDuplicates = config.browserIdCookieDuplicates ?? 'first';
  parseCookieMap('', { duplicates: browserIdCookieDuplicates }); // throws on an unknown policy
  // Browser-ID cookie diagnostics fire once per code per instance, not on every capture.
  const reportedBrowserIdCodes = new Set<string>();
  const browserIdSink: DiagnosticSink = {
    report: (diagnostic) => {
      if (reportedBrowserIdCodes.has(diagnostic.code)) return;
      reportedBrowserIdCodes.add(diagnostic.code);
      try {
        sink.report(diagnostic);
      } catch {
        // Host diagnostics are best effort and must not drop browser IDs.
      }
    },
  };
  const identityCfg = config.identity;
  if (identityCfg !== undefined) {
    if (!config.storage) {
      throw new TypeError('clicktrail: config.identity requires config.storage.');
    }
    if (identityCfg.seed !== undefined && typeof identityCfg.seed !== 'function') {
      throw new TypeError('clicktrail: identity.seed must be a function.');
    }
    assertPositiveMs('sessionIdleMs', identityCfg.sessionIdleMs);
    assertPositiveMs('sessionMaxMs', identityCfg.sessionMaxMs);
    assertPositiveMs('visitorMaxAgeMs', identityCfg.visitorMaxAgeMs);
    if (identityCfg.activityOnTrack !== undefined && typeof identityCfg.activityOnTrack !== 'boolean') {
      throw new TypeError('clicktrail: identity.activityOnTrack must be a boolean.');
    }
  }
  const activityOnTrack = identityCfg?.activityOnTrack ?? true;
  let eventSequence = 0;

  let destinationCleanupFailed = false;
  const clearDestinationQueues = (): boolean => {
    let cleared = true;
    for (const dest of destinations) {
      try {
        dest.clear();
      } catch (error) {
        void error;
        cleared = false;
      }
    }
    destinationCleanupFailed = !cleared;
    return cleared;
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

  const clearBrowserAttributionDom = (): void => {
    try {
      formInjector?.clear();
    } catch (error) {
      void error;
    }
    try {
      linkDecorator?.clear();
    } catch (error) {
      void error;
    }
  };

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
      ...(identityCfg?.sessionIdleMs !== undefined ? { timeoutMs: identityCfg.sessionIdleMs } : {}),
      ...(identityCfg?.sessionMaxMs !== undefined ? { maxMs: identityCfg.sessionMaxMs } : {}),
      ...(identityCfg?.visitorMaxAgeMs !== undefined
        ? { visitorMaxAgeMs: identityCfg.visitorMaxAgeMs }
        : {}),
      ...(identityCfg?.seed !== undefined ? { seed: identityCfg.seed } : {}),
      onSeedRejected: (reason) => {
        try {
          sink.report({ code: 'identity_seed_rejected', level: 'warn', message: reason });
        } catch (error) {
          void error;
        }
      },
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
      const cookies = parseCookieMap(jar.read(), {
        duplicates: browserIdCookieDuplicates,
        sink: browserIdSink,
      });
      ids = collectBrowserIdsFromCookies(cookies, {
        ...(ga4MeasurementId !== undefined ? { ga4MeasurementId } : {}),
        sink: browserIdSink,
      });
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

  /** Pre-start / storage-less view: identity carried in the payload. */
  const payloadSessionSnapshot = (): SessionSnapshot => ({
    visitorId: payload['visitor_id'] ?? '',
    sessionId: payload['session_id'] ?? '',
    sessionNumber: payload['session_number'] ?? '',
  });

  const consentAllows = (): boolean => {
    if (!consentGate || consentGate()) {
      consentDeniedReported = false;
      if (destinationCleanupFailed && !clearDestinationQueues()) return false;
      return true;
    }
    if (!consentDeniedReported) {
      consentDeniedReported = true;
      try {
        sink.report({
          code: DIAGNOSTIC_CODES.CONSENT_DENIED_CAPTURE_ATTEMPTED,
          level: 'warn',
          message: 'Capture attempted while consent denied; event dropped.',
        });
      } catch (error) {
        void error;
      }
    }
    payload = emptyAttribution();
    if (adapters) {
      try {
        clearAttributionStorage(adapters.primary, adapters.mirror);
      } catch (error) {
        void error;
      }
      try {
        identity?.clear();
      } catch (error) {
        void error;
      }
    }
    clearDestinationQueues();
    clearBrowserAttributionDom();
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
      const startedDestinations: Destination[] = [];
      try {
        for (const dest of destinations) {
          startedDestinations.push(dest);
          dest.start?.();
        }
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
        for (const dest of [...startedDestinations].reverse()) {
          try {
            dest.stop?.();
          } catch (rollbackError) {
            void rollbackError;
          }
        }
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
      const envelopeContext: MarketingTrailContext = {
        identity: activityOnTrack ? instance.touchSession() : instance.getSession(),
      };
      if (config.workspaceId !== undefined) envelopeContext.workspaceId = config.workspaceId;
      if (config.siteId !== undefined) envelopeContext.siteId = config.siteId;
      const consentState = config.consentState?.();
      if (consentState !== undefined) envelopeContext.consent = consentState;
      const event: ClickTrailEvent = buildEventPayload(payload, eventName, eventData, envelopeContext);
      for (const dest of destinations) {
        if (!consentAllows()) return;
        dest.deliver(event);
      }
    },

    mergeParsedTouch(touch) {
      if (!consentAllows()) return;
      // Capture path: refresh cookie-derived browser IDs first so a fresh
      // _fbp/_ga* value lands top-level on the same write (RULING A part b).
      mergeCookieBrowserIds();
      payload = mergeAttributionTouch(payload, touch, mergeOptions);
      // Zero side effects until start(): pre-start merges stay in memory
      // and are flushed to storage by the hydration step in start().
      if (started && adapters) persistPayload();
    },

    captureLanding(input) {
      const ignoredReferrerHosts = config.ignoredReferrerHosts ?? [];
      const result = parseAttributionUrl({ ...input, ignoredReferrerHosts });
      const referrerHost = input.referrer ? referrerHostOf(input.referrer) : '';
      if (
        referrerHost &&
        (result.kind === 'touch' || result.reason === 'ignored_referrer') &&
        isIgnoredReferrerHost(referrerHost, ignoredReferrerHosts)
      ) {
        try {
          sink.report({
            code: DIAGNOSTIC_CODES.IGNORED_REFERRER_HOST,
            level: 'info',
            message: result.kind === 'touch'
              ? 'Ignored referrer blanked; URL parameters still formed a touch.'
              : 'Ignored referrer created no touch; stored attribution kept.',
            context: { referrer_host: referrerHost, touch: result.kind === 'touch' },
          });
        } catch (error) {
          void error;
        }
      }
      if (result.kind === 'touch') instance.mergeParsedTouch(result.touch);
      return result;
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

    getData: () => (consentAllows() ? { ...payload } : emptyAttribution()),

    getField(key) {
      return consentAllows() ? payload[key] ?? '' : '';
    },

    clearData() {
      payload = emptyAttribution();
      clearDestinationQueues();
      clearBrowserAttributionDom();
      if (storageCfg) {
        initStorage();
      }
      if (adapters) {
        clearAttributionStorage(adapters.primary, adapters.mirror);
        identity?.clear();
      }
    },

    getSession(options): SessionSnapshot {
      // Identifiers are created only while consent allows (DATA-MODEL.md:246);
      // a denied gate yields an empty snapshot instead of regenerating.
      if (!consentAllows()) {
        return { visitorId: '', sessionId: '', sessionNumber: '' };
      }
      if (started && identity) {
        if (options?.passive === true) {
          const peeked = identity.peek();
          return {
            visitorId: peeked.visitorId,
            sessionId: peeked.sessionId,
            sessionNumber: peeked.sessionNumber === null ? '' : String(peeked.sessionNumber),
          };
        }
        return snapshotFromIdentity(identity.current());
      }
      return payloadSessionSnapshot();
    },

    touchSession(): SessionSnapshot {
      if (!consentAllows()) {
        return { visitorId: '', sessionId: '', sessionNumber: '' };
      }
      if (started && identity) {
        return snapshotFromIdentity(identity.touch());
      }
      return payloadSessionSnapshot();
    },
  };
  return instance;
}

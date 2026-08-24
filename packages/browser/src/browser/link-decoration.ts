/**
 * Cross-domain continuity: link decoration + landing-token consumption
 * (Phase 2, work-queue #5).
 *
 * Contract (portable prompt "Cross-domain continuity" + "Capture rules"):
 * - link decoration ONLY for approved domains (exact-match suffix rules:
 *   host === domain || host ends with '.' + domain)
 * - a signed attribution token rides the URL between approved domains
 *   (default param name `ct_token`)
 * - already-signed URLs are skipped by default (setting)
 * - on landing the token is validated, then merged as an attribution touch
 *   with medium 'referral' UNLESS stronger signals (UTMs / click IDs) exist
 *   in the current URL; after consumption the parameter is stripped from
 *   the history entry
 * - token TTL is 30 days (carried as an absolute `exp` inside the token);
 *   tokens are capped at MAX_TOKEN_LENGTH characters — decoration skips
 *   deterministically instead of producing oversized URLs
 *
 * Honesty note: the HMAC signature is INTEGRITY (tamper/e corruption guard),
 * not confidentiality or protection against the site owner. Anyone can read
 * the payload; only key holders should produce valid signatures.
 *
 * Determinism/seams: signing enters as an injected async function (default:
 * WebCrypto HMAC-SHA256 over a per-installation random key persisted in the
 * attribution storage adapters); clock and location/history enter injected.
 * No side effects before start().
 */
import { CLICK_ID_KEYS, resolveChannelLabel } from '@vizuh/clicktrail-core';
import { CHANNEL_VALUE_REFERRAL } from '@vizuh/clicktrail-core';
import type { Channel } from '@vizuh/clicktrail-core';
import type { ParsedTouch } from '@vizuh/clicktrail-core';
import { readQuery } from '@vizuh/clicktrail-core';
import type { RandomBytesFn } from './identity.js';
import { SIGNING_KEY_KEY, DAY_MS } from './storage.js';
import type { StorageAdapter } from './storage.js';
import type { ObserverFactory } from './form-injection.js';

// Re-exported for convenience so hosts don't import storage just for this.
export { SIGNING_KEY_KEY };

/** Token lifetime: 30 days from issuance. */
export const TOKEN_TTL_MS = 30 * DAY_MS;

/** Hard cap on the decorated query value; guards URL-length budgets. */
export const MAX_TOKEN_LENGTH = 2048;

/** Default URL parameter carrying the continuation token. */
export const DEFAULT_TOKEN_PARAM = 'ct_token';

/** Canonical payload keys carried in a continuation token by default. */
export const CONTINUATION_FIELDS: readonly string[] = [
  'lt_source',
  'lt_medium',
  'lt_campaign',
  'lt_term',
  'lt_content',
  'lt_channel',
  'lt_referrer',
  'lt_landing_page',
  'lt_touch_timestamp',
  ...CLICK_ID_KEYS,
];

// --- pure helpers -----------------------------------------------------------

/**
 * PURE: approved-domain check with exact-suffix rules. Hosts are compared
 * lowercased and port-stripped. `example.com` approves `example.com` and
 * `shop.example.com` but NOT `notexample.com`.
 */
export function isApprovedHost(host: string, domains: readonly string[]): boolean {
  const h = normalizeHostForMatch(host);
  if (!h) return false;
  return domains.some((d) => {
    const base = normalizeHostForMatch(d);
    return base !== '' && (h === base || h.endsWith(`.${base}`));
  });
}

function normalizeHostForMatch(host: string): string {
  const stripped = host.trim().toLowerCase().replace(/:\d+$/, '');
  // Reject anything that still looks like a scheme or path fragment.
  if (stripped.includes('/') || stripped.includes('@')) return '';
  return stripped;
}

/** JSON with non-ASCII escaped to \uXXXX so tokens stay pure ASCII. */
function asciiJson(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return JSON.stringify(value).replace(/[^\u0020-\u007E]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

const B64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64URL_ALPHABET[b0 >> 2]!;
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]!;
    if (i + 1 < bytes.length) out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]!;
    if (i + 2 < bytes.length) out += B64URL_ALPHABET[b2 & 0x3f]!;
  }
  return out;
}

const B64URL_LOOKUP: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(B64URL_ALPHABET.split('').map((c, i) => [c, i])),
);

export function base64UrlToBytes(s: string): Uint8Array | null {
  if (s.length === 0) return new Uint8Array(0);
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64URL_LOOKUP[ch];
    if (v === undefined) return null; // non-alphabet character: malformed
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  // Leftover bits (<8) are padding remnants; tolerate them silently.
  return new Uint8Array(out);
}

/** Opaque continuation-token body (readable by design; integrity via sig). */
export interface ContinuationPayload {
  visitor_id: string;
  session_id: string;
  /** Canonical flat attribution subset (see {@link CONTINUATION_FIELDS}). */
  attribution: Record<string, string>;
  /** Absolute expiry in ms since epoch. */
  exp: number;
}

/** Contract for the injected signer: base64url signature over UTF-8 data. */
export type SignFn = (data: string) => Promise<string>;
/** Contract for the injected verifier (same encoding contract). */
export type VerifyFn = (data: string, signatureB64Url: string) => Promise<boolean>;

/**
 * PURE-ish: encode the token body and produce `<body>.<sig>` once the
 * injected signer resolves. Throws when the encoded token exceeds
 * {@link MAX_TOKEN_LENGTH} (callers treat that as skip-decoration).
 */
export async function encodeContinuationToken(input: {
  visitorId: string;
  sessionId: string;
  attribution: Record<string, string>;
  nowMs: number;
  ttlMs?: number;
  sign: SignFn;
}): Promise<string> {
  const payload: ContinuationPayload = {
    visitor_id: input.visitorId,
    session_id: input.sessionId,
    attribution: input.attribution,
    exp: input.nowMs + (input.ttlMs ?? TOKEN_TTL_MS),
  };
  const body = bytesToBase64Url(new TextEncoder().encode(asciiJson(payload)));
  const signature = await input.sign(body);
  const token = `${body}.${signature}`;
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error(
      `clicktrail: continuation token exceeds MAX_TOKEN_LENGTH (${token.length} > ${MAX_TOKEN_LENGTH}).`,
    );
  }
  return token;
}

export type ConsumeResult =
  | { kind: 'valid'; payload: ContinuationPayload }
  | {
      kind: 'invalid';
      reason: 'malformed' | 'bad_signature' | 'expired';
    };

/**
 * Validate one continuation token. DETERMINISTIC rejections:
 * - structurally broken (no dot, undecodable parts, bad JSON) -> 'malformed'
 * - signature mismatch                      -> 'bad_signature'
 * - `exp` in the past vs the injected clock -> 'expired'
 * Signature verification happens BEFORE expiry so tampered tokens never
 * leak their content through timing-dependent error paths.
 */
export async function decodeContinuationToken(
  token: string,
  verify: VerifyFn,
  nowMs: number,
): Promise<ConsumeResult> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { kind: 'invalid', reason: 'malformed' };
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const decoded = base64UrlToBytes(body);
  if (decoded === null) return { kind: 'invalid', reason: 'malformed' };
  let json: string;
  try {
    json = new TextDecoder('utf-8').decode(decoded);
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
  const checked = validateContinuationShape(parsed);
  if (checked === null) return { kind: 'invalid', reason: 'malformed' };
  const ok = await verify(body, signature);
  if (!ok) return { kind: 'invalid', reason: 'bad_signature' };
  if (nowMs >= checked.exp) return { kind: 'invalid', reason: 'expired' };
  return { kind: 'valid', payload: checked };
}

function validateContinuationShape(value: unknown): ContinuationPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const rec = value as Record<string, unknown>;
  const { visitor_id: vid, session_id: sid, attribution, exp } = rec;
  if (typeof vid !== 'string' || typeof sid !== 'string') return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  if (typeof attribution !== 'object' || attribution === null) return null;
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attribution)) {
    if (typeof v !== 'string') return null;
    attrs[k] = v;
  }
  return { visitor_id: vid, session_id: sid, attribution: attrs, exp };
}

/**
 * PURE: does the landing URL carry STRONGER attribution signals than the
 * token (any utm_* campaign parameter or any supported click ID)?
 */
export function urlHasStrongerSignal(url: string): boolean {
  const query = readQuery(url);
  if (!query) return false;
  for (const key of query.keys()) {
    const k = key.toLowerCase();
    if (k.startsWith('utm_')) return true;
    const canonical = k === 'sc_click_id' ? 'sccid' : k;
    if ((CLICK_ID_KEYS as readonly string[]).includes(canonical)) return true;
  }
  return false;
}

/**
 * Build the referral-continuity touch from a validated token payload.
 * Medium is forced to 'referral' (continuity hop, not the original medium);
 * source and click IDs ride through unchanged.
 */
export function buildReferralTouch(input: {
  payload: ContinuationPayload;
  landingUrl: string;
  nowIso: string;
}): ParsedTouch {
  const a = input.payload.attribution;
  const source = a['lt_source'] ?? '';
  const touch = {
    source,
    medium: 'referral',
    campaign: a['lt_campaign'] ?? '',
    term: a['lt_term'] ?? '',
    content: a['lt_content'] ?? '',
    utmId: '',
    utmSourcePlatform: '',
    utmCreativeFormat: '',
    utmMarketingTactic: '',
    referrer: a['lt_landing_page'] ?? '',
    landingPage: input.landingUrl,
    touchTimestamp: input.nowIso,
    clickIds: Object.fromEntries(
      CLICK_ID_KEYS.filter((k) => a[k]).map((k) => [k, a[k]!]),
    ),
    channel: CHANNEL_VALUE_REFERRAL as Channel,
  };
  return {
    ...touch,
    channelLabel: resolveChannelLabel({
      source: touch.source,
      medium: touch.medium,
      clickIds: {},
      referrer: '',
    }),
  };
}

// --- landing consumption -----------------------------------------------------

/**
 * Injectable location/history seam so consumption never touches globals
 * directly (tests fake it entirely; SSR resolves null).
 */
export interface LocationHistorySeam {
  /** Current page URL (full href). */
  href(): string;
  /** Replace the current history entry (used to strip the token param). */
  replaceState(url: string): void;
}

/** Default seam over globalThis.location/history; null in SSR. */
export function defaultLocationSeam(): LocationHistorySeam | null {
  const loc = (globalThis as {
    location?: { href: string };
  }).location;
  const hist = (globalThis as {
    history?: { replaceState(data: unknown, title: string, url?: string): void };
  }).history;
  if (!loc || !hist) return null;
  return {
    href: () => loc.href,
    replaceState: (url) => hist.replaceState(null, '', url),
  };
}

export type LandingConsumeOutcome =
  | 'no_token'
  | 'consent_denied'
  | 'merged'
  | 'skipped_stronger_signal'
  | 'invalid_malformed'
  | 'invalid_bad_signature'
  | 'invalid_expired';

/**
 * Consume a continuation token from the current page URL:
 * - strips the parameter from the history entry FIRST (the token never
 *   leaks through referrers or shared URLs, whatever the outcome)
 * - refuses to merge when consent is denied
 * - validates signature/expiry deterministically
 * - merges as medium-'referral' UNLESS the URL carries stronger signals
 *   (UTMs / click IDs); the stored landing page is the STRIPPED url
 */
export async function consumeLandingToken(input: {
  seam: LocationHistorySeam;
  tokenParam: string;
  verify: VerifyFn;
  nowMs: () => number;
  nowIso: () => string;
  consentAllowed: () => boolean;
  mergeTouch: (touch: ParsedTouch) => void;
}): Promise<LandingConsumeOutcome> {
  const original = input.seam.href();
  let parsed: URL;
  try {
    parsed = new URL(original);
  } catch {
    return 'no_token';
  }
  const rawValues = parsed.searchParams.getAll(input.tokenParam);
  if (rawValues.length === 0) return 'no_token';
  // First occurrence wins; duplicates are junk and disappear with the strip.
  const raw = rawValues[0]!;
  parsed.searchParams.delete(input.tokenParam);
  const strippedHref = parsed.toString();
  try {
    input.seam.replaceState(strippedHref);
  } catch {
    // Stripping is best-effort; consumption continues on the cleaned value.
  }

  if (!input.consentAllowed()) return 'consent_denied';

  const result = await decodeContinuationToken(raw, input.verify, input.nowMs());
  if (result.kind === 'invalid') {
    return `invalid_${result.reason}` as LandingConsumeOutcome;
  }
  if (urlHasStrongerSignal(strippedHref)) return 'skipped_stronger_signal';

  input.mergeTouch(
    buildReferralTouch({
      payload: result.payload,
      landingUrl: strippedHref,
      nowIso: input.nowIso(),
    }),
  );
  return 'merged';
}

// --- decoration -------------------------------------------------------------

/**
 * PURE: append the token to a URL honoring skip-signed semantics.
 * Returns null when the URL must NOT be modified (unapproved host handled
 * by the caller; here: already-signed + skipSignedUrls).
 */
export function decorateUrl(input: {
  url: string;
  baseUrl?: string | undefined;
  token: string;
  tokenParam: string;
  skipSignedUrls: boolean;
}): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.url, input.baseUrl);
  } catch {
    return null; // unresolvable href: leave untouched
  }
  if (parsed.searchParams.has(input.tokenParam)) {
    if (input.skipSignedUrls) return null;
  }
  parsed.searchParams.set(input.tokenParam, input.token);
  return parsed.toString();
}

/** Anchor surface needed for decoration (structural, fake-DOM friendly). */
export interface AnchorNode {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

export interface LinkDomDocument {
  querySelectorAll(selector: string): AnchorNode[];
  body: unknown;
}

export const ANCHOR_SELECTOR = 'a[href]';

export interface LinkDecoratorConfig {
  /** Approved target domains (exact-suffix rules). Required. */
  domains: readonly string[];
  /** URL parameter name. Default {@link DEFAULT_TOKEN_PARAM}. */
  tokenParam?: string | undefined;
  /** Skip anchors whose URL already carries the token. Default true. */
  skipSignedUrls?: boolean | undefined;
  /** Injectable document root. Default: globalThis.document wrapper. */
  doc?: LinkDomDocument | undefined;
  /** Observer factory for late-added links. Default: MutationObserver wrapper; null disables. */
  observer?: ObserverFactory | null | undefined;
  /** Consent gate consulted before every decoration pass. */
  consentAllowed: () => boolean;
  /**
   * Resolves the current page's continuation token (host-built via
   * {@link encodeContinuationToken}); empty string disables decoration.
   */
  getToken: () => Promise<string>;
  /** Current page href used to resolve relative anchor targets. */
  getBaseUrl: () => string;
}

export interface LinkDecorator {
  start(): void;
  stop(): void;
}

/** Default document root for anchors; null in SSR. */
export function defaultLinkDocument(): LinkDomDocument | null {
  const doc = (globalThis as {
    document?: {
      querySelectorAll(selector: string): ArrayLike<AnchorNode>;
      body: unknown;
    };
  }).document;
  if (!doc) return null;
  return { querySelectorAll: (s) => Array.from(doc.querySelectorAll(s)) as AnchorNode[], body: doc.body };
}

function defaultLinkObserver(): ObserverFactory | null {
  const ctor = (globalThis as {
    MutationObserver?: new (cb: () => void) => {
      observe(t: unknown, i?: unknown): void;
      disconnect(): void;
    };
  }).MutationObserver;
  if (!ctor) return null;
  return (cb) => new ctor(cb);
}

/**
 * Create the outbound link decorator. The token resolves asynchronously at
 * start(); matching anchors are rewritten once it lands, and the observer
 * picks up late additions until stop() disconnects it.
 */
export function createLinkDecorator(config: LinkDecoratorConfig): LinkDecorator {
  const tokenParam = config.tokenParam ?? DEFAULT_TOKEN_PARAM;
  const skipSignedUrls = config.skipSignedUrls ?? true;

  let token = '';

  const decorateOnce = (): void => {
    if (!token || !config.consentAllowed()) return;
    const doc = config.doc;
    if (!doc) return;
    const base = config.getBaseUrl();
    for (const anchor of doc.querySelectorAll(ANCHOR_SELECTOR)) {
      const href = anchor.getAttribute('href');
      if (!href) continue;
      try {
        const resolved = new URL(href, base || undefined);
        if (!isApprovedHost(resolved.host, config.domains)) continue;
      } catch {
        continue;
      }
      const next = decorateUrl({
        url: href,
        baseUrl: base || undefined,
        token,
        tokenParam,
        skipSignedUrls,
      });
      if (next !== null && next !== href) anchor.setAttribute('href', next);
    }
  };

  let observer: ReturnType<ObserverFactory> | null = null;

  return {
    start() {
      if (config.observer !== undefined && config.observer === null) {
        // Observation explicitly disabled.
      } else if (observer === null) {
        const factory = config.observer ?? defaultLinkObserver();
        if (factory) {
          observer = factory(decorateOnce);
          observer.observe(config.doc?.body ?? {}, { childList: true, subtree: true });
        }
      }
      void config.getToken()
        .then((t) => {
          token = t;
          decorateOnce();
        })
        .catch(() => {
          // Oversized/failed token: deterministic no-decoration.
          token = '';
        });
    },
    stop() {
      observer?.disconnect();
      observer = null;
    },
  };
}

// --- default HMAC signing ----------------------------------------------------

interface SubtleLike {
  importKey(
    format: string,
    keyData: Uint8Array,
    algorithm: { name: string; hash: string },
    extractable: boolean,
    usages: string[],
  ): Promise<unknown>;
  sign(
    algorithm: { name: string },
    key: unknown,
    data: Uint8Array,
  ): Promise<ArrayBuffer>;
  verify(
    algorithm: { name: string },
    key: unknown,
    signature: Uint8Array,
    data: Uint8Array,
  ): Promise<boolean>;
}

function subtleOrThrow(): SubtleLike {
  const crypto = (globalThis as unknown as { crypto?: { subtle?: SubtleLike } }).crypto;
  if (!crypto?.subtle) {
    throw new Error(
      'clicktrail: no WebCrypto available; inject crossDomain.sign / crossDomain.verify.',
    );
  }
  return crypto.subtle;
}

async function loadOrCreateKeyBytes(adapters: readonly StorageAdapter[], randomBytes: RandomBytesFn): Promise<Uint8Array> {
  for (const adapter of adapters) {
    const raw = adapter.get(SIGNING_KEY_KEY);
    if (raw !== null) {
      const bytes = base64UrlToBytes(raw);
      if (bytes !== null && bytes.length > 0) return bytes;
    }
  }
  const fresh = randomBytes(32);
  const encoded = bytesToBase64Url(fresh);
  for (const adapter of adapters) adapter.set(SIGNING_KEY_KEY, encoded);
  return fresh;
}

/**
 * Default signer: WebCrypto HMAC-SHA256 over a per-installation random key
 * persisted in the attribution storage adapters (cookie primary + mirror).
 * Only invoked post-start(); throws without WebCrypto (hosts inject their
 * own sign fn instead of a silent degraded path).
 */
export function defaultHmacSign(
  adapters: readonly StorageAdapter[],
  randomBytes: RandomBytesFn,
): SignFn {
  return async (data) => {
    const subtle = subtleOrThrow();
    const keyBytes = await loadOrCreateKeyBytes(adapters, randomBytes);
    const key = await subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await subtle.sign({ name: 'HMAC' }, key, new TextEncoder().encode(data));
    return bytesToBase64Url(new Uint8Array(mac));
  };
}

/**
 * Default verifier matching {@link defaultHmacSign}. A missing persisted key
 * yields deterministic false (tokens from other installations never verify).
 */
export function defaultHmacVerify(adapters: readonly StorageAdapter[]): VerifyFn {
  return async (data, signatureB64Url) => {
    const raw = adapters.map((a) => a.get(SIGNING_KEY_KEY)).find((v) => v !== null);
    if (raw === undefined || raw === null) return false;
    const keyBytes = base64UrlToBytes(raw);
    const sigBytes = base64UrlToBytes(signatureB64Url);
    if (keyBytes === null || sigBytes === null || keyBytes.length === 0) return false;
    const subtle = subtleOrThrow();
    try {
      const key = await subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      return await subtle.verify(
        { name: 'HMAC' },
        key,
        sigBytes,
        new TextEncoder().encode(data),
      );
    } catch {
      return false;
    }
  };
}

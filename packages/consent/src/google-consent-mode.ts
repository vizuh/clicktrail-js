/**
 * Google Consent Mode v2 bridge: maps a ConsentRecord to the gtag consent
 * signals, emits the `default` command before GTM loads, and sends `update`
 * when the decision changes. Opt-in: nothing here runs at import time.
 *
 * Pending (no stored decision, `null` record) and denied both default to
 * `denied`. Pending is not a decision: it never sends an `update`, and the
 * bridge never touches attribution storage.
 */
import type { ConsentRecord } from './types.js';

export type ConsentModeValue = 'granted' | 'denied';

/** The Consent Mode v2 signals ClickTrail purposes map to. */
export interface ConsentModeSignals {
  analytics_storage: ConsentModeValue;
  ad_storage: ConsentModeValue;
  ad_user_data: ConsentModeValue;
  ad_personalization: ConsentModeValue;
}

/** localStorage-like seam for the stored decision. */
export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Window-like surface `applyConsentModeUpdate` writes to. */
export interface GtagTarget {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

export interface ConsentModeDefaultScriptOptions {
  /** localStorage key holding the JSON ConsentRecord (see saveConsentRecord). */
  storageKey: string;
  /** Milliseconds tags wait for an `update` before using the default. Default 500 (WordPress plugin value); 0 omits it. */
  waitForUpdate?: number;
}

const DEFAULT_WAIT_FOR_UPDATE = 500;

/**
 * Purpose flags drive the signals; `state` does not. CMP adapters set `state`
 * from marketing consent, so an analytics-only decision is `state: 'denied'`
 * with `analytics: true` and must still grant `analytics_storage`.
 * Advertising falls back to `marketing` when unset (same rule as the browser
 * envelope). Absent flags and a `null` (pending) record are `denied`.
 */
export function consentModeSignals(record: ConsentRecord | null | undefined): ConsentModeSignals {
  const analytics: ConsentModeValue = record?.analytics === true ? 'granted' : 'denied';
  const ads: ConsentModeValue = (record?.advertising ?? record?.marketing) === true ? 'granted' : 'denied';
  return {
    analytics_storage: analytics,
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  };
}

/** JSON literal that cannot close the surrounding <script> element. */
function scriptLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Inline script for the document head, placed before the GTM/gtag snippet.
 * It reads the stored record and issues `gtag('consent', 'default', ...)` with
 * the same mapping as consentModeSignals(). Hosts with a CSP add their nonce
 * to the <script> element that wraps it.
 */
export function consentModeDefaultScript(options: ConsentModeDefaultScriptOptions): string {
  const { storageKey } = options;
  if (typeof storageKey !== 'string' || storageKey === '') {
    throw new TypeError('consentModeDefaultScript: storageKey must be a non-empty string');
  }
  const wait = options.waitForUpdate ?? DEFAULT_WAIT_FOR_UPDATE;
  if (!Number.isSafeInteger(wait) || wait < 0) {
    throw new RangeError('consentModeDefaultScript: waitForUpdate must be a non-negative integer');
  }
  const waitField = wait > 0 ? `,wait_for_update:${wait}` : '';
  return (
    '(function(w,k){' +
    'w.dataLayer=w.dataLayer||[];' +
    'w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};' +
    "var a='denied',d='denied',r=null;" +
    'try{r=JSON.parse(w.localStorage.getItem(k));}catch(e){}' +
    "if(r&&typeof r==='object'&&(r.state==='granted'||r.state==='denied')){" +
    "if(r.analytics===true)a='granted';" +
    "if((r.advertising!=null?r.advertising:r.marketing)===true)d='granted';" +
    '}' +
    `w.gtag('consent','default',{analytics_storage:a,ad_storage:d,ad_user_data:d,ad_personalization:d${waitField}});` +
    `})(window,${scriptLiteral(storageKey)});`
  );
}

function defaultTarget(): GtagTarget | null {
  const win: unknown = Reflect.get(globalThis, 'window');
  if (!win || typeof win !== 'object') return null;
  // The browser window: GtagTarget only names the two globals gtag.js reads.
  const target: GtagTarget = win;
  return target;
}

/** gtag.js pushes its Arguments object; plain arrays are ignored for consent commands. */
function gtagArguments(..._args: unknown[]): IArguments {
  return arguments;
}

/**
 * Send `gtag('consent', 'update', signals)` for a decision. A `null` record
 * (pending) sends nothing: the default already denies, and pending is not a
 * withdrawal. Uses the page's gtag when present, else pushes the same
 * arguments object gtag would. Returns the signals sent, or null when nothing
 * was sent (pending, or no window during SSR).
 */
export function applyConsentModeUpdate(
  record: ConsentRecord | null | undefined,
  options?: { target?: GtagTarget },
): ConsentModeSignals | null {
  if (!record) return null;
  const target = options?.target ?? defaultTarget();
  if (!target) return null;
  const signals = consentModeSignals(record);
  if (typeof target.gtag === 'function') {
    target.gtag('consent', 'update', signals);
  } else {
    target.dataLayer ??= [];
    target.dataLayer.push(gtagArguments('consent', 'update', signals));
  }
  return signals;
}

function defaultStorage(): ConsentStorage | null {
  try {
    const storage: unknown = Reflect.get(globalThis, 'localStorage');
    return isConsentStorage(storage) ? storage : null;
  } catch {
    return null; // Access throws in some sandboxed iframes.
  }
}

function isConsentStorage(value: unknown): value is ConsentStorage {
  return (
    !!value &&
    typeof value === 'object' &&
    'getItem' in value &&
    typeof value.getItem === 'function' &&
    'setItem' in value &&
    typeof value.setItem === 'function'
  );
}

/**
 * Read the record stored under `storageKey`. Returns null (pending) when
 * nothing valid is stored or storage is unavailable; a stored `denied`
 * record is returned as such, so hosts can tell pending from withdrawn.
 */
export function loadConsentRecord(storageKey: string, storage?: ConsentStorage): ConsentRecord | null {
  let raw: string | null;
  try {
    raw = (storage ?? defaultStorage())?.getItem(storageKey) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = new Map<string, unknown>(Object.entries(parsed));
  const state = value.get('state');
  if (state !== 'granted' && state !== 'denied') return null;
  const record: ConsentRecord = { state };
  for (const flag of ['analytics', 'advertising', 'marketing'] as const) {
    const flagValue = value.get(flag);
    if (typeof flagValue === 'boolean') record[flag] = flagValue;
  }
  for (const field of ['source', 'policyVersion', 'at'] as const) {
    const fieldValue = value.get(field);
    if (typeof fieldValue === 'string') record[field] = fieldValue;
  }
  return record;
}

/** Store a decision for the next page's default script. Returns false when storage is unavailable. */
export function saveConsentRecord(storageKey: string, record: ConsentRecord, storage?: ConsentStorage): boolean {
  try {
    const target = storage ?? defaultStorage();
    if (!target) return false;
    target.setItem(storageKey, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

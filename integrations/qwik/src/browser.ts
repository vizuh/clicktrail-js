/**
 * @vizuh/clicktrail-qwik/browser — on-demand browser module.
 *
 * PERFORMANCE CONTRACT: Qwik resumability means the page ships NO eager
 * analytics bundle. This module is small, side-effect-free at import, and
 * activated only when host code calls `bootClickTrailClient(...)` (e.g.
 * inside a `useVisibleTask$`, after user interaction, or post-consent).
 *
 * Page views dedupe by URL key (pathname + search) over an INJECTABLE
 * navigation-callback seam — Qwik City has no global router-afterEach
 * event, so hosts wire their own navigation notification:
 *
 * - pass a custom seam (`onNavigate`) driven by `useLocation`/router
 *   internals, or
 * - use the bundled `createHistoryNavigationSeam()` (History API wrapper),
 *   or skip client page views entirely and rely on the qwik-city server
 *   middleware + server-side conversions.
 *
 * Consent: with `consentRequired: true` nothing starts until the shared
 * `ct_consent` cookie reads granted (see ./consent). Touch merges before
 * start() stay in memory — consent deferral holds.
 */
import { createClickTrail, httpDestination } from '@vizuh/clicktrail-browser';
import type { ClickTrailConfig, ClickTrailInstance } from '@vizuh/clicktrail-browser';
import { parseAttributionUrl } from '@vizuh/clicktrail-core';
import { CONSENT_EVENT, readStoredConsent } from './consent.js';
import type { ConsentEventTargetLike } from './consent.js';
import type { CookieJar } from '@vizuh/clicktrail-browser';

// ---------------------------------------------------------------------------
// Navigation seam + URL-keyed dedupe (mirrors nuxt/route-tracking.ts)
// ---------------------------------------------------------------------------

/** Stable dedupe key: pathname + search. Fragments are ignored. */
export function pageKeyOf(href: string): string {
  try {
    const u = new URL(href);
    return `${u.pathname}${u.search}`;
  } catch {
    return href;
  }
}

/**
 * Navigation seam: href/host/referrer describe the current document;
 * `onNavigate` registers a post-navigation callback and returns an
 * unregister function. Hosts wire it to whatever signals client-side
 * navigations in their app (Qwik City router, history patching, ...).
 */
export interface NavigationCallbackSeam {
  /** Full href of the current document location. */
  href(): string;
  /** External referrer of the current document ('' when none). */
  referrer(): string;
  /** Host of the current site, used to ignore internal referrals. */
  host(): string;
  onNavigate(handler: () => void): () => void;
}

/**
 * Ready-made seam over the History API + popstate. Covers SPA navigations
 * performed through pushState/replaceState/back-forward without any
 * framework import. Hosts needing Qwik-City-precise timing inject their
 * own seam instead.
 */
export function createHistoryNavigationSeam(doc: Document = globalThis.document): NavigationCallbackSeam {
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const handler of listeners) handler();
  };
  const history = doc.defaultView?.history;
  if (!history) {
    throw new Error('clicktrail browser: createHistoryNavigationSeam requires window.history.');
  }
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History['pushState']>) => {
    originalPush(...args);
    notify();
  }) as History['pushState'];
  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    originalReplace(...args);
    notify();
  }) as History['replaceState'];
  doc.addEventListener('popstate', notify);

  return {
    href: () => doc.location.href,
    referrer: () => (typeof doc.referrer === 'string' ? doc.referrer : ''),
    host: () => doc.location.host,
    onNavigate(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
}

export interface RouteTrackerOptions {
  /** Event name emitted per view. Default 'page_view'. */
  eventName?: string;
  /**
   * Merge attribution touches per URL change when not exactly false.
   * Default true.
   */
  captureClickIds?: boolean;
  /** Injected clock stamping attribution parses. */
  now?: () => string;
}

const DEFAULT_PAGE_VIEW_EVENT = 'page_view';
const DEFAULT_NOW = (): string => new Date().toISOString();

/**
 * Attach initial-load + navigation tracking. Returns a detach fn.
 * Safe before start(): track() is a no-op pre-start and touch merges stay
 * in memory until start() persists them — consent deferral therefore holds.
 */
export function attachQwikNavigationTracking(
  instance: Pick<ClickTrailInstance, 'track' | 'mergeParsedTouch'>,
  seam: Pick<NavigationCallbackSeam, 'href' | 'referrer' | 'host' | 'onNavigate'>,
  options: RouteTrackerOptions = {},
): () => void {
  const eventName = options.eventName ?? DEFAULT_PAGE_VIEW_EVENT;
  const now = options.now ?? DEFAULT_NOW;
  let lastKey: string | null = null;

  const handleNavigation = (): void => {
    const href = seam.href();
    const key = pageKeyOf(href);
    if (key === lastKey) return;
    lastKey = key;

    if (options.captureClickIds !== false) {
      const result = parseAttributionUrl({
        url: href,
        ...(seam.referrer() ? { referrer: seam.referrer() } : {}),
        ...(seam.host() ? { currentHost: seam.host() } : {}),
        now: now(),
      });
      if (result.kind === 'touch') {
        instance.mergeParsedTouch(result.touch);
      }
    }
    instance.track(eventName, { page_location: href });
  };

  handleNavigation();
  const detach = seam.onNavigate(() => handleNavigation());

  return () => detach();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export interface ClickTrailQwikClientConfig {
  /** Where the browser delivers events. Required. */
  endpoint: string;
  siteId?: string;
  workspaceId?: string;
  /**
   * When true, no events or storage writes happen until the ct_consent
   * cookie reads granted (via `setConsent(true)` or the
   * `clicktrail:consent` CustomEvent). Default false.
   */
  consentRequired?: boolean;
  /** Log boot diagnostics to console. Default false. */
  debug?: boolean;
}

export interface ClientSeams {
  /** Cookie jar for the consent cookie. Default: document.cookie. */
  cookieJar?: CookieJar;
  /** Event target for the consent event. Default: document. */
  eventTarget?: ConsentEventTargetLike;
  /** Navigation seam. Default: none — page views require injection. */
  navigationSeam?: NavigationCallbackSeam;
}

export interface BootedClient {
  instance: ClickTrailInstance;
  /** Resolves when the instance has started (immediately without gating). */
  whenStarted(): Promise<ClickTrailInstance>;
  /** Detach navigation tracking (undefined when no seam was provided). */
  detachPageViews(): void;
}

function defaultCookieJar(): CookieJar {
  const doc = (): { cookie: string } | undefined =>
    (globalThis as { document?: { cookie: string } }).document;
  return {
    read: () => doc()?.cookie ?? '',
    write: (cookieString) => {
      const d = doc();
      if (d) d.cookie = cookieString;
    },
  };
}

/**
 * Create and (consent-permitting) start the browser SDK. No side effects
 * before this call — that is the whole point for resumable Qwik pages.
 */
export function bootClickTrailClient(
  config: ClickTrailQwikClientConfig,
  seams: ClientSeams = {},
): BootedClient {
  const jar = seams.cookieJar ?? defaultCookieJar();

  const destinations: ClickTrailConfig['destinations'] = [
    httpDestination({ endpoint: config.endpoint }),
  ];

  const instance = createClickTrail({
    destinations,
    ...(config.siteId !== undefined ? { siteId: config.siteId } : {}),
    ...(config.workspaceId !== undefined ? { workspaceId: config.workspaceId } : {}),
    storage: {},
  });

  let detachPageViews: () => void = () => undefined;
  if (seams.navigationSeam !== undefined) {
    detachPageViews = attachQwikNavigationTracking(instance, seams.navigationSeam);
  }

  let resolveStart!: () => void;
  const whenStarted = new Promise<ClickTrailInstance>((resolve) => {
    resolveStart = () => resolve(instance);
  });

  const startNow = (): void => {
    if (!instance.isStarted()) instance.start();
    resolveStart();
  };

  if (config.consentRequired) {
    const target = seams.eventTarget ?? tryDefaultEventTarget();
    target?.addEventListener(CONSENT_EVENT, () => {
      const state = readStoredConsent(jar);
      if (state === true) startNow();
      else if (state === false) {
        instance.clearData();
        if (instance.isStarted()) instance.stop();
      }
    });
    if (readStoredConsent(jar) === true) startNow();
  } else {
    startNow();
  }

  if (config.debug && typeof console !== 'undefined') {
    console.info(`[clicktrail] endpoint=${config.endpoint}`);
  }

  return { instance, whenStarted: () => whenStarted, detachPageViews };
}

function tryDefaultEventTarget(): ConsentEventTargetLike | undefined {
  return (globalThis as unknown as { document?: ConsentEventTargetLike }).document;
}

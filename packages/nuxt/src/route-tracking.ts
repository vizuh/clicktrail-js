/**
 * Route-change page-view + touch-merge wiring for vue-router navigations.
 *
 * One dedupe rule covers every navigation shape:
 * - initial load -> tracked once on attach
 * - router.afterEach refires for the same route -> skipped
 * - query change -> tracked; fragment-only change -> ignored
 * - real reload -> module state resets, counts as a new view
 *
 * Duplicate suppression is URL-keyed (pathname + search), mirroring the
 * Astro package's view-transition dedupe. Attribution touches are merged
 * per URL change ONLY when captureClickIds is enabled, so first-touch /
 * last-touch state stays current across client-side navigations.
 */
import { parseAttributionUrl } from '@vizuh/clicktrail';
import type { ClickTrailInstance } from '@vizuh/clicktrail/browser';

export interface RouteLocationLike {
  fullPath?: string;
  path?: string;
  hash?: string;
  [key: string]: unknown;
}

/**
 * Router seam: href/host/referrer describe the current document (for
 * attribution parsing); afterEach registers a post-navigation callback and
 * returns an unregister function (vue-router afterEach contract).
 */
export interface RouteTrackingSeam {
  /** Full href of the current document location. */
  href(): string;
  /** External referrer of the current document ('' when none). */
  referrer(): string;
  /** Host of the current site, used to ignore internal referrals. */
  host(): string;
  afterEach(handler: (to: RouteLocationLike, from: RouteLocationLike) => void): () => void;
}

/** Stable dedupe key: pathname + search. Fragments are ignored. */
export function pageKeyOf(href: string): string {
  try {
    const u = new URL(href);
    return `${u.pathname}${u.search}`;
  } catch {
    return href;
  }
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
export function attachRouteTracking(
  instance: Pick<ClickTrailInstance, 'track' | 'mergeParsedTouch'>,
  seam: RouteTrackingSeam,
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
  const detachAfterEach = seam.afterEach(() => handleNavigation());

  return () => detachAfterEach();
}

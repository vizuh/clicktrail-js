/**
 * Page-view + touch-merge wiring for Astro navigations.
 *
 * Handles three navigation shapes with ONE dedupe rule:
 * - full page load (static/SSR/hybrid) -> tracked once on attach
 * - Astro view transitions (`astro:page-load`) -> tracked only when the URL changed
 * - browser back/forward under view transitions -> same `astro:page-load` path
 *
 * Duplicate suppression is URL-keyed (pathname + search): re-firing
 * `astro:page-load` for the same document never emits a second event.
 * A real reload resets module state, so it correctly counts as a new view.
 *
 * Attribution touches are merged per URL change so first-touch/last-touch
 * state stays current across client-side navigations.
 */
import { parseAttributionUrl } from '@vizuh/clicktrail';
import type { ClickTrailInstance } from '@vizuh/clicktrail/browser';

export interface NavigationSeam {
  /** Full href of the current document location. */
  href(): string;
  /** External referrer of the current document ('' when none). */
  referrer(): string;
  /** Host of the current site, used to ignore internal referrals. */
  host(): string;
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

export interface PageViewTrackerOptions {
  /** Event name emitted per view. Default 'page_view'. */
  eventName?: string;
}

const DEFAULT_PAGE_VIEW_EVENT = 'page_view';

/**
 * Attach initial-load + view-transition tracking. Returns a detach fn.
 * Safe before start(): track() is a no-op pre-start and touch merges stay
 * in memory until start() persists them — consent deferral therefore holds.
 */
export function attachPageViewTracking(
  instance: Pick<ClickTrailInstance, 'track' | 'mergeParsedTouch'>,
  seam: NavigationSeam,
  addListener: (type: string, handler: () => void) => void,
  removeListener: (type: string, handler: () => void) => void,
  options: PageViewTrackerOptions = {},
): () => void {
  const eventName = options.eventName ?? DEFAULT_PAGE_VIEW_EVENT;
  let lastKey: string | null = null;

  const handleNavigation = (): void => {
    const href = seam.href();
    const key = pageKeyOf(href);
    if (key === lastKey) return;
    lastKey = key;

    const result = parseAttributionUrl({
      url: href,
      ...(seam.referrer() ? { referrer: seam.referrer() } : {}),
      ...(seam.host() ? { currentHost: seam.host() } : {}),
      now: new Date().toISOString(),
    });
    if (result.kind === 'touch') {
      instance.mergeParsedTouch(result.touch);
    }
    instance.track(eventName, { page_location: href });
  };

  handleNavigation();
  addListener('astro:page-load', handleNavigation);

  return () => removeListener('astro:page-load', handleNavigation);
}

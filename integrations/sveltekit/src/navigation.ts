/**
 * Page-view + touch-merge wiring for SvelteKit navigations.
 *
 * One dedupe rule over an afterNavigate-style callback seam:
 * - full page load -> tracked once on attach
 * - SvelteKit afterNavigate / history events -> tracked only when URL changed
 *
 * Duplicate suppression is URL-keyed (pathname + search): re-firing
 * afterNavigate for the same document never emits a second event.
 */
import { parseAttributionUrl } from '@vizuh/clicktrail-core';
import type { ClickTrailInstance } from '@vizuh/clicktrail/browser';

export interface NavigationSeam {
  /** Full href of the current document location. */
  href(): string;
  /** External referrer of the current document ('' when none). */
  referrer(): string;
  /** Host of the current site, used to ignore internal referrals. */
  host(): string;
  /**
   * Subscribe to navigation completions (SvelteKit's afterNavigate shape:
   * a callback plus unsubscribe return). Called once per navigation.
   */
  afterNavigate(callback: () => void): () => void;
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

export interface NavigationTrackerOptions {
  /** Event name emitted per view. Default 'page_view'. */
  eventName?: string;
  /** When false, merge touches but emit no page_view events. Default true. */
  trackPageViews?: boolean;
}

const DEFAULT_PAGE_VIEW_EVENT = 'page_view';

/**
 * Attach initial-load + navigation tracking. Returns a detach fn. Safe
 * before start(): track() is a no-op pre-start and touch merges stay in
 * memory until start() persists them — consent deferral therefore holds.
 */
export function attachNavigationTracking(
  instance: Pick<ClickTrailInstance, 'track' | 'mergeParsedTouch'>,
  seam: NavigationSeam,
  options: NavigationTrackerOptions = {},
): () => void {
  if (options.trackPageViews === false) {
    // Touches still merge on URL change so attribution stays current, but no
    // page_view event is emitted.
    let lastKeyTouchOnly: string | null = null;
    const mergeOnly = (): void => {
      const href = seam.href();
      const key = pageKeyOf(href);
      if (key === lastKeyTouchOnly) return;
      lastKeyTouchOnly = key;
      const result = parseAttributionUrl({
        url: href,
        ...(seam.referrer() ? { referrer: seam.referrer() } : {}),
        ...(seam.host() ? { currentHost: seam.host() } : {}),
        now: new Date().toISOString(),
      });
      if (result.kind === 'touch') instance.mergeParsedTouch(result.touch);
    };
    mergeOnly();
    return seam.afterNavigate(mergeOnly);
  }

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
  return seam.afterNavigate(handleNavigation);
}

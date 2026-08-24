import { describe, expect, it, vi } from 'vitest';
import { attachRouteTracking, pageKeyOf } from '../src/route-tracking.js';
import type { RouteLocationLike, RouteTrackingSeam } from '../src/route-tracking.js';

const NOW = (): string => '2026-01-01T00:00:00.000Z';

function makeHarness(href: string, captureClickIds?: boolean) {
  let current = href;
  const handlers = new Set<(to: RouteLocationLike, from: RouteLocationLike) => void>();
  const seam: RouteTrackingSeam = {
    href: () => current,
    referrer: () => '',
    host: () => 'example.com',
    afterEach: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  const navigate = (next: string): void => {
    current = next;
    for (const h of [...handlers]) h({}, {});
  };
  const detachRef = { fn: () => {} };
  const track = vi.fn();
  const mergeParsedTouch = vi.fn();
  detachRef.fn = attachRouteTracking(
    { track, mergeParsedTouch },
    seam,
    {
      now: NOW,
      ...(captureClickIds === false ? { captureClickIds: false } : {}),
    },
  );
  return { track, mergeParsedTouch, navigate, detach: detachRef.fn };
}

describe('pageKeyOf', () => {
  it('keys on pathname+search and ignores fragments', () => {
    expect(pageKeyOf('https://x.com/a?b=1#frag')).toBe('/a?b=1');
    expect(pageKeyOf('https://x.com/a?b=1')).toBe('/a?b=1');
    expect(pageKeyOf('not-a-url')).toBe('not-a-url');
  });
});

describe('attachRouteTracking dedupe table', () => {
  it('tracks the initial load exactly once', () => {
    const h = makeHarness('https://example.com/');
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith('page_view', { page_location: 'https://example.com/' });
  });

  it('skips a same-URL afterEach refire (same document)', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('tracks a query change as a new view', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing?utm_source=nl');
    expect(h.track).toHaveBeenCalledTimes(2);
    expect(h.track).toHaveBeenLastCalledWith('page_view', {
      page_location: 'https://example.com/pricing?utm_source=nl',
    });
  });

  it('ignores fragment-only changes', () => {
    const h = makeHarness('https://example.com/pricing#top');
    h.navigate('https://example.com/pricing#faq');
    h.navigate('https://example.com/pricing');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('counts a full sequence: initial, same-URL refire, query change, back to clean URL', () => {
    const h = makeHarness('https://example.com/');
    h.navigate('https://example.com/'); // refire skipped
    h.navigate('https://example.com/?q=1'); // tracked
    h.navigate('https://example.com/'); // tracked again (different key)
    expect(h.track).toHaveBeenCalledTimes(3);
  });
});

describe('attribution touch merging', () => {
  it('merges a paid touch per URL change when captureClickIds is on', () => {
    const h = makeHarness('https://example.com/?gclid=C-123');
    const touch = h.mergeParsedTouch.mock.calls[0]![0] as Record<string, unknown>;
    expect(touch['channel']).toBe('paid_search');
    h.navigate('https://example.com/?gclid=C-456');
    expect(h.mergeParsedTouch).toHaveBeenCalledTimes(2);
  });

  it('never merges touches when captureClickIds is false', () => {
    const h = makeHarness('https://example.com/?utm_source=nl&fbclid=F-1', false);
    h.navigate('https://example.com/?utm_source=other');
    expect(h.mergeParsedTouch).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledTimes(2); // page views still tracked
  });

  it('does not merge plain internal navigations without signals', () => {
    const h = makeHarness('https://example.com/');
    h.navigate('https://example.com/about');
    expect(h.mergeParsedTouch).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledTimes(2);
  });
});

describe('detach', () => {
  it('stops tracking after detach', () => {
    const h = makeHarness('https://example.com/');
    h.detach();
    h.navigate('https://example.com/next');
    expect(h.track).toHaveBeenCalledTimes(1);
  });
});

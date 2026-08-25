import { describe, expect, it, vi } from 'vitest';
import { attachNavigationTracking, pageKeyOf } from '../src/navigation.js';
import type { NavigationSeam } from '../src/navigation.js';

interface Harness {
  track: ReturnType<typeof vi.fn>;
  mergeParsedTouch: ReturnType<typeof vi.fn>;
}

function makeHarness(href: string, referrer = '', host = 'example.com') {
  let currentHref = href;
  const callbacks = new Set<() => void>();
  const harness: Harness = {
    track: vi.fn(),
    mergeParsedTouch: vi.fn(),
  };
  const seam: NavigationSeam = {
    href: () => currentHref,
    referrer: () => referrer,
    host: () => host,
    afterNavigate: (cb) => {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },
  };
  const navigate = (next: string) => {
    currentHref = next;
    for (const cb of [...callbacks]) cb();
  };
  const detach = attachNavigationTracking(harness, seam);
  return { ...harness, navigate, detach, callbacks };
}

describe('pageKeyOf', () => {
  it('keys on pathname+search and ignores fragments', () => {
    expect(pageKeyOf('https://x.com/a?b=1#frag')).toBe('/a?b=1');
    expect(pageKeyOf('https://x.com/a?b=1')).toBe('/a?b=1');
    expect(pageKeyOf('not-a-url')).toBe('not-a-url');
  });
});

describe('attachNavigationTracking', () => {
  it('tracks the initial load exactly once', () => {
    const h = makeHarness('https://example.com/');
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith('page_view', { page_location: 'https://example.com/' });
  });

  it('skips same-URL afterNavigate re-fires', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing');
    h.navigate('https://example.com/pricing#faq'); // fragment-only change
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('tracks query-string changes as new page views', () => {
    const h = makeHarness('https://example.com/');
    h.navigate('https://example.com/pricing');
    h.navigate('https://example.com/pricing?utm_source=nl&utm_campaign=launch');
    h.navigate('https://example.com/pricing?utm_source=other&utm_campaign=launch');
    // initial + pricing + two distinct query strings
    expect(h.track).toHaveBeenCalledTimes(4);
  });

  it('merges parsed touches per URL change', () => {
    const h = makeHarness('https://example.com/');
    expect(h.mergeParsedTouch).not.toHaveBeenCalled(); // no signal on landing
    h.navigate('https://example.com/?gclid=xyz');
    expect(h.mergeParsedTouch).toHaveBeenCalledTimes(1);
    const touch = h.mergeParsedTouch.mock.calls[0]![0] as Record<string, unknown>;
    expect(touch['clickIds']).toEqual({ gclid: 'xyz' });
  });

  it('detach unsubscribes from the navigation seam', () => {
    const h = makeHarness('https://example.com/');
    h.detach();
    expect(h.callbacks.size).toBe(0);
    h.navigate('https://example.com/other');
    expect(h.track).toHaveBeenCalledTimes(1); // still just the initial view
  });

  it('trackPageViews=false keeps touch merges but drops page_view events', () => {
    let currentHref = 'https://example.com/';
    const callbacks = new Set<() => void>();
    const track = vi.fn();
    const mergeParsedTouch = vi.fn();
    const detachFn = attachNavigationTracking(
      { track, mergeParsedTouch },
      {
        href: () => currentHref,
        referrer: () => '',
        host: () => 'example.com',
        afterNavigate: (cb) => {
          callbacks.add(cb);
          return () => callbacks.delete(cb);
        },
      },
      { trackPageViews: false },
    );
    currentHref = 'https://example.com/?utm_source=x';
    for (const cb of [...callbacks]) cb();
    expect(track).not.toHaveBeenCalled();
    expect(mergeParsedTouch).toHaveBeenCalledTimes(1);
    detachFn();
  });
});

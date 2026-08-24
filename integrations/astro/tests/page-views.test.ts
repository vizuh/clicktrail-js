import { describe, expect, it, vi } from 'vitest';
import { attachPageViewTracking, pageKeyOf } from '../src/page-views.js';

interface Harness {
  track: ReturnType<typeof vi.fn>;
  mergeParsedTouch: ReturnType<typeof vi.fn>;
  listeners: Map<string, () => void>;
}

function makeHarness(href: string, referrer = '', host = 'example.com') {
  let currentHref = href;
  const harness: Harness = {
    track: vi.fn(),
    mergeParsedTouch: vi.fn(),
    listeners: new Map(),
  };
  const seam = {
    href: () => currentHref,
    referrer: () => referrer,
    host: () => host,
  };
  const navigate = (next: string) => {
    currentHref = next;
    harness.listeners.get('astro:page-load')?.();
  };
  const detach = attachPageViewTracking(harness, seam, (t, h) => harness.listeners.set(t, h), (t, h) => {
    if (harness.listeners.get(t) === h) harness.listeners.delete(t);
  });
  return { ...harness, navigate, detach };
}

describe('pageKeyOf', () => {
  it('keys on pathname+search and ignores fragments', () => {
    expect(pageKeyOf('https://x.com/a?b=1#frag')).toBe('/a?b=1');
    expect(pageKeyOf('https://x.com/a?b=1')).toBe('/a?b=1');
    expect(pageKeyOf('not-a-url')).toBe('not-a-url');
  });
});

describe('attachPageViewTracking', () => {
  it('tracks the initial load exactly once', () => {
    const h = makeHarness('https://example.com/');
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith('page_view', { page_location: 'https://example.com/' });
  });

  it('suppresses duplicate astro:page-load firings for the same document', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing'); // VT re-fire, same URL
    h.navigate('https://example.com/pricing#faq'); // fragment-only change
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('tracks real navigations and re-merges touches per URL change', () => {
    const h = makeHarness('https://example.com/');
    h.navigate('https://example.com/pricing');
    h.navigate('https://example.com/pricing?utm_source=nl&utm_campaign=launch');
    h.navigate('https://example.com/pricing?utm_source=other&utm_campaign=launch');
    // initial + pricing + two distinct query strings = 4 page views
    expect(h.track).toHaveBeenCalledTimes(4);
    expect(h.mergeParsedTouch).toHaveBeenCalledTimes(2); // only URLs carrying signals
    const touch = h.mergeParsedTouch.mock.calls[0]![0] as Record<string, unknown>;
    expect(touch['source']).toBe('nl');
    expect(touch['channelLabel']).toBeTruthy();
  });

  it('merges a paid touch from a bare click id', () => {
    const h = makeHarness('https://example.com/?gclid=C-123');
    const touch = h.mergeParsedTouch.mock.calls[0]![0] as Record<string, unknown>;
    expect(touch['channel']).toBe('paid_search');
  });

  it('detach removes the astro listener', () => {
    const h = makeHarness('https://example.com/');
    h.detach();
    expect(h.listeners.has('astro:page-load')).toBe(false);
  });
});

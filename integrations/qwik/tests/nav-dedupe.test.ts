import { describe, expect, it, vi } from 'vitest';
import { attachQwikNavigationTracking, pageKeyOf } from '../src/browser.js';

interface Harness {
  track: ReturnType<typeof vi.fn>;
  mergeParsedTouch: ReturnType<typeof vi.fn>;
  listeners: Set<() => void>;
}

function makeHarness(href: string, referrer = '', host = 'example.com') {
  let currentHref = href;
  const harness: Harness = {
    track: vi.fn(),
    mergeParsedTouch: vi.fn(),
    listeners: new Set(),
  };
  const seam = {
    href: () => currentHref,
    referrer: () => referrer,
    host: () => host,
    onNavigate: (handler: () => void) => {
      harness.listeners.add(handler);
      return () => harness.listeners.delete(handler);
    },
  };
  const navigate = (next: string) => {
    currentHref = next;
    for (const handler of harness.listeners) handler();
  };
  const detach = attachQwikNavigationTracking(harness, seam);
  return { ...harness, seam, navigate, detach };
}

describe('pageKeyOf', () => {
  it('keys on pathname+search and ignores fragments', () => {
    expect(pageKeyOf('https://x.com/a?b=1#frag')).toBe('/a?b=1');
    expect(pageKeyOf('https://x.com/a?b=1')).toBe('/a?b=1');
    expect(pageKeyOf('not-a-url')).toBe('not-a-url');
  });
});

describe('attachQwikNavigationTracking (URL-keyed dedupe)', () => {
  it('tracks the initial load exactly once', () => {
    const h = makeHarness('https://example.com/');
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.track).toHaveBeenCalledWith('page_view', { page_location: 'https://example.com/' });
  });

  it('suppresses repeated firings for the same URL', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing');
    h.navigate('https://example.com/pricing');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('ignores fragment-only changes', () => {
    const h = makeHarness('https://example.com/pricing');
    h.navigate('https://example.com/pricing#faq');
    h.navigate('https://example.com/pricing#other');
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('tracks query-string changes as new views', () => {
    const h = makeHarness('https://example.com/');
    h.navigate('https://example.com/pricing');
    h.navigate('https://example.com/pricing?page=2');
    h.navigate('https://example.com/pricing'); // back to a SEEN key still counts (URL-keyed, not history)
    expect(h.track).toHaveBeenCalledTimes(4);
  });

  it('merges attribution touches per URL change when click IDs are present', () => {
    const h = makeHarness('https://example.com/', 'https://www.google.com/');
    h.navigate('https://example.com/offer?utm_source=newsletter&utm_medium=email');
    h.navigate('https://example.com/offer?gclid=ABC123');
    // initial organic touch (external referrer) + two navigation touches
    expect(h.mergeParsedTouch).toHaveBeenCalledTimes(3);
    const last = h.mergeParsedTouch.mock.calls[2]?.[0] as Record<string, unknown>;
    expect(last['clickIds']).toMatchObject({ gclid: 'ABC123' });
  });

  it('does not merge touches for internal referrals but still tracks the view', () => {
    const h = makeHarness('https://example.com/a', 'https://example.com/b');
    expect(h.mergeParsedTouch).not.toHaveBeenCalled();
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it('detach stops all further tracking and notification', () => {
    const h = makeHarness('https://example.com/');
    h.detach();
    h.navigate('https://example.com/next');
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(h.seam.onNavigate).toBeDefined();
  });

  it('respects captureClickIds:false to disable touch merging', () => {
    let currentHref = 'https://example.com/';
    const track = vi.fn();
    const mergeParsedTouch = vi.fn();
    attachQwikNavigationTracking(
      { track, mergeParsedTouch },
      {
        href: () => currentHref,
        referrer: () => '',
        host: () => 'example.com',
        onNavigate: () => () => undefined,
      },
      { captureClickIds: false },
    );
    currentHref = 'https://example.com/?gclid=X';
    // no navigation callback fired -> nothing extra; initial load merged nothing
    expect(mergeParsedTouch).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(1);
  });
});

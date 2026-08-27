import { describe, expect, it, vi } from 'vitest';
import { bootClickTrailClient, defaultNavigationSeam } from '../src/client.js';
import { CONSENT_EVENT } from '../src/consent-client.js';

function harness(href = 'https://example.com/') {
  let cookie = '';
  const handlers = new Set<() => void>();
  let navigationDetached = 0;
  return {
    setConsent(value: 'granted' | 'denied') {
      cookie = `ct_consent=${value}`;
    },
    dispatchConsent() {
      for (const handler of [...handlers]) handler();
    },
    listenerCount: () => handlers.size,
    navigationDetached: () => navigationDetached,
    seams: {
      cookieJar: { read: () => cookie, write: () => {} },
      eventTarget: {
        addEventListener: (type: string, handler: () => void) => {
          if (type === CONSENT_EVENT) handlers.add(handler);
        },
        removeEventListener: (type: string, handler: () => void) => {
          if (type === CONSENT_EVENT) handlers.delete(handler);
        },
      },
      navigationSeam: {
        href: () => href,
        referrer: () => '',
        host: () => 'example.com',
        afterNavigate: () => () => { navigationDetached += 1; },
      },
    },
  };
}

describe('SvelteKit client consent lifecycle', () => {
  it('restores fallback navigation hooks after the last consumer detaches', () => {
    const originalPushState = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('history', { pushState: originalPushState });
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('removeEventListener', removeEventListener);

    const firstSeam = defaultNavigationSeam();
    const secondSeam = defaultNavigationSeam();
    const first = vi.fn();
    const second = vi.fn();
    const detachFirst = firstSeam.afterNavigate(first);
    const patchedPushState = globalThis.history.pushState;
    const detachSecond = secondSeam.afterNavigate(second);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    globalThis.history.pushState({}, '', '/first');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    detachFirst();
    expect(removeEventListener).not.toHaveBeenCalled();
    expect(globalThis.history.pushState).toBe(patchedPushState);
    globalThis.history.pushState({}, '', '/second');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    detachSecond();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(globalThis.history.pushState).toBe(originalPushState);
    globalThis.history.pushState({}, '', '/third');
    expect(originalPushState).toHaveBeenCalledTimes(3);
    expect(second).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('does not merge initial attribution before consent', () => {
    const h = harness('https://example.com/?utm_source=google');
    const client = bootClickTrailClient({
      endpoint: 'https://collector.example.com/events',
      consentRequired: true,
      trackPageViews: true,
      debug: false,
    }, h.seams);

    expect(client.instance.getField('ft_source')).toBe('');
  });

  it('clears on denial and disposal detaches every owned listener', () => {
    const h = harness();
    const client = bootClickTrailClient({
      endpoint: 'https://collector.example.com/events',
      consentRequired: true,
      trackPageViews: true,
      debug: false,
    }, h.seams);

    expect(client.instance.isStarted()).toBe(false);
    expect(h.listenerCount()).toBe(1);

    h.setConsent('granted');
    h.dispatchConsent();
    client.instance.hydrateStoredPayload({ gclid: 'test-click' });
    expect(client.instance.isStarted()).toBe(true);
    expect(client.instance.getField('gclid')).toBe('test-click');

    h.setConsent('denied');
    h.dispatchConsent();
    expect(client.instance.isStarted()).toBe(false);
    expect(client.instance.getField('gclid')).toBe('');

    client.dispose();
    expect(h.listenerCount()).toBe(0);
    expect(h.navigationDetached()).toBe(1);
    h.setConsent('granted');
    h.dispatchConsent();
    expect(client.instance.isStarted()).toBe(false);
  });
});

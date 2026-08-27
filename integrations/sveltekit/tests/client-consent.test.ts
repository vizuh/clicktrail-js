import { describe, expect, it } from 'vitest';
import { bootClickTrailClient } from '../src/client.js';
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

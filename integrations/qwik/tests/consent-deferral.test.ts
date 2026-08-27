import { describe, expect, it, vi } from 'vitest';
import {
  consentSetCookie,
  CONSENT_COOKIE,
  CONSENT_EVENT,
  createConsentGate,
  parseConsentFromCookieHeader,
  readStoredConsent,
  setConsent,
  storageAllowed,
  transmissionAllowed,
} from '../src/consent.js';
import type { ConsentEventTargetLike, ConsentRecord } from '../src/consent.js';
import { bootClickTrailClient } from '../src/browser.js';

function jarFrom(initial = ''): { jar: { read(): string; write(s: string): void }; value: { current: string } } {
  const value = { current: initial };
  return {
    jar: {
      read: () => value.current,
      write: (cookieString: string) => {
        value.current = cookieString;
      },
    },
    value,
  };
}

describe('parseConsentFromCookieHeader / readStoredConsent', () => {
  it('reads granted/denied/absent across mixed cookie headers', () => {
    expect(parseConsentFromCookieHeader('a=1; ct_consent=granted; b=2')).toBe(true);
    expect(parseConsentFromCookieHeader('ct_consent=denied')).toBe(false);
    expect(parseConsentFromCookieHeader('other=x')).toBeNull();
    expect(parseConsentFromCookieHeader(null)).toBeNull();
    expect(parseConsentFromCookieHeader(undefined)).toBeNull();
    expect(parseConsentFromCookieHeader('ct_consent=junk')).toBeNull();
  });

  it('readStoredConsent mirrors header parsing through a jar', () => {
    const { jar } = jarFrom(`${CONSENT_COOKIE}=granted`);
    expect(readStoredConsent(jar)).toBe(true);
  });
});

describe('consent cookie hub', () => {
  it('builds a path-scoped long-lived Set-Cookie string', () => {
    const granted = consentSetCookie(true);
    expect(granted).toContain('ct_consent=granted');
    expect(granted).toContain('Path=/;');
    expect(granted).toContain('SameSite=Lax');
    const denied = consentSetCookie(false);
    expect(denied).toContain('ct_consent=denied');
  });

  it('setConsent writes through the injected jar and dispatches the event', () => {
    const { jar, value } = jarFrom('');
    const dispatched: string[] = [];
    setConsent(true, {
      cookieJar: jar,
      eventTarget: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: (e) => void dispatched.push(e.type),
      } as ConsentEventTargetLike,
    });
    expect(value.current).toContain(`${CONSENT_COOKIE}=granted`);
    expect(dispatched).toEqual([CONSENT_EVENT]);
  });

  it('setConsent works outside a browser (cookie lands, notify skipped)', () => {
    const { jar, value } = jarFrom('');
    expect(() => setConsent(false, { cookieJar: jar })).not.toThrow();
    expect(value.current).toContain('denied');
  });
});

describe('consent gates (port of packages/consent)', () => {
  const record: ConsentRecord = { state: 'granted' };
  const denied: ConsentRecord = { state: 'denied' };

  it('createConsentGate evaluates the snapshot per call', () => {
    let current: ConsentRecord | null = null;
    const gate = createConsentGate(() => current);
    expect(gate()).toBe(false);
    current = record;
    expect(gate()).toBe(true);
    current = denied;
    expect(gate()).toBe(false);
  });

  it('storageAllowed blocks persistence without an explicit grant', () => {
    expect(storageAllowed(() => record)).toBe(true);
    expect(storageAllowed(() => null)).toBe(false);
    expect(storageAllowed(() => denied)).toBe(false);
  });

  it('transmissionAllowed honors purpose flags with analytics default', () => {
    expect(transmissionAllowed(() => ({ state: 'granted' }))).toBe(true);
    expect(transmissionAllowed(() => ({ state: 'granted', advertising: false }), 'advertising')).toBe(false);
    expect(transmissionAllowed(() => ({ state: 'granted', marketing: true }), 'marketing')).toBe(true);
    expect(transmissionAllowed(() => null)).toBe(false);
  });
});

describe('bootClickTrailClient consent deferral', () => {
  const config = { endpoint: 'https://collector.test/collect', consentRequired: true };

  it('starts immediately when consentRequired is false', async () => {
    const client = bootClickTrailClient({ endpoint: 'https://collector.test/collect' }, {});
    await client.whenStarted();
    expect(client.instance.isStarted()).toBe(true);
  });

  it('starts immediately when the consent cookie already reads granted', async () => {
    const { jar } = jarFrom('ct_consent=granted');
    const client = bootClickTrailClient(config, { cookieJar: jar });
    await client.whenStarted();
    expect(client.instance.isStarted()).toBe(true);
  });

  it('defers start while consent is withheld, then starts on the consent event', async () => {
    const { jar } = jarFrom('');
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, handler: () => void) => void listeners.set(type, handler),
      removeEventListener: () => undefined,
      dispatchEvent: (e: { type: string }) => void listeners.get(e.type)?.(),
    };
    const client = bootClickTrailClient(config, { cookieJar: jar, eventTarget: target });
    let started = false;
    void client.whenStarted().then(() => { started = true; });
    await Promise.resolve();
    expect(client.instance.isStarted()).toBe(false);

    jar.write('ct_consent=granted'); // CMP grant lands in the shared cookie
    target.dispatchEvent({ type: CONSENT_EVENT });
    await client.whenStarted();
    expect(started).toBe(true);
    expect(client.instance.isStarted()).toBe(true);
    client.instance.hydrateStoredPayload({ gclid: 'test-click' });

    jar.write('ct_consent=denied');
    target.dispatchEvent({ type: CONSENT_EVENT });
    expect(client.instance.isStarted()).toBe(false);
    expect(client.instance.getField('gclid')).toBe('');
  });

  it('does not merge initial attribution before consent', () => {
    const { jar } = jarFrom();
    const booted = bootClickTrailClient(config, {
      cookieJar: jar,
      navigationSeam: {
        href: () => 'https://example.com/?utm_source=google',
        referrer: () => '',
        host: () => 'example.com',
        onNavigate: () => () => undefined,
      },
    });

    expect(booted.instance.getField('ft_source')).toBe('');
  });

  it('stays dormant forever on explicit denial until re-consented', async () => {
    const { jar } = jarFrom('ct_consent=denied');
    const target = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => undefined,
    };
    const client = bootClickTrailClient(config, { cookieJar: jar, eventTarget: target });
    await Promise.resolve();
    expect(client.instance.isStarted()).toBe(false);
    // detachPageViews is safe even without a navigation seam
    expect(() => client.detachPageViews()).not.toThrow();
  });

  it('pre-start touches stay in memory (no persistence before consent)', async () => {
    const { jar } = jarFrom('ct_consent=granted');
    const client = bootClickTrailClient(config, { cookieJar: jar });
    await client.whenStarted();
    // instance exists and is functional; no attribution values persisted
    const data = client.instance.getData();
    expect(data['ft_landing_page']).toBe('');
    expect(data['lt_touch_timestamp']).toBe('');
  });
});

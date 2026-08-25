import { describe, expect, it, vi } from 'vitest';
import type { CookieJar } from '@vizuh/clicktrail/browser';
import { bootClickTrailClient } from '../src/client.js';
import {
  CONSENT_COOKIE,
  CONSENT_EVENT,
  readStoredConsent,
  setConsent,
  writeConsentCookie,
} from '../src/consent.js';

function makeJar(): CookieJar & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    read: () => [...entries].map(([k, v]) => `${k}=${v}`).join('; '),
    write: (cookieString) => {
      const [pair] = cookieString.split(';') as [string];
      const eq = pair.indexOf('=');
      entries.set(pair.slice(0, eq), pair.slice(eq + 1));
    },
  };
}

function makeTarget() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    listeners,
    addEventListener: (t: string, h: () => void) =>
      void listeners.set(t, [...(listeners.get(t) ?? []), h]),
    removeEventListener: (t: string, h: () => void) =>
      void listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== h)),
    dispatchEvent: (ev: { type: string }) => void (listeners.get(ev.type) ?? []).forEach((h) => h()),
    fire: (t: string) => (listeners.get(t) ?? []).forEach((h) => h()),
  };
}

function bootSeams(jar = makeJar()) {
  const target = makeTarget();
  return {
    jar,
    target,
    seams: {
      cookieJar: jar,
      eventTarget: target,
      routerSeam: {
        href: () => 'https://example.com/',
        referrer: () => '',
        host: () => 'example.com',
        afterEach: () => () => {},
      },
    },
  };
}

function cfg(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: '/api/ct',
    consentRequired: false,
    trackPageViews: false,
    captureClickIds: true,
    debug: false,
    ...overrides,
  };
}

describe('cookie-backed consent state', () => {
  it('round-trips granted/denied through the ct_consent cookie', () => {
    const jar = makeJar();
    expect(readStoredConsent(jar)).toBeNull();
    writeConsentCookie(true, jar);
    expect(readStoredConsent(jar)).toBe(true);
    writeConsentCookie(false, jar);
    expect(readStoredConsent(jar)).toBe(false);
  });

  it('maps unknown values and foreign cookies to null', () => {
    const jar = makeJar();
    jar.entries.set(CONSENT_COOKIE, 'maybe');
    expect(readStoredConsent(jar)).toBeNull();
    jar.entries.set('other', 'granted');
    expect(readStoredConsent(jar)).toBeNull();
  });

  it('setConsent writes the shared cookie and fires the consent event', () => {
    const jar = makeJar();
    const target = makeTarget();
    const onConsent = vi.fn();
    target.addEventListener(CONSENT_EVENT, onConsent);
    setConsent(true, { cookieJar: jar, eventTarget: target });
    expect(jar.entries.get(CONSENT_COOKIE)).toBe('granted');
    expect(onConsent).toHaveBeenCalledOnce();
    expect(CONSENT_EVENT).toBe('clicktrail:consent');
  });
});

describe('consent deferral in client boot', () => {
  it('defers start until consent is granted', async () => {
    const s = bootSeams();
    const booted = bootClickTrailClient(cfg({ consentRequired: true }), s.seams);
    expect(booted.instance.isStarted()).toBe(false);

    setConsent(true, { cookieJar: s.jar, eventTarget: s.target });
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
  });

  it('stops a started instance when consent is denied later', async () => {
    const s = bootSeams();
    const booted = bootClickTrailClient(cfg({ consentRequired: true }), s.seams);
    setConsent(true, { cookieJar: s.jar, eventTarget: s.target });
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
    booted.instance.hydrateStoredPayload({ gclid: 'test-click' });

    setConsent(false, { cookieJar: s.jar, eventTarget: s.target });
    expect(booted.instance.isStarted()).toBe(false);
    expect(booted.instance.getField('gclid')).toBe('');
  });

  it('starts immediately when consent is not required', async () => {
    const s = bootSeams();
    const booted = bootClickTrailClient(cfg(), s.seams);
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
  });

  it('starts synchronously from an already-granted stored consent', async () => {
    const s = bootSeams();
    setConsent(true, { cookieJar: s.jar, eventTarget: s.target });
    const booted = bootClickTrailClient(cfg({ consentRequired: true }), s.seams);
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
  });

  it('never starts on a stored denial', async () => {
    const s = bootSeams();
    setConsent(false, { cookieJar: s.jar, eventTarget: s.target });
    const booted = bootClickTrailClient(cfg({ consentRequired: true }), s.seams);
    setConsent(false, { cookieJar: s.jar, eventTarget: s.target });
    await new Promise((r) => setTimeout(r, 0));
    expect(booted.instance.isStarted()).toBe(false);
  });
});

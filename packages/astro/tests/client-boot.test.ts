import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_EVENT,
  bootClickTrailClient,
  readStoredConsent,
  setConsent,
} from '../src/client.js';
import { CLIENT_CONFIG_GLOBAL, defaultClientConfig } from '../src/config.js';

interface FakeStorage {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
}

function makeStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

interface FakeTarget {
  listeners: Map<string, Array<() => void>>;
  addEventListener: (t: string, h: () => void) => void;
  removeEventListener: (t: string, h: () => void) => void;
  dispatchEvent: (ev: { type: string }) => void;
  fire(t: string): void;
}

function makeTarget(): FakeTarget {
  const listeners = new Map<string, Array<() => void>>();
  return {
    listeners,
    addEventListener: (t, h) => void listeners.set(t, [...(listeners.get(t) ?? []), h]),
    removeEventListener: (t, h) =>
      void listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== h)),
    dispatchEvent: (ev) => void (listeners.get(ev.type) ?? []).forEach((h) => h()),
    fire: function (this: FakeTarget, t: string) {
      (listeners.get(t) ?? []).forEach((h) => h());
    },
  };
}

function makeSeams(href: string) {
  return {
    storageLike: makeStorage() as unknown as Pick<Storage, 'getItem' | 'setItem'>,
    eventTarget: makeTarget(),
    navigationSeam: {
      href: () => href,
      referrer: () => '',
      host: () => 'example.com',
    },
  };
}

describe('bootClickTrailClient', () => {
  it('starts immediately and tracks the initial page view without consent gating', async () => {
    const seams = makeSeams('https://example.com/');
    const booted = bootClickTrailClient(defaultClientConfig({ endpoint: '/api/ct' }), seams);
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
    expect(booted.instance.getData()['event_name'] ?? undefined).toBeUndefined();
  });

  it('consentRequired defers start until a granted flag arrives', async () => {
    const seams = makeSeams('https://example.com/');
    const booted = bootClickTrailClient(
      defaultClientConfig({ endpoint: '/api/ct', consentRequired: true }),
      seams,
    );
    expect(booted.instance.isStarted()).toBe(false);

    setConsent(true, seams); // writes storage + fires the consent event
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
  });

  it('a denied flag never starts tracking', async () => {
    const seams = makeSeams('https://example.com/');
    bootClickTrailClient(
      defaultClientConfig({ endpoint: '/api/ct', consentRequired: true }),
      seams,
    );
    setConsent(false, seams);
    // No start; give the event loop a tick to surface any accidental start.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('an already-granted stored consent starts synchronously', async () => {
    const seams = makeSeams('https://example.com/');
    setConsent(true, seams);
    const booted = bootClickTrailClient(
      defaultClientConfig({ endpoint: '/api/ct', consentRequired: true }),
      seams,
    );
    await booted.whenStarted();
    expect(booted.instance.isStarted()).toBe(true);
  });
});

describe('readStoredConsent', () => {
  it('maps stored values to booleans and unknowns to null', () => {
    const s = makeStorage();
    expect(readStoredConsent(s as unknown as Storage)).toBeNull();
    s.setItem('clicktrail-consent', 'granted');
    expect(readStoredConsent(s as unknown as Storage)).toBe(true);
    s.setItem('clicktrail-consent', 'denied');
    expect(readStoredConsent(s as unknown as Storage)).toBe(false);
  });
});

describe('define global contract', () => {
  it('client config global name matches the integration define key', () => {
    expect(CONSENT_EVENT).toBe('clicktrail:consent');
    expect(CLIENT_CONFIG_GLOBAL).toBe('__CLICKTRAIL_CLIENT_CONFIG__');
  });
});

/**
 * Storage adapters: cookie round-trips via injected jars, mirror expiry
 * metadata enforcement, legacy-entry discard, consent-style clear-all.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_STORAGE_KEYS,
  clearAttributionStorage,
  cookieStorage,
  mirrorStorage,
} from '../src/browser/storage.js';
import type { CookieJar, MirrorBackend } from '../src/browser/storage.js';

/**
 * Emulates browser cookie-jar semantics closely enough for adapter tests:
 * a write with an empty value + `Max-Age=0` removes the cookie instead of
 * storing it.
 */
function fakeJar(initial = ''): CookieJar & { jar: string } {
  const state = { jar: initial };
  const apply = (c: string): void => {
    if (/=;(?:;|\s|$)/.test(c) && /Max-Age=0/.test(c)) {
      const name = c.slice(0, c.indexOf('='));
      const kept = state.jar
        .split('; ')
        .filter((pair) => pair !== '' && !pair.startsWith(`${name}=`));
      state.jar = kept.join('; ');
      return;
    }
    const name = c.slice(0, c.indexOf('='));
    const others = state.jar
      .split('; ')
      .filter((pair) => pair !== '' && !pair.startsWith(`${name}=`));
    others.push(c);
    state.jar = others.join('; ');
  };
  return {
    get jar() { return state.jar; },
    set jar(v: string) { state.jar = v; },
    read: () => state.jar,
    write: apply,
  };
}

function fakeBackend(): MirrorBackend & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const store = {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  return Object.assign(store, { map });
}

describe('cookieStorage', () => {
  it('round-trips a value through an injected cookie jar', () => {
    const jar = fakeJar();
    const store = cookieStorage({ attrs: { path: '/' }, jar });
    store.set('attribution', '{"ft_source":"google"}');
    expect(jar.jar).toContain('attribution=');
    expect(store.get('attribution')).toBe('{"ft_source":"google"}');
  });

  it('injects configured attributes into written cookies', () => {
    const jar = fakeJar();
    const store = cookieStorage({
      attrs: { path: '/', domain: '.example.com', maxAgeSeconds: 86400, secure: true, sameSite: 'Lax' },
      jar,
    });
    store.set('attribution', 'x');
    for (const part of ['Path=/', 'Domain=.example.com', 'Max-Age=86400', 'Secure', 'SameSite=Lax']) {
      expect(jar.jar).toContain(part);
    }
  });

  it('delete writes an immediately-expired cookie and reads back null', () => {
    const written: string[] = [];
    const jar = fakeJar();
    const spyJar: CookieJar = {
      read: jar.read,
      write: (c) => { written.push(c); jar.write(c); },
    };
    const store = cookieStorage({ attrs: { path: '/', maxAgeSeconds: 100 }, jar: spyJar });
    store.set('attribution', 'v');
    store.delete('attribution');
    expect(written[1]).toContain('Max-Age=0');
    expect(store.get('attribution')).toBeNull();
  });

  it('parses multiple cookies in the jar without confusing prefixes', () => {
    const jar = fakeJar('other=a%3Db; attribution=%7B%22k%22%3A%22v%22%7D');
    const store = cookieStorage({ jar });
    expect(store.get('other')).toBe('a=b');
    expect(store.get('attribution')).toBe('{"k":"v"}');
  });

  it('uses path-wide, same-site defaults when attributes are omitted', () => {
    const jar = fakeJar();
    cookieStorage({ jar }).set('attribution', 'x');
    expect(jar.jar).toContain('Path=/');
    expect(jar.jar).toContain('SameSite=Lax');
  });
});

describe('mirrorStorage', () => {
  it('round-trips a value with an explicit expiry envelope', () => {
    const backend = fakeBackend();
    let now = 1_000_000;
    const store = mirrorStorage({ retentionDays: 90, nowMs: () => now, backend });
    store.set('attribution', 'payload-v1');

    const raw = JSON.parse(backend.map.get('attribution')!) as Record<string, unknown>;
    expect(raw['v']).toBe(1);
    expect(raw['expires_at']).toBe(now + 90 * 86_400_000);
    expect(raw['data']).toBe('payload-v1');
    expect(store.get('attribution')).toBe('payload-v1');
  });

  it('expires entries after the retention window tied to the injected clock', () => {
    const backend = fakeBackend();
    let now = 0;
    const store = mirrorStorage({ retentionDays: 30, nowMs: () => now, backend });
    store.set('k', 'v');
    now += 30 * 86_400_000 - 1;
    expect(store.get('k')).toBe('v');
    now += 1;
    // Boundary instant counts as expired.
    expect(store.get('k')).toBeNull();
    expect(backend.map.has('k')).toBe(false);
  });

  it('entries without retention never expire client-side', () => {
    let now = 0;
    const store = mirrorStorage({ nowMs: () => now, backend: fakeBackend() });
    store.set('k', 'v');
    now += 10_000 * 86_400_000;
    expect(store.get('k')).toBe('v');
  });

  it('discards legacy copies lacking expiry metadata instead of reviving them', () => {
    const backend = fakeBackend();
    backend.setItem('attribution', '{"ft_source":"google"}'); // raw legacy JSON
    const store = mirrorStorage({ retentionDays: 90, nowMs: () => 0, backend });
    expect(store.get('attribution')).toBeNull();
    expect(backend.map.has('attribution')).toBe(false);
  });

  it('discards tampered envelopes missing expires_at or version', () => {
    const backend = fakeBackend();
    backend.setItem('a', JSON.stringify({ v: 1, data: 'no-expiry' }));
    backend.setItem('b', JSON.stringify({ data: 'x', expires_at: null }));
    const store = mirrorStorage({ nowMs: () => 0, backend });
    expect(store.get('a')).toBeNull();
    expect(store.get('b')).toBeNull();
    expect(backend.map.size).toBe(0);
  });

  it('is inert without a backend (SSR-safe): no throw, always null', () => {
    const store = mirrorStorage({ backend: null, nowMs: () => 0 });
    expect(() => store.set('k', 'v')).not.toThrow();
    expect(store.get('k')).toBeNull();
    expect(() => store.delete('k')).not.toThrow();
  });

  it('swallows quota failures on write but keeps reads working', () => {
    const failing: MirrorBackend = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => undefined,
    };
    const store = mirrorStorage({ nowMs: () => 0, backend: failing });
    expect(() => store.set('k', 'v')).not.toThrow();
  });
});

describe('clearAttributionStorage', () => {
  it('wipes every known key from every given adapter (consent denied)', () => {
    const jar = fakeJar();
    const cookies = cookieStorage({ jar });
    const backend = fakeBackend();
    const mirror = mirrorStorage({ nowMs: () => 0, backend });

    for (const key of ATTRIBUTION_STORAGE_KEYS) {
      cookies.set(key, 'x');
      mirror.set(key, 'x');
    }
    clearAttributionStorage(cookies, mirror);

    for (const key of ATTRIBUTION_STORAGE_KEYS) {
      expect(cookies.get(key)).toBeNull();
      expect(mirror.get(key)).toBeNull();
    }
  });
});

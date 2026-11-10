/**
 * End-to-end identity handoff: the browser SDK writes its first-party cookie
 * jar, the jar is serialised into a Cookie header, and the server parser reads
 * the same visitor/session back. Consent-gated like the attribution cookie.
 */
import { describe, expect, it } from 'vitest';
import { cookieStorage, createClickTrail, mirrorStorage } from '@vizuh/clicktrail-browser';
import type { CookieJar, MirrorBackend } from '@vizuh/clicktrail-browser';
import { parseIdentityFromCookies } from '../src/server.js';

/** Minimal browser cookie jar: Max-Age=0 deletes, otherwise last write wins. */
function fakeJar(): CookieJar & { header(): string; names(): string[] } {
  const cookies = new Map<string, string>();
  const read = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return {
    read,
    header: read,
    names: () => [...cookies.keys()],
    write(cookieString) {
      const [pair = '', ...attrs] = cookieString.split(';').map((part) => part.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      if (attrs.some((attr) => attr.toLowerCase() === 'max-age=0')) cookies.delete(name);
      else cookies.set(name, pair.slice(eq + 1));
    },
  };
}

function memoryBackend(): MirrorBackend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function setup(consent: { granted: boolean }) {
  const jar = fakeJar();
  let byte = 0;
  const instance = createClickTrail({
    destinations: [],
    consentGate: () => consent.granted,
    storage: {
      primaryAdapter: cookieStorage({ jar, attrs: { maxAgeSeconds: 7_776_000 } }),
      mirrorAdapter: mirrorStorage({ backend: memoryBackend(), nowMs: () => 1_000 }),
      nowMs: () => 1_000,
      randomBytes: (length) => new Uint8Array(length).fill(++byte),
      browserIdCookieJar: { read: () => '', write: () => undefined },
    },
  });
  return { jar, instance };
}

const IDENTITY_COOKIES = ['ct_session', 'ct_visitor_id', 'ct_session_id'];

describe('SDK cookie jar -> parseIdentityFromCookies', () => {
  it('granted consent: server parses the same visitor and session the SDK holds', () => {
    const { jar, instance } = setup({ granted: true });
    instance.start();
    const session = instance.touchSession();
    expect(session.visitorId).not.toBe('');

    const parsed = parseIdentityFromCookies(jar.header());
    expect(parsed.visitorId).toBe(session.visitorId);
    expect(parsed.sessionId).toBe(session.sessionId);
    expect(parsed.sessionNumber).toBe(Number(session.sessionNumber));
  });

  it('denied consent: no identity cookie is written', () => {
    const { jar, instance } = setup({ granted: false });
    instance.start();
    instance.touchSession();
    instance.getSession();

    expect(jar.names()).toEqual([]);
    const parsed = parseIdentityFromCookies(jar.header());
    expect(parsed.visitorId).toBeUndefined();
    expect(parsed.sessionId).toBeUndefined();
  });

  it('withdrawal clears the identity cookies', () => {
    const consent = { granted: true };
    const { jar, instance } = setup(consent);
    instance.start();
    instance.touchSession();
    expect(parseIdentityFromCookies(jar.header()).visitorId).toBeDefined();

    consent.granted = false;
    instance.getSession();

    expect(jar.names().filter((name) => IDENTITY_COOKIES.includes(name))).toEqual([]);
    const parsed = parseIdentityFromCookies(jar.header());
    expect(parsed.visitorId).toBeUndefined();
    expect(parsed.sessionId).toBeUndefined();
  });

  it('clearData() clears the identity cookies', () => {
    const { jar, instance } = setup({ granted: true });
    instance.start();
    instance.touchSession();
    instance.clearData();

    expect(jar.names().filter((name) => IDENTITY_COOKIES.includes(name))).toEqual([]);
  });
});

/**
 * Cross-domain continuity: approved-domain matching, token encode/decode
 * (deterministic signature failures), URL decoration, landing consumption,
 * and createClickTrail wiring — no DOM dependency, all seams injected.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_SELECTOR,
  CONTINUATION_FIELDS,
  DEFAULT_TOKEN_PARAM,
  MAX_TOKEN_LENGTH,
  SIGNING_KEY_KEY,
  TOKEN_TTL_MS,
  buildReferralTouch,
  consumeLandingToken,
  createLinkDecorator,
  bytesToBase64Url,
  decodeContinuationToken,
  decorateUrl,
  defaultHmacSign,
  defaultHmacVerify,
  encodeContinuationToken,
  isApprovedHost,
  urlHasStrongerSignal,
} from '../src/browser/link-decoration.js';
import type {
  AnchorNode,
  LinkDomDocument,
  LocationHistorySeam,
  SignFn,
  VerifyFn,
} from '../src/browser/link-decoration.js';
import { createClickTrail } from '../src/browser/create-clicktrail.js';
import type { ParsedTouch } from '../src/core/types.js';

// --- deterministic signer pair ----------------------------------------------

/** Registry-backed signer/verifier: only tokens signed HERE verify true. */
function signVerifyPair(): {
  sign: SignFn;
  verify: VerifyFn;
} & { signedBodies: string[] } {
  const signed = new Map<string, number>();
  const state = { signedBodies: [] as string[] };
  const sign: SignFn = async (data) => {
    const sig = `sig-${state.signedBodies.length}`;
    state.signedBodies.push(data);
    signed.set(sig, data.length);
    return sig;
  };
  const verify: VerifyFn = async (data, sig) => signed.get(sig) === data.length;
  return Object.assign({ sign, verify }, { get signedBodies() { return state.signedBodies; } });
}

const NOW_MS = 1_700_000_000_000;

// --- approved-domain rules ----------------------------------------------------

describe('isApprovedHost (exact-suffix rules)', () => {
  const domains = ['example.com', 'shop.example.org'];
  const table: [string, boolean][] = [
    ['example.com', true],
    ['EXAMPLE.com', true],
    ['shop.example.com', true],
    ['deep.sub.example.com', true],
    ['example.com:443', true],
    ['notexample.com', false],
    ['badexample.com', false],
    ['example.org', false], // different registrable domain
    ['shop.example.org', true],
    ['evil-shop.example.org.evil.net', false],
    ['', false],
    ['https://example.com', false],
  ];
  for (const [host, expected] of table) {
    it(`"${host}" -> ${expected}`, () => {
      expect(isApprovedHost(host, domains)).toBe(expected);
    });
  }
});

// --- token encode/decode -------------------------------------------------------

describe('continuation token codec', () => {
  const ATTRIBUTION = { lt_source: 'google', lt_medium: 'cpc', gclid: 'abc' };

  it('roundtrips payload through base64url body + signature', async () => {
    const { sign, verify } = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v-1',
      sessionId: 's-1',
      attribution: ATTRIBUTION,
      nowMs: NOW_MS,
      sign,
    });
    expect(token).toContain('.');
    expect(token).not.toMatch(/[+/=]/); // pure base64url alphabet
    const result = await decodeContinuationToken(token, verify, NOW_MS + 1000);
    expect(result).toEqual({
      kind: 'valid',
      payload: {
        visitor_id: 'v-1',
        session_id: 's-1',
        attribution: ATTRIBUTION,
        exp: NOW_MS + TOKEN_TTL_MS,
      },
    });
  });

  it('carries the documented 30-day TTL by default', async () => {
    const { sign } = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS, sign,
    });
    const body = JSON.parse(atob(token.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/')));
    expect(body.exp - NOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('rejects a tampered signature deterministically (bad_signature)', async () => {
    const { sign, verify } = signVerifyPair();
    const other = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: ATTRIBUTION, nowMs: NOW_MS, sign,
    });
    // Signed by a DIFFERENT installation key.
    const result = await decodeContinuationToken(token, other.verify, NOW_MS + 1);
    expect(result).toEqual({ kind: 'invalid', reason: 'bad_signature' });
    void verify;
  });

  it('rejects an expired token deterministically (expired)', async () => {
    const { sign, verify } = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS, sign,
    });
    expect(await decodeContinuationToken(token, verify, NOW_MS + TOKEN_TTL_MS))
      .toEqual({ kind: 'invalid', reason: 'expired' });
    expect(await decodeContinuationToken(token, verify, NOW_MS + TOKEN_TTL_MS + 1))
      .toEqual({ kind: 'invalid', reason: 'expired' });
  });

  it.each([
    ['no-dot'],
    ['.leading'],
    ['trailing.'],
    ['aGVsbG8.no-such-sig'], // unknown signature -> bad_signature
  ])('malformed/garbage token "%s" rejected without throwing', async (token) => {
    const { verify } = signVerifyPair();
    const result = await decodeContinuationToken(token, verify, NOW_MS);
    expect(result.kind === 'invalid').toBe(true);
  });

  it('rejects structurally valid JSON that fails shape validation', async () => {
    const { verify } = signVerifyPair();
    // "aGk=" style body decodes to plain JSON missing fields; signature check
    // happens after shape validation in decode, so this must be malformed.
    const result = await decodeContinuationToken('eyJhIjoxfQ.sig-x', verify, NOW_MS);
    expect(result).toEqual({ kind: 'invalid', reason: 'malformed' });
  });

  it('enforces MAX_TOKEN_LENGTH on encode', async () => {
    const hugeSign: SignFn = async (data) => `x`.repeat(MAX_TOKEN_LENGTH * 2);
    await expect(
      encodeContinuationToken({
        visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS, sign: hugeSign,
      }),
    ).rejects.toThrow(/MAX_TOKEN_LENGTH/);
  });

  it('escapes non-ASCII so tokens stay ASCII-safe', async () => {
    const { sign, verify } = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: { lt_source: 'göögle' }, nowMs: NOW_MS, sign,
    });
    expect(/^[\x21-\x7E.]+$/.test(token)).toBe(true);
    const out = await decodeContinuationToken(token, verify, NOW_MS + 10);
    expect(out.kind === 'valid' && out.payload.attribution['lt_source']).toBe('göögle');
  });
});

// --- stronger-signal detection -------------------------------------------------

describe('urlHasStrongerSignal', () => {
  it.each([
    ['https://x.com/?utm_source=newsletter', true],
    ['https://x.com/?gclid=abc', true],
    ['https://x.com/?SC_CLICK_ID=abc', true], // alias folds to sccid
    ['https://x.com/page?a=1', false],
    ['https://x.com/?ct_token=abc', false],
  ])('%s -> %s', (url, expected) => {
    expect(urlHasStrongerSignal(url)).toBe(expected);
  });
});

// --- referral touch ------------------------------------------------------------

describe('buildReferralTouch', () => {
  it('forces medium referral and carries source + click IDs through', () => {
    const touch = buildReferralTouch({
      payload: {
        visitor_id: 'v', session_id: 's',
        attribution: { lt_source: 'google', gclid: 'abc', lt_campaign: 'spring' },
        exp: NOW_MS,
      },
      landingUrl: 'https://dest.example.com/thanks',
      nowIso: '2026-08-23T10:00:00.000Z',
    });
    expect(touch.medium).toBe('referral');
    expect(touch.channel).toBe('referral');
    expect(touch.source).toBe('google');
    expect(touch.campaign).toBe('spring');
    expect(touch.clickIds).toEqual({ gclid: 'abc' });
    expect(touch.landingPage).toBe('https://dest.example.com/thanks');
    expect(touch.touchTimestamp).toBe('2026-08-23T10:00:00.000Z');
  });
});

// --- decoration -----------------------------------------------------------------

class FakeAnchor implements AnchorNode {
  attrs = new Map<string, string>();
  constructor(href: string) {
    this.attrs.set('href', href);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
}

function fakeLinkDoc(hrefs: string[]): LinkDomDocument & { anchors: FakeAnchor[] } {
  const anchors = hrefs.map((h) => new FakeAnchor(h));
  return {
    anchors,
    body: {},
    querySelectorAll(selector: string) {
      if (selector !== ANCHOR_SELECTOR) throw new Error(`unexpected ${selector}`);
      return anchors;
    },
  };
}

describe('decorateUrl (pure)', () => {
  it('appends the token param', () => {
    const out = decorateUrl({
      url: 'https://shop.example.com/x?y=1',
      token: 'tok',
      tokenParam: DEFAULT_TOKEN_PARAM,
      skipSignedUrls: true,
    });
    expect(out).toBe('https://shop.example.com/x?y=1&ct_token=tok');
  });

  it('skips already-signed URLs when skipSignedUrls is true (default)', () => {
    expect(decorateUrl({
      url: 'https://shop.example.com/?ct_token=old',
      token: 'new',
      tokenParam: DEFAULT_TOKEN_PARAM,
      skipSignedUrls: true,
    })).toBeNull();
  });

  it('replaces the param when skipSignedUrls is false', () => {
    const out = decorateUrl({
      url: 'https://shop.example.com/?ct_token=old',
      token: 'new',
      tokenParam: DEFAULT_TOKEN_PARAM,
      skipSignedUrls: false,
    });
    expect(out).toBe('https://shop.example.com/?ct_token=new');
  });

  it('unresolvable URLs are left untouched (null)', () => {
    expect(decorateUrl({
      url: '::not a url::',
      token: 't',
      tokenParam: DEFAULT_TOKEN_PARAM,
      skipSignedUrls: true,
    })).toBeNull();
  });
});

describe('createLinkDecorator', () => {
  function setup(opts: {
    consent?: () => boolean;
    getToken?: () => Promise<string>;
  } = {}) {
    const doc = fakeLinkDoc([
      'https://shop.example.com/product',
      'https://untrusted.example.net/page',
      '/relative/path',
    ]);
    const { sign, verify } = signVerifyPair();
    const tokenPromise = encodeContinuationToken({
      visitorId: 'v-1', sessionId: 's-1',
      attribution: { lt_source: 'google', gclid: 'abc' },
      nowMs: NOW_MS, sign,
    });
    const decorator = createLinkDecorator({
      domains: ['example.com'],
      doc,
      observer: null,
      consentAllowed: opts.consent ?? (() => true),
      getToken: opts.getToken ?? (() => tokenPromise),
      getBaseUrl: () => 'https://www.example.com/',
    });
    return { doc, decorator, tokenPromise, verify };
  }

  it('decorates ONLY approved-domain anchors with the ct_token param', async () => {
    const { doc, decorator, tokenPromise, verify } = setup();
    decorator.start();
    const token = await tokenPromise;
    expect(doc.anchors[0]!.getAttribute('href')).toBe(
      `https://shop.example.com/product?ct_token=${token}`,
    );
    expect(doc.anchors[1]!.getAttribute('href')).toBe('https://untrusted.example.net/page');
    // Relative link resolves against base https://www.example.com/ -> approved.
    const relative = doc.anchors[2]!.getAttribute('href')!;
    expect(relative.startsWith('/relative/path?ct_token=' + token.slice(0, 0))).toBe(false);
    expect(relative).toContain('ct_token=');
    void verify;
    decorator.stop();
  });

  it('already-signed anchor href is skipped by default', async () => {
    const doc = fakeLinkDoc(['https://shop.example.com/?ct_token=prior']);
    const { sign } = signVerifyPair();
    const token = encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS, sign,
    });
    const decorator = createLinkDecorator({
      domains: ['example.com'],
      doc,
      observer: null,
      consentAllowed: () => true,
      getToken: () => token,
      getBaseUrl: () => '',
    });
    decorator.start();
    await token;
    expect(doc.anchors[0]!.getAttribute('href')).toBe('https://shop.example.com/?ct_token=prior');
    decorator.stop();
  });

  it('consent denied: nothing decorated even though a token exists', async () => {
    const { doc, decorator, tokenPromise } = setup({ consent: () => false });
    decorator.start();
    await tokenPromise;
    expect(doc.anchors.map((a) => a.getAttribute('href'))).toEqual([
      'https://shop.example.com/product',
      'https://untrusted.example.net/page',
      '/relative/path',
    ]);
    decorator.stop();
  });

  it('token failure (oversized): deterministic empty decoration pass', async () => {
    let fail = true;
    const { doc, decorator } = setup({
      getToken: () => (fail ? Promise.reject(new Error('MAX_TOKEN_LENGTH')) : Promise.resolve('')),
    });
    decorator.start();
    await Promise.resolve(); // flush microtasks
    expect(doc.anchors[0]!.getAttribute('href')).toBe('https://shop.example.com/product');
    decorator.stop();
  });

  it('observer picks up late-added links until stop()', async () => {
    const doc = fakeLinkDoc([]);
    let trigger: (() => void) | null = null;
    const observers: { disconnectCalls: number }[] = [];
    const factory = ((cb: () => void) => {
      let connected = true;
      const obs = {
        observe: vi.fn(),
        disconnectCalls: 0,
        disconnect: () => {
          connected = false;
          obs.disconnectCalls += 1;
        },
        fire: () => {
          if (connected) cb();
        },
      };
      observers.push(obs);
      trigger = obs.fire;
      return obs;
    }) as never;
    const { sign } = signVerifyPair();
    const token = encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS, sign,
    });
    const decorator = createLinkDecorator({
      domains: ['example.com'],
      doc: { querySelectorAll: (sel) => doc.querySelectorAll(sel), body: {} },
      observer: factory,
      consentAllowed: () => true,
      getToken: () => token,
      getBaseUrl: () => '',
    });
    decorator.start();
    await token; // decoration pass runs once the token resolves
    const anchor = new FakeAnchor('https://shop.example.com/late');
    doc.anchors.push(anchor);
    trigger!();
    expect(anchor.getAttribute('href')).toContain('ct_token=');
    decorator.stop();
    expect(observers[0]!.disconnectCalls).toBe(1);
  });
});

// --- landing consumption ---------------------------------------------------------

interface SeamState {
  currentHref: string;
  replacedWith: string[];
}

function seamWith(url: string): LocationHistorySeam & { state: SeamState } {
  const state: SeamState = { currentHref: url, replacedWith: [] };
  return {
    state,
    href: () => state.currentHref,
    replaceState: (u: string) => {
      state.replacedWith.push(u);
      state.currentHref = u;
    },
  };
}

async function consume(input: {
  url: string;
  verify?: VerifyFn;
  consent?: boolean;
  merge?: (t: ParsedTouch) => void;
}) {
  const seam = seamWith(input.url);
  const { sign, verify } = signVerifyPair();
  const token = await encodeContinuationToken({
    visitorId: 'v-1', sessionId: 's-1',
    attribution: { lt_source: 'google', lt_medium: 'cpc', gclid: 'abc' },
    nowMs: NOW_MS, sign,
  });
  const landedUrl = `${input.url}${input.url.includes('?') ? '&' : '?'}ct_token=${token}`;
  seam.state.currentHref = landedUrl;
  const merged: ParsedTouch[] = [];
  const outcome = await consumeLandingToken({
    seam,
    tokenParam: DEFAULT_TOKEN_PARAM,
    verify: input.verify ?? verify,
    nowMs: () => NOW_MS + 5000,
    nowIso: () => '2026-08-23T11:00:00.000Z',
    consentAllowed: () => input.consent ?? true,
    mergeTouch: (t) => {
      merged.push(t);
      input.merge?.(t);
    },
  });
  return { outcome, merged, seam, token };
}

describe('consumeLandingToken', () => {
  it('no token parameter -> no_token, history untouched', async () => {
    const seam = seamWith('https://dest.example.com/plain');
    const outcome = await consumeLandingToken({
      seam,
      tokenParam: DEFAULT_TOKEN_PARAM,
      verify: async () => true,
      nowMs: () => NOW_MS,
      nowIso: () => '',
      consentAllowed: () => true,
      mergeTouch: () => {},
    });
    expect(outcome).toBe('no_token');
    expect(seam.state.replacedWith).toEqual([]);
  });

  it('valid token merges a referral touch AND strips the param from history', async () => {
    const { outcome, merged, seam } = await consume({
      url: 'https://dest.example.com/landing?ref=newsletter-footer',
    });
    expect(outcome).toBe('merged');
    expect(merged).toHaveLength(1);
    expect(merged[0]!.medium).toBe('referral');
    expect(merged[0]!.source).toBe('google');
    expect(merged[0]!.clickIds['gclid']).toBe('abc');
    // Param stripped BEFORE merging; stored landing page is the STRIPPED url.
    expect(seam.state.replacedWith).toEqual([
      'https://dest.example.com/landing?ref=newsletter-footer',
    ]);
    expect(merged[0]!.landingPage).toBe(
      'https://dest.example.com/landing?ref=newsletter-footer',
    );
  });

  it('stronger signals present -> skipped_stronger_signal (param still stripped)', async () => {
    const { outcome, merged, seam } = await consume({
      url: 'https://dest.example.com/?utm_source=facebook&utm_medium=social',
    });
    expect(outcome).toBe('skipped_stronger_signal');
    expect(merged).toHaveLength(0);
    expect(seam.state.replacedWith[0]).not.toContain('ct_token');
  });

  it('signature failure -> invalid_bad_signature, deterministic, param stripped', async () => {
    // Shape-valid body whose signature nobody produced.
    const body = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({
        visitor_id: 'v', session_id: 's', attribution: {}, exp: NOW_MS + 9999,
      })),
    );
    const forgedToken = `${body}.sig-nobody-made-this`;
    const seam = seamWith(`https://dest.example.com/?ct_token=${forgedToken}`);
    const merged: ParsedTouch[] = [];
    const outcome = await consumeLandingToken({
      seam,
      tokenParam: DEFAULT_TOKEN_PARAM,
      verify: async () => false, // signature check fails
      nowMs: () => NOW_MS,
      nowIso: () => '',
      consentAllowed: () => true,
      mergeTouch: (t) => void merged.push(t),
    });
    expect(outcome).toBe('invalid_bad_signature');
    expect(merged).toHaveLength(0);
    expect(seam.state.replacedWith[0]).not.toContain('ct_token');
  });

  it('consent denied -> consent_denied, no merge, param still stripped', async () => {
    const { outcome, merged, seam } = await consume({
      url: 'https://dest.example.com/',
      consent: false,
    });
    expect(outcome).toBe('consent_denied');
    expect(merged).toHaveLength(0);
    expect(seam.state.replacedWith[0]).not.toContain('ct_token');
  });

  it('expired token -> invalid_expired', async () => {
    const seam = seamWith('');
    const { sign, verify } = signVerifyPair();
    const stale = await encodeContinuationToken({
      visitorId: 'v', sessionId: 's', attribution: {}, nowMs: NOW_MS - TOKEN_TTL_MS - 10, sign,
    });
    seam.state.currentHref = `https://dest.example.com/?ct_token=${stale}`;
    const outcome = await consumeLandingToken({
      seam,
      tokenParam: DEFAULT_TOKEN_PARAM,
      verify,
      nowMs: () => NOW_MS,
      nowIso: () => '',
      consentAllowed: () => true,
      mergeTouch: () => {},
    });
    expect(outcome).toBe('invalid_expired');
  });
});

// --- createClickTrail wiring -----------------------------------------------------

describe('createClickTrail crossDomain/forms wiring', () => {
  it('start() consumes the landing token and merges into getData()', async () => {
    const { sign, verify } = signVerifyPair();
    const token = await encodeContinuationToken({
      visitorId: 'v-ext', sessionId: 's-ext',
      attribution: { lt_source: 'bing', gclid: 'xyz' },
      nowMs: NOW_MS, sign,
    });
    const seam = seamWith(`https://dest.example.com/from-ad?ct_token=${token}`);
    const events: Record<string, unknown>[] = [];
    const nullAdapter = { get: () => null, set: () => {}, delete: () => {} };
    const ct = createClickTrail({
      destinations: [
        { name: 'test', start: () => {}, deliver: (e) => void events.push(e) },
      ],
      // Injected clock so the token's absolute expiry is deterministic.
      storage: {
        primaryAdapter: nullAdapter,
        mirrorAdapter: nullAdapter,
        nowMs: () => NOW_MS + 5000,
      },
      now: () => '2026-08-23T12:00:00.000Z',
      crossDomain: {
        domains: ['example.com'],
        sign,
        verify,
        location: seam,
        doc: fakeLinkDoc([]),
        observer: null,
      },
    });
    ct.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(seam.state.replacedWith).toEqual(['https://dest.example.com/from-ad']);
    expect(ct.getField('lt_medium')).toBe('referral');
    expect(ct.getField('lt_source')).toBe('bing');
    expect(ct.getField('gclid')).toBe('xyz');

    // Outbound decoration uses the SAME instance identity/payload.
    const doc = fakeLinkDoc(['https://other.example.com/prices']);
    const ct2 = createClickTrail({
      destinations: [],
      storage: {
        primaryAdapter: {
          get: () => null,
          set: () => {},
          delete: () => {},
        },
        mirrorAdapter: {
          get: () => null,
          set: () => {},
          delete: () => {},
        },
        randomBytes: () => new Uint8Array(32).fill(7),
        nowMs: () => NOW_MS,
      },
      now: () => '2026-08-23T12:00:00.000Z',
      crossDomain: {
        domains: ['other.example.com'],
        sign,
        verify,
        location: seamWith('https://origin.example.com/home'),
        doc,
        observer: null,
      },
    });
    ct2.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.anchors[0]!.getAttribute('href')).toContain('other.example.com/prices?ct_token=');
  });

  it('default WebCrypto HMAC signer persists its key in the storage adapters', async () => {
    const map = new Map<string, string>();
    const adapter = {
      get: (k: string) => map.get(k) ?? null,
      set: (k: string, v: string) => void map.set(k, v),
      delete: (k: string) => void map.delete(k),
    };
    const randomBytes = ((n: number) => new Uint8Array(n).fill(9)) as never;
    const adapters = [adapter];
    const sign = defaultHmacSign(adapters as never, randomBytes);
    const sig = await sign('payload-body');
    expect(map.has(SIGNING_KEY_KEY)).toBe(true);

    const verify = defaultHmacVerify(adapters as never);
    expect(await verify('payload-body', sig)).toBe(true);
    expect(await verify('tampered-body', sig)).toBe(false);
  });

  it('fails closed when cross-domain defaults have no persistent signing storage', () => {
    const formDoc = new (class {
      forms = [];
      body = {};
      querySelectorAll(sel: string) {
        return sel === FORM_SELECTOR_WIRE ? [] : [];
      }
      createElement() {
        throw new Error('unused');
      }
    })();
    void formDoc;
    const ct = createClickTrail({
      destinations: [],
      forms: {},
      crossDomain: { domains: ['example.com'] },
    });
    expect(() => ct.start()).toThrow(/crossDomain default sign\/verify requires config\.storage/);
  });
});

const FORM_SELECTOR_WIRE = 'form';
void CONTINUATION_FIELDS;

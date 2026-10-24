import { describe, expect, it } from 'vitest';
import { parseAttributionUrl } from '../src/core/parse.js';
import { areRelatedHosts, isIgnoredReferrerHost, normalizeReferrerHosts, sanitizeField } from '../src/core/sanitize.js';
import { PAYMENT_REFERRER_HOSTS, resolveChannelLabel } from '../src/core/knowledge.js';
import { emptyAttribution, mergeAttributionTouch } from '../src/core/merge.js';

describe('parseAttributionUrl', () => {
  it('parses Google Ads UTMs + gclid into a paid_search touch', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=botox-nyc&gclid=XYZ',
      now: '2026-08-23T10:00:00.000Z',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google');
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.campaign).toBe('botox-nyc');
    expect(r.touch.channel).toBe('paid_search');
    // Ruling #12: landing page stores the FULL href including query string.
    expect(r.touch.landingPage).toBe(
      'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=botox-nyc&gclid=XYZ',
    );
    // Ruling #13: millisecond ISO is the frozen timestamp format.
    expect(r.touch.touchTimestamp).toBe('2026-08-23T10:00:00.000Z');
  });

  it('classifies a bare fbclid as Facebook with UNKNOWN paid status (D2)', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?fbclid=Abc' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('facebook');
    expect(r.touch.medium).toBe('');
    expect(r.touch.channel).toBe('unknown');
    expect(r.touch.channelLabel).toBe('Facebook');
  });

  it('promotes fbclid to paid_social only with explicit paid evidence (D2)', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/?fbclid=Abc&utm_source=facebook&utm_medium=cpc',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.channel).toBe('paid_social');
    expect(r.touch.channelLabel).toBe('Facebook Ads');
  });

  it('keeps gclid certain-paid (advertising-only identifier)', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?gclid=G1' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.medium).toBe('cpc');
    expect(r.touch.channel).toBe('paid_search');
  });

  it('legacyWordPressChannelLabel reproduces the plugin strings for migration', async () => {
    const { legacyWordPressChannelLabel } = await import('../src/core/knowledge.js');
    const ids = { fbclid: 'Abc' };
    expect(legacyWordPressChannelLabel({ clickIds: ids, medium: '' })).toBe('Facebook Organic');
    expect(legacyWordPressChannelLabel({ clickIds: ids, medium: 'cpc' })).toBe('Facebook Ads');
  });

  it('collects browser-ID query params top-level (ruling A part a)', () => {
    const r = parseAttributionUrl({
      url: [
        'https://example.com/lp?utm_source=facebook&utm_medium=cpc',
        'fbp=fb.1.1787480990000.987654321',
        '_fbc=fb.1.1787480990000.ABC',
        'ttp=ttp_XYZ',
        'li_gc=MTswOzE',
        'ga_client_id=GA1.1.1234567890.9876543210',
        'ga_session_id=1787481000',
      ].join('&'),
      now: '2026-08-23T10:30:00.000Z',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    // Plugin preference order: bare variant wins over the _-prefixed one.
    expect(r.touch.browserIds).toEqual({
      fbp: 'fb.1.1787480990000.987654321',
      fbc: 'fb.1.1787480990000.ABC',
      ttp: 'ttp_XYZ',
      li_gc: 'MTswOzE',
      ga_client_id: '1234567890.9876543210',
      ga_session_id: '1787481000',
    });
  });

  it('reduces ga_client_id to its last two numeric parts and rejects bad formats', () => {
    const good = parseAttributionUrl({ url: 'https://example.com/?utm_source=a&utm_medium=cpc&ga_client_id=GA1.1.111.222' });
    const bad = parseAttributionUrl({ url: 'https://example.com/?utm_source=a&utm_medium=cpc&ga_client_id=not-a-ga-id' });
    if (good.kind !== 'touch' || bad.kind !== 'touch') throw new Error('expected touches');
    expect(good.touch.browserIds?.ga_client_id).toBe('111.222');
    expect(bad.touch.browserIds?.ga_client_id).toBeUndefined();
  });

  it('derives fbc from a bare fbclid (plugin BrowserIdentifiers evidence)', () => {
    const withExplicit = parseAttributionUrl({
      url: 'https://example.com/?fbclid=Abc&fbc=fbc-explicit',
      now: '2026-08-23T10:00:00.000Z',
    });
    const derived = parseAttributionUrl({
      url: 'https://example.com/?fbclid=Abc',
      now: '2026-08-23T10:00:00.000Z',
    });
    const noClock = parseAttributionUrl({ url: 'https://example.com/?fbclid=Abc' });
    if (withExplicit.kind !== 'touch' || derived.kind !== 'touch' || noClock.kind !== 'touch') {
      throw new Error('expected touches');
    }
    expect(withExplicit.touch.browserIds?.fbc).toBe('fbc-explicit');
    expect(derived.touch.browserIds?.fbc).toBe(`fb.1.${Date.parse('2026-08-23T10:00:00.000Z')}.Abc`);
    // No injected clock -> no derivation (deterministic).
    expect(noClock.touch.browserIds?.fbc).toBeUndefined();
  });

  it('classifies a google referrer as organic search with canonical source name', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://www.google.com/search?q=test',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google'); // ruling #4: canonical name, not host
    expect(r.touch.medium).toBe('organic');
    expect(r.touch.channel).toBe('organic_search');
    expect(r.touch.channelLabel).toBe('Google Organic');
  });

  it('classifies social referrers as organic social', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'https://l.instagram.com/?u=x',
      currentHost: 'example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('instagram');
    expect(r.touch.medium).toBe('social');
    expect(r.touch.channel).toBe('organic_social');
  });

  it('ignores internal referrers', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/contact',
      referrer: 'https://www.example.com/pricing',
      currentHost: 'example.com',
    });
    expect(r).toEqual({ kind: 'none', reason: 'internal_referrer' });
  });

  it('returns no_signal for a bare landing without params or referrer', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/' });
    expect(r.kind).toBe('none');
  });

  it('folds sc_click_id into sccid with uncertain paid status (D2)', () => {
    const r = parseAttributionUrl({ url: 'https://example.com/?sc_click_id=S1' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('snapchat');
    expect(r.touch.channel).toBe('unknown');
  });

  // --- WP-parity rulings ---

  it('#9: lowercases mixed-case UTM keys before lookup', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?Utm_Source=google&UTM_CAMPAIGN=spring' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('google');
    expect(r.touch.campaign).toBe('spring');
  });

  it('#11: last duplicate parameter occurrence wins', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?utm_campaign=a&utm_campaign=b' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.campaign).toBe('b');
  });

  it('#15: rejects whole values matching the {{...}} macro pattern', () => {
    const r = parseAttributionUrl({ url: 'https://e.com/?utm_source=x&utm_campaign=%7B%7Bc.name%7D%7D' });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.campaign).toBe('');
  });

  it('#8: treats non-http(s) referrer protocols as no external referrer', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/',
      referrer: 'android-app://com.some.app/page',
      currentHost: 'example.com',
    });
    expect(r).toEqual({ kind: 'none', reason: 'no_signal' });
  });
});

describe('touch field formats (#56, opt-in)', () => {
  const url = 'https://example.com/pricing?email=a%40b.com&UTM_Source=google&utm_medium=cpc&gclid=G1&sc_click_id=S1#plans';
  const referrer = 'https://www.google.com/search?q=private+query';

  function landing(input: Parameters<typeof parseAttributionUrl>[0]): string {
    const r = parseAttributionUrl(input);
    if (r.kind !== 'touch') throw new Error('expected a touch');
    return r.touch.landingPage;
  }

  it("defaults to the full href and full referrer URL (ruling #12)", () => {
    const r = parseAttributionUrl({ url, referrer, currentHost: 'example.com' });
    if (r.kind !== 'touch') throw new Error('expected a touch');
    expect(r.touch.landingPage).toBe(url);
    expect(r.touch.referrer).toBe(referrer);
  });

  it("'path' keeps the pathname only", () => {
    expect(landing({ url, landingPageFormat: 'path' })).toBe('/pricing');
  });

  it("'path+allowlisted-query' keeps attribution keys case-insensitively, in URL order", () => {
    expect(landing({ url, landingPageFormat: 'path+allowlisted-query' }))
      .toBe('/pricing?UTM_Source=google&utm_medium=cpc&gclid=G1&sc_click_id=S1');
  });

  it("'path+allowlisted-query' honors a caller allowlist and drops an emptied query", () => {
    expect(landing({ url, landingPageFormat: 'path+allowlisted-query', landingPageQueryAllowlist: ['GCLID'] }))
      .toBe('/pricing?gclid=G1');
    expect(landing({ url, landingPageFormat: 'path+allowlisted-query', landingPageQueryAllowlist: [] }))
      .toBe('/pricing');
  });

  it("'host' stores the referrer hostname on both touch paths without changing classification", () => {
    const inferred = parseAttributionUrl({ url: 'https://example.com/', referrer, currentHost: 'example.com', referrerFormat: 'host' });
    const tagged = parseAttributionUrl({ url, referrer: 'https://news.example.org:8443/a?b=c', referrerFormat: 'host' });
    if (inferred.kind !== 'touch' || tagged.kind !== 'touch') throw new Error('expected touches');
    expect(inferred.touch.referrer).toBe('www.google.com');
    expect(inferred.touch.channel).toBe('organic_search');
    expect(inferred.touch.channelLabel).toBe('Google Organic');
    expect(tagged.touch.referrer).toBe('news.example.org');
    expect(tagged.touch.channel).toBe('paid_search');
  });

  it("'host' stores '' for a non-http(s) referrer on the campaign path", () => {
    const r = parseAttributionUrl({ url, referrer: 'android-app://com.some.app/page', referrerFormat: 'host' });
    if (r.kind !== 'touch') throw new Error('expected a touch');
    expect(r.touch.referrer).toBe('');
  });
});

describe('recordDirectTouch (#56, opt-in)', () => {
  const now = '2026-10-23T10:00:00.000Z';

  it('is off by default: no signal and internal referrers still return none', () => {
    expect(parseAttributionUrl({ url: 'https://example.com/a', currentHost: 'example.com' }))
      .toEqual({ kind: 'none', reason: 'no_signal' });
    expect(parseAttributionUrl({ url: 'https://example.com/a', referrer: 'https://example.com/b', currentHost: 'example.com' }))
      .toEqual({ kind: 'none', reason: 'internal_referrer' });
  });

  it('no signal yields an unmeasured direct touch', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/a?x=1', currentHost: 'example.com', now, recordDirectTouch: true, landingPageFormat: 'path',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch).toMatchObject({
      source: '(direct)', medium: '(none)', referrer: '', landingPage: '/a', touchTimestamp: now,
      channel: 'direct', channelLabel: 'Direct', clickIds: {}, unmeasured: true,
    });
  });

  it('a same-site referrer yields an unmeasured before-capture touch', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/a', referrer: 'https://www.example.com/b', currentHost: 'example.com', now, recordDirectTouch: true,
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch).toMatchObject({
      source: '', medium: '', referrer: '', landingPage: 'https://example.com/a',
      channel: 'unknown', channelLabel: 'Unknown (before capture)', unmeasured: true,
    });
  });

  it('measured landings are unchanged by the option', () => {
    const input = { url: 'https://example.com/?utm_source=nl&utm_medium=email', currentHost: 'example.com', now };
    expect(parseAttributionUrl({ ...input, recordDirectTouch: true })).toEqual(parseAttributionUrl(input));
  });
});

describe('inferSourceMedium: false (#64, opt-in)', () => {
  const now = '2026-10-23T10:00:00.000Z';

  function touchOf(input: Parameters<typeof parseAttributionUrl>[0]) {
    const r = parseAttributionUrl(input);
    if (r.kind !== 'touch') throw new Error('expected a touch');
    return r.touch;
  }

  it('a bare gclid stores empty source/medium; channel and label still come from the click ID', () => {
    expect(touchOf({ url: 'https://example.com/?gclid=X', now, inferSourceMedium: false })).toMatchObject({
      source: '', medium: '', clickIds: { gclid: 'X' }, channel: 'paid_search', channelLabel: 'Google Ads',
    });
  });

  it('keeps received UTMs, so tagged and untagged click-ID landings differ', () => {
    const tagged = touchOf({ url: 'https://example.com/?utm_source=google&utm_medium=cpc&gclid=X', inferSourceMedium: false });
    const partial = touchOf({ url: 'https://example.com/?utm_medium=banner&gclid=X', inferSourceMedium: false });
    expect(tagged).toMatchObject({ source: 'google', medium: 'cpc', channel: 'paid_search' });
    expect(partial).toMatchObject({ source: '', medium: 'banner', channel: 'paid_search', channelLabel: 'Google Ads' });
  });

  it('an uncertain click ID stores no inferred source', () => {
    expect(touchOf({ url: 'https://example.com/?fbclid=F', inferSourceMedium: false })).toMatchObject({
      source: '', medium: '', clickIds: { fbclid: 'F' }, channel: 'unknown', channelLabel: 'Facebook',
    });
  });

  it('a bare Google referrer stores empty source/medium and the referrer per referrerFormat', () => {
    const base = { url: 'https://example.com/', referrer: 'https://www.google.com/', currentHost: 'example.com', inferSourceMedium: false };
    expect(touchOf(base)).toMatchObject({
      source: '', medium: '', referrer: 'https://www.google.com/', channel: 'organic_search', channelLabel: 'Google Organic',
    });
    expect(touchOf({ ...base, referrerFormat: 'host' })).toMatchObject({
      source: '', medium: '', referrer: 'www.google.com', channel: 'organic_search',
    });
  });

  it('a recordDirectTouch placeholder stores empty source/medium but keeps the Direct channel', () => {
    expect(touchOf({ url: 'https://example.com/a', currentHost: 'example.com', recordDirectTouch: true, inferSourceMedium: false }))
      .toMatchObject({ source: '', medium: '', channel: 'direct', channelLabel: 'Direct', unmeasured: true });
  });

  it('true is the default and changes nothing', () => {
    const inputs = [
      { url: 'https://example.com/?gclid=X', now },
      { url: 'https://example.com/?fbclid=F&utm_medium=paid_social', now },
      { url: 'https://example.com/', referrer: 'https://l.facebook.com/', currentHost: 'example.com', now },
      { url: 'https://example.com/a', currentHost: 'example.com', now, recordDirectTouch: true },
    ];
    for (const input of inputs) {
      expect(parseAttributionUrl({ ...input, inferSourceMedium: true })).toEqual(parseAttributionUrl(input));
    }
    expect(touchOf(inputs[0]!)).toMatchObject({ source: 'google', medium: 'cpc' });
  });
});

describe('query value policies (#64, opt-in)', () => {
  const long130 = 'a'.repeat(130);

  function touchOf(input: Parameters<typeof parseAttributionUrl>[0]) {
    const r = parseAttributionUrl(input);
    if (r.kind !== 'touch') throw new Error('expected a touch');
    return r.touch;
  }

  it("overLengthPolicy 'drop' with maxFieldLength 120 drops a 130-char utm_source and keeps a 120-char one", () => {
    const opts = { overLengthPolicy: 'drop', maxFieldLength: 120 } as const;
    expect(touchOf({ url: `https://example.com/?utm_source=${long130}&utm_medium=email`, ...opts }))
      .toMatchObject({ source: '', medium: 'email' });
    expect(touchOf({ url: `https://example.com/?utm_source=${'a'.repeat(120)}`, ...opts }).source).toBe('a'.repeat(120));
  });

  it('maxFieldLength alone truncates; the default stays 512', () => {
    expect(touchOf({ url: `https://example.com/?utm_source=${long130}`, maxFieldLength: 120 }).source).toBe('a'.repeat(120));
    expect(touchOf({ url: `https://example.com/?utm_source=${'a'.repeat(600)}` }).source).toBe('a'.repeat(512));
    expect(touchOf({ url: `https://example.com/?utm_source=${'a'.repeat(600)}`, overLengthPolicy: 'drop' }).source).toBe('');
  });

  it('applies to click IDs and browser IDs but not to the landing page or referrer', () => {
    const url = `https://example.com/?gclid=${long130}&fbp=${long130}`;
    const referrer = `https://example.org/${long130}`;
    const t = touchOf({ url, referrer, overLengthPolicy: 'drop', maxFieldLength: 120 });
    expect(t.clickIds).toEqual({ gclid: '' });
    expect(t.browserIds).toEqual({ fbp: '' });
    expect(t.landingPage).toBe(url);
    expect(t.referrer).toBe(referrer);
  });

  it("macroPolicy 'keep' stores an unexpanded {{macro}} as received", () => {
    const url = 'https://example.com/?utm_source=google&utm_campaign=%7B%7Badset.name%7D%7D';
    expect(touchOf({ url }).campaign).toBe('');
    expect(touchOf({ url, macroPolicy: 'keep' }).campaign).toBe('{{adset.name}}');
  });

  it("controlCharPolicy 'drop' drops a value with an inner control character after trimming", () => {
    const url = 'https://example.com/?utm_source=goo%01gle&utm_medium=%20cpc%0A&utm_campaign=spring%7Fsale';
    expect(touchOf({ url })).toMatchObject({ source: 'google', medium: 'cpc', campaign: 'springsale' });
    expect(touchOf({ url, controlCharPolicy: 'drop' })).toMatchObject({ source: '', medium: 'cpc', campaign: '' });
  });

  it('sanitizeField keeps the 512 default for an unusable maxFieldLength', () => {
    const v = 'a'.repeat(600);
    for (const maxFieldLength of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sanitizeField(v, { maxFieldLength })).toBe('a'.repeat(512));
    }
    expect(sanitizeField(v, { maxFieldLength: 1000 })).toBe(v);
  });
});

describe('ignored referrers with recordDirectTouch (#65)', () => {
  const now = '2026-10-23T10:00:00.000Z';
  const input = {
    url: 'https://example.com/login-bridge', referrer: 'https://accounts.google.com/',
    currentHost: 'example.com', now, ignoredReferrerHosts: ['accounts.google.com'],
  };

  it('an empty payload gets the before-capture first touch', () => {
    const r = parseAttributionUrl({ ...input, recordDirectTouch: true });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch).toMatchObject({ referrer: '', channelLabel: 'Unknown (before capture)', unmeasured: true });
    const out = mergeAttributionTouch(emptyAttribution(), r.touch);
    expect(out.ft_channel).toBe('Unknown (before capture)');
    expect(out.ft_landing_page).toBe('https://example.com/login-bridge');
  });

  it('keeps a stored paid touch', () => {
    const paid = parseAttributionUrl({ url: 'https://example.com/?gclid=G1', currentHost: 'example.com', now });
    if (paid.kind !== 'touch') throw new Error('expected touch');
    const stored = mergeAttributionTouch(emptyAttribution(), paid.touch);
    const r = parseAttributionUrl({ ...input, recordDirectTouch: true });
    if (r.kind !== 'touch') throw new Error('expected touch');
    expect(mergeAttributionTouch(stored, r.touch)).toEqual(stored);
  });

  it('without recordDirectTouch still returns ignored_referrer', () => {
    expect(parseAttributionUrl(input)).toEqual({ kind: 'none', reason: 'ignored_referrer' });
  });

  it('an ignored referrer with UTMs is stored blank under referrerFormat host (#55/#56)', () => {
    const r = parseAttributionUrl({
      url: 'https://example.com/thanks?utm_source=newsletter&utm_medium=email',
      referrer: 'https://checkout.stripe.com/c/pay/cs_test_x', currentHost: 'example.com', now,
      ignoredReferrerHosts: ['checkout.stripe.com'], referrerFormat: 'host',
    });
    if (r.kind !== 'touch') throw new Error('expected touch');
    expect(r.touch.referrer).toBe('');
    expect(mergeAttributionTouch(emptyAttribution(), r.touch).lt_referrer).toBe('');
  });
});

describe('areRelatedHosts (ruling #8)', () => {
  it('is symmetric for sibling subdomains', () => {
    expect(areRelatedHosts('shop.example.com', 'example.com')).toBe(true);
    expect(areRelatedHosts('example.com', 'shop.example.com')).toBe(true);
    expect(areRelatedHosts('app.example.com', 'shop.example.com')).toBe(false); // siblings, no containment
  });
  it('rejects unrelated hosts and empty input', () => {
    expect(areRelatedHosts('example.com', 'notexample.com')).toBe(false);
    expect(areRelatedHosts('example.com', '')).toBe(false);
  });
});

describe('resolveChannelLabel (ruling #3)', () => {
  it('labels AI-assistant referrers before search-engine rules', () => {
    expect(resolveChannelLabel({
      source: 'gemini.google.com', medium: 'referral', clickIds: {},
      referrer: 'https://gemini.google.com/app/xyz',
    })).toBe('Gemini');
    expect(resolveChannelLabel({
      source: 'chatgpt.com', medium: 'referral', clickIds: {},
      referrer: 'https://chatgpt.com/c/abc',
    })).toBe('ChatGPT');
  });

  it('labels paid mediums by source before the referrer block', () => {
    expect(resolveChannelLabel({
      source: 'meta', medium: 'paid_social', clickIds: {},
      referrer: 'https://www.google.com/search?q=x',
    })).toBe('Facebook Ads');
  });

  it('falls back to Unknown without signals', () => {
    expect(resolveChannelLabel({ source: '', medium: '', clickIds: {} })).toBe('Unknown');
  });
});

describe('ignoredReferrerHosts (payment returns, WP plugin 1.11.0 parity)', () => {
  const ignoredReferrerHosts = PAYMENT_REFERRER_HOSTS;

  it('returns ignored_referrer for a referrer-only payment return', () => {
    for (const referrer of [
      'https://www.paypal.com/checkoutnow?token=SYNTHETIC',
      'https://checkout.stripe.com/c/pay/cs_test_synthetic',
      'https://www.mercadopago.com.br/checkout/v1/redirect',
    ]) {
      expect(parseAttributionUrl({
        url: 'https://shop.example.com/checkout/order-received/',
        referrer,
        currentHost: 'shop.example.com',
        ignoredReferrerHosts,
      })).toEqual({ kind: 'none', reason: 'ignored_referrer' });
    }
  });

  it('keeps referral classification when no list is passed (config-only, no default)', () => {
    const r = parseAttributionUrl({
      url: 'https://shop.example.com/checkout/order-received/',
      referrer: 'https://www.paypal.com/checkoutnow',
      currentHost: 'shop.example.com',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('paypal.com');
    expect(r.touch.medium).toBe('referral');
  });

  it('still forms a URL-parameter touch with the referrer blanked', () => {
    const r = parseAttributionUrl({
      url: 'https://shop.example.com/thanks/?utm_source=newsletter&utm_medium=email&utm_campaign=spring',
      referrer: 'https://checkout.stripe.com/c/pay/cs_test_synthetic',
      currentHost: 'shop.example.com',
      ignoredReferrerHosts,
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.source).toBe('newsletter');
    expect(r.touch.referrer).toBe('');
    expect(r.touch.channel).toBe('email');
  });

  it('keeps the ignored referrer blank in referrerFormat host', () => {
    const r = parseAttributionUrl({
      url: 'https://shop.example.com/thanks/?utm_source=newsletter',
      referrer: 'https://checkout.stripe.com/c/pay/cs_test_synthetic',
      currentHost: 'shop.example.com',
      ignoredReferrerHosts: ['checkout.stripe.com'],
      referrerFormat: 'host',
    });
    expect(r.kind).toBe('touch');
    if (r.kind !== 'touch') return;
    expect(r.touch.referrer).toBe('');
  });

  it('matches host or subdomain only, never look-alike hosts', () => {
    const parse = (referrer: string) => parseAttributionUrl({
      url: 'https://shop.example.com/', referrer, currentHost: 'shop.example.com', ignoredReferrerHosts,
    });
    expect(parse('https://paypal.com/')).toEqual({ kind: 'none', reason: 'ignored_referrer' });
    expect(parse('https://notpaypal.com/').kind).toBe('touch');
    expect(parse('https://paypal.com.example.net/').kind).toBe('touch');
  });

  it('keeps internal_referrer precedence over the ignore list', () => {
    expect(parseAttributionUrl({
      url: 'https://pay.example.com/', referrer: 'https://example.com/', currentHost: 'pay.example.com',
      ignoredReferrerHosts: ['example.com'],
    })).toEqual({ kind: 'none', reason: 'internal_referrer' });
  });
});

describe('normalizeReferrerHosts / isIgnoredReferrerHost', () => {
  it('normalizes like the plugin filter: lowercase, URL to host, www., trailing dot, dedupe', () => {
    expect(normalizeReferrerHosts([
      ' PayPal.com ', 'https://www.stripe.com/path', 'acs.examplebank.com/3ds', 'www.mollie.com.',
      'paypal.com', 'localhost', 'not a host', 'paypal.com:443', 42, null,
    ])).toEqual(['paypal.com', 'stripe.com', 'acs.examplebank.com', 'mollie.com']);
    expect(normalizeReferrerHosts(undefined)).toEqual([]);
    expect(normalizeReferrerHosts('paypal.com')).toEqual([]);
  });

  it('matches the host itself and its subdomains', () => {
    expect(isIgnoredReferrerHost('checkout.stripe.com', ['stripe.com'])).toBe(true);
    expect(isIgnoredReferrerHost('WWW.PAYPAL.COM.', ['paypal.com'])).toBe(true);
    expect(isIgnoredReferrerHost('stripe.com', ['checkout.stripe.com'])).toBe(false);
    expect(isIgnoredReferrerHost('', ['stripe.com'])).toBe(false);
    expect(isIgnoredReferrerHost('stripe.com', [])).toBe(false);
  });

  it('strips trailing dots in linear time on long dot runs', () => {
    const dots = '.'.repeat(100_000);
    const started = performance.now();
    expect(normalizeReferrerHosts([`a${dots}b`, `paypal.com${dots}`])).toEqual(['paypal.com']);
    expect(isIgnoredReferrerHost(`a${dots}b`, ['paypal.com'])).toBe(false);
    expect(isIgnoredReferrerHost(`checkout.stripe.com${dots}`, ['stripe.com'])).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

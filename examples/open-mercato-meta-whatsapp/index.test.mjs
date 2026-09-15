import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichOpenMercatoContext, normalizeMetaWhatsAppReferral } from './index.mjs';

const referral = {
  source_url: 'https://fb.me/ad-1',
  source_id: 'ad-1',
  source_type: 'ad',
  headline: 'Course',
  body: 'Learn more',
  media_type: 'video',
  image_url: 'https://cdn.example.test/image.jpg',
  video_url: 'https://www.facebook.com/reel/1/',
  thumbnail_url: 'https://cdn.example.test/thumb.jpg',
  ctwa_clid: 'ctwa-1',
  media_id: 'media-1',
  media_content_type: 'image/jpeg',
  media_url: 'https://cdn.example.test/media.jpg',
  num_media: '1',
  welcome_message: { text: 'Hello' },
  arbitrary: { do_not: 'copy' },
};

test('normalizes the explicit allowlist', () => {
  const result = normalizeMetaWhatsAppReferral(referral);
  assert.equal(result.source_url, referral.source_url);
  assert.equal(result.ctwa_clid, referral.ctwa_clid);
  assert.equal(result.media_content_type, referral.media_content_type);
  assert.equal(result.welcome_message_text, 'Hello');
  assert.equal(result.arbitrary, undefined);
});

test('is consent-gated and accepts no raw message parsing', () => {
  const existing = { utm_source: 'google' };
  const rawMessage = {
    content: 'Forwarded or edited source_id=ad-1',
    forwarded: true,
    edited: true,
    content_attributes: { referral },
  };
  assert.deepEqual(enrichOpenMercatoContext(existing, rawMessage, { consentState: 'granted' }), existing);
  assert.deepEqual(enrichOpenMercatoContext(existing, { referral }), existing);
});

test('stores one bounded referral snapshot and preserves existing context', () => {
  const existing = { utm_source: 'google' };
  const first = enrichOpenMercatoContext(existing, { referral }, { consentState: 'granted' });
  assert.equal(first.utm_source, 'google');
  assert.equal(first.meta_whatsapp_referral.source_id, 'ad-1');
  assert.equal(first.meta_whatsapp_referral.welcome_message_text, 'Hello');
  assert.equal(first.meta_whatsapp_referral.arbitrary, undefined);
  assert.deepEqual(existing, { utm_source: 'google' });
});

test('preserves first referral on conflict and replay', () => {
  const first = enrichOpenMercatoContext({}, { referral }, { consentState: 'granted' });
  const conflict = enrichOpenMercatoContext(
    first,
    { referral: { source_id: 'ad-2', ctwa_clid: 'ctwa-2' } },
    { consentState: 'granted' },
  );
  assert.deepEqual(conflict, first);
  assert.deepEqual(
    enrichOpenMercatoContext(first, { referral }, { consentState: 'granted' }),
    first,
  );
});

test('rejects malformed, empty, non-string, and overlong values', () => {
  assert.equal(normalizeMetaWhatsAppReferral({ headline: 'copied text' }), null);
  assert.equal(normalizeMetaWhatsAppReferral({ source_id: 42 }), null);
  const result = normalizeMetaWhatsAppReferral({ source_id: `\n${'x'.repeat(600)}` });
  assert.equal(result.source_id.length, 512);
  assert.equal(result.source_id.includes('\n'), false);
});

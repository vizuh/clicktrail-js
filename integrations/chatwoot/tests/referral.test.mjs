import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetaWhatsAppAcquisitionContext,
  mergeMetaWhatsAppAcquisitionContext,
  mergeMetaWhatsAppReferralAttributes,
  metaWhatsAppReferralAttributes,
  normalizeMetaWhatsAppReferral,
} from '../src/referral.js';

const referral = {
  source_url: 'https://fb.me/ad-1',
  source_id: 'ad-1',
  source_type: 'ad',
  headline: 'Course',
  body: 'Learn more',
  media_type: 'video',
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

test('normalizes the Meta referral allowlist and flattens the nested welcome text', () => {
  assert.deepEqual(normalizeMetaWhatsAppReferral(referral), {
    source_url: 'https://fb.me/ad-1',
    source_id: 'ad-1',
    source_type: 'ad',
    headline: 'Course',
    body: 'Learn more',
    media_type: 'video',
    video_url: 'https://www.facebook.com/reel/1/',
    thumbnail_url: 'https://cdn.example.test/thumb.jpg',
    ctwa_clid: 'ctwa-1',
    media_id: 'media-1',
    media_content_type: 'image/jpeg',
    media_url: 'https://cdn.example.test/media.jpg',
    num_media: '1',
    welcome_message_text: 'Hello',
  });
});

test('rejects a referral without a strong provider signal', () => {
  assert.equal(normalizeMetaWhatsAppReferral({ headline: 'copied text' }), null);
  assert.deepEqual(buildMetaWhatsAppAcquisitionContext({ source_url: '  ' }), {});
});

test('ignores malformed values instead of coercing provider objects', () => {
  assert.equal(
    normalizeMetaWhatsAppReferral({
      source_url: ['https://fb.me/ad-1'],
      source_id: { value: 'ad-1' },
      welcome_message: ['not-an-object'],
    }),
    null,
  );
});

test('caps values and removes control characters', () => {
  const result = normalizeMetaWhatsAppReferral({
    source_id: `\n${'x'.repeat(600)}`,
  });
  assert.equal(result.source_id.length, 512);
  assert.equal(result.source_id.includes('\n'), false);
});

test('fails closed on consent and preserves existing context', () => {
  const existing = { utm_source: 'google', meta_whatsapp_referral: { source_id: 'old' } };
  assert.deepEqual(
    mergeMetaWhatsAppAcquisitionContext(existing, referral),
    existing,
  );
  assert.deepEqual(
    mergeMetaWhatsAppAcquisitionContext(existing, referral, { consentState: 'denied' }),
    existing,
  );
});

test('preserves the first referral snapshot atomically', () => {
  const existing = { utm_source: 'google', meta_whatsapp_referral: { source_id: 'old' } };
  const result = mergeMetaWhatsAppAcquisitionContext(existing, referral, { consentState: 'granted' });
  assert.equal(result.utm_source, 'google');
  assert.deepEqual(result.meta_whatsapp_referral, { source_id: 'old' });
  assert.deepEqual(existing, { utm_source: 'google', meta_whatsapp_referral: { source_id: 'old' } });
});

test('replaying the same referral is idempotent', () => {
  const once = mergeMetaWhatsAppAcquisitionContext({}, referral, { consentState: 'granted' });
  assert.deepEqual(
    mergeMetaWhatsAppAcquisitionContext(once, referral, { consentState: 'granted' }),
    once,
  );
});

test('maps every allowlisted field for flat custom-attribute consumers', () => {
  const attributes = metaWhatsAppReferralAttributes(referral);
  assert.equal(attributes.clicktrail_referral_source_url, referral.source_url);
  assert.equal(attributes.clicktrail_referral_media_id, referral.media_id);
  assert.equal(attributes.clicktrail_referral_media_content_type, referral.media_content_type);
  assert.equal(attributes.clicktrail_referral_media_url, referral.media_url);
  assert.equal(attributes.clicktrail_referral_num_media, referral.num_media);
  assert.equal(attributes.clicktrail_referral_welcome_message_text, 'Hello');
  assert.equal(attributes.clicktrail_referral_arbitrary, undefined);
});

test('preserves an existing flat referral snapshot without mixing messages', () => {
  const result = mergeMetaWhatsAppReferralAttributes(
    { plan: 'pro', clicktrail_referral_source_id: 'first' },
    referral,
    { consentState: 'granted' },
  );
  assert.equal(result.plan, 'pro');
  assert.equal(result.clicktrail_referral_source_id, 'first');
  assert.equal(result.clicktrail_referral_ctwa_clid, undefined);
  assert.equal(result.clicktrail_referral_arbitrary, undefined);
});

test('treats a recognized flat referral key as occupied regardless of value type', () => {
  const existing = { clicktrail_referral_source_id: 42 };
  assert.deepEqual(
    mergeMetaWhatsAppReferralAttributes(existing, referral, { consentState: 'granted' }),
    existing,
  );
});

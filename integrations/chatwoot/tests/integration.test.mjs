import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichContact } from '../src/index.js';

test('maps Chatwoot attribution fields', () => {
  assert.equal(
    enrichContact({ custom_attributes: {} }, { fbclid: 'f' }).custom_attributes.clicktrail_fbclid,
    'f',
  );
});

test('projects a selected Meta/WhatsApp referral after consent', () => {
  const result = enrichContact(
    { custom_attributes: { plan: 'pro' }, additional_attributes: { inbox_id: 7 } },
    {
      referral: {
        source_url: 'https://fb.me/ad-1',
        source_id: 'ad-1',
        source_type: 'ad',
        headline: 'Course',
        body: 'Learn more',
        media_type: 'video',
        ctwa_clid: 'ctwa-1',
        welcome_message: { text: 'Hello' },
        ignored: 'drop me',
      },
    },
    { consentState: 'granted' },
  );

  assert.deepEqual(result.additional_attributes, { inbox_id: 7 });
  assert.deepEqual(result.custom_attributes, {
    plan: 'pro',
    clicktrail_referral_source_url: 'https://fb.me/ad-1',
    clicktrail_referral_source_id: 'ad-1',
    clicktrail_referral_source_type: 'ad',
    clicktrail_referral_headline: 'Course',
    clicktrail_referral_body: 'Learn more',
    clicktrail_referral_media_type: 'video',
    clicktrail_referral_ctwa_clid: 'ctwa-1',
    clicktrail_referral_welcome_message_text: 'Hello',
  });
});

test('does not project referral context without explicit consent', () => {
  const contact = { custom_attributes: { plan: 'pro' } };
  assert.deepEqual(
    enrichContact(
      contact,
      { referral: { source_url: 'https://fb.me/ad-1', source_id: 'ad-1' } },
    ),
    contact,
  );
  assert.deepEqual(
    enrichContact(
      contact,
      { referral: { source_url: 'https://fb.me/ad-1', source_id: 'ad-1' } },
      { consentState: 'denied' },
    ),
    contact,
  );
  assert.deepEqual(
    enrichContact(
      contact,
      { consentState: 'granted', referral: { source_url: 'https://fb.me/ad-1', source_id: 'ad-1' } },
    ),
    contact,
  );
});

test('preserves first referral fields when later messages conflict', () => {
  const first = enrichContact(
    { custom_attributes: {} },
    { referral: { source_url: 'https://fb.me/ad-1', source_id: 'ad-1', ctwa_clid: 'ctwa-1' } },
    { consentState: 'granted' },
  );
  const second = enrichContact(
    first,
    { referral: { source_url: 'https://fb.me/ad-2', source_id: 'ad-2', ctwa_clid: 'ctwa-2' } },
    { consentState: 'granted' },
  );
  assert.equal(second.custom_attributes.clicktrail_referral_source_id, 'ad-1');
  assert.equal(second.custom_attributes.clicktrail_referral_source_url, 'https://fb.me/ad-1');
  assert.equal(second.custom_attributes.clicktrail_referral_ctwa_clid, 'ctwa-1');
});

test('does not parse copied, forwarded, or edited message payloads', () => {
  const messages = [
    { content: 'source_url=https://fb.me/ad-1' },
    { content: 'Forwarded ad text', forwarded: true },
    { content: 'Edited ad text', edited: true },
    {
      content: 'raw Chatwoot message',
      content_attributes: {
        referral: { source_url: 'https://fb.me/ad-1', source_id: 'ad-1' },
      },
    },
  ];

  for (const message of messages) {
    assert.deepEqual(
      enrichContact({}, message, { consentState: 'granted' }).custom_attributes,
      {},
    );
  }
});

test('ignores malformed and empty referral values', () => {
  const contact = { custom_attributes: { plan: 'pro' } };
  for (const referral of [null, [], {}, { headline: 'not enough' }, { source_id: 42 }]) {
    assert.deepEqual(
      enrichContact(contact, { referral }, { consentState: 'granted' }),
      contact,
    );
  }
});

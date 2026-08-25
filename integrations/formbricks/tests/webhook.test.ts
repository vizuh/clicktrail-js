import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyFormbricksWebhookSignature } from '../src/webhook.js';

const secret = `whsec_${Buffer.from('formbricks-test-secret').toString('base64')}`;
const rawBody = '{"event":"responseFinished"}';
const webhookId = 'msg_formbricks_1';
const timestamp = 1_756_110_400;

function signature(body = rawBody, id = webhookId, time = timestamp): string {
  return createHmac('sha256', Buffer.from('formbricks-test-secret'))
    .update(`${id}.${time}.${body}`)
    .digest('base64');
}

describe('Formbricks webhook verification', () => {
  it('accepts a valid Standard Webhooks signature', () => {
    expect(
      verifyFormbricksWebhookSignature(
        rawBody,
        {
          'webhook-id': webhookId,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': `v1,${signature()}`,
        },
        secret,
        { now: timestamp },
      ),
    ).toBe(true);
  });

  it('rejects changed bodies and stale timestamps', () => {
    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature()}`,
    };
    expect(verifyFormbricksWebhookSignature('{"event":"responseCreated"}', headers, secret, { now: timestamp })).toBe(
      false,
    );
    expect(verifyFormbricksWebhookSignature(rawBody, headers, secret, { now: timestamp + 301 })).toBe(false);
  });

  it('rejects non-finite verifier clock options', () => {
    const headers = {
      'webhook-id': webhookId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature()}`,
    };
    expect(verifyFormbricksWebhookSignature(rawBody, headers, secret, { now: Number.NaN })).toBe(false);
    expect(verifyFormbricksWebhookSignature(rawBody, headers, secret, { toleranceSeconds: Number.NaN })).toBe(false);
  });

  it('accepts a valid signature when an older candidate is also present', () => {
    expect(
      verifyFormbricksWebhookSignature(
        rawBody,
        {
          'webhook-id': webhookId,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': `v1,invalid v1,${signature()}`,
        },
        secret,
        { now: timestamp },
      ),
    ).toBe(true);
  });
});

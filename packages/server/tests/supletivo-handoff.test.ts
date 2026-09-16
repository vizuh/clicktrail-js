import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildReferralTouch,
  decodeContinuationToken,
  encodeContinuationToken,
  isApprovedHost,
} from '@vizuh/clicktrail-browser';
import type { ClickTrailEvent } from '@vizuh/clicktrail-browser';
import {
  emptyAttribution,
  mergeAttributionTouch,
  parseAttributionUrl,
} from '@vizuh/clicktrail-core';
import { createTenantAdapter } from '../src/tenant-adapter.js';

interface HandoffFixture {
  name: string;
  site_id: string;
  workspace_id: string;
  landing_url: string;
  app_url: string;
  rejected_url: string;
  partner_ref: string;
  host_owned: {
    attribution_id: string;
    lead_id: string;
    customer_id: string;
    invoice_id: string;
  };
  otp: { identity_key: string };
  checkout: { value: number; currency: string };
  pix: {
    provider_event_id: string;
    status: string;
    amount: number;
    currency: string;
    invoice_id: string;
  };
  events: {
    lead: { external_id: string; occurred_at: string };
    sale: { occurred_at: string };
  };
  expected: {
    first_source: string;
    first_medium: string;
    last_source: string;
    order_id: string;
    approved_host: string;
    rejected_host: string;
    duplicate_sale_count: number;
  };
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/supletivo-handoff.json', import.meta.url), 'utf8'),
) as HandoffFixture;

function partnerRefFromUrl(url: string): string | null {
  try {
    const value = new URL(url).searchParams.get('ref');
    return value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

type AttributionSnapshot = Readonly<{
  attribution_id: string;
  partner_ref: string;
  first_touch: Readonly<{
    source: string;
    medium: string;
    campaign: string;
    click_id: string;
  }>;
}>;

function makeSnapshot(payload: Record<string, string>, url: string): AttributionSnapshot {
  const partnerRef = partnerRefFromUrl(url);
  if (!partnerRef) throw new Error('host: valid partner ref is required');
  return Object.freeze({
    attribution_id: fixture.host_owned.attribution_id,
    partner_ref: partnerRef,
    first_touch: Object.freeze({
      source: payload['ft_source'] ?? '',
      medium: payload['ft_medium'] ?? '',
      campaign: payload['ft_campaign'] ?? '',
      click_id: payload['gclid'] ?? '',
    }),
  });
}

function parseTouch(url: string, now: string) {
  const parsed = parseAttributionUrl({
    url,
    currentHost: new URL(url).host,
    now,
  });
  if (parsed.kind !== 'touch') throw new Error(`expected touch: ${parsed.reason}`);
  return parsed.touch;
}

function hmacPair() {
  const key = 'synthetic-shared-signing-key';
  const sign = async (body: string): Promise<string> =>
    createHmac('sha256', key).update(body).digest('base64url');
  const verify = async (body: string, signature: string): Promise<boolean> =>
    sign(body).then((expected) => expected === signature);
  return { sign, verify };
}

function hostId(input: string): string {
  if (!input) throw new Error('host: correlation key is required');
  if (!/^attr_[a-z0-9_-]+$/i.test(input)) throw new Error('host: invalid correlation key');
  return input;
}

describe('Supletivo Astro -> Django/OTP/invoice/Pix reference fixture', () => {
  it('covers consent, first-touch preservation, approved handoff, host state, and Pix idempotency', async () => {
    const noConsentPayload = emptyAttribution();
    expect(noConsentPayload['ft_source']).toBe('');

    const firstTouch = parseTouch(
      fixture.landing_url,
      fixture.events.lead.occurred_at,
    );
    const initialPayload = mergeAttributionTouch(emptyAttribution(), firstTouch);
    expect(initialPayload['ft_source']).toBe(fixture.expected.first_source);
    expect(initialPayload['ft_medium']).toBe(fixture.expected.first_medium);
    // `ref` is deliberately host-owned; the ClickTrail parser does not emit it.
    expect(initialPayload['ref']).toBeUndefined();
    expect(initialPayload['attribution_id']).toBeUndefined();

    const snapshot = makeSnapshot(initialPayload, fixture.landing_url);
    const laterPayload = mergeAttributionTouch(
      initialPayload,
      parseTouch(
        'https://landing.supletivo.test/pricing?utm_source=email&utm_medium=email',
        fixture.events.sale.occurred_at,
      ),
    );
    expect(laterPayload['ft_source']).toBe(snapshot.first_touch.source);
    expect(laterPayload['lt_source']).toBe(fixture.expected.last_source);
    expect(snapshot.first_touch.source).toBe(fixture.expected.first_source);

    const approvedHost = new URL(fixture.app_url).host;
    const rejectedHost = new URL(fixture.rejected_url).host;
    expect(isApprovedHost(approvedHost, ['supletivo.test'])).toBe(true);
    expect(isApprovedHost(rejectedHost, ['supletivo.test'])).toBe(false);

    const { sign, verify } = hmacPair();
    const token = await encodeContinuationToken({
      visitorId: 'visitor_opaque_42',
      sessionId: 'session_opaque_42',
      attribution: {
        lt_source: laterPayload['lt_source'] ?? '',
        lt_medium: laterPayload['lt_medium'] ?? '',
        gclid: laterPayload['gclid'] ?? '',
      },
      nowMs: Date.parse(fixture.events.lead.occurred_at),
      sign,
    });
    const decoded = await decodeContinuationToken(
      token,
      verify,
      Date.parse(fixture.events.sale.occurred_at),
    );
    expect(decoded.kind).toBe('valid');
    if (decoded.kind !== 'valid') throw new Error('expected a valid handoff token');
    // Shared first-party storage carries the immutable first touch; the
    // continuation token contributes the current hop as a last touch.
    const appPayload = mergeAttributionTouch(
      initialPayload,
      buildReferralTouch({
        payload: decoded.payload,
        landingUrl: fixture.app_url,
        nowIso: fixture.events.sale.occurred_at,
      }),
    );
    expect(appPayload['ft_source']).toBe(fixture.expected.first_source);
    expect(appPayload['lt_medium']).toBe('referral');

    expect(partnerRefFromUrl(fixture.landing_url)).toBe(fixture.partner_ref);
    expect(partnerRefFromUrl(fixture.landing_url.replace('&ref=', '&ref=bad%2F'))).toBeNull();
    expect(partnerRefFromUrl(fixture.landing_url.replace(/&ref=[^&]+/, ''))).toBeNull();

    const snapshots = new Map<string, AttributionSnapshot>();
    snapshots.set(snapshot.attribution_id, snapshot);
    const otpIdentityKey = fixture.otp.identity_key;
    const leadRecord = {
      lead_id: fixture.host_owned.lead_id,
      attribution_id: hostId(snapshot.attribution_id),
      otp_identity_key: otpIdentityKey,
    };
    expect(leadRecord.otp_identity_key).toBe(otpIdentityKey);
    expect(snapshots.get(leadRecord.attribution_id)?.first_touch.source).toBe('google');

    const invoices = new Map<string, {
      invoice_id: string;
      lead_id: string;
      attribution_id: string;
      value: number;
      currency: string;
    }>();
    const createInvoice = (attributionId: string, clientValue: number) => {
      const record = snapshots.get(attributionId);
      if (!record) throw new Error('host: unknown attribution_id');
      const invoice = {
        invoice_id: fixture.host_owned.invoice_id,
        lead_id: leadRecord.lead_id,
        attribution_id: record.attribution_id,
        value: fixture.checkout.value,
        currency: fixture.checkout.currency,
      };
      invoices.set(invoice.invoice_id, invoice);
      // Client price is not authoritative; the host's pricing table is.
      expect(clientValue).not.toBe(invoice.value);
      return invoice;
    };
    expect(() => createInvoice('attr_tampered', 0.01)).toThrow(/unknown attribution_id/);
    const invoice = createInvoice(snapshot.attribution_id, 0.01);
    expect(invoice.value).toBe(fixture.checkout.value);

    const adapter = createTenantAdapter({
      endpoint: 'https://collector.supletivo.test/v1/events',
      tenantId: 'supletivo-tenant',
      siteId: fixture.site_id,
      workspaceId: fixture.workspace_id,
      adapterName: 'supletivo-host',
      adapterVersion: '0.1.0',
    });
    const leadEvent = adapter.build({
      identity: { payload: initialPayload, visitorId: 'visitor_opaque_42', sessionId: 'session_opaque_42' },
      eventName: 'lead_created',
      externalEventId: fixture.events.lead.external_id,
      leadId: leadRecord.lead_id,
      now: fixture.events.lead.occurred_at,
      data: {
        properties: { attribution_id: leadRecord.attribution_id },
        email: 'must-not-be-forwarded',
      },
    });
    expect(leadEvent.event_name).toBe('lead_created');
    expect(leadEvent.lead_id).toBe(leadRecord.lead_id);
    expect(leadEvent.marketing_trail.lead_id).toBe(leadRecord.lead_id);
    expect(leadEvent.properties).toMatchObject({ attribution_id: leadRecord.attribution_id });
    expect(leadEvent.attribution_id).toBeUndefined();
    expect(leadEvent.email).toBeUndefined();

    const seenProviderEvents = new Set<string>();
    const saleEvents: ClickTrailEvent[] = [];
    type SignedPixWebhook = typeof fixture.pix & { signature: string };
    const pixBody = (webhook: SignedPixWebhook): string => JSON.stringify({
      provider_event_id: webhook.provider_event_id,
      status: webhook.status,
      amount: webhook.amount,
      currency: webhook.currency,
      invoice_id: webhook.invoice_id,
    });
    const signedPix: SignedPixWebhook = {
      ...fixture.pix,
      signature: await sign(JSON.stringify(fixture.pix)),
    };
    const processPix = async (
      webhook: SignedPixWebhook,
    ): Promise<'emitted' | 'duplicate' | 'rejected'> => {
      if (!(await verify(pixBody(webhook), webhook.signature))) return 'rejected';
      const stored = invoices.get(webhook.invoice_id);
      if (
        webhook.status !== 'PAID' ||
        !stored ||
        webhook.amount !== stored.value ||
        webhook.currency !== stored.currency
      ) return 'rejected';
      if (seenProviderEvents.has(webhook.provider_event_id)) return 'duplicate';
      seenProviderEvents.add(webhook.provider_event_id);
      saleEvents.push(adapter.build({
        identity: { payload: initialPayload },
        eventName: 'sale',
        externalEventId: webhook.provider_event_id,
        orderId: stored.invoice_id,
        now: fixture.events.sale.occurred_at,
        data: {
          value: stored.value,
          currency: stored.currency,
          properties: { attribution_id: stored.attribution_id },
        },
      }));
      return 'emitted';
    };

    // A changed body with the old signature is rejected before invoice lookup.
    expect(await processPix({ ...signedPix, amount: 0.01 })).toBe('rejected');
    expect(saleEvents).toHaveLength(0);
    expect(await processPix(signedPix)).toBe('emitted');
    expect(await processPix(signedPix)).toBe('duplicate');
    expect(saleEvents).toHaveLength(fixture.expected.duplicate_sale_count);
    expect(saleEvents[0]?.order_id).toBe(fixture.expected.order_id);
    expect(saleEvents[0]?.value).toBe(fixture.checkout.value);
    expect(saleEvents[0]?.properties).toMatchObject({ attribution_id: snapshot.attribution_id });
    expect(saleEvents[0]?.event_id).toBe(
      adapter.build({
        identity: { payload: initialPayload },
        eventName: 'sale',
        externalEventId: signedPix.provider_event_id,
        orderId: invoice.invoice_id,
        now: fixture.events.sale.occurred_at,
        data: { value: invoice.value, currency: invoice.currency },
      }).event_id,
    );
  });
});

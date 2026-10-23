# GA4 Measurement Protocol: join a confirmed payment to the browser session

`buildGa4MeasurementProtocolEvent` in `@vizuh/clicktrail-server` shapes a GA4
Measurement Protocol (MP) `purchase` or `refund` so it lands in the browser
session that started the checkout. GA4 then credits the session's real
channel, and the GA4 to Google Ads conversion import counts the purchase.

The builder is pure. It does not read the clock, hold secrets, or send
requests. The host passes every time value, keeps the `api_secret`, and POSTs
the returned payload.

```ts
import { buildGa4MeasurementProtocolEvent } from '@vizuh/clicktrail-server';

const result = buildGa4MeasurementProtocolEvent({
  event: 'purchase',
  snapshot: order.attributionSnapshot, // stored at checkout start
  transactionId: order.checkoutSessionId,
  value: order.amount,
  currency: order.currency,
  checkoutStartedAt: order.checkoutStartedAt,
  paidAt,
  now: new Date().toISOString(),
  consent: order.adsConsent, // { ad_user_data, ad_personalization }
});

if ('skip' in result) {
  // Log result.skip. Do not retry with invented IDs.
} else {
  // POST result.payload to /mp/collect.
}
```

## Why this exists

A server-side purchase that misses the browser session shows up in GA4 as a
new session with source `(not set)`, which reports as Unassigned. Hand-rolled
senders usually miss one of these:

- no `session_id`, so GA4 opens a new session;
- a `session_id` from the wrong GA4 property;
- the payment time used as the event time when a delayed method (Pix, boleto,
  bank transfer) confirmed after the session ended;
- one ID on browser `begin_checkout` and another on the server `purchase`, so
  the funnel never joins.

## Inputs

| Field | Required | Notes |
|---|---|---|
| `event` | yes | `'purchase'` or `'refund'`. |
| `snapshot` | yes | Flat ClickTrail attribution record the host stored **at checkout start**. The builder reads `ga_client_id` and `ga_session_id` only. |
| `transactionId` | yes | Canonical transaction ID (see rule 6). At most 100 characters. |
| `value` | yes | Finite number, `>= 0`. Load it from the host order record. |
| `currency` | yes | ISO 4217 code. |
| `items` | no | GA4 items. Only `item_id`, `item_name`, `item_brand`, `item_category`, `item_variant`, `price`, and `quantity` are copied. Each item needs `item_id` or `item_name`. |
| `consent` | yes | Stored choice: `{ ad_user_data: 'granted' \| 'denied', ad_personalization: 'granted' \| 'denied' }`. |
| `now` | yes | ISO-8601 send time from the host clock. |
| `checkoutStartedAt` | purchase | ISO-8601 time of `begin_checkout`, the last session activity the host knows about. |
| `paidAt` | purchase | ISO-8601 time the payment was confirmed. |
| `sessionTimeoutMinutes` | no | The GA4 property's session timeout (5 to 475). Default 30. |
| `allowMissingSession` | no | Explicit choice to send a purchase without `session_id`. Default `false`. |
| `refundedAt` | refund | ISO-8601 time of the refund. |

Use the same server clock for `checkoutStartedAt`, `paidAt`, `refundedAt`,
and `now`. Malformed input throws `TypeError`. A data condition that would
make GA4 drop or misattribute the event returns `{ skip: reason }`.

## Rules the builder enforces

1. **`client_id` is the browser's `_ga` client ID.** The builder never invents
   one. A missing ID returns `skip: 'missing_client_id'`; a value that is not a
   GA client ID returns `skip: 'invalid_client_id'`. A raw `_ga` cookie value
   (`GA1.1.<random>.<timestamp>`) is reduced to `<random>.<timestamp>`, the
   same reduction the browser adapter applies.
2. **`session_id` is the numeric GA4 session ID.** A purchase carries
   `events[0].params.session_id` as a number. A missing ID returns
   `skip: 'missing_session_id'` unless the host sets `allowMissingSession`;
   then the purchase is sent without `session_id` at `paidAt` and GA4 records
   it in a new, unattributed session. A non-numeric ID returns
   `skip: 'invalid_session_id'`, because a wrong session ID splits the session.
   Capture the session ID from the GA4 property that receives the event. On
   domains with more than one GA4 property, pin it in the browser adapter
   (see issue #47).
3. **`timestamp_micros` falls inside that session.** When the payment confirms
   within `sessionTimeoutMinutes` of checkout start, the event uses `paidAt`.
   Later confirmations use checkout start + 1 s, and the result reports
   `timestampSource: 'checkout_start_plus_1s'`. GA4 accepts events up to 72 h
   in the past, so an event time older than that returns `skip: 'too_late'`.
   A `paidAt` before `checkoutStartedAt` returns `skip: 'paid_before_checkout'`.
4. **`engagement_time_msec` is 1.** Google's MP guidance pairs it with
   `session_id` so the event counts as session activity; it must be at least 1.
5. **`consent` mirrors the stored choice.** The input values `'granted'` and
   `'denied'` map to `GRANTED` and `DENIED`. There is no default, so a host
   cannot send a hard-coded grant by omission. Denied ad signals still send the
   event to GA4, but GA4 does not use it for ad user data or personalization.
6. **One canonical `transaction_id`.** Use the same ID on browser
   `begin_checkout`, server `purchase`, refunds, and ad-platform uploads.
   The builder cannot check this; the host must.
7. **Send only on confirmed payment.** The builder does not see the payment
   provider. The host calls it only after the payment is confirmed (see
   below).

Refunds use `refundedAt` and omit `session_id`: a refund is not session
activity, and GA4 matches it to the purchase by `transaction_id`.

### Reporting-date trade-off

When a delayed payment is moved to checkout start + 1 s, GA4 reports the
purchase on the checkout date and hour, not the payment date. A Pix started
before midnight and paid after it appears on the previous day. Revenue totals
by payment date in the host system and by event date in GA4 will differ for
these orders. The alternative, sending at payment time, loses the channel
entirely. Log `timestampSource` so finance reconciliation can explain the
difference.

## Canonical `transaction_id` with Stripe Checkout

Use the Checkout Session ID (`cs_...`). It is known to the browser when
`begin_checkout` fires, to the webhook, and to the host database.
PaymentIntent and invoice IDs are created later or only server-side, so the
browser cannot put them on `begin_checkout`.

## Confirmed payment with Stripe Checkout

Build the purchase only for:

- `checkout.session.completed` with `payment_status === 'paid'` (cards and
  other immediate methods);
- `checkout.session.async_payment_succeeded` (Pix, boleto, bank transfers and
  other delayed methods).

`checkout.session.completed` with `payment_status === 'unpaid'` means a
delayed method is still pending. Do not send a purchase for it, and do not
send one for `checkout.session.async_payment_failed`.

## Recipe: Stripe webhook to GA4

Store the attribution snapshot when checkout starts, then build the event in
the webhook. This stub leaves signature checks, storage, and logging to the
host.

```ts
import { buildGa4MeasurementProtocolEvent } from '@vizuh/clicktrail-server';

// At checkout start (server route that creates the Checkout Session):
//   order.checkoutSessionId  = session.id
//   order.checkoutStartedAt  = new Date().toISOString()
//   order.attributionSnapshot = parseIdentityFromCookies(cookieHeader).payload
//   order.adsConsent          = the stored Consent Mode choice for this visitor

// In the Stripe webhook, after verifying the signature:
const session = event.data.object;
const confirmed =
  (event.type === 'checkout.session.completed' && session.payment_status === 'paid') ||
  event.type === 'checkout.session.async_payment_succeeded';
if (!confirmed) return;

const order = await orders.findByCheckoutSessionId(session.id);
if (!order || order.ga4PurchaseSentAt) return; // webhook retries are no-ops

const result = buildGa4MeasurementProtocolEvent({
  event: 'purchase',
  snapshot: order.attributionSnapshot,
  transactionId: order.checkoutSessionId,
  value: order.amount,
  currency: order.currency,
  checkoutStartedAt: order.checkoutStartedAt,
  paidAt: new Date(event.created * 1000).toISOString(),
  now: new Date().toISOString(),
  consent: order.adsConsent,
});

if ('skip' in result) {
  logger.info('ga4 purchase skipped', { reason: result.skip });
  return;
}

const url = new URL('https://www.google-analytics.com/mp/collect');
url.searchParams.set('measurement_id', process.env.GA4_MEASUREMENT_ID!);
url.searchParams.set('api_secret', process.env.GA4_API_SECRET!);
const response = await fetch(url, { method: 'POST', body: JSON.stringify(result.payload) });
if (response.ok) await orders.markGa4PurchaseSent(order.id, result.timestampSource);
```

### Validate before going live

POST the same body to `https://www.google-analytics.com/debug/mp/collect`
with the same query string. The debug endpoint does not record events. An
empty `validationMessages` array means GA4 accepted the payload shape. It does
not prove session join: after a test purchase, check that the event appears
under the original session's source/medium in GA4 (or in the BigQuery export,
same `ga_session_id` as `begin_checkout`).

## Related

- [`packages/server/README.md`](../packages/server/README.md)
- Fixtures: [`packages/server/tests/fixtures/ga4-measurement-protocol.json`](../packages/server/tests/fixtures/ga4-measurement-protocol.json)
- [Astro -> Django/OTP/Pix handoff recipe](TUTORIALS.md#astro---djangootppix-handoff-recipe)

# clicktrail (Python)

ClickTrail attribution SDK for Python servers. Stdlib only.

```bash
pip install clicktrail
```

## Usage

```python
from clicktrail import ClickTrail

ct = ClickTrail(api_key="sk_...", site_id="site-1", endpoint="https://ingest.example.com/api/events")
result = ct.conversion(order_id="ord_1", value=499.0, currency="EUR")
print(result.ok, result.status, result.event_id)
```

Senders (`track`, `lead`, `conversion`, `booking`, `refund`, `consent`) return a
`ClickTrailResult(ok, status, event_id)` and NEVER raise for network failures.
Validation errors raise `TypeError` before anything is sent. When
`external_key` is provided the event id is derived deterministically via
`clicktrail.ids.derive_stable_event_id` (`sha256-128-v1`, using shared golden vectors with the JS core);
otherwise a fresh `evt_<uuid4>` is minted once per logical occurrence.

Delivery is a single-event POST of `{"events": [event]}` JSON to `endpoint`,
with header `X-ClickTrail-Key` when an api key is configured. The transport is
injectable: pass `http_post(url, body, headers) -> status` for tests; the
default uses `urllib.request`.

Helpers: `clicktrail.ids`, `clicktrail.events`, `clicktrail.retry`,
`clicktrail.landing.parse_landing` / `classify_referrer`.

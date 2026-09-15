# @vizuh/clicktrail-chatwoot

Chatwoot integration adapter. It preserves existing contact custom attributes,
maps local click IDs, and can project a host-selected Meta/WhatsApp referral
into bounded `clicktrail_referral_*` attributes.

```js
import { enrichContact } from '@vizuh/clicktrail-chatwoot';

const contact = enrichContact(
  chatwootContact,
  { referral: inboundMessage.content_attributes?.referral },
  { consentState: 'granted' },
);
```

## Referral field mapping

The input uses the normalized snake_case shape already stored by the inspected
Chatwoot WhatsApp services. The adapter does not accept or parse a raw webhook
or message object.

| Normalized input | Flat contact custom attribute |
|---|---|
| `source_url` | `clicktrail_referral_source_url` |
| `source_id` | `clicktrail_referral_source_id` |
| `source_type` | `clicktrail_referral_source_type` |
| `headline` | `clicktrail_referral_headline` |
| `body` | `clicktrail_referral_body` |
| `media_type` | `clicktrail_referral_media_type` |
| `image_url` | `clicktrail_referral_image_url` |
| `video_url` | `clicktrail_referral_video_url` |
| `thumbnail_url` | `clicktrail_referral_thumbnail_url` |
| `ctwa_clid` | `clicktrail_referral_ctwa_clid` |
| `media_id` | `clicktrail_referral_media_id` |
| `media_content_type` | `clicktrail_referral_media_content_type` |
| `media_url` | `clicktrail_referral_media_url` |
| `num_media` | `clicktrail_referral_num_media` |
| `welcome_message.text` | `clicktrail_referral_welcome_message_text` |

The first ten fields are the observed Meta/Cloud referral shape in this
Chatwoot checkout, including `ctwa_clid`. The media detail fields are emitted
by the inspected Twilio referral helper. `welcome_message.text` is flattened
only for the contact projection. `ctwa_clid` remains provider-scoped; it is not
renamed to `fbclid` or treated as a canonical ClickTrail click ID.

Unknown keys, empty values, non-string values, and arbitrary nested objects are
discarded. Every retained string is trimmed, control characters are removed,
and the result is capped at 512 characters. The referral must contain at least
one of `source_url`, `source_id`, or `ctwa_clid`.

The host must choose which message or conversation referral is eligible. The
adapter does not promote every message automatically. The merge is consent
gated and first-snapshot-wins, so conflicting or replayed messages do not
replace or mix the selected snapshot.

This package only normalizes local payloads. Configure consent, access control,
retention, Chatwoot credentials, retries, idempotency, and the final API write
in the host application. It does not call Chatwoot. Referral data is observed
and unverified; it does not prove a click, delivery, identity, consent, or
campaign authenticity.

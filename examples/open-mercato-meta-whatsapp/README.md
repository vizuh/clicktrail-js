# Open Mercato Meta/WhatsApp referral example

Copy `index.mjs` into an Open Mercato host when its communication-channel
adapter has already extracted a normalized referral. The example has no npm or
ClickTrail runtime dependency and does not change Open Mercato modules.

```js
import { enrichOpenMercatoContext } from './index.mjs';

const captureContext = enrichOpenMercatoContext(
  link.captureContext,
  { referral: message.content_attributes?.referral },
  { consentState: 'granted' },
);
```

Accepted input fields are `source_url`, `source_id`, `source_type`, `headline`,
`body`, `media_type`, `image_url`, `video_url`, `thumbnail_url`, `ctwa_clid`,
`media_id`, `media_content_type`, `media_url`, `num_media`, and the explicit
nested field `welcome_message.text`, flattened to
`welcome_message_text`. Values must be strings, are trimmed and capped at 512
characters, and at least one of `source_url`, `source_id`, or `ctwa_clid` must
be present. Unknown keys and nested objects are discarded.

The host chooses one eligible message or conversation referral. The merge is
consent-gated and first-snapshot-wins, so conflicting or replayed messages do
not replace or mix the selected snapshot. The referral is unverified context;
it does not prove a click, delivery, identity, consent, or campaign authenticity.
Keep sender identity, tenant/organization scope, retention, access control,
lead persistence, retries, and idempotency in the host. Do not use the referral
for authorization, pricing, eligibility, fraud, or identity decisions.

# @vizuh/clicktrail-next

Next.js click ID capture for App Router and Pages Router applications. It provides allowlisted GCLID, GBRAID, WBRAID, FBCLID, MSCLKID, TTCLID, and LI_FAT_ID capture, first-party cookie serialization, hidden form fields, and server-side attachment helpers.

The package does not create ad-platform conversions or accept browser identity and tenant fields as trusted input. Add consent gating and a server-owned lead/order ID at the application boundary.

## First-touch signup attribution across subdomains

Use `captureFirstTouchFromNextRequest` in middleware to capture the complete
canonical record (UTMs, click IDs, channel, referrer, landing page, and
 timestamp). Set a parent-domain cookie when the marketing and app hosts are
subdomains of the same site:

```js
import { createMiddleware } from '@vizuh/clicktrail-next';

export const middleware = createMiddleware({
  domain: '.recoupable.dev',
});
```

The middleware is first-touch write-once. A later `/signup` request cannot
replace the original campaign. In the signup server action, attach the
server-owned account ID and persist the returned `first_touch` object:

```js
import { cookies } from 'next/headers';
import { attachAttributionToAccount } from '@vizuh/clicktrail-next';

const accountAttribution = await attachAttributionToAccount(
  account.id,
  await cookies(),
);
// Persist accountAttribution.first_touch with the account record.
```

The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and expires after 90 days
by default. A parent-domain cookie only applies when both hosts are controlled
by the same site. For unrelated domains, use an application-owned handoff
endpoint and an authenticated, one-time token; do not copy attribution from
untrusted client input.

The runnable boundary fixture is in
[`examples/recoupable-first-touch-signup`](./examples/recoupable-first-touch-signup/README.md).

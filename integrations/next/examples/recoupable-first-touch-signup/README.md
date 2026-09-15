# Recoupable first-touch signup attribution

Reference flow for the open Recoupable/app #1902 TODO:

```text
recoupable.dev/pricing?utm_source=google&gclid=...
  -> parent-domain HttpOnly cookie
app.recoupable.dev/signup
  -> server-owned account ID + first_touch
```

Run the synthetic boundary fixture from the Next adapter directory:

```bash
pnpm --filter @vizuh/clicktrail-next test
node integrations/next/examples/recoupable-first-touch-signup/example.mjs
```

The fixture does not call Recoupable, Stripe, Google, or Meta. It verifies the
contract locally before an upstream integration is attempted.

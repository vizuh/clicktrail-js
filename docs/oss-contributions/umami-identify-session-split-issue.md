# Umami — anonymous acquisition split at `identify()`

**Upstream**: [umami-software/umami](https://github.com/umami-software/umami)
**Issue**: [#4583](https://github.com/umami-software/umami/issues/4583) — *3.4.0: `umami.identify()` splits a visitor into two sessions*
**Author**: `joagaloppo`, opened 2026-09-29T19:45:09Z
**Our comment**: [issuecomment-5922732084](https://github.com/umami-software/umami/issues/4583#issuecomment-5922732084)
**Posted**: 2026-09-29
**Status**: Open, 0 comments before ours. No maintainer response at time of posting.

## Prior-contact check

Run before posting, after the CG Dynamics near-miss on a sibling issue:

| Check | Result |
|---|---|
| Comments by us anywhere in `umami-software/umami` | **0** of 10,774 scanned |
| Existing Umami record in this ledger | none |

This is the check that should have run first on CG Dynamics #405. It costs one
API call and it is now standard for every new upstream.

## What the issue is

Umami 3.4.0 changed the session key at `src/app/api/send/route.ts:162`:

```ts
const sessionId = uuid(sourceId, ip, userAgent, sessionSalt, distinctId ?? '')
```

Adding `distinctId` to the hash means calling `umami.identify(id)` changes the
session id. The first page view goes out before that call, with no `id`. One
visitor on one device becomes two sessions: an anonymous one holding the
landing views, and an identified one holding everything after.

Measured in production, self-hosted, PostgreSQL, tracker behind a proxy:

| | Member sessions | With no page views |
|---|---|---|
| 24h on 3.3.1 | 450 | 1 |
| 48 min on 3.4.0 | 79 | **17** |

Rolled back to 3.3.1. That 17-of-79 is the strongest evidence in the issue: it
is not only that funnels split, but that roughly a fifth of sessions carry no
page view, which distorts every funnel and journey built on top.

## Why this record matters more than the bug

It validates the **anonymous → authenticated identity transition** as a
first-class boundary, one step earlier than every other surface in this ledger.

| Recorded so far | Boundary |
|---|---|
| Dapta #199 | host page → cross-origin iframe → contact |
| Hexlet #322 | acquisition → return visit → registration |
| myhb #168 | acquisition → CMP transition → booking |
| CG #405 | website form → canonical CRM lead |
| Alluring #276 | landing → click-id loss → lead → CRM outcome |
| **Umami #4583** | **anonymous visit → identified user → payment-webhook revenue** |

Every previous case starts at a durable record that already exists. This one is
the point where the durable record **first appears**, and where the acquisition
context is most likely to be lost.

## What we actually said

Agreed it is a regression and that their session-key diagnosis is right. Then
one observation about prioritisation, not about diagnosis:

**Both of their proposed fixes are correct and neither covers the webhook.**
Dropping `distinctId` from the key restores one session; reusing the cache-token
session does too. But a server-side purchase event carries `user_id` and revenue
and has **no session id, IP or user agent to hash**. Before 3.4.0 the webhook
event landed in the identified session and was joined to the anonymous visit by
`distinct_id`. That join was doing the work, and it lived in Umami's data rather
than in the application.

So the durable anonymous-to-known join is worth keeping in the application's own
records regardless of how the session key resolves:

```
anonymous visit
   ↓
at signup, copy the acquisition context onto the user row
   ↓
at order, copy it, or a reference to it, onto the order row
   ↓
payment webhook resolves the order
   ↓
revenue ← campaign
```

Once the order row carries the attribution, the webhook stops reconstructing
it, and it stops mattering what any analytics SDK does with sessions. The join
also survives an SDK swap, a proxy, an ad blocker, or a client that never loads
the tracker.

## Boundary compliance

- **Not a pitch, and we said so.** The Umami bug should be fixed by Umami; we
  endorsed both of their fixes rather than proposing an alternative.
- Offered a reference implementation of the signup step, conditionally: *"if
  you want a reference implementation of the signup step specifically, say so
  and I will write one."* No repo link, no product framing in the body.
- No request for PII, no dependency, no claim of adoption.

## Artifact implied

`examples/anonymous-to-user-attribution/`, generic rather than Umami-specific.
The contract is already written in the ClickTrail examples and only needs to be
promoted and given the identify() regression as its motivating case:

```ts
const touch = clicktrail.current()

await createUser({ email, attribution_id: touch.id })

// later, completely server-side
await createOrder({ user_id, attribution_id: user.attribution_id })
```

This generalises to PostHog, GA4, Segment and any custom analytics: **a payment
webhook should never depend on analytics-session continuity to recover
acquisition.**

## Cross-project lessons

1. **Check prior contact in the repo, not just the issue.** The CG Dynamics
   mistake was reading the issue and not the repo comment history. One
   `gh api repos/OWNER/REPO/issues/comments` call settles it. 10,774 comments
   scanned in Umami is about a minute; not scanning is how a maintainer ends up
   reading the same pitch twice.
2. **A split session is a join that moved.** What 3.4.0 broke was not session
   counting. It was that the application stopped owning the anonymous-to-known
   join and started renting it from the analytics SDK's session model. Anything
   an SDK can renumber, the application should persist itself.
3. **A server-side event never had a session to begin with.** Any webhook,
   queue consumer or cron that attributes revenue is reconstructing from
   whatever the SDK happens to expose. That is the strongest argument for
   application-side attribution, and it is stronger than any privacy or
   portability argument.
4. **Empty-session counts are the diagnostic that generalises.** "17 of 79
   sessions have no page view" localises a session-key bug immediately. Worth
   teaching as a habit, not just as this issue's evidence.

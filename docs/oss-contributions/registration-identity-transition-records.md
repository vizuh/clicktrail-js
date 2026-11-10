# Registration / identity-transition attribution — four records

One session, four upstream issues, one reusable primitive:

```
anonymous acquisition
        ↓
navigation / return visit
        ↓
identity transition
        ↓
signup / registration
        ↓
durable user
```

This boundary sits **before** Salesforce, HubSpot, Stripe, WooCommerce, Calendly
or Dynamics become relevant. It is the earliest point where a durable record
is created, and the last point where the acquisition context is still intact.

## Records in this file

| Upstream | Issue | State | Comment |
|---|---|---|---|
| [Hexlet Autoposting](#hexlet) | [#322](https://github.com/hexlet-volunteers/hexlet-autoposting/issues/322) | Open, P2, 0 comments before us | [posted](https://github.com/hexlet-volunteers/hexlet-autoposting/issues/322#issuecomment-5881332464) |
| [myhb-store](#myhb) | [#168](https://github.com/bfroos/myhb-store/issues/168) | Open, P1, 2 comments before us | [posted](https://github.com/bfroos/myhb-store/issues/168#issuecomment-5881337096) |
| [CG-Dynamics](#cg) | [#405](https://github.com/CGProductionHouse/CG-Dynamics/issues/405) | Open, 8 comments, M2A green in PR #422 | [posted](https://github.com/CGProductionHouse/CG-Dynamics/issues/405#issuecomment-5881339860) |
| [Alluring website](#alluring) | [#276](https://github.com/Monsoft-Solutions/alluring-website-v1/issues/276) | Open, 0 comments before us | [posted](https://github.com/Monsoft-Solutions/alluring-website-v1/issues/276#issuecomment-5881345993) |

**Diária Studio [#8553](https://github.com/vjpixel/diaria-studio/issues/8553) was
not posted to.** The report of 9 of 295 registrations carrying `fbclid` while
attributed to `diaria-apex` / `livros` / `arquivo` is an excellent observed
case of *partial* attribution corruption, and we use it as a regression case
in `examples/registration-attribution-handoff`. But the issue is **CLOSED as
COMPLETED on 2026-09-20**, and their own fix path was proposal 2: derive the
channel from the `origem_click_id` prefix when the UTM disagrees. Commenting on
a closed issue to argue against the resolution they already shipped is not a
contribution. The evidence is what makes the regression case worth building.

---

## Hexlet

**Title**: FE: Сохранять UTM и реферер первого касания до регистрации
**Author**: `arthur810629`, opened 2026-09-22, labels `area:frontend`,
`priority:P2`, `type:feature`.

Visitor arrives from search or ads, reads the features page, leaves, returns
by direct link, and only then registers. Nothing is stored, so the registration
records as direct. The issue already asks for write-once first touch, separate
mutable last touch, a 90-day cookie, and parsing before the first router
redirect.

**Language**: replied in Russian, matching the issue.

**What we said.** Their design is correct and we did not propose changing it.
Three alignments worth naming, then one trade:

- Write-once `ft_*` is exactly our merge semantics (`packages/core/src/core/merge.ts:77-82`); the emptiness guard counts `ft_<clickid>` keys too, so the "second visit overwrote first touch" bug cannot occur.
- Their `eslint.config.js` bans `localStorage`/`sessionStorage`. Our cookie is the primary adapter and `localStorage` is a **mirror that is disabled by configuration** (`storage.mirrorAdapter`), so the lint rule is not in tension.
- "Parse before the first router redirect" matches our initialisation point.

The trade, stated with its cost: their cookie carries every tag, so adding
`msclkid` or `gbraid` later changes the **auth** contract. An opaque
transition id in the cookie plus server-side resolution at registration keeps
`auth` unaware of advertising fields. We said plainly that this needs a server
side, and that without one their current scheme is fine and should stay.

---

## myhb

**Title**: [Store][P1] Cookiebot loescht myhb_attribution bei der Banner-Antwort
**Author**: `bfroos`, opened 2026-09-26, labels `bug`, `P1`, `area:store`,
`E1-tracking`.

Cookiebot deletes `myhb_attribution` (cookie + `sessionStorage` +
`localStorage`) at the moment the banner is answered, on Accept and Decline
alike. Reproduced live with Playwright. Consequence: the Calendly booking URL
carries no `gclid`, no UTMs, no `salesforce_uuid`. Measured: 739 of 749
bookings without the consent marker, ~90% without landing-page context.

**Two comments already existed when we arrived**, and both were by the
maintainer: PR #172 already built the in-memory rewrite, and a live check
confirmed `salesforce_uuid=gclid:TEST168;c:1;lp:/` reaching the Calendly URL.
The permanent fix (classifying the cookie as *Necessary* in the Cookiebot
manager) is still open with a named owner.

**Language**: replied in German, matching the issue.

**What we said.** Congratulated the verification, then raised the one gap
their own description already admits: the rewrite reconstructs from
`window.location.search` and the referrer, so it cannot rescue a later organic
returner. The information is gone, not merely unread.

Then the durable point. The real defect is not that Cookiebot is at fault. It
is that **persisting and transmitting are the same decision**. Splitting them:

```
AKQUISITIONSZUSTAND          ZUSTIMMUNGSZUSTAND

gclid                        pending
UTMs          ≠              granted
landing                       denied
referrer
observed_at
       │                          │
       └────── ct_id ─────────────┘
                     ↓
                 Buchung
```

Declining marketing consent changes what may be **exported**; it does not
change where the business record came from. What may legally be retained is
site configuration and their decision, not something ClickTrail imposes.

**We explicitly stated we cannot offer a working integration**: Cookiebot
adapters are **planned, not shipped** (`docs/consent-compatibility-plan.md` is
a v1 design directive dated 2026-08-24; no adapter code exists in
`packages/consent`, which ships only the normalised snapshot, gates, and hub).
Claiming otherwise would have been a lie the reporter would have tested.

**What we asked for**: the split between first-visit and returner cohorts in
their re-measurement. That is worth more to us than a confirmation that the
fix works.

---

## CG

**Title**: Client Lead Inbox + lead-quality feedback loop for CG-built websites
**Author**: `CGProductionHouse`, opened 2026-09-18, 8 comments.

Greenfield, but with active implementation: research hold lifted, M2A canonical
transaction green at `8edf380` in PR #422, draft PR #421 corrected to #422.
Postgres gate green against a disposable database, six-session concurrency,
exact cross-client separation, injected final-event rollback.

**What we said.** Explicitly not a replacement for the sequencing; we said we
had read only the issue threads, not the code. Two observations: capture one
envelope before submit and commit it in the same transaction that already
commits the contact/enquiry pair, so each website editor does not assemble a
slightly different subset; and `New / Contacted / Qualified / Won` is mutable
lifecycle state that must not be able to overwrite an immutable acquisition
snapshot, otherwise v7 versus v8 comparison is confounded by attribution
edits. We noted their existing COALESCE discipline in client-scoped separation
reads like the same instinct, and closed by saying to ignore this if Website
Editor PR #28 already decided the shape.

---

## Alluring

**Title**: Lead attribution: gclid never stored, gbraid/wbraid/_fbp/_fbc missing, no lead outcome
**Author**: `flechilla`, opened 2026-09-24, labels `enhancement`, `database`.

148 leads over 30 days. UTMs on 117/148, landing page on 121/148, **gclid on
0/148** including 13 leads identified as Google paid. FBCLID on 2/148. The
frontend attempts capture and the contact API maps the field; the value never
arrives on the durable `contact_submission` row. Companion #278 covers the
`consult_booked` / `surgery_booked` lifecycle.

**What we said.** Their numbers localise the bug to the boundary, not the
field list, so the reply led with that and skipped preamble. Four ranked
causes for click-ID-specific loss (payload whitelist missing `gclid` while
carrying `utm_*`; captured at load but read from a different place at submit; a
fixed forward set in the API; router redirect or cached page emptying the
query before capture).

A correction worth keeping: **`_fbc` and `_fbp` are not query parameters.**
They are Meta pixel cookies. Reading them from the landing URL only works when
Meta echoed a fresh click; otherwise they exist solely in `_fbc` on the host
domain. Any plan that reads them from the URL will look broken.

Then the durable half: one reference, captured atomically before the lead row
is committed, carried forward by n8n, resolved at `surgery_booked`. Otherwise
each workflow reconstructs attribution, every new identifier becomes a
workflow change, and the envelope is reconstructed exactly when the original
context is least available.

**We closed by asking one question**: is the browser payload missing the click
ID, or is the server discarding it? That answer splits a client fix from a
server fix, and we said so.

---

## Cross-project lessons

1. **Identity transition is the earliest durable boundary, and it is
   under-served.** Every other recorded surface (cart, appointment, checkout,
   embed) happens *after* a durable record exists. Signup is where a durable
   record first appears, and it is the last point where the acquisition
   context still matches the person who arrived.
2. **Persisting and transmitting must be separate decisions.** A CMP wiping
   storage is normal, expected behaviour. What is a bug is a design in which
   that wipe also destroys the only copy of the acquisition evidence, and in
   which consent state and acquisition state are one value.
3. **A partial failure is better evidence than a total one.** Diária's
   `fbclid` surviving while `utm_source` vanished is a *transport* bug with a
   named cause. A total loss is a symptom list.
4. **Ask the question that splits the fix.** "Is the payload missing it, or is
   the server discarding it?" halves the search space in one message and is
   more useful than any framework recommendation.
5. **Do not integrate with a CMP we have not shipped.** myhb was the case
   where the honest answer was "we cannot offer you that yet".
6. **Language matching matters.** Two of four issues were in Russian and one in
   German. Replying in kind is the minimum courtesy and it changes the tone of
   the reception.
7. **Check state before posting.** Diária was reported as open and was closed.
   One API call (`gh issue view --json state,stateReason`) prevents commenting
   on a resolved issue.

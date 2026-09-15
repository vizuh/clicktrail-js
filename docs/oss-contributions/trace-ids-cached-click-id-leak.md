# Issue review: trace-ids cached page leaks a stale click ID

Target: <https://github.com/lifexmarketing/trace-ids/issues/1>

Status checked on **2026-09-15**: open, zero comments. Not a ClickTrail-owned
issue. The reporter is also the project author, so this is a self-filed defect
report with code references.

## Observed seam

The report identifies a cache boundary failure with the exact mechanism:

- `trace_ids_init()` registers `gform_field_value_{param}`, which server-renders
  the hidden field from `$_COOKIE[$param]` at render time;
- when the page is served from a full-page cache (WP Rocket, Varnish, LiteSpeed),
  the baked value belongs to whichever request populated the cache entry;
- the client-side `populateGF()` is meant to correct it, but returns early when
  the current visitor has no matching cookie, so the stale value survives.

The result is the worst case for attribution: an organic visitor's form
submission carries somebody else's `gclid` or `fbclid`.

## Smallest useful contribution

This is the same class of defect as the WordPress cache boundary already
documented for ClickTrail, and the fix shape is established:

- never bake a visitor-scoped value into cached HTML. Render the hidden field
  empty, and let the client populate it from the current visitor's own storage;
- make the client path authoritative and unconditional: if the current visitor
  has no value, clear the field rather than leaving the server value in place;
- treat the server-rendered value as untrusted for exactly this reason.

The second point is the actual bug. Clearing on absence is what `populateGF()`
is missing.

## Boundaries

- The project owns its cache strategy, its form plugin integration, and whether
  clearing or blank-rendering is preferable.
- A stale-value fix proves the form no longer carries another visitor's
  identifier. It does not prove the site's caching layer is otherwise correct.
- No claim is made about Gravity Forms or any cache plugin beyond the mechanism
  the report describes.

## Evidence required before proposing

- a cached page whose rendered hidden field is empty rather than a stale value;
- a submission from a visitor with no cookie carrying no identifier;
- a submission from a visitor with a cookie carrying their own identifier;
- a two-visitor sequence against a warmed cache, which is the case that
  currently fails.

**Disposition:** small, well-scoped, and the report already names the exact
functions. A concise comment confirming the clearing-on-absence rule is a
reasonable first contribution. Nothing here requires a ClickTrail dependency.

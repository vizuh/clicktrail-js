# Issue review: Vanta Labs Google Ads attribution path

Target: <https://github.com/brendenhuntzinger1/vanta-labs/issues/184>

Status checked on **2026-09-15**: open, with no maintainer comments. The issue explicitly
calls this a latent gap, not a current reporting defect.

## Observed cause

The repository has two classification paths that can disagree when Google traffic first
converts:

- `is_paid_ad_source()` admits the four currently purchased platforms or a platform with
  recorded spend; Google is in neither set.
- `resolveMarketingSource()` already treats a `gclid` branch as an ad signal.
- Google Ads is present in the website tag and `gclid` is stored in order attribution,
  but the downstream paid-source and spend path does not consume it.
- The owner’s read-only check found zero orders with `gclid`, zero Google-like UTM sources,
  and zero Google spend rows. Existing values were `null`, `chatgpt.com`, and `tiktok`.

Adding `google` to one list would therefore be an incomplete and unsafe fix. Revenue could
appear under a paid label without a Google spend row, creating an invalid ROAS comparison.

## Maintainer-first contribution

The smallest useful change is a repository-native contract test or mapping helper that
makes the SQL predicate and TypeScript resolver agree. It should wait for the maintainer
to decide:

- whether a click ID alone is sufficient paid evidence when source is absent;
- the canonical key for `google`, `google_ads`, and `adwords`;
- where the mapping is owned so SQL and `utm.ts` cannot drift;
- which `WINDSOR_CONNECTORS` capacity is available;
- how Google spend is ingested before revenue is included in ROAS.

ClickTrail can optionally capture and carry the allowlisted click ID, but it must not
classify an order as paid, manufacture spend, or calculate commercial ROAS for Vanta.

## Parameters and acceptance

- canonical source mapping and its test vectors;
- `gclid`/UTM first- and last-touch fields;
- Google account/campaign spend rows with date and currency;
- order attribution join key and provider-native order value;
- an explicit “not measured” state when spend is absent.

Acceptance is one classification for every order, Google revenue and Google spend on the
same reporting row, and no ROAS until both provider-native inputs exist. The current
under-claiming behaviour is safer than adding an unverified Google label.

**Disposition:** audit/test opportunity; no ClickTrail host PR and no Google connector
change until spend and source rules are confirmed.

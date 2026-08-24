# Node deterministic replay

Zero-dependency Node script (node >= 18) that replays three hardcoded landing
URLs through the pure core engine: `parseAttributionUrl` →
`mergeAttributionTouch` → `stampVersions`, printing each flat canonical
payload as JSON.

What you learn:

- how a landing URL + referrer becomes a classified `ParsedTouch`;
- the flat `ft_*` / `lt_*` payload shape (same contract as the WordPress plugin);
- that the core is deterministic — same inputs, byte-identical output, no
  clock, storage, or network reads.

## Run

```bash
# from the repo root; build once if packages/clicktrail/dist/ is missing:
pnpm --filter @vizuh/clicktrail build

node examples/node-replay/replay.mjs
```

## Expected output

Actual output of `node examples/node-replay/replay.mjs` against the built
package (`schema_version` / `classifier_version` stamps come from the built
source and may differ in later releases):

```
## Google Ads click
{
  "ft_source": "google",
  "ft_medium": "cpc",
  "ft_campaign": "spring-25",
  "ft_term": "",
  "ft_content": "",
  "ft_utm_id": "",
  "ft_utm_source_platform": "",
  "ft_utm_creative_format": "",
  "ft_utm_marketing_tactic": "",
  "ft_channel": "Google Ads",
  "ft_referrer": "https://www.google.com/",
  "ft_landing_page": "https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring-25&gclid=EAIaIQobChMItest",
  "ft_touch_timestamp": "2026-08-24T10:00:00.000Z",
  "lt_source": "google",
  "lt_medium": "cpc",
  "lt_campaign": "spring-25",
  "lt_term": "",
  "lt_content": "",
  "lt_utm_id": "",
  "lt_utm_source_platform": "",
  "lt_utm_creative_format": "",
  "lt_utm_marketing_tactic": "",
  "lt_channel": "Google Ads",
  "lt_referrer": "https://www.google.com/",
  "lt_landing_page": "https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring-25&gclid=EAIaIQobChMItest",
  "lt_touch_timestamp": "2026-08-24T10:00:00.000Z",
  "gclid": "EAIaIQobChMItest",
  "wbraid": "",
  "gbraid": "",
  "fbclid": "",
  "ttclid": "",
  "msclkid": "",
  "twclid": "",
  "li_fat_id": "",
  "sccid": "",
  "epik": "",
  "fbc": "",
  "fbp": "",
  "ttp": "",
  "li_gc": "",
  "ga_client_id": "",
  "ga_session_id": "",
  "ga_session_number": "",
  "click_id_history": "[{\"k\":\"gclid\",\"v\":\"EAIaIQobChMItest\",\"t\":\"2026-08-24T10:00:00.000Z\"}]",
  "attribution_selected_click_id": "EAIaIQobChMItest",
  "attribution_selected_click_id_reason": "newest_valid",
  "ft_gclid": "EAIaIQobChMItest",
  "lt_gclid": "EAIaIQobChMItest",
  "schema_version": "1.2.0",
  "classifier_version": "1.2.0"
}
## Meta social campaign
{
  "ft_source": "facebook",
  "ft_medium": "paid-social",
  "ft_campaign": "retarget-q3",
  "ft_term": "",
  "ft_content": "carousel-a",
  "ft_utm_id": "",
  "ft_utm_source_platform": "",
  "ft_utm_creative_format": "",
  "ft_utm_marketing_tactic": "",
  "ft_channel": "Facebook",
  "ft_referrer": "https://l.facebook.com/",
  "ft_landing_page": "https://example.com/?utm_source=facebook&utm_medium=paid-social&utm_campaign=retarget-q3&utm_content=carousel-a&fbclid=IwAR2demo",
  "ft_touch_timestamp": "2026-08-24T11:30:00.000Z",
  "lt_source": "facebook",
  "lt_medium": "paid-social",
  "lt_campaign": "retarget-q3",
  "lt_term": "",
  "lt_content": "carousel-a",
  "lt_utm_id": "",
  "lt_utm_source_platform": "",
  "lt_utm_creative_format": "",
  "lt_utm_marketing_tactic": "",
  "lt_channel": "Facebook",
  "lt_referrer": "https://l.facebook.com/",
  "lt_landing_page": "https://example.com/?utm_source=facebook&utm_medium=paid-social&utm_campaign=retarget-q3&utm_content=carousel-a&fbclid=IwAR2demo",
  "lt_touch_timestamp": "2026-08-24T11:30:00.000Z",
  "gclid": "",
  "wbraid": "",
  "gbraid": "",
  "fbclid": "IwAR2demo",
  "ttclid": "",
  "msclkid": "",
  "twclid": "",
  "li_fat_id": "",
  "sccid": "",
  "epik": "",
  "fbc": "fb.1.1787571000000.IwAR2demo",
  "fbp": "",
  "ttp": "",
  "li_gc": "",
  "ga_client_id": "",
  "ga_session_id": "",
  "ga_session_number": "",
  "click_id_history": "[{\"k\":\"fbclid\",\"v\":\"IwAR2demo\",\"t\":\"2026-08-24T11:30:00.000Z\"}]",
  "attribution_selected_click_id": "IwAR2demo",
  "attribution_selected_click_id_reason": "newest_valid",
  "ft_fbclid": "IwAR2demo",
  "lt_fbclid": "IwAR2demo",
  "schema_version": "1.2.0",
  "classifier_version": "1.2.0"
}
## Organic referral (no UTMs)
{
  "ft_source": "duckduckgo",
  "ft_medium": "organic",
  "ft_campaign": "",
  "ft_term": "",
  "ft_content": "",
  "ft_utm_id": "",
  "ft_utm_source_platform": "",
  "ft_utm_creative_format": "",
  "ft_utm_marketing_tactic": "",
  "ft_channel": "DuckDuckGo",
  "ft_referrer": "https://duckduckgo.com/",
  "ft_landing_page": "https://example.com/docs/getting-started",
  "ft_touch_timestamp": "2026-08-24T14:05:00.000Z",
  "lt_source": "duckduckgo",
  "lt_medium": "organic",
  "lt_campaign": "",
  "lt_term": "",
  "lt_content": "",
  "lt_utm_id": "",
  "lt_utm_source_platform": "",
  "lt_utm_creative_format": "",
  "lt_utm_marketing_tactic": "",
  "lt_channel": "DuckDuckGo",
  "lt_referrer": "https://duckduckgo.com/",
  "lt_landing_page": "https://example.com/docs/getting-started",
  "lt_touch_timestamp": "2026-08-24T14:05:00.000Z",
  "gclid": "",
  "wbraid": "",
  "gbraid": "",
  "fbclid": "",
  "ttclid": "",
  "msclkid": "",
  "twclid": "",
  "li_fat_id": "",
  "sccid": "",
  "epik": "",
  "fbc": "",
  "fbp": "",
  "ttp": "",
  "li_gc": "",
  "ga_client_id": "",
  "ga_session_id": "",
  "ga_session_number": "",
  "click_id_history": "[]",
  "attribution_selected_click_id": "",
  "attribution_selected_click_id_reason": "",
  "schema_version": "1.2.0",
  "classifier_version": "1.2.0"
}
```

Notes:

- The caller passes `now` explicitly — the engine never reads the clock.
- Click IDs land both top-level (`gclid`) and per-touch (`ft_gclid` /
  `lt_gclid`), plus an append-only `click_id_history`.
- Referrer-only landings classify through the referrer table
  (`duckduckgo` → organic), with no UTMs required.

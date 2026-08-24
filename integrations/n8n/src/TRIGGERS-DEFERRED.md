# TRIGGERS-DEFERRED — n8n-nodes-clicktrail

Per repo rule: explicit deferral, never a half-built trigger. This package
ships **zero** triggers in 0.1.0. All planned triggers below are gated on
stable outbound ClickTrail webhooks existing first — the node must not
invent polling semantics for events the collector does not yet emit.

| # | Planned trigger | Gate | Trigger-mechanism sketch |
|---|---|---|---|
| 1 | New attributed lead | `lead.created` webhook stable | Webhook node type: collector POSTs to an n8n Webhook trigger URL; node normalizes the payload into a ClickTrail lead item. |
| 2 | Lead became qualified | `lead.qualified` webhook stable | Webhook node type: subscribe once per site; emit one item per qualification event. |
| 3 | Sale recorded | `sale.recorded` webhook stable | Webhook node type: receive sale events; pass through `{ ok, status }` ack back to collector. |
| 4 | Attribution changed | `attribution.updated` webhook stable | Webhook node type: diff-aware normalization of old/new trail payload. |
| 5 | Consent withdrawn | `consent.withdrawn` webhook stable | Webhook node type: high-priority lane for downstream erasure workflows. |
| 6 | Offline conversion failed | `offline_conversion.rejected` webhook stable | Webhook node type: surface collector rejections as retryable items. |

Revisit only after the collector ships and freezes these webhook contracts.

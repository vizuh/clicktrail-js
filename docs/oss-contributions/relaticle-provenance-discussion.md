# Relaticle Ideas discussion

External contacts and deals can arrive from forms, booking systems, or campaign
landing pages, but the CRM may lose the small amount of acquisition evidence
that accompanied creation. Would an append-only, provider-neutral provenance
record linked to a Person or Deal fit Relaticle's evidence-led model?

A first version could preserve only bounded, allowlisted source, medium, campaign,
and approved click-ID values with an observed timestamp. It would remain
explicitly untrusted: a public form could not rewrite history, impersonate an
internal actor, cross workspace boundaries, or change protected CRM fields.

The record would be visible only through the existing authorized Person/Deal
views and REST/MCP reads. Qualification, won status, and revenue would remain
separate authorized CRM events. A ClickTrail adapter could populate the record,
but Relaticle would not need to bundle ClickTrail or any advertising SDK.

Would this be useful to Relaticle users, and if so, would a related provenance
record or an existing custom-field/extension surface be preferred?

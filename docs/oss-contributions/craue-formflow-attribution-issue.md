# Issue draft: Proposal: preserving optional attribution across form-flow steps

Target: <https://github.com/craue/CraueFormFlowBundle>

Status: posted as [433](https://github.com/craue/CraueFormFlowBundle/issues/433). Await maintainer feedback before coding.

## Proposed title

Proposal: preserving optional attribution across form-flow steps

## Proposed body

Hi maintainers,

Would maintainers consider documenting how an application can preserve a small,
consent-gated attribution object across Craue multi-step form-flow steps and
attach it only to the final application or entity?

The bundle would remain provider-neutral. The host application would validate an
allowlist of `utm_*` fields and approved ad click IDs, keep the values bounded,
and decide whether to persist or discard them at the final step. ClickTrail
could be one optional browser adapter, with no required bundle dependency.

The first contribution could be a recipe or test fixture rather than a new
storage model. The proposal should not change flow state for installations that
do not opt in.


### Safety boundary

- The feature must be opt-in and disabled by default.
- The host application owns consent, retention, access control, and delivery.
- Accept only an explicit allowlist of UTM and ad-click fields.
- Bound field and total object sizes; treat values as untrusted and spoofable.
- Do not accept PII, cookies, visitor/session IDs, raw request objects, or
  arbitrary JSON.
- Never use attribution for authorization, pricing, workflow state, or fraud
  decisions.
- Do not send data to ClickTrail or another third party from the host project.
- Do not expose attribution to unauthorized callers.


### Questions before implementation

1. Do users need this data in the product at all?
2. Where should users see it: the primary record, a report, an export, an API,
   a webhook, or nowhere in the first version?
3. Should this be a native provider-neutral field, an extension hook, or only a
   documentation recipe?
4. What is the acceptable browser bundle or runtime dependency impact? A
   ClickTrail adapter can remain external and optional.
5. What is the acceptable code, schema, migration, API, and test impact?
6. What is the blast radius for existing records, API consumers, backups,
   exports, logs, and retention?
7. Does the project have an authorization boundary that can safely expose these
   values?

If the answer is that this does not belong in core yet, a small integration
recipe can document the boundary without changing the project's default bundle
or schema.

Thanks!

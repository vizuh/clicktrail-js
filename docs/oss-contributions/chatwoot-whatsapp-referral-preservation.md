# Issue review: Chatwoot WhatsApp `url_preview` and `referral` preservation

Target: <https://github.com/chatwoot/chatwoot/issues/12560>

Status checked on **2026-09-15**: open with 26 comments, which makes it the most
active thread in this set. Not a ClickTrail-owned issue.

## Observed seam

The WhatsApp Cloud API payload carries `url_preview` (title, description, image)
and `referral` (the ad a conversation originated from). Chatwoot stores plain
text and attachments only, so both are dropped. The consequences named in the
issue are concrete:

- agents cannot see the ad origin of a WhatsApp conversation;
- outgoing webhooks and message APIs lose the metadata;
- automation platforms receive a reduced payload.

The `referral` field is the part that matters for attribution: it is the only
place the ad origin of a WhatsApp conversation exists.

## Smallest useful contribution

The issue already proposes the right shape — parse and persist into
`messages.content_attributes`, then expose the fields in the webhook and API
payloads. A first pull request should stop at persistence and exposure, and
leave UI rendering for a follow-up.

Two rules are worth stating in the thread before anyone codes:

- `referral` is untrusted inbound data from Meta. It should be validated against
  a known field set and bounded in size before it is stored or re-emitted.
- Persisting the ad origin is not a delivery path. It makes the origin visible
  and available to integrations; it does not send a conversion anywhere.

ClickTrail's session context: a Chatwoot adapter already exists that preserves
click IDs in contact custom attributes. That is complementary and should not be
bundled into this issue. This thread is about Chatwoot's own message model.

## Boundaries

- Chatwoot owns the message schema, the API surface, and the retention policy for
  ad-origin metadata.
- Inbound `referral` must be treated as spoofable. It must not be used for
  authorization, routing, or workflow state.
- No PII, raw payload, or access token belongs in a webhook body or in a log.
- The 26 existing comments should be read in full before posting; the thread may
  already contain maintainer direction or a claimed implementation.

## Evidence required before proposing

- a stored message whose `content_attributes` contains the incoming `referral`;
- the same value present in an outgoing webhook payload;
- a malformed or oversized `referral` that is rejected or bounded rather than
  stored verbatim.

**Disposition:** the issue is popular and already well-specified, so the
contribution should be a narrowed first PR, not a restatement of the request.
Read the existing comments first; do not duplicate an implementation that a
commenter has already offered.

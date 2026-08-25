"""Request attribution middleware.

Parses landing UTMs / click IDs through ``clicktrail.parse_landing``, attaches
``request.clicktrail`` (flat attribution fields + ``visitor_id``), and sets the
``ct_vid`` visitor cookie when absent.
"""

import uuid

VISITOR_COOKIE_NAME = "ct_vid"

# Canonical ClickTrail attribution field vocabulary (docs/EVENT-CONTRACT.md),
# mirrored from packages/core/src/core/types.ts. parse_landing output keys are
# normalized onto these names before they reach request.clicktrail.
_TOUCH_KEY_TO_FIELD = {
    "source": "utm_source",
    "medium": "utm_medium",
    "campaign": "utm_campaign",
    "term": "utm_term",
    "content": "utm_content",
    "landing_page": "landing_url",
    "landingPage": "landing_url",
}
_DIRECT_FIELDS = frozenset(
    {
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        "gclid", "gbraid", "wbraid", "fbclid", "msclkid",
        "landing_url", "referrer",
    }
)


class ClickTrailAttributionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from clicktrail.landing import parse_landing

        visitor_id = request.COOKIES.get(VISITOR_COOKIE_NAME)
        visitor_created = False
        if not visitor_id:
            visitor_id = str(uuid.uuid4())
            visitor_created = True

        attribution = _flatten_attribution(parse_landing(request.get_full_path()))
        request.clicktrail = {**attribution, "visitor_id": visitor_id}

        response = self.get_response(request)
        if visitor_created:
            response.set_cookie(
                VISITOR_COOKIE_NAME,
                visitor_id,
                path="/",
                samesite="Lax",
                secure=request.is_secure(),
            )
        return response


def _flatten_attribution(parsed):
    """Normalize a ``parse_landing`` result into flat canonical fields.

    Accepts both flat dicts ({'utm_source': ...}) and structured touch shapes
    ({'source': ..., 'click_ids': {...}}) so middleware stays stable across
    core revisions. Empty/None values are dropped; values are kept as strings.
    """
    fields = {}
    if not isinstance(parsed, dict):
        return fields
    candidates = dict(parsed)
    click_ids = candidates.pop("click_ids", None)
    if isinstance(click_ids, dict):
        candidates.update(click_ids)
    for key, value in candidates.items():
        normalized = _TOUCH_KEY_TO_FIELD.get(key, key)
        if normalized in _DIRECT_FIELDS or normalized.startswith("utm_"):
            if isinstance(value, str) and value.strip():
                fields[normalized] = value.strip()
            elif value is not None and not isinstance(value, (str, bytes)) and value == value:
                fields[normalized] = str(value)
    return fields

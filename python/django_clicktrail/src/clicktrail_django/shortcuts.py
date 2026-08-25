"""Conversion shortcuts bridging request identity to the foundation client."""

from django.conf import settings

__all__ = ["track_conversion"]


def _client():
    from clicktrail import ClickTrail

    return ClickTrail(
        api_key=getattr(settings, "CLICKTRAIL_API_KEY", None),
        site_id=getattr(settings, "CLICKTRAIL_SITE_ID", None),
        endpoint=getattr(settings, "CLICKTRAIL_ENDPOINT", ""),
    )


def track_conversion(
    request,
    event="lead_created",
    lead_id=None,
    order_id=None,
    value=None,
    currency=None,
    external_key=None,
):
    """Send a canonical conversion event for ``request``.

    Identity comes from ``request.clicktrail['visitor_id']``. Routes canonical
    event names to the matching client method. Returns the foundation
    ``ClickTrailResult``; raises ``TypeError`` on invalid input BEFORE send.
    """
    from clicktrail.events import to_canonical_event_name

    visitor_id = (getattr(request, "clicktrail", {}) or {}).get("visitor_id")
    if not isinstance(visitor_id, str) or not visitor_id.strip():
        raise TypeError("clicktrail server: visitor_id must be a non-empty string")

    name = to_canonical_event_name(event)
    if not isinstance(name, str) or not name:
        raise TypeError("clicktrail server: event must be a non-empty string")

    if name == "lead_created":
        _require_non_empty_str("lead_id", lead_id)
        result = _client().lead(visitor_id=visitor_id, lead_id=lead_id)
    elif name == "sale":
        _require_non_empty_str("order_id", order_id)
        result = _client().conversion(
            external_key=external_key,
            order_id=order_id,
            value=value,
            currency=currency,
        )
    elif name == "refund":
        original = order_id if order_id is not None else lead_id
        _require_non_empty_str("original_transaction_id", original)
        result = _client().refund(
            original_transaction_id=original, value=value, currency=currency
        )
    elif name in ("booking_created", "booking_completed"):
        booking_id = order_id if order_id is not None else lead_id
        _require_non_empty_str("booking_id", booking_id)
        result = _client().booking(
            booking_id=booking_id, completed=(name == "booking_completed")
        )
    elif name == "consent_updated":
        raise ValueError(
            "track_conversion does not send consent; use ClickTrail.consent()"
        )
    else:
        result = _client().track(name, visitor_id=visitor_id)
    return result


def _require_non_empty_str(field, val):
    if not isinstance(val, str) or not val.strip():
        raise TypeError(f"clicktrail server: {field} must be a non-empty string")

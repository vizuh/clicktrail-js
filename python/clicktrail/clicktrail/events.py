"""Canonical ClickTrail event contract (docs/EVENT-CONTRACT.md).

Every integration emits THESE names through shared builders. Platform code
never invents event vocabulary. Extension events are permitted but must not
be required by consumers.
"""

from typing import Union

CANONICAL_EVENT_NAMES = (
    "page_view",
    "form_started",
    "lead_created",
    "lead_qualified",
    "booking_created",
    "booking_completed",
    "sale",
    "refund",
    "consent_updated",
)

# Permitted non-canonical events (consumers may ignore; integrations may emit).
EXTENSION_EVENT_NAMES = ("lead_updated", "lead_merged", "visitor_anonymized")

# Translation table: pre-contract scaffold names -> canonical events.
EXTENSION_EVENT_NAME_MAP = {
    "lead.stage_updated": "lead_updated",
    "lead.merged": "lead_merged",
    "visitor.anonymized": "visitor_anonymized",
}

LEGACY_EVENT_NAME_MAP = {
    "lead": "lead_created",
    "form.started": "form_started",
    "form.submitted": "lead_created",
    "lead.submitted": "lead_created",
    "lead_submitted": "lead_created",
    "form_submission": "lead_created",
    "lead.attribution_attached": "lead_created",
    **EXTENSION_EVENT_NAME_MAP,
    "lead.qualified": "lead_qualified",
    "booking": "booking_created",
    "appointment.booked": "booking_created",
    "appointment.requested": "booking_created",
    "appointment.attended": "booking_completed",
    "appointment.completed": "booking_completed",
    "sale.completed": "sale",
    "sale.recorded": "sale",
    "purchase": "sale",
    "revenue.recurring": "sale",
    "offline_conversion.sent": "sale",
    "sale.refunded": "refund",
    "refund.issued": "refund",
    "consent.granted": "consent_updated",
    "consent.withdrawn": "consent_updated",
    "consent.policy_updated": "consent_updated",
}


def to_canonical_event_name(event_name: str) -> Union[str, None]:
    """Resolve any historical/scaffold name to its canonical name.

    Canonical and known-extension names pass through; free-form strings are
    returned unchanged (Track Event style actions) so hosts keep flexibility.
    """
    if not isinstance(event_name, str):
        return event_name
    return LEGACY_EVENT_NAME_MAP.get(event_name, event_name)


def is_canonical_event_name(event_name: str) -> bool:
    return event_name in CANONICAL_EVENT_NAMES

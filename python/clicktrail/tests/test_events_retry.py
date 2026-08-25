"""Event-name translation table + retry classification table."""

import pytest

from clicktrail.events import (
    CANONICAL_EVENT_NAMES,
    EXTENSION_EVENT_NAMES,
    to_canonical_event_name,
)
from clicktrail.retry import classify_delivery_status, classify_network_error


def test_canonical_nine_present():
    assert set(CANONICAL_EVENT_NAMES) == {
        "page_view", "form_started", "lead_created", "lead_qualified",
        "booking_created", "booking_completed", "sale", "refund", "consent_updated",
    }


def test_extension_events_permitted_but_separate():
    assert set(EXTENSION_EVENT_NAMES) == {"lead_updated", "lead_merged", "visitor_anonymized"}
    assert not set(EXTENSION_EVENT_NAMES) & set(CANONICAL_EVENT_NAMES)


@pytest.mark.parametrize(
    ("raw", "canonical"),
    [
        ("lead", "lead_created"),
        ("form.started", "form_started"),
        ("form.submitted", "lead_created"),
        ("purchase", "sale"),
        ("sale.recorded", "sale"),
        ("appointment.booked", "booking_created"),
        ("appointment.completed", "booking_completed"),
        ("refund.issued", "refund"),
        ("consent.granted", "consent_updated"),
        ("consent.withdrawn", "consent_updated"),
        ("lead.stage_updated", "lead_updated"),
        ("page_view", "page_view"),          # canonical passthrough
        ("custom_action", "custom_action"),  # free-form passthrough
    ],
)
def test_to_canonical_event_name(raw, canonical):
    assert to_canonical_event_name(raw) == canonical


@pytest.mark.parametrize(
    ("status", "kind"),
    [
        (200, "delivered"),
        (204, "delivered"),
        (408, "retryable"),
        (425, "retryable"),
        (429, "retryable"),
        (500, "retryable"),
        (503, "retryable"),
        (400, "permanent"),
        (401, "permanent"),
        (404, "permanent"),
        (422, "permanent"),
    ],
)
def test_retry_classification_table(status, kind):
    outcome = classify_delivery_status(status)
    assert outcome.kind == kind
    if kind != "delivered":
        assert outcome.reason == "http_%d" % status


def test_network_error_always_retryable():
    assert classify_network_error().kind == "retryable"
    assert classify_network_error().reason == "network_error"

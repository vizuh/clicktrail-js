"""Sender happy paths + validation rejection matrix + never-raise guarantee."""

import json

import pytest

from clicktrail import ClickTrail


class FakeTransport:
    """Injected http_post seam: records calls, returns canned status."""

    def __init__(self, status=200, exc=None):
        self.calls = []
        self.status = status
        self.exc = exc

    def __call__(self, url, body, headers):
        self.calls.append({"url": url, "body": body, "headers": headers})
        if self.exc is not None:
            raise self.exc
        return self.status


def make_client(transport):
    return ClickTrail(
        api_key="sk_test",
        site_id="site-1",
        endpoint="https://ingest.example.com/api/events",
        http_post=transport,
    )


# ------------------------------------------------------------- happy paths

def test_track_page_view_passthrough():
    t = FakeTransport()
    ct = make_client(t)
    result = ct.track("page_view", visitor_id="v1", landing_url="https://x.dev/")
    assert result.ok is True
    assert result.status == 200
    event = t.calls[0]["body"]["events"][0]
    assert event["event_name"] == "page_view"
    assert event["visitor_id"] == "v1"
    assert event["landing_url"] == "https://x.dev/"


def test_lead_maps_to_lead_created():
    t = FakeTransport()
    ct = make_client(t)
    result = ct.lead(visitor_id="v1", lead_id="lead_9", email=None)
    event = t.calls[0]["body"]["events"][0]
    assert result.ok is True
    assert event["event_name"] == "lead_created"
    assert event["visitor_id"] == "v1" and event["lead_id"] == "lead_9"
    assert "email" not in event


def test_conversion_maps_to_sale_with_defaults():
    t = FakeTransport()
    ct = make_client(t)
    ct.conversion(order_id="ord_7", value=499.0, currency="EUR")
    event = t.calls[0]["body"]["events"][0]
    assert event["event_name"] == "sale"
    assert event["order_id"] == "ord_7"
    assert event["value"] == 499.0
    assert event["currency"] == "EUR"


def test_booking_created_and_completed_names():
    t = FakeTransport()
    ct = make_client(t)
    ct.booking(booking_id="bk_1", completed=False)
    ct.booking(booking_id="bk_2", completed=True)
    first, second = (c["body"]["events"][0] for c in t.calls)
    assert first["event_name"] == "booking_created"
    assert second["event_name"] == "booking_completed"


def test_refund_event_fields():
    t = FakeTransport()
    ct = make_client(t)
    ct.refund(original_transaction_id="ord_7", value=25.5, currency="EUR")
    event = t.calls[0]["body"]["events"][0]
    assert event["event_name"] == "refund"
    assert event["original_transaction_id"] == "ord_7"
    assert event["value"] == 25.5 and event["currency"] == "EUR"


def test_consent_event_fields():
    t = FakeTransport()
    ct = make_client(t)
    result = ct.consent(state="granted", source="cmp", policy_version="2026-08")
    assert result.ok is True
    event = t.calls[0]["body"]["events"][0]
    assert event["event_name"] == "consent_updated"
    assert event["consent_state"] == "granted"
    assert event["consent_source"] == "cmp"
    assert event["consent_version"] == "2026-08"


# --------------------------------------------------------------- wire format

def test_wire_format_single_event_envelope_and_key_header():
    t = FakeTransport()
    ct = make_client(t)
    ct.conversion(order_id="o1", value=10.0, currency="EUR")
    call = t.calls[0]
    assert list(call["body"].keys()) == ["events"]
    assert len(call["body"]["events"]) == 1
    assert call["headers"]["X-ClickTrail-Key"] == "sk_test"
    # body is JSON-serializable
    json.dumps(call["body"])


def test_no_key_header_without_api_key():
    t = FakeTransport()
    ct = ClickTrail(site_id="s", endpoint="https://e/x", http_post=t)
    ct.track("page_view")
    assert "X-ClickTrail-Key" not in t.calls[0]["headers"]
    assert t.calls[0]["body"]["events"][0]["site_id"] == "s"


@pytest.mark.parametrize(
    ("legacy", "canonical"),
    [
        ("lead.submitted", "lead_created"),
        ("appointment.attended", "booking_completed"),
        ("sale.completed", "sale"),
        ("sale.refunded", "refund"),
    ],
)
def test_legacy_event_name_translated_on_wire(legacy, canonical):
    t = FakeTransport()
    ct = make_client(t)
    ct.track(legacy)
    assert t.calls[0]["body"]["events"][0]["event_name"] == canonical


# ---------------------------------------------------------- validation matrix

@pytest.mark.parametrize(
    ("sender_kwargs", "field"),
    [
        ({"visitor_id": "", "lead_id": "l"}, "visitor_id"),
        ({"visitor_id": "v", "lead_id": ""}, "lead_id"),
        ({"order_id": "", "value": 5.0}, "order_id"),
        ({"order_id": "o", "value": 0}, "value"),
        ({"order_id": "o", "value": -3.0}, "value"),
        ({"order_id": "o", "value": float("nan")}, "value"),
        ({"order_id": "o", "value": 5.0, "currency": ""}, "currency"),
        ({"booking_id": ""}, "booking_id"),
        ({"booking_id": "b", "completed": "yes"}, "completed"),
        ({"original_transaction_id": ""}, "original_transaction_id"),
        ({"state": "", "source": "s", "policy_version": "v"}, "state"),
        ({"state": "granted", "source": "", "policy_version": "v"}, "source"),
        ({"state": "granted", "source": "s", "policy_version": ""}, "policy_version"),
    ],
)
def test_validation_raises_typeerror_before_send(sender_kwargs, field):
    t = FakeTransport()
    ct = make_client(t)
    if "visitor_id" in sender_kwargs or "lead_id" in sender_kwargs and "visitor_id" not in sender_kwargs:
        fn = lambda: ct.lead(**sender_kwargs)
    elif "order_id" in sender_kwargs:
        fn = lambda: ct.conversion(**sender_kwargs)
    elif "booking_id" in sender_kwargs:
        fn = lambda: ct.booking(**sender_kwargs)
    elif "original_transaction_id" in sender_kwargs:
        fn = lambda: ct.refund(**sender_kwargs)
    else:
        fn = lambda: ct.consent(**sender_kwargs)
    with pytest.raises(TypeError) as err:
        fn()
    assert field in str(err.value)
    assert str(err.value).startswith("clicktrail server:")
    assert t.calls == []  # nothing was sent


def test_constructor_validates_endpoint_and_site():
    with pytest.raises(TypeError):
        ClickTrail(endpoint="", site_id="s")
    with pytest.raises(TypeError):
        ClickTrail(endpoint="https://e", site_id="")


# ------------------------------------------------------- never-raise contract

def test_network_exception_never_raises():
    t = FakeTransport(exc=OSError("connection refused"))
    ct = make_client(t)
    result = ct.conversion(order_id="o", value=1.0)
    assert result.ok is False
    assert result.status == 0
    assert result.event_id.startswith("evt_")


def test_transport_raising_inside_sender_is_swallowed():
    class ExplodingTransport(FakeTransport):
        pass

    def boom(url, body, headers):
        raise RuntimeError("boom")

    ct = make_client(boom)
    result = ct.refund(original_transaction_id="tx_1")
    assert result.ok is False
    assert result.status == 0


def test_http_error_status_is_reported_not_raised():
    t = FakeTransport(status=500)
    ct = make_client(t)
    result = ct.track("page_view")
    assert result.ok is False
    assert result.status == 500

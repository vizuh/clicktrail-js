import unittest.mock as mock

import pytest
from django.test import RequestFactory
from django.test.utils import override_settings

from clicktrail_django import shortcuts as sc

factory = RequestFactory()


class FakeResult:
    def __init__(self, ok=True, status=200, event_id="evt_x"):
        self.ok = ok
        self.status = status
        self.event_id = event_id


class FakeClient:
    def __init__(self, api_key=None, site_id=None, endpoint=None):
        self.api_key = api_key
        self.site_id = site_id
        self.endpoint = endpoint
        self.calls = []

    def lead(self, **kw):
        self.calls.append(("lead", kw))
        return FakeResult()

    def conversion(self, **kw):
        self.calls.append(("conversion", kw))
        return FakeResult()

    def booking(self, **kw):
        self.calls.append(("booking", kw))
        return FakeResult()

    def refund(self, **kw):
        self.calls.append(("refund", kw))
        return FakeResult()

    def track(self, event, **kw):
        self.calls.append(("track", event, kw))
        return FakeResult()


@pytest.fixture
def client(monkeypatch):
    fake = FakeClient()
    monkeypatch.setattr(sc, "_client", lambda: fake)
    return fake


def request_with_visitor(vid="v-123"):
    request = factory.get("/")
    request.clicktrail = {"visitor_id": vid}
    return request


def test_client_factory_reads_settings():
    seen = {}

    class Probe(FakeClient):
        def __init__(self, api_key=None, site_id=None, endpoint=None):
            seen.update(api_key=api_key, site_id=site_id, endpoint=endpoint)

    with override_settings(
        CLICKTRAIL_API_KEY="k1",
        CLICKTRAIL_SITE_ID="s1",
        CLICKTRAIL_ENDPOINT="https://e1",
    ):
        with mock.patch("clicktrail.ClickTrail", Probe):
            sc._client()
    assert seen == {"api_key": "k1", "site_id": "s1", "endpoint": "https://e1"}


def test_lead_created_routes_to_lead_with_request_identity(client):
    result = sc.track_conversion(request_with_visitor(), lead_id="L1")
    assert result.ok is True
    assert client.calls == [("lead", {"visitor_id": "v-123", "lead_id": "L1"})]


def test_sale_routes_to_conversion_with_full_payload(client):
    sc.track_conversion(
        request_with_visitor(),
        event="sale",
        order_id="O9",
        value=499.0,
        currency="EUR",
        external_key="ext-key-7",
    )
    assert client.calls == [
        (
            "conversion",
            {
                "external_key": "ext-key-7",
                "order_id": "O9",
                "value": 499.0,
                "currency": "EUR",
            },
        )
    ]


def test_booking_created_and_completed_routing(client):
    sc.track_conversion(request_with_visitor(), event="booking_created", order_id="B1")
    sc.track_conversion(request_with_visitor(), event="booking_completed", order_id="B1")
    assert [c[0] for c in client.calls] == ["booking", "booking"]
    assert client.calls[0][1] == {"booking_id": "B1", "completed": False}
    assert client.calls[1][1] == {"booking_id": "B1", "completed": True}


def test_refund_routing(client):
    sc.track_conversion(
        request_with_visitor(), event="refund", order_id="T1", value=10.0, currency="EUR"
    )
    assert client.calls == [
        ("refund", {"original_transaction_id": "T1", "value": 10.0, "currency": "EUR"})
    ]


def test_free_event_falls_through_to_track(client):
    sc.track_conversion(request_with_visitor(), event="page_view", lead_id="ignored")
    assert len(client.calls) == 1
    assert client.calls[0][0] == "track"


def test_missing_visitor_identity_raises_typeerror_before_send(client):
    with pytest.raises(TypeError):
        sc.track_conversion(factory.get("/"), lead_id="L1")
    assert client.calls == []


def test_missing_lead_id_raises_typeerror_before_send(client):
    with pytest.raises(TypeError):
        sc.track_conversion(request_with_visitor())
    assert client.calls == []


def test_missing_order_id_on_sale_raises_typeerror_before_send(client):
    with pytest.raises(TypeError):
        sc.track_conversion(request_with_visitor(), event="sale", value=5.0)
    assert client.calls == []


def test_consent_is_rejected(client):
    with pytest.raises(ValueError):
        sc.track_conversion(request_with_visitor(), event="consent_updated")
    assert client.calls == []

import re
import uuid

import pytest
import clicktrail.landing as ct_landing
from django.test import RequestFactory

from clicktrail_django.middleware import ClickTrailAttributionMiddleware
from clicktrail_django.templatetags.clicktrail import BUNDLE_PATH

factory = RequestFactory()

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def run_middleware(request):
    def view(req):
        from django.http import HttpResponse

        req._captured_clicktrail = dict(req.clicktrail)
        return HttpResponse("ok")

    mw = ClickTrailAttributionMiddleware(view)
    response = mw(request)
    return response, request._captured_clicktrail


def fake_parse_landing_flat(monkeypatch):
    monkeypatch.setattr(
        ct_landing,
        "parse_landing",
        lambda url: {
            "utm_source": "google",
            "utm_medium": "cpc",
            "gclid": "G-123",
            "landing_url": url,
        },
    )


def test_middleware_attaches_flat_attribution_and_visitor_id(monkeypatch):
    fake_parse_landing_flat(monkeypatch)
    request = factory.get("/land?utm_source=google&utm_medium=cpc&gclid=G-123")
    _, captured = run_middleware(request)
    assert captured["utm_source"] == "google"
    assert captured["utm_medium"] == "cpc"
    assert captured["gclid"] == "G-123"
    assert UUID_RE.match(captured["visitor_id"])
    assert request.clicktrail["visitor_id"] == captured["visitor_id"]


def test_middleware_reuses_existing_visitor_cookie(monkeypatch):
    fake_parse_landing_flat(monkeypatch)
    request = factory.get("/", HTTP_COOKIE="ct_vid=existing-vid")
    response, captured = run_middleware(request)
    assert captured["visitor_id"] == "existing-vid"


def test_middleware_sets_ct_vid_cookie_when_absent(monkeypatch):
    fake_parse_landing_flat(monkeypatch)
    request = factory.get("/")
    response, _ = run_middleware(request)
    cookie = response.cookies["ct_vid"]
    assert UUID_RE.match(cookie.value)
    assert cookie["path"] == "/"
    assert cookie["samesite"] == "Lax"
    assert not cookie["secure"]  # Django leaves the flag empty when false


def test_middleware_marks_cookie_secure_on_https(monkeypatch):
    fake_parse_landing_flat(monkeypatch)
    request = factory.get("/", secure=True)
    response, _ = run_middleware(request)
    assert response.cookies["ct_vid"]["secure"] is True


def test_middleware_does_not_reset_existing_cookie(monkeypatch):
    fake_parse_landing_flat(monkeypatch)
    request = factory.get("/", HTTP_COOKIE="ct_vid=known-visitor")
    response, _ = run_middleware(request)
    assert "ct_vid" not in response.cookies


def test_middleware_handles_empty_parse_result(monkeypatch):
    monkeypatch.setattr(ct_landing, "parse_landing", lambda url: {})
    request = factory.get("/plain")
    _, captured = run_middleware(request)
    assert set(captured) == {"visitor_id"}


def test_flatten_normalizes_structured_touch_shape():
    from clicktrail_django.middleware import _flatten_attribution

    fields = _flatten_attribution(
        {
            "source": "google",
            "medium": "cpc",
            "campaign": "spring",
            "click_ids": {"fbclid": "FB1", "msclkid": ""},
            "landing_page": "/x",
        }
    )
    assert fields == {
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "spring",
        "fbclid": "FB1",
        "landing_url": "/x",
    }

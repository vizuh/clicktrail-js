"""Flask integration tests with injected transport (no network)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

flask = pytest.importorskip("flask")

from flask import Flask, jsonify

from flask_clicktrail import capture_attribution, current_client, init_app, track_conversion


class FakeTransport:
    def __init__(self, status=200):
        self.calls = []
        self.status = status

    def __call__(self, url, body, headers):
        self.calls.append({"url": url, "body": body, "headers": headers})
        return self.status


def make_app(transport=None):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["CLICKTRAIL_SITE_ID"] = "site-1"
    app.config["CLICKTRAIL_ENDPOINT"] = "https://ingest/x/api"
    app.config["CLICKTRAIL_API_KEY"] = "sk_f"

    @app.route("/echo-attribution")
    def echo():
        return jsonify(capture_attribution())

    @app.route("/convert")
    def convert():
        result = track_conversion(order_id="ord_9", value=42.5, currency="EUR")
        return jsonify({"ok": result.ok if result else None})

    init_app(app, http_post=transport)
    return app


def test_after_request_captures_attribution_into_g():
    app = make_app()
    client = app.test_client()
    resp = client.get("/echo-attribution?utm_source=newsletter&utm_campaign=launch")
    data = resp.get_json()
    assert data["utm_source"] == "newsletter"
    assert data["utm_campaign"] == "launch"
    assert data["landing_url"].endswith("?utm_source=newsletter&utm_campaign=launch")


def test_track_conversion_posts_sale_wire_format():
    t = FakeTransport()
    app = make_app(t)
    resp = app.test_client().get("/convert?gclid=Ga")
    assert resp.get_json() == {"ok": True}
    call = t.calls[0]
    event = call["body"]["events"][0]
    assert event["event_name"] == "sale"
    assert event["order_id"] == "ord_9"
    assert event["value"] == 42.5
    assert call["headers"]["X-ClickTrail-Key"] == "sk_f"
    # attribution merged from g
    assert event["gclid"] == "Ga"


def test_track_conversion_without_init_returns_none():
    bare = Flask(__name__)
    with bare.app_context():
        assert track_conversion(order_id="x", value=1.0) is None


def test_track_conversion_never_raises_on_transport_failure():
    def failing(url, body, headers):
        raise OSError("down")

    app = make_app(failing)
    with app.test_client() as c:
        resp = c.get("/convert")
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": False}


def test_explicit_kwargs_win_over_config():
    t = FakeTransport()
    app = Flask(__name__)
    app.config["CLICKTRAIL_SITE_ID"] = "config-site"
    app.config["CLICKTRAIL_ENDPOINT"] = "https://config-endpoint/x"

    @app.route("/t")
    def t_route():
        track_conversion(visitor_id="v1")

        from flask import jsonify

        return jsonify(ok=True)

    init_app(app, site_id="kwarg-site", endpoint="https://kwarg/x", http_post=t)
    app.test_client().get("/t")
    assert t.calls[0]["url"] == "https://kwarg/x"
    assert t.calls[0]["body"]["events"][0]["site_id"] == "kwarg-site"


def test_legacy_name_translated_and_client_exposed():
    t = FakeTransport()
    app = make_app(t)
    with app.test_request_context("/"):
        from flask import g

        g.clicktrail_attribution = {}
        track_conversion("purchase", order_id="o1", value=5.0)
    assert t.calls[0]["body"]["events"][0]["event_name"] == "sale"
    with app.app_context():
        assert current_client() is not None

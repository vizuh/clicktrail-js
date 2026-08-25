"""Raw-ASGI fake-app tests. No starlette/fastapi anywhere."""

import json

import pytest

from clicktrail_asgi import ClickTrailMiddleware


class FakeApp:
    """Raw-ASGI fake downstream app: records scope, echoes clicktrail ctx."""

    def __init__(self):
        self.scopes = []

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            self.scopes.append(scope)
        await send({"type": "http.response.start", "status": 200})
        await send({"type": "http.response.body", "body": b"ok"})


class FakeTransport:
    def __init__(self, status=200):
        self.calls = []
        self.status = status
        self.exc = None

    def __call__(self, url, body, headers):
        self.calls.append({"url": url, "body": body, "headers": headers})
        return self.status


def http_scope(path="/", query=b"", headers=None, scheme="https"):
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "GET",
        "path": path,
        "root_path": "",
        "query_string": query,
        "headers": [(k.encode(), v.encode()) for k, v in (headers or {}).items()],
        "scheme": scheme,
    }


async def drive(middleware, scope):
    sent = []

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request"}

    await middleware(scope, receive, send)
    # let executor deliveries settle deterministically
    pending = [t for t in list(middleware._tasks) if not t.done()]
    if pending:
        await _gather(pending)
    return sent


async def _gather(tasks):
    await asyncio_wait(tasks)


async def asyncio_wait(tasks):
    import asyncio

    await asyncio.gather(*tasks, return_exceptions=True)


# ------------------------------------------------------------------- tests

async def test_non_http_scope_passes_through_untouched():
    class LifespanApp(FakeApp):
        async def __call__(self, scope, receive, send):
            self.scopes.append(scope)  # record every scope type it sees

    fake = LifespanApp()
    mw = ClickTrailMiddleware(fake, site_id="s", endpoint="https://e/x")
    lifespan_scope = {"type": "lifespan"}

    async def receive():
        return {"type": "lifespan.startup"}

    async def send(message):
        pass

    await mw(lifespan_scope, receive, send)
    assert [s["type"] for s in fake.scopes] == ["lifespan"]
    assert "clicktrail" not in lifespan_scope


async def test_attaches_parsed_attribution_to_scope():
    fake = FakeApp()
    mw = ClickTrailMiddleware(fake, site_id="s", endpoint="https://e/x")
    scope = http_scope(
        "/landing",
        query=b"utm_source=google&utm_medium=cpc&gclid=Ga",
        headers={"host": "shop.example.com", "referer": "https://facebook.com/x"},
    )
    await drive(mw, scope)
    ctx = fake.scopes[0]["clicktrail"]
    assert ctx["utm_source"] == "google"
    assert ctx["utm_medium"] == "cpc"
    assert ctx["gclid"] == "Ga"
    assert ctx["landing_url"] == "https://shop.example.com/landing?utm_source=google&utm_medium=cpc&gclid=Ga"
    assert ctx["referrer"] == "https://facebook.com/x"


async def test_send_delivers_event_via_injected_transport():
    fake = FakeApp()
    t = FakeTransport()
    mw = ClickTrailMiddleware(fake, site_id="site-1", endpoint="https://ingest/x/api",
                              api_key="sk_1", http_post=t)
    scope = http_scope("/", headers={"cookie": "ct_consent=granted"})
    captured = {}

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            captured["event"] = scope["clicktrail"]["send"]("lead", visitor_id="v1", lead_id="l1")
            self.scopes.append(scope)

    mw.app = EchoApp()
    await drive(mw, scope)
    event = captured["event"]
    assert event["event_name"] == "lead_created"
    assert event["site_id"] == "site-1"
    call = t.calls[0]
    assert list(call["body"].keys()) == ["events"]
    assert call["headers"]["X-ClickTrail-Key"] == "sk_1"
    json.dumps(call["body"])


async def test_send_without_api_key_has_no_key_header():
    fake = FakeApp()
    t = FakeTransport()

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            scope["clicktrail"]["send"]("page_view")
            self.scopes.append(scope)

    mw = ClickTrailMiddleware(EchoApp(), site_id="s", endpoint="https://e/x", http_post=t)
    await drive(mw, http_scope("/", headers={"cookie": "ct_consent=granted"}))
    assert t.calls and "X-ClickTrail-Key" not in t.calls[0]["headers"]


async def test_consent_denied_send_is_noop():
    fake = FakeApp()
    t = FakeTransport()

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            self.result = scope["clicktrail"]["send"]("page_view")
            self.consent = scope["clicktrail"]["consent"]
            self.scopes.append(scope)

    app = EchoApp()
    mw = ClickTrailMiddleware(app, site_id="s", endpoint="https://e/x", http_post=t)
    await drive(mw, http_scope("/", headers={"cookie": "ct_consent=denied"}))
    assert app.result is None
    assert app.consent is False
    assert t.calls == []


async def test_consent_absent_is_not_granted():
    fake = FakeApp()
    mw = ClickTrailMiddleware(fake, site_id="s", endpoint="https://e/x")
    scope = http_scope("/")
    await drive(mw, scope)
    assert fake.scopes[0]["clicktrail"]["consent"] is False


async def test_consent_cookie_name_configurable():
    fake = FakeApp()
    mw = ClickTrailMiddleware(fake, site_id="s", endpoint="https://e/x",
                              consent_cookie="my_consent")
    scope = http_scope("/", headers={"cookie": "my_consent=granted"})
    await drive(mw, scope)
    assert fake.scopes[0]["clicktrail"]["consent"] is True


async def test_legacy_event_name_translated():
    fake = FakeApp()
    t = FakeTransport()

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            captured["event"] = scope["clicktrail"]["send"]("purchase", order_id="o1")
            self.scopes.append(scope)

    captured = {}
    mw = ClickTrailMiddleware(EchoApp(), site_id="s", endpoint="https://e/x", http_post=t)
    await drive(mw, http_scope("/", headers={"cookie": "ct_consent=granted"}))
    assert captured["event"]["event_name"] == "sale"
    assert t.calls[0]["body"]["events"][0]["order_id"] == "o1"


async def test_each_request_gets_fresh_event_ids():
    fake = FakeApp()
    t = FakeTransport()

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            scope["clicktrail"]["send"]("page_view")
            self.scopes.append(scope)

    mw = ClickTrailMiddleware(EchoApp(), site_id="s", endpoint="https://e/x", http_post=t)
    await drive(mw, http_scope("/", headers={"cookie": "ct_consent=granted"}))
    await drive(mw, http_scope("/", headers={"cookie": "ct_consent=granted"}))
    ids = [c["body"]["events"][0]["event_id"] for c in t.calls]
    assert ids[0] != ids[1]


async def test_transport_failure_never_breaks_response():
    fake = FakeApp()
    t = FakeTransport()
    t.exc = OSError("down")

    class EchoApp(FakeApp):
        async def __call__(self, scope, receive, send):
            scope["clicktrail"]["send"]("page_view")
            self.scopes.append(scope)
            await send({"type": "http.response.start", "status": 200})
            await send({"type": "http.response.body", "body": b"ok"})

    mw = ClickTrailMiddleware(EchoApp(), site_id="s", endpoint="https://e/x", http_post=boom_transport)
    sent = await drive(mw, http_scope("/", headers={"cookie": "ct_consent=granted"}))
    assert sent[0]["status"] == 200  # response still completes


async def boom_transport(url, body, headers):
    raise RuntimeError("executor boom")

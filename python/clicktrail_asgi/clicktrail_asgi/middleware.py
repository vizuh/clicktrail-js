"""Pure-ASGI ClickTrail middleware.

Parses landing-query attribution with ``clicktrail.landing.parse_landing`` and
attaches a per-request ``scope['clicktrail']`` namespace::

    scope['clicktrail'] = {
        ...attribution fields...,
        'consent': bool,
        'events': [...],          # events built during this request
        'send': fn,               # send(event_name, **fields) -> event | None
    }

No starlette/fastapi imports; only raw ASGI + stdlib. Delivery reuses the
stdlib-first ``clicktrail`` client and runs on the default executor so the
blocking urllib transport never stalls the event loop.
"""

import asyncio
from typing import Any, Callable, Dict, Optional

from clicktrail import ClickTrail
from clicktrail.events import to_canonical_event_name
from clicktrail.landing import parse_landing

__all__ = ["ClickTrailMiddleware"]


def _cookie_map(scope: Dict[str, Any]) -> Dict[str, str]:
    cookies: Dict[str, str] = {}
    for key, value in scope.get("headers") or []:
        if key.decode("latin-1").lower() == "cookie":
            for part in value.decode("latin-1").split(";"):
                if "=" in part:
                    name, _, val = part.partition("=")
                    cookies[name.strip()] = val.strip()
    return cookies


def _header(scope: Dict[str, Any], name: str) -> Optional[str]:
    wanted = name.lower()
    for key, value in scope.get("headers") or []:
        if key.decode("latin-1").lower() == wanted:
            return value.decode("latin-1")
    return None


def _landing_url(scope: Dict[str, Any]) -> str:
    path = (scope.get("root_path") or "") + (scope.get("path") or "/")
    host = _header(scope, "host") or "localhost"
    scheme = scope.get("scheme") or "http"
    url = "%s://%s%s" % (scheme, host, path or "/")
    qs = (scope.get("query_string") or b"").decode("latin-1")
    if qs:
        url += "?" + qs
    return url


class ClickTrailMiddleware:
    """ASGI middleware attaching ClickTrail attribution + send to each http scope."""

    def __init__(
        self,
        app,
        site_id: str,
        endpoint: str,
        api_key: Optional[str] = None,
        consent_cookie: str = "ct_consent",
        http_post: Optional[Callable[[str, Dict[str, Any], Dict[str, str]], int]] = None,
    ) -> None:
        self.app = app
        self.site_id = site_id
        self.endpoint = endpoint
        self.api_key = api_key
        self.consent_cookie = consent_cookie
        self._client = ClickTrail(
            api_key=api_key, site_id=site_id, endpoint=endpoint, http_post=http_post
        )
        self._tasks = set()

    # ------------------------------------------------------------------- asgi

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        attribution = parse_landing(
            _landing_url(scope), referrer=_header(scope, "referer")
        )
        consent_granted = (
            _cookie_map(scope).get(self.consent_cookie, "") == "granted"
        )
        ctx: Dict[str, Any] = dict(attribution)
        ctx["consent"] = consent_granted
        ctx["events"] = []
        ctx["send"] = self._make_send(ctx)
        scope["clicktrail"] = ctx

        try:
            await self.app(scope, receive, send)
        finally:
            pending = [t for t in list(self._tasks) if not t.done()]
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

    # ------------------------------------------------------------------- send

    def _make_send(self, ctx: Dict[str, Any]):
        def send_fn(event_name: str, **fields):
            if not ctx["consent"]:
                return None  # consent gate: no tracking without granted consent
            event = self._client.build_event(
                to_canonical_event_name(event_name), fields or None
            )
            ctx["events"].append(event)
            task = asyncio.get_event_loop().create_task(self._deliver(event))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return event

        return send_fn

    async def _deliver(self, event: Dict[str, Any]) -> None:
        loop = asyncio.get_running_loop()
        # Blocking transports (urllib default) run off the event loop.
        await loop.run_in_executor(None, self._client.deliver_event, event)

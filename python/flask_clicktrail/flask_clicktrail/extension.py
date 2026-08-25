"""Flask wiring: after_request attribution capture + conversion helper."""

from typing import Any, Callable, Dict, Optional

from clicktrail import ClickTrail, ClickTrailResult
from clicktrail.events import to_canonical_event_name
from clicktrail.landing import parse_landing

__all__ = ["init_app", "track_conversion", "current_client", "capture_attribution"]

EXTENSION_KEY = "clicktrail"


def init_app(
    app,
    site_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    api_key: Optional[str] = None,
    http_post: Optional[Callable[[str, Dict[str, Any], Dict[str, str]], int]] = None,
) -> None:
    """Wire ClickTrail into a Flask app.

    Registers an ``after_request`` hook storing parsed landing attribution on
    ``flask.g.clicktrail_attribution`` and the shared client under
    ``app.extensions['clicktrail']``. Explicit kwargs win over app config.
    """
    site_id = site_id or app.config.get("CLICKTRAIL_SITE_ID") or ""
    endpoint = endpoint or app.config.get("CLICKTRAIL_ENDPOINT") or ""
    api_key = api_key if api_key is not None else app.config.get("CLICKTRAIL_API_KEY")

    if not hasattr(app, "extensions"):
        app.extensions = {}
    app.extensions[EXTENSION_KEY] = {
        "client": ClickTrail(
            api_key=api_key, site_id=site_id, endpoint=endpoint, http_post=http_post
        )
        if endpoint
        else None
    }

    @app.after_request
    def _capture_attribution(response):
        capture_attribution()
        return response


def capture_attribution():
    """Parse the live request and stash attribution on ``flask.g``.

    Called by the ``after_request`` hook; safe to call from any request
    context (views included).
    """
    from flask import g, request

    g.clicktrail_attribution = parse_landing(
        request.url, referrer=request.referrer or None
    )
    return g.clicktrail_attribution


def current_client():
    """The current app's ClickTrail client, or None when uninitialized."""
    try:
        from flask import current_app

        state = current_app.extensions.get(EXTENSION_KEY)
    except (ImportError, RuntimeError, AttributeError):
        return None
    return state.get("client") if state else None


def track_conversion(
    event_name: str = "sale",
    visitor_id: Optional[str] = None,
    external_key: Optional[str] = None,
    with_attribution: bool = True,
    **fields: Any,
) -> Optional[ClickTrailResult]:
    """Send a canonical ClickTrail event via the current app's client.

    Merges ``flask.g.clicktrail_attribution`` when present (``with_attribution``).
    Returns None when ClickTrail was never initialized; NEVER raises for
    network failures.
    """
    client = current_client()
    if client is None:
        return None
    payload: Dict[str, Any] = dict(fields)
    if visitor_id:
        payload["visitor_id"] = visitor_id
    if with_attribution:
        try:
            from flask import g, request

            attribution = getattr(g, "clicktrail_attribution", None)
            if attribution is None:
                # Views run BEFORE the after_request capture; parse live once
                # and reuse the same result for the hook later.
                attribution = parse_landing(
                    request.url, referrer=request.referrer or None
                )
                g.clicktrail_attribution = attribution
        except RuntimeError:
            attribution = None
        if attribution:
            payload.update({k: v for k, v in attribution.items() if v is not None})
    event = client.build_event(to_canonical_event_name(event_name), payload, external_key=external_key)
    return client.deliver_event(event)

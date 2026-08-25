"""Jinja2 extension for ClickTrail template helpers.

Configuration is read from ``environment.clicktrail_config`` (a plain dict):

    {"script_url": "https://cdn.example.com/ct.js",
     "site_id": "site-1",
     "consent_cookie": "ct_consent",   # optional, default 'ct_consent'
     "consent_max_age": 15552000}      # optional, seconds (default 180 days)

All returned values are ``markupsafe.Markup``: safe under autoescape, with
every dynamic attribute/value escaped explicitly. No autoescape assumptions.
"""

import json as _json
from html import escape as _html_escape
from typing import Any, Dict

from jinja2 import ext as _ext
from markupsafe import Markup  # ships with jinja2

__all__ = ["ClickTrailExtension"]


def _config(environment) -> Dict[str, Any]:
    cfg = getattr(environment, "clicktrail_config", None)
    return cfg if isinstance(cfg, dict) else {}


def _attr(value: Any) -> str:
    return _html_escape(str(value), quote=True)


def _js_string(value: str) -> str:
    """Proper JS string literal; angle brackets escaped to survive inline scripts."""
    out = _json.dumps(value)
    return out.replace("<", "\\u003c").replace(">", "\\u003e")


def render_head(script_url: str = "", site_id: str = "") -> Markup:
    """Loader script snippet with escaped data attributes."""
    attrs = ['<script defer src="%s"' % _attr(script_url)]
    if site_id:
        attrs.append(' data-clicktrail-site="%s"' % _attr(site_id))
    attrs.append("></script>")
    return Markup("".join(attrs))


def render_attribution_inputs(payload_json: str) -> Markup:
    """Hidden inputs carrying parsed attribution through an HTML form.

    Accepts a JSON object string; keys become ``ct_``-prefixed input names and
    values are HTML-escaped. Non-object / invalid JSON renders nothing; null
    values are skipped.
    """
    try:
        payload = _json.loads(payload_json)
    except (TypeError, ValueError):
        return Markup("")
    if not isinstance(payload, dict):
        return Markup("")
    inputs = []
    for key, value in payload.items():
        if value is None:
            continue
        inputs.append(
            '<input type="hidden" name="ct_%s" value="%s">'
            % (_attr(key), _attr(value))
        )
    return Markup("".join(inputs))


def render_consent(state: str, cookie: str = "ct_consent", max_age: int = 15552000) -> Markup:
    """Cookie-setter script recording a consent state."""
    assignment = "document.cookie=%s;" % _js_string(
        "%s=%s; path=/; max-age=%d; SameSite=Lax" % (cookie, state, max_age)
    )
    return Markup("<script>%s</script>" % assignment)


class ClickTrailExtension(_ext.Extension):
    """Register ``clicktrail_*`` globals on the Jinja environment."""

    def __init__(self, environment):
        super().__init__(environment)

        def clicktrail_head() -> Markup:
            cfg = _config(environment)  # read at render time
            return render_head(cfg.get("script_url", ""), cfg.get("site_id", ""))

        def clicktrail_attribution_inputs(payload_json: str) -> Markup:
            return render_attribution_inputs(payload_json)

        def clicktrail_consent(state: str) -> Markup:
            cfg = _config(environment)
            return render_consent(
                state,
                cookie=cfg.get("consent_cookie", "ct_consent"),
                max_age=int(cfg.get("consent_max_age", 15552000)),
            )

        environment.globals["clicktrail_head"] = clicktrail_head
        environment.globals["clicktrail_attribution_inputs"] = clicktrail_attribution_inputs
        environment.globals["clicktrail_consent"] = clicktrail_consent

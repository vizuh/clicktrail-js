"""Template tags: {% load clicktrail %}."""

from django import template
from django.conf import settings
from django.utils.html import format_html
from django.utils.safestring import mark_safe

register = template.Library()

BUNDLE_PATH = "clicktrail.global.js"


@register.simple_tag
def clicktrail_head():
    """Script tag for the browser bundle served off CLICKTRAIL_ENDPOINT."""
    endpoint = getattr(settings, "CLICKTRAIL_ENDPOINT", "")
    if not endpoint:
        return mark_safe("")
    src = f"{endpoint.rstrip('/')}/{BUNDLE_PATH}"
    return format_html('<script defer src="{}"></script>', src)


@register.simple_tag
def clicktrail_attribution_fields(request):
    """Hidden inputs carrying the middleware's flat attribution into forms."""
    data = getattr(request, "clicktrail", {}) or {}
    inputs = []
    for key in sorted(data):
        if key == "visitor_id":
            continue  # identity rides the ct_vid cookie, not form payloads
        inputs.append(
            format_html('<input type="hidden" name="{}" value="{}">', key, data[key])
        )
    return mark_safe("\n".join(str(i) for i in inputs))


@register.simple_tag
def clicktrail_consent(state):
    """Snippet storing the consent cookie (ct_consent)."""
    safe_state = str(state).replace('"', "")
    snippet = (
        '<script>(function(){'
        'document.cookie="ct_consent=' + safe_state + ';path=/;max-age=15552000;SameSite=Lax";'
        "})();</script>"
    )
    return mark_safe(snippet)

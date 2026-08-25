# django-clicktrail

Django integration for [ClickTrail](https://github.com/vizuh/clicktrail-js):
attribution middleware, template tags, and conversion shortcuts on top of the
shared [`clicktrail`](https://pypi.org/project/clicktrail/) Python client.

## Install

```bash
pip install django-clicktrail clicktrail
```

## Setup

Add the app to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    # ...
    "clicktrail_django",
]

MIDDLEWARE = [
    # ...
    "clicktrail_django.middleware.ClickTrailAttributionMiddleware",
]

CLICKTRAIL_ENDPOINT = "https://ct.example.com"   # your ClickTrail endpoint
CLICKTRAIL_API_KEY = "..."                        # server-side key
CLICKTRAIL_SITE_ID = "..."                        # site identifier
```

The middleware parses landing UTMs/click IDs via `clicktrail.parse_landing`,
attaches `request.clicktrail` (flat attribution fields plus `visitor_id`), and
persists the visitor cookie `ct_vid` (`path=/`, `SameSite=Lax`, `secure` when
the request is secure).

## Template tags

```django
{% load clicktrail %}

<html>
  <head>
    {% clicktrail_head %}
    {% clicktrail_consent "granted" %}
  </head>
  <body>
    <form method="post">
      {% clicktrail_attribution_fields request %}
    </form>
  </body>
</html>
```

- `{% clicktrail_head %}` — script tag for the browser bundle
  (`<endpoint>/clicktrail.global.js`) from `settings.CLICKTRAIL_ENDPOINT`.
- `{% clicktrail_attribution_fields request %}` — hidden inputs carrying the
  flat attribution captured by the middleware into form submissions.
- `{% clicktrail_consent state %}` — snippet that stores the consent cookie.

## Conversion shortcuts

```python
from clicktrail_django.shortcuts import track_conversion

def signup_view(request):
    ...create lead...
    track_conversion(request, event="lead_created", lead_id=lead.pk)
    return redirect("thanks")
```

`track_conversion(request, event="lead_created", lead_id=None,
order_id=None, value=None, currency=None, external_key=None)` routes canonical
events to the matching foundation client method (`lead`, `conversion`,
`booking`, `refund`, generic `track`), reads identity from
`request.clicktrail`, honors `settings.CLICKTRAIL_*`, returns the foundation
`ClickTrailResult`, and raises `TypeError` on invalid input before any send.

## Discovery chain

PyPI (`django-clicktrail`) -> [Django Packages grid](https://djangopackages.org/packages/p/django-clicktrail/)
-> [Wagtail Packages directory](https://wagtail.org/packages/).
Categories: Analytics, Forms, SEO and Marketing.

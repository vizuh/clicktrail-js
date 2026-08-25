# clicktrail-asgi

Pure-ASGI ClickTrail middleware. No starlette/fastapi imports.

```bash
pip install clicktrail-asgi
```

```python
from clicktrail_asgi import ClickTrailMiddleware

app = ClickTrailMiddleware(raw_asgi_app, site_id="site-1", endpoint="https://ingest.example.com/api/events")
```

Inside any request handler, `scope['clicktrail']` carries:

- attribution fields parsed from the landing query via
  `clicktrail.landing.parse_landing` (utm_*, gclid/gbraid/wbraid/fbclid/msclkid,
  landing_url, referrer)
- `consent` (bool): whether the consent cookie (`ct_consent`, default name) is `granted`
- `send(event_name, **fields) -> event | None`: builds a canonical ClickTrail
  event and delivers it in the background. When consent is not granted, `send`
  is a no-op returning None.

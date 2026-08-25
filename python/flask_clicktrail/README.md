# flask-clicktrail

Flask wiring for ClickTrail.

```bash
pip install flask-clicktrail
```

```python
from flask import Flask
from flask_clicktrail import init_app, track_conversion

app = Flask(__name__)
app.config["CLICKTRAIL_SITE_ID"] = "site-1"
app.config["CLICKTRAIL_ENDPOINT"] = "https://ingest.example.com/api/events"
init_app(app)
```

`init_app` registers an `after_request` hook that parses the landing query
(via `clicktrail.landing.parse_landing`) into `flask.g.clicktrail_attribution`
and stores the shared client on `app.extensions['clicktrail']`.
`track_conversion(...)` sends a canonical event using that client; it never
raises for network failures and returns `None` when ClickTrail was never
initialized for the current app.

Config keys: `CLICKTRAIL_SITE_ID`, `CLICKTRAIL_ENDPOINT`, `CLICKTRAIL_API_KEY`
(all also settable as `init_app(app, site_id=..., endpoint=..., api_key=...)`
kwargs, which win over config).

# clicktrail-jinja

Jinja2 extension exposing ClickTrail template globals.

```bash
pip install clicktrail-jinja
```

```python
from jinja2 import Environment

env = Environment(extensions=["clicktrail_jinja.ClickTrailExtension"])
env.clicktrail_config = {"script_url": "https://cdn.example.com/ct.js", "site_id": "site-1"}
```

Globals:

- `clicktrail_head()` — the loader `<script>` snippet (escaped attributes).
- `clicktrail_attribution_inputs(payload_json)` — one
  `<input type="hidden" name="ct_<key>" value="...">` per payload key, HTML-escaped.
- `clicktrail_consent(state)` — a small script that sets the `ct_consent` cookie.

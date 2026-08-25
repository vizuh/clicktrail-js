# wagtail-clicktrail

Wagtail integration for [ClickTrail](https://github.com/vizuh/clicktrail-js).
Built on [`django-clicktrail`](https://pypi.org/project/django-clicktrail/)
and the shared [`clicktrail`](https://pypi.org/project/clicktrail/) Python
client.

## What it does

- **Wagtail form submissions become leads**: serve forms from
  `wagtail_clicktrail.ClickTrailFormPage` (a drop-in for the classic
  `FormPage`; wagtail 7 removed the concrete class and ships no
  form-submission signal). If a future wagtail reintroduces the
  `form_submission_created` signal, it is connected automatically. Each
  submission sends `ClickTrail.lead()` with mapped fields and the visitor id
  captured by the Django middleware cookie / attribution inputs.
- **User signups are identified**: hooks Django's `user_post_save` (creation
  only) and identifies the visitor behind the account.

Pure mapping (`mapping_form_to_lead`) is dependency-free and tested without
wagtail installed.

## Install

```bash
pip install wagtail-clicktrail clicktrail django-clicktrail
```

## Setup

```python
INSTALLED_APPS = [
    # ...
    "wagtail.contrib.forms",
    "wagtail_clicktrail",
]

CLICKTRAIL_ENDPOINT = "https://ct.example.com"
CLICKTRAIL_API_KEY = "..."
CLICKTRAIL_SITE_ID = "..."
```

Form pages need the standard `clicktrail_attribution_fields` hidden inputs
(see `django-clicktrail`) so submissions carry `ct_vid` / attribution:

```python
from wagtail_clicktrail.pages import ClickTrailFormPage

class ContactPage(ClickTrailFormPage):
    pass  # your form fields as usual
```

Failure isolation: ClickTrail outages log warnings and never break form
submissions or signups.

## Discovery chain

PyPI (`wagtail-clicktrail`) -> [Django Packages grid](https://djangopackages.org/packages/p/wagtail-clicktrail/)
-> [Wagtail Packages directory](https://wagtail.org/packages/).
Categories: Analytics, Forms, SEO and Marketing.

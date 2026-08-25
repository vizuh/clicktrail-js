"""Wagtail integration surface.

- Form submissions: serve forms from ``pages.ClickTrailFormPage`` (primary
  seam), or rely on wagtail's form-submission signal when a release provides
  one.
- Signups: wired automatically via ``user_post_save`` in ``apps.ready``.
"""

from .pages import ClickTrailFormPage  # noqa: F401
from .signals import handle_form_submission, handle_user_signup  # noqa: F401

__all__ = ["ClickTrailFormPage", "handle_form_submission", "handle_user_signup"]

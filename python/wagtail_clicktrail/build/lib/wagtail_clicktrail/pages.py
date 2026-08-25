"""FormPage override seam.

Current wagtail releases ship no ``form_submission_created`` public signal, so
hosts opt in by serving forms from :class:`ClickTrailFormPage`. When a future
wagtail exposes the signal again, ``apps.ready`` connects it automatically and
this class keeps working unchanged.
"""

from wagtail.contrib.forms.models import AbstractForm

from .signals import handle_form_submission


class ClickTrailFormPage(AbstractForm):
    """Abstract form page whose submissions are reported to ClickTrail as
    leads. Wagtail 7 removed the concrete ``FormPage``; hosts subclass this
    page type exactly like they used to subclass ``FormPage``."""

    def process_form_submission(self, form_submission):
        handle_form_submission(
            sender=self.__class__, page=self, form_submission=form_submission
        )
        return super().process_form_submission(form_submission)

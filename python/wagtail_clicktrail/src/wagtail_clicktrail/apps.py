from django.apps import AppConfig


class WagtailClickTrailConfig(AppConfig):
    name = "wagtail_clicktrail"
    verbose_name = "Wagtail ClickTrail"

    def ready(self):
        # Future-proofing: connect wagtail's form signal when it exists.
        # Today's wagtail ships none; hosts use pages.ClickTrailFormPage.
        try:
            from wagtail.contrib.forms.signals import form_submission_created
        except ImportError:
            form_submission_created = None
        from . import signals

        if form_submission_created is not None:
            signals.register(form_submission_created)
        else:
            signals.register_auth_only()

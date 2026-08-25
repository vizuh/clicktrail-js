"""Signal/hook handlers (imported only when wagtail is available).

Both handlers are failure-isolated: a ClickTrail outage never breaks the
host's form submission or signup flow.
"""

import logging

logger = logging.getLogger(__name__)


def register(form_submission_created=None):
    """Wire all integrations. ``form_submission_created`` may be None on
    wagtail versions without the signal (the FormPage seam covers those)."""
    if form_submission_created is not None:
        form_submission_created.connect(
            handle_form_submission, dispatch_uid="wagtail_clicktrail.lead"
        )
    register_auth_only()


def register_auth_only():
    # Django ships no signup signal; watch creation on the active user model.
    from django.db.models.signals import post_save

    post_save.connect(
        handle_user_post_save, dispatch_uid="wagtail_clicktrail.identify"
    )


def _client():
    from clicktrail import ClickTrail

    from django.conf import settings

    return ClickTrail(
        api_key=getattr(settings, "CLICKTRAIL_API_KEY", None),
        site_id=getattr(settings, "CLICKTRAIL_SITE_ID", None),
        endpoint=getattr(settings, "CLICKTRAIL_ENDPOINT", ""),
    )


def handle_form_submission(sender, page=None, form_submission=None, **kwargs):
    """Wagtail form submission -> lead_created."""
    if form_submission is None:
        return
    try:
        from .mapping import mapping_form_to_lead, visitor_id_from_submission

        raw = _submission_data(form_submission)
        lead_fields = mapping_form_to_lead(raw)
        visitor_id = visitor_id_from_submission(raw)
        if not visitor_id:
            logger.info("wagtail-clicktrail: no visitor id in submission; skipping lead")
            return
        kwargs_ = {"visitor_id": visitor_id}
        lead_id = str(getattr(form_submission, "pk", "") or "")
        if lead_id:
            kwargs_["lead_id"] = lead_id
        if lead_fields.get("email"):
            kwargs_["email"] = lead_fields["email"]
        result = _client().lead(**kwargs_)
        logger.info(
            "wagtail-clicktrail: lead send ok=%s status=%s",
            getattr(result, "ok", None),
            getattr(result, "status", None),
        )
    except TypeError as exc:
        logger.warning("wagtail-clicktrail: invalid lead payload: %s", exc)
    except Exception:
        logger.exception("wagtail-clicktrail: lead send failed; form flow unaffected")


def handle_user_post_save(sender, instance=None, created=False, **kwargs):
    from django.contrib.auth import get_user_model

    try:
        if instance is not None and not isinstance(instance, get_user_model()):
            return
    except Exception:
        return
    handle_user_signup(sender=sender, instance=instance, created=created, **kwargs)


def handle_user_signup(sender, instance=None, created=False, **kwargs):
    """User signup (creation only) -> identify the visitor."""
    if not created or instance is None:
        return
    try:
        client = _client()
        identify = getattr(client, "identify", None)
        payload = {
            "lead_id": f"user:{getattr(instance, 'pk', '')}",
            "email": getattr(instance, "email", None) or "",
        }
        payload = {k: v for k, v in payload.items() if v}
        if callable(identify):
            identify(**payload)
        elif payload:
            # Foundation without identify(): canonical extension-style event so
            # the identity signal still reaches the pipeline.
            client.track("identify", **payload)
    except TypeError as exc:
        logger.warning("wagtail-clicktrail: invalid identify payload: %s", exc)
    except Exception:
        logger.exception("wagtail-clicktrail: identify send failed; signup unaffected")


def _submission_data(form_submission):
    get_data = getattr(form_submission, "get_data", None)
    if callable(get_data):
        data = get_data()
        if isinstance(data, dict):
            return data
    form_data = getattr(form_submission, "form_data", None)
    return form_data if isinstance(form_data, dict) else {}

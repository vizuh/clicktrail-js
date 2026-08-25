"""Integration tests that need real wagtail; skipped when unavailable."""

import unittest.mock as mock
from weakref import ref as _weakref_ref

import pytest

wagtail = pytest.importorskip(
    "wagtail",
    reason="wagtail not installed in this environment (too heavy / resolution failed)",
)


class FakeResult:
    def __init__(self):
        self.ok = True
        self.status = 200
        self.event_id = "evt_i"


class FakeClient:
    def __init__(self):
        self.calls = []

    def lead(self, **kw):
        self.calls.append(("lead", kw))
        return FakeResult()

    def track(self, event, **kw):
        self.calls.append(("track", event, kw))
        return FakeResult()


@pytest.fixture
def fake_client():
    fake = FakeClient()
    with mock.patch("wagtail_clicktrail.signals._client", lambda: fake):
        yield fake


class FakeSubmission:
    def __init__(self, data, pk=42):
        self._data = data
        self.pk = pk

    def get_data(self):
        return self._data


def test_form_submission_becomes_lead(fake_client):
    from wagtail_clicktrail.signals import handle_form_submission

    handle_form_submission(
        sender=None,
        page=None,
        form_submission=FakeSubmission({"ct_vid": "v-77", "email": "lead@x.io"}),
    )
    assert fake_client.calls == [
        ("lead", {"visitor_id": "v-77", "lead_id": "42", "email": "lead@x.io"})
    ]


def test_form_submission_without_visitor_id_skips_send(fake_client):
    from wagtail_clicktrail.signals import handle_form_submission

    handle_form_submission(
        sender=None, page=None, form_submission=FakeSubmission({"email": "a@b.co"})
    )
    assert fake_client.calls == []


def test_form_submission_failure_is_isolated(fake_client):
    from wagtail_clicktrail.signals import handle_form_submission

    def boom(**kw):
        raise RuntimeError("endpoint down")

    fake_client.lead = boom
    # must not raise: host form flow is never broken by ClickTrail
    handle_form_submission(
        sender=None,
        page=None,
        form_submission=FakeSubmission({"ct_vid": "v-1", "email": "a@b.co"}),
    )


def test_user_signup_identifies_via_client_method(fake_client):
    from wagtail_clicktrail.signals import handle_user_signup

    class User:
        pk = 7
        email = "new@user.io"

    handle_user_signup(sender=None, instance=User(), created=True)
    assert fake_client.calls == [("track", "identify", {"lead_id": "user:7", "email": "new@user.io"})]


def test_user_update_does_not_send(fake_client):
    from wagtail_clicktrail.signals import handle_user_signup

    class User:
        pk = 7
        email = "new@user.io"

    handle_user_signup(sender=None, instance=User(), created=False)
    assert fake_client.calls == []


class FakeSuperPage:
    def __init__(self):
        self.super_called = False

    def process_form_submission(self, form_submission):
        self.super_called = True


def test_form_page_seam_sends_lead_and_calls_super(fake_client):
    import unittest.mock as mock

    from wagtail.contrib.forms.models import AbstractForm
    from wagtail_clicktrail.pages import ClickTrailFormPage

    page = ClickTrailFormPage(content_type_id=1)  # avoid DB ContentType lookup
    submission = FakeSubmission({"ct_vid": "v-seam", "email": "seam@x.io"}, pk=5)
    with mock.patch.object(
        AbstractForm, "process_form_submission", autospec=True,
        side_effect=lambda self, fs: None,
    ) as super_mock:
        page.process_form_submission(submission)
    assert fake_client.calls == [
        ("lead", {"visitor_id": "v-seam", "lead_id": "5", "email": "seam@x.io"})
    ]
    super_mock.assert_called_once()


def _flatten_receivers(receivers):
    for entry in receivers:
        for part in (entry if isinstance(entry, tuple) else (entry,)):
            resolved = part() if isinstance(part, _weakref_ref) else part
            yield resolved


def test_register_without_wagtail_signal_still_wires_auth():
    from django.db.models.signals import post_save

    from wagtail_clicktrail.signals import register_auth_only

    def has_uid():
        return any(
            getattr(getattr(r, "__func__", r), "__name__", "")
            == "handle_user_post_save"
            for r in _flatten_receivers(post_save.receivers)
        )

    register_auth_only()
    assert has_uid()

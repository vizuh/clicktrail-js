import pytest
from django.template import Context, Template
from django.test import RequestFactory
from django.test.utils import override_settings

factory = RequestFactory()


def render(source, **ctx):
    return Template(source).render(Context(ctx))


def test_head_renders_bundle_script_from_endpoint_setting():
    out = render("{% load clicktrail %}{% clicktrail_head %}")
    assert '<script defer src="https://ct.example.com/clicktrail.global.js">' in out


def test_head_strips_trailing_slash_from_endpoint():
    with override_settings(CLICKTRAIL_ENDPOINT="https://ct.example.com/"):
        out = render("{% load clicktrail %}{% clicktrail_head %}")
    assert 'src="https://ct.example.com/clicktrail.global.js"' in out


def test_head_empty_without_endpoint_setting():
    with override_settings(CLICKTRAIL_ENDPOINT=None):
        out = render("{% load clicktrail %}{% clicktrail_head %}")
    assert out.strip() == ""


def test_attribution_fields_render_hidden_inputs():
    request = factory.get("/")
    request.clicktrail = {
        "utm_source": "google",
        "utm_campaign": "spring",
        "visitor_id": "v-internal",
    }
    out = render(
        "{% load clicktrail %}{% clicktrail_attribution_fields request %}",
        request=request,
    )
    assert '<input type="hidden" name="utm_source"' in out
    assert 'value="google"' in out
    assert '<input type="hidden" name="utm_campaign"' in out
    assert "visitor_id" not in out


def test_attribution_fields_escapes_quotes_in_values():
    request = factory.get("/")
    request.clicktrail = {"utm_campaign": 'spr"ing'}
    out = render(
        "{% load clicktrail %}{% clicktrail_attribution_fields request %}",
        request=request,
    )
    assert "&#x27;" in out or "&quot;" in out or '"spr&#x27;' in out
    assert out.count("<input") == 1


def test_consent_snippet_sets_cookie_with_state():
    out = render('{% load clicktrail %}{% clicktrail_consent "granted" %}')
    assert "ct_consent=granted" in out
    assert "path=/" in out
    assert "<script>" in out


def test_consent_snippet_neutralizes_quote_injection():
    out = render(
        "{% load clicktrail %}{% clicktrail_consent state %}", state='gra"ted'
    )
    cookie_value = out.split("ct_consent=")[1].split(";")[0]
    assert '"' not in cookie_value

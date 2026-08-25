"""Template-render tests via the extension entry point."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from jinja2 import DictLoader, Environment

from clicktrail_jinja import ClickTrailExtension

TEMPLATES = {
    "head.html": "{{ clicktrail_head() }}",
    "inputs.html": "{{ clicktrail_attribution_inputs(payload_json) }}",
    "consent.html": "{{ clicktrail_consent('granted') }}",
}


def make_env(config=None):
    env = Environment(
        loader=DictLoader(TEMPLATES),
        extensions=["clicktrail_jinja.ClickTrailExtension"],
        autoescape=True,
    )
    if config is not None:
        env.clicktrail_config = config
    return env


DEFAULT_CONFIG = {
    "script_url": "https://cdn.example.com/ct.js",
    "site_id": "site-1",
}


def test_clicktrail_head_renders_script_with_site():
    env = make_env(DEFAULT_CONFIG)
    out = env.get_template("head.html").render()
    assert '<script defer src="https://cdn.example.com/ct.js" data-clicktrail-site="site-1">' in out
    assert "</script>" in out


def test_clicktrail_head_escapes_hostile_config():
    env = make_env({"script_url": 'https://x.dev/a.js"><script>alert(1)</script>', "site_id": 's"onmouseover="p'})
    out = env.get_template("head.html").render()
    assert "<script>alert(1)" not in out.replace('<script defer', "")
    assert '" onmouseover' not in out  # quotes are entity-escaped


def test_attribution_inputs_render_hidden_fields():
    payload = '{"utm_source": "google", "gclid": "Ga", "landing_url": "https://x.dev/?a=b"}'
    out = make_env().get_template("inputs.html").render(payload_json=payload)
    assert '<input type="hidden" name="ct_utm_source" value="google">' in out
    assert '<input type="hidden" name="ct_gclid" value="Ga">' in out
    assert 'value="https://x.dev/?a=b"' in out


def test_attribution_inputs_escape_quotes():
    payload = '{"utm_campaign": "injection\\" onmouseover=\\"alert(1)"}'
    out = make_env().get_template("inputs.html").render(payload_json=payload)
    assert "onmouseover=\"alert" not in out
    assert "&#34;" in out or "&quot;" in out


def test_attribution_inputs_ignore_non_object_payload():
    tpl = make_env().get_template("inputs.html")
    assert tpl.render(payload_json='["not","an","object"]') == ""
    assert tpl.render(payload_json="garbage") == ""
    assert tpl.render(payload_json='{"skipped": null}') == ""


def test_consent_renders_cookie_setter():
    out = make_env().get_template("consent.html").render()
    assert "ct_consent=granted" in out
    assert "SameSite=Lax" in out
    assert out.startswith("<script>")


def test_consent_state_is_escaped():
    env = Environment(
        loader=DictLoader({"c.html": "{{ clicktrail_consent(evil) }}"}),
        extensions=[ClickTrailExtension],
        autoescape=False,
    )
    out = env.get_template("c.html").render(evil='granted"; document.location="evil')
    assert 'document.location="evil' not in out


def test_extension_works_without_config_and_custom_cookie():
    # No config at all: defaults apply, no crash.
    out = make_env(None).get_template("head.html").render()
    assert '<script defer src=""></script>' == out
    env = make_env({"script_url": "//cdn/x.js", "consent_cookie": "my_ct"})
    out = env.get_template("consent.html").render()
    assert "my_ct=granted" in out

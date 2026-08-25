"""Pure-part tests: no wagtail import required."""

from wagtail_clicktrail.mapping import (
    mapping_form_to_lead,
    visitor_id_from_submission,
)


def test_email_key_maps_directly():
    lead = mapping_form_to_lead({"email": "ana@example.com"})
    assert lead == {"email": "ana@example.com"}


def test_email_alias_keys_supported():
    assert mapping_form_to_lead({"Email_Address": " a@b.co "})["email"] == "a@b.co"
    assert mapping_form_to_lead({"e-mail": "c@d.org"})["email"] == "c@d.org"


def test_fallback_finds_suffix_email_keys():
    lead = mapping_form_to_lead({"work_email": "job@corp.io", "notes": "hi"})
    assert lead["email"] == "job@corp.io"


def test_missing_email_yields_no_email_field():
    assert "email" not in mapping_form_to_lead({"name": "No Mail"})


def test_name_keys_split_and_compose():
    lead = mapping_form_to_lead({"first_name": "Ana", "last_name": "Silva"})
    assert lead["first_name"] == "Ana" and lead["last_name"] == "Silva"
    assert lead["full_name"] == "Ana Silva"


def test_full_name_derives_first_name():
    lead = mapping_form_to_lead({"full_name": "Bruno Costa"})
    assert lead["first_name"] == "Bruno"
    assert lead["full_name"] == "Bruno Costa"


def test_phone_and_company_aliases():
    lead = mapping_form_to_lead({"Telephone": "+351 900", "Organisation": "Acme"})
    assert lead["phone"] == "+351 900"
    assert lead["company"] == "Acme"


def test_empty_and_none_values_dropped():
    lead = mapping_form_to_lead({"email": "", "phone": None, "name": "   ", "x": 0})
    assert lead == {}


def test_unknown_keys_ignored():
    lead = mapping_form_to_lead({"message": "hello", "newsletter": "yes"})
    assert lead == {}


def test_none_input_is_safe():
    assert mapping_form_to_lead(None) == {}


def test_visitor_id_from_ct_vid_hidden_input():
    assert visitor_id_from_submission({"ct_vid": "vid-9"}) == "vid-9"


def test_visitor_id_accepts_explicit_visitor_id_key():
    assert visitor_id_from_submission({"visitor_id": "v2", "other": "x"}) == "v2"


def test_visitor_id_absent_returns_none():
    assert visitor_id_from_submission({"email": "a@b.co"}) is None

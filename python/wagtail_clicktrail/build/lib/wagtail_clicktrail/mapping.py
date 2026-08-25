"""PURE mapping of Wagtail form submission data to lead fields.

No wagtail imports here: this module is tested without wagtail installed.
"""

import re

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_EMAIL_KEYS = ("email", "email_address", "e-mail", "e_mail", "contact_email")
_FIRST_NAME_KEYS = ("first_name", "firstname", "given_name")
_LAST_NAME_KEYS = ("last_name", "lastname", "family_name", "surname")
_FULL_NAME_KEYS = ("full_name", "fullname", "name")
_PHONE_KEYS = ("phone", "phone_number", "telephone", "tel", "mobile")
_COMPANY_KEYS = ("company", "company_name", "organisation", "organization")


def _normalize_keys(fields):
    normalized = {}
    for key, value in (fields or {}).items():
        if isinstance(key, str):
            normalized[key.strip().lower().replace("-", "_")] = value
    return normalized


def _first_value(data, keys):
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _looks_like_email(value):
    return bool(value and _EMAIL_RE.match(value))


def mapping_form_to_lead(submission_fields):
    """Map raw form submission data (dict) to flat lead fields.

    Returns a dict with any of: email, first_name, last_name, full_name,
    phone, company. Empty/None values are dropped; unknown keys are ignored.
    """
    data = _normalize_keys(submission_fields)
    lead = {}

    email = _first_value(data, _EMAIL_KEYS)
    if email is None:
        for key, value in sorted(data.items()):
            if key.endswith("_email") and isinstance(value, str) and _looks_like_email(value):
                email = value.strip()
                break
    if email is not None:
        lead["email"] = email

    first = _first_value(data, _FIRST_NAME_KEYS)
    last = _first_value(data, _LAST_NAME_KEYS)
    full = _first_value(data, _FULL_NAME_KEYS)
    if first is None and full:
        tokens = full.split()
        if tokens:
            first = tokens[0]
    if full is None and first and last:
        full = f"{first} {last}"
    if first:
        lead["first_name"] = first
    if last:
        lead["last_name"] = last
    if full:
        lead["full_name"] = full

    for keys, field in (
        (_PHONE_KEYS, "phone"),
        (_COMPANY_KEYS, "company"),
    ):
        value = _first_value(data, keys)
        if value is not None:
            lead[field] = value

    return lead


def visitor_id_from_submission(submission_fields):
    """Extract the visitor id captured into the form by attribution inputs."""
    data = _normalize_keys(submission_fields)
    for key in ("ct_vid", "visitor_id"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

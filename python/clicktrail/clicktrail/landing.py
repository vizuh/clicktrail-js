"""Landing URL / referrer attribution parsing (stdlib only).

Query contract (rulings #9/#10/#11 in the JS core):
- ALL query keys are lowercased before lookup (mixed-case UTMs work).
- The LAST occurrence of a duplicate parameter wins.
- '+' decodes as space (URL standard).
"""

from typing import Dict, Optional
from urllib.parse import parse_qsl, urlsplit

UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
CLICK_ID_KEYS = ("gclid", "gbraid", "wbraid", "fbclid", "msclkid")

SEARCH_REFERRERS = ("google", "bing", "duckduckgo")
SOCIAL_REFERRERS = ("facebook", "instagram", "linkedin")


def _query_map(url: str) -> Dict[str, str]:
    """Lowercased-key map of query params; last duplicate wins; '+' = space."""
    try:
        qs = urlsplit(url).query
    except ValueError:
        return {}
    flat = {}
    for raw_key, raw_value in parse_qsl(qs, keep_blank_values=True):
        flat[raw_key.lower()] = raw_value
    return flat


def parse_landing(url: str, referrer: Optional[str] = None, current_host: Optional[str] = None) -> Dict[str, Optional[str]]:
    """Extract UTM params, click ids, landing_url and referrer from a landing URL.

    Returns a dict with utm_source/medium/campaign/content/term, gclid/gbraid/
    wbraid/fbclid/msclkid, landing_url (full href incl. query) and referrer.
    Missing values are None. ``current_host`` documents the host of the page
    itself; it does not change the parsed fields.
    """
    out = {key: None for key in UTM_KEYS}
    out.update({key: None for key in CLICK_ID_KEYS})
    out["landing_url"] = url
    out["referrer"] = referrer
    q = _query_map(url)
    for key in UTM_KEYS + CLICK_ID_KEYS:
        value = q.get(key)
        if value is not None and value != "":
            out[key] = value
    return out


def classify_referrer(host: str) -> str:
    """Classify a referrer HOST into organic_search / organic_social / referral.

    Matches on domain suffix so intl TLDs (google.co.uk etc.) classify too.
    Empty/unparseable hosts are plain referrals.
    """
    normalized = (host or "").lower().strip().rstrip(".")
    if normalized.startswith("www."):
        normalized = normalized[4:]
    labels = normalized.split(".")
    # Brand-name match on the first label: covers google.com, google.co.uk,
    # bing.com etc. (intl TLDs included) while requiring a dot-separated host.
    first_label = labels[0] if labels else ""
    if len(labels) >= 2:
        if first_label in SEARCH_REFERRERS:
            return "organic_search"
        if first_label in SOCIAL_REFERRERS:
            return "organic_social"
    return "referral"

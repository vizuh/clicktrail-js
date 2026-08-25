"""parse_landing / classify_referrer cases."""

from clicktrail.landing import classify_referrer, parse_landing


def test_utm_extraction_mixed_case_keys():
    out = parse_landing("https://x.dev/?Utm_Source=google&UTM_MEDIUM=cpc&utm_campaign=spring")
    assert out["utm_source"] == "google"
    assert out["utm_medium"] == "cpc"
    assert out["utm_campaign"] == "spring"


def test_last_duplicate_wins():
    out = parse_landing("https://x.dev/?utm_source=first&utm_source=second")
    assert out["utm_source"] == "second"


def test_plus_decodes_as_space():
    out = parse_landing("https://x.dev/?utm_campaign=black+friday&utm_content=a%20b")
    assert out["utm_campaign"] == "black friday"
    assert out["utm_content"] == "a b"


def test_click_ids_captured():
    out = parse_landing(
        "https://x.dev/?gclid=Ga&gbraid=Gb&wbraid=Wb&fbclid=Fb&msclkid=Ms"
    )
    assert out["gclid"] == "Ga"
    assert out["gbraid"] == "Gb"
    assert out["wbraid"] == "Wb"
    assert out["fbclid"] == "Fb"
    assert out["msclkid"] == "Ms"


def test_landing_url_keeps_query_and_referrer_recorded():
    url = "https://x.dev/land?utm_source=nl"
    out = parse_landing(url, referrer="https://mail.example.com/read")
    assert out["landing_url"] == url
    assert out["referrer"] == "https://mail.example.com/read"


def test_missing_values_are_none():
    out = parse_landing("https://x.dev/")
    assert out["utm_source"] is None
    assert out["gclid"] is None
    assert out["referrer"] is None


def test_empty_utm_value_treated_as_missing():
    out = parse_landing("https://x.dev/?utm_source=&utm_medium=cpc")
    assert out["utm_source"] is None
    assert out["utm_medium"] == "cpc"


def test_classify_referrer_table():
    assert classify_referrer("www.google.com") == "organic_search"
    assert classify_referrer("google.co.uk") == "organic_search"
    assert classify_referrer("bing.com") == "organic_search"
    assert classify_referrer("duckduckgo.com") == "organic_search"
    assert classify_referrer("facebook.com") == "organic_social"
    assert classify_referrer("instagram.com") == "organic_social"
    assert classify_referrer("linkedin.com") == "organic_social"
    assert classify_referrer("news.ycombinator.com") == "referral"
    assert classify_referrer("") == "referral"

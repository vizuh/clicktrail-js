"""Idempotency: derivation determinism + mint uniqueness with injected randomness."""

import json
import re
from pathlib import Path

import pytest

from clicktrail.ids import derive_stable_event_id, mint_event_id

EVT_S_RE = re.compile(r"^evt_s-[0-9a-f]{32}$")
EVT_RE = re.compile(r"^evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def test_derivation_matches_shared_cross_runtime_vectors():
    fixture_path = Path(__file__).parents[3] / "fixtures" / "stable-event-id-v1.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    assert fixture["algorithm"] == "sha256-128-v1"
    for vector in fixture["vectors"]:
        assert derive_stable_event_id(vector["siteId"], vector["externalKey"]) == vector["eventId"]


def test_derivation_is_deterministic_and_formatted():
    a = derive_stable_event_id("site", "key")
    b = derive_stable_event_id("site", "key")
    assert a == b
    assert EVT_S_RE.match(a)


def test_derivation_order_sensitive_pair():
    assert derive_stable_event_id("a", "b") != derive_stable_event_id("b", "a")


@pytest.mark.parametrize(("site", "key"), [("", "k"), ("s", ""), (None, "k"), ("s", None)])
def test_derivation_rejects_empty_or_missing_parts(site, key):
    with pytest.raises(TypeError):
        derive_stable_event_id(site, key)


class CounterRandom:
    """Injectable randomness: distinct bytes per call."""

    def __init__(self, start=0):
        self.counter = start

    def __call__(self, n):
        import struct

        seed = struct.pack(">Q", self.counter)
        self.counter += 1
        return (seed * ((n // 8) + 2))[:n]


def test_mint_uniqueness_with_injected_randomness():
    rng = CounterRandom()
    ids = {mint_event_id(rng) for _ in range(50)}
    assert len(ids) == 50


def test_mint_format_uuid_v4_bits():
    rng = CounterRandom(start=0xA5)
    eid = mint_event_id(rng)
    assert EVT_RE.match(eid), eid


def test_mint_default_source_unique():
    assert mint_event_id() != mint_event_id()

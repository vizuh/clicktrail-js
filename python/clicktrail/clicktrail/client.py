"""ClickTrail Python client.

Stdlib-first ClickTrail sender implementing the shared API contract mirrored
from the TypeScript ``clicktrail`` package: canonical events, stable
idempotent event ids, never-raise delivery.
"""

import json as _json
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from urllib import error as _urlerror
from urllib import request as _urlrequest

from .events import CANONICAL_EVENT_NAMES, EXTENSION_EVENT_NAMES, to_canonical_event_name
from .ids import derive_stable_event_id, mint_event_id

__all__ = [
    "ClickTrail",
    "ClickTrailResult",
    "CANONICAL_EVENT_NAMES",
    "EXTENSION_EVENT_NAMES",
    "to_canonical_event_name",
    "mint_event_id",
    "derive_stable_event_id",
]

HttpPostFn = Callable[[str, Dict[str, Any], Dict[str, str]], int]


@dataclass(frozen=True)
class ClickTrailResult:
    ok: bool
    status: int
    event_id: str


def default_http_post(url: str, body: Dict[str, Any], headers: Dict[str, str]) -> int:
    """Blocking urllib transport. Returns HTTP status; 0 on network failure."""
    try:
        req = _urlrequest.Request(
            url,
            data=_json.dumps(body).encode("utf-8"),
            headers={"content-type": "application/json", **headers},
            method="POST",
        )
        with _urlrequest.urlopen(req, timeout=10) as resp:
            return int(resp.status)
    except _urlerror.HTTPError as exc:
        # An HTTP error response still carries a status; ok=False downstream.
        return int(exc.code)
    except Exception:
        # At-most-once delivery contract: analytics failures never break hosts.
        return 0


def _require_non_empty_str(value: Any, field: str) -> str:
    if not isinstance(value, str) or value.strip() == "":
        raise TypeError("clicktrail server: %s must be a non-empty string." % field)
    return value


def _require_positive_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0 or value != value:
        raise TypeError("clicktrail server: %s must be a positive finite number." % field)
    return float(value)


class ClickTrail:
    """Server-side ClickTrail sender. Senders NEVER raise for network failures."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        site_id: str = "",
        endpoint: str = "",
        http_post: Optional[HttpPostFn] = None,
    ) -> None:
        self.endpoint = _require_non_empty_str(endpoint, "endpoint")
        self.site_id = _require_non_empty_str(site_id, "site_id")
        self.api_key = api_key
        self._http_post = http_post if http_post is not None else default_http_post

    # ------------------------------------------------------------------ build

    def build_event(self, event_name: str, fields: Optional[Dict[str, Any]] = None,
                    external_key: Optional[str] = None) -> Dict[str, Any]:
        """Build one wire event. Mints/derives event_id exactly once."""
        name = to_canonical_event_name(event_name)
        if not isinstance(name, str) or not name.strip():
            raise TypeError("clicktrail server: event_name must be a non-empty string.")
        event: Dict[str, Any] = {"event_name": name, "event_id": self._resolve_event_id(external_key)}
        if self.site_id:
            event["site_id"] = self.site_id
        if fields:
            event.update(fields)
        return event

    def _resolve_event_id(self, external_key: Optional[str]) -> str:
        if external_key is None:
            return mint_event_id()
        return derive_stable_event_id(self.site_id, external_key)

    # ------------------------------------------------------------------  send

    def deliver_event(self, event: Dict[str, Any]) -> ClickTrailResult:
        """POST one prebuilt event; returns a result, never raises."""
        headers: Dict[str, str] = {}
        if self.api_key:
            headers["X-ClickTrail-Key"] = self.api_key
        try:
            status = int(self._http_post(self.endpoint, {"events": [event]}, headers))
        except Exception:
            status = 0
        outcome_ok = 200 <= status < 300
        return ClickTrailResult(ok=outcome_ok, status=status, event_id=event.get("event_id", ""))

    def _send(self, event: Dict[str, Any]) -> ClickTrailResult:
        return self.deliver_event(event)

    # --------------------------------------------------------------- senders

    def track(self, event_name: str, **fields: Any) -> ClickTrailResult:
        """Free-form event; canonical passthrough via to_canonical_event_name."""
        return self._send(self.build_event(event_name, fields))

    def lead(self, visitor_id: str, lead_id: str, email: Optional[str] = None) -> ClickTrailResult:
        visitor = _require_non_empty_str(visitor_id, "visitor_id")
        lid = _require_non_empty_str(lead_id, "lead_id")
        fields: Dict[str, Any] = {"visitor_id": visitor, "lead_id": lid}
        if email is not None:
            fields["email"] = email
        return self._send(self.build_event("lead_created", fields))

    def conversion(
        self,
        order_id: str,
        value: float,
        currency: str = "EUR",
        event_id: Optional[str] = None,
        external_key: Optional[str] = None,
    ) -> ClickTrailResult:
        oid = _require_non_empty_str(order_id, "order_id")
        amount = _require_positive_number(value, "value")
        cur = _require_non_empty_str(currency, "currency")
        fields = {"order_id": oid, "value": amount, "currency": cur}
        return self._send(
            self._build_with_explicit_ids("sale", fields, event_id=event_id, external_key=external_key)
        )

    def booking(self, booking_id: str, completed: bool = False) -> ClickTrailResult:
        bid = _require_non_empty_str(booking_id, "booking_id")
        if not isinstance(completed, bool):
            raise TypeError("clicktrail server: completed must be a boolean.")
        name = "booking_completed" if completed else "booking_created"
        return self._send(self.build_event(name, {"booking_id": bid}))

    def refund(
        self,
        original_transaction_id: str,
        value: Optional[float] = None,
        currency: Optional[str] = None,
    ) -> ClickTrailResult:
        txid = _require_non_empty_str(original_transaction_id, "original_transaction_id")
        fields: Dict[str, Any] = {"original_transaction_id": txid}
        if value is not None:
            fields["value"] = _require_positive_number(value, "value")
        if currency is not None:
            fields["currency"] = _require_non_empty_str(currency, "currency")
        return self._send(self.build_event("refund", fields))

    def consent(self, state: str, source: str, policy_version: str) -> ClickTrailResult:
        st = _require_non_empty_str(state, "state")
        src = _require_non_empty_str(source, "source")
        ver = _require_non_empty_str(policy_version, "policy_version")
        return self._send(
            self.build_event(
                "consent_updated",
                {"consent_state": st, "consent_source": src, "consent_policy_version": ver},
            )
        )

    def _build_with_explicit_ids(
        self,
        event_name: str,
        fields: Dict[str, Any],
        event_id: Optional[str],
        external_key: Optional[str],
    ) -> Dict[str, Any]:
        event = self.build_event(event_name, fields, external_key=external_key)
        if event_id is not None:
            event["event_id"] = _require_non_empty_str(event_id, "event_id")
        return event

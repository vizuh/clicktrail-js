"""Delivery retry classification shared by server senders (JS core parity).

At-most-once semantics: senders may retry only RETRYABLE outcomes while
reusing the original event_id; collectors no-op duplicates.
"""

from typing import NamedTuple, Optional


class DeliveryOutcome(NamedTuple):
    kind: str  # 'delivered' | 'retryable' | 'permanent'
    reason: Optional[str] = None


def classify_delivery_status(status: int) -> DeliveryOutcome:
    """Map an HTTP status to a delivery classification."""
    if 200 <= status < 300:
        return DeliveryOutcome("delivered")
    if status in (408, 425, 429):
        return DeliveryOutcome("retryable", "http_%d" % status)
    if status >= 500:
        return DeliveryOutcome("retryable", "http_%d" % status)
    return DeliveryOutcome("permanent", "http_%d" % status)


def classify_network_error() -> DeliveryOutcome:
    """Network-level failure (no status): always retryable at sender policy."""
    return DeliveryOutcome("retryable", "network_error")

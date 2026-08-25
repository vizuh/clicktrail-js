"""clicktrail — stdlib-only ClickTrail attribution SDK (Python mirror of the TS core)."""

from .client import CANONICAL_EVENT_NAMES, EXTENSION_EVENT_NAMES, ClickTrail, ClickTrailResult, to_canonical_event_name
from .ids import derive_stable_event_id, mint_event_id

__version__ = "0.1.0rc3"

__all__ = [
    "ClickTrail",
    "ClickTrailResult",
    "CANONICAL_EVENT_NAMES",
    "EXTENSION_EVENT_NAMES",
    "to_canonical_event_name",
    "mint_event_id",
    "derive_stable_event_id",
    "__version__",
]

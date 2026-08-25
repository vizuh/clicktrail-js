"""flask-clicktrail — Flask wiring for ClickTrail attribution."""

from .extension import EXTENSION_KEY, capture_attribution, current_client, init_app, track_conversion

__version__ = "0.1.0"

__all__ = ["init_app", "track_conversion", "current_client", "capture_attribution", "EXTENSION_KEY", "__version__"]

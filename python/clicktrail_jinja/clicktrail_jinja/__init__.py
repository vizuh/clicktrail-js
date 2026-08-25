"""clicktrail-jinja — Jinja2 extension with ClickTrail template globals."""

from .extension import ClickTrailExtension, render_attribution_inputs, render_consent, render_head

__version__ = "0.1.0"

__all__ = [
    "ClickTrailExtension",
    "render_head",
    "render_attribution_inputs",
    "render_consent",
    "__version__",
]

"""Optional dependency guards for deepsynaps_qa."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import types


def get_presidio_analyzer() -> Any | None:
    """Return a Presidio ``AnalyzerEngine`` instance, or *None* if not installed."""
    try:
        from presidio_analyzer import AnalyzerEngine  # type: ignore[import-untyped]

        return AnalyzerEngine()
    except ImportError:
        return None


def get_textstat() -> types.ModuleType | None:
    """Return the ``textstat`` module, or *None* if not installed."""
    try:
        import textstat  # type: ignore[import-untyped]

        return textstat
    except ImportError:
        return None

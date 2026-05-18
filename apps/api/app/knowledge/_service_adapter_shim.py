"""Compatibility helpers for exposing service-layer adapters under ``app.knowledge``."""

from __future__ import annotations

from importlib import import_module
from typing import Any


def export_service_adapter(module_path: str, class_name: str) -> Any:
    """Return a service-layer adapter class with a clear boot-time fallback."""
    try:
        module = import_module(module_path)
        return getattr(module, class_name)
    except (ImportError, ModuleNotFoundError) as exc:
        missing = getattr(exc, "name", None) or str(exc)

        class _MissingDependencyAdapter:
            def __init__(self, *_args: Any, **_kwargs: Any) -> None:
                raise RuntimeError(
                    f"{class_name} is unavailable because {missing!r} could not be imported "
                    f"while loading {module_path}."
                ) from exc

        _MissingDependencyAdapter.__name__ = class_name
        _MissingDependencyAdapter.__qualname__ = class_name
        return _MissingDependencyAdapter

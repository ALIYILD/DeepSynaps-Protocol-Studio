"""Analysis engine — decorator-based registry + runner.

Each analysis module registers functions via @register_analysis.
The runner iterates the registry, calls each, and catches errors
so one failure doesn't block others.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Callable

_log = logging.getLogger(__name__)

# ── Registry ─────────────────────────────────────────────────────────────────

_REGISTRY: dict[str, dict[str, Any]] = {}


def register_analysis(category: str, slug: str, label: str) -> Callable:
    """Decorator to register an analysis function.

    Usage:
        @register_analysis("spectral", "u_shape", "U-Shape Analysis")
        def u_shape(ctx: dict) -> dict:
            ...
    """
    key = f"{category}/{slug}"

    def decorator(fn: Callable) -> Callable:
        _REGISTRY[key] = {
            "fn": fn,
            "category": category,
            "slug": slug,
            "label": label,
        }
        return fn

    return decorator


def get_registry() -> dict[str, dict[str, Any]]:
    """Return a copy of the analysis registry (for introspection)."""
    return dict(_REGISTRY)


# ── Runner ────────────────────────────────────────────────────────────────────

def run_all(context: dict[str, Any]) -> dict[str, Any]:
    """Execute every registered analysis against the shared context.

    Returns:
        {
            "results": {
                slug: {
                    "label": str,
                    "category": str,
                    "data": dict,
                    "summary": str,
                    "status": "ok" | "error",
                    "error": str | None,
                    "duration_ms": int,
                }
            },
            "meta": {
                "total": int,
                "completed": int,
                "failed": int,
                "duration_sec": float,
            }
        }
    """
    results: dict[str, Any] = {}
    completed = 0
    failed = 0
    t0 = time.time()

    for key, entry in _REGISTRY.items():
        slug = entry["slug"]
        label = entry["label"]
        category = entry["category"]
        t_start = time.time()

        try:
            result = entry["fn"](context)
            elapsed_ms = int((time.time() - t_start) * 1000)

            results[slug] = {
                "label": label,
                "category": category,
                "data": result.get("data", {}),
                "summary": result.get("summary", ""),
                "status": "ok",
                "error": None,
                "duration_ms": elapsed_ms,
            }
            completed += 1
            _log.debug("Analysis %s completed in %dms", slug, elapsed_ms)

        except Exception as exc:
            elapsed_ms = int((time.time() - t_start) * 1000)
            _log.warning("Analysis %s failed: %s", slug, exc, exc_info=True)
            results[slug] = {
                "label": label,
                "category": category,
                "data": {},
                "summary": "",
                "status": "error",
                "error": str(exc)[:300],
                "duration_ms": elapsed_ms,
            }
            failed += 1

    total_sec = round(time.time() - t0, 2)
    _log.info(
        "Advanced analyses done: %d/%d ok, %d failed, %.1fs total",
        completed, completed + failed, failed, total_sec,
    )

    return {
        "results": results,
        "meta": {
            "total": completed + failed,
            "completed": completed,
            "failed": failed,
            "duration_sec": total_sec,
        },
    }

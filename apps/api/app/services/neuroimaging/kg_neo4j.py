"""Phase 5 Neo4j driver helpers — lazy connect; no I/O at import time."""
from __future__ import annotations

import os

try:
    import neo4j as _neo4j  # noqa: F401
    HAS_NEO4J_DRIVER: bool = True
except ImportError:
    _neo4j = None  # type: ignore[assignment]
    HAS_NEO4J_DRIVER = False


def _is_configured() -> bool:
    return bool(
        os.environ.get("NEO4J_URI")
        and os.environ.get("NEO4J_USER")
        and os.environ.get("NEO4J_PASSWORD")
    )


def get_driver():
    """Lazy Neo4j driver factory. Reads env on every call."""
    if not _is_configured():
        raise RuntimeError(
            "Neo4j is not configured: NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD must all be set"
        )
    raise NotImplementedError


def health_check() -> dict:
    configured = _is_configured()
    result = {
        "driver_installed": HAS_NEO4J_DRIVER,
        "configured": configured,
        "reachable": None,
        "error": None,
    }
    if not HAS_NEO4J_DRIVER:
        result["error"] = "neo4j driver not installed"
        return result
    if not configured:
        return result
    driver = None
    try:
        driver = get_driver()
        with driver.session() as session:
            record = session.run("RETURN 1 AS ok").single()
            ok = record is not None and record.get("ok") == 1
        result["reachable"] = bool(ok)
    except Exception as exc:  # noqa: BLE001 — health check must not raise
        result["reachable"] = False
        result["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if driver is not None:
            try:
                driver.close()
            except Exception:  # noqa: BLE001
                pass
    return result

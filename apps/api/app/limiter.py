"""Shared SlowAPI rate-limiter instance.

Import this module — never instantiate a second Limiter — so all routers
share the same counter state and the main.py app-state attachment works.

Usage in a router:
    from fastapi import Request
    from app.limiter import limiter

    @router.post("/some-endpoint")
    @limiter.limit("20/minute")
    def my_endpoint(request: Request, ...):
        ...

The default_limits value here applies to every route that does NOT carry an
explicit @limiter.limit() decorator; per-route decorators override it.

Storage backend
===============
By default the limiter uses in-memory storage — counters live in the
Python process and reset on restart. That is fine for dev/test and
single-process deploys. On a horizontally-scaled Fly app each machine
keeps its own counters and the effective per-IP limit becomes
``(configured limit) × (machine count)``, which makes the brute-force +
LLM-cost limits we ship trivially defeatable.

Set ``DEEPSYNAPS_LIMITER_REDIS_URI`` (env var, surfaced as
``settings.limiter_redis_uri``) to point at a shared Redis instance and
SlowAPI will use it via ``storage_uri``. SlowAPI's storage layer talks
to Redis through ``limits[redis]``.

When the env var is empty in production/staging we emit a startup
warning but continue with in-memory storage so existing deploys keep
working; ops should provision Redis before relying on rate limits to
hold under real load.
"""
from __future__ import annotations

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)


def _redact_uri(uri: str) -> str:
    """Return the URI with any embedded password stripped — safe to log."""
    try:
        # redis://[user:pass@]host[:port][/db]
        if "@" in uri and "://" in uri:
            scheme, rest = uri.split("://", 1)
            _, host = rest.split("@", 1)
            return f"{scheme}://***@{host}"
    except Exception:  # pragma: no cover - defensive
        pass
    return uri


def _build_limiter() -> Limiter:
    """Construct the shared Limiter, picking Redis storage when configured."""
    # Lazy-import settings so importing this module never triggers full
    # settings validation in test contexts that pre-load the limiter.
    try:
        from app.settings import get_settings

        settings = get_settings()
        storage_uri = (settings.limiter_redis_uri or "").strip()
        app_env = (settings.app_env or "").lower()
    except Exception:  # pragma: no cover - settings unreachable in some bootstraps
        storage_uri = ""
        app_env = "development"

    if storage_uri:
        logger.info(
            "rate-limiter using shared Redis backend (uri=%s)",
            _redact_uri(storage_uri),
        )
        return Limiter(
            key_func=get_remote_address,
            default_limits=["200/minute"],
            storage_uri=storage_uri,
        )

    if app_env in ("production", "staging"):
        logger.warning(
            "rate-limiter is using in-memory storage in app_env=%s — counters "
            "do not sync across machines, so configured limits are effectively "
            "multiplied by the machine count. Set DEEPSYNAPS_LIMITER_REDIS_URI "
            "to a shared Redis instance to enforce global limits.",
            app_env,
        )
    return Limiter(key_func=get_remote_address, default_limits=["200/minute"])


limiter = _build_limiter()

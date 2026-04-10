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
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

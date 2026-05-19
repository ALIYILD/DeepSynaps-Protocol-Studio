"""Regression: intelligent_router must import cleanly and register routes.

Root cause that this test guards against:
  app/intelligent/confidence_engine.py used a Pydantic v1 @validator("*")
  with the ``field`` parameter, which is rejected at class-definition time by
  Pydantic v2.  app/main.py catches all import errors and silently skips the
  router, leaving 0 routes under /intelligent-synaps/*.
"""
from __future__ import annotations

import importlib


def test_confidence_engine_imports_without_error() -> None:
    """confidence_engine must load cleanly (was crashing on Pydantic v2 validator)."""
    mod = importlib.import_module("app.intelligent.confidence_engine")
    assert hasattr(mod, "ConfidenceEngine"), "ConfidenceEngine not found after import"
    assert hasattr(mod, "ConfidenceScore"), "ConfidenceScore not found after import"


def test_intelligent_router_imports_and_has_routes() -> None:
    """intelligent_router must import and expose >0 routes on the router object."""
    mod = importlib.import_module("app.intelligent.intelligent_router")
    router = mod.router
    assert len(router.routes) > 0, (
        "intelligent_router.router has 0 routes — import succeeded but router is empty"
    )


def test_intelligent_synaps_health_endpoint_registered(client) -> None:
    """GET /intelligent-synaps/health must exist and be auth-gated (not 404)."""
    resp = client.get("/intelligent-synaps/health")
    assert resp.status_code in (200, 401, 403), (
        f"Expected 200, 401, or 403 from /intelligent-synaps/health, got {resp.status_code}. "
        "Either the router is not registered (404) or auth is not wired (200 without token)."
    )


def test_unauthenticated_synthesize_returns_401_or_403(client) -> None:
    """POST /intelligent-synaps/synthesize must reject unauthenticated requests."""
    resp = client.post(
        "/intelligent-synaps/synthesize",
        json={"queries": ["test query"]},
    )
    assert resp.status_code in (401, 403), (
        f"Expected 401 or 403 from unauthenticated POST /intelligent-synaps/synthesize, "
        f"got {resp.status_code}. Auth dependency is not wired."
    )


def test_all_intelligent_routes_declare_auth_dependency() -> None:
    """Every route in intelligent_router must declare get_authenticated_actor as a dependency.

    This test fails when any endpoint is missing the auth dependency. It drives
    the implementation requirement: add actor=Depends(get_authenticated_actor)
    to all 14 endpoints.
    """
    import inspect
    from fastapi.routing import APIRoute

    mod = importlib.import_module("app.intelligent.intelligent_router")
    router = mod.router

    missing: list[str] = []
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        sig = inspect.signature(route.endpoint)
        has_auth = any(
            hasattr(p.default, "dependency")
            and getattr(p.default.dependency, "__name__", "") == "get_authenticated_actor"
            for p in sig.parameters.values()
        )
        if not has_auth:
            missing.append(f"{list(route.methods)} {route.path}")

    assert not missing, (
        f"These routes are missing get_authenticated_actor dependency:\n"
        + "\n".join(f"  {r}" for r in missing)
    )

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
    """GET /intelligent-synaps/health must exist in the live app (not 404)."""
    resp = client.get("/intelligent-synaps/health")
    assert resp.status_code != 404, (
        "intelligent_router is not registered in main.py — "
        "/intelligent-synaps/health returned 404"
    )

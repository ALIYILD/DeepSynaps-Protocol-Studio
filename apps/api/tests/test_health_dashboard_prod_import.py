"""Regression test for the v385 boot crash.

On 2026-05-18 the production Fly image (`registry.fly.io/deepsynaps-studio:
deployment-01KRYCGVT8SH38GP5BA68QEBMN`) crashed at uvicorn boot with:

    File "/app/apps/api/app/routers/health_dashboard.py", line 1105, in <module>
        import pytest
    ModuleNotFoundError: No module named 'pytest'

The router file embeds a 400-line pytest test suite at module level. The
test code includes ``import pytest``, ``from fastapi.testclient import
TestClient``, ``client = TestClient(app)``, and ``@pytest.mark.asyncio``
decorators — all of which evaluate at import time. pytest is a dev-only
dep (in ``[dependency-groups] dev`` of ``apps/api/pyproject.toml``), so
in the prod Docker image it isn't installed and the bare ``import
pytest`` raises ModuleNotFoundError, which takes down the entire FastAPI
app at boot.

This test simulates the prod environment by hiding pytest from
sys.modules and asserts the router module loads anyway.
"""
from __future__ import annotations

import importlib
import sys


def test_health_dashboard_imports_without_pytest() -> None:
    """If pytest is missing from sys.modules, health_dashboard must
    still import cleanly. This pins the v385 prod boot crash fix."""
    # Drop any cached references to force a fresh import.
    sys.modules.pop("app.routers.health_dashboard", None)

    # Save then hide pytest so the module can't find it at import time.
    saved_pytest = sys.modules.pop("pytest", None)
    saved_meta_path = sys.meta_path.copy()

    class _BlockPytestFinder:
        @staticmethod
        def find_spec(name, path=None, target=None):
            if name == "pytest" or name.startswith("pytest."):
                raise ModuleNotFoundError(
                    f"No module named '{name}' (simulated prod env)"
                )
            return None

    sys.meta_path.insert(0, _BlockPytestFinder())
    try:
        importlib.import_module("app.routers.health_dashboard")
    finally:
        sys.meta_path[:] = saved_meta_path
        if saved_pytest is not None:
            sys.modules["pytest"] = saved_pytest
        sys.modules.pop("app.routers.health_dashboard", None)

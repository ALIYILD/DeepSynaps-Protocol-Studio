"""Tests for DeepTwin simulation feature gate (F6 launch-readiness).

Covers:
- Settings-level default-by-environment behavior + explicit override.
- Worker behavior (returns disabled stub + WARNING log when off; falls
  through to existing simulation path when on).
- Router behavior (HTTP 503 with deeptwin_simulation_disabled when off).
"""
from __future__ import annotations

import importlib.util
import logging
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# The conftest already adds apps/api to sys.path, which means the top-level
# `app` package resolves to the API. The worker's `app.deeptwin_simulation`
# lives in apps/worker/app/deeptwin_simulation.py and would shadow incorrectly,
# so we load it directly from its file path under a unique module name.
_WORKER_SIM_PATH = (
    Path(__file__).resolve().parents[2] / "worker" / "app" / "deeptwin_simulation.py"
)


def _load_worker_simulation_module() -> ModuleType:
    """Load apps/worker/app/deeptwin_simulation.py directly, bypassing the
    `app` package shadow from apps/api.
    """
    spec = importlib.util.spec_from_file_location(
        "deepsynaps_worker_deeptwin_simulation",
        _WORKER_SIM_PATH,
    )
    assert spec is not None and spec.loader is not None, (
        f"could not build import spec for {_WORKER_SIM_PATH}"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# 1-5: settings default-by-env + override
# ---------------------------------------------------------------------------

def _base_prod_env() -> dict[str, str]:
    """Minimum env vars to make load_settings() succeed in production/staging."""
    return {
        "DEEPSYNAPS_APP_ENV": "production",
        "JWT_SECRET_KEY": "x" * 64,  # not the insecure placeholder
        "DEEPSYNAPS_SECRETS_KEY": "Pn7p4xBz2vQ8fJ-bCe1rXkS5lYgM3hUaTwDoVqIeZ8U=",
        "DEEPSYNAPS_DATABASE_URL": "sqlite:///./test_gate.db",
        "DEEPSYNAPS_CORS_ORIGINS": "http://localhost:5173",
    }


def test_settings_default_off_in_production() -> None:
    from app.settings import load_settings

    env = _base_prod_env()
    with patch.dict(os.environ, env, clear=False):
        os.environ.pop("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", None)
        settings = load_settings()
        assert settings.enable_deeptwin_simulation is False


def test_settings_default_off_in_staging() -> None:
    from app.settings import load_settings

    env = {**_base_prod_env(), "DEEPSYNAPS_APP_ENV": "staging"}
    with patch.dict(os.environ, env, clear=False):
        os.environ.pop("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", None)
        settings = load_settings()
        assert settings.enable_deeptwin_simulation is False


def test_settings_default_on_in_development() -> None:
    from app.settings import load_settings

    env = {
        "DEEPSYNAPS_APP_ENV": "development",
        "DEEPSYNAPS_DATABASE_URL": "sqlite:///./test_gate_dev.db",
        "DEEPSYNAPS_CORS_ORIGINS": "http://localhost:5173",
    }
    with patch.dict(os.environ, env, clear=False):
        os.environ.pop("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", None)
        os.environ.pop("JWT_SECRET_KEY", None)
        os.environ.pop("DEEPSYNAPS_SECRETS_KEY", None)
        settings = load_settings()
        assert settings.enable_deeptwin_simulation is True


def test_settings_default_on_in_test_env() -> None:
    from app.settings import load_settings

    env = {
        "DEEPSYNAPS_APP_ENV": "test",
        "DEEPSYNAPS_DATABASE_URL": "sqlite:///./test_gate_test.db",
        "DEEPSYNAPS_CORS_ORIGINS": "http://localhost:5173",
    }
    with patch.dict(os.environ, env, clear=False):
        os.environ.pop("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", None)
        os.environ.pop("JWT_SECRET_KEY", None)
        os.environ.pop("DEEPSYNAPS_SECRETS_KEY", None)
        settings = load_settings()
        assert settings.enable_deeptwin_simulation is True


def test_settings_override_truthy_in_production() -> None:
    from app.settings import load_settings

    env = {**_base_prod_env(), "DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION": "1"}
    with patch.dict(os.environ, env, clear=False):
        settings = load_settings()
        assert settings.enable_deeptwin_simulation is True


# ---------------------------------------------------------------------------
# 6-7: worker entry-point gate
# ---------------------------------------------------------------------------

@pytest.fixture
def _clean_worker_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
    monkeypatch.delenv("DEEPSYNAPS_APP_ENV", raising=False)
    yield


def test_worker_returns_disabled_status_when_flag_off(
    _clean_worker_env: None,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "0")

    sim_mod = _load_worker_simulation_module()
    DeeptwinSimulationJob = sim_mod.DeeptwinSimulationJob
    run_deeptwin_simulation = sim_mod.run_deeptwin_simulation

    job = DeeptwinSimulationJob(
        job_id="job-gate-off",
        patient_id="pat-1",
        protocol_id="proto-1",
        horizon_days=30,
        modalities=[],
        scenario={},
    )

    with caplog.at_level(logging.WARNING, logger=sim_mod.__name__):
        result = run_deeptwin_simulation(job)

    assert result["status"] == "disabled"
    assert result["reason"] == "deeptwin_simulation_not_enabled_in_environment"
    assert "DeepTwin simulation is gated off" in result["message"]
    assert any(
        "ENABLE_DEEPTWIN_SIMULATION=False" in record.getMessage()
        for record in caplog.records
        if record.levelno == logging.WARNING
    )


def test_worker_proceeds_past_gate_when_flag_on(
    _clean_worker_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "1")

    sim_mod = _load_worker_simulation_module()
    DeeptwinSimulationJob = sim_mod.DeeptwinSimulationJob
    run_deeptwin_simulation = sim_mod.run_deeptwin_simulation

    job = DeeptwinSimulationJob(
        job_id="job-gate-on",
        patient_id="pat-1",
        protocol_id="proto-1",
        horizon_days=30,
        modalities=[],
        scenario={},
    )
    result = run_deeptwin_simulation(job)

    # We don't fully assert the simulation shape — just that the gate is
    # past and one of the existing branches (autoresearch=not_implemented
    # OR deterministic stub) was taken.
    assert result.get("status") != "disabled"
    if result.get("status") == "not_implemented":
        # autoresearch branch
        assert result["engine"]["name"] == "autoresearch"
    else:
        # deterministic stub branch
        assert result["engine"]["name"] == "stub"
        assert result["job_id"] == "job-gate-on"
        assert isinstance(result["timecourse"], list)
        assert result["timecourse"]


# ---------------------------------------------------------------------------
# 8: router 503 mapping
# ---------------------------------------------------------------------------

def test_simulate_endpoint_returns_503_when_flag_disabled(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the flag is off, /simulate must return 503 with the documented
    error code so the frontend can render a "feature unavailable" banner.
    We monkeypatch the router's view of get_settings rather than flipping
    the whole process env, which keeps the rest of the test session in test
    mode (where the gate is on by default).
    """
    from app.routers import deeptwin_router
    from app.settings import AppSettings

    real_settings = deeptwin_router.get_settings()
    gated = real_settings.model_copy(update={"enable_deeptwin_simulation": False})
    assert isinstance(gated, AppSettings)
    monkeypatch.setattr(deeptwin_router, "get_settings", lambda: gated)

    resp = client.post(
        "/api/v1/deeptwin/simulate",
        json={
            "patient_id": "pat-gate-1",
            "protocol_id": "rtms_fp2_10hz",
            "horizon_days": 30,
            "modalities": ["qeeg_features"],
            "scenario": {"intervention_type": "rTMS"},
        },
        headers=auth_headers["clinician"],
    )

    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert body["code"] == "deeptwin_simulation_disabled"
    assert "gated off" in body["message"]
    # Structured details for the frontend banner.
    assert body["details"]["reason"] == "deeptwin_simulation_not_enabled_in_environment"
    assert body["details"]["env_flag"] == "DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION"

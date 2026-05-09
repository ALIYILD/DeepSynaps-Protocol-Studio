"""Tests for app.deeptwin_simulation in apps/worker.

Pins three contracts:
  1. The env-aware feature flag matches the API's resolution logic
     (see apps/api/app/settings.resolve_enable_deeptwin_simulation).
  2. When disabled, the worker returns a structured "disabled" payload
     — never 500 / never silently emits placeholder trajectories.
  3. When enabled, the worker fails CLOSED with not_implemented if no
     real simulator is wired in. This matches the safety contract
     captured in the source-file docstring.
"""

from __future__ import annotations

import sys

import pytest

from app.deeptwin_simulation import (
    DeeptwinSimulationJob,
    _is_simulation_enabled,
    run_deeptwin_simulation,
)


def _job(**kwargs) -> DeeptwinSimulationJob:
    payload = {
        "job_id": "job-1",
        "tenant_id": "t-1",
        "patient_id": "p-1",
        "protocol_id": "proto-1",
        "horizon_days": 30,
        "modalities": ["rtms"],
        "scenario": {"goal": "phq9 < 10"},
    }
    payload.update(kwargs)
    return DeeptwinSimulationJob(**payload)


# ───────────────────────────── DeeptwinSimulationJob ───────────────────────


class TestDeeptwinSimulationJob:
    def test_minimal_construction(self) -> None:
        job = DeeptwinSimulationJob(
            job_id="j", patient_id="p", protocol_id="proto",
        )
        assert job.horizon_days == 90  # default
        assert job.modalities == []
        assert job.scenario == {}

    def test_horizon_days_lower_bound(self) -> None:
        with pytest.raises(ValueError):
            DeeptwinSimulationJob(
                job_id="j", patient_id="p", protocol_id="proto", horizon_days=6,
            )

    def test_horizon_days_upper_bound(self) -> None:
        with pytest.raises(ValueError):
            DeeptwinSimulationJob(
                job_id="j", patient_id="p", protocol_id="proto", horizon_days=400,
            )

    def test_patient_id_min_length(self) -> None:
        with pytest.raises(ValueError):
            DeeptwinSimulationJob(job_id="j", patient_id="", protocol_id="proto")

    def test_protocol_id_min_length(self) -> None:
        with pytest.raises(ValueError):
            DeeptwinSimulationJob(job_id="j", patient_id="p", protocol_id="")


# ───────────────────────────── _is_simulation_enabled ──────────────────────


class TestIsSimulationEnabled:
    @pytest.mark.parametrize("truthy", ["1", "true", "TRUE", "yes", "ON"])
    def test_explicit_truthy_env_var(self, monkeypatch: pytest.MonkeyPatch, truthy: str) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", truthy)
        # App env irrelevant when explicit override is present.
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        assert _is_simulation_enabled() is True

    @pytest.mark.parametrize("falsy", ["0", "false", "FALSE", "no", "OFF"])
    def test_explicit_falsy_env_var(self, monkeypatch: pytest.MonkeyPatch, falsy: str) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", falsy)
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
        assert _is_simulation_enabled() is False

    def test_default_disabled_in_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        assert _is_simulation_enabled() is False

    def test_default_disabled_in_staging(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "staging")
        assert _is_simulation_enabled() is False

    def test_default_enabled_in_development(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
        assert _is_simulation_enabled() is True

    def test_default_enabled_in_test(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
        assert _is_simulation_enabled() is True

    def test_default_enabled_when_no_app_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Falls back to development per the env-resolution doc.
        monkeypatch.delenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", raising=False)
        monkeypatch.delenv("DEEPSYNAPS_APP_ENV", raising=False)
        assert _is_simulation_enabled() is True

    def test_unknown_env_var_value_falls_through_to_app_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "maybe")
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
        # Unknown override value → falls to app-env default → False.
        assert _is_simulation_enabled() is False


# ───────────────────────────── run_deeptwin_simulation ─────────────────────


class TestRunDeeptwinSimulationDisabled:
    def test_returns_disabled_status_when_flag_off(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "false")
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
        result = run_deeptwin_simulation(_job())
        assert result["status"] == "disabled"
        assert "deeptwin_simulation_not_enabled_in_environment" in result["reason"]
        assert "Contact admin" in result["message"] or "admin" in result["message"]

    def test_does_not_return_engine_block_when_disabled(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "false")
        result = run_deeptwin_simulation(_job())
        # Disabled path does NOT leak placeholder engine info.
        assert "engine" not in result


class TestRunDeeptwinSimulationEnabled:
    def test_no_engine_returns_not_implemented_fail_closed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Enable + block autoresearch import → fail-closed not_implemented.
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "true")
        sys.modules.pop("autoresearch", None)
        real_import = __import__

        def _block(name, *args, **kwargs):
            if name == "autoresearch" or name.startswith("autoresearch."):
                raise ImportError("simulated: autoresearch not installed")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _block)

        result = run_deeptwin_simulation(_job())
        assert result["status"] == "not_implemented"
        assert result["engine"]["name"] == "deeptwin_simulation"
        assert result["engine"]["real_ai"] is False
        # The fail-closed message must explicitly disable placeholder trajectories.
        assert "Placeholder trajectories are disabled" in result["engine"]["notice"]
        assert result["reason"] == "no_validated_simulation_engine"
        # Inputs echoed for traceability.
        assert result["inputs_echo"]["job_id"] == "job-1"
        assert result["inputs_echo"]["patient_id"] == "p-1"

    def test_with_autoresearch_returns_integration_placeholder(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION", "true")
        # Inject a fake autoresearch module so importlib.import_module succeeds.
        import types

        sys.modules["autoresearch"] = types.ModuleType("autoresearch")

        try:
            result = run_deeptwin_simulation(_job())
            assert result["engine"]["name"] == "autoresearch"
            assert result["engine"]["status"] == "available"
            # Even with autoresearch importable, the worker still returns
            # not_implemented — there's no domain-specific wrapper yet.
            assert result["status"] == "not_implemented"
            assert result["job_id"] == "job-1"
            assert "domain-specific simulator wrapper" in result["notes"][0]
        finally:
            sys.modules.pop("autoresearch", None)

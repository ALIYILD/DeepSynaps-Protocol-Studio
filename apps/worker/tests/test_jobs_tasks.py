"""Edge-case tests for the Celery task wrappers in ``app.jobs``.

The existing test suite (test_jobs_celery_wiring.py, test_jobs_startup.py)
covers:
  - _broker_host credential stripping
  - _NoopCeleryApp decorator contract
  - _build_celery_app fail-closed in production/staging
  - enqueue_render_job canonical envelope

This file pins the missing coverage: the four task-function wrappers
(run_mne_pipeline_job, run_mne_pipeline_custom_job, run_erp_pipeline_job,
deeptwin_simulation_job).  Each wrapper has an identical structure:

  1. Try to import the real service function.
  2. On ImportError → return ``{"status": "failed", "error": "import failed: …"}``.
  3. On success → delegate to the service and return its result.

The ``pragma: no cover`` on the error branches is intentional in product
code — those branches exist as a safety net and are intentionally hard to
test without mocking. We test them here anyway, using import-mocking, so the
error-envelope contract is pinned.

We also cover ``deeptwin_simulation_job`` which has a different internal
shape (model_validate → run_deeptwin_simulation).
"""
from __future__ import annotations

import sys
import types
from typing import Any
from unittest import mock

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_service(return_value: Any = None):
    """Return a mock callable whose result can be asserted."""
    fn = mock.MagicMock(return_value=return_value)
    return fn


def _inject_fake_module(dotted_name: str, attr_name: str, fn: Any) -> types.ModuleType:
    """Inject a minimal fake module into sys.modules with one callable attr."""
    parent, _, leaf = dotted_name.rpartition(".")
    # Build a tiny module hierarchy so `from <dotted_name> import <attr>` works.
    mod = types.ModuleType(dotted_name)
    setattr(mod, attr_name, fn)
    sys.modules[dotted_name] = mod
    # Ensure parent package stubs exist so Python's import machinery is happy.
    parts = dotted_name.split(".")
    for i in range(1, len(parts)):
        pkg_name = ".".join(parts[:i])
        if pkg_name not in sys.modules:
            pkg_mod = types.ModuleType(pkg_name)
            sys.modules[pkg_name] = pkg_mod
    return mod


def _remove_fake_modules(*names: str) -> None:
    for name in names:
        sys.modules.pop(name, None)


# ---------------------------------------------------------------------------
# run_mne_pipeline_job
# ---------------------------------------------------------------------------


class TestRunMnePipelineJob:
    """The MNE pipeline task wrapper delegates to run_mne_pipeline_job_sync."""

    def test_happy_path_delegates_to_sync(self) -> None:
        svc = _make_fake_service({"analysis_id": "A1", "status": "completed"})
        _inject_fake_module(
            "app.services.qeeg_pipeline_job",
            "run_mne_pipeline_job_sync",
            svc,
        )
        try:
            from app.jobs import run_mne_pipeline_job  # type: ignore[import-not-found]

            result = run_mne_pipeline_job("A1")
            svc.assert_called_once_with("A1")
            assert result["status"] == "completed"
            assert result["analysis_id"] == "A1"
        finally:
            _remove_fake_modules("app.services.qeeg_pipeline_job", "app.services")

    def test_import_failure_returns_error_envelope(self) -> None:
        # Block the services module so the import inside the function fails.
        sys.modules["app.services.qeeg_pipeline_job"] = None  # type: ignore[assignment]
        try:
            from app.jobs import run_mne_pipeline_job

            result = run_mne_pipeline_job("A99")
            assert result["status"] == "failed"
            assert result["analysis_id"] == "A99"
            assert "import failed" in result["error"]
        finally:
            _remove_fake_modules("app.services.qeeg_pipeline_job", "app.services")


# ---------------------------------------------------------------------------
# run_mne_pipeline_custom_job
# ---------------------------------------------------------------------------


class TestRunMnePipelineCustomJob:
    """Custom-pipeline variant delegates to run_custom_pipeline_sync."""

    def test_happy_path_delegates_to_sync(self) -> None:
        svc = _make_fake_service({"analysis_id": "A2", "status": "completed"})
        _inject_fake_module(
            "app.services.eeg_signal_service",
            "run_custom_pipeline_sync",
            svc,
        )
        try:
            from app.jobs import run_mne_pipeline_custom_job

            result = run_mne_pipeline_custom_job("A2")
            svc.assert_called_once_with("A2")
            assert result["status"] == "completed"
        finally:
            _remove_fake_modules("app.services.eeg_signal_service", "app.services")

    def test_import_failure_returns_error_envelope(self) -> None:
        sys.modules["app.services.eeg_signal_service"] = None  # type: ignore[assignment]
        try:
            from app.jobs import run_mne_pipeline_custom_job

            result = run_mne_pipeline_custom_job("A88")
            assert result["status"] == "failed"
            assert result["analysis_id"] == "A88"
            assert "import failed" in result["error"]
        finally:
            _remove_fake_modules("app.services.eeg_signal_service", "app.services")


# ---------------------------------------------------------------------------
# run_erp_pipeline_job
# ---------------------------------------------------------------------------


class TestRunErpPipelineJob:
    """ERP pipeline task delegates to run_erp_job_sync with three args."""

    def test_happy_path_delegates_to_sync(self) -> None:
        svc = _make_fake_service({"analysis_id": "E1", "job_id": "J1", "status": "completed"})
        _inject_fake_module(
            "app.services.erp_service",
            "run_erp_job_sync",
            svc,
        )
        try:
            from app.jobs import run_erp_pipeline_job

            payload: dict[str, Any] = {"epochs": 100}
            result = run_erp_pipeline_job("E1", "J1", payload)
            svc.assert_called_once_with("E1", "J1", payload)
            assert result["status"] == "completed"
        finally:
            _remove_fake_modules("app.services.erp_service", "app.services")

    def test_import_failure_returns_error_envelope(self) -> None:
        sys.modules["app.services.erp_service"] = None  # type: ignore[assignment]
        try:
            from app.jobs import run_erp_pipeline_job

            result = run_erp_pipeline_job("E99", "J99", {})
            assert result["status"] == "failed"
            assert result["analysis_id"] == "E99"
            assert result["job_id"] == "J99"
            assert "import failed" in result["error"]
        finally:
            _remove_fake_modules("app.services.erp_service", "app.services")

    def test_request_payload_forwarded_verbatim(self) -> None:
        payload = {"custom_filter": True, "epoch_length": 2.0}
        captured: list[Any] = []
        svc = mock.MagicMock(side_effect=lambda a, j, p: captured.append(p) or {"status": "ok"})
        _inject_fake_module("app.services.erp_service", "run_erp_job_sync", svc)
        try:
            from app.jobs import run_erp_pipeline_job

            run_erp_pipeline_job("E5", "J5", payload)
            assert captured[0] == payload
        finally:
            _remove_fake_modules("app.services.erp_service", "app.services")


# ---------------------------------------------------------------------------
# deeptwin_simulation_job
# ---------------------------------------------------------------------------


class TestDeeptwinSimulationJob:
    """deeptwin_simulation_job validates the payload then calls run_deeptwin_simulation."""

    def _valid_payload(self) -> dict[str, Any]:
        return {
            "job_id": "dt-1",
            "patient_id": "p-1",
            "protocol_id": "proto-1",
            "horizon_days": 30,
            "modalities": ["rtms"],
            "scenario": {"goal": "phq9 < 10"},
        }

    def test_happy_path_returns_simulation_result(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.jobs as jobs_mod

        fake_result = {"status": "not_implemented", "job_id": "dt-1"}
        monkeypatch.setattr(jobs_mod, "run_deeptwin_simulation", lambda j: fake_result)

        result = jobs_mod.deeptwin_simulation_job(self._valid_payload())
        assert result["status"] == "not_implemented"
        assert result["job_id"] == "dt-1"

    def test_invalid_payload_raises_validation_error(self) -> None:
        from app.jobs import deeptwin_simulation_job
        import pydantic

        bad_payload: dict[str, Any] = {
            "job_id": "dt-2",
            "patient_id": "",  # violates min_length=1
            "protocol_id": "proto-1",
        }
        with pytest.raises(pydantic.ValidationError):
            deeptwin_simulation_job(bad_payload)

    def test_payload_is_model_validated_not_raw_dict(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The job function must pass a DeeptwinSimulationJob instance to the runner,
        not the raw dict."""
        import app.jobs as jobs_mod
        from app.deeptwin_simulation import DeeptwinSimulationJob

        received: list[Any] = []

        def _capture(job: Any) -> dict[str, Any]:
            received.append(job)
            return {"status": "ok"}

        # Patch the module-global name used by deeptwin_simulation_job at call time.
        monkeypatch.setattr(jobs_mod, "run_deeptwin_simulation", _capture)

        jobs_mod.deeptwin_simulation_job(self._valid_payload())
        assert len(received) == 1
        assert isinstance(received[0], DeeptwinSimulationJob)

    def test_horizon_days_defaults_to_90_when_omitted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.jobs as jobs_mod
        from app.deeptwin_simulation import DeeptwinSimulationJob

        received: list[DeeptwinSimulationJob] = []

        def _capture(job: DeeptwinSimulationJob) -> dict[str, Any]:
            received.append(job)
            return {"status": "ok"}

        monkeypatch.setattr(jobs_mod, "run_deeptwin_simulation", _capture)

        payload = {"job_id": "dt-3", "patient_id": "p-3", "protocol_id": "proto-3"}
        jobs_mod.deeptwin_simulation_job(payload)
        assert received[0].horizon_days == 90


# ---------------------------------------------------------------------------
# __all__ completeness
# ---------------------------------------------------------------------------


class TestJobsPublicApi:
    """__all__ must export the complete task surface."""

    def test_all_contains_expected_symbols(self) -> None:
        from app import jobs

        expected = {
            "RenderJob",
            "enqueue_render_job",
            "run_mne_pipeline_job",
            "run_mne_pipeline_custom_job",
            "run_erp_pipeline_job",
            "deeptwin_simulation_job",
            "celery_app",
        }
        assert expected.issubset(set(jobs.__all__))

    def test_enqueue_render_job_returns_canonical_envelope(self) -> None:
        from app.jobs import RenderJob, enqueue_render_job

        job = RenderJob(job_id="x-99", output_type="pdf", protocol_id="P99")
        out = enqueue_render_job(job)
        assert out == {"status": "queued", "job_id": "x-99"}

    def test_render_job_pydantic_validation(self) -> None:
        import pydantic
        from app.jobs import RenderJob

        # Missing required fields must raise
        with pytest.raises(pydantic.ValidationError):
            RenderJob()  # type: ignore[call-arg]

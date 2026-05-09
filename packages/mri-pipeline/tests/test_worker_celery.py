"""Tests for ``deepsynaps_mri.worker`` Celery wiring.

Pins the Celery contract that hands off long-running MRI pipelines from
the FastAPI process to a worker:

- The Celery app is constructed with the documented broker / backend
  env-var fallbacks so deployments only need to set ``CELERY_BROKER_URL``.
- ``task_track_started=True`` so the API can poll ``state == STARTED``.
- ``task_time_limit`` is the documented 4 hour hard cap (no analysis
  may pin a worker forever).
- ``worker_prefetch_multiplier=1`` so a stuck pipeline can't starve
  others.
- ``run_pipeline_job`` is registered under the documented name
  ``deepsynaps_mri.run_pipeline_job`` and returns the
  ``{analysis_id, html, pdf}`` envelope expected by the API poll loop.
"""
from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest

from deepsynaps_mri import worker as worker_mod


class TestCeleryAppWiring:
    def test_celery_app_name(self) -> None:
        # Pin: app name is the package slug — Celery routes tasks via
        # the app name namespace.
        assert worker_mod.celery_app.main == "deepsynaps_mri"

    def test_task_track_started_enabled(self) -> None:
        # Pin: API code polls for STARTED state, so this MUST stay True.
        assert worker_mod.celery_app.conf.task_track_started is True

    def test_task_time_limit_is_4_hours(self) -> None:
        # Pin: 4 hour hard limit. A stuck pipeline must not pin a
        # worker indefinitely.
        assert worker_mod.celery_app.conf.task_time_limit == 60 * 60 * 4

    def test_worker_prefetch_multiplier_is_one(self) -> None:
        # Pin: 1 = a single in-flight job per worker. MRI jobs are
        # heavy; prefetching multiple would starve concurrent users.
        assert worker_mod.celery_app.conf.worker_prefetch_multiplier == 1

    def test_default_broker_is_redis(self) -> None:
        # Pin: when CELERY_BROKER_URL is unset we default to local
        # redis. The module-level constant captures the env at import
        # time, so we just assert the documented default shape.
        assert worker_mod.BROKER.startswith("redis://")
        assert worker_mod.BACKEND.startswith("redis://")

    def test_run_pipeline_job_registered(self) -> None:
        # Pin: the task is registered under the documented name. The
        # API enqueues by name, so a rename here would silently break
        # production.
        assert (
            "deepsynaps_mri.run_pipeline_job"
            in worker_mod.celery_app.tasks
        )


class TestRunPipelineJobBody:
    def _patient_dict(self) -> dict:
        return {
            "patient_id": "P-001",
            "age": 42,
            "sex": "F",
            "handedness": "R",
            "chief_complaint": "screening",
        }

    def _patch_self_update_state(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> list[tuple[str, dict]]:
        """Replace the bound Task's update_state with a recorder.

        The Celery task's __wrapped__ is a bound method whose self IS
        the Task instance, so we cannot inject our own. Instead we
        patch update_state on the actual task object.
        """
        seen: list[tuple[str, dict]] = []
        task = worker_mod.celery_app.tasks["deepsynaps_mri.run_pipeline_job"]

        def _capture(state: str, meta: dict | None = None) -> None:
            seen.append((state, meta or {}))

        monkeypatch.setattr(task, "update_state", _capture)
        return seen

    def test_happy_path_returns_envelope(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin THE worker contract: on success, return a dict with
        # exactly {analysis_id, html, pdf}. The API poll loop unpacks
        # those keys directly into the patient response.
        analysis_id = uuid4()
        fake_report = mock.MagicMock()
        fake_report.analysis_id = analysis_id
        fake_report.report_html_s3 = "s3://bucket/report.html"
        fake_report.report_pdf_s3 = "s3://bucket/report.pdf"

        run_pipeline_mock = mock.MagicMock(return_value=fake_report)
        save_report_mock = mock.MagicMock()
        monkeypatch.setattr(worker_mod, "run_pipeline", run_pipeline_mock)
        monkeypatch.setattr(worker_mod.db_mod, "save_report", save_report_mock)
        self._patch_self_update_state(monkeypatch)

        # __wrapped__ is the bound method (self is the Task) so we
        # call it with the user-facing positional args only.
        out = worker_mod.run_pipeline_job.__wrapped__(
            "/tmp/session", self._patient_dict(), "/tmp/out"
        )

        assert set(out.keys()) == {"analysis_id", "html", "pdf"}
        assert out["analysis_id"] == str(analysis_id)
        assert out["html"] == "s3://bucket/report.html"
        assert out["pdf"] == "s3://bucket/report.pdf"
        # Pin: report is persisted via db.save_report exactly once.
        save_report_mock.assert_called_once_with(fake_report)
        # Pin: pipeline is invoked with the validated patient and the
        # passed-through paths.
        run_pipeline_mock.assert_called_once()
        args, kwargs = run_pipeline_mock.call_args
        assert args[0] == "/tmp/session"
        assert args[2] == "/tmp/out"
        assert kwargs.get("condition") == "mdd"  # default

    def test_progress_state_emitted_before_pipeline(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: the worker emits PROGRESS:starting BEFORE running the
        # pipeline so the API never shows a "queued" job that is
        # actually executing. This is the contract that lets the
        # frontend show a spinner.
        fake_report = mock.MagicMock()
        fake_report.analysis_id = uuid4()
        fake_report.report_html_s3 = "x"
        fake_report.report_pdf_s3 = "y"

        seen = self._patch_self_update_state(monkeypatch)
        monkeypatch.setattr(
            worker_mod,
            "run_pipeline",
            mock.MagicMock(return_value=fake_report),
        )
        monkeypatch.setattr(worker_mod.db_mod, "save_report", mock.MagicMock())

        worker_mod.run_pipeline_job.__wrapped__(
            "/tmp/s", self._patient_dict(), "/tmp/o"
        )

        # PROGRESS:starting must have fired.
        assert any(
            state == "PROGRESS" and meta.get("stage") == "starting"
            for state, meta in seen
        )

    def test_condition_override_is_threaded_through(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake_report = mock.MagicMock()
        fake_report.analysis_id = uuid4()
        fake_report.report_html_s3 = "x"
        fake_report.report_pdf_s3 = "y"
        run_pipeline_mock = mock.MagicMock(return_value=fake_report)
        monkeypatch.setattr(worker_mod, "run_pipeline", run_pipeline_mock)
        monkeypatch.setattr(worker_mod.db_mod, "save_report", mock.MagicMock())
        self._patch_self_update_state(monkeypatch)

        worker_mod.run_pipeline_job.__wrapped__(
            "/tmp/s",
            self._patient_dict(),
            "/tmp/o",
            condition="ocd",
        )
        assert run_pipeline_mock.call_args.kwargs["condition"] == "ocd"

    def test_invalid_patient_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: pydantic validation error MUST propagate so Celery marks
        # the task FAILURE rather than swallowing a malformed payload
        # and shipping a partial pipeline run.
        run_pipeline_mock = mock.MagicMock()
        monkeypatch.setattr(worker_mod, "run_pipeline", run_pipeline_mock)
        monkeypatch.setattr(worker_mod.db_mod, "save_report", mock.MagicMock())
        self._patch_self_update_state(monkeypatch)

        with pytest.raises(Exception):
            worker_mod.run_pipeline_job.__wrapped__(
                "/tmp/s",
                {"patient_id": None},  # missing required fields
                "/tmp/o",
            )
        # Pipeline must NOT have run.
        run_pipeline_mock.assert_not_called()

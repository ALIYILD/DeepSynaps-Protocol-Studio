"""Tests for ``app.jobs`` Celery wiring + helpers.

Pins the **fail-closed in production / noop-only in dev** safety
contract for the Celery broker:

- _broker_host strips credentials from a broker URL (NEVER logs the
  full URL because it commonly carries the password).
- _NoopCeleryApp: .task decorator returns the wrapped function
  unchanged so direct calls work in unit tests; .delay() raises
  AttributeError so a missing broker can't silently run blocking
  pipelines on the API thread.
- _build_celery_app raises RuntimeError in production / staging when
  Celery is missing OR when CELERY_BROKER_URL is unset.
- _build_celery_app returns the noop fallback in development / test
  with a WARNING log (so it can't be missed).
- enqueue_render_job emits the canonical {status, job_id} envelope.
"""
from __future__ import annotations

import logging
from unittest import mock

import pytest

from app.jobs import (
    RenderJob,
    _broker_host,
    _NoopCeleryApp,
    _build_celery_app,
    enqueue_render_job,
)


# ── _broker_host ──────────────────────────────────────────────────────────


class TestBrokerHost:
    def test_unset_returns_placeholder(self) -> None:
        assert _broker_host("") == "<unset>"

    def test_strips_credentials(self) -> None:
        # Pin the safety contract: credentials in the broker URL must
        # NEVER appear in a log line. _broker_host returns host[:port]
        # only.
        url = "redis://user:supersecret@redis-prod.internal:6379/0"
        out = _broker_host(url)
        assert "user" not in out
        assert "supersecret" not in out
        assert "redis-prod.internal" in out
        assert "6379" in out

    def test_no_port_emits_host_only(self) -> None:
        url = "redis://localhost"
        assert _broker_host(url) == "localhost"

    def test_unparseable_url_returns_unknown(self) -> None:
        # urlparse rarely actually fails, but the helper guards
        # defensively. Verify it doesn't raise on garbage.
        out = _broker_host("not-a-url")
        # Could be "<unknown>" or the literal — either way no crash.
        assert isinstance(out, str)


# ── _NoopCeleryApp ────────────────────────────────────────────────────────


class TestNoopCeleryApp:
    def test_task_decorator_returns_function_unchanged(self) -> None:
        # Pin: @app.task without args returns the wrapped function
        # unchanged so unit tests can call it directly.
        app = _NoopCeleryApp()

        @app.task
        def my_job(x: int) -> int:
            return x + 1

        assert my_job(5) == 6

    def test_task_decorator_with_kwargs_returns_function(self) -> None:
        app = _NoopCeleryApp()

        @app.task(name="x", bind=False)
        def my_job(x: int) -> int:
            return x * 2

        assert my_job(3) == 6

    def test_noop_function_has_no_delay_method(self) -> None:
        # Pin the safety contract: .delay() must raise AttributeError
        # so a missing broker can't silently run blocking pipelines
        # on the API thread.
        app = _NoopCeleryApp()

        @app.task
        def my_job() -> None:
            return None

        with pytest.raises(AttributeError):
            my_job.delay()  # type: ignore[attr-defined]


# ── _build_celery_app ────────────────────────────────────────────────────


class TestBuildCeleryApp:
    def test_dev_env_falls_back_to_noop_when_broker_unset(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        # In development: noop fallback allowed, but a WARNING must be
        # emitted so it can't be missed in the logs.
        monkeypatch.setattr("app.jobs._APP_ENV", "development")
        monkeypatch.setattr("app.jobs._BROKER_URL", "")
        monkeypatch.setattr("app.jobs._REQUIRE_REAL_CELERY", False)

        with caplog.at_level(logging.WARNING):
            out = _build_celery_app()
        assert isinstance(out, _NoopCeleryApp)
        # WARNING was emitted.
        assert any("noop fallback" in rec.message for rec in caplog.records)

    def test_production_env_raises_when_broker_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin the load-bearing fail-closed contract: production /
        # staging MUST refuse to start with the noop fallback.
        monkeypatch.setattr("app.jobs._APP_ENV", "production")
        monkeypatch.setattr("app.jobs._BROKER_URL", "")
        monkeypatch.setattr("app.jobs._REQUIRE_REAL_CELERY", True)

        with pytest.raises(RuntimeError, match="CELERY_BROKER_URL is not set"):
            _build_celery_app()

    def test_staging_env_also_fail_closed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("app.jobs._APP_ENV", "staging")
        monkeypatch.setattr("app.jobs._BROKER_URL", "")
        monkeypatch.setattr("app.jobs._REQUIRE_REAL_CELERY", True)

        with pytest.raises(RuntimeError, match="CELERY_BROKER_URL"):
            _build_celery_app()

    def test_production_raises_when_celery_import_fails(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("app.jobs._APP_ENV", "production")
        monkeypatch.setattr("app.jobs._REQUIRE_REAL_CELERY", True)
        monkeypatch.setattr("app.jobs._BROKER_URL", "redis://x")

        original_import = __import__

        def _blocked_import(name, *args, **kwargs):
            if name == "celery":
                raise ImportError("simulated missing celery")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _blocked_import)
        with pytest.raises(RuntimeError, match="celery import failed"):
            _build_celery_app()

    def test_dev_env_falls_back_when_celery_import_fails(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        monkeypatch.setattr("app.jobs._APP_ENV", "development")
        monkeypatch.setattr("app.jobs._REQUIRE_REAL_CELERY", False)
        monkeypatch.setattr("app.jobs._BROKER_URL", "redis://x")

        original_import = __import__

        def _blocked_import(name, *args, **kwargs):
            if name == "celery":
                raise ImportError("simulated missing celery")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _blocked_import)
        with caplog.at_level(logging.WARNING):
            out = _build_celery_app()
        assert isinstance(out, _NoopCeleryApp)


# ── enqueue_render_job ───────────────────────────────────────────────────


class TestEnqueueRenderJob:
    def test_returns_canonical_envelope(self) -> None:
        job = RenderJob(job_id="J1", output_type="pdf", protocol_id="P1")
        out = enqueue_render_job(job)
        assert out == {"status": "queued", "job_id": "J1"}

    def test_job_id_round_trips(self) -> None:
        job = RenderJob(job_id="abc-xyz", output_type="docx", protocol_id="P9")
        out = enqueue_render_job(job)
        assert out["job_id"] == "abc-xyz"
        assert out["status"] == "queued"

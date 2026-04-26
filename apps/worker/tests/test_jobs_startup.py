"""Startup contract tests for `apps/worker/app/jobs.py`.

The worker MUST refuse to start in production/staging if Celery isn't
importable or `CELERY_BROKER_URL` is unset — silently falling back to the
inline noop decorator caused long EEG/MRI/DeepTwin jobs to block the API
thread (or never run) with no log signal. These tests pin the contract so the
fail-closed behaviour cannot regress.

We re-import `app.jobs` after each env mutation via `importlib.reload` so the
module-level guards re-execute against the patched environment.
"""
from __future__ import annotations

import importlib
import logging
import sys
import types
from typing import Iterator

import pytest


# `app` here resolves to `apps/worker/app` because conftest.py prepends
# `apps/worker` to sys.path. Anything elsewhere in the test tree that imports
# `app.<x>` would clash; the worker test suite stays isolated by design.
JOBS_MODULE = "app.jobs"


@pytest.fixture(autouse=True)
def _clean_modules() -> Iterator[None]:
    """Drop cached `app.jobs` (and any injected fake `celery`) between tests.

    Without this each test would see the previous test's module-level state
    (which celery_app got built, which env vars were live at import time).
    """
    saved_jobs = sys.modules.pop(JOBS_MODULE, None)
    saved_celery = sys.modules.pop("celery", None)
    try:
        yield
    finally:
        sys.modules.pop(JOBS_MODULE, None)
        sys.modules.pop("celery", None)
        if saved_jobs is not None:
            sys.modules[JOBS_MODULE] = saved_jobs
        if saved_celery is not None:
            sys.modules["celery"] = saved_celery


def _install_fake_celery() -> type:
    """Inject a minimal `celery` module so `from celery import Celery` works.

    The real `celery` package isn't a worker test dependency — we only need a
    stand-in that exposes a `Celery` class with a `.task` decorator so the
    decorated jobs in `app.jobs` import without raising.
    """

    class _FakeCelery:
        def __init__(self, name: str, broker: str = "", backend: str = "") -> None:
            self.name = name
            self.broker = broker
            self.backend = backend

        def task(self, *dargs, **dkwargs):
            if len(dargs) == 1 and callable(dargs[0]) and not dkwargs:
                return dargs[0]

            def _decorator(fn):
                return fn

            return _decorator

    fake_module = types.ModuleType("celery")
    fake_module.Celery = _FakeCelery  # type: ignore[attr-defined]
    sys.modules["celery"] = fake_module
    return _FakeCelery


def _import_jobs():
    """Force a fresh import of `app.jobs`."""
    sys.modules.pop(JOBS_MODULE, None)
    return importlib.import_module(JOBS_MODULE)


# ---------------------------------------------------------------------------
# Production / staging: fail-closed
# ---------------------------------------------------------------------------


def test_production_without_broker_url_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Production + no CELERY_BROKER_URL must raise RuntimeError at import time."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    monkeypatch.delenv("CELERY_RESULT_BACKEND", raising=False)
    # Ensure celery is importable so we hit the broker-missing branch, not the
    # celery-missing one. (Both must fail — covered by the next test.)
    _install_fake_celery()

    with pytest.raises(RuntimeError, match="refusing to start with noop fallback"):
        _import_jobs()


def test_staging_without_broker_url_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Staging gets the same fail-closed treatment as production."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "staging")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    monkeypatch.delenv("CELERY_RESULT_BACKEND", raising=False)
    _install_fake_celery()

    with pytest.raises(RuntimeError, match="refusing to start with noop fallback"):
        _import_jobs()


def test_production_without_celery_import_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """If Celery isn't installed at all, production must refuse to boot too."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://broker.example.com:6379/0")
    # Block celery import even if it happens to be installed in the test env.
    sys.modules.pop("celery", None)
    real_import = __import__

    def _blocking_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "celery" or name.startswith("celery."):
            raise ImportError("celery not installed (simulated)")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", _blocking_import)

    with pytest.raises(RuntimeError, match="refusing to start with noop fallback"):
        _import_jobs()


# ---------------------------------------------------------------------------
# Development / test: noop fallback allowed
# ---------------------------------------------------------------------------


def test_development_without_broker_url_uses_noop_with_warning(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Dev env must permit noop fallback but log a WARNING so it's not silent."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "development")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    _install_fake_celery()

    with caplog.at_level(logging.WARNING, logger="app.jobs"):
        jobs = _import_jobs()

    assert type(jobs.celery_app).__name__ == "_NoopCeleryApp"
    warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("noop fallback" in r.getMessage() for r in warning_records), (
        f"expected a WARNING about the noop fallback; got: {[r.getMessage() for r in warning_records]}"
    )


def test_test_env_without_broker_url_imports_cleanly(monkeypatch: pytest.MonkeyPatch) -> None:
    """The pytest env (DEEPSYNAPS_APP_ENV=test) must import without error."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    _install_fake_celery()

    jobs = _import_jobs()
    assert type(jobs.celery_app).__name__ == "_NoopCeleryApp"


# ---------------------------------------------------------------------------
# Broker URL set: real Celery is wired up regardless of env
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("env", ["development", "test", "staging", "production"])
def test_broker_url_set_uses_real_celery(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    """When CELERY_BROKER_URL is set and celery imports, we get the real app."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", env)
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://user:secret@broker.example.com:6380/0")
    monkeypatch.delenv("CELERY_RESULT_BACKEND", raising=False)
    fake_celery_cls = _install_fake_celery()

    jobs = _import_jobs()
    assert isinstance(jobs.celery_app, fake_celery_cls)
    # Backend should default to broker URL when CELERY_RESULT_BACKEND is unset.
    assert jobs.celery_app.broker == "redis://user:secret@broker.example.com:6380/0"
    assert jobs.celery_app.backend == "redis://user:secret@broker.example.com:6380/0"


def test_broker_credentials_are_not_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """The INFO log line must show host[:port] only — never user/password/path."""
    monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "production")
    monkeypatch.setenv(
        "CELERY_BROKER_URL", "redis://celery_user:hunter2@broker.example.com:6380/3"
    )
    _install_fake_celery()

    with caplog.at_level(logging.INFO, logger="app.jobs"):
        _import_jobs()

    info_messages = "\n".join(
        r.getMessage() for r in caplog.records if r.levelno == logging.INFO
    )
    assert "broker.example.com:6380" in info_messages
    assert "hunter2" not in info_messages
    assert "celery_user" not in info_messages

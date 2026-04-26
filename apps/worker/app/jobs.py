"""Background worker tasks."""
from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel

_log = logging.getLogger(__name__)


class RenderJob(BaseModel):
    job_id: str
    output_type: str
    protocol_id: str


def enqueue_render_job(job: RenderJob) -> dict[str, str]:
    return {"status": "queued", "job_id": job.job_id}


try:
    from app.deeptwin_simulation import DeeptwinSimulationJob, run_deeptwin_simulation
except Exception:  # pragma: no cover
    DeeptwinSimulationJob = None  # type: ignore[assignment]
    run_deeptwin_simulation = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Celery wiring — fail-closed in production/staging
# ---------------------------------------------------------------------------
#
# Background: in production the worker MUST run jobs asynchronously through
# Celery + Redis. The previous implementation wrapped Celery import in a
# blanket try/except and substituted a `_NoopCeleryApp` whose `.task` decorator
# returned the wrapped function unchanged. That made every `.delay(...)` call
# raise (since the noop function has no `.delay`) — but worse, any `.apply()`
# / direct call would silently run inline on the API thread and block long
# EEG/MRI/DeepTwin pipelines, with zero log signal.
#
# Policy:
#   * production / staging  → REQUIRE celery import AND CELERY_BROKER_URL.
#                             Raise at module import time if either is
#                             missing. Worker process refuses to start.
#   * development / test    → noop fallback is allowed (so local + CI tests
#                             don't need a Redis broker), but emit a WARNING
#                             so it can't be missed.
#
# We never log the full broker URL — it commonly carries credentials. Only the
# host (and optionally the port) is emitted at INFO.
# ---------------------------------------------------------------------------

_APP_ENV = os.environ.get("DEEPSYNAPS_APP_ENV", "development").strip().lower()
_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "").strip()
_BACKEND_URL = os.environ.get("CELERY_RESULT_BACKEND", "").strip()
_REQUIRE_REAL_CELERY = _APP_ENV in ("production", "staging")


def _broker_host(url: str) -> str:
    """Return the host[:port] of a broker URL — never include credentials."""
    if not url:
        return "<unset>"
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "<unknown>"
        if parsed.port:
            return f"{host}:{parsed.port}"
        return host
    except Exception:  # pragma: no cover — defensive only
        return "<unparseable>"


class _NoopCeleryApp:
    """Decorator-only stand-in for Celery in development / test environments.

    Returns the wrapped function unchanged so direct calls still work in unit
    tests. Calling `.delay()` will raise AttributeError — that is intentional;
    tests that need async dispatch must mock it explicitly.
    """

    def task(self, *dargs: Any, **dkwargs: Any) -> Any:
        if len(dargs) == 1 and callable(dargs[0]) and not dkwargs:
            return dargs[0]

        def _decorator(fn: Any) -> Any:
            return fn

        return _decorator


def _build_celery_app() -> Any:
    """Resolve the celery app for this process.

    Fails fast in production/staging when Celery is missing or unconfigured.
    """
    try:
        from celery import Celery  # type: ignore[import-not-found]
    except Exception as exc:
        if _REQUIRE_REAL_CELERY:
            raise RuntimeError(
                "Worker requires Celery + CELERY_BROKER_URL in "
                f"production/staging — refusing to start with noop fallback "
                f"(celery import failed: {exc})"
            ) from exc
        _log.warning(
            "Celery not importable; using noop fallback (app_env=%s). "
            "This is only safe in development/test — jobs will NOT run async.",
            _APP_ENV,
        )
        return _NoopCeleryApp()

    if not _BROKER_URL:
        if _REQUIRE_REAL_CELERY:
            raise RuntimeError(
                "Worker requires Celery + CELERY_BROKER_URL in "
                "production/staging — refusing to start with noop fallback "
                "(CELERY_BROKER_URL is not set)"
            )
        _log.warning(
            "CELERY_BROKER_URL not set; using noop fallback (app_env=%s). "
            "This is only safe in development/test — jobs will NOT run async.",
            _APP_ENV,
        )
        return _NoopCeleryApp()

    backend = _BACKEND_URL or _BROKER_URL
    app = Celery(
        "deepsynaps_worker",
        broker=_BROKER_URL,
        backend=backend,
    )
    _log.info("Celery wired: broker=%s", _broker_host(_BROKER_URL))
    return app


celery_app: Any = _build_celery_app()


@celery_app.task(name="deepsynaps.qeeg.run_mne_pipeline", bind=False)
def run_mne_pipeline_job(analysis_id: str) -> dict[str, Any]:
    """Worker wrapper around the shared MNE pipeline job implementation."""
    try:
        from app.services.qeeg_pipeline_job import run_mne_pipeline_job_sync  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover
        _log.exception("run_mne_pipeline_job: import failure")
        return {"analysis_id": analysis_id, "status": "failed", "error": f"import failed: {exc}"}

    return run_mne_pipeline_job_sync(analysis_id)


@celery_app.task(name="deepsynaps.deeptwin.simulate", bind=False)
def deeptwin_simulation_job(payload: dict[str, Any]) -> dict[str, Any]:
    if DeeptwinSimulationJob is None or run_deeptwin_simulation is None:  # pragma: no cover
        return {"status": "failed", "error": "deeptwin simulation job unavailable"}
    job = DeeptwinSimulationJob.model_validate(payload)
    return run_deeptwin_simulation(job)


@celery_app.task(name="deepsynaps.qeeg.run_mne_pipeline_custom", bind=False)
def run_mne_pipeline_custom_job(analysis_id: str) -> dict[str, Any]:
    """Worker wrapper for re-running the MNE pipeline with user cleaning overrides."""
    try:
        from app.services.eeg_signal_service import run_custom_pipeline_sync  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover
        _log.exception("run_mne_pipeline_custom_job: import failure")
        return {"analysis_id": analysis_id, "status": "failed", "error": f"import failed: {exc}"}

    return run_custom_pipeline_sync(analysis_id)


__all__ = [
    "RenderJob",
    "enqueue_render_job",
    "run_mne_pipeline_job",
    "run_mne_pipeline_custom_job",
    "deeptwin_simulation_job",
    "celery_app",
]

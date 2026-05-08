"""API-owned Celery entrypoints for qEEG/ERP background work.

This avoids importing through ``apps.worker.app.jobs`` from the API package,
which is brittle in deploy/runtime contexts where ``apps/api`` and
``apps/worker`` expose different top-level ``app`` packages.
"""
from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlparse

_log = logging.getLogger(__name__)

_APP_ENV = os.environ.get("DEEPSYNAPS_APP_ENV", "development").strip().lower()
_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "").strip()
_BACKEND_URL = os.environ.get("CELERY_RESULT_BACKEND", "").strip()
_DATABASE_URL = os.environ.get("DEEPSYNAPS_DATABASE_URL", "").strip()
_REQUIRE_REAL_CELERY = _APP_ENV in ("production", "staging")


def _database_is_shareable_across_processes(url: str) -> bool:
    """True when the configured DB can be opened from multiple machines/processes.

    SQLite databases live on a single Fly volume that is attached to exactly
    one machine. The ``app`` process group has the production volume mounted
    at ``/data``; the ``qeeg_worker`` process group does not — its ``/data``
    is the empty Docker layer baked into the image. When the worker opens
    ``sqlite:////data/...`` it silently creates a fresh empty file there and
    every ``QEEGAnalysis`` lookup fails with ``no such table: qeeg_analyses``.

    Postgres / MySQL / network-reachable URLs are fine — they are accessible
    from every process group.
    """
    if not url:
        return False
    lowered = url.lower().strip()
    if lowered.startswith("sqlite"):
        return False
    return True


def _broker_host(url: str) -> str:
    if not url:
        return "<unset>"
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "<unknown>"
        if parsed.port:
            return f"{host}:{parsed.port}"
        return host
    except Exception:  # pragma: no cover
        return "<unparseable>"


class _NoopCeleryApp:
    """Decorator-only fallback for development/test environments."""

    def task(self, *dargs: Any, **dkwargs: Any) -> Any:
        if len(dargs) == 1 and callable(dargs[0]) and not dkwargs:
            return dargs[0]

        def _decorator(fn: Any) -> Any:
            return fn

        return _decorator


def _running_as_celery_worker() -> bool:
    """True when this module is being loaded by ``celery ... worker``.

    Celery's CLI puts the literal token ``worker`` (and usually ``-A`` / app
    spec) on ``sys.argv``. Importing ``app.jobs`` from the FastAPI process
    won't have that. We use this distinction to fail loudly on the worker
    side when the DB is unshareable, while letting the API process continue
    to boot (it will fall back to ``BackgroundTasks`` for qEEG dispatch).
    """
    import sys

    argv = " ".join(sys.argv).lower()
    # celery CLI: ``celery -A app.jobs worker --loglevel=INFO ...``
    return "celery" in (sys.argv[0] or "").lower() and "worker" in argv


def _build_celery_app() -> Any:
    try:
        from celery import Celery  # type: ignore[import-not-found]
    except Exception as exc:
        if _REQUIRE_REAL_CELERY:
            raise RuntimeError(
                "API worker requires Celery + CELERY_BROKER_URL in "
                "production/staging — refusing noop fallback "
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
                "API worker requires Celery + CELERY_BROKER_URL in "
                "production/staging — refusing noop fallback "
                "(CELERY_BROKER_URL is not set)"
            )
        _log.warning(
            "CELERY_BROKER_URL not set; using noop fallback (app_env=%s). "
            "This is only safe in development/test — jobs will NOT run async.",
            _APP_ENV,
        )
        return _NoopCeleryApp()

    # Cross-process DB reachability gate.
    #
    # The qeeg_worker process group runs on a separate Fly machine that does
    # NOT have the production ``deepsynaps_data`` volume mounted (only the
    # ``app`` process group does — see ``apps/api/fly.toml``). When
    # DEEPSYNAPS_DATABASE_URL is a SQLite path under ``/data``, the worker
    # opens an empty fresh file inside its own writable layer and every
    # ``QEEGAnalysis`` lookup fails with ``no such table: qeeg_analyses``.
    #
    # Two outcomes depending on which process is importing this module:
    #  - Worker (``celery ... worker``): RAISE so the worker crash-loops with
    #    a clear message instead of silently failing every analysis. Ops can
    #    then either point the worker at a network DB (Postgres) or stop the
    #    worker process group until they migrate.
    #  - API: log a loud warning and return the noop Celery app so the
    #    qEEG router falls back to ``BackgroundTasks.add_task`` — those run
    #    in the API process which DOES have the production DB.
    if not _database_is_shareable_across_processes(_DATABASE_URL):
        msg = (
            "DEEPSYNAPS_DATABASE_URL is a SQLite path "
            f"({_DATABASE_URL or '<unset>'!r}) which lives on a single Fly "
            "volume and cannot be shared with the qeeg_worker process group. "
            "Async qEEG jobs would run against an empty database on the "
            "worker. Refusing to wire Celery — point DEEPSYNAPS_DATABASE_URL "
            "at a network-reachable database (e.g. Postgres) to enable async "
            "workers. The API will continue to dispatch qEEG analyses via "
            "FastAPI BackgroundTasks in-process."
        )
        if _running_as_celery_worker():
            # Crash-loop with a clear error rather than silently corrupting
            # every analysis the broker hands us.
            raise RuntimeError(msg)
        _log.warning(msg)
        return _NoopCeleryApp()

    backend = _BACKEND_URL or _BROKER_URL
    app = Celery(
        "deepsynaps_api_worker",
        broker=_BROKER_URL,
        backend=backend,
    )
    _log.info("Celery wired for API jobs: broker=%s", _broker_host(_BROKER_URL))
    return app


celery_app: Any = _build_celery_app()


@celery_app.task(name="deepsynaps.qeeg.run_mne_pipeline", bind=False)
def run_mne_pipeline_job(analysis_id: str) -> dict[str, Any]:
    try:
        from app.services.qeeg_pipeline_job import run_mne_pipeline_job_sync
    except Exception as exc:  # pragma: no cover
        _log.exception("run_mne_pipeline_job import failure")
        return {"analysis_id": analysis_id, "status": "failed", "error": f"import failed: {exc}"}

    return run_mne_pipeline_job_sync(analysis_id)


@celery_app.task(name="deepsynaps.qeeg.run_mne_pipeline_custom", bind=False)
def run_mne_pipeline_custom_job(analysis_id: str) -> dict[str, Any]:
    try:
        from app.services.eeg_signal_service import run_custom_pipeline_sync
    except Exception as exc:  # pragma: no cover
        _log.exception("run_mne_pipeline_custom_job import failure")
        return {"analysis_id": analysis_id, "status": "failed", "error": f"import failed: {exc}"}

    return run_custom_pipeline_sync(analysis_id)


@celery_app.task(name="deepsynaps.qeeg.run_erp_pipeline", bind=False)
def run_erp_pipeline_job(
    analysis_id: str, job_id: str, request_payload: dict[str, Any]
) -> dict[str, Any]:
    try:
        from app.services.erp_service import run_erp_job_sync
    except Exception as exc:  # pragma: no cover
        _log.exception("run_erp_pipeline_job import failure")
        return {
            "analysis_id": analysis_id,
            "job_id": job_id,
            "status": "failed",
            "error": f"import failed: {exc}",
        }

    return run_erp_job_sync(analysis_id, job_id, request_payload)


__all__ = [
    "celery_app",
    "run_mne_pipeline_job",
    "run_mne_pipeline_custom_job",
    "run_erp_pipeline_job",
]

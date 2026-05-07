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
_REQUIRE_REAL_CELERY = _APP_ENV in ("production", "staging")


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

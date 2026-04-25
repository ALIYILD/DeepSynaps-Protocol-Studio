"""Background worker tasks."""
from __future__ import annotations

import logging
from typing import Any

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


try:
    from celery import Celery  # type: ignore[import-not-found]

    celery_app: Any = Celery(
        "deepsynaps_worker",
        broker=__import__("os").environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
        backend=__import__("os").environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    )
except Exception:  # pragma: no cover
    class _NoopCeleryApp:
        def task(self, *dargs: Any, **dkwargs: Any) -> Any:
            if len(dargs) == 1 and callable(dargs[0]) and not dkwargs:
                return dargs[0]

            def _decorator(fn: Any) -> Any:
                return fn

            return _decorator

    celery_app = _NoopCeleryApp()


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


__all__ = [
    "RenderJob",
    "enqueue_render_job",
    "run_mne_pipeline_job",
    "deeptwin_simulation_job",
    "celery_app",
]

"""Background worker tasks.

Today this module just holds a small placeholder queue contract; the qEEG
MNE-pipeline task below is wired as a normal Celery task-shaped callable so
it can be imported and unit-tested even in environments where Celery +
Redis are not yet installed. When Celery is available the module registers
the task on the app; otherwise the ``run_mne_pipeline_job`` symbol still
exists as a plain callable so the API / tests can import it.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

_log = logging.getLogger(__name__)


# ── Legacy render-job placeholder ───────────────────────────────────────────


class RenderJob(BaseModel):
    job_id: str
    output_type: str
    protocol_id: str


def enqueue_render_job(job: RenderJob) -> dict[str, str]:
    # TODO: replace this placeholder with a durable queue integration.
    return {"status": "queued", "job_id": job.job_id}


# ── Celery app shim ─────────────────────────────────────────────────────────
# Studio does not yet run a real Celery worker; when Celery is installed we
# register the task on a dedicated app, otherwise we expose a no-op decorator
# so the function signature + import path stay identical.

try:
    from celery import Celery  # type: ignore[import-not-found]

    _HAS_CELERY = True
    celery_app: Any = Celery(
        "deepsynaps_worker",
        broker=os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0"),
        backend=os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
    )
except Exception:  # pragma: no cover — Celery optional
    _HAS_CELERY = False

    class _NoopCeleryApp:
        def task(self, *dargs: Any, **dkwargs: Any) -> Any:
            # Support both @celery_app.task and @celery_app.task(name=...)
            if len(dargs) == 1 and callable(dargs[0]) and not dkwargs:
                return dargs[0]

            def _decorator(fn: Any) -> Any:
                return fn

            return _decorator

    celery_app = _NoopCeleryApp()


# ── qEEG MNE pipeline task ──────────────────────────────────────────────────


@celery_app.task(name="deepsynaps.qeeg.run_mne_pipeline", bind=False)
def run_mne_pipeline_job(analysis_id: str) -> dict[str, Any]:
    """Celery task: run the MNE pipeline for an uploaded qEEG analysis.

    Parameters
    ----------
    analysis_id
        Primary key of the :class:`app.persistence.models.QEEGAnalysis` row.

    Returns
    -------
    dict
        ``{"analysis_id": str, "status": "completed" | "failed", "error": str | None}``

    Notes
    -----
    * Structured as a normal Celery task even though Studio's current
      deployment doesn't run a Redis-backed worker — this keeps the surface
      stable for when the worker deploy lands.
    * All I/O (DB + media storage + MNE pipeline) is synchronous; the
      underlying async helpers (``media_storage.read_upload``) are driven
      through an event loop because Celery workers are thread-based.
    * Never raises — always returns a structured status dict so the
      scheduler can surface the error cleanly.
    """
    # Local imports keep the module importable in test environments that
    # don't have the full API app on the path.
    try:
        from app.database import SessionLocal  # type: ignore[import-not-found]
        from app.persistence.models import QEEGAnalysis  # type: ignore[import-not-found]
        from app.services import media_storage  # type: ignore[import-not-found]
        from app.services.qeeg_pipeline import run_pipeline_safe  # type: ignore[import-not-found]
        from app.services.spectral_analysis import (  # type: ignore[import-not-found]
            compute_band_powers_from_pipeline,
        )
        from app.settings import get_settings  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover — import failure at worker boot
        _log.exception("run_mne_pipeline_job: import failure")
        return {"analysis_id": analysis_id, "status": "failed", "error": f"import failed: {exc}"}

    session = SessionLocal()
    tmp_path: str | None = None
    try:
        analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
        if analysis is None:
            return {
                "analysis_id": analysis_id,
                "status": "failed",
                "error": "analysis_not_found",
            }

        analysis.analysis_status = "processing:mne_pipeline"
        analysis.analysis_error = None
        session.commit()

        settings = get_settings()

        # `media_storage.read_upload` is async — run it synchronously here.
        import asyncio

        file_bytes = asyncio.run(media_storage.read_upload(analysis.file_ref, settings))

        ext = ""
        if analysis.original_filename and "." in analysis.original_filename:
            ext = "." + analysis.original_filename.rsplit(".", 1)[-1].lower()

        with tempfile.NamedTemporaryFile(suffix=ext or ".edf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        result = run_pipeline_safe(tmp_path)

        if not result.get("success"):
            analysis.analysis_status = "failed"
            analysis.analysis_error = str(result.get("error", "pipeline failed"))[:500]
            session.commit()
            return {
                "analysis_id": analysis_id,
                "status": "failed",
                "error": analysis.analysis_error,
            }

        features = result.get("features") or {}
        zscores = result.get("zscores") or {}
        quality = result.get("quality") or {}
        flagged = list(result.get("flagged_conditions") or [])

        spectral = features.get("spectral") or {}
        analysis.aperiodic_json = json.dumps(spectral.get("aperiodic") or {})
        analysis.peak_alpha_freq_json = json.dumps(spectral.get("peak_alpha_freq") or {})
        analysis.connectivity_json = json.dumps(features.get("connectivity") or {})
        analysis.asymmetry_json = json.dumps(features.get("asymmetry") or {})
        analysis.graph_metrics_json = json.dumps(features.get("graph") or {})
        analysis.source_roi_json = json.dumps(features.get("source") or {})
        analysis.normative_zscores_json = json.dumps(zscores)
        analysis.flagged_conditions = json.dumps(flagged)
        analysis.quality_metrics_json = json.dumps(quality)
        analysis.pipeline_version = (str(quality.get("pipeline_version") or "")[:16]) or None
        analysis.norm_db_version = (str(zscores.get("norm_db_version") or "")[:16]) or None

        # Legacy backfill
        legacy_bands = compute_band_powers_from_pipeline(features)
        if quality.get("sfreq_output"):
            try:
                legacy_bands["global_summary"]["sample_rate_hz"] = float(quality["sfreq_output"])
            except (TypeError, ValueError):
                pass
        analysis.band_powers_json = json.dumps(legacy_bands)

        legacy_rejection = {
            "source": "mne_pipeline",
            "rejected_channels": list(quality.get("bad_channels") or []),
            "total_channels": int(quality.get("n_channels_input") or 0),
            "clean_channels": max(
                0,
                int(quality.get("n_channels_input") or 0)
                - int(quality.get("n_channels_rejected") or 0),
            ),
            "epochs_total": int(quality.get("n_epochs_total") or 0),
            "epochs_retained": int(quality.get("n_epochs_retained") or 0),
            "ica_components_dropped": int(quality.get("ica_components_dropped") or 0),
            "ica_labels_dropped": dict(quality.get("ica_labels_dropped") or {}),
            "bandpass": list(quality.get("bandpass") or []),
            "notch_hz": quality.get("notch_hz"),
        }
        analysis.artifact_rejection_json = json.dumps(legacy_rejection)

        if quality.get("sfreq_output"):
            try:
                analysis.sample_rate_hz = float(quality["sfreq_output"])
            except (TypeError, ValueError):
                pass

        analysis.analysis_status = "completed"
        analysis.analyzed_at = datetime.now(timezone.utc)
        session.commit()

        _log.info(
            "run_mne_pipeline_job: completed %s (pipeline_version=%s, flagged=%s)",
            analysis_id,
            analysis.pipeline_version,
            flagged,
        )
        return {"analysis_id": analysis_id, "status": "completed", "error": None}

    except Exception as exc:
        _log.exception("run_mne_pipeline_job failed for %s", analysis_id)
        try:
            analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
            if analysis is not None:
                analysis.analysis_status = "failed"
                analysis.analysis_error = str(exc)[:500]
                session.commit()
        except Exception:  # pragma: no cover — secondary commit failure
            session.rollback()
        return {"analysis_id": analysis_id, "status": "failed", "error": str(exc)}

    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        session.close()


__all__ = [
    "RenderJob",
    "enqueue_render_job",
    "run_mne_pipeline_job",
    "celery_app",
]

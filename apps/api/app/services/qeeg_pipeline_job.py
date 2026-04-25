"""Shared qEEG MNE pipeline job implementation."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from app.database import SessionLocal
from app.persistence.models import QEEGAnalysis
from app.services import media_storage
from app.services.qeeg_pipeline import run_pipeline_safe
from app.services.spectral_analysis import compute_band_powers_from_pipeline
from app.settings import get_settings

_log = logging.getLogger(__name__)


def run_mne_pipeline_job_sync(analysis_id: str) -> dict[str, Any]:
    """Run the MNE pipeline and persist results for one analysis."""
    session = SessionLocal()
    tmp_path: str | None = None
    try:
        analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
        if analysis is None:
            return {"analysis_id": analysis_id, "status": "failed", "error": "analysis_not_found"}

        analysis.analysis_status = "processing:mne_pipeline"
        analysis.analysis_error = None
        session.commit()

        settings = get_settings()
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
            return {"analysis_id": analysis_id, "status": "failed", "error": analysis.analysis_error}

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

        legacy_bands = compute_band_powers_from_pipeline(features)
        if quality.get("sfreq_output"):
            try:
                legacy_bands["global_summary"]["sample_rate_hz"] = float(quality["sfreq_output"])
            except (TypeError, ValueError):
                pass
        analysis.band_powers_json = json.dumps(legacy_bands)

        analysis.artifact_rejection_json = json.dumps({
            "source": "mne_pipeline",
            "rejected_channels": list(quality.get("bad_channels") or []),
            "total_channels": int(quality.get("n_channels_input") or 0),
            "clean_channels": max(0, int(quality.get("n_channels_input") or 0) - int(quality.get("n_channels_rejected") or 0)),
            "epochs_total": int(quality.get("n_epochs_total") or 0),
            "epochs_retained": int(quality.get("n_epochs_retained") or 0),
            "ica_components_dropped": int(quality.get("ica_components_dropped") or 0),
            "ica_labels_dropped": dict(quality.get("ica_labels_dropped") or {}),
            "bandpass": list(quality.get("bandpass") or []),
            "notch_hz": quality.get("notch_hz"),
        })

        if quality.get("sfreq_output"):
            try:
                analysis.sample_rate_hz = float(quality["sfreq_output"])
            except (TypeError, ValueError):
                pass

        analysis.analysis_status = "completed"
        analysis.analyzed_at = datetime.now(timezone.utc)
        session.commit()
        return {"analysis_id": analysis_id, "status": "completed", "error": None}
    except Exception as exc:
        _log.exception("run_mne_pipeline_job_sync failed for %s", analysis_id)
        try:
            analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
            if analysis is not None:
                analysis.analysis_status = "failed"
                analysis.analysis_error = str(exc)[:500]
                session.commit()
        except Exception:
            session.rollback()
        return {"analysis_id": analysis_id, "status": "failed", "error": str(exc)}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        session.close()

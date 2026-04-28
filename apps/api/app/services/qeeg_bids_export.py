"""BIDS-style export package builder for qEEG analyses.

Generates a zip containing raw metadata, sidecars, preprocessing logs,
annotations, analysis results, AI reports, clinician review state, and audit trail.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.errors import ApiServiceError
from app.persistence.models import QEEGAIReport, QEEGAnalysis, QEEGReportAudit
from app.services.media_storage import read_upload
from app.services.qeeg_clinician_review import can_export
from app.settings import get_settings

_log = logging.getLogger(__name__)


def build_bids_package(
    analysis_id: str,
    actor: AuthenticatedActor,
    db: Session,
) -> io.BytesIO:
    """Build a BIDS-style zip package for a qEEG analysis.

    Gated: requires signed-off report.
    """
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    report = (
        db.query(QEEGAIReport)
        .filter_by(analysis_id=analysis_id)
        .order_by(QEEGAIReport.created_at.desc())
        .first()
    )
    if report and not can_export(report):
        _log.warning(
            "qeeg_bids_export_denied",
            extra={
                "event": "qeeg_bids_export_denied",
                "analysis_id": analysis_id,
                "report_id": report.id,
                "report_state": report.report_state,
                "signed_by": report.signed_by is not None,
                "actor_id": actor.actor_id,
                "actor_role": actor.role,
            },
        )
        raise ApiServiceError(
            code="export_not_allowed",
            message="Report must be approved and signed off before export.",
            status_code=403,
        )

    sub_id = _pseudonymize_subject(analysis.patient_id)
    task = "rest"
    run = "01"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # dataset_description.json
        zf.writestr(
            "dataset_description.json",
            _json_dumps({
                "Name": "DeepSynaps Clinical qEEG Package",
                "BIDSVersion": "1.9.0",
                "DatasetType": "raw",
                "Authors": ["DeepSynaps Protocol Studio"],
                "GeneratedOn": timestamp,
                "Acknowledgements": "Decision-support only. Requires clinician review. Not a diagnosis.",
            }),
        )

        # participants.json + participants.tsv
        zf.writestr(
            "participants.json",
            _json_dumps({
                "participant_id": {"Description": "Pseudonymized subject identifier"},
                "age": {"Description": "Age in years", "Units": "years"},
                "sex": {"Description": "Sex", "Levels": {"M": "male", "F": "female"}},
            }),
        )
        zf.writestr("participants.tsv", f"participant_id\tage\tsex\n{sub_id}\tn/a\tn/a\n")

        # EEG sidecar
        sidecar = {
            "TaskName": task,
            "SamplingFrequency": analysis.sample_rate_hz,
            "EEGChannelCount": analysis.channel_count,
            "RecordingDuration": analysis.recording_duration_sec,
            "EEGReference": "unknown",
            "PowerLineFrequency": 50,
            "SoftwareFilters": _json_loads(analysis.analysis_params_json) or {},
        }
        zf.writestr(f"eeg/{sub_id}_task-{task}_run-{run}_eeg.json", _json_dumps(sidecar))

        # Preprocessing parameters
        zf.writestr(
            f"eeg/{sub_id}_task-{task}_run-{run}_desc-preprocessing_parameters.json",
            _json_dumps({
                "pipeline_version": analysis.pipeline_version,
                "norm_db_version": analysis.norm_db_version,
                "analysis_params": _json_loads(analysis.analysis_params_json),
                "quality_metrics": _json_loads(analysis.quality_metrics_json),
            }),
        )

        # Artifact log
        zf.writestr(
            f"eeg/{sub_id}_task-{task}_run-{run}_desc-artifacts_events.tsv",
            _build_artifact_tsv(analysis),
        )

        # Annotations (if any)
        zf.writestr(
            f"eeg/{sub_id}_task-{task}_run-{run}_desc-annotations.json",
            _json_dumps({"notes": "Annotations stored in derivatives/deepsynaps/"}),
        )

        # Derivatives: analysis result JSON
        zf.writestr(
            f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-analysis_result.json",
            _json_dumps({
                "band_powers": _json_loads(analysis.band_powers_json),
                "normative_deviations": _json_loads(analysis.normative_deviations_json),
                "normative_zscores": _json_loads(getattr(analysis, "normative_zscores_json", None)),
                "advanced_analyses": _json_loads(analysis.advanced_analyses_json),
                "source_roi": _json_loads(getattr(analysis, "source_roi_json", None)),
                "quality_metrics": _json_loads(getattr(analysis, "quality_metrics_json", None)),
            }),
        )

        # Derivatives: AI report
        if report:
            zf.writestr(
                f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-ai_report.json",
                _json_dumps({
                    "report_id": report.id,
                    "report_state": report.report_state,
                    "model_used": report.model_used,
                    "model_version": report.model_version,
                    "prompt_version": report.prompt_version,
                    "report_version": report.report_version,
                    "ai_narrative": _json_loads(report.ai_narrative_json),
                    "claim_governance": _json_loads(report.claim_governance_json),
                    "patient_facing_report": _json_loads(report.patient_facing_report_json),
                    "disclaimer": "Decision-support only. Requires clinician review. Not a diagnosis.",
                }),
            )

            # Derivatives: clinician review state
            zf.writestr(
                f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-clinician_review.json",
                _json_dumps({
                    "reviewer_id": report.reviewer_id,
                    "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None,
                    "clinician_reviewed": report.clinician_reviewed,
                    "clinician_amendments": report.clinician_amendments,
                    "signed_by": report.signed_by,
                    "signed_at": report.signed_at.isoformat() if report.signed_at else None,
                }),
            )

            # Derivatives: audit trail
            audits = db.query(QEEGReportAudit).filter_by(report_id=report.id).order_by(QEEGReportAudit.created_at.asc()).all()
            audit_rows = "action\tactor_id\tactor_role\tprevious_state\tnew_state\tnote\tcreated_at\n"
            for a in audits:
                audit_rows += f"{a.action}\t{a.actor_id}\t{a.actor_role}\t{a.previous_state or ''}\t{a.new_state}\t{(a.note or '').replace(chr(9), ' ')}\t{a.created_at.isoformat()}\n"
            zf.writestr(
                f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-audit_trail.tsv",
                audit_rows,
            )

        # Derivatives: safety cockpit
        zf.writestr(
            f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-safety_cockpit.json",
            _json_dumps(_json_loads(analysis.safety_cockpit_json) or {"status": "not_computed"}),
        )

        # Derivatives: red flags
        zf.writestr(
            f"derivatives/deepsynaps/{sub_id}_task-{task}_run-{run}_desc-red_flags.json",
            _json_dumps(_json_loads(analysis.red_flags_json) or {"flags": []}),
        )

    buf.seek(0)
    return buf


def _pseudonymize_subject(patient_id: str) -> str:
    """Return a BIDS-safe pseudonymized subject ID."""
    h = hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:8]
    return f"sub-{h}"


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, indent=2, default=str)


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _build_artifact_tsv(analysis: QEEGAnalysis) -> str:
    artifact = _json_loads(analysis.artifact_rejection_json) or {}
    rows = "onset\tduration\ttrial_type\n"
    bad_segments = artifact.get("bad_segments") or []
    for seg in bad_segments:
        onset = seg.get("start_sec") or seg.get("onset") or 0
        duration = seg.get("duration_sec") or seg.get("duration") or 0
        rows += f"{onset}\t{duration}\tBAD_artifact\n"
    return rows

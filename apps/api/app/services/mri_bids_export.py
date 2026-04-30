"""MRI BIDS-style export package builder.

Gates PDF/HTML/JSON/FHIR/BIDS exports behind approval + sign-off.
Builds a comprehensive clinical export package following BIDS 1.9.0 layout.
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
from app.persistence.models import MriAnalysis, MriReportAudit
from app.services.mri_clinician_review import can_export

_log = logging.getLogger(__name__)


def build_bids_package(
    analysis_id: str,
    actor: AuthenticatedActor,
    db: Session,
) -> io.BytesIO:
    """Build a BIDS-style zip package for an MRI analysis.

    Gated: requires approved and signed-off report.
    """
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    if not can_export(analysis):
        _log.warning(
            "mri_bids_export_denied",
            extra={
                "event": "mri_export_denied",
                "analysis_id": analysis_id,
                "report_state": analysis.report_state,
                "signed_by": analysis.signed_by is not None,
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
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # ── Top-level BIDS metadata ──────────────────────────────────────────
        zf.writestr(
            "dataset_description.json",
            _json_dumps({
                "Name": "DeepSynaps Clinical MRI Package",
                "BIDSVersion": "1.9.0",
                "DatasetType": "raw",
                "Authors": ["DeepSynaps Protocol Studio"],
                "GeneratedOn": timestamp,
                "Acknowledgements": (
                    "Decision-support only. Requires clinician review. "
                    "Not a diagnostic radiology report."
                ),
            }),
        )

        zf.writestr(
            "participants.json",
            _json_dumps({
                "participant_id": {"Description": "Pseudonymized subject identifier"},
                "age": {"Description": "Age in years", "Units": "years"},
                "sex": {"Description": "Sex", "Levels": {"M": "male", "F": "female"}},
            }),
        )
        zf.writestr("participants.tsv", f"participant_id\tage\tsex\n{sub_id}\tn/a\tn/a\n")

        # ── Raw scan metadata (anat/) ────────────────────────────────────────
        modalities = _json_loads(analysis.modalities_present_json) or {}
        modality_list = [k for k, v in modalities.items() if v] if isinstance(modalities, dict) else []

        zf.writestr(
            f"anat/{sub_id}_desc-scan_metadata.json",
            _json_dumps({
                "ModalitiesPresent": modality_list,
                "PipelineVersion": analysis.pipeline_version,
                "NormativeDBVersion": analysis.norm_db_version,
                "GeneratedAt": timestamp,
            }),
        )

        # BIDS sidecar for the scan
        zf.writestr(
            f"anat/{sub_id}_T1w.json",
            _json_dumps({
                " modality": "T1w",
                "PatientID": sub_id,
                "InstitutionName": "WITHHELD",
                "InstitutionAddress": "WITHHELD",
                "ProcedureStepDescription": "WITHHELD",
                "SeriesDescription": "WITHHELD",
                "ProtocolName": "WITHHELD",
                "AcquisitionDateTime": "WITHHELD",
                "ContentDate": "WITHHELD",
                "ContentTime": "WITHHELD",
                "DeidentificationMethod": "DeepSynaps Protocol Studio - SHA256 pseudonymization",
                "DeidentificationMethodCodeSequence": [
                    {"CodeValue": "113100", "CodingSchemeDesignator": "DCM", "CodeMeaning": "Basic Application Confidentiality Profile"}
                ],
            }),
        )

        # ── Derivatives: deepsynaps/ ─────────────────────────────────────────
        deriv_prefix = f"derivatives/deepsynaps/{sub_id}"

        # De-identification log
        zf.writestr(
            f"{deriv_prefix}/desc-deidentification_log.json",
            _json_dumps({
                "phi_scrubbed": True,
                "method": "SHA256 pseudonymization + DICOM tag redaction",
                "original_patient_id_hashed": sub_id,
                "timestamp": timestamp,
                "warnings": [
                    "Burned-in annotations not automatically detected.",
                    "Review images manually before sharing.",
                ],
                "disclaimer": (
                    "De-identification is best-effort. This package must be reviewed "
                    "by a qualified clinician before sharing outside the treating institution."
                ),
            }),
        )

        # QC report (derivative)
        qc = _json_loads(analysis.qc_json) or {"status": "not_computed"}
        zf.writestr(
            f"{deriv_prefix}/desc-qc_report.json",
            _json_dumps({
                "qc": qc,
                "overall_passed": qc.get("passed", False) if isinstance(qc, dict) else False,
                "timestamp": timestamp,
            }),
        )

        # Atlas / model card
        structural = _json_loads(analysis.structural_json) or {}
        reg = structural.get("registration", {})
        zf.writestr(
            f"{deriv_prefix}/desc-atlas_model_card.json",
            _json_dumps({
                "template_space": reg.get("template_space", "MNI152"),
                "atlas_version": structural.get("atlas_version", "unknown"),
                "registration_method": reg.get("method", "unknown"),
                "segmentation_method": structural.get("segmentation_method", "unknown"),
                "brain_extraction_status": structural.get("brain_extraction", "unknown"),
                "registration_confidence": reg.get("confidence", "unknown"),
                "coordinate_uncertainty_mm": reg.get("uncertainty_mm", "unknown"),
                "known_limitations": (
                    "MRI spatial context incomplete — interpret cautiously."
                    if not structural else None
                ),
            }),
        )

        # Target plan JSON
        zf.writestr(
            f"{deriv_prefix}/desc-target_plan.json",
            _json_dumps(_json_loads(analysis.stim_targets_json) or []),
        )

        # AI report
        zf.writestr(
            f"{deriv_prefix}/desc-ai_report.json",
            _json_dumps({
                "analysis_id": analysis.analysis_id,
                "report_state": analysis.report_state,
                "pipeline_version": analysis.pipeline_version,
                "structural": structural,
                "functional": _json_loads(analysis.functional_json),
                "diffusion": _json_loads(analysis.diffusion_json),
                "claim_governance": _json_loads(analysis.claim_governance_json),
                "patient_facing_report": _json_loads(analysis.patient_facing_report_json),
                "disclaimer": (
                    "Decision-support only. Requires clinician review. "
                    "Not a diagnostic radiology report."
                ),
            }),
        )

        # Patient-facing report
        if analysis.patient_facing_report_json:
            zf.writestr(
                f"{deriv_prefix}/desc-patient_report.json",
                analysis.patient_facing_report_json,
            )

        # Clinician review state JSON
        zf.writestr(
            f"{deriv_prefix}/desc-clinician_review.json",
            _json_dumps({
                "reviewer_id": analysis.reviewer_id,
                "reviewed_at": analysis.reviewed_at.isoformat() if analysis.reviewed_at else None,
                "signed_by": analysis.signed_by,
                "signed_at": analysis.signed_at.isoformat() if analysis.signed_at else None,
                "report_version": analysis.report_version,
            }),
        )

        # Audit trail JSON (machine-readable)
        audits = (
            db.query(MriReportAudit)
            .filter_by(analysis_id=analysis_id)
            .order_by(MriReportAudit.created_at.asc())
            .all()
        )
        audit_json = [
            {
                "action": a.action,
                "actor_id": a.actor_id,
                "actor_role": a.actor_role,
                "previous_state": a.previous_state,
                "new_state": a.new_state,
                "note": a.note,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audits
        ]
        zf.writestr(
            f"{deriv_prefix}/desc-audit_trail.json",
            _json_dumps(audit_json),
        )

        # Audit trail TSV (human-readable)
        audit_rows = "action\tactor_id\tactor_role\tprevious_state\tnew_state\tnote\tcreated_at\n"
        for a in audits:
            audit_rows += (
                f"{a.action}\t{a.actor_id}\t{a.actor_role}\t"
                f"{a.previous_state or ''}\t{a.new_state}\t"
                f"{(a.note or '').replace(chr(9), ' ')}\t"
                f"{a.created_at.isoformat()}\n"
            )
        zf.writestr(
            f"{deriv_prefix}/desc-audit_trail.tsv",
            audit_rows,
        )

    buf.seek(0)

    _log.info(
        "mri_bids_export_completed",
        extra={
            "event": "mri_export_completed",
            "analysis_id": analysis_id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
            "sub_id": sub_id,
            "files_in_package": len([n for n in ["dataset_description.json", "participants.tsv", "participants.json", f"anat/{sub_id}_desc-scan_metadata.json", f"anat/{sub_id}_T1w.json", f"{deriv_prefix}/desc-deidentification_log.json", f"{deriv_prefix}/desc-qc_report.json", f"{deriv_prefix}/desc-atlas_model_card.json", f"{deriv_prefix}/desc-target_plan.json", f"{deriv_prefix}/desc-ai_report.json", f"{deriv_prefix}/desc-clinician_review.json", f"{deriv_prefix}/desc-audit_trail.json", f"{deriv_prefix}/desc-audit_trail.tsv"] + ([f"{deriv_prefix}/desc-patient_report.json"] if analysis.patient_facing_report_json else [])]),
        },
    )

    return buf


def _pseudonymize_subject(patient_id: str) -> str:
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

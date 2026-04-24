from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from deepsynaps_core_schema import (
    HandbookGenerateRequest,
    ProtocolDraftRequest,
)

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.clinical_data import (
    generate_handbook_from_clinical_data,
    generate_protocol_draft_from_clinical_data,
)
from app.services.bids_export import build_bids_derivatives_zip
from app.services.fhir_export import build_neuromodulation_fhir_bundle

router = APIRouter(prefix="", tags=["export"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _safe_filename_part(value: str) -> str:
    """Normalize a string to a safe filename segment."""
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_")


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class ExportProtocolDocxRequest(BaseModel):
    condition_name: str
    modality_name: str
    device_name: str
    setting: str = "Clinic"
    evidence_threshold: str = "Systematic Review"
    off_label: bool = False
    symptom_cluster: str = "General"


class ExportHandbookDocxRequest(BaseModel):
    condition_name: str
    modality_name: str
    device_name: str = ""


class ExportPatientGuideDocxRequest(BaseModel):
    condition_name: str
    modality_name: str


class ExportNeuromodulationRequest(BaseModel):
    patient_id: str
    qeeg_analysis_id: str | None = None
    mri_analysis_id: str | None = None


# ---------------------------------------------------------------------------
# Thin adapter so render_protocol_docx can read its expected attributes
# ---------------------------------------------------------------------------

@dataclass
class _ProtocolDocxAdapter:
    condition_name: str
    modality_name: str
    device_name: str
    evidence_grade: str
    approval_badge: str
    contraindications: list[str] = field(default_factory=list)
    safety_checks: list[str] = field(default_factory=list)
    session_structure: object = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/api/v1/export/protocol-docx")
def export_protocol_docx(
    payload: ExportProtocolDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    if actor.role not in ("clinician", "admin"):
        raise HTTPException(status_code=403, detail="Export endpoints require clinician or admin role.")

    draft_request = ProtocolDraftRequest(
        condition=payload.condition_name,
        symptom_cluster=payload.symptom_cluster,
        modality=payload.modality_name,
        device=payload.device_name,
        setting=payload.setting,  # type: ignore[arg-type]
        evidence_threshold=payload.evidence_threshold,  # type: ignore[arg-type]
        off_label=payload.off_label,
    )
    draft = generate_protocol_draft_from_clinical_data(draft_request, actor)

    adapter = _ProtocolDocxAdapter(
        condition_name=payload.condition_name,
        modality_name=payload.modality_name,
        device_name=payload.device_name,
        evidence_grade=draft.evidence_grade,
        approval_badge=draft.approval_status_badge,
        contraindications=[c for c in draft.contraindications if c],
        safety_checks=[c for c in draft.monitoring_plan if c],
    )

    try:
        from deepsynaps_render_engine.renderers import render_protocol_docx
    except ImportError as exc:
        raise ApiServiceError(
            code="render_engine_unavailable",
            message="The render engine package is not installed.",
            warnings=[str(exc)],
            status_code=500,
        ) from exc

    docx_bytes = render_protocol_docx(adapter)

    condition_slug = _safe_filename_part(payload.condition_name)
    modality_slug = _safe_filename_part(payload.modality_name)
    filename = f"protocol_{condition_slug}_{modality_slug}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/handbook-docx")
def export_handbook_docx(
    payload: ExportHandbookDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    if actor.role not in ("clinician", "admin"):
        raise HTTPException(status_code=403, detail="Export endpoints require clinician or admin role.")

    handbook_request = HandbookGenerateRequest(
        handbook_kind="clinician_handbook",
        condition=payload.condition_name,
        modality=payload.modality_name,
    )
    result = generate_handbook_from_clinical_data(handbook_request, actor)
    doc = result.document

    try:
        from deepsynaps_render_engine.renderers import render_protocol_docx
    except ImportError as exc:
        raise ApiServiceError(
            code="render_engine_unavailable",
            message="The render engine package is not installed.",
            warnings=[str(exc)],
            status_code=500,
        ) from exc

    # Build a minimal adapter for render_protocol_docx
    adapter = _ProtocolDocxAdapter(
        condition_name=payload.condition_name,
        modality_name=payload.modality_name,
        device_name=payload.device_name,
        evidence_grade="",
        approval_badge="",
        contraindications=[c for c in doc.safety if c],
        safety_checks=[c for c in doc.session_workflow if c],
    )

    # Build a handbook_plan adapter with sections
    @dataclass
    class _Section:
        title: str
        body: str

    @dataclass
    class _HandbookAdapter:
        sections: list

    sections = []
    if doc.overview:
        sections.append(_Section(title="Overview", body=doc.overview))
    for label, items in [
        ("Eligibility", doc.eligibility),
        ("Setup", doc.setup),
        ("Session Workflow", doc.session_workflow),
        ("Troubleshooting", doc.troubleshooting),
        ("Escalation", doc.escalation),
        ("References", doc.references),
    ]:
        if items:
            sections.append(_Section(title=label, body="\n".join(items)))

    handbook_adapter = _HandbookAdapter(sections=sections)
    docx_bytes = render_protocol_docx(adapter, handbook_plan=handbook_adapter)

    condition_slug = _safe_filename_part(payload.condition_name)
    modality_slug = _safe_filename_part(payload.modality_name)
    filename = f"handbook_{condition_slug}_{modality_slug}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/patient-guide-docx")
def export_patient_guide_docx(
    payload: ExportPatientGuideDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    if actor.role not in ("clinician", "admin"):
        raise HTTPException(status_code=403, detail="Export endpoints require clinician or admin role.")

    # Build protocol draft to extract patient communication notes
    draft_request = ProtocolDraftRequest(
        condition=payload.condition_name,
        symptom_cluster="General",
        modality=payload.modality_name,
        device="",
        setting="Clinic",
        evidence_threshold="Systematic Review",
        off_label=False,
    )

    try:
        draft = generate_protocol_draft_from_clinical_data(draft_request, actor)
        instructions = [n for n in draft.patient_communication_notes if n]
    except ApiServiceError:
        # Fall back to generic instructions if the combination is not in the registry
        instructions = [
            "Your clinician will explain the treatment procedure before each session.",
            "Sessions are typically conducted in a clinic setting.",
            "Report any discomfort or unusual sensations to your clinician immediately.",
            "Follow all preparation instructions provided by your care team.",
        ]

    try:
        from deepsynaps_render_engine.renderers import render_patient_guide_docx
    except ImportError as exc:
        raise ApiServiceError(
            code="render_engine_unavailable",
            message="The render engine package is not installed.",
            warnings=[str(exc)],
            status_code=500,
        ) from exc

    docx_bytes = render_patient_guide_docx(
        condition_name=payload.condition_name,
        modality_name=payload.modality_name,
        instructions=instructions,
    )

    condition_slug = _safe_filename_part(payload.condition_name)
    modality_slug = _safe_filename_part(payload.modality_name)
    filename = f"patient_guide_{condition_slug}_{modality_slug}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/fhir-r4-bundle")
def export_fhir_r4_bundle(
    payload: ExportNeuromodulationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    if actor.role not in ("clinician", "admin"):
        raise HTTPException(status_code=403, detail="Export endpoints require clinician or admin role.")

    bundle = build_neuromodulation_fhir_bundle(
        db,
        payload.patient_id,
        qeeg_analysis_id=payload.qeeg_analysis_id,
        mri_analysis_id=payload.mri_analysis_id,
    )
    filename = f'fhir_bundle_{_safe_filename_part(payload.patient_id)}.json'
    return StreamingResponse(
        BytesIO(json.dumps(bundle, indent=2).encode("utf-8")),
        media_type="application/fhir+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/bids-derivatives")
def export_bids_derivatives(
    payload: ExportNeuromodulationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    if actor.role not in ("clinician", "admin"):
        raise HTTPException(status_code=403, detail="Export endpoints require clinician or admin role.")

    archive_bytes, filename = build_bids_derivatives_zip(
        db,
        payload.patient_id,
        qeeg_analysis_id=payload.qeeg_analysis_id,
        mri_analysis_id=payload.mri_analysis_id,
    )
    return StreamingResponse(
        BytesIO(archive_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

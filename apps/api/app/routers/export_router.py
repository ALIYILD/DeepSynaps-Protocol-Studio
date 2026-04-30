from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from deepsynaps_core_schema import (
    HandbookGenerateRequest,
    ProtocolDraftRequest,
)

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import Patient
from app.repositories.patients import resolve_patient_clinic_id
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


def _assert_export_patient_access(db: Session, actor: AuthenticatedActor, patient_id: str) -> None:
    """Cross-clinic ownership gate for patient-bound export endpoints.

    Pre-fix this used ``patient.clinician_id != actor.actor_id`` which
    over-restricted same-clinic colleagues AND silently allowed access
    to ``clinic_id=None`` orphaned patients via clinician_id alone. The
    canonical fix is to load the patient row first (so a missing id
    surfaces as 404), then route the clinic check through
    ``resolve_patient_clinic_id`` + ``require_patient_owner`` — same
    shape every other patient-scoped router uses.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    if actor.role == "admin":
        return
    _, clinic_id = resolve_patient_clinic_id(db, patient_id)
    require_patient_owner(actor, clinic_id)


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

# Pydantic caps. Pre-fix every str field on every export request was
# uncapped, so an authenticated clinician could send megabyte-scale
# strings that fan out into LLM prompts and DOCX renders.
_EXPORT_NAME_MAX = 200
_EXPORT_TAG_MAX = 80
_PATIENT_ID_MAX = 64


class ExportProtocolDocxRequest(BaseModel):
    condition_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    modality_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    device_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    setting: str = Field(default="Clinic", max_length=_EXPORT_TAG_MAX)
    evidence_threshold: str = Field(default="Systematic Review", max_length=_EXPORT_TAG_MAX)
    off_label: bool = False
    symptom_cluster: str = Field(default="General", max_length=_EXPORT_TAG_MAX)


class ExportHandbookDocxRequest(BaseModel):
    condition_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    modality_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    device_name: str = Field(default="", max_length=_EXPORT_NAME_MAX)


class ExportPatientGuideDocxRequest(BaseModel):
    condition_name: str = Field(..., max_length=_EXPORT_NAME_MAX)
    modality_name: str = Field(..., max_length=_EXPORT_NAME_MAX)


class ExportNeuromodulationRequest(BaseModel):
    patient_id: str = Field(..., max_length=_PATIENT_ID_MAX)
    qeeg_analysis_id: str | None = Field(default=None, max_length=_PATIENT_ID_MAX)
    mri_analysis_id: str | None = Field(default=None, max_length=_PATIENT_ID_MAX)


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
@limiter.limit("10/minute")
def export_protocol_docx(
    request: Request,
    payload: ExportProtocolDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    # Pre-fix this triggered an LLM-backed protocol render with no
    # rate limit — repeat-fire from one authed clinician could burn
    # arbitrary Anthropic spend per minute. 10/min is well above
    # legitimate manual export cadence.
    require_minimum_role(actor, "clinician")

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
@limiter.limit("10/minute")
def export_handbook_docx(
    request: Request,
    payload: ExportHandbookDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    require_minimum_role(actor, "clinician")

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
@limiter.limit("10/minute")
def export_patient_guide_docx(
    request: Request,
    payload: ExportPatientGuideDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    require_minimum_role(actor, "clinician")

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
@limiter.limit("10/minute")
def export_fhir_r4_bundle(
    request: Request,
    payload: ExportNeuromodulationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    # Bulk patient-data archive — heavy DB read fanned out across
    # qEEG + MRI + clinical notes. Patient-data archive generation is
    # the textbook abusable surface; cap per IP at 10/min.
    require_minimum_role(actor, "clinician")
    _assert_export_patient_access(db, actor, payload.patient_id)

    bundle = build_neuromodulation_fhir_bundle(
        db,
        payload.patient_id,
        qeeg_analysis_id=payload.qeeg_analysis_id,
        mri_analysis_id=payload.mri_analysis_id,
    )
    # Use a sanitised slug + a short hash of patient_id rather than
    # the raw patient_id in the Content-Disposition. Pre-fix this
    # echoed the patient_id into the browser's download history /
    # client logs / referer chain.
    import hashlib
    pid_tag = hashlib.sha256(payload.patient_id.encode("utf-8")).hexdigest()[:12]
    filename = f"fhir_bundle_{pid_tag}.json"
    return StreamingResponse(
        BytesIO(json.dumps(bundle, indent=2).encode("utf-8")),
        media_type="application/fhir+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/bids-derivatives")
@limiter.limit("10/minute")
def export_bids_derivatives(
    request: Request,
    payload: ExportNeuromodulationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    require_minimum_role(actor, "clinician")
    _assert_export_patient_access(db, actor, payload.patient_id)

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

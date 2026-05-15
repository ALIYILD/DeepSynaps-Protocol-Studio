from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
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
from app.entitlements import require_any_feature
from app.packages import Feature
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
PDF_MEDIA_TYPE = "application/pdf"


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
    handbook_kind: Literal["clinician_handbook", "patient_guide", "technician_sop"] = "clinician_handbook"


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


_HANDBOOK_KIND_LABEL = {
    "clinician_handbook": "Clinician handbook",
    "patient_guide": "Patient guide",
    "technician_sop": "Technician SOP",
}


def _handbook_bundle_export_context(
    payload: ExportHandbookDocxRequest,
    actor: AuthenticatedActor,
):
    """Regenerate handbook + structured report and registry-backed protocol draft meta."""
    handbook_request = HandbookGenerateRequest(
        handbook_kind=payload.handbook_kind,
        condition=payload.condition_name,
        modality=payload.modality_name,
        device=payload.device_name or "",
    )
    result = generate_handbook_from_clinical_data(handbook_request, actor)

    draft_request = ProtocolDraftRequest(
        condition=payload.condition_name,
        symptom_cluster="General",
        modality=payload.modality_name,
        device=payload.device_name or "",
        setting="Clinic",
        evidence_threshold="Systematic Review",
        off_label=False,
    )
    evidence_grade = ""
    approval_badge = ""
    try:
        draft = generate_protocol_draft_from_clinical_data(draft_request, actor)
        evidence_grade = draft.evidence_grade or ""
        approval_badge = draft.approval_status_badge or ""
    except ApiServiceError:
        pass

    generated_at = datetime.now(timezone.utc).isoformat()
    if result.detailed_report is not None and getattr(result.detailed_report, "generated_at", None):
        generated_at = str(result.detailed_report.generated_at)

    kind_label = _HANDBOOK_KIND_LABEL.get(payload.handbook_kind, payload.handbook_kind)
    return result, evidence_grade, approval_badge, generated_at, kind_label


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
    require_any_feature(
        actor.package_id,
        Feature.HANDBOOK_GENERATE_FULL,
        Feature.HANDBOOK_GENERATE_LIMITED,
        message="Handbook export requires Resident / Fellow or higher.",
    )

    try:
        from deepsynaps_render_engine.handbook_bundle import render_handbook_bundle_docx
    except ImportError as exc:
        raise ApiServiceError(
            code="render_engine_unavailable",
            message="The render engine package is not installed.",
            warnings=[str(exc)],
            status_code=500,
        ) from exc

    result, evidence_grade, approval_badge, generated_at, kind_label = _handbook_bundle_export_context(
        payload, actor
    )

    docx_bytes = render_handbook_bundle_docx(
        result.document,
        result.detailed_report,
        condition_name=payload.condition_name,
        modality_name=payload.modality_name,
        device_name=payload.device_name or "",
        handbook_kind_label=kind_label,
        evidence_grade=evidence_grade,
        approval_badge=approval_badge,
        generated_at=generated_at,
    )

    condition_slug = _safe_filename_part(payload.condition_name)
    modality_slug = _safe_filename_part(payload.modality_name)
    filename = f"handbook_bundle_{condition_slug}_{modality_slug}.docx"

    return StreamingResponse(
        BytesIO(docx_bytes),
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/v1/export/handbook-pdf")
@limiter.limit("10/minute")
def export_handbook_pdf(
    request: Request,
    payload: ExportHandbookDocxRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """PDF bundle — requires WeasyPrint + system libs on the API host."""
    require_minimum_role(actor, "clinician")
    require_any_feature(
        actor.package_id,
        Feature.HANDBOOK_GENERATE_FULL,
        Feature.HANDBOOK_GENERATE_LIMITED,
        message="Handbook export requires Resident / Fellow or higher.",
    )

    try:
        from deepsynaps_render_engine.handbook_bundle import render_handbook_bundle_pdf
        from deepsynaps_render_engine.renderers import PdfRendererUnavailable
    except ImportError as exc:
        raise ApiServiceError(
            code="render_engine_unavailable",
            message="The render engine package is not installed.",
            warnings=[str(exc)],
            status_code=500,
        ) from exc

    result, evidence_grade, approval_badge, generated_at, kind_label = _handbook_bundle_export_context(
        payload, actor
    )

    try:
        pdf_bytes = render_handbook_bundle_pdf(
            result.document,
            result.detailed_report,
            condition_name=payload.condition_name,
            modality_name=payload.modality_name,
            device_name=payload.device_name or "",
            handbook_kind_label=kind_label,
            evidence_grade=evidence_grade,
            approval_badge=approval_badge,
            generated_at=generated_at,
        )
    except PdfRendererUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={
                "code": "pdf_renderer_unavailable",
                "available": False,
                "format": "pdf",
                "message": str(exc),
            },
        )

    condition_slug = _safe_filename_part(payload.condition_name)
    modality_slug = _safe_filename_part(payload.modality_name)
    filename = f"handbook_bundle_{condition_slug}_{modality_slug}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type=PDF_MEDIA_TYPE,
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
    require_any_feature(
        actor.package_id,
        Feature.HANDBOOK_GENERATE_FULL,
        Feature.HANDBOOK_GENERATE_LIMITED,
        message="Patient guide export requires Resident / Fellow or higher.",
    )

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

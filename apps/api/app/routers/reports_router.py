"""
Reports router — clinical report upload and AI summarization endpoints.
Supports the frontend /patients/:id/reports panel.
AI-generated summaries are DRAFT ONLY and require clinician review.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, Query, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import Patient, PatientMediaUpload
from app.settings import get_settings

# ── Structured report payload (versioned schema) ──────────────────────────────
# These imports use the render-engine package; PDF rendering may raise
# PdfRendererUnavailable when weasyprint is absent — we map it to HTTP 503.
from deepsynaps_render_engine import (  # noqa: E402
    PdfRendererUnavailable,
    ReportPayload,
    render_report_html,
    render_report_pdf,
)
from app.services.report_citations import enrich_citations  # noqa: E402
from app.services.report_payload import (  # noqa: E402
    build_report_payload,
    make_section,
    sample_payload_for_preview,
)

router = APIRouter(tags=["reports"])

_logger = logging.getLogger(__name__)

# ── Helpers ─────────────────────────────────────────────────────────────────────

_REPORT_SUMMARY_SYSTEM = """You are DeepSynaps ClinicalAI, reviewing a clinical report for a neuromodulation patient.

Your task: produce a concise, structured summary of the uploaded report.

Return a JSON object with these keys (only JSON, no markdown wrapper):
{
  "summary": "<2-3 sentence plain-English summary of the report>",
  "findings": ["<key finding 1>", "<key finding 2>", ...],
  "protocol_hint": "<optional one-sentence suggestion for protocol adjustment, or null>"
}

Rules:
- findings: 2-5 bullet-style strings, each under 20 words
- summary: factual, objective, no diagnosis
- protocol_hint: null if report does not directly imply a protocol change
- Add "For clinical reference only — verify with a qualified clinician." at the end of the summary field.
"""


def _ai_summarize_report(title: str, report_type: str, content_hint: str) -> dict:
    """Produce a structured report summary via GLM (Anthropic fallback)."""
    settings = get_settings()
    if not settings.glm_api_key and not settings.anthropic_api_key:
        return _fallback_summary(title, report_type)

    from app.services.chat_service import _llm_chat
    prompt = (
        f"Report title: {title}\n"
        f"Report type: {report_type}\n"
        f"Additional context: {content_hint or 'No further context provided.'}\n\n"
        "Please summarise this clinical report as instructed."
    )
    try:
        raw = _llm_chat(
            system=_REPORT_SUMMARY_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            not_configured_message="",
        )
        if not raw:
            return _fallback_summary(title, report_type)
        import json as _json
        s = raw.strip()
        if s.startswith("```"):
            s = s.split("\n", 1)[1] if "\n" in s else s[3:]
            if s.endswith("```"):
                s = s[:-3]
            if s.lstrip().lower().startswith("json"):
                s = s.lstrip()[4:]
        data = _json.loads(s.strip())
        return {
            "summary": data.get("summary", "Summary not available."),
            "findings": data.get("findings", []),
            "protocol_hint": data.get("protocol_hint"),
        }
    except Exception as exc:
        _logger.warning("report_ai_summary failed: %s", exc)
        return _fallback_summary(title, report_type)


def _fallback_summary(title: str, report_type: str) -> dict:
    return {
        "summary": (
            f"AI summary unavailable for '{title}' ({report_type}). "
            "Please review the original document. "
            "For clinical reference only — verify with a qualified clinician."
        ),
        "findings": ["Manual review required."],
        "protocol_hint": None,
    }


def _save_report_file(
    patient_id: str,
    upload_id: str,
    file_bytes: bytes,
    filename: str,
    settings,
) -> str:
    """Persist the file to media_uploads/ and return a relative file_ref path."""
    media_root = getattr(settings, "media_storage_root", "media_uploads")
    dest_dir = os.path.join(media_root, "reports", patient_id)
    os.makedirs(dest_dir, exist_ok=True)
    ext = (filename or "report.pdf").rsplit(".", 1)[-1].lower()
    dest_path = os.path.join(dest_dir, f"{upload_id}.{ext}")
    with open(dest_path, "wb") as fh:
        fh.write(file_bytes)
    # Return a URL-like ref; real serving depends on StaticFiles mount
    return f"/media/reports/{patient_id}/{upload_id}.{ext}"


def _assert_report_patient_access(db: Session, actor: AuthenticatedActor, patient_id: str | None) -> None:
    if not patient_id or actor.role == "admin":
        return
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None or patient.clinician_id != actor.actor_id:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )


# ── Endpoints ────────────────────────────────────────────────────────────────────


@router.post("/upload")
async def upload_report(
    patient_id: str = Form(...),
    type: str = Form(...),
    title: str = Form(...),
    report_date: Optional[str] = Form(default=None),
    source: Optional[str] = Form(default=None),
    summary: Optional[str] = Form(default=None),
    status: str = Form(default="final"),
    file: Optional[UploadFile] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Upload a clinical report file for a patient.

    Requires clinician role or above. File is optional — the endpoint also
    accepts metadata-only submissions (the frontend provides a localStorage
    fallback for offline persistence).
    """
    require_minimum_role(actor, "clinician")
    _assert_report_patient_access(db, actor, patient_id)

    upload_id = str(uuid.uuid4())
    file_url: Optional[str] = None
    file_size: Optional[int] = None

    if file is not None:
        settings = get_settings()
        file_bytes = await file.read()
        file_size = len(file_bytes)
        try:
            file_url = _save_report_file(
                patient_id=patient_id,
                upload_id=upload_id,
                file_bytes=file_bytes,
                filename=file.filename or "report",
                settings=settings,
            )
        except IOError as exc:
            _logger.error("report_upload save failed: %s", exc)
            raise ApiServiceError(
                code="storage_error",
                message=f"Failed to save report file: {exc}",
                status_code=500,
            )

    # Persist using PatientMediaUpload (media_type="text" used for reports; the
    # patient_note field stores the report title + type as JSON metadata).
    import json as _json

    note_meta = _json.dumps(
        {"report_type": type, "title": title, "source": source, "report_date": report_date}
    )

    record = PatientMediaUpload(
        id=upload_id,
        patient_id=patient_id,
        uploaded_by=actor.actor_id,
        media_type="text",          # closest existing media_type enum value
        file_ref=file_url,
        file_size_bytes=file_size,
        text_content=summary,
        patient_note=note_meta[:512] if note_meta else None,
        status=status,
    )
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception as exc:
        _logger.warning("report_upload db persist failed (non-fatal): %s", exc)
        db.rollback()
        # Non-fatal: frontend has localStorage fallback; still return success.

    _logger.info("report_upload id=%s patient=%s type=%s", upload_id, patient_id, type)

    return {
        "id": upload_id,
        "patient_id": patient_id,
        "type": type,
        "title": title,
        "date": report_date,
        "file_url": file_url,
        "status": status,
    }


class ReportCreateRequest(BaseModel):
    """JSON body for persisting a text-only clinical report (no file upload)."""
    patient_id: Optional[str] = None
    type: str = Field(default="clinician", max_length=40)
    title: str = Field(..., max_length=240)
    content: Optional[str] = None
    report_date: Optional[str] = None
    source: Optional[str] = None
    summary: Optional[str] = None
    status: str = Field(default="generated", max_length=40)


class ReportOut(BaseModel):
    id: str
    patient_id: Optional[str] = None
    type: str
    title: str
    content: Optional[str] = None
    date: Optional[str] = None
    source: Optional[str] = None
    summary: Optional[str] = None
    status: str
    created_at: str


class ReportListResponse(BaseModel):
    items: list[ReportOut]
    total: int


def _deserialize_report(record: PatientMediaUpload) -> ReportOut:
    """Unpack the JSON metadata we stored in patient_note on create."""
    import json as _json
    title = record.id
    rtype = "clinician"
    source: Optional[str] = None
    report_date: Optional[str] = None
    if record.patient_note:
        try:
            meta = _json.loads(record.patient_note)
            title = meta.get("title", title)
            rtype = meta.get("report_type", rtype)
            source = meta.get("source")
            report_date = meta.get("report_date")
        except (ValueError, KeyError):
            pass
    return ReportOut(
        id=record.id,
        patient_id=record.patient_id,
        type=rtype,
        title=title,
        content=record.text_content,
        date=report_date,
        source=source,
        summary=None,
        status=record.status or "generated",
        created_at=(record.created_at or datetime.now(timezone.utc)).isoformat(),
    )


@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    body: ReportCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportOut:
    """Persist a text-only generated report (no file upload).

    Backs the Reports hub Save flow. Uses the same PatientMediaUpload table as
    ``/upload`` with ``media_type="text"`` and ``file_ref=None``. Clinician-only.
    """
    require_minimum_role(actor, "clinician")
    if not body.patient_id:
        raise ApiServiceError(
            code="patient_id_required",
            message="patient_id is required to persist a report.",
            status_code=422,
        )
    _assert_report_patient_access(db, actor, body.patient_id)

    import json as _json
    note_meta = _json.dumps({
        "report_type": body.type,
        "title": body.title,
        "source": body.source,
        "report_date": body.report_date,
    })

    record = PatientMediaUpload(
        id=str(uuid.uuid4()),
        patient_id=body.patient_id,
        uploaded_by=actor.actor_id,
        media_type="text",
        file_ref=None,
        file_size_bytes=None,
        text_content=body.content,
        patient_note=note_meta[:512],
        status=body.status or "generated",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    _logger.info(
        "report_create id=%s patient=%s type=%s by=%s",
        record.id, record.patient_id, body.type, actor.actor_id,
    )
    return _deserialize_report(record)


@router.get("", response_model=ReportListResponse)
def list_reports(
    since: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportListResponse:
    """List generated reports owned by the current clinician.

    Returns most recent first. ``since`` is an optional ISO-8601 date/datetime
    cutoff (inclusive). Admins see all clinicians' reports; clinicians see
    only their own.
    """
    require_minimum_role(actor, "clinician")

    q = db.query(PatientMediaUpload).filter(PatientMediaUpload.media_type == "text")
    if actor.role != "admin":
        q = q.filter(PatientMediaUpload.uploaded_by == actor.actor_id)
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.filter(PatientMediaUpload.created_at >= cutoff)
        except ValueError:
            # Invalid date string → ignore the filter rather than 400.
            pass
    q = q.order_by(PatientMediaUpload.created_at.desc()).limit(200)

    items = [_deserialize_report(r) for r in q.all()]
    return ReportListResponse(items=items, total=len(items))


@router.post("/{report_id}/ai-summary")
def ai_summarize_report(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Generate an AI summary of a previously uploaded report.

    Looks up the report in PatientMediaUpload by report_id to provide context
    to the AI model. Falls back gracefully if the record is not found.
    Requires clinician role or above.
    """
    require_minimum_role(actor, "clinician")

    import json as _json

    # Try to load the stored record for context
    record: Optional[PatientMediaUpload] = (
        db.query(PatientMediaUpload).filter_by(id=report_id).first()
    )

    if record is not None:
        if actor.role != "admin" and record.uploaded_by != actor.actor_id:
            raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
        _assert_report_patient_access(db, actor, record.patient_id)
        # Parse metadata stored in patient_note
        title = report_id   # fallback
        report_type = "clinical"
        content_hint = record.text_content or ""

        if record.patient_note:
            try:
                meta = _json.loads(record.patient_note)
                title = meta.get("title", report_id)
                report_type = meta.get("report_type", "clinical")
                if meta.get("source"):
                    content_hint = f"Source: {meta['source']}. {content_hint}"
                if meta.get("report_date"):
                    content_hint = f"Report date: {meta['report_date']}. {content_hint}"
            except (ValueError, KeyError):
                pass
    else:
        # Report not in DB — generate generic summary using the report_id as label
        _logger.info("report ai_summary: record %s not found, using generic summary", report_id)
        title = report_id
        report_type = "clinical"
        content_hint = ""

    result = _ai_summarize_report(title=title, report_type=report_type, content_hint=content_hint)

    return {
        "summary": result["summary"],
        "findings": result["findings"],
        "protocol_hint": result["protocol_hint"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Structured report payload + render endpoints ──────────────────────────────
# These endpoints expose the new versioned ReportPayload schema and its HTML/PDF
# renderers. They are deliberately kept separate from the legacy upload/list
# endpoints above so existing clients are not affected.


class _PreviewSectionIn(BaseModel):
    """Minimal section payload accepted by the preview endpoint."""
    section_id: str
    title: str
    observed: list[str] = Field(default_factory=list)
    interpretations: list[dict] = Field(default_factory=list)
    suggested_actions: list[dict] = Field(default_factory=list)
    confidence: Optional[str] = None
    cautions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    counter_evidence_refs: list[str] = Field(default_factory=list)


class _PreviewPayloadRequest(BaseModel):
    """Inbound shape for the /preview-payload endpoint.

    Everything is optional so the caller can request a minimal payload
    (for surface tests or new-feature probing) without supplying every
    field. When no sections are supplied we return a sample payload so
    the UI can render the new layout in onboarding/demo.
    """
    title: Optional[str] = None
    summary: Optional[str] = None
    audience: str = "both"  # clinician|patient|both
    patient_id: Optional[str] = None
    sections: list[_PreviewSectionIn] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)


@router.post("/preview-payload", response_model=ReportPayload)
def preview_report_payload(
    body: _PreviewPayloadRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportPayload:
    """Build a structured ``ReportPayload`` from minimal inputs (no DB write).

    If no sections are supplied, a sample payload is returned so the
    in-app viewer can render the new layout end-to-end. This is the
    primary integration point for the qEEG, MRI, and Scoring streams
    once their pipelines are publishing structured findings.
    """
    require_minimum_role(actor, "clinician")
    _assert_report_patient_access(db, actor, body.patient_id)

    if not body.sections and not body.references and not body.title:
        return sample_payload_for_preview()

    citations = enrich_citations(body.references, db=db)
    sections = [
        make_section(
            section_id=s.section_id,
            title=s.title,
            observed=s.observed,
            interpretations=s.interpretations,
            suggested_actions=s.suggested_actions,
            confidence=s.confidence,
            cautions=s.cautions,
            limitations=s.limitations,
            evidence_refs=s.evidence_refs,
            counter_evidence_refs=s.counter_evidence_refs,
        )
        for s in body.sections
    ]
    return build_report_payload(
        title=body.title or "Treatment plan preview",
        summary=body.summary or "",
        patient_id=body.patient_id,
        audience=body.audience,
        sections=sections,
        citations=citations,
    )


def _payload_for_record(
    record: PatientMediaUpload,
    db: Session,
) -> ReportPayload:
    """Build a payload from a stored report record.

    Today the legacy reports schema only stores a single ``text_content``
    blob plus metadata in ``patient_note``. We render that as a single
    "Clinical narrative" section. As soon as upstream callers start
    persisting structured payloads (planned: a dedicated table), this
    helper will read the structured row directly.
    """
    import json as _json

    title = record.id
    if record.patient_note:
        try:
            meta = _json.loads(record.patient_note)
            title = meta.get("title", title) or title
        except (ValueError, KeyError):
            pass

    body_text = (record.text_content or "").strip()
    observed: list[str] = []
    if body_text:
        observed = [body_text]

    sections = [
        make_section(
            section_id="narrative",
            title="Clinical narrative",
            observed=observed,
            cautions=["Auto-imported from legacy report — review before use."],
            limitations=[
                "Structured findings not yet available for this report; only the "
                "free-text narrative is rendered.",
            ],
        ),
    ]

    return build_report_payload(
        title=title,
        summary="Rendered from a stored clinical report.",
        patient_id=record.patient_id,
        report_id=record.id,
        audience="both",
        sections=sections,
        citations=[],  # legacy rows don't carry structured citations
    )


@router.get("/{report_id}/payload", response_model=ReportPayload)
def get_report_payload(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportPayload:
    """Return the structured ``ReportPayload`` for a stored report."""
    require_minimum_role(actor, "clinician")
    record: Optional[PatientMediaUpload] = (
        db.query(PatientMediaUpload).filter_by(id=report_id).first()
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    if actor.role != "admin" and record.uploaded_by != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    _assert_report_patient_access(db, actor, record.patient_id)
    return _payload_for_record(record, db)


@router.get("/{report_id}/render")
def render_report(
    report_id: str,
    format: str = Query("html", pattern="^(html|pdf)$"),
    audience: Optional[str] = Query(None, pattern="^(clinician|patient|both)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Render a stored report as HTML or PDF.

    ``format=html`` always returns ``text/html``. ``format=pdf`` returns
    ``application/pdf`` when ``weasyprint`` is installed; if not, we
    return HTTP 503 with a clear blocker message so callers never see
    a blank PDF.
    """
    require_minimum_role(actor, "clinician")
    record: Optional[PatientMediaUpload] = (
        db.query(PatientMediaUpload).filter_by(id=report_id).first()
    )
    if record is None:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    if actor.role != "admin" and record.uploaded_by != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    _assert_report_patient_access(db, actor, record.patient_id)

    payload = _payload_for_record(record, db)
    if audience:
        # Pydantic guard: only accept the constrained literal values.
        payload = payload.model_copy(update={"audience": audience})

    if format == "html":
        html_doc = render_report_html(payload, audience=payload.audience)
        if not html_doc:
            raise ApiServiceError(
                code="render_failed",
                message="HTML render produced an empty document.",
                status_code=500,
            )
        return HTMLResponse(content=html_doc, status_code=200)

    # format == "pdf"
    try:
        pdf_bytes = render_report_pdf(payload)
    except PdfRendererUnavailable as exc:
        # 503: the dependency is missing on the host. This is a DevOps
        # blocker, not a user error — return a clear, actionable message.
        raise ApiServiceError(
            code="pdf_renderer_unavailable",
            message=str(exc),
            status_code=503,
        ) from exc
    if not pdf_bytes:
        # Defence-in-depth: never serve an empty PDF.
        raise ApiServiceError(
            code="pdf_render_empty",
            message="PDF renderer returned empty bytes — refusing to serve a blank PDF.",
            status_code=500,
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="report-{report_id}.pdf"'
        },
    )

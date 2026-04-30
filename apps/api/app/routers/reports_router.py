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

from fastapi import APIRouter, Depends, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, Response

from app.limiter import limiter
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


_ALLOWED_REPORT_EXTENSIONS = frozenset(
    {"pdf", "docx", "doc", "txt", "rtf", "md", "jpg", "jpeg", "png"}
)


def _save_report_file(
    patient_id: str,
    upload_id: str,
    file_bytes: bytes,
    filename: str,
    settings,
) -> str:
    """Persist the file to media_uploads/ and return a relative file_ref path.

    Hardening (defense-in-depth): the raw extension is taken from the user-
    supplied filename via rsplit('.',1) — historically that allowed slashes
    and ``..`` in the resulting ext string (e.g. ``a.b/../../evil`` →
    ext=``b/../../evil``). The OS path resolver normally short-circuits on
    the non-existent ``<uuid>.b`` intermediate dir, but we still belt-and-
    suspenders by (a) whitelisting extensions and (b) refusing any final
    path that escapes the patient subdirectory.
    """
    media_root = getattr(settings, "media_storage_root", "media_uploads")
    dest_dir = os.path.join(media_root, "reports", patient_id)
    os.makedirs(dest_dir, exist_ok=True)
    raw_ext = (filename or "report.pdf").rsplit(".", 1)[-1].lower()
    if raw_ext not in _ALLOWED_REPORT_EXTENSIONS:
        raise ApiServiceError(
            code="invalid_report_extension",
            message=(
                "Report file extension must be one of: "
                + ", ".join(sorted(_ALLOWED_REPORT_EXTENSIONS))
            ),
            status_code=422,
        )
    dest_path = os.path.join(dest_dir, f"{upload_id}.{raw_ext}")
    # Resolve and assert containment — guards against any future call site
    # that smuggles slashes through patient_id or upload_id.
    abs_dest = os.path.realpath(dest_path)
    abs_root = os.path.realpath(dest_dir)
    if not (abs_dest == abs_root or abs_dest.startswith(abs_root + os.sep)):
        raise ApiServiceError(
            code="invalid_report_destination",
            message="Resolved report path escapes the patient directory.",
            status_code=422,
        )
    with open(abs_dest, "wb") as fh:
        fh.write(file_bytes)
    # Return a URL-like ref; real serving depends on StaticFiles mount
    return f"/media/reports/{patient_id}/{upload_id}.{raw_ext}"


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
@limiter.limit("10/minute")
async def upload_report(
    request: Request,
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
    until: Optional[str] = None,
    patient_id: Optional[str] = None,
    kind: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    clinic_id: Optional[str] = None,  # accepted for forward-compat; no clinic on patient table today
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportListResponse:
    """List generated reports owned by the current clinician.

    Returns most recent first. Filters:

    * ``since`` / ``until`` — ISO-8601 cutoffs (inclusive) on ``created_at``.
    * ``patient_id`` — restrict to a single patient (clinic-isolation enforced
      via ``_assert_report_patient_access``).
    * ``kind`` — match the metadata ``report_type`` field (e.g. ``progress``,
      ``clinician``, ``Health Insights Report``). Case-insensitive substring.
    * ``status`` — exact status match (``generated``, ``signed``,
      ``superseded``, etc).
    * ``q`` — case-insensitive substring search across title and content.
    * ``clinic_id`` — accepted for forward-compat; the current Patient model
      does not carry a clinic_id, so this filter is a documented no-op
      (limitation surfaced in /summary disclaimers).
    * ``limit`` / ``offset`` — pagination.

    Admins see all clinicians' reports; clinicians see only their own.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _assert_report_patient_access(db, actor, patient_id)

    base = db.query(PatientMediaUpload).filter(PatientMediaUpload.media_type == "text")
    if actor.role != "admin":
        base = base.filter(PatientMediaUpload.uploaded_by == actor.actor_id)
    if patient_id:
        base = base.filter(PatientMediaUpload.patient_id == patient_id)
    if status:
        base = base.filter(PatientMediaUpload.status == status)
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            base = base.filter(PatientMediaUpload.created_at >= cutoff)
        except ValueError:
            pass
    if until:
        try:
            cutoff_to = datetime.fromisoformat(until.replace("Z", "+00:00"))
            base = base.filter(PatientMediaUpload.created_at <= cutoff_to)
        except ValueError:
            pass
    if q:
        like = f"%{q.lower()}%"
        # Title is in patient_note (JSON), content is text_content. We also
        # fall back to `id` so a UUID-search still works.
        from sqlalchemy import or_, func
        base = base.filter(
            or_(
                func.lower(func.coalesce(PatientMediaUpload.text_content, "")).like(like),
                func.lower(func.coalesce(PatientMediaUpload.patient_note, "")).like(like),
                func.lower(PatientMediaUpload.id).like(like),
            )
        )

    base = base.order_by(PatientMediaUpload.created_at.desc())

    # Materialize then post-filter for `kind` (it's encoded in the JSON
    # patient_note metadata; a substring match is honest about the schema).
    rows = base.offset(offset).limit(limit).all()
    items = [_deserialize_report(r) for r in rows]
    if kind:
        kk = kind.lower()
        items = [it for it in items if kk in (it.type or "").lower()]
    return ReportListResponse(items=items, total=len(items))


@router.post("/{report_id}/ai-summary")
@limiter.limit("20/minute")
def ai_summarize_report(
    report_id: str,
    request: Request,
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


# ─────────────────────────────────────────────────────────────────────────────
# Reports Hub launch-audit (2026-04-30)
#
# Below: GET /{id}, /{id}/sign, /{id}/supersede, /summary, /export.csv,
# /export.docx, /audit-events. These extend the existing reports surface to
# match the Reports Hub UI contract documented in the launch audit. The
# storage model (PatientMediaUpload) carries no dedicated signed_by /
# signed_at / supersedes columns, so the helpers below encode that state in
# the JSON ``patient_note`` field — honest about the schema gap and audited.
# ─────────────────────────────────────────────────────────────────────────────


REPORTS_PAGE_DISCLAIMERS = [
    "Reports are clinical records and require clinician sign-off.",
    "Signed reports are immutable; supersede creates a new revision with audit trail.",
    "AI summaries are decision-support only.",
]


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Best-effort audit-trail write. Must never raise back at the caller.

    Mirrors the pattern in ``adverse_events_router._audit`` so events show up
    in ``/api/v1/audit-trail`` under target_type=``reports``.
    """
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"reports-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="reports",
            action=f"reports.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block the API
        _logger.debug("reports audit write skipped", exc_info=True)


def _load_meta(record: PatientMediaUpload) -> dict:
    import json as _json
    if not record.patient_note:
        return {}
    try:
        return _json.loads(record.patient_note) or {}
    except (ValueError, KeyError):
        return {}


def _save_meta(record: PatientMediaUpload, meta: dict) -> None:
    import json as _json
    blob = _json.dumps(meta)
    record.patient_note = blob[:512]


def _load_record_for_actor(
    db: Session,
    actor: AuthenticatedActor,
    report_id: str,
) -> PatientMediaUpload:
    record: Optional[PatientMediaUpload] = (
        db.query(PatientMediaUpload).filter_by(id=report_id).first()
    )
    if record is None or record.media_type != "text":
        raise ApiServiceError(
            code="not_found", message="Report not found.", status_code=404
        )
    if actor.role != "admin" and record.uploaded_by != actor.actor_id:
        raise ApiServiceError(
            code="not_found", message="Report not found.", status_code=404
        )
    _assert_report_patient_access(db, actor, record.patient_id)
    return record


class ReportDetailOut(BaseModel):
    id: str
    patient_id: Optional[str] = None
    type: str
    title: str
    content: Optional[str] = None
    date: Optional[str] = None
    source: Optional[str] = None
    status: str
    created_at: str
    updated_at: Optional[str] = None
    signed_by: Optional[str] = None
    signed_at: Optional[str] = None
    supersedes: Optional[str] = None
    superseded_by: Optional[str] = None
    revision: int = 1
    is_demo: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(REPORTS_PAGE_DISCLAIMERS))


def _detail_for_record(record: PatientMediaUpload) -> ReportDetailOut:
    meta = _load_meta(record)
    return ReportDetailOut(
        id=record.id,
        patient_id=record.patient_id,
        type=meta.get("report_type", "clinician"),
        title=meta.get("title", record.id),
        content=record.text_content,
        date=meta.get("report_date"),
        source=meta.get("source"),
        status=record.status or "generated",
        created_at=(record.created_at or datetime.now(timezone.utc)).isoformat(),
        updated_at=(record.updated_at.isoformat() if record.updated_at else None),
        signed_by=meta.get("signed_by"),
        signed_at=meta.get("signed_at"),
        supersedes=meta.get("supersedes"),
        superseded_by=meta.get("superseded_by"),
        revision=int(meta.get("revision", 1) or 1),
        is_demo=bool(meta.get("is_demo", False)),
    )


@router.get("/summary")
def reports_summary(
    patient_id: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Counts: total / by_kind / by_status. Honest about empty cases.

    Does NOT log a self-audit event (the Hub page-load audit handles that
    at /audit-events). Returns disclaimers + clinic-scope limitations.
    """
    require_minimum_role(actor, "clinician")
    if patient_id:
        _assert_report_patient_access(db, actor, patient_id)

    base = db.query(PatientMediaUpload).filter(PatientMediaUpload.media_type == "text")
    if actor.role != "admin":
        base = base.filter(PatientMediaUpload.uploaded_by == actor.actor_id)
    if patient_id:
        base = base.filter(PatientMediaUpload.patient_id == patient_id)

    rows = base.all()
    total = len(rows)
    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        st = r.status or "generated"
        by_status[st] = by_status.get(st, 0) + 1
        meta = _load_meta(r)
        kk = (meta.get("report_type") or "clinician").lower()
        by_kind[kk] = by_kind.get(kk, 0) + 1

    return {
        "total": total,
        "draft": by_status.get("generated", 0) + by_status.get("draft", 0),
        "signed": by_status.get("signed", 0) + by_status.get("final", 0),
        "superseded": by_status.get("superseded", 0),
        "by_status": by_status,
        "by_kind": by_kind,
        "disclaimers": list(REPORTS_PAGE_DISCLAIMERS),
        "scope_limitations": [
            "clinic_id filter is accepted but not yet enforced server-side "
            "(Patient model has no clinic_id today).",
        ],
    }


@router.get("/{report_id}", response_model=ReportDetailOut)
def get_report(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportDetailOut:
    """Return a single report with sign / supersede / revision metadata."""
    require_minimum_role(actor, "clinician")
    record = _load_record_for_actor(db, actor, report_id)
    _audit(db, actor, event="viewed", target_id=record.id, note="report viewed")
    return _detail_for_record(record)


class ReportSignRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=512)


@router.post("/{report_id}/sign", response_model=ReportDetailOut)
def sign_report(
    report_id: str,
    body: ReportSignRequest = ReportSignRequest(),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportDetailOut:
    """Mark a report as clinician-signed. Signed reports are immutable.

    Idempotent for the same actor: signing an already-signed report is a
    no-op (returns the existing record). Signing a superseded report is
    blocked (HTTP 409).
    """
    require_minimum_role(actor, "clinician")
    record = _load_record_for_actor(db, actor, report_id)
    if record.status == "superseded":
        raise ApiServiceError(
            code="report_superseded",
            message="Cannot sign a superseded report.",
            status_code=409,
        )
    meta = _load_meta(record)
    if record.status in {"signed", "final"} and meta.get("signed_by") == actor.actor_id:
        return _detail_for_record(record)
    now = datetime.now(timezone.utc).isoformat()
    meta["signed_by"] = actor.actor_id
    meta["signed_at"] = now
    if body.note:
        meta["sign_note"] = body.note[:512]
    _save_meta(record, meta)
    record.status = "signed"
    db.commit()
    db.refresh(record)
    _audit(
        db,
        actor,
        event="signed",
        target_id=record.id,
        note=(body.note or "report signed")[:512],
    )
    return _detail_for_record(record)


class ReportSupersedeRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=512)
    new_content: Optional[str] = None
    new_title: Optional[str] = Field(default=None, max_length=240)


@router.post("/{report_id}/supersede", response_model=ReportDetailOut)
def supersede_report(
    report_id: str,
    body: ReportSupersedeRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportDetailOut:
    """Create a new revision that supersedes this report.

    The original is marked ``superseded`` (with ``superseded_by`` pointer)
    and a new record is created with ``supersedes`` pointing back. Both
    actions are audited.
    """
    require_minimum_role(actor, "clinician")
    original = _load_record_for_actor(db, actor, report_id)
    if original.status == "superseded":
        raise ApiServiceError(
            code="already_superseded",
            message="Report is already superseded.",
            status_code=409,
        )
    orig_meta = _load_meta(original)
    new_id = str(uuid.uuid4())
    new_meta = {
        "report_type": orig_meta.get("report_type", "clinician"),
        "title": body.new_title or orig_meta.get("title", original.id),
        "source": orig_meta.get("source"),
        "report_date": datetime.now(timezone.utc).date().isoformat(),
        "supersedes": original.id,
        "revision": int(orig_meta.get("revision", 1) or 1) + 1,
        "supersede_reason": body.reason[:512],
        "is_demo": bool(orig_meta.get("is_demo", False)),
    }
    import json as _json
    new_record = PatientMediaUpload(
        id=new_id,
        patient_id=original.patient_id,
        uploaded_by=actor.actor_id,
        media_type="text",
        file_ref=None,
        file_size_bytes=None,
        text_content=body.new_content
        if body.new_content is not None
        else original.text_content,
        patient_note=_json.dumps(new_meta)[:512],
        status="generated",
    )
    db.add(new_record)

    # Patch the original.
    orig_meta["superseded_by"] = new_id
    _save_meta(original, orig_meta)
    original.status = "superseded"
    db.commit()
    db.refresh(new_record)

    _audit(
        db,
        actor,
        event="superseded",
        target_id=original.id,
        note=f"superseded by {new_id}: {body.reason[:200]}",
    )
    _audit(
        db,
        actor,
        event="created_revision",
        target_id=new_id,
        note=f"revision {new_meta['revision']} of {original.id}",
    )
    return _detail_for_record(new_record)


def _csv_quote(value: object) -> str:
    s = "" if value is None else str(value)
    if any(ch in s for ch in [",", "\"", "\n", "\r"]):
        return '"' + s.replace('"', '""') + '"'
    return s


@router.get("/{report_id}/export.csv")
def export_report_csv(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """One-row CSV export of the report's metadata + content snapshot.

    The CSV is prefixed with a ``# DEMO`` header line when the report's
    metadata flags ``is_demo`` so importers can drop demo rows trivially.
    """
    require_minimum_role(actor, "clinician")
    record = _load_record_for_actor(db, actor, report_id)
    detail = _detail_for_record(record)
    header = [
        "id", "patient_id", "type", "title", "status", "revision",
        "supersedes", "superseded_by", "signed_by", "signed_at",
        "created_at", "updated_at", "is_demo", "content",
    ]
    row = [
        detail.id, detail.patient_id or "", detail.type, detail.title,
        detail.status, detail.revision, detail.supersedes or "",
        detail.superseded_by or "", detail.signed_by or "", detail.signed_at or "",
        detail.created_at, detail.updated_at or "",
        "1" if detail.is_demo else "0",
        (detail.content or "").replace("\r\n", "\n"),
    ]
    parts: list[str] = []
    if detail.is_demo:
        parts.append("# DEMO — not regulator-submittable")
    parts.append(",".join(header))
    parts.append(",".join(_csv_quote(v) for v in row))
    csv_text = "\n".join(parts) + "\n"
    _audit(db, actor, event="exported_csv", target_id=record.id, note="report csv export")
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="report-{report_id}.csv"'
        },
    )


@router.get("/{report_id}/export.pdf")
def export_report_pdf(
    report_id: str,
    audience: Optional[str] = Query(None, pattern="^(clinician|patient|both)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """PDF export — alias for ``/{id}/render?format=pdf`` with audit hook.

    DEMO reports get a clear stamp embedded in the body via the structured
    payload's ``cautions`` list (``_payload_for_record`` already adds a
    legacy-import caution; we add a DEMO marker on top when applicable).
    """
    require_minimum_role(actor, "clinician")
    record = _load_record_for_actor(db, actor, report_id)
    payload = _payload_for_record(record, db)
    meta = _load_meta(record)
    if meta.get("is_demo") and payload.sections:
        # Stamp DEMO into the first section's cautions list. The rendered
        # template surfaces these prominently.
        first = payload.sections[0]
        cautions = list(first.cautions or [])
        cautions.insert(0, "DEMO — not regulator-submittable.")
        payload.sections[0] = first.model_copy(update={"cautions": cautions})
    if audience:
        payload = payload.model_copy(update={"audience": audience})
    try:
        pdf_bytes = render_report_pdf(payload)
    except PdfRendererUnavailable as exc:
        raise ApiServiceError(
            code="pdf_renderer_unavailable",
            message=str(exc),
            status_code=503,
        ) from exc
    if not pdf_bytes:
        raise ApiServiceError(
            code="pdf_render_empty",
            message="PDF renderer returned empty bytes — refusing to serve a blank PDF.",
            status_code=500,
        )
    _audit(db, actor, event="exported_pdf", target_id=record.id, note="report pdf export")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="report-{report_id}.pdf"'
        },
    )


@router.get("/{report_id}/export.docx")
def export_report_docx(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """DOCX export — honest 503 stub.

    No DOCX renderer is wired today (we ship weasyprint for PDF, no
    python-docx). Rather than ship a fake button, the endpoint exists so
    the frontend can call it and surface a real "not configured" message.
    """
    require_minimum_role(actor, "clinician")
    # Still authorise so an unauthorised caller gets 401/404 not 503.
    record = _load_record_for_actor(db, actor, report_id)
    _audit(
        db, actor,
        event="export_docx_attempted",
        target_id=record.id,
        note="DOCX renderer not configured",
    )
    raise ApiServiceError(
        code="docx_renderer_unavailable",
        message=(
            "DOCX export is not configured on this deployment. "
            "Use the PDF or CSV export instead."
        ),
        status_code=503,
    )


# ── Page-level audit ingestion ──────────────────────────────────────────────
#
# Mirrors the qEEG Analyzer pattern (POST /api/v1/qeeg-analysis/audit-events).
# The qEEG endpoint already accepts ``surface=reports`` (whitelist extended in
# this PR), but the Reports Hub also gets its own dedicated path so the
# surface attribution is unambiguous on the page layer.

class ReportsAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    report_id: Optional[str] = Field(None, max_length=64)
    patient_id: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=1024)
    using_demo_data: Optional[bool] = False


class ReportsAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


@router.post("/audit-events", response_model=ReportsAuditEventOut)
def record_reports_audit_event(
    payload: ReportsAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportsAuditEventOut:
    """Best-effort page-level audit ingestion for the Reports Hub UI."""
    require_minimum_role(actor, "clinician")
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = (
        f"reports-{payload.event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    target_id = payload.report_id or payload.patient_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.patient_id:
        note_parts.append(f"patient={payload.patient_id}")
    if payload.report_id:
        note_parts.append(f"report={payload.report_id}")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type="reports",
            action=f"reports.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _logger.exception("reports audit-event persistence failed")
        return ReportsAuditEventOut(accepted=False, event_id=event_id)
    return ReportsAuditEventOut(accepted=True, event_id=event_id)


# ── Phase 2: QEEG Brain Map render endpoints (from cross-surface branch) ───
# Renders the canonical QEEGBrainMapReport payload into clinician/patient PDF
# or HTML. WeasyPrint absence → 503.

from app.persistence.models import QEEGAIReport  # noqa: E402
from app.routers.qeeg_analysis_router import _gate_patient_access  # noqa: E402
from app.services.qeeg_pdf_export import (  # noqa: E402
    QEEGPdfRendererUnavailable,
    render_qeeg_html,
    render_qeeg_pdf,
)


def _resolve_qeeg_brain_map_payload(report: QEEGAIReport) -> dict:
    """Return the QEEGBrainMapReport payload for a row, falling back to the
    legacy patient_facing_report_json shape when the new column is empty."""
    import json as _json
    raw = getattr(report, "report_payload", None)
    if raw:
        try:
            data = _json.loads(raw)
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):
            pass
    raw = getattr(report, "patient_facing_report_json", None)
    if raw:
        try:
            data = _json.loads(raw)
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):
            pass
    return {}


@router.get("/qeeg/{report_id}.pdf")
def render_qeeg_brain_map_pdf(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Render a qEEG brain-map report as a print-grade PDF.

    Auth: clinician+ role; cross-clinic access returns 404 (not 403) so the
    endpoint cannot be used to enumerate report IDs across tenants.
    """
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    try:
        _gate_patient_access(actor, report.patient_id, db)
    except ApiServiceError as gate_exc:
        if getattr(gate_exc, "status_code", None) == 403:
            raise ApiServiceError(code="not_found", message="Report not found.", status_code=404) from None
        raise

    payload = _resolve_qeeg_brain_map_payload(report)
    if not payload:
        raise ApiServiceError(
            code="payload_missing",
            message="No brain-map payload available for this report.",
            status_code=404,
        )

    try:
        pdf_bytes = render_qeeg_pdf(payload)
    except QEEGPdfRendererUnavailable as exc:
        raise ApiServiceError(
            code="pdf_renderer_unavailable",
            message=str(exc),
            status_code=503,
        ) from exc
    if not pdf_bytes:
        raise ApiServiceError(
            code="pdf_render_empty",
            message="QEEG PDF renderer returned empty bytes.",
            status_code=500,
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="qeeg-brain-map-{report_id}.pdf"'},
    )


@router.get("/qeeg/{report_id}.html")
def render_qeeg_brain_map_html(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Render a qEEG brain-map report as standalone HTML (print-friendly)."""
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found.", status_code=404)
    try:
        _gate_patient_access(actor, report.patient_id, db)
    except ApiServiceError as gate_exc:
        if getattr(gate_exc, "status_code", None) == 403:
            raise ApiServiceError(code="not_found", message="Report not found.", status_code=404) from None
        raise

    payload = _resolve_qeeg_brain_map_payload(report)
    if not payload:
        raise ApiServiceError(
            code="payload_missing",
            message="No brain-map payload available for this report.",
            status_code=404,
        )

    html_doc = render_qeeg_html(payload)
    return HTMLResponse(content=html_doc, status_code=200)

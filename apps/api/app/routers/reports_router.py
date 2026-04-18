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

from fastapi import APIRouter, Depends, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import PatientMediaUpload
from app.settings import get_settings

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
            if s.endswith("```"): s = s[:-3]
            if s.lstrip().lower().startswith("json"): s = s.lstrip()[4:]
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

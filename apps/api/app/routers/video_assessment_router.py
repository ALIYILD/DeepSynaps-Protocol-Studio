"""Video Assessments — guided motor capture + clinician review (MVP).

Separate from Virtual Care ``video-analysis`` (engagement metrics). This router
stores session JSON and optional raw video blobs under media storage.

Endpoints
---------
POST   /api/v1/video-assessments/sessions
GET    /api/v1/video-assessments/sessions/{id}
PATCH  /api/v1/video-assessments/sessions/{id}
POST   /api/v1/video-assessments/sessions/{id}/tasks/{task_id}/upload
GET    /api/v1/video-assessments/sessions/{id}/tasks/{task_id}/video
POST   /api/v1/video-assessments/sessions/{id}/finalize
GET    /api/v1/video-assessments/sessions                  List sessions (scoped by role + optional patient_id)
"""
from __future__ import annotations

import json
import logging
import uuid
import hashlib
from datetime import datetime, timezone
from pathlib import Path as FsPath
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Path as PathParam, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord
from app.repositories.video_assessments import Patient, User, VideoAssessmentSession
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services import media_storage
from app.services.video_assessment_seed import (
    PROTOCOL_NAME,
    PROTOCOL_VERSION,
    default_future_ai_placeholder,
    default_summary,
    default_tasks_payload,
)
from app.settings import get_settings

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video-assessments", tags=["Video Assessments"])

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_ALLOWED_ENVS = frozenset({"development", "test"})

_MAX_TASK_VIDEO_BYTES = 120 * 1024 * 1024  # 120 MB per task clip
_ALLOWED_VIDEO_MIME = frozenset({"video/webm", "video/mp4", "video/quicktime"})
_HISTORICAL_SUMMARY_LOGIC_VERSION = "video_assessment_historical_summary_v2"


def _audit_va(
    db: Session,
    *,
    actor: AuthenticatedActor,
    action: str,
    target_id: str,
    note: str = "",
) -> None:
    """Best-effort PHI-safe audit (no video bytes in note)."""
    now = datetime.now(timezone.utc)
    event_id = f"video_assessment-{action}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:8]}"
    audit_role = actor.role if actor.role in {"guest", "clinician", "admin"} else "guest"
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=target_id[:64],
            target_type="video_assessment",
            action=f"video_assessment.{action}",
            role=audit_role,
            actor_id=actor.actor_id,
            note=(note or action)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:
        _log.exception("video_assessment audit skipped")


def _sessions_query_for_clinician(actor: AuthenticatedActor, db: Session):
    """Join sessions to patient owning clinician's clinic for IDOR-safe listing."""
    q = (
        db.query(VideoAssessmentSession)
        .join(Patient, Patient.id == VideoAssessmentSession.patient_id)
        .join(User, User.id == Patient.clinician_id)
    )
    if actor.role in ("admin", "supervisor"):
        return q
    if not getattr(actor, "clinic_id", None):
        return q.filter(VideoAssessmentSession.id.is_(None))
    return q.filter(User.clinic_id == actor.clinic_id)


def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    """Patient or admin only; demo bypass in dev/test only (same as virtual_care)."""
    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(
            code="patient_role_required",
            message="This action requires a patient account.",
            status_code=403,
        )
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        from app.settings import get_settings as _gs

        app_env = (getattr(_gs(), "app_env", None) or "production").lower()
        if app_env not in _DEMO_ALLOWED_ENVS:
            raise ApiServiceError(
                code="demo_disabled",
                message="Demo patient bypass is not available in this environment.",
                status_code=403,
            )
        patient = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
        if patient:
            return patient
        raise ApiServiceError(code="patient_not_linked", message="No demo patient record found.", status_code=404)
    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record linked to this user account.",
            status_code=404,
        )
    return patient


def _gate_session_patient(row: VideoAssessmentSession, patient: Patient) -> None:
    if row.patient_id != patient.id:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)


def _gate_session_clinician(actor: AuthenticatedActor, row: VideoAssessmentSession, db: Session) -> None:
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, row.patient_id)
    if not exists:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    try:
        require_patient_owner(actor, clinic_id)
    except ApiServiceError as exc:
        if exc.status_code == 403:
            raise ApiServiceError(code="not_found", message="Session not found.", status_code=404) from exc
        raise


def _load_session_body(row: VideoAssessmentSession) -> dict[str, Any]:
    try:
        return json.loads(row.session_json or "{}")
    except Exception:
        return {}


def _save_session_body(row: VideoAssessmentSession, body: dict[str, Any]) -> None:
    row.session_json = json.dumps(body, separators=(",", ":"), default=str)
    row.updated_at = datetime.now(timezone.utc)


def _is_finalized(doc: dict[str, Any]) -> bool:
    return str(doc.get("overall_status") or "") == "finalized"


def _new_session_document(
    *,
    patient_id: str,
    encounter_id: Optional[str],
    consent: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    consent_block = consent or {
        "recording_consent": False,
        "research_use_acknowledged": False,
        "consent_version": "video_assessment_mvp_v1",
        "consent_recorded_at": None,
    }
    return {
        "id": str(uuid.uuid4()),
        "patient_id": patient_id,
        "encounter_id": encounter_id,
        "protocol_name": PROTOCOL_NAME,
        "protocol_version": PROTOCOL_VERSION,
        "mode": "patient_capture",
        "started_at": now,
        "completed_at": None,
        "overall_status": "in_progress",
        "safety_flags": [],
        "patient_consent": consent_block,
        "clinical_context": {
            "preset_id": "parkinsonism_followup",
            "condition_label": "",
            "custom_indication": "",
            "set_at": now,
        },
        "tasks": default_tasks_payload(),
        "summary": default_summary(),
        "future_ai_metrics_placeholder": default_future_ai_placeholder(),
    }


def _merge_task_updates(stored_tasks: list[dict[str, Any]], updates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {t["task_id"]: i for i, t in enumerate(stored_tasks)}
    for patch in updates:
        tid = patch.get("task_id")
        if tid is None or tid not in by_id:
            continue
        i = by_id[tid]
        base = dict(stored_tasks[i])
        for k, v in patch.items():
            if k == "task_id":
                continue
            base[k] = v
        stored_tasks[i] = base
    return stored_tasks


def _recalc_summary(body: dict[str, Any]) -> None:
    tasks = body.get("tasks") or []
    completed = sum(
        1
        for t in tasks
        if str(t.get("recording_status") or "") in ("recorded", "accepted")
    )
    skipped = sum(
        1
        for t in tasks
        if str(t.get("recording_status") or "") in ("skipped", "unsafe_skipped")
    )
    safety = [t["task_id"] for t in tasks if t.get("unsafe_flag") or t.get("recording_status") == "unsafe_skipped"]
    reviewed = sum(1 for t in tasks if (t.get("clinician_review") or {}).get("reviewed_at"))
    need_repeat = sum(
        1 for t in tasks if (t.get("clinician_review") or {}).get("repeat_needed") == "yes"
    )
    n = len(tasks) or 1
    body["summary"] = body.get("summary") or {}
    body["summary"]["tasks_completed"] = completed
    body["summary"]["tasks_skipped"] = skipped
    body["summary"]["tasks_needing_repeat"] = need_repeat
    body["summary"]["review_completion_percent"] = int(round(100 * reviewed / n))
    body["safety_flags"] = safety


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PatientConsentIn(BaseModel):
    """Acknowledgements stored on the session for research / audit trail."""

    recording_consent: bool = False
    research_use_acknowledged: bool = False
    consent_version: str = Field(default="video_assessment_mvp_v1", max_length=64)


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class CreateSessionRequest(BaseModel):
    encounter_id: Optional[str] = Field(None, max_length=64)
    consent: Optional[PatientConsentIn] = None
    # Virtual-care motor: condition preset (UI sends structured dict)
    clinical_context: Optional[dict[str, Any]] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class PatchSessionRequest(BaseModel):
    """Merge into session document. When ``tasks`` is set, merge by task_id."""
    mode: Optional[str] = None
    overall_status: Optional[str] = None
    completed_at: Optional[str] = None
    safety_flags: Optional[list[str]] = None
    summary: Optional[dict[str, Any]] = None
    tasks: Optional[list[dict[str, Any]]] = None
    future_ai_metrics_placeholder: Optional[dict[str, Any]] = None
    patient_consent: Optional[dict[str, Any]] = None
    clinical_context: Optional[dict[str, Any]] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SessionListItem(BaseModel):
    id: str
    patient_id: str
    encounter_id: Optional[str] = None
    protocol_name: str
    protocol_version: str
    overall_status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    review_completion_percent: Optional[int] = None


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class SessionListResponse(BaseModel):
    items: list[SessionListItem]
    total: int


# core-schema-exempt: prior-finalized-session compact summary; not reused outside this router
class PriorFinalizedSessionSummary(BaseModel):
    """Compact, comparison-ready summary. No task-level review JSON allowed here."""
    key_findings: str
    severity_level: str
    tasks_completed: int
    tasks_total: int


# core-schema-exempt: prior-finalized-session envelope; not reused outside this router
class PriorFinalizedSessionItem(BaseModel):
    """Read-only prior-session envelope for longitudinal comparison cards/tables."""
    session_id: str
    occurred_at: Optional[str] = None
    overall_status: str
    has_clips: bool = False
    summary: PriorFinalizedSessionSummary
    finalized_by: str
    finalized_at: Optional[str] = None


# core-schema-exempt: trend point payload; not reused outside this router
class PriorFinalizedTrendItem(BaseModel):
    """Compact oldest-to-newest trend point. No notes, tasks, or mutable payloads."""
    session_id: str
    occurred_at: Optional[str] = None
    finalized_at: Optional[str] = None
    severity_level: Optional[str] = None
    tasks_completed: Optional[int] = None
    tasks_total: Optional[int] = None
    has_clips: bool = False


# core-schema-exempt: comparison + trend response shape; not reused outside this router
class PriorFinalizedSessionsResponse(BaseModel):
    """Read-only comparison + trend payload from persisted finalized sessions only.

    ``sessions`` is newest-first for card/table comparison.
    ``trend_sessions`` is oldest-first for temporal summary rows.
    Both lists are intentionally compact and must not include task-level review
    payloads, clinician notes, or mutable session JSON.
    """
    sessions: list[PriorFinalizedSessionItem]
    trend_sessions: list[PriorFinalizedTrendItem] = Field(default_factory=list)


# core-schema-exempt: historical summary request body; not reused outside this router
class HistoricalSummaryRequest(BaseModel):
    """Read-only selector for already-authorized prior finalized sessions."""

    selected_session_ids: list[str] = Field(default_factory=list)


# core-schema-exempt: historical summary data-basis section; not reused outside this router
class HistoricalSummaryDataBasis(BaseModel):
    """Compact provenance basis for the advisory summary."""

    session_count: int
    has_severity_data: bool
    has_task_completion_data: bool
    has_clip_availability_data: bool


# core-schema-exempt: historical summary provenance section; not reused outside this router
class HistoricalSummaryProvenance(BaseModel):
    """Compact clinician-visible provenance reference for traceability only."""

    event_id: str
    summary_logic_version: str
    source_session_ids: list[str] = Field(default_factory=list)
    session_count: int
    source_input_fingerprint: str


# core-schema-exempt: historical summary response shape; not reused outside this router
class HistoricalSummaryResponse(BaseModel):
    """Advisory-only historical summary over compact comparison/trend fields."""

    summary_status: str
    summary_text: str
    trend_observations: list[str] = Field(default_factory=list)
    data_basis: HistoricalSummaryDataBasis
    limitations: list[str] = Field(default_factory=list)
    generated_at: str
    provenance: HistoricalSummaryProvenance


def _list_item_from_row(row: VideoAssessmentSession) -> SessionListItem:
    body = _load_session_body(row)
    summ = body.get("summary") or {}
    try:
        pct = int(summ.get("review_completion_percent", 0)) if summ else None
    except Exception:
        pct = None
    return SessionListItem(
        id=row.id,
        patient_id=row.patient_id,
        encounter_id=row.encounter_id,
        protocol_name=row.protocol_name,
        protocol_version=row.protocol_version,
        overall_status=row.overall_status,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        review_completion_percent=pct,
    )


def _comparison_context_key(row: VideoAssessmentSession, doc: dict[str, Any]) -> tuple[str, str, str]:
    clinical_context = doc.get("clinical_context") or {}
    return (
        str(row.protocol_name or doc.get("protocol_name") or ""),
        str(row.protocol_version or doc.get("protocol_version") or ""),
        str(clinical_context.get("preset_id") or ""),
    )


def _comparison_key_findings(doc: dict[str, Any]) -> str:
    summary = doc.get("summary") or {}
    for value in (
        summary.get("clinician_impression"),
        summary.get("recommended_followup"),
    ):
        text = str(value or "").strip()
        if text:
            return text
    return "No clinician summary recorded."


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _comparison_severity_level(doc: dict[str, Any]) -> str:
    summary = doc.get("summary") or {}
    declared = str(summary.get("severity_level") or "").strip().lower()
    if declared in {"none", "mild", "moderate", "severe"}:
        return declared
    safety_flags = doc.get("safety_flags") or []
    repeat_count = _safe_int(summary.get("tasks_needing_repeat") or 0)
    skipped_count = _safe_int(summary.get("tasks_skipped") or 0)
    if safety_flags:
        return "severe"
    if repeat_count > 0:
        return "moderate"
    if skipped_count > 0:
        return "mild"
    return "none"


def _comparison_has_clips(doc: dict[str, Any]) -> bool:
    for task in doc.get("tasks") or []:
        if task.get("recording_storage_ref") or task.get("recording_asset_id"):
            return True
    return False


def _comparison_finalized_by(doc: dict[str, Any]) -> str:
    for value in (
        doc.get("finalized_by"),
        (doc.get("summary") or {}).get("finalized_by"),
    ):
        text = str(value or "").strip()
        if text:
            return text
    for task in doc.get("tasks") or []:
        if task.get("clinician_review"):
            return "Clinician review"
    return "Clinician"


def _comparison_sort_fields(item: PriorFinalizedSessionItem) -> tuple[str, str]:
    return (
        str(item.finalized_at or item.occurred_at or ""),
        str(item.session_id or ""),
    )


def _trend_sort_fields(item: PriorFinalizedTrendItem) -> tuple[str, str]:
    return (
        str(item.finalized_at or item.occurred_at or ""),
        str(item.session_id or ""),
    )


def _prior_finalized_item_from_row(row: VideoAssessmentSession) -> PriorFinalizedSessionItem:
    doc = _load_session_body(row)
    summary = doc.get("summary") or {}
    finalized_at = doc.get("completed_at") or (row.updated_at.isoformat() if row.updated_at else None)
    tasks = doc.get("tasks") or []
    return PriorFinalizedSessionItem(
        session_id=row.id,
        occurred_at=finalized_at or doc.get("started_at") or (row.created_at.isoformat() if row.created_at else None),
        overall_status=str(doc.get("overall_status") or row.overall_status or ""),
        has_clips=_comparison_has_clips(doc),
        summary=PriorFinalizedSessionSummary(
            key_findings=_comparison_key_findings(doc),
            severity_level=_comparison_severity_level(doc),
            tasks_completed=_safe_int(summary.get("tasks_completed") or 0),
            tasks_total=len(tasks),
        ),
        finalized_by=_comparison_finalized_by(doc),
        finalized_at=finalized_at,
    )


def _prior_finalized_trend_item_from_row(row: VideoAssessmentSession) -> PriorFinalizedTrendItem:
    doc = _load_session_body(row)
    summary = doc.get("summary") or {}
    finalized_at = doc.get("completed_at") or (row.updated_at.isoformat() if row.updated_at else None)
    severity_level = str(summary.get("severity_level") or "").strip().lower() or None
    if severity_level not in {"none", "mild", "moderate", "severe"}:
        severity_level = _comparison_severity_level(doc)
    tasks_total = len(doc.get("tasks") or [])
    return PriorFinalizedTrendItem(
        session_id=row.id,
        occurred_at=finalized_at or doc.get("started_at") or (row.created_at.isoformat() if row.created_at else None),
        finalized_at=finalized_at,
        severity_level=severity_level,
        tasks_completed=_safe_int(summary.get("tasks_completed"), None),
        tasks_total=tasks_total if tasks_total > 0 else None,
        has_clips=_comparison_has_clips(doc),
    )


def _collect_prior_finalized_payload(
    actor: AuthenticatedActor,
    db: Session,
    session_id: str,
) -> tuple[VideoAssessmentSession, list[PriorFinalizedSessionItem], list[PriorFinalizedTrendItem]]:
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _gate_session_clinician(actor, row, db)

    current_doc = _load_session_body(row)
    context_key = _comparison_context_key(row, current_doc)
    rows = (
        _sessions_query_for_clinician(actor, db)
        .filter(VideoAssessmentSession.patient_id == row.patient_id)
        .filter(VideoAssessmentSession.id != row.id)
        .filter(VideoAssessmentSession.overall_status == "finalized")
        .order_by(VideoAssessmentSession.updated_at.desc(), VideoAssessmentSession.id.desc())
        .all()
    )

    sessions: list[PriorFinalizedSessionItem] = []
    trend_sessions: list[PriorFinalizedTrendItem] = []
    for candidate in rows:
        candidate_doc = _load_session_body(candidate)
        if not _is_finalized(candidate_doc):
            continue
        if _comparison_context_key(candidate, candidate_doc) != context_key:
            continue
        sessions.append(_prior_finalized_item_from_row(candidate))
        trend_sessions.append(_prior_finalized_trend_item_from_row(candidate))
    sessions.sort(key=_comparison_sort_fields, reverse=True)
    trend_sessions.sort(key=_trend_sort_fields)
    return row, sessions, trend_sessions


def _historical_summary_data_basis(trend_sessions: list[PriorFinalizedTrendItem]) -> HistoricalSummaryDataBasis:
    return HistoricalSummaryDataBasis(
        session_count=len(trend_sessions),
        has_severity_data=any(item.severity_level is not None for item in trend_sessions),
        has_task_completion_data=any(
            item.tasks_completed is not None and item.tasks_total is not None and item.tasks_total > 0
            for item in trend_sessions
        ),
        has_clip_availability_data=any(isinstance(item.has_clips, bool) for item in trend_sessions),
    )


def _safe_ratio(completed: Optional[int], total: Optional[int]) -> Optional[float]:
    if completed is None or total is None or total <= 0:
        return None
    return completed / total


def _classify_numeric_trend(values: list[float], *, decrease_label: str, same_label: str, increase_label: str) -> str:
    if len(values) < 2:
        return "insufficient data"
    deltas = [values[idx] - values[idx - 1] for idx in range(1, len(values))]
    if all(delta == 0 for delta in deltas):
        return same_label
    if all(delta <= 0 for delta in deltas) and any(delta < 0 for delta in deltas):
        return decrease_label
    if all(delta >= 0 for delta in deltas) and any(delta > 0 for delta in deltas):
        return increase_label
    return "mixed"


def _severity_rank(level: Optional[str]) -> Optional[int]:
    return {
        "none": 0,
        "mild": 1,
        "moderate": 2,
        "severe": 3,
    }.get(str(level or "").strip().lower())


def _classify_clip_trend(values: list[bool]) -> str:
    if len(values) < 2:
        return "insufficient data"
    return "consistent" if all(value == values[0] for value in values) else "inconsistent"


def _historical_summary_observations(trend_sessions: list[PriorFinalizedTrendItem]) -> tuple[list[str], list[str], HistoricalSummaryDataBasis]:
    basis = _historical_summary_data_basis(trend_sessions)
    limitations: list[str] = []
    severity_values = [_severity_rank(item.severity_level) for item in trend_sessions if _severity_rank(item.severity_level) is not None]
    completion_values = [
        ratio
        for ratio in (_safe_ratio(item.tasks_completed, item.tasks_total) for item in trend_sessions)
        if ratio is not None
    ]
    clip_values = [item.has_clips for item in trend_sessions if isinstance(item.has_clips, bool)]

    severity_trend = _classify_numeric_trend(
        severity_values,
        decrease_label="improved",
        same_label="stable",
        increase_label="worsened",
    )
    completion_trend = _classify_numeric_trend(
        completion_values,
        decrease_label="declined",
        same_label="stable",
        increase_label="improved",
    )
    clip_trend = _classify_clip_trend(clip_values)

    observations: list[str] = []
    if basis.has_severity_data:
        observations.append(f"Severity appears {severity_trend} across available finalized sessions.")
        if severity_trend in {"mixed", "insufficient data"}:
            limitations.append("Severity labels are incomplete or mixed across the selected finalized sessions.")
    else:
        limitations.append("Severity labels are not available for the selected finalized sessions.")

    if basis.has_task_completion_data:
        observations.append(f"Task completion appears {completion_trend} across available finalized sessions.")
        if completion_trend in {"mixed", "insufficient data"}:
            limitations.append("Task completion data are incomplete or mixed across the selected finalized sessions.")
    else:
        limitations.append("Task completion counts are not available for the selected finalized sessions.")

    if basis.has_clip_availability_data:
        observations.append(f"Clip availability is {clip_trend} across the selected finalized sessions.")
        if clip_trend in {"inconsistent", "insufficient data"}:
            limitations.append("Clip availability varies across the selected finalized sessions.")
    else:
        limitations.append("Clip availability is not available for the selected finalized sessions.")

    if len(trend_sessions) < 2:
        limitations.append("Fewer than two finalized sessions are available, so temporal interpretation is limited.")

    return observations, limitations, basis


def _summarize_allowed_findings(items: list[PriorFinalizedSessionItem]) -> Optional[str]:
    snippets: list[str] = []
    for item in items[:2]:
        text = str(item.summary.key_findings or "").strip()
        if not text or text == "No clinician summary recorded.":
            continue
        snippets.append(text.rstrip("."))
    if not snippets:
        return None
    if len(snippets) == 1:
        return f"Selected finalized-session summaries note: {snippets[0]}."
    return f"Selected finalized-session summaries note: {snippets[0]}; {snippets[1]}."

def _historical_summary_compact_source_basis(
    sessions: list[PriorFinalizedSessionItem],
    trend_sessions: list[PriorFinalizedTrendItem],
    basis: HistoricalSummaryDataBasis,
) -> dict[str, Any]:
    return {
        "source_session_ids": [item.session_id for item in sessions],
        "session_count": len(trend_sessions),
        "has_severity_data": basis.has_severity_data,
        "has_task_completion_data": basis.has_task_completion_data,
        "has_clip_availability_data": basis.has_clip_availability_data,
        "fields_used": [
            "occurred_at",
            "finalized_at",
            "summary.key_findings",
            "summary.severity_level",
            "summary.tasks_completed",
            "summary.tasks_total",
            "has_clips",
        ],
    }


def _historical_summary_input_fingerprint(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _normalized_selected_session_ids(items: list[PriorFinalizedSessionItem]) -> list[str]:
    return [item.session_id for item in items]


def _historical_summary_source_fingerprint(
    sessions: list[PriorFinalizedSessionItem],
    trend_sessions: list[PriorFinalizedTrendItem],
    basis: HistoricalSummaryDataBasis,
) -> str:
    return _historical_summary_input_fingerprint(
        {
            "sessions": [item.model_dump() for item in sessions],
            "trend_sessions": [item.model_dump() for item in trend_sessions],
            "basis": basis.model_dump(),
        }
    )


def _latest_historical_summary_audit(
    db: Session,
    *,
    actor_id: str,
    session_id: str,
) -> tuple[Optional[AuditEventRecord], Optional[dict[str, Any]]]:
    row = (
        db.query(AuditEventRecord)
        .filter(
            AuditEventRecord.target_type == "video_assessment",
            AuditEventRecord.target_id == session_id[:64],
            AuditEventRecord.actor_id == actor_id,
            AuditEventRecord.action == "video_assessment.historical_ai_summary_generated",
        )
        .order_by(AuditEventRecord.id.desc())
        .first()
    )
    if row is None:
        return None, None
    try:
        payload = json.loads(row.note or "{}")
        if not isinstance(payload, dict):
            return row, None
        return row, payload
    except Exception:
        return row, None


def _historical_summary_status(
    *,
    previous_payload: Optional[dict[str, Any]],
    selected_prior_session_ids: list[str],
    source_input_fingerprint: str,
) -> str:
    if not previous_payload:
        return "fresh"
    prev_logic_version = str(previous_payload.get("summary_logic_version") or "")
    prev_selected_ids = [
        str(value).strip()
        for value in (previous_payload.get("selected_prior_session_ids") or [])
        if str(value).strip()
    ]
    prev_fingerprint = str(((previous_payload.get("provenance") or {}).get("source_input_fingerprint")) or "")
    # Regeneration status reflects compact basis/version lineage only. It must
    # not be interpreted as a clinical meaning change in the summary text.
    if prev_logic_version and prev_logic_version != _HISTORICAL_SUMMARY_LOGIC_VERSION:
        return "regenerated_logic_changed"
    if prev_selected_ids != selected_prior_session_ids:
        return "regenerated_selection_changed"
    if prev_fingerprint and prev_fingerprint != source_input_fingerprint:
        return "regenerated_source_changed"
    return "unchanged"


"""
Summarization-only endpoint support over already-authorized compact comparison
fields. This must not expand into recommendation, diagnosis, or broader review
payload generation without a separate design and safety review step.
"""
def _build_historical_summary_response(
    *,
    session_id: str,
    selected_ids: list[str],
    sessions: list[PriorFinalizedSessionItem],
    trend_sessions: list[PriorFinalizedTrendItem],
    event_id: str,
    generated_at: str,
    source_input_fingerprint: str,
    summary_status: str,
) -> HistoricalSummaryResponse:
    selected_set = {str(value).strip() for value in selected_ids if str(value).strip()}
    selected_sessions = [item for item in sessions if not selected_set or item.session_id in selected_set]
    selected_trend_sessions = [item for item in trend_sessions if not selected_set or item.session_id in selected_set]
    observations, limitations, basis = _historical_summary_observations(selected_trend_sessions)
    selected_count = len(selected_sessions)
    summary_parts = [f"Historical review covers {selected_count} finalized session{'s' if selected_count != 1 else ''} in the selected comparison set."]
    findings_summary = _summarize_allowed_findings(selected_sessions)
    if findings_summary:
        summary_parts.append(findings_summary)
    if observations:
        summary_parts.append(" ".join(observations))
    else:
        summary_parts.append("Available finalized-session data are too sparse for a stronger descriptive pattern summary.")
    if not limitations:
        limitations.append("This summary uses compact finalized-session comparison fields only and does not replace full clip or chart review.")
    else:
        limitations.append("This summary uses compact finalized-session comparison fields only and does not replace full clip or chart review.")
    return HistoricalSummaryResponse(
        summary_status=summary_status,
        summary_text=" ".join(summary_parts),
        trend_observations=observations or ["Available finalized-session data are too sparse for a stronger descriptive pattern summary."],
        data_basis=basis,
        limitations=limitations,
        generated_at=generated_at,
        provenance=HistoricalSummaryProvenance(
            event_id=event_id,
            summary_logic_version=_HISTORICAL_SUMMARY_LOGIC_VERSION,
            source_session_ids=[item.session_id for item in selected_sessions],
            session_count=len(selected_trend_sessions),
            source_input_fingerprint=source_input_fingerprint,
        ),
    )


def _write_historical_summary_audit(
    db: Session,
    *,
    actor: AuthenticatedActor,
    session_id: str,
    selected_sessions: list[PriorFinalizedSessionItem],
    trend_sessions: list[PriorFinalizedTrendItem],
    basis: HistoricalSummaryDataBasis,
    generated_at: str,
    source_input_fingerprint: str,
    summary_status: str,
    previous_payload: Optional[dict[str, Any]],
) -> str:
    compact_source_basis = _historical_summary_compact_source_basis(selected_sessions, trend_sessions, basis)
    previous_provenance = previous_payload.get("provenance") if isinstance(previous_payload, dict) else None
    event_id = f"va-historical-summary-{uuid.uuid4().hex[:20]}"
    provenance_payload = {
        "event_type": "historical_ai_summary_generated",
        "event_id": event_id,
        "session_id": session_id,
        "actor_role": actor.role,
        "generated_at": generated_at,
        "selected_prior_session_ids": [item.session_id for item in selected_sessions],
        "summary_logic_version": _HISTORICAL_SUMMARY_LOGIC_VERSION,
        "summary_status": summary_status,
        "prior_summary_ref": (
            {
                "event_id": previous_payload.get("event_id"),
                "summary_logic_version": previous_payload.get("summary_logic_version"),
                "selected_prior_session_ids": previous_payload.get("selected_prior_session_ids") or [],
                "source_input_fingerprint": previous_provenance.get("source_input_fingerprint"),
            }
            if isinstance(previous_payload, dict) and isinstance(previous_provenance, dict)
            else None
        ),
        "regeneration_reason": summary_status,
        "provenance": {
            **compact_source_basis,
            "source_input_fingerprint": source_input_fingerprint,
        },
    }
    # Privacy note: provenance must stay compact and lineage-focused.
    # Do not store raw notes, nested review JSON, clip payloads, or hidden draft
    # content in this audit path.
    create_audit_event(
        db,
        event_id=event_id,
        target_id=session_id[:64],
        target_type="video_assessment",
        action="video_assessment.historical_ai_summary_generated",
        role=actor.role if actor.role in {"guest", "clinician", "admin"} else "clinician",
        actor_id=actor.actor_id,
        note=json.dumps(provenance_payload, separators=(",", ":"), sort_keys=True),
        created_at=generated_at,
    )
    return event_id


@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    patient_id: Optional[str] = Query(None, description="Filter to one patient (clinician; must be in your clinic)"),
    limit: int = Query(50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SessionListResponse:
    """List video assessment sessions the caller may access."""
    if actor.role == "patient":
        patient = _require_patient(actor, db)
        q = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.patient_id == patient.id)
    elif actor.role == "admin":
        q = db.query(VideoAssessmentSession)
    else:
        require_minimum_role(actor, "clinician")
        q = _sessions_query_for_clinician(actor, db)
        if patient_id:
            exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
            if not exists:
                raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
            try:
                require_patient_owner(actor, clinic_id)
            except ApiServiceError as exc:
                if exc.status_code == 403:
                    raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404) from exc
                raise
            q = q.filter(VideoAssessmentSession.patient_id == patient_id)

    rows = (
        q.order_by(VideoAssessmentSession.updated_at.desc())
        .limit(limit)
        .all()
    )
    items = [_list_item_from_row(r) for r in rows]
    who = "admin" if actor.role == "admin" else ("patient" if actor.role == "patient" else "clinician")
    _audit_va(
        db,
        actor=actor,
        action="session_list",
        target_id=actor.actor_id,
        note=f"role={who} n={len(items)}" + (f" patient_filter={patient_id}" if patient_id else ""),
    )
    return SessionListResponse(items=items, total=len(items))


@router.get("/sessions/{session_id}/prior-finalized-sessions", response_model=PriorFinalizedSessionsResponse)
def list_prior_finalized_sessions(
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PriorFinalizedSessionsResponse:
    """List read-only finalized sessions for same patient + protocol/context, newest first.

    The response is intentionally compact for UI comparison only and must not
    include task-level clinician review payloads or other nested detail JSON.
    """
    require_minimum_role(actor, "clinician")
    _, sessions, trend_sessions = _collect_prior_finalized_payload(actor, db, session_id)

    _audit_va(
        db,
        actor=actor,
        action="prior_finalized_sessions_list",
        target_id=session_id,
        note=f"n={len(sessions)}",
    )
    return PriorFinalizedSessionsResponse(sessions=sessions, trend_sessions=trend_sessions)


@router.post("/sessions/{session_id}/historical-ai-summary", response_model=HistoricalSummaryResponse)
def generate_historical_ai_summary(
    body: HistoricalSummaryRequest,
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HistoricalSummaryResponse:
    require_minimum_role(actor, "clinician")
    _, sessions, trend_sessions = _collect_prior_finalized_payload(actor, db, session_id)
    selected_set = {str(value).strip() for value in (body.selected_session_ids or []) if str(value).strip()}
    selected_sessions = [item for item in sessions if not selected_set or item.session_id in selected_set]
    selected_trend_sessions = [item for item in trend_sessions if not selected_set or item.session_id in selected_set]
    _, _, basis = _historical_summary_observations(selected_trend_sessions)
    selected_prior_session_ids = _normalized_selected_session_ids(selected_sessions)
    source_input_fingerprint = _historical_summary_source_fingerprint(
        selected_sessions,
        selected_trend_sessions,
        basis,
    )
    _, previous_payload = _latest_historical_summary_audit(
        db,
        actor_id=actor.actor_id,
        session_id=session_id,
    )
    summary_status = _historical_summary_status(
        previous_payload=previous_payload,
        selected_prior_session_ids=selected_prior_session_ids,
        source_input_fingerprint=source_input_fingerprint,
    )
    generated_at = datetime.now(timezone.utc).isoformat()
    event_id = _write_historical_summary_audit(
        db,
        actor=actor,
        session_id=session_id,
        selected_sessions=selected_sessions,
        trend_sessions=selected_trend_sessions,
        basis=basis,
        generated_at=generated_at,
        source_input_fingerprint=source_input_fingerprint,
        summary_status=summary_status,
        previous_payload=previous_payload,
    )
    response = _build_historical_summary_response(
        session_id=session_id,
        selected_ids=body.selected_session_ids or [],
        sessions=sessions,
        trend_sessions=trend_sessions,
        event_id=event_id,
        generated_at=generated_at,
        source_input_fingerprint=source_input_fingerprint,
        summary_status=summary_status,
    )
    return response


@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    patient = _require_patient(actor, db)
    consent_payload: Optional[dict[str, Any]] = None
    if body.consent is not None:
        consent_payload = body.consent.model_dump()
        consent_payload["consent_recorded_at"] = datetime.now(timezone.utc).isoformat()
    doc = _new_session_document(
        patient_id=patient.id,
        encounter_id=body.encounter_id,
        consent=consent_payload,
    )
    if body.clinical_context is not None:
        merged_cc = {**(doc.get("clinical_context") or {}), **body.clinical_context}
        doc["clinical_context"] = merged_cc
    sid = doc["id"]
    row = VideoAssessmentSession(
        id=sid,
        patient_id=patient.id,
        encounter_id=body.encounter_id,
        protocol_name=PROTOCOL_NAME,
        protocol_version=PROTOCOL_VERSION,
        overall_status="in_progress",
        session_json=json.dumps(doc, separators=(",", ":"), default=str),
    )
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)
    _log.info("video_assessment session created id=%s patient=%s", sid, patient.id)
    _audit_va(db, actor=actor, action="session_created", target_id=sid, note=f"patient_id={patient.id}")
    return _load_session_body(row)


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role == "admin":
        _audit_va(db, actor=actor, action="session_read", target_id=session_id, note="admin_json_fetch")
    elif actor.role == "patient":
        patient = _require_patient(actor, db)
        _gate_session_patient(row, patient)
        _audit_va(db, actor=actor, action="session_read", target_id=session_id, note="patient_json_fetch")
    else:
        _gate_session_clinician(actor, row, db)
        _audit_va(db, actor=actor, action="session_read", target_id=session_id, note="clinician_json_fetch")

    return _load_session_body(row)


@router.patch("/sessions/{session_id}")
def patch_session(
    body: PatchSessionRequest,
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role == "admin":
        patient = None
    elif actor.role == "patient":
        patient = _require_patient(actor, db)
        _gate_session_patient(row, patient)
    else:
        _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    if _is_finalized(doc):
        raise ApiServiceError(
            code="session_finalized",
            message="This session is finalized and cannot be modified. Contact an administrator if a correction is required.",
            status_code=409,
        )
    if body.patient_consent is not None:
        doc["patient_consent"] = {**(doc.get("patient_consent") or {}), **body.patient_consent}
    if body.clinical_context is not None:
        doc["clinical_context"] = {**(doc.get("clinical_context") or {}), **body.clinical_context}
    if body.mode is not None:
        doc["mode"] = body.mode
    if body.overall_status is not None:
        doc["overall_status"] = body.overall_status
        row.overall_status = body.overall_status
    if body.completed_at is not None:
        doc["completed_at"] = body.completed_at
    if body.safety_flags is not None:
        doc["safety_flags"] = body.safety_flags
    if body.summary is not None:
        doc["summary"] = {**(doc.get("summary") or {}), **body.summary}
    if body.future_ai_metrics_placeholder is not None:
        doc["future_ai_metrics_placeholder"] = body.future_ai_metrics_placeholder
    if body.tasks is not None:
        doc["tasks"] = _merge_task_updates(doc.get("tasks") or [], body.tasks)
    _recalc_summary(doc)
    _save_session_body(row, doc)
    db.commit()
    role_note = "patient" if actor.role == "patient" else ("admin" if actor.role == "admin" else "clinician")
    _audit_va(db, actor=actor, action="session_patched", target_id=session_id, note=f"{role_note}_update")
    return doc


def _va_storage_dir(patient_id: str, session_id: str) -> FsPath:
    root = FsPath(get_settings().media_storage_root)
    d = root / "video_assessments" / patient_id / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/sessions/{session_id}/tasks/{task_id}/upload", status_code=201)
async def upload_task_video(
    session_id: str = PathParam(..., min_length=8),
    task_id: str = PathParam(..., min_length=2),
    file: UploadFile = File(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Patient uploads a single task clip; stored on disk under media root."""
    patient = _require_patient(actor, db)
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _gate_session_patient(row, patient)

    doc_pre = _load_session_body(row)
    if _is_finalized(doc_pre):
        raise ApiServiceError(
            code="session_finalized",
            message="Session is finalized; uploads are disabled.",
            status_code=409,
        )

    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in _ALLOWED_VIDEO_MIME:
        raise ApiServiceError(
            code="invalid_mime_type",
            message=f"Video MIME '{file.content_type}' is not allowed.",
            status_code=422,
        )
    raw = await file.read()
    if not raw:
        raise ApiServiceError(code="empty_file", message="Empty upload.", status_code=422)
    if len(raw) > _MAX_TASK_VIDEO_BYTES:
        raise ApiServiceError(code="file_too_large", message="Clip exceeds size limit.", status_code=422)
    if not media_storage.looks_like_video(raw[:65536]):
        raise ApiServiceError(
            code="invalid_file_content",
            message="Bytes do not match a known video container.",
            status_code=422,
        )

    ext = ".webm"
    if mime == "video/mp4":
        ext = ".mp4"
    elif mime == "video/quicktime":
        ext = ".mov"

    rid = str(uuid.uuid4())
    out_dir = _va_storage_dir(patient.id, session_id)
    rel_ref = f"video_assessments/{patient.id}/{session_id}/{task_id}_{rid}{ext}"
    abs_path = FsPath(get_settings().media_storage_root) / rel_ref
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(raw)

    doc = _load_session_body(row)
    tasks = doc.get("tasks") or []
    merged = _merge_task_updates(
        tasks,
        [
            {
                "task_id": task_id,
                "recording_asset_id": rid,
                "recording_storage_ref": rel_ref.replace("\\", "/"),
                "recording_status": "accepted",
            }
        ],
    )
    doc["tasks"] = merged
    _recalc_summary(doc)
    _save_session_body(row, doc)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    _audit_va(
        db,
        actor=actor,
        action="task_video_uploaded",
        target_id=session_id,
        note=f"task_id={task_id} bytes={len(raw)} asset={rid}",
    )
    return {"recording_asset_id": rid, "recording_storage_ref": rel_ref.replace("\\", "/"), "session": doc}


@router.get("/sessions/{session_id}/tasks/{task_id}/video")
def stream_task_video(
    session_id: str = PathParam(..., min_length=8),
    task_id: str = PathParam(..., min_length=2),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role == "admin":
        pass
    elif actor.role == "patient":
        patient = _require_patient(actor, db)
        _gate_session_patient(row, patient)
    else:
        _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    ref = None
    for t in doc.get("tasks") or []:
        if t.get("task_id") == task_id:
            ref = t.get("recording_storage_ref")
            break
    if not ref:
        raise ApiServiceError(code="no_recording", message="No recording for this task.", status_code=404)

    root = FsPath(get_settings().media_storage_root)
    path = (root / ref).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as exc:
        raise ApiServiceError(code="invalid_path", message="Invalid storage reference.", status_code=400) from exc
    if not path.is_file():
        raise ApiServiceError(code="not_found", message="Recording file missing.", status_code=404)

    mime = "video/webm"
    if path.suffix.lower() == ".mp4":
        mime = "video/mp4"
    elif path.suffix.lower() == ".mov":
        mime = "video/quicktime"
    _audit_va(db, actor=actor, action="task_video_viewed", target_id=session_id, note=f"task_id={task_id}")
    return FileResponse(path, media_type=mime)


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class FinalizeRequest(BaseModel):
    """Optional final impression fields stored in summary."""
    clinician_impression: Optional[str] = None
    recommended_followup: Optional[str] = None


@router.post("/sessions/{session_id}/finalize")
def finalize_session(
    body: FinalizeRequest,
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)
    _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    if _is_finalized(doc):
        raise ApiServiceError(
            code="session_already_finalized",
            message="Session was already finalized.",
            status_code=409,
        )
    doc["overall_status"] = "finalized"
    doc["completed_at"] = datetime.now(timezone.utc).isoformat()
    row.overall_status = "finalized"
    summ = doc.get("summary") or {}
    if body.clinician_impression is not None:
        summ["clinician_impression"] = body.clinician_impression
    if body.recommended_followup is not None:
        summ["recommended_followup"] = body.recommended_followup
    doc["summary"] = summ
    _recalc_summary(doc)
    _save_session_body(row, doc)
    db.commit()
    _audit_va(db, actor=actor, action="session_finalized", target_id=session_id, note="review_complete")
    return doc


@router.get("/sessions/{session_id}/export.json")
def export_session_json(
    session_id: str = PathParam(..., min_length=8),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Research record export: full session JSON + export manifest (no raw video bytes).

    Video clips remain server-side; ``recording_storage_ref`` references paths only.
    """
    row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
    if row is None:
        raise ApiServiceError(code="not_found", message="Session not found.", status_code=404)

    if actor.role == "admin":
        pass
    elif actor.role == "patient":
        patient = _require_patient(actor, db)
        _gate_session_patient(row, patient)
    else:
        require_minimum_role(actor, "clinician")
        _gate_session_clinician(actor, row, db)

    doc = _load_session_body(row)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "export_kind": "video_assessment_session",
        "export_version": 1,
        "exported_at": now,
        "session": doc,
        "disclaimer": (
            "Structured observation data for clinician review and authorized research only. "
            "Not a standalone diagnosis; interpret with clinical judgment and protocol IRB approval."
        ),
    }
    _audit_va(db, actor=actor, action="session_export_json", target_id=session_id, note="research_bundle")
    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": f'attachment; filename="video_assessment_{session_id}.json"',
        },
    )

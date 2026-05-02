"""Labs / Blood Biomarkers Analyzer — decision-support payload + audit (MVP)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_dt(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        if iso.endswith("Z"):
            iso = iso[:-1] + "+00:00"
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.repositories.labs import (
    get_patient_display_name,
    get_patient_profile,
    insert_lab_result_batch,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.schemas.labs_analyzer import (
    LabReviewAuditEvent,
    LabsAnalyzerPagePayload,
)
from app.services.labs_analyzer import (
    append_audit_event,
    build_labs_analyzer_payload,
    get_audit_trail,
    recompute_and_payload,
)

router = APIRouter(prefix="/api/v1/labs/analyzer", tags=["Labs Analyzer"])


# core-schema-exempt: minimal router-local annotation request body; not reused outside this router
class AnnotationRequest(BaseModel):
    """Accept the simple PR #457 frontend shape `{message}` AND the richer
    original `{target_type,target_id,text,tags}` shape for forward-compat.
    Either `message` or `text` must be present and non-empty.
    """

    # Frontend (PR #457) shape
    message: Optional[str] = Field(default=None, max_length=8000)
    # Richer / structured shape (kept for callers that target a specific result/flag)
    target_type: Optional[str] = Field(
        default=None, description="interpretation | result | flag"
    )
    target_id: Optional[str] = None
    text: Optional[str] = Field(default=None, max_length=8000)
    tags: list[str] = Field(default_factory=list)


# core-schema-exempt: minimal router-local clinician review-note body; not reused outside this router
class ReviewNoteRequest(BaseModel):
    """Accept the simple PR #457 frontend shape `{message}` AND the richer
    original `{note, acknowledged_alert_ids, evidence_ack_ids}` shape.
    Either `message` or `note` must be present and non-empty.
    """

    # Frontend (PR #457) shape
    message: Optional[str] = Field(default=None, max_length=8000)
    # Richer / structured shape
    note: Optional[str] = Field(default=None, max_length=8000)
    acknowledged_alert_ids: list[str] = Field(default_factory=list)
    evidence_ack_ids: list[str] = Field(default_factory=list)


# core-schema-exempt: minimal router-local recompute trigger body; not reused outside this router
class RecomputeRequest(BaseModel):
    reason: str = "manual"
    options: dict[str, Any] = Field(default_factory=dict)


# core-schema-exempt: minimal router-local lab-result ingest item; not reused outside this router
class LabResultUpsertItem(BaseModel):
    """Single lab result. Accepts both the original cursor shape
    (`analyte_code` + `analyte_display_name` + `value_numeric` + `unit_ucum`) and
    the simpler PR #457 frontend shape (`analyte` + `value` + `unit` + `panel`).
    `_normalize()` maps frontend fields to the canonical persistence fields.
    """

    # Original (richer) cursor fields
    analyte_code: Optional[str] = Field(default=None, max_length=64)
    analyte_display_name: Optional[str] = Field(default=None, max_length=255)
    panel_name: Optional[str] = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    unit_ucum: Optional[str] = None
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None
    ref_text: Optional[str] = None
    sample_collected_at: Optional[str] = None
    source: str = "manual"

    # PR #457 frontend aliases
    analyte: Optional[str] = Field(default=None, max_length=255)
    value: Optional[float] = None
    unit: Optional[str] = None
    panel: Optional[str] = None


# core-schema-exempt: minimal router-local lab-results batch wrapper; not reused outside this router
class LabResultsBatchRequest(BaseModel):
    """Accept either `{items: [...]}` (cursor shape) or a single bare result
    object (PR #457 frontend shape — clinician adds one row at a time)."""

    items: Optional[list[LabResultUpsertItem]] = Field(
        default=None, max_length=80
    )
    # Single-result shape (frontend posts these fields at the top level)
    analyte: Optional[str] = Field(default=None, max_length=255)
    analyte_code: Optional[str] = Field(default=None, max_length=64)
    analyte_display_name: Optional[str] = Field(default=None, max_length=255)
    panel: Optional[str] = None
    panel_name: Optional[str] = None
    value: Optional[float] = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    unit_ucum: Optional[str] = None
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None
    ref_text: Optional[str] = None
    sample_collected_at: Optional[str] = None
    source: Optional[str] = None

    def resolved_items(self) -> list["LabResultUpsertItem"]:
        if self.items:
            return list(self.items)
        # Build a single item from the top-level fields (frontend shape)
        single = LabResultUpsertItem(
            analyte_code=self.analyte_code,
            analyte_display_name=self.analyte_display_name,
            panel_name=self.panel_name,
            value_numeric=self.value_numeric,
            value_text=self.value_text,
            unit_ucum=self.unit_ucum,
            ref_low=self.ref_low,
            ref_high=self.ref_high,
            ref_text=self.ref_text,
            sample_collected_at=self.sample_collected_at,
            source=self.source or "manual",
            analyte=self.analyte,
            value=self.value,
            unit=self.unit,
            panel=self.panel,
        )
        return [single]


def _normalize_item(it: LabResultUpsertItem) -> dict:
    """Resolve frontend aliases to canonical persistence fields.

    Frontend sends `analyte`/`value`/`unit`/`panel`; persistence wants
    `analyte_display_name`/`value_numeric`/`unit_ucum`/`panel_name` plus a
    machine-readable `analyte_code`. We synthesize a code from the display
    name when the frontend doesn't provide one.
    """
    display = (
        it.analyte_display_name
        or it.analyte
        or ""
    ).strip()
    code = (it.analyte_code or display.lower().replace(" ", "_") or "unknown")[:64].strip()
    if not display:
        raise HTTPException(
            status_code=422,
            detail="lab result requires an analyte name (analyte / analyte_display_name)",
        )
    value_numeric = it.value_numeric if it.value_numeric is not None else it.value
    return {
        "analyte_code": code,
        "analyte_display_name": display[:255],
        "panel_name": it.panel_name or it.panel,
        "value_numeric": value_numeric,
        "value_text": it.value_text,
        "unit_ucum": it.unit_ucum or it.unit,
        "ref_low": it.ref_low,
        "ref_high": it.ref_high,
        "ref_text": it.ref_text,
        "sample_collected_at": _parse_dt(it.sample_collected_at),
        "source": it.source or "manual",
    }


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _patient_display_name(db: Session, patient_id: str) -> Optional[str]:
    return get_patient_display_name(db, patient_id)


def _patient_profile(db: Session, patient_id: str) -> tuple[Optional[str], Optional[str]]:
    return get_patient_profile(db, patient_id)


# ── PR #457 frontend contract adapters ─────────────────────────────────────
# PR #457 (already-merged frontend) reads the simple shape:
#   { patient_id, patient_name, captured_at, panels: [{name, results:[{analyte,
#     value, unit, ref_low, ref_high, status, captured_at, note?}]}],
#     flags:   [{analyte, severity, mechanism, recommendation, references?}],
#     prior_results?: [{captured_at, analyte, value}] }
# Cursor's service builds a much richer LabsAnalyzerPagePayload. To keep PR #457
# working without rewriting the frontend (per the playbook), these helpers fold
# the rich payload into the simple shape and return BOTH (rich fields are
# preserved as additive top-level keys for callers that want them).


def _status_from_record(rec: Any) -> str:
    """Map LabResultRecord criticality/abnormality_direction to PR #457's status."""
    crit = (getattr(rec, "criticality", "") or "").lower()
    direction = (getattr(rec, "abnormality_direction", "") or "").lower()
    if crit in ("high", "critical"):
        return "critical"
    if direction == "low":
        return "low"
    if direction == "high":
        return "high"
    return "normal"


def _severity_for_alert(level: str) -> str:
    """Map escalation_level -> PR #457 severity."""
    lvl = (level or "").lower()
    if lvl in ("emergent",):
        return "critical"
    if lvl in ("urgent",):
        return "major"
    return "monitor"


def _fold_to_pr457_shape(payload: LabsAnalyzerPagePayload) -> dict[str, Any]:
    """Return a dict with PR #457 simple top-level fields PLUS the rich payload.

    The frontend reads only `patient_id, patient_name, captured_at, panels,
    flags, prior_results`. Everything else is additive and harmless to omit.
    """
    rich = payload.model_dump()

    # Group results into panels keyed by panel_name
    panels_by_name: dict[str, list[dict[str, Any]]] = {}
    panel_order: list[str] = []
    prior_results: list[dict[str, Any]] = []
    for rec in payload.results:
        panel_name = (rec.panel_name or "General").strip() or "General"
        if panel_name not in panels_by_name:
            panels_by_name[panel_name] = []
            panel_order.append(panel_name)
        panels_by_name[panel_name].append(
            {
                "analyte": rec.analyte_display_name or rec.analyte_code,
                "value": rec.value_numeric,
                "unit": rec.unit_ucum or "",
                "ref_low": rec.reference_range.low if rec.reference_range else None,
                "ref_high": rec.reference_range.high if rec.reference_range else None,
                "status": _status_from_record(rec),
                "captured_at": rec.sample_collected_at,
                "note": rec.value_text or None,
            }
        )
        prior_results.append(
            {
                "captured_at": rec.sample_collected_at,
                "analyte": rec.analyte_display_name or rec.analyte_code,
                "value": rec.value_numeric,
            }
        )

    panels = [
        {"name": name, "results": panels_by_name[name]} for name in panel_order
    ]

    # Flags = critical alerts + medication/safety recommendations
    flags: list[dict[str, Any]] = []
    for alert in payload.critical_alerts:
        flags.append(
            {
                "analyte": alert.analyte_display_name,
                "severity": _severity_for_alert(alert.escalation_level),
                "mechanism": alert.message_clinical,
                "recommendation": alert.message_clinical,
                "references": [],
            }
        )
    for rec in payload.recommendations:
        if rec.priority == "P0":
            severity = "critical"
        elif rec.priority == "P1":
            severity = "major"
        else:
            severity = "monitor"
        flags.append(
            {
                "analyte": (rec.linked_result_ids[0] if rec.linked_result_ids else rec.type),
                "severity": severity,
                "mechanism": rec.text,
                "recommendation": rec.text,
                "references": [
                    {
                        "pmid": link.evidence_id,
                        "title": link.title,
                        "year": None,
                        "journal": None,
                    }
                    for link in (rec.evidence_links or [])
                ],
            }
        )

    # Splice the simple shape into the rich payload (rich keys remain available)
    rich.update(
        {
            "patient_id": payload.patient_id,
            "patient_name": payload.patient_name,
            "captured_at": payload.generated_at,
            "panels": panels,
            "flags": flags,
            "prior_results": prior_results,
        }
    )
    return rich


_AUDIT_KIND_MAP = {
    "view": "recompute",
    "ack_critical": "annotation",
    "note": "review-note",
    "override": "annotation",
    "annotation": "annotation",
    "recompute_requested": "recompute",
}


def _audit_event_to_pr457(event: LabReviewAuditEvent) -> dict[str, Any]:
    """Map LabReviewAuditEvent to PR #457's audit item shape.

    PR #457 expects: { id, kind: 'recompute'|'annotation'|'review-note'|'result-add',
    actor, message, created_at }.
    """
    payload = event.payload or {}
    # `result-add` is encoded as event_type='annotation' + payload.kind='lab_results_batch'
    if (
        event.event_type == "annotation"
        and isinstance(payload, dict)
        and payload.get("kind") == "lab_results_batch"
    ):
        kind = "result-add"
        message = f"Added {payload.get('count', 1)} lab result(s)"
    else:
        kind = _AUDIT_KIND_MAP.get(event.event_type, "annotation")
        message = (
            payload.get("message")
            or payload.get("note")
            or payload.get("text")
            or payload.get("source")
            or ""
        )
        if not isinstance(message, str):
            message = str(message)
    return {
        "id": event.event_id,
        "kind": kind,
        "actor": event.actor_user_id or "system",
        "message": message,
        "created_at": event.timestamp,
    }


@router.get("/patient/{patient_id}")
def get_labs_analyzer_payload(
    patient_id: str,
    ai_narrative: bool = Query(False, description="Optional LLM synthesis (requires provider keys)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    display, condition = _patient_profile(db, patient_id)
    append_audit_event(
        patient_id,
        LabReviewAuditEvent(
            event_id=str(uuid.uuid4()),
            event_type="view",
            actor_user_id=actor.actor_id,
            timestamp=_ts(),
            payload={"source": "get_labs_analyzer_payload"},
        ),
    )
    payload = build_labs_analyzer_payload(
        patient_id,
        db,
        patient_name=display,
        primary_condition=condition,
        include_ai_narrative=ai_narrative,
    )
    return _fold_to_pr457_shape(payload)


@router.post("/patient/{patient_id}/recompute")
def post_labs_recompute(
    patient_id: str,
    body: RecomputeRequest | None = None,
    ai_narrative: bool = Query(False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    del body
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    display, condition = _patient_profile(db, patient_id)
    payload = recompute_and_payload(
        patient_id,
        db,
        patient_name=display,
        primary_condition=condition,
        actor_id=actor.actor_id,
        include_ai_narrative=ai_narrative,
    )
    return _fold_to_pr457_shape(payload)


@router.post("/patient/{patient_id}/results", response_model=dict)
def post_labs_results_batch(
    patient_id: str,
    body: LabResultsBatchRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Append clinician-entered lab rows (used until LIMS/FHIR sync)."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    is_demo = str(patient_id).startswith("demo-pt-")
    if not is_demo and get_patient_display_name(db, patient_id) is None:
        # Real patient ID must have a Patient row.
        raise HTTPException(status_code=404, detail="Patient not found")

    items = [_normalize_item(it) for it in body.resolved_items()]

    try:
        created = insert_lab_result_batch(
            db,
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            items=items,
            is_demo=is_demo,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail=f"Lab persistence unavailable (run migration 083_patient_lab_results): {exc}",
        ) from exc

    event = LabReviewAuditEvent(
        event_id=str(uuid.uuid4()),
        event_type="annotation",
        actor_user_id=actor.actor_id,
        timestamp=_ts(),
        payload={"kind": "lab_results_batch", "count": created},
    )
    append_audit_event(patient_id, event)
    # Return the audit-shaped event so the frontend can append it to its cache
    # (frontend `addLabResult` expects an audit-item-like object back; the
    # additional `inserted` count is additive context).
    pr457 = _audit_event_to_pr457(event)
    pr457["inserted"] = created
    pr457["patient_id"] = patient_id
    pr457["ok"] = True
    return pr457


@router.post("/patient/{patient_id}/annotation", response_model=dict)
def post_labs_annotation(
    patient_id: str,
    body: AnnotationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    message = (body.message or body.text or "").strip()
    if not message:
        raise HTTPException(
            status_code=422,
            detail="annotation requires `message` (or `text`) with non-empty content",
        )
    event = LabReviewAuditEvent(
        event_id=str(uuid.uuid4()),
        event_type="annotation",
        actor_user_id=actor.actor_id,
        timestamp=_ts(),
        payload={
            "message": message,
            "target_type": body.target_type,
            "target_id": body.target_id,
            "tags": body.tags,
        },
    )
    append_audit_event(patient_id, event)
    return _audit_event_to_pr457(event)


@router.post("/patient/{patient_id}/review-note", response_model=dict)
def post_labs_review_note(
    patient_id: str,
    body: ReviewNoteRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    message = (body.message or body.note or "").strip()
    if not message:
        raise HTTPException(
            status_code=422,
            detail="review-note requires `message` (or `note`) with non-empty content",
        )
    event = LabReviewAuditEvent(
        event_id=str(uuid.uuid4()),
        event_type="note",
        actor_user_id=actor.actor_id,
        timestamp=_ts(),
        payload={
            "message": message,
            "acknowledged_alert_ids": body.acknowledged_alert_ids,
            "evidence_ack_ids": body.evidence_ack_ids,
        },
    )
    append_audit_event(patient_id, event)
    return _audit_event_to_pr457(event)


@router.get("/patient/{patient_id}/audit")
def get_labs_audit(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    exists, _ = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="Patient not found")

    items = get_audit_trail(patient_id)
    # Newest-first to match the frontend cache convention.
    return {
        "patient_id": patient_id,
        "items": [_audit_event_to_pr457(ev) for ev in reversed(items)],
    }

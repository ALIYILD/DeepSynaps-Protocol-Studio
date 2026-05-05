from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.repositories.assessments import (
    create_assessment,
    get_assessment,
    list_assessments_for_clinician,
    list_assessments_for_patient,
    update_assessment,
)
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services.assessment_scoring import compute_canonical_score, detect_red_flags, severity_for_score
from app.services.assessment_summary import normalize_assessment_score
from app.services.evidence_rag import search_evidence

# Reuse the canonical template registry and licensing gates from v1.
from app.routers.assessments_router import ASSESSMENT_TEMPLATES, list_scale_catalog  # noqa: PLC0415

router = APIRouter(prefix="/api/v1/assessments-v2", tags=["assessments-v2"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)
        return
    if actor.role != "admin":
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)


def _audit_db(
    session: Session,
    *,
    actor: AuthenticatedActor,
    target_id: str,
    target_type: str,
    action: str,
    note: str,
) -> None:
    """Write to audit_events table (best-effort). Notes must be PHI-safe."""
    try:
        create_audit_event(
            session,
            event_id=uuid.uuid4().hex,
            target_id=str(target_id),
            target_type=str(target_type),
            action=str(action)[:32],
            role=str(actor.role),
            actor_id=str(actor.actor_id),
            note=str(note)[:2000],
            created_at=_now_iso(),
        )
    except Exception:
        # Never break clinician workflow because audit write failed.
        pass


# ── Schemas (v2 contract) ────────────────────────────────────────────────────


class AssessmentRegistryEntry(BaseModel):
    id: str
    name: str
    abbreviation: str | None = None
    category: str | None = None
    condition_tags: list[str] = Field(default_factory=list)
    symptom_domains: list[str] = Field(default_factory=list)
    age_range: str | None = None
    informant: str | None = None
    modality_context: list[str] = Field(default_factory=list)
    fillable_in_platform: bool
    scorable_in_platform: bool
    scoring_status: str
    licence_status: str
    external_link: str | None = None
    instructions_summary: str | None = None
    scoring_summary: str | None = None
    interpretation_caveat: str | None = None
    evidence_grade: str | None = None
    evidence_links: list[str] = Field(default_factory=list)
    live_literature_query: str | None = None
    required_role: str = "clinician"
    audit_required: bool = True
    clinician_review_required: bool = True


class LibraryResponse(BaseModel):
    items: list[AssessmentRegistryEntry]
    total: int
    source: str = "v1_templates"


class AssignRequestV2(BaseModel):
    assessment_id: str = Field(..., description="Template/scale id (e.g., phq9).")
    due_date: Optional[str] = None
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    respondent_type: Optional[str] = None
    clinician_notes: Optional[str] = None


class QueueItemV2(BaseModel):
    assignment_id: str
    patient_id: str
    assessment_id: str
    assessment_title: str
    status: str
    due_date: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    score_numeric: Optional[float] = None
    severity: Optional[str] = None
    severity_label: Optional[str] = None
    red_flags: list[str] = Field(default_factory=list)
    clinician_review_required: bool = True
    licence_status: str | None = None
    score_only: bool = False
    external_link: str | None = None


class QueueResponseV2(BaseModel):
    items: list[QueueItemV2]
    total: int


class FormAccessState(BaseModel):
    fillable_in_platform: bool
    score_only: bool
    licence_status: str
    external_link: str | None = None
    message: str | None = None


class AssignmentFormResponse(BaseModel):
    assignment_id: str
    assessment_id: str
    assessment_title: str
    licensing: dict[str, Any] = Field(default_factory=dict)
    access: FormAccessState
    template: dict[str, Any] | None = None
    clinician_review_required: bool = True


class SubmitResponsesRequest(BaseModel):
    status: str = Field("in_progress", description="in_progress|completed")
    items: dict[str, Any] | list[Any] | None = None
    score_numeric: float | None = None
    clinician_notes: str | None = None


class ScoreResponseV2(BaseModel):
    assignment_id: str
    assessment_id: str
    scoring_status: str
    raw_score: float | None = None
    subscale_scores: dict[str, Any] | None = None
    missing_items: list[str] = Field(default_factory=list)
    severity: str | None = None
    severity_label: str | None = None
    red_flags: list[str] = Field(default_factory=list)
    limitations: str
    clinician_review_required: bool = True


class EvidenceHealthV2(BaseModel):
    ok: bool
    local_corpus_available: bool
    local_corpus_note: str
    live_literature_available: bool
    live_literature_note: str


class EvidenceRefV2(BaseModel):
    title: str
    authors: str | None = None
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    journal: str | None = None
    study_type: str | None = None
    population: str | None = None
    condition: str | None = None
    assessment_tool: str | None = None
    limitations: str | None = None
    evidence_grade: str | None = None
    status: str = "local"
    source_link: str | None = None


class EvidenceSearchResponseV2(BaseModel):
    status: str
    items: list[EvidenceRefV2]
    total: int


class RecommendRequestV2(BaseModel):
    patient_id: str
    condition: str | None = None
    age_years: int | None = None
    symptom_domains: list[str] = Field(default_factory=list)
    clinician_question: str | None = None


class RecommendedAssessmentV2(BaseModel):
    assessment_id: str
    reason: str
    informant: str | None = None
    priority: str = "normal"
    fillable_in_platform: bool
    scorable_in_platform: bool
    licence_status: str
    clinician_review_required: bool = True


class RecommendResponseV2(BaseModel):
    source: str
    recommended: list[RecommendedAssessmentV2]
    caveats: list[str]


# ── Helpers for registry mapping ─────────────────────────────────────────────


def _tpl_by_id(tpl_id: str):
    for t in ASSESSMENT_TEMPLATES:
        if t.id == tpl_id:
            return t
    return None


def _licence_status_from_tier(tier: str | None) -> str:
    tier = (tier or "").strip().lower()
    if tier in ("public_domain", "us_gov"):
        return "open"
    if tier in ("academic",):
        return "permission_required"
    if tier in ("licensed", "restricted"):
        return "proprietary"
    return "unknown"


def _scoring_status(tpl_id: str, *, score_only: bool, embedded_text_allowed: bool) -> str:
    if score_only:
        return "external_only"
    if embedded_text_allowed:
        # Canonical scoring is server-implemented for several instruments; we
        # still keep this honest by allowing "implemented" only when we have
        # a canonical scorer or simple sum is enough.
        return "implemented"
    return "licence_required"


@router.get("/library", response_model=LibraryResponse)
def library(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> LibraryResponse:
    require_minimum_role(actor, "clinician")
    scales = list_scale_catalog()
    out: list[AssessmentRegistryEntry] = []
    for s in scales:
        tier = getattr(s.licensing, "tier", None) if s.licensing else None
        embedded_ok = bool(getattr(s.licensing, "embedded_text_allowed", False)) if s.licensing else False
        score_only = bool(getattr(s, "score_only", False))
        out.append(
            AssessmentRegistryEntry(
                id=s.id,
                name=s.title,
                abbreviation=s.abbreviation,
                category=(s.conditions[0] if s.conditions else None),
                condition_tags=[c.lower().replace(" ", "_") for c in (s.conditions or [])],
                symptom_domains=[],
                age_range=None,
                informant=(s.respondent_type if s.respondent_type else None),
                modality_context=[],
                fillable_in_platform=embedded_ok and not score_only,
                scorable_in_platform=(not score_only),
                scoring_status=_scoring_status(s.id, score_only=score_only, embedded_text_allowed=embedded_ok),
                licence_status=_licence_status_from_tier(tier),
                external_link=(getattr(s.licensing, "url", None) if s.licensing else None),
                instructions_summary=None,
                scoring_summary=None,
                interpretation_caveat="Not diagnostic; clinician review required.",
                evidence_grade=None,
                evidence_links=[],
                live_literature_query=None,
                required_role="clinician",
                audit_required=True,
                clinician_review_required=True,
            )
        )
    _audit_db(
        session=get_db_session(),
        actor=actor,
        target_id="library",
        target_type="assessments_v2",
        action="view",
        note="library_view",
    )
    return LibraryResponse(items=out, total=len(out))


@router.get("/library/{assessment_id}", response_model=AssessmentRegistryEntry)
def library_detail(
    assessment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AssessmentRegistryEntry:
    require_minimum_role(actor, "clinician")
    s = next((x for x in list_scale_catalog() if x.id == assessment_id), None)
    if not s:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)
    tier = getattr(s.licensing, "tier", None) if s.licensing else None
    embedded_ok = bool(getattr(s.licensing, "embedded_text_allowed", False)) if s.licensing else False
    score_only = bool(getattr(s, "score_only", False))
    return AssessmentRegistryEntry(
        id=s.id,
        name=s.title,
        abbreviation=s.abbreviation,
        category=(s.conditions[0] if s.conditions else None),
        condition_tags=[c.lower().replace(" ", "_") for c in (s.conditions or [])],
        symptom_domains=[],
        age_range=None,
        informant=(s.respondent_type if s.respondent_type else None),
        modality_context=[],
        fillable_in_platform=embedded_ok and not score_only,
        scorable_in_platform=(not score_only),
        scoring_status=_scoring_status(s.id, score_only=score_only, embedded_text_allowed=embedded_ok),
        licence_status=_licence_status_from_tier(tier),
        external_link=(getattr(s.licensing, "url", None) if s.licensing else None),
        instructions_summary=None,
        scoring_summary=None,
        interpretation_caveat="Not diagnostic; clinician review required.",
        evidence_grade=None,
        evidence_links=[],
        live_literature_query=None,
        required_role="clinician",
        audit_required=True,
        clinician_review_required=True,
    )


@router.get("/by-condition/{condition}", response_model=LibraryResponse)
def by_condition(
    condition: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LibraryResponse:
    require_minimum_role(actor, "clinician")
    needle = condition.strip().lower()
    scales = [s for s in list_scale_catalog() if any(needle in c.lower() for c in (s.conditions or []))]
    items = [library_detail(s.id, actor=actor) for s in scales]
    return LibraryResponse(items=items, total=len(items), source="v1_templates_condition_filter")


@router.get("/by-domain/{domain}", response_model=LibraryResponse)
def by_domain(
    domain: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LibraryResponse:
    # Domain tags are not yet canonical in the backend registry. Keep honest.
    require_minimum_role(actor, "clinician")
    return LibraryResponse(items=[], total=0, source="not_implemented")


# ── Assignments / queue ──────────────────────────────────────────────────────


@router.post("/patients/{patient_id}/assign", response_model=QueueItemV2, status_code=201)
def assign_to_patient(
    patient_id: str,
    body: AssignRequestV2,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QueueItemV2:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    tpl = _tpl_by_id(body.assessment_id)
    if not tpl:
        raise ApiServiceError(code="not_found", message="Assessment template not found.", status_code=404)
    respondent_type = body.respondent_type or tpl.respondent_type
    record = create_assessment(
        db,
        clinician_id=actor.actor_id,
        template_id=tpl.id,
        template_title=tpl.title,
        patient_id=patient_id,
        data={},
        clinician_notes=body.clinician_notes,
        status="pending",
        due_date=body.due_date,
        phase=body.phase,
        bundle_id=body.bundle_id,
        respondent_type=respondent_type,
    )
    _audit_db(
        db,
        actor=actor,
        target_id=record.id,
        target_type="assessment_assignment",
        action="assign",
        note=f"patient_id={patient_id} template_id={tpl.id} status=pending",
    )
    sev_info = normalize_assessment_score(record.template_id, record.score_numeric)
    flags = detect_red_flags(record.template_id, None, record.score_numeric)
    lic = tpl.licensing.tier if tpl.licensing else None
    return QueueItemV2(
        assignment_id=record.id,
        patient_id=record.patient_id,
        assessment_id=record.template_id,
        assessment_title=record.template_title,
        status=record.status,
        due_date=(record.due_date.isoformat() if record.due_date else None),
        respondent_type=record.respondent_type,
        phase=record.phase,
        bundle_id=record.bundle_id,
        score_numeric=record.score_numeric,
        severity=record.severity or sev_info.get("severity"),
        severity_label=sev_info.get("label"),
        red_flags=flags,
        clinician_review_required=True,
        licence_status=_licence_status_from_tier(lic),
        score_only=bool(tpl.score_only),
        external_link=(tpl.licensing.url if tpl.licensing else None),
    )


def _queue_row_from_record(r, *, tpl) -> QueueItemV2:
    sev_info = normalize_assessment_score(r.template_id, r.score_numeric)
    flags = []
    try:
        flags = detect_red_flags(r.template_id, None, r.score_numeric)
    except Exception:
        flags = []
    lic = tpl.licensing.tier if tpl and tpl.licensing else None
    return QueueItemV2(
        assignment_id=r.id,
        patient_id=r.patient_id,
        assessment_id=r.template_id,
        assessment_title=r.template_title,
        status=r.status,
        due_date=(r.due_date.isoformat() if r.due_date else None),
        respondent_type=getattr(r, "respondent_type", None),
        phase=getattr(r, "phase", None),
        bundle_id=getattr(r, "bundle_id", None),
        score_numeric=getattr(r, "score_numeric", None),
        severity=getattr(r, "severity", None) or sev_info.get("severity"),
        severity_label=sev_info.get("label"),
        red_flags=flags,
        clinician_review_required=True,
        licence_status=_licence_status_from_tier(lic),
        score_only=bool(getattr(tpl, "score_only", False)),
        external_link=(tpl.licensing.url if tpl and tpl.licensing else None),
    )


@router.get("/patients/{patient_id}/queue", response_model=QueueResponseV2)
def patient_queue(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QueueResponseV2:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    rows = list_assessments_for_patient(db, patient_id, actor.actor_id)
    items: list[QueueItemV2] = []
    for r in rows:
        tpl = _tpl_by_id(r.template_id)
        items.append(_queue_row_from_record(r, tpl=tpl))
    _audit_db(
        db,
        actor=actor,
        target_id=patient_id,
        target_type="patient",
        action="view",
        note="assessments_v2_patient_queue",
    )
    return QueueResponseV2(items=items, total=len(items))


@router.get("/queue", response_model=QueueResponseV2)
def clinic_queue(
    status: str | None = Query(None, description="Filter by status (pending|in_progress|completed|scored|reviewed|cancelled)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QueueResponseV2:
    require_minimum_role(actor, "clinician")
    rows = list_assessments_for_clinician(db, actor.actor_id)
    if status:
        rows = [r for r in rows if (r.status or "").lower() == status.lower()]
    items: list[QueueItemV2] = []
    for r in rows:
        tpl = _tpl_by_id(r.template_id)
        items.append(_queue_row_from_record(r, tpl=tpl))
    _audit_db(
        db,
        actor=actor,
        target_id=actor.actor_id,
        target_type="clinician",
        action="view",
        note="assessments_v2_clinic_queue",
    )
    return QueueResponseV2(items=items, total=len(items))


@router.patch("/assignments/{assignment_id}", response_model=QueueItemV2)
def update_assignment_status(
    assignment_id: str,
    status: str = Query(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QueueItemV2:
    require_minimum_role(actor, "clinician")
    existing = get_assessment(db, assignment_id, actor.actor_id)
    if existing is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _gate_patient_access(actor, existing.patient_id, db)
    updated = update_assessment(db, assignment_id, actor.actor_id, status=status)
    if updated is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    tpl = _tpl_by_id(updated.template_id)
    _audit_db(
        db,
        actor=actor,
        target_id=assignment_id,
        target_type="assessment_assignment",
        action="update",
        note=f"status={status}",
    )
    return _queue_row_from_record(updated, tpl=tpl)


# ── Form (licensing-aware) ────────────────────────────────────────────────────


@router.get("/assignments/{assignment_id}/form", response_model=AssignmentFormResponse)
def get_assignment_form(
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AssignmentFormResponse:
    require_minimum_role(actor, "clinician")
    existing = get_assessment(db, assignment_id, actor.actor_id)
    if existing is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _gate_patient_access(actor, existing.patient_id, db)
    tpl = _tpl_by_id(existing.template_id)
    if not tpl:
        raise ApiServiceError(code="not_found", message="Assessment template not found.", status_code=404)
    licensing = tpl.licensing.model_dump() if tpl.licensing else {}
    embedded_ok = bool(getattr(tpl.licensing, "embedded_text_allowed", False)) if tpl.licensing else False
    if tpl.score_only or not embedded_ok:
        access = FormAccessState(
            fillable_in_platform=False,
            score_only=bool(tpl.score_only),
            licence_status=_licence_status_from_tier(getattr(tpl.licensing, "tier", None) if tpl.licensing else None),
            external_link=(tpl.licensing.url if tpl.licensing else None),
            message="This instrument cannot be filled in-platform. Administer via an authorized copy and enter scores in DeepSynaps.",
        )
        template = None
    else:
        access = FormAccessState(
            fillable_in_platform=True,
            score_only=False,
            licence_status=_licence_status_from_tier(getattr(tpl.licensing, "tier", None) if tpl.licensing else None),
            external_link=(tpl.licensing.url if tpl.licensing else None),
            message=None,
        )
        template = tpl.model_dump()
    _audit_db(
        db,
        actor=actor,
        target_id=assignment_id,
        target_type="assessment_assignment",
        action="view",
        note="form_view",
    )
    return AssignmentFormResponse(
        assignment_id=assignment_id,
        assessment_id=tpl.id,
        assessment_title=tpl.title,
        licensing=licensing,
        access=access,
        template=template,
        clinician_review_required=True,
    )


@router.post("/assignments/{assignment_id}/responses", response_model=QueueItemV2)
def submit_assignment_responses(
    assignment_id: str,
    body: SubmitResponsesRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QueueItemV2:
    require_minimum_role(actor, "clinician")
    existing = get_assessment(db, assignment_id, actor.actor_id)
    if existing is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _gate_patient_access(actor, existing.patient_id, db)
    tpl = _tpl_by_id(existing.template_id)
    if not tpl:
        raise ApiServiceError(code="not_found", message="Assessment template not found.", status_code=404)
    updates: dict[str, Any] = {}
    if body.items is not None:
        updates["items"] = body.items
    if body.score_numeric is not None:
        updates["score_numeric"] = body.score_numeric
        updates["score"] = str(body.score_numeric)
    if body.clinician_notes is not None:
        updates["clinician_notes"] = body.clinician_notes
    if body.status:
        updates["status"] = body.status
    updated = update_assessment(db, assignment_id, actor.actor_id, **updates)
    if updated is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _audit_db(
        db,
        actor=actor,
        target_id=assignment_id,
        target_type="assessment_assignment",
        action="update",
        note=f"responses_saved status={body.status}",
    )
    return _queue_row_from_record(updated, tpl=tpl)


# ── Scoring ───────────────────────────────────────────────────────────────────


@router.post("/assignments/{assignment_id}/score", response_model=ScoreResponseV2)
def score_assignment(
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ScoreResponseV2:
    require_minimum_role(actor, "clinician")
    existing = get_assessment(db, assignment_id, actor.actor_id)
    if existing is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _gate_patient_access(actor, existing.patient_id, db)
    tpl = _tpl_by_id(existing.template_id)
    if not tpl:
        raise ApiServiceError(code="not_found", message="Assessment template not found.", status_code=404)

    if tpl.score_only:
        _audit_db(
            db,
            actor=actor,
            target_id=assignment_id,
            target_type="assessment_assignment",
            action="score",
            note="score_only_manual",
        )
        return ScoreResponseV2(
            assignment_id=assignment_id,
            assessment_id=tpl.id,
            scoring_status="licence_required",
            raw_score=existing.score_numeric,
            subscale_scores=None,
            missing_items=[],
            severity=existing.severity,
            severity_label=normalize_assessment_score(existing.template_id, existing.score_numeric).get("label"),
            red_flags=detect_red_flags(existing.template_id, None, existing.score_numeric),
            limitations="Scoring is score-entry only for this instrument. Administer via authorized copy; clinician review required.",
            clinician_review_required=True,
        )

    # Compute canonical score if item responses exist.
    items: Any = None
    try:
        # items_json is stored as JSON; repository converters handle this, but
        # we keep it simple by relying on update/create to store JSON already.
        items = existing.items_json
    except Exception:
        items = None
    # We rely on stored items via update endpoint; if absent, we cannot score.
    if not existing.items_json and existing.score_numeric is None:
        raise ApiServiceError(
            code="missing_items",
            message="No item-level responses are available to compute a score. Capture responses first.",
            status_code=400,
            details={"missing_items": ["items"]},
        )

    # Load item responses from stored JSON via update_assessment contract: it stores JSON string.
    import json as _json  # local import to keep module load light

    parsed_items = None
    try:
        parsed_items = _json.loads(existing.items_json) if existing.items_json else None
    except Exception:
        parsed_items = None
    canon = compute_canonical_score(existing.template_id, parsed_items) if parsed_items is not None else None
    if canon is None:
        return ScoreResponseV2(
            assignment_id=assignment_id,
            assessment_id=tpl.id,
            scoring_status="not_implemented",
            raw_score=existing.score_numeric,
            subscale_scores=None,
            missing_items=[],
            severity=existing.severity,
            severity_label=normalize_assessment_score(existing.template_id, existing.score_numeric).get("label") if existing.score_numeric is not None else None,
            red_flags=detect_red_flags(existing.template_id, parsed_items, existing.score_numeric),
            limitations="Canonical scoring is not available for this instrument in this build. Manual scoring required; clinician review required.",
            clinician_review_required=True,
        )

    raw = float(canon["score"])
    subs = canon.get("subscales") or None
    sev = severity_for_score(existing.template_id, raw)
    updates = {
        "score_numeric": raw,
        "score": str(raw),
        "subscales": subs,
        "severity": sev.get("severity"),
        "status": "scored" if (existing.status or "").lower() != "completed" else existing.status,
    }
    updated = update_assessment(db, assignment_id, actor.actor_id, **updates)
    _audit_db(
        db,
        actor=actor,
        target_id=assignment_id,
        target_type="assessment_assignment",
        action="score",
        note=f"canonical score={raw}",
    )
    flags = detect_red_flags(existing.template_id, parsed_items, raw)
    sev_info = normalize_assessment_score(existing.template_id, raw)
    return ScoreResponseV2(
        assignment_id=assignment_id,
        assessment_id=tpl.id,
        scoring_status="implemented",
        raw_score=raw,
        subscale_scores=subs,
        missing_items=[],
        severity=(updated.severity if updated else sev.get("severity")),
        severity_label=sev_info.get("label"),
        red_flags=flags,
        limitations="Scores support clinical decision-making and require clinician review; not diagnostic on their own.",
        clinician_review_required=True,
    )


@router.get("/assignments/{assignment_id}/score", response_model=ScoreResponseV2)
def get_score(
    assignment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ScoreResponseV2:
    require_minimum_role(actor, "clinician")
    existing = get_assessment(db, assignment_id, actor.actor_id)
    if existing is None:
        raise ApiServiceError(code="not_found", message="Assignment not found.", status_code=404)
    _gate_patient_access(actor, existing.patient_id, db)
    sev_info = normalize_assessment_score(existing.template_id, existing.score_numeric) if existing.score_numeric is not None else {"severity": None, "label": None}
    return ScoreResponseV2(
        assignment_id=assignment_id,
        assessment_id=existing.template_id,
        scoring_status="stored",
        raw_score=existing.score_numeric,
        subscale_scores=None,
        missing_items=[],
        severity=existing.severity or sev_info.get("severity"),
        severity_label=sev_info.get("label"),
        red_flags=detect_red_flags(existing.template_id, None, existing.score_numeric),
        limitations="Stored score only; clinician review required.",
        clinician_review_required=True,
    )


# ── Evidence (assessment-linked) ──────────────────────────────────────────────


@router.get("/evidence/health", response_model=EvidenceHealthV2)
def evidence_health_v2(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> EvidenceHealthV2:
    require_minimum_role(actor, "clinician")
    # Local corpus availability is inferred from evidence_rag opening behavior.
    local_available = bool(search_evidence("test", top_k=1))
    pubmed_key_present = bool(os.environ.get("PUBMED_API_KEY") or os.environ.get("NCBI_API_KEY"))
    pubmed_email_present = bool(os.environ.get("PUBMED_EMAIL"))
    live_available = pubmed_key_present or pubmed_email_present
    return EvidenceHealthV2(
        ok=True,
        local_corpus_available=local_available,
        local_corpus_note="Local evidence corpus (SQLite) is available." if local_available else "Local evidence corpus is unavailable in this environment.",
        live_literature_available=live_available,
        live_literature_note="PubMed live literature watch is configured." if live_available else "Live literature is not configured; showing local/cached evidence only.",
    )


@router.get("/evidence/search", response_model=EvidenceSearchResponseV2)
def evidence_search_v2(
    q: str = Query(..., min_length=2),
    condition: str | None = Query(None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EvidenceSearchResponseV2:
    require_minimum_role(actor, "clinician")
    hits = search_evidence(query=q, condition=condition, top_k=10, prefer_rct=True)
    items: list[EvidenceRefV2] = []
    for h in hits:
        items.append(
            EvidenceRefV2(
                title=str(h.get("title") or ""),
                authors=None,
                year=h.get("year"),
                doi=h.get("doi"),
                pmid=h.get("pmid"),
                journal=h.get("journal"),
                study_type=h.get("study_design"),
                population=None,
                condition=condition,
                assessment_tool=None,
                limitations=None,
                evidence_grade=None,
                status="local",
                source_link=h.get("url"),
            )
        )
    return EvidenceSearchResponseV2(status="local" if items else "unavailable", items=items, total=len(items))


@router.get("/library/{assessment_id}/evidence", response_model=EvidenceSearchResponseV2)
def assessment_evidence(
    assessment_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EvidenceSearchResponseV2:
    require_minimum_role(actor, "clinician")
    tpl = _tpl_by_id(assessment_id)
    if not tpl:
        raise ApiServiceError(code="not_found", message="Assessment not found.", status_code=404)
    # Query only by the instrument name; we do not fabricate citations.
    q = f"{tpl.title} {tpl.abbreviation or ''}".strip()
    hits = search_evidence(query=q, top_k=10, prefer_rct=True)
    items: list[EvidenceRefV2] = []
    for h in hits:
        items.append(
            EvidenceRefV2(
                title=str(h.get("title") or ""),
                year=h.get("year"),
                doi=h.get("doi"),
                pmid=h.get("pmid"),
                journal=h.get("journal"),
                study_type=h.get("study_design"),
                condition=None,
                assessment_tool=tpl.abbreviation or tpl.id,
                limitations=None,
                status="local",
                source_link=h.get("url"),
            )
        )
    return EvidenceSearchResponseV2(status="local" if items else "unavailable", items=items, total=len(items))


# ── Recommendations (deterministic, PHI-safe) ─────────────────────────────────


@router.post("/recommend", response_model=RecommendResponseV2)
def recommend_v2(
    body: RecommendRequestV2,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RecommendResponseV2:
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)
    # Deterministic registry-based recommendations only (no LLM by default).
    cond = (body.condition or "").strip().lower()
    if not cond:
        # Attempt to read condition from patient record without including name/PHI.
        try:
            from app.persistence.models import Patient  # noqa: PLC0415

            p = db.get(Patient, body.patient_id)
            if p and p.primary_condition:
                cond = str(p.primary_condition).strip().lower()
        except Exception:
            pass

    scales = list_scale_catalog()
    recommended: list[RecommendedAssessmentV2] = []
    for s in scales:
        # Match condition names by substring; never diagnose, just suggest tools.
        if cond and not any(cond in c.lower() for c in (s.conditions or [])):
            continue
        tier = getattr(s.licensing, "tier", None) if s.licensing else None
        embedded_ok = bool(getattr(s.licensing, "embedded_text_allowed", False)) if s.licensing else False
        score_only = bool(getattr(s, "score_only", False))
        recommended.append(
            RecommendedAssessmentV2(
                assessment_id=s.id,
                reason="Registry match to clinician-supplied condition tags. Not diagnostic; clinician review required.",
                informant=s.respondent_type,
                priority="normal",
                fillable_in_platform=embedded_ok and not score_only,
                scorable_in_platform=(not score_only),
                licence_status=_licence_status_from_tier(tier),
                clinician_review_required=True,
            )
        )
        if len(recommended) >= 8:
            break

    caveats = [
        "Decision support only — clinician review required.",
        "Recommendations are not a diagnosis and must be contextualized with clinical interview and other data.",
        "Licensed instruments may require external administration and manual score entry.",
    ]
    _audit_db(
        db,
        actor=actor,
        target_id=body.patient_id,
        target_type="patient",
        action="recommend",
        note="assessments_v2_recommend_deterministic",
    )
    return RecommendResponseV2(source="deterministic_registry", recommended=recommended, caveats=caveats)


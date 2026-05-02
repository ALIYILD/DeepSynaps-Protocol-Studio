"""IRB-AMD4: Reviewer SLA Calibration Threshold Tuning Advisor (2026-05-02).

Closes section I rec from the IRB-AMD3 Reviewer Workload Outcome
Tracker (#451). Mirrors the CSAHP6 (#438) Rotation Policy Advisor
Threshold Tuning Console pattern but on the reviewer-SLA axis:

* IRB-AMD2 (#447) emits ``irb_reviewer_sla.queue_breach_detected`` rows
  when a reviewer falls behind.
* IRB-AMD3 (#451) pairs each breach with the same reviewer's NEXT
  ``irb.amendment_decided_*`` row and computes a per-reviewer
  ``calibration_score = (within_sla - still_pending) / max(total -
  pending, 1)``.
* THIS router lets admins propose a calibration_score floor below
  which an auto-reassign action would fire, replay it against the
  last 180 days of paired data, and adopt the floor when the replay
  shows it would have been helpful.

Endpoints
=========

* ``GET /api/v1/reviewer-sla-calibration-threshold-tuning/current-threshold``
  Clinician+. Current adopted floor + auto_reassign_enabled flag for
  the actor's clinic. Returns ``{threshold_value: null,
  auto_reassign_enabled: false}`` when no row exists yet.
* ``GET /api/v1/reviewer-sla-calibration-threshold-tuning/recommend``
  Clinician+. Returns a :class:`RecommendationOut` with recommended
  floor + bootstrap CI + sample sizes. Honest insufficient_data state
  when the cohort is too small.
* ``POST /api/v1/reviewer-sla-calibration-threshold-tuning/replay``
  Clinician+. Body: ``{override_threshold}``. Returns a what-if
  :class:`ReplayOut` projection.
* ``POST /api/v1/reviewer-sla-calibration-threshold-tuning/adopt``
  Admin only. Body: ``{threshold_value, auto_reassign_enabled,
  justification}``. Upserts the threshold and emits a
  ``reviewer_sla_calibration.threshold_adopted`` audit row.
* ``GET /api/v1/reviewer-sla-calibration-threshold-tuning/adoption-history``
  Clinician+. Paginated list of past adoptions for the actor's clinic.
* ``GET /api/v1/reviewer-sla-calibration-threshold-tuning/audit-events``
  Clinician+. Paginated audit-event list scoped to the surface.
* ``POST /api/v1/reviewer-sla-calibration-threshold-tuning/audit-events``
  Page-level audit ingestion.

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id`` and
mirrors the QEEG IDOR pattern captured in
``deepsynaps-qeeg-pdf-export-tenant-gate``.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.persistence.models import (
    AuditEventRecord,
    ReviewerSLACalibrationThreshold,
)
from app.services.irb_reviewer_sla_outcome_pairing import (
    DEFAULT_SLA_RESPONSE_DAYS,
    DEFAULT_WINDOW_DAYS,
)
from app.services.reviewer_sla_threshold_recommender import (
    DEFAULT_THRESHOLD_KEY,
    MIN_BREACHES_PER_REVIEWER,
    MIN_REVIEWERS,
    ThresholdRecommendation,
    recommend_threshold,
)
from app.services.reviewer_sla_threshold_replay import (
    ReplayResult,
    replay_threshold,
)


router = APIRouter(
    prefix="/api/v1/reviewer-sla-calibration-threshold-tuning",
    tags=["Reviewer SLA Calibration Threshold Tuning"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type for self-rows).
SURFACE = "reviewer_sla_calibration_threshold_tuning"


# Adoption audit lives on a NAMED surface so the audit-trail page can
# pivot on it without conflating with IRB-AMD3 outcome rows.
ADOPTION_AUDIT_SURFACE = "reviewer_sla_calibration"
ADOPTION_AUDIT_ACTION = "reviewer_sla_calibration.threshold_adopted"


# ── Helpers ────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_admin(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _scope_clinic(actor: AuthenticatedActor) -> Optional[str]:
    return actor.clinic_id


def _safe_audit_role(actor: AuthenticatedActor) -> str:
    if actor.role in {"admin", "clinician"}:
        return actor.role
    return "clinician"


def _emit_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    target_type: str,
    action: str,
    note: str,
    role: Optional[str] = None,
) -> str:
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    eid = (
        f"{target_type}-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=eid,
            target_id=str(target_id) or actor.actor_id,
            target_type=target_type,
            action=action,
            role=role or _safe_audit_role(actor),
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover
        _log.exception("IRB-AMD4 audit emit skipped")
    return eid


def _parse_adoption_kvs(note: str) -> dict[str, str]:
    """Parse ``key=value`` tokens from the adoption-row note, with a
    special case for the trailing ``justification=`` (which can hold
    arbitrary user prose containing whitespace)."""
    out: dict[str, str] = {}
    if not note:
        return out
    j_marker = " justification="
    j_idx = note.find(j_marker)
    head = note
    if j_idx >= 0:
        head = note[:j_idx]
        out["justification"] = note[j_idx + len(j_marker):].strip()
    for tok in head.split():
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        out[k.strip()] = v.strip().rstrip(";,")
    return out


# ── Schemas ────────────────────────────────────────────────────────────────


class CurrentThresholdOut(BaseModel):
    """Read-only current adopted floor."""

    clinic_id: Optional[str] = None
    threshold_key: str = DEFAULT_THRESHOLD_KEY
    threshold_value: Optional[float] = None
    auto_reassign_enabled: bool = False
    adopted_by_user_id: Optional[str] = None
    justification: Optional[str] = None
    updated_at: Optional[str] = None


class QualifyingReviewerOut(BaseModel):
    reviewer_user_id: str
    total_breaches: int = 0
    decided_within_sla_count: int = 0
    decided_late_count: int = 0
    still_pending_count: int = 0
    calibration_score: float = 0.0


class RecommendationOut(BaseModel):
    recommended: Optional[float] = None
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None
    sample_size_reviewers: int = 0
    sample_size_breaches: int = 0
    current_threshold: Optional[float] = None
    auto_reassign_enabled: bool = False
    projected_reassign_count: int = 0
    insufficient_data: bool = False
    insufficient_data_reason: Optional[str] = None
    window_days: int = DEFAULT_WINDOW_DAYS
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS
    clinic_id: Optional[str] = None
    threshold_key: str = DEFAULT_THRESHOLD_KEY
    qualifying_reviewers: list[QualifyingReviewerOut] = Field(
        default_factory=list
    )
    min_reviewers: int = MIN_REVIEWERS
    min_breaches_per_reviewer: int = MIN_BREACHES_PER_REVIEWER


class ReplayIn(BaseModel):
    override_threshold: float = Field(..., ge=-2.0, le=2.0)
    window_days: int = Field(default=DEFAULT_WINDOW_DAYS, ge=7, le=365)
    sla_response_days: int = Field(
        default=DEFAULT_SLA_RESPONSE_DAYS, ge=1, le=90
    )


class ReplayOut(BaseModel):
    override_threshold: float
    reviewers_below_floor: int = 0
    projected_reassign_count: int = 0
    projected_breaches_avoided: int = 0
    simulated_helpful_rate_pct: float = 0.0
    sample_size_reviewers: int = 0
    sample_size_breaches: int = 0
    window_days: int = DEFAULT_WINDOW_DAYS
    sla_response_days: int = DEFAULT_SLA_RESPONSE_DAYS
    clinic_id: Optional[str] = None
    reviewers_below_floor_ids: list[str] = Field(default_factory=list)


class AdoptIn(BaseModel):
    threshold_value: float = Field(..., ge=-2.0, le=2.0)
    auto_reassign_enabled: bool = False
    justification: str = Field(..., min_length=10, max_length=500)


class AdoptOut(BaseModel):
    accepted: bool
    threshold_key: str
    threshold_value: float
    auto_reassign_enabled: bool
    previous_value: Optional[float] = None
    is_new: bool = False
    audit_event_id: str
    adopted_at: str
    adopted_by_user_id: str


class AdoptionHistoryItem(BaseModel):
    event_id: str
    threshold_key: str = DEFAULT_THRESHOLD_KEY
    previous_value: Optional[float] = None
    new_value: float
    auto_reassign_enabled: bool = False
    justification: Optional[str] = None
    adopted_by_user_id: str
    created_at: str


class AdoptionHistoryOut(BaseModel):
    items: list[AdoptionHistoryItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    clinic_id: Optional[str] = None


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class AuditEventsListOut(BaseModel):
    items: list[AuditEventOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    surface: str


class PageAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)


class PageAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/current-threshold", response_model=CurrentThresholdOut)
def current_threshold(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CurrentThresholdOut:
    """Return the actor's clinic's current adopted floor (if any)."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return CurrentThresholdOut(
            clinic_id=None,
            threshold_key=DEFAULT_THRESHOLD_KEY,
            threshold_value=None,
            auto_reassign_enabled=False,
        )
    row = (
        db.query(ReviewerSLACalibrationThreshold)
        .filter(
            ReviewerSLACalibrationThreshold.clinic_id == cid,
            ReviewerSLACalibrationThreshold.threshold_key
            == DEFAULT_THRESHOLD_KEY,
        )
        .one_or_none()
    )
    if row is None:
        return CurrentThresholdOut(
            clinic_id=cid,
            threshold_key=DEFAULT_THRESHOLD_KEY,
            threshold_value=None,
            auto_reassign_enabled=False,
        )
    return CurrentThresholdOut(
        clinic_id=cid,
        threshold_key=row.threshold_key,
        threshold_value=float(row.threshold_value),
        auto_reassign_enabled=bool(row.auto_reassign_enabled),
        adopted_by_user_id=row.adopted_by_user_id,
        justification=row.justification,
        updated_at=row.updated_at,
    )


def _recommendation_to_out(r: ThresholdRecommendation) -> RecommendationOut:
    return RecommendationOut(
        recommended=r.recommended,
        ci_low=r.ci_low,
        ci_high=r.ci_high,
        sample_size_reviewers=r.sample_size_reviewers,
        sample_size_breaches=r.sample_size_breaches,
        current_threshold=r.current_threshold,
        auto_reassign_enabled=r.auto_reassign_enabled,
        projected_reassign_count=r.projected_reassign_count,
        insufficient_data=r.insufficient_data,
        insufficient_data_reason=r.insufficient_data_reason,
        window_days=r.window_days,
        sla_response_days=r.sla_response_days,
        clinic_id=r.clinic_id,
        threshold_key=r.threshold_key,
        qualifying_reviewers=[
            QualifyingReviewerOut(**q) for q in r.qualifying_reviewers
        ],
    )


@router.get("/recommend", response_model=RecommendationOut)
def recommend(
    window_days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=7, le=365),
    sla_response_days: int = Query(
        default=DEFAULT_SLA_RESPONSE_DAYS, ge=1, le=90
    ),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RecommendationOut:
    """Compute a threshold recommendation + bootstrap CI."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    rec = recommend_threshold(
        db,
        cid,
        window_days=window_days,
        sla_response_days=sla_response_days,
    )
    return _recommendation_to_out(rec)


def _replay_to_out(r: ReplayResult) -> ReplayOut:
    return ReplayOut(
        override_threshold=r.override_threshold,
        reviewers_below_floor=r.reviewers_below_floor,
        projected_reassign_count=r.projected_reassign_count,
        projected_breaches_avoided=r.projected_breaches_avoided,
        simulated_helpful_rate_pct=r.simulated_helpful_rate_pct,
        sample_size_reviewers=r.sample_size_reviewers,
        sample_size_breaches=r.sample_size_breaches,
        window_days=r.window_days,
        sla_response_days=r.sla_response_days,
        clinic_id=r.clinic_id,
        reviewers_below_floor_ids=r.reviewers_below_floor_ids,
    )


@router.post("/replay", response_model=ReplayOut)
def replay(
    body: ReplayIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReplayOut:
    """Replay an override floor against the last ``window_days`` of
    paired records and return projections."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    result = replay_threshold(
        db,
        cid,
        override_threshold=float(body.override_threshold),
        window_days=body.window_days,
        sla_response_days=body.sla_response_days,
    )
    return _replay_to_out(result)


@router.post("/adopt", response_model=AdoptOut)
def adopt(
    body: AdoptIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdoptOut:
    """Adopt a calibration floor. Admin only. Upserts the
    :class:`ReviewerSLACalibrationThreshold` row + emits a
    ``threshold_adopted`` audit row capturing old/new values plus the
    adopter user_id and justification."""
    _gate_admin(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise HTTPException(
            status_code=400, detail="Actor missing clinic_id"
        )

    val = float(body.threshold_value)
    auto = bool(body.auto_reassign_enabled)
    justification = (body.justification or "").strip()

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    existing = (
        db.query(ReviewerSLACalibrationThreshold)
        .filter(
            ReviewerSLACalibrationThreshold.clinic_id == cid,
            ReviewerSLACalibrationThreshold.threshold_key
            == DEFAULT_THRESHOLD_KEY,
        )
        .one_or_none()
    )
    previous_value: Optional[float] = None
    is_new = False
    if existing is None:
        is_new = True
        row = ReviewerSLACalibrationThreshold(
            id=f"rsct-{uuid.uuid4().hex[:16]}",
            clinic_id=cid,
            threshold_key=DEFAULT_THRESHOLD_KEY,
            threshold_value=val,
            auto_reassign_enabled=auto,
            adopted_by_user_id=actor.actor_id,
            justification=justification[:500],
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(row)
    else:
        previous_value = float(existing.threshold_value)
        existing.threshold_value = val
        existing.auto_reassign_enabled = auto
        existing.adopted_by_user_id = actor.actor_id
        existing.justification = justification[:500]
        existing.updated_at = now_iso
    db.commit()

    prev_str = (
        f"{previous_value:.4f}" if previous_value is not None else "null"
    )
    note = (
        f"clinic_id={cid} threshold_key={DEFAULT_THRESHOLD_KEY} "
        f"previous_value={prev_str} new_value={val:.4f} "
        f"auto_reassign_enabled={'true' if auto else 'false'} "
        f"is_new={'true' if is_new else 'false'} "
        f"justification={justification[:300]}"
    )
    eid = _emit_audit(
        db,
        actor,
        event="threshold_adopted",
        target_id=cid,
        target_type=ADOPTION_AUDIT_SURFACE,
        action=ADOPTION_AUDIT_ACTION,
        note=note,
        role="admin",
    )

    return AdoptOut(
        accepted=True,
        threshold_key=DEFAULT_THRESHOLD_KEY,
        threshold_value=val,
        auto_reassign_enabled=auto,
        previous_value=previous_value,
        is_new=is_new,
        audit_event_id=eid,
        adopted_at=now_iso,
        adopted_by_user_id=actor.actor_id,
    )


@router.get("/adoption-history", response_model=AdoptionHistoryOut)
def adoption_history(
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=25, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdoptionHistoryOut:
    """Paginated past-adoptions list scoped to the actor's clinic.
    Most recent first (orders by audit row id desc)."""
    _gate_read(actor)
    cid = _scope_clinic(actor)

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.action == ADOPTION_AUDIT_ACTION
    )
    if cid:
        base = base.filter(
            AuditEventRecord.note.like(f"%clinic_id={cid}%")
        )
    else:
        base = base.filter(AuditEventRecord.actor_id == actor.actor_id)

    total = base.count()
    offset = (page - 1) * page_size
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items: list[AdoptionHistoryItem] = []
    for r in rows:
        kv = _parse_adoption_kvs(r.note or "")
        prev: Optional[float] = None
        try:
            raw_prev = kv.get("previous_value")
            if raw_prev and raw_prev != "null":
                prev = float(raw_prev)
        except Exception:
            prev = None
        try:
            new_val = float(kv.get("new_value", "0") or 0.0)
        except Exception:
            new_val = 0.0
        auto = (kv.get("auto_reassign_enabled", "false") == "true")
        items.append(
            AdoptionHistoryItem(
                event_id=r.event_id,
                threshold_key=kv.get("threshold_key", DEFAULT_THRESHOLD_KEY),
                previous_value=prev,
                new_value=new_val,
                auto_reassign_enabled=auto,
                justification=kv.get("justification") or None,
                adopted_by_user_id=r.actor_id or "",
                created_at=r.created_at or "",
            )
        )

    return AdoptionHistoryOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        clinic_id=cid,
    )


@router.get("/audit-events", response_model=AuditEventsListOut)
def list_audit_events(
    surface: str = Query(default=SURFACE, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventsListOut:
    """Clinic-scoped paginated audit-event list for the threshold
    tuning surface."""
    _gate_read(actor)
    cid = _scope_clinic(actor)

    s = (surface or SURFACE).strip().lower()
    if s != SURFACE:
        s = SURFACE

    base = db.query(AuditEventRecord).filter(
        AuditEventRecord.target_type == s
    )
    if cid:
        from sqlalchemy import or_  # noqa: PLC0415

        base = base.filter(
            or_(
                AuditEventRecord.note.like(f"%clinic_id={cid}%"),
                AuditEventRecord.actor_id == actor.actor_id,
            )
        )
    else:
        base = base.filter(AuditEventRecord.actor_id == actor.actor_id)

    total = base.count()
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        AuditEventOut(
            event_id=r.event_id,
            target_id=r.target_id or "",
            target_type=r.target_type or "",
            action=r.action or "",
            role=r.role or "",
            actor_id=r.actor_id or "",
            note=r.note or "",
            created_at=r.created_at or "",
        )
        for r in rows
    ]
    return AuditEventsListOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        surface=s,
    )


@router.post("/audit-events", response_model=PageAuditOut)
def post_audit_event(
    body: PageAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PageAuditOut:
    """Page-level audit ingestion under
    ``target_type='reviewer_sla_calibration_threshold_tuning'``."""
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if actor.clinic_id:
        note_parts.append(f"clinic_id={actor.clinic_id}")
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    eid = _emit_audit(
        db,
        actor,
        event=body.event,
        target_id=target,
        target_type=SURFACE,
        action=f"{SURFACE}.{body.event}",
        note=note,
    )
    return PageAuditOut(accepted=True, event_id=eid)


__all__ = [
    "ADOPTION_AUDIT_ACTION",
    "ADOPTION_AUDIT_SURFACE",
    "SURFACE",
    "router",
]

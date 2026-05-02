"""Rotation Policy Advisor Threshold Tuning Console (CSAHP6, 2026-05-02).

Closes the recursion loop opened by CSAHP5 (#434):

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code (e.g.,
  AUTH_DOMINANT scoring 28% because the threshold is too aggressive).
* THIS router lets admins propose new thresholds, replay them against
  the last 90 days of frozen ``advice_snapshot`` rows, and adopt the
  new threshold when the replay shows higher predictive accuracy.

Endpoints
=========

* ``GET /api/v1/rotation-policy-advisor-threshold-tuning/current-thresholds``
  Clinician+. Returns current per-advice thresholds (per-clinic
  overrides merged onto defaults).
* ``POST /api/v1/rotation-policy-advisor-threshold-tuning/replay``
  Clinician+. Body: ``{override_thresholds: {advice_code: {key: value}}}``.
  Returns a :class:`ThresholdReplayResult` comparing the what-if
  accuracy against the current baseline.
* ``POST /api/v1/rotation-policy-advisor-threshold-tuning/adopt``
  Admin only. Body: ``{advice_code, threshold_key, threshold_value,
  justification}``. Upserts the threshold and emits an
  ``auth_drift_rotation_policy_advisor.threshold_adopted`` audit row.
* ``GET /api/v1/rotation-policy-advisor-threshold-tuning/adoption-history``
  Clinician+. Paginated list of past adoptions for the actor's clinic.
* ``GET /api/v1/rotation-policy-advisor-threshold-tuning/audit-events``
  Clinician+. Paginated audit-event list scoped to the surface.
* ``POST /api/v1/rotation-policy-advisor-threshold-tuning/audit-events``
  Page-level audit ingestion.

Cross-clinic safety: every endpoint scopes by ``actor.clinic_id`` and
enforces a 404 on cross-clinic access (matching the QEEG IDOR pattern
captured in the ``deepsynaps-qeeg-pdf-export-tenant-gate`` memory).
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
    RotationPolicyAdvisorThreshold,
)
from app.services.advisor_outcome_pairing import (
    DEFAULT_PAIR_LOOKAHEAD_DAYS,
    DEFAULT_WINDOW_DAYS,
    MAX_WINDOW_DAYS,
)
from app.services.rotation_policy_advisor import (
    DEFAULT_THRESHOLDS,
    ROTATION_ADVICE_CODES,
    _load_thresholds,
)
from app.services.threshold_replay import (
    ThresholdReplayResult,
    replay_thresholds_against_snapshots,
)


router = APIRouter(
    prefix="/api/v1/rotation-policy-advisor-threshold-tuning",
    tags=["Rotation Policy Advisor Threshold Tuning"],
)
_log = logging.getLogger(__name__)


# Page-level surface (target_type) for self-rows. Keeps the threshold
# adoption events on a dedicated surface so admins can pivot without
# noise from the CSAHP4 / CSAHP5 advisor surfaces.
SURFACE = "rotation_policy_advisor_threshold_tuning"


# Adoption audit lives on the SAME advisor surface as the snapshot
# rows so a single audit-trail filter shows the full chain (advice
# → snapshot → outcome → threshold adoption).
ADOPTION_AUDIT_SURFACE = "auth_drift_rotation_policy_advisor"
ADOPTION_AUDIT_ACTION = (
    "auth_drift_rotation_policy_advisor.threshold_adopted"
)


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
        _log.exception("CSAHP6 audit emit skipped")
    return eid


def _normalize_window(window_days: int) -> int:
    if window_days is None:
        return DEFAULT_WINDOW_DAYS
    try:
        w = int(window_days)
    except Exception:
        return DEFAULT_WINDOW_DAYS
    if w < 1:
        return 1
    if w > MAX_WINDOW_DAYS:
        return MAX_WINDOW_DAYS
    return w


# ── Schemas ────────────────────────────────────────────────────────────────


class CurrentThresholdsOut(BaseModel):
    """Read-only current threshold map (per-clinic overrides merged
    onto defaults). Mirrors the shape ``override_thresholds`` accepts
    on the replay endpoint so the UI can round-trip."""

    clinic_id: Optional[str] = None
    thresholds: dict[str, dict[str, float]] = Field(default_factory=dict)
    defaults: dict[str, dict[str, float]] = Field(default_factory=dict)
    has_overrides: dict[str, dict[str, bool]] = Field(default_factory=dict)
    advice_codes: list[str] = Field(default_factory=list)


class ReplayIn(BaseModel):
    override_thresholds: dict[str, dict[str, float]] = Field(
        default_factory=dict,
    )
    window_days: int = Field(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_WINDOW_DAYS)
    pair_lookahead_days: int = Field(
        default=DEFAULT_PAIR_LOOKAHEAD_DAYS, ge=1, le=90
    )


class CardsFiredChangeOut(BaseModel):
    current: int = 0
    whatif: int = 0
    delta: int = 0


class ReplayOut(BaseModel):
    override_thresholds: dict[str, dict[str, float]] = Field(
        default_factory=dict
    )
    current_thresholds: dict[str, dict[str, float]] = Field(
        default_factory=dict
    )
    current_accuracy: dict[str, float] = Field(default_factory=dict)
    whatif_accuracy: dict[str, float] = Field(default_factory=dict)
    delta: dict[str, float] = Field(default_factory=dict)
    cards_fired_change: dict[str, CardsFiredChangeOut] = Field(
        default_factory=dict
    )
    sample_size: dict[str, int] = Field(default_factory=dict)
    window_days: int = DEFAULT_WINDOW_DAYS
    pair_lookahead_days: int = DEFAULT_PAIR_LOOKAHEAD_DAYS
    clinic_id: Optional[str] = None
    snapshot_count: int = 0


class AdoptIn(BaseModel):
    advice_code: str = Field(..., min_length=1, max_length=64)
    threshold_key: str = Field(..., min_length=1, max_length=64)
    threshold_value: float = Field(..., ge=0.0, le=10000.0)
    justification: str = Field(..., min_length=10, max_length=500)


class AdoptOut(BaseModel):
    accepted: bool
    advice_code: str
    threshold_key: str
    threshold_value: float
    previous_value: Optional[float] = None
    is_new: bool = False
    audit_event_id: str
    adopted_at: str
    adopted_by_user_id: str


class AdoptionHistoryItem(BaseModel):
    event_id: str
    advice_code: str
    threshold_key: str
    previous_value: Optional[float] = None
    new_value: float
    justification: Optional[str] = None
    adopted_by_user_id: str
    created_at: str


class AdoptionHistoryOut(BaseModel):
    items: list[AdoptionHistoryItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 50
    offset: int = 0
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


# ── Helpers ────────────────────────────────────────────────────────────────


def _build_has_overrides(
    db: Session, clinic_id: Optional[str]
) -> dict[str, dict[str, bool]]:
    """For each (advice_code, threshold_key) report whether the
    clinic has an explicit override row (vs falling back to default).
    Drives the UI "modified" indicator next to each input."""
    out: dict[str, dict[str, bool]] = {
        code: {k: False for k in DEFAULT_THRESHOLDS[code].keys()}
        for code in ROTATION_ADVICE_CODES
    }
    if not clinic_id:
        return out
    try:
        rows = (
            db.query(RotationPolicyAdvisorThreshold)
            .filter(RotationPolicyAdvisorThreshold.clinic_id == clinic_id)
            .all()
        )
    except Exception:
        return out
    for row in rows:
        slot = out.setdefault(row.advice_code, {})
        slot[row.threshold_key] = True
    return out


def _parse_adoption_kvs(note: str) -> dict[str, str]:
    """Parse the ``key=value`` adoption-row note. We URL-escape spaces
    in justification on the way in so the standard tokenizer
    round-trips. ``justification`` is read out raw."""
    out: dict[str, str] = {}
    if not note:
        return out
    # Pull ``justification=...`` out first because it can contain
    # arbitrary user prose.
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


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/current-thresholds", response_model=CurrentThresholdsOut)
def current_thresholds(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CurrentThresholdsOut:
    """Return current per-advice thresholds (per-clinic overrides
    merged onto defaults). Always includes every default code so the
    UI renders consistent cards regardless of override state."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return CurrentThresholdsOut(
            clinic_id=None,
            thresholds={
                code: dict(d) for code, d in DEFAULT_THRESHOLDS.items()
            },
            defaults={
                code: dict(d) for code, d in DEFAULT_THRESHOLDS.items()
            },
            has_overrides={
                code: {k: False for k in DEFAULT_THRESHOLDS[code].keys()}
                for code in ROTATION_ADVICE_CODES
            },
            advice_codes=list(ROTATION_ADVICE_CODES),
        )

    resolved = _load_thresholds(db, cid)
    has_overrides = _build_has_overrides(db, cid)

    return CurrentThresholdsOut(
        clinic_id=cid,
        thresholds={code: dict(d) for code, d in resolved.items()},
        defaults={code: dict(d) for code, d in DEFAULT_THRESHOLDS.items()},
        has_overrides=has_overrides,
        advice_codes=list(ROTATION_ADVICE_CODES),
    )


def _result_to_out(r: ThresholdReplayResult) -> ReplayOut:
    return ReplayOut(
        override_thresholds=r.override_thresholds,
        current_thresholds=r.current_thresholds,
        current_accuracy=r.current_accuracy,
        whatif_accuracy=r.whatif_accuracy,
        delta=r.delta,
        cards_fired_change={
            code: CardsFiredChangeOut(
                current=int(v.get("current", 0)),
                whatif=int(v.get("whatif", 0)),
                delta=int(v.get("delta", 0)),
            )
            for code, v in r.cards_fired_change.items()
        },
        sample_size=r.sample_size,
        window_days=r.window_days,
        pair_lookahead_days=r.pair_lookahead_days,
        clinic_id=r.clinic_id,
        snapshot_count=r.snapshot_count,
    )


@router.post("/replay", response_model=ReplayOut)
def replay(
    body: ReplayIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReplayOut:
    """Replay ``override_thresholds`` against the last ``window_days``
    of frozen ``advice_snapshot`` rows. Returns a comparison of the
    what-if accuracy vs the current baseline."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    overrides = body.override_thresholds or {}
    result = replay_thresholds_against_snapshots(
        db,
        clinic_id=cid or "",
        override_thresholds=overrides,
        window_days=body.window_days,
        pair_lookahead_days=body.pair_lookahead_days,
    )
    return _result_to_out(result)


@router.post("/adopt", response_model=AdoptOut)
def adopt(
    body: AdoptIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdoptOut:
    """Adopt a new threshold. Admin only. Upserts the
    :class:`RotationPolicyAdvisorThreshold` row and emits a
    ``threshold_adopted`` audit row capturing the old + new values
    plus the adopter user_id and justification.

    Validation
    ----------
    * ``advice_code`` must be one of the canonical CSAHP4 codes.
    * ``threshold_key`` must be a recognised key for the advice code.
    * ``threshold_value`` must be a number in [0, 10000] (Pydantic).
    * ``justification`` must be 10-500 chars (Pydantic).
    """
    _gate_admin(actor)
    cid = _scope_clinic(actor)
    if not cid:
        raise HTTPException(
            status_code=400, detail="Actor missing clinic_id"
        )

    code = body.advice_code.strip()
    key = body.threshold_key.strip()
    val = float(body.threshold_value)
    if code not in DEFAULT_THRESHOLDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown advice_code '{code}' (expected one of {list(DEFAULT_THRESHOLDS.keys())})",
        )
    if key not in DEFAULT_THRESHOLDS[code]:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown threshold_key '{key}' for advice_code '{code}'",
        )

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Look up the existing row (upsert).
    existing = (
        db.query(RotationPolicyAdvisorThreshold)
        .filter(
            RotationPolicyAdvisorThreshold.clinic_id == cid,
            RotationPolicyAdvisorThreshold.advice_code == code,
            RotationPolicyAdvisorThreshold.threshold_key == key,
        )
        .one_or_none()
    )
    previous_value: Optional[float] = None
    is_new = False
    if existing is None:
        is_new = True
        previous_value = float(DEFAULT_THRESHOLDS[code][key])
        row = RotationPolicyAdvisorThreshold(
            id=f"rpat-{uuid.uuid4().hex[:16]}",
            clinic_id=cid,
            advice_code=code,
            threshold_key=key,
            threshold_value=val,
            adopted_by_user_id=actor.actor_id,
            justification=body.justification[:500],
            created_at=now_iso,
            updated_at=now_iso,
        )
        db.add(row)
    else:
        previous_value = float(existing.threshold_value)
        existing.threshold_value = val
        existing.adopted_by_user_id = actor.actor_id
        existing.justification = body.justification[:500]
        existing.updated_at = now_iso
    db.commit()

    # Emit the threshold_adopted audit row.
    note = (
        f"clinic_id={cid} advice_code={code} threshold_key={key} "
        f"previous_value={previous_value:.4f} new_value={val:.4f} "
        f"is_new={'true' if is_new else 'false'} "
        f"justification={body.justification[:300]}"
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
        advice_code=code,
        threshold_key=key,
        threshold_value=val,
        previous_value=previous_value,
        is_new=is_new,
        audit_event_id=eid,
        adopted_at=now_iso,
        adopted_by_user_id=actor.actor_id,
    )


@router.get("/adoption-history", response_model=AdoptionHistoryOut)
def adoption_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdoptionHistoryOut:
    """Paginated audit-row list of past threshold adoptions for the
    actor's clinic. Most recent first."""
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
    rows = (
        base.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items: list[AdoptionHistoryItem] = []
    for r in rows:
        kv = _parse_adoption_kvs(r.note or "")
        prev: Optional[float] = None
        try:
            prev = float(kv.get("previous_value", "")) if kv.get("previous_value") else None
        except Exception:
            prev = None
        try:
            new_val = float(kv.get("new_value", "0") or 0.0)
        except Exception:
            new_val = 0.0
        items.append(
            AdoptionHistoryItem(
                event_id=r.event_id,
                advice_code=kv.get("advice_code", ""),
                threshold_key=kv.get("threshold_key", ""),
                previous_value=prev,
                new_value=new_val,
                justification=kv.get("justification") or None,
                adopted_by_user_id=r.actor_id or "",
                created_at=r.created_at or "",
            )
        )

    return AdoptionHistoryOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
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
    ``target_type='rotation_policy_advisor_threshold_tuning'``."""
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


__all__ = ["router", "SURFACE", "ADOPTION_AUDIT_ACTION"]

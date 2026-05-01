"""Escalation Policy Editor (2026-05-01).

Closes the LAST operational gap of the on-call escalation chain
(``Care Team Coverage #357 → Auto-Page Worker #372 → On-Call Delivery
#373 → THIS PR``). The On-Call Delivery agent flagged a fixed
``DEFAULT_ADAPTER_ORDER = (PagerDuty, Slack, Twilio)`` in
:mod:`app.services.oncall_delivery` and a ``ShiftRoster.contact_handle``
free-text column as the only path from "user X is on call" to "send to
phone +1...". This router gives admins a configurable plane:

* **Per-clinic dispatch order** — the order of adapters tried when no
  per-surface override exists. Default: PagerDuty → Slack → Twilio.
* **Per-surface override matrix** — for any surface in
  :data:`audit_trail_router.KNOWN_SURFACES`, the admin can pin a
  different chain (e.g. SAE breaches always go PagerDuty-first; mood
  check-ins go Slack-only). Empty entries fall back to the dispatch
  order.
* **User contact mapping table** — per user, the admin pins
  ``slack_user_id`` / ``pagerduty_user_id`` / ``twilio_phone``. The
  on-call delivery service prefers these over ``contact_handle``.

Public surface
--------------
GET    /api/v1/escalation-policy/dispatch-order        Per-clinic dispatch order
PUT    /api/v1/escalation-policy/dispatch-order        Admin only; validates each adapter
GET    /api/v1/escalation-policy/surface-overrides     Per-surface override matrix
PUT    /api/v1/escalation-policy/surface-overrides     Admin only; validates each surface
GET    /api/v1/escalation-policy/user-mappings         List user → contact mappings
PUT    /api/v1/escalation-policy/user-mappings         Admin only; validates each user
POST   /api/v1/escalation-policy/test                  Admin only; sends synthetic page
POST   /api/v1/escalation-policy/audit-events          Page-level audit ingestion

Role gate
---------
* clinician — read-only on every GET (returns clinic-scoped data).
* admin / supervisor — full read+write.
* cross-clinic clinicians get 404 (we never reveal the existence of
  another clinic's policy).
* PUT mutations by non-admins return 403.

Audit events
------------
``escalation_policy.view`` (mount), ``dispatch_order_changed``,
``override_changed``, ``user_mapping_changed``, ``policy_tested``.
Every audit row carries the active policy ``version`` so reviewers can
correlate a delivery attempt with the policy that was active at the
time.

Demo honesty
------------
Demo clinics (``clinic-demo-default``, ``clinic-cd-demo``) have no real
Slack / PagerDuty / Twilio identifiers; the UI prefixes the test page
with ``DEMO`` and the audit row notes ``using_demo_data=True``.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    EscalationPolicy,
    User,
    UserContactMapping,
)
from app.services.oncall_delivery import (
    DEFAULT_ADAPTER_ORDER,
    KNOWN_ADAPTER_NAMES,
    OncallDeliveryService,
    PageMessage,
)


router = APIRouter(prefix="/api/v1/escalation-policy", tags=["Escalation Policy"])
_log = logging.getLogger(__name__)


# ── Constants ───────────────────────────────────────────────────────────────


_DEMO_CLINIC_IDS = {"clinic-demo-default", "clinic-cd-demo"}


POLICY_DISCLAIMERS = [
    "Escalation Policy controls per-clinic dispatch order, per-surface "
    "override matrix, and the per-user contact mapping (Slack / PagerDuty "
    "/ Twilio). Changes apply to the next on-call page.",
    "User contact mappings are admin-only writes; mapping a user requires "
    "they belong to your clinic. Mapping changes are audited under "
    "target_type='escalation_policy' so reviewers see who changed which "
    "user's contact.",
    "Demo clinics have no real Slack/PagerDuty/Twilio identifiers; the "
    "test-policy button is honest about this and prefixes the synthetic "
    "page with DEMO.",
    "When no policy exists for a clinic, the on-call dispatch falls back "
    "to the legacy hard-coded order PagerDuty → Slack → Twilio so deploys "
    "without an admin in the seat keep working unchanged.",
]


# Default dispatch order is read from the OncallDeliveryService class
# tuple so this router and the service can never drift apart.
DEFAULT_DISPATCH_ORDER: list[str] = [
    getattr(cls, "name", cls.__name__.lower())
    for cls in DEFAULT_ADAPTER_ORDER
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _gate_read(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "clinician")


def _gate_write(actor: AuthenticatedActor) -> None:
    require_minimum_role(actor, "admin")


def _is_admin_scope(actor: AuthenticatedActor) -> bool:
    return actor.role in ("admin", "supervisor", "regulator")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scope_clinic(
    actor: AuthenticatedActor, clinic_id: Optional[str] = None
) -> Optional[str]:
    """Resolve the clinic_id to scope to. Mirrors care_team_coverage._scope_clinic."""
    if _is_admin_scope(actor):
        return (clinic_id or actor.clinic_id) or None
    return actor.clinic_id


def _ensure_admin_owns_clinic(actor: AuthenticatedActor, clinic_id: str) -> None:
    """Block ``admin`` actors from editing another clinic's policy.

    ``supervisor`` / ``regulator`` keep their cross-clinic view (per
    care_team_coverage_router pattern). Plain ``admin`` writes must
    target their own clinic — we 404 on mismatch (never 403, so the
    existence of another clinic stays hidden).
    """
    if actor.role == "admin" and actor.clinic_id != clinic_id:
        raise ApiServiceError(
            code="cross_clinic_denied",
            message="Cannot edit another clinic's escalation policy.",
            status_code=404,
        )


def _audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the ``escalation_policy`` surface."""
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"escalation_policy-{event}-{actor.actor_id}"
        f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    note_parts: list[str] = []
    if using_demo_data:
        note_parts.append("DEMO")
    if note:
        note_parts.append(note[:500])
    final_note = "; ".join(note_parts) or event
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="escalation_policy",
            action=f"escalation_policy.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("escalation_policy self-audit skipped")
    return event_id


def _get_or_create_policy(
    db: Session, clinic_id: str
) -> EscalationPolicy:
    """Fetch the clinic's policy row, creating an empty one when missing."""
    row = (
        db.query(EscalationPolicy)
        .filter(EscalationPolicy.clinic_id == clinic_id)
        .one_or_none()
    )
    if row is not None:
        return row
    now_iso = _now_iso()
    row = EscalationPolicy(
        id=f"policy-{uuid.uuid4().hex[:12]}",
        clinic_id=clinic_id,
        dispatch_order=None,
        surface_overrides=None,
        version=1,
        note=None,
        updated_by=None,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _parse_dispatch_order(row: EscalationPolicy) -> list[str]:
    if not row.dispatch_order:
        return list(DEFAULT_DISPATCH_ORDER)
    try:
        v = json.loads(row.dispatch_order)
    except Exception:
        return list(DEFAULT_DISPATCH_ORDER)
    if not isinstance(v, list):
        return list(DEFAULT_DISPATCH_ORDER)
    cleaned = [
        str(n).strip().lower()
        for n in v
        if isinstance(n, str) and str(n).strip()
    ]
    return cleaned or list(DEFAULT_DISPATCH_ORDER)


def _parse_surface_overrides(row: EscalationPolicy) -> dict[str, list[str]]:
    if not row.surface_overrides:
        return {}
    try:
        v = json.loads(row.surface_overrides)
    except Exception:
        return {}
    if not isinstance(v, dict):
        return {}
    out: dict[str, list[str]] = {}
    for k, vv in v.items():
        if not isinstance(k, str):
            continue
        if not isinstance(vv, list):
            continue
        cleaned = [
            str(n).strip().lower()
            for n in vv
            if isinstance(n, str) and str(n).strip()
        ]
        if cleaned:
            out[str(k).strip()] = cleaned
    return out


def _validate_dispatch_order(order: list[str]) -> list[str]:
    """Normalise + validate. Raises 400 on unknown adapter."""
    if not isinstance(order, list) or not order:
        raise ApiServiceError(
            code="empty_dispatch_order",
            message="Dispatch order must be a non-empty list of adapter names.",
            status_code=400,
        )
    cleaned: list[str] = []
    seen: set[str] = set()
    for n in order:
        if not isinstance(n, str):
            raise ApiServiceError(
                code="invalid_adapter_name",
                message="Adapter names must be strings.",
                status_code=400,
            )
        name = n.strip().lower()
        if not name:
            continue
        if name not in KNOWN_ADAPTER_NAMES:
            raise ApiServiceError(
                code="unknown_adapter",
                message=(
                    f"Unknown adapter '{name}'. Known: "
                    f"{', '.join(KNOWN_ADAPTER_NAMES)}."
                ),
                status_code=400,
            )
        if name in seen:
            # Duplicates collapse silently — order honoured by first occurrence.
            continue
        seen.add(name)
        cleaned.append(name)
    if not cleaned:
        raise ApiServiceError(
            code="empty_dispatch_order",
            message="Dispatch order must contain at least one known adapter.",
            status_code=400,
        )
    return cleaned


def _known_surfaces() -> set[str]:
    """Lazy import to avoid a circular import at module load time."""
    from app.routers.audit_trail_router import KNOWN_SURFACES  # noqa: PLC0415
    return set(KNOWN_SURFACES)


def _validate_surface_overrides(
    overrides: dict[str, list[str]],
) -> dict[str, list[str]]:
    if not isinstance(overrides, dict):
        raise ApiServiceError(
            code="invalid_overrides",
            message="surface_overrides must be an object keyed by surface name.",
            status_code=400,
        )
    surfaces = _known_surfaces()
    out: dict[str, list[str]] = {}
    for raw_surface, adapter_list in overrides.items():
        surface = str(raw_surface or "").strip()
        if not surface:
            continue
        if surface not in surfaces:
            raise ApiServiceError(
                code="unknown_surface",
                message=(
                    f"Unknown surface '{surface}'. Add it to "
                    "audit_trail_router.KNOWN_SURFACES first."
                ),
                status_code=400,
            )
        # Empty list = "fall back to dispatch_order" — accept and store as
        # an explicit empty list so the UI can distinguish "unset" from
        # "explicit fallback".
        if isinstance(adapter_list, list) and not adapter_list:
            out[surface] = []
            continue
        cleaned = _validate_dispatch_order(adapter_list)
        out[surface] = cleaned
    return out


# ── Schemas ─────────────────────────────────────────────────────────────────


class DispatchOrderOut(BaseModel):
    clinic_id: Optional[str] = None
    dispatch_order: list[str] = Field(default_factory=list)
    is_default: bool = False
    version: int = 1
    known_adapters: list[str] = Field(default_factory=lambda: list(KNOWN_ADAPTER_NAMES))
    disclaimers: list[str] = Field(default_factory=lambda: list(POLICY_DISCLAIMERS))
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


class DispatchOrderIn(BaseModel):
    dispatch_order: list[str] = Field(..., min_length=1)
    note: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)


class SurfaceOverridesOut(BaseModel):
    clinic_id: Optional[str] = None
    surface_overrides: dict[str, list[str]] = Field(default_factory=dict)
    known_surfaces: list[str] = Field(default_factory=list)
    known_adapters: list[str] = Field(default_factory=lambda: list(KNOWN_ADAPTER_NAMES))
    version: int = 1
    disclaimers: list[str] = Field(default_factory=lambda: list(POLICY_DISCLAIMERS))


class SurfaceOverridesIn(BaseModel):
    surface_overrides: dict[str, list[str]]
    note: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)


class UserMappingRowOut(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    clinic_id: str
    slack_user_id: Optional[str] = None
    pagerduty_user_id: Optional[str] = None
    twilio_phone: Optional[str] = None
    note: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None
    is_demo_clinic: bool = False


class UserMappingsListOut(BaseModel):
    clinic_id: Optional[str] = None
    items: list[UserMappingRowOut] = Field(default_factory=list)
    total: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(POLICY_DISCLAIMERS))


class UserMappingItemIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    slack_user_id: Optional[str] = Field(default=None, max_length=64)
    pagerduty_user_id: Optional[str] = Field(default=None, max_length=64)
    twilio_phone: Optional[str] = Field(default=None, max_length=32)
    note: Optional[str] = Field(default=None, max_length=512)


class UserMappingsIn(BaseModel):
    items: list[UserMappingItemIn] = Field(default_factory=list)
    clinic_id: Optional[str] = Field(default=None, max_length=36)
    change_note: Optional[str] = Field(default=None, max_length=512)


class TestPolicyIn(BaseModel):
    surface: Optional[str] = Field(default=None, max_length=64)
    body: Optional[str] = Field(default=None, max_length=512)
    clinic_id: Optional[str] = Field(default=None, max_length=36)


class TestPolicyAttempt(BaseModel):
    name: str
    enabled: bool
    status: Optional[str] = None
    external_id: Optional[str] = None
    note: Optional[str] = None
    latency_ms: int = 0


class TestPolicyOut(BaseModel):
    accepted: bool = True
    clinic_id: Optional[str] = None
    surface: Optional[str] = None
    resolved_dispatch_order: list[str] = Field(default_factory=list)
    overall_status: str
    delivery_note: Optional[str] = None
    attempts: list[TestPolicyAttempt] = Field(default_factory=list)
    audit_event_id: str
    policy_version: int = 1


class PolicyAuditIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    target_id: Optional[str] = Field(default=None, max_length=128)
    using_demo_data: Optional[bool] = False


class PolicyAuditOut(BaseModel):
    accepted: bool
    event_id: str


# ── Dispatch order ──────────────────────────────────────────────────────────


@router.get("/dispatch-order", response_model=DispatchOrderOut)
def get_dispatch_order(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DispatchOrderOut:
    """Per-clinic dispatch order; falls back to PagerDuty→Slack→Twilio."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return DispatchOrderOut(
            clinic_id=None,
            dispatch_order=list(DEFAULT_DISPATCH_ORDER),
            is_default=True,
            version=1,
        )
    row = (
        db.query(EscalationPolicy)
        .filter(EscalationPolicy.clinic_id == cid)
        .one_or_none()
    )
    if row is None:
        _audit(
            db, actor,
            event="dispatch_order_viewed",
            target_id=cid,
            note="default (no policy row yet)",
            using_demo_data=cid in _DEMO_CLINIC_IDS,
        )
        return DispatchOrderOut(
            clinic_id=cid,
            dispatch_order=list(DEFAULT_DISPATCH_ORDER),
            is_default=True,
            version=1,
        )
    order = _parse_dispatch_order(row)
    _audit(
        db, actor,
        event="dispatch_order_viewed",
        target_id=cid,
        note=f"order={','.join(order)}; version={row.version}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return DispatchOrderOut(
        clinic_id=cid,
        dispatch_order=order,
        is_default=row.dispatch_order is None,
        version=int(row.version or 1),
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


@router.put("/dispatch-order", response_model=DispatchOrderOut)
def put_dispatch_order(
    body: DispatchOrderIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DispatchOrderOut:
    """Admin-only: replace the per-clinic dispatch order.

    Validates each adapter name against
    :data:`oncall_delivery.KNOWN_ADAPTER_NAMES`. Bumps the policy
    version. Emits ``escalation_policy.dispatch_order_changed``.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit the dispatch order.",
            status_code=400,
        )
    _ensure_admin_owns_clinic(actor, cid)
    cleaned = _validate_dispatch_order(body.dispatch_order)
    row = _get_or_create_policy(db, cid)
    prior = _parse_dispatch_order(row) if row.dispatch_order else list(DEFAULT_DISPATCH_ORDER)
    row.dispatch_order = json.dumps(cleaned)
    row.version = int(row.version or 1) + 1
    row.note = body.note or row.note
    row.updated_by = actor.actor_id
    row.updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    _audit(
        db, actor,
        event="dispatch_order_changed",
        target_id=cid,
        note=(
            f"prior={','.join(prior)}; new={','.join(cleaned)}; "
            f"version={row.version}"
        ),
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return DispatchOrderOut(
        clinic_id=cid,
        dispatch_order=cleaned,
        is_default=False,
        version=int(row.version),
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


# ── Surface overrides ───────────────────────────────────────────────────────


@router.get("/surface-overrides", response_model=SurfaceOverridesOut)
def get_surface_overrides(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SurfaceOverridesOut:
    """Per-surface override matrix. Empty when no overrides configured."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    surfaces = sorted(_known_surfaces())
    if not cid:
        return SurfaceOverridesOut(
            clinic_id=None,
            surface_overrides={},
            known_surfaces=surfaces,
            version=1,
        )
    row = (
        db.query(EscalationPolicy)
        .filter(EscalationPolicy.clinic_id == cid)
        .one_or_none()
    )
    overrides: dict[str, list[str]] = {}
    version = 1
    if row is not None:
        overrides = _parse_surface_overrides(row)
        version = int(row.version or 1)
    _audit(
        db, actor,
        event="surface_overrides_viewed",
        target_id=cid,
        note=f"surfaces={len(overrides)}; version={version}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return SurfaceOverridesOut(
        clinic_id=cid,
        surface_overrides=overrides,
        known_surfaces=surfaces,
        version=version,
    )


@router.put("/surface-overrides", response_model=SurfaceOverridesOut)
def put_surface_overrides(
    body: SurfaceOverridesIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SurfaceOverridesOut:
    """Admin-only: replace the per-surface override matrix.

    Validates each surface against
    :data:`audit_trail_router.KNOWN_SURFACES` and each adapter name
    against :data:`oncall_delivery.KNOWN_ADAPTER_NAMES`.
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit overrides.",
            status_code=400,
        )
    _ensure_admin_owns_clinic(actor, cid)
    cleaned = _validate_surface_overrides(body.surface_overrides or {})
    row = _get_or_create_policy(db, cid)
    prior = _parse_surface_overrides(row) if row.surface_overrides else {}
    row.surface_overrides = json.dumps(cleaned, sort_keys=True)
    row.version = int(row.version or 1) + 1
    row.note = body.note or row.note
    row.updated_by = actor.actor_id
    row.updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    changed_keys = sorted(set(prior) | set(cleaned))
    _audit(
        db, actor,
        event="override_changed",
        target_id=cid,
        note=(
            f"surfaces_touched={len(changed_keys)}; "
            f"surfaces_with_overrides={len(cleaned)}; "
            f"version={row.version}"
        ),
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return SurfaceOverridesOut(
        clinic_id=cid,
        surface_overrides=cleaned,
        known_surfaces=sorted(_known_surfaces()),
        version=int(row.version),
    )


# ── User mappings ───────────────────────────────────────────────────────────


def _user_mapping_to_out(
    row: UserContactMapping,
    user: Optional[User],
) -> UserMappingRowOut:
    return UserMappingRowOut(
        id=row.id,
        user_id=row.user_id,
        user_name=(user.display_name if user else None),
        user_email=(user.email if user else None),
        user_role=(user.role if user else None),
        clinic_id=row.clinic_id,
        slack_user_id=row.slack_user_id,
        pagerduty_user_id=row.pagerduty_user_id,
        twilio_phone=row.twilio_phone,
        note=row.note,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
        is_demo_clinic=row.clinic_id in _DEMO_CLINIC_IDS,
    )


@router.get("/user-mappings", response_model=UserMappingsListOut)
def get_user_mappings(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> UserMappingsListOut:
    """List per-user contact mappings for the actor's clinic."""
    _gate_read(actor)
    cid = _scope_clinic(actor)
    if not cid:
        return UserMappingsListOut(clinic_id=None, items=[], total=0)

    # Synthesise empty mappings for every clinician/admin/supervisor in the
    # clinic so the UI table can render a row for every user — even ones
    # that have never been mapped — without a separate "users" lookup.
    users = (
        db.query(User)
        .filter(User.clinic_id == cid)
        .filter(User.role.in_(["admin", "supervisor", "regulator", "clinician", "reviewer", "technician"]))
        .order_by(User.display_name.asc())
        .all()
    )
    user_by_id = {u.id: u for u in users}

    existing = (
        db.query(UserContactMapping)
        .filter(UserContactMapping.clinic_id == cid)
        .all()
    )
    existing_by_user = {r.user_id: r for r in existing}

    items: list[UserMappingRowOut] = []
    for u in users:
        row = existing_by_user.get(u.id)
        if row is None:
            # Synth row (id="synth-...") so the UI distinguishes
            # "never mapped" from a real DB row.
            items.append(UserMappingRowOut(
                id=f"synth-{u.id}",
                user_id=u.id,
                user_name=u.display_name,
                user_email=u.email,
                user_role=u.role,
                clinic_id=cid,
                is_demo_clinic=cid in _DEMO_CLINIC_IDS,
            ))
        else:
            items.append(_user_mapping_to_out(row, u))

    # Also surface mappings for users no longer in the clinic (audit trail
    # preserves them) so admins can see + clear stale rows.
    for r in existing:
        if r.user_id in user_by_id:
            continue
        items.append(_user_mapping_to_out(r, None))

    _audit(
        db, actor,
        event="user_mappings_viewed",
        target_id=cid,
        note=f"users={len(users)}; mappings={len(existing)}",
        using_demo_data=cid in _DEMO_CLINIC_IDS,
    )
    return UserMappingsListOut(
        clinic_id=cid,
        items=items,
        total=len(items),
    )


@router.put("/user-mappings", response_model=UserMappingsListOut)
def put_user_mappings(
    body: UserMappingsIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> UserMappingsListOut:
    """Admin-only: upsert one or many per-user contact mappings.

    Validates that every ``user_id`` belongs to the actor's clinic. A
    blank/empty value clears the corresponding column. Each mapping
    change emits one ``escalation_policy.user_mapping_changed`` audit
    row keyed on the user_id; the change_note (optional but
    recommended) is recorded verbatim so reviewers see "rotated phone
    after handset switch" not "user_mapping_changed".
    """
    _gate_write(actor)
    cid = _scope_clinic(actor, body.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to edit user mappings.",
            status_code=400,
        )
    _ensure_admin_owns_clinic(actor, cid)

    # Pre-validate every user_id is in this clinic.
    requested_ids = [it.user_id for it in body.items]
    if requested_ids:
        users = (
            db.query(User)
            .filter(User.id.in_(requested_ids))
            .all()
        )
        user_by_id = {u.id: u for u in users}
        for uid in requested_ids:
            u = user_by_id.get(uid)
            if u is None or u.clinic_id != cid:
                raise ApiServiceError(
                    code="user_not_in_clinic",
                    message=f"user_id '{uid}' is not a member of this clinic.",
                    status_code=400,
                )

    now_iso = _now_iso()
    for it in body.items:
        existing = (
            db.query(UserContactMapping)
            .filter(UserContactMapping.user_id == it.user_id)
            .one_or_none()
        )
        if existing is None:
            existing = UserContactMapping(
                id=f"contact-{uuid.uuid4().hex[:12]}",
                user_id=it.user_id,
                clinic_id=cid,
                slack_user_id=(it.slack_user_id or None),
                pagerduty_user_id=(it.pagerduty_user_id or None),
                twilio_phone=(it.twilio_phone or None),
                note=(it.note or None),
                updated_by=actor.actor_id,
                created_at=now_iso,
                updated_at=now_iso,
            )
            db.add(existing)
        else:
            existing.clinic_id = cid
            existing.slack_user_id = (it.slack_user_id or None)
            existing.pagerduty_user_id = (it.pagerduty_user_id or None)
            existing.twilio_phone = (it.twilio_phone or None)
            existing.note = (it.note or existing.note)
            existing.updated_by = actor.actor_id
            existing.updated_at = now_iso
        # Per-user audit row — the change_note is always recorded so the
        # regulator sees the human reason for the contact change.
        _audit(
            db, actor,
            event="user_mapping_changed",
            target_id=it.user_id,
            note=(
                f"slack={it.slack_user_id or '-'}; "
                f"pagerduty={it.pagerduty_user_id or '-'}; "
                f"twilio={it.twilio_phone or '-'}; "
                f"reason={(body.change_note or '-')[:240]}"
            ),
            using_demo_data=cid in _DEMO_CLINIC_IDS,
        )
    db.commit()
    return get_user_mappings(actor=actor, db=db)


# ── Test policy ─────────────────────────────────────────────────────────────


@router.post("/test", response_model=TestPolicyOut)
def test_policy(
    body: Optional[TestPolicyIn] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TestPolicyOut:
    """Admin-only: send a synthetic test page using the active policy.

    Resolves the dispatch order through the same path the real on-call
    delivery uses (per-surface override > clinic dispatch order > legacy
    default). Returns per-adapter result + the resolved order so a
    reviewer sees at a glance which adapter answered and in which order
    they were tried. Emits ``escalation_policy.policy_tested`` audit.
    """
    _gate_write(actor)
    payload = body or TestPolicyIn()
    cid = _scope_clinic(actor, payload.clinic_id)
    if not cid:
        raise ApiServiceError(
            code="no_clinic",
            message="Admin must belong to a clinic to test the policy.",
            status_code=400,
        )
    _ensure_admin_owns_clinic(actor, cid)

    policy_row = (
        db.query(EscalationPolicy)
        .filter(EscalationPolicy.clinic_id == cid)
        .one_or_none()
    )
    version = int(policy_row.version) if policy_row is not None else 1

    surface = (payload.surface or "").strip() or None
    if surface and surface not in _known_surfaces():
        raise ApiServiceError(
            code="unknown_surface",
            message=(
                f"Unknown surface '{surface}'. Add it to "
                "audit_trail_router.KNOWN_SURFACES first."
            ),
            status_code=400,
        )

    resolved_order = OncallDeliveryService._resolve_dispatch_order(
        cid, surface, db
    )

    service = OncallDeliveryService(
        clinic_id=cid, surface=surface, db=db,
    )

    is_demo = cid in _DEMO_CLINIC_IDS
    demo_prefix = "DEMO " if is_demo else ""
    test_body = (
        payload.body
        if payload.body
        else (
            f"{demo_prefix}[Escalation Policy test] If you receive this, "
            f"the on-call dispatch chain for clinic={cid} surface="
            f"{surface or '*'} is wired correctly under policy "
            f"version={version}."
        )
    )
    message = PageMessage(
        clinic_id=cid,
        surface=surface or "escalation_policy",
        audit_event_id=(
            f"policy-test-{actor.actor_id}-"
            f"{int(datetime.now(timezone.utc).timestamp())}"
        ),
        body=test_body,
        severity="low",
        recipient_display_name=actor.display_name,
    )
    result = service.send(message)

    attempted = {a.adapter for a in (result.attempts or []) if a.adapter}
    attempts_out: list[TestPolicyAttempt] = []
    for adapter in service.adapters:
        match = next(
            (a for a in (result.attempts or []) if a.adapter == getattr(adapter, "name", "")),
            None,
        )
        attempts_out.append(TestPolicyAttempt(
            name=getattr(adapter, "name", "unknown"),
            enabled=bool(getattr(adapter, "enabled", False)),
            status=(match.status if match else None),
            external_id=(match.external_id if match else None),
            note=(match.note if match else None),
            latency_ms=(match.latency_ms if match else 0),
        ))

    eid = _audit(
        db, actor,
        event="policy_tested",
        target_id=cid,
        note=(
            f"surface={surface or '-'}; "
            f"order={','.join(resolved_order)}; "
            f"overall={result.status}; "
            f"adapters_attempted={','.join(sorted(attempted)) or '-'}; "
            f"version={version}"
        ),
        using_demo_data=is_demo,
    )

    return TestPolicyOut(
        accepted=True,
        clinic_id=cid,
        surface=surface,
        resolved_dispatch_order=resolved_order,
        overall_status=result.status,
        delivery_note=result.note,
        attempts=attempts_out,
        audit_event_id=eid,
        policy_version=version,
    )


# ── Audit ingestion ─────────────────────────────────────────────────────────


@router.post("/audit-events", response_model=PolicyAuditOut)
def post_audit_event(
    body: PolicyAuditIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PolicyAuditOut:
    """Page-level audit ingestion under ``target_type='escalation_policy'``."""
    _gate_read(actor)
    target = body.target_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if body.target_id:
        note_parts.append(f"target={body.target_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    eid = _audit(
        db, actor,
        event=body.event,
        target_id=target,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return PolicyAuditOut(accepted=True, event_id=eid)

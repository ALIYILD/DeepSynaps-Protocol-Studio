"""Patient Symptom Journal launch-audit (2026-05-01).

First **patient-facing** launch-audit surface in the chain. Establishes
the patient-side audit pattern for subsequent patient pages (Wellness,
Tasks, Reports, Messages, Home Devices).

Endpoints
---------
GET    /api/v1/symptom-journal/entries           List patient-scoped entries (filters)
GET    /api/v1/symptom-journal/summary           Top counts + severity series 7d / 30d
GET    /api/v1/symptom-journal/entries/{id}      Detail (resolves soft-deleted rows for audit)
POST   /api/v1/symptom-journal/entries           Create — auto-stamps is_demo + validates consent
PATCH  /api/v1/symptom-journal/entries/{id}      Edit — author only, increments revision_count
DELETE /api/v1/symptom-journal/entries/{id}      Soft-delete — reason required, audit row preserved
POST   /api/v1/symptom-journal/entries/{id}/share Broadcast to actor's care team (clinician audit)
GET    /api/v1/symptom-journal/export.csv        DEMO-prefixed when patient.is_demo
GET    /api/v1/symptom-journal/export.ndjson     DEMO-prefixed when patient.is_demo
POST   /api/v1/symptom-journal/audit-events      Page-level audit ingestion (target_type=symptom_journal)

Role gate
---------
The patient role is canonical: a patient writes to OWN journal only
(``patient_id`` is auto-resolved from the actor; cross-patient writes
return 404). Admins keep cross-clinic visibility for support / audit
review. Clinicians do NOT see entries unless the patient explicitly
shares them (the ``share`` endpoint emits a clinician-visible audit row
that surfaces in the standard care-team feeds without exposing the entry
text directly through the journal API).

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR an active ``ConsentRecord`` row with ``status='withdrawn'``) the
journal is read-only post-revocation: existing entries remain visible,
no new entries can be created or edited (HTTP 403). This is enforced at
write endpoints via :func:`_assert_consent_active`.

Demo honesty
------------
``is_demo`` is stamped on create from :func:`_patient_is_demo` (mirrors
the pattern used by the Patient Profile launch audit). Exports prefix
``DEMO-`` to the filename whenever the patient is demo, and the header
``X-Journal-Demo: 1`` is set so reviewers can see at-a-glance.

Audit hooks
-----------
Every endpoint emits at least one ``symptom_journal.<event>`` audit row
via the umbrella audit_events table. Surface name: ``symptom_journal``
(whitelisted by ``audit_trail_router.KNOWN_SURFACES`` and the qEEG
audit-events ingestion endpoint).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ConsentRecord,
    Patient,
    SymptomJournalEntry,
    User,
)


router = APIRouter(prefix="/api/v1/symptom-journal", tags=["Symptom Journal"])
_log = logging.getLogger(__name__)


# ── Disclaimers surfaced on every list / summary read ───────────────────────


SYMPTOM_JOURNAL_DISCLAIMERS = [
    "Symptom Journal entries are part of your clinical record once linked "
    "to a treatment course. Edits and deletes are audited; deletes are soft "
    "(the row is preserved for regulatory review).",
    "Sharing an entry with your care team broadcasts a clinician-visible "
    "audit row. Until you share, entries are visible only to you and your "
    "clinic admin.",
    "If you withdraw consent, your existing entries remain readable but "
    "you cannot add or edit new entries.",
]


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}


def _patient_is_demo(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` to avoid a circular import.

    A patient is considered demo if their ``notes`` start with ``[DEMO]`` or
    if their owning clinician sits in a known demo clinic. Updates to the
    canonical helper should be reflected here.
    """
    if patient is None:
        return False
    notes = patient.notes or ""
    if notes.startswith("[DEMO]"):
        return True
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        if u is None or not u.clinic_id:
            return False
        return u.clinic_id in {"clinic-demo-default", "clinic-cd-demo"}
    except Exception:
        return False


def _resolve_patient_for_actor(
    db: Session, actor: AuthenticatedActor, patient_id: Optional[str] = None
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role:
      * Always resolves to the patient linked to the user's account
        (email match) or the demo seed patient when ``actor_id ==
        actor-patient-demo``. ``patient_id`` is ignored if supplied —
        a patient cannot escape their own scope by spoofing the path.
      * Mismatch (patient_id passed in path AND not equal to the
        resolved row) returns 404 to avoid leaking existence.
    Admin role:
      * Resolves to the Patient row at ``patient_id`` if provided, else
        first-by-id (rare; admin endpoints typically pass an explicit
        patient_id query).
    Clinician role:
      * Rejected: clinicians do not access patient journal entries except
        via the explicit share flow (which surfaces audit events, not
        rows). Returns 403.
    """
    if actor.role == "patient":
        if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
            patient = (
                db.query(Patient)
                .filter(Patient.email.in_(list(_DEMO_PATIENT_EMAILS)))
                .first()
            )
        else:
            user = db.query(User).filter_by(id=actor.actor_id).first()
            if user is None or not user.email:
                raise ApiServiceError(
                    code="not_found",
                    message="Patient record not found.",
                    status_code=404,
                )
            patient = db.query(Patient).filter(Patient.email == user.email).first()
        if patient is None:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        # Cross-patient path-spoof guard.
        if patient_id is not None and patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        return patient

    if actor.role == "admin":
        if patient_id is None:
            raise ApiServiceError(
                code="patient_id_required",
                message="Admin journal access requires an explicit patient_id.",
                status_code=400,
            )
        patient = db.query(Patient).filter_by(id=patient_id).first()
        if patient is None:
            raise ApiServiceError(
                code="not_found",
                message="Patient record not found.",
                status_code=404,
            )
        return patient

    # All other roles (clinician, technician, reviewer, guest): denied.
    # Clinicians read journal entries only through the share-broadcast
    # audit row, never the journal API directly.
    raise ApiServiceError(
        code="patient_role_required",
        message="Symptom Journal access is restricted to the patient and admins.",
        status_code=403,
    )


def _consent_active(db: Session, patient: Patient) -> bool:
    """Return False once the patient has withdrawn consent.

    Two signals — either is sufficient to revoke:
      * ``Patient.consent_signed`` is False and no active ConsentRecord
        exists. (Pre-signature state — they have not consented yet.)
      * Any ConsentRecord for the patient is in status ``withdrawn``.
    """
    has_withdrawn = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "withdrawn",
        )
        .first()
        is not None
    )
    if has_withdrawn:
        return False
    if patient.consent_signed:
        return True
    # No signature yet AND no withdrawal — treat as inactive (prevents
    # accidental data capture before the patient has consented).
    has_active = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient.id,
            ConsentRecord.status == "active",
        )
        .first()
        is not None
    )
    return has_active


def _assert_consent_active(db: Session, patient: Patient) -> None:
    if not _consent_active(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Symptom Journal writes require active consent. Existing "
                "entries remain readable; new entries are blocked until "
                "consent is reinstated."
            ),
            status_code=403,
        )


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
) -> str:
    """Best-effort audit hook for the symptom_journal surface; never raises.

    Mirrors the pattern in onboarding/patient-profile launch audits.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    event_id = (
        f"symptom_journal-{event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
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
            target_type="symptom_journal",
            action=f"symptom_journal.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("symptom_journal self-audit skipped")
    return event_id


def _normalise_tags(raw: Optional[str | list[str]]) -> Optional[str]:
    """Return a comma-separated lowercase tag string, or None.

    Tags arrive either as a list (preferred) or a comma-string. We trim
    each entry, drop empties / oversized values, and dedupe while
    preserving order.
    """
    if raw is None:
        return None
    if isinstance(raw, str):
        items = [t.strip() for t in raw.split(",")]
    else:
        items = [str(t).strip() for t in raw]
    seen: set[str] = set()
    out: list[str] = []
    for t in items:
        t_lc = t.lower()
        if not t_lc or len(t_lc) > 32 or t_lc in seen:
            continue
        seen.add(t_lc)
        out.append(t_lc)
        if len(out) >= 16:
            break
    return ",".join(out) if out else None


def _entry_to_dict(row: SymptomJournalEntry) -> dict:
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "author_actor_id": row.author_actor_id,
        "severity": row.severity,
        "note": row.note,
        "tags": [t for t in (row.tags or "").split(",") if t],
        "is_demo": bool(row.is_demo),
        "shared_at": row.shared_at.isoformat() if row.shared_at else None,
        "shared_with": row.shared_with,
        "revision_count": row.revision_count,
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "delete_reason": row.delete_reason,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class SymptomJournalEntryOut(BaseModel):
    id: str
    patient_id: str
    author_actor_id: str
    severity: Optional[int] = None
    note: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    is_demo: bool = False
    shared_at: Optional[str] = None
    shared_with: Optional[str] = None
    revision_count: int = 0
    deleted_at: Optional[str] = None
    delete_reason: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SymptomJournalListResponse(BaseModel):
    items: list[SymptomJournalEntryOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    consent_active: bool
    is_demo: bool
    disclaimers: list[str] = Field(
        default_factory=lambda: list(SYMPTOM_JOURNAL_DISCLAIMERS)
    )


class SymptomJournalSummaryResponse(BaseModel):
    entries_7d: int = 0
    entries_30d: int = 0
    severity_avg_7d: Optional[float] = None
    severity_avg_30d: Optional[float] = None
    top_tags_30d: list[dict] = Field(default_factory=list)
    severity_series_7d: list[dict] = Field(default_factory=list)
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(SYMPTOM_JOURNAL_DISCLAIMERS)
    )


class SymptomJournalEntryIn(BaseModel):
    severity: Optional[int] = Field(None, ge=0, le=10)
    note: Optional[str] = Field(None, max_length=4000)
    tags: Optional[list[str]] = None

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None


class SymptomJournalEntryPatch(BaseModel):
    severity: Optional[int] = Field(None, ge=0, le=10)
    note: Optional[str] = Field(None, max_length=4000)
    tags: Optional[list[str]] = None

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        return v or None


class SymptomJournalDeleteIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=255)


class SymptomJournalShareIn(BaseModel):
    note: Optional[str] = Field(None, max_length=255)


class SymptomJournalShareOut(BaseModel):
    accepted: bool
    entry_id: str
    shared_at: str
    shared_with: str


class SymptomJournalAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    entry_id: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=512)
    using_demo_data: bool = False


class SymptomJournalAuditEventAck(BaseModel):
    accepted: bool
    event_id: str


# ── Validation helper for create/edit payloads ──────────────────────────────


def _require_payload_meaningful(
    severity: Optional[int], note: Optional[str], tags: Optional[list[str]]
) -> None:
    """Reject empty payloads.

    A journal entry with no severity, no note, and no tags carries no
    clinical information; we refuse it rather than persist an empty
    timestamp row.
    """
    if severity is None and not note and not tags:
        raise ApiServiceError(
            code="empty_journal_entry",
            message=(
                "An entry must include at least one of: severity, note, "
                "or tags."
            ),
            status_code=422,
        )


# ── Filter parser ───────────────────────────────────────────────────────────


def _apply_filters(
    q,
    *,
    since: Optional[str],
    until: Optional[str],
    tag: Optional[str],
    severity_min: Optional[int],
    severity_max: Optional[int],
    q_text: Optional[str],
    include_deleted: bool,
):
    if not include_deleted:
        q = q.filter(SymptomJournalEntry.deleted_at.is_(None))
    if since:
        try:
            ts = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q = q.filter(SymptomJournalEntry.created_at >= ts)
        except ValueError:
            pass
    if until:
        try:
            ts = datetime.fromisoformat(until.replace("Z", "+00:00"))
            q = q.filter(SymptomJournalEntry.created_at <= ts)
        except ValueError:
            pass
    if tag:
        tag_lc = tag.strip().lower()
        if tag_lc:
            q = q.filter(SymptomJournalEntry.tags.like(f"%{tag_lc}%"))
    if severity_min is not None:
        q = q.filter(SymptomJournalEntry.severity >= severity_min)
    if severity_max is not None:
        q = q.filter(SymptomJournalEntry.severity <= severity_max)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                SymptomJournalEntry.note.like(like),
                SymptomJournalEntry.tags.like(like),
            )
        )
    return q


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/entries", response_model=SymptomJournalListResponse)
def list_entries(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    severity_min: Optional[int] = Query(default=None, ge=0, le=10),
    severity_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalListResponse:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(SymptomJournalEntry).filter(
        SymptomJournalEntry.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        severity_min=severity_min,
        severity_max=severity_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(SymptomJournalEntry.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    _self_audit(
        db,
        actor,
        event="view",
        target_id=patient.id,
        note=(
            f"items={len(rows)} total={total} since={since or '-'} "
            f"until={until or '-'} tag={tag or '-'}"
        ),
        using_demo_data=is_demo,
    )

    return SymptomJournalListResponse(
        items=[SymptomJournalEntryOut(**_entry_to_dict(r)) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        consent_active=_consent_active(db, patient),
        is_demo=is_demo,
    )


@router.get("/summary", response_model=SymptomJournalSummaryResponse)
def get_summary(
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalSummaryResponse:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)
    now = datetime.now(timezone.utc)
    cutoff_7d = now - timedelta(days=7)
    cutoff_30d = now - timedelta(days=30)

    base = db.query(SymptomJournalEntry).filter(
        SymptomJournalEntry.patient_id == patient.id,
        SymptomJournalEntry.deleted_at.is_(None),
    )
    rows_30d = base.filter(SymptomJournalEntry.created_at >= cutoff_30d).all()

    # SQLite strips tzinfo on roundtrip — coerce to tz-aware UTC before
    # comparing against tz-aware ``cutoff_7d``. See memory note
    # ``deepsynaps-sqlite-tz-naive.md``.
    def _aware(dt):
        if dt is None:
            return None
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

    rows_7d = [r for r in rows_30d if _aware(r.created_at) and _aware(r.created_at) >= cutoff_7d]
    sev_7d = [r.severity for r in rows_7d if r.severity is not None]
    sev_30d = [r.severity for r in rows_30d if r.severity is not None]

    # Top tags / 30d
    tag_counts: dict[str, int] = {}
    for r in rows_30d:
        for t in (r.tags or "").split(","):
            t = t.strip().lower()
            if not t:
                continue
            tag_counts[t] = tag_counts.get(t, 0) + 1
    top_tags = [
        {"tag": t, "count": c}
        for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    ]

    # Severity series / 7d (per-day average)
    series_buckets: dict[str, list[int]] = {}
    for r in rows_7d:
        if r.severity is None or r.created_at is None:
            continue
        day = _aware(r.created_at).date().isoformat()
        series_buckets.setdefault(day, []).append(r.severity)
    severity_series = [
        {"date": day, "avg_severity": round(sum(vals) / len(vals), 2), "count": len(vals)}
        for day, vals in sorted(series_buckets.items())
    ]

    _self_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=f"entries_7d={len(rows_7d)} entries_30d={len(rows_30d)}",
        using_demo_data=is_demo,
    )

    return SymptomJournalSummaryResponse(
        entries_7d=len(rows_7d),
        entries_30d=len(rows_30d),
        severity_avg_7d=(round(sum(sev_7d) / len(sev_7d), 2) if sev_7d else None),
        severity_avg_30d=(round(sum(sev_30d) / len(sev_30d), 2) if sev_30d else None),
        top_tags_30d=top_tags,
        severity_series_7d=severity_series,
        consent_active=_consent_active(db, patient),
        is_demo=is_demo,
    )


@router.get("/entries/{entry_id}", response_model=SymptomJournalEntryOut)
def get_entry(
    entry_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalEntryOut:
    """Return a single entry, including soft-deleted rows so the audit
    trail can resolve event detail. Cross-patient access returns 404.
    """
    row = (
        db.query(SymptomJournalEntry).filter(SymptomJournalEntry.id == entry_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Journal entry not found.", status_code=404
        )
    # Resolve the actor's patient and reject cross-patient reads.
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    is_demo = _patient_is_demo(db, patient)
    _self_audit(
        db,
        actor,
        event="entry_viewed",
        target_id=row.id,
        note=f"patient={patient.id}",
        using_demo_data=is_demo,
    )
    return SymptomJournalEntryOut(**_entry_to_dict(row))


@router.post("/entries", response_model=SymptomJournalEntryOut, status_code=201)
def create_entry(
    body: SymptomJournalEntryIn,
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalEntryOut:
    _require_payload_meaningful(body.severity, body.note, body.tags)
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    _assert_consent_active(db, patient)
    is_demo = _patient_is_demo(db, patient)

    row = SymptomJournalEntry(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        author_actor_id=actor.actor_id,
        severity=body.severity,
        note=body.note,
        tags=_normalise_tags(body.tags),
        is_demo=is_demo,
        revision_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="entry_logged",
        target_id=row.id,
        note=(
            f"patient={patient.id}; severity={row.severity}; "
            f"tags={row.tags or '-'}"
        ),
        using_demo_data=is_demo,
    )
    return SymptomJournalEntryOut(**_entry_to_dict(row))


@router.patch("/entries/{entry_id}", response_model=SymptomJournalEntryOut)
def edit_entry(
    body: SymptomJournalEntryPatch,
    entry_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalEntryOut:
    row = (
        db.query(SymptomJournalEntry).filter(SymptomJournalEntry.id == entry_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Journal entry not found.", status_code=404
        )
    if row.deleted_at is not None:
        raise ApiServiceError(
            code="entry_deleted",
            message="Cannot edit a deleted entry. Restore it first.",
            status_code=409,
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    _assert_consent_active(db, patient)
    is_demo = _patient_is_demo(db, patient)

    # Author-only edits. Admins are deliberately NOT exempt — clinical
    # record integrity demands that only the author edits their own
    # entry; admin-side corrections must use the soft-delete + new-entry
    # flow which leaves an explicit audit trail.
    if row.author_actor_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="Only the entry author can edit this entry.",
            status_code=403,
        )

    changed_fields: list[str] = []
    if body.severity is not None and body.severity != row.severity:
        row.severity = body.severity
        changed_fields.append("severity")
    if body.note is not None and body.note != row.note:
        row.note = body.note
        changed_fields.append("note")
    if body.tags is not None:
        new_tags = _normalise_tags(body.tags)
        if new_tags != row.tags:
            row.tags = new_tags
            changed_fields.append("tags")

    if not changed_fields:
        # Nothing changed — still emit an audit row so the access is
        # recorded, but skip the revision_count bump.
        _self_audit(
            db,
            actor,
            event="entry_edit_noop",
            target_id=row.id,
            note=f"patient={patient.id}",
            using_demo_data=is_demo,
        )
        return SymptomJournalEntryOut(**_entry_to_dict(row))

    row.revision_count = (row.revision_count or 0) + 1
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="entry_edited",
        target_id=row.id,
        note=(
            f"patient={patient.id}; rev={row.revision_count}; "
            f"fields={','.join(changed_fields)}"
        ),
        using_demo_data=is_demo,
    )
    return SymptomJournalEntryOut(**_entry_to_dict(row))


@router.delete("/entries/{entry_id}", response_model=SymptomJournalEntryOut)
def soft_delete_entry(
    body: SymptomJournalDeleteIn,
    entry_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalEntryOut:
    """Soft-delete an entry. The row is preserved (deleted_at + reason)
    so the audit trail remains complete; standard list reads filter it
    out, but the per-id detail endpoint still returns it for review.
    """
    row = (
        db.query(SymptomJournalEntry).filter(SymptomJournalEntry.id == entry_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Journal entry not found.", status_code=404
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    is_demo = _patient_is_demo(db, patient)
    if row.deleted_at is not None:
        # Idempotent — already deleted. Emit an audit row but don't bump
        # state.
        _self_audit(
            db,
            actor,
            event="entry_delete_noop",
            target_id=row.id,
            note=f"patient={patient.id}; already_deleted=1",
            using_demo_data=is_demo,
        )
        return SymptomJournalEntryOut(**_entry_to_dict(row))

    # Author-only delete. Same rationale as edit.
    if row.author_actor_id != actor.actor_id:
        raise ApiServiceError(
            code="forbidden",
            message="Only the entry author can delete this entry.",
            status_code=403,
        )
    row.deleted_at = datetime.now(timezone.utc)
    row.delete_reason = body.reason.strip()[:255]
    row.updated_at = row.deleted_at
    db.add(row)
    db.commit()
    db.refresh(row)

    _self_audit(
        db,
        actor,
        event="entry_deleted",
        target_id=row.id,
        note=f"patient={patient.id}; reason={row.delete_reason[:200]}",
        using_demo_data=is_demo,
    )
    return SymptomJournalEntryOut(**_entry_to_dict(row))


@router.post("/entries/{entry_id}/share", response_model=SymptomJournalShareOut)
def share_entry(
    body: SymptomJournalShareIn,
    entry_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalShareOut:
    """Broadcast an entry to the patient's care team.

    Concretely: marks the entry ``shared_at`` + records the target
    clinician's user id, and emits BOTH a patient-side
    ``symptom_journal.entry_shared`` audit row AND a clinician-visible
    ``symptom_journal.entry_shared_to_clinician`` row keyed on the
    clinician's user id so the standard audit-trail UI can surface it
    in the clinician's feed.

    No row content is duplicated — the clinician resolves the entry id
    against this router's read endpoints when they review the audit
    feed, and the read endpoint enforces its own role / share gate.
    """
    row = (
        db.query(SymptomJournalEntry).filter(SymptomJournalEntry.id == entry_id).first()
    )
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Journal entry not found.", status_code=404
        )
    patient = _resolve_patient_for_actor(db, actor, row.patient_id)
    if row.author_actor_id != actor.actor_id and actor.role != "admin":
        raise ApiServiceError(
            code="forbidden",
            message="Only the entry author can share this entry.",
            status_code=403,
        )
    is_demo = _patient_is_demo(db, patient)

    clinician_id = patient.clinician_id
    now = datetime.now(timezone.utc)
    row.shared_at = now
    row.shared_with = clinician_id
    row.updated_at = now
    db.add(row)
    db.commit()
    db.refresh(row)

    # Patient-facing audit row.
    _self_audit(
        db,
        actor,
        event="entry_shared",
        target_id=row.id,
        note=(
            f"patient={patient.id}; clinician={clinician_id}; "
            f"reason={(body.note or '')[:120]}"
        ),
        using_demo_data=is_demo,
    )
    # Clinician-visible audit row — keyed on clinician_id so the
    # clinician's audit feed surfaces it.
    try:
        from app.repositories.audit import create_audit_event  # noqa: PLC0415

        clinician_event_id = (
            f"symptom_journal-shared_to_clinician-{actor.actor_id}"
            f"-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        clinician_note_parts: list[str] = []
        if is_demo:
            clinician_note_parts.append("DEMO")
        clinician_note_parts.append(f"patient={patient.id}")
        clinician_note_parts.append(f"entry={row.id}")
        if body.note:
            clinician_note_parts.append(body.note[:200])
        create_audit_event(
            db,
            event_id=clinician_event_id,
            target_id=clinician_id,
            target_type="symptom_journal",
            action="symptom_journal.entry_shared_to_clinician",
            role=actor.role,
            actor_id=actor.actor_id,
            note="; ".join(clinician_note_parts)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("symptom_journal clinician-share audit skipped")

    return SymptomJournalShareOut(
        accepted=True,
        entry_id=row.id,
        shared_at=now.isoformat(),
        shared_with=clinician_id,
    )


# ── Exports ─────────────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "id",
    "patient_id",
    "author_actor_id",
    "severity",
    "tags",
    "note",
    "is_demo",
    "shared_at",
    "shared_with",
    "revision_count",
    "deleted_at",
    "delete_reason",
    "created_at",
    "updated_at",
]


def _filename(prefix: str, is_demo: bool) -> str:
    base = "symptom_journal"
    if is_demo:
        base = f"DEMO-{base}"
    return f"{base}.{prefix}"


@router.get("/export.csv")
def export_csv(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    severity_min: Optional[int] = Query(default=None, ge=0, le=10),
    severity_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=True),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(SymptomJournalEntry).filter(
        SymptomJournalEntry.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        severity_min=severity_min,
        severity_max=severity_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    rows = filtered.order_by(SymptomJournalEntry.created_at.desc()).limit(10_000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow(
            [
                r.id,
                r.patient_id,
                r.author_actor_id,
                r.severity if r.severity is not None else "",
                r.tags or "",
                (r.note or "").replace("\n", " ").replace("\r", " "),
                int(bool(r.is_demo)),
                r.shared_at.isoformat() if r.shared_at else "",
                r.shared_with or "",
                r.revision_count or 0,
                r.deleted_at.isoformat() if r.deleted_at else "",
                (r.delete_reason or "").replace("\n", " "),
                r.created_at.isoformat() if r.created_at else "",
                r.updated_at.isoformat() if r.updated_at else "",
            ]
        )

    _self_audit(
        db,
        actor,
        event="export_csv",
        target_id=patient.id,
        note=f"rows={len(rows)} demo={int(is_demo)}",
        using_demo_data=is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('csv', is_demo)}",
            "Cache-Control": "no-store",
            "X-Journal-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/export.ndjson")
def export_ndjson(
    patient_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None, max_length=32),
    severity_min: Optional[int] = Query(default=None, ge=0, le=10),
    severity_max: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = Query(default=None, max_length=200),
    include_deleted: bool = Query(default=True),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    patient = _resolve_patient_for_actor(db, actor, patient_id)
    is_demo = _patient_is_demo(db, patient)

    base = db.query(SymptomJournalEntry).filter(
        SymptomJournalEntry.patient_id == patient.id
    )
    filtered = _apply_filters(
        base,
        since=since,
        until=until,
        tag=tag,
        severity_min=severity_min,
        severity_max=severity_max,
        q_text=q,
        include_deleted=include_deleted,
    )
    rows = filtered.order_by(SymptomJournalEntry.created_at.desc()).limit(10_000).all()

    lines = [json.dumps(_entry_to_dict(r), separators=(",", ":")) for r in rows]
    body = "\n".join(lines) + ("\n" if lines else "")

    _self_audit(
        db,
        actor,
        event="export_ndjson",
        target_id=patient.id,
        note=f"rows={len(rows)} demo={int(is_demo)}",
        using_demo_data=is_demo,
    )

    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f"attachment; filename={_filename('ndjson', is_demo)}",
            "Cache-Control": "no-store",
            "X-Journal-Demo": "1" if is_demo else "0",
        },
    )


# ── Audit-events ingestion (page-level) ─────────────────────────────────────


@router.post("/audit-events", response_model=SymptomJournalAuditEventAck)
def post_audit_event(
    body: SymptomJournalAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SymptomJournalAuditEventAck:
    """Record a page-level audit event from the journal UI.

    Surface: ``symptom_journal``. Common events: ``view`` (mount),
    ``filter_changed``, ``form_opened``, ``share_clicked``,
    ``export_clicked``, ``consent_banner_shown``.

    Lightweight — does not validate ``entry_id`` against the journal
    table. Audit ingestion must not couple to the resource lifecycle.
    """
    # Patient-or-admin gate. Clinicians are blocked from emitting
    # journal audit rows directly to keep the surface clearly attributed
    # to patient-side actions.
    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(
            code="patient_role_required",
            message="Symptom Journal audit ingestion is restricted to patient and admin roles.",
            status_code=403,
        )
    note_parts: list[str] = []
    if body.entry_id:
        note_parts.append(f"entry={body.entry_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event
    event_id = _self_audit(
        db,
        actor,
        event=body.event,
        target_id=body.entry_id or actor.actor_id,
        note=note,
        using_demo_data=bool(body.using_demo_data),
    )
    return SymptomJournalAuditEventAck(accepted=True, event_id=event_id)

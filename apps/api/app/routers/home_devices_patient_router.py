"""Patient Home Devices launch-audit (2026-05-01).

Fifth patient-facing launch-audit surface in the chain after Symptom
Journal (#344), Wellness Hub (#345), Patient Reports (#346), and
Patient Messages (#347). Mirrors the audit shape established by those
four so all five patient-side surfaces share the same role / consent /
demo / audit contract.

Higher regulatory weight than the prior four — device session logs
become clinical records feeding Course Detail telemetry, AE Hub
adverse-event detection, and signed completion reports. Device-record
IDOR leak = HIPAA-grade incident. Every read endpoint applies the
``patient_id == actor.patient.id`` gate at the router layer.

Endpoints
---------
GET    /api/v1/home-devices/devices                 List patient-scoped device registrations
GET    /api/v1/home-devices/devices/summary         Top counts: active / sessions today / 7d / missed-days / faulty
GET    /api/v1/home-devices/devices/{id}            Detail (404 cross-patient)
POST   /api/v1/home-devices/devices                 Register a device (consent active; serial unique per clinic)
PATCH  /api/v1/home-devices/devices/{id}            Update settings (logs revision)
POST   /api/v1/home-devices/devices/{id}/decommission   Note required; immutable thereafter
POST   /api/v1/home-devices/devices/{id}/mark-faulty    Note required; HIGH-priority clinician audit
POST   /api/v1/home-devices/devices/{id}/calibrate      Persist calibration result + notes
POST   /api/v1/home-devices/devices/{id}/sessions       Log a home session (clinician-visible)
GET    /api/v1/home-devices/devices/{id}/sessions/export.csv     DEMO-prefixed when demo
GET    /api/v1/home-devices/devices/{id}/sessions/export.ndjson  DEMO-prefixed when demo
POST   /api/v1/home-devices/audit-events            Page-level audit ingestion (target_type=home_devices)

Role gate
---------
Patient role only on the patient-side endpoints. Clinicians use the
existing clinician-side routes in :mod:`app.routers.home_devices_router`
(``/assignments``, ``/session-logs``, ``/adherence-events``, etc).
Cross-role hits return 404 to avoid hinting that the URL exists outside
patient scope. Cross-patient registration_id lookups also return 404.

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR an active ``ConsentRecord`` row with ``status='withdrawn'``) the
page is read-only post-revocation: existing devices remain visible,
no new devices / sessions / calibrations / decommissions can be
written (HTTP 403). Mirrors the patient_messages_router /
wellness_hub_router pattern.

Demo honesty
------------
``is_demo`` is sourced from :func:`_patient_is_demo_hd` and stamped
sticky on every new registration / calibration. Exports prefix
``DEMO-`` to the filename whenever the patient row is demo, and a
``X-Home-Devices-Demo: 1`` response header is set so reviewers can
see at-a-glance.

Audit hooks
-----------
Every endpoint emits at least one ``home_devices.<event>`` audit row
through the umbrella audit_events table. Surface name: ``home_devices``
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
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    ConsentRecord,
    DeviceSessionLog,
    HomeDeviceAssignment,
    Patient,
    PatientHomeDeviceCalibration,
    PatientHomeDeviceRegistration,
    User,
)


router = APIRouter(prefix="/api/v1/home-devices", tags=["Patient Home Devices"])
_log = logging.getLogger(__name__)


# ── Disclaimers surfaced on every list / summary read ───────────────────────


HOME_DEVICES_DISCLAIMERS = [
    "Home neuromodulation devices are part of your clinical record. "
    "Registering, logging sessions, calibrating, marking faulty, and "
    "decommissioning are all audited so your care team can see what "
    "you have done.",
    "Marking a device faulty raises a high-priority alert to your care "
    "team — please add a note describing the fault.",
    "Decommissioning is a one-way action: the device record becomes "
    "immutable so historical session logs remain trustworthy.",
    "If you withdraw consent, your existing device records remain "
    "readable but you cannot register new devices, log sessions, or "
    "change settings until consent is reinstated.",
]


_VALID_CATEGORIES = frozenset({
    "tdcs", "tacs", "trns", "tens",
    "tms", "rtms", "ctbs",
    "pbm", "nir", "infrared",
    "vagus", "tvns", "nvns",
    "wearable", "biofeedback",
    "other",
})

_VALID_CALIBRATION_RESULTS = frozenset({"passed", "failed", "skipped"})


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Coerce a naive datetime to tz-aware UTC.

    SQLite strips tzinfo on roundtrip — see memory note
    ``deepsynaps-sqlite-tz-naive.md``. All comparisons against
    ``datetime.now(timezone.utc)`` must coerce first.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    aw = _aware(dt)
    return aw.isoformat() if aw is not None else None


def _patient_is_demo_hd(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` for this surface.

    Each launch-audit router carries a small copy so the surface is
    self-contained (avoids a circular import).
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


def _resolve_patient_for_actor_hd(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404 (never 403 / 401) so
    the existence of the patient-scope endpoints is invisible to
    clinicians and admins. Clinicians use the existing clinician-side
    home_devices_router endpoints.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="not_found",
            message="Patient record not found.",
            status_code=404,
        )

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
    return patient


def _resolve_clinic_id_for_patient(db: Session, patient: Patient) -> Optional[str]:
    """Return the clinic_id the patient's clinician belongs to (if any)."""
    try:
        u = db.query(User).filter_by(id=patient.clinician_id).first()
        return getattr(u, "clinic_id", None) if u is not None else None
    except Exception:
        return None


def _consent_active_hd(db: Session, patient: Patient) -> bool:
    """Same consent gate as patient_messages / wellness_hub / symptom_journal."""
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


def _assert_patient_consent_active(db: Session, patient: Patient) -> None:
    if not _consent_active_hd(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Registering devices, logging sessions, calibrating, or "
                "changing settings requires active consent. Existing "
                "device records remain readable until consent is reinstated."
            ),
            status_code=403,
        )


def _home_devices_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "home_devices",
    role_override: Optional[str] = None,
    actor_override: Optional[str] = None,
) -> str:
    """Best-effort audit hook for the ``home_devices`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors the helper in
    patient_messages_router / wellness_hub_router / symptom_journal_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    role = role_override or actor.role
    actor_id = actor_override or actor.actor_id
    event_id = (
        f"home_devices-{event}-{actor_id}-{int(now.timestamp())}"
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
            target_id=str(target_id) or actor_id,
            target_type=target_type,
            action=f"home_devices.{event}",
            role=role,
            actor_id=actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("home_devices self-audit skipped")
    return event_id


def _resolve_registration_or_404(
    db: Session, patient: Patient, registration_id: str
) -> PatientHomeDeviceRegistration:
    """Return the registration row owned by this patient, or 404.

    Cross-patient lookups return 404 even if the row exists in another
    patient's scope — the existence of that row must not be observable.
    """
    reg = (
        db.query(PatientHomeDeviceRegistration)
        .filter(
            PatientHomeDeviceRegistration.id == registration_id,
            PatientHomeDeviceRegistration.patient_id == patient.id,
        )
        .first()
    )
    if reg is None:
        raise ApiServiceError(
            code="not_found",
            message="Device record not found.",
            status_code=404,
        )
    return reg


def _registration_to_dict(
    reg: PatientHomeDeviceRegistration,
) -> dict:
    settings: dict = {}
    try:
        settings = json.loads(reg.settings_json or "{}")
    except Exception:
        settings = {}
    return {
        "id": reg.id,
        "patient_id": reg.patient_id,
        "assignment_id": reg.assignment_id,
        "clinic_id": reg.clinic_id,
        "registered_by_actor_id": reg.registered_by_actor_id,
        "device_name": reg.device_name,
        "device_model": reg.device_model,
        "device_category": reg.device_category,
        "device_serial": reg.device_serial,
        "settings": settings,
        "settings_revision": int(reg.settings_revision or 0),
        "status": reg.status,
        "decommissioned_at": _iso(reg.decommissioned_at),
        "decommission_reason": reg.decommission_reason,
        "marked_faulty_at": _iso(reg.marked_faulty_at),
        "faulty_reason": reg.faulty_reason,
        "last_calibrated_at": _iso(reg.last_calibrated_at),
        "is_demo": bool(reg.is_demo),
        "created_at": _iso(reg.created_at),
        "updated_at": _iso(reg.updated_at),
    }


# ── Schemas ─────────────────────────────────────────────────────────────────


class HomeDeviceOut(BaseModel):
    id: str
    patient_id: str
    assignment_id: Optional[str] = None
    clinic_id: Optional[str] = None
    registered_by_actor_id: str
    device_name: str
    device_model: Optional[str] = None
    device_category: str
    device_serial: Optional[str] = None
    settings: dict = Field(default_factory=dict)
    settings_revision: int = 0
    status: str
    decommissioned_at: Optional[str] = None
    decommission_reason: Optional[str] = None
    marked_faulty_at: Optional[str] = None
    faulty_reason: Optional[str] = None
    last_calibrated_at: Optional[str] = None
    is_demo: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class HomeDeviceListResponse(BaseModel):
    items: list[HomeDeviceOut] = Field(default_factory=list)
    total: int
    consent_active: bool
    is_demo: bool
    disclaimers: list[str] = Field(
        default_factory=lambda: list(HOME_DEVICES_DISCLAIMERS)
    )


class HomeDeviceSummaryResponse(BaseModel):
    total_devices: int = 0
    active: int = 0
    decommissioned: int = 0
    faulty: int = 0
    sessions_today: int = 0
    sessions_7d: int = 0
    missed_days_7d: int = 0
    last_session_at: Optional[str] = None
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(
        default_factory=lambda: list(HOME_DEVICES_DISCLAIMERS)
    )


class HomeDeviceRegisterIn(BaseModel):
    device_name: str = Field(..., min_length=1, max_length=200)
    device_model: Optional[str] = Field(default=None, max_length=200)
    device_category: str = Field(..., min_length=1, max_length=80)
    device_serial: Optional[str] = Field(default=None, max_length=120)
    settings: dict = Field(default_factory=dict)
    assignment_id: Optional[str] = Field(default=None, max_length=64)

    @field_validator("device_category")
    @classmethod
    def _validate_category(cls, v: str) -> str:
        v_lc = (v or "").strip().lower()
        if v_lc not in _VALID_CATEGORIES:
            raise ValueError(
                f"device_category must be one of: {', '.join(sorted(_VALID_CATEGORIES))}"
            )
        return v_lc

    @field_validator("device_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("device_name cannot be blank")
        return v


class HomeDeviceUpdateIn(BaseModel):
    settings: Optional[dict] = None
    device_name: Optional[str] = Field(default=None, max_length=200)
    device_model: Optional[str] = Field(default=None, max_length=200)


class HomeDeviceDecommissionIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("decommission reason cannot be blank")
        return v


class HomeDeviceMarkFaultyIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("faulty reason cannot be blank")
        return v


class HomeDeviceCalibrateIn(BaseModel):
    result: str = Field(default="passed", max_length=30)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("result")
    @classmethod
    def _validate_result(cls, v: str) -> str:
        v_lc = (v or "").strip().lower()
        if v_lc not in _VALID_CALIBRATION_RESULTS:
            raise ValueError(
                f"calibration result must be one of: {', '.join(sorted(_VALID_CALIBRATION_RESULTS))}"
            )
        return v_lc


class HomeDeviceCalibrateOut(BaseModel):
    accepted: bool
    calibration_id: str
    registration_id: str
    result: str
    last_calibrated_at: Optional[str] = None


class HomeDeviceSessionLogIn(BaseModel):
    session_date: str = Field(..., description="YYYY-MM-DD")
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=480)
    completed: bool = True
    actual_intensity: Optional[str] = Field(default=None, max_length=100)
    electrode_placement: Optional[str] = Field(default=None, max_length=200)
    side_effects_during: Optional[str] = Field(default=None, max_length=2000)
    tolerance_rating: Optional[int] = Field(default=None, ge=1, le=5)
    mood_before: Optional[int] = Field(default=None, ge=1, le=5)
    mood_after: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("session_date")
    @classmethod
    def _validate_date(cls, v: str) -> str:
        # Pin to YYYY-MM-DD; no future, max 30-day backdate.
        from datetime import date as _date
        import re as _re
        if not isinstance(v, str) or not _re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("session_date must be YYYY-MM-DD")
        try:
            parsed = _date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("session_date is not a valid calendar date") from exc
        today = datetime.now(timezone.utc).date()
        if parsed > today:
            raise ValueError("session_date cannot be in the future")
        if (today - parsed) > timedelta(days=30):
            raise ValueError(
                "session_date cannot be more than 30 days in the past"
            )
        return v


class HomeDeviceSessionLogOut(BaseModel):
    id: str
    registration_id: str
    patient_id: str
    session_date: str
    logged_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    completed: bool = True
    tolerance_rating: Optional[int] = None
    status: str
    accepted: bool = True


class HomeDeviceActionOut(BaseModel):
    accepted: bool
    device_id: str
    status: str
    updated_at: Optional[str] = None


class HomeDevicesAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    device_id: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class HomeDevicesAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/devices", response_model=HomeDeviceListResponse)
def list_devices(
    status: Optional[str] = Query(default=None, max_length=32),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceListResponse:
    """List the patient's registered home devices (newest first)."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)

    q = db.query(PatientHomeDeviceRegistration).filter(
        PatientHomeDeviceRegistration.patient_id == patient.id
    )
    if status:
        q = q.filter(PatientHomeDeviceRegistration.status == status.strip().lower())
    rows = q.order_by(PatientHomeDeviceRegistration.created_at.desc()).all()

    _home_devices_audit(
        db,
        actor,
        event="view",
        target_id=patient.id,
        note=f"items={len(rows)} status_filter={status or '-'}",
        using_demo_data=is_demo,
    )

    return HomeDeviceListResponse(
        items=[HomeDeviceOut(**_registration_to_dict(r)) for r in rows],
        total=len(rows),
        consent_active=_consent_active_hd(db, patient),
        is_demo=is_demo,
    )


@router.get("/devices/summary", response_model=HomeDeviceSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceSummaryResponse:
    """Top counts: active / decommissioned / faulty + 7-day session metrics."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)

    rows = (
        db.query(PatientHomeDeviceRegistration)
        .filter(PatientHomeDeviceRegistration.patient_id == patient.id)
        .all()
    )
    active = sum(1 for r in rows if r.status == "active")
    decommissioned = sum(1 for r in rows if r.status == "decommissioned")
    faulty = sum(1 for r in rows if r.status == "faulty")

    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()
    week_cutoff = now - timedelta(days=7)

    sessions_q = db.query(DeviceSessionLog).filter(
        DeviceSessionLog.patient_id == patient.id
    )
    sessions_today = sessions_q.filter(
        DeviceSessionLog.session_date == today_str
    ).count()
    recent_logs = sessions_q.filter(
        DeviceSessionLog.logged_at >= week_cutoff
    ).all()
    sessions_7d = len(recent_logs)
    days_with_session = {
        (r.session_date or "")[:10] for r in recent_logs if r.session_date
    }
    missed_days_7d = max(0, 7 - len(days_with_session))

    last = (
        sessions_q.order_by(DeviceSessionLog.logged_at.desc())
        .first()
    )
    last_session_at = _iso(last.logged_at) if last is not None else None

    _home_devices_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"devices={len(rows)} active={active} faulty={faulty} "
            f"sessions_today={sessions_today} sessions_7d={sessions_7d}"
        ),
        using_demo_data=is_demo,
    )

    return HomeDeviceSummaryResponse(
        total_devices=len(rows),
        active=active,
        decommissioned=decommissioned,
        faulty=faulty,
        sessions_today=sessions_today,
        sessions_7d=sessions_7d,
        missed_days_7d=missed_days_7d,
        last_session_at=last_session_at,
        consent_active=_consent_active_hd(db, patient),
        is_demo=is_demo,
    )


@router.get("/devices/{registration_id}", response_model=HomeDeviceOut)
def get_device(
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceOut:
    """Return one device the patient owns. 404 cross-patient."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    _home_devices_audit(
        db,
        actor,
        event="device_viewed",
        target_id=reg.id,
        note=f"status={reg.status}",
        using_demo_data=is_demo,
    )
    return HomeDeviceOut(**_registration_to_dict(reg))


@router.post(
    "/devices",
    response_model=HomeDeviceOut,
    status_code=201,
)
def register_device(
    body: HomeDeviceRegisterIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceOut:
    """Register a new home device. Serial unique within the clinic."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)

    clinic_id = _resolve_clinic_id_for_patient(db, patient)

    # Serial uniqueness: within the same clinic, the same serial cannot
    # be registered twice. Across clinics is allowed (legitimate
    # cross-clinic transfers).
    serial = (body.device_serial or "").strip() or None
    if serial:
        existing = (
            db.query(PatientHomeDeviceRegistration)
            .filter(
                PatientHomeDeviceRegistration.clinic_id == clinic_id,
                PatientHomeDeviceRegistration.device_serial == serial,
            )
            .first()
        )
        if existing is not None:
            raise ApiServiceError(
                code="serial_conflict",
                message=(
                    "A device with this serial number is already "
                    "registered in this clinic."
                ),
                status_code=409,
            )

    # Optional assignment link — must belong to the same patient.
    if body.assignment_id:
        a = (
            db.query(HomeDeviceAssignment)
            .filter(
                HomeDeviceAssignment.id == body.assignment_id,
                HomeDeviceAssignment.patient_id == patient.id,
            )
            .first()
        )
        if a is None:
            raise ApiServiceError(
                code="assignment_not_found",
                message="No clinician assignment found for this patient.",
                status_code=404,
            )

    now = datetime.now(timezone.utc)
    reg = PatientHomeDeviceRegistration(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        assignment_id=body.assignment_id,
        clinic_id=clinic_id,
        registered_by_actor_id=actor.actor_id,
        device_name=body.device_name,
        device_model=(body.device_model or None),
        device_category=body.device_category,
        device_serial=serial,
        settings_json=json.dumps(body.settings or {}),
        settings_revision=0,
        status="active",
        is_demo=bool(is_demo),
        created_at=now,
        updated_at=now,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)

    _home_devices_audit(
        db,
        actor,
        event="device_registered",
        target_id=reg.id,
        note=(
            f"category={reg.device_category}; serial={'yes' if serial else 'no'}; "
            f"assignment={reg.assignment_id or '-'}"
        ),
        using_demo_data=is_demo,
    )
    return HomeDeviceOut(**_registration_to_dict(reg))


@router.patch("/devices/{registration_id}", response_model=HomeDeviceOut)
def update_device(
    body: HomeDeviceUpdateIn,
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceOut:
    """Update settings / display name. Decommissioned rows are immutable."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    if reg.status == "decommissioned":
        raise ApiServiceError(
            code="immutable",
            message=(
                "Decommissioned devices are immutable. Register a new "
                "device if your hardware has changed."
            ),
            status_code=409,
        )

    settings_changed = False
    if body.settings is not None:
        reg.settings_json = json.dumps(body.settings)
        reg.settings_revision = int(reg.settings_revision or 0) + 1
        settings_changed = True
    if body.device_name is not None:
        new_name = body.device_name.strip()
        if not new_name:
            raise ApiServiceError(
                code="invalid",
                message="device_name cannot be blank.",
                status_code=422,
            )
        reg.device_name = new_name[:200]
    if body.device_model is not None:
        reg.device_model = (body.device_model.strip()[:200]) or None
    reg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reg)

    if settings_changed:
        _home_devices_audit(
            db,
            actor,
            event="settings_changed",
            target_id=reg.id,
            note=f"revision={reg.settings_revision}",
            using_demo_data=is_demo,
        )
    else:
        _home_devices_audit(
            db,
            actor,
            event="device_updated",
            target_id=reg.id,
            note="metadata only",
            using_demo_data=is_demo,
        )
    return HomeDeviceOut(**_registration_to_dict(reg))


@router.post(
    "/devices/{registration_id}/decommission",
    response_model=HomeDeviceActionOut,
)
def decommission_device(
    body: HomeDeviceDecommissionIn,
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceActionOut:
    """One-way decommission. Note required; immutable thereafter."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    if reg.status == "decommissioned":
        raise ApiServiceError(
            code="already_decommissioned",
            message="This device is already decommissioned.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    reg.status = "decommissioned"
    reg.decommissioned_at = now
    reg.decommission_reason = body.reason[:500]
    reg.updated_at = now
    db.commit()
    db.refresh(reg)

    _home_devices_audit(
        db,
        actor,
        event="device_decommissioned",
        target_id=reg.id,
        note=f"reason={body.reason[:200]}",
        using_demo_data=is_demo,
    )
    return HomeDeviceActionOut(
        accepted=True,
        device_id=reg.id,
        status=reg.status,
        updated_at=_iso(reg.updated_at),
    )


@router.post(
    "/devices/{registration_id}/mark-faulty",
    response_model=HomeDeviceActionOut,
)
def mark_device_faulty(
    body: HomeDeviceMarkFaultyIn,
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceActionOut:
    """Mark a device faulty. Note required; HIGH-priority clinician audit."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    if reg.status == "decommissioned":
        raise ApiServiceError(
            code="immutable",
            message=(
                "Decommissioned devices cannot be re-marked faulty. "
                "Register a replacement device instead."
            ),
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    reg.status = "faulty"
    reg.marked_faulty_at = now
    reg.faulty_reason = body.reason[:500]
    reg.updated_at = now
    db.commit()
    db.refresh(reg)

    # Patient-side row.
    _home_devices_audit(
        db,
        actor,
        event="device_marked_faulty",
        target_id=reg.id,
        note=f"priority=high; reason={body.reason[:200]}",
        using_demo_data=is_demo,
    )
    # Clinician-visible mirror at HIGH priority. Routed to the
    # patient's clinician actor so the care-team feed shows the fault
    # without exposing PHI.
    clinician_actor = patient.clinician_id or "actor-clinician-demo"
    _home_devices_audit(
        db,
        actor,
        event="device_faulty_to_clinician",
        target_id=clinician_actor,
        note=(
            f"priority=high; device={reg.id}; category={reg.device_category}; "
            f"reason={body.reason[:200]}"
        ),
        using_demo_data=is_demo,
        role_override="clinician",
        actor_override=clinician_actor,
    )

    return HomeDeviceActionOut(
        accepted=True,
        device_id=reg.id,
        status=reg.status,
        updated_at=_iso(reg.updated_at),
    )


@router.post(
    "/devices/{registration_id}/calibrate",
    response_model=HomeDeviceCalibrateOut,
    status_code=201,
)
def calibrate_device(
    body: HomeDeviceCalibrateIn,
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceCalibrateOut:
    """Persist a calibration result and bump ``last_calibrated_at``."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    if reg.status == "decommissioned":
        raise ApiServiceError(
            code="immutable",
            message="Decommissioned devices cannot be calibrated.",
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    cal = PatientHomeDeviceCalibration(
        id=str(uuid.uuid4()),
        registration_id=reg.id,
        patient_id=patient.id,
        performed_by_actor_id=actor.actor_id,
        result=body.result,
        notes=(body.notes or None),
        is_demo=bool(is_demo),
        created_at=now,
    )
    db.add(cal)
    reg.last_calibrated_at = now
    reg.updated_at = now
    db.commit()
    db.refresh(reg)
    db.refresh(cal)

    _home_devices_audit(
        db,
        actor,
        event="calibration_run",
        target_id=reg.id,
        note=f"result={body.result}; calibration_id={cal.id}",
        using_demo_data=is_demo,
    )

    return HomeDeviceCalibrateOut(
        accepted=True,
        calibration_id=cal.id,
        registration_id=reg.id,
        result=cal.result,
        last_calibrated_at=_iso(reg.last_calibrated_at),
    )


@router.post(
    "/devices/{registration_id}/sessions",
    response_model=HomeDeviceSessionLogOut,
    status_code=201,
)
def log_session(
    body: HomeDeviceSessionLogIn,
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDeviceSessionLogOut:
    """Log a home neuromodulation session against a registered device.

    Validates that the device is active (not decommissioned, not faulty)
    before persisting the row. The session is written into the existing
    ``device_session_logs`` table so it surfaces in clinician review
    queues alongside assignment-driven sessions.
    """
    patient = _resolve_patient_for_actor_hd(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    if reg.status == "decommissioned":
        raise ApiServiceError(
            code="immutable",
            message=(
                "This device is decommissioned. Register a replacement "
                "before logging new sessions."
            ),
            status_code=409,
        )
    if reg.status == "faulty":
        raise ApiServiceError(
            code="device_faulty",
            message=(
                "This device is marked faulty. Resolve with your care "
                "team before logging another session."
            ),
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    log = DeviceSessionLog(
        id=str(uuid.uuid4()),
        # When a clinician assignment_id is linked, scope sessions to it
        # so the existing adherence summary picks them up. Otherwise
        # use the registration_id as a stand-in so the row is still
        # patient-scoped and never orphaned.
        assignment_id=(reg.assignment_id or reg.id),
        patient_id=patient.id,
        course_id=None,
        session_date=body.session_date,
        logged_at=now,
        duration_minutes=body.duration_minutes,
        completed=bool(body.completed),
        actual_intensity=body.actual_intensity,
        electrode_placement=body.electrode_placement,
        side_effects_during=body.side_effects_during,
        tolerance_rating=body.tolerance_rating,
        mood_before=body.mood_before,
        mood_after=body.mood_after,
        notes=body.notes,
        status="pending_review",
        created_at=now,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    _home_devices_audit(
        db,
        actor,
        event="session_logged",
        target_id=reg.id,
        note=(
            f"session_id={log.id}; date={body.session_date}; "
            f"duration={body.duration_minutes or '-'}; "
            f"completed={1 if body.completed else 0}; "
            f"tolerance={body.tolerance_rating or '-'}"
        ),
        using_demo_data=is_demo,
    )

    return HomeDeviceSessionLogOut(
        id=log.id,
        registration_id=reg.id,
        patient_id=patient.id,
        session_date=body.session_date,
        logged_at=_iso(log.logged_at),
        duration_minutes=log.duration_minutes,
        completed=bool(log.completed),
        tolerance_rating=log.tolerance_rating,
        status=log.status,
        accepted=True,
    )


@router.get("/devices/{registration_id}/sessions/export.csv")
def export_sessions_csv(
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of every session logged against this device.

    Filename is ``DEMO-`` prefixed when the patient row is demo, and
    the response carries ``X-Home-Devices-Demo: 1`` so reviewers see
    the badge without parsing the body.
    """
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    rows = (
        db.query(DeviceSessionLog)
        .filter(
            DeviceSessionLog.patient_id == patient.id,
            DeviceSessionLog.assignment_id == (reg.assignment_id or reg.id),
        )
        .order_by(DeviceSessionLog.session_date.desc())
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "session_id", "registration_id", "session_date", "logged_at",
        "duration_minutes", "completed", "actual_intensity",
        "electrode_placement", "tolerance_rating", "mood_before",
        "mood_after", "side_effects_during", "status",
    ])
    for r in rows:
        writer.writerow([
            r.id, reg.id, r.session_date, _iso(r.logged_at) or "",
            r.duration_minutes if r.duration_minutes is not None else "",
            "1" if r.completed else "0",
            r.actual_intensity or "",
            r.electrode_placement or "",
            r.tolerance_rating if r.tolerance_rating is not None else "",
            r.mood_before if r.mood_before is not None else "",
            r.mood_after if r.mood_after is not None else "",
            (r.side_effects_during or "").replace("\n", " "),
            r.status or "",
        ])

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}home-device-{reg.id}-sessions.csv"

    _home_devices_audit(
        db,
        actor,
        event="export",
        target_id=reg.id,
        note=f"format=csv; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Home-Devices-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/devices/{registration_id}/sessions/export.ndjson")
def export_sessions_ndjson(
    registration_id: str = Path(..., min_length=1, max_length=64),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one session per line."""
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)
    reg = _resolve_registration_or_404(db, patient, registration_id)

    rows = (
        db.query(DeviceSessionLog)
        .filter(
            DeviceSessionLog.patient_id == patient.id,
            DeviceSessionLog.assignment_id == (reg.assignment_id or reg.id),
        )
        .order_by(DeviceSessionLog.session_date.desc())
        .all()
    )

    lines: list[str] = []
    for r in rows:
        lines.append(json.dumps({
            "session_id": r.id,
            "registration_id": reg.id,
            "patient_id": patient.id,
            "session_date": r.session_date,
            "logged_at": _iso(r.logged_at),
            "duration_minutes": r.duration_minutes,
            "completed": bool(r.completed),
            "actual_intensity": r.actual_intensity,
            "electrode_placement": r.electrode_placement,
            "tolerance_rating": r.tolerance_rating,
            "mood_before": r.mood_before,
            "mood_after": r.mood_after,
            "side_effects_during": r.side_effects_during,
            "status": r.status,
            "is_demo": bool(is_demo),
        }))

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}home-device-{reg.id}-sessions.ndjson"

    _home_devices_audit(
        db,
        actor,
        event="export",
        target_id=reg.id,
        note=f"format=ndjson; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Home-Devices-Demo": "1" if is_demo else "0",
        },
    )


@router.post("/audit-events", response_model=HomeDevicesAuditEventOut)
def post_home_devices_audit_event(
    body: HomeDevicesAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HomeDevicesAuditEventOut:
    """Page-level audit ingestion for the patient Home Devices UI.

    Surface: ``home_devices``. Common events: ``view`` (mount),
    ``filter_changed``, ``device_viewed``, ``device_registered``,
    ``settings_changed``, ``calibration_run``, ``session_logged``,
    ``device_marked_faulty``, ``device_decommissioned``, ``export``,
    ``deep_link_followed``, ``demo_banner_shown``,
    ``consent_banner_shown``.

    Patient role only — clinicians cannot emit ``home_devices`` audit
    rows directly. Cross-patient ingestion is blocked because
    ``device_id`` (when supplied) is verified to belong to the actor's
    patient.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_role_required",
            message=(
                "Home Devices audit ingestion is restricted to the "
                "patient role."
            ),
            status_code=403,
        )
    patient = _resolve_patient_for_actor_hd(db, actor)
    is_demo = _patient_is_demo_hd(db, patient)

    target_id: str = patient.id
    if body.device_id:
        # Verify the device belongs to this patient before letting the
        # event record name it as the target. We allow the device to
        # not yet exist (e.g. an audit event posted on the way to
        # registering the device) — but if a device_id is supplied AND
        # exists somewhere, it must belong to this patient.
        any_dev = (
            db.query(PatientHomeDeviceRegistration)
            .filter(PatientHomeDeviceRegistration.id == body.device_id)
            .first()
        )
        if any_dev is not None and any_dev.patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Device record not found.",
                status_code=404,
            )
        target_id = body.device_id

    note_parts: list[str] = []
    if body.device_id:
        note_parts.append(f"device={body.device_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _home_devices_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data) or is_demo,
    )
    return HomeDevicesAuditEventOut(accepted=True, event_id=event_id)

"""Patient Wearables launch-audit (2026-05-01).

EIGHTH and final patient-facing launch-audit surface in the chain after
Symptom Journal (#344), Wellness Hub (#345), Patient Reports (#346),
Patient Messages (#347), Home Devices (#348), Adherence Events (#350)
and Home Program Tasks (#351). Closes the patient-side data-coverage
story.

Wearable data already feeds Course Detail telemetry, AE Hub detection,
and Outcome Series, but the patient-facing surface lacked the audit
chain, consent-revoked write gate, IDOR regression, and DEMO honesty
that every other patient surface now enforces.

Endpoints
---------
GET    /api/v1/patient-wearables/devices                              List patient-scoped devices
GET    /api/v1/patient-wearables/devices/summary                      Top counts: connected / synced_today / synced_7d / pending_anomalies
GET    /api/v1/patient-wearables/devices/{id}                         Device detail (404 cross-patient)
GET    /api/v1/patient-wearables/devices/{id}/observations            Observation series (filters)
POST   /api/v1/patient-wearables/devices/{id}/sync                    Manual sync trigger; emits audit; clinician-visible if anomaly
POST   /api/v1/patient-wearables/devices/{id}/disconnect              Disconnect (note required); revokes future ingest for the device
GET    /api/v1/patient-wearables/devices/{id}/observations/export.csv DEMO prefix; only own
GET    /api/v1/patient-wearables/devices/{id}/observations/export.ndjson  DEMO prefix; only own
POST   /api/v1/patient-wearables/audit-events                         Page audit (target_type=wearables)

Role gate
---------
Patient role only. Clinicians use the existing clinician-side
``wearable_router``. Cross-role hits return 404 (never 403/401) so the
patient-scope URL existence is invisible to clinicians and admins.
Cross-patient device lookups also return 404.

Consent gate
------------
Once a patient has revoked consent (``Patient.consent_signed = False``
OR a ``ConsentRecord`` row with ``status='withdrawn'``) the page is
read-only post-revocation: existing observations remain visible, but
no new sync triggers / disconnects can be written (HTTP 403). Mirrors
adherence_events / patient_messages / wellness_hub / home_devices /
home_program_tasks pattern.

Demo honesty
------------
``is_demo`` is sourced from :func:`_patient_is_demo_pw`. Exports prefix
``DEMO-`` to the filename whenever the patient row is demo and a
``X-PatientWearables-Demo: 1`` response header is set.

Anomaly escalation
------------------
A manual sync that detects a HR > 180, HR < 30, or SpO2 < 88 sample on
a freshly-ingested observation creates a HIGH-priority clinician-
visible mirror audit row plus an :class:`AdverseEvent` draft in
``status='reported'`` so the regulatory chain stays intact end-to-end.
This mirrors the Adherence Events #350 escalation pattern.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AdverseEvent,
    ConsentRecord,
    DeviceConnection,
    Patient,
    User,
    WearableAlertFlag,
    WearableDailySummary,
    WearableObservation,
)


router = APIRouter(
    prefix="/api/v1/patient-wearables",
    tags=["Patient Wearables"],
)
_log = logging.getLogger(__name__)


# Honest disclaimers always rendered on the page so reviewers know the
# regulatory weight of the wearable surface.
WEARABLE_DISCLAIMERS = [
    "Wearable data is consumer-grade; values shown are informational and "
    "not clinical-grade unless your care team explicitly confirms it.",
    "Connecting a device or triggering a sync creates an audit row your "
    "care team can review.",
    "Disconnecting a device immediately revokes future ingestion for that "
    "device. Existing observations remain on your record until your care "
    "team archives them.",
    "Anomalous samples (HR > 180, HR < 30, SpO2 < 88) trigger a high-"
    "priority alert to your clinician and may create an Adverse Event "
    "Hub draft for review.",
    "If you withdraw consent, your existing observations remain readable "
    "but no new syncs can be triggered until consent is reinstated.",
]


# Valid wearable sources accepted by the patient-portal connect endpoint.
# Mirror of patient_portal_router._VALID_SOURCES so the two views stay in
# lockstep — adding a source here without adding it to the connect helper
# would create a wearable detail row the patient cannot connect.
_VALID_SOURCES = frozenset({
    "apple_health",
    "android_health",
    "fitbit",
    "oura",
    "garmin_connect",
})


# Anomaly thresholds used by the manual-sync escalation path.
#
# These are deliberately conservative numbers from published consumer-
# wearable safety guidance (Apple Health, Fitbit, Oura). They are NOT a
# clinical-grade arrhythmia detector — see WEARABLE_DISCLAIMERS for the
# patient-facing copy. A single sample crossing the threshold is enough
# to flag because consumer wearables down-sample heavily; multi-sample
# verification belongs in the clinician-side wearable_flags service.
_HR_HIGH_THRESHOLD = 180.0
_HR_LOW_THRESHOLD = 30.0
_SPO2_LOW_THRESHOLD = 88.0


# ── Helpers ─────────────────────────────────────────────────────────────────


_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_PATIENT_EMAILS = {"patient@deepsynaps.com", "patient@demo.com"}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,96}$")


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


def _patient_is_demo_pw(db: Session, patient: Patient | None) -> bool:
    """Mirrors :func:`patients_router._patient_is_demo` for this surface."""
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


def _resolve_patient_for_actor_pw(
    db: Session, actor: AuthenticatedActor
) -> Patient:
    """Return the Patient row the actor is allowed to act on.

    Patient role only. Cross-role hits return 404 (never 403/401) so the
    patient-scope URL existence is invisible to clinicians and admins.
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


def _consent_active_pw(db: Session, patient: Patient) -> bool:
    """Same consent gate as adherence_events / patient_messages / wellness_hub."""
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
    if not _consent_active_pw(db, patient):
        raise ApiServiceError(
            code="consent_inactive",
            message=(
                "Triggering a sync or disconnecting a wearable requires "
                "active consent. Existing observations remain readable "
                "until consent is reinstated."
            ),
            status_code=403,
        )


def _wearables_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str = "",
    using_demo_data: bool = False,
    target_type: str = "wearables",
    role_override: Optional[str] = None,
    actor_override: Optional[str] = None,
) -> str:
    """Best-effort audit hook for the ``wearables`` surface.

    Never raises — audit must not block the UI even when the umbrella
    audit table is unreachable. Mirrors helpers in
    adherence_events_router / patient_home_program_tasks_router /
    home_devices_patient_router / patient_messages_router /
    wellness_hub_router.
    """
    from app.repositories.audit import create_audit_event  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    role = role_override or actor.role
    actor_id = actor_override or actor.actor_id
    event_id = (
        f"wearables-{event}-{actor_id}-{int(now.timestamp())}"
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
            action=f"wearables.{event}",
            role=role,
            actor_id=actor_id,
            note=final_note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.exception("wearables self-audit skipped")
    return event_id


def _validate_device_id(device_id: str) -> None:
    if not _DEVICE_ID_RE.match(device_id or ""):
        raise ApiServiceError(
            code="not_found",
            message="Wearable device not found.",
            status_code=404,
        )


def _resolve_device_or_404(
    db: Session, patient: Patient, device_id: str
) -> DeviceConnection:
    """Return the wearable connection owned by this patient, or 404.

    Cross-patient lookups return 404 even if the row exists — the
    existence of that row must not be observable.
    """
    _validate_device_id(device_id)
    row = (
        db.query(DeviceConnection)
        .filter(DeviceConnection.id == device_id)
        .first()
    )
    if row is None or row.patient_id != patient.id:
        raise ApiServiceError(
            code="not_found",
            message="Wearable device not found.",
            status_code=404,
        )
    return row


def _patient_safe_device_view(
    row: DeviceConnection,
    *,
    last_obs: Optional[WearableObservation] = None,
    pending_anomalies: int = 0,
) -> dict:
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "source": row.source,
        "source_type": row.source_type,
        "display_name": row.display_name or row.source.replace("_", " ").title(),
        "status": row.status,
        "consent_given": bool(row.consent_given),
        "connected_at": _iso(row.connected_at),
        "last_sync_at": _iso(row.last_sync_at),
        "last_observed_at": _iso(last_obs.observed_at) if last_obs else None,
        "last_observation_metric": last_obs.metric_type if last_obs else None,
        "pending_anomalies": int(pending_anomalies),
    }


def _list_devices_for_patient(
    db: Session, patient: Patient
) -> list[DeviceConnection]:
    return (
        db.query(DeviceConnection)
        .filter(DeviceConnection.patient_id == patient.id)
        .order_by(DeviceConnection.created_at.desc())
        .limit(100)
        .all()
    )


def _last_observation_for_device(
    db: Session, patient_id: str, device: DeviceConnection
) -> Optional[WearableObservation]:
    return (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == patient_id,
            WearableObservation.connection_id == device.id,
        )
        .order_by(WearableObservation.observed_at.desc())
        .first()
    )


def _pending_anomaly_count(db: Session, patient_id: str) -> int:
    """Count of undismissed wearable_alert_flags for the patient.

    Anomaly flags are written by ``app.services.wearable_flags`` AND by
    the manual-sync escalation path below. The patient view treats both
    sources uniformly.
    """
    return (
        db.query(WearableAlertFlag)
        .filter(
            WearableAlertFlag.patient_id == patient_id,
            WearableAlertFlag.dismissed.is_(False),
        )
        .count()
    )


def _flag_anomaly(
    db: Session,
    patient: Patient,
    device: DeviceConnection,
    metric: str,
    value: float,
    *,
    severity: str = "urgent",
) -> tuple[Optional[str], Optional[str]]:
    """Create a WearableAlertFlag + AE Hub draft for a manual-sync anomaly.

    Returns ``(flag_id, ae_id)`` so the caller can include them in the
    audit row.
    """
    now = datetime.now(timezone.utc)
    flag = WearableAlertFlag(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        course_id=None,
        flag_type=f"manual_sync_{metric}_anomaly",
        severity=severity,
        detail=(
            f"Manual sync detected {metric} value {value:.1f} on device "
            f"{device.source} (id={device.id})."
        ),
        metric_snapshot=json.dumps({"metric": metric, "value": value}),
        triggered_at=now,
        dismissed=False,
        auto_generated=True,
    )
    db.add(flag)

    ae_id: Optional[str] = None
    if severity == "urgent":
        ae = AdverseEvent(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            course_id=None,
            session_id=None,
            clinician_id=patient.clinician_id or "actor-clinician-demo",
            event_type="wearable_anomaly",
            severity="severe" if metric in {"hr_high", "hr_low"} else "moderate",
            description=(
                f"Wearable manual-sync anomaly: metric={metric} "
                f"value={value:.1f} device={device.source} "
                f"connection_id={device.id}. Patient-initiated sync; "
                f"please review observation series."
            ),
            onset_timing=None,
            resolution=None,
            action_taken=None,
            reported_at=now,
            resolved_at=None,
            created_at=now,
            body_system=None,
            expectedness="unknown",
            expectedness_source=None,
            is_serious=metric in {"hr_high", "hr_low"},
            sae_criteria=None,
            reportable=False,
            relatedness="unknown",
            is_demo=bool(_patient_is_demo_pw(db, patient)),
        )
        db.add(ae)
        ae_id = ae.id
    db.commit()
    return flag.id, ae_id


# ── Schemas ─────────────────────────────────────────────────────────────────


class WearableDeviceOut(BaseModel):
    id: str
    patient_id: str
    source: str
    source_type: str
    display_name: str
    status: str
    consent_given: bool
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    last_observed_at: Optional[str] = None
    last_observation_metric: Optional[str] = None
    pending_anomalies: int = 0


class WearableDeviceListResponse(BaseModel):
    items: list[WearableDeviceOut] = Field(default_factory=list)
    total: int = 0
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WEARABLE_DISCLAIMERS))


class WearableSummaryResponse(BaseModel):
    connected: int = 0
    synced_today: int = 0
    synced_7d: int = 0
    pending_anomalies: int = 0
    last_sync_at: Optional[str] = None
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WEARABLE_DISCLAIMERS))


class WearableObservationOut(BaseModel):
    id: str
    metric_type: str
    value: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    observed_at: str
    quality_flag: Optional[str] = None
    aggregation_window: Optional[str] = None


class WearableObservationListResponse(BaseModel):
    items: list[WearableObservationOut] = Field(default_factory=list)
    total: int = 0
    device_id: str
    consent_active: bool = True
    is_demo: bool = False
    disclaimers: list[str] = Field(default_factory=lambda: list(WEARABLE_DISCLAIMERS))


class WearableSyncIn(BaseModel):
    """Payload submitted with a manual sync trigger.

    The wearable bridges (Apple Health, Fitbit, Oura, etc.) push real
    observations through the existing
    ``/api/v1/patient-portal/wearable-sync`` endpoint. The ``sync``
    endpoint here is the *patient-initiated trigger* — it lets the
    patient ask the bridge to refresh, and optionally inject the latest
    sample they observed in their own native app so the anomaly detector
    has something to look at.
    """

    rhr_bpm: Optional[float] = Field(default=None, ge=10, le=300)
    spo2_pct: Optional[float] = Field(default=None, ge=50, le=100)
    note: Optional[str] = Field(default=None, max_length=500)


class WearableSyncOut(BaseModel):
    accepted: bool
    device_id: str
    last_sync_at: str
    anomaly_flag_id: Optional[str] = None
    adverse_event_id: Optional[str] = None
    pending_anomalies: int = 0


class WearableDisconnectIn(BaseModel):
    note: str = Field(..., min_length=1, max_length=500)

    @field_validator("note")
    @classmethod
    def _strip_note(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("disconnect note cannot be blank")
        return v


class WearableDisconnectOut(BaseModel):
    accepted: bool
    device_id: str
    status: str
    disconnected_at: str


class WearablesAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    device_id: Optional[str] = Field(default=None, max_length=96)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: Optional[bool] = False


class WearablesAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/devices", response_model=WearableDeviceListResponse)
def list_devices(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableDeviceListResponse:
    """List the patient's connected wearables (read-only)."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    rows = _list_devices_for_patient(db, patient)
    pending = _pending_anomaly_count(db, patient.id)

    items: list[WearableDeviceOut] = []
    for row in rows:
        last_obs = _last_observation_for_device(db, patient.id, row)
        # Per-device pending count is the same as the patient-level
        # pending_anomalies: alert flags don't carry connection_id today,
        # so we don't fabricate a per-device split. Showing the same
        # number on every card is honest — it's the patient-level
        # banner re-surfaced.
        items.append(
            WearableDeviceOut(
                **_patient_safe_device_view(
                    row, last_obs=last_obs, pending_anomalies=pending
                )
            )
        )

    _wearables_audit(
        db,
        actor,
        event="devices_viewed",
        target_id=patient.id,
        note=f"items={len(items)} pending_anomalies={pending}",
        using_demo_data=is_demo,
    )

    return WearableDeviceListResponse(
        items=items,
        total=len(items),
        consent_active=_consent_active_pw(db, patient),
        is_demo=is_demo,
    )


@router.get("/devices/summary", response_model=WearableSummaryResponse)
def get_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableSummaryResponse:
    """Top counts: connected / synced_today / synced_7d / pending_anomalies."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    rows = _list_devices_for_patient(db, patient)

    now = datetime.now(timezone.utc)
    today = now.date()
    week_cutoff = now - timedelta(days=7)

    connected = 0
    synced_today = 0
    synced_7d = 0
    last_sync: Optional[datetime] = None
    for row in rows:
        if row.status == "connected":
            connected += 1
        last_sync_at = _aware(row.last_sync_at)
        if last_sync_at is not None:
            if last_sync_at.date() == today:
                synced_today += 1
            if last_sync_at >= week_cutoff:
                synced_7d += 1
            if last_sync is None or last_sync_at > last_sync:
                last_sync = last_sync_at

    pending_anomalies = _pending_anomaly_count(db, patient.id)

    _wearables_audit(
        db,
        actor,
        event="summary_viewed",
        target_id=patient.id,
        note=(
            f"connected={connected} synced_today={synced_today} "
            f"synced_7d={synced_7d} pending_anomalies={pending_anomalies}"
        ),
        using_demo_data=is_demo,
    )

    return WearableSummaryResponse(
        connected=connected,
        synced_today=synced_today,
        synced_7d=synced_7d,
        pending_anomalies=pending_anomalies,
        last_sync_at=_iso(last_sync),
        consent_active=_consent_active_pw(db, patient),
        is_demo=is_demo,
    )


@router.post("/audit-events", response_model=WearablesAuditEventOut)
def post_wearables_audit_event(
    body: WearablesAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearablesAuditEventOut:
    """Page-level audit ingestion for the patient Wearables UI.

    Surface: ``wearables``. Common events: ``view`` (mount),
    ``filter_changed``, ``device_viewed``, ``wearable_connected``,
    ``wearable_disconnected``, ``sync_triggered``,
    ``observation_anomaly_flagged``, ``export``,
    ``deep_link_followed``, ``demo_banner_shown``,
    ``consent_banner_shown``.

    Patient role only — clinicians cannot emit ``wearables`` audit rows
    directly. Cross-patient ingestion is blocked because ``device_id``
    (when supplied) is verified to belong to the actor's patient.
    """
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_role_required",
            message=(
                "Patient Wearables audit ingestion is restricted to the "
                "patient role."
            ),
            status_code=403,
        )
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)

    target_id: str = patient.id
    if body.device_id:
        any_row = (
            db.query(DeviceConnection)
            .filter(DeviceConnection.id == body.device_id)
            .first()
        )
        if any_row is not None and any_row.patient_id != patient.id:
            raise ApiServiceError(
                code="not_found",
                message="Wearable device not found.",
                status_code=404,
            )
        target_id = body.device_id

    note_parts: list[str] = []
    if body.device_id:
        note_parts.append(f"device={body.device_id}")
    if body.note:
        note_parts.append(body.note[:480])
    note = "; ".join(note_parts) or body.event

    event_id = _wearables_audit(
        db,
        actor,
        event=body.event,
        target_id=target_id,
        note=note,
        using_demo_data=bool(body.using_demo_data) or is_demo,
    )
    return WearablesAuditEventOut(accepted=True, event_id=event_id)


@router.get("/devices/{device_id}", response_model=WearableDeviceOut)
def get_device(
    device_id: str = Path(..., min_length=1, max_length=96),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableDeviceOut:
    """Return one device the patient owns. 404 cross-patient."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    row = _resolve_device_or_404(db, patient, device_id)
    last_obs = _last_observation_for_device(db, patient.id, row)
    pending = _pending_anomaly_count(db, patient.id)

    _wearables_audit(
        db,
        actor,
        event="device_viewed",
        target_id=row.id,
        note=f"source={row.source}",
        using_demo_data=is_demo,
    )

    return WearableDeviceOut(
        **_patient_safe_device_view(
            row, last_obs=last_obs, pending_anomalies=pending
        )
    )


@router.get(
    "/devices/{device_id}/observations",
    response_model=WearableObservationListResponse,
)
def list_observations(
    device_id: str = Path(..., min_length=1, max_length=96),
    metric: Optional[str] = Query(default=None, max_length=64),
    since: Optional[str] = Query(default=None, max_length=10),
    limit: int = Query(default=200, ge=1, le=1000),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableObservationListResponse:
    """Observation series for the given device (newest first)."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    row = _resolve_device_or_404(db, patient, device_id)

    q = (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == patient.id,
            WearableObservation.connection_id == row.id,
        )
    )
    if metric:
        q = q.filter(WearableObservation.metric_type == metric)
    if since and _DATE_RE.match(since):
        try:
            since_dt = datetime.fromisoformat(f"{since}T00:00:00+00:00")
            q = q.filter(WearableObservation.observed_at >= since_dt)
        except ValueError:
            pass
    q = q.order_by(WearableObservation.observed_at.desc()).limit(limit)

    rows = q.all()
    items: list[WearableObservationOut] = []
    for r in rows:
        items.append(
            WearableObservationOut(
                id=r.id,
                metric_type=r.metric_type,
                value=r.value,
                value_text=r.value_text,
                unit=r.unit,
                observed_at=_iso(r.observed_at) or "",
                quality_flag=r.quality_flag,
                aggregation_window=r.aggregation_window,
            )
        )

    _wearables_audit(
        db,
        actor,
        event="observations_viewed",
        target_id=row.id,
        note=f"items={len(items)} metric={metric or '-'} since={since or '-'}",
        using_demo_data=is_demo,
    )

    return WearableObservationListResponse(
        items=items,
        total=len(items),
        device_id=row.id,
        consent_active=_consent_active_pw(db, patient),
        is_demo=is_demo,
    )


@router.post("/devices/{device_id}/sync", response_model=WearableSyncOut)
def sync_device(
    body: WearableSyncIn = WearableSyncIn(),
    device_id: str = Path(..., min_length=1, max_length=96),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableSyncOut:
    """Patient-initiated sync trigger.

    Bumps ``last_sync_at`` so the UI shows a fresh "Last sync just now"
    label. Optionally accepts a single ``rhr_bpm`` / ``spo2_pct`` sample
    so anomaly detection has data to look at when the bridge is offline.
    Anomaly thresholds: HR > 180, HR < 30, SpO2 < 88. Crossing any one
    creates a HIGH-priority clinician-visible mirror audit row plus an
    AE Hub draft (mirror of the Adherence Events #350 escalation
    pattern).
    """
    patient = _resolve_patient_for_actor_pw(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pw(db, patient)
    device = _resolve_device_or_404(db, patient, device_id)

    if device.status != "connected":
        raise ApiServiceError(
            code="device_not_connected",
            message=(
                "Cannot sync a disconnected device. Reconnect from the "
                "Wearables page first."
            ),
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    device.last_sync_at = now
    device.updated_at = now

    # Optionally write the patient-supplied sample as a real observation
    # so the clinician feed shows what the patient saw locally.
    new_obs_count = 0
    anomalies: list[tuple[str, float]] = []
    if body.rhr_bpm is not None:
        db.add(WearableObservation(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            connection_id=device.id,
            source=device.source,
            source_type=device.source_type,
            metric_type="rhr_bpm",
            value=float(body.rhr_bpm),
            unit="bpm",
            observed_at=now,
            quality_flag="patient_reported",
        ))
        new_obs_count += 1
        if body.rhr_bpm >= _HR_HIGH_THRESHOLD:
            anomalies.append(("hr_high", float(body.rhr_bpm)))
        elif body.rhr_bpm <= _HR_LOW_THRESHOLD:
            anomalies.append(("hr_low", float(body.rhr_bpm)))
    if body.spo2_pct is not None:
        db.add(WearableObservation(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            connection_id=device.id,
            source=device.source,
            source_type=device.source_type,
            metric_type="spo2_pct",
            value=float(body.spo2_pct),
            unit="%",
            observed_at=now,
            quality_flag="patient_reported",
        ))
        new_obs_count += 1
        if body.spo2_pct <= _SPO2_LOW_THRESHOLD:
            anomalies.append(("spo2_low", float(body.spo2_pct)))
    db.commit()

    flag_id: Optional[str] = None
    ae_id: Optional[str] = None
    for metric, value in anomalies:
        # First anomaly wins — emit one HIGH-priority mirror row plus AE
        # draft. Subsequent anomalies in the same sync are still flagged
        # via WearableAlertFlag rows so the clinician feed stays honest.
        f_id, a_id = _flag_anomaly(db, patient, device, metric, value)
        if flag_id is None:
            flag_id, ae_id = f_id, a_id
        clinician_actor = patient.clinician_id or "actor-clinician-demo"
        _wearables_audit(
            db,
            actor,
            event="observation_anomaly_to_clinician",
            target_id=clinician_actor,
            note=(
                f"priority=high; device={device.id}; metric={metric}; "
                f"value={value:.1f}; ae_id={a_id or '-'}"
            ),
            using_demo_data=is_demo,
            role_override="clinician",
            actor_override=clinician_actor,
        )

    # Patient-side audit row for the sync itself.
    _wearables_audit(
        db,
        actor,
        event="sync_triggered",
        target_id=device.id,
        note=(
            f"source={device.source}; new_obs={new_obs_count}; "
            f"anomalies={len(anomalies)}"
        ),
        using_demo_data=is_demo,
    )

    pending = _pending_anomaly_count(db, patient.id)
    return WearableSyncOut(
        accepted=True,
        device_id=device.id,
        last_sync_at=now.isoformat(),
        anomaly_flag_id=flag_id,
        adverse_event_id=ae_id,
        pending_anomalies=pending,
    )


@router.post(
    "/devices/{device_id}/disconnect",
    response_model=WearableDisconnectOut,
)
def disconnect_device(
    body: WearableDisconnectIn,
    device_id: str = Path(..., min_length=1, max_length=96),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> WearableDisconnectOut:
    """Disconnect a wearable. Note required.

    Sets ``status='disconnected'`` and ``consent_given=False`` so future
    bridge syncs are blocked at the connection layer. Existing
    observations remain on the patient record. Mirrors the gold-standard
    pattern from #348 (Home Devices) — emits a clinician-visible mirror
    so the care-team feed shows the disconnect promptly.
    """
    patient = _resolve_patient_for_actor_pw(db, actor)
    _assert_patient_consent_active(db, patient)
    is_demo = _patient_is_demo_pw(db, patient)
    device = _resolve_device_or_404(db, patient, device_id)

    now = datetime.now(timezone.utc)
    device.status = "disconnected"
    # Revoke device-level consent so the bridge blocks future
    # /wearable-sync writes for this connection. The patient-level
    # consent on Patient.consent_signed is unaffected.
    device.consent_given = False
    device.updated_at = now
    db.commit()

    _wearables_audit(
        db,
        actor,
        event="wearable_disconnected",
        target_id=device.id,
        note=(
            f"source={device.source}; reason={(body.note or '')[:200]}"
        ),
        using_demo_data=is_demo,
    )
    clinician_actor = patient.clinician_id or "actor-clinician-demo"
    _wearables_audit(
        db,
        actor,
        event="wearable_disconnected_to_clinician",
        target_id=clinician_actor,
        note=(
            f"device={device.id}; source={device.source}; "
            f"reason={(body.note or '')[:120]}"
        ),
        using_demo_data=is_demo,
        role_override="clinician",
        actor_override=clinician_actor,
    )

    return WearableDisconnectOut(
        accepted=True,
        device_id=device.id,
        status=device.status,
        disconnected_at=now.isoformat(),
    )


@router.get("/devices/{device_id}/observations/export.csv")
def export_observations_csv(
    device_id: str = Path(..., min_length=1, max_length=96),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """CSV export of every observation for this device (this patient)."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    device = _resolve_device_or_404(db, patient, device_id)

    rows = (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == patient.id,
            WearableObservation.connection_id == device.id,
        )
        .order_by(WearableObservation.observed_at.desc())
        .limit(5000)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "observation_id", "device_id", "source", "metric_type",
        "value", "unit", "observed_at", "quality_flag",
    ])
    for r in rows:
        writer.writerow([
            r.id, device.id, r.source, r.metric_type,
            "" if r.value is None else f"{r.value}",
            r.unit or "",
            _iso(r.observed_at) or "",
            r.quality_flag or "",
        ])

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}wearable-observations-{device.id}.csv"

    _wearables_audit(
        db,
        actor,
        event="export",
        target_id=device.id,
        note=f"format=csv; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PatientWearables-Demo": "1" if is_demo else "0",
        },
    )


@router.get("/devices/{device_id}/observations/export.ndjson")
def export_observations_ndjson(
    device_id: str = Path(..., min_length=1, max_length=96),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """NDJSON export — one observation per line."""
    patient = _resolve_patient_for_actor_pw(db, actor)
    is_demo = _patient_is_demo_pw(db, patient)
    device = _resolve_device_or_404(db, patient, device_id)

    rows = (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == patient.id,
            WearableObservation.connection_id == device.id,
        )
        .order_by(WearableObservation.observed_at.desc())
        .limit(5000)
        .all()
    )

    lines: list[str] = []
    for r in rows:
        lines.append(json.dumps({
            "observation_id": r.id,
            "device_id": device.id,
            "source": r.source,
            "metric_type": r.metric_type,
            "value": r.value,
            "unit": r.unit,
            "observed_at": _iso(r.observed_at),
            "quality_flag": r.quality_flag,
            "is_demo": bool(is_demo),
        }))

    prefix = "DEMO-" if is_demo else ""
    filename = f"{prefix}wearable-observations-{device.id}.ndjson"

    _wearables_audit(
        db,
        actor,
        event="export",
        target_id=device.id,
        note=f"format=ndjson; rows={len(rows)}; demo={1 if is_demo else 0}",
        using_demo_data=is_demo,
    )

    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PatientWearables-Demo": "1" if is_demo else "0",
        },
    )

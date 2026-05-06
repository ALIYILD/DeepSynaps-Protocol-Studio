from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import ClinicalSession, DeviceResource, Patient, RoomResource

logger = logging.getLogger(__name__)

_DEMO_TAG = "[DEMO]"
_DEMO_SCHED_TAG = "[DEMO_SCHED]"


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def _monday_of_week(now: datetime) -> datetime:
    anchor = now.astimezone(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    dow = anchor.weekday()  # Mon=0
    return anchor - timedelta(days=dow)


def seed_demo_clinic(
    session: Session,
    *,
    clinic_id: str = "clinic-demo-default",
    clinician_ids: tuple[str, str] = ("actor-clinician-demo", "actor-admin-demo"),
) -> dict[str, int]:
    """Seed a synthetic, non-PHI schedule for controlled preview demos.

    This seed is intentionally **operational**: rooms, devices, patients, and
    appointments (clinical_sessions). It does not attempt to seed
    notifications, staff shifts, or any external integrations.

    Idempotency: if any sessions exist with the demo schedule tag for this
    clinic's clinicians, this function is a no-op.
    """
    now = datetime.now(timezone.utc)
    monday = _monday_of_week(now)
    window_start = _iso(monday - timedelta(days=1))
    window_end = _iso(monday + timedelta(days=8))

    existing = session.scalars(
        select(ClinicalSession.id).where(
            ClinicalSession.clinician_id.in_(clinician_ids),
            ClinicalSession.scheduled_at >= window_start,
            ClinicalSession.scheduled_at < window_end,
        )
    ).first()
    if existing is not None:
        logger.info("demo clinic schedule seed skipped (sessions already present)")
        return {"rooms": 0, "devices": 0, "patients": 0, "sessions": 0}

    created_rooms = 0
    created_devices = 0
    created_patients = 0
    created_sessions = 0

    rooms = [
        ("demo-room-a", "Demo Room A"),
        ("demo-room-b", "Demo Room B"),
    ]
    for rid, name in rooms:
        row = session.query(RoomResource).filter_by(id=rid).first()
        if row is None:
            session.add(RoomResource(id=rid, clinic_id=clinic_id, name=name, description="Demo room", modalities=None))
            created_rooms += 1

    devices = [
        ("demo-device-rtms", "Magstim Demo", "rTMS", "DEMO-RTMS-001"),
        ("demo-device-tdcs", "Starstim Demo", "tDCS", "DEMO-TDCS-001"),
    ]
    for did, name, dtype, sn in devices:
        row = session.query(DeviceResource).filter_by(id=did).first()
        if row is None:
            session.add(
                DeviceResource(
                    id=did,
                    clinic_id=clinic_id,
                    name=name,
                    device_type=dtype,
                    serial_number=sn,
                    is_active=True,
                )
            )
            created_devices += 1

    patients = [
        ("Demo", "Ava Stone"),
        ("Demo", "Marcus Chen"),
        ("Demo", "Priya Nambiar"),
        ("Demo", "Elena Vasquez"),
        ("Demo", "James Okonkwo"),
        ("Demo", "Samantha Li"),
    ]
    patient_ids: list[str] = []
    for idx, (first, last) in enumerate(patients):
        pid = f"demo-pt-{idx+1:03d}"
        row = session.query(Patient).filter_by(id=pid).first()
        if row is None:
            session.add(
                Patient(
                    id=pid,
                    clinician_id=clinician_ids[0],
                    first_name=first,
                    last_name=last,
                    dob=None,
                    email=None,
                    phone=None,
                    gender="prefer_not_to_say",
                    primary_condition="Demo preview",
                    primary_modality=None,
                    consent_signed=False,
                    status="active",
                    notes=f"{_DEMO_TAG} Synthetic preview patient — non-PHI.",
                )
            )
            created_patients += 1
        patient_ids.append(pid)

    # Synthetic schedule: 10–12 sessions across the current week.
    # NOTE: These are inserted directly (bypassing router conflict validation),
    # because this is a seed script and we intentionally include one conflict pair.
    def at(day_offset: int, hour: int, minute: int = 0) -> str:
        return _iso((monday + timedelta(days=day_offset)).replace(hour=hour, minute=minute))

    seed_rows = [
        # clinician 1
        dict(id="demo-sess-001", patient_id=patient_ids[0], clinician_id=clinician_ids[0], scheduled_at=at(0, 9, 0), duration_minutes=30, modality="tDCS", appointment_type="session", room_id="demo-room-a", device_id="demo-device-tdcs"),
        dict(id="demo-sess-002", patient_id=patient_ids[1], clinician_id=clinician_ids[0], scheduled_at=at(0, 14, 30), duration_minutes=30, modality="rTMS", appointment_type="session", room_id="demo-room-b", device_id="demo-device-rtms"),
        dict(id="demo-sess-003", patient_id=patient_ids[2], clinician_id=clinician_ids[0], scheduled_at=at(1, 10, 0), duration_minutes=60, modality="neurofeedback", appointment_type="session", room_id="demo-room-a", device_id=None),
        dict(id="demo-sess-004", patient_id=patient_ids[3], clinician_id=clinician_ids[0], scheduled_at=at(2, 13, 0), duration_minutes=60, modality=None, appointment_type="new_patient", room_id="demo-room-b", device_id=None),
        dict(id="demo-sess-005", patient_id=patient_ids[4], clinician_id=clinician_ids[0], scheduled_at=at(3, 11, 0), duration_minutes=30, modality=None, appointment_type="assessment", room_id="demo-room-a", device_id=None),
        dict(id="demo-sess-006", patient_id=patient_ids[5], clinician_id=clinician_ids[0], scheduled_at=at(3, 11, 15), duration_minutes=30, modality="tDCS", appointment_type="session", room_id="demo-room-a", device_id="demo-device-tdcs"),
        # telehealth
        dict(id="demo-sess-007", patient_id=patient_ids[1], clinician_id=clinician_ids[0], scheduled_at=at(3, 16, 0), duration_minutes=30, modality=None, appointment_type="follow_up", room_id="telehealth", device_id=None),
        # clinician 2
        dict(id="demo-sess-008", patient_id=patient_ids[2], clinician_id=clinician_ids[1], scheduled_at=at(1, 11, 30), duration_minutes=30, modality="biofeedback", appointment_type="session", room_id="demo-room-b", device_id=None),
        dict(id="demo-sess-009", patient_id=patient_ids[0], clinician_id=clinician_ids[1], scheduled_at=at(4, 10, 30), duration_minutes=30, modality="rTMS", appointment_type="session", room_id="demo-room-b", device_id="demo-device-rtms"),
        dict(id="demo-sess-010", patient_id=patient_ids[3], clinician_id=clinician_ids[1], scheduled_at=at(4, 15, 0), duration_minutes=60, modality="biofeedback", appointment_type="session", room_id="demo-room-a", device_id=None),
    ]

    for spec in seed_rows:
        if session.query(ClinicalSession).filter_by(id=spec["id"]).first() is not None:
            continue
        session.add(
            ClinicalSession(
                id=spec["id"],
                patient_id=spec["patient_id"],
                clinician_id=spec["clinician_id"],
                scheduled_at=spec["scheduled_at"],
                duration_minutes=spec["duration_minutes"],
                modality=spec["modality"],
                appointment_type=spec["appointment_type"],
                status="scheduled",
                room_id=spec["room_id"],
                device_id=spec["device_id"],
                session_notes=f"{_DEMO_SCHED_TAG} Synthetic preview appointment — non-PHI. Confirm details in chart.",
                adverse_events=None,
                outcome=None,
                protocol_ref=None,
                billing_code=None,
                billing_status="unbilled",
            )
        )
        created_sessions += 1

    session.commit()
    logger.info(
        "demo clinic schedule seeded",
        extra={
            "event": "demo_clinic_seeded",
            "rooms": created_rooms,
            "devices": created_devices,
            "patients": created_patients,
            "sessions": created_sessions,
        },
    )
    return {
        "rooms": created_rooms,
        "devices": created_devices,
        "patients": created_patients,
        "sessions": created_sessions,
    }


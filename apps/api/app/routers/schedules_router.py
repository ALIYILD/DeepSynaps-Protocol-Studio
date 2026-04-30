"""Schedule router — rooms, devices, conflicts, resource availability.

Prefix: /api/v1/schedule
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    DeviceResource,
    RoomResource,
    User,
)
from app.repositories.audit import create_audit_event
from app.repositories.sessions import check_conflicts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/schedule", tags=["schedule"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _clinic_member_ids(db: Session, actor: AuthenticatedActor) -> list[str]:
    """Return user-ids whose ``clinic_id`` matches ``actor.clinic_id``."""
    if actor.clinic_id is None:
        return [actor.actor_id]
    rows = db.execute(select(User.id).where(User.clinic_id == actor.clinic_id)).all()
    ids = [r[0] for r in rows]
    return ids or [actor.actor_id]


# ── Schemas ──────────────────────────────────────────────────────────────────

class RoomOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    modalities: Optional[List[str]] = None
    is_active: bool = True

    @classmethod
    def from_record(cls, r: RoomResource) -> "RoomOut":
        modalities = None
        if r.modalities:
            try:
                modalities = json.loads(r.modalities)
            except Exception:
                modalities = None
        return cls(
            id=r.id,
            name=r.name,
            description=r.description,
            modalities=modalities,
            is_active=r.is_active,
        )


class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    modalities: Optional[List[str]] = None


class DeviceOut(BaseModel):
    id: str
    name: str
    device_type: str
    serial_number: Optional[str] = None
    is_active: bool = True

    @classmethod
    def from_record(cls, r: DeviceResource) -> "DeviceOut":
        return cls(
            id=r.id,
            name=r.name,
            device_type=r.device_type,
            serial_number=r.serial_number,
            is_active=r.is_active,
        )


class DeviceCreate(BaseModel):
    name: str
    device_type: str
    serial_number: Optional[str] = None


class ConflictCheckIn(BaseModel):
    clinician_id: str
    scheduled_at: str  # ISO datetime
    duration_minutes: int = Field(default=60, ge=1, le=480)
    room_id: Optional[str] = None
    device_id: Optional[str] = None
    exclude_appointment_id: Optional[str] = None


class ConflictOut(BaseModel):
    type: str  # clinician | patient | room | device
    resource_id: str
    resource_name: str
    appointment_id: str
    scheduled_at: str
    duration_minutes: int
    patient_id: str


class ConflictCheckOut(BaseModel):
    has_conflicts: bool
    conflicts: List[ConflictOut]


class ResourceAvailabilityOut(BaseModel):
    clinicians: List[Dict[str, Any]]
    rooms: List[RoomOut]
    devices: List[DeviceOut]


# ── Rooms ────────────────────────────────────────────────────────────────────

@router.get("/rooms", response_model=List[RoomOut])
def list_rooms(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> List[RoomOut]:
    """List rooms for the actor's clinic."""
    require_minimum_role(actor, "clinician")
    if actor.clinic_id is None:
        return []
    records = session.execute(
        select(RoomResource)
        .where(RoomResource.clinic_id == actor.clinic_id, RoomResource.is_active.is_(True))
        .order_by(RoomResource.name)
    ).scalars().all()
    return [RoomOut.from_record(r) for r in records]


@router.post("/rooms", response_model=RoomOut, status_code=201)
def create_room(
    body: RoomCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> RoomOut:
    """Create a new room (admin only)."""
    require_minimum_role(actor, "admin")
    if actor.clinic_id is None:
        raise ApiServiceError(
            code="no_clinic", message="Admin must belong to a clinic to create rooms.", status_code=400
        )
    record = RoomResource(
        clinic_id=actor.clinic_id,
        name=body.name,
        description=body.description,
        modalities=json.dumps(body.modalities) if body.modalities else None,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return RoomOut.from_record(record)


# ── Devices ──────────────────────────────────────────────────────────────────

@router.get("/devices", response_model=List[DeviceOut])
def list_devices(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> List[DeviceOut]:
    """List devices for the actor's clinic."""
    require_minimum_role(actor, "clinician")
    if actor.clinic_id is None:
        return []
    records = session.execute(
        select(DeviceResource)
        .where(DeviceResource.clinic_id == actor.clinic_id, DeviceResource.is_active.is_(True))
        .order_by(DeviceResource.name)
    ).scalars().all()
    return [DeviceOut.from_record(r) for r in records]


@router.post("/devices", response_model=DeviceOut, status_code=201)
def create_device(
    body: DeviceCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DeviceOut:
    """Create a new device (admin only)."""
    require_minimum_role(actor, "admin")
    if actor.clinic_id is None:
        raise ApiServiceError(
            code="no_clinic", message="Admin must belong to a clinic to create devices.", status_code=400
        )
    record = DeviceResource(
        clinic_id=actor.clinic_id,
        name=body.name,
        device_type=body.device_type,
        serial_number=body.serial_number,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return DeviceOut.from_record(record)


# ── Conflict check ───────────────────────────────────────────────────────────

@router.post("/conflicts", response_model=ConflictCheckOut)
def check_appointment_conflicts(
    body: ConflictCheckIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ConflictCheckOut:
    """Check for scheduling conflicts for a proposed appointment slot."""
    require_minimum_role(actor, "clinician")

    # Scope conflicts to the actor's clinic
    member_ids = _clinic_member_ids(session, actor)
    if body.clinician_id not in member_ids and actor.role != "admin":
        raise ApiServiceError(
            code="cross_clinic_access_denied",
            message="Clinician is not in your clinic.",
            status_code=403,
        )

    conflict_records = check_conflicts(
        session,
        clinician_id=body.clinician_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        room_id=body.room_id,
        device_id=body.device_id,
        exclude_id=body.exclude_appointment_id,
    )

    # Filter to clinic-scoped sessions only
    scoped_records = [c for c in conflict_records if c.clinician_id in member_ids or actor.role == "admin"]

    conflicts: List[ConflictOut] = []
    for c in scoped_records:
        # Determine conflict type
        if c.clinician_id == body.clinician_id:
            conflicts.append(ConflictOut(
                type="clinician",
                resource_id=body.clinician_id,
                resource_name="Clinician",
                appointment_id=c.id,
                scheduled_at=c.scheduled_at,
                duration_minutes=c.duration_minutes,
                patient_id=c.patient_id,
            ))
        if body.room_id and c.room_id == body.room_id:
            conflicts.append(ConflictOut(
                type="room",
                resource_id=body.room_id,
                resource_name="Room",
                appointment_id=c.id,
                scheduled_at=c.scheduled_at,
                duration_minutes=c.duration_minutes,
                patient_id=c.patient_id,
            ))
        if body.device_id and c.device_id == body.device_id:
            conflicts.append(ConflictOut(
                type="device",
                resource_id=body.device_id,
                resource_name="Device",
                appointment_id=c.id,
                scheduled_at=c.scheduled_at,
                duration_minutes=c.duration_minutes,
                patient_id=c.patient_id,
            ))

    try:
        create_audit_event(
            session,
            event_id=f"conflict-check-{actor.actor_id}-{int(datetime.now(timezone.utc).timestamp())}",
            target_id=actor.clinic_id or actor.actor_id,
            target_type="schedule",
            action="schedule.conflict.checked",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"conflicts={len(conflicts)}; clinician={body.clinician_id}; at={body.scheduled_at}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        pass

    return ConflictCheckOut(has_conflicts=len(conflicts) > 0, conflicts=conflicts)


# ── Resources (combined availability) ─────────────────────────────────────────

@router.get("/resources", response_model=ResourceAvailabilityOut)
def list_resources(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ResourceAvailabilityOut:
    """Return combined clinicians, rooms, and devices for the actor's clinic."""
    require_minimum_role(actor, "clinician")

    member_ids = _clinic_member_ids(session, actor)
    clinicians = session.execute(
        select(User.id, User.display_name, User.email, User.role)
        .where(User.id.in_(member_ids))
        .order_by(User.display_name)
    ).all()

    clinician_list = [
        {"id": r[0], "name": r[1] or r[2] or r[0], "role": r[3]}
        for r in clinicians
    ]

    rooms = list_rooms(actor, session)
    devices = list_devices(actor, session)

    return ResourceAvailabilityOut(
        clinicians=clinician_list,
        rooms=rooms,
        devices=devices,
    )

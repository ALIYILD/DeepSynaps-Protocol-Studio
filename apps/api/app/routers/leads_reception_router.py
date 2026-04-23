"""Leads & Reception endpoints — CRM pipeline, call log, and task management."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import ClinicLead, ReceptionCall, ReceptionTask

router = APIRouter(tags=["leads-reception"])


# ── Schemas ──────────────────────────────────────────────────────────────────


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: str = "phone"
    condition: Optional[str] = None
    stage: str = "new"
    notes: Optional[str] = None
    follow_up: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    condition: Optional[str] = None
    stage: Optional[str] = None
    notes: Optional[str] = None
    follow_up: Optional[str] = None
    converted_appointment_id: Optional[str] = None


class LeadOut(BaseModel):
    id: str
    clinician_id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    source: str
    condition: Optional[str]
    stage: str
    notes: Optional[str]
    follow_up: Optional[str]
    converted_appointment_id: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: ClinicLead) -> "LeadOut":
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            name=r.name,
            email=r.email,
            phone=r.phone,
            source=r.source,
            condition=r.condition,
            stage=r.stage,
            notes=r.notes,
            follow_up=r.follow_up,
            converted_appointment_id=r.converted_appointment_id,
            created_at=r.created_at or "",
            updated_at=r.updated_at or "",
        )


class LeadListResponse(BaseModel):
    items: list[LeadOut]
    total: int


class CallCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    direction: str = "inbound"
    duration: int = 0
    outcome: str = "info-given"
    notes: Optional[str] = None
    call_time: Optional[str] = None
    call_date: str


class CallOut(BaseModel):
    id: str
    clinician_id: str
    name: str
    phone: Optional[str]
    direction: str
    duration: int
    outcome: str
    notes: Optional[str]
    call_time: Optional[str]
    call_date: str
    created_at: str

    @classmethod
    def from_record(cls, r: ReceptionCall) -> "CallOut":
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            name=r.name,
            phone=r.phone,
            direction=r.direction,
            duration=r.duration,
            outcome=r.outcome,
            notes=r.notes,
            call_time=r.call_time,
            call_date=r.call_date,
            created_at=r.created_at or "",
        )


class CallListResponse(BaseModel):
    items: list[CallOut]
    total: int


class TaskCreate(BaseModel):
    text: str
    due: Optional[str] = None
    done: bool = False
    priority: str = "medium"


class TaskUpdate(BaseModel):
    text: Optional[str] = None
    due: Optional[str] = None
    done: Optional[bool] = None
    priority: Optional[str] = None


class TaskOut(BaseModel):
    id: str
    clinician_id: str
    text: str
    due: Optional[str]
    done: bool
    priority: str
    created_at: str

    @classmethod
    def from_record(cls, r: ReceptionTask) -> "TaskOut":
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            text=r.text,
            due=r.due,
            done=r.done,
            priority=r.priority,
            created_at=r.created_at or "",
        )


class TaskListResponse(BaseModel):
    items: list[TaskOut]
    total: int


# ── Lead endpoints ────────────────────────────────────────────────────────────


@router.get("/api/v1/leads", response_model=LeadListResponse)
def list_leads(
    stage: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LeadListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ClinicLead).filter(ClinicLead.clinician_id == actor.actor_id)
    if stage:
        q = q.filter(ClinicLead.stage == stage)
    q = q.order_by(ClinicLead.created_at.desc())
    records = q.all()
    items = [LeadOut.from_record(r) for r in records]
    return LeadListResponse(items=items, total=len(items))


@router.post("/api/v1/leads", response_model=LeadOut, status_code=201)
def create_lead(
    body: LeadCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LeadOut:
    require_minimum_role(actor, "clinician")
    record = ClinicLead(clinician_id=actor.actor_id, **body.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return LeadOut.from_record(record)


@router.patch("/api/v1/leads/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: str,
    body: LeadUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LeadOut:
    require_minimum_role(actor, "clinician")
    record = db.query(ClinicLead).filter(
        ClinicLead.id == lead_id,
        ClinicLead.clinician_id == actor.actor_id,
    ).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Lead not found.", status_code=404)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for key, val in updates.items():
        setattr(record, key, val)
    record.updated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    db.commit()
    db.refresh(record)
    return LeadOut.from_record(record)


@router.delete("/api/v1/leads/{lead_id}", status_code=204)
def delete_lead(
    lead_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    require_minimum_role(actor, "clinician")
    record = db.query(ClinicLead).filter(
        ClinicLead.id == lead_id,
        ClinicLead.clinician_id == actor.actor_id,
    ).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Lead not found.", status_code=404)
    db.delete(record)
    db.commit()


# ── Reception call endpoints ──────────────────────────────────────────────────


@router.get("/api/v1/reception/calls", response_model=CallListResponse)
def list_calls(
    date: Optional[str] = None,
    direction: Optional[str] = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CallListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ReceptionCall).filter(ReceptionCall.clinician_id == actor.actor_id)
    if date:
        q = q.filter(ReceptionCall.call_date == date)
    if direction:
        q = q.filter(ReceptionCall.direction == direction)
    q = q.order_by(ReceptionCall.created_at.desc())
    records = q.all()
    items = [CallOut.from_record(r) for r in records]
    return CallListResponse(items=items, total=len(items))


@router.post("/api/v1/reception/calls", response_model=CallOut, status_code=201)
def create_call(
    body: CallCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CallOut:
    require_minimum_role(actor, "clinician")
    record = ReceptionCall(clinician_id=actor.actor_id, **body.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return CallOut.from_record(record)


# ── Reception task endpoints ──────────────────────────────────────────────────


@router.get("/api/v1/reception/tasks", response_model=TaskListResponse)
def list_tasks(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TaskListResponse:
    require_minimum_role(actor, "clinician")
    records = (
        db.query(ReceptionTask)
        .filter(ReceptionTask.clinician_id == actor.actor_id)
        .order_by(ReceptionTask.done, ReceptionTask.due)
        .all()
    )
    items = [TaskOut.from_record(r) for r in records]
    return TaskListResponse(items=items, total=len(items))


@router.post("/api/v1/reception/tasks", response_model=TaskOut, status_code=201)
def create_task(
    body: TaskCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TaskOut:
    require_minimum_role(actor, "clinician")
    record = ReceptionTask(clinician_id=actor.actor_id, **body.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return TaskOut.from_record(record)


@router.patch("/api/v1/reception/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    body: TaskUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TaskOut:
    require_minimum_role(actor, "clinician")
    record = db.query(ReceptionTask).filter(
        ReceptionTask.id == task_id,
        ReceptionTask.clinician_id == actor.actor_id,
    ).first()
    if record is None:
        raise ApiServiceError(code="not_found", message="Task not found.", status_code=404)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for key, val in updates.items():
        setattr(record, key, val)
    db.commit()
    db.refresh(record)
    return TaskOut.from_record(record)

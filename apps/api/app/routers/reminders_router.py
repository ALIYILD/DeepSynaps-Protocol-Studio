"""Reminder Campaigns router.

Endpoints
---------
GET  /api/v1/reminders/campaigns                — list reminder campaigns
POST /api/v1/reminders/campaigns                — create campaign
PUT  /api/v1/reminders/campaigns/{id}           — update / toggle active
GET  /api/v1/reminders/outbox                   — list queued/sent messages
POST /api/v1/reminders/send                     — enqueue a message for sending
GET  /api/v1/reminders/adherence/{patient_id}   — get patient adherence score
GET  /api/v1/reminders/adherence                — all patient adherence scores
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import ReminderCampaign, ReminderOutboxMessage

router = APIRouter(prefix="/api/v1/reminders", tags=["Reminder Campaigns"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    campaign_type: str = "session"   # session, medication, assessment, general
    channel: str = "email"           # email, sms, push, telegram
    schedule: dict = {}              # schedule rules (cron expression or offset)
    message_template: str = ""
    patient_ids: list[str] = []
    active: bool = True


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    campaign_type: Optional[str] = None
    channel: Optional[str] = None
    schedule: Optional[dict] = None
    message_template: Optional[str] = None
    patient_ids: Optional[list[str]] = None
    active: Optional[bool] = None


class CampaignOut(BaseModel):
    id: str
    clinician_id: str
    name: str
    description: Optional[str]
    campaign_type: str
    channel: str
    schedule: dict
    message_template: str
    patient_ids: list[str]
    active: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: ReminderCampaign) -> "CampaignOut":
        schedule: dict = {}
        patient_ids: list[str] = []
        try:
            schedule = json.loads(r.schedule_json or "{}")
        except Exception:
            pass
        try:
            patient_ids = json.loads(r.patient_ids_json or "[]")
        except Exception:
            pass
        def _dt(v) -> str:
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            name=r.name,
            description=r.description,
            campaign_type=r.campaign_type,
            channel=r.channel,
            schedule=schedule,
            message_template=r.message_template,
            patient_ids=patient_ids,
            active=r.active,
            created_at=_dt(r.created_at),
            updated_at=_dt(r.updated_at),
        )


class CampaignListResponse(BaseModel):
    items: list[CampaignOut]
    total: int


class SendMessageRequest(BaseModel):
    patient_id: str
    campaign_id: Optional[str] = None
    channel: str = "email"
    message_body: str
    scheduled_at: Optional[str] = None  # ISO datetime; None = send now / enqueue immediately


class OutboxMessageOut(BaseModel):
    id: str
    campaign_id: Optional[str]
    patient_id: str
    clinician_id: str
    channel: str
    message_body: str
    status: str
    scheduled_at: Optional[str]
    sent_at: Optional[str]
    error_detail: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r: ReminderOutboxMessage) -> "OutboxMessageOut":
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            campaign_id=r.campaign_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            channel=r.channel,
            message_body=r.message_body,
            status=r.status,
            scheduled_at=_dt(r.scheduled_at),
            sent_at=_dt(r.sent_at),
            error_detail=r.error_detail,
            created_at=_dt(r.created_at),
        )


class OutboxListResponse(BaseModel):
    items: list[OutboxMessageOut]
    total: int


class AdherenceScore(BaseModel):
    patient_id: str
    messages_sent: int
    messages_delivered: int
    delivery_rate_pct: float
    last_message_at: Optional[str]


class AdherenceListResponse(BaseModel):
    items: list[AdherenceScore]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_campaign_or_404(db: Session, campaign_id: str, actor: AuthenticatedActor) -> ReminderCampaign:
    campaign = db.query(ReminderCampaign).filter_by(id=campaign_id).first()
    if campaign is None:
        raise ApiServiceError(code="not_found", message="Campaign not found.", status_code=404)
    if actor.role != "admin" and campaign.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Campaign not found.", status_code=404)
    return campaign


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/campaigns", response_model=CampaignListResponse)
def list_campaigns(
    active_only: bool = Query(default=False),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CampaignListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ReminderCampaign)
    if actor.role != "admin":
        q = q.filter(ReminderCampaign.clinician_id == actor.actor_id)
    if active_only:
        q = q.filter(ReminderCampaign.active.is_(True))
    records = q.order_by(ReminderCampaign.created_at.desc()).all()
    items = [CampaignOut.from_record(r) for r in records]
    return CampaignListResponse(items=items, total=len(items))


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
def create_campaign(
    body: CampaignCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CampaignOut:
    require_minimum_role(actor, "clinician")
    campaign = ReminderCampaign(
        clinician_id=actor.actor_id,
        name=body.name.strip(),
        description=body.description,
        campaign_type=body.campaign_type,
        channel=body.channel,
        schedule_json=json.dumps(body.schedule),
        message_template=body.message_template,
        patient_ids_json=json.dumps(body.patient_ids),
        active=body.active,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return CampaignOut.from_record(campaign)


@router.put("/campaigns/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> CampaignOut:
    require_minimum_role(actor, "clinician")
    campaign = _get_campaign_or_404(db, campaign_id, actor)

    if body.name is not None:
        campaign.name = body.name.strip()
    if body.description is not None:
        campaign.description = body.description
    if body.campaign_type is not None:
        campaign.campaign_type = body.campaign_type
    if body.channel is not None:
        campaign.channel = body.channel
    if body.schedule is not None:
        campaign.schedule_json = json.dumps(body.schedule)
    if body.message_template is not None:
        campaign.message_template = body.message_template
    if body.patient_ids is not None:
        campaign.patient_ids_json = json.dumps(body.patient_ids)
    if body.active is not None:
        campaign.active = body.active

    db.commit()
    db.refresh(campaign)
    return CampaignOut.from_record(campaign)


@router.get("/outbox", response_model=OutboxListResponse)
def list_outbox(
    patient_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutboxListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ReminderOutboxMessage)
    if actor.role != "admin":
        q = q.filter(ReminderOutboxMessage.clinician_id == actor.actor_id)
    if patient_id:
        q = q.filter(ReminderOutboxMessage.patient_id == patient_id)
    if status:
        q = q.filter(ReminderOutboxMessage.status == status)
    if campaign_id:
        q = q.filter(ReminderOutboxMessage.campaign_id == campaign_id)
    records = q.order_by(ReminderOutboxMessage.created_at.desc()).limit(limit).all()
    items = [OutboxMessageOut.from_record(r) for r in records]
    return OutboxListResponse(items=items, total=len(items))


@router.post("/send", response_model=OutboxMessageOut, status_code=201)
def send_message(
    body: SendMessageRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> OutboxMessageOut:
    require_minimum_role(actor, "clinician")
    scheduled_at: Optional[datetime] = None
    if body.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(body.scheduled_at.rstrip("Z"))
        except ValueError:
            pass

    msg = ReminderOutboxMessage(
        campaign_id=body.campaign_id,
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        channel=body.channel,
        message_body=body.message_body,
        status="queued",
        scheduled_at=scheduled_at,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return OutboxMessageOut.from_record(msg)


@router.get("/adherence/{patient_id}", response_model=AdherenceScore)
def get_patient_adherence(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceScore:
    require_minimum_role(actor, "clinician")
    q = db.query(ReminderOutboxMessage).filter(ReminderOutboxMessage.patient_id == patient_id)
    if actor.role != "admin":
        q = q.filter(ReminderOutboxMessage.clinician_id == actor.actor_id)
    msgs = q.all()

    sent_count = len([m for m in msgs if m.status in ("sent", "delivered")])
    delivered_count = len([m for m in msgs if m.status == "delivered"])
    last_msg = max((m.sent_at or m.created_at for m in msgs if m.sent_at or m.created_at), default=None)

    def _dt(v) -> Optional[str]:
        if v is None:
            return None
        return v.isoformat() if isinstance(v, datetime) else str(v)

    delivery_rate = round((delivered_count / sent_count * 100) if sent_count > 0 else 0.0, 1)
    return AdherenceScore(
        patient_id=patient_id,
        messages_sent=sent_count,
        messages_delivered=delivered_count,
        delivery_rate_pct=delivery_rate,
        last_message_at=_dt(last_msg),
    )


@router.get("/adherence", response_model=AdherenceListResponse)
def get_all_adherence_scores(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AdherenceListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(ReminderOutboxMessage)
    if actor.role != "admin":
        q = q.filter(ReminderOutboxMessage.clinician_id == actor.actor_id)
    msgs = q.all()

    # Group by patient
    patient_map: dict[str, list] = {}
    for m in msgs:
        patient_map.setdefault(m.patient_id, []).append(m)

    items: list[AdherenceScore] = []
    for pid, patient_msgs in patient_map.items():
        sent_count = len([m for m in patient_msgs if m.status in ("sent", "delivered")])
        delivered_count = len([m for m in patient_msgs if m.status == "delivered"])
        last_msg = max(
            (m.sent_at or m.created_at for m in patient_msgs if m.sent_at or m.created_at),
            default=None,
        )

        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)

        delivery_rate = round((delivered_count / sent_count * 100) if sent_count > 0 else 0.0, 1)
        items.append(AdherenceScore(
            patient_id=pid,
            messages_sent=sent_count,
            messages_delivered=delivered_count,
            delivery_rate_pct=delivery_rate,
            last_message_at=_dt(last_msg),
        ))

    return AdherenceListResponse(items=items, total=len(items))

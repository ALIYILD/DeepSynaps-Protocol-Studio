"""Marketplace router — patient-facing catalog and orders.

Patients can:
- Browse the marketplace catalog (products, services, software)
- View item details including external purchase links
- Request items via their care team (creates an order)
- View their order history

Clinicians review orders before approval.

Endpoints
---------
GET  /api/v1/patient-portal/marketplace/items          List catalog items
GET  /api/v1/patient-portal/marketplace/items/{id}     Single item details
POST /api/v1/patient-portal/marketplace/orders         Request an item
GET  /api/v1/patient-portal/marketplace/my-orders      Patient's order history
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import MarketplaceItem, MarketplaceOrder, Patient

router = APIRouter(prefix="/api/v1/patient-portal/marketplace", tags=["Patient Portal — Marketplace"])

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _require_patient(actor: AuthenticatedActor, db: Session) -> Patient:
    from app.persistence.models import User
    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        patient = db.query(Patient).filter(Patient.email == "patient@demo.com").first()
        if patient:
            return patient
        raise ApiServiceError(
            code="patient_not_linked",
            message="No demo patient record found.",
            status_code=404,
        )
    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(
            code="patient_not_linked",
            message="No patient record linked to this user account.",
            status_code=404,
        )
    return patient


def _item_to_dict(item: MarketplaceItem) -> dict:
    tags = []
    try:
        tags = json.loads(item.tags_json or "[]")
    except Exception:
        pass
    return {
        "id": item.id,
        "kind": item.kind,
        "name": item.name,
        "provider": item.provider,
        "description": item.description or "",
        "price": item.price,
        "price_unit": item.price_unit,
        "external_url": item.external_url,
        "image_url": item.image_url,
        "tags": tags,
        "clinical": item.clinical,
        "featured": item.featured,
        "active": item.active,
        "created_by_professional_name": item.created_by_professional_name,
        "icon": item.icon,
        "tone": item.tone,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _order_to_dict(order: MarketplaceOrder, item: Optional[MarketplaceItem] = None) -> dict:
    return {
        "id": order.id,
        "item_id": order.item_id,
        "item": _item_to_dict(item) if item else None,
        "status": order.status,
        "patient_notes": order.patient_notes,
        "clinician_notes": order.clinician_notes,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
    }


# ── Request schemas ──────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    item_id: str = Field(..., min_length=1, max_length=36)
    patient_notes: Optional[str] = Field(None, max_length=2000)


# ── Routes ───────────────────────────────────────────────────────────────────────

@router.get("/items")
def list_marketplace_items(
    kind: Optional[str] = None,
    featured: Optional[bool] = None,
    clinical: Optional[bool] = None,
    db: Session = Depends(get_db_session),
) -> dict:
    """List active marketplace items. Optional filters."""
    query = db.query(MarketplaceItem).filter(MarketplaceItem.active == True)
    if kind:
        query = query.filter(MarketplaceItem.kind == kind)
    if featured is not None:
        query = query.filter(MarketplaceItem.featured == featured)
    if clinical is not None:
        query = query.filter(MarketplaceItem.clinical == clinical)
    items = query.order_by(MarketplaceItem.featured.desc(), MarketplaceItem.name.asc()).all()
    return {"items": [_item_to_dict(i) for i in items]}


@router.get("/items/{item_id}")
def get_marketplace_item(
    item_id: str = Path(..., min_length=1, max_length=36),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get a single marketplace item by ID."""
    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == item_id,
        MarketplaceItem.active == True,
    ).first()
    if item is None:
        raise ApiServiceError(code="not_found", message="Item not found.", status_code=404)
    return {"item": _item_to_dict(item)}


@router.post("/orders", status_code=201)
def create_marketplace_order(
    body: CreateOrderRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Patient requests an item via their care team."""
    patient = _require_patient(actor, db)

    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == body.item_id,
        MarketplaceItem.active == True,
    ).first()
    if item is None:
        raise ApiServiceError(code="not_found", message="Item not found.", status_code=404)

    now = datetime.now(timezone.utc)
    order = MarketplaceOrder(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        item_id=item.id,
        status="requested",
        patient_notes=(body.patient_notes or "").strip() or None,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {"order": _order_to_dict(order, item)}


@router.get("/my-orders")
def list_my_orders(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """List the patient's marketplace orders."""
    patient = _require_patient(actor, db)
    rows = (
        db.query(MarketplaceOrder)
        .filter(MarketplaceOrder.patient_id == patient.id)
        .order_by(MarketplaceOrder.created_at.desc())
        .all()
    )
    item_ids = {r.item_id for r in rows}
    items = {i.id: i for i in db.query(MarketplaceItem).filter(MarketplaceItem.id.in_(item_ids)).all()}
    return {"orders": [_order_to_dict(r, items.get(r.item_id)) for r in rows]}

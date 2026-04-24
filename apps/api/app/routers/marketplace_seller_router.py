"""Marketplace seller router — user-facing product listing management.

Any authenticated user can become a seller and list products with Amazon links.

Endpoints
---------
GET  /api/v1/marketplace/seller/me                Current user's seller profile
POST /api/v1/marketplace/seller/items             Create a new product listing
GET  /api/v1/marketplace/seller/my-items          List my product listings
PATCH /api/v1/marketplace/seller/items/{id}       Update my listing
DELETE /api/v1/marketplace/seller/items/{id}      Delete my listing
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import MarketplaceItem, User

router = APIRouter(prefix="/api/v1/marketplace/seller", tags=["Marketplace — Seller"])


# ── Request schemas ──────────────────────────────────────────────────────────────

class CreateListingRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    provider: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    price: Optional[float] = Field(None, ge=0)
    price_unit: Optional[str] = Field(None, max_length=30)
    external_url: str = Field(..., min_length=1, max_length=512)
    image_url: Optional[str] = Field(None, max_length=512)
    tags: list[str] = Field(default_factory=list)
    kind: str = Field(default="product")
    icon: Optional[str] = Field(None, max_length=10)
    tone: Optional[str] = Field(None, max_length=20)


class UpdateListingRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    provider: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    price: Optional[float] = Field(None, ge=0)
    price_unit: Optional[str] = Field(None, max_length=30)
    external_url: Optional[str] = Field(None, min_length=1, max_length=512)
    image_url: Optional[str] = Field(None, max_length=512)
    tags: Optional[list[str]] = None
    active: Optional[bool] = None


_VALID_KINDS = frozenset({"product", "service", "device", "software", "education", "course"})


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _require_user(actor: AuthenticatedActor, db: Session) -> User:
    user = db.query(User).filter(User.id == actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User not found.", status_code=404)
    return user


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
        "source": item.source,
        "icon": item.icon,
        "tone": item.tone,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


# ── Routes ───────────────────────────────────────────────────────────────────────

@router.get("/me")
def get_seller_me(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get current user's seller profile and listing count."""
    user = _require_user(actor, db)
    listing_count = db.query(MarketplaceItem).filter(
        MarketplaceItem.seller_id == user.id,
        MarketplaceItem.source == "seller_listed",
    ).count()
    active_count = db.query(MarketplaceItem).filter(
        MarketplaceItem.seller_id == user.id,
        MarketplaceItem.source == "seller_listed",
        MarketplaceItem.active.is_(True),
    ).count()
    return {
        "user_id": user.id,
        "display_name": user.display_name,
        "email": user.email,
        "is_seller": True,
        "listing_count": listing_count,
        "active_listing_count": active_count,
    }


@router.post("/items", status_code=201)
def create_listing(
    body: CreateListingRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Create a new product listing as a seller."""
    user = _require_user(actor, db)

    if body.kind not in _VALID_KINDS:
        raise ApiServiceError(
            code="invalid_kind",
            message=f"kind must be one of: {', '.join(sorted(_VALID_KINDS))}",
            status_code=422,
        )

    now = datetime.now(timezone.utc)
    item = MarketplaceItem(
        id=str(uuid.uuid4()),
        kind=body.kind,
        name=body.name.strip(),
        provider=body.provider.strip(),
        description=(body.description or "").strip() or None,
        price=body.price,
        price_unit=(body.price_unit or "").strip() or None,
        external_url=body.external_url.strip(),
        image_url=(body.image_url or "").strip() or None,
        tags_json=json.dumps(body.tags),
        clinical=False,
        featured=False,
        active=True,
        seller_id=user.id,
        source="seller_listed",
        icon=(body.icon or "").strip() or None,
        tone=(body.tone or "").strip() or None,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"item": _item_to_dict(item)}


@router.get("/my-items")
def list_my_listings(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """List all product listings created by the current seller."""
    user = _require_user(actor, db)
    items = (
        db.query(MarketplaceItem)
        .filter(
            MarketplaceItem.seller_id == user.id,
            MarketplaceItem.source == "seller_listed",
        )
        .order_by(MarketplaceItem.created_at.desc())
        .all()
    )
    return {"items": [_item_to_dict(i) for i in items]}


@router.patch("/items/{item_id}")
def update_listing(
    body: UpdateListingRequest,
    item_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Update one of the seller's own listings."""
    user = _require_user(actor, db)
    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == item_id,
        MarketplaceItem.seller_id == user.id,
        MarketplaceItem.source == "seller_listed",
    ).first()
    if item is None:
        raise ApiServiceError(code="not_found", message="Listing not found.", status_code=404)

    if body.name is not None:
        item.name = body.name.strip()
    if body.provider is not None:
        item.provider = body.provider.strip()
    if body.description is not None:
        item.description = body.description.strip() or None
    if body.price is not None:
        item.price = body.price
    if body.price_unit is not None:
        item.price_unit = body.price_unit.strip() or None
    if body.external_url is not None:
        item.external_url = body.external_url.strip()
    if body.image_url is not None:
        item.image_url = body.image_url.strip() or None
    if body.tags is not None:
        item.tags_json = json.dumps(body.tags)
    if body.active is not None:
        item.active = body.active

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return {"item": _item_to_dict(item)}


@router.delete("/items/{item_id}", status_code=204)
def delete_listing(
    item_id: str = Path(..., min_length=1, max_length=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> None:
    """Soft-delete a listing by setting active=False."""
    user = _require_user(actor, db)
    item = db.query(MarketplaceItem).filter(
        MarketplaceItem.id == item_id,
        MarketplaceItem.seller_id == user.id,
        MarketplaceItem.source == "seller_listed",
    ).first()
    if item is None:
        raise ApiServiceError(code="not_found", message="Listing not found.", status_code=404)
    item.active = False
    item.updated_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/browse")
def browse_listings(
    kind: Optional[str] = Query(None, max_length=20),
    db: Session = Depends(get_db_session),
) -> dict:
    """Browse all active seller listings, optionally filtered by kind.

    This is a public-read endpoint (no auth required) so the Academy page
    can display community education listings without patient-portal auth.
    """
    q = db.query(MarketplaceItem).filter(
        MarketplaceItem.active.is_(True),
        MarketplaceItem.source == "seller_listed",
    )
    if kind:
        kinds = [k.strip() for k in kind.split(",") if k.strip()]
        if kinds:
            q = q.filter(MarketplaceItem.kind.in_(kinds))
    items = q.order_by(MarketplaceItem.created_at.desc()).limit(100).all()
    return {"items": [_item_to_dict(i) for i in items]}

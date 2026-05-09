"""Tests for marketplace_router — /api/v1/patient-portal/marketplace.

Tests cover:
- GET  /items returns empty list when no items exist
- GET  /items returns active items (filtered correctly)
- GET  /items/{id} returns 404 for unknown item
- GET  /items/{id} returns item detail for existing active item
- POST /orders creates an order (201) when a patient+item exist
- POST /orders returns 404 when item doesn't exist
- POST /orders returns 404 when actor has no linked patient record
- GET  /my-orders returns empty list when patient has no orders
- GET  /items supports kind filter
- GET  /items supports featured filter
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, MarketplaceItem, Patient, User


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _seed_item(
    db: Session,
    *,
    name: str = "Test Item",
    kind: str = "product",
    active: bool = True,
    featured: bool = False,
    clinical: bool = False,
) -> MarketplaceItem:
    item = MarketplaceItem(
        id=str(uuid.uuid4()),
        kind=kind,
        name=name,
        provider="TestProvider",
        description="A test marketplace item.",
        price=29.99,
        price_unit="per_unit",
        active=active,
        featured=featured,
        clinical=clinical,
        source="deepsynaps_curated",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _seed_patient_user(db: Session) -> dict:
    """Seed a User + Patient linked by email so _require_patient resolves.

    Returns a plain dict with user attributes (avoids DetachedInstanceError).
    """
    uid = str(uuid.uuid4())
    email = f"portal_{uid[:8]}@example.com"
    user = User(
        id=uid,
        email=email,
        display_name="Portal Patient",
        hashed_password="x",
        role="patient",
        package_id="explorer",
    )
    db.add(user)
    db.flush()
    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id="actor-clinician-demo",
        first_name="Portal",
        last_name="Patient",
        dob="1990-01-01",
        gender="prefer_not_to_say",
        email=email,
        primary_condition="Test",
        primary_modality="Test",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes="[TEST]",
    )
    db.add(patient)
    db.commit()
    return {"id": uid, "email": email, "role": "patient", "package_id": "explorer"}


# ── List items ────────────────────────────────────────────────────────────────


def test_list_items_empty(client: TestClient) -> None:
    """GET /items returns empty list when no items are seeded."""
    r = client.get("/api/v1/patient-portal/marketplace/items")
    assert r.status_code == 200, r.text
    assert r.json()["items"] == []


def test_list_items_returns_active(client: TestClient) -> None:
    """GET /items returns active items."""
    db: Session = SessionLocal()
    try:
        _seed_item(db, name="Active Product", active=True)
        _seed_item(db, name="Inactive Product", active=False)
    finally:
        db.close()

    r = client.get("/api/v1/patient-portal/marketplace/items")
    assert r.status_code == 200
    names = [i["name"] for i in r.json()["items"]]
    assert "Active Product" in names
    assert "Inactive Product" not in names


def test_list_items_kind_filter(client: TestClient) -> None:
    """GET /items?kind=service returns only service items."""
    db: Session = SessionLocal()
    try:
        _seed_item(db, name="Product Item", kind="product")
        _seed_item(db, name="Service Item", kind="service")
    finally:
        db.close()

    r = client.get("/api/v1/patient-portal/marketplace/items?kind=service")
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(i["kind"] == "service" for i in items)
    assert any(i["name"] == "Service Item" for i in items)


def test_list_items_featured_filter(client: TestClient) -> None:
    """GET /items?featured=true returns only featured items."""
    db: Session = SessionLocal()
    try:
        _seed_item(db, name="Featured Item", featured=True)
        _seed_item(db, name="Normal Item", featured=False)
    finally:
        db.close()

    r = client.get("/api/v1/patient-portal/marketplace/items?featured=true")
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(i["featured"] is True for i in items)


# ── Single item ───────────────────────────────────────────────────────────────


def test_get_item_404_unknown(client: TestClient) -> None:
    """GET /items/{id} returns 404 for unknown id."""
    r = client.get("/api/v1/patient-portal/marketplace/items/nonexistent-id-000")
    assert r.status_code == 404


def test_get_item_returns_detail(client: TestClient) -> None:
    """GET /items/{id} returns item detail for an active item."""
    db: Session = SessionLocal()
    try:
        item = _seed_item(db, name="Detail Item", kind="education")
        item_id = item.id
    finally:
        db.close()

    r = client.get(f"/api/v1/patient-portal/marketplace/items/{item_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "item" in body
    assert body["item"]["id"] == item_id
    assert body["item"]["name"] == "Detail Item"
    assert body["item"]["kind"] == "education"


def test_get_item_inactive_returns_404(client: TestClient) -> None:
    """GET /items/{id} returns 404 for an inactive item (not visible)."""
    db: Session = SessionLocal()
    try:
        item = _seed_item(db, name="Inactive Item", active=False)
        item_id = item.id
    finally:
        db.close()

    r = client.get(f"/api/v1/patient-portal/marketplace/items/{item_id}")
    assert r.status_code == 404


# ── Orders ────────────────────────────────────────────────────────────────────


def test_create_order_item_not_found(client: TestClient) -> None:
    """POST /orders with nonexistent item_id returns 404."""
    r = client.post(
        "/api/v1/patient-portal/marketplace/orders",
        json={"item_id": "nonexistent-item-id"},
        headers=PATIENT_HDR,
    )
    # actor-patient-demo without demo patient row → 404 patient_not_linked or 404 item
    assert r.status_code == 404


def test_create_order_clinician_has_no_patient(client: TestClient) -> None:
    """POST /orders as clinician (no patient record linked) returns 404."""
    db: Session = SessionLocal()
    try:
        item = _seed_item(db, name="Orderable Item")
        item_id = item.id
    finally:
        db.close()

    r = client.post(
        "/api/v1/patient-portal/marketplace/orders",
        json={"item_id": item_id},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_create_order_happy_path(client: TestClient) -> None:
    """POST /orders creates an order when patient + item exist."""
    from app.services.auth_service import create_access_token

    db: Session = SessionLocal()
    try:
        user_attrs = _seed_patient_user(db)
        item = _seed_item(db, name="Patient Orderable Item")
        item_id = item.id
    finally:
        db.close()

    token = create_access_token(
        user_id=user_attrs["id"],
        email=user_attrs["email"],
        role="patient",
        package_id="explorer",
        clinic_id=None,
    )
    hdrs = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/api/v1/patient-portal/marketplace/orders",
        json={"item_id": item_id, "patient_notes": "Please review for me"},
        headers=hdrs,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "order" in body
    order = body["order"]
    assert order["item_id"] == item_id
    assert order["status"] == "requested"
    assert order["patient_notes"] == "Please review for me"


def test_create_order_missing_item_id_422(client: TestClient) -> None:
    """POST /orders without item_id returns 422."""
    r = client.post(
        "/api/v1/patient-portal/marketplace/orders",
        json={},
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


def test_my_orders_no_patient_returns_404(client: TestClient) -> None:
    """GET /my-orders without a linked patient record returns 404."""
    r = client.get("/api/v1/patient-portal/marketplace/my-orders", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_my_orders_happy_path(client: TestClient) -> None:
    """GET /my-orders returns empty list for a patient with no orders."""
    from app.services.auth_service import create_access_token

    db: Session = SessionLocal()
    try:
        user_attrs = _seed_patient_user(db)
    finally:
        db.close()

    token = create_access_token(
        user_id=user_attrs["id"],
        email=user_attrs["email"],
        role="patient",
        package_id="explorer",
        clinic_id=None,
    )
    hdrs = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/v1/patient-portal/marketplace/my-orders", headers=hdrs)
    assert r.status_code == 200, r.text
    assert r.json()["orders"] == []

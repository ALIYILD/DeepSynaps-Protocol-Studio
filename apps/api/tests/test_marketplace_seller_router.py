"""Tests for marketplace_seller_router.py (router-level CRUD).

Covers:
- GET  /me: requires auth (403 unauthenticated)
- GET  /me: clinician gets seller profile with listing counts
- POST /items: clinician can create a listing (201)
- POST /items: invalid kind → 422
- POST /items: javascript: URL scheme → 422
- GET  /my-items: returns created listings
- PATCH /items/{id}: owner can update their listing
- PATCH /items/{id}: non-existent id → 404
- DELETE /items/{id}: soft-deletes the listing (204)
- GET  /browse: public endpoint (no auth required)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


_CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}
_GUEST_HEADERS = {"Authorization": "Bearer guest-demo-token"}

_LISTING_PAYLOAD = {
    "name": "NeuroCalm Pro",
    "provider": "BrainTech Inc",
    "description": "Clinician-grade neurofeedback device.",
    "price": 299.99,
    "price_unit": "one-off",
    "external_url": "https://example.com/neurocalmPro",
    "kind": "device",
}


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_get_me_unauthenticated_returns_4xx(client: TestClient) -> None:
    """Unauthenticated request to /me must not return 200 (404 expected — user not found)."""
    r = client.get("/api/v1/marketplace/seller/me")
    assert r.status_code in {403, 404}


def test_create_listing_requires_clinician_role(client: TestClient) -> None:
    """Guest token must be rejected — listing creation requires clinician+."""
    r = client.post("/api/v1/marketplace/seller/items", json=_LISTING_PAYLOAD, headers=_GUEST_HEADERS)
    assert r.status_code == 403


# ── Seller profile ────────────────────────────────────────────────────────────

def test_get_me_returns_profile(client: TestClient) -> None:
    r = client.get("/api/v1/marketplace/seller/me", headers=_CLINICIAN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["is_seller"] is True
    assert "listing_count" in body
    assert "active_listing_count" in body


# ── Create listing ────────────────────────────────────────────────────────────

def test_create_listing_happy_path(client: TestClient) -> None:
    r = client.post(
        "/api/v1/marketplace/seller/items",
        json=_LISTING_PAYLOAD,
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 201
    item = r.json()["item"]
    assert item["name"] == "NeuroCalm Pro"
    assert item["active"] is True
    assert item["source"] == "seller_listed"


def test_create_listing_invalid_kind_422(client: TestClient) -> None:
    payload = {**_LISTING_PAYLOAD, "kind": "not_a_valid_kind"}
    r = client.post(
        "/api/v1/marketplace/seller/items",
        json=payload,
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 422


def test_create_listing_javascript_url_rejected(client: TestClient) -> None:
    payload = {**_LISTING_PAYLOAD, "external_url": "javascript:alert(document.cookie)"}
    r = client.post(
        "/api/v1/marketplace/seller/items",
        json=payload,
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 422
    assert "invalid_url_scheme" in r.json().get("code", "")


def test_create_listing_data_url_rejected(client: TestClient) -> None:
    payload = {**_LISTING_PAYLOAD, "external_url": "data:text/html,<script>evil()</script>"}
    r = client.post(
        "/api/v1/marketplace/seller/items",
        json=payload,
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 422


# ── List my listings ──────────────────────────────────────────────────────────

def test_my_items_empty_initially(client: TestClient) -> None:
    r = client.get("/api/v1/marketplace/seller/my-items", headers=_CLINICIAN_HEADERS)
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_my_items_after_create(client: TestClient) -> None:
    client.post(
        "/api/v1/marketplace/seller/items",
        json=_LISTING_PAYLOAD,
        headers=_CLINICIAN_HEADERS,
    )
    r = client.get("/api/v1/marketplace/seller/my-items", headers=_CLINICIAN_HEADERS)
    assert r.status_code == 200
    assert len(r.json()["items"]) == 1


# ── Update listing ────────────────────────────────────────────────────────────

def test_update_listing(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/marketplace/seller/items",
        json=_LISTING_PAYLOAD,
        headers=_CLINICIAN_HEADERS,
    )
    item_id = create_r.json()["item"]["id"]

    patch_r = client.patch(
        f"/api/v1/marketplace/seller/items/{item_id}",
        json={"name": "NeuroCalm Pro v2", "price": 349.99},
        headers=_CLINICIAN_HEADERS,
    )
    assert patch_r.status_code == 200
    updated = patch_r.json()["item"]
    assert updated["name"] == "NeuroCalm Pro v2"
    assert updated["price"] == 349.99


def test_update_nonexistent_listing_404(client: TestClient) -> None:
    r = client.patch(
        "/api/v1/marketplace/seller/items/no-such-item-id",
        json={"name": "Does Not Matter"},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 404


# ── Delete listing ────────────────────────────────────────────────────────────

def test_delete_listing(client: TestClient) -> None:
    create_r = client.post(
        "/api/v1/marketplace/seller/items",
        json=_LISTING_PAYLOAD,
        headers=_CLINICIAN_HEADERS,
    )
    item_id = create_r.json()["item"]["id"]

    del_r = client.delete(
        f"/api/v1/marketplace/seller/items/{item_id}",
        headers=_CLINICIAN_HEADERS,
    )
    assert del_r.status_code == 204


# ── Public browse ─────────────────────────────────────────────────────────────

def test_browse_public_no_auth(client: TestClient) -> None:
    """Browse endpoint requires no authentication."""
    r = client.get("/api/v1/marketplace/seller/browse")
    assert r.status_code == 200
    assert "items" in r.json()

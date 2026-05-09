"""Tests for leads_reception_router — /api/v1/leads and /api/v1/reception.

Tests cover:
- GET  /leads returns empty list initially
- POST /leads creates a lead and returns it (201)
- POST /leads missing required 'name' returns 422
- GET  /leads returns the created lead
- PATCH /leads/{id} updates stage and returns updated lead
- PATCH /leads/{id} 404 for unknown id
- DELETE /leads/{id} removes the lead (204)
- DELETE /leads/{id} 404 for unknown id
- GET  /reception/calls returns empty list initially
- POST /reception/calls creates a call record (201)
- GET  /reception/tasks returns empty list initially
- POST /reception/tasks creates a task record (201)
- PATCH /reception/tasks/{id} marks task done
- All endpoints require clinician role (guest gets 403)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}


# ── Leads ─────────────────────────────────────────────────────────────────────


def test_list_leads_empty(client: TestClient) -> None:
    """GET /leads returns empty list when no leads exist."""
    r = client.get("/api/v1/leads", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert body["items"] == []
    assert body["total"] == 0


def test_create_lead_returns_201(client: TestClient) -> None:
    """POST /leads creates a lead and returns 201 with the new record."""
    payload = {
        "name": "Jane Prospect",
        "email": "jane@example.com",
        "phone": "+44 7700 900001",
        "source": "website",
        "condition": "anxiety",
        "stage": "new",
    }
    r = client.post("/api/v1/leads", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Jane Prospect"
    assert body["source"] == "website"
    assert body["stage"] == "new"
    assert "id" in body
    assert body["clinician_id"] == "actor-clinician-demo"


def test_create_lead_missing_name_returns_422(client: TestClient) -> None:
    """POST /leads without required 'name' field returns 422."""
    r = client.post("/api/v1/leads", json={"email": "noname@example.com"}, headers=CLINICIAN_HDR)
    assert r.status_code == 422


def test_list_leads_returns_created(client: TestClient) -> None:
    """GET /leads returns the lead created by this clinician."""
    client.post(
        "/api/v1/leads",
        json={"name": "List Test Lead", "source": "phone"},
        headers=CLINICIAN_HDR,
    )
    r = client.get("/api/v1/leads", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    names = [item["name"] for item in r.json()["items"]]
    assert "List Test Lead" in names


def test_list_leads_stage_filter(client: TestClient) -> None:
    """GET /leads?stage=qualified returns only qualified leads."""
    client.post("/api/v1/leads", json={"name": "Qualified Lead", "stage": "qualified"}, headers=CLINICIAN_HDR)
    client.post("/api/v1/leads", json={"name": "New Lead", "stage": "new"}, headers=CLINICIAN_HDR)
    r = client.get("/api/v1/leads?stage=qualified", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(item["stage"] == "qualified" for item in items)


def test_patch_lead_updates_stage(client: TestClient) -> None:
    """PATCH /leads/{id} updates stage on the lead."""
    create_r = client.post(
        "/api/v1/leads",
        json={"name": "To Update", "stage": "new"},
        headers=CLINICIAN_HDR,
    )
    lead_id = create_r.json()["id"]
    r = client.patch(
        f"/api/v1/leads/{lead_id}",
        json={"stage": "qualified"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "qualified"


def test_patch_lead_404_unknown(client: TestClient) -> None:
    """PATCH /leads/{id} returns 404 for unknown id."""
    r = client.patch(
        "/api/v1/leads/LEAD-nonexistent",
        json={"stage": "lost"},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_delete_lead_returns_204(client: TestClient) -> None:
    """DELETE /leads/{id} removes the lead and returns 204."""
    create_r = client.post(
        "/api/v1/leads",
        json={"name": "To Delete", "stage": "new"},
        headers=CLINICIAN_HDR,
    )
    lead_id = create_r.json()["id"]
    r = client.delete(f"/api/v1/leads/{lead_id}", headers=CLINICIAN_HDR)
    assert r.status_code == 204


def test_delete_lead_404_unknown(client: TestClient) -> None:
    """DELETE /leads/{id} returns 404 for unknown id."""
    r = client.delete("/api/v1/leads/LEAD-nonexistent", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_leads_requires_clinician_role(client: TestClient) -> None:
    """GET /leads with guest role must be forbidden."""
    r = client.get("/api/v1/leads", headers=GUEST_HDR)
    assert r.status_code == 403


# ── Reception calls ──────────────────────────────────────────────────────────


def test_list_calls_empty(client: TestClient) -> None:
    """GET /reception/calls returns empty list initially."""
    r = client.get("/api/v1/reception/calls", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_call_returns_201(client: TestClient) -> None:
    """POST /reception/calls creates a call log and returns 201."""
    payload = {
        "name": "John Smith",
        "phone": "+44 7700 900002",
        "direction": "inbound",
        "duration": 120,
        "outcome": "appointment-booked",
        "call_date": "2026-05-09",
    }
    r = client.post("/api/v1/reception/calls", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "John Smith"
    assert body["direction"] == "inbound"
    assert body["clinician_id"] == "actor-clinician-demo"


def test_calls_requires_clinician_role(client: TestClient) -> None:
    """GET /reception/calls with guest role must be forbidden."""
    r = client.get("/api/v1/reception/calls", headers=GUEST_HDR)
    assert r.status_code == 403


# ── Reception tasks ──────────────────────────────────────────────────────────


def test_list_tasks_empty(client: TestClient) -> None:
    """GET /reception/tasks returns empty list initially."""
    r = client.get("/api/v1/reception/tasks", headers=CLINICIAN_HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_create_task_returns_201(client: TestClient) -> None:
    """POST /reception/tasks creates a task and returns 201."""
    payload = {
        "text": "Call back Mrs Baker re: TMS scheduling",
        "due": "2026-05-10",
        "priority": "high",
        "done": False,
    }
    r = client.post("/api/v1/reception/tasks", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["text"] == "Call back Mrs Baker re: TMS scheduling"
    assert body["done"] is False
    assert body["priority"] == "high"
    assert body["clinician_id"] == "actor-clinician-demo"


def test_patch_task_marks_done(client: TestClient) -> None:
    """PATCH /reception/tasks/{id} can mark a task as done."""
    create_r = client.post(
        "/api/v1/reception/tasks",
        json={"text": "Follow up call", "priority": "medium", "done": False},
        headers=CLINICIAN_HDR,
    )
    task_id = create_r.json()["id"]
    r = client.patch(
        f"/api/v1/reception/tasks/{task_id}",
        json={"done": True},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200, r.text
    assert r.json()["done"] is True


def test_patch_task_404_unknown(client: TestClient) -> None:
    """PATCH /reception/tasks/{id} returns 404 for unknown task id."""
    r = client.patch(
        "/api/v1/reception/tasks/TASK-nonexistent",
        json={"done": True},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_tasks_requires_clinician_role(client: TestClient) -> None:
    """GET /reception/tasks with guest role must be forbidden."""
    r = client.get("/api/v1/reception/tasks", headers=GUEST_HDR)
    assert r.status_code == 403

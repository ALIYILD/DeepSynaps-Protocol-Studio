"""Tests for leads_reception_router.

Covers:
  - GET /api/v1/leads: auth gate + empty list shape
  - POST /api/v1/leads: happy path + 422 for missing required field
  - PATCH /api/v1/leads/{id}: update stage + 404 on missing
  - DELETE /api/v1/leads/{id}: happy path + 404 second delete
  - GET /api/v1/reception/calls: auth gate + empty list
  - POST /api/v1/reception/calls: happy path + 422 missing call_date
  - GET /api/v1/reception/tasks: auth gate + empty list
  - POST /api/v1/reception/tasks: happy path + 422 missing text
  - PATCH /api/v1/reception/tasks/{id}: update done flag
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
NO_AUTH: dict = {}


# ── helpers ───────────────────────────────────────────────────────────────────

def _create_lead(name: str = "Test Lead") -> dict:
    r = client.post("/api/v1/leads", json={
        "name": name,
        "source": "phone",
        "stage": "new",
    }, headers=CLINICIAN)
    assert r.status_code == 201, r.text
    return r.json()


def _create_call() -> dict:
    r = client.post("/api/v1/reception/calls", json={
        "name": "John Caller",
        "direction": "inbound",
        "duration": 120,
        "outcome": "info-given",
        "call_date": "2026-05-09",
    }, headers=CLINICIAN)
    assert r.status_code == 201, r.text
    return r.json()


def _create_task(text: str = "Follow up with patient") -> dict:
    r = client.post("/api/v1/reception/tasks", json={
        "text": text,
        "priority": "medium",
    }, headers=CLINICIAN)
    assert r.status_code == 201, r.text
    return r.json()


# ── leads auth gates ──────────────────────────────────────────────────────────

def test_list_leads_requires_auth():
    r = client.get("/api/v1/leads")
    assert r.status_code == 403


def test_create_lead_requires_auth():
    r = client.post("/api/v1/leads", json={"name": "Ghost Lead", "source": "phone", "stage": "new"})
    assert r.status_code == 403


# ── leads happy paths ─────────────────────────────────────────────────────────

def test_list_leads_empty():
    r = client.get("/api/v1/leads", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] == 0


def test_create_lead_happy_path():
    lead = _create_lead("Jane Prospect")
    assert lead["name"] == "Jane Prospect"
    assert lead["stage"] == "new"
    assert lead["source"] == "phone"
    assert "id" in lead


def test_create_lead_missing_name_422():
    r = client.post("/api/v1/leads", json={"source": "web", "stage": "new"}, headers=CLINICIAN)
    assert r.status_code == 422


def test_list_leads_after_create():
    _create_lead("Listed Lead")
    r = client.get("/api/v1/leads", headers=CLINICIAN)
    assert r.json()["total"] >= 1


def test_list_leads_filter_by_stage():
    _create_lead("Qualified Lead")
    # Patch it to qualified stage.
    lead = _create_lead("Qualified Lead 2")
    client.patch(f"/api/v1/leads/{lead['id']}", json={"stage": "qualified"}, headers=CLINICIAN)
    r = client.get("/api/v1/leads", params={"stage": "qualified"}, headers=CLINICIAN)
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["stage"] == "qualified"


def test_update_lead_stage():
    lead = _create_lead("Updateable Lead")
    r = client.patch(f"/api/v1/leads/{lead['id']}", json={"stage": "contacted"}, headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["stage"] == "contacted"


def test_update_lead_not_found_404():
    r = client.patch("/api/v1/leads/no-such-lead", json={"stage": "contacted"}, headers=CLINICIAN)
    assert r.status_code == 404


def test_delete_lead_happy_path():
    lead = _create_lead("Deleteable Lead")
    r = client.delete(f"/api/v1/leads/{lead['id']}", headers=CLINICIAN)
    assert r.status_code == 204


def test_delete_lead_not_found_404():
    r = client.delete("/api/v1/leads/no-such-lead", headers=CLINICIAN)
    assert r.status_code == 404


# ── reception calls ───────────────────────────────────────────────────────────

def test_list_calls_requires_auth():
    r = client.get("/api/v1/reception/calls")
    assert r.status_code == 403


def test_list_calls_empty():
    r = client.get("/api/v1/reception/calls", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert body["total"] == 0


def test_create_call_happy_path():
    call = _create_call()
    assert call["name"] == "John Caller"
    assert call["direction"] == "inbound"
    assert call["call_date"] == "2026-05-09"


def test_create_call_missing_call_date_422():
    r = client.post("/api/v1/reception/calls", json={
        "name": "Mystery Caller",
        "direction": "outbound",
    }, headers=CLINICIAN)
    assert r.status_code == 422


def test_list_calls_after_create():
    _create_call()
    r = client.get("/api/v1/reception/calls", headers=CLINICIAN)
    assert r.json()["total"] >= 1


# ── reception tasks ───────────────────────────────────────────────────────────

def test_list_tasks_requires_auth():
    r = client.get("/api/v1/reception/tasks")
    assert r.status_code == 403


def test_list_tasks_empty():
    r = client.get("/api/v1/reception/tasks", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


def test_create_task_happy_path():
    task = _create_task("Call back Mrs Smith")
    assert task["text"] == "Call back Mrs Smith"
    assert task["done"] is False
    assert task["priority"] == "medium"


def test_create_task_missing_text_422():
    r = client.post("/api/v1/reception/tasks", json={"priority": "high"}, headers=CLINICIAN)
    assert r.status_code == 422


def test_update_task_done_flag():
    task = _create_task("Mark done task")
    r = client.patch(f"/api/v1/reception/tasks/{task['id']}", json={"done": True}, headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["done"] is True


def test_update_task_not_found_404():
    r = client.patch("/api/v1/reception/tasks/no-such-task", json={"done": True}, headers=CLINICIAN)
    assert r.status_code == 404

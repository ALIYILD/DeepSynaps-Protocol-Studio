"""Happy-path + auth + edge-case tests for home_program_tasks_router.

Pins the following routes:
  GET    /api/v1/home-program-tasks
  POST   /api/v1/home-program-tasks
  GET    /api/v1/home-program-tasks/completions
  GET    /api/v1/home-program-tasks/by-server-id/{server_task_id}
  POST   /api/v1/home-program-tasks/audit-actions
  GET    /api/v1/home-program-tasks/{task_id}
  GET    /api/v1/home-program-tasks/{task_id}/patient-view
  GET    /api/v1/home-program-tasks/{task_id}/export-stub
  PUT    /api/v1/home-program-tasks/{task_id}
  DELETE /api/v1/home-program-tasks/{task_id}
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────

BASE = "/api/v1/home-program-tasks"


def _make_patient(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Task", "last_name": "Patient", "dob": "1990-05-15", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_task(client: TestClient, auth_headers: dict, patient_id: str, task_id: str = "task-001") -> dict:
    resp = client.post(
        BASE,
        json={"id": task_id, "patientId": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ── GET /api/v1/home-program-tasks ────────────────────────────────────────────

def test_list_tasks_empty(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(BASE, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_list_tasks_requires_auth(client: TestClient) -> None:
    resp = client.get(BASE)
    assert resp.status_code in (401, 403)


# ── POST /api/v1/home-program-tasks ───────────────────────────────────────────

def test_create_task_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    data = _create_task(client, auth_headers, pid, task_id="happy-task-1")
    assert data["id"] == "happy-task-1"
    assert data["patientId"] == pid
    assert "serverTaskId" in data


def test_create_task_idempotent_replay(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    d1 = _create_task(client, auth_headers, pid, task_id="replay-task-1")
    d2 = _create_task(client, auth_headers, pid, task_id="replay-task-1")
    # Both must return the same serverTaskId
    assert d1["serverTaskId"] == d2["serverTaskId"]
    # Second should be marked as replay
    assert d2.get("createDisposition") == "replay"


def test_create_task_missing_patient_id_422(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(BASE, json={"id": "no-patient"}, headers=auth_headers["clinician"])
    assert resp.status_code == 422


def test_create_task_missing_task_id_422(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    resp = client.post(BASE, json={"patientId": pid}, headers=auth_headers["clinician"])
    assert resp.status_code == 422


def test_create_task_requires_auth(client: TestClient) -> None:
    resp = client.post(BASE, json={"id": "x", "patientId": "y"})
    assert resp.status_code in (401, 403)


# ── GET /api/v1/home-program-tasks/completions ────────────────────────────────

def test_list_completions_empty(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(f"{BASE}/completions", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json() == []


# ── GET /api/v1/home-program-tasks/{task_id} ─────────────────────────────────

def test_get_task_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_task(client, auth_headers, pid, task_id="get-task-1")
    resp = client.get(f"{BASE}/get-task-1", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json()["id"] == "get-task-1"


def test_get_task_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(f"{BASE}/nonexistent-task-xyz", headers=auth_headers["clinician"])
    assert resp.status_code == 404


# ── GET /api/v1/home-program-tasks/{task_id}/patient-view ────────────────────

def test_patient_view_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_task(client, auth_headers, pid, task_id="pview-task-1")
    resp = client.get(f"{BASE}/pview-task-1/patient-view", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("id") == "pview-task-1"
    assert body.get("patientId") == pid


def test_patient_view_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(f"{BASE}/no-such-task/patient-view", headers=auth_headers["clinician"])
    assert resp.status_code == 404


# ── GET /api/v1/home-program-tasks/{task_id}/export-stub ─────────────────────

def test_export_stub_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_task(client, auth_headers, pid, task_id="export-task-1")
    resp = client.get(f"{BASE}/export-task-1/export-stub", headers=auth_headers["clinician"])
    assert resp.status_code == 200


# ── GET /api/v1/home-program-tasks/by-server-id/{server_task_id} ─────────────

def test_by_server_id_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    created = _create_task(client, auth_headers, pid, task_id="server-id-task-1")
    sid = created["serverTaskId"]
    resp = client.get(f"{BASE}/by-server-id/{sid}", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json()["id"] == "server-id-task-1"


def test_by_server_id_invalid_uuid_422(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(f"{BASE}/by-server-id/not-a-uuid", headers=auth_headers["clinician"])
    assert resp.status_code == 422


# ── PUT /api/v1/home-program-tasks/{task_id} ─────────────────────────────────

def test_put_update_increments_revision(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    created = _create_task(client, auth_headers, pid, task_id="put-task-1")
    initial_rev = created.get("serverRevision", 1)
    resp = client.put(
        f"{BASE}/put-task-1",
        json={
            "patientId": pid,
            "lastKnownServerRevision": initial_rev,
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (200, 201)
    updated = resp.json()
    assert int(updated.get("serverRevision", 0)) >= 2


# ── DELETE /api/v1/home-program-tasks/{task_id} ───────────────────────────────

def test_delete_task_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_task(client, auth_headers, pid, task_id="delete-task-1")
    resp = client.delete(f"{BASE}/delete-task-1", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json().get("status") == "deleted"


def test_delete_task_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.delete(f"{BASE}/nonexistent-del-task", headers=auth_headers["clinician"])
    assert resp.status_code == 404

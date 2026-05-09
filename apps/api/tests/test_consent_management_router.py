"""Happy-path + auth + edge-case tests for consent_management_router.

Pins the following routes:
  GET  /api/v1/consent/records
  POST /api/v1/consent/records
  PUT  /api/v1/consent/records/{id}
  GET  /api/v1/consent/audit-log
  POST /api/v1/consent/automation-rules
  GET  /api/v1/consent/automation-rules
  POST /api/v1/consent/compliance-score
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_patient(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Consent", "last_name": "Patient", "dob": "1985-03-10", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_consent(client: TestClient, auth_headers: dict, patient_id: str, **overrides) -> dict:
    payload = {
        "patient_id": patient_id,
        "consent_type": "general",
        "signed": True,
        "status": "active",
        **overrides,
    }
    resp = client.post("/api/v1/consent/records", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── list records ──────────────────────────────────────────────────────────────

def test_list_records_empty_returns_zero(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/consent/records", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_list_records_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/consent/records")
    assert resp.status_code in (401, 403)


# ── create record ─────────────────────────────────────────────────────────────

def test_create_consent_record_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    data = _create_consent(client, auth_headers, pid)
    assert data["patient_id"] == pid
    assert data["consent_type"] == "general"
    assert data["signed"] is True
    assert data["status"] == "active"
    assert "id" in data


def test_create_consent_record_requires_auth(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    resp = client.post(
        "/api/v1/consent/records",
        json={"patient_id": pid, "consent_type": "general"},
    )
    assert resp.status_code in (401, 403)


def test_create_consent_record_guest_forbidden(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    resp = client.post(
        "/api/v1/consent/records",
        json={"patient_id": pid, "consent_type": "general"},
        headers=auth_headers["guest"],
    )
    assert resp.status_code in (401, 403)


def test_create_consent_record_with_notes(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    data = _create_consent(client, auth_headers, pid, notes="Patient verbally confirmed.", consent_type="research")
    assert data["notes"] == "Patient verbally confirmed."
    assert data["consent_type"] == "research"


# ── update (PUT) ──────────────────────────────────────────────────────────────

def test_update_consent_record_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    created = _create_consent(client, auth_headers, pid, signed=False, status="pending")
    cid = created["id"]

    resp = client.put(
        f"/api/v1/consent/records/{cid}",
        json={"signed": True, "status": "active"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["signed"] is True
    assert updated["status"] == "active"


def test_update_consent_record_not_found(client: TestClient, auth_headers: dict) -> None:
    resp = client.put(
        "/api/v1/consent/records/nonexistent-id",
        json={"status": "withdrawn"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


def test_update_consent_record_revoke(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    created = _create_consent(client, auth_headers, pid)
    cid = created["id"]

    resp = client.put(
        f"/api/v1/consent/records/{cid}",
        json={"status": "withdrawn"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "withdrawn"


# ── audit log ─────────────────────────────────────────────────────────────────

def test_audit_log_empty(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/consent/audit-log", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_audit_log_contains_created_event(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_consent(client, auth_headers, pid)

    resp = client.get("/api/v1/consent/audit-log", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    actions = {e["action"] for e in body["items"]}
    assert "created" in actions


# ── automation rules ──────────────────────────────────────────────────────────

def test_create_automation_rule_happy_path(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/consent/automation-rules",
        json={
            "name": "Auto-sign on intake",
            "trigger": "patient_intake",
            "action": "request_signature",
            "consent_types": ["general"],
            "active": True,
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Auto-sign on intake"
    assert data["trigger"] == "patient_intake"
    assert data["active"] is True


def test_list_automation_rules_returns_created(client: TestClient, auth_headers: dict) -> None:
    client.post(
        "/api/v1/consent/automation-rules",
        json={"name": "Rule A", "trigger": "manual", "action": "notify", "consent_types": []},
        headers=auth_headers["clinician"],
    )
    resp = client.get("/api/v1/consent/automation-rules", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    rules = resp.json()
    assert isinstance(rules, list)
    assert any(r["name"] == "Rule A" for r in rules)


# ── compliance score ──────────────────────────────────────────────────────────

def test_compliance_score_empty_db(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/consent/compliance-score",
        json={},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_patients_with_consent"] == 0
    assert body["compliance_pct"] == 0.0


def test_compliance_score_with_signed_consent(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_consent(client, auth_headers, pid, signed=True, status="active")

    resp = client.post(
        "/api/v1/consent/compliance-score",
        json={},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_patients_active_signed"] >= 1
    assert body["compliance_pct"] > 0


def test_compliance_score_filter_by_type(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(client, auth_headers)
    _create_consent(client, auth_headers, pid, signed=True, consent_type="research")

    resp = client.post(
        "/api/v1/consent/compliance-score",
        json={"consent_types": ["general"]},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    # Filtering by "general" should not include the "research" consent
    body = resp.json()
    assert body["breakdown"].get("research") is None

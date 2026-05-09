"""Tests for forms_router — set D (PR 76/N).

Covers:
  - GET  /api/v1/forms                     (list)
  - POST /api/v1/forms                     (create)
  - GET  /api/v1/forms/{id}                (get one)
  - POST /api/v1/forms/{id}/deploy         (deploy)
  - POST /api/v1/forms/{id}/submit         (submit)
  - GET  /api/v1/forms/submissions         (list submissions)
  - GET  /api/v1/forms/submissions/{id}    (get one submission)

Auth, role gates, 201 create, 404, 422, happy-path round-trip, scoring.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────


def _create_form(client: TestClient, auth_headers: dict, **overrides) -> dict:
    payload = {
        "title": "Test Form",
        "form_type": "custom",
        "questions": [],
        "status": "draft",
    }
    payload.update(overrides)
    r = client.post("/api/v1/forms", json=payload, headers=auth_headers["clinician"])
    assert r.status_code == 201, r.text
    return r.json()


def _seed_patient(*, patient_id: str) -> None:
    from app.database import SessionLocal
    from app.persistence.models import Patient
    db = SessionLocal()
    try:
        if db.query(Patient).filter_by(id=patient_id).first() is None:
            db.add(Patient(
                id=patient_id,
                clinician_id="actor-clinician-demo",
                first_name="Forms",
                last_name="Patient",
                dob="1990-01-01",
                email=None,
                phone=None,
                gender="prefer_not_to_say",
                primary_condition="MDD",
                primary_modality="tDCS",
                consent_signed=True,
                consent_date="2026-01-01",
                status="active",
                notes="[TEST]",
            ))
            db.commit()
    finally:
        db.close()


# ── GET /forms (list) ─────────────────────────────────────────────────────────


def test_list_forms_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/forms")
    assert r.status_code == 403


def test_list_forms_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/forms", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_list_forms_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/forms", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_forms_returns_own_forms(client: TestClient, auth_headers: dict) -> None:
    _create_form(client, auth_headers, title="My Form")
    r = client.get("/api/v1/forms", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_list_forms_filter_by_type(client: TestClient, auth_headers: dict) -> None:
    _create_form(client, auth_headers, title="Intake Form", form_type="intake")
    _create_form(client, auth_headers, title="Custom Form", form_type="custom")
    r = client.get("/api/v1/forms?form_type=intake", headers=auth_headers["clinician"])
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(f["form_type"] == "intake" for f in items)


# ── POST /forms (create) ──────────────────────────────────────────────────────


def test_create_form_requires_auth(client: TestClient) -> None:
    r = client.post("/api/v1/forms", json={"title": "Test"})
    assert r.status_code == 403


def test_create_form_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/forms",
        json={"title": "Test"},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_create_form_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/forms",
        json={"title": "PHQ-9 Clone", "form_type": "screening", "status": "draft"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert body["title"] == "PHQ-9 Clone"
    assert body["form_type"] == "screening"
    assert body["status"] == "draft"
    assert "id" in body
    assert body["clinician_id"] == "actor-clinician-demo"


def test_create_form_with_questions(client: TestClient, auth_headers: dict) -> None:
    questions = [
        {"id": "q1", "text": "How are you feeling?", "type": "scale", "min": 0, "max": 10}
    ]
    r = client.post(
        "/api/v1/forms",
        json={"title": "Wellbeing Check", "questions": questions},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    assert len(r.json()["questions"]) == 1


# ── GET /forms/{id} ───────────────────────────────────────────────────────────


def test_get_form_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/forms/some-id")
    assert r.status_code == 403


def test_get_form_missing_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/forms/does-not-exist", headers=auth_headers["clinician"])
    assert r.status_code == 404


def test_get_form_happy_path(client: TestClient, auth_headers: dict) -> None:
    form = _create_form(client, auth_headers, title="Readable Form")
    r = client.get(f"/api/v1/forms/{form['id']}", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["id"] == form["id"]


# ── POST /forms/{id}/deploy ───────────────────────────────────────────────────


def test_deploy_form_missing_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/forms/does-not-exist/deploy",
        json={"patient_ids": []},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_deploy_form_happy_path_activates(client: TestClient, auth_headers: dict) -> None:
    form = _create_form(client, auth_headers, title="Deploy Me", status="draft")
    r = client.post(
        f"/api/v1/forms/{form['id']}/deploy",
        json={"patient_ids": []},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["form_id"] == form["id"]
    # After deploy, fetching the form should show status=active
    get = client.get(f"/api/v1/forms/{form['id']}", headers=auth_headers["clinician"])
    assert get.json()["status"] == "active"


# ── POST /forms/{id}/submit ───────────────────────────────────────────────────


def test_submit_form_missing_form_is_404(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="forms-test-patient-001")
    r = client.post(
        "/api/v1/forms/does-not-exist/submit",
        json={"patient_id": "forms-test-patient-001", "responses": {}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_submit_form_happy_path(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="forms-test-patient-002")
    form = _create_form(client, auth_headers, title="Submit Me")
    r = client.post(
        f"/api/v1/forms/{form['id']}/submit",
        json={"patient_id": "forms-test-patient-002", "responses": {"q1": 3}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert body["form_id"] == form["id"]
    assert body["patient_id"] == "forms-test-patient-002"
    assert body["status"] in ("submitted", "scored")


def test_submit_form_with_scoring(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="forms-test-patient-003")
    scoring_rules = {
        "ranges": [
            {"min": 0, "max": 4, "label": "minimal"},
            {"min": 5, "max": 9, "label": "mild"},
        ]
    }
    form = _create_form(
        client, auth_headers, title="Scored Form", scoring=scoring_rules
    )
    r = client.post(
        f"/api/v1/forms/{form['id']}/submit",
        json={
            "patient_id": "forms-test-patient-003",
            "responses": {"q1": 2, "q2": 1},
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert body["score"] == "minimal"
    assert body["score_numeric"] == 3.0
    assert body["status"] == "scored"


# ── GET /forms/submissions ────────────────────────────────────────────────────


def test_list_submissions_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/forms/submissions")
    assert r.status_code == 403


def test_list_submissions_empty(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/forms/submissions", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_submissions_after_submit(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="forms-test-patient-004")
    form = _create_form(client, auth_headers, title="Listed Form")
    client.post(
        f"/api/v1/forms/{form['id']}/submit",
        json={"patient_id": "forms-test-patient-004", "responses": {}},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/forms/submissions", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── GET /forms/submissions/{id} ───────────────────────────────────────────────


def test_get_submission_missing_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/forms/submissions/does-not-exist", headers=auth_headers["clinician"])
    assert r.status_code == 404


def test_get_submission_happy_path(client: TestClient, auth_headers: dict) -> None:
    _seed_patient(patient_id="forms-test-patient-005")
    form = _create_form(client, auth_headers, title="Get Sub Form")
    sub = client.post(
        f"/api/v1/forms/{form['id']}/submit",
        json={"patient_id": "forms-test-patient-005", "responses": {}},
        headers=auth_headers["clinician"],
    ).json()
    r = client.get(f"/api/v1/forms/submissions/{sub['id']}", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["id"] == sub["id"]

"""Tests for the Reports router's JSON create/list endpoints.

POST /api/v1/reports  -> create a text-only clinician report
GET  /api/v1/reports  -> list current clinician's reports (newest first)
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Report", "last_name": "Patient"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_create_report_round_trip(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    body = {
        "patient_id": patient_id,
        "type": "clinician",
        "title": "Course 1 Treatment Summary — TMS Depression",
        "content": "PHQ-9 reduced from 22 to 8 over 20 sessions. Patient in remission.",
        "report_date": "2026-04-10",
        "source": "Dr. Okonkwo",
        "status": "generated",
    }
    r = client.post("/api/v1/reports", json=body, headers=auth_headers["clinician"])
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["id"]
    assert out["title"] == body["title"]
    assert out["type"] == "clinician"
    assert out["content"] == body["content"]
    assert out["date"] == body["report_date"]
    assert out["source"] == body["source"]
    assert out["status"] == "generated"
    assert "T" in out["created_at"]


def test_list_reports_newest_first(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    for title in ["Intake #1", "Progress #2", "Discharge #3"]:
        r = client.post(
            "/api/v1/reports",
            json={"patient_id": patient_id, "type": "progress", "title": title, "content": "body"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 201, r.text
    r = client.get("/api/v1/reports", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] == 3
    titles = [item["title"] for item in data["items"]]
    assert titles == ["Discharge #3", "Progress #2", "Intake #1"]


def test_clinician_cannot_see_other_clinician_reports(
    client: TestClient, auth_headers: dict
):
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Mine"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text

    admin_list = client.get("/api/v1/reports", headers=auth_headers["admin"])
    assert admin_list.status_code == 200
    assert admin_list.json()["total"] >= 1

    # Insert a row directly owned by a different clinician id.
    from app.database import get_db_session
    from app.persistence.models import PatientMediaUpload
    import uuid

    gen = get_db_session()
    db = next(gen)
    try:
        db.add(PatientMediaUpload(
            id=str(uuid.uuid4()),
            patient_id="other-patient",
            uploaded_by="clinician-other-demo",
            media_type="text",
            file_ref=None,
            text_content="should not leak",
            patient_note='{"title":"Other clinician report","report_type":"clinician"}',
            status="generated",
        ))
        db.commit()
    finally:
        try:
            next(gen)
        except StopIteration:
            pass

    r = client.get("/api/v1/reports", headers=auth_headers["clinician"])
    assert r.status_code == 200
    own_titles = [item["title"] for item in r.json()["items"]]
    assert "Mine" in own_titles
    assert "Other clinician report" not in own_titles


def test_create_requires_clinician_role(client: TestClient, auth_headers: dict):
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "should 403"},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403, r.text


def test_list_with_since_filter_future(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    r = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Recent"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    r2 = client.get(
        "/api/v1/reports?since=2099-01-01T00:00:00Z",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    assert r2.json()["total"] == 0


def test_invalid_since_is_ignored_not_400(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Alive"},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/reports?since=not-a-date", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_create_report_without_patient_id_is_rejected(client: TestClient, auth_headers: dict):
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "No patient"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422, r.text


def test_ai_summary_requires_report_owner(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)
    own = client.post(
        "/api/v1/reports",
        json={"patient_id": patient_id, "type": "clinician", "title": "Owned report", "content": "body"},
        headers=auth_headers["clinician"],
    )
    assert own.status_code == 201, own.text
    report_id = own.json()["id"]

    other = client.post(
        "/api/v1/auth/register",
        json={
            "email": "report-other@example.com",
            "display_name": "Other Clinician",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert other.status_code in (200, 201), other.text
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    denied = client.post(f"/api/v1/reports/{report_id}/ai-summary", headers=other_headers)
    assert denied.status_code == 404, denied.text


def test_ai_summary_requires_patient_access(client: TestClient, auth_headers: dict):
    patient_id = _create_patient(client, auth_headers)

    report = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "Scoped report", "patient_id": patient_id, "content": "body"},
        headers=auth_headers["clinician"],
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]

    other = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"report-scope-{uuid.uuid4().hex[:8]}@example.com",
            "display_name": "Other Clinician",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert other.status_code in (200, 201), other.text
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    denied = client.post(f"/api/v1/reports/{report_id}/ai-summary", headers=other_headers)
    assert denied.status_code == 404, denied.text

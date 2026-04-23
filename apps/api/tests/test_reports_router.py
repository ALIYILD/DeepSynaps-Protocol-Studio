"""Tests for the Reports router's JSON create/list endpoints.

POST /api/v1/reports  -> create a text-only clinician report
GET  /api/v1/reports  -> list current clinician's reports (newest first)
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_report_round_trip(client: TestClient, auth_headers: dict):
    body = {
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
    for title in ["Intake #1", "Progress #2", "Discharge #3"]:
        r = client.post(
            "/api/v1/reports",
            json={"type": "progress", "title": title, "content": "body"},
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
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "Mine"},
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
    r = client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "Recent"},
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
    client.post(
        "/api/v1/reports",
        json={"type": "clinician", "title": "Alive"},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/reports?since=not-a-date", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1

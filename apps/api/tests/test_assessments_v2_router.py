"""Assessments v2 router tests.

Focus: safety, licensing gates, clinic isolation, and honest evidence status.

These tests intentionally avoid verifying proprietary scoring cutoffs or
embedding copyrighted items. They only verify governance and API behavior.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth_headers: dict, *, email: str = "v2_patient@example.com") -> str:
    r = client.post(
        "/api/v1/patients",
        json={"first_name": "V2", "last_name": "Patient", "dob": "1985-01-01", "gender": "F", "email": email},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_library_lists_templates_with_licensing(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/assessments-v2/library", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 5
    items = {x["id"]: x for x in body["items"]}
    assert "phq9" in items
    assert "isi" in items
    assert items["phq9"]["fillable_in_platform"] is True
    assert items["isi"]["fillable_in_platform"] is False
    assert items["isi"]["licence_status"] in ("proprietary", "unknown")


def test_assign_and_queue_roundtrip(client: TestClient, auth_headers: dict) -> None:
    patient_id = _create_patient(client, auth_headers, email="v2_assign@example.com")
    created = client.post(
        f"/api/v1/assessments-v2/patients/{patient_id}/assign",
        json={"assessment_id": "phq9", "phase": "baseline", "due_date": "2026-05-01"},
        headers=auth_headers["clinician"],
    )
    assert created.status_code == 201, created.text
    aid = created.json()["assignment_id"]

    q = client.get(f"/api/v1/assessments-v2/patients/{patient_id}/queue", headers=auth_headers["clinician"])
    assert q.status_code == 200, q.text
    ids = [x["assignment_id"] for x in q.json()["items"]]
    assert aid in ids


def test_form_endpoint_blocks_restricted_item_text(client: TestClient, auth_headers: dict) -> None:
    patient_id = _create_patient(client, auth_headers, email="v2_form@example.com")
    created = client.post(
        f"/api/v1/assessments-v2/patients/{patient_id}/assign",
        json={"assessment_id": "isi"},
        headers=auth_headers["clinician"],
    )
    assert created.status_code == 201, created.text
    assignment_id = created.json()["assignment_id"]

    form = client.get(f"/api/v1/assessments-v2/assignments/{assignment_id}/form", headers=auth_headers["clinician"])
    assert form.status_code == 200, form.text
    body = form.json()
    assert body["access"]["fillable_in_platform"] is False
    assert body["access"]["score_only"] is True
    # Must not embed full item text. Template must be omitted for restricted.
    assert body["template"] is None


def test_score_endpoint_refuses_when_items_missing(client: TestClient, auth_headers: dict) -> None:
    patient_id = _create_patient(client, auth_headers, email="v2_score@example.com")
    created = client.post(
        f"/api/v1/assessments-v2/patients/{patient_id}/assign",
        json={"assessment_id": "phq9"},
        headers=auth_headers["clinician"],
    )
    assert created.status_code == 201, created.text
    assignment_id = created.json()["assignment_id"]

    scored = client.post(
        f"/api/v1/assessments-v2/assignments/{assignment_id}/score",
        headers=auth_headers["clinician"],
    )
    assert scored.status_code == 400
    assert scored.json()["code"] in ("missing_items", "score_unavailable")


def test_evidence_health_is_honest_when_db_missing(client: TestClient, auth_headers: dict, monkeypatch) -> None:
    # Force the evidence db to be unavailable for this test.
    monkeypatch.setenv("EVIDENCE_DB_PATH", "/tmp/does-not-exist-evidence.db")
    r = client.get("/api/v1/assessments-v2/evidence/health", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["local_corpus_available"] is False


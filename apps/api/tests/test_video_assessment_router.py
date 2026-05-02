"""Video assessment API — session CRUD, upload, clinician GET."""
from __future__ import annotations

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient

# Minimal WebM header (Matroska EBML) — passes looks_like_video
_WEBM_HEAD = b"\x1a\x45\xdf\xa3" + b"\x00" * 100


@pytest.fixture
def demo_patient_va() -> str:
    db = SessionLocal()
    try:
        pid = str(uuid.uuid4())
        p = Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="VA",
            last_name="Patient",
            email="patient@demo.com",
            consent_signed=True,
            status="active",
            notes=None,
        )
        db.add(p)
        db.commit()
        return pid
    finally:
        db.close()


def test_patient_create_and_patch_session(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va  # ensures patient row exists for demo token
    r = client.post(
        "/api/v1/video-assessments/sessions",
        headers=auth_headers["patient"],
        json={},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    sid = doc["id"]
    assert doc["protocol_name"]
    assert len(doc["tasks"]) == 16

    r2 = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "skipped",
                    "skip_reason": "patient_pref",
                }
            ]
        },
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["summary"]["tasks_skipped"] >= 1


def test_clinician_lists_sessions(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = r.json()["id"]
    lst = client.get("/api/v1/video-assessments/sessions", headers=auth_headers["clinician"])
    assert lst.status_code == 200, lst.text
    ids = [x["id"] for x in lst.json().get("items", [])]
    assert sid in ids


def test_clinician_can_finalize(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post(
        "/api/v1/video-assessments/sessions",
        headers=auth_headers["patient"],
        json={},
    )
    sid = r.json()["id"]

    fin = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={"clinician_impression": "Stable motor exam on video.", "recommended_followup": "Routine"},
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["overall_status"] == "finalized"


def test_upload_task_webm(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = r.json()["id"]

    up = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert up.status_code == 201, up.text
    data = up.json()
    assert data.get("recording_asset_id")

    vid = client.get(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/video",
        headers=auth_headers["clinician"],
    )
    assert vid.status_code == 200, vid.text
    assert "video" in (vid.headers.get("content-type") or "")

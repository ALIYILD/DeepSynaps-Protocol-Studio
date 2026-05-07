"""Video assessment API — session CRUD, upload, clinician GET."""
from __future__ import annotations

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import Patient
from app.routers import video_assessment_router

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
    assert doc.get("clinical_context", {}).get("preset_id") == "parkinsonism_followup"


def test_patient_create_with_clinical_context(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post(
        "/api/v1/video-assessments/sessions",
        headers=auth_headers["patient"],
        json={
            "clinical_context": {
                "preset_id": "essential_tremor",
                "custom_indication": "ET follow-up",
            }
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    sid = body["id"]
    assert body["clinical_context"]["preset_id"] == "essential_tremor"
    assert "ET" in body["clinical_context"].get("custom_indication", "")
    revision = body["revision_token"]

    r2 = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
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
    assert body["revision_token"] != revision


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
    revision = r.json()["revision_token"]

    fin = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": revision,
            "clinician_impression": "Stable motor exam on video.",
            "recommended_followup": "Routine",
        },
    )
    assert fin.status_code == 200, fin.text
    assert fin.json()["overall_status"] == "finalized"
    assert fin.json()["revision_token"] != revision


def test_export_json_endpoint(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = r.json()["id"]
    ex = client.get(
        f"/api/v1/video-assessments/sessions/{sid}/export.json",
        headers=auth_headers["clinician"],
    )
    assert ex.status_code == 200, ex.text
    assert ex.json().get("export_kind") == "video_assessment_session"


def test_finalize_blocks_patch(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = r.json()["id"]
    revision = r.json()["revision_token"]
    client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={"expected_revision": revision},
    )
    patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={"expected_revision": revision, "summary": {"clinician_impression": "x"}},
    )
    assert patch.status_code == 409, patch.text


def test_patient_patch_rejects_clinician_only_fields(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    revision = created.json()["revision_token"]

    patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "overall_status": "finalized",
            "completed_at": "2026-05-07T09:00:00Z",
            "summary": {
                "clinician_impression": "Patient self-approved this recording.",
                "recommended_followup": "None",
            },
            "safety_flags": ["rest_tremor"],
            "future_ai_metrics_placeholder": {"pose_metrics": {"speed": "fast"}},
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "accepted",
                    "skip_reason": "patient_pref",
                    "unsafe_flag": True,
                    "clinician_review": {
                        "reviewer_id": "actor-clinician-demo",
                        "reviewed_at": "2026-05-07T09:00:00Z",
                        "repeat_needed": "no",
                    },
                    "recording_asset_id": "asset-patient-forged",
                    "recording_storage_ref": "video_assessments/forged.webm",
                    "ai_analysis_status": "analyzed",
                }
            ],
        },
    )
    assert patch.status_code == 403, patch.text
    assert patch.json()["code"] == "patient_patch_forbidden"


def test_upload_task_webm(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = r.json()["id"]
    revision = r.json()["revision_token"]

    up = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert up.status_code == 201, up.text
    data = up.json()
    assert data.get("recording_asset_id")
    task = next(t for t in data["session"]["tasks"] if t["task_id"] == "rest_tremor")
    assert task["recording_status"] == "recorded"
    assert task["clinician_review"] is None
    assert data["session"]["summary"]["tasks_completed"] >= 1

    vid = client.get(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/video",
        headers=auth_headers["clinician"],
    )
    assert vid.status_code == 200, vid.text
    assert "video" in (vid.headers.get("content-type") or "")


def test_upload_replaces_stale_clinician_review(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    revision = created.json()["revision_token"]

    seeded = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": revision,
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "accepted",
                    "clinician_review": {
                        "reviewer_id": "actor-clinician-demo",
                        "reviewed_at": "2026-05-07T09:00:00Z",
                        "repeat_needed": "no",
                    },
                }
            ]
        },
    )
    assert seeded.status_code == 200, seeded.text
    revision = seeded.json()["revision_token"]

    up = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert up.status_code == 201, up.text
    task = next(t for t in up.json()["session"]["tasks"] if t["task_id"] == "rest_tremor")
    assert task["recording_status"] == "recorded"
    assert task["clinician_review"] is None


def test_patient_pending_review_counts_as_completed_summary(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    revision = created.json()["revision_token"]

    patched = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "pending_review",
                    "video_capture_meta": {"source": "browser_recording"},
                }
            ]
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["summary"]["tasks_completed"] >= 1


def test_upload_rejects_unknown_task_id(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    revision = created.json()["revision_token"]

    up = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/not_a_real_task/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert up.status_code == 404, up.text
    assert up.json()["code"] == "task_not_found"


def test_stale_patient_patch_returns_409(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    stale_revision = created.json()["revision_token"]

    fresh = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": stale_revision,
            "tasks": [{"task_id": "rest_tremor", "recording_status": "pending_review"}],
        },
    )
    assert fresh.status_code == 200, fresh.text

    stale = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": stale_revision,
            "tasks": [{"task_id": "postural_tremor", "recording_status": "skipped", "skip_reason": "patient_pref"}],
        },
    )
    assert stale.status_code == 409, stale.text
    body = stale.json()
    assert body["code"] == "session_conflict"
    assert body["details"]["session_id"] == sid
    assert body["details"]["revision_token"] == fresh.json()["revision_token"]


def test_stale_clinician_review_save_returns_409(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    stale_revision = created.json()["revision_token"]

    patient_update = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": stale_revision,
            "tasks": [{"task_id": "rest_tremor", "recording_status": "pending_review"}],
        },
    )
    assert patient_update.status_code == 200, patient_update.text

    stale = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": stale_revision,
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "clinician_review": {"reviewer_id": "actor-clinician-demo", "reviewed_at": "2026-05-07T09:00:00Z"},
                }
            ],
        },
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["code"] == "session_conflict"


def test_stale_finalize_returns_409(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    sid = created.json()["id"]
    stale_revision = created.json()["revision_token"]

    patient_update = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": stale_revision,
            "tasks": [{"task_id": "rest_tremor", "recording_status": "pending_review"}],
        },
    )
    assert patient_update.status_code == 200, patient_update.text

    stale = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={"expected_revision": stale_revision},
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["code"] == "session_conflict"


def test_full_persisted_workflow_lifecycle(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    assert created.status_code == 201, created.text
    session = created.json()
    sid = session["id"]
    revision = session["revision_token"]
    assert session["overall_status"] == "in_progress"

    upload = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert upload.status_code == 201, upload.text
    session = upload.json()["session"]
    revision = session["revision_token"]
    rest_task = next(t for t in session["tasks"] if t["task_id"] == "rest_tremor")
    assert rest_task["recording_status"] == "recorded"

    patient_patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "pending_review",
                    "video_capture_meta": {"source": "browser_recording"},
                }
            ],
        },
    )
    assert patient_patch.status_code == 200, patient_patch.text
    session = patient_patch.json()
    revision = session["revision_token"]
    assert session["summary"]["tasks_completed"] >= 1

    clinician_get = client.get(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
    )
    assert clinician_get.status_code == 200, clinician_get.text
    assert clinician_get.json()["revision_token"] == revision

    clinician_patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": revision,
            "tasks": [
                {
                    "task_id": "rest_tremor",
                    "recording_status": "accepted",
                    "clinician_review": {
                        "reviewer_id": "actor-clinician-demo",
                        "reviewed_at": "2026-05-07T09:00:00Z",
                        "repeat_needed": "no",
                        "video_quality": "good",
                    },
                }
            ],
            "summary": {
                "clinician_impression": "Stable motor exam on stored clip.",
                "recommended_followup": "Routine follow-up.",
            },
        },
    )
    assert clinician_patch.status_code == 200, clinician_patch.text
    session = clinician_patch.json()
    revision = session["revision_token"]
    assert session["summary"]["review_completion_percent"] >= 1
    assert session["summary"]["clinician_impression"] == "Stable motor exam on stored clip."

    finalized = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": revision,
            "clinician_impression": "Finalized stable motor assessment.",
            "recommended_followup": "Monitor longitudinally.",
        },
    )
    assert finalized.status_code == 200, finalized.text
    session = finalized.json()
    final_revision = session["revision_token"]
    assert session["overall_status"] == "finalized"
    assert session["finalized"] is True

    exported = client.get(
        f"/api/v1/video-assessments/sessions/{sid}/export.json",
        headers=auth_headers["clinician"],
    )
    assert exported.status_code == 200, exported.text
    exported_body = exported.json()
    assert exported_body["session"]["revision_token"] == final_revision
    assert exported_body["session"]["overall_status"] == "finalized"

    reloaded = client.get(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
    )
    assert reloaded.status_code == 200, reloaded.text
    assert reloaded.json()["overall_status"] == "finalized"
    assert reloaded.json()["revision_token"] == final_revision

    stale_after_finalize = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": final_revision,
            "tasks": [{"task_id": "postural_tremor", "recording_status": "skipped", "skip_reason": "patient_pref"}],
        },
    )
    assert stale_after_finalize.status_code == 409, stale_after_finalize.text
    assert stale_after_finalize.json()["code"] == "session_finalized"


def test_supervisor_audit_attribution_maps_to_clinician_role(monkeypatch, demo_patient_va: str) -> None:
    del demo_patient_va
    captured = {}

    def _fake_create_audit_event(db, **kwargs):
        captured.update(kwargs)
        return None

    monkeypatch.setattr(video_assessment_router, "create_audit_event", _fake_create_audit_event)
    db = SessionLocal()
    try:
        actor = AuthenticatedActor(
            actor_id="actor-supervisor-demo",
            display_name="Supervisor Demo",
            role="supervisor",
            package_id="enterprise",
            clinic_id="clinic-demo-default",
        )
        video_assessment_router._audit_va(
            db,
            actor=actor,
            action="session_read",
            target_id="va-session-demo",
            note="supervisor_fetch",
        )
    finally:
        db.close()

    assert captured["role"] == "clinician"

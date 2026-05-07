"""Video assessment API — session CRUD, upload, clinician GET."""
from __future__ import annotations

import io
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, Patient
from app.repositories.audit import create_audit_event
from app.repositories.video_assessments import VideoAssessmentSession
from app.routers import video_assessment_router

# Minimal WebM header (Matroska EBML) — passes looks_like_video
_WEBM_HEAD = b"\x1a\x45\xdf\xa3" + b"\x00" * 100


def _seed_historical_summary_event(
    session_id: str,
    *,
    actor_id: str = "actor-clinician-demo",
    actor_role: str = "clinician",
) -> str:
    event_id = f"va-historical-summary-test-{uuid.uuid4().hex[:12]}"
    db = SessionLocal()
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=session_id[:64],
            target_type="video_assessment",
            action="video_assessment.historical_ai_summary_generated",
            role=actor_role if actor_role in {"guest", "clinician", "admin"} else "clinician",
            actor_id=actor_id,
            note=json.dumps(
                {
                    "event_type": "historical_ai_summary_generated",
                    "event_id": event_id,
                    "session_id": session_id,
                    "actor_role": actor_role,
                    "selected_prior_session_ids": [],
                    "summary_logic_version": "video_assessment_historical_summary_v2",
                    "summary_status": "fresh",
                    "regeneration_reason": "fresh",
                    "provenance": {
                        "source_session_ids": [],
                        "session_count": 0,
                        "has_severity_data": False,
                        "has_task_completion_data": False,
                        "has_clip_availability_data": False,
                        "source_input_fingerprint": "fingerprint-seeded",
                    },
                },
                separators=(",", ":"),
                sort_keys=True,
            ),
            created_at="2026-05-07T12:00:00Z",
        )
        return event_id
    finally:
        db.close()


def _seed_video_assessment_row(
    patient_id: str,
    *,
    session_id: str | None = None,
    preset_id: str = "parkinsonism_followup",
    overall_status: str = "in_progress",
    with_clip: bool = False,
    clinician_impression: str | None = None,
    updated_offset_minutes: int = 0,
    mutate_doc=None,
) -> str:
    db = SessionLocal()
    try:
        doc = video_assessment_router._new_session_document(
            patient_id=patient_id,
            encounter_id=None,
            consent=None,
        )
        sid = session_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc) + timedelta(minutes=updated_offset_minutes)
        doc["id"] = sid
        doc["clinical_context"]["preset_id"] = preset_id
        if with_clip:
            task = doc["tasks"][0]
            task["recording_status"] = "accepted"
            task["recording_asset_id"] = f"asset-{sid}"
            task["recording_storage_ref"] = f"video_assessments/{patient_id}/{sid}/{task['task_id']}.webm"
        if clinician_impression:
            doc["summary"]["clinician_impression"] = clinician_impression
        doc["overall_status"] = overall_status
        doc["completed_at"] = now.isoformat() if overall_status == "finalized" else None
        if mutate_doc is not None:
            mutate_doc(doc)
        video_assessment_router._recalc_summary(doc)
        row = VideoAssessmentSession(
            id=sid,
            patient_id=patient_id,
            encounter_id=None,
            protocol_name=doc["protocol_name"],
            protocol_version=doc["protocol_version"],
            overall_status=overall_status,
            session_json=json.dumps(doc, separators=(",", ":"), default=str),
        )
        row.updated_at = now
        db.add(row)
        db.commit()
        return sid
    finally:
        db.close()


def _mutate_video_assessment_row(session_id: str, mutate_doc) -> None:
    db = SessionLocal()
    try:
        row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == session_id).first()
        assert row is not None
        doc = json.loads(row.session_json or "{}")
        mutate_doc(doc)
        video_assessment_router._recalc_summary(doc)
        row.session_json = json.dumps(doc, separators=(",", ":"), default=str)
        db.commit()
    finally:
        db.close()


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
    revision = body["revision_token"]
    assert body["clinical_context"]["preset_id"] == "essential_tremor"
    assert "ET" in body["clinical_context"].get("custom_indication", "")

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
    body = r.json()
    sid = body["id"]
    revision = body["revision_token"]

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
    body = r.json()
    sid = body["id"]
    revision = body["revision_token"]
    fin = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={"expected_revision": revision},
    )
    assert fin.status_code == 200, fin.text
    finalized_revision = fin.json()["revision_token"]
    patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={"expected_revision": finalized_revision, "summary": {"clinician_impression": "x"}},
    )
    assert patch.status_code == 409, patch.text


def test_upload_task_webm(client: TestClient, auth_headers: dict, demo_patient_va: str) -> None:
    del demo_patient_va
    r = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    body = r.json()
    sid = body["id"]
    revision = body["revision_token"]

    up = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
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


def test_patch_session_advances_revision_token(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    assert created.status_code == 201, created.text
    body = created.json()
    sid = body["id"]
    revision = body["revision_token"]

    patched = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "summary": {"clinician_impression": "Patient added draft note."},
        },
    )
    assert patched.status_code == 200, patched.text
    patched_body = patched.json()
    assert patched_body["revision_token"] != revision
    assert patched_body["updated_at"]
    assert patched_body["summary"]["clinician_impression"] == "Patient added draft note."


def test_stale_patient_patch_returns_session_conflict(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    assert created.status_code == 201, created.text
    body = created.json()
    sid = body["id"]
    revision = body["revision_token"]

    first_patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "tasks": [{"task_id": "rest_tremor", "recording_status": "skipped", "skip_reason": "patient_pref"}],
        },
    )
    assert first_patch.status_code == 200, first_patch.text
    current_revision = first_patch.json()["revision_token"]

    stale_patch = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "summary": {"clinician_impression": "stale write"},
        },
    )
    assert stale_patch.status_code == 409, stale_patch.text
    payload = stale_patch.json()
    assert payload["code"] == "session_conflict"
    assert payload["details"]["session_id"] == sid
    assert payload["details"]["current_revision"] == current_revision
    assert payload["details"]["finalized"] is False


def test_stale_clinician_finalize_returns_session_conflict(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    assert created.status_code == 201, created.text
    body = created.json()
    sid = body["id"]
    revision = body["revision_token"]

    patch_resp = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["clinician"],
        json={
            "expected_revision": revision,
            "summary": {"clinician_impression": "newer clinician draft"},
        },
    )
    assert patch_resp.status_code == 200, patch_resp.text
    current_revision = patch_resp.json()["revision_token"]

    stale_finalize = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/finalize",
        headers=auth_headers["clinician"],
        json={"expected_revision": revision},
    )
    assert stale_finalize.status_code == 409, stale_finalize.text
    payload = stale_finalize.json()
    assert payload["code"] == "session_conflict"
    assert payload["details"]["session_id"] == sid
    assert payload["details"]["current_revision"] == current_revision


def test_stale_patient_upload_returns_session_conflict(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    del demo_patient_va
    created = client.post("/api/v1/video-assessments/sessions", headers=auth_headers["patient"], json={})
    assert created.status_code == 201, created.text
    body = created.json()
    sid = body["id"]
    revision = body["revision_token"]

    patch_resp = client.patch(
        f"/api/v1/video-assessments/sessions/{sid}",
        headers=auth_headers["patient"],
        json={
            "expected_revision": revision,
            "tasks": [{"task_id": "rest_tremor", "recording_status": "skipped", "skip_reason": "patient_pref"}],
        },
    )
    assert patch_resp.status_code == 200, patch_resp.text
    current_revision = patch_resp.json()["revision_token"]

    stale_upload = client.post(
        f"/api/v1/video-assessments/sessions/{sid}/tasks/rest_tremor/upload",
        headers=auth_headers["patient"],
        data={"expected_revision": revision},
        files={"file": ("t.webm", io.BytesIO(_WEBM_HEAD), "video/webm")},
    )
    assert stale_upload.status_code == 409, stale_upload.text
    payload = stale_upload.json()
    assert payload["code"] == "session_conflict"
    assert payload["details"]["session_id"] == sid
    assert payload["details"]["current_revision"] == current_revision


def test_prior_finalized_sessions_clinician_and_admin_access(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    prior_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        with_clip=True,
        clinician_impression="Mild tremor burden, stable from prior visit.",
        updated_offset_minutes=-30,
    )

    clinician_resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["clinician"],
    )
    assert clinician_resp.status_code == 200, clinician_resp.text
    body = clinician_resp.json()
    assert [row["session_id"] for row in body["sessions"]] == [prior_id]
    assert body["sessions"][0]["overall_status"] == "finalized"
    assert body["sessions"][0]["has_clips"] is True
    assert body["sessions"][0]["summary"]["tasks_total"] == 16
    assert body["sessions"][0]["finalized_by"] == "Clinician"
    assert [row["session_id"] for row in body["trend_sessions"]] == [prior_id]
    assert body["trend_sessions"][0]["has_clips"] is True

    admin_resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["admin"],
    )
    assert admin_resp.status_code == 200, admin_resp.text
    assert [row["session_id"] for row in admin_resp.json()["sessions"]] == [prior_id]


def test_prior_finalized_sessions_newest_first_ordering(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    oldest_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        clinician_impression="Older finalized review.",
        updated_offset_minutes=-90,
    )
    newest_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        clinician_impression="Newest finalized review.",
        updated_offset_minutes=-5,
    )

    resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert [row["session_id"] for row in resp.json()["sessions"]] == [newest_id, oldest_id]
    assert [row["session_id"] for row in resp.json()["trend_sessions"]] == [oldest_id, newest_id]


def test_prior_finalized_sessions_patient_forbidden(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["patient"],
    )
    assert resp.status_code == 403, resp.text


def test_prior_finalized_sessions_filter_cross_patient_and_context(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    included_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        with_clip=True,
        clinician_impression="Comparable parkinsonism follow-up.",
        updated_offset_minutes=-15,
    )
    _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        preset_id="essential_tremor",
        clinician_impression="Different protocol context.",
        updated_offset_minutes=-20,
    )
    _seed_video_assessment_row(
        demo_patient_va,
        overall_status="in_progress",
        clinician_impression="Not finalized yet.",
        updated_offset_minutes=-10,
    )

    db = SessionLocal()
    try:
        other_patient_id = str(uuid.uuid4())
        db.add(
            Patient(
                id=other_patient_id,
                clinician_id="actor-clinician-demo",
                first_name="Other",
                last_name="Patient",
                email="other-video@demo.com",
                consent_signed=True,
                status="active",
                notes=None,
            )
        )
        db.commit()
    finally:
        db.close()
    _seed_video_assessment_row(
        other_patient_id,
        overall_status="finalized",
        with_clip=True,
        clinician_impression="Other patient should never leak.",
        updated_offset_minutes=-5,
    )

    resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert [row["session_id"] for row in resp.json()["sessions"]] == [included_id]
    assert [row["session_id"] for row in resp.json()["trend_sessions"]] == [included_id]


def test_prior_finalized_sessions_optional_fields_degrade_without_nested_leakage(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    prior_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        updated_offset_minutes=-10,
        mutate_doc=lambda doc: (
            doc["summary"].pop("clinician_impression", None),
            doc["summary"].pop("recommended_followup", None),
            doc["summary"].pop("severity_level", None),
            doc["tasks"].__setitem__(
                0,
                {
                    **doc["tasks"][0],
                    "clinician_review": {
                        "reviewed_at": "2026-05-07T09:00:00Z",
                        "free_text_comment": "nested review should not leak",
                    },
                },
            ),
        ),
    )

    resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [row["session_id"] for row in body["sessions"]] == [prior_id]
    item = body["sessions"][0]
    assert item["summary"]["key_findings"] == "No clinician summary recorded."
    assert item["summary"]["severity_level"] == "none"
    assert item["summary"]["tasks_completed"] >= 0
    assert item["finalized_by"] == "Clinician review"
    assert set(item.keys()) == {
        "session_id",
        "occurred_at",
        "overall_status",
        "has_clips",
        "summary",
        "finalized_by",
        "finalized_at",
    }
    assert set(item["summary"].keys()) == {
        "key_findings",
        "severity_level",
        "tasks_completed",
        "tasks_total",
    }
    assert "clinician_review" not in json.dumps(item)
    assert "tasks" not in item
    trend_item = body["trend_sessions"][0]
    assert set(trend_item.keys()) == {
        "session_id",
        "occurred_at",
        "finalized_at",
        "severity_level",
        "tasks_completed",
        "tasks_total",
        "has_clips",
    }
    assert trend_item["severity_level"] == "none"
    assert trend_item["tasks_total"] == 16
    assert "clinician_review" not in json.dumps(trend_item)
    assert "free_text_comment" not in json.dumps(trend_item)


def test_prior_finalized_sessions_empty_list(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    resp = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/prior-finalized-sessions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"sessions": [], "trend_sessions": []}


def test_historical_ai_summary_access_control_and_shape(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    prior_a = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        clinician_impression="Mild tremor remains stable.",
        updated_offset_minutes=-30,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "mild", "tasks_completed": 10}),
    )
    prior_b = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        clinician_impression="Mild tremor remains stable.",
        updated_offset_minutes=-10,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "mild", "tasks_completed": 12}),
    )

    forbidden = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["patient"],
        json={"selected_session_ids": [prior_a]},
    )
    assert forbidden.status_code == 403, forbidden.text

    for role in ("clinician", "supervisor", "admin"):
        resp = client.post(
            f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
            headers=auth_headers[role],
            json={"selected_session_ids": [prior_a, prior_b]},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body.keys()) == {
            "summary_status",
            "summary_text",
            "trend_observations",
            "data_basis",
            "limitations",
            "generated_at",
            "provenance",
        }
        assert body["summary_status"] == "fresh"
        assert body["data_basis"]["session_count"] == 2
        assert body["data_basis"]["has_severity_data"] is True
        assert body["data_basis"]["has_task_completion_data"] is True
        assert body["data_basis"]["has_clip_availability_data"] is True
        assert body["provenance"]["event_id"].startswith("va-historical-summary-")
        assert body["provenance"]["summary_logic_version"] == "video_assessment_historical_summary_v2"
        assert body["provenance"]["session_count"] == 2
        assert set(body["provenance"]["source_session_ids"]) == {prior_a, prior_b}
        assert body["provenance"]["source_input_fingerprint"]
        assert "stable" in body["summary_text"].lower()
        assert "diagnos" not in json.dumps(body).lower()
        assert "recommend" not in json.dumps(body).lower()
        assert "treatment" not in json.dumps(body).lower()

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["provenance"]["event_id"])
                .first()
            )
            assert row is not None
            assert row.target_type == "video_assessment"
            assert row.target_id == current_id
            assert row.actor_id.startswith("actor-")
            assert row.role == (role if role in {"clinician", "admin"} else "clinician")
            payload = json.loads(row.note)
            assert payload["event_type"] == "historical_ai_summary_generated"
            assert payload["session_id"] == current_id
            assert payload["actor_role"] == role
            assert payload["summary_logic_version"] == "video_assessment_historical_summary_v2"
            assert payload["summary_status"] == "fresh"
            assert payload["regeneration_reason"] == "fresh"
            assert set(payload["selected_prior_session_ids"]) == {prior_a, prior_b}
            assert set(payload["provenance"]["source_session_ids"]) == {prior_a, prior_b}
            assert payload["provenance"]["session_count"] == 2
            assert payload["provenance"]["has_severity_data"] is True
            assert payload["provenance"]["has_task_completion_data"] is True
            assert payload["provenance"]["has_clip_availability_data"] is True
            assert "summary.key_findings" in payload["provenance"]["fields_used"]
            assert "summary.severity_level" in payload["provenance"]["fields_used"]
            assert payload["provenance"]["source_input_fingerprint"]
            assert payload["prior_summary_ref"] is None
            assert "clinician_review" not in row.note
            assert "free_text_comment" not in row.note
        finally:
            db.close()


def test_historical_ai_summary_sparse_data_and_no_nested_leakage(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    prior_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        updated_offset_minutes=-10,
        mutate_doc=lambda doc: (
            doc["summary"].pop("clinician_impression", None),
            doc["summary"].pop("severity_level", None),
            doc["summary"].pop("tasks_completed", None),
            doc["tasks"].__setitem__(
                0,
                {
                    **doc["tasks"][0],
                    "clinician_review": {"free_text_comment": "should stay hidden"},
                },
            ),
        ),
    )

    resp = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [prior_id]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary_status"] == "fresh"
    assert body["data_basis"]["session_count"] == 1
    assert any("limited" in text.lower() for text in body["limitations"])
    assert any("compact finalized-session comparison fields only" in text.lower() for text in body["limitations"])
    assert "clinician_review" not in json.dumps(body).lower()
    assert "free_text_comment" not in json.dumps(body).lower()
    assert "tasks" not in body
    assert body["provenance"]["session_count"] == 1


def test_historical_ai_summary_ignores_cross_patient_and_mismatched_context_selection(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    included_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        updated_offset_minutes=-20,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "mild", "tasks_completed": 8}),
    )
    excluded_context_id = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        preset_id="essential_tremor",
        updated_offset_minutes=-15,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "moderate", "tasks_completed": 9}),
    )
    db = SessionLocal()
    try:
        other_patient_id = str(uuid.uuid4())
        db.add(
            Patient(
                id=other_patient_id,
                clinician_id="actor-clinician-demo",
                first_name="Other",
                last_name="Patient",
                email="other-video-summary@demo.com",
                consent_signed=True,
                status="active",
                notes=None,
            )
        )
        db.commit()
    finally:
        db.close()
    excluded_patient_id = _seed_video_assessment_row(
        other_patient_id,
        overall_status="finalized",
        updated_offset_minutes=-5,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "severe", "tasks_completed": 3}),
    )

    resp = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [included_id, excluded_context_id, excluded_patient_id]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary_status"] == "fresh"
    assert body["data_basis"]["session_count"] == 1
    assert body["provenance"]["source_session_ids"] == [included_id]
    payload = json.dumps(body).lower()
    assert excluded_context_id not in payload
    assert excluded_patient_id not in payload


def test_historical_ai_summary_status_transitions_and_audit_regeneration_references(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    prior_a = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        updated_offset_minutes=-30,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "mild", "tasks_completed": 8}),
    )
    prior_b = _seed_video_assessment_row(
        demo_patient_va,
        overall_status="finalized",
        updated_offset_minutes=-10,
        mutate_doc=lambda doc: doc["summary"].update({"severity_level": "mild", "tasks_completed": 10}),
    )

    first = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [prior_a]},
    )
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["summary_status"] == "fresh"

    unchanged = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [prior_a]},
    )
    assert unchanged.status_code == 200, unchanged.text
    unchanged_body = unchanged.json()
    assert unchanged_body["summary_status"] == "unchanged"
    assert unchanged_body["provenance"]["source_input_fingerprint"] == first_body["provenance"]["source_input_fingerprint"]

    selection_changed = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [prior_a, prior_b]},
    )
    assert selection_changed.status_code == 200, selection_changed.text
    selection_body = selection_changed.json()
    assert selection_body["summary_status"] == "regenerated_selection_changed"

    _mutate_video_assessment_row(
        prior_b,
        lambda doc: doc["summary"].__setitem__("clinician_impression", "Narrative updated after finalized review."),
    )
    source_changed = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
        headers=auth_headers["clinician"],
        json={"selected_session_ids": [prior_a, prior_b]},
    )
    assert source_changed.status_code == 200, source_changed.text
    source_body = source_changed.json()
    assert source_body["summary_status"] == "regenerated_source_changed"
    assert source_body["provenance"]["source_input_fingerprint"] != selection_body["provenance"]["source_input_fingerprint"]

    prior_logic_version = video_assessment_router._HISTORICAL_SUMMARY_LOGIC_VERSION
    video_assessment_router._HISTORICAL_SUMMARY_LOGIC_VERSION = "video_assessment_historical_summary_v3"
    try:
        logic_changed = client.post(
            f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary",
            headers=auth_headers["clinician"],
            json={"selected_session_ids": [prior_a, prior_b]},
        )
        assert logic_changed.status_code == 200, logic_changed.text
        logic_body = logic_changed.json()
        assert logic_body["summary_status"] == "regenerated_logic_changed"
        assert logic_body["provenance"]["summary_logic_version"] == "video_assessment_historical_summary_v3"
    finally:
        video_assessment_router._HISTORICAL_SUMMARY_LOGIC_VERSION = prior_logic_version

    db = SessionLocal()
    try:
        latest = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "video_assessment",
                AuditEventRecord.target_id == current_id,
                AuditEventRecord.actor_id == "actor-clinician-demo",
                AuditEventRecord.action == "video_assessment.historical_ai_summary_generated",
            )
            .order_by(AuditEventRecord.id.desc())
            .first()
        )
        assert latest is not None
        payload = json.loads(latest.note)
        assert payload["summary_status"] == "regenerated_logic_changed"
        assert payload["regeneration_reason"] == "regenerated_logic_changed"
        assert payload["prior_summary_ref"]["event_id"] == source_body["provenance"]["event_id"]
        assert payload["prior_summary_ref"]["summary_logic_version"] == "video_assessment_historical_summary_v2"
        assert payload["prior_summary_ref"]["source_input_fingerprint"] == source_body["provenance"]["source_input_fingerprint"]
        assert payload["provenance"]["source_input_fingerprint"] == logic_body["provenance"]["source_input_fingerprint"]
        assert "clinician_review" not in latest.note
        assert "free_text_comment" not in latest.note
    finally:
        db.close()


def test_historical_ai_summary_feedback_access_control_and_save(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    summary_event_id = _seed_historical_summary_event(current_id)

    forbidden = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["patient"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "accepted",
            "feedback_note": "Looks directionally useful.",
        },
    )
    assert forbidden.status_code == 403, forbidden.text

    for role in ("clinician", "supervisor", "admin"):
        resp = client.post(
            f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
            headers=auth_headers[role],
            json={
                "summary_event_id": summary_event_id,
                "feedback_status": "partially_accepted",
                "feedback_note": "  Useful framing.  Needs  manual clip review. ",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["has_feedback"] is True
        assert body["summary_event_id"] == summary_event_id
        assert body["feedback_status"] == "partially_accepted"
        assert body["feedback_note"] == "Useful framing. Needs manual clip review."
        assert body["updated_at"]
        assert body["actor_role"] == role

    db = SessionLocal()
    try:
        latest = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "video_assessment",
                AuditEventRecord.target_id == current_id,
                AuditEventRecord.action == "video_assessment.historical_ai_summary_feedback_saved",
            )
            .order_by(AuditEventRecord.id.desc())
            .first()
        )
        assert latest is not None
        payload = json.loads(latest.note)
        assert payload["event_type"] == "historical_ai_summary_feedback_saved"
        assert payload["session_id"] == current_id
        assert payload["summary_event_id"] == summary_event_id
        assert payload["feedback_status"] == "partially_accepted"
        assert payload["note_present"] is True
        assert payload["feedback_note"] == "Useful framing. Needs manual clip review."
        assert "clinician_review" not in latest.note
        assert "free_text_comment" not in latest.note
    finally:
        db.close()


def test_historical_ai_summary_feedback_validation_and_latest_preload(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    summary_event_id = _seed_historical_summary_event(current_id)

    invalid = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["clinician"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "strongly_agree",
        },
    )
    assert invalid.status_code == 422, invalid.text

    too_long = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["clinician"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "accepted",
            "feedback_note": "x" * 301,
        },
    )
    assert too_long.status_code == 422, too_long.text

    none_yet = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback/{summary_event_id}",
        headers=auth_headers["clinician"],
    )
    assert none_yet.status_code == 200, none_yet.text
    assert none_yet.json() == {
        "has_feedback": False,
        "summary_event_id": summary_event_id,
        "feedback_status": "",
        "feedback_note": None,
        "updated_at": None,
        "actor_role": "clinician",
    }

    first = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["clinician"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "accepted",
            "feedback_note": "Useful overview.",
        },
    )
    assert first.status_code == 200, first.text

    second = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["clinician"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "disagreed",
            "feedback_note": "Chronology looks incomplete.",
        },
    )
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["feedback_status"] == "disagreed"

    preload = client.get(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback/{summary_event_id}",
        headers=auth_headers["clinician"],
    )
    assert preload.status_code == 200, preload.text
    assert preload.json()["has_feedback"] is True
    assert preload.json()["feedback_status"] == "disagreed"
    assert preload.json()["feedback_note"] == "Chronology looks incomplete."

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "video_assessment",
                AuditEventRecord.target_id == current_id,
                AuditEventRecord.actor_id == "actor-clinician-demo",
                AuditEventRecord.action == "video_assessment.historical_ai_summary_feedback_saved",
            )
            .order_by(AuditEventRecord.id.asc())
            .all()
        )
        assert len(rows) == 2
        payloads = [json.loads(row.note) for row in rows]
        assert [payload["feedback_status"] for payload in payloads] == ["accepted", "disagreed"]
    finally:
        db.close()


def test_historical_ai_summary_feedback_does_not_mutate_session_or_generated_summary(
    client: TestClient,
    auth_headers: dict,
    demo_patient_va: str,
) -> None:
    current_id = _seed_video_assessment_row(demo_patient_va, overall_status="in_progress")
    summary_event_id = _seed_historical_summary_event(current_id)

    db = SessionLocal()
    try:
        row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == current_id).first()
        assert row is not None
        session_before = row.session_json
        summary_before = db.query(AuditEventRecord).filter(AuditEventRecord.event_id == summary_event_id).first()
        assert summary_before is not None
        summary_before_note = summary_before.note
    finally:
        db.close()

    save = client.post(
        f"/api/v1/video-assessments/sessions/{current_id}/historical-ai-summary-feedback",
        headers=auth_headers["clinician"],
        json={
            "summary_event_id": summary_event_id,
            "feedback_status": "not_useful",
            "feedback_note": "Needs more concrete basis labels.",
        },
    )
    assert save.status_code == 200, save.text

    db = SessionLocal()
    try:
        row = db.query(VideoAssessmentSession).filter(VideoAssessmentSession.id == current_id).first()
        assert row is not None
        assert row.session_json == session_before
        summary_after = db.query(AuditEventRecord).filter(AuditEventRecord.event_id == summary_event_id).first()
        assert summary_after is not None
        assert summary_after.note == summary_before_note
    finally:
        db.close()

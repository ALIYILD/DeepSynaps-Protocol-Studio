"""Tests for recordings_router — set D (PR 76/N).

Covers:
  - GET    /api/v1/recordings            (list)
  - POST   /api/v1/recordings            (upload)
  - GET    /api/v1/recordings/{id}/file  (stream)
  - DELETE /api/v1/recordings/{id}       (delete)

Auth, role gates, MIME validation, empty list, 404, 422.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import ConsentRecord, SessionRecording


# ── helpers ───────────────────────────────────────────────────────────────────


# Minimal magic bytes for test uploads that pass media_storage validation.
# WebM audio: 0x1A 0x45 0xDF 0xA3
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3" + b"\x00" * 100


def _seed_recording(
    *,
    owner_clinician_id: str = "actor-clinician-demo",
    title: str = "Test Recording",
    mime_type: str = "audio/webm",
    clinic_id: str = "clinic-demo-default",
    patient_id: str | None = None,
    consent_granted: bool = False,
    retention_days: int = 90,
    expires_at = None,
    auto_deleted: bool = False,
    tmp_path,
) -> str:
    """Write a real file + DB row and return the recording id."""
    from app.settings import get_settings
    from pathlib import Path

    rid = str(uuid.uuid4())
    settings = get_settings()
    owner_dir = Path(settings.media_storage_root) / "recordings" / owner_clinician_id
    owner_dir.mkdir(parents=True, exist_ok=True)
    file_path = owner_dir / rid
    file_path.write_bytes(_WEBM_MAGIC)

    db = SessionLocal()
    try:
        db.add(SessionRecording(
            id=rid,
            owner_clinician_id=owner_clinician_id,
            clinic_id=clinic_id,
            patient_id=patient_id,
            title=title,
            file_path=f"recordings/{owner_clinician_id}/{rid}",
            mime_type=mime_type,
            byte_size=len(_WEBM_MAGIC),
            duration_seconds=None,
            consent_granted=consent_granted,
            retention_days=retention_days,
            expires_at=expires_at,
            auto_deleted=auto_deleted,
        ))
        db.commit()
    finally:
        db.close()
    return rid


# ── GET /recordings ───────────────────────────────────────────────────────────


def test_list_recordings_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/recordings")
    assert r.status_code == 403


def test_list_recordings_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/recordings", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_list_recordings_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


# ── POST /recordings ──────────────────────────────────────────────────────────


def test_upload_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
    )
    assert r.status_code == 403


def test_upload_invalid_mime_is_422(client: TestClient, auth_headers: dict) -> None:
    """Text/plain is not an allowed audio/video MIME type."""
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_empty_file_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(b""), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_content_mismatch_is_422(client: TestClient, auth_headers: dict) -> None:
    """Declare audio/webm but send random bytes that don't look like WebM."""
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(b"NOTWEBM" + b"\x00" * 100), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "My Session"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body


def test_upload_then_list(client: TestClient, auth_headers: dict) -> None:
    client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── GET /recordings/{id}/file ─────────────────────────────────────────────────


def test_stream_missing_recording_is_404(client: TestClient, auth_headers: dict, tmp_path) -> None:
    r = client.get(
        "/api/v1/recordings/non-existent-id/file",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


# ── DELETE /recordings/{id} ───────────────────────────────────────────────────


def test_delete_missing_recording_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.delete(
        "/api/v1/recordings/non-existent-id",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_delete_requires_auth(client: TestClient) -> None:
    r = client.delete("/api/v1/recordings/some-id")
    assert r.status_code == 403


def test_upload_and_delete_round_trip(client: TestClient, auth_headers: dict) -> None:
    upload = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "Round trip"},
        headers=auth_headers["clinician"],
    )
    assert upload.status_code == 201
    rid = upload.json()["id"]

    delete = client.delete(f"/api/v1/recordings/{rid}", headers=auth_headers["clinician"])
    assert delete.status_code == 204

    # After deletion the row is gone.
    after = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    ids = [item["id"] for item in after.json()["items"]]
    assert rid not in ids


# ── Consent gating ────────────────────────────────────────────────────────────


def test_upload_patient_without_consent_is_403(client: TestClient, auth_headers: dict) -> None:
    """Patient-linked recordings require a valid active recording consent."""
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "No consent", "patient_id": "patient-no-consent"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403
    assert r.json()["code"] == "recording_consent_required"


def test_upload_patient_with_consent_is_201(client: TestClient, auth_headers: dict) -> None:
    """When a valid recording consent exists, upload succeeds and retention fields are set."""
    patient_id = "patient-with-consent"
    db = SessionLocal()
    try:
        db.add(ConsentRecord(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            consent_type="recording",
            signed=True,
            signed_at=datetime.now(timezone.utc),
            status="active",
        ))
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "With consent", "patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body

    # List should show consent_granted + expires_at
    lr = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    item = next(i for i in lr.json()["items"] if i["id"] == body["id"])
    assert item["consent_granted"] is True
    assert item["expires_at"] is not None
    assert item["auto_deleted"] is False


# ── Retention / auto-deleted ──────────────────────────────────────────────────


def test_list_hides_expired_by_default(client: TestClient, auth_headers: dict, tmp_path) -> None:
    """Auto-deleted recordings are hidden unless include_expired=true."""
    from datetime import datetime, timezone, timedelta
    rid = _seed_recording(
        auto_deleted=True,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        tmp_path=tmp_path,
    )

    default = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    assert rid not in [i["id"] for i in default.json()["items"]]

    explicit = client.get("/api/v1/recordings?include_expired=true", headers=auth_headers["clinician"])
    assert rid in [i["id"] for i in explicit.json()["items"]]


def test_stream_expired_recording_is_410(client: TestClient, auth_headers: dict, tmp_path) -> None:
    """Streaming an auto-deleted recording returns 410 Gone."""
    from datetime import datetime, timezone, timedelta
    rid = _seed_recording(
        auto_deleted=True,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        tmp_path=tmp_path,
    )
    r = client.get(f"/api/v1/recordings/{rid}/file", headers=auth_headers["clinician"])
    assert r.status_code == 410
    assert r.json()["code"] == "recording_expired"


# ── Cleanup endpoint ──────────────────────────────────────────────────────────


def test_cleanup_requires_supervisor(client: TestClient, auth_headers: dict) -> None:
    r = client.post("/api/v1/recordings/cleanup", headers=auth_headers["clinician"])
    assert r.status_code == 403


def test_cleanup_expired_recordings(client: TestClient, auth_headers: dict, tmp_path) -> None:
    """Supervisor cleanup soft-deletes expired rows and removes on-disk blobs."""
    from datetime import datetime, timezone, timedelta
    from pathlib import Path
    from app.settings import get_settings

    rid = _seed_recording(
        auto_deleted=False,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        tmp_path=tmp_path,
    )

    r = client.post("/api/v1/recordings/cleanup", headers=auth_headers["supervisor"])
    assert r.status_code == 200
    assert r.json()["cleaned"] >= 1

    # Row is now auto-deleted
    db = SessionLocal()
    try:
        rec = db.query(SessionRecording).filter_by(id=rid).first()
        assert rec is not None
        assert rec.auto_deleted is True
        assert rec.deleted_at is not None
        assert rec.deleted_by == "actor-supervisor-demo"
    finally:
        db.close()

    # On-disk blob removed
    settings = get_settings()
    blob = Path(settings.media_storage_root) / "recordings" / "actor-clinician-demo" / rid
    assert not blob.is_file()

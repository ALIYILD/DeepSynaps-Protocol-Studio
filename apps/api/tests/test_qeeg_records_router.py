"""Tests for qEEG Records router — raw_data_ref security + upload endpoint.

Pins the security invariants added to the router:
- raw_data_ref scheme allowlist at create time
- raw_data_ref not mutable via PATCH
- Upload endpoint: extension rejection, empty-file rejection, auth gating

The happy-path CRUD (list / create / get / patch summary_notes) is already
covered in test_qeeg_records.py; this file targets the hardening contract.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient


_QR = "/api/v1/qeeg-records"


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "RawRef", "last_name": "Guard", "dob": "1985-07-20", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def record_id(client: TestClient, auth_headers: dict, patient_id: str) -> str:
    resp = client.post(
        _QR,
        json={"patient_id": patient_id, "recording_type": "resting"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── raw_data_ref scheme allowlist ──────────────────────────────────────────

class TestRawDataRefSchemeValidation:
    def test_s3_scheme_accepted(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "s3://my-bucket/patient-123/recording.edf",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["raw_data_ref"].startswith("s3://")

    def test_https_scheme_accepted(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "https://storage.example.com/patient/rec.edf",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text

    def test_fixtures_scheme_accepted(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "fixtures://qeeg/test/patient1.edf",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text

    def test_local_path_rejected_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        """Absolute local paths must be rejected to prevent path-traversal exfil."""
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "/etc/passwd",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_traversal_segment_rejected_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        """Relative path with traversal segment must be rejected."""
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "../../etc/shadow",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_file_uri_rejected_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            _QR,
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "raw_data_ref": "file:///etc/passwd",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text


# ── raw_data_ref not mutable via PATCH ─────────────────────────────────────

class TestRawDataRefImmutableOnPatch:
    def test_patch_with_raw_data_ref_is_ignored(
        self, client: TestClient, auth_headers: dict, record_id: str
    ) -> None:
        """raw_data_ref is not in QEEGRecordUpdate — sending it should not update it."""
        original = client.get(
            f"{_QR}/{record_id}", headers=auth_headers["clinician"]
        ).json()["raw_data_ref"]

        resp = client.patch(
            f"{_QR}/{record_id}",
            json={"raw_data_ref": "s3://evil/path.edf", "summary_notes": "updated"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["raw_data_ref"] == original
        assert resp.json()["summary_notes"] == "updated"


# ── Upload endpoint ────────────────────────────────────────────────────────

class TestQEEGUpload:
    def _make_edf_content(self, size_kb: int = 2048) -> bytes:
        """Return a blob of the specified size (default 2 MB, above 1 MB floor)."""
        return b"x" * (size_kb * 1024)

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            f"{_QR}/upload",
            data={"patient_id": patient_id, "recording_type": "resting"},
            files={"file": ("test.edf", io.BytesIO(self._make_edf_content()), "application/octet-stream")},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(
        self, client: TestClient, patient_id: str
    ) -> None:
        resp = client.post(
            f"{_QR}/upload",
            data={"patient_id": patient_id, "recording_type": "resting"},
            files={"file": ("test.edf", io.BytesIO(self._make_edf_content()), "application/octet-stream")},
        )
        assert resp.status_code in (401, 403), resp.text

    def test_invalid_extension_rejected_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            f"{_QR}/upload",
            data={"patient_id": patient_id, "recording_type": "resting"},
            files={"file": ("recording.mp3", io.BytesIO(self._make_edf_content()), "audio/mpeg")},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_empty_file_rejected_422(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            f"{_QR}/upload",
            data={"patient_id": patient_id, "recording_type": "resting"},
            files={"file": ("recording.edf", io.BytesIO(b""), "application/octet-stream")},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_valid_edf_upload_creates_record(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            f"{_QR}/upload",
            data={"patient_id": patient_id, "recording_type": "resting"},
            files={"file": ("session1.edf", io.BytesIO(self._make_edf_content(2048)), "application/octet-stream")},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "record_id" in data
        assert data["raw_data_ref"].startswith("fixtures://")
        assert data["suggested_path"] in ("auto", "manual")
        assert "qc" in data
        assert data["qc"]["extension"] == "edf"

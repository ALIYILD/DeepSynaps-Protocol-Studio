"""Integration tests for ``/api/v1/mri`` endpoints.

These mock the ``app.services.mri_pipeline`` façade via monkeypatch so the
router + DB plumbing is exercised without requiring the heavy neuroimaging
stack (nibabel, nilearn, dipy, antspyx, weasyprint) to be installed.

Covers every endpoint in ``packages/mri-pipeline/portal_integration/
api_contract.md`` §1–§8 plus auth guardrails.

Updated 2026-04-26 night-shift to provide a valid hand-built NIfTI-1
gzipped payload so the new strict-validation upload gate accepts the
fixture. See ``_make_valid_nifti_gz`` below for the byte layout.
"""
from __future__ import annotations

import gzip
import io
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def _make_valid_nifti_gz() -> bytes:
    """Return a gzipped NIfTI-1 header + 256 bytes of zero data.

    Built by hand to avoid pulling nibabel into the test environment.
    Header layout per the NIfTI-1.1 spec
    (https://nifti.nimh.nih.gov/nifti-1/documentation):
      sizeof_hdr = 348, dim[0]=3, dim[1..3]=4, datatype=16 (float32),
      bitpix=32, pixdim[1..3]=1mm, sform/qform_code = 1, magic = "n+1\\0".
    Total volume size is small (4×4×4 voxels) so the test fixture stays
    tiny.
    """
    header = bytearray(348)
    struct.pack_into("i", header, 0, 348)
    struct.pack_into("h", header, 40, 3)        # dim[0] = 3
    struct.pack_into("h", header, 42, 4)        # dim[1]
    struct.pack_into("h", header, 44, 4)        # dim[2]
    struct.pack_into("h", header, 46, 4)        # dim[3]
    struct.pack_into("h", header, 48, 1)        # dim[4]
    struct.pack_into("h", header, 50, 1)        # dim[5]
    struct.pack_into("h", header, 52, 1)        # dim[6]
    struct.pack_into("h", header, 54, 1)        # dim[7]
    struct.pack_into("h", header, 70, 16)       # datatype = float32
    struct.pack_into("h", header, 72, 32)       # bitpix
    struct.pack_into("f", header, 76, 1.0)      # pixdim[0]
    struct.pack_into("f", header, 80, 1.0)      # pixdim[1]
    struct.pack_into("f", header, 84, 1.0)      # pixdim[2]
    struct.pack_into("f", header, 88, 1.0)      # pixdim[3]
    struct.pack_into("f", header, 108, 352.0)   # vox_offset
    struct.pack_into("h", header, 252, 1)       # qform_code = 1
    struct.pack_into("h", header, 254, 1)       # sform_code = 1
    struct.pack_into("4f", header, 280, 1.0, 0.0, 0.0, 0.0)  # srow_x
    struct.pack_into("4f", header, 296, 0.0, 1.0, 0.0, 0.0)  # srow_y
    struct.pack_into("4f", header, 312, 0.0, 0.0, 1.0, 0.0)  # srow_z
    header[344:348] = b"n+1\x00"
    nifti = bytes(header) + bytes(4) + bytes(256)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(nifti)
    return buf.getvalue()


VALID_NIFTI_GZ: bytes = _make_valid_nifti_gz()

from app.database import SessionLocal
from app.persistence.models import (
    AiSummaryAudit,
<<<<<<< HEAD
    Clinic,
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
    ClinicalSession,
    MriAnalysis,
    MriUpload,
    OutcomeSeries,
    Patient,
    QEEGRecord,
<<<<<<< HEAD
    User,
)
from app.services.auth_service import create_access_token
=======
)
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
from app.settings import get_settings


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_report() -> dict:
    """Load the canonical MRI demo payload from the sibling package."""
    from app.services.mri_pipeline import load_demo_report

    report = load_demo_report()
    assert "error" not in report, f"demo report broken: {report}"
    return report


@pytest.fixture
def media_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point media storage at a pytest ``tmp_path`` so uploads don't pollute /app."""
    monkeypatch.setenv("MEDIA_STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()  # type: ignore[attr-defined]
    yield tmp_path
    get_settings.cache_clear()  # type: ignore[attr-defined]


@pytest.fixture
def force_demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the router's demo-mode short-circuit on.

    The MRI pipeline heavy deps are optional — in CI they're not installed,
    so ``HAS_MRI_PIPELINE`` is already False. Setting the env var explicitly
    pins the behaviour even in environments where the neuro stack *is*
    available.
    """
    monkeypatch.setenv("MRI_DEMO_MODE", "1")


# ── §1 POST /upload ──────────────────────────────────────────────────────────


def test_upload_201_persists_row(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    files = {"file": ("scan.nii.gz", io.BytesIO(VALID_NIFTI_GZ), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["patient_id"] == "pat-mri-1"
    assert body["upload_id"]
    assert body["path"]

    # Row was written.
    db = SessionLocal()
    try:
        row = db.query(MriUpload).filter_by(upload_id=body["upload_id"]).first()
        assert row is not None
        assert row.filename == "scan.nii.gz"
        assert row.patient_id == "pat-mri-1"
        assert row.file_size_bytes and row.file_size_bytes > 0
    finally:
        db.close()


def test_upload_rejects_guest(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    # Guest must be rejected before validation runs — payload contents
    # don't matter, but use a valid one anyway to avoid any ambiguity.
    files = {"file": ("scan.nii.gz", io.BytesIO(VALID_NIFTI_GZ), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403


# ── §2 POST /analyze ─────────────────────────────────────────────────────────


def _do_upload(client: TestClient, auth_headers: dict) -> str:
    files = {"file": ("scan.nii.gz", io.BytesIO(VALID_NIFTI_GZ), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["upload_id"]


def test_analyze_demo_mode_populates_row_and_returns_job_id(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)

    resp = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
            "age": "54",
            "sex": "F",
            "run_mode": "sync",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"]
    assert body["state"] in ("queued", "SUCCESS")

    # Row should be fully populated from the demo report.
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=body["job_id"]).first()
        assert row is not None
        assert row.state == "SUCCESS"
        assert row.condition == "mdd"
        assert row.stim_targets_json is not None
        targets = json.loads(row.stim_targets_json)
        assert isinstance(targets, list)
        assert targets
        # Audit row must have been written for the analyze action.
        audit = (
            db.query(AiSummaryAudit)
            .filter_by(patient_id="pat-mri-1", summary_type="mri_analysis")
            .first()
        )
        assert audit is not None
        assert audit.actor_role == "clinician"
    finally:
        db.close()


def test_analyze_sync_returns_report_shape(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    demo_report: dict,
) -> None:
    """Sync mode with pipeline mock — the row must reflect the mock output."""
    monkeypatch.setattr(
        "app.services.mri_pipeline.HAS_MRI_PIPELINE", True
    )
    monkeypatch.setattr(
        "app.services.mri_pipeline.run_analysis_safe",
        lambda **k: {
            "success": True,
            "data": demo_report,
            "error": None,
            "is_stub": False,
        },
    )
    # Ensure demo short-circuit doesn't interfere.
    monkeypatch.delenv("MRI_DEMO_MODE", raising=False)

    upload_id = _do_upload(client, auth_headers)

    resp = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
            "run_mode": "sync",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    analysis_id = resp.json()["job_id"]

    # Fetch the report — should contain the stim_targets from the demo.
    report_resp = client.get(
        f"/api/v1/mri/report/{analysis_id}",
        headers=auth_headers["clinician"],
    )
    assert report_resp.status_code == 200, report_resp.text
    payload = report_resp.json()
    assert payload["analysis_id"] == analysis_id
    assert payload["patient"]["patient_id"] == "pat-mri-1"
    assert payload["stim_targets"]
    assert "disclaimer" in payload


def test_analyze_rejects_invalid_condition(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    resp = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "not_a_real_condition",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "invalid_condition"


def test_analyze_rejects_guest(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    resp = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": "nope",
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403


# ── §3 GET /status/{job_id} ──────────────────────────────────────────────────


def test_status_returns_200_and_state(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    job_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/status/{job_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"] == job_id
    assert body["state"] in ("queued", "STARTED", "PROGRESS", "SUCCESS", "FAILURE")
    assert "stage" in body["info"]


def test_status_404_for_unknown_job(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/status/ghost-job-xyz",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


# ── §4 GET /report/{analysis_id} ─────────────────────────────────────────────


def test_report_200_and_shape(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert "patient" in body
    assert "stim_targets" in body
    assert "modalities_present" in body
    assert "qc" in body


def test_report_404_when_missing(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/report/no-such-analysis",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


# ── §5 GET /report/{analysis_id}/pdf ─────────────────────────────────────────


def test_report_pdf_returns_503_when_facade_missing(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Ensure the PDF renderer is unavailable.
    monkeypatch.setattr(
        "app.services.mri_pipeline.generate_report_pdf_safe",
        lambda analysis_id, report: None,
    )

    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}/pdf",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["code"] == "pdf_unavailable"


def test_report_pdf_streams_bytes_when_available(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.mri_pipeline.generate_report_pdf_safe",
        lambda analysis_id, report: b"%PDF-1.7\n...\n%%EOF",
    )

    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}/pdf",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.content.startswith(b"%PDF")


# ── §6 GET /report/{analysis_id}/html ────────────────────────────────────────


def test_report_html_returns_html_response(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}/html",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert "<html" in resp.text.lower()


# ── §7 GET /overlay/{analysis_id}/{target_id} ────────────────────────────────


def test_overlay_returns_html_response(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/overlay/{analysis_id}/rTMS_MDD_personalised_sgACC",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    # Either the real nilearn HTML OR our styled placeholder — both are
    # valid responses depending on whether the neuro stack is installed.
    assert "<html" in resp.text.lower() or "<!doctype" in resp.text.lower()


# ── §8 GET /medrag/{analysis_id} ─────────────────────────────────────────────


def test_patient_timeline_returns_four_lanes(
    client: TestClient,
<<<<<<< HEAD
) -> None:
    # Seed Clinic + clinician User first so resolve_patient_clinic_id can
    # resolve patients.clinician_id -> users.clinic_id. The demo-token actor
    # has clinic_id=None, which would trip the cross-clinic ownership gate
    # (apps/api/app/auth.py:160). Mint a real JWT instead. See
    # tests/test_cross_clinic_ownership.py:111-183 for the canonical pattern.
    clinic_id = "clinic-test-default"
    clinician_user_id = "user-test-clinician"
    db = SessionLocal()
    try:
        db.add(Clinic(id=clinic_id, name="Test Clinic"))
        db.add(
            User(
                id=clinician_user_id,
                email="clinician-test@example.com",
                display_name="Test Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.flush()
        db.add(
            Patient(
                id="pat-timeline-1",
                clinician_id=clinician_user_id,
=======
    auth_headers: dict,
) -> None:
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id="pat-timeline-1",
                clinician_id="actor-clinician-demo",
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
                first_name="Timeline",
                last_name="Patient",
            )
        )
<<<<<<< HEAD
        # Flush so the patients.id row exists before the FK-bearing children
        # (clinical_sessions.patient_id, qeeg_records.patient_id, etc.) are
        # inserted in the same transaction. Without this flush the SQLite
        # backend rejects the child INSERTs with a FOREIGN KEY violation
        # because SQLAlchemy's unit-of-work, lacking declared relationship()
        # links between these tables, can pick a flush order in which the
        # children precede the parent.
        db.flush()
=======
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
        db.add(
            ClinicalSession(
                id="sess-timeline-1",
                patient_id="pat-timeline-1",
<<<<<<< HEAD
                clinician_id=clinician_user_id,
=======
                clinician_id="actor-clinician-demo",
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
                scheduled_at="2026-01-12T09:00:00Z",
                modality="rtms",
                appointment_type="session",
                status="completed",
                outcome="positive",
            )
        )
        db.add(
            QEEGRecord(
                id="qeeg-timeline-1",
                patient_id="pat-timeline-1",
<<<<<<< HEAD
                clinician_id=clinician_user_id,
=======
                clinician_id="actor-clinician-demo",
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
                course_id="course-1",
                recording_type="resting",
                recording_date="2026-01-10",
                equipment="NeuroGuide 19ch",
            )
        )
        db.add(
            OutcomeSeries(
                id="outcome-timeline-1",
                patient_id="pat-timeline-1",
                course_id="course-1",
                template_id="PHQ-9",
                template_title="PHQ-9 Depression",
                score="8",
                score_numeric=8.0,
                measurement_point="post",
                administered_at=datetime(2026, 1, 20, tzinfo=timezone.utc),
<<<<<<< HEAD
                clinician_id=clinician_user_id,
=======
                clinician_id="actor-clinician-demo",
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
            )
        )
        db.add(
            MriAnalysis(
                analysis_id="mri-timeline-1",
                patient_id="pat-timeline-1",
                created_at=datetime(2026, 1, 8, tzinfo=timezone.utc),
                job_id="mri-timeline-1",
                state="SUCCESS",
                condition="mdd",
                stim_targets_json="[]",
                modalities_present_json='["T1"]',
                qc_json='{"passed": true}',
                overlays_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()

<<<<<<< HEAD
    token = create_access_token(
        user_id=clinician_user_id,
        email="clinician-test@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )
    resp = client.get(
        "/api/v1/mri/patients/pat-timeline-1/timeline",
        headers={"Authorization": f"Bearer {token}"},
=======
    resp = client.get(
        "/api/v1/mri/patients/pat-timeline-1/timeline",
        headers=auth_headers["clinician"],
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == "pat-timeline-1"
    assert set(body["lanes"].keys()) == {"sessions", "qeeg", "mri", "outcomes"}
    assert len(body["lanes"]["sessions"]) == 1
    assert len(body["lanes"]["qeeg"]) == 1
    assert len(body["lanes"]["mri"]) == 1
    assert len(body["lanes"]["outcomes"]) == 1
    assert body["links"]


def test_medrag_returns_contract_shape(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_query(conditions, modalities, *, top_k=10, db_session=None):
        return [
            {
                "pmid": "9876",
                "doi": "10.2/x",
                "title": "MRI and MDD",
                "authors": ["Q"],
                "year": 2025,
                "journal": "Brain",
                "abstract": "",
                "relevance_score": 0.92,
            }
        ]

    monkeypatch.setattr("app.services.qeeg_rag.query_literature", _fake_query)

    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/medrag/{analysis_id}?top_k=5",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert isinstance(body["results"], list)
    assert body["results"]
    first = body["results"][0]
    assert "title" in first
    assert "score" in first
    assert "hits" in first


def test_medrag_404_for_missing_analysis(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/medrag/ghost-id",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


# ── Upload-validation hardening (added 2026-04-26 night) ─────────────────────


def test_upload_rejects_non_whitelisted_extension(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    """A .dcm raw upload must be rejected with a clear 422."""
    files = {"file": ("scan.dcm", io.BytesIO(b"\x00" * 1024), "application/dicom")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "unsupported_extension"


def test_upload_rejects_garbage_nifti_magic(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    """A .nii.gz with garbage bytes must be caught by the magic-byte check."""
    garbage = b"\x00" * 4096
    files = {"file": ("scan.nii.gz", io.BytesIO(garbage), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] in ("nifti_too_short", "nifti_bad_magic")


def test_upload_rejects_corrupt_zip(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
) -> None:
    files = {"file": ("bundle.zip", io.BytesIO(b"NOT_A_REAL_ZIP_FILE"), "application/zip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] in ("zip_corrupt", "zip_unreadable")


# ── Report shape includes findings + safer brain-age (added 2026-04-26) ──────


def test_report_includes_findings_array_and_disclaimer(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    """Report must surface the new ``findings`` array with safer language."""
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "findings" in body
    assert isinstance(body["findings"], list)
    if body["findings"]:
        first = body["findings"][0]
        assert first["requires_clinical_correlation"] is True
        assert "observation" in first["observation_text"].lower()
        assert "diagnos" not in first["observation_text"].lower()
    assert "disclaimer" in body
    assert "decision-support" in body["disclaimer"].lower()


def test_report_brain_age_carries_calibration_provenance(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    """Brain-age block must always carry calibration_provenance after the safety wrap."""
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}",
        headers=auth_headers["clinician"],
    )
    body = resp.json()
    structural = body.get("structural") or {}
    if structural.get("brain_age"):
        ba = structural["brain_age"]
        assert ba.get("calibration_provenance"), (
            "brain_age block must carry calibration_provenance after safety wrap"
        )
        # When predicted age is ok, confidence band must be present.
        if ba.get("status") == "ok" and ba.get("predicted_age_years") is not None:
            assert ba.get("confidence_band_years"), (
                "brain_age ok-path must carry confidence_band_years"
            )


# ── Fusion payload endpoint ──────────────────────────────────────────────────


def test_fusion_payload_returns_narrow_shape(
    client: TestClient,
    auth_headers: dict,
    media_root: Path,
    force_demo_mode: None,
) -> None:
    upload_id = _do_upload(client, auth_headers)
    analyze = client.post(
        "/api/v1/mri/analyze",
        data={
            "upload_id": upload_id,
            "patient_id": "pat-mri-1",
            "condition": "mdd",
        },
        headers=auth_headers["clinician"],
    )
    analysis_id = analyze.json()["job_id"]

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}/fusion_payload",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["schema_version"] == "mri.v1"
    assert payload["modality"] == "mri"
    assert payload["subject_id"] == "pat-mri-1"
    assert "qc" in payload
    assert "findings" in payload
    assert "stim_targets" in payload
    assert "provenance" in payload
    assert "decision-support" in payload["provenance"]["disclaimer"].lower()


def test_fusion_payload_404_when_analysis_missing(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.get(
        "/api/v1/mri/report/no-such-id/fusion_payload",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404

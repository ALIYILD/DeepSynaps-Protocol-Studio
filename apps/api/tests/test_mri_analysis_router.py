"""Integration tests for ``/api/v1/mri`` endpoints.

These mock the ``app.services.mri_pipeline`` façade via monkeypatch so the
router + DB plumbing is exercised without requiring the heavy neuroimaging
stack (nibabel, nilearn, dipy, antspyx, weasyprint) to be installed.

Covers every endpoint in ``packages/mri-pipeline/portal_integration/
api_contract.md`` §1–§8 plus auth guardrails.
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AiSummaryAudit,
    ClinicalSession,
    MriAnalysis,
    MriUpload,
    OutcomeSeries,
    Patient,
    QEEGRecord,
)
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
    files = {"file": ("scan.nii.gz", io.BytesIO(b"FAKE_NIFTI_BYTES" * 64), "application/gzip")}
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
    files = {"file": ("scan.nii.gz", io.BytesIO(b"x" * 128), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403


# ── §2 POST /analyze ─────────────────────────────────────────────────────────


def _do_upload(client: TestClient, auth_headers: dict) -> str:
    files = {"file": ("scan.nii.gz", io.BytesIO(b"FAKE_NIFTI" * 32), "application/gzip")}
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
    auth_headers: dict,
) -> None:
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id="pat-timeline-1",
                clinician_id="actor-clinician-demo",
                first_name="Timeline",
                last_name="Patient",
            )
        )
        # Flush so the patients.id row exists before the FK-bearing children
        # (clinical_sessions.patient_id, qeeg_records.patient_id, etc.) are
        # inserted in the same transaction. Without this flush the SQLite
        # backend rejects the child INSERTs with a FOREIGN KEY violation
        # because SQLAlchemy's unit-of-work, lacking declared relationship()
        # links between these tables, can pick a flush order in which the
        # children precede the parent.
        db.flush()
        db.add(
            ClinicalSession(
                id="sess-timeline-1",
                patient_id="pat-timeline-1",
                clinician_id="actor-clinician-demo",
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
                clinician_id="actor-clinician-demo",
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
                clinician_id="actor-clinician-demo",
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

    resp = client.get(
        "/api/v1/mri/patients/pat-timeline-1/timeline",
        headers=auth_headers["clinician"],
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

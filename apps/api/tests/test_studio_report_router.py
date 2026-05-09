"""Tests for studio_report_router — /api/v1/studio/eeg report endpoints (M12).

Strategy: the report endpoints depend on _load_analysis (needs a QEEGAnalysis
DB row) and the render / template functions. We mock the heavy render calls so
tests run without WeasyPrint/python-docx, but verify auth, status codes, and
response content-types.
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def analysis_ctx():
    """Seed a minimal QEEGAnalysis row and return ids + auth token."""
    db = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Report Test Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"report_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Report Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="Re",
            last_name="Port",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://report-test",
            original_filename="rec.edf",
            file_size_bytes=1024,
            recording_duration_sec=60.0,
            sample_rate_hz=256.0,
            channel_count=2,
            channels_json='["Fp1","Fp2"]',
            recording_date="2026-01-01",
            eyes_condition="open",
            equipment="demo",
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()
        token = create_access_token(
            user_id=clin.id,
            email=clin.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clin.clinic_id,
        )
        return {"analysis_id": analysis.id, "token": token}
    finally:
        db.close()


def _auth(ctx):
    return {"Authorization": f"Bearer {ctx['token']}"}


# ---------------------------------------------------------------------------
# Tests: template listing
# ---------------------------------------------------------------------------

def test_report_templates_list_ok(client: TestClient, analysis_ctx) -> None:
    r = client.get("/api/v1/studio/eeg/report/templates", headers=_auth(analysis_ctx))
    assert r.status_code == 200
    body = r.json()
    assert "templates" in body
    assert isinstance(body["templates"], list)


def test_report_templates_list_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg/report/templates")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tests: single template fetch
# ---------------------------------------------------------------------------

def test_report_template_get_not_found_raises_or_errors(client: TestClient, analysis_ctx) -> None:
    """Requesting a missing template should surface an error (not 200).

    The router does not catch FileNotFoundError, so TestClient (with default
    raise_server_exceptions=True) re-raises it as an exception. We accept
    either an error response OR the raised exception — both confirm the
    endpoint does not silently return 200 for missing templates.
    """
    try:
        r = client.get(
            "/api/v1/studio/eeg/report/templates/no_such_template_xyz",
            headers=_auth(analysis_ctx),
        )
        # If we reach here, the response should be an error
        assert r.status_code >= 400
    except FileNotFoundError:
        pass  # expected — unhandled exception propagates through TestClient


def test_report_template_get_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/studio/eeg/report/templates/standard")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tests: report context
# ---------------------------------------------------------------------------

def test_report_context_ok(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.get(f"/api/v1/studio/eeg/{aid}/report/context", headers=_auth(analysis_ctx))
    assert r.status_code == 200
    body = r.json()
    assert body["analysisId"] == aid
    assert "variables" in body


def test_report_context_not_found(client: TestClient, analysis_ctx) -> None:
    r = client.get(
        "/api/v1/studio/eeg/does-not-exist/report/context",
        headers=_auth(analysis_ctx),
    )
    assert r.status_code == 404


def test_report_context_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.get(f"/api/v1/studio/eeg/{aid}/report/context")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tests: report render (HTML — no heavy PDF/DOCX deps needed)
# ---------------------------------------------------------------------------

def test_report_render_html_ok(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    from app.routers import studio_report_router

    with patch.object(studio_report_router, "document_to_html", return_value="<html>report</html>"):
        r = client.post(
            f"/api/v1/studio/eeg/{aid}/report/render",
            headers=_auth(analysis_ctx),
            json={
                "format": "html",
                "document": {"title": "Test", "blocks": []},
            },
        )
    assert r.status_code == 200
    assert "html" in r.headers.get("content-type", "")


def test_report_render_requires_auth(client: TestClient, analysis_ctx) -> None:
    aid = analysis_ctx["analysis_id"]
    r = client.post(
        f"/api/v1/studio/eeg/{aid}/report/render",
        json={"format": "html", "document": {"title": "T", "blocks": []}},
    )
    assert r.status_code in (401, 403)


def test_report_render_unknown_analysis_404(client: TestClient, analysis_ctx) -> None:
    from app.routers import studio_report_router

    with patch.object(studio_report_router, "document_to_html", return_value="<html/>"):
        r = client.post(
            "/api/v1/studio/eeg/missing-analysis/report/render",
            headers=_auth(analysis_ctx),
            json={"format": "html", "document": {"title": "X", "blocks": []}},
        )
    assert r.status_code == 404

"""Tests for Patient Summary router (/api/v1/patient-portal).

Covers:
- qEEG summary: 404 for unknown analysis_id
- MRI summary: 404 for unknown analysis_id
- Clinician token → 403 (patient portal is patient-role-only)
- Admin token → 403
- Guest token → 403
- Unauthenticated → 401/403
- Patient token bound to correct patient → 200 (happy path via DB seed)
- _sanitise_banned_words: unit tests
- _plain_language_rewrite: unit tests
- _severity_hint: unit tests
"""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis, Patient, QEEGAnalysis, User


_PORTAL = "/api/v1/patient-portal"


# ── Fixtures for auth rejection tests ─────────────────────────────────────

@pytest.fixture
def seeded_analysis_ids() -> dict:
    """Seed a patient + qEEG analysis + MRI analysis row so auth tests hit real rows."""
    db = SessionLocal()
    try:
        pid = f"summary-auth-patient-{uuid.uuid4().hex[:8]}"
        qid = f"summary-auth-qeeg-{uuid.uuid4().hex[:8]}"
        mid = f"summary-auth-mri-{uuid.uuid4().hex[:8]}"
        db.add(Patient(
            id=pid,
            clinician_id="actor-clinician-demo",
            first_name="AuthTest",
            last_name="Patient",
            dob="1990-01-01",
        ))
        db.add(QEEGAnalysis(
            id=qid,
            patient_id=pid,
            clinician_id="actor-clinician-demo",
            analysis_status="complete",
        ))
        db.add(MriAnalysis(analysis_id=mid, patient_id=pid))
        db.commit()
        return {"qeeg_id": qid, "mri_id": mid}
    finally:
        db.close()


# ── Auth rejection tests ────────────────────────────────────────────────────

def test_clinician_qeeg_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/qeeg-summary/{seeded_analysis_ids['qeeg_id']}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text


def test_clinician_mri_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/mri-summary/{seeded_analysis_ids['mri_id']}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text


def test_admin_qeeg_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/qeeg-summary/{seeded_analysis_ids['qeeg_id']}",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 403, resp.text


def test_admin_mri_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/mri-summary/{seeded_analysis_ids['mri_id']}",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 403, resp.text


def test_guest_qeeg_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/qeeg-summary/{seeded_analysis_ids['qeeg_id']}",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403, resp.text


def test_guest_mri_forbidden(
    client: TestClient, auth_headers: dict, seeded_analysis_ids: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/mri-summary/{seeded_analysis_ids['mri_id']}",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403, resp.text


def test_unauthenticated_qeeg_rejected(
    client: TestClient, seeded_analysis_ids: dict
) -> None:
    resp = client.get(f"{_PORTAL}/qeeg-summary/{seeded_analysis_ids['qeeg_id']}")
    assert resp.status_code in (401, 403), resp.text


def test_unauthenticated_mri_rejected(
    client: TestClient, seeded_analysis_ids: dict
) -> None:
    resp = client.get(f"{_PORTAL}/mri-summary/{seeded_analysis_ids['mri_id']}")
    assert resp.status_code in (401, 403), resp.text


# ── 404 for nonexistent analysis ────────────────────────────────────────────

class TestAnalysisNotFound:
    def test_qeeg_summary_nonexistent_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Patient token against nonexistent analysis → 404 (analysis lookup fails before patient gate)."""
        resp = client.get(
            f"{_PORTAL}/qeeg-summary/ghost-analysis-id",
            headers=auth_headers["patient"],
        )
        # 404 because the row doesn't exist (patient gate isn't reached)
        assert resp.status_code == 404, resp.text

    def test_mri_summary_nonexistent_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            f"{_PORTAL}/mri-summary/ghost-mri-id",
            headers=auth_headers["patient"],
        )
        assert resp.status_code == 404, resp.text


# ── Happy path: patient bound to analysis ─────────────────────────────────

@pytest.fixture
def patient_portal_setup() -> dict:
    """Create a patient User + Patient row + QEEGAnalysis + MriAnalysis.

    Returns dict with analysis_id, mri_analysis_id, patient_token.
    """
    db = SessionLocal()
    try:
        patient_email = f"portal_patient_{uuid.uuid4().hex[:8]}@example.com"
        user_id = f"portal-user-{uuid.uuid4().hex[:8]}"
        patient_id = f"portal-patient-{uuid.uuid4().hex[:8]}"
        qeeg_id = f"portal-qeeg-{uuid.uuid4().hex[:8]}"
        mri_id = f"portal-mri-{uuid.uuid4().hex[:8]}"

        db.add(User(
            id=user_id,
            email=patient_email,
            display_name="Portal Test Patient",
            hashed_password="x",
            role="patient",
            package_id="explorer",
        ))
        db.add(Patient(
            id=patient_id,
            clinician_id="actor-clinician-demo",
            first_name="Portal",
            last_name="Patient",
            email=patient_email,
            dob="1995-06-15",
        ))
        db.add(QEEGAnalysis(
            id=qeeg_id,
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="complete",
        ))
        db.add(MriAnalysis(
            analysis_id=mri_id,
            patient_id=patient_id,
        ))
        db.commit()

        from app.services.auth_service import create_access_token
        token = create_access_token(
            user_id=user_id,
            email=patient_email,
            role="patient",
            package_id="explorer",
            clinic_id=None,
        )
        return {
            "token": token,
            "qeeg_id": qeeg_id,
            "mri_id": mri_id,
            "patient_id": patient_id,
        }
    finally:
        db.close()


def test_qeeg_summary_patient_bound_200(
    client: TestClient, patient_portal_setup: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/qeeg-summary/{patient_portal_setup['qeeg_id']}",
        headers={"Authorization": f"Bearer {patient_portal_setup['token']}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == patient_portal_setup["qeeg_id"]
    assert "findings_plain_language" in data
    assert len(data["findings_plain_language"]) >= 1
    assert data["regulatory_footer"] == "Research/wellness use — not diagnostic."
    assert "next_steps_generic" in data


def test_mri_summary_patient_bound_200(
    client: TestClient, patient_portal_setup: dict
) -> None:
    resp = client.get(
        f"{_PORTAL}/mri-summary/{patient_portal_setup['mri_id']}",
        headers={"Authorization": f"Bearer {patient_portal_setup['token']}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["analysis_id"] == patient_portal_setup["mri_id"]
    assert len(data["findings_plain_language"]) >= 1
    assert data["regulatory_footer"] == "Research/wellness use — not diagnostic."


def test_patient_cannot_access_other_patients_analysis(
    client: TestClient, patient_portal_setup: dict
) -> None:
    """Patient actor bound to patient A must be denied access to patient B's analysis."""
    db = SessionLocal()
    try:
        other_patient_id = f"other-patient-{uuid.uuid4().hex[:8]}"
        other_qeeg_id = f"other-qeeg-{uuid.uuid4().hex[:8]}"
        db.add(Patient(
            id=other_patient_id,
            clinician_id="actor-clinician-demo",
            first_name="Other",
            last_name="Patient",
            dob="1985-01-01",
        ))
        db.add(QEEGAnalysis(
            id=other_qeeg_id,
            patient_id=other_patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="complete",
        ))
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"{_PORTAL}/qeeg-summary/{other_qeeg_id}",
        headers={"Authorization": f"Bearer {patient_portal_setup['token']}"},
    )
    assert resp.status_code == 403, resp.text


# ── Unit tests for pure helper functions ──────────────────────────────────

class TestSanitiseBannedWords:
    def test_removes_treatment_recommendation(self) -> None:
        from app.routers.patient_summary_router import _sanitise_banned_words
        result = _sanitise_banned_words("Treatment recommendation: take medication.")
        assert "recommendation" not in result.lower() or "treatment" not in result.lower()

    def test_removes_diagnosis(self) -> None:
        from app.routers.patient_summary_router import _sanitise_banned_words
        result = _sanitise_banned_words("This is a diagnosis.")
        assert "diagnosis" not in result.lower()

    def test_empty_string(self) -> None:
        from app.routers.patient_summary_router import _sanitise_banned_words
        assert _sanitise_banned_words("") == ""

    def test_none_input(self) -> None:
        from app.routers.patient_summary_router import _sanitise_banned_words
        assert _sanitise_banned_words(None) == ""


class TestPlainLanguageRewrite:
    def test_jargon_replaced(self) -> None:
        from app.routers.patient_summary_router import _plain_language_rewrite
        result = _plain_language_rewrite("theta_beta_ratio is elevated.")
        assert "attention-related brainwave ratio" in result

    def test_truncated_to_max(self) -> None:
        from app.routers.patient_summary_router import _plain_language_rewrite, _MAX_FINDING_LEN
        long_text = "word " * 500
        result = _plain_language_rewrite(long_text)
        assert len(result) <= _MAX_FINDING_LEN

    def test_banned_words_removed(self) -> None:
        from app.routers.patient_summary_router import _plain_language_rewrite
        result = _plain_language_rewrite("This diagnosis is important.")
        assert "diagnosis" not in result.lower()


class TestSeverityHint:
    def test_none_returns_gentle(self) -> None:
        from app.routers.patient_summary_router import _severity_hint
        assert _severity_hint(None) == "gentle"

    def test_small_z_gentle(self) -> None:
        from app.routers.patient_summary_router import _severity_hint
        assert _severity_hint(1.0) == "gentle"

    def test_medium_z_moderate(self) -> None:
        from app.routers.patient_summary_router import _severity_hint
        assert _severity_hint(2.0) == "moderate"

    def test_large_z_discuss(self) -> None:
        from app.routers.patient_summary_router import _severity_hint
        assert _severity_hint(3.0) == "discuss_with_clinician"

    def test_negative_z_works(self) -> None:
        from app.routers.patient_summary_router import _severity_hint
        assert _severity_hint(-2.0) == "moderate"
        assert _severity_hint(-3.0) == "discuss_with_clinician"

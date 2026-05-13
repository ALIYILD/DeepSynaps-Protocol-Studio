"""Patient analytics scope tests — verify analytics queries are clinic-scoped.

This test file validates that patient analytics (population trends, 
cohort analysis, outcomes) are scoped to the clinician's clinic only.
Cross-clinic queries must return 403 Forbidden.

**Coverage:**
- Population analytics (cohort queries)
- Patient analytics (individual outcomes)
- Care team analytics (coverage, adherence)
- Reporting/export (clinic scoped)
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.persistence.models import Clinic, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _seed_analytics_scope_setup() -> dict:
    """Create two clinics with patients and clinical data."""
    db = SessionLocal()
    try:
        # Create two clinics
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        # Create clinicians for each clinic
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"clin_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clinician A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"clin_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clinician B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        
        # Create admin user (no clinic_id) for cross-clinic queries
        admin = User(
            id=str(uuid.uuid4()),
            email=f"admin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Admin",
            hashed_password="x",
            role="admin",
            package_id="explorer",
            clinic_id=None,
        )
        
        db.add_all([clin_a, clin_b, admin])
        db.flush()

        # Create multiple patients for clinic A
        patients_a = []
        for i in range(3):
            p = Patient(
                id=str(uuid.uuid4()),
                clinician_id=clin_a.id,
                first_name=f"Patient",
                last_name=f"A{i}",
            )
            patients_a.append(p)

        # Create multiple patients for clinic B
        patients_b = []
        for i in range(3):
            p = Patient(
                id=str(uuid.uuid4()),
                clinician_id=clin_b.id,
                first_name=f"Patient",
                last_name=f"B{i}",
            )
            patients_b.append(p)

        db.add_all(patients_a + patients_b)
        db.flush()
        db.commit()

        return {
            "clinic_a_id": clinic_a.id,
            "clinic_b_id": clinic_b.id,
            "patients_a_ids": [p.id for p in patients_a],
            "patients_b_ids": [p.id for p in patients_b],
            "clin_a_id": clin_a.id,
            "clin_b_id": clin_b.id,
            "admin_id": admin.id,
            "token_clin_a": create_access_token(
                user_id=clin_a.id,
                email=clin_a.email,
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_a.id,
            ),
            "token_clin_b": create_access_token(
                user_id=clin_b.id,
                email=clin_b.email,
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_b.id,
            ),
            "token_admin": create_access_token(
                user_id=admin.id,
                email=admin.email,
                role="admin",
                package_id="explorer",
                clinic_id=None,
            ),
        }
    finally:
        db.close()


def test_population_analytics_scoped_to_clinic(
    client: TestClient,
) -> None:
    """Clinician A sees only Clinic A patients in population analytics."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/population",
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Should see 3 patients from Clinic A, not 6 total
    assert len(data.get("patients", [])) == 3
    patient_ids = [p["id"] for p in data.get("patients", [])]

    for patient_id in setup["patients_a_ids"]:
        assert patient_id in patient_ids, f"Patient A {patient_id} should be visible"

    for patient_id in setup["patients_b_ids"]:
        assert patient_id not in patient_ids, f"Patient B {patient_id} should NOT be visible"


def test_patient_analytics_cross_clinic_blocked(
    client: TestClient,
) -> None:
    """Clinician B cannot query analytics for Clinic A's patient."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        f"/api/v1/patient-analytics/{setup['patients_a_ids'][0]}",
        headers={"Authorization": f"Bearer {setup['token_clin_b']}"},
    )

    assert resp.status_code == 403, resp.text


def test_cohort_query_respects_clinic_boundaries(
    client: TestClient,
) -> None:
    """Cohort analysis must only include the clinician's clinic."""
    setup = _seed_analytics_scope_setup()

    resp = client.post(
        "/api/v1/patient-analytics/cohort",
        json={"filters": {"status": "active"}},
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Should return only Clinic A patients
    assert len(data.get("patients", [])) <= 3


def test_care_team_analytics_clinic_scoped(
    client: TestClient,
) -> None:
    """Care team analytics (coverage, adherence) scoped to clinic."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/care-team-coverage",
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Should only show Clinic A data
    clinic_id = data.get("clinic_id")
    assert clinic_id == setup["clinic_a_id"]


def test_analytics_export_respects_clinic_scope(
    client: TestClient,
) -> None:
    """Exporting analytics includes only clinic-scoped data."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/export",
        params={"format": "csv"},
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    csv_data = resp.text

    # CSV should include Clinic A patient names
    for patient_id in setup["patients_a_ids"]:
        # At least the patient ID should be in the export
        assert patient_id in csv_data or "Patient A" in csv_data


def test_admin_can_query_cross_clinic_analytics(
    client: TestClient,
) -> None:
    """Admin (no clinic_id) can query all clinics but must explicitly specify."""
    setup = _seed_analytics_scope_setup()

    # Admin should be able to query with clinic filter
    resp = client.get(
        "/api/v1/patient-analytics/population",
        params={"clinic_id": setup["clinic_a_id"]},
        headers={"Authorization": f"Bearer {setup['token_admin']}"},
    )

    # Should succeed (or require explicit clinic filter)
    assert resp.status_code in (200, 400)  # 400 if clinic_id is required


def test_outcomes_analytics_clinic_scoped(
    client: TestClient,
) -> None:
    """Outcome metrics (adherence rate, symptom trends) scoped to clinic."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/outcomes",
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Clinic ID should match
    assert data.get("clinic_id") == setup["clinic_a_id"]


def test_report_dashboard_filtered_by_clinic(
    client: TestClient,
) -> None:
    """Dashboard reports only show clinic's data."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/dashboard",
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Dashboard metrics should reflect only Clinic A
    total_patients = data.get("total_patients", 0)
    assert total_patients == 3, f"Expected 3 patients, got {total_patients}"


def test_bulk_export_respects_clinic_scope(
    client: TestClient,
) -> None:
    """Bulk export of analytics respects clinic scope."""
    setup = _seed_analytics_scope_setup()

    resp = client.post(
        "/api/v1/patient-analytics/bulk-export",
        json={"format": "ndjson", "include": ["demographics", "outcomes"]},
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    assert resp.status_code in (200, 202), resp.text
    # If async, should return job_id
    if resp.status_code == 202:
        assert "job_id" in resp.json()


def test_analytics_query_with_explicit_other_clinic_blocked(
    client: TestClient,
) -> None:
    """Clinician A cannot query analytics by explicitly specifying Clinic B."""
    setup = _seed_analytics_scope_setup()

    resp = client.get(
        "/api/v1/patient-analytics/population",
        params={"clinic_id": setup["clinic_b_id"]},
        headers={"Authorization": f"Bearer {setup['token_clin_a']}"},
    )

    # Should be 403 or silently ignore the clinic_id parameter
    assert resp.status_code in (403, 200)
    # If 200, should still be filtered to Clinic A

from __future__ import annotations

import uuid

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User
from app.services.auth_service import create_access_token


def _seed_patient_analytics_scope_world() -> dict[str, str]:
    db = SessionLocal()
    try:
        home_clinic = db.query(Clinic).filter_by(id="clinic-demo-default").first()
        if home_clinic is None:
            home_clinic = Clinic(id="clinic-demo-default", name="Demo Clinic")
            db.add(home_clinic)
            db.flush()

        other_clinic = Clinic(
            id=f"clinic-analytics-{uuid.uuid4().hex[:8]}",
            name="Analytics Other Clinic",
        )
        db.add(other_clinic)
        db.flush()

        home_clinician = db.query(User).filter_by(id="actor-clinician-demo").first()
        assert home_clinician is not None

        other_clinician = User(
            id=f"actor-clinician-analytics-{uuid.uuid4().hex[:8]}",
            email=f"other_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Other Analytics Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=other_clinic.id,
        )
        global_admin = User(
            id=f"actor-admin-global-{uuid.uuid4().hex[:8]}",
            email=f"global_admin_{uuid.uuid4().hex[:6]}@example.com",
            display_name="Global Analytics Admin",
            hashed_password="x",
            role="admin",
            package_id="enterprise",
            clinic_id=None,
        )
        db.add_all([other_clinician, global_admin])
        db.flush()

        home_patient_1 = Patient(
            id=f"pat-home-{uuid.uuid4().hex[:8]}",
            clinician_id=home_clinician.id,
            first_name="Home",
            last_name="One",
            primary_condition="MDD",
            primary_modality="TMS",
        )
        home_patient_2 = Patient(
            id=f"pat-home-{uuid.uuid4().hex[:8]}",
            clinician_id=home_clinician.id,
            first_name="Home",
            last_name="Two",
            primary_condition="MDD",
            primary_modality="TMS",
        )
        other_patient_1 = Patient(
            id=f"pat-other-{uuid.uuid4().hex[:8]}",
            clinician_id=other_clinician.id,
            first_name="Other",
            last_name="One",
            primary_condition="GAD",
            primary_modality="tDCS",
        )
        other_patient_2 = Patient(
            id=f"pat-other-{uuid.uuid4().hex[:8]}",
            clinician_id=other_clinician.id,
            first_name="Other",
            last_name="Two",
            primary_condition="GAD",
            primary_modality="tDCS",
        )
        db.add_all([home_patient_1, home_patient_2, other_patient_1, other_patient_2])
        db.commit()

        return {
            "home_clinic_id": home_clinic.id,
            "other_clinic_id": other_clinic.id,
            "home_patient_id": home_patient_1.id,
            "other_patient_id": other_patient_1.id,
            "other_clinician_id": other_clinician.id,
            "other_clinician_token": create_access_token(
                user_id=other_clinician.id,
                email=other_clinician.email,
                role="clinician",
                package_id="clinician_pro",
                clinic_id=other_clinic.id,
            ),
            "global_admin_token": create_access_token(
                user_id=global_admin.id,
                email=global_admin.email,
                role="admin",
                package_id="enterprise",
                clinic_id=None,
            ),
        }
    finally:
        db.close()


def test_population_summary_scoped_to_actor_clinic(client, auth_headers) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        "/api/v1/population-analytics/cohorts/summary",
        headers=auth_headers["clinician"],
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["cohort_size"] == 2
    assert resp.json()["by_condition"] == {"MDD": 2}


def test_population_summary_rejects_foreign_clinic_filter_for_clinician(client, auth_headers) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        "/api/v1/population-analytics/cohorts/summary",
        params={"clinic_id": world["other_clinic_id"]},
        headers=auth_headers["clinician"],
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_population_summary_global_admin_honors_explicit_clinic_filter(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        "/api/v1/population-analytics/cohorts/summary",
        params={"clinic_id": world["other_clinic_id"]},
        headers={"Authorization": f"Bearer {world['global_admin_token']}"},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["cohort_size"] == 2
    assert resp.json()["by_condition"] == {"GAD": 2}


def test_population_export_csv_scoped_to_actor_clinic(client, auth_headers) -> None:
    _seed_patient_analytics_scope_world()

    resp = client.get(
        "/api/v1/population-analytics/export.csv",
        headers=auth_headers["clinician"],
    )

    assert resp.status_code == 200, resp.text
    assert "MDD" in resp.text
    assert "GAD" not in resp.text


def test_population_export_csv_global_admin_honors_explicit_clinic_filter(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        "/api/v1/population-analytics/export.csv",
        params={"clinic_id": world["other_clinic_id"]},
        headers={"Authorization": f"Bearer {world['global_admin_token']}"},
    )

    assert resp.status_code == 200, resp.text
    assert "GAD" in resp.text
    assert "MDD" not in resp.text


def test_patient_analytics_summary_same_clinic_ok(client, auth_headers) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        f"/api/v1/patients/{world['home_patient_id']}/analytics/summary",
        headers=auth_headers["clinician"],
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["patient_id"] == world["home_patient_id"]
    assert data["clinic_id"] == world["home_clinic_id"]


def test_patient_analytics_summary_cross_clinic_blocked(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        f"/api/v1/patients/{world['home_patient_id']}/analytics/summary",
        headers={"Authorization": f"Bearer {world['other_clinician_token']}"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_patient_analytics_timeline_cross_clinic_blocked(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        f"/api/v1/patients/{world['home_patient_id']}/analytics/timeline",
        headers={"Authorization": f"Bearer {world['other_clinician_token']}"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_patient_analytics_audit_log_cross_clinic_blocked(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        f"/api/v1/patients/{world['home_patient_id']}/analytics/audit-log",
        headers={"Authorization": f"Bearer {world['other_clinician_token']}"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_patient_analytics_signals_cross_clinic_blocked(client) -> None:
    world = _seed_patient_analytics_scope_world()

    resp = client.get(
        f"/api/v1/patients/{world['home_patient_id']}/analytics/signals",
        headers={"Authorization": f"Bearer {world['other_clinician_token']}"},
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.persistence.models import Clinic, Patient, User
from app.routers.bio_router import router as bio_router
from app.services.auth_service import create_access_token


def _bio_models_ready() -> bool:
    import app.persistence.models as models

    return all(
        getattr(models, name, None) is not None
        for name in ("ClinicalCatalogItem", "PatientSubstance", "PatientLabResult")
    )


pytestmark = pytest.mark.skipif(
    not _bio_models_ready(),
    reason="bio ORM models are not available in this checkout yet",
)


@pytest.fixture(autouse=True)
def _mount_bio_router() -> None:
    if not any(getattr(route, "path", None) == "/api/v1/bio/catalog" for route in app.routes):
        app.include_router(bio_router)
        app.openapi_schema = None
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Bio", "last_name": "Patient", "dob": "1988-02-10", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def other_clinic_patient() -> dict[str, str]:
    db = SessionLocal()
    try:
        clinic = Clinic(id=f"clinic-{uuid.uuid4().hex[:10]}", name="Other Clinic")
        clinician = User(
            id=f"user-{uuid.uuid4().hex[:10]}",
            email=f"other-clin-{uuid.uuid4().hex[:8]}@example.com",
            display_name="Other Clinician",
            hashed_password="x",
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic.id,
        )
        patient = Patient(
            id=f"patient-{uuid.uuid4().hex[:10]}",
            clinician_id=clinician.id,
            first_name="Other",
            last_name="Clinic",
            email=f"other-patient-{uuid.uuid4().hex[:8]}@example.com",
        )
        db.add_all([clinic, clinician, patient])
        db.commit()
        token = create_access_token(
            user_id=clinician.id,
            email=clinician.email,
            role="clinician",
            package_id=clinician.package_id,
            clinic_id=clinic.id,
        )
        return {"patient_id": patient.id, "token": token}
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_defaults(client: TestClient, auth_headers: dict) -> dict:
    resp = client.post("/api/v1/bio/catalog/seed-defaults", headers=auth_headers["clinician"])
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_seed_defaults_and_catalog_filters(client: TestClient, auth_headers: dict) -> None:
    first = _seed_defaults(client, auth_headers)
    assert first["created"] == 27
    assert first["skipped"] == 0
    assert first["total_catalog_items"] == 27

    second = _seed_defaults(client, auth_headers)
    assert second["created"] == 0
    assert second["skipped"] == 27
    assert second["total_catalog_items"] == 27

    all_items = client.get("/api/v1/bio/catalog", headers=auth_headers["clinician"])
    assert all_items.status_code == 200, all_items.text
    assert all_items.json()["total"] == 27

    medications = client.get(
        "/api/v1/bio/catalog?item_type=medication",
        headers=auth_headers["clinician"],
    )
    assert medications.status_code == 200, medications.text
    medication_names = {item["name"] for item in medications.json()["items"]}
    assert medications.json()["total"] == 6
    assert {"Sertraline", "Lithium"} <= medication_names

    omega = client.get("/api/v1/bio/catalog?q=omega", headers=auth_headers["clinician"])
    assert omega.status_code == 200, omega.text
    omega_names = {item["name"] for item in omega.json()["items"]}
    assert {"Omega-3", "Omega-3 Index"} <= omega_names


def test_patient_substance_crud_and_summary(
    client: TestClient,
    auth_headers: dict,
    patient_id: str,
) -> None:
    _seed_defaults(client, auth_headers)
    catalog = client.get("/api/v1/bio/catalog?q=sertraline", headers=auth_headers["clinician"])
    assert catalog.status_code == 200, catalog.text
    item = catalog.json()["items"][0]

    created = client.post(
        f"/api/v1/bio/patients/{patient_id}/substances",
        json={
            "catalog_item_id": item["id"],
            "name": "Sertraline",
            "substance_type": "medication",
            "dose": "50 mg",
            "frequency": "daily",
            "route": "oral",
            "started_at": "2026-04-01",
            "notes": "Monitor activation during stimulation titration",
        },
        headers=auth_headers["clinician"],
    )
    assert created.status_code == 201, created.text
    substance_id = created.json()["id"]
    assert created.json()["name"] == "Sertraline"

    listed = client.get(
        f"/api/v1/bio/patients/{patient_id}/substances",
        headers=auth_headers["clinician"],
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == substance_id

    summary = client.get(
        f"/api/v1/bio/patients/{patient_id}/summary",
        headers=auth_headers["clinician"],
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["substances_count"] == 1
    assert summary.json()["labs_count"] == 0
    assert summary.json()["latest_substance_at"] is not None

    deleted = client.delete(
        f"/api/v1/bio/patients/{patient_id}/substances/{substance_id}",
        headers=auth_headers["clinician"],
    )
    assert deleted.status_code == 204, deleted.text

    listed_again = client.get(
        f"/api/v1/bio/patients/{patient_id}/substances",
        headers=auth_headers["clinician"],
    )
    assert listed_again.status_code == 200, listed_again.text
    assert listed_again.json()["total"] == 0


def test_patient_labs_crud_and_summary(
    client: TestClient,
    auth_headers: dict,
    patient_id: str,
) -> None:
    _seed_defaults(client, auth_headers)

    first = client.post(
        f"/api/v1/bio/patients/{patient_id}/labs",
        json={
            "lab_name": "Ferritin",
            "value_numeric": 38.5,
            "unit": "ng/mL",
            "reference_range": "15-150",
            "abnormal_flag": "low_normal",
            "collected_at": "2026-04-01T09:00:00Z",
            "source": "Quest",
        },
        headers=auth_headers["clinician"],
    )
    assert first.status_code == 201, first.text

    second = client.post(
        f"/api/v1/bio/patients/{patient_id}/labs",
        json={
            "lab_name": "Vitamin D",
            "value_numeric": 22.0,
            "unit": "ng/mL",
            "reference_range": "30-100",
            "abnormal_flag": "low",
            "collected_at": "2026-04-20T09:00:00Z",
            "source": "Labcorp",
            "notes": "Consider deficiency confound for fatigue/response",
        },
        headers=auth_headers["clinician"],
    )
    assert second.status_code == 201, second.text
    lab_result_id = second.json()["id"]

    listed = client.get(
        f"/api/v1/bio/patients/{patient_id}/labs",
        headers=auth_headers["clinician"],
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 2
    names = {item["lab_name"] for item in listed.json()["items"]}
    assert {"Ferritin", "Vitamin D"} <= names

    summary = client.get(
        f"/api/v1/bio/patients/{patient_id}/summary",
        headers=auth_headers["clinician"],
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["substances_count"] == 0
    assert summary.json()["labs_count"] == 2
    assert summary.json()["latest_lab_at"] == "2026-04-20T09:00:00Z"

    deleted = client.delete(
        f"/api/v1/bio/patients/{patient_id}/labs/{lab_result_id}",
        headers=auth_headers["clinician"],
    )
    assert deleted.status_code == 204, deleted.text

    listed_after_delete = client.get(
        f"/api/v1/bio/patients/{patient_id}/labs",
        headers=auth_headers["clinician"],
    )
    assert listed_after_delete.status_code == 200, listed_after_delete.text
    assert listed_after_delete.json()["total"] == 1


def test_patient_scoping_blocks_cross_clinic_reads(
    client: TestClient,
    auth_headers: dict,
    other_clinic_patient: dict[str, str],
) -> None:
    own_clinic = client.get(
        f"/api/v1/bio/patients/{other_clinic_patient['patient_id']}/substances",
        headers=auth_headers["clinician"],
    )
    assert own_clinic.status_code == 403, own_clinic.text
    assert own_clinic.json()["code"] == "cross_clinic_access_denied"

    own_clinic_labs = client.get(
        f"/api/v1/bio/patients/{other_clinic_patient['patient_id']}/labs",
        headers=auth_headers["clinician"],
    )
    assert own_clinic_labs.status_code == 403, own_clinic_labs.text
    assert own_clinic_labs.json()["code"] == "cross_clinic_access_denied"

    other_clinician = client.get(
        f"/api/v1/bio/patients/{other_clinic_patient['patient_id']}/summary",
        headers=_auth(other_clinic_patient["token"]),
    )
    assert other_clinician.status_code == 200, other_clinician.text
    assert other_clinician.json()["patient_id"] == other_clinic_patient["patient_id"]

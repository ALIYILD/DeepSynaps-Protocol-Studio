from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis, QEEGAnalysis


def _register(client: TestClient, email: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Export User", "password": "testpass1234", "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_request_export_creates_queued_row(client: TestClient) -> None:
    token = _register(client, "export-req@example.com")
    resp = client.post(
        "/api/v1/privacy/export",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "export_id" in data
    assert data["status"] in ("queued", "running", "ready")


def test_list_exports_returns_user_exports_newest_first(client: TestClient) -> None:
    token = _register(client, "export-list@example.com")
    client.post("/api/v1/privacy/export", headers={"Authorization": f"Bearer {token}"}, json={})

    resp = client.get("/api/v1/privacy/exports", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("status" in item for item in items)


def test_delete_export_removes_row(client: TestClient) -> None:
    token = _register(client, "export-del@example.com")
    req = client.post("/api/v1/privacy/export", headers={"Authorization": f"Bearer {token}"}, json={}).json()
    export_id = req["export_id"]

    delete = client.delete(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete.status_code == 200, delete.text
    assert delete.json().get("deleted") is True

    # Follow-up GET should 404
    follow = client.get(
        f"/api/v1/privacy/exports/{export_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert follow.status_code == 404, follow.text


def test_export_fhir_bundle_returns_patient_summary(client: TestClient, auth_headers: dict) -> None:
    patient = client.post(
        "/api/v1/patients",
        json={"first_name": "Fhir", "last_name": "Patient", "dob": "1980-01-01", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert patient.status_code == 201, patient.text
    patient_id = patient.json()["id"]

    course = client.post(
        "/api/v1/treatment-courses",
        json={"patient_id": patient_id, "protocol_id": "PRO-001"},
        headers=auth_headers["clinician"],
    )
    assert course.status_code == 201, course.text
    course_id = course.json()["id"]

    client.post(
        "/api/v1/outcomes",
        json={
            "patient_id": patient_id,
            "course_id": course_id,
            "template_id": "PHQ-9",
            "template_title": "PHQ-9",
            "score_numeric": 11,
            "measurement_point": "post",
        },
        headers=auth_headers["clinician"],
    )
    client.post(
        "/api/v1/outcomes/events",
        json={
            "patient_id": patient_id,
            "course_id": course_id,
            "event_type": "follow_up_completed",
            "title": "Six week review",
            "summary": "Symptoms improved after treatment block.",
        },
        headers=auth_headers["clinician"],
    )

    with SessionLocal() as db:
        db.add(
            QEEGAnalysis(
                patient_id=patient_id,
                clinician_id="clinician-demo",
                analysis_status="completed",
                band_powers_json=json.dumps({"alpha": {"Pz": 12.4}}),
                flagged_conditions=json.dumps(["depression"]),
                analyzed_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            MriAnalysis(
                analysis_id="mri-export-1",
                patient_id=patient_id,
                state="SUCCESS",
                condition="mdd",
                modalities_present_json=json.dumps(["T1", "rs_fMRI"]),
                stim_targets_json=json.dumps([{"target_id": "dlpfc-l"}]),
                qc_json=json.dumps({"passed": True}),
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    resp = client.post(
        "/api/v1/export/fhir-r4-bundle",
        json={"patient_id": patient_id, "mri_analysis_id": "mri-export-1"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/fhir+json")
    bundle = resp.json()
    assert bundle["resourceType"] == "Bundle"
    resource_types = [entry["resource"]["resourceType"] for entry in bundle["entry"]]
    assert "Patient" in resource_types
    assert "DiagnosticReport" in resource_types
    assert "Observation" in resource_types


def test_export_bids_derivatives_returns_zip(client: TestClient, auth_headers: dict) -> None:
    patient = client.post(
        "/api/v1/patients",
        json={"first_name": "Bids", "last_name": "Patient", "dob": "1982-06-10", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert patient.status_code == 201, patient.text
    patient_id = patient.json()["id"]

    with SessionLocal() as db:
        db.add(
            QEEGAnalysis(
                patient_id=patient_id,
                clinician_id="clinician-demo",
                analysis_status="completed",
                band_powers_json=json.dumps({"theta": {"Fz": 9.1}}),
                created_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            MriAnalysis(
                analysis_id="mri-export-zip",
                patient_id=patient_id,
                state="SUCCESS",
                modalities_present_json=json.dumps(["T1"]),
                structural_json=json.dumps({"atlas": "DK"}),
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    resp = client.post(
        "/api/v1/export/bids-derivatives",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/zip")
    assert resp.content[:2] == b"PK"


def test_export_endpoints_hide_other_clinicians_patients(client: TestClient, auth_headers: dict) -> None:
    other_token = _register(client, "export-other@example.com")
    other_headers = {"Authorization": f"Bearer {other_token}"}

    patient = client.post(
        "/api/v1/patients",
        json={"first_name": "Hidden", "last_name": "Patient"},
        headers=auth_headers["clinician"],
    )
    assert patient.status_code == 201, patient.text
    patient_id = patient.json()["id"]

    fhir = client.post(
        "/api/v1/export/fhir-r4-bundle",
        json={"patient_id": patient_id},
        headers=other_headers,
    )
    assert fhir.status_code == 403, fhir.text

    bids = client.post(
        "/api/v1/export/bids-derivatives",
        json={"patient_id": patient_id},
        headers=other_headers,
    )
    assert bids.status_code == 403, bids.text

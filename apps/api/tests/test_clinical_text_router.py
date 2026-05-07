"""Integration tests for /api/v1/clinical-text/* endpoints."""
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


_NOTE = "Patient on sertraline 50mg, MDD. Email: jane.doe@example.com."


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_text_scope_setup() -> dict[str, str]:
    db = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

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
        db.add_all([clin_a, clin_b])
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="Text",
            last_name="Patient",
        )
        db.add(patient)
        db.commit()

        return {
            "patient_id": patient.id,
            "token_clin_a": create_access_token(
                user_id=clin_a.id,
                email=f"{clin_a.id}@example.com",
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_a.id,
            ),
            "token_clin_b": create_access_token(
                user_id=clin_b.id,
                email=f"{clin_b.id}@example.com",
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_b.id,
            ),
        }
    finally:
        db.close()


def test_health_requires_clinician(client: TestClient) -> None:
    resp = client.get("/api/v1/clinical-text/health")
    assert resp.status_code in (401, 403)


def test_health_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(
        "/api/v1/clinical-text/health", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["backend"] in {"heuristic", "openmed_http"}


def test_analyze_returns_typed_response(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/clinical-text/analyze",
        json={"text": _NOTE, "source_type": "clinician_note"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.analyze/v1"
    assert body["char_count"] == len(_NOTE)
    assert any(e["label"] == "medication" for e in body["entities"])
    assert any(p["label"] == "email" for p in body["pii"])
    assert body["safety_footer"].startswith("decision-support")


def test_analyze_rejects_empty(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/analyze",
        json={"text": "", "source_type": "clinician_note"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("path", [
    "/api/v1/clinical-text/analyze",
    "/api/v1/clinical-text/extract-pii",
    "/api/v1/clinical-text/deidentify",
])
def test_clinical_text_rejects_whitespace_only_text(
    client: TestClient, auth_headers: dict, path: str
) -> None:
    resp = client.post(
        path,
        json={"text": "   \n\t   ", "source_type": "clinician_note"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "invalid_text"


def test_extract_pii_endpoint(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/extract-pii",
        json={"text": _NOTE},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.pii/v1"
    assert any(p["label"] == "email" for p in body["pii"])


def test_deidentify_endpoint(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/clinical-text/deidentify",
        json={"text": _NOTE},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_id"] == "deepsynaps.openmed.deid/v1"
    assert "jane.doe@example.com" not in body["redacted_text"]
    assert "[EMAIL]" in body["redacted_text"]
    assert body["replacements"]


def test_analyze_rejects_non_clinician(client: TestClient, auth_headers: dict) -> None:
    if "guest" in auth_headers:
        resp = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _NOTE},
            headers=auth_headers["guest"],
        )
        assert resp.status_code in (401, 403)


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/v1/clinical-text/analyze", {"text": _NOTE, "source_type": "clinician_note"}),
        ("/api/v1/clinical-text/extract-pii", {"text": _NOTE}),
        ("/api/v1/clinical-text/deidentify", {"text": _NOTE}),
    ],
)
def test_clinical_text_patient_context_same_clinic_succeeds(
    client: TestClient,
    path: str,
    body: dict,
) -> None:
    setup = _seed_text_scope_setup()

    resp = client.post(
        path,
        json={**body, "patient_id": setup["patient_id"]},
        headers=_auth(setup["token_clin_a"]),
    )

    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/v1/clinical-text/analyze", {"text": _NOTE, "source_type": "clinician_note"}),
        ("/api/v1/clinical-text/extract-pii", {"text": _NOTE}),
        ("/api/v1/clinical-text/deidentify", {"text": _NOTE}),
    ],
)
def test_clinical_text_patient_context_other_clinic_blocked(
    client: TestClient,
    path: str,
    body: dict,
) -> None:
    setup = _seed_text_scope_setup()

    resp = client.post(
        path,
        json={**body, "patient_id": setup["patient_id"]},
        headers=_auth(setup["token_clin_b"]),
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"

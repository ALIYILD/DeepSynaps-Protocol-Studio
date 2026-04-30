"""Regression tests for the documents_router clinic-scope rewrite.

Pre-fix every per-id load and the list endpoints used the legacy
owner-only filter ``FormDefinition.clinician_id == actor.actor_id``.
``_assert_document_patient_access`` similarly used
``Patient.clinician_id == actor.actor_id``. That:

* Refused legitimate same-clinic colleagues (a covering clinician
  could not see / sign / download their teammate's documents).
* Never consulted ``User.clinic_id``, so the role-tiered admin /
  supervisor branches did not exist — admins of one clinic were
  treated identically to a random clinician of another.

Post-fix every load goes through ``_scope_documents_query_to_clinic``
(joins ``FormDefinition -> User`` and filters on
``actor.clinic_id`` for non-admins) and
``_assert_document_patient_access`` routes through the canonical
``resolve_patient_clinic_id`` + ``require_patient_owner`` pair.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, FormDefinition, Patient, User
from app.services.auth_service import create_access_token


@pytest.fixture
def two_clinics_with_doc() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Doc Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Doc Clinic B")
        clin_a1 = User(  # owning clinician at clinic A
            id=str(uuid.uuid4()),
            email=f"doc_a1_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A1",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_a2 = User(  # covering colleague at clinic A
            id=str(uuid.uuid4()),
            email=f"doc_a2_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A2",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(  # clinician at clinic B
            id=str(uuid.uuid4()),
            email=f"doc_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a1, clin_a2, clin_b])
        db.flush()

        patient_a = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a1.id,
            first_name="A",
            last_name="Patient",
        )
        db.add(patient_a)
        db.flush()

        # Document owned by A1, in clinic A.
        doc = FormDefinition(
            id=str(uuid.uuid4()),
            clinician_id=clin_a1.id,
            title="Initial assessment",
            form_type="document",
            questions_json='{"doc_type": "clinical", "patient_id": "%s"}' % patient_a.id,
            status="pending",
        )
        db.add(doc)
        db.commit()

        token_a1 = create_access_token(
            user_id=clin_a1.id, email=clin_a1.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_a2 = create_access_token(
            user_id=clin_a2.id, email=clin_a2.email, role="clinician",
            package_id="explorer", clinic_id=clinic_a.id,
        )
        token_b = create_access_token(
            user_id=clin_b.id, email=clin_b.email, role="clinician",
            package_id="explorer", clinic_id=clinic_b.id,
        )
        return {
            "patient_id": patient_a.id,
            "doc_id": doc.id,
            "token_a1": token_a1,
            "token_a2": token_a2,
            "token_b": token_b,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Same-clinic colleague visibility
# ---------------------------------------------------------------------------
def test_same_clinic_colleague_can_get_document(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    """Pre-fix the owner-only filter refused the covering colleague.
    Post-fix the clinic-scope gate admits them."""
    resp = client.get(
        f"/api/v1/documents/{two_clinics_with_doc['doc_id']}",
        headers=_auth(two_clinics_with_doc["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == two_clinics_with_doc["doc_id"]


def test_same_clinic_colleague_sees_document_in_list(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/documents",
        headers=_auth(two_clinics_with_doc["token_a2"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [d["id"] for d in resp.json()["items"]]
    assert two_clinics_with_doc["doc_id"] in ids


# ---------------------------------------------------------------------------
# Cross-clinic refusal
# ---------------------------------------------------------------------------
def test_cross_clinic_clinician_cannot_get_document(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    resp = client.get(
        f"/api/v1/documents/{two_clinics_with_doc['doc_id']}",
        headers=_auth(two_clinics_with_doc["token_b"]),
    )
    assert resp.status_code == 404, resp.text


def test_cross_clinic_clinician_does_not_see_document_in_list(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/documents",
        headers=_auth(two_clinics_with_doc["token_b"]),
    )
    assert resp.status_code == 200, resp.text
    ids = [d["id"] for d in resp.json()["items"]]
    assert two_clinics_with_doc["doc_id"] not in ids


def test_cross_clinic_clinician_cannot_delete_document(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    resp = client.delete(
        f"/api/v1/documents/{two_clinics_with_doc['doc_id']}",
        headers=_auth(two_clinics_with_doc["token_b"]),
    )
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# _assert_document_patient_access — cross-clinic patient_id refused
# ---------------------------------------------------------------------------
def test_create_document_for_other_clinic_patient_blocked(
    client: TestClient, two_clinics_with_doc: dict[str, Any]
) -> None:
    """Pre-fix any clinician could create a document with another
    clinic's patient_id (gate was owner-only). Post-fix the clinic-
    scope gate refuses with 404."""
    resp = client.post(
        "/api/v1/documents",
        headers=_auth(two_clinics_with_doc["token_b"]),
        json={
            "title": "evil",
            "patient_id": two_clinics_with_doc["patient_id"],
        },
    )
    assert resp.status_code == 404, resp.text

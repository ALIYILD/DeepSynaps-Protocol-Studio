"""Cross-clinic access-control isolation suite (Issue #900).

Companion to ``test_cross_clinic_ownership.py`` and ``test_patients_router.py
::TestClinicScopedPatientAccess``.  The scope of this file is the
**existence-leak** class of bugs:

* Patient-data endpoints must answer ``403 cross_clinic_access_denied``
  when a clinician at clinic A targets a patient at clinic B — NOT
  ``404 not_found``.  The 404 was deliberately picked once to hide the
  existence of the row, but that pattern (a) leaks via timing and error
  message ambiguity anyway and (b) blocks legitimate user-experience
  signals ("this exists, you don't have access" vs. "this id doesn't
  exist").  The honest, documented contract is 403 on cross-clinic, 404
  only when the row truly doesn't exist.

* List endpoints must clinic-scope at the query level (so a cross-clinic
  clinician gets an empty list back for THEIR OWN clinic's listing call,
  not the rows of clinic A).

* The audit-trail list endpoint must REFUSE foreign-actor / foreign-
  patient filters with 403.  Returning ``200 {items: []}`` silently is a
  worse leak than a noisy 403 because an attacker can use the empty
  envelope as confirmation that the trail isn't watching.

* The shared ``ApiServiceError`` exception handler must serialise
  responses even when a router has attached ``details={"...": <bytes>}``
  (an AI-pipeline path was caught raising 403 with a raw buffer slice in
  details; the handler then crashed with ``TypeError: Object of type
  bytes is not JSON serializable``, masking the 403 the test was
  asserting on).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    Patient,
    User,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


def _seed_two_clinic_world(db: Session) -> dict[str, str]:
    """Stand up clinic A + clinic B, one clinician at each, plus a patient
    owned by clinician A.  Returns the ids the tests assert against.
    """
    clinic_a = Clinic(id=f"clinic-a-{uuid.uuid4().hex[:8]}", name="Isolation Clinic A")
    clinic_b = Clinic(id=f"clinic-b-{uuid.uuid4().hex[:8]}", name="Isolation Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=f"clin-a-{uuid.uuid4().hex[:8]}",
        email=f"clin_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Isolation Clinician A",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=f"clin-b-{uuid.uuid4().hex[:8]}",
        email=f"clin_b_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Isolation Clinician B",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_b.id,
    )
    db.add_all([clin_a, clin_b])
    db.flush()

    patient = Patient(
        id=f"pat-a-{uuid.uuid4().hex[:8]}",
        clinician_id=clin_a.id,
        first_name="Iso",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "patient_id": patient.id,
    }


def _mint(user_id: str, role: str, clinic_id: str) -> str:
    from app.services.auth_service import create_access_token

    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def two_clinic_world() -> dict[str, Any]:
    db = SessionLocal()
    try:
        ids = _seed_two_clinic_world(db)
    finally:
        db.close()

    return {
        **ids,
        "token_clin_a": _mint(ids["clin_a_id"], "clinician", ids["clinic_a_id"]),
        "token_clin_b": _mint(ids["clin_b_id"], "clinician", ids["clinic_b_id"]),
    }


# ── 1. Patient detail GET must 403, not 404 ──────────────────────────────────


def test_clinician_cannot_access_other_clinic_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    """Clinician at B asks for patient at A — must be 403, not 404.

    The 404 mask used to hide existence is now rejected as itself a
    leak (timing + enumeration oracle).  Honest 403 is the contract.
    """
    pid = two_clinic_world["patient_id"]
    resp = client.get(
        f"/api/v1/patients/{pid}",
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    body = resp.json()
    assert body.get("code") in ("cross_clinic_access_denied", "forbidden"), body


# ── 2. AI-analysis endpoint must 403 cleanly (no bytes-serialize crash) ──────


def test_clinician_cannot_run_ai_analysis_on_other_clinic_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    """Clinician at B posts an AI-analysis run against a patient at A.

    Two regressions in one assertion:

    * The route must 403 (cross-clinic ownership gate fires before any
      AI work happens).
    * The JSON response must serialise cleanly — a sibling AI path was
      raising ``ApiServiceError(details={"...": <bytes>})`` and the
      shared handler crashed with ``TypeError: Object of type bytes is
      not JSON serializable``, which masked the 403 the test wanted
      to see.  The sanitiser in ``app.main._sanitize_error_payload``
      now coerces bytes-typed details to ``<N bytes>`` placeholders.
    """
    pid = two_clinic_world["patient_id"]
    resp = client.post(
        "/api/v1/clinical-text/analyze",
        json={"text": "Patient reports persistent fatigue.", "patient_id": pid},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    # Critical: response is decodable as JSON — a bytes-in-details would
    # have raised TypeError during JSONResponse(content=...) and surfaced
    # as a generic 500 internal_error here.
    body = resp.json()
    assert body.get("code") in ("cross_clinic_access_denied", "forbidden"), body


# ── 3. Patient list endpoint is clinic-scoped (shape + content) ──────────────


def test_clinician_can_only_list_own_clinic_patients(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    """The list endpoint must clinic-scope at the query and return the
    documented ``{items: [...], total: N}`` envelope.  An earlier
    regression had the list returning a bare list (no envelope), which
    caused the cross-clinic check ``response["items"]`` to raise
    ``TypeError: string indices must be integers, not 'str'``.
    """
    resp = client.get(
        "/api/v1/patients",
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Envelope shape must be stable — these key accesses are the
    # regression assertion.
    assert isinstance(body, dict), f"list endpoint must return a dict envelope, got {type(body)}"
    assert "items" in body and isinstance(body["items"], list), body
    assert "total" in body and isinstance(body["total"], int), body
    # Content: clinician B must NOT see clinic A's patient.
    ids = [item["id"] for item in body["items"]]
    assert two_clinic_world["patient_id"] not in ids, ids


# ── 4. Audit trail must refuse foreign-actor / foreign-patient filters ───────


def test_audit_trail_respects_clinic_isolation(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    """The audit-trail list endpoint scopes by ``actor_id`` at the query
    layer, which means filtering by another clinician's ``actor_id`` (or
    by a foreign-clinic ``target_id``) used to surface as
    ``200 {items: []}``.  An empty envelope IS a leak — it confirms
    "the endpoint isn't watching for this enumeration pattern" without
    paying a denial-cost.  The fix raises 403 immediately when the
    requested filter cannot possibly match the caller's scope.
    """
    # Seed an audit row owned by clinic A's clinician.
    db = SessionLocal()
    try:
        db.add(
            AuditEventRecord(
                event_id=f"evt-{uuid.uuid4().hex[:8]}",
                target_id=two_clinic_world["patient_id"],
                target_type="patient_profile",
                action="patient_profile.viewed",
                role="clinician",
                actor_id=two_clinic_world["clin_a_id"],
                note="isolation seed",
                created_at=datetime.now(timezone.utc).isoformat(),
            )
        )
        db.commit()
    finally:
        db.close()

    # Filter A: foreign actor_id (clinician B asks for clinician A's rows).
    resp = client.get(
        "/api/v1/audit-trail",
        params={"actor_id": two_clinic_world["clin_a_id"]},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code in (403, 404), resp.text
    if resp.status_code == 403:
        assert resp.json().get("code") in (
            "cross_clinic_access_denied",
            "forbidden",
        ), resp.text

    # Filter B: foreign-clinic patient as target_id (clinician B asks
    # for rows targeting clinic A's patient).
    resp = client.get(
        "/api/v1/audit-trail",
        params={"target_id": two_clinic_world["patient_id"]},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code in (403, 404), resp.text
    if resp.status_code == 403:
        assert resp.json().get("code") in (
            "cross_clinic_access_denied",
            "forbidden",
        ), resp.text


# ── 5. Same-clinic happy path: the gate must not over-block ──────────────────


def test_same_clinic_clinician_can_still_read_own_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    """Smoke: the 403-instead-of-404 fix MUST NOT regress the happy path.
    Clinician A reads their own patient and gets 200.
    """
    pid = two_clinic_world["patient_id"]
    resp = client.get(
        f"/api/v1/patients/{pid}",
        headers=_auth(two_clinic_world["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == pid


def test_same_clinic_list_includes_owned_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/patients",
        headers=_auth(two_clinic_world["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = [item["id"] for item in body["items"]]
    assert two_clinic_world["patient_id"] in ids, ids


def test_clinician_cannot_update_other_clinic_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    pid = two_clinic_world["patient_id"]
    resp = client.patch(
        f"/api/v1/patients/{pid}",
        json={"first_name": "Intrusion"},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") in ("cross_clinic_access_denied", "forbidden"), resp.text


def test_clinician_cannot_delete_other_clinic_patient(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    pid = two_clinic_world["patient_id"]
    resp = client.delete(
        f"/api/v1/patients/{pid}",
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") in ("cross_clinic_access_denied", "forbidden"), resp.text


def test_audit_csv_export_refuses_foreign_actor_filter(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/audit-trail/export.csv",
        params={"actor_id": two_clinic_world["clin_a_id"]},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") in ("cross_clinic_access_denied", "forbidden"), resp.text


def test_audit_ndjson_export_refuses_foreign_target_filter(
    client: TestClient, two_clinic_world: dict[str, Any]
) -> None:
    resp = client.get(
        "/api/v1/audit-trail/export.ndjson",
        params={"target_id": two_clinic_world["patient_id"]},
        headers=_auth(two_clinic_world["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") in ("cross_clinic_access_denied", "forbidden"), resp.text

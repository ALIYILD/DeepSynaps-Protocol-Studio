"""Cross-clinic ownership regression tests (Follow-up F2).

Covers two layers:

1. Unit tests for the in-memory ``require_patient_owner`` gate — no DB,
   no FastAPI, just exercising the role/clinic decision matrix directly.

2. End-to-end HTTP tests that wire two real clinicians at distinct
   ``Clinic`` rows, seed a Patient under clinician A, and confirm that
   clinician B (different clinic) is blocked with
   ``cross_clinic_access_denied`` from the highest-blast-radius patient
   endpoints (deeptwin, qeeg, wearables, mri).

The original IDOR: after the ROLE_ORDER fix only clinicians + admins pass
``require_minimum_role(actor, 'clinician')`` — but role-only gating cannot
enforce ownership. A clinician at Clinic A could pull any patient at
Clinic B with the right id. This file is the regression tests for the
fix.
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_patient_owner
from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import Clinic, MriAnalysis, Patient, QEEGAnalysis, User


# ── Unit tests for require_patient_owner (no DB, no HTTP) ─────────────────────

CLINIC_A = "clinic-aaaa"
CLINIC_B = "clinic-bbbb"


def _actor(role: str, clinic_id: str | None) -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id=f"actor-{role}-{clinic_id or 'none'}",
        display_name=f"{role} {clinic_id}",
        role=role,  # type: ignore[arg-type]
        package_id="explorer",
        token_id=None,
        clinic_id=clinic_id,
    )


def test_unit_clinician_same_clinic_passes() -> None:
    require_patient_owner(_actor("clinician", CLINIC_A), CLINIC_A)


def test_unit_clinician_other_clinic_denied() -> None:
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("clinician", CLINIC_A), CLINIC_B)
    assert exc.value.code == "cross_clinic_access_denied"
    assert exc.value.status_code == 403


def test_unit_admin_other_clinic_passes_by_default() -> None:
    # admin bypasses the gate when allow_admin=True (the default).
    require_patient_owner(_actor("admin", CLINIC_A), CLINIC_B)


def test_unit_admin_other_clinic_denied_when_admin_disallowed() -> None:
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("admin", CLINIC_A), CLINIC_B, allow_admin=False)
    assert exc.value.code == "cross_clinic_access_denied"


def test_unit_guest_always_denied() -> None:
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("guest", None), CLINIC_A)
    assert exc.value.code == "cross_clinic_access_denied"


def test_unit_patient_actor_same_clinic_passes() -> None:
    require_patient_owner(_actor("patient", CLINIC_A), CLINIC_A)


def test_unit_patient_actor_other_clinic_denied() -> None:
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("patient", CLINIC_A), CLINIC_B)
    assert exc.value.code == "cross_clinic_access_denied"


def test_unit_orphaned_patient_denies_clinician() -> None:
    # If the patient has no clinic_id (orphan), only admin can read.
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("clinician", CLINIC_A), None)
    assert exc.value.code == "cross_clinic_access_denied"


def test_unit_orphaned_patient_admin_passes() -> None:
    require_patient_owner(_actor("admin", CLINIC_A), None)


def test_unit_actor_without_clinic_denied() -> None:
    # A clinician whose own clinic_id is None cannot prove same-clinic ownership.
    with pytest.raises(ApiServiceError) as exc:
        require_patient_owner(_actor("clinician", None), CLINIC_A)
    assert exc.value.code == "cross_clinic_access_denied"


# ── End-to-end fixtures: two clinics, two clinicians, one patient ─────────────


def _seed_two_clinics_with_patient(
    db: Session,
) -> dict[str, Any]:
    """Seed clinic A + clinic B + a clinician in each + a Patient under
    clinician A. Returns ids the test can assert against. Caller handles
    caller's own DB session lifetime."""
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    # Real DB clinicians — we'll mint real JWTs for them so the
    # AuthenticatedActor.clinic_id flows through the JWT claim path, not
    # the demo-token path (demo tokens don't carry clinic_id).
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
    admin_a = User(
        id=str(uuid.uuid4()),
        email=f"admin_a_{uuid.uuid4().hex[:8]}@example.com",
        display_name="Admin A",
        hashed_password="x",
        role="admin",
        package_id="enterprise",
        clinic_id=clinic_a.id,
    )
    db.add_all([clin_a, clin_b, admin_a])
    db.flush()

    # Patient owned by clinician A.
    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin_a.id,
        first_name="X",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "admin_a_id": admin_a.id,
        "patient_id": patient.id,
    }


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cross_clinic_setup() -> dict[str, Any]:
    """Yield the seeded ids + minted access tokens for clinician A,
    clinician B, and admin A. Tokens carry a real clinic_id JWT claim so
    the production code path under test resolves them via the live JWT
    decode in get_authenticated_actor.
    """
    db: Session = SessionLocal()
    try:
        ids = _seed_two_clinics_with_patient(db)
    finally:
        db.close()

    tokens = {
        "token_clin_a": _mint_token(ids["clin_a_id"], "clinician", ids["clinic_a_id"]),
        "token_clin_b": _mint_token(ids["clin_b_id"], "clinician", ids["clinic_b_id"]),
        "token_admin_a": _mint_token(ids["admin_a_id"], "admin", ids["clinic_a_id"]),
    }
    return {**ids, **tokens}


# ── DeepTwin router: cross-clinic IDOR was the original audit example ────────


def test_deeptwin_summary_clinician_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/deeptwin/patients/{pid}/summary",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_deeptwin_summary_clinician_same_clinic_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/deeptwin/patients/{pid}/summary",
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["patient_id"] == pid


def test_deeptwin_summary_admin_other_clinic_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    # admin_a is at clinic A — same clinic; let's mint an admin at clinic B
    # to truly exercise the cross-clinic admin bypass.
    db: Session = SessionLocal()
    try:
        admin_b = User(
            id=str(uuid.uuid4()),
            email=f"admin_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Admin B",
            hashed_password="x",
            role="admin",
            package_id="enterprise",
            clinic_id=cross_clinic_setup["clinic_b_id"],
        )
        db.add(admin_b)
        db.commit()
        admin_b_id = admin_b.id
    finally:
        db.close()
    token_admin_b = _mint_token(
        admin_b_id, "admin", cross_clinic_setup["clinic_b_id"]
    )
    resp = client.get(
        f"/api/v1/deeptwin/patients/{pid}/summary",
        headers=_auth(token_admin_b),
    )
    assert resp.status_code == 200, resp.text


def test_deeptwin_summary_guest_blocked(client: TestClient) -> None:
    # Use the demo guest token. This first hits the cross-clinic gate
    # only after an upstream gate would have admitted it; the deeptwin
    # patient endpoints have no role gate, so the guest gets through to
    # the ownership gate which denies on role=guest. With a non-existent
    # patient id the gate is currently skipped (synthetic-allow), so we
    # use the real seeded patient id instead. Seeding inline since this
    # test doesn't take the cross_clinic_setup fixture.
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Guest test clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"clin_g_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Owner",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="G",
            last_name="Patient",
        )
        db.add(patient)
        db.commit()
        pid = patient.id
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/deeptwin/patients/{pid}/summary",
        headers=_auth("guest-demo-token"),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


# ── qEEG router: analysis_id resolves to patient_id ──────────────────────────


def _seed_qeeg_analysis(db: Session, patient_id: str, clinician_id: str) -> str:
    analysis_id = str(uuid.uuid4())
    db.add(
        QEEGAnalysis(
            id=analysis_id,
            patient_id=patient_id,
            clinician_id=clinician_id,
            file_ref="memory://test",
            original_filename="test.edf",
            file_size_bytes=1024,
            analysis_status="completed",
        )
    )
    db.commit()
    return analysis_id


def test_qeeg_get_analysis_clinician_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_qeeg_analysis(
            db, cross_clinic_setup["patient_id"], cross_clinic_setup["clin_a_id"]
        )
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_qeeg_get_analysis_clinician_same_clinic_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_qeeg_analysis(
            db, cross_clinic_setup["patient_id"], cross_clinic_setup["clin_a_id"]
        )
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}",
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text


def test_qeeg_list_patient_analyses_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/qeeg-analysis/patient/{pid}",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_qeeg_list_patient_analyses_guest_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/qeeg-analysis/patient/{pid}",
        headers=_auth("guest-demo-token"),
    )
    # Role gate (require_minimum_role(actor, 'clinician')) catches this
    # first — the guest 403 is on role, not on cross-clinic. Either way
    # 403 is the expected outcome.
    assert resp.status_code == 403, resp.text


# ── MRI router: patient_id endpoints ──────────────────────────────────────────


def test_mri_patient_analyses_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/mri/patients/{pid}/analyses",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_mri_patient_analyses_same_clinic_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/mri/patients/{pid}/analyses",
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text


def test_mri_report_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    db: Session = SessionLocal()
    try:
        analysis_id = str(uuid.uuid4())
        db.add(
            MriAnalysis(
                analysis_id=analysis_id,
                patient_id=cross_clinic_setup["patient_id"],
                state="SUCCESS",
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/mri/report/{analysis_id}",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


# ── Wearable router: clinic-cross blocked via _require_patient_access ────────


def test_wearable_summary_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/wearables/patients/{pid}/summary",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_wearable_summary_same_clinic_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.get(
        f"/api/v1/wearables/patients/{pid}/summary",
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 200, resp.text

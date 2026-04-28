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
    # Use the demo guest token. The deeptwin patient endpoints stack two
    # gates (post-merge): _require_clinician_review_actor (role gate, raises
    # "insufficient_role" for anyone below clinician) THEN _gate_patient_access
    # (ownership gate, raises "cross_clinic_access_denied" for cross-clinic or
    # guest). Either is a correct deny for a guest — assert 403 and accept
    # either code. With a non-existent patient id the ownership gate would be
    # skipped (synthetic-allow), so we seed a real patient inline. Seeding
    # inline since this test doesn't take the cross_clinic_setup fixture.
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
    assert resp.json()["code"] in {
        "cross_clinic_access_denied",
        "insufficient_role",
    }, resp.text


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


def test_qeeg_brain_payload_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    """``GET /qeeg-analysis/{id}/brain.json`` returns source-localised
    per-ROI band power + within-subject z-scores — patient PHI. Must be
    cross-clinic gated."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_qeeg_analysis(
            db, cross_clinic_setup["patient_id"], cross_clinic_setup["clin_a_id"]
        )
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/qeeg-analysis/{analysis_id}/brain.json",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_qeeg_ai_report_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    """``POST /qeeg-analysis/{id}/ai-report`` inlines the linked
    QEEGRecord's clinical-context survey + full feature set into an LLM
    prompt. Must be cross-clinic gated before the LLM call."""
    db: Session = SessionLocal()
    try:
        analysis_id = _seed_qeeg_analysis(
            db, cross_clinic_setup["patient_id"], cross_clinic_setup["clin_a_id"]
        )
    finally:
        db.close()

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_id}/ai-report",
        json={"patient_context": "test"},
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


# ── MRI router: viewer / pdf / html / overlay / medrag / compare ─────────────
# Regression for the 6 analysis-id-scoped routes that previously only
# role-checked. Any clinician at a different clinic could pull the
# patient's NiiVue payload, PDF/HTML report, nilearn overlay, MedRAG
# literature, or compute a longitudinal compare with two stolen ids.


def _seed_mri_analysis_for_setup(setup: dict[str, Any]) -> str:
    """Insert one MriAnalysis row owned by the seed's clinic-A patient."""
    db: Session = SessionLocal()
    try:
        analysis_id = str(uuid.uuid4())
        db.add(
            MriAnalysis(
                analysis_id=analysis_id,
                patient_id=setup["patient_id"],
                state="SUCCESS",
            )
        )
        db.commit()
    finally:
        db.close()
    return analysis_id


def test_mri_viewer_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/{aid}/viewer.json",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_mri_report_pdf_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/report/{aid}/pdf",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_mri_report_html_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/report/{aid}/html",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_mri_overlay_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/overlay/{aid}/target-1",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_mri_medrag_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/medrag/{aid}",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text


def test_mri_compare_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid_base = _seed_mri_analysis_for_setup(cross_clinic_setup)
    aid_fup = _seed_mri_analysis_for_setup(cross_clinic_setup)
    resp = client.get(
        f"/api/v1/mri/compare/{aid_base}/{aid_fup}",
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


# ── Outcomes events: cross-clinic write poisoning ────────────────────────────
# Pre-fix: clinic B could POST /api/v1/outcomes/events with patient_id of a
# clinic A patient + severity="critical". monitor_service surfaces those rows
# to clinic A via a patient_id-scoped query, so the false "critical" alert
# would appear next to the wrong clinic's patient and could trigger an
# escalation. Fix: validate body.patient_id against the actor's clinic.

def test_outcomes_events_cross_clinic_poisoning_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.post(
        "/api/v1/outcomes/events",
        json={
            "patient_id": pid,
            "event_type": "adverse",
            "title": "Severe adverse event",
            "summary": "fake critical event injected by clinic B",
            "severity": "critical",
        },
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_outcomes_events_owning_clinician_succeeds(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    """Owning clinician (same clinic) can record an outcome event for
    their patient — positive control so the gate isn't over-restrictive."""
    pid = cross_clinic_setup["patient_id"]
    resp = client.post(
        "/api/v1/outcomes/events",
        json={
            "patient_id": pid,
            "event_type": "milestone",
            "title": "Course start",
            "severity": "info",
        },
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["patient_id"] == pid


# ── Home devices router: cross-clinic IDOR + LLM PHI exfil ───────────────────
# Pre-fix: 4 endpoints in home_devices_router only had a clinician role check
# but no _gate_patient_access — clinic B could:
#   POST /home-devices/assign      → write a device assignment on a clinic A
#                                    patient
#   PATCH /home-devices/assignments/{id}     → mutate clinic A's assignment
#   PATCH /home-devices/review-flags/{id}/dismiss → silence clinic A's flags
#   POST /home-devices/ai-summary/{id}        → P0: aggregate clinic A's
#                                    session logs / side effects / adherence
#                                    and ship them to the LLM API + write a
#                                    poisoned AiSummaryAudit row keyed to
#                                    clinic A's patient_id.

def _seed_home_device_assignment_for_setup(setup: dict[str, Any]) -> str:
    """Insert one HomeDeviceAssignment row owned by the seed's clinic-A patient."""
    from app.persistence.models import HomeDeviceAssignment

    db: Session = SessionLocal()
    try:
        aid = str(uuid.uuid4())
        db.add(
            HomeDeviceAssignment(
                id=aid,
                patient_id=setup["patient_id"],
                course_id=None,
                assigned_by=setup["clin_a_id"],
                device_name="tDCS-X",
                device_category="tdcs",
                parameters_json="{}",
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()
    return aid


def test_home_devices_assign_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    pid = cross_clinic_setup["patient_id"]
    resp = client.post(
        "/api/v1/home-devices/assign",
        json={
            "patient_id": pid,
            "device_name": "tDCS-X",
            "device_category": "tdcs",
            "parameters": {},
        },
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_home_devices_update_assignment_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    aid = _seed_home_device_assignment_for_setup(cross_clinic_setup)
    resp = client.patch(
        f"/api/v1/home-devices/assignments/{aid}",
        json={"status": "revoked", "revoke_reason": "hostile attempt"},
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_home_devices_dismiss_review_flag_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    from app.persistence.models import HomeDeviceReviewFlag

    aid = _seed_home_device_assignment_for_setup(cross_clinic_setup)
    db: Session = SessionLocal()
    try:
        flag_id = str(uuid.uuid4())
        db.add(
            HomeDeviceReviewFlag(
                id=flag_id,
                patient_id=cross_clinic_setup["patient_id"],
                assignment_id=aid,
                flag_type="missed_sessions",
                severity="warning",
                detail="Missed sessions",
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.patch(
        f"/api/v1/home-devices/review-flags/{flag_id}/dismiss",
        json={"resolution": "ok"},
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_home_devices_ai_summary_other_clinic_blocked(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    """P0 regression: cross-clinic clinician must NOT trigger the LLM AI
    summary endpoint (which aggregates PHI from session logs + adherence)
    against another clinic's assignment_id."""
    aid = _seed_home_device_assignment_for_setup(cross_clinic_setup)
    resp = client.post(
        f"/api/v1/home-devices/ai-summary/{aid}",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


# ── Notifications presence: guest probing ────────────────────────────────────
# Pre-fix, GET/POST /api/v1/notifications/presence accepted any authenticated
# actor, including guests. A guest token could enumerate clinic staff names
# and roles by polling page_id=patient/<uuid> and watching the response.

def test_notifications_presence_get_blocks_guest(client: TestClient) -> None:
    resp = client.get(
        "/api/v1/notifications/presence/patient_some-uuid",
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert resp.status_code in (401, 403), resp.text


def test_notifications_presence_post_blocks_guest(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/notifications/presence",
        json={"page_id": "patient_some-uuid"},
        headers={"Authorization": "Bearer guest-demo-token"},
    )
    assert resp.status_code in (401, 403), resp.text


# ── Monitor fleet: cross-clinic device leak ──────────────────────────────────
# Pre-fix, monitor_service.list_fleet queried DeviceConnection without any
# clinic/clinician filter and surfaced every connected device across all
# clinics to any clinician.

def test_monitor_fleet_clinic_b_does_not_see_clinic_a_devices(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    from app.persistence.models import DeviceConnection

    db: Session = SessionLocal()
    try:
        db.add(
            DeviceConnection(
                id=str(uuid.uuid4()),
                patient_id=cross_clinic_setup["patient_id"],
                source="oura",
                source_type="wearable",
                display_name="Oura Ring",
                status="connected",
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.get(
        "/api/v1/monitor/fleet",
        headers=_auth(cross_clinic_setup["token_clin_b"]),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    sources = {d["device_key"] for d in body.get("devices", [])}
    assert "oura" not in sources, (
        "clinic B should not see clinic A's connected device — "
        f"unexpected fleet leak: {body}"
    )


# ── Reports upload extension whitelist (defense-in-depth) ────────────────────

def test_reports_upload_rejects_disallowed_extension(
    client: TestClient, auth_headers: dict, cross_clinic_setup: dict[str, Any]
) -> None:
    """The /api/v1/reports/upload endpoint used to derive the on-disk
    extension from a raw rsplit('.',1) on the supplied filename, which
    allowed slashes and traversal markers in the ext string. We now
    whitelist a fixed set of known report extensions."""
    pid = cross_clinic_setup["patient_id"]
    files = {"file": ("evil.exe", b"hello", "application/octet-stream")}
    data = {
        "patient_id": pid,
        "type": "qeeg_summary",
        "title": "Evil",
    }
    resp = client.post(
        "/api/v1/reports/upload",
        files=files,
        data=data,
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_report_extension"


# ── FK-stuffing: adverse_events course_id / session_id ──────────────────────
# Pre-fix, POST /api/v1/adverse-events gated body.patient_id but stored
# course_id and session_id verbatim — a clinician with their own patient could
# attach an AE to another clinic's course, contaminating their safety queries.

def test_adverse_events_rejects_foreign_course_id(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    """Clinician A submits an AE on their own (newly-created) patient but
    points course_id at a TreatmentCourse owned by clinic B's patient."""
    from app.persistence.models import Patient, TreatmentCourse

    # Seed clinic-A's own patient + a foreign course owned by clinic-B's
    # patient. Use clinic_setup's pre-seeded patient (owned by clinic A) as
    # the AE target so the patient gate passes; the course belongs to a new
    # clinic-B patient.
    db: Session = SessionLocal()
    try:
        clin_b_patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=cross_clinic_setup["clin_b_id"],
            first_name="B", last_name="Patient",
        )
        db.add(clin_b_patient)
        db.flush()
        foreign_course = TreatmentCourse(
            id=str(uuid.uuid4()),
            patient_id=clin_b_patient.id,
            clinician_id=cross_clinic_setup["clin_b_id"],
            protocol_id="TMS-DLPFC",
            condition_slug="depression",
            modality_slug="rtms",
            status="active",
        )
        db.add(foreign_course)
        db.commit()
        foreign_course_id = foreign_course.id
    finally:
        db.close()

    resp = client.post(
        "/api/v1/adverse-events",
        json={
            "patient_id": cross_clinic_setup["patient_id"],  # clinic A patient
            "course_id": foreign_course_id,                  # clinic B course
            "event_type": "headache",
            "severity": "mild",
            "description": "fk-stuffing attempt",
        },
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_course"


def test_adverse_events_rejects_foreign_session_id(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    from app.persistence.models import ClinicalSession, Patient

    db: Session = SessionLocal()
    try:
        clin_b_patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=cross_clinic_setup["clin_b_id"],
            first_name="B2", last_name="Patient",
        )
        db.add(clin_b_patient)
        db.flush()
        foreign_session = ClinicalSession(
            id=str(uuid.uuid4()),
            patient_id=clin_b_patient.id,
            clinician_id=cross_clinic_setup["clin_b_id"],
            scheduled_at="2026-04-27T10:00:00Z",
        )
        db.add(foreign_session)
        db.commit()
        foreign_session_id = foreign_session.id
    finally:
        db.close()

    resp = client.post(
        "/api/v1/adverse-events",
        json={
            "patient_id": cross_clinic_setup["patient_id"],
            "session_id": foreign_session_id,
            "event_type": "headache",
            "severity": "mild",
            "description": "fk-stuffing attempt",
        },
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_session"


# ── FK-stuffing: annotations target_id ──────────────────────────────────────
# Pre-fix, POST /api/v1/annotations gated body.patient_id but stored target_id
# verbatim — a clinician could attach an annotation against another clinic's
# qEEG/MRI analysis under one of their own patients.

def test_annotations_rejects_foreign_target_id(
    client: TestClient, cross_clinic_setup: dict[str, Any]
) -> None:
    from app.persistence.models import Patient, QEEGAnalysis

    db: Session = SessionLocal()
    try:
        clin_b_patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=cross_clinic_setup["clin_b_id"],
            first_name="B3", last_name="Patient",
        )
        db.add(clin_b_patient)
        db.flush()
        foreign_qeeg = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=clin_b_patient.id,
            clinician_id=cross_clinic_setup["clin_b_id"],
            analysis_status="completed",
        )
        db.add(foreign_qeeg)
        db.commit()
        foreign_target_id = foreign_qeeg.id
    finally:
        db.close()

    resp = client.post(
        "/api/v1/annotations",
        json={
            "analysis_id": foreign_target_id,  # clinic B qEEG
            "analysis_type": "qeeg",
            "target_kind": "finding",
            "text": "stuffed annotation",
        },
        headers=_auth(cross_clinic_setup["token_clin_a"]),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json().get("code") == "cross_clinic_access_denied"

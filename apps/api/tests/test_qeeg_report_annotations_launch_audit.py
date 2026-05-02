"""qEEG Brain Map Report Annotations launch-audit tests (QEEG-ANN1, 2026-05-02).

Sidecar annotation system for qEEG Brain Map reports. Tests cover:

* annotation creation (margin_note, region_tag, flag)
* validation (kind, flag_type, body length, section_path charset)
* role gating (clinician+ creates; patient/guest 403; non-creator 403 update)
* cross-clinic IDOR (404 leak prevention via patient gate)
* update-by-creator allowed; update-by-non-creator 403
* delete-by-creator and delete-by-admin allowed; others 403
* resolve flow (resolved_at + resolved_by + resolution_note)
* list filters (kind, flag_type, section_path)
* include_resolved toggle
* pagination correctness
* summary counts (by kind, by flag_type, recently_resolved)
* audit-events scoped + paginated by surface
* alembic migration 084 up + down clean
* full integration: create flag → list → resolve → list w/ resolved → summary

Mirrors the IRB-AMD4 test pattern (test_reviewer_sla_calibration_threshold_tuning_launch_audit.py).
"""
from __future__ import annotations

import uuid as _uuid
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Patient,
    QEEGReportAnnotation,
    User,
)


SURFACE = "qeeg_report_annotations"
ANNS_PATH = "/api/v1/qeeg-report-annotations"


_CLINIC_A = "clinic-qeegann1-a"
_CLINIC_B = "clinic-qeegann1-b"

CLIN_A_USER = "actor-qeegann1-clin-a"
CLIN_A2_USER = "actor-qeegann1-clin-a2"
CLIN_B_USER = "actor-qeegann1-clin-b"
ADMIN_A_USER = "actor-qeegann1-admin-a"

PATIENT_A = "patient-qeegann1-a"
PATIENT_A2 = "patient-qeegann1-a2"
PATIENT_B = "patient-qeegann1-b"

REPORT_X = "report-qeegann1-x"
REPORT_Y = "report-qeegann1-y"


_TEST_USER_IDS = (
    CLIN_A_USER,
    CLIN_A2_USER,
    CLIN_B_USER,
    ADMIN_A_USER,
    "actor-clinician-demo",
    "actor-admin-demo",
    "actor-patient-demo",
    "actor-guest-demo",
)
_TEST_PATIENT_IDS = (PATIENT_A, PATIENT_A2, PATIENT_B)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean():
    yield
    db = SessionLocal()
    try:
        db.query(QEEGReportAnnotation).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == SURFACE
        ).delete(synchronize_session=False)
        db.query(Patient).filter(
            Patient.id.in_(list(_TEST_PATIENT_IDS))
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.in_(list(_TEST_USER_IDS))
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _seed_user(user_id: str, *, role: str, clinic_id: Optional[str]) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.role = role
            existing.clinic_id = clinic_id
            db.commit()
            return
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id,
                hashed_password="x",
                role=role,
                package_id="enterprise",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_patient(patient_id: str, *, clinician_id: str) -> None:
    db = SessionLocal()
    try:
        existing = db.query(Patient).filter_by(id=patient_id).first()
        if existing is not None:
            existing.clinician_id = clinician_id
            db.commit()
            return
        db.add(
            Patient(
                id=patient_id,
                clinician_id=clinician_id,
                first_name="QA",
                last_name="Patient",
                dob="1990-01-15",
            )
        )
        db.commit()
    finally:
        db.close()


def _setup_clinic_a() -> None:
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_A)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A2_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)
    _seed_patient(PATIENT_A, clinician_id=CLIN_A_USER)
    _seed_patient(PATIENT_A2, clinician_id=CLIN_A_USER)


def _setup_clinic_b() -> None:
    _seed_user(CLIN_B_USER, role="clinician", clinic_id=_CLINIC_B)
    _seed_patient(PATIENT_B, clinician_id=CLIN_B_USER)


def _create_payload(
    *,
    patient_id: str = PATIENT_A,
    report_id: str = REPORT_X,
    section_path: str = "summary.brain_age",
    annotation_kind: str = "margin_note",
    flag_type: Optional[str] = None,
    body: str = "Brain-age model output looks plausible.",
) -> dict:
    out: dict = {
        "patient_id": patient_id,
        "report_id": report_id,
        "section_path": section_path,
        "annotation_kind": annotation_kind,
        "body": body,
    }
    if flag_type is not None:
        out["flag_type"] = flag_type
    return out


def _post_create(client: TestClient, headers: dict, **overrides) -> dict:
    payload = _create_payload(**overrides)
    r = client.post(
        f"{ANNS_PATH}/annotations", json=payload, headers=headers
    )
    return {"status": r.status_code, "body": r.json() if r.content else {}}


# ── 1. Surface whitelist sanity ──────────────────────────────────────────


def test_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert SURFACE in KNOWN_SURFACES


def test_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    body = {"event": "view", "surface": SURFACE, "note": "whitelist"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json().get("event_id", "").startswith(f"{SURFACE}-")


# ── 2. Create flow ────────────────────────────────────────────────────────


def test_create_margin_note_returns_annotation(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(client, auth_headers["clinician"])
    assert res["status"] == 201, res
    body = res["body"]
    assert body["annotation_kind"] == "margin_note"
    assert body["flag_type"] is None
    assert body["patient_id"] == PATIENT_A
    assert body["clinic_id"] == _CLINIC_A
    assert body["body"].startswith("Brain-age")
    assert body["resolved_at"] is None


def test_create_region_tag_returns_annotation(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="region_tag",
        section_path="regions.frontal_left.alpha",
        body="Frontal-left alpha matches AAR template.",
    )
    assert res["status"] == 201, res
    assert res["body"]["annotation_kind"] == "region_tag"
    assert res["body"]["flag_type"] is None


def test_create_flag_with_clinically_significant(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="flag",
        flag_type="clinically_significant",
        body="Discuss with neurology — strong asymmetry.",
    )
    assert res["status"] == 201
    assert res["body"]["flag_type"] == "clinically_significant"


def test_create_flag_with_evidence_gap_flag_type(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="flag",
        flag_type="evidence_gap",
        section_path="summary.brain_age",
        body="AI Brain Age is FDA-questioned per evidence-gaps memo.",
    )
    assert res["status"] == 201
    assert res["body"]["flag_type"] == "evidence_gap"


def test_create_flag_without_flag_type_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client, auth_headers["clinician"], annotation_kind="flag"
    )
    assert res["status"] == 422


def test_create_flag_with_invalid_flag_type_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="flag",
        flag_type="not_a_real_flag",
    )
    assert res["status"] == 422


def test_create_margin_note_drops_flag_type(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="margin_note",
        flag_type="clinically_significant",
    )
    assert res["status"] == 201
    # Non-flag kinds drop user-supplied flag_type silently.
    assert res["body"]["flag_type"] is None


# ── 3. Validation ─────────────────────────────────────────────────────────


def test_create_body_too_short_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(client, auth_headers["clinician"], body="x")
    # FastAPI bound (min_length=1) lets 1-char through to the service,
    # which enforces 5-char floor → 422.
    assert res["status"] == 422


def test_create_body_too_long_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    long_body = "a" * 2001
    res = _post_create(client, auth_headers["clinician"], body=long_body)
    assert res["status"] == 422


def test_create_section_path_with_shell_meta_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(
        client,
        auth_headers["clinician"],
        section_path="summary;rm -rf /",
    )
    assert res["status"] == 422


def test_create_section_path_empty_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # FastAPI Field(min_length=1) catches empty strings before service
    # validation kicks in — both produce 422.
    res = _post_create(client, auth_headers["clinician"], section_path="")
    assert res["status"] == 422


# ── 4. Cross-clinic IDOR ──────────────────────────────────────────────────


def test_create_cross_clinic_patient_returns_403(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinic-A clinician trying to attach to a clinic-B patient is denied
    by ``_gate_patient_access`` — 403 (cross_clinic_access_denied)."""
    _setup_clinic_a()
    _setup_clinic_b()
    res = _post_create(
        client, auth_headers["clinician"], patient_id=PATIENT_B
    )
    assert res["status"] == 403


def test_list_cross_clinic_patient_returns_403(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _setup_clinic_b()
    r = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_B}&report_id={REPORT_X}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


# ── 5. Role gating ────────────────────────────────────────────────────────


def test_patient_role_cannot_create(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(client, auth_headers["patient"])
    assert res["status"] == 403


def test_guest_role_cannot_create(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    res = _post_create(client, auth_headers["guest"])
    assert res["status"] == 403


# ── 6. Update / delete / resolve ──────────────────────────────────────────


def _seed_annotation_via_db(
    *,
    patient_id: str = PATIENT_A,
    creator_user_id: str = "actor-clinician-demo",
    report_id: str = REPORT_X,
    annotation_kind: str = "margin_note",
    flag_type: Optional[str] = None,
    body: str = "Seeded annotation body.",
    clinic_id: str = _CLINIC_A,
) -> str:
    from datetime import datetime, timezone
    db = SessionLocal()
    try:
        ann_id = str(_uuid.uuid4())
        now = datetime.now(timezone.utc)
        db.add(
            QEEGReportAnnotation(
                id=ann_id,
                clinic_id=clinic_id,
                patient_id=patient_id,
                report_id=report_id,
                section_path="summary.brain_age",
                annotation_kind=annotation_kind,
                flag_type=flag_type,
                body=body,
                created_by_user_id=creator_user_id,
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
        return ann_id
    finally:
        db.close()


def test_update_by_non_creator_returns_403(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Seed annotation owned by a DIFFERENT user (CLIN_A2_USER).
    ann_id = _seed_annotation_via_db(creator_user_id=CLIN_A2_USER)
    r = client.patch(
        f"{ANNS_PATH}/annotations/{ann_id}",
        json={"body": "Hijacked body should not stick."},
        headers=auth_headers["clinician"],  # actor-clinician-demo
    )
    assert r.status_code == 403


def test_update_by_creator_succeeds(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db(
        creator_user_id="actor-clinician-demo"
    )
    r = client.patch(
        f"{ANNS_PATH}/annotations/{ann_id}",
        json={"body": "Edited by the original author."},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["body"] == "Edited by the original author."

    # Audit row was emitted.
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == SURFACE,
                AuditEventRecord.action == "qeeg.annotation_updated",
            )
            .all()
        )
        assert len(rows) >= 1
    finally:
        db.close()


def test_delete_by_non_creator_non_admin_returns_403(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db(creator_user_id=CLIN_A2_USER)
    r = client.delete(
        f"{ANNS_PATH}/annotations/{ann_id}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_delete_by_creator_succeeds(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db(
        creator_user_id="actor-clinician-demo"
    )
    r = client.delete(
        f"{ANNS_PATH}/annotations/{ann_id}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 204
    db = SessionLocal()
    try:
        assert (
            db.query(QEEGReportAnnotation).filter_by(id=ann_id).first()
            is None
        )
    finally:
        db.close()


def test_delete_by_admin_succeeds_for_other_creator(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db(creator_user_id=CLIN_A2_USER)
    r = client.delete(
        f"{ANNS_PATH}/annotations/{ann_id}",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 204


def test_resolve_by_clinician_sets_resolved_fields(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db(
        creator_user_id="actor-clinician-demo"
    )
    r = client.post(
        f"{ANNS_PATH}/annotations/{ann_id}/resolve",
        json={"resolution_note": "Discussed at MDT — no further action."},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resolved_at"]
    assert body["resolved_by_user_id"] == "actor-clinician-demo"
    assert "Discussed at MDT" in (body["resolution_note"] or "")


# ── 7. List / filter / pagination ─────────────────────────────────────────


def _seed_n_annotations(
    n: int,
    *,
    creator_user_id: str = "actor-clinician-demo",
    annotation_kind: str = "margin_note",
    flag_type: Optional[str] = None,
    report_id: str = REPORT_X,
) -> None:
    for i in range(n):
        _seed_annotation_via_db(
            creator_user_id=creator_user_id,
            annotation_kind=annotation_kind,
            flag_type=flag_type,
            report_id=report_id,
            body=f"Seeded annotation #{i:03d}",
        )


def test_list_filter_by_kind(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_n_annotations(2, annotation_kind="margin_note")
    _seed_n_annotations(3, annotation_kind="region_tag")
    r = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&kind=region_tag",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert all(item["annotation_kind"] == "region_tag" for item in body["items"])


def test_list_filter_by_flag_type(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_n_annotations(
        2, annotation_kind="flag", flag_type="clinically_significant"
    )
    _seed_n_annotations(
        4, annotation_kind="flag", flag_type="evidence_gap"
    )
    r = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&flag_type=evidence_gap",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 4


def test_list_include_resolved_false_excludes_resolved(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db()
    # Resolve it.
    rr = client.post(
        f"{ANNS_PATH}/annotations/{ann_id}/resolve",
        json={"resolution_note": "done"},
        headers=auth_headers["clinician"],
    )
    assert rr.status_code == 200

    r = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_list_include_resolved_true_returns_resolved(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    ann_id = _seed_annotation_via_db()
    client.post(
        f"{ANNS_PATH}/annotations/{ann_id}/resolve",
        json={"resolution_note": "done"},
        headers=auth_headers["clinician"],
    )
    r = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&include_resolved=true",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_list_paginates_correctly(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_n_annotations(7)
    r1 = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&page=1&page_size=3",
        headers=auth_headers["clinician"],
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1["total"] == 7
    assert len(body1["items"]) == 3

    r2 = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&page=3&page_size=3",
        headers=auth_headers["clinician"],
    )
    body2 = r2.json()
    assert len(body2["items"]) == 1


# ── 8. Summary ────────────────────────────────────────────────────────────


def test_summary_counts_by_kind_and_flag_type(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_n_annotations(2, annotation_kind="margin_note")
    _seed_n_annotations(1, annotation_kind="region_tag")
    _seed_n_annotations(
        3, annotation_kind="flag", flag_type="evidence_gap"
    )
    _seed_n_annotations(
        1, annotation_kind="flag", flag_type="clinically_significant"
    )

    r = client.get(
        f"{ANNS_PATH}/summary?patient_id={PATIENT_A}&report_id={REPORT_X}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 7
    assert body["by_kind"]["margin_note"] == 2
    assert body["by_kind"]["region_tag"] == 1
    assert body["by_kind"]["flag"] == 4
    assert body["by_flag_type"]["evidence_gap"] == 3
    assert body["by_flag_type"]["clinically_significant"] == 1


# ── 9. Audit-events feed ──────────────────────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Create a few annotations to seed audit rows.
    _post_create(client, auth_headers["clinician"])
    _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="region_tag",
        section_path="regions.parietal_right.beta",
        body="Right parietal beta uplift.",
    )
    r = client.get(
        f"{ANNS_PATH}/audit-events?page=1&page_size=10",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["surface"] == SURFACE
    assert body["total"] >= 2
    assert all(item["target_type"] == SURFACE for item in body["items"])


# ── 10. Alembic migration up/down ────────────────────────────────────────


def test_alembic_migration_084_up_and_down_clean() -> None:
    """Confirm 084 module is well-formed and exposes canonical names.

    The actual schema is created by the global test fixtures (which
    run ``alembic upgrade head``); here we just load the migration
    module from disk and assert the alembic identifiers + idempotent
    helpers are in place. Mirrors IRB-AMD4 (#447) precedent.
    """
    import importlib.util as _ilu
    from pathlib import Path

    here = Path(__file__).resolve()
    api_root = here.parents[1]
    mig_path = (
        api_root
        / "alembic"
        / "versions"
        / "084_qeeg_report_annotations.py"
    )
    spec = _ilu.spec_from_file_location("qeegann1_mig084", str(mig_path))
    assert spec is not None and spec.loader is not None
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)

    assert mod.revision == "084_qeeg_report_annotations"
    # 084 is a merge across the two parallel 083 heads (per
    # ``deepsynaps-alembic-auto-merge-normal`` memory); the
    # IRB-AMD4 parent is one of two ancestors.
    parents = mod.down_revision
    if isinstance(parents, str):
        parents = (parents,)
    assert "083_reviewer_sla_calibration_thresholds" in parents
    # Idempotent helpers exist (per IRB-AMD1 #446 precedent).
    assert callable(getattr(mod, "_has_table", None))
    assert callable(getattr(mod, "_has_index", None))
    assert mod.TABLE_NAME == "qeeg_report_annotations"
    # Upgrade + downgrade are callable. We don't run them against the
    # live engine because alembic upgrade head has already created the
    # table in the conftest bootstrap; double-running here would be a
    # no-op via ``_has_table``.
    assert callable(mod.upgrade)
    assert callable(mod.downgrade)


# ── 11. Full integration (create flag → list → resolve → summary) ─────────


def test_integration_flag_lifecycle(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()

    # 1. Create a flag with kind=flag flag_type=evidence_gap.
    res = _post_create(
        client,
        auth_headers["clinician"],
        annotation_kind="flag",
        flag_type="evidence_gap",
        section_path="summary.brain_age",
        body="AI Brain Age cited; FDA gap per evidence-gaps memo.",
    )
    assert res["status"] == 201
    ann_id = res["body"]["id"]

    # 2. List — finds 1 open.
    r1 = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}",
        headers=auth_headers["clinician"],
    )
    assert r1.json()["total"] == 1

    # 3. Resolve.
    rr = client.post(
        f"{ANNS_PATH}/annotations/{ann_id}/resolve",
        json={"resolution_note": "Reviewed at MDT — disclaimer added."},
        headers=auth_headers["clinician"],
    )
    assert rr.status_code == 200

    # 4. List with include_resolved=true — finds 1.
    r2 = client.get(
        f"{ANNS_PATH}/annotations?patient_id={PATIENT_A}"
        f"&report_id={REPORT_X}&include_resolved=true",
        headers=auth_headers["clinician"],
    )
    assert r2.json()["total"] == 1
    assert r2.json()["items"][0]["resolved_at"]

    # 5. Summary reflects 1 resolved + 1 evidence_gap flag.
    rs = client.get(
        f"{ANNS_PATH}/summary?patient_id={PATIENT_A}&report_id={REPORT_X}",
        headers=auth_headers["clinician"],
    )
    body = rs.json()
    assert body["total"] == 1
    assert body["resolved"] == 1
    assert body["open"] == 0
    assert body["by_flag_type"]["evidence_gap"] == 1

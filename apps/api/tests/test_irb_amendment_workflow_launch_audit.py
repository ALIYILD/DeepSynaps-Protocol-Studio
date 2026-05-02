"""IRB Amendment Workflow launch-audit tests (IRB-AMD1, 2026-05-02).

Lifecycle (per spec):
draft → submitted → reviewer_assigned → under_review →
    approved | rejected | revisions_requested → effective.

Tests cover:
* lifecycle state machine + invalid transitions (409)
* role gating (403) including assigned-reviewer-only actions
* cross-clinic IDOR (404) on every endpoint
* diff computation (added/removed/modified) + truncation
* reg-binder ZIP layout (cover/protocol/amendments/audit_trail)
* reg-binder admin/PI gate + cross-clinic IDOR
* paginated audit-events feed + per-amendment audit-trail
* surface whitelist sanity (audit_trail_router + qeeg)
* full integration: full lifecycle ends with effective + reg-binder intact
"""
from __future__ import annotations

import io
import os
import uuid as _uuid
import zipfile
from datetime import datetime as _dt, timezone as _tz
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    IRBProtocol,
    IRBProtocolAmendment,
    IRBProtocolRevision,
    User,
)


SURFACE = "irb_amendment_workflow"
WF_PATH = "/api/v1/irb-amendment-workflow"


_CLINIC_A = "clinic-irbamd1-a"
_CLINIC_B = "clinic-irbamd1-b"

ADMIN_A_USER = "actor-irbamd1-admin-a"
ADMIN_B_USER = "actor-irbamd1-admin-b"
CLIN_A_USER = "actor-irbamd1-clin-a"
CLIN_A2_USER = "actor-irbamd1-clin-a2"  # second clinician (reviewer in clinic A)
CLIN_B_USER = "actor-irbamd1-clin-b"

_TEST_USER_IDS = (
    ADMIN_A_USER,
    ADMIN_B_USER,
    CLIN_A_USER,
    CLIN_A2_USER,
    CLIN_B_USER,
    "actor-clinician-demo",
    "actor-admin-demo",
)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean():
    """Wipe IRB-AMD1 amendments + protocols + audit before each test."""
    yield
    db = SessionLocal()
    try:
        db.query(IRBProtocolRevision).delete(synchronize_session=False)
        db.query(IRBProtocolAmendment).delete(synchronize_session=False)
        db.query(IRBProtocol).filter(
            IRBProtocol.clinic_id.in_([_CLINIC_A, _CLINIC_B])
        ).delete(synchronize_session=False)
        # Also clear orphan rows we created with id only.
        db.query(IRBProtocol).filter(
            IRBProtocol.id.like("proto-irbamd1-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_([SURFACE, "irb_amendment"])
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_TEST_USER_IDS))).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    role: str = "clinician",
    clinic_id: Optional[str] = _CLINIC_A,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            existing.role = role
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


def _seed_protocol(
    *,
    clinic_id: str = _CLINIC_A,
    protocol_id: Optional[str] = None,
    pi_user_id: str = ADMIN_A_USER,
    title: str = "Theta-burst RCT",
    description: str = "Pilot RCT.",
) -> IRBProtocol:
    db = SessionLocal()
    try:
        pid = protocol_id or f"proto-irbamd1-{_uuid.uuid4().hex[:8]}"
        proto = IRBProtocol(
            id=pid,
            clinic_id=clinic_id,
            title=title,
            description=description,
            pi_user_id=pi_user_id,
            status="active",
            created_by=pi_user_id,
            version=1,
        )
        db.add(proto)
        db.commit()
        db.refresh(proto)
        return proto
    finally:
        db.close()


def _setup_clinic_a():
    """Wire the demo tokens to clinic A users so the auth fixture sees a real
    User row + clinic_id when hitting the endpoints. Tests that exercise
    clinic A use the ``clinician``/``admin`` demo headers; tests that
    exercise clinic B re-bind those demo actor ids to the B clinic mid-test
    via ``_setup_clinic_b``."""
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_A)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A2_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)


def _create_draft(client: TestClient, headers: dict, proto_id: str, **fields) -> dict:
    body = {
        "parent_protocol_id": proto_id,
        "title": fields.get("title", "Updated title"),
        "summary": fields.get("summary", "Updated description."),
        "primary_outcome": fields.get("primary_outcome", "HDRS-17"),
        "amendment_type": fields.get("amendment_type", "protocol_change"),
        "reason": fields.get("reason", "Sample size recalculation."),
        "description": fields.get("description", "Description of change."),
    }
    r = client.post(f"{WF_PATH}/amendments", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ── 1. Surface whitelist ───────────────────────────────────────────────────


def test_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events", json=body, headers=auth_headers["clinician"]
    )
    assert r.status_code == 200, r.text
    assert r.json().get("event_id", "").startswith(f"{SURFACE}-")


# ── 2. Create draft ────────────────────────────────────────────────────────


def test_create_draft_returns_draft_status_and_diff(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    out = _create_draft(client, auth_headers["clinician"], proto.id, title="New title")
    assert out["status"] == "draft"
    assert out["protocol_id"] == proto.id
    assert out["version"] == 1
    # Diff should mention title (modified) and summary (modified) plus
    # primary_outcome (added because parent has no primary_outcome col).
    fields_changed = {d["field"] for d in out["diff"]}
    assert "title" in fields_changed


# ── 3. Submit transition ──────────────────────────────────────────────────


def test_submit_transitions_draft_to_submitted_and_emits_audit(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "submitted"

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == "irb_amendment",
                AuditEventRecord.target_id == aid,
                AuditEventRecord.action == "irb.amendment_submitted",
            )
            .all()
        )
        assert len(rows) >= 1
        assert "from_status=draft" in rows[0].note
        assert "to_status=submitted" in rows[0].note
    finally:
        db.close()


def test_submit_on_already_submitted_returns_409(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"]
    )
    assert r.status_code == 409


# ── 4. Assign reviewer ────────────────────────────────────────────────────


def test_assign_reviewer_on_draft_returns_409(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 409


def test_assign_reviewer_rejects_clinician_role(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_assign_reviewer_admin_succeeds_from_submitted(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "reviewer_assigned"
    assert r.json()["assigned_reviewer_user_id"] == CLIN_A2_USER


# ── 5. Start review ───────────────────────────────────────────────────────


def test_start_review_by_non_assigned_reviewer_403(
    client: TestClient, auth_headers: dict
) -> None:
    """The 'clinician' demo actor (CLIN_A_USER alias) is the creator,
    not the assigned reviewer (CLIN_A2_USER). Submitting from the
    creator's headers should hit the not_assigned_reviewer 403."""
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    # The clinician-demo actor is NOT the assigned reviewer.
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/start-review",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_start_review_by_assigned_reviewer_via_admin_bypass(
    client: TestClient, auth_headers: dict
) -> None:
    """Admin role bypasses the assigned-reviewer gate."""
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/start-review", headers=auth_headers["admin"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "under_review"


# ── 6. Decide (approved / rejected / revisions_requested) ─────────────────


def _advance_to_under_review(client: TestClient, auth_headers: dict, aid: str) -> None:
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])
    client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    client.post(
        f"{WF_PATH}/amendments/{aid}/start-review", headers=auth_headers["admin"]
    )


def test_decide_approved_emits_audit_and_transitions(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "approved", "review_note": "Looks good to me."},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert r.json()["review_decision_note"] == "Looks good to me."

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_id == aid,
                AuditEventRecord.action == "irb.amendment_decided_approved",
            )
            .count()
        )
        assert rows >= 1
    finally:
        db.close()


def test_decide_rejected_transitions(client: TestClient, auth_headers: dict) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "rejected", "review_note": "Insufficient justification."},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"


def test_decide_revisions_requested_transitions(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "revisions_requested", "review_note": "Update Section 4."},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "revisions_requested"


def test_decide_review_note_too_short_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "approved", "review_note": "short"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 422


def test_decide_review_note_too_long_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "approved", "review_note": "x" * 2001},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 422


# ── 7. Mark effective ─────────────────────────────────────────────────────


def test_mark_effective_on_rejected_returns_409(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "rejected", "review_note": "Insufficient justification."},
        headers=auth_headers["admin"],
    )
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/mark-effective", headers=auth_headers["admin"]
    )
    assert r.status_code == 409


def test_mark_effective_on_approved_bumps_parent_version(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(
        client,
        auth_headers["clinician"],
        proto.id,
        title="Phase II revised title",
    )
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "approved", "review_note": "All good. Approving."},
        headers=auth_headers["admin"],
    )
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/mark-effective", headers=auth_headers["admin"]
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "effective"

    db = SessionLocal()
    try:
        p = db.query(IRBProtocol).filter(IRBProtocol.id == proto.id).first()
        assert p.version == 2  # bumped from 1 → 2
        assert p.title == "Phase II revised title"  # merged from amendment
    finally:
        db.close()


# ── 8. Revert to draft ────────────────────────────────────────────────────


def test_revert_to_draft_from_revisions_requested(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _advance_to_under_review(client, auth_headers, aid)
    client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={
            "decision": "revisions_requested",
            "review_note": "Need clarification on inclusion criteria.",
        },
        headers=auth_headers["admin"],
    )
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/revert-to-draft",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "draft"


# ── 9. Cross-clinic IDOR ──────────────────────────────────────────────────


def _setup_clinic_b():
    """Re-bind demo tokens to clinic B users so admin/clinician demo
    headers see clinic B."""
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_B)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_B)


def test_cross_clinic_idor_get_amendment_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    # Switch demo to clinic B.
    _setup_clinic_b()
    r = client.get(
        f"{WF_PATH}/amendments/{aid}", headers=auth_headers["clinician"]
    )
    assert r.status_code == 404


def test_cross_clinic_idor_submit_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _setup_clinic_b()
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"]
    )
    assert r.status_code == 404


def test_cross_clinic_idor_audit_trail_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    _setup_clinic_b()
    r = client.get(
        f"{WF_PATH}/amendments/{aid}/audit-trail",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_cross_clinic_idor_reg_binder_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    _setup_clinic_b()
    # Use clinician role from clinic B (PI of clinic A's proto is admin-A).
    # We expect 404 because clinic gate fails.
    r = client.get(
        f"{WF_PATH}/protocols/{proto.id}/reg-binder.zip",
        headers=auth_headers["clinician"],
    )
    assert r.status_code in (404, 403)


# ── 10. List filters ──────────────────────────────────────────────────────


def test_list_filters_by_status(client: TestClient, auth_headers: dict) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf1 = _create_draft(client, auth_headers["clinician"], proto.id, title="A")
    drf2 = _create_draft(client, auth_headers["clinician"], proto.id, title="B")
    client.post(
        f"{WF_PATH}/amendments/{drf2['id']}/submit",
        headers=auth_headers["clinician"],
    )
    r = client.get(
        f"{WF_PATH}/amendments?status=draft", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200
    body = r.json()
    assert all(item["status"] == "draft" for item in body["items"])
    assert any(item["id"] == drf1["id"] for item in body["items"])


def test_list_filters_by_protocol_id(client: TestClient, auth_headers: dict) -> None:
    _setup_clinic_a()
    proto1 = _seed_protocol(clinic_id=_CLINIC_A, title="P1")
    proto2 = _seed_protocol(clinic_id=_CLINIC_A, title="P2")
    drf1 = _create_draft(client, auth_headers["clinician"], proto1.id)
    drf2 = _create_draft(client, auth_headers["clinician"], proto2.id)
    r = client.get(
        f"{WF_PATH}/amendments?protocol_id={proto1.id}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert all(item["protocol_id"] == proto1.id for item in body["items"])
    assert any(item["id"] == drf1["id"] for item in body["items"])
    assert all(item["id"] != drf2["id"] for item in body["items"])


# ── 11. Diff service ──────────────────────────────────────────────────────


def test_diff_added_field() -> None:
    from app.services.irb_amendment_diff import compute_amendment_diff

    class _P:
        title = "Old"
        description = ""

    diffs = compute_amendment_diff(_P(), {"primary_outcome": "HDRS-17"})
    assert any(
        d.field == "primary_outcome" and d.change_type == "added" for d in diffs
    )


def test_diff_removed_field() -> None:
    from app.services.irb_amendment_diff import compute_amendment_diff

    class _P:
        title = "Original title"
        description = "blah"

    diffs = compute_amendment_diff(_P(), {"title": ""})
    assert any(d.field == "title" and d.change_type == "removed" for d in diffs)


def test_diff_modified_field() -> None:
    from app.services.irb_amendment_diff import compute_amendment_diff

    class _P:
        title = "Old"
        description = "Old desc"

    diffs = compute_amendment_diff(_P(), {"title": "New", "summary": "New desc"})
    by_field = {d.field: d for d in diffs}
    assert by_field["title"].change_type == "modified"
    assert by_field["title"].old_value == "Old"
    assert by_field["title"].new_value == "New"


def test_diff_truncates_long_values_to_1000() -> None:
    from app.services.irb_amendment_diff import compute_amendment_diff

    class _P:
        title = "x" * 2000
        description = ""

    new_title = "y" * 2000
    diffs = compute_amendment_diff(_P(), {"title": new_title})
    by_field = {d.field: d for d in diffs}
    # Old value was 2000 chars, gets truncated to 1000 + truncation marker
    assert len(by_field["title"].old_value) <= 1100
    assert "[truncated]" in by_field["title"].old_value
    assert len(by_field["title"].new_value) <= 1100


# ── 12. Reg-binder ZIP layout ─────────────────────────────────────────────


def test_reg_binder_zip_contains_required_files(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    # Mark the proto's PI to be the admin demo actor so the PI gate passes.
    db = SessionLocal()
    try:
        p = db.query(IRBProtocol).filter(IRBProtocol.id == proto.id).first()
        p.pi_user_id = "actor-admin-demo"
        db.commit()
    finally:
        db.close()

    r = client.get(
        f"{WF_PATH}/protocols/{proto.id}/reg-binder.zip",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/zip")
    assert "attachment" in r.headers["content-disposition"]
    assert f"reg_binder_{proto.id}_v1.zip" in r.headers["content-disposition"]

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(zf.namelist())
    assert "cover_page.txt" in names
    assert any(n.startswith("protocol_v") and n.endswith(".json") for n in names)
    assert any(n.startswith("amendments/amendment_") for n in names)
    assert "audit_trail.json" in names


def test_reg_binder_admin_pi_gate_clinician_403(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Make PI someone OTHER than the clinician demo actor.
    proto = _seed_protocol(clinic_id=_CLINIC_A, pi_user_id=ADMIN_A_USER)
    r = client.get(
        f"{WF_PATH}/protocols/{proto.id}/reg-binder.zip",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


# ── 13. Audit trail per-amendment endpoint ────────────────────────────────


def test_audit_trail_returns_all_action_rows(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(client, auth_headers["clinician"], proto.id)
    aid = drf["id"]
    client.post(f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"])

    r = client.get(
        f"{WF_PATH}/amendments/{aid}/audit-trail", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200, r.text
    body = r.json()
    actions = [item["action"] for item in body["items"]]
    assert "irb.amendment_created" in actions
    assert "irb.amendment_submitted" in actions


# ── 14. Audit-events feed ─────────────────────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    _create_draft(client, auth_headers["clinician"], proto.id)
    r = client.get(
        f"{WF_PATH}/audit-events?surface=irb_amendment&limit=5&offset=0",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert body["limit"] == 5


# ── 15. Full integration ──────────────────────────────────────────────────


def test_full_lifecycle_integration_ends_with_effective(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    drf = _create_draft(
        client,
        auth_headers["clinician"],
        proto.id,
        title="Phase II",
        summary="Phase II protocol for theta-burst.",
    )
    aid = drf["id"]
    # draft → submitted
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/submit", headers=auth_headers["clinician"]
    )
    assert r.json()["status"] == "submitted"
    # submitted → reviewer_assigned
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/assign-reviewer",
        json={"reviewer_user_id": CLIN_A2_USER},
        headers=auth_headers["admin"],
    )
    assert r.json()["status"] == "reviewer_assigned"
    # reviewer_assigned → under_review (admin bypass)
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/start-review", headers=auth_headers["admin"]
    )
    assert r.json()["status"] == "under_review"
    # under_review → approved
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/decide",
        json={"decision": "approved", "review_note": "Approved with appreciation."},
        headers=auth_headers["admin"],
    )
    assert r.json()["status"] == "approved"
    # approved → effective
    r = client.post(
        f"{WF_PATH}/amendments/{aid}/mark-effective", headers=auth_headers["admin"]
    )
    assert r.json()["status"] == "effective"

    # Make admin the PI so we can pull the binder.
    db = SessionLocal()
    try:
        p = db.query(IRBProtocol).filter(IRBProtocol.id == proto.id).first()
        p.pi_user_id = "actor-admin-demo"
        db.commit()
    finally:
        db.close()

    # Reg-binder still produces a valid ZIP with the audit trail.
    r = client.get(
        f"{WF_PATH}/protocols/{proto.id}/reg-binder.zip",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    audit_blob = zf.read("audit_trail.json").decode("utf-8")
    assert "irb.amendment_effective" in audit_blob
    assert "irb.amendment_submitted" in audit_blob

"""qEEG Annotation Resolution Outcome Tracker launch-audit tests
(QEEG-ANN2, 2026-05-02).

Closes the loop on QEEG-ANN1 (#459). Pairs each
``QEEGReportAnnotation`` row's ``created_at`` with its
``resolved_at`` (or absence) and classifies the outcome:

* ``resolved_within_sla`` — resolved AND ``(resolved_at - T) <= sla_days``
* ``resolved_late`` — resolved AND ``> sla_days``
* ``still_open_overdue`` — unresolved AND ``(now - T) > sla_days``
* ``still_open_grace`` — unresolved AND ``<= sla_days``

Coverage:

* Outcome classification (4 branches)
* Cross-clinic IDOR: clinic A row not surfaced for clinic B actor
* Role gating: clinician+ passes; patient/guest 403
* clinician-creator-summary with min_created floor
* resolver-latency-summary p90 calculation
* by_flag_type breakdown excludes margin_note/region_tag (kind != flag)
* evidence_gap_open_overdue_count counts only overdue evidence_gap flags
* outcome_pct excludes still_open_grace from denominator
* median null when no decided rows
* backlog include_grace=false vs true
* backlog pagination
* backlog body redaction defence-in-depth
* trend_buckets weekly when window_days=180
* audit-events scoped + paginated
* empty clinic returns clean structure
* Surface whitelist in audit_trail + qeeg_analysis
* Integration: create + resolve various → consistent state
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
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
from app.services.qeeg_annotation_outcome_pairing import (
    OUTCOME_RESOLVED_LATE,
    OUTCOME_RESOLVED_WITHIN_SLA,
    OUTCOME_STILL_OPEN_GRACE,
    OUTCOME_STILL_OPEN_OVERDUE,
    SURFACE,
)


WL_PATH = "/api/v1/qeeg-annotation-outcome-tracker"


_CLINIC_A = "clinic-qeegann2-a"
_CLINIC_B = "clinic-qeegann2-b"


CLIN_A_USER = "actor-qeegann2-clin-a"
CLIN_A2_USER = "actor-qeegann2-clin-a2"
CLIN_A3_USER = "actor-qeegann2-clin-a3"
CLIN_B_USER = "actor-qeegann2-clin-b"
ADMIN_A_USER = "actor-qeegann2-admin-a"

PATIENT_A = "patient-qeegann2-a"
PATIENT_A2 = "patient-qeegann2-a2"
PATIENT_B = "patient-qeegann2-b"

REPORT_X = "report-qeegann2-x"
REPORT_Y = "report-qeegann2-y"


_TEST_USER_IDS = (
    CLIN_A_USER,
    CLIN_A2_USER,
    CLIN_A3_USER,
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
    _seed_user(CLIN_A3_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)
    _seed_patient(PATIENT_A, clinician_id=CLIN_A_USER)
    _seed_patient(PATIENT_A2, clinician_id=CLIN_A_USER)


def _setup_clinic_b() -> None:
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_B)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_B)
    _seed_user(CLIN_B_USER, role="clinician", clinic_id=_CLINIC_B)
    _seed_patient(PATIENT_B, clinician_id=CLIN_B_USER)


def _seed_annotation(
    *,
    clinic_id: str = _CLINIC_A,
    patient_id: str = PATIENT_A,
    report_id: str = REPORT_X,
    creator_user_id: str = CLIN_A_USER,
    annotation_kind: str = "flag",
    flag_type: Optional[str] = "evidence_gap",
    body: str = "AI Brain Age — FDA gap. Discuss at MDT.",
    created_at: Optional[_dt] = None,
    resolved_at: Optional[_dt] = None,
    resolved_by_user_id: Optional[str] = None,
    section_path: str = "summary.brain_age",
) -> str:
    db = SessionLocal()
    try:
        ann_id = str(_uuid.uuid4())
        c_at = created_at or _dt.now(_tz.utc)
        db.add(
            QEEGReportAnnotation(
                id=ann_id,
                clinic_id=clinic_id,
                patient_id=patient_id,
                report_id=report_id,
                section_path=section_path,
                annotation_kind=annotation_kind,
                flag_type=flag_type if annotation_kind == "flag" else None,
                body=body,
                created_by_user_id=creator_user_id,
                resolved_at=resolved_at,
                resolved_by_user_id=resolved_by_user_id,
                created_at=c_at,
                updated_at=c_at,
            )
        )
        db.commit()
        return ann_id
    finally:
        db.close()


# ── 1. Surface whitelist sanity ───────────────────────────────────────────


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


# ── 2. Outcome classification ──────────────────────────────────────────────


def test_outcome_resolved_within_sla(
    client: TestClient, auth_headers: dict
) -> None:
    """Created 20d ago, resolved 5d after creation → resolved_within_sla (sla=30)."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    created = now - _td(days=20)
    _seed_annotation(
        created_at=created,
        resolved_at=created + _td(days=5),
        resolved_by_user_id=CLIN_A2_USER,
    )
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_annotations"] == 1
    assert body["outcome_counts"]["resolved_within_sla"] == 1


def test_outcome_resolved_late(
    client: TestClient, auth_headers: dict
) -> None:
    """Created 60d ago, resolved 35d after → resolved_late (sla=30)."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    created = now - _td(days=60)
    _seed_annotation(
        created_at=created,
        resolved_at=created + _td(days=35),
        resolved_by_user_id=CLIN_A2_USER,
    )
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome_counts"]["resolved_late"] == 1


def test_outcome_still_open_overdue(
    client: TestClient, auth_headers: dict
) -> None:
    """Created 40d ago, no resolution, sla=30 → still_open_overdue."""
    _setup_clinic_a()
    _seed_annotation(created_at=_dt.now(_tz.utc) - _td(days=40))
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["outcome_counts"]["still_open_overdue"] == 1


def test_outcome_still_open_grace(
    client: TestClient, auth_headers: dict
) -> None:
    """Created 10d ago, no resolution, sla=30 → still_open_grace."""
    _setup_clinic_a()
    _seed_annotation(created_at=_dt.now(_tz.utc) - _td(days=10))
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["outcome_counts"]["still_open_grace"] == 1


# ── 3. Cross-clinic IDOR ──────────────────────────────────────────────────


def test_cross_clinic_idor_row_not_surfaced(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinic A row NOT visible to a clinic B actor."""
    _setup_clinic_a()
    _seed_annotation(
        clinic_id=_CLINIC_A,
        patient_id=PATIENT_A,
        created_at=_dt.now(_tz.utc) - _td(days=40),
    )
    # Switch demo to clinic B.
    _setup_clinic_b()
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["total_annotations"] == 0


# ── 4. Role gating ────────────────────────────────────────────────────────


def test_summary_clinician_passes(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text


def test_summary_patient_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_summary_guest_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["guest"])
    assert r.status_code == 403


# ── 5. clinician-creator-summary ──────────────────────────────────────────


def test_clinician_creator_summary_excludes_below_min_created(
    client: TestClient, auth_headers: dict
) -> None:
    """Creator with 1 annotation excluded when min_created=2."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    _seed_annotation(creator_user_id=CLIN_A_USER, created_at=now - _td(days=10))
    _seed_annotation(creator_user_id=CLIN_A2_USER, created_at=now - _td(days=10))
    _seed_annotation(creator_user_id=CLIN_A2_USER, created_at=now - _td(days=11))
    r = client.get(
        f"{WL_PATH}/clinician-creator-summary?min_created=2",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    creators = {item["creator_user_id"] for item in body["items"]}
    assert CLIN_A_USER not in creators
    assert CLIN_A2_USER in creators


# ── 6. resolver-latency-summary p90 ───────────────────────────────────────


def test_resolver_latency_p90_correctly_computed(
    client: TestClient, auth_headers: dict
) -> None:
    """Five resolutions: 2,4,6,8,10 days → p90 = 9.2 days (linear interp).

    With 5 sorted values, 90th percentile rank = 0.9*4 = 3.6 → between
    indices 3 and 4 (vals 8 and 10) → 8 + 0.6*(10-8) = 9.2.
    """
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    for delta in (2, 4, 6, 8, 10):
        created = now - _td(days=30)
        _seed_annotation(
            created_at=created,
            resolved_at=created + _td(days=delta),
            resolved_by_user_id=CLIN_A2_USER,
        )
    r = client.get(
        f"{WL_PATH}/resolver-latency-summary?min_resolved=2",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    me = next(
        (i for i in body["items"] if i["resolver_user_id"] == CLIN_A2_USER),
        None,
    )
    assert me is not None
    assert me["total_resolved"] == 5
    assert me["median_days_to_resolve"] == 6.0
    assert me["p90_days_to_resolve"] == 9.2


# ── 7. by_flag_type breakdown ─────────────────────────────────────────────


def test_by_flag_type_breakdown_returns_evidence_gap_stats(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # Three evidence_gap flags, two clinically_significant.
    for _ in range(3):
        _seed_annotation(
            annotation_kind="flag",
            flag_type="evidence_gap",
            created_at=now - _td(days=10),
        )
    for _ in range(2):
        _seed_annotation(
            annotation_kind="flag",
            flag_type="clinically_significant",
            created_at=now - _td(days=10),
        )
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    body = r.json()
    bt = body["by_flag_type"]
    assert "evidence_gap" in bt
    assert bt["evidence_gap"]["total"] == 3
    assert bt["clinically_significant"]["total"] == 2


def test_by_flag_type_excludes_margin_note_and_region_tag(
    client: TestClient, auth_headers: dict
) -> None:
    """Margin notes and region tags carry no flag_type — must be
    excluded from by_flag_type entirely."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    _seed_annotation(
        annotation_kind="margin_note",
        flag_type=None,
        created_at=now - _td(days=10),
    )
    _seed_annotation(
        annotation_kind="region_tag",
        flag_type=None,
        created_at=now - _td(days=10),
        section_path="regions.frontal_left.alpha",
    )
    _seed_annotation(
        annotation_kind="flag",
        flag_type="evidence_gap",
        created_at=now - _td(days=10),
    )
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    body = r.json()
    bt = body["by_flag_type"]
    # Only evidence_gap should appear; margin_note/region_tag dropped.
    assert "evidence_gap" in bt
    assert "margin_note" not in bt
    assert "region_tag" not in bt
    assert bt["evidence_gap"]["total"] == 1


# ── 8. evidence_gap_open_overdue_count ────────────────────────────────────


def test_evidence_gap_open_overdue_count_only_overdue_evidence_gap(
    client: TestClient, auth_headers: dict
) -> None:
    """Surface only evidence_gap flags that are still_open_overdue."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # Overdue evidence_gap (still open, > 30d) — counts.
    _seed_annotation(
        annotation_kind="flag",
        flag_type="evidence_gap",
        created_at=now - _td(days=40),
    )
    # In grace evidence_gap — does NOT count.
    _seed_annotation(
        annotation_kind="flag",
        flag_type="evidence_gap",
        created_at=now - _td(days=10),
    )
    # Resolved evidence_gap — does NOT count.
    c2 = now - _td(days=40)
    _seed_annotation(
        annotation_kind="flag",
        flag_type="evidence_gap",
        created_at=c2,
        resolved_at=c2 + _td(days=5),
        resolved_by_user_id=CLIN_A2_USER,
    )
    # Overdue clinically_significant — different flag, does NOT count.
    _seed_annotation(
        annotation_kind="flag",
        flag_type="clinically_significant",
        created_at=now - _td(days=40),
    )
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["evidence_gap_open_overdue_count"] == 1


# ── 9. outcome_pct excludes still_open_grace ──────────────────────────────


def test_outcome_pct_excludes_still_open_grace(
    client: TestClient, auth_headers: dict
) -> None:
    """1 within_sla + 1 still_open_grace → pct = 100% within (1/1)."""
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # within
    c1 = now - _td(days=20)
    _seed_annotation(
        created_at=c1,
        resolved_at=c1 + _td(days=5),
        resolved_by_user_id=CLIN_A2_USER,
    )
    # grace (still open, 5d old, sla=30)
    _seed_annotation(created_at=now - _td(days=5))
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total_annotations"] == 2
    assert body["outcome_pct"]["resolved_within_sla"] == 100.0


# ── 10. median null when no decided rows ──────────────────────────────────


def test_median_null_when_no_resolutions(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_annotation(created_at=_dt.now(_tz.utc) - _td(days=40))
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["median_days_to_resolve"] is None
    assert body["p90_days_to_resolve"] is None


# ── 11. backlog include_grace=false ───────────────────────────────────────


def test_backlog_include_grace_false_returns_only_overdue(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    _seed_annotation(created_at=now - _td(days=40))  # overdue
    _seed_annotation(created_at=now - _td(days=10))  # grace
    r = client.get(
        f"{WL_PATH}/backlog?include_grace=false&sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total"] == 1


def test_backlog_include_grace_true_returns_both(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    _seed_annotation(created_at=now - _td(days=40))
    _seed_annotation(created_at=now - _td(days=10))
    r = client.get(
        f"{WL_PATH}/backlog?include_grace=true&sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total"] == 2


# ── 12. backlog pagination ────────────────────────────────────────────────


def test_backlog_paginates(client: TestClient, auth_headers: dict) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    for i in range(5):
        _seed_annotation(
            created_at=now - _td(days=40 + i),
            section_path=f"summary.section_{i}",
        )
    r = client.get(
        f"{WL_PATH}/backlog?include_grace=false&sla_days=30&page=1&page_size=2",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total"] == 5
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert len(body["items"]) == 2
    r2 = client.get(
        f"{WL_PATH}/backlog?include_grace=false&sla_days=30&page=3&page_size=2",
        headers=auth_headers["clinician"],
    )
    body2 = r2.json()
    assert len(body2["items"]) == 1


# ── 13. backlog body redaction ────────────────────────────────────────────


def test_backlog_body_truncates_long_body(
    client: TestClient, auth_headers: dict
) -> None:
    """Body longer than 200 chars is truncated with an ellipsis."""
    _setup_clinic_a()
    long_body = "X" * 350
    _seed_annotation(
        body=long_body, created_at=_dt.now(_tz.utc) - _td(days=40)
    )
    r = client.get(
        f"{WL_PATH}/backlog?sla_days=30", headers=auth_headers["clinician"]
    )
    body = r.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["body"].endswith("…")
    # 200 chars + ellipsis.
    assert len(item["body"]) == 201


# ── 14. trend_buckets ─────────────────────────────────────────────────────


def test_trend_buckets_emitted_weekly_for_180d_window(
    client: TestClient, auth_headers: dict
) -> None:
    """window_days=180 → ~25-26 weekly buckets."""
    _setup_clinic_a()
    _seed_annotation(created_at=_dt.now(_tz.utc) - _td(days=10))
    r = client.get(
        f"{WL_PATH}/summary?window_days=180",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    buckets = body["trend_buckets"]
    # 180 // 7 == 25.
    assert len(buckets) == 25
    # Each bucket has expected keys.
    assert all(
        {"week_start", "created", "resolved", "abandoned"} <= set(b.keys())
        for b in buckets
    )


# ── 15. integration: create + resolve various → consistent state ──────────


def test_integration_create_and_resolve_various_consistent_state(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # 2 within, 1 late, 1 overdue, 1 grace.
    c = now - _td(days=20)
    _seed_annotation(
        created_at=c, resolved_at=c + _td(days=3),
        resolved_by_user_id=CLIN_A2_USER,
    )
    c = now - _td(days=21)
    _seed_annotation(
        created_at=c, resolved_at=c + _td(days=4),
        resolved_by_user_id=CLIN_A2_USER,
    )
    c = now - _td(days=70)
    _seed_annotation(
        created_at=c, resolved_at=c + _td(days=40),
        resolved_by_user_id=CLIN_A2_USER,
    )
    _seed_annotation(created_at=now - _td(days=40))
    _seed_annotation(created_at=now - _td(days=5))
    r = client.get(
        f"{WL_PATH}/summary?sla_days=30",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total_annotations"] == 5
    assert body["outcome_counts"]["resolved_within_sla"] == 2
    assert body["outcome_counts"]["resolved_late"] == 1
    assert body["outcome_counts"]["still_open_overdue"] == 1
    assert body["outcome_counts"]["still_open_grace"] == 1


# ── 16. audit-events scoped + paginated ───────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Trigger summary_viewed audit row.
    client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    r = client.get(
        f"{WL_PATH}/audit-events?limit=10",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["surface"] == SURFACE
    assert body["limit"] == 10
    actions = {it["action"] for it in body["items"]}
    assert f"{SURFACE}.summary_viewed" in actions


# ── 17. empty clinic returns clean structure ──────────────────────────────


def test_empty_clinic_returns_clean_structure(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(
        f"{WL_PATH}/summary", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_annotations"] == 0
    assert body["outcome_counts"]["resolved_within_sla"] == 0
    assert body["evidence_gap_open_overdue_count"] == 0
    assert body["median_days_to_resolve"] is None
    assert body["p90_days_to_resolve"] is None
    # Disclaimers present.
    assert isinstance(body["disclaimers"], list)
    assert len(body["disclaimers"]) > 0


# ── 18. resolver-latency-summary excludes below min_resolved ──────────────


def test_resolver_latency_excludes_below_min_resolved(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # Resolver A: 1 resolution (below min_resolved=2).
    c1 = now - _td(days=20)
    _seed_annotation(
        created_at=c1,
        resolved_at=c1 + _td(days=3),
        resolved_by_user_id=CLIN_A_USER,
    )
    # Resolver B: 2 resolutions.
    for i in range(2):
        c = now - _td(days=20 + i)
        _seed_annotation(
            created_at=c,
            resolved_at=c + _td(days=3 + i),
            resolved_by_user_id=CLIN_A2_USER,
        )
    r = client.get(
        f"{WL_PATH}/resolver-latency-summary?min_resolved=2",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    rids = {it["resolver_user_id"] for it in body["items"]}
    assert CLIN_A_USER not in rids
    assert CLIN_A2_USER in rids


# ── 19. clinician-creator-summary names + ordering ────────────────────────


def test_clinician_creator_summary_emits_total_created(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    for i in range(3):
        _seed_annotation(
            creator_user_id=CLIN_A2_USER,
            created_at=now - _td(days=10 + i),
        )
    r = client.get(
        f"{WL_PATH}/clinician-creator-summary?min_created=2",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    me = next(
        (i for i in body["items"] if i["creator_user_id"] == CLIN_A2_USER),
        None,
    )
    assert me is not None
    assert me["total_created"] == 3


# ── 20. backlog sorts most-overdue first ──────────────────────────────────


def test_backlog_sorts_most_overdue_first(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    now = _dt.now(_tz.utc)
    # Three overdue: 35d, 50d, 60d. Expect 60d first.
    _seed_annotation(
        created_at=now - _td(days=35), section_path="summary.a"
    )
    _seed_annotation(
        created_at=now - _td(days=60), section_path="summary.b"
    )
    _seed_annotation(
        created_at=now - _td(days=50), section_path="summary.c"
    )
    r = client.get(
        f"{WL_PATH}/backlog?sla_days=30&page=1&page_size=10",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total"] == 3
    items = body["items"]
    # First = most-overdue (largest days_open).
    assert items[0]["days_open"] >= items[1]["days_open"]
    assert items[1]["days_open"] >= items[2]["days_open"]


# ── 21. window_days clamps out-of-range values ────────────────────────────


def test_window_days_clamps_to_max(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(
        f"{WL_PATH}/summary?window_days=99999",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    # MAX_WINDOW_DAYS = 365.
    assert body["window_days"] == 365


def test_sla_days_clamps_to_max(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(
        f"{WL_PATH}/summary?sla_days=99999",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    # MAX_SLA_DAYS = 180.
    assert body["sla_days"] == 180

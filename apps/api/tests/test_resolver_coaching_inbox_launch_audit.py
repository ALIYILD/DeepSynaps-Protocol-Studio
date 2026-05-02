"""Tests for the Resolver Coaching Inbox launch-audit (DCRO2, 2026-05-02).

Private, read-only inbox view per resolver showing THEIR OWN wrong
``false_positive`` calls. Mirrors the Wearables Workbench → Clinician
Inbox handoff (#353/#354): admins do NOT drill into another resolver's
coaching rows; coaching is resolver-led self-correction.

Pattern mirrors
``test_caregiver_delivery_concern_resolution_outcome_tracker_launch_audit.py``
(DCRO1, #393) which provides the underlying paired-outcome service.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    CaregiverDigestPreference,
    User,
)


os.environ.pop("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", None)


FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
CONCERN_FILED_ACTION = "caregiver_portal.delivery_concern_filed"
SURFACE = "resolver_coaching_inbox"
SELF_REVIEW_NOTE_ACTION = f"{SURFACE}.self_review_note_filed"
INBOX_PATH = "/api/v1/resolver-coaching-inbox"

DEMO_CLINIC = "clinic-demo-default"
OTHER_CLINIC = "clinic-dcro2-other"

# Demo actor IDs that map to the canonical demo tokens in conftest.
ACTOR_CLINICIAN = "actor-clinician-demo"
ACTOR_ADMIN = "actor-admin-demo"

# Synthetic resolver / caregiver IDs.
CG_A = "actor-dcro2-cg-a"
CG_B = "actor-dcro2-cg-b"
CG_C = "actor-dcro2-cg-c"
CG_D = "actor-dcro2-cg-d"
CG_E = "actor-dcro2-cg-e"
CG_F = "actor-dcro2-cg-f"
CG_OTHER = "actor-dcro2-cg-other"

# RESOLVER_X is wired into the clinician demo token so my-coaching-inbox
# returns rows for the calling user. Other resolvers are foils.
RESOLVER_X = ACTOR_CLINICIAN
RESOLVER_Y = "actor-dcro2-resolver-y"
RESOLVER_Z = "actor-dcro2-resolver-z"
RESOLVER_W = "actor-dcro2-resolver-w"
RESOLVER_V = "actor-dcro2-resolver-v"

_ALL_USER_IDS = (
    CG_A,
    CG_B,
    CG_C,
    CG_D,
    CG_E,
    CG_F,
    CG_OTHER,
    RESOLVER_Y,
    RESOLVER_Z,
    RESOLVER_W,
    RESOLVER_V,
)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [
                    "caregiver_portal",
                    "caregiver_delivery_concern_resolution",
                    "caregiver_delivery_concern_resolution_audit_hub",
                    "caregiver_delivery_concern_resolution_outcome_tracker",
                    SURFACE,
                ]
            )
        ).delete(synchronize_session=False)
        db.query(CaregiverDigestPreference).filter(
            CaregiverDigestPreference.caregiver_user_id.in_(list(_ALL_USER_IDS))
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_ALL_USER_IDS))).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
    role: str = "clinician",
    clinic_id: str = DEMO_CLINIC,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            db.commit()
            return
        em = email or f"{user_id}@example.com"
        db.add(
            User(
                id=user_id,
                email=em,
                display_name=display_name or em.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_resolution(
    *,
    caregiver_user_id: str,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    resolution_reason: str = "false_positive",
    resolution_note: str = "demo resolution note",
    age_hours: float = 24.0 * 35,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"resolved-{caregiver_user_id}-{resolver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"caregiver_user_id={caregiver_user_id}; "
            f"clinic_id={clinic_id}; "
            f"resolver_user_id={resolver_user_id}; "
            f"resolution_reason={resolution_reason}; "
            f"resolution_note={resolution_note}"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=RESOLVE_ACTION,
                role="reviewer",
                actor_id=resolver_user_id,
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_flag(
    *,
    caregiver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_hours: float = 24.0,
    concern_count: int = 3,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"flag-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high "
            f"caregiver_id={caregiver_user_id} "
            f"clinic_id={clinic_id} "
            f"concern_count={concern_count} "
            f"window_hours=168 "
            f"threshold=3"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=FLAG_ACTION,
                role="admin",
                actor_id="caregiver-delivery-concern-aggregator-worker",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_concern_filed(
    *,
    caregiver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_hours: float = 12.0,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"concern-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"caregiver_user_id={caregiver_user_id} "
            f"clinic_id={clinic_id} "
            f"reason=demo concern"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=CONCERN_FILED_ACTION,
                role="patient",
                actor_id="actor-patient-demo",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_caregiver_pref(
    *,
    caregiver_user_id: str,
    preferred_channel: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(CaregiverDigestPreference)
            .filter_by(caregiver_user_id=caregiver_user_id)
            .first()
        )
        now = _dt.now(_tz.utc).isoformat()
        if existing is None:
            db.add(
                CaregiverDigestPreference(
                    id=f"pref-{caregiver_user_id}",
                    caregiver_user_id=caregiver_user_id,
                    enabled=True,
                    frequency="daily",
                    time_of_day="08:00",
                    preferred_channel=preferred_channel,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            existing.preferred_channel = preferred_channel
            existing.updated_at = now
        db.commit()
    finally:
        db.close()


def _seed_wrong_fp(
    *,
    caregiver_user_id: str,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    res_age_hours: float = 24.0 * 35,
    flag_age_hours: float = 24.0 * 20,
) -> str:
    """Helper: seed a resolved (false_positive) row + a re-flag within
    30d → outcome=re_flagged_within_30d. Returns the resolved-row id."""
    eid = _seed_resolution(
        caregiver_user_id=caregiver_user_id,
        resolver_user_id=resolver_user_id,
        clinic_id=clinic_id,
        resolution_reason="false_positive",
        age_hours=res_age_hours,
    )
    _seed_flag(
        caregiver_user_id=caregiver_user_id,
        clinic_id=clinic_id,
        age_hours=flag_age_hours,
    )
    return eid


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_dcro2_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_dcro2_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith(SURFACE + "-")


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_my_inbox_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_my_inbox_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_my_inbox(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. my-coaching-inbox returns ONLY resolver's own wrong-fp calls ────────


class TestMyCoachingInbox:
    def test_only_returns_calling_users_own_wrong_fp_calls(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolver X (calling user) and resolver Y both have wrong-fp
        calls in the same clinic. Only X's calls appear."""
        _seed_user(CG_A)
        _seed_user(CG_B)
        _seed_user(RESOLVER_Y, role="clinician")

        # Wrong-fp by RESOLVER_X (calling user).
        rid_x = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        # Wrong-fp by RESOLVER_Y (other user, same clinic).
        _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y)

        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["resolver_user_id"] == RESOLVER_X
        ids = [c["resolved_audit_id"] for c in data["wrong_false_positive_calls"]]
        assert rid_x in ids, ids
        # No other resolver's rows must leak into this resolver's inbox.
        for c in data["wrong_false_positive_calls"]:
            assert c["caregiver_user_id"] != CG_B
        assert data["summary"]["total_wrong_calls"] == 1

    def test_resolver_a_cannot_see_resolver_b_inbox(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Even though RESOLVER_Y has wrong-fp calls in the same clinic,
        the calling user (RESOLVER_X) only sees their own — there is NO
        cross-resolver query parameter."""
        _seed_user(CG_A)
        _seed_user(CG_B)
        _seed_user(RESOLVER_Y, role="clinician")

        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)
        _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y)

        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Calling user has no wrong-fp calls of their own.
        assert data["wrong_false_positive_calls"] == []
        assert data["summary"]["total_wrong_calls"] == 0

    def test_admin_cannot_query_other_resolver_via_query_param(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """No matter what query parameters the admin tries to pass, the
        response is hard-scoped to ``actor.actor_id``."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_Y, role="clinician")
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

        # Admin token; admin tries (futilely) to read RESOLVER_Y's inbox.
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?resolver_user_id={RESOLVER_Y}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["resolver_user_id"] == ACTOR_ADMIN
        # Admin has filed no resolutions at all.
        assert data["wrong_false_positive_calls"] == []


# ── 4. Cross-clinic IDOR ────────────────────────────────────────────────────


class TestCrossClinic:
    def test_clinic2_resolver_cannot_see_clinic1_data(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Seed a wrong-fp row in OTHER_CLINIC under a foreign resolver
        whose ``resolver_user_id`` matches the calling user's actor_id
        (RESOLVER_X) but whose ``clinic_id`` needle is OTHER_CLINIC.

        The pairing service filters by the ``clinic_id={cid}`` needle
        in the resolved-row note, so even though the resolver_user_id
        collides, the row must be filtered out for a caller in clinic-
        demo-default.
        """
        # IMPORTANT: do NOT _seed_user(RESOLVER_X, clinic_id=OTHER_CLINIC)
        # — that would mutate the demo clinician's User row and lift
        # actor.clinic_id to OTHER_CLINIC, defeating the test premise.
        # Instead, seed only the foreign-clinic CG and write the audit
        # rows directly with the OTHER_CLINIC needle.
        _seed_user(CG_OTHER, clinic_id=OTHER_CLINIC)
        _seed_wrong_fp(
            caregiver_user_id=CG_OTHER,
            resolver_user_id=RESOLVER_X,
            clinic_id=OTHER_CLINIC,
        )

        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Caller is in clinic-demo-default (verified by the conftest
        # demo-user seed). The OTHER_CLINIC row must NOT contribute.
        assert data["clinic_id"] == DEMO_CLINIC
        assert data["summary"]["total_wrong_calls"] == 0


# ── 5. Calibration accuracy + bottom quartile ───────────────────────────────


class TestCalibrationAccuracy:
    def test_calibration_matches_dcro1_calc(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """5 fp calls, 1 re-flagged → 80% calibration accuracy (matches
        DCRO1's compute_resolver_calibration)."""
        for cg in (CG_A, CG_B, CG_C, CG_D, CG_E):
            _seed_user(cg)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_X,
                resolution_reason="false_positive",
                age_hours=24.0 * 35,
            )
        # CG_A re-flagged within 30d → 1 wrong call out of 5 fp calls.
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 20)

        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert abs(data["calibration_accuracy_pct"] - 80.0) < 0.5
        assert data["summary"]["total_wrong_calls"] == 1


class TestBottomQuartile:
    def _seed_resolver_with_fp_outcome(
        self,
        *,
        resolver_id: str,
        n_fp_calls: int,
        n_re_flagged: int,
    ) -> None:
        """Seed ``n_fp_calls`` false_positive resolutions for
        ``resolver_id``; the first ``n_re_flagged`` of them get a re-
        flag within 30d."""
        for i in range(n_fp_calls):
            cg = f"actor-dcro2-bq-{resolver_id}-cg-{i}"
            _seed_user(cg)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=resolver_id,
                resolution_reason="false_positive",
                age_hours=24.0 * 35,
            )
            if i < n_re_flagged:
                _seed_flag(caregiver_user_id=cg, age_hours=24.0 * 20)

    def test_in_bottom_quartile_true_for_lowest_accuracy(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Five resolvers in the clinic; the calling user is the worst.
        ``in_bottom_quartile`` must be True."""
        # Calling user (RESOLVER_X) is the worst — 5 fp calls, 4 wrong
        # → 20% accuracy.
        self._seed_resolver_with_fp_outcome(
            resolver_id=RESOLVER_X, n_fp_calls=5, n_re_flagged=4
        )
        # Other resolvers — varying degrees of "good".
        for resolver_id, fp, wrong in (
            (RESOLVER_Y, 5, 0),  # 100%
            (RESOLVER_Z, 5, 1),  # 80%
            (RESOLVER_W, 5, 0),  # 100%
            (RESOLVER_V, 5, 0),  # 100%
        ):
            _seed_user(resolver_id)
            self._seed_resolver_with_fp_outcome(
                resolver_id=resolver_id, n_fp_calls=fp, n_re_flagged=wrong
            )
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["in_bottom_quartile"] is True

    def test_in_bottom_quartile_false_for_top_half(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Calling user is 100%; 4 weaker resolvers below them.
        ``in_bottom_quartile`` must be False."""
        # Calling user (RESOLVER_X) — 5 fp calls, 0 wrong → 100%.
        self._seed_resolver_with_fp_outcome(
            resolver_id=RESOLVER_X, n_fp_calls=5, n_re_flagged=0
        )
        for resolver_id, wrong in (
            (RESOLVER_Y, 4),
            (RESOLVER_Z, 3),
            (RESOLVER_W, 2),
            (RESOLVER_V, 1),
        ):
            _seed_user(resolver_id)
            self._seed_resolver_with_fp_outcome(
                resolver_id=resolver_id, n_fp_calls=5, n_re_flagged=wrong
            )
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["in_bottom_quartile"] is False


# ── 6. Subsequent concern count + adapter list ──────────────────────────────


class TestSubsequentConcernCount:
    def test_subsequent_concern_count_is_in_window(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Seed 3 concern_filed rows BETWEEN resolution and re-flag,
        2 BEFORE resolution, 1 AFTER re-flag. Only the 3 in-window
        concerns count."""
        _seed_user(CG_A)
        _seed_wrong_fp(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            res_age_hours=24.0 * 35,
            flag_age_hours=24.0 * 20,
        )
        # In-window: between -35d (resolved) and -20d (flag).
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 30)
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 25)
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 22)
        # Out-of-window — before resolved_at.
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 50)
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 40)
        # Out-of-window — after re_flagged_at.
        _seed_concern_filed(caregiver_user_id=CG_A, age_hours=24.0 * 5)

        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["wrong_false_positive_calls"]) == 1
        assert data["wrong_false_positive_calls"][0]["subsequent_concern_count"] == 3


class TestAdapterList:
    def test_adapter_list_renders_default_when_no_pref(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X)
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        adapters = r.json()["wrong_false_positive_calls"][0]["adapter_list"]
        assert "slack" in adapters
        assert "twilio" in adapters
        assert "sendgrid" in adapters
        assert "pagerduty" in adapters

    def test_adapter_list_honours_preferred_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Caregiver with preferred_channel='sms' (twilio) → twilio is
        rendered FIRST in the adapter chain."""
        _seed_user(CG_A)
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X)
        _seed_caregiver_pref(caregiver_user_id=CG_A, preferred_channel="sms")
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        adapters = r.json()["wrong_false_positive_calls"][0]["adapter_list"]
        assert adapters[0] == "sms"


# ── 7. Empty inbox ──────────────────────────────────────────────────────────


class TestEmptyInbox:
    def test_empty_inbox_returns_clean_structure(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["wrong_false_positive_calls"] == []
        assert data["summary"]["total_wrong_calls"] == 0
        # No nulls in summary scalars besides the optional median.
        assert data["summary"]["median_days_to_re_flag"] is None
        # Calibration defaults to 100% (no fp calls → vacuously calibrated).
        assert abs(data["calibration_accuracy_pct"] - 100.0) < 0.5
        assert data["in_bottom_quartile"] is False


# ── 8. Self-review note flow ────────────────────────────────────────────────


class TestSelfReviewNote:
    def test_resolver_can_file_note_for_own_resolution(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": "I should have asked for one more delivery cycle before dismissing this caregiver.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["resolved_audit_id"] == rid
        assert data["event_id"].startswith(SURFACE + "-self_review_note_filed-")

    def test_resolver_cannot_file_note_for_another_resolvers_resolution(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """RESOLVER_Y owns the resolution. The calling user (RESOLVER_X)
        tries to file a note — must 403."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_Y, role="clinician")
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y
        )
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": "Trying to file someone else's note — should fail.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text

    def test_self_review_note_404_when_resolution_not_wrong_fp(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolution exists but is NOT a wrong-fp call (e.g.,
        concerns_addressed) → 404."""
        _seed_user(CG_A)
        rid = _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 35,
        )
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": "This was concerns_addressed, not wrong fp.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_self_review_note_404_when_resolution_does_not_exist(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": "no-such-resolution",
                "self_review_note": "Does not exist — should 404.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_self_review_note_422_when_too_short(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": "short",  # <10 chars
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_self_review_note_422_when_too_long(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        too_long = "x" * 600
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": too_long,
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422, r.text

    def test_self_review_note_emits_audit_row_with_correct_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        note_text = "Filed self-review note about CG_A wrong call."
        r = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": note_text,
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

        # Verify the audit row was emitted with the canonical shape.
        db = SessionLocal()
        try:
            audit_row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == SELF_REVIEW_NOTE_ACTION,
                    AuditEventRecord.target_id == rid,
                    AuditEventRecord.actor_id == ACTOR_CLINICIAN,
                )
                .first()
            )
            assert audit_row is not None
            assert audit_row.target_type == SURFACE
            assert f"resolver_user_id={ACTOR_CLINICIAN}" in (audit_row.note or "")
            assert f"resolved_audit_id={rid}" in (audit_row.note or "")
            assert "self_review_note=" in (audit_row.note or "")
        finally:
            db.close()

    def test_self_review_note_renders_in_my_inbox_after_filing(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        rid = _seed_wrong_fp(
            caregiver_user_id=CG_A, resolver_user_id=RESOLVER_X
        )
        note_text = "Will hold the next CG_A flag for one more delivery cycle."
        r1 = client.post(
            f"{INBOX_PATH}/self-review-note",
            json={
                "resolved_audit_id": rid,
                "self_review_note": note_text,
            },
            headers=auth_headers["clinician"],
        )
        assert r1.status_code == 200, r1.text
        r2 = client.get(
            f"{INBOX_PATH}/my-coaching-inbox?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200, r2.text
        rows = r2.json()["wrong_false_positive_calls"]
        match = [r for r in rows if r["resolved_audit_id"] == rid]
        assert len(match) == 1
        assert note_text in (match[0]["self_review_note"] or "")


# ── 9. Admin overview ───────────────────────────────────────────────────────


class TestAdminOverview:
    def test_admin_can_see_all_resolvers_in_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Two resolvers each with wrong-fp calls.
        for cg in (CG_A, CG_B, CG_C):
            _seed_user(cg)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_X,
                resolution_reason="false_positive",
                age_hours=24.0 * 35,
            )
        for cg in (CG_D, CG_E, CG_F):
            _seed_user(cg)
            _seed_user(RESOLVER_Y, role="clinician", display_name="Reviewer Y")
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_Y,
                resolution_reason="false_positive",
                age_hours=24.0 * 35,
            )
        r = client.get(
            f"{INBOX_PATH}/admin-overview?window_days=90&min_resolutions=1",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["resolver_user_id"] for it in r.json()["items"]]
        assert RESOLVER_X in ids
        assert RESOLVER_Y in ids

    def test_clinician_admin_overview_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{INBOX_PATH}/admin-overview?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text


# ── 10. Audit-events list ───────────────────────────────────────────────────


class TestAuditEventsList:
    def test_audit_events_paginated_and_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # File 3 self-review notes by RESOLVER_X.
        _seed_user(CG_A)
        _seed_user(CG_B)
        _seed_user(CG_C)
        for cg in (CG_A, CG_B, CG_C):
            rid = _seed_wrong_fp(
                caregiver_user_id=cg, resolver_user_id=RESOLVER_X
            )
            client.post(
                f"{INBOX_PATH}/self-review-note",
                json={
                    "resolved_audit_id": rid,
                    "self_review_note": f"audit-list note for {cg} (long enough)",
                },
                headers=auth_headers["clinician"],
            )
        r = client.get(
            f"{INBOX_PATH}/audit-events?surface={SURFACE}&limit=2&offset=0",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["limit"] == 2
        assert data["offset"] == 0
        # The view audit row from the 3 my-coaching-inbox calls (one
        # per fixture call inside _seed_wrong_fp's pairing) plus the 3
        # self-review-note rows means total >= 3.
        assert data["total"] >= 3
        assert data["surface"] == SURFACE
        # Items capped at limit.
        assert len(data["items"]) <= 2

    def test_audit_events_excludes_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an audit-event row for our surface tagged for OTHER_CLINIC.
        db = SessionLocal()
        try:
            db.add(
                AuditEventRecord(
                    event_id="dcro2-otherclinic-row",
                    target_id="x",
                    target_type=SURFACE,
                    action=f"{SURFACE}.view",
                    role="reviewer",
                    actor_id="someone-else",
                    note=f"clinic_id={OTHER_CLINIC}; foreign",
                    created_at=_dt.now(_tz.utc).isoformat(),
                )
            )
            db.commit()
        finally:
            db.close()
        r = client.get(
            f"{INBOX_PATH}/audit-events?surface={SURFACE}&limit=50",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        evs = [it["event_id"] for it in r.json()["items"]]
        assert "dcro2-otherclinic-row" not in evs

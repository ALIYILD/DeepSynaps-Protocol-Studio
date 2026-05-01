"""Tests for the Onboarding Wizard launch-audit hardening (PR 2026-05-01).

Covers the new endpoints added to
``apps/api/app/routers/onboarding_router.py`` for the page-level
Onboarding Wizard surface:

* GET    /api/v1/onboarding/state
* POST   /api/v1/onboarding/state
* POST   /api/v1/onboarding/step-complete
* POST   /api/v1/onboarding/skip
* POST   /api/v1/onboarding/audit-events
* POST   /api/v1/onboarding/seed-demo

Also asserts that the ``onboarding_wizard`` surface is whitelisted by both
``audit_trail_router.KNOWN_SURFACES`` and the qEEG audit-events endpoint
(per the cross-router audit-hook spec) and that audit rows surface at
``/api/v1/audit-trail?surface=onboarding_wizard`` for regulatory review.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.database import SessionLocal


# ── Surface whitelist sanity ──────────────────────────────────────────────


def test_onboarding_wizard_surface_in_audit_trail_known_surfaces():
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "onboarding_wizard" in KNOWN_SURFACES


def test_onboarding_wizard_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "note": "onboarding_wizard surface whitelist sanity",
        "surface": "onboarding_wizard",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("onboarding_wizard-")


# ── Role gate ─────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_state_get_requires_authenticated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # No auth header → guest token rejected
        r = client.get("/api/v1/onboarding/state", headers=auth_headers["guest"])
        assert r.status_code == 403

    def test_state_post_requires_authenticated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/onboarding/state",
            json={"current_step": "welcome"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_skip_requires_authenticated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/onboarding/skip",
            json={"step": "welcome", "reason": "x"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_audit_events_requires_authenticated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "view"},
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ── State get / post round-trip ──────────────────────────────────────────


class TestStatePersistence:
    def test_get_creates_row_on_first_access(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.get("/api/v1/onboarding/state", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["actor_id"] == "actor-clinician-demo"
        assert body["clinic_id"] == "clinic-demo-default"
        assert body["current_step"] == "welcome"
        assert body["is_demo"] is False
        assert body["completed_at"] is None
        assert body["abandoned_at"] is None
        assert isinstance(body["disclaimers"], list) and body["disclaimers"]

    def test_post_updates_step_and_persists_across_sessions(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/state",
            json={"current_step": "clinic_info"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["current_step"] == "clinic_info"
        # New "session" — fresh GET — sees the persisted step.
        r2 = client.get("/api/v1/onboarding/state", headers=h)
        assert r2.status_code == 200
        assert r2.json()["current_step"] == "clinic_info"

    def test_post_unknown_step_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/state",
            json={"current_step": "definitely_not_a_step"},
            headers=h,
        )
        assert r.status_code == 400
        body = r.json()
        assert body.get("code") == "invalid_wizard_step"

    def test_is_demo_flag_is_sticky(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Once is_demo=True, sending is_demo=False must NOT clear it.

        Stickiness exists because downstream records seeded during the wizard
        carry the DEMO banner; if the flag could be revoked retroactively
        we'd silently re-classify those records as production data.
        """
        h = auth_headers["clinician"]
        # Set demo via seed-demo
        r = client.post(
            "/api/v1/onboarding/seed-demo",
            json={"requested_kinds": ["patient"], "note": "first patient"},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["is_demo"] is True
        # Try to clear it
        r2 = client.post(
            "/api/v1/onboarding/state",
            json={"current_step": "clinic_info", "is_demo": False},
            headers=h,
        )
        assert r2.status_code == 200
        assert r2.json()["is_demo"] is True, "is_demo must stay True once set"


# ── Step lifecycle ────────────────────────────────────────────────────────


class TestStepLifecycle:
    def test_step_complete_emits_audit_and_advances(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/step-complete",
            json={"step": "welcome", "next_step": "clinic_info"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        assert r.json()["current_step"] == "clinic_info"
        # Audit row visible at the umbrella audit-trail surface filter.
        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        )
        assert listing.status_code == 200, listing.text
        items = listing.json().get("items", [])
        actions = {it.get("action") for it in items}
        assert any(a == "onboarding_wizard.step_completed" for a in actions)

    def test_completion_step_sets_completed_at_and_emits_wizard_completed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/step-complete",
            json={"step": "completion"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["completed_at"] is not None
        # Both audit rows present on the umbrella feed.
        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        )
        actions = {it.get("action") for it in listing.json().get("items", [])}
        assert "onboarding_wizard.step_completed" in actions
        assert "onboarding_wizard.wizard_completed" in actions

    def test_unknown_step_in_step_complete_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/step-complete",
            json={"step": "made_up_step"},
            headers=h,
        )
        assert r.status_code == 400


# ── Skip / abandon ────────────────────────────────────────────────────────


class TestSkipFlow:
    def test_skip_emits_audit_with_reason(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/skip",
            json={
                "step": "data_choice",
                "reason": "not ready to add patient yet",
                "seeded_demo": False,
            },
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["abandoned_at"] is not None
        assert body["abandon_reason"] == "not ready to add patient yet"

        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        )
        items = listing.json().get("items", [])
        actions = {it.get("action") for it in items}
        assert "onboarding_wizard.step_skipped" in actions
        assert "onboarding_wizard.wizard_abandoned" in actions
        # Reason captured in note field for at least one of the rows.
        notes = " ".join(it.get("note", "") for it in items)
        assert "not ready" in notes

    def test_skip_with_seeded_demo_flips_is_demo_true(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """`skip` with seeded_demo=True must mark the actor's state demo.

        This closes the audit gap flagged at PR review: a "real-looking"
        empty clinic from a skipped wizard could otherwise be confused
        with a production tenant.
        """
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/skip",
            json={"step": "welcome", "seeded_demo": True},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["is_demo"] is True
        # Confirm subsequent state read keeps the flag True.
        r2 = client.get("/api/v1/onboarding/state", headers=h)
        assert r2.json()["is_demo"] is True


# ── Audit-events ingestion ────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_post_visible_at_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "view", "step": "welcome", "note": "page mount"},
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("onboarding_wizard-")

        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        )
        assert listing.status_code == 200
        data = listing.json()
        assert any(
            (it.get("target_type") == "onboarding_wizard"
             or it.get("surface") == "onboarding_wizard")
            for it in data.get("items", [])
        )

    def test_audit_event_demo_flag_recorded_in_note(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "step_completed", "step": "data_choice", "using_demo_data": True},
            headers=h,
        )
        assert r.status_code == 200
        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        ).json()["items"]
        rows = [
            it for it in listing
            if it.get("target_type") == "onboarding_wizard"
            and "step_completed" in (it.get("action") or "")
        ]
        assert rows, "no step_completed row visible"
        assert any("DEMO" in (it.get("note") or "") for it in rows)

    def test_audit_event_unknown_step_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "view", "step": "imaginary_step"},
            headers=h,
        )
        assert r.status_code == 400

    def test_audit_event_payload_validation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        # Empty event → 422 (Field min_length=1).
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": ""},
            headers=h,
        )
        assert r.status_code == 422
        # Oversized note → 422 (Field max_length=512).
        r = client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "view", "note": "x" * 600},
            headers=h,
        )
        assert r.status_code == 422


# ── Demo seed (explicit) ──────────────────────────────────────────────────


class TestSeedDemo:
    def test_seed_demo_marks_state_and_emits_audit(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        h = auth_headers["clinician"]
        r = client.post(
            "/api/v1/onboarding/seed-demo",
            json={
                "requested_kinds": ["patients", "protocols", "sessions"],
                "note": "wizard sample data",
            },
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["is_demo"] is True
        assert body["state"]["is_demo"] is True

        # Audit event present + tagged DEMO.
        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h,
        ).json()["items"]
        rows = [
            it for it in listing
            if it.get("action") == "onboarding_wizard.demo_seeded"
        ]
        assert rows, "no demo_seeded row visible"
        assert any("DEMO" in (it.get("note") or "") for it in rows)


# ── Cross-clinic isolation ────────────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_state_is_per_actor(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """State is keyed on actor_id — admin and clinician get separate rows."""
        h_clin = auth_headers["clinician"]
        h_admin = auth_headers["admin"]
        # Clinician advances to clinic_info
        client.post(
            "/api/v1/onboarding/state",
            json={"current_step": "clinic_info"},
            headers=h_clin,
        )
        # Admin's first read should still be welcome (separate row).
        r = client.get("/api/v1/onboarding/state", headers=h_admin)
        assert r.status_code == 200
        assert r.json()["current_step"] == "welcome"
        assert r.json()["actor_id"] == "actor-admin-demo"

    def test_audit_trail_admin_sees_other_clinicians_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Admin actors are cross-clinic: they see clinician-emitted events."""
        h_clin = auth_headers["clinician"]
        h_admin = auth_headers["admin"]
        client.post(
            "/api/v1/onboarding/audit-events",
            json={"event": "view", "step": "welcome"},
            headers=h_clin,
        )
        listing = client.get(
            "/api/v1/audit-trail?surface=onboarding_wizard",
            headers=h_admin,
        )
        assert listing.status_code == 200
        items = listing.json().get("items", [])
        # At least one row authored by the clinician must be visible to the admin.
        assert any(
            it.get("actor_id") == "actor-clinician-demo"
            for it in items
        )

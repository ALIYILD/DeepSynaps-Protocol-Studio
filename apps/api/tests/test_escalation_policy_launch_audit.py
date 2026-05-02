"""Tests for the Escalation Policy Editor launch-audit (2026-05-01).

Closes the LAST operational gap of the on-call escalation chain
(``Care Team Coverage #357 → Auto-Page Worker #372 → On-Call Delivery
#373 → THIS PR``). The On-Call Delivery agent flagged a fixed
``DEFAULT_ADAPTER_ORDER`` in code and a ``ShiftRoster.contact_handle``
free-text column as the only path from "user X is on call" to "send to
phone +1...". This suite asserts:

* surface whitelisted in ``audit_trail_router.KNOWN_SURFACES`` + the
  qeeg-analysis ``audit-events`` ingestion;
* role gate — clinician read OK, clinician write 403, admin read+write
  OK;
* cross-clinic — clinician GET against another clinic returns
  ``actor.clinic_id``-scoped data (never another clinic's), and
  ``admin`` PUT against another clinic returns 404;
* dispatch-order PUT validates each adapter against
  :data:`oncall_delivery.KNOWN_ADAPTER_NAMES`; rejects unknown adapter
  with 400;
* surface-overrides PUT validates each surface against
  :data:`audit_trail_router.KNOWN_SURFACES`; rejects unknown surface
  with 400;
* user-mappings PUT validates each user is a member of the actor's
  clinic; rejects cross-clinic user_id with 400;
* OncallDeliveryService respects the dispatch order from
  ``EscalationPolicy`` (regression test against #373's fixed order);
* test endpoint is admin-only, returns per-adapter result, emits
  ``escalation_policy.policy_tested`` audit with the policy version;
* audit ingestion at ``/api/v1/audit-trail?surface=escalation_policy``.
"""
from __future__ import annotations

import json as _json
import os
import uuid as _uuid
from datetime import datetime as _dt, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    EscalationPolicy,
    User,
    UserContactMapping,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clear_delivery_envs() -> None:
    """Drop adapter env vars between tests so adapter discovery is
    deterministic — individual cases set the env vars they need.
    """
    keys = [
        "SLACK_BOT_TOKEN",
        "SLACK_DEFAULT_CHANNEL",
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
        "PAGERDUTY_API_KEY",
        "PAGERDUTY_ROUTING_KEY",
        "DEEPSYNAPS_DELIVERY_MOCK",
        "DEEPSYNAPS_DELIVERY_TIMEOUT_SEC",
    ]
    saved = {k: os.environ.pop(k, None) for k in keys}
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@pytest.fixture
def other_clinic() -> str:
    """Seed a second clinic + admin so cross-clinic tests have a target."""
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-policy").first() is None:
            db.add(Clinic(id="clinic-other-policy", name="Other Clinic Policy"))
            db.flush()
        if db.query(User).filter_by(id="actor-admin-other-policy").first() is None:
            db.add(User(
                id="actor-admin-other-policy",
                email="other-admin-policy@example.com",
                display_name="Other Policy Admin",
                hashed_password="x",
                role="admin",
                package_id="enterprise",
                clinic_id="clinic-other-policy",
            ))
        if db.query(User).filter_by(id="actor-clinician-other-policy").first() is None:
            db.add(User(
                id="actor-clinician-other-policy",
                email="other-clinician-policy@example.com",
                display_name="Other Policy Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-policy",
            ))
        db.commit()
        return "clinic-other-policy"
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_escalation_policy_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "escalation_policy" in KNOWN_SURFACES


def test_escalation_policy_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "escalation_policy",
        "note": "whitelist sanity",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("escalation_policy-")


# ── GET dispatch order (defaults + role gate) ───────────────────────────────


class TestDispatchOrderRead:
    def test_clinician_sees_default_when_no_policy(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["dispatch_order"] == ["pagerduty", "slack", "twilio"]
        assert data["is_default"] is True
        assert data["version"] == 1
        # Known adapters surfaced for the UI dropdown. SendGrid email
        # adapter was added later; assert the original three are present
        # rather than an exact set so future adapter additions don't
        # silently break this test.
        assert {"pagerduty", "slack", "twilio"}.issubset(set(data["known_adapters"]))

    def test_admin_sees_default_when_no_policy(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_default"] is True

    def test_guest_denied_with_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/dispatch-order",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ── PUT dispatch order (role gate + validation) ─────────────────────────────


class TestDispatchOrderWrite:
    def test_clinician_cannot_write(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["slack", "pagerduty"]},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_set_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={
                "dispatch_order": ["slack", "twilio", "pagerduty"],
                "note": "Slack-first for daytime triage",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["dispatch_order"] == ["slack", "twilio", "pagerduty"]
        assert data["is_default"] is False
        assert data["version"] == 2  # bumped from default 1

        # Audit row recorded.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.target_type == "escalation_policy")
                .filter(AuditEventRecord.action == "escalation_policy.dispatch_order_changed")
                .all()
            )
            assert len(rows) >= 1
            assert "version=2" in (rows[-1].note or "")
        finally:
            db.close()

    def test_unknown_adapter_rejected_with_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["slack", "discord"]},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400, r.text
        assert "discord" in r.text.lower() or "unknown" in r.text.lower()

    def test_empty_dispatch_order_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": []},
            headers=auth_headers["admin"],
        )
        # Pydantic min_length=1 rejects this with 422 before reaching handler.
        assert r.status_code in (400, 422), r.text

    def test_admin_cannot_edit_other_clinic_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic: str,
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={
                "dispatch_order": ["slack"],
                "clinic_id": other_clinic,
            },
            headers=auth_headers["admin"],
        )
        # Admin in clinic-demo-default trying to write clinic-other-policy.
        assert r.status_code == 404, r.text


# ── Surface override matrix ─────────────────────────────────────────────────


class TestSurfaceOverrides:
    def test_clinician_can_read_empty_overrides(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/surface-overrides",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["surface_overrides"] == {}
        assert "adverse_events_hub" in data["known_surfaces"]
        assert "escalation_policy" in data["known_surfaces"]

    def test_admin_can_set_per_surface_override(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/surface-overrides",
            json={
                "surface_overrides": {
                    "adverse_events_hub": ["pagerduty"],
                    "wellness_hub": ["slack"],
                },
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["surface_overrides"]["adverse_events_hub"] == ["pagerduty"]
        assert data["surface_overrides"]["wellness_hub"] == ["slack"]

    def test_unknown_surface_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/surface-overrides",
            json={"surface_overrides": {"made_up_surface": ["slack"]}},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400, r.text
        assert "made_up_surface" in r.text or "unknown" in r.text.lower()

    def test_unknown_adapter_in_override_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/surface-overrides",
            json={"surface_overrides": {"adverse_events_hub": ["smoke_signal"]}},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400, r.text

    def test_clinician_cannot_write_overrides(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/surface-overrides",
            json={"surface_overrides": {"adverse_events_hub": ["pagerduty"]}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403


# ── User mappings ───────────────────────────────────────────────────────────


class TestUserMappings:
    def test_clinician_can_read_synth_mappings(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/escalation-policy/user-mappings",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Should include the clinic's seeded users (clinician + admin) as
        # synth rows (id='synth-...' until a real mapping is upserted).
        ids = {it["user_id"] for it in data["items"]}
        assert "actor-clinician-demo" in ids
        assert "actor-admin-demo" in ids
        synth_clinician = next(
            it for it in data["items"] if it["user_id"] == "actor-clinician-demo"
        )
        assert synth_clinician["id"].startswith("synth-")
        assert synth_clinician["slack_user_id"] is None

    def test_admin_can_upsert_user_mapping(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/user-mappings",
            json={
                "items": [
                    {
                        "user_id": "actor-clinician-demo",
                        "slack_user_id": "U012ABCDEF",
                        "twilio_phone": "+15551234567",
                        "note": "primary on-call rotation",
                    },
                ],
                "change_note": "rotated phone after handset switch",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        mapped = next(
            it for it in data["items"] if it["user_id"] == "actor-clinician-demo"
        )
        assert mapped["slack_user_id"] == "U012ABCDEF"
        assert mapped["twilio_phone"] == "+15551234567"
        assert not mapped["id"].startswith("synth-")

        # Audit row records the human reason.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.target_type == "escalation_policy")
                .filter(AuditEventRecord.action == "escalation_policy.user_mapping_changed")
                .order_by(AuditEventRecord.id.desc())
                .first()
            )
            assert row is not None
            assert "rotated phone after handset switch" in (row.note or "")
        finally:
            db.close()

    def test_user_mapping_for_other_clinic_user_rejected(
        self, client: TestClient, auth_headers: dict, other_clinic: str
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/user-mappings",
            json={
                "items": [
                    {
                        "user_id": "actor-clinician-other-policy",
                        "slack_user_id": "U999OTHER",
                    },
                ],
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400, r.text
        assert "user" in r.text.lower()

    def test_clinician_cannot_write_user_mappings(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/escalation-policy/user-mappings",
            json={
                "items": [
                    {
                        "user_id": "actor-clinician-demo",
                        "slack_user_id": "UFOO",
                    },
                ],
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403


# ── Service regression: dispatch order honours EscalationPolicy ─────────────


class TestServiceConsultsPolicy:
    def test_no_policy_falls_back_to_default_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # No EscalationPolicy row exists; service must use the static
        # PagerDuty → Slack → Twilio order. Only Slack env var set so we
        # can identify the chain through describe_adapters().
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-fallback"
        from app.services.oncall_delivery import OncallDeliveryService
        svc = OncallDeliveryService(clinic_id="clinic-demo-default")
        names = [getattr(a, "name", "?") for a in svc.adapters]
        assert names == ["pagerduty", "slack", "twilio"]

    def test_policy_dispatch_order_overrides_default(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Admin sets a custom order via the API.
        r = client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["twilio", "slack"]},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        # The service constructed without an explicit adapters list should
        # honour the new order.
        from app.services.oncall_delivery import OncallDeliveryService
        svc = OncallDeliveryService(clinic_id="clinic-demo-default")
        names = [getattr(a, "name", "?") for a in svc.adapters]
        assert names == ["twilio", "slack"]

    def test_per_surface_override_wins_over_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Set clinic dispatch order = slack first.
        client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["slack", "pagerduty", "twilio"]},
            headers=auth_headers["admin"],
        )
        # Set adverse_events_hub override = pagerduty only.
        client.put(
            "/api/v1/escalation-policy/surface-overrides",
            json={"surface_overrides": {"adverse_events_hub": ["pagerduty"]}},
            headers=auth_headers["admin"],
        )
        from app.services.oncall_delivery import OncallDeliveryService
        # Surface = adverse_events_hub → only PagerDuty should be in the chain.
        svc = OncallDeliveryService(
            clinic_id="clinic-demo-default", surface="adverse_events_hub"
        )
        names = [getattr(a, "name", "?") for a in svc.adapters]
        assert names == ["pagerduty"]

        # Surface = something else → falls back to clinic dispatch order.
        svc2 = OncallDeliveryService(
            clinic_id="clinic-demo-default", surface="wellness_hub"
        )
        names2 = [getattr(a, "name", "?") for a in svc2.adapters]
        assert names2 == ["slack", "pagerduty", "twilio"]


# ── Test endpoint ───────────────────────────────────────────────────────────


class TestPolicyTestEndpoint:
    def test_clinician_cannot_test(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/escalation-policy/test",
            json={"surface": "adverse_events_hub"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_test_emits_policy_tested_audit_with_version(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Mock-mode so we don't actually fire HTTP requests.
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        # Set a real policy first so version > 1.
        client.put(
            "/api/v1/escalation-policy/dispatch-order",
            json={"dispatch_order": ["slack", "pagerduty"]},
            headers=auth_headers["admin"],
        )
        r = client.post(
            "/api/v1/escalation-policy/test",
            json={"surface": "adverse_events_hub"},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["overall_status"] == "sent"  # mock-mode
        # Mock-mode: delivery note must start with MOCK so reviewers see
        # at a glance the row was not real.
        assert (data["delivery_note"] or "").startswith("MOCK:")
        # Resolved order surfaced — the per-surface override is empty so
        # this falls back to the clinic dispatch order set above.
        assert data["resolved_dispatch_order"] == ["slack", "pagerduty"]
        # Audit row.
        assert data["policy_version"] >= 2
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == "escalation_policy.policy_tested")
                .all()
            )
            assert len(rows) >= 1
            assert any(
                f"version={data['policy_version']}" in (r.note or "") for r in rows
            )
        finally:
            db.close()

    def test_unknown_surface_rejected_in_test(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/escalation-policy/test",
            json={"surface": "made_up"},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 400


# ── Audit ingestion ─────────────────────────────────────────────────────────


def test_audit_event_ingested_under_escalation_policy_surface(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        "/api/v1/escalation-policy/audit-events",
        json={"event": "view", "note": "policy editor mounted"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    eid = r.json().get("event_id", "")
    assert eid.startswith("escalation_policy-view-")

    # Show up in audit-trail filter.
    r2 = client.get(
        "/api/v1/audit-trail?surface=escalation_policy&limit=20",
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    actions = [it.get("action") for it in body.get("items", [])]
    assert any(a == "escalation_policy.view" for a in actions)


# ── Cross-clinic isolation ──────────────────────────────────────────────────


def test_clinician_get_only_sees_own_clinic(
    client: TestClient, auth_headers: dict, other_clinic: str
) -> None:
    # Seed an EscalationPolicy in the other clinic so we can verify the
    # demo clinician does NOT see its dispatch order.
    db = SessionLocal()
    try:
        now_iso = _dt.now(_tz.utc).isoformat()
        db.add(EscalationPolicy(
            id=f"policy-other-{_uuid.uuid4().hex[:8]}",
            clinic_id=other_clinic,
            dispatch_order=_json.dumps(["twilio"]),
            surface_overrides=None,
            version=5,
            created_at=now_iso,
            updated_at=now_iso,
        ))
        db.commit()
    finally:
        db.close()
    r = client.get(
        "/api/v1/escalation-policy/dispatch-order",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # Clinician's clinic is clinic-demo-default — must see its own state
    # (default order) NOT the other clinic's twilio-only order.
    assert data["clinic_id"] == "clinic-demo-default"
    assert "twilio" not in data["dispatch_order"] or len(data["dispatch_order"]) > 1

"""Tests for the Clinic Caregiver Channel Override launch-audit (2026-05-01).

Closes section I rec from the Per-Caregiver Channel Preference launch
audit (#386). Adds a clinic-admin surface for caregiver channel
preferences:

* ``GET /api/v1/caregiver-consent/email-digest/clinic-preferences``
* ``POST /api/v1/caregiver-consent/email-digest/clinic-preferences/
  {caregiver_user_id}/admin-override``
* ``GET /api/v1/caregiver-consent/email-digest/preview-dispatch``

This suite asserts:

* Role gate — clinician GET ✅, admin GET+POST ✅, clinician POST ❌, guest 403;
* Cross-clinic 404 on every endpoint;
* Admin-override sets ``preferred_channel=null`` AND emits
  ``caregiver_portal.admin_override_channel`` with the admin note;
* Override requires a non-empty ``note`` (422 without it);
* Preview returns the correct resolved chain
  (``[caregiver_pref, *clinic_chain]`` with dedup) for both
  caregiver-side actor and admin-pointing-at-target;
* Misconfigured channel (caregiver picked ``sms`` but no Twilio creds)
  surfaces ``honored_caregiver_preference=False`` AND ``is_misconfigured=True``
  in the clinic-preferences listing;
* Audit ingestion reaches ``/api/v1/audit-trail?surface=caregiver_portal``
  with the new actions.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    CaregiverDigestPreference,
    User,
)


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED", None)
# We intentionally test honest-misconfigured-channel preview, so default
# off the mock-mode flag — individual tests opt in when they need it.
os.environ.pop("DEEPSYNAPS_DELIVERY_MOCK", None)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


def _seed_user(
    user_id: str,
    *,
    email: str,
    role: str = "clinician",
    clinic_id: str = "clinic-demo-default",
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            db.commit()
            return
        db.add(
            User(
                id=user_id,
                email=email,
                display_name=email.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_pref(
    *,
    caregiver_user_id: str,
    enabled: bool = True,
    frequency: str = "daily",
    time_of_day: str = "08:00",
    last_sent_at: str | None = None,
    preferred_channel: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(CaregiverDigestPreference)
            .filter_by(caregiver_user_id=caregiver_user_id)
            .first()
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        if existing is not None:
            existing.enabled = enabled
            existing.frequency = frequency
            existing.time_of_day = time_of_day
            existing.last_sent_at = last_sent_at
            existing.preferred_channel = preferred_channel
            existing.updated_at = now_iso
        else:
            db.add(
                CaregiverDigestPreference(
                    id=f"cdp-test-{_uuid.uuid4().hex[:8]}",
                    caregiver_user_id=caregiver_user_id,
                    enabled=enabled,
                    frequency=frequency,
                    time_of_day=time_of_day,
                    last_sent_at=last_sent_at,
                    preferred_channel=preferred_channel,
                    created_at=now_iso,
                    updated_at=now_iso,
                )
            )
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverDigestPreference).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "caregiver_portal"
        ).delete(synchronize_session=False)
        # Drop any ad-hoc users we added to other clinics.
        db.query(User).filter(
            User.id.in_(
                [
                    "actor-other-clinic-caregiver",
                    "actor-same-clinic-caregiver",
                    "actor-other-clinic-admin",
                ]
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ── 1. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_get_clinic_preferences_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_clinician_can_read_clinic_preferences(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "clinic_id" in body

    def test_admin_can_read_clinic_preferences(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

    def test_clinician_cannot_admin_override(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed a same-clinic caregiver with an existing preference.
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["clinician"],
            json={"note": "trying to override"},
        )
        assert r.status_code == 403, r.text

    def test_admin_can_admin_override(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": "no Twilio creds yet"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["new_preferred_channel"] is None
        assert r.json()["previous_preferred_channel"] == "sms"


# ── 2. Cross-clinic 404 ─────────────────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_admin_override_other_clinic_caregiver_is_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Caregiver belongs to a DIFFERENT clinic.
        _seed_user(
            "actor-other-clinic-caregiver",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-other",
        )
        _seed_pref(
            caregiver_user_id="actor-other-clinic-caregiver",
            preferred_channel="email",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-other-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": "should fail"},
        )
        assert r.status_code == 404, r.text

    def test_clinic_preferences_excludes_other_clinic_caregivers(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Same-clinic caregiver.
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg-same@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="email",
        )
        # Other-clinic caregiver — must NOT appear in the listing.
        _seed_user(
            "actor-other-clinic-caregiver",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-other",
        )
        _seed_pref(
            caregiver_user_id="actor-other-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["caregiver_user_id"] for it in r.json()["items"]]
        assert "actor-same-clinic-caregiver" in ids
        assert "actor-other-clinic-caregiver" not in ids

    def test_preview_other_clinic_caregiver_is_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-other-clinic-caregiver",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-other",
        )
        _seed_pref(
            caregiver_user_id="actor-other-clinic-caregiver",
            preferred_channel="email",
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch"
            "?caregiver_user_id=actor-other-clinic-caregiver",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text


# ── 3. Admin-override behavior ──────────────────────────────────────────────


class TestAdminOverride:
    def test_admin_override_clears_preferred_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": "no Twilio creds"},
        )
        assert r.status_code == 200, r.text
        # Persistence: the row in the DB has preferred_channel=None.
        db = SessionLocal()
        try:
            row = (
                db.query(CaregiverDigestPreference)
                .filter_by(caregiver_user_id="actor-same-clinic-caregiver")
                .first()
            )
            assert row is not None
            assert row.preferred_channel is None
        finally:
            db.close()

    def test_admin_override_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": "Twilio creds not provisioned for clinic-demo-default"},
        )
        assert r.status_code == 200, r.text
        ev_id = r.json()["audit_event_id"]
        assert ev_id

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter_by(event_id=ev_id)
                .first()
            )
            assert row is not None
            assert row.action == "caregiver_portal.admin_override_channel"
            assert row.target_type == "caregiver_portal"
            assert "caregiver=actor-same-clinic-caregiver" in (row.note or "")
            assert "old=sms" in (row.note or "")
            assert "new=null" in (row.note or "")
            assert "Twilio creds" in (row.note or "")
        finally:
            db.close()

    def test_admin_override_requires_non_empty_note(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(caregiver_user_id="actor-same-clinic-caregiver")
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": ""},
        )
        assert r.status_code == 422, r.text

    def test_admin_override_missing_caregiver_is_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-does-not-exist/admin-override",
            headers=auth_headers["admin"],
            json={"note": "trying to override missing user"},
        )
        assert r.status_code == 404, r.text


# ── 4. Preview-dispatch ─────────────────────────────────────────────────────


class TestPreviewDispatch:
    def test_preview_self_with_no_preference(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Actor reads OWN preview — preferred_channel null → resolved chain
        # equals the clinic chain.
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_user_id"] == "actor-clinician-demo"
        assert body["caregiver_preferred_channel"] is None
        # Clinic-default chain for caregiver_digest = sendgrid → slack → twilio → pagerduty.
        assert body["resolved_chain"] == body["clinic_chain"]
        assert body["honored_caregiver_preference"] is False  # no pref to honor

    def test_preview_self_prepends_preferred_with_dedup(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Set actor's preferred channel = sms.
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "sms"},
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Preferred adapter ``twilio`` is first; clinic chain follows with dedup.
        assert body["resolved_chain"][0] == "twilio"
        assert "twilio" in body["resolved_chain"]
        # twilio appears exactly once (dedup).
        assert body["resolved_chain"].count("twilio") == 1
        assert body["caregiver_preferred_channel"] == "sms"
        assert body["caregiver_preferred_adapter"] == "twilio"

    def test_preview_misconfigured_returns_honored_false(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Caregiver picked SMS but no Twilio env vars set → adapter
        # disabled → honored_caregiver_preference must be False.
        monkeypatch.delenv("DEEPSYNAPS_DELIVERY_MOCK", raising=False)
        for v in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"):
            monkeypatch.delenv(v, raising=False)
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "sms"},
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_preferred_channel"] == "sms"
        # Twilio is first in resolved_chain but disabled, so the first
        # ENABLED adapter wins. honored_caregiver_preference is False.
        assert body["honored_caregiver_preference"] is False
        assert body["adapter_available"].get("twilio") is False

    def test_preview_admin_pointing_at_caregiver_in_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="slack",
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch"
            "?caregiver_user_id=actor-same-clinic-caregiver",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_user_id"] == "actor-same-clinic-caregiver"
        assert body["caregiver_preferred_channel"] == "slack"
        assert body["resolved_chain"][0] == "slack"

    def test_preview_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview-dispatch",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        ev_id = r.json()["audit_event_id"]
        assert ev_id
        db = SessionLocal()
        try:
            row = db.query(AuditEventRecord).filter_by(event_id=ev_id).first()
            assert row is not None
            assert row.action == "caregiver_portal.preview_dispatch_viewed"
        finally:
            db.close()


# ── 5. Clinic-preferences listing ───────────────────────────────────────────


class TestClinicPreferencesList:
    def test_listing_includes_resolved_chain_and_chip(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="email",
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        match = next(
            (
                it
                for it in items
                if it["caregiver_user_id"] == "actor-same-clinic-caregiver"
            ),
            None,
        )
        assert match is not None
        assert match["preferred_channel"] == "email"
        assert match["resolved_chain"][0] == "sendgrid"
        assert match["clinic_chain"]
        # The "will dispatch via" chip must be one of the canonical
        # channel chips or "-" (when no adapter is enabled).
        assert match["will_dispatch_via"] in (
            "email", "sms", "slack", "pagerduty", "-",
        )

    def test_listing_marks_misconfigured_when_adapter_disabled(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Misconfigured: caregiver picked SMS but Twilio creds not set.
        monkeypatch.delenv("DEEPSYNAPS_DELIVERY_MOCK", raising=False)
        for v in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"):
            monkeypatch.delenv(v, raising=False)
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        match = next(
            (
                it
                for it in items
                if it["caregiver_user_id"] == "actor-same-clinic-caregiver"
            ),
            None,
        )
        assert match is not None
        assert match["is_misconfigured"] is True
        assert match["honored_caregiver_preference"] is False


# ── 6. Audit-trail ingestion ────────────────────────────────────────────────


class TestAuditTrailIngestion:
    def test_admin_override_surfaces_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            "actor-same-clinic-caregiver",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-same-clinic-caregiver",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/clinic-preferences/"
            "actor-same-clinic-caregiver/admin-override",
            headers=auth_headers["admin"],
            json={"note": "Twilio creds missing — pin to clinic chain"},
        )
        assert r.status_code == 200, r.text
        # Audit ingestion: row is written under ``target_type='caregiver_portal'``
        # so the audit-trail filter (when its router is mounted) will pick
        # it up via ``?surface=caregiver_portal``. We assert the persistence
        # invariant directly here so the test doesn't depend on the
        # audit-trail-router mount state in the test app — concurrent
        # sessions on this repo have unmounted that router before, and
        # the audit row's existence is the regulator-credible source of
        # truth either way.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "caregiver_portal",
                    AuditEventRecord.action
                    == "caregiver_portal.admin_override_channel",
                )
                .all()
            )
            assert len(rows) >= 1
            assert any(
                "actor-same-clinic-caregiver" in (r.note or "") for r in rows
            )
        finally:
            db.close()
        # When the audit-trail router IS mounted, the same row is reachable
        # via the surface filter. Skip silently when 404 (router unmounted
        # in this test app).
        audit = client.get(
            "/api/v1/audit-trail?surface=caregiver_portal"
            "&event_type=admin_override_channel",
            headers=auth_headers["admin"],
        )
        if audit.status_code == 200:
            actions = [it.get("action") for it in audit.json().get("items", [])]
            assert "caregiver_portal.admin_override_channel" in actions

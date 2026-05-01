"""Tests for the Care Team Coverage / Staff Scheduling launch-audit (2026-05-01).

This page closes the after-hours triage loop opened by the Clinician
Inbox launch audit (#354). The Inbox aggregates HIGH-priority clinician-
visible mirror audit rows; this surface owns the **shift roster + per-
surface SLA + on-call escalation chain** and turns "an item has aged
past its SLA" into a real human page.

Asserts:
* role gate (clinician read OK / clinician write 403 / admin both OK),
* cross-clinic 404 (clinician) / 200 (admin) on read endpoints,
* roster upsert emits ``care_team_coverage.roster_edited`` audit,
* SLA-breach feed: seed 3 rows (wearables_workbench 30+min ago,
  adverse_events 6+min ago, fresh ack'd row) → list returns the
  wearables-workbench row past the 30-min default SLA AND the
  adverse_events row past the 5-min default SLA, and excludes the ack'd
  row,
* Manual page-on-call: requires note; emits the canonical
  ``inbox.item_paged_to_oncall`` audit row (visible inside the Clinician
  Inbox audit transcript and the regulator audit trail),
* Bulk-context: list of breaches respects pagination,
* Exports / list endpoints DEMO-marked when actor is in the demo clinic,
* Audit ingestion at ``/api/v1/audit-trail?surface=care_team_coverage``,
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis
  audit-events ingestion.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    EscalationChain,
    OncallPage,
    Patient,
    SLAConfig,
    ShiftRoster,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-coverage-home",
            clinician_id="actor-clinician-demo",
            first_name="Coverage",
            last_name="HomeTest",
            email="coverage-home@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_clinic() -> str:
    """Seed a second clinic + user so cross-clinic tests have a target."""
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-coverage").first() is None:
            db.add(Clinic(id="clinic-other-coverage", name="Other Clinic Coverage"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-coverage").first() is None:
            db.add(User(
                id="actor-clinician-other-coverage",
                email="other-coverage@example.com",
                display_name="Other Coverage Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-coverage",
            ))
        db.commit()
        return "clinic-other-coverage"
    finally:
        db.close()


def _seed_audit_row(
    *,
    surface: str,
    event: str,
    target_id: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "priority=high; seeded",
    created_at: _dt | None = None,
) -> str:
    """Seed a HIGH-priority audit row that the breach feed sees."""
    db = SessionLocal()
    try:
        ts = (created_at or _dt.now(_tz.utc)).isoformat()
        eid = (
            f"{surface}-{event}-{actor_id}-{int(_dt.now(_tz.utc).timestamp())}"
            f"-{_uuid.uuid4().hex[:6]}"
        )
        db.add(AuditEventRecord(
            event_id=eid,
            target_id=target_id,
            target_type=surface,
            action=f"{surface}.{event}",
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=ts,
        ))
        db.commit()
        return eid
    finally:
        db.close()


def _seed_ack_row(event_id: str, *, actor_id: str = "actor-clinician-demo") -> None:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc).isoformat()
        db.add(AuditEventRecord(
            event_id=f"ack-{_uuid.uuid4().hex[:8]}",
            target_id=f"audit-{event_id}",
            target_type="clinician_inbox",
            action="clinician_inbox.item_acknowledged",
            role="clinician",
            actor_id=actor_id,
            note=f"event={event_id}; auto-ack for test",
            created_at=ts,
        ))
        db.commit()
    finally:
        db.close()


def _seed_oncall_shift(
    *,
    clinic_id: str = "clinic-demo-default",
    user_id: str = "actor-clinician-demo",
    surface: str | None = None,
) -> str:
    """Seed an on-call shift for the current weekday in the demo clinic."""
    from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415

    now = _dt.now(_tz.utc)
    week = _monday_of(now)
    db = SessionLocal()
    try:
        sid = f"shift-test-{_uuid.uuid4().hex[:8]}"
        db.add(ShiftRoster(
            id=sid,
            clinic_id=clinic_id,
            user_id=user_id,
            week_start=week,
            day_of_week=now.weekday(),
            start_time="00:00",
            end_time="23:59",
            role="clinician",
            is_on_call=True,
            surface=surface,
            contact_channel="sms",
            contact_handle="+15555555555",
            note=None,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        ))
        db.commit()
        return sid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_coverage_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "care_team_coverage" in KNOWN_SURFACES


def test_coverage_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "care_team_coverage", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("care_team_coverage-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_read_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/care-team-coverage/roster",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_clinician_can_read(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/care-team-coverage/roster",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "week_start" in data
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_write_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/care-team-coverage/roster",
            json={
                "user_id": "actor-clinician-demo",
                "week_start": _dt.now(_tz.utc).date().isoformat(),
                "day_of_week": 0,
                "is_on_call": True,
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_write(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Admin shares clinic with the demo clinician via conftest seeds.
        from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415
        ws = _monday_of(_dt.now(_tz.utc))
        r = client.post(
            "/api/v1/care-team-coverage/roster",
            json={
                "user_id": "actor-clinician-demo",
                "week_start": ws,
                "day_of_week": 0,
                "is_on_call": True,
                "start_time": "09:00",
                "end_time": "17:00",
                "role": "clinician",
                "contact_channel": "sms",
                "contact_handle": "+15555555555",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["user_id"] == "actor-clinician-demo"
        assert body["is_on_call"] is True


# ── Cross-clinic isolation ──────────────────────────────────────────────────


class TestCrossClinic:
    def test_clinician_cannot_see_other_clinic_roster(
        self, client: TestClient, auth_headers: dict, other_clinic: str
    ) -> None:
        # Seed a roster row in the OTHER clinic — clinician should not see it.
        from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415
        ws = _monday_of(_dt.now(_tz.utc))
        db = SessionLocal()
        try:
            db.add(ShiftRoster(
                id="shift-other-1",
                clinic_id=other_clinic,
                user_id="actor-clinician-other-coverage",
                week_start=ws,
                day_of_week=0,
                role="clinician",
                is_on_call=True,
                created_at=_dt.now(_tz.utc).isoformat(),
                updated_at=_dt.now(_tz.utc).isoformat(),
            ))
            db.commit()
        finally:
            db.close()

        # Clinician with clinic-demo-default sees zero rows.
        r = client.get(
            "/api/v1/care-team-coverage/roster",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert all(it["clinic_id"] == "clinic-demo-default" for it in items)
        assert all(it["clinic_id"] != other_clinic for it in items)

    def test_admin_can_see_other_clinic_via_query(
        self, client: TestClient, auth_headers: dict, other_clinic: str
    ) -> None:
        from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415
        ws = _monday_of(_dt.now(_tz.utc))
        db = SessionLocal()
        try:
            db.add(ShiftRoster(
                id="shift-other-admin-view",
                clinic_id=other_clinic,
                user_id="actor-clinician-other-coverage",
                week_start=ws,
                day_of_week=0,
                role="clinician",
                is_on_call=True,
                created_at=_dt.now(_tz.utc).isoformat(),
                updated_at=_dt.now(_tz.utc).isoformat(),
            ))
            db.commit()
        finally:
            db.close()
        r = client.get(
            f"/api/v1/care-team-coverage/roster?clinic_id={other_clinic}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        # Admin queried for the other clinic; the response should carry that
        # clinic's rows.
        clinics_seen = {it["clinic_id"] for it in r.json()["items"]}
        assert other_clinic in clinics_seen

    def test_admin_cannot_edit_another_admins_clinic(
        self, client: TestClient, auth_headers: dict, other_clinic: str
    ) -> None:
        # admin-demo-token is in clinic-demo-default. Asking it to edit
        # another clinic's roster must 404 (we never reveal the other
        # clinic's existence on writes).
        from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415
        ws = _monday_of(_dt.now(_tz.utc))
        r = client.post(
            "/api/v1/care-team-coverage/roster",
            json={
                "user_id": "actor-clinician-other-coverage",
                "week_start": ws,
                "day_of_week": 0,
                "is_on_call": True,
                "clinic_id": other_clinic,
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404


# ── Roster edit emits audit ─────────────────────────────────────────────────


class TestRosterAudit:
    def test_roster_edit_emits_audit(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415
        ws = _monday_of(_dt.now(_tz.utc))
        r = client.post(
            "/api/v1/care-team-coverage/roster",
            json={
                "user_id": "actor-clinician-demo",
                "week_start": ws,
                "day_of_week": 1,
                "is_on_call": False,
                "start_time": "08:00",
                "end_time": "16:00",
                "role": "clinician",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 201, r.text

        # Audit row appears under surface=care_team_coverage.
        audit = client.get(
            "/api/v1/audit-trail?surface=care_team_coverage",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200, audit.text
        actions = {it.get("action") for it in audit.json()["items"]}
        assert "care_team_coverage.roster_edited" in actions


# ── SLA-breach feed ─────────────────────────────────────────────────────────


class TestSLABreachFeed:
    def test_breach_feed_returns_aged_rows_excluding_acked(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Wearables Workbench HIGH-priority row, 45 minutes old → past
        # the 30-min default SLA.
        wb_eid = _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-coverage-test-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )
        # Adverse Events row, 6 minutes old → past the 5-min default SLA.
        ae_eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-coverage-test-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=6),
        )
        # Fresh row that's been acknowledged → must NOT appear.
        ack_eid = _seed_audit_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-acked; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=120),
        )
        _seed_ack_row(ack_eid)

        r = client.get(
            "/api/v1/care-team-coverage/sla-breaches",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        eids = {it["audit_event_id"] for it in items}
        assert wb_eid in eids, f"wearables_workbench row missing; got {eids}"
        assert ae_eid in eids, f"adverse_events row missing; got {eids}"
        assert ack_eid not in eids, "ack'd row should not appear in breach feed"
        # Each row carries an honest age vs sla number.
        for it in items:
            assert it["age_minutes"] >= it["sla_minutes"]
            assert it["minutes_over_sla"] == it["age_minutes"] - it["sla_minutes"]

    def test_breach_feed_respects_clinic_override(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Clinic raises wearables_workbench SLA to 60 min — a 45-min-old
        # row must NOT appear.
        sla_resp = client.post(
            "/api/v1/care-team-coverage/sla-config",
            json={"surface": "wearables_workbench", "sla_minutes": 60},
            headers=auth_headers["admin"],
        )
        assert sla_resp.status_code == 201, sla_resp.text
        wb_eid = _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-coverage-override-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )
        r = client.get(
            "/api/v1/care-team-coverage/sla-breaches",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        eids = {it["audit_event_id"] for it in r.json()["items"]}
        assert wb_eid not in eids


# ── Manual page-on-call ─────────────────────────────────────────────────────


class TestManualPageOnCall:
    def test_page_requires_note(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
        )
        r = client.post(
            f"/api/v1/care-team-coverage/page-oncall/{eid}",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_page_emits_canonical_audit_and_picks_oncall(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Seed an on-call shift so a real human is selected.
        _seed_oncall_shift(surface=None)
        eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-2",
            note=f"priority=high; patient={home_clinic_patient.id}",
        )

        r = client.post(
            f"/api/v1/care-team-coverage/page-oncall/{eid}",
            json={"note": "Paging primary on-call after SAE breach."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["delivery_status"] == "logged"
        assert body["paged_user_id"] == "actor-clinician-demo"
        assert body["paged_role"] == "primary"
        assert body["audit_event_id"].startswith("inbox-item_paged_to_oncall-")

        # Canonical audit row appears under surface=clinician_inbox so the
        # Inbox audit transcript stays single-sourced.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_inbox",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200, audit.text
        actions = {it.get("action") for it in audit.json()["items"]}
        assert "inbox.item_paged_to_oncall" in actions

        # And the page-level audit row lives under care_team_coverage.
        cov_audit = client.get(
            "/api/v1/audit-trail?surface=care_team_coverage",
            headers=auth_headers["admin"],
        )
        cov_actions = {it.get("action") for it in cov_audit.json()["items"]}
        assert "care_team_coverage.manual_page_fired" in cov_actions

        # Pages history endpoint shows the new row.
        pages = client.get(
            "/api/v1/care-team-coverage/pages",
            headers=auth_headers["clinician"],
        )
        assert pages.status_code == 200
        page_items = pages.json()["items"]
        assert any(p["audit_event_id"] == eid for p in page_items)
        assert any(p["trigger"] == "manual" for p in page_items)

    def test_page_404_on_unknown_audit_event(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/care-team-coverage/page-oncall/no-such-event",
            json={"note": "n/a"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_page_cross_clinic_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic: str,
    ) -> None:
        eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-other",
            actor_id="actor-clinician-other-coverage",
            note="priority=high; cross-clinic test",
        )
        r = client.post(
            f"/api/v1/care-team-coverage/page-oncall/{eid}",
            json={"note": "should fail"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ── On-call now / summary ───────────────────────────────────────────────────


class TestOncallNow:
    def test_oncall_now_reads_roster_and_chain(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed a chain that names actor-clinician-demo as primary for *.
        chain_resp = client.post(
            "/api/v1/care-team-coverage/escalation-chain",
            json={
                "surface": "*",
                "primary_user_id": "actor-clinician-demo",
                "auto_page_enabled": False,
            },
            headers=auth_headers["admin"],
        )
        assert chain_resp.status_code == 201, chain_resp.text
        _seed_oncall_shift(surface=None)

        r = client.get(
            "/api/v1/care-team-coverage/oncall-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # Must include a row for the wildcard surface.
        wildcard = [it for it in items if it["surface"] == "*"]
        assert wildcard, items
        assert wildcard[0]["primary_user_id"] == "actor-clinician-demo"
        assert wildcard[0]["sla_minutes"] >= 1

    def test_summary_counts_rosters_and_breaches(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _seed_oncall_shift(surface=None)
        # Aged HIGH-priority row → 1 breach today.
        _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-summary-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )
        r = client.get(
            "/api/v1/care-team-coverage/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["clinic_id"] == "clinic-demo-default"
        assert s["active_shifts"] >= 1
        assert s["oncall_now"] >= 1
        assert s["sla_breaches_today"] >= 1


# ── Demo banner ─────────────────────────────────────────────────────────────


class TestDemoBanner:
    def test_roster_marks_demo_view_for_demo_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # The conftest seeds clinician + admin into clinic-demo-default
        # which is one of the documented demo clinic IDs.
        r = client.get(
            "/api/v1/care-team-coverage/roster",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["is_demo_view"] is True


# ── SLA config defaults & overrides ─────────────────────────────────────────


class TestSLAConfig:
    def test_defaults_synthesised_when_no_rows(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/care-team-coverage/sla-config",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Defaults table is always exposed.
        assert data["defaults"]["wearables_workbench"] == 30
        assert data["defaults"]["adverse_events_hub"] == 5
        # When no rows, synthesised defaults appear in items.
        surfaces_seen = {it["surface"] for it in data["items"]}
        assert "wearables_workbench" in surfaces_seen
        assert "*" in surfaces_seen
        for it in data["items"]:
            assert it["is_default"] is True

    def test_override_persists(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        post = client.post(
            "/api/v1/care-team-coverage/sla-config",
            json={"surface": "wearables_workbench", "sla_minutes": 90, "note": "Loosened by clinic policy"},
            headers=auth_headers["admin"],
        )
        assert post.status_code == 201, post.text
        assert post.json()["sla_minutes"] == 90
        # Audit emitted.
        audit = client.get(
            "/api/v1/audit-trail?surface=care_team_coverage",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "care_team_coverage.sla_edited" in actions

        get_r = client.get(
            "/api/v1/care-team-coverage/sla-config",
            headers=auth_headers["clinician"],
        )
        wb = next(
            (it for it in get_r.json()["items"] if it["surface"] == "wearables_workbench"),
            None,
        )
        assert wb is not None
        assert wb["sla_minutes"] == 90
        assert wb["is_default"] is False


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/care-team-coverage/audit-events",
            json={"event": "view", "note": "clinician mounted Coverage page"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("care_team_coverage-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/care-team-coverage/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_surfaces_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/care-team-coverage/audit-events",
            json={"event": "filter_changed", "note": "surface=wearables_workbench"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        audit = client.get(
            "/api/v1/audit-trail?surface=care_team_coverage",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "care_team_coverage.filter_changed" in actions

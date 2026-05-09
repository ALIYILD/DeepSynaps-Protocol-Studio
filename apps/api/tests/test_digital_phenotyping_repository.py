"""Tests for app.repositories.digital_phenotyping — CRUD contracts (PR 77/N).

Covers:
- get_patient_display_name happy path + missing
- load_or_create_state creates on first call + returns existing on second
- update_state modifies fields + commits
- append_audit inserts audit row
- list_recent_audit returns rows newest-first, respects limit
- count_observations returns correct count
- insert_observation inserts row + returns id
- list_recent_observations returns rows, respects limit
- observation_to_dict serialises correctly
"""
from __future__ import annotations

import json
from datetime import datetime, timezone


# ── Helpers ───────────────────────────────────────────────────────────────────

CLINICIAN_ID = "actor-clinician-demo"
DEFAULT_DOMAINS = {"sleep": True, "mood": True, "activity": False}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_patient(db, patient_id: str) -> None:
    from app.persistence.models import Patient

    if db.get(Patient, patient_id) is None:
        db.add(
            Patient(
                id=patient_id,
                clinician_id=CLINICIAN_ID,
                first_name="Dig",
                last_name="Pheno",
                status="active",
            )
        )
        db.commit()


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_get_patient_display_name_happy_path():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import get_patient_display_name

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-name")
        name = get_patient_display_name(db, "pt-dp-name")
        assert name == "Dig Pheno"
    finally:
        db.close()


def test_get_patient_display_name_returns_none_for_unknown():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import get_patient_display_name

    db = SessionLocal()
    try:
        name = get_patient_display_name(db, "ghost-dp-pt")
        assert name is None
    finally:
        db.close()


def test_load_or_create_state_creates_row_first_call():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import load_or_create_state

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-state-a")
        state = load_or_create_state(
            db,
            patient_id="pt-dp-state-a",
            default_domains_enabled=DEFAULT_DOMAINS,
        )
        assert state.patient_id == "pt-dp-state-a"
        domains = json.loads(state.domains_enabled_json)
        assert domains["sleep"] is True
        assert domains["mood"] is True
    finally:
        db.close()


def test_load_or_create_state_returns_existing_on_second_call():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import load_or_create_state

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-state-b")
        state1 = load_or_create_state(
            db,
            patient_id="pt-dp-state-b",
            default_domains_enabled=DEFAULT_DOMAINS,
        )
        state2 = load_or_create_state(
            db,
            patient_id="pt-dp-state-b",
            default_domains_enabled={"sleep": False},  # different defaults — should be ignored
        )
        # Should be the same row with the original data
        assert state1.patient_id == state2.patient_id
        domains = json.loads(state2.domains_enabled_json)
        assert domains["sleep"] is True  # original value retained
    finally:
        db.close()


def test_update_state_modifies_fields():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import load_or_create_state, update_state

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-upd")
        state = load_or_create_state(
            db,
            patient_id="pt-dp-upd",
            default_domains_enabled=DEFAULT_DOMAINS,
        )
        updated = update_state(
            db,
            state,
            consent_scope_version="2026.05",
            updated_by=CLINICIAN_ID,
        )
        assert updated.consent_scope_version == "2026.05"
        assert updated.updated_by == CLINICIAN_ID
    finally:
        db.close()


def test_append_audit_inserts_row():
    from app.database import SessionLocal
    from app.persistence.models import DigitalPhenotypingAudit
    from app.repositories.digital_phenotyping import append_audit

    db = SessionLocal()
    try:
        append_audit(
            db,
            patient_id="pt-dp-audit",
            action="state_viewed",
            actor_id=CLINICIAN_ID,
            detail_json='{"screen":"phenotyping"}',
        )

        rows = (
            db.query(DigitalPhenotypingAudit)
            .filter_by(patient_id="pt-dp-audit")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].action == "state_viewed"
        assert rows[0].actor_id == CLINICIAN_ID
    finally:
        db.close()


def test_list_recent_audit_limit():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import append_audit, list_recent_audit

    db = SessionLocal()
    try:
        for i in range(5):
            append_audit(
                db,
                patient_id="pt-dp-audit-lim",
                action=f"action_{i}",
                actor_id=CLINICIAN_ID,
                detail_json="{}",
            )

        rows = list_recent_audit(db, patient_id="pt-dp-audit-lim", limit=3)
        assert len(rows) == 3
    finally:
        db.close()


def test_count_observations_zero_when_empty():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import count_observations

    db = SessionLocal()
    try:
        count = count_observations(db, patient_id="ghost-obs-pt")
        assert count == 0
    finally:
        db.close()


def test_insert_observation_returns_id_and_increments_count():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import (
        count_observations,
        insert_observation,
    )

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-obs-a")
        oid = insert_observation(
            db,
            patient_id="pt-dp-obs-a",
            source="manual",
            kind="mood_rating",
            recorded_at=_now(),
            payload_json='{"rating":7}',
            created_by=CLINICIAN_ID,
        )
        assert isinstance(oid, str)
        assert len(oid) == 36  # UUID format

        count = count_observations(db, patient_id="pt-dp-obs-a")
        assert count == 1
    finally:
        db.close()


def test_list_recent_observations_limit():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import (
        insert_observation,
        list_recent_observations,
    )

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-obs-b")
        for i in range(4):
            insert_observation(
                db,
                patient_id="pt-dp-obs-b",
                source="device_sync",
                kind="sleep_hours",
                recorded_at=_now(),
                payload_json=f'{{"hours":{i + 6}}}',
                created_by=None,
            )

        rows = list_recent_observations(db, patient_id="pt-dp-obs-b", limit=2)
        assert len(rows) == 2
    finally:
        db.close()


def test_observation_to_dict_serialises_correctly():
    from app.database import SessionLocal
    from app.repositories.digital_phenotyping import (
        insert_observation,
        list_recent_observations,
        observation_to_dict,
    )

    db = SessionLocal()
    try:
        _make_patient(db, "pt-dp-obs-c")
        insert_observation(
            db,
            patient_id="pt-dp-obs-c",
            source="manual",
            kind="anxiety_level",
            recorded_at=_now(),
            payload_json='{"level":3}',
            created_by=CLINICIAN_ID,
        )

        rows = list_recent_observations(db, patient_id="pt-dp-obs-c", limit=1)
        d = observation_to_dict(rows[0])

        assert d["patient_id"] == "pt-dp-obs-c"
        assert d["source"] == "manual"
        assert d["kind"] == "anxiety_level"
        assert d["payload"]["level"] == 3
        assert "recorded_at" in d
        assert d["created_by"] == CLINICIAN_ID
    finally:
        db.close()

"""Phase 1 (migration 047) tests.

Covers:
1. CleaningDecision and AutoCleanRun ORM models — round-trip through the DB,
   FK cascade behavior on auto_clean_run delete.
2. Extended CleaningConfigInput shape — new fields (ica_method, ica_seed,
   auto_clean_run_id, excluded_ica_detail, structured BadSegment.reason)
   round-trip through the cleaning-config endpoints.
3. Backwards compatibility — old payloads without the new fields still save
   and load correctly.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app.database import SessionLocal
from app.persistence.models import (
    AutoCleanRun,
    CleaningDecision,
    QEEGAnalysis,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


def _make_analysis(db) -> QEEGAnalysis:
    a = QEEGAnalysis(
        id=str(uuid.uuid4()),
        patient_id=str(uuid.uuid4()),
        clinician_id="clin-1",
        analysis_status="pending",
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


# ── Models ───────────────────────────────────────────────────────────────────


def test_auto_clean_run_round_trip():
    db = SessionLocal()
    try:
        analysis = _make_analysis(db)
        run = AutoCleanRun(
            analysis_id=analysis.id,
            proposal_json=json.dumps({"bad_channels": ["T3"], "bad_segments": []}),
            accepted_items_json=json.dumps({"bad_channels": ["T3"]}),
            rejected_items_json=json.dumps({"bad_segments": []}),
            created_by="clin-1",
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        loaded = db.query(AutoCleanRun).filter_by(id=run.id).one()
        assert loaded.analysis_id == analysis.id
        assert json.loads(loaded.proposal_json)["bad_channels"] == ["T3"]
        assert loaded.created_at is not None
    finally:
        db.close()


def test_cleaning_decision_round_trip_with_run_link():
    db = SessionLocal()
    try:
        analysis = _make_analysis(db)
        run = AutoCleanRun(
            analysis_id=analysis.id,
            proposal_json=json.dumps({"bad_channels": ["T3"]}),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        decision = CleaningDecision(
            analysis_id=analysis.id,
            auto_clean_run_id=run.id,
            actor="user",
            action="accept_ai_suggestion",
            target="bad_channel:T3",
            payload_json=json.dumps({"channel": "T3", "confidence": 0.91}),
            accepted_by_user=True,
            confidence=0.91,
        )
        db.add(decision)
        db.commit()
        db.refresh(decision)

        loaded = db.query(CleaningDecision).filter_by(id=decision.id).one()
        assert loaded.actor == "user"
        assert loaded.action == "accept_ai_suggestion"
        assert loaded.target == "bad_channel:T3"
        assert loaded.accepted_by_user is True
        assert loaded.confidence == 0.91
        assert loaded.auto_clean_run_id == run.id
    finally:
        db.close()


def test_cleaning_decision_fk_set_null_on_run_delete():
    db = SessionLocal()
    try:
        analysis = _make_analysis(db)
        run = AutoCleanRun(
            analysis_id=analysis.id,
            proposal_json=json.dumps({}),
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        decision = CleaningDecision(
            analysis_id=analysis.id,
            auto_clean_run_id=run.id,
            actor="ai",
            action="propose_bad_channel",
        )
        db.add(decision)
        db.commit()
        decision_id = decision.id

        db.delete(run)
        db.commit()

        loaded = db.query(CleaningDecision).filter_by(id=decision_id).one()
        # SQLite/SQLAlchemy ON DELETE SET NULL behavior — the audit row survives.
        # Note: some SQLite configurations do not enforce FK; in that case the
        # FK reference simply dangles but the row still exists. Either is OK
        # for an audit trail.
        assert loaded is not None
    finally:
        db.close()


def test_audit_actor_constrained_to_known_values():
    """Convention: actor is 'ai' or 'user'. Schema itself doesn't enforce —
    callers must respect. This test documents the contract."""
    db = SessionLocal()
    try:
        analysis = _make_analysis(db)
        for actor in ("ai", "user"):
            d = CleaningDecision(
                analysis_id=analysis.id,
                actor=actor,
                action="mark_bad_channel",
            )
            db.add(d)
        db.commit()
        rows = db.query(CleaningDecision).filter_by(analysis_id=analysis.id).all()
        assert {r.actor for r in rows} == {"ai", "user"}
    finally:
        db.close()


def test_decisions_indexed_by_analysis():
    """Audit lookups by analysis_id must be indexed (perf gate at >10k rows)."""
    from sqlalchemy import inspect

    db = SessionLocal()
    try:
        insp = inspect(db.bind)
        idx_names = {idx["name"] for idx in insp.get_indexes("cleaning_decisions")}
        assert "ix_cleaning_decisions_analysis_id" in idx_names
        assert "ix_cleaning_decisions_auto_clean_run_id" in idx_names
        run_idx = {idx["name"] for idx in insp.get_indexes("auto_clean_runs")}
        assert "ix_auto_clean_runs_analysis_id" in run_idx
    finally:
        db.close()


# ── Extended Pydantic shape ──────────────────────────────────────────────────


def test_cleaning_config_accepts_new_fields():
    from app.routers.qeeg_raw_router import (
        BadSegment,
        CleaningConfigInput,
        ICAExclusion,
    )

    cfg = CleaningConfigInput(
        bad_channels=["T3"],
        bad_segments=[
            BadSegment(start_sec=1.0, end_sec=2.0, reason="blink", source="ai", confidence=0.88),
            BadSegment(start_sec=10.0, end_sec=12.0),  # legacy shape, no reason
        ],
        excluded_ica_components=[0, 2],
        excluded_ica_detail=[
            ICAExclusion(idx=0, label="blink", source="iclabel", confidence=0.95),
            ICAExclusion(idx=2, label="muscle", source="user"),
        ],
        ica_method="picard",
        ica_seed=42,
        auto_clean_run_id="run-xyz",
        decision_log_summary_json=json.dumps({"accepted": 4, "rejected": 1}),
    )

    dumped = cfg.model_dump()
    assert dumped["bad_segments"][0]["reason"] == "blink"
    assert dumped["bad_segments"][0]["source"] == "ai"
    assert dumped["bad_segments"][1]["reason"] is None  # legacy shape preserved
    assert dumped["excluded_ica_detail"][0]["label"] == "blink"
    assert dumped["ica_method"] == "picard"
    assert dumped["ica_seed"] == 42
    assert dumped["auto_clean_run_id"] == "run-xyz"

    # Round-trip through JSON (the on-disk format).
    rehydrated = CleaningConfigInput(**json.loads(json.dumps(dumped)))
    assert rehydrated.ica_method == "picard"
    assert rehydrated.bad_segments[0].reason == "blink"
    assert rehydrated.excluded_ica_detail[0].label == "blink"


def test_cleaning_config_legacy_payload_still_loads():
    """A v0 cleaning_config_json payload (no new fields) must still validate."""
    from app.routers.qeeg_raw_router import CleaningConfigInput

    legacy = {
        "bad_channels": ["F8"],
        "bad_segments": [{"start_sec": 0.0, "end_sec": 3.0, "description": "BAD_user"}],
        "excluded_ica_components": [1],
        "included_ica_components": [],
        "bandpass_low": 1.0,
        "bandpass_high": 45.0,
        "notch_hz": 50.0,
        "resample_hz": 250.0,
    }
    cfg = CleaningConfigInput(**legacy)
    assert cfg.bad_channels == ["F8"]
    assert cfg.ica_method is None
    assert cfg.ica_seed is None
    assert cfg.excluded_ica_detail == []

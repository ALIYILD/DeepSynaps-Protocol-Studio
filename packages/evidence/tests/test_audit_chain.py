"""Tests for deepsynaps_evidence.audit — hash-chain integrity via SQLite."""
from __future__ import annotations

import pytest

from deepsynaps_evidence.audit import (
    _compute_row_hash,
    log_grounding_event,
    verify_chain,
)

# ── log_grounding_event happy path ───────────────────────────────────────────


class TestLogGroundingEvent:
    def test_returns_uuid_string(self, db_session):
        event_id = log_grounding_event(
            db_session,
            event_type="pmid_verified",
            decision="include",
        )
        assert isinstance(event_id, str)
        assert len(event_id) == 36  # UUID format

    def test_first_row_has_genesis_prev_hash(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        DsGroundingAudit = _import_models()

        log_grounding_event(
            db_session,
            event_type="pmid_verified",
            study_identifier="12345",
            claim_hash="abc",
            decision="include",
            reason="Test reason",
            confidence=0.9,
            decided_by="system",
        )

        from sqlalchemy import select
        row = db_session.scalar(select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc()).limit(1))
        assert row is not None
        assert row.prev_hash == "GENESIS"

    def test_second_row_prev_hash_matches_first_row_hash(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(db_session, event_type="pmid_verified", decision="include")
        log_grounding_event(db_session, event_type="fabrication_blocked", decision="block")

        rows = list(
            db_session.scalars(
                select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc())
            ).all()
        )
        assert len(rows) >= 2
        first, second = rows[0], rows[1]
        assert second.prev_hash == first.row_hash

    def test_row_hash_is_valid_sha256(self, db_session):
        log_grounding_event(db_session, event_type="corpus_miss", decision="warn")
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()
        row = db_session.scalar(select(DsGroundingAudit).order_by(DsGroundingAudit.id.desc()).limit(1))
        assert row is not None
        assert len(row.row_hash) == 64

    def test_all_fields_persisted(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(
            db_session,
            event_type="retraction_blocked",
            study_identifier="99999",
            claim_hash="deadbeef",
            decision="block",
            reason="Retracted paper",
            confidence=0.0,
            decided_by="clinician:abc-123",
        )

        row = db_session.scalar(
            select(DsGroundingAudit).where(DsGroundingAudit.study_identifier == "99999")
        )
        assert row is not None
        assert row.event_type == "retraction_blocked"
        assert row.decision == "block"
        assert row.reason == "Retracted paper"
        assert row.confidence == 0.0
        assert row.decided_by == "clinician:abc-123"

    def test_default_decided_by_is_system(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(db_session, event_type="corpus_miss", decision="warn")
        row = db_session.scalar(
            select(DsGroundingAudit).order_by(DsGroundingAudit.id.desc()).limit(1)
        )
        assert row.decided_by == "system"

    def test_optional_fields_nullable(self, db_session):
        """Log event without optional fields — should not raise."""
        log_grounding_event(
            db_session,
            event_type="confidence_assigned",
            decision="include",
        )
        # No assertion needed — just mustn't raise


# ── verify_chain ─────────────────────────────────────────────────────────────


class TestVerifyChain:
    def test_empty_table_is_valid(self, db_session):
        valid, errors = verify_chain(db_session)
        assert valid is True
        assert errors == []

    def test_single_row_valid(self, db_session):
        log_grounding_event(db_session, event_type="pmid_verified", decision="include")
        valid, errors = verify_chain(db_session)
        assert valid is True
        assert errors == []

    def test_multi_row_chain_valid(self, db_session):
        for i in range(5):
            log_grounding_event(
                db_session,
                event_type="pmid_verified",
                decision="include",
                claim_hash=f"claim-{i}",
            )
        valid, errors = verify_chain(db_session)
        assert valid is True, f"Expected valid chain, got errors: {errors}"

    def test_tampered_row_hash_detected(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(db_session, event_type="pmid_verified", decision="include")
        log_grounding_event(db_session, event_type="corpus_miss", decision="warn")

        # Tamper with the first row's row_hash
        row = db_session.scalar(
            select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc()).limit(1)
        )
        row.row_hash = "a" * 64  # corrupted
        db_session.commit()

        valid, errors = verify_chain(db_session)
        assert valid is False
        assert len(errors) >= 1

    def test_tampered_prev_hash_detected(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(db_session, event_type="pmid_verified", decision="include")
        log_grounding_event(db_session, event_type="corpus_miss", decision="warn")

        # Tamper with the second row's prev_hash
        rows = list(
            db_session.scalars(
                select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc())
            ).all()
        )
        rows[1].prev_hash = "b" * 64  # corrupted prev link
        db_session.commit()

        valid, errors = verify_chain(db_session)
        assert valid is False
        assert any("prev_hash mismatch" in e or "row_hash mismatch" in e for e in errors)

    def test_chain_genesis_on_first_row(self, db_session):
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()

        log_grounding_event(db_session, event_type="pmid_verified", decision="include")

        row = db_session.scalar(
            select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc()).limit(1)
        )
        assert row.prev_hash == "GENESIS"

        # verify_chain should accept GENESIS as the expected_prev for the first row
        valid, errors = verify_chain(db_session)
        assert valid is True

    def test_limit_respected(self, db_session):
        """verify_chain should only check up to `limit` rows."""
        for i in range(10):
            log_grounding_event(
                db_session, event_type="pmid_verified", decision="include", claim_hash=f"c{i}"
            )
        # Tamper the 10th row — if limit=5, it should not be checked
        from deepsynaps_evidence.audit import _import_models
        from sqlalchemy import select
        DsGroundingAudit = _import_models()
        last_rows = list(
            db_session.scalars(
                select(DsGroundingAudit).order_by(DsGroundingAudit.id.asc())
            ).all()
        )
        last_rows[-1].row_hash = "z" * 64
        db_session.commit()

        valid_limited, errors_limited = verify_chain(db_session, limit=5)
        # First 5 rows should be untampered → valid
        assert valid_limited is True
        assert errors_limited == []

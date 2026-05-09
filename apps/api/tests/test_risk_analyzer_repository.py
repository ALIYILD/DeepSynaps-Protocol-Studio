"""Tests for the risk_analyzer repository layer.

Covers:
  - ``list_recent_risk_analyzer_audit`` returns empty list when no rows exist
  - ``list_recent_risk_analyzer_audit`` returns rows ordered by created_at DESC
  - ``list_recent_risk_analyzer_audit`` filters by patient_id correctly
  - ``list_recent_risk_analyzer_audit`` honours the ``limit`` parameter
  - ``list_recent_risk_stratification_audit`` returns empty list when no rows exist
  - ``list_recent_risk_stratification_audit`` returns rows ordered DESC
  - ``list_recent_risk_stratification_audit`` filters by patient_id
  - ``list_recent_risk_stratification_audit`` honours the ``limit`` parameter
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone


# ── helpers ───────────────────────────────────────────────────────────────────


def _pid() -> str:
    return f"pt-ra-{uuid.uuid4().hex[:8]}"


def _ts(offset_seconds: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=offset_seconds)


# ── list_recent_risk_analyzer_audit ──────────────────────────────────────────


class TestListRecentRiskAnalyzerAudit:
    def test_empty_when_no_rows(self) -> None:
        from app.database import SessionLocal
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            rows = list_recent_risk_analyzer_audit(db, patient_id=_pid(), limit=20)
            assert list(rows) == []
        finally:
            db.close()

    def test_returns_rows_for_patient(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskAnalyzerAudit
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            pid = _pid()
            for i, etype in enumerate(["formulation_save", "safety_plan_save", "notes_update"]):
                db.add(
                    RiskAnalyzerAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        event_type=etype,
                        actor_id="actor-clinician-demo",
                        payload_summary=f"Summary {i}",
                        created_at=_ts(offset_seconds=i * 10),
                    )
                )
            db.commit()

            rows = list_recent_risk_analyzer_audit(db, patient_id=pid, limit=80)
            assert len(rows) == 3
            assert all(r.patient_id == pid for r in rows)
        finally:
            db.close()

    def test_ordered_most_recent_first(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskAnalyzerAudit
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            pid = _pid()
            # Insert in chronological order.
            times = [_ts(offset_seconds=300), _ts(offset_seconds=200), _ts(offset_seconds=100)]
            for ts in times:
                db.add(
                    RiskAnalyzerAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        event_type="formulation_save",
                        created_at=ts,
                    )
                )
            db.commit()

            rows = list(list_recent_risk_analyzer_audit(db, patient_id=pid, limit=80))
            # Most recent (smallest offset) comes first.
            assert rows[0].created_at >= rows[1].created_at >= rows[2].created_at
        finally:
            db.close()

    def test_isolates_rows_by_patient_id(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskAnalyzerAudit
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            pid_a = _pid()
            pid_b = _pid()
            # 2 rows for A, 3 rows for B.
            for pid, count in [(pid_a, 2), (pid_b, 3)]:
                for _ in range(count):
                    db.add(
                        RiskAnalyzerAudit(
                            id=str(uuid.uuid4()),
                            patient_id=pid,
                            event_type="notes_update",
                        )
                    )
            db.commit()

            assert len(list(list_recent_risk_analyzer_audit(db, patient_id=pid_a, limit=80))) == 2
            assert len(list(list_recent_risk_analyzer_audit(db, patient_id=pid_b, limit=80))) == 3
        finally:
            db.close()

    def test_respects_limit(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskAnalyzerAudit
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            pid = _pid()
            for i in range(10):
                db.add(
                    RiskAnalyzerAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        event_type="formulation_save",
                        created_at=_ts(offset_seconds=i * 5),
                    )
                )
            db.commit()

            rows = list(list_recent_risk_analyzer_audit(db, patient_id=pid, limit=3))
            assert len(rows) == 3
        finally:
            db.close()

    def test_default_limit_is_80(self) -> None:
        """Calling with limit=80 (the documented default) must not raise."""
        from app.database import SessionLocal
        from app.repositories.risk_analyzer import list_recent_risk_analyzer_audit

        db = SessionLocal()
        try:
            rows = list(list_recent_risk_analyzer_audit(db, patient_id=_pid(), limit=80))
            assert isinstance(rows, list)
        finally:
            db.close()


# ── list_recent_risk_stratification_audit ────────────────────────────────────


class TestListRecentRiskStratificationAudit:
    def test_empty_when_no_rows(self) -> None:
        from app.database import SessionLocal
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            rows = list(list_recent_risk_stratification_audit(db, patient_id=_pid(), limit=20))
            assert rows == []
        finally:
            db.close()

    def test_returns_rows_for_patient(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskStratificationAudit
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            pid = _pid()
            for i, (cat, level) in enumerate(
                [("suicide", "high"), ("aggression", "medium"), ("self_harm", "low")]
            ):
                db.add(
                    RiskStratificationAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        category=cat,
                        previous_level=None,
                        new_level=level,
                        trigger="assessment_completed",
                        created_at=_ts(offset_seconds=i * 30),
                    )
                )
            db.commit()

            rows = list(list_recent_risk_stratification_audit(db, patient_id=pid, limit=80))
            assert len(rows) == 3
            assert all(r.patient_id == pid for r in rows)
        finally:
            db.close()

    def test_ordered_most_recent_first(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskStratificationAudit
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            pid = _pid()
            times = [_ts(offset_seconds=600), _ts(offset_seconds=300), _ts(offset_seconds=60)]
            for ts in times:
                db.add(
                    RiskStratificationAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        category="suicide",
                        new_level="medium",
                        trigger="manual_override",
                        created_at=ts,
                    )
                )
            db.commit()

            rows = list(list_recent_risk_stratification_audit(db, patient_id=pid, limit=80))
            assert rows[0].created_at >= rows[1].created_at >= rows[2].created_at
        finally:
            db.close()

    def test_isolates_rows_by_patient_id(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskStratificationAudit
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            pid_a = _pid()
            pid_b = _pid()
            for pid, count in [(pid_a, 1), (pid_b, 4)]:
                for _ in range(count):
                    db.add(
                        RiskStratificationAudit(
                            id=str(uuid.uuid4()),
                            patient_id=pid,
                            category="suicide",
                            new_level="low",
                            trigger="assessment_completed",
                        )
                    )
            db.commit()

            assert len(list(list_recent_risk_stratification_audit(db, patient_id=pid_a, limit=80))) == 1
            assert len(list(list_recent_risk_stratification_audit(db, patient_id=pid_b, limit=80))) == 4
        finally:
            db.close()

    def test_respects_limit(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskStratificationAudit
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            pid = _pid()
            for i in range(8):
                db.add(
                    RiskStratificationAudit(
                        id=str(uuid.uuid4()),
                        patient_id=pid,
                        category="aggression",
                        new_level="high",
                        trigger="medication_added",
                        created_at=_ts(offset_seconds=i * 10),
                    )
                )
            db.commit()

            rows = list(list_recent_risk_stratification_audit(db, patient_id=pid, limit=5))
            assert len(rows) == 5
        finally:
            db.close()

    def test_previous_level_may_be_null(self) -> None:
        from app.database import SessionLocal
        from app.persistence.models import RiskStratificationAudit
        from app.repositories.risk_analyzer import list_recent_risk_stratification_audit

        db = SessionLocal()
        try:
            pid = _pid()
            db.add(
                RiskStratificationAudit(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    category="self_harm",
                    previous_level=None,  # first record — no previous level
                    new_level="low",
                    trigger="assessment_completed",
                )
            )
            db.commit()

            rows = list(list_recent_risk_stratification_audit(db, patient_id=pid, limit=10))
            assert len(rows) == 1
            assert rows[0].previous_level is None
        finally:
            db.close()

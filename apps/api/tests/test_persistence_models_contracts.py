"""Contract tests for SQLAlchemy persistence models.

Pins tablenames, required columns, nullability, defaults, unique constraints,
check constraints, and FK targets so accidental renames or column removals
surface immediately in CI rather than at Alembic migration time.

All tests use an in-memory SQLite session (no app-level fixtures needed) so
this file is completely self-contained. The conftest.py isolated_database
fixture resets the schema, but these tests create their own engine/session to
stay independent.

Covered model files (6):
  - app/persistence/models/patient.py   — Patient, ConsentRecord, PhenotypeAssignment
  - app/persistence/models/auth.py      — User, PasswordResetToken, User2FASecret,
                                          UserSession, UserPreferences, UserContactMapping
  - app/persistence/models/audit.py     — AuditEventRecord, ClinicalSeedRecord, AiSummaryAudit,
                                          AgentRunAudit, QualityFinding, QualityFindingRevision
  - app/persistence/models/clinical.py  — ClinicalSession, ClinicalSessionEvent, AssessmentRecord
  - app/persistence/models/billing.py   — Subscription, StripeWebhookLog, DataExport
  - app/persistence/models/devices.py   — DeviceConnection, WearableObservation, WearableDailySummary
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session


# ── Shared in-memory SQLite engine (all models share the same Base.metadata) ──

@pytest.fixture(scope="module")
def sqlite_engine():
    """Create a fresh in-memory SQLite engine with all model tables."""
    # Importing the models package triggers registration on Base.metadata.
    from app.persistence.models import (  # noqa: F401  — side-effect import
        Patient, ConsentRecord, PhenotypeAssignment,
        User, PasswordResetToken, User2FASecret, UserSession,
        UserPreferences, UserContactMapping,
        AuditEventRecord, ClinicalSeedRecord, AiSummaryAudit,
        AgentRunAudit, QualityFinding, QualityFindingRevision,
        ClinicalSession, ClinicalSessionEvent, AssessmentRecord,
        Subscription, StripeWebhookLog, DataExport,
        DeviceConnection, WearableObservation, WearableDailySummary,
        Clinic,
    )
    from app.database import Base

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(sqlite_engine):
    """Transactional session — rolls back after each test."""
    connection = sqlite_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


def _table_columns(engine, table_name: str) -> dict[str, dict]:
    """Return {col_name: col_info} for a table via SQLAlchemy inspector."""
    insp = inspect(engine)
    return {c["name"]: c for c in insp.get_columns(table_name)}


def _unique_constraints(engine, table_name: str) -> list[dict]:
    insp = inspect(engine)
    return insp.get_unique_constraints(table_name)


def _unique_columns(table_name: str) -> set[str]:
    """Return column names that have unique=True (column-level) in the ORM metadata.

    SQLite's inspector does not surface column-level unique indexes the same way
    as PostgreSQL, so we read directly from ``Base.metadata.tables`` which is
    always accurate regardless of backend.
    """
    from app.database import Base
    table = Base.metadata.tables.get(table_name)
    if table is None:
        return set()
    return {col.name for col in table.columns if col.unique}


# ═══════════════════════════════════════════════════════════════════════════════
# patient.py — Patient, ConsentRecord, PhenotypeAssignment
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatientModel:
    """Pin Patient table schema contracts."""

    def test_tablename(self):
        from app.persistence.models import Patient
        assert Patient.__tablename__ == "patients"

    def test_required_columns_present(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "patients")
        for col in ("id", "clinician_id", "first_name", "last_name", "created_at", "updated_at"):
            assert col in cols, f"Expected column 'patients.{col}'"

    def test_optional_columns_present(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "patients")
        for col in ("dob", "email", "phone", "gender", "primary_condition",
                    "consent_signed", "status", "notes", "medical_history"):
            assert col in cols, f"Expected column 'patients.{col}'"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "patients")
        for col in ("clinician_id", "first_name", "last_name"):
            assert cols[col]["nullable"] is False, f"patients.{col} should be NOT NULL"

    def test_optional_columns_are_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "patients")
        for col in ("dob", "email", "phone", "gender", "medical_history"):
            assert cols[col]["nullable"] is True, f"patients.{col} should be nullable"

    def test_email_unique_constraint(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "patients")
        uq_cols = {col for uc in uqs for col in uc["column_names"]}
        assert "email" in uq_cols, "patients.email must have a unique constraint"

    def test_default_values_via_orm(self, db):
        from app.persistence.models import Patient
        p = Patient(
            clinician_id="clin-1",
            first_name="Alice",
            last_name="Smith",
        )
        db.add(p)
        db.flush()
        assert p.consent_signed is False
        assert p.status == "active"
        assert isinstance(p.id, str) and len(p.id) == 36  # UUID4 format

    def test_roundtrip_persist_and_reload(self, db):
        from app.persistence.models import Patient
        pid = str(uuid.uuid4())
        p = Patient(
            id=pid,
            clinician_id="clin-2",
            first_name="Bob",
            last_name="Jones",
            primary_condition="ADHD",
        )
        db.add(p)
        db.flush()
        loaded = db.query(Patient).filter_by(id=pid).one()
        assert loaded.first_name == "Bob"
        assert loaded.primary_condition == "ADHD"

    def test_timestamps_auto_set(self, db):
        from app.persistence.models import Patient
        p = Patient(clinician_id="clin-3", first_name="C", last_name="D")
        db.add(p)
        db.flush()
        assert p.created_at is not None
        assert p.updated_at is not None


class TestConsentRecordModel:
    def test_tablename(self):
        from app.persistence.models import ConsentRecord
        assert ConsentRecord.__tablename__ == "consent_records"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "consent_records")
        for col in ("id", "patient_id", "clinician_id", "consent_type", "created_at"):
            assert col in cols

    def test_required_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "consent_records")
        assert cols["patient_id"]["nullable"] is False
        assert cols["clinician_id"]["nullable"] is False
        assert cols["consent_type"]["nullable"] is False

    def test_default_status_active(self, db):
        from app.persistence.models import ConsentRecord
        rec = ConsentRecord(
            patient_id="pat-1",
            clinician_id="clin-1",
            consent_type="general",
        )
        db.add(rec)
        db.flush()
        assert rec.status == "active"
        assert rec.signed is False


class TestPhenotypeAssignmentModel:
    def test_tablename(self):
        from app.persistence.models import PhenotypeAssignment
        assert PhenotypeAssignment.__tablename__ == "phenotype_assignments"

    def test_columns_present(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "phenotype_assignments")
        for col in ("id", "patient_id", "clinician_id", "phenotype_id",
                    "phenotype_name", "assigned_at", "created_at"):
            assert col in cols

    def test_persist_roundtrip(self, db):
        from app.persistence.models import PhenotypeAssignment
        pa = PhenotypeAssignment(
            patient_id="pat-x",
            clinician_id="clin-x",
            phenotype_id="pheno-adhd",
            phenotype_name="ADHD Inattentive",
            assigned_at=datetime.now(timezone.utc),
        )
        db.add(pa)
        db.flush()
        loaded = db.query(PhenotypeAssignment).filter_by(id=pa.id).one()
        assert loaded.phenotype_id == "pheno-adhd"
        assert loaded.qeeg_supported is False


# ═══════════════════════════════════════════════════════════════════════════════
# auth.py — User, PasswordResetToken, User2FASecret, UserSession,
#           UserPreferences, UserContactMapping
# ═══════════════════════════════════════════════════════════════════════════════

class TestUserModel:
    def test_tablename(self):
        from app.persistence.models import User
        assert User.__tablename__ == "users"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "users")
        for col in ("id", "email", "display_name", "hashed_password",
                    "role", "is_verified", "is_active", "created_at", "updated_at"):
            assert col in cols

    def test_email_not_nullable_and_unique(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "users")
        assert cols["email"]["nullable"] is False
        # unique=True is declared at column level, not as a separate UniqueConstraint,
        # so we read from ORM metadata rather than the SQLite inspector.
        uq_cols = _unique_columns("users")
        assert "email" in uq_cols

    def test_defaults(self, db):
        from app.persistence.models import User
        u = User(
            email=f"u{uuid.uuid4().hex}@test.com",
            display_name="Test User",
            hashed_password="hashed",
        )
        db.add(u)
        db.flush()
        assert u.role == "guest"
        assert u.package_id == "explorer"
        assert u.is_verified is False
        assert u.is_active is True
        assert isinstance(u.id, str) and len(u.id) == 36

    def test_optional_profile_fields_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "users")
        for col in ("credentials", "license_number", "avatar_url", "clinic_id",
                    "pending_email", "pending_email_token"):
            assert cols[col]["nullable"] is True, f"users.{col} should be nullable"


class TestPasswordResetTokenModel:
    def test_tablename(self):
        from app.persistence.models import PasswordResetToken
        assert PasswordResetToken.__tablename__ == "password_reset_tokens"

    def test_token_hash_unique(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "password_reset_tokens")
        uq_cols = {col for uc in uqs for col in uc["column_names"]}
        assert "token_hash" in uq_cols

    def test_expires_at_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "password_reset_tokens")
        assert cols["expires_at"]["nullable"] is False

    def test_persist(self, db):
        from app.persistence.models import PasswordResetToken
        tok = PasswordResetToken(
            user_id="user-abc",
            token_hash="hashed-token-value",
            expires_at=datetime.now(timezone.utc),
        )
        db.add(tok)
        db.flush()
        loaded = db.query(PasswordResetToken).filter_by(id=tok.id).one()
        assert loaded.token_hash == "hashed-token-value"
        assert loaded.used_at is None


class TestUser2FASecretModel:
    def test_tablename(self):
        from app.persistence.models import User2FASecret
        assert User2FASecret.__tablename__ == "user_2fa_secrets"

    def test_pk_is_user_id(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "user_2fa_secrets")
        assert "user_id" in cols
        # user_id is PK so not nullable
        assert cols["user_id"]["nullable"] is False

    def test_enabled_default_false(self, db):
        from app.persistence.models import User, User2FASecret
        u = User(
            email=f"u2fa{uuid.uuid4().hex}@x.com",
            display_name="2FA User",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        secret = User2FASecret(
            user_id=u.id,
            secret_encrypted="enc-secret",
        )
        db.add(secret)
        db.flush()
        assert secret.enabled is False
        assert secret.enabled_at is None


class TestUserSessionModel:
    def test_tablename(self):
        from app.persistence.models import UserSession
        assert UserSession.__tablename__ == "user_sessions"

    def test_refresh_token_hash_unique(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "user_sessions")
        uq_cols = {col for uc in uqs for col in uc["column_names"]}
        assert "refresh_token_hash" in uq_cols

    def test_persist(self, db):
        from app.persistence.models import User, UserSession
        u = User(
            email=f"sess{uuid.uuid4().hex}@x.com",
            display_name="Session User",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        s = UserSession(
            user_id=u.id,
            refresh_token_hash="tok-hash-1234",
        )
        db.add(s)
        db.flush()
        assert s.revoked_at is None
        assert s.created_at is not None


class TestUserPreferencesModel:
    def test_tablename(self):
        from app.persistence.models import UserPreferences
        assert UserPreferences.__tablename__ == "user_preferences"

    def test_defaults(self, db):
        from app.persistence.models import User, UserPreferences
        u = User(
            email=f"pref{uuid.uuid4().hex}@x.com",
            display_name="Pref User",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        prefs = UserPreferences(user_id=u.id)
        db.add(prefs)
        db.flush()
        assert prefs.digest_freq == "daily"
        assert prefs.language == "en"
        assert prefs.date_format == "ISO"
        assert prefs.time_format == "24h"
        assert prefs.session_default_duration_min == 45
        assert prefs.auto_logout_min == 30

    def test_notification_prefs_defaults_json(self, db):
        from app.persistence.models import User, UserPreferences
        u = User(
            email=f"pref2{uuid.uuid4().hex}@x.com",
            display_name="P2",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        prefs = UserPreferences(user_id=u.id)
        db.add(prefs)
        db.flush()
        assert prefs.notification_prefs == "{}"
        assert prefs.reminder_timing == "[]"


class TestUserContactMappingModel:
    def test_tablename(self):
        from app.persistence.models import UserContactMapping
        assert UserContactMapping.__tablename__ == "user_contact_mappings"

    def test_unique_constraint_on_user_id(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "user_contact_mappings")
        uq_cols = {col for uc in uqs for col in uc["column_names"]}
        assert "user_id" in uq_cols

    def test_optional_contact_fields_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "user_contact_mappings")
        for col in ("slack_user_id", "pagerduty_user_id", "twilio_phone"):
            assert cols[col]["nullable"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# audit.py — AuditEventRecord, ClinicalSeedRecord, AiSummaryAudit,
#            AgentRunAudit, QualityFinding, QualityFindingRevision
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuditEventRecordModel:
    def test_tablename(self):
        from app.persistence.models import AuditEventRecord
        assert AuditEventRecord.__tablename__ == "audit_events"

    def test_columns_present(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "audit_events")
        for col in ("id", "event_id", "target_id", "target_type", "action",
                    "role", "actor_id", "note", "created_at"):
            assert col in cols

    def test_event_id_unique(self, sqlite_engine):
        # unique=True is declared at column level — read from ORM metadata.
        uq_cols = _unique_columns("audit_events")
        assert "event_id" in uq_cols

    def test_persist(self, db):
        from app.persistence.models import AuditEventRecord
        rec = AuditEventRecord(
            event_id="evt-001",
            target_id="pat-1",
            target_type="patient",
            action="view",
            role="clinician",
            actor_id="actor-1",
            note="viewed patient record",
            created_at="2026-01-01T00:00:00Z",
        )
        db.add(rec)
        db.flush()
        loaded = db.query(AuditEventRecord).filter_by(event_id="evt-001").one()
        assert loaded.action == "view"


class TestClinicalSeedRecordModel:
    def test_tablename(self):
        from app.persistence.models import ClinicalSeedRecord
        assert ClinicalSeedRecord.__tablename__ == "clinical_seed_records"

    def test_unique_constraint_dataset_record(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "clinical_seed_records")
        # Expect composite unique on (dataset_name, record_key)
        composite = [uc for uc in uqs if set(uc["column_names"]) == {"dataset_name", "record_key"}]
        assert composite, "Expected UniqueConstraint on (dataset_name, record_key)"

    def test_persist(self, db):
        from app.persistence.models import ClinicalSeedRecord
        seed = ClinicalSeedRecord(
            dataset_name="phq9",
            record_key="question-1",
            snapshot_id="snap-001",
            source_file="phq9.csv",
            payload_json='{"q": 1}',
            content_hash="abc123",
        )
        db.add(seed)
        db.flush()
        assert seed.id is not None


class TestAiSummaryAuditModel:
    def test_tablename(self):
        from app.persistence.models import AiSummaryAudit
        assert AiSummaryAudit.__tablename__ == "ai_summary_audit"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "ai_summary_audit")
        for col in ("patient_id", "actor_id", "actor_role", "summary_type"):
            assert cols[col]["nullable"] is False, f"ai_summary_audit.{col} should be NOT NULL"

    def test_optional_columns_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "ai_summary_audit")
        for col in ("prompt_hash", "response_preview", "model_used"):
            assert cols[col]["nullable"] is True

    def test_persist(self, db):
        from app.persistence.models import AiSummaryAudit
        rec = AiSummaryAudit(
            patient_id="pat-1",
            actor_id="actor-1",
            actor_role="clinician",
            summary_type="clinical_summary",
            model_used="claude-3",
        )
        db.add(rec)
        db.flush()
        assert rec.created_at is not None


class TestAgentRunAuditModel:
    def test_tablename(self):
        from app.persistence.models import AgentRunAudit
        assert AgentRunAudit.__tablename__ == "agent_run_audit"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "agent_run_audit")
        for col in ("id", "created_at", "agent_id", "message_preview",
                    "reply_preview", "ok"):
            assert col in cols

    def test_defaults(self, db):
        from app.persistence.models import AgentRunAudit
        run = AgentRunAudit(
            agent_id="agent-brain",
            message_preview="hello",
            reply_preview="world",
        )
        db.add(run)
        db.flush()
        assert run.ok is True
        assert run.tokens_in_used == 0
        assert run.tokens_out_used == 0
        assert run.cost_pence == 0

    def test_optional_actor_id_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "agent_run_audit")
        assert cols["actor_id"]["nullable"] is True


class TestQualityFindingModel:
    def test_tablename(self):
        from app.persistence.models import QualityFinding
        assert QualityFinding.__tablename__ == "quality_findings"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "quality_findings")
        for col in ("title", "description", "finding_type", "severity",
                    "status", "reporter_id"):
            assert cols[col]["nullable"] is False, f"quality_findings.{col} should NOT NULL"

    def test_defaults(self, db):
        from app.persistence.models import QualityFinding
        qf = QualityFinding(
            title="Protocol deviation",
            reporter_id="actor-clin",
        )
        db.add(qf)
        db.flush()
        assert qf.finding_type == "non_conformance"
        assert qf.severity == "minor"
        assert qf.status == "open"
        assert qf.is_demo is False

    def test_optional_fields_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "quality_findings")
        for col in ("capa_text", "capa_due_date", "closed_at", "closed_by",
                    "closure_note", "owner_id", "clinic_id"):
            assert cols[col]["nullable"] is True


class TestQualityFindingRevisionModel:
    def test_tablename(self):
        from app.persistence.models import QualityFindingRevision
        assert QualityFindingRevision.__tablename__ == "quality_finding_revisions"

    def test_fk_to_quality_findings(self, sqlite_engine):
        insp = inspect(sqlite_engine)
        fks = insp.get_foreign_keys("quality_finding_revisions")
        fk_targets = {fk["referred_table"] for fk in fks}
        assert "quality_findings" in fk_targets

    def test_persist_with_parent(self, db):
        from app.persistence.models import QualityFinding, QualityFindingRevision
        qf = QualityFinding(
            title="SAE follow-up",
            reporter_id="actor-clin",
        )
        db.add(qf)
        db.flush()
        rev = QualityFindingRevision(
            finding_id=qf.id,
            action="open",
            snapshot_json='{"status":"open"}',
            actor_id="actor-clin",
            actor_role="clinician",
        )
        db.add(rev)
        db.flush()
        assert rev.id is not None
        assert rev.revision_idx == 0


# ═══════════════════════════════════════════════════════════════════════════════
# clinical.py — ClinicalSession, ClinicalSessionEvent, AssessmentRecord
# ═══════════════════════════════════════════════════════════════════════════════

class TestClinicalSessionModel:
    def test_tablename(self):
        from app.persistence.models import ClinicalSession
        assert ClinicalSession.__tablename__ == "clinical_sessions"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "clinical_sessions")
        for col in ("id", "patient_id", "clinician_id", "scheduled_at",
                    "billing_status", "status", "created_at"):
            assert col in cols

    def test_billing_status_check_constraint_accepted(self, db):
        """Valid billing_status values should persist without error."""
        from app.persistence.models import ClinicalSession, Patient
        # Create a minimal patient for the FK
        p = Patient(clinician_id="clin-1", first_name="A", last_name="B")
        db.add(p)
        db.flush()
        for status in ("unbilled", "billed", "paid"):
            s = ClinicalSession(
                patient_id=p.id,
                clinician_id="clin-1",
                scheduled_at="2026-01-01T09:00:00",
                billing_status=status,
            )
            db.add(s)
        db.flush()  # all three should succeed

    def test_defaults(self, db):
        from app.persistence.models import ClinicalSession, Patient
        p = Patient(clinician_id="c1", first_name="D", last_name="E")
        db.add(p)
        db.flush()
        s = ClinicalSession(
            patient_id=p.id,
            clinician_id="c1",
            scheduled_at="2026-02-01T10:00:00",
        )
        db.add(s)
        db.flush()
        assert s.status == "scheduled"
        assert s.appointment_type == "session"
        assert s.billing_status == "unbilled"
        assert s.duration_minutes == 60

    def test_optional_columns_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "clinical_sessions")
        for col in ("modality", "protocol_ref", "outcome", "session_notes",
                    "adverse_events", "cancel_reason"):
            assert cols[col]["nullable"] is True


class TestClinicalSessionEventModel:
    def test_tablename(self):
        from app.persistence.models import ClinicalSessionEvent
        assert ClinicalSessionEvent.__tablename__ == "clinical_session_events"

    def test_fk_to_clinical_sessions(self, sqlite_engine):
        insp = inspect(sqlite_engine)
        fks = insp.get_foreign_keys("clinical_session_events")
        fk_targets = {fk["referred_table"] for fk in fks}
        assert "clinical_sessions" in fk_targets

    def test_persist(self, db):
        from app.persistence.models import ClinicalSession, ClinicalSessionEvent, Patient
        p = Patient(clinician_id="c1", first_name="F", last_name="G")
        db.add(p)
        db.flush()
        s = ClinicalSession(
            patient_id=p.id,
            clinician_id="c1",
            scheduled_at="2026-03-01T10:00:00",
        )
        db.add(s)
        db.flush()
        evt = ClinicalSessionEvent(
            session_id=s.id,
            clinician_id="c1",
            event_type="status_change",
        )
        db.add(evt)
        db.flush()
        assert evt.payload_json == "{}"
        assert evt.created_at is not None


class TestAssessmentRecordModel:
    def test_tablename(self):
        from app.persistence.models import AssessmentRecord
        assert AssessmentRecord.__tablename__ == "assessment_records"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "assessment_records")
        for col in ("patient_id", "clinician_id", "template_id", "template_title", "data_json"):
            assert cols[col]["nullable"] is False

    def test_fk_to_patients(self, sqlite_engine):
        insp = inspect(sqlite_engine)
        fks = insp.get_foreign_keys("assessment_records")
        fk_targets = {fk["referred_table"] for fk in fks}
        assert "patients" in fk_targets

    def test_defaults(self, db):
        from app.persistence.models import AssessmentRecord, Patient
        p = Patient(clinician_id="c1", first_name="H", last_name="I")
        db.add(p)
        db.flush()
        ar = AssessmentRecord(
            patient_id=p.id,
            clinician_id="c1",
            template_id="phq9",
            template_title="PHQ-9",
        )
        db.add(ar)
        db.flush()
        assert ar.status == "draft"
        assert ar.data_json == "{}"


# ═══════════════════════════════════════════════════════════════════════════════
# billing.py — Subscription, StripeWebhookLog, DataExport
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubscriptionModel:
    def test_tablename(self):
        from app.persistence.models import Subscription
        assert Subscription.__tablename__ == "subscriptions"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "subscriptions")
        for col in ("id", "user_id", "package_id", "status", "seat_limit", "created_at"):
            assert col in cols

    def test_user_id_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "subscriptions")
        assert cols["user_id"]["nullable"] is False

    def test_defaults(self, db):
        from app.persistence.models import Subscription, User
        u = User(
            email=f"sub{uuid.uuid4().hex}@x.com",
            display_name="Sub User",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        sub = Subscription(user_id=u.id)
        db.add(sub)
        db.flush()
        assert sub.package_id == "explorer"
        assert sub.status == "active"
        assert sub.seat_limit == 1

    def test_optional_stripe_fields_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "subscriptions")
        for col in ("stripe_customer_id", "stripe_subscription_id", "current_period_end"):
            assert cols[col]["nullable"] is True


class TestStripeWebhookLogModel:
    def test_tablename(self):
        from app.persistence.models import StripeWebhookLog
        assert StripeWebhookLog.__tablename__ == "stripe_webhook_logs"

    def test_stripe_event_id_unique(self, sqlite_engine):
        # unique=True is declared at column level — read from ORM metadata.
        uq_cols = _unique_columns("stripe_webhook_logs")
        assert "stripe_event_id" in uq_cols

    def test_required_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "stripe_webhook_logs")
        for col in ("stripe_event_id", "event_type", "payload", "status", "attempt_count"):
            assert cols[col]["nullable"] is False

    def test_defaults(self, db):
        from app.persistence.models import StripeWebhookLog
        log = StripeWebhookLog(
            stripe_event_id="evt_stripe_001",
            event_type="invoice.paid",
        )
        db.add(log)
        db.flush()
        assert log.status == "pending"
        assert log.attempt_count == 0
        assert log.payload == "{}"


class TestDataExportModel:
    def test_tablename(self):
        from app.persistence.models import DataExport
        assert DataExport.__tablename__ == "data_exports"

    def test_columns_present(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "data_exports")
        for col in ("id", "user_id", "status", "requested_at"):
            assert col in cols

    def test_defaults(self, db):
        from app.persistence.models import DataExport, User
        u = User(
            email=f"exp{uuid.uuid4().hex}@x.com",
            display_name="Export User",
            hashed_password="h",
        )
        db.add(u)
        db.flush()
        export = DataExport(user_id=u.id)
        db.add(export)
        db.flush()
        assert export.status == "queued"
        assert export.completed_at is None
        assert export.file_url is None


# ═══════════════════════════════════════════════════════════════════════════════
# devices.py — DeviceConnection, WearableObservation, WearableDailySummary
# ═══════════════════════════════════════════════════════════════════════════════

class TestDeviceConnectionModel:
    def test_tablename(self):
        from app.persistence.models import DeviceConnection
        assert DeviceConnection.__tablename__ == "device_connections"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "device_connections")
        for col in ("patient_id", "source", "source_type"):
            assert cols[col]["nullable"] is False

    def test_defaults(self, db):
        from app.persistence.models import DeviceConnection
        dc = DeviceConnection(
            patient_id="pat-dev-1",
            source="garmin",
            source_type="wearable",
        )
        db.add(dc)
        db.flush()
        assert dc.status == "disconnected"
        assert dc.consent_given is False
        assert dc.connected_at is None

    def test_token_fields_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "device_connections")
        for col in ("access_token_enc", "refresh_token_enc", "external_device_id"):
            assert cols[col]["nullable"] is True


class TestWearableObservationModel:
    def test_tablename(self):
        from app.persistence.models import WearableObservation
        assert WearableObservation.__tablename__ == "wearable_observations"

    def test_required_columns_not_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "wearable_observations")
        for col in ("patient_id", "source", "source_type", "metric_type", "observed_at"):
            assert cols[col]["nullable"] is False

    def test_persist(self, db):
        from app.persistence.models import WearableObservation
        obs = WearableObservation(
            patient_id="pat-w-1",
            source="garmin",
            source_type="wearable",
            metric_type="heart_rate",
            value=72.5,
            unit="bpm",
            observed_at=datetime.now(timezone.utc),
        )
        db.add(obs)
        db.flush()
        loaded = db.query(WearableObservation).filter_by(id=obs.id).one()
        assert loaded.value == pytest.approx(72.5)
        assert loaded.unit == "bpm"


class TestWearableDailySummaryModel:
    def test_tablename(self):
        from app.persistence.models import WearableDailySummary
        assert WearableDailySummary.__tablename__ == "wearable_daily_summaries"

    def test_unique_constraint_patient_source_date(self, sqlite_engine):
        uqs = _unique_constraints(sqlite_engine, "wearable_daily_summaries")
        composite = [
            uc for uc in uqs
            if set(uc["column_names"]) == {"patient_id", "source", "date"}
        ]
        assert composite, "Expected UniqueConstraint on (patient_id, source, date)"

    def test_required_columns(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "wearable_daily_summaries")
        for col in ("patient_id", "source", "date", "synced_at"):
            assert col in cols
            assert cols[col]["nullable"] is False

    def test_biometric_columns_nullable(self, sqlite_engine):
        cols = _table_columns(sqlite_engine, "wearable_daily_summaries")
        for col in ("rhr_bpm", "hrv_ms", "sleep_duration_h", "steps",
                    "spo2_pct", "readiness_score", "mood_score"):
            assert cols[col]["nullable"] is True

    def test_persist(self, db):
        from app.persistence.models import WearableDailySummary
        summary = WearableDailySummary(
            patient_id="pat-w-2",
            source="oura",
            date="2026-01-01",
            rhr_bpm=58.0,
            hrv_ms=42.0,
            sleep_duration_h=7.5,
            steps=8200,
        )
        db.add(summary)
        db.flush()
        loaded = db.query(WearableDailySummary).filter_by(id=summary.id).one()
        assert loaded.rhr_bpm == pytest.approx(58.0)
        assert loaded.date == "2026-01-01"

    def test_unique_constraint_enforced(self, sqlite_engine):
        """Inserting duplicate (patient_id, source, date) should raise IntegrityError.

        Uses its own session (not the transactional `db` fixture) so the
        IntegrityError does not deassociate the shared transaction.
        """
        from sqlalchemy.exc import IntegrityError
        from sqlalchemy.orm import Session as SA_Session
        from app.persistence.models import WearableDailySummary

        with SA_Session(bind=sqlite_engine) as session:
            # Isolate within a savepoint so we can roll back cleanly.
            with session.begin_nested():
                summary1 = WearableDailySummary(
                    patient_id="pat-uniq-uc",
                    source="oura",
                    date="2026-05-02",
                )
                session.add(summary1)
            # Second duplicate — expect IntegrityError on flush.
            summary2 = WearableDailySummary(
                patient_id="pat-uniq-uc",
                source="oura",
                date="2026-05-02",
            )
            session.add(summary2)
            with pytest.raises(IntegrityError):
                session.flush()
            session.rollback()

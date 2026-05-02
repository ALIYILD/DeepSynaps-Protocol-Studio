"""Auto-split bucket — see app.persistence.models package docstring.

This file contains a domain-grouped subset of the SQLAlchemy ORM classes
formerly in ``apps/api/app/persistence/models.py``. The split is shim-only:
every class is re-exported from ``app.persistence.models`` so callers see
no behavioural change. All classes share the single ``Base`` from
``app.database`` (re-exported here via ``_base``) — verify with
``Patient.metadata is AuditEventRecord.metadata``.
"""
from __future__ import annotations

from ._base import (  # noqa: F401 — re-export surface for class definitions
    Base,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Mapped,
    Optional,
    String,
    Text,
    UniqueConstraint,
    datetime,
    event,
    mapped_column,
    sa_text,
    timezone,
    uuid,
    _HAS_PGVECTOR,
    _PgVector,
    _embedding_column,
    _embedding_column_1536,
)


class SymptomJournalEntry(Base):
    """Patient-authored symptom log entries (launch-audit 2026-05-01).

    First patient-facing surface to receive the launch-audit treatment. The
    pre-audit state of the page was localStorage-only — no audit breadcrumb,
    no demo-flag honesty, no consent-revocation trail. This table is the
    source of truth; the pgSymptomJournal frontend may still use
    localStorage as a best-effort offline cache, but every successful
    server write supersedes it.

    Lifecycle
    ---------
    * Created by ``POST /api/v1/symptom-journal/entries`` — patient role
      only (with admin override). ``patient_id`` is auto-stamped from the
      authenticated actor; cross-patient writes return 404.
    * ``is_demo`` is set on create from ``_patient_is_demo`` (the helper
      shared with the patient-profile launch audit). Sticky once stamped
      so exports honour it on every subsequent read.
    * ``shared_at`` is set when the patient explicitly elects to share an
      entry with their care team; the clinician-visible audit row is
      emitted at that point. Entries are never auto-shared.
    * ``deleted_at`` is set by ``DELETE /entries/{id}`` (soft delete).
      The row is preserved so the audit trail remains complete; reads
      filter ``deleted_at IS NULL`` by default but the audit-visible
      detail endpoint still resolves it.
    """

    __tablename__ = "symptom_journal_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_actor_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    severity: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_demo: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False, index=True
    )
    shared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    shared_with: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    revision_count: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=0
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True, index=True
    )
    delete_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ── Patient Wellness Hub (launch-audit 2026-05-01, migration 069) ─────────────

class WellnessCheckin(Base):
    """Patient-authored wellness check-ins (launch-audit 2026-05-01).

    Second patient-facing surface to receive the launch-audit treatment.
    Mirrors :class:`SymptomJournalEntry` in audit / consent / soft-delete
    shape so the two surfaces present a consistent contract before we
    scale to Tasks / Reports / Messages / Home Devices.

    The pre-audit Wellness page lived entirely in scattered ``ds_wellness_*``
    localStorage keys (streak, last check-in date, etc.) with no audit
    breadcrumb, no demo-flag honesty, no consent-revocation trail. This
    table is the source of truth; the pgPatientWellness frontend may still
    read localStorage as a best-effort offline cache, but every successful
    server write supersedes it.

    Lifecycle
    ---------
    * Created by ``POST /api/v1/wellness/checkins`` — patient role only
      (with admin override). ``patient_id`` is auto-stamped from the
      authenticated actor; cross-patient writes return 404.
    * ``is_demo`` is set on create from ``_patient_is_demo`` (the helper
      shared with the patient-profile + symptom-journal launch audits).
      Sticky once stamped so exports honour it on every subsequent read.
    * ``shared_at`` is set when the patient explicitly elects to share an
      entry with their care team; the clinician-visible audit row is
      emitted at that point. Check-ins are never auto-shared.
    * ``deleted_at`` is set by ``DELETE /checkins/{id}`` (soft delete).
      The row is preserved so the audit trail remains complete; reads
      filter ``deleted_at IS NULL`` by default but the audit-visible
      detail endpoint still resolves it.

    Axes
    ----
    Six axes scaled 0..10 (all optional, so a partial check-in is allowed):
    ``mood``, ``energy``, ``sleep``, ``anxiety``, ``focus``, ``pain``. The
    distinction vs. :class:`SymptomJournalEntry` (single ``severity``) is
    deliberate — Symptom Journal captures a one-axis distress rating
    optimised for spotting spikes, Wellness captures the multi-axis daily
    snapshot a patient is asked to self-report.
    """

    __tablename__ = "wellness_checkins"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_actor_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    mood: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    energy: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    sleep: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    anxiety: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    focus: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    pain: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_demo: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False, index=True
    )
    shared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    shared_with: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    revision_count: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=0
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True, index=True
    )
    delete_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Clinician Wellness Hub triage state (launch-audit 2026-05-01, mig 073) ─
    # Bidirectional counterpart columns. The patient-side write contract
    # at POST /api/v1/wellness/checkins does NOT touch these — they are
    # written exclusively by the clinician_wellness_router (acknowledge /
    # escalate / resolve flow). Default ``open`` means the row has not
    # been clinician-reviewed yet.
    clinician_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", index=True,
        server_default="open",
    )
    clinician_actor_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    clinician_acted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    clinician_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    adverse_event_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )


# ── Patient Home Devices (launch-audit 2026-05-01, migration 070) ────────────

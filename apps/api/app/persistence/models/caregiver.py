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


class CaregiverConsentGrant(Base):
    """Patient → caregiver consent grant.

    Closes the caregiver-share loop opened by Patient Digest #376. A
    grant is the durable, append-aware record that a patient has
    explicitly authorised a specific caregiver user to receive specific
    classes of clinical artefacts (digest summaries, messages, reports,
    wearables). Until a grant exists with the relevant scope flag set
    True, downstream "share-with-caregiver" endpoints stay
    ``delivery_status='queued'`` (intent recorded, delivery NOT made).

    One row per (patient, caregiver, granted_at). Revocation never
    deletes — it stamps ``revoked_at`` + ``revoked_by_user_id`` +
    ``revocation_reason`` so the regulator transcript stays intact.
    Subsequent grants of the same caregiver create a new row (revisions
    are recorded in :class:`CaregiverConsentRevision`).

    ``scope`` is a JSON-encoded TEXT object. Canonical keys:
    ``digest`` / ``messages`` / ``reports`` / ``wearables``. Unknown
    keys are tolerated (forward-compatible) but ignored by the gate.

    Soft FKs to ``patients.id`` and ``users.id`` so deleting either does
    NOT cascade-clear the grant (audit history stays intact).
    """

    __tablename__ = "caregiver_consent_grants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    caregiver_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    granted_at: Mapped[str] = mapped_column(String(64), nullable=False)
    granted_by_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    revoked_at: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    revoked_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    revocation_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON object
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

class CaregiverConsentRevision(Base):
    """Append-only revisions for :class:`CaregiverConsentGrant`.

    One row per state-change on a grant (create, scope_edit, revoke).
    The grant row carries the current snapshot; this table carries the
    full history so a regulator can reconstruct the timeline of who
    granted / revised / revoked what scope at which moment.
    """

    __tablename__ = "caregiver_consent_revisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    grant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    caregiver_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # create | scope_edit | revoke
    scope_before: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    scope_after: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    actor_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)

class CaregiverDigestPreference(Base):
    """Caregiver email-digest preference row (2026-05-01).

    Closes the bidirectional notification loop opened by the Caregiver
    Notification Hub (#379). The Hub gives caregivers an in-app feed +
    unread badge; this row carries the durable preference the daily-
    digest worker reads to decide whether to dispatch an email/Slack/SMS
    roll-up of unread notifications via the on-call delivery adapters.

    One row per caregiver user (``caregiver_user_id`` is unique). A
    missing row is treated as ``enabled=False`` so the worker defaults to
    silence until the caregiver opts in. ``last_sent_at`` is stamped by
    the worker after a successful dispatch and used to enforce the per-
    caregiver 24h cooldown.

    Soft FK to ``users.id`` so deleting a user does not cascade-clear the
    preference row.
    """

    __tablename__ = "caregiver_digest_preferences"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    caregiver_user_id: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True, unique=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="daily")
    time_of_day: Mapped[str] = mapped_column(String(8), nullable=False, default="08:00")
    last_sent_at: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Per-Caregiver Channel Preference launch-audit (2026-05-01). Optional
    # caregiver-level override of the clinic's per-surface dispatch chain
    # (see EscalationPolicy from #374). When set the worker resolves the
    # dispatch chain as ``[caregiver.preferred_channel, *clinic_chain]``
    # with dedup so the caregiver's preferred adapter is tried first while
    # the clinic's escalation order remains intact as the fallback. Values
    # come from :data:`app.services.oncall_delivery.ADAPTER_CHANNEL` —
    # currently ``email`` / ``sms`` / ``slack`` / ``pagerduty``. NULL means
    # "no caregiver-level override; use the clinic chain as-is".
    preferred_channel: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

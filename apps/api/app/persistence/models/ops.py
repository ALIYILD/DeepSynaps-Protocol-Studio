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


class SalesInquiry(Base):
    """Landing page sales/contact form submission (optionally forwarded to Telegram)."""

    __tablename__ = "sales_inquiries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    message: Mapped[str] = mapped_column(Text(), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # landing | dashboard | patient_portal | other
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)


# ── Leads & Reception Models ─────────────────────────────────────────────────

class ClinicLead(Base):
    __tablename__ = "clinic_leads"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "LEAD-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default='phone')  # phone, website, referral, walk-in
    condition: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    stage: Mapped[str] = mapped_column(String(50), default='new', index=True)  # new, contacted, qualified, booked, lost
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    follow_up: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # ISO date
    converted_appointment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    updated_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), onupdate=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

class ReceptionCall(Base):
    __tablename__ = "reception_calls"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "CALL-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    direction: Mapped[str] = mapped_column(String(20), default='inbound')  # inbound, outbound
    duration: Mapped[int] = mapped_column(Integer(), default=0)
    outcome: Mapped[str] = mapped_column(String(50), default='info-given')
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    call_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    call_date: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

class ReceptionTask(Base):
    __tablename__ = "reception_tasks"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "TASK-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    text: Mapped[str] = mapped_column(String(500))
    due: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean(), default=False)
    priority: Mapped[str] = mapped_column(String(20), default='medium')
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


# ── Settings API Models (migration 024_settings_schema) ────────────────────────
# See apps/api/SETTINGS_API_DESIGN.md for the full contract.

class Clinic(Base):
    """Owning organization for multi-user accounts.

    Users link via `users.clinic_id` (FK added in migration 024 with
    ON DELETE SET NULL so orphaning a clinic doesn't delete users).
    """
    __tablename__ = "clinics"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # E.164
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")  # IANA TZ
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    specialties: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON array
    working_hours: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON map
    retention_days: Mapped[int] = mapped_column(Integer(), default=2555)  # 7y HIPAA default
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ClinicTeamInvite(Base):
    """Pending team invitations (48h TTL, single-use token)."""
    __tablename__ = "clinic_team_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # admin/clinician/technician/read-only
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    invited_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class RoomResource(Base):
    """Clinic room or treatment space."""
    __tablename__ = "room_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    modalities: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON list of supported modalities
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class DeviceResource(Base):
    """Clinic treatment device or equipment."""
    __tablename__ = "device_resources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_type: Mapped[str] = mapped_column(String(60), nullable=False)  # tDCS, rTMS, NF, etc.
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ShiftRoster(Base):
    """One staff shift on the weekly roster.

    Each row keys (clinic, user, week_start, day_of_week, surface). One
    user can hold multiple shifts in a week; the roster API groups them
    by user for the UI grid. ``is_on_call`` flips the row into the
    on-call rotation; ``surface`` (optional) lets a clinic specialise
    the on-call rotation per workflow surface (e.g. patient_messages
    vs adverse_events_hub).
    """

    __tablename__ = "shift_rosters"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    week_start: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    day_of_week: Mapped[int] = mapped_column(Integer(), nullable=False)  # 0..6
    start_time: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    is_on_call: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    surface: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    contact_channel: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    contact_handle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

class SLAConfig(Base):
    """Per-clinic per-surface SLA-minute setting.

    ``surface = '*'`` is the clinic-wide default; specific surfaces
    override it. ``severity`` is canonically ``HIGH`` (the predicate
    inbox uses) but the column is reserved for future ``SAE`` etc.
    """

    __tablename__ = "sla_configs"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id", "surface", "severity",
            name="uq_sla_configs_clinic_surface_sev",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    surface: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="HIGH")
    sla_minutes: Mapped[int] = mapped_column(Integer(), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

class EscalationChain(Base):
    """Per-clinic per-surface ``primary → backup → director`` ladder.

    ``surface = '*'`` is the clinic-wide default; per-surface rows
    override it. Soft FK to ``users.id`` so partial chains are allowed
    during onboarding (a clinic may not have a director yet).
    ``auto_page_enabled`` is OFF by default — admin must enable per
    surface to turn on the background auto-page worker.
    """

    __tablename__ = "escalation_chains"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id", "surface",
            name="uq_escalation_chains_clinic_surface",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    surface: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    primary_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    backup_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    director_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    auto_page_enabled: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

class OncallPage(Base):
    """Soft mirror of every page-on-call event.

    Canonical record is the audit row ``inbox.item_paged_to_oncall``;
    this table just gives the UI an indexable history of who was paged
    for which audit_event without scanning the audit_events full-text
    column on every UI repaint.
    """

    __tablename__ = "oncall_pages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    audit_event_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    surface: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    paged_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    paged_role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    paged_by: Mapped[str] = mapped_column(String(64), nullable=False)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)  # manual|auto
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    delivery_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # On-call delivery adapter wire-up (2026-05-01).
    # ``external_id``: provider-side message id (Slack ts, Twilio SID,
    # PagerDuty dedup_key) — None until a real adapter returned 2xx.
    # ``delivery_note``: free-form per-row delivery transcript. For mock
    # mode the note ALWAYS starts with ``MOCK:`` so the UI + reviewer can
    # see at a glance the row was not a real delivery. For "all adapters
    # failed" rows the note encodes ``slack=403, twilio=timeout`` etc.
    external_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    delivery_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

class EscalationPolicy(Base):
    """Per-clinic Escalation Policy (2026-05-01 Escalation Policy Editor).

    Replaces the hard-coded ``DEFAULT_ADAPTER_ORDER`` in
    :mod:`app.services.oncall_delivery` with a configurable per-clinic
    dispatch order + per-surface override matrix:

    * ``dispatch_order`` — JSON array of adapter names in priority order
      (e.g. ``["pagerduty", "slack", "twilio"]``). The on-call delivery
      service consults this when no per-surface override is set.
    * ``surface_overrides`` — JSON object keyed by surface name; each
      value is an array of adapter names that should fire for that
      surface (e.g. ``{"adverse_events_hub": ["pagerduty"], "wearables":
      ["slack"]}``). An empty/missing entry means "fall back to the
      clinic-wide ``dispatch_order``".
    * ``version`` — monotonically incremented on every PUT so audit rows
      can pin "policy_tested under version 7" and reviewers can correlate
      a delivery row with the policy that was active at the time.

    One row per clinic. Soft FK to ``users`` via ``updated_by``. JSON is
    stored as TEXT to stay cross-dialect (SQLite test harness +
    Postgres production).
    """

    __tablename__ = "escalation_policies"
    __table_args__ = (
        UniqueConstraint(
            "clinic_id",
            name="uq_escalation_policies_clinic",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    dispatch_order: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON array
    surface_overrides: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON object
    version: Mapped[int] = mapped_column(Integer(), nullable=False, default=1)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)

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


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    package_id: Mapped[str] = mapped_column(String(50), default="explorer")
    status: Mapped[str] = mapped_column(String(50), default="active")  # active, canceled, past_due
    seat_limit: Mapped[int] = mapped_column(Integer(), default=1)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class StripeWebhookLog(Base):
    __tablename__ = "stripe_webhook_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stripe_event_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )  # pending, processing, succeeded, failed, dead
    attempt_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True, index=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

class DataExport(Base):
    """Async GDPR Article 20 data-export job."""
    __tablename__ = "data_exports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued/running/ready/failed/expired
    file_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    file_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)


# ── Clinical Finance Hub ────────────────────────────────────────────────────────
# Invoices, patient payments, and insurance claims. See migration
# 025_finance_hub_tables.py. The router at apps/api/app/routers/finance_router.py
# exposes these under /api/v1/finance for the web Clinical Finance Hub.

class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # e.g. INV-00123
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)  # denormalized
    service: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[float] = mapped_column(Float(), nullable=False)  # ex-VAT
    vat_rate: Mapped[float] = mapped_column(Float(), nullable=False, default=0.20)  # e.g. 0.20
    vat: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float(), nullable=False)  # amount + vat
    paid: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GBP")
    issue_date: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    due_date: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|sent|paid|overdue|partial|void
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        CheckConstraint("status IN ('draft','sent','paid','overdue','partial','void')", name='ck_invoices_status'),
        UniqueConstraint("clinician_id", "invoice_number", name='uq_invoices_clinician_number'),
    )

class PatientPayment(Base):
    __tablename__ = "patient_payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float(), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="card")  # card|bacs|cash|cheque|stripe|manual
    reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payment_date: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class InsuranceClaim(Base):
    __tablename__ = "insurance_claims"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    claim_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # INS-00123
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    insurer: Mapped[str] = mapped_column(String(120), nullable=False)
    policy_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. "TMS Pre-auth"
    amount: Mapped[float] = mapped_column(Float(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|submitted|pending|approved|rejected|paid
    submitted_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    decision_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        UniqueConstraint("clinician_id", "claim_number", name='uq_claims_clinician_number'),
        CheckConstraint("status IN ('draft','submitted','pending','approved','rejected','paid')", name='ck_insurance_status'),
    )

class MarketplaceItem(Base):
    """Catalog items available in the patient marketplace.

    Items can be physical products (devices), digital services (consultations,
    coaching), or software subscriptions. External purchase links (Amazon, eBay,
    vendor sites) are stored in `external_url` so patients can buy directly.
    """
    __tablename__ = "marketplace_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="product")
    # product | service | software
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    price_unit: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    external_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    tags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinical: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    featured: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    # Professional / seller who created this item
    created_by_clinician_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_by_professional_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Seller (user) who listed this product
    seller_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="deepsynaps_curated")  # deepsynaps_curated | seller_listed
    icon: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    tone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("kind IN ('product','service','device','software','education','course')", name='ck_marketplace_items_kind'),
    )

class MarketplaceOrder(Base):
    """Patient requests / orders for marketplace items.

    When a patient clicks "Request via care team" an order is created with
    status='requested'. The care team reviews and can approve or decline.
    For external-purchase items (Amazon/eBay) the order is optional — patients
    can also buy directly via the external_url.
    """
    __tablename__ = "marketplace_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("marketplace_items.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="requested")
    # requested | approved | declined | fulfilled | cancelled
    patient_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinician_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("status IN ('requested','approved','declined','fulfilled','cancelled')", name='ck_marketplace_orders_status'),
    )


# ── Virtual Care Models ──────────────────────────────────────────────────────

class AgentSubscription(Base):
    """Per-clinic agent SKU subscription (Stripe-backed, TEST-MODE-ONLY in v1).

    One row per (clinic_id, agent_id) pair. Created in ``test_pending`` state
    when the clinic admin starts a Stripe Checkout flow; flipped to ``active``
    by the ``checkout.session.completed`` webhook. Live billing is gated by
    a separate operator action — see ``app.services.stripe_skus`` for the
    sk_live_* refusal guardrail.
    """

    __tablename__ = "agent_subscriptions"
    __table_args__ = (
        UniqueConstraint("clinic_id", "agent_id", name="uq_agent_subscription_clinic_agent"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Agent canonical id (e.g. "clinic.reception"). Not a FK — agents live in
    # the in-process AGENT_REGISTRY, not the DB.
    agent_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_price_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # test_pending → active → past_due / canceled
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="test_pending", index=True)
    monthly_price_gbp: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    canceled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# ── Phase 7 — per-package token / cost budget caps (migration 051) ──────────

class PackageTokenBudget(Base):
    """Monthly per-package token + cost cap.

    Looked up by ``package_id`` from :class:`app.auth.AuthenticatedActor`.
    The runner sums the calling clinic's :class:`AgentRunAudit` rows for
    the current calendar month and, if any cap is exceeded, refuses to
    invoke the LLM. Three rows are seeded by migration 051: ``free``,
    ``clinician_pro``, ``enterprise``. Operators can tune at runtime.
    """

    __tablename__ = "package_token_budget"
    __table_args__ = (
        UniqueConstraint("package_id", name="uq_package_token_budget_package_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Logical package identifier (e.g. ``"clinician_pro"``). Not a FK —
    # packages live in code, like agents.
    package_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    monthly_tokens_in_cap: Mapped[int] = mapped_column(Integer(), nullable=False, default=1_000_000)
    monthly_tokens_out_cap: Mapped[int] = mapped_column(Integer(), nullable=False, default=200_000)
    monthly_cost_pence_cap: Mapped[int] = mapped_column(Integer(), nullable=False, default=5000)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# ── Phase 7 — DB-backed Stripe webhook dedupe (migration 051) ───────────────

class StripeWebhookEvent(Base):
    """Persistent dedupe row, one per Stripe event id we have processed.

    Replaces the prior in-memory set in :mod:`app.services.stripe_skus`.
    On insert collision (UNIQUE on ``id``) the webhook handler treats the
    event as a duplicate and short-circuits. The row is written before
    ``_apply_webhook`` runs so a redelivery can never be applied twice.
    """

    __tablename__ = "stripe_webhook_event"

    # Stripe event id is the natural key — there is no second uuid PK.
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    processed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)


# ── Phase 7 — per-clinic agent prompt overrides (migration 051) ─────────────

class AgentPromptOverride(Base):
    """Operator-editable override of an agent's system prompt.

    Resolution order (see :func:`app.services.agents.registry.resolve_system_prompt`):

    1. enabled override matching ``(agent_id, clinic_id=<actor.clinic_id>)``
    2. enabled override matching ``(agent_id, clinic_id=NULL)`` (global)
    3. the registry's ``agent.system_prompt`` default

    Disabled rows are skipped so soft-deletes leave history but stop
    influencing live runs. Each save bumps ``version`` so the admin UI can
    surface a deterministic edit history.
    """

    __tablename__ = "agent_prompt_override"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Agent canonical id — not a FK, agents live in AGENT_REGISTRY.
    agent_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # NULL = global default override; non-NULL = clinic-scoped override.
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    system_prompt: Mapped[str] = mapped_column(Text(), nullable=False)
    version: Mapped[int] = mapped_column(Integer(), nullable=False, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )
    # FK to users — SET NULL on delete so departed admin accounts don't
    # take override history with them.
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


# ── Phase 7 default-budget seed (mirrors migration 051) ─────────────────────
#
# The migration's ``op.bulk_insert`` only fires when alembic upgrades the
# DB. The test harness builds the schema with ``Base.metadata.create_all``
# and never runs migrations, so a metadata-driven seed is needed for the
# pre-LLM budget gate to find a row to compare against.
#
# Listener seeds three rows (free / clinician_pro / enterprise) the first
# time the table is created. Idempotent under concurrent ``create_all``
# calls because the ``package_id`` UNIQUE constraint rejects re-seeding.

_DEFAULT_PACKAGE_BUDGETS = (
    # (package_id, tokens_in_cap, tokens_out_cap, cost_pence_cap)
    ("free", 50_000, 10_000, 500),
    ("clinician_pro", 1_000_000, 200_000, 5_000),
    ("enterprise", 5_000_000, 1_000_000, 20_000),
)

@event.listens_for(PackageTokenBudget.__table__, "after_create")

def _seed_default_package_budgets(target, connection, **_kw):  # noqa: ARG001
    """Insert the three default budget rows whenever the table is fresh.

    The ``after_create`` event fires under both metadata-driven
    ``create_all`` (test harness, ``init_database()``) and alembic
    ``op.create_table`` paths. The migration also calls
    :func:`op.bulk_insert` so production deployments end up with the
    same three rows by either route — duplication is rejected by the
    ``uq_package_token_budget_package_id`` constraint on the second
    seeder, so concurrent calls stay safe.
    """
    now = datetime.now(timezone.utc)
    rows = [
        {
            "id": f"pkg_budget_{pkg_id}",
            "package_id": pkg_id,
            "monthly_tokens_in_cap": ti,
            "monthly_tokens_out_cap": to,
            "monthly_cost_pence_cap": cp,
            "created_at": now,
            "updated_at": now,
        }
        for pkg_id, ti, to, cp in _DEFAULT_PACKAGE_BUDGETS
    ]
    try:
        connection.execute(target.insert(), rows)
    except Exception:  # pragma: no cover — defensive against re-seed races
        pass


# ── Phase 8 — DB-backed patient agent activation (migration 052) ────────────

class ClinicMonthlyCostCap(Base):
    """Per-clinic monthly cost ceiling for agent runs (Phase 9).

    Phase 8 populated :class:`AgentRunAudit.cost_pence` with real numbers.
    Phase 9 layers a budget guardrail on top of that data: each clinic
    optionally pins a ``cap_pence`` and the runner refuses to dispatch a
    new LLM turn whenever the month-to-date sum of ``cost_pence`` for the
    clinic meets or exceeds the cap.

    Design contract
    ---------------
    * One row per clinic — ``clinic_id`` is unique-indexed.
    * ``cap_pence == 0`` means *disabled* (no enforcement). Operators
      flip a clinic off by setting the cap to 0 rather than deleting the
      row, so the audit trail of who set what survives.
    * ``updated_by_id`` is FK -> ``users.id`` with ON DELETE SET NULL —
      we keep the cap row alive after a user is deleted but lose the
      attribution link, mirroring :class:`AgentRunAudit.actor_id`.
    """

    __tablename__ = "clinic_monthly_cost_cap"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    clinic_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    cap_pence: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_by_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


# ── Fusion Workbench Models (migration 054) ───────────────────────────────────

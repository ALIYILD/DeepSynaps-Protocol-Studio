"""Research dataset spec ORM (Slice C scaffold).

A :class:`ResearchDataset` row is the *specification* of a research export
— never the data itself. It captures which clinics + tables an admin
intends to bundle, with k-anonymity parameters, and tracks the status of
that future build. The export job is intentionally **not implemented in
this PR** (build endpoint returns 202 and writes a deferred-message
log). The whole surface is hard-gated behind the
``RESEARCH_EXPORT_ENABLED`` env flag, default OFF.

Stored as JSON for portability across the SQLite test harness and
Postgres production: lists of clinic ids, table names, and quasi-id
fields are small and don't need to be relationally indexable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text

from app.database import Base


def _new_dataset_id() -> str:
    """Short opaque id of the form ``rd_<12 hex chars>``."""
    return f"rd_{uuid4().hex[:12]}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ResearchDataset(Base):
    """Specification + lifecycle row for one research dataset export.

    Fields
    ------
    id
        ``rd_<hex>`` opaque id. Stable across rebuilds.
    name, description
        Free-text labels for operator UI.
    created_by_actor_id
        ``users.id`` of the admin who created the spec. Used for audit
        trail; not a FK to avoid coupling to the auth bucket.
    created_at
        UTC creation timestamp.
    source_clinic_ids
        JSON list of clinic ids whose data may be pulled. Empty list
        means no clinics — the build will short-circuit to ``failed``.
    included_tables
        JSON list of table names, validated by the router against
        :data:`app.services.data_console_service.SAFE_TABLES`. Any
        table outside that allowlist is rejected at create time so a
        bad spec never reaches the (deferred) build job.
    quasi_id_fields
        JSON list of fields used by the k-anonymity check. Typical
        values: ``["age_bucket", "sex", "primary_dx"]``.
    k_anonymity_threshold
        Minimum group size the dataset must achieve before
        ``status='ready'``. Default 5 (matches
        :data:`app.services.anonymization_service.K_ANONYMITY_THRESHOLD`).
    status
        Lifecycle: ``draft | building | ready | failed | revoked``.
    build_log
        Free-text breadcrumbs from the build job (or the deferred-
        message stub in this PR).
    row_count
        Final row count once the build completes. ``None`` until then.
    export_uri
        S3 / GCS / signed URL pointing at the anonymized parquet/csv
        bundle. Intentionally **not populated** in this PR — the
        feature flag prevents the build path from ever being reached.
    """

    __tablename__ = "research_datasets"

    id = Column(String(36), primary_key=True, default=_new_dataset_id)
    name = Column(String(255), nullable=False)
    description = Column(Text(), nullable=True)
    created_by_actor_id = Column(String(64), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    source_clinic_ids = Column(JSON, nullable=False)  # list[str]
    included_tables = Column(JSON, nullable=False)  # list[str]
    quasi_id_fields = Column(JSON, nullable=False)  # list[str]
    k_anonymity_threshold = Column(Integer, nullable=False, default=5)
    status = Column(
        String(20), nullable=False, default="draft"
    )  # draft | building | ready | failed | revoked
    build_log = Column(Text(), nullable=True)
    row_count = Column(Integer, nullable=True)
    # Populated only when status='ready'; intentionally NOT set in this PR.
    export_uri = Column(String(1024), nullable=True)


__all__ = ["ResearchDataset"]

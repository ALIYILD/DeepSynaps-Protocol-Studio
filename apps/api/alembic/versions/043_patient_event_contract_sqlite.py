"""Materialize the patient event contract on SQLite deployments.

This is the SQLite companion to revision 042. The production Fly app is
currently SQLite-backed, so the PostgreSQL-only contract introduced in 042
must be mirrored with portable types and SQLite trigger syntax.

Design notes
------------
* SQLite-only. Postgres deployments already get the authoritative schema in 042.
* Additive/idempotent. Uses ``IF NOT EXISTS`` / ``OR REPLACE`` so re-runs are
  safe after partial deploy failures.
* Portable shape. UUID / JSON / vector-ish columns are represented as ``TEXT``
  to match the existing repo pattern for SQLite-backed dev/test paths.

Revision ID: 043_patient_event_contract_sqlite
Revises: 042_patient_event_contract
Create Date: 2026-04-24
"""
from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op


revision = "043_patient_event_contract_sqlite"
down_revision = "042_patient_event_contract"
branch_labels = None
depends_on = None

log = logging.getLogger(__name__)


def upgrade() -> None:
    """Create the patient-event contract tables on SQLite."""
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("043 running on dialect=%s", dialect)

    if dialect != "sqlite":
        log.info("043 skipped on non-SQLite dialect=%s", dialect)
        return

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_events (
                event_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                t_utc TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                t_patient_local TEXT,
                source TEXT NOT NULL,
                source_version TEXT,
                payload TEXT NOT NULL DEFAULT '{}',
                idempotency_key TEXT UNIQUE,
                upstream_event_ids TEXT DEFAULT '[]',
                created_by TEXT,
                created_by_kind TEXT NOT NULL DEFAULT 'system',
                contains_phi INTEGER NOT NULL DEFAULT 1,
                visibility TEXT NOT NULL DEFAULT 'clinician',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CHECK (created_by_kind IN ('user','agent','system')),
                CHECK (visibility IN ('clinician','patient','internal','audit_only'))
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pe_patient_t ON patient_events (patient_id, t_utc DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pe_kind_t ON patient_events (kind, t_utc DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pe_patient_kind_t ON patient_events (patient_id, kind, t_utc DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pe_source_t ON patient_events (source, t_utc DESC)"))

    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_update"))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER pe_no_update
            BEFORE UPDATE ON patient_events
            BEGIN
                SELECT RAISE(FAIL, 'patient_events is append-only; use a correction event instead');
            END
            """
        )
    )
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_delete"))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER pe_no_delete
            BEFORE DELETE ON patient_events
            BEGIN
                SELECT RAISE(FAIL, 'patient_events is append-only; use a correction event instead');
            END
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_features (
                feature_id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id TEXT NOT NULL,
                t_utc TEXT NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT,
                z REAL,
                percentile REAL,
                flagged INTEGER NOT NULL DEFAULT 0,
                event_id TEXT REFERENCES patient_events(event_id) ON DELETE SET NULL,
                UNIQUE (patient_id, t_utc, name, source)
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pf_patient_name_t ON patient_features (patient_id, name, t_utc DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pf_patient_flag ON patient_features (patient_id)"))
    op.execute(
        sa.text(
            """
            CREATE VIEW IF NOT EXISTS patient_features_latest AS
            SELECT pf.patient_id, pf.name, pf.source, pf.value, pf.unit,
                   pf.z, pf.percentile, pf.flagged, pf.t_utc, pf.event_id
            FROM patient_features pf
            JOIN (
                SELECT patient_id, name, source, MAX(t_utc) AS max_t_utc
                FROM patient_features
                GROUP BY patient_id, name, source
            ) latest
              ON latest.patient_id = pf.patient_id
             AND latest.name = pf.name
             AND latest.source = pf.source
             AND latest.max_t_utc = pf.t_utc
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_vectors (
                patient_id TEXT NOT NULL,
                day TEXT NOT NULL,
                embedding TEXT NOT NULL,
                components TEXT NOT NULL DEFAULT '{}',
                model_version TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (patient_id, day)
            )
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS crisis_alerts_current (
                patient_id TEXT PRIMARY KEY,
                tier TEXT NOT NULL,
                risk REAL NOT NULL,
                drivers TEXT NOT NULL DEFAULT '[]',
                event_id TEXT NOT NULL REFERENCES patient_events(event_id),
                t_utc TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0,
                acknowledged_by TEXT,
                acknowledged_at TEXT,
                CHECK (tier IN ('green','yellow','orange','red'))
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_crisis_tier ON crisis_alerts_current (tier, t_utc DESC)"))

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS agent_actions_log (
                action_id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL REFERENCES patient_events(event_id),
                patient_id TEXT NOT NULL,
                role TEXT NOT NULL,
                action_kind TEXT NOT NULL,
                model TEXT,
                prompt_hash TEXT,
                sources TEXT DEFAULT '[]',
                content TEXT DEFAULT '{}',
                requires_review INTEGER NOT NULL DEFAULT 1,
                clinician_review_event_id TEXT REFERENCES patient_events(event_id),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_aal_patient ON agent_actions_log (patient_id, created_at DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_aal_role ON agent_actions_log (role)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_aal_unreviewed ON agent_actions_log (patient_id, requires_review, clinician_review_event_id)"))

    log.info("043 complete")


def downgrade() -> None:
    """Drop the SQLite patient-event contract tables and triggers."""
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("043 downgrade on dialect=%s", dialect)

    if dialect != "sqlite":
        log.info("043 downgrade skipped on non-SQLite dialect=%s", dialect)
        return

    op.execute(sa.text("DROP VIEW IF EXISTS patient_features_latest"))
    op.execute(sa.text("DROP TABLE IF EXISTS crisis_alerts_current"))
    op.execute(sa.text("DROP TABLE IF EXISTS agent_actions_log"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_vectors"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_features"))
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_update"))
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_delete"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_events"))

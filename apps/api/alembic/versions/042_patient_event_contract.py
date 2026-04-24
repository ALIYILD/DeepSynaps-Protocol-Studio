"""Materialize the DeepSynaps core patient event contract on Postgres.

Creates the append-only ``patient_events`` timeline plus its supporting
feature store, vector store, crisis-alert mirror, and agent action ledger.

Design notes
------------
* PostgreSQL-only. SQLite is the local/test path and does not support the
  required extension / type stack (``pgcrypto``, ``vector(768)``, ``JSONB``,
  PL/pgSQL triggers, HNSW indices). We therefore log and return on SQLite.
* Idempotent. The migration uses ``IF NOT EXISTS`` / ``OR REPLACE`` patterns
  so it can be re-run safely after a partial operator failure.
* Extension-aware. ``pgcrypto`` and ``vector`` are ensured before the schema
  is created. If either extension is still unavailable, the migration logs and
  exits without raising so the broader app can continue booting.

Revision ID: 042_patient_event_contract
Revises: 041_pgvector_native_columns
Create Date: 2026-04-24
"""
from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op


revision = "042_patient_event_contract"
down_revision = "041_pgvector_native_columns"
branch_labels = None
depends_on = None

log = logging.getLogger(__name__)


def _extension_present(bind, name: str) -> bool:
    try:
        row = bind.execute(
            sa.text("SELECT 1 FROM pg_extension WHERE extname = :name"),
            {"name": name},
        ).fetchone()
    except Exception as exc:  # noqa: BLE001
        log.warning("pg_extension probe failed for %s: %s", name, exc)
        return False
    return row is not None


def upgrade() -> None:
    """Create the patient-event contract tables on PostgreSQL."""
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("042 running on dialect=%s", dialect)

    if dialect != "postgresql":
        log.info("042 skipped on non-Postgres dialect=%s", dialect)
        return

    for extension in ("pgcrypto", "vector"):
        try:
            op.execute(sa.text(f"CREATE EXTENSION IF NOT EXISTS {extension}"))
            log.info("%s extension ensured", extension)
        except Exception as exc:  # noqa: BLE001
            log.warning("CREATE EXTENSION %s failed: %s", extension, exc)

        if not _extension_present(bind, extension):
            log.critical(
                "required extension %s is unavailable; aborting 042 without changes",
                extension,
            )
            return

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_events (
                event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                patient_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                t_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                t_patient_local TIMESTAMPTZ,
                source TEXT NOT NULL,
                source_version TEXT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                idempotency_key TEXT UNIQUE,
                upstream_event_ids UUID[] DEFAULT '{}',
                created_by TEXT,
                created_by_kind TEXT NOT NULL DEFAULT 'system',
                contains_phi BOOLEAN NOT NULL DEFAULT TRUE,
                visibility TEXT NOT NULL DEFAULT 'clinician',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pe_payload_gin ON patient_events USING GIN (payload)"))

    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION pe_forbid_update_delete() RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'patient_events is append-only; use a correction event instead';
            END;
            $$ LANGUAGE plpgsql
            """
        )
    )
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_update ON patient_events"))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER pe_no_update
            BEFORE UPDATE ON patient_events
            FOR EACH ROW EXECUTE FUNCTION pe_forbid_update_delete()
            """
        )
    )
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_delete ON patient_events"))
    op.execute(
        sa.text(
            """
            CREATE TRIGGER pe_no_delete
            BEFORE DELETE ON patient_events
            FOR EACH ROW EXECUTE FUNCTION pe_forbid_update_delete()
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_features (
                feature_id BIGSERIAL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                t_utc TIMESTAMPTZ NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                value DOUBLE PRECISION NOT NULL,
                unit TEXT,
                z DOUBLE PRECISION,
                percentile DOUBLE PRECISION,
                flagged BOOLEAN NOT NULL DEFAULT FALSE,
                event_id UUID REFERENCES patient_events(event_id) ON DELETE SET NULL,
                UNIQUE (patient_id, t_utc, name, source)
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pf_patient_name_t ON patient_features (patient_id, name, t_utc DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_pf_patient_flag ON patient_features (patient_id) WHERE flagged"))
    op.execute(
        sa.text(
            """
            CREATE OR REPLACE VIEW patient_features_latest AS
            SELECT DISTINCT ON (patient_id, name, source)
                patient_id, name, source, value, unit, z, percentile, flagged, t_utc, event_id
            FROM patient_features
            ORDER BY patient_id, name, source, t_utc DESC
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS patient_vectors (
                patient_id TEXT NOT NULL,
                day DATE NOT NULL,
                embedding vector(768) NOT NULL,
                components JSONB NOT NULL DEFAULT '{}'::jsonb,
                model_version TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (patient_id, day)
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pv_hnsw'
                ) THEN
                    EXECUTE 'CREATE INDEX idx_pv_hnsw ON patient_vectors USING hnsw (embedding vector_cosine_ops)';
                END IF;
            END $$;
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS crisis_alerts_current (
                patient_id TEXT PRIMARY KEY,
                tier TEXT NOT NULL,
                risk DOUBLE PRECISION NOT NULL,
                drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
                event_id UUID NOT NULL REFERENCES patient_events(event_id),
                t_utc TIMESTAMPTZ NOT NULL,
                acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
                acknowledged_by TEXT,
                acknowledged_at TIMESTAMPTZ,
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
                action_id UUID PRIMARY KEY,
                event_id UUID NOT NULL REFERENCES patient_events(event_id),
                patient_id TEXT NOT NULL,
                role TEXT NOT NULL,
                action_kind TEXT NOT NULL,
                model TEXT,
                prompt_hash TEXT,
                sources JSONB DEFAULT '[]'::jsonb,
                content JSONB DEFAULT '{}'::jsonb,
                requires_review BOOLEAN NOT NULL DEFAULT TRUE,
                clinician_review_event_id UUID REFERENCES patient_events(event_id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_aal_patient ON agent_actions_log (patient_id, created_at DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_aal_role ON agent_actions_log (role)"))
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS idx_aal_unreviewed
            ON agent_actions_log (patient_id)
            WHERE requires_review AND clinician_review_event_id IS NULL
            """
        )
    )

    op.execute(
        sa.text(
            """
            COMMENT ON TABLE patient_events IS
            'Append-only longitudinal event log - the single source of truth'
            """
        )
    )
    op.execute(
        sa.text(
            """
            COMMENT ON TABLE patient_features IS
            'z-scored numeric features derived from events, for queries/dashboards'
            """
        )
    )
    op.execute(
        sa.text(
            """
            COMMENT ON TABLE patient_vectors IS
            '768-d daily patient embeddings for similarity / case-based retrieval'
            """
        )
    )
    op.execute(
        sa.text(
            """
            COMMENT ON TABLE crisis_alerts_current IS
            'Narrow mirror of current (non-green) tier per patient'
            """
        )
    )
    op.execute(
        sa.text(
            """
            COMMENT ON TABLE agent_actions_log IS
            'Auditable ledger of every OpenClaw agent action'
            """
        )
    )

    log.info("042 complete")


def downgrade() -> None:
    """Drop the patient-event contract tables and supporting objects."""
    bind = op.get_bind()
    dialect = bind.dialect.name
    log.info("042 downgrade on dialect=%s", dialect)

    if dialect != "postgresql":
        log.info("042 downgrade skipped on non-Postgres dialect=%s", dialect)
        return

    op.execute(sa.text("DROP VIEW IF EXISTS patient_features_latest"))
    op.execute(sa.text("DROP TABLE IF EXISTS crisis_alerts_current"))
    op.execute(sa.text("DROP TABLE IF EXISTS agent_actions_log"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_vectors"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_features"))
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_update ON patient_events"))
    op.execute(sa.text("DROP TRIGGER IF EXISTS pe_no_delete ON patient_events"))
    op.execute(sa.text("DROP TABLE IF EXISTS patient_events"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS pe_forbid_update_delete()"))

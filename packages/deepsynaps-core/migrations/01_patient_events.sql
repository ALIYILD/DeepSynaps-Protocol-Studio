-- =============================================================================
-- DeepSynaps Core — migration 01: the append-only patient timeline
-- =============================================================================
-- One table. Every subsystem (qEEG Analyzer, MRI Analyzer, Protocol Generator,
-- Biometrics, RiskEngine, OpenClaw agents) writes here; everything else reads.
--
-- This migration runs AFTER the existing qEEG + MRI + MedRAG migrations.
-- It does not touch any existing table.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- If timescaledb is available, uncomment the hypertable creation at the bottom.
-- Without it, btree indexes on (patient_id, t_utc) scale to tens of millions of
-- events comfortably.

-- -----------------------------------------------------------------------------
-- 1. The event log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_events (
    event_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id            TEXT NOT NULL,
    kind                  TEXT NOT NULL,
    t_utc                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    t_patient_local       TIMESTAMPTZ,

    source                TEXT NOT NULL,
    source_version        TEXT,

    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,

    idempotency_key       TEXT UNIQUE,
    upstream_event_ids    UUID[] DEFAULT '{}',

    created_by            TEXT,
    created_by_kind       TEXT NOT NULL DEFAULT 'system',   -- user | agent | system

    contains_phi          BOOLEAN NOT NULL DEFAULT TRUE,
    visibility            TEXT NOT NULL DEFAULT 'clinician',

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (created_by_kind IN ('user','agent','system')),
    CHECK (visibility IN ('clinician','patient','internal','audit_only'))
);

-- Fast access patterns
CREATE INDEX IF NOT EXISTS idx_pe_patient_t          ON patient_events (patient_id, t_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pe_kind_t             ON patient_events (kind, t_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pe_patient_kind_t     ON patient_events (patient_id, kind, t_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pe_source_t           ON patient_events (source, t_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pe_payload_gin        ON patient_events USING GIN (payload);

-- Strict immutability — enforce append-only at the DB level
CREATE OR REPLACE FUNCTION pe_forbid_update_delete() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'patient_events is append-only; use a correction event instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pe_no_update ON patient_events;
CREATE TRIGGER pe_no_update BEFORE UPDATE ON patient_events
    FOR EACH ROW EXECUTE FUNCTION pe_forbid_update_delete();

DROP TRIGGER IF EXISTS pe_no_delete ON patient_events;
CREATE TRIGGER pe_no_delete BEFORE DELETE ON patient_events
    FOR EACH ROW EXECUTE FUNCTION pe_forbid_update_delete();

-- -----------------------------------------------------------------------------
-- 2. FeatureStore — materialized view over events, one row per feature per time
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_features (
    feature_id        BIGSERIAL PRIMARY KEY,
    patient_id        TEXT NOT NULL,
    t_utc             TIMESTAMPTZ NOT NULL,
    source            TEXT NOT NULL,           -- qeeg | mri_* | wearable_* | prom | derived
    name              TEXT NOT NULL,
    value             DOUBLE PRECISION NOT NULL,
    unit              TEXT,
    z                 DOUBLE PRECISION,
    percentile        DOUBLE PRECISION,
    flagged           BOOLEAN NOT NULL DEFAULT FALSE,
    event_id          UUID REFERENCES patient_events(event_id) ON DELETE SET NULL,
    UNIQUE (patient_id, t_utc, name, source)
);
CREATE INDEX IF NOT EXISTS idx_pf_patient_name_t ON patient_features (patient_id, name, t_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pf_patient_flag   ON patient_features (patient_id) WHERE flagged;

-- A last-values view for O(1) snapshot reads
CREATE OR REPLACE VIEW patient_features_latest AS
    SELECT DISTINCT ON (patient_id, name, source)
        patient_id, name, source, value, unit, z, percentile, flagged, t_utc, event_id
    FROM patient_features
    ORDER BY patient_id, name, source, t_utc DESC;

-- -----------------------------------------------------------------------------
-- 3. PatientVector — one 768-d embedding per patient per day
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_vectors (
    patient_id      TEXT NOT NULL,
    day             DATE NOT NULL,
    embedding       vector(768) NOT NULL,
    components      JSONB NOT NULL DEFAULT '{}',   -- {"qeeg":[256],"mri":[200],"bio":[128],"prom":[96],"demo":[88]}
    model_version   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (patient_id, day)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_pv_hnsw') THEN
        EXECUTE 'CREATE INDEX idx_pv_hnsw ON patient_vectors USING hnsw (embedding vector_cosine_ops)';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Crisis alerts — a narrow, queryable mirror of the most recent red/orange events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_alerts_current (
    patient_id      TEXT PRIMARY KEY,
    tier            TEXT NOT NULL,             -- green|yellow|orange|red
    risk            DOUBLE PRECISION NOT NULL,
    drivers         JSONB NOT NULL DEFAULT '[]',
    event_id        UUID NOT NULL REFERENCES patient_events(event_id),
    t_utc           TIMESTAMPTZ NOT NULL,
    acknowledged    BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    CHECK (tier IN ('green','yellow','orange','red'))
);
CREATE INDEX IF NOT EXISTS idx_crisis_tier ON crisis_alerts_current (tier, t_utc DESC);

-- -----------------------------------------------------------------------------
-- 5. Agent action ledger — every OpenClaw action, for audit + defensibility
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_actions_log (
    action_id           UUID PRIMARY KEY,
    event_id            UUID NOT NULL REFERENCES patient_events(event_id),
    patient_id          TEXT NOT NULL,
    role                TEXT NOT NULL,         -- insight_dr, crisis_dr, protocol_dr, ...
    action_kind         TEXT NOT NULL,         -- summarize, draft_order, mutation, ...
    model               TEXT,
    prompt_hash         TEXT,
    sources             JSONB DEFAULT '[]',
    content             JSONB DEFAULT '{}',
    requires_review     BOOLEAN NOT NULL DEFAULT TRUE,
    clinician_review_event_id UUID REFERENCES patient_events(event_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aal_patient    ON agent_actions_log (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_role       ON agent_actions_log (role);
CREATE INDEX IF NOT EXISTS idx_aal_unreviewed ON agent_actions_log (patient_id) WHERE requires_review AND clinician_review_event_id IS NULL;

COMMENT ON TABLE patient_events         IS 'Append-only longitudinal event log — the single source of truth';
COMMENT ON TABLE patient_features       IS 'z-scored numeric features derived from events, for queries/dashboards';
COMMENT ON TABLE patient_vectors        IS '768-d daily patient embeddings for similarity / case-based retrieval';
COMMENT ON TABLE crisis_alerts_current  IS 'Narrow mirror of current (non-green) tier per patient';
COMMENT ON TABLE agent_actions_log      IS 'Auditable ledger of every OpenClaw agent action';

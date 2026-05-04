-- DeepSynaps MedRAG migration — Video Analyzer
-- Adds:
--   * video_analyses        — one row per pipeline run
--   * video_clips           — every clip artefact with retention + face-blur status
--   * video_eval_runs       — eval reports for the dashboard "Errors" tab
--   * new entity types in kg_entities: movement_biomarker, monitoring_event
--   * new relations in kg_relations:   movement_biomarker_for,
--                                      task_validates_biomarker,
--                                      monitoring_event_for, video_proxy_of
-- Mirrors the shape introduced by ``04_migration_mri.sql``.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgvector;

CREATE TABLE IF NOT EXISTS video_analyses (
    analysis_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id         UUID NOT NULL,
    capture_started_at TIMESTAMPTZ,
    capture_source     TEXT,
    pose_engine        TEXT,
    qc                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    tasks              JSONB NOT NULL DEFAULT '[]'::jsonb,
    monitoring_events  JSONB NOT NULL DEFAULT '[]'::jsonb,
    longitudinal       JSONB,
    medrag_query       JSONB,
    embedding          vector(256),  -- placeholder for the eventual video FM embedding
    clinician_reviewed_at TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_analyses_patient_idx
    ON video_analyses (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_clips (
    clip_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id        UUID NOT NULL REFERENCES video_analyses(analysis_id) ON DELETE CASCADE,
    s3_uri             TEXT NOT NULL,
    duration_s         DOUBLE PRECISION,
    face_blurred       BOOLEAN NOT NULL DEFAULT TRUE,
    voice_muted        BOOLEAN NOT NULL DEFAULT FALSE,
    retention_until    TIMESTAMPTZ,
    consent_id         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_eval_runs (
    eval_run_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id          TEXT NOT NULL,
    manifest_id        TEXT NOT NULL,
    slice_metrics      JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- New kg_entities row types are not enforced as enums; they are tagged via
-- the ``entity_type`` column. Seed via 07_seed_video_entities.py.

COMMIT;

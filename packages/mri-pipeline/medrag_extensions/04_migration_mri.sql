-- ============================================================================
-- DeepSynaps Studio — MedRAG extensions for the MRI Analyzer  (migration 04)
-- ----------------------------------------------------------------------------
-- Adds:
--   1. mri_analyses table (report + vector embedding)
--   2. new kg_entity_type values for MRI-specific findings
--   3. new kg_relation types  for MRI <-> paper hypergraph edges
-- ----------------------------------------------------------------------------
-- Assumes prior migrations 01 / 02 / 03 (from deepsynaps_qeeg_analyzer/medrag)
-- have created: kg_entities, kg_relations, papers, pgvector extension, etc.
-- ============================================================================

-- pgvector is already installed by migration 01; no-op if not.
CREATE EXTENSION IF NOT EXISTS vector;


-- ----------------------------------------------------------------------------
-- 1. mri_analyses — one row per finished MRI run
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mri_analyses (
    analysis_id         UUID PRIMARY KEY,
    patient_id          TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    modalities_present  TEXT[] NOT NULL DEFAULT '{}',

    structural          JSONB,
    functional          JSONB,
    diffusion           JSONB,

    stim_targets        JSONB NOT NULL DEFAULT '[]'::jsonb,
    medrag_query        JSONB NOT NULL DEFAULT '{}'::jsonb,
    overlays            JSONB NOT NULL DEFAULT '{}'::jsonb,
    qc                  JSONB NOT NULL DEFAULT '{}'::jsonb,

    pipeline_version    TEXT NOT NULL,
    norm_db_version     TEXT NOT NULL,

    -- Cross-modal embedding (same 200-d abstract embedding space used by papers)
    embedding           vector(200)
);

CREATE INDEX IF NOT EXISTS idx_mri_analyses_patient      ON mri_analyses(patient_id);
CREATE INDEX IF NOT EXISTS idx_mri_analyses_created      ON mri_analyses(created_at DESC);

-- HNSW index on the embedding vector (pgvector 0.5+ syntax)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_mri_analyses_embedding_hnsw'
    ) THEN
        EXECUTE 'CREATE INDEX idx_mri_analyses_embedding_hnsw ON mri_analyses USING hnsw (embedding vector_cosine_ops)';
    END IF;
END
$$;

-- GIN indexes for JSONB lookup on common filters
CREATE INDEX IF NOT EXISTS idx_mri_analyses_stim_targets_gin ON mri_analyses USING GIN (stim_targets);
CREATE INDEX IF NOT EXISTS idx_mri_analyses_medrag_gin       ON mri_analyses USING GIN (medrag_query);


-- ----------------------------------------------------------------------------
-- 2. Readable convenience view to surface MRI -> paper edges
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_mri_stim_targets AS
SELECT
    analysis_id,
    patient_id,
    created_at,
    (t ->> 'target_id')                                    AS target_id,
    (t ->> 'modality')                                     AS modality,
    (t ->> 'condition')                                    AS condition,
    (t ->> 'region_name')                                  AS region_name,
    (t ->> 'region_code')                                  AS region_code,
    (t ->  'mni_xyz')                                      AS mni_xyz,
    (t ->> 'method')                                       AS method,
    (t ->> 'confidence')                                   AS confidence,
    (t ->  'method_reference_dois')                        AS method_reference_dois,
    (t ->  'supporting_paper_ids_from_medrag')             AS supporting_paper_ids
FROM mri_analyses
CROSS JOIN LATERAL jsonb_array_elements(stim_targets) AS t;


-- ----------------------------------------------------------------------------
-- 3. New kg_entity_type values (region_metric, network_metric, mri_biomarker)
-- ----------------------------------------------------------------------------
-- kg_entities.type is a TEXT column (not an enum) in the v1 schema, so we
-- just document the canonical values here. If migration 01 introduced an
-- enum, uncomment the ALTER TYPE lines below.
--
-- ALTER TYPE kg_entity_type ADD VALUE IF NOT EXISTS 'region_metric';
-- ALTER TYPE kg_entity_type ADD VALUE IF NOT EXISTS 'network_metric';
-- ALTER TYPE kg_entity_type ADD VALUE IF NOT EXISTS 'mri_biomarker';
--
-- Canonical new entity categories:
--   region_metric    (e.g. "hippocampus_volume", "DLPFC_thickness")
--   network_metric   (e.g. "DMN_within_fc", "sgACC_DLPFC_anticorrelation")
--   mri_biomarker    (e.g. "wmh_burden", "ventricular_volume_ratio")


-- ----------------------------------------------------------------------------
-- 4. New kg_relation types
-- ----------------------------------------------------------------------------
-- kg_relations.relation_type is also TEXT. Canonical new relation types:
--   atrophy_in_region         paper -> region_metric   (implies z < 0 direction)
--   connectivity_altered      paper -> network_metric  (polarity field)
--   stim_target_for           paper -> (region | condition)
--   mri_biomarker_for         paper -> (biomarker | condition)
--
-- Retrieval uses these as additional traversal edges in the EEG-MedRAG graph.


-- ----------------------------------------------------------------------------
-- 5. Cross-table helper function — paper pool for a given MedRAGQuery
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mri_medrag_candidate_papers(
    p_findings JSONB,
    p_conditions TEXT[],
    p_limit INT DEFAULT 200
) RETURNS TABLE(paper_id INT, score FLOAT) AS $$
    SELECT DISTINCT r.source_id AS paper_id,
           1.0::FLOAT - 0.1 * ABS(COALESCE((f ->> 'zscore')::FLOAT, 0)) AS score
    FROM jsonb_array_elements(p_findings) AS f
    JOIN kg_entities e
      ON e.canonical_name = f ->> 'value'
    JOIN kg_relations r
      ON r.target_id = e.entity_id
    WHERE e.type IN ('region_metric','network_metric','mri_biomarker')
      AND r.relation_type IN (
          'atrophy_in_region','connectivity_altered',
          'stim_target_for','mri_biomarker_for'
      )
      AND (
          p_conditions IS NULL OR EXISTS (
              SELECT 1 FROM kg_entities c
              WHERE c.entity_id = ANY(r.context_entity_ids)
                AND c.type = 'condition'
                AND c.code = ANY(p_conditions)
          )
      )
    ORDER BY score DESC
    LIMIT p_limit;
$$ LANGUAGE SQL STABLE;

COMMENT ON TABLE  mri_analyses IS 'One MRI Analyzer run per row; JSONB fields = MRIReport schema';
COMMENT ON COLUMN mri_analyses.embedding IS '200-d abstract embedding (same space as papers.embedding)';

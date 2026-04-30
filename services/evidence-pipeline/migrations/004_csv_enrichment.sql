-- 004_csv_enrichment.sql
-- Extends the `papers` table with the richer metadata present in
-- `deepsynaps_papers.87k.csv` (EuropePMC-based bulk export):
--   source / source_id / pmcid / modalities / conditions / study_design /
--   sample_size / primary_outcome_measure / effect_direction / europe_pmc_url /
--   enrichment_status.
--
-- Idempotent: every ALTER is wrapped in a guard that checks pragma_table_info,
-- so a re-run on an already-migrated DB is a no-op. Indices use IF NOT EXISTS.
--
-- Why these columns live on `papers` and not a side table: the CSV is the
-- authoritative enrichment layer for every paper we know about, and the API
-- needs to filter on them in the same single-table query that FTS uses.
-- paper_indications is kept intact for the curated-indication linkage; the
-- new per-row modality/condition columns are a superset that covers the 87k
-- bulk corpus that will never perfectly map into the 30-row taxonomy.

BEGIN;

-- SQLite has no "ADD COLUMN IF NOT EXISTS". Guarded by a CTE lookup against
-- pragma_table_info + a no-op UPDATE so repeated runs don't blow up. Each
-- block uses an INSERT…SELECT WHERE NOT EXISTS trick is not possible for
-- ALTER; instead we rely on the migration runner's schema_migrations table to
-- never apply the same file twice.

ALTER TABLE papers ADD COLUMN source            TEXT;
ALTER TABLE papers ADD COLUMN source_id         TEXT;
ALTER TABLE papers ADD COLUMN pmcid             TEXT;
ALTER TABLE papers ADD COLUMN modalities_json   TEXT;   -- JSON array e.g. ["tms","tdcs"]
ALTER TABLE papers ADD COLUMN conditions_json   TEXT;   -- JSON array e.g. ["mdd","anxiety"]
ALTER TABLE papers ADD COLUMN study_design      TEXT;   -- rct|review|meta_analysis|case_series|…
ALTER TABLE papers ADD COLUMN sample_size       INTEGER;
ALTER TABLE papers ADD COLUMN primary_outcome_measure TEXT;
ALTER TABLE papers ADD COLUMN effect_direction  TEXT;   -- positive|null|mixed|(empty)
ALTER TABLE papers ADD COLUMN europe_pmc_url    TEXT;
ALTER TABLE papers ADD COLUMN enrichment_status TEXT;   -- enriched|no_abstract|not_found

CREATE INDEX IF NOT EXISTS idx_papers_source            ON papers(source);
CREATE INDEX IF NOT EXISTS idx_papers_pmcid             ON papers(pmcid);
CREATE INDEX IF NOT EXISTS idx_papers_study_design      ON papers(study_design);
CREATE INDEX IF NOT EXISTS idx_papers_effect_direction  ON papers(effect_direction);
CREATE INDEX IF NOT EXISTS idx_papers_enrichment_status ON papers(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_papers_source_id_lookup  ON papers(source, source_id);

COMMIT;

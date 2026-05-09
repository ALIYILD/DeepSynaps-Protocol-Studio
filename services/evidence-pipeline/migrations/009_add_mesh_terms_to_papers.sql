-- Migration 009: Add mesh_terms_json column to papers table.
-- B1 schema companion for the pymed enrichment adapter
-- (services/evidence-pipeline/sources/pubmed_pymed.py — follow-up PR).
--
-- Safe on SQLite >= 3.1 (ALTER TABLE ADD COLUMN with DEFAULT).
-- Column stays NULL for all existing rows until an --enrich-mesh ingest
-- pass is run.  API and existing queries are unaffected.
--
-- Reversible: DROP COLUMN requires SQLite >= 3.35. On older versions,
-- the column is harmless (NULL, TEXT type, default NULL).

PRAGMA journal_mode=WAL;

-- Add the column if it does not already exist.
-- We use a try-skip approach via the migration runner; if the column
-- already exists this statement will raise "duplicate column name" and
-- the runner should treat that as idempotent (already applied).
ALTER TABLE papers ADD COLUMN mesh_terms_json TEXT DEFAULT NULL;

-- Optional: index on non-NULL rows for the /api/v1/evidence/papers/{id}/mesh-terms
-- endpoint (added in follow-up PR). Partial indexes require SQLite >= 3.8.
-- The CREATE INDEX IF NOT EXISTS is safe to run multiple times.
CREATE INDEX IF NOT EXISTS idx_papers_mesh_terms_notnull
    ON papers(id)
    WHERE mesh_terms_json IS NOT NULL;

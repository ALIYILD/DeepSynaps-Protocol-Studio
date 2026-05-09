-- 011_indications_computed_grade.sql
-- Adds indications.computed_evidence_grade  (TEXT, always populated after
-- compute_indication_grades.py runs).
--
-- Design intent
-- ─────────────
-- The existing `evidence_grade` column holds a curator-seeded A/B/C/D/E value
-- that may be NULL or stale. This new column is written by a deterministic
-- rubric that fires on every nightly enrichment cycle (step 10/10 of
-- nightly-enrichment.sh). The two columns are intentionally separate:
--
--   evidence_grade          — human-curated; clinicians trust this anchor.
--   computed_evidence_grade — algorithm-derived from actual paper / trial /
--                             device counts; always reflects what is in the DB.
--
-- The API returns BOTH, labelled honestly.
--
-- Rubric (see compute_indication_grades.py for authoritative details):
--   A  >= 200 papers  AND >= 10 trials  AND >= 5 devices
--   B  >= 100 papers  AND >= 1 device
--   C  >= 30 papers
--   D  >= 5 papers
--   E  < 5 papers (or no curated data at all)
--
-- Idempotency: run-migrations.sh tracks applied files in schema_migrations.

BEGIN;

ALTER TABLE indications ADD COLUMN computed_evidence_grade TEXT;

-- NULL at migration time; compute_indication_grades.py populates on first run.

COMMIT;

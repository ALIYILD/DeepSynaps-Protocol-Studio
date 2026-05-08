-- 008_papers_abstract_source.sql
-- Adds `abstract_source` to the `papers` table so each abstract-enrichment
-- pass can record where the text came from and future passes can skip rows
-- that already have a source (idempotent re-enrichment).
--
-- Values: NULL (not yet attempted), 'europepmc', 'pubmed', 'unpaywall'.
-- The enrichment script (enrich_abstracts.py) writes this column; the FTS
-- trigger on papers will pick up the updated abstract automatically.
--
-- Note: migration 004 introduced other ALTER TABLE cols without guards; we
-- follow the same pattern here (schema_migrations table prevents double-apply).

BEGIN;

ALTER TABLE papers ADD COLUMN abstract_source TEXT;

CREATE INDEX IF NOT EXISTS idx_papers_abstract_source ON papers(abstract_source);

COMMIT;

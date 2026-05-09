-- 010_enrichment_runs.sql
-- One row per cron cycle (or manual run). Lets us answer:
--   - "When did the cron last succeed?"
--   - "Did the count of papers_w_abstract increase?"
--   - "Which step failed last night at 03:00?"
--
-- Populated by services/evidence-pipeline/scripts/nightly-enrichment.sh:
--   * INSERT a row at cycle start (status='running').
--   * UPDATE on cycle finish — fill finished_at, status, the delta columns,
--     and the per-step counts.
--
-- Status values: 'running' | 'success' | 'failed'.

BEGIN;

CREATE TABLE IF NOT EXISTS enrichment_runs (
  id                       INTEGER PRIMARY KEY,
  started_at               TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at              TEXT,
  status                   TEXT NOT NULL DEFAULT 'running',  -- running | success | failed
  trigger                  TEXT NOT NULL DEFAULT 'launchd',  -- launchd | manual
  -- Snapshot at cycle start
  papers_w_abstract_start  INTEGER,
  paper_indications_start  INTEGER,
  trial_indications_start  INTEGER,
  protocols_start          INTEGER,
  paper_trial_links_start  INTEGER,
  trials_start             INTEGER,
  -- Snapshot at cycle end
  papers_w_abstract_end    INTEGER,
  paper_indications_end    INTEGER,
  trial_indications_end    INTEGER,
  protocols_end            INTEGER,
  paper_trial_links_end    INTEGER,
  trials_end               INTEGER,
  -- Free-form notes (failed step name, error message, etc.)
  notes                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_enrichment_runs_started   ON enrichment_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_runs_status    ON enrichment_runs(status);

COMMIT;

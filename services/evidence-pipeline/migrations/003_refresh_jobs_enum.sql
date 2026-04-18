-- 003_refresh_jobs_enum.sql
-- Widens the refresh_jobs.status enum to match spec §3 (adds 'succeeded',
-- 'rate_limited', 'budget_blocked'; removes 'done' which is now 'succeeded').
-- Also adds 'apify_scholar' to literature_watch.source per spec §3.
--
-- SQLite cannot ALTER CHECK constraints in place. We use the standard
-- create-copy-drop-rename workaround inside a single transaction so the
-- DB is never left in a partial state.

BEGIN;

-- ── refresh_jobs ─────────────────────────────────────────────────────────────

CREATE TABLE refresh_jobs_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id         TEXT,
    requested_by        TEXT,
    source              TEXT,
    started_at          TIMESTAMP,
    finished_at         TIMESTAMP,
    new_papers_count    INTEGER DEFAULT 0,
    cost_usd            REAL DEFAULT 0,
    status              TEXT CHECK(status IN (
                            'queued','running','succeeded','failed',
                            'rate_limited','budget_blocked'
                        )) DEFAULT 'queued'
);

-- Copy all rows, mapping legacy 'done' -> 'succeeded'.
INSERT INTO refresh_jobs_new
    (id, protocol_id, requested_by, source,
     started_at, finished_at, new_papers_count, cost_usd, status)
SELECT
    id, protocol_id, requested_by, source,
    started_at, finished_at, new_papers_count, cost_usd,
    CASE status WHEN 'done' THEN 'succeeded' ELSE status END
FROM refresh_jobs;

DROP TABLE refresh_jobs;
ALTER TABLE refresh_jobs_new RENAME TO refresh_jobs;

-- Recreate index dropped with the old table.
CREATE INDEX IF NOT EXISTS idx_rj_protocol ON refresh_jobs(protocol_id, started_at DESC);


-- ── literature_watch.source ───────────────────────────────────────────────────
-- Add 'apify_scholar' alongside existing 'apify'.
-- Same workaround required — SQLite cannot ALTER a CHECK constraint.

CREATE TABLE literature_watch_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id     TEXT NOT NULL,
    pmid            TEXT,
    doi             TEXT,
    title           TEXT,
    authors         TEXT,
    year            INTEGER,
    journal         TEXT,
    citation_count  INTEGER DEFAULT 0,
    source          TEXT CHECK(source IN ('pubmed','consensus','apify','apify_scholar')),
    first_seen_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     TIMESTAMP,
    reviewer_id     TEXT,
    verdict         TEXT CHECK(verdict IN ('relevant','not-relevant','pending','promoted')) DEFAULT 'pending',
    UNIQUE(protocol_id, pmid)
);

INSERT INTO literature_watch_new
    (id, protocol_id, pmid, doi, title, authors, year, journal,
     citation_count, source, first_seen_at, reviewed_at, reviewer_id, verdict)
SELECT
    id, protocol_id, pmid, doi, title, authors, year, journal,
    citation_count, source, first_seen_at, reviewed_at, reviewer_id, verdict
FROM literature_watch;

DROP TABLE literature_watch;
ALTER TABLE literature_watch_new RENAME TO literature_watch;

-- Recreate indices dropped with the old table.
CREATE INDEX IF NOT EXISTS idx_lw_protocol ON literature_watch(protocol_id);
CREATE INDEX IF NOT EXISTS idx_lw_verdict  ON literature_watch(verdict);


-- ── schema ledger ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO schema_migrations (filename) VALUES ('003_refresh_jobs_enum.sql');

COMMIT;

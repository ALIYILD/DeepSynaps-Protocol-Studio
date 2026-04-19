-- 002_literature_watch.sql
-- PR #1 of the Live Literature Watch spec (see docs/SPEC-live-literature-watch.md §3).
-- Creates the delta layer that sits on top of the existing `papers`/`trials` tables
-- and records new PubMed (and later Consensus/Apify) results per-protocol for
-- clinician review.
--
-- Safe to re-run: every statement is guarded by IF NOT EXISTS. Idempotency is
-- enforced at the runner level via schema_migrations, but we also guard here so
-- a hand-run does not blow up an existing DB.

BEGIN;

CREATE TABLE IF NOT EXISTS literature_watch (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id     TEXT NOT NULL,
    pmid            TEXT,
    doi             TEXT,
    title           TEXT,
    authors         TEXT,               -- JSON array of author strings
    year            INTEGER,
    journal         TEXT,
    citation_count  INTEGER DEFAULT 0,
    source          TEXT CHECK(source IN ('pubmed','consensus','apify')),
    first_seen_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     TIMESTAMP,
    reviewer_id     TEXT,
    verdict         TEXT CHECK(verdict IN ('relevant','not-relevant','pending','promoted')) DEFAULT 'pending',
    UNIQUE(protocol_id, pmid)
);

CREATE TABLE IF NOT EXISTS refresh_jobs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id         TEXT,
    requested_by        TEXT,
    source              TEXT,
    started_at          TIMESTAMP,
    finished_at         TIMESTAMP,
    new_papers_count    INTEGER DEFAULT 0,
    cost_usd            REAL DEFAULT 0,
    status              TEXT CHECK(status IN ('queued','running','done','failed')) DEFAULT 'queued'
);

CREATE INDEX IF NOT EXISTS idx_lw_protocol ON literature_watch(protocol_id);
CREATE INDEX IF NOT EXISTS idx_lw_verdict  ON literature_watch(verdict);
CREATE INDEX IF NOT EXISTS idx_rj_protocol ON refresh_jobs(protocol_id, started_at DESC);

COMMIT;

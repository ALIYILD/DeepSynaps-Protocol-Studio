-- 009_paper_trial_links.sql
-- Bridges the papers corpus to the trials corpus via NCT IDs that appear in
-- paper abstracts (typically a "registered as NCT01234567" sentence in the
-- methods or abstract). Once populated, the API can answer "what papers
-- report on this trial?" and "what trial protocol does this paper draw on?"
--
-- nct_id is duplicated outside the FK so we can preserve a paper→NCT link
-- even when the trials table doesn't have that NCT yet (CTGOV ingest is
-- separate from paper enrichment).

BEGIN;

CREATE TABLE IF NOT EXISTS paper_trial_links (
  paper_id   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  trial_id   INTEGER REFERENCES trials(id) ON DELETE SET NULL,
  nct_id     TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'paper_abstract_nct_regex',
  found_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (paper_id, nct_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_trial_links_trial   ON paper_trial_links(trial_id);
CREATE INDEX IF NOT EXISTS idx_paper_trial_links_nct     ON paper_trial_links(nct_id);
CREATE INDEX IF NOT EXISTS idx_paper_trial_links_paper   ON paper_trial_links(paper_id);

COMMIT;

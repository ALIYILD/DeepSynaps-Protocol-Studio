-- DeepSynaps Studio evidence DB
-- SQLite. One DB, multiple sources, dedup by DOI/PMID/NCT.
-- WAL mode for concurrent reads during ingestion.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Taxonomy of protocol indications (e.g. dbs_parkinson, rtms_mdd).
CREATE TABLE IF NOT EXISTS indications (
  id              INTEGER PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  label           TEXT NOT NULL,
  modality        TEXT NOT NULL,         -- dbs, vns, scs, rtms, tdcs, mrgfus, ...
  condition       TEXT NOT NULL,         -- free text
  evidence_grade  TEXT,                  -- A/B/C/D/E informed estimate from the matrix
  regulatory      TEXT,
  notes           TEXT
);

-- Papers (journal articles, preprints, meta-analyses).
CREATE TABLE IF NOT EXISTS papers (
  id              INTEGER PRIMARY KEY,
  pmid            TEXT UNIQUE,
  doi             TEXT UNIQUE,
  openalex_id     TEXT UNIQUE,
  europepmc_id    TEXT,
  title           TEXT,
  abstract        TEXT,
  year            INTEGER,
  journal         TEXT,
  authors_json    TEXT,                  -- JSON list
  pub_types_json  TEXT,                  -- JSON list: "Randomized Controlled Trial" etc.
  cited_by_count  INTEGER,
  is_oa           INTEGER,               -- 0/1, populated by unpaywall
  oa_url          TEXT,                  -- PDF or landing page
  sources_json    TEXT,                  -- JSON list of source tags: ["pubmed","openalex",...]
  last_ingested   TEXT                   -- ISO timestamp
);

-- Many-to-many: papers can apply to multiple indications.
CREATE TABLE IF NOT EXISTS paper_indications (
  paper_id        INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  indication_id   INTEGER NOT NULL REFERENCES indications(id) ON DELETE CASCADE,
  relevance       REAL,                  -- 0-1, relevance rank within the indication query
  PRIMARY KEY (paper_id, indication_id)
);

-- ClinicalTrials.gov registered studies — best source for actual stim parameters.
CREATE TABLE IF NOT EXISTS trials (
  id              INTEGER PRIMARY KEY,
  nct_id          TEXT UNIQUE NOT NULL,
  title           TEXT,
  phase           TEXT,
  status          TEXT,
  enrollment      INTEGER,
  conditions_json TEXT,
  interventions_json TEXT,               -- includes stim parameters when present
  outcomes_json   TEXT,
  brief_summary   TEXT,
  start_date      TEXT,
  last_update     TEXT,
  study_type      TEXT,
  sponsor         TEXT,
  locations_json  TEXT,
  raw_json        TEXT
);

CREATE TABLE IF NOT EXISTS trial_indications (
  trial_id        INTEGER NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  indication_id   INTEGER NOT NULL REFERENCES indications(id) ON DELETE CASCADE,
  PRIMARY KEY (trial_id, indication_id)
);

-- FDA device records: PMA approvals, 510(k) clearances, HDE, de novo.
CREATE TABLE IF NOT EXISTS devices (
  id              INTEGER PRIMARY KEY,
  kind            TEXT NOT NULL,         -- pma | 510k | hde | denovo
  number          TEXT NOT NULL,         -- P130008, K201234, etc.
  applicant       TEXT,
  trade_name      TEXT,
  generic_name    TEXT,
  product_code    TEXT,
  decision_date   TEXT,
  advisory_committee TEXT,
  raw_json        TEXT,
  UNIQUE (kind, number, decision_date)
);

CREATE TABLE IF NOT EXISTS device_indications (
  device_id       INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  indication_id   INTEGER NOT NULL REFERENCES indications(id) ON DELETE CASCADE,
  PRIMARY KEY (device_id, indication_id)
);

-- FDA MAUDE adverse event reports (MDR). Signals safety context for a device.
CREATE TABLE IF NOT EXISTS adverse_events (
  id              INTEGER PRIMARY KEY,
  mdr_report_key  TEXT UNIQUE,
  device_brand    TEXT,
  device_generic  TEXT,
  event_type      TEXT,
  date_received   TEXT,
  patient_outcome_json TEXT,
  raw_json        TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_year        ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_is_oa       ON papers(is_oa);
CREATE INDEX IF NOT EXISTS idx_trials_status      ON trials(status);
CREATE INDEX IF NOT EXISTS idx_devices_applicant  ON devices(applicant);
CREATE INDEX IF NOT EXISTS idx_devices_kind       ON devices(kind);

-- Full-text index on paper title + abstract.
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
  title, abstract, content='papers', content_rowid='id', tokenize='porter'
);
CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.id, new.title, new.abstract);
END;
CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES('delete', old.id, old.title, old.abstract);
END;
CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES('delete', old.id, old.title, old.abstract);
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.id, new.title, new.abstract);
END;

-- Full-text index on trial summaries.
CREATE VIRTUAL TABLE IF NOT EXISTS trials_fts USING fts5(
  title, brief_summary, content='trials', content_rowid='id', tokenize='porter'
);
CREATE TRIGGER IF NOT EXISTS trials_ai AFTER INSERT ON trials BEGIN
  INSERT INTO trials_fts(rowid, title, brief_summary) VALUES (new.id, new.title, new.brief_summary);
END;

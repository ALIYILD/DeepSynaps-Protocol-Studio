-- 006_protocols_table.sql
-- Materialises the structured-protocol table that extract_protocols.py writes
-- into. The script also creates this idempotently, but we want the schema to
-- live in the migration set so a fresh DB has the table even before the
-- extractor runs (the API and MCP can then issue zero-row queries instead of
-- failing with "no such table").
--
-- Source-of-truth: services/evidence-pipeline/extract_protocols.py (SCHEMA constant).
-- Keep the two in sync.

BEGIN;

CREATE TABLE IF NOT EXISTS protocols (
  id                    INTEGER PRIMARY KEY,
  indication_id         INTEGER REFERENCES indications(id) ON DELETE CASCADE,
  source_type           TEXT NOT NULL,          -- ctgov | fda_pma | fda_510k | fda_hde
  source_id             TEXT NOT NULL,          -- NCT id or FDA number
  arm_label             TEXT,
  modality              TEXT,
  target_anatomy        TEXT,
  waveform              TEXT,
  frequency_hz          REAL,
  frequency_hz_max      REAL,
  pulse_width_us        REAL,
  amplitude_mA          REAL,
  amplitude_V           REAL,
  motor_threshold_pct   REAL,
  pulses_per_session    INTEGER,
  session_duration_min  REAL,
  sessions_per_week     INTEGER,
  total_sessions        INTEGER,
  total_pulses          INTEGER,
  paired_behavior       TEXT,
  raw_text              TEXT,
  confidence            TEXT,                   -- high | medium | low
  notes                 TEXT,
  UNIQUE (source_type, source_id, arm_label)
);

CREATE INDEX IF NOT EXISTS idx_protocols_indication ON protocols(indication_id);
CREATE INDEX IF NOT EXISTS idx_protocols_source     ON protocols(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_protocols_modality   ON protocols(modality);
CREATE INDEX IF NOT EXISTS idx_protocols_confidence ON protocols(confidence);

COMMIT;

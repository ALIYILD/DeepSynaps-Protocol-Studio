-- 007_device_adverse_events.sql
-- Adds a join table linking accepted device rows to MAUDE adverse-event
-- reports.  The adverse_events table already exists (schema.sql) with a
-- UNIQUE constraint on mdr_report_key, so this migration only adds the
-- many-to-many bridge and the supporting index.
--
-- Rationale for a separate join table (not a device_id FK on adverse_events):
--   • A single MAUDE report may reference multiple branded devices.
--   • We ingest MAUDE by brand/generic name; the matching back to device rows
--     is fuzzy/post-hoc and can be updated without touching the event row.
--   • Keeping adverse_events device-agnostic lets ingest_maude.py run
--     independently of the devices table and avoids FK violations when a
--     report pre-dates a device row.
--
-- Idempotency: run-migrations.sh tracks applied files in schema_migrations.

BEGIN;

CREATE TABLE IF NOT EXISTS device_adverse_events (
  device_id        INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  adverse_event_id INTEGER NOT NULL REFERENCES adverse_events(id) ON DELETE CASCADE,
  match_method     TEXT,   -- 'brand_name' | 'generic_name' | 'manual'
  PRIMARY KEY (device_id, adverse_event_id)
);

CREATE INDEX IF NOT EXISTS idx_dae_device   ON device_adverse_events (device_id);
CREATE INDEX IF NOT EXISTS idx_dae_event    ON device_adverse_events (adverse_event_id);

COMMIT;

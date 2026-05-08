-- 005_devices_curation_status.sql
-- Adds curation flags to the devices table so the FDA ingest record can be
-- tagged accept / reject / review without losing the row. Companion to
-- fda_curation_log.md and fda_curation_fixture.sql.
--
-- Why we keep rejected rows: the openFDA dataset evolves; a device that is
-- not neuromodulation today (e.g. an Insightec MR pelvic coil) may resurface
-- if the applicant filter changes. Persisting the rejection reason saves us
-- from re-litigating the same false positive on every re-ingest.
--
-- Idempotency: handled by run-migrations.sh via schema_migrations. Each ADD
-- COLUMN runs once.

BEGIN;

ALTER TABLE devices ADD COLUMN curation_status TEXT;   -- NULL | accept | reject | review
ALTER TABLE devices ADD COLUMN curation_reason TEXT;   -- short free-form note

CREATE INDEX IF NOT EXISTS idx_devices_curation_status
  ON devices (curation_status);

COMMIT;

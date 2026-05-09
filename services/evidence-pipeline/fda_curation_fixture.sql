-- fda_curation_fixture.sql
-- Idempotent application of the 2026-05-08 FDA device curation pass.
-- Source of truth: fda_curation_log.md (39 rows reviewed).
--
-- Run AFTER:
--   * 005_devices_curation_status.sql (adds curation_status / curation_reason)
--   * indications_seed.py has populated `indications` (rtms_mdd, dtms_ocd, ...)
--
-- Identifies devices by their (kind, number) — stable across re-ingests.
-- All inserts into device_indications use INSERT OR IGNORE so reruns are safe.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Mark the four false-positive Insightec rows as rejected.
-- -----------------------------------------------------------------------------
UPDATE devices
   SET curation_status = 'reject',
       curation_reason = 'MRgFUS prostate ablation (PLP); not neuromodulation'
 WHERE kind = '510k' AND number IN ('K231378', 'K212150');

UPDATE devices
   SET curation_status = 'reject',
       curation_reason = 'MRI receive coil for FUS pelvic/breast system (MOS); not a stimulator'
 WHERE kind = '510k' AND number IN ('K071966', 'K061715');

-- -----------------------------------------------------------------------------
-- 2. Mark every OBP TMS device as accepted.
-- -----------------------------------------------------------------------------
UPDATE devices
   SET curation_status = 'accept',
       curation_reason = COALESCE(curation_reason,
                                  'OBP transcranial magnetic stimulator')
 WHERE product_code = 'OBP'
   AND (curation_status IS NULL OR curation_status = 'accept');

-- -----------------------------------------------------------------------------
-- 3. Link every accepted TMS device to rtms_mdd.
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'rtms_mdd'
 WHERE d.curation_status = 'accept'
   AND d.product_code = 'OBP';

-- -----------------------------------------------------------------------------
-- 4. Link the BrainsWay deep-TMS family (K173540 onward) to dtms_ocd.
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'dtms_ocd'
 WHERE d.curation_status = 'accept'
   AND d.product_code = 'OBP'
   AND d.kind = '510k'
   AND d.number IN (
     'K173540',  -- 2018, first OCD clearance
     'K203735',  -- 2021
     'K210201',  -- 2021
     'K220819',  -- 2022
     'K222196',  -- 2024
     'K251391',  -- 2025
     'K251449'   -- 2025
   );

COMMIT;

-- -----------------------------------------------------------------------------
-- Sanity check (run manually after applying):
--
--   SELECT curation_status, COUNT(*) FROM devices GROUP BY curation_status;
--   -- expect: accept=35, reject=4, NULL=0
--
--   SELECT i.slug, COUNT(*) AS n
--     FROM device_indications di
--     JOIN indications i ON i.id = di.indication_id
--    GROUP BY i.slug;
--   -- expect: rtms_mdd=35, dtms_ocd=7
-- -----------------------------------------------------------------------------

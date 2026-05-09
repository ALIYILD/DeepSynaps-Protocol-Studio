-- fda_curation_oyj_qbv_cleanup.sql
-- Removes the 9 false-positive `mrgfus_essential_tremor` device_indications rows
-- pointing at OYJ (DNA Genotek / Ancestry oral-fluid kits) and QBV (Miracell
-- bone-marrow / PRP concentration systems). Neither is a neuromodulation
-- device; root cause documented in fda_curation_log_2026-05-09.md.
--
-- Idempotent: re-running is a no-op once the rows are gone / devices flipped.

BEGIN;

-- Drop the indication links first.
DELETE FROM device_indications
WHERE device_id IN (
    SELECT id FROM devices
    WHERE kind = '510k'
      AND product_code IN ('OYJ', 'QBV')
);

-- Flip the underlying devices to curation_status='reject' so they stop
-- counting toward any future modality. Leave the rows themselves so the
-- raw_json remains audit-traceable; the active mappings are gone.
UPDATE devices
SET curation_status = 'reject',
    curation_reason = 'openFDA OYJ = oral-fluid DNA collection (DNA Genotek / Ancestry); QBV = bone-marrow / PRP concentration (Miracell). Neither is MRgFUS Neuro; mis-routed via indications_seed.MODALITY_PRODUCT_CODES["MRgFUS"]. See fda_curation_log_2026-05-09.md.'
WHERE kind = '510k'
  AND product_code IN ('OYJ', 'QBV')
  AND (curation_status IS NULL OR curation_status = 'accept');

COMMIT;

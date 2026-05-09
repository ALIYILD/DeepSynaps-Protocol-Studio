-- device_indications_mappings.sql
-- Idempotent product-code-driven mappings for device_indications.
-- Generated: 2026-05-09
--
-- Run ORDER:
--   1. fda_pma_ingest.py (inserts PMA rows for MHY / LYJ / LGW / MNQ).
--   2. This file (links all devices — existing 510(k)s AND newly ingested PMAs
--      — to the correct indication slugs by product_code).
--
-- SAFE TO RE-RUN: every INSERT uses INSERT OR IGNORE on the composite PK
-- (device_id, indication_id).  No rows are deleted.
--
-- Product-code → indication mapping rationale:
--
--   OBP  (Transcranial Magnetic Stimulator, Class II 510(k))
--        → rtms_mdd  (all OBP-cleared rTMS systems have an MDD indication)
--        Brainsway OBP devices K173540 onward also map to dtms_ocd, but
--        that finer-grained mapping is already handled by fda_curation_fixture.sql.
--        This file does not duplicate that work — it only adds the generic
--        rtms_mdd link where it is currently missing.
--
--   MHY  (Implanted DBS Stimulator, Class III PMA)
--        → dbs_parkinson, dbs_essential_tremor, dbs_ocd, dbs_epilepsy_ant
--        Medtronic Activa (P960009 / P960010), St. Jude Medical (Abbott) Infinity
--        (P960009/S203 series), and Boston Scientific Vercise (P130009) are all
--        cleared or approved across all four DBS indications.
--        DBS-OCD is technically an HDE, but the MHY device itself is the same
--        stimulator; mapping it to dbs_ocd is correct per FDA approval text.
--
--   LYJ  (Implanted VNS Generator For Epilepsy, Class III PMA)
--        → vns_epilepsy, vns_depression
--        LivaNova/Cyberonics VNS Pulse / AspireHC / SenTiva devices (P970003
--        and subsequent PMAs) are labelled for both epilepsy (1997) and
--        treatment-resistant depression (2005).
--
--   LGW  (Totally Implanted SCS For Pain Relief, Class III PMA)
--        → scs_fbss, scs_pdn
--        All major SCS PMAs (Medtronic RestoreUltra / SureScan, Abbott Proclaim,
--        Boston Scientific Spectra WaveWriter, Nevro HFX) cover FBSS.
--        PDN-specific approval (Nevro HFX, 2021) is a supplement to an LGW PMA;
--        mapping all LGW devices to scs_pdn is slightly over-inclusive but
--        defensible because PDN pain and FBSS pain share the same LGW-cleared
--        device family.  If a finer split is needed, add a Nevro-only filter.
--
--   MNQ  (Implanted Hypoglossal Nerve Stimulator For Apnea, Class III PMA)
--        → hns_osa
--        Inspire Medical Systems is the sole MNQ PMA holder as of 2026.
--
--   OYJ  (openFDA: DNA saliva collection kits — NOT MRgFUS brain devices)
--   QBV  (openFDA: bone marrow/PRP concentration — NOT MRgFUS brain devices)
--        These codes are intentionally NOT mapped here.  The 9 existing
--        device_indications rows linking OYJ/QBV 510(k) devices to
--        mrgfus_essential_tremor are data errors; they cannot be corrected
--        without an approved delete (policy: never drop rows without user approval).
--        Flag: pending curated Insightec Exablate Neuro product-code verification.
--
-- Columns referenced:
--   devices.product_code   — populated on ingest from openFDA field product_code.
--   devices.kind           — 'pma' | '510k' | 'hde' | 'denovo'.
--   devices.curation_status — 'accept' | 'reject' | NULL.
--                             We only map rows where status IS NULL OR = 'accept'.
--   indications.slug       — stable machine key, never renamed.

BEGIN;

-- =============================================================================
-- 1.  OBP (rTMS) -> rtms_mdd
--     Already applied by fda_curation_fixture.sql but idempotently safe here.
--     This catches any OBP 510(k) that was ingested AFTER the curation fixture
--     ran (e.g. a future re-ingest that adds a new clearance).
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'rtms_mdd'
 WHERE d.product_code = 'OBP'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 2.  MHY (DBS) -> dbs_parkinson
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'dbs_parkinson'
 WHERE d.product_code = 'MHY'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 3.  MHY (DBS) -> dbs_essential_tremor
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'dbs_essential_tremor'
 WHERE d.product_code = 'MHY'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 4.  MHY (DBS) -> dbs_ocd
--     The Medtronic DBS HDE for OCD (H050003) uses the same Activa stimulator
--     (product_code MHY) as the PMA devices.  Map it too.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'dbs_ocd'
 WHERE d.product_code = 'MHY'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 5.  MHY (DBS) -> dbs_epilepsy_ant
--     The Medtronic Activa RC ANT (P060017) expanded label, FDA-approved 2018.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'dbs_epilepsy_ant'
 WHERE d.product_code = 'MHY'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 6.  LYJ (VNS) -> vns_epilepsy
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'vns_epilepsy'
 WHERE d.product_code = 'LYJ'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 7.  LYJ (VNS) -> vns_depression
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'vns_depression'
 WHERE d.product_code = 'LYJ'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 8.  LGW (SCS) -> scs_fbss
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'scs_fbss'
 WHERE d.product_code = 'LGW'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 9.  LGW (SCS) -> scs_pdn
--     Over-inclusive: all LGW PMAs map here.  Nevro-specific supplement
--     (PDN, 2021) is a superset-safe mapping.  Refine if needed.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'scs_pdn'
 WHERE d.product_code = 'LGW'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 10. MNQ (HNS) -> hns_osa
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'hns_osa'
 WHERE d.product_code = 'MNQ'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 11. PFN (RNS) -> rns_epilepsy
--     NeuroPace RNS System (P100026 + supplements). Sole PFN PMA holder.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'rns_epilepsy'
 WHERE d.product_code = 'PFN'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 12. PMP (DRG) -> drg_crps
--     Abbott Proclaim DRG (P150004 + supplements; original applicant
--     St. Jude Medical pre-acquisition).
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'drg_crps'
 WHERE d.product_code = 'PMP'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 13. EZW (SNM) -> snm_bladder_bowel
--     Medtronic InterStim (P970004) + Axonics R20/R15 (P190006). Both
--     applicants share EZW for sacral neuromodulation (urinary urge
--     incontinence, urinary retention, fecal incontinence).
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'snm_bladder_bowel'
 WHERE d.product_code = 'EZW'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 14. POH (MRgFUS) -> mrgfus_essential_tremor
--     Insightec Exablate Neuro 4000 (P150038 + supplements). Replaces the
--     wrong OYJ/QBV mapping cleaned up in fda_curation_oyj_qbv_cleanup.sql.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'mrgfus_essential_tremor'
 WHERE d.product_code = 'POH'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

-- =============================================================================
-- 15. QPY (Vivistim Paired VNS) -> vns_stroke_rehab
--     MicroTransponder / Mobia Medical Vivistim (P210007). Distinct from
--     LYJ (epilepsy/depression VNS) family.
-- =============================================================================

INSERT OR IGNORE INTO device_indications (device_id, indication_id)
SELECT d.id, i.id
  FROM devices d
  JOIN indications i ON i.slug = 'vns_stroke_rehab'
 WHERE d.product_code = 'QPY'
   AND (d.curation_status IS NULL OR d.curation_status = 'accept');

COMMIT;

-- =============================================================================
-- Sanity checks (run manually after applying):
--
--   SELECT i.slug, COUNT(di.device_id) AS n
--     FROM indications i
--     LEFT JOIN device_indications di ON di.indication_id = i.id
--    GROUP BY i.slug
--    ORDER BY n DESC;
--   -- After fda_pma_ingest.py + this file, expect:
--   --   rtms_mdd          >= 35  (existing OBP 510(k)s)
--   --   dtms_ocd          >= 7   (BrainsWay subset from curation_fixture)
--   --   dbs_parkinson     >= N   (MHY PMA count from ingest)
--   --   dbs_essential_tremor  same N
--   --   dbs_ocd           same N
--   --   dbs_epilepsy_ant  same N
--   --   vns_epilepsy      >= M   (LYJ PMA count)
--   --   vns_depression    >= M
--   --   scs_fbss          >= P   (LGW PMA count)
--   --   scs_pdn           >= P
--   --   hns_osa           >= Q   (MNQ PMA count)
--
--   SELECT d.product_code, d.kind, COUNT(*) FROM devices d GROUP BY d.product_code, d.kind;
--   -- Expect MHY/pma, LYJ/pma, LGW/pma, MNQ/pma rows to be non-zero post-ingest.
-- =============================================================================

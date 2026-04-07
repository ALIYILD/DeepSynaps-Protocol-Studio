# DeepSynaps Studio — QA Validation Report

**Date:** 2026-04-07 10:42
**Result:** 53 passed, 0 failed, 0 warnings


--- Schema Checks ---
  ✅ PASS: 12 tables present
  ✅ PASS: Evidence_Levels has 4 records
  ✅ PASS: Governance_Rules has 12 records
  ✅ PASS: Modalities has 16 records
  ✅ PASS: Conditions has 31 records
  ✅ PASS: Brain_Regions has 46 records
  ✅ PASS: qEEG_Biomarkers has 7 records
  ✅ PASS: qEEG_Condition_Map has 22 records

--- Modality Checks ---
  ✅ PASS: MOD-013 (tACS) exists
  ✅ PASS: MOD-014 (PEMF) exists
  ✅ PASS: MOD-015 (LIFU/tFUS) exists
  ✅ PASS: MOD-016 (tRNS) exists
  ✅ PASS: tACS marked as investigational
  ✅ PASS: PEMF marked as investigational
  ✅ PASS: LIFU / tFUS marked as investigational
  ✅ PASS: tRNS marked as investigational

--- Protocol Checks ---
  ✅ PASS: Protocols imported
  ✅ PASS: All protocols are Pending (not auto-published)
  ✅ PASS: No protocols without evidence level
  ✅ PASS: Evidence grades are conservative for investigational
  ✅ PASS: Investigational modalities have EV-C or EV-D only
  ✅ PASS: All investigational modality protocols have GOV-003 flag
  ✅ PASS: All protocols have source citations

--- Regulatory Terminology Checks ---
  ✅ PASS: Flow FL-100 is only PMA-approved tDCS device (GOV-009)
  ✅ PASS: Protocol PROT-022 Breakthrough noted as designation only

--- Neurofeedback ADHD Evidence Lock ---
  ✅ PASS: No neurofeedback protocols in import (neurofeedback data in separate pipeline)

--- Condition Checks ---
  ✅ PASS: New conditions routed through review queue
  ✅ PASS: New condition 'Schizophrenia' exists
  ✅ PASS: New condition 'Disorders of Consciousness' exists
  ✅ PASS: New condition 'Mild Cognitive Impairment' exists
  ✅ PASS: New condition 'Multiple Sclerosis' exists
  ✅ PASS: New condition 'Fibromyalgia' exists
  ✅ PASS: New condition 'Cognitive Enhancement' exists
  ✅ PASS: New condition 'Inflammatory' exists
  ✅ PASS: New condition 'Motor / Perceptual' exists
  ✅ PASS: New condition 'Tourette' exists
  ✅ PASS: New condition 'Vascular Cognitive' exists
  ✅ PASS: New condition 'MS-related' exists

--- Brain Regions & qEEG Checks ---
  ✅ PASS: 46 brain regions populated
  ✅ PASS: Brain regions have EEG positions
  ✅ PASS: Brain regions have FNON network
  ✅ PASS: 22 qEEG condition maps populated
  ✅ PASS: 7 qEEG biomarker bands populated

--- Source Library Checks ---
  ✅ PASS: 30-50 high-quality sources
  ✅ PASS: Sources have DOI URLs

--- Device Checks ---
  ✅ PASS: Flow FL-100 in device catalog
  ✅ PASS: NEUROLITH in device catalog
  ✅ PASS: Alpha-Stim in device catalog
  ✅ PASS: Medtronic DBS in device catalog

--- Data Integrity Checks ---
  ✅ PASS: No duplicate protocol IDs
  ✅ PASS: No duplicate condition IDs
  ✅ PASS: All protocol condition IDs are valid

--- Total Record Count ---
  ✅ PASS: Total records = 332

## Summary
- Tests passed: 53
- Tests failed: 0
- Warnings: 0

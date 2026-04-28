# MRI Clinical Workbench — Known Limitations

**Version:** 1.0  
**Date:** 2026-04-28  
**Status:** Engineering-validated; pending clinical UAT

---

## 1. Decision-Support Only

The MRI Clinical Workbench is **not a medical device** and does **not produce diagnostic radiology reports**. All outputs are decision-support suggestions that require clinician review before use in patient care.

## 2. De-identification is Best-Effort

The PHI / DICOM De-identification Audit panel uses heuristics, not a full DICOM parser:
- **Filename scan:** Checks for keywords (patient, name, DOB, MRN, SSN, NHS).
- **DICOM tag list:** Documents standard tags that *should* be removed/retained based on profile.
- **Burned-in annotations:** NOT automatically detected. A warning is always shown: "Manual visual inspection is required."

> ⚠️ **A qualified clinical engineer must review the source DICOM and exported package before sharing outside the treating institution.**

## 3. Registration QA Uses Stored Metadata

Registration confidence, atlas overlap Dice, and coordinate uncertainty are read from the analysis row's JSON columns. If the MRI pipeline did not populate these fields, the panel shows "unknown".

- No real registration algorithm runs at query time.
- Target drift is computed only when both MNI and patient-native coordinates are present.

## 4. Safety Cockpit Heuristics

SNR, CNR, and motion thresholds are rule-based:
- SNR ≥ 50 → pass; SNR < 50 → warn
- CNR ≥ 2.5 → pass; CNR < 2.5 → warn
- Motion FD ≤ 0.5 mm → pass; FD > 0.5 mm → warn

These thresholds are conservative and may not match every scanner or protocol. Clinician judgement overrides.

## 5. Claim Governance Blocklist

The blocklist uses regex patterns for known diagnostic wording. Novel phrasing may evade detection:
- Covered: "diagnose", "diagnostic", "lesion detected", "tumour detected", "stroke detected", "no abnormality", "safe to treat", "guaranteed response"
- Not covered: Creative paraphrases, misspellings, non-English terms

Clinician review is the second safety layer.

## 6. No Real-Time Radiology Review Integration

When `RADIOLOGY_REVIEW_REQUIRED` is flagged, the system blocks approval and export but does **not**:
- Notify a radiologist automatically
- Create a ticket in a PACS/RIS system
- Schedule a follow-up

Radiology review must be coordinated through existing clinical workflows external to DeepSynaps.

## 7. Export Package is Static

The BIDS export is a point-in-time snapshot. If the analysis is later amended or re-reviewed, the exported package does not auto-update. A new export must be generated.

## 8. Atlas Limitations

The default template space is MNI152. If the patient is a child, elderly, or has significant atrophy, MNI152-based coordinates may be less accurate. The atlas model card warns: "MRI spatial context incomplete — interpret cautiously."

## 9. Demo Mode is Synthetic

Demo mode (`MRI_DEMO_MODE=1`) loads a canned report. The safety cockpit, red flags, and registration QA are computed from this synthetic data. Demo mode is for UI testing only — never use demo data for clinical decisions.

## 10. SQLite in Test / Development

The test suite uses SQLite. Production deployments use PostgreSQL with pgvector. Some migration behaviors differ between SQLite and PostgreSQL (e.g., `batch_alter_table` CircularDependencyError on SQLite is avoided by using `op.add_column`).

## 11. Browser Compatibility

The MRI viewer uses NiiVue (WebGL). Older browsers or devices without WebGL support will see a fallback placeholder.

---

## Feedback & Updates

Report new limitations to the engineering team. This document is updated after each hardening pass.

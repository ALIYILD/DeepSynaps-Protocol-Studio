# MRI Clinical Workbench — Hazard Log

**Version:** 1.0  
**Date:** 2026-04-28

---

## Hazard Log Format

| ID | Hazard | Cause | Effect | Severity | Likelihood | Risk | Mitigation | Residual Risk | Status |
|---|---|---|---|---|---|---|---|---|---|

Severity: Catastrophic / Serious / Moderate / Minor  
Likelihood: Frequent / Probable / Occasional / Remote / Improbable  
Risk = Severity × Likelihood (accept only Low or mitigated to Low)

---

## Hazards

### H-001: Incorrect stimulation target due to registration error
- **Cause:** Poor native-to-MNI registration; motion artifact; segmentation failure.
- **Effect:** Wrong anatomical target selected for neuromodulation.
- **Severity:** Serious
- **Likelihood:** Occasional
- **Risk:** High
- **Mitigation:** Registration QA panel computes confidence score, atlas overlap Dice, coordinate uncertainty. Target finalisation is blocked if confidence is low or drift > 10 mm.
- **Residual Risk:** Moderate — clinician must still visually verify target on native scan.
- **Status:** Open — pending UAT validation

### H-002: PHI leak in exported BIDS package
- **Cause:** DICOM tags not fully redacted; burned-in annotations; filename contains patient name.
- **Effect:** Patient identity exposed in shared dataset.
- **Severity:** Serious
- **Likelihood:** Occasional
- **Risk:** High
- **Mitigation:** PHI audit panel scans filename heuristic, lists removed/retained DICOM tags, warns about burned-in annotations. Export filename is SHA256-pseudonymized. De-identification log included in package.
- **Residual Risk:** Low — manual visual inspection still required for burned-in annotations.
- **Status:** Open — pending UAT validation

### H-003: Diagnostic claim from AI report
- **Cause:** LLM generates wording like "MRI confirms ADHD" or "lesion detected".
- **Effect:** Clinician or patient interprets AI output as diagnostic.
- **Severity:** Serious
- **Likelihood:** Probable (without mitigation)
- **Risk:** High
- **Mitigation:** Claim governance engine uses regex blocklist for diagnostic patterns. BLOCKED claims are removed from patient-facing reports. All outputs carry "decision-support only" disclaimer.
- **Residual Risk:** Low — blocklist covers known patterns; clinician review adds second layer.
- **Status:** Open — pending UAT validation

### H-004: Unreviewed report exported and used clinically
- **Cause:** Clinician exports before completing review workflow.
- **Effect:** Unverified AI outputs influence patient care.
- **Severity:** Serious
- **Likelihood:** Occasional
- **Risk:** High
- **Mitigation:** Export gated behind APPROVED state + digital sign-off. UI disables BIDS button and shows tooltip explaining the gate. Audit trail logs every export.
- **Residual Risk:** Low — system enforces gate; admin override is logged.
- **Status:** Open — pending UAT validation

### H-005: Incidental finding not flagged for radiology review
- **Cause:** AI fails to detect incidental finding; QC pipeline misses flag.
- **Effect:** Potentially serious finding (e.g., mass, bleed) goes unreviewed.
- **Severity:** Catastrophic
- **Likelihood:** Remote
- **Risk:** High
- **Mitigation:** Safety cockpit checks `incidental.any_flagged`. If true, raises `RADIOLOGY_REVIEW_REQUIRED` red flag. Approval is blocked until flag is resolved. This does not replace a radiologist read.
- **Residual Risk:** Moderate — AI may still miss findings; clinical workflow should include radiologist review.
- **Status:** Open — pending UAT validation

### H-006: Missing metadata prevents safety checks
- **Cause:** Upload lacks required fields (age, sex, condition, scan parameters).
- **Effect:** Safety cockpit cannot compute SNR/CNR baselines; normative comparison invalid.
- **Severity:** Moderate
- **Likelihood:** Occasional
- **Risk:** Moderate
- **Mitigation:** Safety cockpit shows "Unknown" for missing metrics and warns. Analysis can still proceed with limited confidence. UI prompts for metadata during upload.
- **Residual Risk:** Low — clinician is informed of missing data.
- **Status:** Open — pending UAT validation

### H-007: Unsafe claim challenge not blocked
- **Cause:** New diagnostic wording pattern not in blocklist.
- **Effect:** Diagnostic claim reaches patient or clinician.
- **Severity:** Serious
- **Likelihood:** Remote
- **Risk:** Moderate
- **Mitigation:** Blocklist is extensible. Regex patterns cover "diagnose", "diagnostic", "lesion detected", "tumour detected", "stroke detected", "no abnormality", "safe to treat", "guaranteed response". Clinician review is second layer.
- **Residual Risk:** Low — regular blocklist reviews recommended.
- **Status:** Open — pending UAT validation

---

## Review Schedule

| Review | Date | Owner |
|---|---|---|
| Initial | 2026-04-28 | Engineering |
| UAT closure | TBD | Clinical Safety Officer |
| Post-deployment | +30 days | Clinical Safety Officer |

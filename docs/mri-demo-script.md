# MRI Clinical Workbench — Staging UAT Demo Script

**Version:** 1.0  
**Date:** 2026-04-28  
**Audience:** Clinical engineers, QA testers, regulatory reviewers

---

## Demo Environment

- URL: `https://deepsynaps-studio.fly.dev`
- Login: clinician demo token
- Feature flag: `_mriFeatureFlagEnabled()` must return `true`

---

## Scenario 1: Clean T1 MRI

**Setup:** Upload a well-formed DICOM zip with T1, good SNR (>50), no motion, clean registration.

**Steps:**
1. Navigate to **MRI Analyzer** page.
2. Upload `clean_t1_demo.zip` (simulated).
3. Select condition **MDD**, age 45, sex F.
4. Click **Analyze**.

**Expected Results:**
- Pipeline completes → state `SUCCESS`.
- **Safety Cockpit** shows:
  - Overall status: `MRI_VALID_FOR_REVIEW`
  - File type: ✅ PASS
  - De-identification: ✅ PASS
  - Scan type: ✅ T1 detected
  - SNR: ✅ PASS (>50)
  - CNR: ✅ PASS (>2.5)
  - Motion: ✅ PASS (<0.5 mm)
  - Registration: ✅ PASS (MNI)
- **Red Flags:** 0 flags.
- **Atlas Model Card:** MNI152, atlas version detected, registration confidence high.
- **Registration QA:**
  - Registration confidence: high
  - Atlas overlap: high
  - Target finalisation: **Allowed**
- **Target Planning Governance:** Cards show "Candidate target for clinician review" with evidence grade EV-B.
- **Clinician Review:** State `MRI_DRAFT_AI`.
- **Patient Report:** "Patient-facing report will be available after clinician approval."
- **Export:** BIDS button **disabled** (not approved/signed).

**Actions:**
1. Click **Transition to Needs Clinical Review**.
2. Review targets, then **Transition to Approved**.
3. Click **Sign Off**.

**Post-sign-off:**
- BIDS button **enabled**.
- Click **BIDS** → download zip.
- Verify zip contains:
  - `dataset_description.json`
  - `participants.tsv`
  - `participants.json`
  - `anat/sub-XXXX_desc-scan_metadata.json`
  - `anat/sub-XXXX_T1w.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-deidentification_log.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-qc_report.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-atlas_model_card.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-target_plan.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-ai_report.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-clinician_review.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-audit_trail.json`
  - `derivatives/deepsynaps/sub-XXXX_desc-audit_trail.tsv`

---

## Scenario 2: Poor-Quality Scan

**Setup:** Upload with low SNR (30), high motion (1.2 mm), poor CNR (1.8).

**Expected Results:**
- **Safety Cockpit:** Overall status `MRI_LIMITED_QUALITY`.
- **Red Flags:**
  - `SNR_LOW` — medium severity
  - `CNR_LOW` — medium severity
  - `MOTION_HIGH` — medium severity
- **Registration QA:** Registration confidence may be low; target finalisation may be blocked.
- **Export:** BIDS button disabled until approved/signed (if clinician chooses to proceed).

**Key Message:** System does not block analysis — it surfaces warnings. Clinician decides whether to proceed.

---

## Scenario 3: Radiology Review Required

**Setup:** Upload where QC indicates `incidental.any_flagged = true` (simulated incidental finding).

**Expected Results:**
- **Safety Cockpit:** Overall status `MRI_RADIOLOGY_REVIEW_REQUIRED`.
- **Red Flags:** `RADIOLOGY_REVIEW_REQUIRED` — high severity.
- **Clinician Review:** Transition to `MRI_APPROVED` is **blocked** with message: "Radiology review is required before final approval."
- **Export:** BIDS button disabled. Even if somehow approved, export blocked by unresolved radiology flag.

**Actions:**
1. Simulate radiologist review (external workflow).
2. Resolve red flag (manually mark resolved in test data).
3. Now transition to `MRI_APPROVED` succeeds.

---

## Scenario 4: Missing Metadata

**Setup:** Upload without age, sex, or condition specified.

**Expected Results:**
- **Safety Cockpit:**
  - SNR/CNR/Motion show "Unknown" with warn status.
  - Overall status: `MRI_LIMITED_QUALITY`.
- **Target Planning Governance:** Evidence grade may default to EV-C due to missing patient context.
- **Patient Report:** Placeholder shown.

**Key Message:** System handles missing data gracefully — never crashes, always informs.

---

## Scenario 5: Unsafe Claim Challenge

**Setup:** AI report contains wording like "MRI confirms ADHD" or "lesion detected".

**Expected Results:**
- Run **Claim Governance** (`POST /claim-governance`).
- **Findings:** Claim classified as `BLOCKED`.
- **Patient-facing report:** BLOCKED claim removed; softened language used.
- **Banned words:** None of "diagnose", "diagnostic", "lesion detected", "tumour detected", "stroke detected" appear in rendered HTML.

---

## Pass / Fail Criteria

| Criterion | Pass Condition |
|---|---|
| Safety cockpit renders | All 5 scenarios show correct status |
| Red flags accurate | Flags match scenario inputs |
| Atlas model card correct | Template space, atlas version displayed |
| Target governance renders | "Candidate target" wording present |
| Clinician review blocks | Radiology review blocks approval |
| Patient report gated | Only shown after approval |
| BIDS export gated | Only enabled after approval + sign-off |
| Export package complete | All 13 expected files present |
| PHI audit visible | Panel shows risk level, DICOM tags |
| Registration QA visible | Confidence, uncertainty, drift shown |

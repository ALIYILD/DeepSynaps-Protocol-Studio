# MRI Clinical Workbench — Clinical Safety Case

**Version:** 1.0  
**Date:** 2026-04-28  
**Scope:** MRI Analyzer (Clinical Portal) — migration 053 hardening pass

---

## 1. Purpose

This document provides the clinical safety justification for the MRI Clinical Workbench as deployed in the DeepSynaps Protocol Studio. It is intended for clinical engineers, regulatory reviewers, and UAT testers.

The MRI Workbench is a **decision-support tool only**. It is **not a medical device** and does **not produce diagnostic radiology reports**. All AI-generated outputs require clinician review before use in patient care.

---

## 2. Safety Objectives

| ID | Objective | Evidence |
|---|---|---|
| SO-1 | Prevent diagnostic claims from AI outputs | Claim governance engine blocks "diagnose", "lesion detected", "tumour detected", etc. |
| SO-2 | Ensure clinician review before clinical use | State machine: MRI_DRAFT_AI → review → MRI_APPROVED → sign-off |
| SO-3 | Flag poor-quality scans before targeting | Safety cockpit checks SNR, CNR, motion, registration |
| SO-4 | Require radiology review for incidental findings | Red flag `RADIOLOGY_REVIEW_REQUIRED` blocks approval |
| SO-5 | Protect patient identity in exports | SHA256 pseudonymization + DICOM tag redaction + PHI audit |
| SO-6 | Block target finalisation if registration is poor | Registration QA panel gates target finalisation |

---

## 3. Hazard Mitigations

### 3.1 Incorrect target coordinates
- **Hazard:** AI-suggested stimulation target is anatomically wrong due to poor registration.
- **Mitigation:** Registration QA panel shows confidence score, coordinate uncertainty, and atlas overlap. Target finalisation is blocked if confidence is low.

### 3.2 PHI leak in exported package
- **Hazard:** Patient-identifying information remains in DICOM tags or filename.
- **Mitigation:** PHI audit panel scans for filename PHI, lists removed/retained DICOM tags, warns about burned-in annotations, and pseudonymizes export filenames.

### 3.3 Unsafe diagnostic claim
- **Hazard:** AI report states "MRI confirms dementia" or similar diagnostic wording.
- **Mitigation:** Claim governance engine classifies claims as BLOCKED / INFERRED / OBSERVED. BLOCKED claims are stripped from patient-facing reports.

### 3.4 Unreviewed report used clinically
- **Hazard:** Clinician acts on AI report without reviewing it.
- **Mitigation:** Export is gated behind APPROVED + signed_off state. BIDS export button is disabled until sign-off.

### 3.5 Incidental finding missed
- **Hazard:** AI fails to flag an incidental finding requiring radiology review.
- **Mitigation:** Safety cockpit checks `incidental.any_flagged`. If true, red flag `RADIOLOGY_REVIEW_REQUIRED` is raised and approval is blocked.

---

## 4. State Machine

```
MRI_DRAFT_AI
    → MRI_NEEDS_CLINICAL_REVIEW
    → MRI_NEEDS_RADIOLOGY_REVIEW
        → MRI_REVIEWED_WITH_AMENDMENTS
            → MRI_APPROVED → sign-off → export allowed
            → MRI_REJECTED
```

**Constraints:**
- `MRI_APPROVED` is blocked if `RADIOLOGY_REVIEW_REQUIRED` red flag is unresolved.
- Export is blocked unless `report_state ∈ {MRI_APPROVED, MRI_REVIEWED_WITH_AMENDMENTS}` AND `signed_by IS NOT NULL`.

---

## 5. Export Gating

| Condition | Export Allowed | Reason |
|---|---|---|
| Report approved + signed | ✅ Yes | All gates passed |
| Report not approved | ❌ No | Clinician review incomplete |
| Not signed off | ❌ No | No digital sign-off |
| Radiology review unresolved | ❌ No | Safety flag active |

---

## 6. Responsibilities

| Role | Responsibility |
|---|---|
| Clinician | Review AI outputs, resolve red flags, sign off before export |
| Clinical Engineer | Verify DICOM de-identification, validate registration QA thresholds |
| System | Enforce state transitions, block exports, log audit trail |

---

## 7. References

- `mri_safety_engine.py` — Safety cockpit computation
- `mri_claim_governance.py` — Claim classification and blocking
- `mri_clinician_review.py` — State machine and sign-off
- `mri_bids_export.py` — Export package builder with gating
- `mri_registration_qa.py` — Registration quality assessment
- `mri_phi_audit.py` — De-identification audit

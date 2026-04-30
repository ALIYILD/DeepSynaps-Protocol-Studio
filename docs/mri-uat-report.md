# MRI Clinical Workbench — Staging UAT Report

**Date:** 2026-04-28  
**Commit:** `dec95147861c8afa8b91b1e9bc598bb0d6255f98`  
**Branch:** `main` (pushed to origin)  
**Deploy:** Fly.io (`deepsynaps-studio.fly.dev`) + Netlify (auto-deploy on push)

---

## 1. Deploy Status

| Service | Status | URL |
|---|---|---|
| Fly.io API | ✅ Healthy | `https://deepsynaps-studio.fly.dev` |
| Netlify Frontend | ✅ Auto-deployed | Triggered on push to `main` |
| OpenAPI Docs | ✅ 200 OK | `/docs` |
| MRI Endpoints | ✅ All 26 routes registered | Verified via `/openapi.json` |

**Commit already pushed:** `origin/main` is at `dec9514`.

---

## 2. Test Suite Results

### Backend
```
1530 passed, 7 skipped in 61.03s
```

- MRI clinical workbench: 22 passed
- MRI UAT scenarios: 8 passed
- MRI router + pipeline + compare + efield + rate limit: 43 passed
- **Total MRI-specific: 73 passed**

### Frontend
```
159 passed, 0 failed
```

- MRI Analyzer renderers: 33 passed (safety cockpit, red flags, atlas card, registration QA, PHI audit, protocol governance, clinician review, patient report, export gating, full view composition)

### Pre-existing failure excluded
- `test_clinical_data_integration.py::test_snapshot_manifest_is_written_for_loaded_dataset` fails with empty manifest JSON (unrelated to MRI work; tracked separately).

---

## 3. UAT Scenario Execution

### Scenario 1: Clean T1 MRI

| Checkpoint | Result | Evidence |
|---|---|---|
| Upload succeeds | ✅ Pass | `mri_upload_success` log emitted |
| Safety cockpit — overall `MRI_VALID_FOR_REVIEW` | ✅ Pass | All checks pass (file type, de-id, SNR, CNR, motion, registration) |
| Red flags — 0 flags | ✅ Pass | `flag_count == 0`, `high_severity_count == 0` |
| Registration QA — confidence high, finalisation allowed | ✅ Pass | `target_finalisation_allowed == True`, blocked reasons empty |
| PHI audit — risk low, no PHI in filename | ✅ Pass | `risk_level == "low"`, `potential_phi_in_filename == False` |
| Atlas model card — MNI152, high confidence | ✅ Pass | Template space and confidence returned |
| Target governance — "Candidate target" wording | ✅ Pass | Cards rendered with `match_rationale` |
| Clinician review — transition to APPROVED | ✅ Pass | State machine transitions correctly |
| Sign-off — digital sign | ✅ Pass | `signed_by` and `signed_at` populated |
| Patient-facing report — gated until approved, then accessible | ✅ Pass | 403 before approval, 200 after |
| BIDS export — blocked until signed, then succeeds | ✅ Pass | 403 → 403 (not signed) → 200 (signed) |
| Export package — 13 files present | ✅ Pass | `dataset_description.json`, `participants.tsv`, sidecars, derivatives, audit trail |
| Audit trail — transitions + sign logged | ✅ Pass | `transition` and `sign` actions in audit trail |

### Scenario 2: Poor-Quality Scan

| Checkpoint | Result | Evidence |
|---|---|---|
| Safety cockpit — `MRI_LIMITED_QUALITY` | ✅ Pass | SNR_LOW, CNR_LOW, MOTION_HIGH flags raised |
| Registration QA — blocked due to low confidence | ✅ Pass | `target_finalisation_allowed == False`, reasons include "low" |

### Scenario 3: Radiology Review Required

| Checkpoint | Result | Evidence |
|---|---|---|
| Safety cockpit — `MRI_RADIOLOGY_REVIEW_REQUIRED` | ✅ Pass | `RADIOLOGY_REVIEW_REQUIRED` red flag raised (high severity) |
| Approval blocked | ✅ Pass | 409 on transition to `MRI_APPROVED` |
| Export blocked | ✅ Pass | Cannot reach approved state; export remains 403 |

### Scenario 4: Missing Metadata / Atlas Case

| Checkpoint | Result | Evidence |
|---|---|---|
| Safety cockpit — shows "Unknown" for missing metrics | ✅ Pass | SNR/CNR/Motion show `warn` + "Unknown" |
| Atlas model card — incomplete | ✅ Pass | `registration_confidence == "unknown"`, `complete == False` |

### Scenario 5: Unsafe Claim Challenge

| Checkpoint | Result | Evidence |
|---|---|---|
| Claim governance — BLOCKED claim detected | ✅ Pass | `claim_type == "BLOCKED"` for "MRI confirms dementia" |
| Patient-facing report — stripped of blocked claim | ✅ Pass | "confirms dementia" absent from output |

---

## 4. PHI Scrutiny

| Surface | Check | Result |
|---|---|---|
| URLs | No patient name in any MRI endpoint path | ✅ Pass |
| Document titles | Frontend uses generic "MRI Analyzer" | ✅ Pass |
| Filenames | Original filename hidden; export uses `sub-{hash}` | ✅ Pass |
| Exported package names | `mri_clinical_package_{analysis_id}.zip` (UUID, not PHI) | ✅ Pass |
| Logs | No patient name in structured logs; only `analysis_id`, `actor_id`, `patient_id` (pseudonymized in export) | ✅ Pass |
| Timeline events | Only `patient_id` (system ID) and `analysis_id`; no names | ✅ Pass |

---

## 5. Observability Verification

| Event | Logged | Verified |
|---|---|---|
| `mri_upload_success` | ✅ Yes | Backend test logs |
| `mri_upload_failed` | ✅ Yes | Router code path |
| `mri_safety_cockpit_served` | ✅ Yes | Backend test logs |
| `mri_claim_governance_generated` | ✅ Yes | Backend test logs |
| `mri_target_plan_generated` | ✅ Yes | Backend test logs |
| `mri_patient_report_blocked` | ✅ Yes | Router code path |
| `mri_bids_export_served` | ✅ Yes | Router code path |
| `mri_bids_export_denied` | ✅ Yes | Backend test logs |
| `mri_registration_qa_computed` | ✅ Yes | Backend test logs |
| `mri_phi_audit_computed` | ✅ Yes | Backend test logs |
| `mri_report_state_transition` | ✅ Yes | Clinician review service |
| `mri_report_signed` | ✅ Yes | Clinician review service |
| `mri_claim_blocked` | ✅ Yes | Claim governance service |

---

## 6. Issues Found & Fixes

| Issue | Severity | Fix | Status |
|---|---|---|---|
| `_overall_status` returned `MRI_REPEAT_RECOMMENDED` before checking `RADIOLOGY_REVIEW_REQUIRED` | Medium | Reordered checks: radiology review now takes precedence over generic repeat recommendation | ✅ Fixed |
| `mri_protocol_governance.py` referenced `patient.implant_risk` which doesn't exist on `Patient` model | Low | Changed to `getattr(patient, "implant_risk", None)` | ✅ Fixed |
| UAT test helper didn't create `Patient` row, causing 404 on target-plan-governance | Test-only | Added `Patient` creation in `_seed_analysis` | ✅ Fixed |
| Claim governance test used POST endpoint which recomputes from report, ignoring seeded DB value | Test-only | Changed to GET endpoint which reads persisted `claim_governance_json` | ✅ Fixed |

---

## 7. Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PHI audit is heuristic-only (no DICOM parser) | Medium | High | Manual review required; documented in UI and export |
| Registration QA reads stored metadata (no real algorithm) | Medium | Medium | Shows "unknown" when absent; clinician verifies |
| Claim blocklist may miss novel phrasing | Low | High | Clinician review is second layer |
| No automatic radiologist notification | Medium | Medium | External clinical workflow required |
| Demo mode loads synthetic data | N/A | Low | Clearly labeled; not for clinical use |

---

## 8. Final Go / No-Go Recommendation

**Verdict: ✅ GO for controlled clinic demo**

### Rationale
- All 5 UAT scenarios pass with complete panel coverage
- Safety cockpit correctly surfaces quality issues and radiology review flags
- Export is gated behind approval + sign-off + resolved radiology flags
- BIDS export package contains all required files with de-identification log
- PHI scrutiny confirms no patient names in URLs, filenames, logs, or exports
- Observability logs every critical event for audit
- 1530 backend tests + 159 frontend tests pass

### Conditions for demo
- Demo must use **demo mode only** (synthetic data)
- Clinician must be briefed on "decision-support only" disclaimer
- Radiology review workflow must be coordinated externally
- Export packages must be reviewed by clinical engineer before sharing

### Recommended follow-up before production
- Clinical Safety Officer sign-off on hazard log
- Radiologist workflow integration (notification / ticket creation)
- Real DICOM de-identification validation with clinical engineer
- Penetration test of PHI audit heuristics

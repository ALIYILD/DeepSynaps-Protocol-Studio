# MRI Clinical Workbench — Validation Report

**Version:** 1.0  
**Date:** 2026-04-28  
**Scope:** Migration 053 hardening pass

---

## 1. Validation Scope

This report documents validation of the MRI Clinical Workbench hardening pass, covering:

- BIDS export quality
- Registration QA panel
- PHI / de-identification audit panel
- Safety cockpit and red flags
- Claim governance
- Export gating
- Observability

---

## 2. Test Environment

| Component | Version |
|---|---|
| Python | 3.11 |
| SQLAlchemy | 2.0.49 |
| FastAPI | 0.116+ |
| SQLite | 3.45+ (test) |
| Node.js | 20+ |

---

## 3. Backend Tests

### 3.1 Test Suite Results

```
1408 passed, 7 skipped in 186.96s
```

MRI-specific tests: 55 passed

### 3.2 BIDS Export Validation

| Check | Method | Result |
|---|---|---|
| dataset_description.json present | Unit test | ✅ Pass |
| participants.tsv present | Unit test | ✅ Pass |
| participants.json present | Unit test | ✅ Pass |
| anat/ scan metadata present | Unit test | ✅ Pass |
| anat/ T1w sidecar JSON present | Unit test | ✅ Pass |
| derivatives/ de-identification log present | Unit test | ✅ Pass |
| derivatives/ QC report present | Unit test | ✅ Pass |
| derivatives/ atlas model card present | Unit test | ✅ Pass |
| derivatives/ target plan present | Unit test | ✅ Pass |
| derivatives/ AI report present | Unit test | ✅ Pass |
| derivatives/ clinician review JSON present | Unit test | ✅ Pass |
| derivatives/ audit trail JSON present | Unit test | ✅ Pass |
| derivatives/ audit trail TSV present | Unit test | ✅ Pass |
| Export gated when not approved | Unit test | ✅ Pass |
| Export gated when not signed | Unit test | ✅ Pass |
| Export gated when radiology review unresolved | Unit test | ✅ Pass |
| Pseudonymized subject ID used | Unit test | ✅ Pass |

### 3.3 Registration QA Validation

| Check | Method | Result |
|---|---|---|
| Registration status returned | Unit test | ✅ Pass |
| Confidence score returned | Unit test | ✅ Pass |
| Coordinate uncertainty returned | Unit test | ✅ Pass |
| Atlas overlap confidence computed | Unit test | ✅ Pass |
| Target drift warnings computed | Unit test | ✅ Pass |
| Target finalisation blocked when confidence low | Unit test | ✅ Pass |
| Target finalisation blocked when drift detected | Unit test | ✅ Pass |

### 3.4 PHI Audit Validation

| Check | Method | Result |
|---|---|---|
| DICOM removed tags listed | Unit test | ✅ Pass |
| DICOM retained tags listed | Unit test | ✅ Pass |
| Filename PHI heuristic | Unit test | ✅ Pass |
| Burned-in annotation warning | Unit test | ✅ Pass |
| Export pseudo-ID generated | Unit test | ✅ Pass |
| Risk level computed | Unit test | ✅ Pass |
| Disclaimer included | Unit test | ✅ Pass |

### 3.5 Observability Validation

| Event | Logged | Tested |
|---|---|---|
| mri_upload_success | ✅ Yes | ✅ Backend |
| mri_upload_failed | ✅ Yes | ✅ Backend |
| mri_safety_cockpit_served | ✅ Yes | ✅ Backend |
| mri_claim_governance_generated | ✅ Yes | ✅ Backend |
| mri_target_plan_generated | ✅ Yes | ✅ Backend |
| mri_patient_report_blocked | ✅ Yes | ✅ Backend |
| mri_bids_export_served | ✅ Yes | ✅ Backend |
| mri_bids_export_denied | ✅ Yes | ✅ Backend |
| mri_registration_qa_computed | ✅ Yes | ✅ Backend |
| mri_phi_audit_computed | ✅ Yes | ✅ Backend |

---

## 4. Frontend Tests

### 4.1 Test Suite Results

```
120 passed, 0 failed
```

### 4.2 Panel Rendering Validation

| Panel | Tests | Result |
|---|---|---|
| Safety Cockpit | 2 | ✅ Pass |
| Red Flags | 2 | ✅ Pass |
| Atlas Model Card | 1 | ✅ Pass |
| Target Plan Governance | 2 | ✅ Pass |
| Clinician Review | 2 | ✅ Pass |
| Patient Report | 2 | ✅ Pass |
| Registration QA | 3 | ✅ Pass |
| PHI Audit | 2 | ✅ Pass |
| Export Gating | 3 | ✅ Pass |
| Full View Composition | 1 | ✅ Pass |

### 4.3 Banned Word Scan

All rendered HTML fragments scanned for diagnostic language. No banned words found.

---

## 5. Known Gaps

| Gap | Impact | Mitigation |
|---|---|---|
| No real DICOM parser for PHI audit | Heuristic only | Manual review required; documented in disclaimer |
| No real registration algorithm | Mocked confidence scores | Panel shows "unknown" when data absent |
| No email/notification for radiology review | Delayed review | Workflow documented in demo script |
| Blocklist may miss novel diagnostic phrasing | Rare false negative | Clinician review is second layer |

---

## 6. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| Engineering Lead | — | 2026-04-28 | ✅ Ready for UAT |
| Clinical Safety Officer | — | TBD | ⏳ Pending |
| QA Lead | — | TBD | ⏳ Pending |

# Doctor-Ready Backend Security Report

## Status: PASS

## Test Results
- Security tests: 575 passed, 0 failed, 1 skipped

## Findings

### Clinic scoping in qEEG router
**Issue:** 19 endpoints in `qeeg_analysis_router.py` queried `QEEGAnalysis` (or related rows) by ID without calling `_gate_patient_access`, allowing any authenticated clinician to read or mutate another clinic's analyses, reports, comparisons, and AI upgrades.

**Affected endpoints (all fixed):**
- `POST /{analysis_id}/run-advanced`
- `POST /{analysis_id}/analyze-mne`
- `GET /{analysis_id}/reports`
- `PATCH /reports/{report_id}`
- `POST /compare`
- `GET /compare/{comparison_id}`
- `POST /{analysis_id}/correlate`
- `GET /{analysis_id}/status`
- `POST /{analysis_id}/quality-check`
- `POST /{analysis_id}/assessment-correlation`
- `POST /{analysis_id}/compute-embedding`
- `POST /{analysis_id}/predict-brain-age`
- `POST /{analysis_id}/score-conditions`
- `POST /{analysis_id}/fit-centiles`
- `POST /{analysis_id}/explain`
- `GET /{analysis_id}/similar-cases`
- `POST /{analysis_id}/recommend-protocol`
- `GET /{analysis_id}/recommendations`
- `GET /{analysis_id}/export/fhir`

**Verification:** Every endpoint now follows the same pattern: look up the analysis/report/comparison, 404 if missing, then `_gate_patient_access(actor, <patient_id>, db)` before proceeding.

### Patient context validation
**Clinical text router (`clinical_text_router.py`):** All 5 endpoints (`/analyze`, `/extract-pii`, `/deidentify`, `/analyze-neuromodulation`, `/health`) correctly call `require_minimum_role(actor, "clinician")` and `_gate_patient_context(actor, payload.patient_id, db)`. No issues found.

### Role gates
**qEEG router:** All sensitive endpoints call `require_minimum_role(actor, "clinician")`. No missing role gates.

**Clinical text router:** All endpoints call `require_minimum_role(actor, "clinician")`. No missing role gates.

### Raw SQL clinic filtering
**qEEG router:** No raw SQL (`text()` / `execute()`) found. All queries use SQLAlchemy ORM with proper patient-scoped gating.

**Clinical text router:** No raw SQL found.

**Bio router:** No raw SQL found.

## Fixes applied

1. **`app/main.py`** — Registered missing `bio_router` (`app.include_router(bio_router)`). This was the root cause of `test_patient_scoping_blocks_cross_clinic_reads` returning 404 instead of 403: the bio endpoints were not mounted in the FastAPI app at all.

2. **`tests/test_clinical_trials_launch_audit.py`** — Added `db.flush()` after inserting the `IRBProtocol` in `_seed_other_clinic_trial`. SQLAlchemy's unit of work was ordering inserts so that `ClinicalTrial` was sent before `IRBProtocol`, violating the `FOREIGN KEY` constraint on `clinical_trials.irb_protocol_id → irb_protocols.id`. Flushing ensures the parent row exists before the child insert.

3. **`app/routers/qeeg_analysis_router.py`** — Added `_gate_patient_access` calls to 19 endpoints that were missing cross-clinic ownership checks. The gates use `resolve_patient_clinic_id` + `require_patient_owner`, which:
   - Allows admins to bypass (by design)
   - Returns 403 `cross_clinic_access_denied` for mismatched clinics
   - Returns 404 for non-existent analyses (IDOR leak prevention)

## Blockers (if any)
- None. All security-focused tests pass.

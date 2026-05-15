# qEEG Analyzer Transformation — Execution Plan

## 4 Critical Governance Bugs

### Bug 1 (HIGH): FHIR export missing `_gate_patient_access`
- `export_qeeg_fhir` (line 4243) has `require_minimum_role` but NO `_gate_patient_access`
- Cross-clinic clinician could export guessed analysis_id
- Fix: Add `_gate_patient_access(actor, row.patient_id, db)` after fetching row

### Bug 2 (HIGH): Export bypasses qEEG report governance
- `export_qeeg_fhir` doesn't check `report_state` or `signed_by`
- Fix: Add `_verify_qeeg_export_governance()` helper + call in all export endpoints

### Bug 3 (MEDIUM): Sign-off allows REVIEWED_WITH_AMENDMENTS
- Frontend (qeeg-clinician-review.js:80) allows sign for both states
- Need to check backend sign endpoint acceptance
- Fix: Align frontend with backend approved-only sign-off

### Bug 4 (MEDIUM): Legacy `clinician_reviewed` vs new `report_state`
- `amend_report` (line 2181) still sets `clinician_reviewed = True`
- Frontend still references `clinician_reviewed` in multiple places
- Fix: Unify on `report_state` state machine, deprecate `clinician_reviewed`

## Research: 13 agents
1. qEEG Software Benchmark
2. Open Source EEG Stack
3. Manual EEG Review Workbench
4. Artifact Cleaning Pipeline
5. Spectral/Topomap Design
6. Connectivity Design
7. Source Localization
8. Normative Model Governance
9. Clinical qEEG Evidence/Biomarker
10. Neurofeedback/Protocol Planning
11. Report Generator Template
12. UX Benchmark
13. AI Safety/Governance

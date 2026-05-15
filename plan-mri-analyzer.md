# MRI Analyzer Transformation — Execution Plan

## 4 Critical Bugs Identified

### Bug 1 (HIGH): Report payload omits review/sign-off fields
- `_status_payload_from_row()` (line 452) missing: report_state, signed_by, red_flags, safety_cockpit, atlas_metadata, claim_governance
- Model has them (mri.py lines 81-88) but serializer doesn't include

### Bug 2 (HIGH): Export bypasses MRI-specific approval/sign-off gate  
- `export_mri_bids_package()` (line 1682): docstring says "Gated: requires approved" but NO report_state check in code
- `export_mri_package()` (line 1856): same issue — no sign-off verification

### Bug 3 (MEDIUM): Workbench sections not wired into live flow
- Backend exposes safety_cockpit, red_flags, atlas_metadata, target_plans, registration QA, PHI audit
- Frontend renderFullView expects them (lines 2557, 2682) but they may not be in the report payload

### Bug 4 (MEDIUM): No frontend role gate
- Backend requires `require_minimum_role(actor, "clinician")` 
- Frontend has no role check — non-clinicians can see clinical MRI workspace

## Execution: 13 agents (3 implementation + 10 research), all parallel

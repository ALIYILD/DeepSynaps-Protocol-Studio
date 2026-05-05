## Protocol Studio — Patient Context Integration Report (Agent 4)

### Executive summary
The repo already has strong clinic-scoped patient access control utilities and rich domain-specific endpoints (qEEG Raw Workbench, ERP, MRI Analyzer, DeepTwin). A Protocol Studio patient-context endpoint should **reuse the clinic-scoped gate** (`resolve_patient_clinic_id` + `require_patient_owner`), aggregate **non-identifying** summaries and availability signals (not raw notes), and return an explicit completeness score and missing data list.

### What exists today (data sources & access patterns)

#### Patient identity + clinic scoping
- **Patient ORM**: `apps/api/app/persistence/models/patient.py` (`Patient`)
- **Clinic ownership resolution**: `apps/api/app/repositories/patients.py` `resolve_patient_clinic_id()`
- **Canonical cross-clinic gate**: `apps/api/app/auth.py` `require_patient_owner(actor, patient_clinic_id)`
  - Denies guests; allows admin bypass; denies cross-clinic; denies orphaned patients for non-admins.

#### Assessments / outcomes / timelines
- **Assessments**: `apps/api/app/routers/patients_router.py` (`GET /api/v1/patients/{patient_id}/assessments`)
  - Current access style is mixed (patient self-access + clinician ownership model).
- **Outcomes**: `apps/api/app/routers/outcomes_router.py` (clinic-safety tested; see tests below).
- **MRI timeline**: `apps/api/app/routers/mri_analysis_router.py` `GET /api/v1/mri/patients/{patient_id}/timeline`
  - Uses clinic-scoped gating (`require_patient_owner`).

#### qEEG + Raw Workbench + ERP
- **qEEG Raw Workbench**: `apps/api/app/routers/qeeg_raw_router.py`
  - Strong PHI minimization: metadata responses avoid names; cross-clinic returns 404 to avoid existence leaks.
- **ERP**: `apps/api/app/routers/studio_erp_router.py`
  - Reuses qEEG raw router `_load_analysis(...)` so it inherits the same cross-clinic protections.

#### MRI Analyzer
- **MRI Analyzer**: `apps/api/app/routers/mri_analysis_router.py`
  - Clinic-scoped access; exposes `GET /api/v1/mri/report/{analysis_id}` and patient-scoped listing/compare/timeline.

#### DeepTwin
- **DeepTwin**: `apps/api/app/routers/deeptwin_router.py`
  - Clinic-scoped access via `_gate_patient_access()` + `require_patient_owner`.
  - Already provides **data-source availability and a completeness score**:
    - `GET /api/v1/deeptwin/patients/{patient_id}/data-sources`
  - Has clinician notes endpoints; these are PHI-sensitive.

#### Medications / confounds / contraindications
- **Medications**: `apps/api/app/routers/medications_router.py`
  - **Important gap**: current access is clinician_id-scoped, not clinic-scoped (may be incomplete for teams).
- **Contraindications**: structured safety flags live under `Patient.medical_history` JSON.
  - **Context builder**: `apps/api/app/services/patient_context.py` `build_patient_medical_context(...)`
    - Produces prompt-safe `summary_md`, `structured_flags`, and `requires_review`.
    - Currently loads patient via clinician ownership model; may need adaptation for clinic-team access.

### Recommended new endpoint

#### `GET /api/v1/protocol-studio/patients/{patient_id}/context`
**Purpose**: Provide a PHI-safe “patient context” payload for Protocol Studio drafting and safety checks.

##### Access control (hard requirements)
- **Role gate**: `require_minimum_role(actor, "clinician")`
- **Clinic gate** (recommended): `clinic_id = resolve_patient_clinic_id(db, patient_id)` then `require_patient_owner(actor, clinic_id)`
  - Use cross-clinic 404 pattern where appropriate to avoid existence leaks (consistent with qEEG raw workbench).
- **Consent gate** (if consent model is available and required for this surface):
  - Require active consent for Protocol Studio use; otherwise return 403 with a stable error code.

##### PHI-safe response shape (recommended)
- **Identifiers**
  - `patient_id` (internal id)
  - No names, DOB, email, phone, addresses.
- **Demographics (non-identifying)**
  - `age_years` (derived), `sex`/`gender` (if present)
- **Domain availability**
  - `available_data_sources[]` and `missing_data_sources[]`
  - Per-domain: `{ available, count, last_updated }` for:
    - `assessments`, `qeeg`, `qeeg_raw_workbench`, `erp`, `mri`, `deeptwin`, `medications`, `outcomes`, `contraindications`, `notes` (notes should usually be “present/absent only”)
- **Summaries**
  - `qeeg_summary` (short, non-identifying; pointer IDs only)
  - `mri_summary` (short; pointer IDs only)
  - `erp_summary` (short; pointer IDs only)
  - `deeptwin_summary` (short; no predictions)
  - `assessment_summary` (scale names + latest score only if non-identifying)
- **Safety/contraindications**
  - `safety_contraindications[]` from structured flags (no raw note text)
  - `requires_review: boolean`
- **Medications/confounds**
  - Prefer counts + categories rather than detailed med lists; if detailed lists are needed, keep to drug class + name without dosage.
- **Freshness**
  - `data_freshness` per domain; `as_of`
- **Completeness score**
  - `confidence_completeness_score` in 0–1, plus the “why” factors used to compute it.

### Tests to reuse / extend
Existing test suites already cover cross-clinic access patterns:
- `apps/api/tests/test_cross_clinic_ownership.py`
- `apps/api/tests/test_qeeg_records_raw_viz_authz.py`
- `apps/api/tests/test_qeeg_raw_workbench.py`
- `apps/api/tests/test_patient_portal_role_gate.py`

Add new tests for the protocol-studio patient context endpoint:
- **Unauth**: 401
- **Patient role**: 403
- **Clinician same clinic**: 200
- **Clinician cross clinic**: 404 or 403 (choose one policy and apply consistently)
- **Consent missing** (if enforced): 403 with stable code

### Key gap / risk to track
- **Medications access** is clinician_id scoped today; Protocol Studio likely wants clinic-team scope. Decide whether to:
  - leave medications partial in context (honest “missing/insufficient”), or
  - refactor medication access to clinic-scoped with additional tests.


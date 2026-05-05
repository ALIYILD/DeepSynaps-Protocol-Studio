## Assessments v2 — Queue / Assignment Report

### What exists today (reusable primitives)
- **Assessment assignment & tracking (v1)**: `apps/api/app/routers/assessments_router.py`
  - Supports assignment-style workflows via:
    - `POST /api/v1/assessments/assign`
    - `POST /api/v1/assessments/bulk-assign`
    - `GET /api/v1/assessments?patient_id=...`
  - Enforces patient-clinic access via `_gate_patient_access()` which resolves patient clinic and applies `require_patient_owner(...)`.
- **Primary persisted table**: `assessment_records` (model `AssessmentRecord`)
  - Model: `apps/api/app/persistence/models/clinical.py`
  - Migrations:
    - `apps/api/alembic/versions/020_assessment_governance_fields.py`
    - `apps/api/alembic/versions/026_assessments_golive.py`
  - Fields already cover: patient_id, template_id/scale_id, due_date, status, completion, reviewed/approved, escalation, AI summary fields.
- **Tenant isolation (clinic scoping)**:
  - Actor: `apps/api/app/auth.py` `get_authenticated_actor()`
  - Clinic gate: `require_patient_owner(actor, patient_clinic_id)`
  - Patient→clinic resolution: `apps/api/app/repositories/patients.py` `resolve_patient_clinic_id(...)`
- **Audit logging**:
  - Generic audit events table: `apps/api/app/persistence/models/audit.py`
  - Writer: `apps/api/app/repositories/audit.py`
  - Many routers already write best-effort audit events.
- **PHI-safe telemetry/logging**:
  - Request/Sentry scrubbing: `apps/api/app/services/log_sanitizer.py`
  - Important: keep audit payloads **ID-only**; do not log patient names, raw responses, free-text narrative.

### Gaps vs Assessments v2 acceptance criteria
- The current Assessments v2 UI (`apps/web/src/pages-clinical-hubs.js` `pgAssessmentsHub`) relies on existing assessment endpoints and demo fallbacks; it is not yet backed by dedicated “assessments-v2/*” API endpoints.
- “Track who is getting which assessments” and “queue/status of assigned assessments” are supported by `assessment_records.status` + list queries, but:
  - There is not a dedicated “clinic queue” endpoint optimized for the hub (it uses `api.listAssessments()` on the client side).
  - Assignment scoping is already enforced at the patient level; clinic-level list queries must ensure they do not leak cross-clinic rows.

### Recommended approach (minimal, safe, doctor-facing)
1. **Reuse `assessment_records` as the canonical assignment + status record**
   - It already contains the status lifecycle and governance fields.
2. **Add/confirm clinic-scoped listing semantics**
   - Ensure `GET /api/v1/assessments` and/or a new hub endpoint filters by `actor.clinic_id` for non-admin roles using the established join path:
     - `assessment_records.patient_id -> patients.clinician_id -> users.clinic_id`
   - Follow the `video_assessment_router` pattern for scoping list queries by clinic.
3. **Audit log every action**
   - For each create/assign/update/submit/score/review action:
     - write an `audit_events` row with:
       - `event` (stable string, e.g. `assessments.assign`, `assessments.submit`, `assessments.score`)
       - IDs only: `assessment_id`, `patient_id`, `template_id`
       - `actor_id`, role, clinic_id
     - Do **not** include PHI or item text.

### Tests recommended (API)
Create/extend tests (examples aligned to your requested list):
- **unauth blocked**: endpoints return 401/403 without token.
- **cross-clinic blocked**:
  - clinician from clinic A cannot assign/list/read assessment for clinic B patient.
  - For list endpoints, ensure rows are clinic-scoped (no leakage).
- **assign supported assessment**: create assignment for PHQ-9 (or other embedded-text-allowed template) and see it in queue.
- **assign licence-required assessment**: assign a restricted/score-only template; ensure UI/API indicates licence state and does not embed item text.
- **audit logged**: verify `audit_events` row is written for assignment + updates.

### Files of record (absolute paths)
- `apps/api/app/routers/assessments_router.py`
- `apps/api/app/persistence/models/clinical.py`
- `apps/api/alembic/versions/020_assessment_governance_fields.py`
- `apps/api/alembic/versions/026_assessments_golive.py`
- `apps/api/app/auth.py`
- `apps/api/app/repositories/patients.py`
- `apps/api/app/persistence/models/audit.py`
- `apps/api/app/repositories/audit.py`
- `apps/api/app/services/log_sanitizer.py`


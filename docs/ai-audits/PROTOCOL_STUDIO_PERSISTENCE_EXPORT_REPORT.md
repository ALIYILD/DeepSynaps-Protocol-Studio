## Protocol Studio Persistence / Review / Audit / Export — PHI-safe report

### Scope
Inspect existing database tables/migrations and API surfaces for:
- protocol drafts persistence
- audit trails / evidence logging
- exports
- review queues
Then propose a reuse/new-table strategy for Protocol Studio drafts/reviews/audit/export, PHI-safe.

### Existing persistence surfaces (reusable)
- **Saved protocol drafts**: `prescribed_protocols` (`PrescribedProtocol`)
  - Router: `apps/api/app/routers/protocols_saved_router.py`
  - Stores draft metadata in `protocol_json` including `governance_state` and `parameters_json`.
- **Review queue**: `review_queue_items` (`ReviewQueueItem`)
  - Generic queue supporting assignment/status/notes; already has an API surface in `treatment_courses_router.py` under `/api/v1/review-queue`.
- **Audit trail**:
  - `audit_events` (`AuditEventRecord`) is a generic structured audit table used across the app.
  - `agent_run_audit` (`AgentRunAudit`) is a per-invocation audit table with bounded previews (useful for AI provenance).
- **Export job pattern**:
  - `data_exports` (`DataExport`) + `data_privacy_router.py` + `data_export_service.py` provide a job table + background worker + TTL cleanup pattern (GDPR portability).

### What’s missing for Protocol Studio
- **Append-only revision history** for protocol drafts: `prescribed_protocols.protocol_json` is mutable; approvals/signatures/exports should reference immutable snapshots.
- **Review decision artifact model**: queue items track assignment/state, but do not encode structured review artifacts or snapshot hashes.
- **Protocol-specific export jobs** with governance and PHI controls distinct from GDPR exports.

### PHI-safe requirements (recommended)
- Persist **patient linkage via `patient_id`**, but avoid embedding patient name/DOB/contact details in protocol draft text blobs.
- Enforce strict caps/redaction on any persisted “preview” fields (mirroring `agent_run_audit`).
- Avoid including patient identifiers in exported filenames/URLs; use hashed tags (pattern exists in FHIR export).
- For regulator-credible workflows: approvals/signatures must reference **immutable, hash-addressed snapshots**.

### Reuse-first strategy (recommended)
1) **Draft persistence**
   - Reuse `prescribed_protocols` for patient-bound Protocol Studio drafts.
2) **Revision history (new)**
   - Add an append-only revisions table keyed by `prescribed_protocols.id` (or introduce a new `protocol_studio_documents` header table if drafts can be non-patient templates).
   - Each revision stores:
     - `snapshot_json` (canonical protocol payload for review/export)
     - `snapshot_hash` (sha256 of canonical JSON)
     - `revision_idx`, `created_at`, `actor_id`, `actor_role`, bounded `note`
3) **Review queue**
   - Reuse `review_queue_items`:
     - `target_type="prescribed_protocol"` (or `"protocol_studio_document"`)
     - `target_id=<draft id>`
     - `item_type="protocol_review"` / `"protocol_approval"`
   - Store reviewer decisions as:
     - `audit_events` actions + note (PHI-safe), and/or
     - a dedicated append-only `protocol_review_actions` table (optional, for richer structure)
4) **Audit**
   - Use `audit_events` for key lifecycle actions:
     - `protocol_studio.draft.created`
     - `protocol_studio.draft.updated`
     - `protocol_studio.review.submitted`
     - `protocol_studio.review.approved` / `.rejected`
     - `protocol_studio.export.generated`
   - If AI generation is used: record provenance in `agent_run_audit` and link from `audit_events` via a reference id (never store full PHI context).
5) **Exports (new)**
   - Create a Protocol Studio export job table (do not overload GDPR `data_exports`):
     - `protocol_exports(id, draft_id/document_id, requested_by, clinic_id, format, redaction_mode, status, file_url, file_bytes, artifact_hash, created_at, completed_at, error)`
   - Implement TTL cleanup similar to `EXPORT_TTL` used by GDPR exports.
   - Filenames/headers: `Cache-Control: no-store`, patient identifiers excluded.

### Notes on PHI risk areas
- `clinician_notes` inside `protocol_json` is likely PHI; consider isolating it (separate field/table) so exports can redact it reliably.
- `audit_events.note` is free text; enforce a strict length limit and PHI-safe content policy for Protocol Studio actions.

### Key code references
- Saved protocol persistence: `apps/api/app/persistence/models/clinical.py` (`PrescribedProtocol`)
- Saved protocol router: `apps/api/app/routers/protocols_saved_router.py`
- Review queue model: `apps/api/app/persistence/models/patient.py` (`ReviewQueueItem`)
- Review queue router: `apps/api/app/routers/treatment_courses_router.py`
- Audit tables: `apps/api/app/persistence/models/audit.py` (`AuditEventRecord`, `AgentRunAudit`)
- GDPR export job pattern: `apps/api/app/persistence/models/billing.py` (`DataExport`), `apps/api/app/routers/data_privacy_router.py`, `apps/api/app/services/data_export_service.py`
- Append-only revision precedent: `apps/api/alembic/versions/065_irb_manager_protocols.py` (`irb_protocol_revisions`)


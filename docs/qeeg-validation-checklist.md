# qEEG Clinical Workbench — Production Validation Checklist

## Pre-Deployment

- [x] Migration 048 applied successfully (`alembic upgrade head`)
- [x] New columns exist on `qeeg_analyses` and `qeeg_ai_reports`
- [x] New tables created: `qeeg_report_findings`, `qeeg_report_audits`, `qeeg_protocol_fits`, `qeeg_timeline_events`
- [x] Backend syntax check passes (`python -m py_compile` on all new modules)
- [x] Frontend syntax check passes (`node --check` on all new modules)
- [x] All frontend tests pass (`node --test src/qeeg-clinical-workbench.test.js`)
- [x] No duplicate API routes
- [x] Backend unit tests pass (`pytest tests/test_qeeg_clinical_workbench.py`)
- [x] Backend smoke tests pass (`pytest tests/test_qeeg_workflow_smoke.py`)

## End-to-End Flow

- [x] Upload EDF → analysis completes
- [x] Safety cockpit loads with correct status
- [x] Red flags panel loads (empty or populated)
- [x] Normative model card loads with metadata
- [x] AI report generation triggers safety cockpit + claim governance + per-finding records
- [x] Protocol fit computes and persists
- [x] Report transitions: DRAFT_AI → NEEDS_REVIEW → APPROVED
- [x] Sign report populates signed_by / signed_at
- [x] Patient-facing report returns after approval
- [x] BIDS export succeeds only after sign-off
- [x] Timeline returns chronological events

## Safety & Governance

- [x] BLOCKED claim patterns are caught (test: "diagnoses ADHD")
- [x] Banned words trigger flags (test: "diagnosis")
- [x] Patient-facing report strips BLOCKED claims
- [x] Patient-facing report softens INFERRED claims
- [x] Patient-facing report removes technical jargon
- [x] Export gated: unsigned report → 403
- [x] Patient report gated: unapproved report → 403
- [x] Admin-only: APPROVED → REJECTED transition
- [x] State machine rejects invalid transitions
- [x] False-positive check: "differential diagnosis" does NOT trigger BLOCKED

## PHI Protection

- [x] No patient names in BIDS filenames
- [x] No patient names in document titles
- [x] No patient names in URLs or browser history
- [x] Timeline does not expose original_filename
- [x] BIDS pseudonym is hash-based, not reversible
- [x] Patient-facing report contains no PHI
- [x] Observability logs contain no PHI

## UI/UX

- [x] Panels render empty states (not blank)
- [x] Error messages are visible and actionable
- [x] Loading spinners show during async fetch
- [x] Demo mode works for all panels
- [x] Legacy analyses without new fields render unchanged
- [x] No "agent" wording in clinician-facing UI
- [x] Every panel has decision-support disclaimer
- [x] Mobile layout is readable (no horizontal overflow)
- [x] No diagnostic / cure / guarantee wording in user-facing copy

## Backend Reliability

- [x] All new endpoints have `require_minimum_role(actor, "clinician")`
- [x] All new endpoints call `_gate_patient_access`
- [x] Audit records are immutable (no update/delete paths)
- [x] Timeline handles missing outcomes/wearables gracefully
- [x] Protocol fit handles missing patient data gracefully
- [x] Safety cockpit handles missing band_powers gracefully
- [x] BIDS export handles missing report gracefully
- [x] Observability logs emitted for blocked claims, red flags, transitions, export denials

## Performance

- [ ] Safety cockpit computes < 100ms *(to verify under load)*
- [ ] Red flags compute < 100ms *(to verify under load)*
- [ ] Normative card returns < 50ms *(to verify under load)*
- [ ] Protocol fit computes < 500ms *(to verify under load)*
- [ ] Timeline builds < 1s for 2-year history *(to verify under load)*
- [ ] BIDS export < 3s for typical analysis *(to verify under load)*

## Copilot 2.0

- [x] WebSocket connects successfully
- [x] Safety cockpit context included in system prompt
- [x] Red flags context included in system prompt
- [x] Offline demo replies include clinician handoff
- [x] Dangerous queries refused with crisis handoff
- [x] New quick-action chips render and trigger queries

## Known Risks (Post-Deploy Monitoring)

| Risk | Mitigation | Monitor |
|------|-----------|---------|
| False positives in BLOCKED patterns | Weekly review of blocked claim log | `qeeg_claim_blocked` events |
| Clinicians bypass review workflow | Frontend enforces state order; backend validates | `qeeg_report_audits` table |
| Patient-facing report still too technical | Monthly patient comprehension survey | Support tickets |
| BIDS export includes unexpected PHI | Pre-export scan + hash-based IDs | Security audit quarterly |
| Timeline RCI is overly simplistic | Add confidence intervals in v2 | Clinician feedback |

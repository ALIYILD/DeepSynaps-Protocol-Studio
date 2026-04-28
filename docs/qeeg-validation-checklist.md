# qEEG Clinical Workbench — Production Validation Checklist

## Pre-Deployment

- [ ] Migration 048 applied successfully (`alembic upgrade head`)
- [ ] New columns exist on `qeeg_analyses` and `qeeg_ai_reports`
- [ ] New tables created: `qeeg_report_findings`, `qeeg_report_audits`, `qeeg_protocol_fits`, `qeeg_timeline_events`
- [ ] Backend syntax check passes (`python -m py_compile` on all new modules)
- [ ] Frontend syntax check passes (`node --check` on all new modules)
- [ ] All frontend tests pass (`node --test src/qeeg-clinical-workbench.test.js`)
- [ ] No duplicate API routes

## End-to-End Flow

- [ ] Upload EDF → analysis completes
- [ ] Safety cockpit loads with correct status
- [ ] Red flags panel loads (empty or populated)
- [ ] Normative model card loads with metadata
- [ ] AI report generation triggers safety cockpit + claim governance + per-finding records
- [ ] Protocol fit computes and persists
- [ ] Report transitions: DRAFT_AI → NEEDS_REVIEW → APPROVED
- [ ] Sign report populates signed_by / signed_at
- [ ] Patient-facing report returns after approval
- [ ] BIDS export succeeds only after sign-off
- [ ] Timeline returns chronological events

## Safety & Governance

- [ ] BLOCKED claim patterns are caught (test: "diagnoses ADHD")
- [ ] Banned words trigger flags (test: "diagnosis")
- [ ] Patient-facing report strips BLOCKED claims
- [ ] Patient-facing report softens INFERRED claims
- [ ] Patient-facing report removes technical jargon
- [ ] Export gated: unsigned report → 403
- [ ] Patient report gated: unapproved report → 403
- [ ] Admin-only: APPROVED → REJECTED transition
- [ ] State machine rejects invalid transitions

## PHI Protection

- [ ] No patient names in BIDS filenames
- [ ] No patient names in document titles
- [ ] No patient names in URLs or browser history
- [ ] Timeline does not expose original_filename
- [ ] BIDS pseudonym is hash-based, not reversible
- [ ] Patient-facing report contains no PHI

## UI/UX

- [ ] Panels render empty states (not blank)
- [ ] Error messages are visible and actionable
- [ ] Loading spinners show during async fetch
- [ ] Demo mode works for all panels
- [ ] Legacy analyses without new fields render unchanged
- [ ] No "agent" wording in clinician-facing UI
- [ ] Every panel has decision-support disclaimer
- [ ] Mobile layout is readable (no horizontal overflow)

## Backend Reliability

- [ ] All new endpoints have `require_minimum_role(actor, "clinician")`
- [ ] All new endpoints call `_gate_patient_access`
- [ ] Audit records are immutable (no update/delete paths)
- [ ] Timeline handles missing outcomes/wearables gracefully
- [ ] Protocol fit handles missing patient data gracefully
- [ ] Safety cockpit handles missing band_powers gracefully
- [ ] BIDS export handles missing report gracefully

## Performance

- [ ] Safety cockpit computes < 100ms
- [ ] Red flags compute < 100ms
- [ ] Normative card returns < 50ms
- [ ] Protocol fit computes < 500ms
- [ ] Timeline builds < 1s for 2-year history
- [ ] BIDS export < 3s for typical analysis

## Copilot 2.0

- [ ] WebSocket connects successfully
- [ ] Safety cockpit context included in system prompt
- [ ] Red flags context included in system prompt
- [ ] Offline demo replies include clinician handoff
- [ ] Dangerous queries refused with crisis handoff
- [ ] New quick-action chips render and trigger queries

## Known Risks (Post-Deploy Monitoring)

| Risk | Mitigation | Monitor |
|------|-----------|---------|
| False positives in BLOCKED patterns | Weekly review of blocked claim log | `claim_governance_json` audit |
| Clinicians bypass review workflow | Frontend enforces state order; backend validates | `qeeg_report_audits` table |
| Patient-facing report still too technical | Monthly patient comprehension survey | Support tickets |
| BIDS export includes unexpected PHI | Pre-export scan + hash-based IDs | Security audit quarterly |
| Timeline RCI is overly simplistic | Add confidence intervals in v2 | Clinician feedback |

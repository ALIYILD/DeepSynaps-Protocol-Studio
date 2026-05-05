# Protocol Studio Doctor-Ready Plan (Coordinator Task Board)

## Mission scope (doctor-ready end-to-end)
Protocol Studio must be a clinician workspace to:
- Search evidence-based protocols and evidence/literature (local + live when configured).
- Generate **decision-support** protocol drafts (qEEG-guided, MRI-guided, TPS/TMS/tDCS/CES-style, AI-personalized, multimodal).
- Enforce safety/governance: contraindications, off-label flags, evidence grade visibility, clinician review/approval workflow.
- Persist drafts + audit actions, without leaking PHI into logs/prompts/telemetry.

## Absolute safety rules (non-negotiable)
1. Not an autonomous prescribing system.
2. All generated protocols labelled **“clinician decision-support only.”**
3. Clinician must review/approve before use.
4. Off-label clearly flagged + explicit acknowledgement when approving/using.
5. Evidence grade visible.
6. Contraindications/safety exclusions checked before output.
7. Do not invent references/citations.
8. Do not fake live literature results.
9. Do not claim efficacy where evidence is weak.
10. If required patient data/safety checks are missing: return **“insufficient data”** or **“requires clinician review.”**
11. Do not weaken existing DeepSynaps safety/governance wording.
12. Do not break existing qEEG/MRI/ERP/DeepTwin/Raw Workbench/Evidence Library flows.
13. Do not claim “approved” unless there is real regulatory or internal governance approval.
14. Audit log every search/generation/view/export/approval action.
15. Keep PHI out of unsafe logs/prompts/telemetry/audit details (store references/IDs, not raw notes).

## Current repo signals (initial coordinator discovery)
- Web routing is query-param driven; `apps/web/src/app.js` routes `case 'protocol-studio'` to `pgProtocolHub` (from `apps/web/src/pages-clinical-hubs.js`).
- Protocol browsing/generation UI already exists in `apps/web/src/pages-protocols.js` and supports embedding via `opts.mountEl` (used by Protocol Studio hub).
- API already has protocol services/routers, e.g. `apps/api/app/routers/protocols_generate_router.py` and registry/personalization services.
- Evidence services exist (`apps/api/app/services/evidence*.py`, `apps/api/app/routers/evidence_router.py`) and web has evidence UI modules (`apps/web/src/*evidence*`).

## Workstreams (mapped to requested subagents)
### Agent 1 — Route / Frontend discovery
- Confirm preview URL pathing for `?page=protocol-studio` and identify why it fails (if it does).
- Confirm whether routing is query-param (`?page=`) vs hash routing vs SPA router.
- Identify existing Protocol Studio hub UI in `pages-clinical-hubs.js` and reuse patterns.
- Add stable `data-testid` hooks (non-invasive).
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_ROUTE_AUDIT.md`

### Agent 2 — Evidence database wiring (local-first, honest live fallback)
- Identify local evidence corpus sources (CSV/DB/vector store) and existing endpoints.
- Propose/implement `/api/v1/protocol-studio/evidence/*` endpoints as **facades** over existing evidence services (no fake citations).
- Ensure response includes required citation fields and source status (local/live/cached).
- Add backend tests.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_EVIDENCE_WIRING_REPORT.md`

### Agent 3 — Protocol taxonomy / registry
- Identify existing protocol registry sources (CSV/DB) and current endpoints (`/api/v1/registry/protocols`, `/api/v1/protocols/*`).
- Propose/implement `/api/v1/protocol-studio/protocols*` as safe read-only catalog with governance statuses.
- Add tests: unique IDs, off-label warnings, contraindication presence, research-only cannot be “approved”.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_REGISTRY_REPORT.md`

### Agent 4 — Patient context integration
- Identify patient-context sources across qEEG/MRI/ERP/DeepTwin/assessments/medications/notes/outcomes.
- Implement `/api/v1/protocol-studio/patients/{patient_id}/context` with strict access control and PHI-safe payload.
- Add tests for unauth/same-clinic/cross-clinic.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_PATIENT_CONTEXT_REPORT.md`

### Agent 6 — Safety / governance / off-label + approval workflow
- Implement contraindication checks + governance statuses for drafts.
- Add review/approve/reject endpoints with role enforcement and off-label explicit acknowledgement.
- Add audit events for: search/generate/view/review/approve/reject/export.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_SAFETY_GOVERNANCE_REPORT.md`

### Agent 5 — Protocol generation engine (structured + grounded, no “LLM-only”)
- Implement `/api/v1/protocol-studio/generate` as an orchestration layer:
  - Evidence search (no patient data).
  - qEEG-guided (requires qEEG summary; flags confounds).
  - MRI-guided (requires MRI summary; honest demo markers).
  - DeepTwin personalized (requires context; show completeness + uncertainty).
  - Multimodal (combine; show which inputs influenced output).
- Must block or downgrade when missing evidence/safety checks.
- Persist drafts (delegated to Agent 10); integrate safety engine (Agent 6).
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_GENERATION_ENGINE_REPORT.md`

### Agent 7 — Frontend UX (doctor-friendly, explicit decision-support banner)
- Build/repair Protocol Studio UI shell (header, filters, tabs, results, generator, drafts/approvals, patient context panel).
- Add stable selectors requested (`data-testid="protocol-studio-root"` etc).
- Add frontend tests (page load, modes render, safety banner visible, no “approved” wording unless explicit).
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_UX_REPORT.md`

### Agent 8 — Live evidence / RAG status (honest health)
- Identify existing live literature providers and how they are configured.
- Implement `/api/v1/protocol-studio/evidence/health` with:
  - local DB availability, live configured yes/no, last sync, vector search availability, fallback mode.
- No expensive calls on health check; add retrieval mode (local_only/live_only/local_plus_live).
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_LIVE_EVIDENCE_REPORT.md`

### Agent 9 — AI/prompt safety (PHI redaction + grounding validator)
- If any LLM narrative is introduced, it must be fed **structured** evidence + context only.
- Enforce PHI redaction, output schema validation, citation grounding (no invented refs).
- Deterministic fallback when AI unavailable.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_AI_SAFETY_REPORT.md`

### Agent 10 — Persistence / audit / export
- Reuse existing persistence patterns if present; otherwise add tables for drafts/reviews/audit/export.
- Ensure audit log contains no PHI; store references only.
- Implement draft read/list/export endpoints (JSON + Markdown at minimum).
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_PERSISTENCE_EXPORT_REPORT.md`

### Agent 11 — Deploy / preview / smoke
- Verify Netlify preview route `?page=protocol-studio` and demo-mode behavior (honest demo labels).
- Verify env vars and API connectivity/cors; add Playwright smoke for Protocol Studio.
- Deliverable: `docs/ai-audits/PROTOCOL_STUDIO_DEPLOY_REPORT.md`

## Integration order (safety-first)
1. Route verification + non-breaking testids (Agent 1).
2. Evidence facade endpoints + honest health status (Agents 2, 8).
3. Protocol registry facade endpoints (Agent 3).
4. Patient context endpoint (Agent 4).
5. Safety/governance + review/approve endpoints + audit scaffolding (Agent 6, Agent 10).
6. Generation orchestration endpoint (Agent 5) integrating registry + evidence + safety + persistence.
7. Frontend Protocol Studio UX wiring + tests (Agent 7).
8. Deploy/smoke/Playwright + docs (Agent 11).
9. QA gate + final verdict report (Agent 12).

## Acceptance criteria traceability (what “doctor-ready” means)
- Route loads in Netlify preview.
- Evidence search works with local DB (or honest “unavailable”).
- Live literature status is honest (no fake results).
- Clinician can search protocols by required facets.
- Clinician can generate at least evidence-based draft; qEEG/MRI/DeepTwin/multimodal drafts require corresponding data or return insufficient data.
- Every draft includes evidence links, evidence grade, regulatory/off-label + warnings, contraindication checks, missing-data list, uncertainty statement, clinician review required flag.
- Approval workflow exists and is role-gated; research-only cannot be approved for treatment.
- Audit logs exist for all key actions; no PHI leaks.
- Tests pass (or failures are documented as unrelated).


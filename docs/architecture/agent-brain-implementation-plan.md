# DeepSynaps Clinical Agent Brain — Implementation Plan

Branch: `feat/clinical-agent-brain`
Date: 2026-05-09

## 1. Repo findings (Phase 0 inspection)

### Existing modules to REUSE (do not parallel-build)

| Concern | Existing module |
| --- | --- |
| RBAC / actor identity | `apps/api/app/auth.py` (`AuthenticatedActor`, `require_minimum_role`, `require_patient_owner`) |
| Demo tokens (test fixtures) | `apps/api/app/registries/auth.py` (`DEMO_ACTOR_TOKENS`) |
| Audit events (DB-backed) | `apps/api/app/services/audit.py`, `apps/api/app/repositories/audit.py` |
| Evidence (richest path) | `apps/api/app/routers/evidence_router.py` (read-only sqlite at `EVIDENCE_DB_PATH` → `services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db`) |
| Evidence (CSV fallback) | `apps/api/app/services/evidence.py` + `clinical_data.list_evidence_from_clinical_data` |
| Conditions / modalities / devices / protocols / phenotypes / governance | `apps/api/app/services/registries.py` (CSV-backed via `CLINICAL_DATA_ROOT`) |
| Governance rules | `registries.list_governance_rules()` + per-protocol `Patient_Facing_Allowed`, `Clinician_Review_Required`, `On_Label_vs_Off_Label` |
| Report generation (handbooks) | `apps/api/app/services/generation.py:generate_handbook` |
| qEEG report template / contract | `apps/api/app/services/qeeg_report_template.py` (`QEEGBrainMapReport` — canonical per repo memory) |
| AI feature health / availability | `apps/api/app/routers/ai_health_router.py` (`/api/v1/health/ai-features`) |
| Frontend API client | `apps/web/src/api.js` (`apiFetch`, `export const api = { … }`) |

### What does NOT yet exist

- A unified provider registry that AI pages can introspect.
- A single `/api/v1/agent-brain/query` entry point that role-gates and audits.
- A safe agent-memory store (no PHI).
- An ai-page-provider mapping doc.

## 2. New modules to add

```
apps/api/app/services/agent_brain/
  __init__.py
  schemas.py                    # ProviderQuery, ProviderResponse, ProviderManifest
  registry.py                   # PROVIDER_REGISTRY dispatch
  safety.py                     # safety flags, fallback strings, PHI scrub
  audit.py                      # thin wrapper over repositories.audit
  providers/
    __init__.py
    base.py                     # AgentBrainProvider abstract base
    evidence.py                 # → evidence_intelligence + evidence_router DB
    protocol_governance.py      # → registries.list_governance_rules + per-protocol flags
    condition_registry.py       # → registries.list_conditions / get_condition
    device_registry.py          # → registries.list_devices
    report_templates.py         # → generation.generate_handbook + qeeg_report_template contract
    agent_memory.py             # safe op-notes; in-memory + opt-in DB later
    patient_context.py          # gated; off by default
    qeeg_knowledge.py           # placeholder, returns not_configured
    mri_knowledge.py            # placeholder
    deeptwin_context.py         # placeholder
    video_audio_analysis.py     # placeholder
    biomarker.py                # placeholder
    assessment.py               # placeholder

apps/api/app/routers/agent_brain_router.py   # /api/v1/agent-brain/{status,providers,query,memory}

apps/api/tests/
  test_agent_brain_registry.py
  test_agent_brain_router.py
  test_agent_brain_safety.py
  test_agent_brain_providers.py

apps/web/src/agent-brain-api.js              # tiny client lib
apps/web/src/agent-brain-status.js           # status banner component (vanilla, matches existing JS pages)

docs/architecture/deepsynaps-clinical-agent-brain.md
docs/architecture/deepsynaps-ai-page-provider-map.md
docs/safety/agent-brain-clinical-safety-policy.md
docs/research/scout-patterns-for-deepsynaps.md
docs/reports/agent-brain-implementation-summary.md
```

## 3. Safety constraints (non-negotiable)

- All providers return a structured envelope with `requires_clinician_review`, `patient_facing_allowed`, `safety_flags`, `confidence`.
- `EvidenceProvider`: never invents PMID/DOI; `requires_citations=true`. If citations are missing, drop the claim — never substitute placeholder text.
- `DeviceRegistryProvider`: never invents stimulation parameters. If a parameter field is empty, return the field as `null` and add `parameter_data_missing` to `missing_requirements`.
- `ProtocolGovernanceProvider`: surface `On_Label_vs_Off_Label`, `Clinician_Review_Required`, `Patient_Facing_Allowed` verbatim from registry.
- `AgentMemoryProvider`: rejects any payload with PHI-shaped keys (`patient_id`, `mrn`, `dob`, `email`, `phone`); read/write disabled unless explicitly enabled.
- `PatientContextProvider`: shipped DISABLED by default. Even when enabled it must require `clinician`/`admin`/`reviewer` role and run through `require_patient_owner`. Audit event recorded on every access.
- Unavailable providers return `status: "unavailable" | "not_configured"`, never fake content.
- Router enforces role gates BEFORE delegating to provider.
- `/api/v1/agent-brain/memory` POST returns 403 with a clear message in the default config.

## 4. Tests to add (Phase 6)

Backend pytest cases (matches the spec's required list 1–15):

1. registry lists 6 MVP providers
2. provider manifest exposes `allowed_roles`, `contains_phi`, `requires_citations`, `requires_audit`
3. evidence provider does not invent citations (when no DB → returns empty `citations`, status=ok with safe fallback message)
4. evidence provider returns safe fallback when no evidence rows
5. governance provider flags `clinician_review_required`
6. device provider preserves `null` for missing parameter fields, adds `parameter_data_missing`
7. unavailable placeholder providers return `not_configured`
8. unauthorized role denied PHI provider
9. patient-context provider, when enabled, writes audit event
10. agent memory rejects PHI-like keys
11. `GET /api/v1/agent-brain/status` returns 200
12. `GET /api/v1/agent-brain/providers` returns 200 with manifests
13. `POST /agent-brain/query` with unknown provider → safe `unknown_provider` error
14. `POST /agent-brain/query` with disallowed role → 403
15. response envelope never claims autonomous diagnosis (string-scan in safety test)

## 5. Frontend wiring plan (Phase 5)

Light-touch only. Avoid rewriting AI pages.

- Add three functions to `apps/web/src/api.js`:
  - `getAgentBrainStatus()`
  - `getAgentBrainProviders()`
  - `queryAgentBrain(body)`
- Add `apps/web/src/agent-brain-status.js`: a small DOM helper that renders a status pill ("Agent Brain: 6/6 providers ok" / "evidence: not_configured") into a host `<div id="agent-brain-status">` if present.
- Add a `data-agent-brain-status` mount to the Evidence Research, Protocol Studio, qEEG Analyzer, MRI Analyzer, DeepTwin, Patient Analytics, Video/Voice/Text/Biomarker, and Report Generator pages — these are existing JS pages under `apps/web/src/pages-*`. Mounts only; no behaviour rewrite.
- Existing demo data and disclaimers are already present on most pages; this PR labels them via the status banner instead of touching every flow.

## 6. Risks / TODOs

- **Concurrent-session conflict.** Per `deepsynaps-concurrent-session-chaos.md`, sessions revert each other. Mitigation: branched off `origin/main`, push frequently, PR + squash-merge.
- **Evidence DB volume.** `services/evidence-pipeline/*.db` is gitignored on Fly. The provider must degrade gracefully when missing.
- **patient_id semantics.** `EvidenceProvider` accepts an optional `patient_id` for context — but does NOT load patient records itself. Cross-clinic gate is centralized on `PatientContextProvider`.
- **Schema package coupling.** Avoiding new `deepsynaps_core_schema` types — using local Pydantic models inside the agent_brain module to keep the PR scoped to `apps/api/app/`.
- **No new migrations.** Phase 1 uses the existing `audit_events` table; no Alembic change needed.

## 7. Acceptance review

The PR is shippable when:
- All 15 backend tests pass.
- `apps/web` build is unaffected (status component is additive).
- `/api/v1/agent-brain/status` returns 200 with 6 MVP providers.
- Three docs (architecture, page-provider map, safety policy) are present.
- Implementation summary written honestly — including any test that could not run.

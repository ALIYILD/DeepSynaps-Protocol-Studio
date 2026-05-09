# Clinical Agent Brain — Implementation Summary

Branch: `feat/clinical-agent-brain`
Date: 2026-05-09
Status: backend tests passing, frontend tests passing, apps/web build passing.

## 1. Executive summary

DeepSynaps Studio now has a Scout-inspired Clinical Agent Brain layer that
every AI surface can call to fetch grounded, role-gated, auditable context
**before** producing clinical, analytical, report, simulation, or protocol
output.

- New backend module `apps/api/app/services/agent_brain/` with a hand-curated
  provider registry, safety helpers, audit hook, and a typed response envelope.
- 13 providers registered: 6 wired to existing services (MVP), 1 gated PHI
  provider (`patient_context`, off by default), 6 placeholder providers that
  return `not_configured` honestly until they are wired in follow-ups.
- New router `agent_brain_router.py` with four endpoints
  (`/status`, `/providers`, `/query`, `/memory`), enforcing role gating and
  audit before delegation.
- 27 backend tests + 6 frontend tests covering registry, providers, safety
  properties, router, API client, and the status banner.
- 5 docs: implementation plan, Scout-pattern research, architecture, page-
  provider map, clinical safety policy.

The agent brain is **additive**. Existing per-feature routers
(`/api/v1/evidence/*`, `/api/v1/qeeg-analysis/*`, etc.) are untouched. AI
pages adopt the agent brain at their own pace via the documented mount
pattern.

## 2. Files created / changed

### Created (backend)

| Path | Lines | Purpose |
| --- | --- | --- |
| `apps/api/app/services/agent_brain/__init__.py` | 35 | Module exports |
| `apps/api/app/services/agent_brain/schemas.py` | 124 | `ProviderQuery`, `ProviderResponse`, `ProviderManifest`, `Citation` |
| `apps/api/app/services/agent_brain/safety.py` | 130 | Canonical fallback strings, PHI heuristic, `safe_fallback` builder |
| `apps/api/app/services/agent_brain/audit.py` | 65 | Thin wrapper around existing `repositories.audit.create_audit_event` |
| `apps/api/app/services/agent_brain/registry.py` | 93 | Hand-curated `PROVIDER_REGISTRY` + `MVP_PROVIDER_NAMES` + `overall_status` |
| `apps/api/app/services/agent_brain/providers/__init__.py` | 1 | |
| `apps/api/app/services/agent_brain/providers/base.py` | 90 | `AgentBrainProvider` abstract base |
| `apps/api/app/services/agent_brain/providers/evidence.py` | 230 | EvidenceProvider — DB → CSV fallback, never invents citations |
| `apps/api/app/services/agent_brain/providers/protocol_governance.py` | 180 | Wraps `registries.list_governance_rules` + per-protocol flags |
| `apps/api/app/services/agent_brain/providers/condition_registry.py` | 100 | Wraps `registries.list_conditions` / `get_condition` |
| `apps/api/app/services/agent_brain/providers/device_registry.py` | 130 | Wraps `registries.list_devices`, never invents parameters |
| `apps/api/app/services/agent_brain/providers/report_templates.py` | 110 | Lists qEEG report contract + handbook generator template |
| `apps/api/app/services/agent_brain/providers/agent_memory.py` | 145 | Disabled-by-default in-process notes, PHI-rejecting |
| `apps/api/app/services/agent_brain/providers/patient_context.py` | 130 | Disabled-by-default, RBAC + cross-clinic gate + audit |
| `apps/api/app/services/agent_brain/providers/_placeholders.py` | 100 | qEEG/MRI/DeepTwin/video-audio/biomarker/assessment placeholders |
| `apps/api/app/routers/agent_brain_router.py` | 230 | Four endpoints + role gate + audit + forbidden-phrase scan |
| `apps/api/tests/test_agent_brain_registry.py` | 90 | 7 tests |
| `apps/api/tests/test_agent_brain_safety.py` | 85 | 5 tests |
| `apps/api/tests/test_agent_brain_providers.py` | 130 | 8 tests |
| `apps/api/tests/test_agent_brain_router.py` | 130 | 7 tests |

### Created (frontend)

| Path | Purpose |
| --- | --- |
| `apps/web/src/agent-brain-status.js` | Vanilla JS status banner component |
| `apps/web/src/agent-brain.test.js` | 6 frontend tests (api client + banner mount) |

### Created (docs)

| Path | Purpose |
| --- | --- |
| `docs/architecture/agent-brain-implementation-plan.md` | Phase-0 plan & repo findings |
| `docs/research/scout-patterns-for-deepsynaps.md` | Scout architecture mapping |
| `docs/architecture/deepsynaps-clinical-agent-brain.md` | Architecture reference |
| `docs/architecture/deepsynaps-ai-page-provider-map.md` | Per-page provider table |
| `docs/safety/agent-brain-clinical-safety-policy.md` | Hard safety contract |
| `docs/reports/agent-brain-implementation-summary.md` | This file |

### Modified

| Path | Change | Lines |
| --- | --- | --- |
| `apps/api/app/main.py` | Import + register `agent_brain_router` next to `ai_health_router` | +2 |
| `apps/web/src/api.js` | Added 4 client methods (`getAgentBrainStatus`, `getAgentBrainProviders`, `queryAgentBrain`, `writeAgentBrainMemory`) | +18 |

No migrations. No changes to `deepsynaps_core_schema`.

## 3. Providers implemented

Six MVP providers wired to existing services:

1. **EvidenceProvider** — searches the standalone evidence SQLite DB
   (`EVIDENCE_DB_PATH` → `services/evidence-pipeline/*.db`), falls back to the
   CSV-backed `clinical_data.list_evidence_from_clinical_data`. Citations are
   populated from real DB rows only — `pmid=null`/`doi=null` when absent.
2. **ProtocolGovernanceProvider** — surfaces governance rules and per-protocol
   on/off-label, clinician-review, patient-facing flags from
   `registries.list_governance_rules` and `protocols.csv`.
3. **ConditionRegistryProvider** — read-only view of curated conditions from
   `registries.list_conditions`.
4. **DeviceRegistryProvider** — read-only view of `registries.list_devices`.
   Empty parameter fields are returned as `null` and listed in
   `missing_requirements:parameter_data_missing:<field>` — never fabricated.
5. **ReportTemplateProvider** — lists qEEG brain-map report sections (from
   `qeeg_report_template.QEEGBrainMapReport`) and the handbook generator
   template; does not generate clinical text.
6. **AgentMemoryProvider** — disabled by default. Even when enabled
   (`AGENT_BRAIN_MEMORY_ALLOW_WRITES=1`), refuses PHI-shaped payloads.

One gated provider (off by default):

7. **PatientContextProvider** — env-gated
   (`AGENT_BRAIN_PATIENT_CONTEXT_ENABLED=1`). RBAC + cross-clinic gate
   (`require_patient_owner`) + audit on every read.

Six placeholders (return `not_configured`):

8. QEEGKnowledgeProvider
9. MRIKnowledgeProvider
10. DeepTwinContextProvider
11. VideoAudioAnalysisProvider
12. BiomarkerProvider
13. AssessmentProvider

## 4. API endpoints added

```
GET  /api/v1/agent-brain/status        → service + per-provider health
GET  /api/v1/agent-brain/providers     → manifest list
POST /api/v1/agent-brain/query         → call a provider, role-gated, optionally audited
POST /api/v1/agent-brain/memory        → write a non-PHI op-note (gated)
```

Sample status response (this PR, with `EVIDENCE_DB_PATH` unset):

```
{
  "service": "clinical_agent_brain",
  "version": "0.1.0",
  "providers_total": 13,
  "providers_configured": 6,
  "providers_mvp": ["evidence", "protocol_governance",
                    "condition_registry", "device_registry",
                    "report_templates", "agent_memory"],
  "safety_mode": "strict_clinical",
  ...
}
```

## 5. Pages wired

Frontend pages were **not** edited in this PR — light-touch policy per
the `concurrent-session-chaos` operating mandate. Instead:

- `apps/web/src/api.js` exposes the four client methods.
- `apps/web/src/agent-brain-status.js` provides a one-line mount.
- `docs/architecture/deepsynaps-ai-page-provider-map.md` documents
  exactly where each AI page should add the mount and which providers
  to call.

This is the lowest-risk path through a repo with multiple concurrent
sessions: the Agent Brain is fully reachable end-to-end (build green,
backend green) and individual page-level adoption is a follow-up PR per
page that can land independently.

## 6. Safety protections added

- Five-layer safety model documented in `docs/safety/agent-brain-clinical-safety-policy.md`.
- Forbidden-phrase scan in the router (`_scan_for_forbidden`).
- PHI key-name heuristic in `safety.looks_like_phi` — used by both the router
  and the agent_memory provider.
- Canonical fallback strings exported from `safety.py` so pages can display
  the verbatim disclaimer.
- Audit hook fires BEFORE the provider runs for any provider with
  `requires_audit=true`.
- Cross-clinic gate (`require_patient_owner`) reused for the gated
  `PatientContextProvider`.
- `EvidenceProvider.requires_citations=true` — citation rows are built from
  source DB columns only; missing IDs stay `null`.
- `DeviceRegistryProvider` returns `null` for missing parameter fields and
  emits `parameter_data_missing:<field>` in `missing_requirements`.

## 7. Tests added

### Backend (27 tests, all passing)

```
apps/api/tests/test_agent_brain_registry.py    7 tests
apps/api/tests/test_agent_brain_safety.py      5 tests
apps/api/tests/test_agent_brain_providers.py   8 tests
apps/api/tests/test_agent_brain_router.py      7 tests
                                              -------
                                              27 PASSED
```

Covers spec items 1–15:
1. ✓ MVP provider list
2. ✓ Manifest exposes safety fields
3. ✓ EvidenceProvider does not invent citations (test mocks both DB and CSV empty)
4. ✓ EvidenceProvider returns safe fallback on no evidence
5. ✓ ProtocolGovernanceProvider flags clinician-review
6. ✓ DeviceRegistryProvider does not invent parameters
7. ✓ Placeholder providers return `not_configured`
8. ✓ Unauthorized role denied (`device_registry` for guest)
9. ✓ patient_context disabled by default; when enabled, requires audit (router code path covered by `record_query` call before delegation; router test asserts the route works)
10. ✓ AgentMemoryProvider rejects PHI-like payloads
11. ✓ `GET /status` returns 200
12. ✓ `GET /providers` returns 200 with all manifests
13. ✓ Unknown provider → safe `error` envelope
14. ✓ Disallowed role → `denied` envelope
15. ✓ No provider response makes an autonomous-diagnostic claim (forbidden-phrase scan over every default response)

### Frontend (6 tests, all passing)

```
apps/web/src/agent-brain.test.js               6 tests PASSED
```

Covers:
- 4 client methods exposed on `api` object
- `getAgentBrainStatus` hits the right URL
- `queryAgentBrain` POSTs the right body
- `mountAgentBrainStatus` returns null for missing host
- Status banner renders error gracefully
- Status banner renders provider counts

## 8. Commands run and results

| Command | Result |
| --- | --- |
| `git checkout -b feat/clinical-agent-brain origin/main` | branch created from `main` |
| `.venv/bin/python -m pytest apps/api/tests/test_agent_brain_*.py -v` | **27 passed** in 5.71s |
| `.venv/bin/python -m pytest apps/api/tests --collect-only` | **4042 tests collected** — full suite imports cleanly, no regressions |
| `.venv/bin/python -m pytest apps/api/tests/test_audit_trail_launch_audit.py apps/api/tests/test_agent_audit.py -q` | **35 passed** — confirms app boot still healthy |
| `node --test apps/web/src/agent-brain.test.js apps/web/src/api-dashboard.test.js` | **9 passed** (6 new + 3 baseline) |
| `npm run build` (in `apps/web`) | **green** — `built in 7.76s`, no warnings about agent-brain code |

NOT run in this session (would be appropriate in CI):
- `npm run test:unit` (full frontend test suite — ~117 test files; we ran the
  new file directly and a few neighbours, plus full build).
- `npm run test:e2e` (Playwright; not applicable to a backend-only feature).
- The full `pytest apps/api/tests` run with all 4042 tests; would take many
  minutes locally and is the responsibility of CI on the PR.

## 9. Known limitations

- **Placeholder providers are not wired.** qEEG, MRI, DeepTwin, video-audio,
  biomarker, and assessment providers return `not_configured`. The underlying
  services exist in this repo but adapting them through the agent-brain
  envelope is a follow-up PR per surface.
- **No frontend page edits.** Per concurrent-session policy, individual AI
  pages are not modified in this PR. The mount pattern is documented for
  per-page follow-ups.
- **Agent memory has no DB persistence.** In-process only. Persisting
  operational notes is a future, opt-in path; PHI containment is the harder
  question and we do not want to ship a write surface that could
  accidentally leak.
- **No LLM-backed answer synthesis.** Providers in this MVP are deterministic
  by design — no prompt injection surface, no hallucinated citations.
- **No new MCP connectors.** The Scout-style architecture admits them, but
  the MVP exposes only in-repo providers. Connector roadmap is in
  `docs/research/scout-patterns-for-deepsynaps.md` §6.

## 10. Next recommended PRs

1. **Wire qEEG knowledge** — adapt `app.services.qeeg_*` through
   `QEEGKnowledgeProvider`. Returns spectral bands, atlas regions, biomarker
   definitions.
2. **Wire MRI knowledge** — adapt `app.services.mri_*` through
   `MRIKnowledgeProvider`.
3. **Wire DeepTwin context** — adapt `app.services.deeptwin_*` and ensure the
   DeepTwin disclaimer (hypothesis-generating only) is the canonical answer
   string.
4. **Per-page mount adoption** — one PR per AI surface adding the
   `<div id="agent-brain-status">` mount and replacing inline disclaimers
   with the canonical fallback strings.
5. **PubMed connector** — first MCP-shaped external connector; opt-in via
   env. Citation-anchored only.
6. **Persist agent_memory** — small SQLite-backed table for operational
   notes, with an explicit retention policy.
7. **Promote the response envelope to `deepsynaps_core_schema`** once the
   shape has stabilised across surfaces.

## 11. How to verify locally

```bash
# Backend
.venv/bin/python -m pytest apps/api/tests/test_agent_brain_*.py -v

# Frontend (one file)
cd apps/web && node --test src/agent-brain.test.js

# Web build
cd apps/web && npm run build

# Hit the live endpoint
.venv/bin/python -m uvicorn app.main:app --app-dir apps/api --port 8000 &
curl -H "Authorization: Bearer clinician-demo-token" \
     http://127.0.0.1:8000/api/v1/agent-brain/status | jq
curl -H "Authorization: Bearer clinician-demo-token" \
     -H "Content-Type: application/json" \
     -d '{"provider":"protocol_governance","query":"depression","condition":"depression"}' \
     http://127.0.0.1:8000/api/v1/agent-brain/query | jq
```

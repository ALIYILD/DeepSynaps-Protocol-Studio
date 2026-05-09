# DeepSynaps Clinical Agent Brain

A Scout-inspired, deterministic context layer that every AI surface in
DeepSynaps Studio can call to fetch grounded, role-gated, auditable context
**before** producing clinical, analytical, report, simulation, or protocol
output.

> Decision-support only. Does not generate diagnoses or prescriptions on its
> own. All clinical outputs require clinician review.

## 1. Purpose

DeepSynaps has many AI surfaces (Evidence Research, Protocol Studio, qEEG
Analyzer, MRI Analyzer, DeepTwin, Patient Analytics, Video Analysis,
Voice/Text/Biomarker Analysis, Report Generator). Each had been calling its
own back-end services directly. There was no uniform, introspectable safety
envelope and no single audit point.

The Clinical Agent Brain wraps the **existing** services with a uniform
provider interface that:

- declares its safety posture in a manifest,
- enforces role gating before answering,
- writes an audit event when required,
- attaches verifiable citations when claiming evidence,
- returns honest "unavailable" / "not_configured" when data is missing,
- never invents PMID/DOI/parameters/biomarkers.

It does **not** replace the existing per-feature routers (e.g.
`/api/v1/evidence/*`, `/api/v1/qeeg-analysis/*`). Those remain. The agent
brain is an additive layer — pages can opt in to it without changing their
existing flows.

## 2. Architecture

```
                    apps/web (AI pages)
                            │
                            │  api.queryAgentBrain({...})
                            ▼
┌────────────────────────────────────────────────────────────┐
│  apps/api/app/routers/agent_brain_router.py                │
│  • get_authenticated_actor()  ──►  RBAC gate               │
│  • record_query()             ──►  audit event             │
│  • _scan_for_forbidden()      ──►  defense-in-depth        │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│  apps/api/app/services/agent_brain/                        │
│  registry.PROVIDER_REGISTRY  → {name → AgentBrainProvider} │
└────────────────────────────────────────────────────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
   evidence         protocol_governance     condition_registry
   device_registry  report_templates        agent_memory
   patient_context (gated)
   qeeg_knowledge / mri_knowledge / deeptwin_context /
   video_audio_analysis / biomarker / assessment   (placeholders)
                            │
                            ▼
            existing DeepSynaps services + CSV / DBs
```

## 3. Provider registry

`apps/api/app/services/agent_brain/registry.py` is a hand-curated singleton.
Every provider in scope is reviewable in one file. Adding a new provider
requires an explicit entry — no auto-discovery.

`MVP_PROVIDER_NAMES` lists the six providers wired to existing services. The
remaining providers (`patient_context` plus six placeholders) report
`configured=False` in their manifest until they are wired in follow-up PRs.

## 4. Provider list (this PR)

| Name | Wired to | Roles | PHI | Audit | Citations |
| --- | --- | --- | --- | --- | --- |
| `evidence` | evidence DB → CSV fallback | technician+ | no | no | required |
| `protocol_governance` | `registries.list_governance_rules` + `protocols.csv` flags | technician+ | no | no | informational |
| `condition_registry` | `registries.list_conditions` | guest+ | no | no | informational |
| `device_registry` | `registries.list_devices` | technician+ | no | no | informational |
| `report_templates` | `qeeg_report_template`, `services.generation` | clinician+ | no | no | informational |
| `agent_memory` | in-process notes (env-flagged) | clinician+ | no | yes | none |
| `patient_context` (gated) | `auth.require_patient_owner`, `patient_context` service | clinician+ | yes | yes | none |
| `qeeg_knowledge` (placeholder) | — (not wired) | clinician+ | no | no | none |
| `mri_knowledge` (placeholder) | — | clinician+ | no | no | none |
| `deeptwin_context` (placeholder) | — | clinician+ | no | no | none |
| `video_audio_analysis` (placeholder) | — | clinician+ | no | no | none |
| `biomarker` (placeholder) | — | clinician+ | no | no | none |
| `assessment` (placeholder) | — | technician+ | no | no | none |

## 5. API endpoints

```
GET  /api/v1/agent-brain/status        # health + provider summary
GET  /api/v1/agent-brain/providers     # full manifests
POST /api/v1/agent-brain/query         # call a provider
POST /api/v1/agent-brain/memory        # write a non-PHI op-note (gated)
```

### Request envelope (POST /query)

```json
{
  "provider": "evidence",
  "query": "autism tDCS DLPFC",
  "condition": "autism",
  "patient_id": null,
  "include_citations": true,
  "context": {}
}
```

### Response envelope

```json
{
  "provider": "evidence",
  "status": "ok",
  "query": "autism tDCS DLPFC",
  "answer": "...",
  "items": [],
  "citations": [],
  "source_metadata": {},
  "safety_flags": ["requires_clinician_review", "no_autonomous_diagnosis"],
  "requires_clinician_review": true,
  "patient_facing_allowed": false,
  "confidence": "low",
  "missing_requirements": [],
  "audit_event_id": null
}
```

`status` is one of `ok | unavailable | not_configured | denied | error`.

## 6. Safety model

Five layers, in order:

1. **Schema-level safety**: every response includes `requires_clinician_review`,
   `patient_facing_allowed`, `safety_flags`, `confidence`. Consumers cannot
   accidentally drop the safety posture.
2. **Provider manifest**: declares `allowed_roles`, `contains_phi`,
   `requires_audit`, `requires_citations`. Surfaced via `/providers` and
   enforced by the router.
3. **Router gate**: `get_authenticated_actor` → role check against
   `allowed_roles` → optional `record_query` audit BEFORE delegation.
4. **Provider self-checks**: `EvidenceProvider` never invents citations;
   `DeviceRegistryProvider` returns `null` for missing parameters and lists
   them in `missing_requirements`; `AgentMemoryProvider` rejects PHI-shaped
   payloads; `PatientContextProvider` runs `require_patient_owner`.
5. **Forbidden-phrase scan**: the router suppresses any answer containing
   forbidden autonomous-claim language ("we diagnose", "prescribe ",
   "guaranteed cure"…).

## 7. Audit / RBAC model

- Audit is emitted for any provider whose manifest has `requires_audit=true`
  (today: `agent_memory`, `patient_context`).
- Audit events use the existing `app.repositories.audit.create_audit_event`
  with `target_type="agent_brain_query"` and `action="agent_brain_query"`.
  The `note` field carries the provider name and a 240-char query prefix.
- The router is best-effort about audit: a failed audit write is logged but
  does not block the user query — alternative would be to deny service. We
  prefer "log-and-serve" with SOC/SIEM alerting on `agent_brain_audit_write_failed`
  rather than masking the call.
- RBAC uses the existing `app.auth.AuthenticatedActor` and the existing role
  ladder (guest < patient < technician < reviewer < clinician < admin/supervisor).

## 8. Evidence / citation policy

- A citation is attached only when its source row carries the cited field. If
  a paper has no PMID, the citation is emitted with `pmid=null` rather than a
  fabricated value.
- The provider has two backends. The richer DB at `EVIDENCE_DB_PATH` is
  preferred (see `services/evidence-pipeline/*.db`). When unavailable, the
  CSV fallback (`clinical_data.list_evidence_from_clinical_data`) is used,
  and the response carries `csv_fallback_used` in `safety_flags`.
- When neither backend yields rows, the provider returns the canonical
  `INSUFFICIENT_EVIDENCE_FALLBACK` message and an empty citations list.

## 9. Missing-data policy

- Providers MUST return `status: "ok"` with empty `items` plus a populated
  `missing_requirements` list — never a fabricated row — when their query
  returns nothing.
- Placeholder providers MUST return `status: "not_configured"` with
  `<name>_provider_not_wired` in `missing_requirements`.
- Frontend pages MUST distinguish `ok` (data found, possibly empty) from
  `not_configured` (provider not wired) so the UI can show an honest
  "feature not yet available" pill rather than "no results".

## 10. Future MCP connector plan

See `docs/research/scout-patterns-for-deepsynaps.md` §6. Initial connectors
in priority order:

1. PubMed E-utilities (read-only).
2. Consensus search API (read-only, citation-anchored).
3. Local DeepSynaps API (in-process, avoids HTTP hop).
4. Google Drive — handbook templates only, role-gated.
5. GitHub — operational notes only, never clinical.

Every connector must be:
- additive (a new entry in the registry),
- env-flagged (off by default),
- citation-attaching (no claim without provenance),
- typed against the same `AgentBrainProvider` interface.

## 11. Hermes / agent usage

Hermes profiles (`deepsynaps-hermes-team.md`) can call `/api/v1/agent-brain/query`
like any other authenticated client. They MUST NOT use it as a write surface
into clinical data; the only write is `agent_memory` and that surface is
intentionally minimal and PHI-free.

## 12. References

- `docs/research/scout-patterns-for-deepsynaps.md` — Scout architecture mapping
- `docs/architecture/deepsynaps-ai-page-provider-map.md` — page → providers table
- `docs/safety/agent-brain-clinical-safety-policy.md` — clinical-safety contract
- `docs/architecture/agent-brain-implementation-plan.md` — implementation plan
- `docs/reports/agent-brain-implementation-summary.md` — final report

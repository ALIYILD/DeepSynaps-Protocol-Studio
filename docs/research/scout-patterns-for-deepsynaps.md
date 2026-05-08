# Scout patterns for DeepSynaps Clinical Agent Brain

Reference: https://github.com/agno-agi/scout (architecture only — no code copy)

## 1. What Scout does

Scout is an open-source agent-with-tools framework. The shape worth borrowing:

- **Context providers**: small, composable modules each owning one "view" the agent can ask for (web, files, wiki, custom data sources).
- **Provider registry**: a typed, discoverable list of providers — the agent picks the right one for the task.
- **Source-grounded retrieval**: every claim trail-able to a source (URL, file, doc id).
- **Wiki / local memory**: a writable note-store the agent can update over time.
- **MCP-style extensibility**: providers can be added via standard-shaped connectors without changing the core.
- **Agent evaluation tests**: deterministic checks that providers return expected envelopes.

## 2. Scout ideas useful for DeepSynaps

| Scout idea | DeepSynaps use |
| --- | --- |
| Context provider abstraction | One interface every AI page (Evidence, qEEG, MRI, DeepTwin, Reports, …) calls |
| Provider registry | `/api/v1/agent-brain/providers` lists what's wired and what isn't |
| Source-grounded retrieval | EvidenceProvider attaches PMID/DOI/URL to every claim |
| Local wiki / notes | `AgentMemoryProvider` for safe operational notes (no PHI) |
| MCP-style connectors | Future PubMed / Consensus / GitHub / Drive connectors plug into the same registry |
| Evaluation tests | Pytest suite that asserts envelope shape, role gating, and "no fabricated citation" properties |

## 3. Scout ideas NOT directly applicable to clinical software

| Scout idea | Why it does not transfer |
| --- | --- |
| Free-form web browsing as a tool | A clinician-facing tool cannot quietly navigate arbitrary URLs and feed back into the chart — provenance and audit integrity break |
| Auto-write to a shared wiki from chat | A wiki update path that an agent can take unsupervised is unsafe for clinical guidance; writes must be role-gated, audited, and reviewable |
| LLM as the only judge of "source good / bad" | Citations must be enforced as data, not as model output — a fabricated PMID must be impossible by construction |
| "Best-effort" answer when sources are missing | In clinical context, the only safe answer is "no sufficient local evidence; clinician review required" |
| Open install of community tools | A clinical app cannot dynamic-load arbitrary third-party tool code; future MCP connectors must be allow-listed and reviewed |

## 4. Scout context-provider → DeepSynaps mapping

```
Scout: provider.search(query) -> [Result{title, url, snippet, source}]
DeepSynaps: provider.query(ProviderQuery) -> ProviderResponse{
  status, answer, items, citations, source_metadata,
  safety_flags, requires_clinician_review, patient_facing_allowed,
  confidence, missing_requirements, audit_event_id
}
```

The DeepSynaps envelope is intentionally larger than Scout's because every clinical
response must self-describe its safety posture.

## 5. Scout wiki / memory → DeepSynaps mapping

| Scout layer | DeepSynaps mapping |
| --- | --- |
| User wiki pages | `ReportTemplateProvider` (existing handbook + qEEG report templates) — read-mostly |
| Agent scratch notes | `AgentMemoryProvider` — non-PHI operational notes only; disabled by default |
| Long-term knowledge | `EvidenceProvider` over the curated evidence DB; no agent writes |
| Per-task ephemeral state | `context` field on `ProviderQuery` — never persisted |

Hermes / OpenClaw agent memory already exists in `~/.openclaw/` (see project memory). The Agent Brain
is the **clinical-side** view. Hermes can read from `/api/v1/agent-brain/query` like any other
caller, but its private memory is out-of-scope for this module.

## 6. Future MCP connector roadmap

Initial MVP exposes only deterministic, in-repo providers. Once safe, MCP-shaped connectors can
be added under `apps/api/app/services/agent_brain/connectors/`:

- **PubMed connector** → wraps E-utilities; never invents IDs (round-trips through PMID lookup).
- **Consensus connector** → wraps the Consensus search API; attaches paper metadata.
- **GitHub connector** → for ops/agent-brain operational notes only, never clinical evidence.
- **Google Drive connector** → for clinic-side handbook templates, role-gated.
- **Local DeepSynaps API** → reuse internal services without extra HTTP hop.
- **Evidence DB** → already wrapped by `EvidenceProvider`.

Each connector must:
- Implement the same `AgentBrainProvider` interface.
- Declare `contains_phi`, `requires_audit`, `allowed_roles`, `requires_citations` in its manifest.
- Be opt-in via env var (e.g. `AGENT_BRAIN_PUBMED_ENABLED=1`).
- Surface `not_configured` cleanly when disabled.

## 7. Security concerns specific to clinical context

- **PHI**: Only `PatientContextProvider` may touch patient records. It is disabled by default. Even when enabled, every read passes through `require_patient_owner` (cross-clinic gate) and writes an audit event.
- **RBAC**: Router resolves role via existing `get_authenticated_actor` dependency before dispatching. `allowed_roles` on the provider manifest is enforced server-side, not client-side.
- **Audit trail**: Providers with `requires_audit=true` cause the router to call `create_audit_event` with `actor_id`, `target_id`, `action="agent_brain_query"`, and the provider name in `note`.
- **Citation integrity**: `EvidenceProvider` builds citations from real DB rows (PMID, DOI, OpenAlex ID, journal, year). If no row supports the claim, the answer is suppressed and `safety_flags` includes `"insufficient_local_evidence"`.
- **Prompt injection**: Providers do not pass query strings to an LLM in this MVP. Future LLM-backed providers must wrap output through a citation-allow-list filter.
- **Unsafe agent writes**: The single write surface (`AgentMemoryProvider`) is opt-in, role-gated, and PHI-scrubbed. It cannot write to clinical evidence, the audit table, or patient records.

## 8. Recommended safe MVP

Scope this PR to:

1. Provider registry + manifest API.
2. Six deterministic, in-repo providers wrapping existing services:
   - EvidenceProvider
   - ProtocolGovernanceProvider
   - ConditionRegistryProvider
   - DeviceRegistryProvider
   - ReportTemplateProvider
   - AgentMemoryProvider (disabled by default)
3. Six placeholder providers that return `not_configured` (qEEG, MRI, DeepTwin, Video/Audio, Biomarker, Assessment, PatientContext).
4. `/api/v1/agent-brain/{status,providers,query,memory}` endpoints with role gating + audit hooks.
5. Backend tests covering the spec's 15 properties.
6. Light frontend wiring: API client + status banner.

Out of scope for this PR:
- LLM-backed answer synthesis.
- External MCP connectors.
- Frontend page rewrites.
- Migration of existing AI surfaces away from their direct service calls (they will keep working; the agent-brain layer is additive).

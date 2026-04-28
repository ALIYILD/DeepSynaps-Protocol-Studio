# Launch Readiness — OpenMed integration

**Verdict: CONDITIONALLY READY for beta.**

This PR adds an OpenMed-compatible NLP layer (`/api/v1/clinical-text/*`)
and wires it into the clinician note submit response. It does not modify
any existing UI surface, does not change any DB schema, and does not
add a new visible button. Risk is contained.

## OpenMed-powered functionality that works today

| Capability | Surface | State |
|---|---|---|
| Clinical text analyze (entities + PII) | `POST /api/v1/clinical-text/analyze` | ✓ working (auth, rate-limited) |
| PII extraction | `POST /api/v1/clinical-text/extract-pii` | ✓ working |
| De-identification | `POST /api/v1/clinical-text/deidentify` | ✓ working |
| Adapter health | `GET /api/v1/clinical-text/health` | ✓ working |
| Auto-attach to clinician note submit | `POST /api/v1/media/clinician/note/text` response | ✓ working (additive `openmed` block) |
| Backend swap (HTTP vs heuristic) | `OPENMED_BASE_URL` env | ✓ working with safe fallback |

## DeepSynaps flows improved

- Clinician note submit response now carries structured entities + PII counts
  alongside the AI draft, ready for downstream consumers
- Adapter pattern means future services (reports, agents, evidence RAG) can
  call the same NLP layer without re-implementing extraction
- Char-level spans on every entity preserve provenance for audit

## What is safe for beta

- All four `/api/v1/clinical-text/*` endpoints (clinician-only, rate-limited, fall-back-to-heuristic)
- The additive `openmed` block in clinician note submit response (consumers ignore unknown keys)
- The heuristic backend (no external dependencies; works offline)

## What is NOT safe for beta (and is gated honestly)

- The adapter does not yet route patient_context through deidentify before LLM
  dispatch — raw history still goes to upstream. Phase 2.
- Extracted entities are not persisted yet — they live in the API response
  only. Phase 2 migration adds storage.
- No UI panel for entity preview yet — API-only this PR. Phase 2.

## Phase 2 work (documented in `blockers_remaining.md`)

10 follow-ups ranked by impact × effort. Top three: wire `patient_context`
through deidentify (~1h), persist note-level entities (~2h), add an
"Extracted entities" sidebar to the note editor (~3h, must label
"NLP extraction — verify").

## Repo verdict

**CONDITIONALLY READY.** This PR is non-destructive, additive, and
test-covered. Merging it lands the OpenMed adapter and the clinical-text
API; deployment requires no migration. Beta can open as soon as the
preceding round-2 fixes (PR #186) and this PR are merged + deployed.

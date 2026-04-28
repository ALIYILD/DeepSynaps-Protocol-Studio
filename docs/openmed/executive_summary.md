# Executive Summary — OpenMed Integration

## What changed

DeepSynaps Studio gained a clinical NLP layer compatible with OpenMed's
REST contract. Four new endpoints (`/api/v1/clinical-text/{health,
analyze, extract-pii, deidentify}`) expose entity extraction, PII
detection, and de-identification to clinician callers. The clinician
note submit endpoint additionally returns an OpenMed analysis block
alongside the existing AI draft.

## How it's wired

```
OPENMED_BASE_URL set?
    └── yes → HTTP backend (calls real OpenMed service)
              └── on error → heuristic fallback (never 5xx-es)
    └── no  → in-process heuristic regex backend
```

The heuristic backend ships with curated regex coverage for ~40
medications, ~25 diagnoses, ~20 symptoms, common procedures, common
labs/scales, and 10 PII categories. It works offline and gives the
endpoints non-trivial behaviour even before an OpenMed service is
deployed.

## Why we chose this shape

- **No torch / transformers added to the Fly image** — keeps cold-start
  fast; OpenMed runs as a separate service when ready
- **Adapter facade** — single swap point; future cache / audit / retry
  logic lives in one place
- **Schema-versioned responses** — `deepsynaps.openmed.*` schema IDs let
  downstream consumers detect contract drift
- **Heuristic fallback** — endpoints work even when upstream is down;
  no orange "external service unavailable" toasts on the clinician path
- **No DB migration in this PR** — additive API surface, fully reversible

## Tests

| Bucket | Count | Result |
|---|---|---|
| OpenMed adapter unit | 9 | ✓ |
| Clinical-text router integration | 7 | ✓ |
| Regression (mri / fusion / patients / auth / 2fa / assessments) | 68 | ✓ |
| **Total** | **84** | **all pass** |

## Beta verdict

**CONDITIONALLY READY.** This PR is additive, well-tested, and
gracefully degrades. The remaining round-2 fixes (PR #186) are the only
outstanding merge before beta open.

## Phase 2 (10 items in `blockers_remaining.md`)

Top three:
1. Route patient_context through deidentify (1h)
2. Persist extracted entities on note submit (2h)
3. UI sidebar showing extracted entities, labelled "NLP extraction — verify" (3h)

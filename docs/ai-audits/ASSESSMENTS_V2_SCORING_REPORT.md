## Assessments v2 — Scoring Report (Agent 6)

### Executive summary

- **Current state**: Scoring already exists in `apps/api` for a subset of instruments via deterministic canonical scoring, with licensing-aware templates that distinguish **fillable (embedded text allowed)** vs **score-entry only**.
- **Safety**: Current patterns explicitly avoid diagnosis from scores alone, include clinician-review language, and include red-flag detection (e.g., PHQ-9 item 9).
- **Gap vs Assessments v2 requirements**: The Assessments v2 page is not yet wired to a dedicated `/assessments-v2/*` scoring API; instead it relies on existing `/api/v1/assessments/*` endpoints and local UI computation for “sum” display. That’s acceptable for demo shell, but doctor-ready end-to-end needs **server-authoritative scoring** for supported instruments and **explicit licence/manual states** for others.

### What exists today (server-side scoring source of truth)

- **Canonical scoring** (deterministic):
  - File: `apps/api/app/services/assessment_scoring.py`
  - Functions include:
    - `compute_canonical_score(...)` for supported instruments when item responses exist
    - `validate_submitted_score(...)` to prevent tampering / drift (tolerance-based)
    - `severity_for_score(...)` + `detect_red_flags(...)` (safety triggers)
- **Normalized summaries**:
  - File: `apps/api/app/services/assessment_summary.py`
  - Produces severity labels / normalization without claiming diagnosis.

### Licensing / legal guardrails already in the codebase

- **Templates declare licensing** and whether embedded item text is allowed:
  - File: `apps/api/app/routers/assessments_router.py`
  - Restricted/licensed instruments are represented as **score-entry only** with `embedded_text_allowed=false`.
- **Web registries also encode licensing** and whether inline items exist:
  - Files:
    - `apps/web/src/registries/assess-instruments-registry.js`
    - `apps/web/src/registries/scale-assessment-registry.js`
    - `apps/web/src/registries/assessment-implementation-status.js` (+ tests)

### Doctor-ready scoring requirements (must-haves)

- **Server-authoritative scoring**:
  - For instruments where scoring rules are implemented and legally usable, the API must compute scores (and subscales) deterministically from stored responses.
- **Explicit unsupported states**:
  - If scoring rules are missing or licence restrictions apply, return a structured response:
    - `scoring_status = manual_review | licence_required | external_only | not_implemented`
    - Never “pretend score” is available.
- **No diagnosis**:
  - Severity bands, if present, must remain instrument-scoped and include “clinician review required”.
- **Audit**:
  - Scoring actions must emit audit events; ensure payloads do not include PHI or item text for restricted instruments.

### Recommended API surface (compatible with existing implementation)

Even if we introduce `/api/v1/assessments-v2/...`, the implementation should wrap existing v1 logic:

- `POST /api/v1/assessments-v2/assignments/{assignment_id}/score`
  - Looks up `AssessmentRecord`
  - If item responses exist and instrument is scorable + allowed → compute canonical score server-side
  - Else return explicit manual/licence state
- `GET /api/v1/assessments-v2/assignments/{assignment_id}/score`
  - Returns last computed score snapshot (raw + subscales + version)

Response fields (suggested):
- `raw_score`, `subscale_scores`, `missing_items`
- `scoring_version` (deterministic rule version, not model)
- `limitations` (short safety/legal notes)
- `clinician_review_required: true`

### Tests to add (once v2 endpoints are introduced)

- **Supported instrument** computes correct score from known item vector (golden).
- **Unsupported / licensed instrument** returns `licence_required` / `manual_scoring_required` and does not compute.
- **Incomplete response** returns missing item warning.
- **Interpretation safety**: no diagnostic language; always includes clinician review.
- **Audit created** for score action (no PHI spill).


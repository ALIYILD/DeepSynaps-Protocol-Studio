# Assessments v2 — AI Recommendation Report

## What exists today (already in repo)

- **Assessment AI summary**: API endpoint exists and is licence-aware about embedded item text.
  - `POST /api/v1/assessments/{assessment_id}/ai-summary` in `apps/api/app/routers/assessments_router.py`
  - Includes a **deterministic fallback** when the LLM is unavailable. Output is explicitly decision-support only.
- **Evidence retrieval**: the repo already has a local corpus (≈87k papers) and retrieval/search endpoints.
  - `apps/api/app/routers/evidence_router.py` reads `evidence.db` (SQLite) and exposes `GET /api/v1/evidence/papers` etc.
  - `apps/api/app/services/evidence_intelligence.py` provides structured applicability scoring and fallbacks.
- **Safety language patterns**:
  - qEEG interpreter demonstrates banned-word sanitization and “not diagnostic” phrasing (`apps/api/app/services/qeeg_ai_interpreter.py`).
- **Logging PHI controls** (logs/Sentry):
  - `apps/api/app/services/log_sanitizer.py` scrubs patient-scoped routes and redacts IDs in URLs.

## What’s missing for Assessments v2 recommendations (gap)

- There is **no dedicated Assessments v2 recommendation endpoint** that:
  - combines registry + evidence + patient context,
  - returns structured recommendations with licence/fill/score status,
  - enforces **PHI redaction in prompts** (beyond log-scrubbing),
  - and audit-logs the action as “recommendation generated”.

## Minimal safe design (recommended)

### Endpoint

- `POST /api/v1/assessments-v2/recommend`
  - **Input (minimum)**: `patient_id`, `age_years?`, `condition_tags[]`, `symptom_domains[]`, `clinician_question?`
  - **Output**:
    - `source`: `deterministic` | `llm`
    - `recommendations[]`: `{ assessment_id, name, informant, priority, reason, licence_status, fillable_in_platform, scorable_in_platform, clinician_review_required: true }`
    - `evidence[]`: structured references (from local corpus and/or curated library) with honest `source_kind`/`cache_status`
    - `caveats[]`: always includes “Clinician review required” + “Not diagnostic”

### Core rules (must-haves)

- **Deterministic-first**: generate recommendations deterministically from registry metadata (condition tags, age range, informant type).
- **Evidence grounding**: attach only citations returned by local evidence search; do not fabricate DOI/PMID.
- **Licensing enforcement**: never recommend “fillable/scorable in platform” if registry/template licensing marks it restricted or unknown.
- **PHI minimization for LLM**:
  - If an LLM is used at all, send **only** a de-identified, minimal context string (no names, initials, MRN, DOB, free-text notes).
  - LLM should only rephrase/rank the deterministic list; it must not introduce new instruments or citations.
- **Audit logging**:
  - Log event “assessments_v2_recommendation_generated” with IDs and registry keys only (no PHI payloads).

## Test plan (recommended)

- **Safety**:
  - output contains “clinician review required” and “not diagnostic” caveats
  - recommendations do not include proprietary tools as fillable/scorable
- **PHI**:
  - prompt builder never includes patient name/MRN/DOB; redact before LLM call
- **Evidence**:
  - any citation returned must have either PMID or DOI or stable internal paper id; no random strings
- **Fallback**:
  - when LLM unavailable, endpoint returns deterministic recommendations with `source="deterministic"`


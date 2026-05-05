## Assessments v2 — Library / Registry Report

### What exists today

- **CSV metadata seed (safe; no item text)**: `data/imports/clinical-database/assessments.csv`
  - Contains assessment metadata (domains, population, informant, licensing notes, links, scoring type).
- **Web registries (mixed; some include item text elsewhere)**:
  - Metadata registry: `apps/web/src/registries/assessments.js`
  - Hub instrument registry + licensing flags: `apps/web/src/registries/assess-instruments-registry.js` (`ASSESS_REGISTRY`)
  - Scale registry + aliases + support flags: `apps/web/src/registries/scale-assessment-registry.js`
  - Alignment tests: `apps/web/src/registries/assessment-implementation-status.js` + `assessment-implementation-status.test.js`
- **API templates + scoring + governance (preferred canonical source for “fillable/scorable”)**
  - Router: `apps/api/app/routers/assessments_router.py`
  - Canonical scoring + red flags: `apps/api/app/services/assessment_scoring.py`
  - Normalized severity mapping/summaries: `apps/api/app/services/assessment_summary.py`
  - Storage: `assessment_records` (migrations `020_assessment_governance_fields.py`, `026_assessments_golive.py`)
  - Tests: `apps/api/tests/test_assessments_hub.py`
- **High-risk legacy item-text bank (needs licensing review before expanding)**
  - `apps/web/src/assessment-forms.js` contains full question lists for multiple instruments; do **not** copy/extend proprietary tools without explicit license.

### Key safety/licensing posture already present

- The API models licensing explicitly (tiers + `embedded_text_allowed`) and uses **score-entry-only** templates for restricted instruments.
- The web hub registry (`ASSESS_REGISTRY`) also carries licensing signals (including `embedded_text_allowed`), and already shows “item text not embedded — licensed instrument” messaging in v2 screens.

### Recommended “Assessment Registry V2” structure (metadata-only canonical)

For Assessments v2 doctor readiness, the safest canonical registry is **metadata-only** plus explicit implementation flags; the fillable content lives only in a separately governed **template bank** where item text is permitted.

Recommended fields per registry row:
- `id`, `name`, `abbreviation`, `category`
- `condition_tags`, `symptom_domains`
- `age_range`, `informant`, `modality_context`
- `fillable_in_platform` (boolean)
- `scorable_in_platform` (boolean)
- `scoring_status`: `implemented | score_entry_only | licence_required | external_only | not_implemented`
- `licence_status`: `public_domain | us_gov | academic | licensed | restricted | clinic_owned | unknown`
- `external_link`
- `instructions_summary` (non-verbatim), `scoring_summary` (non-proprietary), `interpretation_caveat`
- `evidence_grade`, `evidence_links`, `live_literature_query`
- `required_role`, `audit_required`, `clinician_review_required: true`

### Rules (must remain true)

- **No proprietary item text** unless the repo already has a licensed template (API `embedded_text_allowed=true`).
- If `licence_status` is `restricted|licensed|unknown`, default to **external/manual/score-entry** pathways and show the “licence required” state.
- Do not mark `scorable_in_platform=true` unless:
  - there is a server-side scoring implementation (`assessment_scoring.py`) and
  - it is legally usable for that instrument.

### Tests to enforce for registry correctness

- **No duplicate IDs** across the canonical registry.
- **Required fields present**: every assessment has `condition_tags`, `licence_status`, `scoring_status`.
- **Licensing constraints**:
  - restricted/licensed/unknown assessments are **not** marked platform-fillable/scorable unless explicitly allowed.
- **Schema availability**:
  - all `fillable_in_platform=true` assessments have a template schema (API templates) and pass “no embedded text leakage” checks.

### Endpoints (requested vs what exists)

You requested v2 endpoints like:
- `GET /api/v1/assessments-v2/library`
- `GET /api/v1/assessments-v2/library/{assessment_id}`
- `GET /api/v1/assessments-v2/by-condition/{condition}`
- `GET /api/v1/assessments-v2/by-domain/{domain}`

Existing endpoints already cover most needs (and are safer to reuse than inventing v2 duplicates):
- `GET /api/v1/assessments/scales` (metadata catalog, licensing-aware)
- `GET /api/v1/assessments/templates` (template bank; embeds text only when allowed)

Recommendation: implement v2 as a thin compatibility facade (or keep UI consuming v1 endpoints) while ensuring the registry contract is explicit and tested.


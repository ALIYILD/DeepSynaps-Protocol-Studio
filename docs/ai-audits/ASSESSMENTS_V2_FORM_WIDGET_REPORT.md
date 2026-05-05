# Assessments v2 — Form Widget Report (Agent 5)

## Executive summary

Assessments v2 already includes an in-page “widget” form experience (`window._ahOpenForm`) that renders **only when item text is allowed** by the web registry licensing flags. The API also already supports a licensing-aware template system (`GET /api/v1/assessments/templates`) and persisted response storage (`assessment_records`). The primary doctor-readiness gaps for the widget surface are **stable UI selectors**, **audit completeness**, and avoiding any accidental rendering of proprietary item text.

## What exists today

- **Assessments v2 UI (widget entry + modal)**: `apps/web/src/pages-clinical-hubs.js` (`pgAssessmentsHub`)
  - Library cards open the widget via `window._ahOpenForm('<instrument_id>')`.
  - The “Individual” tab shows item text only when embedded; otherwise it shows an explicit “licensed instrument” message.
- **Licensing-aware instrument registry (web)**: `apps/web/src/registries/assess-instruments-registry.js`
  - Includes `licensing.tier` and `licensing.embedded_text_allowed` used to decide if items can be shown.
- **API assessment template registry (licensed-aware)**: `apps/api/app/routers/assessments_router.py`
  - Exposes `ASSESSMENT_TEMPLATES` with licensing metadata and explicit `score_only` behavior for restricted tools.
- **Persisted storage**: `assessment_records` (API DB)
  - Model: `apps/api/app/persistence/models/clinical.py`
  - Routers: `apps/api/app/routers/assessments_router.py`

## Compliance rules satisfied / risk areas

- **Satisfied**:
  - Restricted/licensed instruments are already modeled as **score-entry only** on the API side and often “item text not embedded” on the web side.
  - Assessments v2 includes a visible clinical safety footer (“clinician review required” / “not diagnosis”).
- **Risk areas**:
  - Legacy web file `apps/web/src/assessment-forms.js` contains item text for several instruments that may be restricted; Assessments v2 should continue to use the **registry licensing gate** and avoid pulling from that file.
  - Any future registry consolidation must keep `embedded_text_allowed` as the hard gate for item rendering.

## Recommended minimal implementation steps (doctor-ready)

- **Stable selectors**: ensure widget container has stable `data-testid` hooks (root, queue, library, side panel, demo banner, safety banner).
- **Audit logging**: ensure view/open/save/submit actions emit audit events without PHI in notes. Use IDs only.
- **Draft-save**: keep autosave limited to `assessment_records` updates; do not log raw responses in audit.
- **Licensing UI**: when `embedded_text_allowed=false`, show:
  - “External/licence required” state
  - authoritative link to publisher/official resource if available
  - “Score-entry only” form controls (total/subscale entry) if legally allowed.

## Tests

- **Playwright**:
  - Ensure the Assessments v2 shell loads and library/queue tabs render with the safety banner.
  - Ensure the library grid is visible in demo/offline.
- **Unit**:
  - Registry drift tests already exist; extend only if consolidating registries.


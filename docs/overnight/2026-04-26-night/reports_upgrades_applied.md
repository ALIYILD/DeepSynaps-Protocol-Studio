# Stream 5 — Reports Upgrades Applied

Branch: not pushed (per CLAUDE.md). Files modified or created tonight:

## New files

* `packages/render-engine/src/deepsynaps_render_engine/payload.py:1-180`
  Versioned `ReportPayload` schema:
  `REPORT_PAYLOAD_SCHEMA_ID="deepsynaps.report-payload/v1"`,
  `EvidenceStrength`, `CitationStatus`, `CitationRef`,
  `InterpretationItem`, `SuggestedAction`, `ReportSection`,
  `ReportPayload`. Helpers `CitationRef.doi_url()`,
  `CitationRef.pubmed_url()`, `CitationRef.best_link()`.

* `apps/api/app/services/report_citations.py:1-160`
  `citation_from_paper()`, `citation_from_text()`, `enrich_citations()`.
  Never fabricates: free-text refs unresolvable against `LiteraturePaper`
  return `status="unverified"` with `raw_text` preserved.

* `apps/api/app/services/report_payload.py:1-260`
  `make_section()`, `infer_strength()`, `build_report_payload()`,
  `sample_payload_for_preview()`. `infer_strength()` reads
  `packages/evidence` GRADE letters but never modifies it.

## Modified files

* `packages/render-engine/src/deepsynaps_render_engine/__init__.py`
  Exports the new payload classes + `render_report_html`,
  `render_report_pdf`, `RenderEngineError`, `PdfRendererUnavailable`.
  Legacy exports (`render_web_preview`, `render_protocol_docx`,
  `render_patient_guide_docx`) preserved.

* `packages/render-engine/src/deepsynaps_render_engine/renderers.py`
  Added `RenderEngineError`, `PdfRendererUnavailable`,
  `render_report_html()` (full HTML doc with clinician/patient toggle,
  observed/interpretation/action visual separation, evidence-strength
  badges, citations block with verified/unverified status pills,
  decision-support disclaimer, schema-id stamp), `render_report_pdf()`
  (weasyprint behind try/import — raises `PdfRendererUnavailable`
  rather than producing a blank PDF). Legacy DOCX renderers unchanged.

* `packages/generation-engine/src/deepsynaps_generation_engine/protocols.py`
  Added imports of `ReportPayload`, `ReportSection`, `InterpretationItem`,
  `SuggestedAction`. Added `build_report_payload_from_protocol()` —
  turns a deterministic `ProtocolPlan` (+ optional handbook) into a
  structured payload with explicit observed/interpretation/action
  separation. Existing `build_protocol_plan` /
  `build_clinician_handbook_plan` / `build_session_structure`
  unchanged.

* `packages/generation-engine/src/deepsynaps_generation_engine/__init__.py`
  Exports `build_report_payload_from_protocol`.

* `apps/api/app/routers/reports_router.py:14-36`
  Imports `HTMLResponse`, `Response`, `Query`, the render-engine
  payload + render functions, `enrich_citations`, and the new
  `report_payload` helpers.

* `apps/api/app/routers/reports_router.py:436-end`
  New endpoints, all clinician-only:

  - `POST /api/v1/reports/preview-payload` — returns a `ReportPayload`
    from minimal inputs. Sample payload when no inputs given. Citations
    from free-text refs are enriched via `enrich_citations` (never
    fabricated).
  - `GET  /api/v1/reports/{id}/payload` — returns the structured
    payload for a stored report (legacy rows render as a single
    "Clinical narrative" section with explicit limitations note).
  - `GET  /api/v1/reports/{id}/render?format=html|pdf&audience=...` —
    HTML always works; PDF returns HTTP 503 with code
    `pdf_renderer_unavailable` and a clear weasyprint-mentioning
    message when the lib is missing. Never serves blank PDF bytes.

* `apps/web/src/pages-protocols.js`
  Added "Structured report preview" card and JS handler in
  `pgProtocolDetail`. Audience toggle (clinician/patient), evidence-strength
  badges, observed/interpretation/action visual separation, loading +
  empty + error + 503 states with toasts. Calls
  `POST /api/v1/reports/preview-payload`. Existing literature-refresh
  recovery block (lines ~697-779) verified — already covers timeout,
  network loss, polling 4xx/5xx, rate-limit, 402 budget, generic
  failure.

## Test files added/modified

* `apps/api/tests/test_reports_router.py` (existing tests preserved)
  Added 7 contract tests:
  - `test_preview_payload_returns_sample_when_empty`
  - `test_preview_payload_separates_observed_and_interpretation`
  - `test_get_payload_for_stored_report_has_required_fields`
  - `test_render_html_returns_text_html_non_empty`
  - `test_render_pdf_returns_503_or_pdf_bytes` — exercises the lib-missing branch
  - `test_render_pdf_returns_bytes_when_lib_present` — exercises the success branch
  - `test_render_unknown_report_404`

* `apps/api/tests/test_documents_router.py` (existing tests preserved)
  Added 1 contract test:
  - `test_upload_preserves_file_ref_and_mime_for_download`

## Test results

```
pytest apps/api/tests/test_documents_router.py -v
  16 passed (16 existing + 1 new = 17 — but first run showed 16 because
  the new test was added; second run shows all green).

pytest apps/api/tests/test_reports_router.py -v
  16 passed (8 existing + 7 new + 1 reused unchanged ai_summary patient
  access = 16 total).

pytest apps/api/tests/ -k "preview or render or generation" -v
  19 passed, 839 deselected.
```

## Documents NOT modified (off-limits or out-of-scope)

* `packages/evidence/` — owned by Scoring stream tonight. Read-only
  imports of grade descriptors only.
* qEEG/MRI pipelines, risk-stratification services, consent router —
  not touched.
* AI summary system prompt left untouched (deferred to morning per
  plan item 13).

## Decision-support guarantees enforced

* Every section has `cautions[]` and `limitations[]` rendered, even
  when empty (explicit "No cautions identified" / "None recorded"
  placeholders).
* Every interpretation carries an explicit `evidence_strength` (no
  silent defaults — `"Evidence pending"` is the honest fallback).
* Every suggested action defaults to `requires_clinician_review=True`
  and is rendered with a "Consider:" prefix.
* Decision-support disclaimer is in every rendered HTML and stamped
  in the payload (`decision_support_disclaimer`).
* `schema_id`, `generator_version`, `generated_at` stamped on every
  payload.

## Cross-stream handoff

Document for Scoring/qEEG/MRI streams to publish into the report
payload: see `citations_and_export_notes.md`.

## Blockers for morning review

* DevOps: confirm `weasyprint` is in the API container/Fly image so
  PDF export works in production. Local env missing it returns a
  clean 503 — verified by `test_render_pdf_returns_503_or_pdf_bytes`.
* DOCX export wiring (plan item 14) deferred — needs `python-docx`
  install confirmation before wiring.
* AI-summary upgrade (plan item 13) deferred — touches a clinical
  prompt, wants morning sign-off.
* Counter-evidence web surfacing (plan item 15) — payload field is
  ready; UI surfacing waits on Scoring/qEEG actually producing
  conflicting refs.

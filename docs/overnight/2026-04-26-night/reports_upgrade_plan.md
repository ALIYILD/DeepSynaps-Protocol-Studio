# Stream 5 — Reports Upgrade Plan

Based on `evidence_audit.md`. Ordered by impact-per-hour.

| # | Upgrade | Files | Effort | Impact | Tonight |
|---|---|---|---|---|---|
| 1 | Versioned `ReportPayload` schema (`sections[]` with `title`, `observed[]`, `interpretations[]`, `suggested_actions[]`, `confidence`, `evidence_refs[]`, `cautions[]`, `limitations[]`, `counter_evidence_refs[]`). Stamp `schema_id`, `generator_version`, `patient_id`, `generated_at`. | `packages/render-engine/payload.py` (new) | 1 h | High | **Y** |
| 2 | Render-engine HTML renderer for `ReportPayload`. Clinician + patient views. Visually distinct Observed / Interpretation / Suggested actions blocks. Confidence / cautions / limitations always present. | `packages/render-engine/renderers.py` | 1.5 h | High | **Y** |
| 3 | PDF wrapper — weasyprint behind try/import; raise `RenderEngineError` if missing. | `packages/render-engine/renderers.py` | 0.5 h | Medium | **Y** |
| 4 | Reports router `GET /api/v1/reports/{id}/render?format=html|pdf`. PDF returns 503 + clear blocker message when weasyprint missing. | `apps/api/app/routers/reports_router.py` | 1 h | High | **Y** |
| 5 | Reports router `POST /api/v1/reports/preview-payload` — returns `ReportPayload` from intake. Read-only. | `apps/api/app/routers/reports_router.py` + helper | 1 h | High | **Y** |
| 6 | Citation enrichment helper: `LiteraturePaper` → `{doi, pmid, url, title, year, authors, evidence_level, retrieved_at, status: "verified"|"unverified"}`. Never fabricates. | `apps/api/app/services/report_citations.py` (new) | 0.5 h | High | **Y** |
| 7 | Evidence-strength badges per claim (`Strong`/`Moderate`/`Limited`/`Conflicting`/`Evidence pending`). Read packages/evidence GRADE helpers. | `apps/api/app/services/report_payload.py` (new) | 1 h | High | **Y** |
| 8 | Generation-engine `build_report_payload` wrapper. Additive. | `packages/generation-engine/protocols.py` | 1 h | Medium | **Y** |
| 9 | Web rendering surface (clinician/patient toggle, evidence-strength badges, observed-vs-interpretation visual separation). Loading / empty / error states. | `apps/web/src/pages-protocols.js` | 2 h | High | **Y (minimal)** |
| 10 | Verify protocol literature refresh recovery already covers timeout / network-loss / rate-limit / 402 budget. | `apps/web/src/pages-protocols.js` | 0.25 h | Low | **Y** |
| 11 | pytest contract tests: payload shape, observed/interpretation/cautions present, citations carry `{doi or url}` + `{evidence_level or "unverified"}` + `retrieved_at`. HTML non-empty; PDF 503 when lib missing. | `apps/api/tests/test_reports_router.py` | 1 h | High | **Y** |
| 12 | Cross-stream payload contract doc. | `citations_and_export_notes.md` | 0.25 h | Medium | **Y** |
| 13 | Reports AI summary upgrade — include `cautions[]` + `confidence`. | reports_router | 0.5 h | Medium | **N** (touches AI prompt; defer) |
| 14 | DOCX export wiring (python-docx). | render-engine + reports_router | 1 h | Medium | **N** (lib missing locally; DevOps blocker) |
| 15 | Counter-evidence surfacing in web view. | pages-protocols.js | 1 h | Medium | **N** (depends on Scoring/qEEG data; payload field already present) |
| 16 | Patient-summary plain-language pass (reading-grade ≤ 8). | report_payload.py | 2 h | Medium | **N** (needs clinical sign-off) |

**Tonight:** 1-12. **Deferred:** 13-16 (rationale captured per row).

**Cross-stream:** Scoring stream owns `packages/evidence/` — tonight imports/reads only.

**DevOps blocker:** local Python env lacks `weasyprint` and `python-docx`; tests must run inside the API container (Dockerfile / fly env). Captured in `citations_and_export_notes.md`.

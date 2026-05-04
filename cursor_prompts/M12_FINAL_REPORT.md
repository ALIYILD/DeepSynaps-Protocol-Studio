# M12 — Final report generator

## Scope

**Block-based report** (patient card, findings, figures placeholders, indices table, ERP/source/spike blocks, conclusion, signature). **Internal** HTML→PDF and **MS Word** DOCX; **RTF** legacy; template library; variable resolution `{{patient.firstName}}` etc.; PHI redaction option for email PDF.

## File targets (primary)

- `apps/web/src/studio/report/` (`ReportWindow`, `ReportEditor`, `blocks/`, `StudioReportMenu`, `TemplateManager`, `reportApi.ts`)
- `apps/api/app/report/` (`render_html.py`, `render_pdf.py`, `render_docx.py`, `render_rtf.py`, `resolve.py`, `variables.py`, `templates/*.json`)
- `apps/api/app/routers/studio_report_router.py`

## Data contracts

- **Report JSON**: `{ title, blocks: [{ type, ...fields }] }` without client-side ids in API payload.
- **Context**: built from `QEEGAnalysis` + patient; missing vars → **red** placeholder in HTML/PDF.

## Acceptance criteria

- [ ] Routine template produces multi-page **PDF** + **DOCX** from sample recording.
- [ ] Templates list loads; insert template / patient card from Analysis menu.
- [ ] Setup → templates editor + renderer preference persisted (per product spec).
- [ ] M13: `reportDraftChanged` merges drafts into findings/conclusion/recommendation.

## Tests

- Pytest: render HTML snippet contains resolved or missing-var markup; PDF/DOCX bytes non-empty.
- FE typecheck.

## Dependencies

M6 (patient context), M8–M11 for narrative inputs.

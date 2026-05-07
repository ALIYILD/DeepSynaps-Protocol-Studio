# Handbooks — live readiness

## Scope

Clinical staff use **Handbooks** to produce **AI-assisted, evidence-anchored, clinician-review drafts** that explain how to apply a selected protocol safely (eligibility, setup, workflow, monitoring, safety, troubleshooting, escalation, documentation, references).

This is **not** autonomous prescribing, not a signed treatment order, and not a substitute for judgement, policy, device labelling, or consent.

## Required safety copy (also embedded in exports)

> This AI-assisted handbook is a clinician-review draft. It supports protocol implementation planning only. It does not diagnose, prescribe, approve treatment, triage emergencies, or replace clinician judgement. All parameters and clinical use require clinician verification against local policy, device labelling, patient suitability, and current evidence.

## Handbook structure (generator + exports)

| Area | Source |
|------|--------|
| Narrative sections | Imported clinical dataset / registry rows only |
| Structured appendix | `ReportPayload` (`detailed_report`) from generation engine |
| Protocol/evidence posture | Optional enrichment from protocol draft (same condition/modality/device) |

Exported DOCX/PDF include cover metadata, the disclaimer above, narrative sections, patient-summary framing (review before sharing), references (or explicit “unavailable” state), and an appendix rendering structured report sections.

## Export matrix

| Format | Endpoint | Notes |
|--------|----------|-------|
| DOCX | `POST /api/v1/export/handbook-docx` | Always rendered via `python-docx` when API deps installed |
| PDF | `POST /api/v1/export/handbook-pdf` | Requires **WeasyPrint** + Pango/Cairo on host; otherwise **503** JSON `pdf_renderer_unavailable` |

Request body (`ExportHandbookDocxRequest`): `condition_name`, `modality_name`, `device_name`, optional `handbook_kind` (`clinician_handbook` \| `patient_guide` \| `technician_sop`).

## Backend endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/handbooks/generate` | `document`, `disclaimers`, `export_targets`, `detailed_report`, `governance` |
| POST | `/api/v1/export/handbook-docx` | Full handbook bundle DOCX |
| POST | `/api/v1/export/handbook-pdf` | Full handbook bundle PDF or honest 503 |

## DOCX / PDF status

- **DOCX**: Produced by `render_handbook_bundle_docx` in `packages/render-engine`.
- **PDF**: Produced by `render_handbook_bundle_pdf` (HTML → WeasyPrint). Failure returns JSON with `available: false` — **no blank PDF**.

## AI / deterministic behaviour

- Current production path is **deterministic** assembly from the imported clinical dataset (`generated_by` in `governance`).
- No invented parameters or citations; missing protocol rows and missing references are flagged in `governance.missing_data`.

## Evidence / citations

- Handbook `references` are dataset strings (URLs or opaque pointers). Exports do not fabricate PubMed/DOI entries.
- Structured report citations may be **unverified** until resolved against corpus.

## Known limitations

- OpenAPI / TS client may lag behind new fields (`governance`, PDF route).
- PDF depends on host OS libraries.
- Web automated tests require Node on the runner.

## Tests (run locally)

```bash
cd packages/render-engine && python3 -m pytest -q tests/test_handbook_bundle.py
cd apps/api && python3 -m pytest -q tests/test_generation_api.py tests/test_export_handbook_bundle.py
cd apps/web && node --test src/pages-handbooks.test.js
cd apps/web && npm run build
```

## Doctor demo script (tomorrow)

1. Open **Handbooks**, pick a condition/protocol.
2. **Generate** clinician-review handbook draft.
3. Read the **safety disclaimer** and **governance** panel.
4. Walk through **structured detailed_report** (observed / interpretation / suggested actions).
5. **Download handbook DOCX** — full bundle with appendix.
6. **Download handbook PDF** — works if WeasyPrint is installed; otherwise show the honest unavailable message.
7. Close with: *“This handbook helps clinicians operationalise a protocol safely. It is a reviewable draft, not a prescription or treatment order.”*

Doctor-facing line:

> The Handbook generator turns a selected protocol into a detailed clinician-review operating guide: eligibility, setup, session workflow, safety monitoring, troubleshooting, escalation, patient instructions, and references. It is a reviewable draft, not a prescription or treatment order.

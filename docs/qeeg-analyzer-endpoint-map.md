# qEEG Analyzer — endpoint and surface map

**Route (SPA):** `#/qeeg-analysis` (`qeeg-analysis` in `apps/web/src/app.js`)

**Primary module:** `apps/web/src/pages-qeeg-analysis.js` (`pgQEEGAnalysis`, tab dispatch, shell)

**Regulatory reference:** `QEEG_REGULATORY_AUDIT.md` — demo copy and disclaimer rules.

**Shared safety strings:** `apps/web/src/clinical-ai-safety-copy.js` (reusable constants + `QEEG_ANALYZER_SAFETY_FOOTER_BULLETS`)

---

## Tab ids (`window._qeegTab` / `TAB_META`)

| Tab id | Purpose |
|--------|---------|
| `patient` | Patient selection + upload workflow (`qeeg-upload-workflow.js`) |
| `analysis` | Spectral / quantitative dashboard, advanced panels, MNE sections |
| `raw` | Embeds `pages-qeeg-raw-workbench.js` |
| `erp` | ERP setup, BIDS events, run (decision-support) |
| `report` | AI report list, comprehensive narrative, Brain Map toggles, clinician/patient panels |
| `compare` | Pre/post comparison create + results |
| `learning` | Learning EEG reference card |

---

## Endpoint map (primary `api.*` client — `apps/web/src/api.js`)

| Tab | Main purpose | Frontend entry | API endpoints (representative) | Demo fallback | Audit / notes |
|-----|----------------|-----------------|--------------------------------|---------------|---------------|
| Shell | Capabilities badge | `pgQEEGAnalysis` → `_loadCapabilitiesBadge` | `GET /api/v1/qeeg/capabilities` | Badge omitted on failure | Non-fatal |
| Shell | Audit sink | `_qeegAudit` → `api.logAudit` | `POST /api/v1/qeeg-analysis/audit-events` (via `logAudit`) | Fire-and-forget | PHI-safe payload |
| patient | List patients | `api.listPatients` | `GET` patients list | Demo patients prepended if `isDemoSession` | — |
| patient | Upload / list analyses | `mountUploadWorkflow` | `POST /api/v1/qeeg-analysis/upload`, `GET .../patient/{id}` | Demo patient skips API for chart | `recording_uploaded`, etc. |
| analysis | Load analysis | `api.getQEEGAnalysis` | `GET /api/v1/qeeg-analysis/{id}` | `DEMO_QEEG_ANALYSIS` when `id=demo` | `analyzer_loaded`, `analysis_started` |
| analysis | Run spectral | `api.analyzeQEEG` | `POST .../{id}/analyze` | N/A for demo | Polling `getQEEGAnalysisStatus` |
| analysis | Advanced | `api.runAdvancedQEEGAnalyses` | `POST .../{id}/run-advanced` | Toast-only in demo | — |
| analysis | MNE | `api.runQEEGMNEPipeline` | `POST .../{id}/analyze-mne` | Blocked UI for `demo` id | MNE test suite |
| analysis | AI upgrades | `computeQEEGEmbedding`, `predictQEEGBrainAge`, … | `POST .../compute-embedding`, etc. | Buttons toast in demo | Feature flag `DEEPSYNAPS_ENABLE_AI_UPGRADES` |
| analysis | Workbench panels | `mountSafetyCockpit`, `mountRedFlags`, … | `GET .../safety-cockpit`, `red-flags`, `POST protocol-fit` | Not mounted for `analysisId === 'demo'` | Migration 048 |
| analysis | Normative model card | `api.getQEEGNormativeModelCard` | `GET .../{id}/normative-model-card` | Not mounted for `id=demo` (client `buildDemoNormativeModelCard`) | **403** if `ai_analysis` missing (live patient); strict `_is_demo_id` bypass; **`qeeg.consent_denied`** app log on denial |
| report | List / generate | `listQEEGAnalysisReports`, `generateQEEGAIReport` | `GET .../{id}/reports`, `POST .../{id}/ai-report` | `DEMO_QEEG_REPORT` if empty + demo | **`POST .../ai-report`:** `ai_analysis` consent required (live patient); **`qeeg.consent_denied`** on denial. `ai_interpretation_*`, `ai_report_demo_fallback` |
| report | PDF / printable | `exportQEEGAnalysisPDF`, brain map | Binary / HTML routes | Demo CSV/FHIR/BIDS blocked paths | `export_pdf_requested` |
| compare | Create / get | `createQEEGComparison`, `getQEEGComparison` | `POST /compare`, `GET /compare/{id}` | `DEMO_QEEG_COMPARISON` | `comparison_created` |
| raw | Workbench | dynamic import | `/api/v1/qeeg-raw/...` family | Auto-select `demo` in demo mode | Routed inside workbench |
| erp | Run | (wired in tab) | ERP-related API as implemented | `DEMO_ERP_RESULT` | See ERP tab tests |

---

## Consent (qEEG analysis router — PR2 hardening)

This PR **guards**:

- `GET /api/v1/qeeg-analysis/{analysis_id}/normative-model-card`
- `POST /api/v1/qeeg-analysis/{analysis_id}/ai-report`

This PR **does not guard**: every other qEEG route, MRI routes, DeepTwin routes, all export/download routes, or future RAG/report routes. A follow-up is planned: **`fix(consent): complete qEEG router ai_analysis consent sweep`** — paste-ready Hermes briefing (includes **OBJECTIVE 0** demo-id centralisation): `docs/hermes-qeeg-consent-sweep-after-pr2.md`.

Live patient-linked endpoints above require active **`ai_analysis`** consent via `require_ai_analysis_consent` (`apps/api/app/services/consent_enforcement.py`). Missing consent returns **403** with `code: consent_missing`; denials emit the standard `AuditEventRecord` + `SafetyFlag` from `_log_consent_denial`, and the router logs a PHI-safe line **`qeeg.consent_denied`** (hashed analysis id only).

**Demo bypass (`_is_demo_id`)** is **allowlisted**, not substring-based: exact tokens `demo` / `mock` / `test` (SPA/harness), prefix `demo-pt-*` (fixture roster), and `demo-patient` / `demo-patient-*` (synthetic launcher). Strings such as `demographic-patient-123`, `demoed-real-patient-id`, or `mockery-real-analysis` **do not** bypass consent.

| Endpoint | Method | Consent | Demo / synthetic bypass |
|----------|--------|---------|-------------------------|
| `GET /api/v1/qeeg-analysis/{analysis_id}/normative-model-card` | GET | `ai_analysis` required for real patients | Strict `_is_demo_id` only (see above) |
| `POST /api/v1/qeeg-analysis/{analysis_id}/ai-report` | POST | `ai_analysis` required for real patients | Same |

**Other qEEG GETs** (e.g. safety cockpit, raw `GET /api/v1/qeeg-analysis/{id}`) are not gated by this PR; broader #841 coverage may extend consent to additional routes later.

**UI:** `consent-error-handler.js` patterns apply to 403 responses from the web client.

**Recording condition:** Condition override is **session-local in this PR** unless a server-side `PATCH` endpoint is implemented. **Production use should persist `recording_condition` before relying on longitudinal or cross-device workflows.**

**PR 3 handoff (planned, not implemented here):** RAG-backed report generation must reuse **`recording_condition`** and **`normative_provider`**, require **`ai_analysis`** consent before generation, and **`document_generation`** consent before export. Never invent PubMed/DOI citations; label sections `measured` | `generated` | `evidence_grounded` | `clinician_entered`; surface decision-support-only disclaimers.

---

## Exports / hero

| Action | Handler | Endpoint / behaviour |
|--------|---------|----------------------|
| CSV | `_qeegExportBandPowerCSV` / `exportQEEGAnalysisCSV` | `GET .../export-csv` or client-side demo |
| FHIR | `_qeegExportFHIRBundle` | Blocked for demo-only patient |
| BIDS | `_qeegExportBIDSPackage` | Blocked for demo-only patient |
| PDF | `_qeegDownloadPDF` | Report PDF binary |

---

## Future feature flags (PR 2–5)

| Flag | Intent |
|------|--------|
| `VITE_ENABLE_QEEG_ADVANCED_AI` | Advanced AI surfaces |
| `VITE_ENABLE_QEEG_RAG_REPORTS` | Evidence-grounded drafts |
| `VITE_ENABLE_QEEG_SOURCE_VIEW` | Source-space scaffold |
| `VITE_ENABLE_QEEG_SEIZURE_TREND` | Research-only trend chart |
| `VITE_ENABLE_QEEG_PROCESSING_HISTORY` | Processing tree |
| `VITE_ENABLE_QEEG_NORMATIVE_DEMO` | Optional extra demo-only normative visualisations (future) |

---

## PR2 — Normative scaffold + recording condition (implemented)

- `GET /api/v1/qeeg-analysis/{id}/normative-model-card` includes:
  - **`recording_condition`:** `eyes_closed` | `eyes_open` | `task` | `unknown` — resolved from `analysis.eyes_condition`.
  - **`normative_provider`:** `{ type, name, version, clinical_use, disclaimer }` with `type` in `demo` | `research` | `unavailable` — transparency only; not a licensed clinical normative claim.
- **Consent (PR2 hardening):** live `normative-model-card` and **`POST .../ai-report`** require **`ai_analysis`** consent; demo/synthetic ids bypass (see Consent section above).
- **Analysis tab:** `qeeg-analysis-normative-engine.js` — recording condition selector (**sessionStorage only**; not persisted server-side in this PR), warning when `unknown`, audit **`qeeg.condition.changed`** on change.
- **Demo** (`analysisId === 'demo'`): normative card rendered from **`buildDemoNormativeModelCard`** (no API round-trip).

### Planned: recording-condition override persistence (not implemented)

| Item | Detail |
|------|--------|
| Proposed route | `PATCH /api/v1/qeeg-analysis/{analysis_id}/recording-condition` |
| Request body | `{ "recording_condition": "eyes_closed" \| "eyes_open" \| "task" \| "unknown" }` |
| Rationale | `QEEGAnalysis` today stores acquisition hints in `eyes_condition` (legacy string); a dedicated persisted override avoids relying on browser session alone for production. |
| Migration | Deferred — would add a column or structured JSON field; until then UI explicitly states overrides are **browser-only**. |
| Audit (planned) | Server-side acknowledgement of `qeeg.condition.changed` or equivalent after PATCH. |

**Production note:** Until PATCH ships, treat the selector as **decision-support labelling in-session only**; canonical acquisition state remains whatever was uploaded unless clinicians re-upload with corrected metadata.

---

## Evidence / library (related)

Used by `evidence-intelligence.js` from the report context (not exhaustive): saved citations, drawer — align with `GET` patterns under `/api/v1/evidence/` and library routes as deployed.

---

## Known gaps (for later PRs)

- Normalised **RAG report** `POST .../rag-report` — planned PR 3; not in client until implemented server-side.
- **Persisted** recording-condition override — **planned** `PATCH .../recording-condition` (see PR2 section); current UI uses **sessionStorage only** (production limitation until PATCH + audit land).
- Full **normative z-score provider** plug-in and age-matched clinical databases — future licensed/research adapters only.
- **Refs #841:** Additional qEEG routes (e.g. safety cockpit GET, list analyses) may still need consent review beyond this PR’s `normative-model-card` + `ai-report` gates.

---

## Safety notes

- Footer bullets are sourced from `clinical-ai-safety-copy.js` (`QEEG_ANALYZER_SAFETY_FOOTER_BULLETS`) and rendered via `renderQEEGClinicalSafetyFooterForTest()` / `_qeegClinicalSafetyFooter()` inside `pgQEEGAnalysis`.
- Demo payloads must not assert epileptiform detection, clinical impression as diagnosis, or treatment prescriptions (`QEEG_REGULATORY_AUDIT.md` FAIL items).

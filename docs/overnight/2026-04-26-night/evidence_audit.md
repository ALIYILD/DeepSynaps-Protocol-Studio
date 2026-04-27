# Stream 5 — Evidence & Report Audit

**Generated:** 2026-04-26 night-shift evidence/reports specialist pass
**Scope-owned files audited:**
- `packages/generation-engine/`
- `packages/render-engine/`
- `apps/api/app/routers/documents_router.py`
- `apps/api/app/routers/reports_router.py`
- `apps/api/app/routers/protocols_generate_router.py` (consumed by reports flow)
- `apps/api/app/routers/literature_router.py`
- `apps/api/app/routers/citation_validator_router.py`
- `apps/api/app/services/preview.py`
- `apps/api/app/services/generation.py`
- `apps/web/src/pages-protocols.js`
- `services/evidence-pipeline/`

**Cross-stream reads (do NOT modify):** `packages/evidence/` (Scoring stream tonight).

---

## A1. Report Generation Flow — Today

| Surface | Router | Service | Output |
|---|---|---|---|
| Clinical report upload (file or metadata) | `reports_router.upload_report` | inline `_save_report_file` + AI fallback | persists `PatientMediaUpload` row, returns JSON metadata |
| Clinical report create (text only) | `reports_router.create_report` | inline | persists `PatientMediaUpload` row |
| Clinical report list | `reports_router.list_reports` | inline (SQLA query) | clinician-scoped JSON list, since-filter |
| AI summary (post-hoc) | `reports_router.ai_summarize_report` | `_ai_summarize_report` → `chat_service._llm_chat` | `{summary, findings, protocol_hint, generated_at}` |
| Protocol preview (intake → plan) | (preview path consumed by web/intake flow) | `services/preview.build_intake_preview` → `deepsynaps_generation_engine.build_protocol_plan` + `build_clinician_handbook_plan` | `IntakePreviewResponse` (Pydantic) |
| AI protocol generation | `protocols_generate_router.{generate-brain-scan,generate-personalized}` | `services/clinical_data.generate_protocol_draft_from_clinical_data` | `ProtocolDraftResponse` (Pydantic) |
| Documents CRUD + upload/download | `documents_router` | inline (FormDefinition rows) | per-record metadata, file streaming |
| Web rendering | `apps/web/src/pages-protocols.js` `pgProtocolDetail` (~700 LOC) | client side | hand-rolled `innerHTML` strings |

### Renderer status

`packages/render-engine/src/deepsynaps_render_engine/renderers.py`:
- `render_web_preview(protocol)` — returns shallow dict `{title, summary, checks, export_targets}`. **Not used** by router code.
- `render_protocol_docx(protocol_plan, handbook_plan)` — DOCX via `python-docx`. **Not exported** in `__init__.py`. **Not wired** into any router. Disclaimer text is good ("DRAFT support tool…").
- `render_patient_guide_docx(...)` — patient-facing DOCX. **Not exported. Not wired.**

`packages/render-engine/src/deepsynaps_render_engine/__init__.py` only exports `render_web_preview`. The DOCX rendering paths are dead code from the routers' perspective.

**Heavy renderers (out-of-scope but referenced):**
- qEEG → `packages/qeeg-pipeline/src/deepsynaps_qeeg/report/weasyprint_pdf.py` (weasyprint)
- MRI → `packages/mri-pipeline/src/deepsynaps_mri/report.py` (weasyprint)

The reports/documents routers themselves currently produce **no HTML and no PDF**.

---

## A2. Literature / Evidence Retrieval

**Backends:**
- `services/evidence-pipeline/` — local SQLite + FTS5; sources: PubMed, OpenAlex, ClinicalTrials.gov v2, openFDA, Unpaywall. No network calls from the API at request time — ingestion is offline via `ingest.py`. `query.py` provides ranked search.
- `packages/evidence/src/deepsynaps_evidence/` (Scoring-owned tonight) — `Citation`, `Claim`, `ValidationResult`, GRADE A/B/C/D scoring. Pure functions; safe to read.
- `apps/api/app/routers/literature_router.py` — Literature library CRUD + tagging + reading list (DB-backed via `LiteraturePaper`).
- `apps/api/app/routers/citation_validator_router.py` — wraps `deepsynaps_evidence` for claim validation. Exposes `/api/v1/citations/validate`, `/health`, `/{id}`, `/audit`.
- `apps/api/app/routers/literature_watch_router.py` — periodic snapshot (`/literature-watch.json`) used by the protocol detail page.

**Web-side use:** `pages-protocols.js` polls `/literature-watch.json` and the per-protocol refresh endpoint with structured polling/recovery (already hardened in MORNING_REPORT.md commit 860f56b).

---

## A3. Citation Support — DOI / PMID / URL / Evidence Grade

| Field | Where it exists today |
|---|---|
| **PMID** | `LiteraturePaper.pubmed_id`, `Citation.pmid`, `evidence-pipeline.papers.pmid`. Fully wired. |
| **DOI** | `LiteraturePaper.doi`, `Citation.doi`, `evidence-pipeline.papers.doi`. Wired in literature router but **not threaded into report payloads**. |
| **URL** | `LiteraturePaper.url`, `evidence-pipeline.papers.url_oa`. Available, not surfaced in reports. |
| **Evidence grade** | `Citation.evidence_grade` (A/B/C/D); `EvidenceLevel` literal in core-schema; `evidence_grade_map` in `services/generation.py` mapping Grade A/B/C/D ↔ Guideline/Systematic Review/Emerging/Experimental. |
| **`retrieved_at`** | **Missing.** Reports do not record when a citation was last verified. |
| **"unverified" marker** | **Missing.** Citations resolved against the corpus succeed; failures are dropped silently. |

---

## A4. Reasoning Summaries

- **AI-driven** (Claude/GLM): `reports_router._ai_summarize_report` (`chat_service._llm_chat`). Uses fallback if neither GLM nor Anthropic key set. Stamped "For clinical reference only — verify with a qualified clinician." in the system prompt.
- **Rules-driven**: `protocols_generate_router._build_*` helpers (montage map, marker rules, PHQ-9/GAD-7/MoCA bands, chronotype windows). Data-driven from CSV registries. Explicit, deterministic.
- **Generation engine**: `build_protocol_plan` / `build_clinician_handbook_plan` purely pull from registry CSV + safety notes.

The system **does mix** AI summaries with rules-driven content but does **not currently label** which is which in the rendered output.

---

## A5. Export Formats — Current State

| Format | Status |
|---|---|
| HTML | **Not produced** by reports/documents routers. qEEG/MRI streams produce HTML elsewhere. |
| PDF | **Not produced** by reports/documents routers. weasyprint used by qEEG and MRI packages but **not installed** in the local env (verified: `python3 -c "import weasyprint"` fails). |
| DOCX | `render-engine.render_protocol_docx` exists but **not exported**, **not wired** to any router. `python-docx` also not installed locally. |
| JSON | All current routers return JSON only. |

**Lib detection:** weasyprint and python-docx are in `pyproject.toml` extras; runtime env on this Mac has neither. Several dependent packages already use `try/except ImportError` (qeeg `report/weasyprint_pdf.py`) so the pattern is established.

---

## A6. Patient Context Integration

- `reports_router` binds report rows to `Patient.id` via `_assert_report_patient_access`. Clinician-only RBAC; admin sees all.
- `documents_router` binds documents via `meta["patient_id"]`. Clinician-only.
- AI summaries pull `text_content` + `patient_note` JSON metadata from `PatientMediaUpload`.
- **Gap:** report payload does NOT include patient identifiers, generated-at timestamp, or generator-version stamp in a stable structured form. Reports rely on row `id` + `created_at` only.

---

## A7. Counter-Evidence Support

- `Citation.citation_type` literal includes `"contradicts"` (alongside `supports`, `informs`, `safety_note`) — schema-level only.
- `pages-protocols.js` does not differentiate supporting vs contradicting papers.
- Reports do not surface counter-evidence at all today.

---

## A8. Report UX — Sections, Ordering, Banners

Today, the closest "rendered report" is the protocol detail page (`pgProtocolDetail`, ~700 LOC of `innerHTML` template). Its sections are:

1. Header (title, badges)
2. Parameters / Indications
3. Side Effects
4. References (free-text only)
5. Recent literature (last-30-days panel)
6. Tags
7. Evidence (Papers / Trials / FDA tabs)
8. Related protocols

There is **no "Observed findings" vs "Model interpretation" vs "Suggested actions"** separation anywhere in the UI today. There is no clinician-vs-patient toggle. Disclaimers exist in the DOCX renderer but not in the live web view.

**Banners absent:** evidence-strength badge per claim, confidence / cautions / limitations panels, counter-evidence callout.

---

## A9. Findings Summary

**Strong points:**
- Citation validation infrastructure is real and well-modelled (`packages/evidence` with audit chain).
- Literature ingest is independent and reproducible (`services/evidence-pipeline`).
- AI summary path has a sensible fallback and decision-support disclaimer.
- Protocol web detail page already has a disciplined badge / panel / loading-state pattern (good base to extend).

**Gaps that block "best-in-class" report UX:**
1. No structured report payload schema. Every report surface invents its own shape.
2. No `observed[] / interpretation[] / suggested_actions[]` separation. Risk of patients/clinicians confusing "what the model thinks" with "what was measured".
3. Render engine is unwired (DOCX builders not exported, no HTML, no PDF).
4. Citations carry PMID/DOI but not `retrieved_at` and have no "unverified" path.
5. No clinician/patient view toggle.
6. No evidence-strength badge per claim — protocol detail shows a single grade for the whole protocol.
7. No counter-evidence surface.
8. Generator version + payload schema id are not stamped, so downstream consumers can't safely persist or compare reports.

These are the items addressed in `reports_upgrade_plan.md`.

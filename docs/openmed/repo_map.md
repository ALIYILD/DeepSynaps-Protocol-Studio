# DeepSynaps Studio — Repo Map (OpenMed integration view)

Generated: 2026-04-28 by Transformation Agent.

## Backend (`apps/api/app/`)

### Routers (clinical-text adjacent)
- `routers/media_router.py:382` — `POST /api/v1/media/patient/upload/text` (patient text intake; `TextUploadRequest` at line 65)
- `routers/media_router.py:1248` — `POST /api/v1/media/clinician/note/text` (clinician note body; `TextNoteRequest` at line 78)
- `routers/documents_router.py:486` — `POST /api/v1/documents/upload` (multipart PDF/DOCX/text, 20MB cap, MIME allowlist line 28)
- `routers/forms_router.py:137` — `POST /api/v1/forms/{form_id}/submit` (structured intake forms, clinician annotations)
- `routers/reports_router.py:336` — `POST /api/v1/reports` (narrative reports; AI summarization at line 68)
- `routers/patient_summary_router.py` — patient-portal summary read endpoints (banned-phrase sanitization)
- `routers/patient_timeline_router.py` — 90-day clinical timeline aggregation
- `routers/chat_router.py:54` — `ChatRequest` carries `patient_context: str`

### Services
- `services/patient_context.py:81` — `build_patient_medical_context()` — patient 360 markdown for prompts
- `services/qeeg_context_extractor.py:36` — `extract_qeeg_context()` recovers structured JSON from `<<qeeg_context_v1>>...` blocks
- `services/chat_service.py:61` — `_extract_clinical_context()` regex modality/condition tagging
- `services/chat_service.py:123-187` — `_llm_chat()` / `_llm_chat_async()` — primary LLM dispatch (OpenRouter → Anthropic fallback)
- `services/log_sanitizer.py` — log-path PII redaction
- `services/evidence_rag.py` + `services/qeeg_rag.py` — read-only evidence retrieval (87k papers SQLite)
- `services/report_payload.py` — structured ReportPayload assembly

### Conventions
- Pydantic schemas defined inline in router files (no `app/schemas/` folder)
- Per-resource `Create`/`Update`/`Out`/`ListResponse` pattern (see `forms_router.py:51-79`)
- Settings via `app/settings.py` `AppSettings(BaseModel)`
- Tests: `tests/test_<router>_router.py`, `tests/conftest.py:56` `isolated_database()` fixture

### LLM call pattern (mirror for OpenMed adapter)
- `chat_service.py:123-153` — sync `_llm_chat`
- Env: `LLM_BASE_URL`, `LLM_MODEL`, `ANTHROPIC_API_KEY`
- Output sanitised via `_sanitize_llm_output()` (XSS strip)

## Frontend (`apps/web/src/`)

### Note / text intake surfaces
- `pages-clinical.js` — SOAP notes (autosave to localStorage), patient detail
- `pages-clinical-hubs.js` — scheduling-hub referrals, clinical-hub assessments
- `pages-clinical-tools.js` — assessments hub, templates, clinical-notes
- `pages-mri-analysis.js`, `pages-qeeg-analysis.js` — AI report panels (already structured outputs)

### Document handling
- `pages-clinical.js` — Documents Hub (uses authenticated `/documents/{id}/download`)

### Agent / chat surfaces
- `pages-chats-*.js` (Practice / Clinician / Patient agents)

## Database models

- `app/persistence/models.py` — SQLAlchemy `Base` subclasses; `MriAnalysis`, `QeegAnalysis`, `Patient`, `Document`, `ClinicalNote`, `Annotation`, etc.
- 47 alembic migrations, branchpoint 042 with merge at 044

## What does NOT exist (gap → OpenMed slots in here)

- No NER / clinical entity extraction service
- No PHI de-identification beyond regex log scrubber
- No structured-fact store derived from free text
- No "extracted entities" surface in reports or agent context
- No clinical-text intake API (text goes straight into note bodies; never normalised)

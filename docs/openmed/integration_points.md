# OpenMed Integration Points — DeepSynaps Studio

Ranked by impact × feasibility.

## Tier 1 — ship tonight

### 1. Clinician note ingestion
**Where:** `apps/api/app/routers/media_router.py:1248` `POST /api/v1/media/clinician/note/text`
**Today:** stores raw note body unchanged
**OpenMed action:** on submit, run `analyze` (entities) + `deidentify` (PHI strip). Persist both raw + de-identified body + extracted entities JSON.
**Downstream win:** safe agent context, structured timeline events, evidence retrieval terms.

### 2. New clinical-text API
**Where:** new `apps/api/app/routers/clinical_text_router.py`
**Endpoints:**
- `GET /api/v1/clinical-text/health` → adapter status + active backend
- `POST /api/v1/clinical-text/analyze` → entities + summary + de-identified body
- `POST /api/v1/clinical-text/extract-pii` → PII spans
- `POST /api/v1/clinical-text/deidentify` → redacted body + replacement map
**Auth:** `require_minimum_role("clinician")` + `@limiter.limit("30/minute")`
**Why:** explicit boundary the UI + future services can call without coupling to note storage.

### 3. Patient context safety
**Where:** `apps/api/app/services/patient_context.py:81` `build_patient_medical_context()`
**Today:** concatenates raw history into LLM prompt
**OpenMed action:** route through `OpenMedAdapter.deidentify()` before returning the context bundle (gated behind `OPENMED_DEID_PATIENT_CONTEXT=1`)
**Why:** no PHI to upstream LLM provider unless explicitly opted in.

## Tier 2 — phase 2

### 4. Document upload text extraction
`routers/documents_router.py:486` — after server-side text extract (PDF/DOCX), feed to `analyze` to produce extracted-entities sidecar.

### 5. Report generation
`services/report_payload.py` — accept an `extracted_facts: list[ExtractedClinicalEntity]` block separate from `findings` / `interpretations` so the report can label provenance.

### 6. Evidence retrieval enrichment
`services/evidence_rag.py` — feed extracted condition/medication terms into ranked search instead of the regex synonym list.

### 7. Agent context bundle
New schema `AgentContextBundle` containing structured patient facts + de-identified narrative; replace ad-hoc `patient_context: str` field on `ChatRequest`.

## Tier 3 — out of scope tonight

- Real-time streaming analysis on text-area input
- UI panels for entity preview in note editor (would require frontend redesign)
- Persistent extracted-entity store with versioning
- Cross-document patient-fact deduplication

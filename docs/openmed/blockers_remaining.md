# Blockers Remaining (phase 2 work)

None of these block beta. All are scoped follow-ups.

## High value, low effort

1. **Wire `build_patient_medical_context()` through `adapter.deidentify()`**
   - `apps/api/app/services/patient_context.py:81`
   - Gate behind `OPENMED_DEID_PATIENT_CONTEXT=1`
   - Effect: no PHI to upstream LLM provider when flag is set
   - Effort: ~1h

2. **Persist OpenMed analyze output on clinician note submit**
   - Add migration: `clinician_media_note.extracted_entities_json TEXT`
   - Update `media_router.clinician_note_text` to write through
   - Effort: ~2h

3. **UI panel: "Extracted entities" sidebar in clinical-notes editor**
   - apps/web/src/pages-clinical-tools.js note editor
   - Read from `openmed` block already returned by the API
   - Effort: ~3h
   - **Risk:** must be labelled "NLP extraction — verify", not "diagnoses"

## Medium value

4. **Document upload text extraction → analyze**
   - `routers/documents_router.py:486` — after server-side text extract, run analyze
   - Persist sidecar entities JSON
   - Effort: ~3h

5. **`extracted_facts` block on `ReportPayload`**
   - Update `services/report_payload.py` schema and PDF/DOCX/FHIR consumers
   - Distinct from clinician findings to preserve provenance
   - Effort: ~4h

6. **Evidence retrieval enrichment**
   - `services/evidence_rag.py` — feed extracted condition/medication terms into ranked search
   - Replace regex synonym list with extracted entities
   - Effort: ~3h

## Lower priority

7. **Real OpenMed HTTP service deployment**
   - Currently the adapter uses heuristic fallback when `OPENMED_BASE_URL` is unset
   - Standing up an OpenMed service (HuggingFace transformers based) gives better recall
   - Decision: separate Fly app with its own scaling profile (heavy model)

8. **Cross-document patient-fact deduplication**
   - Once entities are persisted, dedupe across notes/documents per patient
   - Requires entity normalisation (RxNorm / SNOMED CT mapping)

9. **Streaming analyze on text-area input**
   - Real-time entity highlighting in the note editor
   - Requires SSE endpoint + UI websocket client

10. **Model versioning + audit trail**
    - Persist `backend`, `model_version`, `run_at` per extraction
    - Required for clinical audit when entities feed reports

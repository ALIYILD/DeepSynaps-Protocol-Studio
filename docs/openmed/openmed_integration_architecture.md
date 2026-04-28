# OpenMed Integration Architecture

## Layers

```
A. Clinical Text Intake Layer
   - Existing endpoints (media/notes/documents/forms) unchanged in shape
   - Optionally call /clinical-text/* synchronously after submit

B. OpenMed Adapter Layer            apps/api/app/services/openmed/
   - adapter.py     facade with backend dispatch
   - schemas.py     Pydantic types (single source of truth)
   - backends/heuristic.py   in-process regex fallback (always works)
   - backends/http.py        REST client to OpenMed service

C. Clinical-Text NLP API            apps/api/app/routers/clinical_text_router.py
   - GET  /api/v1/clinical-text/health
   - POST /api/v1/clinical-text/analyze
   - POST /api/v1/clinical-text/extract-pii
   - POST /api/v1/clinical-text/deidentify

D. Persistence / Core (this PR)
   - Clinician note text endpoint attaches OpenMed analyze block to response
   - No DB schema change (migration deferred to phase 2)

E. UI Integration
   - Not in this PR. New UI panels would consume the typed responses
     directly; the schema_id versioning keeps the contract stable.
```

## Backend selection

| Env var | Effect |
|---|---|
| `OPENMED_BASE_URL` | If set, HTTP backend is active (with auto-fallback on errors) |
| `OPENMED_API_KEY` | Optional bearer token for upstream auth |
| `OPENMED_TIMEOUT_S` | Per-request timeout, default 8s |
| `OPENMED_DEID_PATIENT_CONTEXT` *(phase 2)* | Route patient_context through deidentify before LLM dispatch |

## Adapter contract

```python
from app.services.openmed import adapter
from app.services.openmed.schemas import ClinicalTextInput

result = adapter.analyze(ClinicalTextInput(text="…", source_type="clinician_note"))
# result.backend in {"heuristic","openmed_http"}
# result.entities: list[ExtractedClinicalEntity] with char-level spans
# result.pii:      list[PIIEntity]
# result.safety_footer: cautionary string
```

## Compatibility with OpenMed reference

OpenMed REST endpoints expected:
- `GET  /health`                        → mapped to `adapter.health()`
- `POST /analyze   {text}`              → mapped to `adapter.analyze()`
- `POST /pii/extract   {text}`          → mapped to `adapter.extract_pii()`
- `POST /pii/deidentify {text}`         → mapped to `adapter.deidentify()`

Coercion is defensive: if the upstream returns a shape we don't recognise the
adapter falls back to the heuristic backend rather than 5xx-ing.

## What we deliberately did NOT do

- No torch / transformers import in api dockerfile (keeps Fly image lean)
- No DB migration (entities are returned in the API response, not persisted)
- No UI rework (API-first; UI integration is a follow-up)
- No cache layer (premature; can add Redis/in-process LRU once upstream exists)
- No replacement of qEEG/MRI/DeepTwin/protocol pipelines (out of scope)

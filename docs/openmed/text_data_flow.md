# Clinical Text Data Flow — DeepSynaps Studio

```
┌──────────────────────────────────┐
│ UI surfaces                      │
│ - Clinical notes editor          │
│ - SOAP notes (autosave)          │
│ - Documents Hub upload           │
│ - Forms / intake                 │
│ - Patient text upload            │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ Intake APIs                      │
│ POST /media/clinician/note/text  │  ← OpenMed analyze attached (response-only, non-persisting)
│ POST /media/patient/upload/text  │
│ POST /documents/upload           │
│ POST /forms/{id}/submit          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ NEW: Clinical-text NLP API       │
│ /api/v1/clinical-text/analyze    │
│ /api/v1/clinical-text/extract-pii│
│ /api/v1/clinical-text/deidentify │
│ /api/v1/clinical-text/health     │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ OpenMed adapter                  │
│ services/openmed/adapter.py      │
│ ↳ HTTP backend if OPENMED_BASE_URL│
│ ↳ Heuristic fallback otherwise   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ Typed responses                  │
│ AnalyzeResponse (entities + pii) │
│ DeidentifyResponse               │
│ PIIExtractResponse               │
│ — All carry safety_footer +      │
│   schema_id for provenance       │
└──────────────────────────────────┘
```

## Where text already exists, what now happens

| Surface | Before | After this PR |
|---|---|---|
| Clinician note text submit | Raw → DB; AI draft | Raw → DB; AI draft; **+ OpenMed analyze in response** |
| Other text intake | Raw → DB | Unchanged in this PR; can call /clinical-text/analyze on demand |
| Agent context | Raw history → LLM | Unchanged; phase 2 will route through `/deidentify` |
| Reports | Raw findings | Unchanged; phase 2 will accept `extracted_facts` block |

## Provenance contract

Every response carries:
- `schema_id` (versioned, e.g. `deepsynaps.openmed.analyze/v1`)
- `backend` (`heuristic` or `openmed_http`)
- `safety_footer` (cautionary statement)
- char-level `span` on every entity for re-render / audit

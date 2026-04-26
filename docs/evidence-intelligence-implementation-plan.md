# Evidence Intelligence implementation plan

## Existing surfaces reused

- API: extend the existing FastAPI `/api/v1/evidence` router, which already reads the evidence-pipeline corpus and exposes literature paper endpoints.
- Corpus: rank against `ds_papers` when available, then the evidence-pipeline SQLite database, with deterministic demo fallbacks only when neither corpus is present.
- UI: add reusable DOM-rendered evidence components that match the current dark dashboard cards and wire them into Patient Analytics, qEEG, and MRI entry points.

## Implementation sequence

1. Add typed Evidence Intelligence service models, concept normalization, retrieval, ranking, applicability, provenance, and report citation payload generation.
2. Add API endpoints for query, by-finding, patient overview, saved citations, paper detail, and report payload.
3. Add frontend evidence components: chips, strength badges, paper list, drivers, applicability, drawer, summary card, and Patient 360 Evidence tab content.
4. Integrate compact evidence chips into Predictions, qEEG, MRI, Voice, Video, and Text patient analytics cards, plus qEEG/MRI analyzer panels.
5. Add focused backend and frontend tests for ranking, quality tags, response shape, drawer/chip behavior, filtering, report payloads, and a happy-path citation save.
